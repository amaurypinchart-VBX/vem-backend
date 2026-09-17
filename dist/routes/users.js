"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/users.ts
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../config/database");
const AppError_1 = require("../utils/AppError");
const logger_1 = require("../utils/logger");
const emailService_1 = require("../services/emailService");
const crypto_1 = __importDefault(require("crypto"));
const router = (0, express_1.Router)();
// Champs modifiables d'une fiche (liste blanche)
const EDITABLE_FIELDS = [
    'firstName', 'lastName', 'email', 'phone', 'role', 'avatarUrl',
    'birthDate', 'birthPlace', 'nationality', 'idNumber', 'nationalNumber',
    'idExpiry', 'teamGroupId', 'isActive',
];
// Champs renvoyés (jamais le passwordHash)
const USER_SELECT = {
    id: true, email: true, firstName: true, lastName: true, phone: true,
    role: true, avatarUrl: true, birthDate: true, birthPlace: true,
    nationality: true, idNumber: true, nationalNumber: true, idExpiry: true,
    teamGroupId: true, isActive: true, lastLogin: true,
};
router.get('/', async (req, res, next) => {
    try {
        const users = await database_1.prisma.user.findMany({
            where: { isActive: true },
            select: USER_SELECT,
            orderBy: { lastName: 'asc' },
        });
        res.json({ success: true, data: users });
    }
    catch (err) {
        next(err);
    }
});
router.post('/', async (req, res, next) => {
    try {
        if (!['admin', 'project_manager', 'technical_manager'].includes(req.user.role))
            throw new AppError_1.AppError('Permission insuffisante', 403);
        const password = req.body.password || 'VEM2025!';
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        // Liste blanche : on n'insère que les champs autorisés
        const data = { passwordHash };
        for (const key of EDITABLE_FIELDS) {
            if (req.body[key] !== undefined)
                data[key] = req.body[key];
        }
        if (typeof data.email === 'string')
            data.email = data.email.toLowerCase();
        // Log diagnostic : on log les champs envoyés (sans le passwordHash)
        const { passwordHash: _ph, ...safe } = data;
        logger_1.logger.info(`[create-user] champs envoyés : ${JSON.stringify(safe)}`);
        try {
            const user = await database_1.prisma.user.create({
                data,
                select: USER_SELECT,
            });
            res.status(201).json({ success: true, data: { user, tempPassword: password } });
        }
        catch (createErr) {
            // Log explicite de la cause Prisma pour faciliter le diagnostic
            logger_1.logger.error(`[create-user] échec Prisma : code=${createErr.code || '?'} | meta=${JSON.stringify(createErr.meta || {})} | msg=${createErr.message?.slice(0, 300)}`);
            // Diagnostic à la volée : on inspecte la structure réelle de la table users
            // et l'enum UserRole pour comprendre où est la divergence avec le schéma Prisma.
            try {
                const cols = await database_1.prisma.$queryRawUnsafe(`SELECT column_name, data_type, udt_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position;`);
                logger_1.logger.error(`[diag-on-error] colonnes users : ${cols.map(c => `${c.column_name}:${c.data_type}/${c.udt_name}`).join(' | ')}`);
                const enumVals = await database_1.prisma.$queryRawUnsafe(`SELECT enumlabel FROM pg_enum WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'UserRole') ORDER BY enumsortorder;`);
                logger_1.logger.error(`[diag-on-error] UserRole : ${enumVals.map(e => e.enumlabel).join(', ')}`);
            }
            catch (diagErr) {
                logger_1.logger.error(`[diag-on-error] échec lecture méta : ${diagErr.message}`);
            }
            throw createErr;
        }
    }
    catch (err) {
        next(err);
    }
});
router.patch('/:id', async (req, res, next) => {
    try {
        if (req.user.id !== req.params.id && !['admin', 'project_manager'].includes(req.user.role))
            throw new AppError_1.AppError('Permission insuffisante', 403);
        // On ne garde que les champs autorisés réellement présents dans le corps
        const data = {};
        for (const key of EDITABLE_FIELDS) {
            if (req.body[key] !== undefined)
                data[key] = req.body[key];
        }
        if (typeof data.email === 'string')
            data.email = data.email.toLowerCase();
        if (req.body.password)
            data.passwordHash = await bcryptjs_1.default.hash(req.body.password, 12);
        const user = await database_1.prisma.user.update({
            where: { id: req.params.id },
            data,
            select: USER_SELECT,
        });
        res.json({ success: true, data: user });
    }
    catch (err) {
        next(err);
    }
});
// POST /api/v1/users/:id/send-invite
// Génère un mot de passe temporaire (5 min), l'applique au compte, l'envoie par email.
router.post('/:id/send-invite', async (req, res, next) => {
    try {
        if (!['admin', 'project_manager'].includes(req.user.role))
            throw new AppError_1.AppError('Permission insuffisante', 403);
        const user = await database_1.prisma.user.findUnique({ where: { id: req.params.id } });
        if (!user)
            throw new AppError_1.AppError('Utilisateur introuvable', 404);
        if (!user.email)
            throw new AppError_1.AppError('Cet utilisateur n\'a pas d\'email', 400);
        // Mot de passe temporaire : 8 caractères non ambigus
        const tempPassword = Array.from(crypto_1.default.randomBytes(8))
            .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('');
        const passwordHash = await bcryptjs_1.default.hash(tempPassword, 12);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        await database_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
        await database_1.prisma.$executeRaw `
      INSERT INTO invite_passwords (user_id, expires_at, created_at)
      VALUES (${user.id}, ${expiresAt}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET expires_at = ${expiresAt}, created_at = NOW()
    `;
        // Révoque d'éventuelles sessions existantes
        await database_1.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
        const appUrl = process.env.APP_URL || 'https://viewboxsitemanagement.up.railway.app';
        const html = `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#111318;color:#f0f2f5;padding:32px;border-radius:12px;">
        <div style="font-size:24px;font-weight:800;color:#e63946;">VEM</div>
        <div style="font-size:11px;color:#8892a4;margin-bottom:24px;text-transform:uppercase;letter-spacing:1px;">ViewBox Event Manager</div>
        <h2 style="font-size:20px;margin:0 0 12px;">Votre acces VEM</h2>
        <p style="color:#9ba3b2;line-height:1.6;">Bonjour ${user.firstName},</p>
        <p style="color:#9ba3b2;line-height:1.6;">Un compte a ete cree pour vous. Connectez-vous avec les identifiants ci-dessous, puis choisissez votre propre mot de passe.</p>
        <div style="background:#1a1d24;border-radius:8px;padding:16px;margin:16px 0;">
          <div style="font-size:12px;color:#5a6275;">Email</div>
          <div style="font-size:15px;font-weight:700;margin-bottom:10px;">${user.email}</div>
          <div style="font-size:12px;color:#5a6275;">Mot de passe temporaire</div>
          <div style="font-size:22px;font-weight:800;letter-spacing:3px;color:#e63946;font-family:monospace;">${tempPassword}</div>
        </div>
        <div style="background:#3a1a1a;border-radius:8px;padding:10px 14px;margin:16px 0;font-size:13px;color:#ffb4b4;">
          Ce mot de passe expire dans <strong>5 minutes</strong>. Connectez-vous tout de suite.
        </div>
        <div style="text-align:center;margin:24px 0;">
          <a href="${appUrl}" style="background:#e63946;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">Se connecter</a>
        </div>
        <p style="color:#5a6275;font-size:12px;">Si le delai est depasse, demandez un nouvel envoi.</p>
      </div>`;
        await (0, emailService_1.sendMail)({
            to: user.email,
            subject: 'Votre acces VEM - mot de passe temporaire',
            html,
        });
        res.json({ success: true, data: { sentTo: user.email, expiresAt } });
    }
    catch (err) {
        next(err);
    }
});
//test
exports.default = router;
//# sourceMappingURL=users.js.map