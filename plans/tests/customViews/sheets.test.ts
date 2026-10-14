// VS6 — vues spéciales sur les planches (pur) : grille des fenêtres dans la zone de dessin, une planche / une par bloc /
// mosaïque, échelle imposée ou ajustée, titre, repères A–A sur les vues en plan (sans doublon), niveaux sur les
// élévations, vues spéciales jamais modifiées.
import { describe, expect, it } from 'vitest';
import { makeLookup } from '../../src/core/subset';
import { makeTagResolver } from '../../src/core/customViews/tags';
import { moduleRefs } from '../../src/core/customViews/refs';
import { cutLevels, sectionMarks } from '../../src/core/customViews/marks';
import { VIEW_PRESETS, specFromPreset } from '../../src/core/customViews/presets';
import { addCustomSheets, customViewSheets, gridRects } from '../../src/sheets/customSheets';
import type { CustomBlockInfo } from '../../src/sheets/customSheets';
import { DRAW_AREA } from '../../src/sheets/template';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';
import type { Linework2D } from '../../src/linework/types';
import type { DrawingSet, ViewportItem } from '../../src/sheets/types';
import { emptyTitleBlock } from '../../src/sheets/types';
import { fakeScene } from './helpers';

const lw = (w: number, h: number): Linework2D => ({
  boundsMm: { minX: 0, minY: 0, maxX: w, maxY: h },
  layers: [{ key: 'cut', polylines: [Float64Array.from([0, 0, w, 0, w, h, 0, h, 0, 0])] }],
  snapPoints: new Float64Array(),
  meta: { provider: 't', durationMs: 0, segmentCount: 1, cacheKey: '', basis: { right: [1, 0, 0], up: [0, 0, -1], toward: [0, 1, 0] }, objectCount: 1 },
});
const block = (key: string, title: string, w = 5900, h = 2500): CustomBlockInfo => ({ key, title, modules: [title], lw: lw(w, h), basis: lw(1, 1).meta.basis, view: { kind: 'top', frame: 'world' } });
const opts = { paper: 'A1' as const, mode: 'one' as const, perSheet: 4, scale: 50, blocks: [], subtitle: 'Vue de dessous (miroir du plan)', style: DEFAULT_LINE_STYLE, modelKey: 'k', dims: false };
const deps = { include: () => [] };

describe('planches de vue spéciale', () => {
  it('grille dans la zone de dessin, place pour les titres', () => {
    for (const n of [1, 2, 4, 6]) {
      const rects = gridRects(n, 'A1');
      expect(rects).toHaveLength(n);
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(DRAW_AREA.x);
        expect(r.y).toBeGreaterThan(DRAW_AREA.y + 15);
        expect(r.x + r.w).toBeLessThanOrEqual(DRAW_AREA.x + DRAW_AREA.w);
        expect(r.y + r.h).toBeLessThanOrEqual(DRAW_AREA.y + DRAW_AREA.h);
      }
    }
  });

  it('une planche / une par bloc / mosaïque ; échelle imposée ou ajustée ; titre « vue — échelle » + sous-titre', () => {
    const spec = { ...specFromPreset(VIEW_PRESETS[0], 'cv1', 'n'), name: 'Dessous de toiture — sans plafond tendu' };
    const blocks = [block('m:VBX-01', 'VBX-01 = VBX-04'), block('m:VBX-02', 'VBX-02'), block('m:VBX-03', 'VBX-03')];
    expect(customViewSheets(spec, blocks, opts, deps)).toHaveLength(1);
    const per = customViewSheets(spec, blocks, { ...opts, mode: 'per-block' }, deps);
    expect(per).toHaveLength(3);
    expect(per[0].title).toBe('Extract - Dessous de toiture — sans plafond tendu - VBX-01 = VBX-04');
    const vp = per[0].items[0] as ViewportItem;
    expect(vp.custom).toEqual({ viewId: 'cv1', block: 'm:VBX-01', subtitle: 'Vue de dessous (miroir du plan)', scaleInTitle: true });
    expect(vp.label).toBe('Dessous de toiture — sans plafond tendu — VBX-01 = VBX-04');
    expect(vp.scale).toBe(50);
    expect(customViewSheets(spec, blocks, { ...opts, mode: 'mosaic', perSheet: 2 }, deps)).toHaveLength(2);
    // ajustée : une seule échelle normalisée pour les vues d'une même planche
    const fit = customViewSheets(spec, [block('a', 'A', 5900, 2500), block('b', 'B', 12000, 2500)], { ...opts, scale: 0 }, deps)[0].items as ViewportItem[];
    expect(fit[0].scale).toBe(fit[1].scale);
    expect(customViewSheets(spec, blocks, { ...opts, blocks: ['m:VBX-02'] }, deps)[0].items).toHaveLength(1);
  });

  it('repères A–A sur les vues en plan du jeu (une fois), niveaux sur les élévations, vues spéciales intactes', () => {
    const s = fakeScene([{ id: 'VBX-01', x: 0, z: 0 }, { id: 'VBX-02', x: 0, z: -2500 }]);
    const look = makeLookup(s.index);
    const tags = makeTagResolver(s.index);
    const refs = new Map(['VBX-01', 'VBX-02'].map((m) => [m, moduleRefs(s.index, look, tags, s.frames.get(m)!)]));
    const spec = specFromPreset(VIEW_PRESETS.find((p) => p.key === 'section-long')!, 'cv2', 'n');
    const marks = sectionMarks(spec, s.frames, refs, ['VBX-01', 'VBX-02']);
    expect(marks).toHaveLength(2);
    // longitudinale : trait le long du grand côté (5 900 mm), au milieu du petit côté
    expect(Math.hypot(marks[0].b[0] - marks[0].a[0], marks[0].b[2] - marks[0].a[2])).toBeCloseTo(5900, 0);
    expect(marks[0].a[2]).toBeCloseTo(-1250, 3);
    const roof = specFromPreset(VIEW_PRESETS[0], 'cv3', 'n');
    expect(cutLevels(roof, s.frames, refs, ['VBX-01'])).toEqual([{ y: 2550, text: '+2 550' }]);
    const vp = (id: string, kind: 'top' | 'front', custom = false): ViewportItem => ({
      id,
      type: 'viewport',
      rect: { x: 0, y: 0, w: 10, h: 10 },
      request: { modelId: 'k', subset: { include: [] }, view: { kind, frame: 'world' }, style: DEFAULT_LINE_STYLE },
      scale: 50,
      showLabel: false,
      renderStyle: 'trait',
      ...(custom ? { custom: { viewId: 'x', block: 'assembled' } } : {}),
    });
    const set: DrawingSet = {
      id: 's',
      projectId: 'p',
      modelVersionId: null,
      modelKey: 'k',
      title: 'T',
      templateId: 'viewbox',
      titleBlock: emptyTitleBlock(),
      notes: '',
      sheets: [{ id: 'a', number: 'A0.1', title: 't', paper: 'A1', orientation: 'landscape', kind: 'standard', items: [vp('top', 'top'), vp('front', 'front'), vp('cust', 'top', true)] }],
      revision: 0,
      updatedAt: '',
    };
    const levels = cutLevels(roof, s.frames, refs, ['VBX-01']);
    addCustomSheets(set, customViewSheets(spec, [block('assembled', 'Ensemble')], opts, deps), marks, levels);
    addCustomSheets(set, [], marks, levels); // deuxième ajout : pas de doublon
    const [top, front, cust] = set.sheets[0].items as ViewportItem[];
    expect(top.overlays?.sectionMarks).toHaveLength(2);
    expect(top.overlays?.cutLevels).toBeUndefined();
    expect(front.overlays?.cutLevels).toEqual(levels);
    expect(front.overlays?.sectionMarks).toBeUndefined();
    expect(cust.overlays).toBeUndefined();
    expect(set.sheets.map((x) => x.number)).toEqual(['A0.1', 'A0.2']);
  });
});
