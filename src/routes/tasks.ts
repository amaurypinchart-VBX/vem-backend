// src/routes/tasks.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';

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
    const task = await prisma.task.create({
      data: { ...req.body, taskDate: new Date(req.body.taskDate), createdById: req.user!.id },
      include: { assignedTo: { select: { id:true, firstName:true, lastName:true } } },
    });
    res.status(201).json({ success: true, data: task });
  } catch (err) { next(err); }
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
