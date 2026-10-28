// src/routes/infoRequests.ts
// Demandes d'infos par mail (monté sur /api/v1/info-requests, rôles « tous les projets » + site manager).
// Chaque route vérifie l'accès au projet concerné (assertProjectAccess) : un site manager ne voit que ses projets.
// Spec : docs/info-requests/PROMPT_Demandes_Infos_Mail.md
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { assertProjectAccess } from '../middleware/projectAccess';
import { AppError } from '../utils/AppError';
import * as S from '../services/infoRequestService';
import { INFO_FIELDS, GROUP_LABELS } from '../services/infoRequestLogic';

const router = Router();
const who = (req: AuthRequest) => `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.email || '';

async function requestAccess(req: AuthRequest, id: string) {
  const projectId = await S.requestProjectId(id);
  if (!projectId) throw new AppError('Demande introuvable', 404);
  await assertProjectAccess(req, projectId);
  return projectId;
}

// GET /info-requests/fields — infos qu'on peut demander
router.get('/fields', (_req, res) => {
  res.json({ success: true, data: { fields: INFO_FIELDS, groups: GROUP_LABELS } });
});

// GET /info-requests/status — mail / IMAP / IA configurés, adresse où arrivent les réponses
router.get('/status', (_req, res) => {
  res.json({ success: true, data: S.infoStatus() });
});

// GET /info-requests/project/:projectId — demandes du projet (après avoir fermé ce qui a été rempli dans VEM)
router.get('/project/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req, req.params.projectId);
    res.json({ success: true, data: await S.projectOverview(req.params.projectId) });
  } catch (err) { next(err); }
});

// POST /info-requests/project/:projectId/preview — HTML du mail + prochains rappels, sans rien envoyer
router.post('/project/:projectId/preview', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req, req.params.projectId);
    res.json({ success: true, data: await S.previewRequests(req.params.projectId, req.body, who(req)) });
  } catch (err) { next(err); }
});

// POST /info-requests/project/:projectId — crée et envoie (un mail par destinataire)
// Body : { lang, message, plan: { mode, intervalHours, firstAfterHours, skipWeekends, maxReminders },
//          items: [{ field, question?, neededBy?, recipient: { userId } | { email, name } }] }
router.post('/project/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req, req.params.projectId);
    if (!S.infoStatus().mail) throw new AppError("L'envoi de mails n'est pas configuré sur le serveur", 503);
    const r = await S.createRequests(req.params.projectId, req.body, req.user! as any);
    if (!r.created.length) {
      return res.status(502).json({ success: false, error: r.errors.map(e => `${e.recipient} : ${e.error}`).join(' · ') || 'Aucun mail envoyé', data: r });
    }
    res.status(201).json({ success: true, data: r });
  } catch (err) { next(err); }
});

// PATCH /info-requests/:id — { plan } (rythme) et / ou { status: 'stopped' | 'open' } (arrêter / reprendre)
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requestAccess(req, req.params.id);
    res.json({ success: true, data: await S.updateRequest(req.params.id, req.body, who(req)) });
  } catch (err) { next(err); }
});

// POST /info-requests/:id/remind — rappel tout de suite
router.post('/:id/remind', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requestAccess(req, req.params.id);
    const ok = await S.sendReminder(req.params.id, true, who(req));
    if (!ok) throw new AppError('Rien à rappeler : demande arrêtée ou plus aucune question en attente', 400);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /info-requests/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await requestAccess(req, req.params.id);
    await S.deleteRequest(req.params.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

// PATCH /info-requests/items/:itemId — { action: 'stop' | 'resume' | 'done' | 'neededBy', neededBy? }
router.patch('/items/:itemId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ref = await S.itemProjectId(req.params.itemId);
    if (!ref) throw new AppError('Question introuvable', 404);
    await assertProjectAccess(req, ref.projectId);
    res.json({ success: true, data: await S.updateItem(req.params.itemId, req.body, who(req)) });
  } catch (err) { next(err); }
});

export default router;
