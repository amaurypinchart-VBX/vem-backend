// src/routes/auth.ts
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { authMiddleware, AuthRequest } from '../middleware/auth';

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

export default router;
