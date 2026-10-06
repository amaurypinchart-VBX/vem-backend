// Optimiseur (S10d) : termine, propose des solutions vérifiées par un calcul complet (η ≤ 1), signale les assemblages
// hors gabarit et les sections du catalogue à confirmer, sépare les changements d'usage, déterministe.
import { describe, expect, it } from 'vitest';
import { sectionMap } from '../../src/structure/core/assemble';
import { withMods } from '../../src/structure/advisor/variant';
import { optimize, worstEta } from '../../src/structure/advisor/optimize';
import type { VariantChanges } from '../../src/structure/advisor/diagnose';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { LOADS, vbx } from './studyHelpers';

const raw: StudyInputs = {
  modules: [vbx('A', 0, 0), vbx('C', 0, 2.5)],
  edgeItems: [],
  pointItems: [],
  library: SEED,
  sections: sectionMap(SEED),
  loads: { ...LOADS, weightMode: 'weighed', liveGround: 5e-3 },
  middleFeet: false,
  sls: true,
  options: { ...CALC_DEFAULTS, friction: 0.6 },
  blocking: [],
};
const build = (ch: VariantChanges) => withMods({ ...raw, options: { ...raw.options, ...(ch.calc ?? {}) } }, ch.mods).inputs;

describe('optimiseur', () => {
  it('rives du plancher en UPN 120 (rives et angles ne passent pas) : section minimale trouvée et vérifiée, déterministe', async () => {
    const runner = createInlineStudyRunner();
    const start: VariantChanges = { mods: { sections: [{ slot: 'rim-floor', section: 'CAT-UPN120' }] } };
    const run = await runStudy(build(start), runner);
    expect(run.verdict.verdict).toBe('fail');
    const res = await optimize({ changes: start, run, build }, runner, { friction: 0.6, maxLevers: 2 });
    expect(res.partial).toBe(false);
    expect(res.proposals.length).toBeGreaterThan(0);
    const p = res.proposals[0];
    // vérifiée par un calcul complet (toutes les combinaisons) : η ≤ 1
    expect(p.run.combos.length).toBe(run.combos.length);
    expect(p.etaMax).toBeLessThanOrEqual(1);
    expect(worstEta(p.run)).toBe(p.etaMax);
    expect(p.text).toMatch(/^Passe avec : rives du plancher en UPN \d+/);
    // l'angle hors gabarit reste indicatif : jamais « passe », signalé ; la section du catalogue est à confirmer
    expect(p.verdict).not.toBe('ok');
    expect(p.flags.join(' ')).toMatch(/capacité indicative/);
    expect(p.flags.join(' ')).toMatch(/catalogue du commerce/);
    expect(p.addedKg).toBeGreaterThan(0);
    // déterministe
    const again = await optimize({ changes: start, run, build }, runner, { friction: 0.6, maxLevers: 2 });
    expect(again.proposals.map((x) => x.text)).toEqual(res.proposals.map((x) => x.text));
  }, 300000);

  it('rien à optimiser : message, aucun calcul ; arrêt immédiat : résultat partiel', async () => {
    const runner = createInlineStudyRunner();
    const run = await runStudy(build({}), runner);
    const none = await optimize({ changes: {}, run, build }, runner, { friction: 0.6, target: 1 });
    expect(none.runs).toBe(0);
    const bad: VariantChanges = { mods: { sections: [{ slot: 'rim-floor', section: 'CAT-UPN120' }] } };
    const r2 = await runStudy(build(bad), runner);
    const ctrl = new AbortController();
    ctrl.abort();
    const stopped = await optimize({ changes: bad, run: r2, build }, runner, { friction: 0.6, signal: ctrl.signal });
    expect(stopped.partial).toBe(true);
    expect(stopped.proposals).toEqual([]);
    expect(stopped.notes[0]).toMatch(/Aucune solution simple/);
  }, 120000);
});
