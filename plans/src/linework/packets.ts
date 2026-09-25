// Prépare un sous-ensemble du modèle pour le moteur 2D : géométrie cuite en coordonnées monde (copie, les
// instances partagent leur géométrie), recentrée, avec un indicateur « vitrage » par triangle.
import type { BufferGeometry, Material, Mesh } from 'three';
import { Vector3 } from 'three';
import type { Vec3 } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import type { HlrPacket } from './hlr';

export type GlassTest = (m: Material | undefined) => boolean;

/** Un matériau est un vitrage si son nom l'indique (VITRE, GLASS, VERRE…) ou s'il est transparent. */
export function makeGlassTest(namePattern: RegExp): GlassTest {
  return (m) => {
    if (!m) return false;
    const norm = (m.name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
    return namePattern.test(norm) || (m.transparent && m.opacity < 0.95);
  };
}

interface Part {
  meshes: Mesh[];
  sourceId: string;
}

/**
 * Un objet du paquet = un nœud de l'index (tous ses sous-maillages / matériaux ensemble, pour que le moteur
 * retrouve sa topologie : faces voisines, solide fermé ou non).
 */
export function buildPacket(scene: LoadedScene, meshNodeIds: string[], isGlass: GlassTest): HlrPacket {
  const parts: Part[] = [];
  for (const id of meshNodeIds) {
    const meshes = meshesOfNode(scene.objectsById.get(id));
    if (meshes.length) parts.push({ meshes, sourceId: scene.look.itemOf(id) });
  }
  let vertexTotal = 0;
  let indexTotal = 0;
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  const v = new Vector3();
  for (const part of parts)
    for (const mesh of part.meshes) {
      const g = mesh.geometry as BufferGeometry;
      const pos = g.attributes.position;
      vertexTotal += pos.count;
      indexTotal += g.index ? g.index.count : pos.count;
      mesh.updateWorldMatrix(true, false);
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox!;
      for (let k = 0; k < 8; k++) {
        v.set(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z).applyMatrix4(mesh.matrixWorld);
        min.min(v);
        max.max(v);
      }
    }
  const center: Vec3 = parts.length ? [(min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2] : [0, 0, 0];

  const positions = new Float32Array(vertexTotal * 3);
  const indices = new Uint32Array(indexTotal);
  const glass = new Uint8Array(indexTotal / 3);
  const n = parts.length;
  const vertexStart = new Uint32Array(n);
  const vertexCount = new Uint32Array(n);
  const indexStart = new Uint32Array(n);
  const indexCount = new Uint32Array(n);
  let vo = 0;
  let io = 0;
  parts.forEach((part, k) => {
    vertexStart[k] = vo;
    indexStart[k] = io;
    let localBase = 0;
    for (const mesh of part.meshes) {
      const g = mesh.geometry as BufferGeometry;
      const pos = g.attributes.position;
      const e = mesh.matrixWorld.elements;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const o = (vo + i) * 3;
        positions[o] = e[0] * x + e[4] * y + e[8] * z + e[12] - center[0];
        positions[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13] - center[1];
        positions[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14] - center[2];
      }
      const count = g.index ? g.index.count : pos.count;
      if (g.index) for (let i = 0; i < count; i++) indices[io + i] = localBase + g.index.getX(i);
      else for (let i = 0; i < count; i++) indices[io + i] = localBase + i;
      // vitrage : par matériau (groupes) ou pour tout le sous-maillage
      const mats = mesh.material;
      if (Array.isArray(mats)) {
        if (g.groups.length) {
          for (const grp of g.groups) {
            const flag = isGlass(mats[grp.materialIndex ?? 0]) ? 1 : 0;
            const end = Math.min(count, grp.start + grp.count);
            for (let t = grp.start; t < end; t += 3) glass[(io + t) / 3] = flag;
          }
        } else if (isGlass(mats[0])) glass.fill(1, io / 3, (io + count) / 3);
      } else if (isGlass(mats)) glass.fill(1, io / 3, (io + count) / 3);
      vo += pos.count;
      io += count;
      localBase += pos.count;
    }
    vertexCount[k] = vo - vertexStart[k];
    indexCount[k] = io - indexStart[k];
  });
  return { positions, indices, vertexStart, vertexCount, indexStart, indexCount, glass, sourceIds: parts.map((p) => p.sourceId), center };
}

/** Tampons à transférer (sans copie) vers le Worker. */
export function packetTransferables(p: HlrPacket): ArrayBuffer[] {
  return [p.positions, p.indices, p.vertexStart, p.vertexCount, p.indexStart, p.indexCount, p.glass].map((a) => a.buffer as ArrayBuffer);
}
