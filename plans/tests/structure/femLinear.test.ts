// Solveur 3D, calcul linéaire : cas analytiques (console, poutre bi-encastrée, portique, cadre en L avec torsion,
// ressorts d'extrémité, charges ponctuelles), équilibre global, invariance par rotation, découpage des barres.
import { describe, expect, it } from 'vitest';
import { analyze, prepare } from '../../src/structure/core/fem/analysis';
import type { FemModel, LoadSet } from '../../src/structure/core/fem/types';
import { FemError } from '../../src/structure/core/fem/types';
import { E, G, ModelBuilder, SEC, UNP, end, force, load, rel } from './femHelpers';

describe('console', () => {
  it('flèche PL³/3EI, réaction P et moment PL à l’encastrement', () => {
    const b = new ModelBuilder();
    const L = 3000;
    const P = 10e3;
    const a = b.node('A', 0, 0, 0);
    const c = b.node('B', L, 0, 0);
    b.member('AB', a, c, {}, UNP);
    b.support(a, 'fixed');
    const [r] = analyze(b.model, [load('P', { nodal: [force(c, { fy: -P })] })]);
    // barre selon X, z local = Y global : flexion verticale autour de l'axe fort (Iy)
    expect(rel(r.displacements[c * 6 + 1], (-P * L ** 3) / (3 * E * UNP.Iy))).toBeLessThan(1e-9);
    expect(rel(r.reactions[0].R[1], P)).toBeLessThan(1e-9);
    expect(rel(r.reactions[0].R[5], P * L)).toBeLessThan(1e-9);
    const st = r.members[0].stations;
    // console : moment d'encastrement −PL (négatif : fibre supérieure tendue), nul au bout
    expect(rel(st[0].My, -P * L)).toBeLessThan(1e-9);
    expect(Math.abs(st[st.length - 1].My)).toBeLessThan(1e-6 * P * L);
    expect(rel(st[0].Vz, -P)).toBeLessThan(1e-9);
  });

  it('même flèche avec la barre découpée en 5 éléments', () => {
    const b = new ModelBuilder();
    const a = b.node('A', 0, 0, 0);
    const c = b.node('B', 0, 0, 2500);
    b.member('AB', a, c, { segments: 5 });
    b.support(a, 'fixed');
    const [r] = analyze(b.model, [load('P', { nodal: [force(c, { fx: 4e3 })] })]);
    expect(rel(r.displacements[c * 6], (4e3 * 2500 ** 3) / (3 * E * SEC.Iz))).toBeLessThan(1e-9);
    expect(r.members[0].stations.length).toBe(5 * 4 + 1);
  });
});

describe('poutre bi-encastrée sous charge répartie', () => {
  const L = 6000;
  const q = 5; // N/mm = 5 kN/m
  const build = (segments: number) => {
    const b = new ModelBuilder();
    const a = b.node('A', 0, 0, 0);
    const c = b.node('B', L, 0, 0);
    b.member('AB', a, c, { segments }, UNP);
    b.support(a, 'fixed');
    b.support(c, 'fixed');
    return b.model;
  };
  const set: LoadSet = load('q', { member: [{ member: 0, kind: 'distributed', dir: 'Y', q1: -q }] });

  it('moments qL²/12 aux appuis, qL²/24 en travée, flèche qL⁴/384EI', () => {
    for (const seg of [1, 4]) {
      const [r] = analyze(build(seg), [set], { stations: 9 });
      expect(rel(r.reactions[0].R[1], (q * L) / 2)).toBeLessThan(1e-9);
      expect(rel(Math.abs(r.reactions[0].R[5]), (q * L * L) / 12)).toBeLessThan(1e-9);
      const st = r.members[0].stations;
      const mid = st.find((s) => Math.abs(s.x - L / 2) < 1e-6)!;
      expect(rel(Math.abs(mid.My), (q * L * L) / 24)).toBeLessThan(1e-9);
      // aux appuis : moment négatif (fibre supérieure tendue), en travée : positif
      expect(Math.sign(st[0].My)).toBe(-Math.sign(mid.My));
    }
  });

  it('flèche à mi-portée qL⁴/384EI (nœud au milieu)', () => {
    const b = new ModelBuilder();
    const a = b.node('A', 0, 0, 0);
    const m = b.node('M', L / 2, 0, 0);
    const c = b.node('B', L, 0, 0);
    b.member('AM', a, m, {}, UNP);
    b.member('MB', m, c, {}, UNP);
    b.support(a, 'fixed');
    b.support(c, 'fixed');
    const [r] = analyze(b.model, [
      load('q', {
        member: [
          { member: 0, kind: 'distributed', dir: 'Y', q1: -q },
          { member: 1, kind: 'distributed', dir: 'Y', q1: -q },
        ],
      }),
    ]);
    expect(rel(r.displacements[m * 6 + 1], (-q * L ** 4) / (384 * E * UNP.Iy))).toBeLessThan(1e-9);
  });
});

describe('charges sur barre', () => {
  it('charge ponctuelle en travée d’une poutre sur deux appuis : réactions et moment Pa(L−a)/L', () => {
    const b = new ModelBuilder();
    const L = 5000;
    const P = 12e3;
    const a = 1500;
    const A = b.node('A', 0, 0, 0);
    const B = b.node('B', L, 0, 0);
    b.member('AB', A, B, {}, UNP);
    b.support(A, ['fixed', 'fixed', 'fixed', 'fixed', 'free', 'free']);
    b.support(B, ['free', 'fixed', 'fixed', 'free', 'free', 'free']);
    const [r] = analyze(b.model, [load('P', { member: [{ member: 0, kind: 'point', dir: 'Y', P: -P, a }] })], { stations: 11 });
    expect(rel(r.reactions[0].R[1], (P * (L - a)) / L)).toBeLessThan(1e-9);
    expect(rel(r.reactions[1].R[1], (P * a) / L)).toBeLessThan(1e-9);
    const st = r.members[0].stations.find((s) => Math.abs(s.x - a) < 1e-6)!;
    expect(rel(st.My, (P * a * (L - a)) / L)).toBeLessThan(1e-9);
  });

  it('charge trapézoïdale partielle : résultante et moment exacts', () => {
    const b = new ModelBuilder();
    const L = 4000;
    const A = b.node('A', 0, 0, 0);
    const B = b.node('B', L, 0, 0);
    b.member('AB', A, B);
    b.support(A, 'fixed');
    // q de 2 à 6 N/mm entre 1 000 et 3 000 mm, vers −Y
    const [r] = analyze(b.model, [load('t', { member: [{ member: 0, kind: 'distributed', dir: 'Y', q1: -2, q2: -6, a: 1000, b: 3000 }] })]);
    const total = ((2 + 6) / 2) * 2000;
    // centre de gravité du trapèze depuis x = 1000 : (a + 2b) / (3 (a + b)) · l
    const xg = 1000 + ((2 + 2 * 6) / (3 * (2 + 6))) * 2000;
    expect(rel(r.reactions[0].R[1], total)).toBeLessThan(1e-9);
    expect(rel(r.reactions[0].R[5], total * xg)).toBeLessThan(1e-9);
  });

  it('charge par projection horizontale sur une barre inclinée', () => {
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const B = b.node('B', 3000, 4000, 0);
    b.member('AB', A, B);
    b.support(A, 'fixed');
    const [r] = analyze(b.model, [load('s', { member: [{ member: 0, kind: 'distributed', dir: 'Y', q1: -1, projected: true }] })]);
    expect(rel(r.reactions[0].R[1], 3000)).toBeLessThan(1e-9);
  });
});

describe('portique encastré sous charge horizontale', () => {
  it('déplacement et moments égaux à la méthode des rotations', () => {
    const h = 3000;
    const L = 5000;
    const H = 20e3;
    const Ic = 2.81e6;
    const Ib = 26.9e6;
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const Bn = b.node('B', 0, h, 0);
    const C = b.node('C', L, h, 0);
    const D = b.node('D', L, 0, 0);
    // A très grand : poteaux et traverse inextensibles comme dans la méthode des rotations
    const col = { A: 1e9, Iy: Ic, Iz: Ic, It: 4e6 };
    b.member('AB', A, Bn, {}, col);
    // traverse selon X : sa flexion dans le plan vertical X-Y se fait autour de l'axe local y (z local = Y) → Iy
    b.member('BC', Bn, C, {}, { A: 1e9, Iy: Ib, Iz: 1e6, It: 4e6 });
    b.member('DC', D, C, {}, col);
    b.support(A, 'fixed');
    b.support(D, 'fixed');
    const [r] = analyze(b.model, [load('H', { nodal: [force(Bn, { fx: H })] })]);
    // méthode des rotations (moments horaires positifs), θB = θC = θ par antisymétrie, Δ vers la droite
    const kc = (2 * E * Ic) / h;
    // nœud B : kc(2θ − 3Δ/h) + 6EIbθ/L = 0 ; efforts tranchants : kc(3θ − 6Δ/h) = −Hh/2
    const a11 = 2 * kc + (6 * E * Ib) / L;
    const a12 = (-3 * kc) / h;
    const a21 = 3 * kc;
    const a22 = (-6 * kc) / h;
    const det = a11 * a22 - a12 * a21;
    const theta = (0 * a22 - a12 * ((-H * h) / 2)) / det;
    const delta = (a11 * ((-H * h) / 2) - a21 * 0) / det;
    const MAB = kc * (theta - (3 * delta) / h);
    expect(rel(r.displacements[Bn * 6], delta)).toBeLessThan(1e-6);
    expect(rel(r.displacements[C * 6], delta)).toBeLessThan(1e-6);
    // moment d'encastrement à la base (autour de Z)
    expect(rel(Math.abs(r.reactions[0].R[5]), Math.abs(MAB))).toBeLessThan(1e-6);
    expect(rel(Math.abs(r.reactions[0].R[0]) + Math.abs(r.reactions[1].R[0]), H)).toBeLessThan(1e-6);
  });
});

describe('cadre en L dans l’espace (flexion + torsion)', () => {
  it('flèche Pa³/3EI + Pb³/3EI + Pab²/GJ', () => {
    const a = 2000;
    const bl = 1500;
    const P = 3e3;
    const sec = { A: 5000, Iy: 8e6, Iz: 3e6, It: 1.2e6 };
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const B = b.node('B', a, 0, 0);
    const C = b.node('C', a, 0, bl);
    b.member('AB', A, B, {}, sec);
    b.member('BC', B, C, {}, sec);
    b.support(A, 'fixed');
    const [r] = analyze(b.model, [load('P', { nodal: [force(C, { fy: -P })] })]);
    const expected = (P * a ** 3) / (3 * E * sec.Iy) + (P * bl ** 3) / (3 * E * sec.Iy) + (P * a * bl * bl) / (G * sec.It);
    expect(rel(-r.displacements[C * 6 + 1], expected)).toBeLessThan(1e-6);
    // torsion de AB = P·b
    expect(rel(Math.abs(r.members[0].stations[0].T), P * bl)).toBeLessThan(1e-9);
  });
});

describe('liaisons d’extrémité', () => {
  const L = 4000;
  const q = 3;
  const build = (spring: 'free' | 'rigid' | number) => {
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const B = b.node('B', L, 0, 0);
    // poutre selon X, flexion verticale = ddl local ry ; ressort en rotation à l'extrémité i
    b.member('AB', A, B, { endI: end('rigid', 'rigid', 'rigid', 'rigid', spring, 'rigid') }, UNP);
    b.support(A, 'fixed');
    b.support(B, ['fixed', 'fixed', 'fixed', 'fixed', 'free', 'free']);
    return b.model;
  };
  const set = load('q', { member: [{ member: 0, kind: 'distributed', dir: 'Y', q1: -q }] });

  it('ressort en rotation : M = (qL²/8) / (1 + 3EI/(kL))', () => {
    const EI = E * UNP.Iy;
    for (const k of [1e9, 5e9, 2.0054e9]) {
      const [r] = analyze(build(k), [set]);
      const M = (q * L * L) / 8 / (1 + (3 * EI) / (k * L));
      expect(rel(Math.abs(r.reactions[0].R[5]), M)).toBeLessThan(1e-9);
      expect(rel(Math.abs(r.members[0].stations[0].My), M)).toBeLessThan(1e-9);
    }
    const [free] = analyze(build('free'), [set]);
    expect(Math.abs(free.reactions[0].R[5])).toBeLessThan(1e-6);
    expect(Math.abs(free.members[0].stations[0].My)).toBeLessThan(1e-6);
    const [rigid] = analyze(build('rigid'), [set]);
    expect(rel(Math.abs(rigid.reactions[0].R[5]), (q * L * L) / 8)).toBeLessThan(1e-9);
  });

  it('ressort axial en série : δ = P (L/EA + 1/k)', () => {
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const B = b.node('B', 1000, 0, 0);
    const k = 5000; // 50 kN/cm
    b.member('AB', A, B, { endJ: end(k, 'rigid', 'rigid', 'rigid', 'rigid', 'rigid') });
    b.support(A, 'fixed');
    b.support(B, ['free', 'fixed', 'fixed', 'fixed', 'fixed', 'fixed']);
    const [r] = analyze(b.model, [load('P', { nodal: [force(B, { fx: 8e3 })] })]);
    expect(rel(r.displacements[B * 6], 8e3 * (1000 / (E * SEC.A) + 1 / k))).toBeLessThan(1e-9);
    expect(rel(r.members[0].stations[0].N, 8e3)).toBeLessThan(1e-9);
  });

  it('barre articulée aux deux bouts dans un treillis : rotations stabilisées, efforts P/(2 cos θ)', () => {
    const b = new ModelBuilder();
    const P = 10e3;
    const A = b.node('A', -1500, 2000, 0);
    const Bn = b.node('B', 1500, 2000, 0);
    const C = b.node('C', 0, 0, 0);
    b.member('AC', A, C, { kind: 'truss' });
    b.member('BC', Bn, C, { kind: 'truss' });
    b.support(A, 'pinned');
    b.support(Bn, 'pinned');
    b.support(C, ['free', 'free', 'fixed', 'free', 'free', 'free']);
    const [r] = analyze(b.model, [load('P', { nodal: [force(C, { fy: -P })] })]);
    const cos = 2000 / 2500;
    expect(rel(r.members[0].stations[0].N, P / (2 * cos))).toBeLessThan(1e-9);
    expect(r.warnings.some((w) => /rotation/.test(w))).toBe(true);
  });
});

describe('propriétés générales', () => {
  /** Petite structure spatiale : 4 poteaux, 4 traverses, un contreventement, charges variées. */
  const space = (): { model: FemModel; set: LoadSet } => {
    const b = new ModelBuilder();
    const pts: Array<[number, number, number]> = [
      [0, 0, 0],
      [5900, 0, 0],
      [5900, 0, 2500],
      [0, 0, 2500],
    ];
    const base = pts.map((p, k) => b.node(`b${k}`, ...p));
    const top = pts.map((p, k) => b.node(`t${k}`, p[0], 2790, p[2]));
    base.forEach((n, k) => {
      b.member(`c${k}`, n, top[k], { segments: 2 });
      b.support(n, k % 2 ? 'fixed' : ['fixed', 'fixed', 'fixed', 'free', 'free', 'free']);
    });
    top.forEach((n, k) => b.member(`r${k}`, n, top[(k + 1) % 4], { endJ: end('rigid', 'rigid', 'rigid', 'rigid', 2e9, 2e9) }, UNP));
    b.member('d', base[0], top[1], { kind: 'truss' }, { A: 360, Iy: 0, Iz: 0, It: 0 });
    const set = load('mix', {
      nodal: [force(top[2], { fx: 3e3, fy: -8e3, fz: 1e3, mz: 2e6 })],
      member: [
        { member: 4, kind: 'distributed', dir: 'Y', q1: -4 },
        { member: 5, kind: 'distributed', dir: 'z', q1: 1, q2: 3, a: 200, b: 2000 },
        { member: 6, kind: 'point', dir: 'X', P: 2e3, a: 3000 },
        { member: 0, kind: 'distributed', dir: 'X', q1: 0.5 },
      ],
    });
    return { model: b.model, set };
  };

  it('équilibre global : Σ réactions + Σ charges = 0 (forces et moments)', () => {
    const { model, set } = space();
    const [r] = analyze(model, [set]);
    // résultante des charges : nodales + barres (intégrées), repère global
    const F = [0, 0, 0];
    const M = [0, 0, 0];
    const addF = (p: number[], f: number[]) => {
      for (let d = 0; d < 3; d++) F[d] += f[d];
      M[0] += p[1] * f[2] - p[2] * f[1];
      M[1] += p[2] * f[0] - p[0] * f[2];
      M[2] += p[0] * f[1] - p[1] * f[0];
    };
    for (const ld of set.nodal) {
      const n = model.nodes[ld.node];
      addF([n.x, n.y, n.z], ld.f.slice(0, 3));
      for (let d = 0; d < 3; d++) M[d] += ld.f[3 + d];
    }
    for (const r2 of r.reactions) {
      const n = model.nodes[r2.node];
      addF([n.x, n.y, n.z], r2.R.slice(0, 3));
      for (let d = 0; d < 3; d++) M[d] += r2.R[3 + d];
    }
    // charges de barres : intégration numérique fine (repère local lu dans les résultats du solveur)
    const prep = prepare(model);
    for (const ld of set.member) {
      const m = model.members[ld.member];
      const a = model.nodes[m.i];
      const bb = model.nodes[m.j];
      const R = prep.parentFrames[ld.member].R;
      const L = prep.parentFrames[ld.member].L;
      const dirVec = (dir: string) =>
        dir === 'X' ? [1, 0, 0] : dir === 'Y' ? [0, 1, 0] : dir === 'Z' ? [0, 0, 1] : dir === 'x' ? [R[0], R[1], R[2]] : dir === 'y' ? [R[3], R[4], R[5]] : [R[6], R[7], R[8]];
      const at = (s: number) => [a.x + ((bb.x - a.x) * s) / L, a.y + ((bb.y - a.y) * s) / L, a.z + ((bb.z - a.z) * s) / L];
      const v = dirVec(ld.dir);
      if (ld.kind === 'point') addF(at(ld.a), v.map((c) => c * ld.P));
      else {
        const s0 = ld.a ?? 0;
        const s1 = ld.b ?? L;
        const N = 2000;
        for (let k = 0; k < N; k++) {
          const s = s0 + ((k + 0.5) * (s1 - s0)) / N;
          const q = ld.q1 + ((ld.q2 ?? ld.q1) - ld.q1) * ((s - s0) / (s1 - s0));
          addF(at(s), v.map((c) => (c * q * (s1 - s0)) / N));
        }
      }
    }
    const scale = 1e4;
    for (let d = 0; d < 3; d++) expect(Math.abs(F[d])).toBeLessThan(1e-6 * scale);
    for (let d = 0; d < 3; d++) expect(Math.abs(M[d])).toBeLessThan(1e-3 * scale * 1e3);
  });

  it('invariance par rotation : tourner tout le modèle ne change ni les efforts ni les déplacements', () => {
    const { model, set } = space();
    // rotation de 37° autour d'un axe quelconque (1, 2, 0,5)
    const ax = [1, 2, 0.5];
    const l = Math.hypot(...ax);
    const [ux, uy, uz] = ax.map((v) => v / l);
    const t = (37 * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const Rm = [
      [c + ux * ux * (1 - c), ux * uy * (1 - c) - uz * s, ux * uz * (1 - c) + uy * s],
      [uy * ux * (1 - c) + uz * s, c + uy * uy * (1 - c), uy * uz * (1 - c) - ux * s],
      [uz * ux * (1 - c) - uy * s, uz * uy * (1 - c) + ux * s, c + uz * uz * (1 - c)],
    ];
    const rot = (v: number[]) => Rm.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
    const up = rot([0, 1, 0]) as [number, number, number];
    const turned: FemModel = {
      nodes: model.nodes.map((n) => {
        const [x, y, z] = rot([n.x, n.y, n.z]);
        return { ...n, x, y, z };
      }),
      // la référence d'axe local suit la rotation (sinon le « haut » change)
      members: model.members.map((m) => {
        const a = model.nodes[m.i];
        const bb = model.nodes[m.j];
        const vertical = Math.abs(bb.y - a.y) > 0.999 * Math.hypot(bb.x - a.x, bb.y - a.y, bb.z - a.z);
        return { ...m, ref: (vertical ? rot([1, 0, 0]) : up) as [number, number, number] };
      }),
      // appuis : on bloque tout (la rotation mélange les ddl) sauf les rotations libres, identiques en norme
      supports: model.supports.map((sp) => ({ ...sp, dofs: sp.dofs.map((d, k) => (k < 3 ? 'fixed' : d)) as typeof sp.dofs })),
    };
    const base: FemModel = { ...model, supports: model.supports.map((sp) => ({ ...sp, dofs: sp.dofs.map((d, k) => (k < 3 ? 'fixed' : d)) as typeof sp.dofs })) };
    const turnedSet: LoadSet = {
      id: 'mix',
      nodal: set.nodal.map((ld) => ({ node: ld.node, f: [...rot(ld.f.slice(0, 3)), ...rot(ld.f.slice(3))] as typeof ld.f })),
      member: set.member.map((ld) => {
        if (ld.dir === 'X' || ld.dir === 'Y' || ld.dir === 'Z') {
          // direction globale → direction tournée : décomposée sur les axes globaux du modèle tourné
          const v = rot(ld.dir === 'X' ? [1, 0, 0] : ld.dir === 'Y' ? [0, 1, 0] : [0, 0, 1]);
          return v
            .map((cmp, k) =>
              ld.kind === 'point'
                ? { ...ld, dir: (['X', 'Y', 'Z'] as const)[k], P: ld.P * cmp }
                : { ...ld, dir: (['X', 'Y', 'Z'] as const)[k], q1: ld.q1 * cmp, q2: (ld.q2 ?? ld.q1) * cmp },
            );
        }
        return [ld];
      }).flat(),
    };
    const [r0] = analyze(base, [set]);
    const [r1] = analyze(turned, [turnedSet]);
    for (let k = 0; k < model.nodes.length; k++) {
      const d0 = Math.hypot(r0.displacements[k * 6], r0.displacements[k * 6 + 1], r0.displacements[k * 6 + 2]);
      const d1 = Math.hypot(r1.displacements[k * 6], r1.displacements[k * 6 + 1], r1.displacements[k * 6 + 2]);
      expect(Math.abs(d0 - d1)).toBeLessThan(1e-6 * Math.max(d0, 1e-3));
    }
    r0.members.forEach((m, k) => {
      const m1 = r1.members[k];
      m.stations.forEach((s, t) => {
        const s1 = m1.stations[t];
        for (const key of ['N', 'Vy', 'Vz', 'T', 'My', 'Mz'] as const) expect(Math.abs(s[key] - s1[key])).toBeLessThan(1e-6 * 1e7);
      });
    });
  });

  it('mécanisme : erreur lisible avec le nœud concerné', () => {
    const b = new ModelBuilder();
    const A = b.node('A', 0, 0, 0);
    const B = b.node('B', 3000, 0, 0);
    b.member('AB', A, B);
    // deux rotules : la poutre tourne librement autour de son axe x… et glisse en z
    b.support(A, ['fixed', 'fixed', 'free', 'fixed', 'free', 'free']);
    b.support(B, ['free', 'fixed', 'free', 'free', 'free', 'free']);
    let err: unknown;
    try {
      analyze(b.model, [load('P', { nodal: [force(B, { fy: -1e3 })] })]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(FemError);
    expect((err as FemError).code).toBe('mechanism');
    expect((err as FemError).nodes.length).toBeGreaterThan(0);
  });

  it('plusieurs cas de charge : résultats proportionnels (linéarité)', () => {
    const { model, set } = space();
    const scaled: LoadSet = {
      id: 'x2',
      nodal: set.nodal.map((l) => ({ ...l, f: l.f.map((v) => 2 * v) as typeof l.f })),
      member: set.member.map((l) => (l.kind === 'point' ? { ...l, P: 2 * l.P } : { ...l, q1: 2 * l.q1, q2: l.q2 === undefined ? undefined : 2 * l.q2 })),
    };
    const [r1, r2] = analyze(model, [set, scaled]);
    for (let k = 0; k < r1.displacements.length; k++) expect(Math.abs(r2.displacements[k] - 2 * r1.displacements[k])).toBeLessThan(1e-9 + 1e-9 * Math.abs(r1.displacements[k]));
  });
});

