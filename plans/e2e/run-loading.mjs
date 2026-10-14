// Test navigateur de la loading liste (L1 : Réglages › Règles de loading) : règles de la base de départ en français,
// contradictions à trancher, ajout d'une référence manquante au catalogue (4-700-001, absente d'Odoo). Captures dans e2e/shots/loading-*.png.
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
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
const check = (cond, label) => { console.log(`${cond ? '✓' : '✗'} ${label}`); if (!cond) process.exitCode = 1; };

await page.goto(URL0);
await page.getByRole('button', { name: 'Réglages' }).click();
await page.getByRole('button', { name: 'Règles de loading' }).click();
await page.getByText(/règles actives · version/).waitFor();
await page.screenshot({ path: `${shots}loading-regles.png` });
check(await page.getByText('8 par box · si box seule (standalone) · + 20 % arrondi au-dessus').isVisible(), 'joint vertical 4-700-065 en français');
await page.getByText('4-700-065', { exact: true }).first().click();
await page.getByText('Points de calage').waitFor();
check(await page.getByText(/jamais modifiée dans l’app/).isVisible(), 'historique vide (base de départ)');
check(await page.locator('option', { hasText: 'Contradictions à trancher (0)' }).count() === 1, 'plus aucune contradiction à trancher');
await page.locator('select').first().selectOption('conflict');
await page.waitForTimeout(200);
await page.screenshot({ path: `${shots}loading-contradictions.png` });

await page.getByRole('button', { name: /^Catalogue/ }).click();
await page.getByText(/Références à ajouter au catalogue/).waitFor();
await page.getByRole('button', { name: '＋ 4-700-001' }).click();
const designation = await page.locator('label', { hasText: 'Désignation' }).locator('input').inputValue();
check(/PAINT/i.test(designation), `désignation pré-remplie depuis la règle (« ${designation} »)`);
await page.locator('label', { hasText: 'Catégorie' }).locator('select').selectOption('consommables');
await page.getByRole('button', { name: 'Ajouter au catalogue' }).click();
await page.getByText('✓ 4-700-001 ajoutée au catalogue').waitFor();
check(!(await page.getByRole('button', { name: '＋ 4-700-001' }).count()), '4-700-001 n’est plus à ajouter');
await page.getByPlaceholder('Rechercher une référence…').fill('4-700-001');
check(await page.getByText('ajoutée dans l’app').isVisible(), '4-700-001 dans le catalogue, « ajoutée dans l’app »');
await page.screenshot({ path: `${shots}loading-catalogue.png` });

await page.getByRole('button', { name: 'Décisions et observations' }).click();
check(await page.getByText(/quantité de l’étude × 2/).isVisible(), 'décision sous-bois = étude structure × 2');
await page.screenshot({ path: `${shots}loading-decisions.png`, fullPage: true });

// ─── onglet « Loading liste » d'un modèle (L2) ───
await page.getByRole('button', { name: 'Modèles' }).click();
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Loading liste' }).click();
await page.getByTestId('topology-summary').waitFor({ timeout: 120000 });
const summary = (await page.getByTestId('topology-summary').innerText()).trim();
console.log('  topologie :', summary);
check(/Viewbox/.test(summary) && /pied/.test(summary), 'phrase de topologie');
check(await page.getByTestId('topology-plan').locator('polygon').count() > 0, 'schéma de dessus avec les box');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${shots}loading-topologie.png` });
// correction à la main d'une valeur
const feetRow = page.locator('tr', { hasText: 'Pieds au sol' });
await feetRow.locator('b').click();
await feetRow.locator('input').fill('99');
await feetRow.locator('input').press('Enter');
check(await feetRow.getByText('saisi à la main').isVisible(), 'pieds corrigés à la main');
await page.getByText('✓ Enregistrée').waitFor({ timeout: 10000 });
await feetRow.getByTitle('Revenir à la valeur détectée').click();
check(!(await feetRow.getByText('saisi à la main').count()), 'retour à la valeur détectée');
// clic sur une ligne → surbrillance
await page.locator('tr', { hasText: 'Côtés de box extérieurs' }).locator('td').first().click();
check(await page.getByText(/Côtés de box extérieurs : \d+ côté/).isVisible(), 'ligne choisie montrée dans la 3D');
await page.screenshot({ path: `${shots}loading-topologie-selection.png` });
await page.getByRole('button', { name: /2\. Produits/ }).click();
await page.getByText('Produits comptés dans la 3D').waitFor();
const products = await page.locator('table.list').last().locator('tbody tr').count();
check(products > 0, `produits comptés (${products} références)`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${shots}loading-produits.png` });
await page.getByRole('button', { name: /4\. Loading liste/ }).click();
await page.getByTestId('loading-lines').first().waitFor();
const lines = await page.getByTestId('loading-lines').locator('tbody tr').count();
check(lines > 10, `loading liste générée (${lines} lignes)`);
check(await page.getByText('Détail du calcul').first().isVisible(), 'colonne « Détail du calcul »');
check(await page.getByText(/Faire l’Étude structure/).first().isVisible(), 'sous-bois : question « Faire l’Étude structure »');
await page.waitForTimeout(500);
await page.screenshot({ path: `${shots}loading-liste.png`, fullPage: true });

// ─── L4 : questions chantier, correction, Excel, fichiers du projet, validation ───
await page.getByRole('button', { name: /3\. Questions chantier/ }).click();
await page.getByTestId('site-questions').waitFor();
await page.getByLabel('Airco à prévoir').fill('1');
const answerRow = (label, button) => page.locator('div', { has: page.getByText(label, { exact: true }) }).filter({ has: page.getByRole('button', { name: button }) }).last().getByRole('button', { name: button });
await answerRow('Charge lourde', 'Non').click();
await answerRow('Plancher laminé', 'Non').click();
await answerRow('Travail en hauteur / sur le toit', 'Non').click();
await answerRow('Taille du job', 'Petit').click();
await answerRow('Montage', 'Sur chantier').click();
await answerRow('RAL des murs', 'Blanc / blanc').click();
check(await page.getByText('Tout est répondu.').isVisible(), 'toutes les questions chantier répondues');
check((await page.locator('input[type=date]').inputValue()) === '2026-10-01', 'date d’expédition reprise du camion');
check((await page.locator('input[type=text]').first().inputValue()) === '6066RNVIDVIE', 'n° d’order repris du projet');
await page.screenshot({ path: `${shots}loading-questions.png`, fullPage: true });
await page.getByRole('button', { name: /4\. Loading liste/ }).click();
check(await page.getByText('4-700-083').first().isVisible(), 'airco : mur à trou dans la liste');
const ceiling = page.locator('tr', { hasText: '4-700-003' }).first();
await ceiling.locator('b[title="Cliquer pour corriger"]').click();
await ceiling.locator('input').fill('9');
await ceiling.locator('input').press('Enter');
await page.getByTestId('why-dialog').waitFor();
await page.getByRole('button', { name: /Seulement ce chantier/ }).click();
check(await page.locator('tr', { hasText: '4-700-003' }).first().getByText('corrigé pour ce chantier').first().isVisible(), 'quantité corrigée pour ce chantier');
await page.getByRole('button', { name: '＋ Ajouter une ligne' }).click();
await page.getByPlaceholder('Référence ou nom…').fill('4-750-007');
await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
await page.getByTestId('why-dialog').waitFor();
await page.getByRole('button', { name: /Seulement ce chantier/ }).click();
check(await page.getByText('4-750-007').first().isVisible(), 'ligne ajoutée (perceuse magnétique)');
// ─── L5 : « c'est la règle, pour tous les projets » ───
const shuko = page.locator('tr', { hasText: '4-730-008' }).first();
await shuko.locator('b[title="Cliquer pour corriger"]').click();
await shuko.locator('input').fill('12');
await shuko.locator('input').press('Enter');
await page.getByTestId('why-dialog').waitFor();
await page.getByRole('button', { name: /C’est la règle, pour tous les projets/ }).click();
await page.getByTestId('rule-validation').waitFor();
check(await page.getByText('3 / box', { exact: false }).first().isVisible(), 'inferBase propose « 3 / box »');
check((await page.getByTestId('rule-sentence').innerText()).startsWith('3 par box'), `règle en français (« ${(await page.getByTestId('rule-sentence').innerText()).trim()} »)`);
check(await page.getByTestId('rule-conflicts').isVisible(), 'contradiction avec la règle « 2 par box » du classeur');
await page.getByTestId('rule-impact').getByText(/Aurait changé|Ne change/).waitFor({ timeout: 30000 });
console.log('  impact :', (await page.getByTestId('rule-impact').innerText()).split('\n')[1]?.trim());
check(await page.getByTestId('rule-impact').getByText('Klokgebouw Eindhoven', { exact: false }).first().isVisible(), 'impact rejoué sur les bancs (Klokgebouw)');
await page.screenshot({ path: `${shots}loading-validation.png` });
await page.getByRole('button', { name: '✔ Valider la règle' }).click();
await page.getByText('Règle validée').waitFor();
const shuko2 = page.locator('tr', { hasText: '4-730-008' }).first();
check((await shuko2.locator('b').nth(1).innerText()).trim() === '12', 'la ligne vient maintenant de la nouvelle règle (12)');
check(!(await shuko2.getByText('corrigé pour ce chantier').count()), 'plus une correction : une règle');
// ─── « je ne sais pas encore » ───
const spots = page.locator('tr', { hasText: '4-730-012' }).first();
await spots.locator('b[title="Cliquer pour corriger"]').click();
await spots.locator('input').fill('30');
await spots.locator('input').press('Enter');
await page.getByRole('button', { name: /Je ne sais pas encore/ }).click();
await page.getByText('❓ question en attente').first().waitFor();
check(true, 'question en attente sur la ligne (je ne sais pas encore)');
await page.getByText('✓ Enregistrée').waitFor({ timeout: 10000 });
await page.getByRole('button', { name: /5\. Export/ }).click();
const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '⬇ Télécharger l’Excel' }).click()]);
check(download.suggestedFilename() === '6066RNVIDVIE_loading_v1.xlsx', `Excel téléchargé (${download.suggestedFilename()})`);
await download.saveAs(`${shots}${download.suggestedFilename()}`);
await page.getByRole('button', { name: '💾 Enregistrer dans les fichiers du projet' }).click();
await page.getByText('enregistré dans les fichiers du projet').waitFor();
check(await page.getByText('6066RNVIDVIE_loading_v2.xlsx').isVisible(), 'révision suivante après enregistrement (v2)');
page.once('dialog', (d) => d.accept());
await page.getByRole('button', { name: '✔ Liste validée / envoyée à l’entrepôt' }).click();
await page.getByText('✔ Liste validée / envoyée à l’entrepôt').first().waitFor();
await page.getByRole('button', { name: /4\. Loading liste/ }).click();
check(await page.getByText('liste validée (figée)').isVisible(), 'liste figée après validation');
await page.screenshot({ path: `${shots}loading-export.png` });
// Réglages : la règle apprise, l'ancienne remplacée, la question en attente
await page.getByRole('button', { name: 'Réglages' }).click();
await page.getByRole('button', { name: 'Règles de loading' }).click();
await page.getByRole('button', { name: /^Règles \(/ }).click();
await page.getByPlaceholder('Réf., désignation, chantier…').fill('4-730-008');
await page.locator('td:visible', { hasText: '3 par box' }).first().waitFor({ timeout: 10000 }).catch(() => {});
await page.locator('.badge:visible', { hasText: 'question en attente' }).first().waitFor({ timeout: 5000 }).catch(() => {});
await page.screenshot({ path: `${shots}loading-reglages-l5-liste.png`, fullPage: true });
check(await page.locator('td:visible', { hasText: '3 par box' }).first().isVisible(), 'Réglages : nouvelle règle « 3 par box » active');
check(await page.locator('.badge:visible', { hasText: 'question en attente' }).first().isVisible(), 'Réglages : question en attente listée');
await page.locator('b:visible', { hasText: /^4-730-008$/ }).first().click();
await page.getByText('✎ Modifier la règle').waitFor();
await page.screenshot({ path: `${shots}loading-reglages-l5.png`, fullPage: true });
const [classeur] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '⬇ Classeur Excel' }).click()]);
check(/^VIEWBOX_regles_loading_.*\.xlsx$/.test(classeur.suggestedFilename()), `classeur exporté (${classeur.suggestedFilename()})`);

check(errors.length === 0, `aucune erreur console${errors.length ? ' : ' + errors.join(' | ') : ''}`);
await browser.close();
