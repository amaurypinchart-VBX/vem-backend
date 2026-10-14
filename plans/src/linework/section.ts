// Sections d'une coupe (pure, utilisable dans un Worker) : triangles ∩ plan → segments → chaînage (points identiques,
// puis bouts à 0,2 mm près) → boucles fermées → polygones avec trous (pair-impair) → triangles de bouchon.
// Une boucle qui ne se ferme pas (maillage SketchUp non solide) n'est ni bouchée ni remplie : seulement le trait.
import { ShapeUtils, Vector2 } from 'three';
import type { Vec3 } from '../core/views';
import { pointInRing, ringArea } from './hatch';

/** Tolérance de jonction des bouts de boucles (mm). */
export const SECTION_JOIN_TOL = 0.2;

export interface PlaneEq {
  n: Vec3;
  d: number;
}

/**
 * Point d'intersection d'une arête avec un plan, calculé dans un ordre canonique (extrémité la plus petite d'abord) :
 * deux triangles voisins obtiennent exactement le même point sur leur arête commune.
 */
export function edgePoint(ax: number, ay: number, az: number, bx: number, by: number, bz: number, n: Vec3, d: number, out: number[]): void {
  const swap = ax > bx || (ax === bx && (ay > by || (ay === by && az > bz)));
  if (swap) {
    [ax, bx] = [bx, ax];
    [ay, by] = [by, ay];
    [az, bz] = [bz, az];
  }
  const sa = n[0] * ax + n[1] * ay + n[2] * az - d;
  const sb = n[0] * bx + n[1] * by + n[2] * bz - d;
  const t = sa / (sa - sb);
  out.push(ax + t * (bx - ax), ay + t * (by - ay), az + t * (bz - az));
}

/** Segments [x0, y0, z0, x1, y1, z1, …] de l'intersection d'une soupe de triangles (9 nombres chacun) avec un plan. */
export function sliceTriangles(tris: ArrayLike<number>, p: PlaneEq): number[] {
  const out: number[] = [];
  const pts: number[] = [];
  const { n, d } = p;
  for (let t = 0; t + 8 < tris.length; t += 9) {
    const s0 = n[0] * tris[t] + n[1] * tris[t + 1] + n[2] * tris[t + 2] - d;
    const s1 = n[0] * tris[t + 3] + n[1] * tris[t + 4] + n[2] * tris[t + 5] - d;
    const s2 = n[0] * tris[t + 6] + n[1] * tris[t + 7] + n[2] * tris[t + 8] - d;
    // côté positif = s ≥ 0 (même convention que la découpe)
    const p0 = s0 >= 0;
    const p1 = s1 >= 0;
    const p2 = s2 >= 0;
    if (p0 === p1 && p1 === p2) continue;
    pts.length = 0;
    const e = (i: number, j: number) =>
      edgePoint(tris[t + 3 * i], tris[t + 3 * i + 1], tris[t + 3 * i + 2], tris[t + 3 * j], tris[t + 3 * j + 1], tris[t + 3 * j + 2], n, d, pts);
    if (p0 !== p1) e(0, 1);
    if (p1 !== p2) e(1, 2);
    if (p2 !== p0) e(2, 0);
    if (pts.length === 6) out.push(...pts);
  }
  return out;
}

const keyOf = (x: number, y: number, z: number) => `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;

export interface Loop {
  /** points 3D [x, y, z, …], sans répétition du premier */
  points: number[];
  closed: boolean;
}

/** Chaînage des segments en boucles (points identiques, puis bouts libres à `tol` près). */
export function chainSegments(segs: number[], tol = SECTION_JOIN_TOL): Loop[] {
  const n = segs.length / 6;
  const used = new Uint8Array(n);
  const at = new Map<string, number[]>();
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const o = i * 6;
    const ka = keyOf(segs[o], segs[o + 1], segs[o + 2]);
    const kb = keyOf(segs[o + 3], segs[o + 4], segs[o + 5]);
    keys.push(ka, kb);
    if (ka === kb) {
      used[i] = 1;
      continue;
    }
    for (const k of [ka, kb]) {
      const l = at.get(k);
      if (l) l.push(i);
      else at.set(k, [i]);
    }
  }
  const chains: Array<{ pts: number[]; closed: boolean }> = [];
  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const o = s * 6;
    const pts = [segs[o], segs[o + 1], segs[o + 2], segs[o + 3], segs[o + 4], segs[o + 5]];
    const startKey = keys[2 * s];
    let endKey = keys[2 * s + 1];
    let closed = false;
    // avance d'un bout à l'autre
    for (;;) {
      if (endKey === startKey) {
        closed = true;
        break;
      }
      const next = (at.get(endKey) ?? []).find((j) => !used[j]);
      if (next === undefined) break;
      used[next] = 1;
      const q = next * 6;
      const forward = keys[2 * next] === endKey;
      const k = forward ? 3 : 0;
      pts.push(segs[q + k], segs[q + k + 1], segs[q + k + 2]);
      endKey = forward ? keys[2 * next + 1] : keys[2 * next];
    }
    if (closed) pts.length -= 3; // le dernier point = le premier
    chains.push({ pts, closed });
  }
  // bouts libres proches : on recolle (maillages SketchUp aux sommets presque confondus)
  const open = chains.filter((c) => !c.closed);
  const dist = (a: number[], i: number, b: number[], j: number) => Math.hypot(a[i] - b[j], a[i + 1] - b[j + 1], a[i + 2] - b[j + 2]);
  let merged = true;
  while (merged && open.length) {
    merged = false;
    for (let i = 0; i < open.length && !merged; i++) {
      const a = open[i];
      const ae = a.pts.length - 3;
      if (dist(a.pts, ae, a.pts, 0) <= tol && a.pts.length >= 9) {
        a.pts.length -= 3;
        a.closed = true;
        open.splice(i, 1);
        merged = true;
        break;
      }
      for (let j = 0; j < open.length; j++) {
        if (i === j) continue;
        const b = open[j];
        const be = b.pts.length - 3;
        if (dist(a.pts, ae, b.pts, 0) <= tol) a.pts.push(...b.pts.slice(3));
        else if (dist(a.pts, ae, b.pts, be) <= tol) {
          const rev: number[] = [];
          for (let k = be - 3; k >= 0; k -= 3) rev.push(b.pts[k], b.pts[k + 1], b.pts[k + 2]);
          a.pts.push(...rev);
        } else continue;
        const bi = chains.indexOf(b);
        chains.splice(bi, 1);
        open.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return chains.filter((c) => c.pts.length >= 9 || !c.closed).map((c) => ({ points: c.pts, closed: c.closed }));
}

/** Base (u, v) d'un plan : coordonnées 2D d'un point du plan. */
export function planeBasis(n: Vec3): { u: Vec3; v: Vec3 } {
  const a: Vec3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u0: Vec3 = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const l = Math.hypot(...u0);
  const u: Vec3 = [u0[0] / l, u0[1] / l, u0[2] / l];
  const v: Vec3 = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  return { u, v };
}

export interface SectionPolygon {
  /** contour extérieur puis trous, points 3D [x, y, z, …] */
  rings: number[][];
}

/** Boucles fermées → polygones avec trous (profondeur d'imbrication paire = contour, impaire = trou). */
export function loopsToPolygons(loops: Loop[], n: Vec3): SectionPolygon[] {
  const closed = loops.filter((l) => l.closed && l.points.length >= 9);
  if (!closed.length) return [];
  const { u, v } = planeBasis(n);
  const flat = closed.map((l) => {
    const r = new Float64Array((l.points.length / 3) * 2);
    for (let i = 0, k = 0; i < l.points.length; i += 3, k += 2) {
      r[k] = l.points[i] * u[0] + l.points[i + 1] * u[1] + l.points[i + 2] * u[2];
      r[k + 1] = l.points[i] * v[0] + l.points[i + 1] * v[1] + l.points[i + 2] * v[2];
    }
    return r;
  });
  const keep = flat.map((r) => Math.abs(ringArea(r)) > 1e-6);
  const depth = flat.map((r, i) => {
    if (!keep[i]) return -1;
    let dpt = 0;
    for (let j = 0; j < flat.length; j++) if (j !== i && keep[j] && Math.abs(ringArea(flat[j])) > Math.abs(ringArea(r)) && pointInRing(r[0], r[1], flat[j])) dpt++;
    return dpt;
  });
  const out: SectionPolygon[] = [];
  for (let i = 0; i < flat.length; i++) {
    if (depth[i] < 0 || depth[i] % 2) continue;
    const rings = [closed[i].points];
    for (let j = 0; j < flat.length; j++)
      if (depth[j] === depth[i] + 1 && pointInRing(flat[j][0], flat[j][1], flat[i])) rings.push(closed[j].points);
    out.push({ rings });
  }
  return out;
}

/**
 * Triangles de bouchon d'un polygone (soupe de 9 nombres par triangle), orientés vers `outward` (le côté retiré) :
 * le solide coupé reste fermé et bien orienté.
 */
export function capTriangles(poly: SectionPolygon, n: Vec3, outward: Vec3): number[] {
  const { u, v } = planeBasis(n);
  const pts3: number[][] = [];
  const to2 = (ring: number[]) => {
    const out: Vector2[] = [];
    for (let i = 0; i < ring.length; i += 3) {
      out.push(new Vector2(ring[i] * u[0] + ring[i + 1] * u[1] + ring[i + 2] * u[2], ring[i] * v[0] + ring[i + 1] * v[1] + ring[i + 2] * v[2]));
      pts3.push([ring[i], ring[i + 1], ring[i + 2]]);
    }
    return out;
  };
  const contour = to2(poly.rings[0]);
  const holes = poly.rings.slice(1).map(to2);
  const faces = ShapeUtils.triangulateShape(contour, holes);
  const out: number[] = [];
  for (const [a, b, c] of faces) {
    let A = pts3[a];
    let B = pts3[b];
    let C = pts3[c];
    const nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
    const ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
    const nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    if (nx * outward[0] + ny * outward[1] + nz * outward[2] < 0) [B, C] = [C, B];
    out.push(...A, ...B, ...C);
  }
  return out;
}
