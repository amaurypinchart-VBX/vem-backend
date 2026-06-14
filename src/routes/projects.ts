// src/routes/projects.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { io } from '../index';

const router = Router();

// GET /projects — POINT 6 : tri par sortOrder en premier
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
      where,
      orderBy: [{ sortOrder: 'asc' }, { installationStart: 'asc' }],   // POINT 6
      include: {
        client: { select: { id:true, name:true } },
        technicalManager: { select: { id:true, firstName:true, lastName:true } },
        team: { include: { user: { select: { id:true, firstName:true, lastName:true, role:true } } } },
        _count: { select: { tasks:true, tickets:true } },
      },
    });

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

// ═══════════════════════════════════════════════════════════
// POINT 6 — Réordonnement custom (drag-and-drop)
// ⚠️ Doit être déclarée AVANT /:id pour ne pas être interceptée comme un id
// ═══════════════════════════════════════════════════════════
router.patch('/reorder', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ids: string[] = Array.isArray(req.body.projectIds) ? req.body.projectIds : [];
    if (ids.length === 0) return res.json({ success: true, updated: 0 });

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.project.update({
          where: { id },
          data: { sortOrder: index },
        })
      )
    );
    res.json({ success: true, updated: ids.length });
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

// POST /projects — POINT 4 : accepte installTeamIds et dismantleTeamIds
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      siteManagerIds = [],
      engineerIds = [],
      installTeamIds = [],
      dismantleTeamIds = [],
      ...data
    } = req.body;

    const teamMap = new Map<string, { userId: string; role: string; isLead: boolean; phase: string }>();
    for (const uid of siteManagerIds) teamMap.set(uid, { userId: uid, role: 'site_manager', isLead: true, phase: 'both' });
    for (const uid of engineerIds)    teamMap.set(uid, { userId: uid, role: 'engineer',     isLead: false, phase: 'both' });
    for (const uid of installTeamIds) teamMap.set(uid, { userId: uid, role: teamMap.get(uid)?.role || 'worker', isLead: teamMap.get(uid)?.isLead || false, phase: 'installation' });
    for (const uid of dismantleTeamIds) teamMap.set(uid, { userId: uid, role: teamMap.get(uid)?.role || 'worker', isLead: teamMap.get(uid)?.isLead || false, phase: 'dismantling' });

    const project = await prisma.project.create({
      data: {
        ...data,
        internalNumber: data.internalNumber || `VEM-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`,
        installationStart: new Date(data.installationStart),
        installationEnd:   new Date(data.installationEnd),
        dismantlingStart:  data.dismantlingStart ? new Date(data.dismantlingStart) : null,
        dismantlingEnd:    data.dismantlingEnd   ? new Date(data.dismantlingEnd)   : null,
        createdById: req.user!.id,
        team: { create: Array.from(teamMap.values()) },
      },
      include: { client: true },
    });
    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
});

// PATCH /projects/:id — POINTS 3 et 6 : accepte scope/notes/sortOrder
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { siteManagerIds, engineerIds, trucks, tasks, installTeamIds, dismantleTeamIds, ...data } = req.body;

    for (const k of ['installationStart','installationEnd','dismantlingStart','dismantlingEnd']) {
      if (data[k]) data[k] = new Date(data[k]);
      else if (data[k] === '' || data[k] === null) data[k] = null;
    }

    const allowed = [
      'name','internalNumber','clientId','technicalManagerId',
      'address','city',
      'scope','installNotes','dismantleNotes',           // POINT 3
      'description','specialInstructions',                // anciens — compat
      'workersCount','status','sortOrder',                // POINT 6
      'installationStart','installationEnd','dismantlingStart','dismantlingEnd',
    ];
    const cleanData: any = {};
    for (const k of allowed) if (data[k] !== undefined) cleanData[k] = data[k];

    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: cleanData,
      include: { client: true, technicalManager: { select: { id:true, firstName:true, lastName:true } } },
    });
    io.to(`project:${req.params.id}`).emit('project:updated', project);
    res.json({ success: true, data: project });
  } catch (err: any) {
    next(err);
  }
});

router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// ÉQUIPE PROJET — POINT 4 : gestion des phases
// ═══════════════════════════════════════════════════════════

router.post('/:id/team', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { userId, role, isLead, phase } = req.body;
    const member = await prisma.projectTeam.create({
      data: {
        projectId: req.params.id,
        userId,
        role,
        isLead: isLead || false,
        phase: phase && ['installation','dismantling','both'].includes(phase) ? phase : 'both',
      },
      include: { user: { select: { firstName:true, lastName:true, email:true } } },
    });
    res.status(201).json({ success: true, data: member });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Déjà dans l\'équipe' });
    next(err);
  }
});

router.patch('/:id/team/:memberId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role, isLead, phase } = req.body;
    const data: any = {};
    if (role !== undefined) data.role = role;
    if (isLead !== undefined) data.isLead = !!isLead;
    if (phase !== undefined && ['installation','dismantling','both'].includes(phase)) data.phase = phase;
    const member = await prisma.projectTeam.update({
      where: { id: req.params.memberId },
      data,
      include: { user: { select: { firstName:true, lastName:true, email:true } } },
    });
    res.json({ success: true, data: member });
  } catch (err) { next(err); }
});

router.delete('/:id/team/:memberId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.projectTeam.delete({ where: { id: req.params.memberId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// CAMIONS / VÉHICULES
// ═══════════════════════════════════════════════════════════

router.post('/:id/trucks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const truck = await prisma.truck.create({
      data: {
        projectId: req.params.id,
        vehicleType: req.body.vehicleType || 'truck',
        truckNumber: req.body.truckNumber || null,
        licensePlate: req.body.licensePlate || null,
        driverName: req.body.driverName || null,
        driverPhone: req.body.driverPhone || null,
        status: req.body.status || 'planned',
        loadingDate:  req.body.loadingDate  ? new Date(req.body.loadingDate)  : null,
        arrivalDate:  req.body.arrivalDate  ? new Date(req.body.arrivalDate)  : null,
        departureDate: req.body.departureDate ? new Date(req.body.departureDate) : null,
        loadingLocation:   req.body.loadingLocation   || null,
        unloadingLocation: req.body.unloadingLocation || null,
        notes: req.body.notes || null,
      } as any,
    });
    res.status(201).json({ success: true, data: truck });
  } catch (err) { next(err); }
});

router.patch('/:id/trucks/:truckId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data: any = {};
    for (const k of ['vehicleType','truckNumber','licensePlate','driverName','driverPhone','status','loadingLocation','unloadingLocation','notes']) {
      if (req.body[k] !== undefined) data[k] = req.body[k] || null;
    }
    for (const k of ['loadingDate','arrivalDate','departureDate']) {
      if (req.body[k] !== undefined) data[k] = req.body[k] ? new Date(req.body[k]) : null;
    }
    const truck = await prisma.truck.update({ where: { id: req.params.truckId }, data });
    res.json({ success: true, data: truck });
  } catch (err) { next(err); }
});

router.delete('/:id/trucks/:truckId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.truck.delete({ where: { id: req.params.truckId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/:id/trucks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const trucks = await prisma.truck.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: trucks });
  } catch (err) { next(err); }
});

// ═══════════════════════════════════════════════════════════
// FICHIERS PROJET
// ═══════════════════════════════════════════════════════════

router.get('/:id/files', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const files = await prisma.projectFile.findMany({
      where: { projectId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: files });
  } catch (err) { next(err); }
});

router.post('/:id/files', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { fileName, fileUrl, fileType, fileSize, publicId, category } = req.body;
    if (!fileUrl) throw new AppError('fileUrl requis', 400);
    const file = await prisma.projectFile.create({
      data: {
        projectId:  req.params.id,
        uploadedBy: req.user!.id,
        fileName:   fileName || 'fichier',
        fileUrl,
        fileType:   fileType  || null,
        fileSize:   fileSize  || null,
        publicId:   publicId  || null,
        category:   category  || 'project',
      },
    });
    res.status(201).json({ success: true, data: file });
  } catch (err) { next(err); }
});

router.delete('/:id/files/:fileId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.projectFile.delete({ where: { id: req.params.fileId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;