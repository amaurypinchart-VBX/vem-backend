// src/routes/auth.ts
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
const router = Router();
const SECRET  = process.env.JWT_SECRET  || 'vem-secret-change-me';
const RSECRET = process.env.JWT_REFRESH_SECRET || 'vem-refresh-change-me';

function signAccess(user: any) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
    SECRET, { expiresIn: '8h' }
  );
}

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) throw new AppError('Email et mot de passe requis', 400);

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user || !user.isActive) throw new AppError('Identifiants invalides', 401);

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new AppError('Identifiants invalides', 401);

    await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

    const token    = signAccess(user);
    const refresh  = jwt.sign({ id: user.id }, RSECRET, { expiresIn: '30d' });

    await prisma.refreshToken.create({
      data: { userId: user.id, token: refresh, expiresAt: new Date(Date.now() + 30*24*60*60*1000) },
    });

    res.json({
      success: true,
      data: {
        token, refreshToken: refresh,
        user: { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName, avatarUrl: user.avatarUrl },
      },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AppError('Refresh token manquant', 400);

    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken }, include: { user: true },
    });
    if (!stored || stored.expiresAt < new Date()) throw new AppError('Token expiré', 401);

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
    res.json({ success: true, data: user });
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
router.post('/forgot-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email) throw new AppError('Email requis', 400);

    // Always return success (don't reveal if email exists)
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    if (user && user.isActive) {
      // Generate secure token
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours

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
            <p style="color:#5a6275;font-size:12px;line-height:1.6;">Ce lien est valable <strong style="color:#9ba3b2;">2 heures</strong>. Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.</p>
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
router.post('/reset-password', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) throw new AppError('Token et mot de passe requis', 400);
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
router.post('/change-password', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    // Révoque les autres sessions pour forcer une reconnexion ailleurs
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    res.json({ success: true, message: 'Mot de passe modifié avec succès' });
  } catch (err) { next(err); }
});

export default router;
