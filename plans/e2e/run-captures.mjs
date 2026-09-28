// Test navigateur des captures : Vue 3D → 2 captures (enregistrées avec le modèle, renommées) → Planches A1 → clic sur
// une image 3D = galerie dans les propriétés, double-clic = grande liste, 📷 Image 3D = ajout depuis la liste →
// légende complète → réouverture du jeu et de la page (captures et images conservées).
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
const check = (label, ok) => console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${label}`);

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });

// ─── Vue 3D : deux captures ───
await page.getByRole('button', { name: 'Vue 3D' }).click();
await page.locator('.viewer-canvas canvas').waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);
const capture = async (camera) => {
  if (camera) await page.locator('.viewer-page select').first().selectOption({ label: camera });
  await page.getByRole('button', { name: '📷 Capturer' }).click();
};
await capture();
await page.getByText('✓ disponible dans les planches').first().waitFor({ timeout: 120000 });
await capture('Iso NE — axonométrie');
await page.waitForFunction(() => document.querySelectorAll('.capture').length === 2 && !document.body.innerText.includes('enregistrement…'), null, { timeout: 120000 });
check('2 captures enregistrées', (await page.getByText('✓ disponible dans les planches').count()) === 2);
const nameInput = page.locator('.capture input[type=text]').first();
await nameInput.fill('3D entrée principale');
await nameInput.press('Enter');
await page.waitForTimeout(300);
await page.locator('.viewer-page').screenshot({ path: shots + 'captures-vue3d.png' });

// ─── Planches : générer un jeu ───
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(1500);

// légende sur une planche de vues (la couverture n'en a pas)
await page.locator('.sheet-thumb').nth(1).click();
await page.waitForTimeout(800);
check('légende complète (7 couleurs Viewbox, planche sans vue colorée)', (await page.locator('.sheet-paper svg text', { hasText: 'Full Sliding Door' }).count()) === 1 && (await page.locator('.sheet-paper svg text', { hasText: 'Windows Seamless' }).count()) === 1);
await page.locator('.sheet-canvas').screenshot({ path: shots + 'legende.png' });

// première planche qui contient une image 3D
const thumbs = page.locator('.sheet-thumb');
let found = false;
for (let i = 0; i < (await thumbs.count()); i++) {
  await thumbs.nth(i).click();
  await page.waitForTimeout(600);
  if ((await page.locator('.sheet-paper svg image').count()) > 0) {
    found = true;
    break;
  }
}
check('planche avec image 3D', found);
const img = page.locator('.sheet-paper svg image').first();
const hrefOf = () => img.getAttribute('href');
const before = await hrefOf();
const clickImage = async (count = 1) => {
  const b = await img.boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, { clickCount: count });
};
await clickImage();
await page.waitForTimeout(300);
const tiles = page.locator('.sheet-props .capture-tile');
check(`galerie dans les propriétés (${await tiles.count()} images)`, (await tiles.count()) >= 3);
check('capture renommée proposée', (await page.locator('.sheet-props .capture-tile', { hasText: '3D entrée principale' }).count()) === 1);
await page.locator('.sheet-props').screenshot({ path: shots + 'captures-proprietes.png' });
await page.locator('.sheet-props .capture-tile', { hasText: '3D entrée principale' }).click();
await page.waitForTimeout(300);
const afterPick = await hrefOf();
check('clic sur une capture = image remplacée', afterPick !== before && afterPick.startsWith('/blob/'));
check('capture choisie marquée', (await page.locator('.sheet-props .capture-tile.on', { hasText: '3D entrée principale' }).count()) === 1);
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
check('annuler le choix', (await hrefOf()) === before);
await page.keyboard.press('Control+y');
await page.waitForTimeout(300);

// double-clic = grande liste
await clickImage(2);
await page.locator('.capture-picker').waitFor({ timeout: 5000 });
await page.screenshot({ path: shots + 'captures-fenetre.png' });
await page.locator('.capture-picker .capture-tile', { hasText: 'vue libre' }).click();
await page.waitForTimeout(300);
check('double-clic → grande liste → image remplacée', (await page.locator('.capture-picker').count()) === 0 && (await hrefOf()) !== afterPick);
const chosen = await hrefOf();

// Échap ferme sans toucher à l'image (ni la supprimer)
await clickImage(2);
await page.locator('.capture-picker').waitFor();
await page.keyboard.press('Delete');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('Échap ferme, Suppr sans effet derrière la fenêtre', (await page.locator('.capture-picker').count()) === 0 && (await hrefOf()) === chosen);

// ajout depuis la barre d'outils
const n0 = await page.locator('.sheet-paper svg image').count();
await page.getByRole('button', { name: '📷 Image 3D' }).click();
await page.locator('.capture-picker .capture-tile').first().click();
await page.waitForTimeout(300);
check('📷 Image 3D → ajout depuis la liste', (await page.locator('.sheet-paper svg image').count()) === n0 + 1);
await page.locator('.sheet-canvas').screenshot({ path: shots + 'captures-planche.png' });

// réouverture du jeu puis de la page entière
await page.getByText('✓ Enregistré').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: '← Jeux de plans' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor();
let kept = false;
for (let i = 0; i < (await thumbs.count()) && !kept; i++) {
  await thumbs.nth(i).click();
  await page.waitForTimeout(400);
  kept = (await page.locator(`.sheet-paper svg image[href="${chosen}"]`).count()) > 0;
}
check('jeu rouvert : image choisie conservée', kept);
await page.reload();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.getByRole('button', { name: 'Vue 3D' }).click();
await page.locator('.viewer-canvas canvas').waitFor({ timeout: 120000 });
await page.waitForFunction(() => document.querySelectorAll('.capture').length > 0, null, { timeout: 30000 }).catch(() => {});
check('page rechargée : captures toujours là', (await page.locator('.capture').count()) === 2 && (await page.locator('.capture input[type=text]').first().inputValue()) === '3D entrée principale');
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
