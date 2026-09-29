// Solveur 3D : appuis en compression seule, barres en traction / compression seule, 2ᵉ ordre (P-Δ / P-δ),
// factorisation creuse comparée à un calcul plein.
import { describe, expect, it } from 'vitest';
import { analyze } from '../../src/structure/core/fem/analysis';
import { FemError } from '../../src/structure/core/fem/types';
import { buildGraph } from '../../src/structure/core/fem/ordering';
import { blockSlot, factorize, makePattern, solveFactor } from '../../src/structure/core/fem/sparse';
import { E, ModelBuilder, SEC, UNP, force, load, rel } from './femHelpers';

describe('appuis en compression seule', () => {
  // poutre continue sur trois appuis, charge au milieu de la première travée : l'appui de rive C doit tirer
  const build = (compressionOnly: boolean) => {
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const Bn = b.node('B', 3000, 0, 0);
    const C = b.node('C', 6000, 0, 0);
    const M = b.node('M', 1500, 0, 0);
    b.member('AM', A, M, {}, UNP);
    b.member('MB', M, Bn, {}, UNP);
    b.member('BC', Bn, C, {}, UNP);
    b.support(A, ['fixed', 'fixed', 'fixed', 'fixed', 'free', 'free'], { compressionOnly });
    b.support(Bn, ['free', 'fixed', 'fixed', 'free', 'free', 'free']);
    b.support(C, ['free', 'fixed', 'fixed', 'free', 'free', 'free'], { compressionOnly, upliftReleases: 'vertical' });
    return { model: b.model, M };
  };
  const P = 10e3;

  it('sans non-linéarité : réaction de rive −3P/32 (traction)', () => {
    const { model, M } = build(false);
    const [r] = analyze(model, [load('P', { nodal: [force(M, { fy: -P })] })]);
    expect(rel(r.reactions[2].R[1], (-3 * P) / 32)).toBeLessThan(1e-9);
  });

  it('en compression seule : l’appui C se soulève, A et B reprennent P/2 chacun', () => {
    const { model, M } = build(true);
    const [r] = analyze(model, [load('P', { nodal: [force(M, { fy: -P })] })]);
    expect(r.reactions[2].lifted).toBe(true);
    expect(r.reactions[2].R[1]).toBe(0);
    expect(rel(r.reactions[0].R[1], P / 2)).toBeLessThan(1e-9);
    expect(rel(r.reactions[1].R[1], P / 2)).toBeLessThan(1e-9);
    expect(r.iterations).toBeGreaterThanOrEqual(2);
    // l'appui soulevé monte réellement
    expect(r.displacements[2 * 6 + 1]).toBeGreaterThan(0);
  });
});

describe('barres en traction seule (contreventement)', () => {
  const L = 2500;
  const h = 2790;
  const H = 15e3;
  const build = (withBoth: boolean) => {
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const Bn = b.node('B', 0, h, 0);
    const C = b.node('C', L, h, 0);
    const D = b.node('D', L, 0, 0);
    const bar = { A: 360, Iy: 0, Iz: 0, It: 0 };
    b.member('AB', A, Bn, { kind: 'truss' }, SEC);
    b.member('BC', Bn, C, { kind: 'truss' }, SEC);
    b.member('DC', D, C, { kind: 'truss' }, SEC);
    if (withBoth) b.member('AC', A, C, { kind: 'truss', nonlinear: 'tensionOnly' }, bar);
    b.member('BD', Bn, D, { kind: 'truss', nonlinear: 'tensionOnly' }, bar);
    b.support(A, 'pinned');
    b.support(D, 'pinned');
    // hors plan : B et C tenus en z
    b.support(Bn, ['free', 'free', 'fixed', 'free', 'free', 'free']);
    b.support(C, ['free', 'free', 'fixed', 'free', 'free', 'free']);
    return { model: b.model, B: Bn };
  };

  it('seule la diagonale tendue travaille : N = H · diag / L', () => {
    const { model, B } = build(true);
    const [r] = analyze(model, [load('H', { nodal: [force(B, { fx: H })] })]);
    const ac = r.members.find((m) => m.id === 'AC')!;
    const bd = r.members.find((m) => m.id === 'BD')!;
    expect(bd.active).toBe(false);
    expect(ac.active).toBe(true);
    expect(rel(ac.stations[0].N, (H * Math.hypot(L, h)) / L)).toBeLessThan(1e-6);
    expect(bd.stations.every((s) => s.N === 0)).toBe(true);
  });

  it('sens inverse : l’autre diagonale prend le relais', () => {
    const { model, B } = build(true);
    const [r] = analyze(model, [load('H', { nodal: [force(B, { fx: -H })] })]);
    expect(r.members.find((m) => m.id === 'AC')!.active).toBe(false);
    expect(rel(r.members.find((m) => m.id === 'BD')!.stations[0].N, (H * Math.hypot(L, h)) / L)).toBeLessThan(1e-6);
  });

  it('diagonale comprimée seule : mécanisme signalé', () => {
    const { model, B } = build(false);
    expect(() => analyze(model, [load('H', { nodal: [force(B, { fx: H })] })])).toThrowError(FemError);
  });
});

describe('2ᵉ ordre', () => {
  const Lc = 3080;
  const EI = E * SEC.Iy;
  const Pcr = (Math.PI ** 2 * EI) / (4 * Lc * Lc);
  const column = (segments = 8) => {
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const T = b.node('T', 0, Lc, 0);
    b.member('col', A, T, { segments });
    b.support(A, 'fixed');
    return { model: b.model, T };
  };
  const H = 1e3;

  it('mât comprimé : flèche exacte H (tan kL − kL) / (P k) à 0,5 %', () => {
    const { model, T } = column();
    for (const ratio of [0.3, 0.5, 0.7]) {
      const P = ratio * Pcr;
      const [r] = analyze(model, [load('PH', { nodal: [force(T, { fx: H, fy: -P })] })], { secondOrder: true });
      const k = Math.sqrt(P / EI);
      const exact = (H * (Math.tan(k * Lc) - k * Lc)) / (P * k);
      expect(rel(r.displacements[T * 6], exact)).toBeLessThan(0.005);
    }
  });

  it('amplification 1 / (1 − N/Ncr) retrouvée à 2 % (N = 0,3 Ncr)', () => {
    const { model, T } = column();
    const P = 0.3 * Pcr;
    const [r1] = analyze(model, [load('PH', { nodal: [force(T, { fx: H, fy: -P })] })]);
    const [r2] = analyze(model, [load('PH', { nodal: [force(T, { fx: H, fy: -P })] })], { secondOrder: true });
    const amp = r2.displacements[T * 6] / r1.displacements[T * 6];
    expect(rel(amp, 1 / (1 - 0.3))).toBeLessThan(0.02);
    // moment d'encastrement du 2ᵉ ordre : H·L + P·δ
    expect(rel(Math.abs(r2.reactions[0].R[5]), H * Lc + P * r2.displacements[T * 6])).toBeLessThan(1e-6);
  });

  it('traction : la flèche diminue (H (kL − th kL) / (P k))', () => {
    const { model, T } = column();
    const P = 0.5 * Pcr;
    const [r] = analyze(model, [load('PH', { nodal: [force(T, { fx: H, fy: P })] })], { secondOrder: true });
    const k = Math.sqrt(P / EI);
    const exact = (H * (k * Lc - Math.tanh(k * Lc))) / (P * k);
    expect(rel(r.displacements[T * 6], exact)).toBeLessThan(0.005);
  });

  it('au-delà de la charge critique : instabilité signalée', () => {
    const { model, T } = column();
    let err: unknown;
    try {
      analyze(model, [load('PH', { nodal: [force(T, { fx: H, fy: -1.05 * Pcr })] })], { secondOrder: true });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(FemError);
    expect(['instability', 'no-convergence']).toContain((err as FemError).code);
  });

  it('efforts intermédiaires : moment du 2ᵉ ordre le long du mât (P-δ dans chaque élément)', () => {
    const { model, T } = column(4);
    const P = 0.5 * Pcr;
    const [r] = analyze(model, [load('PH', { nodal: [force(T, { fx: H, fy: -P })] })], { secondOrder: true, stations: 5 });
    const k = Math.sqrt(P / EI);
    const d = r.displacements[T * 6];
    // M(x) = H (L − x) + P (δ − w(x)), w(x) solution exacte de la poutre-colonne
    const w = (x: number) => (H / (P * k)) * (Math.tan(k * Lc) * (1 - Math.cos(k * x)) - k * x + Math.sin(k * x));
    for (const s of r.members[0].stations) {
      const expected = H * (Lc - s.x) + P * (d - w(s.x));
      expect(Math.abs(Math.abs(s.My) - expected)).toBeLessThan(0.01 * H * Lc);
    }
  });
});

describe('factorisation creuse par blocs', () => {
  it('égale à une résolution pleine sur une matrice aléatoire', () => {
    // graphe en grille 3D 5 × 4 × 3, blocs aléatoires, matrice rendue définie positive par diagonale dominante
    const nx = 5;
    const ny = 4;
    const nz = 3;
    const n = nx * ny * nz;
    const id = (x: number, y: number, z: number) => x + nx * (y + ny * z);
    const edges: number[] = [];
    const coords: number[] = [];
    for (let z = 0; z < nz; z++)
      for (let y = 0; y < ny; y++)
        for (let x = 0; x < nx; x++) {
          coords.push(x, y, z);
          if (x + 1 < nx) edges.push(id(x, y, z), id(x + 1, y, z));
          if (y + 1 < ny) edges.push(id(x, y, z), id(x, y + 1, z));
          if (z + 1 < nz) edges.push(id(x, y, z), id(x, y, z + 1));
          if (x + 1 < nx && y + 1 < ny) edges.push(id(x, y, z), id(x + 1, y + 1, z));
        }
    const g = buildGraph(n, edges);
    const p = makePattern(g, coords);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    const dense = new Float64Array(n * 6 * n * 6);
    const N = n * 6;
    for (let e = 0; e < edges.length; e += 2) {
      const a = edges[e];
      const b = edges[e + 1];
      for (let r = 0; r < 6; r++)
        for (let c = 0; c < 6; c++) {
          const v = rnd();
          dense[(a * 6 + r) * N + b * 6 + c] += v;
          dense[(b * 6 + c) * N + a * 6 + r] += v;
        }
    }
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < N; j++) if (j !== i) s += Math.abs(dense[i * N + j]);
      dense[i * N + i] = s + 1 + Math.abs(rnd());
    }
    const values = new Float64Array(p.colPtr[n] * 36);
    const put = (a: number, b: number) => {
      const { slot, transposed } = blockSlot(p, a, b);
      const [ra, cb] = transposed ? [b, a] : [a, b];
      for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) values[slot * 36 + r * 6 + c] = dense[(ra * 6 + r) * N + cb * 6 + c];
    };
    for (let v = 0; v < n; v++) put(v, v);
    for (let e = 0; e < edges.length; e += 2) put(edges[e], edges[e + 1]);
    const f = factorize(p, values);
    const b = Array.from({ length: N }, () => rnd());
    const x = solveFactor(f, b);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let j = 0; j < N; j++) s += dense[i * N + j] * x[j];
      expect(Math.abs(s - b[i])).toBeLessThan(1e-9);
    }
  });
});
