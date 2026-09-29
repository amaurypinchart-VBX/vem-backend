// Exécution du calcul de structure : pool de Web Workers (les combinaisons sont réparties entre les Workers, chacun
// prépare le modèle une fois) ou directement sur le thread courant (tests, navigateur sans Worker). Annulable.
import type { AnalysisOptions, AnalysisResult, FemModel, LoadSet } from '../core/fem/types';
import type { SolveRequest, SolveResponse } from './protocol';
import { errorFromResponse, handleSolve } from './protocol';

export interface SolveJob {
  model: FemModel;
  sets: LoadSet[];
  options?: AnalysisOptions;
  /** combinaisons calculées / total */
  onProgress?: (done: number, total: number) => void;
}

export interface SolveRunner {
  run(job: SolveJob, signal?: AbortSignal): Promise<AnalysisResult[]>;
  dispose(): void;
}

const abortError = () => new DOMException('Annulé', 'AbortError');

/** Calcul sur le thread courant, par petites étapes (une combinaison à la fois) pour laisser respirer l'interface. */
export function createInlineSolveRunner(): SolveRunner {
  return {
    async run(job, signal) {
      const results: AnalysisResult[] = [];
      for (let k = 0; k < job.sets.length; k++) {
        await new Promise((r) => setTimeout(r, 0));
        if (signal?.aborted) throw abortError();
        const res = handleSolve({ type: 'solve', id: 0, model: job.model, sets: [job.sets[k]], options: job.options ?? {} }, () => {});
        if (res.type === 'error') throw errorFromResponse(res);
        if (res.type === 'result') results.push(res.results[0]);
        job.onProgress?.(k + 1, job.sets.length);
      }
      return results;
    },
    dispose() {},
  };
}

/** Fabrique de Worker (remplaçable dans les tests). */
export type WorkerFactory = () => Worker;

const defaultFactory: WorkerFactory = () => new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' });

/** Pool de Workers : les combinaisons sont réparties en `size` paquets calculés en parallèle. */
export function createSolveWorkerPool(
  size = Math.max(1, Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4) - 1)),
  factory: WorkerFactory = defaultFactory,
): SolveRunner {
  let nextId = 1;
  const live = new Set<Worker>();
  return {
    run(job, signal) {
      if (signal?.aborted) return Promise.reject(abortError());
      const total = job.sets.length;
      if (!total) return Promise.resolve([]);
      const n = Math.min(size, total);
      // répartition alternée : les combinaisons voisines (souvent de coût proche) vont à des Workers différents
      const chunks: number[][] = Array.from({ length: n }, () => []);
      job.sets.forEach((_, k) => chunks[k % n].push(k));
      const results: Array<AnalysisResult | undefined> = new Array(total);
      const doneBy = new Array<number>(n).fill(0);
      const workers: Worker[] = [];
      return new Promise<AnalysisResult[]>((resolve, reject) => {
        let finished = 0;
        let settled = false;
        const stop = () => {
          for (const w of workers) {
            w.terminate();
            live.delete(w);
          }
          signal?.removeEventListener('abort', onAbort);
        };
        const fail = (e: Error) => {
          if (settled) return;
          settled = true;
          stop();
          reject(e);
        };
        const onAbort = () => fail(abortError());
        signal?.addEventListener('abort', onAbort);
        chunks.forEach((chunk, c) => {
          const w = factory();
          workers.push(w);
          live.add(w);
          const id = nextId++;
          w.onmessage = (e: MessageEvent<SolveResponse>) => {
            const m = e.data;
            if (settled || m.id !== id) return;
            if (m.type === 'progress') {
              doneBy[c] = m.done;
              job.onProgress?.(doneBy.reduce((a, b) => a + b, 0), total);
            } else if (m.type === 'error') fail(errorFromResponse(m));
            else {
              m.results.forEach((r, k) => (results[chunk[k]] = r));
              w.terminate();
              live.delete(w);
              if (++finished === n) {
                settled = true;
                signal?.removeEventListener('abort', onAbort);
                resolve(results as AnalysisResult[]);
              }
            }
          };
          w.onerror = (e) => fail(new Error('Calcul de structure : ' + (e.message || 'erreur du Worker')));
          const req: SolveRequest = { type: 'solve', id, model: job.model, sets: chunk.map((k) => job.sets[k]), options: job.options ?? {} };
          w.postMessage(req);
        });
      });
    },
    dispose() {
      for (const w of live) w.terminate();
      live.clear();
    },
  };
}
