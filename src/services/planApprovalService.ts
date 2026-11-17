// src/services/planApprovalService.ts
// Validation des plans par le client (A. Pinchart 17.11.2026), sans compte :
//   1. VEM (admin / technical manager / sales) choisit un PDF de plans du projet → copie figée + empreinte SHA-256,
//      lien personnel envoyé par e-mail au signataire (valable LINK_DAYS jours).
//   2. Le client ouvre le lien (public/plan-approval.html), consulte les plans, choisit : valider / valider avec
//      réserves (commentaire obligatoire) / demander des modifications (commentaire obligatoire), signe, et confirme
//      avec un code à 6 chiffres reçu par e-mail.
//   3. Validé : cachet + filigrane sur chaque page + certificat (planApprovalPdf.ts), PDF rangé dans les Fichiers du
//      projet (catégorie « plans ») et envoyé à toute l'équipe du projet + au signataire (+ copies).
// Tout est noté dans plan_approval_events (journal affiché dans VEM et dans le certificat).
import { prisma } from '../config/database';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { uploadToCloudinary, FILE_MAX_BYTES } from './cloudinaryService';
import { sendMail, emailShell } from './emailService';
import { appUrl, infoStatus } from './infoRequestService';
import * as L from './planApprovalLogic';
import { stampApprovedPdf, inspectPdf, brusselsDateTime, EVENT_LABELS } from './planApprovalPdf';

const db = prisma as any;

export interface Meta { ip?: string | null; userAgent?: string | null; userId?: string | null }
interface Actor { id: string; role: string; firstName?: string; lastName?: string; email?: string }

export function approvalLink(token: string): string {
  return `${appUrl()}/plan-approval/${token}`;
}

const h = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nl = (s: unknown) => h(s).replace(/\n/g, '<br>');
const personName = (u: { firstName?: string | null; lastName?: string | null } | null | undefined) => (u ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : '');
const firstName = (full: string) => String(full || '').trim().split(/\s+/)[0] || '';
const MB = 1024 * 1024;

export async function logEvent(approvalId: string, kind: string, o: Meta & { detail?: string | null } = {}) {
  try {
    await db.planApprovalEvent.create({
      data: {
        approvalId, kind,
        ip: o.ip ? String(o.ip).slice(0, 80) : null,
        userAgent: o.userAgent ? String(o.userAgent).slice(0, 400) : null,
        byUserId: o.userId || null,
        detail: o.detail ? String(o.detail).slice(0, 1000) : null,
      },
    });
  } catch (e: any) {
    logger.warn(`[plan-approval] journal non écrit (${kind}) : ${e.message || e}`);
  }
}

/** Même événement déjà noté il y a moins de `minutes` pour la même IP ? (ouvertures répétées de la page) */
async function recentEvent(approvalId: string, kind: string, ip: string | null | undefined, minutes: number): Promise<boolean> {
  const since = new Date(Date.now() - minutes * 60_000);
  const hit = await db.planApprovalEvent.findFirst({ where: { approvalId, kind, ip: ip || null, at: { gte: since } }, select: { id: true } }).catch(() => null);
  return !!hit;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(90_000) } as any) as any;
  if (!r.ok) throw new AppError(`Fichier introuvable (HTTP ${r.status})`, 502);
  return Buffer.from(await r.arrayBuffer());
}

function safeId(s: string): string {
  return String(s || 'plans').replace(/\.[^.]+$/, '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'plans';
}

// ─── lecture (VEM) ─────────────────────────────────────────────────────────

function serialize(row: any, users: Map<string, string>, withLink: boolean) {
  return {
    id: row.id, ref: row.ref, revision: row.revision,
    status: L.publicStatus(row), rawStatus: row.status,
    lang: row.lang, message: row.message,
    fileName: row.fileName, fileUrl: row.fileUrl, fileSize: row.fileSize, pageCount: row.pageCount, fileSha256: row.fileSha256,
    sourceFileId: row.sourceFileId,
    signerName: row.signerName, signerEmail: row.signerEmail, ccEmails: row.ccEmails || [],
    createdAt: row.createdAt, createdBy: users.get(row.createdById) || null, expiresAt: row.expiresAt,
    decidedAt: row.decidedAt, signedName: row.signedName, signedTitle: row.signedTitle, signedCompany: row.signedCompany,
    comment: row.comment, signedIp: row.signedIp,
    signedFileUrl: row.signedFileUrl, signedFileId: row.signedFileId,
    link: withLink && L.publicStatus(row) === 'pending' ? approvalLink(row.token) : null,
    events: (row.events || []).map((e: any) => ({ at: e.at, kind: e.kind, ip: e.ip, detail: e.detail, by: e.byUserId ? users.get(e.byUserId) || null : null })),
  };
}

async function userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter(Boolean) as string[])];
  if (!list.length) return new Map();
  const rows = await prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, firstName: true, lastName: true } });
  return new Map(rows.map((u) => [u.id, personName(u)]));
}

export async function projectOverview(projectId: string, actor: Actor) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { client: { include: { contacts: true } } },
  });
  if (!project) throw new AppError('Projet introuvable', 404);
  const rows = await db.planApproval.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    include: { events: { orderBy: { at: 'asc' } } },
  });
  const users = await userNames(rows.flatMap((r: any) => [r.createdById, ...r.events.map((e: any) => e.byUserId)]));
  const canSend = L.SEND_ROLES.includes(actor.role);
  const files = await prisma.projectFile.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  const c: any = project.client;
  const contacts: Array<{ name: string; email: string; role: string }> = [];
  if (c?.email) contacts.push({ name: c.contactName || c.name, email: c.email, role: c.name });
  for (const ct of (c?.contacts || [])) {
    if (ct.email && !contacts.some((x) => x.email.toLowerCase() === ct.email.toLowerCase())) contacts.push({ name: ct.name, email: ct.email, role: [c.name, ct.role].filter(Boolean).join(' · ') });
  }
  return {
    canSend,
    mail: infoStatus().mail,
    nextRevision: L.nextRevision(rows.map((r: any) => r.revision)),
    clientName: c?.name || '',
    contacts: canSend ? contacts : [],
    pdfFiles: files
      .filter((f) => /\.pdf$/i.test(f.fileName || '') || /pdf/i.test(f.fileType || ''))
      .map((f) => ({ id: f.id, fileName: f.fileName, category: f.category, fileSize: f.fileSize, createdAt: f.createdAt })),
    approvals: rows.map((r: any) => serialize(r, users, canSend)),
  };
}

export async function approvalProjectId(id: string): Promise<string | null> {
  const r = await db.planApproval.findUnique({ where: { id }, select: { projectId: true } });
  return r?.projectId ?? null;
}

// ─── e-mails ───────────────────────────────────────────────────────────────

function infoRows(rows: Array<[string, string]>) {
  return `<div class="info">${rows.filter(([, v]) => v).map(([k, v]) => `<div class="row"><span class="lbl">${h(k)}</span><span class="val">${h(v)}</span></div>`).join('')}</div>`;
}

function inviteMail(a: any, project: any, sender: string, reminder: boolean) {
  const en = a.lang === 'en';
  const until = brusselsDateTime(a.expiresAt, a.lang).d;
  const link = approvalLink(a.token);
  const name = firstName(a.signerName);
  const subject = en
    ? `${reminder ? 'Reminder: ' : ''}Plans to approve — ${project.name} (Rev. ${a.revision})`
    : `${reminder ? 'Rappel : ' : ''}Plans à valider — ${project.name} (Rév. ${a.revision})`;
  const content = en ? `
    <p>Hello${name ? ` ${h(name)}` : ''},</p>
    <p>${h(sender || 'Viewbox')} is sending you the plans of the project <strong>${h(project.name)}</strong> to check and approve.</p>
    ${a.message ? `<p style="white-space:pre-wrap;background:#fff7ed;border-left:4px solid #f4a261;padding:10px 12px;border-radius:6px;">${nl(a.message)}</p>` : ''}
    ${infoRows([['Project', project.name], ['Revision', a.revision], ['Document', `${a.fileName} · ${a.pageCount} page${a.pageCount > 1 ? 's' : ''}`], ['Reference', a.ref], ['Link valid until', until]])}
    <p style="text-align:center;"><a href="${h(link)}" class="btn">Check and approve the plans</a></p>
    <p style="font-size:12px;color:#888;">No account needed. To sign, a verification code will be sent to this e-mail address. This link is personal: if someone else should approve the plans, simply reply to this e-mail.</p>`
    : `
    <p>Bonjour${name ? ` ${h(name)}` : ''},</p>
    <p>${h(sender || 'Viewbox')} vous envoie les plans du projet <strong>${h(project.name)}</strong> pour vérification et validation.</p>
    ${a.message ? `<p style="white-space:pre-wrap;background:#fff7ed;border-left:4px solid #f4a261;padding:10px 12px;border-radius:6px;">${nl(a.message)}</p>` : ''}
    ${infoRows([['Projet', project.name], ['Révision', a.revision], ['Document', `${a.fileName} · ${a.pageCount} page${a.pageCount > 1 ? 's' : ''}`], ['Référence', a.ref], ['Lien valable jusqu’au', until]])}
    <p style="text-align:center;"><a href="${h(link)}" class="btn">Vérifier et valider les plans</a></p>
    <p style="font-size:12px;color:#888;">Pas besoin de compte. Pour signer, un code de vérification vous sera envoyé à cette adresse e-mail. Ce lien est personnel : si une autre personne doit valider les plans, répondez simplement à ce mail.</p>`;
  return { subject: `${subject} [${a.ref}]`, html: emailShell(en ? 'Plans to approve' : 'Plans à valider', content) };
}

async function sendInvite(a: any, project: any, senderUser: { firstName?: string; lastName?: string; email?: string } | null, reminder: boolean) {
  const { subject, html } = inviteMail(a, project, personName(senderUser), reminder);
  await sendMail({ to: a.signerEmail, subject, html, replyTo: senderUser?.email || undefined });
}

// ─── création / actions (VEM) ──────────────────────────────────────────────

export async function createApproval(projectId: string, body: any, actor: Actor, meta: Meta) {
  if (!L.SEND_ROLES.includes(actor.role)) throw new AppError('Seuls les admins, technical managers et sales peuvent envoyer des plans à valider.', 403);
  if (!infoStatus().mail) throw new AppError("L'envoi de mails n'est pas configuré sur le serveur.", 503);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, internalNumber: true } });
  if (!project) throw new AppError('Projet introuvable', 404);

  const signerEmail = L.cleanEmail(body?.signerEmail);
  if (!signerEmail) throw new AppError('Adresse e-mail du signataire invalide.', 400);
  const signerName = String(body?.signerName || '').trim().slice(0, 120);
  if (!signerName) throw new AppError('Nom du signataire manquant.', 400);
  const lang: L.Lang = body?.lang === 'en' ? 'en' : 'fr';
  const message = String(body?.message || '').trim().slice(0, 3000) || null;
  const ccEmails = L.cleanEmailList(body?.ccEmails).filter((e) => e !== signerEmail);

  const file = await prisma.projectFile.findUnique({ where: { id: String(body?.fileId || '') } });
  if (!file || file.projectId !== projectId) throw new AppError('Fichier introuvable dans ce projet.', 404);
  if (!/\.pdf$/i.test(file.fileName || '') && !/pdf/i.test(file.fileType || '')) throw new AppError('Seul un PDF peut être envoyé pour validation.', 400);

  const buffer = await fetchBuffer(file.fileUrl);
  if (buffer.length > FILE_MAX_BYTES) throw new AppError(`PDF de ${(buffer.length / MB).toFixed(1).replace('.', ',')} Mo : ${Math.round(FILE_MAX_BYTES / MB)} Mo maximum.`, 413);
  let pages = 0;
  try {
    const insp = await inspectPdf(buffer);
    if (insp.encrypted) throw new AppError('Ce PDF est protégé : impossible d’y apposer le cachet de validation. Enregistre-le sans protection.', 400);
    pages = insp.pages;
  } catch (e: any) {
    if (e instanceof AppError) throw e;
    throw new AppError('Ce fichier n’est pas un PDF lisible.', 400);
  }

  const existing = await db.planApproval.findMany({ where: { projectId }, select: { id: true, revision: true, status: true, ref: true } });
  const revision = L.cleanRevision(body?.revision, L.nextRevision(existing.map((r: any) => r.revision)));
  let ref = L.newRef();
  for (let i = 0; i < 5 && existing.some((r: any) => r.ref === ref); i++) ref = L.newRef();
  const token = L.newToken();

  // copie figée : ce que le client signe ne bouge plus, même si le fichier du projet est remplacé ou supprimé
  const stored = await uploadToCloudinary(buffer, `projects/${projectId}/plan-approvals`, {
    resource_type: 'raw', public_id: `${ref}-${safeId(file.fileName)}.pdf`,
  }, { name: file.fileName, mime: 'application/pdf' });

  const days = Math.min(Math.max(Number(body?.days) || L.LINK_DAYS, 1), 90);
  const row = await db.planApproval.create({
    data: {
      projectId, ref, token, revision, status: 'pending', lang, message,
      sourceFileId: file.id, fileName: file.fileName, fileUrl: stored.url, filePublicId: stored.publicId,
      fileSize: buffer.length, fileSha256: L.sha256(buffer), pageCount: pages,
      signerName, signerEmail, ccEmails,
      expiresAt: new Date(Date.now() + days * 86_400_000),
      createdById: actor.id,
    },
  });
  await logEvent(row.id, 'created', { ...meta, userId: actor.id, detail: `${file.fileName} · ${pages} p.` });

  // demandes en cours remplacées par celle-ci (cochées dans VEM)
  const replace: string[] = Array.isArray(body?.replaceIds) ? body.replaceIds.map(String) : [];
  for (const old of existing.filter((r: any) => replace.includes(r.id) && r.status === 'pending')) {
    const res = await db.planApproval.updateMany({ where: { id: old.id, status: 'pending' }, data: { status: 'superseded', codeHash: null } });
    if (res.count) await logEvent(old.id, 'superseded', { ...meta, userId: actor.id, detail: `${t('fr').rev} ${revision} · ${ref}` });
  }

  const sender = await prisma.user.findUnique({ where: { id: actor.id }, select: { firstName: true, lastName: true, email: true } });
  let mailError: string | null = null;
  try {
    await sendInvite(row, project, sender, false);
    await logEvent(row.id, 'sent', { userId: actor.id, detail: signerEmail });
  } catch (e: any) {
    mailError = e.message || String(e);
    await logEvent(row.id, 'mail_failed', { userId: actor.id, detail: `invitation : ${mailError}` });
  }
  emitProject(projectId);
  return { id: row.id, ref, revision, link: approvalLink(token), mailError };
}

const t = (lang: L.Lang) => ({ rev: lang === 'en' ? 'Rev.' : 'Rév.' });

async function loadForAction(id: string, actor: Actor) {
  if (!L.SEND_ROLES.includes(actor.role)) throw new AppError('Action réservée aux admins, technical managers et sales.', 403);
  const row = await db.planApproval.findUnique({ where: { id } });
  if (!row) throw new AppError('Demande introuvable', 404);
  return row;
}

export async function resendApproval(id: string, actor: Actor, meta: Meta) {
  const row = await loadForAction(id, actor);
  if (row.status !== 'pending') throw new AppError('Cette demande n’est plus en attente.', 409);
  if (!infoStatus().mail) throw new AppError("L'envoi de mails n'est pas configuré sur le serveur.", 503);
  const expiresAt = new Date(Math.max(new Date(row.expiresAt).getTime(), Date.now() + L.LINK_DAYS * 86_400_000));
  const upd = await db.planApproval.update({ where: { id }, data: { expiresAt } });
  const project = await prisma.project.findUnique({ where: { id: row.projectId }, select: { name: true, internalNumber: true } });
  const sender = await prisma.user.findUnique({ where: { id: actor.id }, select: { firstName: true, lastName: true, email: true } });
  try {
    await sendInvite(upd, project, sender, true);
  } catch (e: any) {
    await logEvent(id, 'mail_failed', { ...meta, userId: actor.id, detail: `rappel : ${e.message || e}` });
    throw new AppError(`E-mail non envoyé : ${e.message || e}`, 502);
  }
  await logEvent(id, 'resent', { ...meta, userId: actor.id, detail: row.signerEmail });
  emitProject(row.projectId);
  return { expiresAt };
}

export async function cancelApproval(id: string, actor: Actor, meta: Meta) {
  const row = await loadForAction(id, actor);
  const res = await db.planApproval.updateMany({ where: { id, status: 'pending' }, data: { status: 'cancelled', codeHash: null } });
  if (!res.count) throw new AppError('Cette demande n’est plus en attente.', 409);
  await logEvent(id, 'cancelled', { ...meta, userId: actor.id });
  emitProject(row.projectId);
}

/** Refaire le PDF validé (si sa création avait échoué). */
export async function restampApproval(id: string, actor: Actor) {
  const row = await loadForAction(id, actor);
  if (row.status !== 'approved' && row.status !== 'reserves') throw new AppError('Les plans de cette demande ne sont pas validés.', 409);
  const ok = await makeSignedPdf(id);
  if (!ok) throw new AppError('Le PDF validé n’a pas pu être créé (voir le journal de la demande).', 500);
  emitProject(row.projectId);
  return ok;
}

// ─── page publique ─────────────────────────────────────────────────────────

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(String(token || ''))) return null;
  return db.planApproval.findUnique({ where: { token: String(token) } });
}

export async function publicView(token: string, meta: Meta) {
  const row = await byToken(token);
  if (!row) throw new AppError('Lien invalide.', 404);
  const status = L.publicStatus(row);
  const project = await prisma.project.findUnique({
    where: { id: row.projectId },
    select: { name: true, internalNumber: true, address: true, city: true, client: { select: { name: true } } },
  });
  const creator = row.createdById ? await prisma.user.findUnique({ where: { id: row.createdById }, select: { firstName: true, lastName: true, email: true } }) : null;
  if (status === 'pending' && !(await recentEvent(row.id, 'opened', meta.ip, 30))) await logEvent(row.id, 'opened', meta);
  let replacedBy: string | null = null;
  if (status === 'superseded') {
    const ev = await db.planApprovalEvent.findFirst({ where: { approvalId: row.id, kind: 'superseded' }, orderBy: { at: 'desc' } });
    replacedBy = ev?.detail || null;
  }
  return {
    lang: row.lang, ref: row.ref, revision: row.revision, status,
    project: { name: project?.name || '', number: project?.internalNumber || '', address: [project?.address, project?.city].filter(Boolean).join(', ') },
    clientName: project?.client?.name || '',
    signerName: row.signerName, signerEmail: L.maskEmail(row.signerEmail),
    sender: personName(creator), senderEmail: creator?.email || null,
    message: row.message, fileName: row.fileName, pageCount: row.pageCount, fileSize: row.fileSize,
    sentAt: row.createdAt, expiresAt: row.expiresAt,
    codeSentAt: row.codeHash && row.codeExpiresAt && new Date(row.codeExpiresAt) > new Date() ? row.lastCodeAt : null,
    decision: ['approved', 'reserves', 'changes'].includes(row.status)
      ? { status: row.status, at: row.decidedAt, name: row.signedName, title: row.signedTitle, company: row.signedCompany, comment: row.comment, signedPdf: !!row.signedFileUrl }
      : null,
    replacedBy,
  };
}

/** PDF envoyé (copie figée), pour la page publique. */
export async function publicPdf(token: string, which: 'original' | 'signed', meta: Meta) {
  const row = await byToken(token);
  if (!row) throw new AppError('Lien invalide.', 404);
  const status = L.publicStatus(row);
  if (which === 'signed') {
    if (!row.signedFileUrl) throw new AppError('Le PDF validé n’est pas (encore) disponible.', 404);
    const buf = await fetchBuffer(row.signedFileUrl);
    if (!(await recentEvent(row.id, 'downloaded', meta.ip, 30))) await logEvent(row.id, 'downloaded', meta);
    return { buffer: buf, fileName: L.validatedFileName(row.fileName, row.revision, row.status === 'reserves' ? 'reserves' : 'approved') };
  }
  if (status === 'cancelled' || status === 'superseded' || status === 'expired') throw new AppError('Ce lien n’est plus valable.', 410);
  const buf = await fetchBuffer(row.fileUrl);
  if (status === 'pending' && !(await recentEvent(row.id, 'viewed', meta.ip, 30))) await logEvent(row.id, 'viewed', meta);
  return { buffer: buf, fileName: row.fileName };
}

function codeMail(a: any, project: any, code: string) {
  const en = a.lang === 'en';
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
  const subject = en ? `Your approval code: ${code}` : `Votre code de validation : ${code}`;
  const content = en
    ? `<p>Here is your code to sign the plans of the project <strong>${h(project?.name || '')}</strong> (Rev. ${h(a.revision)}):</p>
       <p style="text-align:center;font-size:32px;font-weight:900;letter-spacing:6px;color:#1a1a2e;margin:18px 0;">${spaced}</p>
       <p>It is valid for ${L.CODE_MINUTES} minutes. If you did not request this code, just ignore this e-mail.</p>`
    : `<p>Voici votre code pour signer les plans du projet <strong>${h(project?.name || '')}</strong> (Rév. ${h(a.revision)}) :</p>
       <p style="text-align:center;font-size:32px;font-weight:900;letter-spacing:6px;color:#1a1a2e;margin:18px 0;">${spaced}</p>
       <p>Il est valable ${L.CODE_MINUTES} minutes. Si vous n’avez pas demandé ce code, ignorez simplement ce message.</p>`;
  return { subject: `${subject} [${a.ref}]`, html: emailShell(en ? 'Verification code' : 'Code de vérification', content) };
}

const PUB = {
  fr: {
    closed: 'Ce lien n’est plus valable.', wait: (s: number) => `Un code vient d’être envoyé : attendez ${s} s avant d’en demander un autre.`,
    tooMany: 'Trop de codes demandés pour ce lien : contactez Viewbox pour recevoir un nouveau lien.',
    mailFail: 'Le code n’a pas pu être envoyé. Réessayez dans un instant.', noCode: 'Demandez d’abord le code par e-mail.',
    expired: 'Code expiré : demandez un nouveau code.', locked: 'Trop d’essais : demandez un nouveau code.',
    wrong: (n: number) => `Code incorrect (encore ${n} essai${n > 1 ? 's' : ''}).`, done: 'Ces plans ont déjà reçu une réponse.',
  },
  en: {
    closed: 'This link is no longer valid.', wait: (s: number) => `A code was just sent: please wait ${s} s before asking for another one.`,
    tooMany: 'Too many codes requested for this link: please contact Viewbox to receive a new link.',
    mailFail: 'The code could not be sent. Please try again in a moment.', noCode: 'Please ask for the code by e-mail first.',
    expired: 'Code expired: please ask for a new code.', locked: 'Too many attempts: please ask for a new code.',
    wrong: (n: number) => `Wrong code (${n} attempt${n > 1 ? 's' : ''} left).`, done: 'These plans have already been answered.',
  },
};

export async function sendCode(token: string, meta: Meta) {
  const row = await byToken(token);
  if (!row) throw new AppError('Lien invalide.', 404);
  const m = PUB[row.lang === 'en' ? 'en' : 'fr'];
  if (L.publicStatus(row) !== 'pending') throw new AppError(m.closed, 410);
  if (row.lastCodeAt) {
    const wait = L.CODE_RESEND_SECONDS - Math.floor((Date.now() - new Date(row.lastCodeAt).getTime()) / 1000);
    if (wait > 0) throw new AppError(m.wait(wait), 429);
  }
  if (row.codesSent >= L.CODE_MAX_SENDS) throw new AppError(m.tooMany, 429);
  const code = L.newCode();
  const now = new Date();
  await db.planApproval.update({
    where: { id: row.id },
    data: {
      codeHash: L.hashCode(row.id, code), codeExpiresAt: new Date(now.getTime() + L.CODE_MINUTES * 60_000),
      codeAttempts: 0, codesSent: { increment: 1 }, lastCodeAt: now,
    },
  });
  const project = await prisma.project.findUnique({ where: { id: row.projectId }, select: { name: true } });
  try {
    const { subject, html } = codeMail(row, project, code);
    await sendMail({ to: row.signerEmail, subject, html });
  } catch (e: any) {
    await db.planApproval.update({ where: { id: row.id }, data: { lastCodeAt: null } });
    await logEvent(row.id, 'mail_failed', { ...meta, detail: `code : ${e.message || e}` });
    throw new AppError(m.mailFail, 502);
  }
  await logEvent(row.id, 'code_sent', { ...meta, detail: L.maskEmail(row.signerEmail) });
  return { sentTo: L.maskEmail(row.signerEmail), minutes: L.CODE_MINUTES };
}

export async function sign(token: string, body: any, meta: Meta) {
  const row = await byToken(token);
  if (!row) throw new AppError('Lien invalide.', 404);
  const lang: L.Lang = row.lang === 'en' ? 'en' : 'fr';
  const m = PUB[lang];
  const st = L.publicStatus(row);
  if (st !== 'pending') throw new AppError(['approved', 'reserves', 'changes'].includes(st) ? m.done : m.closed, 409);
  const chk = L.checkSignInput(body, lang);
  if (chk.ok === false) throw new AppError((chk as { error: string }).error, 400);
  const input = (chk as { input: L.SignInput }).input;

  if (!row.codeHash || !row.codeExpiresAt) throw new AppError(m.noCode, 400);
  if (new Date(row.codeExpiresAt).getTime() < Date.now()) throw new AppError(m.expired, 400);
  const hash = L.hashCode(row.id, input.code);
  if (!L.sameHash(row.codeHash, hash)) {
    const attempts = row.codeAttempts + 1;
    const locked = attempts >= L.CODE_MAX_ATTEMPTS;
    await db.planApproval.update({ where: { id: row.id }, data: { codeAttempts: attempts, ...(locked ? { codeHash: null, codeExpiresAt: null } : {}) } });
    await logEvent(row.id, 'code_failed', { ...meta, detail: `${attempts}/${L.CODE_MAX_ATTEMPTS}` });
    throw new AppError(locked ? m.locked : m.wrong(L.CODE_MAX_ATTEMPTS - attempts), 400);
  }

  const now = new Date();
  const res = await db.planApproval.updateMany({
    where: { id: row.id, status: 'pending', codeHash: hash },
    data: {
      status: input.decision, decidedAt: now,
      signedName: input.name, signedTitle: input.title, signedCompany: input.company,
      comment: input.comment, signatureImage: input.signature,
      signedIp: meta.ip ? String(meta.ip).slice(0, 80) : null, signedUserAgent: meta.userAgent ? String(meta.userAgent).slice(0, 400) : null,
      codeHash: null, codeExpiresAt: null,
    },
  });
  if (res.count !== 1) throw new AppError(m.done, 409);
  await logEvent(row.id, input.decision, { ...meta, detail: [input.name, input.title, input.company].filter(Boolean).join(' · ') });

  // PDF validé avant de répondre (le client peut le télécharger tout de suite) ; e-mails ensuite, en arrière-plan
  let signedPdf = false;
  if (input.decision !== 'changes') signedPdf = !!(await makeSignedPdf(row.id));
  finishNotifications(row.id).catch((e) => logger.error(`[plan-approval] notifications ${row.ref} : ${e.message || e}`));
  emitProject(row.projectId);
  return { status: input.decision, signedPdf };
}

// ─── après la décision ─────────────────────────────────────────────────────

/** Cachet + filigrane + certificat → Fichiers du projet. Renvoie { url, fileId } ou null (noté au journal). */
export async function makeSignedPdf(id: string): Promise<{ url: string; fileId: string } | null> {
  const a = await db.planApproval.findUnique({ where: { id }, include: { events: { orderBy: { at: 'asc' } } } });
  if (!a || (a.status !== 'approved' && a.status !== 'reserves')) return null;
  try {
    const project = await prisma.project.findUnique({ where: { id: a.projectId }, select: { name: true, internalNumber: true, address: true, city: true } });
    const creator = a.createdById ? await prisma.user.findUnique({ where: { id: a.createdById }, select: { firstName: true, lastName: true } }) : null;
    const original = await fetchBuffer(a.fileUrl);
    const sha = L.sha256(original);
    if (sha !== a.fileSha256) throw new Error('le PDF conservé ne correspond plus à l’empreinte du document envoyé');
    const decision = a.status as 'approved' | 'reserves';
    const stamped = await stampApprovedPdf(original, {
      lang: a.lang === 'en' ? 'en' : 'fr', decision, decidedAt: a.decidedAt,
      signerName: a.signedName || a.signerName, signerTitle: a.signedTitle, signerCompany: a.signedCompany, signerEmail: a.signerEmail,
      comment: a.comment, signatureImage: a.signatureImage, ip: a.signedIp, userAgent: a.signedUserAgent,
      ref: a.ref, revision: a.revision,
      projectName: project?.name || '', projectNumber: project?.internalNumber, projectAddress: [project?.address, project?.city].filter(Boolean).join(', '),
      fileName: a.fileName, fileSha256: a.fileSha256, pageCount: a.pageCount,
      sentAt: a.createdAt, sentBy: personName(creator) || null,
      events: a.events.filter((e: any) => e.kind !== 'stamped' && e.kind !== 'stamp_failed' && e.kind !== 'mailed' && e.kind !== 'mail_failed' && e.kind !== 'downloaded')
        .map((e: any) => ({ at: e.at, kind: e.kind, ip: e.ip, detail: e.kind === 'sent' || e.kind === 'resent' ? L.maskEmail(String(e.detail || '')) : (e.kind === 'created' || e.kind === 'code_sent' ? null : e.detail) })),
    });
    const fileName = L.validatedFileName(a.fileName, a.revision, decision);
    const up = await uploadToCloudinary(stamped, `projects/${a.projectId}/plans`, {
      resource_type: 'raw', public_id: `${safeId(fileName)}-${Date.now()}.pdf`,
    }, { name: fileName, mime: 'application/pdf' });
    const file = await prisma.projectFile.create({
      data: { projectId: a.projectId, uploadedBy: a.createdById || null, fileName, fileUrl: up.url, publicId: up.publicId, fileType: 'application/pdf', fileSize: stamped.length, category: 'plans' },
    });
    await db.planApproval.update({ where: { id }, data: { signedFileUrl: up.url, signedFileId: file.id, signedSha256: L.sha256(stamped) } });
    await logEvent(id, 'stamped', { detail: `${fileName} · ${(stamped.length / MB).toFixed(1).replace('.', ',')} Mo` });
    return { url: up.url, fileId: file.id };
  } catch (e: any) {
    logger.error(`[plan-approval] PDF validé ${a.ref} : ${e.message || e}`);
    await logEvent(id, 'stamp_failed', { detail: String(e.message || e).slice(0, 300) });
    return null;
  }
}

async function teamEmails(projectId: string, extraUserIds: Array<string | null | undefined>): Promise<string[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      team: { include: { user: { select: { email: true, isActive: true } } } },
      technicalManager: { select: { email: true, isActive: true } },
      createdBy: { select: { email: true, isActive: true } },
    },
  });
  const users = [
    ...(project?.team || []).map((m: any) => m.user),
    project?.technicalManager, project?.createdBy,
  ];
  const extra = await prisma.user.findMany({ where: { id: { in: extraUserIds.filter(Boolean) as string[] } }, select: { email: true, isActive: true } });
  const out: string[] = [];
  for (const u of [...users, ...extra]) {
    const e = u && u.isActive !== false ? L.cleanEmail(u.email) : null;
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

function resultMail(a: any, project: any, lang: L.Lang, attach: boolean, link: string | null) {
  const en = lang === 'en';
  const at = brusselsDateTime(a.decidedAt, lang);
  const who = [a.signedName || a.signerName, [a.signedTitle, a.signedCompany].filter(Boolean).join(', ')].filter(Boolean);
  const whoTxt = who.length > 1 ? `${who[0]} (${who[1]})` : who[0];
  const state = a.status;
  const subject = en
    ? (state === 'approved' ? `✅ Plans approved — ${project.name} (Rev. ${a.revision})` : state === 'reserves' ? `🟠 Plans approved with reservations — ${project.name} (Rev. ${a.revision})` : `❌ Changes requested — ${project.name} (Rev. ${a.revision})`)
    : (state === 'approved' ? `✅ Plans validés — ${project.name} (Rév. ${a.revision})` : state === 'reserves' ? `🟠 Plans validés avec réserves — ${project.name} (Rév. ${a.revision})` : `❌ Modifications demandées — ${project.name} (Rév. ${a.revision})`);
  const lead = en
    ? (state === 'changes' ? `<strong>${h(whoTxt)}</strong> has requested changes to the plans of the project <strong>${h(project.name)}</strong> on ${at.d} at ${at.h}.`
      : `<strong>${h(whoTxt)}</strong> has approved the plans of the project <strong>${h(project.name)}</strong>${state === 'reserves' ? ' <strong>with reservations</strong>' : ''} on ${at.d} at ${at.h}.`)
    : (state === 'changes' ? `<strong>${h(whoTxt)}</strong> a demandé des modifications aux plans du projet <strong>${h(project.name)}</strong> le ${at.d} à ${at.h}.`
      : `<strong>${h(whoTxt)}</strong> a validé les plans du projet <strong>${h(project.name)}</strong>${state === 'reserves' ? ' <strong>avec réserves</strong>' : ''} le ${at.d} à ${at.h}.`);
  const commentTitle = en ? (state === 'changes' ? 'Changes requested' : 'Reservations') : (state === 'changes' ? 'Modifications demandées' : 'Réserves');
  const pdfLine = state === 'changes' ? (en ? 'A new revision of the plans will follow.' : 'Une nouvelle révision des plans doit être envoyée.')
    : attach ? (en ? 'The approved PDF (stamp on every page + approval certificate) is attached.' : 'Le PDF validé (cachet sur chaque page + certificat de validation) est en pièce jointe.')
      : link ? (en ? 'Download the approved PDF (stamp on every page + approval certificate):' : 'Télécharger le PDF validé (cachet sur chaque page + certificat de validation) :')
        : (en ? 'The approved PDF is being prepared.' : 'Le PDF validé est en cours de préparation (voir VEM › projet › Fichiers).');
  const content = `
    <p>${lead}</p>
    ${a.comment ? `<p style="white-space:pre-wrap;background:${state === 'changes' ? '#fef3f2;border-left:4px solid #e63946' : '#fff7ed;border-left:4px solid #f4a261'};padding:10px 12px;border-radius:6px;"><strong>${h(commentTitle)} :</strong><br>${nl(a.comment)}</p>` : ''}
    ${infoRows(en
      ? [['Project', `${project.name}${project.internalNumber ? ` (${project.internalNumber})` : ''}`], ['Revision', a.revision], ['Document', a.fileName], ['Reference', a.ref], ['E-mail verified', a.signerEmail]]
      : [['Projet', `${project.name}${project.internalNumber ? ` (${project.internalNumber})` : ''}`], ['Révision', a.revision], ['Document', a.fileName], ['Référence', a.ref], ['E-mail vérifié', a.signerEmail]])}
    <p>${pdfLine}</p>
    ${!attach && link && state !== 'changes' ? `<p style="text-align:center;"><a class="btn" href="${h(link)}">${en ? 'Approved PDF' : 'PDF validé'}</a></p>` : ''}`;
  const title = en ? (state === 'changes' ? 'Changes requested' : 'Plans approved') : (state === 'changes' ? 'Modifications demandées' : 'Plans validés');
  return { subject: `${subject} [${a.ref}]`, html: emailShell(title, content) };
}

/** E-mails après la décision (équipe en français, signataire + copies dans la langue du lien) + notification. */
async function finishNotifications(id: string) {
  const a = await db.planApproval.findUnique({ where: { id } });
  if (!a) return;
  const project = await prisma.project.findUnique({ where: { id: a.projectId }, select: { name: true, internalNumber: true } });
  const team = (await teamEmails(a.projectId, [a.createdById])).filter((e) => e !== a.signerEmail && !(a.ccEmails || []).includes(e));
  const client = [a.signerEmail, ...((a.ccEmails as string[]) || [])];
  let pdf: Buffer | null = null;
  if (a.signedFileUrl) {
    try { pdf = await fetchBuffer(a.signedFileUrl); } catch { pdf = null; }
  }
  const fileName = L.validatedFileName(a.fileName, a.revision, a.status === 'reserves' ? 'reserves' : 'approved');
  const publicSigned = a.signedFileUrl ? `${appUrl()}/api/v1/public/plan-approval/${a.token}/signed.pdf` : null;
  const lang: L.Lang = a.lang === 'en' ? 'en' : 'fr';
  const groups: Array<{ to: string[]; lang: L.Lang; label: string }> = lang === 'fr'
    ? [{ to: [...client, ...team], lang: 'fr', label: `${client.length + team.length} destinataire(s)` }]
    : [{ to: team, lang: 'fr', label: `équipe (${team.length})` }, { to: client, lang: 'en', label: `client (${client.length})` }];
  for (const g of groups) {
    if (!g.to.length) continue;
    const canAttach = !!pdf && pdf.length <= L.MAIL_ATTACH_MAX_BYTES;
    const send = async (attach: boolean) => {
      const { subject, html } = resultMail(a, project, g.lang, attach, publicSigned);
      await sendMail({
        to: g.to, subject, html,
        attachments: attach && pdf ? [{ filename: fileName, content: pdf, contentType: 'application/pdf' }] : undefined,
      });
    };
    try {
      try { await send(canAttach); } catch (e) { if (!canAttach) throw e; await send(false); } // pièce jointe refusée : lien
      await logEvent(id, 'mailed', { detail: `${g.label} : ${g.to.join(', ')}` });
    } catch (e: any) {
      await logEvent(id, 'mail_failed', { detail: `${g.label} : ${e.message || e}` });
    }
  }
  if (a.createdById) {
    try {
      const label = EVENT_LABELS.fr[a.status] || a.status;
      await prisma.notification.create({
        data: {
          userId: a.createdById, type: 'plan_approval',
          title: `${a.status === 'changes' ? '❌' : a.status === 'reserves' ? '🟠' : '✅'} ${label} — ${project?.name || ''} (Rév. ${a.revision})`.slice(0, 200),
          body: `${a.signedName || a.signerName}${a.comment ? ` : ${a.comment}` : ''}`.slice(0, 1000),
          data: JSON.stringify({ projectId: a.projectId, approvalId: a.id }),
        },
      });
      emit(`user:${a.createdById}`, 'notification:new', { projectId: a.projectId });
    } catch (e: any) {
      logger.warn(`[plan-approval] notification non créée : ${e.message || e}`);
    }
  }
}

function emit(room: string, event: string, payload: any) {
  try {
    // import au moment de l'appel : index.ts importe les routes (pas de cycle au chargement)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { io } = require('../index');
    io?.to(room).emit(event, payload);
  } catch { /* temps réel indisponible : sans conséquence */ }
}
function emitProject(projectId: string) {
  emit(`project:${projectId}`, 'plan-approval:update', { projectId });
}
