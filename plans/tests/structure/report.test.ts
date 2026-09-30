// Rapport de l'étude structure : mise en page (pages A4, en-tête / pied, sommaire), contenu (synthèse, chapitres 1 à
// 5, annexe de la version détaillée), traductions (aucun mot français dans les rapports allemand et anglais, point
// décimal en anglais), cohérence des chiffres avec le calcul. REPORT_SVG=1 écrit les pages dans e2e/shots/.
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sectionMap } from '../../src/structure/core/assemble';
import { computeCalage } from '../../src/structure/core/calage';
import type { CalageResult } from '../../src/structure/core/calage';
import { ESTIMATE_DEFAULTS } from '../../src/structure/core/estimate';
import { C24_BEAMS } from '../../src/structure/core/ground';
import { SEED } from '../../src/structure/library/seed';
import type { ReportInput } from '../../src/structure/report/build';
import { buildReport, comboFormula, slidingBallast } from '../../src/structure/report/build';
import { paginate } from '../../src/structure/report/doc';
import type { Lang } from '../../src/structure/report/i18n';
import { textWidth, wrapText } from '../../src/structure/report/metrics';
import { FRENCH_MARKERS, translate } from '../../src/structure/report/translate';
import type { StudyInputs, StudyRun } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { LOADS, vbx } from './studyHelpers';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { viewBasis } from '../../src/core/views';
import { SheetSvg } from '../../src/sheets/SheetSvg';
import { fitScale } from '../../src/sheets/scales';
import { emptyTitleBlock } from '../../src/sheets/types';
import { calagePlates, calageSheet, fitCalageViewport, outlineLinework } from '../../src/structure/report/calagePlan';
import { studyFacts } from '../../src/structure/report/facts';
import { checkText } from '../../../src/services/structureAiGuard';
import { VIEWBOX_STOCK } from '../../src/structure/core/ground';
import type { ModuleTypeEntry } from '../../src/structure/core/library';
import { editedModuleEntry, withSection } from '../../src/structure/core/viewboxEdit';

const inputs: StudyInputs = {
  modules: [vbx('VBX-01', 0, 0), vbx('VBX-02', 0, 2.5), vbx('VBX-03', 0, 0, 1)],
  edgeItems: [
    { module: 'VBX-01', side: 'v0', from: 0, to: 5890, level: 'floor', q: 1.75, loadCase: 'G3', label: 'Vitrage lourd' },
    { module: 'VBX-02', side: 'u0', from: 0, to: 2490, level: 'floor', q: 0.5, loadCase: 'G3', label: 'Mur plein' },
    { module: 'VBX-03', side: 'v1', from: 0, to: 5890, level: 'floor', q: 0.1, loadCase: 'G5', label: 'Garde-corps 2 m' },
  ],
  pointItems: [{ module: 'VBX-03', u: 2950, v: 1250, level: 'roof', F: 400, loadCase: 'G7', label: 'Logo' }],
  library: SEED,
  sections: sectionMap(SEED),
  loads: LOADS,
  middleFeet: false,
  sls: true,
  options: { ...CALC_DEFAULTS, friction: 0.6 },
  blocking: [],
};

let run: StudyRun;
let calage: CalageResult;

function reportInput(lang: Lang, variant: 'compact' | 'detailed'): ReportInput {
  return {
    lang,
    variant,
    project: { name: 'Paddock test', number: '26-0042', client: 'Client SA', address: 'Circuit, Spa', installation: '12 / 05 / 2026' },
    author: 'Amaury Pinchart',
    date: new Date(2026, 8, 30),
    model: { fileName: 'paddock.zip', date: '29.09.2026' },
    version: 'v1.0',
    study: inputs,
    run,
    calage,
    bearing: { value: 200, label: 'Sol légèrement déformable (prairie carrossable)' },
    moduleWeightKg: 2564,
    sceneWarnings: [],
  };
}

/** Textes des éléments <text> d'une page SVG. */
const texts = (svg: string) => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));

const calageInputFor = () => ({
  modules: [],
  estimate: { ...ESTIMATE_DEFAULTS, loads: { moduleWeight: 0, ceiling: 0, floorFinish: 0, live: 0, roofLive: 0, extraPerModule: 0 } },
  bearing: 0.2,
  staticoConversion: false,
  thicknesses: [18, 21, 24, 27, 30, 40],
  stock: [],
  commercial: [],
  longrine: { k: 0.03, beams: C24_BEAMS, overhang: 55, maxCount: 6 },
  diffusion: false,
});

describe('rapport de l’étude structure', () => {
  beforeAll(async () => {
    run = await runStudy(inputs, createInlineStudyRunner());
    calage = computeCalage({ ...calageInputFor(), reactions: run.ground });
  }, 180000);

  it('mesure des textes : largeurs d’Arimo, coupure des lignes à la largeur', () => {
    // Arial : « a » = 556 / 1000, espace = 278 / 1000
    expect(textWidth('a', 10)).toBeCloseTo(5.56, 6);
    expect(textWidth(' ', 10)).toBeCloseTo(2.78, 6);
    expect(textWidth('ab', 10, true)).toBeGreaterThan(textWidth('ab', 10));
    const lines = wrapText('Le sol doit être suffisamment portant pour reprendre les charges de la construction.', 40, 3.1);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => textWidth(l, 3.1) <= 40 + 1e-9)).toBe(true);
    expect(lines.join(' ')).toBe('Le sol doit être suffisamment portant pour reprendre les charges de la construction.');
  });

  it('mise en page : un titre n’est jamais seul en bas de page, un tableau coupé répète son en-tête', () => {
    const rows = Array.from({ length: 120 }, (_, k) => [`ligne ${k + 1}`, String(k)]);
    const pages = paginate([
      { t: 'heading', level: 1, num: '1', text: 'Titre' },
      { t: 'para', text: 'x '.repeat(400) },
      { t: 'table', cols: [{ title: 'Colonne A', w: 1 }, { title: 'Colonne B', w: 1 }], rows },
      { t: 'series', prefix: 'B' },
      { t: 'heading', level: 1, num: 'B', text: 'Annexe' },
    ]);
    const tablePages = pages.filter((p) => p.body.join('').includes('ligne '));
    expect(tablePages.length).toBeGreaterThan(1);
    for (const p of tablePages) expect(p.body.join('')).toContain('Colonne A');
    expect(pages[pages.length - 1].prefix).toBe('B');
    expect(pages[pages.length - 1].number).toBe(1);
    expect(pages[pages.length - 1].headings[0].text).toBe('Annexe');
    // pages A numérotées 1, 2, 3…
    expect(pages.filter((p) => p.prefix === 'A').map((p) => p.number)).toEqual(pages.filter((p) => p.prefix === 'A').map((_, k) => k + 1));
  });

  it('version compacte en français : page de garde, synthèse, chapitres 1 à 5, 8 à 15 pages', () => {
    const r = buildReport(reportInput('fr', 'compact'));
    expect(r.annexPages).toBe(0);
    expect(r.mainPages).toBeGreaterThanOrEqual(8);
    expect(r.mainPages).toBeLessThanOrEqual(15);
    expect(r.pages).toHaveLength(r.mainPages + 1);
    const cover = texts(r.pages[0].svg).join('\n');
    expect(cover).toContain('Pré-étude structurelle');
    expect(cover).toContain('PRÉ-ÉTUDE INTERNE — NON VÉRIFIÉE PAR UN INGÉNIEUR');
    expect(cover).toContain('Paddock test');
    expect(cover).toContain(`Ce rapport comporte ${r.mainPages} pages`);
    for (const t of ['Synthèse', 'Remarques préliminaires, bases et consignes', 'Hypothèses de charges', 'Vérifications de résistance', 'Stabilité d’ensemble', 'Conclusion'])
      expect(r.toc.some((e) => e.text === t)).toBe(true);
    expect(r.toc.find((e) => e.text === 'Synthèse')!.page).toBe('A 1');
    // chaque page : en-tête projet, filigrane, numéro « A n »
    r.pages.slice(1).forEach((p, k) => {
      const t = texts(p.svg);
      expect(t).toContain('26-0042');
      expect(t).toContain('Pré-étude interne — non vérifiée par un ingénieur');
      expect(t).toContain(`A ${k + 1}`);
    });
    // aucune valeur manquante
    const all = r.pages.flatMap((p) => texts(p.svg)).join('\n');
    expect(all).not.toMatch(/NaN|undefined|Infinity|\[object/);
    // verdict = pire du calcul et du calage ; taux de la famille déterminante imprimé
    expect(['ok', 'limit', 'fail']).toContain(r.verdict);
    const top = run.verdict.families[0];
    expect(all).toContain(`η = ${run.summary.states[top.item]!.eta.toFixed(2).replace('.', ',')}`);
    // vent : vitesse d'arrêt d'exploitation 17,9 m/s, plan d'action vent fort
    expect(all).toContain('17,9 m/s');
    expect(all).toContain('Plan d’action vent fort');
    // charges : vitrage lourd, logo
    expect(all).toContain('Vitrage lourd : 1,75 kN/m sur 5,9 m');
    expect(all).toContain('Logo : 0,40 kN');
  });

  it('version détaillée : annexe B (sections, cas de charge, combinaisons, vérifications, réactions)', () => {
    const r = buildReport(reportInput('fr', 'detailed'));
    expect(r.annexPages).toBeGreaterThan(0);
    const annex = r.pages.slice(1 + r.mainPages);
    expect(texts(annex[0].svg)).toContain('B 1');
    const all = annex.flatMap((p) => texts(p.svg)).join('\n');
    expect(all).toContain('UNP 220');
    expect(all).toContain('37,40'); // A = 37,40 cm² (annexe SCIA)
    for (const c of run.combos) expect(all).toContain(c.id);
    for (const g of run.ground.groups) expect(all).toContain(g.id);
  });

  for (const lang of ['de', 'en'] as const)
    it(`rapport ${lang.toUpperCase()} : aucun mot français, nombres ${lang === 'en' ? 'au point' : 'à la virgule'}`, () => {
      const r = buildReport(reportInput(lang, 'detailed'));
      // noms propres du projet et des objets : ce sont des données, pas des textes du rapport
      const own = ['Paddock test', 'Client SA', 'Circuit, Spa', 'paddock.zip', 'Vitrage lourd', 'Mur plein', 'Garde-corps 2 m', 'Étude structure', 'Sol légèrement déformable (prairie carrossable)'];
      const all = r.pages
        .flatMap((p) => texts(p.svg))
        .map((t) => own.reduce((s, o) => s.split(o).join(''), t))
        .join('\n');
      const markers = FRENCH_MARKERS.filter((w) => !(lang === 'de' && ['des', 'service'].includes(w)) && !(lang === 'en' && ['service', 'charge'].includes(w)));
      const found = markers.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(all));
      const context = found.map((w) => all.split('\n').find((l) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(l)));
      expect(context).toEqual([]);
      if (lang === 'en') expect(all.split('\n').filter((l) => /\d,\d/.test(l))).toEqual([]);
      else expect(all).toMatch(/\d,\d/);
      expect(all).toContain(lang === 'de' ? 'Nachweise der Tragfähigkeit' : 'Resistance checks');
      expect(all).toContain(lang === 'de' ? 'Bodenpressung und Unterpallung' : 'Ground pressure and packing');
    });

  it('pieds à vérin : chapitre des tiges Tr 24 × 5 en français, traduit sans mot français en allemand et en anglais', async () => {
    const study: StudyInputs = { ...inputs, options: { ...inputs.options, jacks: true } };
    const jr = await runStudy(study, createInlineStudyRunner());
    const jc = computeCalage({ ...calageInputFor(), reactions: jr.ground });
    const own = ['Paddock test', 'Client SA', 'Circuit, Spa', 'paddock.zip', 'Vitrage lourd', 'Mur plein', 'Garde-corps 2 m', 'Étude structure', 'Sol légèrement déformable (prairie carrossable)'];
    for (const lang of ['fr', 'de', 'en'] as const) {
      const r = buildReport({ ...reportInput(lang, 'detailed'), study, run: jr, calage: jc });
      const all = r.pages
        .flatMap((p) => texts(p.svg))
        .map((t) => own.reduce((x, o) => x.split(o).join(''), t))
        .join('\n');
      expect(all).not.toMatch(/NaN|undefined|Infinity|\[object/);
      if (lang === 'fr') {
        expect(all).toContain('Pieds à vérin (tiges Tr 24 × 5)');
        expect(all).toContain('vérin d’angle');
        expect(all).toContain('6 par Viewbox');
        continue;
      }
      expect(all).toContain(lang === 'de' ? 'Spindelfuß' : 'Jack Tr 24 × 5');
      const markers = FRENCH_MARKERS.filter((w) => !(lang === 'de' && ['des', 'service'].includes(w)) && !(lang === 'en' && ['service', 'charge'].includes(w)));
      const found = markers.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(all));
      const context = found.map((w) => all.split('\n').find((l) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(l)));
      expect(context).toEqual([]);
      expect(all.split('\n').filter((l) => /(^|[^\p{L}])(vérins?|Vérin|sortie|tiges?)([^\p{L}]|$)/u.test(l))).toEqual([]);
    }
  }, 180000);

  it('traduction des textes du moteur : libellés d’éléments, formules, typographie', () => {
    expect(translate('de', 'VBX-01 · rive plancher, grand côté 1, tronçon 3 (1,20 m)')).toBe('VBX-01 · Bodenrandträger, Längsseite 1, Abschnitt 3 (1,20 m)');
    expect(translate('en', 'VBX-01 · rive plancher, grand côté 1, tronçon 3 (1,20 m)')).toBe('VBX-01 · floor edge beam, long side 1, span 3 (1.20 m)');
    expect(translate('en', 'VBX-01 · angle 2, toiture')).toBe('VBX-01 · corner 2, roof');
    expect(translate('de', 'Plaque « Alu » : 12 kN')).toBe('Platte „Alu“: 12 kN');
    expect(translate('fr', 'rive plancher')).toBe('rive plancher');
  });

  it('combinaisons écrites avec leurs coefficients ; lest de glissement', () => {
    const co = run.combos.find((c) => c.id === 'CO11')!;
    expect(comboFormula(co, 'fr')).toBe('1,10 ΣG + 1,35 Q1.1');
    const cob = run.combos.find((c) => c.id === 'COB1')!;
    expect(comboFormula(cob, 'en')).toBe('1.00 (G1 + Gc + G5) + 0.50 (G2 + G3 + G4) + 1.20 (W2.1 + W0)');
    // μ = 0,6 suffit (lest nul) ; avec μ = 0,1 il faut du lest
    expect(slidingBallast(run, 0.6)).toBe(0);
    expect(slidingBallast(run, 0.1)).toBeGreaterThan(0);
  });

  /** Plan de calage A3 rendu par SheetSvg avec le contour des Viewbox (sans moteur 2D). */
  function planSvg(lang: Lang, label: string): string {
    const plates = calagePlates(run.structure, calage, lang);
    const { sheet, notes, legend, viewport } = calageSheet({ lang, modelKey: 'm', include: [], plates, calage, bearing: { value: 200, label: 'prairie' }, jacks: false, number: label });
    const basis = viewBasis(viewport.request.view);
    const lw = outlineLinework(run.structure, basis);
    fitCalageViewport(viewport, lw, plates, basis, fitScale);
    const tb = { ...emptyTitleBlock(), projectName: 'Paddock test', projectNumber: '26-0042' };
    return renderToStaticMarkup(createElement(SheetSvg, { sheet, titleBlock: tb, notes, legend, viewData: () => ({ lw, basis }) }));
  }

  it('plan de calage A3 : une plaque par groupe d’appuis, à l’échelle, étiquetée ; page du rapport', () => {
    const plates = calagePlates(run.structure, calage, 'fr');
    expect(plates.map((p) => p.id).sort()).toEqual(run.ground.groups.map((g) => g.id).sort());
    // plaque carrée du côté retenu, centrée sur le groupe
    const t = calage.types.find((x) => x.corners === 1)!;
    const p1 = plates.find((p) => p.id === t.reactions[0].group.id)!;
    const side = Math.hypot(p1.corners[1][0] - p1.corners[0][0], p1.corners[1][2] - p1.corners[0][2]);
    expect(side).toBeCloseTo(t.chosen!.footprint!.l, 6);
    expect(p1.label).toBe(t.chosen!.summary.replace(' par angle', ''));
    const svg = planSvg('fr', 'A 17');
    expect(svg).toContain('A 17');
    for (const p of plates) expect(svg).toContain(`>${p.id}<`);
    expect(svg).toContain('Plan de calage');
    expect(svg).toMatch(/Plan de calage — niveau 0 — 1:\d+/);
    const r = buildReport({ ...reportInput('fr', 'compact'), calagePlan: (label) => planSvg('fr', label) });
    expect(r.pages[r.mainPages].size).toEqual({ w: 420, h: 297 });
    expect(r.pages[r.mainPages].svg).toContain(`A ${r.mainPages}`);
    expect(r.toc.find((e) => e.text === 'Plan de calage')!.page).toBe(`A ${r.mainPages}`);
  });

  it('installation qui bascule, sans portance : verdict « incomplet », motif court et pistes de correction dans les 3 langues', async () => {
    const tall: StudyInputs = { ...inputs, modules: [vbx('VBX-01', 0, 0), vbx('VBX-02', 0, 0, 1)], edgeItems: [], pointItems: [], options: CALC_DEFAULTS };
    const r2 = await runStudy(tall, createInlineStudyRunner());
    expect(r2.stability.overturning.verdict).toBe('fail');
    for (const lang of ['fr', 'de', 'en'] as const) {
      const r = buildReport({ ...reportInput(lang, 'compact'), study: tall, run: r2, calage: null, bearing: null });
      // portance non renseignée : « incomplet » l'emporte sur « ne passe pas » (jamais de verdict sans calage)
      expect(r.verdict).toBe('incomplete');
      const all = r.pages.flatMap((p) => texts(p.svg)).join(' ');
      expect(all).toContain({ fr: 'Basculement sous le vent hors service', de: 'Kippen unter Wind außer Betrieb', en: 'Overturning under out-of-service wind' }[lang]);
      expect(all).toContain({ fr: 'Pistes de correction', de: 'Mögliche Maßnahmen', en: 'Possible measures' }[lang]);
      expect(all).toContain({ fr: 'Portance du sol non renseignée', de: 'Zulässige Bodenpressung nicht angegeben', en: 'Ground bearing capacity not entered' }[lang]);
    }
  }, 120000);

  it('données pour l’IA : un texte fait de ces valeurs passe le garde-fou, un chiffre inventé est rejeté', () => {
    const facts = studyFacts({ lang: 'fr', run, inputs, calage, bearing: 200 });
    const inst = facts.installation as Record<string, number>;
    const fam = (facts.familles as Array<{ famille: string; eta_max: number }>)[0];
    const hyp = facts.hypotheses as Record<string, number>;
    const text = `L’installation compte ${inst.viewbox} Viewbox sur ${inst.niveaux} niveaux (${String(inst.emprise_x_m).replace('.', ',')} m). ${fam.famille} : η = ${String(fam.eta_max).replace('.', ',')}. Arrêt d’exploitation à ${String(hyp.vitesse_arret_exploitation_m_s).replace('.', ',')} m/s.`;
    expect(checkText(text, facts)).toEqual([]);
    expect(hyp.vitesse_arret_exploitation_m_s).toBe(17.9);
    expect(checkText('Le taux maximal vaut 0,123.', facts)).toEqual([0.123]);
  });

  it('structure d’un type de Viewbox modifiée dans la bibliothèque : signalée en tête des remarques, dans les 3 langues', () => {
    const vbxType = SEED.find((e): e is ModuleTypeEntry => e.kind === 'module_type' && e.key === 'VIEWBOX-5900-EU')!;
    const edited = editedModuleEntry(vbxType, { params: withSection(vbxType.params!, 'rimRoof', 'QHP100x5') }, { library: SEED, who: 'A. Pinchart', date: '30/09/2026' });
    const library = SEED.map((e) => (e === vbxType ? edited : e));
    const words = { fr: 'modifiée dans la bibliothèque', de: 'in der Bibliothek gegenüber', en: 'modified in the library' } as const;
    for (const lang of ['fr', 'de', 'en'] as const) {
      const all = buildReport({ ...reportInput(lang, 'compact'), study: { ...inputs, library } }).pages.flatMap((p) => texts(p.svg)).join(' ');
      expect(all).toContain(words[lang]);
      expect(buildReport(reportInput(lang, 'compact')).pages.flatMap((p) => texts(p.svg)).join(' ')).not.toContain(words[lang]);
    }
  });

  it('textes rédigés par l’IA dans le rapport : description et conclusion remplacées, mention du contrôle', () => {
    const r = buildReport({ ...reportInput('fr', 'compact'), texts: { description: 'Description rédigée pour le test.', instructions: ['Consigne particulière du projet.'], conclusion: 'Conclusion rédigée pour le test.' } });
    const all = r.pages.flatMap((p) => texts(p.svg)).join(' ');
    expect(all).toContain('Description rédigée pour le test.');
    expect(all).toContain('Consigne particulière du projet.');
    expect(all).toContain('Conclusion rédigée pour le test.');
    expect(all).toContain('aucun chiffre ne provient de l’IA');
  });

  it('calage sur le stock Viewbox standard : multiplex bouleau 18 / 36 mm, plaques de 40, 70 ou 100 cm', () => {
    const c = computeCalage({
      modules: [],
      estimate: { ...ESTIMATE_DEFAULTS, loads: { moduleWeight: 0, ceiling: 0, floorFinish: 0, live: 0, roofLive: 0, extraPerModule: 0 } },
      bearing: 0.2,
      staticoConversion: false,
      thicknesses: [18, 21, 24, 27, 30, 40],
      stock: VIEWBOX_STOCK,
      commercial: [],
      longrine: { k: 0.03, beams: C24_BEAMS, overhang: 55, maxCount: 6 },
      diffusion: false,
      reactions: run.ground,
    });
    for (const t of c.types) {
      expect(t.chosen!.kind).toBe('plywood-stock');
      expect([400, 700, 1000]).toContain(t.chosen!.footprint!.l);
      expect(t.chosen!.materials[0].label).toMatch(/Multiplex bouleau \(stock, quantité à vérifier au dépôt\)/);
    }
    // fm,k du bouleau (fiche Metsä) dans le calcul de flexion
    expect(c.types[0].chosen!.records.find((x) => x.key === 'ground.plate.bending')!.withValues).toContain('3,41 kN/cm²');
  });

  it('pages écrites pour contrôle visuel (REPORT_SVG=1)', () => {
    if (!process.env.REPORT_SVG) return;
    const dir = path.resolve(__dirname, '../../e2e/shots/report');
    fs.mkdirSync(dir, { recursive: true });
    for (const [lang, variant] of [
      ['fr', 'detailed'],
      ['de', 'compact'],
      ['en', 'compact'],
    ] as const) {
      const r = buildReport({ ...reportInput(lang, variant), calagePlan: (label) => planSvg(lang, label) });
      r.pages.forEach((p, k) => fs.writeFileSync(path.join(dir, `${lang}-${variant}-${String(k).padStart(2, '0')}.svg`), p.svg));
    }
  });
});
