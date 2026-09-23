import { Router, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

// ═══════════════════════════════════════════════════════════
// LISTE des plans 2D d'un projet
// GET /api/v1/plan2d/project/:projectId
// ═══════════════════════════════════════════════════════════
router.get('/project/:projectId', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const plans = await prisma.plan2D.findMany({
      where: { projectId },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, projectId: true, title: true, sheets: true, createdAt: true, updatedAt: true },
    });
    const list = plans.map(p => ({
      id: p.id,
      projectId: p.projectId,
      title: p.title || 'Plan 2D sans titre',
      nbSheets: Array.isArray(p.sheets) ? (p.sheets as any[]).length : 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    res.json({ success: true, data: list });
  } catch (e: any) {
    console.error('[plan2d list]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// CRÉER un nouveau plan 2D pour un projet
// POST /api/v1/plan2d/project/:projectId
// Body: { title?, sheets? }
// ═══════════════════════════════════════════════════════════
router.post('/project/:projectId', async (req: AuthRequest, res: Response) => {
  try {
    const { projectId } = req.params;
    const { title, sheets } = req.body;
    const plan = await prisma.plan2D.create({
      data: {
        projectId,
        title: title || 'Nouveau plan 2D',
        sheets: sheets ?? [],
        createdById: req.user?.id ?? null,
      },
    });
    res.json({ success: true, data: plan });
  } catch (e: any) {
    console.error('[plan2d create]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// LIRE un plan 2D par son ID
// GET /api/v1/plan2d/:id
// ═══════════════════════════════════════════════════════════
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const plan = await prisma.plan2D.findUnique({ where: { id } });
    if (!plan) return res.status(404).json({ success: false, error: 'Plan 2D introuvable' });
    res.json({ success: true, data: plan });
  } catch (e: any) {
    console.error('[plan2d get]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// METTRE À JOUR un plan 2D par son ID
// PATCH /api/v1/plan2d/:id
// Body: { title?, sheets? }
// ═══════════════════════════════════════════════════════════
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, sheets } = req.body;
    const data: any = {};
    if (title !== undefined) data.title = title;
    if (sheets !== undefined) data.sheets = sheets;
    const plan = await prisma.plan2D.update({ where: { id }, data });
    res.json({ success: true, data: plan });
  } catch (e: any) {
    console.error('[plan2d patch]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════
// SUPPRIMER un plan 2D par son ID
// DELETE /api/v1/plan2d/:id
// ═══════════════════════════════════════════════════════════
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.plan2D.delete({ where: { id } });
    res.json({ success: true });
  } catch (e: any) {
    console.error('[plan2d delete]', e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
