// src/routes/dailyReports.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { generateDailyReportPdf } from '../services/pdfService';
import { sendDailyReport } from '../services/emailService';

const router = Router();

// Désactive le cache HTTP sur tout ce module : les daily reports changent à
// chaque sauvegarde et il faut que les listes/détails affichent la version la
// plus récente. Sans ça, le navigateur tient à sa version cachée (304) et l'UI
// semble "ne pas se rafraîchir" malgré la sauvegarde réussie côté serveur.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const reports = await prisma.dailyReport.findMany({
      where: req.query.projectId ? { projectId: String(req.query.projectId) } : {},
      orderBy: { reportDate: 'desc' },
      include: {
        createdBy: { select: { firstName:true, lastName:true } },
        _count: { select: { entries:true, photos:true } },
        // Aperçu : on remonte les 3 premières entrées pour que la carte montre
        // un extrait concret au lieu d'un simple compteur. Ça rend toute modif visible.
        entries: { take: 3, orderBy: { entryTime: 'asc' } },
      },
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

    // Le métier autorise plusieurs rapports par projet pour la même date
    // (ex: rapport matin + rapport soir, ou différents équipiers). On crée
    // donc systématiquement un nouveau rapport. Pour modifier un rapport
    // existant, le front utilise PATCH /:id depuis la carte de la liste.
    const report = await prisma.dailyReport.create({
      data: {
        ...data,
        createdById: req.user!.id,
        reportDate,
        entries:   { create: entries },
        checklist: { create: checklist },
      },
      include: { entries: true, checklist: true, photos: true },
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

// PATCH /daily-reports/:id/photos/:photoId — modifier la légende
router.patch('/:id/photos/:photoId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const photo = await prisma.dailyReportPhoto.update({
      where: { id: req.params.photoId },
      data: { caption: req.body.caption ?? null },
    });
    res.json({ success: true, data: photo });
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
// Body optionnel : { recipients?: string[] }
// Si recipients est fourni : envoie à cette liste précise.
// Sinon : fallback à l'envoi automatique (client + manager technique + équipe).
router.post('/:id/send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const r = await prisma.dailyReport.findUnique({
      where: { id: req.params.id },
      include: {
        project: {
          include: {
            // On garde l'email du client pour le destinataire mais on récupère
            // aussi nom, contact, phone, address pour les afficher dans le PDF
            client: { select: { name:true, contactName:true, email:true, phone:true, address:true } },
            technicalManager: { select: { email:true } },
            team: { include: { user: { select: { email:true } } } },
          },
        },
        entries: { orderBy: { entryTime: 'asc' } },
        checklist: true, photos: true,
        createdBy: { select: { firstName:true, lastName:true } },
      },
    });
    if (!r) throw new AppError('Rapport introuvable', 404);

    const pdfBuffer = await generateDailyReportPdf({
      project: { name: r.project.name, internalNumber: r.project.internalNumber },
      client: r.project.client || null,
      reportDate: r.reportDate,
      reportId: r.id,
      createdBy: r.createdBy ? `${r.createdBy.firstName} ${r.createdBy.lastName}` : undefined,
      weather: r.weather,
      workersPresent: r.workersPresent,
      generalNotes: r.generalNotes,
      entries: r.entries,
      checklist: r.checklist,
      photos: r.photos,
    });

    // Construction de la liste finale de destinataires
    const recipients = new Set<string>();
    const customList: string[] = Array.isArray(req.body?.recipients) ? req.body.recipients : [];

    if (customList.length > 0) {
      // Liste fournie explicitement : on n'ajoute que ce qui est dedans
      customList
        .map(e => String(e).trim().toLowerCase())
        .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        .forEach(e => recipients.add(e));
    } else {
      // Comportement par défaut (rétrocompatible)
      if (r.project.client?.email) recipients.add(r.project.client.email);
      if (r.project.technicalManager?.email) recipients.add(r.project.technicalManager.email);
      r.project.team.forEach((t: any) => { if (t.user.email) recipients.add(t.user.email); });
    }

    if (recipients.size === 0) throw new AppError('Aucun destinataire valide', 400);

    await sendDailyReport({
      to: Array.from(recipients),
      projectName: r.project.name,
      date: new Date(r.reportDate).toLocaleDateString('fr-FR'),
      notes: r.generalNotes || undefined,
      entries: r.entries,
      pdfBuffer,
    });

    await prisma.dailyReport.update({ where: { id: r.id }, data: { sentAt: new Date() } });
    res.json({ success: true, data: { sentTo: recipients.size, recipients: Array.from(recipients) } });
  } catch (err) { next(err); }
});

export default router;