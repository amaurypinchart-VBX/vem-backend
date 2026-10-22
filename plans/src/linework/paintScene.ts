// Peinture sur la scène chargée (three) : triangles de chaque pièce dans son repère propre (mm), zones → triangles
// peints (la dernière zone gagne), surfaces, zones sans effet. Rien n'est modifié dans le modèle.
import { Matrix4, Vector3 } from 'three';
import type { BufferGeometry, Mesh, Object3D } from 'three';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import type { TriSoup } from '../core/paint/region';
import { selectTriangles, trianglesArea } from '../core/paint/region';
import type { PaintContext, ResolvedZone } from '../core/paint/resolve';
import { paintContext, resolvePaint } from '../core/paint/resolve';
import type { PaintSettings, Vec3 } from '../core/paint/types';

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

const soups = new WeakMap<Object3D, NodeSoup>();

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
  return out;
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
}

export function paintScene(scene: LoadedScene, paint: PaintSettings, ctx?: PaintContext): PaintedScene {
  const c = ctx ?? paintContext(scene.index);
  const resolved = resolvePaint(c, paint);
  const nodes = new Map<string, Map<number, { colorId: string; zoneId: string }>>();
  const touched = new Set<string>();
  for (const [nodeId, zones] of resolved) {
    const ns = nodeSoup(scene, nodeId);
    if (!ns) continue;
    const tris = new Map<number, { colorId: string; zoneId: string }>();
    for (const z of zones as ResolvedZone[]) {
      const sel = selectTriangles(ns.soup, z.target.scope, z.target.face);
      if (!sel?.length) continue;
      touched.add(z.zoneId);
      for (const t of sel) tris.set(t, { colorId: z.colorId, zoneId: z.zoneId });
    }
    if (tris.size) nodes.set(nodeId, tris);
  }
  const areaByZone = new Map<string, number>();
  const areaByColor = new Map<string, number>();
  const areaByColorModule = new Map<string, Map<string, number>>();
  for (const [nodeId, tris] of nodes) {
    const ns = nodeSoup(scene, nodeId)!;
    const mod = c.paths.moduleOf(nodeId) ?? c.byId.get(nodeId)?.moduleId ?? '—';
    for (const [t, { colorId, zoneId }] of tris) {
      const a = trianglesArea(ns.soup, [t]) / 1e6;
      areaByZone.set(zoneId, (areaByZone.get(zoneId) ?? 0) + a);
      areaByColor.set(colorId, (areaByColor.get(colorId) ?? 0) + a);
      const pm = areaByColorModule.get(colorId) ?? new Map<string, number>();
      pm.set(mod, (pm.get(mod) ?? 0) + a);
      areaByColorModule.set(colorId, pm);
    }
  }
  const noEffect = new Set(paint.zones.filter((z) => !touched.has(z.id)).map((z) => z.id));
  return { nodes, noEffect, areaByZone, areaByColor, areaByColorModule, ctx: c };
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
    const ns = nodeSoup(scene, nodeId);
    if (!ns) continue;
    const byColor = new Map<string, number[]>();
    for (const [t, { colorId }] of tris) {
      worldTriangle(ns, t, w);
      const l = byColor.get(colorId) ?? [];
      for (const v of w) l.push(v.x, v.y, v.z);
      byColor.set(colorId, l);
    }
    for (const [colorId, l] of byColor) out.push({ nodeId, colorId, positions: Float32Array.from(l) });
  }
  return out;
}
