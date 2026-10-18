// src/services/roofCheckRules.ts
// Contrôle des jonctions de toiture : règles pures (pas de Prisma), partagées par src/routes/roofChecks.ts
// et src/services/roofCheckService.ts, testées par scripts/test-roofcheck.ts.
//   - cleanRoofConfig : lecture tolérante de roof_checks.config ;
//   - checkPointUpdate : statut / commentaire / tâches d'un point (OK = toutes les tâches + la photo) ;
//   - parentSummary : statut et commentaire du point « roofmap » de la check-list ;
//   - planPublish : correspondance des points à la publication (clé, archivage, jamais de suppression).
import { ROOF_POINT_TYPES, RoofPointType, RoofTask, cleanTask } from './roofCheckLibrary';

export const ROOF_STATUSES = ['pending', 'ok', 'partial', 'nok', 'na'] as const;
export type RoofStatus = typeof ROOF_STATUSES[number];
export const ROOF_COMMENT_REQUIRED: RoofStatus[] = ['partial', 'nok', 'na'];
export const ROOF_STATUS_LABELS: Record<RoofStatus, string> = {
  pending: 'À faire', ok: 'OK', partial: 'Partiel', nok: 'Non fait', na: 'N.A.',
};

/** Libellé et catégorie du point « roofmap » ajouté à la check-list d'installation. */
export const ROOFMAP_LABEL = '💧 Plan de contrôle des jonctions de toiture';
export const ROOFMAP_CATEGORY = 'Joints et étanchéité entre boxes';
export const GENERIC_NA_COMMENT = 'Contrôlé sur le plan de toiture';
export const NOT_PUBLISHED_COMMENT = 'Plan de toiture pas encore préparé.';
export const DISABLED_COMMENT = 'Contrôle des jonctions de toiture désactivé pour ce projet.';

export interface RoofTolerances {
  gapMaxMm: number;
  minOverlapMm: number;
  nodeMergeMm: number;
  coverMarginMm: number;
  heightStepMm: number;
  angleDeg: number;
}

export const DEFAULT_TOLERANCES: RoofTolerances = {
  gapMaxMm: 60, minOverlapMm: 200, nodeMergeMm: 50, coverMarginMm: 100, heightStepMm: 50, angleDeg: 1,
};

export interface RoofCheckConfig {
  v: 1;
  /** bloque le lien de signature du handover tant que pas clos ; null = pas encore choisi (non bloquant) */
  critical: boolean | null;
  /** niveaux contrôlés ([] = tous) */
  levels: number[];
  types: Record<RoofPointType, boolean>;
  /** tâches de chaque type pour ce projet (absentes = celles de la bibliothèque) */
  tasks: Partial<Record<RoofPointType, RoofTask[]>>;
  photo: { mode: 'per-point' | 'per-task'; min: number };
  /** points sous un étage supérieur à contrôler aussi (réponse d'Amaury 18.10.2026 : oui) */
  includeCovered: boolean;
  installersCanFill: boolean;
  fieldPoints: boolean;
  replaceGenericItems: boolean;
  tolerances: RoofTolerances;
  background: { source: 'auto' | 'view' | 'customView' | 'sheet'; style: 'plan' | 'schema'; ref?: Record<string, string> };
}

const BACKGROUND_SOURCES = ['auto', 'view', 'customView', 'sheet'] as const;

function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

/** Config d'un contrôle toiture, valeurs par défaut = réponses d'Amaury en R0 (tous les types, toits sous étage compris). */
export function cleanRoofConfig(raw: any): RoofCheckConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const types = {} as Record<RoofPointType, boolean>;
  for (const t of ROOF_POINT_TYPES) types[t] = r.types?.[t] === undefined ? true : r.types[t] === true;
  const tasks: Partial<Record<RoofPointType, RoofTask[]>> = {};
  if (r.tasks && typeof r.tasks === 'object') {
    for (const t of ROOF_POINT_TYPES) {
      if (!Array.isArray(r.tasks[t])) continue;
      const seen = new Set<string>();
      tasks[t] = r.tasks[t].map(cleanTask).filter((x: RoofTask | null): x is RoofTask => !!x && !seen.has(x.key) && !!seen.add(x.key));
    }
  }
  const tol = r.tolerances && typeof r.tolerances === 'object' ? r.tolerances : {};
  const bg = r.background && typeof r.background === 'object' ? r.background : {};
  const ref: Record<string, string> = {};
  if (bg.ref && typeof bg.ref === 'object') for (const [k, v] of Object.entries(bg.ref)) if (typeof v === 'string') ref[k.slice(0, 50)] = v.slice(0, 200);
  return {
    v: 1,
    critical: r.critical === true ? true : r.critical === false ? false : null,
    levels: Array.isArray(r.levels) ? [...new Set<number>(r.levels.filter((l: unknown) => Number.isInteger(l) && (l as number) >= 0 && (l as number) < 50))].sort((a, b) => a - b) : [],
    types,
    tasks,
    photo: { mode: r.photo?.mode === 'per-task' ? 'per-task' : 'per-point', min: Math.round(num(r.photo?.min, 1, 0, 10)) },
    includeCovered: r.includeCovered !== false,
    installersCanFill: r.installersCanFill === true,
    fieldPoints: r.fieldPoints !== false,
    replaceGenericItems: r.replaceGenericItems !== false,
    tolerances: {
      gapMaxMm: num(tol.gapMaxMm, DEFAULT_TOLERANCES.gapMaxMm, 0, 300),
      minOverlapMm: num(tol.minOverlapMm, DEFAULT_TOLERANCES.minOverlapMm, 0, 3000),
      nodeMergeMm: num(tol.nodeMergeMm, DEFAULT_TOLERANCES.nodeMergeMm, 1, 500),
      coverMarginMm: num(tol.coverMarginMm, DEFAULT_TOLERANCES.coverMarginMm, 0, 1000),
      heightStepMm: num(tol.heightStepMm, DEFAULT_TOLERANCES.heightStepMm, 0, 1000),
      angleDeg: num(tol.angleDeg, DEFAULT_TOLERANCES.angleDeg, 0, 10),
    },
    background: {
      source: (BACKGROUND_SOURCES as readonly string[]).includes(bg.source) ? bg.source : 'auto',
      style: bg.style === 'plan' ? 'plan' : 'schema',
      ...(Object.keys(ref).length ? { ref } : {}),
    },
  };
}

/** Tâches cochées lues d'un JSON : seulement les clés des tâches du point, valeurs booléennes. */
export function cleanTasksDone(raw: any, tasks: RoofTask[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const t of tasks) out[t.key] = src[t.key] === true;
  return out;
}

// ─── Statut d'un point ───

export interface PointState {
  status: string;
  comment: string | null;
  tasks: RoofTask[];
  tasksDone: Record<string, boolean>;
  minPhotos: number;
}

export interface PointUpdateInput {
  status?: unknown;
  comment?: unknown;
  tasksDone?: unknown;
}

export type PointUpdateResult =
  | { ok: true; status: RoofStatus; comment: string | null; tasksDone: Record<string, boolean>; statusChanged: boolean }
  | { ok: false; error: string };

function cleanComment(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 2000) : null;
}

/** Preuves manquantes pour passer un point OK (tâches non cochées, photos). [] = OK possible. */
export function missingProof(p: { tasks: RoofTask[]; minPhotos: number }, done: Record<string, boolean>, photos: Array<{ taskKey?: string | null }>, mode: 'per-point' | 'per-task'): string[] {
  const out: string[] = [];
  const undone = p.tasks.filter((t) => !done[t.key]);
  if (undone.length) out.push(`coche ${undone.length === 1 ? 'la tâche' : 'les tâches'} : ${undone.map((t) => t.label).join(' ; ')}`);
  if (mode === 'per-task') {
    const without = p.tasks.filter((t) => t.photo && !photos.some((ph) => ph.taskKey === t.key));
    if (without.length) out.push(`photo de : ${without.map((t) => t.label).join(' ; ')}`);
  }
  if (photos.length < p.minPhotos) out.push(p.minPhotos <= 1 ? 'prends au moins 1 photo' : `prends au moins ${p.minPhotos} photos (${photos.length} pour l’instant)`);
  return out;
}

/**
 * Nouveau statut / commentaire / tâches d'un point, mêmes règles que la check-list :
 * commentaire obligatoire pour Partiel / Non fait / N.A. ; « OK » seulement avec toutes les tâches cochées et la photo.
 */
export function checkPointUpdate(p: PointState, input: PointUpdateInput, photos: Array<{ taskKey?: string | null }>, mode: 'per-point' | 'per-task'): PointUpdateResult {
  const status = (input.status === undefined ? p.status : String(input.status)) as RoofStatus;
  if (!(ROOF_STATUSES as readonly string[]).includes(status)) return { ok: false, error: `Statut invalide : ${status}` };
  const comment = input.comment === undefined ? p.comment : cleanComment(input.comment);
  if (input.tasksDone !== undefined && (input.tasksDone === null || typeof input.tasksDone !== 'object' || Array.isArray(input.tasksDone)))
    return { ok: false, error: 'tasksDone doit être un objet { tâche: true/false }' };
  const tasksDone = input.tasksDone === undefined ? cleanTasksDone(p.tasksDone, p.tasks) : cleanTasksDone({ ...p.tasksDone, ...(input.tasksDone as object) }, p.tasks);
  if (ROOF_COMMENT_REQUIRED.includes(status) && !comment)
    return { ok: false, error: `Commentaire obligatoire pour « ${ROOF_STATUS_LABELS[status]} » : explique pourquoi.` };
  if (status === 'ok') {
    if (p.status === 'ok' && input.status === undefined && p.tasks.some((t) => p.tasksDone[t.key] && !tasksDone[t.key]))
      return { ok: false, error: 'Ce point est OK : passe-le en « Partiel » ou « À faire » avant de décocher une tâche.' };
    const missing = missingProof(p, tasksDone, photos, mode);
    if (missing.length) return { ok: false, error: `Pas encore OK : ${missing.join(' · ')}.` };
  }
  return { ok: true, status, comment, tasksDone, statusChanged: status !== p.status };
}

/** Suppression d'une photo : refusée si le point est OK et que la photo est nécessaire. Message ou null. */
export function photoDeleteBlock(p: { status: string; tasks: RoofTask[]; minPhotos: number; tasksDone: Record<string, boolean> }, photos: Array<{ id: string; taskKey?: string | null }>, photoId: string, mode: 'per-point' | 'per-task'): string | null {
  if (p.status !== 'ok') return null;
  const rest = photos.filter((ph) => ph.id !== photoId);
  return missingProof(p, p.tasksDone, rest, mode).length
    ? 'Ce point est OK et cette photo en est la preuve : ajoute une autre photo ou change son statut avant de la supprimer.'
    : null;
}

// ─── Point parent « roofmap » de la check-list ───

export interface SummaryPoint {
  code: string;
  status: string;
  covered: boolean;
  excluded: boolean;
  archived: boolean;
  order?: number;
}

export interface RoofSummary {
  status: RoofStatus;
  comment: string;
  total: number;
  pending: number;
  ok: number;
  partial: number;
  nok: number;
  na: number;
  /** points clos (OK + N.A.) */
  closed: number;
  /** Partiel + Non fait */
  problems: number;
}

/** Points qui comptent : ni archivés, ni retirés, ni couverts (sauf includeCovered). */
export function isActivePoint(p: { covered: boolean; excluded: boolean; archived: boolean }, includeCovered: boolean): boolean {
  return !p.archived && !p.excluded && (includeCovered || !p.covered);
}

function codesOf(points: SummaryPoint[], max = 8): string {
  const codes = points.map((p) => p.code);
  return codes.length > max ? `${codes.slice(0, max).join(', ')}…` : codes.join(', ');
}

/**
 * Statut du point parent : au moins un « à faire » ⇒ pending ; sinon un Non fait ⇒ nok ; sinon un Partiel ⇒ partial ;
 * sinon ok. Aucun point actif ⇒ na. Pas encore publié ⇒ pending « Plan de toiture pas encore préparé ».
 */
export function parentSummary(points: SummaryPoint[], includeCovered: boolean, published: boolean): RoofSummary {
  const active = points.filter((p) => isActivePoint(p, includeCovered)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.code.localeCompare(b.code));
  const s: RoofSummary = { status: 'pending', comment: '', total: active.length, pending: 0, ok: 0, partial: 0, nok: 0, na: 0, closed: 0, problems: 0 };
  for (const p of active) {
    const st = (ROOF_STATUSES as readonly string[]).includes(p.status) ? (p.status as RoofStatus) : 'pending';
    s[st]++;
  }
  s.closed = s.ok + s.na;
  s.problems = s.partial + s.nok;
  if (!published) { s.status = 'pending'; s.comment = NOT_PUBLISHED_COMMENT; return s; }
  if (!active.length) { s.status = 'na'; s.comment = 'Aucun point à contrôler sur le plan de toiture.'; return s; }
  s.status = s.pending ? 'pending' : s.nok ? 'nok' : s.partial ? 'partial' : 'ok';
  const parts: string[] = [];
  if (s.ok) parts.push(`${s.ok} OK`);
  if (s.na) parts.push(`${s.na} N.A.`);
  if (s.partial) parts.push(`${s.partial} partiel${s.partial > 1 ? 's' : ''} (${codesOf(active.filter((p) => p.status === 'partial'))})`);
  if (s.nok) parts.push(`${s.nok} non fait${s.nok > 1 ? 's' : ''} (${codesOf(active.filter((p) => p.status === 'nok'))})`);
  if (s.pending) parts.push(`${s.pending} à faire`);
  s.comment = `${parts.join(' · ')} — ${s.closed}/${s.total} points contrôlés sur le plan de toiture.`;
  return s;
}

// ─── Publication : correspondance des points ───

export interface ExistingPointRef { id: string; key: string; source: string; archived: boolean }
export interface IncomingPointRef { key: string; matchKey?: string | null }

export interface PublishPlan {
  /** point existant mis à jour (rekey = nouvelle clé si correspondance par proximité) */
  updates: Array<{ id: string; index: number; rekey: boolean; unarchive: boolean }>;
  /** index des points entrants à créer */
  creates: number[];
  /** ids archivés (photos et statut gardés) */
  archives: string[];
}

/**
 * Même clé ⇒ même point ; sinon `matchKey` (correspondance proposée par Plans à ≤ 300 mm) ⇒ point repris avec sa nouvelle clé ;
 * sinon nouveau point. Les points absents sont archivés, jamais supprimés — sauf les points libres posés sur chantier
 * (source « field »), gardés tant que la publication ne les retire pas explicitement (`removeKeys`).
 */
export function planPublish(existing: ExistingPointRef[], incoming: IncomingPointRef[], removeKeys: string[] = []): PublishPlan | { error: string } {
  const keys = new Set<string>();
  for (const p of incoming) {
    if (!p.key || keys.has(p.key)) return { error: `Clé de point en double ou vide : ${p.key || '(vide)'}` };
    keys.add(p.key);
  }
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const claimed = new Set<string>();
  const plan: PublishPlan = { updates: [], creates: [], archives: [] };
  incoming.forEach((p, index) => {
    const same = byKey.get(p.key);
    if (same && !claimed.has(same.id)) {
      claimed.add(same.id);
      plan.updates.push({ id: same.id, index, rekey: false, unarchive: same.archived });
      return;
    }
    const m = p.matchKey ? byKey.get(p.matchKey) : undefined;
    if (m && !claimed.has(m.id) && !keys.has(m.key)) {
      claimed.add(m.id);
      plan.updates.push({ id: m.id, index, rekey: true, unarchive: m.archived });
      return;
    }
    plan.creates.push(index);
  });
  const remove = new Set(removeKeys);
  for (const e of existing) {
    if (claimed.has(e.id) || e.archived) continue;
    if (e.source === 'field' && !remove.has(e.key)) continue;
    plan.archives.push(e.id);
  }
  return plan;
}

/** Code suivant d'un niveau pour une lettre (N0-P03 si N0-P01 et N0-P02 existent). */
export function nextCode(codes: string[], level: number, letter: string): string {
  const re = new RegExp(`^N${level}-${letter}(\\d+)$`);
  let max = 0;
  for (const c of codes) { const m = re.exec(c); if (m) max = Math.max(max, Number(m[1])); }
  return `N${level}-${letter}${String(max + 1).padStart(2, '0')}`;
}

// ─── Points génériques « toiture » de la catégorie Joints et étanchéité ───

const GENERIC_PREFIXES = [
  'caoutchouc supérieur entre les toitures',
  'bandes de toiture rooftec',
  'bandes croisées aux intersections',
];

const norm = (s: string) => s.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

/** Un des 3 points génériques remplacés par le plan de toiture (caoutchouc supérieur, bandes Rooftec, bandes croisées). */
export function isGenericRoofItem(label: string): boolean {
  const l = norm(label || '');
  return GENERIC_PREFIXES.some((p) => l.startsWith(p));
}
