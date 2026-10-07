// Fiche d'une Viewbox dans les résultats (clic sur une Viewbox) : couleur expliquée, cause reconnue (pied central
// excentré → torsion de la rive), pistes simulables, repères statico ; option « cale du milieu sous la rive ».
import { describe, expect, it } from 'vitest';
import { sectionMap } from '../../src/structure/core/assemble';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { bandOf, explainModule, scenarioText } from '../../src/structure/advisor/explain';
import { LOADS, vbx } from './studyHelpers';

const base: StudyInputs = {
  modules: [vbx('A', 0, 0), vbx('B', 5.9, 0), vbx('C', 0, 2.5), vbx('D', 5.9, 2.5)],
  edgeItems: [],
  pointItems: [],
  library: SEED,
  sections: sectionMap(SEED),
  loads: LOADS,
  middleFeet: true,
  sls: false,
  options: { ...CALC_DEFAULTS },
  blocking: [],
};
const rimEta = (run: Awaited<ReturnType<typeof runStudy>>) => Math.max(...run.index.items.map((it, t) => (it.family.startsWith('Rive plancher') ? run.summary.states[t]!.eta : 0)));

describe('fiche Viewbox', () => {
  it('pied central sous la réception : torsion de la rive expliquée, cale sous l’UNP proposée', async () => {
    const run = await runStudy(base, createInlineStudyRunner());
    const fiches = ['A', 'B', 'C', 'D'].map((m) => explainModule(run, m, { friction: 0.6 })!);
    const f = fiches.reduce((a, b) => (b.eta > a.eta ? b : a));
    expect(f.worst!.category).toBe('rim-floor');
    expect(f.worst!.state.governing).toBe('T');
    expect(f.worst!.check).toMatch(/^Torsion/);
    expect(f.supports).toMatch(/6 points : 4 angles \+ 2 au milieu/);
    expect(f.supports).toMatch(/155 mm à l’intérieur de la rive/);
    expect(f.causes[0]).toMatch(/tordue par l’appui du milieu/);
    expect(f.causes[0]).toMatch(/kNm/);
    expect(f.remedies.map((r) => r.id)).toEqual(expect.arrayContaining(['middle-under-rim', 'corners-only']));
    expect(f.worst!.statico).toMatch(/18-0573/);
    expect(f.worst!.risk).toMatch(/^Si η dépasse 1/);
    expect(scenarioText(run, f.worst!.state.combo)).toMatch(/poids propre/);
    expect(f.band).toBe(bandOf(f.eta));
    // une ligne par famille, la plus chargée d'abord
    expect(f.families[0].t).toBe(f.worst!.t);
    expect(new Set(f.families.map((x) => x.item.family)).size).toBe(f.families.length);

    // cale du milieu directement sous l'UNP : plus de réaction excentrée, la rive ne travaille plus en torsion
    const rim = await runStudy({ ...base, options: { ...CALC_DEFAULTS, middleUnderRim: true } }, createInlineStudyRunner());
    expect(rimEta(rim)).toBeLessThan(rimEta(run) / 2);
    const g = explainModule(rim, 'A', { friction: 0.6 })!;
    expect(g.supports).toMatch(/directement sous la rive/);
    expect(g.causes.join(' ')).not.toMatch(/tordue/);
    expect(g.families.find((x) => x.category === 'rim-floor')!.state.governing).not.toBe('T');
  }, 120000);

  it('pieds à vérin : la cale sous l’UNP passe par « sans vérins »', async () => {
    const run = await runStudy({ ...base, middleFeet: false, options: { ...CALC_DEFAULTS, jacks: true } }, createInlineStudyRunner());
    const fiches = ['A', 'B', 'C', 'D'].map((m) => explainModule(run, m, { friction: 0.6 })!);
    const f = fiches.reduce((a, b) => (b.eta > a.eta ? b : a));
    expect(f.supports).toMatch(/sur pieds à vérin/);
    if (f.worst!.state.governing === 'T') expect(f.remedies.find((r) => r.id === 'middle-under-rim-nojack')!.changes).toEqual({ calc: { jacks: false, middleUnderRim: true }, hyp: { middleFeet: true } });
    expect(explainModule(run, 'inconnue', { friction: 0.6 })).toBeNull();
  }, 120000);
});
