// SVG d'une vue spéciale : traits (lineworkToSvg) + titres des blocs (« Ensemble », « VBX-01 = VBX-04 ») au-dessus
// de chaque bloc. Pure. Coordonnées en mm papier, comme lineworkToSvg.
import type { Linework2D } from './types';
import type { SvgOptions } from './svg';
import { lineworkToSvg } from './svg';

export interface SvgLabel {
  text: string;
  /** coin haut gauche du bloc (mm modèle, repère du dessin) */
  x: number;
  y: number;
}

/** Hauteur des titres de blocs (mm papier). */
export const BLOCK_LABEL_MM = 3.5;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function customViewSvg(lw: Linework2D, labels: SvgLabel[], opts: SvgOptions): string {
  const margin = opts.marginMm ?? 10;
  // place pour les titres au-dessus des blocs
  const extra = labels.length ? (BLOCK_LABEL_MM * 2 * opts.scale) : 0;
  const b = lw.boundsMm;
  const grown: Linework2D = { ...lw, boundsMm: { ...b, maxY: b.maxY + extra } };
  const svg = lineworkToSvg(grown, opts);
  if (!labels.length) return svg;
  const X = (x: number) => ((x - b.minX) / opts.scale + margin).toFixed(2);
  const Y = (y: number) => ((b.maxY + extra - y) / opts.scale + margin - BLOCK_LABEL_MM * 0.6).toFixed(2);
  const texts = labels
    .map((l) => `<text data-layer="label" x="${X(l.x)}" y="${Y(l.y)}" font-family="Arimo, Arial, sans-serif" font-size="${BLOCK_LABEL_MM}" font-weight="700" fill="#111">${esc(l.text)}</text>`)
    .join('');
  return svg.replace(/<\/svg>$/, `${texts}</svg>`);
}
