// Test navigateur des planches : analyse → Planches A1 → générer le jeu (vues, cotes automatiques, images 3D)
// → captures d'écran de chaque planche → édition (cote manuelle, chaîne, déplacement, annuler) → réouverture.
// Chromium : CHROMIUM=/chemin/chrome (défaut : cache Playwright du codespace).
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
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
const t0 = Date.now();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
console.log('Jeu de plans généré en', Date.now() - t0, 'ms');
await page.waitForTimeout(2000);
const numbers = await page.locator('.sheet-thumb .thumb-foot b').allInnerTexts();
console.log('Planches :', numbers.join(' '));
for (let i = 0; i < numbers.length; i++) {
  await page.locator('.sheet-thumb').nth(i).click();
  await page.waitForTimeout(1200);
  await page.locator('.sheet-canvas').screenshot({ path: shots + `planche-${numbers[i]}.png` });
}
const svgBox = async () => {
  const b = await page.locator('.sheet-paper svg').first().boundingBox();
  const mm = b.width / 841;
  return (x, y) => ({ x: b.x + x * mm, y: b.y + y * mm });
};
// cote manuelle sur la vue « Long side » de A0.2 (2 points + placement)
await page.locator('.sheet-thumb').nth(2).click();
await page.waitForTimeout(1200);
let at = await svgBox();
const before = await page.locator('.sheet-paper svg text').count();
await page.getByRole('button', { name: /Cote$/ }).first().click();
let p = at(200, 150);
await page.mouse.move(p.x, p.y);
await page.waitForTimeout(200);
await page.mouse.click(p.x, p.y);
p = at(400, 150);
await page.mouse.click(p.x, p.y);
p = at(300, 120);
await page.mouse.move(p.x, p.y);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(400);
console.log('Cote manuelle :', (await page.locator('.sheet-paper svg text').count()) > before ? 'ajoutée' : 'ABSENTE');
await page.keyboard.press('Escape');
await page.locator('.sheet-canvas').screenshot({ path: shots + 'edit-cote-manuelle.png' });
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
console.log('Annuler la cote :', (await page.locator('.sheet-paper svg text').count()) === before ? 'OK' : 'NON');
await page.getByText('✓ Enregistré').waitFor({ timeout: 30000 });
console.log('Enregistrement automatique : OK');
await page.getByRole('button', { name: '← Jeux de plans' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor();
await page.locator('.sheet-thumb').nth(2).click();
await page.waitForTimeout(1500);
await page.locator('.sheet-canvas').screenshot({ path: shots + 'rouvert.png' });
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
