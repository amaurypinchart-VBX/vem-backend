// Gabarit des planches Viewbox, relevé sur les planches LayOut de référence (PDF NVIDIA, A1 paysage 841 × 594 mm) :
// cadre de dessin à gauche, colonne cartouche à droite, encadré de titre en haut à droite du cadre.
// Toutes les cotes sont données pour l'A1 ; l'A3 est le même gabarit à l'échelle (420 / 841).
import type { Paper, RectMm } from './types';

export const PAPER_MM: Record<Paper, { w: number; h: number }> = {
  A1: { w: 841, h: 594 },
  A3: { w: 420, h: 297 },
};

/** Facteur du gabarit (relevé en A1) pour un format. */
export function templateScale(paper: Paper): number {
  return PAPER_MM[paper].w / PAPER_MM.A1.w;
}

/** Cadre de dessin (A1). */
export const FRAME: RectMm = { x: 12.7, y: 14.4, w: 696.1, h: 568.8 };
/** Encadré du titre de planche, en haut à droite du cadre (A1). */
export const TITLE_BOX: RectMm = { x: 590.6, y: 14.4, w: 118.2, h: 15.5 };
/** Zone utile pour les vues : le cadre sans l'encadré de titre (A1). */
export const DRAW_AREA: RectMm = { x: 16, y: 32, w: 689, h: 547 };

/** Colonne cartouche (A1) : bords, séparateurs, textes (positions = haut du texte). */
export const TB = {
  left: 708.0,
  right: 814.4,
  col2: 765.6,
  textX: 710.1,
  logo: { x: 663.0, y: -43.7, w: 210.4, h: 174.8 },
  separators: [97.4, 122.8, 142.6, 173.0, 262.0, 372.6],
  company: { y: 76.0, lines: ['Avenue Robert Schuman 112', '1480 Tubize', 'Belgium', 'BE 0753.562.910'], lineStep: 4.0 },
  client: { y: 99.4 },
  project: { y: 124.7, issueY: 133.7 },
  people: { y: 144.4, projectManagerY: 157.0 },
  notes: { y: 174.9, lineStep: 4.3 },
  legend: { y: 264.1, firstItemY: 274.8, step: 7.0, lineX0: 714.0, lineX1: 723.9, labelX: 730.0 },
  drawnBy: { y: 501.4, deadlineY: 510.2 },
  signature: { labelY: 522.0, box: { x: 712.7, y: 526.6, w: 117.5, h: 28.0 } },
  sheetNumber: { x: 742.9, y: 564.3, size: 7.0 },
  size: { header: 3.3, body: 2.8, small: 2.5, notes: 2.9, legend: 3.1 },
};

/** Titres de vue (« Long side ») : Gelasio, ~13 mm en A1. */
export const VIEW_TITLE_SIZE = 12;

/** Couverture (A1). */
export const COVER = {
  wordmark: { x: 482.3, y: -11.0, w: 389.9, h: 146.2 },
  logo: { x: -5.7, y: 461.1, w: 211.0, h: 172.6 },
  band: { y: 547.5, h: 29.5, columns: [186.5, 288.7, 389.2, 490.2, 591.2, 691.6], labelY: 552.5, valueY: 561.3, size: 3.3 },
  /** emplacements des 4 vues 3D */
  views: [
    { x: 83.0, y: 18.1, w: 259.4, h: 245.7 },
    { x: 497.9, y: 79.1, w: 259.4, h: 245.7 },
    { x: 62.9, y: 263.8, w: 259.4, h: 245.7 },
    { x: 276.4, y: 220.4, w: 505.5, h: 303.2 },
  ] as RectMm[],
};

/** Texte fixe « GENERAL NOTES VIEWBOX » (modifiable dans les réglages). */
export const DEFAULT_GENERAL_NOTES = [
  'Document protected – Property of Viewbox International SA.',
  'Unauthorised reproduction or use is prohibited.',
  'Not to be used for scaling.',
  '',
  'Dimensions in mm unless stated otherwise.',
  'Critical dimensions to be checked on site.',
  'Design assumption: level and stable supporting surface.',
  'No client-specific data included.',
  '',
  'Allowable loads (unfactored):',
  'Ground floor: 500 kg/m²',
  'First floor: 350 kg/m²',
  '',
  'Any additional elements (cladding, signage, equipment, etc.) require',
  'separate wind resistance testing.',
  '',
  'Structure must not be used without a validated inspection certificate.',
  'Partial use only with approval of the Crew Boss or Project Manager.',
].join('\n');

export const FONT_SERIF = "Gelasio, Georgia, 'Times New Roman', serif";
export const FONT_SANS = "Arimo, Arial, Helvetica, sans-serif";

/** Mise à l'échelle d'un rectangle du gabarit A1 vers un format. */
export function scaleRect(r: RectMm, k: number): RectMm {
  return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
}
