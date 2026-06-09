// src/routes/clientVisits.ts
// Routes pour gérer les "visites client" — un rapport de visite contenant
// plusieurs points (ClientRemark). Chaque point peut avoir ses photos.

import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { generateVisitReportPdf } from '../services/pdfService';
import { sendMail } from '../services/emailService';

const router = Router();

// Pas de cache : ces données changent à chaque ajout de point
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
});

// GET /client-visits?projectId=... → liste des visites d'un projet
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const where: any = {};
    if (req.query.projectId) where.projectId = String(req.query.projectId);

    const visits = await prisma.clientVisit.findMany({
      where,
      orderBy: { visitDate: 'desc' },
      include: {
        client: { select: { id:true, name:true } },
        _count: { select: { remarks: true } },
      },
    });
    res.json({ success: true, data: visits });
  } catch (err) { next(err); }
});

// GET /client-visits/:id → détail d'une visite avec tous ses points et photos
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const v = await prisma.clientVisit.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        project: { select: { id:true, name:true, internalNumber:true } },
        remarks: {
          orderBy: { createdAt: 'asc' },
          include: {
            photos: true,
            assignedToUser: { select: { id:true, firstName:true, lastName:true } },
          },
        },
      },
    });
    if (!v) throw new AppError('Visite introuvable', 404);
    res.json({ success: true, data: v });
  } catch (err) { next(err); }
});

// POST /client-visits → créer une nouvelle visite (vide)
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, clientId, title, visitDate, notes } = req.body;
    if (!projectId || !title) throw new AppError('projectId et title requis', 400);

    const v = await prisma.clientVisit.create({
      data: {
        projectId,
        clientId:    clientId || null,
        title,
        visitDate:   visitDate ? new Date(visitDate) : new Date(),
        notes:       notes || null,
        createdById: req.user!.id,
      },
      include: {
        client: { select: { id:true, name:true } },
        _count: { select: { remarks: true } },
      },
    });
    res.status(201).json({ success: true, data: v });
  } catch (err) { next(err); }
});

// PATCH /client-visits/:id → modifier la visite (titre, client, notes, date)
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const data: any = {};
    ['title', 'clientId', 'notes'].forEach(k => {
      if (req.body[k] !== undefined) data[k] = req.body[k];
    });
    if (req.body.visitDate) data.visitDate = new Date(req.body.visitDate);
    if (data.clientId === '') data.clientId = null;

    const v = await prisma.clientVisit.update({
      where: { id: req.params.id },
      data,
      include: {
        client: { select: { id:true, name:true } },
        _count: { select: { remarks: true } },
      },
    });
    res.json({ success: true, data: v });
  } catch (err) { next(err); }
});

// DELETE /client-visits/:id → supprimer la visite (cascade → ses points)
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.clientVisit.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /client-visits/:id/pdf — télécharger le rapport PDF
router.get('/:id/pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const v = await prisma.clientVisit.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        project: { select: { name: true, internalNumber: true } },
        remarks: {
          orderBy: { createdAt: 'asc' },
          include: {
            photos: true,
            assignedToUser: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!v) throw new AppError('Visite introuvable', 404);

    const pdf = await generateVisitReportPdf({
      project: { name: v.project.name, internalNumber: v.project.internalNumber },
      visit:   { id: v.id, title: v.title, visitDate: v.visitDate, notes: v.notes, client: v.client },
      points:  v.remarks.map((r: any) => ({
        title: r.title,
        description: r.description,
        zone: r.zone,
        status: r.status,
        priority: r.priority,
        assignedToUser: r.assignedToUser,
        photos: r.photos || [],
      })),
    });

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Visite_${v.project.internalNumber}_${v.id.slice(0,8)}.pdf"`,
    });
    res.send(pdf);
  } catch (err) { next(err); }
});

// POST /client-visits/:id/send — envoie le PDF par email
// Body : { recipients?: string[] } — sinon utilise l'email du client de la visite
router.post('/:id/send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const v = await prisma.clientVisit.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        project: { select: { name: true, internalNumber: true } },
        remarks: {
          orderBy: { createdAt: 'asc' },
          include: {
            photos: true,
            assignedToUser: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!v) throw new AppError('Visite introuvable', 404);

    const pdf = await generateVisitReportPdf({
      project: { name: v.project.name, internalNumber: v.project.internalNumber },
      visit:   { id: v.id, title: v.title, visitDate: v.visitDate, notes: v.notes, client: v.client },
      points:  v.remarks.map((r: any) => ({
        title: r.title,
        description: r.description,
        zone: r.zone,
        status: r.status,
        priority: r.priority,
        assignedToUser: r.assignedToUser,
        photos: r.photos || [],
      })),
    });

    const recipients = new Set<string>();
    const customList: string[] = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    if (customList.length > 0) {
      customList
        .map((e: string) => String(e).trim().toLowerCase())
        .filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        .forEach((e: string) => recipients.add(e));
    } else if (v.client?.email) {
      recipients.add(v.client.email);
    }
    if (recipients.size === 0) throw new AppError('Aucun destinataire valide (client sans email et aucun email manuel)', 400);

    await sendMail({
      to: Array.from(recipients),
      subject: `[VEM] Rapport de visite — ${v.project.name} (${v.project.internalNumber})`,
      html: `<p>Bonjour,</p>
<p>Veuillez trouver ci-joint le rapport de la visite <strong>${v.title}</strong> du ${new Date(v.visitDate).toLocaleDateString('fr-FR')}.</p>
<p>Projet : <strong>${v.project.name}</strong> (réf. ${v.project.internalNumber})</p>
<p>${v.remarks.length} point(s) inspecté(s).</p>
<p>Cordialement,<br>L'équipe VIEWBOX</p>`,
      attachments: [{
        filename: `Visite_${v.project.internalNumber}_${v.id.slice(0,8)}.pdf`,
        content:  pdf,
        contentType: 'application/pdf',
      }],
    });

    res.json({ success: true, data: { sentTo: recipients.size, recipients: Array.from(recipients) } });
  } catch (err) { next(err); }
});

export default router;