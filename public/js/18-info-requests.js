// ═══════════════════════════════════════════════════════════════
// DEMANDES D'INFOS PAR MAIL (onglet Infos du projet + bouton « 📨 Demander des infos » de l'en-tête)
// On choisit les infos qui manquent et à qui les demander ; la personne répond au mail (ou en ligne) et le
// projet se remplit tout seul, avec des rappels tant que ce n'est pas répondu.
// Serveur : src/routes/infoRequests.ts / src/services/infoRequestService.ts
// Spec : docs/info-requests/PROMPT_Demandes_Infos_Mail.md
// ═══════════════════════════════════════════════════════════════

const INFO_REQ_ROLES = ['admin', 'project_manager', 'technical_manager', 'engineer', 'sales_engineer', 'warehouse', 'site_manager'];
const INFO_REQ_CACHE = {};
const INFO_REQ_GROUPS = ['site', 'dates', 'team', 'logistics', 'notes'];
const INFO_REQ_STATUS = {
  pending:  { icon: '⏳', lbl: 'En attente',        cls: 'badge-amber' },
  answered: { icon: '✅', lbl: 'Reçu',              cls: 'badge-green' },
  received: { icon: '📥', lbl: 'Reçu — à vérifier', cls: 'badge-blue'  },
  filled:   { icon: '✏️', lbl: 'Rempli dans VEM',   cls: 'badge-green' },
  stopped:  { icon: '⏹', lbl: 'Arrêté',             cls: 'badge-muted' },
};
const INFO_REQ_SOURCE = { email: 'par mail', 'email-ai': 'par mail (lu par IA)', web: 'en ligne', app: 'dans VEM', manual: 'marqué à la main' };
const INFO_REQ_HISTORY_ICON = { sent: '📨', reminder: '🔔', reply: '💬', filled: '✏️', done: '✅', stopped: '⏹', resumed: '▶', plan: '⚙', manual: '✔', error: '⚠️', bounce: '⚠️', auto: '🤖', max: '⏳', overdue: '⚠️', files: '📎' };

// petits boutons de la carte (sur ordinateur, .btn-xs n'a pas de taille propre)
(function infoReqStyles() {
  if (document.getElementById('info-req-styles')) return;
  const st = document.createElement('style');
  st.id = 'info-req-styles';
  st.textContent = '.ir-scope .btn.btn-xs{padding:3px 8px;font-size:11px;}';
  document.head.appendChild(st);
})();

function canUseInfoRequests() {
  return !!CURRENT_USER && INFO_REQ_ROLES.includes(CURRENT_USER.role);
}

function infoReqDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function infoReqPlanLabel(plan) {
  if (!plan || plan.mode === 'none') return 'Aucun rappel';
  if (plan.mode === 'urgency') return "Rappels selon l'urgence";
  const h = Number(plan.intervalHours);
  const map = { 6: '2 rappels par jour', 24: 'Rappel tous les jours', 48: 'Rappel tous les 2 jours', 168: 'Rappel toutes les semaines' };
  if (map[h]) return map[h];
  return h % 24 === 0 ? `Rappel tous les ${h / 24} jours` : `Rappel toutes les ${h} h`;
}

// ─── Carte de l'onglet Infos ───

async function loadInfoRequestsCard(projectId) {
  const el = document.getElementById('detail-info-requests-card');
  const headerBtn = document.getElementById('detail-info-req-btn');
  if (headerBtn) headerBtn.style.display = canUseInfoRequests() ? '' : 'none';
  if (!el) return;
  if (!canUseInfoRequests()) { el.innerHTML = ''; return; }
  const res = await api('GET', `/info-requests/project/${projectId}`);
  if (CURRENT_PROJECT_ID && CURRENT_PROJECT_ID !== projectId) return; // on a changé de projet entre-temps
  if (!res?.success) { el.innerHTML = ''; return; }
  INFO_REQ_CACHE[projectId] = res.data;
  el.innerHTML = renderInfoRequestsCard(projectId, res.data);
}

function renderInfoRequestsCard(projectId, d) {
  const open = d.requests.filter(r => r.status === 'open');
  const closed = d.requests.filter(r => r.status !== 'open');
  const pendingCount = open.reduce((n, r) => n + r.items.filter(i => i.status === 'pending').length, 0);
  const warn = !d.status.mail
    ? "⚠️ L'envoi de mails n'est pas configuré sur le serveur : impossible d'envoyer une demande."
    : !d.status.imap
      ? "⚠️ La lecture des réponses par mail n'est pas configurée (IMAP) : seules les réponses « en ligne » arrivent dans VEM."
      : '';
  return `
    <div class="card ir-scope" style="margin-bottom:14px;">
      <div class="card-header">
        <span class="card-title">📨 Demandes d'infos${pendingCount ? ` <span class="badge badge-amber" style="margin-left:6px;">${pendingCount} en attente</span>` : ''}</span>
        <button class="btn btn-primary btn-sm" onclick="openInfoRequestModal('${projectId}')">＋ Demander des infos</button>
      </div>
      <div class="card-body" style="padding:12px 18px;">
        ${warn ? `<div style="background:rgba(244,162,97,.12);border:1px solid rgba(244,162,97,.35);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--amber);margin-bottom:8px;">${warn}</div>` : ''}
        ${!d.requests.length ? `<div style="font-size:13px;color:var(--text2);line-height:1.5;">Il manque une info (adresse, dates, équipe, camions…) ? Envoie les questions à la bonne personne : elle répond au mail et le projet se remplit tout seul, avec des rappels tant que ce n'est pas répondu.</div>` : ''}
        ${open.map(renderInfoRequest).join('')}
        ${closed.length ? `<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:12px;color:var(--text3);">Terminées / arrêtées (${closed.length})</summary>${closed.map(renderInfoRequest).join('')}</details>` : ''}
      </div>
    </div>`;
}

function renderInfoRequest(r) {
  const st = {
    open:    '<span class="badge badge-amber">⏳ En cours</span>',
    done:    '<span class="badge badge-green">✅ Complète</span>',
    stopped: '<span class="badge badge-muted">⏹ Arrêtée</span>',
  }[r.status] || '';
  const next = r.status === 'open'
    ? (r.nextReminderAt ? ` · prochain rappel le ${fmtDateTime(r.nextReminderAt)}` : ' · aucun rappel prévu')
    : '';
  return `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-top:10px;background:var(--bg3);">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <strong>${esc(r.recipientName || r.recipientEmail)}</strong>
          <span style="color:var(--text3);font-size:12px;">${esc(r.recipientEmail)}</span>
          ${st}
        </div>
        <div style="font-size:11px;color:var(--text3);">${esc(r.ref)} · envoyé le ${fmtDateTime(r.createdAt)}${r.createdBy ? ' par ' + esc(r.createdBy) : ''}</div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin:4px 0 6px;">🔔 ${esc(infoReqPlanLabel(r.plan))} · ${r.remindersSent} rappel${r.remindersSent > 1 ? 's' : ''} envoyé${r.remindersSent > 1 ? 's' : ''}${next}</div>
      <div>${r.items.map(i => renderInfoRequestItem(r, i)).join('')}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
        ${r.status === 'open' ? `
          <button class="btn btn-ghost btn-xs" onclick="infoReqRemind('${r.id}')" title="Renvoyer tout de suite les questions encore en attente">🔁 Rappeler maintenant</button>
          <button class="btn btn-ghost btn-xs" onclick="infoReqEditPlan('${r.id}')" title="Changer le rythme des rappels">⚙ Rythme des rappels</button>
          <button class="btn btn-ghost btn-xs" onclick="infoReqSetStatus('${r.id}','stopped')" title="Plus aucun rappel pour cette demande">⏹ Arrêter</button>` : ''}
        ${r.status === 'stopped' ? `<button class="btn btn-ghost btn-xs" onclick="infoReqSetStatus('${r.id}','open')">▶ Reprendre</button>` : ''}
        <button class="btn btn-ghost btn-xs" onclick="infoReqHistory('${r.id}')">📜 Historique</button>
        <button class="btn btn-ghost btn-xs" onclick="infoReqCopyLink('${r.id}')" title="Lien de la page « Répondre en ligne » (à envoyer par WhatsApp par exemple)">🔗 Lien de réponse</button>
        <button class="btn btn-ghost btn-xs" style="color:var(--text3);" onclick="infoReqDelete('${r.id}')" title="Supprimer la demande et son historique">🗑</button>
      </div>
    </div>`;
}

function renderInfoRequestItem(r, i) {
  const s = INFO_REQ_STATUS[i.status] || INFO_REQ_STATUS.pending;
  const parts = [];
  if (i.status === 'pending') {
    if (i.neededBy) parts.push(`pour le ${infoReqDay(i.neededBy)}`);
    if (i.note) parts.push(esc(i.note));
  } else {
    if (i.answer && i.status !== 'filled') parts.push(`<span style="color:var(--text);">${esc(i.answer)}</span>`);
    if (i.source && INFO_REQ_SOURCE[i.source]) parts.push(INFO_REQ_SOURCE[i.source] + (i.answeredAt ? ' le ' + fmtDateTime(i.answeredAt) : ''));
    if (i.note) parts.push(esc(i.note));
  }
  let actions = '';
  if (i.status === 'pending') {
    actions = `
      <button class="btn btn-ghost btn-xs" onclick="infoReqItem('${i.id}','done')" title="J'ai eu l'info autrement : plus de rappel pour cette question">✔ Reçu</button>
      <button class="btn btn-ghost btn-xs" onclick="infoReqItem('${i.id}','stop')" title="Ne plus demander cette info">⏹</button>`;
  } else if (i.status === 'stopped' || i.status === 'received') {
    actions = `<button class="btn btn-ghost btn-xs" onclick="infoReqItem('${i.id}','resume')" title="Redemander cette info">↻ Redemander</button>`;
  }
  return `
    <div style="display:flex;gap:8px;align-items:flex-start;font-size:13px;padding:6px 0;border-top:1px dashed var(--border);">
      <span style="color:var(--accent);font-weight:700;min-width:28px;">Q${i.number}</span>
      <div style="flex:1;min-width:0;">
        <div>${esc(i.label)} <span class="badge ${s.cls}" style="font-size:10px;margin-left:4px;">${s.icon} ${s.lbl}</span></div>
        ${parts.length ? `<div style="font-size:12px;color:var(--text2);white-space:pre-wrap;word-break:break-word;margin-top:2px;">${parts.join(' · ')}</div>` : ''}
      </div>
      <div style="display:flex;gap:4px;flex-shrink:0;">${actions}</div>
    </div>`;
}

function infoReqFind(id) {
  const d = INFO_REQ_CACHE[CURRENT_PROJECT_ID];
  return d ? d.requests.find(r => r.id === id) : null;
}

async function infoReqCall(method, path, body, okMsg) {
  const res = await api(method, path, body);
  if (res?.success) {
    if (okMsg) toast(okMsg, 'success');
    if (CURRENT_PROJECT_ID) {
      loadInfoRequestsCard(CURRENT_PROJECT_ID);
      // une question « marquée reçue » ou redemandée ne change pas le projet ; un arrêt non plus
    }
  } else {
    toast(res?.error || 'Erreur', 'error');
  }
  return res;
}

async function infoReqRemind(id) {
  const r = infoReqFind(id);
  if (!confirm(`Envoyer tout de suite un rappel à ${r?.recipientName || r?.recipientEmail || 'cette personne'} ?`)) return;
  await infoReqCall('POST', `/info-requests/${id}/remind`, {}, '🔔 Rappel envoyé');
}
async function infoReqSetStatus(id, status) {
  if (status === 'stopped' && !confirm('Arrêter cette demande ? Plus aucun rappel ne sera envoyé (une réponse arrivée après ne sera pas appliquée).')) return;
  await infoReqCall('PATCH', `/info-requests/${id}`, { status }, status === 'stopped' ? '⏹ Demande arrêtée' : '▶ Demande reprise');
}
async function infoReqItem(itemId, action) {
  const msg = { done: '✔ Marquée reçue', stop: '⏹ Question arrêtée', resume: '↻ Question redemandée' }[action];
  await infoReqCall('PATCH', `/info-requests/items/${itemId}`, { action }, msg);
}
async function infoReqDelete(id) {
  if (!confirm('Supprimer cette demande et son historique ? (Les infos déjà remplies dans le projet restent.)')) return;
  await infoReqCall('DELETE', `/info-requests/${id}`, null, '🗑 Demande supprimée');
}
function infoReqCopyLink(id) {
  const r = infoReqFind(id);
  if (!r) return;
  const done = () => toast('🔗 Lien copié : la personne peut répondre en ligne', 'success');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(r.webUrl).then(done).catch(() => prompt('Lien de réponse :', r.webUrl));
  else prompt('Lien de réponse :', r.webUrl);
}

function infoReqHistory(id) {
  const r = infoReqFind(id);
  if (!r) return;
  const rows = [...(r.history || [])].reverse().map(h => `
    <div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
      <span style="flex-shrink:0;">${INFO_REQ_HISTORY_ICON[h.kind] || '•'}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;color:var(--text3);">${fmtDateTime(h.at)}${h.by ? ' · ' + esc(h.by) : ''}</div>
        <div style="white-space:pre-wrap;word-break:break-word;">${esc(h.text)}</div>
      </div>
    </div>`).join('');
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:640px;max-height:88vh;display:flex;flex-direction:column;">
      <div class="modal-head"><div class="modal-title">📜 Historique — ${esc(r.recipientName || r.recipientEmail)} · ${esc(r.ref)}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div style="overflow-y:auto;">${rows || '<div style="color:var(--text3);font-size:13px;">Rien pour le moment.</div>'}</div>
    </div>`;
  document.body.appendChild(el);
}

// ─── Rythme des rappels (fenêtre d'envoi et réglage d'une demande existante) ───

function infoReqPlanControls(plan) {
  const p = plan || { mode: 'urgency', intervalHours: 24, firstAfterHours: 24, skipWeekends: true, maxReminders: 20 };
  const preset = p.mode === 'urgency' ? 'urgency' : p.mode === 'none' ? 'none'
    : ([6, 24, 48, 168].includes(Number(p.intervalHours)) ? String(p.intervalHours) : 'custom');
  const opt = (v, l) => `<option value="${v}" ${preset === v ? 'selected' : ''}>${l}</option>`;
  return `
    <div class="ir-plan" style="display:flex;flex-direction:column;gap:10px;">
      <div>
        <select class="input ir-mode" onchange="infoReqPlanToggle(this)">
          ${opt('urgency', "Selon l'urgence (recommandé)")}
          ${opt('6', '2 fois par jour')}
          ${opt('24', 'Tous les jours')}
          ${opt('48', 'Tous les 2 jours')}
          ${opt('168', 'Toutes les semaines')}
          ${opt('custom', 'Personnalisé…')}
          ${opt('none', 'Aucun rappel')}
        </select>
        <div class="ir-mode-help" style="font-size:12px;color:var(--text3);margin-top:5px;line-height:1.45;">${infoReqModeHelp(preset)}</div>
      </div>
      <div class="ir-custom" style="display:${preset === 'custom' ? 'flex' : 'none'};align-items:center;gap:8px;font-size:13px;">
        Toutes les <input class="input ir-custom-h" type="number" min="2" max="720" value="${preset === 'custom' ? Number(p.intervalHours) : 72}" style="width:90px;"> heures
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;font-size:13px;">
        <label style="display:flex;align-items:center;gap:6px;">Premier rappel si pas de réponse après
          <select class="input ir-first" style="width:auto;">
            ${[12, 24, 48].map(h => `<option value="${h}" ${Number(p.firstAfterHours) === h ? 'selected' : ''}>${h} h</option>`).join('')}
          </select>
        </label>
        <label style="display:flex;align-items:center;gap:6px;">Au plus <input class="input ir-max" type="number" min="1" max="100" value="${Number(p.maxReminders) || 20}" style="width:70px;"> rappels</label>
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;"><input type="checkbox" class="ir-weekend" ${p.skipWeekends !== false ? 'checked' : ''}> Pas de rappel le week-end (rappels envoyés entre 8 h et 18 h)</label>
    </div>`;
}

function infoReqModeHelp(mode) {
  if (mode === 'urgency') return "Suit la date « pour le » la plus proche des questions encore en attente : 1 rappel par semaine, puis 1 par jour à partir de 7 jours avant, puis 2 par jour à partir de 2 jours avant (et en retard).";
  if (mode === 'none') return "Un seul mail, pas de relance automatique (tu peux toujours relancer à la main).";
  if (mode === 'custom') return 'Un rappel toutes les N heures tant que ce n’est pas répondu.';
  return 'Un rappel à ce rythme tant que ce n’est pas répondu.';
}

function infoReqPlanToggle(sel) {
  const root = sel.closest('.ir-plan');
  root.querySelector('.ir-custom').style.display = sel.value === 'custom' ? 'flex' : 'none';
  root.querySelector('.ir-mode-help').textContent = infoReqModeHelp(sel.value);
}

function infoReqPlanRead(root) {
  const mode = root.querySelector('.ir-mode').value;
  const plan = {
    mode: mode === 'urgency' ? 'urgency' : mode === 'none' ? 'none' : 'fixed',
    intervalHours: mode === 'custom' ? Math.max(2, Number(root.querySelector('.ir-custom-h').value) || 72) : (Number(mode) || 24),
    firstAfterHours: Number(root.querySelector('.ir-first').value) || 24,
    skipWeekends: root.querySelector('.ir-weekend').checked,
    maxReminders: Math.min(100, Math.max(1, Number(root.querySelector('.ir-max').value) || 20)),
  };
  return plan;
}

function infoReqEditPlan(id) {
  const r = infoReqFind(id);
  if (!r) return;
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-head"><div class="modal-title">⚙ Rythme des rappels — ${esc(r.recipientName || r.recipientEmail)}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      ${infoReqPlanControls(r.plan)}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
        <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" data-act="save">💾 Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('[data-act=save]').onclick = async () => {
    const res = await infoReqCall('PATCH', `/info-requests/${id}`, { plan: infoReqPlanRead(el) }, '⚙ Rythme enregistré');
    if (res?.success) el.remove();
  };
}

// ─── Fenêtre « Demander des infos » ───

function infoReqRemembered() {
  try { return JSON.parse(localStorage.getItem('vem_info_req_recipients') || '{}') || {}; } catch { return {}; }
}
function infoReqRemember(map) {
  try { localStorage.setItem('vem_info_req_recipients', JSON.stringify({ ...infoReqRemembered(), ...map })); } catch { /* stockage indisponible */ }
}

function infoReqRecipientOptions(d, selected) {
  const people = d.people.map(p => `<option value="u:${esc(p.id)}" ${selected === 'u:' + p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  const contacts = d.contacts.map(c => {
    const v = `e:${c.email}|${c.name}`;
    return `<option value="${esc(v)}" ${selected === v ? 'selected' : ''}>${esc(c.name)}${c.role ? ' — ' + esc(c.role) : ''}</option>`;
  }).join('');
  // destinataire retenu qui n'est plus dans les listes (adresse saisie une autre fois)
  let extra = '';
  if (selected && selected.startsWith('e:') && !d.contacts.some(c => `e:${c.email}|${c.name}` === selected)) {
    const [email, name] = selected.slice(2).split('|');
    extra = `<option value="${esc(selected)}" selected>${esc(name || email)} (${esc(email)})</option>`;
  }
  return `
    <option value="">— À qui ? —</option>
    <optgroup label="Équipe VEM">${people}</optgroup>
    ${contacts ? `<optgroup label="Client">${contacts}</optgroup>` : ''}
    ${extra ? `<optgroup label="Déjà utilisé">${extra}</optgroup>` : ''}
    <option value="other">✉️ Autre adresse e-mail…</option>`;
}

function infoReqRowHtml(d, f, remembered, opts = {}) {
  const sel = remembered[f.key] || '';
  const custom = f.key === 'custom';
  const checked = opts.checked ?? (f.missing && !f.pendingWith.length);
  const sub = custom ? '' : [
    f.current ? `Actuellement : ${esc(f.current)}` : 'Vide dans VEM',
    f.pendingWith.length ? `⏳ déjà demandé à ${esc(f.pendingWith.join(', '))}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <div class="ir-row" data-field="${f.key}" style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;padding:8px 0;border-top:1px solid var(--border);">
      <label style="display:flex;gap:8px;align-items:flex-start;flex:1 1 220px;min-width:200px;cursor:pointer;">
        <input type="checkbox" class="ir-check" ${checked ? 'checked' : ''} style="margin-top:3px;">
        <span style="flex:1;min-width:0;">
          ${custom
            ? `<input class="input ir-question" placeholder="Ta question… (ex. Faut-il un badge pour entrer ?)" maxlength="500" value="${esc(opts.question || '')}">`
            : `<strong style="font-size:13px;">${esc(f.label)}</strong>`}
          ${sub ? `<span style="display:block;font-size:11px;color:var(--text3);margin-top:2px;">${sub}</span>` : ''}
        </span>
      </label>
      <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        <select class="input ir-recipient" style="width:200px;">${infoReqRecipientOptions(d, sel)}</select>
        <input class="input ir-email" type="email" placeholder="adresse e-mail" style="display:none;width:200px;">
        <input class="input ir-name" placeholder="nom (facultatif)" style="display:none;width:150px;">
        <label style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text3);" title="Date à laquelle tu as besoin de l'info : règle l'urgence des rappels">
          pour le <input class="input ir-needed" type="date" value="${toLocalDateInput(f.defaultNeededBy)}" style="width:145px;padding:6px 8px;">
        </label>
        ${custom ? `<button class="btn btn-ghost btn-xs" onclick="this.closest('.ir-row').remove();infoReqSummary(this.closest('.overlay'))" title="Retirer cette question">✕</button>` : ''}
      </div>
    </div>`;
}

async function openInfoRequestModal(projectId) {
  projectId = projectId || CURRENT_PROJECT_ID;
  if (!projectId) return;
  if (!canUseInfoRequests()) { toast("Ton rôle ne permet pas d'envoyer des demandes d'infos", 'error'); return; }
  let d = INFO_REQ_CACHE[projectId];
  if (!d) {
    const res = await api('GET', `/info-requests/project/${projectId}`);
    if (!res?.success) { toast(res?.error || 'Impossible de charger les demandes', 'error'); return; }
    d = INFO_REQ_CACHE[projectId] = res.data;
  }
  if (!d.status.mail) { toast("L'envoi de mails n'est pas configuré sur le serveur", 'error'); return; }
  const remembered = infoReqRemembered();
  const byGroup = {};
  for (const f of d.fields) (byGroup[f.group] = byGroup[f.group] || []).push(f);
  const customField = d.fields.find(f => f.key === 'custom');

  const el = document.createElement('div');
  el.className = 'overlay open ir-scope';
  el.id = 'modal-info-request';
  el.innerHTML = `
    <div class="modal" style="max-width:920px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
      <div class="modal-head" style="flex-shrink:0;">
        <div>
          <div class="modal-title">📨 Demander des infos</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">Coche ce qui manque et choisis à qui le demander : chacun reçoit un mail avec ses questions, répond au mail, et le projet se remplit tout seul.</div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="overflow-y:auto;flex:1;padding-right:4px;">
        ${!d.status.imap ? `<div style="background:rgba(244,162,97,.12);border:1px solid rgba(244,162,97,.35);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--amber);margin-bottom:10px;">⚠️ La lecture des réponses par mail n'est pas configurée (IMAP) : les personnes devront répondre avec le bouton « Répondre en ligne » du mail.</div>` : ''}
        ${INFO_REQ_GROUPS.filter(g => byGroup[g]).map(g => `
          <div style="margin-bottom:12px;">
            <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px;">${esc(byGroup[g][0].groupLabel)}</div>
            ${byGroup[g].map(f => infoReqRowHtml(d, f, remembered)).join('')}
          </div>`).join('')}
        <div style="margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px;">❓ Questions libres</div>
          <div class="ir-custom-list"></div>
          <button class="btn btn-ghost btn-sm" data-act="add-custom" style="margin-top:6px;">＋ Ajouter une question</button>
        </div>
        <div style="background:var(--bg3);border-radius:var(--radius);padding:12px 14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">🔔 Rappels tant que ce n'est pas répondu</div>
          ${infoReqPlanControls(null)}
          <div style="font-size:11px;color:var(--text3);margin-top:8px;">Les rappels s'arrêtent tout seuls quand la personne répond, ou quand l'info est remplie à la main dans VEM.</div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
          <div class="form-group2" style="margin:0;flex:0 0 170px;">
            <label class="form-label2">Langue du mail</label>
            <select class="input" id="ir-lang"><option value="fr">🇫🇷 Français</option><option value="en">🇬🇧 English</option></select>
          </div>
          <div class="form-group2" style="margin:0;flex:1 1 300px;">
            <label class="form-label2">Message perso (facultatif)</label>
            <textarea class="input" id="ir-message" rows="2" maxlength="2000" placeholder="Ex. Salut Norick, j'ai besoin de ça pour bloquer l'équipe 🙏"></textarea>
          </div>
        </div>
      </div>
      <div style="flex-shrink:0;border-top:1px solid var(--border);padding-top:10px;margin-top:6px;">
        <div id="ir-summary" style="font-size:12px;color:var(--text2);margin-bottom:8px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">Annuler</button>
          <button class="btn btn-outline" data-act="preview">👁 Aperçu du mail</button>
          <button class="btn btn-primary" data-act="send">📨 Envoyer</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);

  const syncRow = (row) => {
    const sel = row.querySelector('.ir-recipient');
    const other = sel.value === 'other';
    row.querySelector('.ir-email').style.display = other ? '' : 'none';
    row.querySelector('.ir-name').style.display = other ? '' : 'none';
  };
  el.querySelectorAll('.ir-row').forEach(syncRow);
  el.addEventListener('change', e => {
    const row = e.target.closest('.ir-row');
    if (row && e.target.classList.contains('ir-recipient')) {
      syncRow(row);
      if (e.target.value) row.querySelector('.ir-check').checked = true;
      if (e.target.value === 'other') row.querySelector('.ir-email').focus();
    }
    infoReqSummary(el);
  });
  el.addEventListener('input', e => {
    const row = e.target.closest('.ir-row');
    if (row && e.target.classList.contains('ir-question') && e.target.value.trim()) row.querySelector('.ir-check').checked = true;
    if (e.target.classList.contains('ir-email') || e.target.classList.contains('ir-name') || e.target.classList.contains('ir-question')) infoReqSummary(el);
  });
  el.querySelector('[data-act=add-custom]').onclick = () => {
    const list = el.querySelector('.ir-custom-list');
    list.insertAdjacentHTML('beforeend', infoReqRowHtml(d, customField, remembered, { checked: true }));
    const row = list.lastElementChild;
    syncRow(row);
    row.querySelector('.ir-question').focus();
    infoReqSummary(el);
  };
  el.querySelector('[data-act=preview]').onclick = () => infoReqPreview(el, projectId);
  el.querySelector('[data-act=send]').onclick = (e) => infoReqSend(el, projectId, e.target);
  infoReqSummary(el);
}

function infoReqCollect(el) {
  const items = [], errors = [];
  el.querySelectorAll('.ir-row').forEach(row => {
    if (!row.querySelector('.ir-check').checked) return;
    const field = row.dataset.field;
    const qEl = row.querySelector('.ir-question');
    const question = qEl ? qEl.value.trim() : '';
    if (field === 'custom' && !question) return;
    const label = field === 'custom' ? question : row.querySelector('strong')?.textContent || field;
    const sel = row.querySelector('.ir-recipient').value;
    let recipient = null, who = '';
    if (sel.startsWith('u:')) {
      recipient = { userId: sel.slice(2) };
      who = row.querySelector('.ir-recipient').selectedOptions[0]?.textContent || '';
    } else if (sel.startsWith('e:')) {
      const [email, name] = sel.slice(2).split('|');
      recipient = { email, name };
      who = name || email;
    } else if (sel === 'other') {
      const email = row.querySelector('.ir-email').value.trim();
      const name = row.querySelector('.ir-name').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) errors.push(`Adresse e-mail à vérifier pour « ${label} »`);
      recipient = { email, name };
      who = name || email;
    } else {
      errors.push(`Choisis à qui demander « ${label} »`);
    }
    const nd = row.querySelector('.ir-needed')?.value;
    items.push({ field, question: question || null, recipient, neededBy: nd ? fromLocalDateInput(nd) : null, _who: who, _sel: sel === 'other' ? `e:${recipient?.email || ''}|${recipient?.name || ''}` : sel });
  });
  const plan = infoReqPlanRead(el.querySelector('.ir-plan'));
  const body = {
    lang: el.querySelector('#ir-lang').value,
    message: el.querySelector('#ir-message').value.trim() || null,
    plan,
    items: items.map(({ _who, _sel, ...rest }) => rest),
  };
  return { body, items, errors };
}

function infoReqSummary(el) {
  const box = el.querySelector('#ir-summary');
  if (!box) return;
  const { items } = infoReqCollect(el);
  if (!items.length) { box.innerHTML = 'Coche au moins une info à demander.'; return; }
  const by = {};
  for (const it of items) { const k = it._who || 'destinataire à choisir'; by[k] = (by[k] || 0) + 1; }
  box.innerHTML = '📨 ' + Object.entries(by).map(([w, n]) => `<strong>${esc(w)}</strong> recevra ${n} question${n > 1 ? 's' : ''}`).join(' · ');
}

async function infoReqPreview(el, projectId) {
  const { body, errors } = infoReqCollect(el);
  if (!body.items.length) { toast('Coche au moins une info à demander', 'error'); return; }
  if (errors.length) { toast(errors[0], 'error'); return; }
  const res = await api('POST', `/info-requests/project/${projectId}/preview`, body);
  if (!res?.success) { toast(res?.error || 'Aperçu impossible', 'error'); return; }
  const p = res.data;
  const sched = p.schedule.length
    ? p.schedule.slice(0, 8).map(s => new Date(s).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })).join(' · ') + (p.schedule.length > 8 ? ' …' : '')
    : 'aucun rappel';
  const ov = document.createElement('div');
  ov.className = 'overlay open';
  ov.style.zIndex = '100001';
  ov.innerHTML = `
    <div class="modal" style="max-width:760px;max-height:94vh;display:flex;flex-direction:column;">
      <div class="modal-head"><div class="modal-title">👁 Aperçu — ${esc(p.recipients[0]?.name || '')}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px;"><strong>Sujet :</strong> ${esc(p.subject)}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px;"><strong>Rappels si pas de réponse :</strong> ${esc(sched)}</div>
      ${p.recipients.length > 1 ? `<div style="font-size:12px;color:var(--text3);margin-bottom:8px;">Un mail par personne : ${p.recipients.map(r => `${esc(r.name)} (${r.count})`).join(' · ')}</div>` : ''}
      <iframe style="flex:1;min-height:420px;width:100%;border:1px solid var(--border);border-radius:8px;background:#fff;" sandbox=""></iframe>
    </div>`;
  document.body.appendChild(ov);
  ov.querySelector('iframe').srcdoc = p.html;
}

async function infoReqSend(el, projectId, btn) {
  const { body, items, errors } = infoReqCollect(el);
  if (!body.items.length) { toast('Coche au moins une info à demander', 'error'); return; }
  if (errors.length) { toast(errors[0], 'error'); return; }
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = 'Envoi…';
  const res = await api('POST', `/info-requests/project/${projectId}`, body);
  btn.disabled = false;
  btn.textContent = old;
  if (!res?.success) { toast(res?.error || "Mails pas envoyés", 'error'); return; }
  const remember = {};
  for (const it of items) if (it.field !== 'custom' && it._sel) remember[it.field] = it._sel;
  infoReqRemember(remember);
  const n = res.data.created.length;
  toast(`📨 ${n} mail${n > 1 ? 's' : ''} envoyé${n > 1 ? 's' : ''}`, 'success');
  for (const e of res.data.errors || []) toast(`⚠️ ${e.recipient} : ${e.error}`, 'error');
  el.remove();
  loadInfoRequestsCard(projectId);
}
