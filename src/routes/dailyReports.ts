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
    const report = await prisma.dailyReport.create({
      data: {
        ...data, createdById: req.user!.id,
        reportDate: new Date(data.reportDate),
        entries: { create: entries },
        checklist: { create: checklist },
      },
      include: { entries: true, checklist: true },
    });
    res.status(201).json({ success: true, data: report });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const report = await prisma.dailyReport.update({ where: { id: req.params.id }, data: req.body });
    res.json({ success: true, data: report });
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
