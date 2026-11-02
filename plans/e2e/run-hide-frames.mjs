// Test navigateur : masquer des éléments sur les planches et cadres textile.
// Modèle d'essai avec plafond tendu et cadres textile :
//   cd plans && npm run build && E2E_FIXTURE_TEXTILE=1 E2E_FIXTURE_OUT=e2e/fixture.zip npx vitest run tests/e2e-fixture.test.ts
//   node e2e/server.mjs   (puis, dans un autre terminal)   node e2e/run-hide-frames.mjs
// Parcours : assistant (Vue du sol + Cadres textile) → planches « Cadres textile » (nomenclature, détails cotés) →
// vue de dessus d'une Viewbox : « Plafond tendu » masqué, « Vue du sol » → outil 🙈 (clic sur une pièce, bulle) →
// dialogue « ▦ Cadres textile » (repères F1 / F2 + cotes) → « Sur tout le jeu » (cadres masqués partout) → réouverture.
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/hide-';
mkdirSync(dirname(shots), { recursive: true });
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
const check = (label, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) process.exitCode = 1;
};

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
// assistant : « Vue du sol » et « Cadres textile » cochées par défaut, avec le nombre de cadres
await page.locator('[data-kind=floorPlan] input').check(); // cochée par défaut
const framesKind = await page.locator('[data-kind=frames]').innerText();
check(`assistant : ${framesKind.trim()}`, /8 cadre\(s\) F1–F7, F12, 2 taille\(s\)/.test(framesKind) && (await page.locator('[data-kind=frames] input').isChecked()));
await page.screenshot({ path: shots + 'wizard.png' });
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(2500);

const thumbs = page.locator('.sheet-thumb');
const titles = await page.locator('.sheet-thumb .thumb-foot').allInnerTexts();
console.log('Planches :', titles.map((t) => t.replace(/[↑↓⧉🗑]/g, '').replace(/\s+/g, ' ').trim()).join(' | '));
const svgTexts = () => page.locator('.sheet-paper svg text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
/** Première planche dont les textes satisfont `fn` : ouverte, numéro renvoyé. */
const findSheet = async (fn, label) => {
  for (let i = 0; i < titles.length; i++) {
    await thumbs.nth(i).click();
    await page.waitForTimeout(300);
    if (fn(await svgTexts())) {
      await waitViews();
      return i;
    }
  }
  throw new Error(`planche introuvable : ${label}`);
};
const svgBox = async () => {
  const b = await page.locator('.sheet-paper svg').first().boundingBox();
  const mm = b.width / 841;
  return (x, y) => ({ x: b.x + x * mm, y: b.y + y * mm });
};
const canvasShot = (name) => page.locator('.sheet-canvas').screenshot({ path: shots + name + '.png' });
async function waitViews() {
  await page.waitForFunction(() => !(document.querySelector('.sheet-paper svg')?.textContent ?? '').includes('Calcul de la vue'), null, { timeout: 120000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

// planches « Cadres textile » : nomenclature + F1 / F2 cotés
let schedules = 0;
for (let i = 0; i < titles.length; i++) {
  await thumbs.nth(i).click();
  await page.waitForTimeout(250);
  if ((await svgTexts()).includes('TEXTILE FRAME SCHEDULE')) schedules++;
}
check(`une seule planche avec la nomenclature des cadres (${schedules})`, schedules === 1);
await findSheet((t) => t.includes('TEXTILE FRAME SCHEDULE'), 'nomenclature');
await page.waitForTimeout(2500);
await canvasShot('frames-sheet');
const scheduleTexts = await svgTexts();
check('encadré « Extract - Textile frames - … »', scheduleTexts.some((t) => t.startsWith('Extract - Textile frames')));
check('nomenclature : une ligne par cadre (F1…F7, F12), tailles 2 000 × 2 000 et 2 300 × 350', ['F1', 'F7', 'F12'].every((r) => scheduleTexts.includes(r)) && scheduleTexts.some((t) => t.includes('2 000 × 2 000')) && scheduleTexts.some((t) => t.includes('2 300 × 350')));
check('visuel saisi dans SketchUp repris (« Logo IKEA bleu »)', scheduleTexts.includes('Logo IKEA bleu'));
check('cotes des cadres posées (2000 mm / 350 mm)', scheduleTexts.some((t) => /^2000 mm$/.test(t)) && scheduleTexts.some((t) => /^350 mm$/.test(t)));

// vue du sol d'un niveau
await findSheet((t) => t.some((x) => /Floor plan/.test(x)), 'vue du sol');
await page.waitForTimeout(2000);
await canvasShot('floor-plan');

// planche VBX-01 : vue de dessus (cadre « Top »)
const vbx01 = await findSheet((t) => t.some((x) => /Plan View - VBX-01/.test(x)) && t.includes('Top'), 'VBX-01');
let at = await svgBox();
let p = at(182, 300);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(500);
check('vue « Top » sélectionnée : section « Masquer »', await page.getByTestId('vp-hide').isVisible());
await page.screenshot({ path: shots + 'props-top.png' });
const tagChips = await page.getByTestId('vp-hide-tags').innerText();
check(`éléments proposés : ${tagChips.replace(/\s+/g, ' ')}`, /Plafond tendu/.test(tagChips) && /Cadres textile/.test(tagChips));
await canvasShot('top-before');
await page.locator('[data-tag="plafond-tendu"]').click();
await waitViews();
check('plafond tendu masqué (pastille barrée)', await page.locator('[data-tag="plafond-tendu"].off').count() === 1);
await canvasShot('top-no-ceiling');
await page.getByTestId('floor-cut').check();
await waitViews();
await canvasShot('top-floor-cut');
check('vue du sol cochée', await page.getByTestId('floor-cut').isChecked());
await page.getByTestId('floor-cut').uncheck();
await waitViews();

// outil « Masquer en cliquant » sur la vue Front de VBX-01 (bandeau textile au-dessus de la porte)
await page.getByTestId('tool-hide').click();
at = await svgBox();
// cadre « Front » R(360, 40, 165, 165) : un clic au tiers haut tombe sur le bandeau ou la toiture
p = at(442, 80);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(600);
const bubble = page.getByTestId('cv-bubble');
check('bulle « masquer » ouverte au clic', await bubble.isVisible());
await page.screenshot({ path: shots + 'hide-bubble.png' });
const acts = await bubble.locator('[data-action]').evaluateAll((els) => els.map((e) => e.getAttribute('data-action')));
check(`actions : ${acts.join(', ')}`, acts.includes('hide-one') && !acts.includes('isolate') && !acts.includes('ghost'));
await bubble.locator('[data-action="hide-one"]').click();
await waitViews();
await canvasShot('front-hidden-one');
await page.keyboard.press('Escape');
await page.getByRole('button', { name: '⬚ Sélection' }).click();
await page.keyboard.press('Control+z');
await waitViews();

// dialogue « Cadres textile » : repères F1 / F2 et cotes sur les vues
await page.getByTestId('open-frames').click();
await page.getByTestId('frames-dialog').waitFor();
await page.screenshot({ path: shots + 'frames-dialog.png' });
const rows = await page.getByTestId('frames-table').locator('tbody tr').count();
check(`dialogue : ${rows} cadres (un repère par cadre)`, rows === 8);
check('repère F12 marqué « SketchUp »', (await page.getByTestId('frames-table').locator('tr', { hasText: 'F12' }).innerText()).includes('SketchUp'));
await page.getByTestId('frames-apply').click();
await waitViews();
await thumbs.nth(vbx01).click();
await waitViews();
const labels = await svgTexts();
check('repères F1 / F12 sur la planche VBX-01', labels.includes('F1') && labels.includes('F12'));
await canvasShot('vbx01-frames-labels');

// « Sur tout le jeu » : cadres masqués partout
p = at(182, 300);
await page.mouse.click(p.x, p.y);
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Sur tout le jeu/ }).click();
await page.getByTestId('set-hide').waitFor();
const row = page.locator('[data-row="t:cadre-textile"]');
await row.getByRole('button', { name: 'Masquer partout' }).click();
await page.waitForTimeout(300);
const count = await row.locator('td.hint').innerText();
check(`cadres masqués partout : ${count}`, /masqué sur (\d+) \/ \1 vue/.test(count));
await page.screenshot({ path: shots + 'set-hide.png' });
await page.getByRole('button', { name: 'Fermer' }).click();
await waitViews();
await canvasShot('vbx01-frames-hidden');

// détail toiture : Vues 2D › Vues spéciales › « Détail toiture (coupe) » → planche 1:10, couches cotées
await page.getByRole('button', { name: 'Vues 2D' }).click();
await page.locator('[data-testid="tab-special-views"]').click();
await page.locator('[data-testid="cv-preset-roof-detail"]').click();
await page.waitForFunction(() => ['done', 'error'].includes(document.querySelector('[data-testid="cv-preview"]')?.getAttribute('data-status') ?? ''), null, { timeout: 600000, polling: 500 });
await page.locator('.cv-main').screenshot({ path: shots + 'roof-detail-preview.png' });
await page.locator('[data-testid="cv-save"]').click();
await page.locator('[data-testid="cv-save-state"]').waitFor();
await page.locator('[data-testid="cv-add-sheet"]').click();
await page.locator('[data-testid="cv-sheet-dialog"]').waitFor();
check('ajout à une planche : 1:10 proposé', (await page.locator('[data-testid="cv-sheet-scale"]').inputValue()) === '10');
await page.locator('[data-testid="cv-sheet-add"]').click();
await page.locator('[data-testid="cv-sheet-info"]').waitFor({ timeout: 120000 });
await page.locator('[data-testid="cv-sheet-dialog"]').getByRole('button', { name: 'Fermer' }).click();
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.waitForTimeout(800);
const nThumbs = await thumbs.count();
check(`planche(s) du détail ajoutée(s) : ${nThumbs - titles.length}`, nThumbs > titles.length);
await thumbs.nth(nThumbs - 1).click();
await waitViews();
await page.waitForTimeout(2000);
const detail = await svgTexts();
console.log('   détail toiture :', detail.filter((t) => / mm$/.test(t)).join(' | '));
check('détail toiture : couches cotées et nommées', detail.includes('Vide technique — 90 mm') && detail.includes('Plafond tendu — 10 mm') && detail.some((t) => /— 100 mm$/.test(t)));
await canvasShot('roof-detail-sheet');

await page.getByText('✓ Enregistré').waitFor({ timeout: 30000 });
await page.getByRole('button', { name: '← Jeux de plans' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor();
await page.waitForTimeout(1500);
check(`jeu rouvert (${nThumbs} planches)`, (await thumbs.count()) === nThumbs);
await thumbs.nth(vbx01).click();
await waitViews();
await canvasShot('reopened-vbx01');
console.log('Erreurs console :', errors.length ? errors : 'aucune');
if (errors.length) process.exitCode = 1;
await browser.close();
