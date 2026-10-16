// src/services/dailyAttachments.ts
// Pièces jointes des daily reports, intégrées LISIBLES dans le PDF du rapport :
//   - check-list du projet (préparation / montage / démontage) : état figé quand elle est jointe, dessinée dans le rapport ;
//   - PDF : ses pages sont ajoutées à la fin du rapport (annexe n, bandeau « Daily report du … - Annexe n : nom - page p/pp ») ;
//   - image : une page d'annexe ;
//   - Word / Excel / PowerPoint, PDF protégé, fichier illisible : listé avec son lien (pas de rendu possible côté serveur).
import { PDFDocument, StandardFonts, rgb, degrees, PDFPage, PDFFont } from 'pdf-lib';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { uploadToCloudinary } from './cloudinaryService';
import { loadProjectChecklist, checklistPdfData } from './checklistService';
import { generateDailyReportPdf, DailyAttachmentPdf, HandoverChecklistPdf } from './pdfService';

const db = prisma as any; // modèle ajouté au schéma ; client typé régénéré au build Docker

type Lang = 'fr' | 'en';

/** Cloudinary refuse les fichiers de plus de 10 Mo. */
export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Pages reprises au maximum par PDF joint. */
const ANNEX_MAX_PAGES = 100;
/** Au-delà (somme des fichiers intégrés), l'e-mail garde les fichiers en lien : les relais refusent ~25 Mo. */
const EMAIL_ANNEX_MAX_BYTES = 18 * 1024 * 1024;

export type FileClass = 'pdf' | 'image' | 'office' | 'other';

export function classifyFile(mime: string | null | undefined, name: string | null | undefined): FileClass {
  const m = (mime || '').toLowerCase();
  const ext = (name || '').split('.').pop()?.toLowerCase() || '';
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/') && m !== 'image/svg+xml') return 'image';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'bmp'].includes(ext)) return 'image';
  if (/msword|officedocument|ms-excel|ms-powerpoint/.test(m) || ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office';
  return 'other';
}

/** Lit un PDF envoyé : nombre de pages, et s'il pourra être intégré (pas protégé, lisible). */
export async function inspectPdf(buffer: Buffer): Promise<{ pageCount: number | null; embeddable: boolean; why: string | null }> {
  try {
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
    if (pdf.isEncrypted) return { pageCount: pdf.getPageCount(), embeddable: false, why: 'protected' };
    return { pageCount: pdf.getPageCount(), embeddable: true, why: null };
  } catch {
    return { pageCount: null, embeddable: false, why: 'unreadable' };
  }
}

/** Range un fichier joint sur Cloudinary : images en « image », le reste en « raw » (PDF livrés tels quels). */
export async function storeAttachmentFile(buffer: Buffer, fileName: string, cls: FileClass, projectId: string) {
  const folder = `daily-reports/${projectId}/attachments`;
  if (cls === 'image') {
    const { url, publicId } = await uploadToCloudinary(buffer, folder, { resource_type: 'image' });
    return { url, publicId, resourceType: 'image' };
  }
  const ext = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const base = fileName.replace(/\.[^.]*$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'document';
  const { url, publicId } = await uploadToCloudinary(buffer, folder, { resource_type: 'raw', public_id: `${base}-${Date.now()}.${ext}` });
  return { url, publicId, resourceType: 'raw' };
}

/** Données d'une check-list figées pour un daily report (null si la phase n'est pas configurée). */
export async function checklistSnapshot(projectId: string, phase: string) {
  const cl = await loadProjectChecklist(projectId, phase);
  if (!cl || !cl.items.length) return null;
  const team = await prisma.projectTeam.findMany({
    where: { projectId, OR: [{ role: 'site_manager' }, { user: { role: 'site_manager' } }] },
    include: { user: { select: { firstName: true, lastName: true } } },
  });
  const siteManagerName = team.map((m) => `${m.user.firstName} ${m.user.lastName}`.trim()).join(', ') || null;
  return { checklist: checklistPdfData(cl)!, siteManagerName, stats: cl.stats };
}

// ─── Assemblage du PDF final ───

/** Texte accepté par la police Helvetica de pdf-lib (WinAnsi). */
function ansi(text: string): string {
  return String(text || '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/[  ]/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function shorten(font: PDFFont, text: string, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let out = text;
  while (out.length > 4 && font.widthOfTextAtSize(out + '...', size) > maxW) out = out.slice(0, -1);
  return out + '...';
}

/**
 * Bandeau en haut de la page telle qu'elle s'affiche (rotation de la page prise en compte) :
 * fond blanc semi-opaque + texte gris, pour savoir de quel rapport / annexe vient la page imprimée.
 */
function stampPage(page: PDFPage, font: PDFFont, label: string): void {
  const { width: w, height: h } = page.getSize();
  const box = page.getMediaBox();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const visW = rot === 90 || rot === 270 ? h : w;
  const visH = rot === 90 || rot === 270 ? w : h;
  const size = 7;
  const text = shorten(font, ansi(label), size, visW - 40);
  const textW = font.widthOfTextAtSize(text, size);
  // coin bas-gauche du bandeau, en coordonnées affichées → coordonnées de la page
  const toPage = (vx: number, vy: number) => {
    if (rot === 90) return { x: w - vy, y: vx };
    if (rot === 180) return { x: w - vx, y: h - vy };
    if (rot === 270) return { x: vy, y: h - vx };
    return { x: vx, y: vy };
  };
  const vx = 12;
  const vy = visH - 13;
  const r = toPage(vx - 3, vy - 3);
  page.drawRectangle({
    x: box.x + r.x, y: box.y + r.y, width: textW + 6, height: size + 5,
    color: rgb(1, 1, 1), opacity: 0.85, rotate: degrees(rot),
  });
  const p = toPage(vx, vy);
  page.drawText(text, { x: box.x + p.x, y: box.y + p.y, size, font, color: rgb(0.35, 0.38, 0.45), rotate: degrees(rot) });
}

async function fetchBuffer(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) }) as any;
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}

/** Image Cloudinary convertie en JPEG (HEIC, WebP… → JPEG), 2000 px max. */
function jpegUrl(url: string): string {
  return url.includes('/image/upload/') ? url.replace('/image/upload/', '/image/upload/f_jpg,c_limit,w_2000,h_2000,q_auto:good/') : url;
}

interface LoadedAnnex { annex: number; name: string; kind: 'pdf' | 'image'; pdf?: PDFDocument; pageIdx?: number[]; image?: Buffer }

function fmtDay(d: Date | string, lang: Lang): string {
  return new Date(d).toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * PDF complet d'un daily report : rapport (avec les check-lists jointes) + pages des fichiers joints.
 * forEmail : si les fichiers intégrés dépassent ~18 Mo, ils restent en lien (l'e-mail serait refusé).
 */
export async function buildDailyReportPdf(reportId: string, lang: Lang, opts: { forEmail?: boolean } = {}) {
  const r = await prisma.dailyReport.findUnique({
    where: { id: reportId },
    include: {
      project: {
        include: {
          client: { select: { name: true, contactName: true, email: true, phone: true, address: true } },
          technicalManager: { select: { email: true } },
          team: { include: { user: { select: { email: true } } } },
        },
      },
      entries: { orderBy: { entryTime: 'asc' } },
      checklist: true, photos: true,
      createdBy: { select: { firstName: true, lastName: true } },
    },
  });
  if (!r) return null;

  let rows: any[] = [];
  try {
    rows = await db.dailyReportAttachment.findMany({ where: { reportId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  } catch (e: any) {
    logger.warn(`[daily pdf] pièces jointes indisponibles : ${e.message}`);
  }

  // 1. fichiers : téléchargement + lecture (avant le rapport, qui liste les annexes avec leur nombre de pages)
  const list: DailyAttachmentPdf[] = [];
  const loaded: LoadedAnnex[] = [];
  const fileBuffers = new Map<string, Buffer>();
  let annexN = 0;
  for (const row of rows) {
    if (row.kind === 'checklist') {
      const snap = row.snapshot as { checklist?: HandoverChecklistPdf; siteManagerName?: string | null } | null;
      if (!snap?.checklist?.items?.length) continue;
      list.push({
        kind: 'checklist', fileName: row.fileName, phase: row.checklistPhase,
        checklist: JSON.parse(JSON.stringify(snap.checklist)), siteManagerName: snap.siteManagerName || null, snapshotAt: row.snapshotAt,
      });
      continue;
    }
    const cls = classifyFile(row.mimeType, row.fileName);
    const item: DailyAttachmentPdf = { kind: 'file', fileName: row.fileName, url: row.fileUrl };
    list.push(item);
    if (cls === 'office') { item.why = 'office'; continue; }
    if (cls === 'other') { item.why = 'other'; continue; }
    if (!row.embeddable) { item.why = cls === 'pdf' && row.pageCount ? 'protected' : 'unreadable'; continue; }
    const buf = row.fileUrl ? await fetchBuffer(cls === 'image' ? jpegUrl(row.fileUrl) : row.fileUrl) : null;
    if (!buf) { item.why = 'unreadable'; continue; }
    fileBuffers.set(row.id, buf);
    (item as any)._rowId = row.id;
    (item as any)._cls = cls;
  }

  // e-mail trop lourd : les fichiers restent en lien
  const total = [...fileBuffers.values()].reduce((n, b) => n + b.length, 0);
  const tooBig = !!opts.forEmail && total > EMAIL_ANNEX_MAX_BYTES;

  for (const item of list) {
    const rowId = (item as any)._rowId as string | undefined;
    const cls = (item as any)._cls as FileClass | undefined;
    delete (item as any)._rowId; delete (item as any)._cls;
    if (!rowId) continue;
    if (tooBig) { item.why = 'tooBig'; continue; }
    const buf = fileBuffers.get(rowId)!;
    if (cls === 'pdf') {
      try {
        const pdf = await PDFDocument.load(buf, { ignoreEncryption: true, updateMetadata: false });
        if (pdf.isEncrypted) { item.why = 'protected'; continue; }
        const n = pdf.getPageCount();
        const keep = Math.min(n, ANNEX_MAX_PAGES);
        item.annex = ++annexN; item.annexKind = 'pdf'; item.pages = keep;
        if (n > keep) item.truncatedTo = keep;
        loaded.push({ annex: item.annex, name: item.fileName, kind: 'pdf', pdf, pageIdx: Array.from({ length: keep }, (_, i) => i) });
      } catch { item.why = 'unreadable'; }
    } else if (cls === 'image') {
      item.annex = ++annexN; item.annexKind = 'image'; item.pages = 1;
      loaded.push({ annex: item.annex, name: item.fileName, kind: 'image', image: buf });
    }
  }

  // 2. rapport (pdfkit) avec la liste des pièces jointes et les check-lists dessinées
  const main = await generateDailyReportPdf({
    project: { name: r.project.name, internalNumber: r.project.internalNumber },
    client: r.project.client || null,
    reportDate: r.reportDate,
    reportId: r.id,
    createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : undefined,
    weather: r.weather,
    workersPresent: r.workersPresent,
    generalNotes: r.generalNotes,
    entries: r.entries as any,
    checklist: r.checklist,
    photos: r.photos,
    lang,
    attachments: list,
  });

  // 3. annexes ajoutées à la fin
  let buffer = main;
  if (loaded.length) {
    try {
      const out = await PDFDocument.load(main);
      const font = await out.embedFont(StandardFonts.Helvetica);
      const day = fmtDay(r.reportDate, lang);
      const stamp = (a: LoadedAnnex, p: number, pp: number) => (lang === 'en'
        ? `Daily report of ${day} - Appendix ${a.annex}: ${a.name} - page ${p}/${pp}`
        : `Daily report du ${day} - Annexe ${a.annex} : ${a.name} - page ${p}/${pp}`);
      for (const a of loaded) {
        try {
          if (a.kind === 'pdf') {
            const pages = await out.copyPages(a.pdf!, a.pageIdx!);
            pages.forEach((pg, i) => { out.addPage(pg); stampPage(pg, font, stamp(a, i + 1, pages.length)); });
          } else {
            const img = await out.embedJpg(a.image!).catch(() => out.embedPng(a.image!));
            const page = out.addPage([595.28, 841.89]);
            const maxW = 595.28 - 60, maxH = 841.89 - 80;
            const k = Math.min(maxW / img.width, maxH / img.height, 1.5);
            const iw = img.width * k, ih = img.height * k;
            page.drawImage(img, { x: (595.28 - iw) / 2, y: 30 + (maxH - ih) / 2, width: iw, height: ih });
            stampPage(page, font, stamp(a, 1, 1));
          }
        } catch (e: any) {
          logger.warn(`[daily pdf] annexe ${a.annex} (${a.name}) non intégrée : ${e.message}`);
        }
      }
      buffer = Buffer.from(await out.save());
    } catch (e: any) {
      logger.warn(`[daily pdf] assemblage des annexes impossible : ${e.message}`);
    }
  }

  return { report: r, buffer, linkedFiles: list.filter((a) => a.kind === 'file' && !a.annex) };
}
