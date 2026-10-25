// Génère, à partir des modules m00…m16 :
//   ../formation-vem.html          deck autonome (1920×1080, navigation, sommaire, impression)
//   ../02_SCRIPT_SLIDES.md         script slide par slide (contenu, visuel, notes)
//   ../05_CAPTURES_A_FAIRE.md      captures d'écran à réaliser
//   ./qa-auto.json                 vérifications automatiques (libellés, termes interdits, tutoiement)
// et, à partir des traductions de en/m00…m16 (libellés de l'app gardés en français) :
//   ../formation-vem-en.html + src/assets/formation-en.html   deck anglais
//   ./qa-auto-en.json                                          mêmes vérifications (sans tutoiement)
// Usage : node docs/formation/_source/build.mjs   (depuis la racine du dépôt ou ailleurs)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LABELS, CAPTURES, setSlide, setLang, esc } from './ui.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, '..');
const REPO = path.resolve(OUT, '../..');


const TXT = {
  fr: { chapter: 'Chapitre', sectionVisual: 'Slide de séparation du chapitre.', sectionNotes: (m) => `Chapitre ${m.num} — public : ${m.public}. Durée : ${m.duree}.`,
    foot: 'VEM · Formation', title: 'Formation VEM', toc: 'Sommaire', prev: 'Précédente', next: 'Suivante', notes: "Notes de l'animateur",
    help: '← → espace : naviguer · S : sommaire · N : notes · Ctrl+P : imprimer (une slide par page)', rotate: "📱 Tournez le téléphone à l'horizontale pour lire les slides · glissez pour avancer" },
  en: { chapter: 'Chapter', sectionVisual: 'Chapter divider slide.', sectionNotes: (m) => `Chapter ${m.num} — audience: ${m.public}. Duration: ${m.duree}.`,
    foot: 'VEM · Training', title: 'VEM Training', toc: 'Contents', prev: 'Previous', next: 'Next', notes: "Presenter's notes",
    help: '← → space: navigate · S: contents · N: notes · Ctrl+P: print (one slide per page)', rotate: '📱 Turn your phone sideways to read the slides · swipe to move on' },
};

for (const LANG of ['fr', 'en']) {
setLang(LANG);
const t = TXT[LANG];
const SRC = LANG === 'fr' ? HERE : path.join(HERE, 'en');
const files = fs.readdirSync(SRC).filter((f) => /^m\d\d-.*\.mjs$/.test(f)).sort();
const modules = [];
for (const f of files) modules.push((await import(path.join(SRC, f))).default);

// ── Construction de la liste des slides ──────────────────────────────────────
const slides = [];
for (const m of modules) {
  if (m.num > 0) slides.push({ kind: 'section', module: m, title: m.title, anchor: m.key, visual: t.sectionVisual, notes: t.sectionNotes(m), body: null });
  for (const s of m.slides) slides.push({ ...s, module: m, anchor: s.key || (m.num === 0 && s === m.slides[0] ? m.key : null) });
}
slides.forEach((s, i) => { s.n = i + 1; s.id = s.anchor || `s${s.n}`; });

function renderSection(m) {
  return `<div class="sec-num">${m.num}</div><div class="sec-icon">${m.icon}</div><h1>${esc(m.title)}</h1>
    <div class="sec-meta"><span>👥 ${esc(m.public)}</span><span>⏱ ${esc(m.duree)}</span><span>🧭 ${esc(m.parcours)}</span></div>`;
}
for (const s of slides) {
  setSlide(`S${s.n}`);
  s.html = s.kind === 'section' ? renderSection(s.module) : s.body();
}

// ── HTML ─────────────────────────────────────────────────────────────────────
const css = fs.readFileSync(path.join(HERE, 'deck.css'), 'utf8');
const js = fs.readFileSync(path.join(HERE, 'deck.js'), 'utf8');

const toc = modules.map((m) => {
  const first = slides.find((s) => s.module === m);
  return `<a href="#${first.id}" data-go="${first.n}"><span class="tn">${m.num}</span><span class="ti">${m.icon}</span><span class="tt">${esc(m.title)}</span><span class="tp">${esc(m.parcours)}</span></a>`;
}).join('');

const slideHtml = slides.map((s) => {
  const m = s.module;
  const cls = ['slide', `k-${s.kind || 'std'}`].join(' ');
  const head = (s.kind === 'section' || s.kind === 'cover') ? '' :
    `<div class="s-head"><div class="s-kicker">${m.num > 0 ? `${t.chapter} ${m.num} · ` : ''}${esc(m.title)}</div><h2>${esc(s.title)}</h2></div>`;
  const foot = `<div class="s-foot"><span>${t.foot}</span><span>${s.n}</span></div>`;
  const notes = s.notes ? `<aside class="notes">${esc(s.notes)}</aside>` : '';
  const inner = s.kind === 'cover' ? `<h1>${esc(s.title)}</h1>${s.html}` : s.html;
  return `<section class="${cls}" id="${s.id}" data-n="${s.n}" data-module="${esc(m.title)}">${head}<div class="s-body">${inner}</div>${foot}${notes}</section>`;
}).join('\n');

const html = `<!doctype html>
<html lang="${LANG}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${t.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style></head>
<body>
<div class="progress"><div id="prog"></div></div>
<button class="ctl toc-btn" id="tocBtn" title="${t.toc} (S)">☰ ${t.toc}</button>
<div class="ctl nav-ctl"><button id="prev" title="${t.prev} (←)">‹</button><span id="count">1 / ${slides.length}</span><button id="next" title="${t.next} (→)">›</button><button id="notesBtn" title="${t.notes} (N)">N</button></div>
<nav class="toc" id="toc"><div class="toc-in"><div class="toc-h">${t.toc}<button id="tocClose">×</button></div>${toc}<div class="toc-help">${t.help}</div></div></nav>
<div class="notes-panel" id="notesPanel"></div>
<div class="rotate-hint">${t.rotate}</div>
<main class="stage" id="stage"><div class="deck" id="deck">
${slideHtml}
</div></main>
<script>${js}</script>
</body></html>`;
const SUFFIX = LANG === 'fr' ? '' : '-' + LANG;
fs.writeFileSync(path.join(OUT, `formation-vem${SUFFIX}.html`), html);
// Copie servie par l'app aux personnes connectées (GET /api/v1/formation, menu « 🎓 Formation VEM »).
// Surtout pas dans public/ : express.static la rendrait accessible sans mot de passe.
fs.mkdirSync(path.join(REPO, 'src', 'assets'), { recursive: true });
fs.writeFileSync(path.join(REPO, 'src', 'assets', `formation${SUFFIX}.html`), html);

// ── Script des slides (Markdown) ─────────────────────────────────────────────
function toText(h) {
  return String(h)
    .replace(/<tr>/g, '\n| ').replace(/<\/t[dh]>/g, ' | ').replace(/<li>/g, '\n- ')
    .replace(/<(br|\/div|\/p|\/h3|\/ol|\/ul)[^>]*>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}
let md = `# 02 — Script des slides (formation VEM)\n\n> Généré par \`_source/build.mjs\` à partir de la même source que \`formation-vem.html\` : ne pas modifier ce fichier à la main.\n> ${slides.length} slides · ${modules.length} chapitres · vouvoiement · projet fil rouge fictif.\n\n`;
for (const m of modules) {
  const ms = slides.filter((s) => s.module === m);
  md += `\n## ${m.num}. ${m.icon} ${m.title}\n\n- Ancre : \`#${ms[0].id}\` · Public : ${m.public} · Durée : ${m.duree} · Parcours : ${m.parcours} · ${ms.length} slides\n`;
  for (const s of ms) {
    md += `\n### S${s.n} — ${s.title}\n\n- **Id** : \`${s.id}\` · **Type** : ${s.kind || 'contenu'}\n- **Visuel prévu** : ${s.visual || '—'}\n\n**Contenu**\n\n${toText(s.kind === 'cover' ? s.title + '\n' + s.html : s.html).split('\n').map((l) => (l.startsWith('- ') || l.startsWith('| ') ? l : l)).join('\n')}\n\n**Notes orateur** : ${s.notes || '—'}\n`;
  }
}
if (LANG === 'fr') fs.writeFileSync(path.join(OUT, '02_SCRIPT_SLIDES.md'), md);

// ── Captures à faire ─────────────────────────────────────────────────────────
let cap = `# 05 — Captures d'écran à réaliser\n\n> Les écrans simples sont recréés en HTML dans le deck. Les captures ci-dessous concernent des écrans riches où une vraie image aide à reconnaître l'interface.\n> Données à afficher : projet fil rouge fictif « Hospitality Paddock — Démo » (\`9999DEMOVIE\`, client Demo Events SA). Ne jamais capturer un vrai client, un vrai nom ou une donnée d'identité.\n> Format : PNG, 1600 px de large minimum (ordinateur) ou capture native du téléphone ; remplacer l'encadré gris correspondant dans le deck.\n\n| N° | Slide | Écran | État à montrer | Données fil rouge |\n|---|---|---|---|---|\n`;
for (const c of CAPTURES) {
  const s = slides.find((x) => `S${x.n}` === c.slide);
  cap += `| ${c.id} | ${c.slide} — ${s ? s.title : ''} | ${c.screen} | ${c.state} | ${c.data} |\n`;
}
if (LANG === 'fr') fs.writeFileSync(path.join(OUT, '05_CAPTURES_A_FAIRE.md'), cap);

// ── Vérifications automatiques ───────────────────────────────────────────────
const srcFiles = [
  'public/index.html', 'public/sign-handover.html', 'public/planning-public.html', 'public/viewer3d.html', 'public/vem-3d-integration.js',
  ...fs.readdirSync(path.join(REPO, 'public/js')).filter((f) => f.endsWith('.js')).map((f) => `public/js/${f}`),
  ...fs.readdirSync(path.join(REPO, 'src/routes')).filter((f) => f.endsWith('.ts')).map((f) => `src/routes/${f}`),
  ...fs.readdirSync(path.join(REPO, 'src/services')).filter((f) => f.endsWith('.ts')).map((f) => `src/services/${f}`),
];
const corpus = srcFiles.map((f) => {
  const raw = fs.readFileSync(path.join(REPO, f), 'utf8');
  const txt = raw.replace(/<[^>]+>/g, '').replace(/\\'/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  return { f, txt, raw: raw.replace(/\\'/g, "'").replace(/\s+/g, ' '), flat: txt.replace(/\s+/g, '') };
});
// Libellés composés à l'affichage (icône + texte assemblés par le code) : vérifiés à la main.
const DYNAMIC = {
  '⏳ À vérifier': 'public/js/15-checklists.js:387 (icône ⏳ + label « À vérifier »)',
  '✅ OK': 'public/js/03-create-forms.js:425 / 15-checklists.js:388',
  '🟠 Partiel': 'public/js/15-checklists.js:389',
  '❌ Non fait': 'public/js/15-checklists.js:390',
  '➖ N.A.': 'public/js/15-checklists.js:391',
  '🃏 Remplir en diaporama': 'public/js/15-checklists.js:807 (« 🃏 ${verb} en diaporama », verb = Remplir)',
  '🚛 Ajouter un véhicule': 'public/js/10-logistics-bookings.js:9 (« 🚛 ${isEdit ? \'Modifier\' : \'Ajouter\'} un véhicule »)',
  '💾 Créer': 'public/js/10-logistics-bookings.js:920, 1103 (« 💾 ${isEdit?\'Enregistrer\':\'Créer\'} »)',
};
const labelResults = [];
for (const [label, where] of [...LABELS.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr'))) {
  const norm = label.replace(/\s+/g, ' ');
  const flat = norm.replace(/\s+/g, '');
  const hits = corpus.filter((c) => c.txt.includes(norm) || c.raw.includes(norm) || c.flat.includes(flat)).map((c) => c.f);
  const dyn = !hits.length && DYNAMIC[label];
  labelResults.push({ label, slides: [...where].join(', '), found: hits.length > 0 || !!dyn, how: hits.length ? 'texte exact' : (dyn ? 'composé : ' + dyn : 'INTROUVABLE'), inIndex: hits.includes('public/index.html'), files: hits.slice(0, 3) });
}
const fullText = slides.map((s) => toText((s.html || '') + ' ' + s.title + ' ' + (s.notes || ''))).join('\n');
const FORBIDDEN = ['Plans 2D', 'Plan 2D', 'Plans Viewbox', 'Étude structure', 'Etude structure', 'structure study', 'Loading liste', 'Railway', 'Prisma', 'Cloudinary', 'Claude', 'Anthropic', 'OpenAI', 'Haiku', 'Sonnet', 'IMAP', 'imap', '/imap-poll', 'F12', 'console', 'API', 'Telegram', 'Brevo', 'token', 'JWT', 'localStorage', 'Ticket SAV', 'Entrepôt / Box', 'Boîtes à outils', 'Import réunion'];
const forbiddenHits = FORBIDDEN.map((w) => ({ w, n: (fullText.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'), 'g')) || []).length })).filter((x) => x.n);
// tutoiement : on retire d'abord les libellés exacts de l'app (qui, eux, tutoient parfois)
let free = fullText;
for (const l of LABELS.keys()) free = free.split(l).join(' ');
const TU = [/\btu\b/gi, /\bton\b/gi, /\btes\b/gi, /\btoi\b/gi, /\bta\b/gi];
const tuHits = LANG !== 'fr' ? [] : TU.flatMap((re) => (free.match(re) || []).map((m) => m));
const qa = { slides: slides.length, perModule: modules.map((m) => ({ num: m.num, title: m.title, key: m.key, n: slides.filter((s) => s.module === m).length, duree: m.duree, parcours: m.parcours, public: m.public })), labels: labelResults, forbiddenHits, tuHits, captures: CAPTURES.length };
fs.writeFileSync(path.join(HERE, `qa-auto${SUFFIX}.json`), JSON.stringify(qa, null, 2));
console.log(`[${LANG}] ${slides.length} slides, ${LABELS.size} libellés (${labelResults.filter((l) => !l.found).length} introuvables), termes interdits: ${JSON.stringify(forbiddenHits)}, tutoiement: ${tuHits.length}`);
}
