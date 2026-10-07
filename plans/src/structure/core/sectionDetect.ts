// Relevé d'une barre dessinée dans SketchUp (S12.5) : composantes connexes d'un maillage, axe de la barre (boîte
// orientée par analyse en composantes principales), coupe exacte par un plan perpendiculaire à l'axe (25 / 50 / 75 %),
// forme (tube, I, U / C, L, T, plat, plein, rond) et dimensions mesurées, propriétés calculées sur le contour réel,
// rapprochement du catalogue du commerce. Aucune donnée n'est « connue » sans validation humaine. Fonctions pures ;
// mm, triangles à plat (x0, y0, z0, x1, …).
import type { BucklingCurve, Section } from './catalog';
import { chs, rhs } from './catalog';
import type { SectionEntry } from './library';
import { polygonProps } from './sectionGeometry';
import type { CatalogFamily } from './sectionCatalog';
import { familySections } from './sectionCatalog';

export type V3 = [number, number, number];
export type Pt = [number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Solides séparés d'un maillage : triangles reliés par des sommets communs (à `tol` près). */
export function components(pos: ArrayLike<number>, tol = 0.5): Float32Array[] {
  const nTri = Math.floor(pos.length / 9);
  const parent = Array.from({ length: nTri }, (_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  const owner = new Map<string, number>();
  const key = (x: number, y: number, z: number) => `${Math.round(x / tol)}|${Math.round(y / tol)}|${Math.round(z / tol)}`;
  for (let t = 0; t < nTri; t++)
    for (let i = 0; i < 3; i++) {
      const k = key(pos[9 * t + 3 * i], pos[9 * t + 3 * i + 1], pos[9 * t + 3 * i + 2]);
      const o = owner.get(k);
      if (o === undefined) owner.set(k, t);
      else parent[find(t)] = find(o);
    }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < nTri; t++) {
    const r = find(t);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(t);
  }
  return [...groups.values()].map((ts) => {
    const out = new Float32Array(ts.length * 9);
    ts.forEach((t, k) => {
      for (let j = 0; j < 9; j++) out[9 * k + j] = pos[9 * t + j];
    });
    return out;
  });
}

/** Valeurs et vecteurs propres d'une matrice symétrique 3 × 3 (Jacobi), triés par valeur décroissante. */
function eigen3(m: number[][]): { values: number[]; vectors: V3[] } {
  const a = m.map((r) => [...r]);
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0;
    for (let p = 0; p < 3; p++) for (let q = p + 1; q < 3; q++) off += a[p][q] ** 2;
    if (off < 1e-18) break;
    for (let p = 0; p < 3; p++)
      for (let q = p + 1; q < 3; q++) {
        if (Math.abs(a[p][q]) < 1e-30) continue;
        const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
  }
  const order = [0, 1, 2].sort((x, y) => a[y][y] - a[x][x]);
  return { values: order.map((i) => a[i][i]), vectors: order.map((i) => norm([v[0][i], v[1][i], v[2][i]])) };
}

export interface BarAxis {
  /** extrémités sur l'axe, au centre de la boîte orientée (mm) */
  a: V3;
  b: V3;
  dir: V3;
  length: number;
  /** axes de la boîte orientée (le premier = axe de la barre) et étendues le long de chacun */
  axes: [V3, V3, V3];
  extents: [number, number, number];
  /** longueur / plus grande dimension transverse > 3 */
  elongated: boolean;
}

/** Boîte orientée d'un maillage : axes principaux des sommets, l'axe le plus long en premier ; axes du module privilégiés. */
export function barAxis(pos: ArrayLike<number>): BarAxis {
  const n = pos.length / 3;
  const seen = new Set<string>();
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const p: V3 = [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]];
    const k = `${Math.round(p[0] * 10)}|${Math.round(p[1] * 10)}|${Math.round(p[2] * 10)}`;
    if (!seen.has(k)) seen.add(k), pts.push(p);
  }
  const extentsOn = (axes: V3[]) =>
    axes.map((ax) => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const p of pts) {
        const d = dot(p, ax);
        if (d < lo) lo = d;
        if (d > hi) hi = d;
      }
      return [lo, hi] as [number, number];
    });
  // barre alignée sur les axes du module (cas courant) : boîte du module, sinon composantes principales
  const world: V3[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const ew = extentsOn(world);
  const c: V3 = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
  const cov = [0, 1, 2].map((i) => [0, 1, 2].map((j) => pts.reduce((s, p) => s + (p[i] - c[i]) * (p[j] - c[j]), 0) / pts.length));
  const { vectors } = eigen3(cov);
  const ep = extentsOn(vectors);
  const vol = (e: Array<[number, number]>) => e.reduce((s, [lo, hi]) => s * Math.max(1e-6, hi - lo), 1);
  // la boîte la plus petite (avec 2 % de préférence aux axes du module)
  const useWorld = vol(ew) <= vol(ep) * 1.02;
  let axes = useWorld ? world : vectors;
  let ext = useWorld ? ew : ep;
  const order = [0, 1, 2].sort((x, y) => ext[y][1] - ext[y][0] - (ext[x][1] - ext[x][0]));
  axes = order.map((i) => axes[i]);
  ext = order.map((i) => ext[i]);
  const mid = (k: number) => (ext[k][0] + ext[k][1]) / 2;
  const centre = add(add(mul(axes[0], mid(0)), mul(axes[1], mid(1))), mul(axes[2], mid(2)));
  const L = ext[0][1] - ext[0][0];
  const a = add(centre, mul(axes[0], -L / 2));
  const b = add(centre, mul(axes[0], L / 2));
  const extents = ext.map(([lo, hi]) => hi - lo) as [number, number, number];
  return { a, b, dir: axes[0], length: L, axes: axes as [V3, V3, V3], extents, elongated: L > 3 * extents[1] };
}

/** Coupe d'un maillage par le plan (origine, normale n) : boucles fermées dans le repère (y, z) du plan. */
export function sliceLoops(pos: ArrayLike<number>, origin: V3, n: V3, y: V3, z: V3, tol = 0.2): Pt[][] {
  const segs: Array<[Pt, Pt]> = [];
  const nTri = Math.floor(pos.length / 9);
  const P = (t: number, i: number): V3 => [pos[9 * t + 3 * i], pos[9 * t + 3 * i + 1], pos[9 * t + 3 * i + 2]];
  const to2 = (p: V3): Pt => {
    const d = sub(p, origin);
    return [dot(d, y), dot(d, z)];
  };
  for (let t = 0; t < nTri; t++) {
    const v = [P(t, 0), P(t, 1), P(t, 2)];
    const d = v.map((p) => dot(sub(p, origin), n));
    const pts: Pt[] = [];
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      if (d[i] > 0 === d[j] > 0) continue;
      const s = d[i] / (d[i] - d[j]);
      pts.push(to2(add(v[i], mul(sub(v[j], v[i]), s))));
    }
    if (pts.length === 2 && Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]) > 1e-6) segs.push([pts[0], pts[1]]);
  }
  // chaînage par extrémités communes
  const key = (p: Pt) => `${Math.round(p[0] / tol)}|${Math.round(p[1] / tol)}`;
  const at = new Map<string, number[]>();
  segs.forEach(([p, q], k) => {
    for (const e of [p, q]) {
      const kk = key(e);
      if (!at.has(kk)) at.set(kk, []);
      at.get(kk)!.push(k);
    }
  });
  const used = new Set<number>();
  const loops: Pt[][] = [];
  for (let k = 0; k < segs.length; k++) {
    if (used.has(k)) continue;
    used.add(k);
    const loop: Pt[] = [segs[k][0], segs[k][1]];
    for (let guard = 0; guard < segs.length; guard++) {
      const end = loop[loop.length - 1];
      const next = (at.get(key(end)) ?? []).find((s) => !used.has(s));
      if (next === undefined) break;
      used.add(next);
      const [p, q] = segs[next];
      loop.push(key(p) === key(end) ? q : p);
    }
    if (loop.length >= 4 && key(loop[0]) === key(loop[loop.length - 1])) loops.push(loop.slice(0, -1));
  }
  return loops;
}

const area = (p: Pt[]) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const [a, b] = [p[i], p[(i + 1) % p.length]];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

const inside = (pt: Pt, poly: Pt[]) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

/** Longueur de la coupe d'un contour (+ trous) par une droite y = c (axis 0) ou z = c (axis 1). */
function chord(loops: Pt[][], axis: 0 | 1, c: number): number {
  const o = axis === 0 ? 1 : 0;
  let total = 0;
  for (const loop of loops) {
    const xs: number[] = [];
    for (let i = 0; i < loop.length; i++) {
      const [p, q] = [loop[i], loop[(i + 1) % loop.length]];
      if (p[axis] > c !== q[axis] > c) xs.push(p[o] + ((q[o] - p[o]) * (c - p[axis])) / (q[axis] - p[axis]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) total += xs[i + 1] - xs[i];
  }
  return total;
}

/** Nombre de traversées de matière d'une droite y = c (axis 0) ou z = c (axis 1). */
function intervals(loops: Pt[][], axis: 0 | 1, c: number): number {
  let n = 0;
  for (const loop of loops)
    for (let i = 0; i < loop.length; i++) {
      const [p, q] = [loop[i], loop[(i + 1) % loop.length]];
      if (p[axis] > c !== q[axis] > c) n++;
    }
  return n / 2;
}

/** Position moyenne de la matière le long d'une coupe y = c (axis 0) ou z = c (axis 1). */
function chordCentre(loops: Pt[][], axis: 0 | 1, c: number): number {
  const o = axis === 0 ? 1 : 0;
  let s = 0;
  let w = 0;
  for (const loop of loops) {
    const xs: number[] = [];
    for (let i = 0; i < loop.length; i++) {
      const [p, q] = [loop[i], loop[(i + 1) % loop.length]];
      if (p[axis] > c !== q[axis] > c) xs.push(p[o] + ((q[o] - p[o]) * (c - p[axis])) / (q[axis] - p[axis]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      s += ((xs[i] + xs[i + 1]) / 2) * (xs[i + 1] - xs[i]);
      w += xs[i + 1] - xs[i];
    }
  }
  return w ? s / w : 0;
}

export type DetectedShape = 'tube-rect' | 'tube-round' | 'I' | 'U' | 'L' | 'T' | 'flat' | 'solid-rect' | 'round' | 'other';

export interface DetectedSection {
  shape: DetectedShape;
  /** h = hauteur selon l'âme (ou la plus grande), b = largeur, t / tw / tf épaisseurs, d diamètre (mm) */
  dims: { h: number; b: number; t?: number; tw?: number; tf?: number; d?: number };
  /** propriétés dans le repère de la coupe (y horizontal ⟂ axe, z vers le haut du module) */
  props: Pick<Section, 'A' | 'Iy' | 'Iz' | 'It' | 'Wely' | 'Welz' | 'Wply' | 'Wplz'>;
  /** centre de gravité dans le repère de la coupe */
  centroid: Pt;
  /** âme (ou grand côté) le long de z (sur chant) ou de y (à plat) */
  webAlong: 'z' | 'y';
  /** ouverture d'un U / C : vers +y, −y, +z, −z (null sinon) */
  opening: '+y' | '-y' | '+z' | '-z' | null;
  outer: Pt[];
  holes: Pt[][];
  /** tube ouvert par une fente (torsion d'un profil ouvert) */
  slotted?: boolean;
}

/** Forme, dimensions et propriétés d'une coupe (boucles fermées). null si rien d'exploitable. */
export function analyzeSection(loops: Pt[][]): DetectedSection | null {
  if (!loops.length) return null;
  const sorted = [...loops].sort((a, b) => Math.abs(area(b)) - Math.abs(area(a)));
  const outer = area(sorted[0]) < 0 ? [...sorted[0]].reverse() : sorted[0];
  const holes = sorted.slice(1).filter((h) => inside(h[0], outer)).map((h) => (area(h) > 0 ? [...h].reverse() : h));
  const all = [outer, ...holes];
  // moments additifs (trous en sens inverse)
  let A = 0;
  let Sy = 0;
  let Sz = 0;
  for (const p of all)
    for (let i = 0; i < p.length; i++) {
      const [a, b] = [p[i], p[(i + 1) % p.length]];
      const c = a[0] * b[1] - b[0] * a[1];
      A += c / 2;
      Sy += ((a[0] + b[0]) * c) / 6;
      Sz += ((a[1] + b[1]) * c) / 6;
    }
  if (A <= 1) return null;
  const yc = Sy / A;
  const zc = Sz / A;
  let Iyy = 0;
  let Izz = 0;
  for (const p of all)
    for (let i = 0; i < p.length; i++) {
      const a: Pt = [p[i][0] - yc, p[i][1] - zc];
      const b: Pt = [p[(i + 1) % p.length][0] - yc, p[(i + 1) % p.length][1] - zc];
      const c = a[0] * b[1] - b[0] * a[1];
      Iyy += ((a[1] * a[1] + a[1] * b[1] + b[1] * b[1]) * c) / 12;
      Izz += ((a[0] * a[0] + a[0] * b[0] + b[0] * b[0]) * c) / 12;
    }
  const ys = outer.map((p) => p[0]);
  const zs = outer.map((p) => p[1]);
  const [y0, y1, z0, z1] = [Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)];
  const W = y1 - y0;
  const H = z1 - z0;
  const zmax = Math.max(z1 - zc, zc - z0);
  const ymax = Math.max(y1 - yc, yc - y0);
  const perimeter = all.reduce((s, p) => s + p.reduce((t, q, i) => t + Math.hypot(p[(i + 1) % p.length][0] - q[0], p[(i + 1) % p.length][1] - q[1]), 0), 0);
  let shape: DetectedShape = 'other';
  let dims: DetectedSection['dims'] = { h: Math.max(W, H), b: Math.min(W, H) };
  let webAlong: 'z' | 'y' = H >= W ? 'z' : 'y';
  let opening: DetectedSection['opening'] = null;
  let slotted = false;
  // plastique : contour seul (sections ouvertes), élastique pour les tubes (prudent)
  const open = holes.length === 0 ? polygonProps(outer) : null;
  let It = 0;
  const circular = (p: Pt[]) => {
    const c: Pt = [(Math.min(...p.map((q) => q[0])) + Math.max(...p.map((q) => q[0]))) / 2, (Math.min(...p.map((q) => q[1])) + Math.max(...p.map((q) => q[1]))) / 2];
    const r = p.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]));
    const m = r.reduce((s, x) => s + x, 0) / r.length;
    return Math.max(...r.map((x) => Math.abs(x - m))) / m < 0.04 && p.length >= 12;
  };
  if (holes.length >= 1) {
    const h = holes[0];
    const hw = Math.max(...h.map((p) => p[0])) - Math.min(...h.map((p) => p[0]));
    const hh = Math.max(...h.map((p) => p[1])) - Math.min(...h.map((p) => p[1]));
    const t = ((W - hw) / 2 + (H - hh) / 2) / 2;
    if (circular(outer)) {
      shape = 'tube-round';
      dims = { h: W, b: W, d: W, t };
      It = chs(W, t).It;
    } else {
      shape = 'tube-rect';
      dims = H >= W ? { h: H, b: W, t } : { h: W, b: H, t };
      It = rhs(Math.max(W, H), Math.min(W, H), t, 'cold-formed').It;
    }
  } else {
    const fill = A / (W * H);
    if (fill > 0.95) {
      if (circular(outer)) {
        shape = 'round';
        dims = { h: W, b: W, d: W };
      } else {
        shape = Math.min(W, H) / Math.max(W, H) <= 0.25 ? 'flat' : 'solid-rect';
        dims = { h: Math.max(W, H), b: Math.min(W, H), t: Math.min(W, H) };
      }
      const [tt, ww] = [Math.min(W, H), Math.max(W, H)];
      It = ww * tt ** 3 * (1 / 3 - 0.21 * (tt / ww) * (1 - tt ** 4 / (12 * ww ** 4)));
    } else if ((() => {
      // tube fendu (fente sur un angle, « poteau avec pipe ») : paroi mince tout autour du contour
      // parois sur presque tout le tour de la boîte (≥ 80 % du périmètre ; un C n'en couvre que 2 / 3) : la fente
      // peut être large, une droite médiane ne traverse alors qu'une paroi
      const nh = intervals(all, 1, (z0 + z1) / 2);
      const nv = intervals(all, 0, (y0 + y1) / 2);
      if (nh + nv < 3) return false;
      const tw = Math.min(chord(all, 1, (z0 + z1) / 2) / nh, chord(all, 0, (y0 + y1) / 2) / nv);
      return tw > 0 && A / (2 * (W + H) * tw) > 0.8 && A / (W * H) < 0.5;
    })()) {
      const t = Math.min(chord(all, 1, (z0 + z1) / 2) / intervals(all, 1, (z0 + z1) / 2), chord(all, 0, (y0 + y1) / 2) / intervals(all, 0, (y0 + y1) / 2));
      shape = 'tube-rect';
      slotted = true;
      dims = H >= W ? { h: H, b: W, t } : { h: W, b: H, t };
      // torsion d'un profil ouvert (prudent)
      It = (A * t * t) / 3;
    } else {
      // profil ouvert : coupes horizontales (âme le long de z) puis verticales (âme le long de y)
      const e = Math.max(0.5, 0.02 * Math.min(W, H));
      // U / I d'abord dans les deux sens (un U à plat ressemble à un T), puis L / T
      for (const [along, family] of [
        ['z', 'UI'],
        ['y', 'UI'],
        ['z', 'LT'],
        ['y', 'LT'],
      ] as const) {
        const [ax, lo, hi, wide, lo2, hi2] = along === 'z' ? ([1, z0, z1, W, y0, y1] as const) : ([0, y0, y1, H, z0, z1] as const);
        const mid = chord(all, ax, (lo + hi) / 2);
        const top = chord(all, ax, hi - e);
        const bot = chord(all, ax, lo + e);
        const midC = chordCentre(all, ax, (lo + hi) / 2);
        const centre = (lo2 + hi2) / 2;
        const atEdge = Math.abs(midC - centre) > wide / 4;
        const full = (x: number) => x > 0.6 * wide;
        const thin = (x: number) => x < 0.45 * wide;
        let s: DetectedShape | null = null;
        if (family === 'UI' && full(top) && full(bot) && thin(mid)) s = atEdge ? 'U' : 'I';
        else if (family === 'LT' && ((full(top) && thin(bot)) || (full(bot) && thin(top)))) s = atEdge ? 'L' : 'T';
        if (!s) continue;
        shape = s;
        webAlong = along;
        const hgt = hi - lo;
        const ax2 = ax === 1 ? 0 : 1;
        // épaisseur des ailes : coupe perpendiculaire près du bord libre
        const freeEdge = midC > centre ? lo2 + e : hi2 - e;
        const tf = s === 'U' || s === 'I' ? chord(all, ax2 as 0 | 1, freeEdge) / 2 : s === 'L' ? Math.min(top, bot) : Math.min(top, bot);
        dims = { h: hgt, b: wide, tw: mid, tf, t: mid };
        if (s === 'U') opening = along === 'z' ? (midC < centre ? '+y' : '-y') : midC < centre ? '+z' : '-z';
        break;
      }
      const t = (2 * A) / perimeter;
      It = (A * t * t) / 3;
    }
  }
  const props = {
    A,
    Iy: Iyy,
    Iz: Izz,
    It,
    Wely: Iyy / zmax,
    Welz: Izz / ymax,
    Wply: open ? open.Wply : Iyy / zmax,
    Wplz: open ? open.Wplz : Izz / ymax,
  };
  return { shape, dims, props, centroid: [yc, zc], webAlong, opening, outer, holes, ...(slotted ? { slotted } : {}) };
}

export interface MemberSection {
  axis: BarAxis;
  /** repère de la coupe : y horizontal ⟂ axe, z = projection du haut du module (axe u du module pour un poteau) */
  y: V3;
  z: V3;
  section: DetectedSection | null;
  /** coupes à 25 / 75 % différentes (aire ± 5 %) */
  variable: boolean;
}

/** Axe + coupe d'une barre (repère du module : u, v, z vers le haut). */
export function memberSection(pos: ArrayLike<number>, axis: BarAxis = barAxis(pos)): MemberSection {
  const up: V3 = [0, 0, 1];
  const vertical = Math.abs(axis.dir[2]) > 0.7;
  const ref: V3 = vertical ? [1, 0, 0] : up;
  const zr = sub(ref, mul(axis.dir, dot(ref, axis.dir)));
  const z = norm(zr);
  const y = norm(cross(z, axis.dir));
  // coupe près de f : la première sans morceau isolé (un perçage ou une lumière coupe une aile en deux), sinon celle
  // d'aire maximale ; plan décalé de 0,37 mm : aucun sommet pile dedans
  const at = (f: number) => {
    let best: { s: DetectedSection; islands: number } | null = null;
    for (const df of [0, -0.03, 0.03, -0.06, 0.06, -0.1, 0.1, -0.14, 0.14]) {
      const o = add(add(axis.a, mul(axis.dir, axis.length * Math.min(0.95, Math.max(0.05, f + df)))), mul(axis.dir, 0.37));
      const loops = sliceLoops(pos, o, axis.dir, y, z);
      const sec = analyzeSection(loops);
      if (!sec) continue;
      const islands = loops.length - 1 - sec.holes.length;
      if (!best || islands < best.islands || (islands === best.islands && sec.props.A > best.s.props.A * 1.001)) best = { s: sec, islands };
      if (islands === 0) break;
    }
    return best?.s ?? null;
  };
  const s = at(0.5);
  const q = [at(0.25), at(0.75)].filter((x): x is DetectedSection => !!x);
  // section variable : dimensions extérieures différentes (des perçages changent l'aire, pas le profil)
  const variable = !!s && q.some((x) => Math.abs(x.dims.h - s.dims.h) > 3 || Math.abs(x.dims.b - s.dims.b) > 3);
  return { axis, y, z, section: s, variable };
}

// ─── catalogue ───

const FAMILIES: Partial<Record<DetectedShape, CatalogFamily[]>> = {
  'tube-rect': ['RHS', 'SHS'],
  'tube-round': ['CHS'],
  I: ['IPE', 'HEA', 'HEB', 'HEM'],
  U: ['UPN', 'U_MARCHAND'],
  L: ['L'],
  T: ['T'],
  flat: ['PLAT'],
  round: ['ROND'],
  'solid-rect': ['CARRE'],
};

export interface SectionCandidate {
  entry: SectionEntry;
  /** écart (mm, pondéré) : plus petit = meilleur */
  score: number;
  /** correspondance acceptée (h, b ± 2 mm, épaisseurs ± 1 mm, A ± 5 %) */
  match: boolean;
  /** rotation de la section du catalogue (âme verticale) pour retrouver la barre dessinée (rad) */
  roll: number;
  diff: string;
}

/** Sections du catalogue les plus proches d'une coupe mesurée (3 au plus, meilleure en premier). */
export function catalogueCandidates(s: DetectedSection, max = 3): SectionCandidate[] {
  const fams = FAMILIES[s.shape] ?? [];
  const out: SectionCandidate[] = [];
  const t0 = s.dims.tw ?? s.dims.t ?? 0;
  for (const fam of fams)
    for (const c of familySections(fam)) {
      const d = c.section.dims;
      const h = d.h ?? d.d ?? d.b ?? 0;
      const b = d.b ?? d.d ?? h;
      const t = d.tw ?? d.t ?? 0;
      const dh = Math.abs(h - s.dims.h);
      const db = Math.abs(b - s.dims.b);
      const dt = t0 && t ? Math.abs(t - t0) : 0;
      const dA = Math.abs(c.section.A / s.props.A - 1);
      const score = dh + db + 2 * dt + 50 * dA;
      out.push({
        entry: c,
        score,
        match: dh <= 2 && db <= 2 && dt <= 1 && dA <= 0.05,
        roll: s.webAlong === 'y' ? Math.PI / 2 : 0,
        diff: `h ${fmt(h)} / ${fmt(s.dims.h)} mm, b ${fmt(b)} / ${fmt(s.dims.b)} mm${t0 ? `, t ${fmt(t)} / ${fmt(t0)} mm` : ''}, A ${fmt(c.section.A / 100, 1)} / ${fmt(s.props.A / 100, 1)} cm²`,
      });
    }
  return out.sort((a, b) => a.score - b.score).slice(0, max);
}

const fmt = (v: number, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',');

const SHAPE_NAME: Record<DetectedShape, string> = {
  'tube-rect': 'Tube',
  'tube-round': 'Tube rond',
  I: 'I',
  U: 'U',
  L: 'L',
  T: 'T',
  flat: 'Plat',
  'solid-rect': 'Plein',
  round: 'Rond',
  other: 'Profil',
};

/** Désignation lisible d'une coupe mesurée (« Tube 100 × 50 × 3 », « U 90 × 60 × 3 »). */
export function detectedName(s: DetectedSection): string {
  const d = s.dims;
  if (s.shape === 'tube-round') return `Tube rond ${fmt(d.d ?? d.h)} × ${fmt(d.t ?? 0, 1)}`;
  if (s.shape === 'round') return `Rond ${fmt(d.d ?? d.h)}`;
  const t = d.tw ?? d.t;
  return `${SHAPE_NAME[s.shape]} ${fmt(d.h)} × ${fmt(d.b)}${t && s.shape !== 'solid-rect' ? ` × ${fmt(t, 1)}` : ''}`;
}

/** Empreinte courte (FNV-1a) d'une coupe : clé SEC-SKP-… stable pour un même profil. */
function fingerprint(s: DetectedSection): string {
  const txt = `${s.shape}|${Math.round(s.dims.h)}|${Math.round(s.dims.b)}|${Math.round((s.dims.tw ?? s.dims.t ?? 0) * 10)}|${Math.round(s.props.A)}`;
  let h = 2166136261;
  for (let i = 0; i < txt.length; i++) h = Math.imul(h ^ txt.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36).toUpperCase();
}

/**
 * Section créée depuis la coupe mesurée (pas de correspondance dans le catalogue) : propriétés du contour réel, courbes
 * de flambement prudentes (c), statut « proposé » — à confirmer, jamais « connu » sans validation.
 */
export function measuredSectionEntry(s: DetectedSection, origin: { file?: string; date: string }): SectionEntry {
  const key = `SEC-SKP-${fingerprint(s)}`;
  const curve: BucklingCurve = 'c';
  const name = detectedName(s);
  // section rangée âme verticale (convention des sections) : une barre posée à plat reçoit une rotation de 90°
  const flat = s.webAlong === 'y' && s.shape !== 'flat' && s.shape !== 'round' && s.shape !== 'tube-round';
  const p = s.props;
  const props = flat ? { A: p.A, Iy: p.Iz, Iz: p.Iy, It: p.It, Wely: p.Welz, Welz: p.Wely, Wply: p.Wplz, Wplz: p.Wply } : { ...p };
  const d = s.dims;
  const r1 = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 10) / 10);
  const t = r1(d.t ?? d.tw);
  const map: Record<DetectedShape, { shape: Section['shape']; dims: Record<string, number | undefined> }> = {
    'tube-rect': { shape: 'RHS', dims: { h: r1(d.h), b: r1(d.b), t } },
    'tube-round': { shape: 'CHS', dims: { d: r1(d.d ?? d.h), t } },
    U: { shape: 'U_COLD', dims: { h: r1(d.h), b: r1(d.b), t } },
    I: { shape: 'I', dims: { h: r1(d.h), b: r1(d.b), tw: r1(d.tw), tf: r1(d.tf), r: 0 } },
    L: { shape: 'ANGLE', dims: { h: r1(d.h), b: r1(d.b), t } },
    T: { shape: 'T', dims: { h: r1(d.h), b: r1(d.b), tw: r1(d.tw), tf: r1(d.tf) } },
    flat: { shape: 'FLAT', dims: { b: r1(d.h), t: r1(d.b) } },
    'solid-rect': { shape: 'RECT', dims: { h: r1(d.h), b: r1(d.b) } },
    round: { shape: 'ROUND', dims: { d: r1(d.d ?? d.h) } },
    other: { shape: 'GENERIC', dims: { h: r1(d.h), b: r1(d.b) } },
  };
  const m = map[s.shape];
  const section: Section = {
    key,
    name,
    shape: m.shape,
    fabrication: s.shape === 'tube-rect' || s.shape === 'tube-round' || s.shape === 'U' ? 'cold-formed' : 'hot-rolled',
    dims: Object.fromEntries(Object.entries(m.dims).filter(([, v]) => typeof v === 'number' && v > 0)) as Record<string, number>,
    ...props,
    curveY: curve,
    curveZ: curve,
  };
  return {
    kind: 'section',
    key,
    name: `${name} (relevé sur le modèle)`,
    status: 'suggested',
    section,
    material: 'S235',
    source: [{ ref: 'sketchup', note: `relevée sur le modèle SketchUp${origin.file ? ` ${origin.file}` : ''}, ${origin.date} — nuance S235 supposée, à confirmer` }],
    notes: [s.shape === 'other' ? 'forme non reconnue : choisir la section dans la bibliothèque ou le catalogue' : 'section mesurée sur le dessin : épaisseurs et rayons à confirmer'],
  };
}

/** Rotation d'une barre dont la section relevée est rangée âme verticale alors qu'elle est posée à plat (rad). */
export function measuredRoll(s: DetectedSection): number {
  return s.webAlong === 'y' && s.shape !== 'flat' && s.shape !== 'round' && s.shape !== 'tube-round' ? Math.PI / 2 : 0;
}

/** Indice tiré du nom (« UPN 200 », « RHS 120x60x4 », « C Bended steel 60x90x60x3 ») : famille et dimensions. */
export function sectionHintFromName(name: string): { shape?: DetectedShape; family?: CatalogFamily; h?: number; b?: number; t?: number } | null {
  const s = name.toUpperCase().replace(/,/g, '.');
  const nums = (s.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (/\bUPN\s*\d/.test(s)) return { shape: 'U', family: 'UPN', h: nums[0] };
  if (/\b(IPE|HEA|HEB|HEM)\s*\d/.test(s)) return { shape: 'I', family: s.match(/\b(IPE|HEA|HEB|HEM)/)![1] as CatalogFamily, h: nums[0] };
  if (/\b(RHS|SHS|TUBE|QHP|RHP)\b/.test(s) && nums.length >= 2) return { shape: 'tube-rect', h: nums[0], b: nums.length >= 3 ? nums[1] : nums[0], t: nums[nums.length - 1] };
  if (/\b(PLAT|FLA|FLAT)\b/.test(s) && nums.length >= 2) return { shape: 'flat', h: Math.max(nums[0], nums[1]), b: Math.min(nums[0], nums[1]), t: Math.min(nums[0], nums[1]) };
  if (/\b(C|U)\b/.test(s) && nums.length >= 3) {
    // « 60x90x60x3 » = aile × âme × aile × épaisseur
    if (nums.length >= 4) return { shape: 'U', h: nums[1], b: nums[0], t: nums[3] };
    return { shape: 'U', h: nums[0], b: nums[1], t: nums[2] };
  }
  return null;
}
