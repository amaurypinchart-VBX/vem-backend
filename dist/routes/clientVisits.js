"use strict";
// src/routes/clientVisits.ts
// Routes pour gérer les "visites client" — un rapport de visite contenant
// plusieurs points (ClientRemark). Chaque point peut avoir ses photos.
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const pdfService_1 = require("../services/pdfService");
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
// Pas de cache : ces données changent à chaque ajout de point
router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    next();
});
// GET /client-visits?projectId=... → liste des visites d'un projet
router.get('/', async (req, res, next) => {
    try {
        const where = {};
        if (req.query.projectId)
            where.projectId = String(req.query.projectId);
        const visits = await database_1.prisma.clientVisit.findMany({
            where,
            orderBy: { visitDate: 'desc' },
            include: {
                client: { select: { id: true, name: true } },
                _count: { select: { remarks: true } },
            },
        });
        res.json({ success: true, data: visits });
    }
    catch (err) {
        next(err);
    }
});
// GET /client-visits/:id → détail d'une visite avec tous ses points et photos
router.get('/:id', async (req, res, next) => {
    try {
        const v = await database_1.prisma.clientVisit.findUnique({
            where: { id: req.params.id },
            include: {
                client: true,
                project: { select: { id: true, name: true, internalNumber: true } },
                remarks: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        photos: true,
                        assignedToUser: { select: { id: true, firstName: true, lastName: true } },
                    },
                },
            },
        });
        if (!v)
            throw new AppError_1.AppError('Visite introuvable', 404);
        res.json({ success: true, data: v });
    }
    catch (err) {
        next(err);
    }
});
// POST /client-visits → créer une nouvelle visite (vide)
router.post('/', async (req, res, next) => {
    try {
        const { projectId, clientId, title, visitDate, notes } = req.body;
        if (!projectId || !title)
            throw new AppError_1.AppError('projectId et title requis', 400);
        const v = await database_1.prisma.clientVisit.create({
            data: {
                projectId,
                clientId: clientId || null,
                title,
                visitDate: visitDate ? new Date(visitDate) : new Date(),
                notes: notes || null,
                createdById: req.user.id,
            },
            include: {
                client: { select: { id: true, name: true } },
                _count: { select: { remarks: true } },
            },
        });
        res.status(201).json({ success: true, data: v });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /client-visits/:id → modifier la visite (titre, client, notes, date)
router.patch('/:id', async (req, res, next) => {
    try {
        const data = {};
        ['title', 'clientId', 'notes'].forEach(k => {
            if (req.body[k] !== undefined)
                data[k] = req.body[k];
        });
        if (req.body.visitDate)
            data.visitDate = new Date(req.body.visitDate);
        if (data.clientId === '')
            data.clientId = null;
        const v = await database_1.prisma.clientVisit.update({
            where: { id: req.params.id },
            data,
            include: {
                client: { select: { id: true, name: true } },
                _count: { select: { remarks: true } },
            },
        });
        res.json({ success: true, data: v });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /client-visits/:id → supprimer la visite (cascade → ses points)
router.delete('/:id', async (req, res, next) => {
    try {
        await database_1.prisma.clientVisit.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// GET /client-visits/:id/pdf — télécharger le rapport PDF
// GET /client-visits/:id/pdf?lang=fr|en — télécharger le rapport PDF
router.get('/:id/pdf', async (req, res, next) => {
    try {
        const lang = (req.query.lang === 'en') ? 'en' : 'fr';
        const v = await database_1.prisma.clientVisit.findUnique({
            where: { id: req.params.id },
            include: {
                client: true,
                project: { select: { name: true, internalNumber: true } },
                remarks: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        photos: true,
                        assignedToUser: { select: { firstName: true, lastName: true } },
                    },
                },
            },
        });
        if (!v)
            throw new AppError_1.AppError('Visite introuvable', 404);
        const pdf = await (0, pdfService_1.generateVisitReportPdf)({
            project: { name: v.project.name, internalNumber: v.project.internalNumber },
            visit: { id: v.id, title: v.title, visitDate: v.visitDate, notes: v.notes, client: v.client },
            points: v.remarks.map((r) => ({
                title: r.title,
                description: r.description,
                zone: r.zone,
                status: r.status,
                priority: r.priority,
                assignedToUser: r.assignedToUser,
                photos: r.photos || [],
            })),
            lang, // ⬅️ ajout
        });
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="Visite_${v.project.internalNumber}_${v.id.slice(0, 8)}_${lang}.pdf"`,
        });
        res.send(pdf);
    }
    catch (err) {
        next(err);
    }
});
// POST /client-visits/:id/send — envoie le PDF par email
// Body : { recipients?: string[]; lang?: 'fr' | 'en' }
router.post('/:id/send', async (req, res, next) => {
    try {
        const lang = (req.body?.lang === 'en') ? 'en' : 'fr';
        const v = await database_1.prisma.clientVisit.findUnique({
            where: { id: req.params.id },
            include: {
                client: true,
                project: { select: { name: true, internalNumber: true } },
                remarks: {
                    orderBy: { createdAt: 'asc' },
                    include: {
                        photos: true,
                        assignedToUser: { select: { firstName: true, lastName: true } },
                    },
                },
            },
        });
        if (!v)
            throw new AppError_1.AppError('Visite introuvable', 404);
        const pdf = await (0, pdfService_1.generateVisitReportPdf)({
            project: { name: v.project.name, internalNumber: v.project.internalNumber },
            visit: { id: v.id, title: v.title, visitDate: v.visitDate, notes: v.notes, client: v.client },
            points: v.remarks.map((r) => ({
                title: r.title,
                description: r.description,
                zone: r.zone,
                status: r.status,
                priority: r.priority,
                assignedToUser: r.assignedToUser,
                photos: r.photos || [],
            })),
            lang, // ⬅️ ajout
        });
        const recipients = new Set();
        const customList = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
        if (customList.length > 0) {
            customList
                .map((e) => String(e).trim().toLowerCase())
                .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
                .forEach((e) => recipients.add(e));
        }
        else if (v.client?.email) {
            recipients.add(v.client.email);
        }
        if (recipients.size === 0)
            throw new AppError_1.AppError('Aucun destinataire valide (client sans email et aucun email manuel)', 400);
        // Email body localisé
        const dateStr = new Date(v.visitDate).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR');
        const greeting = lang === 'en' ? 'Hello,' : 'Bonjour,';
        const bodyLine = lang === 'en' ? 'Please find attached the report of the visit' : 'Veuillez trouver ci-joint le rapport de la visite';
        const ofThe = lang === 'en' ? 'on' : 'du';
        const projectLine = lang === 'en' ? `Project: <strong>${v.project.name}</strong> (ref. ${v.project.internalNumber})` : `Projet : <strong>${v.project.name}</strong> (réf. ${v.project.internalNumber})`;
        const pointsLine = lang === 'en' ? `${v.remarks.length} item(s) inspected.` : `${v.remarks.length} point(s) inspecté(s).`;
        const signature = lang === 'en' ? 'Best regards,<br>The VIEWBOX team' : 'Cordialement,<br>L\'équipe VIEWBOX';
        const subject = lang === 'en'
            ? `[VEM] Visit Report — ${v.project.name} (${v.project.internalNumber})`
            : `[VEM] Rapport de visite — ${v.project.name} (${v.project.internalNumber})`;
        await (0, emailService_1.sendMail)({
            to: Array.from(recipients),
            subject,
            html: `<p>${greeting}</p>
<p>${bodyLine} <strong>${v.title}</strong> ${ofThe} ${dateStr}.</p>
<p>${projectLine}</p>
<p>${pointsLine}</p>
<p>${signature}</p>`,
            attachments: [{
                    filename: `Visite_${v.project.internalNumber}_${v.id.slice(0, 8)}_${lang}.pdf`,
                    content: pdf,
                    contentType: 'application/pdf',
                }],
        });
        res.json({ success: true, data: { sentTo: recipients.size, recipients: Array.from(recipients) } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=clientVisits.js.map