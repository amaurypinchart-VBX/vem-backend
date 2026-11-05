// Test navigateur : planches consultables sans le modèle 3D (A. Pinchart 05.11.2026). 1) le jeu est généré (la 3D est
// demandée par « Générer »), ses vues sont enregistrées en arrière-plan (instantanés) ; 2) page rechargée, onglet
// Planches : le jeu s'ouvre sans télécharger le modèle 3D, toutes les vues dessinées, PDF du jeu ; 3) « Charger le
// modèle 3D » repasse en mode complet. Redémarrer le serveur de test avant (données en mémoire). BIG=1 : très gros modèle.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
mkdirSync(shots, { recursive: true });
const BASE = `http://localhost:${process.env.PORT || 4173}`;
const URL0 = `${BASE}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const check = (ok, msg) => {
  if (!ok) throw new Error('ÉCHEC : ' + msg);
  console.log('✔', msg);
};
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
if (process.env.BIG) await page.addInitScript(() => localStorage.setItem('vem_plans_bigmodel', '1'));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
const test = async (path) => (await (await fetch(BASE + path)).json()).data;

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 600000 });
// 1. Planches : sans jeu, rien n'est chargé ; « Générer » demande le modèle 3D puis ouvre l'assistant
// (PRE3D=1 : modèle 3D ouvert d'abord dans la Vue 3D, comme avant)
if (process.env.PRE3D) {
  await page.getByRole('button', { name: 'Vue 3D' }).click();
  await page.locator('canvas').first().waitFor({ timeout: 300000 });
  await page.waitForTimeout(2000);
}
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
// PAINT=1 : côtés extérieurs peints en RAL 7016 depuis l'assistant (repères + légende à retrouver en consultation)
if (process.env.PAINT) {
  await page.getByTestId('wizard-exterior').check({ timeout: 300000 });
  await page.getByTestId('wizard-ral').fill('7016');
  await page.locator('[data-testid="wizard-ral-results"] button').first().click();
}
await page.getByRole('button', { name: 'Générer', exact: true }).click({ timeout: 300000 });
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
check(!(await page.getByTestId('light-banner').count()), 'jeu généré avec le modèle 3D (pas de bandeau consultation)');
const sheets = await page.locator('.sheet-thumb').count();
// cotes et traits de chaque planche avec le modèle 3D (comparés ensuite à la consultation)
const countOf = async () => ({
  dims: await page.locator('.sheet-canvas text').filter({ hasText: /^[\d\s]+ mm$/ }).count(),
  paths: await page.locator('.sheet-canvas [data-dxf^="VBX-VUE"]').count(),
  tags: await page.locator('.sheet-canvas text').filter({ hasText: /^P\d+$/ }).count(),
  legend: await page.locator('.sheet-canvas text').filter({ hasText: /m²$/ }).allTextContents(),
});
const waitViews = async () => {
  for (let t = 0; t < 60; t++) {
    if (!(await page.locator('.sheet-canvas text', { hasText: 'Calcul de la vue' }).count())) break;
    await page.waitForTimeout(250);
  }
};
const full = [];
for (let i = 0; i < sheets; i++) {
  await page.locator('.sheet-thumb').nth(i).click();
  await waitViews();
  await page.waitForTimeout(300);
  full.push(await countOf());
}
// instantanés écrits en arrière-plan : on attend que le nombre d'entrées du cache partagé ne bouge plus
let last = -1;
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(2000);
  const n = (await test('/__test/linework')).count;
  if (n === last && i > 4) break;
  last = n;
}
console.log(`cache partagé : ${last} entrées (vues + instantanés) pour ${sheets} planches`);

// PDF du jeu avec le modèle 3D (comparé à celui de la consultation)
{
  const [d0] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.getByRole('button', { name: '⬇ PDF du jeu' }).click()]);
  await d0.saveAs(shots + 'consult-full.pdf');
}
// 2. rechargement : Planches sans le modèle 3D
const before = (await test('/__test/package-downloads')).count;
await page.goto(URL0);
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Ouvrir|Modifier/ }).first().click();
await page.locator('.sheet-editor').waitFor({ timeout: 60000 });
check(await page.getByTestId('light-banner').isVisible(), 'jeu ouvert en consultation (bandeau)');
let missing = 0;
let views = 0;
const diffs = [];
console.log('cotes par planche (modèle 3D) :', full.map((f) => f.dims).join(' '));
console.log('repères peinture par planche (modèle 3D) :', full.map((f) => f.tags).join(' '), '· légende :', full.find((f) => f.legend.length)?.legend.join(' ') ?? '—');
for (let i = 0; i < sheets; i++) {
  await page.locator('.sheet-thumb').nth(i).click();
  await waitViews();
  await page.waitForTimeout(300);
  missing += await page.locator('.sheet-canvas text', { hasText: 'pas encore prête' }).count();
  views += await page.locator('.sheet-canvas [data-dxf="VBX-VUE-VISIBLE"], .sheet-canvas [data-dxf="VBX-VUE-SILHOUETTE"]').count();
  const c = await countOf();
  if (c.dims !== full[i].dims || c.paths !== full[i].paths || c.tags !== full[i].tags || c.legend.join('|') !== full[i].legend.join('|'))
    diffs.push(`planche ${i + 1} : cotes ${full[i].dims} → ${c.dims}, traits ${full[i].paths} → ${c.paths}, repères ${full[i].tags} → ${c.tags}, légende ${full[i].legend.join('|')} → ${c.legend.join('|')}`);
}
check(!diffs.length, `mêmes cotes et traits qu’avec le modèle 3D${diffs.length ? ' — ' + diffs.join(' ; ') : ''}`);
await page.screenshot({ path: shots + 'consult.png' });
const after = (await test('/__test/package-downloads')).count;
check(after === before, `modèle 3D non téléchargé (${after - before} morceau(x) du paquet)`);
check(missing === 0, `toutes les vues dessinées sans la 3D (${missing} pas prête(s))`);
check(views > 0, `${views} calques de traits dessinés`);
// PDF du jeu en consultation (fait par le serveur)
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.getByRole('button', { name: '⬇ PDF du jeu' }).click()]);
await dl.saveAs(shots + 'consult.pdf');
check(true, `PDF en consultation : ${dl.suggestedFilename()}`);
// 3. un outil qui a besoin de la 3D la charge
await page.getByTestId('load-3d').click();
await page.getByTestId('light-banner').waitFor({ state: 'detached', timeout: 600000 });
check((await test('/__test/package-downloads')).count > after, 'modèle 3D chargé à la demande, mode complet');
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
if (errors.length) process.exit(1);
