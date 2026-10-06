// Calcul d'un modèle filaire 3D : assemblage creux par blocs, liaisons d'extrémité condensées, appuis (bloqués, ressorts,
// compression seule), barres en traction ou compression seule (itérations actif / inactif), 2ᵉ ordre par la rigidité
// géométrique (itérations sur les efforts normaux ; P-δ par découpage des barres). Fonctions pures, unités N / mm / rad.
import type {
  AnalysisOptions,
  AnalysisResult,
  FemMember,
  FemModel,
  FemNode,
  LoadSet,
  MemberResult,
  Reaction,
  Station,
  Vec6,
} from './types';
import { FemError, RIGID_END } from './types';
import type { Condensed, LocalFrame, LocalLoads } from './element';
import {
  condense,
  condenseLoads,
  equivalentLoads,
  innerDisplacements,
  localFrame,
  localGeometric,
  localLoads,
  localStiffness,
  stationForces,
  toGlobal,
  vecToGlobal,
  vecToLocal,
} from './element';
import { buildGraph } from './ordering';
import type { BlockPattern } from './sparse';
import { blockSlot, factorize, makePattern, SingularError, solveFactor } from './sparse';

const DOF_NAMES = ['ux', 'uy', 'uz', 'rx', 'ry', 'rz'];

interface Element {
  member: FemMember;
  /** barre d'origine et abscisse du début de l'élément sur celle-ci */
  parent: number;
  offset: number;
  frame: LocalFrame;
  Kb: Float64Array;
  slotII: number;
  slotJJ: number;
  slotIJ: { slot: number; transposed: boolean };
}

/** Modèle préparé : découpage des barres, numérotation et structure creuse (réutilisés pour chaque cas de charge). */
export interface Prepared {
  model: FemModel;
  nodes: FemNode[];
  elements: Element[];
  /** éléments de chaque barre d'origine, dans l'ordre */
  memberElements: number[][];
  parentFrames: LocalFrame[];
  pattern: BlockPattern;
  diagSlot: Int32Array;
  /** blocs où apparaît chaque nœud : (bloc, rôle) avec rôle 0 = diagonale, 1 = ligne, 2 = colonne */
  nodeBlocks: Array<Array<[number, number]>>;
  nnzBlocks: number;
}

export function prepare(model: FemModel): Prepared {
  const nodes: FemNode[] = model.nodes.map((n) => ({ ...n }));
  const elements: Element[] = [];
  const memberElements: number[][] = [];
  const parentFrames: LocalFrame[] = [];
  model.members.forEach((m, mi) => {
    if (m.i < 0 || m.j < 0 || m.i >= model.nodes.length || m.j >= model.nodes.length)
      throw new FemError('invalid-model', `Barre ${m.id} : nœud inexistant`);
    const a = model.nodes[m.i];
    const b = model.nodes[m.j];
    const frame = localFrame(m, a, b);
    parentFrames.push(frame);
    // une barre non linéaire (traction / compression seule) reste d'un seul tenant : son état est global
    const nseg = m.nonlinear || m.kind === 'truss' ? 1 : Math.max(1, Math.floor(m.segments ?? 1));
    const ids: number[] = [];
    let prev = m.i;
    for (let s = 0; s < nseg; s++) {
      let next = m.j;
      if (s < nseg - 1) {
        const t = (s + 1) / nseg;
        nodes.push({ id: `${m.id}#${s + 1}`, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
        next = nodes.length - 1;
      }
      const sub: FemMember = {
        ...m,
        id: nseg > 1 ? `${m.id}/${s + 1}` : m.id,
        i: prev,
        j: next,
        endI: s === 0 ? m.endI : RIGID_END,
        endJ: s === nseg - 1 ? m.endJ : RIGID_END,
        // repère identique à celui de la barre d'origine
        ref: m.ref ?? [frame.R[6], frame.R[7], frame.R[8]],
        roll: m.ref ? m.roll : 0,
      };
      const f = localFrame(sub, nodes[prev], nodes[next]);
      elements.push({ member: sub, parent: mi, offset: (frame.L * s) / nseg, frame: f, Kb: localStiffness(sub, f.L), slotII: 0, slotJJ: 0, slotIJ: { slot: 0, transposed: false } });
      ids.push(elements.length - 1);
      prev = next;
    }
    memberElements.push(ids);
  });
  const n = nodes.length;
  const edges = new Int32Array(elements.length * 2);
  elements.forEach((e, k) => {
    edges[2 * k] = e.member.i;
    edges[2 * k + 1] = e.member.j;
  });
  const g = buildGraph(n, edges);
  const coords = new Float64Array(n * 3);
  nodes.forEach((p, k) => coords.set([p.x, p.y, p.z], k * 3));
  const pattern = makePattern(g, coords);
  const diagSlot = new Int32Array(n);
  for (let v = 0; v < n; v++) diagSlot[v] = blockSlot(pattern, v, v).slot;
  for (const e of elements) {
    e.slotII = diagSlot[e.member.i];
    e.slotJJ = diagSlot[e.member.j];
    e.slotIJ = blockSlot(pattern, e.member.i, e.member.j);
  }
  const nodeBlocks: Array<Array<[number, number]>> = Array.from({ length: n }, () => []);
  for (let k = 0; k < n; k++)
    for (let q = pattern.colPtr[k]; q < pattern.colPtr[k + 1]; q++) {
      const i = pattern.rowIdx[q];
      if (i === k) nodeBlocks[pattern.perm[k]].push([q, 0]);
      else {
        nodeBlocks[pattern.perm[i]].push([q, 1]);
        nodeBlocks[pattern.perm[k]].push([q, 2]);
      }
    }
  return { model, nodes, elements, memberElements, parentFrames, pattern, diagSlot, nodeBlocks, nnzBlocks: pattern.colPtr[n] };
}

/** Charges locales de chaque élément (les charges des barres découpées sont réparties sur leurs éléments). */
function elementLoads(prep: Prepared, set: LoadSet): LocalLoads[] {
  const out: LocalLoads[] = prep.elements.map(() => ({ distributed: [], points: [] }));
  const byMember = new Map<number, LoadSet['member']>();
  for (const ld of set.member) {
    if (ld.member < 0 || ld.member >= prep.model.members.length) throw new FemError('invalid-model', `Cas ${set.id} : charge sur une barre inexistante`);
    const l = byMember.get(ld.member);
    if (l) l.push(ld);
    else byMember.set(ld.member, [ld]);
  }
  for (const [mi, loads] of byMember) {
    const pf = prep.parentFrames[mi];
    const all = localLoads(loads, pf, prep.model.members[mi].id);
    const ids = prep.memberElements[mi];
    ids.forEach((ei, s) => {
      const e = prep.elements[ei];
      const s0 = e.offset;
      const s1 = s === ids.length - 1 ? pf.L : prep.elements[ids[s + 1]].offset;
      const target = out[ei];
      for (const d of all.distributed) {
        const a = Math.max(d.a, s0);
        const b = Math.min(d.b, s1);
        if (b - a > 1e-9) target.distributed.push({ a: a - s0, b: b - s0, dir: d.dir, q: (x) => d.q(x + s0) });
      }
      for (const p of all.points) if (p.a >= s0 - 1e-9 && (p.a < s1 - 1e-9 || s === ids.length - 1)) target.points.push({ a: Math.max(0, p.a - s0), P: p.P });
    });
  }
  return out;
}

const add36 = (values: Float64Array, slot: number, K: Float64Array, r0: number, c0: number, transpose: boolean) => {
  const o = slot * 36;
  if (!transpose) {
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) values[o + r * 6 + c] += K[(r0 + r) * 12 + c0 + c];
  } else {
    // bloc stocké (j, i) : lignes = ddl du second nœud
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) values[o + r * 6 + c] += K[(c0 + r) * 12 + r0 + c];
  }
};

interface State {
  active: Uint8Array;
  lifted: Uint8Array;
  N: Float64Array;
}

interface Pass {
  u: Float64Array;
  cond: Array<Condensed | null>;
  feq: Array<Float64Array | null>;
  Ktot: Array<Float64Array | null>;
}

/** Un calcul linéaire (état des barres et des appuis figé, efforts normaux du 2ᵉ ordre donnés). */
function linearPass(
  prep: Prepared,
  set: LoadSet,
  loads: LocalLoads[],
  st: State,
  secondOrder: boolean,
  spinning: Set<string>,
  warnings: Set<string>,
): Pass {
  const { pattern, elements, nodes } = prep;
  const n = nodes.length;
  const values = new Float64Array(prep.nnzBlocks * 36);
  const rhs = new Float64Array(n * 6);
  const cond: Array<Condensed | null> = elements.map(() => null);
  const feq: Array<Float64Array | null> = elements.map(() => null);
  const Ktot: Array<Float64Array | null> = elements.map(() => null);
  elements.forEach((e, k) => {
    if (!st.active[k]) return;
    let K = e.Kb;
    if (secondOrder && st.N[k] !== 0 && e.member.geometric !== false) {
      const g = localGeometric(e.member, e.frame.L, st.N[k]);
      K = new Float64Array(144);
      for (let t = 0; t < 144; t++) K[t] = e.Kb[t] + g[t];
    }
    const c = condense(e.member, K);
    for (const d of c.flex?.regularized ?? []) warnings.add(`${REGULARIZED}${e.member.id} ${DOF_NAMES[d % 6]} ${d < 6 ? 'i' : 'j'}`);
    cond[k] = c;
    Ktot[k] = K;
    const Kg = toGlobal(c.K, e.frame.R);
    add36(values, e.slotII, Kg, 0, 0, false);
    add36(values, e.slotJJ, Kg, 6, 6, false);
    add36(values, e.slotIJ.slot, Kg, 0, 6, e.slotIJ.transposed);
    const fb = equivalentLoads(e.member, e.frame.L, loads[k]);
    feq[k] = fb;
    const fg = vecToGlobal(condenseLoads(c, fb), e.frame.R);
    for (let d = 0; d < 6; d++) {
      rhs[e.member.i * 6 + d] += fg[d];
      rhs[e.member.j * 6 + d] += fg[6 + d];
    }
  });
  for (const ld of set.nodal) {
    if (ld.node < 0 || ld.node >= prep.model.nodes.length) throw new FemError('invalid-model', `Cas ${set.id} : charge sur un nœud inexistant`);
    for (let d = 0; d < 6; d++) rhs[ld.node * 6 + d] += ld.f[d];
  }
  // appuis : ressorts sur la diagonale, ddl bloqués
  const fixed = new Uint8Array(n * 6);
  prep.model.supports.forEach((s, k) => {
    const lifted = !!st.lifted[k];
    s.dofs.forEach((spec, d) => {
      if (lifted && (d === 1 || ((s.upliftReleases ?? 'all') === 'all' && d < 3))) return;
      if (spec === 'fixed') fixed[s.node * 6 + d] = 1;
      else if (typeof spec === 'number' && spec > 0) values[prep.diagSlot[s.node] * 36 + d * 7] += spec;
    });
  });
  // translation sans aucune rigidité : mécanisme ; rotation d'un nœud qu'aucune barre ne retient dans une direction
  // (articulations partout) : ce mode est découplé du reste (matrice semi-définie positive), on le stabilise
  for (let v = 0; v < n; v++) {
    const o = prep.diagSlot[v] * 36;
    for (let d = 0; d < 3; d++)
      if (!fixed[v * 6 + d] && values[o + d * 7] === 0)
        throw new FemError('mechanism', `Système instable : le nœud ${nodes[v].id} n'est tenu par rien en ${DOF_NAMES[d]}`, [nodes[v].id]);
    const R3 = new Float64Array(9);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 3; c++) R3[r * 3 + c] = values[o + (3 + r) * 6 + 3 + c];
    const free = [0, 1, 2].filter((r) => !fixed[v * 6 + 3 + r]);
    if (!free.length) continue;
    const sub = new Float64Array(free.length * free.length);
    free.forEach((r, a) => free.forEach((c, b) => (sub[a * free.length + b] = R3[r * 3 + c])));
    const { values: lam, vectors } = symEigen(sub, free.length);
    const lmax = Math.max(...lam, 0);
    lam.forEach((l, k) => {
      if (Math.abs(l) > 1e-10 * lmax && lmax > 0) return;
      const s = lmax > 0 ? lmax : 1e9;
      for (let a = 0; a < free.length; a++)
        for (let b = 0; b < free.length; b++)
          values[o + (3 + free[a]) * 6 + 3 + free[b]] += s * vectors[a * free.length + k] * vectors[b * free.length + k];
      spinning.add(nodes[v].id);
    });
  }
  for (let v = 0; v < n; v++) {
    let mask = 0;
    for (let d = 0; d < 6; d++) if (fixed[v * 6 + d]) mask |= 1 << d;
    if (!mask) continue;
    for (const [slot, role] of prep.nodeBlocks[v]) {
      const o = slot * 36;
      for (let d = 0; d < 6; d++) {
        if (!(mask & (1 << d))) continue;
        if (role !== 2) for (let c = 0; c < 6; c++) values[o + d * 6 + c] = 0;
        if (role !== 1) for (let r = 0; r < 6; r++) values[o + r * 6 + d] = 0;
        if (role === 0) values[o + d * 7] = 1;
      }
    }
    for (let d = 0; d < 6; d++) if (mask & (1 << d)) rhs[v * 6 + d] = 0;
  }
  let factor;
  try {
    factor = factorize(pattern, values);
  } catch (e) {
    if (!(e instanceof SingularError)) throw e;
    const node = nodes[e.node]?.id ?? String(e.node);
    if (secondOrder && e.negative)
      throw new FemError('instability', `Instabilité au 2ᵉ ordre (charge critique dépassée) — cas ${set.id}, nœud ${node} (${DOF_NAMES[e.dof]})`, [node]);
    throw new FemError('mechanism', `Système instable (mécanisme) — cas ${set.id} : le nœud ${node} n'est pas tenu en ${DOF_NAMES[e.dof]}`, [node]);
  }
  const u = solveFactor(factor, rhs);
  // mécanisme presque singulier (raideur résiduelle numérique) : déplacements démesurés
  let worst = 0;
  for (let t = 0; t < n * 6; t++) if (t % 6 < 3 && Math.abs(u[t]) > Math.abs(u[worst])) worst = t;
  if (Math.abs(u[worst]) > MAX_DISPLACEMENT) {
    const node = nodes[Math.floor(worst / 6)].id;
    throw new FemError('mechanism', `Système presque instable (mécanisme) — cas ${set.id} : déplacement de ${Math.round(Math.abs(u[worst]) / 1e3)} m au nœud ${node} en ${DOF_NAMES[worst % 6]}`, [node]);
  }
  return { u, cond, feq, Ktot };
}

/** Déplacement au-delà duquel le système est tenu pour un mécanisme (mm). */
const MAX_DISPLACEMENT = 1e4;

/** Valeurs et vecteurs propres d'une petite matrice symétrique (Jacobi) ; vecteurs en colonnes. */
function symEigen(a: Float64Array, n: number): { values: number[]; vectors: Float64Array } {
  const A = Float64Array.from(a);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 30; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
    if (off < 1e-30) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p];
          const akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k];
          const aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p];
          const vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
  }
  return { values: Array.from({ length: n }, (_, i) => A[i * n + i]), vectors: V };
}

/** Efforts d'extrémité (locaux, exercés par les nœuds sur la barre) et déplacements côté barre. */
function recover(e: Element, pass: Pass, k: number): { endF: Float64Array; ub: Float64Array } {
  const u = pass.u;
  const ug = new Float64Array(12);
  for (let d = 0; d < 6; d++) {
    ug[d] = u[e.member.i * 6 + d];
    ug[6 + d] = u[e.member.j * 6 + d];
  }
  const ue = vecToLocal(ug, e.frame.R);
  const c = pass.cond[k]!;
  const fb = pass.feq[k]!;
  const ub = innerDisplacements(c, ue, fb);
  const K = pass.Ktot[k]!;
  const endF = new Float64Array(12);
  for (let r = 0; r < 12; r++) {
    let s = -fb[r];
    for (let t = 0; t < 12; t++) s += K[r * 12 + t] * ub[t];
    endF[r] = s;
  }
  return { endF, ub };
}

export function analyzeLoadSet(prep: Prepared, set: LoadSet, options: AnalysisOptions = {}): AnalysisResult {
  const secondOrder = !!options.secondOrder;
  const maxIt = options.maxIterations ?? 100;
  const ntol = options.contactTolerance ?? 1;
  const tol = options.tolerance ?? 1e-6;
  const nst = Math.max(2, options.stations ?? 5);
  const { elements, nodes } = prep;
  const loads = elementLoads(prep, set);
  const st: State = {
    active: new Uint8Array(elements.length).fill(1),
    lifted: new Uint8Array(prep.model.supports.length),
    N: new Float64Array(elements.length),
  };
  const spinning = new Set<string>();
  const warnings = new Set<string>();
  const nonlinear = elements.some((e) => e.member.nonlinear) || prep.model.supports.some((s) => s.compressionOnly);
  let prevU: Float64Array | null = null;
  let pass: Pass | null = null;
  let iterations = 0;
  let recovered: Array<{ endF: Float64Array; ub: Float64Array } | null> = [];
  // états déjà rencontrés (détection des cycles), meilleur état (plus petite violation), état figé en fin de calcul
  const seen = new Set<string>();
  let single = false;
  let frozen = false;
  let best: { active: Uint8Array; lifted: Uint8Array; violation: number; which: string[] } | null = null;
  const stateKey = () => `${st.active.join('')}|${st.lifted.join('')}`;
  type Change = { kind: 'member' | 'support'; index: number; severity: number };
  const where = (c: Change) => (c.kind === 'member' ? nodes[elements[c.index].member.i].id : nodes[prep.model.supports[c.index].node].id);
  const toggle = (c: Change) => {
    if (c.kind === 'member') st.active[c.index] ^= 1;
    else st.lifted[c.index] ^= 1;
  };
  const mostSevere = (cs: Change[]) => cs.reduce((a, b) => (b.severity > a.severity ? b : a));
  // derniers changements d'état appliqués et état d'avant (retour arrière si l'état essayé est instable)
  let lastApplied: Change[] = [];
  let prevState: { active: Uint8Array; lifted: Uint8Array } | null = null;
  for (;;) {
    iterations++;
    try {
      pass = linearPass(prep, set, loads, st, secondOrder, spinning, warnings);
    } catch (e) {
      if (!(e instanceof FemError) || (e.code !== 'mechanism' && e.code !== 'instability') || !prevState || !lastApplied.length) throw e;
      st.active.set(prevState.active);
      st.lifted.set(prevState.lifted);
      if (lastApplied.length > 1 && iterations < maxIt) {
        // plusieurs changements à la fois ont rendu le système instable : un seul, le plus marqué
        single = true;
        lastApplied = [mostSevere(lastApplied)];
        toggle(lastApplied[0]);
        if (secondOrder) prevU = null;
        continue;
      }
      // un seul soulèvement (ou une seule ouverture de contact) rend la structure instable : basculement
      const c = lastApplied[0];
      const what = c.kind === 'support' ? `l'appui ${where(c)} se soulève` : `le contact ${where(c)} s'ouvre`;
      throw new FemError(e.code, `Stabilité d'ensemble non assurée (cas ${set.id}) : ${what} et la structure devient instable (basculement) — ${e.message}`, e.nodes);
    }
    recovered = elements.map((e, k) => (st.active[k] ? recover(e, pass!, k) : null));
    const u = pass.u;
    // réactions des appuis en compression seule
    // violations exprimées en effort (N) : barre active dans le mauvais sens, barre inactive qui reprendrait un effort
    // (allongement × EA / L), appui qui tire ou appui soulevé qui pénètre (raideur nominale 1e6 N/mm)
    const changes: Change[] = [];
    if (nonlinear && !frozen) {
      const R = reactionsOf(prep, set, recovered, st);
      prep.model.supports.forEach((s, k) => {
        if (!s.compressionOnly) return;
        if (!st.lifted[k] && R[k].R[1] < -ntol) changes.push({ kind: 'support', index: k, severity: -R[k].R[1] });
        else if (st.lifted[k] && u[s.node * 6 + 1] < -1e-6) changes.push({ kind: 'support', index: k, severity: -u[s.node * 6 + 1] * 1e6 });
      });
      elements.forEach((e, k) => {
        const nl = e.member.nonlinear;
        if (!nl) return;
        if (st.active[k]) {
          const r = recovered[k]!;
          const N = (-r.endF[0] + r.endF[6]) / 2;
          if ((nl === 'tensionOnly' && N < -ntol) || (nl === 'compressionOnly' && N > ntol)) changes.push({ kind: 'member', index: k, severity: Math.abs(N) });
        } else {
          // allongement de la barre inactive (projection des déplacements sur son axe)
          const R3 = e.frame.R;
          let el = 0;
          for (let d = 0; d < 3; d++) el += R3[d] * (u[e.member.j * 6 + d] - u[e.member.i * 6 + d]);
          const F = (el * e.member.E * e.member.A) / e.frame.L;
          if ((nl === 'tensionOnly' && F > ntol) || (nl === 'compressionOnly' && F < -ntol)) changes.push({ kind: 'member', index: k, severity: Math.abs(F) });
        }
      });
    }
    // efforts normaux pour le 2ᵉ ordre
    let converged = true;
    if (secondOrder) {
      elements.forEach((_, k) => {
        const r = recovered[k];
        st.N[k] = r ? (-r.endF[0] + r.endF[6]) / 2 : 0;
      });
      let du = 0;
      let umax = 0;
      for (let v = 0; v < nodes.length; v++)
        for (let d = 0; d < 3; d++) {
          const x = u[v * 6 + d];
          umax = Math.max(umax, Math.abs(x));
          if (prevU) du = Math.max(du, Math.abs(x - prevU[v * 6 + d]));
        }
      converged = !!prevU && du <= tol * Math.max(umax, 1e-9);
      prevU = u;
    }
    if (!changes.length && converged) break;
    if (changes.length) {
      const violation = changes.reduce((m, c) => Math.max(m, c.severity), 0);
      if (!best || violation < best.violation) best = { active: st.active.slice(), lifted: st.lifted.slice(), violation, which: changes.map(where) };
      // cycle : l'état revient. D'abord un seul changement à la fois ; si le cycle persiste, aucun état ne satisfait
      // exactement toutes les conditions de contact : on retient le meilleur si son effort résiduel est négligeable (≤ 1 % de
      // la plus grande réaction)
      const key = stateKey();
      if (seen.has(key)) {
        if (!single) {
          single = true;
          seen.clear();
        } else {
          const limit = Math.max(100 * ntol, 1e-2 * maxReaction(prep, set));
          if (best.violation > limit)
            throw new FemError('no-convergence', `Contacts indéterminés (cas ${set.id}) : effort résiduel ${Math.round(best.violation)} N`, best.which.slice(0, 10));
          st.active.set(best.active);
          st.lifted.set(best.lifted);
          frozen = true;
          warnings.add(`Contact(s) à la limite (cas ${set.id}) : effort résiduel ${Math.round(best.violation)} N négligé (${best.which.slice(0, 3).join(', ')})`);
          if (secondOrder) prevU = null;
          continue;
        }
      }
      seen.add(key);
    }
    if (iterations >= maxIt)
      throw new FemError(
        'no-convergence',
        `Le calcul ne converge pas en ${maxIt} itérations (cas ${set.id})${changes.length ? ` : ${changes.length} barre(s) ou appui(s) changent encore d'état` : ''}`,
        changes.slice(0, 10).map(where),
      );
    // au-delà de 10 itérations ou après un cycle, un seul changement d'état à la fois (le plus marqué)
    const apply = (single || iterations > 10) && changes.length > 1 ? [mostSevere(changes)] : changes;
    if (apply.length) {
      prevState = { active: st.active.slice(), lifted: st.lifted.slice() };
      lastApplied = apply;
    }
    for (const c of apply) toggle(c);
    if (secondOrder && apply.length) prevU = null;
  }
  const reactions = reactionsOf(prep, set, recovered, st);
  const lifted = reactions.filter((r) => r.lifted).length;
  if (lifted) warnings.add(`${lifted} appui(s) soulevé(s) (cas ${set.id})`);
  // résultats par barre d'origine
  const members: MemberResult[] = prep.model.members.map((m, mi) => {
    const ids = prep.memberElements[mi];
    const active = ids.every((k) => st.active[k]);
    const first = recovered[ids[0]];
    const last = recovered[ids[ids.length - 1]];
    const endForces = first && last ? [...first.endF.slice(0, 6), ...last.endF.slice(6)] : new Array(12).fill(0);
    const stations: Station[] = [];
    ids.forEach((k, s) => {
      const r = recovered[k];
      const e = elements[k];
      const L = e.frame.L;
      const xs = Array.from({ length: nst }, (_, t) => (L * t) / (nst - 1)).slice(s > 0 ? 1 : 0);
      const pts = r
        ? stationForces(e.member, L, r.endF, loads[k], secondOrder ? r.ub : null, xs)
        : xs.map((x) => ({ x, N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 }));
      for (const p of pts) stations.push({ ...p, x: p.x + e.offset });
    });
    return { id: m.id, active, endForces, stations };
  });
  if (spinning.size) warnings.add(`${spinning.size} nœud(s) dont une rotation n'est retenue par aucune barre (articulations) : rotation stabilisée`);
  // ddl d'extrémité sans rigidité : un seul message
  const reg = [...warnings].filter((w) => w.startsWith(REGULARIZED));
  for (const w of reg) warnings.delete(w);
  if (reg.length) warnings.add(`${reg.length} ddl d'extrémité de barre sans rigidité, stabilisés (${reg.slice(0, 3).map((w) => w.slice(REGULARIZED.length)).join(', ')}${reg.length > 3 ? '…' : ''})`);
  return {
    loadSet: set.id,
    displacements: pass.u.slice(0, prep.model.nodes.length * 6),
    reactions,
    members,
    iterations,
    warnings: [...warnings],
  };
}

const REGULARIZED = '\u0000reg:';

/** Ordre de grandeur des efforts du cas : somme des charges nodales et réparties (N), pour les tolérances. */
function maxReaction(prep: Prepared, set: LoadSet): number {
  let s = 0;
  for (const ld of set.nodal) s += Math.hypot(ld.f[0], ld.f[1], ld.f[2]);
  for (const ld of set.member) {
    if (ld.kind === 'point') s += Math.abs(ld.P);
    else {
      const m = prep.model.members[ld.member];
      if (!m) continue;
      const a = prep.model.nodes[m.i];
      const b = prep.model.nodes[m.j];
      const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      s += ((Math.abs(ld.q1) + Math.abs(ld.q2 ?? ld.q1)) / 2) * ((ld.b ?? L) - (ld.a ?? 0));
    }
  }
  return s;
}

/** Réactions : somme des efforts des barres aboutissant à chaque nœud d'appui, moins les charges nodales. */
function reactionsOf(
  prep: Prepared,
  set: LoadSet,
  recovered: Array<{ endF: Float64Array } | null>,
  st: State,
): Reaction[] {
  const sum = new Map<number, Float64Array>();
  for (const s of prep.model.supports) sum.set(s.node, new Float64Array(6));
  prep.elements.forEach((e, k) => {
    const r = recovered[k];
    if (!r) return;
    const si = sum.get(e.member.i);
    const sj = sum.get(e.member.j);
    if (!si && !sj) return;
    const g = vecToGlobal(r.endF, e.frame.R);
    if (si) for (let d = 0; d < 6; d++) si[d] += g[d];
    if (sj) for (let d = 0; d < 6; d++) sj[d] += g[6 + d];
  });
  for (const ld of set.nodal) {
    const s = sum.get(ld.node);
    if (s) for (let d = 0; d < 6; d++) s[d] -= ld.f[d];
  }
  return prep.model.supports.map((s, k) => {
    const v = sum.get(s.node)!;
    const R = Array.from(v) as Vec6;
    // ddl libres : la somme n'est qu'un résidu numérique
    s.dofs.forEach((spec, d) => {
      const released = st.lifted[k] && (d === 1 || ((s.upliftReleases ?? 'all') === 'all' && d < 3));
      if (spec === 'free' || released) R[d] = 0;
    });
    return { node: s.node, R, lifted: !!st.lifted[k] };
  });
}

/** Calcule plusieurs cas de charge sur le même modèle préparé. */
export function analyze(model: FemModel, sets: LoadSet[], options: AnalysisOptions = {}, onProgress?: (done: number, total: number) => void): AnalysisResult[] {
  const prep = prepare(model);
  return sets.map((s, k) => {
    const r = analyzeLoadSet(prep, s, options);
    onProgress?.(k + 1, sets.length);
    return r;
  });
}
