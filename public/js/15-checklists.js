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
