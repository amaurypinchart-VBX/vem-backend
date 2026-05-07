// src/routes/taskTemplates.ts
// Routes pour la gestion des templates de tâches et catégories
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

// ── CATÉGORIES ──────────────────────────────────────────────

// GET /task-templates/categories — toutes les catégories avec leurs templates
router.get('/categories', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const categories = await (prisma as any).taskCategory.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        templates: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    res.json({ success: true, data: categories });
  } catch (err) { next(err); }
});

// POST /task-templates/categories — créer une catégorie
router.post('/categories', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cat = await (prisma as any).taskCategory.create({ data: req.body });
    res.status(201).json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// PATCH /task-templates/categories/:id
router.patch('/categories/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const cat = await (prisma as any).taskCategory.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: cat });
  } catch (err) { next(err); }
});

// DELETE /task-templates/categories/:id (soft delete)
router.delete('/categories/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await (prisma as any).taskCategory.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── TEMPLATES ───────────────────────────────────────────────

// GET /task-templates — tous les templates
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const templates = await (prisma as any).taskTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
      include: { category: true },
    });
    res.json({ success: true, data: templates });
  } catch (err) { next(err); }
});

// POST /task-templates — créer un template
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await (prisma as any).taskTemplate.create({ data: req.body, include: { category: true } });
    res.status(201).json({ success: true, data: tpl });
  } catch (err) { next(err); }
});

// PATCH /task-templates/:id — modifier un template
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tpl = await (prisma as any).taskTemplate.update({ where: { id: req.params.id }, data: req.body, include: { category: true } });
    res.json({ success: true, data: tpl });
  } catch (err) { next(err); }
});

// DELETE /task-templates/:id (soft delete)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await (prisma as any).taskTemplate.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── APPLIQUER DES TEMPLATES À UN PROJET ─────────────────────

// POST /task-templates/apply — appliquer une sélection de templates à un projet
router.post('/apply', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, templateIds, assignments, startDate } = req.body;
    // assignments: { [templateId]: { assignedToId, taskDate, startTime, endTime } }

    if (!projectId || !templateIds?.length) throw new AppError('projectId et templateIds requis', 400);

    // Récupérer les templates sélectionnés
    const templates = await (prisma as any).taskTemplate.findMany({
      where: { id: { in: templateIds } },
      orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    });

    // Créer les tâches
    const tasks = await Promise.all(templates.map(async (tpl: any) => {
      const assign = assignments?.[tpl.id] || {};
      const taskDate = assign.taskDate || startDate || new Date().toISOString().split('T')[0];

      return prisma.task.create({
        data: {
          projectId,
          title: tpl.title,
          description: tpl.description,
          taskDate: new Date(taskDate),
          startTime: assign.startTime || '08:00',
          endTime: assign.endTime || undefined,
          priority: tpl.priority as any,
          status: 'todo',
          assignedToId: assign.assignedToId || null,
          createdById: req.user!.id,
          estimatedHours: tpl.durationHours,
        },
      });
    }));

    res.status(201).json({ success: true, data: tasks, meta: { created: tasks.length } });
  } catch (err) { next(err); }
});

export default router;
