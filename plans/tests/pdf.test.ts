// Export PDF : une page par planche au format exact, traits et textes vectoriels, polices Gelasio / Arimo intégrées,
// aucune image sur une planche en style trait. PDF_OUT=/chemin.pdf pour garder le fichier (contrôle pdftoppm).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FONT_FILE, buildPdf, fontsUsed } from '../src/sheets/pdf/pdf';
import type { FontFiles, FontKey } from '../src/sheets/pdf/pdf';
import { SheetSvg } from '../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../src/sheets/types';
import type { Sheet, ViewportItem } from '../src/sheets/types';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import type { Linework2D } from '../src/linework/types';
import type { Vec3 } from '../src/core/views';

// jsdom ne mesure pas les textes (svg2pdf s'en sert pour les textes centrés / alignés à droite) : largeur approchée
const proto = (globalThis as unknown as { SVGElement: { prototype: Record<string, unknown> } }).SVGElement.prototype;
proto.getBBox ??= function (this: Element) {
  const size = parseFloat(this.getAttribute('font-size') ?? '16');
  return { x: 0, y: 0, width: (this.textContent ?? '').length * size * 0.5, height: size };
};

(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: () => null } } }).HTMLCanvasElement.prototype.getContext = () => null;

const fontDir = join(__dirname, '../src/sheets/pdf/fonts');
function readFonts(keys: FontKey[]): FontFiles {
  const out: FontFiles = {};
  for (const k of keys) {
    const [family, variant] = k.split('-') as ['Gelasio' | 'Arimo', keyof typeof FONT_FILE];
    const b = readFileSync(join(fontDir, `${family}-${FONT_FILE[variant]}.ttf`));
    out[k] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  return out;
}

const basis = { right: [1, 0, 0] as Vec3, up: [0, 1, 0] as Vec3, toward: [0, 0, 1] as Vec3 };
// une Viewbox de face : cadre, vitre, porte
const lw: Linework2D = {
  boundsMm: { minX: 0, minY: 0, maxX: 5900, maxY: 2800 },
  layers: [
    { key: 'silhouette', polylines: [Float64Array.from([0, 0, 5900, 0, 5900, 2800, 0, 2800, 0, 0])] },
    { key: 'visible', polylines: [Float64Array.from([100, 150, 5800, 150]), Float64Array.from([100, 2700, 5800, 2700])] },
    { key: 'hidden', polylines: [Float64Array.from([2000, 150, 2000, 2700])] },
    { key: 'mark:VITRE', polylines: [Float64Array.from([500, 500, 1000, 1500])] },
  ],
  snapPoints: new Float64Array(),
  meta: { provider: 't', durationMs: 0, segmentCount: 0, cacheKey: '', basis, objectCount: 1 },
};

function sheet(paper: 'A1' | 'A3', number: string): Sheet {
  const vp: ViewportItem = {
    id: `v${number}`,
    type: 'viewport',
    rect: { x: 20, y: 62, w: 330, h: 215 },
    request: { modelId: 'k', subset: { include: [] }, view: { kind: 'front', frame: 'world' }, style: DEFAULT_LINE_STYLE },
    scale: 25,
    center: [2950, 1400],
    label: 'Long side',
    showLabel: true,
    renderStyle: 'trait',
  };
  return {
    id: number,
    number,
    title: 'Extract - Plan View - Stand Łódź « é »',
    paper,
    orientation: 'landscape',
    kind: 'standard',
    items: [
      vp,
      { id: `d${number}`, type: 'dimension', viewportId: vp.id, kind: 'linear', orient: 'h', anchors3d: [[0, 2800, 0], [5900, 2800, 0]], offsetMm: -10, textOverride: '5900 env.' },
      { id: `t${number}`, type: 'text', rect: { x: 400, y: 400, w: 200, h: 20 }, text: 'Note chantier', size: 5, bold: true, font: 'sans' },
    ],
  };
}

describe('export PDF', () => {
  it('polices utilisées : famille, gras, italique', () => {
    expect(fontsUsed(['<svg><text font-family="Gelasio, serif" font-weight="700">a</text><text font-family="Arimo, sans-serif">b</text><text font-style="italic">c</text></svg>'])).toEqual([
      'Arimo-normal',
      'Gelasio-bold',
      'Gelasio-italic',
    ]);
  });

  it('une page par planche au format exact, vectorielle, polices intégrées, sans image', async () => {
    const tb = { ...emptyTitleBlock(), client: 'Image Construction Messe- und Eventbau GmbH', projectName: 'NVIDIA Hospitality Berlin' };
    const pages = [sheet('A1', 'A0.1'), sheet('A3', 'A0.2')].map((s) => ({
      paper: s.paper,
      svg: renderToStaticMarkup(createElement(SheetSvg, { sheet: s, titleBlock: tb, notes: 'GENERAL NOTES', legend: [{ key: 'VITRE', label: 'Glass', color: '#1EAAF1' }], viewData: () => ({ lw, basis }) })),
    }));
    const keys = fontsUsed(pages.map((p) => p.svg));
    expect(keys).toContain('Gelasio-normal');
    expect(keys).toContain('Gelasio-bold');
    expect(keys).toContain('Gelasio-italic'); // cote au texte imposé
    expect(keys).toContain('Arimo-bold');
    const done: number[] = [];
    const pdf = await buildPdf(pages, readFonts(keys), { title: 'NVIDIA' }, (d) => done.push(d));
    expect(done).toEqual([1, 2]);
    const bytes = new Uint8Array(pdf.output('arraybuffer'));
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
    const text = new TextDecoder('latin1').decode(bytes);
    // A1 : 841 × 594 mm = 2383,94 × 1683,78 pt ; A3 : 420 × 297 mm = 1190,55 × 841,89 pt
    const boxes = [...text.matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1].trim().split(/\s+/).map(Number));
    expect(boxes).toHaveLength(2);
    expect(boxes[0][2]).toBeCloseTo(2383.94, 1);
    expect(boxes[0][3]).toBeCloseTo(1683.78, 1);
    expect(boxes[1][2]).toBeCloseTo(1190.55, 1);
    expect(boxes[1][3]).toBeCloseTo(841.89, 1);
    // polices TrueType intégrées, pas de police standard (Times / Helvetica) de repli
    expect((text.match(/\/FontFile2/g) ?? []).length).toBe(keys.length);
    expect(text).not.toMatch(/\/BaseFont \/(Times|Helvetica)/);
    // style trait : aucune image
    expect(text).not.toMatch(/\/Subtype \/Image/);
    expect(text).toContain('/Title (NVIDIA)');
  });
});
