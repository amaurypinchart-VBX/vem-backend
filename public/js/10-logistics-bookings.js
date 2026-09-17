function showAddTruckModal(projectId, existing) {
  const t = existing || {};
  const isEdit = !!t.id;
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:600px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
      <div class="modal-head" style="flex-shrink:0;">
        <div><div class="modal-title">🚛 ${isEdit ? 'Modifier' : 'Ajouter'} un véhicule</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <div style="flex:1;overflow-y:auto;padding:0 2px 8px;">

        <!-- Type + Nom personnalisé + Plaques -->
        <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">🚛 Véhicule</div>
          <div class="form-group2">
            <label class="form-label2">Type *</label>
            <select class="input" id="at-type">
              <option value="truck"      ${t.vehicleType==='truck'?'selected':''}>🚛 Camion (Tautliner)</option>
              <option value="flatbed"    ${t.vehicleType==='flatbed'?'selected':''}>🚛 Camion (Flatbed)</option>
              <option value="van"        ${t.vehicleType==='van'?'selected':''}>🚐 Camionnette</option>
              <option value="crane"      ${t.vehicleType==='crane'?'selected':''}>🏗️ Grue</option>
              <option value="scissor"    ${t.vehicleType==='scissor'?'selected':''}>✂️ Nacelle ciseaux</option>
              <option value="manitou"    ${t.vehicleType==='manitou'?'selected':''}>🔧 Manitou / Roto</option>
              <option value="forklift"   ${t.vehicleType==='forklift'?'selected':''}>🚜 Chariot élévateur</option>
              <option value="generator"  ${t.vehicleType==='generator'?'selected':''}>⚡ Groupe électrogène</option>
              <option value="other"      ${t.vehicleType==='other'?'selected':''}>📦 Autre</option>
            </select>
          </div>
          <div class="form-group2" style="margin-top:8px;">
            <label class="form-label2">Nom / référence supplémentaire <span style="color:var(--text3);font-size:11px;font-weight:400;">(optionnel)</span></label>
            <input class="input" id="at-name" value="${esc(t.truckNumber||'')}" placeholder="Ex: Camion Volvo n°2, Grue Liebherr 70T">
          </div>
          <div class="input-row" style="margin-top:8px;">
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Plaque 1 (Tracteur)</label>
              <input class="input" id="at-plate1" value="${esc((t.licensePlate||'').split(' / ')[0]||'')}" placeholder="ex: 1-ABC-234">
            </div>
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Plaque 2 (Remorque)</label>
              <input class="input" id="at-plate2" value="${esc((t.licensePlate||'').split(' / ')[1]||'')}" placeholder="ex: O-123-456">
            </div>
          </div>
        </div>

        <!-- Chauffeur -->
        <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">👤 Chauffeur</div>
          <div class="input-row">
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Nom du chauffeur</label>
              <input class="input" id="at-driver" value="${esc(t.driverName||'')}" placeholder="Prénom Nom">
            </div>
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">📞 Téléphone</label>
              <input class="input" id="at-phone" value="${esc(t.driverPhone||'')}" placeholder="+32 ..." type="tel">
            </div>
          </div>
        </div>

        <!-- Chargement -->
        <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">📦 Chargement</div>
          <div class="form-group2">
            <label class="form-label2">Lieu de chargement</label>
            <select class="input" id="at-loading-place">
              <option value="tubize" ${(t.loadingLocation||'').includes('Tubize')?'selected':''}>🏭 Entrepôt Tubize</option>
              <option value="site"   ${(t.loadingLocation||'')==='Site événement'?'selected':''}>📍 Directement sur site événement</option>
              <option value="other"  ${t.loadingLocation && !((t.loadingLocation||'').includes('Tubize')) && t.loadingLocation!=='Site événement'?'selected':''}>📦 Autre lieu (adresse spéciale)</option>
            </select>
          </div>
          <div class="form-group2" style="margin-top:8px;${t.loadingLocation && !((t.loadingLocation||'').includes('Tubize')) && t.loadingLocation!=='Site événement'?'':'display:none;'}" id="at-loading-other-wrap">
            <label class="form-label2">Adresse du lieu de chargement</label>
            <input class="input" id="at-loading-other" value="${esc(t.loadingLocation && !((t.loadingLocation||'').includes('Tubize')) && t.loadingLocation!=='Site événement' ? t.loadingLocation : '')}" placeholder="Ex: Rue de la Forge 12, 7180 Seneffe">
          </div>
          <div class="form-group2" style="margin-top:8px;">
            <label class="form-label2">📅 Date & heure de chargement</label>
            <input class="input" type="datetime-local" id="at-loading" value="${t.loadingDate ? toLocalDatetimeInput(t.loadingDate) : ''}">
          </div>
        </div>

        <!-- Déchargement -->
        <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">🏗️ Déchargement</div>
          <div class="form-group2">
            <label class="form-label2">Lieu de déchargement</label>
            <select class="input" id="at-unloading-place">
              <option value="site"   ${(t.unloadingLocation||'')==='Site événement' || !t.unloadingLocation?'selected':''}>📍 Site événement</option>
              <option value="tubize" ${(t.unloadingLocation||'').includes('Tubize')?'selected':''}>🏭 Entrepôt Tubize</option>
              <option value="other"  ${t.unloadingLocation && !((t.unloadingLocation||'').includes('Tubize')) && t.unloadingLocation!=='Site événement'?'selected':''}>📦 Autre lieu (adresse spéciale)</option>
            </select>
          </div>
          <div class="form-group2" style="margin-top:8px;${t.unloadingLocation && !((t.unloadingLocation||'').includes('Tubize')) && t.unloadingLocation!=='Site événement'?'':'display:none;'}" id="at-unloading-other-wrap">
            <label class="form-label2">Adresse du lieu de déchargement</label>
            <input class="input" id="at-unloading-other" value="${esc(t.unloadingLocation && !((t.unloadingLocation||'').includes('Tubize')) && t.unloadingLocation!=='Site événement' ? t.unloadingLocation : '')}" placeholder="Ex: Brussels Expo, Place de Belgique 1">
          </div>
          <div class="form-group2" style="margin-top:8px;">
            <label class="form-label2">📅 Arrivée estimée</label>
            <input class="input" type="datetime-local" id="at-arrival" value="${t.arrivalDate ? toLocalDatetimeInput(t.arrivalDate) : ''}">
          </div>
          <div class="form-group2" style="margin-top:8px;">
            <label class="form-label2">📍 Zone de déchargement</label>
            <input class="input" id="at-unloading-zone" placeholder="ex: Entrée Est, Quai A, Parking Nord...">
          </div>
        </div>

        <!-- Statut (visible surtout en édition pour archiver) -->
        ${isEdit ? `
        <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">⚙️ Statut</div>
          <div class="form-group2">
            <label class="form-label2">État du véhicule</label>
            <select class="input" id="at-status">
              <option value="planned"    ${t.status==='planned'?'selected':''}>🟣 Planifié</option>
              <option value="loading"    ${t.status==='loading'?'selected':''}>🟠 En chargement</option>
              <option value="in_transit" ${t.status==='in_transit'?'selected':''}>🔵 En route</option>
              <option value="delivered"  ${t.status==='delivered'?'selected':''}>🟢 Livré (= archivé)</option>
              <option value="returned"   ${t.status==='returned'?'selected':''}>⚫ Retour entrepôt (= archivé)</option>
            </select>
            <div style="font-size:11px;color:var(--text3);margin-top:4px;font-style:italic;">Les véhicules "Livré" ou "Retour entrepôt" sont automatiquement masqués des vues principales</div>
          </div>
        </div>` : ''}

        <div class="form-group2">
          <label class="form-label2">📝 Notes</label>
          <textarea class="input" id="at-notes" rows="2" placeholder="Instructions spéciales, matériel transporté...">${esc(t.notes||'')}</textarea>
        </div>

      </div>

      <div style="flex-shrink:0;border-top:1px solid var(--border);padding-top:12px;margin-top:4px;display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="saveTruck('${projectId}',this.closest('.overlay'),'${t.id||''}')">${isEdit ? '💾 Enregistrer' : '✅ Ajouter le véhicule'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });

  // Show/hide "autre lieu" pour chargement
  document.getElementById('at-loading-place')?.addEventListener('change', function() {
    const wrap = document.getElementById('at-loading-other-wrap');
    if (wrap) wrap.style.display = this.value === 'other' ? 'block' : 'none';
  });
  // Show/hide "autre lieu" pour déchargement
  document.getElementById('at-unloading-place')?.addEventListener('change', function() {
    const wrap = document.getElementById('at-unloading-other-wrap');
    if (wrap) wrap.style.display = this.value === 'other' ? 'block' : 'none';
  });
  setTimeout(() => document.getElementById('at-driver')?.focus(), 80);
}

async function saveTruck(projectId, overlay, truckId) {
  const isEdit = !!truckId;
  const v = id => document.getElementById(id)?.value?.trim();
  const sel = id => document.getElementById(id)?.value;

  const type         = sel('at-type') || 'truck';
  const plate1       = v('at-plate1');
  const plate2       = v('at-plate2');
  const licensePlate = [plate1, plate2].filter(Boolean).join(' / ') || null;
  const customName   = v('at-name');   // nom optionnel saisi par l'utilisateur
  const driver       = v('at-driver');
  const phone        = v('at-phone');

  // Construction des libellés de lieu propres
  const loadingPlace   = sel('at-loading-place');
  const loadingOther   = v('at-loading-other');
  const unloadingPlace = sel('at-unloading-place');
  const unloadingOther = v('at-unloading-other');

  const buildPlaceLabel = (kind, other) => ({
    tubize: 'Entrepôt Tubize',
    site:   'Site événement',
    other:  other || 'Autre lieu',
  })[kind] || null;

  const loadingLocation   = buildPlaceLabel(loadingPlace,   loadingOther);
  const unloadingLocation = buildPlaceLabel(unloadingPlace, unloadingOther);

  const loading    = sel('at-loading');
  const arrival    = sel('at-arrival');
  const unloadZone = v('at-unloading-zone');
  const notesRaw   = v('at-notes');
  const status     = isEdit ? (sel('at-status') || 'planned') : 'planned';

  // Notes : on garde uniquement les notes saisies + zone de déchargement si présente
  const notesParts = [];
  if (notesRaw)   notesParts.push(notesRaw);
  if (unloadZone) notesParts.push(`Zone: ${unloadZone}`);

  const btn = overlay?.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ ...'; }

  const body = {
    vehicleType:       type,
    truckNumber:       customName || null,     // nom optionnel saisi
    licensePlate:      licensePlate,
    driverName:        driver  || null,
    driverPhone:       phone   || null,
    loadingDate:       loading ? new Date(loading).toISOString() : null,
    arrivalDate:       arrival ? new Date(arrival).toISOString() : null,
    loadingLocation:   loadingLocation,
    unloadingLocation: unloadingLocation,
    notes:             notesParts.join(' | ') || null,
    status:            status,
  };

  const res = isEdit
    ? await api('PATCH', `/projects/${projectId}/trucks/${truckId}`, body)
    : await api('POST',  `/projects/${projectId}/trucks`, body);

  if (res?.success) {
    toast(isEdit ? 'Véhicule modifié ✅' : 'Véhicule ajouté ✅', 'success');
    overlay?.remove();
    loadProjectDetail(projectId);
    if (typeof loadDetailTrucks === 'function') loadDetailTrucks(projectId);
  } else {
    toast('Erreur: ' + (res?.error || 'inconnue'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = isEdit ? '💾 Enregistrer' : '✅ Ajouter le véhicule'; }
  }
}

// ═══════════════════════════════════════════
// AJOUTER MEMBRE À L'ÉQUIPE D'UN PROJET
// ═══════════════════════════════════════════
function showAddToTeamModal(projectId) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-head">
        <div><div class="modal-title">👷 Ajouter à l'équipe</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div class="form-group2">
        <label class="form-label2">Membre</label>
        <select class="input" id="addteam-user">
          <option value="">— Sélectionner —</option>
          ${USERS.map(u=>`<option value="${u.id}">${u.firstName} ${u.lastName} (${u.role})</option>`).join('')}
        </select>
      </div>
      <div class="form-group2">
        <label class="form-label2">Rôle sur ce projet</label>
        <select class="input" id="addteam-role">
          <option value="installer">🔧 Installateur</option>
          <option value="site_manager">🏗️ Site Manager</option>
          <option value="technical_manager">⚙️ Technical Manager</option>
          <option value="worker">👷 Ouvrier</option>
          <option value="engineer">🛠️ Engineer</option>
        </select>
      </div>
      <div class="form-group2">
        <label class="form-label2">Phase d'intervention</label>
        <select class="input" id="addteam-phase">
          <option value="both">🔄 Les deux phases (installation + démontage)</option>
          <option value="installation">🔨 Uniquement installation</option>
          <option value="dismantling">🔧 Uniquement démontage</option>
        </select>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="addToTeam('${projectId}',this.closest('.overlay'))">✅ Ajouter</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
}

async function addToTeam(projectId, overlay) {
  const userId = document.getElementById('addteam-user')?.value;
  const role   = document.getElementById('addteam-role')?.value || 'worker';
  const phase  = document.getElementById('addteam-phase')?.value || 'both';
  if (!userId) { toast('Sélectionne un membre','error'); return; }
  const res = await api('POST', `/projects/${projectId}/team`, { userId, role, phase });
  if (res?.success) {
    toast('Membre ajouté ✅','success');
    overlay?.remove();
    loadProjectDetail(projectId);
  } else toast('Erreur: '+(res?.error||'inconnue'),'error');
}

// PATCH phase d'un membre déjà dans l'équipe (rapide depuis la liste)
async function updateTeamMemberPhase(projectId, memberId, newPhase) {
  const res = await api('PATCH', `/projects/${projectId}/team/${memberId}`, { phase: newPhase });
  if (res?.success) {
    toast('Phase mise à jour ✅', 'success');
    loadProjectDetail(projectId);
  } else toast('Erreur : ' + (res?.error || 'inconnue'), 'error');
}

// Retirer un membre de l'équipe d'un projet
async function removeTeamMember(projectId, memberId) {
  const res = await api('DELETE', `/projects/${projectId}/team/${memberId}`);
  if (res?.success) {
    toast('Membre retiré ✅', 'success');
    loadProjectDetail(projectId);
  } else toast('Erreur : ' + (res?.error || 'inconnue'), 'error');
}

// ═══════════════════════════════════════════════════════════
// ENVOYER INFOS / NOTIFIER UN MEMBRE DE L'ÉQUIPE
// ═══════════════════════════════════════════════════════════
async function showSendToMemberModal(projectId, memberId) {
  const res = await api('GET', `/projects/${projectId}`);
  if (!res?.success) { toast('Projet introuvable', 'error'); return; }
  const p = res.data;
  const member = (p.team || []).find(m => m.id === memberId);
  if (!member) { toast('Membre introuvable', 'error'); return; }

  const u     = member.user || {};
  const name  = `${u.firstName || ''} ${u.lastName || ''}`.trim();
  const email = u.email || '';
  const role  = member.role || 'worker';
  const phaseLabels = { both:'🔄 Les deux', installation:'🔨 Installation', dismantling:'🔧 Démontage' };
  const phase = phaseLabels[member.phase || 'both'] || member.phase;

  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:540px;">
      <div class="modal-head">
        <div class="modal-title">📤 Envoyer à ${esc(name)}</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <div style="font-size:13px;color:var(--text2);margin-bottom:14px;">
        <span class="badge badge-blue">${esc(role)}</span>
        <span style="margin-left:6px;">${phase}</span>
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">
          ${email ? '✉️ ' + esc(email) : '⚠️ Aucun email — seule la notification in-app sera possible'}
        </div>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Quoi envoyer ?</div>
      <div style="display:flex;flex-direction:column;gap:4px;background:var(--bg3);border-radius:var(--radius);padding:10px;margin-bottom:14px;">
        ${[
          ['assignment','📌 Notification d\'assignation','Nouveau projet + rôle attribué',true],
          ['project_info','📋 Infos du projet','Dates, lieu, client, notes',false],
          ['briefings','📊 Briefings','Briefings créés pour ce projet',false],
          ['bookings','🚚 Ses réservations','Transport + hôtel qui le concernent',false],
          ['reports','📄 Derniers rapports','Rapports journaliers récents',false],
          ['ai_content','🤖 Message personnalisé (IA)','Résumé/message généré par l\'IA',false],
        ].map(([val,label,desc,checked]) => `
          <label style="display:flex;align-items:flex-start;gap:8px;padding:6px;cursor:pointer;border-radius:6px;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
            <input type="checkbox" class="send-item-cb" value="${val}" ${checked?'checked':''} style="accent-color:var(--accent);margin-top:2px;">
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:600;">${label}</div>
              <div style="font-size:11px;color:var(--text3);">${desc}</div>
            </div>
          </label>
        `).join('')}
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Canal</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;">
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;background:var(--bg3);border:2px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;">
          <input type="radio" name="send-channel" value="notif" style="accent-color:var(--accent);">📱 Notif
        </label>
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;background:var(--bg3);border:2px solid var(--border);border-radius:6px;cursor:pointer;font-size:13px;">
          <input type="radio" name="send-channel" value="email" ${email?'':'disabled'} style="accent-color:var(--accent);">✉️ Email
        </label>
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;background:var(--bg3);border:2px solid var(--accent);border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;">
          <input type="radio" name="send-channel" value="both" ${email?'checked':''} ${email?'':'disabled'} style="accent-color:var(--accent);">📱+✉️ Les deux
        </label>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Message (optionnel)</div>
      <textarea class="input" id="send-member-msg" rows="3" placeholder="Mot personnel ajouté en haut du message..." style="font-size:13px;margin-bottom:14px;"></textarea>

      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="submitSendToMember('${projectId}','${memberId}',this.closest('.overlay'))">📤 Envoyer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });

  // Si pas d'email, force le canal sur "notif"
  if (!email) {
    const notifRadio = el.querySelector('input[name="send-channel"][value="notif"]');
    if (notifRadio) notifRadio.checked = true;
  }
}

async function submitSendToMember(projectId, memberId, overlay) {
  const items = Array.from(document.querySelectorAll('.send-item-cb:checked')).map(cb => cb.value);
  if (!items.length) { toast('Sélectionne au moins un élément à envoyer', 'error'); return; }

  const channel = document.querySelector('input[name="send-channel"]:checked')?.value || 'notif';
  const message = document.getElementById('send-member-msg')?.value?.trim() || '';

  const btn = overlay?.querySelector('.btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loader"></span> Envoi...'; }

  const res = await api('POST', `/projects/${projectId}/team/${memberId}/notify`, {
    items, channel, message,
  });

  if (res?.success) {
    toast(res.data?.summary || 'Envoyé ✅', 'success');
    overlay?.remove();
  } else {
    if (btn) { btn.disabled = false; btn.innerHTML = '📤 Envoyer'; }
    toast(res?.error || 'Erreur envoi', 'error');
  }
}

// ═══════════════════════════════════════════
// HANDOVER — AJOUTER POINT APRÈS CRÉATION
// ═══════════════════════════════════════════
function showAddHandoverItemModal(handoverId, projectId) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head">
        <div><div class="modal-title">🔍 Ajouter un point d'inspection</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div class="form-group2">
        <label class="form-label2">Zone / Emplacement *</label>
        <div style="display:flex;gap:6px;">
          <input class="input" id="hi-zone" placeholder="ex: Façade Nord, Terrasse, Hall A..." style="flex:1;">
          <button class="btn btn-ghost btn-xs" onclick="voiceInputHandoverItem()" title="Dicter">🎙️</button>
        </div>
      </div>
      <div class="input-row">
        <div class="form-group2" style="margin:0;">
          <label class="form-label2">Statut</label>
          <select class="input" id="hi-status">
            <option value="ok">✅ OK</option>
            <option value="remark">⚠️ Remarque</option>
            <option value="defect">❌ Défaut</option>
            <option value="pending">⏳ En attente</option>
          </select>
        </div>
        <div class="form-group2" style="margin:0;">
          <label class="form-label2">Commentaire</label>
          <input class="input" id="hi-comment" placeholder="Observation...">
        </div>
      </div>
      <!-- Photo -->
      <div class="form-group2">
        <label class="form-label2">📸 Photo</label>
        <div id="hi-photo-preview" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;"></div>
        <label style="display:flex;align-items:center;gap:8px;border:2px dashed var(--border);border-radius:10px;padding:14px;cursor:pointer;color:var(--text3);font-size:13px;">
          📸 Prendre une photo
          <input type="file" accept="image/*" style="display:none;" onchange="previewHandoverItemPhoto(this)">
        </label>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="saveHandoverItem('${handoverId}','${projectId}',this.closest('.overlay'))">✅ Ajouter</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  window._PENDING_HI_PHOTO = null;
  setTimeout(()=>document.getElementById('hi-zone')?.focus(), 80);
}

function previewHandoverItemPhoto(input) {
  if (!input.files?.length) return;
  window._PENDING_HI_PHOTO = input.files[0];
  const url = URL.createObjectURL(input.files[0]);
  const preview = document.getElementById('hi-photo-preview');
  if (preview) preview.innerHTML = `<img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">`;
}

function voiceInputHandoverItem() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Dictée non supportée','error'); return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR(); rec.lang='fr-FR'; rec.interimResults=false;
  toast('🎙️ Parlez...','info');
  rec.onresult = e => {
    const field = document.getElementById('hi-zone');
    if (field) field.value = e.results[0][0].transcript;
    toast('Zone dictée ✅','success');
  };
  rec.onerror = () => toast('Erreur dictée','error');
  rec.start();
}

async function saveHandoverItem(handoverId, projectId, overlay) {
  const zone    = document.getElementById('hi-zone')?.value?.trim();
  const status  = document.getElementById('hi-status')?.value || 'ok';
  const comment = document.getElementById('hi-comment')?.value?.trim();
  if (!zone) { toast('Indique la zone','error'); document.getElementById('hi-zone')?.focus(); return; }

  const btn = overlay?.querySelector('.btn-primary');
  if (btn) { btn.disabled=true; btn.textContent='⏳ Ajout...'; }

  // Création de l'item via la vraie route POST dédiée (le PATCH ignorait les nouveaux items)
  const res = await api('POST', `/handover/${handoverId}/items`, {
    zoneName: zone,
    status,
    comment: comment || undefined,
  });

  if (!res?.success) {
    toast(res?.error || 'Erreur ajout point', 'error');
    if (btn) { btn.disabled=false; btn.textContent='✅ Ajouter'; }
    return;
  }
  const itemId = res.data.id;

  // Upload de la photo (s'il y en a) liée au nouvel item
  if (window._PENDING_HI_PHOTO && itemId) {
    try {
      const fd = new FormData(); fd.append('file', window._PENDING_HI_PHOTO);
      const r = await fetch(`${API}/upload/photo`, {
        method:'POST', headers:{'Authorization':`Bearer ${TOKEN}`}, body: fd
      });
      const data = await r.json();
      const url = data.data?.url || data.url;
      if (url) {
        await fetch(`${API}/handover/${handoverId}/items/${itemId}/photo`, {
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`},
          body: JSON.stringify({photoUrl:url, publicId: data.data?.public_id||null})
        });
      }
    } catch (e) { console.error('upload photo échoué', e); }
  }

  toast('Point ajouté ✅','success');
  window._PENDING_HI_PHOTO = null;
  overlay?.remove();
  // Fermer aussi le modal de détail du handover (s'il était ouvert au-dessus)
  // puis le rouvrir pour rafraîchir la liste des points
  document.querySelectorAll('.overlay.open').forEach(o => o.remove());
  openHandoverFull(handoverId);
}

// ═══════════════════════════════════════════
// TABS PROJET — TICKETS / WAREHOUSE / TOOLBOX
// ═══════════════════════════════════════════

async function loadDetailTickets(projectId) {
  const el = document.getElementById('detail-tickets-content');
  if (!el) return;
  const res = await api('GET', `/tickets?projectId=${projectId}`);
  const tickets = res?.data || [];

  const urgencyColor = {critical:'var(--accent)',high:'var(--amber)',medium:'var(--blue)',low:'var(--green)'};
  const urgencyLabel = {critical:'🔴 Critique',high:'🟠 Élevé',medium:'🟡 Moyen',low:'🟢 Faible'};
  const statusLabel  = {open:'Ouvert',assigned:'Assigné',in_progress:'En cours',resolved:'Résolu',validated:'Validé',closed:'Fermé'};
  const statusBadge  = {open:'badge-red',assigned:'badge-amber',in_progress:'badge-blue',resolved:'badge-green',validated:'badge-green',closed:'badge-muted'};

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="font-size:14px;font-weight:700;">🛠️ Tickets SAV (${tickets.length})</div>
      <button class="btn btn-primary btn-sm" onclick="showModal('modal-ticket')">+ Nouveau Ticket</button>
    </div>
    ${!tickets.length ? `
      <div class="empty"><div class="empty-icon">🛠️</div><div class="empty-title">Aucun ticket sur ce projet</div></div>` : `
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${tickets.map(t => `
          <div style="background:var(--bg2);border:1px solid var(--border);border-left:3px solid ${urgencyColor[t.urgency]||'var(--blue)'};border-radius:10px;padding:12px 14px;cursor:pointer;"
            onclick="openTicketDetail('${t.id}')">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-weight:700;font-size:13px;flex:1;">${t.title}</span>
              <span class="badge ${statusBadge[t.status]||'badge-muted'}" style="font-size:10px;">${statusLabel[t.status]||t.status}</span>
            </div>
            <div style="display:flex;gap:10px;font-size:11px;color:var(--text3);">
              <span style="color:${urgencyColor[t.urgency]};font-weight:600;">${urgencyLabel[t.urgency]||t.urgency}</span>
              ${t.locationOnSite?`<span>📍 ${t.locationOnSite}</span>`:''}
              ${t.assignedTo?`<span>👤 ${t.assignedTo.firstName} ${t.assignedTo.lastName}</span>`:'<span>Non assigné</span>'}
              <span>${fmtDate(t.createdAt)}</span>
            </div>
          </div>`).join('')}
      </div>`}`;
}

async function loadDetailWarehouse(projectId) {
  const el = document.getElementById('detail-warehouse-content');
  if (!el) return;
  const res = await api('GET', `/warehouse/boxes?projectId=${projectId}`);
  const boxes = res?.data || [];

  const statusColor = {preparing:'var(--amber)',ready:'var(--blue)',loaded:'var(--blue)',on_site:'var(--green)',returned:'var(--text3)',incomplete:'var(--accent)'};
  const statusLabel = {preparing:'⏳ Préparation',ready:'✅ Prête',loaded:'📦 Chargée',on_site:'🏗️ Sur site',returned:'↩️ Retour',incomplete:'⚠️ Incomplète'};

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="font-size:14px;font-weight:700;">📦 Boxes matériel (${boxes.length})</div>
      <button class="btn btn-primary btn-sm" onclick="showModal('modal-box')">+ Nouvelle Box</button>
    </div>
    ${!boxes.length ? `
      <div class="empty"><div class="empty-icon">📦</div><div class="empty-title">Aucune box pour ce projet</div>
        <button class="btn btn-primary" style="margin-top:12px;" onclick="showModal('modal-box')">+ Créer une box</button>
      </div>` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
        ${boxes.map(b => `
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;cursor:pointer;transition:all .15s;"
            onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'"
            onclick="goto('warehouse')">
            <div style="font-size:20px;margin-bottom:6px;">📦</div>
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${b.name}</div>
            <div style="font-size:11px;color:${statusColor[b.status]||'var(--text3)'};font-weight:600;">${statusLabel[b.status]||b.status}</div>
            ${b.items?.length?`<div style="font-size:11px;color:var(--text3);margin-top:4px;">${b.items.length} article(s)</div>`:''}
          </div>`).join('')}
      </div>`}`;
}

async function loadDetailToolboxes(projectId) {
  const el = document.getElementById('detail-toolbox-content');
  if (!el) return;
  const res = await api('GET', `/toolbox?projectId=${projectId}`);
  const boxes = res?.data || [];

  const statusColor = {in_warehouse:'var(--text3)',ready:'var(--blue)',on_site:'var(--green)',returned:'var(--text3)'};
  const statusLabel = {in_warehouse:'🏠 Entrepôt',ready:'✅ Prête',on_site:'🏗️ Sur site',returned:'↩️ Retour'};

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="font-size:14px;font-weight:700;">🧰 Boîtes à outils (${boxes.length})</div>
      <button class="btn btn-primary btn-sm" onclick="showModal('modal-toolbox')">+ Nouvelle Boîte</button>
    </div>
    ${!boxes.length ? `
      <div class="empty"><div class="empty-icon">🧰</div><div class="empty-title">Aucune boîte à outils pour ce projet</div>
        <button class="btn btn-primary" style="margin-top:12px;" onclick="showModal('modal-toolbox')">+ Créer une boîte</button>
      </div>` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
        ${boxes.map(b => `
          <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;cursor:pointer;transition:all .15s;"
            onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'"
            onclick="goto('toolbox')">
            <div style="font-size:20px;margin-bottom:6px;">🧰</div>
            <div style="font-weight:700;font-size:13px;margin-bottom:4px;">${b.name}</div>
            <div style="font-size:11px;color:${statusColor[b.status]||'var(--text3)'};font-weight:600;">${statusLabel[b.status]||b.status}</div>
            ${b.drawers?.length?`<div style="font-size:11px;color:var(--text3);margin-top:4px;">${b.drawers.length} tiroir(s)</div>`:''}
          </div>`).join('')}
      </div>`}`;
}// ═════════════════════════════════════════════
// 🚛 LOGISTIQUE — Camions/Grues/Forklifts par projet
// ═════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// MODULE BOOKINGS — Transport (par membre) + Hôtels (multi-occupants)
// ═══════════════════════════════════════════════════════════════════

const TRANSPORT_MODES = {
  plane: { icon: '✈️',  label: 'Avion' },
  train: { icon: '🚄',  label: 'Train' },
  car:   { icon: '🚗',  label: 'Voiture' },
  bus:   { icon: '🚌',  label: 'Bus / Car' },
  other: { icon: '🛫',  label: 'Autre' },
};
const PHASE_LABELS = {
  installation: { icon: '🏗️', label: 'Installation', color: 'var(--blue)' },
  dismantling:  { icon: '🔨', label: 'Démontage',    color: 'var(--amber)' },
};

async function loadDetailBookings(projectId) {
  const el = document.getElementById('detail-bookings-content');
  if (!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-title">Chargement...</div></div>';

  // Charger transport + hôtels en parallèle pour la perf
  const [tRes, hRes] = await Promise.all([
    api('GET', `/projects/${projectId}/bookings`),
    api('GET', `/projects/${projectId}/hotel-bookings`),
  ]);
  const bookings = tRes?.success ? (tRes.data || []) : [];
  const hotels   = hRes?.success ? (hRes.data || []) : [];

  let html = '';

  // ─── Section 1 : Transport par membre ───
  html += `<div style="margin-bottom:22px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-size:16px;font-weight:700;">✈️ Transport par membre</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px;">
          ${bookings.length} booking(s) — un par membre+phase
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" onclick="openTransportModal('${projectId}',null,'dismantling')">+ Transport démontage</button>
        <button class="btn btn-primary btn-sm" onclick="openTransportModal('${projectId}',null,'installation')">+ Transport installation</button>
      </div>
    </div>`;

  if (!bookings.length) {
    html += `<div class="empty" style="padding:24px;background:var(--bg3);border-radius:10px;border:1px dashed var(--border);"><div class="empty-icon">✈️</div><div class="empty-title">Aucun transport</div><div class="empty-sub">Un booking transport par membre+phase (installation OU démontage)</div></div>`;
  } else {
    ['installation', 'dismantling'].forEach(phase => {
      const list = bookings.filter(b => b.phase === phase);
      if (!list.length) return;
      const ph = PHASE_LABELS[phase];
      html += `<div style="margin-top:10px;">
        <div style="font-size:12px;font-weight:700;color:${ph.color};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
          ${ph.icon} ${ph.label} (${list.length})
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:8px;">
          ${list.map(b => renderTransportCard(projectId, b)).join('')}
        </div>
      </div>`;
    });
  }
  html += `</div>`;

  // ─── Section 2 : Hôtels (multi-occupants) ───
  html += `<div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div>
        <div style="font-size:16px;font-weight:700;">🏨 Hôtels (multi-occupants)</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px;">
          ${hotels.length} réservation(s) — un hôtel peut héberger plusieurs membres
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-sm" onclick="openHotelModal('${projectId}',null,'dismantling')">+ Hôtel démontage</button>
        <button class="btn btn-primary btn-sm" onclick="openHotelModal('${projectId}',null,'installation')">+ Hôtel installation</button>
      </div>
    </div>`;

  if (!hotels.length) {
    html += `<div class="empty" style="padding:24px;background:var(--bg3);border-radius:10px;border:1px dashed var(--border);"><div class="empty-icon">🏨</div><div class="empty-title">Aucune réservation hôtel</div><div class="empty-sub">Crée une réservation et sélectionne tous les occupants concernés en une fois</div></div>`;
  } else {
    ['installation', 'dismantling'].forEach(phase => {
      const list = hotels.filter(h => h.phase === phase);
      if (!list.length) return;
      const ph = PHASE_LABELS[phase];
      html += `<div style="margin-top:10px;">
        <div style="font-size:12px;font-weight:700;color:${ph.color};text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">
          ${ph.icon} ${ph.label} (${list.length})
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:8px;">
          ${list.map(h => renderHotelCard(projectId, h)).join('')}
        </div>
      </div>`;
    });
  }
  html += `</div>`;

  el.innerHTML = html;
}

function renderTransportCard(projectId, b) {
  const u = b.user || {};
  const fmtD  = d => d ? new Date(d).toLocaleDateString('fr-FR', {day:'2-digit',month:'short'}) : '—';
  const fmtDT = d => d ? new Date(d).toLocaleString('fr-FR', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
  const tOut  = TRANSPORT_MODES[b.outboundMode] || null;
  const tRet  = TRANSPORT_MODES[b.returnMode]   || null;

  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0;font-size:13px;">
          ${esc((u.firstName||'?').charAt(0) + (u.lastName||'').charAt(0))}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(u.firstName)} ${esc(u.lastName)}</div>
          <div style="font-size:11px;color:var(--text3);">${esc(u.role||'')}</div>
        </div>
        <button class="btn btn-ghost btn-xs" onclick="openTransportModal('${projectId}','${b.id}','${b.phase}')" title="Modifier">✏️</button>
        <button class="btn btn-ghost btn-xs" onclick="deleteTransport('${projectId}','${b.id}')" style="color:var(--accent);" title="Supprimer">🗑️</button>
      </div>

      <div style="background:var(--bg3);border-radius:6px;padding:6px 8px;margin-bottom:6px;font-size:12px;">
        <span style="color:var(--text3);font-size:10px;font-weight:700;text-transform:uppercase;">📍 Sur site</span>
        <span style="font-weight:600;margin-left:4px;">${fmtD(b.onSiteStart)} → ${fmtD(b.onSiteEnd)}</span>
      </div>

      <div style="display:flex;gap:6px;margin-bottom:4px;font-size:12px;align-items:flex-start;">
        <span style="font-size:16px;flex-shrink:0;">${tOut?tOut.icon:'❔'}</span>
        <div style="flex:1;min-width:0;">
          <div style="color:var(--text3);font-size:9px;font-weight:700;text-transform:uppercase;">Aller${tOut?` · ${tOut.label}`:''}</div>
          <div>${b.outboundDate ? fmtDT(b.outboundDate) : '<span style="color:var(--text3);">—</span>'}</div>
          ${b.outboundDetails ? `<div style="font-size:11px;color:var(--text2);font-style:italic;">${esc(b.outboundDetails)}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;gap:6px;font-size:12px;align-items:flex-start;">
        <span style="font-size:16px;flex-shrink:0;">${tRet?tRet.icon:'❔'}</span>
        <div style="flex:1;min-width:0;">
          <div style="color:var(--text3);font-size:9px;font-weight:700;text-transform:uppercase;">Retour${tRet?` · ${tRet.label}`:''}</div>
          <div>${b.returnDate ? fmtDT(b.returnDate) : '<span style="color:var(--text3);">—</span>'}</div>
          ${b.returnDetails ? `<div style="font-size:11px;color:var(--text2);font-style:italic;">${esc(b.returnDetails)}</div>` : ''}
        </div>
      </div>
      ${b.notes ? `<div style="font-size:11px;color:var(--text3);font-style:italic;margin-top:6px;">📝 ${esc(b.notes)}</div>` : ''}
    </div>`;
}

function renderHotelCard(projectId, h) {
  const fmtD = d => d ? new Date(d).toLocaleDateString('fr-FR', {day:'2-digit',month:'short',year:'2-digit'}) : '—';
  const occupants = (h.occupants || []).map(o => o.user).filter(Boolean);

  return `
    <div style="background:#fef3c7;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:10px;padding:12px;">
      <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;">
        <span style="font-size:22px;flex-shrink:0;">🏨</span>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:14px;color:#78350f;">${esc(h.hotelName)}</div>
          ${h.hotelAddress ? `<div style="font-size:11px;color:#92400e;">${esc(h.hotelAddress)}</div>` : ''}
        </div>
        <button class="btn btn-ghost btn-xs" onclick="openHotelModal('${projectId}','${h.id}','${h.phase}')" title="Modifier">✏️</button>
        <button class="btn btn-ghost btn-xs" onclick="deleteHotel('${projectId}','${h.id}')" style="color:var(--accent);" title="Supprimer">🗑️</button>
      </div>

      <div style="background:#fffbeb;border-radius:6px;padding:6px 8px;font-size:12px;margin-bottom:8px;">
        <span style="color:#92400e;font-size:10px;font-weight:700;text-transform:uppercase;">📅 Séjour</span>
        <span style="font-weight:600;color:#78350f;margin-left:4px;">${fmtD(h.checkin)} → ${fmtD(h.checkout)}</span>
        ${h.reference ? `<div style="font-size:11px;color:#92400e;">Réf. : ${esc(h.reference)}</div>` : ''}
      </div>

      <div style="margin-bottom:6px;">
        <div style="font-size:10px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:4px;">👥 Occupants (${occupants.length})</div>
        <div style="display:flex;flex-wrap:wrap;gap:4px;">
          ${occupants.map(u => `
            <div style="display:flex;align-items:center;gap:4px;background:#fff;border-radius:99px;padding:2px 8px;font-size:11px;">
              <span style="width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;">${esc((u.firstName||'?').charAt(0))}</span>
              <span style="color:#78350f;font-weight:600;">${esc(u.firstName)} ${esc(u.lastName)}</span>
            </div>`).join('')}
        </div>
      </div>
      ${h.notes ? `<div style="font-size:11px;color:#92400e;font-style:italic;margin-top:6px;">📝 ${esc(h.notes)}</div>` : ''}
    </div>`;
}

// ─── Modal Transport ───
async function openTransportModal(projectId, bookingId, defaultPhase) {
  let b = null;
  if (bookingId) {
    const res = await api('GET', `/projects/${projectId}/bookings`);
    if (res?.success) b = (res.data || []).find(x => x.id === bookingId);
  }
  const phase = b?.phase || defaultPhase || 'installation';
  const isEdit = !!b;
  const toDTLocal = toLocalDatetimeInput;
  const toDate    = d => d ? new Date(d).toISOString().slice(0,10) : '';

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-head">
        <div class="modal-title">${isEdit?'✏️ Modifier':'➕ Nouveau'} transport — ${PHASE_LABELS[phase].icon} ${PHASE_LABELS[phase].label}</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <div class="input-row">
        <div class="form-group2">
          <label class="form-label2">Membre *</label>
          <select class="input" id="bk-user" ${isEdit?'disabled':''}>
            <option value="">— Sélectionner —</option>
            ${(USERS||[]).filter(u=>u.isActive!==false).map(u=>`<option value="${u.id}" ${b&&b.userId===u.id?'selected':''}>${esc(u.firstName)} ${esc(u.lastName)} (${esc(u.role||'')})</option>`).join('')}
          </select>
        </div>
        <div class="form-group2">
          <label class="form-label2">Phase *</label>
          <select class="input" id="bk-phase">
            <option value="installation" ${phase==='installation'?'selected':''}>🏗️ Installation</option>
            <option value="dismantling"  ${phase==='dismantling'?'selected':''}>🔨 Démontage</option>
          </select>
        </div>
      </div>

      <div style="background:var(--bg3);border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:6px;">📍 Présence effective sur site</div>
        <div class="input-row">
          <div class="form-group2"><label class="form-label2">Du *</label><input class="input" type="date" id="bk-on-start" value="${toDate(b?.onSiteStart)}"></div>
          <div class="form-group2"><label class="form-label2">Au *</label><input class="input" type="date" id="bk-on-end" value="${toDate(b?.onSiteEnd)}"></div>
        </div>
      </div>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;margin-bottom:6px;">✈️ Trajet aller (vers le site)</div>
        <div class="input-row">
          <div class="form-group2">
            <label class="form-label2">Moyen de transport</label>
            <select class="input" id="bk-out-mode">
              <option value="">— Non renseigné —</option>
              ${Object.entries(TRANSPORT_MODES).map(([k,v])=>`<option value="${k}" ${b?.outboundMode===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group2"><label class="form-label2">Date + heure</label><input class="input" type="datetime-local" id="bk-out-date" value="${toDTLocal(b?.outboundDate)}"></div>
        </div>
        <div class="form-group2"><label class="form-label2">Détails (n° de vol, etc.)</label><input class="input" id="bk-out-det" value="${esc(b?.outboundDetails||'')}" placeholder="Ex: AF1234 dép. 14h35 - CDG T2E"></div>
      </div>

      <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#9a3412;text-transform:uppercase;margin-bottom:6px;">🛬 Trajet retour</div>
        <div class="input-row">
          <div class="form-group2">
            <label class="form-label2">Moyen de transport</label>
            <select class="input" id="bk-ret-mode">
              <option value="">— Non renseigné —</option>
              ${Object.entries(TRANSPORT_MODES).map(([k,v])=>`<option value="${k}" ${b?.returnMode===k?'selected':''}>${v.icon} ${v.label}</option>`).join('')}
            </select>
          </div>
          <div class="form-group2"><label class="form-label2">Date + heure</label><input class="input" type="datetime-local" id="bk-ret-date" value="${toDTLocal(b?.returnDate)}"></div>
        </div>
        <div class="form-group2"><label class="form-label2">Détails</label><input class="input" id="bk-ret-det" value="${esc(b?.returnDetails||'')}"></div>
      </div>

      <div class="form-group2"><label class="form-label2">Notes</label><textarea class="input" id="bk-notes" rows="2">${esc(b?.notes||'')}</textarea></div>

      <!-- Pièce jointe (PDF/image) -->
      <div class="form-group2">
        <label class="form-label2">📎 Pièce jointe (billet, voucher...)</label>
        <div id="bk-attach-current" style="display:${b?.attachmentUrl?'flex':'none'};align-items:center;gap:8px;padding:8px 10px;background:var(--bg3);border-radius:6px;margin-bottom:6px;font-size:12px;">
          <a href="${b?.attachmentUrl||''}" target="_blank" style="color:var(--blue);text-decoration:none;flex:1;">📎 ${esc(b?.attachmentName||'Pièce jointe actuelle')}</a>
          <button class="btn btn-ghost btn-xs" onclick="document.getElementById('bk-attach-url').value='';document.getElementById('bk-attach-name').value='';document.getElementById('bk-attach-pid').value='';document.getElementById('bk-attach-current').style.display='none';" title="Retirer la PJ actuelle">✕</button>
        </div>
        <input type="hidden" id="bk-attach-url"  value="${esc(b?.attachmentUrl||'')}">
        <input type="hidden" id="bk-attach-name" value="${esc(b?.attachmentName||'')}">
        <input type="hidden" id="bk-attach-pid"  value="${esc(b?.attachmentPublicId||'')}">
        <input class="input" type="file" id="bk-attach-input" accept="application/pdf,image/*" onchange="uploadBookingAttachment(this,'bk')">
        <div id="bk-attach-status" style="font-size:11px;color:var(--text3);margin-top:4px;"></div>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="saveTransport('${projectId}','${bookingId||''}',this.closest('.overlay'))">💾 ${isEdit?'Enregistrer':'Créer'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// Upload d'une PJ pour booking transport ou hôtel.
// `prefix` = 'bk' (transport) ou 'hb' (hôtel). Écrit dans les hidden inputs
// {prefix}-attach-url/name/pid et affiche le fichier choisi en lien cliquable.
async function uploadBookingAttachment(input, prefix) {
  const file = input.files?.[0];
  if (!file) return;
  const statusEl = document.getElementById(`${prefix}-attach-status`);
  if (statusEl) statusEl.textContent = '⏳ Upload en cours...';
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('folder', prefix === 'hb' ? 'hotel-bookings' : 'team-bookings');
    const r = await fetch(`${API}/upload/photo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: fd,
    });
    if (!r.ok) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">❌ Erreur ${r.status}</span>`;
      return;
    }
    const data = await r.json();
    const url       = data.data?.url || data.url;
    const publicId  = data.data?.publicId || data.data?.public_id || null;
    const name      = data.data?.name || file.name;
    if (url) {
      document.getElementById(`${prefix}-attach-url`).value  = url;
      document.getElementById(`${prefix}-attach-name`).value = name;
      document.getElementById(`${prefix}-attach-pid`).value  = publicId || '';
      // Afficher la PJ uploadée dans le bloc "current"
      const currentBox = document.getElementById(`${prefix}-attach-current`);
      if (currentBox) {
        currentBox.innerHTML = `
          <a href="${url}" target="_blank" style="color:var(--blue);text-decoration:none;flex:1;">📎 ${name}</a>
          <button class="btn btn-ghost btn-xs" onclick="document.getElementById('${prefix}-attach-url').value='';document.getElementById('${prefix}-attach-name').value='';document.getElementById('${prefix}-attach-pid').value='';this.parentElement.style.display='none';" title="Retirer">✕</button>
        `;
        currentBox.style.display = 'flex';
      }
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--green);">✅ Fichier prêt — clique "Enregistrer" pour confirmer</span>`;
    }
  } catch (e) {
    console.error('[uploadBookingAttachment] échec :', e);
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">❌ Erreur réseau</span>`;
  }
}

async function saveTransport(projectId, bookingId, overlay) {
  const val = id => document.getElementById(id)?.value || '';
  const userId      = val('bk-user');
  const phase       = val('bk-phase');
  const onSiteStart = val('bk-on-start');
  const onSiteEnd   = val('bk-on-end');
  if (!userId) { toast('Sélectionne un membre', 'error'); return; }
  if (!onSiteStart || !onSiteEnd) { toast('Les dates de présence sont requises', 'error'); return; }

  const body = {
    userId, phase, onSiteStart, onSiteEnd,
    outboundMode:    val('bk-out-mode') || null,
    outboundDate:    fromLocalDatetimeInput(val('bk-out-date')),
    outboundDetails: val('bk-out-det')  || null,
    returnMode:      val('bk-ret-mode') || null,
    returnDate:      fromLocalDatetimeInput(val('bk-ret-date')),
    returnDetails:   val('bk-ret-det')  || null,
    notes:           val('bk-notes')    || null,
    attachmentUrl:      val('bk-attach-url')  || null,
    attachmentName:     val('bk-attach-name') || null,
    attachmentPublicId: val('bk-attach-pid')  || null,
  };

  const res = bookingId
    ? await api('PATCH', `/bookings/${bookingId}`, body)
    : await api('POST',  `/projects/${projectId}/bookings`, body);

  if (res?.success) {
    toast(bookingId?'Transport mis à jour ✅':'Transport créé ✅', 'success');
    overlay?.remove();
    loadDetailBookings(projectId);
  } else {
    toast(res?.error || 'Erreur enregistrement', 'error');
    console.error('[saveTransport] échec :', res);
  }
}

async function deleteTransport(projectId, bookingId) {
  if (!confirm('Supprimer ce transport ?')) return;
  const res = await api('DELETE', `/bookings/${bookingId}`);
  if (res?.success) { toast('Transport supprimé', 'success'); loadDetailBookings(projectId); }
  else toast(res?.error || 'Erreur suppression', 'error');
}

// ─── Modal Hôtel (multi-occupants) ───
async function openHotelModal(projectId, hotelId, defaultPhase) {
  let h = null;
  if (hotelId) {
    const res = await api('GET', `/projects/${projectId}/hotel-bookings`);
    if (res?.success) h = (res.data || []).find(x => x.id === hotelId);
  }
  const phase = h?.phase || defaultPhase || 'installation';
  const isEdit = !!h;
  const toDate = d => d ? new Date(d).toISOString().slice(0,10) : '';
  const occupantIds = new Set((h?.occupants || []).map(o => o.userId));

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-head">
        <div class="modal-title">${isEdit?'✏️ Modifier':'➕ Nouvelle'} réservation hôtel — ${PHASE_LABELS[phase].icon} ${PHASE_LABELS[phase].label}</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Phase *</label>
          <select class="input" id="hb-phase">
            <option value="installation" ${phase==='installation'?'selected':''}>🏗️ Installation</option>
            <option value="dismantling"  ${phase==='dismantling'?'selected':''}>🔨 Démontage</option>
          </select>
        </div>
        <div class="form-group2"><label class="form-label2">Référence (optionnel)</label>
          <input class="input" id="hb-ref" value="${esc(h?.reference||'')}" placeholder="Ex: Booking.com #XYZ"></div>
      </div>

      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;margin-bottom:6px;">🏨 Hôtel</div>
        <div class="form-group2"><label class="form-label2">Nom *</label>
          <input class="input" id="hb-name" value="${esc(h?.hotelName||'')}" placeholder="Ex: Mercure Centre"></div>
        <div class="form-group2"><label class="form-label2">Adresse</label>
          <input class="input" id="hb-addr" value="${esc(h?.hotelAddress||'')}" placeholder="Rue, ville, pays"></div>
        <div class="input-row">
          <div class="form-group2"><label class="form-label2">Check-in *</label>
            <input class="input" type="date" id="hb-checkin" value="${toDate(h?.checkin)}"></div>
          <div class="form-group2"><label class="form-label2">Check-out *</label>
            <input class="input" type="date" id="hb-checkout" value="${toDate(h?.checkout)}"></div>
        </div>
      </div>

      <!-- Sélection multi-occupants -->
      <div style="background:var(--bg3);border-radius:8px;padding:10px;margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;">👥 Occupants (sélectionne tous les membres logés)</div>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-xs" onclick="document.querySelectorAll('.hb-occ').forEach(c=>c.checked=true);hbUpdateCount()">Tout cocher</button>
            <button class="btn btn-ghost btn-xs" onclick="document.querySelectorAll('.hb-occ').forEach(c=>c.checked=false);hbUpdateCount()">Tout décocher</button>
          </div>
        </div>
        <input class="input" placeholder="🔎 Filtrer par nom..." oninput="document.querySelectorAll('.hb-occ-row').forEach(r=>{const n=r.dataset.name||'';r.style.display=!this.value||n.includes(this.value.toLowerCase())?'':'none'})" style="margin-bottom:6px;font-size:12px;">
        <div style="max-height:200px;overflow-y:auto;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:4px;">
          ${(USERS||[]).filter(u=>u.isActive!==false).map(u=>`
            <label class="hb-occ-row" data-name="${esc(((u.firstName||'')+' '+(u.lastName||'')+' '+(u.role||'')).toLowerCase())}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:4px;cursor:pointer;">
              <input type="checkbox" class="hb-occ" value="${u.id}" ${occupantIds.has(u.id)?'checked':''} onchange="hbUpdateCount()" style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
              <span style="font-size:13px;flex:1;">${esc(u.firstName)} ${esc(u.lastName)}</span>
              <span style="font-size:10px;color:var(--text3);">${esc(u.role||'')}</span>
            </label>`).join('')}
        </div>
        <div id="hb-count" style="font-size:11px;color:var(--text3);margin-top:6px;">0 occupant(s) sélectionné(s)</div>
      </div>

      <div class="form-group2"><label class="form-label2">Notes (contact, particularités, etc.)</label>
        <textarea class="input" id="hb-notes" rows="2">${esc(h?.notes||'')}</textarea></div>

      <!-- Pièce jointe (PDF/image) -->
      <div class="form-group2">
        <label class="form-label2">📎 Pièce jointe (confirmation, voucher...)</label>
        <div id="hb-attach-current" style="display:${h?.attachmentUrl?'flex':'none'};align-items:center;gap:8px;padding:8px 10px;background:var(--bg3);border-radius:6px;margin-bottom:6px;font-size:12px;">
          <a href="${h?.attachmentUrl||''}" target="_blank" style="color:var(--blue);text-decoration:none;flex:1;">📎 ${esc(h?.attachmentName||'Pièce jointe actuelle')}</a>
          <button class="btn btn-ghost btn-xs" onclick="document.getElementById('hb-attach-url').value='';document.getElementById('hb-attach-name').value='';document.getElementById('hb-attach-pid').value='';document.getElementById('hb-attach-current').style.display='none';" title="Retirer la PJ actuelle">✕</button>
        </div>
        <input type="hidden" id="hb-attach-url"  value="${esc(h?.attachmentUrl||'')}">
        <input type="hidden" id="hb-attach-name" value="${esc(h?.attachmentName||'')}">
        <input type="hidden" id="hb-attach-pid"  value="${esc(h?.attachmentPublicId||'')}">
        <input class="input" type="file" id="hb-attach-input" accept="application/pdf,image/*" onchange="uploadBookingAttachment(this,'hb')">
        <div id="hb-attach-status" style="font-size:11px;color:var(--text3);margin-top:4px;"></div>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="saveHotel('${projectId}','${hotelId||''}',this.closest('.overlay'))">💾 ${isEdit?'Enregistrer':'Créer'}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  hbUpdateCount();
}

function hbUpdateCount() {
  const n = document.querySelectorAll('.hb-occ:checked').length;
  const el = document.getElementById('hb-count');
  if (el) el.textContent = `${n} occupant(s) sélectionné(s)`;
}

async function saveHotel(projectId, hotelId, overlay) {
  const val = id => document.getElementById(id)?.value || '';
  const userIds = Array.from(document.querySelectorAll('.hb-occ:checked')).map(cb => cb.value);
  const hotelName = val('hb-name');
  const checkin   = val('hb-checkin');
  const checkout  = val('hb-checkout');
  if (!hotelName) { toast('Nom de l\'hôtel requis', 'error'); return; }
  if (!checkin || !checkout) { toast('Check-in et check-out requis', 'error'); return; }
  if (userIds.length === 0) { toast('Sélectionne au moins un occupant', 'error'); return; }

  const body = {
    phase: val('hb-phase'),
    hotelName,
    hotelAddress: val('hb-addr') || null,
    checkin, checkout,
    reference:    val('hb-ref') || null,
    notes:        val('hb-notes') || null,
    attachmentUrl:      val('hb-attach-url')  || null,
    attachmentName:     val('hb-attach-name') || null,
    attachmentPublicId: val('hb-attach-pid')  || null,
    userIds,
  };

  const res = hotelId
    ? await api('PATCH', `/hotel-bookings/${hotelId}`, body)
    : await api('POST',  `/projects/${projectId}/hotel-bookings`, body);

  if (res?.success) {
    toast(hotelId?'Hôtel mis à jour ✅':`Hôtel créé pour ${userIds.length} occupant(s) ✅`, 'success');
    overlay?.remove();
    loadDetailBookings(projectId);
  } else {
    toast(res?.error || 'Erreur enregistrement', 'error');
    console.error('[saveHotel] échec :', res);
  }
}

async function deleteHotel(projectId, hotelId) {
  if (!confirm('Supprimer cette réservation hôtel ?')) return;
  const res = await api('DELETE', `/hotel-bookings/${hotelId}`);
  if (res?.success) { toast('Hôtel supprimé', 'success'); loadDetailBookings(projectId); }
  else toast(res?.error || 'Erreur suppression', 'error');
}

// Libellés complets des types de véhicules pour l'affichage des cartes
const TRUCK_VEHICLE_LABELS = {
  truck:     'Camion Tautliner',
  flatbed:   'Camion Flatbed',
  van:       'Camionnette',
  crane:     'Grue',
  scissor:   'Nacelle ciseaux',
  manitou:   'Manitou / Roto',
  forklift:  'Chariot élévateur',
  generator: 'Groupe électrogène',
  other:     'Autre véhicule',
};
const TRUCK_VEHICLE_ICONS = {
  truck:'🚛', flatbed:'🚛', van:'🚐', crane:'🏗️', scissor:'✂️',
  manitou:'🔧', forklift:'🚜', generator:'⚡', other:'📦',
};
const TRUCK_STATUS_LABELS = {
  planned:'🟣 Planifié', loading:'🟠 En chargement', in_transit:'🔵 En route',
  delivered:'🟢 Livré', returned:'⚫ Retour entrepôt',
};
const TRUCK_STATUS_COLORS = {
  planned:'#9b59b6', loading:'#f4a261', in_transit:'#4895ef',
  delivered:'#2dc653', returned:'#5a6275',
};

// Un véhicule est "archivé" si livré ou de retour à l'entrepôt (= plus actif)
function isTruckArchived(t) { return t?.status === 'delivered' || t?.status === 'returned'; }

let SHOW_ARCHIVED_TRUCKS = false;

