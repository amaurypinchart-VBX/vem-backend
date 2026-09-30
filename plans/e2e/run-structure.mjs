// Test navigateur de l'étude structure (sol et calage) : calage rapide sans modèle (grille de Viewbox, fiche PDF), puis
// onglet « Étude structure » d'un modèle analysé. Captures et PDF dans e2e/shots/ (contrôle : pdfinfo, pdftoppm).
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, acceptDownloads: true });
const errors = [];
// la page défile dans <main> (hauteur fixe) : une capture par hauteur d'écran
async function shootAll(name) {
  const h = await page.evaluate(() => document.querySelector('main').scrollHeight);
  for (let k = 0, y = 0; y < h && k < 6; k++, y += 900) {
    await page.evaluate((top) => (document.querySelector('main').scrollTop = top), y);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}${name}-${k + 1}.png` });
  }
  await page.evaluate(() => (document.querySelector('main').scrollTop = 0));
}
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(URL0);
// 1. calage rapide : 3 × 2 emplacements, une rangée à 2 niveaux
await page.getByRole('button', { name: /Calage rapide/ }).click();
await page.getByText('Plan des appuis').waitFor();
await page.getByText('Viewbox en largeur').locator('select').selectOption('2');
await page.waitForTimeout(300);
const cells = page.locator('table.list select');
for (let k = 0; k < 3; k++) await cells.nth(k).selectOption('2');
await page.waitForTimeout(800);
console.log('Types d’appui :', await page.locator('.card-head .chip').allInnerTexts());
await shootAll('structure-rapide');
// stock de l'entrepôt : une plaque 100 × 100 × 27 mm, proposée ensuite parmi les solutions
await page.getByRole('button', { name: /Stock de l’entrepôt/ }).click();
await page.getByRole('button', { name: '+ Plaque', exact: true }).click();
await page.getByRole('button', { name: 'Enregistrer le stock' }).click();
await page.getByText('✓ Stock enregistré').waitFor();
await page.locator('b', { hasText: 'Plaques du stock' }).first().waitFor({ timeout: 15000 });
console.log('Solutions « stock » proposées :', await page.locator('b', { hasText: 'Plaques du stock' }).count());
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Fiche PDF' }).click()]);
await dl.saveAs(shots + 'calage-rapide.pdf');
console.log('Fiche PDF :', dl.suggestedFilename());

// 2. modèle analysé → onglet Étude structure
await page.getByRole('button', { name: '← Modèles' }).click();
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Étude structure' }).click();
await page.getByText('Vue 3D — statut des pièces').waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);
const counts = () => page.getByText(/type\(s\) à renseigner/).innerText();
console.log('Reconnaissance :', await counts());
await shootAll('structure-reconnaissance');
// file des types à renseigner : on répond à tout (valeurs proposées ou « ignorer »), mémorisé dans la bibliothèque
let answered = 0;
let askedAi = false;
if (await page.getByRole('button', { name: /Traiter la file/ }).count()) {
  await page.getByRole('button', { name: /Traiter la file/ }).click();
  for (let k = 0; k < 30; k++) {
    await page.getByText('Qu’est-ce que c’est ?').waitFor({ timeout: 10000 }).catch(() => {});
    if (!(await page.getByText('Qu’est-ce que c’est ?').count())) break;
    const isModule = await page.getByText('Gabarit de calcul').count();
    const next = page.getByRole('button', { name: 'Valider et suivant' });
    if (!isModule && !askedAi) {
      // IA : proposition pour la pièce (images de la pièce envoyées), champs remplis, reste à valider
      askedAi = true;
      await page.getByRole('button', { name: '🤖 Demander à l’IA' }).click();
      await page.getByText('Proposition de l’IA').waitFor({ timeout: 60000 });
      console.log('IA identification :', (await page.getByText(/confiance \d+ %/).innerText()).trim());
      await shootAll('structure-ia-identification');
      await page.getByRole('button', { name: '⚙ Panneau composé' }).click();
      await page.getByRole('button', { name: /Chercher les données sur internet/ }).isDisabled();
      await page.getByPlaceholder(/Décrire le panneau/).fill('profilés alu 45 mm creux, Nidaplast 45 mm, parement 2 mm');
      await page.getByRole('button', { name: /Chercher les données sur internet/ }).click();
      await page.getByRole('button', { name: /Utiliser ce poids/ }).waitFor();
      console.log('Panneau composé :', await page.getByRole('button', { name: /Utiliser ce poids/ }).innerText());
      await shootAll('structure-ia-panneau');
      await page.getByRole('button', { name: /Utiliser ce poids/ }).click();
    }
    if (!isModule) await page.getByRole('button', { name: 'Ignorer (non structurel)' }).click();
    else if (await next.count()) await next.click();
    else await page.getByRole('button', { name: 'Valider', exact: true }).click();
    answered++;
    await page.waitForTimeout(400);
  }
}
await page.waitForTimeout(2600); // enregistrement automatique de l'étude (2 s)
console.log(`Types traités : ${answered} ; ensuite :`, await counts(), (await page.getByText(/Étude enregistrée/).count()) ? '(étude enregistrée)' : '');
await shootAll('structure-reconnue');
// gabarit de calcul d'une Viewbox : barres dessinées en couleur, tableau des sections
await page.locator('button.btn.ghost:visible', { hasText: /×.*Viewbox$/ }).first().click();
await page.getByText('Chaque Viewbox de ce type est calculée avec ces barres').waitFor();
await page.waitForTimeout(800);
console.log('Gabarit :', (await page.locator('table.list').first().locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).slice(0, 8));
await shootAll('structure-gabarit');
// 3. calcul complet (Workers) puis 4. résultats
await page.getByRole('button', { name: /3\. Calcul/ }).click();
await page.getByText('Calcul complet').first().waitFor();
const blockingMsgs = await page.locator('.warning.error .msg').allInnerTexts();
if (blockingMsgs.length) console.log('Bloquant :', blockingMsgs);
await shootAll('structure-calcul-avant');
await page.getByRole('button', { name: /Lancer le calcul/ }).click({ timeout: 10000 });
let t0 = Date.now();
await Promise.race([
  page.getByRole('button', { name: /Voir les résultats/ }).waitFor({ timeout: 600000 }),
  page.locator('.error-box').waitFor({ timeout: 600000 }).then(async () => {
    throw new Error('Calcul en erreur : ' + (await page.locator('.error-box').innerText()));
  }),
]);
console.log(`Calcul complet : ${((Date.now() - t0) / 1000).toFixed(1)} s —`, (await page.getByText(/passe|limite|ne passe pas|incomplet/).first().innerText()).trim(), '—', await page.getByText(/combinaisons en/).innerText());
await shootAll('structure-calcul');
await page.getByRole('button', { name: /Voir les résultats/ }).click();
await page.getByText('Par famille').waitFor();
await page.waitForTimeout(1500);
console.log('Familles :', (await page.locator('table.list').first().locator('tbody tr').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).slice(0, 12));
await page.getByText('Les plus sollicités').waitFor();
await page.locator('table.list').nth(1).locator('tbody tr').first().click();
await page.waitForTimeout(400);
await shootAll('structure-resultats');
// barres du calcul colorées par taux, clic sur une barre ; relecture de cohérence par l'IA
await page.locator('label:visible', { hasText: 'barres du calcul' }).click();
await page.waitForTimeout(800);
const canvas = page.locator('canvas:visible').first();
const box = await canvas.boundingBox();
for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.4, 0.6], [0.6, 0.4]]) {
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  await page.waitForTimeout(300);
  if (await page.getByText(/barre B|barre \w/).count()) break;
}
console.log('Barre cliquée :', (await page.getByText(/ · barre /).count()) ? (await page.getByText(/ · barre /).first().innerText()).slice(0, 120) : 'aucune');
await shootAll('structure-barres');
await page.locator('label:visible', { hasText: 'barres du calcul' }).click();
await page.getByRole('button', { name: /Relire la cohérence/ }).click();
await page.getByText(/aucune incohérence de poids relevée|Aucune incohérence/).first().waitFor({ timeout: 60000 });
console.log('Relecture IA : OK');
await page.getByRole('button', { name: /5\. Sol & calage/ }).click();
await page.getByText('Plan des appuis').waitFor({ timeout: 120000 });
await page.waitForTimeout(800);
await shootAll('structure-modele');
console.log('Calage :', await page.getByText(/^Réactions : /).innerText());
const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Fiche PDF' }).click()]);
await dl2.saveAs(shots + 'calage-modele.pdf');
console.log('Fiche PDF du modèle :', dl2.suggestedFilename());
// 6. Rapport : aperçu, PDF (FR compact puis DE détaillé), plan de calage A3 seul, enregistrement dans le projet
await page.getByRole('button', { name: /6\. Rapport/ }).click();
await page.getByText('Rapport PDF').first().waitFor();
t0 = Date.now();
await page.getByRole('button', { name: /Rédiger les textes \(IA\)/ }).click();
await page.getByText('Description de l’ouvrage').first().waitFor({ timeout: 60000 });
console.log('Textes IA :', (await page.locator('textarea').first().inputValue()).slice(0, 80));
await page.getByRole('button', { name: 'Aperçu' }).click();
await page.locator('img.report-page').waitFor({ timeout: 300000 });
console.log(`Rapport préparé en ${((Date.now() - t0) / 1000).toFixed(1)} s :`, await page.getByText(/pages \(/).innerText());
await shootAll('structure-rapport');
await page.getByRole('button', { name: '2', exact: true }).click();
await page.waitForTimeout(500);
await shootAll('structure-rapport-p2');
const [dl3] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.getByRole('button', { name: '⬇ PDF du rapport' }).click()]);
await dl3.saveAs(shots + 'rapport-fr.pdf');
console.log('Rapport PDF :', dl3.suggestedFilename());
const [dl4] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.getByRole('button', { name: '⬇ Plan de calage A3' }).click()]);
await dl4.saveAs(shots + 'plan-calage.pdf');
console.log('Plan de calage :', dl4.suggestedFilename());
await page.locator('label:has-text("Langue") select').selectOption('de');
await page.locator('label:has-text("Version") select').selectOption('detailed');
const [dl5] = await Promise.all([page.waitForEvent('download', { timeout: 300000 }), page.getByRole('button', { name: '⬇ PDF du rapport' }).click()]);
await dl5.saveAs(shots + 'rapport-de.pdf');
console.log('Rapport DE détaillé :', dl5.suggestedFilename());
await page.getByRole('button', { name: 'Enregistrer dans le projet' }).click();
await page.getByText('Rapports enregistrés').waitFor();
await page.locator('a', { hasText: 'Statische Vorbemessung' }).waitFor({ timeout: 300000 });
console.log('Rapports enregistrés :', await page.locator('a', { hasText: '.pdf' }).count());
// Réglages › Bibliothèque structure : les réponses mémorisées y figurent
await page.getByRole('button', { name: '← Modèles' }).click();
await page.getByRole('button', { name: 'Réglages' }).click();
await page.getByRole('button', { name: 'Bibliothèque structure' }).click();
await page.getByText('Partagée entre tous les projets').waitFor();
await page.locator('select').first().selectOption('part_type');
await page.waitForTimeout(300);
console.log('Bibliothèque › types de pièces :', await page.locator('table.list tbody tr').count());
await shootAll('structure-bibliotheque');
// réouverture du modèle (page rechargée) : l'étude et la bibliothèque répondent, plus aucune question
await page.goto(URL0);
await page.getByRole('button', { name: 'Ouvrir' }).first().click();
await page.getByRole('button', { name: 'Étude structure' }).click();
await page.getByText('Vue 3D — statut des pièces').waitFor({ timeout: 120000 });
await page.waitForTimeout(1500);
console.log('Après réouverture :', await page.getByText(/type\(s\) à renseigner/).innerText());
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
