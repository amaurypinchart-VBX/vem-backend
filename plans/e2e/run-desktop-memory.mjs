// Mémoire sur ORDINATEUR en parcourant toutes les planches d'un jeu (A. Pinchart 04.11.2026, Xiaomi : « je vérifiais
// planche par planche et ça a planté »). Modèle : E2E_FIXTURE_HEAVY=1500 E2E_FIXTURE_DETAILNODES=1 npm run e2e:fixture
// (ou ZIP= un vrai modèle sur le serveur de test). Génère le jeu, puis clique chaque planche ; après chacune : mémoire
// de tous les processus du navigateur (RSS, Mo), tas JS de la page, vues gardées. Sortie : tableau texte.
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';

const PORT = process.env.PORT || 4173;
const URL0 = `http://localhost:${PORT}/plans/?projectId=p1&token=tok`;
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const b = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await b.newPage({ viewport: { width: 1700, height: 1050 } });
page.on('dialog', (d) => d.accept());
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const cdp = await page.context().newCDPSession(page);
await cdp.send('Performance.enable');
const rssMb = () => {
  const out = execSync(`ps -eo rss,args | grep -E 'headless|chrome' | grep -v grep || true`).toString().trim().split('\n');
  return Math.round(out.reduce((s, l) => s + (parseInt(l.trim().split(/\s+/)[0], 10) || 0), 0) / 1024);
};
const heapMb = async () => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Math.round((metrics.find((m) => m.name === 'JSHeapUsedSize')?.value ?? 0) / 1048576);
};
await page.goto(URL0);
if (process.env.BIG === '1' || process.env.BIG === '0') {
  await page.evaluate((v) => localStorage.setItem('vem_plans_bigmodel', v), process.env.BIG);
  await page.reload();
}
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 900000 });
console.log(`après analyse : RSS ${rssMb()} Mo, tas ${await heapMb()} Mo`);
await page.getByRole('button', { name: 'Planches A1' }).click();
const hasSet = await page.getByRole('button', { name: 'Ouvrir' }).count();
if (hasSet) await page.getByRole('button', { name: 'Ouvrir' }).first().click();
else {
  await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
  await page.getByRole('button', { name: 'Générer', exact: true }).click();
}
const t0 = Date.now();
await page.locator('.sheet-editor').waitFor({ timeout: 3600000 });
console.log(`jeu ouvert en ${Math.round((Date.now() - t0) / 1000)} s : RSS ${rssMb()} Mo, tas ${await heapMb()} Mo`);
const n = await page.locator('.sheet-thumb').count();
let peak = 0;
for (let i = 0; i < n; i++) {
  const t = Date.now();
  await page.locator('.sheet-thumb').nth(i).click();
  await page.waitForFunction(() => !document.querySelector('.sheet-canvas')?.textContent?.includes('Calcul de la vue'), null, { timeout: 900000 }).catch(() => {});
  await page.waitForTimeout(800);
  const r = rssMb();
  peak = Math.max(peak, r);
  console.log(`planche ${String(i + 1).padStart(2)} / ${n} (${Math.round((Date.now() - t) / 100) / 10} s) : RSS ${r} Mo, tas ${await heapMb()} Mo`);
}
await page.waitForTimeout(Number(process.env.SETTLE ?? 20000));
console.log(`fin (après ${Number(process.env.SETTLE ?? 20000) / 1000} s) : RSS ${rssMb()} Mo, tas ${await heapMb()} Mo, pic ${peak} Mo, erreurs : ${errors.length ? errors.join(' / ') : 'aucune'}`);
await b.close();
