// PDF du jeu de plans fait par le serveur VEM (processus séparé) au lieu du navigateur : sur un très gros modèle
// (Xiaomi, 1,6 M de triangles, 42 planches) l'onglet n'avait pas la mémoire de tout convertir. Le navigateur ne fait
// plus que préparer ce que lui seul sait calculer (la peinture visible, les contours des Viewbox, les vues absentes du
// cache partagé) ; le serveur relit les traits des vues dans son cache, dessine chaque planche avec le même SheetSvg et
// écrit le PDF page par page. Ce fichier = format échangé entre les deux (pur, sans DOM ni Node).
import type { ViewBasis } from '../../core/views';
import type { PaintColor } from '../../core/paint/types';
import type { Linework2D } from '../../linework/types';
import type { PaintRegion } from '../../linework/paintOverlay';
import type { ModuleOverlay } from '../overlays';
import type { PaintSheetInfo } from '../paintSheet';
import type { LegendEntry, ViewportData } from '../SheetSvg';
import type { Sheet, TitleBlockData } from '../types';

/** Clé d'une vue : celle du cache partagé (SHA-256) ou d'une vue spéciale (« custom-… »). */
export const PDF_JOB_KEY = /^(custom-)?[0-9a-f]{64}$/;

/** Ce qu'il faut pour dessiner une fenêtre de vue, sans ses traits (désignés par leur clé). */
export interface PdfJobViewport {
  /** traits : clé du cache partagé ou envoyés avec la tâche (le navigateur n’a pas besoin de les avoir lus) ; absente = vue non calculée (cadre vide) */
  key?: string;
  basis?: ViewBasis;
  stale?: boolean;
  error?: string;
  overlays?: ModuleOverlay[];
  cutLineMm?: number;
  ghostColor?: string;
  paint?: { regions: PaintRegion[]; colors: PaintColor[]; mode?: 'marks' | 'fill' };
}

/** Le jeu (ou les planches choisies) tel que le serveur doit l'écrire. */
export interface PdfJobManifest {
  v: 1;
  title: string;
  subject: string;
  fileName: string;
  sheets: Sheet[];
  titleBlock: TitleBlockData;
  notes: string;
  legend: LegendEntry[];
  paint?: { colors: PaintColor[]; areas: Array<[string, number]>; usedInSet: string[] };
}

/** Réglages du rendu (images 3D plus légères pour tenir dans les 10 Mo des Fichiers du projet). */
export interface PdfJobOptions {
  imagePx: number;
  jpegQuality: number;
}

export interface PdfJobStatus {
  id: string;
  status: 'waiting' | 'queued' | 'running' | 'done' | 'error';
  page?: number;
  pages?: number;
  detail?: string;
  message?: string;
  size?: number;
  failedImages?: number;
  missingViews?: number;
  /** place dans la file (autres PDF en cours) */
  position?: number;
}

export function snapshotView(d: ViewportData | undefined, key: string | undefined): PdfJobViewport {
  if (!d) return {};
  const out: PdfJobViewport = {};
  if (key) out.key = key;
  if (d.basis) out.basis = d.basis;
  if (d.stale) out.stale = true;
  if (d.error) out.error = d.error;
  if (d.overlays?.length) out.overlays = d.overlays;
  if (d.cutLineMm != null) out.cutLineMm = d.cutLineMm;
  if (d.ghostColor) out.ghostColor = d.ghostColor;
  if (d.paint?.regions.length) {
    const used = new Set(d.paint.regions.map((r) => r.colorId));
    out.paint = { regions: d.paint.regions, colors: [...d.paint.colors.values()].filter((c) => used.has(c.id)), mode: d.paint.mode };
  }
  return out;
}

export function restoreView(v: PdfJobViewport | undefined, lw: Linework2D | undefined): ViewportData {
  if (!v) return { error: 'Vue non transmise' };
  return {
    lw,
    basis: v.basis,
    stale: v.stale,
    error: v.error ?? (v.key && !lw ? 'Vue introuvable sur le serveur' : undefined),
    overlays: v.overlays,
    cutLineMm: v.cutLineMm,
    ghostColor: v.ghostColor,
    ...(v.paint ? { paint: { regions: v.paint.regions, colors: new Map(v.paint.colors.map((c) => [c.id, c])), mode: v.paint.mode } } : {}),
  };
}

export function packPaintInfo(p: PaintSheetInfo | undefined): PdfJobManifest['paint'] {
  if (!p) return undefined;
  return { colors: p.colors, areas: [...p.areas], usedInSet: [...p.usedInSet] };
}

export function unpackPaintInfo(p: PdfJobManifest['paint']): PaintSheetInfo | undefined {
  if (!p) return undefined;
  return { colors: p.colors, areas: new Map(p.areas), usedInSet: new Set(p.usedInSet) };
}

/** Image 3D Cloudinary réduite à `px` de côté (et convertie en JPEG si `jpg`) ; autre adresse : inchangée. */
export function cloudinarySized(url: string, px: number, jpg?: { quality: number }): string {
  const m = url.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.*)$/);
  if (!m || /^(?:[a-z]{1,3}_[^/,]+,?)+\//.test(m[2])) return url;
  const t = [`w_${Math.round(px)}`, `h_${Math.round(px)}`, 'c_limit'];
  if (jpg) t.push('f_jpg', `q_${Math.round(jpg.quality * 100)}`);
  return `${m[1]}${t.join(',')}/${m[2]}`;
}

/** Dimensions d'une image PNG / JPEG (en-tête seulement), null si illisible. */
export function imageSize(b: Uint8Array): { w: number; h: number; type: 'png' | 'jpeg' } | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20), type: 'png' };
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = (b[i + 2] << 8) | b[i + 3];
      // SOF0…SOF15 sauf DHT (C4), JPG (C8), DAC (CC)
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], type: 'jpeg' };
      i += 2 + len;
    }
  }
  return null;
}
