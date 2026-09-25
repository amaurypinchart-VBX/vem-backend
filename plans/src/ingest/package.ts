// Paquet interne : le modèle normalisé et nettoyé, exporté en GLB (noms + userData → extras glTF).
// Rouvrir un modèle = recharger ce GLB (rapide) au lieu de réanalyser le .dae.
import type { Object3D } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function exportPackage(root: Object3D): Promise<ArrayBuffer> {
  const out = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
  if (!(out instanceof ArrayBuffer)) throw new Error('Export GLB : résultat inattendu');
  return out;
}

export interface LoadedPackage {
  root: Object3D;
  objectsById: Map<string, Object3D>;
  durationMs: number;
}

/** Recharge un paquet GLB et retrouve chaque nœud de l'index par son identifiant (userData.vbxId). */
export async function loadPackage(data: ArrayBuffer): Promise<LoadedPackage> {
  const t0 = performance.now();
  const gltf = await new GLTFLoader().parseAsync(data, '');
  const root = gltf.scene;
  root.updateMatrixWorld(true);
  const objectsById = new Map<string, Object3D>();
  root.traverse((o) => {
    const id = o.userData?.vbxId;
    if (typeof id === 'string' && !objectsById.has(id)) {
      objectsById.set(id, o);
      if (typeof o.userData.originalName === 'string') o.name = o.userData.originalName;
    }
  });
  return { root, objectsById, durationMs: Math.round(performance.now() - t0) };
}
