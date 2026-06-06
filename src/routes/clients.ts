// src/routes/clients.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

// GET /clients — liste de tous les clients (avec nombre de projets associés)
router.get('/', async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { projects: true } } },
    });
    res.json({ success: true, data: clients });
  } catch (err) { next(err); }
});

// GET /clients/:id — détail d'un client avec ses projets
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        projects: {
          select: { id: true, name: true, internalNumber: true, status: true, installationStart: true },
          orderBy: { installationStart: 'desc' },
        },
      },
    });
    if (!client) throw new AppError('Client introuvable', 404);
    res.json({ success: true, data: client });
  } catch (err) { next(err); }
});

// POST /clients — créer un nouveau client
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, contactName, email, phone, address } = req.body;
    if (!name || !name.trim()) throw new AppError('Le nom du client est obligatoire', 400);

    const client = await prisma.client.create({
      data: {
        name: name.trim(),
        contactName: contactName || null,
        email:       email || null,
        phone:       phone || null,
        address:     address || null,
      },
    });
    res.status(201).json({ success: true, data: client });
  } catch (err) { next(err); }
});

// PATCH /clients/:id — modifier un client
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data: any = {};
    ['name', 'contactName', 'email', 'phone', 'address'].forEach(k => {
      if (req.body[k] !== undefined) data[k] = req.body[k] || null;
    });
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data,
    });
    res.json({ success: true, data: client });
  } catch (err) { next(err); }
});

// DELETE /clients/:id — supprimer un client (refuse si projets associés)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const count = await prisma.project.count({ where: { clientId: req.params.id } });
    if (count > 0) {
      throw new AppError(
        `Impossible de supprimer : ${count} projet(s) associé(s) à ce client`,
        400
      );
    }
    await prisma.client.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
