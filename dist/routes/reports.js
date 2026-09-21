"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/reports.ts — Direct PDF download endpoints
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const pdfService_1 = require("../services/pdfService");
const logger_1 = require("../utils/logger");
const saveProjectFile_1 = require("../utils/saveProjectFile");
const router = (0, express_1.Router)();
// GET /reports/daily/:id — download daily report PDF
router.get('/daily/:id', async (req, res, next) => {
    try {
        const r = await database_1.prisma.dailyReport.findUnique({
            where: { id: req.params.id },
            include: {
                entries: true,
                checklist: true,
                photos: true,
                createdBy: { select: { firstName: true, lastName: true } },
                project: {
                    select: {
                        name: true,
                        internalNumber: true,
                        address: true,
                        client: {
                            select: { name: true, contactName: true, email: true, phone: true, address: true },
                        },
                    },
                },
            },
        });
        if (!r)
            throw new AppError_1.AppError('Rapport introuvable', 404);
        logger_1.logger.info(`[pdf-daily] Génération pour ${r.id} — ${r.entries.length} entrées, ${r.photos.length} photos`);
        const pdf = await (0, pdfService_1.generateDailyReportPdf)({
            project: r.project,
            client: r.project.client || null, // ← coordonnées du contact client transmises au PDF
            reportDate: r.reportDate,
            reportId: r.id,
            createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : undefined,
            weather: r.weather,
            workersPresent: r.workersPresent,
            generalNotes: r.generalNotes,
            entries: r.entries,
            checklist: r.checklist,
            photos: r.photos,
        });
        // Archivage best-effort dans les fichiers du projet — ne bloque pas le téléchargement.
        (0, saveProjectFile_1.saveProjectFilePdf)(r.projectId, pdf, `DailyReport_${r.project.internalNumber}_${new Date(r.reportDate).toISOString().slice(0, 10)}.pdf`, 'daily_report', req.user?.id);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="DailyReport_${r.project.internalNumber}_${new Date(r.reportDate).toISOString().slice(0, 10)}.pdf"` });
        res.send(pdf);
    }
    catch (err) {
        next(err);
    }
});
// GET /reports/handover/:id — download handover PDF
router.get('/handover/:id', async (req, res, next) => {
    try {
        const h = await database_1.prisma.handover.findUnique({
            where: { id: req.params.id },
            include: {
                project: { include: { client: true } },
                siteManager: { select: { firstName: true, lastName: true } },
                items: {
                    orderBy: { sortOrder: 'asc' },
                    include: {
                        photos: true,
                        itemPhotos: true, // anciens uploads via /upload/handover-photo
                    },
                },
            },
        });
        if (!h)
            throw new AppError_1.AppError('Handover introuvable', 404);
        // On fusionne les deux sources de photos par item (legacy + nouvelle)
        const items = h.items.map((it) => ({
            zoneName: it.zoneName,
            status: it.status,
            comment: it.comment,
            photos: [
                ...(it.photos || []).map((p) => ({ photoUrl: p.photoUrl })),
                ...(it.itemPhotos || []).map((p) => ({ photoUrl: p.photoUrl })),
            ],
        }));
        const pdf = await (0, pdfService_1.generateHandoverPdf)({
            project: { name: h.project.name, internalNumber: h.project.internalNumber, address: h.project.address },
            clientName: h.clientName || h.project.client.name,
            siteManagerName: h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A',
            items,
            generalNotes: h.generalNotes,
            date: h.createdAt,
        });
        (0, saveProjectFile_1.saveProjectFilePdf)(h.projectId, pdf, `Handover_${h.project.internalNumber}.pdf`, 'handover', req.user?.id);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Handover_${h.project.internalNumber}.pdf"` });
        res.send(pdf);
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=reports.js.map