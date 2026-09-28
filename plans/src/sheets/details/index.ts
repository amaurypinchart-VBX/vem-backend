// Bibliothèque des détails types (dessins fixes et vectoriels à placer sur les planches), et leur échelle.
import type { RectMm } from '../types';
import type { DetailShape } from './types';
import profiles from './profiles';

export type { DetailShape } from './types';

export const DETAILS: Record<string, DetailShape> = { [profiles.id]: profiles };

/** Échelles proposées pour un détail (1:13 = celle du plan d'origine en A3). */
export const DETAIL_SCALES = [2, 5, 10, 13, 15, 20, 25];

/** Mm papier par mm réel du détail dans son cadre (dessin centré, proportions gardées). */
export function detailFit(d: DetailShape, rect: RectMm): { k: number; x: number; y: number } {
  const k = Math.min(rect.w / d.width, rect.h / d.height);
  return { k, x: rect.x + (rect.w - d.width * k) / 2, y: rect.y + (rect.h - d.height * k) / 2 };
}

/** Échelle affichée (10 = 1:10), arrondie au dixième. */
export function detailScale(d: DetailShape, rect: RectMm): number {
  return Math.round(10 / detailFit(d, rect).k) / 10;
}

/** Cadre d'un détail à l'échelle 1:scale, coin haut-gauche en (x, y). */
export function detailRect(d: DetailShape, scale: number, x: number, y: number): RectMm {
  return { x, y, w: d.width / scale, h: d.height / scale };
}
