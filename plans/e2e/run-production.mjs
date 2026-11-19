// Test navigateur : plans de production (liste de débit + une planche par pièce, en anglais).
//   cd plans && npm run build && ZIP=../test-models/<modèle>.dae node e2e/server.mjs   (puis)   node e2e/run-production.mjs
// (sans ZIP : la maquette d'essai, sans perçage). Parcours : analyse → Planches A1 → assistant : seulement « Plans de
// production », Viewbox mesurée → génération → liste de débit (repères, renvois PR.n) → plan d'assemblage → planche d'une pièce (3 vues
// calculées, cotes, repères des perçages, tableau HOLES), plan d'assemblage (bulles, nomenclature).
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/production-';
mkdirSync(dirname(shots), { recursive: true });
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
// textures d'un .dae chargé seul (sans son dossier) : 404 attendus
page.on('response', (r) => { if (r.status() >= 400 && !/\.(png|jpe?g)$/i.test(r.url())) errors.push(`${r.status()} ${r.url()}`); });
const check = (label, ok) => {
  console.log(`${ok ? '✓' : '✗'} ${label}`);
  if (!ok) process.exitCode = 1;
};

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
// seulement les plans de production
await page.locator('[data-kind=production]').waitFor();
for (const kind of await page.locator('.wizard-list [data-kind]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind')))) {
  const box = page.locator(`[data-kind=${kind}] > input[type=checkbox]`);
  if (kind !== 'production' && (await box.isEnabled()) && (await box.isChecked())) await box.uncheck();
}
await page.locator('[data-kind=production] input[type=checkbox]').check();
await page.getByTestId('wizard-production').waitFor();
const info = await page.getByTestId('wizard-production').innerText();
check(`assistant : ${info.replace(/\s+/g, ' ').trim()}`, /type\(s\) de pièce/.test(info));
await page.screenshot({ path: shots + 'wizard.png' });
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.waitForTimeout(2500);
const titles = (await page.locator('.sheet-thumb .thumb-foot').allInnerTexts()).map((t) => t.replace(/[↑↓⧉🗑]/g, '').replace(/\s+/g, ' ').trim());
console.log('Planches :', titles.slice(0, 6).join(' | '), titles.length > 6 ? `… (${titles.length})` : '');
check('série PR : liste de débit en premier', /PR\.1/.test(titles[0]) && /Cut list/.test(titles[0]));
const texts = await page.locator('.sheet-paper svg text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
check('liste de débit : CUT LIST, repère P01, renvoi PR.5 (après les 3 plans d’assemblage)', texts.includes('CUT LIST') && texts.includes('P01') && texts.includes('PR.5'));
await page.screenshot({ path: shots + 'cutlist.png' });
// plan d'assemblage (PR.2) : vues de la box, bulles P01… une seule fois, nomenclature
await page.locator('.sheet-thumb').nth(1).click();
await page.waitForTimeout(2500);
const asm = await page.locator('.sheet-paper svg text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
const marks = asm.filter((x) => /^P\d{2}$/.test(x));
check(`plan d'assemblage : PARTS LIST + vues`, asm.includes('PARTS LIST') && asm.includes('TOP VIEW') && asm.includes('LONG SIDE'));
const balloons = await page.locator('.sheet-paper svg circle + text').evaluateAll((els) => els.map((e) => e.textContent ?? '').filter((t) => /^P\d{2}$/.test(t)));
check(`bulles posées (${balloons.length}), chacune une fois`, balloons.length >= 5 && new Set(balloons).size === balloons.length && marks.length > balloons.length);
await page.screenshot({ path: shots + 'assembly.png' });
// sous-ensembles plancher et toit (PR.3, PR.4)
const t3 = titles.slice(0, 5).join(' | ');
await page.locator('.sheet-thumb').nth(2).click();
await page.waitForTimeout(2500);
const floor = await page.locator('.sheet-paper svg text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
check(`plan d'assemblage plancher (${t3})`, floor.includes('BOTTOM VIEW') && floor.includes('PARTS LIST') && floor.some((x) => /Floor platform/.test(x)));
await page.screenshot({ path: shots + 'floor.png' });
// première pièce avec des perçages : planche dont le tableau HOLES a des lignes
let found = false;
for (let i = 1; i < titles.length && !found; i++) {
  await page.locator('.sheet-thumb').nth(i).click();
  await page.waitForTimeout(600);
  const t = await page.locator('.sheet-paper svg text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
  if (!t.includes('HOLES') || !t.some((x) => /^Drill/.test(x)) || !t.some((x) => /^DETAIL A/.test(x))) continue;
  found = true;
  await page.waitForFunction(() => !document.querySelector('.sheet-paper [data-status=running], .sheet-paper .vp-loading'), null, { timeout: 300000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const t2 = await page.locator('.sheet-paper svg text').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
  check(`planche ${titles[i]} : ELEVATION / PLAN / END VIEW`, ['ELEVATION', 'PLAN', 'END VIEW'].every((x) => t2.includes(x)) || ['FACE', 'EDGE'].every((x) => t2.includes(x)));
  check('cotes posées (mm)', t2.filter((x) => / mm$/.test(x)).length >= 3);
  check('repère de perçage sur la vue (« A — 9× Ø10 »…)', t2.some((x) => /^[A-Z] — \d+× /.test(x)));
  check('données de la pièce : QTY … PER VIEWBOX, Material à remplir', t2.some((x) => /QTY \d+ PER VIEWBOX/.test(x)) && t2.includes('Material'));
  check('détail agrandi d’un bout (DETAIL A — LEFT END)', t2.some((x) => /^DETAIL A — (LEFT|RIGHT) END$/.test(x)));
  await page.screenshot({ path: shots + 'part.png' });
}
check('une pièce percée trouvée', found);
check(`aucune erreur console${errors.length ? ' : ' + errors.slice(0, 3).join(' | ') : ''}`, errors.length === 0);
await browser.close();
