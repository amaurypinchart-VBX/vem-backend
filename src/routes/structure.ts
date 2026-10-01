// src/routes/structure.ts
// Module Plans Viewbox › Étude structure : bibliothèque partagée entre projets (types de pièces, gabarits de modules,
// sections, assemblages… ; la base de départ est dans le code du module, la table ne garde que ce que les
// utilisateurs ont confirmé ou modifié) et études (une par version de modèle : affectations des pièces, hypothèses).
// Tous les calculs se font dans le navigateur (public/plans, sources dans plans/src/structure).
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';

const router = Router();
const db = prisma as any; // modèles ajoutés au schéma ; client typé régénéré au build Docker

const KINDS = ['module_type', 'part_type', 'material', 'section', 'connection', 'spreading', 'stock'];
// écriture de la bibliothèque : mêmes profils que les réglages « plans.* »
const LIBRARY_EDITORS = ['admin', 'technical_manager', 'engineer'];
const canEditLibrary = (req: AuthRequest) => LIBRARY_EDITORS.includes(req.user?.role ?? '');

const str = (v: unknown, max = 500): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new AppError('Valeur texte attendue', 400);
  return v.slice(0, max);
};

const jsonSize = (v: unknown, max: number, label: string) => {
  if (JSON.stringify(v ?? null).length > max) throw new AppError(`${label} trop volumineux`, 400);
};

interface EntryInput {
  kind: string;
  key: string;
  name: string;
  data: unknown;
  source: string | null;
  disabled: boolean;
  keyStructRef: string | null;
  keyArticle: string | null;
  keyDefinition: string | null;
  keyFingerprint: string | null;
  keyModuleType: string | null;
}

/** Entrée de bibliothèque envoyée par le module (validation légère : les données sont typées côté client). */
function cleanEntry(b: any): EntryInput {
  if (!b || typeof b !== 'object') throw new AppError('Entrée invalide', 400);
  if (!KINDS.includes(b.kind)) throw new AppError(`Genre inconnu : ${b.kind}`, 400);
  const key = str(b.key, 120);
  if (!key || !/^[A-Za-z0-9_./:-]+$/.test(key)) throw new AppError('Clé invalide', 400);
  const name = str(b.name, 200);
  if (!name) throw new AppError('Nom requis', 400);
  jsonSize(b.data, 200_000, 'Données');
  const m = b.match && typeof b.match === 'object' ? b.match : {};
  return {
    kind: b.kind,
    key,
    name,
    data: b.data ?? {},
    source: str(b.source, 200),
    disabled: b.disabled === true,
    keyStructRef: str(m.structRef, 200),
    keyArticle: str(m.articleRef, 60),
    keyDefinition: str(m.definition, 300),
    keyFingerprint: str(m.fingerprint, 300),
    keyModuleType: str(m.moduleType, 200),
  };
}

const HISTORY_MAX = 50;

/** Crée ou met à jour une entrée (genre + clé), en gardant l'état précédent dans l'historique. */
async function upsertEntry(e: EntryInput, userId: string | undefined) {
  const existing = await db.structLibraryItem.findUnique({ where: { kind_key: { kind: e.kind, key: e.key } } });
  const now = new Date();
  if (!existing)
    return db.structLibraryItem.create({ data: { ...e, confirmedBy: userId ?? null, confirmedAt: now, history: [] } });
  const history = Array.isArray(existing.history) ? existing.history : [];
  const before = { name: existing.name, data: existing.data, disabled: existing.disabled, at: existing.updatedAt, by: existing.confirmedBy };
  return db.structLibraryItem.update({
    where: { id: existing.id },
    data: { ...e, confirmedBy: userId ?? null, confirmedAt: now, history: [...history, before].slice(-HISTORY_MAX) },
  });
}

// GET /structure/library — entrées confirmées ou modifiées (la base de départ est dans le module)
router.get('/library', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const items = await db.structLibraryItem.findMany({ orderBy: [{ kind: 'asc' }, { name: 'asc' }] });
    res.json({ success: true, data: items });
  } catch (err) { next(err); }
});

// POST /structure/library — crée ou remplace (même genre + clé) — admin, technical_manager, engineer
router.post('/library', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canEditLibrary(req)) throw new AppError('Bibliothèque : modification réservée aux admins, responsables techniques et ingénieurs', 403);
    const item = await upsertEntry(cleanEntry(req.body), req.user?.id);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// PUT /structure/library/:id — modifie une entrée (nom, données, désactivation, clés)
router.put('/library/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canEditLibrary(req)) throw new AppError('Bibliothèque : modification réservée aux admins, responsables techniques et ingénieurs', 403);
    const existing = await db.structLibraryItem.findUnique({ where: { id: req.params.id } });
    if (!existing) throw new AppError('Entrée introuvable', 404);
    const e = cleanEntry({ ...req.body, kind: existing.kind, key: existing.key });
    const item = await upsertEntry(e, req.user?.id);
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

// DELETE /structure/library/:id — supprime (une entrée de la base de départ redevient celle du module)
router.delete('/library/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canEditLibrary(req)) throw new AppError('Bibliothèque : modification réservée aux admins, responsables techniques et ingénieurs', 403);
    await db.structLibraryItem.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// POST /structure/library/import — import d'un export JSON { entries: [...] }
router.post('/library/import', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canEditLibrary(req)) throw new AppError('Bibliothèque : modification réservée aux admins, responsables techniques et ingénieurs', 403);
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : null;
    if (!entries) throw new AppError('Body.entries (tableau) requis', 400);
    if (entries.length > 2000) throw new AppError('Import limité à 2 000 entrées', 400);
    const clean = entries.map(cleanEntry);
    let count = 0;
    for (const e of clean) {
      await upsertEntry(e, req.user?.id);
      count++;
    }
    res.json({ success: true, data: { imported: count } });
  } catch (err) { next(err); }
});

// ─── études ───

function cleanStudy(b: any) {
  const out: Record<string, unknown> = {};
  if (b.name !== undefined) out.name = str(b.name, 200) ?? 'Étude structure';
  if (b.modelVersionId !== undefined) out.modelVersionId = str(b.modelVersionId, 60);
  for (const [k, max] of [['settings', 500_000], ['assignments', 2_000_000], ['resultsSummary', 500_000]] as const) {
    if (b[k] === undefined) continue;
    if (!b[k] || typeof b[k] !== 'object' || Array.isArray(b[k])) throw new AppError(`${k} doit être un objet`, 400);
    jsonSize(b[k], max, k);
    out[k] = b[k];
  }
  if (b.status !== undefined) out.status = str(b.status, 40) ?? 'draft';
  if (b.stale !== undefined) out.stale = b.stale === true;
  return out;
}

// GET /structure/project/:projectId/studies — études du projet (les plus récentes d'abord)
router.get('/project/:projectId/studies', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const studies = await db.structStudy.findMany({ where: { projectId: req.params.projectId }, orderBy: { updatedAt: 'desc' } });
    res.json({ success: true, data: studies });
  } catch (err) { next(err); }
});

// POST /structure/project/:projectId/studies — nouvelle étude (liée à une version de modèle)
router.post('/project/:projectId/studies', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await db.project.findUnique({ where: { id: req.params.projectId }, select: { id: true } });
    if (!project) throw new AppError('Projet introuvable', 404);
    const data = cleanStudy(req.body ?? {});
    const study = await db.structStudy.create({
      data: { name: 'Étude structure', ...data, projectId: req.params.projectId, createdBy: req.user?.id ?? null },
    });
    res.json({ success: true, data: study });
  } catch (err) { next(err); }
});

router.get('/studies/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const study = await db.structStudy.findUnique({ where: { id: req.params.id } });
    if (!study) throw new AppError('Étude introuvable', 404);
    res.json({ success: true, data: study });
  } catch (err) { next(err); }
});

// PUT /structure/studies/:id — enregistrement automatique (affectations, hypothèses, synthèse)
router.put('/studies/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const study = await db.structStudy.update({ where: { id: req.params.id }, data: cleanStudy(req.body ?? {}) });
    res.json({ success: true, data: study });
  } catch (err) { next(err); }
});

router.delete('/studies/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await db.structStudy.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

export default router;
