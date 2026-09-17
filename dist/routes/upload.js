"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/upload.ts
const express_1 = require("express");
const cloudinaryService_1 = require("../services/cloudinaryService");
const database_1 = require("../config/database");
const router = (0, express_1.Router)();
// POST /upload/photo — single photo
router.post('/photo', cloudinaryService_1.upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'Fichier manquant' });
        const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(req.file.buffer, req.body.folder || 'general');
        res.json({ success: true, data: { url, publicId, name: req.file.originalname } });
    }
    catch (err) {
        next(err);
    }
});
// POST /upload/photos — multiple photos
router.post('/photos', cloudinaryService_1.upload.array('files', 10), async (req, res, next) => {
    try {
        const files = req.files || [];
        const results = await Promise.all(files.map(f => (0, cloudinaryService_1.uploadToCloudinary)(f.buffer, req.body.folder || 'general')));
        res.json({ success: true, data: results });
    }
    catch (err) {
        next(err);
    }
});
// POST /upload/task-photo/:taskId
router.post('/task-photo/:taskId', cloudinaryService_1.upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'Fichier manquant' });
        const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(req.file.buffer, 'tasks');
        const photo = await database_1.prisma.taskPhoto.create({
            data: { taskId: req.params.taskId, uploadedBy: req.user.id, photoUrl: url, publicId, caption: req.body.caption },
        });
        res.status(201).json({ success: true, data: photo });
    }
    catch (err) {
        next(err);
    }
});
// POST /upload/ticket-photo/:ticketId
router.post('/ticket-photo/:ticketId', cloudinaryService_1.upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'Fichier manquant' });
        const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(req.file.buffer, 'tickets');
        const photo = await database_1.prisma.ticketPhoto.create({
            data: { ticketId: req.params.ticketId, uploadedById: req.user.id, photoUrl: url, publicId, phase: req.body.phase || 'before', caption: req.body.caption },
        });
        res.status(201).json({ success: true, data: photo });
    }
    catch (err) {
        next(err);
    }
});
// POST /upload/project-file/:projectId
router.post('/project-file/:projectId', cloudinaryService_1.upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'Fichier manquant' });
        const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(req.file.buffer, 'projects');
        const file = await database_1.prisma.projectFile.create({
            data: { projectId: req.params.projectId, uploadedBy: req.user.id, fileName: req.file.originalname, fileUrl: url, publicId, fileType: req.file.mimetype, fileSize: req.file.size, category: req.body.category || 'general' },
        });
        res.status(201).json({ success: true, data: file });
    }
    catch (err) {
        next(err);
    }
});
// POST /upload/box-photo/:boxId
router.post('/box-photo/:boxId', cloudinaryService_1.upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'Fichier manquant' });
        const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(req.file.buffer, 'boxes');
        const photo = await database_1.prisma.boxPhoto.create({
            data: { boxId: req.params.boxId, photoUrl: url, publicId, phase: req.body.phase || 'content', caption: req.body.caption },
        });
        res.status(201).json({ success: true, data: photo });
    }
    catch (err) {
        next(err);
    }
});
// POST /upload/handover-photo/:handoverId
router.post('/handover-photo/:handoverId', cloudinaryService_1.upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'Fichier manquant' });
        const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(req.file.buffer, 'handovers');
        const photo = await database_1.prisma.handoverPhoto.create({
            data: { handoverId: req.params.handoverId, uploadedById: req.user.id, photoUrl: url, publicId, caption: req.body.caption, itemId: req.body.itemId || null },
        });
        res.status(201).json({ success: true, data: photo });
    }
    catch (err) {
        next(err);
    }
});
// POST /upload/daily-photo/:reportId
router.post('/daily-photo/:reportId', cloudinaryService_1.upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file)
            return res.status(400).json({ success: false, error: 'Fichier manquant' });
        const { url, publicId } = await (0, cloudinaryService_1.uploadToCloudinary)(req.file.buffer, 'daily-reports');
        const photo = await database_1.prisma.dailyReportPhoto.create({
            data: { reportId: req.params.reportId, photoUrl: url, publicId, caption: req.body.caption || null },
        });
        res.status(201).json({ success: true, data: photo });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=upload.js.map