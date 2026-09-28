// Test navigateur des unités : le modèle d'essai a une Viewbox (VBX-03) à plus de 2,5 m des autres → l'assistant
// propose 2 unités ; jeu généré = vue d'ensemble A0.x (vue aérienne avec les unités, façades) + séries A1.x, A2.x.
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
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.locator('.wizard-units').waitFor();
console.log('Assistant :', (await page.locator('.wizard-units').innerText()).replace(/\s+/g, ' '));
await page.locator('.wizard-unit input').nth(1).fill('Bar VIP');
console.log('Compte :', (await page.locator('.wizard .hint').last().innerText()).split('.')[0]);
await page.locator('.card', { has: page.locator('.wizard') }).screenshot({ path: shots + 'units-assistant.png' });
const t0 = Date.now();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
console.log('Jeu de plans généré en', Date.now() - t0, 'ms');
await page.waitForTimeout(2000);
console.log('Groupes :', (await page.locator('.sheet-group').allInnerTexts()).join(' | '));
const numbers = await page.locator('.sheet-thumb .thumb-foot b').allInnerTexts();
console.log('Planches :', numbers.join(' '));
await page.locator('.sheet-pages').screenshot({ path: shots + 'units-liste.png' });
for (let i = 0; i < numbers.length; i++) {
  await page.locator('.sheet-thumb').nth(i).click();
  await page.waitForTimeout(1200);
  await page.locator('.sheet-canvas').screenshot({ path: shots + `units-${numbers[i]}.png` });
}
// vue aérienne : noms des unités affichés
await page.locator('.sheet-thumb').nth(2).click();
await page.waitForTimeout(1200);
const texts = (await page.locator('.sheet-paper svg text').allTextContents()).map((t) => t.trim());
console.log('Vue aérienne — noms :', ['Unit 1', 'Bar VIP'].map((n) => `${n} ${texts.includes(n) ? 'OK' : 'ABSENT'}`).join(', '));
// façade de l'ensemble (A0.3) : masquer « Bar VIP » sur la 1re vue → vue recalculée et recotée, en une action
await page.locator('.sheet-thumb').nth(numbers.indexOf('A0.3')).click();
await page.waitForTimeout(1200);
const box = await page.locator('.sheet-paper svg').first().boundingBox();
const mm = box.width / 841;
const dimTexts = async () => (await page.locator('.sheet-paper svg text').allTextContents()).filter((t) => / mm$/.test(t.trim())).length;
const before = await dimTexts();
await page.mouse.click(box.x + 362 * mm, box.y + 176 * mm);
await page.waitForTimeout(500);
const chips = page.locator('.prop-field', { hasText: 'Unités affichées' }).locator('label.chip-toggle');
console.log('Unités affichées (vue) :', (await chips.allInnerTexts()).join(', '));
await chips.filter({ hasText: 'Bar VIP' }).click();
await page.waitForFunction(() => !document.body.innerText.includes('Calcul de la vue…'), null, { timeout: 120000 });
await page.waitForTimeout(1000);
console.log('Bar VIP masquée :', (await chips.filter({ hasText: 'Bar VIP' }).getAttribute('class')).includes('off') ? 'OK' : 'NON', '— cotes', before, '→', await dimTexts());
await page.locator('.sheet-canvas').screenshot({ path: shots + 'units-facade-sans-unite2.png' });
await page.keyboard.press('Escape');
await page.keyboard.press('Control+z');
await page.waitForTimeout(1200);
console.log('Annuler : cotes', await dimTexts(), '(avant :', before + ')');
await page.keyboard.press('Control+y');
await page.waitForTimeout(800);
// propriétés de la planche : partie du jeu
await page.locator('.sheet-thumb').nth(numbers.indexOf('A2.1')).click();
await page.waitForTimeout(800);
const part = page.locator('.prop-field', { hasText: 'Partie du jeu' }).locator('select');
console.log('Partie du jeu de A2.1 :', await part.locator('option:checked').innerText());
await page.getByText('✓ Enregistré').waitFor({ timeout: 30000 });
console.log('Enregistrement automatique : OK');
await page.getByRole('button', { name: '← Jeux de plans' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor();
console.log('Rouvert — groupes :', (await page.locator('.sheet-group').allInnerTexts()).join(' | '));
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
