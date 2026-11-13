// src/services/roofCheckRules.ts
// Contrôle des jonctions de toiture — règles pures (pas de Prisma), partagées par src/routes/roofChecks.ts et
// src/services/roofCheckService.ts, testées par scripts/test-roofcheck.ts.
//   - types de points et tâches à vérifier par type (dans le code) ;
//   - cleanRoofConfig : lecture tolérante de roof_checks.config ;
//   - checkPointUpdate : statut / commentaire / tâches d'un point (OK = tout fait + la photo) ;
//   - parentSummary : statut et commentaire du point « roofmap » de la check-list ;
//   - planPublish : correspondance des points à la publication (même clé = même point, absents archivés).

export const ROOF_POINT_TYPES = ['seam-long', 'seam-short', 'cross', 'tee', 'end', 'outer-corner', 'step', 'custom'] as const;
export type RoofPointType = typeof ROOF_POINT_TYPES[number];

export const ROOF_TYPE_LABELS: Record<RoofPointType, string> = {
  'seam-long': 'Jonction grand côté',
  'seam-short': 'Jonction petit côté',
  cross: 'Croisement',
  tee: 'Jonction en T',
  end: 'Extrémité de jonction',
  'outer-corner': 'Angle de toiture',
  step: 'Raccord d’étage',
  custom: 'Point ajouté',
};

/** Lettre du code affiché sur le plan (J01, X01…). */
export const ROOF_TYPE_LETTERS: Record<RoofPointType, string> = {
  'seam-long': 'J', 'seam-short': 'J', cross: 'X', tee: 'T', end: 'E', 'outer-corner': 'A', step: 'R', custom: 'P',
};

export interface RoofTask { key: string; label: string }

/**
 * Ce qu'on vérifie à chaque type de point (réponses d'A. Pinchart 18.10.2026 : caoutchouc supérieur + Rooftec / Rooftape
 * sur les jonctions, 1 photo par point ; laine de roche en plus sur les jonctions des Viewbox permanentes).
 */
const SEAM: RoofTask[] = [
  { key: 'rubber', label: 'Caoutchouc supérieur posé sur toute la longueur, sans pli ni interruption' },
  { key: 'tape', label: 'Bande Rooftec / Rooftape posée, marouflée, bords collés' },
];
const ROOF_TASKS: Record<RoofPointType, RoofTask[]> = {
  'seam-long': SEAM,
  'seam-short': SEAM,
  cross: [{ key: 'cross-tape', label: 'Bandes croisées, recouvrement correct, bords collés' }],
  tee: [{ key: 'cross-tape', label: 'Bandes croisées, recouvrement correct, bords collés' }],
  end: [
    { key: 'end-close', label: 'Caoutchouc et bande fermés / retournés sur la rive' },
    { key: 'u-end', label: 'Raccord et extrémité du U siliconés' },
  ],
  'outer-corner': [{ key: 'corner', label: 'Angle de toiture étanché' }],
  step: [{ key: 'step', label: 'Raccord étage / toiture du dessous étanché' }],
  custom: [{ key: 'through', label: 'Point étanché (traversée câble, airco, évacuation…)' }],
};
const PERMANENT_SEAM: RoofTask = { key: 'wool', label: 'Profils de toiture (NDCS) remplis de laine de roche' };

/** Tâches d'un type de point (+ laine de roche sur les jonctions d'une Viewbox permanente). */
export function tasksFor(type: RoofPointType, viewboxType?: string | null): RoofTask[] {
  const list = (ROOF_TASKS[type] || ROOF_TASKS.custom).map((t) => ({ ...t }));
  if (viewboxType === 'permanente' && (type === 'seam-long' || type === 'seam-short')) list.push({ ...PERMANENT_SEAM });
  return list;
}

export const ROOF_STATUSES = ['pending', 'ok', 'partial', 'nok', 'na'] as const;
export type RoofStatus = typeof ROOF_STATUSES[number];
export const ROOF_COMMENT_REQUIRED: RoofStatus[] = ['partial', 'nok', 'na'];
export const ROOF_STATUS_LABELS: Record<RoofStatus, string> = {
  pending: 'À faire', ok: 'OK', partial: 'Partiel', nok: 'Non fait', na: 'N.A.',
};

/** Libellé et catégorie du point « roofmap » ajouté à la check-list d'installation. */
export const ROOFMAP_LABEL = '💧 Plan de contrôle de l’étanchéité de toiture';
export const ROOFMAP_CATEGORY = 'Joints et étanchéité entre boxes';
export const ROOFMAP_HINT = 'Se remplit sur le plan de toiture : chaque jonction, croisement, extrémité et angle avec sa photo.';
export const GENERIC_NA_COMMENT = 'Contrôlé sur le plan de toiture';
export const NOT_PUBLISHED_COMMENT = 'Plan de toiture pas encore préparé (Plans Viewbox › Toiture › Publier).';
export const DISABLED_COMMENT = 'Contrôle de l’étanchéité de toiture désactivé pour ce projet.';

export interface RoofCheckConfig {
  v: 1;
  /** bloque le lien de signature du handover tant que pas clos ; null = pas encore choisi (non bloquant) */
  critical: boolean | null;
  /** types de points contrôlés (tous par défaut) */
  types: Record<RoofPointType, boolean>;
  /** photos demandées par point */
  minPhotos: number;
  /** points sous une box de l'étage du dessus à contrôler aussi (réponse 18.10.2026 : oui) */
  includeCovered: boolean;
  /** le site manager peut ajouter des points sur le chantier */
  fieldPoints: boolean;
  /** les 3 points « toiture » génériques de la check-list passent en N.A. « Contrôlé sur le plan de toiture » */
  replaceGenericItems: boolean;
}

function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
}

/** Config d'un contrôle toiture, valeurs par défaut = réponses d'A. Pinchart (tous les types, toits sous étage compris). */
export function cleanRoofConfig(raw: any): RoofCheckConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  const types = {} as Record<RoofPointType, boolean>;
  for (const t of ROOF_POINT_TYPES) types[t] = t === 'custom' ? true : r.types?.[t] === undefined ? true : r.types[t] === true;
  return {
    v: 1,
    critical: r.critical === true ? true : r.critical === false ? false : null,
    types,
    minPhotos: num(r.minPhotos ?? r.photo?.min, 1, 0, 10),
    includeCovered: r.includeCovered !== false,
    fieldPoints: r.fieldPoints !== false,
    replaceGenericItems: r.replaceGenericItems !== false,
  };
}

/** Tâches cochées lues d'un JSON : seulement les clés des tâches du point, valeurs booléennes. */
export function cleanTasksDone(raw: any, tasks: RoofTask[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const t of tasks) out[t.key] = src[t.key] === true;
  return out;
}

/** Tâches d'un point lues d'un JSON (copie faite à la publication). */
export function cleanTasks(raw: any): RoofTask[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: RoofTask[] = [];
  for (const t of raw) {
    const key = String(t?.key ?? '').trim();
    const label = String(t?.label ?? '').trim();
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({ key: key.slice(0, 40), label: label.slice(0, 300) });
  }
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

/** Photos manquantes pour passer un point OK ('' = assez). */
export function missingPhotos(minPhotos: number, photoCount: number): string {
  if (photoCount >= minPhotos) return '';
  return minPhotos <= 1 ? 'prends la photo du point' : `prends au moins ${minPhotos} photos (${photoCount} pour l’instant)`;
}

/**
 * Nouveau statut / commentaire / tâches d'un point, mêmes règles que la check-list :
 * commentaire obligatoire pour Partiel / Non fait / N.A. ; « OK » = toutes les tâches faites (cochées d'office)
 * et la photo prise.
 */
export function checkPointUpdate(p: PointState, input: PointUpdateInput, photoCount: number): PointUpdateResult {
  const status = (input.status === undefined ? p.status : String(input.status)) as RoofStatus;
  if (!(ROOF_STATUSES as readonly string[]).includes(status)) return { ok: false, error: `Statut invalide : ${status}` };
  const comment = input.comment === undefined ? p.comment : cleanComment(input.comment);
  if (input.tasksDone !== undefined && (input.tasksDone === null || typeof input.tasksDone !== 'object' || Array.isArray(input.tasksDone)))
    return { ok: false, error: 'tasksDone doit être un objet { tâche: true/false }' };
  let tasksDone = input.tasksDone === undefined ? cleanTasksDone(p.tasksDone, p.tasks) : cleanTasksDone({ ...p.tasksDone, ...(input.tasksDone as object) }, p.tasks);
  if (ROOF_COMMENT_REQUIRED.includes(status) && !comment)
    return { ok: false, error: `Commentaire obligatoire pour « ${ROOF_STATUS_LABELS[status]} » : explique pourquoi.` };
  if (status === 'ok') {
    if (p.status === 'ok' && input.status === undefined && p.tasks.some((t) => !tasksDone[t.key]))
      return { ok: false, error: 'Ce point est OK : passe-le en « Partiel » avant de décocher une tâche.' };
    const missing = missingPhotos(p.minPhotos, photoCount);
    if (missing) return { ok: false, error: `Pas encore OK : ${missing}.` };
    tasksDone = Object.fromEntries(p.tasks.map((t) => [t.key, true]));
  }
  return { ok: true, status, comment, tasksDone, statusChanged: status !== p.status };
}

/** Suppression d'une photo : refusée si le point est OK et que c'est sa preuve. Message ou null. */
export function photoDeleteBlock(p: { status: string; minPhotos: number }, photoCount: number): string | null {
  if (p.status !== 'ok' || photoCount - 1 >= p.minPhotos) return null;
  return 'Ce point est OK et cette photo en est la preuve : ajoute une autre photo ou change son statut avant de la supprimer.';
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
  percent: number;
}

/** Points qui comptent : ni archivés, ni d'un type non contrôlé, ni couverts (sauf includeCovered). */
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
  const s: RoofSummary = { status: 'pending', comment: '', total: active.length, pending: 0, ok: 0, partial: 0, nok: 0, na: 0, closed: 0, problems: 0, percent: 0 };
  for (const p of active) {
    const st = (ROOF_STATUSES as readonly string[]).includes(p.status) ? (p.status as RoofStatus) : 'pending';
    s[st]++;
  }
  s.closed = s.ok + s.na;
  s.problems = s.partial + s.nok;
  s.percent = s.total ? Math.round((s.closed / s.total) * 100) : 0;
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
export interface IncomingPointRef { key: string }

export interface PublishPlan {
  /** point existant mis à jour (même clé) */
  updates: Array<{ id: string; index: number; unarchive: boolean }>;
  /** index des points entrants à créer */
  creates: number[];
  /** ids archivés (photos et statut gardés) */
  archives: string[];
}

/**
 * Même clé ⇒ même point (statut, photos gardés) ; sinon nouveau point. Les points absents sont archivés, jamais
 * supprimés — sauf les points ajoutés sur chantier (source « field »), toujours gardés.
 */
export function planPublish(existing: ExistingPointRef[], incoming: IncomingPointRef[]): PublishPlan | { error: string } {
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
    if (same && same.source !== 'field') {
      claimed.add(same.id);
      plan.updates.push({ id: same.id, index, unarchive: same.archived });
    } else plan.creates.push(index);
  });
  for (const e of existing) if (!claimed.has(e.id) && !e.archived && e.source !== 'field') plan.archives.push(e.id);
  return plan;
}

/** Code suivant d'un niveau pour une lettre (N0-P03 si N0-P01 et N0-P02 existent). */
export function nextCode(codes: string[], level: number, letter: string): string {
  const re = new RegExp(`^(?:N${level}-)?${letter}(\\d+)$`);
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
