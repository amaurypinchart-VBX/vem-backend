// ═══════════════════════════════════════════════════════════════
// VEM CHANTIER — côté bureau (l'application des installateurs est public/chantier.html, servie à /chantier)
//  • Onglet Équipe du projet : carte « 👷 VEM Chantier » — inviter un installateur (lien WhatsApp / SMS / QR),
//    chef d'équipe, accès dans le temps (J−14 / J+14, « redonner l'accès »), nouveau lien si code oublié.
//  • Onglet Fichiers : « 👷 » sur chaque document = rubrique où les installateurs le voient (Plans / Briefing / Infos).
//  • Onglet Daily Reports : carte « 📝 Feuilles de temps du chantier » — corriger, valider (→ rapport du jour), renvoyer.
//  • Réglages › modèles de tâches : compteurs de quantités (Viewbox, vitres, portes…), repris dans les rapports journaliers.
// Serveur : src/routes/chantier.ts. Chargé avant 21-mobile-ui.js ; ne fait que définir des fonctions.
// ═══════════════════════════════════════════════════════════════

const CHANTIER_DESIGNATORS = ['admin', 'technical_manager', 'sales_engineer'];
const CHANTIER_LANGS = { fr: '🇫🇷 Français', en: '🇬🇧 English', nl: '🇳🇱 Nederlands', pl: '🇵🇱 Polski' };
const CHANTIER_ROLE_LABELS = { installer: 'Installateur', worker: 'Ouvrier', site_manager: 'Site manager', technical_manager: 'Technical manager', project_manager: 'Project manager', sales_engineer: 'Sales', engineer: 'Engineer', warehouse: 'Entrepôt', admin: 'Admin', client: 'Client' };
const CHANTIER_STATUS = {
  draft: { lbl: 'Brouillon (en cours sur le chantier)', cls: 'badge-muted', icon: '✏️' },
  submitted: { lbl: 'À valider', cls: 'badge-amber', icon: '⏳' },
  validating: { lbl: 'Validation…', cls: 'badge-amber', icon: '⏳' },
  returned: { lbl: 'Renvoyée au chef d’équipe', cls: 'badge-red', icon: '↩' },
  validated: { lbl: 'Validée', cls: 'badge-green', icon: '✅' },
};
const chEsc = (s) => (typeof esc === 'function' ? esc(s) : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
const chCanDesignate = () => !!CURRENT_USER && CHANTIER_DESIGNATORS.includes(CURRENT_USER.role);
const chDay = (ymd) => (ymd ? new Date(String(ymd).slice(0, 10) + 'T12:00:00Z').toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const chNum = (n) => (Math.round((Number(n) || 0) * 100) / 100).toString().replace('.', ',');

(function chantierStyles() {
  if (document.getElementById('chantier-styles')) return;
  const st = document.createElement('style');
  st.id = 'chantier-styles';
  st.textContent = `
    .ch-scope .btn.btn-xs{padding:3px 8px;font-size:11px;}
    .ch-table td{vertical-align:middle;}
    .ch-q{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 2px;}
    .ch-q label{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text3);background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:2px 6px;}
    .ch-q input{width:56px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:2px 4px;color:var(--text);font-size:12px;text-align:right;}
    .ch-line{border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:8px;background:var(--bg3);}
    .ch-line .ch-grid{display:grid;grid-template-columns:1fr 80px 80px 28px;gap:8px;align-items:center;}
    .ch-line input.input,.ch-line textarea.input{padding:6px 8px;font-size:13px;}
    .ch-qr{display:flex;justify-content:center;padding:12px;background:#fff;border-radius:10px;}
    .ch-counter{border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:6px;background:var(--bg3);}
    .ch-counter .r{display:grid;grid-template-columns:1fr 90px 28px;gap:6px;}
    .ch-counter .t{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px;}
    .ch-counter input{padding:6px 8px;font-size:12px;}
    @media (max-width:768px){ .ch-line .ch-grid{grid-template-columns:1fr 64px 64px 28px;} }
  `;
  document.head.appendChild(st);
})();

function chModal(html, maxWidth = 560) {
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `<div class="modal ch-scope" style="max-width:${maxWidth}px;">${html}</div>`;
  document.body.appendChild(el);
  return el;
}

// ═══ Onglet Équipe ═══════════════════════════════════════════════
async function loadChantierTeamCard(projectId) {
  const box = document.getElementById('detail-chantier-card');
  if (!box) return;
  const res = await api('GET', `/chantier/office/projects/${projectId}`);
  if (!res?.success) { box.innerHTML = ''; return; }
  const d = res.data;
  const w = d.window;
  const can = d.canManage;
  const rows = d.members.map((m) => {
    let access;
    if (!m.limited) access = '<span class="badge badge-blue">toujours (rôle VEM)</span>';
    else if (m.extended) access = `<span class="badge badge-green">prolongé → ${chDay(m.accessUntil)}</span>`;
    else if (m.hasAccess) access = '<span class="badge badge-green">✅ pendant le chantier</span>';
    else access = `<span class="badge badge-muted">${d.today < w.from ? '⏳ à partir du ' + chDay(w.from) : '⛔ terminé'}</span>`;
    let login;
    if (!m.pinLogin) login = '<span style="font-size:11px;color:var(--text3);">e-mail + mot de passe VEM</span>';
    else if (m.pinSet) login = `<span class="badge badge-green">📱 code choisi</span>${m.lastLogin ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">vu ${chDay(m.lastLogin)}</div>` : ''}`;
    else if (m.inviteOpen) login = '<span class="badge badge-amber">lien envoyé</span>';
    else login = '<span class="badge badge-muted">pas encore invité</span>';
    return `<tr>
      <td><strong>${chEsc(m.name)}</strong><div style="font-size:11px;color:var(--text3);">${chEsc(CHANTIER_ROLE_LABELS[m.role] || m.role)}${m.phone ? ' · ' + chEsc(m.phone) : ''}</div></td>
      <td style="text-align:center;">${can
        ? `<label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;"><input type="checkbox" ${m.crewLead ? 'checked' : ''} onchange="setChantierCrewLead('${projectId}','${m.memberId}',this.checked)" style="width:18px;height:18px;accent-color:var(--accent);">${m.crewLead ? '⭐' : ''}</label>`
        : (m.crewLead ? '⭐' : '')}</td>
      <td>${access}</td>
      <td>${login}</td>
      <td style="white-space:nowrap;text-align:right;">
        ${can && m.pinLogin ? `<button class="btn btn-ghost btn-xs" onclick="chantierNewLink('${projectId}','${m.memberId}')" title="Lien de connexion (première fois ou code oublié)">📲 Lien</button>` : ''}
        ${can && m.limited ? `<button class="btn btn-ghost btn-xs" onclick="chantierExtend('${projectId}','${m.memberId}','${m.accessUntil ? m.accessUntil.slice(0, 10) : ''}','${chEsc(m.name).replace(/'/g, '&#39;')}')" title="Redonner l'accès après la période du chantier">⏳ Accès</button>` : ''}
      </td></tr>`;
  }).join('');
  box.innerHTML = `
    <div class="card ch-scope" style="margin-top:14px;">
      <div class="card-header r-wrap" style="gap:8px;">
        <div>
          <span class="card-title">👷 VEM Chantier — l’app des installateurs</span>
          <div style="font-size:12px;color:var(--text3);margin-top:3px;">Accès des installateurs du <strong>${chDay(w.from)}</strong> au <strong>${chDay(w.to)}</strong> (${w.before} j avant l’installation, ${w.after} j après ${w.custom ? 'la fin — réglé pour ce projet' : 'la fin'}). Le ⭐ chef d’équipe remplit la journée sur son téléphone.</div>
        </div>
        <div class="r-wrap" style="display:flex;gap:6px;">
          ${can ? `<button class="btn btn-ghost btn-sm" onclick="chantierWindowModal('${projectId}',${w.custom ? w.before : 'null'},${w.custom ? w.after : 'null'},${w.defaults.before},${w.defaults.after})">⚙ Période</button>` : ''}
          ${can ? `<button class="btn btn-primary btn-sm" onclick="chantierInviteModal('${projectId}')">＋ Inviter un installateur</button>` : ''}
          <a class="btn btn-ghost btn-sm" href="/chantier" target="_blank" rel="noopener" title="Ouvrir l'app (comme sur un téléphone)">📱 Ouvrir l’app</a>
        </div>
      </div>
      ${d.members.length ? `<div class="table-wrap"><table class="ch-table">
        <thead><tr><th>Personne</th><th style="text-align:center;">Chef d’équipe</th><th>Accès à l’app</th><th>Connexion</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>` : '<div style="padding:12px 18px;color:var(--text3);font-size:13px;">Personne dans l’équipe pour l’instant.</div>'}
      ${!can ? '<div style="padding:8px 18px 12px;font-size:11px;color:var(--text3);">Inviter, désigner le chef d’équipe et prolonger l’accès : admin, technical manager, sales engineer.</div>' : ''}
    </div>`;
}

async function setChantierCrewLead(projectId, memberId, on) {
  const r = await api('PATCH', `/chantier/office/projects/${projectId}/members/${memberId}`, { crewLead: !!on });
  if (r?.success) toast(on ? '⭐ Chef d’équipe : il remplira la journée' : 'Plus chef d’équipe', 'success');
  else toast(r?.error || 'Erreur', 'error');
  loadChantierTeamCard(projectId);
}

function chantierInviteModal(projectId) {
  const el = chModal(`
    <div class="modal-head"><div class="modal-title">📲 Inviter un installateur</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px;">Il reçoit un lien (WhatsApp, SMS ou QR code), choisit sa langue et un code à 4 chiffres. Pas d’e-mail ni de mot de passe. Il est ajouté à l’équipe de ce projet.</div>
    <div class="input-row">
      <div class="form-group2"><label class="form-label2">Prénom *</label><input class="input" id="chi-first"></div>
      <div class="form-group2"><label class="form-label2">Nom *</label><input class="input" id="chi-last"></div>
    </div>
    <div class="input-row">
      <div class="form-group2"><label class="form-label2">Téléphone * <span style="font-weight:400;color:var(--text3);">(sert à se reconnecter)</span></label><input class="input" id="chi-phone" type="tel" placeholder="+32 4…"></div>
      <div class="form-group2"><label class="form-label2">Langue de l’app</label><select class="input" id="chi-lang">${Object.entries(CHANTIER_LANGS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    </div>
    <div class="form-group2"><label class="form-label2">E-mail <span style="font-weight:400;color:var(--text3);">(facultatif)</span></label><input class="input" id="chi-email" type="email"></div>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:6px 0 4px;cursor:pointer;"><input type="checkbox" id="chi-lead" style="width:18px;height:18px;accent-color:var(--accent);"> ⭐ Chef d’équipe (remplit la journée de l’équipe)</label>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
      <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
      <button class="btn btn-primary" id="chi-go">📲 Créer le lien</button>
    </div>`);
  el.querySelector('#chi-go').onclick = async (ev) => {
    const btn = ev.currentTarget;
    const body = {
      firstName: el.querySelector('#chi-first').value.trim(), lastName: el.querySelector('#chi-last').value.trim(),
      phone: el.querySelector('#chi-phone').value.trim(), email: el.querySelector('#chi-email').value.trim(),
      lang: el.querySelector('#chi-lang').value, crewLead: el.querySelector('#chi-lead').checked,
    };
    if (!body.firstName || !body.lastName || !body.phone) { toast('Prénom, nom et téléphone obligatoires', 'error'); return; }
    btn.disabled = true;
    const r = await api('POST', `/chantier/office/projects/${projectId}/installers`, body);
    btn.disabled = false;
    if (!r?.success) { toast(r?.error || 'Erreur', 'error'); return; }
    el.remove();
    if (r.data.reused) toast('Ce numéro était déjà connu : même compte, ajouté à l’équipe.', 'info');
    chantierShowLink({ ...r.data, phone: body.phone, lang: body.lang });
    if (typeof loadProjectDetail === 'function' && typeof CURRENT_PROJECT_ID !== 'undefined' && CURRENT_PROJECT_ID === projectId) loadProjectDetail(projectId);
    else loadChantierTeamCard(projectId);
  };
}

async function chantierNewLink(projectId, memberId) {
  const r = await api('POST', `/chantier/office/projects/${projectId}/members/${memberId}/link`);
  if (!r?.success) { toast(r?.error || 'Erreur', 'error'); return; }
  chantierShowLink(r.data);
  loadChantierTeamCard(projectId);
}

const CHANTIER_INVITE_TEXT = {
  fr: (n, l) => `Bonjour ${n}, voici ton accès à l’app VEM Chantier (plans, briefing, journée) : ${l}\nOuvre le lien, choisis ta langue et un code à 4 chiffres.`,
  en: (n, l) => `Hello ${n}, here is your access to the VEM Chantier app (drawings, briefing, daily sheet): ${l}\nOpen the link, choose your language and a 4-digit code.`,
  nl: (n, l) => `Hallo ${n}, hier is je toegang tot de app VEM Chantier (plannen, briefing, dagblad): ${l}\nOpen de link, kies je taal en een code van 4 cijfers.`,
  pl: (n, l) => `Cześć ${n}, oto Twój dostęp do aplikacji VEM Chantier (plany, briefing, dzień pracy): ${l}\nOtwórz link, wybierz język i kod z 4 cyfr.`,
};
function chantierShowLink(d) {
  const first = String(d.name || '').split(' ')[0];
  const text = (CHANTIER_INVITE_TEXT[d.lang] || CHANTIER_INVITE_TEXT.fr)(first, d.link);
  const digits = String(d.phone || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  const el = chModal(`
    <div class="modal-head"><div class="modal-title">📲 Lien pour ${chEsc(d.name)}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px;">Valable 7 jours, une seule fois. Il choisit sa langue et son code à 4 chiffres, puis se reconnecte avec son téléphone + son code. Sur place : fais-lui scanner le QR code.</div>
    <div class="ch-qr" id="ch-qr"><div style="color:#555;font-size:12px;">QR code…</div></div>
    <input class="input" readonly value="${chEsc(d.link)}" style="margin-top:10px;font-size:12px;" onclick="this.select()">
    <div class="r-wrap" style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
      <button class="btn btn-primary btn-sm" id="ch-copy">📋 Copier le message</button>
      ${digits ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/${digits}?text=${encodeURIComponent(text)}">💬 WhatsApp</a>
      <a class="btn btn-ghost btn-sm" href="sms:${encodeURIComponent('+' + digits)}?&body=${encodeURIComponent(text)}">✉️ SMS</a>` : ''}
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;"><button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button></div>`, 460);
  el.querySelector('#ch-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Message copié ✅', 'success'); } catch { toast('Copie impossible : sélectionne le lien', 'error'); }
  };
  chantierQr(el.querySelector('#ch-qr'), d.link);
}

// QR code : bibliothèque chargée à la demande (cdnjs), seulement pour cette fenêtre
function chantierQr(box, text) {
  const draw = () => {
    try { box.innerHTML = ''; new QRCode(box, { text, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M }); }
    catch { box.innerHTML = '<div style="color:#555;font-size:12px;">QR code indisponible — utilise le lien.</div>'; }
  };
  if (window.QRCode) return draw();
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload = draw;
  s.onerror = () => { box.innerHTML = '<div style="color:#555;font-size:12px;">QR code indisponible (hors ligne) — utilise le lien.</div>'; };
  document.head.appendChild(s);
}

function chantierExtend(projectId, memberId, until, name) {
  const def = until || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const el = chModal(`
    <div class="modal-head"><div class="modal-title">⏳ Accès de ${name}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px;">En dehors de la période du chantier, il ne voit plus le projet. Donne-lui l’accès jusqu’au :</div>
    <input class="input" type="date" id="chx-date" value="${def}">
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;flex-wrap:wrap;">
      ${until ? '<button class="btn btn-ghost btn-sm" id="chx-clear" style="color:var(--accent);">Retirer la prolongation</button>' : '<span></span>'}
      <div style="display:flex;gap:8px;"><button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button><button class="btn btn-primary" id="chx-go">Enregistrer</button></div>
    </div>`, 420);
  const save = async (v) => {
    const r = await api('PATCH', `/chantier/office/projects/${projectId}/members/${memberId}`, { accessUntil: v });
    if (!r?.success) { toast(r?.error || 'Erreur', 'error'); return; }
    el.remove(); toast('Accès enregistré ✅', 'success'); loadChantierTeamCard(projectId);
  };
  el.querySelector('#chx-go').onclick = () => save(el.querySelector('#chx-date').value || null);
  const c = el.querySelector('#chx-clear');
  if (c) c.onclick = () => save(null);
}

function chantierWindowModal(projectId, before, after, defBefore, defAfter) {
  const el = chModal(`
    <div class="modal-head"><div class="modal-title">⚙ Période d’accès des installateurs</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px;">Les installateurs voient ce projet de N jours avant le début de l’installation à N jours après la fin du démontage. Laisse vide pour le réglage général (${defBefore} / ${defAfter} jours).</div>
    <div class="input-row">
      <div class="form-group2"><label class="form-label2">Jours avant l’installation</label><input class="input" type="number" min="0" max="365" id="chw-b" value="${before ?? ''}" placeholder="${defBefore}"></div>
      <div class="form-group2"><label class="form-label2">Jours après le démontage</label><input class="input" type="number" min="0" max="365" id="chw-a" value="${after ?? ''}" placeholder="${defAfter}"></div>
    </div>
    ${CURRENT_USER?.role === 'admin' ? `<label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-top:4px;cursor:pointer;"><input type="checkbox" id="chw-all"> Faire de ces valeurs le réglage général (tous les projets sans réglage propre)</label>` : ''}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;"><button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button><button class="btn btn-primary" id="chw-go">Enregistrer</button></div>`, 460);
  el.querySelector('#chw-go').onclick = async () => {
    const b = el.querySelector('#chw-b').value, a = el.querySelector('#chw-a').value;
    const all = el.querySelector('#chw-all')?.checked;
    let r;
    if (all) {
      r = await api('PUT', '/chantier/office/settings', { before: b === '' ? defBefore : Number(b), after: a === '' ? defAfter : Number(a) });
      if (r?.success) r = await api('PATCH', `/chantier/office/projects/${projectId}/window`, { before: null, after: null });
    } else r = await api('PATCH', `/chantier/office/projects/${projectId}/window`, { before: b === '' ? null : Number(b), after: a === '' ? null : Number(a) });
    if (!r?.success) { toast(r?.error || 'Erreur', 'error'); return; }
    el.remove(); toast('Période enregistrée ✅', 'success'); loadChantierTeamCard(projectId);
  };
}

// ═══ Onglet Fichiers : rubrique visible sur chantier ═════════════
function chantierAutoSection(f) {
  const name = String(f.fileName || '');
  const pdf = /\.pdf$/i.test(name);
  if (pdf && /_VALIDE/i.test(name)) return 'plans';
  if (pdf && /briefing/i.test(name)) return 'briefing';
  if (f.category === 'planning') return 'info';
  return 'none';
}
function chantierFileControl(f, projectId) {
  if (!CURRENT_USER || ['installer', 'worker', 'client'].includes(CURRENT_USER.role)) return '';
  const sec = f.siteSection || chantierAutoSection(f);
  const opts = [['none', '👷 Chantier : non'], ['plans', '👷 📐 Plans'], ['briefing', '👷 📋 Briefing'], ['info', '👷 ℹ️ Infos']];
  return `<select title="Rubrique où les installateurs voient ce fichier dans l’app VEM Chantier${f.siteSection ? '' : ' (choix automatique)'}" onchange="setChantierFileSection('${f.id}',this.value,this)"
    style="padding:3px 6px;background:${sec === 'none' ? 'var(--bg2)' : 'rgba(31,157,85,.15)'};border:1px solid ${sec === 'none' ? 'var(--border)' : 'var(--green, #1f9d55)'};border-radius:6px;color:var(--text);font-size:11px;cursor:pointer;max-width:150px;">
    ${opts.map(([k, l]) => `<option value="${k}" ${k === sec ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
async function setChantierFileSection(fileId, section, sel) {
  const r = await api('PATCH', `/chantier/office/files/${fileId}`, { siteSection: section });
  if (!r?.success) { toast(r?.error || 'Erreur', 'error'); return; }
  const f = (typeof CURRENT_PROJECT_FILES !== 'undefined' ? CURRENT_PROJECT_FILES : []).find((x) => x.id === fileId);
  if (f) f.siteSection = r.data.siteSection;
  if (sel) { const on = r.data.section !== 'none'; sel.style.background = on ? 'rgba(31,157,85,.15)' : 'var(--bg2)'; sel.style.borderColor = on ? 'var(--green, #1f9d55)' : 'var(--border)'; }
  toast(r.data.section === 'none' ? 'Caché aux installateurs' : 'Visible dans l’app chantier ✅', 'success');
}

// ═══ Onglet Daily Reports : feuilles de temps du chantier ════════
let CHANTIER_SHEETS = [];
async function loadChantierTimesheets(projectId) {
  const box = document.getElementById('detail-timesheets-card');
  if (!box) return;
  const res = await api('GET', `/chantier/office/projects/${projectId}/timesheets`);
  if (!res?.success) { box.innerHTML = ''; return; }
  CHANTIER_SHEETS = res.data;
  if (!CHANTIER_SHEETS.length) { box.innerHTML = ''; return; }
  const todo = CHANTIER_SHEETS.filter((s) => s.canValidate).length;
  box.innerHTML = `
    <div class="card ch-scope" style="margin-bottom:14px;">
      <div class="card-header"><div><span class="card-title">📝 Feuilles de temps du chantier</span>
        <div style="font-size:12px;color:var(--text3);margin-top:3px;">Remplies par le chef d’équipe dans l’app VEM Chantier. Une fois validées, elles remplissent le rapport journalier du jour.</div></div>
        ${todo ? `<span class="badge badge-amber">${todo} à valider</span>` : ''}</div>
      <div style="padding:6px 14px 12px;display:flex;flex-direction:column;gap:8px;">
        ${CHANTIER_SHEETS.map((s) => {
          const st = CHANTIER_STATUS[s.status] || CHANTIER_STATUS.draft;
          return `<div class="r-wrap" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);border:1px solid var(--border);border-radius:10px;">
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:13px;">${chDay(s.workDate)} · ${chEsc(s.filledBy)} <span style="font-weight:400;color:var(--text3);font-size:11px;">(${s.filledRole === 'site_manager' ? 'site manager' : 'chef d’équipe'})</span></div>
              <div style="font-size:12px;color:var(--text3);margin-top:2px;">${s.totals.tasks} tâche(s) · ${chNum(s.totals.manHours)} h-hommes · ${s.present.length} présent(s)</div>
              <div style="font-size:11px;color:var(--text2);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.lines.map((l) => chEsc(l.title)).join(' · ')}</div>
            </div>
            <span class="badge ${st.cls}">${st.icon} ${st.lbl}</span>
            <button class="btn ${s.canValidate ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="openChantierSheet('${s.id}','${projectId}')">${s.canValidate ? '✅ Vérifier et valider' : 'Voir'}</button>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function chQtyText(q) { return (q || []).filter((x) => x.qty > 0).map((x) => `${x.qty} ${chEsc(x.label)}`).join(' · '); }

async function openChantierSheet(id, projectId) {
  const res = await api('GET', `/chantier/office/timesheets/${id}`);
  if (!res?.success) { toast(res?.error || 'Feuille introuvable', 'error'); return; }
  const s = res.data;
  const st = CHANTIER_STATUS[s.status] || CHANTIER_STATUS.draft;
  const edit = s.canValidate;
  const lines = JSON.parse(JSON.stringify(s.lines || []));
  const el = chModal('', 760);
  const who = { submitted: 'envoyée', corrected: 'corrigée', validated: 'validée', returned: 'renvoyée', reopened: 'rouverte' };
  const render = () => {
    const mh = lines.reduce((a, l) => a + (Number(l.hours) || 0) * (Number(l.workers) || 0), 0);
    el.querySelector('.modal').innerHTML = `
      <div class="modal-head"><div><div class="modal-title">📝 Feuille de temps — ${chDay(s.workDate)}</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px;">${chEsc(s.filledBy)} (${s.filledRole === 'site_manager' ? 'site manager' : 'chef d’équipe'}) · <span class="badge ${st.cls}">${st.icon} ${st.lbl}</span>${s.validatedBy ? ` · validée par ${chEsc(s.validatedBy)}` : ''}</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      ${s.status === 'submitted' && !edit ? `<div style="font-size:12px;background:var(--bg3);border-radius:8px;padding:8px 10px;margin-bottom:10px;">Validation par le niveau juste au-dessus : la feuille d’un chef d’équipe par le site manager (ou technical manager / sales), celle d’un site manager par le technical manager ou le sales engineer — jamais sa propre feuille.</div>` : ''}
      ${s.returnComment && s.status === 'returned' ? `<div style="font-size:12px;background:rgba(230,57,70,.1);border-radius:8px;padding:8px 10px;margin-bottom:10px;">↩ Renvoyée : ${chEsc(s.returnComment)}</div>` : ''}
      <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">👷 Présents (${s.present.length}) : ${s.present.map((p) => chEsc(p.name)).join(', ') || '—'}</div>
      ${edit ? '<div style="display:grid;grid-template-columns:1fr 80px 80px 28px;gap:8px;font-size:11px;color:var(--text3);font-weight:700;padding:0 10px 4px;"><span>Tâche</span><span style="text-align:right;">Gars</span><span style="text-align:right;">Durée (h)</span><span></span></div>' : ''}
      ${lines.map((l, i) => edit ? `
        <div class="ch-line">
          <div class="ch-grid">
            <input class="input" value="${chEsc(l.title)}" oninput="this.closest('.overlay')._lines[${i}].title=this.value">
            <input class="input" type="number" min="0" step="1" value="${l.workers}" style="text-align:right;" oninput="this.closest('.overlay')._lines[${i}].workers=parseInt(this.value)||0;this.closest('.overlay')._total()">
            <input class="input" type="number" min="0" step="0.25" value="${l.hours}" style="text-align:right;" oninput="this.closest('.overlay')._lines[${i}].hours=parseFloat(this.value)||0;this.closest('.overlay')._total()">
            <button class="btn btn-ghost btn-xs" title="Retirer" onclick="const o=this.closest('.overlay');o._lines.splice(${i},1);o._render()">✕</button>
          </div>
          ${(l.quantities || []).length ? `<div class="ch-q">${l.quantities.map((q, k) => `<label>${chEsc(q.label)} <input type="number" min="0" value="${q.qty}" oninput="this.closest('.overlay')._lines[${i}].quantities[${k}].qty=parseInt(this.value)||0"></label>`).join('')}</div>` : ''}
          ${l.comment ? `<div style="font-size:12px;margin-top:4px;">💬 ${chEsc(l.commentFr || l.comment)}${l.commentFr && l.commentFr !== l.comment ? `<div style="font-size:11px;color:var(--text3);">original (${chEsc(l.commentLang)}) : ${chEsc(l.comment)}</div>` : ''}</div>` : ''}
          <div style="font-size:11px;color:var(--text3);margin-top:3px;">${l.newTask ? '🆕 tâche ajoutée sur chantier (créée dans le projet à la validation)' : ''}${l.done ? ' · ✅ marquée terminée' : ''}</div>
          ${(l.photos || []).length ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">${l.photos.map((p) => `<img src="${chEsc(p.url)}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="typeof openPhotoViewer==='function'?openPhotoViewer('${chEsc(p.url)}'):window.open('${chEsc(p.url)}')">`).join('')}</div>` : ''}
        </div>` : `
        <div class="ch-line">
          <div style="display:flex;justify-content:space-between;gap:10px;"><strong style="font-size:13px;">${chEsc(l.title)}</strong><span style="font-size:12px;white-space:nowrap;">${l.workers} gars × ${chNum(l.hours)} h</span></div>
          ${chQtyText(l.quantities) ? `<div style="font-size:12px;margin-top:3px;">🔢 ${chQtyText(l.quantities)}</div>` : ''}
          ${l.comment ? `<div style="font-size:12px;margin-top:3px;">💬 ${chEsc(l.commentFr || l.comment)}</div>` : ''}
          ${(l.photos || []).length ? `<div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">${l.photos.map((p) => `<img src="${chEsc(p.url)}" style="width:56px;height:56px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="typeof openPhotoViewer==='function'?openPhotoViewer('${chEsc(p.url)}'):window.open('${chEsc(p.url)}')">`).join('')}</div>` : ''}
        </div>`).join('') || '<div style="color:var(--text3);font-size:13px;">Aucune tâche.</div>'}
      <div style="text-align:right;font-size:13px;margin:6px 4px 10px;">Total : <strong id="ch-total">${chNum(mh)}</strong> h-hommes</div>
      ${s.comment ? `<div style="font-size:12px;background:var(--bg3);border-radius:8px;padding:8px 10px;margin-bottom:10px;">📝 ${chEsc(s.comment)}</div>` : ''}
      ${(s.history || []).length ? `<details style="font-size:11px;color:var(--text3);margin-bottom:10px;"><summary style="cursor:pointer;">Historique (${s.history.length})</summary>${s.history.map((h) => `<div style="margin-top:3px;">${new Date(h.at).toLocaleString('fr-BE')} — ${who[h.action] || h.action}${h.comment ? ' : ' + chEsc(h.comment) : ''}${(h.changes || []).map((c) => `<div style="padding-left:12px;">${chEsc(c)}</div>`).join('')}</div>`).join('')}</details>` : ''}
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
        ${s.dailyReportId && typeof openDailyDetail === 'function' ? `<button class="btn btn-ghost btn-sm" onclick="this.closest('.overlay').remove();openDailyDetail('${s.dailyReportId}','${projectId}')">📓 Rapport du jour</button>` : ''}
        ${s.status === 'validated' && chCanDesignate() && s.filledById !== CURRENT_USER?.id ? `<button class="btn btn-ghost btn-sm" id="ch-reopen">↺ Rouvrir</button>` : ''}
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
        ${edit ? `<button class="btn btn-ghost btn-sm" id="ch-return" style="color:var(--accent);">↩ Renvoyer au chef d’équipe</button>
          <button class="btn btn-ghost btn-sm" id="ch-save">💾 Enregistrer les corrections</button>
          <button class="btn btn-primary" id="ch-validate">✅ Valider</button>` : ''}
      </div>`;
    const q = (sel) => el.querySelector(sel);
    if (q('#ch-validate')) q('#ch-validate').onclick = async (ev) => {
      ev.currentTarget.disabled = true;
      const r = await api('POST', `/chantier/office/timesheets/${id}/validate`, { lines: el._lines });
      if (!r?.success) { ev.currentTarget.disabled = false; toast(r?.error || 'Erreur', 'error'); return; }
      el.remove(); toast('Validée ✅ — reprise dans le rapport du jour', 'success');
      if (typeof loadDetailDailyReports === 'function') loadDetailDailyReports(projectId); else loadChantierTimesheets(projectId);
    };
    if (q('#ch-save')) q('#ch-save').onclick = async () => {
      const r = await api('PUT', `/chantier/office/timesheets/${id}`, { lines: el._lines });
      if (!r?.success) { toast(r?.error || 'Erreur', 'error'); return; }
      toast('Corrections enregistrées', 'success'); el.remove(); openChantierSheet(id, projectId);
    };
    if (q('#ch-return')) q('#ch-return').onclick = async () => {
      const c = prompt('Qu’est-ce que le chef d’équipe doit corriger ? (il le verra dans l’app)');
      if (!c || !c.trim()) return;
      const r = await api('POST', `/chantier/office/timesheets/${id}/return`, { comment: c.trim() });
      if (!r?.success) { toast(r?.error || 'Erreur', 'error'); return; }
      el.remove(); toast('Renvoyée au chef d’équipe', 'success'); loadChantierTimesheets(projectId);
    };
    if (q('#ch-reopen')) q('#ch-reopen').onclick = async () => {
      if (!confirm('Rouvrir cette feuille ? Elle repasse « à valider » ; à la nouvelle validation, ses lignes du rapport du jour sont remplacées.')) return;
      const r = await api('POST', `/chantier/office/timesheets/${id}/reopen`);
      if (!r?.success) { toast(r?.error || 'Erreur', 'error'); return; }
      el.remove(); openChantierSheet(id, projectId); loadChantierTimesheets(projectId);
    };
  };
  el._lines = lines;
  el._render = render;
  el._total = () => { const t = el.querySelector('#ch-total'); if (t) t.textContent = chNum(el._lines.reduce((a, l) => a + (Number(l.hours) || 0) * (Number(l.workers) || 0), 0)); };
  render();
}

// ═══ Compteurs de quantités (modèles de tâches) ══════════════════
const CHANTIER_COUNTER_DICT = {
  viewbox: ['Viewbox', 'Viewbox', 'Viewbox'], panneaux: ['Panels', 'Panelen', 'Panele'], panneau: ['Panels', 'Panelen', 'Panele'],
  vitres: ['Glass panes', 'Ruiten', 'Szyby'], vitre: ['Glass panes', 'Ruiten', 'Szyby'], portes: ['Doors', 'Deuren', 'Drzwi'], porte: ['Doors', 'Deuren', 'Drzwi'],
  murs: ['Walls', 'Wanden', 'Ściany'], pieds: ['Feet', 'Voeten', 'Stopy'], plaques: ['Plates', 'Platen', 'Płyty'], escaliers: ['Stairs', 'Trappen', 'Schody'],
  'garde-corps': ['Railings', 'Leuningen', 'Balustrady'], spots: ['Spotlights', 'Spots', 'Reflektory'], cadres: ['Frames', 'Kaders', 'Ramy'], camions: ['Trucks', 'Vrachtwagens', 'Ciężarówki'],
  modules: ['Modules', 'Modules', 'Moduły'], 'mètres': ['Metres', 'Meter', 'Metry'], m: ['m', 'm', 'm'], 'm²': ['m²', 'm²', 'm²'], toits: ['Roofs', 'Daken', 'Dachy'], planchers: ['Floors', 'Vloeren', 'Podłogi'],
};
function chantierCountersEditor(boxId, fields) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box._fields = (fields || []).map((f) => ({ key: f.key, unit: f.unit || '', label: { fr: '', en: '', nl: '', pl: '', ...(f.label || {}) } }));
  const draw = () => {
    box.innerHTML = `${box._fields.map((f, i) => `
      <div class="ch-counter">
        <div class="r"><input class="input" placeholder="Ce qu’on compte (FR) ex. Vitres" value="${chEsc(f.label.fr)}" data-i="${i}" data-l="fr"><input class="input" placeholder="unité" value="${chEsc(f.unit)}" data-i="${i}" data-l="unit"><button type="button" class="btn btn-ghost btn-xs" data-del="${i}" title="Retirer">✕</button></div>
        <div class="t">${['en', 'nl', 'pl'].map((l) => `<input class="input" placeholder="${l.toUpperCase()}" value="${chEsc(f.label[l])}" data-i="${i}" data-l="${l}">`).join('')}</div>
      </div>`).join('')}
      <button type="button" class="btn btn-ghost btn-sm" data-add="1">＋ Ajouter un compteur</button>`;
    box.querySelectorAll('input').forEach((inp) => {
      inp.oninput = () => { const f = box._fields[+inp.dataset.i]; if (inp.dataset.l === 'unit') f.unit = inp.value; else f.label[inp.dataset.l] = inp.value; };
      if (inp.dataset.l === 'fr') inp.onblur = () => {
        const f = box._fields[+inp.dataset.i];
        const t = CHANTIER_COUNTER_DICT[f.label.fr.trim().toLowerCase()];
        if (t) { ['en', 'nl', 'pl'].forEach((l, k) => { if (!f.label[l]) f.label[l] = t[k]; }); draw(); }
      };
    });
    box.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { box._fields.splice(+b.dataset.del, 1); draw(); }; });
    box.querySelector('[data-add]').onclick = () => { box._fields.push({ key: '', unit: '', label: { fr: '', en: '', nl: '', pl: '' } }); draw(); };
  };
  draw();
}
function chantierCountersValue(boxId) {
  const box = document.getElementById(boxId);
  if (!box || !box._fields) return undefined;
  return box._fields.filter((f) => f.label.fr.trim()).map((f) => ({ key: f.key || undefined, unit: f.unit.trim(), label: Object.fromEntries(Object.entries(f.label).map(([k, v]) => [k, String(v || '').trim()]).filter(([, v]) => v)) }));
}
function chantierCountersBlock(boxId) {
  return `<div class="form-group2"><label class="form-label2">🔢 Compteurs de quantités <span style="font-weight:400;color:var(--text3);">(facultatif — ex. « Viewbox », ou « Panneaux », « Vitres », « Portes »)</span></label>
    <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">En plus des heures et du nombre de gars, on note combien ont été faits (rapport journalier et app VEM Chantier). Traductions EN / NL / PL pour les installateurs (remplies d’office pour les mots courants).</div>
    <div id="${boxId}"></div></div>`;
}

// ═══ Rapports journaliers : quantités par tâche ══════════════════
function chantierTemplateFields(templateId) {
  const all = (typeof DAILY_ALL_TEMPLATES !== 'undefined' && DAILY_ALL_TEMPLATES) || (typeof PROJ_TEMPLATES_FLAT !== 'undefined' && PROJ_TEMPLATES_FLAT) || [];
  const t = templateId ? all.find((x) => x.id === templateId) : null;
  return (t && Array.isArray(t.quantityFields) && t.quantityFields) || [];
}
/** Complète les quantités d'une ligne avec les compteurs de son modèle (sans perdre ce qui est déjà saisi). */
function dailyEnsureQuantities(row) {
  const fields = chantierTemplateFields(row.taskTemplateId);
  const q = Array.isArray(row.quantities) ? row.quantities.slice() : [];
  for (const f of fields) if (!q.some((x) => x.key === f.key)) q.push({ key: f.key, label: (f.label && f.label.fr) || f.key, unit: f.unit || '', qty: 0 });
  row.quantities = q;
  return row;
}
const dailyRows = (kind) => (kind === 'EDIT' ? window._EDIT_TASK_HOURS : (typeof DAILY_TASK_HOURS !== 'undefined' ? DAILY_TASK_HOURS : [])) || [];
function dailyQtyHtml(row, i, kind) {
  dailyEnsureQuantities(row);
  const badge = row.sourceTimesheetId ? '<span style="font-size:10px;color:var(--text3);" title="Reprise d’une feuille de temps validée (app VEM Chantier)">👷 chantier</span>' : '';
  if (!row.quantities.length) return badge ? `<div style="padding:0 4px 4px;">${badge}</div>` : '';
  return `<div class="ch-q" style="padding:0 4px 6px;">${badge}${row.quantities.map((q, k) => `<label>🔢 ${chEsc(q.label)}<input type="number" min="0" step="1" value="${q.qty || ''}" placeholder="0" onchange="dailyQtySet('${kind}',${i},${k},this.value)"></label>`).join('')}</div>`;
}
function dailyQtySet(kind, i, k, v) {
  const row = dailyRows(kind)[i];
  if (row && row.quantities && row.quantities[k]) row.quantities[k].qty = Math.max(0, parseInt(v) || 0);
}
const dailyHasQty = (t) => (t.quantities || []).some((q) => (q.qty || 0) > 0);
/** Ligne envoyée au serveur (quantités et feuille d'origine comprises). */
function dailyRowPayload(t) {
  return {
    taskTemplateId: t.taskTemplateId || undefined, taskTitle: t.taskTitle, hours: t.hours || 0, workers: t.workers || 0,
    ...((t.quantities || []).length ? { quantities: t.quantities } : {}),
    ...(t.sourceTimesheetId ? { sourceTimesheetId: t.sourceTimesheetId } : {}),
  };
}
/** Bloc « Heures par tâche » de la fiche du rapport (lecture). */
function dailyTaskHoursViewHtml(rows) {
  if (!rows || !rows.length) return '';
  const mh = rows.reduce((a, t) => a + (t.hours || 0) * (t.workers || 0), 0);
  return `<div style="margin-bottom:14px;">
    <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">⏱️ Heures par tâche (${chNum(mh)} h-hommes)</div>
    ${rows.map((t) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
      <span>${chEsc(t.taskTitle)}${t.sourceTimesheetId ? ' <span style="font-size:10px;color:var(--text3);">👷 chantier</span>' : ''}${chQtyText(t.quantities) ? `<div style="font-size:12px;color:var(--text2);">🔢 ${chQtyText(t.quantities)}</div>` : ''}</span>
      <span style="white-space:nowrap;color:var(--text2);">${t.workers || 0} × ${chNum(t.hours)} h</span></div>`).join('')}
  </div>`;
}
