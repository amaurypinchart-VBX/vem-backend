// src/routes/reports.ts — Direct PDF download endpoints
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { generateDailyReportPdf, generateHandoverPdf } from '../services/pdfService';

const router = Router();

// GET /reports/daily/:id — download daily report PDF
router.get('/daily/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const r = await prisma.dailyReport.findUnique({
      where: { id: req.params.id },
      include: { entries: true, checklist: true, createdBy: { select: { firstName:true, lastName:true } }, project: { select: { name:true, internalNumber:true } } },
    });
    if (!r) throw new AppError('Rapport introuvable', 404);

    const pdf = await generateDailyReportPdf({
      project: r.project,
      reportDate: r.reportDate,
      createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : undefined,
      weather: r.weather,
      workersPresent: r.workersPresent,
      generalNotes: r.generalNotes,
      entries: r.entries,
      checklist: r.checklist,
    });

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="DailyReport_${r.project.internalNumber}_${new Date(r.reportDate).toISOString().slice(0,10)}.pdf"` });
    res.send(pdf);
  } catch (err) { next(err); }
});

// GET /reports/handover/:id — download handover PDF
router.get('/handover/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const h = await prisma.handover.findUnique({
      where: { id: req.params.id },
      include: {
        project: { include: { client: true } },
        siteManager: { select: { firstName:true, lastName:true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!h) throw new AppError('Handover introuvable', 404);

    const pdf = await generateHandoverPdf({
      project: { name: h.project.name, internalNumber: h.project.internalNumber, address: h.project.address },
      clientName: h.clientName || h.project.client.name,
      siteManagerName: h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A',
      items: h.items,
      generalNotes: h.generalNotes,
      date: h.createdAt,
    });

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Handover_${h.project.internalNumber}.pdf"` });
    res.send(pdf);
  } catch (err) { next(err); }
});

export default router;
