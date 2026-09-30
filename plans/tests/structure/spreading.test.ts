// Calage appui par appui : emprise efficace d'une plaque (trop mince = répartit moins), chaîne pied → plaques → sol,
// conseil (« il faut 1,53 m² »), choix par type / par appui / plaques de roulage dans le calage, poids propre retenu
// (pesée ou le plus lourd), portance en kg/m².
import { describe, expect, it } from 'vitest';
import { computeCalage, maxPublic } from '../../src/structure/core/calage';
import type { CalageInput } from '../../src/structure/core/calage';
import { ESTIMATE_DEFAULTS, VIEWBOX_STEEL_WEIGHT, estimateReactions, fullPublic, gridModules, limitPublic } from '../../src/structure/core/estimate';
import { sectionMap } from '../../src/structure/core/assemble';
import { SEED } from '../../src/structure/library/seed';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { BIRCH_MULTIPLEX, C24_BEAMS, VIEWBOX_STOCK, bearingFrom, plateKey, sizePlate, stockLayer } from '../../src/structure/core/ground';
import { adviseChain, bestStockLayers, checkChain, spreadLayer } from '../../src/structure/core/spreading';
import { LOADS, study, vbx } from './studyHelpers';

const plate = (side: number, t: number) => VIEWBOX_STOCK.find((s) => s.length === side && s.thickness === t)!;
const fmd = (0.9 * BIRCH_MULTIPLEX.fmk) / 1.3;

describe('emprise efficace d’une plaque', () => {
  it('plaque assez épaisse : toute la plaque répartit, moment = méthode statico', () => {
    const r = spreadLayer(stockLayer(plate(700, 36), 2), [210, 210], 80e3);
    const statico = sizePlate({ RzEd: 80e3, Rzk: 60e3, bearing: 0.2, a1: 210, a2: 210, side: 700, panel: BIRCH_MULTIPLEX });
    expect(r.MEdFull).toBeCloseTo(statico.MEd, 6);
    expect(r.MRd).toBeCloseTo((fmd * 2 * 36 * 36) / 6, 6);
    expect(r.full).toBe(true);
    expect(r.footprint).toEqual([700, 700]);
  });

  it('plaque trop mince : emprise réduite jusqu’à MEd = MRd, épaisseur nécessaire donnée', () => {
    const r = spreadLayer(stockLayer(plate(1000, 18), 1), [210, 210], 80e3);
    expect(r.full).toBe(false);
    const [a, b] = r.footprint;
    expect(a).toBeCloseTo(b, 6);
    expect(a).toBeGreaterThan(210);
    expect(a).toBeLessThan(1000);
    const e = Math.hypot((a - 210) / 2, (b - 210) / 2);
    expect(((80e3 / (a * b)) * e * e) / 2).toBeCloseTo(r.MRd, 3);
    // la plaque serait pleinement efficace avec l'épaisseur tFull
    const thick = spreadLayer({ ...stockLayer(plate(1000, 18), 1), t: Math.ceil(r.tFull) }, [210, 210], 80e3);
    expect(thick.full).toBe(true);
  });

  it('pyramide : la petite plaque élargit l’appui de la grande (moins de porte-à-faux)', () => {
    const alone = spreadLayer(stockLayer(plate(1000, 36), 1), [210, 210], 100e3);
    const small = spreadLayer(stockLayer(plate(400, 36), 1), [210, 210], 100e3);
    const pyr = spreadLayer(stockLayer(plate(1000, 36), 1), small.footprint, 100e3);
    expect(pyr.footprint[0]).toBeGreaterThan(alone.footprint[0]);
  });
});

describe('chaîne de répartition et conseil', () => {
  const base = { Rzk: 61e3, REd: 82e3, contact: [420, 210] as [number, number], contactLabel: '2 angles 42 × 21 cm', bearing: bearingFrom(40, 'kN/m²') };

  it('portance en kg/m² : 400 kg/m² ≈ 3,9 kN/m² (et non 400 kN/m²)', () => {
    expect(bearingFrom(400, 'kg/m²')).toBeCloseTo(3.924e-3, 9);
    expect(bearingFrom(40800, 'kg/m²')).toBeCloseTo(bearingFrom(400, 'kN/m²'), 3);
  });

  it('70 × 70 sous 61 kN, sol à 40 kN/m² : 1,53 m² nécessaires, aucune plaque du stock → plaques de roulage', () => {
    const chain = checkChain({ ...base, layers: [stockLayer(plate(700, 36), 2)] });
    expect(chain.steps.map((s) => s.label)).toEqual(['2 angles 42 × 21 cm', '+ 2 × Multiplex bouleau 70 × 70 × 36 mm']);
    expect(chain.steps[0].pressure).toBeCloseTo(61e3 / (420 * 210), 9);
    expect(chain.pressure).toBeCloseTo(61e3 / 490e3, 9);
    expect(chain.etaGround).toBeCloseTo(61e3 / 490e3 / 0.04, 6);
    expect(chain.areaRequired).toBeCloseTo(1.525e6, 0);
    const txt = adviseChain('P4', chain, [stockLayer(plate(700, 36), 2)], {
      base,
      stock: VIEWBOX_STOCK,
      roadway: { mean: 8.8e-3, area: 29.5e6, load: 260e3 },
      roadwayOn: false,
      custom: true,
    });
    expect(txt).toContain('P4 : 61,0 kN sur 0,49 m² (70 × 70 cm)');
    expect(txt).toContain('le sol accepte 40 kN/m² (4 077 kg/m²)');
    expect(txt).toContain('il faut au moins 1,53 m² au sol (≈ 123 × 123 cm)');
    expect(txt).toContain('Aucune plaque du stock ne suffit ; plaques de roulage sur toute la surface : 8,8 kN/m² (897 kg/m²), OK');
  });

  it('sol à 200 kN/m² : le conseil donne la plus petite solution du stock qui passe', () => {
    const b = { ...base, bearing: 0.2 };
    const best = bestStockLayers(b, VIEWBOX_STOCK)!;
    expect(best.chain.eta).toBeLessThanOrEqual(1);
    const bottom = best.layers[best.layers.length - 1];
    expect(bottom.l).toBe(700);
    // une seule 40 × 40 ne suffit pas : 61 kN / 0,16 m² = 381 kN/m²
    const small = checkChain({ ...b, layers: [stockLayer(plate(400, 36), 1)] });
    expect(small.eta).toBeGreaterThan(1);
    const txt = adviseChain('P4', small, small.layers.map((l) => l.layer), { base: b, stock: VIEWBOX_STOCK, roadway: null, roadwayOn: false, custom: true });
    expect(txt).toContain('→ Prendre ');
    expect(txt).toContain('70 × 70');
  });

  it('plaque trop mince signalée dans les étapes et le conseil', () => {
    const chain = checkChain({ ...base, bearing: 0.2, layers: [stockLayer(plate(1000, 18), 1)] });
    expect(chain.layers[0].full).toBe(false);
    expect(chain.steps[1].note).toMatch(/trop mince pour répartir sur toute la plaque : emprise efficace \d+ × \d+ cm/);
    expect(chain.pressure).toBeGreaterThan(61e3 / 1e6);
  });

  it('plaques de roulage : dernière étape = charge totale / surface couverte', () => {
    const chain = checkChain({ ...base, layers: [], roadway: { mean: 8.8e-3, area: 29.5e6 } });
    expect(chain.steps).toHaveLength(2);
    expect(chain.steps[1].dims).toBeNull();
    expect(chain.pressure).toBe(8.8e-3);
    expect(chain.eta).toBeCloseTo(8.8 / 40, 9);
  });
});

describe('choix du calage dans le calcul', () => {
  const modules = gridModules(1, 1, [[1]], false);
  const inp: CalageInput = {
    modules,
    estimate: { ...ESTIMATE_DEFAULTS, loads: { moduleWeight: 2564 * 9.81, ceiling: 0.35e-3, floorFinish: 0.4e-3, live: 3.5e-3, roofLive: 3.5e-3, extraPerModule: 0 } },
    bearing: 0.2,
    staticoConversion: false,
    thicknesses: [18, 21, 24, 27, 30, 40],
    stock: VIEWBOX_STOCK,
    commercial: [],
    longrine: { k: 0.03, beams: C24_BEAMS, overhang: 55, maxCount: 6 },
    diffusion: false,
  };
  const k70 = plateKey(plate(700, 36));
  const k100 = plateKey(plate(1000, 36));

  it('automatique : chaque appui vérifié avec la solution retenue de son type', () => {
    const r = computeCalage(inp);
    expect(r.checks).toHaveLength(4);
    expect(r.types).toHaveLength(1);
    expect(r.types[0].custom).toBe(false);
    for (const c of r.checks) {
      expect(c.source).toBe('auto');
      expect(c.layerList).toEqual(r.types[0].chosen!.layers);
      expect(c.eta).toBeLessThanOrEqual(1);
    }
  });

  it('choix par type, puis un appui à part : le type est scindé, le matériel suit', () => {
    const r = computeCalage({ ...inp, choices: { byType: { '1': [{ plate: k70, n: 2 }] } } });
    expect(r.types).toHaveLength(1);
    expect(r.types[0].chosen!.kind).toBe('custom');
    expect(r.types[0].chosen!.summary).toBe('2 × 70 × 70 × 36 mm par angle');
    expect(r.materials).toEqual([expect.objectContaining({ label: 'Multiplex bouleau', dims: '700 × 700 × 36 mm', quantity: 8 })]);
    const s = computeCalage({ ...inp, choices: { byType: { '1': [{ plate: k70, n: 2 }] }, bySupport: { P1: [{ plate: k100, n: 1 }] } } });
    expect(s.types.map((t) => t.label)).toEqual(['angle seul', 'angle seul — P1']);
    expect(s.types[1].checks.map((c) => c.id)).toEqual(['P1']);
    expect(s.checks.find((c) => c.id === 'P1')!.source).toBe('support');
    expect(s.materials.map((m) => [m.dims, m.quantity])).toEqual([
      ['700 × 700 × 36 mm', 6],
      ['1000 × 1000 × 36 mm', 1],
    ]);
  });

  it('aucune plaque : le pied directement au sol ne passe pas, le conseil propose une plaque', () => {
    const r = computeCalage({ ...inp, choices: { byType: { '1': [] } } });
    expect(r.types[0].chosen!.summary).toBe('pied posé directement au sol');
    expect(r.types[0].standard).toBe(false);
    expect(r.types[0].advice).toContain('→ Prendre ');
  });

  it('plaques de roulage sur toute la surface : pression uniforme partout, surface au matériel', () => {
    const r = computeCalage({ ...inp, bearing: bearingFrom(4, 'kN/m²'), choices: { roadway: true } });
    expect(r.roadwayOn).toBe(true);
    for (const c of r.checks) expect(c.pressure).toBeCloseTo(r.roadway.mean, 12);
    expect(r.types[0].chosen!.kind).toBe('roadway');
    expect(r.materials.at(-1)!.label).toBe('Plaques de roulage jointives');
    // un Viewbox à 4 kN/m² : ≈ 70 kN / 14,7 m² = 4,8 kN/m² → dépasse même sur plaques de roulage
    expect(r.checks[0].eta).toBeGreaterThan(1);
    expect(r.types[0].advice).toContain('même avec des plaques de roulage partout');
  });
});

describe('poids propre retenu', () => {
  it('le poids des barres du gabarit 5900 est celui du calcul complet', () => {
    const s = study([vbx('A', 0, 0)], { ...LOADS, ceiling: 0, floorFinish: 0, moduleWeight: 0 });
    const G1 = -s.loads.cases.find((c) => c.id === 'G1')!.resultant[1];
    expect(VIEWBOX_STEEL_WEIGHT).toBeCloseTo(G1, -2);
  });

  it('calcul complet : « pesée » = exactement le poids pesé, « le plus lourd » = max(modèle, pesée)', () => {
    const G = (mode: 'max' | 'weighed') => {
      const s = study([vbx('A', 0, 0)], { ...LOADS, weightMode: mode });
      return -s.loads.cases.filter((c) => ['G1', 'G2', 'G4', 'Gc'].includes(c.id)).reduce((a, c) => a + c.resultant[1], 0);
    };
    const W = 2564 * 9.81;
    expect(G('weighed')).toBeCloseTo(W, 3);
    expect(G('max')).toBeGreaterThan(W);
    expect(G('max')).toBeCloseTo(VIEWBOX_STEEL_WEIGHT + (0.35e-3 + 0.4e-3) * 5890 * 2490, -2);
  });

  it('estimation : même règle que le calcul complet', () => {
    const loads = { moduleWeight: 2564 * 9.81, ceiling: 0.35e-3, floorFinish: 0.4e-3, live: 0, roofLive: 0, extraPerModule: 0 };
    const m = gridModules(1, 1, [[1]], false);
    const A = m[0].area;
    expect(estimateReactions(m, { ...ESTIMATE_DEFAULTS, loads: { ...loads, weightMode: 'weighed' } }).totalG).toBeCloseTo(2564 * 9.81, 6);
    expect(estimateReactions(m, { ...ESTIMATE_DEFAULTS, loads }).totalG).toBeCloseTo(VIEWBOX_STEEL_WEIGHT + 0.75e-3 * A, 6);
  });
});

describe('public limité à un nombre de personnes', () => {
  const W80 = 80 * 9.81;
  const loads = { moduleWeight: 2564 * 9.81, ceiling: 0.35e-3, floorFinish: 0.4e-3, live: 3.5e-3, roofLive: 3.5e-3, extraPerModule: 0 };
  const calm = { ...ESTIMATE_DEFAULTS, loads, windInService: 0, windOutOfService: 0, horizontalRatio: 0, sway: 0 };

  it('estimation : chaque angle reçoit au plus tout le public serré au-dessus de lui, le total reprend le public limité', () => {
    const m = gridModules(1, 1, [[1]], false);
    const est = estimateReactions(m, calm);
    const G = est.totalG;
    const Qc = (3.5e-3 * m[0].area) / 4;
    const ten = limitPublic(est, 10 * W80);
    for (const r of ten.reactions) {
      expect(r.Rk).toBeCloseTo(G / 4 + 10 * W80, 6);
      expect(r.RkMin).toBeCloseTo(G / 4, 6);
    }
    expect(ten.verticalK).toBeCloseTo(G + 10 * W80, 6);
    // 50 personnes : plus que ce qui tient au-dessus d'un angle à 3,5 kN/m² → public plein à chaque angle
    for (const r of limitPublic(est, 50 * W80).reactions) expect(r.Rk).toBeCloseTo(G / 4 + Qc, 6);
    expect(fullPublic(est)).toBeCloseTo(4 * Qc, 6);
  });

  it('calcul complet : public limité ≥ le même public réparti partout, et ≈ sans public pour 0 personne', async () => {
    const base = { edgeItems: [], pointItems: [], library: SEED, sections: sectionMap(SEED), middleFeet: false, sls: true, options: CALC_DEFAULTS, blocking: [] };
    const modules = [vbx('A', 0, 0), vbx('B', 0, 2.5)];
    const full = await runStudy({ ...base, modules, loads: LOADS }, createInlineStudyRunner());
    const load = 10 * W80;
    const A = 2 * 5890 * 2490;
    const spread = await runStudy({ ...base, modules, loads: { ...LOADS, live: load / A } }, createInlineStudyRunner());
    const empty = await runStudy({ ...base, modules, loads: { ...LOADS, live: 0 } }, createInlineStudyRunner());
    const lim = limitPublic(full.ground, load);
    const zero = limitPublic(full.ground, 0);
    full.ground.reactions.forEach((r, k) => {
      expect(lim.reactions[k].Rk).toBeGreaterThanOrEqual(spread.ground.reactions[k].Rk - 1);
      expect(lim.reactions[k].Rk).toBeLessThanOrEqual(r.Rk + 1e-6);
      expect(lim.reactions[k].REd).toBeGreaterThanOrEqual(spread.ground.reactions[k].REd - 1);
      // part du public tirée de CO1 / COd1 (calcul non linéaire, défauts d'aplomb différents) : à 1 % près
      expect(Math.abs(zero.reactions[k].Rk - empty.ground.reactions[k].Rk)).toBeLessThan(0.01 * empty.ground.reactions[k].Rk);
    });
    expect(Math.abs(lim.verticalK! - spread.ground.verticalK!)).toBeLessThan(0.01 * spread.ground.verticalK!);
  }, 120000);

  it('public maximal : dichotomie sur le nombre de personnes avec le calage choisi', () => {
    const inp: CalageInput = {
      modules: gridModules(1, 1, [[1]], false),
      estimate: { ...calm, windInService: 0.2e-3, windOutOfService: 0.37e-3, horizontalRatio: 0.1, sway: 1 / 200 },
      bearing: bearingFrom(40, 'kN/m²'),
      staticoConversion: false,
      thicknesses: [18, 21, 24, 27, 30, 40],
      stock: VIEWBOX_STOCK,
      commercial: [],
      longrine: { k: 0.03, beams: C24_BEAMS, overhang: 55, maxCount: 6 },
      diffusion: false,
      choices: { byType: { '1': [{ plate: plateKey(plate(700, 36)), n: 1 }] } },
    };
    expect(computeCalage(inp).checks.some((c) => c.eta > 1)).toBe(true);
    const mp = maxPublic(inp, 80)!;
    expect(mp.full).toBe(false);
    expect(mp.empty).toBe(false);
    expect(mp.persons).toBeGreaterThan(0);
    expect(mp.persons).toBeLessThan(mp.fullPersons);
    const at = (persons: number) => computeCalage({ ...inp, publicLimit: { persons, kg: 80 } });
    expect(at(mp.persons).checks.every((c) => c.eta <= 1)).toBe(true);
    expect(at(mp.persons + 1).checks.some((c) => c.eta > 1)).toBe(true);
    expect(at(mp.persons).publicLimit!.load).toBeCloseTo(mp.persons * W80, 9);
  });
});
