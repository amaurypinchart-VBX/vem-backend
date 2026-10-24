// src/routes/auth.ts
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { hasPlansAccess } from '../middleware/plansAccess';
import { rateLimit } from '../middleware/rateLimit';
import { JWT_SECRET as SECRET, JWT_REFRESH_SECRET as RSECRET } from '../utils/secrets';
import crypto from 'crypto';
const router = Router();

// Essais de mot de passe : 10 par quart d'heure par adresse e-mail et par IP ; liens envoyés par e-mail : 5 par heure
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: (req) => 'login:' + String(req.body?.email || '').toLowerCase() });
const mailLimit = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, key: () => 'mail' });
const tokenLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, key: () => 'token' });

/** Rôles qu'une invitation peut donner (admin / technical manager : seulement créés par un admin, dans Équipe). */
const INVITABLE_ROLES = ['project_manager', 'site_manager', 'engineer', 'worker', 'client', 'warehouse', 'sales_engineer', 'installer'];

function signAccess(user: any) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
    SECRET, { expiresIn: '8h' }
  );
}

// POST /api/v1/auth/login
router.post('/login', loginLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email et mot de passe requis', 400);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) throw new AppError('Identifiants invalides', 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError('Identifiants invalides', 401);

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    // ── Mot de passe temporaire (invitation) ? ──
    let mustChangePassword = false;
    try {
      const rows: any = await (prisma as any).$queryRaw`
        SELECT expires_at FROM invite_passwords WHERE user_id = ${user.id} LIMIT 1
      `;
      const inv = Array.isArray(rows) ? rows[0] : null;
      if (inv) {
        if (new Date(inv.expires_at) < new Date()) {
          await (prisma as any).$executeRaw`DELETE FROM invite_passwords WHERE user_id = ${user.id}`;
          throw new AppError('Mot de passe temporaire expiré. Demandez un nouvel envoi à un administrateur.', 401);
        }
        mustChangePassword = true;
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      // table absente / autre : login normal
    }

    const token    = signAccess(user);
    const refresh  = jwt.sign({ id: user.id }, RSECRET, { expiresIn: '30d' });

    await prisma.refreshToken.create({
      data: { userId: user.id, token: refresh, expiresAt: new Date(Date.now() + 30*24*60*60*1000) },
    });
    const plansAccess = await hasPlansAccess(user.id);

    res.json({
      success: true,
      data: {
        token, refreshToken: refresh,
        user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl, mustChangePassword, plansAccess },
      },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/refresh
router.post('/refresh', tokenLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken || typeof refreshToken !== 'string') throw new AppError('Refresh token manquant', 400);

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken }, include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date() || !stored.user.isActive) throw new AppError('Token expiré', 401);

    const token = signAccess(stored.user);
    res.json({ success: true, data: { token } });
  } catch (err) { next(err); }
});

// GET /api/v1/auth/me
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id:true, email:true, role:true, firstName:true, lastName:true, phone:true, avatarUrl:true },
    });
    if (!user) throw new AppError('Utilisateur introuvable', 404);
    res.json({ success: true, data: { ...user, plansAccess: await hasPlansAccess(user.id) } });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ── Ajouter ces imports en haut de auth.ts si pas déjà présents ──
// import crypto from 'crypto';
// import nodemailer from 'nodemailer';

// ── Ajouter cette table dans Railway Postgres ──
// CREATE TABLE IF NOT EXISTS password_reset_tokens (
//   id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
//   user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//   token TEXT NOT NULL UNIQUE,
//   expires_at TIMESTAMP NOT NULL,
//   used BOOLEAN DEFAULT FALSE,
//   created_at TIMESTAMP DEFAULT NOW()
// );

// ── Coller ce code dans src/routes/auth.ts avant export default router ──

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', mailLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) throw new AppError('Email requis', 400);

    // Always return success (don't reveal if email exists)
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user && user.isActive) {
      // Generate secure token
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store token (using raw query since no Prisma model yet)
      await (prisma as any).$executeRaw`
        INSERT INTO password_reset_tokens (id, user_id, token, expires_at)
        VALUES (gen_random_uuid()::text, ${user.id}, ${token}, ${expiresAt})
        ON CONFLICT DO NOTHING
      `;

      // Send email
      const appUrl = process.env.APP_URL || 'https://viewboxsitemanagement.up.railway.app';
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: `"VEM — ViewBox Event Manager" <${process.env.SMTP_USER}>`,
        to: user.email,
        subject: '🔑 Réinitialisation de votre mot de passe VEM',
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#1a1a2e;color:#f0f2f5;padding:32px;border-radius:12px;">
            <div style="font-size:24px;font-weight:800;color:#e63946;margin-bottom:6px;">VEM</div>
            <div style="font-size:11px;color:#8892a4;margin-bottom:24px;text-transform:uppercase;letter-spacing:1px;">ViewBox Event Manager</div>
            <h2 style="font-size:20px;margin-bottom:12px;">Réinitialisation du mot de passe</h2>
            <p style="color:#9ba3b2;line-height:1.6;">Bonjour ${user.firstName},</p>
            <p style="color:#9ba3b2;line-height:1.6;">Vous avez demandé une réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${resetUrl}" style="background:#e63946;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block;">
                🔑 Réinitialiser mon mot de passe
              </a>
            </div>
            <p style="color:#5a6275;font-size:12px;line-height:1.6;">Ce lien est valable <strong style="color:#9ba3b2;">15 minutes</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
            <hr style="border:none;border-top:1px solid #2a2f3a;margin:20px 0;">
            <p style="color:#5a6275;font-size:11px;text-align:center;">VEM — ViewBox Event Manager</p>
          </div>`,
      });
    }

    // Always return success
    res.json({ success: true, message: 'Si cet email existe, un lien a été envoyé.' });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', tokenLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;
    if (!token || !password || typeof token !== 'string' || typeof password !== 'string') throw new AppError('Token et mot de passe requis', 400);
    if (password.length < 8) throw new AppError('Mot de passe trop court (min 8 caractères)', 400);

    // Find token
    const result = await (prisma as any).$queryRaw`
      SELECT * FROM password_reset_tokens 
      WHERE token = ${token} AND used = FALSE AND expires_at > NOW()
      LIMIT 1
    `;
    const resetToken = Array.isArray(result) ? result[0] : null;
    if (!resetToken) throw new AppError('Lien invalide ou expiré', 400);

    // Hash new password
    const hash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: resetToken.user_id },
      data: { passwordHash: hash },
    });

    // Mark token as used
    await (prisma as any).$executeRaw`
      UPDATE password_reset_tokens SET used = TRUE WHERE token = ${token}
    `;

    // Invalidate all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { userId: resetToken.user_id } });

    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès.' });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/change-password — changement depuis le compte connecté
// Requiert l'ancien mot de passe pour vérifier l'identité.
router.post('/change-password', authMiddleware, loginLimit, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) throw new AppError('Ancien et nouveau mot de passe requis', 400);
    if (newPassword.length < 8) throw new AppError('Nouveau mot de passe trop court (min 8 caractères)', 400);
    if (currentPassword === newPassword) throw new AppError('Le nouveau mot de passe doit être différent', 400);

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new AppError('Utilisateur introuvable', 404);

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AppError('Ancien mot de passe incorrect', 401);

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    // Efface un éventuel mot de passe temporaire d'invitation
    try { await (prisma as any).$executeRaw`DELETE FROM invite_passwords WHERE user_id = ${user.id}`; } catch (_) {}

    // Révoque les autres sessions pour forcer une reconnexion ailleurs
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    res.json({ success: true, message: 'Mot de passe modifié avec succès' });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/invite — génère un lien d'inscription (admin / project_manager)
router.post('/invite', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!['admin','project_manager','technical_manager'].includes(req.user!.role)) throw new AppError('Permission insuffisante', 403);
    const { role, email, note } = req.body;
    if (role && !INVITABLE_ROLES.includes(role))
      throw new AppError('Ce rôle ne peut pas être donné par une invitation : crée le compte dans Équipe (admin).', 400);
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.invitationToken.create({
      data: {
        token,
        role: role || 'worker',
        email: email ? String(email).toLowerCase() : null,
        note: note || null,
        expiresAt,
        createdBy: req.user!.id,
      },
    });

    const appUrl = process.env.APP_URL || 'https://viewboxsitemanagement.up.railway.app';
    const inviteUrl = `${appUrl}/?invite=${token}${role ? `&role=${role}` : ''}`;
    res.json({ success: true, data: { inviteUrl, token, expiresAt } });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/register — création de compte via lien d'invitation
router.post('/register', tokenLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firstName, lastName, email, password, role, inviteToken } = req.body;
    if (!firstName || !lastName || !email || !password) throw new AppError('Champs obligatoires manquants', 400);
    if (password.length < 8) throw new AppError('Mot de passe trop court (min 8 caractères)', 400);
    if (!inviteToken) throw new AppError('Lien d\'invitation manquant', 400);

    const invite = await prisma.invitationToken.findUnique({ where: { token: inviteToken } });
    if (!invite) throw new AppError('Invitation invalide', 400);
    if (invite.usedAt) throw new AppError('Cette invitation a déjà été utilisée', 400);
    if (invite.expiresAt < new Date()) throw new AppError('Invitation expirée', 400);
    if (invite.email && invite.email.toLowerCase() !== String(email).toLowerCase()) {
      throw new AppError('Cette invitation est réservée à une autre adresse email', 400);
    }

    const existing = await prisma.user.findUnique({ where: { email: String(email).toLowerCase() } });
    if (existing) throw new AppError('Un compte existe déjà avec cet email', 400);

    const passwordHash = await bcrypt.hash(password, 12);
    // le rôle vient UNIQUEMENT de l'invitation (avant : le formulaire pouvait demander « admin »)
    const finalRole = INVITABLE_ROLES.includes(invite.role) ? invite.role : 'worker';
    void role;

    const user = await prisma.user.create({
      data: {
        firstName, lastName,
        email: String(email).toLowerCase(),
        passwordHash,
        role: finalRole as any,
      },
    });

    await prisma.invitationToken.update({ where: { id: invite.id }, data: { usedAt: new Date() } });

    const token   = signAccess(user);
    const refresh = jwt.sign({ id: user.id }, RSECRET, { expiresIn: '30d' });
    await prisma.refreshToken.create({
      data: { userId: user.id, token: refresh, expiresAt: new Date(Date.now() + 30*24*60*60*1000) },
    });

    res.status(201).json({
      success: true,
      data: {
        token, refreshToken: refresh,
        user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl },
      },
    });
  } catch (err) { next(err); }
});

export default router;
