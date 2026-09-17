"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tickets.ts
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
router.get('/', async (req, res, next) => {
    try {
        const { projectId, status, urgency, assignedToId } = req.query;
        const where = {};
        if (projectId)
            where.projectId = String(projectId);
        if (status)
            where.status = { in: Array.isArray(status) ? status : [status] };
        if (urgency)
            where.urgency = String(urgency);
        if (assignedToId)
            where.assignedToId = String(assignedToId);
        if (req.user.role === 'worker')
            where.assignedToId = req.user.id;
        const tickets = await database_1.prisma.ticket.findMany({
            where, orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
            include: {
                project: { select: { id: true, name: true, internalNumber: true } },
                reportedBy: { select: { id: true, firstName: true, lastName: true } },
                assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
                photos: { take: 3 },
            },
        });
        res.json({ success: true, data: tickets });
    }
    catch (err) {
        next(err);
    }
});
router.get('/stats', async (req, res, next) => {
    try {
        const pid = req.query.projectId ? { projectId: String(req.query.projectId) } : {};
        const [open, inProg, resolved, critical] = await Promise.all([
            database_1.prisma.ticket.count({ where: { ...pid, status: 'open' } }),
            database_1.prisma.ticket.count({ where: { ...pid, status: 'in_progress' } }),
            database_1.prisma.ticket.count({ where: { ...pid, status: { in: ['resolved', 'validated', 'closed'] } } }),
            database_1.prisma.ticket.count({ where: { ...pid, urgency: 'critical', status: { not: 'closed' } } }),
        ]);
        res.json({ success: true, data: { open, inProgress: inProg, resolved, critical } });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const t = await database_1.prisma.ticket.findUnique({
            where: { id: req.params.id },
            include: {
                project: { select: { id: true, name: true, internalNumber: true } },
                reportedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
                assignedTo: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
                photos: true,
                history: { orderBy: { createdAt: 'desc' }, take: 10 },
            },
        });
        if (!t)
            throw new AppError_1.AppError('Ticket introuvable', 404);
        res.json({ success: true, data: t });
    }
    catch (err) {
        next(err);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const ticket = await database_1.prisma.ticket.create({
            data: {
                ...req.body,
                reportedById: req.user.id,
                status: req.body.assignedToId ? 'assigned' : 'open',
                plannedDate: req.body.plannedDate ? new Date(req.body.plannedDate) : null,
            },
            include: {
                project: { select: { name: true, internalNumber: true } },
                assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
        });
        // History
        await database_1.prisma.ticketHistory.create({ data: { ticketId: ticket.id, changedById: req.user.id, newStatus: ticket.status, comment: 'Ticket créé' } });
        // Email notification — non bloquant. Le ticket est créé même si l'envoi mail échoue
        // (SMTP mal configuré, destinataire invalide, etc.). L'utilisateur voit ses tickets
        // en base même si la notif n'est pas partie.
        if (ticket.assignedTo?.email) {
            try {
                await (0, emailService_1.sendTicketAssigned)({
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
            catch (e) {
                // On log mais on n'échoue pas le ticket
                // eslint-disable-next-line no-console
                console.warn('[ticket-email] échec envoi notification :', e.message || e);
            }
        }
        res.status(201).json({ success: true, data: ticket });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const old = await database_1.prisma.ticket.findUnique({ where: { id: req.params.id } });
        if (!old)
            throw new AppError_1.AppError('Ticket introuvable', 404);
        const updateData = { ...req.body };
        if (updateData.plannedDate)
            updateData.plannedDate = new Date(updateData.plannedDate);
        if (req.body.status === 'resolved' && old.status !== 'resolved')
            updateData.resolvedAt = new Date();
        if (req.body.status === 'validated') {
            updateData.validatedById = req.user.id;
            updateData.validatedAt = new Date();
        }
        const ticket = await database_1.prisma.ticket.update({ where: { id: req.params.id }, data: updateData });
        if (req.body.status && req.body.status !== old.status) {
            await database_1.prisma.ticketHistory.create({
                data: { ticketId: ticket.id, changedById: req.user.id, oldStatus: old.status, newStatus: req.body.status, comment: req.body.comment },
            });
        }
        res.json({ success: true, data: ticket });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=tickets.js.map