// src/routes/warehouse.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

router.get('/boxes', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const boxes = await prisma.warehouseBox.findMany({
      where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
      include: { preparedBy: { select: { firstName:true, lastName:true } }, _count: { select: { items:true, photos:true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: boxes });
  } catch (err) { next(err); }
});

router.get('/boxes/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const box = await prisma.warehouseBox.findUnique({
      where: { id: req.params.id },
      include: { items: { orderBy: { sortOrder: 'asc' } }, photos: true, preparedBy: { select: { firstName:true, lastName:true } } },
    });
    if (!box) throw new AppError('Box introuvable', 404);
    res.json({ success: true, data: box });
  } catch (err) { next(err); }
});

router.post('/boxes', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { items = [], ...data } = req.body;
    const qrCode = `BOX-${Date.now()}-${data.projectId?.slice(0,8).toUpperCase()}`;
    const box = await prisma.warehouseBox.create({
      data: { ...data, qrCode, preparedById: req.user!.id, items: { create: items.map((i: any, idx: number) => ({ ...i, sortOrder: idx })) } },
      include: { items: true },
    });
    res.status(201).json({ success: true, data: box });
  } catch (err) { next(err); }
});

router.patch('/boxes/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const box = await prisma.warehouseBox.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: box });
  } catch (err) { next(err); }
});

router.post('/boxes/:id/items', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const item = await prisma.boxItem.create({ data: { boxId: req.params.id, ...req.body } });
    res.status(201).json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.patch('/items/:itemId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const item = await prisma.boxItem.update({ where: { id: req.params.itemId }, data: req.body });
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

router.delete('/items/:itemId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.boxItem.delete({ where: { id: req.params.itemId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/scan/:qrCode', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const box = await prisma.warehouseBox.findUnique({ where: { qrCode: req.params.qrCode }, include: { items: true, project: { select: { name:true, internalNumber:true } } } });
    if (!box) throw new AppError('QR Code non reconnu', 404);
    res.json({ success: true, data: box });
  } catch (err) { next(err); }
});

export default router;
