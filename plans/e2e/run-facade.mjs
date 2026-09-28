// Test navigateur : repères façade (hachure « // » des vitres, portes et murs en couleur) sur les élévations d'un jeu
// généré, puis détail type « coupes profils » ajouté, mis à 1:5, conservé à la réouverture.
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
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
check('assistant : repères façade cochés par défaut', await page.getByLabel(/Repères façade/).isChecked());
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(1500);

// élévations (A0.2 grands côtés, A0.3 petits côtés) : traits de couleur des repères
const marks = () =>
  page.evaluate(() => {
    const c = {};
    for (const p of document.querySelectorAll('.sheet-paper svg path[stroke]')) {
      const s = p.getAttribute('stroke');
      if (s && s !== '#000' && s !== 'none' && !s.startsWith('#9') && !s.startsWith('#c')) c[s] = (c[s] || 0) + (p.getAttribute('d').match(/M/g) || []).length;
    }
    return c;
  });
for (const i of [2, 3, 5]) {
  await page.locator('.sheet-thumb').nth(i).click();
  await page.waitForTimeout(1500);
  const m = await marks();
  const n = await page.locator('.sheet-thumb .thumb-foot b').nth(i).innerText();
  console.log(`   ${n} : traits de couleur`, JSON.stringify(m));
  check(`${n} : repères façade présents`, Object.keys(m).length > 0);
  await page.locator('.sheet-canvas').screenshot({ path: shots + `facade-${n}.png` });
}
// la vue de dessus (A0.1) n'a pas de hachure de vitrage
await page.locator('.sheet-thumb').nth(1).click();
await page.waitForTimeout(1200);

// détail type
await page.locator('.sheet-thumb').nth(2).click();
await page.waitForTimeout(800);
await page.getByRole('button', { name: '▦ Détail' }).click();
await page.waitForTimeout(300);
check('détail ajouté (Ø24, Section details)', (await page.locator('.sheet-paper svg text', { hasText: 'Ø24' }).count()) === 1 && (await page.locator('.sheet-paper svg text', { hasText: 'Section details' }).count()) === 1);
check('détail à 1:10', (await page.locator('.sheet-props select').first().inputValue()) === '10');
await page.locator('.sheet-props select').first().selectOption('5');
await page.waitForTimeout(300);
check('détail passé à 1:5', (await page.locator('.sheet-paper svg text', { hasText: '1:5' }).count()) >= 1);
await page.keyboard.press('Escape');
await page.locator('.sheet-canvas').screenshot({ path: shots + 'detail.png' });
await page.getByText('✓ Enregistré').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: '← Jeux de plans' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor();
await page.locator('.sheet-thumb').nth(2).click();
await page.waitForTimeout(1200);
check('jeu rouvert : détail conservé', (await page.locator('.sheet-paper svg text', { hasText: 'Ø24' }).count()) === 1);
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
