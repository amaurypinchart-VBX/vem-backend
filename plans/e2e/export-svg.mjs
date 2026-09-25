// Exporte en SVG les planches d'un jeu de plans déjà généré (via le bouton « ⬇ SVG »), dans e2e/shots/.
import { chromium } from 'playwright-core';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? process.env.HOME + '/.cache/ms-playwright/chromium-1134/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, acceptDownloads: true });
page.on('dialog', (d) => d.accept());
await page.goto(`http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`);
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor();
const which = (process.env.SHEETS || '2,5').split(',').map(Number);
for (const i of which) {
  await page.locator('.sheet-thumb').nth(i).click();
  await page.waitForTimeout(2500);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /SVG/ }).click()]);
  await dl.saveAs(shots + `sheet-${i}.svg`);
  console.log('SVG', i, dl.suggestedFilename());
}
await browser.close();
