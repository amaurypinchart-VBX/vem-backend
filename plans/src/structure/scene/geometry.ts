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

/**
 * Hauteur moyenne des sommets d'un objet dans le premier et le dernier quart de sa boîte le long d'un axe du monde
 * (0 = X, 2 = Z) : le palier d'un escalier est au bout le plus haut. null sans maillage.
 */
export function endHeights(scene: LoadedScene, id: string, axis: 0 | 2): { low: number; high: number } | null {
  const obj = scene.objectsById.get(id);
  if (!obj) return null;
  const pts: Array<[number, number]> = [];
  const v = new Vector3();
  obj.updateWorldMatrix(true, true);
  obj.traverse((o) => {
    const pos = ((o as Mesh).geometry as BufferGeometry | undefined)?.attributes?.position;
    if (!(o as Mesh).isMesh || !pos) return;
    const step = Math.max(1, Math.floor(pos.count / 20000));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
      pts.push([axis === 0 ? v.x : v.z, v.y]);
    }
  });
  if (pts.length < 10) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const [a] of pts) [lo, hi] = [Math.min(lo, a), Math.max(hi, a)];
  const q = (hi - lo) / 4;
  const mean = (f: (a: number) => boolean) => {
    const s = pts.filter(([a]) => f(a));
    return s.length ? s.reduce((x, [, y]) => x + y, 0) / s.length : NaN;
  };
  return { low: mean((a) => a <= lo + q), high: mean((a) => a >= hi - q) };
}
