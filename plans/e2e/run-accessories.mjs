// Test navigateur de l'onglet « 🔩 Accessoires » (phase S11) : clamp sous le gousset (modèle de départ) → données
// manquantes listées → formulaire rempli → dessin 3D importé (plaque reconnue) → assistant IA (simulé) → bibliothèque
// → « Calculer l'étude avec cette pièce » (variante calculée et comparée dans l'onglet Variantes).
//   node e2e/server.mjs   puis   node e2e/run-accessories.mjs
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
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

// dessin d'une plaque 200 × 80 × 15 mm (.dae façon SketchUp, en pouces, Z en haut)
function plateDae() {
  const IN = 25.4;
  const [L, W, T] = [200 / IN, 80 / IN, 15 / IN];
  const v = [
    [0, 0, 0], [L, 0, 0], [L, W, 0], [0, W, 0],
    [0, 0, T], [L, 0, T], [L, W, T], [0, W, T],
  ];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  return `<?xml version="1.0" encoding="utf-8"?>
<COLLADA xmlns="http://www.collada.org/2005/11/COLLADASchema" version="1.4.1">
<asset><unit meter="0.0254" name="inch"/><up_axis>Z_UP</up_axis></asset>
<library_geometries><geometry id="g"><mesh>
<source id="p"><float_array id="pa" count="${v.length * 3}">${v.flat().join(' ')}</float_array>
<technique_common><accessor source="#pa" count="${v.length}" stride="3"><param name="X" type="float"/><param name="Y" type="float"/><param name="Z" type="float"/></accessor></technique_common></source>
<vertices id="v"><input semantic="POSITION" source="#p"/></vertices>
<triangles count="${f.length}"><input semantic="VERTEX" source="#v" offset="0"/><p>${f.flat().join(' ')}</p></triangles>
</mesh></geometry></library_geometries>
<library_visual_scenes><visual_scene id="s"><node id="n" name="clamp"><instance_geometry url="#g"/></node></visual_scene></library_visual_scenes>
<scene><instance_visual_scene url="#s"/></scene>
</COLLADA>`;
}
const daePath = shots + 'clamp-test.dae';
writeFileSync(daePath, plateDae());

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Étude structure' }).click();
await page.getByText('Vue 3D — statut des pièces').waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);
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
await page.getByRole('button', { name: /3\. Calcul/ }).click();
await page.getByRole('button', { name: /Lancer le calcul/ }).click({ timeout: 10000 });
await page.getByRole('button', { name: /Voir les résultats/ }).waitFor({ timeout: 600000 });

// ─── atelier des accessoires ───
await page.getByRole('button', { name: /Accessoires/ }).click();
await page.getByRole('heading', { name: '🔩 Accessoires et liaisons' }).waitFor();
await page.locator('select', { has: page.locator('option', { hasText: '＋ Nouvelle pièce à partir de…' }) }).selectOption('JD-CLAMP-GOUSSET');
await page.getByText(/⛔ Incomplet — à renseigner/).waitFor();
console.log('Données manquantes :', (await page.locator('.error-box li').allInnerTexts()).length, '—', (await page.locator('.error-box li').allInnerTexts()).slice(0, 4));
await shootAll('accessoires-incomplet');
// formulaire : composants du clamp (C clamp, G gousset, WG soudure, F platine, B boulon)
const row = (id) => page.locator('table.list tr', { has: page.locator('td b', { hasText: new RegExp(`^${id}$`) }) });
const fill = async (id, idx, v) => row(id).locator('input:not([type=checkbox])').nth(idx).fill(String(v));
await row('C').locator('select').first().selectOption('S355');
await fill('C', 2, 80); // largeur
await fill('C', 4, 22); // trou
await fill('C', 5, 40);
await fill('C', 6, 40);
await fill('G', 1, 15);
await fill('G', 2, 100);
await row('G').locator('select').first().selectOption('S235');
await fill('WG', 1, 5);
await fill('WG', 2, 200);
await fill('F', 4, 22);
await fill('F', 5, 40);
await fill('F', 6, 40);
await row('B').locator('select').nth(1).selectOption('8.8');
// bras de levier des plaques en flexion (soulèvement)
const levers = page.locator('div.row', { hasText: 'plaque en flexion (console' }).locator('input').filter({ hasNot: page.locator('[type=checkbox]') });
const nLev = await page.locator('div.row', { has: page.locator('option:checked', { hasText: 'plaque en flexion (console, une rotule)' }) }).count();
for (let k = 0; k < nLev; k++) await page.locator('div.row', { has: page.locator('option:checked', { hasText: 'plaque en flexion (console, une rotule)' }) }).nth(k).locator('input').first().fill('40');
void levers;
await page.waitForTimeout(400);
console.log('Statut :', await page.locator('.card-head .badge').first().innerText(), '·', (await page.getByText(/par pièce ·/).allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')));
// dessin 3D
await page.locator('input[type=file][accept=".dae,.zip"]').setInputFiles(daePath);
await page.getByText(/^PL1 : plaque/).waitFor({ timeout: 30000 }).catch(async () => console.log('Dessin :', await page.locator('.card', { hasText: 'Dessin 3D' }).innerText()));
console.log('Dessin reconnu :', await page.getByText(/plaque 15 mm/).first().innerText().catch(() => '—'));
// assistant (simulé)
await page.getByPlaceholder(/La pièce passe sous le gousset/).fill('La pièce passe sous le gousset trapèze et un M20 la tient depuis la platine de pied. Comment tu la calcules ?');
await page.getByRole('button', { name: 'Envoyer' }).click();
await page.getByRole('button', { name: /Appliquer la proposition/ }).waitFor({ timeout: 30000 });
console.log('Assistant :', (await page.getByText(/J’ai compris/).innerText()).slice(0, 160));
await page.getByRole('button', { name: /Appliquer la proposition/ }).click();
await shootAll('accessoires-rempli');
// bibliothèque
await page.getByRole('button', { name: 'Mémoriser dans la bibliothèque' }).click();
await page.waitForTimeout(1500);
console.log('Bibliothèque :', await page.locator('optgroup[label="Bibliothèque"] option').allInnerTexts());
// calcul de l'étude avec la pièce
await page.getByRole('button', { name: 'Calculer l’étude avec cette pièce' }).click();
await page.getByRole('heading', { name: /^V1 — Liaison/ }).waitFor({ timeout: 600000 });
console.log('V1 :', (await page.locator('.card', { has: page.getByRole('heading', { name: /^V1 — / }) }).locator('.card-head').innerText()).replace(/\s+/g, ' '));
const compare = page.locator('.card', { has: page.getByRole('heading', { name: 'Comparaison' }) });
console.log('Comparaison :', (await compare.locator('tbody tr').allInnerTexts()).filter((t) => /Verdict|Liaisons verticales|Glissement entre/.test(t)).map((t) => t.replace(/\s+/g, ' ')));
await shootAll('accessoires-variante');
console.log(errors.length ? `Erreurs console : ${errors.join(' | ')}` : 'Aucune erreur console');
await browser.close();
