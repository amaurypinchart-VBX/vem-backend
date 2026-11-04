// Test navigateur de l'export PDF : jeu généré (vues, cotes, images 3D) → « ⬇ PDF du jeu » et « ⬇ PDF planche ».
// Les PDF sont enregistrés dans e2e/shots/ (contrôle : pdfinfo, pdffonts, pdfimages -list, pdftoppm).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
mkdirSync(shots, { recursive: true });
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, acceptDownloads: true });
// BIG=1 : mode « très gros modèle » (export allégé : vues lues planche par planche, images ≤ 2 000 px)
if (process.env.BIG) await page.addInitScript(() => localStorage.setItem('vem_plans_bigmodel', '1'));
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => { console.log('Dialogue :', d.message()); d.accept(); });

// LONGTASKS=1 : relève les blocages du fil principal (> 200 ms) avec l'étape affichée à ce moment
if (process.env.LONGTASKS)
  await page.addInitScript(() => {
    window.__long = [];
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        if (e.duration > 200) window.__long.push({ ms: Math.round(e.duration), at: Math.round(e.startTime), step: document.querySelector('.save-status')?.textContent ?? '' });
    }).observe({ type: 'longtask', buffered: true });
  });
await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(1500);
const n = await page.locator('.sheet-thumb').count();
for (const [label, file] of [['⬇ PDF du jeu', 'jeu.pdf'], ['⬇ PDF planche', 'planche.pdf']]) {
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.getByRole('button', { name: label }).click()]);
  await dl.saveAs(shots + file);
  console.log(`${label} : ${dl.suggestedFilename()} en ${Date.now() - t0} ms (${n} planches dans le jeu)`);
  if (process.env.LONGTASKS) {
    const long = await page.evaluate(() => window.__long.splice(0));
    const by = {};
    for (const l of long) {
      const k = l.step.replace(/\(\d+\/\d+\)/, '(n)');
      by[k] = by[k] ?? { n: 0, total: 0, max: 0 };
      by[k].n++;
      by[k].total += l.ms;
      by[k].max = Math.max(by[k].max, l.ms);
    }
    console.log('  blocages > 200 ms par étape :', JSON.stringify(by));
  }
}
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
