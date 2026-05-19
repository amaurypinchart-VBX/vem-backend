import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';

const router = Router();

// GET /task-templates/categories
router.get('/categories', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cats = await (prisma as any).taskCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        templates: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    res.json({ success: true, data: cats });
  } catch (err) { next(err); }
});

// POST /task-templates/categories
router.post('/categories', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cat = await (prisma as any).taskCategory.create({ data: req.body });
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// PATCH /task-templates/categories/:id
router.patch('/categories/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cat = await (prisma as any).taskCategory.update({
      where: { id: req.params.id },
      data: req.body,
    });
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// DELETE /task-templates/categories/:id
router.delete('/categories/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await (prisma as any).taskCategory.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /task-templates
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tpls = await (prisma as any).taskTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { category: true },
    });
    res.json({ success: true, data: tpls });
  } catch (err) { next(err); }
});

// POST /task-templates
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await (prisma as any).taskTemplate.create({
      data: req.body,
      include: { category: true },
    });
    res.status(201).json({ success: true, data: tpl });
  } catch (err) { next(err); }
});

// PATCH /task-templates/:id
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await (prisma as any).taskTemplate.update({
      where: { id: req.params.id },
      data: req.body,
      include: { category: true },
    });
    res.json({ success: true, data: tpl });
  } catch (err) { next(err); }
});

// DELETE /task-templates/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await (prisma as any).taskTemplate.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /task-templates/apply — create tasks from templates
router.post('/apply', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, templateIds, startDate } = req.body;
    if (!projectId || !templateIds?.length) {
      return res.status(400).json({ success: false, error: 'projectId et templateIds requis' });
    }
    const templates = await (prisma as any).taskTemplate.findMany({
      where: { id: { in: templateIds } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });
    const tasks = await Promise.all(
      templates.map((tpl: any) =>
        prisma.task.create({
          data: {
            projectId,
            title: tpl.title,
            description: tpl.description || null,
            taskDate: startDate ? new Date(startDate) : new Date(),
            status: 'todo' as any,
            priority: (tpl.priority || 'normal') as any,
            estimatedHours: tpl.durationHours,
            createdById: req.user!.id,
          },
        })
      )
    );
    res.status(201).json({ success: true, data: tasks, meta: { created: tasks.length } });
  } catch (err) { next(err); }
});

export default router;
