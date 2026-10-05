// Cas de charge sur le modèle assemblé (§7), comme dans les modèles SCIA des notes statico :
//   G1 poids propre des barres (78,5 kN/m³), Gc complément jusqu'au poids pesé d'une Viewbox (si le modèle est plus
//   léger), G2 plafonds (toitures), G3 murs / vitrages / portes, G4 sols (planchers), G5 garde-corps, G7 logos,
//   GB lest ajouté (blocs béton, poids connus : compté comme le poids propre dans la stabilité) ;
//   Q1.d exploitation en service (planchers + toitures accessibles) et H = V / 10 aux 4 angles de chaque plancher chargé,
//   Q2.d hors service (sans les surfaces extérieures évacuées) ; W1.d vent en service, W2.d hors service sur les côtés
//   exposés (luv +0,8, lee −0,5, parallèle −0,8 ; moitié à la rive du plancher, moitié à la rive de toiture) ;
//   W0 succion des toitures du dernier niveau (stabilité).
// Directions d = 1 x+, 2 x−, 3 y+, 4 y− dans les axes de l'installation. Charges surfaciques : répartition en enveloppe
// (lignes à 45°) sur les barres qui bordent chaque case de la grille. Fonctions pures ; N, mm.
import type { StructuralModel } from './assemble';
import type { DistributedLoad, LoadSet, NodalLoad, Vec3, Vec6 } from './fem/types';
import { materialByKey } from './materials';
import type { CalcRecord } from './records';
import type { Side, ViewboxTemplate } from './templates/viewboxEU';
import { viewboxTemplate } from './templates/viewboxEU';
import { fmtNumber } from './units';

export type LoadGroup = 'G' | 'Q' | 'W';

export interface LoadCase {
  id: string;
  label: string;
  group: LoadGroup;
  nodal: NodalLoad[];
  member: DistributedLoad[];
  /** résultante des forces (N, monde) */
  resultant: Vec3;
}

/** Objet porté par un côté de Viewbox (mur, vitrage, porte, garde-corps) : charge linéique verticale sur la rive. */
export interface EdgeItem {
  module: string;
  side: Side;
  /** tronçon le long du côté (mm depuis le premier angle, comme FaceInfo) */
  from: number;
  to: number;
  level: 'floor' | 'roof';
  /** N/mm vers le bas */
  q: number;
  loadCase: 'G3' | 'G5' | 'GB';
  label: string;
}

/** Charge ponctuelle (logo, équipement) : au nœud le plus proche du module, au niveau donné. */
export interface PointItem {
  module: string;
  u: number;
  v: number;
  level: 'floor' | 'roof';
  /** N vers le bas */
  F: number;
  loadCase: 'G3' | 'G5' | 'G7' | 'GB';
  label: string;
}

export interface LoadInputs {
  /** poids pesé d'une Viewbox (N) : complément Gc si le modèle est plus léger */
  moduleWeight: number;
  /**
   * poids propre retenu : le plus lourd du modèle (barres + plafond + sol) et de la pesée (défaut, prudent), ou la pesée
   * exactement (plafond et sol réduits d'autant, jamais sous le poids des barres seules)
   */
  weightMode?: 'max' | 'weighed';
  /** plafond, sol (N/mm²) */
  ceiling: number;
  floorFinish: number;
  /** exploitation des planchers et des toitures accessibles (N/mm²) ; H = ratio · V */
  live: number;
  roofLive: number;
  horizontalRatio: number;
  roofAccessible: boolean;
  /** hors service : le dernier niveau est aussi évacué */
  evacuateTopLevel: boolean;
  /** neige sur les toitures du dernier niveau (N/mm², déjà multipliée par le coefficient de forme 0,8) ; 0 = pas de neige */
  snowRoof?: number;
  /** pressions du vent (N/mm²) : en service, hors service (déjà abattue) */
  windInService: number;
  windOutOfService: number;
  cp: { windward: number; leeward: number; parallel: number; roofStability: number };
  edgeItems: EdgeItem[];
  pointItems: PointItem[];
}

export interface Axes {
  x: Vec3;
  y: Vec3;
}

export const DIRECTIONS = [1, 2, 3, 4] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const DIRECTION_LABEL: Record<Direction, string> = { 1: 'x+', 2: 'x−', 3: 'y+', 4: 'y−' };

export function directionVector(axes: Axes, d: Direction): Vec3 {
  const v = d <= 2 ? axes.x : axes.y;
  const s = d % 2 === 1 ? 1 : -1;
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Axes de l'installation : axes SketchUp (X, Y) quand les Viewbox leur sont parallèles, sinon l'orientation de la
 * première Viewbox. Monde Y vers le haut : l'axe Y de SketchUp est −Z.
 */
export function installationAxes(model: Pick<StructuralModel, 'modules'>): Axes {
  const skX: Vec3 = [1, 0, 0];
  const skY: Vec3 = [0, 0, -1];
  const aligned = model.modules.every((m) => Math.min(Math.abs(m.u[0]), Math.abs(m.u[2])) < Math.sin(Math.PI / 180));
  if (aligned || !model.modules.length) return { x: skX, y: skY };
  const u = model.modules[0].u;
  return { x: u, y: [u[2], 0, -u[0]] };
}

/** m/s² : poids volumique de l'acier 78,5 kN/m³ comme dans les modèles SCIA */
const G_STD = 10;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

class CaseBuilder {
  nodal = new Map<number, Vec6>();
  member: DistributedLoad[] = [];
  constructor(private model: StructuralModel) {}
  force(node: number, f: Vec3) {
    const cur = this.nodal.get(node) ?? ([0, 0, 0, 0, 0, 0] as Vec6);
    for (let d = 0; d < 3; d++) cur[d] += f[d];
    this.nodal.set(node, cur);
  }
  /** Charge linéique (N/mm) de profil linéaire par morceaux le long d'une ligne du module, direction monde `dir`. */
  profile(lineKey: string, pts: Array<[number, number]>, dir: Vec3) {
    const targets = this.model.lines.get(lineKey);
    if (!targets) throw new Error(`Ligne ${lineKey} absente du modèle`);
    for (const t of targets) {
      const lo = Math.min(t.s0, t.s1);
      const hi = Math.max(t.s0, t.s1);
      for (let k = 0; k + 1 < pts.length; k++) {
        const [sa, qa] = pts[k];
        const [sb, qb] = pts[k + 1];
        const a = Math.max(lo, sa);
        const b = Math.min(hi, sb);
        if (b - a < 1e-6) continue;
        const qAt = (s: number) => qa + ((qb - qa) * (s - sa)) / (sb - sa);
        // abscisses depuis le nœud i de la barre
        const [x1, x2, q1, q2] = t.s0 <= t.s1 ? [a - t.s0, b - t.s0, qAt(a), qAt(b)] : [t.s0 - b, t.s0 - a, qAt(b), qAt(a)];
        if (Math.abs(q1) < 1e-12 && Math.abs(q2) < 1e-12) continue;
        for (const [axis, c] of [
          ['X', dir[0]],
          ['Y', dir[1]],
          ['Z', dir[2]],
        ] as const) {
          if (Math.abs(c) < 1e-12) continue;
          this.member.push({ member: t.member, kind: 'distributed', dir: axis, q1: q1 * c, q2: q2 * c, a: x1, b: x2 });
        }
      }
    }
  }
  build(id: string, label: string, group: LoadGroup): LoadCase {
    const nodal = [...this.nodal].map(([node, f]) => ({ node, f }));
    const R: Vec3 = [0, 0, 0];
    for (const n of nodal) for (let d = 0; d < 3; d++) R[d] += n.f[d];
    for (const l of this.member) R[l.dir === 'X' ? 0 : l.dir === 'Y' ? 1 : 2] += memberLoadForce(this.model, l);
    return { id, label, group, nodal, member: this.member, resultant: R };
  }
}

function memberLoadForce(model: StructuralModel, l: DistributedLoad): number {
  const b = model.fem.members[l.member];
  const A = model.fem.nodes[b.i];
  const B = model.fem.nodes[b.j];
  const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
  return ((l.q1 + (l.q2 ?? l.q1)) / 2) * ((l.b ?? L) - (l.a ?? 0));
}

/**
 * Charge surfacique p (N/mm², positive dans le sens `dir`) sur les cases d'un niveau d'une Viewbox, répartie en
 * enveloppe : grands bords en trapèze, petits bords en triangle (hauteur p · min(a, b) / 2).
 */
function panelLoad(cb: CaseBuilder, tpl: ViewboxTemplate, module: string, level: 'floor' | 'roof', p: number, dir: Vec3) {
  const z = Math.round(level === 'floor' ? tpl.params.floorZ : tpl.params.roofZ);
  for (const c of tpl.panels) {
    if (c.level !== level) continue;
    const a = c.u1 - c.u0;
    const b = c.v1 - c.v0;
    const h = Math.min(a, b) / 2;
    const q = p * h;
    const edge = (s0: number, s1: number): Array<[number, number]> =>
      s1 - s0 > 2 * h + 1e-9
        ? [
            [s0, 0],
            [s0 + h, q],
            [s1 - h, q],
            [s1, 0],
          ]
        : [
            [s0, 0],
            [(s0 + s1) / 2, (q * (s1 - s0)) / (2 * h)],
            [s1, 0],
          ];
    for (const v of [c.v0, c.v1]) cb.profile(`${module}|${z}|v=${Math.round(v)}`, edge(c.u0, c.u1), dir);
    for (const u of [c.u0, c.u1]) cb.profile(`${module}|${z}|u=${Math.round(u)}`, edge(c.v0, c.v1), dir);
  }
}

/** Ligne de la rive d'un côté, et abscisse sur la ligne du premier angle du côté. */
function rimLine(tpl: ViewboxTemplate, module: string, side: Side, level: 'floor' | 'roof'): { key: string; offset: number } {
  const p = tpl.params;
  const z = Math.round(level === 'floor' ? p.floorZ : p.roofZ);
  if (side === 'v0' || side === 'v1') return { key: `${module}|${z}|v=${Math.round(side === 'v0' ? p.y0 : p.y1)}`, offset: p.x0 };
  return { key: `${module}|${z}|u=${Math.round(side === 'u0' ? p.x0 : p.x1)}`, offset: p.y0 };
}

const DOWN: Vec3 = [0, -1, 0];

export interface LoadModel {
  cases: LoadCase[];
  axes: Axes;
  records: CalcRecord[];
  warnings: string[];
}

export function buildLoadCases(model: StructuralModel, inp: LoadInputs): LoadModel {
  const warnings: string[] = [];
  const records: CalcRecord[] = [];
  const axes = installationAxes(model);
  const tplCache = new Map<string, ViewboxTemplate>();
  const tplOf = (id: string) => {
    const pm = model.modules.find((m) => m.id === id)!;
    let t = tplCache.get(pm.templateKey);
    if (!t) tplCache.set(pm.templateKey, (t = viewboxTemplate(pm.params)));
    return t;
  };
  const cases: LoadCase[] = [];
  const n = (x: number, d = 2) => fmtNumber(x, d);

  // ─── G1 poids propre des barres ───
  const g1 = new CaseBuilder(model);
  const selfByModule = new Map<string, number>();
  model.meta.forEach((m, k) => {
    if (m.massless) return;
    const mat = materialByKey(m.material);
    const b = model.fem.members[k];
    if (!mat || !mat.rho) return;
    const q = b.A * mat.rho * G_STD * 1e-9; // N/mm
    const A = model.fem.nodes[b.i];
    const B = model.fem.nodes[b.j];
    const L = Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
    g1.member.push({ member: k, kind: 'distributed', dir: 'Y', q1: -q });
    selfByModule.set(m.module, (selfByModule.get(m.module) ?? 0) + q * L);
  });
  cases.push(g1.build('G1', 'Poids propre', 'G'));

  // ─── G2 plafonds, G4 sols ───
  // poids pesé retenu : plafond et sol réduits pour que barres + plafond + sol = pesée
  const finishFactor = new Map<string, number>();
  for (const pm of model.modules) {
    const p = tplOf(pm.id).params;
    const fin = (inp.ceiling + inp.floorFinish) * (p.x1 - p.x0) * (p.y1 - p.y0);
    const self = selfByModule.get(pm.id) ?? 0;
    finishFactor.set(pm.id, inp.weightMode === 'weighed' && fin > 0 ? Math.max(0, Math.min(1, (inp.moduleWeight - self) / fin)) : 1);
  }
  const g2 = new CaseBuilder(model);
  const g4 = new CaseBuilder(model);
  for (const pm of model.modules) {
    const tpl = tplOf(pm.id);
    const k = finishFactor.get(pm.id)!;
    if (inp.ceiling * k > 0) panelLoad(g2, tpl, pm.id, 'roof', inp.ceiling * k, DOWN);
    if (inp.floorFinish * k > 0) panelLoad(g4, tpl, pm.id, 'floor', inp.floorFinish * k, DOWN);
  }
  const G2 = g2.build('G2', 'Plafonds', 'G');
  const G4 = g4.build('G4', 'Sols', 'G');

  // ─── Gc : complément jusqu'au poids pesé (le modèle ne descend jamais sous le poids réel) ───
  const gc = new CaseBuilder(model);
  for (const pm of model.modules) {
    const tpl = tplOf(pm.id);
    const p = tpl.params;
    const area = (p.x1 - p.x0) * (p.y1 - p.y0);
    const modelled = (selfByModule.get(pm.id) ?? 0) + (inp.ceiling + inp.floorFinish) * area * finishFactor.get(pm.id)!;
    const missing = inp.moduleWeight - modelled;
    if (missing <= 0) continue;
    // réparti uniformément sur les 4 rives du plancher
    const perim = 2 * (p.x1 - p.x0 + (p.y1 - p.y0));
    for (const side of ['u0', 'u1', 'v0', 'v1'] as Side[]) {
      const { key } = rimLine(tpl, pm.id, side, 'floor');
      const [s0, s1] = side === 'v0' || side === 'v1' ? [p.x0, p.x1] : [p.y0, p.y1];
      gc.profile(
        key,
        [
          [s0, missing / perim],
          [s1, missing / perim],
        ],
        DOWN,
      );
    }
  }
  const first = model.modules[0];
  if (first) {
    const p = first.params;
    const area = (p.x1 - p.x0) * (p.y1 - p.y0);
    const self = selfByModule.get(first.id) ?? 0;
    const total = self + (inp.ceiling + inp.floorFinish) * area;
    const k = finishFactor.get(first.id)!;
    const weighed = inp.weightMode === 'weighed' && k < 1;
    records.push({
      key: 'loads.moduleWeight',
      title: 'Poids d’une Viewbox : modèle et pesée',
      clause: 'statico 24-0571 § 2.1',
      formula: weighed
        ? 'poids pesé retenu : G1 (barres, 78,5 kN/m³) + k · (G2 plafond + G4 sol) = poids pesé'
        : 'G1 (barres, 78,5 kN/m³) + G2 (plafond) + G4 (sol) ≥ poids pesé, sinon complément Gc sur les rives du plancher',
      withValues: weighed
        ? `${n(self / 1e3)} + ${n(k, 2)} · (${n((inp.ceiling * area) / 1e3)} + ${n((inp.floorFinish * area) / 1e3)}) = ${n((self + k * (total - self)) / 1e3)} kN ; pesée ${n(inp.moduleWeight / 1e3)} kN${self > inp.moduleWeight ? ' (barres seules plus lourdes que la pesée : plafond et sol ignorés)' : ''}`
        : `${n(self / 1e3)} + ${n((inp.ceiling * area) / 1e3)} + ${n((inp.floorFinish * area) / 1e3)} = ${n(total / 1e3)} kN ; pesée ${n(inp.moduleWeight / 1e3)} kN${total >= inp.moduleWeight ? ' : modèle plus lourd, retenu (prudent)' : ` : complément Gc = ${n((inp.moduleWeight - total) / 1e3)} kN`}`,
      result: weighed ? self + k * (total - self) : Math.max(total, inp.moduleWeight),
    });
  }
  const Gc = gc.build('Gc', 'Complément de poids', 'G');

  // ─── G3 murs, G5 garde-corps, G7 logos ───
  const byCase = new Map<string, CaseBuilder>([
    ['G3', new CaseBuilder(model)],
    ['G5', new CaseBuilder(model)],
    ['G7', new CaseBuilder(model)],
    ['GB', new CaseBuilder(model)],
  ]);
  for (const it of inp.edgeItems) {
    if (!model.modules.some((m) => m.id === it.module)) continue;
    const tpl = tplOf(it.module);
    const { key, offset } = rimLine(tpl, it.module, it.side, it.level);
    byCase.get(it.loadCase)!.profile(
      key,
      [
        [offset + it.from, it.q],
        [offset + it.to, it.q],
      ],
      DOWN,
    );
  }
  for (const it of inp.pointItems) {
    if (!model.modules.some((m) => m.id === it.module)) continue;
    const tpl = tplOf(it.module);
    const z = it.level === 'floor' ? tpl.params.floorZ : tpl.params.roofZ;
    let best = -1;
    let bd = Infinity;
    for (const tn of tpl.nodes) {
      if (Math.abs(tn.z - z) > 1) continue;
      const d = Math.hypot(tn.u - it.u, tn.v - it.v);
      if (d < bd) [best, bd] = [model.nodeOf.get(`${it.module}|${tn.key}`)!, d];
    }
    if (best >= 0) byCase.get(it.loadCase)!.force(best, [0, -it.F, 0]);
  }
  cases.push(G2, byCase.get('G3')!.build('G3', 'Murs, vitrages, portes', 'G'), G4, byCase.get('G5')!.build('G5', 'Garde-corps', 'G'), byCase.get('G7')!.build('G7', 'Logos', 'G'), Gc);
  const GB = byCase.get('GB')!.build('GB', 'Lest', 'G');
  if (GB.nodal.length || GB.member.length) cases.push(GB);

  // ─── Q : exploitation et H = V / 10 aux angles des planchers chargés ───
  const topLevel = Math.max(0, ...model.modules.map((m) => m.level));
  for (const [kind, label] of [
    ['Q1', 'en service'],
    ['Q2', 'hors service'],
  ] as const)
    for (const d of DIRECTIONS) {
      const cb = new CaseBuilder(model);
      const dir = directionVector(axes, d);
      for (const pm of model.modules) {
        const tpl = tplOf(pm.id);
        const p = tpl.params;
        const area = (p.x1 - p.x0) * (p.y1 - p.y0);
        const surfaces: Array<{ level: 'floor' | 'roof'; q: number; nodes: string[] }> = [];
        const floorEvacuated = kind === 'Q2' && inp.evacuateTopLevel && pm.level === topLevel && topLevel > 0;
        if (inp.live > 0 && !floorEvacuated) surfaces.push({ level: 'floor', q: inp.live, nodes: tpl.cornerFloor });
        // toiture accessible (terrasse) : surface extérieure, évacuée hors service
        if (kind === 'Q1' && inp.roofAccessible && inp.roofLive > 0 && model.topModules.has(pm.id)) surfaces.push({ level: 'roof', q: inp.roofLive, nodes: tpl.cornerRoof });
        for (const s of surfaces) {
          panelLoad(cb, tpl, pm.id, s.level, s.q, DOWN);
          const H = (inp.horizontalRatio * s.q * area) / s.nodes.length;
          for (const k of s.nodes) cb.force(model.nodeOf.get(`${pm.id}|${k}`)!, [dir[0] * H, 0, dir[2] * H]);
        }
      }
      cases.push(cb.build(`${kind}.${d}`, `Exploitation ${label} ${DIRECTION_LABEL[d]}`, 'Q'));
    }

  // ─── W : vent sur les côtés exposés ───
  const H = model.topY - model.baseY;
  for (const [kind, q, label] of [
    ['W1', inp.windInService, 'en service'],
    ['W2', inp.windOutOfService, 'hors service'],
  ] as const)
    for (const d of DIRECTIONS) {
      const cb = new CaseBuilder(model);
      const wd = directionVector(axes, d);
      for (const f of model.faces) {
        if (!f.exposed.length) continue;
        const c = dot(f.normal, wd);
        const cp = c < -Math.SQRT1_2 ? inp.cp.windward : c > Math.SQRT1_2 ? inp.cp.leeward : inp.cp.parallel;
        const tpl = tplOf(f.module);
        const height = tpl.params.topZ - tpl.params.floorZ;
        // F = −cp · q · n par unité de surface ; moitié de la hauteur à chaque rive
        const w = -cp * q * (height / 2);
        const dir: Vec3 = [f.normal[0], 0, f.normal[2]];
        for (const level of ['floor', 'roof'] as const) {
          const { key, offset } = rimLine(tpl, f.module, f.side, level);
          for (const [a, b] of f.exposed)
            cb.profile(
              key,
              [
                [offset + a, w],
                [offset + b, w],
              ],
              dir,
            );
        }
      }
      cases.push(cb.build(`${kind}.${d}`, `Vent ${label} ${DIRECTION_LABEL[d]}`, 'W'));
    }
  // S : neige sur les toitures du dernier niveau (terrasses fermées par neige)
  if ((inp.snowRoof ?? 0) > 0) {
    const sc = new CaseBuilder(model);
    for (const id of model.topModules) panelLoad(sc, tplOf(id), id, 'roof', inp.snowRoof!, DOWN);
    cases.push(sc.build('S', 'Neige sur les toitures', 'Q'));
    records.push({
      key: 'loads.snow',
      title: 'Neige',
      clause: 'EN 1991-1-3 § 5.2',
      formula: 's = μ1 · Ce · Ct · sk = 0,8 · sk sur les toitures du dernier niveau',
      withValues: `s = ${n(inp.snowRoof! * 1e3)} kN/m² (${n((inp.snowRoof! * 1e6) / 9.81, 0)} kg/m²)`,
    });
  }
  // W0 : succion des toitures du dernier niveau, hors service (stabilité)
  const w0 = new CaseBuilder(model);
  for (const id of model.topModules) panelLoad(w0, tplOf(id), id, 'roof', -inp.cp.roofStability * inp.windOutOfService, [0, 1, 0]);
  cases.push(w0.build('W0', 'Succion des toitures (hors service)', 'W'));

  if (!model.faces.some((f) => f.exposed.length)) warnings.push('Aucun côté exposé au vent.');
  records.push({
    key: 'loads.wind.faces',
    title: 'Vent sur les côtés des Viewbox',
    clause: 'statico 24-0571 § 2.4',
    formula: 'w = −cp · q · h / 2 par rive (plancher et toiture) ; cp luv / lee / parallèle',
    withValues: `h = ${n(H / 1e3)} m ; q en service ${n(inp.windInService * 1e3)} kN/m², hors service ${n(inp.windOutOfService * 1e3)} kN/m² ; cp ${n(inp.cp.windward, 1)} / ${n(inp.cp.leeward, 1)} / ${n(inp.cp.parallel, 1)}`,
  });
  return { cases, axes, records, warnings };
}

/** Combinaison linéaire de cas de charge → cas du solveur. */
export function combineCases(id: string, cases: ReadonlyMap<string, LoadCase>, factors: ReadonlyArray<readonly [string, number]>): LoadSet {
  const nodal = new Map<number, Vec6>();
  const member: DistributedLoad[] = [];
  for (const [cid, f] of factors) {
    const c = cases.get(cid);
    if (!c || !f) continue;
    for (const ld of c.nodal) {
      const cur = nodal.get(ld.node) ?? ([0, 0, 0, 0, 0, 0] as Vec6);
      for (let d = 0; d < 6; d++) cur[d] += f * ld.f[d];
      nodal.set(ld.node, cur);
    }
    for (const ld of c.member) member.push({ ...ld, q1: ld.q1 * f, q2: ld.q2 === undefined ? undefined : ld.q2 * f });
  }
  return { id, nodal: [...nodal].map(([node, f]) => ({ node, f })), member };
}
