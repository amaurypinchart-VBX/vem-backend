// Numéros des Viewbox changés dans l'application (A. Pinchart 10.11.2026) : jeu généré, puis Vue 3D › « 🔢 Numéros »,
// clic sur une box → numéro tapé (échange avec la box qui l'avait), étiquettes sur la 3D ; Planches : bandeau « numéros à
// mettre à jour » → « ↻ Mettre à jour les numéros » (titres réécrits, planches par Viewbox dans l'ordre, Ctrl+Z), puis
// rechargement (réglages enregistrés) et nouveau jeu généré directement avec les nouveaux numéros.
// Préparer : npm run build && npm run e2e:fixture ; node e2e/server.mjs (autre terminal) ; node e2e/run-module-numbers.mjs
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const check = (ok, msg) => {
  if (!ok) throw new Error('ÉCHEC : ' + msg);
  console.log('✔', msg);
};
const errors = [];
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 300));
});
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
const api = (path) => page.evaluate((p) => fetch(`/api/v1${p}`, { headers: { Authorization: 'Bearer tok' } }).then((r) => r.json()).then((j) => j.data), path);
/** titres des planches du jeu enregistré (dans l'ordre) */
const savedTitles = async () => {
  const [rec] = await api('/plans/project/p1/drawing-sets');
  const full = await api(`/plans/drawing-sets/${rec.id}`);
  return full.data.sheets.map((s) => `${s.number} ${s.title}`);
};
const perBox = (titles) => titles.filter((t) => /Plan View - VBX-\d+/.test(t));

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });

// 1. jeu de plans avec les numéros SketchUp
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(3500);
const before = perBox(await savedTitles());
console.log('  planches par Viewbox :', before.join(' | '));
check(before.length >= 3, `${before.length} planches « une par Viewbox »`);
check((await page.getByTestId('numbers-banner').count()) === 0, 'jeu neuf : pas de bandeau des numéros');

// 2. Vue 3D : numéros sur les box, VBX-01 devient VBX-03 (échange avec VBX-03)
await page.getByRole('button', { name: 'Vue 3D' }).click();
await page.locator('.viewer-canvas canvas').first().waitFor({ timeout: 300000 });
await page.waitForTimeout(1500);
await page.getByTestId('toggle-numbering').click();
await page.getByTestId('module-tags').waitFor();
const tags = await page.locator('.module-tag').allTextContents();
check(tags.length >= 3 && tags.includes('VBX-01'), `étiquettes sur la 3D : ${tags.join(', ')}`);
// VBX-01 porte VBX-04 (empilée) : son toit est caché, on clique son numéro pâli
check(await page.locator('.module-tag.covered[data-module="VBX-01"]').count() === 1, 'VBX-01 sous VBX-04 : numéro pâli');
await page.locator('.module-tag[data-module="VBX-01"]').click();
await page.getByTestId('number-bubble').waitFor({ timeout: 10000 });
await page.screenshot({ path: shots + 'numbers-click.png' });
const bubbleText = (await page.getByTestId('number-bubble').innerText()).replace(/\s+/g, ' ');
check(bubbleText.includes('VBX-01'), `clic sur la box : bulle « ${bubbleText} »`);
await page.getByTestId('number-input').fill('3');
check((await page.getByTestId('number-bubble').innerText()).includes('déjà pris'), 'bulle : VBX-03 déjà pris → échange annoncé');
await page.screenshot({ path: shots + 'numbers-bubble.png' });
await page.getByTestId('number-input').press('Enter');
await page.waitForTimeout(800);
const tags2 = await page.locator('.module-tag').evaluateAll((els) => Object.fromEntries(els.map((e) => [e.getAttribute('data-module'), e.textContent])));
check(tags2['VBX-01'] === 'VBX-03' && tags2['VBX-03'] === 'VBX-01', 'étiquettes échangées : VBX-01 ↔ VBX-03');
check((await page.getByTestId('numbering-change').count()) === 2, 'carte « Numéros des Viewbox » : 2 changements');
const model = (await api('/plans/project/p1/models'))?.[0];
const settings = (await api(`/plans/models/${model.id}`))?.settings;
check(settings?.moduleNumbers?.length === 2, `réglages du modèle enregistrés (${JSON.stringify(settings?.moduleNumbers?.map((e) => `${e.id}→${e.label}`))})`);
await page.screenshot({ path: shots + 'numbers-3d.png' });
// clic dans la 3D sur le toit de VBX-02 : bulle VBX-02, numéro proposé = le suivant (4)
const tb = await page.locator('.module-tag[data-module="VBX-02"]').boundingBox();
await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height + 8);
await page.getByTestId('number-bubble').waitFor({ timeout: 10000 });
const b2 = (await page.getByTestId('number-bubble').innerText()).replace(/\s+/g, ' ');
check(b2.includes('VBX-02') && (await page.getByTestId('number-input').inputValue()) === '4', `clic sur la box VBX-02 : bulle « ${b2} », 4 proposé`);
await page.getByTestId('number-input').press('Escape');
check((await page.getByTestId('number-bubble').count()) === 0, 'Échap : bulle fermée sans rien changer');
// liste de gauche
check((await page.locator('.viewer-side .side-row', { hasText: 'VBX-03 (VBX-01)' }).count()) === 1, 'liste : « VBX-03 (VBX-01) »');

// 3. Planches : bandeau → mise à jour
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByTestId('numbers-banner').waitFor({ timeout: 30000 });
const banner = (await page.getByTestId('numbers-banner').innerText()).replace(/\s+/g, ' ');
check(/VBX-01 → VBX-03/.test(banner) && /planches? à mettre à jour/.test(banner), `bandeau : ${banner}`);
await page.screenshot({ path: shots + 'numbers-banner.png' });
// vue aérienne de l'ensemble : numéros dessinés au centre des box (VBX-01 porte VBX-04 : « 1/4 »)
const planNumbers = async () => {
  await page.locator('.sheet-thumb', { has: page.locator('.thumb-title', { hasText: 'Overall aerial view' }) }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('.sheet-canvas svg text[data-dxf="VBX-NUMEROS"]').length > 0, null, { timeout: 300000 });
  return (await page.locator('.sheet-canvas svg text[data-dxf="VBX-NUMEROS"]').allTextContents()).sort().join(' ');
};
check((await planNumbers()) === '1/4 2 3', 'avant mise à jour : la vue aérienne garde ses numéros (1/4 2 3)');
await page.getByTestId('update-numbers').click();
await page.waitForTimeout(3500);
check((await planNumbers()) === '1 2 3/4', 'après : numéros de la vue aérienne (1 2 3/4)');
await page.screenshot({ path: shots + 'numbers-plan.png' });
// PDF du jeu (fait par le serveur) : titres et numéros des plans avec les nouveaux numéros
{
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 600000 }), page.getByRole('button', { name: '⬇ PDF du jeu' }).click()]);
  await dl.saveAs(shots + 'numbers-set.pdf');
  const txt = execFileSync('pdftotext', ['-layout', shots + 'numbers-set.pdf', '-']).toString();
  const pages = txt.split('\f');
  const aerial = pages.find((p) => /Overall aerial view/.test(p)) ?? '';
  check(/3\/4/.test(aerial) && !/1\/4/.test(aerial), 'PDF : vue aérienne avec « 3/4 »');
  check(pages.some((p) => /Plan View - VBX-01/.test(p) && /A2\.6/.test(p)), 'PDF : A2.6 « Plan View - VBX-01 »');
}
check((await page.getByTestId('numbers-banner').count()) === 0, '« Mettre à jour les numéros » : bandeau parti');
const after = perBox(await savedTitles());
console.log('  après :', after.join(' | '));
// dans chaque série (unité A1.x, A2.x…), planches par Viewbox dans l'ordre des nouveaux numéros
const series = new Map();
for (const t of after) {
  const k = t.split('.')[0];
  series.set(k, [...(series.get(k) ?? []), /VBX-(\d+)/.exec(t)[1]]);
}
check([...series.values()].every((o) => o.join() === [...o].sort().join()), 'planches par Viewbox dans l’ordre des nouveaux numéros (dans chaque unité)');
check(after.length === before.length, 'autant de planches');
// la planche de la box SketchUp VBX-03 (seule dans son unité) s'appelle maintenant VBX-01
const lone = before.find((t) => / VBX-03/.test(t)).split(' ')[0];
check(after.find((t) => t.startsWith(lone + ' '))?.endsWith('VBX-01'), `${lone} : « VBX-03 » → « VBX-01 »`);
await page.screenshot({ path: shots + 'numbers-updated.png' });

// Ctrl+Z : les anciens titres reviennent, le bandeau aussi
await page.locator('.sheet-canvas').click({ position: { x: 5, y: 5 } });
await page.keyboard.press('Control+z');
await page.getByTestId('numbers-banner').waitFor({ timeout: 30000 });
check(true, 'Ctrl+Z : bandeau de retour');
await page.keyboard.press('Control+y');
await page.waitForTimeout(3500);
check((await page.getByTestId('numbers-banner').count()) === 0, 'Ctrl+Y : à jour');

// 4. rechargement : les numéros restent (réglages), le jeu reste à jour, un nouveau jeu les prend directement
await page.goto(URL0);
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Ouvrir|Modifier/ }).first().click();
await page.locator('.sheet-editor').waitFor({ timeout: 300000 });
await page.waitForTimeout(3000);
check((await page.getByTestId('numbers-banner').count()) === 0, 'après rechargement (consultation, sans 3D) : jeu à jour, pas de bandeau');
// la Vue 3D relit les numéros enregistrés
await page.getByRole('button', { name: 'Vue 3D' }).click();
await page.locator('.viewer-canvas canvas').first().waitFor({ timeout: 300000 });
check((await page.locator('.viewer-side .side-row', { hasText: 'VBX-03 (VBX-01)' }).count()) === 1, 'Vue 3D après rechargement : « VBX-03 (VBX-01) »');
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: '← Jeux de plans' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByRole('button', { name: 'Générer', exact: true }).waitFor({ timeout: 300000 });
const wizardMods = await page.locator('label.check:visible', { hasText: /^\s*VBX-\d+/ }).allTextContents();
check(wizardMods.map((t) => t.trim()).join(' ') === 'VBX-01 VBX-02 VBX-03 VBX-04', `assistant : Viewbox avec les nouveaux numéros (${wizardMods.map((t) => t.trim()).join(' ')})`);
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(3500);
check((await page.getByTestId('numbers-banner').count()) === 0, 'nouveau jeu : déjà aux nouveaux numéros');
{
  const sets = await api('/plans/project/p1/drawing-sets');
  const last = sets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  const full = await api(`/plans/drawing-sets/${last.id}`);
  const t = full.data.sheets.map((s) => `${s.number} ${s.title}`).filter((x) => /Plan View - VBX-\d+/.test(x));
  console.log('  nouveau jeu :', t.join(' | '));
  check(t.some((x) => x.startsWith('A2.') && x.endsWith('VBX-01')), 'nouveau jeu : la box seule de l’unité 2 s’appelle VBX-01');
}

const real = errors.filter((e) => !/favicon|ResizeObserver/.test(e));
if (real.length) console.log('Erreurs console :', real);
check(!real.some((e) => e.startsWith('pageerror')), 'aucune erreur de page');
await browser.close();
console.log('OK');
