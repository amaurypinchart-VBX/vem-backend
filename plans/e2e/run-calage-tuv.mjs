// Test navigateur du calage TÜV (calage rapide, sans modèle) : plaques dessinées sur le plan, pose à fleur / centrée,
// conformité au Prüfbuch, fiche et plan des appuis au sol en anglais. Captures et PDF dans e2e/shots/.
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await page.goto(URL0);
await page.getByRole('button', { name: /Calage rapide/ }).click();
await page.getByText(/^Plan des appuis — /).waitFor();
await page.getByText('Viewbox en longueur').locator('select').selectOption('2');
await page.getByText('Viewbox en largeur').locator('select').selectOption('2');
await page.waitForTimeout(4000);
const plan = page.locator('.card', { hasText: 'Plan des appuis —' }).first();
console.log('Tuiles :', (await page.locator('.stats').first().innerText()).replace(/\s+/g, ' '));
console.log('Plaques dessinées :', await plan.locator('svg polygon[fill-opacity="0.22"]').count());
const pose = plan.locator('select').filter({ hasText: 'Toujours à fleur' });
for (const v of ['auto', 'flush', 'centered']) {
  await pose.selectOption(v);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${shots}calage-tuv-${v}.png` });
  console.log(`Pose ${v} :`, (await page.locator('.stats').first().innerText()).split('\n').slice(-2).join(' ').replace(/\s+/g, ' '), '| centrées (▲) :', await plan.locator('svg text', { hasText: '▲' }).count());
}
await pose.selectOption('auto');
await page.waitForTimeout(4000);
console.log('Prüfbuch :', await plan.locator('.badge').first().innerText().catch(() => '—'));
await plan.scrollIntoViewIfNeeded();
await page.screenshot({ path: `${shots}calage-tuv-plan.png` });
// un appui : sa plaque
await plan.locator('svg g[style*="cursor"]').first().click();
await page.waitForTimeout(300);
console.log('Appui :', (await page.locator('.support-panel .card-head h2').innerText()), '|', (await page.locator('.support-panel .card-body .hint').first().innerText()).replace(/\s+/g, ' '));
await plan.locator('select').filter({ hasText: 'English' }).selectOption('en');
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Fiche PDF' }).click()]);
await dl.saveAs(shots + 'tuv-fiche-en.pdf');
console.log('Fiche :', dl.suggestedFilename());
const [dlp] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: '⬇ Plan des appuis au sol (PDF)' }).click()]);
await dlp.saveAs(shots + 'tuv-points-en.pdf');
console.log('Plan des appuis :', dlp.suggestedFilename());
console.log('Erreurs console :', errors.length ? errors : 'aucune');
await browser.close();
