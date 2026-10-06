// Enchaînement du calcul complet (étape 3) : verdict, plancher, pièce non modélisée → incomplet, empreinte des entrées
// (résultat périmé), calage à partir des réactions du calcul.
import { describe, expect, it } from 'vitest';
import { sectionMap } from '../../src/structure/core/assemble';
import { computeCalage } from '../../src/structure/core/calage';
import { ESTIMATE_DEFAULTS } from '../../src/structure/core/estimate';
import { C24_BEAMS } from '../../src/structure/core/ground';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, inputKey, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { LOADS, vbx } from './studyHelpers';

const base: StudyInputs = {
  modules: [vbx('A', 0, 0), vbx('B', 5.9, 0)],
  edgeItems: [{ module: 'A', side: 'v0', from: 0, to: 5890, level: 'floor', q: 1.75, loadCase: 'G3', label: 'vitrage' }],
  pointItems: [],
  library: SEED,
  sections: sectionMap(SEED),
  loads: LOADS,
  middleFeet: false,
  sls: true,
  // frottement bois / bois 0,4 (DIN EN 13814 tab. 3)
  options: { ...CALC_DEFAULTS, friction: 0.4 },
  blocking: [],
};

describe('calcul complet d’une étude', () => {
  it('2 Viewbox bout à bout : verdict, plancher, réactions → calage', async () => {
    const run = await runStudy(base, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    // barres et assemblages passent ; installation légère sur un niveau : glissement global sous le vent hors service
    // (μ requis ≈ 0,52 > μ = 0,4) → ne passe pas sans lest ou ancrage
    expect(run.verdict.families.every((f) => f.verdict === 'ok' || f.verdict === 'limit')).toBe(true);
    expect(run.stability.sliding.muReq).toBeGreaterThan(0.45);
    expect(run.stability.sliding.combo).toMatch(/^COB/);
    expect(run.verdict.verdict).toBe('fail');
    const ok = await runStudy({ ...base, options: { ...CALC_DEFAULTS, friction: 0.6 } }, createInlineStudyRunner());
    expect(['ok', 'limit']).toContain(ok.verdict.verdict);
    // qEd avec pression intérieure ≈ 5,6 kN/m², 2 couches croisées de 18 mm (une seule couche : 0,8 à 0,95)
    expect(run.plywood.eta).toBeGreaterThan(0.4);
    expect(run.plywood.eta).toBeLessThan(0.475);
    expect(run.loads.cases.find((c) => c.id === 'G3')!.resultant[1]).toBeCloseTo(-1.75 * 5890, 6);
    // calage : 6 groupes (4 angles seuls + 2 paires au raccord), réactions du calcul utilisées telles quelles
    expect(run.ground.groups.map((g) => g.corners).sort()).toEqual([1, 1, 1, 1, 2, 2]);
    const cal = computeCalage({
      modules: [],
      estimate: { ...ESTIMATE_DEFAULTS, loads: { moduleWeight: 0, ceiling: 0, floorFinish: 0, live: 0, roofLive: 0, extraPerModule: 0 } },
      bearing: 0.2,
      staticoConversion: false,
      thicknesses: [18, 21, 24, 27, 30, 40],
      stock: [],
      commercial: [],
      longrine: { k: 0.03, beams: C24_BEAMS, overhang: 55, maxCount: 6 },
      diffusion: false,
      reactions: run.ground,
    });
    expect(cal.types.map((t) => t.corners).sort()).toEqual([1, 2]);
    const pair = cal.types.find((t) => t.corners === 2)!;
    expect(pair.RzEd).toBeCloseTo(Math.max(...run.ground.reactions.filter((r) => r.group.corners === 2).map((r) => r.REd)), 6);
    expect(pair.chosen).toBeTruthy();
  }, 120000);

  it('pièce porteuse non modélisée : verdict incomplet ; vérin retiré de la bibliothèque : tiges bloquées', async () => {
    const library = SEED.map((e) => (e.kind === 'connection' && e.key === 'VBX-JACK' ? { ...e, disabled: true } : e));
    const run = await runStudy(
      { ...base, modules: [vbx('A', 0, 0)], edgeItems: [], library, options: { ...CALC_DEFAULTS, jacks: true }, blocking: ['2 pièce(s) porteuse(s) « Escalier » : pas encore modélisées'] },
      createInlineStudyRunner(),
    );
    expect(run.verdict.verdict).toBe('incomplete');
    expect(run.verdict.reasons.some((r) => r.includes('VBX-JACK'))).toBe(true);
    expect(run.verdict.reasons.some((r) => r.includes('Escalier'))).toBe(true);
  }, 120000);

  it('empreinte des entrées : change avec les charges, les options ou la position d’une Viewbox', () => {
    const k = inputKey(base);
    expect(inputKey({ ...base })).toBe(k);
    expect(inputKey({ ...base, loads: { ...LOADS, live: 5e-3 } })).not.toBe(k);
    expect(inputKey({ ...base, options: { ...CALC_DEFAULTS, ec3Method: 'statico' } })).not.toBe(k);
    expect(inputKey({ ...base, modules: [vbx('A', 0, 0), vbx('B', 5.95, 0)] })).not.toBe(k);
  });
});
