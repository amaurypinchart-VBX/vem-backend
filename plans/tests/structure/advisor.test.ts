// Assemblages Viewbox repris (M16 dans les trous M20, plats d'empilement), modifications d'étude (lest,
// contreventements, Viewbox ajoutées, surélévation, sections créées) et diagnostic du conseil ingénieur.
import { describe, expect, it } from 'vitest';
import { sectionMap } from '../../src/structure/core/assemble';
import { rhs } from '../../src/structure/core/catalog';
import { checkBolt, checkStackShear, checkVerticalLink, connectionSet, platesPerCorner } from '../../src/structure/core/checks/joints';
import { checkTimberSpan } from '../../src/structure/core/checks/ec5';
import { materialByKey } from '../../src/structure/core/materials';
import { customSectionEntry, customSectionKey, describeMods, libraryWithMods, mergeMods } from '../../src/structure/core/mods';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { diagnose, slidingBallastN } from '../../src/structure/advisor/diagnose';
import { compareDigests, runDigest } from '../../src/structure/advisor/digest';
import { withMods } from '../../src/structure/advisor/variant';
import { LOADS, vbx } from './studyHelpers';

const F0 = { N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0 };
const base = (modules = [vbx('A', 0, 0), vbx('B', 5.9, 0)]): StudyInputs => ({
  modules,
  edgeItems: [],
  pointItems: [],
  library: SEED,
  sections: sectionMap(SEED),
  loads: LOADS,
  middleFeet: false,
  sls: true,
  options: CALC_DEFAULTS,
  blocking: [],
});

describe('assemblages Viewbox (A. Pinchart 30.09 et 01.10.2026)', () => {
  const c = connectionSet(SEED);
  it('boulons horizontaux M16 10.9 dans les écrous M20 soudés : cisaillement 62,8 kN, traction 113 kN', () => {
    expect(checkBolt(c, { ...F0, Vy: 62.8e3 }, 'b').eta).toBeCloseTo(1, 3);
    expect(checkBolt(c, { ...F0, N: 113.0e3 }, 'b').eta).toBeCloseTo(1, 3);
    expect(checkBolt(c, { ...F0, Vz: 30e3, N: 40e3 }, 'b').eta).toBeCloseTo(30 / 62.8 + 40 / (1.4 * 113.0), 3);
    expect(checkBolt(c, F0, 'b').record!.title).toContain('M16');
  });
  it('plats d’empilement : 4 par grand côté, 2 par petit côté, faces extérieures seulement', () => {
    // angle à l'extérieur des deux côtés : 2 plats du grand côté + 1 du petit côté
    expect(platesPerCorner(c)).toEqual({ n: 3, TRd: 94.1e3 });
    const up = checkVerticalLink(c, { ...F0, N: 50e3 }, 'L');
    expect(up.blocked).toBeUndefined();
    expect(up.eta).toBeCloseTo(50 / (3 * 94.1), 3);
    // grand côté contre une autre Viewbox : seul le petit côté porte des plats
    expect(checkVerticalLink(c, { ...F0, N: 50e3 }, 'L', undefined, { long: false, short: true }).eta).toBeCloseTo(50 / 94.1, 3);
    // angle enfermé : soulèvement non retenu (ne passe pas, pas « bloqué »)
    const inside = checkVerticalLink(c, { ...F0, N: 50e3 }, 'L', undefined, { long: false, short: false });
    expect(inside.eta).toBe(Infinity);
    expect(inside.blocked).toBeUndefined();
    expect(checkVerticalLink(c, { ...F0, N: -50e3 }, 'L', undefined, { long: false, short: false }).eta).toBeCloseTo(50 / 176, 3);
    // glissement de toute la Viewbox du dessus : frottement 0,1 · ΣRz puis moitié des plats des côtés extérieurs
    const all = { u0: true, u1: true, v0: true, v1: true };
    expect(checkStackShear(c, { Hu: 10e3, Hv: 0, C: 20e3 }, all, 'S').eta).toBeCloseTo((10 - 2) / (2 * 5.81), 3);
    expect(checkStackShear(c, { Hu: 0, Hv: 10e3, C: 20e3 }, all, 'S').eta).toBeCloseTo((10 - 2) / (4 * 5.81), 3);
    expect(checkStackShear(c, { Hu: 10e3, Hv: 0, C: 20e3 }, { ...all, u0: false, u1: false }, 'S').eta).toBe(Infinity);
    expect(checkStackShear(c, { Hu: 1e3, Hv: 0, C: 20e3 }, { ...all, u0: false, u1: false }, 'S').eta).toBe(0);
    // nombre de plats modifié dans l'étude
    const lib = libraryWithMods(SEED, { stackPlates: { perLongSide: 2, perShortSide: 1 } });
    expect(platesPerCorner(connectionSet(lib))).toEqual({ n: 1.5, TRd: 94.1e3 });
  });
});

describe('sections créées pour l’étude', () => {
  it('tube carré calculé par le catalogue, clé stable, bois C24 vérifié à l’EC5', () => {
    const e = customSectionEntry({ shape: 'SHS', h: 120, t: 6, material: 'S355' });
    expect(e.key).toBe(customSectionKey({ shape: 'SHS', h: 120, t: 6, material: 'S355' }));
    expect(e.section.A).toBeCloseTo(rhs(120, 120, 6, 'hot-finished').A, 6);
    expect(e.section.curveY).toBe('a');
    expect(() => customSectionEntry({ shape: 'SHS', h: 100, t: 60, material: 'S235' })).toThrow();
    expect(() => customSectionEntry({ shape: 'RECT', h: 100, b: 100, material: 'S235' })).toThrow();
    const wood = customSectionEntry({ shape: 'RECT', h: 100, b: 100, material: 'C24' });
    // poteau bois 100 × 100 de 0,80 m sous 20 kN de compression, vent (kmod 0,9) : 6.23 à la main
    const r = checkTimberSpan({ key: 'p', label: 'p', section: wood.section, material: materialByKey('C24')!, length: 800, stations: [{ x: 0, ...F0, N: -20e3 }] }, { factors: [['W2.1', 1.35]] });
    const lrel = (800 / Math.sqrt(1e4 / 12) / Math.PI) * Math.sqrt(21 / 7400);
    const k = 0.5 * (1 + 0.2 * (lrel - 0.3) + lrel * lrel);
    const kc = 1 / (k + Math.sqrt(k * k - lrel * lrel));
    expect(r.eta).toBeCloseTo(20e3 / 1e4 / (kc * ((0.9 * 21) / 1.3)), 6);
  });
  it('fusion et description des modifications', () => {
    const m = mergeMods({ ballast: [{ module: 'A', kg: 500 }], raise: { height: 800, section: 'X', top: 'rigid', bracing: true } }, { ballast: [{ module: 'A', kg: 800 }], raise: null });
    expect(m.ballast).toEqual([{ module: 'A', kg: 800 }]);
    expect(m.raise).toBeUndefined();
    expect(describeMods(m)[0]).toContain('800 kg');
  });
});

describe('modifications de l’étude dans le calcul complet', () => {
  it('lest : cas GB = poids du lest, compté dans la stabilité ; lest calculé contre le glissement suffit', async () => {
    const runner = createInlineStudyRunner();
    const run0 = await runStudy(base(), runner);
    expect(run0.stability.sliding.eta).toBeGreaterThan(1);
    const issues = diagnose(run0, { friction: CALC_DEFAULTS.friction });
    const slide = issues.find((i) => i.id === 'sliding')!;
    const remedy = slide.remedies.find((r) => r.id === 'ballast-slide')!;
    const kg = remedy.changes!.mods!.ballast!.reduce((a, b) => a + b.kg, 0);
    expect(kg * 9.81).toBeGreaterThanOrEqual(slidingBallastN(run0, CALC_DEFAULTS.friction));
    const v = withMods(base(), remedy.changes!.mods);
    const run1 = await runStudy(v.inputs, runner);
    expect(run1.loads.cases.find((c) => c.id === 'GB')!.resultant[1]).toBeCloseTo(-kg * 9.81, 3);
    expect(run1.combos.find((c) => c.id === 'COB1')!.factors).toContainEqual(['GB', 1]);
    expect(run1.stability.sliding.eta).toBeLessThanOrEqual(1.0001);
    const cmp = compareDigests(runDigest(run0, 0.4), runDigest(run1, 0.4));
    expect(cmp.glissement_eta.apres!).toBeLessThan(cmp.glissement_eta.avant!);
  }, 180000);

  it('2 Viewbox empilées : liaisons vérifiées (plus de blocage en traction) ; contreventement et Viewbox ajoutées', async () => {
    const runner = createInlineStudyRunner();
    const stack = base([vbx('A', 0, 0), vbx('A2', 0, 0, 1)]);
    const run0 = await runStudy(stack, runner);
    const links = run0.index.items.map((it, t) => ({ it, st: run0.summary.states[t] })).filter((x) => x.it.kind === 'vlink');
    expect(links).toHaveLength(4);
    expect(links.every((x) => !x.st?.blocked)).toBe(true);
    const shear = run0.index.items.map((it, t) => ({ it, st: run0.summary.states[t] })).filter((x) => x.it.kind === 'stack');
    expect(shear).toHaveLength(1);
    expect(shear[0].st!.eta).toBeGreaterThanOrEqual(0);
    expect(run0.structure.outerSides.get('A2')).toEqual({ u0: true, u1: true, v0: true, v1: true });
    // contreventement des grands côtés du bas + 2 Viewbox au sol de part et d'autre (petits côtés)
    const v = withMods(stack, {
      bracings: [
        { module: 'A', side: 'v0' },
        { module: 'A', side: 'v1' },
      ],
      addedModules: [
        { id: 'N1', from: 'A', side: 'u1' },
        { id: 'N2', from: 'A', side: 'u0' },
      ],
    });
    expect(v.inputs.modules.map((m) => m.id)).toEqual(['A', 'A2', 'N1', 'N2']);
    const run1 = await runStudy(v.inputs, runner);
    expect(run1.structure.meta.filter((m) => m.family === 'bracing')).toHaveLength(4);
    expect(run1.index.items.filter((i) => i.kind === 'brace')).toHaveLength(4);
    expect(run1.structure.meta.some((m) => m.family === 'bolt' && m.label.includes('N1'))).toBe(true);
    expect(run1.summary.errors.filter((e) => e.cls === 'ULS')).toEqual([]);
  }, 240000);

  it('surélévation de 80 cm sur tubes carrés contreventés : poteaux vérifiés, appuis 80 cm plus bas', async () => {
    const runner = createInlineStudyRunner();
    const post = { shape: 'SHS' as const, h: 100, t: 5, material: 'S235' };
    const key = customSectionKey(post);
    const v = withMods(base([vbx('A', 0, 0)]), { customSections: [{ ...post, key }], raise: { height: 800, section: key, top: 'rigid', bracing: true } });
    const run = await runStudy(v.inputs, runner);
    expect(run.summary.errors.filter((e) => e.cls === 'ULS')).toEqual([]);
    const posts = run.index.items.map((it, t) => ({ it, st: run.summary.states[t] })).filter((x) => x.it.family.startsWith('Poteau de surélévation'));
    expect(posts).toHaveLength(4);
    expect(posts.every((p) => p.st && !p.st.blocked && p.st.eta > 0)).toBe(true);
    const ys = run.structure.fem.supports.map((s) => run.structure.fem.nodes[s.node].y);
    expect(Math.max(...ys)).toBeCloseTo(-800, 6);
  }, 180000);
});

describe('modifications dans le rapport', () => {
  it('traduites en allemand et en anglais sans mot français', async () => {
    const { translate, FRENCH_MARKERS } = await import('../../src/structure/report/translate');
    const post = { shape: 'SHS' as const, h: 100, t: 5, material: 'S235' };
    const lines = describeMods(
      {
        sections: [{ slot: 'column', section: customSectionKey(post) }],
        ballast: [{ module: 'VBX-01', kg: 1200 }],
        bracings: [{ module: 'VBX-01', side: 'v0' }],
        addedModules: [
          { id: 'VBX-N1', from: 'VBX-01', side: 'u1' },
          { id: 'VBX-N2', from: 'VBX-01', side: 'top' },
        ],
        raise: { height: 800, section: customSectionKey(post), top: 'rigid', bracing: true },
        stackPlates: { perLongSide: 2, perShortSide: 2 },
      },
      () => customSectionEntry(post).name,
    );
    expect(lines).toHaveLength(7);
    for (const lang of ['de', 'en'] as const)
      for (const l of lines) {
        const t = translate(lang, l).toLowerCase();
        expect(FRENCH_MARKERS.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(t)), `${lang} : ${t}`).toEqual([]);
        expect(t).not.toMatch(/lest|ajoutée|surélévation|tête|toutes|formé|tube carré/);
      }
  });
});

describe('neige', () => {
  it('cas S sur les toitures du dernier niveau (0,8 · sk), combinaisons neige, estimation du sol', async () => {
    const { buildCombinations, COMBO_DEFAULTS } = await import('../../src/structure/core/combos');
    const { estimateReactions, ESTIMATE_DEFAULTS, gridModules } = await import('../../src/structure/core/estimate');
    const sk = 66 * 9.81e-6; // 66 kg/m² au sol
    const inputs = { ...base([vbx('A', 0, 0), vbx('A2', 0, 0, 1)]), loads: { ...LOADS, snowRoof: 0.8 * sk } };
    const run = await runStudy(inputs, createInlineStudyRunner());
    const S = run.loads.cases.find((c) => c.id === 'S')!;
    // neige seulement sur la Viewbox du haut : 0,8 · sk · surface entre lignes de système
    expect(-S.resultant[1]).toBeCloseTo(0.8 * sk * (5895 - 5) * (2495 - 5), 0);
    const ids = run.combos.map((c) => c.id);
    expect(ids).toContain('COS');
    expect(ids).toContain('CO104');
    expect(ids).toContain('ELSS');
    expect(run.combos.find((c) => c.id === 'CO104')!.factors).toContainEqual(['S', 0.675]);
    expect(run.combos.filter((c) => c.cls === 'STAB').every((c) => !c.factors.some(([id]) => id === 'S'))).toBe(true);
    expect(run.summary.errors.filter((e) => e.cls === 'ULS')).toEqual([]);
    expect(buildCombinations(COMBO_DEFAULTS).some((c) => c.factors.some(([id]) => id === 'S'))).toBe(false);
    // estimation instantanée : la neige de la toiture du haut descend aux 4 angles
    const mods = gridModules(1, 1, [[2]], false);
    const loads = { moduleWeight: 2564 * 9.81, ceiling: 0, floorFinish: 0, live: 0, roofLive: 0, extraPerModule: 0 };
    const est = estimateReactions(mods, { ...ESTIMATE_DEFAULTS, loads: { ...loads, snowRoof: 0.8 * sk } });
    const tot = (name: string) => est.totals!.find((t) => t.combo === name && t.cls === 'SLS')!.R;
    expect(tot('G + S (neige)') - tot('G')).toBeCloseTo(0.8 * sk * mods[1].area, -1);
    expect(est.totals!.some((t) => t.combo.startsWith('G + W hors service + ψ0 S'))).toBe(true);
  }, 180000);
});
