// Disposition des blocs d'une vue spéciale (pure) : Viewbox séparées en gardant rangées / colonnes ou en grille
// compacte, étages côte à côte, « ensemble + séparées ». Chaque bloc garde ses coordonnées de dessin et reçoit
// une translation (mm modèle).
import type { ViewLayout } from './types';

export interface Bounds2D {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface LayoutBlock {
  key: string;
  modules: string[];
  level: number;
  bounds: Bounds2D;
  /** position de la Viewbox dans la vue d'ensemble (centre projeté) : rangées / colonnes */
  anchor: [number, number];
}

/** Regroupement de valeurs proches (≤ tol) : rang de chaque valeur dans l'ordre croissant. */
export function clusterRanks(values: number[], tol = 300): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const rank = new Array<number>(values.length).fill(0);
  let r = 0;
  let start = order.length ? order[0].v : 0;
  for (let k = 0; k < order.length; k++) {
    if (k > 0 && order[k].v - start > tol) {
      r++;
      start = order[k].v;
    }
    rank[order[k].i] = r;
  }
  return rank;
}

const width = (b: Bounds2D) => b.maxX - b.minX;
const height = (b: Bounds2D) => b.maxY - b.minY;

function unionOf(blocks: LayoutBlock[], moves: Map<string, [number, number]>): Bounds2D {
  const u = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const b of blocks) {
    const [dx, dy] = moves.get(b.key) ?? [0, 0];
    u.minX = Math.min(u.minX, b.bounds.minX + dx);
    u.minY = Math.min(u.minY, b.bounds.minY + dy);
    u.maxX = Math.max(u.maxX, b.bounds.maxX + dx);
    u.maxY = Math.max(u.maxY, b.bounds.maxY + dy);
  }
  return u;
}

/**
 * Séparées en gardant la disposition : colonne c, rangée r (regroupées à 300 mm près) ⇒ décalage (c·écart, r·écart).
 * Des Viewbox qui se touchent s'écartent exactement de l'écart.
 */
function keepArrangement(blocks: LayoutBlock[], gap: number): Map<string, [number, number]> {
  const cols = clusterRanks(blocks.map((b) => b.anchor[0]));
  const rows = clusterRanks(blocks.map((b) => b.anchor[1]));
  return new Map(blocks.map((b, i) => [b.key, [cols[i] * gap, rows[i] * gap] as [number, number]]));
}

/** Grille compacte : ordre niveau puis X puis Y ; cases à la taille du plus grand bloc. */
function compactGrid(blocks: LayoutBlock[], gap: number, columns?: number): Map<string, [number, number]> {
  const order = [...blocks].sort((a, b) => a.level - b.level || a.anchor[0] - b.anchor[0] || b.anchor[1] - a.anchor[1] || a.key.localeCompare(b.key));
  const n = order.length;
  const cols = Math.max(1, Math.min(n, columns ?? Math.ceil(Math.sqrt(n))));
  const cw = Math.max(0, ...order.map((b) => width(b.bounds)));
  const ch = Math.max(0, ...order.map((b) => height(b.bounds)));
  const out = new Map<string, [number, number]>();
  order.forEach((b, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    // coin haut gauche de la case
    const x = c * (cw + gap);
    const y = -r * (ch + gap);
    out.set(b.key, [x - b.bounds.minX, y - b.bounds.maxY]);
  });
  return out;
}

/** Groupes posés côte à côte de gauche à droite (étages en plan), alignés en haut. */
function sideBySide(groups: LayoutBlock[][], moves: Map<string, [number, number]>, gap: number): void {
  let x = 0;
  let top = 0;
  groups.forEach((g, i) => {
    const u = unionOf(g, moves);
    if (i === 0) {
      x = u.maxX + gap;
      top = u.maxY;
      return;
    }
    const dx = x - u.minX;
    const dy = top - u.maxY;
    for (const b of g) {
      const m = moves.get(b.key) ?? [0, 0];
      moves.set(b.key, [m[0] + dx, m[1] + dy]);
    }
    x = u.maxX + dx + gap;
  });
}

export interface ArrangeOptions {
  /** vue en plan (dessus / dessous) : étages séparés côte à côte ; sinon (élévation) ils sont déjà l'un au-dessus de l'autre */
  plan: boolean;
  /** blocs dans leur propre repère (chaque Viewbox) : leurs positions de départ ne veulent rien dire, grille */
  ownFrames?: boolean;
}

/** Translation de chaque bloc. */
export function arrangeBlocks(blocks: LayoutBlock[], layout: ViewLayout, opts: ArrangeOptions): Map<string, [number, number]> {
  if (blocks.length <= 1) return new Map(blocks.map((b) => [b.key, [0, 0] as [number, number]]));
  const gap = layout.gap;
  const levels = [...new Set(blocks.map((b) => b.level))].sort((a, b) => a - b);
  const byLevel = opts.plan && layout.levels === 'separate' && levels.length > 1 ? levels.map((l) => blocks.filter((b) => b.level === l)) : [blocks];
  const moves = new Map<string, [number, number]>();
  for (const g of byLevel) {
    const m = opts.ownFrames || !layout.keepArrangement ? compactGrid(g, gap, layout.columns) : keepArrangement(g, gap);
    for (const [k, v] of m) moves.set(k, v);
  }
  if (byLevel.length > 1) sideBySide(byLevel, moves, gap * 2);
  return moves;
}

/** Ensemble + séparées : le groupe « séparées » sous l'ensemble, aligné à gauche, à deux écarts. */
export function stackBelow(top: Bounds2D, below: Bounds2D, gap: number): [number, number] {
  return [top.minX - below.minX, top.minY - gap * 2 - below.maxY];
}

export function translateBounds(b: Bounds2D, d: [number, number]): Bounds2D {
  return { minX: b.minX + d[0], minY: b.minY + d[1], maxX: b.maxX + d[0], maxY: b.maxY + d[1] };
}
