"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const errorHandler = (err, req, res, _next) => {
    // Log complet côté serveur (avec stack)
    logger_1.logger.error(`${req.method} ${req.url} — ${err.message || err}`);
    if (err.stack)
        logger_1.logger.error(err.stack);
    // Erreurs Prisma classiques
    if (err.code === 'P2002')
        return res.status(409).json({ success: false, error: 'Valeur déjà existante (contrainte unique)' });
    if (err.code === 'P2025')
        return res.status(404).json({ success: false, error: 'Enregistrement introuvable' });
    // AppError = message explicite contrôlé
    const status = err.statusCode || 500;
    // On renvoie le vrai message d'erreur au front pour le debug (ce qui aide
    // l'utilisateur à voir si c'est par ex. un SMTP non configuré, une clé API
    // manquante, etc.). En prod hardcore on cacherait — mais ici l'opérateur
    // est l'utilisateur final.
    const msg = err.message || (err instanceof AppError_1.AppError ? err.message : 'Erreur interne serveur');
    res.status(status).json({ success: false, error: msg });
};
exports.errorHandler = errorHandler;
//# sourceMappingURL=errorHandler.js.map