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
import { Box3, Vector3 } from 'three';
import type { BufferGeometry, Material, Mesh } from 'three';
import type { ViewBasis } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import { loopArea, poleOfInaccessibility } from '../core/paint/region';
import type { GlassTest } from './packets';
import type { PaintedScene } from './paintScene';
import { registerReleaser } from './memory';
import { nodeTriangles } from './paintScene';
import { moduleOfNode } from '../core/paint/resolve';

export interface PaintRegion {
  colorId: string;
  /** contour extérieur (sens trigo) + trous (autre sens), mm du dessin */
  loops: Float64Array[];
  /** point le plus intérieur (mm du dessin) et sa distance au bord (mm) ; d < 0 = petites régions réunies, sans repère */
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
/** régions d'une couleur qui gardent leur repère (les plus grandes) ; les autres = une seule région sans repère */
export const TAGGED_REGIONS = 24;

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
  /** profondeur la plus faible de ses sommets : une pièce entièrement derrière ne peut pas la cacher */
  minD: number;
  /** triangles d'une zone « côtés extérieurs » : déjà vus de dehors dans leur box (relevé paintExterior) */
  ext: boolean;
  module: string | null;
}

/** Pièce de la vue qui peut cacher : enveloppe (boîte monde projetée) d'abord, triangles projetés à la demande. */
interface OccCandidate {
  mesh: Mesh;
  module: string | null;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** profondeur maximale (vers l'observateur) */
  maxD: number;
  /** undefined = pas encore projetée, null = rien qui cache */
  occ?: OccMesh | null;
}

/** Silhouette d'un maillage dans une vue : contours (unités Clipper) et leur emprise (mm du dessin). */
interface Silhouette {
  /** clipper2-js a échoué sur ce maillage : ses triangles sont soustraits un par un */
  failed?: boolean;
  paths: Paths64;
  /** minX minY maxX maxY par contour */
  boxes: Float64Array;
}

/**
 * Silhouettes gardées par maillage et par direction de vue (le modèle ne bouge pas), avec un budget : avant, toutes
 * les silhouettes calculées restaient en mémoire toute la session (6 directions × chaque pièce d'un très gros modèle =
 * des centaines de Mo). Les plus anciennes partent d'abord ; refaites au besoin.
 */
const silhouettes = new Map<string, { mesh: Mesh; sil: Silhouette; points: number }>();
let silhouettePoints = 0;
/** ≈ 50 octets par point d'un contour clipper2-js : 3 M de points ≈ 150 Mo */
const SILHOUETTE_POINTS_MAX = 3_000_000;
const silKey = (mesh: Mesh, viewKey: string) => `${mesh.uuid}|${viewKey}`;
registerReleaser('paint-silhouettes', () => {
  silhouettes.clear();
  silhouettePoints = 0;
});

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
  let seenTris = 0;
  let bx0 = Infinity;
  let by0 = Infinity;
  let bx1 = -Infinity;
  let by1 = -Infinity;
  for (const id of ids) {
    const nt = nodeTriangles(scene, id);
    const tris = painted.nodes.get(id);
    if (!nt || !tris) continue;
    const mod = moduleOfNode(painted.ctx, id);
    const outs = painted.exteriorOut?.get(id);
    // étape courte toutes les 2 000 faces : une zone « côtés extérieurs » en compte des centaines de milliers sur un gros
    // modèle, d'un seul tenant la page se figeait à chaque coup de pinceau
    if (++seenTris > 2000) {
      seenTris = 0;
      yield;
    }
    for (const [t, { colorId, zoneId }] of tris) {
      if (++seenTris > 2000) {
        seenTris = 0;
        yield;
      }
      if (inp.only && !inp.only.has(colorId)) continue;
      // côté extérieur d'une box : on sait de quel côté il se voit — tourné à l'opposé de la vue, il ne se voit pas
      const out = outs?.get(t);
      if (out && out[0] * toward.x + out[1] * toward.y + out[2] * toward.z <= FACING) continue;
      nt.world(t, w);
      e1.subVectors(w[1], w[0]);
      e2.subVectors(w[2], w[0]);
      n.crossVectors(e1, e2);
      const len = n.length();
      if (len < 1e-9) continue;
      n.multiplyScalar(1 / len);
      // export SketchUp en faces simples (`doublesided_faces: false`) : le sens d'une face ne dit pas de quel côté on la
      // voit — une face retournée (envers vers l'extérieur, très courant) est dessinée par les lignes cachées (rayons
      // double face) et rendue en 3D (DoubleSide). On la prend donc dans le sens de l'observateur ; vue de l'autre côté
      // d'une pièce fermée, elle reste cachée par les faces de la pièce qui sont devant.
      if (n.dot(toward) < -FACING) n.negate();
      if (n.dot(toward) <= FACING) continue;
      const p = w.flatMap((v) => [v.dot(right), v.dot(up)]);
      const a = n.dot(right);
      const b = n.dot(up);
      const cz = n.dot(toward);
      const c = n.dot(w[0]);
      // même plan à 1e-6 près (normale) et 0,01 mm (distance) : l'écart de profondeur reste négligeable devant FRONT_EPS
      const ext = !!out && (painted.exteriorZones?.has(zoneId) ?? false);
      const key = `${id}|${colorId}|${ext ? 'e' : ''}|${Math.round(a * 1e6)}|${Math.round(b * 1e6)}|${Math.round(cz * 1e6)}|${Math.round(c * 100)}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { colorId, a, b, cz, c, tris: [], minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, minD: Infinity, ext, module: mod }));
      g.tris.push(p);
      for (const v of w) g.minD = Math.min(g.minD, v.dot(toward));
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
  // 2. pièces qui peuvent cacher : seulement leur enveloppe (8 coins de leur boîte), leurs triangles sont projetés plus
  // tard, et seulement si une face peinte peut être derrière. Projeter tout le modèle pour chaque vue (zone « côtés
  // extérieurs » = toute l'installation) remplissait la mémoire jusqu'à fermer l'onglet (Xiaomi, 04.11.2026).
  const cands: OccCandidate[] = [];
  const v = new Vector3();
  const box3 = new Box3();
  let seen = 0;
  for (const id of inp.meshIds) {
    const module = moduleOfNode(painted.ctx, id);
    for (const mesh of meshesOfNode(scene.objectsById.get(id))) {
      const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined;
      if (inp.glassTransparent && inp.isGlass?.(mat)) continue;
      const g = mesh.geometry as BufferGeometry;
      if (!g.attributes.position) continue;
      if (!g.boundingBox) g.computeBoundingBox();
      mesh.updateWorldMatrix(true, false);
      box3.copy(g.boundingBox!);
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let d1 = -Infinity;
      for (let k = 0; k < 8; k++) {
        v.set(k & 1 ? box3.max.x : box3.min.x, k & 2 ? box3.max.y : box3.min.y, k & 4 ? box3.max.z : box3.min.z).applyMatrix4(mesh.matrixWorld);
        const x = v.dot(right);
        const y = v.dot(up);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
        d1 = Math.max(d1, v.dot(toward));
      }
      if (x1 <= bx0 || x0 >= bx1 || y1 <= by0 || y0 >= by1) continue;
      cands.push({ mesh, module, minX: x0, minY: y0, maxX: x1, maxY: y1, maxD: d1 });
    }
    if (++seen % 500 === 0) yield;
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
    // face d'un côté extérieur tourné vers la vue et vue de face : sa propre box a déjà été vérifiée le long de ce côté
    // (relevé paintExterior) — les autres pièces (autres box, éléments communs) restent testées
    const ownChecked = g.ext && g.cz >= 0.98 && g.module !== null;
    for (const cand of cands) {
      if (cand.maxX <= g.minX || cand.minX >= g.maxX || cand.maxY <= g.minY || cand.minY >= g.maxY) continue;
      // entièrement derrière la face (au plus au niveau de son point le plus reculé) : ne peut pas la cacher
      if (cand.maxD <= g.minD + FRONT_EPS) continue;
      if (ownChecked && cand.module === g.module) continue;
      if (cand.occ === undefined) {
        cand.occ = projectMesh(cand.mesh, right, up, toward, [bx0, by0, bx1, by1], v);
        yield;
      }
      const o = cand.occ;
      if (!o) continue;
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
      const cached = silhouettes.get(silKey(o.mesh, viewKey))?.sil;
      const sil = !behind && (cached || (hits.length >= SILHOUETTE_MIN && hits.length >= o.n * SILHOUETTE_SHARE)) ? cached ?? (yield* silhouetteSteps(o, viewKey)) : null;
      // silhouette impossible (Clipper) : les triangles un par un
      if (sil && !sil.failed) {
        for (let i = 0; i < sil.paths.length; i++) {
          const b = sil.boxes;
          if (b[i * 4 + 2] <= g.minX || b[i * 4] >= g.maxX || b[i * 4 + 3] <= g.minY || b[i * 4 + 1] >= g.maxY) continue;
          clip.push(ownedPath(sil.paths[i]));
        }
      } else
        for (const t of hits) {
          const q = path(o.p.subarray(t * 6, t * 6 + 6));
          if (q) clip.push(q);
        }
    }
    const subject = new Paths64();
    for (const p of g.tris) {
      const q = path(p);
      if (q) subject.push(q);
    }
    if (!subject.length) continue;
    const visible = visiblePart(subject, clip);
    if (visible.length) {
      const l = byColor.get(g.colorId) ?? [];
      l.push(visible);
      byColor.set(g.colorId, l);
    }
    yield;
  }
  // 4. contours par couleur, régions (contour extérieur + trous), point d'ancrage. Façade très détaillée (bardage,
  // profils, boulons : une région par pièce, des dizaines de milliers par vue) : seules les plus grandes régions gardent
  // leur repère ; les autres sont réunies en une région par couleur, sans repère (anchor.d = −1), et tous les contours
  // d'une couleur partagent un seul tableau (avant : ≈ 20 Mo gardés par vue, 400 vues gardées = l'onglet fermé).
  const out: PaintRegion[] = [];
  for (const [colorId, parts] of byColor) {
    // réunion seulement des morceaux dont les emprises se recouvrent : les autres ne peuvent pas se toucher en surface
    // (réunir d'un bloc les faces visibles de toute une façade de bardage = plusieurs secondes de Clipper par vue)
    const merged0: Paths64 = new Paths64();
    let steps = 0;
    for (const cluster of overlapClusters(parts)) {
      const u = cluster.length === 1 ? cluster[0] : yield* unionPairs(cluster);
      for (const q of u) merged0.push(q);
      if (++steps % 2000 === 0) yield;
    }
    const raw = [...merged0].map((q) => Clipper.trimCollinear(Clipper.stripDuplicates(q, true))).filter((q) => q.length >= 3);
    let total = 0;
    for (const q of raw) total += q.length * 2;
    const buf = new Float64Array(total);
    const merged: Float64Array[] = [];
    let o = 0;
    for (const q of raw) {
      const start = o;
      for (const pt of q) {
        buf[o++] = pt.x / K;
        buf[o++] = pt.y / K;
      }
      merged.push(buf.subarray(start, o));
    }
    yield;
    const outers = merged.map((l) => ({ l, a: loopArea(l) })).filter((x) => x.a > 0);
    const holes = merged.filter((l) => loopArea(l) < 0);
    // trous rangés dans leur contour (boîte d'abord : des milliers de contours sur une grande façade)
    const boxOf = (l: Float64Array) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (let i = 0; i < l.length; i += 2) {
        if (l[i] < x0) x0 = l[i];
        if (l[i] > x1) x1 = l[i];
        if (l[i + 1] < y0) y0 = l[i + 1];
        if (l[i + 1] > y1) y1 = l[i + 1];
      }
      return [x0, y0, x1, y1];
    };
    const holeBoxes = holes.map(boxOf);
    const regions: Array<{ loops: Float64Array[]; area: number }> = [];
    for (const [n, { l, a }] of outers.entries()) {
      const b = boxOf(l);
      const mine: Float64Array[] = [];
      let area = a;
      holes.forEach((h, i) => {
        const hb = holeBoxes[i];
        if (hb[0] < b[0] || hb[2] > b[2] || hb[1] < b[1] || hb[3] > b[3]) return;
        if (!insideLoop(h[0], h[1], l)) return;
        mine.push(h);
        area += loopArea(h);
      });
      if (area >= 1) regions.push({ loops: [l, ...mine], area });
      if (n % 2000 === 1999) yield;
    }
    regions.sort((x, y) => y.area - x.area);
    const tail: Float64Array[] = [];
    let tailArea = 0;
    for (const [i, r] of regions.entries()) {
      if (i < TAGGED_REGIONS) {
        out.push({ colorId, loops: r.loops, anchor: poleOfInaccessibility(r.loops, 1), area: r.area });
        yield;
      } else {
        for (const l of r.loops) tail.push(l);
        tailArea += r.area;
      }
    }
    if (tail.length) out.push({ colorId, loops: tail, anchor: { x: tail[0][0], y: tail[0][1], d: -1 }, area: tailArea });
  }
  return out.sort((a, b) => b.area - a.area);
}

/**
 * Contours de morceaux déjà propres chacun (sortie de Clipper : sans recouvrement, trous dans leur contour), regroupés
 * quand leurs emprises se recouvrent (surface > 0), de proche en proche. Un groupe venu d'un seul morceau n'a pas
 * besoin d'être réuni ; les autres sont réunis (Clipper) — seulement là où deux morceaux se touchent vraiment.
 */
export function overlapClusters(parts: Paths64[]): Paths64[][] {
  const loops: Path64[] = [];
  const owner: number[] = [];
  parts.forEach((ps, i) => {
    for (const q of ps) {
      loops.push(q);
      owner.push(i);
    }
  });
  const n = loops.length;
  const box = new Float64Array(n * 4);
  loops.forEach((q, i) => {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const pt of q) {
      if (pt.x < x0) x0 = pt.x;
      if (pt.x > x1) x1 = pt.x;
      if (pt.y < y0) y0 = pt.y;
      if (pt.y > y1) y1 = pt.y;
    }
    box[i * 4] = x0;
    box[i * 4 + 1] = y0;
    box[i * 4 + 2] = x1;
    box[i * 4 + 3] = y1;
  });
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  // balayage en x : seuls les contours qui se chevauchent en x sont comparés
  const order = [...Array(n).keys()].sort((a, b) => box[a * 4] - box[b * 4]);
  let active: number[] = [];
  for (const i of order) {
    const x0 = box[i * 4];
    active = active.filter((j) => box[j * 4 + 2] > x0);
    for (const j of active) if (box[j * 4 + 3] > box[i * 4 + 1] && box[j * 4 + 1] < box[i * 4 + 3]) parent[find(i)] = find(j);
    active.push(i);
  }
  // groupe → morceau d'origine → ses contours (réunis ensuite deux à deux, voir unionPairs)
  const groups = new Map<number, Map<number, Paths64>>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = new Map()));
    let ps = g.get(owner[i]);
    if (!ps) g.set(owner[i], (ps = new Paths64()));
    ps.push(loops[i]);
  }
  return [...groups.values()].map((g) => [...g.values()]);
}

/**
 * Union de morceaux (chacun déjà propre) deux à deux, une étape par union. clipper2-js se trompe parfois quand on
 * lui donne d'un coup beaucoup de contours superposés aux bords communs (vitre de devant entière + morceaux troués de
 * la même vitre derrière : des trous apparaissaient dans la vitre de devant) ; deux à deux, le résultat est juste.
 */
function* unionPairs(parts: Paths64[]): Generator<void, Paths64, void> {
  let level = parts.length === 1 ? [unionTwo(parts[0], new Paths64())] : parts;
  while (level.length > 1) {
    const next: Paths64[] = [];
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? unionTwo(level[i], level[i + 1]) : level[i]);
      yield;
    }
    level = next;
  }
  return level[0] ?? new Paths64();
}

/** Union de deux morceaux ; si clipper2-js plante, les deux sont gardés tels quels (déjà propres chacun). */
function unionTwo(a: Paths64, b: Paths64): Paths64 {
  try {
    return owned(Clipper.Union(a, b, FillRule.NonZero));
  } catch {
    const out = new Paths64();
    for (const q of a) out.push(q);
    for (const q of b) out.push(q);
    return out;
  }
}

/** Union des triangles projetés d'un maillage, par morceaux puis deux à deux (une étape par union), gardée. */
function* silhouetteSteps(o: OccMesh, viewKey: string): Generator<void, Silhouette, void> {
  const parts: Paths64[] = [];
  let paths: Paths64;
  try {
    for (let s = 0; s < o.n; s += SILHOUETTE_CHUNK) {
      const chunk = new Paths64();
      for (let t = s; t < Math.min(o.n, s + SILHOUETTE_CHUNK); t++) {
        const q = path(o.p.subarray(t * 6, t * 6 + 6));
        if (q) chunk.push(q);
      }
      parts.push(owned(Clipper.Union(chunk, undefined, FillRule.NonZero)));
      yield;
    }
    paths = parts.length > 1 ? yield* unionPairs(parts) : (parts[0] ?? new Paths64());
  } catch {
    const failed: Silhouette = { failed: true, paths: new Paths64(), boxes: new Float64Array(0) };
    remember(o.mesh, viewKey, failed);
    return failed;
  }
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
  remember(o.mesh, viewKey, sil);
  return sil;
}

function remember(mesh: Mesh, viewKey: string, sil: Silhouette): void {
  const k = silKey(mesh, viewKey);
  const prev = silhouettes.get(k);
  if (prev) {
    silhouettePoints -= prev.points;
    silhouettes.delete(k);
  }
  let points = 0;
  for (const p of sil.paths) points += p.length;
  silhouettes.set(k, { mesh, sil, points });
  silhouettePoints += points;
  // les plus anciennes d'abord (ordre d'insertion)
  while (silhouettePoints > SILHOUETTE_POINTS_MAX && silhouettes.size > 1) {
    const [first, v] = silhouettes.entries().next().value!;
    silhouettes.delete(first);
    silhouettePoints -= v.points;
  }
}

/**
 * Face − ce qui est devant elle. clipper2-js plante parfois sur une grande opération (contours presque confondus
 * d'un vrai modèle) : on refait alors la soustraction par paquets de triangles, plus petits.
 */
function visiblePart(subject: Paths64, clip: Paths64): Paths64 {
  if (!clip.length) return owned(Clipper.Union(subject, undefined, FillRule.NonZero));
  try {
    return owned(Clipper.Difference(subject, clip, FillRule.NonZero));
  } catch {
    let rest = owned(Clipper.Union(subject, undefined, FillRule.NonZero));
    for (let i = 0; i < clip.length && rest.length; i += 64) {
      const part = new Paths64();
      for (const q of clip.slice(i, i + 64)) part.push(q);
      try {
        rest = owned(Clipper.Difference(rest, part, FillRule.NonZero));
      } catch {
        // dernier recours : triangle par triangle (un triangle qui fait encore planter Clipper est ignoré)
        for (const q of part) {
          const one = new Paths64();
          one.push(q);
          try {
            rest = owned(Clipper.Difference(rest, one, FillRule.NonZero));
          } catch {
            /* triangle dégénéré pour Clipper */
          }
        }
      }
    }
    return rest;
  }
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

/** Triangle en unités Clipper, sens trigonométrique (union NonZero) ; null s'il est plat une fois arrondi au 1/100 mm. */
function path(p: ArrayLike<number>): Path64 | null {
  const q = [0, 1, 2, 3, 4, 5].map((i) => Math.round(p[i] * K));
  const cross = (q[2] - q[0]) * (q[5] - q[1]) - (q[3] - q[1]) * (q[4] - q[0]);
  if (cross === 0) return null;
  return Clipper.makePath(cross > 0 ? q : [q[0], q[1], q[4], q[5], q[2], q[3]]);
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
