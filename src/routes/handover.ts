// src/routes/handover.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';

const router = Router();

// GET /handover — liste tous les handovers (filtrés par projet si ?projectId=)
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const handovers = await prisma.handover.findMany({
      where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
      include: {
        project: { select: { name: true, internalNumber: true } },
        siteManager: { select: { firstName: true, lastName: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: handovers });
  } catch (err) { next(err); }
});

// GET /handover/:id — détail complet
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const h = await prisma.handover.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          include: {
            client: true,
            technicalManager: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
            team: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } } } },
          },
        },
        siteManager: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        items: {
          orderBy: { sortOrder: 'asc' },
          include: { photos: true, itemPhotos: true },
        },
        photos: true,
      },
    });
    if (!h) throw new AppError('Handover introuvable', 404);
    res.json({ success: true, data: h });
  } catch (err) { next(err); }
});

// POST /handover — créer un nouveau handover
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    // Extraire et ignorer les champs inconnus par Prisma
    const {
      items,
      responsible,
      customFields,
      handoverDate,
      ...handoverData
    } = req.body;

    const h = await prisma.handover.create({
      data: {
        ...handoverData,
        createdById: req.user!.id,
        items: items?.length
          ? {
              create: items.map((item: any, i: number) => ({
                zoneName: item.zoneName || 'Zone ' + (i + 1),
                status:   item.status   || 'ok',
                comment:  item.comment  || null,
                sortOrder: i,
              })),
            }
          : {
              create: [{ zoneName: 'Inspection générale', status: 'ok', sortOrder: 0 }],
            },
      },
      include: {
        items: true,
        siteManager: { select: { firstName: true, lastName: true } },
      },
    });

    res.status(201).json({ success: true, data: h });
  } catch (err) { next(err); }
});

// PATCH /handover/:id — modifier un handover
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      items,
      responsible,
      customFields,
      project,
      createdBy,
      siteManagerUser,
      ...data
    } = req.body;

    const h = await prisma.handover.update({
      where: { id: req.params.id },
      data,
    });

    // Mettre à jour les items si fournis
    if (items?.length) {
      for (const item of items) {
        if (item.id) {
          await prisma.handoverItem.update({
            where: { id: item.id },
            data: {
              zoneName: item.zoneName,
              status:   item.status,
              comment:  item.comment || null,
            },
          });
        }
      }
    }

    res.json({ success: true, data: h });
  } catch (err) { next(err); }
});

// DELETE /handover/:id
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.handover.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /handover/:id/sign — signer (client ou manager)
router.post('/:id/sign', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type, signatureBase64 } = req.body;
    const updateData: any = {};

    if (type === 'manager') {
      updateData.managerSignatureUrl = signatureBase64;
      updateData.managerSignedAt     = new Date();
    } else if (type === 'client') {
      updateData.clientSignatureUrl = signatureBase64;
      updateData.clientSignedAt     = new Date();
    } else {
      throw new AppError('Type de signature invalide (manager ou client)', 400);
    }

    const h = await prisma.handover.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // Si les deux ont signé → passer en signed
    if (h.managerSignedAt && h.clientSignedAt) {
      await prisma.handover.update({
        where: { id: req.params.id },
        data: { status: 'signed' },
      });
    }

    res.json({ success: true, data: h });
  } catch (err) { next(err); }
});

// POST /handover/:id/items/:itemId/photo — ajouter une photo sur un item
router.post('/:id/items/:itemId/photo', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { photoUrl, publicId } = req.body;
    if (!photoUrl) throw new AppError('photoUrl requis', 400);

    const photo = await prisma.handoverItemPhoto.create({
      data: {
        itemId:   req.params.itemId,
        photoUrl,
        publicId: publicId || null,
      },
    });
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

// PATCH /handover/:id/items/:itemId — modifier le statut d'un item
router.patch('/:id/items/:itemId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { status, comment } = req.body;
    const item = await prisma.handoverItem.update({
      where: { id: req.params.itemId },
      data: { status, comment },
    });
    res.json({ success: true, data: item });
  } catch (err) { next(err); }
});

export default router;
