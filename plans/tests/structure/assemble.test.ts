// Assemblage du modèle de l'installation : liaisons entre Viewbox juxtaposées (boulons, contacts), empilées (liaisons
// d'angle, contacts verticaux), appuis, tronçons de flambement, côtés exposés ; invariance par rotation du plan.
import { describe, expect, it } from 'vitest';
import type { PlacedModule } from '../../src/structure/core/assemble';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import { analyze } from '../../src/structure/core/fem/analysis';
import type { LoadSet, Vec3, Vec6 } from '../../src/structure/core/fem/types';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';

const entry = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
const sections = sectionMap(SEED);
const opt = { sections, jacks: false, middleFeet: false, upliftReleases: 'all' as const, calibration: false };

/** Viewbox placée à (du, dv) mètres du plan tourné de θ, au niveau `level`. */
function vbx(id: string, du: number, dv: number, level = 0, theta = 0, shift: Vec3 = [0, 0, 0]): PlacedModule {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const u: Vec3 = [c, 0, s];
  const v: Vec3 = [-s, 0, c];
  const origin: Vec3 = [shift[0] + u[0] * du + v[0] * dv, shift[1] + level * 3080, shift[2] + u[2] * du + v[2] * dv];
  return { id, level, origin, u, v, params: entry.params!, templateKey: entry.key };
}
const count = (m: ReturnType<typeof assembleStructure>, family: string) => m.meta.filter((x) => x.family === family).length;

describe('assemblage des Viewbox', () => {
  it('Viewbox seule : 4 appuis d’angle, aucune liaison, 4 côtés exposés', () => {
    const m = assembleStructure([vbx('VBX-01', 0, 0)], opt);
    expect(m.errors).toEqual([]);
    expect(m.fem.supports).toHaveLength(4);
    expect(count(m, 'bolt') + count(m, 'contact') + count(m, 'corner-link')).toBe(0);
    expect(m.faces.map((f) => f.exposed)).toEqual([[[0, 2490]], [[0, 2490]], [[0, 5890]], [[0, 5890]]]);
    expect(m.topModules).toEqual(new Set(['VBX-01']));
    // tronçons de flambement : poteau entier, rive de plancher coupée aux attaches (réception de pied, traverses)
    const col = m.meta.find((x) => x.family === 'column')!;
    expect(col.spanLength).toBeCloseTo(2790, 6);
    const rim = m.meta.filter((x) => x.line === 'VBX-01/floor:v0');
    expect([...new Set(rim.map((x) => Math.round(x.spanLength)))]).toEqual([155, 984, 1200, 606, 594, 1201, 995]);
    const roofRim = m.meta.filter((x) => x.line === 'VBX-01/roof:v0');
    expect([...new Set(roofRim.map((x) => Math.round(x.spanLength)))]).toEqual([1139, 1200, 1201, 1150]);
  });

  it('juxtaposées par les grands côtés : 8 boulons (deux demi-boulons en série), 4 contacts d’angle', () => {
    const m = assembleStructure([vbx('A', 0, 0), vbx('B', 0, 2500)], opt);
    expect(m.errors).toEqual([]);
    expect(m.warnings).toEqual([]);
    const bolts = m.fem.members.filter((b) => b.tag === 'bolt');
    expect(bolts).toHaveLength(8);
    // SCIA : deux demi-boulons de 5 mm à ressort 50 kN/cm → 25 kN/cm en série, barre en console d'un côté
    expect(bolts.every((b) => b.endI === undefined && b.endJ?.[0] === 2500 && b.endJ?.[1] === 2500 && b.endJ?.[4] === 'free')).toBe(true);
    const contacts = m.fem.members.filter((b) => b.tag === 'contact');
    expect(contacts).toHaveLength(4);
    expect(contacts.every((b) => b.nonlinear === 'compressionOnly')).toBe(true);
    const len = (b: (typeof bolts)[number]) => Math.hypot(...([0, 1, 2] as const).map((d) => [m.fem.nodes[b.j].x - m.fem.nodes[b.i].x, m.fem.nodes[b.j].y - m.fem.nodes[b.i].y, m.fem.nodes[b.j].z - m.fem.nodes[b.i].z][d]));
    expect(bolts.every((b) => Math.abs(len(b) - 10) < 1e-6)).toBe(true);
    // les côtés en regard ne sont plus exposés au vent
    const face = (mod: string, side: string) => m.faces.find((f) => f.module === mod && f.side === side)!;
    expect(face('A', 'v1').exposed).toEqual([]);
    expect(face('B', 'v0').exposed).toEqual([]);
    expect(face('A', 'v0').exposed).toEqual([[0, 5890]]);
    expect(m.fem.supports).toHaveLength(8);
  });

  it('boulon : raideur k / 2 (grands côtés) ou k (petits côtés) dans les 3 directions, pas une bielle', () => {
    const long = assembleStructure([vbx('A', 0, 0), vbx('B', 0, 2500)], opt).fem.members.find((b) => b.tag === 'bolt')!;
    const short = assembleStructure([vbx('A', 0, 0), vbx('B', 5900, 0)], opt).fem.members.find((b) => b.tag === 'bolt')!;
    for (const [b, k] of [
      [long, 2500],
      [short, 5000],
    ] as const)
      for (const d of [0, 1, 2]) {
        const f: Vec6 = [0, 0, 0, 0, 0, 0];
        f[d] = 1000;
        const [r] = analyze(
          {
            nodes: [
              { id: 'a', x: 0, y: 0, z: 0 },
              { id: 'b', x: 0, y: 0, z: -10 },
            ],
            members: [{ ...b, i: 0, j: 1 }],
            supports: [
              { node: 0, dofs: ['fixed', 'fixed', 'fixed', 'fixed', 'fixed', 'fixed'] },
              { node: 1, dofs: ['free', 'free', 'free', 'fixed', 'fixed', 'fixed'] },
            ],
          },
          [{ id: 'F', nodal: [{ node: 1, f }], member: [] }],
        );
        expect(Math.abs(r.displacements[6 + d] / (1000 / k) - 1)).toBeLessThan(2e-3);
      }
  });

  it('bout à bout par les petits côtés : 4 boulons à un ressort, 4 contacts', () => {
    const m = assembleStructure([vbx('A', 0, 0), vbx('B', 5900, 0)], opt);
    const bolts = m.fem.members.filter((b) => b.tag === 'bolt');
    expect(bolts).toHaveLength(4);
    expect(bolts.every((b) => b.endI === undefined && b.endJ?.[2] === 5000)).toBe(true);
    expect(count(m, 'contact')).toBe(4);
  });

  it('empilées : 4 liaisons d’angle (10 kN/cm), pas de contact le long des rives, appuis au niveau 0 seulement', () => {
    const m = assembleStructure([vbx('A', 0, 0), vbx('U', 0, 0, 1)], opt);
    expect(m.errors).toEqual([]);
    const links = m.fem.members.filter((b) => b.tag === 'corner-link');
    expect(links).toHaveLength(4);
    expect(links.every((b) => b.endJ?.[1] === 1000 && b.endJ?.[2] === 1000 && b.endJ?.[5] === 'free' && m.fem.nodes[b.j].y - m.fem.nodes[b.i].y === 290)).toBe(true);
    expect(count(m, 'vertical-contact')).toBe(0);
    expect(m.fem.supports).toHaveLength(4);
    expect(m.topModules).toEqual(new Set(['U']));
  });

  it('Viewbox du dessus posée trop bas dans le modèle : replacée sur celle du dessous, avec un avertissement', () => {
    const low = vbx('U', 0, 0, 1, 0, [0, -280, 0]);
    const m = assembleStructure([vbx('A', 0, 0), low], opt);
    expect(m.errors).toEqual([]);
    expect(m.warnings.some((w) => w.includes('280 mm plus bas'))).toBe(true);
    expect(m.fem.members.filter((b) => b.tag === 'corner-link')).toHaveLength(4);
    expect(low.origin[1]).toBe(3080 - 280); // l'entrée n'est pas modifiée
  });

  it('Viewbox du dessus décalée : angles sur la rive, angles dans le vide bloquants ; décalée en plan : liaison manquante signalée', () => {
    const offset = assembleStructure([vbx('A', 0, 0), vbx('U', 1000, 0, 1)], opt);
    // angles 1 et 4 sur les rives de A, angles 2 et 3 au-delà de A : dans le vide, poteau proposé
    expect(offset.errors.length).toBe(2);
    expect(offset.unsupported.map((u) => [u.corner, u.proposal.kind])).toEqual([
      [1, 'post'],
      [2, 'post'],
    ]);
    expect(offset.fem.members.filter((b) => b.tag === 'corner-link')).toHaveLength(2);
    const staggered = assembleStructure([vbx('A', 0, 0), vbx('B', 1200, 2500)], opt);
    expect(staggered.warnings.some((w) => w.includes('Aucune liaison horizontale'))).toBe(true);
  });

  it('pieds à vérins et pieds centraux : appuis déplacés aux réceptions de pied', () => {
    const m = assembleStructure([vbx('A', 0, 0)], { ...opt, jacks: true, middleFeet: true });
    expect(m.fem.supports).toHaveLength(6);
    const n = m.fem.nodes[m.fem.supports[0].node];
    expect([n.x, n.z]).toEqual([160, 160]);
  });

  it('même résultat quelle que soit l’orientation du plan (2 × 1 + 1 empilée, charges verticales et horizontales)', () => {
    const build = (theta: number) => assembleStructure([vbx('A', 0, 0, 0, theta, [3000, 0, -2000]), vbx('B', 0, 2500, 0, theta, [3000, 0, -2000]), vbx('U', 0, 0, 1, theta, [3000, 0, -2000])], opt);
    const results = [0, 0.64].map((theta) => {
      const m = build(theta);
      const u: Vec3 = [Math.cos(theta), 0, Math.sin(theta)];
      const roof = m.fem.nodes.map((n, k) => ({ n, k })).filter(({ n }) => n.id.endsWith(':2790'));
      const set: LoadSet = {
        id: 'G+H',
        nodal: roof.map(({ k }) => ({ node: k, f: [150 * u[0], -800, 150 * u[2], 0, 0, 0] as Vec6 })),
        member: [],
      };
      const [r] = analyze(m.fem, [set], { secondOrder: true });
      return { r, m, total: roof.length * 800 };
    });
    for (const { r, total } of results) expect(r.reactions.reduce((s, x) => s + x.R[1], 0)).toBeCloseTo(total, 2);
    const [a, b] = results.map(({ r }) => r.reactions.map((x) => x.R[1]));
    a.forEach((ra, k) => expect(b[k]).toBeCloseTo(ra, 3));
    expect(results[1].r.reactions.map((x) => x.lifted)).toEqual(results[0].r.reactions.map((x) => x.lifted));
  });
});
