// Test navigateur « 🧱 Côtés extérieurs des Viewbox » (peinture) : jeu généré → planche de VBX-01 (collée à VBX-2 par
// son petit côté avant) → 🎨 Peinture → 🧱 → plan de l'installation + éléments peints → « ＋ Couleur » RAL 7047 →
// Peindre → zone « Côtés extérieurs » dans le panneau, repères P1 sur les vues extérieures (Back, Left, Right) et
// aucun sur la vue Front (côté collé), légende → rechargement (zone gardée). Captures e2e/shots/exterior-*.png.
// Redémarrer le serveur de test avant (données en mémoire).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
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
const check = (ok, msg) => {
  if (!ok) throw new Error('ÉCHEC : ' + msg);
  console.log('✔', msg);
};
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());

const openSheet = async () => {
  await page.getByRole('button', { name: 'Planches A1' }).click();
  const hasSet = await page.getByRole('button', { name: 'Ouvrir' }).count();
  if (hasSet) await page.getByRole('button', { name: 'Ouvrir' }).first().click();
  else {
    await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
    await page.getByRole('button', { name: 'Générer', exact: true }).click();
  }
  await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
  await page.waitForTimeout(2000);
  // planche « une par Viewbox » de VBX-01 (vues Front / Back / Top / Left / Right)
  await page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: 'Front' }) }).first().click();
  await page.waitForTimeout(3000);
};
/** repères par fenêtre de vue, dans l'ordre de la planche (Front, Back, Top, Left, Right) */
const marksPerView = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('.sheet-canvas svg [data-item-type="viewport"]')].map((g) => [...g.querySelectorAll('[data-dxf="VBX-PEINTURE-REPERES"] text')].map((t) => t.textContent)),
  );

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await openSheet();

await page.getByTestId('tool-paint').click();
await page.getByTestId('paint-panel').waitFor();
await page.getByTestId('paint-exterior').click();
await page.getByTestId('exterior-dialog').waitFor();
await page.getByTestId('exterior-plan').first().waitFor({ timeout: 30000 });
const cats = await page.getByTestId('exterior-cats').innerText();
check(/m²/.test(cats), `éléments peints listés avec leur surface : ${cats.replace(/\n/g, ' | ')}`);
const vitre = page.locator('[data-testid="exterior-cats"] label', { hasText: /Glass|VITRE|Vitrage/i }).first();
if (await vitre.count()) check(!(await vitre.locator('input').isChecked()), 'vitrages non cochés par défaut');
check(await page.getByTestId('exterior-ok').isDisabled(), 'pas de couleur → bouton « Peindre » inactif');
// couleur créée depuis le dialogue
await page.getByTestId('exterior-new-color').click();
await page.getByTestId('ral-search').fill('7047');
await page.locator('[data-testid="ral-results"] .paint-swatch').first().click();
await page.getByTestId('color-ok').click();
await page.getByTestId('exterior-color-P1').waitFor();
check(/\bon\b/.test((await page.getByTestId('exterior-color-P1').getAttribute('class')) ?? ''), 'nouvelle couleur P1 (RAL 7047) choisie dans le dialogue');
// plan : côtés peints (épais, couleur) et côtés collés (gris)
const plan = await page.evaluate(() => {
  const lines = [...document.querySelectorAll('[data-testid="exterior-plan"] line')];
  return { grey: lines.filter((l) => l.getAttribute('stroke') === '#9aa3b2').length, total: lines.length };
});
check(plan.grey >= 2, `plan : ${plan.grey} côtés collés en gris (VBX-01 / VBX-2)`);
const total = await page.getByTestId('exterior-total').innerText();
check(/m² peints en P1/.test(total), `total : ${total}`);
await page.getByTestId('exterior-dialog').screenshot({ path: shots + 'exterior-dialog.png' });
await page.getByTestId('exterior-ok').click();
await page.getByTestId('exterior-dialog').waitFor({ state: 'detached' });
check(/Côtés extérieurs — toutes les Viewbox/.test(await page.getByTestId('paint-panel').innerText()), 'zone « Côtés extérieurs — toutes les Viewbox » dans le panneau');

// repères : attendre la fin du calcul en arrière-plan
let marks = [];
for (let i = 0; i < 60; i++) {
  await page.waitForTimeout(1000);
  marks = await marksPerView();
  if (marks.filter((m) => m.length).length >= 3 && !/Calcul des repères/.test(await page.getByTestId('paint-panel').innerText())) break;
}
console.log('repères par vue (Front, Back, Top, Left, Right) :', JSON.stringify(marks));
check(marks[0].length === 0, 'vue Front de VBX-01 (petit côté collé à VBX-2) : aucun repère');
check(marks[1].includes('P1'), 'vue Back (petit côté extérieur) : repère P1');
check(marks[3].includes('P1') && marks[4].includes('P1'), 'vues Left et Right (grands côtés extérieurs) : repère P1');
const legend = await page.evaluate(() => document.querySelector('.sheet-canvas svg')?.textContent ?? '');
check(/RAL 7047/.test(legend), 'légende PAINTING : RAL 7047');
await page.screenshot({ path: shots + 'exterior-sheet.png' });

// m² dans la légende : au choix, pour toutes les légendes du jeu (panneau Peinture)
// texte de la légende PAINTING seulement (les notes générales du cartouche contiennent « kg/m² »)
const legendText = () => page.evaluate(() => [...document.querySelectorAll('.sheet-canvas svg [data-item-type="paintLegend"]')].map((g) => g.textContent).join(' '));
const areasBox = page.getByTestId('paint-legend-areas');
check(await areasBox.isChecked(), 'case « Afficher les m² dans la légende » cochée par défaut');
check(/m²/.test(await legendText()), 'légende : surface en m² affichée');
await areasBox.uncheck();
await page.waitForTimeout(500);
check(!/m²/.test(await legendText()) && /RAL 7047/.test(await legendText()), 'm² décochés : légende sans surface, couleur toujours là');
await areasBox.check();
await page.waitForTimeout(500);
check(/m²/.test(await legendText()), 'm² recochés : surface de retour');
await areasBox.uncheck();
await page.waitForTimeout(300);

// « ⊘ Sans peinture » : gomme sur une face de la zone « côtés extérieurs » → bulle, « Sans peinture » choisi, la zone
// extérieure reste entière (seule la pièce choisie n'est plus peinte)
const toScreen = (x, y) =>
  page.evaluate(([x, y]) => {
    const m = document.querySelector('.sheet-canvas svg').getScreenCTM();
    return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
  }, [x, y]);
const vpRects = await page.evaluate(() =>
  [...document.querySelectorAll('.sheet-canvas svg [data-item-type="viewport"] clipPath rect')].map((r) => ({ x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height') })),
);
const areaOfP1 = async () => (await page.getByTestId('paint-color-P1').innerText()).match(/(\d+,\d+) m²/)?.[1];
const before = await areaOfP1();
await page.getByTestId('paint-mode-eraser').click();
let bubble = false;
search: for (const vp of [vpRects[1], vpRects[3], vpRects[4]])
  for (const fy of [0.5, 0.15, 0.85, 0.08, 0.92])
    for (const fx of [0.04, 0.96, 0.5, 0.08, 0.92]) {
      const p = await toScreen(vp.x + vp.w * fx, vp.y + vp.h * fy);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(150);
      if (await page.getByTestId('paint-bubble').isVisible().catch(() => false)) {
        bubble = true;
        break search;
      }
    }
check(bubble, 'gomme sur une face des côtés extérieurs : bulle (pas de suppression de toute la zone)');
check(/\bon\b/.test((await page.getByTestId('bubble-color-none').getAttribute('class')) ?? ''), 'bulle : « ⊘ Sans peinture » présélectionné');
await page.getByTestId('paint-target-node-box').check();
await page.getByTestId('paint-apply').click();
await page.waitForTimeout(1500);
const panel = await page.getByTestId('paint-panel').innerText();
check(/Sans peinture — /.test(panel), 'zone « ⊘ Sans peinture » listée dans le panneau');
check(/Côtés extérieurs — toutes les Viewbox/.test(panel), 'zone « côtés extérieurs » toujours là');
const after = await areaOfP1();
console.log('surface P1 avant / après :', before, after);
check(before && after && parseFloat(after.replace(',', '.')) < parseFloat(before.replace(',', '.')), 'surface peinte P1 diminuée');
await page.screenshot({ path: shots + 'exterior-nopaint.png' });
await page.getByTestId('paint-mode-brush').click();


// rechargement : la zone est gardée avec le modèle (même fichier ré-analysé = même version)
await page.reload();
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await openSheet();
await page.waitForFunction(() => document.querySelectorAll('.sheet-canvas svg [data-dxf="VBX-PEINTURE-REPERES"] text').length > 0, null, { timeout: 120000 });
await page.getByTestId('tool-paint').click();
check(/Côtés extérieurs/.test(await page.getByTestId('paint-panel').innerText()), 'après rechargement : zone « Côtés extérieurs » et repères toujours là');
const bad = errors.filter((e) => !/favicon|404|ERR_|WebGL|GPU|swiftshader/i.test(e));
check(!bad.length, `aucune erreur console${bad.length ? ' : ' + bad.join(' / ') : ''}`);
await browser.close();
