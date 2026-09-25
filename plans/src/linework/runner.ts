// Exécution des calculs de vues : pool de Web Workers (une vue par Worker, en parallèle) ou directement (tests).
import type { HlrJob, HlrPacket } from './hlr';
import { computeView } from './hlr';
import type { Linework2D } from './types';

export interface HlrTask {
  packetKey: string;
  packet: HlrPacket;
  job: HlrJob;
  onProgress?: (fraction: number, message: string) => void;
}

export interface HlrRunner {
  run(task: HlrTask, signal?: AbortSignal): Promise<Linework2D>;
  dispose(): void;
}

const abortError = () => new DOMException('Annulé', 'AbortError');

/** Calcul sur le thread courant (tests, ou navigateur sans Worker). */
export function createInlineRunner(): HlrRunner {
  return {
    async run(task, signal) {
      await new Promise((r) => setTimeout(r, 0));
      if (signal?.aborted) throw abortError();
      return computeView(task.packet, task.job, task.onProgress);
    },
    dispose() {},
  };
}

interface Slot {
  worker: Worker;
  packetKey: string | null;
  task: Pending | null;
}

interface Pending {
  id: number;
  task: HlrTask;
  signal?: AbortSignal;
  resolve: (lw: Linework2D) => void;
  reject: (e: Error) => void;
  onAbort?: () => void;
}

/** Pool de Workers : jusqu'à `size` vues calculées en même temps. */
export function createWorkerPool(size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))): HlrRunner {
  const slots: Slot[] = [];
  const queue: Pending[] = [];
  let nextId = 1;

  const spawn = (): Slot => {
    const slot: Slot = { worker: new Worker(new URL('./hlr.worker.ts', import.meta.url), { type: 'module' }), packetKey: null, task: null };
    slot.worker.onmessage = (e: MessageEvent<{ type: string; id: number; fraction?: number; message?: string; linework?: Linework2D }>) => {
      const p = slot.task;
      if (!p || e.data.id !== p.id) return;
      if (e.data.type === 'progress') p.task.onProgress?.(e.data.fraction ?? 0, e.data.message ?? '');
      else {
        slot.task = null;
        if (p.onAbort) p.signal?.removeEventListener('abort', p.onAbort);
        if (e.data.type === 'result') p.resolve(e.data.linework!);
        else p.reject(new Error('Calcul de la vue : ' + (e.data.message ?? 'erreur')));
        pump();
      }
    };
    slot.worker.onerror = (e) => {
      const p = slot.task;
      slot.task = null;
      kill(slot);
      p?.reject(new Error('Calcul de la vue : ' + (e.message || 'erreur du Worker')));
      pump();
    };
    slots.push(slot);
    return slot;
  };

  const kill = (slot: Slot) => {
    slot.worker.terminate();
    const i = slots.indexOf(slot);
    if (i >= 0) slots.splice(i, 1);
  };

  const start = (slot: Slot, p: Pending) => {
    slot.task = p;
    if (slot.packetKey !== p.task.packetKey) {
      slot.worker.postMessage({ type: 'packet', key: p.task.packetKey, packet: p.task.packet });
      slot.packetKey = p.task.packetKey;
    }
    slot.worker.postMessage({ type: 'view', id: p.id, key: p.task.packetKey, job: p.task.job });
  };

  const pump = () => {
    while (queue.length) {
      const p = queue[0];
      // de préférence un Worker libre qui a déjà ce sous-ensemble en mémoire
      let slot = slots.find((s) => !s.task && s.packetKey === p.task.packetKey) ?? slots.find((s) => !s.task);
      if (!slot && slots.length < size) slot = spawn();
      if (!slot) return;
      queue.shift();
      start(slot, p);
    }
  };

  return {
    run(task, signal) {
      return new Promise<Linework2D>((resolve, reject) => {
        if (signal?.aborted) return reject(abortError());
        const p: Pending = { id: nextId++, task, signal, resolve, reject };
        p.onAbort = () => {
          const qi = queue.indexOf(p);
          if (qi >= 0) queue.splice(qi, 1);
          const slot = slots.find((s) => s.task === p);
          if (slot) kill(slot); // interrompt le calcul en cours
          reject(abortError());
          pump();
        };
        signal?.addEventListener('abort', p.onAbort, { once: true });
        queue.push(p);
        pump();
      });
    },
    dispose() {
      for (const s of [...slots]) kill(s);
      for (const p of queue.splice(0)) p.reject(abortError());
    },
  };
}
