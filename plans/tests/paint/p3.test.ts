// Peinture P3 : hachures coupées au contour (trous compris), liste peinture Excel.
import { describe, expect, it } from 'vitest';
import { hatchSegments } from '../../src/core/paint/hatch';
import { paintListXlsx } from '../../src/core/paint/excel';
import { cellText, readXlsx } from '../../src/loading/xlsx/read';
import type { PaintSettings } from '../../src/core/paint/types';

const sq = (x0: number, y0: number, x1: number, y1: number, ccw = true) => Float64Array.from(ccw ? [x0, y0, x1, y0, x1, y1, x0, y1] : [x0, y0, x0, y1, x1, y1, x1, y0]);
const len = (s: Float64Array) => Math.hypot(s[2] - s[0], s[3] - s[1]);

describe('hachures', () => {
  it('carré 100 × 100, pas de 10 à 0° : 10 traits de 100', () => {
    const h = hatchSegments([sq(0, 0, 100, 100)], 10, 0);
    expect(h.length).toBe(10);
    for (const s of h) expect(len(s)).toBeCloseTo(100);
  });
  it('à 45° : longueur totale ≈ aire / pas, traits dans le carré', () => {
    const h = hatchSegments([sq(0, 0, 100, 100)], 2, 45);
    const total = h.reduce((a, s) => a + len(s), 0);
    expect(total).toBeCloseTo(10000 / 2, -2);
    for (const s of h) for (const v of s) expect(v).toBeGreaterThanOrEqual(-1e-6), expect(v).toBeLessThanOrEqual(100 + 1e-6);
  });
  it('trou : aucun trait dedans', () => {
    const h = hatchSegments([sq(0, 0, 100, 100), sq(40, 40, 60, 60, false)], 5, 0);
    for (const s of h) {
      const y = s[1];
      if (y > 40 && y < 60) {
        const xs = [s[0], s[2]].sort((a, b) => a - b);
        expect(xs[1] <= 40 + 1e-6 || xs[0] >= 60 - 1e-6).toBe(true);
      }
    }
    const total = h.reduce((a, s) => a + len(s), 0);
    expect(total).toBeCloseTo((10000 - 400) / 5, -1);
  });
});

describe('liste peinture Excel', () => {
  it('couleurs, par Viewbox, zones', () => {
    const paint: PaintSettings = {
      v: 1,
      colors: [
        { id: 'a', tag: 'P1', name: 'Noir foncé', system: 'RAL', code: '9005', hex: '#0E0E10', finish: 'mat', createdAt: '' },
        { id: 'b', tag: 'P2', name: 'Gris anthracite', system: 'RAL', code: '7016', hex: '#383E42', createdAt: '' },
      ],
      zones: [
        { id: 'z1', colorId: 'a', target: { scope: 'node', match: { nodeIds: ['n'] } }, label: 'VBX-01 › Poteau — pièce entière', source: 'click', createdAt: '' },
        { id: 'z2', colorId: 'b', target: { scope: 'node', match: { nodeIds: ['m'] } }, label: 'VBX-02 › Porte — pièce entière', source: 'click', createdAt: '' },
      ],
      updatedAt: '',
    };
    const bytes = paintListXlsx(
      paint,
      { byColor: new Map([['a', 1.234], ['b', 0.5]]), byZone: new Map([['z1', 1.234]]), byColorModule: new Map([['a', new Map([['VBX-01', 1.234]])], ['b', new Map([['VBX-02', 0.5]])]]), noEffect: new Set(['z2']) },
      'Test',
    );
    const wb = readXlsx(bytes);
    expect(wb.sheets.map((s) => s.name)).toEqual(['Couleurs', 'Par Viewbox', 'Zones']);
    const colors = wb.sheets[0].rows.map((r) => r.map(cellText));
    expect(colors[3].slice(0, 4)).toEqual(['P1', 'RAL 9005', 'Noir foncé', 'mat']);
    expect(colors[3][7]).toBe('1.23');
    const zones = wb.sheets[2].rows.map((r) => r.map(cellText));
    expect(zones[2][4]).toBe('sans effet');
    expect(wb.sheets[1].rows[1].map(cellText)[0]).toBe('VBX-01');
  });
});
