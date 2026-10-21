// Captures de référence ordinateur (1440 × 900) : éditeur de planches, Vue 3D, Vues 2D › Vues spéciales. Sert à comparer
// l'interface ordinateur avant / après un changement (SHOTS=prefixe, PORT=port du serveur de test).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
mkdirSync(shots, { recursive: true });
const prefix = process.env.SHOTS ?? 'desk';
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('dialog', (d) => d.accept());
await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Vue 3D' }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}${prefix}-3d.png` });
await page.getByRole('button', { name: 'Vues 2D' }).click();
await page.getByRole('button', { name: /Vues spéciales/ }).click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${shots}${prefix}-special.png` });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(3000);
await page.locator('.sheet-thumb').nth(5).click();
await page.waitForTimeout(1500);
await page.mouse.move(5, 5);
await page.screenshot({ path: `${shots}${prefix}-editor.png` });
await browser.close();
console.log('captures :', prefix);
