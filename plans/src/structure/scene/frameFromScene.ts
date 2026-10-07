// Structure dessinée d'un module, lue dans la scène analysée (S12.5, source « maillage » pour les .zip sans barres dans
// le manifest) : pièces de la hiérarchie du module et pièces rattachées par leur position (traverses de toiture
// exportées hors du composant), catégories de structure seulement (STRUCTURE, TOIT, PLANCHER, PIED), triangles ramenés
// dans le repère du gabarit (u grand côté, v petit côté, z vers le haut, origine au coin bas de la boîte du module),
// regroupés par groupe SketchUp. Le relevé lui-même (`extractFrame`) est pur.
import { Vector3 } from 'three';
import type { BufferGeometry, Mesh } from 'three';
import type { LoadedScene } from '../../scene/loadedScene';
import type { RawMember } from '../core/frameExtract';

const STRUCT_CATEGORIES = new Set(['STRUCTURE', 'TOIT', 'PLANCHER', 'PIED']);

export interface ModuleStructureMesh {
  members: RawMember[];
  /** boîte du module (pieds exclus) : grand côté, petit côté, hauteur (mm) */
  dims: { long: number; short: number; height: number };
}

export function moduleStructureMesh(scene: LoadedScene, moduleId: string): ModuleStructureMesh | null {
  const f = scene.frames.get(moduleId);
  if (!f) return null;
  const size = [f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]];
  const [long, short] = f.longAxis === 'x' ? [size[0], size[1]] : [size[1], size[0]];
  const origin = new Vector3(...f.origin)
    .addScaledVector(new Vector3(...f.xAxis), f.min[0])
    .addScaledVector(new Vector3(...f.yAxis), f.min[1])
    .addScaledVector(new Vector3(...f.up), f.min[2]);
  const [u, v] = f.longAxis === 'x' ? [new Vector3(...f.xAxis), new Vector3(...f.yAxis)] : [new Vector3(...f.yAxis), new Vector3(...f.xAxis)];
  const up = new Vector3(...f.up);
  const byId = new Map(scene.index.nodes.map((n) => [n.id, n]));
  // pièces de structure du module (hiérarchie ou position), maillages seulement
  const meshes = scene.index.nodes.filter((n) => n.kind === 'mesh' && n.moduleId === moduleId && n.category && STRUCT_CATEGORIES.has(n.category) && n.triangles > 0);
  const groups = new Map<string, number[]>();
  const p = new Vector3();
  const d = new Vector3();
  for (const n of meshes) {
    const owner = n.parentId ?? n.id;
    const obj = scene.objectsById.get(n.id);
    if (!obj) continue;
    obj.updateWorldMatrix(true, true);
    const list = groups.get(owner) ?? [];
    obj.traverse((o) => {
      const g = (o as Mesh).geometry as BufferGeometry | undefined;
      const pos = g?.attributes?.position;
      if (!(o as Mesh).isMesh || !pos) return;
      const idx = g!.index;
      const count = idx ? idx.count : pos.count;
      for (let k = 0; k < count; k++) {
        p.fromBufferAttribute(pos, idx ? idx.getX(k) : k).applyMatrix4(o.matrixWorld);
        d.copy(p).sub(origin);
        list.push(d.dot(u), d.dot(v), d.dot(up));
      }
    });
    groups.set(owner, list);
  }
  const members: RawMember[] = [];
  for (const [owner, tri] of groups) {
    if (tri.length < 9) continue;
    const g = byId.get(owner);
    // nom utile : le groupe, sinon le premier ancêtre nommé (définition SketchUp)
    let named = g;
    while (named && !named.definition && !named.name && named.parentId) named = byId.get(named.parentId);
    members.push({ id: owner, name: g?.name || named?.name, definition: g?.definition ?? named?.definition, triangles: Float32Array.from(tri) });
  }
  return { members, dims: { long, short, height: size[2] } };
}
