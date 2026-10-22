// Génération d'un jeu de plans sur téléphone (émulation iPhone 14, ZIP lourd conseillé : E2E_FIXTURE_HEAVY=3000) :
// le jeu est créé sans calcul (aucune vue calculée, images 3D en attente), chaque planche calcule ses vues à
// l'affichage et pose ses cotes ; puis l'ordinateur ouvre le jeu : images 3D rendues, cotes de toutes les planches.
import { chromium, devices } from 'playwright-core';

const PORT = process.env.PORT || 4173;
const URL0 = `http://localhost:${PORT}/plans/?projectId=p1&token=tok`;
const exe = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const check = (ok, msg) => { if (!ok) throw new Error('ÉCHEC : ' + msg); console.log('✔', msg); };
const docOf = async () => {
  const list = await (await fetch(`http://localhost:${PORT}/api/v1/plans/project/p1/drawing-sets`, { headers: { Authorization: 'Bearer tok' } })).json();
  const id = list.data[0].id;
  return (await (await fetch(`http://localhost:${PORT}/api/v1/plans/drawing-sets/${id}`, { headers: { Authorization: 'Bearer tok' } })).json()).data.data;
};
const items = (doc, type) => doc.sheets.flatMap((s) => s.items.filter((i) => i.type === type));

// ─── téléphone ───
let b = await chromium.launch({ executablePath: exe, args });
let ctx = await b.newContext({ ...devices['iPhone 14'] });
let page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('dialog', (d) => d.accept());
await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 600000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
check(await page.getByTestId('wizard-phone-note').isVisible(), 'assistant : note « sur téléphone, créé sans calcul »');
let t0 = Date.now();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 600000 });
const genS = Math.round((Date.now() - t0) / 1000);
check(genS < 60, `jeu créé sur téléphone en ${genS} s`);
await page.waitForTimeout(3000);
let doc = await docOf();
const imgs = items(doc, 'image3d');
check(imgs.length > 0 && imgs.every((i) => i.pendingCapture && !i.url), `${imgs.length} image(s) 3D en attente de l'ordinateur`);
const pend0 = items(doc, 'viewport').filter((v) => v.pendingAutoDims).length;
check(pend0 > 0, `${pend0} vue(s) avec cotes en attente`);
// une planche par Viewbox : ses vues sont calculées à l'affichage, ses cotes posées
const n = await page.locator('.sheet-thumb').count();
const numbers = await page.locator('.sheet-thumb .thumb-foot b').allInnerTexts();
const per = numbers.findIndex((x, i) => i > 4 && /A\d/.test(x));
await page.locator('.sheet-thumb').nth(n - 1).tap();
t0 = Date.now();
await page.waitForFunction(() => !document.querySelector('.sheet-canvas')?.textContent?.includes('Calcul de la vue'), null, { timeout: 600000 });
await page.waitForTimeout(3500);
const dims = await page.locator('.sheet-canvas [data-item-type="dimension"]').count();
console.log(`planche ${numbers[n - 1]} : vues en ${Math.round((Date.now() - t0) / 1000)} s, ${dims} cote(s) affichée(s)`);
doc = await docOf();
check(items(doc, 'viewport').filter((v) => v.pendingAutoDims).length < pend0, 'cotes posées sur la planche affichée (enregistrées)');
check(!errors.length, `aucune erreur (${errors.join(' | ')})`);
await b.close();

// ─── ordinateur ───
b = await chromium.launch({ executablePath: exe, args });
page = await b.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('dialog', (d) => d.accept());
await page.goto(URL0);
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.locator('.sheet-editor').waitFor({ timeout: 600000 });
t0 = Date.now();
for (;;) {
  await page.waitForTimeout(5000);
  doc = await docOf();
  const left = items(doc, 'image3d').filter((i) => i.pendingCapture).length + items(doc, 'viewport').filter((v) => v.pendingAutoDims).length;
  if (!left || Date.now() - t0 > 900000) break;
}
check(items(doc, 'image3d').every((i) => i.url && !i.pendingCapture), 'ordinateur : images 3D rendues et enregistrées');
check(items(doc, 'viewport').every((v) => !v.pendingAutoDims), `ordinateur : cotes de toutes les planches posées (${items(doc, 'dimension').length} cotes)`);
await b.close();
console.log('OK');
