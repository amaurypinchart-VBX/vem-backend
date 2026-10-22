// Test navigateur téléphone (émulation Pixel 7 puis iPhone 14 + paysage) : pas de barre de défilement horizontale,
// éditeur de planches en consultation (pincer = zoom, un doigt = déplacer, tape = sélection, appui long = menu),
// « ✏️ Édition », tiroir des propriétés, menu « ⋯ », PDF planche → écran « PDF prêt » → Fichiers du projet VEM, Vue 3D
// et Vues spéciales utilisables. Captures dans e2e/shots/mobile-*.png.
import { chromium, devices } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const shots = join(dirname(fileURLToPath(import.meta.url)), 'shots') + '/';
mkdirSync(shots, { recursive: true });
const PORT = process.env.PORT || 4173;
const URL0 = `http://localhost:${PORT}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const check = (ok, msg) => { if (!ok) throw new Error('ÉCHEC : ' + msg); console.log('✔', msg); };

async function run(deviceName, generate) {
  console.log(`\n── ${deviceName} ──`);
  const ctx = await browser.newContext({ ...devices[deviceName], acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());
  const cdp = await ctx.newCDPSession(page);
  const tag = deviceName.replace(/\s+/g, '-').toLowerCase();
  const noHScroll = async (what) => {
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
    check(r.sw <= r.w + 1, `${what} : pas de défilement horizontal (${r.sw} ≤ ${r.w})`);
  };
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });

  await page.goto(URL0);
  await page.getByRole('button', { name: 'Analyser' }).click();
  await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 300000 });
  await noHScroll('page Modèles / Contrôle');
  await page.screenshot({ path: `${shots}mobile-${tag}-control.png` });

  await page.getByRole('button', { name: 'Vue 3D' }).click();
  await page.waitForTimeout(2000);
  await noHScroll('Vue 3D');
  const canvas = await page.locator('.viewer-canvas canvas').first().boundingBox();
  check(canvas && canvas.width >= devices[deviceName].viewport.width - 40, `Vue 3D en pleine largeur (${Math.round(canvas?.width ?? 0)} px)`);
  await page.screenshot({ path: `${shots}mobile-${tag}-3d.png` });

  await page.getByRole('button', { name: 'Vues 2D' }).click();
  await page.getByRole('button', { name: /Vues spéciales/ }).click();
  await page.waitForTimeout(2000);
  await noHScroll('Vues spéciales');
  await page.screenshot({ path: `${shots}mobile-${tag}-special.png` });

  await page.getByRole('button', { name: 'Planches A1' }).click();
  if (generate) {
    await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
    await noHScroll('assistant de génération');
    await page.getByRole('button', { name: 'Générer', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Ouvrir' }).first().click();
  }
  await page.locator('.sheet-editor').waitFor({ timeout: 900000 });
  await page.waitForTimeout(2500);
  await noHScroll('éditeur de planches');
  check(/Consultation/.test(await page.getByTestId('edit-mode').innerText()), 'éditeur ouvert en consultation');
  await page.screenshot({ path: `${shots}mobile-${tag}-editor.png` });

  // cibles des boutons visibles de la barre ≥ 44 px
  const small = await page.$$eval('.sheet-toolbar > .btn', (bs) => bs.filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect()).filter((r) => r.height < 43.5 || r.width < 43.5).length);
  check(small === 0, 'boutons de la barre ≥ 44 px');

  // pincer = zoom
  const zoomText = () => page.locator('.sheet-zoom').innerText();
  const box = await page.locator('.sheet-canvas').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const z0 = await zoomText();
  await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 6; i++) await touch('touchMove', [[cx - 30 - i * 15, cy], [cx + 30 + i * 15, cy]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  const z1 = await zoomText();
  check(parseInt(z1) > parseInt(z0) * 2, `pincer : zoom ${z0} → ${z1}`);

  // un doigt sur la planche = déplacer (consultation, même sur un élément)
  const tr0 = await page.locator('.sheet-paper').getAttribute('style');
  await touch('touchStart', [[cx, cy]]);
  for (let i = 1; i <= 5; i++) await touch('touchMove', [[cx + i * 20, cy + i * 10]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(200);
  check((await page.locator('.sheet-paper').getAttribute('style')) !== tr0, 'un doigt : la planche se déplace');
  await page.locator('.sheet-toolbar .mobile-only', { hasText: '⤢' }).click();
  await page.waitForTimeout(300);

  // planche avec des vues (la 1re est la couverture) : tape sur sa vignette
  await page.locator('.sheet-thumb').nth(1).tap();
  await page.waitForTimeout(800);
  // tape sur une fenêtre de vue = sélection (rien ne bouge) ; tiroir des propriétés
  const vp = await page.locator('.sheet-canvas [data-item-type="viewport"]').first().boundingBox();
  const vx = vp.x + vp.width / 2;
  const vy = vp.y + vp.height / 2;
  await touch('touchStart', [[vx, vy]]);
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  await page.getByTestId('props-toggle').click();
  await page.locator('.sheet-side.open').waitFor();
  check(/Fenêtre de vue/.test(await page.locator('.sheet-side.open').innerText()), 'tape = sélection, propriétés en tiroir');
  await page.screenshot({ path: `${shots}mobile-${tag}-drawer.png` });
  await page.locator('.sheet-side-close').click();

  // appui long = menu de l'élément
  await touch('touchStart', [[vx, vy]]);
  await page.waitForTimeout(650);
  await touch('touchEnd', []);
  await page.getByTestId('item-menu').waitFor({ timeout: 3000 });
  check(true, 'appui long : menu de l’élément');
  await page.screenshot({ path: `${shots}mobile-${tag}-menu.png` });
  await page.getByRole('button', { name: /Passer en édition/ }).click();
  check(/Édition/.test(await page.getByTestId('edit-mode').innerText()), '« Passer en édition »');
  await page.getByTestId('edit-mode').click();

  // menu « ⋯ » → PDF planche → « PDF prêt » → Fichiers du projet
  await page.getByTestId('toolbar-more').click();
  await page.getByRole('button', { name: '⬇ PDF planche' }).click();
  await page.getByTestId('file-ready').waitFor({ timeout: 300000 });
  check(/PDF prêt/i.test(await page.getByTestId('file-ready').innerText()), 'écran « PDF prêt » avec sa taille');
  await page.screenshot({ path: `${shots}mobile-${tag}-pdf-ready.png` });
  const before = await (await fetch(`http://localhost:${PORT}/__test/project-files`)).json();
  await page.getByTestId('ready-project').click();
  await page.getByText('✓ Enregistré dans les Fichiers du projet').waitFor({ timeout: 30000 });
  const after = await (await fetch(`http://localhost:${PORT}/__test/project-files`)).json();
  check(after.data.length === before.data.length + 1 && /\.pdf$/.test(after.data.at(-1).fileName), `PDF enregistré dans les Fichiers du projet (${after.data.at(-1).fileName})`);
  const dl = page.waitForEvent('download', { timeout: 30000 });
  await page.getByTestId('ready-share').click();
  check(!!(await dl), '« Partager / Enregistrer » sans partage natif = téléchargement');
  await page.locator('.file-ready .btn.ghost').click();

  // paysage
  await page.setViewportSize({ width: devices[deviceName].viewport.height, height: devices[deviceName].viewport.width });
  await page.waitForTimeout(500);
  await noHScroll('paysage');
  await page.screenshot({ path: `${shots}mobile-${tag}-landscape.png` });
  // fermeture par iOS (mémoire) simulée : étape restée notée → bandeau au rechargement
  // (un vrai plantage ne déclenche pas « pagehide » : l'étape est remise au début du nouveau chargement)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('crash-sim')) return;
    sessionStorage.setItem('crash-sim', '1');
    localStorage.setItem('vem_plans_step', JSON.stringify({ label: 'Calcul des vues de la planche A1.2', at: Date.now() }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Analyser' }).click();
  await page.getByTestId('crash-banner').waitFor({ timeout: 300000 });
  check(/Calcul des vues de la planche A1\.2/.test(await page.getByTestId('crash-banner').innerText()), 'fermeture inattendue signalée au rechargement (étape en cours)');
  check(!errors.length, `aucune erreur console${errors.length ? ' : ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await run('Pixel 7', true);
await run('iPhone 14', false);
await browser.close();
console.log('OK');
