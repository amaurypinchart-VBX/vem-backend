// Rendu SVG d'une vue 2D (fonction pure). Coordonnées et épaisseurs en mm papier : une vue exportée à 1:1
// se mesure en mm réels, et les épaisseurs de trait ne dépendent pas de l'échelle (dessin d'architecte).
import type { LayerKey, Linework2D } from './types';

export const STROKE_MM: Record<'silhouette' | 'visible' | 'fine' | 'hidden' | 'category' | 'mark' | 'cut' | 'cut-hatch' | 'ghost', number> = {
  silhouette: 0.35,
  visible: 0.18,
  fine: 0.13,
  hidden: 0.13,
  category: 1.0,
  mark: 0.25,
  // vues spéciales
  cut: 0.5,
  'cut-hatch': 0.09,
  ghost: 0.13,
};

/** Gris des éléments fantôme (vues spéciales). */
export const GHOST_COLOR = '#b4b4b4';

/** Couleur des vitres sans couleur de légende (hachure « // »), comme sur les plans Viewbox. */
export const GLASS_MARK_COLOR = '#1EAAF1';

/** Couleur de trait lisible sur fond blanc : une couleur très claire (jaune « Wall Light ») est foncée. */
export function inkOf(color: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  if (0.299 * r + 0.587 * g + 0.114 * b < 190) return color;
  const k = 0.7;
  return `#${[r, g, b].map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('')}`;
}

/** Couleur d'un calque « mark:CATÉGORIE » (repères façade) ; croix des murs (« mark:CROSS ») en noir. */
export function markColor(key: string, colors: Record<string, string> | Map<string, string>): string {
  if (key === 'mark:CROSS') return '#000';
  const cat = key.slice(5);
  const c = colors instanceof Map ? colors.get(cat) : colors[cat];
  return inkOf(c ?? GLASS_MARK_COLOR);
}

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
  /** vues spéciales : épaisseur du trait de coupe (mm papier) et gris des fantômes */
  cutLineMm?: number;
  ghostColor?: string;
}

const num = (v: number) => {
  const s = v.toFixed(3);
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
};

function styleOf(key: LayerKey, colors: Record<string, string>, opts: Pick<SvgOptions, 'cutLineMm' | 'ghostColor'> = {}): string {
  if (key === 'cut') return `stroke="#000" stroke-width="${opts.cutLineMm ?? STROKE_MM.cut}"`;
  if (key === 'cut-hatch') return `stroke="#000" stroke-width="${STROKE_MM['cut-hatch']}" stroke-linecap="butt"`;
  if (key === 'ghost') return `stroke="${opts.ghostColor ?? GHOST_COLOR}" stroke-width="${STROKE_MM.ghost}"`;
  if (key.startsWith('category:')) {
    const c = colors[key.slice(9)] ?? '#888888';
    return `stroke="${c}" stroke-width="${STROKE_MM.category}" stroke-linecap="butt" opacity="0.9"`;
  }
  if (key.startsWith('mark:')) return `stroke="${markColor(key, colors)}" stroke-width="${STROKE_MM.mark}"`;
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
  if (lw.fills?.length) {
    // aplats des pièces coupées, sous les traits (règle pair-impair : les trous restent vides)
    for (const f of lw.fills) {
      let d = '';
      for (const r of f.rings) {
        if (r.length < 6) continue;
        d += `M${X(r[0])} ${Y(r[1])}`;
        for (let i = 2; i < r.length; i += 2) d += `L${X(r[i])} ${Y(r[i + 1])}`;
        d += 'Z';
      }
      if (d) parts.push(`<path data-layer="cut-fill" fill="${f.color}" fill-rule="evenodd" stroke="none" d="${d}"/>`);
    }
  }
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
    if (d.length) parts.push(`<path data-layer="${layer.key}" ${styleOf(layer.key, categoryColors, opts)} d="${d.join('')}"/>`);
  }
  parts.push('</g></svg>');
  return parts.join('');
}
