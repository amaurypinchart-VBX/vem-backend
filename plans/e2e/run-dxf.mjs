// Test navigateur de l'export DXF : jeu généré → « ⬇ DXF » : planche affichée (.dxf) et tout le jeu en grandeur
// réelle (.zip). Fichiers dans e2e/shots/ (contrôle : python3 -c "import ezdxf; ezdxf.readfile(...).audit()").
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
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 }, acceptDownloads: true });
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
// une planche avec des vues (la 2e : 4 vues)
await page.locator('.sheet-thumb').nth(1).click();
await page.waitForTimeout(1000);
const n = await page.locator('.sheet-thumb').count();
for (const [scope, mode, file] of [
  ['La planche affichée', 'Planche complète', 'planche.dxf'],
  ['La planche affichée', 'Vues en grandeur réelle', 'planche-reelle.dxf'],
  ['un \\.zip avec', 'Vues en grandeur réelle', 'jeu-reel.zip'],
  ['un \\.zip avec', 'Planche complète', 'jeu.zip'],
  ['dans un seul', 'Planche complète', 'jeu-complet.dxf'],
  ['dans un seul', 'Vues en grandeur réelle', 'jeu-complet-reel.dxf'],
]) {
  await page.getByRole('button', { name: '⬇ DXF', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Export DXF' });
  await dlg.getByLabel(new RegExp(scope)).check();
  await dlg.getByLabel(new RegExp(mode)).check();
  if (file === 'planche.dxf') await page.screenshot({ path: shots + 'dxf-dialog.png' });
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), dlg.getByRole('button', { name: '⬇ Télécharger' }).click()]);
  await dl.saveAs(shots + file);
  console.log(`${scope} / ${mode} : ${dl.suggestedFilename()} en ${Date.now() - t0} ms (${n} planches dans le jeu)`);
}
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
