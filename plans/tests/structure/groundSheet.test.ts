// Fiche de calage A4 : SVG complet (hypothèses, plan, types d'appui, matériel, coupe du calage, réserves, filigrane) et
// PDF A4 portrait de toutes ses pages, polices intégrées. GROUND_PDF_OUT=/chemin.pdf pour garder le fichier (contrôle pdftoppm).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FONT_FILE, buildPdf, fontsUsed } from '../../src/sheets/pdf/pdf';
import type { FontFiles, FontKey } from '../../src/sheets/pdf/pdf';
import { computeCalage } from '../../src/structure/core/calage';
import { gridModules } from '../../src/structure/core/estimate';
import { GroundSheetSvg, groundSheetPages } from '../../src/structure/report/groundSheet';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';

const proto = (globalThis as unknown as { SVGElement: { prototype: Record<string, unknown> } }).SVGElement.prototype;
proto.getBBox ??= function (this: Element) {
  const size = parseFloat(this.getAttribute('font-size') ?? '16');
  return { x: 0, y: 0, width: (this.textContent ?? '').length * size * 0.5, height: size };
};
(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: () => null } } }).HTMLCanvasElement.prototype.getContext = () => null;

const fontDir = join(__dirname, '../../src/sheets/pdf/fonts');
function readFonts(keys: FontKey[]): FontFiles {
  const out: FontFiles = {};
  for (const k of keys) {
    const [family, variant] = k.split('-') as ['Gelasio' | 'Arimo', keyof typeof FONT_FILE];
    const b = readFileSync(join(fontDir, `${family}-${FONT_FILE[variant]}.ttf`));
    out[k] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  return out;
}

describe('fiche de calage', () => {
  const modules = gridModules(3, 2, [
    [2, 2, 1],
    [2, 2, 0],
  ], false);
  const result = computeCalage(calageInput(modules, DEFAULT_HYP, { plates: [], commercial: [] }));
  const info = { project: '26-0001 · Test', client: 'Client', source: 'Calage rapide', date: '29/09/2026', assumptions: [['Portance admissible', '200 kN/m²']] as Array<[string, string]> };
  const pages = groundSheetPages({ result, modules, info }).map((p) => renderToStaticMarkup(p));
  const svg = pages.join('');

  it('SVG A4 : sections, types d’appui, matériel, coupe du calage, filigrane, polices Arimo', () => {
    expect(pages[0]).toContain('viewBox="0 0 210 297"');
    expect(renderToStaticMarkup(createElement(GroundSheetSvg, { result, modules, info }))).toBe(pages[0]);
    for (const t of ['FICHE DE CALAGE', '1. Installation et hypothèses', '2. Plan des appuis', '3. Calage par type', '4. Matériel à préparer', '5. Coupe du calage — de la dalle à la Viewbox', '6. Références réglementaires (TÜV)', 'Prüfbuch n° 190060 B', '7. Réserves', 'PRÉ-ÉTUDE INTERNE'])
      expect(svg).toContain(t);
    for (const t of result.types) expect(svg).toContain(t.label);
    expect(svg).toContain('Portance à vérifier sur site');
    // chaque page numérotée « n / N », rien sous le pied de page
    pages.forEach((p, i) => expect(p).toContain(`${i + 1} / ${pages.length}`));
    expect(fontsUsed([svg]).every((k) => k.startsWith('Arimo'))).toBe(true);
  });

  it('PDF A4 portrait, une page par page de la fiche', async () => {
    const pdf = await buildPdf(pages.map((p) => ({ svg: p, paper: 'A3' as const, size: { w: 210, h: 297 } })), readFonts(fontsUsed(pages)), { title: 'Fiche de calage' });
    expect(pdf.getNumberOfPages()).toBe(pages.length);
    expect(pdf.internal.pageSize.getWidth()).toBeCloseTo(210, 1);
    expect(pdf.internal.pageSize.getHeight()).toBeCloseTo(297, 1);
    const out = process.env.GROUND_PDF_OUT;
    if (out) writeFileSync(out, Buffer.from(pdf.output('arraybuffer')));
  });
});
