"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/settings.ts
// API CRUD simple pour les settings globaux de l'application.
// Stockés dans la table app_settings en key/value JSON.
// Lecture publique (toute personne authentifiée), écriture admin seulement.
const express_1 = require("express");
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const router = (0, express_1.Router)();
// GET /settings/:key — retourne la valeur du setting (ou null si absent)
router.get('/:key', async (req, res, next) => {
    try {
        const s = await database_1.prisma.appSetting.findUnique({ where: { key: req.params.key } });
        res.json({ success: true, data: s?.value ?? null });
    }
    catch (err) {
        next(err);
    }
});
// PUT /settings/:key — crée ou met à jour (ADMIN ONLY)
// Body : { value: any }
router.put('/:key', async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            throw new AppError_1.AppError('Réservé aux admins', 403);
        const value = req.body.value;
        if (value === undefined)
            throw new AppError_1.AppError('Body.value requis', 400);
        const s = await database_1.prisma.appSetting.upsert({
            where: { key: req.params.key },
            update: { value },
            create: { key: req.params.key, value },
        });
        res.json({ success: true, data: s.value });
    }
    catch (err) {
        next(err);
    }
});
// DELETE /settings/:key — supprime (ADMIN ONLY)
router.delete('/:key', async (req, res, next) => {
    try {
        if (req.user?.role !== 'admin')
            throw new AppError_1.AppError('Réservé aux admins', 403);
        await database_1.prisma.appSetting.delete({ where: { key: req.params.key } }).catch(() => null);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
//# sourceMappingURL=settings.js.map