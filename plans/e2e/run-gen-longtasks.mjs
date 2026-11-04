// Mesure des blocages du fil principal (> 200 ms) pendant la génération d'un jeu de plans, par étape de la barre de
// progression (« Calcul des vues 2D », « Images 3D »…). BIG=1 : mode « très gros modèle ». Serveur de test à redémarrer avant.
import { chromium } from 'playwright-core';
const URL0 = `http://localhost:${process.env.PORT || 4173}/plans/?projectId=p1&token=tok`;
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
if (process.env.BIG) await page.addInitScript(() => localStorage.setItem('vem_plans_bigmodel', '1'));
await page.addInitScript(() => {
  window.__long = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries())
      if (e.duration > 200)
        window.__long.push({ ms: Math.round(e.duration), step: (document.querySelector('.progress-row > div')?.textContent ?? document.querySelector('.save-status')?.textContent ?? '').replace(/\(\d+\/\d+\)/, '(n)') });
  }).observe({ type: 'longtask', buffered: true });
});
await page.goto(URL0);
await page.getByRole('button', { name: 'Analyser' }).click();
await page.getByText('paquet 3D enregistrés').waitFor({ timeout: 600000 });
await page.evaluate(() => window.__long.splice(0));
await page.getByRole('button', { name: 'Planches A1' }).click();
await page.getByRole('button', { name: /Générer un jeu de plans/ }).click();
const t0 = Date.now();
// PROFILE=1 : profil CPU du fil principal pendant la génération, fonctions les plus coûteuses (temps propre)
const cdp = process.env.PROFILE ? await page.context().newCDPSession(page) : null;
if (cdp) {
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 1000 });
  await cdp.send('Profiler.start');
}
await page.getByRole('button', { name: 'Générer', exact: true }).click();
await page.locator('.sheet-editor').waitFor({ timeout: 1500000 });
if (cdp) {
  const { profile } = await cdp.send('Profiler.stop');
  const self = new Map();
  const dt = new Map();
  for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
  for (const n of profile.nodes) {
    const f = n.callFrame;
    const k = `${f.functionName || '(anonyme)'} ${f.url.split('/').pop()}:${f.lineNumber}`;
    self.set(k, (self.get(k) ?? 0) + (dt.get(n.id) ?? 0));
  }
  console.log('fonctions les plus coûteuses (ms) :');
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${Math.round(v / 1000)}  ${k}`);
}
console.log(`génération : ${Math.round((Date.now() - t0) / 1000)} s`);
await page.waitForTimeout(5000);
const long = await page.evaluate(() => window.__long.splice(0));
const by = {};
for (const l of long) {
  by[l.step] = by[l.step] ?? { n: 0, total: 0, max: 0 };
  by[l.step].n++;
  by[l.step].total += l.ms;
  by[l.step].max = Math.max(by[l.step].max, l.ms);
}
for (const [k, v] of Object.entries(by)) console.log(`  ${k || '(sans étape)'} : ${v.n} blocages, ${(v.total / 1000).toFixed(1)} s au total, le plus long ${(v.max / 1000).toFixed(1)} s`);
await browser.close();
