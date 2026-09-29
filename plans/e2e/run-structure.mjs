// Test navigateur de l'étude structure (sol et calage) : calage rapide sans modèle (grille de Viewbox, fiche PDF), puis
// onglet « Étude structure » d'un modèle analysé. Captures et PDF dans e2e/shots/ (contrôle : pdfinfo, pdftoppm).
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const errors = [];
// la page défile dans <main> (hauteur fixe) : une capture par hauteur d'écran
async function shootAll(name) {
  const h = await page.evaluate(() => document.querySelector('main').scrollHeight);
  for (let k = 0, y = 0; y < h && k < 6; k++, y += 900) {
    await page.evaluate((top) => (document.querySelector('main').scrollTop = top), y);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}${name}-${k + 1}.png` });
  }
  await page.evaluate(() => (document.querySelector('main').scrollTop = 0));
}
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL0);
// 1. calage rapide : 3 × 2 emplacements, une rangée à 2 niveaux
await page.getByRole('button', { name: /Calage rapide/ }).click();
await page.getByText('Plan des appuis').waitFor();
await page.getByText('Viewbox en largeur').locator('select').selectOption('2');
await page.waitForTimeout(300);
const cells = page.locator('table.list select');
for (let k = 0; k < 3; k++) await cells.nth(k).selectOption('2');
await page.waitForTimeout(800);
console.log('Types d’appui :', await page.locator('.card-head .chip').allInnerTexts());
await shootAll('structure-rapide');
// stock de l'entrepôt : une plaque 100 × 100 × 27 mm, proposée ensuite parmi les solutions
await page.getByRole('button', { name: /Stock de l’entrepôt/ }).click();
await page.getByRole('button', { name: '+ Plaque', exact: true }).click();
await page.getByRole('button', { name: 'Enregistrer le stock' }).click();
await page.getByText('✓ Stock enregistré').waitFor();
await page.locator('b', { hasText: 'Plaques du stock' }).first().waitFor({ timeout: 15000 });
console.log('Solutions « stock » proposées :', await page.locator('b', { hasText: 'Plaques du stock' }).count());
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Fiche PDF' }).click()]);
await dl.saveAs(shots + 'calage-rapide.pdf');
console.log('Fiche PDF :', dl.suggestedFilename());

// 2. modèle analysé → onglet Étude structure
await page.getByRole('button', { name: '← Modèles' }).click();
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Étude structure' }).click();
await page.getByText('Plan des appuis').waitFor({ timeout: 120000 });
await page.waitForTimeout(800);
await shootAll('structure-modele');
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Fiche PDF' }).click()]);
await dl2.saveAs(shots + 'calage-modele.pdf');
console.log('Fiche PDF du modèle :', dl2.suggestedFilename());
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
