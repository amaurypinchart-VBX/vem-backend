"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/dailyReports.ts
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const pdfService_1 = require("../services/pdfService");
const emailService_1 = require("../services/emailService");
const router = (0, express_1.Router)();
// Désactive le cache HTTP sur tout ce module : les daily reports changent à
// chaque sauvegarde et il faut que les listes/détails affichent la version la
// plus récente. Sans ça, le navigateur tient à sa version cachée (304) et l'UI
// semble "ne pas se rafraîchir" malgré la sauvegarde réussie côté serveur.
router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
    next();
});
router.get('/', async (req, res, next) => {
    try {
        const reports = await database_1.prisma.dailyReport.findMany({
            where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
            orderBy: { reportDate: 'desc' },
            include: {
                createdBy: { select: { firstName: true, lastName: true } },
                _count: { select: { entries: true, photos: true } },
                // Aperçu : on remonte les 3 premières entrées pour que la carte montre
                // un extrait concret au lieu d'un simple compteur. Ça rend toute modif visible.
                entries: { take: 3, orderBy: { entryTime: 'asc' } },
            },
        });
        res.json({ success: true, data: reports });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const r = await database_1.prisma.dailyReport.findUnique({
            where: { id: req.params.id },
            include: { entries: { orderBy: { entryTime: 'asc' } }, checklist: true, photos: true, createdBy: { select: { firstName: true, lastName: true } }, project: { select: { name: true, internalNumber: true } } },
        });
        if (!r)
            throw new AppError_1.AppError('Rapport introuvable', 404);
        res.json({ success: true, data: r });
    }
    catch (err) {
        next(err);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const { entries = [], checklist = [], ...data } = req.body;
        const reportDate = new Date(data.reportDate);
        // Le métier autorise plusieurs rapports par projet pour la même date
        // (ex: rapport matin + rapport soir, ou différents équipiers). On crée
        // donc systématiquement un nouveau rapport. Pour modifier un rapport
        // existant, le front utilise PATCH /:id depuis la carte de la liste.
        const report = await database_1.prisma.dailyReport.create({
            data: {
                ...data,
                createdById: req.user.id,
                reportDate,
                entries: { create: entries },
                checklist: { create: checklist },
            },
            include: { entries: true, checklist: true, photos: true },
        });
        res.status(201).json({ success: true, data: report });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const { entries, checklist, ...scalars } = req.body;
        const id = req.params.id;
        // Si on reçoit des entries ou une checklist, on les remplace (delete + create)
        if (Array.isArray(entries)) {
            await database_1.prisma.dailyReportEntry.deleteMany({ where: { reportId: id } });
        }
        if (Array.isArray(checklist)) {
            await database_1.prisma.dailyReportChecklistItem.deleteMany({ where: { reportId: id } });
        }
        const data = { ...scalars };
        if (scalars.reportDate)
            data.reportDate = new Date(scalars.reportDate);
        if (Array.isArray(entries) && entries.length)
            data.entries = { create: entries };
        if (Array.isArray(checklist) && checklist.length)
            data.checklist = { create: checklist };
        const report = await database_1.prisma.dailyReport.update({
            where: { id },
            data,
            include: { entries: true, checklist: true, photos: true },
        });
        res.json({ success: true, data: report });
    }
    catch (err) {
        next(err);
    }
});
// POST /daily-reports/:id/photos — attacher une photo déjà uploadée (par URL)
router.post('/:id/photos', async (req, res, next) => {
    try {
        const { photoUrl, publicId, caption } = req.body;
        if (!photoUrl)
            return res.status(400).json({ success: false, error: 'photoUrl requis' });
        const photo = await database_1.prisma.dailyReportPhoto.create({
            data: { reportId: req.params.id, photoUrl, publicId: publicId || null, caption: caption || null },
        });
        res.status(201).json({ success: true, data: photo });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /daily-reports/:id/photos/:photoId
router.delete('/:id/photos/:photoId', async (req, res, next) => {
    try {
        await database_1.prisma.dailyReportPhoto.delete({ where: { id: req.params.photoId } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// PATCH /daily-reports/:id/photos/:photoId — modifier la légende
router.patch('/:id/photos/:photoId', async (req, res, next) => {
    try {
        const photo = await database_1.prisma.dailyReportPhoto.update({
            where: { id: req.params.photoId },
            data: { caption: req.body.caption ?? null },
        });
        res.json({ success: true, data: photo });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /daily-reports/:id — supprimer un rapport
router.delete('/:id', async (req, res, next) => {
    try {
        await database_1.prisma.dailyReport.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
// POST /daily-reports/:id/send — generate PDF + email
// Body optionnel : { recipients?: string[] }
// Si recipients est fourni : envoie à cette liste précise.
// Sinon : fallback à l'envoi automatique (client + manager technique + équipe).
router.post('/:id/send', async (req, res, next) => {
    try {
        const lang = (req.body?.lang === 'en') ? 'en' : 'fr';
        const r = await database_1.prisma.dailyReport.findUnique({
            where: { id: req.params.id },
            include: {
                project: {
                    include: {
                        client: { select: { name: true, contactName: true, email: true, phone: true, address: true } },
                        technicalManager: { select: { email: true } },
                        team: { include: { user: { select: { email: true } } } },
                    },
                },
                entries: { orderBy: { entryTime: 'asc' } },
                checklist: true, photos: true,
                createdBy: { select: { firstName: true, lastName: true } },
            },
        });
        if (!r)
            throw new AppError_1.AppError('Rapport introuvable', 404);
        const pdfBuffer = await (0, pdfService_1.generateDailyReportPdf)({
            project: { name: r.project.name, internalNumber: r.project.internalNumber },
            client: r.project.client || null,
            reportDate: r.reportDate,
            reportId: r.id,
            createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : undefined,
            weather: r.weather,
            workersPresent: r.workersPresent,
            generalNotes: r.generalNotes,
            entries: r.entries,
            checklist: r.checklist,
            photos: r.photos,
            lang, // ⬅️ ajout
        });
        const recipients = new Set();
        const customList = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
        if (customList.length > 0) {
            customList
                .map(e => String(e).trim().toLowerCase())
                .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
                .forEach(e => recipients.add(e));
        }
        else {
            if (r.project.client?.email)
                recipients.add(r.project.client.email);
            if (r.project.technicalManager?.email)
                recipients.add(r.project.technicalManager.email);
            r.project.team.forEach((t) => { if (t.user.email)
                recipients.add(t.user.email); });
        }
        if (recipients.size === 0)
            throw new AppError_1.AppError('Aucun destinataire valide', 400);
        await (0, emailService_1.sendDailyReport)({
            to: Array.from(recipients),
            projectName: r.project.name,
            date: new Date(r.reportDate).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR'),
            notes: r.generalNotes || undefined,
            entries: r.entries,
            pdfBuffer,
            lang, // ⬅️ ajout
        });
        await database_1.prisma.dailyReport.update({ where: { id: r.id }, data: { sentAt: new Date() } });
        res.json({ success: true, data: { sentTo: recipients.size, recipients: Array.from(recipients) } });
    }
    catch (err) {
        next(err);
    }
});
// POST /daily-reports/test-email — utilitaire de diagnostic SMTP
// Envoie un mail de test à l'adresse fournie (ou l'email de l'utilisateur connecté)
// Permet de vérifier que la config Gmail/Brevo fonctionne sans avoir à créer un rapport.
router.post('/test-email', async (req, res, next) => {
    try {
        const to = req.body?.to || req.user?.email;
        if (!to)
            throw new AppError_1.AppError('Adresse "to" requise', 400);
        const { sendTestEmail } = await Promise.resolve().then(() => __importStar(require('../services/emailService')));
        const result = await sendTestEmail(to);
        res.json({ success: true, data: { sentTo: to, messageId: result?.messageId } });
    }
    catch (err) {
        next(err);
    }
});
// GET /daily-reports/:id/pdf?lang=fr|en — télécharge le PDF (sans envoyer d'email)
router.get('/:id/pdf', async (req, res, next) => {
    try {
        const lang = (req.query.lang === 'en') ? 'en' : 'fr';
        const r = await database_1.prisma.dailyReport.findUnique({
            where: { id: req.params.id },
            include: {
                project: {
                    include: {
                        client: { select: { name: true, contactName: true, email: true, phone: true, address: true } },
                    },
                },
                entries: { orderBy: { entryTime: 'asc' } },
                checklist: true, photos: true,
                createdBy: { select: { firstName: true, lastName: true } },
            },
        });
        if (!r)
            throw new AppError_1.AppError('Rapport introuvable', 404);
        const pdfBuffer = await (0, pdfService_1.generateDailyReportPdf)({
            project: { name: r.project.name, internalNumber: r.project.internalNumber },
            client: r.project.client || null,
            reportDate: r.reportDate,
            reportId: r.id,
            createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : undefined,
            weather: r.weather,
            workersPresent: r.workersPresent,
            generalNotes: r.generalNotes,
            entries: r.entries,
            checklist: r.checklist,
            photos: r.photos,
            lang,
        });
        const filename = `DailyReport_${r.project.internalNumber}_${new Date(r.reportDate).toISOString().slice(0, 10)}_${lang}.pdf`;
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(pdfBuffer);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=dailyReports.js.map