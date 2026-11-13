// Test navigateur de l'onglet « Toiture » (plan de contrôle de l'étanchéité) : points trouvés sur le modèle de test,
// plan par niveau, sélection d'un point, publication dans VEM (serveur de test), republication sans changement.
//   node e2e/server.mjs   puis   node e2e/run-roof.mjs      (captures dans e2e/shots/roof-*.png)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
mkdirSync(shots, { recursive: true });
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const check = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) process.exitCode = 1; };

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByTestId('tab-roof').click();
await page.getByTestId('roof-plan').waitFor({ timeout: 120000 });
await page.getByTestId('roof-state').getByText('Pas encore publié').waitFor();
const dots = await page.locator('[data-testid="roof-plan"] g circle').count();
check(dots > 0, `pastilles sur le plan (${dots})`);
const chips = (await page.locator('.chip').allInnerTexts()).join(' | ');
console.log('  ', chips);
check(/Jonction/.test(chips) && /Angle de toiture/.test(chips), 'jonctions et angles trouvés');
await page.screenshot({ path: `${shots}roof-plan.png` });

await page.locator('table.list tr').first().click();
await page.getByTestId('roof-selected').waitFor();
check((await page.getByTestId('roof-selected').innerText()).length > 5, 'point sélectionné décrit');

await page.getByTestId('roof-publish').click();
await page.getByTestId('roof-done').waitFor({ timeout: 30000 });
check(/publié dans VEM/.test(await page.getByTestId('roof-done').innerText()), 'publication réussie');
check(/publication n° 1/.test(await page.getByTestId('roof-state').innerText()), 'état : publication n° 1');
check(/à jour avec ce modèle/.test(await page.getByTestId('roof-state').innerText()), 'à jour avec ce modèle');
await page.getByTestId('roof-publish').click();
await page.getByText(/publication n° 2/).waitFor({ timeout: 30000 });
check(true, 'republication (n° 2)');
await page.screenshot({ path: `${shots}roof-published.png` });

check(!errors.length, `aucune erreur dans la page${errors.length ? ' : ' + errors.join(' ; ') : ''}`);
await browser.close();
