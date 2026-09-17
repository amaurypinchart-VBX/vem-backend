"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/notifications.ts
const express_1 = require("express");
const database_1 = require("../config/database");
const router = (0, express_1.Router)();
router.get('/', async (req, res, next) => {
    try {
        const notifs = await database_1.prisma.notification.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        const unread = notifs.filter(n => !n.isRead).length;
        res.json({ success: true, data: notifs, meta: { unread } });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/read-all', async (req, res, next) => {
    try {
        await database_1.prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:id/read', async (req, res, next) => {
    try {
        await database_1.prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { isRead: true } });
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=notifications.js.map