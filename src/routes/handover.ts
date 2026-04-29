// src/routes/handover.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { generateHandoverPdf } from '../services/pdfService';
import { sendHandoverPdf } from '../services/emailService';
import { uploadToCloudinary } from '../services/cloudinaryService';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const handovers = await prisma.handover.findMany({
      where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
      include: { project: { select: { name:true, internalNumber:true } }, siteManager: { select: { firstName:true, lastName:true } }, items: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: handovers });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const h = await prisma.handover.findUnique({
      where: { id: req.params.id },
      include: {
        project: { include: { client: true, technicalManager: { select: { email:true } }, team: { include: { user: { select: { email:true } } } } } },
        siteManager: { select: { id:true, firstName:true, lastName:true, email:true } },
        items: { orderBy: { sortOrder: 'asc' }, include: { photos: true } },
        photos: true,
      },
    });
    if (!h) throw new AppError('Handover introuvable', 404);
    res.json({ success: true, data: h });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { items = [], ...data } = req.body;
    const h = await prisma.handover.create({
      data: {
        ...data, createdById: req.user!.id,
        items: { create: items.map((item: any, i: number) => ({ ...item, sortOrder: i })) },
      },
      include: { items: true },
    });
    res.status(201).json({ success: true, data: h });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { items, ...data } = req.body;
    const h = await prisma.handover.update({ where: { id: req.params.id }, data });
    if (items) {
      for (const item of items) {
        if (item.id) await prisma.handoverItem.update({ where: { id: item.id }, data: { status: item.status, comment: item.comment } });
      }
    }
    res.json({ success: true, data: h });
  } catch (err) { next(err); }
});

// POST /handover/:id/sign
router.post('/:id/sign', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type, signatureBase64 } = req.body;
    const updateData: any = {};
    if (type === 'manager') { updateData.managerSignatureUrl = signatureBase64; updateData.managerSignedAt = new Date(); }
    else if (type === 'client') { updateData.clientSignatureUrl = signatureBase64; updateData.clientSignedAt = new Date(); }
    const h = await prisma.handover.update({ where: { id: req.params.id }, data: updateData });
    if (h.managerSignedAt && h.clientSignedAt) await prisma.handover.update({ where: { id: req.params.id }, data: { status: 'signed' } });
    res.json({ success: true, data: h });
  } catch (err) { next(err); }
});

// POST /handover/:id/generate-pdf — generate PDF + send email
router.post('/:id/generate-pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const h = await prisma.handover.findUnique({
      where: { id: req.params.id },
      include: {
        project: { include: { client: true, technicalManager: true, team: { include: { user: true } } } },
        siteManager: true,
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!h) throw new AppError('Handover introuvable', 404);

    const pdfBuffer = await generateHandoverPdf({
      project: { name: h.project.name, internalNumber: h.project.internalNumber, address: h.project.address },
      clientName: h.clientName || h.project.client.name,
      siteManagerName: h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A',
      items: h.items,
      generalNotes: h.generalNotes,
      date: h.createdAt,
    });

    // Upload PDF to Cloudinary
    let pdfUrl = '';
    try {
      const up = await uploadToCloudinary(pdfBuffer, 'handovers', { resource_type: 'raw', format: 'pdf' });
      pdfUrl = up.url;
      await prisma.handover.update({ where: { id: h.id }, data: { pdfUrl } });
    } catch { /* continue even if upload fails */ }

    // Collect recipients
    const recipients = new Set<string>();
    if (h.clientEmail) recipients.add(h.clientEmail);
    if (h.project.client.email) recipients.add(h.project.client.email);
    if (h.project.technicalManager?.email) recipients.add(h.project.technicalManager.email);
    h.project.team.forEach((t: any) => { if (t.user.email) recipients.add(t.user.email); });
    if (h.siteManager?.email) recipients.add(h.siteManager.email);

    if (recipients.size > 0) {
      await sendHandoverPdf({ to: Array.from(recipients), projectName: h.project.name, pdfBuffer });
    }

    // Stream PDF to client
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Handover_${h.project.internalNumber}.pdf"` });
    res.send(pdfBuffer);
  } catch (err) { next(err); }
});

export default router;
