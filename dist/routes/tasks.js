"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tasks.ts
const express_1 = require("express");
const database_1 = require("../config/database");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
router.get('/', async (req, res, next) => {
    try {
        const { projectId, date, status, assignedToId } = req.query;
        const where = {};
        if (projectId)
            where.projectId = String(projectId);
        if (status)
            where.status = String(status);
        if (assignedToId)
            where.assignedToId = String(assignedToId);
        if (req.user.role === 'worker')
            where.assignedToId = req.user.id;
        if (date) {
            const d = new Date(String(date));
            const n = new Date(d);
            n.setDate(d.getDate() + 1);
            where.taskDate = { gte: d, lt: n };
        }
        const tasks = await database_1.prisma.task.findMany({
            where, orderBy: [{ taskDate: 'asc' }, { startTime: 'asc' }],
            include: { assignedTo: { select: { id: true, firstName: true, lastName: true } }, photos: { take: 3 }, _count: { select: { comments: true } } },
        });
        res.json({ success: true, data: tasks });
    }
    catch (err) {
        next(err);
    }
});
router.post('/', async (req, res, next) => {
    try {
        const body = { ...req.body };
        // Date de tâche tolérante : si manquante, invalide, ou vide → aujourd'hui.
        let parsedDate = new Date();
        if (body.taskDate) {
            const d = new Date(body.taskDate);
            if (!isNaN(d.getTime()))
                parsedDate = d;
        }
        body.taskDate = parsedDate;
        // Nettoyage : retirer les champs qui ne sont pas dans le modèle Task
        delete body.assignedTo; // on n'accepte que assignedToId
        // body.stage est maintenant un VRAI champ du modèle (préserve l'arborescence template)
        const task = await database_1.prisma.task.create({
            data: { ...body, createdById: req.user.id },
            include: { assignedTo: { select: { id: true, firstName: true, lastName: true } } },
        });
        res.status(201).json({ success: true, data: task });
    }
    catch (err) {
        logger_1.logger.error(`[create-task] échec : code=${err.code || '?'} | meta=${JSON.stringify(err.meta || {})} | msg=${err.message?.slice(0, 300)} | body=${JSON.stringify(req.body).slice(0, 300)}`);
        next(err);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        const task = await database_1.prisma.task.update({ where: { id: req.params.id }, data: req.body });
        res.json({ success: true, data: task });
    }
    catch (err) {
        next(err);
    }
});
router.delete('/:id', async (req, res, next) => {
    try {
        await database_1.prisma.task.delete({ where: { id: req.params.id } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.post('/:id/comments', async (req, res, next) => {
    try {
        const c = await database_1.prisma.taskComment.create({
            data: { taskId: req.params.id, userId: req.user.id, content: req.body.content },
            include: { user: { select: { id: true, firstName: true, lastName: true } } },
        });
        res.status(201).json({ success: true, data: c });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=tasks.js.map