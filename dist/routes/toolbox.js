"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/toolbox.ts
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const router = (0, express_1.Router)();
router.get('/', async (req, res, next) => {
    try {
        const boxes = await database_1.prisma.toolbox.findMany({
            where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
            include: { drawers: { include: { tools: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: boxes });
    }
    catch (err) {
        next(err);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const tb = await database_1.prisma.toolbox.findUnique({ where: { id: req.params.id }, include: { drawers: { orderBy: { sortOrder: 'asc' }, include: { tools: { orderBy: { name: 'asc' } } } } } });
        if (!tb)
            throw new AppError_1.AppError('Boîte à outils introuvable', 404);
        const allTools = tb.drawers.flatMap(d => d.tools);
        res.json({ success: true, data: { ...tb, stats: { total: allTools.length, checked: allTools.filter(t => t.isChecked).length, missing: allTools.filter(t => t.status === 'missing').length } } });
    }
    catch (err) {
        next(err);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const { drawers = [], ...data } = req.body;
        const qrCode = `TB-${Date.now()}`;
        const tb = await database_1.prisma.toolbox.create({
            data: { ...data, qrCode, preparedById: req.user.id, drawers: { create: drawers.map((d, i) => ({ name: d.name, sortOrder: i, tools: { create: d.tools || [] } })) } },
            include: { drawers: { include: { tools: true } } },
        });
        res.status(201).json({ success: true, data: tb });
    }
    catch (err) {
        next(err);
    }
});
router.post('/drawers/:drawerId/tools', async (req, res, next) => {
    try {
        const tool = await database_1.prisma.toolboxTool.create({ data: { drawerId: req.params.drawerId, ...req.body } });
        res.status(201).json({ success: true, data: tool });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/tools/:toolId', async (req, res, next) => {
    try {
        const tool = await database_1.prisma.toolboxTool.update({ where: { id: req.params.toolId }, data: req.body });
        res.json({ success: true, data: tool });
    }
    catch (err) {
        next(err);
    }
});
router.post('/drawers/:drawerId/validate', async (req, res, next) => {
    try {
        const d = await database_1.prisma.toolboxDrawer.update({ where: { id: req.params.drawerId }, data: { isValidated: true, validatedAt: new Date() } });
        res.json({ success: true, data: d });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=toolbox.js.map