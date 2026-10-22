// Mémoire du téléphone sur un modèle lourd (ZIP=… : E2E_FIXTURE_HEAVY=3000 npm run e2e:fixture, ou un vrai modèle) :
// 1) « ordinateur » : analyse + génération du jeu (les vues partent au serveur), 2) « iPhone » (émulation) : ouvre le
// jeu et tape chaque planche ; après chaque étape : mémoire du processus de la page (RSS), tas JS, nœuds DOM.
// MOBILE_ONLY=1 saute l'étape ordinateur (jeu déjà là). Sortie : tableau texte.
import { chromium, devices } from 'playwright-core';
import { execSync } from 'node:child_process';

const PORT = process.env.PORT || 4173;
const URL0 = `http://localhost:${PORT}/plans/?projectId=p1&token=tok`;
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

if (!process.env.MOBILE_ONLY) {
  const b = await chromium.launch({ executablePath: exe, args });
  const page = await b.newPage({ viewport: { width: 1700, height: 1050 } });
  page.on('dialog', (d) => d.accept());
  await page.goto(URL0);
  await page.getByRole('button', { name: 'Analyser' }).click();
  await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 600000 });
  await page.getByRole('button', { name: 'Planches A1' }).click();
  await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Générer', exact: true }).click();
  await page.locator('.sheet-editor').waitFor({ timeout: 1800000 });
  // toutes les planches calculées (et envoyées)
  const n = await page.locator('.sheet-thumb').count();
  for (let i = 0; i < n; i++) {
    await page.locator('.sheet-thumb').nth(i).click();
    await page.waitForFunction(() => !document.querySelector('.sheet-canvas')?.textContent?.includes('Calcul de la vue'), null, { timeout: 900000 });
  }
  await page.waitForTimeout(5000);
  console.log(`ordinateur : jeu de ${n} planches en ${Math.round((Date.now() - t0) / 1000)} s`);
  await b.close();
}
if (process.env.DESKTOP_ONLY) process.exit(0);

const b = await chromium.launch({ executablePath: exe, args });
const ctx = await b.newContext({ ...devices['iPhone 14'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');

/** RSS (Mo) du plus gros processus « renderer » + GPU */
function rss() {
  const out = execSync(`ps -eo rss,args | grep -E 'headless_shell|chrome' | grep -v grep`).toString().trim().split('\n');
  let renderer = 0;
  let gpu = 0;
  for (const l of out) {
    const kb = parseInt(l.trim());
    if (/--type=renderer/.test(l)) renderer = Math.max(renderer, kb);
    if (/--type=gpu-process/.test(l)) gpu = Math.max(gpu, kb);
  }
  return { renderer: Math.round(renderer / 1024), gpu: Math.round(gpu / 1024) };
}
async function sample(label) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const r = rss();
  const dom = await page.evaluate(() => {
    let pathChars = 0;
    for (const p of document.querySelectorAll('.sheet-canvas path')) pathChars += (p.getAttribute('d') ?? '').length;
    return { nodes: document.getElementsByTagName('*').length, pathMb: +(pathChars / 1e6).toFixed(1), imgs: document.images.length };
  });
  console.log(`${label.padEnd(34)} renderer ${String(r.renderer).padStart(5)} Mo · gpu ${String(r.gpu).padStart(4)} Mo · tas JS ${Math.round(m.JSHeapUsedSize / 1048576)} Mo · DOM ${dom.nodes} · tracés ${dom.pathMb} M car.`);
}

await page.goto(URL0);
await sample('page Modèles');
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.getByRole('button', { name: 'Planches A1' }).waitFor({ timeout: 600000 });
await sample('modèle ouvert (Contrôle)');
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.waitForTimeout(3000);
await sample('onglet Planches A1');
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(4000);
await sample('éditeur ouvert (1re planche)');
const n = await page.locator('.sheet-thumb').count();
for (let i = 1; i < n; i++) {
  await page.locator('.sheet-thumb').nth(i).tap();
  const t0 = Date.now();
  await page.waitForFunction(() => !document.querySelector('.sheet-canvas')?.textContent?.includes('Calcul de la vue'), null, { timeout: 900000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const num = await page.locator('.sheet-thumb .thumb-foot b').nth(i).innerText();
  await sample(`planche ${num} (${Math.round((Date.now() - t0) / 1000)} s)`);
}
const heavy = await page.locator('.sheet-canvas text', { hasText: 'trop lourde' }).count();
console.log('vues « trop lourde » affichées :', heavy, '· erreurs :', errors.length ? errors.join(' | ') : 'aucune');
await b.close();
