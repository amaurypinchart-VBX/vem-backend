// Peinture sur une vue 2D : partie VISIBLE des faces peintes, en contours du dessin (mm modèle), et point d'ancrage du
// repère. Calculé après les traits (et leur cache, comme les repères façade) : peindre ne relance jamais le calcul des
// lignes cachées, et une vue sans peinture est dessinée exactement comme avant.
// Visibilité exacte : faces tournées vers l'observateur, puis partie visible = face peinte − projection des
// triangles qui sont devant elle (Clipper2, au 1/100 mm) ; les pièces dessinées de la vue cachent, les vitres aussi sauf
// « vitres transparentes ». Les triangles peints d'un même plan sont traités ensemble, et une pièce entièrement devant
// la face est retirée par sa silhouette (union de ses triangles, gardée par vue) : soustraire un à un des milliers de
// petits triangles (boulonnerie, détails) figeait la page plusieurs minutes sur une façade de toute l'installation.
// Le calcul est découpé en étapes (`paintOverlaySteps`) pour être réparti sur plusieurs tâches du navigateur.
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
/** silhouette d'une pièce plutôt que ses triangles un à un : à partir de ce nombre de triangles devant la face… */
const SILHOUETTE_MIN = 24;
/** … et d'au moins cette part des triangles de la pièce (sinon l'union de toute la pièce coûte plus qu'elle ne sert) */
const SILHOUETTE_SHARE = 0.25;
/** triangles réunis par étape (union par morceaux, puis morceaux réunis deux à deux) */
const SILHOUETTE_CHUNK = 400;

/** Triangles d'un maillage projetés dans le dessin (vus par la tranche exclus). */
interface OccMesh {
  mesh: Mesh;
  n: number;
  /** x0 y0 x1 y1 x2 y2 par triangle (mm du dessin) */
  p: Float64Array;
  /** profondeur des 3 sommets (vers l'observateur = plus grand) */
  d: Float64Array;
  /** minX minY maxX maxY par triangle */
  b: Float64Array;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Triangles peints d'une même pièce, d'une même couleur et d'un même plan : une seule soustraction pour tous. */
interface FaceGroup {
  colorId: string;
  /** plan : profondeur au point (x, y) du dessin = (c − a·x − b·y) / cz */
  a: number;
  b: number;
  cz: number;
  c: number;
  tris: number[][];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Silhouette d'un maillage dans une vue : contours (unités Clipper) et leur emprise (mm du dessin). */
interface Silhouette {
  paths: Paths64;
  /** minX minY maxX maxY par contour */
  boxes: Float64Array;
}

/** Silhouettes gardées par maillage et par direction de vue (le modèle ne bouge pas). */
const silhouettes = new WeakMap<Mesh, Map<string, Silhouette>>();

/** Partie visible des faces peintes d'une vue (calcul d'un seul tenant ; voir `paintOverlaySteps`). */
export function computePaintOverlay(inp: PaintOverlayInput): PaintRegion[] {
  const job = paintOverlaySteps(inp);
  let r = job.next();
  while (!r.done) r = job.next();
  return r.value;
}

/**
 * Même calcul en étapes courtes (une face peinte, un morceau de silhouette…) : `next()` jusqu'à `done`. Permet de le
 * répartir sur plusieurs tâches du navigateur sans figer la page, et de l'abandonner (aperçu remplacé par un autre clic).
 */
export function* paintOverlaySteps(inp: PaintOverlayInput): Generator<void, PaintRegion[], void> {
  const { scene, painted, basis } = inp;
  const ids = inp.meshIds.filter((id) => painted.nodes.has(id));
  if (!ids.length) return [];
  const toward = new Vector3(...basis.toward);
  const right = new Vector3(...basis.right);
  const up = new Vector3(...basis.up);
  const viewKey = [...basis.right, ...basis.up, ...basis.toward].map((x) => x.toFixed(9)).join(',');
  // 1. triangles peints tournés vers l'observateur (repère du dessin), regroupés par pièce, couleur et plan
  const w = [new Vector3(), new Vector3(), new Vector3()];
  const e1 = new Vector3();
  const e2 = new Vector3();
  const n = new Vector3();
  const groups = new Map<string, FaceGroup>();
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
      n.crossVectors(e1, e2).multiplyScalar(sign);
      const len = n.length();
      if (len < 1e-9) continue;
      n.multiplyScalar(1 / len);
      if (n.dot(toward) <= FACING) continue;
      const p = w.flatMap((v) => [v.dot(right), v.dot(up)]);
      const a = n.dot(right);
      const b = n.dot(up);
      const cz = n.dot(toward);
      const c = n.dot(w[0]);
      // même plan à 1e-6 près (normale) et 0,01 mm (distance) : l'écart de profondeur reste négligeable devant FRONT_EPS
      const key = `${id}|${colorId}|${Math.round(a * 1e6)}|${Math.round(b * 1e6)}|${Math.round(cz * 1e6)}|${Math.round(c * 100)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { colorId, a, b, cz, c, tris: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }));
      g.tris.push(p);
      for (let k = 0; k < 6; k += 2) {
        g.minX = Math.min(g.minX, p[k]);
        g.maxX = Math.max(g.maxX, p[k]);
        g.minY = Math.min(g.minY, p[k + 1]);
        g.maxY = Math.max(g.maxY, p[k + 1]);
      }
      bx0 = Math.min(bx0, g.minX);
      bx1 = Math.max(bx1, g.maxX);
      by0 = Math.min(by0, g.minY);
      by1 = Math.max(by1, g.maxY);
    }
  }
  if (!groups.size) return [];
  // 2. maillages qui peuvent cacher (pièces dessinées dans la vue, dans l'emprise des faces peintes)
  const occ: OccMesh[] = [];
  const v = new Vector3();
  for (const id of inp.meshIds)
    for (const mesh of meshesOfNode(scene.objectsById.get(id))) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined;
      if (inp.glassTransparent && inp.isGlass?.(mat)) continue;
      const o = projectMesh(mesh, right, up, toward, [bx0, by0, bx1, by1], v);
      if (o) occ.push(o);
    }
  yield;
  // 3. partie visible de chaque groupe : ses triangles − ce qui est devant son plan
  const byColor = new Map<string, Paths64[]>();
  for (const g of groups.values()) {
    const depthAt = (x: number, y: number) => (g.c - g.a * x - g.b * y) / g.cz;
    const inFront = (o: OccMesh, t: number) => {
      const p = o.p;
      const d = o.d;
      let front = 0;
      for (let k = 0; k < 3; k++) if (d[t * 3 + k] > depthAt(p[t * 6 + k * 2], p[t * 6 + k * 2 + 1]) + FRONT_EPS) front++;
      if (front === 0) return false;
      if (front === 3) return true;
      // triangle qui traverse le plan : on juge sur son centre
      const cx = (p[t * 6] + p[t * 6 + 2] + p[t * 6 + 4]) / 3;
      const cy = (p[t * 6 + 1] + p[t * 6 + 3] + p[t * 6 + 5]) / 3;
      return (d[t * 3] + d[t * 3 + 1] + d[t * 3 + 2]) / 3 > depthAt(cx, cy) + FRONT_EPS;
    };
    const clip = new Paths64();
    for (const o of occ) {
      if (o.maxX <= g.minX || o.minX >= g.maxX || o.maxY <= g.minY || o.minY >= g.maxY) continue;
      // triangles de la pièce qui touchent l'emprise du groupe : devant ou non
      const hits: number[] = [];
      let behind = false;
      const bb = o.b;
      for (let t = 0; t < o.n; t++) {
        if (bb[t * 4 + 2] <= g.minX || bb[t * 4] >= g.maxX || bb[t * 4 + 3] <= g.minY || bb[t * 4 + 1] >= g.maxY) continue;
        if (inFront(o, t)) hits.push(t);
        else behind = true;
      }
      if (!hits.length) continue;
      // tout ce qui touche la face est devant : la silhouette de la pièce suffit (ses autres triangles ne la touchent pas)
      const cached = silhouettes.get(o.mesh)?.get(viewKey);
      if (!behind && (cached || (hits.length >= SILHOUETTE_MIN && hits.length >= o.n * SILHOUETTE_SHARE))) {
        const sil = cached ?? (yield* silhouetteSteps(o, viewKey));
        for (let i = 0; i < sil.paths.length; i++) {
          const b = sil.boxes;
          if (b[i * 4 + 2] <= g.minX || b[i * 4] >= g.maxX || b[i * 4 + 3] <= g.minY || b[i * 4 + 1] >= g.maxY) continue;
          clip.push(ownedPath(sil.paths[i]));
        }
      } else for (const t of hits) clip.push(path(o.p.subarray(t * 6, t * 6 + 6)));
    }
    const subject = new Paths64();
    for (const p of g.tris) subject.push(path(p));
    const visible = owned(clip.length ? Clipper.Difference(subject, clip, FillRule.NonZero) : Clipper.Union(subject, undefined, FillRule.NonZero));
    if (visible.length) {
      const l = byColor.get(g.colorId) ?? [];
      l.push(visible);
      byColor.set(g.colorId, l);
    }
    yield;
  }
  // 4. contours par couleur, régions (contour extérieur + trous), point d'ancrage
  const out: PaintRegion[] = [];
  for (const [colorId, parts] of byColor) {
    const merged = (yield* unionPairs(parts))
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
      yield;
    }
  }
  return out.sort((a, b) => b.area - a.area);
}

/**
 * Union de morceaux (chacun déjà propre) deux à deux, une étape par union. clipper2-js se trompe parfois quand on
 * lui donne d'un coup beaucoup de contours superposés aux bords communs (vitre de devant entière + morceaux troués de
 * la même vitre derrière : des trous apparaissaient dans la vitre de devant) ; deux à deux, le résultat est juste.
 */
function* unionPairs(parts: Paths64[]): Generator<void, Paths64, void> {
  let level = parts.length === 1 ? [owned(Clipper.Union(parts[0], undefined, FillRule.NonZero))] : parts;
  while (level.length > 1) {
    const next: Paths64[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? owned(Clipper.Union(level[i], level[i + 1], FillRule.NonZero)) : level[i]);
      yield;
    }
    level = next;
  }
  return level[0] ?? new Paths64();
}

/** Union des triangles projetés d'un maillage, par morceaux puis deux à deux (une étape par union), gardée. */
function* silhouetteSteps(o: OccMesh, viewKey: string): Generator<void, Silhouette, void> {
  const parts: Paths64[] = [];
  for (let s = 0; s < o.n; s += SILHOUETTE_CHUNK) {
    const chunk = new Paths64();
    for (let t = s; t < Math.min(o.n, s + SILHOUETTE_CHUNK); t++) chunk.push(path(o.p.subarray(t * 6, t * 6 + 6)));
    parts.push(owned(Clipper.Union(chunk, undefined, FillRule.NonZero)));
    yield;
  }
  const paths = parts.length > 1 ? yield* unionPairs(parts) : (parts[0] ?? new Paths64());
  const boxes = new Float64Array(paths.length * 4);
  paths.forEach((q, i) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const pt of q) {
      x0 = Math.min(x0, pt.x);
      y0 = Math.min(y0, pt.y);
      x1 = Math.max(x1, pt.x);
      y1 = Math.max(y1, pt.y);
    }
    boxes.set([x0 / K, y0 / K, x1 / K, y1 / K], i * 4);
  });
  const sil = { paths, boxes };
  let byView = silhouettes.get(o.mesh);
  if (!byView) silhouettes.set(o.mesh, (byView = new Map()));
  byView.set(viewKey, sil);
  // quelques directions par maillage suffisent (vues de la planche affichée) : les plus anciennes sont oubliées
  while (byView.size > 6) byView.delete(byView.keys().next().value!);
  return sil;
}

/**
 * Copie d'un résultat de Clipper. clipper2-js rend des contours dont les points sont partagés avec ses calculs
 * internes, et les opérations suivantes les modifient : un résultat gardé (silhouette, partie visible d'une face)
 * changeait après coup — l'ancien calcul y perdait des morceaux de faces pourtant entièrement visibles.
 */
function owned(ps: Paths64): Paths64 {
  const out = new Paths64();
  for (const q of ps) out.push(ownedPath(q));
  return out;
}

function ownedPath(q: Path64): Path64 {
  const flat: number[] = [];
  for (const pt of q) flat.push(pt.x, pt.y);
  return Clipper.makePath(flat);
}

function path(p: ArrayLike<number>): Path64 {
  // sens trigonométrique pour l'union NonZero
  const cross = (p[2] - p[0]) * (p[5] - p[1]) - (p[3] - p[1]) * (p[4] - p[0]);
  const pts = cross >= 0 ? [p[0], p[1], p[2], p[3], p[4], p[5]] : [p[0], p[1], p[4], p[5], p[2], p[3]];
  return Clipper.makePath(pts.map((x) => Math.round(x * K)));
}

/**
 * Triangles d'un maillage projetés dans le dessin (tous, vus par la tranche exclus : la silhouette ne dépend que de la
 * vue), si le maillage touche l'emprise [x0, y0, x1, y1] des faces peintes.
 */
function projectMesh(mesh: Mesh, right: Vector3, up: Vector3, toward: Vector3, box: number[], v: Vector3): OccMesh | null {
  const g = mesh.geometry as BufferGeometry;
  const pos = g.attributes.position;
  if (!pos) return null;
  mesh.updateWorldMatrix(true, false);
  if (!g.boundingSphere) g.computeBoundingSphere();
  const bs = g.boundingSphere!;
  const c = bs.center.clone().applyMatrix4(mesh.matrixWorld);
  const r = bs.radius * mesh.matrixWorld.getMaxScaleOnAxis();
  const cx = c.dot(right);
  const cy = c.dot(up);
  if (cx + r < box[0] || cx - r > box[2] || cy + r < box[1] || cy - r > box[3]) return null;
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
  const P = new Float64Array(tri * 6);
  const D = new Float64Array(tri * 3);
  const B = new Float64Array(tri * 4);
  let k = 0;
  let mx0 = Infinity;
  let my0 = Infinity;
  let mx1 = -Infinity;
  let my1 = -Infinity;
  for (let t = 0; t < tri; t++) {
    const a = idx ? idx.getX(t * 3) : t * 3;
    const b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
    const d = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
    // triangle vu par la tranche : ne cache rien
    if (Math.abs((px[b] - px[a]) * (py[d] - py[a]) - (py[b] - py[a]) * (px[d] - px[a])) < 1e-6) continue;
    const minX = Math.min(px[a], px[b], px[d]);
    const maxX = Math.max(px[a], px[b], px[d]);
    const minY = Math.min(py[a], py[b], py[d]);
    const maxY = Math.max(py[a], py[b], py[d]);
    P[k * 6] = px[a];
    P[k * 6 + 1] = py[a];
    P[k * 6 + 2] = px[b];
    P[k * 6 + 3] = py[b];
    P[k * 6 + 4] = px[d];
    P[k * 6 + 5] = py[d];
    D[k * 3] = pd[a];
    D[k * 3 + 1] = pd[b];
    D[k * 3 + 2] = pd[d];
    B[k * 4] = minX;
    B[k * 4 + 1] = minY;
    B[k * 4 + 2] = maxX;
    B[k * 4 + 3] = maxY;
    mx0 = Math.min(mx0, minX);
    my0 = Math.min(my0, minY);
    mx1 = Math.max(mx1, maxX);
    my1 = Math.max(my1, maxY);
    k++;
  }
  if (!k) return null;
  return { mesh, n: k, p: P.subarray(0, k * 6), d: D.subarray(0, k * 3), b: B.subarray(0, k * 4), minX: mx0, minY: my0, maxX: mx1, maxY: my1 };
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
