// Paquet interne : le modèle normalisé et nettoyé, exporté en GLB (noms + userData → extras glTF).
// Rouvrir un modèle = recharger ce GLB (rapide) au lieu de réanalyser le .dae.
import type { Material, Mesh, Object3D, Texture } from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { gunzipSync, gzipSync } from 'fflate';

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

/** Taille maximale d'un morceau envoyé au serveur (Cloudinary refuse les fichiers de plus de 10 Mo). */
export const PACKAGE_PART_BYTES = 9 * 1024 * 1024;

export interface PackedPackage {
  encoding: 'gzip';
  /** taille du GLB avant compression */
  totalSize: number;
  parts: Uint8Array[];
}

/** Compresse le GLB (≈ 5 × plus petit) et le découpe en morceaux de moins de 9 Mo. */
export function packPackage(glb: ArrayBuffer, partBytes = PACKAGE_PART_BYTES): PackedPackage {
  const z = gzipSync(new Uint8Array(glb), { level: 6 });
  const parts: Uint8Array[] = [];
  for (let o = 0; o < z.length; o += partBytes) parts.push(z.subarray(o, Math.min(z.length, o + partBytes)));
  return { encoding: 'gzip', totalSize: glb.byteLength, parts };
}

/** Recolle les morceaux et décompresse (ou rend le GLB tel quel s'il n'était pas compressé). */
export function unpackPackage(parts: ArrayBuffer[], encoding: string | null | undefined): ArrayBuffer {
  const total = parts.reduce((a, p) => a + p.byteLength, 0);
  const all = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    all.set(new Uint8Array(p), o);
    o += p.byteLength;
  }
  if (encoding !== 'gzip') return all.buffer;
  const out = gunzipSync(all);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
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
