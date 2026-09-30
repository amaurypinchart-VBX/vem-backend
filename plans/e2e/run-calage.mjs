// Test navigateur du calage appui par appui (calcul rapide, sans modèle) : portance en kg/m², plan coloré par la
// pression au sol, choix des plaques par type, un appui à part, plusieurs couches, plaques de roulage, diagnostic,
// fiche PDF et plan des appuis au sol. Captures et PDF dans e2e/shots/.
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
const shot = async (name, loc) => {
  if (loc) await loc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${shots}${name}.png` });
};
const diag = () => page.locator('.card', { hasText: 'Diagnostic du calage' });

await page.goto(URL0);
await page.getByRole('button', { name: /Calage rapide/ }).click();
await page.getByText(/^Plan des appuis — /).waitFor();
// 2 × 1 Viewbox, un niveau ; sol faible saisi en kg/m²
await page.getByText('Viewbox en largeur').locator('select').selectOption('2');
await page.waitForTimeout(300);
const bearing = page.getByText('Portance admissible', { exact: true }).locator('..');
await bearing.locator('select').selectOption('kg/m²');
await bearing.locator('input').fill('4000');
await page.waitForTimeout(700);
console.log('Conversion :', await page.getByText(/^= .* kN\/m² = .* kg\/m² = .* kg\/cm²/).first().innerText());
console.log('Tuiles :', (await page.locator('.stats').first().innerText()).replace(/\s+/g, ' '));
console.log('Diagnostic (auto) :', (await diag().locator('.card-head').innerText()).replace(/\s+/g, ' '));
await shot('calage-1-auto', page.locator('.card', { hasText: 'Plan des appuis' }).first());

// choix par type : angles seuls sur 1 × 70 × 70 × 36
const typeCard = page.locator('.card', { has: page.locator('.card-head .chip', { hasText: 'angle seul' }) }).filter({ hasText: 'Calage de ce type' }).first();
console.log('Carte du type :', (await typeCard.locator('.card-head').first().innerText()).replace(/\s+/g, ' '));
const picker = typeCard.locator('.row', { hasText: 'Calage de ce type' }).locator('select').first();
const opt70 = await picker.locator('option', { hasText: '70 × 70 × 36' }).first().getAttribute('value');
await picker.selectOption(opt70);
await diag().getByText('(choisi)').first().waitFor();
console.log('Diagnostic (70 × 70) :', (await diag().innerText()).split('\n').slice(0, 6).join(' | '));
await shot('calage-2-type70', diag());

// un appui à part : clic sur le premier appui du plan, 2 couches (40 × 40 sur 100 × 100)
await page.locator('.card', { hasText: 'Plan des appuis' }).first().locator('svg g[style*="cursor"]').first().click();
const panel = page.locator('.support-panel');
await panel.waitFor();
console.log('Appui choisi :', (await panel.locator('.card-head').innerText()).replace(/\s+/g, ' '));
await panel.locator('select').first().selectOption('custom');
await page.waitForTimeout(400);
const rows = panel.locator('.row', { hasText: 'sous le pied' }).last();
const opt40 = await rows.locator('select').nth(1).locator('option', { hasText: '40 × 40 × 36' }).first().getAttribute('value');
await rows.locator('select').nth(1).selectOption(opt40);
await rows.locator('select').nth(0).selectOption('1');
await panel.getByRole('button', { name: /couche en dessous/ }).click();
await page.waitForTimeout(400);
const layer2 = panel.locator('.row', { hasText: 'couche 2' }).last();
const opt100 = await layer2.locator('select').nth(1).locator('option', { hasText: '100 × 100 × 36' }).first().getAttribute('value');
await layer2.locator('select').nth(1).selectOption(opt100);
await page.waitForTimeout(700);
console.log('Étapes :', (await panel.locator('table.list tbody').innerText()).replace(/\t/g, ' · ').split('\n').join(' | '));
console.log('Conseil :', await panel.locator('.card-body > div').first().innerText());
await shot('calage-3-appui', panel);

// plaques de roulage partout
await diag().getByText('Plaques de roulage jointives sur toute la surface').click();
await diag().getByText('les 12 appuis passent').waitFor();
console.log('Diagnostic (roulage) :', (await diag().innerText()).split('\n').slice(0, 4).join(' | '));
console.log('Étapes (roulage) :', (await panel.locator('table.list tbody').innerText()).replace(/\t/g, ' · ').split('\n').slice(-2).join(' | '));
await shot('calage-4-roulage', diag());
console.log('Matériel :', (await page.locator('.card', { hasText: 'Matériel à préparer' }).locator('tbody').innerText()).replace(/\t/g, ' · ').split('\n').join(' | '));

// PDF : fiche de calage et plan des appuis au sol (colonne calage)
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Fiche PDF' }).click()]);
await dl.saveAs(shots + 'calage-choix.pdf');
const [dlp] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Plan des appuis au sol (PDF)' }).click()]);
await dlp.saveAs(shots + 'calage-choix-points.pdf');
console.log('PDF :', dl.suggestedFilename(), '/', dlp.suggestedFilename());

// retour en automatique
await diag().getByRole('button', { name: 'Tout remettre en automatique' }).click();
await diag().getByRole('button', { name: 'Tout remettre en automatique' }).waitFor({ state: 'detached' });
console.log('Après remise à zéro :', (await diag().locator('.card-head').innerText()).replace(/\s+/g, ' '));
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
