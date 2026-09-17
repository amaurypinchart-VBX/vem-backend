"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/warehouse.ts
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const router = (0, express_1.Router)();
router.get('/boxes', async (req, res, next) => {
    try {
        const boxes = await database_1.prisma.warehouseBox.findMany({
            where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
            include: { preparedBy: { select: { firstName: true, lastName: true } }, _count: { select: { items: true, photos: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: boxes });
    }
    catch (err) {
        next(err);
    }
});
router.get('/boxes/:id', async (req, res, next) => {
    try {
        const box = await database_1.prisma.warehouseBox.findUnique({
            where: { id: req.params.id },
            include: { items: { orderBy: { sortOrder: 'asc' } }, photos: true, preparedBy: { select: { firstName: true, lastName: true } } },
        });
        if (!box)
            throw new AppError_1.AppError('Box introuvable', 404);
        res.json({ success: true, data: box });
    }
    catch (err) {
        next(err);
    }
});
router.post('/boxes', async (req, res, next) => {
    try {
        const { items = [], ...data } = req.body;
        const qrCode = `BOX-${Date.now()}-${data.projectId?.slice(0, 8).toUpperCase()}`;
        const box = await database_1.prisma.warehouseBox.create({
            data: { ...data, qrCode, preparedById: req.user.id, items: { create: items.map((i, idx) => ({ ...i, sortOrder: idx })) } },
            include: { items: true },
        });
        res.status(201).json({ success: true, data: box });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/boxes/:id', async (req, res, next) => {
    try {
        const box = await database_1.prisma.warehouseBox.update({ where: { id: req.params.id }, data: req.body });
        res.json({ success: true, data: box });
    }
    catch (err) {
        next(err);
    }
});
router.post('/boxes/:id/items', async (req, res, next) => {
    try {
        const item = await database_1.prisma.boxItem.create({ data: { boxId: req.params.id, ...req.body } });
        res.status(201).json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/items/:itemId', async (req, res, next) => {
    try {
        const item = await database_1.prisma.boxItem.update({ where: { id: req.params.itemId }, data: req.body });
        res.json({ success: true, data: item });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/items/:itemId', async (req, res, next) => {
    try {
        await database_1.prisma.boxItem.delete({ where: { id: req.params.itemId } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.get('/scan/:qrCode', async (req, res, next) => {
    try {
        const box = await database_1.prisma.warehouseBox.findUnique({ where: { qrCode: req.params.qrCode }, include: { items: true, project: { select: { name: true, internalNumber: true } } } });
        if (!box)
            throw new AppError_1.AppError('QR Code non reconnu', 404);
        res.json({ success: true, data: box });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=warehouse.js.map