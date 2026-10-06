// Test navigateur des appuis manquants (étape 3) : VBX-04 posée en décalé, deux angles sur les rives de VBX-2, deux
// angles en porte-à-faux → carte « Porte-à-faux » (plan + propositions), « Ajouter les appuis proposés et les
// dimensionner », puis calcul complet. Fixture : E2E_FIXTURE_VBX4='[8000,0,2800]' E2E_FIXTURE_OUT=e2e/fixture-offset.zip
// npx vitest run tests/e2e-fixture.test.ts ; serveur : ZIP=e2e/fixture-offset.zip node e2e/server.mjs.
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
async function shootAll(name) {
  const h = await page.evaluate(() => document.querySelector('main').scrollHeight);
  for (let k = 0, y = 0; y < h && k < 4; k++, y += 900) {
    await page.evaluate((top) => (document.querySelector('main').scrollTop = top), y);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}${name}-${k + 1}.png` });
  }
  await page.evaluate(() => (document.querySelector('main').scrollTop = 0));
}
await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Étude structure' }).click();
await page.getByText('Vue 3D — statut des pièces').waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);
// reconnaissance : Viewbox validées, le reste ignoré
if (await page.getByRole('button', { name: /Traiter la file/ }).count()) {
  await page.getByRole('button', { name: /Traiter la file/ }).click();
  for (let k = 0; k < 30; k++) {
    await page.getByText('Qu’est-ce que c’est ?').waitFor({ timeout: 10000 }).catch(() => {});
    if (!(await page.getByText('Qu’est-ce que c’est ?').count())) break;
    const isModule = await page.getByText('Gabarit de calcul').count();
    const next = page.getByRole('button', { name: 'Valider et suivant' });
    if (!isModule) await page.getByRole('button', { name: 'Ignorer (non structurel)' }).click();
    else if (await next.count()) await next.click();
    else await page.getByRole('button', { name: 'Valider', exact: true }).click();
    await page.waitForTimeout(400);
  }
}
await page.getByRole('button', { name: /3\. Calcul/ }).click();
const card = page.locator('.card', { hasText: /(Appuis manquants|Porte-à-faux) — \d+ angle/ });
await card.waitFor({ timeout: 20000 });
console.log('Carte :', (await card.locator('h3').innerText()).trim());
console.log('Propositions :', await card.locator('li').allInnerTexts());
console.log('Plan : angles rouges', await card.locator('svg circle').count(), '; poteaux proposés', await card.locator('svg rect').count());
await shootAll('supports-manquants');
await card.getByRole('button', { name: /Ajouter .*appui.* dimensionner/ }).click();
await page.getByText(/Appuis ajoutés aux modifications de l’étude/).waitFor({ timeout: 300000 });
const after = page.locator('.card', { hasText: 'Appuis ajoutés par l’étude' }).first();
console.log('Dimensionnement :', (await after.locator('.hint').first().innerText()).replace(/\s+/g, ' '));
console.log('Appuis ajoutés :', await after.locator('li').allInnerTexts());
console.log('Encore sans appui :', await page.locator('.card', { hasText: /(Appuis manquants|Porte-à-faux) — / }).count());
await shootAll('supports-ajoutes');
await page.getByRole('button', { name: /Lancer le calcul|Relancer le calcul/ }).click();
await page.getByRole('button', { name: 'Voir les résultats →' }).waitFor({ timeout: 300000 });
console.log('Après calcul :', await after.locator('li').allInnerTexts());
const err = await page.locator('.error-box').allInnerTexts();
if (err.length) console.log('Erreur calcul :', err);
await shootAll('supports-calcul');
await page.getByRole('button', { name: 'Voir les résultats →' }).click();
await page.waitForTimeout(1500);
await shootAll('supports-resultats');
await page.getByRole('button', { name: /5\. Sol & calage/ }).click();
await page.waitForTimeout(1500);
console.log('Calage, types :', (await page.getByText(/pied de poteau/i).count()) > 0 ? 'pied de poteau présent' : 'pas de pied de poteau');
await shootAll('supports-calage');
if (errors.length) throw new Error(`Erreurs navigateur : ${errors.join(' | ')}`);
await browser.close();
