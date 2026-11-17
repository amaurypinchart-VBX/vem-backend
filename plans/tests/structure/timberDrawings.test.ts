// Solution retenue en madriers (grille sous les rangées, plateau) dessinée partout où le calage est montré (A. Pinchart
// 16.11.2026 : « quand on choisit une option, ça se dessine sur les dessins pour pouvoir ressortir en PDF et que tout
// soit clair pour les personnes à qui on envoie ») : coupe du calage (couches de madriers sous les blocs), plans A4 et
// plan de calage A3 (chaque madrier visible par ses joints, couche du dessous / du dessus, légende), rapport ; et la
// surface réellement chargée par un bloc posé au bord (pas tout le bloc) dans le calcul des madriers.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeCalage } from '../../src/structure/core/calage';
import type { AppliedRemedy } from '../../src/structure/core/calageRemedies';
import { calageRemedies, loadedFootprint, sleeperOption, timberJoints } from '../../src/structure/core/calageRemedies';
import { gridModules } from '../../src/structure/core/estimate';
import type { DrawnBlock } from '../../src/structure/core/blocks';
import { checkPlan, groundSheetPages, planPlates } from '../../src/structure/report/groundSheet';
import { groundPointsPages } from '../../src/structure/report/groundPoints';
import { calagePlates, calageSheet, fitCalageViewport, outlineLinework } from '../../src/structure/report/calagePlan';
import { stackLines, stacksFigureSvg } from '../../src/structure/report/stackFigure';
import { timberGroundText, timberLegend } from '../../src/structure/report/calageI18n';
import { calagePlanFigure } from '../../src/structure/report/planFigure';
import { translate } from '../../src/structure/report/translate';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import { SheetSvg } from '../../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../../src/sheets/types';
import { fitScale } from '../../src/sheets/scales';
import { viewBasis } from '../../src/core/views';

// 2 Viewbox côte à côte sur vérins, 9 blocs de 1 × 1 m à fleur de l'installation (IKEA)
const mods = gridModules(1, 2, [[1], [1]], false);
const xs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[0])))].sort((a, b) => a - b);
const zs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[1])))].sort((a, b) => a - b);
const block = (id: string, x: number, z: number, h: number, massKg: number): DrawnBlock => ({ id, label: 'Sous bois', x0: x - 500, x1: x + 500, z0: z - 500, z1: z + 500, bottom: -h, top: 0, massKg, massSource: 'computed', material: 'C24', pieces: 1 });
const xMid = (xs[0] + xs[xs.length - 1]) / 2;
const zMid = (zs[0] + zs[zs.length - 1]) / 2;
const ux = (x: number) => (x === xs[0] ? x + 500 : x === xs[xs.length - 1] ? x - 500 : x);
const uz = (z: number) => (z === zs[0] ? z + 500 : z === zs[zs.length - 1] ? z - 500 : z);
const nine = (h: number, kg: number) => [xs[0], xMid, xs[xs.length - 1]].flatMap((x, i) => [zs[0], zMid, zs[zs.length - 1]].map((z, j) => block(`BL${3 * i + j + 1}`, ux(x), uz(z), h, kg)));
const input = (kgm2: number, h: number, kg: number) => ({
  ...calageInput(mods, { ...DEFAULT_HYP, bearingValue: kgm2, bearingUnit: 'kg/m²' as const, middleFeet: true, liveGround: 0.981, publicMode: 'persons' as const, persons: 4 }, { plates: [], commercial: [] }, true),
  blocks: nine(h, kg),
});
const applied = (inp: ReturnType<typeof input>, key: string) => {
  const r = calageRemedies(inp, computeCalage(inp)).find((x) => x.key === key)!;
  return { remedy: r, result: computeCalage({ ...inp, choices: { remedy: r.apply as AppliedRemedy } }) };
};

describe('madriers de la solution retenue : calcul', () => {
  it('bloc à fleur sous un vérin d’angle : seule la partie centrée sous le vérin charge les madriers', () => {
    const inp = input(450, 645, 270);
    const res = computeCalage(inp);
    const corner = res.checks.find((c) => c.reaction.group.corners === 1 && !c.reaction.group.middle)!;
    // vérin à 15,5 cm des bords du bloc : 2 × 15,5 = 31 cm dans les deux directions, pas 100 × 100
    const [a, b] = loadedFootprint(corner, true);
    expect(a).toBeCloseTo(310, 0);
    expect(b).toBeCloseTo(310, 0);
    // sans le bloc : la platine du vérin
    expect(loadedFootprint(corner, false)).toEqual([corner.geometry.contact[0], corner.geometry.contact[1]]);
  });

  it('IKEA 450 kg/m² : plateau sans les blocs vérifié ; avec les blocs, la piste n’est plus « passe » d’office', () => {
    const inp = input(450, 645, 270);
    const rem = calageRemedies(inp, computeCalage(inp));
    const no = rem.find((x) => x.key === 'platform-no-blocks')!;
    expect(no.verdict).toBe('ok');
    expect(no.eta!).toBeLessThanOrEqual(1);
    const withBlocks = rem.find((x) => x.key === 'platform')!;
    // pression sous un appui d'angle concentrée sur 31 cm le long de la rangée : plus forte qu'avec tout le bloc
    expect(withBlocks.eta!).toBeGreaterThan(no.eta! - 0.2);
  }, 60000);

  it('madriers de plus de 6 m : remarque sur les joints décalés', () => {
    const { remedy } = applied(input(450, 645, 270), 'platform-no-blocks');
    expect(remedy.notes.some((n) => /^Madriers de 6,\d\d m : au-delà de 6,00 m/.test(n))).toBe(true);
    expect(translate('en', remedy.notes.find((n) => n.startsWith('Madriers de'))!)).toMatch(/^Sleepers of 6\.\d\d m: beyond 6\.00 m/);
  }, 60000);
});

describe('madriers de la solution retenue : dessins', () => {
  it('coupe du calage : les couches de madriers sous le bloc, de bas en haut, à leur épaisseur', () => {
    const { result } = applied(input(450, 645, 270), 'platform');
    const p = result.remedy!.remedy.apply as Extract<AppliedRemedy, { key: 'platform' | 'platform-no-blocks' }>;
    for (const s of result.stacks!) {
      expect(s.layers.map((l) => l.kind).slice(0, 3)).toEqual(['timber', 'timber', 'block']);
      expect(s.layers[0].thickness).toBe(p.lower.h);
      expect(s.layers[1].thickness).toBe(p.upper.h);
      expect(s.layers[0].section).toBe('cut');
      expect(s.layers[1].section).toBe('long');
      expect(s.known).toBeCloseTo(p.lower.h + p.upper.h + 645, 6);
    }
    expect(stackLines(result.stacks![0], 'fr')[0]).toMatch(/^1\. Plateau, couche du dessous : madriers C24/);
    expect(stackLines(result.stacks![0], 'en')[0]).toMatch(/^1\. Platform, lower layer: C24 sleepers/);
    // croquis : madriers dessinés, « Sol » (pas une dalle)
    const svg = stacksFigureSvg(result.stacks!, 'fr', false)(0, 0, 186, 46);
    expect(svg).toContain('Madriers');
    expect(svg).toContain('>Sol<');
  }, 60000);

  it('grille sans les blocs : les vérins sur les madriers, la grille sous chaque rangée dans la coupe', () => {
    const { result } = applied(input(800, 645, 270), 'sleepers-no-blocks');
    expect(result.remedy!.remedy.verdict).toBe('ok');
    for (const s of result.stacks!) {
      expect(s.layers[0].kind).toBe('timber');
      expect(s.layers.some((l) => l.kind === 'block')).toBe(false);
    }
  }, 60000);

  it('joints : un trait entre deux madriers jointifs, dans le sens de leur longueur', () => {
    const j = timberJoints([[0, 0], [1000, 0], [1000, 600], [0, 600]], [1, 0], 150);
    expect(j).toHaveLength(3);
    for (const [a, b] of j) {
      expect(a[1]).toBeCloseTo(b[1], 9);
      expect(Math.abs(b[0] - a[0])).toBeCloseTo(1000, 9);
    }
    expect(j.map(([a]) => a[1])).toEqual([150, 300, 450]);
  });

  it('plans A4 (écran, fiche, plan des appuis) : madriers avec joints, légende des couches, pas d’étiquette sur le dessin', () => {
    const { result } = applied(input(450, 645, 270), 'platform-no-blocks');
    const plates = planPlates(result.checks, { remedy: result.remedy });
    const timber = plates.filter((p) => p.timber);
    expect(timber.filter((p) => p.timber!.layer === 'lower')).toHaveLength(1);
    expect(timber.filter((p) => p.timber!.layer === 'upper').length).toBe(3);
    // charge au sol répartie écrite sur la couche du dessous (moyenne et pointe), rien sur la couche du dessus
    const low = timber.find((p) => p.timber!.layer === 'lower')!;
    expect(low.label![0]).toMatch(/^moy\. [\d  ]+ kg\/m²$/);
    expect(low.label![1]).toMatch(/^maxi [\d  ]+ kg\/m²$/);
    expect(timber.filter((p) => p.timber!.layer === 'upper').every((p) => !p.label)).toBe(true);
    const legend = plates.filter((p) => p.legend).map((p) => p.legend!.text);
    expect(legend[0]).toMatch(/^Madriers C24, couche du dessous : \d+ × 100 × 200 mm, L = 6,00 m/);
    expect(legend[1]).toMatch(/^Couche du dessus : 5 × 100 × 200 mm, L = 6,\d\d m, le long de chaque rangée d’appuis \(3 rangées\)$/);
    // fiche : plan avec joints et légende, solution retenue et pose, coupe avec les madriers
    const info = { project: 'P', source: 'S', date: 'd', assumptions: [] as Array<[string, string]> };
    const fiche = groundSheetPages({ result, modules: mods, info }).map((p) => renderToStaticMarkup(p)).join('');
    expect(fiche).toContain(legend[0]);
    expect(fiche).toContain('Solution retenue : Plateau continu en grille de madriers, sans les blocs');
    expect(fiche).toContain('Pose : sol réglé et compacté');
    expect(fiche).toContain('Coupe du calage — du sol à la Viewbox');
    expect(fiche).not.toContain('Variante longrines');
    // plan des appuis au sol : la solution retenue à la place de la répartition des plaques de roulage
    const points = groundPointsPages({ modules: mods, estimate: result.estimate, roadway: result.roadway, checks: result.checks, bearingLabel: '450 kg/m²', remedy: result.remedy, info })
      .map((p) => renderToStaticMarkup(p))
      .join('');
    expect(points).toContain('2. Solution retenue : Plateau continu');
    expect(points).not.toContain('Plaques de roulage — répartition uniforme');
    expect(points).toContain(legend[1]);
    // même plan à l'écran et dans la fiche, en anglais aussi
    expect(checkPlan(result, 'en').plates.find((p) => p.legend)!.legend!.text).toMatch(/^C24 sleepers, lower layer: /);
    // figure du rapport : le même plan
    expect(calagePlanFigure(result, mods, 'fr')(0, 0, 150, 120)).toContain(legend[0]);
  }, 60000);

  it('grille par rangée : répartiteurs sous les appuis plus étroits que la grille, légende par rangée', () => {
    const { result } = applied(input(800, 243, 102), 'sleepers');
    const pieces = result.remedy!.outlines.flatMap((o) => (o.timber ? [o.timber] : []));
    const lowers = pieces.filter((p) => p.layer === 'lower');
    expect(lowers.length).toBe(3);
    expect(lowers.every((p) => p.system === 'grid' && p.row)).toBe(true);
    // chaque appui dont la surface chargée est plus étroite que la grille a ses répartiteurs, et ils sont dans sa coupe
    for (const c of result.checks) {
      const tops = pieces.filter((p) => p.layer === 'upper' && p.support === c.id);
      const stack = c.chainBase.timber!.stack;
      expect(stack.length).toBe(1 + tops.length);
    }
    const legend = timberLegend('fr', pieces).map((l) => l.text);
    expect(legend.some((t) => t.startsWith('Madriers C24, couche du dessous'))).toBe(true);
  }, 60000);

  it('plan de calage A3 : madriers avec joints, sans étiquette « TPL », décrits dans la colonne et la légende', () => {
    const { result } = applied(input(450, 645, 270), 'platform-no-blocks');
    const structure = {
      baseY: 0,
      modules: mods.map((m) => ({ level: m.level, params: { x0: 0, x1: 5900, y0: 0, y1: 2500 }, origin: [m.corners[0][0], 0, m.corners[0][1]] as [number, number, number], u: [1, 0, 0] as [number, number, number], v: [0, 0, 1] as [number, number, number] })),
    };
    const plates = calagePlates(structure as never, result, 'fr');
    const timber = plates.filter((p) => p.id.startsWith('T'));
    expect(timber.length).toBe(4);
    expect(timber.every((p) => p.noLabel && p.joints && p.joints.length > 0)).toBe(true);
    const { sheet, notes, legend, viewport } = calageSheet({ lang: 'fr', modelKey: 'm', include: [], plates, calage: result, bearing: { value: 4.4, label: 'sol' }, jacks: true, number: 'C 1' });
    const basis = viewBasis(viewport.request.view);
    const lw = outlineLinework(structure as never, basis);
    fitCalageViewport(viewport, lw, plates, basis, fitScale);
    const svg = renderToStaticMarkup(createElement(SheetSvg, { sheet, titleBlock: emptyTitleBlock(), notes, legend, viewData: () => ({ lw, basis }) }));
    expect(svg).toContain('VBX-CALAGE-MADRIERS');
    expect(svg).not.toContain('>TPL<');
    expect(svg).toContain('SOLUTION RETENUE');
    expect(legend.some((l) => l.label === 'Madriers C24 (solution retenue)')).toBe(true);
  }, 60000);

  it('plaques de roulage retenues : contour en tirets sur le plan A3', () => {
    const inp = { ...calageInput(mods, { ...DEFAULT_HYP, middleFeet: true }, { plates: [], commercial: [] }), choices: { roadway: true } };
    const result = computeCalage(inp);
    expect(result.roadwayOn).toBe(true);
    const structure = { baseY: 0, modules: [] };
    const rw = calagePlates(structure as never, result, 'fr').filter((p) => p.id.startsWith('RW'));
    expect(rw.length).toBe(result.roadwayOutline!.length);
    expect(rw.every((p) => p.dashed && p.noLabel)).toBe(true);
  });
});

// A. Pinchart 16.11.2026 : « on n'a pas la charge au sol répartie ; ça me paraît fort large pour des madriers, je
// pensais plutôt à des madriers de 10/23 cm » — la place de l'Opéra (450 kg/m²) donne un poids admis au m² (charge
// répartie), pas une pression sous le calage.
describe('madriers au choix (10 × 23 cm à plat) et charge au sol répartie', () => {
  const flat = { b: 230, h: 100 };
  const slabInput = () => ({ ...input(450, 645, 270), bearingMode: 'distributed' as const, longrine: { ...input(450, 645, 270).longrine, k: 1 } });

  it('dalle en charge répartie : 10 × 23 cm à plat, le moins de madriers dont le bois passe ; zones recalculées', () => {
    const inp = slabInput();
    const base = computeCalage(inp);
    expect(base.slab!.zones.every((z) => z.eta < 1)).toBe(true);
    const opt = sleeperOption(inp, base, { beam: flat, withBlocks: true })!;
    expect(opt.verdict).toBe('ok');
    expect(opt.eta!).toBeLessThanOrEqual(1);
    const rows = (opt.apply as Extract<AppliedRemedy, { rows: unknown }>).rows;
    expect(rows.map((r) => r.count).sort()).toEqual([1, 1, 2]);
    expect(rows.every((r) => r.beam.b === 230 && r.beam.h === 100 && r.top === null)).toBe(true);
    // la pression sous les madriers n'est qu'une information ; la charge linéique est donnée
    expect(opt.summary).toContain('information : le critère est la charge répartie de chaque zone de dalle');
    expect(opt.details.every((d) => /charge linéique ≤ [\d,]+ kN\/m/.test(d))).toBe(true);
    const applied = computeCalage({ ...inp, choices: { remedy: opt.apply as AppliedRemedy } });
    // charge répartie de chaque zone : + le poids des madriers, toujours sous 450 kg/m²
    for (const z of applied.slab!.zones) {
      const before = base.slab!.zones.find((x) => x.id === z.id)!;
      expect(z.load).toBeGreaterThan(before.load);
      expect(z.eta).toBeLessThan(1);
    }
    expect(applied.checks.every((c) => c.eta <= 1)).toBe(true);
    // coupe : le madrier à plat (10 cm) sous le bloc
    expect(applied.stacks!.every((st) => st.layers[0].kind === 'timber' && st.layers[0].thickness === 100)).toBe(true);
    // plans : charge linéique sur les madriers, zones de dalle avec leur poids au m², légende « à plat »
    const plates = checkPlan(applied).plates;
    expect(plates.filter((p) => p.timber && p.label).every((p) => /^≤ [\d,]+ kN\/m$/.test(p.label![0]))).toBe(true);
    expect(plates.some((p) => p.zone && p.label?.[0].startsWith('Dalle : '))).toBe(true);
    expect(plates.filter((p) => p.legend).map((p) => p.legend!.text).join(' ')).toContain('230 × 100 mm à plat');
    const line = timberGroundText('fr', applied.remedy!.outlines, true)!;
    expect(line).toMatch(/^Charge linéique sous les madriers : [\d,]+ kN\/m au plus/);
    const info = { project: 'P', source: 'S', date: 'd', assumptions: [] as Array<[string, string]> };
    const fiche = groundSheetPages({ result: applied, modules: mods, info }).map((p) => renderToStaticMarkup(p)).join('');
    expect(fiche).toContain(line);
    expect(fiche).toContain('Charge sur la dalle sous chaque Viewbox');
  }, 60000);

  it('sol en pression : 10 × 23 cm ne suffit pas à 450 kg/m², l’outil dit la largeur nécessaire et propose la charge répartie', () => {
    const inp = input(450, 645, 270);
    const base = computeCalage(inp);
    const opt = sleeperOption(inp, base, { beam: flat, withBlocks: true })!;
    expect(opt.verdict).toBe('fail');
    expect(opt.summary).toMatch(/^Avec des madriers 230 × 100 mm, certaines rangées ne passent pas/);
    expect(opt.details[0]).toMatch(/il faudrait au moins \d+ cm de large en pression uniforme/);
    const load = calageRemedies(inp, base).find((r) => r.key === 'load')!;
    expect(load.summary).toContain('choisir « charge répartie » à l’étape 2');
    // nombre imposé : calculé tel quel (ne passe pas), la charge au sol répartie est écrite sur le plan
    const two = sleeperOption(inp, base, { beam: flat, count: 2, withBlocks: true })!;
    expect(two.verdict).toBe('fail');
    const applied = computeCalage({ ...inp, choices: { remedy: two.apply as AppliedRemedy } });
    const g = timberGroundText('fr', applied.remedy!.outlines, false)!;
    expect(g).toMatch(/^Charge au sol répartie sous les madriers : [\d  ]+ kg\/m² en moyenne, [\d  ]+ kg\/m² au plus/);
  }, 60000);
});

// A. Pinchart 16.11.2026 : « mais du coup pourquoi laisser les blocs de 1 m / 1 m ? » — les deux variantes côte à côte.
describe('madriers au choix : avec et sans les blocs dessinés', () => {
  it('dalle en charge répartie (blocs IKEA 24 cm, 102,5 kg) : sans les blocs = moins de charge sur la dalle, conseillée', async () => {
    const { sleeperVariants } = await import('../../src/structure/core/sleeperCompare');
    const realBlocks = nine(243, 102.5);
    const inp = { ...input(450, 243, 102.5), blocks: realBlocks, bearingMode: 'distributed' as const };
    const base = computeCalage(inp);
    const v = sleeperVariants(inp, base, { beam: { b: 230, h: 100 } });
    expect(v.map((x) => x.withBlocks)).toEqual([false, true]);
    const [without, withB] = v;
    expect(without.ok && withB.ok).toBe(true);
    // les blocs n'aident pas la dalle : leur poids en plus
    expect(withB.slabQ!).toBeGreaterThan(without.slabQ!);
    expect(withB.packingKg - without.packingKg).toBeGreaterThan(9 * 102.5 - 20);
    // ils surélèvent : ≈ 24 cm de plus
    expect(withB.height - without.height).toBeCloseTo(243, 0);
    expect(without.recommended).toBe(true);
    expect(withB.recommended).toBeUndefined();
    // la variante retenue = celle appliquée au calage
    expect(computeCalage({ ...inp, choices: { remedy: without.remedy.apply as AppliedRemedy } }).slab!.zones.map((z) => z.q)).toEqual(without.result!.slab!.zones.map((z) => z.q));
  }, 60000);

  it('sans blocs dans le modèle : une seule variante, pas de « conseillée »', async () => {
    const { sleeperVariants } = await import('../../src/structure/core/sleeperCompare');
    const inp = { ...calageInput(mods, { ...DEFAULT_HYP, bearingValue: 450, bearingUnit: 'kg/m²' as const, middleFeet: true }, { plates: [], commercial: [] }, true), bearingMode: 'distributed' as const };
    const v = sleeperVariants(inp, computeCalage(inp), { beam: { b: 230, h: 100 } });
    expect(v).toHaveLength(1);
    expect(v[0].withBlocks).toBe(true);
    expect(v[0].recommended).toBeUndefined();
    expect(v[0].remedy.title).toBe('Grille de madriers C24 sous chaque rangée d’appuis');
  }, 60000);
});
