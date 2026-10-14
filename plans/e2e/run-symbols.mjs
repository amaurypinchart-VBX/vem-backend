// Test navigateur des symboles d'équipement et des options de génération : jeu généré (vitres opaques + « Colorer par
// catégorie » cochés d'office), outil « ⚡ Symboles » sur le plan d'assemblage (prise posée près d'un mur → tournée
// vers lui, spot, réglette), légende ajoutée, propriétés (repère, hauteur, rotation), copier / coller, PDF et DXF de la
// planche ; puis export PDF avec un fichier de l'application disparu (nouvelle version en ligne) → proposition de
// recharger au lieu de « Failed to fetch dynamically imported module ». Captures et fichiers dans e2e/shots/.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';
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
const dialogs = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('response', (r) => { if (r.status() === 404) console.log('404 :', r.url()); });
page.on('dialog', (d) => { dialogs.push(d.message()); console.log('Dialogue :', d.message().slice(0, 160).replace(/\n/g, ' ')); d.type() === 'confirm' && /nouvelle version/i.test(d.message()) ? d.dismiss() : d.accept(); });
const check = (ok, msg) => { if (!ok) throw new Error('ÉCHEC : ' + msg); console.log('✔', msg); };

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
check(await page.getByTestId('wizard-opaque-glass').isChecked(), 'assistant : « Vitres opaques » coché d’office');
check(await page.getByTestId('wizard-top-colors').isChecked(), 'assistant : « Colorer par catégorie » (vues du dessus) coché d’office');
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(1500);

// planche du plan d'assemblage (vue du dessus)
console.log('Planches :', (await page.locator('.thumb-title').allTextContents()).join(' | '));
await page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: /Assembly plan|aerial view/ }) }).first().click();
await page.waitForTimeout(800);

// point de la planche (mm papier) → écran
const toScreen = (x, y) =>
  page.evaluate(([x, y]) => {
    const svg = document.querySelector('.sheet-canvas svg');
    const m = svg.getScreenCTM();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }, [x, y]);
// un point d'un trait de silhouette de la vue (mm papier), et la direction vers l'intérieur
const wallPoint = await page.evaluate(() => {
  const svg = document.querySelector('.sheet-canvas svg');
  const inv = svg.getScreenCTM().inverse();
  const paths = [...svg.querySelectorAll('path')].filter((p) => p.closest('g[clip-path]') && p.getAttribute('fill') !== '#000' && p.getTotalLength() > 50);
  const vpRect = svg.querySelector('clipPath rect');
  const R = { x: +vpRect.getAttribute('x'), y: +vpRect.getAttribute('y'), w: +vpRect.getAttribute('width'), h: +vpRect.getAttribute('height') };
  for (const p of paths) {
    const len = p.getTotalLength();
    const ctm = p.getScreenCTM();
    const toPaper = (q) => {
      const s = { x: ctm.a * q.x + ctm.c * q.y + ctm.e, y: ctm.b * q.x + ctm.d * q.y + ctm.f };
      return { x: inv.a * s.x + inv.c * s.y + inv.e, y: inv.b * s.x + inv.d * s.y + inv.f };
    };
    for (let f = 0.05; f < 0.95; f += 0.03) {
      const pa = toPaper(p.getPointAtLength(len * f));
      const pb = toPaper(p.getPointAtLength(len * f + 40));
      const inside = pa.x > R.x + 30 && pa.x < R.x + R.w - 30 && pa.y > R.y + 30 && pa.y < R.y + R.h - 30;
      if (inside && Math.hypot(pb.x - pa.x, pb.y - pa.y) > 0.3 && Math.hypot(pb.x - pa.x, pb.y - pa.y) < 3) return { pa, pb };
    }
  }
  return { debug: paths.length, all: svg.querySelectorAll('path').length, clip: svg.querySelectorAll('g[clip-path]').length, sample: [...svg.querySelectorAll('g[clip-path] path')].slice(0, 3).map((p) => p.outerHTML.slice(0, 160)) };
});
if (wallPoint && !wallPoint.pa) console.log(JSON.stringify(wallPoint));
// vue du dessus générée : traits de couleur par catégorie présents
check(await page.evaluate(() => !!document.querySelector('.sheet-canvas svg [data-dxf^="VBX-CATEGORIE-"]')), 'vue du dessus : « Colorer par catégorie » appliqué');
check(!!wallPoint, `trait de la vue trouvé en (${wallPoint?.pa.x.toFixed(1)} ; ${wallPoint?.pa.y.toFixed(1)}) mm`);

await page.getByTestId('tool-symbol').click();
await page.getByTestId('symbol-palette').waitFor();
// prise à 2 mm du mur (perpendiculairement)
const { pa, pb } = wallPoint;
const d = Math.hypot(pb.x - pa.x, pb.y - pa.y);
const nx = -(pb.y - pa.y) / d;
const ny = (pb.x - pa.x) / d;
await page.locator('[data-symbol="prise-2pt"]').click();
let s = await toScreen(pa.x + nx * 2, pa.y + ny * 2);
await page.mouse.click(s.x, s.y);
await page.locator('[data-symbol="spot"]').click();
s = await toScreen(pa.x + nx * 25, pa.y + ny * 25);
await page.mouse.click(s.x, s.y);
await page.locator('[data-symbol="reglette"]').click();
s = await toScreen(pa.x - nx * 3, pa.y - ny * 3);
await page.mouse.click(s.x, s.y);
await page.waitForTimeout(300);
await page.screenshot({ path: shots + 'symbols-palette.png' });

check((await page.locator('.symbol-totals tr').count()) === 3, 'palette : quantités du jeu (prise, spot, réglette)');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

const markup = await page.evaluate(() => document.querySelector('.sheet-canvas svg').outerHTML);
check(markup.includes('LÉGENDE DES ÉQUIPEMENTS') || markup.includes('EQUIPMENT LEGEND'), 'légende des symboles ajoutée au premier symbole posé');
check(/× 1/.test(markup), 'légende comptée');

// sélection de la prise (clic sur elle) → propriétés
// zoom sur la prise, puis clic dessus
const sock = page.locator('.sheet-canvas svg g[data-item-type="symbol"]').first();
let bb = await sock.boundingBox();
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -300);
await page.waitForTimeout(400);
bb = await sock.boundingBox();
await page.screenshot({ path: shots + 'symbols-zoom.png', clip: { x: bb.x - 150, y: bb.y - 150, width: 300 + bb.width, height: 300 + bb.height } });
await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
await page.waitForTimeout(300);
console.log('Sélection :', await page.locator('.prop-title').first().textContent().catch(() => '—'));
await page.locator('.prop-title', { hasText: 'Symbole' }).waitFor({ timeout: 5000 });
const rot = await page.locator('.prop-field', { hasText: 'Orientation' }).locator('span').first().textContent();
console.log('Prise :', rot);
check(/\((0|90|180|270)°\)/.test(rot), 'prise orientée sur un mur de la vue (angle droit)');
await page.getByPlaceholder('ex. C3, 32 A, IP44').fill('C3');
await page.getByPlaceholder('ex. 110 → « h 1,10 m »').fill('110');
await page.waitForTimeout(300);
const m2 = await page.evaluate(() => document.querySelector('.sheet-canvas svg').outerHTML);
check(m2.includes('>C3<') && m2.includes('>h 1,10 m<'), 'repère « C3 » et hauteur « h 1,10 m » dessinés');
await page.getByRole('button', { name: '⟳ 90°' }).click();
// copier / coller
await page.keyboard.press('Control+c');
await page.keyboard.press('Control+v');
await page.waitForTimeout(300);
const m3 = await page.evaluate(() => document.querySelector('.sheet-canvas svg').outerHTML);
check((m3.match(/>C3</g) ?? []).length === 2, 'copier / coller d’un symbole');
await page.screenshot({ path: shots + 'symbols-sheet.png' });

// PDF et DXF de la planche
for (const [label, file] of [['⬇ PDF planche', 'symbols.pdf']]) {
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.getByRole('button', { name: label }).click()]);
  await dl.saveAs(shots + file);
  console.log(`${label} : ${dl.suggestedFilename()}`);
}
// nouvelle version mise en ligne pendant que la page est ouverte : le module DXF (jamais chargé) n'existe plus et le
// serveur renvoie une page HTML → proposition de recharger (refusée ici) puis bandeau « ↻ Recharger », pas d'erreur
await page.route(/\/plans\/assets\/export-[^/]+\.js$/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html></html>' }));
const before = dialogs.length;
await page.getByRole('button', { name: '⬇ DXF' }).click();
await page.locator('.dxf-dialog').getByRole('button', { name: /Télécharger/ }).click();
await page.waitForTimeout(1500);
const asked = dialogs.slice(before);
check(asked.some((m) => /nouvelle version de Plans Viewbox/i.test(m)), 'fichier disparu : « recharger la page » proposé');
check(!asked.some((m) => /Failed to fetch|Export DXF impossible/i.test(m)), 'pas de message « Failed to fetch dynamically imported module »');
check(await page.locator('#vbx-new-version').isVisible(), 'bandeau « Nouvelle version… ↻ Recharger » affiché');
await page.screenshot({ path: shots + 'symbols-new-version.png' });
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
