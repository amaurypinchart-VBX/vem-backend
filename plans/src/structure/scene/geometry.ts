// Géométrie des pièces pour la reconnaissance : dimensions de la boîte orientée de chaque pièce, mesurée dans ses
// propres axes (ceux de son composant SketchUp) — deux instances tournées différemment ont la même empreinte.
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Mesh } from 'three';
import type { LoadedScene } from '../../scene/loadedScene';

export function itemBoxDims(scene: LoadedScene, ids: Iterable<string>): Map<string, [number, number, number]> {
  const out = new Map<string, [number, number, number]>();
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  const inv = new Matrix4();
  const m = new Matrix4();
  const v = new Vector3();
  const box = new Box3();
  const one = new Vector3(1, 1, 1);
  for (const id of ids) {
    const obj = scene.objectsById.get(id);
    if (!obj) continue;
    obj.matrixWorld.decompose(p, q, s);
    inv.compose(p, q, one).invert();
    box.makeEmpty();
    obj.traverse((o) => {
      const pos = ((o as Mesh).geometry as BufferGeometry | undefined)?.attributes?.position;
      if (!(o as Mesh).isMesh || !pos) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
    });
    if (box.isEmpty()) continue;
    const size = box.getSize(v);
    out.set(id, [size.x, size.y, size.z]);
  }
  return out;
}
