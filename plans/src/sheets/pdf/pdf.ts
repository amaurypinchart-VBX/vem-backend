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
  /**
   * SVG de la planche (renderToStaticMarkup de SheetSvg, sans édition) ; ou une fonction qui le produit au moment de
   * convertir la page (téléphone, très gros modèle : une seule planche en mémoire à la fois, vues lues à ce moment)
   */
  svg: string | (() => string | Promise<string>);
  paper: Paper;
  /** format explicite en mm (ex. A4 portrait 210 × 297 des fiches de l'étude structure) ; sinon celui de `paper` */
  size?: { w: number; h: number };
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
  const size = (p: PdfPage): [number, number] => (p.size ? [p.size.w, p.size.h] : [PAPER_MM[p.paper].w, PAPER_MM[p.paper].h]);
  const orientation = (p: PdfPage) => (size(p)[0] >= size(p)[1] ? 'landscape' : 'portrait');
  const pdf = new jsPDF({ unit: 'mm', format: size(pages[0]), orientation: orientation(pages[0]), compress: true, putOnlyUsedFonts: true });
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
      const [w, h] = size(pages[i]);
      if (i > 0) pdf.addPage([w, h], orientation(pages[i]));
      const src = pages[i].svg;
      host.innerHTML = typeof src === 'function' ? await src() : src;
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

/**
 * Comme buildPdf, mais par morceaux pour les très gros jeux : jsPDF garde le dessin de toutes les pages en texte non
 * compressé jusqu'à la fin, ce qui dépassait la mémoire de l'onglet sur un gros modèle (Xiaomi, 1,6 M de triangles).
 * Dès que le SVG des pages en cours dépasse `maxSvgChars`, le morceau est écrit (compressé) et oublié ; les morceaux
 * sont réunis à la fin avec pdf-lib. Un seul morceau ⇒ même fichier que buildPdf.
 */
export async function buildPdfBlob(
  pages: PdfPage[],
  fonts: FontFiles,
  meta: PdfMeta,
  onPage?: (done: number, total: number) => void,
  opts: { maxSvgChars?: number } = {},
): Promise<Blob> {
  if (!pages.length) throw new Error('Aucune planche à exporter');
  const limit = opts.maxSvgChars ?? Infinity;
  const size = (p: PdfPage): [number, number] => (p.size ? [p.size.w, p.size.h] : [PAPER_MM[p.paper].w, PAPER_MM[p.paper].h]);
  const orientation = (p: PdfPage) => (size(p)[0] >= size(p)[1] ? 'landscape' : 'portrait');
  const start = (p: PdfPage) => {
    const pdf = new jsPDF({ unit: 'mm', format: size(p), orientation: orientation(p), compress: true, putOnlyUsedFonts: true });
    for (const [key, buf] of Object.entries(fonts) as Array<[FontKey, ArrayBuffer]>) {
      const [family, variant] = key.split('-') as [FontFamily, FontVariant];
      const file = `${family}-${FONT_FILE[variant]}.ttf`;
      pdf.addFileToVFS(file, base64(buf));
      pdf.addFont(file, family, variant);
    }
    pdf.setProperties({ title: meta.title, subject: meta.subject ?? '', author: 'Viewbox International SA', creator: 'VEM · Plans Viewbox' });
    return pdf;
  };
  const chunks: ArrayBuffer[] = [];
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;width:10px;height:10px;overflow:hidden';
  document.body.appendChild(host);
  let pdf: jsPDF | null = null;
  let chars = 0;
  try {
    for (let i = 0; i < pages.length; i++) {
      const [w, h] = size(pages[i]);
      if (!pdf) pdf = start(pages[i]);
      else pdf.addPage([w, h], orientation(pages[i]));
      const src = pages[i].svg;
      const markup = typeof src === 'function' ? await src() : src;
      chars += markup.length;
      host.innerHTML = markup;
      const svg = host.querySelector('svg');
      if (!svg) throw new Error(`Planche ${i + 1} : SVG invalide`);
      await svg2pdf(svg, pdf, { x: 0, y: 0, width: w, height: h });
      host.innerHTML = '';
      onPage?.(i + 1, pages.length);
      if (chars >= limit && i < pages.length - 1) {
        chunks.push(pdf.output('arraybuffer'));
        pdf = null;
        chars = 0;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    host.remove();
  }
  if (!chunks.length) return pdf!.output('blob');
  chunks.push(pdf!.output('arraybuffer'));
  pdf = null;
  // réunion des morceaux (flux déjà compressés, copiés tels quels)
  const { PDFDocument } = await import('pdf-lib');
  const out = await PDFDocument.create();
  for (const c of chunks.splice(0)) {
    const part = await PDFDocument.load(c);
    for (const p of await out.copyPages(part, part.getPageIndices())) out.addPage(p);
  }
  out.setTitle(meta.title);
  out.setSubject(meta.subject ?? '');
  out.setAuthor('Viewbox International SA');
  out.setCreator('VEM · Plans Viewbox');
  out.setProducer('VEM · Plans Viewbox');
  const bytes = await out.save({ useObjectStreams: true });
  return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/pdf' });
}
