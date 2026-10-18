// src/routes/roofChecks.ts
// Contrôle des jonctions de toiture (plan de toiture cliquable de la check-list d'installation).
// Monté sur /api/v1/roof-checks avec authMiddleware seulement : le terrain (site manager) ne dépend PAS de l'accès
// Plans ; chaque route vérifie l'accès au projet (assertProjectAccess). Seules la publication et l'envoi des plans
// de fond (depuis Plans Viewbox) exigent en plus l'accès Plans et un rôle de configuration.
import { Router, Response, NextFunction, Request } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { assertProjectAccess } from '../middleware/projectAccess';
import { hasPlansAccess } from '../middleware/plansAccess';
import { uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService';
import { userRefs } from '../services/checklistService';
import { io } from '../index';
import { ROOF_POINT_TYPES, ROOF_TASK_GROUPS, ROOF_LIBRARY_BASE, cleanSavedLibrary, mergeRoofLibrary, defaultTasksFor, RoofTask } from '../services/roofCheckLibrary';
import {
  cleanRoofConfig, cleanTasksDone, checkPointUpdate, photoDeleteBlock, planPublish, nextCode, missingProof, IncomingPointRef,
} from '../services/roofCheckRules';
import {
  loadRoofCheckView, loadRoofLibrary, loadPoint, ensureParentItem, syncParent, syncGenericItems, applyGenericReplacement,
  shapePhoto, ROOF_LIBRARY_KEY,
} from '../services/roofCheckService';

const router = Router();
const db = prisma as any; // modèles ajoutés au schéma ; client typé régénéré au build Docker

// Mêmes rôles que la check-list (src/routes/checklists.ts)
const CONFIGURE_ROLES = ['admin', 'technical_manager', 'project_manager'];
const FILL_ROLES = [...CONFIGURE_ROLES, 'site_manager'];
const PHASES = ['installation'];
const MAX_FILE = 10 * 1024 * 1024; // limite Cloudinary

const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE } });
/** Un fichier « file » en mémoire ; trop lourd ⇒ 413 avec un message clair. */
const singleFile = (req: Request, res: Response, next: NextFunction) =>
  memUpload.single('file')(req, res, (err: any) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new AppError('Fichier trop lourd (10 Mo au plus).', 413));
    next(err);
  });

function requireRoles(req: AuthRequest, roles: string[], action: string): void {
  if (!req.user || !roles.includes(req.user.role)) throw new AppError(`Permission insuffisante pour ${action}.`, 403);
}

function parsePhase(v: unknown): string {
  const phase = v === undefined || v === null || v === '' ? 'installation' : String(v);
  if (!PHASES.includes(phase)) throw new AppError(`Phase invalide : ${phase} (${PHASES.join(', ')})`, 400);
  return phase;
}

/** Peut remplir les points : rôles de la check-list, + installateurs si l'option du projet est cochée. */
function canFill(role: string | undefined, config: { installersCanFill: boolean }): boolean {
  return !!role && (FILL_ROLES.includes(role) || (config.installersCanFill && role === 'installer'));
}

function notifyRoof(projectId: string, pointId: string | null, checklistChanged: boolean, phase = 'installation'): void {
  try {
    io.to(`project:${projectId}`).emit('roofcheck:updated', { projectId, pointId });
    if (checklistChanged) io.to(`project:${projectId}`).emit('checklist:updated', { projectId, phase });
  } catch { /* socket indisponible */ }
}

function cloudinaryResourceType(url: string): 'image' | 'video' | 'raw' {
  const m = /\/(image|video|raw)\/upload\//.exec(url || '');
  return (m?.[1] as 'image' | 'video' | 'raw') || 'image';
}

async function perms(req: AuthRequest, projectId: string, config: { installersCanFill: boolean }) {
  const role = req.user?.role;
  const canConfigure = !!role && CONFIGURE_ROLES.includes(role);
  const plansAccess = req.user ? await hasPlansAccess(req.user.id) : false;
  return { canConfigure, canFill: canFill(role, config), canPublish: canConfigure && plansAccess, plansAccess, projectId };
}

/** Point + contrôle, accès projet vérifié ; refusé si le point est archivé ou le contrôle désactivé (écriture). */
async function pointWithAccess(req: AuthRequest, pointId: string, forWrite: boolean) {
  const p = await db.roofCheckPoint.findUnique({
    where: { id: pointId },
    include: {
      roofCheck: { select: { id: true, projectId: true, phase: true, config: true, enabled: true, publishedAt: true } },
      photos: { select: { id: true, taskKey: true } },
    },
  });
  if (!p) throw new AppError('Point du plan de toiture introuvable', 404);
  await assertProjectAccess(req.user, p.roofCheck.projectId);
  const config = cleanRoofConfig(p.roofCheck.config);
  if (forWrite) {
    if (!canFill(req.user?.role, config)) throw new AppError('Permission insuffisante pour remplir le contrôle toiture.', 403);
    if (!p.roofCheck.enabled) throw new AppError('Le contrôle des jonctions de toiture est désactivé pour ce projet.', 400);
    if (p.archived) throw new AppError('Ce point a été retiré du plan de toiture (archivé) : il ne se remplit plus.', 400);
  }
  return { p, config };
}

// Le rôle client n'a accès à rien ici.
router.use((req: AuthRequest, _res: Response, next: NextFunction) => {
  if (req.user?.role === 'client') return next(new AppError('Permission insuffisante', 403));
  next();
});

// ============================================================================
// BIBLIOTHÈQUE DES TÂCHES
// ============================================================================

// GET /roof-checks/library — { base, saved, library } (library = base + modifications)
router.get('/library', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { library, saved } = await loadRoofLibrary();
    res.json({ success: true, data: { base: ROOF_LIBRARY_BASE, saved, library, groups: ROOF_TASK_GROUPS } });
  } catch (err) { next(err); }
});

// PUT /roof-checks/library — { tasks: { seam: [{ key, label, photo, active }], … } } : modifications (base jamais écrasée)
router.put('/library', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'modifier la bibliothèque du contrôle toiture');
    const saved = cleanSavedLibrary(req.body || {});
    await db.appSetting.upsert({ where: { key: ROOF_LIBRARY_KEY }, update: { value: { tasks: saved } }, create: { key: ROOF_LIBRARY_KEY, value: { tasks: saved } } });
    res.json({ success: true, data: { base: ROOF_LIBRARY_BASE, saved, library: mergeRoofLibrary(saved), groups: ROOF_TASK_GROUPS } });
  } catch (err) { next(err); }
});

// ============================================================================
// CONTRÔLE D'UN PROJET
// ============================================================================

// GET /roof-checks/project/:projectId?phase=installation[&archived=1] — contrôle, points, photos, stats, droits
router.get('/project/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(req.user, projectId);
    const phase = parsePhase(req.query.phase);
    const view = await loadRoofCheckView(projectId, phase, req.query.archived === '1');
    res.json({ success: true, data: { ...view, perms: await perms(req, projectId, view.config) } });
  } catch (err) { next(err); }
});

// PUT /roof-checks/project/:projectId/config — options réglables depuis VEM :
// { phase?, enabled?, critical?, installersCanFill?, fieldPoints?, replaceGenericItems?, includeCovered? }
router.put('/project/:projectId/config', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'configurer le contrôle toiture');
    const { projectId } = req.params;
    await assertProjectAccess(req.user, projectId);
    const b = req.body || {};
    const phase = parsePhase(b.phase);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new AppError('Projet introuvable', 404);

    let rc = await db.roofCheck.findUnique({ where: { projectId_phase: { projectId, phase } } });
    const old = cleanRoofConfig(rc?.config);
    const patch: Record<string, unknown> = {};
    for (const k of ['installersCanFill', 'fieldPoints', 'replaceGenericItems', 'includeCovered'] as const)
      if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') throw new AppError(`${k} doit valoir true ou false`, 400); patch[k] = b[k]; }
    if (b.critical !== undefined) {
      if (b.critical !== null && typeof b.critical !== 'boolean') throw new AppError('critical doit valoir true, false ou null', 400);
      patch.critical = b.critical;
    }
    if (b.enabled !== undefined && typeof b.enabled !== 'boolean') throw new AppError('enabled doit valoir true ou false', 400);
    const config = cleanRoofConfig({ ...old, ...patch });
    const enabled = b.enabled === undefined ? rc?.enabled ?? true : b.enabled;
    rc = rc
      ? await db.roofCheck.update({ where: { id: rc.id }, data: { config, enabled } })
      : await db.roofCheck.create({ data: { projectId, phase, config, enabled } });

    if (enabled) await ensureParentItem(rc, req.user!.id);
    const changed = await syncParent(rc.id, req.user!.id);
    const generic = await syncGenericItems(rc, req.user!.id);
    notifyRoof(projectId, null, changed || generic > 0, phase);
    const view = await loadRoofCheckView(projectId, phase);
    res.json({ success: true, data: { ...view, perms: await perms(req, projectId, view.config) } });
  } catch (err) { next(err); }
});

// ─── Publication depuis Plans Viewbox ───

const num = z.number().finite();
const taskSchema = z.object({ key: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/), label: z.string().trim().min(1).max(300), photo: z.boolean() });
const pointSchema = z.object({
  key: z.string().min(1).max(300),
  matchKey: z.string().max(300).nullish(),
  code: z.string().min(1).max(30),
  type: z.enum(ROOF_POINT_TYPES),
  level: z.number().int().min(0).max(49),
  modules: z.array(z.string().max(60)).max(8).default([]),
  at: z.object({ x: num, z: num, y: num }),
  seg: z.object({ a: z.tuple([num, num]), b: z.tuple([num, num]) }).nullish(),
  lengthMm: num.nonnegative().nullish(),
  label: z.string().max(200).nullish(),
  hint: z.string().max(300).nullish(),
  covered: z.boolean().default(false),
  excluded: z.boolean().default(false),
  order: z.number().int().min(0).max(100000),
  tasks: z.array(taskSchema).max(20),
  minPhotos: z.number().int().min(0).max(10),
  source: z.enum(['model', 'office', 'field']).default('model'),
  warnings: z.array(z.string().max(300)).max(10).optional(),
});
const levelSchema = z.object({
  level: z.number().int().min(0).max(49),
  label: z.string().max(100),
  svgUrl: z.string().url().max(1000).nullish(),
  svgPublicId: z.string().max(300).nullish(),
  pngUrl: z.string().url().max(1000).nullish(),
  pngPublicId: z.string().max(300).nullish(),
  widthPx: z.number().int().positive().max(20000),
  heightPx: z.number().int().positive().max(20000),
  mmToPx: z.tuple([num, num, num, num, num, num]),
});
const publishSchema = z.object({
  phase: z.string().optional(),
  modelVersionId: z.string().max(100).nullish(),
  sha256: z.string().max(200).nullish(),
  engineVersion: z.string().max(100).nullish(),
  /** révision lue avant publication : refus si quelqu'un a publié entre-temps (écran de différence périmé) */
  expectedRevision: z.number().int().min(0).nullish(),
  config: z.record(z.any()).default({}),
  levels: z.array(levelSchema).max(50),
  points: z.array(pointSchema).max(3000),
  removeKeys: z.array(z.string().max(300)).max(3000).default([]),
});

async function requirePublish(req: AuthRequest, projectId: string): Promise<void> {
  requireRoles(req, CONFIGURE_ROLES, 'publier le plan de toiture');
  await assertProjectAccess(req.user, projectId);
  if (!(await hasPlansAccess(req.user!.id)))
    throw new AppError('Accès aux Plans 2D non activé pour ton compte : la publication du plan de toiture se fait depuis Plans Viewbox.', 403);
}

const geomOf = (p: z.infer<typeof pointSchema>) => ({
  at: p.at, ...(p.seg ? { seg: p.seg } : {}), ...(p.lengthMm != null ? { lengthMm: p.lengthMm } : {}), ...(p.warnings?.length ? { warnings: p.warnings } : {}),
});

// POST /roof-checks/project/:projectId/publish — { modelVersionId, sha256, engineVersion, expectedRevision, config, levels, points, removeKeys }
// Même clé ⇒ même point (statut, tâches cochées, photos gardés) ; matchKey ⇒ point repris sous sa nouvelle clé ;
// absents ⇒ archivés (jamais supprimés) ; points libres de chantier gardés sauf removeKeys.
router.post('/project/:projectId/publish', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    await requirePublish(req, projectId);
    const parsed = publishSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      throw new AppError(`Publication refusée : ${i.path.join('.') || 'données'} — ${i.message}`, 400);
    }
    const b = parsed.data;
    const phase = parsePhase(b.phase);
    if (b.modelVersionId) {
      const mv = await db.plansModelVersion.findUnique({ where: { id: b.modelVersionId }, select: { projectId: true } });
      if (!mv || mv.projectId !== projectId) throw new AppError('Version du modèle introuvable pour ce projet', 400);
    }
    let rc = await db.roofCheck.findUnique({ where: { projectId_phase: { projectId, phase } } });
    if (b.expectedRevision != null && (rc?.revision ?? 0) !== b.expectedRevision)
      throw new AppError(`Le plan de toiture a été republié entre-temps (révision ${rc?.revision ?? 0}). Recharge l’onglet Toiture avant de publier.`, 409);
    // config : celle de Plans, mais les options réglées depuis VEM (activé, critique, installateurs…) restent celles de VEM
    const vemCfg = cleanRoofConfig(rc?.config);
    const config = cleanRoofConfig({
      ...b.config,
      critical: vemCfg.critical, installersCanFill: vemCfg.installersCanFill, fieldPoints: vemCfg.fieldPoints,
      replaceGenericItems: rc ? vemCfg.replaceGenericItems : b.config.replaceGenericItems,
    });
    if (!rc) rc = await db.roofCheck.create({ data: { projectId, phase, config, enabled: true } });
    const oldLevels: any[] = Array.isArray(rc.levels) ? rc.levels : [];

    const existing = await db.roofCheckPoint.findMany({
      where: { roofCheckId: rc.id },
      select: { id: true, key: true, source: true, archived: true, status: true, tasksDone: true, minPhotos: true, version: true, photos: { select: { taskKey: true } } },
    });
    const plan = planPublish(existing, b.points as IncomingPointRef[], b.removeKeys);
    if ('error' in plan) throw new AppError(plan.error, 400);
    const revision = rc.revision + 1;
    const userId = req.user!.id;
    const byId = new Map(existing.map((e: any) => [e.id, e]));
    let reopened = 0;

    await db.$transaction(async (tx: any) => {
      // les clés reprises (matchKey) peuvent croiser d'autres clés : d'abord une clé temporaire unique
      for (const u of plan.updates.filter((x) => x.rekey))
        await tx.roofCheckPoint.update({ where: { id: u.id }, data: { key: `tmp|${u.id}|${revision}` } });
      for (const u of plan.updates) {
        const p = b.points[u.index];
        const old: any = byId.get(u.id);
        const tasks: RoofTask[] = p.tasks.map((t) => ({ key: t.key, label: t.label, photo: t.photo, active: true }));
        const tasksDone = cleanTasksDone(old.tasksDone, tasks);
        // un point OK dont la preuve ne suffit plus (tâche ajoutée, plus de photos demandées) repasse « À faire »
        const reopen = old.status === 'ok' && missingProof({ tasks, minPhotos: p.minPhotos }, tasksDone, old.photos, config.photo.mode).length > 0;
        await tx.roofCheckPoint.update({
          where: { id: u.id },
          data: {
            key: p.key, code: p.code, type: p.type, level: p.level, modules: p.modules, geom: geomOf(p),
            label: p.label ?? null, hint: p.hint ?? null, covered: p.covered, excluded: p.excluded, sortOrder: p.order,
            tasks: tasks.map(({ key, label, photo }) => ({ key, label, photo })), tasksDone, minPhotos: p.minPhotos, archived: false,
            version: { increment: 1 },
            ...(reopen ? { status: 'pending', checkedById: null, checkedAt: null } : {}),
          },
        });
        if (u.unarchive) await tx.roofCheckLog.create({ data: { pointId: u.id, fromStatus: old.status, toStatus: reopen ? 'pending' : old.status, comment: `Remis sur le plan (publication rév. ${revision}).`, userId } });
        if (reopen) {
          reopened++;
          await tx.roofCheckLog.create({ data: { pointId: u.id, fromStatus: 'ok', toStatus: 'pending', comment: `Tâches ou photos demandées modifiées à la publication rév. ${revision} : à revérifier.`, userId } });
        }
      }
      for (const index of plan.creates) {
        const p = b.points[index];
        await tx.roofCheckPoint.create({
          data: {
            roofCheckId: rc.id, key: p.key, code: p.code, type: p.type, level: p.level, modules: p.modules, geom: geomOf(p),
            label: p.label ?? null, hint: p.hint ?? null, covered: p.covered, excluded: p.excluded, sortOrder: p.order,
            tasks: p.tasks, tasksDone: cleanTasksDone({}, p.tasks.map((t) => ({ ...t, active: true })) as RoofTask[]), minPhotos: p.minPhotos,
            source: p.source === 'field' ? 'office' : p.source,
          },
        });
      }
      for (const id of plan.archives) {
        const old: any = byId.get(id);
        await tx.roofCheckPoint.update({ where: { id }, data: { archived: true, version: { increment: 1 } } });
        await tx.roofCheckLog.create({ data: { pointId: id, fromStatus: old.status, toStatus: old.status, comment: `Retiré du plan (publication rév. ${revision}) — statut et photos gardés.`, userId } });
      }
      await tx.roofCheck.update({
        where: { id: rc.id },
        data: {
          config, levels: b.levels, enabled: true, modelVersionId: b.modelVersionId ?? null, modelSha256: b.sha256 ?? null,
          engineVersion: b.engineVersion ?? null, revision, publishedById: userId, publishedAt: new Date(),
        },
      });
    }, { timeout: 120000 });

    rc = await db.roofCheck.findUnique({ where: { id: rc.id } });
    await ensureParentItem(rc, userId);
    const changed = await syncParent(rc.id, userId);
    const generic = await syncGenericItems(rc, userId);

    // anciens plans de fond plus utilisés : supprimés de Cloudinary seulement maintenant (publication réussie)
    const kept = new Set(b.levels.flatMap((l) => [l.svgPublicId, l.pngPublicId]).filter(Boolean));
    for (const l of oldLevels) {
      if (l?.svgPublicId && !kept.has(l.svgPublicId)) await deleteFromCloudinary(l.svgPublicId, 'raw');
      if (l?.pngPublicId && !kept.has(l.pngPublicId)) await deleteFromCloudinary(l.pngPublicId, 'image');
    }

    notifyRoof(projectId, null, changed || generic > 0, phase);
    const view = await loadRoofCheckView(projectId, phase);
    res.json({
      success: true,
      data: { ...view, perms: await perms(req, projectId, view.config) },
      meta: {
        revision, created: plan.creates.length, updated: plan.updates.length, archived: plan.archives.length,
        unarchived: plan.updates.filter((u) => u.unarchive).length, reopened, genericReplaced: generic,
      },
    });
  } catch (err) { next(err); }
});

// POST /roof-checks/project/:projectId/assets — multipart « file » + level + kind (svg | png) : plan de fond d'un niveau,
// envoyé avant la publication qui y fait référence. → { url, publicId }
router.post('/project/:projectId/assets', singleFile, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    await requirePublish(req, projectId);
    if (!req.file) throw new AppError('Fichier manquant', 400);
    const kind = String(req.body?.kind || '');
    const level = Number(req.body?.level);
    if (!Number.isInteger(level) || level < 0 || level > 49) throw new AppError('Niveau invalide', 400);
    const folder = `roof-checks/${projectId}/plans`;
    if (kind === 'svg') {
      const head = req.file.buffer.subarray(0, 2000).toString('utf8');
      if (!/<svg[\s>]/i.test(head)) throw new AppError('Le plan de fond SVG est illisible', 400);
      const { url, publicId } = await uploadToCloudinary(req.file.buffer, folder, { resource_type: 'raw', public_id: `toit-N${level}-${Date.now()}.svg` });
      return res.status(201).json({ success: true, data: { url, publicId, kind, level } });
    }
    if (kind === 'png') {
      if (req.file.mimetype !== 'image/png') throw new AppError('Le plan de fond PNG doit être une image PNG', 400);
      const { url, publicId } = await uploadToCloudinary(req.file.buffer, folder, { resource_type: 'image' });
      return res.status(201).json({ success: true, data: { url, publicId, kind, level } });
    }
    throw new AppError('kind doit valoir svg ou png', 400);
  } catch (err) { next(err); }
});

// POST /roof-checks/project/:projectId/points — point libre posé sur chantier { level, at: { x, z, y? }, label, hint? }
router.post('/project/:projectId/points', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(req.user, projectId);
    const b = req.body || {};
    const phase = parsePhase(b.phase);
    const rc = await db.roofCheck.findUnique({ where: { projectId_phase: { projectId, phase } } });
    if (!rc || !rc.publishedAt) throw new AppError('Le plan de toiture n’est pas encore publié.', 400);
    if (!rc.enabled) throw new AppError('Le contrôle des jonctions de toiture est désactivé pour ce projet.', 400);
    const config = cleanRoofConfig(rc.config);
    if (!canFill(req.user?.role, config)) throw new AppError('Permission insuffisante pour remplir le contrôle toiture.', 403);
    const isOffice = req.user && CONFIGURE_ROLES.includes(req.user.role);
    if (!config.fieldPoints && !isOffice) throw new AppError('L’ajout de points sur chantier n’est pas activé pour ce projet.', 403);
    const level = Number(b.level);
    const x = Number(b.at?.x), zz = Number(b.at?.z), y = b.at?.y === undefined ? 0 : Number(b.at.y);
    if (!Number.isInteger(level) || level < 0 || level > 49) throw new AppError('Niveau invalide', 400);
    if (![x, zz, y].every(Number.isFinite)) throw new AppError('Position du point invalide', 400);
    const label = String(b.label ?? '').trim().slice(0, 200);
    if (!label) throw new AppError('Donne un nom au point (ex. « Traversée câble airco »).', 400);
    const hint = b.hint ? String(b.hint).trim().slice(0, 300) || null : null;

    const all = await db.roofCheckPoint.findMany({ where: { roofCheckId: rc.id }, select: { code: true, sortOrder: true } });
    const { library } = await loadRoofLibrary();
    const cl = await db.projectChecklist.findUnique({ where: { projectId_phase: { projectId, phase } }, select: { viewboxType: true } });
    const tasks = (config.tasks.custom ?? defaultTasksFor('custom', library, cl?.viewboxType)).filter((t) => t.active !== false)
      .map(({ key, label: l, photo }) => ({ key, label: l, photo }));
    const point = await db.roofCheckPoint.create({
      data: {
        roofCheckId: rc.id, key: `custom|${randomUUID()}`, code: nextCode(all.map((p: any) => p.code), level, 'P'),
        type: 'custom', level, modules: [], geom: { at: { x, z: zz, y } }, label, hint,
        tasks, tasksDone: Object.fromEntries(tasks.map((t) => [t.key, false])), minPhotos: config.photo.min,
        source: isOffice ? 'office' : 'field', sortOrder: (all.length ? Math.max(...all.map((p: any) => p.sortOrder)) : 0) + 1,
      },
    });
    await db.roofCheckLog.create({ data: { pointId: point.id, fromStatus: null, toStatus: 'pending', comment: `Point ajouté ${isOffice ? 'au bureau' : 'sur chantier'} : ${label}`, userId: req.user!.id } });
    const changed = await syncParent(rc.id, req.user!.id);
    notifyRoof(projectId, point.id, changed, phase);
    res.status(201).json({ success: true, data: await loadPoint(point.id) });
  } catch (err) { next(err); }
});

// ============================================================================
// POINTS (terrain)
// ============================================================================

// PATCH /roof-checks/points/:pointId — { status?, comment?, tasksDone?, version }
// Commentaire obligatoire pour Partiel / Non fait / N.A. ; OK = toutes les tâches cochées + la photo.
// 409 (avec le point à jour) si version ≠ celle en base : quelqu'un l'a modifié entre-temps.
router.patch('/points/:pointId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { p, config } = await pointWithAccess(req, req.params.pointId, true);
    const b = req.body || {};
    if (!Number.isInteger(b.version)) throw new AppError('version manquante (recharge le plan de toiture)', 400);
    const conflict = async () => {
      const current = await loadPoint(p.id);
      const who = current?.checkedBy ? `${current.checkedBy.firstName} ${current.checkedBy.lastName}` : 'quelqu’un';
      return res.status(409).json({ success: false, error: `Ce point vient d’être modifié (par ${who}). Vérifie avant d’enregistrer.`, data: current });
    };
    if (b.version !== p.version) return conflict();
    const tasks: RoofTask[] = (Array.isArray(p.tasks) ? p.tasks : []).map((t: any) => ({ ...t, active: true }));
    const r = checkPointUpdate(
      { status: p.status, comment: p.comment, tasks, tasksDone: cleanTasksDone(p.tasksDone, tasks), minPhotos: p.minPhotos },
      { status: b.status, comment: b.comment, tasksDone: b.tasksDone }, p.photos, config.photo.mode,
    );
    if ('error' in r) throw new AppError(r.error, 400);
    const data: Record<string, unknown> = { status: r.status, comment: r.comment, tasksDone: r.tasksDone, version: { increment: 1 } };
    if (r.statusChanged) {
      data.checkedById = r.status === 'pending' ? null : req.user!.id;
      data.checkedAt = r.status === 'pending' ? null : new Date();
    }
    const updated = await db.$transaction(async (tx: any) => {
      const u = await tx.roofCheckPoint.updateMany({ where: { id: p.id, version: p.version }, data });
      if (u.count === 1 && r.statusChanged)
        await tx.roofCheckLog.create({ data: { pointId: p.id, fromStatus: p.status, toStatus: r.status, comment: r.comment, userId: req.user!.id } });
      return u.count;
    });
    if (updated !== 1) return conflict();
    const changed = r.statusChanged ? await syncParent(p.roofCheck.id, req.user!.id) : false;
    notifyRoof(p.roofCheck.projectId, p.id, changed, p.roofCheck.phase);
    res.json({ success: true, data: await loadPoint(p.id) });
  } catch (err) { next(err); }
});

// POST /roof-checks/points/:pointId/photos — multipart « file » (image) + taskKey? + takenAt? + width? + height?
router.post('/points/:pointId/photos', singleFile, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('Fichier manquant', 400);
    if (!req.file.mimetype.startsWith('image/')) throw new AppError('Seules les photos sont acceptées', 400);
    const { p } = await pointWithAccess(req, req.params.pointId, true);
    const taskKey = req.body?.taskKey ? String(req.body.taskKey) : null;
    if (taskKey && !(Array.isArray(p.tasks) ? p.tasks : []).some((t: any) => t.key === taskKey)) throw new AppError('Tâche inconnue pour ce point', 400);
    const takenAt = req.body?.takenAt ? new Date(String(req.body.takenAt)) : null;
    const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 100000 ? n : null; };
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `roof-checks/${p.roofCheck.projectId}`, { resource_type: 'image' });
    const photo = await db.roofCheckPhoto.create({
      data: {
        pointId: p.id, taskKey, photoUrl: url, publicId, width: int(req.body?.width), height: int(req.body?.height),
        takenAt: takenAt && !isNaN(takenAt.getTime()) ? takenAt : null, uploadedById: req.user!.id,
      },
    });
    notifyRoof(p.roofCheck.projectId, p.id, false, p.roofCheck.phase);
    res.status(201).json({ success: true, data: shapePhoto(photo) });
  } catch (err) { next(err); }
});

// DELETE /roof-checks/photos/:photoId — refusé si le point est OK et que la photo en est la preuve
router.delete('/photos/:photoId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const photo = await db.roofCheckPhoto.findUnique({ where: { id: req.params.photoId } });
    if (!photo) throw new AppError('Photo introuvable', 404);
    const { p, config } = await pointWithAccess(req, photo.pointId, true);
    const tasks: RoofTask[] = (Array.isArray(p.tasks) ? p.tasks : []).map((t: any) => ({ ...t, active: true }));
    const block = photoDeleteBlock({ status: p.status, tasks, minPhotos: p.minPhotos, tasksDone: cleanTasksDone(p.tasksDone, tasks) }, p.photos, photo.id, config.photo.mode);
    if (block) throw new AppError(block, 400);
    await db.roofCheckPhoto.delete({ where: { id: photo.id } });
    if (photo.publicId) await deleteFromCloudinary(photo.publicId, cloudinaryResourceType(photo.photoUrl));
    notifyRoof(p.roofCheck.projectId, p.id, false, p.roofCheck.phase);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /roof-checks/points/:pointId/logs — historique (le plus récent d'abord)
router.get('/points/:pointId/logs', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { p } = await pointWithAccess(req, req.params.pointId, false);
    const logs = await db.roofCheckLog.findMany({ where: { pointId: p.id }, orderBy: { createdAt: 'desc' } });
    const users = await userRefs(logs.map((l: any) => l.userId));
    res.json({ success: true, data: logs.map((l: any) => ({ ...l, user: l.userId ? users.get(l.userId) || null : null })) });
  } catch (err) { next(err); }
});

// ============================================================================
// CONTRÔLE (par id)
// ============================================================================

// GET /roof-checks/:id/model — paquet 3D du modèle publié (pour la vue 3D terrain, sans passer par /plans)
router.get('/:id/model', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rc = await db.roofCheck.findUnique({ where: { id: req.params.id } });
    if (!rc) throw new AppError('Contrôle toiture introuvable', 404);
    await assertProjectAccess(req.user, rc.projectId);
    if (!rc.modelVersionId) throw new AppError('Aucun modèle 3D associé à ce plan de toiture', 404);
    const mv = await db.plansModelVersion.findUnique({
      where: { id: rc.modelVersionId },
      select: { id: true, fileName: true, glbUrl: true, glbSize: true, glbParts: true, glbEncoding: true, settings: true, sceneIndex: true },
    });
    if (!mv) throw new AppError('Le modèle 3D de ce plan de toiture a été supprimé', 404);
    const settings = mv.settings && typeof mv.settings === 'object' ? mv.settings : {};
    res.json({
      success: true,
      data: {
        modelVersionId: mv.id, fileName: mv.fileName, glbUrl: mv.glbUrl, glbSize: mv.glbSize, glbParts: mv.glbParts, glbEncoding: mv.glbEncoding,
        fronts: (settings as any).fronts ?? {}, sceneIndex: mv.sceneIndex, levels: Array.isArray(rc.levels) ? rc.levels : [],
      },
    });
  } catch (err) { next(err); }
});

// DELETE /roof-checks/:id — supprime tout le contrôle (admin seulement) : points, photos, plans de fond, point de check-list
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, ['admin'], 'supprimer un contrôle toiture');
    if (req.body?.confirm !== true) throw new AppError('Confirmation manquante (confirm: true) : les photos du contrôle seront supprimées.', 400);
    const rc = await db.roofCheck.findUnique({ where: { id: req.params.id }, include: { points: { include: { photos: true } } } });
    if (!rc) throw new AppError('Contrôle toiture introuvable', 404);
    await assertProjectAccess(req.user, rc.projectId);
    await applyGenericReplacement(rc.projectId, rc.phase, false, req.user!.id);
    if (rc.checklistItemId) await db.projectChecklistItem.deleteMany({ where: { id: rc.checklistItemId, kind: 'roofmap' } });
    await db.roofCheck.delete({ where: { id: rc.id } });
    for (const p of rc.points) for (const ph of p.photos) if (ph.publicId) await deleteFromCloudinary(ph.publicId, cloudinaryResourceType(ph.photoUrl));
    for (const l of Array.isArray(rc.levels) ? rc.levels : []) {
      if (l?.svgPublicId) await deleteFromCloudinary(l.svgPublicId, 'raw');
      if (l?.pngPublicId) await deleteFromCloudinary(l.pngPublicId, 'image');
    }
    notifyRoof(rc.projectId, null, true, rc.phase);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
