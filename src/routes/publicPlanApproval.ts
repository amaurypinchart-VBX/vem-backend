// src/routes/publicPlanApproval.ts — routes PUBLIQUES (sans compte) de la validation des plans par le client.
// Monté à /api/v1/public/plan-approval ; la page est public/plan-approval.html (servie à /plan-approval/:token).
// Le lien seul permet de voir les plans ; signer demande en plus le code envoyé par e-mail au signataire.
import { Router, Request, Response, NextFunction } from 'express';
import { rateLimit } from '../middleware/rateLimit';
import * as S from '../services/planApprovalService';

const router = Router();
const viewLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 120 });
const codeLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 15, message: 'Trop de demandes de code, réessayez dans quelques minutes. / Too many requests, please try again in a few minutes.' });
const signLimit = rateLimit({ windowMs: 10 * 60 * 1000, max: 20 });

const meta = (req: Request): S.Meta => ({ ip: req.ip || null, userAgent: req.get('user-agent') || null });

function sendPdf(res: Response, buffer: Buffer, fileName: string, download: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7E]+/g, '_').replace(/"/g, '');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.set('Cache-Control', 'private, no-store');
  res.send(buffer);
}

// GET /:token — infos de la page (projet, révision, état, réponse déjà donnée)
router.get('/:token', viewLimit, async (req, res, next: NextFunction) => {
  try { res.json({ success: true, data: await S.publicView(req.params.token, meta(req)) }); } catch (err) { next(err); }
});

// GET /:token/plans.pdf — le PDF envoyé (copie figée) ; ?download=1 = téléchargement
router.get('/:token/plans.pdf', viewLimit, async (req, res, next: NextFunction) => {
  try {
    const f = await S.publicPdf(req.params.token, 'original', meta(req));
    sendPdf(res, f.buffer, f.fileName, req.query.download === '1');
  } catch (err) { next(err); }
});

// GET /:token/signed.pdf — le PDF validé (cachet + certificat)
router.get('/:token/signed.pdf', viewLimit, async (req, res, next: NextFunction) => {
  try {
    const f = await S.publicPdf(req.params.token, 'signed', meta(req));
    sendPdf(res, f.buffer, f.fileName, req.query.download === '1');
  } catch (err) { next(err); }
});

// POST /:token/code — envoie le code à 6 chiffres à l'adresse du signataire
router.post('/:token/code', codeLimit, async (req, res, next: NextFunction) => {
  try { res.json({ success: true, data: await S.sendCode(req.params.token, meta(req)) }); } catch (err) { next(err); }
});

// POST /:token/sign { decision, comment, name, title, company, signature, reviewed, code }
router.post('/:token/sign', signLimit, async (req, res, next: NextFunction) => {
  try { res.json({ success: true, data: await S.sign(req.params.token, req.body || {}, meta(req)) }); } catch (err) { next(err); }
});

export default router;
