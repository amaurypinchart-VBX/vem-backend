// src/services/planApprovalPdf.ts
// PDF des plans validés par le client (A. Pinchart 17.11.2026) : sur chaque page un cachet « PLANS VALIDÉS »
// (date, nom, fonction, société, signature) + un filigrane en diagonale, puis une dernière page « Certificat de
// validation » (qui, quand, IP, appareil, empreinte du document envoyé, réserves, journal).
// Cachet : dans la case « Signature » du cartouche quand le PDF vient de Plans Viewbox (gabarit A1 / A3), sinon en
// haut à droite de la page (on ne sait pas où est le cartouche d'un autre PDF, le haut à droite le laisse lisible).
// Rotation des pages (/Rotate) prise en compte : tout est placé dans le repère de la page telle qu'elle s'affiche.
// Pur (pdf-lib seulement) : testé par tests/planApproval.test.ts.
import fs from 'fs';
import path from 'path';
import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, degrees, RGB } from 'pdf-lib';
// fontkit 1.x (celui de pdfkit) : le fork @pdf-lib/fontkit perd des lettres d'Arimo au sous-ensemble
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fontkitLib = require('fontkit');
/** fontkit 1.x attend un Buffer, pdf-lib lui passe un Uint8Array. */
const fontkit = { create: (data: Uint8Array) => fontkitLib.create(Buffer.from(data.buffer, data.byteOffset, data.byteLength)) };

export type ApprovalLang = 'fr' | 'en';
export type ApprovalDecision = 'approved' | 'reserves';

export interface ApprovalEventLine { at: Date | string; kind: string; ip?: string | null; detail?: string | null }

export interface StampInfo {
  lang: ApprovalLang;
  decision: ApprovalDecision;
  decidedAt: Date;
  signerName: string;
  signerTitle?: string | null;
  signerCompany?: string | null;
  signerEmail: string;
  comment?: string | null;
  /** data:image/png;base64,… ou data:image/jpeg;base64,… */
  signatureImage?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  ref: string;
  revision: string;
  projectName: string;
  projectNumber?: string | null;
  projectAddress?: string | null;
  fileName: string;
  fileSha256: string;
  pageCount: number;
  sentAt: Date;
  sentBy?: string | null;
  events: ApprovalEventLine[];
}

export interface PdfInspection { pages: number; encrypted: boolean; viewbox: boolean }

/** Le PDF peut-il recevoir un cachet ? (lisible, non protégé) + nombre de pages. */
export async function inspectPdf(buffer: Buffer): Promise<PdfInspection> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false });
  return { pages: pdf.getPageCount(), encrypted: pdf.isEncrypted, viewbox: isViewboxPdf(pdf) };
}

function isViewboxPdf(pdf: PDFDocument): boolean {
  const who = `${pdf.getCreator() || ''} ${pdf.getProducer() || ''}`;
  return /Plans Viewbox/i.test(who);
}

// ─── textes ───────────────────────────────────────────────────────────────

const TXT = {
  fr: {
    approved: 'PLANS VALIDÉS', reserves: 'VALIDÉS AVEC RÉSERVES',
    on: (d: string, h: string) => `le ${d} à ${h}`, by: 'par', rev: 'Rév.', certPage: (n: number) => `certificat p. ${n}`,
    certTitle: 'Certificat de validation des plans',
    sProject: 'Projet', sDocument: 'Document validé', sSigner: 'Signataire', sDecision: 'Décision', sJournal: 'Journal de la demande',
    project: 'Projet', number: 'N° interne', address: 'Adresse', file: 'Fichier', revision: 'Révision', ref: 'Référence',
    pages: 'Nombre de pages', sha: 'Empreinte SHA-256 du document envoyé', sent: 'Envoyé le', sentBy: 'par',
    name: 'Nom', title: 'Fonction', company: 'Société', email: 'E-mail', emailNote: 'vérifié par un code à usage unique envoyé à cette adresse',
    date: 'Date et heure', tz: '(heure de Bruxelles)', ip: 'Adresse IP', device: 'Appareil', decision: 'Décision',
    decApproved: 'Plans validés', decReserves: 'Plans validés avec réserves', reservesLbl: 'Réserves', commentLbl: 'Commentaire', signature: 'Signature',
    legal: (n: number) => `Signature électronique simple au sens du règlement (UE) n° 910/2014 (eIDAS). L'identité du signataire est attestée par un code à usage unique envoyé à son adresse e-mail. Les pages 1 à ${n} reproduisent le document envoyé, auquel ont été ajoutés le cachet et le filigrane de validation ; le document envoyé est conservé dans VEM et son empreinte SHA-256 ci-dessus permet de vérifier qu'il n'a pas été modifié.`,
    page: 'page',
  },
  en: {
    approved: 'PLANS APPROVED', reserves: 'APPROVED WITH RESERVATIONS',
    on: (d: string, h: string) => `on ${d} at ${h}`, by: 'by', rev: 'Rev.', certPage: (n: number) => `certificate p. ${n}`,
    certTitle: 'Plan approval certificate',
    sProject: 'Project', sDocument: 'Approved document', sSigner: 'Signatory', sDecision: 'Decision', sJournal: 'Request log',
    project: 'Project', number: 'Internal no.', address: 'Address', file: 'File', revision: 'Revision', ref: 'Reference',
    pages: 'Number of pages', sha: 'SHA-256 fingerprint of the document sent', sent: 'Sent on', sentBy: 'by',
    name: 'Name', title: 'Position', company: 'Company', email: 'E-mail', emailNote: 'verified with a one-time code sent to this address',
    date: 'Date and time', tz: '(Brussels time)', ip: 'IP address', device: 'Device', decision: 'Decision',
    decApproved: 'Plans approved', decReserves: 'Plans approved with reservations', reservesLbl: 'Reservations', commentLbl: 'Comment', signature: 'Signature',
    legal: (n: number) => `Simple electronic signature within the meaning of Regulation (EU) No 910/2014 (eIDAS). The identity of the signatory is attested by a one-time code sent to their e-mail address. Pages 1 to ${n} reproduce the document sent, to which the approval stamp and watermark have been added; the document sent is kept in VEM and its SHA-256 fingerprint above allows checking that it has not been modified.`,
    page: 'page',
  },
};

/** Libellés du journal (certificat + écran VEM). */
export const EVENT_LABELS: Record<ApprovalLang, Record<string, string>> = {
  fr: {
    created: 'Demande créée', sent: 'Lien envoyé par e-mail', resent: 'Lien renvoyé par e-mail', opened: 'Lien ouvert',
    viewed: 'Plans consultés', code_sent: 'Code de vérification envoyé', code_failed: 'Code incorrect', approved: 'Plans validés',
    reserves: 'Plans validés avec réserves', changes: 'Modifications demandées', cancelled: 'Demande annulée', superseded: 'Remplacée par une nouvelle version',
    stamped: 'PDF validé créé', stamp_failed: 'PDF validé non créé', mailed: 'PDF envoyé par e-mail', mail_failed: 'E-mail non envoyé',
    downloaded: 'PDF validé téléchargé',
  },
  en: {
    created: 'Request created', sent: 'Link sent by e-mail', resent: 'Link sent again by e-mail', opened: 'Link opened',
    viewed: 'Plans viewed', code_sent: 'Verification code sent', code_failed: 'Wrong code', approved: 'Plans approved',
    reserves: 'Plans approved with reservations', changes: 'Changes requested', cancelled: 'Request cancelled', superseded: 'Replaced by a new version',
    stamped: 'Approved PDF created', stamp_failed: 'Approved PDF not created', mailed: 'PDF sent by e-mail', mail_failed: 'E-mail not sent',
    downloaded: 'Approved PDF downloaded',
  },
};

/** Date et heure à Bruxelles : { d: 17.11.2026, h: 14:32 } */
export function brusselsDateTime(at: Date | string, lang: ApprovalLang = 'fr'): { d: string; h: string } {
  const date = new Date(at);
  const d = date.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-BE', { timeZone: 'Europe/Brussels', day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.');
  const h = date.toLocaleTimeString('fr-BE', { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit' }).replace(/\s?h\s?/, ':');
  return { d, h };
}

/** Texte accepté par les polices standard de pdf-lib (WinAnsi) : accents décomposés, sinon « ? ». */
export function ansi(text: unknown): string {
  return String(text ?? '')
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—―]/g, '-')
    .replace(/…/g, '...')
    .replace(/[   ]/g, ' ')
    .replace(/[\r\t]/g, ' ')
    .replace(/[^\n\x20-\x7E\xA0-\xFF€]/g, (c) => {
      const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '');
      return /^[\x20-\x7E\xA0-\xFF]$/.test(base) ? base : '?';
    });
}

function shorten(font: PDFFont, text: string, size: number, maxW: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxW) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(out + '...', size) > maxW) out = out.slice(0, -1);
  return out + '...';
}

/** Texte pour une police Unicode (Arimo) : sans emoji ni caractères de contrôle. */
export function unicodeText(text: unknown): string {
  return String(text ?? '')
    .replace(/[\r\t]/g, ' ')
    .replace(/\p{Extended_Pictographic}|[\u200B-\u200D\uFE0F\u0000-\u0009\u000B-\u001F]/gu, '')
    .replace(/[\u00A0\u202F\u2009]/g, ' ');
}

/** Coupe un texte en lignes de largeur maxW (les retours à la ligne du texte sont gardés). */
export function wrap(font: PDFFont, text: string, size: number, maxW: number, tx: (s: unknown) => string = ansi): string[] {
  const out: string[] = [];
  for (const para of tx(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let w of words) {
      // mot plus long que la ligne (empreinte, URL) : coupé
      while (font.widthOfTextAtSize(w, size) > maxW) {
        let cut = w.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > maxW) cut--;
        if (line) { out.push(line); line = ''; }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const next = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= maxW) line = next;
      else { out.push(line); line = w; }
    }
    if (line) out.push(line);
  }
  return out;
}

// ─── repère de la page telle qu'elle s'affiche ───────────────────────────

interface View {
  w: number; h: number; rot: number;
  /** point affiché (x vers la droite, y vers le haut, origine en bas à gauche de la zone visible) → point de la page */
  at(vx: number, vy: number): { x: number; y: number };
}

function viewOf(page: PDFPage): View {
  const box = page.getCropBox();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const turned = rot === 90 || rot === 270;
  const w = turned ? box.height : box.width;
  const h = turned ? box.width : box.height;
  return {
    w, h, rot,
    at(vx, vy) {
      if (rot === 90) return { x: box.x + box.width - vy, y: box.y + vx };
      if (rot === 180) return { x: box.x + box.width - vx, y: box.y + box.height - vy };
      if (rot === 270) return { x: box.x + vy, y: box.y + box.height - vx };
      return { x: box.x + vx, y: box.y + vy };
    },
  };
}

function text(page: PDFPage, v: View, s: string, vx: number, vy: number, size: number, font: PDFFont, color: RGB, opts: { angle?: number; opacity?: number } = {}) {
  const p = v.at(vx, vy);
  page.drawText(s, { x: p.x, y: p.y, size, font, color, rotate: degrees(v.rot + (opts.angle || 0)), opacity: opts.opacity });
}

function rect(page: PDFPage, v: View, vx: number, vy: number, w: number, h: number, o: { fill?: RGB; border?: RGB; borderWidth?: number; opacity?: number }) {
  const p = v.at(vx, vy);
  page.drawRectangle({
    x: p.x, y: p.y, width: w, height: h, rotate: degrees(v.rot),
    color: o.fill, opacity: o.opacity, borderColor: o.border, borderWidth: o.border ? (o.borderWidth ?? 1) : undefined,
  });
}

function image(page: PDFPage, v: View, img: PDFImage, vx: number, vy: number, w: number, h: number) {
  const p = v.at(vx, vy);
  page.drawImage(img, { x: p.x, y: p.y, width: w, height: h, rotate: degrees(v.rot) });
}

// ─── cachet + filigrane ──────────────────────────────────────────────────

const GREEN = rgb(0.06, 0.5, 0.24);
const AMBER = rgb(0.8, 0.42, 0.0);
const INK = rgb(0.1, 0.1, 0.18);
const GREY = rgb(0.42, 0.45, 0.5);
const NAVY = rgb(0.1, 0.1, 0.18);
const RED = rgb(0.9, 0.22, 0.27);

const MM = 72 / 25.4;
/** Case « Signature » du cartouche des planches Viewbox (plans/src/sheets/template.ts, TB.signature.box, A1 en mm). */
const VBX_A1 = { w: 841, h: 594 };
const VBX_SIGNATURE_BOX = { x: 712.7, y: 526.6, w: 117.5, h: 28.0 };

interface Fonts { regular: PDFFont; bold: PDFFont; mono: PDFFont; tx: (s: unknown) => string }

// Arimo (police Unicode : noms polonais, tchèques…) : celle du rendu PDF des planches, copiée dans plans-server/fonts
// par l'image Docker ; en local, celle des sources de Plans Viewbox. À défaut : Helvetica (WinAnsi, « ? » sinon).
const FONT_DIRS = [
  path.join(__dirname, '..', '..', 'plans-server', 'fonts'),
  path.join(__dirname, '..', '..', 'plans', 'src', 'sheets', 'pdf', 'fonts'),
];
let fontBytes: { regular: Buffer; bold: Buffer } | null | undefined;
function arimo(): { regular: Buffer; bold: Buffer } | null {
  if (fontBytes !== undefined) return fontBytes;
  fontBytes = null;
  for (const dir of FONT_DIRS) {
    try {
      fontBytes = { regular: fs.readFileSync(path.join(dir, 'Arimo-Regular.ttf')), bold: fs.readFileSync(path.join(dir, 'Arimo-Bold.ttf')) };
      break;
    } catch { /* dossier suivant */ }
  }
  return fontBytes;
}

async function embedFonts(pdf: PDFDocument): Promise<Fonts> {
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const ttf = process.env.PLAN_APPROVAL_STANDARD_FONTS === '1' ? null : arimo();
  if (ttf) {
    try {
      pdf.registerFontkit(fontkit as any);
      return {
        regular: await pdf.embedFont(ttf.regular, { subset: true }),
        bold: await pdf.embedFont(ttf.bold, { subset: true }),
        mono, tx: unicodeText,
      };
    } catch { /* police illisible : polices standard */ }
  }
  return { regular: await pdf.embedFont(StandardFonts.Helvetica), bold: await pdf.embedFont(StandardFonts.HelveticaBold), mono, tx: ansi };
}

/** Rectangle du cachet dans la page affichée (x, y = coin bas gauche). */
function stampBox(v: View, viewbox: boolean): { x: number; y: number; w: number; h: number; inTitleBlock: boolean } {
  const ratio = v.w / v.h;
  if (viewbox && Math.abs(ratio - VBX_A1.w / VBX_A1.h) < 0.02) {
    const k = v.w / (VBX_A1.w * MM); // pt par mm A1
    const b = VBX_SIGNATURE_BOX;
    // la case garde son libellé « Signature » au-dessus ; on remplit l'intérieur (0,6 mm de marge)
    const x = (b.x + 0.6) * MM * k;
    const w = (b.w - 1.2) * MM * k;
    const h = (b.h - 1.2) * MM * k;
    const top = (b.y + 0.6) * MM * k;
    return { x, y: v.h - top - h, w, h, inTitleBlock: true };
  }
  const w = Math.max(175, Math.min(380, v.w * 0.3));
  const h = w * 0.3;
  const m = Math.max(12, Math.min(v.w, v.h) * 0.02);
  return { x: v.w - w - m, y: v.h - h - m, w, h, inTitleBlock: false };
}

function drawStamp(page: PDFPage, f: Fonts, sig: PDFImage | null, info: StampInfo, viewbox: boolean, certPage: number) {
  const v = viewOf(page);
  const t = TXT[info.lang];
  const color = info.decision === 'reserves' ? AMBER : GREEN;
  const b = stampBox(v, viewbox);
  const { d, h } = brusselsDateTime(info.decidedAt, info.lang);

  rect(page, v, b.x, b.y, b.w, b.h, { fill: rgb(1, 1, 1), opacity: 0.92 });
  rect(page, v, b.x, b.y, b.w, b.h, { border: color, borderWidth: Math.max(0.6, b.h * 0.025) });

  const pad = b.h * 0.08;
  const sigW = sig ? b.w * 0.32 : 0;
  const textW = b.w - 2 * pad - (sig ? sigW + pad : 0);
  const size = b.h * 0.122;
  const title = f.tx(info.decision === 'reserves' ? t.reserves : t.approved);
  // le titre rétrécit pour tenir dans la largeur (jamais coupé)
  const titleSize = Math.min(size * 1.4, (textW / f.bold.widthOfTextAtSize(title, 1)) * 0.98);
  const lines: Array<{ s: string; font: PDFFont; size: number; color: RGB }> = [
    { s: title, font: f.bold, size: titleSize, color },
    { s: f.tx(t.on(d, h)), font: f.regular, size, color: INK },
    { s: f.tx(`${t.by} ${info.signerName}${info.signerTitle ? ` (${info.signerTitle})` : ''}`), font: f.bold, size, color: INK },
  ];
  if (info.signerCompany) lines.push({ s: f.tx(info.signerCompany), font: f.regular, size, color: INK });
  lines.push({ s: f.tx(`${t.rev} ${info.revision} · ${info.ref} · ${t.certPage(certPage)}`), font: f.regular, size: size * 0.85, color: GREY });

  const gap = size * 0.3;
  const total = lines.reduce((n, l) => n + l.size, 0) + gap * (lines.length - 1);
  let y = b.y + b.h / 2 + total / 2;
  for (const l of lines) {
    y -= l.size;
    const s = shorten(l.font, l.s, l.size, textW);
    text(page, v, s, b.x + pad, y + l.size * 0.18, l.size, l.font, l.color);
    y -= gap;
  }

  if (sig) {
    const boxW = sigW, boxH = b.h - 2 * pad;
    const k = Math.min(boxW / sig.width, boxH / sig.height);
    const iw = sig.width * k, ih = sig.height * k;
    image(page, v, sig, b.x + b.w - pad - boxW + (boxW - iw) / 2, b.y + pad + (boxH - ih) / 2, iw, ih);
  }
}

function drawWatermark(page: PDFPage, f: Fonts, info: StampInfo) {
  const v = viewOf(page);
  const t = TXT[info.lang];
  const color = info.decision === 'reserves' ? AMBER : GREEN;
  const { d } = brusselsDateTime(info.decidedAt, info.lang);
  const s = f.tx(`${info.decision === 'reserves' ? t.reserves : t.approved} – ${d}`);
  const angle = Math.atan2(v.h, v.w);
  const diag = Math.hypot(v.w, v.h);
  const size = (diag * 0.62) / f.bold.widthOfTextAtSize(s, 1);
  const tw = f.bold.widthOfTextAtSize(s, size);
  const cap = f.bold.heightAtSize(size, { descender: false });
  const cos = Math.cos(angle), sin = Math.sin(angle);
  // départ du texte : centre de la page − demi-longueur le long de la diagonale − demi-hauteur perpendiculairement
  const vx = v.w / 2 - (tw / 2) * cos + (cap / 2) * sin;
  const vy = v.h / 2 - (tw / 2) * sin - (cap / 2) * cos;
  text(page, v, s, vx, vy, size, f.bold, color, { angle: (angle * 180) / Math.PI, opacity: info.decision === 'reserves' ? 0.16 : 0.13 });
}

async function embedSignature(pdf: PDFDocument, dataUrl: string | null | undefined): Promise<PDFImage | null> {
  const m = /^data:image\/(png|jpe?g);base64,(.+)$/i.exec(String(dataUrl || ''));
  if (!m) return null;
  const bytes = Buffer.from(m[2], 'base64');
  try {
    return /png/i.test(m[1]) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
  } catch { return null; }
}

// ─── certificat ──────────────────────────────────────────────────────────

function drawCertificate(pdf: PDFDocument, f: Fonts, sig: PDFImage | null, info: StampInfo) {
  const t = TXT[info.lang];
  const L = EVENT_LABELS[info.lang];
  const W = 595.28, H = 841.89, M = 46, BOTTOM = 40;
  let page = pdf.addPage([W, H]);
  let y = H;

  const header = () => {
    page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: NAVY });
    page.drawText('VIEWBOX', { x: M, y: H - 40, size: 20, font: f.bold, color: RED });
    page.drawText(f.tx(t.certTitle), { x: M + 112, y: H - 38, size: 13, font: f.bold, color: rgb(1, 1, 1) });
    page.drawText(f.tx(`${info.ref} · ${t.rev} ${info.revision}`), { x: M + 112, y: H - 53, size: 8.5, font: f.regular, color: rgb(0.75, 0.77, 0.82) });
    y = H - 84;
  };
  const ensure = (need: number) => {
    if (y - need < BOTTOM) { page = pdf.addPage([W, H]); header(); }
  };
  header();

  // décision
  const color = info.decision === 'reserves' ? AMBER : GREEN;
  const { d, h } = brusselsDateTime(info.decidedAt, info.lang);
  page.drawRectangle({ x: M, y: y - 46, width: W - 2 * M, height: 46, color: info.decision === 'reserves' ? rgb(1, 0.96, 0.9) : rgb(0.92, 0.98, 0.94), borderColor: color, borderWidth: 1.2 });
  page.drawText(f.tx(info.decision === 'reserves' ? t.reserves : t.approved), { x: M + 14, y: y - 22, size: 15, font: f.bold, color });
  const sub = shorten(f.regular, f.tx(`${t.on(d, h)} ${t.tz} — ${t.by} ${info.signerName}`), 9.5, W - 2 * M - 28);
  page.drawText(sub, { x: M + 14, y: y - 37, size: 9.5, font: f.regular, color: INK });
  y -= 60;

  const labelW = 150;
  const valueW = W - 2 * M - labelW;
  const section = (title: string) => {
    ensure(44);
    page.drawText(f.tx(title.toUpperCase()), { x: M, y: y - 10, size: 8.5, font: f.bold, color: GREY });
    page.drawLine({ start: { x: M, y: y - 14 }, end: { x: W - M, y: y - 14 }, thickness: 0.5, color: rgb(0.85, 0.86, 0.88) });
    y -= 24;
  };
  const row = (label: string, value: string, o: { mono?: boolean; note?: string } = {}) => {
    const font = o.mono ? f.mono : f.regular;
    const size = o.mono ? 8.2 : 9.2;
    const step = size + 3;
    const lines = wrap(font, value || '—', size, valueW, o.mono ? ansi : f.tx);
    const labelLines = wrap(f.bold, label, 8.6, labelW - 10, f.tx);
    const noteLines = o.note ? wrap(f.regular, o.note, 7.3, valueW, f.tx) : [];
    const valueH = lines.length * step + noteLines.length * 9.5;
    const need = Math.max(valueH, labelLines.length * 11.5) + 4;
    ensure(need);
    let ly = y;
    for (const l of labelLines) { page.drawText(l, { x: M, y: ly - 8.6, size: 8.6, font: f.bold, color: INK }); ly -= 11.5; }
    let yy = y;
    for (const l of lines) { page.drawText(l, { x: M + labelW, y: yy - size, size, font, color: INK }); yy -= step; }
    for (const l of noteLines) { page.drawText(l, { x: M + labelW, y: yy - 7.3, size: 7.3, font: f.regular, color: GREY }); yy -= 9.5; }
    y -= need;
  };

  section(t.sProject);
  row(t.project, info.projectName);
  if (info.projectNumber) row(t.number, info.projectNumber);
  if (info.projectAddress) row(t.address, info.projectAddress);

  section(t.sDocument);
  row(t.file, info.fileName);
  row(t.revision, info.revision);
  row(t.ref, info.ref);
  row(t.pages, String(info.pageCount));
  const sent = brusselsDateTime(info.sentAt, info.lang);
  row(t.sent, `${sent.d} ${sent.h}${info.sentBy ? ` — ${t.sentBy} ${info.sentBy}` : ''}`);
  row(t.sha, info.fileSha256, { mono: true });

  section(t.sSigner);
  row(t.name, info.signerName);
  if (info.signerTitle) row(t.title, info.signerTitle);
  if (info.signerCompany) row(t.company, info.signerCompany);
  row(t.email, info.signerEmail, { note: t.emailNote });
  row(t.date, `${d} ${h} ${t.tz}`);
  if (info.ip) row(t.ip, info.ip);
  if (info.userAgent) row(t.device, info.userAgent.slice(0, 220));

  section(t.sDecision);
  row(t.decision, info.decision === 'reserves' ? t.decReserves : t.decApproved);
  if (info.comment) row(info.decision === 'reserves' ? t.reservesLbl : t.commentLbl, info.comment);
  if (sig) {
    const boxW = 200, boxH = 72;
    ensure(boxH + 10);
    page.drawText(f.tx(t.signature), { x: M, y: y - 8.6, size: 8.6, font: f.bold, color: INK });
    page.drawRectangle({ x: M + labelW, y: y - boxH, width: boxW, height: boxH, borderColor: rgb(0.8, 0.81, 0.84), borderWidth: 0.6 });
    const k = Math.min((boxW - 10) / sig.width, (boxH - 10) / sig.height);
    page.drawImage(sig, { x: M + labelW + (boxW - sig.width * k) / 2, y: y - boxH + (boxH - sig.height * k) / 2, width: sig.width * k, height: sig.height * k });
    y -= boxH + 10;
  }

  section(t.sJournal);
  for (const e of info.events) {
    const at = brusselsDateTime(e.at, info.lang);
    const label = L[e.kind] || e.kind;
    const detail = [e.detail, e.ip ? `IP ${e.ip}` : ''].filter(Boolean).join(' · ');
    const lines = wrap(f.regular, `${label}${detail ? ` — ${detail}` : ''}`, 8.3, valueW, f.tx);
    ensure(lines.length * 10.5 + 2);
    page.drawText(`${at.d} ${at.h}`, { x: M, y: y - 8.3, size: 8.3, font: f.mono, color: GREY });
    let yy = y;
    for (const l of lines) { page.drawText(l, { x: M + labelW, y: yy - 8.3, size: 8.3, font: f.regular, color: INK }); yy -= 10.5; }
    y = yy - 2;
  }

  // mention légale en bas de la dernière page (nouvelle page seulement si elle ne tient plus)
  const legal = wrap(f.regular, t.legal(info.pageCount), 7.3, W - 2 * M, f.tx);
  const legalH = legal.length * 9.2;
  if (y - 14 - legalH < 24) { page = pdf.addPage([W, H]); header(); }
  let ly = 24 + legalH - 7.3;
  page.drawLine({ start: { x: M, y: ly + 12 }, end: { x: W - M, y: ly + 12 }, thickness: 0.5, color: rgb(0.85, 0.86, 0.88) });
  for (const l of legal) { page.drawText(l, { x: M, y: ly, size: 7.3, font: f.regular, color: GREY }); ly -= 9.2; }
}

/**
 * PDF validé : chaque page du document envoyé reçoit le cachet et le filigrane, puis le certificat est ajouté.
 * Lève une erreur si le PDF ne peut pas être lu (protégé, abîmé).
 */
export async function stampApprovedPdf(original: Buffer, info: StampInfo): Promise<Buffer> {
  const pdf = await PDFDocument.load(original, { ignoreEncryption: false, updateMetadata: false });
  const viewbox = isViewboxPdf(pdf);
  const fonts = await embedFonts(pdf);
  const sig = await embedSignature(pdf, info.signatureImage);
  const pages = pdf.getPages();
  const certPage = pages.length + 1;
  for (const page of pages) {
    drawWatermark(page, fonts, info);
    drawStamp(page, fonts, sig, info, viewbox, certPage);
  }
  drawCertificate(pdf, fonts, sig, info);
  const t = TXT[info.lang];
  const prevSubject = pdf.getSubject();
  pdf.setSubject(fonts.tx(`${info.decision === 'reserves' ? t.reserves : t.approved} — ${info.ref}${prevSubject ? ` — ${prevSubject}` : ''}`));
  pdf.setModificationDate(new Date());
  return Buffer.from(await pdf.save());
}
