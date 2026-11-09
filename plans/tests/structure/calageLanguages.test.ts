// Documents de calage en anglais et en allemand (A. Pinchart 09.11.2026 : « j'aimerais qu'on puisse aussi l'envoyer en
// anglais ») : fiche de calage A4, plan des appuis au sol A4 et plan de calage A3, dans les cas où le moteur écrit le
// plus de textes (vérins, plaques de roulage, sol faible, blocs bois, solutions retenues, dalle en charge répartie,
// relevé des niveaux, PEHD, longrines) — aucun texte resté en français.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { computeCalage } from '../../src/structure/core/calage';
import type { CalageResult } from '../../src/structure/core/calage';
import { calageRemedies } from '../../src/structure/core/calageRemedies';
import { gridModules } from '../../src/structure/core/estimate';
import type { EstimateModule } from '../../src/structure/core/estimate';
import type { DrawnBlock } from '../../src/structure/core/blocks';
import { withLevel } from '../../src/structure/core/groundLevels';
import { calageLevelMarks, calagePlates, calageSheet, fitCalageViewport, outlineLinework } from '../../src/structure/report/calagePlan';
import { groundPointsPages } from '../../src/structure/report/groundPoints';
import { groundSheetPages } from '../../src/structure/report/groundSheet';
import { FRENCH_MARKERS, translate } from '../../src/structure/report/translate';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import { levelOrder } from '../../src/ui/structure/GroundLevels';
import { SheetSvg } from '../../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../../src/sheets/types';
import { fitScale } from '../../src/sheets/scales';
import { viewBasis } from '../../src/core/views';

// mots français en plus de FRENCH_MARKERS, fréquents dans les textes du calage
const CALAGE_WORDS = ['vérins?', 'dalle', 'madriers?', 'roulage', 'pieds?', 'calage', 'appuis?', 'blocs?', 'plaques?', 'à', 'aucun', 'personnes?', 'centrée?s?', 'fleur', 'bois', 'hors', 'chaque', 'entre', 'emprise', 'poids', 'niveaux?', 'traverses?', 'lisses?', 'voir', 'dépasse', 'posée?s?', 'mètres?', 'au', 'aux', 'reprend', 'portance', 'répartie', 'semelle', 'pas', 'ne', 'une?'];
function frenchRe(lang: 'de' | 'en') {
  const skip = lang === 'de' ? ['des', 'service', 'une?'] : ['service', 'charge'];
  const words = [...FRENCH_MARKERS, ...CALAGE_WORDS].filter((w) => !skip.includes(w));
  return new RegExp(`(^|[^\\p{L}])(${words.join('|')})([^\\p{L}]|$)`, 'iu');
}
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;/g, "'");
const texts = (svg: string) => [...svg.matchAll(/>([^<>]+)</g)].map((m) => decode(m[1]).trim()).filter(Boolean);

/** Textes des trois documents de calage dans la langue demandée. */
function documentTexts(r: CalageResult, modules: EstimateModule[], lang: 'de' | 'en') {
  const info = { project: 'P', source: 'S', date: 'd', assumptions: [] as Array<[string, string]> };
  const fiche = groundSheetPages({ result: r, modules, info, lang }).map((p) => renderToStaticMarkup(p));
  const points = groundPointsPages({ modules, estimate: r.estimate, roadway: r.roadway, checks: r.checks, levels: r.levels, bearingLabel: '4.4 kN/m²', lang, noTuv: !!r.tuv.notApplicable, remedy: r.remedy, slab: r.slab, info }).map((p) =>
    renderToStaticMarkup(p),
  );
  const structure = {
    baseY: 0,
    modules: modules.map((m) => ({ level: m.level, params: { x0: 0, x1: 5900, y0: 0, y1: 2500 }, origin: [m.corners[0][0], 0, m.corners[0][1]] as [number, number, number], u: [1, 0, 0] as [number, number, number], v: [0, 0, 1] as [number, number, number] })),
  };
  const plates = calagePlates(structure as never, r, lang);
  const { sheet, notes, legend, viewport } = calageSheet({
    lang,
    modelKey: 'm',
    include: [],
    plates,
    levels: calageLevelMarks(structure as never, r),
    calage: r,
    bearing: { value: 4.4, label: 'Dalle / plancher de hall' },
    jacks: true,
    number: 'C 1',
  });
  const basis = viewBasis(viewport.request.view);
  const lw = outlineLinework(structure as never, basis);
  fitCalageViewport(viewport, lw, plates, basis, fitScale);
  const a3 = renderToStaticMarkup(createElement(SheetSvg, { sheet, titleBlock: emptyTitleBlock(), notes, legend, viewData: () => ({ lw, basis }) }));
  return { fiche: fiche.flatMap(texts), points: points.flatMap(texts), a3: [...texts(a3), notes, ...legend.map((l) => l.label)] };
}

// 2 Viewbox côte à côte, 9 blocs de 1 × 1 m sous les vérins (IKEA), 450 kg/m²
const mods = gridModules(1, 2, [[1], [1]], false);
const grid = gridModules(3, 2, [
  [2, 2, 1],
  [2, 2, 0],
], false);
const xs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[0])))].sort((a, b) => a - b);
const zs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[1])))].sort((a, b) => a - b);
const block = (id: string, x: number, z: number): DrawnBlock => ({ id, label: 'Structure sole', x0: x - 500, x1: x + 500, z0: z - 500, z1: z + 500, bottom: -339, top: -96, massKg: 102.5, massSource: 'computed', material: 'C24', pieces: 1, under: { feet: -2, frame: 96 } });
const xMid = (xs[0] + xs[xs.length - 1]) / 2;
const zMid = (zs[0] + zs[zs.length - 1]) / 2;
const ux = (x: number) => (x === xs[0] ? x + 500 : x === xs[xs.length - 1] ? x - 500 : x);
const uz = (z: number) => (z === zs[0] ? z + 500 : z === zs[zs.length - 1] ? z - 500 : z);
const nine = [xs[0], xMid, xs[xs.length - 1]].flatMap((x, i) => [zs[0], zMid, zs[zs.length - 1]].map((z, j) => block(`BL${3 * i + j + 1}`, ux(x), uz(z))));
const stock = { plates: [], commercial: [] };
const hyp = { ...DEFAULT_HYP, middleFeet: true };
const hyp450 = { ...hyp, bearingValue: 450, bearingUnit: 'kg/m²' as const, liveGround: 0.981, publicMode: 'persons' as const, persons: 4 };

function scenarios(): Array<[string, CalageResult, EstimateModule[]]> {
  const out: Array<[string, CalageResult, EstimateModule[]]> = [];
  out.push(['vérins, 2 niveaux', computeCalage(calageInput(grid, DEFAULT_HYP, stock, true)), grid]);
  out.push(['plaques de roulage', computeCalage({ ...calageInput(grid, hyp, stock), choices: { roadway: true } }), grid]);
  out.push(['sol faible', computeCalage(calageInput(mods, { ...hyp, bearingValue: 40, bearingUnit: 'kN/m²' }, stock, true)), mods]);
  const inp = { ...calageInput(mods, hyp450, stock, true), blocks: nine };
  const res = computeCalage(inp);
  out.push(['blocs bois', res, mods]);
  out.push(['blocs en contreplaqué', computeCalage({ ...inp, blocks: nine.map((b) => ({ ...b, material: 'CP-F40/30' })) }), mods]);
  for (const r of calageRemedies(inp, res)) if (r.apply && typeof r.apply === 'object') out.push([`solution ${r.key}`, computeCalage({ ...inp, choices: { remedy: r.apply } }), mods]);
  out.push(['blocs centrés', computeCalage({ ...inp, choices: { centreBlocks: true } }), mods]);
  const items = [{ label: 'Glazing', count: 3, N: 3 * 201 * 9.81, proposed: true as const }];
  const m2 = mods.map((m, i) => (i ? m : { ...m, carried: items[0].N, carriedItems: items }));
  const slab = { ...calageInput(m2, hyp450, stock, true), bearingMode: 'distributed' as const };
  out.push(['dalle, blocs, plaques de roulage', computeCalage({ ...slab, blocks: [...nine, block('BL99', xMid, zMid + 300)], choices: { roadway: true }, roadwayThickness: 20 }), m2]);
  out.push(['dalle trop chargée', computeCalage({ ...slab, bearing: slab.bearing / 3 }), m2]);
  out.push(['dalle, charge ponctuelle', computeCalage({ ...slab, pointLoadMax: 5000 }), m2]);
  const plain = computeCalage(calageInput(mods, DEFAULT_HYP, stock, true));
  const levels = levelOrder(plain.estimate.reactions, mods)
    .slice(0, -1)
    .reduce((acc, r, k) => withLevel(acc, r.group.position, -20 * k), [] as ReturnType<typeof withLevel>);
  out.push(['niveaux du sol', computeCalage({ ...calageInput(mods, { ...DEFAULT_HYP, groundLevels: levels }, stock, true), jackMax: 50 }), mods]);
  const pehd = { label: 'PEHD', length: 2200, width: 1100, thickness: 38, quantity: 0, material: 'hdpe' as const, massKg: 46 };
  out.push(['PEHD centrées', computeCalage({ ...calageInput(mods, hyp, stock), stock: [pehd], placement: 'centered' }), mods]);
  out.push(['longrines', computeCalage({ ...calageInput(mods, { ...hyp, bearingValue: 60, bearingUnit: 'kN/m²' }, stock), choices: { longrine: true } }), mods]);
  return out;
}

describe('documents de calage en anglais et en allemand', () => {
  const cases = scenarios();

  it('les solutions retenues sont dans les cas testés (plateau, plateau sans les blocs)', () => {
    const names = cases.map((c) => c[0]);
    expect(names).toContain('solution platform');
    expect(names).toContain('solution platform-no-blocks');
  });

  for (const lang of ['en', 'de'] as const)
    it(`${lang.toUpperCase()} : fiche de calage, plan des appuis au sol et plan de calage A3 sans texte français`, () => {
      const re = frenchRe(lang);
      const left: string[] = [];
      for (const [name, r, modules] of cases)
        for (const [doc, list] of Object.entries(documentTexts(r, modules, lang)))
          for (const t of list) {
            // « information » est aussi un mot anglais / allemand ; « une » est un mot allemand
            const clean = t.replace(/\binformation\b/gi, '');
            if (re.test(clean) || (lang === 'en' && /[éèàçêôûœÉÈÀ]/.test(t))) left.push(`[${name} · ${doc}] ${t}`);
          }
      expect([...new Set(left)]).toEqual([]);
    }, 120000);

  it('textes corrigés le 09.11.2026 : matériau des blocs, solutions, avertissements, portance', () => {
    expect(translate('en', 'Bloc de calage bois massif c24 (dessiné dans le modèle)')).toBe('Packing block, solid timber C24 (drawn in the model)');
    expect(translate('en', 'Bloc de calage contreplaqué f40/30 non revêtu (dessiné dans le modèle)')).toBe('Packing block, uncoated plywood F40/30 (drawn in the model)');
    expect(translate('en', 'un vérin d’angle — sur les madriers (bloc retiré)')).toBe('one corner jack — on the sleepers (block removed)');
    expect(translate('en', '2 vérins centraux — sur les madriers (bloc retiré)')).toBe('2 middle jacks — on the sleepers (block removed)');
    expect(translate('en', 'Soulèvement possible d’un appui sous le vent hors service : lest ou ancrage à étudier (calcul complet).')).toBe(
      'Possible uplift of a support under out-of-service wind: ballast or anchoring to be studied (full calculation).',
    );
    expect(translate('en', 'Sol légèrement déformable (prairie carrossable)')).toBe('Slightly deformable ground (drivable meadow)');
    expect(translate('de', 'Dalle / plancher de hall')).toBe('Decke / Hallenboden');
    // le plan des appuis au sol écrit « Slab: … » (et plus « Dalle : ») sous chaque Viewbox
    const slab = cases.find((c) => c[0] === 'dalle trop chargée')!;
    const pts = documentTexts(slab[1], slab[2], 'en').points;
    expect(pts.some((t) => /^Slab: [\d,]+ kg\/m²$/.test(t))).toBe(true);
  });
});
