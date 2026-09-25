// Rendu SVG d'une vue 2D (fonction pure). Coordonnées et épaisseurs en mm papier : une vue exportée à 1:1
// se mesure en mm réels, et les épaisseurs de trait ne dépendent pas de l'échelle (dessin d'architecte).
import type { LayerKey, Linework2D } from './types';

export const STROKE_MM: Record<'silhouette' | 'visible' | 'fine' | 'hidden' | 'category', number> = {
  silhouette: 0.35,
  visible: 0.18,
  fine: 0.13,
  hidden: 0.13,
  category: 1.0,
};

export interface SvgOptions {
  /** échelle (50 = 1:50) */
  scale: number;
  /** marge autour du dessin (mm papier) */
  marginMm?: number;
  /** couleur des catégories (calques category:*) */
  categoryColors?: Record<string, string>;
  /** calques à ne pas dessiner */
  hideLayers?: LayerKey[];
  /** fond blanc (sinon transparent) */
  background?: boolean;
}

const num = (v: number) => {
  const s = v.toFixed(3);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
};

function styleOf(key: LayerKey, colors: Record<string, string>): string {
  if (key.startsWith('category:')) {
    const c = colors[key.slice(9)] ?? '#888888';
    return `stroke="${c}" stroke-width="${STROKE_MM.category}" stroke-linecap="butt" opacity="0.9"`;
  }
  const w = STROKE_MM[key as 'silhouette' | 'visible' | 'fine' | 'hidden'];
  const dash = key === 'hidden' ? ' stroke-dasharray="1.2 0.8"' : '';
  return `stroke="#000" stroke-width="${w}"${dash}`;
}

/** Taille papier (mm) d'une vue à une échelle donnée. */
export function paperSize(lw: Linework2D, scale: number, marginMm = 10): { width: number; height: number } {
  const b = lw.boundsMm;
  return { width: (b.maxX - b.minX) / scale + 2 * marginMm, height: (b.maxY - b.minY) / scale + 2 * marginMm };
}

export function lineworkToSvg(lw: Linework2D, opts: SvgOptions): string {
  const { scale, marginMm = 10, categoryColors = {}, hideLayers = [], background = true } = opts;
  const b = lw.boundsMm;
  const { width, height } = paperSize(lw, scale, marginMm);
  const X = (x: number) => num((x - b.minX) / scale + marginMm);
  const Y = (y: number) => num((b.maxY - y) / scale + marginMm);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(width)}mm" height="${num(height)}mm" viewBox="0 0 ${num(width)} ${num(height)}">`,
  );
  if (background) parts.push(`<rect width="100%" height="100%" fill="#fff"/>`);
  parts.push(`<g fill="none" stroke-linecap="round" stroke-linejoin="round">`);
  for (const layer of lw.layers) {
    if (hideLayers.includes(layer.key)) continue;
    const d: string[] = [];
    for (const pl of layer.polylines) {
      if (pl.length < 4) continue;
      let s = `M${X(pl[0])} ${Y(pl[1])}`;
      for (let i = 2; i < pl.length; i += 2) s += `L${X(pl[i])} ${Y(pl[i + 1])}`;
      d.push(s);
    }
    if (d.length) parts.push(`<path data-layer="${layer.key}" ${styleOf(layer.key, categoryColors)} d="${d.join('')}"/>`);
  }
  parts.push('</g></svg>');
  return parts.join('');
}
