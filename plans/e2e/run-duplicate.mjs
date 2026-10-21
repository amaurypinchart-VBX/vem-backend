// Test navigateur de la duplication multiple des planches (ordinateur 1440 × 900) : jeu généré, Ctrl + clic sur 3
// planches → barre « 3 planches », ⧉ Dupliquer → +3 vignettes, Ctrl+Z → état d'avant, Ctrl+Y, Maj + clic (plage),
// « ⬇ PDF de la sélection » = 3 pages, mode « ☑ Sélectionner », « ⧉ Pour d'autres Viewbox… ». Captures dans e2e/shots/.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
mkdirSync(shots, { recursive: true });
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
const check = (ok, msg) => { if (!ok) throw new Error('ÉCHEC : ' + msg); console.log('✔', msg); };

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: shots + 'dup-desktop-editor.png' });

const thumbs = page.locator('.sheet-thumb');
const n0 = await thumbs.count();
const numbers = async () => (await page.locator('.thumb-foot b').allTextContents()).join(' ');
console.log('Planches :', await numbers());
check(n0 >= 6, `${n0} planches générées`);

// Ctrl + clic : 3 planches (2, 3, 5)
await thumbs.nth(1).click();
await thumbs.nth(2).click({ modifiers: ['Control'] });
await thumbs.nth(4).click({ modifiers: ['Control'] });
await page.getByTestId('sheet-selbar').waitFor();
check(/3 planches/.test(await page.getByTestId('sheet-selbar').innerText()), 'Ctrl + clic : barre « 3 planches »');
check((await page.locator('.sheet-thumb.picked').count()) === 3, '3 vignettes marquées');
await page.screenshot({ path: shots + 'dup-selection.png' });

await page.getByTestId('selbar-duplicate').click();
await page.waitForTimeout(500);
check((await thumbs.count()) === n0 + 3, `⧉ Dupliquer : ${n0} → ${n0 + 3} planches`);
check((await page.locator('.sheet-thumb.picked').count()) === 3, 'les copies deviennent la sélection');
console.log('Après duplication :', await numbers());
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check((await thumbs.count()) === n0, 'Ctrl+Z : une seule entrée d’historique annule les 3 copies');
await page.keyboard.press('Control+y');
await page.waitForTimeout(300);
check((await thumbs.count()) === n0 + 3, 'Ctrl+Y : copies rétablies');
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);

// Maj + clic : plage 1 → 3
await thumbs.nth(0).click();
await thumbs.nth(2).click({ modifiers: ['Shift'] });
check((await page.locator('.sheet-thumb.picked').count()) === 3, 'Maj + clic : plage de 3 planches');
const dl = page.waitForEvent('download', { timeout: 300000 });
await page.getByTestId('selbar-pdf').click();
const file = await dl;
const pdfPath = shots + 'dup-selection.pdf';
await file.saveAs(pdfPath);
const info = execFileSync('pdfinfo', [pdfPath]).toString();
check(/Pages:\s+3\b/.test(info), 'PDF de la sélection : 3 pages');

// mode « ☑ Sélectionner » + « Tout » n'existe que dans un jeu en unités ; cases à cocher visibles
await page.getByTestId('sheet-select-mode').click();
check((await page.locator('.thumb-check').count()) === n0, 'mode sélection : une case par planche');
await page.getByTestId('sheet-select-mode').click();
check((await page.locator('.thumb-check').count()) === 0, 'fin du mode sélection');

// « Pour d'autres Viewbox » sur la première planche « Extract - Plan View - VBX-… »
const perModule = page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: 'Front' }) });
const nPer = await perModule.count();
check(nPer >= 2, `${nPer} planches « une par Viewbox »`);
await perModule.first().click();
await page.waitForTimeout(400);
await page.getByTestId('duplicate-for-modules').click();
const labels = page.locator('.module-pick-list label');
check((await labels.count()) >= 1, 'liste des autres Viewbox');
await labels.first().click();
await page.getByRole('button', { name: /^Dupliquer \(1\)/ }).click();
await page.waitForFunction((n) => document.querySelectorAll('.sheet-thumb').length === n, n0 + 1, { timeout: 300000 });
await page.waitForTimeout(1500);
check((await thumbs.count()) === n0 + 1, 'une copie pour la Viewbox choisie');
const title = await page.locator('.sheet-props input[type="text"]').nth(1).inputValue();
console.log('Titre de la copie :', title);
await page.screenshot({ path: shots + 'dup-for-module.png' });
check(!(await page.locator('.sheet-canvas text', { hasText: 'Vue non calculée' }).count()), 'vues de la copie calculées');

check(!errors.length, `aucune erreur console${errors.length ? ' : ' + errors.join(' | ') : ''}`);
await browser.close();
console.log('OK');
