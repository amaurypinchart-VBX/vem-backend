// Phase S10a : catalogue des sections du commerce (recalculé et recoupé avec les fiches), Viewbox modifiées par
// l'étude (hauteur des poteaux, sections du catalogue, nuances), poids, indicateurs instantanés ; une étude sans
// modification reste strictement identique.
import { describe, expect, it } from 'vitest';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import { catalogEntry, catalogSections, familySections, strongerSections } from '../../src/structure/core/sectionCatalog';
import { polygonProps, upnContour, upnWarping } from '../../src/structure/core/sectionGeometry';
import { applyMods, describeMods } from '../../src/structure/core/mods';
import { installationIndicators } from '../../src/structure/core/moduleIndicators';
import { templateSteelWeight } from '../../src/structure/core/templateView';
import { withMods } from '../../src/structure/advisor/variant';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, inputKey, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED, seedSection } from '../../src/structure/library/seed';
import { LOADS, vbx } from './studyHelpers';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('catalogue des sections du commerce (Base métaux Belgique)', () => {
  it('UPN 220 recalculé (DIN 1026-1, ailes à 8 %) = annexe SCIA statico 24-0571 à 0,5 % près', () => {
    const p = polygonProps(upnContour(220, 80, 9, 12.5));
    const ref = seedSection('UNP220').section;
    for (const k of ['A', 'Iy', 'Iz', 'Wely', 'Welz', 'Wply', 'Wplz'] as const) expect(rel(p[k]!, ref[k]!), k).toBeLessThan(0.006);
    expect(rel(upnWarping(220, 80, 9, 12.5), ref.Iw!)).toBeLessThan(0.001);
    const c = catalogEntry('CAT-UPN220')!;
    expect(c.family).toBe('UPN');
    expect(rel(c.section.A, ref.A)).toBeLessThan(0.006);
    // It sans les congés : prudent (plus petit que la valeur SCIA)
    expect(c.section.It).toBeLessThan(ref.It);
  });

  it('poutrelles IPE / HE : A, Iy, Wel,y recalculés à moins de 2 % des valeurs publiées', () => {
    const beams = catalogSections().filter((s) => ['IPE', 'HEA', 'HEB', 'HEM'].includes(s.family));
    expect(beams.length).toBeGreaterThan(80);
    for (const s of beams)
      for (const c of s.checks.filter((x) => x.prop !== 'kgPerM')) expect(Math.abs(c.deviation), `${s.name} ${c.prop}`).toBeLessThan(0.02);
  });

  it('familles ordonnées par masse ; sections plus fortes au-dessus de l’UNP 220 et du QHP 100 × 5', () => {
    const upn = familySections('UPN').map((s) => s.name);
    expect(upn[0]).toBe('UPN 80');
    expect(upn[upn.length - 1]).toBe('UPN 300');
    const up = strongerSections(seedSection('UNP220')).map((s) => s.name);
    expect(up[0]).toBe('UPN 240');
    const col = strongerSections(seedSection('QHP100x5'));
    expect(col.length).toBeGreaterThan(3);
    expect(col.every((s) => s.section.Iz >= seedSection('QHP100x5').section.Iz * 0.999)).toBe(true);
  });

  it('chaque section du catalogue porte sa source, son statut « proposé » et des propriétés positives', () => {
    for (const s of catalogSections()) {
      expect(s.status).toBe('suggested');
      expect(s.source[0].ref).toBe('catalogue:Socacier');
      for (const k of ['A', 'Iy', 'Iz', 'It', 'Wely', 'Welz'] as const) expect(s.section[k], `${s.name} ${k}`).toBeGreaterThan(0);
      expect(s.section.curveY).toBeTruthy();
    }
  });
});

const base: StudyInputs = {
  modules: [vbx('A', 0, 0), vbx('B', 0, 0, 1)],
  edgeItems: [],
  pointItems: [],
  library: SEED,
  sections: sectionMap(SEED),
  loads: { ...LOADS, weightMode: 'weighed' },
  middleFeet: false,
  sls: true,
  options: { ...CALC_DEFAULTS },
  blocking: [],
};

describe('Viewbox modifiées par l’étude', () => {
  it('sans modification : entrées identiques (même empreinte)', () => {
    const r = withMods(base, {});
    expect(inputKey(r.inputs)).toBe(inputKey(base));
    const g = withMods(base, { geometry: [] });
    expect(inputKey(g.inputs)).toBe(inputKey(base));
  });

  it('poteaux à 5 m sous la Viewbox du dessus : toiture et haut suivent, la Viewbox du dessus monte, poids augmenté', () => {
    const r = applyMods({ modules: base.modules, edgeItems: [], sections: base.sections }, { geometry: [{ topZ: 5000, modules: ['A'] }] });
    expect(r.errors).toEqual([]);
    const A = r.modules.find((m) => m.id === 'A')!;
    const B = r.modules.find((m) => m.id === 'B')!;
    expect(A.params.topZ).toBe(5000);
    expect(A.params.roofZ).toBe(5000 - 290);
    expect(B.params.topZ).toBe(3080);
    expect(B.origin[1]).toBe(5000);
    // 4 poteaux QHP 100 × 5 de 1,92 m en plus : 4 · 1 920 · 1 880 mm² · 7 850 kg/m³ · 10 ≈ 1,13 kN
    expect(A.weightDelta! / 1e3).toBeCloseTo((4 * 1920 * seedSection('QHP100x5').section.A * 7850 * 1e-8) / 1e3, 2);
    expect(B.weightDelta).toBeUndefined();
    const opt = { jacks: false, middleFeet: false, upliftReleases: 'all' as const, calibration: false };
    const s = assembleStructure(r.modules, { ...opt, sections: r.sections });
    const s0 = assembleStructure(base.modules, { ...opt, sections: base.sections });
    expect(s.errors).toEqual([]);
    // liaisons d'angle entre A et B toujours créées (empilement reconnu à la nouvelle hauteur)
    expect(s.meta.filter((m) => m.family === 'corner-link')).toHaveLength(4);
    expect(s.topY - s.baseY - (s0.topY - s0.baseY)).toBe(5000 - 3080);
  });

  it('rives en UPN 160 du catalogue et poteaux en S355 : sections résolues, poids en baisse, lignes lisibles', () => {
    const mods = { sections: [{ slot: 'rim-floor' as const, section: 'CAT-UPN160' }], grades: [{ slot: 'column' as const, material: 'S355' }] };
    const r = applyMods({ modules: base.modules, edgeItems: [], sections: base.sections }, mods);
    expect(r.warnings).toEqual([]);
    const A = r.modules[0];
    expect(A.params.sections.rim).toBe('CAT-UPN160');
    // la toiture garde l'UNP 220 (figée avant le changement du plancher)
    expect(A.params.sections.rimRoof).toBe('UNP220');
    expect(A.params.sections.column).toBe('QHP100x5@S355');
    expect(r.sections.get('QHP100x5@S355')!.material).toBe('S355');
    expect(r.sections.get('QHP100x5@S355')!.section).toEqual(seedSection('QHP100x5').section);
    expect(A.weightDelta!).toBeLessThan(0);
    const lines = describeMods(mods, (k) => r.sections.get(k)?.section.name ?? k);
    expect(lines).toEqual(['rives du plancher en UPN 160 (toutes les Viewbox)', 'poteaux en acier S355 (toutes les Viewbox)']);
  });

  it('poids des barres du gabarit standard ≈ 16,6 kN (VIEWBOX_STEEL_WEIGHT)', () => {
    expect(templateSteelWeight(base.modules[0].params, base.sections) / 1e3).toBeCloseTo(16.6, 0);
  });

  it('indicateurs instantanés : poteaux de 5 m → alerte de maintien, élancement plus fort, hauteur totale', () => {
    const r = applyMods({ modules: base.modules, edgeItems: [], sections: base.sections }, { geometry: [{ topZ: 5000, modules: ['A'] }] });
    const std = installationIndicators(base.modules, base.sections, 2564 * 9.81);
    const ind = installationIndicators(r.modules, r.sections, 2564 * 9.81);
    expect(std.modules[0].alerts).toEqual([]);
    expect(ind.modules[0].alerts.join(' ')).toMatch(/maintien intermédiaire/);
    expect(ind.modules[0].lambdaSway).toBeGreaterThan(std.modules[0].lambdaSway);
    expect(ind.height).toBe(8080);
    expect(ind.weightDelta).toBeGreaterThan(1000);
  });

  it('calcul complet avec poteaux de 5 m : modèle cohérent, poids pris en compte, taux des poteaux en hausse', async () => {
    // deux Viewbox côte à côte (5 m de large) : une seule Viewbox de 5 m de haut bascule sous le vent hors service
    const one = { ...base, modules: [vbx('A', 0, 0), vbx('C', 0, 2.5)] };
    const runner = createInlineStudyRunner();
    const std = await runStudy(one, runner);
    const tall = await runStudy(withMods(one, { geometry: [{ topZ: 5000 }] }).inputs, runner);
    expect(tall.summary.errors).toEqual([]);
    const G = (r: typeof std) => -r.loads.cases.filter((c) => c.group === 'G').reduce((a, c) => a + c.resultant[1], 0);
    // poids pesé + 4 poteaux de 1,92 m en plus par Viewbox
    expect((G(tall) - G(std)) / 1e3).toBeCloseTo(2 * 1.13, 1);
    const col = (r: typeof std) => r.verdict.families.find((f) => f.family.startsWith('Poteau —'))?.eta ?? 0;
    expect(col(tall)).toBeGreaterThan(col(std));
    // vent : surface exposée plus haute
    const W = (r: typeof std) => Math.abs(r.loads.cases.find((c) => c.id === 'W2.1')!.resultant[0]);
    expect(W(tall)).toBeGreaterThan(W(std) * 1.4);
  }, 120000);
});

describe('assemblages des Viewbox modifiées (S10b)', () => {
  const reval = (mods: Parameters<typeof withMods>[1]) => withMods(base, mods).inputs.joints;
  const row = (j: ReturnType<typeof reval>, key: string) => j?.rows.find((r) => r.connection === key);
  const cap = (r: ReturnType<typeof row>, key: string) => r?.capacities.find((c) => c.key === key)?.after;

  it('sans modification : aucun assemblage hors gabarit', () => {
    expect(reval({})).toBeUndefined();
    expect(reval({ ballast: [{ module: 'A', kg: 100 }] })).toBeUndefined();
  });

  it('UPN 220 du catalogue à la place de l’UNP 220 : la méthode retombe sur les capacités du gabarit (HRd 5,81 kN, Fb,Rd 103,7 / 129,6 kN)', () => {
    const j = reval({ sections: [{ slot: 'rim-floor', section: 'CAT-UPN220' }, { slot: 'rim-roof', section: 'CAT-UPN220' }] })!;
    expect(cap(row(j, 'VBX-VERTICAL-PLATE'), 'HRd')! / 1e3).toBeCloseTo(5.81, 2);
    expect(cap(row(j, 'VBX-VERTICAL-PLATE'), 'FbRd_web')! / 1e3).toBeCloseTo(129.6, 1);
    expect(cap(row(j, 'VBX-HORIZONTAL-BOLT'), 'FbRd')! / 1e3).toBeCloseTo(103.7, 1);
    expect(cap(row(j, 'VBX-HORIZONTAL-BOLT'), 'BpRd')! / 1e3).toBeCloseTo(124.1, 1);
    // l'angle dépend des rives : indicatif, mêmes capacités (k = 1)
    const c = row(j, 'VBX-CORNER')!;
    expect(c.status).toBe('indicative');
    expect(cap(c, 'M_biax')! / 1e6).toBeCloseTo(8.0, 6);
    expect(j.cap).toBe('limit');
  });

  it('rives UPN 160 : boulons et plats recalculés (tw 7,5 mm, bras de levier 210 mm), angle indicatif réduit', () => {
    const j = reval({ sections: [{ slot: 'rim-floor', section: 'CAT-UPN160' }, { slot: 'rim-roof', section: 'CAT-UPN160' }] })!;
    expect(row(j, 'VBX-HORIZONTAL-BOLT')!.status).toBe('recalculated');
    expect(cap(row(j, 'VBX-HORIZONTAL-BOLT'), 'FbRd')! / 1e3).toBeCloseTo((2.5 * 360 * 16 * 7.5) / 1.25 / 1e3, 3);
    expect(cap(row(j, 'VBX-VERTICAL-PLATE'), 'HRd')! / 1e3).toBeCloseTo((458250 + 587500) / 210 / 1e3, 3);
    const c = row(j, 'VBX-CORNER')!;
    expect(cap(c, 'M_biax')! / 1e6).toBeCloseTo(8.0 * (7.5 / 9), 3);
  });

  it('poteaux en S355 : contact recalculé (paroi 2 · 100 · 5 · 355 / 1,1), angle indicatif non augmenté', () => {
    const j = reval({ grades: [{ slot: 'column', material: 'S355' }] })!;
    expect(cap(row(j, 'VBX-VERTICAL-CONTACT'), 'NRd_wall')! / 1e3).toBeCloseTo((2 * 100 * 5 * 355) / 1.1 / 1e3, 3);
    expect(cap(row(j, 'VBX-CORNER'), 'M_biax')! / 1e6).toBeCloseTo(8.0, 6);
  });

  it('poteaux 120 × 120 : angle et contact inconnus (vérifications bloquées), puis capacité saisie → « saisie, non vérifiée »', async () => {
    const mods = { sections: [{ slot: 'column' as const, section: 'CAT-SHS120x120x5' }] };
    const j = reval(mods)!;
    expect(row(j, 'VBX-CORNER')!.status).toBe('unknown');
    expect(row(j, 'VBX-CORNER')!.missing!.map((m) => m.key)).toContain('M_biax');
    expect(row(j, 'VBX-VERTICAL-CONTACT')!.status).toBe('unknown');
    const runner = createInlineStudyRunner();
    const one = { ...base, modules: [vbx('A', 0, 0)] };
    const blocked = await runStudy(withMods(one, mods).inputs, runner);
    expect(blocked.verdict.verdict).toBe('incomplete');
    const user = [
      { connection: 'VBX-CORNER', key: 'M_biax', value: 9e6, by: 'test' },
      { connection: 'VBX-CORNER', key: 'M_uniax_max', value: 12e6, by: 'test' },
      { connection: 'VBX-CORNER', key: 'M_uniax_min', value: 4e6, by: 'test' },
      { connection: 'VBX-CORNER', key: 'N', value: 70e3, by: 'test' },
      { connection: 'VBX-VERTICAL-CONTACT', key: 'NRd_weld', value: 150e3, by: 'test' },
    ];
    const j2 = reval({ ...mods, jointCapacities: user })!;
    expect(row(j2, 'VBX-CORNER')!.status).toBe('user');
    expect(j2.cap).toBe('limit');
    const filled = await runStudy(withMods(one, { ...mods, jointCapacities: user }).inputs, runner);
    // jamais « passe » avec une capacité saisie non vérifiée
    expect(filled.verdict.verdict).not.toBe('ok');
    expect(filled.verdict.reasons.join(' ')).toMatch(/saisie — non vérifiée/);
  }, 120000);
});
