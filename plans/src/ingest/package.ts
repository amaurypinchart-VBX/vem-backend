// Paquet interne : le modèle normalisé et nettoyé, exporté en GLB (noms + userData → extras glTF).
// Rouvrir un modèle = recharger ce GLB (rapide) au lieu de réanalyser le .dae.
import type { Material, Mesh, Object3D, Texture } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const TEXTURE_SLOTS = ['map', 'normalMap', 'bumpMap', 'alphaMap', 'emissiveMap', 'specularMap', 'aoMap', 'lightMap', 'roughnessMap', 'metalnessMap'];

function hasImage(t: Texture): boolean {
  const img = t.image as { width?: number; data?: unknown } | undefined;
  return !!img && ((img.width ?? 0) > 0 || !!img.data);
}

export async function exportPackage(root: Object3D): Promise<ArrayBuffer> {
  // Une texture introuvable ou illisible ferait échouer tout l'export : on la retire le temps de l'export.
  const removed: Array<{ mat: Record<string, unknown>; slot: string; tex: Texture }> = [];
  root.traverse((o) => {
    const mats = (o as Mesh).material;
    if (!mats) return;
    for (const m of (Array.isArray(mats) ? mats : [mats]) as Material[]) {
      const rec = m as unknown as Record<string, unknown>;
      for (const slot of TEXTURE_SLOTS) {
        const tex = rec[slot] as Texture | null | undefined;
        if (tex && !hasImage(tex)) {
          removed.push({ mat: rec, slot, tex });
          rec[slot] = null;
        }
      }
    }
  });
  try {
    const out = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: false });
    if (!(out instanceof ArrayBuffer)) throw new Error('Export GLB : résultat inattendu');
    return out;
  } finally {
    for (const r of removed) r.mat[r.slot] = r.tex;
  }
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
