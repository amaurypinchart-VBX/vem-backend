// Moteur de vues 2D vectorielles : projection + retrait des lignes cachées (three-edge-projection / three-mesh-bvh).
// Tourne dans un Web Worker (hlr.worker.ts) ; aucune dépendance au DOM. Les vitrages peuvent être exclus des
// occultants (on voit la structure à travers) tout en gardant leurs arêtes.
import { BufferAttribute, BufferGeometry, DoubleSide, Line3, Matrix4, Ray, Vector3 } from 'three';
import type { Plane } from 'three';
import { ExtendedTriangle, MeshBVH, SAH } from 'three-mesh-bvh';
import { generateIntersectionEdges } from 'three-edge-projection/src/utils/generateIntersectionEdges.js';
import { LineObjectsBVH } from 'three-edge-projection/src/utils/LineObjectsBVH.js';
import { isLineTriangleEdge } from 'three-edge-projection/src/utils/triangleLineUtils.js';
import { trimToBeneathTriPlane } from 'three-edge-projection/src/utils/trimToBeneathTriPlane.js';
import { getProjectedLineOverlap } from 'three-edge-projection/src/utils/getProjectedLineOverlap.js';
import { appendOverlapRange } from 'three-edge-projection/src/utils/getProjectedOverlaps.js';
import { overlapsToLines } from 'three-edge-projection/src/utils/overlapUtils.js';
import type { Vec3, ViewBasis } from '../core/views';
import { dot, viewRows } from '../core/views';
import type { SegmentSoup } from '../core/lines2d';
import { DEFAULT_CLEAN, chainPolylines, concatSoups, makeSoup, mergeCollinear, pushSegment, snapPointsOf, soupBounds } from '../core/lines2d';
import type { LineStyleSpec, Linework2D, LineworkLayer } from './types';
import { PRIO, PRIO_LAYER } from './types';

/** Sous-ensemble du modèle prêt à projeter : géométrie monde (mm) recentrée, objets à la suite. */
export interface HlrPacket {
  /** positions monde − `center`, 3 nombres par sommet */
  positions: Float32Array;
  /** indices des triangles, locaux à chaque objet */
  indices: Uint32Array;
  vertexStart: Uint32Array;
  vertexCount: Uint32Array;
  indexStart: Uint32Array;
  indexCount: Uint32Array;
  /** 1 par triangle (ordre global indices / 3) : 1 = vitrage */
  glass: Uint8Array;
  /** identifiant du nœud d'origine de chaque objet (accessoire, sinon l'objet lui-même) */
  sourceIds: string[];
  center: Vec3;
}

export interface HlrJob {
  basis: ViewBasis;
  style: LineStyleSpec;
  cacheKey: string;
}

export type HlrProgress = (fraction: number, message: string) => void;

/** Arête 3D + objet d'origine (la construction du BVH réordonne le tableau des arêtes sur place). */
type OwnedEdge = Line3 & { owner: number };

/** Décalage des arêtes vers l'observateur : évite qu'une arête soit cachée par sa propre face (mm). */
const EDGE_LIFT = 0.005;
/** Écart latéral des sondes du test de contour (mm modèle). */
const SILHOUETTE_PROBE = 0.5;

interface Prepared {
  meshCount: number;
  /** positions dans l'espace de projection (X = droite, Y = vers l'observateur, Z = droite × Y) */
  view: Float64Array;
  geometries: BufferGeometry[];
  /** étendue projetée de chaque objet (plus grande dimension, mm) */
  extent: Float64Array;
  boxes: Float64Array;
  minY: number;
  maxY: number;
}

function prepare(packet: HlrPacket, basis: ViewBasis): Prepared {
  const [r, t, z] = viewRows(basis);
  const p = packet.positions;
  const view = new Float64Array(p.length);
  let maxY = -Infinity;
  let minY = Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i];
    const y = p[i + 1];
    const w = p[i + 2];
    view[i] = r[0] * x + r[1] * y + r[2] * w;
    view[i + 1] = t[0] * x + t[1] * y + t[2] * w;
    view[i + 2] = z[0] * x + z[1] * y + z[2] * w;
    if (view[i + 1] > maxY) maxY = view[i + 1];
    if (view[i + 1] < minY) minY = view[i + 1];
  }
  const meshCount = packet.vertexStart.length;
  const geometries: BufferGeometry[] = [];
  const extent = new Float64Array(meshCount);
  const boxes = new Float64Array(meshCount * 6);
  for (let m = 0; m < meshCount; m++) {
    const vs = packet.vertexStart[m];
    const vc = packet.vertexCount[m];
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(view.subarray(vs * 3, (vs + vc) * 3), 3));
    g.setIndex(new BufferAttribute(packet.indices.subarray(packet.indexStart[m], packet.indexStart[m] + packet.indexCount[m]), 1));
    geometries.push(g);
    let x0 = Infinity;
    let y0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let z1 = -Infinity;
    for (let v = vs; v < vs + vc; v++) {
      const x = view[v * 3];
      const y = view[v * 3 + 1];
      const w = view[v * 3 + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (w < z0) z0 = w;
      if (w > z1) z1 = w;
    }
    boxes.set([x0, y0, z0, x1, y1, z1], m * 6);
    extent[m] = Math.max(x1 - x0, z1 - z0);
  }
  return { meshCount, view, geometries, extent, boxes, minY, maxY };
}

/** Soupe de triangles (sans index) dans l'espace de projection, pour les BVH d'occultation / de contour. */
function triangleSoup(packet: HlrPacket, prep: Prepared, keep: (globalTri: number) => boolean, skipEdgeOn = false): BufferGeometry | null {
  const total = packet.indices.length / 3;
  const take = new Uint8Array(total);
  let n = 0;
  for (let m = 0; m < prep.meshCount; m++) {
    const vs = packet.vertexStart[m];
    const is = packet.indexStart[m];
    const ic = packet.indexCount[m];
    for (let k = 0; k < ic; k += 3) {
      const tri = (is + k) / 3;
      if (!keep(tri)) continue;
      if (skipEdgeOn) {
        // triangle vu par la tranche (normale ⟂ direction de vue) : il ne cache rien
        const a = (vs + packet.indices[is + k]) * 3;
        const b = (vs + packet.indices[is + k + 1]) * 3;
        const c = (vs + packet.indices[is + k + 2]) * 3;
        const v = prep.view;
        const area2 = Math.abs((v[b] - v[a]) * (v[c + 2] - v[a + 2]) - (v[b + 2] - v[a + 2]) * (v[c] - v[a]));
        if (area2 < 1e-6) continue;
      }
      take[tri] = 1;
      n++;
    }
  }
  if (!n) return null;
  const out = new Float32Array(n * 9);
  let o = 0;
  for (let m = 0; m < prep.meshCount; m++) {
    const vs = packet.vertexStart[m];
    const is = packet.indexStart[m];
    const ic = packet.indexCount[m];
    for (let k = 0; k < ic; k += 3) {
      if (!take[(is + k) / 3]) continue;
      for (let j = 0; j < 3; j++) {
        const v = (vs + packet.indices[is + k + j]) * 3;
        out[o++] = prep.view[v];
        out[o++] = prep.view[v + 1];
        out[o++] = prep.view[v + 2];
      }
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(out, 3));
  return g;
}

function boxesOverlap(b: Float64Array, i: number, j: number): boolean {
  const eps = 0.01;
  return (
    b[i * 6] <= b[j * 6 + 3] + eps &&
    b[j * 6] <= b[i * 6 + 3] + eps &&
    b[i * 6 + 1] <= b[j * 6 + 4] + eps &&
    b[j * 6 + 1] <= b[i * 6 + 4] + eps &&
    b[i * 6 + 2] <= b[j * 6 + 5] + eps &&
    b[j * 6 + 2] <= b[i * 6 + 5] + eps
  );
}

/**
 * Arêtes d'un objet dans l'espace de projection : bords libres, arêtes vives (angle entre faces ≥ seuil) et
 * contours apparents (une face tournée vers l'observateur, l'autre non). Pour un solide fermé, les arêtes dont les
 * deux faces tournent le dos à l'observateur sont forcément cachées par l'objet lui-même : on les saute, et seules
 * ses faces tournées vers l'observateur servent d'occultants (le résultat est identique, en deux fois moins de calcul).
 */
function extractEdges(
  packet: HlrPacket,
  prep: Prepared,
  m: number,
  cosThreshold: number,
  edges: OwnedEdge[],
  occluder: Uint8Array,
): void {
  const view = prep.view;
  const vs = packet.vertexStart[m];
  const is = packet.indexStart[m];
  const ic = packet.indexCount[m];
  const triCount = ic / 3;
  // sommets confondus (les sous-maillages d'un même objet ont chacun leurs sommets) → identifiant commun
  const ids = new Map<string, number>();
  const canon = new Int32Array(packet.vertexCount[m]);
  for (let i = 0; i < canon.length; i++) {
    const o = (vs + i) * 3;
    const k = `${Math.round(view[o] * 1000)},${Math.round(view[o + 1] * 1000)},${Math.round(view[o + 2] * 1000)}`;
    let id = ids.get(k);
    if (id === undefined) {
      id = ids.size;
      ids.set(k, id);
    }
    canon[i] = id;
  }
  const nx = new Float64Array(triCount);
  const ny = new Float64Array(triCount);
  const nz = new Float64Array(triCount);
  const valid = new Uint8Array(triCount);
  // arête (a < b) → premier triangle, second triangle, nombre de triangles
  const edgeFirst = new Map<number, number>();
  const edgeSecond = new Map<number, number>();
  const edgeCount = new Map<number, number>();
  const edgeVerts = new Map<number, number>();
  const edgeDir = new Map<number, number>();
  const stride = ids.size + 1;
  let consistent = true;
  let volume = 0;
  const ox = view[vs * 3];
  const oy = view[vs * 3 + 1];
  const oz = view[vs * 3 + 2];
  for (let t = 0; t < triCount; t++) {
    const ia = packet.indices[is + t * 3];
    const ib = packet.indices[is + t * 3 + 1];
    const ic2 = packet.indices[is + t * 3 + 2];
    const a = (vs + ia) * 3;
    const b = (vs + ib) * 3;
    const c = (vs + ic2) * 3;
    const ux = view[b] - view[a];
    const uy = view[b + 1] - view[a + 1];
    const uz = view[b + 2] - view[a + 2];
    const wx = view[c] - view[a];
    const wy = view[c + 1] - view[a + 1];
    const wz = view[c + 2] - view[a + 2];
    let x = uy * wz - uz * wy;
    let y = uz * wx - ux * wz;
    let z = ux * wy - uy * wx;
    const l = Math.hypot(x, y, z);
    const ca = canon[ia];
    const cb = canon[ib];
    const cc = canon[ic2];
    if (l < 1e-9 || ca === cb || cb === cc || cc === ca) continue;
    // volume signé (orientation du solide : faces retournées dans SketchUp = volume négatif)
    const ax = view[a] - ox;
    const ay = view[a + 1] - oy;
    const az = view[a + 2] - oz;
    volume += ax * x + ay * y + az * z;
    x /= l;
    y /= l;
    z /= l;
    nx[t] = x;
    ny[t] = y;
    nz[t] = z;
    valid[t] = 1;
    const pairs = [
      [ca, cb, ia, ib],
      [cb, cc, ib, ic2],
      [cc, ca, ic2, ia],
    ];
    for (const [p, q, ip, iq] of pairs) {
      const key = p < q ? p * stride + q : q * stride + p;
      const dir = p < q ? 1 : -1;
      const n = edgeCount.get(key) ?? 0;
      if (n === 0) {
        edgeFirst.set(key, t);
        edgeVerts.set(key, ip * 4_194_304 + iq);
        edgeDir.set(key, dir);
      } else if (n === 1) {
        edgeSecond.set(key, t);
        // deux faces voisines bien orientées parcourent leur arête commune en sens opposés
        if (edgeDir.get(key) === dir) consistent = false;
      }
      edgeCount.set(key, n + 1);
    }
  }
  // solide fermé et orienté de façon cohérente : seul cas où l'on peut ignorer sa face arrière
  let closed = consistent && Math.abs(volume) > 1e-6;
  if (closed)
    for (const n of edgeCount.values())
      if (n !== 2) {
        closed = false;
        break;
      }
  const sign = volume < 0 ? -1 : 1; // solide retourné : l'avant et l'arrière de ses faces sont inversés
  const BACK = -1e-6;
  for (let t = 0; t < triCount; t++) if (valid[t] && (!closed || sign * ny[t] >= BACK)) occluder[is / 3 + t] = 1;
  for (const [key, n] of edgeCount) {
    let draw = n !== 2; // bord libre ou arête non manifold
    if (!draw) {
      const t1 = edgeFirst.get(key)!;
      const t2 = edgeSecond.get(key)!;
      const back1 = sign * ny[t1] < BACK;
      const back2 = sign * ny[t2] < BACK;
      if (closed && back1 && back2) continue;
      const d = nx[t1] * nx[t2] + ny[t1] * ny[t2] + nz[t1] * nz[t2];
      draw = d <= cosThreshold || back1 !== back2;
    }
    if (!draw) continue;
    const packed = edgeVerts.get(key)!;
    const a = (vs + Math.floor(packed / 4_194_304)) * 3;
    const b = (vs + (packed % 4_194_304)) * 3;
    if (Math.abs(view[a] - view[b]) + Math.abs(view[a + 2] - view[b + 2]) < 1e-6) continue; // vue en bout
    const e = new Line3(new Vector3(view[a], view[a + 1] + EDGE_LIFT, view[a + 2]), new Vector3(view[b], view[b + 1] + EDGE_LIFT, view[b + 2])) as OwnedEdge;
    e.owner = m;
    edges.push(e);
  }
}

type PlaneTriangle = ExtendedTriangle & { plane: Plane; needsUpdate: boolean; update(): void };
const _tri = new ExtendedTriangle() as PlaneTriangle;
_tri.update = function update(this: PlaneTriangle) {
  // seul le plan du triangle sert (comme dans three-edge-projection)
  this.plane.setFromCoplanarPoints(this.a, this.b, this.c);
  this.needsUpdate = false;
};
const _beneath = new Line3();
const _overlap = new Line3();

/**
 * Parties cachées de chaque arête : portions situées sous un triangle occultant, en projection le long de Y.
 * Variante de `bvhcastEdges` (three-edge-projection) qui ne teste plus une arête déjà entièrement cachée : en vue
 * de dessus, le toit cache presque tout l'intérieur.
 */
function occludeEdges(edgesBvh: LineObjectsBVH, bvh: MeshBVH, hidden: Array<Array<[number, number]>>): void {
  const lines = edgesBvh.lines as OwnedEdge[];
  const geometry = bvh.geometry;
  const pos = geometry.attributes.position;
  const index = geometry.index!;
  const identity = new Matrix4();
  edgesBvh.bvhcast(bvh, identity, {
    intersectsRanges: (edgeOffset: number, edgeCount: number, triOffset: number, triCount: number) => {
      for (let i = triOffset, l = triOffset + triCount; i < l; i++) {
        const { a, b, c } = _tri;
        a.fromBufferAttribute(pos, index.getX(3 * i));
        b.fromBufferAttribute(pos, index.getX(3 * i + 1));
        c.fromBufferAttribute(pos, index.getX(3 * i + 2));
        _tri.needsUpdate = true;
        _tri.update();
        const triMaxY = Math.max(a.y, b.y, c.y);
        const triMinY = Math.min(a.y, b.y, c.y);
        for (let e = edgeOffset, le = edgeOffset + edgeCount; e < le; e++) {
          const ov = hidden[e];
          if (ov.length === 1 && ov[0][0] <= 0 && ov[0][1] >= 1) continue; // déjà entièrement cachée
          const line = lines[e];
          const lineMinY = Math.min(line.start.y, line.end.y);
          if (triMaxY <= lineMinY) continue;
          if (isLineTriangleEdge(_tri, line)) continue;
          const lineMaxY = Math.max(line.start.y, line.end.y);
          if (lineMaxY < triMinY) _beneath.copy(line);
          else if (!trimToBeneathTriPlane(_tri, line, _beneath)) continue;
          if (_beneath.distance() < 1e-10) continue;
          if (getProjectedLineOverlap(_beneath, _tri, _overlap)) appendOverlapRange(line, _overlap, ov);
        }
      }
      return false;
    },
  });
}

/**
 * Calcule une vue : arêtes vives + contours apparents, retrait des lignes cachées, nettoyage 2D, calques.
 * Retourne les traits en mm modèle dans le repère du dessin.
 */
export function computeView(packet: HlrPacket, job: HlrJob, onProgress: HlrProgress = () => {}): Linework2D {
  const t0 = performance.now();
  const timings: Record<string, number> = {};
  let tLast = t0;
  const lap = (name: string) => {
    const now = performance.now();
    timings[name] = Math.round(now - tLast);
    tLast = now;
  };
  const { basis, style } = job;
  const prep = prepare(packet, basis);
  lap('prepare');
  const cx = dot(basis.right, packet.center);
  const cy = dot(basis.up, packet.center);

  // 1. Arêtes : vives (angle entre faces) + contours apparents + bords libres, objet par objet
  onProgress(0.05, 'Extraction des arêtes');
  const edges: OwnedEdge[] = [];
  const occluder = new Uint8Array(packet.indices.length / 3);
  const cosThreshold = Math.cos((style.angleThresholdDeg * Math.PI) / 180);
  // détails plus petits que le seuil (vis, écrous… de quelques dixièmes de mm sur le papier) : pas de traits,
  // mais ils cachent toujours ce qu'il y a derrière
  const detailModel = style.detailMinPaperMm * style.scaleDenominator;
  for (let m = 0; m < prep.meshCount; m++) {
    if (prep.extent[m] < detailModel) occluder.fill(1, packet.indexStart[m] / 3, (packet.indexStart[m] + packet.indexCount[m]) / 3);
    else extractEdges(packet, prep, m, cosThreshold, edges, occluder);
  }
  if (style.intersectionEdges) {
    onProgress(0.15, 'Arêtes d’intersection');
    const bvhs = prep.geometries.map((g) => new MeshBVH(g, { targetLeafSize: 1 }));
    const identity = new Matrix4();
    for (let a = 0; a < prep.meshCount; a++)
      for (let b = a + 1; b < prep.meshCount; b++) {
        if (!boxesOverlap(prep.boxes, a, b)) continue;
        for (const e of generateIntersectionEdges(bvhs[a], bvhs[b], identity, []) as OwnedEdge[]) {
          e.start.y += EDGE_LIFT;
          e.end.y += EDGE_LIFT;
          e.owner = a;
          edges.push(e);
        }
      }
  }

  lap('edges');
  // 2. Occultants : tous les triangles, sauf les vitrages si « vitres transparentes »
  onProgress(0.25, 'Retrait des lignes cachées');
  const occGeom = triangleSoup(packet, prep, (tri) => occluder[tri] === 1 && !(style.glassTransparent && packet.glass[tri]), true);
  const hidden: Array<Array<[number, number]>> = edges.map(() => []);
  if (occGeom && edges.length) {
    const occBvh = new MeshBVH(occGeom, { strategy: SAH });
    // chaque arête cherche ses occultants au-dessus d'elle jusqu'à `heightOffset` : toute la profondeur du modèle
    // (la valeur par défaut, 1000, suppose un modèle en mètres ; ici tout est en mm)
    const edgesBvh = new LineObjectsBVH(edges, { targetLeafSize: 2, strategy: SAH, heightOffset: prep.maxY - prep.minY + 10 });
    lap('bvh');
    occludeEdges(edgesBvh, occBvh, hidden);
  }
  lap('occlusion');

  // 3. Segments visibles / cachés → repère du dessin (x, y) = (X, −Z) + centre
  onProgress(0.7, 'Nettoyage du dessin');
  const fineModel = style.fineThresholdPaperMm * style.scaleDenominator;
  const visible = makeSoup(edges.length * 2);
  const hiddenSoup = makeSoup(style.hiddenLines ? edges.length : 16);
  const pieces: Float32Array[] = [];
  for (let i = 0; i < edges.length; i++) {
    const owner = edges[i].owner;
    const prio = prep.extent[owner] < fineModel ? PRIO.fine : PRIO.visible;
    pieces.length = 0;
    overlapsToLines(edges[i], hidden[i], false, pieces);
    for (const s of pieces) pushSegment(visible, s[0] + cx, -s[2] + cy, s[3] + cx, -s[5] + cy, prio, owner);
    if (style.hiddenLines && hidden[i].length) {
      pieces.length = 0;
      overlapsToLines(edges[i], hidden[i], true, pieces);
      for (const s of pieces) pushSegment(hiddenSoup, s[0] + cx, -s[2] + cy, s[3] + cx, -s[5] + cy, PRIO.hidden, owner);
    }
  }
  const rawCount = visible.count;
  lap('segments');
  let merged = mergeCollinear(visible, DEFAULT_CLEAN);
  lap('merge');

  // 4. Contour : un trait visible dont un côté ne donne sur aucune géométrie (vitrages compris)
  onProgress(0.85, 'Contours');
  const allGeom = triangleSoup(packet, prep, () => true);
  if (allGeom && merged.count) {
    const bvh = new MeshBVH(allGeom, { strategy: SAH });
    const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));
    const top = prep.maxY + 10;
    const c = merged.coords;
    const hitAt = (x: number, y: number) => {
      ray.origin.set(x - cx, top, -(y - cy));
      return bvh.raycastFirst(ray, DoubleSide) !== null;
    };
    for (let i = 0; i < merged.count; i++) {
      const x0 = c[i * 4];
      const y0 = c[i * 4 + 1];
      const x1 = c[i * 4 + 2];
      const y1 = c[i * 4 + 3];
      const l = Math.hypot(x1 - x0, y1 - y0);
      if (l < 1e-9) continue;
      const nx = (-(y1 - y0) / l) * SILHOUETTE_PROBE;
      const ny = ((x1 - x0) / l) * SILHOUETTE_PROBE;
      const mx = (x0 + x1) / 2;
      const my = (y0 + y1) / 2;
      if (!hitAt(mx + nx, my + ny) || !hitAt(mx - nx, my - ny)) merged.prio[i] = PRIO.silhouette;
    }
  }
  lap('silhouette');
  if (style.hiddenLines && hiddenSoup.count) merged = mergeCollinear(concatSoups(merged, hiddenSoup), DEFAULT_CLEAN);

  // 5. Polylignes par calque, points d'accroche
  const layers = buildLayers(merged, packet.sourceIds);
  lap('layers');
  onProgress(1, 'Terminé');
  return {
    boundsMm: soupBounds(merged),
    layers,
    snapPoints: snapPointsOf(merged),
    meta: {
      provider: 'browser-hlr',
      durationMs: Math.round(performance.now() - t0),
      segmentCount: merged.count,
      cacheKey: job.cacheKey,
      basis,
      objectCount: prep.meshCount,
      rawSegmentCount: rawCount,
      timingsMs: timings,
    },
  };
}

function buildLayers(soup: SegmentSoup, sourceIds: string[]): LineworkLayer[] {
  const byLayer = new Map<number, LineworkLayer>();
  for (const pl of chainPolylines(soup)) {
    let layer = byLayer.get(pl.prio);
    if (!layer) {
      layer = { key: PRIO_LAYER[pl.prio], polylines: [], sourceNodeIds: [] };
      byLayer.set(pl.prio, layer);
    }
    layer.polylines.push(pl.points);
    layer.sourceNodeIds!.push(sourceIds[pl.owner] ?? '');
  }
  // ordre de dessin : caché, détail, visible, contour
  return [...byLayer.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
}
