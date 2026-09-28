// Détails types : dessin fixe vectoriel (coupes profils, plancher et isolant) placé à l'échelle de son cadre.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DETAILS, detailFit, detailRect, detailScale } from '../src/sheets/details';
import { SheetSvg } from '../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../src/sheets/types';
import type { Sheet } from '../src/sheets/types';

const dt = DETAILS.profiles;

describe('détail « coupes profils, plancher et isolant »', () => {
  it('extrait du plan : cotes d’origine, emprise en mm réels, tracés seulement (pas d’image)', () => {
    expect(dt.texts.map((t) => t.text).sort()).toEqual(['100', '120', '160', '200', '220', '220', '220', '220', '220', '30', '325', '40', '54', '54', '61', 'Ø24'].sort());
    expect(dt.width).toBeGreaterThan(800);
    expect(dt.height).toBeGreaterThan(1500);
    expect(dt.strokes.every((s) => /^M[\d .\-MLCZ]+$/.test(s.d))).toBe(true);
    // tous les points dans l'emprise
    const nums = (dt.strokes.map((s) => s.d).join(' ') + ' ' + dt.fill).match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...nums)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...nums.filter((_, i) => i % 2 === 0))).toBeLessThanOrEqual(dt.width + 0.1);
  });

  it('échelle du cadre : 1:10 → 83 × 158 mm, proportions gardées si le cadre est déformé', () => {
    const r = detailRect(dt, 10, 30, 60);
    expect(r.w).toBeCloseTo(dt.width / 10);
    expect(detailScale(dt, r)).toBe(10);
    const wide = { ...r, w: r.w * 3 };
    expect(detailScale(dt, wide)).toBe(10);
    expect(detailFit(dt, wide).x).toBeCloseTo(30 + r.w);
  });

  it('rendu sur la planche : tracés, textes des cotes, épaisseur de trait papier constante', () => {
    const sheet: Sheet = {
      id: 's1',
      number: 'A0.9',
      title: 'Details',
      paper: 'A1',
      orientation: 'landscape',
      kind: 'standard',
      items: [{ id: 'd1', type: 'detail', detail: 'profiles', rect: detailRect(dt, 5, 30, 60), label: 'Section details', showLabel: true }],
    };
    const svg = renderToStaticMarkup(createElement(SheetSvg, { sheet, titleBlock: emptyTitleBlock(), notes: '', legend: [], viewData: () => undefined }));
    expect(svg).toContain('Section details');
    expect(svg).toContain('Ø24');
    expect(svg).toContain('scale(0.2)');
    expect(svg).toContain('stroke-width="1.27"'); // 0,254 mm papier à 1:5
    expect(svg).not.toContain('<image');
  });
});
