// src/routes/settings.ts
// API CRUD simple pour les settings globaux de l'application.
// Stockés dans la table app_settings en key/value JSON.
// Lecture publique (toute personne authentifiée), écriture admin seulement.
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

// GET /settings/:key — retourne la valeur du setting (ou null si absent)
router.get('/:key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const s = await (prisma as any).appSetting.findUnique({ where: { key: req.params.key } });
    res.json({ success: true, data: s?.value ?? null });
  } catch (err) { next(err); }
});

// Réglages du module Plans Viewbox (clés « plans.* » : règles de classement…) : aussi modifiables par les
// profils techniques qui préparent les plans.
const PLANS_EDITORS = ['admin', 'technical_manager', 'engineer'];
const canWrite = (role: string | undefined, key: string) => role === 'admin' || (key.startsWith('plans.') && PLANS_EDITORS.includes(role ?? ''));

// PUT /settings/:key — crée ou met à jour (admin ; clés plans.* : admin + technical_manager + engineer)
// Body : { value: any }
router.put('/:key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canWrite(req.user?.role, req.params.key)) throw new AppError('Réservé aux admins', 403);
    const value = req.body.value;
    if (value === undefined) throw new AppError('Body.value requis', 400);
    const s = await (prisma as any).appSetting.upsert({
      where:  { key: req.params.key },
      update: { value },
      create: { key: req.params.key, value },
    });
    res.json({ success: true, data: s.value });
  } catch (err) { next(err); }
});

// DELETE /settings/:key — supprime (mêmes droits que PUT)
router.delete('/:key', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!canWrite(req.user?.role, req.params.key)) throw new AppError('Réservé aux admins', 403);
    await (prisma as any).appSetting.delete({ where: { key: req.params.key } }).catch(() => null);
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;