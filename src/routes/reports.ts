// src/routes/reports.ts — Direct PDF download endpoints
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { generateHandoverPdf } from '../services/pdfService';
import { buildDailyReportPdf } from '../services/dailyAttachments';
import { logger } from '../utils/logger';
import { saveProjectFilePdf } from '../utils/saveProjectFile';

const router = Router();

// GET /reports/daily/:id — download daily report PDF
router.get('/daily/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const lang: 'fr' | 'en' = (req.query.lang === 'en') ? 'en' : 'fr';
    // PDF complet : rapport + check-lists jointes + pages des fichiers joints
    const built = await buildDailyReportPdf(req.params.id, lang);
    if (!built) throw new AppError('Rapport introuvable', 404);
    const r = built.report;
    const pdf = built.buffer;
    logger.info(`[pdf-daily] Génération pour ${r.id} — ${r.entries.length} entrées, ${r.photos.length} photos`);

    // Archivage best-effort dans les fichiers du projet — ne bloque pas le téléchargement.
    saveProjectFilePdf(r.projectId, pdf, `DailyReport_${r.project.internalNumber}_${new Date(r.reportDate).toISOString().slice(0,10)}.pdf`, 'daily_report', req.user?.id);

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
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            photos:     true,
            itemPhotos: true,  // anciens uploads via /upload/handover-photo
          },
        },
      },
    });
    if (!h) throw new AppError('Handover introuvable', 404);

    // On fusionne les deux sources de photos par item (legacy + nouvelle)
    const items = h.items.map((it: any) => ({
      zoneName: it.zoneName,
      status:   it.status,
      comment:  it.comment,
      photos:   [
        ...(it.photos || []).map((p: any) => ({ photoUrl: p.photoUrl })),
        ...(it.itemPhotos || []).map((p: any) => ({ photoUrl: p.photoUrl })),
      ],
    }));

    const pdf = await generateHandoverPdf({
      project: { name: h.project.name, internalNumber: h.project.internalNumber, address: h.project.address },
      clientName: h.clientName || h.project.client.name,
      siteManagerName: h.siteManager ? `${h.siteManager.firstName} ${h.siteManager.lastName}` : 'N/A',
      items,
      generalNotes: h.generalNotes,
      date: h.createdAt,
    });

    saveProjectFilePdf(h.projectId, pdf, `Handover_${h.project.internalNumber}.pdf`, 'handover', req.user?.id);

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="Handover_${h.project.internalNumber}.pdf"` });
    res.send(pdf);
  } catch (err) { next(err); }
});

export default router;