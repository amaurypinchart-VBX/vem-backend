// src/services/infoRequestService.ts
// Demandes d'infos par mail — envoi, rappels, lecture des réponses, remplissage du projet.
// Spec : docs/info-requests/PROMPT_Demandes_Infos_Mail.md ; logique pure (lecture, dates, rythme) : infoRequestLogic.ts
//
// Une demande (info_requests) = un destinataire + ses questions (info_request_items) sur un projet, avec une
// référence INFO-XXXXXX dans le sujet. Les réponses arrivent :
//   - par mail, dans la boîte relevée par imapPoller (ou le webhook Brevo) → handleInboundEmail
//   - par la page publique /info/:token → handleWebAnswers
// Une info remplie à la main dans VEM est détectée par syncProject (valeur changée depuis l'envoi) : ses rappels s'arrêtent.

import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import { sendMail, emailShell } from './emailService';
import { callClaudeJSON } from './aiService';
import { createBookingsFromEmail } from './bookingFromEmail';
import { uploadToCloudinary } from './cloudinaryService';
import * as L from './infoRequestLogic';

// Tables créées par du SQL idempotent (migrations.ts) : le client Prisma typé peut être en retard (cf. CLAUDE.md)
const db = prisma as any;
type Lang = L.Lang;

// ─── Configuration ───────────────────────────────────────────────────────

/** Boîte où arrivent les réponses (celle que relève imapPoller). */
export function replyAddress(): string {
  return (process.env.INFO_REQUEST_REPLY_TO || process.env.IMAP_USER || '').trim();
}
export function appUrl(): string {
  return (process.env.APP_URL || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : 'https://viewboxsitemanagement.up.railway.app')).replace(/\/+$/, '');
}
export function infoStatus() {
  const mail = !!(process.env.GMAIL_APPS_SCRIPT_URL && process.env.GMAIL_APPS_SCRIPT_TOKEN)
    || ((process.env.EMAIL_PROVIDER || '').toLowerCase() === 'brevo' && !!process.env.BREVO_API_KEY)
    || !!(process.env.SMTP_USER && process.env.SMTP_PASS);
  return {
    mail,
    imap: !!(process.env.IMAP_USER && process.env.IMAP_PASS),
    ai: !!process.env.ANTHROPIC_API_KEY,
    replyTo: replyAddress(),
  };
}

// ─── Petits outils ───────────────────────────────────────────────────────

const h = (s: any) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const EMAIL_RE = /^[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}$/i;

function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h\d|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function emit(room: string, event: string, payload: any) {
  try {
    // import au moment de l'appel : index.ts importe ce service (pas de cycle au chargement)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { io } = require('../index');
    io?.to(room).emit(event, payload);
  } catch { /* temps réel indisponible : sans conséquence */ }
}

async function addHistory(requestId: string, kind: string, text: string, by?: string | null) {
  const entry = [{ at: new Date().toISOString(), kind, text: String(text).slice(0, 2000), ...(by ? { by } : {}) }];
  await prisma.$executeRawUnsafe(
    `UPDATE "info_requests" SET "history" = COALESCE("history", '[]'::jsonb) || $1::jsonb, "updated_at" = NOW() WHERE "id" = $2`,
    JSON.stringify(entry), requestId,
  );
}

async function notifyCreator(req: any, title: string, body: string) {
  if (!req.createdById) return;
  try {
    await prisma.notification.create({
      data: {
        userId: req.createdById,
        type: 'info_request',
        title: title.slice(0, 200),
        body: body.slice(0, 1000),
        data: JSON.stringify({ projectId: req.projectId, requestId: req.id }),
      },
    });
    emit(`user:${req.createdById}`, 'notification:new', { projectId: req.projectId });
  } catch (e: any) {
    logger.warn(`[info-requests] notification non créée : ${e.message || e}`);
  }
}

function personName(u: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '';
}
function firstNameOf(full: string | null | undefined, email: string): string {
  const n = String(full || '').trim();
  if (n) return n.split(/\s+/)[0];
  return email.split('@')[0];
}

// ─── État du projet (valeurs actuelles, détection « rempli dans VEM ») ───

interface Snap {
  project: any;
  client: any;
  records: Record<'trucks' | 'hotels' | 'teamTravel' | 'team', Date[]>;
}

async function loadSnap(projectId: string): Promise<Snap | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;
  const [client, trucks, hotels, travel, team] = await Promise.all([
    prisma.client.findUnique({ where: { id: project.clientId }, include: { contacts: true } }).catch(() => null),
    prisma.truck.findMany({ where: { projectId }, select: { createdAt: true } }),
    prisma.hotelBooking.findMany({ where: { projectId }, select: { createdAt: true } }),
    prisma.teamBooking.findMany({ where: { projectId }, select: { createdAt: true } }),
    prisma.projectTeam.findMany({ where: { projectId }, select: { createdAt: true } }),
  ]);
  return {
    project, client,
    records: {
      trucks: trucks.map(x => x.createdAt),
      hotels: hotels.map(x => x.createdAt),
      teamTravel: travel.map(x => x.createdAt),
      team: team.map(x => x.createdAt),
    },
  };
}

const DATE_FIELDS = ['installationStart', 'installationEnd', 'dismantlingStart', 'dismantlingEnd'];
const RECORD_FIELDS = ['trucks', 'hotels', 'teamTravel', 'team'] as const;
const PLACEHOLDER_RE = /^(\?+|-+|tbc|tbd|tba|n\/?a|à définir|a definir|à confirmer|a confirmer|inconnu|unknown|x)$/i;

/** Valeur actuelle sérialisée (comparée à `before` pour savoir si quelqu'un l'a remplie dans VEM). */
function currentValue(field: string, snap: Snap): string {
  const p = snap.project;
  if (field === 'address' || field === 'city') return String(p[field] || '').trim();
  if (DATE_FIELDS.includes(field)) return p[field] ? new Date(p[field]).toISOString() : '';
  if (field === 'workersCount') return p.workersCount ? String(p.workersCount) : '';
  if ((RECORD_FIELDS as readonly string[]).includes(field)) return String(snap.records[field as typeof RECORD_FIELDS[number]].length);
  return '';
}

const RECORD_LABEL: Record<string, Record<Lang, string>> = {
  trucks: { fr: 'camion(s) prévu(s)', en: 'truck(s) planned' },
  hotels: { fr: 'hôtel(s) réservé(s)', en: 'hotel booking(s)' },
  teamTravel: { fr: 'trajet(s) prévu(s)', en: 'trip(s) planned' },
  team: { fr: "personne(s) dans l'équipe", en: 'team member(s)' },
};

/** Valeur actuelle lisible (fenêtre VEM, mail « actuellement dans VEM »). '' si rien. */
function displayValue(field: string, snap: Snap, lang: Lang): string {
  const p = snap.project;
  if (field === 'address' || field === 'city') {
    const v = String(p[field] || '').trim();
    return PLACEHOLDER_RE.test(v) ? '' : v;
  }
  if (DATE_FIELDS.includes(field)) return p[field] ? L.fmtDate(p[field], lang) : '';
  if (field === 'workersCount') return p.workersCount ? String(p.workersCount) : '';
  if ((RECORD_FIELDS as readonly string[]).includes(field)) {
    const n = snap.records[field as typeof RECORD_FIELDS[number]].length;
    return n ? `${n} ${RECORD_LABEL[field][lang]}` : '';
  }
  return '';
}

/** Info manquante dans VEM (pré-cochée dans la fenêtre « Demander des infos »). */
function isMissing(field: string, snap: Snap): boolean {
  const p = snap.project;
  if (field === 'address') return !String(p.address || '').trim() || PLACEHOLDER_RE.test(String(p.address).trim());
  if (field === 'city') return !String(p.city || '').trim();
  if (field === 'dismantlingStart' || field === 'dismantlingEnd') return !p[field];
  if (field === 'workersCount') return !p.workersCount;
  if (field === 'trucks' || field === 'team') return snap.records[field].length === 0;
  return false;
}

function isFilledInApp(item: any, snap: Snap): boolean {
  const f = L.fieldOf(item.field);
  if (!f || f.detect === 'none') return false;
  if (f.detect === 'records') {
    const since = new Date(item.createdAt).getTime();
    return snap.records[item.field as typeof RECORD_FIELDS[number]]?.some(d => new Date(d).getTime() > since) || false;
  }
  const cur = currentValue(item.field, snap);
  return !!cur && cur !== (item.before || '');
}

// ─── Rythme ──────────────────────────────────────────────────────────────

function earliestNeededBy(items: any[]): Date | null {
  const ts = items.filter(i => i.status === 'pending' && i.neededBy).map(i => new Date(i.neededBy).getTime());
  return ts.length ? new Date(Math.min(...ts)) : null;
}

/** Recalcule le prochain rappel (ou clôt la demande s'il ne reste rien en attente). */
async function reschedule(requestId: string): Promise<any> {
  const r = await db.infoRequest.findUnique({ where: { id: requestId }, include: { items: true } });
  if (!r) return null;
  const pending = r.items.filter((i: any) => i.status === 'pending');
  if (r.status === 'open' && !pending.length) {
    const done = await db.infoRequest.update({ where: { id: r.id }, data: { status: 'done', nextReminderAt: null } });
    await addHistory(r.id, 'done', 'Plus aucune question en attente — demande terminée');
    return done;
  }
  if (r.status !== 'open') {
    if (r.nextReminderAt) await db.infoRequest.update({ where: { id: r.id }, data: { nextReminderAt: null } });
    return r;
  }
  const plan = L.cleanPlan(r.plan);
  const fromTs = Math.max(
    r.lastSentAt ? new Date(r.lastSentAt).getTime() : 0,
    r.lastReplyAt ? new Date(r.lastReplyAt).getTime() : 0,
    new Date(r.createdAt).getTime(),
  );
  const next = L.nextReminderAt(plan, { from: new Date(fromTs), remindersSent: r.remindersSent, neededBy: earliestNeededBy(r.items) });
  return db.infoRequest.update({ where: { id: r.id }, data: { nextReminderAt: next } });
}

/** Ferme les questions remplies à la main dans VEM (et arrête tout si le projet est terminé / annulé). */
export async function syncProject(projectId: string): Promise<number> {
  const open = await db.infoRequest.findMany({ where: { projectId, status: 'open' }, include: { items: true } });
  if (!open.length) return 0;
  const snap = await loadSnap(projectId);
  if (!snap) return 0;
  if (['completed', 'cancelled'].includes(snap.project.status)) {
    for (const r of open) {
      await db.infoRequestItem.updateMany({ where: { requestId: r.id, status: 'pending' }, data: { status: 'stopped', note: 'Projet terminé / annulé' } });
      await db.infoRequest.update({ where: { id: r.id }, data: { status: 'stopped', nextReminderAt: null } });
      await addHistory(r.id, 'stopped', 'Projet terminé ou annulé — rappels arrêtés');
    }
    return 0;
  }
  let closed = 0;
  for (const r of open) {
    const filled = r.items.filter((it: any) => it.status === 'pending' && isFilledInApp(it, snap));
    if (!filled.length) continue;
    for (const it of filled) {
      const shown = displayValue(it.field, snap, 'fr');
      await db.infoRequestItem.update({
        where: { id: it.id },
        data: { status: 'filled', source: 'app', answeredAt: new Date(), note: (shown ? `Rempli dans VEM : ${shown}` : 'Rempli dans VEM').slice(0, 500) },
      });
    }
    closed += filled.length;
    await addHistory(r.id, 'filled', `Rempli dans VEM : ${filled.map((i: any) => `Q${i.number} ${i.label}`).join(', ')} — plus de rappel pour ${filled.length > 1 ? 'ces questions' : 'cette question'}`);
    await reschedule(r.id);
  }
  if (closed) emit(`project:${projectId}`, 'info-requests:updated', { projectId });
  return closed;
}

// ─── Mails ───────────────────────────────────────────────────────────────

const TXT = {
  fr: {
    hello: (n: string) => `Bonjour <strong>${h(n)}</strong>,`,
    intro: (who: string, proj: string) => `${who ? `<strong>${h(who)}</strong> a` : 'Nous avons'} besoin de quelques informations pour le projet <strong>${proj}</strong>.`,
    reminderIntro: (n: number, proj: string) => `Petit rappel${n > 1 ? ` (n° ${n})` : ''} : il nous manque encore ces informations pour le projet <strong>${proj}</strong>.`,
    project: 'Projet', client: 'Client', place: 'Lieu', install: 'Montage', dismantle: 'Démontage',
    questions: 'Questions', current: 'Actuellement dans VEM', neededBy: 'Nécessaire pour le',
    how: 'Comment répondre ?',
    btnMail: '✉️ Répondre par mail', btnWeb: '📝 Répondre en ligne',
    howText: (ex: string) => `Ou réponds simplement à ce mail en écrivant ta réponse après chaque numéro, par&nbsp;exemple&nbsp;<em>${ex}</em>. Une info pas encore connue ? Laisse la ligne vide : on te la redemandera.`,
    howWebOnly: 'Clique sur le bouton ci-dessus pour répondre : les infos entrent directement dans VEM.',
    templateTitle: 'Modèle de réponse (tu peux aussi écrire directement dedans en répondant) :',
    footer: (ref: string) => `Réf. ${ref} — garde-la dans le sujet de ta réponse. Les infos entrent directement dans VEM.`,
    subject: (proj: string, ref: string) => `[VEM] Infos à compléter — ${proj} — réf. ${ref}`,
    reminderSubject: (n: number, proj: string, ref: string) => `[VEM] Rappel${n > 1 ? ` ${n}` : ''} — Infos à compléter — ${proj} — réf. ${ref}`,
    title: '📨 Infos à compléter', reminderTitle: '⏰ Rappel — infos à compléter',
    ackSubject: (proj: string, ref: string) => `[VEM] Bien reçu — ${proj} — réf. ${ref}`,
    ackTitle: '✅ Bien reçu, merci !',
    ackIntro: (proj: string) => `Merci ! Voici ce que nous avons bien reçu pour le projet <strong>${proj}</strong> :`,
    ackNotUnderstood: 'Pas compris — peux-tu préciser ?',
    ackRemaining: 'Il reste à compléter (on te le redemandera) :',
    ackAllDone: 'Tout est complet, merci beaucoup !',
    example: 'Tour & Taxis, Avenue du Port 86C, Bruxelles',
  },
  en: {
    hello: (n: string) => `Hello <strong>${h(n)}</strong>,`,
    intro: (who: string, proj: string) => `${who ? `<strong>${h(who)}</strong> needs` : 'We need'} some information for the project <strong>${proj}</strong>.`,
    reminderIntro: (n: number, proj: string) => `Friendly reminder${n > 1 ? ` (no. ${n})` : ''}: we are still missing this information for the project <strong>${proj}</strong>.`,
    project: 'Project', client: 'Client', place: 'Location', install: 'Installation', dismantle: 'Dismantling',
    questions: 'Questions', current: 'Currently in VEM', neededBy: 'Needed by',
    how: 'How to answer?',
    btnMail: '✉️ Answer by e-mail', btnWeb: '📝 Answer online',
    howText: (ex: string) => `Or simply reply to this e-mail, writing your answer after each number, for&nbsp;example&nbsp;<em>${ex}</em>. Not known yet? Leave the line empty: we will ask again later.`,
    howWebOnly: 'Click the button above to answer: the information goes straight into VEM.',
    templateTitle: 'Answer template (you can also type straight into it when replying):',
    footer: (ref: string) => `Ref. ${ref} — keep it in the subject of your reply. Your answers go straight into VEM.`,
    subject: (proj: string, ref: string) => `[VEM] Information needed — ${proj} — ref. ${ref}`,
    reminderSubject: (n: number, proj: string, ref: string) => `[VEM] Reminder${n > 1 ? ` ${n}` : ''} — Information needed — ${proj} — ref. ${ref}`,
    title: '📨 Information needed', reminderTitle: '⏰ Reminder — information needed',
    ackSubject: (proj: string, ref: string) => `[VEM] Received — ${proj} — ref. ${ref}`,
    ackTitle: '✅ Received, thank you!',
    ackIntro: (proj: string) => `Thank you! This is what we received for the project <strong>${proj}</strong>:`,
    ackNotUnderstood: 'Not understood — could you clarify?',
    ackRemaining: 'Still missing (we will ask again):',
    ackAllDone: 'Everything is complete, thank you very much!',
    example: 'Tour & Taxis, Avenue du Port 86C, Brussels',
  },
};

interface MailItem { number: number; label: string; kind: L.FieldKind; field: string; neededBy: Date | null; current: string }

function projectLabel(p: any): string {
  return `${p.name}${p.internalNumber ? ` (${p.internalNumber})` : ''}`;
}

function projectBox(snap: Snap, lang: Lang): string {
  const t = TXT[lang];
  const p = snap.project;
  const place = [p.address, p.city].map((x: any) => String(x || '').trim()).filter(x => x && !PLACEHOLDER_RE.test(x)).join(', ');
  const rows: Array<[string, string]> = [[t.project, projectLabel(p)]];
  if (snap.client?.name) rows.push([t.client, snap.client.name]);
  if (place) rows.push([t.place, place]);
  if (p.installationStart) rows.push([t.install, `${L.fmtDate(p.installationStart, lang)} → ${L.fmtDate(p.installationEnd, lang)}`]);
  if (p.dismantlingStart) rows.push([t.dismantle, `${L.fmtDate(p.dismantlingStart, lang)} → ${L.fmtDate(p.dismantlingEnd, lang) || '—'}`]);
  return `<div class="info">${rows.map(([k, v]) => `<div class="row"><span class="lbl">${h(k)}</span><span class="val" style="text-align:right;max-width:380px;">${h(v)}</span></div>`).join('')}</div>`;
}

// « 1 : … » entre guillemets et espaces insécables : une citation de ce mail ne commence jamais une ligne par « 1 : »
// (sinon elle serait lue comme une réponse)
function exampleHtml(text: string): string {
  return `«&nbsp;1&nbsp;:&nbsp;${h(text)}&nbsp;»`;
}

function answerBlock(ref: string, items: MailItem[], lang: Lang, webUrl: string): string {
  const t = TXT[lang];
  const reply = replyAddress();
  const tplItems = items.map(i => ({ number: i.number, label: i.label, kind: i.kind }));
  const lines = L.templateLines(tplItems, ref, lang);
  const subject = `Re: ${lang === 'fr' ? 'réf.' : 'ref.'} ${ref}`;
  const mailto = reply ? `mailto:${reply}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n') + '\n')}` : '';
  const buttons = [
    mailto ? `<a href="${h(mailto)}" class="btn" style="margin-right:8px;">${t.btnMail}</a>` : '',
    `<a href="${h(webUrl)}" class="btn" style="background:#1a1a2e;">${t.btnWeb}</a>`,
  ].join('');
  const tplHtml = lines.map(l => (l ? h(l) : '&nbsp;')).map(l => `<div>${l}</div>`).join('');
  return `
    <h3 style="margin:22px 0 6px;color:#1a1a2e;">${t.how}</h3>
    <div>${buttons}</div>
    <p style="font-size:13px;">${reply ? t.howText(exampleHtml(t.example)) : t.howWebOnly}</p>
    ${reply ? `<p style="font-size:12px;color:#999;margin-bottom:6px;">${t.templateTitle}</p>
    <div style="font-family:Consolas,Menlo,monospace;font-size:13px;background:#f8f8f8;border:1px dashed #ccc;border-radius:8px;padding:12px 14px;color:#1a1a2e;">${tplHtml}</div>` : ''}
    <p style="font-size:11px;color:#999;margin-top:14px;">${h(t.footer(ref))}</p>`;
}

function questionsTable(items: MailItem[], lang: Lang): string {
  const t = TXT[lang];
  const rows = items.map(i => {
    const f = L.fieldOf(i.field);
    const hint = i.field === 'custom' ? '' : (f?.hint?.[lang] || '');
    const meta = [
      i.current ? `${t.current} : <em>${h(i.current)}</em>` : '',
      i.neededBy ? `${t.neededBy} <strong>${h(L.fmtDate(i.neededBy, lang, false))}</strong>` : '',
    ].filter(Boolean).join(' · ');
    return `<tr>
      <td style="vertical-align:top;padding:8px 10px 8px 0;font-weight:700;color:#e63946;white-space:nowrap;">Q${i.number}</td>
      <td style="vertical-align:top;padding:8px 0;border-bottom:1px solid #eee;">
        <div style="font-weight:700;color:#1a1a2e;">${h(i.label)}</div>
        ${hint ? `<div style="font-size:12px;color:#777;margin-top:2px;">${h(hint)}</div>` : ''}
        ${meta ? `<div style="font-size:12px;color:#999;margin-top:3px;">${meta}</div>` : ''}
      </td></tr>`;
  }).join('');
  return `<h3 style="margin:18px 0 4px;color:#1a1a2e;">${t.questions}</h3><table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>`;
}

function requestMail(opts: { ref: string; webToken: string; lang: Lang; recipientName: string; recipientEmail: string; requester: string; message?: string | null; snap: Snap; items: MailItem[]; reminderNo?: number }) {
  const { lang, snap } = opts;
  const t = TXT[lang];
  const proj = h(projectLabel(snap.project));
  const webUrl = `${appUrl()}/info/${opts.webToken}`;
  const reminder = (opts.reminderNo || 0) > 0;
  const content = `
    <p>${t.hello(firstNameOf(opts.recipientName, opts.recipientEmail))}</p>
    <p>${reminder ? t.reminderIntro(opts.reminderNo!, proj) : t.intro(opts.requester, proj)}</p>
    ${projectBox(snap, lang)}
    ${opts.message ? `<p style="white-space:pre-wrap;background:#fff7ed;border-left:4px solid #f4a261;padding:10px 12px;border-radius:6px;">${h(opts.message)}</p>` : ''}
    ${questionsTable(opts.items, lang)}
    ${answerBlock(opts.ref, opts.items, lang, webUrl)}`;
  const subject = reminder
    ? t.reminderSubject(opts.reminderNo!, projectLabel(snap.project), opts.ref)
    : t.subject(projectLabel(snap.project), opts.ref);
  return { subject, html: emailShell(reminder ? t.reminderTitle : t.title, content) };
}

function mailItems(items: any[], snap: Snap): MailItem[] {
  return items.map(i => ({
    number: i.number, label: i.label, kind: i.kind as L.FieldKind, field: i.field,
    neededBy: i.neededBy ? new Date(i.neededBy) : null,
    current: displayValue(i.field, snap, 'fr'),
  }));
}

// ─── Création ────────────────────────────────────────────────────────────

const ITEM_INPUT = z.object({
  field: z.string(),
  question: z.string().max(500).optional().nullable(),
  neededBy: z.string().optional().nullable(),
  recipient: z.object({
    userId: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    name: z.string().max(120).optional().nullable(),
  }),
});
const CREATE_INPUT = z.object({
  lang: z.enum(['fr', 'en']).optional(),
  message: z.string().max(2000).optional().nullable(),
  plan: z.any().optional(),
  items: z.array(ITEM_INPUT).min(1).max(40),
});

interface Group {
  email: string;
  name: string;
  userId: string | null;
  lang: Lang;
  items: Array<{ number: number; field: string; label: string; question: string | null; kind: string; neededBy: Date; before: string }>;
}

async function prepare(projectId: string, body: any) {
  const parsed = CREATE_INPUT.safeParse(body);
  if (!parsed.success) throw new AppError('Demande incomplète : choisis au moins une info et un destinataire', 400);
  const input = parsed.data;
  const lang: Lang = input.lang === 'en' ? 'en' : 'fr';
  const snap = await loadSnap(projectId);
  if (!snap) throw new AppError('Projet introuvable', 404);
  const userIds = [...new Set(input.items.map(i => i.recipient.userId).filter(Boolean) as string[])];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true, isActive: true } })
    : [];
  const userMap = new Map<string, (typeof users)[number]>(users.map(u => [u.id, u] as [string, (typeof users)[number]]));
  const now = new Date();
  const install = snap.project.installationStart ? new Date(snap.project.installationStart) : null;

  const groups = new Map<string, Group>();
  // ordre du catalogue (questions libres à la fin), pour des numéros lisibles
  const order = (k: string) => { const i = L.INFO_FIELDS.findIndex(f => f.key === k); return i < 0 ? 999 : i; };
  const sorted = [...input.items].sort((a, b) => order(a.field) - order(b.field));
  for (const it of sorted) {
    const f = L.fieldOf(it.field);
    if (!f) throw new AppError(`Info inconnue : ${it.field}`, 400);
    const question = (it.question || '').trim();
    if (f.key === 'custom' && !question) throw new AppError('Question libre vide', 400);
    let email = '', name = '', userId: string | null = null;
    if (it.recipient.userId) {
      const u = userMap.get(it.recipient.userId);
      if (!u || !u.isActive) throw new AppError('Destinataire introuvable ou désactivé', 400);
      if (!u.email) throw new AppError(`${personName(u)} n'a pas d'adresse e-mail`, 400);
      email = u.email.trim(); name = personName(u); userId = u.id;
    } else {
      email = String(it.recipient.email || '').trim();
      if (!EMAIL_RE.test(email)) throw new AppError(`Adresse e-mail invalide : « ${email || '(vide)'} »`, 400);
      name = String(it.recipient.name || '').trim();
    }
    const key = email.toLowerCase();
    if (!groups.has(key)) groups.set(key, { email, name, userId, lang, items: [] });
    const g = groups.get(key)!;
    if (!g.name && name) g.name = name;
    if (f.key !== 'custom' && g.items.some(x => x.field === f.key)) continue; // même info deux fois au même destinataire
    const nb = it.neededBy ? new Date(it.neededBy) : null;
    g.items.push({
      number: g.items.length + 1,
      field: f.key,
      label: f.key === 'custom' ? question : f.label[lang],
      question: f.key === 'custom' ? question : null,
      kind: f.kind,
      neededBy: nb && !isNaN(nb.getTime()) ? nb : L.defaultNeededBy(f, install, now),
      before: currentValue(f.key, snap),
    });
  }
  return { snap, groups: [...groups.values()], plan: L.cleanPlan(input.plan || {}), lang, message: (input.message || '').trim() || null };
}

async function newRef(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const ref = L.refFromBytes(crypto.randomBytes(6));
    const exists = await db.infoRequest.findUnique({ where: { ref }, select: { id: true } });
    if (!exists) return ref;
  }
  throw new AppError('Impossible de générer une référence unique', 500);
}

/** Aperçu : le mail du premier destinataire + les prochains rappels si personne ne répond. */
export async function previewRequests(projectId: string, body: any, requester: string) {
  const { snap, groups, plan, message } = await prepare(projectId, body);
  const g = groups[0];
  const mail = requestMail({
    ref: 'INFO-APERCU', webToken: 'apercu', lang: g.lang, recipientName: g.name, recipientEmail: g.email,
    requester, message, snap, items: mailItems(g.items, snap),
  });
  const neededBy = g.items.reduce<Date | null>((m, i) => (!m || i.neededBy < m ? i.neededBy : m), null);
  return {
    subject: mail.subject,
    html: mail.html,
    recipients: groups.map(x => ({ name: x.name || x.email, email: x.email, count: x.items.length })),
    schedule: L.simulateReminders(plan, new Date(), neededBy, 12).map(d => d.toISOString()),
  };
}

/** Crée les demandes (une par destinataire) et envoie les mails. Un envoi raté = demande supprimée + erreur. */
export async function createRequests(projectId: string, body: any, user: { id: string; firstName?: string; lastName?: string }) {
  const { snap, groups, plan, message } = await prepare(projectId, body);
  const requester = personName(user as any);
  const created: any[] = [];
  const errors: Array<{ recipient: string; error: string }> = [];
  for (const g of groups) {
    const ref = await newRef();
    const webToken = crypto.randomBytes(24).toString('base64url');
    const req = await db.infoRequest.create({
      data: {
        projectId, ref, webToken,
        recipientUserId: g.userId, recipientEmail: g.email, recipientName: g.name || null,
        lang: g.lang, message, status: 'open', plan, createdById: user.id,
        history: [],
        items: { create: g.items },
      },
      include: { items: { orderBy: { number: 'asc' } } },
    });
    const mail = requestMail({
      ref, webToken, lang: g.lang, recipientName: g.name, recipientEmail: g.email,
      requester, message, snap, items: mailItems(req.items, snap),
    });
    try {
      await sendMail({ to: g.email, subject: mail.subject, html: mail.html, replyTo: replyAddress() || undefined });
    } catch (e: any) {
      await db.infoRequest.delete({ where: { id: req.id } }).catch(() => {});
      errors.push({ recipient: g.name || g.email, error: e.message || String(e) });
      continue;
    }
    await db.infoRequest.update({ where: { id: req.id }, data: { lastSentAt: new Date() } });
    await addHistory(req.id, 'sent', `Mail envoyé à ${g.name ? `${g.name} <${g.email}>` : g.email} : ${req.items.map((i: any) => `Q${i.number} ${i.label}`).join(', ')}`, requester);
    created.push(await reschedule(req.id));
  }
  if (created.length) emit(`project:${projectId}`, 'info-requests:updated', { projectId });
  return { created, errors };
}

// ─── Remplissage du projet ───────────────────────────────────────────────

async function appendNote(projectId: string, column: 'installNotes' | 'dismantleNotes' | 'scope', title: string, value: string) {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { [column]: true } as any }) as any;
  const block = `📨 ${title} :\n${value}`;
  const next = [String(p?.[column] || '').trim(), block].filter(Boolean).join('\n\n');
  await prisma.project.update({ where: { id: projectId }, data: { [column]: next } as any });
}

const NOTE_COLUMN: Record<string, 'installNotes' | 'dismantleNotes' | 'scope'> = {
  siteContact: 'installNotes', siteAccess: 'installNotes', dismantleInfo: 'dismantleNotes', custom: 'scope',
};

async function addTeamByNames(projectId: string, value: string, who: string): Promise<{ added: string[]; unknown: string[] }> {
  const users = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'client' as any } },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  const existing = new Set((await prisma.projectTeam.findMany({ where: { projectId }, select: { userId: true } })).map(t => t.userId));
  const added: string[] = [], unknown: string[] = [];
  for (const name of L.splitNames(value)) {
    const n = L.norm(name);
    const full = (u: any) => L.norm(`${u.firstName} ${u.lastName}`);
    const rev = (u: any) => L.norm(`${u.lastName} ${u.firstName}`);
    const pick = (list: any[]) => (list.length === 1 ? list[0] : null);
    const u = pick(users.filter(x => full(x) === n || rev(x) === n))
      || pick(users.filter(x => L.norm(x.firstName) === n))
      || pick(users.filter(x => L.norm(x.lastName) === n));
    if (!u) { unknown.push(name); continue; }
    if (existing.has(u.id)) { added.push(personName(u)); continue; }
    try {
      await prisma.projectTeam.create({ data: { projectId, userId: u.id, role: String(u.role), phase: 'both' } });
      existing.add(u.id);
      added.push(personName(u));
    } catch (e: any) {
      if (e.code !== 'P2002') throw e;
      added.push(personName(u));
    }
  }
  if (unknown.length) await appendNote(projectId, 'installNotes', `Équipe — noms non trouvés dans VEM (${who})`, unknown.join(', '));
  return { added, unknown };
}

interface Applied { status: 'answered' | 'received'; note: string | null; display: string }

/** Écrit une réponse comprise dans le projet. */
async function applyItem(req: any, item: any, value: string, display: string, who: string): Promise<Applied> {
  const projectId = req.projectId;
  const field = item.field as string;
  if (field === 'address' || field === 'city') {
    await prisma.project.update({ where: { id: projectId }, data: { [field]: value.slice(0, 500) } as any });
    return { status: 'answered', note: null, display };
  }
  if (DATE_FIELDS.includes(field)) {
    await prisma.project.update({ where: { id: projectId }, data: { [field]: new Date(value) } as any });
    return { status: 'answered', note: null, display };
  }
  if (field === 'workersCount') {
    await prisma.project.update({ where: { id: projectId }, data: { workersCount: parseInt(value, 10) || 0 } });
    return { status: 'answered', note: null, display };
  }
  if (NOTE_COLUMN[field]) {
    await appendNote(projectId, NOTE_COLUMN[field], `${item.label} — ${who}, ${L.fmtDate(new Date(), 'fr')}`, value);
    const where = { installNotes: "notes d'installation", dismantleNotes: 'notes de démontage', scope: 'notes globales' }[NOTE_COLUMN[field]];
    return { status: 'answered', note: `Ajouté aux ${where}`, display };
  }
  if (field === 'team') {
    const r = await addTeamByNames(projectId, value, who);
    const note = [r.added.length ? `Ajouté(s) à l'équipe : ${r.added.join(', ')}` : '', r.unknown.length ? `Pas trouvé(s) dans VEM (mis en note) : ${r.unknown.join(', ')}` : ''].filter(Boolean).join(' · ');
    return { status: r.added.length ? 'answered' : 'received', note: note || null, display };
  }
  if (field === 'trucks' || field === 'hotels' || field === 'teamTravel') {
    const what = { trucks: 'camion(s)', hotels: 'hôtel(s)', teamTravel: 'trajet(s)' }[field];
    try {
      const p = await prisma.project.findUnique({ where: { id: projectId }, select: { internalNumber: true } });
      const r = await createBookingsFromEmail({
        projectId, internalNumber: p?.internalNumber || null,
        subject: `Demande d'infos ${req.ref}`, text: `${item.label}\n${value}`, from: who,
        only: [field], notify: false,
        origin: `📨 Demande d'infos ${req.ref} — réponse de ${who}. À valider.`,
      });
      const n = r.trucks + r.hotels + r.team;
      if (n > 0) return { status: 'answered', note: `${n} ${what} créé(s) en brouillon, à valider`, display };
    } catch (e: any) {
      logger.warn(`[info-requests] ${field} non créés automatiquement : ${e.message || e}`);
    }
    const col = 'installNotes';
    await appendNote(projectId, col, `${item.label} — ${who}`, value);
    return { status: 'received', note: `Pas pu créer les ${what} automatiquement : réponse mise dans les notes d'installation, à saisir à la main`, display };
  }
  return { status: 'received', note: null, display };
}

/** Garde les dates du projet cohérentes après une réponse (fin avant début → fin = début). */
async function fixDates(projectId: string): Promise<string[]> {
  const p = await prisma.project.findUnique({ where: { id: projectId } });
  if (!p) return [];
  const data: any = {};
  const notes: string[] = [];
  if (p.installationEnd && p.installationStart && p.installationEnd < p.installationStart) {
    data.installationEnd = p.installationStart; notes.push('fin du montage alignée sur le début');
  }
  if (p.dismantlingStart && (!p.dismantlingEnd || p.dismantlingEnd < p.dismantlingStart)) {
    data.dismantlingEnd = p.dismantlingStart; notes.push('fin du démontage alignée sur le début');
  }
  if (Object.keys(data).length) await prisma.project.update({ where: { id: projectId }, data });
  return notes;
}

interface Outcome {
  applied: Array<{ item: any; display: string; note: string | null; source: string }>;
  received: Array<{ item: any; display: string; note: string | null; source: string }>;
  invalid: Array<{ item: any; raw: string; reason: string }>;
  ignored: Array<{ item: any; raw: string }>;
}

async function processAnswers(req: any, answers: Map<number, { raw: string; source: string }>, who: string, out: Outcome) {
  const items = await db.infoRequestItem.findMany({ where: { requestId: req.id } });
  const lang: Lang = req.lang === 'en' ? 'en' : 'fr';
  for (const [num, { raw, source }] of answers) {
    const item = items.find((i: any) => i.number === num);
    if (!item) continue;
    if (item.status !== 'pending') {
      if (raw.trim()) out.ignored.push({ item, raw });
      continue;
    }
    const n = L.normalizeAnswer(item.kind as L.FieldKind, raw, new Date(), lang);
    if (n.status === 'empty') continue;
    if (n.status === 'invalid') { out.invalid.push({ item, raw, reason: n.reason }); continue; }
    if (n.status === 'na') {
      await db.infoRequestItem.update({
        where: { id: item.id },
        data: { status: 'received', answerRaw: raw.slice(0, 4000), answerValue: null, answeredAt: new Date(), source, note: 'Non applicable' },
      });
      out.received.push({ item, display: lang === 'fr' ? 'non applicable' : 'not applicable', note: 'Non applicable', source });
      continue;
    }
    let a: Applied;
    try {
      a = await applyItem(req, item, n.value, n.display, who);
    } catch (e: any) {
      logger.error(`[info-requests] ${req.ref} Q${item.number} non appliquée : ${e.message || e}`);
      a = { status: 'received', note: `Pas pu l'écrire dans le projet : ${String(e.message || e).slice(0, 200)}`, display: n.display };
    }
    await db.infoRequestItem.update({
      where: { id: item.id },
      data: { status: a.status, answerRaw: raw.slice(0, 4000), answerValue: n.value.slice(0, 4000), answeredAt: new Date(), source, note: a.note },
    });
    (a.status === 'answered' ? out.applied : out.received).push({ item, display: a.display, note: a.note, source });
  }
}

// ─── IA (réponse libre, date mal écrite) ─────────────────────────────────

const AI_SCHEMA = z.object({
  answers: z.array(z.object({ n: z.number(), value: z.string().catch('') })).catch([]),
});

async function aiExtract(items: any[], text: string, lang: Lang): Promise<Map<number, string>> {
  const today = L.fmtDate(new Date(), 'fr', true);
  const kindText: Record<string, string> = {
    date: 'date → écris YYYY-MM-DD, ou YYYY-MM-DDTHH:MM si une heure est donnée (heure de Bruxelles)',
    number: 'nombre entier',
    names: 'liste de noms de personnes séparés par des virgules',
    bookings: 'recopie tel quel le passage de la réponse qui en parle (dates, heures, plaques, noms…)',
    text: 'texte court', longtext: 'texte',
  };
  const prompt = `Tu lis la réponse d'une personne à une demande d'informations sur un projet de montage événementiel (Viewbox).
Date et heure actuelles à Bruxelles : ${today}. Une date sans année = la prochaine occurrence.

QUESTIONS ENCORE EN ATTENTE (numéro · question · format attendu) :
${items.map(i => `${i.number} · ${i.label} · ${kindText[i.kind] || 'texte'}`).join('\n')}

RÉPONSE REÇUE (${lang === 'fr' ? 'souvent en français' : 'often in English'}) :
"""
${text.slice(0, 6000)}
"""

Réponds UNIQUEMENT avec ce JSON (sans texte autour) :
{"answers":[{"n":<numéro>,"value":"<réponse>"}]}

Règles :
- Ne donne une réponse que si elle est écrite clairement dans le texte. N'invente rien, ne devine rien.
- « je ne sais pas », « pas encore », « à confirmer » = pas de réponse pour cette question (ne la mets pas).
- Une même phrase peut répondre à plusieurs questions.
- Aucune réponse trouvée : {"answers":[]}`;
  const r = await callClaudeJSON<z.infer<typeof AI_SCHEMA>>({ maxTokens: 1500, schema: AI_SCHEMA, messages: [{ role: 'user', content: prompt }] });
  const allowed = new Set(items.map(i => i.number));
  const out = new Map<number, string>();
  for (const a of r.answers || []) if (allowed.has(a.n) && String(a.value || '').trim()) out.set(a.n, String(a.value).trim());
  return out;
}

// ─── Réponse reçue ───────────────────────────────────────────────────────

async function afterAnswers(req: any, out: Outcome, who: string, source: 'email' | 'web', excerpt: string) {
  const now = new Date();
  const got = out.applied.length + out.received.length;
  if (got || out.invalid.length) await db.infoRequest.update({ where: { id: req.id }, data: { lastReplyAt: now } });
  const dateFix = out.applied.some(a => DATE_FIELDS.includes(a.item.field)) ? await fixDates(req.projectId) : [];

  // réponses pas comprises : gardées sur la question (qui reste en attente)
  for (const inv of out.invalid) {
    await db.infoRequestItem.update({ where: { id: inv.item.id }, data: { answerRaw: inv.raw.slice(0, 4000), note: `Réponse pas comprise (${inv.reason}) : « ${inv.raw.slice(0, 200)} »` } });
  }
  const lines: string[] = [];
  for (const a of out.applied) lines.push(`✅ Q${a.item.number} ${a.item.label} : ${a.display}${a.source === 'email-ai' ? ' (lu par IA)' : ''}${a.note ? ` — ${a.note}` : ''}`);
  for (const a of out.received) lines.push(`📥 Q${a.item.number} ${a.item.label} : ${a.display}${a.note ? ` — ${a.note}` : ''}`);
  for (const i of out.invalid) lines.push(`⚠️ Q${i.item.number} ${i.item.label} : pas compris « ${i.raw.slice(0, 120)} » (${i.reason})`);
  for (const i of out.ignored) lines.push(`↪ Q${i.item.number} ${i.item.label} : « ${i.raw.slice(0, 120)} » — reçu mais pas appliqué (question déjà ${i.item.status === 'stopped' ? 'arrêtée' : 'complétée'})`);
  if (dateFix.length) lines.push(`ℹ️ ${dateFix.join(', ')}`);
  const via = source === 'web' ? 'en ligne' : 'par mail';
  const text = lines.length
    ? `Réponse ${via} de ${who} :\n${lines.join('\n')}`
    : `Réponse ${via} de ${who}, rien de compris : « ${excerpt.slice(0, 600)} »`;
  await addHistory(req.id, 'reply', text);
  const fresh = await reschedule(req.id);

  const p = await prisma.project.findUnique({ where: { id: req.projectId }, select: { name: true, internalNumber: true } });
  const title = `📨 ${who} a répondu — ${p?.name || 'projet'}`;
  await notifyCreator(req, title, lines.length ? lines.join('\n') : `Réponse reçue mais rien de compris : « ${excerpt.slice(0, 300)} »`);
  if (got) {
    try {
      const project = await prisma.project.findUnique({ where: { id: req.projectId }, include: { client: true, technicalManager: { select: { id: true, firstName: true, lastName: true } } } });
      emit(`project:${req.projectId}`, 'project:updated', project);
    } catch { /* ignoré */ }
  }
  emit(`project:${req.projectId}`, 'info-requests:updated', { projectId: req.projectId });
  return fresh;
}

async function sendAck(req: any, out: Outcome) {
  const snap = await loadSnap(req.projectId);
  if (!snap) return;
  const lang: Lang = req.lang === 'en' ? 'en' : 'fr';
  const t = TXT[lang];
  const items = await db.infoRequestItem.findMany({ where: { requestId: req.id }, orderBy: { number: 'asc' } });
  const pending = items.filter((i: any) => i.status === 'pending');
  const ok = [...out.applied, ...out.received];
  const proj = h(projectLabel(snap.project));
  const content = `
    <p>${t.hello(firstNameOf(req.recipientName, req.recipientEmail))}</p>
    ${ok.length ? `<p>${t.ackIntro(proj)}</p><div class="info">${ok.map(a => `<div class="row"><span class="lbl">✅ Q${a.item.number} ${h(a.item.label)}</span><span class="val" style="text-align:right;max-width:300px;white-space:pre-wrap;">${h(a.display)}</span></div>`).join('')}</div>` : ''}
    ${out.invalid.length ? `<p><strong>⚠️ ${t.ackNotUnderstood}</strong></p><ul>${out.invalid.map(i => `<li>Q${i.item.number} ${h(i.item.label)} : « ${h(i.raw.slice(0, 120))} »</li>`).join('')}</ul>` : ''}
    ${pending.length
      ? `<p><strong>⏳ ${t.ackRemaining}</strong></p><ul>${pending.map((i: any) => `<li>Q${i.number} ${h(i.label)}</li>`).join('')}</ul>${answerBlock(req.ref, mailItems(pending, snap), lang, `${appUrl()}/info/${req.webToken}`)}`
      : `<p>${t.ackAllDone}</p>`}`;
  try {
    await sendMail({ to: req.recipientEmail, subject: t.ackSubject(projectLabel(snap.project), req.ref), html: emailShell(t.ackTitle, content), replyTo: replyAddress() || undefined });
  } catch (e: any) {
    logger.warn(`[info-requests] accusé de réception non envoyé (${req.ref}) : ${e.message || e}`);
  }
}

export interface InboundMail {
  subject: string;
  text?: string | null;
  html?: string | null;
  from: string;          // « Nom <adresse> » ou adresse
  fromAddress?: string;
  headers?: Record<string, string>;
  /** pièces jointes (mailparser) : rangées dans les fichiers du projet */
  attachments?: Array<{ filename?: string; content?: Buffer; size?: number; related?: boolean }>;
}

/** Pièces jointes d'une réponse (planning camions en PDF…) → fichiers du projet, catégorie « email ». */
async function saveAttachments(req: any, atts: NonNullable<InboundMail['attachments']>) {
  const names: string[] = [];
  for (const a of atts.slice(0, 10)) {
    // images intégrées (logo de signature) ignorées ; Cloudinary refuse plus de 10 Mo
    if (a.related || !a.content?.length || a.content.length > 10 * 1024 * 1024) continue;
    const fileName = a.filename || `reponse-${req.ref}-${names.length + 1}`;
    try {
      const { url, publicId } = await uploadToCloudinary(a.content, `projects/${req.projectId}/files`, { resource_type: 'auto' });
      await prisma.projectFile.create({ data: { projectId: req.projectId, fileName, fileUrl: url, publicId, fileSize: a.content.length, category: 'email' } });
      names.push(fileName);
    } catch (e: any) {
      logger.warn(`[info-requests] pièce jointe « ${fileName} » non enregistrée : ${e.message || e}`);
    }
  }
  if (names.length) await addHistory(req.id, 'files', `📎 Pièce(s) jointe(s) ajoutée(s) aux fichiers du projet : ${names.join(', ')}`);
}

/**
 * Mail entrant : si sa référence INFO-XXXXXX est connue, la réponse est lue et appliquée.
 * Retourne true si le mail concerne une demande d'infos (l'appelant ne doit pas le traiter autrement).
 */
export async function handleInboundEmail(m: InboundMail): Promise<boolean> {
  const text = (m.text && m.text.trim()) ? m.text : htmlToText(m.html || '');
  const ref = L.findRef(m.subject, text);
  if (!ref) return false;
  const req = await db.infoRequest.findUnique({ where: { ref }, include: { items: { orderBy: { number: 'asc' } } } });
  if (!req) {
    logger.warn(`[info-requests] référence ${ref} inconnue (de ${m.from}) — mail ignoré`);
    return true;
  }
  const fromAddress = (m.fromAddress || (/<([^>]+)>/.exec(m.from)?.[1]) || m.from || '').trim().toLowerCase();
  const fromName = m.from.replace(/<[^>]*>/, '').replace(/"/g, '').trim();

  if (L.isBounce(m.from, m.subject)) {
    await addHistory(req.id, 'bounce', `⚠️ Mail non distribué à ${req.recipientEmail} (${m.subject.slice(0, 120)})`);
    await notifyCreator(req, `⚠️ Mail non distribué — ${req.recipientName || req.recipientEmail}`, `La demande ${req.ref} n'a pas pu être remise à ${req.recipientEmail}. Vérifie l'adresse.`);
    return true;
  }
  if (L.isAutoReply(m.subject, m.headers || {})) {
    await addHistory(req.id, 'auto', `Réponse automatique reçue de ${fromAddress} (« ${m.subject.slice(0, 120)} ») — ignorée`);
    return true;
  }

  const sameSender = fromAddress === String(req.recipientEmail).toLowerCase();
  const who = sameSender
    ? (req.recipientName || req.recipientEmail)
    : `${fromName && fromName !== fromAddress ? fromName : fromAddress} (pour ${req.recipientName || req.recipientEmail})`;

  const parseItems = req.items.map((i: any) => ({ number: i.number, label: i.label, kind: i.kind as L.FieldKind }));
  const parsed = L.parseReply(text, parseItems);
  const out: Outcome = { applied: [], received: [], invalid: [], ignored: [] };
  const answers = new Map<number, { raw: string; source: string }>();
  for (const [n, raw] of parsed.answers) answers.set(n, { raw, source: 'email' });
  await processAnswers(req, answers, who, out);

  // Réponse écrite librement, ou date mal écrite : l'IA lit le texte (seulement les questions encore en attente)
  const ownText = (parsed.userText || text).trim();
  const understood = out.applied.length + out.received.length;
  const needAi = out.invalid.length > 0 || (understood === 0 && ownText.replace(/\s/g, '').length >= 3);
  if (needAi && infoStatus().ai) {
    const stillPending = (await db.infoRequestItem.findMany({ where: { requestId: req.id, status: 'pending' }, orderBy: { number: 'asc' } }));
    if (stillPending.length) {
      try {
        const ai = await aiExtract(stillPending, ownText, req.lang === 'en' ? 'en' : 'fr');
        if (ai.size) {
          const aiAnswers = new Map<number, { raw: string; source: string }>();
          for (const [n, v] of ai) aiAnswers.set(n, { raw: v, source: 'email-ai' });
          const out2: Outcome = { applied: [], received: [], invalid: [], ignored: [] };
          await processAnswers(req, aiAnswers, who, out2);
          const fixed = new Set([...out2.applied, ...out2.received].map(a => a.item.number));
          out.invalid = out.invalid.filter(i => !fixed.has(i.item.number));
          out.applied.push(...out2.applied);
          out.received.push(...out2.received);
        }
      } catch (e: any) {
        logger.warn(`[info-requests] lecture IA impossible (${req.ref}) : ${e.message || e}`);
      }
    }
  }

  if (m.attachments?.length) await saveAttachments(req, m.attachments);
  await afterAnswers(req, out, who, 'email', ownText);
  if (out.applied.length + out.received.length + out.invalid.length > 0) await sendAck(req, out);
  logger.info(`[info-requests] ${req.ref} réponse de ${fromAddress} : ${out.applied.length} appliquée(s), ${out.received.length} reçue(s), ${out.invalid.length} pas comprise(s)`);
  return true;
}

// ─── Page publique « Répondre en ligne » ─────────────────────────────────

export async function publicView(token: string) {
  const r = await db.infoRequest.findUnique({ where: { webToken: token }, include: { items: { orderBy: { number: 'asc' } } } });
  if (!r) return null;
  const snap = await loadSnap(r.projectId);
  if (!snap) return null;
  const lang: Lang = r.lang === 'en' ? 'en' : 'fr';
  const p = snap.project;
  return {
    ref: r.ref,
    lang,
    status: r.status,
    recipientName: r.recipientName || '',
    message: r.message || '',
    project: {
      name: p.name,
      internalNumber: p.internalNumber,
      client: snap.client?.name || '',
      install: p.installationStart ? `${L.fmtDate(p.installationStart, lang)} → ${L.fmtDate(p.installationEnd, lang)}` : '',
    },
    items: r.items.map((i: any) => {
      const f = L.fieldOf(i.field);
      return {
        number: i.number,
        label: i.label,
        hint: i.field === 'custom' ? '' : (f?.hint?.[lang] || ''),
        kind: i.kind,
        status: i.status,
        neededBy: i.neededBy ? L.fmtDate(i.neededBy, lang, false) : '',
        current: i.status === 'pending' ? displayValue(i.field, snap, lang) : '',
        answer: i.status === 'answered' || i.status === 'received' ? (i.answerValue && DATE_FIELDS.includes(i.field) ? L.fmtDate(i.answerValue, lang) : (i.answerValue || i.note || '')) : '',
        note: i.status === 'pending' && i.note ? i.note : '',
      };
    }),
  };
}

export async function handleWebAnswers(token: string, body: any) {
  const r = await db.infoRequest.findUnique({ where: { webToken: token }, include: { items: true } });
  if (!r) throw new AppError('Lien invalide ou expiré', 404);
  const list = Array.isArray(body?.answers) ? body.answers.slice(0, 60) : [];
  const answers = new Map<number, { raw: string; source: string }>();
  for (const a of list) {
    const n = Number(a?.number);
    const v = String(a?.value ?? '').slice(0, 4000);
    if (Number.isInteger(n) && v.trim()) answers.set(n, { raw: v, source: 'web' });
  }
  if (!answers.size) throw new AppError('Aucune réponse', 400);
  const out: Outcome = { applied: [], received: [], invalid: [], ignored: [] };
  const who = r.recipientName || r.recipientEmail;
  await processAnswers(r, answers, who, out);
  await afterAnswers(r, out, who, 'web', '');
  return {
    applied: out.applied.map(a => a.item.number),
    received: out.received.map(a => a.item.number),
    invalid: out.invalid.map(i => ({ number: i.item.number, reason: i.reason })),
    view: await publicView(token),
  };
}

// ─── Rappels ─────────────────────────────────────────────────────────────

/** Envoie un rappel (questions encore en attente). manual = bouton « Rappeler maintenant ». */
export async function sendReminder(requestId: string, manual = false, by?: string): Promise<boolean> {
  const r = await db.infoRequest.findUnique({ where: { id: requestId }, include: { items: { orderBy: { number: 'asc' } } } });
  if (!r || r.status !== 'open') return false;
  const pending = r.items.filter((i: any) => i.status === 'pending');
  if (!pending.length) { await reschedule(r.id); return false; }
  const snap = await loadSnap(r.projectId);
  if (!snap) return false;
  const creator = r.createdById ? await prisma.user.findUnique({ where: { id: r.createdById }, select: { firstName: true, lastName: true } }) : null;
  const no = r.remindersSent + 1;
  const lang: Lang = r.lang === 'en' ? 'en' : 'fr';
  const mail = requestMail({
    ref: r.ref, webToken: r.webToken, lang, recipientName: r.recipientName || '', recipientEmail: r.recipientEmail,
    requester: personName(creator), message: null, snap, items: mailItems(pending, snap), reminderNo: no,
  });
  try {
    await sendMail({ to: r.recipientEmail, subject: mail.subject, html: mail.html, replyTo: replyAddress() || undefined });
  } catch (e: any) {
    await addHistory(r.id, 'error', `Rappel ${no} pas envoyé : ${String(e.message || e).slice(0, 300)}`);
    if (!manual) await db.infoRequest.update({ where: { id: r.id }, data: { nextReminderAt: new Date(Date.now() + 3600 * 1000) } });
    if (manual) throw new AppError(`Rappel pas envoyé : ${e.message || e}`, 502);
    return false;
  }
  await db.infoRequest.update({ where: { id: r.id }, data: { remindersSent: no, lastSentAt: new Date() } });
  await addHistory(r.id, 'reminder', `Rappel ${no}${manual ? ' (envoyé à la main)' : ''} : ${pending.map((i: any) => `Q${i.number} ${i.label}`).join(', ')}`, by || null);
  const fresh = await reschedule(r.id);
  const plan = L.cleanPlan(r.plan);
  if (fresh && !fresh.nextReminderAt && fresh.status === 'open' && plan.mode !== 'none' && no >= plan.maxReminders) {
    await addHistory(r.id, 'max', `${no} rappels envoyés sans réponse complète — plus de rappel automatique`);
    await notifyCreator(r, `⏳ Pas de réponse — ${r.recipientName || r.recipientEmail}`, `${no} rappels envoyés pour « ${snap.project.name} » (${r.ref}) sans réponse complète. Les rappels automatiques sont arrêtés.`);
  }
  const nb = earliestNeededBy(r.items);
  const history: any[] = Array.isArray(r.history) ? r.history : [];
  if (nb && nb.getTime() < Date.now() && !history.some(x => x?.kind === 'overdue')) {
    await addHistory(r.id, 'overdue', `Date « pour le ${L.fmtDate(nb, 'fr', false)} » dépassée, toujours sans réponse`);
    await notifyCreator(r, `⚠️ Info toujours manquante — ${snap.project.name}`, `${r.recipientName || r.recipientEmail} n'a pas encore répondu (${pending.map((i: any) => i.label).join(', ')}), nécessaire pour le ${L.fmtDate(nb, 'fr', false)}.`);
  }
  return true;
}

let ticking = false;
/** Tâche de fond : rappels arrivés à échéance (après avoir fermé ce qui a été rempli dans VEM). */
export async function runTick(now = new Date()): Promise<{ sent: number }> {
  if (ticking) return { sent: 0 };
  ticking = true;
  let sent = 0;
  try {
    const due = await db.infoRequest.findMany({
      where: { status: 'open', nextReminderAt: { lte: now } },
      select: { id: true, projectId: true },
      orderBy: { nextReminderAt: 'asc' },
      take: 100,
    });
    for (const pid of [...new Set(due.map((d: any) => d.projectId as string))]) {
      await syncProject(pid as string).catch((e: any) => logger.warn(`[info-requests] sync ${pid} : ${e.message || e}`));
    }
    for (const d of due) {
      const r = await db.infoRequest.findUnique({ where: { id: d.id }, select: { id: true, status: true, nextReminderAt: true } });
      if (!r || r.status !== 'open' || !r.nextReminderAt || new Date(r.nextReminderAt) > now) continue;
      // « réserve » le rappel : un seul envoi même si deux tâches tournent en même temps
      const claim = await db.infoRequest.updateMany({ where: { id: r.id, status: 'open', nextReminderAt: r.nextReminderAt }, data: { nextReminderAt: null } });
      if (claim.count !== 1) continue;
      try {
        if (await sendReminder(r.id)) sent++;
      } catch (e: any) {
        logger.error(`[info-requests] rappel ${r.id} : ${e.message || e}`);
        await db.infoRequest.update({ where: { id: r.id }, data: { nextReminderAt: new Date(Date.now() + 3600 * 1000) } }).catch(() => {});
      }
    }
    if (sent) logger.info(`[info-requests] ${sent} rappel(s) envoyé(s)`);
  } catch (e: any) {
    // tables pas encore créées (premières secondes après un déploiement) : on réessaiera au prochain tour
    logger.warn(`[info-requests] tâche de rappels : ${e.message || e}`);
  } finally {
    ticking = false;
  }
  return { sent };
}

let timer: NodeJS.Timeout | null = null;
export function startInfoRequestScheduler() {
  const min = Math.max(1, Number(process.env.INFO_REQUESTS_TICK_MIN) || 5);
  logger.info(`[info-requests] rappels vérifiés toutes les ${min} minute(s)`);
  setTimeout(() => {
    runTick().catch(() => {});
    timer = setInterval(() => { runTick().catch(() => {}); }, min * 60 * 1000);
  }, 60_000);
}
export function stopInfoRequestScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ─── Lecture pour l'interface VEM ────────────────────────────────────────

function serializeRequest(r: any, creators: Map<string, string>) {
  const plan = L.cleanPlan(r.plan);
  return {
    id: r.id, ref: r.ref, status: r.status,
    recipientUserId: r.recipientUserId, recipientEmail: r.recipientEmail, recipientName: r.recipientName,
    lang: r.lang, message: r.message, plan,
    nextReminderAt: r.nextReminderAt, remindersSent: r.remindersSent, lastSentAt: r.lastSentAt, lastReplyAt: r.lastReplyAt,
    createdAt: r.createdAt, createdBy: r.createdById ? (creators.get(r.createdById) || '') : '',
    webUrl: `${appUrl()}/info/${r.webToken}`,
    history: Array.isArray(r.history) ? r.history : [],
    neededBy: earliestNeededBy(r.items),
    items: (r.items || []).sort((a: any, b: any) => a.number - b.number).map((i: any) => ({
      id: i.id, number: i.number, field: i.field, label: i.label, kind: i.kind, status: i.status,
      neededBy: i.neededBy, answeredAt: i.answeredAt, source: i.source, note: i.note,
      answer: i.answerValue ? (DATE_FIELDS.includes(i.field) ? L.fmtDate(i.answerValue, 'fr') : i.answerValue) : (i.answerRaw || ''),
    })),
  };
}

export async function projectOverview(projectId: string) {
  await syncProject(projectId).catch((e: any) => logger.warn(`[info-requests] sync : ${e.message || e}`));
  const snap = await loadSnap(projectId);
  if (!snap) throw new AppError('Projet introuvable', 404);
  const requests = await db.infoRequest.findMany({
    where: { projectId }, include: { items: true }, orderBy: { createdAt: 'desc' },
  });
  const creatorIds = [...new Set(requests.map((r: any) => r.createdById).filter(Boolean))] as string[];
  const creatorRows = await prisma.user.findMany({ where: { id: { in: creatorIds } }, select: { id: true, firstName: true, lastName: true } });
  const creators = new Map<string, string>(creatorRows.map(u => [u.id, personName(u)] as [string, string]));
  const now = new Date();
  const install = snap.project.installationStart ? new Date(snap.project.installationStart) : null;
  const pendingBy = new Map<string, string[]>();
  for (const r of requests) {
    if (r.status !== 'open') continue;
    for (const i of r.items) if (i.status === 'pending' && i.field !== 'custom') {
      if (!pendingBy.has(i.field)) pendingBy.set(i.field, []);
      pendingBy.get(i.field)!.push(r.recipientName || r.recipientEmail);
    }
  }
  const people = await prisma.user.findMany({
    where: { isActive: true, role: { not: 'client' as any } },
    select: { id: true, firstName: true, lastName: true, email: true, role: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  const contacts: Array<{ name: string; email: string; role: string }> = [];
  const c = snap.client;
  if (c?.email) contacts.push({ name: c.contactName || c.name, email: c.email, role: c.name });
  for (const ct of (c?.contacts || [])) if (ct.email && !contacts.some(x => x.email.toLowerCase() === ct.email.toLowerCase())) contacts.push({ name: ct.name, email: ct.email, role: [c.name, ct.role].filter(Boolean).join(' · ') });
  return {
    status: infoStatus(),
    fields: L.INFO_FIELDS.map(f => ({
      key: f.key, group: f.group, groupLabel: L.GROUP_LABELS[f.group].fr, kind: f.kind, label: f.label.fr, labelEn: f.label.en,
      hint: f.hint?.fr || '', detect: f.detect,
      current: displayValue(f.key, snap, 'fr'),
      missing: isMissing(f.key, snap),
      defaultNeededBy: L.defaultNeededBy(f, install, now).toISOString(),
      pendingWith: pendingBy.get(f.key) || [],
    })),
    people: people.filter(u => u.email).map(u => ({ id: u.id, name: personName(u), email: u.email, role: u.role })),
    contacts,
    requests: requests.map((r: any) => serializeRequest(r, creators)),
  };
}

// ─── Actions depuis VEM ──────────────────────────────────────────────────

export async function requestProjectId(id: string): Promise<string | null> {
  const r = await db.infoRequest.findUnique({ where: { id }, select: { projectId: true } });
  return r?.projectId || null;
}
export async function itemProjectId(itemId: string): Promise<{ projectId: string; requestId: string } | null> {
  const i = await db.infoRequestItem.findUnique({ where: { id: itemId }, select: { requestId: true, request: { select: { projectId: true } } } });
  return i ? { projectId: i.request.projectId, requestId: i.requestId } : null;
}

export async function updateRequest(id: string, body: any, by: string) {
  const r = await db.infoRequest.findUnique({ where: { id }, include: { items: true } });
  if (!r) throw new AppError('Demande introuvable', 404);
  if (body?.plan) {
    const plan = L.cleanPlan({ ...L.cleanPlan(r.plan), ...body.plan });
    await db.infoRequest.update({ where: { id }, data: { plan } });
    const what = plan.mode === 'none' ? 'aucun rappel' : plan.mode === 'urgency' ? "selon l'urgence" : `toutes les ${plan.intervalHours} h`;
    await addHistory(id, 'plan', `Rythme des rappels : ${what} (max ${plan.maxReminders}${plan.skipWeekends ? ', pas le week-end' : ''})`, by);
  }
  if (body?.status === 'stopped' && r.status === 'open') {
    await db.infoRequestItem.updateMany({ where: { requestId: id, status: 'pending' }, data: { status: 'stopped', note: `Arrêté par ${by}` } });
    await db.infoRequest.update({ where: { id }, data: { status: 'stopped', nextReminderAt: null } });
    await addHistory(id, 'stopped', 'Demande arrêtée — plus de rappel', by);
  } else if (body?.status === 'open' && r.status !== 'open') {
    const stopped = r.items.filter((i: any) => i.status === 'stopped').length;
    await db.infoRequestItem.updateMany({ where: { requestId: id, status: 'stopped' }, data: { status: 'pending', note: null } });
    await db.infoRequest.update({ where: { id }, data: { status: 'open', lastSentAt: r.lastSentAt || new Date() } });
    await addHistory(id, 'resumed', `Demande reprise${stopped ? ` (${stopped} question(s) remises en attente)` : ''}`, by);
  }
  await reschedule(id);
  return db.infoRequest.findUnique({ where: { id } });
}

export async function updateItem(itemId: string, body: any, by: string) {
  const it = await db.infoRequestItem.findUnique({ where: { id: itemId } });
  if (!it) throw new AppError('Question introuvable', 404);
  const action = String(body?.action || '');
  if (action === 'stop' && it.status === 'pending') {
    await db.infoRequestItem.update({ where: { id: itemId }, data: { status: 'stopped', note: `Arrêté par ${by}` } });
    await addHistory(it.requestId, 'stopped', `Q${it.number} ${it.label} : arrêtée`, by);
  } else if (action === 'resume' && it.status !== 'pending') {
    await db.infoRequestItem.update({ where: { id: itemId }, data: { status: 'pending', note: null } });
    const r = await db.infoRequest.findUnique({ where: { id: it.requestId } });
    if (r && r.status !== 'open') await db.infoRequest.update({ where: { id: r.id }, data: { status: 'open' } });
    await addHistory(it.requestId, 'resumed', `Q${it.number} ${it.label} : redemandée`, by);
  } else if (action === 'done' && it.status === 'pending') {
    await db.infoRequestItem.update({ where: { id: itemId }, data: { status: 'received', source: 'manual', answeredAt: new Date(), note: `Marqué reçu par ${by}` } });
    await addHistory(it.requestId, 'manual', `Q${it.number} ${it.label} : marquée reçue`, by);
  } else if (action === 'neededBy') {
    const d = new Date(body?.neededBy);
    if (isNaN(d.getTime())) throw new AppError('Date invalide', 400);
    await db.infoRequestItem.update({ where: { id: itemId }, data: { neededBy: d } });
    await addHistory(it.requestId, 'plan', `Q${it.number} ${it.label} : nécessaire pour le ${L.fmtDate(d, 'fr', false)}`, by);
  } else {
    throw new AppError('Action impossible sur cette question', 400);
  }
  await reschedule(it.requestId);
  return db.infoRequestItem.findUnique({ where: { id: itemId } });
}

export async function deleteRequest(id: string) {
  await db.infoRequest.delete({ where: { id } });
}
