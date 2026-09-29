// Modèle synthétique « grappe de Viewbox » pour les tests de performance et de robustesse du solveur : reprend la
// topologie du modèle SCIA statico (rives UNP 220, traverses et lisses RHP 120×60×4, poteaux QHP 100×5 semi-rigides,
// liaisons d'angle, boulons horizontaux à ressorts, contacts en compression seule, appuis en compression seule
// avec ressorts horizontaux). Ce n'est PAS le gabarit de calcul (phase S4), seulement un modèle de même taille.
import type { EndSpec, FemMember, FemModel, LoadSet } from '../../src/structure/core/fem/types';
import { KN_PER_CM, KNCM_PER_DEG } from '../../src/structure/core/units';

const E = 210000;
const G = 80769.23;
const UNP220 = { A: 3740, Iy: 26.9e6, Iz: 1.97e6, It: 0.162e6 };
const RHP = { A: 1350, Iy: 2.47e6, Iz: 0.827e6, It: 1.99e6 };
const QHP100 = { A: 1880, Iy: 2.81e6, Iz: 2.81e6, It: 4.33e6 };
const QRO100x4 = { A: 1520, Iy: 2.33e6, Iz: 2.33e6, It: 3.57e6 };
const RD20 = { A: 314, Iy: 7700, Iz: 7700, It: 15700 };

const XS = [5, 1144, 2344, 3544, 4745, 5895];
const YS = [5, 835, 1665, 2495];
const BOLT_X = [210, 2290, 3610, 5690];
const BOLT_Y = [210, 2290];

export interface Cluster {
  model: FemModel;
  /** nœuds des planchers (pour les charges) et nœud le plus haut */
  floorMembers: number[];
  top: number;
}

/** nx × ny Viewbox en plan, nz niveaux. */
export function viewboxCluster(nx: number, ny: number, nz: number): Cluster {
  const model: FemModel = { nodes: [], members: [], supports: [] };
  const key = new Map<string, number>();
  const node = (x: number, y: number, z: number) => {
    const k = `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
    let v = key.get(k);
    if (v === undefined) {
      model.nodes.push({ id: `N${model.nodes.length + 1}`, x, y: z, z: -y });
      key.set(k, (v = model.nodes.length - 1));
    }
    return v;
  };
  const member = (i: number, j: number, sec: typeof UNP220, extra: Partial<FemMember> = {}) => {
    model.members.push({ id: `B${model.members.length + 1}`, i, j, E, G, ...sec, ...extra });
    return model.members.length - 1;
  };
  const semi = 3500 * KNCM_PER_DEG;
  const colEnd: EndSpec = ['rigid', 'rigid', 'rigid', 'rigid', semi, semi];
  const link: EndSpec = ['rigid', 10 * KN_PER_CM, 10 * KN_PER_CM, 'free', 'free', 'free'];
  const bolt: EndSpec = [50 * KN_PER_CM, 50 * KN_PER_CM, 50 * KN_PER_CM, 'free', 'free', 'free'];
  const floorMembers: number[] = [];
  const pitchX = 5910;
  const pitchY = 2510;
  let top = 0;
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const ox = i * pitchX;
        const oy = j * pitchY;
        for (const [lvl, zz] of [
          [0, k * 3080],
          [1, k * 3080 + 2790],
        ] as const) {
          // rive : nœuds du périmètre triés
          const perim: Array<[number, number]> = [];
          for (const x of [...XS, ...BOLT_X].sort((a, b) => a - b)) perim.push([x, 5]);
          for (const y of [...YS.slice(1, -1), ...BOLT_Y].sort((a, b) => a - b)) perim.push([5895, y]);
          for (const x of [...XS, ...BOLT_X].sort((a, b) => b - a)) perim.push([x, 2495]);
          for (const y of [...YS.slice(1, -1), ...BOLT_Y].sort((a, b) => b - a)) perim.push([5, y]);
          const uniq = perim.filter((p, q) => q === 0 || p[0] !== perim[q - 1][0] || p[1] !== perim[q - 1][1]);
          for (let q = 0; q < uniq.length; q++) {
            const a = uniq[q];
            const b = uniq[(q + 1) % uniq.length];
            if (a[0] === b[0] && a[1] === b[1]) continue;
            member(node(ox + a[0], oy + a[1], zz), node(ox + b[0], oy + b[1], zz), UNP220);
          }
          // traverses (selon y) et lisses (selon x)
          for (const x of XS.slice(1, -1))
            for (let q = 0; q < YS.length - 1; q++) {
              const m = member(node(ox + x, oy + YS[q], zz), node(ox + x, oy + YS[q + 1], zz), RHP);
              if (lvl === 0) floorMembers.push(m);
            }
          for (const y of YS.slice(1, -1))
            for (let q = 0; q < XS.length - 1; q++) member(node(ox + XS[q], oy + y, zz), node(ox + XS[q + 1], oy + y, zz), RHP);
        }
        for (const [x, y] of [
          [5, 5],
          [5895, 5],
          [5895, 2495],
          [5, 2495],
        ]) {
          const b = node(ox + x, oy + y, k * 3080);
          const t = node(ox + x, oy + y, k * 3080 + 2790);
          member(b, t, QHP100, { endI: colEnd, endJ: colEnd, segments: 2 });
          const up = node(ox + x, oy + y, (k + 1) * 3080);
          member(t, up, QRO100x4, { endJ: link });
          top = up;
          if (k === 0)
            model.supports.push({
              node: b,
              dofs: [50 * KN_PER_CM, 'fixed', 50 * KN_PER_CM, 'free', 'free', 'free'],
              compressionOnly: true,
            });
        }
        // liaisons avec le voisin en x (+) et en y (+) : boulons à ressorts + contacts d'angle en compression seule
        for (const zz of [k * 3080, k * 3080 + 2790]) {
          if (i + 1 < nx) {
            for (const y of BOLT_Y) member(node(ox + 5895, oy + y, zz), node(ox + pitchX + 5, oy + y, zz), RD20, { endJ: bolt });
            for (const y of [5, 2495]) member(node(ox + 5895, oy + y, zz), node(ox + pitchX + 5, oy + y, zz), QRO100x4, { kind: 'truss', nonlinear: 'compressionOnly' });
          }
          if (j + 1 < ny) {
            for (const x of BOLT_X) member(node(ox + x, oy + 2495, zz), node(ox + x, oy + pitchY + 5, zz), RD20, { endJ: bolt });
            for (const x of [5, 5895]) member(node(ox + x, oy + 2495, zz), node(ox + x, oy + pitchY + 5, zz), QRO100x4, { kind: 'truss', nonlinear: 'compressionOnly' });
          }
        }
      }
  return { model, floorMembers, top };
}

/** Cas de charge : exploitation sur les traverses de plancher + poussée horizontale en tête. */
export function clusterLoads(c: Cluster, count: number): LoadSet[] {
  return Array.from({ length: count }, (_, k) => {
    const a = (2 * Math.PI * k) / count;
    return {
      id: `CO${k + 1}`,
      nodal: [{ node: c.top, f: [2e3 * Math.cos(a), 0, 2e3 * Math.sin(a), 0, 0, 0] }],
      member: c.floorMembers.map((m) => ({ member: m, kind: 'distributed' as const, dir: 'Y' as const, q1: -3.5 * (1 + 0.1 * (k % 3)) })),
    };
  });
}
