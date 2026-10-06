// Test navigateur de l'onglet « 2. Site & hypothèses » expliqué (kg, km/h, neige) : saisie d'une portance de 400 kg/m²,
// zone de vent, neige, revêtement de sol ajouté ; valeurs reprises après rechargement. Captures dans e2e/shots/site-*.png.
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
await page.getByRole('button', { name: /2\. Site & hypothèses/ }).click();
await page.getByText('Poids que le sol supporte (portance)').waitFor();
await shootAll('site-defaut');
const row = (label) => page.locator('div', { has: page.getByText(label, { exact: true }) }).filter({ has: page.locator('input') }).last();
await row('Poids que le sol supporte (portance)').locator('input').fill('400');
await page.waitForTimeout(300);
console.log('Portance :', (await page.getByText(/= [\d,]+ kN\/m² = [\d,]+ tonnes par m²/).innerText()).trim());
// zone 2 de l'intérieur des terres (1re ligne), puis zone 4 côte (statico 18-0573 : 0,79 kN/m² à 6 m)
await page.getByRole('button', { name: /^Zone 4 : \d+ km\/h/ }).nth(1).click();
await page.waitForTimeout(200);
console.log('Vent zone 4 côte :', await row('Tempête à supporter, installation vide').locator('input').inputValue(), 'km/h');
await page.getByRole('button', { name: /^Zone 2 : \d+ km\/h/ }).first().click();
console.log('Public RDC :', await row('Charge du public au rez-de-chaussée').locator('input').inputValue(), 'kg/m² ; étages', await row('Charge du public aux étages').locator('input').inputValue(), 'kg/m²');
await page.getByRole('button', { name: /Allemagne zone 1, plaine/ }).click();
await page.waitForTimeout(300);
console.log('Vent hors service :', await row('Tempête à supporter, installation vide').locator('input').inputValue(), 'km/h —', (await page.getByText(/^= [\d,]+ kN\/m²$/).allInnerTexts()).join(' / '));
console.log('Neige :', (await page.getByText(/^toitures : /).innerText()).trim());
await row('Revêtement de sol en plus (par m²)').locator('input').fill('30');
console.log('Murs / vitrages :', (await page.getByText(/Dans ce modèle :/).innerText().catch(() => 'aucun objet porté')).trim());
await page.getByText('Options avancées du calage').click();
await shootAll('site-saisi');
await page.waitForTimeout(2600);
await page.reload();
await page.getByRole('button', { name: 'Ouvrir' }).first().click().catch(() => {});
await page.getByRole('button', { name: 'Étude structure' }).click();
await page.getByRole('button', { name: /2\. Site & hypothèses/ }).click();
await page.getByText('Poids que le sol supporte (portance)').waitFor();
console.log('Après rechargement : portance', await row('Poids que le sol supporte (portance)').locator('input').inputValue(), '; neige', await row('Neige au sol sur le site').locator('input').inputValue(), 'kg/m² ; sol en plus', await row('Revêtement de sol en plus (par m²)').locator('input').inputValue(), 'kg/m²');
if (errors.length) throw new Error(`Erreurs navigateur : ${errors.join(' | ')}`);
await browser.close();
