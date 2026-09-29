// src/services/checklistService.ts
// Check-list de montage : lecture d'une check-list projet complète (points, photos, qui a vérifié)
// et statistiques, partagées par src/routes/checklists.ts et le handover (fiche, PDF, page de signature).
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const db = prisma as any; // modèles ajoutés au schéma ; client typé régénéré au build Docker

export const CHECKLIST_PHASES = ['installation', 'dismantling'] as const;
export const CHECKLIST_STATUSES = ['pending', 'ok', 'partial', 'nok', 'na'] as const;
export type ChecklistStatus = typeof CHECKLIST_STATUSES[number];
/** Statuts qui exigent un commentaire (pourquoi). */
export const COMMENT_REQUIRED_STATUSES: ChecklistStatus[] = ['partial', 'nok', 'na'];
export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  pending: 'À vérifier',
  ok: 'OK',
  partial: 'Partiel',
  nok: 'Non fait',
  na: 'N.A.',
};

export interface ChecklistStats {
  total: number;
  pending: number;
  ok: number;
  partial: number;
  nok: number;
  na: number;
  /** points critiques ni OK ni N.A. */
  criticalOpen: number;
  /** points « photo obligatoire » sans photo (hors N.A.) */
  photoMissing: number;
  /** % de points clos (OK + N.A.) */
  percent: number;
}

interface StatsInput {
  status: string;
  critical: boolean;
  photoRequired: boolean;
  photoCount: number;
}

export function checklistStats(items: StatsInput[]): ChecklistStats {
  const s: ChecklistStats = { total: items.length, pending: 0, ok: 0, partial: 0, nok: 0, na: 0, criticalOpen: 0, photoMissing: 0, percent: 0 };
  for (const it of items) {
    if ((CHECKLIST_STATUSES as readonly string[]).includes(it.status)) s[it.status as ChecklistStatus]++;
    const closed = it.status === 'ok' || it.status === 'na';
    if (it.critical && !closed) s.criticalOpen++;
    if (it.photoRequired && it.photoCount === 0 && it.status !== 'na') s.photoMissing++;
  }
  s.percent = s.total ? Math.round(((s.ok + s.na) / s.total) * 100) : 0;
  return s;
}

export interface UserRef { id: string; firstName: string; lastName: string }

/** Prénom + nom des utilisateurs (ids manquants ou supprimés ignorés). */
export async function userRefs(ids: Array<string | null | undefined>): Promise<Map<string, UserRef>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true },
  });
  return new Map(users.map((u) => [u.id, u]));
}

const ITEM_INCLUDE = {
  photos: { orderBy: { createdAt: 'asc' } },
  _count: { select: { logs: true } },
};

/** Point de check-list tel que renvoyé au front : photos, vérificateur, nombre de lignes d'historique. */
function shapeItem(it: any, users: Map<string, UserRef>) {
  const { _count, ...rest } = it;
  return {
    ...rest,
    checkedBy: it.checkedById ? users.get(it.checkedById) || null : null,
    logsCount: _count?.logs ?? 0,
  };
}

function statsOf(items: any[]): ChecklistStats {
  return checklistStats(items.map((it) => ({
    status: it.status,
    critical: it.critical,
    photoRequired: it.photoRequired,
    photoCount: Array.isArray(it.photos) ? it.photos.length : it._count?.photos ?? 0,
  })));
}

/** Check-list complète d'un projet pour une phase, ou null si pas encore configurée. */
export async function loadProjectChecklist(projectId: string, phase: string) {
  const cl = await db.projectChecklist.findUnique({
    where: { projectId_phase: { projectId, phase } },
    include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: ITEM_INCLUDE } },
  });
  if (!cl) return null;
  const users = await userRefs([cl.configuredById, cl.validatedById, ...cl.items.map((it: any) => it.checkedById)]);
  return {
    ...cl,
    configuredBy: cl.configuredById ? users.get(cl.configuredById) || null : null,
    validatedBy: cl.validatedById ? users.get(cl.validatedById) || null : null,
    items: cl.items.map((it: any) => shapeItem(it, users)),
    stats: statsOf(cl.items),
  };
}

/** Un point (après modification) + les stats de sa check-list. */
export async function loadChecklistItem(itemId: string) {
  const it = await db.projectChecklistItem.findUnique({ where: { id: itemId }, include: ITEM_INCLUDE });
  if (!it) return null;
  const users = await userRefs([it.checkedById]);
  const siblings = await db.projectChecklistItem.findMany({
    where: { checklistId: it.checklistId },
    select: { status: true, critical: true, photoRequired: true, _count: { select: { photos: true } } },
  });
  return { item: shapeItem(it, users), stats: statsOf(siblings) };
}

/**
 * Stats de la check-list (une phase) de plusieurs projets, pour les listes de handovers.
 * Projet sans check-list configurée → null. Ne fait jamais échouer l'appelant (table absente…).
 */
export async function checklistSummaries(projectIds: string[], phase = 'installation'): Promise<Map<string, ChecklistStats & { validatedAt: Date | null }>> {
  const out = new Map<string, ChecklistStats & { validatedAt: Date | null }>();
  const ids = [...new Set(projectIds.filter(Boolean))];
  if (!ids.length) return out;
  try {
    const lists = await db.projectChecklist.findMany({
      where: { projectId: { in: ids }, phase },
      select: {
        projectId: true,
        validatedAt: true,
        items: { select: { status: true, critical: true, photoRequired: true, _count: { select: { photos: true } } } },
      },
    });
    for (const cl of lists) out.set(cl.projectId, { ...statsOf(cl.items), validatedAt: cl.validatedAt });
  } catch (e: any) {
    logger.warn(`[checklist] résumé indisponible : ${e.message}`);
  }
  return out;
}

// ─── Check-list dans le handover (fiche, PDF, page de signature publique) ───
// Le handover montre la check-list de la phase installation.

type FullChecklist = NonNullable<Awaited<ReturnType<typeof loadProjectChecklist>>>;

const fullName = (u: UserRef | null | undefined) => (u ? `${u.firstName} ${u.lastName}`.trim() : null);

/** Check-list installation d'un projet pour le handover, ou null si pas configurée (ou table absente). */
export async function handoverChecklist(projectId: string): Promise<FullChecklist | null> {
  try {
    return await loadProjectChecklist(projectId, 'installation');
  } catch (e: any) {
    logger.warn(`[checklist] check-list du handover indisponible : ${e.message}`);
    return null;
  }
}

/** Données de la section « Check-list de montage » du PDF handover. */
export function checklistPdfData(cl: FullChecklist | null) {
  if (!cl) return null;
  return {
    viewboxType: cl.viewboxType as string,
    boxesChecked: cl.boxesChecked as string | null,
    notes: cl.notes as string | null,
    validatedAt: cl.validatedAt as Date | null,
    validatedByName: fullName(cl.validatedBy),
    items: cl.items.map((it: any) => ({
      categoryName: it.categoryName as string,
      label: it.label as string,
      status: it.status as string,
      comment: it.comment as string | null,
      critical: !!it.critical,
      photoRequired: !!it.photoRequired,
      checkedByName: fullName(it.checkedBy),
      checkedAt: it.checkedAt as Date | null,
      photos: (it.photos || []).map((p: any) => ({ photoUrl: p.photoUrl as string })),
    })),
  };
}

/**
 * Check-list montrée au client sur la page de signature : lecture seule, sans les points N.A.,
 * sans identifiants ni données internes (seulement prénom + nom de qui a vérifié).
 */
export function publicChecklist(cl: FullChecklist | null) {
  if (!cl) return null;
  const items = cl.items.filter((it: any) => it.status !== 'na');
  return {
    viewboxType: cl.viewboxType,
    boxesChecked: cl.boxesChecked,
    validatedAt: cl.validatedAt,
    validatedBy: fullName(cl.validatedBy),
    stats: statsOf(items),
    items: items.map((it: any) => ({
      categoryName: it.categoryName,
      label: it.label,
      hint: it.hint,
      status: it.status,
      comment: it.comment,
      critical: !!it.critical,
      checkedBy: fullName(it.checkedBy),
      checkedAt: it.checkedAt,
      photos: (it.photos || []).map((p: any) => p.photoUrl),
    })),
  };
}
