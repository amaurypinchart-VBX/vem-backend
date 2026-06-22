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
        data: { projectId, title: null, slides: [] as any, studioSlides: null },
      });
    } else {
      // Migration on-the-fly de sécurité : si slides est encore un v2 et studio_slides null,
      // on bascule (au cas où la migration SQL aurait été zappée pour cette ligne)
      const s = briefing.slides as any;
      if (s && typeof s === 'object' && !Array.isArray(s) && s.version === 2 && !briefing.studioSlides) {
        briefing = await prisma.briefing.update({
          where: { projectId },
          data: { slides: [] as any, studioSlides: s as any },
        });
      }
    }
    res.json({ success: true, data: briefing });
  } catch (err) { next(err); }
});

// Handler upsert partagé entre PUT et PATCH
async function upsertBriefing(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const projectId = req.params.projectId;
    const { title, slides, studioSlides } = req.body;

    // Update : on ne touche QUE les champs explicitement présents dans le body
    // → un save Studio (qui n'envoie pas slides) ne touche pas les blocks Classique
    // → un save Classique (qui n'envoie pas studioSlides) ne touche pas le Studio
    const updateData: any = { title: title ?? null };
    if (slides       !== undefined) updateData.slides       = slides;
    if (studioSlides !== undefined) updateData.studioSlides = studioSlides;

    // Create : valeurs par défaut raisonnables
    const createData: any = {
      projectId,
      title:        title        ?? null,
      slides:       slides       ?? [],
      studioSlides: studioSlides ?? null,
    };

    const briefing = await prisma.briefing.upsert({
      where:  { projectId },
      update: updateData,
      create: createData,
    });
    res.json({ success: true, data: briefing });
  } catch (err) { next(err); }
}

router.put('/:projectId',   upsertBriefing);
router.patch('/:projectId', upsertBriefing);

export default router;