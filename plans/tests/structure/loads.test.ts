// Cas de charge et combinaisons sur le modèle assemblé : résultantes exactes (surfaces, H = V / 10, vent), complément
// de poids, équilibre des réactions pour toutes les combinaisons (2ᵉ ordre, contacts), comparaison avec statico.
import { describe, expect, it } from 'vitest';
import type { PlacedModule } from '../../src/structure/core/assemble';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import { buildCombinations, COMBO_DEFAULTS } from '../../src/structure/core/combos';
import { analyzeLoadSet, prepare } from '../../src/structure/core/fem/analysis';
import type { Vec3 } from '../../src/structure/core/fem/types';
import type { LoadInputs } from '../../src/structure/core/loads';
import { buildLoadCases } from '../../src/structure/core/loads';
import { collectResults, comboResultant, prepareJobs, supportEnvelopes } from '../../src/structure/core/study';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';

const entry = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
const opt = { sections: sectionMap(SEED), jacks: false, middleFeet: false, upliftReleases: 'all' as const, calibration: false };
function vbx(id: string, du: number, dv: number, level = 0, theta = 0): PlacedModule {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const u: Vec3 = [c, 0, s];
  const v: Vec3 = [s, 0, -c];
  return { id, level, origin: [u[0] * du + v[0] * dv, level * 3080, u[2] * du + v[2] * dv], u, v, params: entry.params!, templateKey: entry.key };
}
const inputs: LoadInputs = {
  moduleWeight: 2564 * 9.81,
  ceiling: 0.35e-3,
  floorFinish: 0.4e-3,
  live: 3.5e-3,
  roofLive: 3.5e-3,
  horizontalRatio: 0.1,
  roofAccessible: false,
  evacuateTopLevel: false,
  windInService: 0.2e-3,
  windOutOfService: 0.37e-3,
  cp: { windward: 0.8, leeward: -0.5, parallel: -0.8, roofStability: -0.7 },
  edgeItems: [],
  pointItems: [],
};
const AREA = 5890 * 2490;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('cas de charge', () => {
  const single = assembleStructure([vbx('A', 0, 0)], opt);
  const L = buildLoadCases(single, inputs);
  const c = (id: string) => L.cases.find((x) => x.id === id)!;

  it('surfaces : plafond, sol, exploitation — résultantes exactes (répartition en enveloppe)', () => {
    expect(rel(-c('G2').resultant[1], 0.35e-3 * AREA)).toBeLessThan(1e-9);
    expect(rel(-c('G4').resultant[1], 0.4e-3 * AREA)).toBeLessThan(1e-9);
    const q = c('Q1.1').resultant;
    expect(rel(-q[1], 3.5e-3 * AREA)).toBeLessThan(1e-9);
    // H = V / 10 aux 4 angles du plancher : 1,28 kN par angle, comme SCIA (Hoka Q1.1, B94)
    expect(q[0]).toBeCloseTo(0.1 * 3.5e-3 * AREA, 6);
    expect(c('Q1.1').nodal[0].f[0]).toBeCloseTo(1283.3, 0);
    expect(c('Q1.4').resultant[2]).toBeCloseTo(0.1 * 3.5e-3 * AREA, 6); // y− = +Z monde
  });

  it('poids propre : barres à 78,5 kN/m³ ; complément Gc jusqu’au poids pesé', () => {
    const g1 = -c('G1').resultant[1];
    const expected = 78.5e-6 * (3740 * 33520 + 1350 * 43480 + 1880 * 4 * 2790 + 3950 * 4 * 155 * Math.SQRT2 + 1950 * 8 * 155 + 2350 * 2 * 155);
    expect(rel(g1, expected)).toBeLessThan(1e-6);
    expect(c('Gc').member).toHaveLength(0); // modèle (≈ 27,6 kN) plus lourd que la pesée (25,2 kN)
    const heavy = buildLoadCases(single, { ...inputs, moduleWeight: 40000 });
    const sum = ['G1', 'G2', 'G4', 'Gc'].reduce((s, id) => s - heavy.cases.find((x) => x.id === id)!.resultant[1], 0);
    expect(sum).toBeCloseTo(40000, 6);
  });

  it('vent : 1,3 · q · h · l sur une Viewbox isolée, parallèles équilibrés ; W0 = 0,7 qp sur la toiture', () => {
    const w = c('W1.1').resultant;
    expect(w[0]).toBeCloseTo(1.3 * 0.2e-3 * 2490 * 3080, 6);
    expect(Math.abs(w[2])).toBeLessThan(1e-6);
    const w3 = c('W2.3').resultant; // y+ = −Z monde
    expect(w3[2]).toBeCloseTo(-1.3 * 0.37e-3 * 5890 * 3080, 6);
    expect(c('W0').resultant[1]).toBeCloseTo(0.7 * 0.37e-3 * AREA, 6);
  });

  it('objets : mur sur un côté, logo au nœud le plus proche', () => {
    const withItems = buildLoadCases(single, {
      ...inputs,
      edgeItems: [{ module: 'A', side: 'v0', from: 0, to: 5890, level: 'floor', q: 0.5, loadCase: 'G3', label: 'mur' }],
      pointItems: [{ module: 'A', u: 2950, v: 1250, level: 'roof', F: 400, loadCase: 'G7', label: 'logo' }],
    });
    expect(-withItems.cases.find((x) => x.id === 'G3')!.resultant[1]).toBeCloseTo(0.5 * 5890, 6);
    expect(-withItems.cases.find((x) => x.id === 'G7')!.resultant[1]).toBeCloseTo(400, 9);
  });

  it('juxtaposées : les côtés en regard ne prennent pas de vent', () => {
    const two = assembleStructure([vbx('A', 0, 0), vbx('B', 0, 2500)], opt);
    const L2 = buildLoadCases(two, inputs);
    // vent y+ (monde −Z) : un grand côté au vent, un sous le vent, rien entre les deux
    expect(L2.cases.find((x) => x.id === 'W1.3')!.resultant[2]).toBeCloseTo(-1.3 * 0.2e-3 * 5890 * 3080, 6);
  });
});

describe('combinaisons', () => {
  it('liste statico : CO1, 24 ELU, 4 stabilité, 13 ELS', () => {
    const cs = buildCombinations();
    expect(cs.filter((c) => c.cls === 'ULS')).toHaveLength(25);
    expect(cs.filter((c) => c.cls === 'STAB')).toHaveLength(4);
    expect(cs.filter((c) => c.cls === 'SLS')).toHaveLength(13);
    expect(cs.find((c) => c.id === 'CO23')!.sway).toEqual([-1, 1]);
    expect(cs.find((c) => c.id === 'COB4')!.factors).toContainEqual(['G2', 0.5]);
    expect(buildCombinations({ ...COMBO_DEFAULTS, sls: false }).some((c) => c.cls === 'SLS')).toBe(false);
  });

  it('2 Viewbox au sol + 1 empilée : toutes les combinaisons convergent, réactions = charges', () => {
    const m = assembleStructure([vbx('A', 0, 0), vbx('B', 0, 2500), vbx('U', 0, 0, 1)], opt);
    const loads = buildLoadCases(m, inputs);
    const combos = buildCombinations();
    const jobs = prepareJobs(m, loads, combos, 1 / 200);
    expect(jobs.map((j) => j.sway).sort()).toEqual(['++', '+−', '−+']);
    const results = jobs.map((j) => {
      const prep = prepare(j.model);
      return j.sets.map((s) => analyzeLoadSet(prep, s, { secondOrder: true }));
    });
    const all = collectResults(jobs, results, combos);
    expect(all).toHaveLength(combos.length);
    for (const { combo, result } of all) {
      const R = result.reactions.reduce((s, r) => [s[0] + r.R[0], s[1] + r.R[1], s[2] + r.R[2]], [0, 0, 0]);
      const F = comboResultant(loads, combo);
      expect(R[1]).toBeCloseTo(-F[1], 0);
      expect(R[0]).toBeCloseTo(-F[0], 0);
      expect(R[2]).toBeCloseTo(-F[2], 0);
    }
    // CO1 : toutes les réactions en compression
    const co1 = all.find((r) => r.combo.id === 'CO1')!.result;
    expect(co1.reactions.every((r) => r.R[1] > 0 && !r.lifted)).toBe(true);
    const env = supportEnvelopes(m, all, ['ULS']);
    expect(env).toHaveLength(8);
    expect(env.every((e) => e.max > 0)).toBe(true);
  }, 60000);
});
