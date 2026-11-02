// Test navigateur : « 💾 Enregistrer dans le projet » dans l'éditeur de planches → PDF du jeu dans les Fichiers du projet.
import { chromium } from 'playwright-core';

const PORT = process.env.PORT || 4173;
const URL0 = `http://localhost:${PORT}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
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
const before = (await (await fetch(`http://localhost:${PORT}/__test/project-files`)).json()).data.length;
await page.getByTestId('save-set-project').click();
await page.getByTestId('saved-project-toast').waitFor({ timeout: 600000 });
console.log('Toast :', await page.getByTestId('saved-project-toast').innerText());
const files = (await (await fetch(`http://localhost:${PORT}/__test/project-files`)).json()).data;
if (files.length !== before + 1) throw new Error(`fichier non enregistré (${before} → ${files.length})`);
console.log('Fichier enregistré :', JSON.stringify(files[files.length - 1]).slice(0, 200));
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
