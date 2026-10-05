// Vérifications EC3 contre les impressions SCIA de la note statico 24-0569 « Qatar » (annexe B, § 6.2) : mêmes efforts,
// mêmes coefficients (γM0 = γM1 = 1,10, méthode statico : longueurs de flambement nulles, Cm = 0,9) → mêmes taux.
import { describe, expect, it } from 'vitest';
import { checkSpan, classify, EC3_DEFAULTS, momentFactor } from '../../src/structure/core/checks/ec3';
import type { StationForces } from '../../src/structure/core/checks/ec3';
import { materialByKey } from '../../src/structure/core/materials';
import { seedSection } from '../../src/structure/library/seed';

const kN = 1e3;
const kNm = 1e6;
const st = (x: number, f: Partial<Omit<StationForces, 'x'>>): StationForces => ({ x, N: 0, Vy: 0, Vz: 0, T: 0, My: 0, Mz: 0, ...f });
const statico = { ...EC3_DEFAULTS, method: 'statico' as const };
const classic = { ...EC3_DEFAULTS, method: 'classic' as const };
const S275 = materialByKey('S275')!;
const S235 = materialByKey('S235')!;
// poteau QHP 100 × 5 en courbe c (tube formé à froid) : la bibliothèque suit l'annexe SCIA 18-0573 (courbe a)
const col = { ...seedSection('QHP100x5').section, curveY: 'c' as const, curveZ: 'c' as const };
const unp = seedSection('UNP220').section;

describe('EC3 — impressions SCIA statico (Qatar)', () => {
  // poteau B107, NC_CO13 : section critique en pied, Mz maxi 3,18 kNm ailleurs sur la barre
  const B107 = [st(0, { N: -39.28 * kN, Vy: -1.28 * kN, Vz: 5.46 * kN, T: 0.21 * kNm, My: -10.57 * kNm, Mz: 2.88 * kNm }), st(2790, { N: -39.28 * kN, My: 2.0 * kNm, Mz: -3.18 * kNm })];

  it('poteau QHP 100 × 5 S275 (B107) : classe 1, (6.41) 0,52, (6.61) 0,76, (6.62) 0,60', () => {
    const r = checkSpan({ key: 'B107', label: 'Stütze B107', section: col, material: S275, length: 2790, stations: B107 }, statico, true);
    expect(r.cls).toBe(1);
    expect(r.parts.N).toBeCloseTo(0.08, 2);
    expect(r.parts.My).toBeCloseTo(0.63, 2);
    expect(r.parts.Mz).toBeCloseTo(0.19, 2); // 3,18 / 16,68 (SCIA : 0,17 avec Mz 2,88 à la section critique)
    expect(r.parts.Vz).toBeCloseTo(0.04, 2);
    expect(r.parts.Vy).toBeCloseTo(0.01, 2);
    expect(r.parts.T).toBeCloseTo(0.02, 2);
    expect(r.parts['6.41']).toBeCloseTo(0.52, 2);
    expect(r.parts['6.61']).toBeCloseTo(0.76, 2);
    expect(r.parts['6.62']).toBeCloseTo(0.6, 2);
    expect(r.eta).toBeCloseTo(0.76, 2);
    expect(r.governing).toBe('6.61');
    expect(r.records.map((x) => x.key)).toEqual(['B107.section', 'B107.stab']);
    expect(r.records[1].withValues).toContain('0,08 + 0,57 + 0,10 = 0,76');
  });

  it('classement des parois du QHP 100 × 5 comme SCIA (c/t 17, limites 30,51 / 35,13 / 44,03 pour ψ = 0,64)', () => {
    const c = classify(col, B107[0], 275);
    const flange = c.parts.find((p) => Math.abs(p.psi - 0.64) < 0.01)!;
    expect(flange.ct).toBeCloseTo(17, 6);
    expect(flange.limits[0]).toBeCloseTo(30.51, 1);
    expect(flange.limits[1]).toBeCloseTo(35.13, 1);
    expect(flange.limits[2]).toBeCloseTo(44.03, 1);
    const web = c.parts.find((p) => Math.abs(p.alpha - 0.72) < 0.01)!;
    expect(web.limits[0]).toBeCloseTo(43.94, 0);
    expect(web.limits[2]).toBeCloseTo(71.86, 0);
  });

  it('rive UNP 220 S235 (B404, traction + flexion) : addition linéaire 0,01 + 0,82 + 0,06 = 0,90', () => {
    const B404 = [st(2500, { N: 8.1 * kN, Vy: -3.22 * kN, Vz: 3.43 * kN, T: 0.01 * kNm, My: 51.37 * kNm, Mz: -0.87 * kNm })];
    const r = checkSpan({ key: 'B404', label: 'Randträger B404', section: unp, material: S235, length: 1200, stations: B404 }, statico, true);
    expect(r.cls).toBe(1);
    expect(r.parts.N).toBeCloseTo(0.01, 2);
    expect(r.parts.My).toBeCloseTo(0.82, 2);
    expect(r.parts.Mz).toBeCloseTo(0.06, 2);
    expect(r.parts['6.2']).toBeCloseTo(0.9, 2);
    expect(r.eta).toBeCloseTo(0.9, 2);
    // résistances SCIA : Npl 799,00 ; Mpl,y 62,38 ; Mpl,z 13,69 ; Vpl,y 246,69 (Av 20,00) ; Vpl,z 247,77 (Av 20,09)
    const w = r.records[0].withValues;
    for (const v of ['799,00 kN', '62,38 kNm', '13,69 kNm', '246,69 kN', '247,77 kN']) expect(w).toContain(v);
    // âme : ψ = −0,94, α = 0,52, c/t = 18,89, limite classe 1 = 69,36 ; aile en saillie c/t 4,68, limites 9 / 10 / 14,44
    const c = classify(unp, B404[0], 235);
    const webPart = c.parts.find((p) => p.part.id === 'âme')!;
    expect(webPart.ct).toBeCloseTo(18.89, 2);
    expect(webPart.alpha).toBeCloseTo(0.52, 1);
    expect(webPart.limits[0]).toBeCloseTo(69.36, -0.5);
  });

  it('Cm (tableau B.3) : Mh −10,57, Ms −3,07, ψ −0,77 → CmLT 0,43 comme SCIA', () => {
    const r = momentFactor([0, 1395, 2790], [-10.57, -3.07, 8.14]);
    expect(r.alphaS).toBeCloseTo(0.29, 2);
    expect(r.cm).toBeCloseTo(0.43, 2);
    // diagramme linéaire : Cm = 0,6 + 0,4 ψ ≥ 0,4
    expect(momentFactor([0, 500, 1000], [10, 5, 0]).cm).toBeCloseTo(0.6, 6);
    expect(momentFactor([0, 500, 1000], [10, 0, -10]).cm).toBeCloseTo(0.4, 6);
    // moment uniforme
    expect(momentFactor([0, 500, 1000], [10, 10, 10]).cm).toBeCloseTo(1, 6);
  });
});

describe('EC3 — méthode par défaut (flambement sur la longueur du tronçon)', () => {
  it('poteau 2,79 m : λ̄ = 0,83, χc = 0,64 ; l’enveloppe retient la plus sévère des deux méthodes', () => {
    const span = (My1: number) => ({ key: 'c', label: 'poteau', section: col, material: S275, length: 2790, stations: [st(0, { N: -100 * kN, My: -5 * kNm }), st(2790, { N: -100 * kN, My: My1 * kNm })] });
    const d = checkSpan(span(-5), classic, true);
    expect(d.records[1].withValues).toContain('λ̄y = 0,83');
    expect(d.records[1].withValues).toContain('χy = 0,64');
    // moment uniforme : la méthode classique est la plus sévère ; moments opposés (Cm 0,4) : statico
    expect(d.eta).toBeGreaterThan(checkSpan(span(-5), statico).eta);
    expect(checkSpan(span(-5)).method).toBe('classic');
    expect(checkSpan(span(5), classic).eta).toBeLessThan(checkSpan(span(5), statico).eta);
    const env = checkSpan(span(5));
    expect(env.method).toBe('statico');
    expect(env.eta).toBeCloseTo(checkSpan(span(5), statico).eta, 12);
    // traction seule : pas de flambement
    const t = checkSpan({ key: 't', label: 'tirant', section: col, material: S275, length: 2790, stations: [st(0, { N: 200 * kN }), st(2790, { N: 200 * kN })] });
    expect(t.eta).toBeCloseTo((200 * kN) / ((1880 * 275) / 1.1), 6);
  });

  it('rive UNP 220 : déversement (courbe d) sur un tronçon de 1,2 m, sans effet sensible ; 3 m : χLT < 1', () => {
    const at = (L: number) => [st(0, { My: 20 * kNm }), st(L / 2, { My: 25 * kNm }), st(L, { My: 20 * kNm })];
    const short = checkSpan({ key: 'r', label: 'rive', section: unp, material: S235, length: 1200, stations: at(1200) }, classic);
    const long = checkSpan({ key: 'r', label: 'rive', section: unp, material: S235, length: 3000, stations: at(3000) }, classic, true);
    expect(long.eta).toBeGreaterThan(short.eta);
    expect(long.governing).toBe('6.54');
  });

  it('classe 4 : contraintes réduites (EN 1993-1-5 § 10) ; paroi beaucoup trop élancée : bloqué', () => {
    // réception de pied T 215 × 10 / 130 × 15 : âme en saillie c/t = 20 comprimée → ρ < 1
    const foot = seedSection('T-FOOT-CORNER').section;
    const N = -50 * kN;
    const r = checkSpan({ key: 'f', label: 'pied', section: foot, material: S235, length: 219, stations: [st(0, { N }), st(219, { N })] }, classic, true);
    expect(r.cls).toBe(4);
    expect(r.blocked).toBeUndefined();
    const m = /ρ = (\d+,\d+)/.exec(r.records[0].withValues)!;
    const rho = Number(m[1].replace(',', '.'));
    expect(rho).toBeGreaterThan(0.5);
    expect(rho).toBeLessThan(1);
    expect(r.parts.N).toBeCloseTo(-N / ((foot.A * rho * 235) / 1.1), 2);
    const thin = { ...col, name: 'QHP 100 × 0,3', dims: { h: 100, b: 100, t: 0.3 } };
    const b = checkSpan({ key: 'x', label: 'x', section: thin, material: S275, length: 1000, stations: [st(0, { N: -10 * kN })] });
    expect(b.blocked).toContain('classe 4');
    expect(b.eta).toBe(Infinity);
  });
});
