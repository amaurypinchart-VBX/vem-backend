// src/routes/dailyReports.ts
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { sendDailyReport } from '../services/emailService';
import { upload, deleteFromCloudinary } from '../services/cloudinaryService';
import { assertProjectAccess } from '../middleware/projectAccess';
import { CHECKLIST_PHASES } from '../services/checklistService';
import {
  ATTACHMENT_MAX_BYTES, classifyFile, inspectPdf, storeAttachmentFile, checklistSnapshot, buildDailyReportPdf,
} from '../services/dailyAttachments';

const router = Router();
const db = prisma as any; // DailyReportAttachment : client typé régénéré au build Docker

const CHECKLIST_TITLES: Record<string, string> = {
  preparation: 'Check-list de préparation',
  installation: 'Check-list de montage',
  dismantling: 'Check-list de démontage',
};

/** Pièce jointe renvoyée au front : sans les données figées de la check-list (seulement ses stats). */
function shapeAttachment(a: any) {
  const { snapshot, ...rest } = a;
  return { ...rest, stats: snapshot?.stats || null };
}

async function listAttachments(reportId: string) {
  try {
    const rows = await db.dailyReportAttachment.findMany({ where: { reportId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return rows.map(shapeAttachment);
  } catch { return []; } // table pas encore créée (premier démarrage)
}

async function reportOr404(id: string) {
  const r = await prisma.dailyReport.findUnique({ where: { id }, select: { id: true, projectId: true, reportDate: true } });
  if (!r) throw new AppError('Rapport introuvable', 404);
  return r;
}

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
    // nombre de pièces jointes par rapport (compteur des cartes)
    try {
      const counts = await db.dailyReportAttachment.groupBy({ by: ['reportId'], where: { reportId: { in: reports.map(r => r.id) } }, _count: { _all: true } });
      const byId = new Map(counts.map((c: any) => [c.reportId, c._count._all]));
      reports.forEach((r: any) => { r._count = { ...r._count, attachments: byId.get(r.id) || 0 }; });
    } catch { /* table absente */ }
    res.json({ success: true, data: reports });
  } catch (err) { next(err); }
});

router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const r = await prisma.dailyReport.findUnique({
      where: { id: req.params.id },
      include: {
        entries: { orderBy: { entryTime: 'asc' } },
        checklist: true, photos: true,
        taskHours: { orderBy: { sortOrder: 'asc' } },
        createdBy: { select: { firstName:true, lastName:true } },
        project: { select: { name:true, internalNumber:true, client: { select: { name:true, email:true } } } },
      },
    });
    if (!r) throw new AppError('Rapport introuvable', 404);
    res.json({ success: true, data: { ...r, attachments: await listAttachments(r.id) } });
  } catch (err) { next(err); }
});

router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entries = [], checklist = [], taskHours = [], ...data } = req.body;
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
        taskHours: { create: taskHours.map((t: any, i: number) => ({
          taskTemplateId: t.taskTemplateId || null,
          taskTitle: t.taskTitle,
          hours: Number(t.hours) || 0,
          workers: Number(t.workers) || 0,
          sortOrder: i,
        })) },
      },
      include: { entries: true, checklist: true, photos: true, taskHours: true },
    });
    res.status(201).json({ success: true, data: report });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { entries, checklist, taskHours, ...scalars } = req.body;
    const id = req.params.id;

    // Si on reçoit des entries, une checklist ou des taskHours, on les remplace (delete + create)
    if (Array.isArray(entries)) {
      await prisma.dailyReportEntry.deleteMany({ where: { reportId: id } });
    }
    if (Array.isArray(checklist)) {
      await prisma.dailyReportChecklistItem.deleteMany({ where: { reportId: id } });
    }
    if (Array.isArray(taskHours)) {
      await prisma.dailyReportTaskHours.deleteMany({ where: { reportId: id } });
    }

    const data: any = { ...scalars };
    if (scalars.reportDate) data.reportDate = new Date(scalars.reportDate);
    if (Array.isArray(entries)   && entries.length)   data.entries   = { create: entries };
    if (Array.isArray(checklist) && checklist.length) data.checklist = { create: checklist };
    if (Array.isArray(taskHours) && taskHours.length) {
      data.taskHours = { create: taskHours.map((t: any, i: number) => ({
        taskTemplateId: t.taskTemplateId || null,
        taskTitle: t.taskTitle,
        hours: Number(t.hours) || 0,
        workers: Number(t.workers) || 0,
        sortOrder: i,
      })) };
    }

    const report = await prisma.dailyReport.update({
      where: { id },
      data,
      include: { entries: true, checklist: true, photos: true, taskHours: true },
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
    const lang: 'fr' | 'en' = (req.body?.lang === 'en') ? 'en' : 'fr';

    // PDF complet : rapport + check-lists jointes + pages des fichiers joints (en lien si l'e-mail serait trop lourd)
    const built = await buildDailyReportPdf(req.params.id, lang, { forEmail: true });
    if (!built) throw new AppError('Rapport introuvable', 404);
    const r = built.report;

    const recipients = new Set<string>();
    const customList: string[] = Array.isArray(req.body?.recipients) ? req.body.recipients : [];
    if (customList.length > 0) {
      customList
        .map(e => String(e).trim().toLowerCase())
        .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
        .forEach(e => recipients.add(e));
    } else {
      if (r.project.client?.email) recipients.add(r.project.client.email);
      if (r.project.technicalManager?.email) recipients.add(r.project.technicalManager.email);
      r.project.team.forEach((t: any) => { if (t.user.email) recipients.add(t.user.email); });
    }
    if (recipients.size === 0) throw new AppError('Aucun destinataire valide', 400);

    await sendDailyReport({
      to: Array.from(recipients),
      projectName: r.project.name,
      date: new Date(r.reportDate).toLocaleDateString(lang === 'en' ? 'en-US' : 'fr-FR'),
      notes: r.generalNotes || undefined,
      entries: r.entries,
      pdfBuffer: built.buffer,
      links: built.linkedFiles.filter(f => f.url).map(f => ({ name: f.fileName, url: f.url as string })),
      lang,
    });

    await prisma.dailyReport.update({ where: { id: r.id }, data: { sentAt: new Date() } });
    res.json({ success: true, data: { sentTo: recipients.size, recipients: Array.from(recipients) } });
  } catch (err) { next(err); }
});

// POST /daily-reports/test-email — utilitaire de diagnostic SMTP
// Envoie un mail de test à l'adresse fournie (ou l'email de l'utilisateur connecté)
// Permet de vérifier que la config Gmail/Brevo fonctionne sans avoir à créer un rapport.
router.post('/test-email', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const to = req.body?.to || req.user?.email;
    if (!to) throw new AppError('Adresse "to" requise', 400);
    const { sendTestEmail } = await import('../services/emailService');
    const result = await sendTestEmail(to);
    res.json({ success: true, data: { sentTo: to, messageId: result?.messageId } });
  } catch (err) { next(err); }
});
// GET /daily-reports/:id/pdf?lang=fr|en — télécharge le PDF complet (rapport + check-lists + annexes), sans envoyer d'e-mail
// ?inline=1 : ouvert dans le navigateur (impression) au lieu d'être téléchargé
router.get('/:id/pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const lang: 'fr' | 'en' = (req.query.lang === 'en') ? 'en' : 'fr';
    const built = await buildDailyReportPdf(req.params.id, lang);
    if (!built) throw new AppError('Rapport introuvable', 404);
    const r = built.report;
    const filename = `DailyReport_${r.project.internalNumber}_${new Date(r.reportDate).toISOString().slice(0,10)}_${lang}.pdf`;
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `${req.query.inline ? 'inline' : 'attachment'}; filename="${filename}"`);
    res.send(built.buffer);
  } catch (err) { next(err); }
});

// ─── Pièces jointes (fichiers + check-lists), intégrées dans le PDF du rapport ───

// GET /daily-reports/:id/attachments
router.get('/:id/attachments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await reportOr404(req.params.id);
    res.json({ success: true, data: await listAttachments(req.params.id) });
  } catch (err) { next(err); }
});

// POST /daily-reports/:id/attachments — multipart « file » : PDF, image, Word / Excel / PowerPoint (10 Mo max)
router.post('/:id/attachments', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const r = await reportOr404(req.params.id);
    if (!req.file) throw new AppError('Fichier manquant ou type de fichier non accepté', 400);
    if (req.file.size > ATTACHMENT_MAX_BYTES) throw new AppError('Fichier trop lourd : 10 Mo maximum.', 413);
    const fileName = (req.file.originalname || 'document').slice(0, 200);
    const cls = classifyFile(req.file.mimetype, fileName);
    const info = cls === 'pdf' ? await inspectPdf(req.file.buffer) : { pageCount: cls === 'image' ? 1 : null, embeddable: cls === 'image', why: null };
    const stored = await storeAttachmentFile(req.file.buffer, fileName, cls, r.projectId);
    const count = await db.dailyReportAttachment.count({ where: { reportId: r.id } });
    const att = await db.dailyReportAttachment.create({
      data: {
        reportId: r.id, kind: 'file', fileUrl: stored.url, publicId: stored.publicId, resourceType: stored.resourceType,
        fileName, mimeType: req.file.mimetype, sizeBytes: req.file.size, pageCount: info.pageCount, embeddable: info.embeddable,
        sortOrder: count, createdById: req.user!.id,
      },
    });
    res.status(201).json({ success: true, data: shapeAttachment(att) });
  } catch (err) { next(err); }
});

// POST /daily-reports/:id/attachments/checklist — { phase } : joint l'état actuel de la check-list du projet
// (déjà jointe pour cette phase : son état est actualisé).
router.post('/:id/attachments/checklist', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const r = await reportOr404(req.params.id);
    const phase = String(req.body?.phase || 'installation');
    if (!(CHECKLIST_PHASES as readonly string[]).includes(phase)) throw new AppError(`Phase invalide : ${phase}`, 400);
    await assertProjectAccess(req.user, r.projectId);
    const snap = await checklistSnapshot(r.projectId, phase);
    if (!snap) throw new AppError('Cette check-list n’est pas encore configurée pour ce projet.', 404);
    const now = new Date();
    const existing = await db.dailyReportAttachment.findFirst({ where: { reportId: r.id, kind: 'checklist', checklistPhase: phase } });
    const data = { fileName: CHECKLIST_TITLES[phase], snapshot: snap, snapshotAt: now };
    const att = existing
      ? await db.dailyReportAttachment.update({ where: { id: existing.id }, data })
      : await db.dailyReportAttachment.create({
          data: { ...data, reportId: r.id, kind: 'checklist', checklistPhase: phase, embeddable: true, sortOrder: -10, createdById: req.user!.id },
        });
    res.status(existing ? 200 : 201).json({ success: true, data: shapeAttachment(att) });
  } catch (err) { next(err); }
});

// DELETE /daily-reports/:id/attachments/:attId
router.delete('/:id/attachments/:attId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const att = await db.dailyReportAttachment.findFirst({ where: { id: req.params.attId, reportId: req.params.id } });
    if (!att) throw new AppError('Pièce jointe introuvable', 404);
    await db.dailyReportAttachment.delete({ where: { id: att.id } });
    if (att.publicId) await deleteFromCloudinary(att.publicId, att.resourceType === 'raw' ? 'raw' : 'image');
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;