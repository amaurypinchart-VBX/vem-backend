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
  executablePath: process.env.CHROMIUM ?? process.env.HOME + '/.cache/ms-playwright/chromium-1134/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => { console.log('Dialogue :', d.message()); d.accept(); });

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
}
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
