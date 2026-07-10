import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

// ═══════════════════════════════════════════════════════════
// LISTE des briefings d'un projet
// GET /api/v1/briefings/project/:projectId
// ═══════════════════════════════════════════════════════════
router.get('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const briefings = await prisma.briefing.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        projectId: true,
        title: true,
        studioSlides: true,
        slides: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    // On retourne des méta-données allégées pour la liste
    // (les slides complètes sont chargées à l'ouverture)
    const list = briefings.map(b => {
      const hasStudio = b.studioSlides && (b.studioSlides as any).slides?.length > 0;
      const nbSlides = hasStudio
        ? (b.studioSlides as any).slides.length
        : (Array.isArray(b.slides) ? (b.slides as any[]).length : 0);
      return {
        id: b.id,
        projectId: b.projectId,
        title: b.title || 'Briefing sans titre',
        mode: hasStudio ? 'studio' : 'classic',
        nbSlides,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
      };
    });
    res.json({ success: true, data: list });
  } catch (e: any) {
    console.error('[briefings list]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CRÉER un nouveau briefing pour un projet
// POST /api/v1/briefings/project/:projectId
// Body: { title?, slides?, studioSlides? }
// ═══════════════════════════════════════════════════════════
router.post('/project/:projectId', async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { title, slides, studioSlides } = req.body;
    const brief = await prisma.briefing.create({
      data: {
        projectId,
        title: title || 'Nouveau briefing',
        slides: slides ?? [],
        studioSlides: studioSlides ?? null,
      },
    });
    res.json({ success: true, data: brief });
  } catch (e: any) {
    console.error('[briefings create]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// LIRE un briefing par son ID
// GET /api/v1/briefings/:id
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const brief = await prisma.briefing.findUnique({ where: { id } });
    if (!brief) return res.status(404).json({ success: false, error: 'Briefing introuvable' });
    res.json({ success: true, data: brief });
  } catch (e: any) {
    console.error('[briefings get]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// METTRE À JOUR un briefing par son ID
// PATCH /api/v1/briefings/:id
// Body: { title?, slides?, studioSlides? }
// ═══════════════════════════════════════════════════════════
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, slides, studioSlides } = req.body;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (slides !== undefined) data.slides = slides;
    if (studioSlides !== undefined) data.studioSlides = studioSlides;
    const brief = await prisma.briefing.update({ where: { id }, data });
    res.json({ success: true, data: brief });
  } catch (e: any) {
    console.error('[briefings patch]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SUPPRIMER un briefing par son ID
// DELETE /api/v1/briefings/:id
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.briefing.delete({ where: { id } });
    res.json({ success: true });
  } catch (e: any) {
    console.error('[briefings delete]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;