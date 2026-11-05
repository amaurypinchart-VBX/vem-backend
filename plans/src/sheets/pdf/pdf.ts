// Export PDF vectoriel des planches (P5) : une page par planche au format exact (A1 841 × 594 mm, A3 420 × 297 mm),
// dessinée depuis le même SVG que l'écran (SheetSvg) par svg2pdf.js. Traits, cotes, textes et logos restent
// vectoriels, les polices Gelasio / Arimo sont intégrées (TTF complets, licence OFL) ; seules les images 3D sont des
// images (voir assets.ts).
import { jsPDF } from 'jspdf';
import { svg2pdf } from 'svg2pdf.js';
import type { Paper } from '../types';
import type { PdfLineSink } from '../SheetSvg';
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

// ─── traits des vues écrits directement dans le PDF ───
// svg2pdf transforme chaque segment d'un chemin en objets (≈ 1 Ko de mémoire par trait, 90 octets de texte par trait
// dans la page) : une vue de toute l'installation d'un gros modèle (centaines de milliers de traits) faisait planter
// l'onglet. SheetSvg (prop pdfLines) remplace chaque calque de traits par un chemin repère « M x y » aux coordonnées
// impossibles ; quand svg2pdf le dessine, il a déjà posé la transformation, le découpage, l'épaisseur, la couleur et
// les tirets du calque : on écrit alors les vrais traits à sa place, puis svg2pdf termine par son « S ».
const MARK_X0 = -987650000;
const MARK_Y = -123450000;

/** Traits des vues de l'export en cours (remis par SheetSvg, écrits par le PDF à la place de leur repère). */
export class PdfLines implements PdfLineSink {
  private items = new Map<number, Float64Array[]>();
  private next = 0;
  /** nombres écrits dans le PDF depuis la dernière lecture (taille du morceau en cours, voir buildPdfBlob) */
  written = 0;
  add(polylines: Float64Array[]): string {
    const i = this.next++;
    this.items.set(i, polylines);
    return `M${MARK_X0 - i} ${MARK_Y}`;
  }
  take(x: number, y: number): Float64Array[] | undefined {
    if (y !== MARK_Y) return undefined;
    // gardés jusqu'à clear() : le même SVG peut être converti deux fois (PDF refait plus léger pour le projet)
    return this.items.get(MARK_X0 - x);
  }
  clear(): void {
    this.items.clear();
  }
}

/** coordonnée à 0,001 près (unités utilisateur après la transformation de svg2pdf), écriture courte */
const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

function hookLines(pdf: jsPDF, lines: PdfLines | undefined): void {
  if (!lines) return;
  const api = pdf as unknown as { moveTo(x: number, y: number): jsPDF; lineTo(x: number, y: number): jsPDF; isAdvancedAPI(): boolean; internal: { write(s: string): void } };
  const moveTo = api.moveTo.bind(pdf);
  const lineTo = api.lineTo.bind(pdf);
  api.moveTo = (x: number, y: number) => {
    const pls = lines.take(x, y);
    if (!pls) return moveTo(x, y);
    // mode avancé (celui de svg2pdf) : coordonnées écrites telles quelles ; sinon par jsPDF
    const raw = api.isAdvancedAPI();
    let buf: string[] = [];
    // une polyligne peut en contenir plusieurs, séparées par un couple NaN (contours / hachures de la peinture)
    for (const pl of pls) {
      if (pl.length < 4) continue;
      lines.written += pl.length;
      let start = true;
      for (let i = 0; i + 1 < pl.length; i += 2) {
        const x = pl[i];
        const y = pl[i + 1];
        if (Number.isNaN(x) || Number.isNaN(y)) {
          start = true;
          continue;
        }
        if (!raw) {
          if (start) moveTo(x, y);
          else lineTo(x, y);
        } else {
          buf.push(`${fmt(x)} ${fmt(y)} ${start ? 'm' : 'l'}`);
          if (buf.length > 4000) {
            api.internal.write(buf.join('\n'));
            buf = [];
          }
        }
        start = false;
      }
    }
    if (buf.length) api.internal.write(buf.join('\n'));
    return pdf;
  };
}

/** Document PDF du jeu de plans (une page par planche). */
export async function buildPdf(pages: PdfPage[], fonts: FontFiles, meta: PdfMeta, onPage?: (done: number, total: number) => void, lines?: PdfLines): Promise<jsPDF> {
  if (!pages.length) throw new Error('Aucune planche à exporter');
  const size = (p: PdfPage): [number, number] => (p.size ? [p.size.w, p.size.h] : [PAPER_MM[p.paper].w, PAPER_MM[p.paper].h]);
  const orientation = (p: PdfPage) => (size(p)[0] >= size(p)[1] ? 'landscape' : 'portrait');
  const pdf = new jsPDF({ unit: 'mm', format: size(pages[0]), orientation: orientation(pages[0]), compress: true, putOnlyUsedFonts: true });
  hookLines(pdf, lines);
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
  opts: { maxSvgChars?: number; lines?: PdfLines } = {},
): Promise<Blob> {
  if (!pages.length) throw new Error('Aucune planche à exporter');
  const limit = opts.maxSvgChars ?? Infinity;
  const size = (p: PdfPage): [number, number] => (p.size ? [p.size.w, p.size.h] : [PAPER_MM[p.paper].w, PAPER_MM[p.paper].h]);
  const orientation = (p: PdfPage) => (size(p)[0] >= size(p)[1] ? 'landscape' : 'portrait');
  const start = (p: PdfPage) => {
    const pdf = new jsPDF({ unit: 'mm', format: size(p), orientation: orientation(p), compress: true, putOnlyUsedFonts: true });
    hookLines(pdf, opts.lines);
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
      if (opts.lines) opts.lines.written = 0;
      await svg2pdf(svg, pdf, { x: 0, y: 0, width: w, height: h });
      host.innerHTML = '';
      // traits écrits directement (hors SVG) : ≈ 8 caractères par nombre dans la page
      if (opts.lines) chars += opts.lines.written * 8;
      // page refaite à chaque fois (fonction) : ses traits écrits ne servent plus (la vue peut quitter la mémoire)
      if (typeof src === 'function') opts.lines?.clear();
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
