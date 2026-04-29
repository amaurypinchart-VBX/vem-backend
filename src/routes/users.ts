// src/routes/users.ts
import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: { id:true, email:true, firstName:true, lastName:true, role:true, phone:true, avatarUrl:true, lastLogin:true },
      orderBy: { lastName: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!['admin','project_manager'].includes(req.user!.role)) throw new AppError('Permission insuffisante', 403);
    const { password = 'VEM2025!', ...data } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { ...data, email: data.email.toLowerCase(), passwordHash },
      select: { id:true, email:true, firstName:true, lastName:true, role:true },
    });
    res.status(201).json({ success: true, data: { user, tempPassword: password } });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.id !== req.params.id && !['admin','project_manager'].includes(req.user!.role)) throw new AppError('Permission insuffisante', 403);
    const { password, ...data } = req.body;
    if (password) (data as any).passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: { id:true, email:true, firstName:true, lastName:true, role:true, phone:true },
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

export default router;
