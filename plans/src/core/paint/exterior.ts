// « Peindre les côtés extérieurs » (A. Pinchart 03.11.2026) : une installation de Viewbox côte à côte ne se peint que
// là où on la voit de dehors. Un côté collé à une autre box (faces parallèles à ≤ 50 mm, même en partie) n'est pas
// peint ; sur un côté extérieur, seules les faces tournées vers l'extérieur et VUES de l'extérieur le sont (pas
// l'intérieur des profils, pas ce qui est derrière un mur ou un vitrage). Une seule règle par couleur, gardée telle
// quelle dans la peinture et recalculée sur le modèle ouvert (nouvelle version, box ajoutée : ça suit).
// Pur : repères des Viewbox (ModuleFrame) → côtés, parties couvertes par les voisines ; triangle → côté ; occlusion
// 2D dans le plan du côté. Le parcours des maillages est dans linework/paintExterior.ts.
import type { ModuleFrame, Vec3 } from '../views';
import { cross, dot, frontVector, neg } from '../views';

/** Règle « côtés extérieurs » d'une zone peinte (PaintTarget.exterior). */
export interface ExteriorRule {
  /** Viewbox concernées (absent = toutes, y compris celles ajoutées plus tard) */
  modules?: string[];
  /** grands côtés et / ou petits côtés */
  sides: Array<'long' | 'short'>;
  /** catégories NON peintes (clé de catégorie ; '' = pièces sans catégorie = structure de la box) */
  exclude: string[];
  /** vitrages peints aussi (matériau verre) — non par défaut */
  glass?: boolean;
}

export type SideLocal = '+x' | '-x' | '+y' | '-y';
export type SideLabel = 'avant' | 'arriere' | 'gauche' | 'droite';
export type Exposure = 'exterieur' | 'partiel' | 'interieur';

/** Un côté vertical d'une Viewbox, en coordonnées monde (mm). */
export interface BoxSide {
  moduleId: string;
  local: SideLocal;
  kind: 'long' | 'short';
  label: SideLabel;
  /** normale sortante (horizontale, unitaire) */
  out: Vec3;
  /** axe le long du côté, axe vertical */
  t: Vec3;
  up: Vec3;
  /** plan du côté : out · p = plane */
  plane: number;
  /** étendue le long du côté (t · p) et en hauteur (up · p) */
  u: [number, number];
  v: [number, number];
  /** 4 coins (bas a, bas b, haut b, haut a) */
  corners: Vec3[];
  /** parties couvertes par une box voisine : [u0, u1, v0, v1] */
  covered: Array<[number, number, number, number]>;
  /** box voisines qui couvrent ce côté */
  neighbours: string[];
  exposure: Exposure;
  /** part couverte (0…1) */
  coveredRatio: number;
}

export const EXTERIOR = {
  /** une box voisine couvre un côté si son côté opposé est à ≤ 50 mm (comme les jonctions de la Loading liste) */
  junctionGap: 50,
  /** une face peinte doit être à ≤ 30° de la normale du côté */
  cosFacing: Math.cos((30 * Math.PI) / 180),
  /** profondeur sous le plan du côté où l'on cherche sa peau extérieure (rives, poteaux, murs, portes) */
  depthIn: 250,
  /** éléments qui dépassent du gabarit (habillages, bandeaux) */
  depthOut: 150,
  /** tolérance le long du côté / en hauteur (bout des rives, débords) */
  margin: 60,
  /** une face est cachée par une autre devant elle d'au moins 1 mm */
  frontEps: 1,
  /** grille de l'occlusion (mm) */
  cell: 250,
};

/** Catégories non peintes par défaut : vitrages, cadres textile, pieds, escaliers, garde-corps, terrasses, boarding. */
export function defaultExclude(categories: Iterable<string>): string[] {
  return [...new Set(categories)].filter((c) => /^(VITRE|FRAME-|PIED$|ESCALIER$|GARDE-CORPS$|TERRASSE$|BOARDING$)/.test(c)).sort();
}

export function cleanExterior(v: unknown): ExteriorRule | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const strs = (x: unknown) => (Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string' && s.length <= 80))].slice(0, 500) : []);
  const sides = strs(o.sides).filter((s): s is 'long' | 'short' => s === 'long' || s === 'short');
  if (!sides.length) return null;
  const modules = Array.isArray(o.modules) ? strs(o.modules) : undefined;
  return { ...(modules ? { modules } : {}), sides, exclude: strs(o.exclude), ...(o.glass === true ? { glass: true } : {}) };
}

/** Clé de cache / comparaison d'une règle. */
export const exteriorKey = (r: ExteriorRule) => JSON.stringify([r.modules ? [...r.modules].sort() : null, [...r.sides].sort(), [...r.exclude].sort(), !!r.glass]);

const add = (a: Vec3, b: Vec3, s = 1): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** Les 4 côtés verticaux d'une Viewbox (sans les parties couvertes). */
export function sidesOfFrame(f: ModuleFrame): BoxSide[] {
  const F = frontVector(f);
  const right = cross(neg(F), f.up);
  const o = f.origin;
  const at = (x: number, y: number, z: number): Vec3 => add(add(add(o, f.xAxis, x), f.yAxis, y), f.up, z);
  const [x0, y0, z0] = f.min;
  const [x1, y1, z1] = f.max;
  return (['+x', '-x', '+y', '-y'] as SideLocal[]).map((local) => {
    const onX = local[1] === 'x';
    const plus = local[0] === '+';
    const axis = onX ? f.xAxis : f.yAxis;
    const out = plus ? axis : neg(axis);
    const t = onX ? f.yAxis : f.xAxis;
    const a = onX ? at(plus ? x1 : x0, y0, z0) : at(x0, plus ? y1 : y0, z0);
    const b = onX ? at(plus ? x1 : x0, y1, z0) : at(x1, plus ? y1 : y0, z0);
    const corners = [a, b, add(b, f.up, z1 - z0), add(a, f.up, z1 - z0)];
    const us = corners.map((c) => dot(c, t));
    const vs = corners.map((c) => dot(c, f.up));
    const label: SideLabel = local === f.front ? 'avant' : local[1] === f.front[1] ? 'arriere' : dot(out, right) > 0 ? 'droite' : 'gauche';
    return {
      moduleId: f.moduleId,
      local,
      kind: (onX ? 'x' : 'y') === f.longAxis ? 'short' : 'long',
      label,
      out,
      t,
      up: f.up,
      plane: dot(a, out),
      u: [Math.min(...us), Math.max(...us)],
      v: [Math.min(...vs), Math.max(...vs)],
      corners,
      covered: [],
      neighbours: [],
      exposure: 'exterieur' as Exposure,
      coveredRatio: 0,
    };
  });
}

/** Côtés de toutes les Viewbox, avec les parties couvertes par les box voisines (tous niveaux). */
export function boxSides(frames: Iterable<ModuleFrame>): BoxSide[] {
  const all = [...frames].flatMap(sidesOfFrame);
  for (const s of all) {
    for (const n of all) {
      if (n.moduleId === s.moduleId || dot(n.out, s.out) > -0.98) continue;
      // plan du côté voisin vu depuis s : il doit être collé (± 50 mm)
      const gap = n.corners.reduce((m, c) => m + dot(c, s.out), 0) / 4 - s.plane;
      if (Math.abs(gap) > EXTERIOR.junctionGap) continue;
      const us = n.corners.map((c) => dot(c, s.t));
      const vs = n.corners.map((c) => dot(c, s.up));
      const u0 = Math.max(s.u[0], Math.min(...us));
      const u1 = Math.min(s.u[1], Math.max(...us));
      const v0 = Math.max(s.v[0], Math.min(...vs));
      const v1 = Math.min(s.v[1], Math.max(...vs));
      if (u1 - u0 < 10 || v1 - v0 < 10) continue;
      // une partie couverte qui va jusqu'au bord du côté couvre aussi ce qui dépasse un peu (pieds sous la jonction,
      // bout des rives) : sinon ces morceaux seraient pris pour extérieurs
      const m = EXTERIOR.margin;
      s.covered.push([u0 <= s.u[0] + 1 ? u0 - m : u0, u1 >= s.u[1] - 1 ? u1 + m : u1, v0 <= s.v[0] + 1 ? v0 - m : v0, v1 >= s.v[1] - 1 ? v1 + m : v1]);
      if (!s.neighbours.includes(n.moduleId)) s.neighbours.push(n.moduleId);
    }
    s.coveredRatio = coveredArea(s) / ((s.u[1] - s.u[0]) * (s.v[1] - s.v[0]) || 1);
    s.exposure = s.coveredRatio >= 0.95 ? 'interieur' : s.coveredRatio > 0.02 ? 'partiel' : 'exterieur';
  }
  return all;
}

/** Aire de l'union des rectangles couverts (balayage, peu de rectangles). */
function coveredArea(s: BoxSide): number {
  const r = s.covered.map((q): [number, number, number, number] => [Math.max(q[0], s.u[0]), Math.min(q[1], s.u[1]), Math.max(q[2], s.v[0]), Math.min(q[3], s.v[1])]);
  if (!r.length) return 0;
  const xs = [...new Set(r.flatMap((q) => [q[0], q[1]]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const mid = (xs[i] + xs[i + 1]) / 2;
    const spans = r.filter((q) => q[0] <= mid && q[1] >= mid).map((q) => [q[2], q[3]] as [number, number]).sort((a, b) => a[0] - b[0]);
    let len = 0;
    let cur: [number, number] | null = null;
    for (const sp of spans) {
      if (!cur || sp[0] > cur[1]) {
        if (cur) len += cur[1] - cur[0];
        cur = [sp[0], sp[1]];
      } else cur[1] = Math.max(cur[1], sp[1]);
    }
    if (cur) len += cur[1] - cur[0];
    area += len * (xs[i + 1] - xs[i]);
  }
  return area;
}

/**
 * Côté d'une box auquel appartient un triangle (centre `c`, normale unitaire `n`, sens quelconque : export SketchUp en
 * faces simples) : normale à ≤ 30° de la normale sortante, près du plan du côté, dans son étendue. −1 sinon.
 */
export function sideOfTriangle(sides: BoxSide[], c: Vec3, n: Vec3): number {
  for (let i = 0; i < sides.length; i++) {
    const s = sides[i];
    if (Math.abs(dot(n, s.out)) < EXTERIOR.cosFacing) continue;
    const depth = s.plane - dot(c, s.out);
    if (depth < -EXTERIOR.depthOut || depth > EXTERIOR.depthIn) continue;
    const u = dot(c, s.t);
    const v = dot(c, s.up);
    if (u < s.u[0] - EXTERIOR.margin || u > s.u[1] + EXTERIOR.margin || v < s.v[0] - EXTERIOR.margin || v > s.v[1] + EXTERIOR.margin) continue;
    return i;
  }
  return -1;
}

/** Point (u, v) dans une partie du côté couverte par une box voisine. */
export function isCovered(s: BoxSide, u: number, v: number): boolean {
  return s.covered.some((q) => u > q[0] + 1 && u < q[1] - 1 && v > q[2] + 1 && v < q[3] - 1);
}

/**
 * Triangles d'un côté projetés dans son plan : (u, v) des 3 sommets + profondeur sous le plan (0 = peau extérieure).
 * `visibleFromOutside` dit, pour chacun, s'il est vu de dehors : au moins un point d'échantillon (centre, puis vers
 * chaque sommet) n'est caché par aucun autre triangle plus proche de l'extérieur d'au moins 1 mm.
 */
export interface SideTriangles {
  /** u0 v0 u1 v1 u2 v2 par triangle */
  uv: number[];
  /** profondeur des 3 sommets */
  depth: number[];
}

export function visibleFromOutside(st: SideTriangles): boolean[] {
  const n = st.uv.length / 6;
  const cell = EXTERIOR.cell;
  const grid = new Map<string, number[]>();
  const box = (t: number) => {
    const p = st.uv;
    const xs = [p[t * 6], p[t * 6 + 2], p[t * 6 + 4]];
    const ys = [p[t * 6 + 1], p[t * 6 + 3], p[t * 6 + 5]];
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  };
  const boxes: number[][] = [];
  for (let t = 0; t < n; t++) {
    const b = box(t);
    boxes.push(b);
    for (let i = Math.floor(b[0] / cell); i <= Math.floor(b[2] / cell); i++)
      for (let j = Math.floor(b[1] / cell); j <= Math.floor(b[3] / cell); j++) {
        const k = `${i},${j}`;
        const l = grid.get(k);
        if (l) l.push(t);
        else grid.set(k, [t]);
      }
  }
  /** profondeur du triangle t au point (x, y) s'il le couvre (un peu rétréci : bords communs non comptés), sinon null */
  const depthAt = (t: number, x: number, y: number): number | null => {
    const p = st.uv;
    const [ax, ay, bx, by, cx, cy] = [p[t * 6], p[t * 6 + 1], p[t * 6 + 2], p[t * 6 + 3], p[t * 6 + 4], p[t * 6 + 5]];
    const det = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(det) < 1e-6) return null;
    const l1 = ((x - ax) * (cy - ay) - (y - ay) * (cx - ax)) / det;
    const l2 = ((bx - ax) * (y - ay) - (by - ay) * (x - ax)) / det;
    const l0 = 1 - l1 - l2;
    const e = 1e-6;
    if (l0 < e || l1 < e || l2 < e) return null;
    const d = st.depth;
    return l0 * d[t * 3] + l1 * d[t * 3 + 1] + l2 * d[t * 3 + 2];
  };
  const out: boolean[] = [];
  for (let t = 0; t < n; t++) {
    const p = st.uv;
    const d = st.depth;
    const cx = (p[t * 6] + p[t * 6 + 2] + p[t * 6 + 4]) / 3;
    const cy = (p[t * 6 + 1] + p[t * 6 + 3] + p[t * 6 + 5]) / 3;
    const cd = (d[t * 3] + d[t * 3 + 1] + d[t * 3 + 2]) / 3;
    const samples: [number, number, number][] = [[cx, cy, cd]];
    for (let k = 0; k < 3; k++) samples.push([cx + 0.75 * (p[t * 6 + k * 2] - cx), cy + 0.75 * (p[t * 6 + k * 2 + 1] - cy), cd + 0.75 * (d[t * 3 + k] - cd)]);
    let visible = false;
    for (const [x, y, z] of samples) {
      const cand = grid.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`) ?? [];
      let hidden = false;
      for (const o of cand) {
        if (o === t) continue;
        const b = boxes[o];
        if (x <= b[0] || x >= b[2] || y <= b[1] || y >= b[3]) continue;
        const od = depthAt(o, x, y);
        if (od !== null && od < z - EXTERIOR.frontEps) {
          hidden = true;
          break;
        }
      }
      if (!hidden) {
        visible = true;
        break;
      }
    }
    out.push(visible);
  }
  return out;
}

const SIDE_TEXT: Record<SideLabel, string> = { avant: 'avant', arriere: 'arrière', gauche: 'gauche', droite: 'droit' };
export const sideText = (s: Pick<BoxSide, 'kind' | 'label'>) => `${s.kind === 'long' ? 'grand' : 'petit'} côté ${SIDE_TEXT[s.label]}`;

/** Texte de la zone dans le panneau : « Côtés extérieurs — 4 Viewbox · sans VITRE, PIED ». */
export function exteriorLabel(r: ExteriorRule, allModules: number): string {
  const which = r.modules ? (r.modules.length <= 4 ? r.modules.join(', ') : `${r.modules.length} Viewbox`) : `toutes les Viewbox (${allModules})`;
  const sides = r.sides.length === 2 ? '' : r.sides[0] === 'long' ? ' · grands côtés' : ' · petits côtés';
  const ex = r.exclude.length ? ` · sans ${r.exclude.map((c) => c || 'structure').join(', ')}` : '';
  return `Côtés extérieurs — ${which}${sides}${ex}${r.glass ? ' · vitrages compris' : ''}`;
}
