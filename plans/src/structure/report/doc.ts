// Mise en page du rapport de l'étude structure (A4 portrait, style des notes de calcul statico) : le contenu est une
// suite de blocs (titres numérotés, paragraphes, listes, tableaux, enregistrements de calcul, figures…) découpés en
// morceaux de hauteur connue (lignes mesurées avec les métriques d'Arimo) puis répartis sur les pages : un titre ne
// reste jamais seul en bas de page, un tableau coupé répète son en-tête, un enregistrement de calcul reste d'un bloc.
// Chaque page est un SVG en mm (viewBox 210 × 297) : en-tête projet + logo, pied avec numéro « A 12 » (annexe
// « B 3 »), filigrane « pré-étude ». Fonctions pures.
import type { CalcRecord, Verdict } from '../core/records';
import { verdictOf } from '../core/records';
import { fmtNumber } from '../core/units';
import { LOGO_COLOR, VIEWBOX_WORDMARK } from '../../sheets/logos';
import { ellipsis, textWidth, wrapText } from './metrics';

export const A4 = { w: 210, h: 297 };
/** marges et zones (mm) */
export const PAGE = { left: 20, right: 15, top: 32, bottom: 282, indent: 13 };
export const FONT = "Arimo, Arial, Helvetica, sans-serif";
export const INK = '#111827';
export const GREY = '#6b7280';
export const LIGHT = '#9ca3af';
export const RULE = '#d1d5db';
export const BRAND = LOGO_COLOR;
export const VERDICT_COLORS: Record<Verdict, string> = { ok: '#15803d', limit: '#b45309', fail: '#b91c1c', incomplete: '#6d28d9' };

/** tailles de texte (mm, hauteur de corps) */
export const SIZE = { h1: 4.6, h2: 3.9, h3: 3.4, body: 3.1, small: 2.7, table: 2.65, header: 2.5 };
const LH = 1.38;

// ─── SVG ───

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const r2 = (v: number) => String(Math.round(v * 100) / 100);

export interface TextOpts {
  size: number;
  bold?: boolean;
  italic?: boolean;
  color?: string;
  anchor?: 'start' | 'middle' | 'end';
}

/** Texte SVG (y = ligne de base). */
export function svgText(x: number, y: number, text: string, o: TextOpts): string {
  const attrs = [
    `x="${r2(x)}"`,
    `y="${r2(y)}"`,
    `font-family="${FONT}"`,
    `font-size="${r2(o.size)}"`,
    o.bold ? 'font-weight="700"' : '',
    o.italic ? 'font-style="italic"' : '',
    `fill="${o.color ?? INK}"`,
    o.anchor && o.anchor !== 'start' ? `text-anchor="${o.anchor}"` : '',
  ].filter(Boolean);
  return `<text ${attrs.join(' ')}>${esc(text)}</text>`;
}

export const svgLine = (x1: number, y1: number, x2: number, y2: number, color = RULE, w = 0.2) =>
  `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${color}" stroke-width="${r2(w)}"/>`;

export const svgRect = (x: number, y: number, w: number, h: number, fill: string, stroke = 'none', sw = 0.2, rx = 0) =>
  `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}"${rx ? ` rx="${r2(rx)}"` : ''}/>`;

/** Pastille de verdict vectorielle (les émojis ✅ ⚠️ ❌ ⛔ ne sont pas dans la police du PDF), centrée en (cx, cy). */
export function verdictIcon(v: Verdict, cx: number, cy: number, d: number): string {
  const c = VERDICT_COLORS[v];
  const r = d / 2;
  const w = r2(d * 0.13);
  if (v === 'ok')
    return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${c}"/><path d="M${r2(cx - r * 0.5)} ${r2(cy + r * 0.02)}L${r2(cx - r * 0.12)} ${r2(cy + r * 0.4)}L${r2(cx + r * 0.52)} ${r2(cy - r * 0.38)}" fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (v === 'limit')
    return `<path d="M${r2(cx)} ${r2(cy - r)}L${r2(cx + r * 1.08)} ${r2(cy + r * 0.85)}L${r2(cx - r * 1.08)} ${r2(cy + r * 0.85)}Z" fill="${c}"/><path d="M${r2(cx)} ${r2(cy - r * 0.38)}L${r2(cx)} ${r2(cy + r * 0.2)}" stroke="#fff" stroke-width="${w}" stroke-linecap="round"/><circle cx="${r2(cx)}" cy="${r2(cy + r * 0.52)}" r="${r2(d * 0.07)}" fill="#fff"/>`;
  if (v === 'fail')
    return `<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${c}"/><path d="M${r2(cx - r * 0.4)} ${r2(cy - r * 0.4)}L${r2(cx + r * 0.4)} ${r2(cy + r * 0.4)}M${r2(cx + r * 0.4)} ${r2(cy - r * 0.4)}L${r2(cx - r * 0.4)} ${r2(cy + r * 0.4)}" stroke="#fff" stroke-width="${w}" stroke-linecap="round"/>`;
  // incomplet : octogone « stop »
  const pts: string[] = [];
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) * Math.PI) / 4;
    pts.push(`${r2(cx + r * Math.cos(a))},${r2(cy + r * Math.sin(a))}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${c}"/><path d="M${r2(cx - r * 0.5)} ${r2(cy)}L${r2(cx + r * 0.5)} ${r2(cy)}" stroke="#fff" stroke-width="${r2(d * 0.17)}" stroke-linecap="round"/>`;
}

// ─── blocs ───

export interface TableCol {
  title: string;
  /** largeur relative (répartie sur la largeur du tableau) */
  w: number;
  align?: 'start' | 'end' | 'middle';
}

export interface TableCell {
  text: string;
  color?: string;
  bold?: boolean;
  /** pastille de verdict avant le texte */
  icon?: Verdict;
}

export type Cell = string | TableCell;

export type Block =
  | { t: 'heading'; level: 1 | 2 | 3; num: string; text: string }
  | { t: 'para'; text: string; size?: number; bold?: boolean; italic?: boolean; color?: string; indent?: number; after?: number }
  | { t: 'bullets'; items: string[]; size?: number; color?: string }
  | { t: 'kv'; rows: Array<[string, string]>; labelWidth?: number; size?: number }
  | { t: 'table'; cols: TableCol[]; rows: Cell[][]; size?: number; note?: string }
  | { t: 'record'; rec: CalcRecord; labels: RecordLabels }
  | { t: 'eta'; eta: number | undefined; label?: string; verdict?: Verdict }
  | { t: 'callout'; verdict?: Verdict; title: string; lines: string[] }
  | { t: 'figure'; h: number; svg: (x: number, y: number, w: number, h: number) => string; caption?: string }
  | { t: 'space'; h: number }
  | { t: 'pagebreak' }
  /** début d'une série de pages (annexe « B ») : nouvelle page, numérotation reprise à 1 */
  | { t: 'series'; prefix: string; title?: string };

export interface RecordLabels {
  combination: string;
  elements: string;
}

interface Piece {
  h: number;
  draw: (x: number, y: number, w: number) => string;
  /** titre : ne pas le laisser en bas de page sans le morceau suivant */
  keepWithNext?: boolean;
  /** morceau répété en haut de page quand le bloc continue (en-tête de tableau) */
  repeat?: Piece;
  heading?: { level: 1 | 2 | 3; num: string; text: string };
}

const lineH = (size: number) => size * LH;

function paraPieces(text: string, width: number, o: { size: number; bold?: boolean; italic?: boolean; color?: string; indent?: number }, after = 1.2): Piece[] {
  const ind = o.indent ?? 0;
  const lines = wrapText(text, width - ind, o.size, o.bold);
  return lines.map((l, k) => ({
    h: lineH(o.size) + (k === lines.length - 1 ? after : 0),
    draw: (x, y) => svgText(x + ind, y + o.size, l, { size: o.size, bold: o.bold, italic: o.italic, color: o.color }),
  }));
}

function tablePieces(b: Extract<Block, { t: 'table' }>, width: number): Piece[] {
  const size = b.size ?? SIZE.table;
  const total = b.cols.reduce((a, c) => a + c.w, 0);
  const widths = b.cols.map((c) => (c.w / total) * width);
  const pad = 1.2;
  const cell = (c: Cell): TableCell => (typeof c === 'string' ? { text: c } : c);
  const rowPiece = (cells: TableCell[], header: boolean, zebra: boolean): Piece => {
    const lines = cells.map((c, i) => wrapText(c.text, widths[i] - 2 * pad - (c.icon ? size * 1.2 : 0), size, header || c.bold));
    const n = Math.max(1, ...lines.map((l) => l.length));
    const h = n * lineH(size) + 1.2;
    return {
      h,
      draw: (x, y) => {
        const parts: string[] = [];
        if (header) parts.push(svgRect(x, y, width, h, '#f3f4f6'));
        else if (zebra) parts.push(svgRect(x, y, width, h, '#fafafa'));
        let cx = x;
        cells.forEach((c, i) => {
          const col = b.cols[i];
          const a = col.align ?? 'start';
          const iconW = c.icon ? size * 1.2 : 0;
          lines[i].forEach((l, k) => {
            const ty = y + 0.6 + size + k * lineH(size) - (lineH(size) - size) / 2 + 0.25;
            const tx = a === 'end' ? cx + widths[i] - pad : a === 'middle' ? cx + widths[i] / 2 : cx + pad + iconW;
            parts.push(svgText(tx, ty, l, { size, bold: header || c.bold, color: header ? '#374151' : c.color, anchor: a }));
          });
          if (c.icon) {
            const iw = textWidth(lines[i][0] ?? '', size, c.bold);
            const ix = a === 'end' ? cx + widths[i] - pad - iw - size * 0.65 : a === 'middle' ? cx + widths[i] / 2 - iw / 2 - size * 0.65 : cx + pad + size * 0.45;
            parts.push(verdictIcon(c.icon, ix, y + 0.6 + size * 0.62, size * 0.9));
          }
          cx += widths[i];
        });
        parts.push(svgLine(x, y + h, x + width, y + h, header ? '#9ca3af' : '#e5e7eb', header ? 0.25 : 0.15));
        return parts.join('');
      },
    };
  };
  const head = rowPiece(
    b.cols.map((c) => ({ text: c.title })),
    true,
    false,
  );
  const rows = b.rows.map((r, k) => rowPiece(r.map(cell), false, k % 2 === 1));
  const out: Piece[] = [{ ...head, keepWithNext: true }];
  rows.forEach((p) => out.push({ ...p, repeat: head }));
  if (b.note) out.push(...paraPieces(b.note, width, { size: SIZE.small, color: GREY }, 1.5));
  else out.push({ h: 2, draw: () => '' });
  return out;
}

function recordPiece(rec: CalcRecord, labels: RecordLabels, width: number, fmt: NumFmt): Piece {
  const s = SIZE.small;
  const title = wrapText(rec.title, width, SIZE.body * 0.95, true);
  const clause = wrapText(rec.clause, width, s);
  const formula = wrapText(rec.formula, width - 3, s);
  const values = wrapText(rec.withValues, width - 3, s + 0.1);
  const extra: string[] = [];
  if (rec.combination) extra.push(`${labels.combination} : ${rec.combination}`);
  const extraLines = extra.length ? wrapText(extra.join(' · '), width - 3, s) : [];
  const etaLine = rec.eta !== undefined && Number.isFinite(rec.eta);
  const h = title.length * lineH(SIZE.body * 0.95) + clause.length * lineH(s) + formula.length * lineH(s) + values.length * lineH(s + 0.1) + extraLines.length * lineH(s) + (etaLine ? lineH(SIZE.body) : 0) + 3.2;
  return {
    h,
    draw: (x, y) => {
      const p: string[] = [];
      let yy = y + 0.6;
      p.push(`<rect x="${r2(x)}" y="${r2(y + 0.3)}" width="0.6" height="${r2(h - 2.4)}" fill="${BRAND}" fill-opacity="0.35"/>`);
      const bx = x + 2.2;
      for (const l of title) {
        p.push(svgText(bx, yy + SIZE.body * 0.95, l, { size: SIZE.body * 0.95, bold: true }));
        yy += lineH(SIZE.body * 0.95);
      }
      for (const l of clause) {
        p.push(svgText(bx, yy + s, l, { size: s, color: GREY, italic: true }));
        yy += lineH(s);
      }
      for (const l of formula) {
        p.push(svgText(bx + 1, yy + s, l, { size: s, color: '#374151' }));
        yy += lineH(s);
      }
      for (const l of values) {
        p.push(svgText(bx + 1, yy + s + 0.1, l, { size: s + 0.1 }));
        yy += lineH(s + 0.1);
      }
      for (const l of extraLines) {
        p.push(svgText(bx + 1, yy + s, l, { size: s, color: GREY }));
        yy += lineH(s);
      }
      if (etaLine) {
        const v = verdictOf(rec.eta);
        const t = `η = ${fmt(rec.eta!, 2)} ${rec.eta! <= 1 ? '≤' : '>'} ${fmt(1, 2)}`;
        p.push(svgText(x + width - SIZE.body * 1.4, yy + SIZE.body, t, { size: SIZE.body, bold: true, color: VERDICT_COLORS[v], anchor: 'end' }));
        p.push(verdictIcon(v, x + width - SIZE.body * 0.55, yy + SIZE.body * 0.64, SIZE.body * 0.95));
      }
      return p.join('');
    },
  };
}

function piecesOf(b: Block, width: number, fmt: NumFmt): Piece[] {
  switch (b.t) {
    case 'heading': {
      const size = b.level === 1 ? SIZE.h1 : b.level === 2 ? SIZE.h2 : SIZE.h3;
      const before = b.level === 1 ? 4 : b.level === 2 ? 3 : 2;
      const lines = wrapText(b.text, width, size, true);
      return [
        {
          h: before + lines.length * lineH(size) + 1.5,
          keepWithNext: true,
          heading: { level: b.level, num: b.num, text: b.text },
          draw: (x, y) =>
            [
              svgText(x - PAGE.indent, y + before + size, b.num, { size, bold: true, color: BRAND }),
              ...lines.map((l, k) => svgText(x, y + before + size + k * lineH(size), l, { size, bold: true, color: BRAND })),
            ].join(''),
        },
      ];
    }
    case 'para':
      return paraPieces(b.text, width, { size: b.size ?? SIZE.body, bold: b.bold, italic: b.italic, color: b.color, indent: b.indent }, b.after ?? 1.6);
    case 'bullets': {
      const size = b.size ?? SIZE.body;
      const out: Piece[] = [];
      for (const item of b.items) {
        const lines = wrapText(item, width - 4, size);
        lines.forEach((l, k) =>
          out.push({
            h: lineH(size) + (k === lines.length - 1 ? 1 : 0),
            draw: (x, y) => (k === 0 ? svgText(x + 0.6, y + size, '•', { size, color: b.color ?? INK }) : '') + svgText(x + 4, y + size, l, { size, color: b.color }),
          }),
        );
      }
      out.push({ h: 1, draw: () => '' });
      return out;
    }
    case 'kv': {
      const size = b.size ?? SIZE.body;
      const lw = b.labelWidth ?? 52;
      const out: Piece[] = [];
      for (const [k, v] of b.rows) {
        const lines = wrapText(v, width - lw, size);
        const klines = wrapText(k, lw - 2, size);
        const n = Math.max(lines.length, klines.length);
        out.push({
          h: n * lineH(size) + 0.4,
          draw: (x, y) =>
            [
              ...klines.map((l, i) => svgText(x, y + size + i * lineH(size), l, { size, color: GREY })),
              ...lines.map((l, i) => svgText(x + lw, y + size + i * lineH(size), l, { size })),
            ].join(''),
        });
      }
      out.push({ h: 1.5, draw: () => '' });
      return out;
    }
    case 'table':
      return tablePieces(b, width);
    case 'record':
      return [recordPiece(b.rec, b.labels, width, fmt)];
    case 'eta': {
      const v = b.verdict ?? verdictOf(b.eta);
      const ok = b.eta !== undefined && Number.isFinite(b.eta);
      const text = ok ? `${b.label ? `${b.label} : ` : ''}η = ${fmt(b.eta!, 2)} ${b.eta! <= 1 ? '≤' : '>'} ${fmt(1, 2)}` : `${b.label ?? ''}`;
      return [
        {
          h: lineH(SIZE.h2) + 2.5,
          draw: (x, y, w) => {
            const tw = textWidth(text, SIZE.h2, true);
            const cx = x + w / 2;
            return svgText(cx + SIZE.h2 * 0.7, y + 1 + SIZE.h2, text, { size: SIZE.h2, bold: true, color: VERDICT_COLORS[v], anchor: 'middle' }) + verdictIcon(v, cx - tw / 2 - SIZE.h2 * 0.3, y + 1 + SIZE.h2 * 0.64, SIZE.h2);
          },
        },
      ];
    }
    case 'callout': {
      const s = SIZE.body;
      const lines = b.lines.flatMap((l) => wrapText(l, width - 14, SIZE.small));
      const tl = wrapText(b.title, width - 14, s + 0.4, true);
      const h = tl.length * lineH(s + 0.4) + lines.length * lineH(SIZE.small) + 5;
      const c = b.verdict ? VERDICT_COLORS[b.verdict] : BRAND;
      return [
        {
          h: h + 2,
          draw: (x, y, w) => {
            const p = [svgRect(x, y, w, h, '#ffffff', c, 0.35, 1.2), `<rect x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" rx="1.2" fill="${c}" fill-opacity="0.06"/>`];
            if (b.verdict) p.push(verdictIcon(b.verdict, x + 6, y + 2.2 + (s + 0.4) * 0.62, 5.2));
            let yy = y + 2.2;
            for (const l of tl) {
              p.push(svgText(x + 11.5, yy + s + 0.4, l, { size: s + 0.4, bold: true, color: c }));
              yy += lineH(s + 0.4);
            }
            for (const l of lines) {
              p.push(svgText(x + 11.5, yy + SIZE.small, l, { size: SIZE.small }));
              yy += lineH(SIZE.small);
            }
            return p.join('');
          },
        },
      ];
    }
    case 'figure': {
      const cap = b.caption ? wrapText(b.caption, width, SIZE.small) : [];
      return [
        {
          h: b.h + cap.length * lineH(SIZE.small) + 3,
          draw: (x, y, w) => b.svg(x, y + 1, w, b.h) + cap.map((l, k) => svgText(x + w / 2, y + b.h + 2 + SIZE.small + k * lineH(SIZE.small), l, { size: SIZE.small, color: GREY, anchor: 'middle' })).join(''),
        },
      ];
    }
    case 'space':
      return [{ h: b.h, draw: () => '' }];
    default:
      return [];
  }
}

// ─── pagination ───

export interface LaidPage {
  /** « A » (corps), « B » (annexe) */
  prefix: string;
  number: number;
  body: string[];
  headings: Array<{ level: 1 | 2 | 3; num: string; text: string }>;
}

/** Répartit les blocs sur des pages A4 (zone utile PAGE). */
/** Format des nombres imprimés par la mise en page (η) : virgule par défaut, point pour un rapport anglais. */
export type NumFmt = (v: number, d: number) => string;

export function paginate(blocks: Block[], fmt: NumFmt = fmtNumber): LaidPage[] {
  const x = PAGE.left + PAGE.indent;
  const width = A4.w - PAGE.right - x;
  type Item = { p: Piece } | { brk: true } | { series: string };
  const items: Item[] = [];
  for (const b of blocks) {
    if (b.t === 'pagebreak') items.push({ brk: true });
    else if (b.t === 'series') items.push({ series: b.prefix });
    else for (const p of piecesOf(b, width, fmt)) items.push({ p });
  }
  const pages: LaidPage[] = [];
  let prefix = 'A';
  let page: LaidPage | null = null;
  let y = 0;
  const newPage = () => {
    const number = pages.filter((q) => q.prefix === prefix).length + 1;
    page = { prefix, number, body: [], headings: [] };
    pages.push(page);
    y = PAGE.top;
  };
  const place = (p: Piece) => {
    page!.body.push(p.draw(x, y, width));
    if (p.heading) page!.headings.push(p.heading);
    y += p.h;
  };
  /** hauteur à garder ensemble : les morceaux « à garder avec le suivant » (titres, en-tête de tableau) + le suivant */
  const chain = (k: number): number => {
    let h = 0;
    for (let j = k; j < items.length; j++) {
      const it = items[j];
      if (!('p' in it)) break;
      h += it.p.h;
      if (!it.p.keepWithNext) break;
    }
    return Math.min(h, PAGE.bottom - PAGE.top);
  };
  newPage();
  items.forEach((it, k) => {
    if ('brk' in it) {
      if (y > PAGE.top) newPage();
      return;
    }
    if ('series' in it) {
      prefix = it.series;
      if (page!.body.length) newPage();
      else {
        page!.prefix = prefix;
        page!.number = pages.filter((q) => q.prefix === prefix).length;
      }
      return;
    }
    const p = it.p;
    const need = p.keepWithNext ? chain(k) : p.h;
    if (y + need > PAGE.bottom && y > PAGE.top) {
      newPage();
      if (p.repeat) place(p.repeat);
    }
    place(p);
  });
  // dernière page restée vide (saut de page final)
  while (pages.length > 1 && !pages[pages.length - 1].body.length) pages.pop();
  return pages;
}

// ─── gabarit de page ───

export interface PageTemplate {
  /** lignes d'en-tête (libellé, valeur) : n° de projet, client, projet */
  header: Array<[string, string]>;
  /** pied de page, à gauche */
  footer: string;
  /** filigrane (diagonale) */
  watermark: string;
}

/** Filigrane diagonal léger (pages et couverture). */
export function watermarkSvg(text: string, w = A4.w, h = A4.h): string {
  const size = Math.min(9, (Math.hypot(w, h) * 0.8) / Math.max(1, textWidth(text, 1, true)));
  const angle = (-Math.atan2(h, w) * 180) / Math.PI;
  return `<text x="${r2(w / 2)}" y="${r2(h / 2)}" font-family="${FONT}" font-size="${r2(size)}" font-weight="700" fill="#9ca3af" fill-opacity="0.16" text-anchor="middle" transform="rotate(${r2(angle)} ${r2(w / 2)} ${r2(h / 2)})">${esc(text)}</text>`;
}

export function wordmark(x: number, y: number, w: number): string {
  return `<g transform="translate(${r2(x)} ${r2(y)}) scale(${(w / VIEWBOX_WORDMARK.width).toFixed(5)})"><path d="${VIEWBOX_WORDMARK.d}" transform="${VIEWBOX_WORDMARK.transform}" fill="${BRAND}"/></g>`;
}

/** Page complète : fond, filigrane, en-tête, contenu, pied. */
export function renderPage(p: LaidPage, t: PageTemplate): string {
  const parts: string[] = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${A4.w}mm" height="${A4.h}mm" viewBox="0 0 ${A4.w} ${A4.h}">`);
  parts.push(svgRect(0, 0, A4.w, A4.h, '#ffffff'));
  parts.push(watermarkSvg(t.watermark));
  const lw = Math.max(...t.header.map(([k]) => textWidth(`${k} :`, SIZE.header)));
  t.header.forEach(([k, v], i) => {
    const yy = 12 + i * SIZE.header * 1.45;
    parts.push(svgText(PAGE.left, yy, `${k} :`, { size: SIZE.header, color: GREY }));
    parts.push(svgText(PAGE.left + lw + 2.5, yy, ellipsis(v, 120 - lw, SIZE.header), { size: SIZE.header }));
  });
  parts.push(wordmark(A4.w - PAGE.right - 33, 6.2, 33));
  parts.push(svgLine(PAGE.left, 22.5, A4.w - PAGE.right, 22.5, BRAND, 0.3));
  parts.push(...p.body);
  parts.push(svgLine(PAGE.left, 286, A4.w - PAGE.right, 286, RULE, 0.2));
  parts.push(svgText(PAGE.left, 290.5, t.footer, { size: SIZE.header, color: GREY }));
  parts.push(svgText(A4.w - PAGE.right, 290.8, `${p.prefix} ${p.number}`, { size: 3.2, bold: true, color: INK, anchor: 'end' }));
  parts.push('</svg>');
  return parts.join('');
}

/** Numéros de page des titres (sommaire). */
export function tocEntries(pages: LaidPage[]): Array<{ level: 1 | 2 | 3; num: string; text: string; page: string }> {
  return pages.flatMap((p) => p.headings.map((h) => ({ ...h, page: `${p.prefix} ${p.number}` })));
}
