// Test navigateur : outil « 📐 Coter une pièce » des planches (A. Pinchart 17.11.2026 : « cliquer sur les groupes où
// je veux des cotes … des bois de 45 × 45 … leur mesure et leur emplacement par rapport au sol et aux côtés des
// poteaux »). Modèle d'essai avec une ossature bois dans chaque Viewbox :
//   cd plans && npm run build && E2E_FIXTURE_BATTENS=1 E2E_FIXTURE_OUT=e2e/fixture.zip npx vitest run tests/e2e-fixture.test.ts
//   node e2e/server.mjs   (puis, dans un autre terminal)   node e2e/run-piece-dims.mjs
// Parcours : Vues 2D › Vues spéciales › « Coupe longitudinale A-A » → ajoutée à une planche → outil « Coter une
// pièce » → clic sur un montant → bulle (fil d'Ariane, surbrillance, aperçu) → niveau « Ossature bois » → cotes posées
// (faces des poteaux, largeurs 45, hauteurs depuis le plancher) → Ctrl+Z → « toutes les pièces identiques ».
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/piece-';
mkdirSync(dirname(shots), { recursive: true });
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() || 'Coupe e2e' : undefined));
const check = (label, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) process.exitCode = 1;
};
const svgTexts = () => page.locator('.sheet-paper svg text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
const dimTexts = async () => (await svgTexts()).filter((t) => /^\d+ mm$/.test(t));
const canvasShot = (name) => page.locator('.sheet-canvas').screenshot({ path: shots + name + '.png' });
/** Point du dessin (mm modèle) de la 1re vue de la planche → point écran. */
const screenOf = (x, y) =>
  page.evaluate(
    ([x, y]) => {
      const g = [...document.querySelectorAll('.sheet-paper svg g[clip-path] > g[transform]')].find((e) => /scale\(/.test(e.getAttribute('transform') ?? ''));
      const pt = g.ownerSVGElement.createSVGPoint();
      pt.x = x;
      pt.y = y;
      const s = pt.matrixTransform(g.getScreenCTM());
      return { x: s.x, y: s.y };
    },
    [x, y],
  );
const bubble = page.getByTestId('piece-dim-bubble');
/** Clic sur le montant du milieu de VBX-01 (x 3000–3045, à 2,4 m) : la vue peut être en miroir selon le côté regardé. */
async function clickStud() {
  for (const x of [3022, -3022]) {
    const p = await screenOf(x, 2400);
    await page.mouse.click(p.x, p.y);
    if (await bubble.waitFor({ timeout: 1500 }).then(() => true, () => false)) return;
  }
  console.log('   message :', await page.getByTestId('paint-toast').allInnerTexts());
  await page.screenshot({ path: shots + 'no-bubble.png' });
  throw new Error('bulle non ouverte');
}

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });

// vue spéciale : coupe longitudinale (on regarde le grand côté +y depuis l'intérieur : ossature bois)
await page.getByRole('button', { name: 'Vues 2D' }).click();
await page.locator('[data-testid="tab-special-views"]').click();
await page.locator('[data-testid="cv-preset-section-long"]').click();
await page.waitForFunction(() => ['done', 'error'].includes(document.querySelector('[data-testid="cv-preview"]')?.getAttribute('data-status') ?? ''), null, { timeout: 900000, polling: 500 });
await page.locator('[data-testid="cv-save"]').click();
await page.locator('[data-testid="cv-save-state"]').waitFor();
await page.locator('[data-testid="cv-add-sheet"]').click();
await page.locator('[data-testid="cv-sheet-dialog"]').waitFor();
await page.locator('[data-testid="cv-sheet-add"]').click();
await page.locator('[data-testid="cv-sheet-info"]').waitFor({ timeout: 120000 });
console.log('  ', await page.locator('[data-testid="cv-sheet-info"]').innerText());
await page.locator('[data-testid="cv-sheet-dialog"]').getByRole('button', { name: 'Fermer' }).click();
await page.getByRole('button', { name: 'Planches A1' }).click();
if (!(await page.locator('.sheet-editor').isVisible().catch(() => false))) await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor({ timeout: 60000 });
await page.locator('.sheet-thumb').last().click();
await page.waitForFunction(() => document.querySelectorAll('.sheet-paper svg path[data-dxf="VS-COUPE"]').length > 0, null, { timeout: 900000, polling: 1000 });
await page.waitForTimeout(1500);
const before = await dimTexts();
await canvasShot('sheet');

// outil « Coter une pièce » : clic sur le montant du milieu de VBX-01
await page.getByTestId('tool-piecedim').click();
await clickStud();
const crumbs = await bubble.locator('.crumb').allInnerTexts();
check(`fil d’Ariane : ${crumbs.join(' › ')}`, crumbs.includes('Ossature bois') && crumbs.at(-1) === 'Bois 45x45 montant');
check('niveau proposé = le montant cliqué', (await bubble.locator('.crumb.on').innerText()) === 'Bois 45x45 montant');
let summary = await page.getByTestId('piece-dim-summary').innerText();
check(`une pièce : ${summary.split('\n')[0]}`, /^1 pièce/.test(summary));
check('surbrillance de la pièce sur la vue', (await page.locator('[data-testid="piece-highlight"]').count()) === 1);
check('références : faces des poteaux, plancher', /faces intérieures des poteaux/.test(summary) && /dessus du plancher/.test(summary));
let preview = await dimTexts();
check(`aperçu avant de poser : ${preview.length - before.length} textes de cote en plus`, preview.length > before.length);
await page.screenshot({ path: shots + 'bubble-one.png' });

// le groupe « Ossature bois » : 3 montants + 2 traverses (le 4e montant, côté retiré par la coupe, n'en fait pas partie)
await bubble.locator('.crumb', { hasText: 'Ossature bois' }).click();
await page.waitForTimeout(300);
summary = await page.getByTestId('piece-dim-summary').innerText();
check(`groupe : ${summary.split('\n')[0]}`, /^5 pièces \(3 debout, 2 couchées\)/.test(summary));
await page.screenshot({ path: shots + 'bubble-group.png' });
await page.getByTestId('piece-dim-apply').click();
await page.waitForTimeout(500);
check('bulle fermée après la pose', !(await bubble.isVisible()));
const after = await dimTexts();
const added = after.filter((t, i) => after.indexOf(t) === i && !before.includes(t));
console.log('   cotes ajoutées :', [...new Set(after)].join(' | '));
check('positions depuis les faces des poteaux : 1400 / 45 / 1455 / 1255 mm', ['1400 mm', '45 mm', '1455 mm', '1255 mm'].every((t) => after.includes(t)));
check('hauteurs depuis le plancher : 850 / 755 mm, montants 2550 mm', ['850 mm', '755 mm', '2550 mm'].every((t) => after.includes(t)));
check(`nouvelles valeurs (${added.length})`, added.length >= 4);
await canvasShot('group-dims');
// détail lisible : zoom sur VBX-01 (molette autour du montant)
{
  const c = await screenOf(1500, 300);
  await page.mouse.move(c.x, c.y);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -240);
  await page.waitForTimeout(400);
  await canvasShot('group-dims-zoom');
  await page.getByTitle('Toute la planche').first().click();
  await page.waitForTimeout(300);
}

// Ctrl+Z retire toutes les cotes posées d'un coup
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
check('Ctrl+Z : cotes retirées', (await dimTexts()).length === before.length);

// toutes les pièces identiques de la vue
await clickStud();
await page.getByTestId('piece-dim-same').check();
await page.waitForTimeout(300);
summary = await page.getByTestId('piece-dim-summary').innerText();
// vue de l'ensemble : les montants de VBX-01, VBX-2 et VBX-04 (empilée) au moins
check(`identiques : ${summary.split('\n')[0]}`, Number(/^(\d+) pièces/.exec(summary)?.[1] ?? 0) >= 9);
check('« depuis le sol » proposé (vue avec la hauteur)', (await page.getByTestId('piece-dim-from').count()) === 1);
await page.getByTestId('piece-dim-from').selectOption('ground');
await page.waitForTimeout(300);
await page.getByTestId('piece-dim-apply').click();
await page.waitForTimeout(500);
const fromGround = await dimTexts();
console.log('   depuis le sol :', [...new Set(fromGround)].join(' | '));
await canvasShot('same-ground');

// Échap ferme la bulle ; outil Sélection
await clickStud();
await page.keyboard.press('Escape');
check('Échap ferme la bulle', !(await bubble.isVisible()));

check(`aucune erreur dans la page${errors.length ? ' : ' + errors.join(' / ') : ''}`, errors.length === 0);
await browser.close();
