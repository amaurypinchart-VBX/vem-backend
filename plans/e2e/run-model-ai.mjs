// Test navigateur de l'analyse IA du modèle (S12.6) sur le modèle Permabox « Viewbox Light V4 » : étape 1 →
// « 🤖 Analyser le modèle avec l'IA » (réponse simulée par server.mjs) → panneau « Ce que l'IA a reconnu » → accepter une
// ligne, tout accepter, refuser, répondre à la question et relancer → atelier avec les propositions → annuler l'analyse.
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
const counts = async () => (await page.getByText(/type\(s\) à renseigner/).first().innerText()).replace(/\s+/g, ' ');
await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Étude structure' }).click();
await page.getByText('Vue 3D — statut des pièces').waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);
const before = await counts();
console.log('Avant :', before, '·', await page.getByText(/coût estimé/).innerText());
await page.getByRole('button', { name: '🤖 Analyser le modèle avec l’IA' }).click();
const panel = page.locator('.card', { has: page.getByRole('heading', { name: '🤖 Ce que l’IA a reconnu' }) });
await panel.waitFor({ timeout: 120000 });
console.log('Après analyse :', await counts());
console.log('Panneau :', (await panel.innerText()).replace(/\s+/g, ' ').slice(0, 900));
await page.screenshot({ path: `${shots}model-ai-panneau.png` });
// accepter une ligne, en refuser une, puis tout accepter
const rows = panel.locator('tbody tr', { has: page.getByRole('button', { name: '✔' }) });
await rows.first().getByRole('button', { name: '✔' }).click();
await page.waitForTimeout(300);
await rows.first().getByRole('button', { name: '✖' }).click();
await page.waitForTimeout(300);
await panel.getByRole('button', { name: /Tout accepter/ }).click();
await page.waitForTimeout(500);
console.log('Après « tout accepter » :', await counts(), '· acceptés :', await panel.getByText('accepté', { exact: true }).count(), '· refusés :', await panel.getByText('refusé', { exact: true }).count());
// question → relance avec la réponse (une seule)
await panel.getByLabel('Réponse 1').fill('Non, une seule hauteur pour l’instant.');
await panel.getByRole('button', { name: /Relancer avec mes réponses/ }).click();
await panel.getByRole('button', { name: /Relancer avec mes réponses/ }).waitFor({ state: 'detached', timeout: 120000 }).catch(() => {});
console.log('Après relance :', (await panel.innerText()).includes('Relancer avec mes réponses') ? 'question encore là' : 'plus de question (relance faite)', '· acceptés gardés :', await panel.getByText('accepté', { exact: true }).count());
// atelier : propositions de l'IA sur la structure relevée
await panel.getByRole('button', { name: /Ouvrir l’atelier|Modifier/ }).first().click();
await page.getByText('Qu’est-ce que c’est ?').waitFor();
await page.getByRole('button', { name: /Créer un type de structure/ }).first().click();
const ws = page.locator('.card', { has: page.getByRole('heading', { name: '🏗 Atelier structure' }) }).last();
await ws.waitFor();
const aiCard = ws.locator('.card', { hasText: 'Propositions de l’analyse IA' }).first();
console.log('Atelier :', (await aiCard.innerText()).replace(/\s+/g, ' ').slice(0, 500));
await aiCard.getByRole('button', { name: 'Appliquer les propositions de l’IA' }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}model-ai-atelier.png` });
await ws.getByRole('button', { name: '✕' }).first().click();
// annuler : retour exact à l'état d'avant
page.once('dialog', (d) => d.accept());
await panel.getByRole('button', { name: /Annuler l’analyse IA/ }).click();
await page.waitForTimeout(800);
const after = await counts();
console.log('Après annulation :', after, after === before ? '(identique à avant)' : '(DIFFÉRENT)');
await page.screenshot({ path: `${shots}model-ai-annule.png` });
if (errors.length) console.log(`Erreurs navigateur : ${errors.join(' | ')}`);
await browser.close();
