// Peinture sur la scène chargée (three) : triangles de chaque pièce dans son repère propre (mm), zones → triangles
// peints (la dernière zone gagne), surfaces, zones sans effet. Rien n'est modifié dans le modèle.
import { Matrix4, Vector3 } from 'three';
import type { BufferGeometry, Mesh, Object3D } from 'three';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import type { TriSoup } from '../core/paint/region';
import { selectTriangles } from '../core/paint/region';
import type { PaintContext, ResolvedZone } from '../core/paint/resolve';
import { paintContext, resolvePaint } from '../core/paint/resolve';
import type { PaintSettings, Vec3 } from '../core/paint/types';
import { NO_PAINT } from '../core/paint/types';
import type { GlassTest } from './packets';
import { exteriorInfo, exteriorSelection, exteriorSurvey } from './paintExterior';
import type { ExteriorTri } from './paintExterior';
import { registerReleaser } from './memory';

/** Triangles d'une pièce : repère propre (mm), passage au monde, maillages d'origine. */
export interface NodeSoup {
  soup: TriSoup;
  /** repère propre (mm) → monde */
  toWorld: Matrix4;
  /** monde → repère propre (mm) */
  toLocal: Matrix4;
  /** triangles [start, start + count[ de la soupe = triangles du maillage `mesh` */
  parts: Array<{ mesh: Mesh; start: number; count: number }>;
}

/**
 * Soupes de triangles des pièces cliquées / peintes (repère propre), avec un budget : avant, toutes restaient en
 * mémoire toute la session. Les plus anciennes partent d'abord ; refaites au besoin.
 */
const soups = new Map<Object3D, NodeSoup>();
let soupFloats = 0;
/** nombres gardés (positions + index) : 20 M ≈ 160 Mo au plus */
const SOUP_FLOATS_MAX = 20_000_000;
const soupSize = (s: NodeSoup) => s.soup.pos.length + s.soup.index.length;
registerReleaser('paint-soups', () => {
  soups.clear();
  soupFloats = 0;
});

export function nodeSoup(scene: LoadedScene, nodeId: string): NodeSoup | null {
  const obj = scene.objectsById.get(nodeId);
  if (!obj) return null;
  const hit = soups.get(obj);
  if (hit) return hit;
  obj.updateWorldMatrix(true, true);
  // repère propre en mm : inverse du placement de la pièce, puis l'échelle d'unité (mêmes coordonnées dans toutes les
  // instances d'une définition, même miroir compris)
  const s = obj.matrixWorld.getMaxScaleOnAxis() || 1;
  const inv = obj.matrixWorld.clone().invert();
  const toLocal = new Matrix4().makeScale(s, s, s).multiply(inv);
  const toWorld = toLocal.clone().invert();
  const pos: number[] = [];
  const index: number[] = [];
  const parts: NodeSoup['parts'] = [];
  const v = new Vector3();
  const m = new Matrix4();
  for (const mesh of meshesOfNode(obj)) {
    const g = mesh.geometry as BufferGeometry;
    const p = g.attributes.position;
    if (!p) continue;
    m.multiplyMatrices(toLocal, mesh.matrixWorld);
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos.push(v.x, v.y, v.z);
    }
    const start = index.length / 3;
    if (g.index) for (let i = 0; i < g.index.count; i++) index.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) index.push(base + i);
    parts.push({ mesh, start, count: index.length / 3 - start });
  }
  const out: NodeSoup = { soup: { pos: Float64Array.from(pos), index: Uint32Array.from(index) }, toWorld, toLocal, parts };
  soups.set(obj, out);
  soupFloats += soupSize(out);
  while (soupFloats > SOUP_FLOATS_MAX && soups.size > 1) {
    const [first, v] = soups.entries().next().value!;
    soups.delete(first);
    soupFloats -= soupSize(v);
  }
  return out;
}

/**
 * Triangles d'une pièce lus directement dans ses maillages (coordonnées monde, mm), sans copie — même numérotation que
 * `nodeSoup`. Pour les surfaces, les repères et la 3D : une zone « côtés extérieurs » touche des milliers de pièces, et
 * recopier leur géométrie (nodeSoup, gardée en mémoire) faisait fermer l'onglet sur un gros modèle (Xiaomi, 04.11.2026).
 */
export interface NodeTriangles {
  count: number;
  /** sommets monde du triangle t */
  world(t: number, out: Vector3[]): void;
}
const triCache = new WeakMap<Object3D, NodeTriangles>();
export function nodeTriangles(scene: LoadedScene, nodeId: string): NodeTriangles | null {
  const obj = scene.objectsById.get(nodeId);
  if (!obj) return null;
  const hit = triCache.get(obj);
  if (hit) return hit;
  obj.updateWorldMatrix(true, true);
  const parts: Array<{ mesh: Mesh; start: number; count: number }> = [];
  let start = 0;
  for (const mesh of meshesOfNode(obj)) {
    const g = mesh.geometry as BufferGeometry;
    const p = g.attributes.position;
    if (!p) continue;
    const count = (g.index ? g.index.count : p.count) / 3;
    parts.push({ mesh, start, count });
    start += count;
  }
  const out: NodeTriangles = {
    count: start,
    world(t, o) {
      let part = parts[0];
      for (const q of parts) if (t >= q.start && t < q.start + q.count) part = q;
      const g = part.mesh.geometry as BufferGeometry;
      const pos = g.attributes.position;
      const k = t - part.start;
      for (let j = 0; j < 3; j++) {
        const i = g.index ? g.index.getX(k * 3 + j) : k * 3 + j;
        o[j].fromBufferAttribute(pos, i).applyMatrix4(part.mesh.matrixWorld);
      }
    },
  };
  triCache.set(obj, out);
  return out;
}

const _w = [new Vector3(), new Vector3(), new Vector3()];
const _e1 = new Vector3();
const _e2 = new Vector3();
/** Aire monde (mm²) du triangle t d'une pièce. */
function worldArea(nt: NodeTriangles, t: number): number {
  nt.world(t, _w);
  _e1.subVectors(_w[1], _w[0]);
  _e2.subVectors(_w[2], _w[0]);
  return _e1.cross(_e2).length() / 2;
}

/** Point monde → repère propre de la pièce (mm). */
export function toLocalPoint(ns: NodeSoup, p: Vec3): Vec3 {
  const v = new Vector3(...p).applyMatrix4(ns.toLocal);
  return [v.x, v.y, v.z];
}

/** Peinture résolue sur la scène : par pièce, la couleur de chaque triangle peint (la dernière zone gagne). */
export interface PaintedScene {
  /** pièce → triangle → { couleur, zone } */
  nodes: Map<string, Map<number, { colorId: string; zoneId: string }>>;
  /** zones qui ne touchent plus rien (modèle changé) */
  noEffect: Set<string>;
  /** surface peinte (m²) par zone, par couleur et par Viewbox (couleur → Viewbox → m²) */
  areaByZone: Map<string, number>;
  areaByColor: Map<string, number>;
  areaByColorModule: Map<string, Map<string, number>>;
  ctx: PaintContext;
  /** zones « côtés extérieurs » (leurs faces sont déjà vues de dehors : paintOverlay ne revérifie pas leur propre box) */
  exteriorZones: Set<string>;
  /** pièce → triangle peint par une de ces zones → normale sortante de son côté de box (monde) */
  exteriorOut: Map<string, Map<number, Vec3>>;
}

/** `isGlass` : vitrages reconnus pour les zones « côtés extérieurs » (non peints sauf demande). */
export function paintScene(scene: LoadedScene, paint: PaintSettings, ctx?: PaintContext, isGlass?: GlassTest): PaintedScene {
  const c = ctx ?? paintContext(scene.index);
  const resolved = resolvePaint(c, paint);
  const exterior = paint.zones.some((z) => z.target.scope === 'exterior') ? exteriorSurvey(scene, c, isGlass) : null;
  const exteriorZones = new Set(paint.zones.filter((z) => z.target.scope === 'exterior').map((z) => z.id));
  const exteriorOut = new Map<string, Map<number, Vec3>>();
  const clearedArea = new Map<string, number>();
  const nodes = new Map<string, Map<number, { colorId: string; zoneId: string }>>();
  const touched = new Set<string>();
  for (const [nodeId, zones] of resolved) {
    // triangles de la pièce lus seulement si une zone en a besoin (« côtés extérieurs » : déjà dans le relevé ; la
    // plupart des pièces d'une Viewbox n'ont aucune face extérieure)
    let ns: NodeSoup | null | undefined;
    const soup = () => (ns === undefined ? (ns = nodeSoup(scene, nodeId)) : ns);
    const tris = new Map<number, { colorId: string; zoneId: string }>();
    for (const z of zones as ResolvedZone[]) {
      let sel: number[] | null;
      if (z.target.scope === 'exterior') sel = exterior && z.target.exterior ? exteriorSelection(exterior, z.target.exterior).get(nodeId) ?? null : null;
      else {
        const s = soup();
        if (!s) continue;
        sel = selectTriangles(s.soup, z.target.scope, z.target.face);
      }
      if (!sel?.length) continue;
      touched.add(z.zoneId);
      if (z.colorId === NO_PAINT) {
        // retire seulement ce qui était peint jusque-là (sa surface = ce qu'elle a vraiment retiré)
        for (const t of sel) if (tris.has(t) && tris.get(t)!.colorId !== NO_PAINT) tris.set(t, { colorId: NO_PAINT, zoneId: z.zoneId });
      } else for (const t of sel) tris.set(t, { colorId: z.colorId, zoneId: z.zoneId });
    }
    // « Sans peinture » gagnant : le triangle n'est plus peint (sa surface est comptée sur la zone qui l'a retiré)
    for (const [t, v] of tris)
      if (v.colorId === NO_PAINT) {
        tris.delete(t);
        const nt = nodeTriangles(scene, nodeId);
        if (nt) clearedArea.set(v.zoneId, (clearedArea.get(v.zoneId) ?? 0) + worldArea(nt, t) / 1e6);
      }
    if (tris.size) nodes.set(nodeId, tris);
    // côté (normale sortante) de chaque triangle encore peint par une zone « côtés extérieurs »
    if (exterior && tris.size) {
      const info = exteriorInfo(exterior).get(nodeId);
      if (info) {
        const outs = new Map<number, Vec3>();
        for (const [t, { zoneId }] of tris) {
          const x = exteriorZones.has(zoneId) ? info.get(t) : undefined;
          if (x) outs.set(t, exterior.sides[x.side].out);
        }
        if (outs.size) exteriorOut.set(nodeId, outs);
      }
    }
  }
  const areaByZone = new Map<string, number>(clearedArea);
  const areaByColor = new Map<string, number>();
  const areaByColorModule = new Map<string, Map<string, number>>();
  for (const [nodeId, tris] of nodes) {
    const nt = nodeTriangles(scene, nodeId)!;
    const mod = c.paths.moduleOf(nodeId) ?? c.byId.get(nodeId)?.moduleId ?? '—';
    // surfaces des côtés extérieurs déjà mesurées par le relevé (pas de relecture des maillages à chaque action)
    const info: Map<number, ExteriorTri> | undefined = exterior ? exteriorInfo(exterior).get(nodeId) : undefined;
    for (const [t, { colorId, zoneId }] of tris) {
      const known = exteriorZones.has(zoneId) ? info?.get(t) : undefined;
      const a = (known ? known.area : worldArea(nt, t)) / 1e6;
      areaByZone.set(zoneId, (areaByZone.get(zoneId) ?? 0) + a);
      areaByColor.set(colorId, (areaByColor.get(colorId) ?? 0) + a);
      const pm = areaByColorModule.get(colorId) ?? new Map<string, number>();
      pm.set(mod, (pm.get(mod) ?? 0) + a);
      areaByColorModule.set(colorId, pm);
    }
  }
  const noEffect = new Set(paint.zones.filter((z) => !touched.has(z.id)).map((z) => z.id));
  return { nodes, noEffect, areaByZone, areaByColor, areaByColorModule, ctx: c, exteriorZones, exteriorOut };
}

/** Sommets monde d'un triangle de la soupe. */
export function worldTriangle(ns: NodeSoup, t: number, out: Vector3[]): void {
  for (let k = 0; k < 3; k++) {
    const i = ns.soup.index[t * 3 + k];
    out[k].set(ns.soup.pos[i * 3], ns.soup.pos[i * 3 + 1], ns.soup.pos[i * 3 + 2]).applyMatrix4(ns.toWorld);
  }
}

/** Triangles peints en coordonnées monde, par pièce et par couleur (calque de la Vue 3D). */
export interface PaintLayer3D {
  nodeId: string;
  colorId: string;
  /** 9 nombres par triangle */
  positions: Float32Array;
}

export function paintLayers3D(scene: LoadedScene, painted: PaintedScene): PaintLayer3D[] {
  const out: PaintLayer3D[] = [];
  const w = [new Vector3(), new Vector3(), new Vector3()];
  for (const [nodeId, tris] of painted.nodes) {
    const nt = nodeTriangles(scene, nodeId);
    if (!nt) continue;
    const byColor = new Map<string, number[]>();
    for (const [t, { colorId }] of tris) {
      nt.world(t, w);
      const l = byColor.get(colorId) ?? [];
      for (const v of w) l.push(v.x, v.y, v.z);
      byColor.set(colorId, l);
    }
    for (const [colorId, l] of byColor) out.push({ nodeId, colorId, positions: Float32Array.from(l) });
  }
  return out;
}

/**
 * Pièces dont la peinture diffère entre deux résultats (triangles, couleur, ou passage en / hors zone « côtés
 * extérieurs ») : seules les vues qui montrent une de ces pièces ont à recalculer leurs repères.
 */
export function changedPaintNodes(a: PaintedScene, b: PaintedScene): Set<string> {
  const out = new Set<string>();
  const ext = (p: PaintedScene, zoneId: string) => p.exteriorZones?.has(zoneId) ?? false;
  for (const [id, ma] of a.nodes) {
    const mb = b.nodes.get(id);
    if (!mb || mb.size !== ma.size) {
      out.add(id);
      continue;
    }
    for (const [t, va] of ma) {
      const vb = mb.get(t);
      if (!vb || vb.colorId !== va.colorId || ext(a, va.zoneId) !== ext(b, vb.zoneId)) {
        out.add(id);
        break;
      }
    }
  }
  for (const id of b.nodes.keys()) if (!a.nodes.has(id)) out.add(id);
  return out;
}
