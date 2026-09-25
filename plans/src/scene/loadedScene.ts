// Modèle chargé en mémoire (paquet GLB ou analyse fraîche) + ce qu'il faut pour le viewer et le moteur 2D :
// correspondance nœud ↔ objet three.js, catégories effectives, repères des Viewbox.
import type { BufferGeometry, Mesh, Object3D } from 'three';
import { Vector3 } from 'three';
import type { SceneIndex } from '../core/types';
import type { FrontSide, ModuleFrame, Vec3 } from '../core/views';
import { dot, frameAxesFromMatrix, makeModuleFrame } from '../core/views';
import type { SceneLookup } from '../core/subset';
import { makeLookup } from '../core/subset';

export interface LoadedScene {
  root: Object3D;
  objectsById: Map<string, Object3D>;
  index: SceneIndex;
  look: SceneLookup;
  frames: Map<string, ModuleFrame>;
  /** empreinte du fichier source : clé du cache des vues */
  modelKey: string;
}

/** Identifiant de nœud d'un objet three.js (un maillage multi-matériaux rechargé du GLB devient un groupe de
 * sous-maillages sans identifiant : on remonte au parent). */
export function nodeIdOf(o: Object3D | null): string | undefined {
  for (let c: Object3D | null = o; c; c = c.parent) {
    const id = c.userData?.vbxId;
    if (typeof id === 'string') return id;
  }
  return undefined;
}

/** Maillages portés par un nœud « mesh » de l'index : l'objet lui-même, ou ses sous-maillages (un par matériau). */
export function meshesOfNode(obj: Object3D | undefined): Mesh[] {
  if (!obj) return [];
  if ((obj as Mesh).isMesh) return [obj as Mesh];
  return obj.children.filter((c) => (c as Mesh).isMesh && typeof c.userData?.vbxId !== 'string') as Mesh[];
}

/** Repère de chaque Viewbox : axes de son composant, boîte mesurée dans ce repère (pieds exclus). */
export function computeFrames(
  index: SceneIndex,
  objectsById: Map<string, Object3D>,
  look: SceneLookup,
  fronts: Partial<Record<string, FrontSide>> = {},
): Map<string, ModuleFrame> {
  const frames = new Map<string, ModuleFrame>();
  const v = new Vector3();
  for (const m of index.modules) {
    const obj = objectsById.get(m.nodeId);
    if (!obj) continue;
    obj.updateMatrixWorld(true);
    const axes = frameAxesFromMatrix(obj.matrixWorld.elements);
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    obj.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const id = nodeIdOf(o);
      if (id && look.categoryOf(id) === 'PIED') return;
      const pos = (mesh.geometry as BufferGeometry).attributes.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const p: Vec3 = [v.x - axes.origin[0], v.y - axes.origin[1], v.z - axes.origin[2]];
        const lx = dot(p, axes.xAxis);
        const ly = dot(p, axes.yAxis);
        const lz = dot(p, axes.up);
        if (lx < min[0]) min[0] = lx;
        if (ly < min[1]) min[1] = ly;
        if (lz < min[2]) min[2] = lz;
        if (lx > max[0]) max[0] = lx;
        if (ly > max[1]) max[1] = ly;
        if (lz > max[2]) max[2] = lz;
      }
    });
    if (!Number.isFinite(min[0])) continue;
    frames.set(m.id, makeModuleFrame(m.id, axes, min, max, fronts[m.id] ?? null));
  }
  return frames;
}

export function makeLoadedScene(
  root: Object3D,
  objectsById: Map<string, Object3D>,
  index: SceneIndex,
  modelKey: string,
  fronts: Partial<Record<string, FrontSide>> = {},
): LoadedScene {
  root.updateMatrixWorld(true);
  const look = makeLookup(index);
  return { root, objectsById, index, look, frames: computeFrames(index, objectsById, look, fronts), modelKey };
}
