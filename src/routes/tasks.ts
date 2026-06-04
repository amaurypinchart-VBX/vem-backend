// src/routes/tasks.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, date, status, assignedToId } = req.query;
    const where: any = {};
    if (projectId)    where.projectId    = String(projectId);
    if (status)       where.status       = String(status);
    if (assignedToId) where.assignedToId = String(assignedToId);
    if (req.user!.role === 'worker') where.assignedToId = req.user!.id;
    if (date) {
      const d = new Date(String(date)); const n = new Date(d); n.setDate(d.getDate()+1);
      where.taskDate = { gte: d, lt: n };
    }
    const tasks = await prisma.task.findMany({
      where, orderBy: [{ taskDate: 'asc' }, { startTime: 'asc' }],
      include: { assignedTo: { select: { id:true, firstName:true, lastName:true } }, photos: { take:3 }, _count: { select: { comments:true } } },
    });
    res.json({ success: true, data: tasks });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = { ...req.body };

    // Date de tâche tolérante : si manquante, invalide, ou vide → aujourd'hui.
    let parsedDate = new Date();
    if (body.taskDate) {
      const d = new Date(body.taskDate);
      if (!isNaN(d.getTime())) parsedDate = d;
    }
    body.taskDate = parsedDate;

    // Nettoyage : retirer les champs qui ne sont pas dans le modèle Task
    delete body.stage;
    delete body.assignedTo; // on n'accepte que assignedToId

    const task = await prisma.task.create({
      data: { ...body, createdById: req.user!.id },
      include: { assignedTo: { select: { id:true, firstName:true, lastName:true } } },
    });
    res.status(201).json({ success: true, data: task });
  } catch (err: any) {
    logger.error(`[create-task] échec : code=${err.code || '?'} | meta=${JSON.stringify(err.meta || {})} | msg=${err.message?.slice(0,300)} | body=${JSON.stringify(req.body).slice(0,300)}`);
    next(err);
  }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const task = await prisma.task.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: task });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.post('/:id/comments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const c = await prisma.taskComment.create({
      data: { taskId: req.params.id, userId: req.user!.id, content: req.body.content },
      include: { user: { select: { id:true, firstName:true, lastName:true } } },
    });
    res.status(201).json({ success: true, data: c });
  } catch (err) { next(err); }
});

export default router;
