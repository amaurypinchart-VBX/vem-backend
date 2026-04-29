// src/routes/toolbox.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const boxes = await prisma.toolbox.findMany({
      where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
      include: { drawers: { include: { tools: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: boxes });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tb = await prisma.toolbox.findUnique({ where: { id: req.params.id }, include: { drawers: { orderBy: { sortOrder: 'asc' }, include: { tools: { orderBy: { name: 'asc' } } } } } });
    if (!tb) throw new AppError('Boîte à outils introuvable', 404);
    const allTools = tb.drawers.flatMap(d => d.tools);
    res.json({ success: true, data: { ...tb, stats: { total: allTools.length, checked: allTools.filter(t => t.isChecked).length, missing: allTools.filter(t => t.status === 'missing').length } } });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { drawers = [], ...data } = req.body;
    const qrCode = `TB-${Date.now()}`;
    const tb = await prisma.toolbox.create({
      data: { ...data, qrCode, preparedById: req.user!.id, drawers: { create: drawers.map((d: any, i: number) => ({ name: d.name, sortOrder: i, tools: { create: d.tools || [] } })) } },
      include: { drawers: { include: { tools: true } } },
    });
    res.status(201).json({ success: true, data: tb });
  } catch (err) { next(err); }
});

router.post('/drawers/:drawerId/tools', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tool = await prisma.toolboxTool.create({ data: { drawerId: req.params.drawerId, ...req.body } });
    res.status(201).json({ success: true, data: tool });
  } catch (err) { next(err); }
});

router.patch('/tools/:toolId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tool = await prisma.toolboxTool.update({ where: { id: req.params.toolId }, data: req.body });
    res.json({ success: true, data: tool });
  } catch (err) { next(err); }
});

router.post('/drawers/:drawerId/validate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const d = await prisma.toolboxDrawer.update({ where: { id: req.params.drawerId }, data: { isValidated: true, validatedAt: new Date() } });
    res.json({ success: true, data: d });
  } catch (err) { next(err); }
});

export default router;
