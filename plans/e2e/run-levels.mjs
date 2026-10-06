// Test navigateur des niveaux du sol relevés (étape 5 « Sol & calage », vue « Niveaux du sol ») : clic sur les pieds,
// saisie en mm au clavier (Entrée = pied suivant), un pied laissé vide, tableau ; plan de calage A3 envoyé dans un jeu
// de plans 2D, puis organisation des planches (monter, déplacer après…, glisser-déposer, supprimer, annuler).
// Captures et PDF dans e2e/shots/.
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
const page = await browser.newPage({ viewport: { width: 1600, height: 1050 }, acceptDownloads: true });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => { console.log('Dialogue :', d.message().replace(/\n+/g, ' ')); d.accept(); });

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Étude structure' }).click();
await page.getByText('Vue 3D — statut des pièces').waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);
if (await page.getByRole('button', { name: /Traiter la file/ }).count()) {
  await page.getByRole('button', { name: /Traiter la file/ }).click();
  for (let k = 0; k < 30; k++) {
    await page.getByText('Qu’est-ce que c’est ?').waitFor({ timeout: 10000 }).catch(() => {});
    if (!(await page.getByText('Qu’est-ce que c’est ?').count())) break;
    const isModule = await page.getByText('Gabarit de calcul').count();
    const next = page.getByRole('button', { name: 'Valider et suivant' });
    if (!isModule) await page.getByRole('button', { name: 'Ignorer (non structurel)' }).click();
    else if (await next.count()) await next.click();
    else await page.getByRole('button', { name: 'Valider', exact: true }).click();
    await page.waitForTimeout(400);
  }
}
// calcul avec pieds à vérin (le rattrapage est pris par la sortie des tiges, 50 mm vérifiés)
await page.getByRole('button', { name: /3\. Calcul/ }).click();
await page.getByText('Pieds à vérin utilisés').click();
await page.getByRole('button', { name: /Lancer le calcul/ }).click({ timeout: 10000 });
await page.getByRole('button', { name: /Voir les résultats/ }).waitFor({ timeout: 600000 });
await page.getByRole('button', { name: /5\. Sol & calage/ }).click();
await page.getByText(/^Plan des appuis — /).waitFor({ timeout: 120000 });
const plan = page.locator('.card', { hasText: 'Plan des appuis —' }).first();
await plan.getByRole('button', { name: /^Niveaux du sol/ }).click();
await plan.locator('svg g[style*="cursor"]').first().waitFor();
const n = await plan.locator('svg g[style*="cursor"]').count();
console.log('Pieds sur le plan :', n);
// premier pied cliqué, puis saisie au clavier : Entrée = pied suivant (de bas en haut, de gauche à droite)
await plan.locator('svg g[style*="cursor"]').first().click();
const field = plan.locator('.level-editor input');
await field.waitFor();
const values = ['0', '-5', '-12', '-15', '-22', '-30', '-38', '-45', '-60', '-8', '+3'];
for (let k = 0; k < Math.min(n - 1, values.length); k++) {
  await field.fill(values[k]);
  await field.press('Enter');
  await page.waitForTimeout(150);
}
await page.waitForTimeout(600);
console.log('Pied courant :', (await plan.locator('.level-editor').innerText()).replace(/\s+/g, ' ').slice(0, 140));
console.log('Tuiles niveaux :', (await plan.locator('.levels-card .stats').innerText()).replace(/\s+/g, ' '));
console.log('Notes :', (await plan.locator('.levels-card .warnings').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')));
await plan.scrollIntoViewIfNeeded();
await page.screenshot({ path: shots + 'niveaux-plan.png' });
await plan.getByRole('button', { name: /Saisir en tableau/ }).click();
await plan.locator('.levels-table').scrollIntoViewIfNeeded();
await page.screenshot({ path: shots + 'niveaux-tableau.png' });
// plan des appuis au sol (PDF) avec les colonnes de niveau
const [dlp] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Plan des appuis au sol (PDF)' }).click()]);
await dlp.saveAs(shots + 'niveaux-appuis.pdf');
await page.waitForTimeout(2600); // enregistrement automatique de l'étude
// vers les plans 2D : étape 6, plan de calage A3 (PDF seul) puis ajout à un jeu de plans
await plan.getByRole('button', { name: /Envoyer le plan de calage dans les plans 2D/ }).click();
await page.getByText('Rapport PDF').first().waitFor();
const [dla] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.getByRole('button', { name: '⬇ Plan de calage A3' }).click()]);
await dla.saveAs(shots + 'niveaux-plan-calage.pdf');
console.log('Plan de calage A3 :', dla.suggestedFilename());
await page.getByRole('button', { name: '＋ Ajouter le plan de calage au jeu de plans' }).click();
await page.getByText(/créé avec la planche|ajoutée au jeu/).waitFor({ timeout: 300000 });
console.log('Plans 2D :', await page.getByText(/créé avec la planche|ajoutée au jeu/).innerText());
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Ouvrir/ }).first().click();
await page.locator('.sheet-editor').waitFor({ timeout: 300000 });
await page.waitForTimeout(3000);
await page.screenshot({ path: shots + 'niveaux-jeu.png' });
// organisation du jeu : une seconde planche (dupliquée), monter, déplacer après…, glisser-déposer, supprimer, annuler
const numbers = async () => (await page.locator('.sheet-thumb .thumb-foot b').allInnerTexts()).join(' ');
const titles = async () => (await page.locator('.sheet-thumb .thumb-title').allInnerTexts()).map((t) => t.slice(0, 18)).join(' | ');
await page.getByRole('button', { name: '⧉ Dupliquer' }).click();
await page.getByRole('button', { name: '+ Planche' }).click();
await page.waitForTimeout(500);
console.log('Jeu :', await numbers(), '—', await titles());
await page.getByRole('button', { name: '↑ Monter' }).click();
console.log('Après « Monter » :', await titles());
await page.locator('.prop-field', { hasText: 'Organiser le jeu' }).locator('select').selectOption({ index: 2 });
console.log('Après « Déplacer en tête » :', await titles());
await page.screenshot({ path: shots + 'planches-organiser.png' });
const thumbs = page.locator('.sheet-thumb');
await thumbs.nth(0).dragTo(thumbs.nth(2), { targetPosition: { x: 20, y: 100 } });
await page.waitForTimeout(300);
console.log('Après glisser-déposer :', await titles());
await page.getByRole('button', { name: '🗑 Supprimer la planche' }).click();
await page.waitForTimeout(300);
console.log('Après suppression :', await numbers(), '—', await titles());
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
console.log('Après Ctrl+Z :', await numbers(), '—', await titles());
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
