// src/routes/projects.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { io } from '../index';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, search } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (search) where.OR = [
      { name: { contains: String(search), mode: 'insensitive' } },
      { internalNumber: { contains: String(search), mode: 'insensitive' } },
    ];

    const projects = await prisma.project.findMany({
      where, orderBy: { installationStart: 'asc' },
      include: {
        client: { select: { id:true, name:true } },
        technicalManager: { select: { id:true, firstName:true, lastName:true } },
        team: { include: { user: { select: { id:true, firstName:true, lastName:true, role:true } } } },
        _count: { select: { tasks:true, tickets:true } },
      },
    });

    // Attach progress
    const enriched = await Promise.all(projects.map(async p => {
      const [total, done] = await Promise.all([
        prisma.task.count({ where: { projectId: p.id } }),
        prisma.task.count({ where: { projectId: p.id, status: 'done' } }),
      ]);
      return { ...p, tasksTotal: total, tasksDone: done, progress: total > 0 ? Math.round(done/total*100) : 0 };
    }));

    res.json({ success: true, data: enriched });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const p = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        technicalManager: { select: { id:true, firstName:true, lastName:true, email:true } },
        team: { include: { user: { select: { id:true, firstName:true, lastName:true, role:true, avatarUrl:true, phone:true } } } },
        trucks: true,
        files: { orderBy: { createdAt: 'desc' } },
        _count: { select: { tasks:true, tickets:true, handovers:true, warehouseBoxes:true } },
      },
    });
    if (!p) throw new AppError('Projet introuvable', 404);
    const [total, done] = await Promise.all([
      prisma.task.count({ where: { projectId: p.id } }),
      prisma.task.count({ where: { projectId: p.id, status: 'done' } }),
    ]);
    res.json({ success: true, data: { ...p, tasksTotal: total, tasksDone: done, progress: total > 0 ? Math.round(done/total*100) : 0 } });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { siteManagerIds = [], engineerIds = [], ...data } = req.body;
    const project = await prisma.project.create({
      data: {
        ...data,
        internalNumber: data.internalNumber || `VEM-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        installationStart: new Date(data.installationStart),
        installationEnd:   new Date(data.installationEnd),
        dismantlingStart:  data.dismantlingStart ? new Date(data.dismantlingStart) : null,
        dismantlingEnd:    data.dismantlingEnd   ? new Date(data.dismantlingEnd)   : null,
        createdById: req.user!.id,
        team: {
          create: [
            ...siteManagerIds.map((uid: string) => ({ userId: uid, role: 'site_manager', isLead: true })),
            ...engineerIds.map((uid: string) => ({ userId: uid, role: 'engineer' })),
          ],
        },
      },
      include: { client: true },
    });
    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { siteManagerIds, engineerIds, ...data } = req.body;
    if (data.installationStart) data.installationStart = new Date(data.installationStart);
    if (data.installationEnd)   data.installationEnd   = new Date(data.installationEnd);
    const project = await prisma.project.update({ where: { id: req.params.id }, data });
    io.to(`project:${req.params.id}`).emit('project:updated', project);
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});
// POST /projects/:id/team — ajouter un membre
router.post('/:id/team', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, role, isLead } = req.body;
    const member = await prisma.projectTeam.create({
      data: { projectId: req.params.id, userId, role, isLead: isLead||false },
      include: { user: { select: { firstName:true, lastName:true, email:true } } },
    });
    res.status(201).json({ success: true, data: member });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Déjà dans l\'équipe' });
    next(err);
  }
});

// POST /projects/:id/trucks — ajouter camion/machine
router.post('/:id/trucks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const truck = await prisma.truck.create({
      data: {
        projectId: req.params.id,
        ...req.body,
        loadingDate:  req.body.loadingDate  ? new Date(req.body.loadingDate)  : null,
        arrivalDate:  req.body.arrivalDate  ? new Date(req.body.arrivalDate)  : null,
        departureDate: req.body.departureDate ? new Date(req.body.departureDate) : null,
      },
    });
    res.status(201).json({ success: true, data: truck });
  } catch (err) { next(err); }
});
export default router;
