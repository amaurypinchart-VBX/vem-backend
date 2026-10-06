// Calcul d'une étude complète en Workers : chaque Worker reçoit un paquet de combinaisons (avec la géométrie de leur
// défaut d'aplomb), calcule le modèle aux éléments finis puis les vérifications, et ne renvoie que le résumé (pire taux
// par vérification + détail du cas déterminant + réactions). Le même traitement sert en direct (tests, navigateur sans
// Worker) : résultats identiques. Annulable.
import type { StructuralModel } from '../core/assemble';
import type { Combination } from '../core/combos';
import type { Ec3Options } from '../core/checks/ec3';
import type { ConnectionSet } from '../core/checks/joints';
import { boltDiameter } from '../core/checks/joints';
import { analyzeLoadSet, prepare } from '../core/fem/analysis';
import type { AnalysisOptions, FemModel, LoadSet } from '../core/fem/types';
import { FemError } from '../core/fem/types';
import type { SectionEntry } from '../core/library';
import type { ComboOutcome, StudySummary } from '../core/results';
import { buildItemIndex, mergeSummaries, summarize } from '../core/results';
import type { StudyJob } from '../core/study';

export interface StudyContextData {
  structure: StructuralModel;
  sections: Array<[string, SectionEntry]>;
  connections: ConnectionSet;
  moduleConnections?: Record<string, ConnectionSet>;
  ec3: Ec3Options;
  calibration: boolean;
  /** sortie des tiges des pieds à vérin (mm) */
  jackExtension?: number;
}

export interface StudyRequest {
  type: 'study';
  id: number;
  /** géométries (une par défaut d'aplomb) et, pour chacune, les cas de ce paquet */
  parts: Array<{ model: FemModel; sets: LoadSet[]; combos: Combination[] }>;
  options: AnalysisOptions;
  context: StudyContextData;
}

export type StudyResponse =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'study-result'; id: number; summary: StudySummary }
  | { type: 'error'; id: number; code: 'internal'; message: string; nodes: string[] };

/** Calcule un paquet : FEM puis vérifications ; une combinaison en échec est gardée comme erreur, sans arrêter les autres. */
export function handleStudy(req: StudyRequest, post: (m: StudyResponse) => void): StudyResponse {
  try {
    const ctx = { ...req.context, sections: new Map(req.context.sections) };
    const index = buildItemIndex(ctx.structure, ctx.sections, { boltDiameter: boltDiameter(ctx.connections) });
    const outcomes: ComboOutcome[] = [];
    const total = req.parts.reduce((s, p) => s + p.sets.length, 0);
    for (const part of req.parts) {
      const prep = prepare(part.model);
      part.sets.forEach((set, k) => {
        const combo = part.combos[k];
        try {
          outcomes.push({ combo, result: analyzeLoadSet(prep, set, req.options) });
        } catch (e) {
          if (!(e instanceof FemError)) throw e;
          outcomes.push({ combo, error: { code: e.code, message: e.message, nodes: e.nodes } });
        }
        post({ type: 'progress', id: req.id, done: outcomes.length, total });
      });
    }
    return { type: 'study-result', id: req.id, summary: summarize(ctx, index, outcomes) };
  } catch (e) {
    return { type: 'error', id: req.id, code: 'internal', message: (e as Error)?.message ?? String(e), nodes: [] };
  }
}

/** Répartition des combinaisons en `n` paquets (alternée : des combinaisons voisines vont à des paquets différents). */
export function splitJobs(jobs: StudyJob[], n: number): Array<StudyRequest['parts']> {
  const flat = jobs.flatMap((j, a) => j.combos.map((_, k) => ({ a, k })));
  const count = Math.max(1, Math.min(n, flat.length));
  const chunks: Array<StudyRequest['parts']> = Array.from({ length: count }, () => []);
  flat.forEach(({ a, k }, t) => {
    const parts = chunks[t % count];
    let part = parts.find((p) => p.model === jobs[a].model);
    if (!part) parts.push((part = { model: jobs[a].model, sets: [], combos: [] }));
    part.sets.push(jobs[a].sets[k]);
    part.combos.push(jobs[a].combos[k]);
  });
  return chunks;
}

export interface StudyRunJob {
  jobs: StudyJob[];
  context: StudyContextData;
  options?: AnalysisOptions;
  onProgress?: (done: number, total: number) => void;
}

export interface StudyRunner {
  run(job: StudyRunJob, signal?: AbortSignal): Promise<StudySummary>;
  dispose(): void;
}

const abortError = () => new DOMException('Annulé', 'AbortError');

/** Nombre de paquets : identique en direct et en Workers, pour des résultats identiques. */
export const STUDY_CHUNKS = 4;

export function createInlineStudyRunner(chunks = STUDY_CHUNKS): StudyRunner {
  return {
    async run(job, signal) {
      const parts = splitJobs(job.jobs, chunks);
      const total = job.jobs.reduce((s, j) => s + j.sets.length, 0);
      const out: StudySummary[] = [];
      let done = 0;
      for (const p of parts) {
        await new Promise((r) => setTimeout(r, 0));
        if (signal?.aborted) throw abortError();
        const res = handleStudy({ type: 'study', id: 0, parts: p, options: job.options ?? {}, context: job.context }, () => {});
        if (res.type === 'error') throw new Error(`Calcul de structure : ${res.message}`);
        if (res.type === 'study-result') out.push(res.summary);
        done += p.reduce((s, x) => s + x.sets.length, 0);
        job.onProgress?.(done, total);
      }
      return mergeSummaries(out);
    },
    dispose() {},
  };
}

export type StudyWorkerFactory = () => Worker;
const defaultFactory: StudyWorkerFactory = () => new Worker(new URL('./solve.worker.ts', import.meta.url), { type: 'module' });

/** Pool de Workers : un paquet par Worker, calculés en parallèle ; progression cumulée, annulation. */
export function createStudyWorkerPool(chunks = STUDY_CHUNKS, factory: StudyWorkerFactory = defaultFactory): StudyRunner {
  let nextId = 1;
  const live = new Set<Worker>();
  return {
    run(job, signal) {
      if (signal?.aborted) return Promise.reject(abortError());
      const parts = splitJobs(job.jobs, chunks);
      const total = job.jobs.reduce((s, j) => s + j.sets.length, 0);
      if (!total) return Promise.resolve(mergeSummaries([]));
      const results: StudySummary[] = new Array(parts.length);
      const doneBy = new Array<number>(parts.length).fill(0);
      const workers: Worker[] = [];
      return new Promise<StudySummary>((resolve, reject) => {
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
        parts.forEach((p, c) => {
          const w = factory();
          workers.push(w);
          live.add(w);
          const id = nextId++;
          w.onmessage = (e: MessageEvent<StudyResponse>) => {
            const m = e.data;
            if (settled || m.id !== id) return;
            if (m.type === 'progress') {
              doneBy[c] = m.done;
              job.onProgress?.(doneBy.reduce((a, b) => a + b, 0), total);
            } else if (m.type === 'error') fail(new Error(`Calcul de structure : ${m.message}`));
            else {
              results[c] = m.summary;
              w.terminate();
              live.delete(w);
              if (++finished === parts.length) {
                settled = true;
                signal?.removeEventListener('abort', onAbort);
                resolve(mergeSummaries(results));
              }
            }
          };
          w.onerror = (e) => fail(new Error('Calcul de structure : ' + (e.message || 'erreur du Worker')));
          const req: StudyRequest = { type: 'study', id, parts: p, options: job.options ?? {}, context: job.context };
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
