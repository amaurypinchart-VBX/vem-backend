// Élément barre 3D d'Euler-Bernoulli (12 ddl) : repère local, rigidité élastique et géométrique, liaisons d'extrémité
// (relâchements et ressorts, condensés statiquement : aucune pénalité), charges équivalentes, efforts le long de la barre.
// Fonctions pures, unités N / mm / rad. Convention des ddl locaux : ux, uy, uz, rx, ry, rz au nœud i puis au nœud j ;
// une rotation ry positive fait descendre w le long de x (w' = −ry), une rotation rz positive fait monter v (v' = rz).
import type { EndDof, EndSpec, FemMember, FemNode, MemberLoad, Station, Vec3 } from './types';
import { FemError, RIGID_END } from './types';

export interface LocalFrame {
  L: number;
  /** matrice de rotation 3 × 3 (lignes = axes locaux x, y, z exprimés dans le repère global) */
  R: Float64Array;
  /** projection horizontale de la barre (mm) */
  horizontal: number;
}

const UP: Vec3 = [0, 1, 0];
const GLOBAL_X: Vec3 = [1, 0, 0];

export function localFrame(m: FemMember, a: FemNode, b: FemNode): LocalFrame {
  const d: Vec3 = [b.x - a.x, b.y - a.y, b.z - a.z];
  const L = Math.hypot(d[0], d[1], d[2]);
  if (!(L > 1e-6)) throw new FemError('invalid-model', `Barre ${m.id} : longueur nulle (nœuds ${a.id} et ${b.id} confondus)`, [a.id, b.id]);
  const x: Vec3 = [d[0] / L, d[1] / L, d[2] / L];
  const ref = m.ref ?? (Math.abs(x[1]) > 0.999 ? GLOBAL_X : UP);
  const rx = ref[0] * x[0] + ref[1] * x[1] + ref[2] * x[2];
  let z: Vec3 = [ref[0] - rx * x[0], ref[1] - rx * x[1], ref[2] - rx * x[2]];
  const lz = Math.hypot(z[0], z[1], z[2]);
  if (lz < 1e-9) throw new FemError('invalid-model', `Barre ${m.id} : vecteur de référence parallèle à la barre`, [a.id, b.id]);
  z = [z[0] / lz, z[1] / lz, z[2] / lz];
  let y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  if (m.roll) {
    const c = Math.cos(m.roll);
    const s = Math.sin(m.roll);
    const y2: Vec3 = [c * y[0] + s * z[0], c * y[1] + s * z[1], c * y[2] + s * z[2]];
    z = [-s * y[0] + c * z[0], -s * y[1] + c * z[1], -s * y[2] + c * z[2]];
    y = y2;
  }
  return { L, R: Float64Array.from([...x, ...y, ...z]), horizontal: Math.hypot(d[0], d[2]) };
}

/** Rigidité élastique locale 12 × 12 (ligne par ligne). */
export function localStiffness(m: FemMember, L: number): Float64Array {
  const k = new Float64Array(144);
  const set = (r: number, c: number, v: number) => {
    k[r * 12 + c] = v;
    k[c * 12 + r] = v;
  };
  const ea = (m.E * m.A) / L;
  set(0, 0, ea);
  set(6, 6, ea);
  set(0, 6, -ea);
  if (m.kind === 'truss') return k;
  const gj = (m.G * m.It) / L;
  set(3, 3, gj);
  set(9, 9, gj);
  set(3, 9, -gj);
  // flexion dans le plan x-y (uy, rz) : inertie Iz
  const z12 = (12 * m.E * m.Iz) / L ** 3;
  const z6 = (6 * m.E * m.Iz) / L ** 2;
  const z4 = (4 * m.E * m.Iz) / L;
  const z2 = (2 * m.E * m.Iz) / L;
  set(1, 1, z12);
  set(1, 5, z6);
  set(1, 7, -z12);
  set(1, 11, z6);
  set(5, 5, z4);
  set(5, 7, -z6);
  set(5, 11, z2);
  set(7, 7, z12);
  set(7, 11, -z6);
  set(11, 11, z4);
  // flexion dans le plan x-z (uz, ry) : inertie Iy
  const y12 = (12 * m.E * m.Iy) / L ** 3;
  const y6 = (6 * m.E * m.Iy) / L ** 2;
  const y4 = (4 * m.E * m.Iy) / L;
  const y2 = (2 * m.E * m.Iy) / L;
  set(2, 2, y12);
  set(2, 4, -y6);
  set(2, 8, -y12);
  set(2, 10, -y6);
  set(4, 4, y4);
  set(4, 8, y6);
  set(4, 10, y2);
  set(8, 8, y12);
  set(8, 10, y6);
  set(10, 10, y4);
  return k;
}

/** Rigidité géométrique locale 12 × 12 pour un effort normal N (traction > 0 : raidit ; compression : assouplit). */
export function localGeometric(m: FemMember, L: number, N: number): Float64Array {
  const k = new Float64Array(144);
  if (N === 0) return k;
  const add = (r: number, c: number, v: number) => {
    k[r * 12 + c] += v;
    if (r !== c) k[c * 12 + r] += v;
  };
  const a = N / L;
  if (m.kind === 'truss') {
    for (const d of [1, 2]) {
      add(d, d, a);
      add(d + 6, d + 6, a);
      add(d, d + 6, -a);
    }
    return k;
  }
  // plan x-y : (uy_i, rz_i, uy_j, rz_j) = (1, 5, 7, 11)
  add(1, 1, (6 / 5) * a);
  add(1, 5, (L / 10) * a);
  add(1, 7, (-6 / 5) * a);
  add(1, 11, (L / 10) * a);
  add(5, 5, ((2 * L * L) / 15) * a);
  add(5, 7, (-L / 10) * a);
  add(5, 11, ((-L * L) / 30) * a);
  add(7, 7, (6 / 5) * a);
  add(7, 11, (-L / 10) * a);
  add(11, 11, ((2 * L * L) / 15) * a);
  // plan x-z : (uz_i, ry_i, uz_j, ry_j) = (2, 4, 8, 10)
  add(2, 2, (6 / 5) * a);
  add(2, 4, (-L / 10) * a);
  add(2, 8, (-6 / 5) * a);
  add(2, 10, (-L / 10) * a);
  add(4, 4, ((2 * L * L) / 15) * a);
  add(4, 8, (L / 10) * a);
  add(4, 10, ((-L * L) / 30) * a);
  add(8, 8, (6 / 5) * a);
  add(8, 10, (L / 10) * a);
  add(10, 10, ((2 * L * L) / 15) * a);
  // torsion (terme de Wagner, section doublement symétrique)
  const t = (N * (m.Iy + m.Iz)) / (m.A * L);
  add(3, 3, t);
  add(9, 9, t);
  add(3, 9, -t);
  return k;
}

// ─── liaisons d'extrémité : condensation statique ───

/** Ddl de la barre qui ne sont pas encastrés au nœud (relâchement ou ressort). */
function flexibleDofs(m: FemMember): Array<{ dof: number; k: number }> {
  const out: Array<{ dof: number; k: number }> = [];
  const ends: [EndSpec, EndSpec] = [m.endI ?? RIGID_END, m.endJ ?? RIGID_END];
  for (let e = 0; e < 2; e++)
    for (let d = 0; d < 6; d++) {
      // une barre articulée ne transmet que l'effort normal : les autres ddl n'ont pas de rigidité propre
      if (m.kind === 'truss' && d !== 0) continue;
      const spec: EndDof = ends[e][d];
      if (spec === 'rigid') continue;
      const k = spec === 'free' ? 0 : spec;
      if (!(k >= 0)) throw new FemError('invalid-model', `Barre ${m.id} : raideur de liaison invalide (${String(spec)})`);
      out.push({ dof: e * 6 + d, k });
    }
  return out;
}

export interface Condensed {
  /** rigidité 12 × 12 vue des nœuds (locale) */
  K: Float64Array;
  /** données de retour (null si toutes les extrémités sont encastrées) */
  flex: null | {
    dofs: Array<{ dof: number; k: number }>;
    /** K_ii⁻¹ (m × m) et K_ie (m × 12) */
    KiiInv: Float64Array;
    Kie: Float64Array;
    /** ddl internes rendus stables artificiellement (mécanisme propre à la barre, ex. torsion libre aux deux bouts) */
    regularized: number[];
  };
}

/** Inverse d'une matrice symétrique m × m par Gauss-Jordan ; les pivots nuls sont remplacés par une raideur très faible. */
function invertSym(a: Float64Array, m: number, scale: Float64Array): { inv: Float64Array; regularized: number[] } {
  const n2 = 2 * m;
  const w = new Float64Array(m * n2);
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < m; c++) w[r * n2 + c] = a[r * m + c];
    w[r * n2 + m + r] = 1;
  }
  const regularized: number[] = [];
  for (let c = 0; c < m; c++) {
    let p = c;
    for (let r = c + 1; r < m; r++) if (Math.abs(w[r * n2 + c]) > Math.abs(w[p * n2 + c])) p = r;
    if (Math.abs(w[p * n2 + c]) <= 1e-12 * scale[c]) {
      // aucune raideur sur ce ddl interne : on lui donne une raideur négligeable
      w[c * n2 + c] += 1e-9 * scale[c];
      p = c;
      regularized.push(c);
    }
    if (p !== c)
      for (let k = 0; k < n2; k++) {
        const t = w[c * n2 + k];
        w[c * n2 + k] = w[p * n2 + k];
        w[p * n2 + k] = t;
      }
    const piv = w[c * n2 + c];
    for (let k = 0; k < n2; k++) w[c * n2 + k] /= piv;
    for (let r = 0; r < m; r++) {
      if (r === c) continue;
      const f = w[r * n2 + c];
      if (f === 0) continue;
      for (let k = 0; k < n2; k++) w[r * n2 + k] -= f * w[c * n2 + k];
    }
  }
  const inv = new Float64Array(m * m);
  for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) inv[r * m + c] = w[r * n2 + m + c];
  return { inv, regularized };
}

/**
 * Rigidité de la barre vue des nœuds, liaisons d'extrémité comprises. Chaque ddl non encastré devient un ddl interne relié
 * au nœud par son ressort (raideur nulle = relâché), puis il est éliminé : K = Kee − Kei · Kii⁻¹ · Kie.
 */
export function condense(m: FemMember, Kb: Float64Array): Condensed {
  const dofs = flexibleDofs(m);
  if (!dofs.length) return { K: Kb, flex: null };
  const n = dofs.length;
  // ddl interne p ↔ ddl de barre dofs[p].dof ; les autres ddl de barre sont ceux du nœud
  const inner = new Int32Array(12).fill(-1);
  dofs.forEach((d, p) => (inner[d.dof] = p));
  const Kee = new Float64Array(144);
  const Kei = new Float64Array(12 * n);
  const Kii = new Float64Array(n * n);
  for (let r = 0; r < 12; r++)
    for (let c = 0; c < 12; c++) {
      const v = Kb[r * 12 + c];
      if (v === 0) continue;
      const pr = inner[r];
      const pc = inner[c];
      if (pr < 0 && pc < 0) Kee[r * 12 + c] += v;
      else if (pr < 0) Kei[r * n + pc] += v;
      else if (pc >= 0) Kii[pr * n + pc] += v;
      // (pr ≥ 0, pc < 0) : terme symétrique de Kei, déjà pris
    }
  for (let p = 0; p < n; p++) {
    const { dof, k } = dofs[p];
    Kee[dof * 12 + dof] += k;
    Kii[p * n + p] += k;
    Kei[dof * n + p] -= k;
  }
  const scale = new Float64Array(n);
  for (let p = 0; p < n; p++) scale[p] = Math.max(Math.abs(Kb[dofs[p].dof * 13]), dofs[p].k, 1e-6);
  const { inv, regularized } = invertSym(Kii, n, scale);
  // Kie = Keiᵀ ; X = Kii⁻¹ · Kie (n × 12)
  const X = new Float64Array(n * 12);
  for (let p = 0; p < n; p++)
    for (let c = 0; c < 12; c++) {
      let s = 0;
      for (let q = 0; q < n; q++) s += inv[p * n + q] * Kei[c * n + q];
      X[p * 12 + c] = s;
    }
  const K = Kee;
  for (let r = 0; r < 12; r++)
    for (let c = 0; c < 12; c++) {
      let s = 0;
      for (let p = 0; p < n; p++) s += Kei[r * n + p] * X[p * 12 + c];
      K[r * 12 + c] -= s;
    }
  const Kie = new Float64Array(n * 12);
  for (let p = 0; p < n; p++) for (let c = 0; c < 12; c++) Kie[p * 12 + c] = Kei[c * n + p];
  return { K, flex: { dofs, KiiInv: inv, Kie, regularized: regularized.map((p) => dofs[p].dof) } };
}

/** Charges équivalentes vues des nœuds (après condensation) : f = fe − Kei · Kii⁻¹ · fi. */
export function condenseLoads(c: Condensed, fb: Float64Array): Float64Array {
  if (!c.flex) return fb;
  const { dofs, KiiInv, Kie } = c.flex;
  const n = dofs.length;
  const fi = new Float64Array(n);
  const f = Float64Array.from(fb);
  dofs.forEach((d, p) => {
    fi[p] = fb[d.dof];
    f[d.dof] = 0; // la charge agit sur le ddl interne, pas sur le nœud
  });
  const y = new Float64Array(n);
  for (let p = 0; p < n; p++) {
    let s = 0;
    for (let q = 0; q < n; q++) s += KiiInv[p * n + q] * fi[q];
    y[p] = s;
  }
  // Kei = Kieᵀ
  for (let r = 0; r < 12; r++) {
    let s = 0;
    for (let p = 0; p < n; p++) s += Kie[p * 12 + r] * y[p];
    f[r] -= s;
  }
  return f;
}

/** Déplacements des ddl de la barre (côté barre des liaisons) à partir des déplacements des nœuds (locaux). */
export function innerDisplacements(c: Condensed, ue: Float64Array, fb: Float64Array): Float64Array {
  const ub = Float64Array.from(ue);
  if (!c.flex) return ub;
  const { dofs, KiiInv, Kie } = c.flex;
  const n = dofs.length;
  // ui = Kii⁻¹ (fi − Kie · ue)
  const rhs = new Float64Array(n);
  for (let p = 0; p < n; p++) {
    let s = fb[dofs[p].dof];
    for (let c2 = 0; c2 < 12; c2++) s -= Kie[p * 12 + c2] * ue[c2];
    rhs[p] = s;
  }
  for (let p = 0; p < n; p++) {
    let s = 0;
    for (let q = 0; q < n; q++) s += KiiInv[p * n + q] * rhs[q];
    ub[dofs[p].dof] = s;
  }
  return ub;
}

// ─── charges sur barre ───

const GAUSS4 = [
  [-0.8611363115940526, 0.3478548451374538],
  [-0.3399810435848563, 0.6521451548625461],
  [0.3399810435848563, 0.6521451548625461],
  [0.8611363115940526, 0.3478548451374538],
] as const;

/** Intégrale de Gauss à 4 points sur [a, b] (exacte jusqu'au degré 7). */
function gauss(a: number, b: number, f: (s: number) => number): number {
  const h = (b - a) / 2;
  const c = (a + b) / 2;
  let s = 0;
  for (const [x, w] of GAUSS4) s += w * f(c + h * x);
  return s * h;
}

/** Composantes locales (px, py, pz) d'une charge de direction donnée (valeur unitaire). */
function localDirection(dir: MemberLoad['dir'], R: Float64Array): Vec3 {
  switch (dir) {
    case 'x':
      return [1, 0, 0];
    case 'y':
      return [0, 1, 0];
    case 'z':
      return [0, 0, 1];
    default: {
      const g = dir === 'X' ? 0 : dir === 'Y' ? 1 : 2;
      return [R[g], R[3 + g], R[6 + g]];
    }
  }
}

/** Charge répartie décrite dans le repère local : p(s) = (px, py, pz) · q(s) sur [a, b]. */
interface LocalDistributed {
  a: number;
  b: number;
  dir: Vec3;
  q: (s: number) => number;
}

interface LocalPoint {
  a: number;
  P: Vec3;
}

export interface LocalLoads {
  distributed: LocalDistributed[];
  points: LocalPoint[];
}

/** Charges d'une barre exprimées dans son repère local. */
export function localLoads(loads: MemberLoad[], frame: LocalFrame, memberId: string): LocalLoads {
  const out: LocalLoads = { distributed: [], points: [] };
  const L = frame.L;
  for (const ld of loads) {
    const dir = localDirection(ld.dir, frame.R);
    if (ld.kind === 'point') {
      if (!(ld.a >= -1e-6 && ld.a <= L + 1e-6)) throw new FemError('invalid-model', `Barre ${memberId} : charge ponctuelle hors de la barre`);
      out.points.push({ a: Math.min(L, Math.max(0, ld.a)), P: [dir[0] * ld.P, dir[1] * ld.P, dir[2] * ld.P] });
      continue;
    }
    const a = Math.max(0, ld.a ?? 0);
    const b = Math.min(L, ld.b ?? L);
    if (b - a <= 1e-9) continue;
    const q1 = ld.q1;
    const q2 = ld.q2 ?? ld.q1;
    // charge par mm de projection horizontale → par mm de barre
    const f = ld.projected && ld.dir !== 'x' && ld.dir !== 'y' && ld.dir !== 'z' ? frame.horizontal / L : 1;
    const span = b - a;
    out.distributed.push({ a, b, dir, q: (s) => f * (q1 + ((q2 - q1) * (s - a)) / span) });
  }
  return out;
}

function hermite(xi: number, L: number): [number, number, number, number] {
  return [1 - 3 * xi * xi + 2 * xi ** 3, L * (xi - 2 * xi * xi + xi ** 3), 3 * xi * xi - 2 * xi ** 3, L * (-xi * xi + xi ** 3)];
}

/** Charges nodales équivalentes (locales, côté barre, avant condensation) : Σ Nᵀ p. */
export function equivalentLoads(m: FemMember, L: number, loads: LocalLoads): Float64Array {
  const f = new Float64Array(12);
  const truss = m.kind === 'truss';
  const addAt = (s: number, p: Vec3, w: number) => {
    const xi = s / L;
    f[0] += p[0] * (1 - xi) * w;
    f[6] += p[0] * xi * w;
    if (truss) {
      // barre articulée : la charge transversale descend aux nœuds comme sur une poutre sur deux appuis
      f[1] += p[1] * (1 - xi) * w;
      f[7] += p[1] * xi * w;
      f[2] += p[2] * (1 - xi) * w;
      f[8] += p[2] * xi * w;
      return;
    }
    const [h1, h2, h3, h4] = hermite(xi, L);
    f[1] += p[1] * h1 * w;
    f[5] += p[1] * h2 * w;
    f[7] += p[1] * h3 * w;
    f[11] += p[1] * h4 * w;
    f[2] += p[2] * h1 * w;
    f[4] -= p[2] * h2 * w;
    f[8] += p[2] * h3 * w;
    f[10] -= p[2] * h4 * w;
  };
  for (const pt of loads.points) addAt(pt.a, pt.P, 1);
  for (const d of loads.distributed) {
    const h = (d.b - d.a) / 2;
    const c = (d.a + d.b) / 2;
    for (const [x, w] of GAUSS4) {
      const s = c + h * x;
      const q = d.q(s);
      addAt(s, [d.dir[0] * q, d.dir[1] * q, d.dir[2] * q], w * h);
    }
  }
  return f;
}

// ─── efforts internes ───

/**
 * Efforts internes le long de la barre à partir des efforts d'extrémité en i (exercés par le nœud sur la barre) et des
 * charges : équilibre du tronçon [0, x]. Au 2ᵉ ordre, la flèche locale (interpolation d'Hermite des ddl de la barre)
 * ajoute l'effet P-δ de l'effort normal.
 */
export function stationForces(
  m: FemMember,
  L: number,
  endForces: Float64Array,
  loads: LocalLoads,
  ub: Float64Array | null,
  xs: number[],
): Station[] {
  const Fi: Vec3 = [endForces[0], endForces[1], endForces[2]];
  const Mi: Vec3 = [endForces[3], endForces[4], endForces[5]];
  const truss = m.kind === 'truss';
  const defl = (xi: number): [number, number] => {
    if (!ub || truss) return [0, 0];
    const [h1, h2, h3, h4] = hermite(xi, L);
    return [h1 * ub[1] + h2 * ub[5] + h3 * ub[7] + h4 * ub[11], h1 * ub[2] - h2 * ub[4] + h3 * ub[8] - h4 * ub[10]];
  };
  const [v0, w0] = defl(0);
  return xs.map((x) => {
    const F: Vec3 = [...Fi];
    const M: Vec3 = [...Mi];
    const [vx, wx] = defl(x / L);
    // effort en i ramené au point de la section (bras (−x, v_i − v(x), w_i − w(x)))
    const r: Vec3 = [-x, v0 - vx, w0 - wx];
    M[0] += r[1] * Fi[2] - r[2] * Fi[1];
    M[1] += r[2] * Fi[0] - r[0] * Fi[2];
    M[2] += r[0] * Fi[1] - r[1] * Fi[0];
    const addForce = (s: number, p: Vec3, w: number) => {
      F[0] += p[0] * w;
      F[1] += p[1] * w;
      F[2] += p[2] * w;
      // bras (s − x, 0, 0)
      M[1] -= (s - x) * p[2] * w;
      M[2] += (s - x) * p[1] * w;
    };
    // effort juste à gauche de la section : une charge ponctuelle située sur la section n'est pas comptée
    for (const pt of loads.points) if (pt.a < x - 1e-9) addForce(pt.a, pt.P, 1);
    for (const d of loads.distributed) {
      const b = Math.min(d.b, x);
      if (b <= d.a) continue;
      for (let k = 0; k < 3; k++) {
        if (!d.dir[k]) continue;
        const p: Vec3 = [0, 0, 0];
        p[k] = d.dir[k];
        const total = gauss(d.a, b, d.q);
        const moment = gauss(d.a, b, (s) => (s - x) * d.q(s));
        F[k] += p[k] * total;
        if (k === 2) M[1] -= p[2] * moment;
        if (k === 1) M[2] += p[1] * moment;
      }
    }
    // efforts exercés sur la partie gauche par la partie droite = −(somme des actions sur la partie gauche) ;
    // My est compté positif quand la fibre −z est tendue (moment positif en travée pour z local vers le haut)
    return truss
      ? { x, N: -F[0], Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 }
      : { x, N: -F[0], Vy: -F[1], Vz: -F[2], T: -M[0], My: M[1], Mz: -M[2] };
  });
}

// ─── changement de repère ───

/** Matrice 12 × 12 locale → globale : Kg = Tᵀ K T (T = diag(R, R, R, R)). */
export function toGlobal(K: Float64Array, R: Float64Array): Float64Array {
  const out = new Float64Array(144);
  // blocs 3 × 3 : out_ab = Rᵀ K_ab R
  const tmp = new Float64Array(9);
  for (let bi = 0; bi < 4; bi++)
    for (let bj = 0; bj < 4; bj++) {
      const r0 = bi * 3;
      const c0 = bj * 3;
      // tmp = K_ab R
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let k = 0; k < 3; k++) s += K[(r0 + r) * 12 + c0 + k] * R[k * 3 + c];
          tmp[r * 3 + c] = s;
        }
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          let s = 0;
          for (let k = 0; k < 3; k++) s += R[k * 3 + r] * tmp[k * 3 + c];
          out[(r0 + r) * 12 + c0 + c] = s;
        }
    }
  return out;
}

/** Vecteur 12 local → global (fᵍ = Tᵀ f). */
export function vecToGlobal(f: Float64Array, R: Float64Array): Float64Array {
  const out = new Float64Array(12);
  for (let b = 0; b < 4; b++)
    for (let c = 0; c < 3; c++) out[b * 3 + c] = R[c] * f[b * 3] + R[3 + c] * f[b * 3 + 1] + R[6 + c] * f[b * 3 + 2];
  return out;
}

/** Vecteur 12 global → local (f = T fᵍ). */
export function vecToLocal(g: ArrayLike<number>, R: Float64Array): Float64Array {
  const out = new Float64Array(12);
  for (let b = 0; b < 4; b++)
    for (let r = 0; r < 3; r++) out[b * 3 + r] = R[r * 3] * g[b * 3] + R[r * 3 + 1] * g[b * 3 + 1] + R[r * 3 + 2] * g[b * 3 + 2];
  return out;
}
