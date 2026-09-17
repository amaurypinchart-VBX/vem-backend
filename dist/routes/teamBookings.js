"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/teamBookings.ts
// Gestion des bookings transport + hôtel pour chaque membre d'équipe sur un projet.
// POINT 2 — Pièces jointes (billet, justificatif…) ajoutées sur les 2 modèles.
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const router = (0, express_1.Router)();
router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
});
// ═══════════════════════════════════════════════════════════════════
// TEAM BOOKINGS — transport individuel par membre
// ═══════════════════════════════════════════════════════════════════
router.get('/projects/:projectId/bookings', async (req, res, next) => {
    try {
        const bookings = await database_1.prisma.teamBooking.findMany({
            where: { projectId: req.params.projectId },
            include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
            orderBy: [{ onSiteStart: 'asc' }],
        });
        res.json({ success: true, data: bookings });
    }
    catch (err) {
        next(err);
    }
});
// POINT 2 — Accepte attachmentUrl/Name/PublicId
router.post('/projects/:projectId/bookings', async (req, res, next) => {
    try {
        const body = req.body || {};
        if (!body.userId)
            throw new AppError_1.AppError('userId est requis', 400);
        if (!body.phase || !['installation', 'dismantling'].includes(body.phase)) {
            throw new AppError_1.AppError('phase doit être "installation" ou "dismantling"', 400);
        }
        if (!body.onSiteStart || !body.onSiteEnd)
            throw new AppError_1.AppError('onSiteStart et onSiteEnd sont requis', 400);
        const booking = await database_1.prisma.teamBooking.create({
            data: {
                projectId: req.params.projectId,
                userId: body.userId,
                phase: body.phase,
                onSiteStart: new Date(body.onSiteStart),
                onSiteEnd: new Date(body.onSiteEnd),
                outboundMode: body.outboundMode || null,
                outboundDate: body.outboundDate ? new Date(body.outboundDate) : null,
                outboundDetails: body.outboundDetails || null,
                returnMode: body.returnMode || null,
                returnDate: body.returnDate ? new Date(body.returnDate) : null,
                returnDetails: body.returnDetails || null,
                // POINT 2 — Pièce jointe
                attachmentUrl: body.attachmentUrl || null,
                attachmentName: body.attachmentName || null,
                attachmentPublicId: body.attachmentPublicId || null,
                notes: body.notes || null,
            },
            include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
        });
        res.status(201).json({ success: true, data: booking });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/bookings/:id', async (req, res, next) => {
    try {
        const body = req.body || {};
        const data = {};
        for (const k of [
            'phase', 'outboundMode', 'outboundDetails', 'returnMode', 'returnDetails', 'notes',
            'attachmentUrl', 'attachmentName', 'attachmentPublicId', // POINT 2
        ]) {
            if (body[k] !== undefined)
                data[k] = body[k] || null;
        }
        for (const k of ['onSiteStart', 'onSiteEnd', 'outboundDate', 'returnDate']) {
            if (body[k] !== undefined)
                data[k] = body[k] ? new Date(body[k]) : null;
        }
        const booking = await database_1.prisma.teamBooking.update({
            where: { id: req.params.id },
            data,
            include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
        });
        res.json({ success: true, data: booking });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/bookings/:id', async (req, res, next) => {
    try {
        await database_1.prisma.teamBooking.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// ═══════════════════════════════════════════════════════════════════
// HOTEL BOOKINGS — un seul hôtel pour N occupants
// ═══════════════════════════════════════════════════════════════════
router.get('/projects/:projectId/hotel-bookings', async (req, res, next) => {
    try {
        const hotels = await database_1.prisma.hotelBooking.findMany({
            where: { projectId: req.params.projectId },
            include: {
                occupants: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
                },
            },
            orderBy: [{ checkin: 'asc' }],
        });
        res.json({ success: true, data: hotels });
    }
    catch (err) {
        next(err);
    }
});
// POINT 2 — Accepte attachmentUrl/Name/PublicId
router.post('/projects/:projectId/hotel-bookings', async (req, res, next) => {
    try {
        const body = req.body || {};
        if (!body.hotelName)
            throw new AppError_1.AppError('hotelName est requis', 400);
        if (!body.checkin || !body.checkout)
            throw new AppError_1.AppError('checkin et checkout sont requis', 400);
        if (!body.phase || !['installation', 'dismantling'].includes(body.phase)) {
            throw new AppError_1.AppError('phase doit être "installation" ou "dismantling"', 400);
        }
        const userIds = Array.isArray(body.userIds) ? body.userIds.filter((u) => !!u) : [];
        if (userIds.length === 0)
            throw new AppError_1.AppError('Au moins un occupant requis (userIds)', 400);
        const hotel = await database_1.prisma.hotelBooking.create({
            data: {
                projectId: req.params.projectId,
                phase: body.phase,
                hotelName: body.hotelName,
                hotelAddress: body.hotelAddress || null,
                checkin: new Date(body.checkin),
                checkout: new Date(body.checkout),
                reference: body.reference || null,
                notes: body.notes || null,
                // POINT 2 — Pièce jointe
                attachmentUrl: body.attachmentUrl || null,
                attachmentName: body.attachmentName || null,
                attachmentPublicId: body.attachmentPublicId || null,
                occupants: { create: userIds.map(uid => ({ userId: uid })) },
            },
            include: {
                occupants: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
                },
            },
        });
        res.status(201).json({ success: true, data: hotel });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/hotel-bookings/:id', async (req, res, next) => {
    try {
        const body = req.body || {};
        const data = {};
        for (const k of [
            'phase', 'hotelName', 'hotelAddress', 'reference', 'notes',
            'attachmentUrl', 'attachmentName', 'attachmentPublicId', // POINT 2
        ]) {
            if (body[k] !== undefined)
                data[k] = body[k] || null;
        }
        for (const k of ['checkin', 'checkout']) {
            if (body[k] !== undefined)
                data[k] = body[k] ? new Date(body[k]) : null;
        }
        if (Array.isArray(body.userIds)) {
            await database_1.prisma.hotelBookingOccupant.deleteMany({ where: { hotelBookingId: req.params.id } });
            data.occupants = { create: body.userIds.filter((u) => !!u).map((uid) => ({ userId: uid })) };
        }
        const hotel = await database_1.prisma.hotelBooking.update({
            where: { id: req.params.id },
            data,
            include: {
                occupants: {
                    include: { user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } } },
                },
            },
        });
        res.json({ success: true, data: hotel });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/hotel-bookings/:id', async (req, res, next) => {
    try {
        await database_1.prisma.hotelBooking.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.get('/bookings/calendar', async (req, res, next) => {
    try {
        const from = req.query.from ? new Date(String(req.query.from)) : new Date();
        const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 90 * 86400000);
        const roleFilter = req.query.role ? String(req.query.role) : null;
        const raw = await database_1.prisma.teamBooking.findMany({
            where: {
                OR: [
                    { onSiteStart: { lte: to }, onSiteEnd: { gte: from } },
                    { outboundDate: { lte: to, gte: from } },
                    { returnDate: { lte: to, gte: from } },
                ],
            },
            include: {
                user: { select: { id: true, firstName: true, lastName: true, role: true, avatarUrl: true } },
                project: { select: { id: true, name: true, internalNumber: true, status: true } },
            },
            orderBy: [{ onSiteStart: 'asc' }],
        });
        const filtered = roleFilter ? raw.filter((b) => b.user.role === roleFilter) : raw;
        res.json({ success: true, data: filtered });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=teamBookings.js.map