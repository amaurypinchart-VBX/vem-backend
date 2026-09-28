// Images 3D des planches : captures enregistrées de la vue 3D + images déjà placées dans le jeu (fonctions pures).
import type { SavedCapture } from '../api/vem';
import type { DrawingSet, Image3dItem, RectMm } from './types';

export interface PickableImage {
  url: string;
  name: string;
  width: number;
  height: number;
  createdAt?: string;
}

/** Images des planches du jeu qui ne sont pas des captures de la liste (images générées, captures retirées…). */
export function otherImagesOfSet(doc: DrawingSet, captures: SavedCapture[]): PickableImage[] {
  const known = new Set(captures.map((c) => c.url));
  const out = new Map<string, PickableImage>();
  for (const s of doc.sheets)
    for (const it of s.items) {
      if (it.type !== 'image3d' || !it.url || known.has(it.url) || out.has(it.url)) continue;
      const img = it as Image3dItem;
      out.set(img.url, { url: img.url, name: `${s.number || 'Planche'}${img.label ? ` · ${img.label}` : ''}`, width: img.width, height: img.height });
    }
  return [...out.values()];
}

/** Cadre d'une image ajoutée : aux proportions de l'image, dans la place par défaut (250 × 180 mm en A1). */
export function insertRect(img: { width: number; height: number }, k = 1, at = { x: 30, y: 60 }): RectMm {
  const ratio = img.width > 0 && img.height > 0 ? img.height / img.width : 0.75;
  let w = 250 * k;
  let h = w * ratio;
  if (h > 180 * k) {
    h = 180 * k;
    w = h / ratio;
  }
  return { x: at.x * k, y: at.y * k, w, h };
}
