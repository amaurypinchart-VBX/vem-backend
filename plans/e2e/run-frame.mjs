// Test navigateur de l'atelier structure (S12.4) sur le modèle Permabox « Viewbox Light V4 » d'A. Pinchart :
// étape 1 → module → « 🏗 Créer un type de structure (atelier) » → grille paramétrique (traverses seules, angles
// boulonnés avec capacités saisies, contreplaqué 2 × 18 mm portant d'une traverse à l'autre, pieds 21 × 21 cm) →
// enregistrement → réponse validée → calcul complet → résultats → calage → rapport.
// Serveur : cd plans && npm run build && ZIP=reference-reports/Permabox_Lightbox_V1_C_Amaury_VEM_20261001-1030.zip node e2e/server.mjs
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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
async function shootAll(name) {
  const h = await page.evaluate(() => document.querySelector('main').scrollHeight);
  for (let k = 0, y = 0; y < h && k < 5; k++, y += 900) {
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

// module : atelier structure (premier type de la liste qui est une Viewbox / un module)
await page.screenshot({ path: `${shots}frame-etape1.png` });
await page.getByText(/^1 × Viewbox 5900/).first().click();
await page.getByText('Gabarit de calcul').waitFor({ timeout: 10000 });
await page.getByRole('button', { name: /Créer un type de structure/ }).click();
const ws = page.locator('.card', { has: page.getByRole('heading', { name: '🏗 Atelier structure' }) }).last();
await ws.waitFor();
await ws.getByLabel('Nom du type').fill('Viewbox Light V4');
// mêmes boulons M16 que la Viewbox : assemblages Viewbox repris (indicatifs)
await ws.getByLabel('Reprendre les assemblages Viewbox').check();
await page.waitForTimeout(800);
console.log('Contrôles :', (await ws.locator('.card', { hasText: 'Contrôles' }).last().innerText()).replace(/\s+/g, ' '));
console.log('Barres :', (await ws.locator('table').first().innerText()).replace(/\t/g, ' | ').split('\n').slice(0, 8));
await shootAll('frame-atelier');
await ws.getByRole('button', { name: /Enregistrer le type/ }).click();
await page.waitForTimeout(1500);
await page.getByText(/Structure du type « Viewbox Light V4 »/).waitFor({ timeout: 10000 });
await shootAll('frame-fiche');
await page.getByRole('button', { name: 'Valider', exact: true }).click();
await page.waitForTimeout(800);
// le reste : ignoré (non structurel)
if (await page.getByRole('button', { name: /Traiter la file/ }).count()) {
  await page.getByRole('button', { name: /Traiter la file/ }).click();
  for (let k = 0; k < 40; k++) {
    await page.getByText('Qu’est-ce que c’est ?').waitFor({ timeout: 8000 }).catch(() => {});
    if (!(await page.getByText('Qu’est-ce que c’est ?').count())) break;
    if (await page.getByText('Gabarit de calcul').count()) await page.getByRole('button', { name: /^Valider/ }).first().click();
    else await page.getByRole('button', { name: 'Ignorer (non structurel)' }).click();
    await page.waitForTimeout(300);
  }
}
await page.getByRole('button', { name: /2\. Site/ }).click();
await page.waitForTimeout(800);
console.log('Poids du type :', await page.getByText(/Poids d’un module « Viewbox Light V4 »/).count(), (await page.getByText(/calculé ≈/).allInnerTexts()).join(' '));
await shootAll('frame-site');
await page.getByRole('button', { name: /3\. Calcul/ }).click();
await page.getByRole('button', { name: /Lancer le calcul|Relancer le calcul/ }).click();
await page.getByRole('button', { name: 'Voir les résultats →' }).waitFor({ timeout: 600000 });
const err = await page.locator('.error-box').allInnerTexts();
if (err.length) console.log('Erreur calcul :', err);
await page.getByRole('button', { name: 'Voir les résultats →' }).click();
await page.waitForTimeout(2000);
console.log('Résultats :', (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 1500));
await shootAll('frame-resultats');
await page.getByRole('button', { name: /5\. Sol & calage/ }).click();
await page.waitForTimeout(2000);
console.log('Calage, mentions Prüfbuch :', await page.getByText(/Prüfbuch/).allInnerTexts());
await shootAll('frame-calage');
if (errors.length) console.log(`Erreurs navigateur : ${errors.join(' | ')}`);
await browser.close();
