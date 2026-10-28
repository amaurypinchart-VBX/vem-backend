// src/services/whatsappChat.ts
// Lecture d'une conversation WhatsApp exportée (« Exporter la discussion ») — logique pure, sans import.
//
// Deux formats, selon le téléphone, et la langue du téléphone change les dates / mots :
//   iPhone  : « [14/10/2026 09:12:33] Jean Dupont: texte »  (fichier _chat.txt dans le .zip)
//             pièce jointe « ‎<attached: 00000012-PHOTO-2026-10-14-09-12-33.jpg> » / « <pièce jointe : …> »
//   Android : « 14/10/2026 09:12 - Jean Dupont: texte »     (« Discussion WhatsApp avec … .txt »)
//             pièce jointe « IMG-20261014-WA0003.jpg (fichier joint) » + légende sur les lignes suivantes
// Ordre des dates (jour/mois, mois/jour, année d'abord) déduit de toutes les dates du fichier ;
// heures 24 h ou AM / PM. Une ligne sans en-tête date + heure continue le message précédent.
// Les heures sont celles du téléphone qui a exporté : aucune conversion de fuseau.

export type DateOrder = 'dmy' | 'mdy' | 'ymd';
export type MediaKind = 'photo' | 'video' | 'audio' | 'document' | 'sticker' | 'contact' | 'other';

export interface ChatMessage {
  /** numéro du message dans le fichier (0, 1, 2…) — référence stable pour l'IA et l'interface */
  i: number;
  /** date du message telle qu'écrite (YYYY-MM-DD) */
  date: string;
  /** HH:MM */
  time: string;
  /** null = message système (groupe créé, membre ajouté, chiffrement…) */
  author: string | null;
  text: string;
  /** fichier joint (nom dans l'export) */
  file?: string;
  kind?: MediaKind;
  /** média non inclus dans l'export (« <Médias omis> », « image omitted ») */
  omitted?: MediaKind;
}

export interface ParsedChat {
  format: 'ios' | 'android' | 'unknown';
  dateOrder: DateOrder;
  messages: ChatMessage[];
  participants: string[];
  warnings: string[];
}

export interface ChatDay {
  /** date de la journée de chantier (YYYY-MM-DD) */
  date: string;
  messages: ChatMessage[];
  authors: string[];
  firstTime: string;
  lastTime: string;
  counts: { messages: number; photo: number; video: number; audio: number; document: number; omitted: number };
}

const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g;
const SPACES = /[   ]/g;

const DATE = String.raw`(\d{1,4})[./-](\d{1,2})[./-](\d{1,4})`;
const TIME = String.raw`(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?(?:\s*([AaPp])\.?\s?[Mm]\.?)?`;
const IOS_HEAD = new RegExp(String.raw`^\[${DATE},?\s+${TIME}\]\s?(.*)$`);
const ANDROID_HEAD = new RegExp(String.raw`^${DATE},?\s+${TIME}\s+[-–]\s(.*)$`);

/** « <attached: fichier.jpg> », « <pièce jointe : fichier.jpg> », « <Anhang: …> » (iPhone) */
const IOS_ATTACH = /<[^<>:]{2,40}:\s*([^<>\n]+?\.[A-Za-z0-9]{2,5})\s*>/;
/** « IMG-…jpg (fichier joint) », « … (file attached) », « … (Datei angehängt) » (Android) */
const ANDROID_ATTACH = /^(.+?\.[A-Za-z0-9]{2,5}) \(([^()]{3,40})\)$/;
const ATTACH_WORDS = /file|fichier|joint|attach|datei|angeh|bestand|bijgevoegd|archivo|adjunt|arquivo|anex|allegat|allegato|plik|dosya/i;

/** médias non exportés */
const OMITTED_ANDROID = /^<[^<>]*(omitted|omis|ausgeschlossen|weggelaten|omitid|omess|pomini|dahil edilmedi)[^<>]*>$/i;
const OMITTED_IOS = /^(image|photo|video|vidéo|audio|sticker|document|GIF|Contact card|carte de contact|Bild|Foto|afbeelding)\s+(omitted|omise?|absente?|weggelassen|weggelaten|omitid[oa])$/i;
/** messages supprimés : sans contenu utile */
const DELETED = /^(this message was deleted|you deleted this message|ce message a été supprimé|vous avez supprimé ce message|diese nachricht wurde gelöscht|du hast diese nachricht gelöscht|dit bericht is verwijderd|je hebt dit bericht verwijderd)\.?$/i;
/** avis de chiffrement en tête de chaque export */
const ENCRYPTION = /chiffrés de bout en bout|end-to-end encrypted|Ende-zu-Ende|end-to-end versleuteld|cifrados de extremo a extremo|crittografia end-to-end/i;
/** « <Ce message a été modifié> » ajouté en fin de message édité */
const EDITED = /\s*<[^<>]*(edited|modifié|bearbeitet|bewerkt|editad|modificat)[^<>]*>\s*$/i;

function mediaKind(file: string): MediaKind {
  const name = file.toUpperCase();
  const ext = (file.split('.').pop() || '').toLowerCase();
  if (/STK-|STICKER/.test(name)) return 'sticker';
  if (['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp'].includes(ext)) return 'photo';
  if (ext === 'gif' || ['mp4', 'mov', '3gp', 'm4v', 'avi', 'mkv'].includes(ext)) return 'video';
  if (['opus', 'ogg', 'oga', 'm4a', 'mp3', 'aac', 'amr', 'wav'].includes(ext)) return 'audio';
  if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'dwg', 'dxf', 'zip'].includes(ext)) return 'document';
  if (ext === 'vcf') return 'contact';
  return 'other';
}

function omittedKind(word: string): MediaKind {
  const w = word.toLowerCase();
  if (/vid|gif/.test(w)) return 'video';
  if (/audio/.test(w)) return 'audio';
  if (/sticker/.test(w)) return 'sticker';
  if (/doc/.test(w)) return 'document';
  if (/contact/.test(w)) return 'contact';
  if (/image|photo|bild|foto|afbeelding/.test(w)) return 'photo';
  return 'other';
}

interface RawHead { a: number; b: number; c: number; h: number; m: number; ampm: string | null; rest: string }

function matchHead(line: string, re: RegExp): RawHead | null {
  const x = re.exec(line);
  if (!x) return null;
  return { a: +x[1], b: +x[2], c: +x[3], h: +x[4], m: +x[5], ampm: x[7] ? x[7].toLowerCase() : null, rest: x[8] ?? '' };
}

/** Ordre des dates d'après toutes les en-têtes : année d'abord, puis un jour > 12 tranche ; sinon jour/mois (sauf AM / PM). */
function guessOrder(all: RawHead[]): DateOrder {
  const heads = all.filter(h => h.a <= 31);
  if (!heads.length) return 'ymd';
  if (heads.some(h => h.a > 12)) return 'dmy';
  if (heads.some(h => h.b > 12)) return 'mdy';
  return heads.some(h => h.ampm) ? 'mdy' : 'dmy';
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function isoDate(h: RawHead, order: DateOrder): string | null {
  let y: number, mo: number, d: number;
  if (order === 'ymd' || h.a > 31) { y = h.a; mo = h.b; d = h.c; }
  else if (order === 'mdy') { mo = h.a; d = h.b; y = h.c; }
  else { d = h.a; mo = h.b; y = h.c; }
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCMonth() !== mo - 1) return null; // 31/02
  return `${y}-${pad(mo)}-${pad(d)}`;
}

function hhmm(h: RawHead): string {
  let hour = h.h;
  if (h.ampm === 'p' && hour < 12) hour += 12;
  if (h.ampm === 'a' && hour === 12) hour = 0;
  return `${pad(Math.min(hour, 23))}:${pad(Math.min(h.m, 59))}`;
}

/** Sépare « Auteur: texte ». Sans « : » après un nom plausible = message système. */
function splitAuthor(rest: string): { author: string | null; text: string } {
  const k = rest.indexOf(': ');
  if (k > 0 && k <= 80) {
    const author = rest.slice(0, k).trim();
    if (author && !/^https?$/i.test(author)) return { author, text: rest.slice(k + 2) };
  }
  if (rest.endsWith(':') && rest.length <= 81) return { author: rest.slice(0, -1).trim(), text: '' };
  return { author: null, text: rest };
}

export function parseWhatsAppChat(raw: string, opts: { dateOrder?: DateOrder } = {}): ParsedChat {
  const warnings: string[] = [];
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(INVISIBLE, '').replace(SPACES, ' '));

  // 1. format : celui qui reconnaît le plus d'en-têtes
  let ios = 0, android = 0;
  for (const l of lines) {
    if (IOS_HEAD.test(l)) ios++;
    else if (ANDROID_HEAD.test(l)) android++;
  }
  const format: ParsedChat['format'] = ios === 0 && android === 0 ? 'unknown' : ios >= android ? 'ios' : 'android';
  if (format === 'unknown') {
    return { format, dateOrder: 'dmy', messages: [], participants: [], warnings: ['Aucun message WhatsApp reconnu dans ce fichier (date + heure en début de ligne).'] };
  }
  const re = format === 'ios' ? IOS_HEAD : ANDROID_HEAD;

  // 2. en-têtes, puis ordre des dates
  const heads: Array<RawHead | null> = lines.map(l => matchHead(l, re));
  const dateOrder = opts.dateOrder || guessOrder(heads.filter((h): h is RawHead => !!h));

  // 3. messages (les lignes sans en-tête continuent le message précédent)
  type Draft = { date: string; time: string; author: string | null; lines: string[] };
  const drafts: Draft[] = [];
  let skippedTop = 0, badDates = 0;
  lines.forEach((line, n) => {
    const h = heads[n];
    const date = h ? isoDate(h, dateOrder) : null;
    if (h && date) {
      const { author, text } = splitAuthor(h.rest);
      drafts.push({ date, time: hhmm(h), author, lines: [text] });
      return;
    }
    if (h && !date) badDates++;
    if (drafts.length) drafts[drafts.length - 1].lines.push(line);
    else if (line.trim()) skippedTop++;
  });
  if (skippedTop) warnings.push(`${skippedTop} ligne(s) avant le premier message ignorée(s).`);
  if (badDates) warnings.push(`${badDates} date(s) illisible(s) rattachée(s) au message précédent.`);

  // 4. pièces jointes, médias omis, messages supprimés
  const messages: ChatMessage[] = [];
  const participants = new Set<string>();
  for (const d of drafts) {
    let text = d.lines.join('\n').replace(/\s+$/, '');
    let file: string | undefined;
    let omitted: MediaKind | undefined;

    const att = IOS_ATTACH.exec(text);
    if (att) {
      file = att[1].trim();
      text = (text.slice(0, att.index) + text.slice(att.index + att[0].length)).trim();
    } else {
      const first = text.split('\n')[0].trim();
      const and = ANDROID_ATTACH.exec(first);
      if (and && ATTACH_WORDS.test(and[2]) && !/\s{2,}/.test(and[1])) {
        file = and[1].trim();
        text = text.split('\n').slice(1).join('\n').trim();
      }
    }
    const firstLine = text.split('\n')[0].trim();
    if (!file) {
      if (OMITTED_ANDROID.test(firstLine)) { omitted = 'other'; text = text.split('\n').slice(1).join('\n').trim(); }
      else {
        const om = OMITTED_IOS.exec(firstLine);
        if (om) { omitted = omittedKind(om[1]); text = text.split('\n').slice(1).join('\n').trim(); }
      }
    }
    text = text.replace(EDITED, '').trim();
    if (!file && !omitted && (DELETED.test(text) || ENCRYPTION.test(text) || !text)) continue;

    const msg: ChatMessage = { i: messages.length, date: d.date, time: d.time, author: d.author, text };
    if (file) { msg.file = file; msg.kind = mediaKind(file); }
    if (omitted) msg.omitted = omitted;
    messages.push(msg);
    if (d.author) participants.add(d.author);
  }
  const omitted = messages.filter(m => m.omitted).length;
  if (omitted && !messages.some(m => m.file)) {
    warnings.push('Export « sans médias » : les photos ne sont pas dans le fichier. Refaire l’export avec « Joindre les médias » pour les ajouter aux rapports.');
  } else if (omitted) {
    warnings.push(`${omitted} média(s) absent(s) de l’export (pas téléchargé(s) sur le téléphone qui a exporté).`);
  }
  return { format, dateOrder, messages, participants: [...participants], warnings };
}

function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * Messages regroupés par journée de chantier. `dayStartHour` (0–12) : une journée commence à cette heure —
 * pour un montage de nuit (5 h), un message de 02:30 compte pour la veille.
 */
export function groupChatByDay(messages: ChatMessage[], dayStartHour = 0): ChatDay[] {
  const start = Math.max(0, Math.min(12, Math.floor(dayStartHour || 0)));
  const byDate = new Map<string, ChatMessage[]>();
  for (const m of messages) {
    const hour = +m.time.slice(0, 2);
    const day = start && hour < start ? shiftDate(m.date, -1) : m.date;
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day)!.push(m);
  }
  return [...byDate.keys()].sort().map(date => {
    const list = byDate.get(date)!;
    const counts = { messages: list.length, photo: 0, video: 0, audio: 0, document: 0, omitted: 0 };
    for (const m of list) {
      if (m.kind === 'photo' || m.kind === 'video' || m.kind === 'audio' || m.kind === 'document') counts[m.kind]++;
      if (m.omitted) counts.omitted++;
    }
    return {
      date,
      messages: list,
      authors: [...new Set(list.map(m => m.author).filter((a): a is string => !!a))],
      firstTime: list[0].time,
      lastTime: list[list.length - 1].time,
      counts,
    };
  });
}

const KIND_LABEL: Record<MediaKind, string> = {
  photo: 'PHOTO', video: 'VIDÉO', audio: 'NOTE VOCALE', document: 'DOCUMENT', sticker: 'STICKER', contact: 'CONTACT', other: 'FICHIER',
};

/**
 * Journée mise en texte pour l'IA : « [#12 09:14] Jean : texte ». Les photos portent un numéro « p3 » (ordre dans la journée)
 * pour que l'IA leur donne une légende ; une note vocale transcrite est donnée entre guillemets.
 */
export function dayTranscript(messages: Array<ChatMessage & { transcript?: string }>): { text: string; photoRefs: Record<string, number> } {
  const photoRefs: Record<string, number> = {};
  let p = 0;
  const out = messages.map(m => {
    const who = m.author || 'Système';
    const parts: string[] = [];
    if (m.file && m.kind) {
      if (m.kind === 'photo') {
        p++;
        photoRefs[`p${p}`] = m.i;
        parts.push(`📷 PHOTO p${p}`);
      } else if (m.kind === 'audio' && m.transcript) {
        parts.push(`🎙️ NOTE VOCALE transcrite : « ${m.transcript.trim()} »`);
      } else {
        parts.push(`[${KIND_LABEL[m.kind]} ${m.file}]`);
      }
    } else if (m.omitted) {
      parts.push(`[${KIND_LABEL[m.omitted]} non exportée]`);
    }
    if (m.text) parts.push(m.text);
    return `[#${m.i} ${m.time}] ${who} : ${parts.join(' — ')}`;
  });
  return { text: out.join('\n'), photoRefs };
}
