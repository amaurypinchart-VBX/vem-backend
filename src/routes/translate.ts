// src/routes/translate.ts
// Endpoint générique de traduction via OpenAI.
// Le frontend peut envoyer un batch de strings et recevoir leurs traductions.

import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { translateTexts } from '../services/translationService';

const router = Router();

// POST /api/translate
// Body : { texts: string[], targetLang: 'fr' | 'en', sourceLang?: 'fr' | 'en' }
// Response : { translations: (string | null)[] }
//
// Limites :
// - max 200 textes par requête (sécurité contre les abus)
// - max 4000 caractères par texte (idem)
// - timeout implicite via fetch vers OpenAI
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { texts, targetLang, sourceLang } = req.body || {};

    if (!Array.isArray(texts)) {
      throw new AppError('Le paramètre "texts" doit être un tableau', 400);
    }
    if (texts.length === 0) {
      return res.json({ success: true, data: { translations: [] } });
    }
    if (texts.length > 200) {
      throw new AppError('Max 200 textes par requête', 400);
    }
    if (texts.some(t => typeof t === 'string' && t.length > 4000)) {
      throw new AppError('Chaque texte doit faire max 4000 caractères', 400);
    }
    if (targetLang !== 'fr' && targetLang !== 'en') {
      throw new AppError('targetLang doit être "fr" ou "en"', 400);
    }
    const sLang: 'fr' | 'en' = sourceLang === 'en' ? 'en' : 'fr';

    const translations = await translateTexts(texts, targetLang, sLang);

    res.json({ success: true, data: { translations } });
  } catch (err) { next(err); }
});

export default router;