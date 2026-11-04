// Emplacement d'une légende PAINTING sur une planche : premier emplacement libre de la zone de dessin (de bas en
// haut, de droite à gauche), sinon en bas à gauche. Partagé par l'éditeur (« 🎨 Peinture ») et la génération du jeu
// (« Peindre les côtés extérieurs » dans l'assistant).
import type { PaintLegendItem, Sheet, ViewportItem } from './types';
import type { ViewportData } from './SheetSvg';
import { itemBox } from './SheetSvg';
import { DRAW_AREA, scaleRect, templateScale } from './template';
import { newId } from './generate';

export const LEGEND_AREAS_KEY = 'vem_paint_legend_areas';

/** m² dans une nouvelle légende peinture : dernier choix fait dans le panneau (oui par défaut). */
export function legendAreasPref(): boolean {
  try {
    return localStorage.getItem(LEGEND_AREAS_KEY) !== '0';
  } catch {
    return true;
  }
}

export function placePaintLegend(sheet: Sheet, viewData: (vp: ViewportItem) => ViewportData | undefined, areas = legendAreasPref()): PaintLegendItem {
  const k = templateScale(sheet.paper);
  const w = 90 * k;
  const h = 40 * k;
  const area = scaleRect(DRAW_AREA, k);
  const boxes = sheet.items.map((i) => itemBox(i, sheet, viewData, k));
  const free = (x: number, y: number) => !boxes.some((b) => x < b.x + b.w + 2 * k && x + w + 2 * k > b.x && y < b.y + b.h + 2 * k && y + h + 2 * k > b.y);
  let rect = { x: area.x + 4 * k, y: area.y + area.h - h - 4 * k, w, h };
  search: for (let y = area.y + area.h - h - 4 * k; y >= area.y + 4 * k; y -= 5 * k)
    for (let x = area.x + area.w - w - 4 * k; x >= area.x + 4 * k; x -= 5 * k)
      if (free(x, y)) {
        rect = { x, y, w, h };
        break search;
      }
  return { id: newId('g'), type: 'paintLegend', rect, lang: 'en', scope: 'sheet', areas };
}
