// src/routes/planApprovals.ts — validation des plans par le client (côté VEM, connecté).
// Monté à /api/v1/plan-approvals (authMiddleware + scopeGuard('planApprovals')). Voir src/services/planApprovalService.ts.
// Lecture : toute personne qui a accès au projet. Envoi / renvoi / annulation : admin, technical manager, sales.
import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { assertProjectAccess } from '../middleware/projectAccess';
import { AppError } from '../utils/AppError';
import * as S from '../services/planApprovalService';

const router = Router();

const meta = (req: AuthRequest): S.Meta => ({ ip: req.ip || null, userAgent: req.get('user-agent') || null, userId: req.user?.id || null });
const actor = (req: AuthRequest) => ({ id: req.user!.id, role: req.access?.role || req.user!.role, firstName: req.user!.firstName, lastName: req.user!.lastName, email: req.user!.email });

async function projectOf(req: AuthRequest, id: string): Promise<string> {
  const projectId = await S.approvalProjectId(id);
  if (!projectId) throw new AppError('Demande introuvable', 404);
  await assertProjectAccess(req, projectId);
  return projectId;
}

// GET /plan-approvals/project/:projectId — demandes du projet (+ PDF du projet et contacts client pour l'envoi)
router.get('/project/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req, req.params.projectId);
    res.json({ success: true, data: await S.projectOverview(req.params.projectId, actor(req)) });
  } catch (err) { next(err); }
});

// POST /plan-approvals/project/:projectId { fileId, signerName, signerEmail, lang, message, revision, ccEmails, replaceIds }
router.post('/project/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req, req.params.projectId);
    res.status(201).json({ success: true, data: await S.createApproval(req.params.projectId, req.body || {}, actor(req), meta(req)) });
  } catch (err) { next(err); }
});

// POST /plan-approvals/:id/resend — renvoie le lien (prolonge sa validité)
router.post('/:id/resend', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await projectOf(req, req.params.id);
    res.json({ success: true, data: await S.resendApproval(req.params.id, actor(req), meta(req)) });
  } catch (err) { next(err); }
});

// POST /plan-approvals/:id/cancel — annule une demande en attente (le lien ne marche plus)
router.post('/:id/cancel', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await projectOf(req, req.params.id);
    await S.cancelApproval(req.params.id, actor(req), meta(req));
    res.json({ success: true, data: { cancelled: true } });
  } catch (err) { next(err); }
});

// POST /plan-approvals/:id/stamp — refait le PDF validé (si sa création avait échoué)
router.post('/:id/stamp', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await projectOf(req, req.params.id);
    res.json({ success: true, data: await S.restampApproval(req.params.id, actor(req)) });
  } catch (err) { next(err); }
});

export default router;
