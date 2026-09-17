"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const AppError_1 = require("../utils/AppError");
const authMiddleware = (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token)
            throw new AppError_1.AppError('Token manquant', 401);
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'vem-secret-change-me');
        req.user = decoded;
        next();
    }
    catch {
        next(new AppError_1.AppError('Non autorisé', 401));
    }
};
exports.authMiddleware = authMiddleware;
const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
        return next(new AppError_1.AppError('Permission insuffisante', 403));
    next();
};
exports.requireRole = requireRole;
//# sourceMappingURL=auth.js.map