// ═══════════════════════════════════════════════════════════════
// VALIDATION DES PLANS PAR LE CLIENT (onglet Fichiers du projet)
// « ✍️ Faire valider » sur un PDF : le client reçoit un lien personnel (sans compte), vérifie les plans, valide /
// valide avec réserves / demande des modifications, signe et confirme avec un code reçu par e-mail. Le PDF validé
// (cachet + filigrane + certificat) arrive dans les Fichiers et part par e-mail à toute l'équipe du projet.
// Serveur : src/routes/planApprovals.ts, src/services/planApprovalService.ts ; page client : public/plan-approval.html
// ═══════════════════════════════════════════════════════════════

const PLAN_APPROVAL_ROLES = ['admin', 'technical_manager', 'sales_engineer'];
const PLAN_APPROVAL_CACHE = {};
const PLAN_APPROVAL_STATUS = {
  pending:    { icon: '⏳', lbl: 'En attente de signature',   cls: 'badge-amber' },
  expired:    { icon: '⌛', lbl: 'Lien expiré',               cls: 'badge-muted' },
  approved:   { icon: '✅', lbl: 'Validé',                    cls: 'badge-green' },
  reserves:   { icon: '🟠', lbl: 'Validé avec réserves',      cls: 'badge-amber' },
  changes:    { icon: '❌', lbl: 'Modifications demandées',   cls: 'badge-red'   },
  cancelled:  { icon: '⏹', lbl: 'Annulée',                   cls: 'badge-muted' },
  superseded: { icon: '↪', lbl: 'Remplacée',                 cls: 'badge-muted' },
};
const PLAN_APPROVAL_EVENTS = {
  created: '🆕 Demande créée', sent: '📨 Lien envoyé', resent: '🔁 Lien renvoyé', opened: '👁 Lien ouvert', viewed: '📄 Plans consultés',
  code_sent: '🔑 Code envoyé', code_failed: '⚠️ Code incorrect', approved: '✅ Plans validés', reserves: '🟠 Validés avec réserves',
  changes: '❌ Modifications demandées', cancelled: '⏹ Annulée', superseded: '↪ Remplacée', stamped: '🖋 PDF validé créé',
  stamp_failed: '⚠️ PDF validé non créé', mailed: '📧 E-mail envoyé', mail_failed: '⚠️ E-mail non envoyé', downloaded: '⬇ PDF validé téléchargé',
};

// petits boutons de la carte (sur ordinateur, .btn-xs n'a pas de taille propre)
(function planApprovalStyles() {
  if (document.getElementById('plan-approval-styles')) return;
  const st = document.createElement('style');
  st.id = 'plan-approval-styles';
  st.textContent = '.pa-scope .btn.btn-xs{padding:3px 8px;font-size:11px;}';
  document.head.appendChild(st);
})();

function canSendPlanApproval() {
  return !!CURRENT_USER && PLAN_APPROVAL_ROLES.includes(CURRENT_USER.role);
}

function planApprovalDay(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Carte de l'onglet Fichiers ───

async function loadPlanApprovalsCard(projectId) {
  const el = document.getElementById('plan-approvals-card');
  if (!el) return;
  const res = await api('GET', `/plan-approvals/project/${projectId}`);
  if (CURRENT_PROJECT_ID && CURRENT_PROJECT_ID !== projectId) return; // on a changé de projet entre-temps
  if (!res?.success) { el.innerHTML = ''; return; }
  PLAN_APPROVAL_CACHE[projectId] = res.data;
  el.innerHTML = renderPlanApprovalsCard(projectId, res.data);
}

function renderPlanApprovalsCard(projectId, d) {
  if (!d.approvals.length && !d.canSend) return '';
  const pending = d.approvals.filter(a => a.status === 'pending');
  const recent = d.approvals.filter(a => !['cancelled', 'superseded'].includes(a.status));
  const old = d.approvals.filter(a => ['cancelled', 'superseded'].includes(a.status));
  return `
    <div class="card pa-scope" style="margin-bottom:16px;">
      <div class="card-header">
        <span class="card-title">✍️ Validation des plans par le client${pending.length ? ` <span class="badge badge-amber" style="margin-left:6px;">${pending.length} en attente</span>` : ''}</span>
        ${d.canSend ? `<button class="btn btn-primary btn-sm" onclick="openPlanApprovalModal('${projectId}')">＋ Envoyer des plans à valider</button>` : ''}
      </div>
      <div class="card-body" style="padding:12px 18px;">
        ${d.canSend && !d.mail ? `<div style="background:rgba(244,162,97,.12);border:1px solid rgba(244,162,97,.35);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--amber);margin-bottom:8px;">⚠️ L'envoi de mails n'est pas configuré sur le serveur : impossible d'envoyer une demande.</div>` : ''}
        ${!d.approvals.length ? `<div style="font-size:13px;color:var(--text2);line-height:1.5;">Choisis un PDF de plans (bouton « ✍️ Faire valider » à côté du fichier, ou ci-dessus) : le client reçoit un lien, vérifie les plans et les signe sans créer de compte. Le PDF validé (cachet + date sur chaque page + certificat) arrive ici dans les Fichiers et part par e-mail à toute l'équipe du projet.</div>` : ''}
        ${recent.map(a => renderPlanApproval(projectId, a, d.canSend)).join('')}
        ${old.length ? `<details style="margin-top:10px;"><summary style="cursor:pointer;font-size:12px;color:var(--text3);">Annulées / remplacées (${old.length})</summary>${old.map(a => renderPlanApproval(projectId, a, d.canSend)).join('')}</details>` : ''}
      </div>
    </div>`;
}

function renderPlanApproval(projectId, a, canSend) {
  const s = PLAN_APPROVAL_STATUS[a.status] || PLAN_APPROVAL_STATUS.pending;
  const decided = ['approved', 'reserves', 'changes'].includes(a.status);
  const who = decided ? [a.signedName, [a.signedTitle, a.signedCompany].filter(Boolean).join(', ')].filter(Boolean) : [];
  const commentTitle = a.status === 'changes' ? 'Modifications demandées' : 'Réserves';
  return `
    <div style="border:1px solid var(--border);border-radius:var(--radius);padding:10px 12px;margin-top:10px;background:var(--bg3);">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;min-width:0;">
          <span class="badge ${s.cls}">${s.icon} ${s.lbl}</span>
          <strong>Rév. ${esc(a.revision)}</strong>
          <span style="font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:320px;" title="${esc(a.fileName)}">📄 ${esc(a.fileName)}</span>
          <span style="color:var(--text3);font-size:12px;">${a.pageCount} p.</span>
        </div>
        <div style="font-size:11px;color:var(--text3);">${esc(a.ref)} · envoyé le ${fmtDateTime(a.createdAt)}${a.createdBy ? ' par ' + esc(a.createdBy) : ''}</div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin:6px 0 2px;">
        Signataire : <strong style="color:var(--text);">${esc(a.signerName)}</strong> · ${esc(a.signerEmail)}${a.ccEmails?.length ? ` · copie : ${esc(a.ccEmails.join(', '))}` : ''}
        ${a.status === 'pending' ? ` · lien valable jusqu'au ${planApprovalDay(a.expiresAt)}` : ''}
      </div>
      ${decided ? `<div style="font-size:12px;color:var(--text2);margin:2px 0;">${s.icon} ${a.status === 'changes' ? 'Demandé' : 'Signé'} le <strong style="color:var(--text);">${fmtDateTime(a.decidedAt)}</strong> par <strong style="color:var(--text);">${esc(who.length > 1 ? `${who[0]} (${who[1]})` : who[0] || '')}</strong>${a.signedIp ? ` · IP ${esc(a.signedIp)}` : ''}</div>` : ''}
      ${a.comment ? `<div style="font-size:12px;white-space:pre-wrap;background:var(--bg2);border-left:3px solid ${a.status === 'changes' ? 'var(--accent)' : 'var(--amber)'};border-radius:6px;padding:6px 10px;margin:6px 0;"><strong>${commentTitle} :</strong> ${esc(a.comment)}</div>` : ''}
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
        ${a.signedFileUrl ? `<button class="btn btn-primary btn-xs" onclick="openFileViewer('${esc(a.signedFileUrl)}','${esc(a.fileName)}')">✅ PDF validé</button>` : ''}
        ${(a.status === 'approved' || a.status === 'reserves') && !a.signedFileUrl && canSend ? `<button class="btn btn-ghost btn-xs" onclick="planApprovalAction('${projectId}','${a.id}','stamp')" title="La création du PDF validé a échoué : la relancer">🖋 Refaire le PDF validé</button>` : ''}
        <button class="btn btn-ghost btn-xs" onclick="openFileViewer('${esc(a.fileUrl)}','${esc(a.fileName)}')" title="Le PDF tel qu'il a été envoyé au client">📄 Plans envoyés</button>
        ${a.status === 'pending' && canSend ? `
          <button class="btn btn-ghost btn-xs" onclick="planApprovalCopyLink('${projectId}','${a.id}')" title="Lien de la page de signature (le client devra quand même confirmer avec le code reçu par e-mail)">🔗 Copier le lien</button>
          <button class="btn btn-ghost btn-xs" onclick="planApprovalAction('${projectId}','${a.id}','resend')" title="Renvoyer l'e-mail (prolonge le lien de 30 jours)">🔁 Renvoyer</button>
          <button class="btn btn-ghost btn-xs" style="color:var(--text3);" onclick="planApprovalAction('${projectId}','${a.id}','cancel')" title="Le lien ne marchera plus">⏹ Annuler</button>` : ''}
        ${a.status === 'expired' && canSend ? `<button class="btn btn-ghost btn-xs" onclick="planApprovalAction('${projectId}','${a.id}','resend')" title="Renvoyer l'e-mail avec un lien de nouveau valable 30 jours">🔁 Renvoyer le lien</button>` : ''}
        ${a.status === 'changes' && canSend ? `<button class="btn btn-ghost btn-xs" onclick="openPlanApprovalModal('${projectId}')" title="Envoyer la version corrigée">＋ Envoyer la nouvelle révision</button>` : ''}
        <button class="btn btn-ghost btn-xs" onclick="planApprovalToggleLog(this)">🕘 Journal (${a.events.length})</button>
      </div>
      <div class="pa-log" style="display:none;margin-top:8px;border-top:1px solid var(--border);padding-top:6px;">
        ${a.events.map(e => `
          <div style="display:flex;gap:10px;font-size:11px;padding:2px 0;">
            <span style="color:var(--text3);white-space:nowrap;font-family:monospace;">${fmtDateTime(e.at)}</span>
            <span>${PLAN_APPROVAL_EVENTS[e.kind] || esc(e.kind)}${e.detail ? ` — ${esc(e.detail)}` : ''}${e.by ? ` · ${esc(e.by)}` : ''}${e.ip ? ` <span style="color:var(--text3);">· IP ${esc(e.ip)}</span>` : ''}</span>
          </div>`).join('')}
        <div style="font-size:10px;color:var(--text3);margin-top:4px;">Empreinte SHA-256 du PDF envoyé : <span style="font-family:monospace;word-break:break-all;">${esc(a.fileSha256)}</span></div>
      </div>
    </div>`;
}

function planApprovalToggleLog(btn) {
  const log = btn.closest('div[style*="border:1px solid"]').querySelector('.pa-log');
  if (log) log.style.display = log.style.display === 'none' ? '' : 'none';
}

function planApprovalCopyLink(projectId, id) {
  const a = PLAN_APPROVAL_CACHE[projectId]?.approvals.find(x => x.id === id);
  if (!a?.link) return;
  if (navigator.clipboard) navigator.clipboard.writeText(a.link).then(() => toast('Lien copié 📋 (le client devra confirmer avec le code reçu par e-mail)', 'success'), () => prompt('Lien de signature :', a.link));
  else prompt('Lien de signature :', a.link);
}

async function planApprovalAction(projectId, id, action) {
  const a = PLAN_APPROVAL_CACHE[projectId]?.approvals.find(x => x.id === id);
  if (action === 'cancel' && !confirm(`Annuler la demande Rév. ${a?.revision || ''} ? Le lien envoyé à ${a?.signerName || 'le client'} ne marchera plus.`)) return;
  const res = await api('POST', `/plan-approvals/${id}/${action}`);
  if (!res?.success) { toast(res?.error || 'Action impossible', 'error'); return; }
  toast(action === 'cancel' ? 'Demande annulée' : action === 'resend' ? 'E-mail renvoyé 📨' : 'PDF validé créé ✅', 'success');
  if (action === 'stamp') loadDetailFiles(projectId); else loadPlanApprovalsCard(projectId);
}

// ─── Envoi ───

async function openPlanApprovalModal(projectId, fileId) {
  projectId = projectId || CURRENT_PROJECT_ID;
  if (!projectId) return;
  if (!canSendPlanApproval()) { toast('Seuls les admins, technical managers et sales peuvent envoyer des plans à valider', 'error'); return; }
  const res = await api('GET', `/plan-approvals/project/${projectId}`);
  if (!res?.success) { toast(res?.error || 'Impossible de charger les demandes', 'error'); return; }
  const d = PLAN_APPROVAL_CACHE[projectId] = res.data;
  if (!d.mail) { toast("L'envoi de mails n'est pas configuré sur le serveur", 'error'); return; }
  if (!d.pdfFiles.length) { toast('Aucun PDF dans les fichiers du projet : ajoute d’abord le PDF des plans', 'error'); return; }
  const first = fileId || (d.pdfFiles.find(f => f.category === 'plans' && !/_VALIDE/.test(f.fileName)) || d.pdfFiles[0]).id;
  const pending = d.approvals.filter(a => a.status === 'pending' || a.status === 'expired');
  const lastSigner = d.approvals[0];
  const contactOpts = d.contacts.map((c, i) => `<option value="c${i}">${esc(c.name)} — ${esc(c.email)}${c.role ? ` (${esc(c.role)})` : ''}</option>`).join('');
  const lastIdx = lastSigner ? d.contacts.findIndex(c => c.email.toLowerCase() === lastSigner.signerEmail.toLowerCase()) : -1;

  const el = document.createElement('div');
  el.className = 'overlay open';
  el.id = 'modal-plan-approval';
  el.innerHTML = `
    <div class="modal" style="max-width:640px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden;">
      <div class="modal-head" style="flex-shrink:0;">
        <div>
          <div class="modal-title">✍️ Envoyer des plans à valider</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">Le client reçoit un lien personnel (sans compte), vérifie les plans, valide ou demande des modifications, et signe avec un code reçu par e-mail.</div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="overflow-y:auto;flex:1;padding-right:4px;">
        <div class="form-group2">
          <label class="form-label2">PDF des plans</label>
          <select class="input" id="pa-file">
            ${d.pdfFiles.map(f => `<option value="${f.id}" ${f.id === first ? 'selected' : ''}>${esc(f.fileName)}${f.category && f.category !== 'general' ? ` · ${esc(f.category)}` : ''} · ${planApprovalDay(f.createdAt)}</option>`).join('')}
          </select>
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Le PDF est figé au moment de l'envoi : le client signe exactement cette version.</div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <div class="form-group2" style="flex:0 0 110px;">
            <label class="form-label2">Révision</label>
            <input class="input" id="pa-rev" maxlength="12" value="${esc(d.nextRevision)}">
          </div>
          <div class="form-group2" style="flex:0 0 160px;">
            <label class="form-label2">Langue</label>
            <select class="input" id="pa-lang"><option value="fr" ${lastSigner?.lang !== 'en' ? 'selected' : ''}>🇫🇷 Français</option><option value="en" ${lastSigner?.lang === 'en' ? 'selected' : ''}>🇬🇧 English</option></select>
          </div>
        </div>
        <div class="form-group2">
          <label class="form-label2">Qui doit signer ?</label>
          <select class="input" id="pa-who">
            ${contactOpts ? `<optgroup label="Contacts du client">${contactOpts}</optgroup>` : ''}
            <option value="other" ${!contactOpts ? 'selected' : ''}>Autre personne…</option>
          </select>
          <div id="pa-other" style="display:${contactOpts ? 'none' : 'flex'};gap:8px;margin-top:6px;flex-wrap:wrap;">
            <input class="input" id="pa-name" placeholder="Nom et prénom" style="flex:1 1 180px;" value="${lastIdx < 0 && lastSigner ? esc(lastSigner.signerName) : ''}">
            <input class="input" id="pa-email" type="email" placeholder="e-mail" style="flex:1 1 220px;" value="${lastIdx < 0 && lastSigner ? esc(lastSigner.signerEmail) : ''}">
          </div>
        </div>
        <div class="form-group2">
          <label class="form-label2">En copie du résultat (facultatif)</label>
          <input class="input" id="pa-cc" placeholder="architecte@exemple.com, autre@client.com">
          <div style="font-size:11px;color:var(--text3);margin-top:4px;">Toute l'équipe du projet reçoit déjà le PDF validé. Ajoute ici d'autres personnes (architecte, autre contact client…).</div>
        </div>
        <div class="form-group2">
          <label class="form-label2">Message (facultatif)</label>
          <textarea class="input" id="pa-msg" rows="3" maxlength="3000" placeholder="Ex. Voici les plans mis à jour après notre réunion : la porte de VBX-02 a été déplacée."></textarea>
        </div>
        ${pending.length ? `
          <div style="background:var(--bg3);border-radius:var(--radius);padding:10px 12px;margin-bottom:10px;">
            <div style="font-size:12px;font-weight:700;margin-bottom:6px;">Demandes encore ouvertes</div>
            ${pending.map(a => `<label style="display:flex;gap:8px;align-items:center;font-size:12px;margin:3px 0;cursor:pointer;"><input type="checkbox" class="pa-replace" value="${a.id}" checked style="accent-color:var(--accent);"> Remplacer la Rév. ${esc(a.revision)} envoyée à ${esc(a.signerName)} (son lien ne marchera plus)</label>`).join('')}
          </div>` : ''}
        <div style="font-size:12px;color:var(--text2);line-height:1.5;">🔒 Lien valable 30 jours. Pour signer, le client reçoit un code à 6 chiffres sur son adresse e-mail. Validé ⇒ cachet « PLANS VALIDÉS » + date + signature sur chaque page, filigrane, page « Certificat de validation », rangé dans les Fichiers et envoyé à toute l'équipe du projet + au client.</div>
      </div>
      <div style="flex-shrink:0;border-top:1px solid var(--border);padding-top:10px;margin-top:8px;display:flex;justify-content:flex-end;gap:8px;">
        <button class="btn btn-ghost" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" id="pa-send">📨 Envoyer</button>
      </div>
    </div>`;
  document.body.appendChild(el);

  const who = el.querySelector('#pa-who');
  if (lastIdx >= 0) who.value = 'c' + lastIdx;
  const sync = () => { el.querySelector('#pa-other').style.display = who.value === 'other' ? 'flex' : 'none'; };
  who.addEventListener('change', sync);
  sync();

  el.querySelector('#pa-send').addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    let signerName, signerEmail;
    if (who.value === 'other') {
      signerName = el.querySelector('#pa-name').value.trim();
      signerEmail = el.querySelector('#pa-email').value.trim();
    } else {
      const c = d.contacts[Number(who.value.slice(1))];
      signerName = c?.name; signerEmail = c?.email;
    }
    if (!signerName || !signerEmail || !/^\S+@\S+\.\S+$/.test(signerEmail)) { toast('Indique le nom et l’e-mail du signataire', 'error'); return; }
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> Envoi…';
    const r = await api('POST', `/plan-approvals/project/${projectId}`, {
      fileId: el.querySelector('#pa-file').value,
      revision: el.querySelector('#pa-rev').value.trim(),
      lang: el.querySelector('#pa-lang').value,
      signerName, signerEmail,
      ccEmails: el.querySelector('#pa-cc').value,
      message: el.querySelector('#pa-msg').value.trim(),
      replaceIds: Array.from(el.querySelectorAll('.pa-replace:checked')).map(x => x.value),
    });
    btn.disabled = false;
    btn.innerHTML = '📨 Envoyer';
    if (!r?.success) { toast(r?.error || 'Envoi impossible', 'error'); return; }
    el.remove();
    if (r.data.mailError) toast(`Demande créée mais e-mail non envoyé : ${r.data.mailError}. Utilise « 🔁 Renvoyer » ou « 🔗 Copier le lien ».`, 'error');
    else toast(`Plans envoyés à ${signerName} pour validation 📨`, 'success');
    loadPlanApprovalsCard(projectId);
  });
}
