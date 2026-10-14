// Symboles d'équipement sur les planches (prises, éclairage, tableau…) : orientation vers le mur, attache à la vue,
// rendu, légende comptée, déplacement / copier-coller, export DXF (un calque par corps d'état, vue en grandeur réelle)
// et PDF vectoriel. SYMBOLS_SVG=/chemin.svg garde la planche de démonstration (tous les symboles).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SheetSvg, itemBox, symbolAnchor } from '../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../src/sheets/types';
import type { DrawingSet, Sheet, SymbolItem, SymbolLegendItem, ViewportItem } from '../src/sheets/types';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import type { Linework2D } from '../src/linework/types';
import type { Vec3 } from '../src/core/views';
import { SYMBOLS, SYMBOL_FAMILIES, alongWall, linearShape, orientToWall, symbolCounts } from '../src/sheets/symbols';
import { sheetDxf } from '../src/sheets/dxf/export';
import { parsePath } from '../src/sheets/dxf/svgToDxf';
import { actions, useEditor } from '../src/sheets/store';
import { FONT_FILE, buildPdf, fontsUsed } from '../src/sheets/pdf/pdf';
import type { FontFiles, FontKey } from '../src/sheets/pdf/pdf';

const proto = (globalThis as unknown as { SVGElement: { prototype: Record<string, unknown> } }).SVGElement.prototype;
proto.getBBox ??= function (this: Element) {
  const size = parseFloat(this.getAttribute('font-size') ?? '16');
  return { x: 0, y: 0, width: (this.textContent ?? '').length * size * 0.5, height: size };
};
(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: () => null } } }).HTMLCanvasElement.prototype.getContext = () => null;

const basis = { right: [1, 0, 0] as Vec3, up: [0, 0, -1] as Vec3, toward: [0, 1, 0] as Vec3 };
// plan d'une Viewbox 5900 × 2500 (repère du dessin, mm)
const lw: Linework2D = {
  boundsMm: { minX: 0, minY: 0, maxX: 5900, maxY: 2500 },
  layers: [{ key: 'silhouette', polylines: [Float64Array.from([0, 0, 5900, 0, 5900, 2500, 0, 2500, 0, 0])] }],
  snapPoints: new Float64Array(),
  meta: { provider: 't', durationMs: 0, segmentCount: 4, cacheKey: '', basis, objectCount: 1 },
};
const vp: ViewportItem = {
  id: 'v1',
  type: 'viewport',
  rect: { x: 40, y: 80, w: 400, h: 300 },
  request: { modelId: 'k', subset: { include: [] }, view: { kind: 'top', frame: 'world' }, style: DEFAULT_LINE_STYLE },
  scale: 25,
  center: [2950, 1250],
  label: 'Top side',
  showLabel: true,
  renderStyle: 'trait',
};
const viewData = () => ({ lw, basis });

describe('symboles : catalogue et géométrie', () => {
  it('catalogue : clés uniques, chaque corps d’état représenté, libellés FR / EN / DE, tracés lisibles par le DXF', () => {
    expect(new Set(SYMBOLS.map((s) => s.key)).size).toBe(SYMBOLS.length);
    for (const f of SYMBOL_FAMILIES) expect(SYMBOLS.some((s) => s.family === f.key)).toBe(true);
    for (const s of SYMBOLS) {
      expect(s.label.fr && s.label.en && s.label.de).toBeTruthy();
      for (const d of [...s.strokes, ...(s.fills ?? [])]) {
        const subs = parsePath(d);
        expect(subs.length).toBeGreaterThan(0);
        // tout reste dans la boîte 10 × 10 (± 0,1)
        for (const p of subs) for (const v of p.pts) expect(Math.abs(v)).toBeLessThanOrEqual(5.1);
      }
      if (s.linear) expect(linearShape(s.key, 50, 4.5).strokes.length).toBeGreaterThan(0);
      else expect(s.strokes.length).toBeGreaterThan(0);
    }
  });

  it('un symbole mural se tourne vers le mur le plus proche et vient le toucher', () => {
    const size = 4;
    // mur horizontal en dessous du clic : pas de rotation, le bas du symbole touche le mur
    const below = orientToWall({ x: 10, y: 10 }, [[0, 12, 20, 12]], 5, size)!;
    expect(below.rotation).toBe(0);
    expect(below.at.x).toBeCloseTo(10);
    expect(below.at.y).toBeCloseTo(10);
    // mur à droite : le bas (0, 1) tourné de 270° pointe vers +x
    const right = orientToWall({ x: 10, y: 10 }, [[13, 0, 13, 20]], 5, size)!;
    expect(right.rotation).toBe(270);
    expect(right.at.x).toBeCloseTo(11);
    // mur au-dessus : retourné
    expect(orientToWall({ x: 10, y: 10 }, [[0, 7, 20, 7]], 5, size)!.rotation).toBe(180);
    // le plus proche gagne ; trop loin : rien
    expect(orientToWall({ x: 10, y: 10 }, [[0, 7, 20, 7], [0, 11, 20, 11]], 5, size)!.rotation).toBe(0);
    expect(orientToWall({ x: 10, y: 10 }, [[0, 30, 20, 30]], 5, size)).toBeNull();
  });

  it('un symbole linéaire se pose le long du trait, décalé du côté du clic', () => {
    const a = alongWall({ x: 10, y: 9 }, [[0, 10, 30, 10]], 5, 1.5)!;
    expect(a.rotation).toBe(0);
    expect(a.at.y).toBeCloseTo(8.5);
    const v = alongWall({ x: 9, y: 10 }, [[10, 30, 10, 0]], 5, 1)!;
    expect(v.rotation).toBe(90);
    expect(v.at.x).toBeCloseTo(9);
  });

  it('légende : symboles posés comptés, dans l’ordre du catalogue', () => {
    expect(symbolCounts(['spot', 'prise-2pt', 'spot', 'tableau']).map((r) => [r.def.key, r.count])).toEqual([
      ['prise-2pt', 1],
      ['spot', 2],
      ['tableau', 1],
    ]);
  });
});

function demoSheet(): Sheet {
  const items: Sheet['items'] = [vp];
  // tous les symboles en grille hors de la vue (fixes sur la planche) + 3 symboles attachés à la vue
  SYMBOLS.forEach((s, i) => items.push({ id: `y${i}`, type: 'symbol', symbol: s.key, at: { x: 470 + (i % 4) * 55, y: 90 + Math.floor(i / 4) * 12 }, ...(s.note ? { note: s.note } : {}), ...(s.linear ? { length: s.length } : {}) }));
  items.push({ id: 'a1', type: 'symbol', symbol: 'prise-2pt', viewportId: 'v1', model: [1000, 120], at: { x: 0, y: 0 }, note: 'C1', heightMm: 1100 });
  items.push({ id: 'a2', type: 'symbol', symbol: 'point-lumineux', viewportId: 'v1', model: [2950, 1250], at: { x: 0, y: 0 } });
  items.push({ id: 'a3', type: 'symbol', symbol: 'reglette', viewportId: 'v1', model: [2950, 2380], at: { x: 0, y: 0 }, length: 2400 });
  items.push({ id: 'g1', type: 'symbolLegend', rect: { x: 40, y: 420, w: 120, h: 150 }, lang: 'fr', counts: true } satisfies SymbolLegendItem);
  return { id: 's1', number: 'A0.5', title: 'Electrical layout', paper: 'A1', orientation: 'landscape', kind: 'standard', items };
}

describe('symboles sur une planche', () => {
  const sheet = demoSheet();
  const markup = renderToStaticMarkup(createElement(SheetSvg, { sheet, titleBlock: emptyTitleBlock(), notes: '', legend: [], viewData }));
  if (process.env.SYMBOLS_SVG) writeFileSync(process.env.SYMBOLS_SVG, markup);

  it('attaché à la vue : suit le point du dessin (échelle, cadrage)', () => {
    const a1 = sheet.items.find((i) => i.id === 'a1') as SymbolItem;
    // centre de la vue (240, 230) ; (1000 − 2950) / 25 = −78 ; y : −(120 − 1250) / 25 = +45,2
    const p = symbolAnchor(a1, sheet, viewData);
    expect(p.x).toBeCloseTo(162);
    expect(p.y).toBeCloseTo(275.2);
    const moved = { ...sheet, items: sheet.items.map((i) => (i.id === 'v1' ? { ...vp, scale: 50, rect: { ...vp.rect, x: 140 } } : i)) };
    const q = symbolAnchor(a1, moved, viewData);
    expect(q.x).toBeCloseTo(340 - 39);
    expect(q.y).toBeCloseTo(230 + 22.6);
    // la réglette : sa longueur réelle suit l'échelle (2 400 mm à 1:25 = 96 mm de papier)
    const r = itemBox(sheet.items.find((i) => i.id === 'a3')!, sheet, viewData);
    expect(r.w).toBeGreaterThan(96);
    expect(r.w).toBeLessThan(100);
  });

  it('rendu : un calque DXF par corps d’état, texte et hauteur, légende comptée', () => {
    expect(markup).toContain('data-dxf="VBX-SYMB-PRISES"');
    expect(markup).toContain('data-dxf="VBX-SYMB-ECLAIRAGE"');
    expect(markup).toContain('data-dxf="VBX-SYMB-LEGENDE"');
    expect(markup).toContain('>C1<');
    expect(markup).toContain('>h 1,10 m<');
    expect(markup).toContain('LÉGENDE DES ÉQUIPEMENTS');
    expect(markup).toContain('Prise 2P+T 16 A');
    // 1 prise dans la grille + 1 sur la vue
    expect(markup).toMatch(/Prise 2P\+T 16 A<\/text><text[^>]*>× 2</);
    // les symboles attachés à la vue sont repérés pour le DXF en grandeur réelle
    expect((markup.match(/data-vp="v1"/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('DXF : symboles sur leurs calques ; en grandeur réelle, seuls ceux de la vue', () => {
    const paper = sheetDxf(sheet, markup, 'paper', () => true, 'X')!;
    for (const f of SYMBOL_FAMILIES) expect(paper.dxf).toContain(`\n8\n${f.dxf}\n`);
    expect(paper.dxf).toContain('\n8\nVBX-SYMB-LEGENDE\n');
    expect(paper.dxf).toContain('\nHATCH\n'); // parties pleines (tableau, prise 32 A…)
    const real = sheetDxf(sheet, markup, 'real', () => true, 'X')!;
    expect(real.dxf).toContain('\n8\nVBX-SYMB-PRISES\n');
    expect(real.dxf).not.toContain('\n8\nVBX-SYMB-LEGENDE\n');
    expect(real.dxf).not.toContain('\n8\nVBX-SYMB-SECURITE\n'); // la grille hors vue n'y est pas
  });

  it('PDF : une page vectorielle, polices intégrées, sans image', async () => {
    const keys = fontsUsed([markup]);
    expect(keys).toContain('Arimo-normal');
    const files: FontFiles = {};
    for (const k of keys) {
      const [family, variant] = k.split('-') as ['Gelasio' | 'Arimo', keyof typeof FONT_FILE];
      const b = readFileSync(join(__dirname, '../src/sheets/pdf/fonts', `${family}-${FONT_FILE[variant]}.ttf`));
      files[k as FontKey] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
    }
    const pdf = await buildPdf([{ paper: 'A1', svg: markup }], files, { title: 'Symboles' });
    const text = new TextDecoder('latin1').decode(new Uint8Array(pdf.output('arraybuffer')));
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBe(1);
    expect(text).not.toMatch(/\/Subtype \/Image/);
  });
});

describe('symboles dans l’éditeur', () => {
  const doc = (): DrawingSet => ({
    id: 'd',
    projectId: 'p',
    modelVersionId: null,
    modelKey: 'k',
    title: 'Jeu',
    templateId: 'viewbox',
    titleBlock: emptyTitleBlock(),
    notes: '',
    sheets: [demoSheet(), { ...demoSheet(), id: 's2', number: 'A0.6', items: [] }],
    revision: 0,
    updatedAt: '',
  });
  const items = (id = 's1') => useEditor.getState().doc!.sheets.find((s) => s.id === id)!.items;

  it('déplacer un symbole attaché déplace son point du dessin (mm modèle)', () => {
    useEditor.getState().load(doc());
    useEditor.getState().setSheet('s1');
    actions.moveItems(['a1'], 4, -2);
    const a1 = items().find((i) => i.id === 'a1') as SymbolItem;
    expect(a1.model).toEqual([1100, 170]);
    // supprimer la vue supprime ses symboles, pas les autres
    actions.deleteItems(['v1']);
    expect(items().some((i) => i.id === 'a1')).toBe(false);
    expect(items().some((i) => i.id === 'y0')).toBe(true);
  });

  it('coller sur une autre planche sans la vue : fixé sur la planche', () => {
    useEditor.getState().load(doc());
    useEditor.getState().setSheet('s1');
    actions.copy(['a1']);
    useEditor.getState().setSheet('s2');
    actions.paste();
    const pasted = items('s2').find((i) => i.type === 'symbol') as SymbolItem;
    expect(pasted.viewportId).toBeUndefined();
    expect(pasted.model).toBeUndefined();
    expect(pasted.note).toBe('C1');
  });
});
