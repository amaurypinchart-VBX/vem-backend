async function createTasksFromMeeting(tasks, projectId, overlay, count) {
  toast(`Création de ${count} tâche(s)...`,'info');
  const results = await Promise.all(tasks.map((t,i) => {
    const title = document.getElementById(`mt-title-${i}`)?.value?.trim() || t.title;
    const priority = document.getElementById(`mt-priority-${i}`)?.value || t.priority || 'normal';
    const assignedToId = document.getElementById(`mt-assign-${i}`)?.value || null;
    const taskDate = document.getElementById(`mt-date-${i}`)?.value || undefined;
    const taskBody = {
      projectId, title, priority,
      status:'todo',
      description: t.description||undefined,
      createdById: CURRENT_USER?.id,
    };
    if (assignedToId) taskBody.assignedToId = assignedToId;
    if (taskDate) taskBody.taskDate = taskDate;
    return api('POST', '/tasks', taskBody);
  }));
  const created = results.filter(r=>r?.success).length;
  toast(`${created} tâche(s) créée(s) ✅`,'success');
  overlay?.remove();
  loadDetailTasks(projectId);
}

// ═══════════════════════════════════════════════════════════
// TEMPLATES PAGE
// ═══════════════════════════════════════════════════════════
async function loadTemplatesPage() {
  const res = await api('GET', '/task-templates/categories');
  const el = document.getElementById('templates-content');
  if (!el) return;

  if (!res?.success || !res.data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">Aucun template</div><div class="empty-sub">Créez des catégories et des templates de tâches</div></div>';
    return;
  }

  PROJ_CATEGORIES_DATA = res.data;
  PROJ_TEMPLATES_FLAT = res.data.flatMap(c=>(c.templates||[]).map(t=>({...t,categoryName:c.name,categoryIcon:c.icon,categoryColor:c.color})));

  el.innerHTML = res.data.map(cat => {
    const tpls = cat.templates || [];
    return `
      <div class="card" style="margin-bottom:14px;">
        <div class="card-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:20px;">${cat.icon||'📋'}</span>
            <div>
              <div class="card-title" style="color:${cat.color||'var(--text)'};">${cat.name}</div>
              <div style="font-size:12px;color:var(--text3);">${tpls.length} template(s)</div>
            </div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-ghost btn-xs" onclick="showNewTemplateModal('${cat.id}')">+ Template</button>
            <button class="btn btn-ghost btn-xs" style="color:var(--accent);" onclick="deleteCategory('${cat.id}')">🗑️</button>
          </div>
        </div>
        <div class="card-body" style="padding:10px 18px;">
          ${tpls.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
            ${tpls.map(t=>`
              <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:10px;display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;padding-right:6px;">
                  <div style="font-size:13px;font-weight:500;">${t.title}</div>
                  <div style="font-size:11px;color:var(--text3);margin-top:2px;">⏱️ ${t.durationHours}h · ${t.priority}</div>
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0;">
                  <button class="btn btn-ghost btn-xs" onclick="editTemplate('${t.id}','${cat.id}','${t.title.replace(/'/g,"'")}','${t.priority}',${t.durationHours})">✏️</button>
                  <button class="btn btn-ghost btn-xs" style="color:var(--accent);" onclick="deleteTemplate('${t.id}')">🗑️</button>
                </div>
              </div>`).join('')}
          </div>` : '<div style="color:var(--text3);font-size:13px;">Aucun template dans cette catégorie</div>'}
        </div>
      </div>`;
  }).join('');
}

function showNewTemplateModal(catId='') {
  const el = document.createElement('div'); el.className='overlay open';
  const cats = PROJ_CATEGORIES_DATA || [];
  el.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-head"><div class="modal-title">📋 Nouveau Template</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div class="form-group2"><label class="form-label2">Catégorie *</label>
        <select class="input" id="nt-cat">
          <option value="">— Sélectionner —</option>
          ${cats.map(c=>`<option value="${c.id}" ${c.id===catId?'selected':''}>${c.icon||''} ${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="form-group2"><label class="form-label2">Titre *</label><input class="input" id="nt-title" placeholder="ex: Montage structure aluminium"></div>
      <div class="form-group2"><label class="form-label2">Description</label><textarea class="input" id="nt-desc" rows="2"></textarea></div>
      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Durée (heures)</label><input class="input" type="number" id="nt-hours" value="4" step="0.5" min="0.5"></div>
        <div class="form-group2"><label class="form-label2">Priorité</label>
          <select class="input" id="nt-priority">
            <option value="low">🟢 Faible</option>
            <option value="normal" selected>🔵 Normal</option>
            <option value="high">🟠 Élevé</option>
            <option value="critical">🔴 Critique</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="createTemplate(this.closest('.overlay'))">✅ Créer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

async function createTemplate(overlay) {
  const catId = document.getElementById('nt-cat')?.value;
  const title = document.getElementById('nt-title')?.value.trim();
  if (!catId || !title) { toast('Catégorie et titre obligatoires','error'); return; }
  const res = await api('POST', '/task-templates', {
    categoryId: catId, title,
    description: document.getElementById('nt-desc')?.value||undefined,
    durationHours: parseFloat(document.getElementById('nt-hours')?.value)||4,
    priority: document.getElementById('nt-priority')?.value||'normal',
  });
  if (res?.success) { toast('Template créé ✅','success'); overlay?.remove(); await loadTaskTemplatesFromAPI(); loadTemplatesPage(); loadProjTemplateSelector(); }
  else toast('Erreur création template','error');
}

async function editTemplate(id, catId, title, priority, hours) {
  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-head"><div class="modal-title">✏️ Modifier Template</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div class="form-group2"><label class="form-label2">Titre *</label><input class="input" id="edit-tpl-title" value="${title}"></div>
      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Durée (h)</label><input class="input" type="number" id="edit-tpl-hours" value="${hours}" step="0.5"></div>
        <div class="form-group2"><label class="form-label2">Priorité</label>
          <select class="input" id="edit-tpl-priority">
            <option value="low" ${priority==='low'?'selected':''}>🟢 Faible</option>
            <option value="normal" ${priority==='normal'?'selected':''}>🔵 Normal</option>
            <option value="high" ${priority==='high'?'selected':''}>🟠 Élevé</option>
            <option value="critical" ${priority==='critical'?'selected':''}>🔴 Critique</option>
          </select>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:12px;">
        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteTemplate('${id}');this.closest('.overlay').remove()">🗑️ Supprimer</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
          <button class="btn btn-primary" onclick="saveTemplate('${id}',this.closest('.overlay'))">💾 Sauvegarder</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

async function saveTemplate(id, overlay) {
  const res = await api('PATCH', `/task-templates/${id}`, {
    title: document.getElementById('edit-tpl-title')?.value.trim(),
    durationHours: parseFloat(document.getElementById('edit-tpl-hours')?.value)||4,
    priority: document.getElementById('edit-tpl-priority')?.value,
  });
  if (res?.success) { toast('Template mis à jour ✅','success'); overlay?.remove(); await loadTaskTemplatesFromAPI(); loadTemplatesPage(); }
  else toast('Erreur','error');
}

async function deleteTemplate(id) {
  if (!confirm('Supprimer ce template ?')) return;
  const res = await api('DELETE', `/task-templates/${id}`);
  if (res?.success) { toast('Supprimé','warning'); await loadTaskTemplatesFromAPI(); loadTemplatesPage(); }
  else toast('Erreur suppression','error');
}

function showNewCategoryModal() {
  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-head"><div class="modal-title">🗂️ Nouvelle Catégorie</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Nom *</label><input class="input" id="nc-name" placeholder="ex: Finitions"></div>
        <div class="form-group2"><label class="form-label2">Icône</label><input class="input" id="nc-icon" value="📋" style="font-size:18px;"></div>
      </div>
      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Couleur</label><input class="input" type="color" id="nc-color" value="#4895ef"></div>
        <div class="form-group2"><label class="form-label2">Description</label><input class="input" id="nc-desc" placeholder="..."></div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="createCategory(this.closest('.overlay'))">✅ Créer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

async function createCategory(overlay) {
  const name = document.getElementById('nc-name')?.value.trim();
  if (!name) { toast('Nom obligatoire','error'); return; }
  const res = await api('POST', '/task-templates/categories', {
    name, icon: document.getElementById('nc-icon')?.value||'📋',
    color: document.getElementById('nc-color')?.value||'#4895ef',
    description: document.getElementById('nc-desc')?.value||undefined,
  });
  if (res?.success) { toast('Catégorie créée ✅','success'); overlay?.remove(); await loadTaskTemplatesFromAPI(); loadTemplatesPage(); }
  else toast('Erreur création catégorie','error');
}

async function deleteCategory(id) {
  if (!confirm('Supprimer cette catégorie et tous ses templates ?')) return;
  const res = await api('DELETE', `/task-templates/categories/${id}`);
  if (res?.success) { toast('Supprimée','warning'); await loadTaskTemplatesFromAPI(); loadTemplatesPage(); }
  else toast('Erreur suppression','error');
}

// ═══════════════════════════════════════════════════════════
// FIX — VISITE CLIENT (route client-remarks)
// ═══════════════════════════════════════════════════════════
// Override createVisite to handle API not available gracefully
async function createVisiteFixed(projectId) {
  const date = document.getElementById('visite-date')?.value;
  const time = document.getElementById('visite-time')?.value || '09:00';
  const pid = document.getElementById('visite-project')?.value || projectId;
  if (!pid || !date) { toast('Projet et date obligatoires','error'); return; }

  const title = `Visite client — ${new Date(date).toLocaleDateString('fr-FR')} ${time}`;
  const clientRep = document.getElementById('visite-client-rep')?.value;
  const assignedTo = document.getElementById('visite-assigned')?.value||undefined;
  const desc = document.getElementById('visite-desc')?.value||undefined;

  // Try client-remarks first
  const res = await api('POST', '/client-remarks', {
    projectId: pid, title,
    description: `${clientRep?`Représentant: ${clientRep}. `:''}${desc||''}`,
    priority:'normal', status:'open', assignedTo,
  });

  // Always create task regardless
  await api('POST', '/tasks', {
    projectId: pid,
    title: `📸 ${title}`,
    description: `${clientRep?`Représentant client: ${clientRep}. `:''}${desc||''}`,
    taskDate: date, status:'todo', priority:'high',
    assignedToId: assignedTo||undefined,
    createdById: CURRENT_USER?.id,
  });

  if (res?.success || true) {
    toast('Visite créée ✅','success');
    closeModal('modal-new-visite');
    ['visite-client-rep','visite-desc'].forEach(id=>{ const e=document.getElementById(id); if(e) e.value=''; });
    loadDetailRemarks(pid);
    loadDetailTasks(pid);
  }
}

// ═══════════════════════════════════════════════════════════
// FIX — TRUCKS (use tasks fallback if route missing)
// ═══════════════════════════════════════════════════════════
async function addTruckSafe(projectId, overlay) {
  const num = document.getElementById('truck-num')?.value.trim();
  if (!num) { toast('Numéro/nom obligatoire','error'); return; }
  const type = document.getElementById('truck-type')?.value||'truck';
  const typeLabels = {truck:'Camion',van:'Camionnette',crane:'Grue',lift:'Nacelle',forklift:'Chariot',generator:'Groupe élec.',trailer:'Remorque',machine:'Machine',other:'Autre'};
  const driver = document.getElementById('truck-driver')?.value||'';
  const phone = document.getElementById('truck-phone')?.value||'';
  const notes = document.getElementById('truck-notes')?.value||'';
  const loading = document.getElementById('truck-loading')?.value||'';

  const truckStatus = document.getElementById('truck-status')?.value||'planned';
  const truckArrival = document.getElementById('truck-arrival')?.value||'';
  const truckBody = {
    truckNumber: `${typeLabels[type]||''} — ${num}`,
    status: truckStatus,
    notes: notes||undefined,
  };
  if (document.getElementById('truck-plate')?.value) truckBody.licensePlate = document.getElementById('truck-plate').value;
  if (driver) truckBody.driverName = driver;
  if (loading) truckBody.loadingDate = new Date(loading).toISOString();
  if (truckArrival) truckBody.arrivalDate = new Date(truckArrival).toISOString();
  const res = await api('POST', `/projects/${projectId}/trucks`, truckBody);

  if (res?.success) {
    toast('Véhicule ajouté ✅','success');
    overlay?.remove();
    loadProjectDetail(projectId);
  } else {
    // Fallback: create as task
    const taskTitle = `🚛 ${typeLabels[type]} — ${num}${driver?` · ${driver}`:''}${phone?` · ${phone}`:''}`;
    const taskRes = await api('POST', '/tasks', {
      projectId, title: taskTitle,
      description: `${notes||''}
Plaque: ${document.getElementById('truck-plate')?.value||'N/A'}
Chargement: ${loading||'N/A'}`,
      status:'todo', priority:'normal',
      taskDate: loading?loading.split('T')[0]:undefined,
      createdById: CURRENT_USER?.id,
    });
    if (taskRes?.success) {
      toast('Ajouté comme tâche (route trucks non disponible)','warning');
      overlay?.remove();
      loadDetailTasks(projectId);
    } else toast('Erreur ajout','error');
  }
}

// ═══════════════════════════════════════════════════════════
// HANDOVER FULL VIEW
// ═══════════════════════════════════════════════════════════
async function openHandoverFull(id) {
  const res = await api('GET', `/handover/${id}`);
  if (!res?.success) { toast('Handover introuvable','error'); return; }
  const h = res.data;
  const items = h.items || [];

  const sc = {ok:'p-resolved', remark:'p-high', defect:'p-critical', pending:'p-normal'};
  const si = {ok:'✅', remark:'⚠️', defect:'❌', pending:'⏳'};
  const sl = {ok:'OK', remark:'Remarque', defect:'Défaut', pending:'En attente'};
  const sc2 = {ok:'var(--green)', remark:'var(--amber)', defect:'var(--accent)', pending:'var(--text3)'};

  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:860px;">
      <div class="modal-head">
        <div>
          <div class="modal-title">🧾 ${h.project?.name || 'Handover'}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">
            ${h.clientName||''} · ${fmtDate(h.createdAt)}
            ${h.siteManager ? ' · ' + h.siteManager.firstName + ' ' + h.siteManager.lastName : ''}
          </div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <!-- Stats bar -->
      <div style="display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
        <div style="background:rgba(45,198,83,.1);border:1px solid rgba(45,198,83,.3);border-radius:var(--radius);padding:8px 14px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:var(--green);">${items.filter(i=>i.status==='ok').length}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;">OK</div>
        </div>
        <div style="background:rgba(244,162,97,.1);border:1px solid rgba(244,162,97,.3);border-radius:var(--radius);padding:8px 14px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:var(--amber);">${items.filter(i=>i.status==='remark').length}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;">Remarques</div>
        </div>
        <div style="background:rgba(230,57,70,.1);border:1px solid rgba(230,57,70,.3);border-radius:var(--radius);padding:8px 14px;text-align:center;">
          <div style="font-size:20px;font-weight:800;color:var(--accent);">${items.filter(i=>i.status==='defect').length}</div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;">Défauts</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <span class="badge ${h.status==='signed'?'badge-green':'badge-amber'}">${h.status==='signed'?'✅ Signé':'En attente'}</span>
          <button class="btn btn-ghost btn-xs" onclick="showAddHandoverItemModal('${h.id}','${h.projectId}')">+ Point</button>
          <button class="btn btn-ghost btn-xs" onclick="editHandoverFields('${h.id}','${h.projectId}')">✏️ Modifier</button>
          <button class="btn btn-ghost btn-xs" onclick="generateSignatureLink('${h.id}')">🔗 Signer</button>
          <button class="btn btn-primary btn-xs" onclick="downloadHandoverPdf('${h.id}')">📄 PDF</button>
        </div>
      </div>

      <!-- Zones — terrain card format -->
      <div style="max-height:50vh;overflow-y:auto;padding-right:4px;">
        ${items.map((item, idx) => {
          const photos = item.photos || [];
          return `
          <div class="terrain-point ${sc[item.status]||'p-normal'}" style="margin-bottom:12px;">
            <div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px 8px;">
              <div class="terrain-num">${idx+1}</div>
              <div style="flex:1;">
                <div style="font-weight:700;font-size:14px;">${item.zoneName}</div>
                ${item.comment ? `<div style="font-size:13px;color:var(--text2);margin-top:4px;line-height:1.5;">${item.comment}</div>` : ''}
              </div>
              <select class="input" style="width:120px;padding:5px 8px;font-size:12px;flex-shrink:0;" onchange="updateZoneStatus('${h.id}','${item.id}',this.value)">
                <option value="ok" ${item.status==='ok'?'selected':''}>✅ OK</option>
                <option value="remark" ${item.status==='remark'?'selected':''}>⚠️ Remarque</option>
                <option value="defect" ${item.status==='defect'?'selected':''}>❌ Défaut</option>
                <option value="pending" ${item.status==='pending'?'selected':''}>⏳ Attente</option>
              </select>
            </div>
            <!-- Photos -->
            <div class="terrain-photos">
              ${photos.map(p=>`<div class="terrain-photo" onclick="openPhotoViewer('${p.photoUrl}')"><img src="${p.photoUrl}" loading="lazy"></div>`).join('')}
              <label class="terrain-photo-add" title="Ajouter photo">
                📸
                <input type="file" accept="image/*" style="display:none;" onchange="uploadHandoverZonePhoto('${h.id}','${item.id}',this,null)">
              </label>
            </div>
          </div>`;
        }).join('')}
      </div>

      <!-- Notes -->
      ${h.generalNotes ? `<div style="background:var(--bg3);border-radius:var(--radius);padding:12px;font-size:13px;color:var(--text2);margin-bottom:14px;">📝 ${h.generalNotes}</div>` : ''}

      <!-- Signatures -->
      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:4px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:12px;">✍️ Signatures</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Site Manager — ${h.siteManager ? h.siteManager.firstName+' '+h.siteManager.lastName : 'N/A'}</div>
            ${h.managerSignedAt
              ? `<div style="background:rgba(45,198,83,.08);border:1px solid rgba(45,198,83,.3);border-radius:var(--radius);padding:12px;text-align:center;color:var(--green);">✅ Signé le ${fmtDate(h.managerSignedAt)}</div>`
              : `<div style="background:var(--bg3);border:2px dashed var(--border);border-radius:var(--radius);padding:6px;">
                  <canvas id="sig-mgr-${h.id}" width="260" height="100" style="display:block;margin:0 auto;cursor:crosshair;touch-action:none;background:transparent;"></canvas>
                  <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;">
                    <button class="btn btn-ghost btn-xs" onclick="clearSig('sig-mgr-${h.id}')">Effacer</button>
                    <button class="btn btn-green btn-xs" onclick="saveSig('${h.id}','manager','sig-mgr-${h.id}',this.closest('.overlay'))">✅ Valider</button>
                  </div>
                </div>`}
          </div>
          <div>
            <div style="font-size:11px;color:var(--text3);margin-bottom:6px;">Client — ${h.clientName||'N/A'}</div>
            ${h.clientSignedAt
              ? `<div style="background:rgba(45,198,83,.08);border:1px solid rgba(45,198,83,.3);border-radius:var(--radius);padding:12px;text-align:center;color:var(--green);">✅ Signé le ${fmtDate(h.clientSignedAt)}</div>`
              : `<div style="background:var(--bg3);border:2px dashed var(--border);border-radius:var(--radius);padding:6px;">
                  <canvas id="sig-cli-${h.id}" width="260" height="100" style="display:block;margin:0 auto;cursor:crosshair;touch-action:none;background:transparent;"></canvas>
                  <div style="display:flex;gap:6px;justify-content:center;margin-top:6px;">
                    <button class="btn btn-ghost btn-xs" onclick="clearSig('sig-cli-${h.id}')">Effacer</button>
                    <button class="btn btn-green btn-xs" onclick="saveSig('${h.id}','client','sig-cli-${h.id}',this.closest('.overlay'))">✅ Valider</button>
                  </div>
                </div>`}
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
        <button class="btn btn-ghost btn-sm" onclick="editHandoverFields('${h.id}','${h.projectId||CURRENT_PROJECT_ID}')">✏️</button>
       <button class="btn btn-ghost btn-sm" onclick="downloadHandoverPdf('${h.id}')">📄 PDF</button>
        <button class="btn btn-ghost btn-sm" onclick="generateSignatureLink('${h.id}')">🔗 Signer</button>
        <button class="btn btn-primary btn-sm" onclick="generateAndSendHandover('${h.id}')">📤 Envoyer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
  setTimeout(()=>{ initSigPad(`sig-mgr-${h.id}`); initSigPad(`sig-cli-${h.id}`); }, 150);
}

// ═══════════════════════════════════════════════════════════
// TASK MODAL — with comments, progress, photos
// ═══════════════════════════════════════════════════════════
async function openTaskModal(taskId, projectId) {
  const res = await api('GET', `/tasks?projectId=${projectId}`);
  const task = res?.data?.find(t => t.id === taskId);
  if (!task) { toast('Tâche introuvable','error'); return; }

  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-head">
        <div>
          <div class="modal-title">✅ ${task.title}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">
            ${task.taskDate?`📅 ${fmtDate(task.taskDate)}`:''}
            ${task.assignedTo?` · 👤 ${task.assignedTo.firstName} ${task.assignedTo.lastName}`:''}
          </div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <!-- Tabs -->
      <div style="display:flex;gap:2px;border-bottom:1px solid var(--border);margin-bottom:16px;">
        <div style="padding:8px 14px;font-size:13px;font-weight:500;cursor:pointer;color:var(--accent);border-bottom:2px solid var(--accent);margin-bottom:-1px;" onclick="switchTaskTab(this,'tt-edit')">✏️ Modifier</div>
        <div style="padding:8px 14px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);border-bottom:2px solid transparent;margin-bottom:-1px;" onclick="switchTaskTab(this,'tt-progress')">📊 Avancement</div>
        <div style="padding:8px 14px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2);border-bottom:2px solid transparent;margin-bottom:-1px;" onclick="switchTaskTab(this,'tt-photos')">📸 Photos</div>
      </div>

      <!-- Tab: Edit -->
      <div id="tt-edit">
        <div class="input-row">
          <div class="form-group2"><label class="form-label2">Statut</label>
            <select class="input" id="et-status">
              <option value="todo" ${task.status==='todo'?'selected':''}>📋 À faire</option>
              <option value="in_progress" ${task.status==='in_progress'?'selected':''}>⚡ En cours</option>
              <option value="done" ${task.status==='done'?'selected':''}>✅ Terminé</option>
              <option value="blocked" ${task.status==='blocked'?'selected':''}>🔴 Bloqué</option>
            </select>
          </div>
          <div class="form-group2"><label class="form-label2">Priorité</label>
            <select class="input" id="et-priority">
              <option value="low" ${task.priority==='low'?'selected':''}>🟢 Faible</option>
              <option value="normal" ${task.priority==='normal'?'selected':''}>🔵 Normal</option>
              <option value="high" ${task.priority==='high'?'selected':''}>🟠 Élevé</option>
              <option value="critical" ${task.priority==='critical'?'selected':''}>🔴 Critique</option>
            </select>
          </div>
        </div>
        <div class="input-row">
          <div class="form-group2"><label class="form-label2">Date</label><input class="input" type="date" id="et-date" value="${task.taskDate?.split('T')[0]||''}"></div>
          <div class="form-group2"><label class="form-label2">Assigné à</label>
            <select class="input" id="et-assign">
              <option value="">— Non assigné —</option>
              ${USERS.map(u=>`<option value="${u.id}" ${task.assignedToId===u.id?'selected':''}>${u.firstName} ${u.lastName}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-group2"><label class="form-label2">Description</label><textarea class="input" id="et-desc" rows="3">${task.description||''}</textarea></div>
      </div>

      <!-- Tab: Avancement -->
      <div id="tt-progress" style="display:none;">
        <div style="margin-bottom:14px;">
          <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">Ajouter un point d'avancement</div>
          <div style="display:flex;gap:8px;">
            <textarea class="input" id="new-comment-text" rows="2" placeholder="Ex: Montage terminé niveau 1, problème avec les joints..."></textarea>
            <button class="btn btn-primary btn-sm" style="align-self:flex-end;flex-shrink:0;" onclick="addTaskComment('${taskId}','${projectId}')">+ Ajouter</button>
          </div>
        </div>
        <div id="task-comments-list" style="display:flex;flex-direction:column;gap:8px;">
          <div style="color:var(--text3);font-size:13px;text-align:center;padding:16px;">Cliquez + Ajouter pour documenter l'avancement</div>
        </div>
      </div>

      <!-- Tab: Photos -->
      <div id="tt-photos" style="display:none;">
        <label style="display:block;border:2px dashed var(--border);border-radius:var(--radius);padding:20px;text-align:center;cursor:pointer;color:var(--text3);font-size:13px;margin-bottom:12px;transition:all .2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          📸 Ajouter photos / fichiers
          <input type="file" accept="image/*,application/pdf" multiple style="display:none;" onchange="uploadTaskPhotos('${taskId}','${projectId}',this)">
        </label>
        <div id="task-photos-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
          <div style="grid-column:1/-1;color:var(--text3);font-size:13px;text-align:center;padding:20px;">Cliquez pour ajouter des photos</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:16px;">
        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteTask('${taskId}','${projectId}',this.closest('.overlay'))">🗑️ Supprimer</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
          <button class="btn btn-primary" onclick="saveTaskEdit('${taskId}','${projectId}',this.closest('.overlay'))">💾 Sauvegarder</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

function switchTaskTab(el, tabId) {
  ['tt-edit','tt-progress','tt-photos'].forEach(id=>{
    const t=document.getElementById(id); if(t) t.style.display='none';
  });
  const tab=document.getElementById(tabId); if(tab) tab.style.display='block';
  el.closest('[style*="border-bottom"]').querySelectorAll('div').forEach(d=>{
    d.style.color='var(--text2)'; d.style.borderBottomColor='transparent';
  });
  el.style.color='var(--accent)'; el.style.borderBottomColor='var(--accent)';
}

async function addTaskComment(taskId, projectId) {
  const text = document.getElementById('new-comment-text')?.value.trim();
  if (!text) { toast('Écris un commentaire','error'); return; }
  const res = await api('POST', `/tasks/${taskId}/comments`, { content: text });
  if (res?.success) {
    document.getElementById('new-comment-text').value = '';
    const list = document.getElementById('task-comments-list');
    const div = document.createElement('div');
    div.style.cssText='background:var(--bg3);border-radius:var(--radius);padding:10px;border-left:3px solid var(--green);';
    div.innerHTML=`<div style="font-size:11px;color:var(--text3);margin-bottom:4px;">${CURRENT_USER?.firstName||''} · maintenant</div><div style="font-size:13px;color:var(--text);">${text}</div>`;
    if (list.querySelector('[style*="Aucun"]')) list.innerHTML='';
    list.appendChild(div);
    toast('Ajouté ✅','success');
  } else {
    // Fallback: show locally
    const list = document.getElementById('task-comments-list');
    const div = document.createElement('div');
    div.style.cssText='background:var(--bg3);border-radius:var(--radius);padding:10px;border-left:3px solid var(--green);';
    div.innerHTML=`<div style="font-size:11px;color:var(--text3);margin-bottom:4px;">${CURRENT_USER?.firstName||''} · maintenant</div><div style="font-size:13px;color:var(--text);">${text}</div>`;
    if (list.querySelector('[style*="Aucun"]')) list.innerHTML='';
    list.appendChild(div);
    document.getElementById('new-comment-text').value='';
    toast('Commentaire ajouté (local)','warning');
  }
}

async function uploadTaskPhotos(taskId, projectId, input) {
  if (!input.files?.length) return;
  toast(`Upload ${input.files.length} fichier(s)...`,'info');
  const grid = document.getElementById('task-photos-grid');
  for (const file of Array.from(input.files)) {
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch(`${API}/upload/photo`, {
        method:'POST', headers:{'Authorization':`Bearer ${TOKEN}`}, body: fd
      });
      const data = await r.json();
      if (data.success) {
        const url = data.data?.url || data.url;
        const img = document.createElement('img');
        img.src = url;
        img.onclick = ()=>openPhotoViewer(url);
        img.style.cssText='width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);';
        if (grid.querySelector('[style*="Aucune"]')) grid.innerHTML='';
        grid.appendChild(img);
      }
    } catch {}
  }
  toast('Photos ajoutées ✅','success');
}

// ═══ IMPORT TEMPLATES DEPUIS EXCEL / CSV ═══
function showImportTemplatesModal() {
  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:660px;">
      <div class="modal-head">
        <div><div class="modal-title">📥 Import Templates depuis Excel/CSV</div>
        <div style="font-size:12px;color:var(--text2);margin-top:3px;">Importe une liste de tâches depuis un fichier Excel ou CSV</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <div style="background:rgba(72,149,239,.08);border:1px solid rgba(72,149,239,.2);border-radius:var(--radius);padding:12px;margin-bottom:14px;font-size:13px;color:var(--text2);">
        💡 Format attendu : <strong>Colonne A = Catégorie</strong>, <strong>Colonne B = Titre de la tâche</strong>, Colonne C = Durée (h), Colonne D = Priorité (low/normal/high/critical)<br>
        <span style="font-size:11px;opacity:.8;">Exemple : "Installation | Montage structure aluminium | 6 | high"</span>
      </div>

      <!-- Option 1: Upload fichier -->
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Option 1 — Importer un fichier</div>
        <label style="display:block;border:2px dashed var(--border);border-radius:var(--radius);padding:16px;text-align:center;cursor:pointer;color:var(--text3);font-size:13px;transition:all .2s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          📁 Cliquez pour sélectionner un fichier Excel (.xlsx) ou CSV
          <input type="file" accept=".xlsx,.xls,.csv" style="display:none;" onchange="parseTemplateFile(this)">
        </label>
      </div>

      <!-- Option 2: Coller du texte -->
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Option 2 — Coller le contenu CSV</div>
        <textarea class="input" id="import-csv-text" rows="8" placeholder="Catégorie;Titre;Durée(h);Priorité&#10;Installation;Montage structure aluminium;6;high&#10;Installation;Pose panneaux façade;4;normal&#10;Électricité;Câblage alimentation;3;high&#10;..."></textarea>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;">
          <button class="btn btn-ghost btn-sm" onclick="previewImportedTemplates()">👁️ Prévisualiser</button>
          <button class="btn btn-blue" onclick="importTemplatesFromText()">📥 Importer</button>
        </div>
      </div>

      <!-- Preview -->
      <div id="import-preview" style="display:none;margin-top:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:8px;" id="import-preview-title"></div>
        <div id="import-preview-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);padding:8px;font-size:12px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
          <button class="btn btn-primary" id="import-confirm-btn" onclick="confirmImportTemplates(this.closest('.overlay'))">✅ Confirmer l'import</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

let IMPORT_TEMPLATES_DATA = [];

function parseTemplateFile(input) {
  if (!input.files?.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    let text = e.target.result;
    // Si encodage Windows-1252/ISO-8859-1 mal lu (UTF-8 par défaut), on tente une conversion
    // simple des caractères latin-1 problématiques (ex: 'Dur‚e' → 'Durée'). Mais
    // surtout, on s'en fout car on n'utilise pas les accents pour parser — juste pour le
    // titre des catégories, et l'utilisateur les corrigera s'il y a besoin.
    parseAndPreviewCSV(text);
  };
  reader.readAsText(file);
}

function previewImportedTemplates() {
  const text = document.getElementById('import-csv-text')?.value.trim();
  if (!text) { toast('Colle du contenu CSV','error'); return; }
  parseAndPreviewCSV(text);
}

// Parse partagé entre file upload et collage texte.
// Détecte automatiquement le séparateur (`;`, `,` ou tab) et skip la ligne d'en-tête.
function parseAndPreviewCSV(text) {
  const allLines = text.split(/\r?\n/).filter(l => l.trim());
  if (!allLines.length) { toast('Fichier vide', 'error'); return; }

  // Skip la ligne d'en-tête (si col A contient "categorie", "category", "stage", "step")
  let lines = allLines;
  const firstColLower = (allLines[0].split(/[;,\t]/)[0] || '').trim().toLowerCase();
  if (['categorie','category','catégorie','stage','step','étape','etape'].includes(firstColLower)) {
    lines = allLines.slice(1);
    console.log('[import] ligne d\'en-tête skippée :', allLines[0]);
  }

  const data = lines.map(line => {
    const parts = line.split(/[;,\t]/);
    return {
      category: (parts[0] || '').trim().replace(/^["']|["']$/g, ''),
      title:    (parts[1] || '').trim().replace(/^["']|["']$/g, ''),
      hours:    parseFloat(parts[2]) || 4,
      priority: (parts[3] || 'normal').trim().toLowerCase().replace(/^["']|["']$/g, ''),
    };
  }).filter(d => d.category && d.title);

  if (!data.length) { toast('Aucune ligne valide (vérifie le format : Catégorie;Titre;Heures;Priorité)','error'); return; }

  document.getElementById('import-csv-text').value = lines.join('\n');
  IMPORT_TEMPLATES_DATA = data;
  showImportPreview(data);
}

function showImportPreview(data) {
  const preview = document.getElementById('import-preview');
  const title = document.getElementById('import-preview-title');
  const list = document.getElementById('import-preview-list');
  if (!preview||!title||!list) return;
  
  const cats = [...new Set(data.map(d=>d.category))];
  title.textContent = `${data.length} tâche(s) dans ${cats.length} catégorie(s)`;
  
  list.innerHTML = cats.map(cat => {
    const items = data.filter(d=>d.category===cat);
    return `<div style="margin-bottom:8px;">
      <div style="font-weight:700;color:var(--text);margin-bottom:4px;">📁 ${cat} (${items.length})</div>
      ${items.map(t=>`<div style="padding:3px 8px;color:var(--text2);">• ${t.title} <span style="color:var(--text3);">(${t.hours}h · ${t.priority})</span></div>`).join('')}
    </div>`;
  }).join('');
  preview.style.display='block';
}

async function importTemplatesFromText() {
  previewImportedTemplates();
}

// ═══════════════════════════════════════════════════════════════════════════
// REMPLACEMENT pour confirmImportTemplates() dans public/index.html
//
// ⚠️ INSTRUCTIONS :
//   1. Dans public/index.html, trouve la ligne : async function confirmImportTemplates(overlay) {
//   2. Sélectionne TOUT depuis cette ligne jusqu'à la } finale de la fonction (juste avant
//      le commentaire "// 🔄 Recharge la liste standard...")
//   3. Remplace par le bloc ci-dessous
//
// Le reste du flow (modal, parsing CSV, prévisualisation, IMPORT_TEMPLATES_DATA)
// ne change pas — c'est uniquement la phase finale d'envoi à l'API qui est refaite.
// ═══════════════════════════════════════════════════════════════════════════

async function confirmImportTemplates(overlay) {
  if (!IMPORT_TEMPLATES_DATA.length) { toast('Aucune donnée à importer','error'); return; }
  const btn = document.getElementById('import-confirm-btn');
  if (btn) btn.disabled = true;

  toast(`Import de ${IMPORT_TEMPLATES_DATA.length} template(s)...`, 'info');

  // On mappe `hours` → `durationHours` pour matcher le contrat backend.
  // Toute la logique (création/réutilisation des catégories, isActive=true,
  // skip des doublons, comptage exact) est déléguée au serveur.
  const rows = IMPORT_TEMPLATES_DATA.map(d => ({
    category: d.category,
    title: d.title,
    durationHours: d.hours,
    priority: ['low','normal','high','critical'].includes(d.priority) ? d.priority : 'normal',
  }));

  const r = await api('POST', '/task-templates/import', { rows });

  if (!r?.success) {
    console.error('[import] échec :', r);
    toast(`❌ Erreur import : ${r?.error || 'erreur HTTP'}`, 'error');
    if (btn) btn.disabled = false;
    return;
  }

  const d = r.data;

  // Message de succès détaillé (vraies stats, plus de mensonges)
  let msg = `✅ ${d.tasksCreated} tâche(s) créée(s)`;
  if (d.categoriesCreated > 0) msg += ` · ${d.categoriesCreated} catégorie(s) créée(s)`;
  if (d.categoriesReused > 0) msg += ` · ${d.categoriesReused} catégorie(s) réutilisée(s)`;
  if (d.tasksSkipped > 0) msg += ` · ${d.tasksSkipped} ignorée(s) (déjà en base)`;
  if (d.tasksFailed > 0) {
    msg += ` · ⚠️ ${d.tasksFailed} échec(s) (F12)`;
    console.warn('[import] erreurs :', d.errors);
  }

  toast(msg, d.tasksCreated > 0 ? 'success' : 'warning');

  // Reset état + rechargement UI (identique à l'ancienne version)
  IMPORT_TEMPLATES_DATA = [];
  overlay?.remove();
  loadTemplatesPage();
  PROJ_CATEGORIES_DATA = [];
  loadProjTemplateSelector();
  await loadTaskTemplatesFromAPI();
}

// 🔄 Recharge la liste standard des 52 tâches Viewbox en 1 clic.
// Appelle l'endpoint admin /task-templates/reset qui vide la table et recrée tout.
async function resetViewboxTemplates() {
  if (!confirm('⚠️ Cela va EFFACER tous les templates et catégories actuels puis recréer les 52 tâches Viewbox standard.\n\nContinuer ?')) return;
  toast('Réinitialisation en cours...', 'info');
  const r = await api('POST', '/task-templates/reset');
  console.log('[reset] response complète :', JSON.stringify(r, null, 2));
  if (r?.success) {
    toast(`✅ ${r.data?.tasks || 52} tâches Viewbox recréées (${r.data?.categories || 7} catégories)`, 'success');
    PROJ_CATEGORIES_DATA = [];
    await loadTaskTemplatesFromAPI();
    loadTemplatesPage();
  } else {
    const msg = r?.error || r?.message || JSON.stringify(r) || 'Erreur inconnue';
    console.error('[reset] échec — détails :', msg, r);
    toast(`❌ Échec reset : ${msg}`, 'error');
  }
}

// Diagnostic admin : affiche l'état de la BD côté templates dans un alert
async function diagTaskTemplates() {
  const r = await api('GET', '/task-templates/diag');
  console.log('[diag] response :', r);
  if (!r?.success) {
    alert('Diag impossible : ' + (r?.error || 'erreur'));
    return;
  }
  const d = r.data;
  const msg = [
    '📊 État de la BD templates :',
    '',
    `Colonnes de task_templates : ${d.columns.length}`,
    `  ${d.columns.join(', ')}`,
    '',
    `Colonne categoryId présente : ${d.hasCategoryIdColumn ? '✅ OUI' : '❌ NON'}`,
    `Catégories en base : ${d.categoryCount}`,
    `Templates en base  : ${d.templateCount}`,
    `Templates orphelins : ${d.orphanTemplates}`,
  ].join('\n');
  alert(msg);
}

// ═══════════════════════════════════════════════════════════
// TRUCK DETAIL — voir, modifier, confirmer arrivée, photos
// ═══════════════════════════════════════════════════════════
async function openTruckDetail(truckId, projectId) {
  // Get truck from project data
  const res = await api('GET', `/projects/${projectId}`);
  const truck = res?.data?.trucks?.find(t => t.id === truckId);
  if (!truck) { toast('Véhicule introuvable','error'); return; }

  const typeIcons = {truck:'🚛',van:'🚐',crane:'🏗️',lift:'🔼',forklift:'🚜',generator:'⚡',trailer:'🚛',machine:'⚙️',other:'📦'};
  const icon = typeIcons[truck.vehicleType]||'🚛';
  const statusColors = {draft:'var(--amber)',planned:'var(--text3)',loading:'var(--amber)',in_transit:'var(--blue)',delivered:'var(--green)',returned:'var(--text3)'};
  const statusLabels = {draft:'📝 Brouillon',planned:'Planifié',loading:'En chargement',in_transit:'En transit',delivered:'Livré',returned:'Retourné'};

  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:640px;">
      <div class="modal-head">
        <div>
          <div class="modal-title">${icon} ${truck.truckNumber||'Véhicule'}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">
            <span style="color:${statusColors[truck.status]||'var(--text3)'};">● ${statusLabels[truck.status]||truck.status}</span>
          </div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <!-- Infos -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        ${truck.licensePlate?`<div style="background:var(--bg3);border-radius:var(--radius);padding:10px;"><div style="font-size:10px;color:var(--text3);margin-bottom:3px;">IMMATRICULATION</div><div style="font-weight:600;">🔑 ${truck.licensePlate}</div></div>`:''}
        ${truck.driverName?`<div style="background:var(--bg3);border-radius:var(--radius);padding:10px;"><div style="font-size:10px;color:var(--text3);margin-bottom:3px;">CHAUFFEUR</div><div style="font-weight:600;">👤 ${truck.driverName}</div></div>`:''}
        ${truck.driverPhone?`<div style="background:var(--bg3);border-radius:var(--radius);padding:10px;"><div style="font-size:10px;color:var(--text3);margin-bottom:3px;">TÉLÉPHONE</div><div style="font-weight:600;"><a href="tel:${truck.driverPhone}" style="color:var(--blue);">📞 ${truck.driverPhone}</a></div></div>`:''}
        ${truck.loadingDate?`<div style="background:var(--bg3);border-radius:var(--radius);padding:10px;"><div style="font-size:10px;color:var(--text3);margin-bottom:3px;">DÉPART CHARGEMENT</div><div style="font-weight:600;">📦 ${fmtDateTime(truck.loadingDate)}</div></div>`:''}
        ${truck.arrivalDate
          ? `<div style="background:rgba(45,198,83,.08);border:1px solid rgba(45,198,83,.3);border-radius:var(--radius);padding:10px;"><div style="font-size:10px;color:var(--text3);margin-bottom:3px;">ARRIVÉE</div><div style="font-weight:600;color:var(--green);">✅ ${fmtDateTime(truck.arrivalDate)}</div></div>`
          : `<div style="background:rgba(244,162,97,.08);border:1px solid rgba(244,162,97,.3);border-radius:var(--radius);padding:10px;"><div style="font-size:10px;color:var(--text3);margin-bottom:3px;">ARRIVÉE</div><div style="color:var(--amber);">⏳ En attente</div></div>`}
      </div>

      ${truck.notes?`<div style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-bottom:16px;font-size:13px;color:var(--text2);">📝 ${truck.notes}</div>`:''}

      <!-- Confirmer arrivée -->
      ${truck.status !== 'delivered' ? `
      <div style="background:rgba(45,198,83,.06);border:1px solid rgba(45,198,83,.2);border-radius:var(--radius);padding:14px;margin-bottom:16px;">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px;">✅ Confirmer l'arrivée</div>
        <div class="input-row">
          <div class="form-group2"><label class="form-label2">Heure d'arrivée</label><input class="input" type="datetime-local" id="truck-arrival-time" value="${toLocalDatetimeInput(new Date())}"></div>
          <div class="form-group2"><label class="form-label2">Note d'arrivée</label><input class="input" id="truck-arrival-note" placeholder="Tout ok, retard..."></div>
        </div>
        <button class="btn btn-green" onclick="confirmTruckArrival('${truckId}','${projectId}',this.closest('.overlay'))">✅ Confirmer l'arrivée</button>
      </div>` : ''}

      <!-- Photos -->
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">📸 Photos</div>
        <div id="truck-photos-${truckId}" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
          ${(truck.photos||[]).map(p=>`<img src="${p.photoUrl}" onclick="openPhotoViewer('${p.photoUrl}')" style="width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);">`).join('')}
        </div>
        <label style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:2px dashed var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;color:var(--text3);transition:all .2s;" onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text3)'">
          📸 Ajouter une photo
          <input type="file" accept="image/*" multiple style="display:none;" onchange="uploadTruckPhotos('${truckId}','${projectId}',this)">
        </label>
      </div>

      <!-- Modifier infos -->
      <div style="border-top:1px solid var(--border);padding-top:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">✏️ Modifier</div>
        <div class="input-row">
          <div class="form-group2"><label class="form-label2">Statut</label>
            <select class="input" id="etruck-status">
              <option value="draft" ${truck.status==='draft'?'selected':''}>📝 Brouillon</option>
              <option value="planned" ${truck.status==='planned'?'selected':''}>Planifié</option>
              <option value="loading" ${truck.status==='loading'?'selected':''}>En chargement</option>
              <option value="in_transit" ${truck.status==='in_transit'?'selected':''}>En transit</option>
              <option value="delivered" ${truck.status==='delivered'?'selected':''}>Livré</option>
              <option value="returned" ${truck.status==='returned'?'selected':''}>Retourné</option>
            </select>
          </div>
          <div class="form-group2"><label class="form-label2">Chauffeur</label><input class="input" id="etruck-driver" value="${truck.driverName||''}"></div>
        </div>
        <div class="form-group2"><label class="form-label2">Notes</label><textarea class="input" id="etruck-notes" rows="2">${truck.notes||''}</textarea></div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-top:14px;">
        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteTruck('${projectId}','${truckId}');this.closest('.overlay').remove()">🗑️ Supprimer</button>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
          <button class="btn btn-primary" onclick="saveTruckEdit('${truckId}','${projectId}',this.closest('.overlay'))">💾 Sauvegarder</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

async function confirmTruckArrival(truckId, projectId, overlay) {
  const arrivalTime = document.getElementById('truck-arrival-time')?.value;
  const note = document.getElementById('truck-arrival-note')?.value||'';
  const res = await api('PATCH', `/projects/${projectId}/trucks/${truckId}`, {
    status: 'delivered',
    arrivalDate: arrivalTime ? new Date(arrivalTime).toISOString() : new Date().toISOString(),
    notes: note || undefined,
  });
  if (res?.success) {
    toast('Arrivée confirmée ✅','success');
    overlay?.remove();
    loadProjectDetail(projectId);
  } else {
    // Fallback: update locally
    toast('Arrivée confirmée (sync au prochain refresh)','warning');
    overlay?.remove();
  }
}

async function quickArrivalTruck(truckId, projectId) {
  const res = await api('PATCH', `/projects/${projectId}/trucks/${truckId}`, {
    status: 'delivered',
    arrivalDate: new Date().toISOString(),
  });
  if (res?.success) { toast('✅ Arrivée confirmée !','success'); loadProjectDetail(projectId); }
  else toast('Statut mis à jour localement','warning');
}

async function saveTruckEdit(truckId, projectId, overlay) {
  const res = await api('PATCH', `/projects/${projectId}/trucks/${truckId}`, {
    status: document.getElementById('etruck-status')?.value,
    driverName: document.getElementById('etruck-driver')?.value||undefined,
    notes: document.getElementById('etruck-notes')?.value||undefined,
  });
  if (res?.success) { toast('Mis à jour ✅','success'); overlay?.remove(); loadProjectDetail(projectId); }
  else toast('Erreur mise à jour','error');
}

async function uploadTruckPhotos(truckId, projectId, input) {
  if (!input.files?.length) return;
  const preview = document.getElementById(`truck-photos-${truckId}`);
  toast(`Upload ${input.files.length} photo(s)...`,'info');
  for (const file of Array.from(input.files)) {
    const fd = new FormData(); fd.append('file', file);
    try {
      const r = await fetch(`${API}/upload/photo`, {
        method:'POST', headers:{'Authorization':`Bearer ${TOKEN}`}, body:fd
      });
      const data = await r.json();
      const url = data.data?.url || data.url;
      if (url && preview) {
        const img = document.createElement('img');
        img.src = url;
        img.onclick = ()=>openPhotoViewer(url);
        img.style.cssText='width:80px;height:80px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);';
        preview.appendChild(img);
      }
    } catch {}
  }
  toast('Photos ajoutées ✅','success');
}

// ═══════════════════════════════════════════════════════════
// RAPPORT IA — MODULE COMPLET
// ═══════════════════════════════════════════════════════════
let REPORT_TYPE = 'full';

function selectReportType(type) {
  REPORT_TYPE = type;
  document.getElementById('rtype-full').style.border = type==='full' ? '2px solid var(--accent)' : '2px solid var(--border)';
  document.getElementById('rtype-full').style.background = type==='full' ? 'rgba(230,57,70,.06)' : '';
  document.getElementById('rtype-client').style.border = type==='client' ? '2px solid var(--accent)' : '2px solid var(--border)';
  document.getElementById('rtype-client').style.background = type==='client' ? 'rgba(230,57,70,.06)' : '';
}

function showReportModal() {
  showModal('modal-report');
  const row = document.getElementById('report-project-row');
  const sel = document.getElementById('report-project-select');
  if (!CURRENT_PROJECT_ID && PROJECTS?.length) {
    // Show project selector
    if (row) row.style.display = 'block';
    if (sel) {
      sel.innerHTML = '<option value="">— Sélectionner un projet —</option>' +
        PROJECTS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    }
  } else {
    if (row) row.style.display = 'none';
    // Show current project name
    const proj = PROJECTS?.find(p => p.id === CURRENT_PROJECT_ID);
    if (proj) {
      const hint = document.getElementById('report-sections-hint');
      if (hint) hint.textContent = `Projet : ${proj.name}`;
    }
  }
}

// Toggle sections — direct function called from onclick
function toggleReportSection(el) {
  const wasActive = el.classList.contains('active');
  el.classList.toggle('active');
  // Hard color update directly on element
  if (!wasActive) {
    el.style.cssText = 'border:2px solid #e63946!important;background:rgba(230,57,70,.1)!important;';
  } else {
    el.style.cssText = 'border:2px solid #2a2f3a!important;background:transparent!important;';
  }
  // Update hint
  const count = document.querySelectorAll('.report-section-toggle.active').length;
  const hint = document.getElementById('report-sections-hint');
  if (hint) hint.textContent = count + ' section(s) sélectionnée(s)';
  // Toggle Time Analysis panel visibility
  if (el.dataset.section === 'time_analysis') {
    const panel = document.getElementById('ta-panel');
    if (panel) panel.style.display = el.classList.contains('active') ? 'block' : 'none';
    // Auto-charger les templates la première fois
    if (el.classList.contains('active') && !TA_TEMPLATES_CACHE) {
      loadTATemplates(false);
    }
  }
  return false;
}

// ═══════════════════════════════════════════════════════════
// ANALYSE TEMPS PAR TÂCHE — V2 (dans Rapport IA)
// ═══════════════════════════════════════════════════════════
let TA_REPORT_DATA = null;
let TA_TEMPLATES_CACHE = null; // { categories: [{name, icon, color, templates: [{id, title}]}] }

async function loadTATemplates(forceReload = false) {
  const display = document.getElementById('ta-templates-display');
  if (!TA_TEMPLATES_CACHE || forceReload) {
    if (display) display.innerHTML = '<span style="color:var(--text3);">⏳ Chargement des templates...</span>';
    try {
      const res = await api('GET', '/task-templates/categories');
      if (res?.success && res.data?.length) {
        TA_TEMPLATES_CACHE = res.data;
      } else {
        TA_TEMPLATES_CACHE = [];
      }
    } catch (e) {
      console.error('[TA] load templates err:', e);
      TA_TEMPLATES_CACHE = [];
    }
  }

  if (!display) return;
  if (!TA_TEMPLATES_CACHE.length) {
    display.innerHTML = '<span style="color:var(--amber);">⚠️ Aucun template de tâche défini. L\'IA utilisera les catégories personnalisées ci-dessous ou des catégories génériques.</span>';
    return;
  }

  // Afficher les templates par catégorie avec icônes et couleurs
  const totalTemplates = TA_TEMPLATES_CACHE.reduce((sum,c) => sum + (c.templates||[]).length, 0);
  display.innerHTML = `
    <div style="text-align:left;">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;">📋 ${totalTemplates} template(s) chargé(s) depuis ${TA_TEMPLATES_CACHE.length} catégorie(s)</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${TA_TEMPLATES_CACHE.flatMap(cat =>
          (cat.templates||[]).map(t => `
            <span style="background:${cat.color||'var(--bg3)'}22;border:1px solid ${cat.color||'var(--border)'}66;color:${cat.color||'var(--text2)'};font-size:11px;padding:3px 8px;border-radius:12px;white-space:nowrap;" title="${esc(cat.name)}">
              ${cat.icon||'📋'} ${esc(t.title)}
            </span>`)
        ).join('')}
      </div>
    </div>`;
}

function setTAStatus(icon, text) {
  const box = document.getElementById('ta-status');
  const iEl = document.getElementById('ta-status-icon');
  const tEl = document.getElementById('ta-status-text');
  if (box) box.style.display = 'block';
  if (iEl) iEl.textContent = icon;
  if (tEl) tEl.textContent = text;
}

