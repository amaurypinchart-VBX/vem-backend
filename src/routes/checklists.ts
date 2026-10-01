// src/routes/checklists.ts
// Check-list de montage des handovers :
//   - bibliothèque de points par phase (installation | dismantling), éditable depuis l'admin ;
//   - check-list de chaque projet : copie des points choisis à la configuration (Technical Manager),
//     remplie point par point sur site (Site Manager) avec commentaires, photos et historique.
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { assertProjectAccess } from '../middleware/projectAccess';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService';
import { CHECKLIST_LIBRARY, parseLibraryItem } from '../services/checklistLibrary';
import {
  CHECKLIST_PHASES, CHECKLIST_STATUSES, COMMENT_REQUIRED_STATUSES, CHECKLIST_STATUS_LABELS, ChecklistStatus,
  loadProjectChecklist, loadChecklistItem, userRefs, PHOTO_ONLY, isPhoto,
} from '../services/checklistService';
import { io } from '../index';

const router = Router();
const db = prisma as any; // modèles ajoutés au schéma ; client typé régénéré au build Docker

// Configurer une check-list projet + éditer la bibliothèque
const CONFIGURE_ROLES = ['admin', 'technical_manager', 'project_manager'];
// Remplir (statut, commentaire, photos, validation)
const FILL_ROLES = [...CONFIGURE_ROLES, 'site_manager'];
const VIEWBOX_TYPES = ['ephemere', 'permanente'];
const DEFAULT_CUSTOM_CATEGORY = 'Points spécifiques au projet';

function requireRoles(req: AuthRequest, roles: string[], action: string): void {
  if (!req.user || !roles.includes(req.user.role))
    throw new AppError(`Permission insuffisante pour ${action}.`, 403);
}

function parsePhase(v: unknown): string {
  const phase = v === undefined || v === null || v === '' ? 'installation' : String(v);
  if (!(CHECKLIST_PHASES as readonly string[]).includes(phase))
    throw new AppError(`Phase invalide : ${phase} (${CHECKLIST_PHASES.join(', ')})`, 400);
  return phase;
}

/** Texte nettoyé (null si vide), longueur bornée. */
function text(v: unknown, max = 2000): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** Type Cloudinary d'un fichier d'après son URL (…/image/upload/…, …/raw/upload/…), pour le supprimer. */
function cloudinaryResourceType(url: string): 'image' | 'video' | 'raw' {
  const m = /\/(image|video|raw)\/upload\//.exec(url || '');
  return (m?.[1] as 'image' | 'video' | 'raw') || 'image';
}

function notifyChange(projectId: string, phase: string): void {
  try { io.to(`project:${projectId}`).emit('checklist:updated', { projectId, phase }); } catch { /* socket indisponible */ }
}

/** Point de check-list + projet auquel il appartient (404 si absent, 403 si projet non accessible). */
async function itemWithAccess(req: AuthRequest, itemId: string) {
  const item = await db.projectChecklistItem.findUnique({
    where: { id: itemId },
    include: {
      checklist: { select: { id: true, projectId: true, phase: true, validatedAt: true } },
      _count: { select: { photos: { where: PHOTO_ONLY } } }, // photos seulement (pas les documents)
    },
  });
  if (!item) throw new AppError('Point de check-list introuvable', 404);
  await assertProjectAccess(req.user, item.checklist.projectId);
  return item;
}

// Le rôle client n'a accès à rien ici (la page de signature publique passe par le handover).
router.use((req: AuthRequest, _res: Response, next: NextFunction) => {
  if (req.user?.role === 'client') return next(new AppError('Permission insuffisante', 403));
  next();
});

// ============================================================================
// BIBLIOTHÈQUE
// ============================================================================

// GET /checklists/templates?phase=installation[&all=1] — catégories + points triés (all=1 : avec les points désactivés)
router.get('/templates', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const phase = parsePhase(req.query.phase);
    const all = req.query.all === '1' || req.query.all === 'true';
    const categories = await db.checklistCategory.findMany({
      where: { phase },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: {
        items: { where: all ? {} : { active: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      },
    });
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

// POST /checklists/templates/seed — charge la bibliothèque Viewbox si elle est vide.
// Body { reset: true } (admin) : vide la bibliothèque puis la recharge. Les check-lists projet ne changent pas.
router.post('/templates/seed', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'charger la bibliothèque');
    const reset = req.body?.reset === true;
    if (reset && req.user!.role !== 'admin')
      throw new AppError('Seul un admin peut recharger la bibliothèque (les modifications seront perdues).', 403);
    if (!reset) {
      const count = await db.checklistCategory.count();
      if (count > 0) throw new AppError(`La bibliothèque contient déjà ${count} catégorie(s) : rien n’a été chargé.`, 409);
    }

    let categories = 0;
    let items = 0;
    await db.$transaction(async (tx: any) => {
      if (reset) {
        await tx.checklistTemplateItem.deleteMany({});
        await tx.checklistCategory.deleteMany({});
      }
      const orderByPhase: Record<string, number> = {};
      for (const cat of CHECKLIST_LIBRARY) {
        const sortOrder = orderByPhase[cat.phase] = (orderByPhase[cat.phase] ?? -1) + 1;
        const created = await tx.checklistCategory.create({ data: { name: cat.name, phase: cat.phase, sortOrder } });
        await tx.checklistTemplateItem.createMany({
          data: cat.items.map((raw, i) => ({ categoryId: created.id, sortOrder: i, ...parseLibraryItem(raw, cat.permanent) })),
        });
        categories++;
        items += cat.items.length;
      }
    }, { timeout: 30000 });

    res.json({ success: true, data: { categories, items, reset } });
  } catch (err) { next(err); }
});

// POST /checklists/templates/reorder — { type: 'categories' | 'items', ids: [...] } dans le nouvel ordre
router.post('/templates/reorder', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'modifier la bibliothèque');
    const { type, ids } = req.body || {};
    if (type !== 'categories' && type !== 'items') throw new AppError('type doit valoir categories ou items', 400);
    if (!Array.isArray(ids) || !ids.length) throw new AppError('ids requis (tableau non vide)', 400);
    const model = type === 'categories' ? db.checklistCategory : db.checklistTemplateItem;
    await db.$transaction(ids.map((id: unknown, i: number) => model.update({ where: { id: String(id) }, data: { sortOrder: i } })));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /checklists/templates/categories — { name, phase, sortOrder? }
router.post('/templates/categories', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'modifier la bibliothèque');
    const name = text(req.body?.name, 200);
    if (!name) throw new AppError('Nom de catégorie requis', 400);
    const phase = parsePhase(req.body?.phase);
    let sortOrder = Number(req.body?.sortOrder);
    if (!Number.isInteger(sortOrder)) {
      const max = await db.checklistCategory.aggregate({ where: { phase }, _max: { sortOrder: true } });
      sortOrder = (max._max?.sortOrder ?? -1) + 1;
    }
    const cat = await db.checklistCategory.create({ data: { name, phase, sortOrder }, include: { items: true } });
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// PATCH /checklists/templates/categories/:id — { name?, sortOrder?, phase? }
router.patch('/templates/categories/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'modifier la bibliothèque');
    const b = req.body || {};
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = text(b.name, 200);
      if (!name) throw new AppError('Nom de catégorie requis', 400);
      data.name = name;
    }
    if (b.sortOrder !== undefined) {
      if (!Number.isInteger(Number(b.sortOrder))) throw new AppError('sortOrder doit être un entier', 400);
      data.sortOrder = Number(b.sortOrder);
    }
    if (b.phase !== undefined) data.phase = parsePhase(b.phase);
    const cat = await db.checklistCategory.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// DELETE /checklists/templates/categories/:id — supprime la catégorie et ses points (pas les copies dans les projets)
router.delete('/templates/categories/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'modifier la bibliothèque');
    await db.checklistCategory.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

/** Champs d'un point de bibliothèque transmis dans le body (seuls ceux présents). */
function templateItemData(b: any): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (b.label !== undefined) {
    const label = text(b.label, 500);
    if (!label) throw new AppError('Libellé requis', 400);
    data.label = label;
  }
  if (b.hint !== undefined) data.hint = text(b.hint, 1000);
  if (b.scope !== undefined) {
    if (b.scope !== 'all' && b.scope !== 'permanent') throw new AppError('scope doit valoir all ou permanent', 400);
    data.scope = b.scope;
  }
  for (const flag of ['photoRequired', 'critical', 'optional', 'active']) {
    if (b[flag] !== undefined) data[flag] = b[flag] === true;
  }
  if (b.sortOrder !== undefined) {
    if (!Number.isInteger(Number(b.sortOrder))) throw new AppError('sortOrder doit être un entier', 400);
    data.sortOrder = Number(b.sortOrder);
  }
  return data;
}

// POST /checklists/templates/items — { categoryId, label, hint?, scope?, photoRequired?, critical?, optional?, sortOrder? }
router.post('/templates/items', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'modifier la bibliothèque');
    const b = req.body || {};
    if (!b.categoryId) throw new AppError('categoryId requis', 400);
    if (!text(b.label)) throw new AppError('Libellé requis', 400);
    const cat = await db.checklistCategory.findUnique({ where: { id: String(b.categoryId) }, select: { id: true } });
    if (!cat) throw new AppError('Catégorie introuvable', 404);
    const data = templateItemData(b);
    if (data.sortOrder === undefined) {
      const max = await db.checklistTemplateItem.aggregate({ where: { categoryId: cat.id }, _max: { sortOrder: true } });
      data.sortOrder = (max._max?.sortOrder ?? -1) + 1;
    }
    const item = await db.checklistTemplateItem.create({ data: { ...data, categoryId: cat.id } });
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

// PATCH /checklists/templates/items/:id — { categoryId?, label?, hint?, scope?, photoRequired?, critical?, optional?, active?, sortOrder? }
router.patch('/templates/items/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'modifier la bibliothèque');
    const b = req.body || {};
    const data = templateItemData(b);
    if (b.categoryId !== undefined) {
      const cat = await db.checklistCategory.findUnique({ where: { id: String(b.categoryId) }, select: { id: true } });
      if (!cat) throw new AppError('Catégorie introuvable', 404);
      data.categoryId = cat.id;
    }
    const item = await db.checklistTemplateItem.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// DELETE /checklists/templates/items/:id (les copies déjà faites dans les projets restent)
router.delete('/templates/items/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'modifier la bibliothèque');
    await db.checklistTemplateItem.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ============================================================================
// CHECK-LIST PROJET
// ============================================================================

// GET /checklists/project/:projectId?phase=installation — check-list + points + photos + stats (null si pas configurée)
router.get('/project/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const phase = parsePhase(req.query.phase);
    await assertProjectAccess(req.user, req.params.projectId);
    res.json({ success: true, data: await loadProjectChecklist(req.params.projectId, phase) });
  } catch (err) { next(err); }
});

interface CustomItemInput {
  id: string | null;
  categoryName: string;
  label: string;
  hint: string | null;
  photoRequired: boolean;
  critical: boolean;
}

// POST /checklists/project/:projectId/configure — crée ou met à jour la sélection de points.
// Body : { phase, viewboxType, templateItemIds: string[], customItems: [{ id?, categoryName, label, hint?, photoRequired, critical }], force? }
//   - templateItemIds = points de bibliothèque voulus (déjà présents : conservés tels quels, nouveaux : copiés) ;
//   - customItems = liste complète des points hors bibliothèque (ajoutés à la main, ou dont le modèle a été
//     supprimé) : avec id = point existant conservé (libellé/flags mis à jour), sans id = nouveau point ;
//   - un point existant absent des deux listes est retiré. S'il est déjà rempli (statut ≠ À vérifier ou photos),
//     il faut force: true, sinon 409 avec data.filledItems.
router.post('/project/:projectId/configure', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, CONFIGURE_ROLES, 'configurer la check-list');
    const { projectId } = req.params;
    await assertProjectAccess(req.user, projectId);
    const b = req.body || {};
    const phase = parsePhase(b.phase);
    const viewboxType = b.viewboxType === undefined ? 'ephemere' : String(b.viewboxType);
    if (!VIEWBOX_TYPES.includes(viewboxType)) throw new AppError('viewboxType doit valoir ephemere ou permanente', 400);
    if (b.templateItemIds !== undefined && !Array.isArray(b.templateItemIds)) throw new AppError('templateItemIds doit être un tableau', 400);
    if (b.customItems !== undefined && !Array.isArray(b.customItems)) throw new AppError('customItems doit être un tableau', 400);
    const force = b.force === true;

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) throw new AppError('Projet introuvable', 404);

    // Bibliothèque de la phase : rang de chaque catégorie et de chaque point, pour l'ordre d'affichage
    const categories = await db.checklistCategory.findMany({
      where: { phase },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { items: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    });
    const templates = new Map<string, { tpl: any; categoryName: string; catRank: number; itemRank: number }>();
    const catRankByName = new Map<string, number>();
    categories.forEach((cat: any, ci: number) => {
      if (!catRankByName.has(cat.name)) catRankByName.set(cat.name, ci);
      cat.items.forEach((tpl: any, ti: number) => templates.set(tpl.id, { tpl, categoryName: cat.name, catRank: ci, itemRank: ti }));
    });

    const selected = new Set<string>();
    for (const raw of b.templateItemIds || []) {
      const id = String(raw);
      if (!templates.has(id)) throw new AppError(`Point de bibliothèque introuvable pour cette phase (${id})`, 400);
      selected.add(id);
    }
    const customInput: CustomItemInput[] = (b.customItems || []).map((c: any) => {
      const label = text(c?.label, 500);
      if (!label) throw new AppError('Chaque point spécifique doit avoir un libellé', 400);
      return {
        id: c?.id ? String(c.id) : null,
        categoryName: text(c?.categoryName, 200) || DEFAULT_CUSTOM_CATEGORY,
        label,
        hint: text(c?.hint, 1000),
        photoRequired: c?.photoRequired === true,
        critical: c?.critical === true,
      };
    });

    const existing = await db.projectChecklist.findUnique({
      where: { projectId_phase: { projectId, phase } },
      include: { items: { include: { photos: { select: { publicId: true, photoUrl: true } } } } },
    });
    const existingItems: any[] = existing?.items || [];
    const isLinked = (it: any) => !!it.templateItemId && templates.has(it.templateItemId);

    // Points hors bibliothèque existants, conservés via customItems[].id
    const customById = new Map<string, CustomItemInput>();
    for (const c of customInput) {
      if (!c.id) continue;
      const it = existingItems.find((e) => e.id === c.id);
      if (!it || isLinked(it)) throw new AppError(`Point spécifique introuvable dans cette check-list (${c.id})`, 400);
      customById.set(c.id, c);
    }

    const kept: any[] = [];
    const removed: any[] = [];
    const linkedKept = new Set<string>();
    for (const it of existingItems) {
      const keep = isLinked(it)
        ? selected.has(it.templateItemId) && !linkedKept.has(it.templateItemId)
        : customById.has(it.id);
      if (keep) {
        kept.push(it);
        if (isLinked(it)) linkedKept.add(it.templateItemId);
      } else {
        removed.push(it);
      }
    }

    const filled = removed.filter((it) => it.status !== 'pending' || it.photos.length > 0);
    if (filled.length && !force) {
      return res.status(409).json({
        success: false,
        error: `${filled.length} point(s) déjà rempli(s) seraient supprimés de la check-list. Confirme pour les retirer quand même.`,
        data: {
          filledItems: filled.map((it) => ({
            id: it.id, categoryName: it.categoryName, label: it.label, status: it.status, photos: it.photos.length,
          })),
        },
      });
    }

    // Ordre final : catégories dans l'ordre de la bibliothèque (catégories hors bibliothèque à la fin),
    // points de bibliothèque dans leur ordre, points spécifiques à la fin de leur catégorie.
    const extraCatRank = new Map<string, number>();
    const catRankOf = (name: string) => {
      const lib = catRankByName.get(name);
      if (lib !== undefined) return lib;
      if (!extraCatRank.has(name)) extraCatRank.set(name, 1000 + extraCatRank.size);
      return extraCatRank.get(name)!;
    };
    type Entry = { catRank: number; categoryName: string; itemRank: number; existing?: any; create?: Record<string, unknown>; update?: Record<string, unknown> };
    const entries: Entry[] = [];
    for (const it of [...kept].sort((a, b2) => a.sortOrder - b2.sortOrder)) {
      if (isLinked(it)) {
        const t = templates.get(it.templateItemId)!;
        entries.push({ catRank: t.catRank, categoryName: it.categoryName, itemRank: t.itemRank, existing: it });
      } else {
        const c = customById.get(it.id)!;
        entries.push({
          catRank: catRankOf(c.categoryName), categoryName: c.categoryName, itemRank: 100000 + it.sortOrder, existing: it,
          update: { categoryName: c.categoryName, label: c.label, hint: c.hint, photoRequired: c.photoRequired, critical: c.critical },
        });
      }
    }
    for (const id of selected) {
      if (linkedKept.has(id)) continue;
      const t = templates.get(id)!;
      entries.push({
        catRank: t.catRank, categoryName: t.categoryName, itemRank: t.itemRank,
        create: {
          templateItemId: id, categoryName: t.categoryName, label: t.tpl.label, hint: t.tpl.hint,
          photoRequired: t.tpl.photoRequired, critical: t.tpl.critical,
        },
      });
    }
    customInput.filter((c) => !c.id).forEach((c, i) => {
      entries.push({
        catRank: catRankOf(c.categoryName), categoryName: c.categoryName, itemRank: 1000000 + i,
        create: { templateItemId: null, categoryName: c.categoryName, label: c.label, hint: c.hint, photoRequired: c.photoRequired, critical: c.critical },
      });
    });
    entries.sort((a, b2) => a.catRank - b2.catRank || a.categoryName.localeCompare(b2.categoryName) || a.itemRank - b2.itemRank);

    const added = entries.filter((e) => e.create).length;
    const now = new Date();
    await db.$transaction(async (tx: any) => {
      const checklist = existing
        ? await tx.projectChecklist.update({
            where: { id: existing.id },
            data: {
              viewboxType, configuredById: req.user!.id, configuredAt: now,
              // de nouveaux points à vérifier annulent la validation finale
              ...(added > 0 ? { validatedById: null, validatedAt: null } : {}),
            },
          })
        : await tx.projectChecklist.create({
            data: { projectId, phase, viewboxType, configuredById: req.user!.id, configuredAt: now },
          });
      if (removed.length) await tx.projectChecklistItem.deleteMany({ where: { id: { in: removed.map((it) => it.id) } } });
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const sortOrder = i * 10;
        if (e.create) {
          await tx.projectChecklistItem.create({ data: { ...e.create, checklistId: checklist.id, sortOrder } });
        } else if (e.update || e.existing.sortOrder !== sortOrder) {
          await tx.projectChecklistItem.update({ where: { id: e.existing.id }, data: { ...(e.update || {}), sortOrder } });
        }
      }
    }, { timeout: 30000 });

    // Photos des points retirés : supprimées de Cloudinary après coup (la base est déjà à jour)
    for (const it of removed) for (const p of it.photos) if (p.publicId) await deleteFromCloudinary(p.publicId, cloudinaryResourceType(p.photoUrl));

    notifyChange(projectId, phase);
    res.json({
      success: true,
      data: await loadProjectChecklist(projectId, phase),
      meta: { added, removed: removed.length, kept: kept.length },
    });
  } catch (err) { next(err); }
});

// PATCH /checklists/items/:itemId — { status?, comment? }
// Commentaire obligatoire pour Partiel / Non fait / N.A. ; OK refusé sur un point « photo obligatoire » sans photo.
// Chaque changement de statut est tracé dans l'historique (qui, quand, ancien → nouveau).
router.patch('/items/:itemId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, FILL_ROLES, 'remplir la check-list');
    const item = await itemWithAccess(req, req.params.itemId);
    const b = req.body || {};

    const status = (b.status === undefined ? item.status : String(b.status)) as ChecklistStatus;
    if (!(CHECKLIST_STATUSES as readonly string[]).includes(status)) throw new AppError(`Statut invalide : ${status}`, 400);
    const comment = b.comment === undefined ? item.comment : text(b.comment);
    if (COMMENT_REQUIRED_STATUSES.includes(status) && !comment)
      throw new AppError(`Commentaire obligatoire pour « ${CHECKLIST_STATUS_LABELS[status]} » : explique pourquoi.`, 400);
    if (status === 'ok' && item.photoRequired && item._count.photos === 0)
      throw new AppError('Photo obligatoire : ajoute au moins une photo avant de mettre ce point OK.', 400);

    const statusChanged = status !== item.status;
    const data: Record<string, unknown> = { status, comment };
    if (statusChanged) {
      data.checkedById = status === 'pending' ? null : req.user!.id;
      data.checkedAt = status === 'pending' ? null : new Date();
    }
    await db.$transaction(async (tx: any) => {
      await tx.projectChecklistItem.update({ where: { id: item.id }, data });
      if (statusChanged) {
        await tx.projectChecklistLog.create({
          data: { itemId: item.id, fromStatus: item.status, toStatus: status, comment, userId: req.user!.id },
        });
        // un point remis « À vérifier » annule la validation finale
        if (status === 'pending' && item.checklist.validatedAt) {
          await tx.projectChecklist.update({ where: { id: item.checklist.id }, data: { validatedById: null, validatedAt: null } });
        }
      }
    });

    notifyChange(item.checklist.projectId, item.checklist.phase);
    res.json({ success: true, data: await loadChecklistItem(item.id) });
  } catch (err) { next(err); }
});

// POST /checklists/items/:itemId/photos — multipart « file » (image), rangée dans vem/checklists/<projectId>
router.post('/items/:itemId/photos', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, FILL_ROLES, 'ajouter une photo');
    if (!req.file) throw new AppError('Fichier manquant', 400);
    if (!req.file.mimetype.startsWith('image/')) throw new AppError('Seules les photos sont acceptées', 400);
    const item = await itemWithAccess(req, req.params.itemId);
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `checklists/${item.checklist.projectId}`);
    const photo = await db.projectChecklistPhoto.create({
      data: { itemId: item.id, photoUrl: url, publicId, uploadedById: req.user!.id, kind: 'photo', fileName: req.file.originalname || null, mimeType: req.file.mimetype },
    });
    notifyChange(item.checklist.projectId, item.checklist.phase);
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

// POST /checklists/items/:itemId/documents — multipart « file » (PDF, Word, Excel, image…), même dossier que les photos.
// Un document ne compte pas comme photo pour la règle « photo obligatoire ».
router.post('/items/:itemId/documents', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, FILL_ROLES, 'ajouter un document');
    if (!req.file) throw new AppError('Fichier manquant ou type de fichier non accepté', 400);
    const item = await itemWithAccess(req, req.params.itemId);
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `checklists/${item.checklist.projectId}`);
    const doc = await db.projectChecklistPhoto.create({
      data: { itemId: item.id, photoUrl: url, publicId, uploadedById: req.user!.id, kind: 'document', fileName: req.file.originalname || 'document', mimeType: req.file.mimetype },
    });
    notifyChange(item.checklist.projectId, item.checklist.phase);
    res.status(201).json({ success: true, data: doc });
  } catch (err) { next(err); }
});

// DELETE /checklists/photos/:photoId — supprime une photo ou un document (Cloudinary + base)
router.delete('/photos/:photoId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, FILL_ROLES, 'supprimer une photo');
    const photo = await db.projectChecklistPhoto.findUnique({ where: { id: req.params.photoId } });
    if (!photo) throw new AppError('Fichier introuvable', 404);
    const item = await itemWithAccess(req, photo.itemId);
    if (isPhoto(photo) && item.status === 'ok' && item.photoRequired && item._count.photos <= 1)
      throw new AppError('Photo obligatoire : ce point est OK. Ajoute une autre photo ou change son statut avant de supprimer celle-ci.', 400);
    await db.projectChecklistPhoto.delete({ where: { id: photo.id } });
    if (photo.publicId) await deleteFromCloudinary(photo.publicId, cloudinaryResourceType(photo.photoUrl));
    notifyChange(item.checklist.projectId, item.checklist.phase);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /checklists/items/:itemId/logs — historique des statuts (le plus récent d'abord)
router.get('/items/:itemId/logs', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const item = await itemWithAccess(req, req.params.itemId);
    const logs = await db.projectChecklistLog.findMany({ where: { itemId: item.id }, orderBy: { createdAt: 'desc' } });
    const users = await userRefs(logs.map((l: any) => l.userId));
    res.json({
      success: true,
      data: logs.map((l: any) => ({ ...l, user: l.userId ? users.get(l.userId) || null : null })),
    });
  } catch (err) { next(err); }
});

// PATCH /checklists/:checklistId — { boxesChecked?, notes? }
router.patch('/:checklistId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, FILL_ROLES, 'modifier la check-list');
    const cl = await db.projectChecklist.findUnique({ where: { id: req.params.checklistId }, select: { id: true, projectId: true, phase: true } });
    if (!cl) throw new AppError('Check-list introuvable', 404);
    await assertProjectAccess(req.user, cl.projectId);
    const b = req.body || {};
    const data: Record<string, unknown> = {};
    if (b.boxesChecked !== undefined) data.boxesChecked = text(b.boxesChecked, 1000);
    if (b.notes !== undefined) data.notes = text(b.notes, 5000);
    const updated = await db.projectChecklist.update({ where: { id: cl.id }, data });
    notifyChange(cl.projectId, cl.phase);
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// POST /checklists/:checklistId/validate — validation finale par le Site Manager (refusée s'il reste des points À vérifier)
router.post('/:checklistId/validate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    requireRoles(req, FILL_ROLES, 'valider la check-list');
    const cl = await db.projectChecklist.findUnique({ where: { id: req.params.checklistId }, select: { id: true, projectId: true, phase: true } });
    if (!cl) throw new AppError('Check-list introuvable', 404);
    await assertProjectAccess(req.user, cl.projectId);
    const pending = await db.projectChecklistItem.count({ where: { checklistId: cl.id, status: 'pending' } });
    if (pending > 0) throw new AppError(`Il reste ${pending} point(s) « À vérifier » : impossible de valider la check-list.`, 400);
    const total = await db.projectChecklistItem.count({ where: { checklistId: cl.id } });
    if (total === 0) throw new AppError('La check-list ne contient aucun point.', 400);
    await db.projectChecklist.update({ where: { id: cl.id }, data: { validatedById: req.user!.id, validatedAt: new Date() } });
    notifyChange(cl.projectId, cl.phase);
    res.json({ success: true, data: await loadProjectChecklist(cl.projectId, cl.phase) });
  } catch (err) { next(err); }
});

export default router;
