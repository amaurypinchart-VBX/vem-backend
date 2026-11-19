// Plans de production (A. Pinchart 19.11.2026 : « une extension qui crée des plans de production : chaque pièce, son
// type, sa largeur, son épaisseur, où la couper, où forer, visser, préforer et tarauder ») — lecture d'une pièce
// dessinée, fonctions pures sur ses triangles (positions monde à plat, mm) :
// - repère de la pièce : les axes de sa Viewbox (u = la plus grande étendue, v, w = la plus petite, repère direct) ;
// - nature : profil (long), plaque / panneau (mince), bloc ;
// - perçages : surfaces cylindriques fermées (≥ 260° de tour) dont les normales regardent l'axe — diamètre, axe, position
//   depuis le coin de la pièce, profondeur ; un même trou à travers deux parois (tube) = un perçage « 2 parois » ;
// - taraudage proposé : un trou au diamètre intérieur d'un filetage ISO (export Inventor : filet cosmétique) ou au
//   diamètre de perçage avant taraudage ⇒ « M8 » à confirmer ; sinon « Ø10 » ;
// - coupe des extrémités d'un profil : angle du plan de coupe (90° = coupe droite).
// La géométrie ne dit ni la matière, ni la finition, ni les soudures : ce sont des champs à remplir sur la planche.

import type { HoleSpec } from './holeSpecs';
export type V3 = [number, number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Repère de la pièce (monde) : origine = coin min de sa boîte dans ces axes ; u ≥ v ≥ w en étendue ; w = u × v. */
export interface PartFrame {
  origin: V3;
  u: V3;
  v: V3;
  w: V3;
}

export type PartAxis = 'u' | 'v' | 'w';

export interface Thread {
  /** « M8 » */
  name: string;
  pitch: number;
  /** comment on l'a reconnu */
  from: 'minor' | 'tapDrill';
}

export interface Hole {
  /** axe du perçage dans le repère de la pièce */
  axis: PartAxis;
  /** centre (repère de la pièce, mm depuis son coin) : milieu de la profondeur percée */
  c: V3;
  /** diamètre mesuré (mm) */
  d: number;
  /** étendue percée le long de l'axe (mm, toutes parois) */
  depth: number;
  /** parois traversées (un tube percé de part en part : 2) */
  walls: number;
  thread?: Thread;
  /** choix fait dans l'application (perçage, taraudage, fraisage…), voir holeSpecs.ts */
  spec?: HoleSpec;
}

export type PartKind = 'profile' | 'plate' | 'block';

export interface PartGeometry {
  kind: PartKind;
  frame: PartFrame;
  /** étendues le long de u, v, w (mm) */
  size: V3;
  holes: Hole[];
  /** solides séparés (une pièce soudée de plusieurs morceaux > 1) */
  solids: number;
  /** angle de coupe à chaque extrémité d'un profil (°, 90 = coupe droite), début puis fin le long de u */
  ends?: [number, number];
  /** volume (mm³) quand la pièce est fermée */
  volume: number;
}

// ─── filetages ISO (pas gros) : diamètre intérieur D1 (filet cosmétique d'Inventor) et perçage avant taraudage ───

export const ISO: Array<{ m: number; p: number; d1: number; drill: number }> = [
  { m: 3, p: 0.5, d1: 2.459, drill: 2.5 },
  { m: 4, p: 0.7, d1: 3.242, drill: 3.3 },
  { m: 5, p: 0.8, d1: 4.134, drill: 4.2 },
  { m: 6, p: 1, d1: 4.917, drill: 5 },
  { m: 8, p: 1.25, d1: 6.647, drill: 6.8 },
  { m: 10, p: 1.5, d1: 8.376, drill: 8.5 },
  { m: 12, p: 1.75, d1: 10.106, drill: 10.2 },
  { m: 14, p: 2, d1: 11.835, drill: 12 },
  { m: 16, p: 2, d1: 13.835, drill: 14 },
  { m: 20, p: 2.5, d1: 17.294, drill: 17.5 },
  { m: 24, p: 3, d1: 20.752, drill: 21 },
];

/**
 * Taraudage proposé pour un trou de diamètre `d` : diamètre intérieur ISO à ± 0,06 mm (Inventor exporte un trou taraudé
 * à ce diamètre), sinon perçage avant taraudage à ± 0,04 mm (un trou de 10,2 dessiné = M12). Rien sinon : un Ø10 reste
 * un perçage Ø10.
 */
export function threadFor(d: number): Thread | undefined {
  for (const t of ISO) if (Math.abs(d - t.d1) <= 0.06) return { name: `M${t.m}`, pitch: t.p, from: 'minor' };
  for (const t of ISO) if (Math.abs(d - t.drill) <= 0.04 && !Number.isInteger(t.drill)) return { name: `M${t.m}`, pitch: t.p, from: 'tapDrill' };
  return undefined;
}

/** Diamètre affiché : au dixième, entier quand il en est à moins de 0,35 mm (facettes du cylindre). */
export function niceDiameter(d: number): number {
  const r = Math.round(d);
  return Math.abs(d - r) <= 0.35 ? r : Math.round(d * 10) / 10;
}

/** « M8×1.25 », « Ø10 », « Ø6.6 ». */
export function holeName(h: Pick<Hole, 'd' | 'thread'>): string {
  if (h.thread) return `${h.thread.name}×${h.thread.pitch}`;
  return `Ø${niceDiameter(h.d)}`;
}

// ─── repère ───

/** Repère de la pièce à partir de 3 axes candidats (ceux de sa Viewbox) : triés par étendue, repère direct. */
export function partFrame(pos: ArrayLike<number>, axes: [V3, V3, V3]): { frame: PartFrame; size: V3 } {
  const ext = axes.map((a) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      const d = a[0] * pos[i] + a[1] * pos[i + 1] + a[2] * pos[i + 2];
      if (d < lo) lo = d;
      if (d > hi) hi = d;
    }
    return { a: norm(a), lo, hi, e: hi - lo };
  });
  const order = [0, 1, 2].sort((i, j) => ext[j].e - ext[i].e || i - j);
  const u = ext[order[0]].a;
  const v = ext[order[1]].a;
  let w = ext[order[2]].a;
  if (dot(cross(u, v), w) < 0) w = neg(w);
  const lo = (ax: V3) => {
    let m = Infinity;
    for (let i = 0; i < pos.length; i += 3) m = Math.min(m, ax[0] * pos[i] + ax[1] * pos[i + 1] + ax[2] * pos[i + 2]);
    return m;
  };
  const [lu, lv, lw] = [lo(u), lo(v), lo(w)];
  const origin: V3 = [u[0] * lu + v[0] * lv + w[0] * lw, u[1] * lu + v[1] * lv + w[1] * lw, u[2] * lu + v[2] * lv + w[2] * lw];
  return { frame: { origin, u, v, w }, size: [ext[order[0]].e, ext[order[1]].e, ext[order[2]].e] };
}

/** Positions monde → repère de la pièce (mm depuis son coin). */
export function toLocal(pos: ArrayLike<number>, f: PartFrame): Float64Array {
  const out = new Float64Array(pos.length);
  for (let i = 0; i < pos.length; i += 3) {
    const p: V3 = [pos[i] - f.origin[0], pos[i + 1] - f.origin[1], pos[i + 2] - f.origin[2]];
    out[i] = dot(p, f.u);
    out[i + 1] = dot(p, f.v);
    out[i + 2] = dot(p, f.w);
  }
  return out;
}

/** Point du repère de la pièce → monde. */
export function toWorld(f: PartFrame, p: V3): V3 {
  return [
    f.origin[0] + f.u[0] * p[0] + f.v[0] * p[1] + f.w[0] * p[2],
    f.origin[1] + f.u[1] * p[0] + f.v[1] * p[1] + f.w[1] * p[2],
    f.origin[2] + f.u[2] * p[0] + f.v[2] * p[1] + f.w[2] * p[2],
  ];
}

export function axisVector(f: PartFrame, a: PartAxis): V3 {
  return a === 'u' ? f.u : a === 'v' ? f.v : f.w;
}

// ─── nature ───

export function partKind(size: V3): PartKind {
  const [L, B, T] = size;
  if (T <= 120 && B >= 4 * T && L >= B) return L >= 3 * B && B < 400 ? 'profile' : 'plate';
  if (L >= 3 * B) return 'profile';
  return 'block';
}

// ─── triangles ───

interface Tri {
  p: [V3, V3, V3];
  n: V3;
  area: number;
}

function triangles(local: ArrayLike<number>): Tri[] {
  const out: Tri[] = [];
  for (let i = 0; i + 8 < local.length; i += 9) {
    const a: V3 = [local[i], local[i + 1], local[i + 2]];
    const b: V3 = [local[i + 3], local[i + 4], local[i + 5]];
    const c: V3 = [local[i + 6], local[i + 7], local[i + 8]];
    const n = cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]);
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) continue;
    out.push({ p: [a, b, c], n: [n[0] / l, n[1] / l, n[2] / l], area: l / 2 });
  }
  return out;
}

/** Volume signé (fermé et bien orienté : > 0). */
function signedVolume(tris: Tri[]): number {
  let v = 0;
  for (const t of tris) v += dot(t.p[0], cross(t.p[1], t.p[2])) / 6;
  return v;
}

const key = (p: V3) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)},${Math.round(p[2] * 20)}`;

/** Composantes connexes (sommets partagés à 0,05 mm). */
function connected(ids: number[], tris: Tri[]): number[][] {
  const parent = new Map<number, number>(ids.map((i) => [i, i]));
  const find = (i: number): number => {
    let r = i;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = i;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const byVertex = new Map<string, number>();
  for (const i of ids)
    for (const p of tris[i].p) {
      const k = key(p);
      const j = byVertex.get(k);
      if (j === undefined) byVertex.set(k, i);
      else parent.set(find(i), find(j));
    }
  const groups = new Map<number, number[]>();
  for (const i of ids) {
    const r = find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  }
  return [...groups.values()];
}

/** Cercle des moindres carrés (Kåsa) d'un nuage 2D. */
export function fitCircle(pts: Array<[number, number]>): { cx: number; cy: number; r: number; err: number } | null {
  const n = pts.length;
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (const [x, y] of pts) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;
  let suu = 0;
  let svv = 0;
  let suv = 0;
  let suuu = 0;
  let svvv = 0;
  let suvv = 0;
  let svuu = 0;
  for (const [x, y] of pts) {
    const u = x - mx;
    const v = y - my;
    suu += u * u;
    svv += v * v;
    suv += u * v;
    suuu += u * u * u;
    svvv += v * v * v;
    suvv += u * v * v;
    svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-12) return null;
  const b1 = (suuu + suvv) / 2;
  const b2 = (svvv + svuu) / 2;
  const uc = (b1 * svv - b2 * suv) / det;
  const vc = (suu * b2 - suv * b1) / det;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  let err = 0;
  for (const [x, y] of pts) err = Math.max(err, Math.abs(Math.hypot(x - mx - uc, y - my - vc) - r));
  return { cx: uc + mx, cy: vc + my, r, err };
}

const AXES: PartAxis[] = ['u', 'v', 'w'];

/**
 * Perçages d'une pièce (positions dans son repère, mm) : pour chaque axe, les facettes parallèles à l'axe et étroites
 * (≤ 40 mm de large en travers) sont regroupées par sommets partagés ; un groupe est un trou quand ses sommets sont sur
 * un cercle (écart ≤ 3 % du rayon, 0,3 mm), qu'il fait au moins 260° du tour et que ses normales regardent le centre.
 * `orientation` = signe du volume de la pièce (−1 : faces retournées dans SketchUp).
 */
export function detectHoles(local: ArrayLike<number>, orientation = 1): Hole[] {
  const tris = triangles(local);
  const raw: Hole[] = [];
  AXES.forEach((axis, ai) => {
    const [i1, i2] = [0, 1, 2].filter((k) => k !== ai);
    const cand: number[] = [];
    tris.forEach((t, i) => {
      if (Math.abs(t.n[ai]) > 0.1) return;
      const xs = t.p.map((p) => p[i1]);
      const ys = t.p.map((p) => p[i2]);
      if (Math.max(...xs) - Math.min(...xs) > 40 || Math.max(...ys) - Math.min(...ys) > 40) return;
      cand.push(i);
    });
    for (const g of connected(cand, tris)) {
      if (g.length < 4) continue;
      const seen = new Set<string>();
      const pts: Array<[number, number]> = [];
      let lo = Infinity;
      let hi = -Infinity;
      for (const i of g)
        for (const p of tris[i].p) {
          lo = Math.min(lo, p[ai]);
          hi = Math.max(hi, p[ai]);
          const k = `${Math.round(p[i1] * 20)},${Math.round(p[i2] * 20)}`;
          if (!seen.has(k)) seen.add(k), pts.push([p[i1], p[i2]]);
        }
      if (pts.length < 6) continue;
      const c = fitCircle(pts);
      if (!c || c.r < 0.8 || c.r > 120 || c.err > Math.max(0.3, 0.03 * c.r)) continue;
      // tour couvert : plus grand écart angulaire entre sommets ≤ 100°
      const ang = pts.map(([x, y]) => Math.atan2(y - c.cy, x - c.cx)).sort((a, b) => a - b);
      let gap = ang[0] + 2 * Math.PI - ang[ang.length - 1];
      for (let k = 1; k < ang.length; k++) gap = Math.max(gap, ang[k] - ang[k - 1]);
      if (gap > (100 * Math.PI) / 180) continue;
      // normales vers le centre (trou) et pas vers l'extérieur (rond, tube, pion)
      let inward = 0;
      for (const i of g) {
        const t = tris[i];
        const mx = (t.p[0][i1] + t.p[1][i1] + t.p[2][i1]) / 3 - c.cx;
        const my = (t.p[0][i2] + t.p[1][i2] + t.p[2][i2]) / 3 - c.cy;
        inward += -(t.n[i1] * mx + t.n[i2] * my) * t.area;
      }
      if (inward * orientation <= 0) continue;
      // alésage d'un tube (le long de la pièce, bien plus profond que large) : ce n'est pas un perçage
      if (hi - lo > Math.max(50, 4 * 2 * c.r)) continue;
      const center: V3 = [0, 0, 0];
      center[ai] = (lo + hi) / 2;
      center[i1] = c.cx;
      center[i2] = c.cy;
      raw.push({ axis, c: center, d: 2 * c.r, depth: hi - lo, walls: 1 });
    }
  });
  // même trou à travers plusieurs parois (même axe, même centre en travers, même diamètre) : un seul perçage
  const out: Array<Hole & { lo: number; hi: number }> = [];
  for (const h of raw.sort((a, b) => a.c[AXES.indexOf(a.axis)] - b.c[AXES.indexOf(b.axis)])) {
    const ai = AXES.indexOf(h.axis);
    const [i1, i2] = [0, 1, 2].filter((k) => k !== ai);
    const lo = h.c[ai] - h.depth / 2;
    const hi = h.c[ai] + h.depth / 2;
    const same = out.find((o) => o.axis === h.axis && Math.abs(o.c[i1] - h.c[i1]) < 0.5 && Math.abs(o.c[i2] - h.c[i2]) < 0.5 && Math.abs(o.d - h.d) < 0.3);
    if (same) {
      same.lo = Math.min(same.lo, lo);
      same.hi = Math.max(same.hi, hi);
      same.walls++;
      same.c[ai] = (same.lo + same.hi) / 2;
      same.depth = same.hi - same.lo;
    } else out.push({ ...h, c: [...h.c] as V3, lo, hi });
  }
  return out.map(({ lo: _lo, hi: _hi, ...h }) => {
    const t = threadFor(h.d);
    return t ? { ...h, thread: t } : h;
  });
}

/**
 * Angle de coupe de chaque extrémité d'un profil (°) : normale moyenne (pondérée par l'aire) des faces tournées vers
 * l'extrémité qui la touchent ; 90° = coupe droite, 45° = coupe d'onglet.
 */
export function endCuts(local: ArrayLike<number>, length: number): [number, number] {
  const tris = triangles(local);
  const at = (sign: 1 | -1) => {
    let nx = 0;
    let n2 = 0;
    for (const t of tris) {
      // faces de coupe : tournées vers l'extrémité et qui la touchent (une coupe d'onglet la touche par sa pointe)
      const touches = t.p.some((p) => (sign < 0 ? p[0] <= 1 : p[0] >= length - 1));
      if (!touches || t.n[0] * sign < 0.3) continue;
      nx += Math.abs(t.n[0]) * t.area;
      n2 += Math.hypot(t.n[1], t.n[2]) * t.area;
    }
    if (nx + n2 <= 0) return 90;
    const a = (Math.atan2(nx, n2) * 180) / Math.PI;
    return a >= 89.5 ? 90 : Math.round(a * 10) / 10;
  };
  return [at(-1), at(1)];
}

/** Nombre de solides séparés (sommets partagés). */
export function solidCount(local: ArrayLike<number>): number {
  const tris = triangles(local);
  const groups = connected(
    tris.map((_, i) => i),
    tris,
  );
  // les petits morceaux (parois de trous exportées à part, ≤ 50 triangles et ≤ 60 mm) ne sont pas des solides
  return groups.filter((g) => {
    if (g.length > 50) return true;
    let lo: V3 = [Infinity, Infinity, Infinity];
    let hi: V3 = [-Infinity, -Infinity, -Infinity];
    for (const i of g)
      for (const p of tris[i].p) {
        lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1]), Math.min(lo[2], p[2])];
        hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1]), Math.max(hi[2], p[2])];
      }
    return Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) > 60;
  }).length;
}

/** Lecture complète d'une pièce (positions monde à plat, axes de sa Viewbox). */
export function analyzePart(pos: ArrayLike<number>, axes: [V3, V3, V3]): PartGeometry {
  const { frame, size } = partFrame(pos, axes);
  const local = toLocal(pos, frame);
  const tris = triangles(local);
  const vol = signedVolume(tris);
  const kind = partKind(size);
  const holes = detectHoles(local, vol < 0 ? -1 : 1);
  return {
    kind,
    frame,
    size,
    holes,
    solids: Math.max(1, solidCount(local)),
    ...(kind === 'profile' ? { ends: endCuts(local, size[0]) } : {}),
    volume: Math.abs(vol),
  };
}
