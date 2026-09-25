// src/routes/plans.ts
// Module Plans Viewbox — modèles SketchUp analysés (index de scène + paquet GLB normalisé).
// L'analyse elle-même (lecture du .dae, nettoyage, classification) tourne dans le navigateur
// (public/plans, sources dans plans/) ; le serveur ne fait que stocker le résultat.
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { upload, uploadToCloudinary, deleteFromCloudinary } from '../services/cloudinaryService';

const router = Router();
const db = prisma as any; // modèle ajouté au schéma ; client typé régénéré au build Docker

const LIST_SELECT = {
  id: true, projectId: true, sourceFileId: true, fileName: true, sha256: true, sizeBytes: true,
  status: true, engineVersion: true, unitMeter: true, upAxis: true, stats: true, warnings: true,
  glbUrl: true, glbSize: true, glbParts: true, glbEncoding: true, settings: true, createdById: true, createdAt: true, updatedAt: true,
};

type PackagePart = { url: string; publicId: string; size: number };

/** Supprime de Cloudinary tous les fichiers du paquet 3D (ancien paquet unique ou morceaux). */
async function deletePackageAssets(m: { glbPublicId?: string | null; glbParts?: unknown }): Promise<void> {
  const ids = new Set<string>();
  if (m.glbPublicId) ids.add(m.glbPublicId);
  if (Array.isArray(m.glbParts)) for (const p of m.glbParts as PackagePart[]) if (p?.publicId) ids.add(p.publicId);
  for (const id of ids) await deleteFromCloudinary(id, 'raw');
}

// champ JSON nullable : Prisma exige DbNull (et non null) pour remettre la colonne à NULL
const PACKAGE_RESET = { glbUrl: null, glbPublicId: null, glbSize: null, glbParts: Prisma.DbNull, glbEncoding: null };

/** Réglages d'un modèle (face avant de chaque Viewbox, caméras enregistrées) : objet JSON, fusion clé par clé. */
function cleanSettings(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new AppError('settings doit être un objet', 400);
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[a-zA-Z0-9_]{1,40}$/.test(k)) throw new AppError(`Réglage invalide : ${k}`, 400);
    out[k] = val;
  }
  if (JSON.stringify(out).length > 200_000) throw new AppError('Réglages trop volumineux', 400);
  return out;
}

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
      select: { id: true, glbPublicId: true, glbParts: true },
    });
    let model;
    if (existing) {
      // Réanalyse du même fichier (règles ou moteur modifiés) : l'ancien paquet 3D n'est plus valable.
      await deletePackageAssets(existing);
      model = await db.plansModelVersion.update({
        where: { id: existing.id },
        data: { ...data, ...PACKAGE_RESET },
        select: LIST_SELECT,
      });
    } else {
      // nouvelle version du modèle : on reprend les réglages de la précédente (faces avant, caméras)
      const previous = await db.plansModelVersion.findFirst({
        where: { projectId },
        orderBy: { updatedAt: 'desc' },
        select: { settings: true },
      });
      model = await db.plansModelVersion.create({
        data: { ...data, projectId, sha256: String(b.sha256), settings: previous?.settings ?? {}, createdById: req.user?.id ?? null },
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

// POST /plans/models/:id/package/part — paquet GLB compressé, envoyé en morceaux (Cloudinary refuse les
// fichiers de plus de 10 Mo sur l'offre actuelle). Multipart : file + index, count, encoding, totalSize.
// Le morceau 0 remplace l'ancien paquet ; au dernier morceau, le paquet devient disponible.
router.post('/models/:id/package/part', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new AppError('Morceau du paquet manquant', 400);
    const index = Number(req.body?.index);
    const count = Number(req.body?.count);
    const totalSize = Number(req.body?.totalSize);
    const encoding = req.body?.encoding === 'gzip' ? 'gzip' : null;
    if (!Number.isInteger(index) || !Number.isInteger(count) || count < 1 || count > 200 || index < 0 || index >= count) {
      throw new AppError('index / count invalides', 400);
    }
    const model = await db.plansModelVersion.findUnique({
      where: { id: req.params.id },
      select: { id: true, projectId: true, glbPublicId: true, glbParts: true },
    });
    if (!model) throw new AppError('Modèle introuvable', 404);
    let parts: PackagePart[] = Array.isArray(model.glbParts) ? [...(model.glbParts as PackagePart[])] : [];
    if (index === 0) {
      await deletePackageAssets(model);
      parts = [];
      await db.plansModelVersion.update({ where: { id: model.id }, data: { ...PACKAGE_RESET, status: 'indexed' } });
    }
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `plans/${model.projectId}`, { resource_type: 'raw' });
    parts[index] = { url, publicId, size: req.file.size };
    const complete = index === count - 1;
    if (complete && (parts.length !== count || parts.some((p) => !p))) {
      throw new AppError('Paquet incomplet : recommence l’enregistrement', 400);
    }
    const updated = await db.plansModelVersion.update({
      where: { id: model.id },
      data: complete
        ? { glbParts: parts, glbUrl: parts[0].url, glbPublicId: null, glbSize: Number.isFinite(totalSize) ? Math.round(totalSize) : null, glbEncoding: encoding, status: 'packaged' }
        : { glbParts: parts },
      select: LIST_SELECT,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// PATCH /plans/models/:id/settings — { settings: { fronts?, cameras?, … } } fusionné avec l'existant
router.patch('/models/:id/settings', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const patch = cleanSettings(req.body?.settings);
    const model = await db.plansModelVersion.findUnique({ where: { id: req.params.id }, select: { id: true, settings: true } });
    if (!model) throw new AppError('Modèle introuvable', 404);
    const current = model.settings && typeof model.settings === 'object' && !Array.isArray(model.settings) ? model.settings : {};
    const updated = await db.plansModelVersion.update({
      where: { id: model.id },
      data: { settings: { ...current, ...patch } },
      select: { id: true, settings: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// DELETE /plans/models/:id
router.delete('/models/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const model = await db.plansModelVersion.findUnique({ where: { id: req.params.id }, select: { id: true, glbPublicId: true, glbParts: true } });
    if (!model) throw new AppError('Modèle introuvable', 404);
    await deletePackageAssets(model);
    await db.plansModelVersion.delete({ where: { id: model.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
