// Test de bout en bout de la validation des plans par le client, sur une base PostgreSQL JETABLE.
// Cloudinary et l'envoi d'e-mails sont remplacés par des doublures en mémoire ; tout le reste est le vrai code
// (dist/ : faire `npm run build` avant). Lancer :
//   PLAN_APPROVAL_TEST_DATABASE=1 DATABASE_URL=postgresql://…/base_jetable npx prisma db push --skip-generate
//   PLAN_APPROVAL_TEST_DATABASE=1 DATABASE_URL=postgresql://…/base_jetable node tests/planApproval.postgres.cjs
// PLAN_APPROVAL_OUT=dossier garde le PDF validé et lance le serveur jusqu'à Ctrl+C (PLAN_APPROVAL_SERVE=1).
if (process.env.PLAN_APPROVAL_TEST_DATABASE !== '1') throw new Error('Base de test jetable requise (PLAN_APPROVAL_TEST_DATABASE=1)');
process.env.GMAIL_APPS_SCRIPT_URL = 'http://mail.invalid';
process.env.GMAIL_APPS_SCRIPT_TOKEN = 'test';
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

// le temps réel charge dist/index.js à la demande (qui démarrerait tout VEM) : remplacé par un module vide
const indexPath = require.resolve('../dist/index.js');
require.cache[indexPath] = { id: indexPath, filename: indexPath, loaded: true, exports: { io: null } };
const cloud = require('../dist/services/cloudinaryService');
const mail = require('../dist/services/emailService');
const STORE = new Map();
const MAILS = [];
let BASE = '';
cloud.uploadToCloudinary = async (buf, folder, opts) => {
  const id = `${folder}/${opts.public_id || Date.now()}`.replace(/[^A-Za-z0-9/_.-]/g, '_');
  STORE.set(id, Buffer.from(buf));
  return { url: `${BASE}/files/${id}`, publicId: id };
};
let failMail = false;
mail.sendMail = async (o) => { if (failMail) throw new Error('relais en panne'); MAILS.push(o); return { messageId: 'test' }; };

const { prisma } = require('../dist/config/database');
const { runStartupMigrations } = require('../dist/utils/migrations');
const { accessFor } = require('../dist/middleware/access');
const { scopeGuard } = require('../dist/middleware/scopeGuard');
const { errorHandler } = require('../dist/middleware/errorHandler');
const routes = require('../dist/routes/planApprovals').default;
const publicRoutes = require('../dist/routes/publicPlanApproval').default;
const db = prisma;

async function plansPdf() {
  const pdf = await PDFDocument.create();
  pdf.setCreator('VEM · Plans Viewbox');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const MM = 72 / 25.4;
  for (let i = 1; i <= 3; i++) {
    const p = pdf.addPage([841 * MM, 594 * MM]);
    const top = (y) => 594 * MM - y * MM;
    p.drawRectangle({ x: 12.7 * MM, y: top(583.2), width: 696.1 * MM, height: 568.8 * MM, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
    p.drawRectangle({ x: 708 * MM, y: top(583.2), width: 106.4 * MM, height: 568.8 * MM, borderColor: rgb(0, 0, 0), borderWidth: 1.5 });
    p.drawText('Signature', { x: 713.6 * MM, y: top(524.5), size: 7, font });
    p.drawRectangle({ x: 712.7 * MM, y: top(554.6), width: 117.5 * MM, height: 28 * MM, borderColor: rgb(0, 0, 0), borderWidth: 0.5 });
    p.drawText(`A1.${i}`, { x: 742.9 * MM, y: top(570), size: 20, font });
    for (let k = 0; k < 4; k++) p.drawRectangle({ x: (80 + k * 150) * MM, y: top(400), width: 140 * MM, height: 60 * MM, borderColor: rgb(0, 0, 0), borderWidth: 2 });
    p.drawText(`Vue ${i} - Long side`, { x: 80 * MM, y: top(320), size: 40, font });
  }
  return Buffer.from(await pdf.save());
}

function req(method, url, body, headers = {}) {
  if (process.env.PA_DEBUG) console.log('→', method, url);
  return fetch(BASE + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
    .then(async (r) => ({ status: r.status, headers: r.headers, body: (r.headers.get('content-type') || '').includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) }));
}

(async () => {
  let server;
  try {
    // migrations idempotentes : tables recréées depuis rien, deux fois
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS plan_approval_events');
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS plan_approvals');
    await runStartupMigrations();
    await runStartupMigrations();

    const app = express();
    app.use(express.json({ limit: '5mb' }));
    app.get('/files/*', (r, s) => { const b = STORE.get(r.params[0]); if (!b) return s.status(404).end(); s.type('application/pdf').send(b); });
    app.use(async (r, _s, next) => {
      const id = r.get('x-user');
      if (id) {
        const u = await db.user.findUnique({ where: { id } });
        r.user = { id: u.id, email: u.email, role: String(u.role), firstName: u.firstName, lastName: u.lastName };
        r.access = accessFor(String(u.role), false, []);
      }
      next();
    });
    app.use('/api/v1/public/plan-approval', publicRoutes);
    app.use('/api/v1/plan-approvals', (r, _s, next) => (r.user ? next() : next(Object.assign(new Error('Non autorisé'), { statusCode: 401 }))), scopeGuard('planApprovals'), routes);
    app.get('/plan-approval/:token', (_r, s) => s.sendFile(path.join(__dirname, '..', 'public', 'plan-approval.html')));
    app.use(errorHandler);
    server = http.createServer(app).listen(Number(process.env.PORT) || 0);
    await new Promise((ok) => server.on('listening', ok));
    BASE = `http://localhost:${server.address().port}`;

    const stamp = Date.now();
    const client = await db.client.create({ data: { name: 'Client Test SA', email: `achat-${stamp}@client.test`, contactName: 'Jeanne Dupont' } });
    const mk = (role, first) => db.user.create({ data: { email: `${first.toLowerCase()}-${stamp}@viewbox.test`, passwordHash: 'x', firstName: first, lastName: 'Test', role } });
    const admin = await mk('admin', 'Amaury');
    const sales = await mk('sales_engineer', 'Sophie');
    const pm = await mk('project_manager', 'Paul');
    const sm = await mk('site_manager', 'Simon');
    const other = await mk('site_manager', 'Olivier');
    const project = await db.project.create({
      data: { name: 'Hoka Paris', internalNumber: `T-${stamp}`, clientId: client.id, address: 'Place de l’Opéra', city: 'Paris', installationStart: new Date(), installationEnd: new Date(), createdById: admin.id },
    });
    await db.projectTeam.create({ data: { projectId: project.id, userId: sm.id, role: 'site_manager' } });
    await db.projectTeam.create({ data: { projectId: project.id, userId: pm.id, role: 'project_manager' } });
    const pdf = await plansPdf();
    STORE.set('plans/original.pdf', pdf);
    const file = await db.projectFile.create({ data: { projectId: project.id, fileName: 'Plans Hoka.pdf', fileUrl: `${BASE}/files/plans/original.pdf`, fileType: 'application/pdf', fileSize: pdf.length, category: 'plans' } });
    const P = `/api/v1/plan-approvals/project/${project.id}`;

    // droits
    let r = await req('GET', P, null, { 'x-user': sm.id });
    assert.equal(r.status, 200); assert.equal(r.body.data.canSend, false); assert.equal(r.body.data.contacts.length, 0);
    r = await req('GET', P, null, { 'x-user': other.id });
    assert.equal(r.status, 403, 'site manager hors équipe refusé');
    r = await req('POST', P, { fileId: file.id, signerName: 'X', signerEmail: 'x@y.com' }, { 'x-user': pm.id });
    assert.equal(r.status, 403, 'project manager ne peut pas envoyer');
    r = await req('GET', P, null, { 'x-user': sales.id });
    assert.equal(r.body.data.canSend, true); assert.equal(r.body.data.nextRevision, 'A');
    assert.deepEqual(r.body.data.pdfFiles.map((f) => f.id), [file.id]);
    assert.equal(r.body.data.contacts[0].email, client.email);
    r = await req('POST', P, { fileId: file.id, signerName: 'Jeanne', signerEmail: 'pas-un-mail' }, { 'x-user': sales.id });
    assert.equal(r.status, 400);

    // envoi
    r = await req('POST', P, { fileId: file.id, signerName: 'Jeanne Dupont', signerEmail: client.email, lang: 'fr', message: 'Voici les plans', ccEmails: 'archi@cabinet.test' }, { 'x-user': sales.id });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const A = r.body.data;
    assert.equal(A.revision, 'A'); assert.equal(A.mailError, null);
    const invite = MAILS.pop();
    assert.equal(invite.to, client.email);
    assert.match(invite.subject, /Plans à valider — Hoka Paris \(Rév\. A\) \[VAL-/);
    assert.equal(invite.replyTo, sales.email);
    const token = invite.html.match(/plan-approval\/([A-Za-z0-9_-]+)/)[1];
    assert.ok(A.link.endsWith(token));
    const row = await db.planApproval.findUnique({ where: { id: A.id } });
    assert.equal(row.pageCount, 3);
    assert.equal(row.fileSha256, require('crypto').createHash('sha256').update(pdf).digest('hex'));

    // page publique
    const U = `/api/v1/public/plan-approval/${token}`;
    r = await req('GET', U, null, { 'user-agent': 'TestBrowser/1.0' });
    assert.equal(r.status, 200); assert.equal(r.body.data.status, 'pending'); assert.equal(r.body.data.signerEmail, 'a•••t@client.test'.replace('a•••t', `a•••${stamp % 10}`));
    await req('GET', U); // deuxième ouverture : pas de doublon au journal
    r = await req('GET', U + '/plans.pdf');
    assert.equal(r.status, 200); assert.ok(Buffer.compare(r.body, pdf) === 0, 'PDF envoyé identique');
    r = await req('GET', '/api/v1/public/plan-approval/' + 'x'.repeat(43));
    assert.equal(r.status, 404);

    const SIG = 'data:image/png;base64,' + Buffer.from(await (async () => { const d = await PDFDocument.create(); return d.save(); })()).toString('base64').slice(0, 0) + 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    r = await req('POST', U + '/sign', { decision: 'approved', name: 'Jeanne', signature: SIG, reviewed: true, code: '123456' });
    assert.equal(r.status, 400); assert.match(r.body.error, /Demandez d’abord le code/);
    r = await req('POST', U + '/code');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const codeMail = MAILS.pop();
    const code = codeMail.subject.match(/(\d{6})/)[1];
    assert.equal(codeMail.to, client.email);
    r = await req('POST', U + '/code');
    assert.equal(r.status, 429, 'pas deux codes en 45 s');
    r = await req('POST', U + '/sign', { decision: 'reserves', name: 'Jeanne', signature: SIG, reviewed: true, code });
    assert.equal(r.status, 400); assert.match(r.body.error, /réserves/);
    const wrong = code === '000000' ? '111111' : '000000';
    r = await req('POST', U + '/sign', { decision: 'approved', name: 'Jeanne', signature: SIG, reviewed: true, code: wrong });
    assert.equal(r.status, 400); assert.match(r.body.error, /Code incorrect \(encore 4 essais\)/);

    // signature avec réserves
    r = await req('POST', U + '/sign', {
      decision: 'reserves', comment: 'Planche A1.2 : la porte de VBX-02 doit être déplacée de 50 cm.', name: 'Jeanne Dupont', title: 'Cheffe de projet', company: 'Client Test SA',
      signature: SIG, reviewed: true, code,
    }, { 'user-agent': 'TestBrowser/1.0' });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.data.signedPdf, true);
    r = await req('POST', U + '/sign', { decision: 'approved', name: 'Jeanne', signature: SIG, reviewed: true, code });
    assert.equal(r.status, 409, 'on ne signe pas deux fois');
    await new Promise((ok) => setTimeout(ok, 300)); // e-mails envoyés en arrière-plan
    const signed = await db.planApproval.findUnique({ where: { id: A.id } });
    assert.equal(signed.status, 'reserves'); assert.equal(signed.signedName, 'Jeanne Dupont'); assert.ok(signed.signedIp);
    const pf = await db.projectFile.findUnique({ where: { id: signed.signedFileId } });
    assert.equal(pf.fileName, 'Plans Hoka_Rev-A_VALIDE-AVEC-RESERVES.pdf'); assert.equal(pf.category, 'plans');
    const out = await PDFDocument.load(STORE.get(pf.publicId));
    assert.equal(out.getPageCount(), 4, '3 planches + certificat');
    const result = MAILS.pop();
    assert.match(result.subject, /Plans validés avec réserves — Hoka Paris \(Rév\. A\)/);
    for (const e of [client.email, 'archi@cabinet.test', sm.email, pm.email, admin.email, sales.email]) assert.ok(result.to.includes(e), `${e} reçoit le PDF validé`);
    assert.equal(result.to.includes(other.email), false);
    assert.equal(result.attachments[0].filename, 'Plans Hoka_Rev-A_VALIDE-AVEC-RESERVES.pdf');
    assert.match(result.html, /porte de VBX-02/);
    r = await req('GET', U);
    assert.equal(r.body.data.decision.status, 'reserves'); assert.equal(r.body.data.decision.signedPdf, true);
    r = await req('GET', U + '/signed.pdf?download=1');
    assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /attachment/);
    const notif = await db.notification.findFirst({ where: { userId: sales.id, type: 'plan_approval' } });
    assert.match(notif.title, /Plans validés avec réserves/);

    // historique dans VEM
    r = await req('GET', P, null, { 'x-user': sm.id });
    const listed = r.body.data.approvals.find((x) => x.id === A.id);
    const kinds = listed.events.map((e) => e.kind);
    for (const k of ['created', 'sent', 'opened', 'viewed', 'code_sent', 'code_failed', 'reserves', 'stamped', 'mailed', 'downloaded']) assert.ok(kinds.includes(k), `journal : ${k}`);
    assert.equal(kinds.filter((k) => k === 'opened').length, 1, 'ouverture notée une fois');
    assert.equal(listed.link, null, 'pas de lien pour le site manager');
    assert.equal(r.body.data.nextRevision, 'B');

    // Rév. B remplacée par Rév. C ; puis modifications demandées sur C
    r = await req('POST', P, { fileId: file.id, signerName: 'Jeanne Dupont', signerEmail: client.email, lang: 'en' }, { 'x-user': admin.id });
    const B = r.body.data; MAILS.pop();
    const tokenB = B.link.split('/').pop();
    r = await req('POST', P, { fileId: file.id, signerName: 'John Smith', signerEmail: 'john@client.test', lang: 'en', replaceIds: [B.id] }, { 'x-user': admin.id });
    const C = r.body.data;
    assert.equal(C.revision, 'C');
    const inviteC = MAILS.pop();
    assert.match(inviteC.subject, /^Plans to approve — Hoka Paris \(Rev\. C\)/);
    r = await req('GET', `/api/v1/public/plan-approval/${tokenB}`);
    assert.equal(r.body.data.status, 'superseded'); assert.match(r.body.data.replacedBy, /C/);
    r = await req('POST', `/api/v1/public/plan-approval/${tokenB}/code`);
    assert.equal(r.status, 410);
    const tokenC = C.link.split('/').pop();
    await req('POST', `/api/v1/public/plan-approval/${tokenC}/code`);
    const codeC = MAILS.pop().subject.match(/(\d{6})/)[1];
    r = await req('POST', `/api/v1/public/plan-approval/${tokenC}/sign`, { decision: 'changes', comment: 'Move the stair to the north side', name: 'John Smith', code: codeC });
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.data.signedPdf, false);
    await new Promise((ok) => setTimeout(ok, 300));
    const team = MAILS.find((m) => /Modifications demandées/.test(m.subject));
    const cli = MAILS.find((m) => /Changes requested/.test(m.subject));
    assert.ok(team && cli, 'équipe en français, client en anglais');
    assert.equal(cli.to.includes(admin.email), false);
    assert.equal(team.attachments, undefined);

    // renvoi, annulation, e-mail en panne
    MAILS.length = 0;
    r = await req('POST', P, { fileId: file.id, signerName: 'Jeanne', signerEmail: client.email }, { 'x-user': admin.id });
    const D = r.body.data;
    r = await req('POST', `/api/v1/plan-approvals/${D.id}/resend`, null, { 'x-user': sm.id });
    assert.equal(r.status, 403);
    r = await req('POST', `/api/v1/plan-approvals/${D.id}/resend`, null, { 'x-user': admin.id });
    assert.equal(r.status, 200); assert.match(MAILS.pop().subject, /^Rappel : Plans à valider/);
    r = await req('POST', `/api/v1/plan-approvals/${D.id}/cancel`, null, { 'x-user': admin.id });
    assert.equal(r.status, 200);
    r = await req('GET', `/api/v1/public/plan-approval/${D.link.split('/').pop()}/plans.pdf`);
    assert.equal(r.status, 410);
    failMail = true;
    r = await req('POST', P, { fileId: file.id, signerName: 'Jeanne', signerEmail: client.email }, { 'x-user': admin.id });
    failMail = false;
    assert.equal(r.status, 201); assert.match(r.body.data.mailError, /relais en panne/);

    // lien expiré
    await db.planApproval.update({ where: { id: r.body.data.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    r = await req('GET', `/api/v1/public/plan-approval/${r.body.data.link.split('/').pop()}`);
    assert.equal(r.body.data.status, 'expired');

    if (process.env.PLAN_APPROVAL_OUT) {
      fs.mkdirSync(process.env.PLAN_APPROVAL_OUT, { recursive: true });
      fs.writeFileSync(path.join(process.env.PLAN_APPROVAL_OUT, 'valide.pdf'), STORE.get(pf.publicId));
      fs.writeFileSync(path.join(process.env.PLAN_APPROVAL_OUT, 'mail-resultat.html'), result.html);
      fs.writeFileSync(path.join(process.env.PLAN_APPROVAL_OUT, 'mail-invitation.html'), invite.html);
    }
    console.log('plan approvals: postgres end-to-end ok');
    if (process.env.PLAN_APPROVAL_SERVE === '1') {
      // page publique d'une nouvelle demande, pour la regarder dans un navigateur
      r = await req('POST', P, { fileId: file.id, signerName: 'Jeanne Dupont', signerEmail: client.email, message: 'Voici les plans mis à jour après notre réunion.' }, { 'x-user': admin.id });
      fs.writeFileSync(path.join(process.env.PLAN_APPROVAL_OUT || '.', 'serve.json'), JSON.stringify({ base: BASE, link: r.body.data.link.replace(/^https?:\/\/[^/]+/, BASE), projectId: project.id, admin: admin.id }));
      // dernier code envoyé (pour finir la signature dans le navigateur de test)
      app.get('/__test/code', (_r, s) => { const m = [...MAILS].reverse().find((x) => /\d{6}/.test(x.subject)); s.json({ code: m ? m.subject.match(/(\d{6})/)[1] : null }); });
      console.log('serving', BASE);
      return;
    }
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  } catch (e) {
    console.error(e);
    server?.close();
    process.exit(1);
  }
})();
