// Option « colorer par catégorie » des vues de dessus : un trait épais de la couleur de la légende le long de la
// face de la Viewbox qui porte l'accessoire (vitrages, murs, portes), comme sur les plans d'implantation Viewbox.
import type { BufferGeometry } from 'three';
import { Vector3 } from 'three';
import type { ViewBasis } from '../core/views';
import { dot, projectPoint } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import type { LineworkLayer } from './types';

/** Distance maximale entre l'accessoire et la face du module pour lui être attribué (mm). */
const MAX_DISTANCE = 400;

export function isTopView(b: ViewBasis): boolean {
  return b.toward[1] > 0.999;
}

export function categoryStrokeLayers(
  scene: LoadedScene,
  meshIds: string[],
  basis: ViewBasis,
  colors: Record<string, string>,
): LineworkLayer[] {
  const items = new Map<string, string[]>();
  for (const id of meshIds) {
    const cat = scene.look.categoryOf(id);
    if (!cat || !colors[cat]) continue;
    const item = scene.look.itemOf(id);
    const l = items.get(item);
    if (l) l.push(id);
    else items.set(item, [id]);
  }
  const layers = new Map<string, LineworkLayer>();
  const v = new Vector3();
  for (const [itemId, ids] of items) {
    const node = scene.look.byId.get(itemId) ?? scene.look.byId.get(ids[0]);
    const cat = scene.look.categoryOf(itemId) ?? scene.look.categoryOf(ids[0]);
    const frame = node?.moduleId ? scene.frames.get(node.moduleId) : undefined;
    if (!frame || !cat) continue;
    // étendue de l'accessoire dans le repère de sa Viewbox
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const id of ids)
      for (const mesh of meshesOfNode(scene.objectsById.get(id))) {
        const pos = (mesh.geometry as BufferGeometry).attributes.position;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
          const p: [number, number, number] = [v.x - frame.origin[0], v.y - frame.origin[1], v.z - frame.origin[2]];
          const lx = dot(p, frame.xAxis);
          const ly = dot(p, frame.yAxis);
          if (lx < x0) x0 = lx;
          if (lx > x1) x1 = lx;
          if (ly < y0) y0 = ly;
          if (ly > y1) y1 = ly;
        }
      }
    if (!Number.isFinite(x0)) continue;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const [minX, minY] = frame.min;
    const [maxX, maxY] = frame.max;
    const sides = [
      { d: Math.abs(cx - minX), a: [minX, Math.max(minY, y0)], b: [minX, Math.min(maxY, y1)] },
      { d: Math.abs(cx - maxX), a: [maxX, Math.max(minY, y0)], b: [maxX, Math.min(maxY, y1)] },
      { d: Math.abs(cy - minY), a: [Math.max(minX, x0), minY], b: [Math.min(maxX, x1), minY] },
      { d: Math.abs(cy - maxY), a: [Math.max(minX, x0), maxY], b: [Math.min(maxX, x1), maxY] },
    ].sort((p, q) => p.d - q.d);
    const side = sides[0];
    if (side.d > MAX_DISTANCE) continue;
    const toWorld = (lx: number, ly: number): [number, number, number] => [
      frame.origin[0] + frame.xAxis[0] * lx + frame.yAxis[0] * ly,
      frame.origin[1] + frame.max[2],
      frame.origin[2] + frame.xAxis[2] * lx + frame.yAxis[2] * ly,
    ];
    const pa = projectPoint(basis, toWorld(side.a[0], side.a[1]));
    const pb = projectPoint(basis, toWorld(side.b[0], side.b[1]));
    if (Math.hypot(pb.x - pa.x, pb.y - pa.y) < 1) continue;
    const key = `category:${cat}` as const;
    let layer = layers.get(key);
    if (!layer) {
      layer = { key, polylines: [], sourceNodeIds: [] };
      layers.set(key, layer);
    }
    layer.polylines.push(Float64Array.from([pa.x, pa.y, pb.x, pb.y]));
    layer.sourceNodeIds!.push(itemId);
  }
  return [...layers.values()];
}
