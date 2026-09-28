// Unités d'une installation (fonctions pures) : les Viewbox qui se touchent ou sont à 2,5 m ou moins les unes des
// autres forment une unité ; deux groupes plus espacés sont deux unités, chacune avec sa série de planches.
// Distance mesurée en plan (x, z monde) entre les emprises des Viewbox (rectangle orienté de leur repère, pieds exclus).
import type { SceneIndex } from './types';
import type { ModuleFrame } from './views';

export const UNIT_GAP_MM = 2500;

export interface InstallUnit {
  /** 1, 2, 3… (ordre des numéros de Viewbox) */
  n: number;
  /** nom affiché sur les planches (« Unit 1 ») */
  name: string;
  moduleIds: string[];
  /** éléments communs de l'unité : ceux dont elle est la plus proche, à UNIT_GAP_MM ou moins */
  commonIds: string[];
}

type P2 = [number, number];

const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** Emprise en plan d'une Viewbox : rectangle de son repère, sinon sa boîte monde. */
export function moduleFootprint(index: SceneIndex, moduleId: string, frames?: ReadonlyMap<string, ModuleFrame>): P2[] | null {
  const f = frames?.get(moduleId);
  if (f) {
    const corners: P2[] = [
      [f.min[0], f.min[1]],
      [f.max[0], f.min[1]],
      [f.max[0], f.max[1]],
      [f.min[0], f.max[1]],
    ];
    return corners.map(([lx, ly]) => [f.origin[0] + f.xAxis[0] * lx + f.yAxis[0] * ly, f.origin[2] + f.xAxis[2] * lx + f.yAxis[2] * ly]);
  }
  const m = index.modules.find((x) => x.id === moduleId);
  return m ? boxFootprint(m.bboxMm) : null;
}

function boxFootprint(b: readonly number[]): P2[] {
  return [
    [b[0], b[2]],
    [b[3], b[2]],
    [b[3], b[5]],
    [b[0], b[5]],
  ];
}

function inside(p: P2, poly: P2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function pointSegment(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function cross(o: P2, a: P2, b: P2): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function segmentDistance(a: P2, b: P2, c: P2, d: P2): number {
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}

/** Plus courte distance entre deux polygones convexes (0 s'ils se touchent ou se chevauchent). */
export function polygonDistance(a: P2[], b: P2[]): number {
  if (a.some((p) => inside(p, b)) || b.some((p) => inside(p, a))) return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i++)
    for (let j = 0; j < b.length; j++) best = Math.min(best, segmentDistance(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]));
  return best;
}

/** Regroupe les Viewbox en unités (et rattache chaque élément commun à l'unité la plus proche). */
export function detectUnits(index: SceneIndex, frames?: ReadonlyMap<string, ModuleFrame>, gapMm = UNIT_GAP_MM): InstallUnit[] {
  const mods = index.modules
    .map((m) => ({ id: m.id, fp: moduleFootprint(index, m.id, frames) }))
    .filter((m): m is { id: string; fp: P2[] } => !!m.fp)
    .sort((a, b) => byNumber(a.id, b.id));
  const parent = mods.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < mods.length; i++)
    for (let j = i + 1; j < mods.length; j++) if (root(i) !== root(j) && polygonDistance(mods[i].fp, mods[j].fp) <= gapMm) parent[root(j)] = root(i);
  const groups = new Map<number, number[]>();
  mods.forEach((_, i) => {
    const r = root(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  });
  // ordre : unité de la plus petite Viewbox d'abord (les indices sont déjà triés par numéro)
  const units: InstallUnit[] = [...groups.values()]
    .sort((a, b) => a[0] - b[0])
    .map((g, k) => ({ n: k + 1, name: `Unit ${k + 1}`, moduleIds: g.map((i) => mods[i].id), commonIds: [] }));
  const byId = new Map(index.nodes.map((n) => [n.id, n]));
  const unitOf = new Map(mods.map((m, i) => [m.id, i]));
  for (const id of index.commonIds) {
    const b = byId.get(id)?.bboxMm;
    if (!b) continue;
    const fp = boxFootprint(b);
    let best: InstallUnit | null = null;
    let bestD = Infinity;
    for (const u of units) {
      const d = Math.min(...u.moduleIds.map((m) => polygonDistance(fp, mods[unitOf.get(m)!].fp)));
      if (d < bestD) [best, bestD] = [u, d];
    }
    if (best && bestD <= gapMm) best.commonIds.push(id);
  }
  return units;
}
