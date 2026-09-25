// Accroche des cotes et repères (§9.3) : extrémités, milieux et centres de cercles des traits d'une vue, dans un index
// en grille (recherche du point le plus proche en temps constant). Fonction pure, coordonnées mm modèle (dessin).
import type { Linework2D } from '../linework/types';

export type SnapKind = 'end' | 'mid' | 'center';

export interface SnapHit {
  x: number;
  y: number;
  kind: SnapKind;
}

export interface SnapIndex {
  count: number;
  nearest(x: number, y: number, tol: number): SnapHit | null;
}

/** Une polyligne fermée dont les sommets sont à égale distance de leur centre est un cercle. */
function circleCenter(pl: Float64Array): { x: number; y: number } | null {
  const n = pl.length / 2;
  if (n < 9) return null;
  if (Math.hypot(pl[0] - pl[pl.length - 2], pl[1] - pl[pl.length - 1]) > 0.2) return null;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n - 1; i++) {
    cx += pl[i * 2];
    cy += pl[i * 2 + 1];
  }
  cx /= n - 1;
  cy /= n - 1;
  let rMin = Infinity;
  let rMax = 0;
  for (let i = 0; i < n - 1; i++) {
    const r = Math.hypot(pl[i * 2] - cx, pl[i * 2 + 1] - cy);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
  }
  return rMin > 0.5 && rMax / rMin < 1.06 ? { x: cx, y: cy } : null;
}

export function buildSnapIndex(lw: Linework2D, cell = 100): SnapIndex {
  const xs: number[] = [];
  const ys: number[] = [];
  const kinds: SnapKind[] = [];
  const seen = new Set<string>();
  const add = (x: number, y: number, kind: SnapKind) => {
    const key = `${Math.round(x * 20)},${Math.round(y * 20)}`;
    if (seen.has(key)) return;
    seen.add(key);
    xs.push(x);
    ys.push(y);
    kinds.push(kind);
  };
  for (const layer of lw.layers) {
    if (layer.key === 'hidden' || layer.key.startsWith('category:')) continue;
    for (const pl of layer.polylines) {
      const c = circleCenter(pl);
      if (c) add(c.x, c.y, 'center');
      for (let i = 0; i < pl.length; i += 2) add(pl[i], pl[i + 1], 'end');
      for (let i = 2; i < pl.length; i += 2) add((pl[i - 2] + pl[i]) / 2, (pl[i - 1] + pl[i + 1]) / 2, 'mid');
    }
  }
  const grid = new Map<string, number[]>();
  for (let i = 0; i < xs.length; i++) {
    const k = `${Math.floor(xs[i] / cell)},${Math.floor(ys[i] / cell)}`;
    const l = grid.get(k);
    if (l) l.push(i);
    else grid.set(k, [i]);
  }
  return {
    count: xs.length,
    nearest(x, y, tol) {
      const r = Math.ceil(tol / cell);
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      let best = -1;
      let bestD = Infinity;
      for (let dx = -r; dx <= r; dx++)
        for (let dy = -r; dy <= r; dy++)
          for (const i of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
            // léger avantage aux extrémités et aux centres : ce sont les points qu'on cote le plus
            const d = Math.hypot(xs[i] - x, ys[i] - y) * (kinds[i] === 'mid' ? 1.15 : 1);
            if (d <= tol && d < bestD) {
              bestD = d;
              best = i;
            }
          }
      return best < 0 ? null : { x: xs[best], y: ys[best], kind: kinds[best] };
    },
  };
}
