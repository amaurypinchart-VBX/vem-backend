// Vues « obsolètes » après un nouvel export SketchUp : jeu généré sur un modèle, puis le fichier du projet change (autre
// export) → à l'ouverture du jeu, bandeau « n vues ne sont plus à jour » → « ↻ Tout mettre à jour » (une étape
// d'historique, Ctrl+Z la défait) → plus aucune vue obsolète, puis peinture d'une face (repère P1).
// Préparer : npm run e2e:fixture ; E2E_FIXTURE_VBX4='[0,0,2810]' E2E_FIXTURE_OUT=e2e/fixture-b.zip npx vitest run tests/e2e-fixture.test.ts
// puis cp e2e/fixture.zip e2e/fx-cur.zip ; ZIP=e2e/fx-cur.zip node e2e/server.mjs (le script remplace fx-cur.zip en cours de route).
import { chromium } from 'playwright-core';
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, 'shots') + '/';
mkdirSync(shots, { recursive: true });
const PORT = process.env.PORT || 4173;
const URL0 = `http://localhost:${PORT}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const check = (ok, msg) => { if (!ok) throw new Error('ÉCHEC : ' + msg); console.log('✔', msg); };
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
const stale = () => page.locator('.sheet-canvas svg text', { hasText: 'obsolète' }).count();

copyFileSync(join(here, 'fixture.zip'), join(here, 'fx-cur.zip'));
await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(3000);
check((await page.getByTestId('stale-banner').count()) === 0, 'jeu neuf : pas de bandeau « vues plus à jour »');

// nouvel export SketchUp du même projet
copyFileSync(join(here, 'fixture-b.zip'), join(here, 'fx-cur.zip'));
await page.reload();
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor({ timeout: 300000 });
await page.getByTestId('stale-banner').waitFor({ timeout: 120000 });
const banner = await page.getByTestId('stale-banner').innerText();
const n = Number(/(\d+) vue/.exec(banner)?.[1]);
check(n > 5, `bandeau : ${banner.replace(/\s+/g, ' ').trim()}`);
await page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: 'Front' }) }).first().click();
await page.waitForFunction(() => [...document.querySelectorAll('.sheet-canvas svg text')].some((t) => /obsolète/.test(t.textContent)), null, { timeout: 120000 });
check((await stale()) > 0, 'vues de la planche marquées « obsolète »');
await page.screenshot({ path: shots + 'stale-before.png' });

await page.getByTestId('update-all-views').click();
await page.waitForTimeout(4000);
check((await page.getByTestId('stale-banner').count()) === 0, '« Tout mettre à jour » : bandeau parti');
check((await stale()) === 0, 'plus aucune vue « obsolète » sur la planche');
// les autres planches aussi
for (const i of [0, 1, 2]) {
  await page.locator('.sheet-thumb').nth(i).click();
  await page.waitForTimeout(2500);
  check((await stale()) === 0, `planche ${i + 1} à jour`);
}
await page.screenshot({ path: shots + 'stale-after.png' });

// annuler : les vues redeviennent obsolètes, rétablir
await page.keyboard.press('Control+z');
await page.getByTestId('stale-banner').waitFor({ timeout: 30000 });
check(true, 'Ctrl+Z : les vues redeviennent obsolètes');
await page.keyboard.press('Control+y');
await page.waitForTimeout(3000);
check((await page.getByTestId('stale-banner').count()) === 0, 'Ctrl+Y : à jour de nouveau');

// peinture sur une vue mise à jour
await page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: 'Front' }) }).first().click();
await page.waitForTimeout(2500);
await page.getByTestId('tool-paint').click();
if (!(await page.getByTestId('paint-color-P1').count())) {
  await page.getByTestId('paint-new-color').click();
  await page.getByTestId('ral-search').fill('9005');
  await page.locator('[data-testid="ral-results"] .paint-swatch').first().click();
  await page.getByTestId('color-ok').click();
  await page.getByTestId('paint-color-P1').waitFor();
}
const toScreen = (x, y) => page.evaluate(([x, y]) => { const m = document.querySelector('.sheet-canvas svg').getScreenCTM(); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; }, [x, y]);
const vps = await page.evaluate(() => [...document.querySelectorAll('.sheet-canvas svg [data-item-type="viewport"] clipPath rect')].map((r) => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') })));
let hit = false;
for (const f of [[0.5, 0.5], [0.4, 0.4], [0.6, 0.6], [0.3, 0.5]]) {
  const s = await toScreen(vps[0].x + vps[0].w * f[0], vps[0].y + vps[0].h * f[1]);
  await page.mouse.click(s.x, s.y);
  await page.waitForTimeout(300);
  if ((hit = await page.getByTestId('paint-bubble').isVisible().catch(() => false))) break;
}
check(hit, 'tape sur une face : bulle');
await page.getByTestId('paint-apply').click();
await page.waitForFunction(() => document.querySelectorAll('.sheet-canvas svg [data-dxf="VBX-PEINTURE-REPERES"] text').length > 0, null, { timeout: 60000 });
check(true, 'repère P1 posé');
check((await page.getByTestId('paint-failures').count()) === 0, 'aucune vue en échec dans le panneau Peinture');
await page.screenshot({ path: shots + 'stale-paint.png' });
check(errors.length === 0, 'aucune erreur console' + (errors.length ? ' : ' + errors.join(' | ') : ''));
await browser.close();
console.log('OK');
