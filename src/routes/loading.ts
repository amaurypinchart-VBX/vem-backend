// src/routes/loading.ts
// Module Plans Viewbox › Loading liste : base de règles partagée entre projets (la base de départ est générée du
// classeur dans plans/src/loading/library/seed.ts ; la table ne garde que les règles validées dans l'app, avec un
// historique append-only), catalogue ajouté par validation, mémoire des produits identifiés (« Qu'est-ce que c'est ? »).
// Loading listes : une par version de modèle (topologie, valeurs saisies à la main, réponses, lignes).
// Tous les calculs se font dans le navigateur (public/plans, sources dans plans/src/loading).
// Écriture des règles, du catalogue et de la mémoire produits : admin et technical_manager (A. Pinchart 12.10.2026).
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { upload, uploadToCloudinary } from '../services/cloudinaryService';

const router = Router();
const db = prisma as any; // modèles ajoutés au schéma ; client typé régénéré au build Docker

const RULE_EDITORS = ['admin', 'technical_manager'];
const assertEditor = (req: AuthRequest) => {
  if (!RULE_EDITORS.includes(req.user?.role ?? ''))
    throw new AppError('Seuls un administrateur ou un responsable technique peuvent modifier les règles pour tous les projets.', 403);
};

const KINDS = ['accessoire', 'ajout_chantier', 'appreciation', 'substitution', 'kit', 'exclusion'];
const CONFIDENCES = ['confirme', 'a_confirmer', 'hypothese', 'observe'];
const SOURCES = ['seed', 'decision', 'correction', 'montre_3d', 'chantier_reel', 'atelier_texte'];
const REF = /^\d-\d{3}-\d{3,5}$/;
const KEY = /^[A-Za-z0-9_.:@/[\],+#!-]{3,200}$/;

const str = (v: unknown, max = 500): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') throw new AppError('Valeur texte attendue', 400);
  return v.slice(0, max);
};

/** Règle envoyée par le module (validation légère : les données sont typées et testées côté client). */
function cleanRule(r: any) {
  if (!r || typeof r !== 'object') throw new AppError('Règle invalide', 400);
  if (typeof r.key !== 'string' || !KEY.test(r.key)) throw new AppError('Clé de règle invalide', 400);
  if (!KINDS.includes(r.kind)) throw new AppError(`Genre de règle inconnu : ${r.kind}`, 400);
  if (typeof r.article !== 'string' || !(REF.test(r.article) || (r.kind === 'appreciation' && r.article.length <= 120)))
    throw new AppError(`Référence d’article invalide : ${r.article}`, 400);
  if (r.qty !== null && !(typeof r.qty === 'number' && Number.isFinite(r.qty) && r.qty >= 0)) throw new AppError('Quantité invalide', 400);
  if (typeof r.per !== 'string' || !r.per) throw new AppError('Base de comptage manquante', 400);
  if (!CONFIDENCES.includes(r.confidence)) throw new AppError('Confiance invalide', 400);
  if (!SOURCES.includes(r.source)) throw new AppError('Source invalide', 400);
  if (JSON.stringify(r).length > 50_000) throw new AppError('Règle trop volumineuse', 400);
  return r;
}

// GET /loading/rules — règles validées dans l'app (la base de départ est dans le module)
router.get('/rules', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db.loadingRule.findMany({ orderBy: [{ article: 'asc' }, { key: 'asc' }] });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/** Écrit la nouvelle version d'une règle et son historique (avant / après, qui, pourquoi, d'où). */
async function writeRule(req: AuthRequest, key: string, after: any | null, active: boolean, reason: string | null, source: string) {
  const existing = await db.loadingRule.findUnique({ where: { key } });
  const version = (existing?.version ?? 0) + 1;
  const projectId = str(req.body?.projectId, 60);
  const listId = str(req.body?.listId, 60);
  return prisma.$transaction(async (tx: any) => {
    let row = null;
    if (after === null) {
      if (existing) await tx.loadingRule.delete({ where: { key } });
    } else {
      const data = { ...after, key, active, version };
      const fields = { kind: after.kind, article: after.article, data, confidence: after.confidence, source: after.source, active, version, updatedBy: req.user?.id ?? null };
      row = existing
        ? await tx.loadingRule.update({ where: { key }, data: fields })
        : await tx.loadingRule.create({ data: { key, ...fields } });
    }
    await tx.loadingRuleHistory.create({
      data: {
        ruleKey: key,
        version,
        before: existing?.data ?? undefined,
        after: after === null ? undefined : { ...after, key, active, version },
        reason,
        source,
        projectId,
        listId,
        userId: req.user?.id ?? null,
      },
    });
    return row;
  });
}

// POST /loading/rules — crée ou remplace une règle (même clé) — admin, technical_manager
router.post('/rules', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    assertEditor(req);
    const rule = cleanRule(req.body?.rule);
    const reason = str(req.body?.reason, 1000);
    const row = await writeRule(req, rule.key, rule, rule.active !== false, reason, rule.source);
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
});

// PUT /loading/rules/:key/active — active / désactive (une règle de la base de départ : la ligne enregistrée la remplace)
router.put('/rules/:key/active', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    assertEditor(req);
    const key = req.params.key;
    if (!KEY.test(key)) throw new AppError('Clé de règle invalide', 400);
    const rule = req.body?.rule ? cleanRule(req.body.rule) : (await db.loadingRule.findUnique({ where: { key } }))?.data;
    if (!rule) throw new AppError('Règle introuvable : envoie la règle de la base de départ', 404);
    const active = req.body?.active === true;
    const row = await writeRule(req, key, { ...rule, key }, active, str(req.body?.reason, 1000), 'correction');
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// DELETE /loading/rules/:key — retour à la base de départ (la ligne enregistrée est supprimée, l'historique reste)
router.delete('/rules/:key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    assertEditor(req);
    const key = req.params.key;
    if (!(await db.loadingRule.findUnique({ where: { key } }))) throw new AppError('Règle introuvable', 404);
    await writeRule(req, key, null, false, str(req.body?.reason, 1000) ?? 'retour à la base de départ', 'correction');
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// GET /loading/rules/:key/history — toutes les versions d'une règle, la plus récente d'abord
router.get('/rules/:key/history', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db.loadingRuleHistory.findMany({ where: { ruleKey: req.params.key }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /loading/history — derniers changements de règles (tous articles)
router.get('/history', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const take = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const rows = await db.loadingRuleHistory.findMany({ orderBy: { createdAt: 'desc' }, take });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /loading/catalogue — références ajoutées par validation
router.get('/catalogue', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db.loadingCatalogueItem.findMany({ orderBy: { ref: 'asc' } });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /loading/catalogue — ajoute ou corrige une référence — admin, technical_manager
router.post('/catalogue', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    assertEditor(req);
    const ref = str(req.body?.ref, 20);
    if (!ref || !REF.test(ref)) throw new AppError('Référence invalide (format N-NNN-NNN)', 400);
    const designation = str(req.body?.designation, 300);
    if (!designation) throw new AppError('Désignation requise', 400);
    const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {};
    if (JSON.stringify(data).length > 10_000) throw new AppError('Données trop volumineuses', 400);
    const row = await db.loadingCatalogueItem.upsert({
      where: { ref },
      create: { ref, designation, data, createdBy: req.user?.id ?? null },
      update: { designation, data },
    });
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
});

// GET /loading/matches — mémoire des produits identifiés
router.get('/matches', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const rows = await db.loadingProductMatch.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /loading/matches — « Mémoriser » : signature de pièce → réf. catalogue — admin, technical_manager
router.post('/matches', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    assertEditor(req);
    const signature = str(req.body?.signature, 400);
    const article = str(req.body?.article, 20);
    if (!signature) throw new AppError('Signature requise', 400);
    if (!article || !REF.test(article)) throw new AppError('Référence invalide', 400);
    const triangles = Number.isInteger(req.body?.triangles) ? req.body.triangles : null;
    const fields = {
      article,
      keyDefinition: str(req.body?.keyDefinition, 300),
      keyFingerprint: str(req.body?.keyFingerprint, 300),
      triangles,
      userId: req.user?.id ?? null,
    };
    const row = await db.loadingProductMatch.upsert({ where: { signature }, create: { signature, ...fields }, update: fields });
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
});

// DELETE /loading/matches/:id — oublier une identification — admin, technical_manager
router.delete('/matches/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    assertEditor(req);
    await db.loadingProductMatch.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

// ─── loading listes (une par version de modèle) ───

const LIST_STATUSES = ['brouillon', 'validee'];

/** Champs d'une liste envoyés par le module (JSON calculé et typé côté client ; contrôle de taille seulement). */
function cleanList(b: any) {
  const out: Record<string, unknown> = {};
  for (const k of ['topology', 'overrides', 'answers', 'lines', 'corrections'] as const) {
    if (b[k] === undefined) continue;
    if (JSON.stringify(b[k]).length > 3_000_000) throw new AppError(`${k} trop volumineux`, 400);
    out[k] = b[k] ?? null;
  }
  if (b.status !== undefined) {
    if (!LIST_STATUSES.includes(b.status)) throw new AppError('Statut invalide', 400);
    out.status = b.status;
  }
  for (const k of ['rulesVersion', 'inputKey', 'orderNo'] as const) if (b[k] !== undefined) out[k] = str(b[k], 120);
  if (b.modelVersionId !== undefined) out.modelVersionId = str(b.modelVersionId, 60);
  return out;
}

// GET /loading/project/:projectId/lists — listes du projet (les plus récentes d'abord)
router.get('/project/:projectId/lists', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const lists = await db.loadingList.findMany({ where: { projectId: req.params.projectId }, orderBy: { updatedAt: 'desc' } });
    res.json({ success: true, data: lists });
  } catch (err) { next(err); }
});

// POST /loading/project/:projectId/lists — nouvelle liste (liée à une version de modèle)
router.post('/project/:projectId/lists', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await db.project.findUnique({ where: { id: req.params.projectId }, select: { id: true } });
    if (!project) throw new AppError('Projet introuvable', 404);
    const list = await db.loadingList.create({ data: { ...cleanList(req.body ?? {}), projectId: req.params.projectId, createdBy: req.user?.id ?? null } });
    res.status(201).json({ success: true, data: list });
  } catch (err) { next(err); }
});

router.get('/lists/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await db.loadingList.findUnique({ where: { id: req.params.id } });
    if (!list) throw new AppError('Loading liste introuvable', 404);
    res.json({ success: true, data: list });
  } catch (err) { next(err); }
});

// PUT /loading/lists/:id — enregistrement automatique (topologie, valeurs saisies, réponses, lignes)
router.put('/lists/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await db.loadingList.update({ where: { id: req.params.id }, data: cleanList(req.body ?? {}) });
    res.json({ success: true, data: list });
  } catch (err) { next(err); }
});

// POST /loading/lists/:id/export — enregistre l'Excel du bordereau dans les Fichiers du projet (Cloudinary raw,
// catégorie « loading_liste ») et passe la liste à la révision suivante
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
router.post('/lists/:id/export', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await db.loadingList.findUnique({ where: { id: req.params.id }, select: { id: true, projectId: true, revision: true } });
    if (!list) throw new AppError('Loading liste introuvable', 404);
    if (!req.file) throw new AppError('Fichier Excel manquant', 400);
    if (![XLSX, 'application/octet-stream'].includes(req.file.mimetype)) throw new AppError('Le bordereau doit être un fichier .xlsx', 400);
    if (req.file.size > 10 * 1024 * 1024) throw new AppError('Fichier de plus de 10 Mo : refusé par Cloudinary', 413);
    const fileName = (str(req.body?.fileName, 200) ?? `loading_v${list.revision}.xlsx`).replace(/[\\/:*?"<>|]+/g, '-');
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `projects/${list.projectId}/loading`, { resource_type: 'raw', public_id: fileName.replace(/\.xlsx$/i, '') + `-${Date.now()}.xlsx` });
    const file = await db.projectFile.create({
      data: { projectId: list.projectId, uploadedBy: req.user?.id ?? null, fileName, fileUrl: url, publicId, fileType: XLSX, fileSize: req.file.size, category: 'loading_liste' },
    });
    const updated = await db.loadingList.update({ where: { id: list.id }, data: { revision: list.revision + 1 } });
    res.status(201).json({ success: true, data: { file, list: updated } });
  } catch (err) { next(err); }
});

// POST /loading/lists/:id/validate — « Liste validée / envoyée à l'entrepôt » : fige la liste et garde, ligne par
// ligne, le prédit et le final (points de calage et jugements pour l'apprentissage)
router.post('/lists/:id/validate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await db.loadingList.findUnique({ where: { id: req.params.id } });
    if (!list) throw new AppError('Loading liste introuvable', 404);
    const obs = Array.isArray(req.body?.observations) ? req.body.observations.slice(0, 2000) : [];
    const rows = obs
      .filter((o: any) => o && typeof o.article === 'string' && REF.test(o.article))
      .map((o: any) => ({
        listId: list.id,
        article: o.article,
        ruleKeys: Array.isArray(o.ruleKeys) ? o.ruleKeys.slice(0, 20) : [],
        predicted: Number.isFinite(o.predicted) ? o.predicted : null,
        final: Number.isFinite(o.final) ? o.final : null,
        kind: ['calage', 'jugement', 'inconnu'].includes(o.kind) ? o.kind : 'calage',
        note: str(o.note, 500),
        userId: req.user?.id ?? null,
      }));
    const updated = await prisma.$transaction(async (tx: any) => {
      await tx.loadingObservation.deleteMany({ where: { listId: list.id, kind: { in: ['calage', 'jugement'] } } });
      if (rows.length) await tx.loadingObservation.createMany({ data: rows });
      return tx.loadingList.update({
        where: { id: list.id },
        data: { ...cleanList(req.body ?? {}), status: 'validee', validatedBy: req.user?.id ?? null, validatedAt: new Date() },
      });
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// GET /loading/validated-lists — listes validées (tous projets, les plus récentes d'abord) : rejouées pour l'impact
// d'une nouvelle règle (leur topologie, réponses et lignes finales sont gardées)
router.get('/validated-lists', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const take = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const lists = await db.loadingList.findMany({
      where: { status: 'validee' },
      orderBy: { validatedAt: 'desc' },
      take,
      select: { id: true, projectId: true, topology: true, answers: true, corrections: true, lines: true, validatedAt: true, orderNo: true, project: { select: { name: true, internalNumber: true } } },
    });
    res.json({ success: true, data: lists });
  } catch (err) { next(err); }
});

// GET /loading/observations — prédit / final des listes (calage automatique, questions en attente)
router.get('/observations', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const where: Record<string, unknown> = {};
    const kind = str(req.query.kind as string, 20);
    const article = str(req.query.article as string, 20);
    if (kind) where.kind = kind;
    if (article) where.article = article;
    const take = Math.min(2000, Math.max(1, Number(req.query.limit) || 500));
    const rows = await db.loadingObservation.findMany({ where, orderBy: { createdAt: 'desc' }, take });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// POST /loading/lists/:id/observations — « Je ne sais pas encore » (ou « seulement ce chantier ») sur une correction :
// gardé tout de suite, la question revient au prochain projet — tout utilisateur ayant l'accès Plans
router.post('/lists/:id/observations', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const list = await db.loadingList.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!list) throw new AppError('Loading liste introuvable', 404);
    const o = req.body ?? {};
    if (typeof o.article !== 'string' || !REF.test(o.article)) throw new AppError('Référence invalide', 400);
    const row = await db.loadingObservation.create({
      data: {
        listId: list.id,
        article: o.article,
        ruleKeys: Array.isArray(o.ruleKeys) ? o.ruleKeys.slice(0, 20) : [],
        predicted: Number.isFinite(o.predicted) ? o.predicted : null,
        final: Number.isFinite(o.final) ? o.final : null,
        kind: ['jugement', 'inconnu'].includes(o.kind) ? o.kind : 'inconnu',
        note: str(o.note, 500),
        userId: req.user?.id ?? null,
      },
    });
    res.status(201).json({ success: true, data: row });
  } catch (err) { next(err); }
});

router.delete('/lists/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await db.loadingList.delete({ where: { id: req.params.id } });
    res.json({ success: true, data: null });
  } catch (err) { next(err); }
});

export default router;
