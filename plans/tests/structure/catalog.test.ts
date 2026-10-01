// Catalogue des sections et bibliothèque de départ : les générateurs paramétriques retrouvent les valeurs des annexes
// SCIA (statico 24-0571), la bibliothèque est cohérente (clés uniques, unités, masses linéiques).
import { describe, expect, it } from 'vitest';
import { bucklingReduction, chs, coldFormedU, rectangle, rhs, roundBar, weldedT } from '../../src/structure/core/catalog';
import { materialByKey, MATERIALS, steelStrength } from '../../src/structure/core/materials';
import { KN_PER_CM, KNCM_PER_DEG, fmt, fmtNumber, kgPerCm2ToKnPerM2, tPerM2ToKnPerM2 } from '../../src/structure/core/units';
import { DEFAULTS } from '../../src/structure/library/defaults';
import { SEED, SEED_CONNECTIONS, SEED_MODULES, SEED_SECTIONS, seedSection } from '../../src/structure/library/seed';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('générateurs de sections', () => {
  it('rectangle et rond : formules exactes', () => {
    const r = rectangle(50, 150);
    expect(r.A).toBe(7500);
    expect(r.Iy).toBeCloseTo((50 * 150 ** 3) / 12, 6);
    // torsion de Roark : 493,77 cm⁴ dans l'annexe SCIA pour 150 × 50
    expect(rel(r.It, 493.77e4)).toBeLessThan(0.001);
    const d = roundBar(20);
    expect(rel(d.A, 314.16)).toBeLessThan(1e-4);
    const t = chs(42.4, 2);
    expect(rel(t.A, Math.PI * (42.4 ** 2 - 38.4 ** 2) / 4)).toBeLessThan(1e-12);
  });

  it('T soudé des réceptions de pied : valeurs de l’annexe SCIA', () => {
    const s = weldedT(215, 10, 130, 15);
    const ref = seedSection('T-FOOT-CORNER').section;
    for (const k of ['A', 'Iy', 'Iz', 'Wely', 'Welz', 'Wply', 'Wplz'] as const) expect(rel(s[k]!, ref[k]!)).toBeLessThan(0.001);
    const m = weldedT(55, 10, 130, 15);
    const rm = seedSection('T-FOOT-MIDDLE').section;
    for (const k of ['A', 'Iy', 'Iz', 'Wely', 'Welz', 'Wply', 'Wplz'] as const) expect(rel(m[k]!, rm[k]!)).toBeLessThan(0.002);
  });

  it('tubes rectangulaires : à 1,5 % des valeurs SCIA', () => {
    const cases: Array<[string, number, number, number, 'hot-finished' | 'cold-formed']> = [
      ['QHP100x5', 100, 100, 5, 'hot-finished'],
      ['RHP120x60x4', 120, 60, 4, 'hot-finished'],
      ['QHP80x3-CF', 80, 80, 3, 'cold-formed'],
    ];
    for (const [key, h, b, t, fab] of cases) {
      const s = rhs(h, b, t, fab);
      const ref = seedSection(key).section;
      for (const k of ['A', 'Iy', 'Iz', 'Wely', 'Welz', 'Wply', 'Wplz', 'It'] as const) expect(rel(s[k]!, ref[k]!), `${key} ${k}`).toBeLessThan(0.015);
    }
  });

  it('U et C pliés à froid (rayon intérieur 1,5 t) : à 1,5 % des valeurs SCIA', () => {
    const cases: Array<[string, number, number, number]> = [
      ['U200x80x5-CF', 200, 80, 5],
      ['C220x80x4-CF', 220, 80, 4],
    ];
    for (const [key, h, b, t] of cases) {
      const s = coldFormedU(h, b, t);
      const ref = seedSection(key).section;
      for (const k of ['A', 'Iy', 'Iz', 'Wely', 'Wply', 'Wplz'] as const) expect(rel(s[k]!, ref[k]!), `${key} ${k}`).toBeLessThan(0.015);
      expect(rel(s.It, ref.It), `${key} It`).toBeLessThan(0.05);
    }
  });

  it('coefficient de flambement χ (EC3 6.3.1.2)', () => {
    expect(bucklingReduction(0.1, 'c')).toBe(1);
    // valeurs du tableau de référence de l'EC3 (λ̄ = 1,0) : a 0,666 ; b 0,597 ; c 0,540 ; d 0,467
    expect(bucklingReduction(1.0, 'a')).toBeCloseTo(0.666, 3);
    expect(bucklingReduction(1.0, 'b')).toBeCloseTo(0.597, 3);
    expect(bucklingReduction(1.0, 'c')).toBeCloseTo(0.54, 3);
    expect(bucklingReduction(1.0, 'd')).toBeCloseTo(0.467, 3);
    // plat 50 × 10 en console (statico A23) : λ̄ = 0,369 → χ = 0,914 (courbe c)
    expect(bucklingReduction(0.369, 'c')).toBeCloseTo(0.914, 3);
  });
});

describe('matériaux', () => {
  it('limites d’élasticité par épaisseur', () => {
    expect(steelStrength(materialByKey('S235')!, 15)).toEqual({ fy: 235, fu: 360 });
    expect(steelStrength(materialByKey('S235')!, 50)).toEqual({ fy: 215, fu: 360 });
    expect(steelStrength(materialByKey('S275')!, 5)).toEqual({ fy: 275, fu: 430 });
    expect(steelStrength(materialByKey('S275')!, 100)).toBeUndefined();
  });
  it('chaque matériau a une source et des valeurs positives', () => {
    const keys = new Set<string>();
    for (const m of MATERIALS) {
      expect(keys.has(m.key)).toBe(false);
      keys.add(m.key);
      expect(m.source.length).toBeGreaterThan(3);
      expect(m.rho).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('bibliothèque de départ', () => {
  it('clés uniques par genre, sources renseignées', () => {
    const seen = new Set<string>();
    for (const e of SEED) {
      const k = `${e.kind}:${e.key}`;
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
      expect(e.source.length, k).toBeGreaterThan(0);
    }
  });

  it('masses linéiques cohérentes avec A × 7 850 kg/m³ (± 3 %)', () => {
    for (const s of SEED_SECTIONS) {
      if (s.section.massless || !s.section.kgPerM || s.material === 'C24') continue;
      expect(rel((s.section.A * 1e-6 * 7850), s.section.kgPerM), s.key).toBeLessThan(0.03);
    }
  });

  it('les sections du gabarit Viewbox existent, ressorts du modèle SCIA', () => {
    const vbx = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
    for (const key of Object.values(vbx.params!.sections)) expect(() => seedSection(key)).not.toThrow();
    // 3 500 kNcm/deg ≈ 2,005·10⁹ N·mm/rad ; 50 kN/cm = 5 000 N/mm
    expect(vbx.params!.springs.columnRotation).toBeCloseTo(3500 * KNCM_PER_DEG, 0);
    expect(rel(vbx.params!.springs.columnRotation, 2.0054e9)).toBeLessThan(1e-4);
    expect(vbx.params!.springs.boltTranslation).toBe(50 * KN_PER_CM);
    expect(vbx.params!.springs.boltTranslation).toBe(5000);
    expect(SEED_MODULES.find((m) => m.key === 'VIEWBOX-8400-EU')!.status).toBe('unknown');
  });

  it('capacités d’assemblages : minimum retenu = valeur déterminante des rapports', () => {
    const minOf = (key: string, keys: string[]) => Math.min(...SEED_CONNECTIONS.find((c) => c.key === key)!.capacities.filter((c) => keys.includes(c.key)).map((c) => c.value));
    expect(minOf('VBX-VERTICAL-CONTACT', ['NRd_flat', 'NRd_buckling', 'NRd_weld', 'VRd_cover', 'NRd_wall'])).toBe(176e3);
    expect(minOf('VBX-BRACING', ['NplRd', 'NuRd', 'FbRd_vbx', 'FbRd_turnbuckle', 'FRd_turnbuckle', 'FvRd_M20'])).toBeCloseTo(39.8e3, 6);
    // capacités recalculées à partir des formules des rapports
    expect((((10 - 2.2) * 1.0 ** 2) / 4) * 23.5 + ((10 * 1.0 ** 2) / 4) * 23.5).toBeCloseTo(45.82 + 58.75, 1);
    expect(((45.82 + 58.75) / 18).toFixed(2)).toBe('5.81');
    expect(0.9 * (6.0 - 2.4) * 0.6 * 36 / 1.25).toBeCloseTo(56.0, 1);
    expect(((8 * 0.5 ** 2) / 4) * 23.5 / 3.6).toBeCloseTo(3.26, 2);
    expect(SEED_CONNECTIONS.find((c) => c.key === 'VBX-JACK')!.status).toBe('unknown');
  });

  it('valeurs par défaut de l’annexe B', () => {
    expect(DEFAULTS.liveLoad.value).toBeCloseTo(3.5e-3, 12);
    expect(DEFAULTS.wall.value).toBe(0.5);
    expect(DEFAULTS.bearing.value).toBeCloseTo(0.2, 12);
    expect(DEFAULTS.sway.value).toBe(1 / 200);
    for (const v of Object.values(DEFAULTS)) expect(v.source.length).toBeGreaterThan(3);
  });
});

describe('unités', () => {
  it('conversions et affichage à la française', () => {
    expect(fmt(12500, 'kN')).toBe('12,50 kN');
    expect(fmt(-2.5e6, 'kNm', 1)).toBe('−2,5 kNm');
    expect(fmtNumber(1234567.891, 1)).toBe('1 234 567,9');
    // 20 t/m² ≈ 196 kN/m² ; 2 kg/cm² ≈ 196 kN/m²
    expect(tPerM2ToKnPerM2(20)).toBeCloseTo(196.2, 1);
    expect(kgPerCm2ToKnPerM2(2)).toBeCloseTo(196.2, 1);
  });
});
