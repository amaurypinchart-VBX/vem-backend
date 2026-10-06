// Charge d'exploitation maximale admissible : recherche par fausse position (fonction pure), limites par critère,
// plancher exact, et une recherche complète sur une Viewbox (calculs complets successifs).
import { describe, expect, it } from 'vitest';
import { sectionMap } from '../../src/structure/core/assemble';
import { CAPACITY_STEP, criterionLimit, liveCapacity, plywoodLimit, searchLimit, structureEta } from '../../src/structure/capacity';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, plywoodStrip, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { LOADS, vbx } from './studyHelpers';

const kg = (q: number) => (q * 1e6) / 9.81;

describe('recherche de la charge maximale', () => {
  it('η linéaire : trouve η = 1 en peu de calculs, arrondi sous la limite', async () => {
    // η = 0,4 + 0,1 · q (kN/m²) : limite 6 kN/m²
    let calls = 0;
    const eta = (q: number) => 0.4 + 0.1 * q * 1e3;
    const r = await searchLimit(async (q) => (calls++, eta(q)), 5e-3, eta(5e-3));
    expect(r.hi).not.toBeNull();
    expect(r.lo).toBeLessThanOrEqual(6e-3 + 1e-12);
    expect(r.lo).toBeGreaterThan(6e-3 - CAPACITY_STEP);
    expect(calls).toBeLessThanOrEqual(3);
  });

  it('η non linéaire (soulèvement) et calcul en échec au-delà : reste dans l’intervalle', async () => {
    const eta = (q: number) => (q > 9e-3 ? Infinity : 0.3 + 0.02 * (q * 1e3) ** 2);
    const r = await searchLimit(async (q) => eta(q), 3.5e-3, eta(3.5e-3), { maxEvals: 8 });
    const exact = Math.sqrt(0.7 / 0.02) * 1e-3; // ≈ 5,92 kN/m²
    expect(eta(r.lo)).toBeLessThanOrEqual(1);
    expect(r.lo).toBeGreaterThan(exact - 3 * CAPACITY_STEP);
  });

  it('déjà au-delà de η = 1 : cherche vers le bas', async () => {
    const eta = (q: number) => 0.5 + 0.2 * q * 1e3;
    const r = await searchLimit(async (q) => eta(q), 5e-3, eta(5e-3));
    expect(r.lo).toBeLessThanOrEqual(2.5e-3 + 1e-12);
    expect(r.lo).toBeGreaterThan(2.5e-3 - 2 * CAPACITY_STEP);
  });

  it('jamais atteinte jusqu’au plafond : hi = null', async () => {
    const r = await searchLimit(async () => 0.2, 5e-3, 0.2, { maxEvals: 10 });
    expect(r.hi).toBeNull();
    expect(kg(r.lo)).toBeCloseTo(1500, 0);
  });

  it('limite d’un critère interpolée entre deux calculs', () => {
    const c = criterionLimit(
      [
        { q: 5e-3, eta: { structure: 0.6 } },
        { q: 7.5e-3, eta: { structure: 0.85 } },
        { q: 10e-3, eta: { structure: 1.1 }, label: 'B107' },
      ],
      'structure',
    )!;
    expect(kg(c.q)).toBeGreaterThan(890);
    expect(kg(c.q)).toBeLessThanOrEqual(917.5);
    expect(c.approx).toBe(true);
    expect(c.governing).toBe('B107');
  });

  it('plancher : limite exacte (η = 1 à 10 kg/m² près)', () => {
    const inp = { modules: [vbx('A', 0, 0)], loads: { ...LOADS, liveGround: 5e-3 }, options: CALC_DEFAULTS };
    const c = plywoodLimit(inp, 'ground');
    expect(plywoodStrip(inp, 'ground', c.q).eta).toBeLessThanOrEqual(1);
    expect(plywoodStrip(inp, 'ground', c.q + CAPACITY_STEP).eta).toBeGreaterThan(1);
  });
});

describe('charge maximale d’une installation', () => {
  it('une Viewbox : rez-de-chaussée au-delà de 5,0 kN/m², vérifiée par un calcul à cette charge', async () => {
    const inp: StudyInputs = {
      modules: [vbx('A', 0, 0)],
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
    const runner = createInlineStudyRunner();
    const base = await runStudy(inp, runner);
    const cap = await liveCapacity(inp, base, runner, { maxEvals: 5 });
    expect(cap.levels.map((l) => l.target)).toEqual(['ground']);
    const l = cap.levels[0];
    expect(l.q0).toBeCloseTo(5e-3, 9);
    expect(l.qMax).toBeGreaterThan(5e-3);
    expect(l.criteria.map((c) => c.key)).toEqual(['floor', 'structure']);
    expect(l.runs).toBeGreaterThan(0);
    expect(l.runs).toBeLessThanOrEqual(5);
    // la charge annoncée passe : plancher et structure recalculés à cette charge
    const floor = l.criteria.find((c) => c.key === 'floor')!;
    expect(l.qMax).toBeLessThanOrEqual(floor.q);
    if (!l.above) {
      const check = await runStudy({ ...inp, loads: { ...inp.loads, liveGround: l.qMax }, classes: ['ULS'] }, runner);
      expect(structureEta(check).eta).toBeLessThanOrEqual(1);
    }
  }, 300000);
});
