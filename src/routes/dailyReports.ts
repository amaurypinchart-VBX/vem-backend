// src/routes/dailyReports.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { generateDailyReportPdf } from '../services/pdfService';
import { sendDailyReport } from '../services/emailService';

const router = Router();

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const reports = await prisma.dailyReport.findMany({
      where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
      orderBy: { reportDate: 'desc' },
      include: { createdBy: { select: { firstName:true, lastName:true } }, _count: { select: { entries:true, photos:true } } },
    });
    res.json({ success: true, data: reports });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const r = await prisma.dailyReport.findUnique({
      where: { id: req.params.id },
      include: { entries: { orderBy: { entryTime: 'asc' } }, checklist: true, photos: true, createdBy: { select: { firstName:true, lastName:true } }, project: { select: { name:true, internalNumber:true } } },
    });
    if (!r) throw new AppError('Rapport introuvable', 404);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entries = [], checklist = [], ...data } = req.body;
    const reportDate = new Date(data.reportDate);

    // Existe-t-il déjà un rapport pour ce projet à cette date ?
    const existing = await prisma.dailyReport.findFirst({
      where: { projectId: data.projectId, reportDate },
    });

    if (existing) {
      // Remplace les entrées et la checklist, met à jour les champs principaux
      await prisma.dailyReportEntry.deleteMany({ where: { reportId: existing.id } });
      await prisma.dailyReportChecklistItem.deleteMany({ where: { reportId: existing.id } });
      const updated = await prisma.dailyReport.update({
        where: { id: existing.id },
        data: {
          weather:        data.weather,
          workersPresent: data.workersPresent,
          generalNotes:   data.generalNotes,
          entries:   entries.length   ? { create: entries }   : undefined,
          checklist: checklist.length ? { create: checklist } : undefined,
        },
        include: { entries: true, checklist: true, photos: true },
      });
      return res.json({ success: true, data: updated });
    }

    // Pas de rapport existant : on en crée un
    const report = await prisma.dailyReport.create({
      data: {
        ...data, createdById: req.user!.id,
        reportDate,
        entries:   { create: entries },
        checklist: { create: checklist },
      },
      include: { entries: true, checklist: true },
    });
    res.status(201).json({ success: true, data: report });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entries, checklist, ...scalars } = req.body;
    const id = req.params.id;

    // Si on reçoit des entries ou une checklist, on les remplace (delete + create)
    if (Array.isArray(entries)) {
      await prisma.dailyReportEntry.deleteMany({ where: { reportId: id } });
    }
    if (Array.isArray(checklist)) {
      await prisma.dailyReportChecklistItem.deleteMany({ where: { reportId: id } });
    }

    const data: any = { ...scalars };
    if (scalars.reportDate) data.reportDate = new Date(scalars.reportDate);
    if (Array.isArray(entries)   && entries.length)   data.entries   = { create: entries };
    if (Array.isArray(checklist) && checklist.length) data.checklist = { create: checklist };

    const report = await prisma.dailyReport.update({
      where: { id },
      data,
      include: { entries: true, checklist: true, photos: true },
    });
    res.json({ success: true, data: report });
  } catch (err) { next(err); }
});

// POST /daily-reports/:id/photos — attacher une photo déjà uploadée (par URL)
router.post('/:id/photos', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { photoUrl, publicId, caption } = req.body;
    if (!photoUrl) return res.status(400).json({ success: false, error: 'photoUrl requis' });
    const photo = await prisma.dailyReportPhoto.create({
      data: { reportId: req.params.id, photoUrl, publicId: publicId || null, caption: caption || null },
    });
    res.status(201).json({ success: true, data: photo });
  } catch (err) { next(err); }
});

// DELETE /daily-reports/:id/photos/:photoId
router.delete('/:id/photos/:photoId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.dailyReportPhoto.delete({ where: { id: req.params.photoId } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /daily-reports/:id — supprimer un rapport
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await prisma.dailyReport.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /daily-reports/:id/send — generate PDF + email
router.post('/:id/send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const r = await prisma.dailyReport.findUnique({
      where: { id: req.params.id },
      include: {
        project: { include: { client: { select: { email:true } }, technicalManager: { select: { email:true } }, team: { include: { user: { select: { email:true } } } } } },
        entries: { orderBy: { entryTime: 'asc' } },
        checklist: true, photos: true,
        createdBy: { select: { firstName:true, lastName:true } },
      },
    });
    if (!r) throw new AppError('Rapport introuvable', 404);

    const pdfBuffer = await generateDailyReportPdf({
      project: { name: r.project.name, internalNumber: r.project.internalNumber },
      reportDate: r.reportDate,
      createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : undefined,
      weather: r.weather,
      workersPresent: r.workersPresent,
      generalNotes: r.generalNotes,
      entries: r.entries,
      checklist: r.checklist,
      photos: r.photos,
    });

    const recipients = new Set<string>();
    if (r.project.client?.email) recipients.add(r.project.client.email);
    if (r.project.technicalManager?.email) recipients.add(r.project.technicalManager.email);
    r.project.team.forEach((t: any) => { if (t.user.email) recipients.add(t.user.email); });

    await sendDailyReport({
      to: Array.from(recipients),
      projectName: r.project.name,
      date: new Date(r.reportDate).toLocaleDateString('fr-FR'),
      notes: r.generalNotes || undefined,
      entries: r.entries,
      pdfBuffer,
    });

    await prisma.dailyReport.update({ where: { id: r.id }, data: { sentAt: new Date() } });
    res.json({ success: true, data: { sentTo: recipients.size } });
  } catch (err) { next(err); }
});

export default router;
