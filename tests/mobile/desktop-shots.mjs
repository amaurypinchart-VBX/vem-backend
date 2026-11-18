// Captures « ordinateur » avant / après une modification de mise en page : l'ordinateur ne doit
// pas changer (règle 1 du prompt docs/mobile/PROMPT_Refonte_Mobile_Tablette.md).
//
//   node tests/mobile/desktop-shots.mjs capture avant     # sur le commit de départ
//   … modifications …
//   node tests/mobile/desktop-shots.mjs capture apres
//   node tests/mobile/desktop-shots.mjs compare avant apres
//
// Captures dans tests/mobile/out/desktop-<nom>/ (1440 × 900 et 1920 × 1080, pages, onglets,
// fenêtres ouvertes en lecture seule : la base ne change pas entre deux passages). La comparaison
// est faite pixel par pixel dans le navigateur (pas de dépendance) et liste les écrans différents
// avec le nombre de pixels changés ; les images de différence (en rouge) vont dans
// out/desktop-diff/. Les toasts et animations sont neutralisés.

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { visitScreens } from './screens.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const GLOBAL_PW = process.env.PLAYWRIGHT_DIR || '/opt/node22/lib/node_modules/';
let pw;
try { pw = createRequire(path.join(GLOBAL_PW, 'x.js'))('playwright'); } catch { pw = createRequire(import.meta.url)('playwright'); }
const { chromium } = pw;

const BASE = process.env.BASE || 'http://localhost:3000';
const EMAIL = process.env.VEM_EMAIL || 'amaury.pinchart@vem.com';
const PASSWORD = process.env.VEM_PASSWORD || 'VEM2025!';
const [mode, a, b] = process.argv.slice(2);
const OUT = path.join(here, 'out');
const SIZES = [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }];
const STILL = `*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}
  #toasts{display:none!important}`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});

if (mode === 'capture') {
  if (!a) throw new Error('nom de la série manquant (ex. avant)');
  const dir = path.join(OUT, 'desktop-' + a);
  fs.mkdirSync(dir, { recursive: true });
  // VEM_LOGIN_FILE = réponse de /auth/login déjà obtenue (la connexion est limitée à 10 essais / 15 min)
  const login = process.env.VEM_LOGIN_FILE
    ? (JSON.parse(fs.readFileSync(process.env.VEM_LOGIN_FILE, 'utf8')).data)
    : (await (await fetch(BASE + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: EMAIL, password: PASSWORD }) })).json()).data;
  if (!login?.token) throw new Error('Connexion impossible');
  for (const vp of SIZES) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'fr-BE', timezoneId: 'Europe/Brussels' });
    const page = await ctx.newPage();
    page.on('dialog', d => d.dismiss().catch(() => {}));
    await page.addInitScript(([t, u, css]) => {
      localStorage.setItem('vem_token', t); localStorage.setItem('vem_user', JSON.stringify(u));
      document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
    }, [login.token, login.user, STILL]);
    await visitScreens(page, BASE, async key => {
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(dir, `${vp.width}-${key}.png`), animations: 'disabled' });
    }, { readOnly: true });
    await ctx.close();
  }
  console.log('Captures dans', dir, '—', fs.readdirSync(dir).length, 'images');
} else if (mode === 'compare') {
  const da = path.join(OUT, 'desktop-' + a), db = path.join(OUT, 'desktop-' + b), dd = path.join(OUT, 'desktop-diff');
  fs.mkdirSync(dd, { recursive: true });
  const page = await (await browser.newContext()).newPage();
  const diffs = [];
  for (const f of fs.readdirSync(da).filter(f => f.endsWith('.png')).sort()) {
    if (!fs.existsSync(path.join(db, f))) { diffs.push(`${f} : absente de « ${b} »`); continue; }
    const res = await page.evaluate(async ([x, y]) => {
      const load = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
      const [i1, i2] = await Promise.all([load(x), load(y)]);
      if (i1.width !== i2.width || i1.height !== i2.height) return { size: true };
      const c = document.createElement('canvas'); c.width = i1.width; c.height = i1.height;
      const g = c.getContext('2d');
      g.drawImage(i1, 0, 0); const d1 = g.getImageData(0, 0, c.width, c.height).data;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(i2, 0, 0); const img2 = g.getImageData(0, 0, c.width, c.height); const d2 = img2.data;
      let n = 0;
      for (let k = 0; k < d1.length; k += 4) {
        if (Math.abs(d1[k] - d2[k]) + Math.abs(d1[k + 1] - d2[k + 1]) + Math.abs(d1[k + 2] - d2[k + 2]) > 24) {
          n++; d2[k] = 255; d2[k + 1] = 0; d2[k + 2] = 0; d2[k + 3] = 255;
        }
      }
      if (!n) return { n };
      g.putImageData(img2, 0, 0);
      return { n, png: c.toDataURL('image/png') };
    }, ['data:image/png;base64,' + fs.readFileSync(path.join(da, f)).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(path.join(db, f)).toString('base64')]);
    if (res.size) diffs.push(`${f} : tailles différentes`);
    else if (res.n) {
      diffs.push(`${f} : ${res.n} pixels différents`);
      fs.writeFileSync(path.join(dd, f), Buffer.from(res.png.split(',')[1], 'base64'));
    }
  }
  console.log(diffs.length ? diffs.join('\n') : 'Ordinateur identique : aucune différence.');
} else {
  console.log('Usage : desktop-shots.mjs capture <nom> | compare <avant> <apres>');
}
await browser.close();
