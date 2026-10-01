// Étude complète : calcul de toutes les combinaisons, vérifications EC3 et assemblages, verdict, familles, stabilité,
// réactions par groupe d'appuis ; même résumé en direct et par le pool de Workers (Worker simulé).
import { describe, expect, it } from 'vitest';
import { buildItemIndex, groundEstimate, stability, studyVerdict } from '../../src/structure/core/results';
import type { StudyRequest, StudyResponse } from '../../src/structure/worker/study';
import { createInlineStudyRunner, createStudyWorkerPool, handleStudy } from '../../src/structure/worker/study';
import { study, vbx } from './studyHelpers';

class FakeWorker {
  onmessage: ((e: MessageEvent<StudyResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  terminated = false;
  postMessage(req: StudyRequest) {
    const data = structuredClone(req);
    setTimeout(() => {
      if (this.terminated) return;
      const post = (m: StudyResponse) => !this.terminated && this.onmessage?.({ data: structuredClone(m) } as MessageEvent<StudyResponse>);
      post(handleStudy(data, post));
    }, 0);
  }
  terminate() {
    this.terminated = true;
  }
}

describe('étude complète (2 Viewbox au sol + 1 empilée)', () => {
  const s = study([vbx('A', 0, 0), vbx('B', 0, 2.5), vbx('U', 0, 0, 1)]);
  const index = buildItemIndex(s.structure, s.sections);

  it('toutes les vérifications calculées, verdict, familles, stabilité, calage ; Workers = direct', async () => {
    const progress: number[] = [];
    const summary = await createInlineStudyRunner().run({ jobs: s.jobs, context: s.context, options: { secondOrder: true }, onProgress: (d) => progress.push(d) });
    expect(progress[progress.length - 1]).toBe(s.combos.length);
    expect(summary.errors).toEqual([]);
    expect(summary.done.sort()).toEqual(s.combos.map((c) => c.id).sort());
    // chaque vérification a un taux fini, une combinaison ELU et son détail
    expect(summary.states.every((x) => x && Number.isFinite(x.eta) && !x.blocked && x.combo.startsWith('CO') && x.records.length > 0)).toBe(true);
    const kinds = new Set(index.items.map((i) => i.kind));
    expect(kinds).toEqual(new Set(['member', 'corner', 'vlink', 'bolt']));
    expect(index.items.filter((i) => i.kind === 'corner')).toHaveLength(24);
    expect(index.items.filter((i) => i.kind === 'vlink')).toHaveLength(4);
    const stab = stability(summary, s.combos, 0.4);
    expect(stab.overturning.verdict).toBe('ok');
    // installation légère sur 2 niveaux, vent hors service : μ requis ≈ 0,37 (vent ≈ 21 kN / charges ≈ 57 kN)
    expect(stab.sliding.muReq).toBeGreaterThan(0.3);
    expect(stab.sliding.muReq).toBeLessThan(0.45);
    expect(stab.sliding.eta).toBeCloseTo(stab.sliding.muReq / 0.4, 12);
    expect(stab.sliding.combo).toMatch(/^COB/);
    const v = studyVerdict(index, summary, stab);
    expect(['ok', 'limit', 'fail']).toContain(v.verdict);
    expect(v.families.map((f) => f.family)).toContain('Angles poteau / cadre');
    expect(v.families.some((f) => f.family.startsWith('Rive plancher — UNP 220'))).toBe(true);
    expect(v.ranking[0]).toBe(v.families[0].item);
    // calage : 8 angles au sol, deux groupes de 2 angles (A / B côte à côte), REd ≥ Rk > 0
    const est = groundEstimate(s.structure, summary, s.combos);
    expect(est.groups.map((g) => g.corners).sort()).toEqual([1, 1, 1, 1, 2, 2]);
    expect(est.reactions.every((r) => r.REd >= r.Rk && r.Rk > 0 && r.G > 0)).toBe(true);
    // pool de Workers simulés : même résumé
    const pool = createStudyWorkerPool(4, () => new FakeWorker() as unknown as Worker);
    const viaPool = await pool.run({ jobs: s.jobs, context: s.context, options: { secondOrder: true } });
    expect(viaPool.states.map((x) => [x!.eta, x!.combo, x!.governing])).toEqual(summary.states.map((x) => [x!.eta, x!.combo, x!.governing]));
    expect(viaPool.reactions).toEqual(summary.reactions);
  }, 120000);
});
