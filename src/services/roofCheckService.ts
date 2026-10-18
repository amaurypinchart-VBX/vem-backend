// src/services/roofCheckService.ts
// Contrôle des jonctions de toiture : lecture d'un contrôle (points, photos, stats) et point « roofmap » de la
// check-list d'installation, dont le statut suit les points du plan (syncParent). Les règles pures sont dans
// roofCheckRules.ts ; les routes dans src/routes/roofChecks.ts.
import { prisma } from '../config/database';
import { userRefs, UserRef } from './checklistService';
import { mergeRoofLibrary, cleanSavedLibrary, RoofLibrary } from './roofCheckLibrary';
import {
  cleanRoofConfig, parentSummary, isActivePoint, isGenericRoofItem, RoofCheckConfig, RoofSummary,
  ROOFMAP_LABEL, ROOFMAP_CATEGORY, GENERIC_NA_COMMENT, DISABLED_COMMENT,
} from './roofCheckRules';

const db = prisma as any; // modèles ajoutés au schéma ; client typé régénéré au build Docker

export const ROOF_LIBRARY_KEY = 'checklist.roofCheckLibrary';

/** Bibliothèque des tâches effective (base du code + modifications enregistrées). */
export async function loadRoofLibrary(): Promise<{ library: RoofLibrary; saved: ReturnType<typeof cleanSavedLibrary> }> {
  let raw: unknown = null;
  try {
    const s = await db.appSetting.findUnique({ where: { key: ROOF_LIBRARY_KEY } });
    raw = s?.value ?? null;
  } catch { /* table absente : base seule */ }
  const saved = cleanSavedLibrary(raw);
  return { library: mergeRoofLibrary(saved), saved };
}

/** Check-list de la phase, créée (vide) si le projet n'en a pas encore. */
async function ensureChecklist(projectId: string, phase: string, userId: string) {
  const existing = await db.projectChecklist.findUnique({ where: { projectId_phase: { projectId, phase } } });
  if (existing) return existing;
  return db.projectChecklist.create({ data: { projectId, phase, viewboxType: 'ephemere', configuredById: userId, configuredAt: new Date() } });
}

/**
 * Point « roofmap » du contrôle : celui de checklist_item_id s'il existe encore, sinon un point roofmap déjà présent
 * dans la check-list, sinon un nouveau point rangé à la fin de la catégorie « Joints et étanchéité entre boxes ».
 */
export async function ensureParentItem(rc: any, userId: string) {
  if (rc.checklistItemId) {
    const it = await db.projectChecklistItem.findUnique({ where: { id: rc.checklistItemId } });
    if (it) return it;
  }
  const cl = await ensureChecklist(rc.projectId, rc.phase, userId);
  let item = await db.projectChecklistItem.findFirst({ where: { checklistId: cl.id, kind: 'roofmap' } });
  if (!item) {
    const items = await db.projectChecklistItem.findMany({ where: { checklistId: cl.id }, select: { categoryName: true, sortOrder: true } });
    const inCat = items.filter((i: any) => i.categoryName === ROOFMAP_CATEGORY);
    const sortOrder = (inCat.length ? Math.max(...inCat.map((i: any) => i.sortOrder)) : items.length ? Math.max(...items.map((i: any) => i.sortOrder)) : 0) + 5;
    item = await db.projectChecklistItem.create({
      data: {
        checklistId: cl.id, kind: 'roofmap', templateItemId: null, categoryName: ROOFMAP_CATEGORY, label: ROOFMAP_LABEL,
        hint: 'Se remplit sur le plan de toiture : chaque jonction, croisement et extrémité avec ses tâches et sa photo.',
        photoRequired: false, critical: cleanRoofConfig(rc.config).critical === true, sortOrder,
      },
    });
  }
  if (rc.checklistItemId !== item.id) await db.roofCheck.update({ where: { id: rc.id }, data: { checklistItemId: item.id } });
  rc.checklistItemId = item.id;
  return item;
}

/**
 * Recalcule le point parent (statut, commentaire, critique) après un changement. Renvoie true si la check-list a changé.
 * Un parent repassé « À vérifier » annule la validation finale, comme un point remis à vérifier à la main.
 */
export async function syncParent(roofCheckId: string, userId: string): Promise<boolean> {
  const rc = await db.roofCheck.findUnique({
    where: { id: roofCheckId },
    include: { points: { select: { code: true, status: true, covered: true, excluded: true, archived: true, sortOrder: true } } },
  });
  if (!rc) return false;
  const cfg = cleanRoofConfig(rc.config);
  let target: { status: string; comment: string; critical: boolean };
  if (!rc.enabled) {
    target = { status: 'na', comment: DISABLED_COMMENT, critical: false };
  } else {
    const s = parentSummary(rc.points.map((p: any) => ({ ...p, order: p.sortOrder })), cfg.includeCovered, !!rc.publishedAt);
    target = { status: s.status, comment: s.comment, critical: cfg.critical === true };
  }
  let item = rc.checklistItemId ? await db.projectChecklistItem.findUnique({ where: { id: rc.checklistItemId }, include: { checklist: true } }) : null;
  if (!item) {
    if (!rc.enabled) return false;
    const created = await ensureParentItem(rc, userId);
    item = await db.projectChecklistItem.findUnique({ where: { id: created.id }, include: { checklist: true } });
  }
  if (item.status === target.status && item.comment === target.comment && item.critical === target.critical) return false;
  const statusChanged = item.status !== target.status;
  await db.$transaction(async (tx: any) => {
    await tx.projectChecklistItem.update({
      where: { id: item.id },
      data: {
        status: target.status, comment: target.comment, critical: target.critical,
        ...(statusChanged ? { checkedById: target.status === 'pending' ? null : userId, checkedAt: target.status === 'pending' ? null : new Date() } : {}),
      },
    });
    if (statusChanged) {
      await tx.projectChecklistLog.create({ data: { itemId: item.id, fromStatus: item.status, toStatus: target.status, comment: target.comment, userId } });
      if (target.status === 'pending' && item.checklist.validatedAt)
        await tx.projectChecklist.update({ where: { id: item.checklist.id }, data: { validatedById: null, validatedAt: null } });
    }
  });
  return true;
}

/**
 * Points génériques « toiture » de la catégorie Joints et étanchéité (caoutchouc supérieur, bandes Rooftec, bandes croisées) :
 * on = ceux encore « À vérifier » passent en N.A. « Contrôlé sur le plan de toiture » ; off = ceux mis en N.A. par ce
 * mécanisme (commentaire inchangé) reviennent « À vérifier ». Renvoie le nombre de points changés.
 */
export async function applyGenericReplacement(projectId: string, phase: string, on: boolean, userId: string): Promise<number> {
  const cl = await db.projectChecklist.findUnique({ where: { projectId_phase: { projectId, phase } }, include: { items: true } });
  if (!cl) return 0;
  const targets = cl.items.filter((it: any) => (it.kind || 'standard') !== 'roofmap' && isGenericRoofItem(it.label)
    && (on ? it.status === 'pending' : it.status === 'na' && it.comment === GENERIC_NA_COMMENT));
  if (!targets.length) return 0;
  const now = new Date();
  await db.$transaction(async (tx: any) => {
    for (const it of targets) {
      const to = on ? 'na' : 'pending';
      await tx.projectChecklistItem.update({
        where: { id: it.id },
        data: { status: to, comment: on ? GENERIC_NA_COMMENT : null, checkedById: on ? userId : null, checkedAt: on ? now : null },
      });
      await tx.projectChecklistLog.create({
        data: { itemId: it.id, fromStatus: it.status, toStatus: to, comment: on ? GENERIC_NA_COMMENT : 'Plan de toiture retiré : point à vérifier de nouveau.', userId },
      });
    }
    if (!on && cl.validatedAt) await tx.projectChecklist.update({ where: { id: cl.id }, data: { validatedById: null, validatedAt: null } });
  });
  return targets.length;
}

/** Applique ou retire le remplacement des points génériques selon l'état du contrôle. */
export async function syncGenericItems(rc: any, userId: string): Promise<number> {
  const cfg = cleanRoofConfig(rc.config);
  return applyGenericReplacement(rc.projectId, rc.phase, rc.enabled && !!rc.publishedAt && cfg.replaceGenericItems, userId);
}

// ─── Lecture ───

export function shapePhoto(p: any, users?: Map<string, UserRef>) {
  return {
    id: p.id, pointId: p.pointId, taskKey: p.taskKey, photoUrl: p.photoUrl, width: p.width, height: p.height,
    takenAt: p.takenAt, createdAt: p.createdAt, uploadedBy: p.uploadedById ? users?.get(p.uploadedById) || null : null,
  };
}

export function shapePoint(p: any, users: Map<string, UserRef>) {
  return {
    id: p.id, key: p.key, code: p.code, type: p.type, level: p.level,
    modules: Array.isArray(p.modules) ? p.modules : [], geom: p.geom || {}, label: p.label, hint: p.hint,
    tasks: Array.isArray(p.tasks) ? p.tasks : [], tasksDone: p.tasksDone && typeof p.tasksDone === 'object' ? p.tasksDone : {},
    minPhotos: p.minPhotos, status: p.status, comment: p.comment, covered: p.covered, excluded: p.excluded, archived: p.archived,
    source: p.source, sortOrder: p.sortOrder, version: p.version,
    checkedBy: p.checkedById ? users.get(p.checkedById) || null : null, checkedAt: p.checkedAt, updatedAt: p.updatedAt,
    photos: (p.photos || []).map((ph: any) => shapePhoto(ph, users)),
    logsCount: p._count?.logs ?? 0,
  };
}

export const POINT_INCLUDE = { photos: { orderBy: { createdAt: 'asc' } }, _count: { select: { logs: true } } };

export async function loadPoint(pointId: string) {
  const p = await db.roofCheckPoint.findUnique({ where: { id: pointId }, include: POINT_INCLUDE });
  if (!p) return null;
  const users = await userRefs([p.checkedById, ...p.photos.map((ph: any) => ph.uploadedById)]);
  return shapePoint(p, users);
}

/** Version plus récente du modèle 3D du projet que celle du plan publié (null si à jour ou rien de publié). */
async function newerModelOf(projectId: string, modelVersionId: string | null) {
  if (!modelVersionId) return null;
  try {
    const latest = await db.plansModelVersion.findFirst({
      where: { projectId }, orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, createdAt: true },
    });
    return latest && latest.id !== modelVersionId ? latest : null;
  } catch {
    return null;
  }
}

export interface RoofCheckView {
  roofCheck: any | null;
  config: RoofCheckConfig;
  points: any[];
  summary: RoofSummary | null;
  byLevel: Array<{ level: number; total: number; closed: number; problems: number }>;
  parent: { id: string; status: string; comment: string | null; critical: boolean } | null;
  newerModel: { id: string; fileName: string; createdAt: Date } | null;
  checklist: { id: string; viewboxType: string; validatedAt: Date | null } | null;
}

/** Contrôle complet d'un projet (points non archivés, ou tous avec archived), pour le terrain et le configurateur. */
export async function loadRoofCheckView(projectId: string, phase: string, withArchived = false): Promise<RoofCheckView> {
  const rc = await db.roofCheck.findUnique({ where: { projectId_phase: { projectId, phase } } });
  const cl = await db.projectChecklist.findUnique({ where: { projectId_phase: { projectId, phase } }, select: { id: true, viewboxType: true, validatedAt: true } });
  if (!rc) return { roofCheck: null, config: cleanRoofConfig({}), points: [], summary: null, byLevel: [], parent: null, newerModel: null, checklist: cl };
  const points = await db.roofCheckPoint.findMany({
    where: { roofCheckId: rc.id, ...(withArchived ? {} : { archived: false }) },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    include: POINT_INCLUDE,
  });
  const users = await userRefs([rc.publishedById, ...points.flatMap((p: any) => [p.checkedById, ...p.photos.map((ph: any) => ph.uploadedById)])]);
  const config = cleanRoofConfig(rc.config);
  const summary = parentSummary(points.map((p: any) => ({ ...p, order: p.sortOrder })), config.includeCovered, !!rc.publishedAt);
  const levels = new Map<number, { level: number; total: number; closed: number; problems: number }>();
  for (const p of points) {
    if (!isActivePoint(p, config.includeCovered)) continue;
    const l = levels.get(p.level) || { level: p.level, total: 0, closed: 0, problems: 0 };
    l.total++;
    if (p.status === 'ok' || p.status === 'na') l.closed++;
    if (p.status === 'partial' || p.status === 'nok') l.problems++;
    levels.set(p.level, l);
  }
  const parentItem = rc.checklistItemId ? await db.projectChecklistItem.findUnique({ where: { id: rc.checklistItemId } }) : null;
  return {
    roofCheck: {
      id: rc.id, projectId: rc.projectId, phase: rc.phase, enabled: rc.enabled, modelVersionId: rc.modelVersionId, modelSha256: rc.modelSha256,
      levels: Array.isArray(rc.levels) ? rc.levels : [], engineVersion: rc.engineVersion, revision: rc.revision,
      publishedAt: rc.publishedAt, publishedBy: rc.publishedById ? users.get(rc.publishedById) || null : null,
      checklistItemId: rc.checklistItemId, updatedAt: rc.updatedAt,
    },
    config,
    points: points.map((p: any) => shapePoint(p, users)),
    summary,
    byLevel: [...levels.values()].sort((a, b) => a.level - b.level),
    parent: parentItem ? { id: parentItem.id, status: parentItem.status, comment: parentItem.comment, critical: parentItem.critical } : null,
    newerModel: await newerModelOf(projectId, rc.modelVersionId),
    checklist: cl,
  };
}
