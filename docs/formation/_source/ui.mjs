// Briques d'interface recréées pour le deck de formation VEM.
// Chaque libellé passé à btn / tab / field / ... est enregistré dans LABELS :
// build.mjs vérifie ensuite qu'il existe tel quel dans le code de l'app (rapport QA).
// Utiliser { free: true } pour un texte d'exemple (données du projet fil rouge) qui
// n'est pas un libellé de l'interface.

export const LABELS = new Map();   // libellé -> Set(slide ids)
export const CAPTURES = [];        // captures d'écran à réaliser
let currentSlide = '?';
export function setSlide(id) { currentSlide = id; }

function reg(label) {
  if (!LABELS.has(label)) LABELS.set(label, new Set());
  LABELS.get(label).add(currentSlide);
}

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Libellé exact de l'app, entre guillemets français, dans le texte courant.
export function q(label) { reg(label); return `« ${esc(label)} »`; }
// Même chose, sans guillemets (dans un tableau, un menu…).
export function L(label) { reg(label); return esc(label); }

export function btn(label, kind = 'ghost', opts = {}) {
  if (!opts.free) reg(label);
  return `<span class="m-btn m-${kind}">${esc(label)}</span>`;
}
export function tabs(list, active = 0) {
  return `<div class="m-tabs">${list.map((t, i) => { reg(t); return `<span class="m-tab${i === active ? ' on' : ''}">${esc(t)}</span>`; }).join('')}</div>`;
}
export function field(label, value = '', opts = {}) {
  reg(label);
  const v = value ? `<span class="m-val${opts.ph ? ' ph' : ''}">${esc(value)}</span>` : '<span class="m-val ph">&nbsp;</span>';
  return `<div class="m-field${opts.wide ? ' wide' : ''}"><span class="m-lbl">${esc(label)}</span>${v}</div>`;
}
export function check(label, on = true, opts = {}) {
  if (!opts.free) reg(label);
  return `<span class="m-check"><span class="m-box${on ? ' on' : ''}">${on ? '✓' : ''}</span>${esc(label)}</span>`;
}
export function chip(label, color = 'grey', opts = {}) {
  if (!opts.free) reg(label);
  return `<span class="m-chip c-${color}">${esc(label)}</span>`;
}
export function win(title, inner, opts = {}) {
  if (!opts.free) reg(title);
  const sub = opts.sub ? `<div class="m-sub">${esc(opts.sub)}</div>` : '';
  return `<div class="m-win${opts.cls ? ' ' + opts.cls : ''}"><div class="m-head"><div><div class="m-title">${esc(title)}</div>${sub}</div><span class="m-x">×</span></div><div class="m-body">${inner}</div></div>`;
}
export function menu(sections) {
  // sections: [[titre, [items...]], ...] ; item préfixé « ! » = mis en avant
  return `<div class="m-nav">${sections.map(([t, items]) => {
    if (t) reg(t);
    return `<div class="m-navsec">${t ? `<div class="m-navlbl">${esc(t)}</div>` : ''}${items.map((it) => {
      const hl = it.startsWith('!'); const lab = hl ? it.slice(1) : it; reg(lab);
      return `<div class="m-navit${hl ? ' on' : ''}">${esc(lab)}</div>`;
    }).join('')}</div>`;
  }).join('')}</div>`;
}
export function steps(list) {
  return `<ol class="steps">${list.map((s) => `<li><span class="n"></span><div>${s}</div></li>`).join('')}</ol>`;
}
export function callout(kind, html) {
  const icon = { warn: '⚠️ Attention', tip: '💡 Astuce', info: 'ℹ️ Bon à savoir', ok: '✅ Bonne pratique', no: '⛔ Interdit' }[kind];
  return `<div class="callout ${kind}"><div class="ct">${icon}</div><div>${html}</div></div>`;
}
export function capture(id, screen, state, data) {
  CAPTURES.push({ id, slide: currentSlide, screen, state, data });
  return `<div class="capture"><div class="cap-id">${esc(id)}</div><div>[CAPTURE À FAIRE : ${esc(screen)} — ${esc(state)}]</div></div>`;
}
export function cols(a, b, ratio = '1fr 1fr') {
  return `<div class="cols" style="grid-template-columns:${ratio}">${`<div>${a}</div><div>${b}</div>`}</div>`;
}
export function table(head, rows, opts = {}) {
  return `<table class="tbl${opts.small ? ' small' : ''}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
export function ul(items) { return `<ul class="bul">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`; }
export function path(parts) {
  // chemin d'accès : Menu › Onglet › Bouton (chaque partie est un libellé exact, sauf si préfixée « ~ »)
  return `<div class="path">${parts.map((p) => { const free = p.startsWith('~'); const t = free ? p.slice(1) : p; if (!free) reg(t); return `<span>${esc(t)}</span>`; }).join('<b>›</b>')}</div>`;
}
