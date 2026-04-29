// src/routes/tickets.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { sendTicketAssigned } from '../services/emailService';

const router = Router();
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, status, urgency, assignedToId } = req.query;
    const where: any = {};
    if (projectId)    where.projectId    = String(projectId);
    if (status)       where.status       = String(status);
    if (urgency)      where.urgency      = String(urgency);
    if (assignedToId) where.assignedToId = String(assignedToId);
    if (req.user!.role === 'worker') where.assignedToId = req.user!.id;

    const tickets = await prisma.ticket.findMany({
      where, orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
      include: {
        project: { select: { id:true, name:true, internalNumber:true } },
        reportedBy: { select: { id:true, firstName:true, lastName:true } },
        assignedTo: { select: { id:true, firstName:true, lastName:true, email:true } },
        photos: { take: 3 },
      },
    });
    res.json({ success: true, data: tickets });
  } catch (err) { next(err); }
});

router.get('/stats', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const pid = req.query.projectId ? { projectId: String(req.query.projectId) } : {};
    const [open, inProg, resolved, critical] = await Promise.all([
      prisma.ticket.count({ where: { ...pid, status: 'open' } }),
      prisma.ticket.count({ where: { ...pid, status: 'in_progress' } }),
      prisma.ticket.count({ where: { ...pid, status: { in: ['resolved','validated','closed'] } } }),
      prisma.ticket.count({ where: { ...pid, urgency: 'critical', status: { not: 'closed' } } }),
    ]);
    res.json({ success: true, data: { open, inProgress: inProg, resolved, critical } });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        project: { select: { id:true, name:true, internalNumber:true } },
        reportedBy: { select: { id:true, firstName:true, lastName:true, email:true } },
        assignedTo: { select: { id:true, firstName:true, lastName:true, email:true, phone:true } },
        photos: true,
        history: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!t) throw new AppError('Ticket introuvable', 404);
    res.json({ success: true, data: t });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ticket = await prisma.ticket.create({
      data: {
        ...req.body,
        reportedById: req.user!.id,
        status: req.body.assignedToId ? 'assigned' : 'open',
        plannedDate: req.body.plannedDate ? new Date(req.body.plannedDate) : null,
      },
      include: {
        project: { select: { name:true, internalNumber:true } },
        assignedTo: { select: { id:true, firstName:true, lastName:true, email:true } },
      },
    });

    // History
    await prisma.ticketHistory.create({ data: { ticketId: ticket.id, changedById: req.user!.id, newStatus: ticket.status as any, comment: 'Ticket créé' } });

    // Email notification
    if (ticket.assignedTo?.email) {
      await sendTicketAssigned({
        to: ticket.assignedTo.email,
        ticketTitle: ticket.title,
        urgency: ticket.urgency,
        project: ticket.project?.name || '',
        location: ticket.locationOnSite || undefined,
        assignee: `${ticket.assignedTo.firstName} ${ticket.assignedTo.lastName}`,
        description: ticket.description,
        appUrl: `${APP_URL}/tickets/${ticket.id}`,
      });
    }

    res.status(201).json({ success: true, data: ticket });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const old = await prisma.ticket.findUnique({ where: { id: req.params.id } });
    if (!old) throw new AppError('Ticket introuvable', 404);

    const updateData: any = { ...req.body };
    if (updateData.plannedDate) updateData.plannedDate = new Date(updateData.plannedDate);
    if (req.body.status === 'resolved' && old.status !== 'resolved') updateData.resolvedAt = new Date();
    if (req.body.status === 'validated') { updateData.validatedById = req.user!.id; updateData.validatedAt = new Date(); }

    const ticket = await prisma.ticket.update({ where: { id: req.params.id }, data: updateData });

    if (req.body.status && req.body.status !== old.status) {
      await prisma.ticketHistory.create({
        data: { ticketId: ticket.id, changedById: req.user!.id, oldStatus: old.status as any, newStatus: req.body.status, comment: req.body.comment },
      });
    }

    res.json({ success: true, data: ticket });
  } catch (err) { next(err); }
});

export default router;
