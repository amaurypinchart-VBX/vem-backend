// Niveaux du sol relevés sous les pieds (mm, relatifs) : saisie, association aux pieds par leur position, rattrapage
// (référence = point le plus haut), sortie de vérin et cales en plus, pente ; repères ▽ et bloc de texte du plan de
// calage A3 (plans 2D), colonnes du plan des appuis au sol.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { computeCalage } from '../../src/structure/core/calage';
import { gridModules } from '../../src/structure/core/estimate';
import { formatLevel, levelAt, levelSurvey, parseLevel, withLevel } from '../../src/structure/core/groundLevels';
import { calageLevelMarks, calagePlates, calageSheet, fitCalageViewport, outlineLinework } from '../../src/structure/report/calagePlan';
import { groundPointsPages } from '../../src/structure/report/groundPoints';
import { compactModuleIds } from '../../src/structure/report/groundSheet';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import { levelOrder } from '../../src/ui/structure/GroundLevels';
import { SheetSvg } from '../../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../../src/sheets/types';
import { fitScale } from '../../src/sheets/scales';
import { viewBasis } from '../../src/core/views';
import { sheetMarkupToDxf } from '../../src/sheets/dxf/svgToDxf';
import { PAPER_MM } from '../../src/sheets/template';

describe('niveaux du sol : saisie', () => {
  it('« −15 », « -15 », « +8 », « 12,4 mm », vide, texte invalide', () => {
    expect(parseLevel('−15')).toBe(-15);
    expect(parseLevel(' -15 ')).toBe(-15);
    expect(parseLevel('+8')).toBe(8);
    expect(parseLevel('12,4 mm')).toBe(12);
    expect(parseLevel('0')).toBe(0);
    expect(parseLevel('')).toBeUndefined();
    expect(parseLevel('abc')).toBeNaN();
    expect(formatLevel(0)).toBe('±0');
    expect(formatLevel(-15)).toBe('−15');
    expect(formatLevel(7)).toBe('+7');
  });

  it('un relevé par pied, retrouvé par sa position (± 150 mm), remplacé ou effacé', () => {
    let lv = withLevel([], [1000, 2000], -15);
    lv = withLevel(lv, [5000, 2000], 0);
    expect(levelAt(lv, [1040, 1980])).toBe(-15);
    expect(levelAt(lv, [1400, 2000])).toBeUndefined();
    lv = withLevel(lv, [1010, 2000], -12);
    expect(lv).toHaveLength(2);
    expect(levelAt(lv, [1000, 2000])).toBe(-12);
    lv = withLevel(lv, [1000, 2000], undefined);
    expect(lv).toHaveLength(1);
  });
});

describe('niveaux du sol : rattrapage', () => {
  const pts = [
    { id: 'P1', position: [0, 0] as [number, number], jack: true },
    { id: 'P2', position: [5900, 0] as [number, number], jack: true },
    { id: 'P3', position: [5900, 2500] as [number, number], jack: true },
    { id: 'P4', position: [0, 2500] as [number, number], jack: true },
  ];

  it('référence = point le plus haut ; rehausse = référence − niveau ; vérin jusqu’à 50 mm puis cales', () => {
    const lv = [
      { x: 0, y: 0, level: 0 },
      { x: 5900, y: 0, level: -15 },
      { x: 5900, y: 2500, level: -70 },
    ];
    const s = levelSurvey(pts, lv, 50);
    expect(s.known).toBe(3);
    expect(s.ref).toBe(0);
    expect(s.refIds).toEqual(['P1']);
    expect(s.spread).toBe(70);
    expect(s.rows.map((r) => r.makeUp)).toEqual([0, 15, 70, undefined]);
    expect(s.rows[2]).toMatchObject({ jackOut: 50, shims: 20 });
    expect(s.overJack).toEqual(['P3']);
    // pente la plus forte : P2 → P3, 55 mm sur 2,5 m = 2,2 %
    expect(s.slope!.pct).toBeCloseTo(2.2, 6);
    expect([s.slope!.a, s.slope!.b]).toEqual(['P2', 'P3']);
    expect(s.notes.join(' ')).toContain('1 pied(s) sans relevé');
    expect(s.notes.join(' ')).toContain('P3');
  });

  it('sans relevé : rien ; sans vérin : pas de sortie de tige', () => {
    expect(levelSurvey(pts, []).known).toBe(0);
    const s = levelSurvey(
      pts.map((p) => ({ ...p, jack: false })),
      [
        { x: 0, y: 0, level: 0 },
        { x: 0, y: 2500, level: -10 },
      ],
    );
    expect(s.rows[3]).toMatchObject({ makeUp: 10 });
    expect(s.rows[3].jackOut).toBeUndefined();
    expect(s.overJack).toEqual([]);
  });
});

describe('niveaux du sol : calage, plan A3 et plan des appuis', () => {
  const modules = gridModules(2, 1, [[1, 1]], false);
  const base = calageInput(modules, DEFAULT_HYP, { plates: [], commercial: [] }, true);
  const plain = computeCalage(base);
  const pts = levelOrder(plain.estimate.reactions, modules);
  // relevé : 0 au premier pied (en bas à gauche), puis −5 mm par pied ; le dernier pied sans relevé
  let levels = pts.slice(0, -1).reduce((acc, r, k) => withLevel(acc, r.group.position, -5 * k), [] as ReturnType<typeof withLevel>);
  const cal = computeCalage({ ...calageInput(modules, { ...DEFAULT_HYP, groundLevels: levels }, { plates: [], commercial: [] }, true), jackMax: 50 });

  it('le calage porte le relevé : rattrapage par pied, vérins au-delà de 50 mm', () => {
    expect(plain.levels).toBeNull();
    const s = cal.levels!;
    expect(s.known).toBe(pts.length - 1);
    expect(s.ref).toBe(0);
    expect(s.refIds).toEqual([pts[0].group.id]);
    const last = s.rows.find((r) => r.id === pts[pts.length - 2].group.id)!;
    expect(last.makeUp).toBe(5 * (pts.length - 2));
    expect(s.overJack.length).toBe(pts.slice(0, -1).filter((_, k) => 5 * k > 50).length);
    // ordre de saisie : rangée du bas d'abord, de gauche à droite
    expect(pts[0].group.position[0]).toBeLessThan(pts[1].group.position[0]);
  });

  it('plan de calage A3 : repères ▽ avec niveau et rehausse, bloc « NIVEAUX DU SOL » ; DXF sur son calque', () => {
    const s = { baseY: 0, modules: [] };
    const marks = calageLevelMarks(s, cal);
    expect(marks).toHaveLength(pts.length - 1);
    const mark = (k: number) => marks.find((m) => m.id === pts[k].group.id)!;
    expect(mark(0)).toMatchObject({ text: '±0', color: '#15803d' });
    expect(mark(2)).toMatchObject({ text: '−10', sub: '↑10' });
    const plates = calagePlates(s, cal, 'fr');
    const { sheet, notes, legend, viewport } = calageSheet({ lang: 'fr', modelKey: 'm', include: [], plates, levels: marks, calage: cal, bearing: { value: 200, label: 'prairie' }, jacks: true, number: 'C 1' });
    expect(viewport.overlays?.levels).toHaveLength(marks.length);
    // numéros des Viewbox sur le plan de calage (surcouche du moteur de planches)
    expect(viewport.overlays?.moduleNumbers).toBe(true);
    expect(compactModuleIds(['VBX-04', 'VBX-01'])).toBe('VBX-01/04');
    const txt = sheet.items.filter((i) => i.type === 'text').map((i) => (i as { text: string }).text).join(' ');
    expect(txt).toContain('NIVEAUX DU SOL (RELEVÉ)');
    expect(txt).toContain('Référence = point le plus haut');
    expect(txt).toContain('1 pied sans relevé');
    // allemand / anglais
    const de = calageSheet({ lang: 'de', modelKey: 'm', include: [], plates, levels: marks, calage: cal, bearing: null, jacks: true, number: 'C 1' }).sheet;
    expect(de.items.map((i) => (i as { text?: string }).text ?? '').join(' ')).toContain('BODENHÖHEN');
    // rendu : la vue de dessus est le contour des Viewbox (sans moteur 2D)
    const structure = { baseY: 0, modules: modules.map((m) => ({ level: 0, params: { x0: 0, x1: 5900, y0: 0, y1: 2500 }, origin: [m.corners[0][0], 0, m.corners[0][1]] as [number, number, number], u: [1, 0, 0] as [number, number, number], v: [0, 0, 1] as [number, number, number] })) };
    const basis = viewBasis(viewport.request.view);
    const lw = outlineLinework(structure as never, basis);
    fitCalageViewport(viewport, lw, plates, basis, fitScale);
    const svg = renderToStaticMarkup(createElement(SheetSvg, { sheet, titleBlock: emptyTitleBlock(), notes, legend, viewData: () => ({ lw, basis }) }));
    expect(svg).toContain('data-dxf="VBX-NIVEAUX"');
    expect(svg).toContain('>±0<');
    expect(svg).toContain('>↑10<');
    const dxf = sheetMarkupToDxf(svg, { paper: PAPER_MM.A3, mode: 'paper' }).dxf;
    expect(dxf).toMatch(/\n8\nVBX-NIVEAUX\n/);
    expect(dxf).toContain('\n1\n−10\n');
  });

  it('plan des appuis au sol : colonnes « Niv. (mm) » et « ↑ », légende du relevé', () => {
    const pages = groundPointsPages({
      modules,
      estimate: cal.estimate,
      roadway: cal.roadway,
      info: { project: 'P', source: 's', date: 'd', assumptions: [] },
      bearingLabel: '200 kN/m²',
      checks: cal.checks,
      levels: cal.levels,
    }).map((p) => renderToStaticMarkup(p));
    const all = pages.join('');
    expect(all).toContain('Niv. (mm)');
    expect(all).toContain('>−10<');
    expect(all).toContain('Triangle : niveau du sol relevé');
    // sans relevé : pas de colonne
    const none = groundPointsPages({ modules, estimate: plain.estimate, roadway: plain.roadway, info: { project: 'P', source: 's', date: 'd', assumptions: [] }, bearingLabel: '', checks: plain.checks, levels: plain.levels })
      .map((p) => renderToStaticMarkup(p))
      .join('');
    expect(none).not.toContain('Niv. (mm)');
    levels = [];
  });
});
