// src/services/chantierLogic.ts
// VEM Chantier (application des installateurs, /chantier) — logique pure, sans base de données (testée dans
// tests/chantierLogic.test.ts). Voir docs/installateurs/PROMPT_App_Chantier_Installateurs.md.

export const LANGS = ['fr', 'en', 'nl', 'pl'] as const;
export type Lang = typeof LANGS[number];
export const cleanLang = (v: unknown): Lang => (LANGS as readonly string[]).includes(String(v)) ? (v as Lang) : 'fr';

/** Rôles qui invitent les installateurs, désignent le chef d'équipe et prolongent l'accès (A. Pinchart 23.11.2026). */
export const DESIGNATOR_ROLES = ['admin', 'technical_manager', 'sales_engineer'];
/** Rôles qui peuvent se connecter avec téléphone + code (les autres gardent e-mail + mot de passe). */
export const PIN_ROLES = ['installer', 'worker'];

// ── téléphone / code ─────────────────────────────────────────────────────────
/** Clé de comparaison d'un numéro : les 9 derniers chiffres (+32 470 12 34 56 = 0470/12.34.56 = 470123456). */
export function phoneKey(raw: unknown): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  return d.length > 9 ? d.slice(-9) : d;
}

const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '9876']);
/** Code à 4 chiffres, pas trop évident. Rend un code d'erreur ou null. */
export function pinProblem(pin: unknown): null | 'format' | 'weak' {
  const s = String(pin ?? '');
  if (!/^\d{4}$/.test(s)) return 'format';
  if (WEAK_PINS.has(s)) return 'weak';
  return null;
}

// ── dates ────────────────────────────────────────────────────────────────────
/** AAAA-MM-JJ d'une date (fuseau de Bruxelles). */
export function brusselsYmd(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/** AAAA-MM-JJ d'une date de projet (stockée à minuit UTC). */
export const ymdOf = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString().slice(0, 10);
};
export const isYmd = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export function addDays(ymd: string, n: number): string {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface ProjectDates {
  installationStart: Date | string;
  installationEnd: Date | string;
  dismantlingStart?: Date | string | null;
  dismantlingEnd?: Date | string | null;
  siteDaysBefore?: number | null;
  siteDaysAfter?: number | null;
}

/** Période d'accès des installateurs : du début d'installation − N jours à la fin du démontage (ou de l'installation) + N jours. */
export function siteWindow(p: ProjectDates, defaults: { before: number; after: number }): { from: string; to: string; before: number; after: number } {
  const before = p.siteDaysBefore ?? defaults.before;
  const after = p.siteDaysAfter ?? defaults.after;
  const start = ymdOf(p.installationStart)!;
  const end = ymdOf(p.dismantlingEnd) || ymdOf(p.dismantlingStart) || ymdOf(p.installationEnd) || start;
  return { from: addDays(start, -before), to: addDays(end, after), before, after };
}

/** Phase du chantier un jour donné : démontage à partir du début du démontage, sinon installation. */
export function phaseOn(p: ProjectDates, ymd: string): 'installation' | 'dismantling' {
  const ds = ymdOf(p.dismantlingStart);
  return ds && ymd >= ds ? 'dismantling' : 'installation';
}

// ── fichiers visibles sur chantier ───────────────────────────────────────────
export const SITE_SECTIONS = ['plans', 'briefing', 'info', 'none'] as const;
export type SiteSection = typeof SITE_SECTIONS[number];

/** Rubrique effective d'un fichier : choix du bureau, sinon automatique (plans validés, briefing, planning). */
export function siteSectionOf(f: { siteSection?: string | null; fileName?: string | null; category?: string | null }): SiteSection {
  if (f.siteSection && (SITE_SECTIONS as readonly string[]).includes(f.siteSection)) return f.siteSection as SiteSection;
  return autoSiteSection(f);
}
export function autoSiteSection(f: { fileName?: string | null; category?: string | null }): SiteSection {
  const name = String(f.fileName || '');
  const pdf = /\.pdf$/i.test(name);
  if (pdf && /_VALIDE/i.test(name)) return 'plans';
  if (pdf && /briefing/i.test(name)) return 'briefing';
  if (f.category === 'planning') return 'info';
  return 'none';
}

/** Personnes qui ne voient pas un fichier (ids, sans doublon, 500 au plus). [] = toute l'équipe le voit. */
export function cleanHiddenFor(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    const id = String(v ?? '').trim();
    if (id && id.length <= 64 && !out.includes(id)) out.push(id);
    if (out.length >= 500) break;
  }
  return out;
}
/** Le fichier (déjà dans une rubrique chantier) est-il visible pour cette personne ? */
export function fileVisibleFor(f: { siteHiddenFor?: unknown }, userId: string): boolean {
  return !cleanHiddenFor(f.siteHiddenFor).includes(userId);
}
/** Masquer / montrer un fichier pour une personne : nouvelle liste des personnes qui ne le voient pas. */
export function withVisibility(hidden: unknown, userId: string, visible: boolean): string[] {
  const list = cleanHiddenFor(hidden).filter((id) => id !== userId);
  return visible ? list : [...list, userId];
}

// ── compteurs de quantités (modèles de tâches) ───────────────────────────────
export interface QuantityField { key: string; label: Partial<Record<Lang, string>>; unit?: string }
export interface Quantity { key: string; label: string; unit?: string; qty: number }

const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30);
const str = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Compteurs d'un modèle de tâche : 8 au plus, libellé français obligatoire, clé unique. null = aucun. */
export function cleanQuantityFields(raw: unknown): QuantityField[] | null {
  if (!Array.isArray(raw)) return null;
  const out: QuantityField[] = [];
  const keys = new Set<string>();
  for (const r of raw.slice(0, 8)) {
    if (!r || typeof r !== 'object') continue;
    const lab = (r as any).label;
    const label: Partial<Record<Lang, string>> = {};
    if (typeof lab === 'string') label.fr = str(lab, 40);
    else if (lab && typeof lab === 'object') for (const l of LANGS) { const v = str(lab[l], 40); if (v) label[l] = v; }
    if (!label.fr) continue;
    let key = slug(str((r as any).key, 30)) || slug(label.fr) || 'qte';
    let k = key, n = 2;
    while (keys.has(k)) k = `${key}-${n++}`;
    keys.add(k);
    const unit = str((r as any).unit, 20);
    out.push(unit ? { key: k, label, unit } : { key: k, label });
  }
  return out.length ? out : null;
}

/** Quantités saisies (une ligne de rapport / de feuille) : entiers 0–99 999, 8 au plus ; les lignes à 0 sont gardées (« aucune »). */
export function cleanQuantities(raw: unknown): Quantity[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Quantity[] = [];
  for (const r of raw.slice(0, 8)) {
    if (!r || typeof r !== 'object') continue;
    const label = str((r as any).label, 40);
    const key = slug(str((r as any).key, 30)) || slug(label);
    if (!key || !label) continue;
    const qty = Math.max(0, Math.min(99999, Math.round(Number((r as any).qty) || 0)));
    const unit = str((r as any).unit, 20);
    out.push(unit ? { key, label, unit, qty } : { key, label, qty });
  }
  return out.length ? out : null;
}

/** « 6 Viewbox · 10 vitres » (quantités > 0 seulement). */
export function quantitiesText(q: Quantity[] | null | undefined): string {
  return (q || []).filter((x) => x.qty > 0).map((x) => `${x.qty} ${x.label}${x.unit ? ' ' + x.unit : ''}`).join(' · ');
}

// ── feuille de temps ─────────────────────────────────────────────────────────
export interface Photo { url: string; publicId?: string }
export interface TimesheetLine {
  id: string;
  taskId?: string | null;
  taskTemplateId?: string | null;
  title: string;
  hours: number;      // durée de la tâche (h)
  workers: number;    // nombre de gars
  quantities?: Quantity[] | null;
  comment?: string;
  commentLang?: Lang;
  commentFr?: string | null;
  photos?: Photo[];
  done?: boolean;     // tâche du projet terminée
  newTask?: boolean;  // tâche ajoutée sur chantier (créée dans le projet à la validation)
}
export interface Present { userId?: string | null; name: string }

const idOf = (v: unknown) => (typeof v === 'string' && /^[\w-]{1,40}$/.test(v) ? v : null);
const randomId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Durée : entre 0 et 24 h, au quart d'heure. */
export const cleanHours = (v: unknown) => Math.max(0, Math.min(24, Math.round((Number(v) || 0) * 4) / 4));
export const cleanWorkers = (v: unknown) => Math.max(0, Math.min(99, Math.round(Number(v) || 0)));

/**
 * Lignes reçues du téléphone ou du bureau. La traduction française déjà faite est gardée si le commentaire
 * n'a pas changé (`prev` = lignes enregistrées) ; les champs inconnus sont ignorés.
 */
export function cleanLines(raw: unknown, prev: TimesheetLine[] = [], lang: Lang = 'fr'): TimesheetLine[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(prev.map((l) => [l.id, l]));
  const out: TimesheetLine[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 40)) {
    if (!r || typeof r !== 'object') continue;
    const x = r as any;
    const title = str(x.title, 200);
    if (!title) continue;
    let id = idOf(x.id) || randomId();
    if (seen.has(id)) id = randomId();
    seen.add(id);
    const old = byId.get(id);
    const comment = String(x.comment ?? '').trim().slice(0, 2000);
    const commentLang = x.commentLang ? cleanLang(x.commentLang) : (old?.commentLang || lang);
    const photos: Photo[] = (Array.isArray(x.photos) ? x.photos : []).slice(0, 10)
      .filter((p: any) => p && typeof p.url === 'string' && /^https:\/\//.test(p.url) && p.url.length < 1000)
      .map((p: any) => (p.publicId ? { url: p.url, publicId: String(p.publicId).slice(0, 300) } : { url: p.url }));
    const line: TimesheetLine = {
      id,
      taskId: idOf(x.taskId),
      taskTemplateId: idOf(x.taskTemplateId),
      title,
      hours: cleanHours(x.hours),
      workers: cleanWorkers(x.workers),
      quantities: cleanQuantities(x.quantities),
      comment,
      commentLang,
      commentFr: comment && old && old.comment === comment ? (old.commentFr ?? null) : (commentLang === 'fr' ? comment || null : null),
      photos,
      done: x.done === true,
      newTask: !x.taskId && !x.taskTemplateId ? (x.newTask !== false) : false,
    };
    // tâche créée dans le projet lors d'une validation précédente : on garde son id
    if (old?.taskId && old.newTask && !line.taskId) { line.taskId = old.taskId; line.newTask = true; }
    out.push(line);
  }
  return out;
}

export function cleanPresent(raw: unknown): Present[] {
  if (!Array.isArray(raw)) return [];
  const out: Present[] = [];
  const seen = new Set<string>();
  for (const r of raw.slice(0, 60)) {
    if (!r || typeof r !== 'object') continue;
    const name = str((r as any).name, 80);
    const userId = idOf((r as any).userId);
    if (!name && !userId) continue;
    const k = userId || 'n:' + name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(userId ? { userId, name: name || '?' } : { name });
  }
  return out;
}

/** Total de la journée : Σ durée × gars (heures-hommes) et Σ durées. */
export function sheetTotals(lines: TimesheetLine[]): { manHours: number; hours: number; tasks: number } {
  return {
    manHours: Math.round(lines.reduce((s, l) => s + l.hours * l.workers, 0) * 100) / 100,
    hours: Math.round(lines.reduce((s, l) => s + l.hours, 0) * 100) / 100,
    tasks: lines.length,
  };
}

// ── validation : le niveau juste au-dessus (A. Pinchart 23.11.2026) ──────────
export type FilledRole = 'crew_lead' | 'site_manager';

/** Rôle de celui qui remplit : un site manager reste site manager même s'il est coché chef d'équipe. */
export const filledRoleOf = (userRole: string): FilledRole => (userRole === 'site_manager' ? 'site_manager' : 'crew_lead');

/**
 * Peut valider ? Feuille du chef d'équipe → site manager du projet (ou technical manager / sales engineer) ;
 * feuille du site manager → technical manager ou sales engineer ; l'admin toujours ; jamais sa propre feuille.
 */
export function canValidate(o: { validatorId: string; validatorRole: string; filledById: string; filledRole: FilledRole; isProjectSiteManager: boolean }): boolean {
  if (o.validatorId === o.filledById) return false;
  if (o.validatorRole === 'admin') return true;
  if (o.validatorRole === 'technical_manager' || o.validatorRole === 'sales_engineer') return true;
  if (o.filledRole === 'crew_lead' && o.validatorRole === 'site_manager' && o.isProjectSiteManager) return true;
  return false;
}

/** Statuts : brouillon → envoyée → validée (ou renvoyée « à corriger », qui se remplit puis se renvoie). */
export const SHEET_STATUSES = ['draft', 'submitted', 'returned', 'validated'] as const;
export type SheetStatus = typeof SHEET_STATUSES[number];
/** Le chef peut encore modifier tant que ce n'est pas validé. */
export const fillerCanEdit = (status: string) => status !== 'validated';
