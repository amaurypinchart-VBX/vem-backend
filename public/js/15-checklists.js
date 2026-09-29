// ═══════════════════════════════════════════════════════════
// ☑️ CHECK-LIST DE MONTAGE
// Bibliothèque de points de contrôle par phase (page « Templates Check-list »).
// Les points choisis sont copiés dans la check-list d'un projet quand le
// Technical Manager la configure : modifier la bibliothèque ne change jamais
// une check-list déjà configurée. API : /checklists (src/routes/checklists.ts).
// ═══════════════════════════════════════════════════════════
const CHECKLIST_EDIT_ROLES = ['admin', 'technical_manager', 'project_manager'];
const CHECKLIST_PHASE_LABELS = { installation: '🏗️ Installation', dismantling: '🔨 Démontage' };

let CLT_PHASE = 'installation';
// Catégories (avec leurs points, désactivés compris) de chaque phase
let CLT_LIB = { installation: [], dismantling: [] };
// Catégories dépliées
const CLT_OPEN = new Set();

function checklistCanEdit() {
  return !!CURRENT_USER && CHECKLIST_EDIT_ROLES.includes(CURRENT_USER.role);
}

const CLT_BTN_SM = 'padding:4px 9px;min-height:30px;';

async function loadChecklistTemplatesPage() {
  const el = document.getElementById('checklist-templates-content');
  if (!el) return;
  const [inst, dism] = await Promise.all([
    api('GET', '/checklists/templates?phase=installation&all=1'),
    api('GET', '/checklists/templates?phase=dismantling&all=1'),
  ]);
  if (!inst?.success || !dism?.success) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">☑️</div><div class="empty-title">Impossible de charger la bibliothèque</div><div class="empty-sub">${esc(inst?.error || dism?.error || 'Erreur réseau')}</div></div>`;
    return;
  }
  CLT_LIB = { installation: inst.data, dismantling: dism.data };
  renderChecklistTemplates();
}

function setChecklistTemplatesPhase(phase) {
  CLT_PHASE = phase;
  renderChecklistTemplates();
}

function toggleChecklistCategory(id) {
  if (CLT_OPEN.has(id)) CLT_OPEN.delete(id); else CLT_OPEN.add(id);
  renderChecklistTemplates();
}

function toggleAllChecklistCategories(open) {
  CLT_LIB[CLT_PHASE].forEach(c => open ? CLT_OPEN.add(c.id) : CLT_OPEN.delete(c.id));
  renderChecklistTemplates();
}

function checklistTemplateBadges(it) {
  const b = [];
  if (it.scope === 'permanent') b.push('<span class="badge badge-purple" title="Viewbox permanente uniquement">PERM</span>');
  if (it.photoRequired) b.push('<span class="badge badge-blue" title="Impossible de mettre OK sans au moins une photo">📷 photo</span>');
  if (it.critical) b.push('<span class="badge badge-red" title="Doit être OK ou N.A. avant le lien de signature du handover">⚠️ critique</span>');
  if (it.optional) b.push('<span class="badge badge-muted" title="Non pré-coché à la configuration">si présent</span>');
  if (!it.active) b.push('<span class="badge badge-amber" title="N’est plus proposé à la configuration des projets">désactivé</span>');
  return b.join('');
}

function checklistTemplateRow(it, idx, count, canEdit) {
  return `
    <div style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;padding:10px 6px;border-bottom:1px solid var(--border);${it.active ? '' : 'opacity:.55;'}">
      <div style="flex:1 1 220px;min-width:0;">
        <div style="font-size:13px;font-weight:500;overflow-wrap:anywhere;${it.active ? '' : 'text-decoration:line-through;'}">${esc(it.label)}</div>
        ${it.hint ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;overflow-wrap:anywhere;">${esc(it.hint)}</div>` : ''}
        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:5px;">${checklistTemplateBadges(it)}</div>
      </div>
      ${canEdit ? `
      <div style="display:flex;gap:4px;flex-shrink:0;">
        <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" ${idx === 0 ? 'disabled' : ''} onclick="moveChecklistTemplateItem('${it.id}',-1)" title="Monter">↑</button>
        <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" ${idx === count - 1 ? 'disabled' : ''} onclick="moveChecklistTemplateItem('${it.id}',1)" title="Descendre">↓</button>
        <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" onclick="toggleChecklistTemplateItemActive('${it.id}')" title="${it.active ? 'Désactiver (plus proposé aux projets)' : 'Réactiver'}">${it.active ? '🚫' : '♻️'}</button>
        <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" onclick="showChecklistItemModal('${it.id}')" title="Modifier">✏️</button>
      </div>` : ''}
    </div>`;
}

function renderChecklistTemplates() {
  const el = document.getElementById('checklist-templates-content');
  if (!el) return;
  const canEdit = checklistCanEdit();
  const isAdmin = CURRENT_USER?.role === 'admin';
  const cats = CLT_LIB[CLT_PHASE] || [];
  const libraryEmpty = !CLT_LIB.installation.length && !CLT_LIB.dismantling.length;

  const actions = document.getElementById('clt-actions');
  if (actions) actions.innerHTML = !canEdit || libraryEmpty ? '' : `
    ${isAdmin ? `<button class="btn btn-ghost btn-sm" onclick="seedChecklistLibrary(true)" title="Efface la bibliothèque et recharge la liste Viewbox d’origine" style="color:#888;">🔄 Recharger Viewbox</button>` : ''}
    <button class="btn btn-ghost btn-sm" onclick="showChecklistCategoryModal()">+ Catégorie</button>
    <button class="btn btn-primary" onclick="showChecklistItemModal()" ${cats.length ? '' : 'disabled'}>+ Point</button>`;

  if (libraryEmpty) {
    el.innerHTML = `
      <div class="empty">
        <div class="empty-icon">☑️</div>
        <div class="empty-title">Bibliothèque vide</div>
        <div class="empty-sub">La liste Viewbox contient 14 catégories d’installation, 3 de démontage et 116 points.</div>
        ${canEdit ? `<button class="btn btn-primary" style="margin-top:16px;" onclick="seedChecklistLibrary(false)">📥 Charger la bibliothèque Viewbox</button>` : ''}
      </div>`;
    return;
  }

  const countActive = ph => (CLT_LIB[ph] || []).reduce((n, c) => n + (c.items || []).filter(i => i.active).length, 0);
  const active = cats.flatMap(c => (c.items || []).filter(i => i.active));
  const nEphemere = active.filter(i => i.scope === 'all' && !i.optional).length;
  const nPermanente = active.filter(i => !i.optional).length;

  el.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
      ${['installation', 'dismantling'].map(ph => `
        <button class="btn ${ph === CLT_PHASE ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setChecklistTemplatesPhase('${ph}')">
          ${CHECKLIST_PHASE_LABELS[ph]} <span style="opacity:.75;">(${countActive(ph)})</span>
        </button>`).join('')}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
      <div style="font-size:12px;color:var(--text3);line-height:1.6;">
        ${active.length} point(s) actif(s) · pré-cochés : <strong style="color:var(--text2);">${nEphemere}</strong> en Éphémère, <strong style="color:var(--text2);">${nPermanente}</strong> en Permanente
        ${canEdit ? '' : '<br>Lecture seule : la bibliothèque est modifiée par les admins, technical managers et project managers.'}
      </div>
      ${cats.length ? `<div style="display:flex;gap:6px;">
        <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" onclick="toggleAllChecklistCategories(true)">Tout déplier</button>
        <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" onclick="toggleAllChecklistCategories(false)">Tout replier</button>
      </div>` : ''}
    </div>
    ${cats.length ? cats.map((cat, ci) => {
      const open = CLT_OPEN.has(cat.id);
      const items = cat.items || [];
      const inactive = items.filter(i => !i.active).length;
      return `
        <div class="card" style="margin-bottom:10px;">
          <div class="card-header" style="cursor:pointer;gap:10px;flex-wrap:wrap;${open ? '' : 'border-bottom:none;'}" onclick="toggleChecklistCategory('${cat.id}')">
            <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1 1 200px;">
              <span style="color:var(--text3);width:12px;flex-shrink:0;">${open ? '▾' : '▸'}</span>
              <div style="min-width:0;">
                <div class="card-title" style="overflow-wrap:anywhere;">${ci + 1}. ${esc(cat.name)}</div>
                <div style="font-size:12px;color:var(--text3);">${items.length} point(s)${inactive ? ` · ${inactive} désactivé(s)` : ''}</div>
              </div>
            </div>
            ${canEdit ? `
            <div style="display:flex;gap:4px;flex-wrap:wrap;" onclick="event.stopPropagation()">
              <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" ${ci === 0 ? 'disabled' : ''} onclick="moveChecklistCategory('${cat.id}',-1)" title="Monter">↑</button>
              <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" ${ci === cats.length - 1 ? 'disabled' : ''} onclick="moveChecklistCategory('${cat.id}',1)" title="Descendre">↓</button>
              <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" onclick="showChecklistItemModal(null,'${cat.id}')">+ Point</button>
              <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" onclick="showChecklistCategoryModal('${cat.id}')" title="Renommer">✏️</button>
              <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}color:var(--accent);" onclick="deleteChecklistCategory('${cat.id}')" title="Supprimer">🗑️</button>
            </div>` : ''}
          </div>
          ${open ? `<div class="card-body" style="padding:4px 12px 8px;">
            ${items.length ? items.map((it, ii) => checklistTemplateRow(it, ii, items.length, canEdit)).join('') : '<div style="color:var(--text3);font-size:13px;padding:10px 6px;">Aucun point dans cette catégorie</div>'}
          </div>` : ''}
        </div>`;
    }).join('') : `
      <div class="empty">
        <div class="empty-icon">🗂️</div>
        <div class="empty-title">Aucune catégorie pour cette phase</div>
        ${canEdit ? '<button class="btn btn-primary" style="margin-top:16px;" onclick="showChecklistCategoryModal()">+ Catégorie</button>' : ''}
      </div>`}`;
}

function findChecklistTemplateItem(id) {
  for (const cat of CLT_LIB[CLT_PHASE]) {
    const idx = (cat.items || []).findIndex(i => i.id === id);
    if (idx >= 0) return { cat, item: cat.items[idx], idx };
  }
  return null;
}

// ─── Ordre (flèches ↑↓) : on réordonne localement, puis on envoie la liste complète ───
async function saveChecklistOrder(type, ids) {
  const res = await api('POST', '/checklists/templates/reorder', { type, ids });
  if (!res?.success) { toast(res?.error || 'Ordre non enregistré', 'error'); loadChecklistTemplatesPage(); }
}

function moveChecklistCategory(id, dir) {
  const cats = CLT_LIB[CLT_PHASE];
  const i = cats.findIndex(c => c.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  [cats[i], cats[j]] = [cats[j], cats[i]];
  renderChecklistTemplates();
  saveChecklistOrder('categories', cats.map(c => c.id));
}

function moveChecklistTemplateItem(id, dir) {
  const found = findChecklistTemplateItem(id);
  if (!found) return;
  const items = found.cat.items, i = found.idx, j = i + dir;
  if (j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  renderChecklistTemplates();
  saveChecklistOrder('items', items.map(it => it.id));
}

async function toggleChecklistTemplateItemActive(id) {
  const found = findChecklistTemplateItem(id);
  if (!found) return;
  const res = await api('PATCH', `/checklists/templates/items/${id}`, { active: !found.item.active });
  if (res?.success) {
    found.item.active = res.data.active;
    renderChecklistTemplates();
    toast(res.data.active ? 'Point réactivé ✅' : 'Point désactivé : il ne sera plus proposé aux projets', res.data.active ? 'success' : 'warning');
  } else toast(res?.error || 'Erreur', 'error');
}

async function seedChecklistLibrary(reset) {
  if (reset && !confirm('Recharger la bibliothèque Viewbox d’origine ?\n\nToutes les modifications faites dans la bibliothèque (points ajoutés, modifiés, désactivés, ordre) seront perdues.\nLes check-lists déjà configurées dans les projets ne changent pas.')) return;
  toast('Chargement de la bibliothèque...', 'info');
  const res = await api('POST', '/checklists/templates/seed', reset ? { reset: true } : {});
  if (res?.success) {
    toast(`Bibliothèque chargée ✅ ${res.data.categories} catégories, ${res.data.items} points`, 'success');
    CLT_OPEN.clear();
    loadChecklistTemplatesPage();
  } else toast(res?.error || 'Erreur chargement', 'error');
}

// ─── Catégories ───
function showChecklistCategoryModal(catId) {
  const cat = catId ? CLT_LIB[CLT_PHASE].find(c => c.id === catId) : null;
  const el = document.createElement('div'); el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-head"><div class="modal-title">${cat ? '✏️ Renommer la catégorie' : '🗂️ Nouvelle catégorie'}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div class="form-group2"><label class="form-label2">Nom *</label>
        <input class="input" id="clc-name" value="${esc(cat?.name || '')}" placeholder="ex: Électricité" onkeydown="if(event.key==='Enter')saveChecklistCategory(${cat ? `'${cat.id}'` : 'null'}, this.closest('.overlay'))">
      </div>
      <div style="font-size:12px;color:var(--text3);">Phase : ${CHECKLIST_PHASE_LABELS[CLT_PHASE]}</div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="saveChecklistCategory(${cat ? `'${cat.id}'` : 'null'}, this.closest('.overlay'))">${cat ? '💾 Enregistrer' : '✅ Créer'}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  setTimeout(() => el.querySelector('#clc-name')?.focus(), 50);
}

async function saveChecklistCategory(catId, overlay) {
  const name = overlay?.querySelector('#clc-name')?.value.trim();
  if (!name) { toast('Nom obligatoire', 'error'); return; }
  const res = catId
    ? await api('PATCH', `/checklists/templates/categories/${catId}`, { name })
    : await api('POST', '/checklists/templates/categories', { name, phase: CLT_PHASE });
  if (res?.success) {
    toast(catId ? 'Catégorie renommée ✅' : 'Catégorie créée ✅', 'success');
    CLT_OPEN.add(res.data.id);
    overlay?.remove();
    loadChecklistTemplatesPage();
  } else toast(res?.error || 'Erreur', 'error');
}

async function deleteChecklistCategory(catId) {
  const cat = CLT_LIB[CLT_PHASE].find(c => c.id === catId);
  if (!cat) return;
  const n = (cat.items || []).length;
  if (!confirm(`Supprimer la catégorie « ${cat.name} »${n ? ` et ses ${n} point(s)` : ''} ?\n\nLes check-lists déjà configurées dans les projets ne changent pas.`)) return;
  const res = await api('DELETE', `/checklists/templates/categories/${catId}`);
  if (res?.success) { toast('Catégorie supprimée', 'warning'); loadChecklistTemplatesPage(); }
  else toast(res?.error || 'Erreur suppression', 'error');
}

// ─── Points ───
function checklistFlagRow(id, checked, title, sub) {
  return `
    <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;min-height:44px;background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);cursor:pointer;margin-bottom:8px;">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="width:18px;height:18px;margin-top:1px;flex-shrink:0;accent-color:var(--accent);">
      <span><span style="font-size:13px;font-weight:600;">${title}</span><br><span style="font-size:11px;color:var(--text3);">${sub}</span></span>
    </label>`;
}

function showChecklistItemModal(itemId, catId) {
  const cats = CLT_LIB[CLT_PHASE];
  if (!cats.length) { toast('Crée d’abord une catégorie', 'error'); return; }
  const found = itemId ? findChecklistTemplateItem(itemId) : null;
  if (itemId && !found) return;
  const it = found?.item || { scope: 'all', photoRequired: false, critical: false, optional: false, active: true };
  const selCat = found?.cat.id || catId || cats[0].id;
  const idArg = itemId ? `'${itemId}'` : 'null';
  const el = document.createElement('div'); el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head"><div class="modal-title">${itemId ? '✏️ Modifier le point' : '☑️ Nouveau point'}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div class="form-group2"><label class="form-label2">Catégorie *</label>
        <select class="input" id="cli-cat">
          ${cats.map((c, i) => `<option value="${c.id}" ${c.id === selCat ? 'selected' : ''}>${i + 1}. ${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group2"><label class="form-label2">Point à contrôler *</label>
        <textarea class="input" id="cli-label" rows="2" placeholder="ex: Différentiels testés (bouton test) sur chaque coffret">${esc(it.label || '')}</textarea>
      </div>
      <div class="form-group2"><label class="form-label2">Précision (affichée en petit sous le point)</label>
        <input class="input" id="cli-hint" value="${esc(it.hint || '')}" placeholder="facultatif">
      </div>
      <div class="form-group2"><label class="form-label2">Viewbox concernées</label>
        <select class="input" id="cli-scope">
          <option value="all" ${it.scope !== 'permanent' ? 'selected' : ''}>Toutes (éphémères et permanentes)</option>
          <option value="permanent" ${it.scope === 'permanent' ? 'selected' : ''}>Permanentes uniquement (PERM)</option>
        </select>
      </div>
      ${checklistFlagRow('cli-photo', it.photoRequired, '📷 Photo obligatoire', 'Impossible de mettre OK sans au moins une photo (travaux ensuite cachés).')}
      ${checklistFlagRow('cli-critical', it.critical, '⚠️ Critique', 'Doit être OK ou N.A. avant de générer le lien de signature du handover.')}
      ${checklistFlagRow('cli-optional', it.optional, 'Si présent', 'Non pré-coché à la configuration : à cocher seulement si l’élément existe sur le projet.')}
      ${itemId ? checklistFlagRow('cli-active', it.active, 'Actif', 'Décoché : le point n’est plus proposé à la configuration des projets.') : ''}
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:12px;">
        ${itemId ? `<button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteChecklistTemplateItem('${itemId}', this.closest('.overlay'))">🗑️ Supprimer</button>` : '<span></span>'}
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
          <button class="btn btn-primary" onclick="saveChecklistTemplateItem(${idArg}, this.closest('.overlay'))">${itemId ? '💾 Enregistrer' : '✅ Créer'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  if (!itemId) setTimeout(() => el.querySelector('#cli-label')?.focus(), 50);
}

async function saveChecklistTemplateItem(itemId, overlay) {
  const q = sel => overlay?.querySelector(sel);
  const categoryId = q('#cli-cat')?.value;
  const label = q('#cli-label')?.value.trim();
  if (!categoryId || !label) { toast('Catégorie et point à contrôler obligatoires', 'error'); return; }
  const body = {
    categoryId,
    label,
    hint: q('#cli-hint')?.value.trim() || null,
    scope: q('#cli-scope')?.value || 'all',
    photoRequired: !!q('#cli-photo')?.checked,
    critical: !!q('#cli-critical')?.checked,
    optional: !!q('#cli-optional')?.checked,
  };
  let res;
  if (itemId) {
    const found = findChecklistTemplateItem(itemId);
    body.active = !!q('#cli-active')?.checked;
    // changement de catégorie : le point passe à la fin de sa nouvelle catégorie
    if (found && found.cat.id !== categoryId) {
      const target = CLT_LIB[CLT_PHASE].find(c => c.id === categoryId);
      body.sortOrder = Math.max(-1, ...(target?.items || []).map(i => i.sortOrder)) + 1;
    }
    res = await api('PATCH', `/checklists/templates/items/${itemId}`, body);
  } else {
    res = await api('POST', '/checklists/templates/items', body);
  }
  if (res?.success) {
    toast(itemId ? 'Point mis à jour ✅' : 'Point ajouté ✅', 'success');
    CLT_OPEN.add(categoryId);
    overlay?.remove();
    loadChecklistTemplatesPage();
  } else toast(res?.error || 'Erreur', 'error');
}

async function deleteChecklistTemplateItem(itemId, overlay) {
  if (!confirm('Supprimer ce point de la bibliothèque ?\n\nLes check-lists déjà configurées dans les projets le gardent. Pour seulement ne plus le proposer, décoche « Actif ».')) return;
  const res = await api('DELETE', `/checklists/templates/items/${itemId}`);
  if (res?.success) { toast('Point supprimé', 'warning'); overlay?.remove(); loadChecklistTemplatesPage(); }
  else toast(res?.error || 'Erreur suppression', 'error');
}

// ═══════════════════════════════════════════════════════════
// ☑️ CHECK-LIST D'UN PROJET — carte de l'onglet Handover,
// configuration (Technical Manager) et remplissage sur site (Site Manager)
// ═══════════════════════════════════════════════════════════
const CHECKLIST_FILL_ROLES = [...CHECKLIST_EDIT_ROLES, 'site_manager'];
const CHECKLIST_COMMENT_REQUIRED = ['partial', 'nok', 'na'];
const CHECKLIST_STATUS = {
  pending: { icon: '⏳', label: 'À vérifier', short: 'À vérifier', color: 'var(--text3)', bg: 'var(--bg3)' },
  ok:      { icon: '✅', label: 'OK',         short: 'OK',         color: 'var(--green)', bg: 'rgba(45,198,83,.15)' },
  partial: { icon: '🟠', label: 'Partiel',    short: 'Partiel',    color: 'var(--amber)', bg: 'rgba(244,162,97,.15)' },
  nok:     { icon: '❌', label: 'Non fait',   short: 'Non',        color: 'var(--accent)', bg: 'rgba(230,57,70,.15)' },
  na:      { icon: '➖', label: 'N.A.',       short: 'N.A.',       color: 'var(--text2)', bg: 'rgba(155,163,178,.15)' },
};
const CHECKLIST_VIEWBOX_LABELS = { ephemere: 'Éphémère', permanente: 'Permanente' };
const CHECKLIST_CUSTOM_CATEGORY = 'Points spécifiques au projet';

function checklistCanFill() {
  return !!CURRENT_USER && CHECKLIST_FILL_ROLES.includes(CURRENT_USER.role);
}

/** « Prénom N. » */
function checklistShortName(u) {
  if (!u) return '';
  return `${u.firstName || ''} ${u.lastName ? u.lastName[0] + '.' : ''}`.trim();
}

/** Mêmes règles que checklistStats côté serveur (src/services/checklistService.ts). */
function checklistLocalStats(items) {
  const s = { total: items.length, pending: 0, ok: 0, partial: 0, nok: 0, na: 0, criticalOpen: 0, photoMissing: 0, percent: 0 };
  for (const it of items) {
    if (s[it.status] !== undefined) s[it.status]++;
    const closed = it.status === 'ok' || it.status === 'na';
    if (it.critical && !closed) s.criticalOpen++;
    if (it.photoRequired && !(it.photos || []).length && it.status !== 'na') s.photoMissing++;
  }
  s.percent = s.total ? Math.round(((s.ok + s.na) / s.total) * 100) : 0;
  return s;
}

/** Appel API qui renvoie aussi le code HTTP : 4xx = refusé (message à montrer), 0 / 5xx = pas enregistré (réessayer). */
async function checklistRequest(method, path, body) {
  try {
    const opts = { method, headers: { 'Authorization': `Bearer ${TOKEN}` } };
    if (body instanceof FormData) opts.body = body;
    else if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
    const r = await fetch(API + path, opts);
    if (r.status === 401) { doLogout(); return { status: 401, ok: false, data: null }; }
    const data = await r.json().catch(() => null);
    return { status: r.status, ok: r.ok && !!data?.success, data };
  } catch (e) {
    return { status: 0, ok: false, data: null };
  }
}

/** Barre de progression compacte (en-tête fixe de la vue de remplissage). */
function checklistCompactProgressHtml(s) {
  return `
    <div style="display:flex;align-items:center;gap:8px;margin-top:8px;">
      <div class="prog" style="flex:1;height:8px;"><div class="prog-bar" style="width:${s.percent}%;background:var(--green);"></div></div>
      <span style="font-size:12px;font-weight:700;color:var(--text2);white-space:nowrap;">${s.ok + s.na}/${s.total}</span>
      ${s.criticalOpen ? `<span class="badge badge-red" title="Points critiques ni OK ni N.A.">⚠️ ${s.criticalOpen}</span>` : ''}
      ${s.photoMissing ? `<span class="badge badge-amber" title="Photos obligatoires manquantes">📷 ${s.photoMissing}</span>` : ''}
    </div>`;
}

function checklistStatsHtml(s, withBar = true) {
  const n = (k) => `<span title="${CHECKLIST_STATUS[k].label}" style="white-space:nowrap;">${CHECKLIST_STATUS[k].icon} ${s[k]}</span>`;
  return `
    ${withBar ? `<div style="display:flex;align-items:center;gap:10px;margin-top:10px;">
      <div class="prog" style="flex:1;height:8px;"><div class="prog-bar" style="width:${s.percent}%;background:var(--green);"></div></div>
      <div style="font-size:12px;font-weight:700;color:var(--text2);">${s.ok + s.na}/${s.total}</div>
    </div>` : ''}
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:8px;color:var(--text2);">
      ${n('ok')}${n('partial')}${n('nok')}${n('na')}${n('pending')}
    </div>
    ${s.criticalOpen || s.photoMissing ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
      ${s.criticalOpen ? `<span class="badge badge-red">⚠️ ${s.criticalOpen} critique(s) ouvert(s)</span>` : ''}
      ${s.photoMissing ? `<span class="badge badge-amber">📷 ${s.photoMissing} photo(s) manquante(s)</span>` : ''}
    </div>` : ''}`;
}

// ─── Carte « Check-list de montage » au-dessus des handovers du projet ───
async function loadChecklistCard(projectId) {
  const el = document.getElementById('detail-checklist-card');
  if (!el) return;
  const [inst, dism] = await Promise.all([
    api('GET', `/checklists/project/${projectId}?phase=installation`),
    api('GET', `/checklists/project/${projectId}?phase=dismantling`),
  ]);
  if (CURRENT_PROJECT_ID !== projectId) return;
  // projet non accessible (installer / site manager non affecté) : pas de carte
  if (!inst?.success && !dism?.success) { el.innerHTML = ''; return; }
  const canConfigure = checklistCanEdit();
  const canFill = checklistCanFill();
  const block = (phase, cl) => {
    if (!cl && phase === 'dismantling' && !canConfigure) return '';
    const head = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-weight:700;font-size:13px;">${CHECKLIST_PHASE_LABELS[phase]}</span>
          ${cl ? `<span class="badge badge-muted">${CHECKLIST_VIEWBOX_LABELS[cl.viewboxType] || cl.viewboxType}</span>` : ''}
          ${cl?.validatedAt ? `<span class="badge badge-green" title="Validée par ${esc(checklistShortName(cl.validatedBy))}">✅ Validée le ${fmtDate(cl.validatedAt)}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          ${cl ? `<button class="btn btn-primary btn-sm" onclick="openChecklistFull('${projectId}','${phase}')">${canFill ? '✍️ Remplir' : '👁️ Voir'}</button>` : ''}
          ${canConfigure ? `<button class="btn btn-ghost btn-sm" onclick="openChecklistConfig('${projectId}','${phase}')">${cl ? '⚙️ Modifier la sélection' : '⚙️ Configurer la check-list'}</button>` : ''}
        </div>
      </div>`;
    const body = cl
      ? checklistStatsHtml(cl.stats)
      : `<div style="font-size:12px;color:var(--text3);margin-top:6px;">Pas encore configurée${canConfigure ? '' : ' — le Technical Manager la prépare'}.</div>`;
    return `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px;">${head}${body}</div>`;
  };
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header"><span class="card-title">☑️ Check-list de montage</span></div>
      <div class="card-body" style="padding:12px 14px;display:flex;flex-direction:column;gap:10px;">
        ${block('installation', inst?.data)}
        ${block('dismantling', dism?.data)}
      </div>
    </div>`;
}

// ─── Configuration (Technical Manager) ───
let CLC = null; // état de la modale de configuration

async function openChecklistConfig(projectId, phase) {
  const [lib, cur] = await Promise.all([
    api('GET', `/checklists/templates?phase=${phase}&all=1`),
    api('GET', `/checklists/project/${projectId}?phase=${phase}`),
  ]);
  if (!lib?.success || !cur?.success) { toast(lib?.error || cur?.error || 'Erreur de chargement', 'error'); return; }
  const existing = cur.data;
  const existingByTpl = new Map();
  const libIds = new Set(lib.data.flatMap(c => (c.items || []).map(i => i.id)));
  const customs = [];
  for (const it of existing?.items || []) {
    const filled = it.status !== 'pending' || (it.photos || []).length > 0;
    if (it.templateItemId && libIds.has(it.templateItemId)) existingByTpl.set(it.templateItemId, { ...it, filled });
    // points ajoutés à la main, ou dont le modèle a été supprimé de la bibliothèque
    else customs.push({ id: it.id, categoryName: it.categoryName, label: it.label, hint: it.hint, photoRequired: it.photoRequired, critical: it.critical, keep: true, filled, status: it.status });
  }
  // points désactivés : visibles seulement s'ils sont déjà dans la check-list
  const cats = lib.data
    .map(c => ({ ...c, items: (c.items || []).filter(i => i.active || existingByTpl.has(i.id)) }))
    .filter(c => c.items.length);
  if (!cats.length && !existing) {
    const el = document.createElement('div'); el.className = 'overlay open';
    el.innerHTML = `
      <div class="modal" style="max-width:440px;">
        <div class="modal-head"><div class="modal-title">☑️ Bibliothèque vide</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
        <div style="font-size:13px;color:var(--text2);line-height:1.6;">Aucun point de contrôle pour la phase ${CHECKLIST_PHASE_LABELS[phase]}. Charge d’abord la bibliothèque dans Admin › Templates check-list.</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
          <button class="btn btn-primary" onclick="this.closest('.overlay').remove();goto('checklist-templates')">Ouvrir la bibliothèque</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => { if (e.target === el) el.remove(); });
    return;
  }
  CLC = {
    projectId, phase, cats, existing, existingByTpl, customs,
    viewboxType: existing?.viewboxType || 'ephemere',
    selected: new Set(existingByTpl.keys()),
    closed: new Set(),
  };
  if (!existing) checklistConfigApplyType(CLC.viewboxType, true);

  const el = document.createElement('div'); el.className = 'overlay open'; el.id = 'checklist-config-overlay';
  el.innerHTML = `
    <div class="modal" style="max-width:760px;">
      <div class="modal-head">
        <div>
          <div class="modal-title">☑️ ${existing ? 'Modifier la check-list' : 'Configurer la check-list'} — ${CHECKLIST_PHASE_LABELS[phase]}</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;">Coche les points à contrôler sur ce projet. Ils sont copiés dans le projet : la bibliothèque peut changer ensuite sans toucher à cette check-list.</div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div class="form-group2"><label class="form-label2">Type de Viewbox</label>
        <div id="clc-type" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0 10px;">
        <div id="clc-count" style="font-size:13px;font-weight:600;"></div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" onclick="checklistConfigToggleAll(true)">Tout déplier</button>
          <button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}" onclick="checklistConfigToggleAll(false)">Tout replier</button>
        </div>
      </div>
      <div id="clc-list"></div>
      <div style="margin-top:14px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;">Points spécifiques au projet</div>
        <div id="clc-customs"></div>
        <datalist id="clc-cat-names">${[...new Set([...cats.map(c => c.name), CHECKLIST_CUSTOM_CATEGORY])].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center;margin-top:4px;min-height:44px;" onclick="checklistConfigAddCustom()">+ Point spécifique au projet</button>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" id="clc-save" onclick="saveChecklistConfig(false)">💾 Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  renderChecklistConfig();
  renderChecklistConfigCustoms();
}

/** Points de bibliothèque visibles pour le type choisi (Éphémère = points « toutes Viewbox » seulement). */
function checklistConfigVisible(it) {
  return it.scope !== 'permanent' || CLC.viewboxType === 'permanente' || CLC.selected.has(it.id);
}

function checklistConfigApplyType(type, initial) {
  CLC.viewboxType = type;
  for (const cat of CLC.cats) for (const it of cat.items) {
    if (initial) {
      if (it.active && !it.optional && (it.scope !== 'permanent' || type === 'permanente')) CLC.selected.add(it.id);
    } else if (it.scope === 'permanent') {
      if (type === 'ephemere') CLC.selected.delete(it.id);
      else if (it.active && !it.optional) CLC.selected.add(it.id);
    }
  }
}

function checklistConfigSetType(type) {
  if (type === CLC.viewboxType) return;
  checklistConfigApplyType(type, false);
  renderChecklistConfig();
}

function checklistConfigToggleItem(id, checked) {
  if (checked) CLC.selected.add(id); else CLC.selected.delete(id);
  renderChecklistConfig();
}

function checklistConfigToggleCategory(ci, checked) {
  for (const it of CLC.cats[ci].items) {
    if (!checklistConfigVisible(it)) continue;
    if (checked) CLC.selected.add(it.id); else CLC.selected.delete(it.id);
  }
  renderChecklistConfig();
}

function checklistConfigToggleOpen(ci) {
  if (CLC.closed.has(ci)) CLC.closed.delete(ci); else CLC.closed.add(ci);
  renderChecklistConfig();
}

function checklistConfigToggleAll(open) {
  CLC.closed = open ? new Set() : new Set(CLC.cats.map((_, i) => i));
  renderChecklistConfig();
}

function renderChecklistConfig() {
  const typeEl = document.getElementById('clc-type');
  const list = document.getElementById('clc-list');
  if (!CLC || !typeEl || !list) return;
  typeEl.innerHTML = ['ephemere', 'permanente'].map(t => `
    <button class="btn ${CLC.viewboxType === t ? 'btn-primary' : 'btn-ghost'}" style="justify-content:center;min-height:48px;flex-direction:column;gap:2px;white-space:normal;" onclick="checklistConfigSetType('${t}')">
      <span>${t === 'ephemere' ? '⛺ Éphémère' : '🏠 Permanente'}</span>
      <span style="font-size:11px;font-weight:500;opacity:.8;">${t === 'ephemere' ? 'points communs à toutes les Viewbox' : 'points communs + isolation, pare-vapeur, enveloppe'}</span>
    </button>`).join('');

  let selectedVisible = 0;
  list.innerHTML = CLC.cats.map((cat, ci) => {
    const items = cat.items.filter(checklistConfigVisible);
    if (!items.length) return '';
    const n = items.filter(i => CLC.selected.has(i.id)).length;
    selectedVisible += n;
    const open = !CLC.closed.has(ci);
    return `
      <div style="border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg3);cursor:pointer;min-height:48px;" onclick="checklistConfigToggleOpen(${ci})">
          <input type="checkbox" data-ci="${ci}" data-state="${n === 0 ? 'none' : n === items.length ? 'all' : 'some'}" ${n === items.length ? 'checked' : ''} title="Tout cocher / décocher"
            onclick="event.stopPropagation();checklistConfigToggleCategory(${ci}, this.checked)" style="width:20px;height:20px;flex-shrink:0;accent-color:var(--accent);">
          <div style="flex:1;min-width:0;font-weight:700;font-size:13px;overflow-wrap:anywhere;">${esc(cat.name)}</div>
          <span style="font-size:12px;color:var(--text3);white-space:nowrap;">${n}/${items.length}</span>
          <span style="color:var(--text3);width:12px;">${open ? '▾' : '▸'}</span>
        </div>
        ${open ? items.map(it => {
          const ex = CLC.existingByTpl.get(it.id);
          return `
          <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;min-height:44px;border-top:1px solid var(--border);cursor:pointer;">
            <input type="checkbox" ${CLC.selected.has(it.id) ? 'checked' : ''} onchange="checklistConfigToggleItem('${it.id}', this.checked)" style="width:20px;height:20px;margin-top:1px;flex-shrink:0;accent-color:var(--accent);">
            <span style="flex:1;min-width:0;">
              <span style="font-size:13px;overflow-wrap:anywhere;">${esc(it.label)}</span>
              ${it.hint ? `<span style="display:block;font-size:11px;color:var(--text3);margin-top:2px;">${esc(it.hint)}</span>` : ''}
              <span style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${checklistTemplateBadges(it)}${ex?.filled ? `<span class="badge badge-green" title="Déjà rempli sur ce projet">${CHECKLIST_STATUS[ex.status].icon} déjà vérifié</span>` : ''}</span>
            </span>
          </label>`;
        }).join('') : ''}
      </div>`;
  }).join('');
  list.querySelectorAll('input[data-state="some"]').forEach(cb => { cb.indeterminate = true; });

  const customs = CLC.customs.filter(c => c.keep && c.label.trim()).length;
  const count = document.getElementById('clc-count');
  if (count) count.textContent = `${selectedVisible + customs} point(s) sélectionné(s)${customs ? ` dont ${customs} spécifique(s)` : ''}`;
}

function renderChecklistConfigCustoms() {
  const el = document.getElementById('clc-customs');
  if (!CLC || !el) return;
  el.innerHTML = CLC.customs.map((c, i) => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--radius);padding:10px;margin-bottom:8px;${c.keep ? '' : 'opacity:.5;'}">
      <div style="display:flex;gap:8px;align-items:flex-start;">
        ${c.id
          ? `<input type="checkbox" ${c.keep ? 'checked' : ''} title="Garder ce point" onchange="CLC.customs[${i}].keep=this.checked;renderChecklistConfigCustoms();renderChecklistConfig()" style="width:20px;height:20px;margin-top:10px;flex-shrink:0;accent-color:var(--accent);">`
          : `<button class="btn btn-ghost btn-xs" style="${CLT_BTN_SM}color:var(--accent);margin-top:4px;" title="Retirer" onclick="CLC.customs.splice(${i},1);renderChecklistConfigCustoms();renderChecklistConfig()">✕</button>`}
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;">
          <input class="input" placeholder="Point à contrôler *" value="${esc(c.label)}" oninput="CLC.customs[${i}].label=this.value;renderChecklistConfig()">
          <input class="input" list="clc-cat-names" placeholder="Catégorie" value="${esc(c.categoryName)}" oninput="CLC.customs[${i}].categoryName=this.value">
          <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:13px;">
            <label style="display:flex;gap:6px;align-items:center;min-height:36px;cursor:pointer;"><input type="checkbox" ${c.photoRequired ? 'checked' : ''} onchange="CLC.customs[${i}].photoRequired=this.checked" style="width:18px;height:18px;accent-color:var(--accent);">📷 Photo obligatoire</label>
            <label style="display:flex;gap:6px;align-items:center;min-height:36px;cursor:pointer;"><input type="checkbox" ${c.critical ? 'checked' : ''} onchange="CLC.customs[${i}].critical=this.checked" style="width:18px;height:18px;accent-color:var(--accent);">⚠️ Critique</label>
            ${c.filled ? `<span class="badge badge-green" style="align-self:center;">${CHECKLIST_STATUS[c.status]?.icon || ''} déjà vérifié</span>` : ''}
          </div>
        </div>
      </div>
    </div>`).join('');
}

function checklistConfigAddCustom() {
  CLC.customs.push({ id: null, categoryName: CHECKLIST_CUSTOM_CATEGORY, label: '', hint: null, photoRequired: false, critical: false, keep: true, filled: false });
  renderChecklistConfigCustoms();
  const inputs = document.querySelectorAll('#clc-customs input.input[placeholder^="Point"]');
  inputs[inputs.length - 1]?.focus();
}

async function saveChecklistConfig(force) {
  if (!CLC) return;
  const templateItemIds = CLC.cats.flatMap(c => c.items).filter(it => CLC.selected.has(it.id) && checklistConfigVisible(it)).map(it => it.id);
  const kept = CLC.customs.filter(c => c.keep && (c.id || c.label.trim()));
  if (kept.some(c => !c.label.trim())) { toast('Un point spécifique gardé n’a plus de libellé', 'error'); return; }
  const customItems = kept.map(c => ({
    ...(c.id ? { id: c.id } : {}),
    categoryName: c.categoryName.trim() || CHECKLIST_CUSTOM_CATEGORY,
    label: c.label.trim(), hint: c.hint || null, photoRequired: !!c.photoRequired, critical: !!c.critical,
  }));
  if (!templateItemIds.length && !customItems.length) { toast('Sélectionne au moins un point', 'error'); return; }
  const btn = document.getElementById('clc-save');
  if (btn) btn.disabled = true;
  const r = await checklistRequest('POST', `/checklists/project/${CLC.projectId}/configure`, {
    phase: CLC.phase, viewboxType: CLC.viewboxType, templateItemIds, customItems, force,
  });
  if (btn) btn.disabled = false;
  if (r.status === 409 && r.data?.data?.filledItems) {
    const filled = r.data.data.filledItems;
    const list = filled.slice(0, 15).map(f => `• ${f.label} (${CHECKLIST_STATUS[f.status]?.label || f.status}${f.photos ? `, ${f.photos} photo(s)` : ''})`).join('\n');
    if (confirm(`${filled.length} point(s) déjà rempli(s) vont être retirés de la check-list, avec leurs photos et leur historique :\n\n${list}${filled.length > 15 ? '\n…' : ''}\n\nRetirer quand même ?`)) saveChecklistConfig(true);
    return;
  }
  if (!r.ok) { toast(r.data?.error || 'Check-list non enregistrée — réessaie', 'error'); return; }
  const m = r.data.meta || {};
  toast(`Check-list enregistrée ✅ ${r.data.data.items.length} point(s)${m.added && CLC.existing ? ` · ${m.added} ajouté(s)` : ''}${m.removed ? ` · ${m.removed} retiré(s)` : ''}`, 'success');
  const projectId = CLC.projectId;
  document.getElementById('checklist-config-overlay')?.remove();
  CLC = null;
  loadChecklistCard(projectId);
}

// ─── Remplissage sur site (plein écran, pensé pour le téléphone) ───
let CLF = null; // état de la vue de remplissage

async function openChecklistFull(projectId, phase = 'installation') {
  const [cl, proj] = await Promise.all([
    api('GET', `/checklists/project/${projectId}?phase=${phase}`),
    api('GET', `/projects/${projectId}`),
  ]);
  if (!cl?.success) { toast(cl?.error || 'Check-list introuvable', 'error'); return; }
  if (!cl.data) { toast('Check-list pas encore configurée', 'error'); return; }
  CLF = { projectId, phase, checklist: cl.data, project: proj?.success ? proj.data : null, items: new Map(), order: [], filter: 'todo', closed: new Set(), timers: {} };
  for (const it of cl.data.items) {
    CLF.items.set(it.id, { ...it, _status: it.status, _comment: it.comment || '', _showComment: !!it.comment });
    CLF.order.push(it.id);
  }
  document.getElementById('checklist-full')?.remove();
  const view = document.createElement('div');
  view.id = 'checklist-full';
  view.style.cssText = 'position:fixed;inset:0;z-index:450;background:var(--bg);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;';
  document.body.appendChild(view);
  // la barre du bas (mobile) et l'assistant passeraient par-dessus la vue
  document.querySelector('.bottom-nav')?.style.setProperty('display', 'none', 'important');
  document.getElementById('assistant-widget')?.style.setProperty('display', 'none');
  renderChecklistFull();
}

function closeChecklistFull() {
  if (!CLF) return;
  const unsaved = [...CLF.items.values()].filter(it => it._status !== it.status || it._error).length;
  if (unsaved && !confirm(`${unsaved} point(s) pas encore enregistré(s) (commentaire manquant ou erreur réseau).\n\nFermer quand même ?`)) return;
  Object.values(CLF.timers).forEach(clearTimeout);
  const projectId = CLF.projectId;
  CLF = null;
  document.getElementById('checklist-full')?.remove();
  document.querySelector('.bottom-nav')?.style.removeProperty('display');
  document.getElementById('assistant-widget')?.style.removeProperty('display');
  if (CURRENT_PROJECT_ID === projectId) loadChecklistCard(projectId);
}

function checklistFullStats() {
  return checklistLocalStats([...CLF.items.values()]);
}

const CHECKLIST_FILTERS = {
  todo:     { label: 'À traiter', match: it => ['pending', 'partial', 'nok'].includes(it.status) },
  problems: { label: 'Problèmes', match: it => ['partial', 'nok'].includes(it.status) },
  all:      { label: 'Tout',      match: () => true },
};

/** Catégories dans l'ordre de la check-list (points consécutifs de même catégorie). */
function checklistFullGroups() {
  const groups = [];
  for (const id of CLF.order) {
    const it = CLF.items.get(id);
    if (!groups.length || groups[groups.length - 1].name !== it.categoryName) groups.push({ name: it.categoryName, ids: [] });
    groups[groups.length - 1].ids.push(id);
  }
  return groups;
}

function renderChecklistFull() {
  const view = document.getElementById('checklist-full');
  if (!CLF || !view) return;
  const p = CLF.project;
  view.innerHTML = `
    <div style="position:sticky;top:0;z-index:2;background:var(--bg2);border-bottom:1px solid var(--border);box-shadow:0 4px 14px rgba(0,0,0,.25);">
      <div style="max-width:900px;margin:0 auto;padding:10px 14px 12px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <button class="btn btn-ghost btn-sm" style="min-height:44px;flex-shrink:0;" onclick="closeChecklistFull()">← Fermer</button>
          <div style="min-width:0;flex:1;">
            <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:15px;overflow-wrap:anywhere;">☑️ Check-list ${CLF.phase === 'dismantling' ? 'de démontage' : 'de montage'}</div>
            <div style="font-size:12px;color:var(--text2);overflow-wrap:anywhere;">${esc(p ? `${p.name} · ${p.internalNumber}` : '')}</div>
          </div>
        </div>
        <div id="clf-progress"></div>
      </div>
    </div>
    <div style="max-width:900px;margin:0 auto;padding:14px 14px calc(40px + env(safe-area-inset-bottom));">
      <div id="clf-info"></div>
      <div id="clf-counters" style="margin:-4px 0 12px;"></div>
      <div id="clf-filters" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:14px;"></div>
      <div id="clf-list"></div>
      <div id="clf-footer"></div>
    </div>`;
  renderChecklistFullInfo();
  renderChecklistFullList();
  updateChecklistFullSummary();
}

function renderChecklistFullInfo() {
  const el = document.getElementById('clf-info');
  if (!el) return;
  const cl = CLF.checklist;
  const canFill = checklistCanFill();
  const sms = (CLF.project?.team || []).filter(t => t.role === 'site_manager' || t.user?.role === 'site_manager').map(t => `${t.user.firstName} ${t.user.lastName}`);
  el.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-bottom:14px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px;">
        <span class="badge badge-muted">Viewbox ${CHECKLIST_VIEWBOX_LABELS[cl.viewboxType] || cl.viewboxType}</span>
        ${cl.validatedAt ? `<span class="badge badge-green">✅ Validée le ${fmtDate(cl.validatedAt)}${cl.validatedBy ? ` par ${esc(checklistShortName(cl.validatedBy))}` : ''}</span>` : ''}
      </div>
      <div style="font-size:12px;color:var(--text2);line-height:1.7;">
        👷 Site Manager : <strong>${esc(sms.join(', ') || '—')}</strong><br>
        ⚙️ Configurée le ${fmtDate(cl.configuredAt)}${cl.configuredBy ? ` par ${esc(checklistShortName(cl.configuredBy))}` : ''}
      </div>
      <div class="form-group2" style="margin:10px 0 0;">
        <label class="form-label2">Boxes contrôlées</label>
        <input class="input" id="clf-boxes" value="${esc(cl.boxesChecked || '')}" placeholder="ex: VBX-01 à VBX-12" ${canFill ? '' : 'disabled'} onchange="saveChecklistFullField('boxesChecked', this.value)">
      </div>
    </div>`;
}

function checklistFullFilterCount(key) {
  let n = 0;
  for (const it of CLF.items.values()) if (CHECKLIST_FILTERS[key].match(it)) n++;
  return n;
}

function setChecklistFullFilter(key) {
  CLF.filter = key;
  renderChecklistFullList();
  updateChecklistFullSummary();
  document.getElementById('checklist-full')?.scrollTo({ top: 0 });
}

function toggleChecklistFullCategory(gi) {
  const name = checklistFullGroups()[gi]?.name;
  if (name === undefined) return;
  if (CLF.closed.has(name)) CLF.closed.delete(name); else CLF.closed.add(name);
  renderChecklistFullList();
}

function renderChecklistFullList() {
  const el = document.getElementById('clf-list');
  if (!el) return;
  const match = CHECKLIST_FILTERS[CLF.filter].match;
  const html = checklistFullGroups().map((g, gi) => {
    const visible = g.ids.filter(id => match(CLF.items.get(id)));
    if (!visible.length) return '';
    const open = !CLF.closed.has(g.name);
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;padding:10px 4px;cursor:pointer;min-height:44px;" onclick="toggleChecklistFullCategory(${gi})">
          <span style="color:var(--text3);width:12px;">${open ? '▾' : '▸'}</span>
          <div style="flex:1;min-width:0;font-family:'Syne',sans-serif;font-weight:700;font-size:14px;overflow-wrap:anywhere;">${esc(g.name)}</div>
          <span id="clf-catcount-${gi}" style="font-size:12px;color:var(--text3);white-space:nowrap;"></span>
        </div>
        ${open ? visible.map(id => checklistFullItemHtml(CLF.items.get(id))).join('') : ''}
      </div>`;
  }).join('');
  el.innerHTML = html || `
    <div class="empty">
      <div class="empty-icon">${CLF.filter === 'all' ? '☑️' : '🎉'}</div>
      <div class="empty-title">${CLF.filter === 'todo' ? 'Plus rien à traiter' : CLF.filter === 'problems' ? 'Aucun problème ouvert' : 'Aucun point'}</div>
      ${CLF.filter !== 'all' ? '<button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="setChecklistFullFilter(\'all\')">Voir tous les points</button>' : ''}
    </div>`;
  for (const id of CLF.order) if (document.getElementById(`clf-item-${id}`)) updateChecklistItemView(id);
}

function checklistFullItemHtml(it) {
  const canFill = checklistCanFill();
  const id = it.id;
  return `
    <div id="clf-item-${id}" style="background:var(--bg2);border:1px solid var(--border);border-left:4px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px;">
      <div style="font-size:14px;font-weight:600;line-height:1.4;overflow-wrap:anywhere;">${esc(it.label)}</div>
      ${it.hint ? `<div style="font-size:12px;color:var(--text3);margin-top:3px;overflow-wrap:anywhere;">${esc(it.hint)}</div>` : ''}
      ${it.photoRequired || it.critical ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;">
        ${it.photoRequired ? '<span class="badge badge-blue">📷 photo obligatoire</span>' : ''}
        ${it.critical ? '<span class="badge badge-red">⚠️ critique</span>' : ''}
      </div>` : ''}
      ${canFill ? `<div data-role="buttons" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px;">
        ${['ok', 'partial', 'nok', 'na'].map(s => `
          <button data-status="${s}" onclick="checklistSetStatus('${id}','${s}')" style="min-height:48px;border-radius:10px;border:2px solid var(--border);background:var(--bg3);color:var(--text2);font-weight:700;font-size:13px;font-family:'Inter',sans-serif;cursor:pointer;padding:4px 2px;">
            ${CHECKLIST_STATUS[s].icon}<br>${CHECKLIST_STATUS[s].short}
          </button>`).join('')}
      </div>` : `<div data-role="badge" style="margin-top:8px;"></div>`}
      <div data-role="comment" style="display:none;margin-top:8px;">
        ${canFill ? `<div style="display:flex;gap:6px;align-items:flex-start;">
          <textarea class="input" rows="2" placeholder="Commentaire" oninput="checklistCommentInput('${id}', this.value)" onblur="checklistCommentBlur('${id}')" style="flex:1;min-height:48px;resize:vertical;"></textarea>
          <button class="btn btn-ghost" style="min-width:48px;min-height:48px;justify-content:center;padding:0;" title="Dicter le commentaire" onclick="checklistDictate('${id}')">🎙️</button>
        </div>
        <div data-role="comment-hint" style="font-size:12px;color:var(--accent);margin-top:4px;"></div>`
        : `<div data-role="comment-text" style="font-size:13px;color:var(--text2);white-space:pre-wrap;overflow-wrap:anywhere;"></div>`}
      </div>
      <div data-role="photos" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center;"></div>
      <div data-role="meta" style="font-size:11px;color:var(--text3);margin-top:8px;line-height:1.8;"></div>
      <div data-role="error" style="display:none;margin-top:8px;"></div>
    </div>`;
}

/** Met à jour un point affiché sans le recréer (le champ commentaire garde le focus pendant la saisie). */
function updateChecklistItemView(id) {
  const el = document.getElementById(`clf-item-${id}`);
  const it = CLF?.items.get(id);
  if (!el || !it) return;
  const canFill = checklistCanFill();
  const st = CHECKLIST_STATUS[it._status] || CHECKLIST_STATUS.pending;
  const needsComment = CHECKLIST_COMMENT_REQUIRED.includes(it._status) && !it._comment.trim();
  el.style.borderLeftColor = st.color === 'var(--text3)' ? 'var(--border)' : st.color;
  el.style.boxShadow = it._error ? '0 0 0 2px var(--accent)' : 'none';

  el.querySelectorAll('[data-status]').forEach(b => {
    const s = CHECKLIST_STATUS[b.dataset.status];
    const on = b.dataset.status === it._status;
    b.style.borderColor = on ? s.color : 'var(--border)';
    b.style.background = on ? s.bg : 'var(--bg3)';
    b.style.color = on ? s.color : 'var(--text2)';
  });
  const badge = el.querySelector('[data-role="badge"]');
  if (badge) badge.innerHTML = `<span class="badge" style="background:${st.bg};color:${st.color};">${st.icon} ${st.label}</span>`;

  const box = el.querySelector('[data-role="comment"]');
  const showComment = it._showComment || CHECKLIST_COMMENT_REQUIRED.includes(it._status) || !!it._comment;
  box.style.display = showComment && (canFill || it._comment) ? 'block' : 'none';
  const ta = box.querySelector('textarea');
  if (ta) {
    if (document.activeElement !== ta && ta.value !== it._comment) ta.value = it._comment;
    ta.placeholder = CHECKLIST_COMMENT_REQUIRED.includes(it._status) ? `Pourquoi « ${st.label} » ? (obligatoire)` : 'Commentaire';
    ta.style.borderColor = needsComment ? 'var(--accent)' : '';
  }
  const hint = box.querySelector('[data-role="comment-hint"]');
  if (hint) hint.textContent = needsComment ? '⚠️ Commentaire obligatoire : le statut sera enregistré avec le commentaire.' : '';
  const txt = box.querySelector('[data-role="comment-text"]');
  if (txt) txt.textContent = it._comment;

  const photos = it.photos || [];
  const missingPhoto = it.photoRequired && !photos.length && it._status !== 'na';
  el.querySelector('[data-role="photos"]').innerHTML = `
    ${photos.map(ph => `
      <div style="position:relative;width:64px;height:64px;">
        <img src="${esc(ph.photoUrl)}" loading="lazy" onclick="openPhotoViewer('${esc(ph.photoUrl)}', 'photo.jpg')" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;">
        ${canFill ? `<button onclick="checklistDeletePhoto('${id}','${ph.id}')" title="Supprimer la photo" style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(0,0,0,.75);color:#fff;font-size:13px;cursor:pointer;line-height:24px;padding:0;">×</button>` : ''}
      </div>`).join('')}
    ${it._uploading ? `<div style="width:64px;height:64px;border-radius:8px;border:2px dashed var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text3);text-align:center;">⏳ envoi ${it._uploading}</div>` : ''}
    ${canFill ? `
      <label title="Prendre une photo" style="width:64px;height:64px;border-radius:8px;border:2px dashed ${missingPhoto ? 'var(--accent)' : 'var(--border)'};display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:22px;color:var(--text3);">
        📸<span style="font-size:9px;">Photo</span>
        <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="checklistUploadPhotos('${id}', this)">
      </label>
      <label title="Choisir dans la galerie" style="width:64px;height:64px;border-radius:8px;border:2px dashed var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;font-size:22px;color:var(--text3);">
        🖼️<span style="font-size:9px;">Galerie</span>
        <input type="file" accept="image/*" multiple style="display:none;" onchange="checklistUploadPhotos('${id}', this)">
      </label>` : ''}
    ${missingPhoto ? '<span style="font-size:12px;color:var(--accent);">📷 Photo obligatoire avant de mettre OK</span>' : ''}`;

  const meta = [];
  if (it._saving) meta.push('⏳ Enregistrement…');
  else if (it._status !== it.status && needsComment) meta.push('<span style="color:var(--amber);">Pas encore enregistré : ajoute le commentaire</span>');
  if (it.checkedBy && it.status !== 'pending') meta.push(`Vérifié par ${esc(checklistShortName(it.checkedBy))} — ${fmtDateTime(it.checkedAt)}`);
  if (it.logsCount) meta.push(`<a href="#" onclick="event.preventDefault();showChecklistItemHistory('${id}')" style="color:var(--blue);">Historique (${it.logsCount})</a>`);
  if (canFill && !showComment) meta.push(`<a href="#" onclick="event.preventDefault();checklistShowComment('${id}')" style="color:var(--blue);">💬 Commentaire</a>`);
  if (canFill && it.status !== 'pending' && !it._saving) meta.push(`<a href="#" onclick="event.preventDefault();checklistSetStatus('${id}','pending')" style="color:var(--text3);">↺ Remettre à vérifier</a>`);
  el.querySelector('[data-role="meta"]').innerHTML = meta.join(' · ');

  const err = el.querySelector('[data-role="error"]');
  err.style.display = it._error ? 'flex' : 'none';
  err.innerHTML = it._error ? `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;width:100%;background:rgba(230,57,70,.1);border:1px solid rgba(230,57,70,.4);border-radius:8px;padding:8px 10px;">
      <span style="font-size:12px;color:var(--accent2);">Non enregistré (réseau)</span>
      <button class="btn btn-primary btn-sm" onclick="checklistSaveItem('${id}')">↻ Réessayer</button>
    </div>` : '';
}

function updateChecklistFullSummary() {
  if (!CLF) return;
  const s = checklistFullStats();
  const prog = document.getElementById('clf-progress');
  if (prog) prog.innerHTML = checklistCompactProgressHtml(s);
  const counters = document.getElementById('clf-counters');
  if (counters) counters.innerHTML = checklistStatsHtml(s, false);
  const filters = document.getElementById('clf-filters');
  if (filters) filters.innerHTML = Object.entries(CHECKLIST_FILTERS).map(([k, f]) => `
    <button class="btn ${CLF.filter === k ? 'btn-primary' : 'btn-ghost'} btn-sm" style="justify-content:center;min-height:44px;" onclick="setChecklistFullFilter('${k}')">
      ${f.label} (${checklistFullFilterCount(k)})
    </button>`).join('');
  checklistFullGroups().forEach((g, gi) => {
    const c = document.getElementById(`clf-catcount-${gi}`);
    if (!c) return;
    const items = g.ids.map(id => CLF.items.get(id));
    const closed = items.filter(it => it.status === 'ok' || it.status === 'na').length;
    const problems = items.filter(it => it.status === 'partial' || it.status === 'nok').length;
    c.innerHTML = `${closed}/${items.length}${problems ? ` · <span style="color:var(--amber);">⚠️ ${problems}</span>` : ''}`;
  });
  renderChecklistFullFooter(s);
}

function renderChecklistFullFooter(s) {
  const el = document.getElementById('clf-footer');
  if (!el) return;
  const canFill = checklistCanFill();
  const cl = CLF.checklist;
  el.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin-top:6px;">
      <div class="form-group2" style="margin-bottom:12px;">
        <label class="form-label2">Notes générales</label>
        <textarea class="input" id="clf-notes" rows="2" placeholder="Remarques sur l’ensemble du montage" ${canFill ? '' : 'disabled'} onchange="saveChecklistFullField('notes', this.value)">${esc(cl.notes || '')}</textarea>
      </div>
      ${canFill ? `
        <button class="btn btn-green" style="width:100%;justify-content:center;min-height:52px;font-size:15px;" ${s.pending ? 'disabled' : ''} onclick="validateChecklistFull()">
          ${cl.validatedAt ? '✅ Valider à nouveau la check-list' : '✅ Valider la check-list'}
        </button>
        <div style="font-size:12px;color:var(--text3);text-align:center;margin-top:8px;">
          ${s.pending ? `Il reste ${s.pending} point(s) « À vérifier ».` : cl.validatedAt ? `Validée le ${fmtDate(cl.validatedAt)}${cl.validatedBy ? ` par ${esc(checklistShortName(cl.validatedBy))}` : ''}.` : 'Tous les points ont été vérifiés.'}
          ${s.criticalOpen ? `<br><span style="color:var(--accent);">⚠️ ${s.criticalOpen} point(s) critique(s) pas OK : ils bloqueront la signature du handover.</span>` : ''}
        </div>` : ''}
    </div>`;
}

function checklistShowComment(id) {
  const it = CLF.items.get(id);
  it._showComment = true;
  updateChecklistItemView(id);
  document.querySelector(`#clf-item-${id} textarea`)?.focus();
}

function checklistSetStatus(id, status) {
  const it = CLF?.items.get(id);
  if (!it || !checklistCanFill()) return;
  if (status === 'ok' && it.photoRequired && !(it.photos || []).length) {
    toast('📷 Photo obligatoire : prends d’abord une photo de ce point.', 'error');
    return;
  }
  it._status = status;
  if (CHECKLIST_COMMENT_REQUIRED.includes(status)) it._showComment = true;
  updateChecklistItemView(id);
  if (CHECKLIST_COMMENT_REQUIRED.includes(status) && !it._comment.trim()) {
    document.querySelector(`#clf-item-${id} textarea`)?.focus();
    return; // enregistré avec le commentaire
  }
  checklistSaveItem(id);
}

function checklistCommentInput(id, value) {
  const it = CLF?.items.get(id);
  if (!it) return;
  it._comment = value;
  clearTimeout(CLF.timers[id]);
  CLF.timers[id] = setTimeout(() => checklistSaveItem(id), 1500);
  // ne réécrit pas le champ pendant la frappe, seulement l'aide « obligatoire »
  const hint = document.querySelector(`#clf-item-${id} [data-role="comment-hint"]`);
  if (hint && value.trim()) hint.textContent = '';
}

function checklistCommentBlur(id) {
  if (!CLF?.timers[id]) return;
  clearTimeout(CLF.timers[id]);
  delete CLF.timers[id];
  checklistSaveItem(id);
}

async function checklistSaveItem(id) {
  const it = CLF?.items.get(id);
  if (!it) return;
  clearTimeout(CLF.timers[id]);
  delete CLF.timers[id];
  if (it._saving) { it._resave = true; return; }
  const status = it._status;
  const comment = it._comment.trim();
  if (CHECKLIST_COMMENT_REQUIRED.includes(status) && !comment) { updateChecklistItemView(id); return; }
  if (status === it.status && comment === (it.comment || '') && !it._error) { updateChecklistItemView(id); return; }

  it._saving = true;
  updateChecklistItemView(id);
  const r = await checklistRequest('PATCH', `/checklists/items/${id}`, { status, comment });
  if (!CLF || !CLF.items.has(id)) return;
  it._saving = false;
  if (r.ok) {
    const saved = r.data.data.item;
    const typedMeanwhile = it._comment.trim() !== comment;
    Object.assign(it, saved, { _error: false });
    if (!typedMeanwhile) it._comment = saved.comment || '';
    if (it._status === status) it._status = saved.status;
    if (saved.status === 'pending' && CLF.checklist.validatedAt) {
      CLF.checklist.validatedAt = null; // un point remis « À vérifier » annule la validation
      renderChecklistFullInfo();
    }
  } else if (r.status >= 400 && r.status < 500) {
    toast(r.data?.error || 'Refusé', 'error');
    it._status = it.status; // refus (règle métier) : on revient à l'état enregistré
    it._error = false;
  } else {
    it._error = true;
    toast('Non enregistré — réessayer', 'error');
  }
  updateChecklistItemView(id);
  updateChecklistFullSummary();
  if (it._resave) { it._resave = false; checklistSaveItem(id); }
}

async function saveChecklistFullField(field, value) {
  if (!CLF) return;
  const r = await checklistRequest('PATCH', `/checklists/${CLF.checklist.id}`, { [field]: value });
  if (r.ok) { CLF.checklist[field] = r.data.data[field]; toast('Enregistré ✅', 'success'); }
  else toast(r.data?.error || 'Non enregistré — réessayer', 'error');
}

function checklistDictate(id) {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Dictée non supportée sur ce navigateur', 'error'); return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = false;
  toast('🎙️ Dictez le commentaire...', 'info');
  rec.onresult = e => {
    const it = CLF?.items.get(id);
    if (!it) return;
    const text = e.results[0][0].transcript;
    it._comment = (it._comment.trim() ? it._comment.trim() + ' ' : '') + text;
    it._showComment = true;
    const ta = document.querySelector(`#clf-item-${id} textarea`);
    if (ta) ta.value = it._comment;
    checklistSaveItem(id);
    toast('Commentaire ajouté', 'success');
  };
  rec.onerror = () => toast('Erreur dictée', 'error');
  rec.start();
}

/** Réduit une photo (2000 px max, JPEG) : envoi plus rapide sur chantier, et Cloudinary refuse plus de 10 Mo. */
async function checklistShrinkPhoto(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 2.5 * 1024 * 1024) { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob ? new File([blob], (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch (e) {
    return file; // format non lu par le navigateur (HEIC…) : envoyé tel quel
  }
}

async function checklistUploadPhotos(id, input) {
  const files = [...(input.files || [])];
  input.value = '';
  const it = CLF?.items.get(id);
  if (!files.length || !it) return;
  it._uploading = (it._uploading || 0) + files.length;
  updateChecklistItemView(id);
  for (const f of files) {
    const fd = new FormData();
    fd.append('file', await checklistShrinkPhoto(f));
    const r = await checklistRequest('POST', `/checklists/items/${id}/photos`, fd);
    if (!CLF || !CLF.items.has(id)) return;
    it._uploading--;
    if (r.ok) it.photos = [...(it.photos || []), r.data.data];
    else toast(r.data?.error || 'Photo non envoyée — réessaie', 'error');
    updateChecklistItemView(id);
  }
  updateChecklistFullSummary();
}

async function checklistDeletePhoto(itemId, photoId) {
  if (!confirm('Supprimer cette photo ?')) return;
  const r = await checklistRequest('DELETE', `/checklists/photos/${photoId}`);
  const it = CLF?.items.get(itemId);
  if (!it) return;
  if (r.ok) {
    it.photos = (it.photos || []).filter(p => p.id !== photoId);
    updateChecklistItemView(itemId);
    updateChecklistFullSummary();
  } else toast(r.data?.error || 'Suppression impossible — réessaie', 'error');
}

async function showChecklistItemHistory(id) {
  const it = CLF?.items.get(id);
  const res = await api('GET', `/checklists/items/${id}/logs`);
  if (!res?.success) { toast(res?.error || 'Historique indisponible', 'error'); return; }
  const lbl = s => s ? `${CHECKLIST_STATUS[s]?.icon || ''} ${CHECKLIST_STATUS[s]?.label || s}` : '—';
  const el = document.createElement('div'); el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head">
        <div>
          <div class="modal-title">🕘 Historique</div>
          <div style="font-size:12px;color:var(--text2);margin-top:3px;overflow-wrap:anywhere;">${esc(it?.label || '')}</div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      ${res.data.length ? res.data.map(l => `
        <div style="padding:10px 0;border-bottom:1px solid var(--border);">
          <div style="font-size:13px;font-weight:600;">${lbl(l.fromStatus)} → ${lbl(l.toStatus)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;">${fmtDateTime(l.createdAt)}${l.user ? ` · ${esc(`${l.user.firstName} ${l.user.lastName}`)}` : ''}</div>
          ${l.comment ? `<div style="font-size:12px;color:var(--text2);margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere;">« ${esc(l.comment)} »</div>` : ''}
        </div>`).join('') : '<div style="color:var(--text3);font-size:13px;">Aucun changement de statut.</div>'}
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

async function validateChecklistFull() {
  if (!CLF) return;
  const s = checklistFullStats();
  if (s.pending) return;
  const warn = s.criticalOpen ? `\n\n⚠️ ${s.criticalOpen} point(s) critique(s) ne sont pas OK.` : '';
  if (!confirm(`Valider la check-list ?${warn}`)) return;
  const r = await checklistRequest('POST', `/checklists/${CLF.checklist.id}/validate`);
  if (r.ok) {
    CLF.checklist.validatedAt = r.data.data.validatedAt;
    CLF.checklist.validatedBy = r.data.data.validatedBy;
    renderChecklistFullInfo();
    updateChecklistFullSummary();
    toast('Check-list validée ✅', 'success');
  } else toast(r.data?.error || 'Validation non enregistrée — réessaie', 'error');
}

// ═══════════════════════════════════════════════════════════
// ☑️ CHECK-LIST DANS LE HANDOVER — carte, fiche, lien de signature
// ═══════════════════════════════════════════════════════════

/** Ligne « ☑️ Check-list : 42/48 OK · … » sur la carte d'un handover (h.checklistSummary). */
function checklistHandoverLine(s) {
  if (!s) return '';
  const parts = [`<strong>${s.ok}/${s.total} OK</strong>`];
  if (s.na) parts.push(`${s.na} N.A.`);
  if (s.partial + s.nok) parts.push(`<span style="color:var(--amber);">${s.partial + s.nok} à reprendre</span>`);
  if (s.pending) parts.push(`${s.pending} à vérifier`);
  if (s.criticalOpen) parts.push(`<span style="color:var(--accent);font-weight:700;">⚠️ ${s.criticalOpen} critique(s) ouvert(s)</span>`);
  if (s.validatedAt) parts.push('<span style="color:var(--green);">✅ validée</span>');
  return `<div style="font-size:11px;color:var(--text2);margin-top:4px;">☑️ Check-list : ${parts.join(' · ')}</div>`;
}

/** Ferme les modales ouvertes (fiche handover…) puis ouvre le remplissage plein écran. */
function openChecklistFullFromHandover(projectId) {
  document.querySelectorAll('.overlay.open').forEach(o => o.remove());
  openChecklistFull(projectId, 'installation');
}

/** Section « Check-list de montage » de la fiche handover (lecture, par catégorie, photos en vignettes). */
async function loadHandoverChecklistSection(projectId, handoverId) {
  const el = document.getElementById(`hf-checklist-${handoverId}`);
  if (!el) return;
  const res = await api('GET', `/checklists/project/${projectId}?phase=installation`);
  if (!res?.success) { el.innerHTML = ''; return; }
  const cl = res.data;
  const title = '<div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;">☑️ Check-list de montage</div>';
  if (!cl) {
    el.innerHTML = checklistCanEdit() ? `
      <div style="border-top:1px solid var(--border);padding-top:14px;margin:4px 0 14px;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        ${title}<span style="font-size:12px;color:var(--text3);">Pas encore configurée (onglet Handover du projet)</span>
      </div>` : '';
    return;
  }
  const groups = [];
  for (const it of cl.items) {
    if (!groups.length || groups[groups.length - 1].name !== it.categoryName) groups.push({ name: it.categoryName, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  el.innerHTML = `
    <div style="border-top:1px solid var(--border);padding-top:14px;margin:4px 0 14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
        ${title}
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
          <span class="badge badge-muted">Viewbox ${CHECKLIST_VIEWBOX_LABELS[cl.viewboxType] || cl.viewboxType}</span>
          ${cl.validatedAt ? `<span class="badge badge-green">✅ Validée le ${fmtDate(cl.validatedAt)}</span>` : ''}
          ${checklistCanFill() ? `<button class="btn btn-ghost btn-xs" onclick="openChecklistFullFromHandover('${projectId}')">✍️ Remplir</button>` : ''}
        </div>
      </div>
      ${cl.boxesChecked ? `<div style="font-size:12px;color:var(--text2);margin-top:6px;">Boxes contrôlées : <strong>${esc(cl.boxesChecked)}</strong></div>` : ''}
      ${checklistStatsHtml(cl.stats)}
      <details style="margin-top:10px;">
        <summary style="cursor:pointer;font-size:13px;color:var(--blue);padding:6px 0;">Voir le détail des ${cl.stats.total} points</summary>
        ${groups.map(g => `
          <div style="font-size:12px;font-weight:700;color:var(--text2);margin:12px 0 6px;overflow-wrap:anywhere;">${esc(g.name)}</div>
          ${g.items.map(it => {
            const st = CHECKLIST_STATUS[it.status] || CHECKLIST_STATUS.pending;
            return `
            <div style="display:flex;gap:10px;align-items:flex-start;padding:8px 10px;background:var(--bg3);border-left:3px solid ${st.color};border-radius:8px;margin-bottom:6px;">
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;overflow-wrap:anywhere;">${esc(it.label)}${it.critical ? ' <span class="badge badge-red" style="font-size:10px;">⚠️ critique</span>' : ''}</div>
                ${it.comment ? `<div style="font-size:12px;color:var(--text2);margin-top:3px;white-space:pre-wrap;overflow-wrap:anywhere;">${esc(it.comment)}</div>` : ''}
                ${it.checkedBy && it.status !== 'pending' ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">Vérifié par ${esc(checklistShortName(it.checkedBy))} — ${fmtDateTime(it.checkedAt)}</div>` : ''}
                ${(it.photos || []).length ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px;">${it.photos.map(ph => `<img src="${esc(ph.photoUrl)}" loading="lazy" onclick="openPhotoViewer('${esc(ph.photoUrl)}', 'photo.jpg')" style="width:52px;height:52px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--border);">`).join('')}</div>` : ''}
              </div>
              <span class="badge" style="background:${st.bg};color:${st.color};flex-shrink:0;">${st.icon} ${st.label}</span>
            </div>`;
          }).join('')}`).join('')}
      </details>
    </div>`;
}

/** Avertissement avant le lien de signature : check-list avec points critiques ouverts ou « À vérifier ». */
function showChecklistSignatureWarning(handoverId, info) {
  const s = info.checklist || {};
  const el = document.createElement('div'); el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-head"><div class="modal-title">⚠️ Check-list de montage incomplète</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
        ${s.criticalOpen ? `<div style="background:rgba(230,57,70,.1);border:1px solid rgba(230,57,70,.35);border-radius:8px;padding:10px 12px;font-size:14px;color:var(--accent2);font-weight:700;">${s.criticalOpen} point(s) critique(s) non validé(s)</div>` : ''}
        ${s.pending ? `<div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:14px;">⏳ ${s.pending} point(s) encore « À vérifier »</div>` : ''}
      </div>
      <div style="font-size:13px;color:var(--text2);line-height:1.6;">
        ${info.canForce
          ? 'Le client verra la check-list telle qu’elle est sur la page de signature et dans le PDF. Continuer quand même ?'
          : 'Complète la check-list avant de faire signer le client. Seul un admin ou un technical manager peut générer le lien quand même.'}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        ${info.projectId ? `<button class="btn btn-ghost btn-sm" onclick="openChecklistFullFromHandover('${info.projectId}')">☑️ Ouvrir la check-list</button>` : ''}
        ${info.canForce ? `<button class="btn btn-primary" onclick="this.closest('.overlay').remove();generateSignatureLink('${handoverId}', true)">Générer quand même</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(el);
}
