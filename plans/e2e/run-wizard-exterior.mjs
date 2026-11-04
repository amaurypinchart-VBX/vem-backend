// Test navigateur : « Peindre les côtés extérieurs des Viewbox » dans l'assistant de génération (RAL 7016 choisi
// dans la recherche) → jeu généré avec la zone « Côtés extérieurs », repères P1 sur les vues des Viewbox, légende
// PAINTING sur les planches. Redémarrer le serveur de test avant (données en mémoire).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
mkdirSync(shots, { recursive: true });
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const check = (ok, msg) => {
  if (!ok) throw new Error('ÉCHEC : ' + msg);
  console.log('✔', msg);
};
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
if (process.env.BIG) await page.addInitScript(() => localStorage.setItem('vem_plans_bigmodel', '1'));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 600000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByTestId('wizard-exterior').check();
const gen = page.getByRole('button', { name: 'Générer', exact: true });
// palette vide : « Nouvelle couleur RAL… » d'emblée, rien de choisi → bouton inactif
check(await gen.isDisabled(), 'côtés extérieurs cochés sans couleur : « Générer » inactif');
await page.getByTestId('wizard-ral').fill('7016');
await page.locator('[data-testid="wizard-ral-results"] button').first().click();
check(await gen.isEnabled(), 'RAL 7016 choisi : « Générer » actif');
await page.getByTestId('wizard-exterior').screenshot({ path: shots + 'wizard-exterior.png' }).catch(() => {});
await gen.click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(2000);
const legends = await page.evaluate(() => document.querySelectorAll('.sheet-thumb').length);
// planche « une par Viewbox » (vues Front / Back / Top / Left / Right)
await page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: 'Front' }) }).first().click();
let marks = 0;
for (let i = 0; i < 90; i++) {
  await page.waitForTimeout(1000);
  marks = await page.evaluate(() => [...document.querySelectorAll('.sheet-canvas svg [data-dxf="VBX-PEINTURE-REPERES"] text')].filter((t) => t.textContent === 'P1').length);
  if (marks) break;
}
check(marks > 0, `repères P1 sur la planche de la Viewbox (${marks})`);
const legend = await page.evaluate(() => [...document.querySelectorAll('.sheet-canvas svg [data-item-type="paintLegend"]')].map((g) => g.textContent).join(' '));
check(/RAL 7016/.test(legend), 'légende PAINTING posée sur la planche : RAL 7016');
await page.getByTestId('tool-paint').click();
check(/Côtés extérieurs — toutes les Viewbox/.test(await page.getByTestId('paint-panel').innerText()), 'zone « Côtés extérieurs — toutes les Viewbox » dans le panneau Peinture');
await page.screenshot({ path: shots + 'wizard-exterior-sheet.png' });
console.log(`${legends} planches`);
// PDF=1 : export du jeu complet avec la peinture (mémoire max par étape, MEM du tas JS)
if (process.env.PDF) {
  const cdp = await page.context().newCDPSession(page);
  const mem = {};
  let on = true;
  const sampler = (async () => {
    while (on) {
      try {
        const { usedSize } = await cdp.send('Runtime.getHeapUsage');
        const step = ((await page.locator('.save-status').textContent({ timeout: 200 }).catch(() => '')) ?? '').replace(/\d+\/\d+/, 'n');
        mem[step] = Math.max(mem[step] ?? 0, Math.round(usedSize / 1e6));
      } catch {}
      await new Promise((r) => setTimeout(r, 300));
    }
  })();
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 1200000 }), page.getByRole('button', { name: '⬇ PDF du jeu' }).click()]);
  await dl.saveAs(shots + 'wizard-exterior.pdf');
  on = false;
  await sampler;
  console.log(`PDF du jeu en ${Math.round((Date.now() - t0) / 1000)} s ; tas JS max par étape (Mo) : ${JSON.stringify(mem)}`);
}
const bad = errors.filter((e) => !/favicon|404|ERR_|WebGL|GPU|swiftshader/i.test(e));
check(!bad.length, `aucune erreur console${bad.length ? ' : ' + bad.join(' / ') : ''}`);
await browser.close();
