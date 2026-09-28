// Export PDF vectoriel des planches (P5) : une page par planche au format exact (A1 841 × 594 mm, A3 420 × 297 mm),
// dessinée depuis le même SVG que l'écran (SheetSvg) par svg2pdf.js. Traits, cotes, textes et logos restent
// vectoriels, les polices Gelasio / Arimo sont intégrées (TTF complets, licence OFL) ; seules les images 3D sont des
// images (voir assets.ts).
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { Paper } from '../types';
import { PAPER_MM } from '../template';

export type FontFamily = 'Gelasio' | 'Arimo';
/** Variantes au sens de jsPDF / svg2pdf (font-weight 700 = bold, font-style italic). */
export type FontVariant = 'normal' | 'bold' | 'italic' | 'bolditalic';
export type FontKey = `${FontFamily}-${FontVariant}`;
export type FontFiles = Partial<Record<FontKey, ArrayBuffer>>;

/** Nom des fichiers de police (src/sheets/pdf/fonts). */
export const FONT_FILE: Record<FontVariant, string> = { normal: 'Regular', bold: 'Bold', italic: 'Italic', bolditalic: 'BoldItalic' };

export interface PdfPage {
  /** SVG de la planche (renderToStaticMarkup de SheetSvg, sans édition) */
  svg: string;
  paper: Paper;
}

export interface PdfMeta {
  title: string;
  subject?: string;
}

/** Polices utilisées par les textes des planches (famille, gras, italique). */
export function fontsUsed(svgs: string[]): FontKey[] {
  const keys = new Set<FontKey>();
  for (const svg of svgs)
    for (const m of svg.matchAll(/<text\b([^>]*)>/g)) {
      const a = m[1];
      const family: FontFamily = /font-family="\s*Arimo/.test(a) ? 'Arimo' : 'Gelasio';
      const bold = /font-weight="(700|bold)"/.test(a);
      const italic = /font-style="italic"/.test(a);
      keys.add(`${family}-${bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'normal'}`);
    }
  return [...keys].sort();
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Document PDF du jeu de plans (une page par planche). */
export async function buildPdf(pages: PdfPage[], fonts: FontFiles, meta: PdfMeta, onPage?: (done: number, total: number) => void): Promise<jsPDF> {
  if (!pages.length) throw new Error('Aucune planche à exporter');
  const size = (p: Paper): [number, number] => [PAPER_MM[p].w, PAPER_MM[p].h];
  const pdf = new jsPDF({ unit: 'mm', format: size(pages[0].paper), orientation: 'landscape', compress: true, putOnlyUsedFonts: true });
  for (const [key, buf] of Object.entries(fonts) as Array<[FontKey, ArrayBuffer]>) {
    const [family, variant] = key.split('-') as [FontFamily, FontVariant];
    const file = `${family}-${FONT_FILE[variant]}.ttf`;
    pdf.addFileToVFS(file, base64(buf));
    pdf.addFont(file, family, variant);
  }
  pdf.setProperties({ title: meta.title, subject: meta.subject ?? '', author: 'Viewbox International SA', creator: 'VEM · Plans Viewbox' });
  // svg2pdf lit le SVG dans le document (styles, polices) : il est posé hors écran le temps de la conversion
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:10px;height:10px;overflow:hidden';
  document.body.appendChild(host);
  try {
    for (let i = 0; i < pages.length; i++) {
      const [w, h] = size(pages[i].paper);
      if (i > 0) pdf.addPage([w, h], 'landscape');
      host.innerHTML = pages[i].svg;
      const svg = host.querySelector('svg');
      if (!svg) throw new Error(`Planche ${i + 1} : SVG invalide`);
      await svg2pdf(svg, pdf, { x: 0, y: 0, width: w, height: h });
      host.innerHTML = '';
      onPage?.(i + 1, pages.length);
      // laisse respirer l'interface entre deux planches
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    host.remove();
  }
  return pdf;
}
