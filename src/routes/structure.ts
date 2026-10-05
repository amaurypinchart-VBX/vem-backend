// src/routes/structure.ts
// Module Plans Viewbox › Étude structure : bibliothèque partagée entre projets (types de pièces, gabarits de modules,
// sections, assemblages… ; la base de départ est dans le code du module, la table ne garde que ce que les
// utilisateurs ont confirmé ou modifié) et études (une par version de modèle : affectations des pièces, hypothèses).
// Rapports PDF : générés dans le navigateur, enregistrés sur Cloudinary (table struct_reports).
// IA (/ai/*) : proposer, regrouper, lire un document, rédiger, relire — jamais calculer (services/structureAi.ts) ;
// conseil ingénieur (/ai/advisor) : conversation dont les outils de calcul s'exécutent dans le navigateur (structureAdvisor.ts).
// Tous les calculs se font dans le navigateur (public/plans, sources dans plans/src/structure).
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService';
import { z } from 'zod';
import * as ai from '../services/structureAi';
import * as advisor from '../services/structureAdvisor';
import { projectIdParamGuard, projectParamGuard } from '../middleware/projectAccess';

const router = Router();
const db = prisma as any; // modèles ajoutés au schéma ; client typé régénéré au build Docker

// installer / site_manager / worker : uniquement les données de leurs projets (voir middleware/projectAccess.ts)
// (« :id » = étude ou rapport ; entrée de bibliothèque : ni l'un ni l'autre, pas de projet, on laisse passer)
const studyProjectId = async (id?: string | null): Promise<string | undefined> =>
  id ? (await db.structStudy.findUnique({ where: { id }, select: { projectId: true } }))?.projectId : undefined;
router.param('projectId', projectIdParamGuard);
router.param('id', projectParamGuard(async (id) =>
  (await studyProjectId(id))
  ?? (await studyProjectId((await db.structReport.findUnique({ where: { id }, select: { studyId: true } }))?.studyId))));

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
    const reports = await db.structReport.findMany({ where: { studyId: req.params.id }, select: { publicId: true } });
    await db.structStudy.delete({ where: { id: req.params.id } });
    for (const r of reports) if (r.publicId) await deleteFromCloudinary(r.publicId, 'raw');
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// ─── rapports PDF (générés dans le navigateur, enregistrés dans le projet) ───

// Cloudinary refuse les fichiers de plus de 10 Mo : le module réduit les images avant l'envoi
const REPORT_MAX_BYTES = 10 * 1024 * 1024;

// GET /structure/studies/:id/reports — rapports enregistrés (les plus récents d'abord)
router.get('/studies/:id/reports', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const reports = await db.structReport.findMany({ where: { studyId: req.params.id }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: reports });
  } catch (err) { next(err); }
});

// POST /structure/studies/:id/reports — PDF du rapport (multipart « file ») + langue, version, verdict, pages
router.post('/studies/:id/reports', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const study = await db.structStudy.findUnique({ where: { id: req.params.id }, select: { id: true, projectId: true } });
    if (!study) throw new AppError('Étude introuvable', 404);
    if (!req.file) throw new AppError('Fichier PDF manquant', 400);
    if (req.file.mimetype !== 'application/pdf') throw new AppError('Le rapport doit être un PDF', 400);
    if (req.file.size > REPORT_MAX_BYTES) throw new AppError('Rapport de plus de 10 Mo : refusé par Cloudinary', 413);
    const lang = ['fr', 'de', 'en'].includes(req.body?.lang) ? req.body.lang : 'fr';
    const variant = req.body?.variant === 'detailed' ? 'detailed' : 'compact';
    const verdict = ['ok', 'limit', 'fail', 'incomplete'].includes(req.body?.verdict) ? req.body.verdict : null;
    const pages = Number.isFinite(Number(req.body?.pages)) ? Math.max(0, Math.round(Number(req.body.pages))) : null;
    const fileName = (str(req.body?.fileName, 200) ?? req.file.originalname ?? 'rapport.pdf').replace(/[\\/:*?"<>|]+/g, '-');
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `plans/${study.projectId}/structure`, { resource_type: 'raw', public_id: `rapport-${Date.now()}.pdf` });
    const report = await db.structReport.create({
      data: { studyId: study.id, lang, variant, verdict, pages, fileName, url, publicId, sizeBytes: req.file.size, createdBy: req.user?.id ?? null },
    });
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

// DELETE /structure/reports/:id — rapport enregistré (et son fichier)
router.delete('/reports/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await db.structReport.findUnique({ where: { id: req.params.id } });
    if (!report) throw new AppError('Rapport introuvable', 404);
    await db.structReport.delete({ where: { id: report.id } });
    if (report.publicId) await deleteFromCloudinary(report.publicId, 'raw');
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// ─── IA (proposer, regrouper, lire un document, rédiger, relire : jamais calculer) ───

const ctxOf = (req: AuthRequest, studyId?: string | null) => ({ userId: req.user?.id, studyId: studyId ?? null });
const parseBody = <T>(schema: z.ZodType<T, any, any>, body: unknown): T => {
  const r = schema.safeParse(body);
  if (r.success === false) throw new AppError(`Demande IA invalide : ${r.error.message.slice(0, 200)}`, 400);
  return (r as { data: T }).data;
};
// PDF envoyé tel quel à l'IA (limite de taille d'une requête Anthropic)
const REFERENCE_MAX_BYTES = 20 * 1024 * 1024;

// GET /structure/ai/status — IA disponible (clé configurée) et modèle utilisé
router.get('/ai/status', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: { enabled: ai.aiEnabled(), model: ai.STRUCTURE_MODEL } });
  } catch (err) { next(err); }
});

// POST /structure/ai/identify — proposition pour un type de pièce inconnu (reste « proposé » jusqu'à validation)
router.post('/ai/identify', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const inp = parseBody(ai.IdentifyInput, req.body);
    res.json({ success: true, data: await ai.identifyPart(inp, ctxOf(req, inp.studyId)) });
  } catch (err) { next(err); }
});

// POST /structure/ai/group — types inconnus qui sont la même chose
router.post('/ai/group', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const inp = parseBody(ai.GroupInput, req.body);
    res.json({ success: true, data: await ai.groupTypes(inp, ctxOf(req, inp.studyId)) });
  } catch (err) { next(err); }
});

// POST /structure/ai/extract-reference — PDF de référence → entrées de bibliothèque proposées (revue avant import)
router.post('/ai/extract-reference', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canEditLibrary(req)) throw new AppError('Réservé aux admins, responsables techniques et ingénieurs', 403);
    if (!req.file) throw new AppError('Fichier PDF manquant', 400);
    if (req.file.mimetype !== 'application/pdf') throw new AppError('Le document doit être un PDF', 400);
    if (req.file.size > REFERENCE_MAX_BYTES) throw new AppError('PDF de plus de 20 Mo : n’envoyer que les pages utiles (par exemple l’annexe de calcul, imprimée en PDF)', 413);
    const reportRef = str(req.body?.reportRef, 60);
    if (!reportRef) throw new AppError('Numéro ou nom du document requis', 400);
    const data = await ai.extractReference(req.file.buffer, { reportRef, hint: str(req.body?.hint, 500) ?? undefined }, ctxOf(req));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// POST /structure/ai/write — textes du rapport (description, consignes, conclusion), sans chiffre hors des données
router.post('/ai/write', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const inp = parseBody(ai.WriteInput, req.body);
    jsonSize(inp.facts, 200_000, 'Données');
    res.json({ success: true, data: await ai.writeTexts(inp, ctxOf(req, inp.studyId)) });
  } catch (err) { next(err); }
});

// POST /structure/ai/review — relecture de cohérence (alertes affichées, le calcul ne change pas)
router.post('/ai/review', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const inp = parseBody(ai.ReviewInput, req.body);
    jsonSize(inp.facts, 200_000, 'Données');
    res.json({ success: true, data: await ai.reviewStudy(inp, ctxOf(req, inp.studyId)) });
  } catch (err) { next(err); }
});

// POST /structure/ai/material-search — données d'un panneau / matériau cherchées sur internet (sources citées)
router.post('/ai/material-search', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const inp = parseBody(ai.MaterialInput, req.body);
    res.json({ success: true, data: await ai.searchMaterial(inp, ctxOf(req, inp.studyId)) });
  } catch (err) { next(err); }
});

// POST /structure/ai/advisor — un tour du conseil ingénieur (le navigateur exécute les outils et renvoie leurs résultats)
router.post('/ai/advisor', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const inp = parseBody(advisor.AdvisorInput, req.body);
    jsonSize(inp.messages, 4_000_000, 'Conversation');
    res.json({ success: true, data: await advisor.advisorTurn(inp, ctxOf(req, inp.studyId)) });
  } catch (err) { next(err); }
});

// GET / PUT /structure/studies/:id/advisor — conversation enregistrée avec l'étude (et variantes simulées)
router.get('/studies/:id/advisor', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await db.structAdvisorThread.findUnique({ where: { studyId: req.params.id } });
    res.json({ success: true, data: t ?? { studyId: req.params.id, messages: [], variants: [] } });
  } catch (err) { next(err); }
});

router.put('/studies/:id/advisor', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const study = await db.structStudy.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!study) throw new AppError('Étude introuvable', 404);
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const variants = Array.isArray(req.body?.variants) ? req.body.variants : [];
    jsonSize(messages, 8_000_000, 'Conversation');
    jsonSize(variants, 2_000_000, 'Variantes');
    const data = { messages, variants, updatedBy: req.user?.id ?? null };
    const t = await db.structAdvisorThread.upsert({ where: { studyId: req.params.id }, create: { studyId: req.params.id, ...data }, update: data });
    res.json({ success: true, data: { studyId: t.studyId, updatedAt: t.updatedAt } });
  } catch (err) { next(err); }
});

// GET /structure/ai/calls — appels des 30 derniers jours et coût estimé
router.get('/ai/calls', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await ai.recentCalls(30) });
  } catch (err) { next(err); }
});

export default router;
