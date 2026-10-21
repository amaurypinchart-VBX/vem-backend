// Géométrie pure de la peinture : triangles d'une pièce dans son repère propre (mm) → triangles de la face cliquée
// (reliés par des arêtes communes sans franchir un pli > creaseDeg, comme les traits du dessin), d'un « côté » (normale
// proche), surfaces ; contours 2D des triangles projetés et point le plus intérieur d'un contour (pour le repère).
import type { FaceSelector, Vec3 } from './types';
import { DEFAULT_SIDE_DEG } from './types';
import { Clipper, FillRule, Paths64 } from 'clipper2-js';

/** Triangles d'une pièce : positions (x, y, z par sommet, mm) et indices (3 par triangle). */
export interface TriSoup {
  pos: Float64Array;
  index: Uint32Array;
}

const WELD_MM = 0.05;
/** distance maximale du point cliqué à la face retrouvée (sinon la zone est « sans effet ») */
export const SEED_TOL_MM = 2;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function vertex(s: TriSoup, i: number): Vec3 {
  return [s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]];
}

export function triCount(s: TriSoup): number {
  return s.index.length / 3;
}

/** Normale unitaire (et aire mm²) d'un triangle ; [0,0,0] si dégénéré. */
export function triNormal(s: TriSoup, t: number): { n: Vec3; area: number } {
  const a = vertex(s, s.index[t * 3]);
  const c = cross(sub(vertex(s, s.index[t * 3 + 1]), a), sub(vertex(s, s.index[t * 3 + 2]), a));
  const l = Math.hypot(...c);
  return l < 1e-12 ? { n: [0, 0, 0], area: 0 } : { n: [c[0] / l, c[1] / l, c[2] / l], area: l / 2 };
}

/** Distance d'un point à un triangle (mm). */
export function pointTriangleDistance(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  // Ericson, Real-Time Collision Detection 5.1.5
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  let q: Vec3;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = sub(p, b);
    const d3 = dot(ab, bp);
    const d4 = dot(ac, bp);
    const cp = sub(p, c);
    const d5 = dot(ab, cp);
    const d6 = dot(ac, cp);
    const vc = d1 * d4 - d3 * d2;
    const vb = d5 * d2 - d1 * d6;
    const va = d3 * d6 - d5 * d4;
    if (d3 >= 0 && d4 <= d3) q = b;
    else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      q = [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]];
    } else if (d6 >= 0 && d5 <= d6) q = c;
    else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
      const w = d2 / (d2 - d6);
      q = [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]];
    } else if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
      const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
      q = [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
    } else {
      const den = 1 / (va + vb + vc);
      const v = vb * den;
      const w = vc * den;
      q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
    }
  }
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/** Sommets soudés (0,05 mm) : identifiant commun par position. */
function weld(s: TriSoup): Int32Array {
  const n = s.pos.length / 3;
  const ids = new Int32Array(n);
  const map = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(s.pos[i * 3] / WELD_MM)},${Math.round(s.pos[i * 3 + 1] / WELD_MM)},${Math.round(s.pos[i * 3 + 2] / WELD_MM)}`;
    let id = map.get(k);
    if (id === undefined) map.set(k, (id = map.size));
    ids[i] = id;
  }
  return ids;
}

/** Triangle de départ : le plus proche du point cliqué (≤ 2 mm), à normale proche de celle de la face si possible. */
export function seedTriangle(s: TriSoup, seed: Vec3, normal?: Vec3, tol = SEED_TOL_MM): number {
  let best = -1;
  let bestScore = Infinity;
  for (let t = 0; t < triCount(s); t++) {
    const d = pointTriangleDistance(seed, vertex(s, s.index[t * 3]), vertex(s, s.index[t * 3 + 1]), vertex(s, s.index[t * 3 + 2]));
    if (d > tol) continue;
    const { n, area } = triNormal(s, t);
    if (!area) continue;
    // à distance égale, la normale la plus proche gagne (arête commune à deux faces)
    const score = d + (normal ? (1 - dot(n, normal)) * 0.5 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Triangles de la face qui contient le triangle `start` : reliés par des arêtes communes, pli ≤ creaseDeg. */
export function growFace(s: TriSoup, start: number, creaseDeg: number): number[] {
  const ids = weld(s);
  const edges = new Map<string, number[]>();
  const nt = triCount(s);
  const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  for (let t = 0; t < nt; t++)
    for (let e = 0; e < 3; e++) {
      const k = key(ids[s.index[t * 3 + e]], ids[s.index[t * 3 + ((e + 1) % 3)]]);
      const l = edges.get(k);
      if (l) l.push(t);
      else edges.set(k, [t]);
    }
  const normals = Array.from({ length: nt }, (_, t) => triNormal(s, t).n);
  const cosMax = Math.cos((creaseDeg * Math.PI) / 180);
  const seen = new Uint8Array(nt);
  const out: number[] = [];
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const t = stack.pop()!;
    out.push(t);
    for (let e = 0; e < 3; e++) {
      const k = key(ids[s.index[t * 3 + e]], ids[s.index[t * 3 + ((e + 1) % 3)]]);
      for (const u of edges.get(k) ?? []) {
        if (seen[u]) continue;
        const nu = normals[u];
        if (!nu[0] && !nu[1] && !nu[2]) continue;
        if (dot(normals[t], nu) < cosMax) continue;
        seen[u] = 1;
        stack.push(u);
      }
    }
  }
  return out.sort((a, b) => a - b);
}

/** Triangles d'une pièce visés par un sélecteur ; null = la face n'est plus là (zone « sans effet »). */
export function selectTriangles(s: TriSoup, scope: 'face' | 'side' | 'node', sel?: FaceSelector): number[] | null {
  const nt = triCount(s);
  if (scope === 'node') return Array.from({ length: nt }, (_, i) => i);
  if (!sel) return null;
  if (scope === 'side') {
    const cosMax = Math.cos(((sel.sideDeg ?? DEFAULT_SIDE_DEG) * Math.PI) / 180);
    const out: number[] = [];
    for (let t = 0; t < nt; t++) if (dot(triNormal(s, t).n, sel.normal) >= cosMax) out.push(t);
    return out.length ? out : null;
  }
  const start = seedTriangle(s, sel.seed, sel.normal);
  return start < 0 ? null : growFace(s, start, sel.creaseDeg);
}

/** Surface (mm²) de triangles. */
export function trianglesArea(s: TriSoup, tris: Iterable<number>): number {
  let a = 0;
  for (const t of tris) a += triNormal(s, t).area;
  return a;
}

/** Sélecteur d'une face à partir du point cliqué (repère propre de la pièce). */
export function faceSelector(s: TriSoup, seed: Vec3, creaseDeg: number, sideDeg?: number): FaceSelector | null {
  const t = seedTriangle(s, seed);
  if (t < 0) return null;
  const { n } = triNormal(s, t);
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4 || 0;
  const r1 = (v: number) => Math.round(v * 10) / 10 || 0;
  const normal: Vec3 = [r4(n[0]), r4(n[1]), r4(n[2])];
  return { normal, d: r1(dot(n, seed)), seed: [r1(seed[0]), r1(seed[1]), r1(seed[2])], creaseDeg, ...(sideDeg !== undefined ? { sideDeg } : {}) };
}

// ─── 2D : contours et point intérieur ───

/**
 * Contours de triangles 2D (x, y par sommet ; 3 sommets par triangle) : union (Clipper2, au 1/100 mm) → boucles
 * extérieures dans le sens trigonométrique, trous dans l'autre sens, sans point répété ni sommet aligné. Robuste aux
 * triangulations non conformes (sommet au milieu d'une arête voisine) et aux recouvrements.
 */
export function outlineLoops(tris2d: Float64Array, unitMm = 0.01): Float64Array[] {
  const k = 1 / unitMm;
  const subject: Paths64 = new Paths64();
  for (let i = 0; i + 5 < tris2d.length; i += 6) {
    const pts = [0, 1, 2].map((j) => [Math.round(tris2d[i + j * 2] * k), Math.round(tris2d[i + j * 2 + 1] * k)]);
    const area = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]);
    if (!area) continue;
    subject.push(Clipper.makePath(area > 0 ? pts.flat() : [pts[0], pts[2], pts[1]].flat()));
  }
  if (!subject.length) return [];
  const out = Clipper.Union(subject, undefined, FillRule.NonZero);
  return out
    .map((path) => Clipper.trimCollinear(Clipper.stripDuplicates(path, true)))
    .filter((path) => path.length >= 3)
    .map((path) => Float64Array.from(path.flatMap((p) => [p.x / k, p.y / k])));
}

/** Aire signée d'une boucle (positive = sens trigonométrique). */
export function loopArea(l: Float64Array): number {
  let a = 0;
  const n = l.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += l[i * 2] * l[j * 2 + 1] - l[j * 2] * l[i * 2 + 1];
  }
  return a / 2;
}

function pointInLoops(x: number, y: number, loops: Float64Array[]): boolean {
  let inside = false;
  for (const l of loops) {
    const n = l.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = l[i * 2];
      const yi = l[i * 2 + 1];
      const xj = l[j * 2];
      const yj = l[j * 2 + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

function distToLoops(x: number, y: number, loops: Float64Array[]): number {
  let d = Infinity;
  for (const l of loops) {
    const n = l.length / 2;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = l[j * 2];
      const ay = l[j * 2 + 1];
      const bx = l[i * 2];
      const by = l[i * 2 + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
      d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
  }
  return d;
}

/**
 * Pôle d'inaccessibilité (point intérieur le plus éloigné des bords) d'un polygone avec trous, par grille raffinée
 * (méthode polylabel, Mapbox) ; renvoie le point et sa distance au bord.
 */
export function poleOfInaccessibility(loops: Float64Array[], precision = 1): { x: number; y: number; d: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const l of loops)
    for (let i = 0; i < l.length; i += 2) {
      minX = Math.min(minX, l[i]);
      maxX = Math.max(maxX, l[i]);
      minY = Math.min(minY, l[i + 1]);
      maxY = Math.max(maxY, l[i + 1]);
    }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, d: 0 };
  const sd = (x: number, y: number) => (pointInLoops(x, y, loops) ? 1 : -1) * distToLoops(x, y, loops);
  type Cell = { x: number; y: number; h: number; d: number; max: number };
  const cell = (x: number, y: number, h: number): Cell => {
    const d = sd(x, y);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };
  const size = Math.max(maxX - minX, maxY - minY);
  if (!size) return { x: minX, y: minY, d: 0 };
  let h = Math.min(maxX - minX, maxY - minY) / 2 || size / 2;
  const queue: Cell[] = [];
  for (let x = minX; x < maxX; x += h * 2) for (let y = minY; y < maxY; y += h * 2) queue.push(cell(x + h, y + h, h));
  let best = cell((minX + maxX) / 2, (minY + maxY) / 2, 0);
  for (const c of queue) if (c.d > best.d) best = c;
  let guard = 0;
  while (queue.length && guard++ < 20000) {
    queue.sort((a, b) => b.max - a.max);
    const c = queue.shift()!;
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2;
    queue.push(cell(c.x - h, c.y - h, h), cell(c.x + h, c.y - h, h), cell(c.x - h, c.y + h, h), cell(c.x + h, c.y + h, h));
  }
  return { x: best.x, y: best.y, d: Math.max(0, best.d) };
}
