// src/routes/users.ts
import { Router, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';

const router = Router();

// Champs modifiables d'une fiche (liste blanche)
const EDITABLE_FIELDS = [
  'firstName', 'lastName', 'email', 'phone', 'role', 'avatarUrl',
  'birthDate', 'birthPlace', 'nationality', 'idNumber', 'nationalNumber',
  'idExpiry', 'teamGroupId', 'isActive',
] as const;

// Champs renvoyés (jamais le passwordHash)
const USER_SELECT = {
  id: true, email: true, firstName: true, lastName: true, phone: true,
  role: true, avatarUrl: true, birthDate: true, birthPlace: true,
  nationality: true, idNumber: true, nationalNumber: true, idExpiry: true,
  teamGroupId: true, isActive: true, lastLogin: true,
};

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: USER_SELECT,
      orderBy: { lastName: 'asc' },
    });
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!['admin','project_manager'].includes(req.user!.role)) throw new AppError('Permission insuffisante', 403);
    const password = req.body.password || 'VEM2025!';
    const passwordHash = await bcrypt.hash(password, 12);

    // Liste blanche : on n'insère que les champs autorisés
    const data: any = { passwordHash };
    for (const key of EDITABLE_FIELDS) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    if (typeof data.email === 'string') data.email = data.email.toLowerCase();

    // Log diagnostic : on log les champs envoyés (sans le passwordHash)
    const { passwordHash: _ph, ...safe } = data;
    logger.info(`[create-user] champs envoyés : ${JSON.stringify(safe)}`);

    try {
      const user = await prisma.user.create({
        data,
        select: USER_SELECT,
      });
      res.status(201).json({ success: true, data: { user, tempPassword: password } });
    } catch (createErr: any) {
      // Log explicite de la cause Prisma pour faciliter le diagnostic
      logger.error(`[create-user] échec Prisma : code=${createErr.code || '?'} | meta=${JSON.stringify(createErr.meta || {})} | msg=${createErr.message?.slice(0, 300)}`);
      throw createErr;
    }
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.id !== req.params.id && !['admin','project_manager'].includes(req.user!.role)) throw new AppError('Permission insuffisante', 403);

    // On ne garde que les champs autorisés réellement présents dans le corps
    const data: any = {};
    for (const key of EDITABLE_FIELDS) {
      if (req.body[key] !== undefined) data[key] = req.body[key];
    }
    if (typeof data.email === 'string') data.email = data.email.toLowerCase();
    if (req.body.password) data.passwordHash = await bcrypt.hash(req.body.password, 12);

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      select: USER_SELECT,
    });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

export default router;
