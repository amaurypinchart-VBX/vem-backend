// src/routes/assistant.ts
// Assistant en langage naturel (lecture seule) pour interroger les données
// projets/tâches/tickets/logistique. Voir services/assistantService.ts.

import { Router, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { askAssistant } from '../services/assistantService';

const router = Router();

// POST /api/v1/assistant/ask
// Body : { question: string }
router.post('/ask', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { question } = req.body || {};
    if (!question?.trim()) return res.status(400).json({ success: false, error: 'Question manquante' });
    if (question.length > 1000) return res.status(400).json({ success: false, error: 'Question trop longue (max 1000 caractères)' });

    const result = await askAssistant(question.trim(), {
      firstName: req.user!.firstName,
      lastName: req.user!.lastName,
      role: req.user!.role,
    });

    res.json({ success: true, data: { answer: result.answer } });
  } catch (err) { next(err); }
});

export default router;
