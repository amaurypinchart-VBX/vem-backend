// Contrôle téléphone / tablette de VEM (hors Plans Viewbox).
//
// Ouvre l'app comme sur 6 appareils (Chromium en émulation : iPhone 14, Pixel 7,
// petit Android 360 px, iPad portrait / paysage, ordinateur), visite chaque page,
// chaque onglet du projet et les principales fenêtres, et mesure :
//   - le débordement horizontal (page plus large que l'écran),
//   - les éléments qui dépassent à droite (les plus hauts dans l'arbre),
//   - les boutons d'action (Sauvegarder, Envoyer…) cachés par un autre élément
//     une fois la fenêtre défilée tout en bas (barre du bas, bouton 🤖…),
//   - les cibles tactiles de moins de 32 px.
// Écrit tests/mobile/out/report.json + une capture par écran (out/ est ignoré par git).
//
// Usage (serveur lancé sur une base jetable, voir tests/mobile/README.md) :
//   node tests/mobile/audit.mjs                       # tous les appareils
//   node tests/mobile/audit.mjs iphone14,ipad-portrait
//   BASE=http://localhost:3000 VEM_EMAIL=… VEM_PASSWORD=… node tests/mobile/audit.mjs
//
// Limite : c'est Chromium, pas Safari. Ce script trouve les débordements, les recouvrements
// et les tailles ; le défilement à l'inertie, la barre d'outils de Safari, le clavier et le
// geste retour se vérifient sur un vrai iPhone / Android.

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
// Playwright : celui installé avec le navigateur de l'environnement Claude Code s'il existe
// (le projet peut en contenir une autre version, sans navigateur), sinon celui du projet.
const GLOBAL_PW = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/';
let pw;
try { pw = createRequire(path.join(GLOBAL_PW, 'x.js'))('playwright'); } catch { pw = createRequire(import.meta.url)('playwright'); }
const { chromium, devices } = pw;

const BASE = process.env.BASE || 'http://localhost:3000';
const EMAIL = process.env.VEM_EMAIL || 'amaury.pinchart@vem.com';
const PASSWORD = process.env.VEM_PASSWORD || 'VEM2025!';
const OUT = path.join(here, 'out');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = {
  iphone14: devices['iPhone 14'],
  pixel7: devices['Pixel 7'],
  android360: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } },
  'ipad-portrait': devices['iPad (gen 7)'],
  'ipad-landscape': devices['iPad (gen 7) landscape'],
  desktop: { viewport: { width: 1440, height: 900 } },
};
const only = process.argv[2] ? process.argv[2].split(',') : Object.keys(DEVICES);

// Une seule connexion pour tout le passage (la connexion est limitée à 10 essais / 15 min).
const loginRes = await fetch(BASE + '/api/v1/auth/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const login = (await loginRes.json()).data;
if (!login?.token) throw new Error('Connexion impossible : ' + loginRes.status);

// ── Mesures faites dans la page ──
function measure() {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const visible = el => { const cs = getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const label = el => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '') +
      ' «' + (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) + '»';
  };
  // éléments qui dépassent à droite sans être dans une zone qui défile / coupe
  const over = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= vw + 2) continue;
    let p = el.parentElement, clipped = false;
    while (p && p !== document.body) {
      if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX) && p.getBoundingClientRect().right <= vw + 2) { clipped = true; break; }
      p = p.parentElement;
    }
    if (!clipped) over.push(el);
  }
  const set = new Set(over);
  const top = over.filter(el => { for (let p = el.parentElement; p; p = p.parentElement) if (set.has(p)) return false; return true; });
  // boutons d'action recouverts
  const ACTION = /(sauvegarder|enregistrer|envoyer|cr[ée]er|valider|ajouter|suivant|appliquer)/i;
  const covered = [];
  for (const b of document.querySelectorAll('.overlay.open button, .overlay button, [id$="-editor"] button, #clf-view button')) {
    if (!visible(b) || !ACTION.test(b.textContent || '')) continue;
    const r = b.getBoundingClientRect();
    if (!r.width || r.bottom < 0 || r.top > vh) continue;
    const x = Math.min(Math.max(r.left + r.width / 2, 1), vw - 1), y = Math.min(Math.max(r.top + r.height / 2, 1), vh - 1);
    const hit = document.elementFromPoint(x, y);
    if (hit && hit !== b && !b.contains(hit)) covered.push(label(b) + ' sous ' + label(hit));
    else if (r.right > vw + 1) covered.push(label(b) + ' coupé à droite (' + Math.round(r.right) + ' px)');
  }
  // petites cibles tactiles (visibles à l'écran)
  const taps = [...document.querySelectorAll('button, a, [onclick], select, input[type=checkbox], input[type=radio], .tab')]
    .filter(el => { if (!visible(el)) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < vh && (r.height < 32 || r.width < 32); });
  return {
    width: vw, scrollWidth: document.documentElement.scrollWidth,
    overflow: document.documentElement.scrollWidth - vw,
    offenders: top.slice(0, 6).map(el => label(el) + ' → ' + Math.round(el.getBoundingClientRect().right) + ' px'),
    covered: covered.slice(0, 6),
    smallTaps: taps.length,
  };
}

const report = {};
const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
for (const name of only) {
  const ctx = await browser.newContext({ ...DEVICES[name], locale: 'fr-BE', timezoneId: 'Europe/Brussels' });
  const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 200)));
  await page.addInitScript(([t, u]) => { localStorage.setItem('vem_token', t); localStorage.setItem('vem_user', JSON.stringify(u)); }, [login.token, login.user]);

  const snap = async key => {
    await page.waitForTimeout(600);
    report[`${name} | ${key}`] = await page.evaluate(measure);
    await page.screenshot({ path: path.join(OUT, `${name}-${key}.png`) });
  };
  const home = async () => { await page.goto(BASE + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };

  await home();
  await snap('dashboard');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await snap('dashboard-bas');
  for (const pg of ['projects', 'tasks', 'daily', 'handover', 'templates', 'checklist-templates', 'clients', 'team', 'notifs']) {
    await page.evaluate(p => goto(p), pg); await page.waitForTimeout(900);
    await snap('page-' + pg);
  }

  const pid = await page.evaluate(() => (PROJECTS.find(p => /Audi/.test(p.name)) || PROJECTS[0])?.id);
  await page.evaluate(id => openProject(id), pid); await page.waitForTimeout(1500);
  await snap('projet-entete');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#proj-tabs .tab')].filter(t => t.style.display !== 'none').map(t => t.textContent.trim()));
  for (let i = 0; i < tabs.length; i++) {
    await page.evaluate(i => [...document.querySelectorAll('#proj-tabs .tab')].filter(t => t.style.display !== 'none')[i].click(), i);
    await page.waitForTimeout(1300);
    await page.evaluate(() => document.getElementById('proj-tabs')?.scrollIntoView());
    await snap('onglet-' + i + '-' + tabs[i].normalize('NFD').replace(/[^a-zA-Z]/g, '').slice(0, 14));
  }

  // fenêtres : [clé, code qui l'ouvre]
  const DID = await page.evaluate(async () => (await api('GET', '/daily-reports'))?.data?.[0]?.id);
  const flows = [
    ['daily-nouveau', `showModal('modal-daily')`],
    ['daily-lecture', `openDailyDetail('${DID}', '${pid}')`],
    ['daily-edition', `editDailyReport('${DID}')`],
    ['projet-nouveau', `showModal('modal-proj')`],
    ['tache-nouvelle', `showModal('modal-task')`],
    ['handover-nouveau', `showModal('modal-handover')`],
    ['checklist-liste', `openChecklistFull('${pid}', 'installation', 'list')`],
    ['checklist-diaporama', `openChecklistFull('${pid}', 'installation', 'slide')`],
    ['whatsapp', `openWhatsAppImport('${pid}')`],
    ['demande-infos', `openInfoRequestModal('${pid}')`],
    ['planning-montage', `(async () => { await loadAssemblyPlanCard('${pid}'); if (AP.plans[AP.phase]) openAssemblyPlanEditor(); else await apCreate('template'); })()`],
  ];
  for (const [key, code] of flows) {
    await home();
    await page.evaluate(id => openProject(id), pid); await page.waitForTimeout(1000);
    try { await page.evaluate(code); } catch (e) { report[`${name} | ${key} | ERREUR`] = String(e).slice(0, 200); }
    await page.waitForTimeout(1800);
    await snap(key + '-haut');
    await page.evaluate(() => {
      document.querySelectorAll('.overlay.open, .overlay, .overlay .modal, .ap-ov, #clf-view').forEach(e => { e.scrollTop = 1e6; });
    });
    await snap(key + '-bas');
  }
  report[`${name} | erreurs JS`] = errors;
  await ctx.close();
}
await browser.close();

fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
// résumé lisible
const lines = [];
for (const [k, v] of Object.entries(report)) {
  if (Array.isArray(v)) { if (v.length) lines.push(`${k}: ${v.join(' / ')}`); continue; }
  if (typeof v === 'string') { lines.push(`${k}: ${v}`); continue; }
  if (v.overflow > 0 || v.covered.length) {
    lines.push(`${k}: déborde de ${v.overflow} px${v.covered.length ? ' · boutons cachés : ' + v.covered.length : ''}`);
    v.offenders.slice(0, 3).forEach(o => lines.push('    → ' + o));
    v.covered.slice(0, 3).forEach(o => lines.push('    ✋ ' + o));
  }
}
fs.writeFileSync(path.join(OUT, 'resume.txt'), lines.join('\n') + '\n');
console.log(lines.join('\n') || 'Aucun débordement ni bouton caché.');
