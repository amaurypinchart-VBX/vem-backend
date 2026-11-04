// Rendu du PDF d'un jeu de plans sur le serveur VEM, dans un processus séparé (lancé par
// src/services/plansPdfJobs.ts du backend, mémoire plafonnée) : si le jeu est trop lourd, seul ce processus s'arrête,
// jamais VEM ni l'onglet de l'utilisateur. Même dessin que dans le navigateur (SheetSvg → svg2pdf + jsPDF, traits des
// vues écrits directement, voir sheets/pdf/pdf.ts), une planche à la fois.
//
// Dossier de la tâche : manifest.json (PdfJobManifest), options.json (PdfJobOptions), views/<fenêtre>.bin (ce que le
// navigateur a préparé pour chaque fenêtre de vue), lw/<clé>.bin (traits : cache partagé du serveur ou envoyés) →
// out.pdf. Avancement envoyé au processus parent (process.send).
import './domSetup';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { jsPDF } from 'jspdf';
import { SheetSvg } from '../sheets/SheetSvg';
import type { ViewportData } from '../sheets/SheetSvg';
import type { Sheet, ViewportItem } from '../sheets/types';
import { FONT_FILE, PdfLines, buildPdfBlob, fontsUsed } from '../sheets/pdf/pdf';
import type { FontFamily, FontFiles, FontKey, FontVariant, PdfPage } from '../sheets/pdf/pdf';
import type { PdfJobManifest, PdfJobOptions, PdfJobViewport } from '../sheets/pdf/serverJob';
import { cloudinarySized, imageSize, restoreView, unpackPaintInfo } from '../sheets/pdf/serverJob';
import { decodeLinework, decodePacked } from '../linework/remoteCache';
import type { Linework2D } from '../linework/types';
import { pngHasTransparency } from './pngAlpha';

export type RenderMessage =
  | { type: 'progress'; page: number; pages: number; detail?: string }
  | { type: 'done'; size: number; failedImages: number; missingViews: number }
  | { type: 'error'; message: string };

export interface RenderEnv {
  fontDir: string;
  send: (m: RenderMessage) => void;
  fetchImage?: (url: string) => Promise<Uint8Array>;
  /** taille d'un morceau du PDF avant réunion (caractères de dessin) */
  maxSvgChars?: number;
}

const ALL_FONTS: FontKey[] = (['Gelasio', 'Arimo'] as FontFamily[]).flatMap((f) => (['normal', 'bold', 'italic', 'bolditalic'] as FontVariant[]).map((v) => `${f}-${v}` as FontKey));

function readFonts(dir: string, keys: FontKey[]): FontFiles {
  const out: FontFiles = {};
  for (const k of keys) {
    const [family, variant] = k.split('-') as [FontFamily, FontVariant];
    const b = readFileSync(join(dir, `${family}-${FONT_FILE[variant]}.ttf`));
    out[k] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  return out;
}

/**
 * Pas de moteur de mise en page : svg2pdf mesure les textes centrés / alignés à droite avec getBBox. Mesure faite avec
 * les vraies chasses des polices (jsPDF), comme le navigateur avec ses polices.
 */
function installMeasure(fonts: FontFiles): void {
  const m = new jsPDF({ unit: 'pt', compress: false });
  for (const [key, buf] of Object.entries(fonts) as Array<[FontKey, ArrayBuffer]>) {
    const [family, variant] = key.split('-') as [FontFamily, FontVariant];
    const file = `${family}-${FONT_FILE[variant]}.ttf`;
    m.addFileToVFS(file, Buffer.from(buf).toString('base64'));
    m.addFont(file, family, variant);
  }
  const g = globalThis as unknown as { SVGElement: { prototype: Record<string, unknown> }; HTMLCanvasElement?: { prototype: Record<string, unknown> } };
  g.SVGElement.prototype.getBBox = function (this: Element) {
    const size = parseFloat(this.getAttribute('font-size') ?? '16') || 16;
    const fam = /arimo|arial|helvetica|sans/i.test(this.getAttribute('font-family') ?? '') ? 'Arimo' : 'Gelasio';
    const bold = /^(bold|bolder|[6-9]00)$/.test(this.getAttribute('font-weight') ?? '');
    const italic = /italic|oblique/.test(this.getAttribute('font-style') ?? '');
    const variant: FontVariant = bold ? (italic ? 'bolditalic' : 'bold') : italic ? 'italic' : 'normal';
    const text = this.textContent ?? '';
    let width = text.length * size * 0.5;
    try {
      if (fonts[`${fam}-${variant}`]) {
        m.setFont(fam, variant);
        width = m.getStringUnitWidth(text) * size;
      }
    } catch {
      /* approximation gardée */
    }
    return { x: 0, y: 0, width, height: size };
  };
  // pas de canevas : svg2pdf mesure alors par getBBox
  if (g.HTMLCanvasElement) g.HTMLCanvasElement.prototype.getContext = () => null;
}

/** svg2pdf lit la taille des images avec `new Image()` : lue ici dans l'en-tête PNG / JPEG de la data URL. */
function installImage(): void {
  class NodeImage {
    width = 0;
    height = 0;
    onload: (() => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    set src(v: string) {
      const m = /^data:image\/[a-z+]+;base64,/i.exec(v);
      let size: ReturnType<typeof imageSize> = null;
      if (m) {
        // l'en-tête suffit (dimensions avant 256 Ko, même avec des données EXIF)
        const head = v.slice(m[0].length, m[0].length + 349524);
        size = imageSize(new Uint8Array(Buffer.from(head, 'base64')));
      }
      setTimeout(() => {
        if (size) {
          this.width = size.w;
          this.height = size.h;
          this.onload?.();
        } else this.onerror?.(new Error('Image illisible'));
      }, 0);
    }
  }
  (globalThis as unknown as { Image: unknown }).Image = NodeImage;
}

async function defaultFetch(url: string): Promise<Uint8Array> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Image 3D inaccessible (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Image 3D → data URL : PNG si elle a de la transparence, sinon JPEG ; au plus `imagePx` de côté (Cloudinary). */
export async function imageDataUrl(url: string, o: PdfJobOptions, get: (u: string) => Promise<Uint8Array>): Promise<string> {
  const first = await get(cloudinarySized(url, o.imagePx));
  const t = imageSize(first);
  if (!t) throw new Error('Format d’image non pris en charge');
  const dataUrl = (b: Uint8Array, type: string) => `data:image/${type};base64,${Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString('base64')}`;
  if (t.type === 'png' && pngHasTransparency(first)) return dataUrl(first, 'png');
  const jpgUrl = cloudinarySized(url, o.imagePx, { quality: o.jpegQuality });
  if (jpgUrl === url) return dataUrl(first, t.type);
  const jpg = await get(jpgUrl).catch(() => null);
  return jpg && imageSize(jpg)?.type === 'jpeg' ? dataUrl(jpg, 'jpeg') : dataUrl(first, t.type);
}

export async function renderJob(dir: string, env: RenderEnv): Promise<{ size: number; failedImages: number; missingViews: number }> {
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as PdfJobManifest;
  const options: PdfJobOptions = existsSync(join(dir, 'options.json')) ? JSON.parse(readFileSync(join(dir, 'options.json'), 'utf8')) : { imagePx: 2000, jpegQuality: 0.88 };
  const get = env.fetchImage ?? defaultFetch;
  const sheets = manifest.sheets;
  if (!sheets.length) throw new Error('Aucune planche à exporter');
  const fonts = readFonts(env.fontDir, ALL_FONTS);
  installMeasure(fonts);
  installImage();
  const paint = unpackPaintInfo(manifest.paint);
  const lines = new PdfLines();
  const vpsOf = (s: Sheet) => s.items.filter((i): i is ViewportItem => i.type === 'viewport');
  const imagesOf = (s: Sheet) => s.items.flatMap((i) => (i.type === 'image3d' && i.url ? [i.url] : []));
  const lastUse = new Map<string, number>();
  sheets.forEach((s, i) => imagesOf(s).forEach((u) => lastUse.set(u, i)));
  const images = new Map<string, string>();
  const failed = new Set<string>();
  let missingViews = 0;

  const svgOf = (s: Sheet, viewData: (vp: ViewportItem) => ViewportData | undefined, withImages: boolean) =>
    renderToStaticMarkup(
      <SheetSvg
        sheet={{ ...s, items: s.items.map((i) => (i.type === 'image3d' && i.url ? { ...i, url: withImages ? (images.get(i.url) ?? '') : '' } : i)) }}
        titleBlock={manifest.titleBlock}
        notes={manifest.notes}
        legend={manifest.legend}
        viewData={viewData}
        paint={paint}
        pdfLines={withImages ? lines : undefined}
      />,
    );
  // polices des textes (planches sans vues ni images) + variantes de base
  const used = new Set<FontKey>(['Arimo-bold', 'Arimo-normal', 'Gelasio-bold', 'Gelasio-normal']);
  for (const s of sheets) for (const k of fontsUsed([svgOf(s, () => undefined, false)])) used.add(k);
  const pdfFonts: FontFiles = {};
  for (const k of used) pdfFonts[k] = fonts[k];

  const page = (s: Sheet, index: number) => async () => {
    for (const [u, last] of lastUse) if (last < index) images.delete(u);
    env.send({ type: 'progress', page: index, pages: sheets.length, detail: `planche ${s.number}` });
    const views = new Map<string, ViewportData>();
    const lws = new Map<string, Linework2D | undefined>();
    for (const vp of vpsOf(s)) {
      const file = join(dir, 'views', `${vp.id}.bin`);
      const v = existsSync(file) ? decodePacked<PdfJobViewport>(new Uint8Array(readFileSync(file))) : undefined;
      let lw: Linework2D | undefined;
      if (v?.key) {
        if (!lws.has(v.key)) {
          const f = join(dir, 'lw', `${v.key}.bin`);
          lws.set(v.key, existsSync(f) ? decodeLinework(new Uint8Array(readFileSync(f))) : undefined);
        }
        lw = lws.get(v.key);
      }
      if (!lw) missingViews++;
      views.set(vp.id, restoreView(v, lw));
    }
    for (const u of imagesOf(s)) {
      if (images.has(u) || failed.has(u)) continue;
      try {
        images.set(u, await imageDataUrl(u, options, get));
      } catch {
        failed.add(u);
      }
    }
    const svg = svgOf(s, (vp) => views.get(vp.id), true);
    // laisse le ramasse-miettes reprendre les vues de la page précédente (lancé avec --expose-gc)
    (globalThis as unknown as { gc?: () => void }).gc?.();
    return svg;
  };
  const pages: PdfPage[] = sheets.map((s, i) => ({ paper: s.paper, svg: page(s, i) }));
  const one = sheets.length === 1;
  const blob = await buildPdfBlob(
    pages,
    pdfFonts,
    { title: manifest.title, subject: manifest.subject || (one ? `${sheets[0].number} ${sheets[0].title}` : `${sheets.length} planche(s)`) },
    (d, n) => env.send({ type: 'progress', page: d, pages: n }),
    { maxSvgChars: env.maxSvgChars ?? 60_000_000, lines },
  );
  lines.clear();
  images.clear();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  writeFileSync(join(dir, 'out.pdf'), bytes);
  return { size: bytes.length, failedImages: failed.size, missingViews };
}

// lancé comme processus : node pdf-render.mjs <dossier de la tâche>
const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  const dir = process.argv[2];
  const send = (m: RenderMessage) => {
    if (process.send) process.send(m);
    else console.log(JSON.stringify(m));
  };
  renderJob(dir, { fontDir: join(dirname(self), 'fonts'), send })
    .then((r) => {
      send({ type: 'done', ...r });
      // laisse partir le dernier message avant de quitter
      setTimeout(() => process.exit(0), 50);
    })
    .catch((e: unknown) => {
      send({ type: 'error', message: (e as Error)?.message || String(e) });
      setTimeout(() => process.exit(1), 50);
    });
}
