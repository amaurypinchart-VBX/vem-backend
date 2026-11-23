// src/services/chantierService.ts
// VEM Chantier — accès aux données (sessions, projets visibles, feuilles de temps → rapport journalier).
// Logique pure dans chantierLogic.ts.
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { JWT_SECRET, JWT_REFRESH_SECRET } from '../utils/secrets';
import { logger } from '../utils/logger';
import { z } from 'zod';
import { callClaudeJSON } from './aiService';
import {
  Lang, TimesheetLine, Present, phaseOn, quantitiesText, cleanQuantityFields, QuantityField, FilledRole, journalText,
} from './chantierLogic';

const db = prisma as any; // modèles ajoutés (client régénéré au build Docker)

/** Durée de la session sur le téléphone (jeton de rafraîchissement). */
export const SESSION_DAYS = 90;
/** Validité d'un lien d'invitation. */
export const INVITE_DAYS = 7;

export function appUrl(): string {
  return (process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://viewboxsitemanagement.up.railway.app')).replace(/\/+$/, '');
}
export const inviteLink = (token: string) => `${appUrl()}/chantier?i=${token}`;

/** Jeton d'accès (8 h, comme la connexion VEM) + jeton de rafraîchissement de 90 jours. */
export async function issueSession(user: { id: string; email: string; role: string; firstName: string; lastName: string }) {
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role, firstName: user.firstName, lastName: user.lastName },
    JWT_SECRET, { expiresIn: '8h' },
  );
  const refreshToken = jwt.sign({ id: user.id, kind: 'chantier', n: crypto.randomBytes(8).toString('hex') }, JWT_REFRESH_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  await prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000) } });
  return { token, refreshToken };
}

export async function createInvite(userId: string, createdBy: string | null): Promise<{ token: string; link: string; expiresAt: Date }> {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86400000);
  await db.chantierInvite.create({ data: { token, userId, createdBy, expiresAt } });
  return { token, link: inviteLink(token), expiresAt };
}

/** Adresse interne d'un installateur sans e-mail (users.email est obligatoire) ; jamais utilisée pour un envoi. */
export const placeholderEmail = () => `inst-${crypto.randomBytes(5).toString('hex')}@chantier.invalid`;
export const isPlaceholderEmail = (e: string | null | undefined) => !!e && /@chantier\.invalid$/i.test(e);

// ── compteurs : modèle de tâche → compteurs, par titre si la tâche du projet vient d'un modèle ────────────────
export async function templatesWithFields(): Promise<Array<{ id: string; title: string; phase: string | null; categoryName: string | null; quantityFields: QuantityField[] | null }>> {
  const rows = await db.taskTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ category: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
    include: { category: { select: { name: true } } },
  });
  return rows.map((t: any) => ({ id: t.id, title: t.title, phase: t.phase, categoryName: t.category?.name || null, quantityFields: cleanQuantityFields(t.quantityFields) }));
}

// ── traduction des commentaires en français (pour le bureau) ─────────────────
const LANG_NAMES: Record<Lang, string> = { fr: 'français', en: 'anglais', nl: 'néerlandais', pl: 'polonais' };

/**
 * Traduit de courts textes de chantier vers une langue (polonais, anglais, néerlandais ↔ français).
 * Rend un tableau de même longueur : null quand c'est impossible (pas de clé IA, erreur) — le texte d'origine reste alors affiché.
 */
export async function translateSiteTexts(items: Array<{ text: string; from: Lang }>, to: Lang): Promise<Array<string | null>> {
  const out: Array<string | null> = items.map(() => null);
  const todo = items.map((x, i) => ({ i, lang: LANG_NAMES[x.from], text: String(x.text || '').trim() })).filter((x) => x.text && items[x.i].from !== to);
  if (!todo.length || !process.env.ANTHROPIC_API_KEY) return out;
  try {
    const r = await callClaudeJSON({
      schema: z.object({ translations: z.array(z.object({ i: z.number(), text: z.string() })) }),
      system: `Tu traduis de courts textes de chantier (montage et démontage de structures modulaires Viewbox : box, vitres, panneaux, portes, toiture, pieds, vérins) en ${LANG_NAMES[to]} simple, comme un chef de chantier les écrirait. Les textes peuvent venir d'une dictée vocale (sans ponctuation, mots mal reconnus) : garde le sens, corrige seulement la ponctuation. Ne rien ajouter, ne rien résumer, garder les nombres, les noms et les références (VBX-01…) tels quels. Réponds uniquement en JSON {"translations":[{"i":0,"text":"..."}]}.`,
      messages: [{ role: 'user', content: JSON.stringify(todo) }],
      maxTokens: 6000,
      timeoutMs: 45000,
    });
    for (const t of r?.translations || []) if (Number.isInteger(t.i) && t.i >= 0 && t.i < out.length && t.text) out[t.i] = String(t.text).slice(0, 3000);
  } catch (e: any) {
    logger.warn(`[chantier] traduction impossible : ${e?.message || e}`);
  }
  return out;
}

/** Traduit en français les commentaires qui ne le sont pas encore. Sans clé IA ou en cas d'erreur : laissés tels quels. */
export async function translateComments(lines: TimesheetLine[]): Promise<TimesheetLine[]> {
  const todo = lines.filter((l) => l.comment && !l.commentFr && l.commentLang && l.commentLang !== 'fr');
  if (!todo.length) return lines;
  const fr = await translateSiteTexts(todo.map((l) => ({ text: l.comment || '', from: l.commentLang as Lang })), 'fr');
  todo.forEach((l, i) => { if (fr[i]) l.commentFr = fr[i]; });
  return lines;
}

// ── notifications in-app ─────────────────────────────────────────────────────
export async function notify(userIds: string[], n: { title: string; body?: string; data?: any }) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  try {
    await prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, type: 'site_timesheet', title: n.title, body: n.body || null, data: n.data ? JSON.stringify(n.data) : null })),
    });
  } catch (e: any) { logger.warn(`[chantier] notification : ${e?.message || e}`); }
}

/** Qui prévenir quand une feuille est envoyée : site managers de l'équipe (feuille de chef d'équipe), sinon technical manager / sales. */
export async function validatorsToNotify(projectId: string, filledRole: FilledRole, filledById: string): Promise<string[]> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { technicalManagerId: true } });
  const team = await prisma.projectTeam.findMany({ where: { projectId }, include: { user: { select: { id: true, role: true, isActive: true } } } });
  const active = team.filter((t) => t.user?.isActive);
  let ids: string[];
  if (filledRole === 'crew_lead') {
    ids = active.filter((t) => t.user.role === 'site_manager').map((t) => t.user.id);
    if (!ids.length) ids = [project?.technicalManagerId || '', ...active.filter((t) => ['technical_manager', 'sales_engineer'].includes(t.user.role)).map((t) => t.user.id)];
  } else {
    ids = [project?.technicalManagerId || '', ...active.filter((t) => ['technical_manager', 'sales_engineer'].includes(t.user.role)).map((t) => t.user.id)];
  }
  return ids.filter((id) => id && id !== filledById);
}

// ── feuille validée → rapport journalier du même jour ────────────────────────
/**
 * Reprend une feuille validée dans le rapport journalier du jour (créé s'il n'existe pas) : ses lignes remplacent
 * celles d'une validation précédente de la même feuille (`source_timesheet_id`), les photos sont ajoutées une fois,
 * les tâches ajoutées sur chantier sont créées dans le projet, les tâches cochées « terminée » passent à terminé.
 * Rend les lignes (avec l'id des tâches créées) et l'id du rapport.
 */
export async function syncToDailyReport(sheet: {
  id: string; projectId: string; workDate: string; filledById: string; present: Present[]; lines: TimesheetLine[]; comment?: string | null; commentFr?: string | null; dailyReportId?: string | null;
}, validatorId: string): Promise<{ reportId: string; lines: TimesheetLine[] }> {
  const project = await prisma.project.findUnique({ where: { id: sheet.projectId } });
  if (!project) throw new Error('Projet introuvable');
  const phase = phaseOn(project as any, sheet.workDate);
  const day = new Date(sheet.workDate + 'T00:00:00Z');
  const next = new Date(day.getTime() + 86400000);

  return prisma.$transaction(async (tx) => {
    const t = tx as any;
    // tâches ajoutées sur chantier → créées dans le projet (une seule fois) ; tâches terminées
    const lines: TimesheetLine[] = [];
    for (const l of sheet.lines) {
      const line = { ...l };
      if (line.newTask && !line.taskId) {
        const task = await t.task.create({
          data: {
            projectId: sheet.projectId, title: line.title, stage: 'Chantier', taskDate: day,
            status: line.done ? 'done' : 'todo', createdById: sheet.filledById, source: 'chantier',
            actualHours: line.hours * line.workers || null,
          },
        });
        line.taskId = task.id;
      } else if (line.taskId && line.done) {
        await t.task.updateMany({ where: { id: line.taskId, projectId: sheet.projectId, status: { notIn: ['done', 'cancelled'] } }, data: { status: 'done' } });
      }
      lines.push(line);
    }

    const dayNote = String(sheet.commentFr || sheet.comment || '').trim();
    let report = sheet.dailyReportId
      ? await t.dailyReport.findFirst({ where: { id: sheet.dailyReportId, projectId: sheet.projectId } })
      : null;
    if (!report) {
      report = await t.dailyReport.findFirst({
        where: { projectId: sheet.projectId, reportDate: { gte: day, lt: next } },
        orderBy: { createdAt: 'asc' },
      });
    }
    if (!report) {
      report = await t.dailyReport.create({
        data: {
          projectId: sheet.projectId, reportDate: day, createdById: sheet.filledById, phase,
          workersPresent: sheet.present.length, generalNotes: dayNote || null,
        },
      });
    } else {
      // rapport existant : on complète seulement ce qui est vide (phase → la grille heures / gars s'affiche)
      const fill: any = {};
      if (!report.workersPresent && sheet.present.length) fill.workersPresent = sheet.present.length;
      if (!report.phase) fill.phase = phase;
      if (!report.generalNotes && dayNote) fill.generalNotes = dayNote;
      if (Object.keys(fill).length) await t.dailyReport.update({ where: { id: report.id }, data: fill });
    }

    await t.dailyReportTaskHours.deleteMany({ where: { reportId: report.id, sourceTimesheetId: sheet.id } });
    const last = await t.dailyReportTaskHours.findFirst({ where: { reportId: report.id }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    let order = (last?.sortOrder ?? -1) + 1;
    for (const l of lines) {
      await t.dailyReportTaskHours.create({
        data: {
          reportId: report.id, taskTemplateId: l.taskTemplateId || null, taskTitle: l.title,
          hours: l.hours, workers: l.workers, quantities: l.quantities && l.quantities.length ? l.quantities : undefined,
          sourceTimesheetId: sheet.id, sortOrder: order++,
        },
      });
    }

    // ce que l'équipe a raconté (commentaires des lignes, en français) → journal du rapport ; remplacé à chaque validation
    await t.dailyReportEntry.deleteMany({ where: { reportId: report.id, sourceTimesheetId: sheet.id } });
    for (const l of lines) {
      const text = journalText(l);
      if (text) await t.dailyReportEntry.create({ data: { reportId: report.id, entryTime: null, description: text.slice(0, 4000), sourceTimesheetId: sheet.id } });
    }

    // photos : ajoutées une fois (même URL = déjà là)
    const photos = lines.flatMap((l) => (l.photos || []).map((p) => ({ ...p, caption: l.title })));
    if (photos.length) {
      const existing = new Set((await t.dailyReportPhoto.findMany({ where: { reportId: report.id }, select: { photoUrl: true } })).map((p: any) => p.photoUrl));
      for (const p of photos) {
        if (existing.has(p.url)) continue;
        await t.dailyReportPhoto.create({ data: { reportId: report.id, photoUrl: p.url, publicId: p.publicId || null, caption: p.caption.slice(0, 200) } });
        existing.add(p.url);
      }
    }
    return { reportId: report.id, lines };
  });
}

/** Résumé texte d'une ligne (notifications, historique). */
export const lineSummary = (l: TimesheetLine) => `${l.title} — ${l.workers} × ${l.hours} h${quantitiesText(l.quantities) ? ' — ' + quantitiesText(l.quantities) : ''}`;
