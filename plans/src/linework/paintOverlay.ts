// Peinture sur une vue 2D : partie VISIBLE des faces peintes, en contours du dessin (mm modèle), et point d'ancrage du
// repère. Calculé après les traits (et leur cache, comme les repères façade) : peindre ne relance jamais le calcul des
// lignes cachées, et une vue sans peinture est dessinée exactement comme avant.
// Visibilité exacte : faces tournées vers l'observateur, puis partie visible = triangle peint − projection des
// triangles qui sont devant lui (Clipper2, au 1/100 mm) ; les pièces dessinées de la vue cachent, les vitres aussi sauf
// « vitres transparentes ».
import { Clipper, FillRule, Paths64 } from 'clipper2-js';
import type { Path64 } from 'clipper2-js';
import { Vector3 } from 'three';
import type { BufferGeometry, Material, Mesh } from 'three';
import type { ViewBasis } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import { loopArea, poleOfInaccessibility } from '../core/paint/region';
import type { GlassTest } from './packets';
import type { PaintedScene } from './paintScene';
import { nodeSoup, worldTriangle } from './paintScene';

export interface PaintRegion {
  colorId: string;
  /** contour extérieur (sens trigo) + trous (autre sens), mm du dessin */
  loops: Float64Array[];
  /** point le plus intérieur (mm du dessin) et sa distance au bord (mm) */
  anchor: { x: number; y: number; d: number };
  /** aire visible (mm² du dessin) */
  area: number;
}

export interface PaintOverlayInput {
  scene: LoadedScene;
  painted: PaintedScene;
  /** pièces dessinées dans la vue */
  meshIds: string[];
  basis: ViewBasis;
  isGlass?: GlassTest;
  /** vitres transparentes : elles ne cachent pas les faces peintes derrière */
  glassTransparent?: boolean;
  /** n'utiliser que ces couleurs (aperçu d'une zone) */
  only?: Set<string>;
}

const FACING = 0.05;
/** un triangle est « devant » s'il est au moins à 0,5 mm vers l'observateur */
const FRONT_EPS = 0.5;
const K = 100; // Clipper : 1 unité = 0,01 mm

interface Occ {
  /** x0 y0 x1 y1 x2 y2 (mm du dessin) */
  p: Float64Array;
  /** profondeur des 3 sommets (vers l'observateur = plus grand) */
  d: Float64Array;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computePaintOverlay(inp: PaintOverlayInput): PaintRegion[] {
  const { scene, painted, basis } = inp;
  const ids = inp.meshIds.filter((id) => painted.nodes.has(id));
  if (!ids.length) return [];
  const toward = new Vector3(...basis.toward);
  const right = new Vector3(...basis.right);
  const up = new Vector3(...basis.up);
  // 1. triangles peints tournés vers l'observateur (repère du dessin)
  const w = [new Vector3(), new Vector3(), new Vector3()];
  const e1 = new Vector3();
  const e2 = new Vector3();
  const faces: Array<{ colorId: string; p: number[]; n: Vector3; c: number }> = [];
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const id of ids) {
    const ns = nodeSoup(scene, id);
    const tris = painted.nodes.get(id);
    if (!ns || !tris) continue;
    // le repère propre peut être un miroir de l'instance : le sens des triangles s'inverse dans le monde
    const sign = ns.toWorld.determinant() < 0 ? -1 : 1;
    for (const [t, { colorId }] of tris) {
      if (inp.only && !inp.only.has(colorId)) continue;
      worldTriangle(ns, t, w);
      e1.subVectors(w[1], w[0]);
      e2.subVectors(w[2], w[0]);
      const n = e1.clone().cross(e2).multiplyScalar(sign);
      const len = n.length();
      if (len < 1e-9) continue;
      n.multiplyScalar(1 / len);
      if (n.dot(toward) <= FACING) continue;
      const p = w.flatMap((v) => [v.dot(right), v.dot(up)]);
      faces.push({ colorId, p, n, c: n.dot(w[0]) });
      for (let k = 0; k < 6; k += 2) {
        bx0 = Math.min(bx0, p[k]);
        bx1 = Math.max(bx1, p[k]);
        by0 = Math.min(by0, p[k + 1]);
        by1 = Math.max(by1, p[k + 1]);
      }
    }
  }
  if (!faces.length) return [];
  // 2. triangles qui peuvent cacher (pièces dessinées dans la vue, dans l'emprise des faces peintes), en grille 2D
  const occ: Occ[] = [];
  const v = new Vector3();
  for (const id of inp.meshIds)
    for (const mesh of meshesOfNode(scene.objectsById.get(id))) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined;
      if (inp.glassTransparent && inp.isGlass?.(mat)) continue;
      collectOccluders(mesh, right, up, toward, [bx0, by0, bx1, by1], occ, v);
    }
  const cells = 64;
  const cw = Math.max(bx1 - bx0, 1e-6) / cells;
  const ch = Math.max(by1 - by0, 1e-6) / cells;
  const grid = new Map<number, number[]>();
  const cellRange = (x0: number, y0: number, x1: number, y1: number) => [
    Math.max(0, Math.floor((x0 - bx0) / cw)),
    Math.max(0, Math.floor((y0 - by0) / ch)),
    Math.min(cells - 1, Math.floor((x1 - bx0) / cw)),
    Math.min(cells - 1, Math.floor((y1 - by0) / ch)),
  ];
  occ.forEach((o, i) => {
    const [i0, j0, i1, j1] = cellRange(o.minX, o.minY, o.maxX, o.maxY);
    for (let a = i0; a <= i1; a++)
      for (let b = j0; b <= j1; b++) {
        const l = grid.get(a * cells + b);
        if (l) l.push(i);
        else grid.set(a * cells + b, [i]);
      }
  });
  // 3. partie visible de chaque triangle peint
  const byColor = new Map<string, Paths64>();
  const nr = (n: Vector3) => [n.dot(right), n.dot(up), n.dot(toward)];
  for (const f of faces) {
    const xs = [f.p[0], f.p[2], f.p[4]];
    const ys = [f.p[1], f.p[3], f.p[5]];
    const [i0, j0, i1, j1] = cellRange(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    const [a, b, cz] = nr(f.n);
    // profondeur du plan de la face au point (x, y) du dessin
    const depthAt = (x: number, y: number) => (f.c - a * x - b * y) / cz;
    const seen = new Set<number>();
    const clip = new Paths64();
    for (let ia = i0; ia <= i1; ia++)
      for (let jb = j0; jb <= j1; jb++)
        for (const oi of grid.get(ia * cells + jb) ?? []) {
          if (seen.has(oi)) continue;
          seen.add(oi);
          const o = occ[oi];
          if (o.maxX <= Math.min(...xs) || o.minX >= Math.max(...xs) || o.maxY <= Math.min(...ys) || o.minY >= Math.max(...ys)) continue;
          let front = 0;
          for (let k = 0; k < 3; k++) if (o.d[k] > depthAt(o.p[k * 2], o.p[k * 2 + 1]) + FRONT_EPS) front++;
          if (front === 0) continue;
          if (front < 3) {
            // triangle qui traverse le plan : on juge sur son centre
            const cx = (o.p[0] + o.p[2] + o.p[4]) / 3;
            const cy = (o.p[1] + o.p[3] + o.p[5]) / 3;
            if ((o.d[0] + o.d[1] + o.d[2]) / 3 <= depthAt(cx, cy) + FRONT_EPS) continue;
          }
          clip.push(path(o.p));
        }
    const subject = new Paths64();
    subject.push(path(f.p));
    const visible = clip.length ? Clipper.Difference(subject, Clipper.Union(clip, undefined, FillRule.NonZero), FillRule.NonZero) : subject;
    if (!visible.length) continue;
    const l = byColor.get(f.colorId) ?? new Paths64();
    for (const q of visible) l.push(q);
    byColor.set(f.colorId, l);
  }
  // 4. contours par couleur, régions (contour extérieur + trous), point d'ancrage
  const out: PaintRegion[] = [];
  for (const [colorId, paths] of byColor) {
    const merged = Clipper.Union(paths, undefined, FillRule.NonZero)
      .map((q) => Clipper.trimCollinear(Clipper.stripDuplicates(q, true)))
      .filter((q) => q.length >= 3)
      .map((q) => Float64Array.from(q.flatMap((pt) => [pt.x / K, pt.y / K])));
    const outers = merged.filter((l) => loopArea(l) > 0);
    const holes = merged.filter((l) => loopArea(l) < 0);
    for (const o of outers) {
      const mine = holes.filter((h) => insideLoop(h[0], h[1], o));
      const all = [o, ...mine];
      const area = loopArea(o) + mine.reduce((s, h) => s + loopArea(h), 0);
      if (area < 1) continue;
      out.push({ colorId, loops: all, anchor: poleOfInaccessibility(all, 1), area });
    }
  }
  return out.sort((a, b) => b.area - a.area);
}

function path(p: ArrayLike<number>): Path64 {
  // sens trigonométrique pour l'union NonZero
  const cross = (p[2] - p[0]) * (p[5] - p[1]) - (p[3] - p[1]) * (p[4] - p[0]);
  const pts = cross >= 0 ? [p[0], p[1], p[2], p[3], p[4], p[5]] : [p[0], p[1], p[4], p[5], p[2], p[3]];
  return Clipper.makePath(pts.map((x) => Math.round(x * K)));
}

/** Triangles d'un maillage projetés dans le dessin, gardés s'ils touchent l'emprise [x0, y0, x1, y1]. */
function collectOccluders(mesh: Mesh, right: Vector3, up: Vector3, toward: Vector3, box: number[], out: Occ[], v: Vector3): void {
  const g = mesh.geometry as BufferGeometry;
  const pos = g.attributes.position;
  if (!pos) return;
  mesh.updateWorldMatrix(true, false);
  if (!g.boundingSphere) g.computeBoundingSphere();
  const bs = g.boundingSphere!;
  const c = bs.center.clone().applyMatrix4(mesh.matrixWorld);
  const r = bs.radius * mesh.matrixWorld.getMaxScaleOnAxis();
  const cx = c.dot(right);
  const cy = c.dot(up);
  if (cx + r < box[0] || cx - r > box[2] || cy + r < box[1] || cy - r > box[3]) return;
  const n = pos.count;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const pd = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    px[i] = v.dot(right);
    py[i] = v.dot(up);
    pd[i] = v.dot(toward);
  }
  const idx = g.index;
  const tri = idx ? idx.count / 3 : n / 3;
  for (let t = 0; t < tri; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3;
    const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const d = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    const minX = Math.min(px[a], px[b], px[d]);
    const maxX = Math.max(px[a], px[b], px[d]);
    const minY = Math.min(py[a], py[b], py[d]);
    const maxY = Math.max(py[a], py[b], py[d]);
    if (maxX < box[0] || minX > box[2] || maxY < box[1] || minY > box[3]) continue;
    // triangle vu par la tranche : ne cache rien
    if (Math.abs((px[b] - px[a]) * (py[d] - py[a]) - (py[b] - py[a]) * (px[d] - px[a])) < 1e-6) continue;
    out.push({ p: Float64Array.of(px[a], py[a], px[b], py[b], px[d], py[d]), d: Float64Array.of(pd[a], pd[b], pd[d]), minX, minY, maxX, maxY });
  }
}

function insideLoop(x: number, y: number, l: Float64Array): boolean {
  let inside = false;
  const n = l.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = l[i * 2];
    const yi = l[i * 2 + 1];
    const xj = l[j * 2];
    const yj = l[j * 2 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
