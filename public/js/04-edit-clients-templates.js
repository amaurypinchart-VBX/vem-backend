async function editClient(id) {
  // Re-fetch frais pour récupérer aussi les contacts (qui ne sont pas dans CLIENTS)
  const res = await api('GET', `/clients/${id}`);
  if (!res?.success) { toast('Client introuvable', 'error'); return; }
  const client = res.data;
  const contacts = Array.isArray(client.contacts) ? client.contacts : [];

  const el = document.createElement('div'); el.className='overlay open';
  el.id = 'overlay-edit-client';
  el.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-head">
        <div class="modal-title">✏️ Modifier ${escapeHtml(client.name)}</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Nom société *</label><input class="input" id="ec-name" value="${escapeHtmlAttr(client.name)}"></div>
        <div class="form-group2"><label class="form-label2">N° TVA / VAT</label><input class="input" id="ec-vat" value="${escapeHtmlAttr(client.vat||'')}" placeholder="BE0123456789"></div>
      </div>
      <div class="form-group2"><label class="form-label2">Adresse</label><input class="input" id="ec-addr" value="${escapeHtmlAttr(client.address||'')}" placeholder="Rue, Code postal, Ville"></div>
      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Email société</label><input class="input" type="email" id="ec-email" value="${escapeHtmlAttr(client.email||'')}"></div>
        <div class="form-group2"><label class="form-label2">Téléphone société</label><input class="input" id="ec-phone" value="${escapeHtmlAttr(client.phone||'')}"></div>
      </div>

      <!-- Contacts -->
      <div style="border-top:1px solid var(--border);margin:14px 0 12px;padding-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <label class="form-label2" style="margin:0;">Personnes de contact (${contacts.length})</label>
          <button class="btn btn-ghost btn-xs" onclick="addEditClientContact()">+ Ajouter contact</button>
        </div>
        <div id="ec-contacts-list"></div>
      </div>

      <div style="display:flex;gap:10px;justify-content:space-between;margin-top:14px;">
        <button class="btn btn-danger" onclick="deleteClient('${id}', this.closest('.overlay'))" style="background:#e63946;color:#fff;border-color:#e63946;">🗑️ Supprimer ce client</button>
        <div style="display:flex;gap:10px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
          <button class="btn btn-primary" onclick="saveClientEdit('${id}',this.closest('.overlay'))">💾 Sauvegarder</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{if(e.target===el)el.remove();});

  // Remplir la liste des contacts
  const list = document.getElementById('ec-contacts-list');
  EC_CONTACTS_COUNT = 0;
  if (contacts.length === 0) {
    // Ajoute une ligne vide pour commencer
    addEditClientContact();
  } else {
    contacts.forEach(c => addEditClientContact(c));
  }
}

let EC_CONTACTS_COUNT = 0;
function addEditClientContact(contact) {
  const list = document.getElementById('ec-contacts-list');
  if (!list) return;
  const idx = EC_CONTACTS_COUNT++;
  const c = contact || {};
  const div = document.createElement('div');
  div.className = 'ec-contact-row';
  div.id = `ec-contact-${idx}`;
  div.dataset.contactId = c.id || '';
  div.style.cssText = 'display:grid;grid-template-columns:1.3fr 1fr 1.2fr 1fr auto auto;gap:6px;margin-bottom:6px;align-items:center;';
  div.innerHTML = `
    <input class="input ec-c-name"  placeholder="Prénom Nom *" value="${escapeHtmlAttr(c.name||'')}" style="font-size:12px;">
    <input class="input ec-c-role"  placeholder="Fonction"     value="${escapeHtmlAttr(c.role||'')}" style="font-size:12px;">
    <input class="input ec-c-email" placeholder="Email" type="email" value="${escapeHtmlAttr(c.email||'')}" style="font-size:12px;">
    <input class="input ec-c-phone" placeholder="Téléphone"    value="${escapeHtmlAttr(c.phone||'')}" style="font-size:12px;">
    <label style="font-size:11px;color:var(--text3);display:flex;align-items:center;gap:4px;cursor:pointer;" title="Marquer comme contact principal">
      <input type="radio" name="ec-primary" class="ec-c-primary" ${c.isPrimary?'checked':''}>★
    </label>
    <button class="btn btn-ghost btn-xs" onclick="this.closest('.ec-contact-row').remove()" title="Supprimer">✕</button>`;
  list.appendChild(div);
}

async function saveClientEdit(id, overlay) {
  const name = document.getElementById('ec-name').value.trim();
  if (!name) { toast('Nom de société obligatoire', 'error'); return; }

  // Collecter les contacts
  const contacts = [];
  document.querySelectorAll('#ec-contacts-list .ec-contact-row').forEach((row, i) => {
    const n = row.querySelector('.ec-c-name')?.value.trim();
    if (!n) return; // ignore les lignes vides
    contacts.push({
      id:        row.dataset.contactId || undefined,
      name:      n,
      role:      row.querySelector('.ec-c-role')?.value.trim() || null,
      email:     row.querySelector('.ec-c-email')?.value.trim() || null,
      phone:     row.querySelector('.ec-c-phone')?.value.trim() || null,
      isPrimary: row.querySelector('.ec-c-primary')?.checked || false,
      sortOrder: i,
    });
  });

  const res = await api('PATCH', `/clients/${id}`, {
    name,
    vat:         document.getElementById('ec-vat').value || null,
    contactName: contacts.find(c=>c.isPrimary)?.name || contacts[0]?.name || null,
    email:       document.getElementById('ec-email').value || null,
    phone:       document.getElementById('ec-phone').value || null,
    address:     document.getElementById('ec-addr').value || null,
    contacts,
  });
  if (res?.success) {
    toast('Client mis à jour ✅','success');
    overlay.remove();
    loadClientsPage();
    loadClients();
  } else {
    toast('Erreur sauvegarde', 'error');
  }
}

async function deleteClient(id, overlay) {
  if (!confirm('Êtes-vous sûr de vouloir supprimer ce client ?\n\nSi des projets y sont rattachés, la suppression sera refusée.')) return;
  const res = await api('DELETE', `/clients/${id}`);
  if (res?.success) {
    toast('Client supprimé', 'success');
    overlay?.remove();
    loadClientsPage();
    loadClients();
  } else {
    toast(res?.error || 'Suppression impossible', 'error');
  }
}

function escapeHtml(s) {
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function escapeHtmlAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

// ═══ TOOLBOX NEW MODAL ALIAS ═══
// Toolbox creation is handled by creating a box with toolbox type
// For now show the box modal as a substitute
document.addEventListener('DOMContentLoaded', () => {
  // Create alias modal element for toolbox
});

function showModal_toolboxNew() {
  toast('Créez une boîte à outils depuis le menu Boîtes à outils global','info');
  goto('toolbox');
}

// Override showModal to catch modal-toolbox-new
const _origShowModal = showModal;

// ═══ PROJECT TEMPLATES SELECTOR — Basé sur Excel ViewBox ═══
const STAGE_ICONS = {
  'To Do': '📋', 'PRE-PROD': '🔧', 'Booking Supplier': '📞',
  'Warehouse Preparation': '📦', 'Installation': '🏗️',
  'Dismantling': '🔨', 'Come Back Warehouse': '🏠'
};

// ═══════════════════════════════════════════════════════════
// TEMPLATE DE TÂCHES — APPLIQUER À UN PROJET EXISTANT
// ═══════════════════════════════════════════════════════════
// Ouvre un modal contenant le même sélecteur que celui de la création de
// projet. L'utilisateur coche les tâches qu'il veut, choisit (optionnellement)
// une date et un assigné par ligne, puis on les pousse toutes en POST /tasks
// pour le projet courant.
function openTemplateTasksModal() {
  if (!CURRENT_PROJECT_ID) { toast('Ouvre un projet avant', 'error'); return; }

  const el = document.createElement('div');
  el.className = 'overlay open';
  el.id = 'overlay-tpl-tasks';
  el.innerHTML = `
    <div class="modal" style="max-width:880px;">
      <div class="modal-head">
        <div>
          <div class="modal-title">📋 Ajouter des tâches depuis le template</div>
          <div style="font-size:12px;color:var(--text2);margin-top:2px;">Coche les tâches que tu veux ajouter au projet. La date et l'assigné sont optionnels.</div>
        </div>
        <button class="modal-close" onclick="closeTemplateTasksModal()">×</button>
      </div>

      <!-- Bouton assignation globale -->
      <div style="display:flex;gap:10px;align-items:center;background:var(--bg3);border-radius:var(--radius);padding:10px;margin-bottom:14px;flex-wrap:wrap;">
        <select id="tpl-modal-global-assign" class="input" style="flex:1;min-width:180px;font-size:13px;">
          <option value="">— Assigner toutes les tâches cochées à... —</option>
        </select>
        <button class="btn btn-outline btn-sm" onclick="tplModalApplyGlobalAssign()">Appliquer</button>
        <div style="flex-basis:100%;font-size:11px;color:var(--text3);">L'assignation par tâche reste libre — celle-ci est juste un raccourci.</div>
      </div>

      <!-- Barre de recherche (filtre live des tâches du template) -->
      <div style="position:relative;margin-bottom:10px;">
        <input id="tpl-modal-search" class="input" placeholder="🔍 Rechercher une tâche (titre ou étape)..."
          style="padding-left:32px;padding-right:34px;font-size:13px;"
          oninput="filterTemplateTasksModal(this.value)">
        <span style="position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:14px;pointer-events:none;">🔎</span>
        <button onclick="document.getElementById('tpl-modal-search').value='';filterTemplateTasksModal('')"
          style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:4px;" title="Effacer">✕</button>
      </div>
      <div id="tpl-modal-search-info" style="font-size:11px;color:var(--text3);margin-bottom:6px;display:none;"></div>

      <!-- Le sélecteur lui-même (rempli à l'ouverture) -->
      <div id="tpl-modal-selector" style="max-height:50vh;overflow-y:auto;padding-right:4px;"></div>

      <!-- Compteur -->
      <div id="tpl-modal-count" style="font-size:12px;color:var(--text3);margin-top:10px;"></div>

      <!-- Actions -->
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline" onclick="closeTemplateTasksModal()">Annuler</button>
        <button class="btn btn-primary" id="tpl-modal-submit-btn" onclick="submitTemplateTasksToCurrent()">➕ Ajouter les tâches cochées</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) closeTemplateTasksModal(); });

  // On greffe le sélecteur HTML dans le modal en réutilisant la même logique
  // que loadProjTemplateSelector, mais en remplaçant les IDs pour ne pas
  // entrer en conflit avec celui de la création de projet (qui peut coexister
  // dans le DOM si modal-proj a déjà été ouvert dans la session).
  buildTemplateSelectorInto('tpl-modal-selector', 'tpl-modal-global-assign');

  // Préselectionner : aucune par défaut, l'utilisateur choisit
  document.querySelectorAll('#tpl-modal-selector .proj-tpl-check').forEach(cb => {
    cb.checked = false;
  });
  updateTplModalCount();
}

function closeTemplateTasksModal() {
  document.getElementById('overlay-tpl-tasks')?.remove();
}

function buildTemplateSelectorInto(containerId, globalAssignId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Remplir le select d'assignation globale
  const globalAssign = document.getElementById(globalAssignId);
  if (globalAssign && USERS.length) {
    globalAssign.innerHTML = '<option value="">— Assigner toutes les tâches cochées à... —</option>' +
      USERS.map(u => `<option value="${u.id}">${u.firstName} ${u.lastName}</option>`).join('');
  }

  let html = '';
  Object.entries(TASK_TEMPLATES_DATA).forEach(([stage, tasks]) => {
    const icon = STAGE_ICONS[stage] || '📋';
    const stageId = 'tplmod-stage-' + stage.replace(/[^a-z0-9]/gi,'_');
    html += `
      <div style="margin-bottom:6px;">
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg2);border-radius:8px;cursor:pointer;margin-bottom:4px;border:1px solid var(--border);" onclick="toggleStageSection('${stageId}')">
          <span style="font-size:16px;">${icon}</span>
          <span style="font-size:13px;font-weight:700;flex:1;">${stage}</span>
          <span style="font-size:11px;color:var(--text3);">${tasks.length} tâches</span>
          <button class="btn btn-ghost btn-xs" style="font-size:10px;" onclick="event.stopPropagation();tplModalToggleStage('${stageId}',true)">✅</button>
          <button class="btn btn-ghost btn-xs" style="font-size:10px;" onclick="event.stopPropagation();tplModalToggleStage('${stageId}',false)">☐</button>
          <span id="${stageId}-chevron" style="font-size:11px;color:var(--text3);">▼</span>
        </div>
        <div id="${stageId}" style="display:flex;flex-direction:column;gap:3px;padding:0 2px 4px;">
          ${tasks.map((t, idx) => {
            const taskId = `tplmod_${stageId}_${idx}`;
            return `
            <div style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border-radius:8px;">
              <input type="checkbox" class="proj-tpl-check" id="${taskId}"
                data-title="${t.title.replace(/"/g,'&quot;')}"
                data-stage="${stage}"
                onchange="updateTplModalCount()"
                style="width:16px;height:16px;accent-color:var(--accent);flex-shrink:0;cursor:pointer;">
              <label for="${taskId}" style="flex:1;font-size:12px;cursor:pointer;">${t.title}</label>
              <input type="date" class="tpl-date input" data-task="${taskId}"
                style="font-size:11px;padding:4px 6px;width:130px;flex-shrink:0;" title="Date (optionnel)">
              <select class="tpl-assign input" data-task="${taskId}"
                style="font-size:11px;padding:4px 6px;width:140px;flex-shrink:0;" title="Assigné (optionnel)">
                <option value="">— Aucun —</option>
                ${USERS.map(u => `<option value="${u.id}">${u.firstName} ${u.lastName}</option>`).join('')}
              </select>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  });
  container.innerHTML = html;
}

function tplModalToggleStage(stageId, checked) {
  document.querySelectorAll(`#${stageId} .proj-tpl-check`).forEach(cb => { cb.checked = checked; });
  updateTplModalCount();
}

function tplModalApplyGlobalAssign() {
  const userId = document.getElementById('tpl-modal-global-assign').value;
  if (!userId) { toast('Choisis d\'abord une personne', 'warning'); return; }
  let count = 0;
  document.querySelectorAll('#tpl-modal-selector .proj-tpl-check:checked').forEach(cb => {
    const sel = document.querySelector(`#tpl-modal-selector .tpl-assign[data-task="${cb.id}"]`);
    if (sel) { sel.value = userId; count++; }
  });
  toast(count ? `${count} tâche(s) assignée(s)` : 'Aucune tâche cochée', count ? 'success' : 'warning');
}

// Recherche live dans le modal template : filtre les tâches selon leur titre OU
// le nom de leur étape (case insensible, sans accent).
function filterTemplateTasksModal(query) {
  const q = (query || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,''); // strip diacritics
  const container = document.getElementById('tpl-modal-selector');
  if (!container) return;

  const allRows = container.querySelectorAll('.proj-tpl-check');
  let visibleCount = 0, totalCount = allRows.length;

  // Pour chaque ligne de tâche, on regarde si titre ou stage matche
  allRows.forEach(cb => {
    const title = (cb.dataset.title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const stage = (cb.dataset.stage || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    const match = !q || title.includes(q) || stage.includes(q);
    const row = cb.closest('div');
    if (row) row.style.display = match ? '' : 'none';
    if (match) visibleCount++;
  });

  // Masquer aussi les sections d'étape qui n'ont plus aucune tâche visible
  container.querySelectorAll('[id^="tplmod-stage-"]').forEach(stageDiv => {
    const sectionWrapper = stageDiv.parentElement;
    if (!sectionWrapper) return;
    const hasVisible = stageDiv.querySelector('.proj-tpl-check:not([style*="display: none"])');
    // Comme on a appliqué style sur le row parent, on vérifie autrement :
    const visibleChildren = Array.from(stageDiv.querySelectorAll('.proj-tpl-check'))
      .filter(c => c.closest('div').style.display !== 'none');
    sectionWrapper.style.display = visibleChildren.length > 0 ? '' : 'none';
  });

  // Affichage du compteur de recherche
  const info = document.getElementById('tpl-modal-search-info');
  if (info) {
    if (q) {
      info.style.display = 'block';
      info.textContent = `${visibleCount} / ${totalCount} tâche(s) correspondent à "${query}"`;
    } else {
      info.style.display = 'none';
    }
  }
}

function updateTplModalCount() {
  const count = document.querySelectorAll('#tpl-modal-selector .proj-tpl-check:checked').length;
  const total = document.querySelectorAll('#tpl-modal-selector .proj-tpl-check').length;
  const el = document.getElementById('tpl-modal-count');
  if (el) el.textContent = `${count} / ${total} tâche(s) cochée(s)`;
  const btn = document.getElementById('tpl-modal-submit-btn');
  if (btn) btn.disabled = count === 0;
}

async function submitTemplateTasksToCurrent() {
  const projectId = CURRENT_PROJECT_ID;
  if (!projectId) { toast('Aucun projet courant', 'error'); return; }

  // Collecte
  const tasks = [];
  document.querySelectorAll('#tpl-modal-selector .proj-tpl-check:checked').forEach(cb => {
    const dateEl   = document.querySelector(`#tpl-modal-selector .tpl-date[data-task="${cb.id}"]`);
    const assignEl = document.querySelector(`#tpl-modal-selector .tpl-assign[data-task="${cb.id}"]`);
    tasks.push({
      title:    cb.dataset.title,
      stage:    cb.dataset.stage,
      taskDate: dateEl?.value || null,
      assignedTo: assignEl?.value || null,
    });
  });
  if (!tasks.length) { toast('Coche au moins une tâche', 'error'); return; }

  const btn = document.getElementById('tpl-modal-submit-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Création...'; }

  toast(`Création de ${tasks.length} tâche(s)...`, 'info');
  const results = await Promise.all(tasks.map(t =>
    api('POST', '/tasks', {
      projectId,
      title:        t.title,
      stage:        t.stage || undefined,    // VRAI champ — préserve l'arborescence template
      status:       'todo',
      priority:     'normal',
      taskDate:     t.taskDate || undefined,
      assignedToId: t.assignedTo || undefined,
    })
  ));
  const ok = results.filter(r => r?.success).length;
  const fail = results.length - ok;

  if (fail === 0)     toast(`${ok} tâche(s) ajoutée(s) au projet ✅`, 'success');
  else if (ok === 0)  toast(`Aucune tâche créée (${fail} échec(s))`, 'error');
  else                toast(`${ok} créée(s) — ${fail} échec(s)`, 'warning');

  closeTemplateTasksModal();
  loadDetailTasks(projectId);
}

function loadProjTemplateSelector() {
  const el = document.getElementById('proj-templates-selector');
  if (!el) return;

  // Populate global assign dropdown
  const globalAssign = document.getElementById('tmpl-global-assign');
  if (globalAssign && USERS.length) {
    globalAssign.innerHTML = '<option value="">— Assigner tout à... —</option>' +
      USERS.map(u => `<option value="${u.id}">${u.firstName} ${u.lastName}</option>`).join('');
  }

  let html = '';
  Object.entries(TASK_TEMPLATES_DATA).forEach(([stage, tasks]) => {
    const icon = STAGE_ICONS[stage] || '📋';
    const stageId = 'stage-' + stage.replace(/[^a-z0-9]/gi,'_');
    html += `
      <div style="margin-bottom:6px;">
        <!-- Stage header -->
        <div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--bg2);border-radius:8px;cursor:pointer;margin-bottom:4px;border:1px solid var(--border);"
          onclick="toggleStageSection('${stageId}')">
          <span style="font-size:16px;">${icon}</span>
          <span style="font-size:13px;font-weight:700;flex:1;">${stage}</span>
          <span style="font-size:11px;color:var(--text3);">${tasks.length} tâches</span>
          <button class="btn btn-ghost btn-xs" style="font-size:10px;" onclick="event.stopPropagation();toggleStageChecks('${stageId}',true)">✅</button>
          <button class="btn btn-ghost btn-xs" style="font-size:10px;" onclick="event.stopPropagation();toggleStageChecks('${stageId}',false)">☐</button>
          <span id="${stageId}-chevron" style="font-size:11px;color:var(--text3);">▼</span>
        </div>
        <!-- Tasks list -->
        <div id="${stageId}" style="display:flex;flex-direction:column;gap:3px;padding:0 2px 4px;">
          ${tasks.map((t, idx) => {
            const taskId = `tpl_${stageId}_${idx}`;
            const defaultAssignee = t.assignees?.[0] || '';
            return `
            <div class="tpl-task-row" id="row-${taskId}" style="display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg3);border-radius:8px;border:1px solid transparent;transition:all .15s;">
              <!-- Checkbox -->
              <input type="checkbox" class="proj-tpl-check" id="${taskId}"
                data-title="${t.title.replace(/"/g,'&quot;')}"
                data-stage="${stage}"
                data-default-assignee="${defaultAssignee}"
                checked
                style="width:16px;height:16px;accent-color:var(--accent);flex-shrink:0;cursor:pointer;"
                onchange="updateProjTplCount();highlightRow('row-${taskId}',this.checked)">
              <!-- Title -->
              <label for="${taskId}" style="flex:1;font-size:12px;line-height:1.4;cursor:pointer;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${t.title}">${t.title}</label>
              <!-- Date -->
              <input type="date" class="tpl-date" data-task="${taskId}"
                style="width:120px;padding:3px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;flex-shrink:0;"
                onchange="updateProjTplCount()">
              <!-- Assignee -->
              <select class="tpl-assign" data-task="${taskId}"
                style="width:130px;padding:3px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;flex-shrink:0;">
                <option value="">— Équipe —</option>
                ${(window.USERS||[]).map(u => `<option value="${u.id}" ${u.firstName+' '+u.lastName===defaultAssignee?'selected':''}>${u.firstName} ${u.lastName}</option>`).join('')}
              </select>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  });

  el.innerHTML = html;
  updateProjTplCount();
}

function highlightRow(rowId, checked) {
  const row = document.getElementById(rowId);
  if (!row) return;
  row.style.opacity = checked ? '1' : '0.4';
  row.style.borderColor = checked ? 'var(--border)' : 'transparent';
}

function toggleStageSection(stageId) {
  const el = document.getElementById(stageId);
  const chevron = document.getElementById(stageId+'-chevron');
  if (!el) return;
  const hidden = el.style.display === 'none';
  el.style.display = hidden ? 'flex' : 'none';
  if (chevron) chevron.textContent = hidden ? '▼' : '▶';
}

function toggleStageChecks(stageId, checked) {
  document.querySelectorAll(`#${stageId} .proj-tpl-check`).forEach(cb => {
    cb.checked = checked;
    highlightRow('row-' + cb.id, checked);
  });
  updateProjTplCount();
}

function applyGlobalDate(date) {
  document.querySelectorAll('.tpl-date').forEach(input => input.value = date);
}

function applyGlobalAssign(userId) {
  if (!userId) return;
  document.querySelectorAll('.tpl-assign').forEach(sel => sel.value = userId);
}

function updateProjTplCount() {
  const count = document.querySelectorAll('.proj-tpl-check:checked').length;
  const total = document.querySelectorAll('.proj-tpl-check').length;
  const el = document.getElementById('proj-tpl-count');
  if (el) el.textContent = `${count} / ${total} tâche(s) sélectionnée(s)`;
}

function selectAllProjTemplates() {
  document.querySelectorAll('.proj-tpl-check').forEach(cb => {
    cb.checked = true;
    highlightRow('row-' + cb.id, true);
  });
  updateProjTplCount();
}

function deselectAllProjTemplates() {
  document.querySelectorAll('.proj-tpl-check').forEach(cb => {
    cb.checked = false;
    highlightRow('row-' + cb.id, false);
  });
  updateProjTplCount();
}

function getSelectedProjTasks() {
  const tasks = [];
  document.querySelectorAll('.proj-tpl-check:checked').forEach(cb => {
    const dateEl = document.querySelector(`.tpl-date[data-task="${cb.id}"]`);
    const assignEl = document.querySelector(`.tpl-assign[data-task="${cb.id}"]`);
    tasks.push({
      title: cb.dataset.title,
      stage: cb.dataset.stage,
      taskDate: dateEl?.value || null,
      assignedTo: assignEl?.value || null,
    });
  });
  return tasks;
}

// ═══════════════════════════════════════════════════════════
// EDIT / DELETE — DAILY REPORT
// ═══════════════════════════════════════════════════════════
async function editDailyReport(id) {
  const res = await api('GET', `/daily-reports/${id}`);
  if (!res?.success) { toast('Rapport introuvable', 'error'); return; }
  const r = res.data;
  const entries = (r.entries||[]).sort((a,b)=>(a.entryTime||'').localeCompare(b.entryTime||''));

  // Build editable entries
  window._EDIT_ENTRIES = entries.map(e => ({...e}));
  window._EDIT_PHASE = r.phase || null;
  window._EDIT_TASK_HOURS = (r.taskHours || []).map(t => ({...t}));

  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-head">
        <div><div class="modal-title">✏️ Modifier le Rapport</div>
        <div style="font-size:12px;color:var(--text2);margin-top:2px;">${fmtDate(r.reportDate)}</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <!-- Infos générales -->
      <div class="input-row">
        <div class="form-group2"><label class="form-label2">Date</label><input class="input" type="date" id="er-date" value="${r.reportDate?.split('T')[0]||''}"></div>
        <div class="form-group2"><label class="form-label2">Météo</label>
          <select class="input" id="er-weather">
            <option ${r.weather?.includes('Ensoleillé')?'selected':''}>☀️ Ensoleillé</option>
            <option ${r.weather?.includes('Nuageux')?'selected':''}>⛅ Nuageux</option>
            <option ${r.weather?.includes('Pluie')?'selected':''}>🌧️ Pluie</option>
            <option ${r.weather?.includes('Froid')?'selected':''}>❄️ Froid</option>
          </select>
        </div>
      </div>
      <div class="form-group2"><label class="form-label2">Ouvriers présents</label><input class="input" type="number" id="er-workers" value="${r.workersPresent||0}" min="0"></div>

      <!-- Heures par tâche -->
      <div style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px;">
          <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;">⏱️ Heures par tâche</div>
          <div style="display:flex;gap:12px;">
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;">
              <input type="radio" name="er-phase" value="installation" ${r.phase==='installation'?'checked':''} onchange="onEditPhaseChange('${id}','installation')"> 🏗️ Installation
            </label>
            <label style="display:flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;">
              <input type="radio" name="er-phase" value="dismantling" ${r.phase==='dismantling'?'checked':''} onchange="onEditPhaseChange('${id}','dismantling')"> 🔨 Démontage
            </label>
          </div>
        </div>
        <div id="er-taskhours-header" style="display:${r.phase?'grid':'none'};grid-template-columns:1fr 85px 85px 26px;gap:8px;padding:2px 4px 6px;font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:700;">
          <span>Tâche</span><span style="text-align:right;">Heures</span><span style="text-align:right;">Hommes</span><span></span>
        </div>
        <div id="er-taskhours-list" style="max-height:200px;overflow-y:auto;"></div>
        <div id="er-taskhours-add" style="display:${r.phase?'flex':'none'};gap:6px;margin-top:8px;">
          <input class="input" id="er-taskhours-custom-title" placeholder="Ajouter une autre tâche..." style="flex:1;font-size:12px;">
          <button type="button" class="btn btn-ghost btn-sm" onclick="addCustomEditTaskHourRow()">+ Ajouter</button>
        </div>
      </div>

      <!-- Entrées timeline modifiables -->
      <div style="margin:14px 0 10px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;">⏱️ Journal</div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn btn-ghost btn-xs" onclick="document.getElementById('edit-ai-panel').style.display=document.getElementById('edit-ai-panel').style.display==='none'?'block':'none'">🤖 Assistant IA</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick="addEditEntry()">+ Ajouter une ligne</button>
        </div>
      </div>

      <!-- Panneau IA (replié par défaut) -->
      <div id="edit-ai-panel" style="display:none;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:10px;">
        <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">
          🤖 Colle un nouveau texte ou enregistre un audio — l'IA extrait les entrées et les <strong>ajoute</strong> à ton journal existant.
        </div>

        <!-- Audio -->
        <div style="margin-bottom:8px;">
          <label style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px;">
            🎙️ Transcrire un audio
            <input type="file" accept="audio/*" style="display:none;" onchange="editDailyTranscribeAudio(this)">
          </label>
          <span id="edit-ai-audio-status" style="font-size:11px;color:var(--text3);margin-left:8px;"></span>
        </div>

        <!-- Texte brut -->
        <textarea id="edit-ai-raw" rows="3" placeholder="Colle ton texte ici (ou laisse la transcription audio le remplir)..." style="width:100%;padding:8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:13px;font-family:inherit;resize:vertical;"></textarea>

        <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
          <button type="button" class="btn btn-primary btn-sm" onclick="editDailyAddFromAI()">🤖 Analyser & Ajouter au journal</button>
          <span id="edit-ai-status" style="font-size:11px;color:var(--text3);"></span>
        </div>
      </div>

      <div id="edit-entries-list" style="display:flex;flex-direction:column;gap:6px;max-height:30vh;overflow-y:auto;padding-right:2px;"></div>

      <!-- Notes -->
      <div class="form-group2" style="margin-top:12px;"><label class="form-label2">Notes générales</label><textarea class="input" id="er-notes" rows="3">${r.generalNotes||''}</textarea></div>

      <!-- Photos -->
      <div style="margin-top:12px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">📸 Photos (${(r.photos||[]).length})</div>
        <div id="er-photos-grid" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:8px;">
          ${(r.photos||[]).map(p=>`
            <div data-photo-id="${p.id}" style="position:relative;width:96px;flex-shrink:0;">
              <img src="${p.photoUrl}" onclick="openPhotoViewer('${p.photoUrl}')" style="width:96px;height:96px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);display:block;">
              <button onclick="deleteDailyPhoto('${id}','${p.id}',this)" title="Supprimer cette photo"
                style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;background:var(--accent);color:white;border:2px solid var(--bg);cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>
              <button onclick="editDailyPhotoCaption('${id}','${p.id}',${JSON.stringify(p.caption||'').replace(/"/g,'&quot;')})" title="Modifier la légende"
                style="position:absolute;bottom:2px;right:2px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.6);color:white;border:none;cursor:pointer;font-size:11px;padding:0;">✏️</button>
              ${p.caption?`<div style="font-size:10px;color:var(--text3);margin-top:3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.caption)}</div>`:''}
            </div>
          `).join('') || '<div style="color:var(--text3);font-size:12px;font-style:italic;padding:8px 0;">Aucune photo</div>'}
        </div>
        <label style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border:2px dashed var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;color:var(--text3);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
          📸 Ajouter photos
          <input type="file" accept="image/*" multiple style="display:none;" onchange="uploadEditDailyPhotos('${id}',this)">
        </label>
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button type="button" class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteDailyReport('${id}');this.closest('.overlay').remove()">🗑️ Supprimer</button>
        <button type="button" class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button type="button" class="btn btn-primary" onclick="saveDailyReport('${id}',this.closest('.overlay'))">💾 Sauvegarder</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
  renderEditEntries();
  renderEditTaskHoursGrid();
}

// ── Heures par tâche (modal d'édition) ────────────────────────
async function onEditPhaseChange(reportId, phase) {
  window._EDIT_PHASE = phase;
  const templates = await loadDailyAllTemplates();
  const forPhase = templates.filter(t => t.phase === phase);
  window._EDIT_TASK_HOURS = forPhase.map(t => ({
    taskTemplateId: t.id,
    taskTitle: t.title,
    hours: 0,
    workers: 0,
  }));
  renderEditTaskHoursGrid();
}

function renderEditTaskHoursGrid() {
  const header = document.getElementById('er-taskhours-header');
  const addRow = document.getElementById('er-taskhours-add');
  const list   = document.getElementById('er-taskhours-list');
  if (!list) return;

  if (!window._EDIT_PHASE) {
    if (header) header.style.display = 'none';
    if (addRow) addRow.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  if (header) header.style.display = 'grid';
  if (addRow) addRow.style.display = 'flex';

  const rows = window._EDIT_TASK_HOURS || [];
  list.innerHTML = rows.map((t, i) => `
    <div style="display:grid;grid-template-columns:1fr 85px 85px 26px;gap:8px;align-items:center;padding:5px 4px;border-bottom:1px solid var(--border);">
      <span style="font-size:12px;color:var(--text2);">${esc(t.taskTitle)}</span>
      <input type="number" step="0.25" min="0" value="${t.hours || ''}" placeholder="0"
        onchange="updateEditTaskHour(${i},'hours',this.value)"
        style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;text-align:right;">
      <input type="number" step="1" min="0" value="${t.workers || ''}" placeholder="0"
        onchange="updateEditTaskHour(${i},'workers',this.value)"
        style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;text-align:right;">
      <button type="button" onclick="removeEditTaskHourRow(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;" title="Retirer">✕</button>
    </div>`).join('') || '<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px;">Aucune tâche pour cette phase</div>';
}

function updateEditTaskHour(idx, field, value) {
  if (!window._EDIT_TASK_HOURS?.[idx]) return;
  window._EDIT_TASK_HOURS[idx][field] = field === 'workers' ? (parseInt(value) || 0) : (parseFloat(value) || 0);
}

function removeEditTaskHourRow(idx) {
  window._EDIT_TASK_HOURS.splice(idx, 1);
  renderEditTaskHoursGrid();
}

function addCustomEditTaskHourRow() {
  const input = document.getElementById('er-taskhours-custom-title');
  const title = input?.value.trim();
  if (!title) { toast('Nom de la tâche requis', 'error'); return; }
  if (!window._EDIT_TASK_HOURS) window._EDIT_TASK_HOURS = [];
  window._EDIT_TASK_HOURS.push({ taskTemplateId: null, taskTitle: title, hours: 0, workers: 0 });
  input.value = '';
  renderEditTaskHoursGrid();
}

function renderEditEntries() {
  const list = document.getElementById('edit-entries-list');
  if (!list) return;
  if (!window._EDIT_ENTRIES.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px;">Aucune entrée — cliquez + Ajouter</div>';
    return;
  }
  list.innerHTML = window._EDIT_ENTRIES.map((e, i) => `
    <div style="display:flex;gap:8px;align-items:center;background:var(--bg3);border-radius:8px;padding:8px 10px;" data-entry-idx="${i}">
      <input type="time" value="${e.entryTime||''}" oninput="window._EDIT_ENTRIES[${i}].entryTime=this.value"
        style="width:80px;padding:4px 6px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;font-family:monospace;flex-shrink:0;">
      <input class="entry-desc" value="${(e.description||'').replace(/"/g,'&quot;')}" oninput="window._EDIT_ENTRIES[${i}].description=this.value" placeholder="Description"
        style="flex:1;background:transparent;border:none;border-bottom:1px solid var(--border);padding:4px 2px;color:var(--text);font-size:13px;"
        placeholder="Description...">
      <button onclick="window._EDIT_ENTRIES.splice(${i},1);renderEditEntries()" style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:16px;flex-shrink:0;">✕</button>
    </div>`).join('');
}

function addEditEntry() {
  if (!window._EDIT_ENTRIES) window._EDIT_ENTRIES = [];
  window._EDIT_ENTRIES.push({ entryTime: '', description: '' });
  renderEditEntries();
  // Focus last input
  setTimeout(() => {
    const inputs = document.querySelectorAll('#edit-entries-list input[placeholder]');
    if (inputs.length) inputs[inputs.length-1].focus();
  }, 50);
}

// ─── Édition Daily : Transcription audio (Whisper) ─────────────────────
async function editDailyTranscribeAudio(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    toast('Fichier trop volumineux (max 50 Mo)', 'error');
    return;
  }
  const statusEl = document.getElementById('edit-ai-audio-status');
  if (statusEl) statusEl.innerHTML = `<span style="color:var(--blue);">⏳ Transcription en cours...</span>`;

  const fd = new FormData();
  fd.append('audio', file);
  try {
    const r = await fetch(`${API}/ai/transcribe`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: fd,
    });
    const data = await r.json();
    if (!data.success) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">❌ ${esc(data.error || 'Erreur')}</span>`;
      return;
    }
    const text = (data.data?.text || '').trim();
    if (!text) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--amber);">⚠️ Aucun texte détecté</span>`;
      return;
    }
    // Rempli le textarea (ajoute s'il y a déjà du texte)
    const ta = document.getElementById('edit-ai-raw');
    if (ta) ta.value = ta.value.trim() ? (ta.value.trim() + '\n\n' + text) : text;
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--green);">✅ Transcrit (${text.length} car) — clique "Analyser"</span>`;
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">❌ Erreur réseau</span>`;
    console.error('[editDailyTranscribeAudio]', e);
  }
}

// ─── Édition Daily : Analyse IA + ajout au journal ─────────────────────
async function editDailyAddFromAI() {
  const raw = document.getElementById('edit-ai-raw')?.value.trim();
  if (!raw) { toast('Saisis ou transcris d\'abord un texte', 'error'); return; }
  const statusEl = document.getElementById('edit-ai-status');
  if (statusEl) statusEl.innerHTML = `<span style="color:var(--blue);">⏳ Analyse en cours...</span>`;

  try {
    const r = await fetch(`${API}/ai/parse-daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ text: raw }),
    });
    const data = await r.json();
    if (!data.success) throw new Error(data.error || 'Erreur IA');

    const entries = Array.isArray(data.data) ? data.data : [];
    if (!entries.length) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--amber);">⚠️ Aucune entrée extraite</span>`;
      return;
    }

    // Ajoute les nouvelles entrées à la fin de _EDIT_ENTRIES (sans remplacer)
    if (!window._EDIT_ENTRIES) window._EDIT_ENTRIES = [];
    entries.forEach(e => {
      window._EDIT_ENTRIES.push({
        entryTime:   e.time || e.entryTime || '',
        description: e.text || e.description || '',
      });
    });

    // Trie par horaire (entrées vides à la fin)
    window._EDIT_ENTRIES.sort((a, b) => {
      if (!a.entryTime && !b.entryTime) return 0;
      if (!a.entryTime) return 1;
      if (!b.entryTime) return -1;
      return a.entryTime.localeCompare(b.entryTime);
    });

    renderEditEntries();
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--green);">✅ ${entries.length} entrée(s) ajoutée(s)</span>`;
    // Vide le textarea après succès
    document.getElementById('edit-ai-raw').value = '';
    toast(`${entries.length} entrée(s) ajoutée(s) au journal ✅`, 'success');
  } catch (e) {
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">❌ ${esc(e.message || 'Erreur')}</span>`;
    console.error('[editDailyAddFromAI]', e);
  }
}

async function uploadEditDailyPhotos(reportId, input) {
  if (!input.files?.length) return;
  toast(`Upload ${input.files.length} photo(s)...`, 'info');
  let ok = 0;
  for (const file of Array.from(input.files)) {
    try {
      const fd = new FormData(); fd.append('file', file);
      const r = await fetch(`${API}/upload/photo`, {
        method:'POST', headers:{'Authorization':`Bearer ${TOKEN}`}, body:fd
      });
      if (!r.ok) { toast(`Erreur ${r.status}`, 'error'); continue; }
      const data = await r.json();
      const url = data.data?.url || data.url || data.secure_url;
      if (url) {
        await api('POST', `/daily-reports/${reportId}/photos`, {
          photoUrl: url, publicId: data.data?.public_id || null
        });
        ok++;
      }
    } catch(e) { console.error('photo upload error:', e); toast('Erreur réseau', 'error'); }
  }
  if (ok) toast(`${ok} photo(s) ajoutée(s) ✅`, 'success');
  // Re-rendre la grille photos depuis la base pour que les boutons ✕/✏️ apparaissent
  await refreshDailyEditPhotosGrid(reportId);
}

// Rebuild de la grille photos du modal d'édition daily report
async function refreshDailyEditPhotosGrid(reportId) {
  const res = await api('GET', `/daily-reports/${reportId}`);
  if (!res?.success) return;
  const photos = res.data.photos || [];
  const grid = document.getElementById('er-photos-grid');
  if (!grid) return;
  grid.innerHTML = photos.length ? photos.map(p => `
    <div data-photo-id="${p.id}" style="position:relative;width:96px;flex-shrink:0;">
      <img src="${p.photoUrl}" onclick="openPhotoViewer('${p.photoUrl}')" style="width:96px;height:96px;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);display:block;">
      <button onclick="deleteDailyPhoto('${reportId}','${p.id}',this)" title="Supprimer cette photo"
        style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;background:var(--accent);color:white;border:2px solid var(--bg);cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0;">✕</button>
      <button onclick="editDailyPhotoCaption('${reportId}','${p.id}',${JSON.stringify(p.caption||'').replace(/"/g,'&quot;')})" title="Modifier la légende"
        style="position:absolute;bottom:2px;right:2px;width:22px;height:22px;border-radius:50%;background:rgba(0,0,0,.6);color:white;border:none;cursor:pointer;font-size:11px;padding:0;">✏️</button>
      ${p.caption?`<div style="font-size:10px;color:var(--text3);margin-top:3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.caption)}</div>`:''}
    </div>
  `).join('') : '<div style="color:var(--text3);font-size:12px;font-style:italic;padding:8px 0;">Aucune photo</div>';

  // Met à jour aussi le compteur dans le titre de section
  const titleEl = grid.parentElement?.querySelector('div');
  if (titleEl && titleEl.textContent.includes('Photos')) titleEl.textContent = `📸 Photos (${photos.length})`;
}

// Supprime une photo d'un daily report (avec confirmation)
async function deleteDailyPhoto(reportId, photoId, btnEl) {
  if (!confirm('Supprimer cette photo ?')) return;
  // Spinner sur le bouton pendant la requête
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '…'; }
  const res = await api('DELETE', `/daily-reports/${reportId}/photos/${photoId}`);
  if (res?.success) {
    toast('Photo supprimée', 'success');
    // Retirer la vignette du DOM tout de suite (UX réactive)
    document.querySelector(`[data-photo-id="${photoId}"]`)?.remove();
    // Rafraîchir le compteur en haut de la grille
    const grid = document.getElementById('er-photos-grid');
    const count = grid?.querySelectorAll('[data-photo-id]').length || 0;
    const titleEl = grid?.parentElement?.querySelector('div');
    if (titleEl && titleEl.textContent.includes('Photos')) titleEl.textContent = `📸 Photos (${count})`;
    if (count === 0 && grid) grid.innerHTML = '<div style="color:var(--text3);font-size:12px;font-style:italic;padding:8px 0;">Aucune photo</div>';
  } else {
    toast(res?.error || 'Erreur suppression', 'error');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '✕'; }
  }
}

// Modifie la légende d'une photo via prompt simple
async function editDailyPhotoCaption(reportId, photoId, currentCaption) {
  const newCaption = prompt('Légende de la photo :', currentCaption || '');
  if (newCaption === null) return;  // annulé
  const res = await api('PATCH', `/daily-reports/${reportId}/photos/${photoId}`, { caption: newCaption });
  if (res?.success) {
    toast('Légende mise à jour ✅', 'success');
    await refreshDailyEditPhotosGrid(reportId);
  } else {
    toast(res?.error || 'Erreur modification', 'error');
  }
}

// Supprime une photo depuis le modal de VUE openDailyDetail
// (ferme et rouvre le modal pour rafraîchir l'affichage)
async function deleteDailyPhotoFromView(reportId, photoId, projectId, btnEl) {
  if (!confirm('Supprimer cette photo ?')) return;
  if (btnEl) { btnEl.disabled = true; btnEl.innerHTML = '…'; }
  const res = await api('DELETE', `/daily-reports/${reportId}/photos/${photoId}`);
  if (res?.success) {
    toast('Photo supprimée', 'success');
    // Retirer la vignette du DOM immédiatement (UX réactive)
    document.querySelector(`[data-photo-id="${photoId}"]`)?.remove();
    // Mettre à jour le compteur visuellement
    const counter = document.querySelector('.overlay.open .modal');
    const remaining = counter ? counter.querySelectorAll('[data-photo-id]').length : 0;
    const titles = counter?.querySelectorAll('div');
    titles?.forEach(t => {
      if (t.textContent && /^📸 Photos/.test(t.textContent.trim())) {
        t.textContent = `📸 Photos (${remaining})`;
      }
    });
    // Mettre à jour la liste des cartes en arrière-plan
    loadDailyReports();
    if (projectId) loadDetailDailyReports(projectId);
  } else {
    toast(res?.error || 'Erreur suppression', 'error');
    if (btnEl) { btnEl.disabled = false; btnEl.innerHTML = '✕'; }
  }
}

async function saveDailyReport(id, overlay) {
  // Collect current values from DOM before saving — on relit le DOM au cas où
  // les `oninput` n'auraient pas tous déclenché (notamment sur mobile lors d'un
  // tap rapide sur Sauvegarder sans blur des inputs).
  const entriesEls = document.querySelectorAll('#edit-entries-list > div[data-entry-idx]');
  if (entriesEls.length && window._EDIT_ENTRIES) {
    entriesEls.forEach((div) => {
      const i = parseInt(div.dataset.entryIdx);
      if (isNaN(i) || !window._EDIT_ENTRIES[i]) return;
      const timeInput = div.querySelector('input[type="time"]');
      const descInput = div.querySelector('input.entry-desc');
      if (timeInput) window._EDIT_ENTRIES[i].entryTime = timeInput.value;
      if (descInput) window._EDIT_ENTRIES[i].description = descInput.value;
    });
  }

  const body = {
    reportDate: document.getElementById('er-date').value,
    weather: document.getElementById('er-weather').value,
    workersPresent: parseInt(document.getElementById('er-workers').value)||0,
    generalNotes: document.getElementById('er-notes').value||undefined,
  };

  // Include entries if modified
  if (window._EDIT_ENTRIES?.length) {
    body.entries = window._EDIT_ENTRIES
      .filter(e => e.description?.trim())
      .map(e => ({ entryTime: e.entryTime||null, description: e.description }));
  }

  if (window._EDIT_PHASE) body.phase = window._EDIT_PHASE;
  if (window._EDIT_TASK_HOURS) {
    body.taskHours = window._EDIT_TASK_HOURS
      .filter(t => (t.hours||0) > 0 || (t.workers||0) > 0)
      .map(t => ({ taskTemplateId: t.taskTemplateId||undefined, taskTitle: t.taskTitle, hours: t.hours||0, workers: t.workers||0 }));
  }

  const res = await api('PATCH', `/daily-reports/${id}`, body);
  if (res?.success) {
    toast('Rapport mis à jour ✅','success');
    window._EDIT_ENTRIES = [];
    window._EDIT_TASK_HOURS = [];
    window._EDIT_PHASE = null;
    overlay?.remove();
    loadDailyReports();
    if(CURRENT_PROJECT_ID) loadDetailDailyReports(CURRENT_PROJECT_ID);
  } else toast('Erreur mise à jour','error');
}

async function deleteDailyReport(id) {
  if (!confirm('Supprimer ce rapport ?')) return;
  const res = await api('DELETE', `/daily-reports/${id}`);
  if (res?.success) { toast('Rapport supprimé','warning'); loadDailyReports(); if(CURRENT_PROJECT_ID) loadDetailDailyReports(CURRENT_PROJECT_ID); }
  else toast('Erreur suppression','error');
}

// ═══════════════════════════════════════════════════════════
// EDIT / DELETE — HANDOVER
// ═══════════════════════════════════════════════════════════
async function deleteHandover(id) {
  if (!confirm('Supprimer ce handover ?')) return;
  const res = await api('DELETE', `/handover/${id}`);
  if (res?.success) { toast('Supprimé','warning'); loadHandovers(); if(CURRENT_PROJECT_ID) loadDetailHandovers(CURRENT_PROJECT_ID); }
  else toast('Erreur suppression','error');
}

// ═══════════════════════════════════════════════════════════
// EDIT / DELETE — TASKS (amélioration)
// ═══════════════════════════════════════════════════════════
async function loadDetailTasks(projectId) {
  const res = await api('GET', `/tasks?projectId=${projectId}`);
  const el = document.getElementById('detail-tasks-content');
  if (!el || !res?.success) return;

  const tasks = res.data;

  // ─── On groupe par ÉTAPE (stage) — l'ordre est celui des catégories du template ───
  // Si des catégories sont chargées via TASK_TEMPLATES_DATA on respecte cet ordre.
  // Les tâches sans stage tombent dans "(Sans étape)".
  const tplStages = Object.keys(TASK_TEMPLATES_DATA || {});
  const usedStages = new Set(tasks.map(t => t.stage).filter(Boolean));
  // Étapes connues dans l'ordre template + celles inconnues à la fin
  const allStages = [
    ...tplStages.filter(s => usedStages.has(s)),
    ...[...usedStages].filter(s => !tplStages.includes(s)),
  ];
  const ungrouped = tasks.filter(t => !t.stage);
  if (ungrouped.length) allStages.push('(Sans étape)');

  const headerHtml = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
    <div style="font-size:13px;color:var(--text3);">${tasks.length} tâche(s) · groupées par étape</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn-ghost btn-sm" onclick="showTaskFromMeetingModal('${projectId}')">🤖 Import réunion</button>
      <button class="btn btn-ghost btn-sm" onclick="openTemplateTasksModal()" title="Ajouter plusieurs tâches en une fois depuis le template">📋 Plusieurs tâches (template)</button>
      <button class="btn btn-primary btn-sm" onclick="showModal('modal-task')" title="Ajouter une seule tâche libre">➕ 1 tâche</button>
    </div>
  </div>`;

  if (!tasks.length) { el.innerHTML = headerHtml + '<div class="empty"><div class="empty-icon">✅</div><div class="empty-title">Aucune tâche</div></div>'; return; }

  // ─── Couleurs et icônes des statuts (affichés en badge sur chaque carte) ───
  const statusInfo = {
    todo:        { lbl: '📋 À faire',    bg:'#fee2e2', clr:'#dc2626' },
    in_progress: { lbl: '⚡ En cours',    bg:'#fef9c3', clr:'#ca8a04' },
    done:        { lbl: '✅ Terminé',    bg:'#dcfce7', clr:'#16a34a' },
    blocked:     { lbl: '🔴 Bloqué',     bg:'#fff1f2', clr:'#e63946' },
    cancelled:   { lbl: '❌ Annulé',     bg:'#f3f4f6', clr:'#6b7280' },
  };

  // Une "colonne" du kanban = une étape (stage)
  const STAGE_ICONS_LOCAL = { 'To Do':'📋','PRE-PROD':'📐','Booking Supplier':'📞','Warehouse Preparation':'📦','Installation':'🏗️','Dismantling':'🔨','Come Back Warehouse':'🏠','(Sans étape)':'❔' };

  el.innerHTML = headerHtml + `<div class="kanban">` + allStages.map(stage => {
    const stageTasks = stage === '(Sans étape)' ? ungrouped : tasks.filter(t => t.stage === stage);
    const icon = STAGE_ICONS_LOCAL[stage] || '📋';
    return `
    <div class="kboard">
      <div class="kboard-title">
        <span>${icon} ${esc(stage)}</span>
        <span class="badge badge-muted">${stageTasks.length}</span>
      </div>
      ${stageTasks.map(t => {
        const si = statusInfo[t.status] || statusInfo.todo;
        return `
        <div class="kcard" onclick="openTaskModal('${t.id}','${projectId}')" style="cursor:pointer;">
          <div style="font-weight:600;font-size:12px;margin-bottom:5px;line-height:1.3;">${esc(t.title)}</div>
          ${t.taskDate?`<div style="font-size:11px;color:var(--text3);">📅 ${fmtDate(t.taskDate)}</div>`:''}
          ${t.assignedTo?`<div style="font-size:11px;color:var(--blue);margin-top:3px;">👤 ${esc(t.assignedTo.firstName)} ${esc(t.assignedTo.lastName)}</div>`:''}
          <div style="display:flex;gap:4px;margin-top:8px;flex-wrap:wrap;align-items:center;">
            <span style="background:${si.bg};color:${si.clr};padding:2px 8px;border-radius:99px;font-size:10px;font-weight:700;white-space:nowrap;">${si.lbl}</span>
            <span class="badge ${t.priority==='critical'?'badge-red':t.priority==='high'?'badge-amber':'badge-muted'}" style="font-size:10px;">${t.priority}</span>
            ${t.status!=='done' && t.status!=='cancelled' ? `<button class="btn btn-green" style="font-size:10px;padding:2px 7px;margin-left:auto;" onclick="event.stopPropagation();quickDoneTask('${t.id}','${projectId}')" title="Marquer terminé">✓</button>` : ''}
          </div>
          <!-- Mini select de statut pour changer rapidement -->
          <select onclick="event.stopPropagation();" onchange="changeTaskStatus('${t.id}','${projectId}',this.value)" style="margin-top:6px;width:100%;font-size:10px;padding:2px 4px;background:var(--bg3);border:1px solid var(--border);border-radius:4px;color:var(--text);">
            <option value="todo"        ${t.status==='todo'?'selected':''}>📋 À faire</option>
            <option value="in_progress" ${t.status==='in_progress'?'selected':''}>⚡ En cours</option>
            <option value="done"        ${t.status==='done'?'selected':''}>✅ Terminé</option>
            <option value="cancelled"   ${t.status==='cancelled'?'selected':''}>❌ Annulé</option>
          </select>
        </div>`;
      }).join('') || '<div style="color:var(--text3);font-size:12px;text-align:center;padding:12px;">—</div>'}
    </div>`;
  }).join('') + `</div>`;
}

// Changement rapide du statut d'une tâche depuis le kanban
async function changeTaskStatus(taskId, projectId, status) {
  const res = await api('PATCH', `/tasks/${taskId}`, { status });
  if (res?.success) {
    toast('Statut mis à jour', 'success');
    loadDetailTasks(projectId);
  } else {
    toast(res?.error || 'Erreur', 'error');
  }
}

async function quickDoneTask(taskId, projectId) {
  const res = await api('PATCH', `/tasks/${taskId}`, { status:'done' });
  if (res?.success) { toast('✅ Terminé !','success'); loadDetailTasks(projectId); }
}

async function saveTaskEdit(taskId, projectId, overlay) {
  const res = await api('PATCH', `/tasks/${taskId}`, {
    status: document.getElementById('et-status').value,
    priority: document.getElementById('et-priority').value,
    taskDate: document.getElementById('et-date').value||undefined,
    assignedToId: document.getElementById('et-assign').value||null,
    description: document.getElementById('et-desc').value||undefined,
  });
  if (res?.success) { toast('Tâche mise à jour ✅','success'); overlay?.remove(); loadDetailTasks(projectId); }
  else toast('Erreur','error');
}

async function deleteTask(taskId, projectId, overlay) {
  if (!confirm('Supprimer cette tâche ?')) return;
  const res = await api('DELETE', `/tasks/${taskId}`);
  if (res?.success) { toast('Supprimée','warning'); overlay?.remove(); loadDetailTasks(projectId); }
  else toast('Erreur suppression','error');
}

// ═══════════════════════════════════════════════════════════
// IMPORT TÂCHES DEPUIS RÉUNION (IA)
// ═══════════════════════════════════════════════════════════
function showTaskFromMeetingModal(projectId) {
  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-head">
        <div><div class="modal-title">🤖 Import tâches depuis réunion</div><div style="font-size:12px;color:var(--text2);margin-top:3px;">Colle le compte-rendu — l'IA crée les tâches</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="background:rgba(72,149,239,.08);border:1px solid rgba(72,149,239,.2);border-radius:var(--radius);padding:12px;margin-bottom:12px;font-size:13px;color:var(--text2);">
        💡 Colle ton compte-rendu de réunion. L'IA va créer un draft de tâches avec titre, assignation, priorité et deadline. Tu peux tout modifier avant de valider.
      </div>
      <textarea class="input" id="meeting-text" rows="8" placeholder="Ex: Réunion du 15 mai — Amaury doit finir la façade nord avant vendredi, urgent. Jeremy s'occupe de l'électricité du rez-de-chaussée pour lundi. Norick pose les rails terrasse cette semaine..."></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;">
        <span id="meeting-ai-status" style="font-size:12px;color:var(--text3);display:none;">🤖 Analyse en cours...</span>
        <button class="btn btn-blue" onclick="parseMeetingWithAI('${projectId}',this.closest('.overlay'))">🤖 Analyser et créer le draft</button>
      </div>
      <div id="meeting-tasks-draft" style="display:none;margin-top:14px;"></div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

async function parseMeetingWithAI(projectId, overlay) {
  const text = document.getElementById('meeting-text')?.value.trim();
  if (!text) { toast('Colle un compte-rendu','error'); return; }
  const status = document.getElementById('meeting-ai-status');
  const btn = overlay.querySelector('.btn-blue');
  if (status) status.style.display='inline';
  if (btn) btn.disabled=true;

  try {
    const usersList = USERS.map(u=>`- ${u.firstName} ${u.lastName} (id: ${u.id})`).join(' | ');
    const prompt = `Tu es un assistant de gestion de projet. Analyse ce compte-rendu de réunion et extrais les tâches à faire.

Membres de l'équipe disponibles :
${usersList}

Pour chaque tâche identifiée, crée un objet JSON avec :
- "title": titre court de la tâche (max 80 chars)
- "description": détails si nécessaire
- "assignedToId": l'id du membre si mentionné, sinon null
- "assignedName": prénom du membre si mentionné, sinon ""
- "priority": "low" | "normal" | "high" | "critical"
- "deadline": date ISO si mentionnée (ex: "2026-05-17"), sinon null
- "estimatedHours": nombre d'heures estimées si mentionné, sinon null

Règles :
- Crée une tâche par action distincte
- Si une personne est mentionnée, assigne-lui la tâche
- Déduis la priorité du contexte (urgent = high/critical)
- Réponds UNIQUEMENT avec un tableau JSON valide, sans texte, sans backticks

Compte-rendu :
${text}`;

    const res = await fetch(`${API}/ai/parse-daily`, {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`},
      body: JSON.stringify({ text: prompt, mode: 'json' })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);

    let tasks;
    try {
      // data.data is already parsed array from backend
      if (Array.isArray(data.data)) {
        tasks = data.data;
      } else {
        tasks = JSON.parse(typeof data.data === 'string' ? data.data : JSON.stringify(data.data));
      }
    } catch { tasks = []; }

    if (!Array.isArray(tasks)) throw new Error('Format invalide');

    // Show draft
    const draft = document.getElementById('meeting-tasks-draft');
    if (!draft) return;
    draft.style.display='block';
    draft.innerHTML = `
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;color:var(--green);">✅ ${tasks.length} tâche(s) — modifie avant de valider</div>
      ${tasks.map((t,i)=>`
        <div style="border:1px solid var(--border);border-radius:var(--radius);padding:12px;margin-bottom:8px;background:var(--bg3);">
          <div class="input-row" style="margin-bottom:8px;">
            <div class="form-group2" style="margin:0;"><label class="form-label2">Titre</label><input class="input" id="mt-title-${i}" value="${t.title}" style="font-size:13px;"></div>
            <div class="form-group2" style="margin:0;"><label class="form-label2">Priorité</label>
              <select class="input" id="mt-priority-${i}" style="font-size:13px;">
                <option value="low" ${t.priority==='low'?'selected':''}>🟢 Faible</option>
                <option value="normal" ${t.priority==='normal'?'selected':''}>🔵 Normal</option>
                <option value="high" ${t.priority==='high'?'selected':''}>🟠 Élevé</option>
                <option value="critical" ${t.priority==='critical'?'selected':''}>🔴 Critique</option>
              </select>
            </div>
          </div>
          <div class="input-row">
            <div class="form-group2" style="margin:0;"><label class="form-label2">Assigné à</label>
              <select class="input" id="mt-assign-${i}" style="font-size:13px;">
                <option value="">— Non assigné —</option>
                ${USERS.map(u=>`<option value="${u.id}" ${t.assignedToId===u.id?'selected':''}>${u.firstName} ${u.lastName}</option>`).join('')}
              </select>
            </div>
            <div class="form-group2" style="margin:0;"><label class="form-label2">Deadline</label><input class="input" type="date" id="mt-date-${i}" value="${t.deadline||''}" style="font-size:13px;"></div>
          </div>
          ${t.description?`<div style="font-size:12px;color:var(--text3);margin-top:6px;">${t.description}</div>`:''}
        </div>`).join('')}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:12px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="createTasksFromMeeting(${JSON.stringify(tasks).replace(/"/g,'&quot;')},'${projectId}',this.closest('.overlay'),${tasks.length})">✅ Créer ${tasks.length} tâche(s)</button>
      </div>`;

  } catch(e) {
    toast('Erreur IA — '+e.message,'error');
    console.error(e);
  } finally {
    if (status) status.style.display='none';
    if (btn) btn.disabled=false;
  }
}

