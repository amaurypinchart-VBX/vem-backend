// Test navigateur de l'onglet « 🧪 Variantes » (phase S10) : modèle analysé → reconnaissance → calcul de l'étude →
// variante « poteaux 5 m + rives UPN 160 » (indicateurs instantanés, assemblages hors gabarit), calcul, comparaison,
// diagnostic, recherche des changements minimaux et « Tester ». Captures dans e2e/shots/variants-*.png.
//   node e2e/server.mjs   puis   node e2e/run-variants.mjs
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
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
async function shootAll(name) {
  const h = await page.evaluate(() => document.querySelector('main').scrollHeight);
  for (let k = 0, y = 0; y < h && k < 6; k++, y += 900) {
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
// reconnaissance : tout ce qui n'est pas une Viewbox est ignoré
if (await page.getByRole('button', { name: /Traiter la file/ }).count()) {
  await page.getByRole('button', { name: /Traiter la file/ }).click();
  for (let k = 0; k < 40; k++) {
    await page.getByText('Qu’est-ce que c’est ?').waitFor({ timeout: 8000 }).catch(() => {});
    if (!(await page.getByText('Qu’est-ce que c’est ?').count())) break;
    const isModule = await page.getByText('Gabarit de calcul').count();
    const next = page.getByRole('button', { name: 'Valider et suivant' });
    if (!isModule) await page.getByRole('button', { name: 'Ignorer (non structurel)' }).click();
    else if (await next.count()) await next.click();
    else await page.getByRole('button', { name: 'Valider', exact: true }).click();
    await page.waitForTimeout(300);
  }
}
// sol : portance (sinon étape 2 en rouge), puis calcul de l'étude
await page.getByRole('button', { name: /3\. Calcul/ }).click();
await page.getByRole('button', { name: /Lancer le calcul/ }).click({ timeout: 10000 });
await page.getByRole('button', { name: /Voir les résultats/ }).waitFor({ timeout: 600000 });
console.log('Étude :', (await page.getByText(/passe|limite|ne passe pas|incomplet/).first().innerText()).trim());

// ─── onglet Variantes ───
await page.getByRole('button', { name: /Variantes/ }).click();
await page.getByRole('heading', { name: '🧪 Variantes' }).waitFor();
await page.getByRole('button', { name: '＋ Nouvelle variante' }).click();
await page.getByRole('heading', { name: 'Modifier' }).waitFor();
await page.getByRole('button', { name: '5,00 m', exact: true }).click();
// rives du plancher et de toiture en UPN 160 du catalogue
const rows = page.locator('table.list').filter({ hasText: 'Barres' }).locator('tbody tr');
for (const label of ['rives du plancher', 'rives de toiture']) {
  const sel = rows.filter({ hasText: label }).locator('select').first();
  const value = await sel.locator('option', { hasText: /^UPN 160/ }).getAttribute('value');
  await sel.selectOption(value);
}
await page.waitForTimeout(500);
console.log('Indicateurs :', (await page.getByText(/^Poids des Viewbox/).innerText()).replace(/\s+/g, ' '));
console.log('Alertes :', (await page.getByText(/maintien intermédiaire/).allInnerTexts()).length, 'Viewbox');
console.log('Assemblages :', (await page.locator('b', { hasText: /Angle poteau|Plats de liaison|Boulons horizontaux|Contact vertical/ }).allInnerTexts()).join(' | '));
await shootAll('variants-editeur');
await page.getByRole('button', { name: 'Calculer la variante' }).click();
await page.getByRole('heading', { name: /^V1 — / }).waitFor({ timeout: 600000 });
console.log('V1 :', (await page.locator('.card', { has: page.getByRole('heading', { name: /^V1 — / }) }).locator('.card-head').innerText()).replace(/\s+/g, ' '));
await shootAll('variants-comparaison');
const compare = page.locator('.card', { has: page.getByRole('heading', { name: 'Comparaison' }) });
console.log('Comparaison :', (await compare.locator('tbody tr').allInnerTexts()).slice(0, 8).map((t) => t.replace(/\s+/g, ' ')));
// pourquoi ça ne passe pas + optimiseur
if (await page.getByRole('button', { name: /Chercher les changements minimaux/ }).count()) {
  await page.locator('label', { hasText: 'durée maxi' }).locator('select').selectOption('5');
  await page.getByRole('button', { name: /Chercher les changements minimaux/ }).click();
  // progression de l'optimiseur (texte d'avancement)
  const seen = new Set();
  for (let k = 0; k < 400 && !(await page.getByText(/^Propositions \(/).count()); k++) {
    const t = await page.locator('.card-body.hint.row', { hasText: 'Arrêter' }).first().innerText().catch(() => '');
    if (t && !seen.has(t)) {
      seen.add(t);
      console.log('  ·', t.replace(/\s+/g, ' ').replace('Arrêter', '').trim());
    }
    await page.waitForTimeout(700);
  }
  await page.getByText(/^Propositions \(/).waitFor({ timeout: 300000 });
  console.log('Propositions :', (await page.locator('div', { hasText: /^P\d Passe avec/ }).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').slice(0, 200)));
  console.log('Essais :', (await page.locator('li.opt-try').allTextContents()).map((t) => t.replace(/\s+/g, ' ')));
  console.log('En-tête :', await page.getByText(/^Propositions \(/).innerText());
  console.log('Notes :', await page.getByText(/^Aucune solution simple|^Reste :|essai\(s\) impossibles|^Meilleure piste|^Recherche arrêtée/).allInnerTexts());
  await shootAll('variants-propositions');
  const test = page.getByRole('button', { name: 'Tester (créer la variante)' }).first();
  if (await test.count()) {
    await test.click();
    await page.getByRole('heading', { name: /^V2 — / }).waitFor();
    console.log('V2 :', (await page.locator('.card', { has: page.getByRole('heading', { name: /^V2 — / }) }).locator('.card-head').innerText()).replace(/\s+/g, ' '));
  }
}
await page.getByRole('button', { name: /Afficher les résultats détaillés/ }).click();
await page.waitForTimeout(2500);
await shootAll('variants-detail');
await page.waitForTimeout(2000); // enregistrement des variantes avec l'étude
console.log(errors.length ? `Erreurs console : ${errors.join(' | ')}` : 'Aucune erreur console');
await browser.close();
