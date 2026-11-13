// src/routes/roofChecks.ts
// Contrôle de l'étanchéité de toiture : plan de toiture cliquable (une pastille par jonction, croisement, extrémité,
// angle, raccord d'étage), rempli sur chantier avec une photo par point, résumé dans la check-list d'installation.
// Monté sur /api/v1/roof-checks avec authMiddleware + scopeGuard('roofChecks') : le chantier (site manager,
// installateur avec le droit « check-lists ») n'a pas besoin de l'accès Plans. Seule la publication du plan
// (depuis Plans Viewbox › Toiture) demande un rôle de configuration et l'accès Plans.
import { Router, Response, NextFunction, Request } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { assertProjectAccess } from '../middleware/projectAccess';
import { uploadToCloudinary, deleteFromCloudinary, FILE_MAX_BYTES } from '../services/cloudinaryService';
import { userRefs } from '../services/checklistService';
import { io } from '../index';
import {
  ROOF_POINT_TYPES, ROOF_TYPE_LABELS, RoofPointType, cleanRoofConfig, cleanTasks, cleanTasksDone, checkPointUpdate,
  photoDeleteBlock, planPublish, nextCode, tasksFor,
} from '../services/roofCheckRules';
import {
  loadRoofCheckView, loadPoint, ensureParentItem, syncParent, syncGenericItems, applyGenericReplacement, shapePhoto,
} from '../services/roofCheckService';

const router = Router();
const db = prisma as any; // modèles ajoutés au schéma ; client typé régénéré au build Docker

// Mêmes rôles que la check-list (src/routes/checklists.ts)
const CONFIGURE_ROLES = ['admin', 'technical_manager', 'project_manager'];
const FILL_ROLES = [...CONFIGURE_ROLES, 'site_manager'];
const PHASES = ['installation'];

const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: FILE_MAX_BYTES } });
/** Une photo « file » en mémoire ; trop lourde ⇒ 413 avec un message clair. */
const singleFile = (req: Request, res: Response, next: NextFunction) =>
  memUpload.single('file')(req, res, (err: any) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return next(new AppError(`Photo trop lourde (${Math.round(FILE_MAX_BYTES / 1048576)} Mo au plus).`, 413));
    next(err);
  });

function requireRoles(req: AuthRequest, roles: string[], action: string): void {
  if (!req.user) throw new AppError('Non autorisé', 401);
  if (!roles.includes(req.user.role)) throw new AppError(`Permission insuffisante pour ${action}.`, 403);
}

/** Remplir = comme la check-list : rôles de remplissage, ou installateur / ouvrier avec le droit « check-lists ». */
function canFill(req: AuthRequest): boolean {
  if (!req.user) return false;
  if (FILL_ROLES.includes(req.user.role)) return true;
  return req.access?.scope === 'team' && req.access.grants.includes('checklists');
}

function parsePhase(v: unknown): string {
  const phase = v === undefined || v === null || v === '' ? 'installation' : String(v);
  if (!PHASES.includes(phase)) throw new AppError(`Phase invalide : ${phase} (${PHASES.join(', ')})`, 400);
  return phase;
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

function perms(req: AuthRequest) {
  const role = req.user?.role;
  const canConfigure = !!role && CONFIGURE_ROLES.includes(role);
  return { canConfigure, canFill: canFill(req), canPublish: canConfigure && !!req.access?.plans };
}

/** Point + contrôle, accès projet vérifié ; écriture refusée si le point est archivé ou le contrôle désactivé. */
async function pointWithAccess(req: AuthRequest, pointId: string, forWrite: boolean) {
  const p = await db.roofCheckPoint.findUnique({
    where: { id: pointId },
    include: {
      roofCheck: { select: { id: true, projectId: true, phase: true, config: true, enabled: true } },
      photos: { select: { id: true } },
    },
  });
  if (!p) throw new AppError('Point du plan de toiture introuvable', 404);
  await assertProjectAccess(req, p.roofCheck.projectId);
  if (forWrite) {
    if (!canFill(req)) throw new AppError('Permission insuffisante pour remplir le contrôle de toiture.', 403);
    if (!p.roofCheck.enabled) throw new AppError('Le contrôle de l’étanchéité de toiture est désactivé pour ce projet.', 400);
    if (p.archived) throw new AppError('Ce point a été retiré du plan de toiture : il ne se remplit plus.', 400);
  }
  return p;
}

// Le rôle client n'a accès à rien ici (il voit le résumé dans le handover).
router.use((req: AuthRequest, _res: Response, next: NextFunction) => {
  if (req.user?.role === 'client') return next(new AppError('Permission insuffisante', 403));
  next();
});

// ============================================================================
// CONTRÔLE D'UN PROJET
// ============================================================================

// GET /roof-checks/project/:projectId?phase=installation[&archived=1] — schéma, points, photos, stats, droits
router.get('/project/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(req, projectId);
    const view = await loadRoofCheckView(projectId, parsePhase(req.query.phase), req.query.archived === '1');
    res.json({ success: true, data: { ...view, perms: perms(req), typeLabels: ROOF_TYPE_LABELS } });
  } catch (err) { next(err); }
});

/** Les points d'un type décoché ne comptent plus (excluded), ceux d'un type coché de nouveau reviennent. */
async function applyTypes(roofCheckId: string, types: Record<RoofPointType, boolean>): Promise<void> {
  for (const t of ROOF_POINT_TYPES) {
    if (t === 'custom') continue;
    await db.roofCheckPoint.updateMany({ where: { roofCheckId, type: t, excluded: types[t] }, data: { excluded: !types[t], version: { increment: 1 } } });
  }
}

// PUT /roof-checks/project/:projectId/config — { phase?, enabled?, critical?, includeCovered?, fieldPoints?,
// replaceGenericItems?, minPhotos?, types? }
router.put('/project/:projectId/config', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'configurer le contrôle de toiture');
    const { projectId } = req.params;
    await assertProjectAccess(req, projectId);
    const b = req.body || {};
    const phase = parsePhase(b.phase);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new AppError('Projet introuvable', 404);

    let rc = await db.roofCheck.findUnique({ where: { projectId_phase: { projectId, phase } } });
    const old = cleanRoofConfig(rc?.config);
    const patch: Record<string, unknown> = {};
    for (const k of ['fieldPoints', 'replaceGenericItems', 'includeCovered'] as const)
      if (b[k] !== undefined) { if (typeof b[k] !== 'boolean') throw new AppError(`${k} doit valoir true ou false`, 400); patch[k] = b[k]; }
    if (b.critical !== undefined) {
      if (b.critical !== null && typeof b.critical !== 'boolean') throw new AppError('critical doit valoir true, false ou null', 400);
      patch.critical = b.critical;
    }
    if (b.minPhotos !== undefined) patch.minPhotos = b.minPhotos;
    if (b.types !== undefined) {
      if (!b.types || typeof b.types !== 'object') throw new AppError('types doit être un objet { type: true/false }', 400);
      patch.types = { ...old.types, ...b.types };
    }
    if (b.enabled !== undefined && typeof b.enabled !== 'boolean') throw new AppError('enabled doit valoir true ou false', 400);
    const config = cleanRoofConfig({ ...old, ...patch });
    const enabled = b.enabled === undefined ? rc?.enabled ?? true : b.enabled;
    rc = rc
      ? await db.roofCheck.update({ where: { id: rc.id }, data: { config, enabled } })
      : await db.roofCheck.create({ data: { projectId, phase, config, enabled } });

    if (patch.types) await applyTypes(rc.id, config.types);
    if (patch.minPhotos !== undefined && config.minPhotos !== old.minPhotos)
      await db.roofCheckPoint.updateMany({ where: { roofCheckId: rc.id }, data: { minPhotos: config.minPhotos, version: { increment: 1 } } });
    if (enabled) await ensureParentItem(rc, req.user!.id);
    const changed = await syncParent(rc.id, req.user!.id);
    const generic = await syncGenericItems(rc, req.user!.id);
    notifyRoof(projectId, null, changed || generic > 0, phase);
    const view = await loadRoofCheckView(projectId, phase);
    res.json({ success: true, data: { ...view, perms: perms(req), typeLabels: ROOF_TYPE_LABELS } });
  } catch (err) { next(err); }
});

// ─── Publication depuis Plans Viewbox › Toiture ───

const num = z.number().finite();
const pt = z.tuple([num, num]);
const boxSchema = z.object({ id: z.string().max(60), label: z.string().max(60), c: z.array(pt).length(4) });
const pointSchema = z.object({
  key: z.string().min(1).max(300),
  code: z.string().min(1).max(30),
  type: z.enum(ROOF_POINT_TYPES),
  level: z.number().int().min(0).max(49),
  modules: z.array(z.string().max(60)).max(8).default([]),
  at: z.object({ x: num, z: num, y: num.optional() }),
  seg: z.object({ a: pt, b: pt }).nullish(),
  lengthMm: num.nonnegative().nullish(),
  label: z.string().max(200).nullish(),
  hint: z.string().max(300).nullish(),
  covered: z.boolean().default(false),
  order: z.number().int().min(0).max(100000),
});
const levelSchema = z.object({
  level: z.number().int().min(0).max(49),
  label: z.string().max(100),
  boxes: z.array(boxSchema).max(500),
  /** box de l'étage du dessus (hachurées sur le schéma : points « sous l'étage ») */
  above: z.array(boxSchema).max(500).default([]),
});
const publishSchema = z.object({
  phase: z.string().optional(),
  modelVersionId: z.string().max(100).nullish(),
  sha256: z.string().max(200).nullish(),
  engineVersion: z.string().max(100).nullish(),
  /** révision lue avant publication : refus si quelqu'un a publié entre-temps */
  expectedRevision: z.number().int().min(0).nullish(),
  levels: z.array(levelSchema).max(50),
  points: z.array(pointSchema).max(3000),
});

const geomOf = (p: z.infer<typeof pointSchema>) => ({
  at: p.at, ...(p.seg ? { seg: p.seg } : {}), ...(p.lengthMm != null ? { lengthMm: Math.round(p.lengthMm) } : {}),
});

// POST /roof-checks/project/:projectId/publish — { modelVersionId, sha256, engineVersion, expectedRevision, levels, points }
// Même clé ⇒ même point (statut, tâches cochées, photos gardés) ; absents ⇒ archivés (jamais supprimés) ;
// points ajoutés sur chantier toujours gardés. Les tâches viennent du type de point (roofCheckRules.tasksFor).
router.post('/project/:projectId/publish', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    requireRoles(req, CONFIGURE_ROLES, 'publier le plan de toiture');
    await assertProjectAccess(req, projectId);
    if (!req.access?.plans) throw new AppError('Accès aux Plans 2D non activé pour ton compte : le plan de toiture se publie depuis Plans Viewbox.', 403);
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
    const config = cleanRoofConfig(rc?.config);
    if (!rc) rc = await db.roofCheck.create({ data: { projectId, phase, config, enabled: true } });
    const cl = await db.projectChecklist.findUnique({ where: { projectId_phase: { projectId, phase } }, select: { viewboxType: true } });

    const existing = await db.roofCheckPoint.findMany({
      where: { roofCheckId: rc.id },
      select: { id: true, key: true, source: true, archived: true, status: true, tasksDone: true, photos: { select: { id: true } } },
    });
    const plan = planPublish(existing, b.points as Array<{ key: string }>);
    if ('error' in plan) throw new AppError(plan.error, 400);
    const revision = rc.revision + 1;
    const userId = req.user!.id;
    const byId = new Map(existing.map((e: any) => [e.id, e]));
    let reopened = 0;

    await db.$transaction(async (tx: any) => {
      for (const u of plan.updates) {
        const p = b.points[u.index];
        const old: any = byId.get(u.id);
        const tasks = tasksFor(p.type, cl?.viewboxType);
        const tasksDone = cleanTasksDone(old.tasksDone, tasks);
        // un point OK dont une tâche a été ajoutée (ou plus assez de photos) repasse « À faire »
        const reopen = old.status === 'ok' && (tasks.some((t) => !tasksDone[t.key]) || old.photos.length < config.minPhotos);
        await tx.roofCheckPoint.update({
          where: { id: u.id },
          data: {
            code: p.code, type: p.type, level: p.level, modules: p.modules, geom: geomOf(p),
            label: p.label ?? null, hint: p.hint ?? null, covered: p.covered, excluded: !config.types[p.type], sortOrder: p.order,
            tasks, tasksDone, minPhotos: config.minPhotos, archived: false, version: { increment: 1 },
            ...(reopen ? { status: 'pending', checkedById: null, checkedAt: null } : {}),
          },
        });
        if (u.unarchive) await tx.roofCheckLog.create({ data: { pointId: u.id, fromStatus: old.status, toStatus: reopen ? 'pending' : old.status, comment: `Remis sur le plan (publication n° ${revision}).`, userId } });
        if (reopen) {
          reopened++;
          await tx.roofCheckLog.create({ data: { pointId: u.id, fromStatus: 'ok', toStatus: 'pending', comment: `Tâches ou photos demandées modifiées (publication n° ${revision}) : à revérifier.`, userId } });
        }
      }
      for (const index of plan.creates) {
        const p = b.points[index];
        const tasks = tasksFor(p.type, cl?.viewboxType);
        await tx.roofCheckPoint.create({
          data: {
            roofCheckId: rc.id, key: p.key, code: p.code, type: p.type, level: p.level, modules: p.modules, geom: geomOf(p),
            label: p.label ?? null, hint: p.hint ?? null, covered: p.covered, excluded: !config.types[p.type], sortOrder: p.order,
            tasks, tasksDone: cleanTasksDone({}, tasks), minPhotos: config.minPhotos, source: 'model',
          },
        });
      }
      for (const id of plan.archives) {
        const old: any = byId.get(id);
        await tx.roofCheckPoint.update({ where: { id }, data: { archived: true, version: { increment: 1 } } });
        await tx.roofCheckLog.create({ data: { pointId: id, fromStatus: old.status, toStatus: old.status, comment: `Plus sur le plan (publication n° ${revision}) — statut et photos gardés.`, userId } });
      }
      await tx.roofCheck.update({
        where: { id: rc.id },
        data: {
          levels: b.levels, enabled: true, modelVersionId: b.modelVersionId ?? null, modelSha256: b.sha256 ?? null,
          engineVersion: b.engineVersion ?? null, revision, publishedById: userId, publishedAt: new Date(),
        },
      });
    }, { timeout: 120000 });

    rc = await db.roofCheck.findUnique({ where: { id: rc.id } });
    await ensureParentItem(rc, userId);
    const changed = await syncParent(rc.id, userId);
    const generic = await syncGenericItems(rc, userId);
    notifyRoof(projectId, null, changed || generic > 0, phase);
    const view = await loadRoofCheckView(projectId, phase);
    res.json({
      success: true,
      data: { ...view, perms: perms(req), typeLabels: ROOF_TYPE_LABELS },
      meta: {
        revision, created: plan.creates.length, updated: plan.updates.length, archived: plan.archives.length,
        unarchived: plan.updates.filter((u) => u.unarchive).length, reopened, genericReplaced: generic,
      },
    });
  } catch (err) { next(err); }
});

// POST /roof-checks/project/:projectId/points — point ajouté sur chantier { level, at: { x, z }, label }
router.post('/project/:projectId/points', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(req, projectId);
    if (!canFill(req)) throw new AppError('Permission insuffisante pour remplir le contrôle de toiture.', 403);
    const b = req.body || {};
    const phase = parsePhase(b.phase);
    const rc = await db.roofCheck.findUnique({ where: { projectId_phase: { projectId, phase } } });
    if (!rc || !rc.publishedAt) throw new AppError('Le plan de toiture n’est pas encore préparé.', 400);
    if (!rc.enabled) throw new AppError('Le contrôle de l’étanchéité de toiture est désactivé pour ce projet.', 400);
    const config = cleanRoofConfig(rc.config);
    const isOffice = CONFIGURE_ROLES.includes(req.user!.role);
    if (!config.fieldPoints && !isOffice) throw new AppError('L’ajout de points sur chantier n’est pas activé pour ce projet.', 403);
    const level = Number(b.level);
    const x = Number(b.at?.x), zz = Number(b.at?.z);
    if (!Number.isInteger(level) || level < 0 || level > 49) throw new AppError('Niveau invalide', 400);
    if (![x, zz].every(Number.isFinite)) throw new AppError('Position du point invalide', 400);
    const label = String(b.label ?? '').trim().slice(0, 200);
    if (!label) throw new AppError('Donne un nom au point (ex. « Traversée câble airco »).', 400);

    const all = await db.roofCheckPoint.findMany({ where: { roofCheckId: rc.id }, select: { code: true, sortOrder: true } });
    const tasks = tasksFor('custom');
    const point = await db.roofCheckPoint.create({
      data: {
        roofCheckId: rc.id, key: `field|${randomUUID()}`, code: nextCode(all.map((p: any) => p.code), level, 'P'),
        type: 'custom', level, modules: [], geom: { at: { x, z: zz } }, label, hint: null,
        tasks, tasksDone: cleanTasksDone({}, tasks), minPhotos: config.minPhotos, source: 'field',
        sortOrder: (all.length ? Math.max(...all.map((p: any) => p.sortOrder)) : 0) + 1,
      },
    });
    await db.roofCheckLog.create({ data: { pointId: point.id, fromStatus: null, toStatus: 'pending', comment: `Point ajouté : ${label}`, userId: req.user!.id } });
    const changed = await syncParent(rc.id, req.user!.id);
    notifyRoof(projectId, point.id, changed, phase);
    res.status(201).json({ success: true, data: await loadPoint(point.id) });
  } catch (err) { next(err); }
});

// ============================================================================
// POINTS (chantier)
// ============================================================================

// PATCH /roof-checks/points/:pointId — { status?, comment?, tasksDone?, version }
// Commentaire obligatoire pour Partiel / Non fait / N.A. ; OK = la photo prise (toutes les tâches cochées d'office).
// 409 (avec le point à jour) si version ≠ celle en base : quelqu'un l'a modifié entre-temps.
router.patch('/points/:pointId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const p = await pointWithAccess(req, req.params.pointId, true);
    const b = req.body || {};
    if (!Number.isInteger(b.version)) throw new AppError('version manquante (recharge le plan de toiture)', 400);
    const conflict = async () => {
      const current = await loadPoint(p.id);
      const who = current?.checkedBy ? `${current.checkedBy.firstName} ${current.checkedBy.lastName}` : 'quelqu’un';
      return res.status(409).json({ success: false, error: `Ce point vient d’être modifié (par ${who}). Vérifie avant d’enregistrer.`, data: current });
    };
    if (b.version !== p.version) return conflict();
    const tasks = cleanTasks(p.tasks);
    const r = checkPointUpdate(
      { status: p.status, comment: p.comment, tasks, tasksDone: cleanTasksDone(p.tasksDone, tasks), minPhotos: p.minPhotos },
      { status: b.status, comment: b.comment, tasksDone: b.tasksDone }, p.photos.length,
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

// POST /roof-checks/points/:pointId/photos — multipart « file » (image)
router.post('/points/:pointId/photos', singleFile, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('Photo manquante', 400);
    if (!req.file.mimetype.startsWith('image/')) throw new AppError('Seules les photos sont acceptées', 400);
    const p = await pointWithAccess(req, req.params.pointId, true);
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `roof-checks/${p.roofCheck.projectId}`, { resource_type: 'image' }, { name: req.file.originalname, mime: req.file.mimetype });
    const photo = await db.roofCheckPhoto.create({ data: { pointId: p.id, photoUrl: url, publicId, uploadedById: req.user!.id } });
    // le point bouge (photo de plus) : sa version aussi, pour que l'écran d'un autre téléphone se recharge
    await db.roofCheckPoint.update({ where: { id: p.id }, data: { version: { increment: 1 } } });
    notifyRoof(p.roofCheck.projectId, p.id, false, p.roofCheck.phase);
    const users = await userRefs([req.user!.id]);
    res.status(201).json({ success: true, data: { photo: shapePhoto(photo, users), point: await loadPoint(p.id) } });
  } catch (err) { next(err); }
});

// DELETE /roof-checks/photos/:photoId — refusé si le point est OK et que la photo en est la preuve
router.delete('/photos/:photoId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const photo = await db.roofCheckPhoto.findUnique({ where: { id: req.params.photoId } });
    if (!photo) throw new AppError('Photo introuvable', 404);
    const p = await pointWithAccess(req, photo.pointId, true);
    const block = photoDeleteBlock({ status: p.status, minPhotos: p.minPhotos }, p.photos.length);
    if (block) throw new AppError(block, 400);
    await db.roofCheckPhoto.delete({ where: { id: photo.id } });
    await db.roofCheckPoint.update({ where: { id: p.id }, data: { version: { increment: 1 } } });
    if (photo.publicId) await deleteFromCloudinary(photo.publicId, cloudinaryResourceType(photo.photoUrl));
    notifyRoof(p.roofCheck.projectId, p.id, false, p.roofCheck.phase);
    res.json({ success: true, data: await loadPoint(p.id) });
  } catch (err) { next(err); }
});

// GET /roof-checks/points/:pointId/logs — historique (le plus récent d'abord)
router.get('/points/:pointId/logs', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const p = await pointWithAccess(req, req.params.pointId, false);
    const logs = await db.roofCheckLog.findMany({ where: { pointId: p.id }, orderBy: { createdAt: 'desc' } });
    const users = await userRefs(logs.map((l: any) => l.userId));
    res.json({ success: true, data: logs.map((l: any) => ({ ...l, user: l.userId ? users.get(l.userId) || null : null })) });
  } catch (err) { next(err); }
});

// DELETE /roof-checks/:id — supprime tout le contrôle (admin) : points, photos, point de check-list
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, ['admin'], 'supprimer un contrôle de toiture');
    if (req.body?.confirm !== true) throw new AppError('Confirmation manquante (confirm: true) : les photos du contrôle seront supprimées.', 400);
    const rc = await db.roofCheck.findUnique({ where: { id: req.params.id }, include: { points: { include: { photos: true } } } });
    if (!rc) throw new AppError('Contrôle de toiture introuvable', 404);
    await assertProjectAccess(req, rc.projectId);
    await applyGenericReplacement(rc.projectId, rc.phase, false, req.user!.id);
    if (rc.checklistItemId) await db.projectChecklistItem.deleteMany({ where: { id: rc.checklistItemId, kind: 'roofmap' } });
    await db.roofCheck.delete({ where: { id: rc.id } });
    for (const p of rc.points) for (const ph of p.photos) if (ph.publicId) await deleteFromCloudinary(ph.publicId, cloudinaryResourceType(ph.photoUrl));
    notifyRoof(rc.projectId, null, true, rc.phase);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
