// Plancher en contreplaqué : vecteurs des notes statico 24-0571 (Hoka § 3.5, avec pression intérieure) et 24-0569
// (Qatar § 3.3, sans) — vRd 5,17 kN/m, mRd 49,84 kNcm/m. statico arrondit qEd au centième avant de multiplier
// (5,56 → mEd 44,48 ; 5,17 → 41,36) : l'outil garde la valeur exacte (44,52 ; 41,32).
import { describe, expect, it } from 'vitest';
import { checkPlywoodStrip } from '../../src/structure/core/checks/plywood';

const base = { material: 'CP-F20/15', thickness: 18, span: 800, kmod: 0.8, gammaM: 1.3, g: 0.4e-3, q: 3.5e-3, gammaG: 1.1, gammaQ: 1.35, gammaW: 1.35, label: 'plancher' };

describe('contreplaqué des planchers (méthode statico)', () => {
  it('Hoka : qEd 5,56 kN/m² → vEd 2,22 ≤ 5,17 kN/m ; mEd 44,48 ≤ 49,84 kNcm/m', () => {
    const r = checkPlywoodStrip({ ...base, internal: 0.8 * 0.37e-3 });
    const w = r.records[0].withValues;
    for (const v of ['vRd = 5,17 kN/m', 'mRd = 49,85 kNcm/m', '= 5,56 kN/m²', 'vEd = 2,23 kN/m', 'mEd = 44,52 kNcm/m']) expect(w).toContain(v);
    expect(Math.abs(r.eta - 44.48 / 49.84)).toBeLessThan(2e-3);
  });
  it('Qatar : qEd 5,17 kN/m² → mEd 41,36 kNcm/m', () => {
    const r = checkPlywoodStrip({ ...base, internal: 0 });
    expect(r.records[0].withValues).toContain('= 5,17 kN/m²');
    expect(Math.abs(r.eta - 41.36 / 49.84)).toBeLessThan(2e-3);
  });
  it('matériau sans résistances : bloqué', () => {
    expect(checkPlywoodStrip({ ...base, internal: 0, material: 'CP-F40/30' }).blocked).toBeTruthy();
  });
});
