// src/routes/publicInfoRequest.ts
// Route PUBLIQUE (sans connexion) de la page « Répondre en ligne » d'une demande d'infos (public/info-request.html).
// Le lien du mail contient un jeton de 32 caractères (info_requests.web_token) : c'est lui qui donne l'accès,
// seulement aux questions de cette demande. Monté sur /api/v1/public/info-request.
import { Router } from 'express';
import { rateLimit } from '../middleware/rateLimit';
import { AppError } from '../utils/AppError';
import { publicView, handleWebAnswers } from '../services/infoRequestService';

const router = Router();
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

router.get('/:token', limiter, async (req, res, next) => {
  try {
    if (!TOKEN_RE.test(req.params.token)) throw new AppError('Lien invalide', 404);
    const view = await publicView(req.params.token);
    if (!view) throw new AppError('Lien invalide ou expiré', 404);
    res.json({ success: true, data: view });
  } catch (err) { next(err); }
});

// POST /api/v1/public/info-request/:token — { answers: [{ number, value }] }
router.post('/:token', limiter, async (req, res, next) => {
  try {
    if (!TOKEN_RE.test(req.params.token)) throw new AppError('Lien invalide', 404);
    res.json({ success: true, data: await handleWebAnswers(req.params.token, req.body) });
  } catch (err) { next(err); }
});

export default router;
