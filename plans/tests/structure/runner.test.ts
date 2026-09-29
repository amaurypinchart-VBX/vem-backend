// Exécution du calcul : même résultat en direct et par le pool de Workers (Worker simulé qui exécute le même traitement
// que solve.worker.ts), ordre des combinaisons conservé, progression, annulation, erreurs de calcul transmises.
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/structure/core/fem/analysis';
import type { SolveRequest, SolveResponse } from '../../src/structure/worker/protocol';
import { handleSolve } from '../../src/structure/worker/protocol';
import { createInlineSolveRunner, createSolveWorkerPool } from '../../src/structure/worker/runner';
import { FemError } from '../../src/structure/core/fem/types';
import { ModelBuilder, force, load } from './femHelpers';
import { clusterLoads, viewboxCluster } from './syntheticViewbox';

/** Worker simulé : clone structuré des messages (comme un vrai Worker), traitement asynchrone. */
class FakeWorker {
  onmessage: ((e: MessageEvent<SolveResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  static count = 0;
  constructor() {
    FakeWorker.count++;
  }
  postMessage(req: SolveRequest) {
    const data = structuredClone(req);
    setTimeout(() => {
      if (this.terminated) return;
      const post = (m: SolveResponse) => !this.terminated && this.onmessage?.({ data: structuredClone(m) } as MessageEvent<SolveResponse>);
      post(handleSolve(data, post));
    }, 0);
  }
  terminate() {
    this.terminated = true;
  }
}
const factory = () => new FakeWorker() as unknown as Worker;

describe('exécution du calcul', () => {
  const c = viewboxCluster(2, 1, 2);
  const sets = clusterLoads(c, 5);

  it('pool de Workers = calcul direct, dans l’ordre des combinaisons', async () => {
    const direct = analyze(c.model, sets, { secondOrder: true });
    const progress: number[] = [];
    const pool = createSolveWorkerPool(3, factory);
    const viaPool = await pool.run({ model: c.model, sets, options: { secondOrder: true }, onProgress: (d) => progress.push(d) });
    expect(viaPool.map((r) => r.loadSet)).toEqual(sets.map((s) => s.id));
    viaPool.forEach((r, k) => {
      expect(Array.from(r.displacements)).toEqual(Array.from(direct[k].displacements));
      expect(r.reactions).toEqual(direct[k].reactions);
    });
    expect(progress[progress.length - 1]).toBe(5);
    const inline = await createInlineSolveRunner().run({ model: c.model, sets: sets.slice(0, 2), options: { secondOrder: true } });
    expect(Array.from(inline[1].displacements)).toEqual(Array.from(direct[1].displacements));
  });

  it('annulation : les Workers sont arrêtés', async () => {
    const ctrl = new AbortController();
    const pool = createSolveWorkerPool(2, factory);
    const p = pool.run({ model: c.model, sets, options: {} }, ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toThrow('Annulé');
  });

  it('erreur de calcul transmise avec son code et ses nœuds', async () => {
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const B = b.node('B', 1000, 0, 0);
    b.member('AB', A, B);
    const pool = createSolveWorkerPool(1, factory);
    const err = await pool.run({ model: b.model, sets: [load('P', { nodal: [force(B, { fy: -1 })] })] }).catch((e) => e);
    expect(err).toBeInstanceOf(FemError);
    expect((err as FemError).code).toBe('mechanism');
    expect((err as FemError).nodes.length).toBeGreaterThan(0);
  });
});
