// Lecture des pièces d'une Viewbox dans la scène chargée (three) : chaque accessoire / groupe le plus fin de la
// hiérarchie de la Viewbox = une pièce ; ses triangles en coordonnées monde (mm) sont lus par analyze.ts.
import type { Mesh, BufferGeometry } from 'three';
import { Vector3 } from 'three';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import { resolveMeshes } from '../core/subset';
import type { V3 } from './analyze';
import { analyzePart } from './analyze';
import type { PartInfo } from './parts';
import { cleanName, profileSection } from './parts';

/** Triangles monde (mm) d'un nœud et de ses descendants, à plat (x0, y0, z0, x1…). */
export function nodePositions(scene: LoadedScene, nodeId: string): Float32Array {
  const ids = resolveMeshes(scene.index, scene.look, [nodeId]);
  const out: number[] = [];
  const v = new Vector3();
  for (const id of ids) {
    for (const mesh of meshesOfNode(scene.objectsById.get(id)) as Mesh[]) {
      mesh.updateWorldMatrix(true, false);
      const g = mesh.geometry as BufferGeometry;
      const p = g.attributes.position;
      if (!p) continue;
      const idx = g.index;
      const n = idx ? idx.count : p.count;
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(p, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
        out.push(v.x, v.y, v.z);
      }
    }
  }
  return new Float32Array(out);
}

/** Pièces dessinées dans une Viewbox (sa hiérarchie) : les nœuds « accessoire » sans accessoire dessous. */
export function partNodes(scene: Pick<LoadedScene, 'index' | 'look'>, moduleId: string): string[] {
  const m = scene.index.modules.find((x) => x.id === moduleId);
  if (!m) return [];
  const root = new Set([m.nodeId]);
  const items = scene.index.nodes.filter((n) => n.role === 'item' && n.assignment !== 'spatial' && n.assignment !== 'common' && scene.look.inSet(n.id, root));
  const itemIds = new Set(items.map((n) => n.id));
  // une pièce qui contient d'autres pièces : on garde les plus fines
  const hasInner = new Set<string>();
  for (const n of items) for (let p = n.parentId; p; p = scene.look.byId.get(p)?.parentId ?? null) if (itemIds.has(p)) hasInner.add(p);
  return items.filter((n) => !hasInner.has(n.id)).map((n) => n.id);
}

/** Lecture de toutes les pièces d'une Viewbox. */
export function measureParts(scene: LoadedScene, moduleId: string): PartInfo[] {
  const f = scene.frames.get(moduleId);
  const axes: [V3, V3, V3] = f ? [f.xAxis, f.yAxis, f.up] : [[1, 0, 0], [0, 0, 1], [0, 1, 0]];
  const out: PartInfo[] = [];
  for (const id of partNodes(scene, moduleId)) {
    const node = scene.look.byId.get(id);
    if (!node) continue;
    const pos = nodePositions(scene, id);
    if (pos.length < 36) continue;
    const geo = analyzePart(pos, axes);
    if (geo.size[0] < 1) continue;
    const section = profileSection(geo, pos);
    out.push({
      nodeId: id,
      moduleId,
      name: cleanName(node.label ?? node.definition ?? node.sourceName ?? node.name ?? ''),
      category: scene.look.categoryOf(id),
      geo,
      ...(section ? { section } : {}),
    });
  }
  return out;
}
