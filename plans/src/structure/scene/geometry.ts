// Géométrie des pièces pour la reconnaissance : dimensions de la boîte orientée de chaque pièce, mesurée dans ses
// propres axes (ceux de son composant SketchUp) — deux instances tournées différemment ont la même empreinte.
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';
import type { BufferGeometry, Mesh } from 'three';
import type { LoadedScene } from '../../scene/loadedScene';
import type { BlockUnder, BoxMm, DrawnBlock } from '../core/blocks';
import { components } from '../core/sectionDetect';

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

/**
 * Axe d'une pièce allongée (poutre, poteau) : centre de sa boîte orientée dans ses propres axes, prolongé de part et
 * d'autre sur sa plus grande dimension (monde, mm). `depth` = dimension de la section la plus proche de la verticale.
 * null si la pièce n'est pas une barre (plus grande dimension < 2 × la suivante) ou sans maillage.
 */
export function itemBar(scene: LoadedScene, id: string): { a: [number, number, number]; b: [number, number, number]; depth: number } | null {
  const obj = scene.objectsById.get(id);
  if (!obj) return null;
  obj.updateWorldMatrix(true, true);
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  obj.matrixWorld.decompose(p, q, s);
  const frame = new Matrix4().compose(p, q, new Vector3(1, 1, 1));
  const inv = frame.clone().invert();
  const m = new Matrix4();
  const v = new Vector3();
  const box = new Box3();
  obj.traverse((o) => {
    const pos = ((o as Mesh).geometry as BufferGeometry | undefined)?.attributes?.position;
    if (!(o as Mesh).isMesh || !pos) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    for (let i = 0; i < pos.count; i++) box.expandByPoint(v.fromBufferAttribute(pos, i).applyMatrix4(m));
  });
  if (box.isEmpty()) return null;
  const size = box.getSize(new Vector3()).toArray();
  const order = [0, 1, 2].sort((x, y) => size[y] - size[x]);
  if (size[order[0]] < 2 * size[order[1]]) return null;
  const k = order[0];
  const center = box.getCenter(new Vector3());
  const lo = center.clone().setComponent(k, box.min.getComponent(k)).applyMatrix4(frame);
  const hi = center.clone().setComponent(k, box.max.getComponent(k)).applyMatrix4(frame);
  // hauteur de la section : axe local (hors axe de la barre) le plus proche de la verticale du monde
  const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)].map((a) => a.applyQuaternion(q));
  const j = order.slice(1).reduce((x, y) => (Math.abs(axes[y].y) > Math.abs(axes[x].y) ? y : x));
  return { a: lo.toArray() as [number, number, number], b: hi.toArray() as [number, number, number], depth: size[j] };
}

/**
 * Pièces d'un calage dessiné (blocs de bois sous les pieds) : chaque solide séparé de ses maillages (triangles reliés
 * par des sommets communs), en boîte du monde (mm) avec son volume (boîte). Gros maillages : une boîte par maillage.
 */
export function blockPieces(scene: LoadedScene, id: string): BoxMm[] {
  const obj = scene.objectsById.get(id);
  if (!obj) return [];
  obj.updateWorldMatrix(true, true);
  const out: BoxMm[] = [];
  const v = new Vector3();
  obj.traverse((o) => {
    const mesh = o as Mesh;
    const g = mesh.geometry as BufferGeometry | undefined;
    const pos = g?.attributes?.position;
    if (!mesh.isMesh || !pos) return;
    const idx = g!.index;
    const nTri = idx ? idx.count / 3 : pos.count / 3;
    const soup = new Float32Array(nTri * 9);
    for (let t = 0; t < nTri; t++)
      for (let i = 0; i < 3; i++) {
        const k = idx ? idx.getX(3 * t + i) : 3 * t + i;
        v.fromBufferAttribute(pos, k).applyMatrix4(mesh.matrixWorld);
        soup.set([v.x, v.y, v.z], 9 * t + 3 * i);
      }
    const parts = nTri > 200000 ? [soup] : components(soup, 0.5);
    for (const p of parts) {
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < p.length; i += 3)
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], p[i + k]);
          max[k] = Math.max(max[k], p[i + k]);
        }
      if (!Number.isFinite(min[0])) continue;
      out.push({ min, max, volume: (max[0] - min[0]) * (max[1] - min[1]) * (max[2] - min[2]) });
    }
  });
  return out;
}

/**
 * Ce qui repose sur chaque bloc de calage dessiné : en cherchant dans les pièces des Viewbox posées au sol (leur
 * propre composant, pas les objets rattachés par position) la plus basse au-dessus du bloc, triangle par triangle
 * (coupé au rectangle du bloc en plan), séparément pour les pieds / vérins (catégorie PIED) et pour la structure (rive
 * UNP, profils du plancher…). Écart en mm entre le dessus du bloc et le dessous de la pièce (négatif = pièce enfoncée
 * dans le bloc), null = rien dans les 40 cm au-dessus. Sert à vérifier que le mode de pose choisi (vérins, UPN sur les
 * blocs) correspond au dessin.
 */
export function blockContacts(scene: LoadedScene, blocks: ReadonlyArray<Pick<DrawnBlock, 'id' | 'x0' | 'x1' | 'z0' | 'z1' | 'top'>>, modules: ReadonlySet<string>): Map<string, BlockUnder> {
  const out = new Map<string, BlockUnder>();
  if (!blocks.length || scene.light) return out;
  const REACH = 400;
  const SINK = 30;
  const best = blocks.map(() => ({ feet: Infinity, frame: Infinity }));
  const v = new Vector3();
  const tri: Array<[number, number, number]> = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const n of scene.index.nodes) {
    const b = n.bboxMm;
    if (n.kind !== 'mesh' || !b || !n.moduleId || !modules.has(n.moduleId) || n.assignment !== 'hierarchy') continue;
    const hits = blocks.map((_, i) => i).filter((i) => {
      const bl = blocks[i];
      return b[0] < bl.x1 - 5 && b[3] > bl.x0 + 5 && b[2] < bl.z1 - 5 && b[5] > bl.z0 + 5 && b[1] < bl.top + REACH && b[4] > bl.top - SINK;
    });
    if (!hits.length) continue;
    const obj = scene.objectsById.get(n.id);
    if (!obj) continue;
    const feet = n.category === 'PIED';
    obj.updateWorldMatrix(true, true);
    obj.traverse((o) => {
      const mesh = o as Mesh;
      const g = mesh.geometry as BufferGeometry | undefined;
      const pos = g?.attributes?.position;
      if (!mesh.isMesh || !pos) return;
      const idx = g!.index;
      const nTri = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < nTri; t++) {
        for (let k = 0; k < 3; k++) {
          v.fromBufferAttribute(pos, idx ? idx.getX(3 * t + k) : 3 * t + k).applyMatrix4(mesh.matrixWorld);
          tri[k] = [v.x, v.y, v.z];
        }
        for (const i of hits) {
          const bl = blocks[i];
          const y = lowestInRect(tri, bl.x0 + 5, bl.x1 - 5, bl.z0 + 5, bl.z1 - 5);
          if (y === null || y < bl.top - SINK || y > bl.top + REACH) continue;
          const slot = best[i];
          if (feet) slot.feet = Math.min(slot.feet, y - bl.top);
          else slot.frame = Math.min(slot.frame, y - bl.top);
        }
      }
    });
  }
  blocks.forEach((bl, i) => {
    const s = best[i];
    out.set(bl.id, { feet: Number.isFinite(s.feet) ? s.feet : null, frame: Number.isFinite(s.frame) ? s.frame : null });
  });
  return out;
}

/** Plus petite hauteur (y) d'un triangle sur la partie de sa projection en plan (x, z) comprise dans un rectangle. */
function lowestInRect(t: Array<[number, number, number]>, x0: number, x1: number, z0: number, z1: number): number | null {
  // découpe de Sutherland–Hodgman du triangle par les 4 côtés du rectangle (y interpolé : linéaire sur le triangle)
  let poly = t.map((p) => [p[0], p[1], p[2]] as [number, number, number]);
  const clip = (inside: (p: number[]) => number) => {
    const res: Array<[number, number, number]> = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const c = poly[(i + 1) % poly.length];
      const sa = inside(a);
      const sc = inside(c);
      if (sa >= 0) res.push(a);
      if ((sa >= 0) !== (sc >= 0)) {
        const f = sa / (sa - sc);
        res.push([a[0] + f * (c[0] - a[0]), a[1] + f * (c[1] - a[1]), a[2] + f * (c[2] - a[2])]);
      }
    }
    poly = res;
  };
  clip((p) => p[0] - x0);
  if (poly.length) clip((p) => x1 - p[0]);
  if (poly.length) clip((p) => p[2] - z0);
  if (poly.length) clip((p) => z1 - p[2]);
  if (!poly.length) return null;
  return Math.min(...poly.map((p) => p[1]));
}
