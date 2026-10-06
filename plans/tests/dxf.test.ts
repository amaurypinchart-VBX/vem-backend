// Export DXF : planche entière (1 unité = 1 mm papier) ou vues en grandeur réelle (1 unité = 1 mm du modèle),
// calques, épaisseurs, tirets, textes, découpe des vues. DXF_OUT=/dossier pour garder les fichiers (contrôle ezdxf).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SheetSvg } from '../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../src/sheets/types';
import type { Sheet, ViewportItem } from '../src/sheets/types';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import type { Linework2D } from '../src/linework/types';
import type { Vec3 } from '../src/core/views';
import { clipPolyline, parseColor, parsePath, parseTransform } from '../src/sheets/dxf/svgToDxf';
import { sheetDxf, zipDxf } from '../src/sheets/dxf/export';
import { aciOf, lineweightOf } from '../src/sheets/dxf/writer';
import { unzipSync, strFromU8 } from 'fflate';

const basis = { right: [1, 0, 0] as Vec3, up: [0, 1, 0] as Vec3, toward: [0, 0, 1] as Vec3 };
// une Viewbox de face (5900 × 2800) qui déborde de sa fenêtre à droite (trait jusqu'à 9000)
const lw: Linework2D = {
  boundsMm: { minX: 0, minY: 0, maxX: 5900, maxY: 2800 },
  layers: [
    { key: 'silhouette', polylines: [Float64Array.from([0, 0, 5900, 0, 5900, 2800, 0, 2800, 0, 0])] },
    { key: 'visible', polylines: [Float64Array.from([100, 150, 9000, 150])] },
    { key: 'hidden', polylines: [Float64Array.from([2000, 150, 2000, 2700])] },
    { key: 'mark:VITRE', polylines: [Float64Array.from([500, 500, 1000, 1500])] },
    { key: 'category:PORTE', polylines: [Float64Array.from([3000, 0, 3900, 0])] },
  ],
  snapPoints: new Float64Array(),
  meta: { provider: 't', durationMs: 0, segmentCount: 0, cacheKey: '', basis, objectCount: 1 },
};

const vp: ViewportItem = {
  id: 'v1',
  type: 'viewport',
  rect: { x: 20, y: 62, w: 330, h: 215 },
  request: { modelId: 'k', subset: { include: [] }, view: { kind: 'front', frame: 'world' }, style: DEFAULT_LINE_STYLE },
  scale: 25,
  center: [2950, 1400],
  label: 'Long side',
  showLabel: true,
  renderStyle: 'trait',
};

const sheet: Sheet = {
  id: 's1',
  number: 'A1.1',
  title: 'Extract - Plan View - Façade « é »',
  paper: 'A1',
  orientation: 'landscape',
  kind: 'standard',
  items: [
    vp,
    { id: 'd1', type: 'dimension', viewportId: vp.id, kind: 'linear', orient: 'h', anchors3d: [[0, 2800, 0], [5900, 2800, 0]], offsetMm: -10 },
    { id: 't1', type: 'text', rect: { x: 400, y: 400, w: 200, h: 20 }, text: 'Note chantier', size: 5, bold: true, font: 'sans' },
    { id: 'l1', type: 'logo', logo: 'vb', rect: { x: 400, y: 450, w: 30, h: 25 } },
    { id: 'i1', type: 'image3d', rect: { x: 400, y: 300, w: 80, h: 60 }, url: 'https://example.com/a.png', width: 800, height: 600, label: '3D', showLabel: false },
  ],
};

const legend = [{ key: 'PORTE', label: 'Doors', color: '#2a9d8f' }];
const markup = renderToStaticMarkup(
  createElement(SheetSvg, { sheet, titleBlock: { ...emptyTitleBlock(), client: 'Client SA', projectName: 'Stand Łódź' }, notes: 'Note 1', legend, viewData: () => ({ lw, basis }) }),
);

interface Ent {
  type: string;
  codes: Array<[number, string]>;
}

/** Lecture minimale : paires code / valeur → entités de la section ENTITIES. */
function entities(dxf: string): Ent[] {
  const lines = dxf.split('\n');
  const out: Ent[] = [];
  let inEnt = false;
  let cur: Ent | null = null;
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]);
    const v = lines[i + 1];
    if (code === 2 && v === 'ENTITIES') inEnt = true;
    if (!inEnt) continue;
    if (code === 0) {
      if (v === 'ENDSEC') break;
      cur = { type: v, codes: [] };
      out.push(cur);
    } else cur?.codes.push([code, v]);
  }
  return out;
}

const get = (e: Ent, code: number) => e.codes.find(([c]) => c === code)?.[1];
const all = (e: Ent, code: number) => e.codes.filter(([c]) => c === code).map(([, v]) => Number(v));

function save(name: string, dxf: string) {
  if (process.env.DXF_OUT) writeFileSync(join(process.env.DXF_OUT, name), dxf);
}

describe('DXF : briques', () => {
  it('tracés SVG : relatif, H / V, courbes, arcs, Z', () => {
    const [p] = parsePath('M10 10 h20 v10 l-20 0 z');
    expect(p.closed).toBe(true);
    expect(p.pts).toEqual([10, 10, 30, 10, 30, 20, 10, 20]);
    const [c] = parsePath('M0 0 C0 10 10 10 10 0', () => 4);
    expect(c.pts.length).toBe(10);
    expect(c.pts.slice(-2)).toEqual([10, 0]);
    expect(c.pts[5]).toBeCloseTo(7.5); // milieu de la courbe
    const [a] = parsePath('M0 0 A10 10 0 0 1 20 0', () => 8);
    expect(a.pts.slice(-2)).toEqual([20, 0]);
    // demi-cercle de rayon 10 : le milieu est à 10 du centre (10, 0)
    expect(a.pts.length).toBe(18);
    expect(a.pts[8]).toBeCloseTo(10);
    expect(Math.abs(a.pts[9])).toBeCloseTo(10);
    // implicite après M = lignes ; relatif après Z repart du début
    const [m, n] = parsePath('m5 5 5 0 0 5zm1 1 2 0');
    expect(m.pts).toEqual([5, 5, 10, 5, 10, 10]);
    expect(n.pts).toEqual([6, 6, 8, 6]);
  });

  it('transformations, couleurs, épaisseurs, couleurs AutoCAD', () => {
    const t = parseTransform('translate(10 20) scale(2) rotate(90)');
    // (1, 0) → rotate → (0, 1) → ×2 → (0, 2) → +(10, 20)
    expect(t[0] * 1 + t[4]).toBeCloseTo(10);
    expect(t[1] * 1 + t[5]).toBeCloseTo(22);
    expect(parseColor('#fff')).toBe(0xffffff);
    expect(parseColor('none')).toBeNull();
    expect(parseColor('rgb(255, 0, 0)')).toBe(0xff0000);
    expect(lineweightOf(0.35)).toBe(35);
    expect(lineweightOf(0.13)).toBe(13);
    expect(aciOf(0xff0000)).toBe(1);
    expect(aciOf(0x000000)).toBe(7);
    expect(aciOf(0x0000ff)).toBe(5);
  });

  it('découpe : un trait qui sort du cadre est coupé au bord', () => {
    const runs = clipPolyline([0, 5, 20, 5, 20, 15], { x0: 0, y0: 0, x1: 10, y1: 10 });
    expect(runs).toEqual([[0, 5, 10, 5]]);
    expect(clipPolyline([20, 20, 30, 30], { x0: 0, y0: 0, x1: 10, y1: 10 })).toEqual([]);
  });
});

describe('DXF : planche', () => {
  const f = sheetDxf(sheet, markup, 'paper', () => true, 'P-001_Jeu')!;
  save('planche.dxf', f.dxf);
  const ents = entities(f.dxf);
  const layerOf = (l: string) => ents.filter((e) => get(e, 8) === l);

  it('fichier AutoCAD 2007, en mm, toutes les sections', () => {
    expect(f.name).toBe('P-001_Jeu_A1.1_A1.dxf');
    for (const s of ['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']) expect(f.dxf).toContain(`\n2\n${s}\n`);
    expect(f.dxf).toMatch(/\$ACADVER\n1\nAC1021/);
    expect(f.dxf).toMatch(/\$INSUNITS\n70\n4/);
    expect(f.dxf.trimEnd().endsWith('0\nEOF')).toBe(true);
    // handles uniques
    const handles = [...f.dxf.matchAll(/\n(?:5|105)\n([0-9A-F]+)\n/g)].map((m) => m[1]);
    expect(new Set(handles).size).toBe(handles.length);
  });

  it('calques par type de trait, épaisseurs et tirets conservés', () => {
    const sil = layerOf('VBX-VUE-SILHOUETTE');
    expect(sil.length).toBe(1);
    expect(get(sil[0], 370)).toBe('35');
    // contour refermé sur son premier point = polyligne fermée (4 sommets)
    expect(get(sil[0], 70)).toBe('1');
    expect(get(sil[0], 90)).toBe('4');
    const hidden = layerOf('VBX-VUE-CACHE');
    expect(get(hidden[0], 6)).toMatch(/^VBX_TIRETS_1p2_0p8$/);
    expect(f.dxf).toMatch(/\nLTYPE\n[\s\S]*VBX_TIRETS_1p2_0p8\n70\n0\n3\n[^\n]*\n72\n65\n73\n2\n40\n2\n49\n1.2\n74\n0\n49\n-0.8/);
    expect(layerOf('VBX-REPERE-VITRE').length).toBe(1);
    const door = layerOf('VBX-CATEGORIE-PORTE');
    expect(door.length).toBe(1);
    // couleur de la catégorie portée par le calque, l'entité est « DuCalque »
    expect(get(door[0], 420)).toBeUndefined();
    expect(f.dxf).toMatch(new RegExp(`\n2\nVBX-CATEGORIE-PORTE\n70\n0\n62\n\\d+\n420\n${0x2a9d8f}\n`));
    expect(layerOf('VBX-COTES').length).toBeGreaterThan(3);
    expect(layerOf('VBX-CARTOUCHE').length).toBeGreaterThan(20);
    expect(layerOf('VBX-CADRE').length).toBe(1);
  });

  it('la vue est découpée à sa fenêtre (comme le PDF)', () => {
    const vis = layerOf('VBX-VUE-VISIBLE');
    expect(vis.length).toBe(1);
    const xs = all(vis[0], 10);
    // fenêtre x 20 … 350 : le trait jusqu'à 9000 mm (bien au-delà) s'arrête au bord
    expect(Math.max(...xs)).toBeCloseTo(350, 3);
    // y papier vers le haut : la planche A1 fait 594 mm
    const ys = all(vis[0], 20);
    expect(ys[0]).toBeGreaterThan(594 - 277);
    expect(ys[0]).toBeLessThan(594 - 62);
  });

  it('géométrie à l’échelle : la Viewbox mesure 5900 / 25 = 236 mm sur la feuille', () => {
    const xs = all(layerOf('VBX-VUE-SILHOUETTE')[0], 10);
    const ys = all(layerOf('VBX-VUE-SILHOUETTE')[0], 20);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(236, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(112, 3);
  });

  it('textes : contenu UTF-8, polices Georgia / Arial, hauteur des majuscules, alignement', () => {
    const texts = ents.filter((e) => e.type === 'TEXT');
    const note = texts.find((e) => get(e, 1) === 'Note chantier')!;
    expect(get(note, 7)).toBe('VBX-SANS-GRAS');
    expect(Number(get(note, 40))).toBeCloseTo(5 * 0.716, 3);
    expect(get(note, 8)).toBe('VBX-TEXTES');
    expect(texts.some((e) => get(e, 1) === 'Extract - Plan View - Façade « é »')).toBe(true);
    expect(texts.some((e) => get(e, 1) === 'Stand Łódź')).toBe(true);
    const dim = texts.find((e) => get(e, 8) === 'VBX-COTES')!;
    expect(get(dim, 1)).toBe('5900 mm');
    expect(get(dim, 72)).toBe('1');
    expect(get(dim, 7)).toBe('VBX-SERIF');
    expect(f.dxf).toMatch(/\n2\nVBX-SANS-GRAS\n70\n0\n40\n0\n41\n1\n50\n0\n71\n0\n42\n2.5\n3\narialbd.ttf/);
    expect(f.dxf).toMatch(/\n3\ngeorgia.ttf\n/);
  });

  it('remplissages : logo et flèches en HATCH plein, fond blanc ignoré, image 3D = cadre seul', () => {
    const logos = layerOf('VBX-LOGOS');
    expect(logos.length).toBe(1);
    expect(logos[0].type).toBe('HATCH');
    expect(get(logos[0], 2)).toBe('SOLID');
    expect(Number(get(logos[0], 91))).toBeGreaterThan(1); // contour + trous (V, B)
    const img = layerOf('VBX-IMAGES-3D');
    expect(img.map((e) => e.type)).toEqual(['LWPOLYLINE']);
    // aucun remplissage blanc (fond de planche, cartouche)
    expect(ents.filter((e) => e.type === 'HATCH' && get(e, 420) === String(0xffffff))).toEqual([]);
  });
});

describe('DXF : grandeur réelle', () => {
  const f = sheetDxf(sheet, markup, 'real', () => true, 'P-001_Jeu')!;
  save('reel.dxf', f.dxf);
  const ents = entities(f.dxf);

  it('1 unité = 1 mm : la Viewbox mesure 5900 × 2800, sans cartouche', () => {
    expect(f.name).toBe('P-001_Jeu_A1.1_grandeur-reelle.dxf');
    const sil = ents.find((e) => get(e, 8) === 'VBX-VUE-SILHOUETTE')!;
    const xs = all(sil, 10);
    const ys = all(sil, 20);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5900, 2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2800, 2);
    const layers = new Set(ents.map((e) => get(e, 8)));
    expect(layers.has('VBX-CARTOUCHE')).toBe(false);
    expect(layers.has('VBX-TEXTES')).toBe(false);
    expect(layers.has('VBX-LOGOS')).toBe(false);
    expect(layers.has('VBX-COTES')).toBe(true);
    expect(layers.has('VBX-TITRES')).toBe(true);
  });

  it('cotes et textes à l’échelle de la vue, épaisseurs inchangées, tirets agrandis', () => {
    const dimLines = ents.filter((e) => get(e, 8) === 'VBX-COTES' && e.type === 'LWPOLYLINE');
    // la ligne de cote couvre les 5900 mm
    const spans = dimLines.map((e) => Math.max(...all(e, 10)) - Math.min(...all(e, 10)));
    expect(Math.max(...spans)).toBeGreaterThanOrEqual(5900 - 1e-6);
    const txt = ents.find((e) => e.type === 'TEXT' && get(e, 8) === 'VBX-COTES')!;
    expect(get(txt, 1)).toBe('5900 mm');
    expect(Number(get(txt, 40))).toBeCloseTo(2.5 * 25 * 0.692, 2);
    const sil = ents.find((e) => get(e, 8) === 'VBX-VUE-SILHOUETTE')!;
    expect(get(sil, 370)).toBe('35');
    expect(get(ents.find((e) => get(e, 8) === 'VBX-VUE-CACHE')!, 6)).toBe('VBX_TIRETS_30_20');
  });

  it('une planche sans vue n’a rien en grandeur réelle', () => {
    const cover: Sheet = { ...sheet, items: sheet.items.filter((i) => i.type !== 'viewport') };
    const m = renderToStaticMarkup(createElement(SheetSvg, { sheet: cover, titleBlock: emptyTitleBlock(), notes: '', legend, viewData: () => undefined }));
    expect(sheetDxf(cover, m, 'real', () => true, 'X')).toBeNull();
  });

  it('jeu entier : un .zip, un DXF par planche, noms uniques', () => {
    const z = unzipSync(zipDxf([f, f]));
    expect(Object.keys(z)).toEqual(['P-001_Jeu_A1.1_grandeur-reelle.dxf', 'P-001_Jeu_A1.1_grandeur-reelle_2.dxf']);
    expect(strFromU8(z['P-001_Jeu_A1.1_grandeur-reelle.dxf'])).toBe(f.dxf);
  });
});
