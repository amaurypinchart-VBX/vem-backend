// Orchestration du nettoyage des géométries (thread principal ↔ Worker).
import { BufferAttribute } from 'three';
import type { BufferGeometry, Mesh, Object3D } from 'three';
import type { CleanJob, CleanJobResult, AttributeData } from './cleanJob';
import { runCleanJob } from './cleanJob';
import type { CleanupStats } from './buildIndex';

/** Exécute des lots de tâches ; implémentation Worker (navigateur) ou directe (tests). */
export type BatchRunner = (batch: CleanJob[], signal?: AbortSignal) => Promise<CleanJobResult[]>;

export const inlineRunner: BatchRunner = async (batch) => batch.map(runCleanJob);

export function createWorkerRunner(): { run: BatchRunner; dispose: () => void } {
  const worker = new Worker(new URL('./cleanup.worker.ts', import.meta.url), { type: 'module' });
  let queue = Promise.resolve<unknown>(null);
  const run: BatchRunner = (batch, signal) => {
    const p = queue.then(
      () =>
        new Promise<CleanJobResult[]>((resolve, reject) => {
          if (signal?.aborted) return reject(new DOMException('Annulé', 'AbortError'));
          const onAbort = () => {
            worker.terminate();
            reject(new DOMException('Annulé', 'AbortError'));
          };
          signal?.addEventListener('abort', onAbort, { once: true });
          worker.onmessage = (e: MessageEvent<{ results?: CleanJobResult[]; error?: string }>) => {
            signal?.removeEventListener('abort', onAbort);
            if (e.data.error) reject(new Error('Nettoyage géométrie : ' + e.data.error));
            else resolve(e.data.results ?? []);
          };
          worker.onerror = (e) => {
            signal?.removeEventListener('abort', onAbort);
            reject(new Error('Nettoyage géométrie : ' + (e.message || 'erreur du Worker')));
          };
          const transfer: Transferable[] = [];
          for (const j of batch) {
            if (j.index) transfer.push(j.index.buffer);
            for (const a of Object.values(j.attributes)) if (!transfer.includes(a.array.buffer)) transfer.push(a.array.buffer);
          }
          worker.postMessage({ batch }, transfer);
        }),
    );
    queue = p.catch(() => null);
    return p;
  };
  return { run, dispose: () => worker.terminate() };
}

const TOLERANCE_MM = 0.01;
const BATCH_VERTICES = 300_000;

/**
 * Nettoie toutes les géométries triangulées du graphe (chaque géométrie partagée n'est traitée qu'une
 * fois, et modifiée sur place : toutes les instances qui la partagent en profitent).
 */
export async function cleanupScene(
  root: Object3D,
  run: BatchRunner,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<CleanupStats> {
  root.updateMatrixWorld(true);
  const maxScale = new Map<BufferGeometry, number>();
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const s = o.matrixWorld.getMaxScaleOnAxis();
    maxScale.set(m.geometry, Math.max(maxScale.get(m.geometry) ?? 0, s));
  });
  const geoms = [...maxScale.keys()].filter((g) => !Object.keys(g.morphAttributes).length);
  const stats: CleanupStats = { degenerate: 0, duplicate: 0, backToBack: 0 };
  let done = 0;
  let batch: CleanJob[] = [];
  let batchVertices = 0;

  const flush = async () => {
    if (!batch.length) return;
    const results = await run(batch, signal);
    for (const r of results) {
      const g = geoms[r.id];
      for (const name of Object.keys(g.attributes)) if (!(name in r.attributes)) g.deleteAttribute(name);
      for (const [name, a] of Object.entries(r.attributes)) g.setAttribute(name, new BufferAttribute(a.array, a.itemSize, a.normalized));
      g.setIndex(new BufferAttribute(r.index, 1));
      g.clearGroups();
      for (const gr of r.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      g.computeBoundingBox();
      g.computeBoundingSphere();
      stats.degenerate += r.degenerate;
      stats.duplicate += r.duplicate;
      stats.backToBack += r.backToBack;
    }
    done += batch.length;
    onProgress?.(done, geoms.length);
    batch = [];
    batchVertices = 0;
  };

  for (let id = 0; id < geoms.length; id++) {
    if (signal?.aborted) throw new DOMException('Annulé', 'AbortError');
    const g = geoms[id];
    const attributes: Record<string, AttributeData> = {};
    for (const [name, attr0] of Object.entries(g.attributes)) {
      const attr = (attr0 as BufferAttribute & { isInterleavedBufferAttribute?: boolean }).isInterleavedBufferAttribute
        ? (attr0 as BufferAttribute).clone()
        : (attr0 as BufferAttribute);
      attributes[name] = { array: (attr.array as AttributeData['array']).slice(), itemSize: attr.itemSize, normalized: attr.normalized };
    }
    const index = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : null;
    batch.push({
      id,
      attributes,
      index,
      groups: g.groups.map((gr) => ({ start: gr.start, count: gr.count, materialIndex: gr.materialIndex ?? 0 })),
      tolerance: TOLERANCE_MM / (maxScale.get(g) || 1),
    });
    batchVertices += g.attributes.position.count;
    if (batchVertices >= BATCH_VERTICES || batch.length >= 200) await flush();
  }
  await flush();
  return stats;
}
