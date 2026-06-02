// src/routes/briefing.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /briefings/:projectId — récupère le briefing du projet (le crée vide si absent)
router.get('/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId;
    let briefing = await prisma.briefing.findUnique({ where: { projectId } });
    if (!briefing) {
      briefing = await prisma.briefing.create({
        data: { projectId, title: null, slides: [] as any },
      });
    }
    res.json({ success: true, data: briefing });
  } catch (err) { next(err); }
});

// PUT /briefings/:projectId — remplace title + slides
router.put('/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId;
    const { title, slides } = req.body;

    // Garde-fou : slides doit être un tableau
    const safeSlides = Array.isArray(slides) ? slides : [];

    const briefing = await prisma.briefing.upsert({
      where:  { projectId },
      update: { title: title ?? null, slides: safeSlides as any },
      create: { projectId, title: title ?? null, slides: safeSlides as any },
    });
    res.json({ success: true, data: briefing });
  } catch (err) { next(err); }
});

export default router;
