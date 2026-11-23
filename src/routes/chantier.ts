// src/routes/chantier.ts
// VEM Chantier — application des installateurs (/chantier). Trois routeurs :
//   publicChantierRoutes  /api/v1/public/chantier  (sans connexion) : lien d'invitation, code à 4 chiffres, connexion téléphone + code
//   chantierAppRoutes     /api/v1/chantier         (connecté)        : ce que voit l'installateur sur son téléphone
//   chantierOfficeRoutes  /api/v1/chantier/office  (connecté)        : bureau — inviter, chef d'équipe, accès, fichiers, validation
// Les droits sont vérifiés dans chaque route (pas de scopeGuard : ce module a ses propres règles, voir chantierLogic.ts).
import { Router, Response, NextFunction, Request } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../config/database';
import { AuthRequest, projectIds } from '../middleware/auth';
import { AppError } from '../utils/AppError';
import { rateLimit } from '../middleware/rateLimit';
import { logger } from '../utils/logger';
import { siteAccessDays, timeLimitedRole, clearSiteDaysCache, canWrite } from '../middleware/access';
import { assertProjectAccess } from '../middleware/projectAccess';
import { upload, uploadToCloudinary } from '../services/cloudinaryService';
import {
  cleanLang, phoneKey, pinProblem, PIN_ROLES, DESIGNATOR_ROLES, siteWindow, brusselsYmd, isYmd, phaseOn, ymdOf,
  siteSectionOf, SITE_SECTIONS, cleanLines, cleanPresent, sheetTotals, canValidate, filledRoleOf, fillerCanEdit,
  TimesheetLine, Present, FilledRole, autoSiteSection,
} from '../services/chantierLogic';
import {
  issueSession, createInvite, placeholderEmail, isPlaceholderEmail, templatesWithFields, translateComments,
  notify, validatorsToNotify, syncToDailyReport, lineSummary,
} from '../services/chantierService';

const db = prisma as any;

// ═════════════════════════════════════════════════════════════════════════════
// Public
// ═════════════════════════════════════════════════════════════════════════════
export const publicChantierRoutes = Router();
const inviteLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, key: () => 'chantier-invite' });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, key: (req) => 'chantier-login:' + phoneKey(req.body?.phone) });
const LOCK_MIN = 15;
const MAX_FAILS = 5;

async function inviteOr404(token: string) {
  const inv = await db.chantierInvite.findUnique({ where: { token } });
  if (!inv) throw new AppError('Lien inconnu', 404);
  if (inv.usedAt) throw new AppError('Ce lien a déjà été utilisé. Demande un nouveau lien à ton responsable.', 410);
  if (new Date(inv.expiresAt) < new Date()) throw new AppError('Ce lien a expiré. Demande un nouveau lien à ton responsable.', 410);
  const user = await prisma.user.findUnique({ where: { id: inv.userId } });
  if (!user || !user.isActive || !PIN_ROLES.includes(user.role)) throw new AppError('Lien invalide', 410);
  return { inv, user };
}

const sessionUser = (u: any) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role, lang: cleanLang(u.lang) });

// GET /public/chantier/invite/:token — prénom + langue pour l'écran « Choisis ton code »
publicChantierRoutes.get('/invite/:token', inviteLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { user } = await inviteOr404(String(req.params.token));
    res.json({ success: true, data: { firstName: user.firstName, lastName: user.lastName, lang: cleanLang((user as any).lang) } });
  } catch (err) { next(err); }
});

// POST /public/chantier/invite/:token { pin, lang } — enregistre le code, connecte
publicChantierRoutes.post('/invite/:token', inviteLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { inv, user } = await inviteOr404(String(req.params.token));
    const problem = pinProblem(req.body?.pin);
    if (problem) throw new AppError(problem === 'weak' ? 'PIN_WEAK' : 'PIN_FORMAT', 400);
    // utilisation unique, même en cas de double envoi
    const used = await db.chantierInvite.updateMany({ where: { id: inv.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!used.count) throw new AppError('Ce lien a déjà été utilisé.', 410);
    const pinHash = await bcrypt.hash(String(req.body.pin), 10);
    await db.user.update({ where: { id: user.id }, data: { pinHash, pinFailed: 0, pinLockedUntil: null, lang: cleanLang(req.body?.lang), lastLogin: new Date() } });
    const session = await issueSession(user);
    res.json({ success: true, data: { ...session, user: sessionUser({ ...user, lang: cleanLang(req.body?.lang) }) } });
  } catch (err) { next(err); }
});

// POST /public/chantier/login { phone, pin }
publicChantierRoutes.post('/login', loginLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const key = phoneKey(req.body?.phone);
    const pin = String(req.body?.pin ?? '');
    if (key.length < 6 || !/^\d{4}$/.test(pin)) throw new AppError('LOGIN_FAILED', 401);
    // SQL brut : le rôle est comparé en texte (un filtre Prisma sur l'enum UserRole avec les valeurs ajoutées après coup
    // — installer — peut échouer en 22P03 « incorrect binary data format », voir migrations.ts) ; colonnes lues par leur nom.
    let rows: any[];
    try {
      rows = await prisma.$queryRaw<any[]>`
        SELECT id, email, role::text AS role, first_name AS "firstName", last_name AS "lastName", phone,
               pin_hash AS "pinHash", pin_failed AS "pinFailed", pin_locked_until AS "pinLockedUntil", lang
        FROM users
        WHERE is_active = true AND role::text IN ('installer', 'worker') AND pin_hash IS NOT NULL AND phone IS NOT NULL
      `;
    } catch (e: any) {
      logger.error(`[chantier/login] lecture des comptes impossible : ${e?.message || e}`);
      throw new AppError('SERVER_BUSY', 503);
    }
    const candidates = rows.filter((u) => phoneKey(u.phone) === key);
    if (!candidates.length) throw new AppError('LOGIN_FAILED', 401);
    const now = Date.now();
    const open = candidates.filter((u) => !u.pinLockedUntil || new Date(u.pinLockedUntil).getTime() <= now);
    if (!open.length) throw new AppError('LOCKED', 429);
    for (const u of open) {
      if (await bcrypt.compare(pin, u.pinHash)) {
        await prisma.$executeRaw`UPDATE users SET pin_failed = 0, pin_locked_until = NULL, last_login = NOW() WHERE id = ${u.id}`;
        const session = await issueSession(u);
        return res.json({ success: true, data: { ...session, user: sessionUser(u) } });
      }
    }
    for (const u of open) {
      const fails = (Number(u.pinFailed) || 0) + 1;
      if (fails >= MAX_FAILS) await prisma.$executeRaw`UPDATE users SET pin_failed = 0, pin_locked_until = ${new Date(now + LOCK_MIN * 60000)} WHERE id = ${u.id}`;
      else await prisma.$executeRaw`UPDATE users SET pin_failed = ${fails} WHERE id = ${u.id}`;
    }
    throw new AppError('LOGIN_FAILED', 401);
  } catch (err) { next(err); }
});

// ═════════════════════════════════════════════════════════════════════════════
// Application (installateur, chef d'équipe, site manager)
// ═════════════════════════════════════════════════════════════════════════════
export const chantierAppRoutes = Router();
chantierAppRoutes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

/** Projets du téléphone : ceux de l'équipe (installateur : pendant la période du chantier). */
async function myProjectIds(req: AuthRequest): Promise<string[]> {
  const scoped = await projectIds(req); // installateur : période déjà appliquée (access.ts)
  const own = await prisma.projectTeam.findMany({ where: { userId: req.user!.id }, select: { projectId: true } });
  const tm = await prisma.project.findMany({ where: { technicalManagerId: req.user!.id }, select: { id: true } });
  const mine = new Set([...own.map((o) => o.projectId), ...tm.map((p) => p.id)]);
  return scoped === null ? [...mine] : scoped.filter((id) => mine.has(id));
}

async function appProject(req: AuthRequest, projectId: string) {
  const ids = await myProjectIds(req);
  if (!ids.includes(projectId)) throw new AppError('NO_ACCESS', 403);
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new AppError('Projet introuvable', 404);
  const member = await prisma.projectTeam.findFirst({ where: { projectId, userId: req.user!.id } });
  const role = req.user!.role;
  const canFill = !!member && ((member as any).crewLead === true || role === 'site_manager');
  return { project, member, canFill, filledRole: filledRoleOf(role) as FilledRole };
}

const fileOut = (f: any) => ({ id: f.id, name: f.fileName, url: f.fileUrl, type: f.fileType, size: f.fileSize, section: siteSectionOf(f), createdAt: f.createdAt });

async function siteFiles(projectId: string) {
  const files = await prisma.projectFile.findMany({ where: { projectId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  return files.map(fileOut).filter((f) => f.section !== 'none');
}

// GET /chantier/me
chantierAppRoutes.get('/me', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const u = await db.user.findUnique({ where: { id: req.user!.id }, select: { id: true, firstName: true, lastName: true, role: true, lang: true, phone: true } });
    if (!u) throw new AppError('Utilisateur introuvable', 404);
    res.json({ success: true, data: { ...u, lang: cleanLang(u.lang) } });
  } catch (err) { next(err); }
});

// PATCH /chantier/me { lang }
chantierAppRoutes.patch('/me', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const lang = cleanLang(req.body?.lang);
    await db.user.update({ where: { id: req.user!.id }, data: { lang } });
    res.json({ success: true, data: { lang } });
  } catch (err) { next(err); }
});

// GET /chantier/projects — grosses cartes de l'accueil
chantierAppRoutes.get('/projects', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const ids = await myProjectIds(req);
    const today = brusselsYmd();
    const projects = await prisma.project.findMany({
      where: { id: { in: ids }, status: { not: 'cancelled' } },
      select: { id: true, name: true, internalNumber: true, city: true, address: true, status: true, installationStart: true, installationEnd: true, dismantlingStart: true, dismantlingEnd: true },
    });
    const members = await prisma.projectTeam.findMany({ where: { userId: req.user!.id, projectId: { in: ids } } });
    const byProject = new Map(members.map((m) => [m.projectId, m]));
    const sheets = await db.siteTimesheet.findMany({ where: { projectId: { in: ids }, filledById: req.user!.id, status: 'returned' }, select: { projectId: true } });
    const returned = new Set(sheets.map((s: any) => s.projectId));
    const data = projects.map((p) => {
      const iS = ymdOf(p.installationStart)!, iE = ymdOf(p.installationEnd)!, dS = ymdOf(p.dismantlingStart), dE = ymdOf(p.dismantlingEnd);
      const onSite = (today >= iS && today <= iE) || (!!dS && today >= dS && today <= (dE || dS));
      const m: any = byProject.get(p.id);
      return {
        id: p.id, name: p.name, internalNumber: p.internalNumber, city: p.city, address: p.address,
        installationStart: iS, installationEnd: iE, dismantlingStart: dS, dismantlingEnd: dE,
        onSite, canFill: !!m && (m.crewLead === true || req.user!.role === 'site_manager'), toFix: returned.has(p.id),
      };
    });
    // en cours d'abord, puis par date d'installation la plus proche
    const dist = (x: typeof data[number]) => Math.abs(Date.parse(x.installationStart) - Date.parse(today));
    data.sort((a, b) => Number(b.onSite) - Number(a.onSite) || dist(a) - dist(b));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /chantier/projects/:id — page du projet + Infos (adresse, contacts, planning)
chantierAppRoutes.get('/projects/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { project: p, canFill } = await appProject(req, req.params.id);
    const team = await prisma.projectTeam.findMany({ where: { projectId: p.id }, include: { user: { select: { id: true, firstName: true, lastName: true, phone: true, role: true, isActive: true } } } });
    const tm = p.technicalManagerId ? await prisma.user.findUnique({ where: { id: p.technicalManagerId }, select: { id: true, firstName: true, lastName: true, phone: true, role: true } }) : null;
    const contacts: Array<{ name: string; phone: string | null; kind: string }> = [];
    const seen = new Set<string>();
    const push = (u: any, kind: string) => { if (!u || seen.has(u.id)) return; seen.add(u.id); contacts.push({ name: `${u.firstName} ${u.lastName}`.trim(), phone: u.phone || null, kind }); };
    team.filter((t) => t.user?.isActive && t.user.role === 'site_manager').forEach((t) => push(t.user, 'site_manager'));
    team.filter((t) => t.user?.isActive && (t as any).crewLead).forEach((t) => push(t.user, 'crew_lead'));
    push(tm, 'technical_manager');
    team.filter((t) => t.user?.isActive && ['technical_manager', 'sales_engineer', 'project_manager'].includes(t.user.role)).forEach((t) => push(t.user, t.user.role));

    const bookings = await prisma.teamBooking.findMany({ where: { projectId: p.id, userId: req.user!.id }, orderBy: { onSiteStart: 'asc' } });
    const hotels = await prisma.hotelBooking.findMany({ where: { projectId: p.id, occupants: { some: { userId: req.user!.id } } }, orderBy: { checkin: 'asc' } });
    const files = await siteFiles(p.id);
    res.json({
      success: true,
      data: {
        id: p.id, name: p.name, internalNumber: p.internalNumber, address: p.address, city: p.city, status: p.status,
        installationStart: ymdOf(p.installationStart), installationEnd: ymdOf(p.installationEnd),
        dismantlingStart: ymdOf(p.dismantlingStart), dismantlingEnd: ymdOf(p.dismantlingEnd),
        today: brusselsYmd(), phaseToday: phaseOn(p as any, brusselsYmd()),
        canFill, contacts,
        bookings: bookings.map((b) => ({
          phase: b.phase, onSiteStart: ymdOf(b.onSiteStart), onSiteEnd: ymdOf(b.onSiteEnd),
          outboundMode: b.outboundMode, outboundDate: b.outboundDate, outboundDetails: b.outboundDetails,
          returnMode: b.returnMode, returnDate: b.returnDate, returnDetails: b.returnDetails,
        })),
        hotels: hotels.map((h) => ({ name: h.hotelName, address: h.hotelAddress, checkin: ymdOf(h.checkin), checkout: ymdOf(h.checkout), reference: h.reference, attachmentUrl: h.attachmentUrl })),
        counts: { plans: files.filter((f) => f.section === 'plans').length, briefing: files.filter((f) => f.section === 'briefing').length, info: files.filter((f) => f.section === 'info').length },
        infoFiles: files.filter((f) => f.section === 'info'),
      },
    });
  } catch (err) { next(err); }
});

// GET /chantier/projects/:id/files?section=plans|briefing|info
chantierAppRoutes.get('/projects/:id/files', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { project } = await appProject(req, req.params.id);
    const section = String(req.query.section || '');
    const files = await siteFiles(project.id);
    res.json({ success: true, data: section ? files.filter((f) => f.section === section) : files });
  } catch (err) { next(err); }
});

async function mustFill(req: AuthRequest, projectId: string) {
  const ctx = await appProject(req, projectId);
  if (!ctx.canFill) throw new AppError('NOT_CREW_LEAD', 403);
  return ctx;
}

// GET /chantier/projects/:id/tasks?date= — tâches proposées pour la journée
chantierAppRoutes.get('/projects/:id/tasks', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { project } = await mustFill(req, req.params.id);
    const date = isYmd(req.query.date) ? String(req.query.date) : brusselsYmd();
    const phase = phaseOn(project as any, date);
    const templates = await templatesWithFields();
    const byTitle = new Map(templates.map((t) => [t.title.trim().toLowerCase(), t]));
    const tasks = await prisma.task.findMany({
      where: { projectId: project.id, status: { notIn: ['cancelled'] } },
      orderBy: [{ taskDate: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, title: true, stage: true, taskDate: true, status: true, assignedToId: true },
    });
    const fieldsOf = (title: string) => byTitle.get(title.trim().toLowerCase())?.quantityFields || null;
    const templateIdOf = (title: string) => byTitle.get(title.trim().toLowerCase())?.id || null;
    const planned = tasks.filter((t) => t.status !== 'done' && (ymdOf(t.taskDate) === date || (t.assignedToId === req.user!.id && !t.taskDate)));
    const plannedIds = new Set(planned.map((t) => t.id));
    const others = tasks.filter((t) => !plannedIds.has(t.id) && t.status !== 'done');
    const shape = (t: any) => ({ id: t.id, title: t.title, stage: t.stage, date: ymdOf(t.taskDate), status: t.status, taskTemplateId: templateIdOf(t.title), quantityFields: fieldsOf(t.title) });
    res.json({
      success: true,
      data: {
        date, phase,
        planned: planned.map(shape),
        others: others.map(shape),
        templates: templates.filter((t) => !t.phase || t.phase === phase).map((t) => ({ id: t.id, title: t.title, category: t.categoryName, quantityFields: t.quantityFields })),
      },
    });
  } catch (err) { next(err); }
});

const sheetOut = (s: any) => ({
  id: s.id, projectId: s.projectId, workDate: s.workDate, status: s.status, filledRole: s.filledRole,
  present: s.present || [], lines: s.lines || [], comment: s.comment || '', returnComment: s.returnComment || null,
  submittedAt: s.submittedAt, validatedAt: s.validatedAt, updatedAt: s.updatedAt, totals: sheetTotals(s.lines || []),
});

// GET /chantier/projects/:id/timesheets — « Tâches réalisées » (feuilles de ce chef d'équipe)
chantierAppRoutes.get('/projects/:id/timesheets', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { project } = await mustFill(req, req.params.id);
    const rows = await db.siteTimesheet.findMany({ where: { projectId: project.id, filledById: req.user!.id }, orderBy: { workDate: 'desc' } });
    res.json({ success: true, data: rows.map(sheetOut) });
  } catch (err) { next(err); }
});

// GET /chantier/projects/:id/timesheets/:date — feuille du jour (ou rien) + équipe pour « Qui était là ? »
chantierAppRoutes.get('/projects/:id/timesheets/:date', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { project } = await mustFill(req, req.params.id);
    const date = String(req.params.date);
    if (!isYmd(date)) throw new AppError('Date invalide', 400);
    const sheet = await db.siteTimesheet.findUnique({ where: { projectId_workDate_filledById: { projectId: project.id, workDate: date, filledById: req.user!.id } } });
    const phase = phaseOn(project as any, date);
    const team = await prisma.projectTeam.findMany({ where: { projectId: project.id }, include: { user: { select: { id: true, firstName: true, lastName: true, role: true, isActive: true } } } });
    const crew = team
      .filter((t) => t.user?.isActive && !['client'].includes(t.user.role) && (t.phase === 'both' || t.phase === phase || !t.phase))
      .filter((t) => ['installer', 'worker', 'site_manager'].includes(t.user.role) || (t as any).crewLead || t.userId === req.user!.id)
      .map((t) => ({ userId: t.user.id, name: `${t.user.firstName} ${t.user.lastName}`.trim(), role: t.user.role }));
    res.json({ success: true, data: { date, phase, sheet: sheet ? sheetOut(sheet) : null, crew } });
  } catch (err) { next(err); }
});

// PUT /chantier/projects/:id/timesheets/:date { present, lines, comment, submit }
chantierAppRoutes.put('/projects/:id/timesheets/:date', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { project, filledRole } = await mustFill(req, req.params.id);
    const date = String(req.params.date);
    if (!isYmd(date)) throw new AppError('Date invalide', 400);
    if (date > brusselsYmd()) throw new AppError('FUTURE_DATE', 400);
    const me = await db.user.findUnique({ where: { id: req.user!.id }, select: { lang: true, firstName: true, lastName: true } });
    const lang = cleanLang(me?.lang);
    const key = { projectId_workDate_filledById: { projectId: project.id, workDate: date, filledById: req.user!.id } };
    const old = await db.siteTimesheet.findUnique({ where: key });
    if (old && !fillerCanEdit(old.status)) throw new AppError('ALREADY_VALIDATED', 409);
    let lines = cleanLines(req.body?.lines, old?.lines || [], lang);
    const present = cleanPresent(req.body?.present);
    const comment = String(req.body?.comment ?? '').trim().slice(0, 2000) || null;
    const submit = req.body?.submit === true;
    if (submit && !lines.length) throw new AppError('NO_LINES', 400);
    if (submit) lines = await translateComments(lines);
    const status = submit ? 'submitted' : (old?.status === 'submitted' ? 'submitted' : old?.status === 'returned' ? 'returned' : 'draft');
    const history = [...(old?.history || [])];
    if (submit) history.push({ at: new Date().toISOString(), by: req.user!.id, action: 'submitted', lines: lines.length });
    const data = {
      present, lines, comment, status, filledRole,
      ...(submit ? { submittedAt: new Date(), returnComment: old?.returnComment || null } : {}),
      history,
    };
    const sheet = old
      ? await db.siteTimesheet.update({ where: { id: old.id }, data })
      : await db.siteTimesheet.create({ data: { id: crypto.randomUUID(), projectId: project.id, workDate: date, filledById: req.user!.id, ...data } });
    if (submit) {
      const to = await validatorsToNotify(project.id, filledRole, req.user!.id);
      const t = sheetTotals(lines);
      await notify(to, {
        title: `📝 Feuille de temps à valider — ${project.name}`,
        body: `${me?.firstName || ''} ${me?.lastName || ''} · ${date} · ${t.tasks} tâche(s) · ${t.manHours} h-hommes`,
        data: { projectId: project.id, timesheetId: sheet.id },
      });
    }
    res.json({ success: true, data: sheetOut(sheet) });
  } catch (err) { next(err); }
});

// POST /chantier/projects/:id/photo (multipart file) — photo d'une tâche
chantierAppRoutes.post('/projects/:id/photo', upload.single('file'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { project } = await mustFill(req, req.params.id);
    if (!req.file) throw new AppError('Fichier manquant', 400);
    if (!/^image\//.test(req.file.mimetype)) throw new AppError('Photo seulement', 400);
    const { url, publicId } = await uploadToCloudinary(req.file.buffer, `chantier/${project.id}`, { resource_type: 'image' }, { name: req.file.originalname, mime: req.file.mimetype });
    res.status(201).json({ success: true, data: { url, publicId } });
  } catch (err) { next(err); }
});

// ═════════════════════════════════════════════════════════════════════════════
// Bureau (VEM)
// ═════════════════════════════════════════════════════════════════════════════
export const chantierOfficeRoutes = Router();
chantierOfficeRoutes.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

const isDesignator = (req: AuthRequest) => DESIGNATOR_ROLES.includes(req.user!.role);
function mustDesignate(req: AuthRequest) {
  if (!isDesignator(req)) throw new AppError('Réservé à l’admin, au technical manager et au sales engineer.', 403);
}

async function memberOr404(projectId: string, memberId: string) {
  const m = await prisma.projectTeam.findFirst({ where: { id: memberId, projectId }, include: { user: true } });
  if (!m) throw new AppError('Membre introuvable', 404);
  return m;
}

// GET /chantier/office/projects/:projectId — accès chantier de l'équipe
chantierOfficeRoutes.get('/projects/:projectId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.params.projectId;
    await assertProjectAccess(req, projectId);
    const p = await prisma.project.findUnique({ where: { id: projectId } });
    if (!p) throw new AppError('Projet introuvable', 404);
    const defaults = await siteAccessDays();
    const win = siteWindow(p as any, defaults);
    const today = brusselsYmd();
    const team = await prisma.projectTeam.findMany({ where: { projectId }, include: { user: true }, orderBy: { createdAt: 'asc' } });
    const invites = await db.chantierInvite.findMany({ where: { userId: { in: team.map((t) => t.userId) }, usedAt: null, expiresAt: { gt: new Date() } }, select: { userId: true } });
    const pendingInvite = new Set(invites.map((i: any) => i.userId));
    const members = team.map((t: any) => {
      const u = t.user;
      const limited = timeLimitedRole(u.role);
      const until = t.accessUntil ? new Date(t.accessUntil) : null;
      const extended = !!until && until.getTime() >= Date.now();
      return {
        memberId: t.id, userId: u.id, name: `${u.firstName} ${u.lastName}`.trim(), role: u.role, teamRole: t.role, phase: t.phase,
        phone: u.phone, email: isPlaceholderEmail(u.email) ? null : u.email, isActive: u.isActive,
        crewLead: t.crewLead === true, accessUntil: until ? until.toISOString() : null,
        pinLogin: PIN_ROLES.includes(u.role), pinSet: !!u.pinHash, inviteOpen: pendingInvite.has(u.id), lastLogin: u.lastLogin,
        limited, hasAccess: !limited || extended || (today >= win.from && today <= win.to), extended,
      };
    });
    res.json({
      success: true,
      data: {
        window: { ...win, custom: p.siteDaysBefore != null || p.siteDaysAfter != null, defaults },
        today, members, canManage: isDesignator(req), canEditFiles: canWrite(req.access!),
      },
    });
  } catch (err) { next(err); }
});

// POST /chantier/office/projects/:projectId/installers { firstName, lastName, phone, email?, lang, crewLead }
chantierOfficeRoutes.post('/projects/:projectId/installers', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    mustDesignate(req);
    const projectId = req.params.projectId;
    await assertProjectAccess(req, projectId);
    const firstName = String(req.body?.firstName || '').trim().slice(0, 60);
    const lastName = String(req.body?.lastName || '').trim().slice(0, 60);
    const phone = String(req.body?.phone || '').trim().slice(0, 30);
    const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 120);
    if (!firstName || !lastName) throw new AppError('Prénom et nom requis', 400);
    if (phoneKey(phone).length < 8) throw new AppError('Numéro de téléphone requis (il sert à se reconnecter)', 400);
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError('E-mail invalide', 400);
    const lang = cleanLang(req.body?.lang);

    // même téléphone = même personne (installateur / ouvrier seulement)
    const sameKey = (await prisma.user.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true, role: true, isActive: true } }))
      .filter((u) => phoneKey(u.phone) === phoneKey(phone));
    let user: any = sameKey.find((u) => PIN_ROLES.includes(u.role)) || null;
    if (!user && sameKey.length) throw new AppError('Ce numéro appartient déjà à un compte VEM qui n’est pas installateur : ajoute cette personne à l’équipe normalement.', 409);
    if (user) {
      user = await prisma.user.findUnique({ where: { id: user.id } });
      if (!user.isActive) user = await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
    } else {
      if (email && (await prisma.user.findUnique({ where: { email } }))) throw new AppError('Cet e-mail est déjà utilisé par un compte VEM.', 409);
      user = await db.user.create({
        data: {
          email: email || placeholderEmail(), passwordHash: await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10),
          firstName, lastName, phone, role: 'installer', lang,
        },
      });
    }
    let member = await prisma.projectTeam.findFirst({ where: { projectId, userId: user.id } });
    if (!member) member = await db.projectTeam.create({ data: { projectId, userId: user.id, role: 'installer', phase: 'both', crewLead: req.body?.crewLead === true } });
    else if (req.body?.crewLead === true) member = await db.projectTeam.update({ where: { id: member!.id }, data: { crewLead: true } });
    const invite = await createInvite(user.id, req.user!.id);
    res.status(201).json({ success: true, data: { userId: user.id, memberId: member!.id, name: `${user.firstName} ${user.lastName}`, reused: sameKey.length > 0, ...invite } });
  } catch (err) { next(err); }
});

// POST /chantier/office/projects/:projectId/members/:memberId/link — nouveau lien (première connexion ou code oublié)
chantierOfficeRoutes.post('/projects/:projectId/members/:memberId/link', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    mustDesignate(req);
    await assertProjectAccess(req, req.params.projectId);
    const m: any = await memberOr404(req.params.projectId, req.params.memberId);
    if (!PIN_ROLES.includes(m.user.role)) throw new AppError('Cette personne se connecte avec son e-mail et son mot de passe VEM (le code à 4 chiffres est réservé aux installateurs).', 400);
    if (!m.user.phone || phoneKey(m.user.phone).length < 8) throw new AppError('Ajoute d’abord son numéro de téléphone (fiche de la personne) : il sert à se reconnecter.', 400);
    if (!m.user.isActive) throw new AppError('Compte désactivé', 400);
    // un seul lien valable à la fois
    await db.chantierInvite.updateMany({ where: { userId: m.user.id, usedAt: null }, data: { expiresAt: new Date() } });
    const invite = await createInvite(m.user.id, req.user!.id);
    res.json({ success: true, data: { name: `${m.user.firstName} ${m.user.lastName}`, phone: m.user.phone, lang: cleanLang(m.user.lang), ...invite } });
  } catch (err) { next(err); }
});

// PATCH /chantier/office/projects/:projectId/members/:memberId { crewLead?, accessUntil? (AAAA-MM-JJ | null) }
chantierOfficeRoutes.patch('/projects/:projectId/members/:memberId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    mustDesignate(req);
    await assertProjectAccess(req, req.params.projectId);
    await memberOr404(req.params.projectId, req.params.memberId);
    const data: any = {};
    if (req.body?.crewLead !== undefined) data.crewLead = req.body.crewLead === true;
    if (req.body?.accessUntil !== undefined) {
      if (req.body.accessUntil === null || req.body.accessUntil === '') data.accessUntil = null;
      else if (isYmd(req.body.accessUntil)) data.accessUntil = new Date(req.body.accessUntil + 'T23:59:59+01:00');
      else throw new AppError('Date invalide', 400);
    }
    const m = await db.projectTeam.update({ where: { id: req.params.memberId }, data });
    res.json({ success: true, data: { memberId: m.id, crewLead: m.crewLead, accessUntil: m.accessUntil } });
  } catch (err) { next(err); }
});

// PATCH /chantier/office/projects/:projectId/window { before, after } (null = réglage général)
chantierOfficeRoutes.patch('/projects/:projectId/window', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    mustDesignate(req);
    await assertProjectAccess(req, req.params.projectId);
    const num = (v: any) => (v === null || v === '' || v === undefined ? null : Math.max(0, Math.min(365, Math.round(Number(v) || 0))));
    const p = await db.project.update({ where: { id: req.params.projectId }, data: { siteDaysBefore: num(req.body?.before), siteDaysAfter: num(req.body?.after) } });
    res.json({ success: true, data: siteWindow(p, await siteAccessDays()) });
  } catch (err) { next(err); }
});

// PUT /chantier/office/settings { before, after } — réglage général (admin)
chantierOfficeRoutes.put('/settings', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'admin') throw new AppError('Réservé à l’admin', 403);
    const n = (v: any, d: number) => { const x = Math.round(Number(v)); return Number.isFinite(x) && x >= 0 && x <= 365 ? x : d; };
    const value = { before: n(req.body?.before, 14), after: n(req.body?.after, 14) };
    await prisma.appSetting.upsert({ where: { key: 'chantier.access' }, update: { value }, create: { key: 'chantier.access', value } });
    clearSiteDaysCache();
    res.json({ success: true, data: value });
  } catch (err) { next(err); }
});

// PATCH /chantier/office/files/:fileId { siteSection: plans | briefing | info | none | null (automatique) }
chantierOfficeRoutes.patch('/files/:fileId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const f = await prisma.projectFile.findUnique({ where: { id: req.params.fileId } });
    if (!f) throw new AppError('Fichier introuvable', 404);
    await assertProjectAccess(req, f.projectId);
    if (!canWrite(req.access!)) throw new AppError('Tu peux consulter mais pas modifier.', 403);
    const v = req.body?.siteSection;
    if (v !== null && !(SITE_SECTIONS as readonly string[]).includes(v)) throw new AppError('Rubrique invalide', 400);
    const out = await db.projectFile.update({ where: { id: f.id }, data: { siteSection: v === autoSiteSection(f) ? null : v } });
    res.json({ success: true, data: { id: out.id, siteSection: out.siteSection, section: siteSectionOf(out) } });
  } catch (err) { next(err); }
});

// ── feuilles de temps (validation) ───────────────────────────────────────────
async function isProjectSiteManager(projectId: string, userId: string, role: string) {
  if (role !== 'site_manager') return false;
  const p = await prisma.project.findFirst({ where: { id: projectId, OR: [{ technicalManagerId: userId }, { team: { some: { userId } } }] }, select: { id: true } });
  return !!p;
}
async function validatorCan(req: AuthRequest, s: any) {
  return canValidate({
    validatorId: req.user!.id, validatorRole: req.user!.role, filledById: s.filledById, filledRole: s.filledRole,
    isProjectSiteManager: await isProjectSiteManager(s.projectId, req.user!.id, req.user!.role),
  });
}
async function sheetOr404(req: AuthRequest, id: string) {
  const s = await db.siteTimesheet.findUnique({ where: { id } });
  if (!s) throw new AppError('Feuille introuvable', 404);
  await assertProjectAccess(req, s.projectId);
  return s;
}
async function officeSheet(req: AuthRequest, s: any, names: Map<string, string>) {
  return { ...sheetOut(s), filledById: s.filledById, filledBy: names.get(s.filledById) || '?', validatedBy: s.validatedById ? names.get(s.validatedById) || '?' : null, dailyReportId: s.dailyReportId, history: s.history || [], canValidate: s.status === 'submitted' && (await validatorCan(req, s)) };
}
async function nameMap(ids: any[]): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(ids.filter(Boolean))] } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));
}

// GET /chantier/office/projects/:projectId/timesheets
chantierOfficeRoutes.get('/projects/:projectId/timesheets', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await assertProjectAccess(req, req.params.projectId);
    const rows = await db.siteTimesheet.findMany({ where: { projectId: req.params.projectId }, orderBy: [{ workDate: 'desc' }, { createdAt: 'asc' }] });
    const names = await nameMap(rows.flatMap((r: any) => [r.filledById, r.validatedById]));
    const data = [];
    for (const r of rows) data.push(await officeSheet(req, r, names));
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// GET /chantier/office/timesheets/:id
chantierOfficeRoutes.get('/timesheets/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const s = await sheetOr404(req, req.params.id);
    const names = await nameMap([s.filledById, s.validatedById]);
    res.json({ success: true, data: await officeSheet(req, s, names) });
  } catch (err) { next(err); }
});

/** Corrections du valideur : lignes / présence / commentaire remplacés, chaque changement noté (avant → après, qui). */
function applyCorrections(req: AuthRequest, s: any) {
  const changes: string[] = [];
  const out: any = {};
  if (Array.isArray(req.body?.lines)) {
    const before: TimesheetLine[] = s.lines || [];
    const after = cleanLines(req.body.lines, before, 'fr');
    const b = new Map(before.map((l) => [l.id, l]));
    for (const l of after) {
      const o = b.get(l.id);
      if (!o) changes.push(`+ ${lineSummary(l)}`);
      else if (lineSummary(o) !== lineSummary(l)) changes.push(`${lineSummary(o)} → ${lineSummary(l)}`);
      b.delete(l.id);
    }
    for (const o of b.values()) changes.push(`− ${lineSummary(o)}`);
    out.lines = after;
  }
  if (Array.isArray(req.body?.present)) {
    const present: Present[] = cleanPresent(req.body.present);
    if (present.length !== (s.present || []).length) changes.push(`présents : ${(s.present || []).length} → ${present.length}`);
    out.present = present;
  }
  if (typeof req.body?.comment === 'string') out.comment = req.body.comment.trim().slice(0, 2000) || null;
  return { out, changes };
}

// PUT /chantier/office/timesheets/:id { lines?, present?, comment? } — corriger sans valider
chantierOfficeRoutes.put('/timesheets/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const s = await sheetOr404(req, req.params.id);
    if (s.status !== 'submitted') throw new AppError('Seule une feuille envoyée peut être corrigée.', 409);
    if (!(await validatorCan(req, s))) throw new AppError('Tu ne peux pas valider cette feuille (niveau au-dessus seulement, jamais sa propre feuille).', 403);
    const { out, changes } = applyCorrections(req, s);
    const history = [...(s.history || [])];
    if (changes.length) history.push({ at: new Date().toISOString(), by: req.user!.id, action: 'corrected', changes });
    const upd = await db.siteTimesheet.update({ where: { id: s.id }, data: { ...out, history } });
    const names = await nameMap([upd.filledById, upd.validatedById]);
    res.json({ success: true, data: await officeSheet(req, upd, names) });
  } catch (err) { next(err); }
});

// POST /chantier/office/timesheets/:id/validate { lines?, present?, comment? }
chantierOfficeRoutes.post('/timesheets/:id/validate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const s = await sheetOr404(req, req.params.id);
    if (s.status !== 'submitted') throw new AppError('Cette feuille n’est pas en attente de validation.', 409);
    if (!(await validatorCan(req, s))) throw new AppError('Tu ne peux pas valider cette feuille (niveau au-dessus seulement, jamais sa propre feuille).', 403);
    const { out, changes } = applyCorrections(req, s);
    const sheet = { ...s, ...out };
    // une seule validation, même avec deux clics
    const claimed = await db.siteTimesheet.updateMany({ where: { id: s.id, status: 'submitted' }, data: { status: 'validating' } });
    if (!claimed.count) throw new AppError('Cette feuille vient d’être traitée par quelqu’un d’autre.', 409);
    try {
      const sync = await syncToDailyReport({ ...sheet, lines: sheet.lines || [], present: sheet.present || [] }, req.user!.id);
      const history = [...(s.history || [])];
      if (changes.length) history.push({ at: new Date().toISOString(), by: req.user!.id, action: 'corrected', changes });
      history.push({ at: new Date().toISOString(), by: req.user!.id, action: 'validated' });
      const upd = await db.siteTimesheet.update({
        where: { id: s.id },
        data: { ...out, lines: sync.lines, status: 'validated', validatedById: req.user!.id, validatedAt: new Date(), dailyReportId: sync.reportId, returnComment: null, history },
      });
      const project = await prisma.project.findUnique({ where: { id: s.projectId }, select: { name: true } });
      await notify([s.filledById], { title: `✅ Feuille du ${s.workDate} validée — ${project?.name || ''}`, data: { projectId: s.projectId, timesheetId: s.id } });
      const names = await nameMap([upd.filledById, upd.validatedById]);
      res.json({ success: true, data: await officeSheet(req, upd, names) });
    } catch (e) {
      await db.siteTimesheet.updateMany({ where: { id: s.id, status: 'validating' }, data: { status: 'submitted' } });
      throw e;
    }
  } catch (err) { next(err); }
});

// POST /chantier/office/timesheets/:id/return { comment } — renvoyer au chef d'équipe « à corriger »
chantierOfficeRoutes.post('/timesheets/:id/return', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const s = await sheetOr404(req, req.params.id);
    if (s.status !== 'submitted') throw new AppError('Cette feuille n’est pas en attente de validation.', 409);
    if (!(await validatorCan(req, s))) throw new AppError('Tu ne peux pas traiter cette feuille.', 403);
    const comment = String(req.body?.comment || '').trim().slice(0, 1000);
    if (!comment) throw new AppError('Dis au chef d’équipe ce qu’il faut corriger.', 400);
    const history = [...(s.history || []), { at: new Date().toISOString(), by: req.user!.id, action: 'returned', comment }];
    const upd = await db.siteTimesheet.update({ where: { id: s.id }, data: { status: 'returned', returnComment: comment, history } });
    const project = await prisma.project.findUnique({ where: { id: s.projectId }, select: { name: true } });
    await notify([s.filledById], { title: `⚠ Feuille du ${s.workDate} à corriger — ${project?.name || ''}`, body: comment, data: { projectId: s.projectId, timesheetId: s.id } });
    const names = await nameMap([upd.filledById, upd.validatedById]);
    res.json({ success: true, data: await officeSheet(req, upd, names) });
  } catch (err) { next(err); }
});

// POST /chantier/office/timesheets/:id/reopen — rouvrir une feuille validée (admin / technical manager / sales)
chantierOfficeRoutes.post('/timesheets/:id/reopen', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const s = await sheetOr404(req, req.params.id);
    if (s.status !== 'validated') throw new AppError('Cette feuille n’est pas validée.', 409);
    if (!(await validatorCan(req, s))) throw new AppError('Tu ne peux pas traiter cette feuille.', 403);
    const history = [...(s.history || []), { at: new Date().toISOString(), by: req.user!.id, action: 'reopened' }];
    const upd = await db.siteTimesheet.update({ where: { id: s.id }, data: { status: 'submitted', history } });
    const names = await nameMap([upd.filledById, upd.validatedById]);
    res.json({ success: true, data: await officeSheet(req, upd, names) });
  } catch (err) { next(err); }
});
