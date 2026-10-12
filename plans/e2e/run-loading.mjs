// Test navigateur de la loading liste (L1 : Réglages › Règles de loading) : règles de la base de départ en français,
// contradictions à trancher, ajout d'une référence manquante au catalogue (4-700-096). Captures dans e2e/shots/loading-*.png.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const check = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) process.exitCode = 1; };

await page.goto(URL0);
await page.getByRole('button', { name: 'Réglages' }).click();
await page.getByRole('button', { name: 'Règles de loading' }).click();
await page.getByText(/règles actives · version/).waitFor();
await page.screenshot({ path: `${shots}loading-regles.png` });
check(await page.getByText('8 par box · si box seule (standalone) · + 20 % arrondi au-dessus').isVisible(), 'joint vertical 4-700-065 en français');
await page.getByText('4-700-065', { exact: true }).first().click();
await page.getByText('Points de calage').waitFor();
check(await page.getByText(/jamais modifiée dans l’app/).isVisible(), 'historique vide (base de départ)');
check(await page.locator('option', { hasText: 'Contradictions à trancher (0)' }).count() === 1, 'plus aucune contradiction à trancher');
await page.locator('select').first().selectOption('conflict');
await page.waitForTimeout(200);
await page.screenshot({ path: `${shots}loading-contradictions.png` });

await page.getByRole('button', { name: /^Catalogue/ }).click();
await page.getByText(/Références à ajouter au catalogue/).waitFor();
await page.getByRole('button', { name: '＋ 4-700-096' }).click();
const designation = await page.locator('label', { hasText: 'Désignation' }).locator('input').inputValue();
check(/EPDM/.test(designation), `désignation pré-remplie depuis la règle (« ${designation} »)`);
await page.locator('label', { hasText: 'Catégorie' }).locator('select').selectOption('joints');
await page.getByRole('button', { name: 'Ajouter au catalogue' }).click();
await page.getByText('✓ 4-700-096 ajoutée au catalogue').waitFor();
check(!(await page.getByRole('button', { name: '＋ 4-700-096' }).count()), '4-700-096 n’est plus à ajouter');
await page.getByPlaceholder('Rechercher une référence…').fill('4-700-096');
check(await page.getByText('ajoutée dans l’app').isVisible(), '4-700-096 dans le catalogue, « ajoutée dans l’app »');
await page.screenshot({ path: `${shots}loading-catalogue.png` });

await page.getByRole('button', { name: 'Décisions et observations' }).click();
check(await page.getByText(/quantité de l’étude × 2/).isVisible(), 'décision sous-bois = étude structure × 2');
await page.screenshot({ path: `${shots}loading-decisions.png`, fullPage: true });

check(errors.length === 0, `aucune erreur console${errors.length ? ' : ' + errors.join(' | ') : ''}`);
await browser.close();
