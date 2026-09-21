"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/handover.ts
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const pdfService_1 = require("../services/pdfService");
const emailService_1 = require("../services/emailService");
const saveProjectFile_1 = require("../utils/saveProjectFile");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
// GET /handover — liste tous les handovers (filtrés par projet si ?projectId=)
router.get('/', async (req, res, next) => {
    try {
        const handovers = await database_1.prisma.handover.findMany({
            where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
            include: {
                project: { select: { name: true, internalNumber: true } },
                siteManager: { select: { firstName: true, lastName: true } },
                items: { orderBy: { sortOrder: 'asc' } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: handovers });
    }
    catch (err) {
        next(err);
    }
});
// GET /handover/:id — détail complet
router.get('/:id', async (req, res, next) => {
    try {
        const h = await database_1.prisma.handover.findUnique({
            where: { id: req.params.id },
            include: {
                project: {
                    include: {
                        client: true,
                        technicalManager: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
                        team: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } },
                    },
                },
                siteManager: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
                items: {
                    orderBy: { sortOrder: 'asc' },
                    include: { photos: true, itemPhotos: true },
                },
                photos: true,
            },
        });
        if (!h)
            throw new AppError_1.AppError('Handover introuvable', 404);
        res.json({ success: true, data: h });
    }
    catch (err) {
        next(err);
    }
});
// POST /handover — créer un nouveau handover
router.post('/', async (req, res, next) => {
    try {
        // Extraire et ignorer les champs inconnus par Prisma
        const { items, responsible, customFields, handoverDate, ...handoverData } = req.body;
        const h = await database_1.prisma.handover.create({
            data: {
                ...handoverData,
                createdById: req.user.id,
                items: items?.length
                    ? {
                        create: items.map((item, i) => ({
                            zoneName: item.zoneName || 'Zone ' + (i + 1),
                            status: item.status || 'ok',
                            comment: item.comment || null,
                            sortOrder: i,
                        })),
                    }
                    : {
                        create: [{ zoneName: 'Inspection générale', status: 'ok', sortOrder: 0 }],
                    },
            },
            include: {
                items: { orderBy: { sortOrder: 'asc' } },
                siteManager: { select: { firstName: true, lastName: true } },
            },
        });
        res.status(201).json({ success: true, data: h });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /handover/:id — modifier un handover
router.patch('/:id', async (req, res, next) => {
    try {
        const { items, responsible, project, createdBy, siteManagerUser, ...data } = req.body;
        const h = await database_1.prisma.handover.update({
            where: { id: req.params.id },
            data,
        });
        // Mettre à jour les items si fournis
        if (items?.length) {
            for (const item of items) {
                if (item.id) {
                    // On ne met à jour QUE les champs réellement transmis,
                    // pour ne pas écraser zoneName/comment quand le front n'envoie que le statut.
                    const itemData = {};
                    if (item.zoneName !== undefined)
                        itemData.zoneName = item.zoneName;
                    if (item.status !== undefined)
                        itemData.status = item.status;
                    if (item.comment !== undefined)
                        itemData.comment = item.comment;
                    await database_1.prisma.handoverItem.update({
                        where: { id: item.id },
                        data: itemData,
                    });
                }
            }
        }
        res.json({ success: true, data: h });
    }
    catch (err) {
        next(err);
    }
});
// POST /handover/:id/items — ajouter un nouveau point d'inspection à un handover existant
router.post('/:id/items', async (req, res, next) => {
    try {
        const { zoneName, status, comment } = req.body;
        if (!zoneName?.trim())
            throw new AppError_1.AppError('zoneName requis', 400);
        // sortOrder = position après les items existants
        const count = await database_1.prisma.handoverItem.count({ where: { handoverId: req.params.id } });
        const item = await database_1.prisma.handoverItem.create({
            data: {
                handoverId: req.params.id,
                zoneName: zoneName.trim(),
                status: status || 'ok',
                comment: comment || null,
                sortOrder: count,
            },
            include: { photos: true, itemPhotos: true },
        });
        res.status(201).json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /handover/:id
router.delete('/:id', async (req, res, next) => {
    try {
        await database_1.prisma.handover.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// POST /handover/:id/sign — signer (client ou manager)
router.post('/:id/sign', async (req, res, next) => {
    try {
        const { type, signatureBase64 } = req.body;
        const updateData = {};
        if (type === 'manager') {
            updateData.managerSignatureUrl = signatureBase64;
            updateData.managerSignedAt = new Date();
        }
        else if (type === 'client') {
            updateData.clientSignatureUrl = signatureBase64;
            updateData.clientSignedAt = new Date();
        }
        else {
            throw new AppError_1.AppError('Type de signature invalide (manager ou client)', 400);
        }
        const h = await database_1.prisma.handover.update({
            where: { id: req.params.id },
            data: updateData,
        });
        // Si les deux ont signé → passer en signed
        if (h.managerSignedAt && h.clientSignedAt) {
            await database_1.prisma.handover.update({
                where: { id: req.params.id },
                data: { status: 'signed' },
            });
        }
        res.json({ success: true, data: h });
    }
    catch (err) {
        next(err);
    }
});
// POST /handover/:id/items/:itemId/photo — ajouter une photo sur un item
router.post('/:id/items/:itemId/photo', async (req, res, next) => {
    try {
        const { photoUrl, publicId } = req.body;
        if (!photoUrl)
            throw new AppError_1.AppError('photoUrl requis', 400);
        const photo = await database_1.prisma.handoverItemPhoto.create({
            data: {
                itemId: req.params.itemId,
                photoUrl,
                publicId: publicId || null,
            },
        });
        res.status(201).json({ success: true, data: photo });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /handover/:id/items/:itemId — modifier le statut d'un item
router.patch('/:id/items/:itemId', async (req, res, next) => {
    try {
        const { status, comment } = req.body;
        const item = await database_1.prisma.handoverItem.update({
            where: { id: req.params.itemId },
            data: { status, comment },
        });
        res.json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
// POST /handover/:id/send — génère le PDF et l'envoie par email
// Body optionnel : { recipients?: string[] } — sinon utilise l'email du client du projet
router.post('/:id/send', async (req, res, next) => {
    try {
        // Langue du PDF + email — par défaut français, mais le frontend peut passer 'en'
        const lang = (req.body?.lang === 'en') ? 'en' : 'fr';
        const h = await database_1.prisma.handover.findUnique({
            where: { id: req.params.id },
            include: {
                project: { include: { client: true } },
                siteManager: { select: { firstName: true, lastName: true } },
                items: {
                    orderBy: { sortOrder: 'asc' },
                    include: { photos: true, itemPhotos: true },
                },
            },
        });
        if (!h)
            throw new AppError_1.AppError('Handover introuvable', 404);
        const items = h.items.map((it) => ({
            zoneName: it.zoneName,
            status: it.status,
            comment: it.comment,
            photos: [
                ...(it.photos || []).map((p) => ({ photoUrl: p.photoUrl })),
                ...(it.itemPhotos || []).map((p) => ({ photoUrl: p.photoUrl })),
            ],
        }));
        const pdfBuffer = await (0, pdfService_1.generateHandoverPdf)({
            project: { name: h.project.name, internalNumber: h.project.internalNumber, address: h.project.address },
            clientName: h.clientName || h.project.client?.name || 'Client',
            siteManagerName: h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A',
            items,
            generalNotes: h.generalNotes,
            scopeOfWork: h.scopeOfWork,
            managerSignatureUrl: h.managerSignatureUrl,
            clientSignatureUrl: h.clientSignatureUrl,
            date: h.createdAt,
            lang,
        });
        (0, saveProjectFile_1.saveProjectFilePdf)(h.projectId, pdfBuffer, `Handover_${h.project.internalNumber}_${lang}.pdf`, 'handover', req.user?.id);
        const recipients = new Set();
        const customList = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
        if (customList.length > 0) {
            customList
                .map(e => String(e).trim().toLowerCase())
                .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
                .forEach(e => recipients.add(e));
        }
        else if (h.project.client?.email) {
            recipients.add(h.project.client.email);
        }
        if (recipients.size === 0)
            throw new AppError_1.AppError('Aucun destinataire valide (client sans email et aucun email manuel)', 400);
        // Email body localisé
        const dateStr = new Date(h.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR');
        const greeting = lang === 'en' ? 'Hello,' : 'Bonjour,';
        const bodyLine = lang === 'en' ? 'Please find attached the handover report for the project' : 'Veuillez trouver ci-joint le rapport de handover pour le projet';
        const dateLabel = lang === 'en' ? 'Date' : 'Date';
        const signature = lang === 'en' ? 'Best regards,<br>The VIEWBOX team' : 'Cordialement,<br>L\'équipe VIEWBOX';
        const subject = lang === 'en'
            ? `[VEM] Handover Report — ${h.project.name} (${h.project.internalNumber})`
            : `[VEM] Rapport de handover — ${h.project.name} (${h.project.internalNumber})`;
        await (0, emailService_1.sendMail)({
            to: Array.from(recipients),
            subject,
            html: `<p>${greeting}</p>
<p>${bodyLine} <strong>${h.project.name}</strong> (réf. ${h.project.internalNumber}).</p>
<p>${dateLabel} : ${dateStr}</p>
<p>${signature}</p>`,
            attachments: [{
                    filename: `Handover_${h.project.internalNumber}.pdf`,
                    content: pdfBuffer,
                    contentType: 'application/pdf',
                }],
        });
        res.json({ success: true, data: { sentTo: recipients.size, recipients: Array.from(recipients) } });
    }
    catch (err) {
        next(err);
    }
});
// GET /handover/:id/pdf?lang=fr|en — télécharge le PDF (sans envoyer d'email)
router.get('/:id/pdf', async (req, res, next) => {
    try {
        const lang = (req.query.lang === 'en') ? 'en' : 'fr';
        const h = await database_1.prisma.handover.findUnique({
            where: { id: req.params.id },
            include: {
                project: { include: { client: true } },
                siteManager: { select: { firstName: true, lastName: true } },
                items: {
                    orderBy: { sortOrder: 'asc' },
                    include: { photos: true, itemPhotos: true },
                },
            },
        });
        if (!h)
            throw new AppError_1.AppError('Handover introuvable', 404);
        const items = h.items.map((it) => ({
            zoneName: it.zoneName,
            status: it.status,
            comment: it.comment,
            photos: [
                ...(it.photos || []).map((p) => ({ photoUrl: p.photoUrl })),
                ...(it.itemPhotos || []).map((p) => ({ photoUrl: p.photoUrl })),
            ],
        }));
        const pdfBuffer = await (0, pdfService_1.generateHandoverPdf)({
            project: { name: h.project.name, internalNumber: h.project.internalNumber, address: h.project.address },
            clientName: h.clientName || h.project.client?.name || 'Client',
            siteManagerName: h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A',
            items,
            generalNotes: h.generalNotes,
            scopeOfWork: h.scopeOfWork,
            managerSignatureUrl: h.managerSignatureUrl,
            clientSignatureUrl: h.clientSignatureUrl,
            date: h.createdAt,
            lang,
        });
        const filename = `Handover_${h.project.internalNumber}_${lang}.pdf`;
        (0, saveProjectFile_1.saveProjectFilePdf)(h.projectId, pdfBuffer, filename, 'handover', req.user?.id);
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    }
    catch (err) {
        next(err);
    }
});
// POST /handover/:id/signature-token — génère un nouveau token de signature (single-use)
// Invalide automatiquement tout token précédent pour le même handover.
router.post('/:id/signature-token', async (req, res, next) => {
    try {
        const h = await database_1.prisma.handover.findUnique({ where: { id: req.params.id } });
        if (!h)
            throw new AppError_1.AppError('Handover introuvable', 404);
        // Génère un token cryptographique URL-safe (43 caractères)
        const token = crypto_1.default.randomBytes(32).toString('base64url');
        await database_1.prisma.handover.update({
            where: { id: req.params.id },
            data: {
                signatureToken: token,
                signatureTokenUsed: false,
                signatureTokenCreatedAt: new Date(),
            },
        });
        res.json({ success: true, data: { token } });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=handover.js.map