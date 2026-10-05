// Test navigateur du conseil ingénieur : modèle analysé → Étude structure (reconnaissance répondue) → onglet
// « Conseil ingénieur » : calcul lancé, pistes du diagnostic, piste simulée (variante), discussion avec l'IA simulée
// (outils exécutés par le navigateur : lecture, diagnostic, variante, sol à 400 kg/m²), application confirmée,
// modifications reprises dans l'étape Calcul. Captures dans e2e/shots/advisor-*.png.
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
async function shootAll(name) {
  const h = await page.evaluate(() => document.querySelector('main').scrollHeight);
  for (let k = 0, y = 0; y < h && k < 4; k++, y += 900) {
    await page.evaluate((top) => (document.querySelector('main').scrollTop = top), y);
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${shots}${name}-${k + 1}.png` });
  }
  await page.evaluate(() => (document.querySelector('main').scrollTop = 0));
}

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
// conseil ingénieur : sans calcul, bouton « Lancer le calcul » ; puis pistes du diagnostic
await page.getByRole('button', { name: /Conseil ingénieur/ }).click();
await page.getByText('Pistes du diagnostic').waitFor();
await page.getByRole('button', { name: 'Lancer le calcul' }).click();
await page.getByText(/NE PASSE PAS|LIMITE|INCOMPLET|Rien à signaler/).first().waitFor({ timeout: 600000 });
console.log('Problèmes :', (await page.locator('b', { hasText: /η|μ requis|Basculement|Glissement|instable/ }).allInnerTexts()).slice(0, 6));
await shootAll('advisor-pistes');
// une piste simulée à la main (sans IA)
const sim = page.getByRole('button', { name: 'Simuler' }).first();
if (await sim.count()) {
  await sim.click();
  await page.getByText(/^V1$/).waitFor({ timeout: 600000 });
  console.log('Variante simulée :', (await page.locator('div', { has: page.getByText(/^V1$/) }).last().innerText()).replace(/\s+/g, ' ').slice(0, 200));
}
await shootAll('advisor-variante');
// discussion : question suggérée → outils (lecture, diagnostic, simulation) → réponse
await page.getByRole('button', { name: /Pourquoi ça ne passe pas/ }).click();
await page.getByText(/La variante \*\*V|La variante V\d/).first().waitFor({ timeout: 600000 });
console.log('Réponse IA :', (await page.getByText(/La variante V\d/).first().innerText()).slice(0, 200));
console.log('Outils :', await page.locator('.hint', { hasText: '🔧' }).allInnerTexts());
await shootAll('advisor-discussion');
// sol : 400 kg/m² → etudier_sol
await page.getByPlaceholder(/Entrée pour envoyer/).fill('Le sol n’accepte que 400 kg/m² : que mettre sous les appuis ?');
await page.getByRole('button', { name: 'Envoyer' }).click();
await page.getByText(/kg\/m² sur le sol/).waitFor({ timeout: 300000 });
console.log('Sol :', (await page.getByText(/kg\/m² sur le sol/).innerText()).replace(/\s+/g, ' '));
// application demandée → confirmation → appliquée
await page.getByPlaceholder(/Entrée pour envoyer/).fill('ok, applique la variante');
await page.getByRole('button', { name: 'Envoyer' }).click();
await page.getByRole('button', { name: '✓ Appliquer' }).waitFor({ timeout: 60000 });
await shootAll('advisor-confirmation');
await page.getByRole('button', { name: '✓ Appliquer' }).click();
await page.getByText(/C’est appliqué/).waitFor({ timeout: 60000 });
await page.waitForTimeout(2600);
console.log('Modifications :', (await page.locator('.card', { hasText: 'Modifications de l’étude' }).last().innerText()).replace(/\s+/g, ' ').slice(0, 300));
await shootAll('advisor-appliquee');
await page.getByRole('button', { name: /3\. Calcul/ }).click();
await page.getByText('Calcul complet').first().waitFor();
console.log('Étape Calcul :', (await page.getByText(/Modifications de l’étude \(hors modèle SketchUp\)/).count()) ? 'modifications listées' : 'MODIFICATIONS ABSENTES');
await shootAll('advisor-calcul');
await page.getByRole('button', { name: '← Modèles' }).click();
await page.getByText('Modèles 3D du projet').waitFor();
if (errors.length) throw new Error(`Erreurs navigateur : ${errors.join(' | ')}`);
console.log('Retour à Modèles sans erreur navigateur.');
await browser.close();
