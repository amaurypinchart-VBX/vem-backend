// Planches : échelles, génération du jeu de plans (gabarits), historique annuler / rétablir, cartouche, rendu SVG.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STANDARD_SCALES, fitScale, viewportTransform } from '../src/sheets/scales';
import { generateDrawingSet, renumber } from '../src/sheets/generate';
import { titleBlockFromProject } from '../src/sheets/titleBlock';
import { actions, useEditor } from '../src/sheets/store';
import { SheetSvg, wrapText } from '../src/sheets/SheetSvg';
import { emptyTitleBlock, hasRect } from '../src/sheets/types';
import type { Sheet, ViewportItem } from '../src/sheets/types';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import type { SceneIndex } from '../src/core/types';
import { moduleNumber } from '../src/sheets/overlays';
import { ingest } from '../src/ingest/pipeline';
import { inlineRunner } from '../src/ingest/cleanup';
import { DEFAULT_RULES } from '../src/core/classification';
import { makeSketchupDae } from './fixtures/sketchupDae';

async function fixtureIndex(): Promise<SceneIndex> {
  const dae = makeSketchupDae({ twoSided: false });
  const buf = new TextEncoder().encode(dae);
  const res = await ingest({ fileName: 'test.dae', data: buf.buffer as ArrayBuffer, sha256: 'x', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  return res.index;
}

describe('échelles', () => {
  it('plus grande échelle normalisée qui tient dans le cadre', () => {
    // 17 800 × 3 700 mm dans 685 × 228 mm (marges 4 mm) → 1:50 (356 × 74 mm) ; 1:25 serait trop grand
    expect(fitScale({ minX: 0, minY: 0, maxX: 17800, maxY: 3700 }, { w: 685, h: 228 })).toBe(50);
    expect(fitScale({ minX: 0, minY: 0, maxX: 5902, maxY: 3178 }, { w: 325, h: 170 })).toBe(20);
    expect(STANDARD_SCALES).toContain(25);
    const t = viewportTransform({ x: 100, y: 100, w: 200, h: 100 }, 50, [1000, 500]);
    expect(t.toPaper(1000, 500)).toEqual({ x: 200, y: 150 });
    expect(t.toPaper(1500, 1000)).toEqual({ x: 210, y: 140 }); // y du dessin vers le haut
    expect(t.toModel(210, 140)).toEqual([1500, 1000]);
  });
});

describe('génération du jeu de plans', () => {
  it('reproduit le jeu Viewbox : couverture A0.0, 4 vues, élévations, implantation, une planche par Viewbox', async () => {
    const index = await fixtureIndex();
    const modules = index.modules.map((m) => m.id);
    const { set, captures } = generateDrawingSet(
      { modules, kinds: ['cover', 'fourViews', 'longSides', 'shortSides', 'implantation', 'perModule'], paper: 'A1', style: DEFAULT_LINE_STYLE, title: 'Test' },
      { index, projectId: 'p1', modelVersionId: 'm1', modelKey: 'k', titleBlock: emptyTitleBlock() },
    );
    expect(set.sheets.map((s) => s.number)).toEqual(Array.from({ length: 5 + modules.length }, (_, i) => `A0.${i}`));
    expect(set.sheets[0].kind).toBe('cover');
    const four = set.sheets[1];
    expect(four.items.map((i) => (i as ViewportItem).label)).toEqual(['Long side', 'Top side', 'Short side', '3D']);
    // vues de l'ensemble : repère du monde ; planche par Viewbox : repère de la Viewbox, dessus sans toit
    const perModule = set.sheets[5];
    const vps = perModule.items.filter((i): i is ViewportItem => i.type === 'viewport');
    expect(vps.map((v) => v.request.view.kind)).toEqual(['front', 'back', 'top', 'left', 'right']);
    expect(vps.every((v) => v.request.view.kind !== 'custom' && typeof v.request.view.frame === 'object')).toBe(true);
    expect(vps.find((v) => v.request.view.kind === 'top')!.request.subset.hideCategories).toEqual(['TOIT']);
    const impl = set.sheets[4].items[0] as ViewportItem;
    expect(impl.request.subset.onlyCategories).toEqual(['PIED']);
    expect(impl.overlays?.moduleOutlines).toBe(true);
    // images 3D : 4 sur la couverture, 1 sur les 4 vues, 1 par Viewbox
    expect(captures.length).toBe(4 + 1 + modules.length);
    // tout est dans la feuille A1
    for (const s of set.sheets)
      for (const it of s.items)
        if (hasRect(it)) {
          expect(it.rect.x).toBeGreaterThanOrEqual(0);
          expect(it.rect.x + it.rect.w).toBeLessThanOrEqual(841);
          expect(it.rect.y + it.rect.h).toBeLessThanOrEqual(594);
        }
  });

  it('A3 : même gabarit à l’échelle', async () => {
    const index = await fixtureIndex();
    const { set } = generateDrawingSet(
      { modules: [index.modules[0].id], kinds: ['perModule'], paper: 'A3', style: DEFAULT_LINE_STYLE, title: 'T' },
      { index, projectId: 'p1', modelVersionId: null, modelKey: 'k', titleBlock: emptyTitleBlock() },
    );
    const s = set.sheets[0];
    expect(s.number).toBe('A0.1');
    for (const it of s.items) if (hasRect(it)) expect(it.rect.x + it.rect.w).toBeLessThanOrEqual(420);
  });
});

describe('éditeur : historique', () => {
  it('annuler / rétablir, copier / coller, renumérotation', () => {
    const sheet: Sheet = { id: 's1', number: 'A0.1', title: 'T', paper: 'A1', orientation: 'landscape', kind: 'standard', items: [] };
    useEditor.getState().load({
      id: 'd',
      projectId: 'p',
      modelVersionId: null,
      modelKey: 'k',
      title: 'Jeu',
      templateId: 'viewbox',
      titleBlock: emptyTitleBlock(),
      notes: '',
      sheets: [sheet],
      revision: 0,
      updatedAt: '',
    });
    actions.addItems([{ id: 't1', type: 'text', rect: { x: 10, y: 10, w: 50, h: 10 }, text: 'A', size: 4 }]);
    actions.moveItems(['t1'], 5, 7);
    const pos = () => (useEditor.getState().doc!.sheets[0].items[0] as { rect: { x: number; y: number } }).rect;
    expect(pos()).toMatchObject({ x: 15, y: 17 });
    useEditor.getState().undo();
    expect(pos()).toMatchObject({ x: 10, y: 10 });
    useEditor.getState().redo();
    expect(pos()).toMatchObject({ x: 15, y: 17 });
    actions.copy(['t1']);
    actions.paste();
    expect(useEditor.getState().doc!.sheets[0].items.length).toBe(2);
    expect(useEditor.getState().selection.length).toBe(1);
    actions.duplicateSheet('s1');
    expect(useEditor.getState().doc!.sheets.map((s) => s.number)).toEqual(['A0.1', 'A0.2']);
    useEditor.getState().undo();
    useEditor.getState().undo();
    expect(useEditor.getState().doc!.sheets[0].items.length).toBe(1);
    expect(useEditor.getState().doc!.sheets.length).toBe(1);
    const sheets = [{ ...sheet, kind: 'cover' as const }, sheet];
    renumber(sheets);
    expect(sheets.map((s) => s.number)).toEqual(['A0.0', 'A0.1']);
  });
});

describe('cartouche et rendu', () => {
  it('pré-remplit le cartouche depuis le projet VEM', () => {
    const tb = titleBlockFromProject(
      {
        id: 'p',
        name: 'NVIDIA Hospitality Berlin',
        internalNumber: '6066RNVIDVIE',
        address: 'Messedamm 22',
        city: 'Berlin',
        installationStart: '2026-10-05T00:00:00Z',
        client: { name: 'Image Construction Messe- und Eventbau GmbH' },
        technicalManager: { id: 'u1', firstName: 'Amaury', lastName: 'Pinchart', email: 'amaury@x.com' },
        team: [{ role: 'sales_engineer', user: { id: 'u2', firstName: 'Norick', lastName: 'Palm', email: 'norick@x.com' } }],
      },
      { id: 'u1', firstName: 'Amaury', lastName: 'Pinchart' },
      new Date('2026-09-25T10:00:00Z'),
    );
    expect(tb.client).toContain('Image Construction');
    expect(tb.address).toBe('Messedamm 22, Berlin');
    expect(tb.projectNumber).toBe('6066RNVIDVIE');
    expect(tb.projectDate).toBe('05 / 10 / 2026');
    expect(tb.salesEngineer).toEqual({ name: 'Norick Palm', email: 'norick@x.com' });
    expect(tb.technicalManager.name).toBe('Amaury Pinchart');
    expect(tb.createdDate).toBe('25 / 09 / 2026');
  });

  it('SVG de planche : A1 exact, gabarit, cartouche, légende, vectoriel', () => {
    const sheet: Sheet = { id: 's1', number: 'A0.1', title: 'Extract - Plan View - Test', paper: 'A1', orientation: 'landscape', kind: 'standard', items: [] };
    const tb = { ...emptyTitleBlock(), client: 'Client X', projectName: 'Projet Y' };
    const svg = renderToStaticMarkup(
      createElement(SheetSvg, { sheet, titleBlock: tb, notes: 'Note 1', legend: [{ key: 'VITRE-SEAMLESS', label: 'Windows Seamless', color: '#1030FF' }], viewData: () => undefined }),
    );
    expect(svg).toContain('width="841mm"');
    expect(svg).toContain('height="594mm"');
    for (const t of ['CLIENT', 'Client X', 'Projet Y', 'GENERAL NOTES VIEWBOX', 'DRAWING LEGEND', 'Windows Seamless', 'A0.1', 'Extract - Plan View - Test', 'Signature'])
      expect(svg).toContain(t);
    expect(svg).not.toContain('<image');
    expect(wrapText('un deux trois quatre cinq six', 32, 4)).toEqual(['un deux trois', 'quatre cinq six']);
    expect(moduleNumber('VBX-07')).toBe('7');
  });

  it('les logos sont des tracés vectoriels', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'sheets', 'logos.ts'), 'utf8');
    expect(src).toContain('VB_LOGO');
    expect(src).not.toMatch(/data:image|\.png/);
  });
});
