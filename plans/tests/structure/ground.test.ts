// Sol et calage : les 9 vecteurs de plaques du cahier des charges (§ 11.5, tirés des notes statico Hoka et Qatar, cas
// Hoka « 2 angles » corrigé à 0,22 kN/cm²), choix dans le commerce et le stock, tôle, diffusion, longrine sur sol
// élastique (solution exacte de Hetényi), estimation des réactions, critère « sol à 50 kN/m² ».
import { describe, expect, it } from 'vitest';
import {
  bearingFrom,
  checkLongrine,
  chooseFromStock,
  choosePlywood,
  designGroup,
  diffusionDepth,
  sizePlate,
  steelPlate,
} from '../../src/structure/core/ground';
import { ESTIMATE_DEFAULTS, estimateReactions, gridModules } from '../../src/structure/core/estimate';
import type { EstimateOptions } from '../../src/structure/core/estimate';
import { computeCalage } from '../../src/structure/core/calage';
import { C24_BEAMS } from '../../src/structure/core/ground';

const kNm2 = (v: number) => v * 1e-3;

describe('plaques de calage (vecteurs § 11.5)', () => {
  // [cas, Rz,Ed kN, σadm kN/m², a1, a2 cm, plaque cm, σB kN/m², e cm, MEd kNcm/cm, h1/h2/h3 cm, σc,90,d kN/cm²]
  const cases: Array<[string, number, number, number, number, number, number, number, number, [number, number, number], number]> = [
    ['Hoka 1 angle / 200 (p. A28)', 140, 200, 21, 21, 75, 184, 38.18, 18.14, [7.3, 5.2, 4.2], 0.32],
    ['Hoka 1 angle / 500 (p. A29)', 140, 500, 21, 21, 50, 415, 20.51, 11.77, [5.9, 4.2, 3.4], 0.32],
    ['Hoka 2 angles / 200 (p. A30, 0,22 corrigé)', 193, 200, 42, 21, 85, 198, 38.55, 19.85, [7.6, 5.4, 4.4], 0.22],
    ['Hoka 2 angles / 500 (p. A31, 0,22 corrigé)', 193, 500, 42, 21, 55, 473, 18.2, 10.57, [5.6, 4.0, 3.2], 0.22],
    ['Hoka 4 angles / 200 (p. A32)', 304, 200, 42, 42, 110, 186, 48.08, 29.04, [9.2, 6.5, 5.3], 0.17],
    ['Hoka 4 angles / 500 (p. A33)', 304, 500, 42, 42, 70, 460, 19.8, 12.16, [6.0, 4.2, 3.5], 0.17],
    ['Qatar 1 angle / 200', 85, 200, 21, 21, 60, 175, 27.58, 8.98, [5.1, 3.7, 3.0], 0.19],
    ['Qatar 2 angles a = 21 / 200', 135, 200, 21, 21, 75, 178, 38.18, 17.5, [7.2, 5.1, 4.2], 0.31],
    ['Escalier / 150 (p. A34)', 13, 150, 15, 15, 30, 107, 10.61, 0.81, [1.6, 1.2, 1.2], 0.06],
  ];
  for (const [name, R, sig, a1, a2, side, sB, e, M, h, c90] of cases)
    it(name, () => {
      const r = sizePlate({ RzEd: R * 1e3, bearing: kNm2(sig), a1: a1 * 10, a2: a2 * 10 });
      expect(r.side).toBe(side * 10);
      expect(Math.round(r.sigmaB * 1e3)).toBe(sB);
      expect(Number((r.e / 10).toFixed(2))).toBeCloseTo(e, 2);
      expect(Number((r.MEd / 1e3).toFixed(2))).toBeCloseTo(M, 2);
      expect(r.h.map((x) => x / 10)).toEqual(h);
      expect(Number((r.sigmaC90 / 10).toFixed(2))).toBeCloseTo(c90, 2);
      expect(r.sigmaC90 / 10).toBeLessThan(0.62);
      // chaque étape est tracée
      expect(r.records.map((x) => x.key)).toEqual(['ground.rzk', 'ground.pressure', 'ground.plate.bending', 'ground.plate.c90']);
    });

  it('texte de calcul façon statico', () => {
    const r = sizePlate({ RzEd: 140e3, bearing: kNm2(200), a1: 210, a2: 210 });
    expect(r.records[0].withValues).toBe('Rz,k = 140,00 kN / 1,35 = 103,70 kN');
    expect(r.records[1].withValues).toContain('σB = 103,70 kN / 0,56 m² = 184 kN/m² ≤ 200 kN/m²');
    expect(r.records[2].withValues).toContain('MEd = 140,00 kN / 0,56 m² · (38,18 cm)² / 2 = 18,14 kNcm/cm');
  });

  it('réaction caractéristique directe (ELS) au lieu de Rz,Ed / 1,35', () => {
    const r = sizePlate({ RzEd: 140e3, Rzk: 115e3, bearing: kNm2(200), a1: 210, a2: 210 });
    expect(r.Rzk).toBe(115e3);
    expect(r.side).toBe(800);
  });

  it('portance saisie en t/m² ou kg/cm²', () => {
    expect(bearingFrom(20, 't/m²')).toBeCloseTo(0.1962, 6);
    expect(bearingFrom(2, 'kg/cm²')).toBeCloseTo(0.1962, 6);
    expect(bearingFrom(200, 'kN/m²')).toBeCloseTo(0.2, 12);
  });
});

describe('choix du matériel', () => {
  const base = { RzEd: 140e3, bearing: kNm2(200), a1: 210, a2: 210 };

  it('épaisseurs du commerce : le moins de plaques possible', () => {
    const r = sizePlate(base);
    // erf. W = 8,74 cm³/cm : 4 × 40 mm (3 × 40 mm ne suffit pas : 3 · 40² = 4 800 < 6 · 874)
    expect(choosePlywood(r.Wreq, [18, 21, 24, 27, 30, 40], 36)).toEqual({ t: 40, n: 4, needed: 144 });
    // appui d'escalier : une seule plaque de 18 mm suffit (1,6 cm requis)
    const s = sizePlate({ RzEd: 13e3, bearing: kNm2(150), a1: 150, a2: 150 });
    expect(choosePlywood(s.Wreq, [18, 21, 24, 27, 30, 40], 6)).toEqual({ t: 18, n: 1, needed: 6 });
  });

  it('stock : plaque plus grande recalculée à sa taille, stock insuffisant signalé', () => {
    const stock = [
      { length: 1000, width: 1000, thickness: 27, quantity: 20 },
      { length: 600, width: 600, thickness: 40, quantity: 100 },
    ];
    const res = chooseFromStock(base, stock, 36);
    // 60 × 60 trop petite (75 requis) : seule la 100 × 100 est proposée, recalculée à 100 cm
    expect(res).toHaveLength(1);
    expect(res[0].result.side).toBe(1000);
    expect(res[0].result.MEd).toBeGreaterThan(sizePlate(base).MEd);
    expect(res[0].available! < res[0].needed).toBe(true);
    const d = designGroup({ label: 'angle', groups: 36, ...base, stock });
    const s = d.solutions.find((x) => x.kind === 'plywood-stock')!;
    expect(s.feasible).toBe(false);
    expect(s.remarks.join(' ')).toMatch(/stock insuffisant/);
  });

  it('tôle acier S235 : t = √(6 MEd / fy,d) arrondie à la tôle courante', () => {
    const t = steelPlate(base);
    expect(t.side).toBe(750);
    expect(t.tReq).toBeCloseTo(Math.sqrt((6 * 18140) / 235), 0);
    expect(t.t).toBe(25);
    expect(t.massKg).toBeCloseTo(0.75 * 0.75 * 0.025 * 7850, 6);
  });

  it('diffusion à 45° : (a1 + 2H)(a2 + 2H) = Rz,k / σadm', () => {
    const { H } = diffusionDepth(103.7e3, kNm2(200), 210, 210);
    expect((210 + 2 * H) ** 2).toBeCloseTo(103.7e3 / 0.2, 3);
  });

  it('dalle : charge ponctuelle admissible vérifiée', () => {
    const d = designGroup({ label: 'angle', groups: 4, ...base, pointLoadMax: 80e3 });
    expect(d.point!.eta).toBeCloseTo(103.7 / 80, 2);
  });
});

describe('longrine sur sol élastique', () => {
  it('poutre longue, charge au milieu : pression Pβ/2B et moment P/4β (Hetényi) à 2 %', () => {
    const b = 200;
    const h = 200;
    const k = 0.03;
    const P = 50e3;
    const EI = 11000 * ((b * h ** 3) / 12);
    const beta = ((k * b) / (4 * EI)) ** 0.25;
    const r = checkLongrine({ loads: [{ x: 10000, Pk: P, PEd: P }], length: 20000, beam: { b, h }, count: 1, k, bearing: 1, contact: 210, tensionless: false });
    expect(Math.abs(r.pMaxK - (P * beta) / (2 * b)) / ((P * beta) / (2 * b))).toBeLessThan(0.02);
    expect(Math.abs(r.MEd - P / (4 * beta)) / (P / (4 * beta))).toBeLessThan(0.02);
    // sol réel sans traction : la longrine décolle au loin, la pression maxi augmente
    const t = checkLongrine({ loads: [{ x: 10000, Pk: P, PEd: P }], length: 20000, beam: { b, h }, count: 1, k, bearing: 1, contact: 210 });
    expect(t.pMaxK).toBeGreaterThan(r.pMaxK);
  });

  it('équilibre : Σ pressions × surface = Σ charges ; pression uniforme plus défavorable en flexion', () => {
    const loads = [
      { x: 155, Pk: 80e3, PEd: 110e3 },
      { x: 5845, Pk: 80e3, PEd: 110e3 },
    ];
    const r = checkLongrine({ loads, length: 6000, beam: C24_BEAMS[3], count: 2, k: 0.03, bearing: kNm2(200), contact: 210 });
    expect(r.pUniformK).toBeCloseTo(160e3 / (400 * 6000), 9);
    expect(r.pMaxK).toBeGreaterThan(r.pUniformK);
    expect(r.records.map((x) => x.key)).toEqual(['longrine.pressure', 'longrine.bending', 'longrine.shear', 'longrine.c90']);
  });
});

describe('estimation des réactions', () => {
  const loads = { moduleWeight: 2564 * 9.81, ceiling: kNm2(0.35), floorFinish: kNm2(0.4), live: kNm2(3.5), roofLive: kNm2(3.5), extraPerModule: 0 };
  const calm: EstimateOptions = { ...ESTIMATE_DEFAULTS, loads, windInService: 0, windOutOfService: 0, horizontalRatio: 0, sway: 0 };

  it('groupes d’appuis : 2 × 2 Viewbox → 4 angles seuls, 4 groupes de 2, 1 groupe de 4', () => {
    const e = estimateReactions(gridModules(2, 2, [[1, 1], [1, 1]], false), calm);
    const count = (n: number) => e.groups.filter((g) => g.corners === n).length;
    expect([count(1), count(2), count(4)]).toEqual([4, 4, 1]);
    expect(e.units).toHaveLength(1);
  });

  it('sans action horizontale : chaque angle reprend (G + Q)/4, les niveaux se cumulent', () => {
    const e = estimateReactions(gridModules(1, 1, [[3]], false), calm);
    const A = 5900 * 2500;
    const G = loads.moduleWeight + (loads.ceiling + loads.floorFinish) * A;
    const Q = loads.live * A;
    for (const r of e.reactions) {
      expect(r.Rk).toBeCloseTo((3 * (G + Q)) / 4, 6);
      expect(r.REd).toBeCloseTo(Math.max(1.35 * 3 * G, 1.1 * 3 * G + 1.35 * 3 * Q) / 4, 6);
    }
    expect(e.totalG).toBeCloseTo(3 * G, 6);
  });

  it('basculement d’une Viewbox sous le vent : ΔR = M · s / Σ s²', () => {
    const opt: EstimateOptions = { ...calm, windOutOfService: kNm2(0.37) };
    const e = estimateReactions(gridModules(1, 1, [[1]], false), opt);
    const A = 5900 * 2500;
    const G = loads.moduleWeight + (loads.ceiling + loads.floorFinish) * A;
    // vent selon y (sur le grand côté) : largeur exposée 5 890 mm, bras de levier ± 1 245 mm
    const F = 1.35 * 0.37e-3 * 1.3 * 5890 * 3080;
    const dR = (F * 1540) / (4 * 1245);
    expect(Math.max(...e.reactions.map((r) => r.REd))).toBeCloseTo(Math.max(1.1 * G / 4 + dR, (1.1 * G + 1.35 * loads.live * A) / 4), 3);
    // sans exploitation, le vent hors service fait décoller le côté au vent ?  G/4 − ΔR
    expect(Math.min(...e.reactions.map((r) => r.RkMin))).toBeCloseTo(G / 4 - (F / 1.35) * 1540 / (4 * 1245), 3);
  });

  it('empilement décalé signalé', () => {
    const mods = gridModules(1, 1, [[1]], false);
    mods.push({ ...mods[0], id: 'VBX-99', level: 1, corners: mods[0].corners.map(([x, y]) => [x + 2000, y] as [number, number]) });
    expect(estimateReactions(mods, calm).warnings.join(' ')).toMatch(/décalé/);
  });
});

describe('calage d’une installation', () => {
  const loads = { moduleWeight: 2564 * 9.81, ceiling: kNm2(0.35), floorFinish: kNm2(0.4), live: kNm2(3.5), roofLive: kNm2(3.5), extraPerModule: 0 };
  const input = (bearing: number) => ({
    modules: gridModules(3, 2, [[3, 3, 3], [3, 3, 3]], true),
    estimate: { ...ESTIMATE_DEFAULTS, loads },
    bearing: kNm2(bearing),
    staticoConversion: false,
    thicknesses: [18, 21, 24, 27, 30, 40],
    stock: [],
    commercial: [],
    longrine: { k: 0.03, beams: C24_BEAMS, overhang: 55, maxCount: 6 },
    diffusion: true,
  });

  it('sol à 200 kN/m² : un type par nombre d’angles, une solution retenue, liste de matériel', () => {
    const r = computeCalage(input(200));
    expect(r.types.map((t) => t.corners)).toEqual([1, 2, 4]);
    for (const t of r.types) expect(t.solutions.length).toBeGreaterThanOrEqual(3);
    expect(r.materials.length).toBeGreaterThan(0);
  });

  it('sol à 50 kN/m² : au moins deux solutions chiffrées avec leur matériel', () => {
    const r = computeCalage(input(50));
    for (const t of r.types) {
      const priced = t.solutions.filter((s) => s.materials.length > 0 && Number.isFinite(s.eta));
      expect(priced.length + (r.longrine ? 1 : 0)).toBeGreaterThanOrEqual(2);
    }
    expect(r.materials.length).toBeGreaterThan(0);
    // aucune solution standard pour les piles de 3 niveaux : signalé, la moins mauvaise est quand même chiffrée
    expect(r.types.some((t) => !t.standard)).toBe(true);
    expect(r.warnings.join(' ')).toMatch(/étude de répartition spécifique|Longrines/);
  });
});
