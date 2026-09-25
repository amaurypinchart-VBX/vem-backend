// src/routes/plans.ts
// Module Plans Viewbox — modèles SketchUp analysés (index de scène + paquet GLB normalisé).
// L'analyse elle-même (lecture du .dae, nettoyage, classification) tourne dans le navigateur
// (public/plans, sources dans plans/) ; le serveur ne fait que stocker le résultat.
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService';

const router = Router();
const db = prisma as any; // modèle ajouté au schéma ; client typé régénéré au build Docker

const LIST_SELECT = {
  id: true, projectId: true, sourceFileId: true, fileName: true, sha256: true, sizeBytes: true,
  status: true, engineVersion: true, unitMeter: true, upAxis: true, stats: true, warnings: true,
  glbUrl: true, glbSize: true, createdById: true, createdAt: true, updatedAt: true,
};

// GET /plans/project/:projectId/models — versions analysées du projet (sans l'index, trop lourd)
router.get('/project/:projectId/models', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const models = await db.plansModelVersion.findMany({
      where: { projectId: req.params.projectId },
      orderBy: { updatedAt: 'desc' },
      select: LIST_SELECT,
    });
    res.json({ success: true, data: models });
  } catch (err) { next(err); }
});

// GET /plans/models/:id — une version complète (avec l'index de scène)
router.get('/models/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const model = await db.plansModelVersion.findUnique({ where: { id: req.params.id } });
    if (!model) throw new AppError('Modèle introuvable', 404);
    res.json({ success: true, data: model });
  } catch (err) { next(err); }
});

// POST /plans/project/:projectId/models — enregistre (ou remplace, même SHA-256) le résultat d'une analyse
// Body : { sourceFileId?, fileName, sourceUrl?, sha256, sizeBytes?, engineVersion?, unitMeter?, upAxis?, stats, warnings, sceneIndex }
router.post('/project/:projectId/models', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const b = req.body || {};
    if (!b.fileName || !b.sha256 || !b.sceneIndex) throw new AppError('fileName, sha256 et sceneIndex sont requis', 400);
    const data = {
      sourceFileId: b.sourceFileId ?? null,
      fileName: String(b.fileName),
      sourceUrl: b.sourceUrl ?? null,
      sizeBytes: Number.isFinite(b.sizeBytes) ? Math.round(b.sizeBytes) : null,
      engineVersion: b.engineVersion ?? null,
      unitMeter: Number.isFinite(b.unitMeter) ? b.unitMeter : null,
      upAxis: b.upAxis ?? null,
      stats: b.stats ?? {},
      warnings: b.warnings ?? [],
      sceneIndex: b.sceneIndex,
      status: 'indexed',
    };
    const existing = await db.plansModelVersion.findUnique({
      where: { projectId_sha256: { projectId, sha256: String(b.sha256) } },
      select: { id: true, glbPublicId: true },
    });
    let model;
    if (existing) {
      // Réanalyse du même fichier (règles ou moteur modifiés) : l'ancien paquet 3D n'est plus valable.
      if (existing.glbPublicId) await deleteFromCloudinary(existing.glbPublicId, 'raw');
      model = await db.plansModelVersion.update({
        where: { id: existing.id },
        data: { ...data, glbUrl: null, glbPublicId: null, glbSize: null },
        select: LIST_SELECT,
      });
    } else {
      model = await db.plansModelVersion.create({
        data: { ...data, projectId, sha256: String(b.sha256), createdById: req.user?.id ?? null },
        select: LIST_SELECT,
      });
    }
    res.status(existing ? 200 : 201).json({ success: true, data: model });
  } catch (err) { next(err); }
});

// POST /plans/models/:id/package — dépose le paquet GLB (multipart, champ "file")
router.post('/models/:id/package', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('Fichier GLB manquant (ou refusé : 50 Mo maximum)', 400);
    const model = await db.plansModelVersion.findUnique({ where: { id: req.params.id }, select: { id: true, projectId: true, glbPublicId: true } });
    if (!model) throw new AppError('Modèle introuvable', 404);
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `plans/${model.projectId}`, { resource_type: 'raw' });
    if (model.glbPublicId) await deleteFromCloudinary(model.glbPublicId, 'raw');
    const updated = await db.plansModelVersion.update({
      where: { id: model.id },
      data: { glbUrl: url, glbPublicId: publicId, glbSize: req.file.size, status: 'packaged' },
      select: LIST_SELECT,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /plans/models/:id
router.delete('/models/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const model = await db.plansModelVersion.findUnique({ where: { id: req.params.id }, select: { id: true, glbPublicId: true } });
    if (!model) throw new AppError('Modèle introuvable', 404);
    if (model.glbPublicId) await deleteFromCloudinary(model.glbPublicId, 'raw');
    await db.plansModelVersion.delete({ where: { id: model.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
