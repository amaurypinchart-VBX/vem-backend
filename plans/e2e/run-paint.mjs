// Test navigateur de la peinture : jeu généré → planche d'une Viewbox → 🎨 Peinture → « ＋ Couleur » RAL 9005 (recherche
// « noir foncé ») → tape une face d'une vue → bulle (cible, couleur) → Appliquer → repère P1 + légende « PAINTING » →
// pipette → gomme → annuler / rétablir → rechargement (peinture gardée) → PDF (légende, repère) et DXF (calque
// VBX-PEINTURE-RAL9005) → même parcours au doigt (Pixel 7). Captures dans e2e/shots/paint-*.png.
import { chromium, devices } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
mkdirSync(shots, { recursive: true });
const PORT = process.env.PORT || 4173;
const URL0 = `http://localhost:${PORT}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const check = (ok, msg) => { if (!ok) throw new Error('ÉCHEC : ' + msg); console.log('✔', msg); };
const errors = [];
const watch = (page) => {
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
};

// ─── ordinateur ───
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
watch(page);
await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
const hasSet = await page.getByRole('button', { name: 'Ouvrir' }).count();
if (hasSet) await page.getByRole('button', { name: 'Ouvrir' }).first().click();
else {
  await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
  await page.getByRole('button', { name: 'Générer', exact: true }).click();
}
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(2000);
// planche « une par Viewbox » (vues Front / Back / Top / Left / Right)
await page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: 'Front' }) }).first().click();
await page.waitForTimeout(2500);

await page.getByTestId('tool-paint').click();
await page.getByTestId('paint-panel').waitFor();
check(/Aucune couleur/.test(await page.getByTestId('paint-panel').innerText()), 'panneau « Peinture du projet » vide');
await page.getByTestId('paint-new-color').click();
await page.getByTestId('ral-search').fill('noir foncé');
await page.locator('[data-testid="ral-results"] .paint-swatch').first().click();
check(/RAL 9005/.test(await page.locator('.color-dialog-chosen').innerText()), 'RAL trouvé par son nom français');
await page.locator('.color-dialog select').first().selectOption('mat');
await page.getByTestId('color-ok').click();
await page.getByTestId('paint-color-P1').waitFor();
check(true, 'couleur P1 · RAL 9005 mat dans la palette');

const toScreen = (x, y) =>
  page.evaluate(([x, y]) => {
    const m = document.querySelector('.sheet-canvas svg').getScreenCTM();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }, [x, y]);
const vpRects = await page.evaluate(() =>
  [...document.querySelectorAll('.sheet-canvas svg [data-item-type="viewport"] clipPath rect')].map((r) => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') })),
);
check(vpRects.length >= 5, `${vpRects.length} vues sur la planche`);
// on tape une grille de points dans la vue Front jusqu'à toucher une pièce (bulle)
const front = vpRects[0];
let ok = false;
let hitPoint = null;
for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
  for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const s = await toScreen(front.x + front.w * fx, front.y + front.h * fy);
    await page.mouse.click(s.x, s.y);
    if (await page.getByTestId('paint-bubble').isVisible().catch(() => false)) {
      ok = true;
      hitPoint = s;
      break;
    }
  }
  if (ok) break;
}
check(ok, 'tape sur une face : bulle de peinture');
console.log('Bulle :', (await page.getByTestId('paint-bubble').innerText()).replace(/\n+/g, ' | '));
check(await page.getByTestId('paint-target-face-box').isChecked(), 'cible par défaut : « Cette face » (cette Viewbox)');
check((await page.locator('[data-paint-preview]').count()) > 0, 'aperçu orange de la face avant de peindre');
await page.screenshot({ path: shots + 'paint-bubble.png' });
await page.getByTestId('paint-apply').click();
await page.waitForTimeout(1500);
const tags = () => page.locator('.sheet-canvas svg [data-dxf="VBX-PEINTURE-REPERES"] text');
check((await tags().count()) >= 1, `repère P1 sur la planche (${await tags().count()} vue(s))`);
check((await page.locator('.sheet-canvas svg [data-item-type="paintLegend"]').count()) === 1, 'légende « PAINTING » ajoutée');
check(/PAINTING/.test(await page.locator('.sheet-canvas svg [data-item-type="paintLegend"]').textContent()), 'légende : titre PAINTING, RAL 9005');
check(/1 zone/.test(await page.getByTestId('paint-panel').innerText()), 'zone listée avec sa surface');
await page.screenshot({ path: shots + 'paint-desktop.png' });

// pipette : la face peinte donne sa couleur et sa zone
await page.getByTestId('paint-mode-pipette').click();
await page.mouse.click(hitPoint.x, hitPoint.y);
await page.waitForTimeout(400);
check((await page.locator('.paint-zone.on').count()) === 1, 'pipette : zone de la face choisie');
// gomme puis annuler / rétablir au clavier (outil Peinture actif : historique de la peinture)
await page.getByTestId('paint-mode-eraser').click();
const n1 = await tags().count();
await page.mouse.click(hitPoint.x, hitPoint.y);
await page.waitForTimeout(1200);
check((await tags().count()) === 0, 'gomme : peinture retirée');
await page.keyboard.press('Control+z');
await page.waitForTimeout(1200);
check((await tags().count()) === n1, 'Ctrl+Z : peinture remise');
await page.keyboard.press('Control+y');
await page.waitForTimeout(1200);
check((await tags().count()) === 0, 'Ctrl+Y : gommée à nouveau');
await page.keyboard.press('Control+z');
await page.waitForTimeout(1200);
await page.getByTestId('paint-mode-brush').click();

// rechargement : peinture gardée avec le modèle
await page.waitForTimeout(2500);
await page.reload();
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor({ timeout: 300000 });
await page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: 'Front' }) }).first().click();
await page.waitForFunction(() => document.querySelectorAll('.sheet-canvas svg [data-dxf="VBX-PEINTURE-REPERES"] text').length > 0, null, { timeout: 120000 });
check(true, 'rechargement : repère P1 toujours là');

// PDF planche : légende et repère dans le PDF
const dl = page.waitForEvent('download', { timeout: 300000 });
await page.getByRole('button', { name: '⬇ PDF planche' }).click();
const pdfPath = shots + 'paint-sheet.pdf';
await (await dl).saveAs(pdfPath);
const txt = execFileSync('pdftotext', [pdfPath, '-']).toString();
check(/PAINTING/.test(txt) && /RAL 9005/.test(txt) && /P1/.test(txt), 'PDF : légende PAINTING, RAL 9005, repère P1');
// DXF de la planche
await page.getByRole('button', { name: '⬇ DXF' }).click();
const dl2 = page.waitForEvent('download', { timeout: 300000 });
await page.locator('.dxf-dialog .btn.primary').click();
const dxfPath = shots + 'paint-sheet.dxf';
await (await dl2).saveAs(dxfPath);
const dxf = readFileSync(dxfPath, 'latin1');
check(/VBX-PEINTURE-RAL9005/.test(dxf) && /VBX-PEINTURE-REPERES/.test(dxf) && /VBX-PEINTURE-LEGENDE/.test(dxf), 'DXF : calques VBX-PEINTURE-RAL9005 / -REPERES / -LEGENDE');
await page.close();

// ─── téléphone ───
const ctx = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const ph = await ctx.newPage();
watch(ph);
await ph.goto(URL0);
await ph.getByRole('button', { name: 'Analyser' }).click();
await ph.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await ph.getByRole('button', { name: 'Planches A1' }).click();
await ph.getByRole('button', { name: 'Ouvrir' }).first().click();
await ph.locator('.sheet-editor').waitFor({ timeout: 300000 });
await ph.locator('.sheet-thumb', { has: ph.locator('.thumb-title', { hasText: 'Front' }) }).first().tap();
await ph.waitForTimeout(2500);
await ph.getByTestId('toolbar-more').tap();
await ph.getByTestId('tool-paint').tap();
await ph.getByTestId('paint-panel').waitFor();
check(/P1/.test(await ph.getByTestId('paint-panel').innerText()), 'téléphone : palette du projet retrouvée (P1)');
await ph.getByTestId('paint-color-P1').tap();
await ph.locator('.sheet-side-close').tap();
const cdp = await ctx.newCDPSession(ph);
const rects = await ph.evaluate(() =>
  [...document.querySelectorAll('.sheet-canvas svg [data-item-type="viewport"]')].map((g) => {
    const r = g.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }),
);
let ok2 = false;
const back = rects[1] ?? rects[0];
for (const fy of [0.5, 0.4, 0.6, 0.3, 0.7]) {
  for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
    const x = back.x + back.w * fx;
    const y = back.y + back.h * fy;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await ph.waitForTimeout(300);
    if (await ph.getByTestId('paint-bubble').isVisible().catch(() => false)) {
      ok2 = true;
      break;
    }
  }
  if (ok2) break;
}
check(ok2, 'téléphone : tape sur une face → bulle en bas d’écran');
await ph.screenshot({ path: shots + 'paint-phone-bubble.png' });
await ph.getByTestId('paint-apply').tap();
await ph.waitForTimeout(1500);
check((await ph.locator('.sheet-canvas svg [data-dxf="VBX-PEINTURE-REPERES"] text').count()) >= 1, 'téléphone : repère posé');
await ph.screenshot({ path: shots + 'paint-phone.png' });
await ctx.close();

check(!errors.length, `aucune erreur console${errors.length ? ' : ' + errors.join(' | ') : ''}`);
await browser.close();
console.log('OK');
