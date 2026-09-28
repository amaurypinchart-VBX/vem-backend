// Test navigateur du cartouche : pré-rempli depuis le projet VEM à la génération, puis projet modifié dans VEM →
// bandeau à l'ouverture du jeu → mise à jour (annulable) ; champ modifié à la main non proposé ; « ↻ Reprendre ».
import { chromium } from 'playwright-core';

const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? process.env.HOME + '/.cache/ms-playwright/chromium-1134/chrome-linux/chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1700, height: 1050 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('dialog', (d) => d.accept());
const check = (label, ok) => console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${label}`);
const onSheet = (t) => page.locator('.sheet-paper svg text', { hasText: t }).count().then((n) => n > 0);
const reopen = async () => {
  await page.getByText('✓ Enregistré').waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: '← Jeux de plans' }).click();
  await page.getByRole('button', { name: 'Ouvrir' }).first().click();
  await page.locator('.sheet-editor').waitFor();
  await page.locator('.sheet-thumb').nth(1).click();
  await page.waitForTimeout(1500);
};

await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
await page.locator('.sheet-thumb').nth(1).click();
await page.waitForTimeout(1200);
check('cartouche pré-rempli (sales, technical, adresse)', (await onSheet('Norick Palm')) && (await onSheet('Amaury Pinchart')) && (await onSheet('Messedamm 22, Berlin')));
check('pas de bandeau juste après la génération', (await page.locator('.sync-banner').count()) === 0);

// modification dans VEM : nouvelle ville, autre sales engineer, un project manager
await page.evaluate(() =>
  fetch('/api/v1/projects/p1', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      city: 'Hamburg',
      team: [
        { role: 'sales_engineer', user: { id: 'u5', firstName: 'Julie', lastName: 'Martin', email: 'julie@x.com' } },
        { role: 'installer', user: { id: 'u6', firstName: 'Marc', lastName: 'Lenoir', email: 'marc@x.com', role: 'project_manager' } },
      ],
    }),
  }),
);
await page.locator('.sheet-props .tab', { hasText: 'Cartouche' }).click();
await page.locator('.sheet-props input[type=text]').first().fill('Client modifié à la main');
await page.waitForTimeout(300);
await reopen();
const banner = page.locator('.sync-banner');
check('bandeau à l’ouverture', (await banner.count()) === 1);
const text = (await banner.innerText()).replace(/\s+/g, ' ');
console.log('   ', text.slice(0, 220));
check('propose adresse, sales et project manager, pas le client tapé à la main', /Adresse/.test(text) && /Sales engineer/.test(text) && /Project manager/.test(text) && !/Client/.test(text));
await page.getByRole('button', { name: 'Mettre à jour le cartouche' }).click();
await page.waitForTimeout(500);
check('cartouche mis à jour', (await onSheet('Julie Martin')) && (await onSheet('Marc Lenoir')) && (await onSheet('Messedamm 22, Hamburg')) && (await onSheet('Client modifié à la main')));
await page.keyboard.press('Control+z');
await page.waitForTimeout(400);
check('Ctrl+Z : ancien cartouche', await onSheet('Norick Palm'));
await page.keyboard.press('Control+y');
await page.waitForTimeout(400);
await reopen();
check('plus de bandeau une fois à jour', (await banner.count()) === 0);
// bouton « Reprendre » : reprend aussi le client tapé à la main
await page.locator('.sheet-props .tab', { hasText: 'Cartouche' }).click();
await page.getByRole('button', { name: /Reprendre les données du projet/ }).click();
await page.waitForTimeout(600);
const msg = await page.locator('.sheet-props .hint').first().innerText();
console.log('   ', msg);
check('↻ Reprendre : client du projet remis', (await onSheet('Image Construction')) && /Client/.test(msg));
await page.locator('.sheet-editor').screenshot({ path: new URL('./shots/cartouche.png', import.meta.url).pathname });
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
