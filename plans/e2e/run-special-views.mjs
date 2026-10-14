// Test navigateur : Vues 2D › « ✂️ Vues spéciales » (VS4–VS5) — préréglage « Dessous de toiture », aperçu 2D vectoriel,
// clic sur une pièce → bulle → « Retirer dans toutes les Viewbox », annuler / rétablir, éléments retirés en rouge,
// dispositions (ensemble / séparées / chaque Viewbox), enregistrement et réouverture.
// Serveur : cd plans && npm run build && node e2e/server.mjs (ZIP=… pour un vrai modèle, ex. Qatar)
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
const page = await browser.newPage({ viewport: { width: 1750, height: 1100 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
  if (m.text().startsWith('[vues spéciales]')) console.log('   ', m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? d.defaultValue() || 'Vue e2e' : undefined));
let failed = 0;
const check = (label, ok) => {
  if (!ok) failed++;
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${label}`);
};
const previewDone = async (timeout = 1800000) => {
  await page.waitForTimeout(300);
  await page.waitForFunction(() => ['done', 'error'].includes(document.querySelector('[data-testid="cv-preview"]')?.getAttribute('data-status') ?? ''), null, { timeout, polling: 500 });
  await page.locator('[data-testid="cv-preview-img"]').waitFor({ timeout });
};
const chipCount = () => page.locator('[data-testid="cv-chip"]').count();

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 600000 });
await page.getByRole('button', { name: 'Vues 2D' }).click();
await page.locator('[data-testid="tab-special-views"]').click();
await page.locator('[data-testid="custom-views"]').waitFor();
check('onglet Vues spéciales : préréglages listés', (await page.locator('.cv-preset').count()) >= 8);

// 1. préréglage
const preset = process.env.PRESET ?? 'roof-under-no-ceiling';
await page.locator(`[data-testid="cv-preset-${preset}"]`).click();
await previewDone();
const name0 = await page.locator('[data-testid="cv-name"]').inputValue();
console.log('   nom proposé :', name0);
check('nom proposé « Dessous de toiture… »', /^Dessous de toiture/.test(name0));
const svgInfo = async () =>
  page.evaluate(async () => {
    const img = document.querySelector('[data-testid="cv-preview-img"]');
    const txt = await (await fetch(img.src)).text();
    return { cut: (txt.match(/data-layer="cut"/g) || []).length, fill: (txt.match(/data-layer="cut-fill"/g) || []).length, paths: (txt.match(/<path/g) || []).length, labels: (txt.match(/data-layer="label"/g) || []).length };
  });
const s0 = await svgInfo();
console.log('   aperçu :', JSON.stringify(s0));
check('aperçu vectoriel avec trait de coupe', s0.cut > 0 && s0.paths > 0);
check('aperçu : sous-titre « Vue de dessous (miroir du plan) »', (await page.locator('.cv-preview-head').innerText()).includes('miroir du plan'));
await page.locator('.cv-main').screenshot({ path: shots + 'special-preset.png' });

// 2. enregistrer
const saved0 = await page.locator('[data-testid="cv-saved"]').count();
await page.locator('[data-testid="cv-save"]').click();
await page.locator('[data-testid="cv-save-state"]').waitFor();
check('vue enregistrée dans la liste', (await page.locator('[data-testid="cv-saved"]').count()) === saved0 + 1);

// 3. clic sur une pièce → bulle → action principale
const chips0 = await chipCount();
const canvas = page.locator('.cv-3d canvas');
const box = await canvas.boundingBox();
let bubble = false;
for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.4, 0.4], [0.6, 0.6], [0.35, 0.6], [0.65, 0.4]]) {
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(400);
  if (await page.locator('[data-testid="cv-bubble"]').isVisible()) {
    bubble = true;
    break;
  }
}
check('clic sur une pièce : bulle avec fil d’Ariane', bubble);
if (bubble) {
  const crumbs = await page.locator('.cv-crumbs').innerText();
  console.log('   fil d’Ariane :', crumbs.replace(/\s+/g, ' '));
  check('fil d’Ariane commence par la Viewbox', /^VBX-\d+/.test(crumbs.trim()));
  const actions = await page.locator('.cv-actions .btn').allInnerTexts();
  console.log('   actions :', actions.join(' | '));
  await page.locator('[data-testid="cv-bubble"]').screenshot({ path: shots + 'special-bubble.png' });
  await page.locator('.cv-actions .btn.primary').click();
  await page.waitForTimeout(300);
  check('règle ajoutée (pastille)', (await chipCount()) === chips0 + 1);
  const last = await page.locator('[data-testid="cv-chip"]').last().innerText();
  console.log('   pastille :', last.replace(/\s+/g, ' '));
  // annuler / rétablir
  await page.locator('.cv-3d').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(200);
  check('Ctrl+Z : règle annulée', (await chipCount()) === chips0);
  await page.keyboard.press('Control+y');
  await page.waitForTimeout(200);
  check('Ctrl+Y : règle rétablie', (await chipCount()) === chips0 + 1);
  await previewDone();
}

// 4. éléments retirés en rouge
await page.locator('[data-testid="cv-show-removed"]').check();
await page.waitForTimeout(500);
await page.locator('.cv-3d').screenshot({ path: shots + 'special-removed.png' });
await page.locator('[data-testid="cv-show-removed"]').uncheck();

// 5. dispositions
for (const [label, expectLabels] of [
  ['Séparées', true],
  ['Chaque Viewbox', true],
  ['Ensemble + séparées', true],
]) {
  await page.locator('[data-testid="cv-layout"]').getByRole('button', { name: label, exact: true }).click();
  await previewDone();
  const info = await svgInfo();
  const head = await page.locator('.cv-preview-head').innerText();
  console.log(`   ${label} :`, JSON.stringify(info), '·', head.replace(/\s+/g, ' ').slice(0, 160));
  check(`${label} : titres des blocs`, !expectLabels || info.labels > 0);
  await page.locator('.cv-preview').screenshot({ path: shots + `special-layout-${label.replace(/\W+/g, '-')}.png`, timeout: 120000 });
}
await page.locator('[data-testid="cv-layout"]').getByRole('button', { name: 'Ensemble', exact: true }).click();

// 6. coupe longitudinale nommée A ajoutée à la vue (la vue se met de gauche, dans les axes de la Viewbox)
await page.locator('[data-testid="cv-cuts"]').getByRole('button', { name: '＋ Longitudinale' }).click();
await page.locator('[data-testid="cv-cut"]').last().locator('input[placeholder="A"]').fill('A');
await previewDone();
check('coupe longitudinale ajoutée : vue de gauche dans les axes de la Viewbox', await page.locator('[data-testid="cv-direction"]').getByLabel(/Axes de la Viewbox/).isChecked());
await page.waitForTimeout(2600);
// préréglage « Coupe longitudinale A-A » : pièces coupées remplies
await page.locator('[data-testid="cv-preset-section-long"]').click();
await previewDone();
const sA = await svgInfo();
console.log('   coupe A-A :', JSON.stringify(sA));
check('coupe A-A : trait de coupe et pièces coupées remplies', sA.cut > 0 && sA.fill > 0);
await page.locator('[data-testid="cv-save"]').click();
await page.locator('[data-testid="cv-save-state"]').waitFor();
await page.locator('.cv-main').screenshot({ path: shots + 'special-section.png' });

// 7. enregistrement automatique
await page.waitForTimeout(2600);
check('enregistrement automatique', (await page.locator('[data-testid="cv-save-state"]').innerText()).includes('Enregistrée'));

// 8. planches (VS6) : jeu standard généré, puis la vue spéciale ajoutée (repères A–A sur les vues en plan)
if (process.env.SKIP_SHEETS !== '1') {
  await page.getByRole('button', { name: 'Planches A1' }).click();
  await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
  await page.getByLabel(/Séparer en/).uncheck().catch(() => {});
  await page.getByRole('button', { name: 'Générer', exact: true }).click();
  await page.locator('.sheet-editor').waitFor({ timeout: 1800000 });
  await page.waitForTimeout(1500);
  const before = await page.locator('.sheet-thumb').count();
  await page.getByRole('button', { name: 'Vues 2D' }).click();
  await page.locator('[data-testid="cv-add-sheet"]').click();
  await page.locator('[data-testid="cv-sheet-dialog"]').waitFor();
  await page.locator('[data-testid="cv-sheet-dialog"]').screenshot({ path: shots + 'special-sheet-dialog.png' });
  await page.locator('[data-testid="cv-sheet-add"]').click();
  await page.locator('[data-testid="cv-sheet-info"]').waitFor({ timeout: 120000 });
  console.log('   ', await page.locator('[data-testid="cv-sheet-info"]').innerText());
  await page.locator('[data-testid="cv-sheet-dialog"]').getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Planches A1' }).click();
  await page.waitForTimeout(800);
  const after = await page.locator('.sheet-thumb').count();
  check('planche de vue spéciale ajoutée au jeu ouvert', after === before + 1);
  await page.locator('.sheet-thumb').nth(after - 1).click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet-paper svg path[data-dxf="VS-COUPE"]').length > 0, null, { timeout: 1800000, polling: 1000 });
  const titles = await page.evaluate(() => [...document.querySelectorAll('.sheet-paper svg [data-dxf="VBX-TITRES"] text')].map((t) => t.textContent ?? ''));
  console.log('   titres :', titles.join(' | '));
  check('planche : trait de coupe (calque VS-COUPE)', (await page.locator('.sheet-paper svg path[data-dxf="VS-COUPE"]').count()) > 0);
  check('planche : titre avec l’échelle', titles.some((t) => /1:50/.test(t)));
  await page.locator('.sheet-canvas').screenshot({ path: shots + 'special-sheet.png' });
  // repères A–A sur la vue de dessus de la planche « 4 vues »
  let marks = 0;
  for (let i = 0; i < after - 1 && !marks; i++) {
    await page.locator('.sheet-thumb').nth(i).click();
    await page.waitForTimeout(700);
    marks = await page.locator('.sheet-paper svg [data-dxf="VS-REPERES"]').count();
    if (marks) await page.locator('.sheet-canvas').screenshot({ path: shots + 'special-marks.png' });
  }
  check('repères de coupe A–A posés sur une vue en plan du jeu', marks > 0);
  // exports
  await page.locator('.sheet-thumb').nth(after - 1).click();
  await page.waitForTimeout(1500);
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.getByRole('button', { name: '⬇ PDF planche' }).click()]);
  await pdf.saveAs(shots + 'special-sheet.pdf');
  await page.getByRole('button', { name: '⬇ DXF', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Export DXF' });
  await dlg.getByLabel(/La planche affichée/).check();
  await dlg.getByLabel(/Planche complète/).check();
  const [dxf] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), dlg.getByRole('button', { name: '⬇ Télécharger' }).click()]);
  await dxf.saveAs(shots + 'special-sheet.dxf');
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(shots + 'special-sheet.dxf', 'utf8');
  const layers = [...new Set([...text.matchAll(/\n\s*8\r?\n(VS-[A-Z]+)\r?\n/g)].map((m) => m[1]))];
  console.log('   calques VS du DXF :', layers.join(', '));
  check('DXF : calques VS-COUPE et VS-HACHURE (aplats des pièces coupées)', layers.includes('VS-COUPE') && layers.includes('VS-HACHURE'));
  check('DXF : cotes automatiques (VBX-COTES)', /\n\s*8\r?\nVBX-COTES\r?\n/.test(text));
  const pdfText = readFileSync(shots + 'special-sheet.pdf', 'latin1');
  check('PDF : une page, vectoriel (aucune image)', (pdfText.match(/\/Type \/Page\b/g) || []).length === 1 && !/\/Subtype \/Image/.test(pdfText));
}
// 9. mémoire (VS7) : préréglage partagé, image 3D coupée, Réglages › Vues spéciales
await page.getByRole('button', { name: 'Vues 2D' }).click();
await page.locator('[data-testid="cv-save-preset"]').click();
await page.locator('[data-testid="cv-notice"]').waitFor();
const n1 = await page.locator('[data-testid="cv-notice"]').innerText();
console.log('   ', n1.replace(/\s+/g, ' '));
check('préréglage partagé enregistré', /Préréglage « .+ » enregistré/.test(n1));
check('préréglage partagé proposé dans la liste', (await page.locator('.cv-preset').count()) >= 9);
await page.locator('[data-testid="cv-capture"]').click();
await page.waitForFunction(() => /ajoutée aux captures|impossible/.test(document.querySelector('[data-testid="cv-notice"]')?.textContent ?? ''), null, { timeout: 300000 });
const n2 = await page.locator('[data-testid="cv-notice"]').innerText();
console.log('   ', n2.replace(/\s+/g, ' '));
check('image 3D coupée ajoutée aux captures', n2.includes('ajoutée aux captures'));
await page.getByRole('button', { name: 'Réglages' }).click();
await page.locator('[data-testid="settings-views"]').click();
await page.locator('[data-testid="vs-presets"]').waitFor({ timeout: 30000 });
check('Réglages › Vues spéciales : préréglage partagé listé', (await page.locator('[data-testid="vs-presets"] tbody tr').count()) >= 1);
await page.locator('[data-testid="view-settings"]').screenshot({ path: shots + 'special-settings.png' });
await page.getByRole('button', { name: 'Modèles' }).first().click().catch(() => {});

await page.reload();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.getByRole('button', { name: 'Vues 2D' }).click({ timeout: 600000 });
await page.locator('[data-testid="tab-special-views"]').click();
await page.locator('[data-testid="cv-saved"]').first().waitFor({ timeout: 600000 });
await page.locator('[data-testid="cv-saved"] .nm').nth(saved0).click();
await page.waitForTimeout(500);
check('réouverture : coupes conservées (toiture + A)', (await page.locator('[data-testid="cv-cut"]').count()) === 2);
check('réouverture : règles conservées', (await chipCount()) >= chips0 + (bubble ? 1 : 0));

console.log('Erreurs console :', errors.length ? errors : 'aucune');
console.log(failed ? `${failed} échec(s)` : 'Tout est OK');
await browser.close();
process.exit(failed ? 1 : 0);
