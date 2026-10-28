// src/services/infoRequestLogic.ts
// Demandes d'infos par mail — logique PURE (aucun accès base / réseau), testable seule :
//   - catalogue des infos qu'on peut demander (INFO_FIELDS)
//   - référence INFO-XXXXXX, modèle de réponse mis dans le mail
//   - lecture d'une réponse (modèle « [n] libellé : réponse », « 1 : réponse », citations, signatures)
//   - lecture des dates (12/11/2026, 12 nov, 8h30…) en heure de Bruxelles
//   - rythme des rappels (fixe ou selon l'urgence, fenêtre 8 h – 18 h, week-end)
// Spec : docs/info-requests/PROMPT_Demandes_Infos_Mail.md

export type Lang = 'fr' | 'en';
export type FieldKind = 'text' | 'longtext' | 'date' | 'number' | 'names' | 'bookings';
export type FieldGroup = 'site' | 'dates' | 'team' | 'logistics' | 'notes' | 'custom';

export interface InfoField {
  key: string;
  group: FieldGroup;
  kind: FieldKind;
  label: Record<Lang, string>;
  /** explication affichée dans le mail sous la question */
  hint?: Record<Lang, string>;
  /** comment savoir que l'info a été remplie à la main dans VEM : valeur du projet / nouvel enregistrement / impossible */
  detect: 'value' | 'records' | 'none';
  /** date « pour le » par défaut : X jours avant le début du montage, ou X jours après l'envoi */
  lead: { from: 'install' | 'now'; days: number };
}

export const TZ = 'Europe/Brussels';
const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;

export const INFO_FIELDS: InfoField[] = [
  { key: 'address', group: 'site', kind: 'text', detect: 'value', lead: { from: 'install', days: 21 },
    label: { fr: 'Adresse de montage', en: 'Installation address' },
    hint: { fr: 'Adresse complète du lieu de montage (rue, n°, code postal, ville).', en: 'Full address of the installation site (street, number, postcode, city).' } },
  { key: 'city', group: 'site', kind: 'text', detect: 'value', lead: { from: 'install', days: 21 },
    label: { fr: 'Ville', en: 'City' } },
  { key: 'installationStart', group: 'dates', kind: 'date', detect: 'value', lead: { from: 'now', days: 5 },
    label: { fr: 'Début du montage', en: 'Installation start' },
    hint: { fr: 'Date (et heure si connue) du début du montage sur place.', en: 'Date (and time if known) the installation starts on site.' } },
  { key: 'installationEnd', group: 'dates', kind: 'date', detect: 'value', lead: { from: 'now', days: 5 },
    label: { fr: 'Fin du montage', en: 'Installation end' } },
  { key: 'dismantlingStart', group: 'dates', kind: 'date', detect: 'value', lead: { from: 'now', days: 10 },
    label: { fr: 'Début du démontage', en: 'Dismantling start' } },
  { key: 'dismantlingEnd', group: 'dates', kind: 'date', detect: 'value', lead: { from: 'now', days: 10 },
    label: { fr: 'Fin du démontage', en: 'Dismantling end' } },
  { key: 'workersCount', group: 'team', kind: 'number', detect: 'value', lead: { from: 'install', days: 14 },
    label: { fr: 'Nombre de monteurs', en: 'Number of installers' } },
  { key: 'team', group: 'team', kind: 'names', detect: 'records', lead: { from: 'install', days: 21 },
    label: { fr: "Équipe : qui vient ?", en: 'Team: who is coming?' },
    hint: { fr: 'Les noms des personnes (chef de chantier, monteurs…), séparés par des virgules.', en: 'Names of the people (site manager, installers…), separated by commas.' } },
  { key: 'teamTravel', group: 'team', kind: 'bookings', detect: 'records', lead: { from: 'install', days: 14 },
    label: { fr: "Trajets de l'équipe", en: 'Team travel' },
    hint: { fr: 'Qui voyage comment et quand (vol, train, voiture), aller et retour.', en: 'Who travels how and when (flight, train, car), outbound and return.' } },
  { key: 'trucks', group: 'logistics', kind: 'bookings', detect: 'records', lead: { from: 'install', days: 14 },
    label: { fr: 'Camions : quel camion arrive quand ?', en: 'Trucks: which truck arrives when?' },
    hint: { fr: 'Pour chaque camion : chargement, arrivée sur site (date + heure), plaque, chauffeur et téléphone si connus.', en: 'For each truck: loading, arrival on site (date + time), plate, driver and phone if known.' } },
  { key: 'hotels', group: 'logistics', kind: 'bookings', detect: 'records', lead: { from: 'install', days: 21 },
    label: { fr: "Hôtel de l'équipe", en: 'Team hotel' },
    hint: { fr: "Nom et adresse de l'hôtel, arrivée / départ, n° de réservation.", en: 'Hotel name and address, check-in / check-out, booking number.' } },
  { key: 'siteContact', group: 'notes', kind: 'text', detect: 'none', lead: { from: 'install', days: 7 },
    label: { fr: 'Contact sur place (nom, téléphone)', en: 'On-site contact (name, phone)' } },
  { key: 'siteAccess', group: 'notes', kind: 'longtext', detect: 'none', lead: { from: 'install', days: 7 },
    label: { fr: 'Accès au site, horaires, déchargement', en: 'Site access, opening hours, unloading' },
    hint: { fr: "Accès camions, quai de déchargement, horaires d'ouverture, badges, parking…", en: 'Truck access, unloading dock, opening hours, badges, parking…' } },
  { key: 'dismantleInfo', group: 'notes', kind: 'longtext', detect: 'none', lead: { from: 'install', days: 7 },
    label: { fr: 'Infos pour le démontage', en: 'Dismantling information' } },
  { key: 'custom', group: 'custom', kind: 'longtext', detect: 'none', lead: { from: 'install', days: 14 },
    label: { fr: 'Question libre', en: 'Question' } },
];

export const GROUP_LABELS: Record<FieldGroup, Record<Lang, string>> = {
  site: { fr: '📍 Lieu', en: '📍 Site' },
  dates: { fr: '📅 Dates', en: '📅 Dates' },
  team: { fr: '👥 Équipe', en: '👥 Team' },
  logistics: { fr: '🚛 Logistique', en: '🚛 Logistics' },
  notes: { fr: '📝 Infos pratiques', en: '📝 Practical information' },
  custom: { fr: '❓ Questions libres', en: '❓ Other questions' },
};

export function fieldOf(key: string): InfoField | undefined {
  return INFO_FIELDS.find(f => f.key === key);
}

// ─── Texte ───────────────────────────────────────────────────────────────

export function deaccent(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}
export function norm(s: string): string {
  return deaccent(s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

/** Libellé de la question tel qu'il apparaît dans le modèle (avec le format attendu, sans « : » à l'intérieur). */
export function templateLabel(label: string, kind: FieldKind, lang: Lang): string {
  const fmt = FORMAT[kind]?.[lang];
  return fmt ? `${label} (${fmt})` : label;
}
const FORMAT: Partial<Record<FieldKind, Record<Lang, string>>> = {
  date: { fr: 'JJ/MM/AAAA, heure si connue', en: 'DD/MM/YYYY, time if known' },
  number: { fr: 'nombre', en: 'number' },
  names: { fr: 'noms séparés par des virgules', en: 'names separated by commas' },
};

// ─── Référence ───────────────────────────────────────────────────────────

const REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** INFO-XXXXXX à partir d'octets aléatoires (crypto côté service). */
export function refFromBytes(bytes: ArrayLike<number>): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += REF_ALPHABET[(bytes[i] ?? 0) % REF_ALPHABET.length];
  return `INFO-${s}`;
}
const REF_RE = /\bINFO-([A-HJ-KM-NP-Z2-9]{6})\b/i;
/** Référence trouvée dans un texte (sujet, corps), en majuscules. */
export function findRef(...texts: Array<string | null | undefined>): string | null {
  for (const t of texts) {
    const m = REF_RE.exec(String(t || ''));
    if (m) return `INFO-${m[1].toUpperCase()}`;
  }
  return null;
}

// ─── Modèle de réponse ───────────────────────────────────────────────────

export interface TemplateItem { number: number; label: string; kind: FieldKind }

const T_HEAD: Record<Lang, (ref: string) => string> = {
  fr: ref => `----- RÉPONSES VEM · réf. ${ref} -----`,
  en: ref => `----- VEM ANSWERS · ref. ${ref} -----`,
};
const T_END: Record<Lang, string> = { fr: '----- FIN -----', en: '----- END -----' };

/** Lignes du modèle à remplir (mail + bouton « Répondre par mail »). Rien n'est écrit après « : » : la réponse vient là. */
export function templateLines(items: TemplateItem[], ref: string, lang: Lang): string[] {
  const out = [T_HEAD[lang](ref)];
  for (const it of items) {
    out.push(`[${it.number}] ${templateLabel(it.label, it.kind, lang)} :`);
    out.push('');
  }
  out.push(T_END[lang]);
  return out;
}

// ─── Lecture d'une réponse ───────────────────────────────────────────────

export interface ParseItem { number: number; label: string; kind: FieldKind }
export interface ParsedReply {
  /** numéro de question → réponse brute (première réponse non vide trouvée) */
  answers: Map<number, string>;
  /** ce que la personne a écrit elle-même (avant la citation du mail d'origine) */
  userText: string;
}

const MARKER_RE = /^\[(\d{1,2})\]\s*(.*)$/;
// « 1 : … », « 1) … », « 1. … », « 1 - … », « Q1 : … » — pas « 12.11.2026 » ni « 12/11 »
const PLAIN_RE = /^(?:q\s*)?(\d{1,2})\s*(?::|\)|\.\s|-\s|–\s)\s*(.*)$/i;
const QUOTE_HEADER_RES = [
  /(a écrit|a ecrit|wrote|schrieb|heeft geschreven|schreef)\s*:\s*$/i,
  /^-{2,}\s*(original message|message d'origine|ursprüngliche nachricht|oorspronkelijk bericht|forwarded message|message transféré)/i,
  /^_{8,}\s*$/,
  /^(de|from|von|van)\s?:\s.+/i,
  /^(envoyé|sent|gesendet|verzonden)\s?:\s/i,
];
// formule de politesse seule sur sa ligne (« Cordialement, », « Best regards, Tao ») ou « Envoyé de mon iPhone »
const SIGNATURE_RE = /^(?:(?:cordialement|bien (?:à|a) (?:vous|toi)|bonne (?:journée|journee|soirée|soiree)|best regards|kind regards|regards|best|met vriendelijke groet(?:en)?|mvg|groeten|mit freundlichen grüßen|merci(?: beaucoup)?|thanks?(?: you)?)\s*(?:[,!.]\s*(?:\S+\s*){0,3})?|(?:envoyé de mon|envoye de mon|sent from my|get outlook)\b.*)$/i;

function isQuoteHeader(line: string): boolean {
  return QUOTE_HEADER_RES.some(r => r.test(line.trim()));
}
function isStopLine(line: string): boolean {
  const t = line.trim();
  return /^-{2,}/.test(t) || isQuoteHeader(t) || SIGNATURE_RE.test(t);
}

const wordsOf = (s: string) => s.split(/\s+/).filter(Boolean);
const wordKey = (w: string) => deaccent(w).toLowerCase();
/** Retire les k premiers mots d'un texte en gardant le reste tel quel (retours à la ligne compris). */
function dropWords(s: string, k: number): string {
  return k > 0 ? s.replace(new RegExp(`^\\s*(?:\\S+\\s+){${k - 1}}\\S+`), '') : s;
}

/**
 * Enlève le libellé recopié (« Adresse de montage (format) : ») devant la réponse. Comparaison mot à mot, sur
 * toutes les lignes de la réponse : un libellé coupé en deux lignes par le logiciel mail est aussi retiré.
 * Ce qui ressemble encore à un libellé (« … : » sans chiffre ni rien après) n'est pas une réponse.
 */
export function stripLabel(rest: string, item: ParseItem | undefined, lang: Lang | null = null): string {
  let r = rest.trim();
  if (item) {
    const candidates = new Set<string>();
    for (const l of (lang ? [lang] : ['fr', 'en'] as Lang[])) candidates.add(templateLabel(item.label, item.kind, l));
    candidates.add(item.label);
    const tw = wordsOf(r);
    for (const c of [...candidates].sort((a, b) => b.length - a.length)) {
      const cw = wordsOf(c).map(wordKey);
      if (!cw.length) continue;
      let k = 0;
      while (k < cw.length && k < tw.length && wordKey(tw[k]) === cw[k]) k++;
      if (k === cw.length && (k === tw.length || /^[:(]/.test(tw[k]))) { r = dropWords(r, k).trim(); break; }
      if (k > 0 && k === tw.length) return ''; // le texte n'est que le début du libellé
    }
  }
  if (r.startsWith('(')) {
    const close = r.indexOf(')');
    if (close > 0 && close < 120) r = r.slice(close + 1).trim();
  }
  if (r.startsWith(':')) r = r.slice(1).trim();
  else {
    // libellé un peu modifié : « Adresse : Rue X » → ce qui suit le premier « : » si l'avant ne contient pas de chiffre
    const idx = r.indexOf(':');
    if (idx > 0 && idx <= 80 && !/\d/.test(r.slice(0, idx))) {
      const before = norm(r.slice(0, idx));
      const words = norm(item?.label || '').split(' ').filter(w => w.length > 3);
      if (words.some(w => before.includes(w))) r = r.slice(idx + 1).trim();
    }
  }
  // reste d'un libellé (« Hôtel de l'équipe : », « virgules) : ») : pas une réponse
  if (/^[^\d\n]{0,120}:$/.test(r)) return '';
  return r;
}

/** Lit les réponses d'un mail. `items` = toutes les questions de la demande (numéros stables). */
export function parseReply(text: string, items: ParseItem[]): ParsedReply {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const byNum = new Map(items.map(i => [i.number, i]));
  // fin du texte écrit par la personne : première citation (« > ») ou premier en-tête « … a écrit : »
  let userEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*>/.test(lines[i]) || isQuoteHeader(lines[i])) {
      userEnd = i;
      // en-tête sur deux lignes : « Le mar. 28 oct. 2026 à 10:00, VEM < » + « x@y> a écrit : »
      if (i > 0 && /^(le|on|am|op)\s/i.test(lines[i - 1].trim()) && !/:\s*$/.test(lines[i - 1])) userEnd = i - 1;
      break;
    }
  }

  const answers = new Map<number, string>();
  let cur: { num: number; quoted: boolean; plain: boolean; hadContent: boolean } | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (cur && !answers.has(cur.num)) {
      const v = stripLabel(buf.join('\n'), byNum.get(cur.num)).replace(/\n{3,}/g, '\n\n').trim();
      if (v) answers.set(cur.num, v);
    }
    cur = null;
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const quoted = /^\s*>/.test(raw);
    const clean = raw.replace(/^(\s*>)+\s?/, '').replace(/ /g, ' ');
    const t = clean.trim();

    const m = MARKER_RE.exec(t);
    if (m && byNum.has(Number(m[1]))) {
      flush();
      const n = Number(m[1]);
      cur = { num: n, quoted, plain: false, hadContent: false };
      buf = [m[2]];
      continue;
    }
    // numéros simples seulement dans le texte écrit par la personne, et pas au milieu d'une réponse « [n] »
    // (une liste « 1. camion A / 2. camion B » reste la réponse en cours)
    if (i < userEnd && !quoted && !(cur && !cur.plain)) {
      const p = PLAIN_RE.exec(t);
      if (p && byNum.has(Number(p[1]))) {
        flush();
        const n = Number(p[1]);
        const first = stripLabel(p[2], byNum.get(n));
        cur = { num: n, quoted: false, plain: true, hadContent: !!first };
        buf = [p[2]];
        continue;
      }
    }
    if (!cur) continue;
    const c = cur as { num: number; quoted: boolean; plain: boolean; hadContent: boolean };
    if (isStopLine(t) || (quoted && !c.quoted)) { flush(); continue; }
    if (c.plain) {
      // « 1 : Rue X » = une ligne ; « 1 : » seul = les lignes suivantes jusqu'à une ligne vide
      if (c.hadContent || (!t && buf.join('').trim())) { flush(); continue; }
      if (t) buf.push(t);
      continue;
    }
    buf.push(t);
  }
  flush();

  const userText = lines.slice(0, userEnd).join('\n').trim();
  return { answers, userText };
}

/** Texte écrit par la personne, sans la citation du mail d'origine (pour l'IA). */
export function stripQuoted(text: string): string {
  return parseReply(text, []).userText;
}

/** « ? », « je ne sais pas », « pas encore »… : la question reste en attente. */
export function isNonAnswer(v: string): boolean {
  const t = norm(v).replace(/[.!…]+$/, '').trim();
  if (!t) return true;
  return /^(\?+|-+|\.+|x|nsp|tbc|tbd|tba|inconnu|unknown|pas encore( connu| sur)?|pas encore d'?info|je ne sais pas( encore)?|on ne sait pas( encore)?|je sais pas|sais pas|aucune idee|pas d'?info|not yet|not known yet|don'?t know( yet)?|i don'?t know( yet)?|no idea|a confirmer|to be confirmed|later|plus tard|bientot|soon|nog niet|weet ik niet)$/.test(t);
}
/** « N/A », « aucun », « pas besoin » : répondu, mais rien à remplir. */
export function isNotApplicable(v: string): boolean {
  const t = norm(v).replace(/[.!…]+$/, '').trim();
  return /^(n\/?a|non applicable|not applicable|aucun|aucune|pas besoin|pas (?:de |d')[^\s\d]+(?: [^\s\d]+)?|pas concerne|none|no|non|nvt|niet van toepassing|nothing|rien)$/.test(t);
}

// ─── Heure de Bruxelles ──────────────────────────────────────────────────

const DTF = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short',
});
export interface ZParts { y: number; mo: number; d: number; h: number; mi: number; wd: number }
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export function zParts(date: Date): ZParts {
  const p: Record<string, string> = {};
  for (const x of DTF.formatToParts(date)) p[x.type] = x.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, wd: WD[p.weekday] ?? 0 };
}
function offsetAt(t: number): number {
  const p = zParts(new Date(t));
  const asUtc = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi);
  return Math.round((asUtc - Math.floor(t / 60000) * 60000) / 60000) * 60000;
}
/** Date/heure locale de Bruxelles → instant. */
export function zoned(y: number, mo: number, d: number, h = 0, mi = 0): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let r = guess - offsetAt(guess);
  const off2 = offsetAt(r);
  if (guess - off2 !== r) r = guess - off2;
  return new Date(r);
}
const pad = (n: number) => String(n).padStart(2, '0');
/** 12/11/2026 (+ « à 08:30 » / « 08:30 » si l'heure n'est pas minuit). */
export function fmtDate(date: Date | string | null | undefined, lang: Lang = 'fr', withTime: 'auto' | boolean = 'auto'): string {
  if (!date) return '';
  const dt = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(dt.getTime())) return '';
  const p = zParts(dt);
  const day = `${pad(p.d)}/${pad(p.mo)}/${p.y}`;
  const showTime = withTime === 'auto' ? (p.h !== 0 || p.mi !== 0) : withTime;
  if (!showTime) return day;
  return lang === 'fr' ? `${day} à ${pad(p.h)}:${pad(p.mi)}` : `${day} ${pad(p.h)}:${pad(p.mi)}`;
}

// ─── Dates dans une réponse ──────────────────────────────────────────────

const MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1, january: 1, januar: 1, januari: 1,
  fevrier: 2, fevr: 2, fev: 2, february: 2, februar: 2, februari: 2, feb: 2,
  mars: 3, march: 3, marz: 3, maart: 3, mar: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5, mei: 5,
  juin: 6, june: 6, juni: 6, jun: 6,
  juillet: 7, juil: 7, july: 7, juli: 7, jul: 7,
  aout: 8, august: 8, augustus: 8, aug: 8,
  septembre: 9, september: 9, sept: 9, sep: 9,
  octobre: 10, october: 10, oktober: 10, oct: 10, okt: 10,
  novembre: 11, november: 11, nov: 11,
  decembre: 12, december: 12, dezember: 12, dec: 12, dez: 12,
};
function monthOf(word: string): number | null {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (MONTHS[w]) return MONTHS[w];
  if (w.length >= 3) for (const [k, v] of Object.entries(MONTHS)) if (k.startsWith(w) && w.length >= 3 && k.length >= w.length) return v;
  return null;
}
const daysIn = (y: number, mo: number) => new Date(Date.UTC(y, mo, 0)).getUTCDate();

export interface ParsedDate { date: Date; hasTime: boolean; iso: string }

/** Lit une date (et une heure) dans une réponse. Sans année : la prochaine occurrence. Null si pas de date claire. */
export function parseDateAnswer(text: string, now: Date = new Date()): ParsedDate | null {
  const src = deaccent(String(text || '')).toLowerCase().replace(/ /g, ' ');
  let y: number | null = null, mo: number | null = null, d: number | null = null;
  let rest = src;

  const iso = /(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ](\d{1,2}):(\d{2}))?/.exec(src);
  const num = /(?<![\d/.\-])(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{4}|\d{2}))?(?![\d/])/.exec(src);
  const dm = /(?<!\d)(\d{1,2})(?:er|st|nd|rd|th|e)?\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?/.exec(src);
  const md = /\b([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?!\d)/.exec(src);

  if (iso) {
    y = +iso[1]; mo = +iso[2]; d = +iso[3];
    rest = src.replace(iso[0], ' ');
    if (iso[4]) {
      const h = +iso[4], mi = +iso[5];
      if (h <= 23 && mi <= 59 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo)) {
        const date = zoned(y, mo, d, h, mi);
        return { date, hasTime: true, iso: date.toISOString() };
      }
    }
  } else if (num) {
    d = +num[1]; mo = +num[2];
    if (num[3]) y = num[3].length === 2 ? 2000 + +num[3] : +num[3];
    rest = src.replace(num[0], ' ');
  } else if (dm && monthOf(dm[2])) {
    d = +dm[1]; mo = monthOf(dm[2]); if (dm[3]) y = +dm[3];
    rest = src.replace(dm[0], ' ');
  } else if (md && monthOf(md[1])) {
    mo = monthOf(md[1]); d = +md[2]; if (md[3]) y = +md[3];
    rest = src.replace(md[0], ' ');
  } else return null;

  if (!mo || !d || mo < 1 || mo > 12 || d < 1) return null;
  const today = zParts(now);
  if (!y) {
    y = today.y;
    if (d > daysIn(y, mo)) return null;
    // déjà passé de plus de 2 mois → l'année prochaine
    if (zoned(y, mo, d).getTime() < now.getTime() - 60 * DAY) y += 1;
  }
  if (y < 2000 || y > 2100 || d > daysIn(y, mo)) return null;

  // heure : « 8h », « 8h30 », « 08:30 », « 14 h », « 2pm »
  let h = 0, mi = 0, hasTime = false;
  const t1 = /(?<![\d/])(\d{1,2})\s*(?:h(?:eures?)?(?![a-z])|:)\s*(\d{2})?(?!\d)/.exec(rest);
  const t2 = /(?<![\d/])(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/.exec(rest);
  if (t2) {
    h = (+t2[1] % 12) + (t2[3] === 'pm' ? 12 : 0); mi = t2[2] ? +t2[2] : 0; hasTime = true;
  } else if (t1) {
    h = +t1[1]; mi = t1[2] ? +t1[2] : 0; hasTime = true;
  }
  if (h > 23 || mi > 59) { h = 0; mi = 0; hasTime = false; }
  const date = zoned(y, mo, d, h, mi);
  return { date, hasTime, iso: date.toISOString() };
}

// ─── Valeur d'une réponse ────────────────────────────────────────────────

export type Normalized =
  | { status: 'ok'; value: string; display: string }
  | { status: 'empty' }
  | { status: 'na' }
  | { status: 'invalid'; reason: string };

export function normalizeAnswer(kind: FieldKind, raw: string, now: Date = new Date(), lang: Lang = 'fr'): Normalized {
  const v = String(raw || '').replace(/ /g, ' ').trim();
  if (isNonAnswer(v)) return { status: 'empty' };
  // « non » / « aucun » répond à une question libre (« Faut-il un badge ? ») : c'est la réponse, pas « non applicable »
  if (kind !== 'text' && kind !== 'longtext' && isNotApplicable(v)) return { status: 'na' };
  if (kind === 'date') {
    const p = parseDateAnswer(v, now);
    if (!p) return { status: 'invalid', reason: lang === 'fr' ? 'date non reconnue' : 'date not recognised' };
    return { status: 'ok', value: p.iso, display: fmtDate(p.date, lang) };
  }
  if (kind === 'number') {
    const m = /\d+/.exec(v);
    if (!m || +m[0] > 1000) return { status: 'invalid', reason: lang === 'fr' ? 'nombre non reconnu' : 'number not recognised' };
    return { status: 'ok', value: String(+m[0]), display: String(+m[0]) };
  }
  const text = v.slice(0, 4000);
  return { status: 'ok', value: text, display: text.length > 160 ? text.slice(0, 157) + '…' : text };
}

/** Noms d'une réponse « équipe » : « Norick, Tao et Jean-Pierre » → 3 noms. */
export function splitNames(v: string): string[] {
  return String(v || '')
    .split(/[,;\n/+]|\s+(?:et|and|en|und|&)\s+/i)
    .map(s => s.replace(/^[-•*\s]+|[.\s]+$/g, '').replace(/\(.*?\)/g, '').trim())
    .filter(s => s.length >= 2 && s.length <= 60);
}

// ─── Réponses automatiques / non-distribution ────────────────────────────

export function isAutoReply(subject: string, headers: Record<string, string>): boolean {
  const h = (k: string) => String(headers[k] || '').toLowerCase();
  if (h('auto-submitted') && h('auto-submitted') !== 'no') return true;
  if (h('x-autoreply') || h('x-autorespond') || h('x-auto-response-suppress').includes('all')) return true;
  if (/auto_reply|auto-reply/.test(h('precedence'))) return true;
  return /^\s*(automatic reply|réponse automatique|reponse automatique|auto(matische)?[ -]?(reply|antwort|answer)|out of (the )?office|absent|absence|abwesenheit|afwezig)/i.test(subject || '');
}
export function isBounce(from: string, subject: string): boolean {
  return /mailer-daemon|postmaster/i.test(from || '') || /^(undeliver|delivery status notification|non remis|échec de la remise|mail delivery failed|returned mail)/i.test(subject || '');
}

// ─── Rappels ─────────────────────────────────────────────────────────────

export interface ReminderPlan {
  /** urgency = selon la date « pour le » la plus proche ; fixed = toutes les intervalHours ; none = jamais */
  mode: 'urgency' | 'fixed' | 'none';
  intervalHours: number;
  firstAfterHours: number;
  skipWeekends: boolean;
  maxReminders: number;
}

export const DEFAULT_PLAN: ReminderPlan = { mode: 'urgency', intervalHours: 24, firstAfterHours: 24, skipWeekends: true, maxReminders: 20 };

export function cleanPlan(p: any): ReminderPlan {
  const mode = ['urgency', 'fixed', 'none'].includes(p?.mode) ? p.mode : DEFAULT_PLAN.mode;
  const num = (v: any, def: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  return {
    mode,
    intervalHours: num(p?.intervalHours, DEFAULT_PLAN.intervalHours, 2, 24 * 30),
    firstAfterHours: num(p?.firstAfterHours, DEFAULT_PLAN.firstAfterHours, 1, 24 * 14),
    skipWeekends: p?.skipWeekends === undefined ? DEFAULT_PLAN.skipWeekends : !!p.skipWeekends,
    maxReminders: Math.round(num(p?.maxReminders, DEFAULT_PLAN.maxReminders, 1, 100)),
  };
}

/** Intervalle « selon l'urgence » : > 7 j avant → 1 / semaine ; 7 → 2 j → 1 / jour ; < 2 j ou en retard → 2 / jour. */
export function urgencyInterval(remainingMs: number): number {
  if (remainingMs > 7 * DAY) return 7 * DAY;
  if (remainingMs > 2 * DAY) return DAY;
  return 6 * HOUR; // avec la fenêtre 8 h – 18 h, ça fait 2 rappels par jour
}

const WINDOW_START_H = 8;
const WINDOW_END_H = 18;

/** Ramène un instant dans la fenêtre d'envoi : 8 h – 18 h (Bruxelles), en semaine si skipWeekends. */
export function alignToWindow(t: Date, skipWeekends: boolean): Date {
  let cur = t;
  for (let guard = 0; guard < 10; guard++) {
    const p = zParts(cur);
    const weekend = skipWeekends && (p.wd === 0 || p.wd === 6);
    if (weekend) {
      const add = p.wd === 6 ? 2 : 1;
      const nd = new Date(Date.UTC(p.y, p.mo - 1, p.d + add));
      cur = zoned(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate(), WINDOW_START_H, 0);
      continue;
    }
    if (p.h < WINDOW_START_H) return zoned(p.y, p.mo, p.d, WINDOW_START_H, 0);
    if (p.h >= WINDOW_END_H) {
      const nd = new Date(Date.UTC(p.y, p.mo - 1, p.d + 1));
      cur = zoned(nd.getUTCFullYear(), nd.getUTCMonth() + 1, nd.getUTCDate(), WINDOW_START_H, 0);
      continue;
    }
    return cur;
  }
  return cur;
}

export interface ScheduleState {
  /** dernier envoi (mail initial ou rappel) ou dernière réponse, le plus récent */
  from: Date;
  remindersSent: number;
  /** date « pour le » la plus proche parmi les questions encore en attente */
  neededBy: Date | null;
}

/** Prochain rappel, ou null (aucun rappel / maximum atteint). */
export function nextReminderAt(plan: ReminderPlan, s: ScheduleState): Date | null {
  if (plan.mode === 'none' || s.remindersSent >= plan.maxReminders) return null;
  const from = s.from.getTime();
  const interval = plan.mode === 'fixed'
    ? plan.intervalHours * HOUR
    : (s.neededBy ? urgencyInterval(s.neededBy.getTime() - from) : DAY);
  let t = from + (s.remindersSent === 0 ? Math.min(plan.firstAfterHours * HOUR, interval) : interval);
  if (plan.mode === 'urgency' && s.neededBy) {
    // passage à un rythme plus serré (J-7, J-2) : un rappel au début du palier
    for (const b of [s.neededBy.getTime() - 7 * DAY, s.neededBy.getTime() - 2 * DAY]) {
      if (b > from + HOUR && b < t) t = b;
    }
  }
  return alignToWindow(new Date(t), plan.skipWeekends);
}

/** Les n prochains rappels si personne ne répond (aperçu dans VEM). */
export function simulateReminders(plan: ReminderPlan, start: Date, neededBy: Date | null, n = 12): Date[] {
  const out: Date[] = [];
  let from = start;
  for (let i = 0; i < Math.min(n, plan.maxReminders); i++) {
    const next = nextReminderAt(plan, { from, remindersSent: i, neededBy });
    if (!next) break;
    out.push(next);
    from = next;
  }
  return out;
}

/** Date « pour le » par défaut d'une info : X jours avant le montage, au moins demain. */
export function defaultNeededBy(field: InfoField, installationStart: Date | null, now: Date = new Date()): Date {
  const min = now.getTime() + DAY;
  let t: number;
  if (field.lead.from === 'install' && installationStart && installationStart.getTime() > now.getTime() + 2 * DAY) {
    t = installationStart.getTime() - field.lead.days * DAY;
  } else {
    t = now.getTime() + (field.lead.from === 'now' ? field.lead.days : Math.min(field.lead.days, 3)) * DAY;
  }
  const p = zParts(new Date(Math.max(t, min)));
  return zoned(p.y, p.mo, p.d, 12, 0);
}
