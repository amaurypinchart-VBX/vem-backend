async function editHandoverInfo(id, clientName, clientEmail, notes, projectId) {
  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head"><div class="modal-title">✏️ Modifier Handover</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div class="form-group2"><label class="form-label2">Nom client</label><input class="input" id="eh-client" value="${clientName}"></div>
      <div class="form-group2"><label class="form-label2">Email client</label><input class="input" type="email" id="eh-email" value="${clientEmail}"></div>
      <div class="form-group2"><label class="form-label2">Notes générales</label><textarea class="input" id="eh-notes" rows="4">${notes}</textarea></div>
      <div style="display:flex;justify-content:space-between;margin-top:12px;">
        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteHandover('${id}');this.closest('.overlay').remove()">🗑️ Supprimer</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
          <button class="btn btn-primary" onclick="saveHandoverInfo('${id}','${projectId}',this.closest('.overlay'))">💾 Sauvegarder</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

async function saveHandoverInfo(id, projectId, overlay) {
  const res = await api('PATCH', `/handover/${id}`, {
    clientName: document.getElementById('eh-client')?.value||undefined,
    clientEmail: document.getElementById('eh-email')?.value||undefined,
    generalNotes: document.getElementById('eh-notes')?.value||undefined,
  });
  if (res?.success) { toast('Handover mis à jour ✅','success'); overlay?.remove(); loadDetailHandovers(projectId); }
  else toast('Erreur mise à jour','error');
}

// État global des photos en attente pour le formulaire d'ajout de point de visite
let PENDING_POINT_PHOTOS = [];

// ═══════════════════════════════════════════
// VISITES CLIENT — Niveau 1 : LISTE des visites du projet
// ═══════════════════════════════════════════
async function loadDetailRemarks(projectId) {
  const el = document.getElementById('detail-remarks-content');
  if (!el) return;

  const res = await api('GET', `/client-visits?projectId=${projectId}`);
  const visits = res?.success ? res.data : [];

  const headerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-size:16px;font-weight:700;">📋 Visites terrain</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px;">${visits.length} visite${visits.length>1?'s':''} enregistrée${visits.length>1?'s':''}</div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="openNewVisitModal('${projectId}')">➕ Nouvelle visite</button>
    </div>`;

  if (!visits.length) {
    el.innerHTML = headerHTML + `
      <button class="terrain-add-btn" onclick="openNewVisitModal('${projectId}')">
        <span style="font-size:28px;">📋</span>
        <div>
          <div style="font-weight:700;font-size:15px;">Créer la première visite</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">Un rapport de visite contient plusieurs points avec photos</div>
        </div>
      </button>`;
    return;
  }

  el.innerHTML = headerHTML + visits.map(v => {
    const dt = new Date(v.visitDate).toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
    const nbPts = v._count?.remarks || 0;
    const clientName = v.client?.name || '';
    return `
    <div class="card" style="margin-bottom:10px;cursor:pointer;border-left:4px solid var(--blue);" onclick="openVisitDetail('${v.id}','${projectId}')">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px;">
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${esc(v.title)}</div>
          <div style="font-size:12px;color:var(--text3);">📅 ${dt}${clientName?` · 🤝 ${esc(clientName)}`:''}</div>
          ${v.notes?`<div style="font-size:12px;color:var(--text2);margin-top:6px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${esc(v.notes)}</div>`:''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0;" onclick="event.stopPropagation();">
          <span style="background:var(--bg3);padding:3px 10px;border-radius:10px;font-size:12px;font-weight:600;">📸 ${nbPts} point${nbPts>1?'s':''}</span>
          <button class="btn btn-ghost btn-xs" onclick="deleteVisit('${v.id}','${projectId}')" title="Supprimer">🗑️</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Modal "Nouvelle visite" : titre + client (optionnel)
function openNewVisitModal(projectId) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head">
        <div class="modal-title">➕ Nouvelle visite terrain</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div class="form-group2"><label class="form-label2">Titre de la visite *</label>
        <input class="input" id="nv-title" placeholder="Ex: Visite client du 4 juin — point d'avancement"></div>
      <div class="form-group2"><label class="form-label2">Date</label>
        <input class="input" type="date" id="nv-date" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group2"><label class="form-label2">Client (optionnel)</label>
        <select class="input" id="nv-client">
          <option value="">— Aucun —</option>
          ${(CLIENTS||[]).map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group2"><label class="form-label2">Notes (optionnel)</label>
        <textarea class="input" id="nv-notes" rows="2" placeholder="Contexte de la visite, personnes présentes..."></textarea></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="submitNewVisit('${projectId}',this.closest('.overlay'))">➕ Créer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function submitNewVisit(projectId, overlay) {
  const title = document.getElementById('nv-title').value.trim();
  if (!title) { toast('Le titre est obligatoire', 'error'); return; }
  const body = {
    projectId,
    title,
    visitDate: document.getElementById('nv-date').value || undefined,
    clientId:  document.getElementById('nv-client').value || undefined,
    notes:     document.getElementById('nv-notes').value || undefined,
  };
  const res = await api('POST', '/client-visits', body);
  if (res?.success) {
    toast('Visite créée ✅', 'success');
    overlay.remove();
    loadDetailRemarks(projectId);
    // Ouvre directement la visite pour commencer à ajouter des points
    setTimeout(() => openVisitDetail(res.data.id, projectId), 300);
  } else {
    toast(res?.error || 'Erreur création visite', 'error');
  }
}

async function deleteVisit(visitId, projectId) {
  if (!confirm('Supprimer cette visite et tous ses points ?')) return;
  const res = await api('DELETE', `/client-visits/${visitId}`);
  if (res?.success) { toast('Visite supprimée', 'success'); loadDetailRemarks(projectId); }
  else toast('Erreur suppression', 'error');
}

// ═══════════════════════════════════════════
// VISITES CLIENT — Niveau 2 : DÉTAIL d'une visite avec ses points
// ═══════════════════════════════════════════
async function openVisitDetail(visitId, projectId) {
  const res = await api('GET', `/client-visits/${visitId}`);
  if (!res?.success) { toast('Visite introuvable', 'error'); return; }
  const v = res.data;
  const points = v.remarks || [];

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.id = 'overlay-visit-detail';
  overlay.dataset.visitId = visitId;
  overlay.dataset.projectId = projectId;

  const dt = new Date(v.visitDate).toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  const statusBg  = {open:'#fee2e2',in_progress:'#fef9c3',resolved:'#dcfce7',archived:'#f3f4f6',urgent:'#fff1f2'};
  const statusClr = {open:'#dc2626',in_progress:'#ca8a04',resolved:'#16a34a',archived:'#6b7280',urgent:'#e63946'};
  const statusLbl = {open:'Ouvert',in_progress:'En cours',resolved:'Résolu',archived:'Archivé',urgent:'⚡ URGENT'};
  const prioBg    = {critical:'#fff1f2',high:'#fff7ed',normal:'#eff6ff',low:'#f0fdf4'};
  const prioClr   = {critical:'#e63946',high:'#f4a261',normal:'#4895ef',low:'#2dc653'};
  const prioLbl   = {critical:'🔴 Critique',high:'🟠 Élevé',normal:'🔵 Normal',low:'🟢 Faible'};

  // Options assignation HTML (réutilisé par chaque point)
  const assignOptionsHTML = (currentAssignId) => `<option value="">— Non assigné —</option>` +
    (USERS||[]).filter(u => u.isActive !== false).map(u =>
      `<option value="${u.id}" ${currentAssignId===u.id?'selected':''}>${esc(u.firstName)} ${esc(u.lastName)}</option>`
    ).join('');

  const pointHTML = points.map((r, idx) => {
    const st = r.status || 'open';
    const prio = r.priority || 'normal';
    const clr = statusClr[st] || '#dc2626';
    const bg  = statusBg[st]  || '#fee2e2';
    const photos = r.photos || [];
    const assignee = r.assignedToUser ? `${r.assignedToUser.firstName} ${r.assignedToUser.lastName}` : null;
    return `
      <div style="background:var(--bg2);border:1px solid ${clr}44;border-left:4px solid ${clr};border-radius:10px;padding:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <span style="width:22px;height:22px;border-radius:50%;background:${clr};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${idx+1}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;">${esc(r.title)}</div>
            ${r.description?`<div style="font-size:12px;color:var(--text2);margin-top:4px;line-height:1.4;">${esc(r.description)}</div>`:''}
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end;flex-shrink:0;">
            <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:99px;background:${bg};color:${clr};white-space:nowrap;">${statusLbl[st]||st}</span>
            <span style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:99px;background:${prioBg[prio]};color:${prioClr[prio]};white-space:nowrap;">${prioLbl[prio]||prio}</span>
          </div>
        </div>
        <!-- Métadonnées : zone + assignation -->
        <div style="display:flex;align-items:center;gap:10px;font-size:11px;color:var(--text3);margin-bottom:6px;flex-wrap:wrap;">
          ${r.zone?`<span>📍 ${esc(r.zone)}</span>`:''}
          <span style="display:flex;align-items:center;gap:4px;">
            👤
            <select onchange="changePointAssignee('${r.id}','${visitId}','${projectId}',this.value)"
              style="background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 5px;font-size:11px;cursor:pointer;">
              ${assignOptionsHTML(r.assignedTo)}
            </select>
          </span>
          <span style="display:flex;align-items:center;gap:4px;">
            Priorité :
            <select onchange="changePointPriority('${r.id}','${visitId}','${projectId}',this.value)"
              style="background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:2px 5px;font-size:11px;cursor:pointer;">
              <option value="low"      ${prio==='low'?'selected':''}>🟢 Faible</option>
              <option value="normal"   ${prio==='normal'?'selected':''}>🔵 Normal</option>
              <option value="high"     ${prio==='high'?'selected':''}>🟠 Élevé</option>
              <option value="critical" ${prio==='critical'?'selected':''}>🔴 Critique</option>
            </select>
          </span>
        </div>
        ${photos.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;margin-top:8px;">
          ${photos.map(p => `<img src="${p.photoUrl}" onclick="openPhotoViewer('${p.photoUrl}')" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;cursor:pointer;">`).join('')}
        </div>` : ''}
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
          ${st !== 'resolved' ? `<button class="btn btn-ghost btn-xs" onclick="updatePointStatusVisit('${r.id}','${visitId}','${projectId}','resolved')">✅ Marquer OK</button>` : ''}
          <label class="btn btn-ghost btn-xs" style="cursor:pointer;">📸 + photo<input type="file" accept="image/*" style="display:none;" onchange="uploadPointPhotoVisit('${r.id}','${visitId}','${projectId}',this)"></label>
          <button class="btn btn-ghost btn-xs" onclick="deletePointVisit('${r.id}','${visitId}','${projectId}')" style="color:var(--accent);margin-left:auto;">🗑️</button>
        </div>
      </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="modal" style="max-width:780px;">
      <div class="modal-head">
        <div style="flex:1;min-width:0;">
          <div class="modal-title">📋 ${esc(v.title)}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px;">📅 ${dt}${v.client?` · 🤝 ${esc(v.client.name)}`:''}</div>
          ${v.notes?`<div style="font-size:12px;color:var(--text3);margin-top:4px;font-style:italic;">${esc(v.notes)}</div>`:''}
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <!-- Liste des points -->
      <div style="margin-bottom:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">📸 Points (${points.length})</div>
        <div id="visit-points-list">${pointHTML || '<div style="color:var(--text3);font-size:12px;text-align:center;padding:14px;border:1px dashed var(--border);border-radius:8px;">Aucun point pour le moment</div>'}</div>
      </div>

      <button class="terrain-add-btn" onclick="openAddPointToVisitModal('${visitId}','${projectId}')">
        <span style="font-size:22px;">➕</span>
        <span style="font-weight:600;">Ajouter un point</span>
      </button>

      <!-- Barre d'actions du bas : PDF / Envoyer / Terminer -->
      <div style="display:flex;gap:10px;justify-content:space-between;align-items:center;margin-top:16px;padding-top:14px;border-top:1px solid var(--border);flex-wrap:wrap;">
        <div style="font-size:11px;color:var(--text3);font-style:italic;">
          ✓ Visite sauvegardée automatiquement après chaque ajout — tu peux fermer et revenir plus tard
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" onclick="downloadVisitPDF('${visitId}')">📄 PDF</button>
          <button class="btn btn-ghost btn-sm" onclick="sendVisitReport('${visitId}','${projectId}')">📤 Envoyer</button>
          <button class="btn btn-primary btn-sm" onclick="this.closest('.overlay').remove()">✅ Terminer</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Changer l'assignation d'un point depuis le modal
async function changePointAssignee(remarkId, visitId, projectId, userId) {
  const res = await api('PATCH', `/client-remarks/${remarkId}`, { assignedTo: userId || null });
  if (res?.success) toast('Assigné mis à jour', 'success');
  else toast(res?.error || 'Erreur assignation', 'error');
}

// Changer la priorité d'un point
async function changePointPriority(remarkId, visitId, projectId, priority) {
  const res = await api('PATCH', `/client-remarks/${remarkId}`, { priority });
  if (res?.success) toast('Priorité mise à jour', 'success');
  else toast(res?.error || 'Erreur priorité', 'error');
}

// Télécharger le PDF de la visite
async function downloadVisitPDF(visitId) {
  const lang = await pickPdfLang();
  if (!lang) return;
  toast('Génération du PDF...', 'info');
  try {
    const r = await fetch(`${API}/client-visits/${visitId}/pdf?lang=${lang}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    if (!r.ok) { toast('Erreur génération PDF', 'error'); return; }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Visite_${visitId.slice(0,8)}_${lang}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('PDF téléchargé ✅', 'success');
  } catch (e) {
    console.error('[visit pdf]', e);
    toast('Erreur réseau', 'error');
  }
}

// Envoyer le PDF par email (avec picker)
async function sendVisitReport(visitId, projectId) {
  const vRes = await api('GET', `/client-visits/${visitId}`);
  if (!vRes?.success) { toast('Visite introuvable', 'error'); return; }
  const v = vRes.data;
  const clientEmail = v.client?.email || null;
  const teamOptions = (USERS||[]).filter(u => u.email && u.isActive !== false)
    .map(u => ({ email: u.email, name: `${u.firstName} ${u.lastName}` }));

  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head">
        <div class="modal-title">📤 Envoyer le rapport de visite</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px;">
        ${esc(v.title)} · ${fmtDate(v.visitDate)}
      </div>

      <!-- 🌐 Choix de la langue -->
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🌐 Langue du PDF</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;" id="vsend-lang-wrap">
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--bg3);border:2px solid var(--accent);border-radius:6px;cursor:pointer;font-weight:600;">
          <input type="radio" name="vsend-lang" value="fr" checked style="accent-color:var(--accent);">
          🇫🇷 Français
        </label>
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--bg3);border:2px solid var(--border);border-radius:6px;cursor:pointer;">
          <input type="radio" name="vsend-lang" value="en" style="accent-color:var(--accent);">
          🇬🇧 English
        </label>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">👥 Équipe</div>
      <div style="max-height:200px;overflow-y:auto;background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:12px;">
        ${teamOptions.length ? teamOptions.map(u => `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;border-radius:6px;">
            <input type="checkbox" class="vsend-team-cb" value="${u.email}" style="accent-color:var(--accent);">
            <span style="font-size:13px;flex:1;">${esc(u.name)}</span>
            <span style="font-size:11px;color:var(--text3);">${u.email}</span>
          </label>
        `).join('') : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px;">Aucun membre avec email</div>'}
      </div>
      ${clientEmail ? `
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🤝 Client</div>
        <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg3);border-radius:6px;margin-bottom:12px;cursor:pointer;">
          <input type="checkbox" id="vsend-client-cb" value="${clientEmail}" checked style="accent-color:var(--accent);">
          <span style="font-size:13px;flex:1;">${esc(v.client.name||'Client')}</span>
          <span style="font-size:11px;color:var(--text3);">${clientEmail}</span>
        </label>
      ` : ''}
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">✉️ Adresses manuelles</div>
      <textarea class="input" id="vsend-manual" rows="3" placeholder="Une adresse par ligne ou séparées par des virgules" style="font-size:13px;margin-bottom:14px;"></textarea>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="submitSendVisit('${visitId}',this.closest('.overlay'))">📤 Envoyer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });

  // Highlight visuel du toggle FR/EN sur clic
  el.querySelectorAll('input[name="vsend-lang"]').forEach(r => {
    r.addEventListener('change', () => {
      el.querySelectorAll('#vsend-lang-wrap label').forEach(l => {
        const checked = l.querySelector('input').checked;
        l.style.borderColor = checked ? 'var(--accent)' : 'var(--border)';
      });
    });
  });
}

async function submitSendVisit(visitId, overlay) {
  const list = new Set();
  document.querySelectorAll('.vsend-team-cb:checked').forEach(cb => list.add(cb.value));
  const cli = document.getElementById('vsend-client-cb');
  if (cli && cli.checked) list.add(cli.value);
  (document.getElementById('vsend-manual')?.value || '').split(/[\s,;]+/).forEach(e => {
    const s = e.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) list.add(s);
  });
  if (list.size === 0) { toast('Sélectionne au moins un destinataire', 'error'); return; }
  toast(`Envoi à ${list.size} destinataire(s)...`, 'info');
  const res = await api('POST', `/client-visits/${visitId}/send`, { recipients: Array.from(list) });
  if (res?.success) {
    toast(`Visite envoyée à ${res.data.sentTo} destinataire(s) ✉️`, 'success');
    overlay?.remove();
  } else {
    toast(res?.error || 'Erreur envoi', 'error');
  }
}

// ═══════════════════════════════════════════
// Ajout d'un point DANS une visite — avec dictée vocale
// ═══════════════════════════════════════════
function openAddPointToVisitModal(visitId, projectId) {
  PENDING_POINT_PHOTOS = [];
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-head">
        <div class="modal-title">📍 Nouveau point</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <!-- Photo -->
      <div style="margin-bottom:14px;">
        <label style="display:block;font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:6px;">📸 Photo(s)</label>
        <div id="vpt-photos-preview" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px;"></div>
        <label style="display:flex;align-items:center;justify-content:center;gap:10px;border:2px dashed var(--border);border-radius:12px;padding:16px;cursor:pointer;color:var(--text3);font-size:13px;font-weight:600;background:var(--bg3);">
          <span style="font-size:24px;">📸</span>
          <span>Ajouter photo(s)</span>
          <input type="file" accept="image/*" multiple style="display:none;" onchange="previewVisitPointPhotos(this)">
        </label>
      </div>

      <!-- Titre -->
      <div class="form-group2"><label class="form-label2">Titre du point *</label>
        <input class="input" id="vpt-title" placeholder="Ex: Trace au mur côté entrée"></div>

      <!-- Description avec dictée -->
      <div class="form-group2">
        <label class="form-label2" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Description (optionnel)</span>
          <button id="vpt-mic-btn" type="button" onclick="toggleVisitPointDictation()" class="btn btn-ghost btn-xs" style="font-size:11px;">🎤 Dicter</button>
        </label>
        <textarea class="input" id="vpt-desc" rows="3" placeholder="Détails du point — ou clic 🎤 Dicter pour parler"></textarea>
        <div id="vpt-mic-status" style="display:none;font-size:11px;color:var(--accent);margin-top:4px;">🔴 Enregistrement en cours...</div>
      </div>

      <!-- Zone + priorité + assignation -->
      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Zone</label>
          <input class="input" id="vpt-zone" placeholder="Ex: Salle principale, façade nord"></div>
        <div class="form-group2"><label class="form-label2">Priorité</label>
          <select class="input" id="vpt-prio">
            <option value="normal">🔵 Normal</option>
            <option value="high">🟠 Élevé</option>
            <option value="critical">🔴 Critique</option>
            <option value="low">🟢 Faible</option>
          </select>
        </div>
      </div>
      <div class="form-group2"><label class="form-label2">Assigner à (optionnel)</label>
        <select class="input" id="vpt-assign">
          <option value="">— Personne (non assigné) —</option>
          ${(USERS||[]).filter(u => u.isActive !== false).map(u => `<option value="${u.id}">${esc(u.firstName)} ${esc(u.lastName)}</option>`).join('')}
        </select>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="submitVisitPoint('${visitId}','${projectId}',this.closest('.overlay'))">➕ Ajouter</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function previewVisitPointPhotos(input) {
  const preview = document.getElementById('vpt-photos-preview');
  if (!preview) return;
  for (const file of input.files) {
    PENDING_POINT_PHOTOS.push(file);
    const reader = new FileReader();
    reader.onload = e => {
      const img = document.createElement('img');
      img.src = e.target.result;
      img.style.cssText = 'width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;';
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  }
}

// Dictée vocale pour la description du point
let _visitPointRecognition = null;
let _visitPointIsRecording = false;
function toggleVisitPointDictation() {
  if (_visitPointIsRecording) {
    _visitPointIsRecording = false;
    _visitPointRecognition?.stop();
    return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast('Reconnaissance vocale non supportée sur ce navigateur', 'error'); return; }
  _visitPointRecognition = new SR();
  _visitPointRecognition.lang = 'fr-FR';
  _visitPointRecognition.continuous = true;
  _visitPointRecognition.interimResults = true;
  let finalText = '';

  _visitPointRecognition.onstart = () => {
    _visitPointIsRecording = true;
    document.getElementById('vpt-mic-btn').textContent = '⏹️ Stop';
    document.getElementById('vpt-mic-status').style.display = 'block';
    finalText = document.getElementById('vpt-desc').value;
    if (finalText && !finalText.endsWith(' ')) finalText += ' ';
  };
  _visitPointRecognition.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + ' ';
      else interim += r[0].transcript;
    }
    document.getElementById('vpt-desc').value = (finalText + interim).trim();
  };
  _visitPointRecognition.onerror = (e) => {
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    toast('Micro : ' + e.error, 'error');
  };
  _visitPointRecognition.onend = () => {
    if (_visitPointIsRecording) {
      try { _visitPointRecognition.start(); } catch (e) {}
    } else {
      const btn = document.getElementById('vpt-mic-btn');
      const st = document.getElementById('vpt-mic-status');
      if (btn) btn.textContent = '🎤 Dicter';
      if (st) st.style.display = 'none';
    }
  };
  _visitPointRecognition.start();
}

async function submitVisitPoint(visitId, projectId, overlay) {
  const title = document.getElementById('vpt-title').value.trim();
  if (!title) { toast('Le titre est obligatoire', 'error'); return; }

  // Stopper la dictée si encore active
  if (_visitPointIsRecording) { _visitPointIsRecording = false; _visitPointRecognition?.stop(); }

  const res = await api('POST', '/client-remarks', {
    projectId,
    visitId,
    title,
    description: document.getElementById('vpt-desc').value || undefined,
    zone:        document.getElementById('vpt-zone').value || undefined,
    priority:    document.getElementById('vpt-prio').value,
    assignedTo:  document.getElementById('vpt-assign')?.value || undefined,
    status:      'open',
  });
  if (!res?.success) { toast('Erreur création du point', 'error'); return; }

  // Upload des photos liées au point fraîchement créé
  for (const file of PENDING_POINT_PHOTOS) {
    const fd = new FormData(); fd.append('file', file);
    try {
      const up = await fetch(`${API}/upload/photo`, { method:'POST', headers:{ 'Authorization':`Bearer ${TOKEN}` }, body: fd });
      const upJson = await up.json();
      if (upJson?.success) {
        await api('POST', `/client-remarks/${res.data.id}/photos`, {
          photoUrl: upJson.data.url, publicId: upJson.data.publicId, phase: 'problem',
        });
      }
    } catch {}
  }
  PENDING_POINT_PHOTOS = [];

  toast('Point ajouté ✅', 'success');
  overlay.remove();
  // Rouvrir la visite pour voir le nouveau point en haut
  openVisitDetail(visitId, projectId);
}

async function updatePointStatusVisit(remarkId, visitId, projectId, status) {
  const res = await api('PATCH', `/client-remarks/${remarkId}`, { status });
  if (res?.success) { toast('Statut mis à jour', 'success'); openVisitDetail(visitId, projectId); }
}

async function deletePointVisit(remarkId, visitId, projectId) {
  if (!confirm('Supprimer ce point ?')) return;
  const res = await api('DELETE', `/client-remarks/${remarkId}`);
  if (res?.success) { toast('Point supprimé', 'success'); openVisitDetail(visitId, projectId); }
}

async function uploadPointPhotoVisit(remarkId, visitId, projectId, input) {
  if (!input.files?.length) return;
  for (const file of input.files) {
    const fd = new FormData(); fd.append('file', file);
    try {
      const up = await fetch(`${API}/upload/photo`, { method:'POST', headers:{ 'Authorization':`Bearer ${TOKEN}` }, body: fd });
      const upJson = await up.json();
      if (upJson?.success) {
        await api('POST', `/client-remarks/${remarkId}/photos`, { photoUrl: upJson.data.url, publicId: upJson.data.publicId, phase: 'problem' });
      }
    } catch {}
  }
  toast('Photo(s) ajoutée(s)', 'success');
  openVisitDetail(visitId, projectId);
}

async function assignPointQuick(remarkId, projectId, userId) {
  await api('PATCH', `/client-remarks/${remarkId}`, { assignedTo: userId||null });
  toast('Assigné ✅','success');
}

// ═══════════════════════════════════════════
// VISITE TERRAIN — MODULE COMPLET
// ═══════════════════════════════════════════

// ── Ouvrir modal ajout point terrain ──
function openAddPointModal(projectId) {
  PENDING_POINT_PHOTOS = [];
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.id = 'modal-add-point';
  overlay.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <div class="modal-head">
        <div><div class="modal-title">📍 Nouveau Point Terrain</div>
        <div style="font-size:12px;color:var(--text2);">Avec le client sur site</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <!-- Photo en premier — priorité terrain -->
      <div style="margin-bottom:16px;">
        <label style="display:block;font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">📸 Photo du problème</label>
        <div id="point-photos-preview" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:8px;"></div>
        <label style="display:flex;align-items:center;justify-content:center;gap:10px;border:2px dashed var(--border);border-radius:12px;padding:20px;cursor:pointer;color:var(--text3);font-size:14px;font-weight:600;background:var(--bg3);-webkit-tap-highlight-color:transparent;min-height:80px;" 
          onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          <span style="font-size:32px;">📸</span>
          <div><div>Ajouter une photo</div><div style="font-size:11px;font-weight:400;color:var(--text3);margin-top:2px;">Caméra, galerie ou fichier</div></div>
          <input type="file" accept="image/*" multiple style="display:none;" onchange="previewPointPhotos(this)">
        </label>
      </div>

      <!-- Titre / description -->
      <div class="form-group2">
        <label class="form-label2">Description du problème *</label>
        <div style="display:flex;gap:6px;">
          <input class="input" id="point-title" placeholder="ex: Éclairage défectueux zone B..." style="flex:1;">
          <button class="btn btn-ghost btn-xs" style="flex-shrink:0;" onclick="voiceInputPoint('point-title')" title="Dicter">🎙️</button>
        </div>
      </div>

      <!-- Localisation -->
      <div class="input-row">
        <div class="form-group2" style="margin:0;">
          <label class="form-label2">📍 Zone / Emplacement</label>
          <input class="input" id="point-zone" placeholder="ex: Hall A, Stand 3...">
        </div>
        <div class="form-group2" style="margin:0;">
          <label class="form-label2">🔴 Priorité</label>
          <select class="input" id="point-priority">
            <option value="critical">🔴 Critique</option>
            <option value="high">🟠 Élevé</option>
            <option value="normal" selected>🔵 Normal</option>
            <option value="low">🟢 Faible</option>
          </select>
        </div>
      </div>

      <!-- Action requise -->
      <div class="form-group2">
        <label class="form-label2">✅ Action requise</label>
        <div style="display:flex;gap:6px;">
          <textarea class="input" id="point-action" rows="2" placeholder="Ce qu'il faut faire..." style="flex:1;"></textarea>
          <button class="btn btn-ghost btn-xs" style="flex-shrink:0;align-self:flex-start;" onclick="voiceInputPoint('point-action')" title="Dicter">🎙️</button>
        </div>
      </div>

      <!-- Assignation -->
      <div class="form-group2">
        <label class="form-label2">👤 Assigner à</label>
        <select class="input" id="point-assign">
          <option value="">— À toute l'équipe —</option>
          ${USERS.map(u=>`<option value="${u.id}">${u.firstName} ${u.lastName}</option>`).join('')}
        </select>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="savePoint('${projectId}')">📍 Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  setTimeout(() => document.getElementById('point-title')?.focus(), 100);
}

// ── Preview photos avant sauvegarde ──
function previewPointPhotos(input) {
  PENDING_POINT_PHOTOS = [...(PENDING_POINT_PHOTOS||[]), ...Array.from(input.files)];
  const grid = document.getElementById('point-photos-preview');
  if (!grid) return;
  grid.innerHTML = PENDING_POINT_PHOTOS.map(f => {
    const url = URL.createObjectURL(f);
    return `<div style="aspect-ratio:1;border-radius:10px;overflow:hidden;border:2px solid var(--border);">
      <img src="${url}" style="width:100%;height:100%;object-fit:cover;">
    </div>`;
  }).join('');
}

// ── Dictée vocale ──
function voiceInputPoint(fieldId) {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Dictée non supportée sur ce navigateur','error'); return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = false;
  const btn = event.target; btn.textContent = '🔴';
  toast('🎙️ Parlez maintenant...','info');
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    const field = document.getElementById(fieldId);
    if (field) field.value = (field.value ? field.value + ' ' : '') + text;
    btn.textContent = '🎙️';
    toast('Enregistré ✅','success');
  };
  rec.onerror = () => { btn.textContent = '🎙️'; toast('Erreur dictée','error'); };
  rec.onend = () => { btn.textContent = '🎙️'; };
  rec.start();
}

// ── Sauvegarder un point ──
async function savePoint(projectId) {
  const title = document.getElementById('point-title')?.value?.trim();
  if (!title) { toast('Décris le problème','error'); document.getElementById('point-title')?.focus(); return; }

  const btn = event.target; btn.disabled = true; btn.textContent = '⏳ Sauvegarde...';

  let res = null;
  // Retry up to 2 times on network error
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await api('POST', '/client-remarks', {
        projectId,
        title,
        description: document.getElementById('point-action')?.value || undefined,
        zone: document.getElementById('point-zone')?.value || undefined,
        priority: document.getElementById('point-priority')?.value || 'normal',
        assignedTo: document.getElementById('point-assign')?.value || undefined,
        status: 'open',
      });
      if (res?.success) break;
      if (attempt === 0) { await new Promise(r => setTimeout(r, 800)); btn.textContent = '⏳ Nouvel essai...'; }
    } catch(e) {
      console.error('savePoint attempt', attempt, e);
      if (attempt === 0) { await new Promise(r => setTimeout(r, 800)); btn.textContent = '⏳ Reconnexion...'; }
    }
  }

  if (res?.success) {
    // Upload photos
    if (PENDING_POINT_PHOTOS?.length) {
      btn.textContent = `⏳ Upload ${PENDING_POINT_PHOTOS.length} photo(s)...`;
      for (const file of PENDING_POINT_PHOTOS) {
        const fd = new FormData(); fd.append('file', file);
        try {
          const r = await fetch(`${API}/upload/photo`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` }, body: fd
          });
          const data = await r.json();
          const url = data.data?.url || data.url;
          if (url) {
            await fetch(`${API}/client-remarks/${res.data.id}/photos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
              body: JSON.stringify({ photoUrl: url, publicId: data.data?.public_id || null, phase: 'problem' })
            });
          }
        } catch {}
      }
    }
    PENDING_POINT_PHOTOS = [];
    toast('Point enregistré ✅', 'success');
    document.getElementById('modal-add-point')?.remove();
    loadDetailRemarks(projectId);
  } else {
    const err = res?.error || 'Erreur';
    toast(err.includes('table') || err.includes('column') ? 'SQL client_remarks manquant dans Railway' : err, 'error');
    btn.disabled = false; btn.textContent = '📍 Enregistrer';
  }
}

// ── Upload photo sur un point existant ──
async function uploadPointPhoto(remarkId, projectId, input) {
  if (!input.files?.length) return;
  toast('Upload photo...', 'info');
  const fd = new FormData(); fd.append('file', input.files[0]);
  try {
    const r = await fetch(`${API}/upload/photo`, {
      method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` }, body: fd
    });
    const data = await r.json();
    const url = data.data?.url || data.url;
    if (url) {
      await fetch(`${API}/client-remarks/${remarkId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: JSON.stringify({ photoUrl: url, publicId: data.data?.public_id || null, phase: 'problem' })
      });
      toast('Photo ajoutée ✅', 'success');
      loadDetailRemarks(projectId);
    } else toast('Upload échoué', 'error');
  } catch { toast('Erreur upload', 'error'); }
}

// ── Ouvrir détail / modifier un point ──
async function openPointDetail(remarkId, projectId) {
  const res = await api('GET', `/client-remarks/${remarkId}`);
  if (!res?.success) { toast('Point introuvable','error'); return; }
  const r = res.data;

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:600px;">
      <div class="modal-head">
        <div><div class="modal-title">✏️ Modifier le Point</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <div class="form-group2">
        <label class="form-label2">Description</label>
        <input class="input" id="ep-title" value="${r.title||''}">
      </div>
      <div class="input-row">
        <div class="form-group2" style="margin:0;">
          <label class="form-label2">Zone</label>
          <input class="input" id="ep-zone" value="${r.zone||''}">
        </div>
        <div class="form-group2" style="margin:0;">
          <label class="form-label2">Priorité</label>
          <select class="input" id="ep-priority">
            <option value="critical" ${r.priority==='critical'?'selected':''}>🔴 Critique</option>
            <option value="high" ${r.priority==='high'?'selected':''}>🟠 Élevé</option>
            <option value="normal" ${r.priority==='normal'?'selected':''}>🔵 Normal</option>
            <option value="low" ${r.priority==='low'?'selected':''}>🟢 Faible</option>
          </select>
        </div>
      </div>
      <div class="form-group2">
        <label class="form-label2">Action requise</label>
        <textarea class="input" id="ep-desc" rows="3">${r.description||''}</textarea>
      </div>
      <div class="form-group2">
        <label class="form-label2">Assigner à</label>
        <select class="input" id="ep-assign">
          <option value="">— À toute l'équipe —</option>
          ${USERS.map(u=>`<option value="${u.id}" ${r.assignedTo===u.id?'selected':''}>${u.firstName} ${u.lastName}</option>`).join('')}
        </select>
      </div>
      <div class="form-group2">
        <label class="form-label2">Statut</label>
        <select class="input" id="ep-status">
          <option value="open" ${r.status==='open'?'selected':''}>🔴 Ouvert</option>
          <option value="in_progress" ${r.status==='in_progress'?'selected':''}>🟡 En cours</option>
          <option value="resolved" ${r.status==='resolved'?'selected':''}>✅ Résolu</option>
        </select>
      </div>
      ${document.getElementById('ep-status')?.value==='resolved'?`
      <div class="form-group2">
        <label class="form-label2">Note de résolution</label>
        <textarea class="input" id="ep-resolution" rows="2">${r.resolutionNotes||''}</textarea>
      </div>`:''}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteRemark('${remarkId}','${projectId}');this.closest('.overlay').remove()">🗑️ Supprimer</button>
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="updatePoint('${remarkId}','${projectId}',this.closest('.overlay'))">💾 Sauvegarder</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ── Mettre à jour un point ──
async function updatePoint(remarkId, projectId, overlay) {
  const status = document.getElementById('ep-status')?.value;
  const body = {
    title: document.getElementById('ep-title')?.value,
    zone: document.getElementById('ep-zone')?.value || undefined,
    priority: document.getElementById('ep-priority')?.value,
    description: document.getElementById('ep-desc')?.value || undefined,
    assignedTo: document.getElementById('ep-assign')?.value || undefined,
    status,
    resolutionNotes: status==='resolved' ? (document.getElementById('ep-resolution')?.value||undefined) : undefined,
    resolvedAt: status==='resolved' ? new Date().toISOString() : undefined,
  };
  const res = await api('PATCH', `/client-remarks/${remarkId}`, body);
  if (res?.success) { toast('Point mis à jour ✅','success'); overlay?.remove(); loadDetailRemarks(projectId); }
  else toast('Erreur mise à jour','error');
}

// ── Résoudre rapidement un point ──
async function resolveRemark(remarkId, projectId) {
  const res = await api('PATCH', `/client-remarks/${remarkId}`, {
    status: 'resolved', resolvedAt: new Date().toISOString()
  });
  if (res?.success) { toast('Point résolu ✅','success'); loadDetailRemarks(projectId); }
  else toast('Erreur','error');
}

// ── Supprimer un point ──
async function deleteRemark(remarkId, projectId) {
  if (!confirm('Supprimer ce point ?')) return;
  const res = await api('DELETE', `/client-remarks/${remarkId}`);
  if (res?.success) { toast('Point supprimé','success'); loadDetailRemarks(projectId); }
  else toast('Erreur suppression','error');
}

// ── Export PDF visite terrain ──
async function exportVisitePDF(projectId) {
  const proj = PROJECTS?.find(p => p.id === projectId);
  const res = await api('GET', `/client-remarks?projectId=${projectId}`);
  if (!res?.success) { toast('Erreur chargement','error'); return; }
  const points = res.data;
  const open = points.filter(r => r.status !== 'resolved');
  const done = points.filter(r => r.status === 'resolved');
  const now = new Date();

  const prioColor = {critical:'#e63946',high:'#f4a261',normal:'#4895ef',low:'#2dc653'};
  const prioLabel = {critical:'Critique',high:'Élevé',normal:'Normal',low:'Faible'};

  const renderPDFPoint = (r, idx) => `
    <div style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;page-break-inside:avoid;">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:#f9fafb;border-bottom:1px solid #e5e7eb;">
        <div style="width:28px;height:28px;background:${prioColor[r.priority]||'#4895ef'};color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${idx}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;">${r.title}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">
            ${r.zone?`📍 ${r.zone} · `:''}
            <span style="color:${prioColor[r.priority]||'#4895ef'};font-weight:600;">${prioLabel[r.priority]||'Normal'}</span>
            ${r.assignedToUser?` · 👤 ${r.assignedToUser.firstName} ${r.assignedToUser.lastName}`:''}
          </div>
        </div>
        <div style="font-size:11px;font-weight:700;padding:4px 10px;border-radius:99px;background:${r.status==='resolved'?'#dcfce7':'#fee2e2'};color:${r.status==='resolved'?'#16a34a':'#dc2626'};">
          ${r.status==='resolved'?'✅ Résolu':'🔴 Ouvert'}
        </div>
      </div>
      ${r.description?`<div style="padding:10px 14px;font-size:13px;color:#374151;background:#fff;border-bottom:1px solid #f3f4f6;">🔧 ${r.description}</div>`:''}
      ${(r.photos||[]).length?`
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 14px;background:#fff;">
        ${r.photos.map(p=>`<img src="${p.photoUrl}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;">`).join('')}
      </div>`:''}
      ${r.resolutionNotes?`<div style="padding:8px 14px;font-size:12px;color:#16a34a;background:#f0fdf4;border-top:1px solid #dcfce7;">✅ ${r.resolutionNotes}</div>`:''}
    </div>`;

  const pdfHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Visite Terrain — ${proj?.name||'Projet'}</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;margin:0;padding:24px;}
    @media print{body{padding:0;}.no-print{display:none;}}
    @page{margin:20mm;}
  </style></head><body>
  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #e63946;">
    <div>
      <div style="font-size:22px;font-weight:800;color:#111;">📋 RAPPORT DE VISITE TERRAIN</div>
      <div style="font-size:16px;font-weight:600;color:#374151;margin-top:4px;">${proj?.name||'Projet'}</div>
      <div style="font-size:13px;color:#6b7280;margin-top:4px;">${proj?.address||''}</div>
    </div>
    <div style="text-align:right;font-size:12px;color:#6b7280;">
      <div style="font-size:14px;font-weight:700;color:#111;">ViewBox Event Manager</div>
      <div>Date visite : ${now.toLocaleDateString('fr-BE',{day:'2-digit',month:'long',year:'numeric'})}</div>
    </div>
  </div>
  <!-- Résumé -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px;">
    <div style="background:#fff5f5;border:1px solid #fecaca;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#dc2626;">${open.length}</div>
      <div style="font-size:12px;color:#dc2626;font-weight:600;">Points ouverts</div>
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#16a34a;">${done.length}</div>
      <div style="font-size:12px;color:#16a34a;font-weight:600;">Points résolus</div>
    </div>
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#2563eb;">${points.length}</div>
      <div style="font-size:12px;color:#2563eb;font-weight:600;">Total points</div>
    </div>
  </div>
  ${open.length?`
  <div style="font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#dc2626;margin-bottom:12px;">🔴 Points à traiter (${open.length})</div>
  ${open.map((r,i)=>renderPDFPoint(r,i+1)).join('')}`:''}
  ${done.length?`
  <div style="font-size:14px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;color:#16a34a;margin:24px 0 12px;">✅ Points résolus (${done.length})</div>
  ${done.map((r,i)=>renderPDFPoint(r,open.length+i+1)).join('')}`:''}
  <!-- Signatures -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:32px;page-break-inside:avoid;">
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Site Manager</div>
      <div style="height:60px;border-bottom:1px solid #d1d5db;margin-bottom:6px;"></div>
      <div style="font-size:11px;color:#9ca3af;">Nom + Signature</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px;">Représentant Client</div>
      <div style="height:60px;border-bottom:1px solid #d1d5db;margin-bottom:6px;"></div>
      <div style="font-size:11px;color:#9ca3af;">Nom + Signature</div>
    </div>
  </div>
  <script>window.onload=()=>{window.print();}<\/script>
  </body></html>`;

  const win = window.open('','_blank');
  win.document.write(pdfHTML);
  win.document.close();
}

// ── Créer une nouvelle visite (session) ──
async function createVisite() {
  const projectId = document.getElementById('visite-project')?.value;
  return createVisiteFixed(projectId);
}

// ═══════════════════════════════════════════
// FICHIERS PROJET
// ═══════════════════════════════════════════

async function loadDetailFiles(projectId) {
  const el = document.getElementById('detail-files-content');
  if (!el) return;

  const res = await api('GET', `/projects/${projectId}/files`);
  const files = res?.data || [];

  const ext = f => (f.fileName||f.fileUrl||'').split('.').pop().toLowerCase();
  const isImage = f => ['jpg','jpeg','png','gif','webp'].includes(ext(f));
  const isPDF   = f => ext(f) === 'pdf';
  const isVideo = f => ['mp4','mov','avi'].includes(ext(f));

  const fileIcon = f => {
    if (isImage(f)) return '🖼️';
    if (isPDF(f))   return '📄';
    if (isVideo(f)) return '🎬';
    if (['ppt','pptx'].includes(ext(f))) return '📊';
    if (['xls','xlsx'].includes(ext(f))) return '📈';
    if (['doc','docx'].includes(ext(f))) return '📝';
    return '📎';
  };

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;">📁 Fichiers du projet</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-ghost btn-sm" onclick="showAddFileByUrlModal('${projectId}')" title="Ajouter un fichier via URL externe (GitHub, Drive...) — utile pour les fichiers > 10 Mo">🔗 URL</button>
        <label style="display:flex;align-items:center;gap:6px;background:var(--accent);color:#fff;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">
          ⬆️ Ajouter
          <input type="file" multiple accept="image/*,.pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.mp4,.mov,.glb,.gltf,.usdz,.obj,.stl,.skp,.fbx,.dae,.zip" style="display:none;" onchange="uploadProjectFiles('${projectId}',this)">
        </label>
      </div>
    0</div>

    ${files.length ? `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:8px 12px;background:var(--bg3);border-radius:8px;flex-wrap:wrap;">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;cursor:pointer;">
          <input type="checkbox" id="pf-select-all" onchange="togglePfSelectAll(this)" style="accent-color:var(--accent);width:16px;height:16px;cursor:pointer;">
          Tout sélectionner
        </label>
        <span id="pf-sel-count" style="font-size:12px;color:var(--text3);"></span>
        <button class="btn btn-ghost btn-sm" style="color:var(--accent);margin-left:auto;" onclick="bulkDeleteProjectFiles('${projectId}')">🗑️ Supprimer la sélection</button>
      </div>` : ''}

    ${!files.length ? `
      <label style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;border:2px dashed var(--border);border-radius:16px;padding:40px;cursor:pointer;color:var(--text3);">
        <span style="font-size:48px;">📁</span>
        <div style="text-align:center;">
          <div style="font-weight:600;font-size:15px;">Glissez vos fichiers ici</div>
          <div style="font-size:12px;margin-top:4px;">Photos, PDF, PowerPoint, Excel...</div>
        </div>
        <input type="file" multiple accept="image/*,.pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.mp4,.mov" style="display:none;" onchange="uploadProjectFiles('${projectId}',this)">
      </label>` : `

    <!-- Images grid -->
    ${files.filter(isImage).length ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">🖼️ Photos (${files.filter(isImage).length})</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;">
          ${files.filter(isImage).map(f=>`
            <div style="position:relative;aspect-ratio:1;border-radius:10px;overflow:hidden;cursor:pointer;border:1px solid var(--border);" onclick="openPhotoViewer('${f.fileUrl}')">
              <input type="checkbox" class="pf-cb" value="${f.id}" onclick="event.stopPropagation();updatePfSelCount()" style="position:absolute;top:4px;left:4px;z-index:2;width:18px;height:18px;accent-color:var(--accent);cursor:pointer;">
              <img src="${f.fileUrl}" style="width:100%;height:100%;object-fit:cover;display:block;">
              <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.6));padding:6px 8px;">
                <div style="font-size:10px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.fileName||'Photo'}</div>
              </div>
              <button onclick="event.stopPropagation();deleteProjectFile('${f.id}','${projectId}')" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.5);border:none;color:#fff;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;">✕</button>
            </div>`).join('')}
        </div>
      </div>` : ''}

    <!-- Other files list -->
    ${files.filter(f=>!isImage(f)).length ? `
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">📎 Documents (${files.filter(f=>!isImage(f)).length})</div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          ${files.filter(f=>!isImage(f)).map(f=>`
            <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:var(--bg3);border-radius:10px;border:1px solid var(--border);">
              <input type="checkbox" class="pf-cb" value="${f.id}" onclick="updatePfSelCount()" style="width:18px;height:18px;flex-shrink:0;accent-color:var(--accent);cursor:pointer;">
              <span style="font-size:28px;flex-shrink:0;">${fileIcon(f)}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.fileName||'Fichier'}</div>
                <div style="font-size:11px;color:var(--text3);margin-top:2px;">${f.fileType||ext(f).toUpperCase()} · ${f.fileSize?Math.round(f.fileSize/1024)+'KB':''}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;">
                <a href="${f.fileUrl}" target="_blank" class="btn btn-ghost btn-xs">👁️ Voir</a>
                <a href="${f.fileUrl}" download class="btn btn-ghost btn-xs">⬇️</a>
                <button class="btn btn-ghost btn-xs" style="color:var(--accent);" onclick="deleteProjectFile('${f.id}','${projectId}')">🗑️</button>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    `}`;
}

// ─────────────────────────────────────────────────────────────────
// Ajouter un fichier au projet via une URL externe (GitHub Releases,
// Backblaze, son propre serveur, etc.) — utile pour les fichiers > 10 Mo
// qui dépassent la limite Cloudinary du plan gratuit.
// Aucune limite de taille puisque VEM ne télécharge pas le fichier,
// il enregistre juste l'URL (le viewer 3D ou le navigateur ira chercher
// le fichier directement à cette URL).
// ─────────────────────────────────────────────────────────────────
