// src/routes/assemblyPlans.ts
// Planning estimatif de montage / démontage (monté sur /api/v1/assembly-plans, scopeGuard('assemblyPlans')).
// Un planning par projet et par phase ; le contenu (lignes, barres, jalons, affichage) est un JSON géré par le front
// (public/js/19-assembly-plan.js). Le serveur stocke, renvoie les données du projet qui alimentent le planning
// (dates, camions, tâches, présence de l'équipe) et fait l'enregistrement dans les fichiers / l'envoi par mail
// de l'export (PDF / PNG faits dans le navigateur).
import { Router, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { assertProjectAccess } from '../middleware/projectAccess';
import { uploadToCloudinary } from '../services/cloudinaryService';
import { sendMail, emailShell } from '../services/emailService';

const router = Router();
const db = prisma as any;
const PHASES = ['installation', 'dismantling'];
const MAX_DATA_CHARS = 600_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // limite du plan Cloudinary

const who = (req: AuthRequest) => `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim() || req.user?.email || '';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function phaseOf(raw: string): string {
  if (!PHASES.includes(raw)) throw new AppError('Phase inconnue (installation ou dismantling)', 400);
  return raw;
}

/** « data:application/pdf;base64,… » ou base64 brut → Buffer */
function bufferFrom(raw: unknown, what: string): Buffer {
  if (typeof raw !== 'string' || !raw) throw new AppError(`${what} manquant`, 400);
  const b64 = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new AppError(`${what} vide`, 400);
  if (buf.length > MAX_FILE_BYTES) throw new AppError(`${what} de plus de 10 Mo`, 413);
  return buf;
}

function cleanName(raw: unknown, fallback: string): string {
  return String(raw || fallback).slice(0, 160).replace(/[\\/:*?"<>|]+/g, '-');
}

// GET /assembly-plans/project/:projectId — plannings + données du projet qui les alimentent
router.get('/project/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId;
    await assertProjectAccess(req, projectId);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true, name: true, internalNumber: true, address: true, city: true, workersCount: true,
        installationStart: true, installationEnd: true, dismantlingStart: true, dismantlingEnd: true,
        client: { select: { name: true, email: true, contactName: true, contacts: { select: { name: true, email: true, role: true, isPrimary: true }, orderBy: { sortOrder: 'asc' } } } },
        trucks: { select: { id: true, truckNumber: true, licensePlate: true, driverName: true, vehicleType: true, loadingDate: true, departureDate: true, arrivalDate: true, status: true, loadingLocation: true, unloadingLocation: true, notes: true }, orderBy: { createdAt: 'asc' } },
        tasks: { where: { taskDate: { not: null } }, select: { id: true, title: true, stage: true, taskDate: true, startTime: true, endTime: true, status: true }, orderBy: { taskDate: 'asc' } },
        teamBookings: { select: { id: true, phase: true, onSiteStart: true, onSiteEnd: true, user: { select: { firstName: true, lastName: true } } } },
        team: { select: { role: true, phase: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });
    if (!project) throw new AppError('Projet introuvable', 404);
    const plans = await db.assemblyPlan.findMany({ where: { projectId } });
    res.json({ success: true, data: { plans, project } });
  } catch (err) { next(err); }
});

// PUT /assembly-plans/project/:projectId/:phase — { data, revision } (revision = celle chargée ; 409 si quelqu'un a enregistré entre-temps)
router.put('/project/:projectId/:phase', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const phase = phaseOf(req.params.phase);
    await assertProjectAccess(req, projectId);
    const data = req.body?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AppError('Planning invalide', 400);
    if (JSON.stringify(data).length > MAX_DATA_CHARS) throw new AppError('Planning trop volumineux', 413);
    const base = Number.isInteger(req.body?.revision) ? req.body.revision : null;
    const current = await db.assemblyPlan.findUnique({ where: { projectId_phase: { projectId, phase } } });
    if (current && base !== null && current.revision !== base && !req.body?.force) {
      return res.status(409).json({ success: false, error: `Planning modifié entre-temps par ${current.updatedBy || 'quelqu’un d’autre'}`, data: current });
    }
    const saved = current
      ? await db.assemblyPlan.update({ where: { id: current.id }, data: { data, revision: current.revision + 1, updatedById: req.user!.id, updatedBy: who(req) } })
      : await db.assemblyPlan.create({ data: { projectId, phase, data, revision: 1, updatedById: req.user!.id, updatedBy: who(req) } });
    res.json({ success: true, data: saved });
  } catch (err) { next(err); }
});

// DELETE /assembly-plans/project/:projectId/:phase — repartir de zéro
router.delete('/project/:projectId/:phase', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const phase = phaseOf(req.params.phase);
    await assertProjectAccess(req, projectId);
    await db.assemblyPlan.deleteMany({ where: { projectId, phase } });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /assembly-plans/project/:projectId/:phase/file — { file (base64 PDF ou PNG), fileName } → Fichiers du projet (catégorie planning)
router.post('/project/:projectId/:phase/file', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    phaseOf(req.params.phase);
    await assertProjectAccess(req, projectId);
    const buf = bufferFrom(req.body?.file, 'Fichier');
    const isPdf = buf.slice(0, 4).toString() === '%PDF';
    const isPng = buf.slice(1, 4).toString() === 'PNG';
    if (!isPdf && !isPng) throw new AppError('Seuls les PDF et PNG sont acceptés', 400);
    const ext = isPdf ? 'pdf' : 'png';
    const fileName = cleanName(req.body?.fileName, `planning.${ext}`).replace(/\.(pdf|png)$/i, '') + '.' + ext;
    const { url, publicId } = await uploadToCloudinary(buf, `projects/${projectId}/planning`, isPdf
      ? { resource_type: 'raw', public_id: `${fileName.replace(/\.pdf$/i, '')}-${Date.now()}.pdf` }
      : { resource_type: 'image' });
    const file = await prisma.projectFile.create({
      data: { projectId, uploadedBy: req.user!.id, fileName, fileUrl: url, publicId, fileType: isPdf ? 'application/pdf' : 'image/png', fileSize: buf.length, category: 'planning' },
    });
    res.status(201).json({ success: true, data: file });
  } catch (err) { next(err); }
});

// POST /assembly-plans/project/:projectId/:phase/send — { to: [emails], subject, message, lang, pdf (base64), fileName }
router.post('/project/:projectId/:phase/send', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    phaseOf(req.params.phase);
    await assertProjectAccess(req, projectId);
    const to = (Array.isArray(req.body?.to) ? req.body.to : [req.body?.to])
      .map((e: unknown) => String(e || '').trim()).filter((e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (!to.length) throw new AppError('Aucune adresse e-mail valide', 400);
    if (to.length > 20) throw new AppError('20 destinataires au plus', 400);
    const pdf = bufferFrom(req.body?.pdf, 'PDF');
    if (pdf.slice(0, 4).toString() !== '%PDF') throw new AppError('Le fichier joint doit être un PDF', 400);
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, internalNumber: true } });
    if (!project) throw new AppError('Projet introuvable', 404);
    const en = req.body?.lang === 'en';
    const title = en ? 'Estimated installation schedule' : 'Planning estimatif de montage';
    const subject = String(req.body?.subject || `${title} — ${project.name}`).slice(0, 200);
    const message = String(req.body?.message || '').slice(0, 4000);
    const fileName = cleanName(req.body?.fileName, 'planning.pdf').replace(/\.pdf$/i, '') + '.pdf';
    const html = emailShell(title, `
      ${message ? `<p style="white-space:pre-wrap;">${esc(message)}</p>` : ''}
      <p>${en
        ? `Please find attached the estimated schedule for <strong>${esc(project.name)}</strong> (${esc(project.internalNumber)}).`
        : `Vous trouverez en pièce jointe le planning estimatif de <strong>${esc(project.name)}</strong> (${esc(project.internalNumber)}).`}</p>
      <p style="color:#888;font-size:12px;">${en
        ? 'This schedule is indicative: timing and priorities may shift according to the project’s needs.'
        : 'Ce planning est indicatif : les horaires et priorités peuvent évoluer selon les besoins du projet.'}</p>
      <p>${esc(who(req))}</p>`);
    await sendMail({ to, subject, html, attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }], replyTo: req.user?.email || undefined });
    res.json({ success: true, data: { sent: to.length } });
  } catch (err) { next(err); }
});

export default router;
