// VEM Chantier — test de bout en bout des routes, contre un serveur VEM lancé sur une base PostgreSQL JETABLE
// (jamais la base Railway). Données de démo : `npx ts-node --transpile-only prisma/seed.ts` + tests/mobile/fixtures.sql.
//   CHANTIER_TEST_DATABASE=1 BASE=http://localhost:3100 DATABASE_URL=… node tests/chantier.api.mjs
// Le test crée ses propres installateurs (téléphones +32 499 00 xx xx) et les retire à la fin.
import assert from 'node:assert/strict';
import pg from '../node_modules/@prisma/client/index.js';

if (process.env.CHANTIER_TEST_DATABASE !== '1') throw new Error('Base de test jetable requise (CHANTIER_TEST_DATABASE=1)');
const BASE = (process.env.BASE || 'http://localhost:3100').replace(/\/$/, '');
const API = BASE + '/api/v1';
const prisma = new pg.PrismaClient();

async function call(method, path, token, body) {
  const r = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, ...j };
}
const login = async (email) => (await call('POST', '/auth/login', null, { email, password: email === 'admin@vem.com' ? 'Admin@VEM2025!' : 'VEM2025!' })).data.token;
const ok = (r, what) => { assert.equal(r.success, true, `${what} : ${r.status} ${r.error || ''}`); return r.data; };
const step = (s) => console.log('✔', s);

const PHONE = '+32 499 00 11 22';
const PHONE2 = '0499/00.33.44';

// nettoyage d'un passage précédent
async function cleanup() {
  const users = (await prisma.user.findMany({ where: { phone: { in: [PHONE, PHONE2] } }, select: { id: true } })).map((u) => u.id);
  await prisma.siteTimesheet.deleteMany({ where: { filledById: { in: users } } });
  await prisma.chantierInvite.deleteMany({ where: { userId: { in: users } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
  await prisma.projectTeam.deleteMany({ where: { userId: { in: users } } });
  await prisma.dailyReportTaskHours.deleteMany({ where: { taskTitle: { startsWith: 'TEST CHANTIER' } } });
  await prisma.task.deleteMany({ where: { title: { startsWith: 'TEST CHANTIER' } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
}
await cleanup();

const audi = await prisma.project.findFirst({ where: { name: { startsWith: 'Salon Audi' } } });
const geneve = await prisma.project.findFirst({ where: { name: { startsWith: 'PAVGEVIE' } } });
assert.ok(audi && geneve, 'projets de démo absents (seed + fixtures)');
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

const admin = await login('admin@vem.com');
const tm = await login('amaury.pinchart@vem.com');
const engineer = await login('paul.morel@vem.com');
// le site manager jeremy.berrutto est dans l'équipe Audi
const sm = await prisma.user.findUnique({ where: { email: 'jeremy.berrutto@vem.com' } });
if (!(await prisma.projectTeam.findFirst({ where: { projectId: audi.id, userId: sm.id } })))
  await prisma.projectTeam.create({ data: { projectId: audi.id, userId: sm.id, role: 'site_manager' } });
const smToken = await login('jeremy.berrutto@vem.com');

// ── compteurs sur un modèle de tâche ─────────────────────────────────────────
let cat = await prisma.taskCategory.findFirst({ where: { name: 'TEST CHANTIER' } });
if (!cat) cat = await prisma.taskCategory.create({ data: { name: 'TEST CHANTIER' } });
let tpl = await prisma.taskTemplate.findFirst({ where: { title: 'TEST CHANTIER Construction Viewbox' } });
if (!tpl) tpl = ok(await call('POST', '/task-templates', admin, { categoryId: cat.id, title: 'TEST CHANTIER Construction Viewbox', phase: 'installation', quantityFields: [{ label: { fr: 'Viewbox', pl: 'Viewbox' } }] }), 'modèle');
const patched = ok(await call('PATCH', `/task-templates/${tpl.id}`, admin, { quantityFields: [{ label: { fr: 'Viewbox', en: 'Viewbox', pl: 'Viewbox' }, unit: '' }, { label: 'Vitres' }, { label: { fr: '' } }] }), 'compteurs');
assert.deepEqual(patched.quantityFields.map((f) => f.key), ['viewbox', 'vitres']);
step('compteurs du modèle de tâche nettoyés (libellé FR obligatoire, clé unique)');

// ── invitation ───────────────────────────────────────────────────────────────
let r = await call('POST', `/chantier/office/projects/${audi.id}/installers`, engineer, { firstName: 'Piotr', lastName: 'Test', phone: PHONE });
assert.equal(r.status, 403, 'un engineer ne peut pas inviter');
const inv = ok(await call('POST', `/chantier/office/projects/${audi.id}/installers`, tm, { firstName: 'Piotr', lastName: 'Test', phone: PHONE, lang: 'pl', crewLead: true }), 'invitation');
assert.match(inv.link, /\/chantier\?i=/);
const token1 = inv.link.split('i=')[1];
step('technical manager invite un chef d’équipe (lien ' + inv.link.replace(/i=.*/, 'i=…') + ')');

ok(await call('GET', `/public/chantier/invite/${token1}`), 'lecture invitation');
r = await call('POST', `/public/chantier/invite/${token1}`, null, { pin: '1234', lang: 'pl' });
assert.equal(r.error, 'PIN_WEAK');
const s1 = ok(await call('POST', `/public/chantier/invite/${token1}`, null, { pin: '2580', lang: 'pl' }), 'code');
assert.equal(s1.user.lang, 'pl');
r = await call('POST', `/public/chantier/invite/${token1}`, null, { pin: '2580' });
assert.equal(r.status, 410, 'lien à usage unique');
step('code à 4 chiffres choisi, lien à usage unique, codes trop simples refusés');

// connexion téléphone + code (autre écriture du même numéro)
r = await call('POST', '/public/chantier/login', null, { phone: '0499001122', pin: '0000' });
assert.equal(r.status, 401);
const s2 = ok(await call('POST', '/public/chantier/login', null, { phone: '0032499001122', pin: '2580' }), 'connexion');
const inst = s2.token;
ok(await call('POST', '/auth/refresh', null, { refreshToken: s2.refreshToken }), 'rafraîchissement');
const rt = await prisma.refreshToken.findUnique({ where: { token: s2.refreshToken } });
assert.ok(rt.expiresAt.getTime() - Date.now() > 80 * 86400000, 'session ≈ 90 jours');
step('connexion téléphone + code, session de 90 jours');

// ── accès dans le temps ──────────────────────────────────────────────────────
const geneveMember = await prisma.projectTeam.create({ data: { projectId: geneve.id, userId: s1.user.id, role: 'installer' } });
let projects = ok(await call('GET', '/chantier/projects', inst), 'projets');
assert.deepEqual(projects.map((p) => p.id), [audi.id], 'Genève (installation dans > 14 jours) pas encore visible');
r = await call('GET', `/projects/${geneve.id}`, inst);
assert.equal(r.status, 403, 'l’API VEM applique aussi la période');
ok(await call('PATCH', `/chantier/office/projects/${geneve.id}/members/${geneveMember.id}`, tm, { accessUntil: '2099-01-01' }), 'redonner l’accès');
projects = ok(await call('GET', '/chantier/projects', inst), 'projets');
assert.ok(projects.some((p) => p.id === geneve.id), 'accès prolongé');
ok(await call('PATCH', `/chantier/office/projects/${geneve.id}/members/${geneveMember.id}`, tm, { accessUntil: null }), 'retirer la prolongation');
projects = ok(await call('GET', '/chantier/projects', inst), 'projets');
assert.ok(!projects.some((p) => p.id === geneve.id));
assert.equal(projects[0].canFill, true);
step('période d’accès (J−14 / J+14) appliquée à l’app et à l’API, « redonner l’accès » fonctionne');

// ── page du projet + fichiers ────────────────────────────────────────────────
const f1 = await prisma.projectFile.create({ data: { projectId: audi.id, fileName: 'Plans_Rev-B_VALIDE.pdf', fileUrl: 'https://example.com/a.pdf', category: 'plans' } });
const f2 = await prisma.projectFile.create({ data: { projectId: audi.id, fileName: 'devis-interne.pdf', fileUrl: 'https://example.com/b.pdf', category: 'general' } });
let files = ok(await call('GET', `/chantier/projects/${audi.id}/files?section=plans`, inst), 'plans');
assert.ok(files.some((f) => f.id === f1.id) && !files.some((f) => f.id === f2.id), 'plans validés visibles d’office, devis caché');
r = await call('PATCH', `/chantier/office/files/${f2.id}`, inst, { siteSection: 'plans' });
assert.equal(r.status, 403, 'l’installateur ne choisit pas les fichiers');
ok(await call('PATCH', `/chantier/office/files/${f2.id}`, smToken, { siteSection: 'briefing' }), 'fichier → briefing');
files = ok(await call('GET', `/chantier/projects/${audi.id}/files?section=briefing`, inst), 'briefing');
assert.ok(files.some((f) => f.id === f2.id));
const detail = ok(await call('GET', `/chantier/projects/${audi.id}`, inst), 'détail');
assert.ok(detail.contacts.some((c) => c.kind === 'site_manager'));
assert.ok(detail.counts.plans >= 1);
step('fichiers choisis par le bureau (plans validés d’office), infos + contacts');

// ── feuille de temps ─────────────────────────────────────────────────────────
const tasks = ok(await call('GET', `/chantier/projects/${audi.id}/tasks?date=${today}`, inst), 'tâches');
const t = tasks.templates.find((x) => x.id === tpl.id);
assert.ok(t && t.quantityFields.length === 2, 'compteurs proposés');
const day = ok(await call('GET', `/chantier/projects/${audi.id}/timesheets/${today}`, inst), 'jour');
assert.equal(day.sheet, null);
const lines = [
  { id: 'l1', taskTemplateId: tpl.id, title: tpl.title, hours: 7.6, workers: 4, quantities: [{ key: 'viewbox', label: 'Viewbox', qty: 6 }, { key: 'vitres', label: 'Vitres', qty: 0 }], comment: 'Zrobione', commentLang: 'pl' },
  { id: 'l2', title: 'TEST CHANTIER déchargement camion', hours: 1, workers: 3, done: true },
];
let sheet = ok(await call('PUT', `/chantier/projects/${audi.id}/timesheets/${today}`, inst, { present: day.crew.slice(0, 1).concat([{ name: 'Intérimaire X' }]), lines }), 'brouillon');
assert.equal(sheet.status, 'draft');
assert.equal(sheet.lines[0].hours, 7.5, 'durée au quart d’heure');
r = await call('PUT', `/chantier/projects/${audi.id}/timesheets/2099-01-01`, inst, { lines });
assert.equal(r.error, 'FUTURE_DATE');
sheet = ok(await call('PUT', `/chantier/projects/${audi.id}/timesheets/${today}`, inst, { present: sheet.present, lines: sheet.lines, submit: true }), 'envoi');
assert.equal(sheet.status, 'submitted');
assert.equal(sheet.totals.manHours, 33);
const notif = await prisma.notification.findFirst({ where: { userId: sm.id, type: 'site_timesheet' }, orderBy: { createdAt: 'desc' } });
assert.ok(notif, 'le site manager est prévenu');
step('feuille remplie (2 tâches, quantités, intérimaire non inscrit) et envoyée ; site manager prévenu');

// ── validation par le niveau au-dessus ───────────────────────────────────────
let list = ok(await call('GET', `/chantier/office/projects/${audi.id}/timesheets`, smToken), 'liste bureau');
const mine = list.find((x) => x.id === sheet.id);
assert.equal(mine.canValidate, true, 'site manager valide la feuille du chef d’équipe');
r = await call('POST', `/chantier/office/timesheets/${sheet.id}/validate`, engineer, {});
assert.equal(r.status, 403, 'un engineer ne valide pas');
r = await call('POST', `/chantier/office/timesheets/${sheet.id}/return`, smToken, { comment: '' });
assert.equal(r.status, 400);
ok(await call('POST', `/chantier/office/timesheets/${sheet.id}/return`, smToken, { comment: 'Il manque les vitres' }), 'renvoi');
projects = ok(await call('GET', '/chantier/projects', inst), 'projets');
assert.equal(projects.find((p) => p.id === audi.id).toFix, true);
const back = ok(await call('GET', `/chantier/projects/${audi.id}/timesheets/${today}`, inst), 'feuille renvoyée');
assert.equal(back.sheet.returnComment, 'Il manque les vitres');
const fixed = back.sheet.lines.map((l) => (l.id === 'l1' ? { ...l, quantities: [{ key: 'viewbox', label: 'Viewbox', qty: 6 }, { key: 'vitres', label: 'Vitres', qty: 10 }] } : l));
ok(await call('PUT', `/chantier/projects/${audi.id}/timesheets/${today}`, inst, { present: back.sheet.present, lines: fixed, submit: true }), 'renvoi corrigé');
const corrected = fixed.map((l) => (l.id === 'l2' ? { ...l, hours: 1.5 } : l));
const v = ok(await call('POST', `/chantier/office/timesheets/${sheet.id}/validate`, smToken, { lines: corrected }), 'validation');
assert.equal(v.status, 'validated');
assert.ok(v.history.some((h) => h.action === 'corrected' && h.changes.some((c) => c.includes('1.5 h'))), 'correction tracée');
r = await call('POST', `/chantier/office/timesheets/${sheet.id}/validate`, smToken, {});
assert.equal(r.status, 409, 'une seule validation');
r = await call('PUT', `/chantier/projects/${audi.id}/timesheets/${today}`, inst, { lines: corrected });
assert.equal(r.error, 'ALREADY_VALIDATED');
step('renvoyée « à corriger », corrigée, validée par le site manager (correction tracée), plus modifiable');

// ── rapport journalier ───────────────────────────────────────────────────────
const report = await prisma.dailyReport.findUnique({ where: { id: v.dailyReportId }, include: { taskHours: true } });
const rows = report.taskHours.filter((h) => h.sourceTimesheetId === sheet.id);
assert.equal(rows.length, 2);
const vb = rows.find((h) => h.taskTemplateId === tpl.id);
assert.equal(vb.workers, 4);
assert.deepEqual(vb.quantities.map((q) => q.qty), [6, 10]);
assert.equal(rows.find((h) => h.taskTitle.includes('déchargement')).hours, 1.5);
const created = await prisma.task.findFirst({ where: { projectId: audi.id, title: 'TEST CHANTIER déchargement camion' } });
assert.equal(created?.source, 'chantier');
assert.equal(created?.status, 'done');
// rouvrir + revalider : les lignes du rapport sont remplacées, pas doublées, la tâche n'est pas recréée
ok(await call('POST', `/chantier/office/timesheets/${sheet.id}/reopen`, tm), 'rouvrir');
ok(await call('POST', `/chantier/office/timesheets/${sheet.id}/validate`, tm, {}), 'revalidation');
const again = await prisma.dailyReportTaskHours.count({ where: { sourceTimesheetId: sheet.id } });
assert.equal(again, 2);
assert.equal(await prisma.task.count({ where: { projectId: audi.id, title: 'TEST CHANTIER déchargement camion' } }), 1);
// une modification du rapport dans VEM garde les quantités et l'origine
const full = ok(await call('GET', `/daily-reports/${report.id}`, smToken), 'rapport');
ok(await call('PATCH', `/daily-reports/${report.id}`, smToken, { taskHours: full.taskHours }), 'modif rapport');
const kept = await prisma.dailyReportTaskHours.findFirst({ where: { reportId: report.id, taskTemplateId: tpl.id } });
assert.deepEqual(kept.quantities.map((q) => q.qty), [6, 10]);
assert.equal(kept.sourceTimesheetId, sheet.id);
step('repris dans le rapport journalier du jour (heures, gars, quantités), tâche créée une fois, revalidation sans doublon');

// ── feuille d'un site manager : validée par technical manager / sales, jamais par lui-même ─────────────────────
const smSheet = ok(await call('PUT', `/chantier/projects/${audi.id}/timesheets/${today}`, smToken, { lines: [{ id: 'x', title: 'TEST CHANTIER coordination', hours: 2, workers: 1 }], submit: true }), 'feuille SM');
list = ok(await call('GET', `/chantier/office/projects/${audi.id}/timesheets`, smToken), 'liste');
assert.equal(list.find((x) => x.id === smSheet.id).canValidate, false, 'pas sa propre feuille');
list = ok(await call('GET', `/chantier/office/projects/${audi.id}/timesheets`, tm), 'liste TM');
assert.equal(list.find((x) => x.id === smSheet.id).canValidate, true);
assert.equal(list.find((x) => x.id === smSheet.id).filledRole, 'site_manager');
await prisma.siteTimesheet.delete({ where: { id: smSheet.id } });
step('feuille d’un site manager : validée par le technical manager, pas par lui-même');

// ── un installateur non chef d'équipe : Infos / Plans / Briefing seulement ───
const inv2 = ok(await call('POST', `/chantier/office/projects/${audi.id}/installers`, admin, { firstName: 'Jan', lastName: 'Test', phone: PHONE2, lang: 'nl' }), 'invitation 2');
const s3 = ok(await call('POST', `/public/chantier/invite/${inv2.link.split('i=')[1]}`, null, { pin: '7391', lang: 'nl' }), 'code 2');
projects = ok(await call('GET', '/chantier/projects', s3.token), 'projets 2');
assert.equal(projects[0].canFill, false);
r = await call('GET', `/chantier/projects/${audi.id}/timesheets`, s3.token);
assert.equal(r.error, 'NOT_CREW_LEAD');
const office = ok(await call('GET', `/chantier/office/projects/${audi.id}`, tm), 'équipe');
const jan = office.members.find((m) => m.name === 'Jan Test');
assert.equal(jan.pinSet, true);
assert.equal(jan.email, null, 'adresse interne cachée');
ok(await call('PATCH', `/chantier/office/projects/${audi.id}/members/${jan.memberId}`, tm, { crewLead: true }), 'chef d’équipe');
projects = ok(await call('GET', '/chantier/projects', s3.token), 'projets 2');
assert.equal(projects[0].canFill, true);
// nouveau lien = nouveau code ; l'ancien lien non utilisé est annulé
const l1 = ok(await call('POST', `/chantier/office/projects/${audi.id}/members/${jan.memberId}/link`, tm), 'lien');
const l2 = ok(await call('POST', `/chantier/office/projects/${audi.id}/members/${jan.memberId}/link`, tm), 'lien 2');
r = await call('GET', `/public/chantier/invite/${l1.link.split('i=')[1]}`);
assert.equal(r.status, 410);
ok(await call('GET', `/public/chantier/invite/${l2.link.split('i=')[1]}`), 'dernier lien valable');
// blocage après 5 codes faux
for (let i = 0; i < 5; i++) await call('POST', '/public/chantier/login', null, { phone: PHONE2, pin: '1000' });
r = await call('POST', '/public/chantier/login', null, { phone: PHONE2, pin: '7391' });
assert.ok(r.status === 429, `bloqué après 5 essais (${r.status} ${r.error})`);
step('installateur simple sans feuille de temps, chef d’équipe désigné, nouveau lien, blocage après 5 codes faux');

await prisma.projectFile.deleteMany({ where: { id: { in: [f1.id, f2.id] } } });
await cleanup();
await prisma.$disconnect();
console.log('\nVEM Chantier : tout est bon.');
