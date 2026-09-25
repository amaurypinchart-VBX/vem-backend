// Cotes : géométrie (style §3.5), cotation automatique sans chevauchement (§9.2), associativité, accroche.
import { describe, expect, it } from 'vitest';
import { Matrix4 } from 'three';
import { DIM, boxesOverlap, dimGeometry, fitWithDims, formatDim, uniqueSorted } from '../src/sheets/dimensions';
import { autoDimensionViewport, paperBoxes } from '../src/sheets/autoDim';
import { buildSnapIndex } from '../src/sheets/snap';
import { frameAxesFromMatrix, makeModuleFrame, projectPoint, viewBasis } from '../src/core/views';
import type { ModuleFrame } from '../src/core/views';
import type { LoadedScene } from '../src/scene/loadedScene';
import type { Linework2D } from '../src/linework/types';
import type { RectMm, ViewportItem } from '../src/sheets/types';
import { viewportTransform } from '../src/sheets/scales';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';

describe('géométrie d’une cote', () => {
  it('cote horizontale au-dessus : ligne, lignes d’attache (écart 2 mm, dépassement 2 mm), ticks 45°, texte « 17700 mm »', () => {
    const g = dimGeometry({ orient: 'h', paper: [{ x: 10, y: 100 }, { x: 364, y: 100 }], model: [[0, 0], [17700, 0]], offsetMm: -10 });
    expect(g.values).toEqual([17700]);
    expect(g.texts[0].text).toBe('17700 mm');
    expect(formatDim(2499.6)).toBe('2500 mm');
    const [line, ext1] = g.lines;
    expect(line).toEqual([10, 90, 364, 90]);
    expect(ext1[1]).toBeCloseTo(98); // départ à 2 mm de l'objet
    expect(ext1[3]).toBeCloseTo(88); // 2 mm au-delà de la ligne de cote
    const t = g.ticks[0];
    expect(Math.abs(t[2] - t[0])).toBeCloseTo(Math.abs(t[3] - t[1])); // 45°
    expect(g.texts[0].y).toBeLessThan(90); // texte au-dessus de la ligne
  });

  it('cote verticale à gauche : texte tourné, valeur = différence de hauteur du dessin', () => {
    const g = dimGeometry({ orient: 'v', paper: [{ x: 50, y: 200 }, { x: 60, y: 138.4 }], model: [[0, 0], [0, 3080]], offsetMm: -10 });
    expect(g.values[0]).toBe(3080);
    expect(g.texts[0].rotate).toBe(-90);
    expect(g.lines[0][0]).toBeCloseTo(40); // à gauche du point le plus à gauche
  });

  it('chaîne serrée : textes décalés, jamais superposés', () => {
    const xs = [0, 60, 900, 960, 5900];
    const g = dimGeometry({ orient: 'h', paper: xs.map((x) => ({ x: x / 50, y: 100 })), model: xs.map((x) => [x, 0]), offsetMm: 10 });
    expect(g.values).toEqual([60, 840, 60, 4940]);
    for (let i = 0; i < g.texts.length; i++) for (let j = i + 1; j < g.texts.length; j++) expect(boxesOverlap(g.texts[i].box, g.texts[j].box)).toBe(false);
  });

  it('valeurs uniques triées (tolérance)', () => {
    expect(uniqueSorted([5900, 0, 5902, 11800, 2], 5)).toEqual([0, 5900, 11800]);
  });
});

// ─── cotation automatique sur des vues simulées ───
function fakeScene(frames: ModuleFrame[], categories: Record<string, string>): LoadedScene {
  return {
    frames: new Map(frames.map((f) => [f.moduleId, f])),
    index: { modules: frames.map((f) => ({ id: f.moduleId, nodeId: `n-${f.moduleId}` })) },
    look: { categoryOf: (id: string) => categories[id] ?? null },
  } as unknown as LoadedScene;
}

const rectLine = (x0: number, y0: number, x1: number, y1: number) => Float64Array.from([x0, y0, x1, y0, x1, y1, x0, y1, x0, y0]);

function checkNoOverlap(result: ReturnType<typeof autoDimensionViewport>, vp: ViewportItem, lw: Linework2D, basis: ReturnType<typeof viewBasis>) {
  const geoms = paperBoxes(result.dims, vp.rect, result.scale, result.center, basis);
  const texts = geoms.flatMap((g) => g.texts.map((t) => t.box));
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) expect(boxesOverlap(texts[i], texts[j]), `textes ${i} et ${j}`).toBe(false);
  // aucun texte sur le dessin
  const tr = viewportTransform(vp.rect, result.scale, result.center);
  const b = lw.boundsMm;
  const p0 = tr.toPaper(b.minX, b.maxY);
  const p1 = tr.toPaper(b.maxX, b.minY);
  const drawing: RectMm = { x: p0.x, y: p0.y, w: p1.x - p0.x, h: p1.y - p0.y };
  for (const t of texts) expect(boxesOverlap(t, drawing)).toBe(false);
  // tout reste dans le cadre de la vue
  for (const g of geoms) {
    expect(g.box.x).toBeGreaterThanOrEqual(vp.rect.x - 0.01);
    expect(g.box.y).toBeGreaterThanOrEqual(vp.rect.y - 0.01);
    expect(g.box.x + g.box.w).toBeLessThanOrEqual(vp.rect.x + vp.rect.w + 0.01);
    expect(g.box.y + g.box.h).toBeLessThanOrEqual(vp.rect.y + vp.rect.h + 0.01);
  }
}

describe('cotation automatique', () => {
  // 3 Viewbox 5900 × 2500 alignées sur X (ensemble 17 700 mm), 3 080 mm de haut + toit
  const frames = [0, 1, 2].map((i) =>
    makeModuleFrame(`VBX-0${i + 1}`, frameAxesFromMatrix(new Matrix4().makeTranslation(i * 5900, 0, 0).elements), [0, 0, 0], [5900, 2500, 3080]),
  );
  const basis = viewBasis({ kind: 'front', frame: 'world' });
  const vpBase = (rect: RectMm, kind: 'front' | 'top', only?: string[]): ViewportItem => ({
    id: 'vp',
    type: 'viewport',
    rect,
    request: { modelId: 'k', subset: { include: frames.map((f) => `n-${f.moduleId}`), onlyCategories: only }, view: { kind, frame: 'world' }, style: DEFAULT_LINE_STYLE },
    scale: 0,
    showLabel: false,
    renderStyle: 'trait',
  });

  it('élévation « Long side » : total en haut, Viewbox + portes en chaîne en bas, hauteur et bandeau de toit à gauche', () => {
    const lw: Linework2D = {
      boundsMm: { minX: 0, minY: -100, maxX: 17700, maxY: 3700 },
      layers: [
        { key: 'visible', polylines: [rectLine(0, -100, 17700, 3080), rectLine(900, 0, 1830, 2300), rectLine(6800, 0, 7730, 2300)], sourceNodeIds: ['struct', 'door1', 'door2'] },
        { key: 'silhouette', polylines: [rectLine(0, 2893, 17700, 3700)], sourceNodeIds: ['roof'] },
      ],
      snapPoints: new Float64Array(),
      meta: { provider: 't', durationMs: 0, segmentCount: 0, cacheKey: '', basis, objectCount: 0 },
    };
    const scene = fakeScene(frames, { door1: 'PORTE-DOUBLE', door2: 'PORTE-ORANGERIE', roof: 'TOIT', struct: 'STRUCTURE' });
    const vp = vpBase({ x: 20, y: 62, w: 685, h: 228 }, 'front');
    const r = autoDimensionViewport(vp, lw, basis, scene);
    const geoms = paperBoxes(r.dims, vp.rect, r.scale, r.center, basis);
    const values = geoms.map((g) => g.values.map(Math.round));
    expect(values).toContainEqual([17700]); // total
    expect(values).toContainEqual([5900, 5900, 5900]); // Viewbox
    expect(values).toContainEqual([900, 930, 4070, 900, 930, 4070, 5900]); // portes : position + largeur
    expect(values).toContainEqual([807, 2893]); // bandeau de toit (807 mm) + hauteur jusqu'au bandeau (de haut en bas), pieds exclus
    expect(values).toContainEqual([3700]); // hauteur totale de la Viewbox et de son toit, sans les pieds
    expect(r.scale).toBe(50);
    checkNoOverlap(r, vp, lw, basis);
  });

  it('plan d’implantation : entraxes des pieds en chaîne + totaux, sans chevauchement', () => {
    const top = viewBasis({ kind: 'top', frame: 'world' });
    const feet: Float64Array[] = [];
    const ids: string[] = [];
    for (let i = 0; i <= 3; i++)
      for (const y of [-2500, 0]) {
        const x = i * 5900;
        feet.push(rectLine(x - 60, y - 60, x + 60, y + 60));
        ids.push(`f${i}${y}`);
      }
    const lw: Linework2D = {
      boundsMm: { minX: -60, minY: -2560, maxX: 17760, maxY: 60 },
      layers: [{ key: 'visible', polylines: feet, sourceNodeIds: ids }],
      snapPoints: new Float64Array(),
      meta: { provider: 't', durationMs: 0, segmentCount: 0, cacheKey: '', basis: top, objectCount: 0 },
    };
    const scene = fakeScene(frames, Object.fromEntries(ids.map((id) => [id, 'PIED'])));
    const vp = vpBase({ x: 20, y: 62, w: 685, h: 513 }, 'top', ['PIED']);
    const r = autoDimensionViewport(vp, lw, top, scene);
    const values = paperBoxes(r.dims, vp.rect, r.scale, r.center, top).map((g) => g.values.map(Math.round));
    expect(values).toContainEqual([5900, 5900, 5900]);
    expect(values).toContainEqual([17700]);
    expect(values).toContainEqual([2500]);
    checkNoOverlap(r, vp, lw, top);
  });

  it('les cotes suivent la vue : même valeur après changement d’échelle et de cadrage', () => {
    const lw: Linework2D = {
      boundsMm: { minX: 0, minY: 0, maxX: 17700, maxY: 3080 },
      layers: [{ key: 'visible', polylines: [rectLine(0, 0, 17700, 3080)], sourceNodeIds: ['s'] }],
      snapPoints: new Float64Array(),
      meta: { provider: 't', durationMs: 0, segmentCount: 0, cacheKey: '', basis, objectCount: 0 },
    };
    const vp = vpBase({ x: 20, y: 62, w: 685, h: 228 }, 'front');
    const r = autoDimensionViewport(vp, lw, basis, fakeScene(frames, {}));
    const a = paperBoxes(r.dims, vp.rect, r.scale, r.center, basis).map((g) => g.values);
    const b = paperBoxes(r.dims, { x: 100, y: 300, w: 400, h: 200 }, 100, [5000, 1000], basis).map((g) => g.values);
    expect(b).toEqual(a);
    // l'ancrage 3D se projette exactement sur le coin du dessin
    const p = projectPoint(basis, r.dims.find((d) => d.anchors3d.length === 2 && d.orient === 'h')!.anchors3d[1]);
    expect(p.x).toBeCloseTo(17700);
  });

  it('échelle choisie avec la place des cotes', () => {
    const fit = fitWithDims({ minX: 0, minY: 0, maxX: 5900, maxY: 3000 }, { x: 0, y: 0, w: 325, h: 170 }, { top: 17, bottom: 24, left: 24, right: 0 });
    expect(fit.scale).toBe(25); // 1:20 laisserait trop peu de place aux cotes
    expect(DIM.text).toBe(2.5);
  });
});

describe('accroche', () => {
  it('extrémités, milieux et centres de cercles', () => {
    const circle: number[] = [];
    for (let i = 0; i <= 24; i++) circle.push(1000 + 50 * Math.cos((i / 24) * 2 * Math.PI), 500 + 50 * Math.sin((i / 24) * 2 * Math.PI));
    const lw = {
      boundsMm: { minX: 0, minY: 0, maxX: 2000, maxY: 1000 },
      layers: [{ key: 'visible', polylines: [Float64Array.from([0, 0, 2000, 0]), Float64Array.from(circle)] }],
      snapPoints: new Float64Array(),
      meta: {} as Linework2D['meta'],
    } as Linework2D;
    const idx = buildSnapIndex(lw);
    expect(idx.nearest(10, 5, 20)).toMatchObject({ x: 0, y: 0, kind: 'end' });
    expect(idx.nearest(1003, 8, 20)).toMatchObject({ kind: 'mid' });
    const c = idx.nearest(1004, 497, 20)!;
    expect(c.kind).toBe('center');
    expect(c.x).toBeCloseTo(1000);
    expect(c.y).toBeCloseTo(500);
    expect(idx.nearest(600, 600, 20)).toBeNull();
  });
});
