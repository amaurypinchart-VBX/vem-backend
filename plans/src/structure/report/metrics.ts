// Mesure des textes du rapport : largeurs d'avance réelles d'Arimo (police intégrée au PDF, métriques d'Arial), pour
// couper les lignes et remplir les colonnes exactement comme le PDF les dessinera. Fonctions pures ; tailles en mm.
import { ARIMO_BOLD, ARIMO_REGULAR } from './metrics.data';

function decode(s: string): Map<number, number> {
  const m = new Map<number, number>();
  for (const pair of s.split(',')) {
    const [c, w] = pair.split(':');
    m.set(parseInt(c, 36), parseInt(w, 36));
  }
  return m;
}

let regular: Map<number, number> | null = null;
let bold: Map<number, number> | null = null;
/** largeur par défaut (caractère absent de la table) : celle d'un chiffre */
const FALLBACK = 556;

/** Largeur (mm) d'un texte en Arimo à la taille `size` (mm, hauteur de corps). */
export function textWidth(text: string, size: number, isBold = false): number {
  const table = isBold ? (bold ??= decode(ARIMO_BOLD)) : (regular ??= decode(ARIMO_REGULAR));
  let w = 0;
  for (const ch of text) w += table.get(ch.codePointAt(0)!) ?? FALLBACK;
  return (w / 1000) * size;
}

/**
 * Coupe un texte en lignes d'au plus `width` mm (retours à la ligne explicites respectés ; un mot trop long est coupé
 * à la largeur, sans trait d'union).
 */
export function wrapText(text: string, width: number, size: number, isBold = false): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/ +/).filter(Boolean);
    if (!words.length) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const cand = line ? `${line} ${word}` : word;
      if (textWidth(cand, size, isBold) <= width) {
        line = cand;
        continue;
      }
      if (line) out.push(line);
      // mot plus long que la ligne : coupé caractère par caractère
      let rest = word;
      while (textWidth(rest, size, isBold) > width && rest.length > 1) {
        let k = rest.length - 1;
        while (k > 1 && textWidth(rest.slice(0, k), size, isBold) > width) k--;
        out.push(rest.slice(0, k));
        rest = rest.slice(k);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

/** Texte tronqué avec « … » pour tenir dans `width` mm. */
export function ellipsis(text: string, width: number, size: number, isBold = false): string {
  if (textWidth(text, size, isBold) <= width) return text;
  let k = text.length;
  while (k > 0 && textWidth(`${text.slice(0, k)}…`, size, isBold) > width) k--;
  return `${text.slice(0, k)}…`;
}
