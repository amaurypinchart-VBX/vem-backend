// Reprise du calcul de type statico 18-0573 (Prüfbuch TÜV 190060 B) : exploitation du rez-de-chaussée, vent de côte,
// appuis et matériaux du modèle SCIA, lest au rez-de-chaussée seulement, éléments de façade (§ 3.6 – 3.7), éléments
// terrasse (§ 3.5, § 3.9.3) — vecteurs de la note statico.
import { describe, expect, it } from 'vitest';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import { checkFacade } from '../../src/structure/core/checks/facade';
import type { FacadeItem } from '../../src/structure/core/checks/facade';
import { addSupports, estimateReactions, ESTIMATE_DEFAULTS, gridModules } from '../../src/structure/core/estimate';
import { buildLoadCases } from '../../src/structure/core/loads';
import { applyMods } from '../../src/structure/core/mods';
import { checkTerraces, placeTerrace, TERRACE, terraceSupports } from '../../src/structure/core/terrace';
import { peakPressure, DEFAULT_SITE } from '../../src/structure/core/wind';
import { DEFAULTS } from '../../src/structure/library/defaults';
import { SEED, seedSection } from '../../src/structure/library/seed';
import { installationLength } from '../../src/structure/studyRun';
import { LOADS, vbx } from './studyHelpers';

const AREA = 5890 * 2490;
const down = (c: { resultant: number[] }) => -c.resultant[1];

describe('statico 18-0573 : hypothèses', () => {
  it('exploitation 5,0 kN/m² au rez-de-chaussée, 3,5 kN/m² aux étages ; frottement 0,6', () => {
    expect(DEFAULTS.liveLoadGround.value).toBeCloseTo(5e-3, 9);
    expect(DEFAULTS.liveLoad.value).toBeCloseTo(3.5e-3, 9);
    expect(DEFAULTS.groundFriction.value).toBe(0.6);
    const s = assembleStructure([vbx('A', 0, 0), vbx('B', 0, 0, 1)], { sections: sectionMap(SEED), jacks: false, middleFeet: false, upliftReleases: 'all', calibration: false });
    const L = buildLoadCases(s, { ...LOADS, liveGround: 5e-3 });
    const q1 = L.cases.find((c) => c.id === 'Q1.1')!;
    expect(down(q1) / 1e3).toBeCloseTo(((5e-3 + 3.5e-3) * AREA) / 1e3, 1);
  });

  it('vent hors service, zone 4 côte, h = 6 m : 0,7 · 2,3 · 0,56 · 0,6^0,27 = 0,79 kN/m² (§ 2.4)', () => {
    expect(peakPressure({ ...DEFAULT_SITE, zone: 4, terrain: 'coast' }, 6000) * 1e3).toBeCloseTo(0.785, 3);
    // intérieur des terres inchangé ; îles de la mer du Nord 0,7 · 1,5 · (6 / 10)^0,19
    expect(peakPressure({ ...DEFAULT_SITE, zone: 1 }, 9500) * 1e3).toBeCloseTo(0.7 * 1.7 * 0.32 * 0.95 ** 0.37, 4);
    expect(peakPressure({ ...DEFAULT_SITE, zone: 4, terrain: 'island' }, 6000) * 1e3).toBeCloseTo(0.7 * 1.5 * 0.6 ** 0.19, 4);
  });

  it('appuis du modèle SCIA 18-0573 (100 / 1 000 kN/cm) ; calage statico : appuis Hoka (50 kN/cm, rigides)', () => {
    const opt = { sections: sectionMap(SEED), jacks: false, middleFeet: false, upliftReleases: 'all' as const };
    const s = assembleStructure([vbx('A', 0, 0)], { ...opt, calibration: false });
    expect(s.fem.supports[0].dofs.slice(0, 3)).toEqual([10000, 100000, 10000]);
    const c = assembleStructure([vbx('A', 0, 0)], { ...opt, calibration: true });
    expect(c.fem.supports[0].dofs.slice(0, 3)).toEqual([5000, 'fixed', 5000]);
  });

  it('RHP 120 × 60 × 4 et QHP 100 × 5 : S275, courbes a (annexe SCIA 18-0573 B7 – B8)', () => {
    for (const k of ['RHP120x60x4', 'QHP100x5']) {
      const e = seedSection(k);
      expect(e.material).toBe('S275');
      expect([e.section.curveY, e.section.curveZ]).toEqual(['a', 'a']);
    }
  });

  it('lest seulement dans les Viewbox du rez-de-chaussée (§ 5.3)', () => {
    const r = applyMods({ modules: [vbx('A', 0, 0), vbx('B', 0, 0, 1)], edgeItems: [], sections: sectionMap(SEED) }, { ballast: [{ module: 'A', kg: 500 }, { module: 'B', kg: 500 }] });
    expect(r.edgeItems.filter((i) => i.loadCase === 'GB').every((i) => i.module === 'A')).toBe(true);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/B \(étage\) : non admis/);
  });

  it('longueur de l’installation : 6 Viewbox bout à bout = 35,4 m (> 30 m)', () => {
    const mods = Array.from({ length: 6 }, (_, k) => vbx(`V${k}`, k * 5.9, 0));
    expect(installationLength(mods) / 1e3).toBeCloseTo(35.4, 1);
    // trois ensembles séparés de 11,8 m (Xiaomi Paris 2026) : 11,8 m, pas la distance entre les deux bouts
    const apart = [0, 20, 40].flatMap((x) => [vbx(`A${x}`, x, 0), vbx(`B${x}`, x + 5.9, 0), vbx(`C${x}`, x, 2.5, 1)]);
    expect(installationLength(apart) / 1e3).toBeCloseTo(11.8, 1);
  });
});

describe('statico 18-0573 § 3.6 – 3.7 : éléments de façade', () => {
  const items = (list: Array<Partial<FacadeItem>>): FacadeItem[] => list.map((x) => ({ label: 'x', nature: 'wall', level: 0, length: 2500, ...x }));
  const base = { qIn: 0.2e-3, qOut: 0.79e-3, liveGround: 5e-3, live: 3.5e-3 };
  const eta = (r: ReturnType<typeof checkFacade>, key: string) => r.records.find((x) => x.key === key)!.eta!;

  it('vecteurs statico sous wk = 1,5 · 0,79 kN/m² : rails 0,22, M8 0,24, âme 0,86, 88.2 0,27, Isocab 0,92', () => {
    const r = checkFacade({ ...base, items: items([{ nature: 'glazing', level: 1, label: 'Vitrage 88.2' }, { nature: 'glazing', level: 0, label: 'Vitrage 44.1' }, { nature: 'wall', label: 'Isocab 60' }]) });
    expect(eta(r, 'facade.rail')).toBeCloseTo(0.44 / 1.97, 2);
    expect(eta(r, 'facade.railBolt')).toBeCloseTo(0.24, 2);
    expect(eta(r, 'facade.glazingFrame')).toBeCloseTo(0.86, 2);
    expect(eta(r, 'facade.vsg88')).toBeCloseTo(0.27, 2);
    expect(eta(r, 'facade.vsg44')).toBeCloseTo(0.79, 2);
    expect(eta(r, 'facade.sandwich')).toBeCloseTo(0.92, 2);
    expect(r.failures).toHaveLength(0);
    // flèche 35 mm > 25 mm du 44.1 : à évaluer par l'exploitant (statico)
    expect(r.notes.some((n) => /flèche 35 mm/.test(n))).toBe(true);
  });

  it('verre 44.1 à l’étage : non admis ; garde-corps sur 500 kg/m² : non couvert', () => {
    const r = checkFacade({ ...base, items: items([{ nature: 'glazing', level: 1, label: 'Stratobel 44.1' }, { nature: 'railing', level: 0, label: 'Garde-corps' }]) });
    expect(r.failures[0]).toMatch(/44\.1 avec risque de chute/);
    expect(r.missing[0]).toMatch(/plus de 350 kg\/m²/);
  });

  it('pression du site plus faible : efforts proportionnels à wk', () => {
    const r = checkFacade({ ...base, qOut: 0.37e-3, items: items([{ nature: 'wall', label: 'Isocab' }]) });
    expect(eta(r, 'facade.sandwich')).toBeCloseTo((1.5 * 0.37) / 1.29, 3);
  });
});

describe('statico 18-0573 § 3.5 : éléments terrasse', () => {
  const ground = { id: 'TER-1', label: 'Terrasse', kind: 'ground' as const, corners: [[0, 0], [5900, 0], [5900, 2500], [0, 2500]] as Array<[number, number]>, length: 5900, width: 2500 };

  it('au sol : rive U 200 en deux travées MEd = 11,01 kNm, solives C30 η 0,86 (§ 3.5.1, § 3.5.3)', () => {
    const r = checkTerraces([ground], 3.5e-3, 5e-3);
    const rim = r.records.find((x) => x.key === 'terrace.rim.ground')!;
    expect(rim.withValues).toMatch(/MEd = 11,01 kNm/);
    expect(r.records.find((x) => x.key === 'terrace.joist.ground')!.eta).toBeCloseTo(0.86, 2);
    expect(r.eta).toBeLessThan(1);
  });

  it('pieds au sol : angles 0,375, milieux 1,25 · w · L/2, somme = charge totale', () => {
    const sup = terraceSupports([ground], 5e-3);
    expect(sup).toHaveLength(6);
    const total = sup.reduce((a, s) => a + s.G + s.Q, 0);
    expect(total).toBeCloseTo((TERRACE.selfWeight + TERRACE.deck + 5e-3) * 5900 * 2500, 0);
    const mid = sup.filter((s) => s.middle);
    expect((mid[0].G + mid[0].Q) / 1e3).toBeCloseTo(1.25 * 6 * 1.25 * 2.95, 1);
  });

  it('pieds au sol ajoutés au calage : groupes « T » / « TM » ou plaque commune avec un angle de Viewbox voisin', () => {
    const est = estimateReactions(gridModules(1, 1, [[1]], false), { ...ESTIMATE_DEFAULTS, loads: { moduleWeight: 25000, ceiling: 0, floorFinish: 0, live: 3.5e-3, roofLive: 0, extraPerModule: 0 } });
    // terrasse contre le grand côté y = 2 500 de la Viewbox : ses 2 angles et son pied central touchent la Viewbox
    const t = { ...ground, corners: ground.corners.map(([x, y]) => [x, y + 2510]) as Array<[number, number]> };
    const sup = terraceSupports([t], 5e-3);
    const out = addSupports(est, sup, 100);
    expect(out.totalG + out.totalQ).toBeCloseTo(est.totalG + est.totalQ + sup.reduce((a, s) => a + s.G + s.Q, 0), 0);
    expect(out.reactions.filter((r) => r.group.terrace).length).toBe(4);
  });

  it('placement : sur la toiture d’une Viewbox, au sol, ou refusé', () => {
    const mods = [vbx('A', 0, 0)];
    const top = 3080;
    const onRoof = placeTerrace([0, top, -2500, 5900, top + 200, 0], 'TER-1', 'T', mods);
    expect(onRoof.terrace?.kind).toBe('roof');
    expect(onRoof.terrace?.module).toBe('A');
    expect(placeTerrace([0, 0, 100, 5900, 200, 2600], 'TER-2', 'T', mods).terrace?.kind).toBe('ground');
    expect(placeTerrace([0, 0, 0, 3000, 200, 2500], 'TER-3', 'T', mods).reason).toMatch(/5,90 × 2,50 m attendu/);
  });

  it('sur toiture : poids et public sur la toiture de la Viewbox du dessous', () => {
    const s = assembleStructure([vbx('A', 0, 0)], { sections: sectionMap(SEED), jacks: false, middleFeet: false, upliftReleases: 'all', calibration: false });
    const base = buildLoadCases(s, LOADS);
    const L = buildLoadCases(s, { ...LOADS, roofTerraces: ['A'], terraceG: 1e-3 });
    const g2 = (m: typeof L) => down(m.cases.find((c) => c.id === 'G2')!);
    expect((g2(L) - g2(base)) / 1e3).toBeCloseTo((1e-3 * AREA) / 1e3, 1);
    const q = (m: typeof L) => down(m.cases.find((c) => c.id === 'Q1.1')!);
    expect((q(L) - q(base)) / 1e3).toBeCloseTo((3.5e-3 * AREA) / 1e3, 1);
    // hors service : terrasse évacuée
    expect(down(L.cases.find((c) => c.id === 'Q2.1')!)).toBeCloseTo(down(base.cases.find((c) => c.id === 'Q2.1')!), 0);
  });
});
