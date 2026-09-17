function showAddFileByUrlModal(projectId) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-head">
        <div><div class="modal-title">🔗 Ajouter un fichier via URL</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px;">Pour les gros fichiers (> 10 Mo) hébergés ailleurs</div></div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <div style="background:rgba(72,149,239,.08);border-left:3px solid var(--blue);border-radius:6px;padding:10px 14px;font-size:12px;color:var(--text2);margin-bottom:14px;line-height:1.6;">
        <strong>💡 Comment obtenir une URL pour un gros fichier 3D ?</strong><br>
        <strong>Méthode recommandée — GitHub Releases</strong> (gratuit, illimité, jusqu'à 2 Go par fichier) :
        <ol style="margin:6px 0 0 18px;padding:0;">
          <li>Sur GitHub, crée un repo (peut être privé)</li>
          <li>Onglet <em>Releases</em> → <em>Draft a new release</em></li>
          <li>Drag-and-drop ton .glb dans la zone "Attach binaries"</li>
          <li>Publie la release → clic droit sur le fichier → <em>Copier l'adresse du lien</em></li>
          <li>Colle l'URL ci-dessous</li>
        </ol>
      </div>

      <div class="form-group2">
        <label class="form-label2">Nom du fichier *</label>
        <input class="input" id="add-url-name" placeholder="ex: HOKA_2026_July.glb">
      </div>
      <div class="form-group2">
        <label class="form-label2">URL du fichier *</label>
        <input class="input" id="add-url-url" placeholder="https://github.com/user/repo/releases/download/v1/model.glb">
        <div style="font-size:11px;color:var(--text3);margin-top:4px;">L'URL doit pointer directement vers le fichier (pas une page web).</div>
      </div>
      <div class="form-group2">
        <label class="form-label2">Taille approx. (Mo) — optionnel</label>
        <input class="input" type="number" id="add-url-size" placeholder="16" min="0" step="0.1">
      </div>

      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="saveFileByUrl('${projectId}', this.closest('.overlay'))">💾 Ajouter au projet</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function saveFileByUrl(projectId, overlay) {
  const fileName = document.getElementById('add-url-name')?.value.trim();
  const fileUrl  = document.getElementById('add-url-url')?.value.trim();
  const sizeMo   = parseFloat(document.getElementById('add-url-size')?.value);

  if (!fileName) { toast('Nom du fichier requis', 'error'); return; }
  if (!fileUrl)  { toast('URL requise', 'error'); return; }
  if (!/^https?:\/\//.test(fileUrl)) { toast('L\'URL doit commencer par http:// ou https://', 'error'); return; }

  // Déduire le fileType de l'extension du nom
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap = {
    glb:'model/gltf-binary', gltf:'model/gltf+json', stl:'model/stl', obj:'model/obj',
    ifc:'application/x-step',
    pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png',
  };
  const fileType = mimeMap[ext] || 'application/octet-stream';
  const fileSize = (!isNaN(sizeMo) && sizeMo > 0) ? Math.round(sizeMo * 1024 * 1024) : null;

  const body = {
    fileName,
    fileUrl,
    fileType,
    fileSize,
    publicId: null,           // pas de Cloudinary public_id pour un fichier externe
    category: 'project',
  };

  const res = await api('POST', `/projects/${projectId}/files`, body);
  if (res?.success) {
    toast(`Fichier "${fileName}" ajouté ✅`, 'success');
    overlay?.remove();
    loadProjectDetail(projectId);
  } else {
    toast('Erreur : ' + (res?.error || 'inconnue'), 'error');
  }
}

async function uploadProjectFiles(projectId, input) {
  if (!input.files?.length) return;
  const files = Array.from(input.files);
  toast(`Upload ${files.length} fichier(s)...`, 'info');
  let uploaded = 0;

  for (const file of files) {
    try {
      // New FormData for each attempt
      const fd = new FormData();
      fd.append('file', file);

      // Use /upload/photo — the only route that exists
      const r = await fetch(`${API}/upload/photo`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${TOKEN}` },
        body: fd
      });

      if (!r.ok) {
        const errText = await r.text().catch(()=>'');
        console.error('Upload failed:', r.status, errText);
        toast(`Erreur upload ${file.name}: ${r.status}`, 'error');
        continue;
      }

      const data = await r.json();
      const url = data.data?.url || data.url || data.secure_url;

      if (!url) {
        console.error('No URL in response:', data);
        toast(`Pas d'URL retournée pour ${file.name}`, 'error');
        continue;
      }

      // Save reference in DB
      await api('POST', `/projects/${projectId}/files`, {
        fileName: file.name,
        fileUrl: url,
        fileType: file.type || file.name.split('.').pop(),
        fileSize: file.size,
        publicId: data.data?.public_id || data.public_id || null,
        category: 'project'
      });

      uploaded++;
    } catch(e) {
      console.error('Upload error:', e);
      toast(`Erreur réseau pour ${file.name}`, 'error');
    }
  }

  if (uploaded > 0) toast(`${uploaded} fichier(s) uploadé(s) ✅`, 'success');
  loadDetailFiles(projectId);
}

async function deleteProjectFile(fileId, projectId) {
  if (!confirm('Supprimer ce fichier ?')) return;
  const res = await api('DELETE', `/projects/${projectId}/files/${fileId}`);
  if (res?.success) { toast('Fichier supprimé','success'); loadDetailFiles(projectId); }
  else toast('Erreur suppression','error');
}

function togglePfSelectAll(master) {
  document.querySelectorAll('.pf-cb').forEach(cb => { cb.checked = master.checked; });
  updatePfSelCount();
}

function updatePfSelCount() {
  const total = document.querySelectorAll('.pf-cb').length;
  const n = document.querySelectorAll('.pf-cb:checked').length;
  const c = document.getElementById('pf-sel-count');
  if (c) c.textContent = n ? `${n} sélectionné(s)` : '';
  const master = document.getElementById('pf-select-all');
  if (master) {
    master.checked = total > 0 && n === total;
    master.indeterminate = n > 0 && n < total;
  }
}

async function bulkDeleteProjectFiles(projectId) {
  const ids = Array.from(document.querySelectorAll('.pf-cb:checked')).map(cb => cb.value);
  if (!ids.length) { toast('Aucun fichier sélectionné', 'error'); return; }
  if (!confirm(`Supprimer ${ids.length} fichier(s) ?`)) return;
  toast(`Suppression de ${ids.length} fichier(s)...`, 'info');
  let ok = 0;
  for (const id of ids) {
    const res = await api('DELETE', `/projects/${projectId}/files/${id}`);
    if (res?.success) ok++;
  }
  toast(`${ok} fichier(s) supprimé(s) ✅`, 'success');
  loadDetailFiles(projectId);
}

// ═══════════════════════════════════════════════════════
// SOUS-ÉQUIPES & GESTION MEMBRES
// ═══════════════════════════════════════════════════════

// Local storage for team groups (until backend ready)
let TEAM_GROUPS = JSON.parse(localStorage.getItem('vem_team_groups') || '[]');
// [{id, name, color, leaderId}]

function saveTeamGroups() {
  localStorage.setItem('vem_team_groups', JSON.stringify(TEAM_GROUPS));
}

function toggleTeamGroup(role) {
  const row = document.getElementById('team-group-row');
  if (!row) return;
  const showGroup = ['installer','worker'].includes(role);
  row.style.display = showGroup ? 'block' : 'none';
  if (showGroup) loadTeamGroupSelect();
}

function loadTeamGroupSelect() {
  const sel = document.getElementById('user-team-group');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Aucune sous-équipe —</option>' +
    TEAM_GROUPS.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
}

function createTeamGroup() {
  const name = prompt('Nom de la sous-equipe ? ex: Equipe Ruslan');
  if (!name?.trim()) return;
  const colors = ['#e63946','#4895ef','#2dc653','#f4a261','#8b5cf6','#ec4899'];
  const group = {
    id: 'tg_' + Date.now(),
    name: name.trim(),
    color: colors[TEAM_GROUPS.length % colors.length]
  };
  TEAM_GROUPS.push(group);
  saveTeamGroups();
  loadTeamGroupSelect();
  document.getElementById('user-team-group').value = group.id;
  toast(`Sous-équipe "${name}" créée ✅`, 'success');
}

// ── OCR Carte d'identité via Claude IA ──
async function scanIDCard(input) {
  if (!input.files?.length) return;
  const file = input.files[0];

  // Preview
  const preview = document.getElementById('id-card-preview');
  const img = document.getElementById('id-card-img');
  const status = document.getElementById('ocr-status');
  if (preview && img) {
    img.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  }
  if (status) status.innerHTML = '⏳ Analyse en cours...';

  // Lecture + redimensionnement automatique (max 1500px) pour respecter
  // la limite Anthropic de 5 Mo en base64. Une carte d'identité de 8 Mo
  // devient ~300 Ko après resize, ce qui passe sans problème.
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const tmpImg = new Image();
      tmpImg.onload = () => {
        const MAX = 1500;
        let { width: w, height: h } = tmpImg;
        if (w > MAX || h > MAX) {
          const ratio = Math.min(MAX / w, MAX / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(tmpImg, 0, 0, w, h);
        // JPEG qualité 0.85 — bon compromis netteté/poids pour la lecture OCR
        const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(jpegDataUrl.split(',')[1]);
      };
      tmpImg.onerror = () => reject(new Error('Image illisible'));
      tmpImg.src = dataUrl;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  try {
    const res = await api('POST', '/ai/scan-id', {
      imageBase64: base64,
      mediaType: 'image/jpeg',  // toujours JPEG après le canvas
    });

    if (!res || !res.success) {
      if (status) status.innerHTML = `❌ ${res?.error || 'Erreur connexion IA'} — remplissez manuellement`;
      return;
    }

    const parsed = res.data || {};
    // Fill form fields
    if (parsed.firstName) document.getElementById('user-fname').value = parsed.firstName;
    if (parsed.lastName)  document.getElementById('user-lname').value = parsed.lastName;
    if (parsed.birthDate) document.getElementById('user-birthdate').value = parsed.birthDate;
    if (parsed.birthPlace) document.getElementById('user-birthplace').value = parsed.birthPlace;
    if (parsed.nationality) document.getElementById('user-nationality').value = parsed.nationality;
    if (parsed.idNumber) document.getElementById('user-id-number').value = parsed.idNumber;
    if (parsed.nationalNumber) document.getElementById('user-national-nr').value = parsed.nationalNumber;
    if (parsed.expiryDate) document.getElementById('user-id-expiry').value = parsed.expiryDate;

    const filled = Object.values(parsed).filter(v => v).length;
    if (status) status.innerHTML = `✅ ${filled} champ(s) rempli(s) automatiquement`;
    toast('Carte scannée ✅', 'success');

  } catch (err) {
    console.error('OCR error:', err);
    if (status) status.innerHTML = '❌ Erreur connexion IA — remplissez manuellement';
  }
}

// ── Preview photo de profil ──
function previewProfilePhoto(input) {
  if (!input.files?.length) return;
  const url = URL.createObjectURL(input.files[0]);
  const preview = document.getElementById('profile-photo-preview');
  const placeholder = document.getElementById('profile-photo-placeholder');
  if (preview) { preview.src = url; preview.style.display = 'block'; }
  if (placeholder) placeholder.style.display = 'none';
}

// ── Render team with subgroups ──
async function loadTeam() {
  const res = await api('GET', '/users');
  if (!res?.success) return;
  USERS = res.data;

  const sub = document.getElementById('team-sub');
  if (sub) sub.textContent = USERS.filter(u=>u.isActive).length + ' membres actifs';

  const grouped = {};
  USERS.forEach(u => {
    const role = u.role || 'worker';
    if (!grouped[role]) grouped[role] = [];
    grouped[role].push(u);
  });

  const container = document.getElementById('team-groups-container');
  if (!container) return;

  let html = '';

  TEAM_CATEGORIES.forEach(cat => {
    const members = grouped[cat.key] || [];
    if (!members.length) return;

    // For installer/worker — show subgroups
    if (['installer','worker'].includes(cat.key) && TEAM_GROUPS.length) {
      html += `
        <div style="margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;padding-bottom:8px;border-bottom:2px solid ${cat.color}22;">
            <span style="font-size:18px;">${cat.icon}</span>
            <span style="font-size:14px;font-weight:700;color:${cat.color};">${cat.label}</span>
            <span style="font-size:11px;color:var(--text3);background:var(--bg3);padding:2px 8px;border-radius:99px;">${members.length}</span>
            <button class="btn btn-ghost btn-xs" style="margin-left:auto;" onclick="createTeamGroup()">+ Sous-équipe</button>
          </div>`;

      // Members without group
      const noGroup = members.filter(u => !u.teamGroupId);
      const withGroup = {};
      members.filter(u => u.teamGroupId).forEach(u => {
        if (!withGroup[u.teamGroupId]) withGroup[u.teamGroupId] = [];
        withGroup[u.teamGroupId].push(u);
      });

      // Render subgroups
      TEAM_GROUPS.forEach(grp => {
        const grpMembers = withGroup[grp.id] || [];
        if (!grpMembers.length && !members.some(u => u.teamGroupId === grp.id)) return;
        html += `
          <div style="margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:${grp.color}15;border-left:3px solid ${grp.color};border-radius:0 8px 8px 0;margin-bottom:8px;">
              <span style="font-size:13px;font-weight:700;color:${grp.color};">👷 ${grp.name}</span>
              <span style="font-size:11px;color:var(--text3);">${grpMembers.length} membres</span>
              <button class="btn btn-ghost btn-xs" style="margin-left:auto;color:var(--accent);" onclick="deleteTeamGroup('${grp.id}')">🗑️</button>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;padding-left:12px;">
              ${grpMembers.map(u => renderMemberCard(u, grp.color)).join('')}
            </div>
          </div>`;
      });

      // Members without group
      if (noGroup.length) {
        html += `
          <div style="margin-bottom:8px;">
            <div style="font-size:11px;color:var(--text3);margin-bottom:8px;">Sans sous-équipe</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;">
              ${noGroup.map(u => renderMemberCard(u, cat.color)).join('')}
            </div>
          </div>`;
      }
      html += '</div>';

    } else {
      html += `
        <div style="margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:2px solid ${cat.color}22;">
            <span style="font-size:18px;">${cat.icon}</span>
            <span style="font-size:14px;font-weight:700;color:${cat.color};">${cat.label}</span>
            <span style="font-size:11px;color:var(--text3);background:var(--bg3);padding:2px 8px;border-radius:99px;">${members.length}</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;">
            ${members.map(u => renderMemberCard(u, cat.color)).join('')}
          </div>
        </div>`;
    }
  });

  container.innerHTML = html || '<div class="empty"><div class="empty-icon">👥</div><div class="empty-title">Aucun membre</div></div>';
}

function renderMemberCard(u, color) {
  const initials = (u.firstName?.[0]||'?') + (u.lastName?.[0]||'');
  return `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:12px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:all .15s;"
      onmouseover="this.style.borderColor='${color}'" onmouseout="this.style.borderColor='var(--border)'"
      onclick="openUserDetail('${u.id}')">
      ${u.avatarUrl
        ? `<img src="${u.avatarUrl}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid ${color};">`
        : `<div style="width:40px;height:40px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;flex-shrink:0;">${initials}</div>`}
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">${u.firstName} ${u.lastName}</div>
        <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${u.email}</div>
        ${u.phone ? `<div style="font-size:11px;color:var(--blue);"><a href="tel:${u.phone}" style="color:inherit;" onclick="event.stopPropagation()">📞 ${u.phone}</a></div>` : ''}
        ${u.nationality ? `<div style="font-size:10px;color:var(--text3);">🌍 ${u.nationality}</div>` : ''}
      </div>
      <div style="width:8px;height:8px;border-radius:50%;background:${u.isActive?'#2dc653':'#6b7280'};flex-shrink:0;" title="${u.isActive?'Actif':'Inactif'}"></div>
    </div>`;
}

function deleteTeamGroup(groupId) {
  if (!confirm('Supprimer cette sous-équipe ? Les membres ne seront pas supprimés.')) return;
  TEAM_GROUPS = TEAM_GROUPS.filter(g => g.id !== groupId);
  saveTeamGroups();
  loadTeam();
  toast('Sous-équipe supprimée', 'success');
}

// ── Open user detail with full info ──
async function openUserDetail(userId) {
  const u = USERS.find(x => x.id === userId);
  if (!u) return;
  const cat = TEAM_CATEGORIES.find(c => c.key === u.role) || { label: u.role, color: '#4895ef', icon: '👤' };
  const grp = TEAM_GROUPS.find(g => g.id === u.teamGroupId);
  const initials = (u.firstName?.[0]||'?') + (u.lastName?.[0]||'');
  const esc = s => (s ?? '').toString().replace(/"/g,'&quot;');

  // Options pour le select des rôles (basées sur TEAM_CATEGORIES)
  const roleOptions = TEAM_CATEGORIES.map(c =>
    `<option value="${c.key}" ${c.key===u.role?'selected':''}>${c.icon} ${c.label}</option>`
  ).join('');

  // Options pour le select des groupes d'équipe
  const groupOptions = '<option value="">— Aucune —</option>' +
    TEAM_GROUPS.map(g => `<option value="${g.id}" ${g.id===u.teamGroupId?'selected':''}>${g.name}</option>`).join('');

  const overlay = document.createElement('div'); overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-head">
        <div style="display:flex;align-items:center;gap:12px;">
          ${u.avatarUrl
            ? `<img src="${u.avatarUrl}" style="width:52px;height:52px;border-radius:50%;object-fit:cover;border:2px solid ${cat.color};">`
            : `<div style="width:52px;height:52px;border-radius:50%;background:${cat.color};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;">${initials}</div>`}
          <div>
            <div class="modal-title" id="user-detail-title" style="margin:0;">${u.firstName} ${u.lastName}</div>
            <div style="font-size:12px;color:var(--text3);">${cat.icon} ${cat.label}${grp?` · 👷 ${grp.name}`:''}</div>
          </div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <!-- MODE AFFICHAGE -->
      <div id="user-detail-view" style="display:flex;flex-direction:column;gap:8px;">
        ${u.email?`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg3);border-radius:8px;"><span>📧</span><a href="mailto:${u.email}" style="color:var(--blue);font-size:13px;">${u.email}</a></div>`:''}
        ${u.phone?`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg3);border-radius:8px;"><span>📞</span><a href="tel:${u.phone}" style="color:var(--blue);font-size:13px;">${u.phone}</a></div>`:''}
        ${u.nationality?`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg3);border-radius:8px;"><span>🌍</span><span style="font-size:13px;">${u.nationality}</span></div>`:''}
        ${u.nationalNumber?`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg3);border-radius:8px;"><span>🪪</span><span style="font-size:13px;font-family:monospace;">${u.nationalNumber}</span></div>`:''}
        ${u.idNumber?`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg3);border-radius:8px;"><span>🆔</span><span style="font-size:13px;font-family:monospace;">${u.idNumber}${u.idExpiry?' · exp. '+u.idExpiry:''}</span></div>`:''}
        ${u.birthDate?`<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg3);border-radius:8px;"><span>🎂</span><span style="font-size:13px;">${u.birthDate}${u.birthPlace?' — '+u.birthPlace:''}</span></div>`:''}
        ${(!u.email && !u.phone && !u.nationality && !u.idNumber && !u.birthDate)
          ? '<div style="color:var(--text3);font-size:12px;text-align:center;padding:14px;">Aucune information renseignée — clique sur Modifier pour compléter la fiche.</div>'
          : ''}
      </div>

      <!-- MODE ÉDITION -->
      <div id="user-detail-edit" style="display:none;flex-direction:column;gap:10px;">
        <div style="display:flex;gap:8px;">
          <div class="form-group" style="flex:1;"><label class="form-label">Prénom</label><input class="input" id="edit-fname" value="${esc(u.firstName)}"></div>
          <div class="form-group" style="flex:1;"><label class="form-label">Nom</label><input class="input" id="edit-lname" value="${esc(u.lastName)}"></div>
        </div>
        <div class="form-group"><label class="form-label">Email</label><input class="input" id="edit-email" type="email" value="${esc(u.email)}"></div>
        <div class="form-group"><label class="form-label">Téléphone</label><input class="input" id="edit-phone" value="${esc(u.phone)}"></div>
        <div style="display:flex;gap:8px;">
          <div class="form-group" style="flex:1;"><label class="form-label">Rôle</label><select class="input" id="edit-role">${roleOptions}</select></div>
          <div class="form-group" style="flex:1;"><label class="form-label">Équipe</label><select class="input" id="edit-team-group">${groupOptions}</select></div>
        </div>
        <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🪪 Carte d'identité</div>
          <div style="display:flex;gap:8px;">
            <div class="form-group" style="flex:1;"><label class="form-label">Date de naissance</label><input class="input" id="edit-birthdate" value="${esc(u.birthDate)}" placeholder="YYYY-MM-DD"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">Lieu de naissance</label><input class="input" id="edit-birthplace" value="${esc(u.birthPlace)}"></div>
          </div>
          <div class="form-group"><label class="form-label">Nationalité</label><input class="input" id="edit-nationality" value="${esc(u.nationality)}"></div>
          <div style="display:flex;gap:8px;">
            <div class="form-group" style="flex:1;"><label class="form-label">N° de carte</label><input class="input" id="edit-id-number" value="${esc(u.idNumber)}"></div>
            <div class="form-group" style="flex:1;"><label class="form-label">Expiration</label><input class="input" id="edit-id-expiry" value="${esc(u.idExpiry)}" placeholder="YYYY-MM-DD"></div>
          </div>
          <div class="form-group"><label class="form-label">N° registre national</label><input class="input" id="edit-national-nr" value="${esc(u.nationalNumber)}"></div>
        </div>
      </div>

      <!-- BOUTONS -->
      <div id="user-detail-actions" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
        <button class="btn btn-outline" style="border-color:var(--blue);color:var(--blue);" onclick="sendUserInvite('${u.id}',this)">📧 Envoyer invitation</button>
        <button class="btn btn-primary" onclick="toggleUserEdit(true)">✏️ Modifier</button>
      </div>
      <div id="user-detail-actions-edit" style="display:none;gap:8px;justify-content:flex-end;margin-top:14px;">
        <button class="btn btn-outline" onclick="toggleUserEdit(false)">Annuler</button>
        <button class="btn btn-primary" onclick="saveUserEdit('${u.id}')">💾 Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}

function toggleUserEdit(editing) {
  document.getElementById('user-detail-view').style.display          = editing ? 'none' : 'flex';
  document.getElementById('user-detail-edit').style.display          = editing ? 'flex' : 'none';
  document.getElementById('user-detail-actions').style.display       = editing ? 'none' : 'flex';
  document.getElementById('user-detail-actions-edit').style.display  = editing ? 'flex' : 'none';
}

async function sendUserInvite(userId, btn) {
  const u = USERS.find(x => x.id === userId);
  if (u && !u.email) { toast('Ce membre n\'a pas d\'email', 'error'); return; }
  if (!confirm(`Envoyer un mot de passe temporaire (valable 5 min) à ${u ? u.email : 'ce membre'} ?`)) return;
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loader"></span> Envoi...'; }
  const res = await api('POST', `/users/${userId}/send-invite`);
  if (btn) { btn.disabled = false; btn.innerHTML = '📧 Envoyer invitation'; }
  if (res?.success) {
    toast(`Invitation envoyée à ${res.data.sentTo} ✅ (valable 5 min)`, 'success');
  } else {
    toast(res?.error || 'Erreur d\'envoi', 'error');
  }
}

async function saveUserEdit(userId) {
  const val = id => document.getElementById(id).value.trim();
  const payload = {
    firstName:      val('edit-fname'),
    lastName:       val('edit-lname'),
    email:          val('edit-email'),
    phone:          val('edit-phone')         || null,
    role:           document.getElementById('edit-role').value,
    teamGroupId:    document.getElementById('edit-team-group').value || null,
    birthDate:      val('edit-birthdate')     || null,
    birthPlace:     val('edit-birthplace')    || null,
    nationality:    val('edit-nationality')   || null,
    idNumber:       val('edit-id-number')     || null,
    idExpiry:       val('edit-id-expiry')     || null,
    nationalNumber: val('edit-national-nr')   || null,
  };
  if (!payload.firstName || !payload.lastName || !payload.email) { toast('Prénom, nom et email obligatoires', 'error'); return; }

  const res = await api('PATCH', '/users/' + userId, payload);
  if (res?.success) {
    toast('Fiche mise à jour ✅', 'success');
    document.querySelector('.overlay.open')?.remove();
    await loadTeam();
    await loadAll();
  } else {
    toast(res?.error || 'Erreur de mise à jour', 'error');
  }
}

// ── Init team group select on modal open ──
const _origShowModal2 = showModal;
// Already patched via _origShowModal — just ensure user modal loads groups
document.addEventListener('DOMContentLoaded', () => {
  // patch showModal once more for modal-user
  const origSM = window.showModal;
  window.showModal = function(id) {
    origSM(id);
    if (id === 'modal-user') {
      loadTeamGroupSelect();
      toggleTeamGroup(document.getElementById('user-role')?.value || 'installer');
    }
  };
});

// ═══════════════════════════════════════════════════════════
// SÉLECTEUR D'ÉQUIPE DANS LE MODAL PROJET
// ═══════════════════════════════════════════════════════════

function loadProjTeamSelector() {
  const el = document.getElementById('proj-team-selector');
  if (!el) return;
  if (!USERS.length) { el.innerHTML = `<div style="color:var(--text3);font-size:12px;text-align:center;padding:12px;">Aucun membre disponible</div>`; return; }

  const installers = USERS.filter(u => ['installer','worker','site_manager','technical_manager'].includes(u.role));
  const others = USERS.filter(u => ['sales_engineer','project_manager','engineer','admin'].includes(u.role));

  const renderMini = u => {
    const initials = (u.firstName?.[0]||'?')+(u.lastName?.[0]||'');
    const grp = TEAM_GROUPS.find(g => g.id === u.teamGroupId);
    return `
      <label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid transparent;transition:all .15s;"
        onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background=''">
        <input type="checkbox" class="proj-member-check" value="${u.id}"
          data-name="${u.firstName} ${u.lastName}" data-role="${u.role}"
          style="width:15px;height:15px;accent-color:var(--accent);flex-shrink:0;"
          onchange="updateProjTeamCount()">
        ${u.avatarUrl
          ? `<img src="${u.avatarUrl}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0;">`
          : `<div style="width:32px;height:32px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>`}
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;">${u.firstName} ${u.lastName}</div>
          <div style="font-size:10px;color:var(--text3);">${grp?'👷 '+grp.name:''} ${u.phone?'· 📞'+u.phone:''}</div>
        </div>
      </label>`;
  };

  let content = '';

  // Installer subgroups
  if (TEAM_GROUPS.length) {
    TEAM_GROUPS.forEach(grp => {
      const grpMembers = installers.filter(u => u.teamGroupId === grp.id);
      if (!grpMembers.length) return;
      content += `
        <div style="margin-bottom:10px;">
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${grp.color}18;border-left:3px solid ${grp.color};border-radius:0 6px 6px 0;margin-bottom:4px;cursor:pointer;"
            onclick="toggleProjTeamGroup('grp-${grp.id}',this)">
            <span style="font-size:13px;font-weight:700;color:${grp.color};">👷 ${grp.name}</span>
            <span style="font-size:10px;color:var(--text3);">${grpMembers.length} membres</span>
            <button class="btn btn-ghost btn-xs" style="margin-left:auto;font-size:10px;" onclick="event.stopPropagation();checkAllGroup('grp-${grp.id}',true)">✅ Tout</button>
            <span style="font-size:11px;color:var(--text3);">▼</span>
          </div>
          <div id="grp-${grp.id}" style="display:flex;flex-direction:column;gap:2px;padding-left:8px;">
            ${grpMembers.map(renderMini).join('')}
          </div>
        </div>`;
    });
  }

  // Installers without group
  const noGroup = installers.filter(u => !u.teamGroupId);
  if (noGroup.length) {
    content += `
      <div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;padding:4px 2px;margin-bottom:4px;">🔧 Installateurs sans équipe</div>
        ${noGroup.map(renderMini).join('')}
      </div>`;
  }

  // Other roles
  if (others.length) {
    content += `
      <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;padding:4px 2px;margin-bottom:4px;">📋 Management</div>
        ${others.map(renderMini).join('')}
      </div>`;
  }

  el.innerHTML = content || '<div style="color:var(--text3);font-size:12px;text-align:center;padding:12px;">Aucun membre</div>';
  updateProjTeamCount();
}

function toggleProjTeamGroup(groupId, header) {
  const el = document.getElementById(groupId);
  if (!el) return;
  const hidden = el.style.display === 'none';
  el.style.display = hidden ? 'flex' : 'none';
  const arrow = header.querySelector('span:last-child');
  if (arrow) arrow.textContent = hidden ? '▼' : '▶';
}

function checkAllGroup(groupId, checked) {
  document.querySelectorAll(`#${groupId} .proj-member-check`).forEach(cb => cb.checked = checked);
  updateProjTeamCount();
}

function updateProjTeamCount() {
  const count = document.querySelectorAll('.proj-member-check:checked').length;
  const el = document.getElementById('proj-team-count');
  if (el) el.textContent = count > 0 ? `${count} membre(s) sélectionné(s)` : '0 membre sélectionné';
}

function getSelectedProjMembers() {
  return Array.from(document.querySelectorAll('.proj-member-check:checked')).map(cb => ({
    userId: cb.value,
    role: cb.dataset.role || 'worker',
    name: cb.dataset.name,
  }));
}

async function updatePointStatus(remarkId, projectId, newStatus) {
  const res = await api('PATCH', `/client-remarks/${remarkId}`, {
    status: newStatus,
    resolvedAt: newStatus === 'resolved' ? new Date().toISOString() : undefined,
  });
  if (res?.success) {
    const labels = {resolved:'Résolu ✅', urgent:'⚡ Urgent', archived:'Archivé 📦', open:'Rouvert'};
    toast(labels[newStatus] || 'Mis à jour', 'success');
    loadDetailRemarks(projectId);
  } else toast('Erreur mise à jour', 'error');
}

// ── Editeur des champs handover (template SPANTECH) ──
async function editHandoverFields(handoverId, projectId) {
  const res = await api('GET', `/handover/${handoverId}`);
  if (!res?.success) { toast('Handover introuvable','error'); return; }
  const h    = res.data;
  const proj = h.project || PROJECTS?.find(p => p.id === (projectId || h.projectId)) || {};
  const f    = h.customFields || {};
  const fv   = (key, fallback='') => f[key] !== undefined ? f[key] : (fallback || '');
  const fmtISO = d => d ? new Date(d).toISOString().split('T')[0] : '';

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;">
      <div class="modal-head" style="flex-shrink:0;">
        <div>
          <div class="modal-title">📝 Handover Certificate — Champs</div>
          <div style="font-size:12px;color:var(--text2);">Prérempli depuis le projet — modifiez si besoin</div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <div style="flex:1;overflow-y:auto;padding:0 2px 8px;">

        <!-- Page 1 -->
        <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;margin-bottom:10px;">📄 Page 1 — Infos projet</div>

          <div class="form-group2">
            <label class="form-label2">PROJECT (nom affiché)</label>
            <input class="input" id="hf-projectName" value="${fv('projectName', proj.name||'')}">
          </div>
          <div class="input-row">
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Date de réception</label>
              <input class="input" type="date" id="hf-handoverDate" value="${fv('handoverDate', fmtISO(h.createdAt))}">
            </div>
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Client</label>
              <input class="input" id="hf-clientName" value="${fv('clientName', h.clientName||proj.client?.name||'')}">
            </div>
          </div>
          <div class="form-group2">
            <label class="form-label2">Site address (séparée par virgules)</label>
            <input class="input" id="hf-siteAddress" value="${fv('siteAddress', proj.address||'')}">
          </div>
          <div class="form-group2">
            <label class="form-label2">📋 Étendue des travaux (Scope of work)</label>
            <textarea class="input" id="hf-scope" rows="3" placeholder="Description de l'installation, équipement fourni, services réalisés...&#10;(Laisser vide pour utiliser la description automatique)">${h.scopeOfWork || ''}</textarea>
          </div>
        </div>

        <!-- Page 2 -->
        <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
          <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;margin-bottom:10px;">✍️ Page 2 — Signatures</div>

          <div class="form-group2">
            <label class="form-label2">Comments / Reservations</label>
            <textarea clasid="hf-comments" rows="3"></textarea>
          </div>

          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin:10px 0 8px;">CLIENT</div>
          <div class="input-row">
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Title</label>
              <input class="input" id="hf-clientTitle" value="${fv('clientTitle','')}">
            </div>
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Name</label>
              <input class="input" id="hf-clientRep" value="${fv('clientRep', h.clientName||'')}">
            </div>
          </div>

          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin:10px 0 8px;">SPANTECH INTERNATIONAL SA</div>
          <div class="input-row">
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Title</label>
              <input class="input" id="hf-spantechTitle" value="${fv('spantechTitle','Site Manager')}">
            </div>
            <div class="form-group2" style="margin:0;">
              <label class="form-label2">Name</label>
              <input class="input" id="hf-spantechRep" value="${fv('spantechRep', h.siteManager?(h.siteManager.firstName+' '+h.siteManager.lastName):(CURRENT_USER?.firstName+' '+CURRENT_USER?.lastName)||'')}">
            </div>
          </div>
        </div>

        <!-- Zones d'inspection -->
        ${(h.items||[]).length ? `
        <div style="background:var(--bg3);border-radius:10px;padding:14px;">
          <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;margin-bottom:10px;">🔍 Points d'inspection (${h.items.length})</div>
          ${h.items.map(item => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;padding:8px 10px;background:var(--bg2);border-radius:8px;">
              <select style="padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;width:130px;flex-shrink:0;"
                onchange="updateHandoverItemStatus('${item.id}','${handoverId}',this.value)">
                <option value="ok" ${item.status==='ok'?'selected':''}>✅ OK</option>
                <option value="remark" ${item.status==='remark'?'selected':''}>⚠️ Remarque</option>
                <option value="defect" ${item.status==='defect'?'selected':''}>❌ Défaut</option>
                <option value="pending" ${item.status==='pending'?'selected':''}>⏳ En attente</option>
              </select>
              <span style="flex:1;font-size:13px;font-weight:600;">${item.zoneName}</span>
              <input style="flex:1;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"
                placeholder="Commentaire..." value="${item.comment||''}"
                onchange="updateHandoverItemComment('${item.id}','${handoverId}',this.value)">
            </div>`).join('')}
        </div>` : ''}

      </div>

      <div style="flex-shrink:0;border-top:1px solid var(--border);padding-top:12px;margin-top:4px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
<button class="btn btn-ghost btn-sm" onclick="saveHandoverFields('${handoverId}','${projectId||h.projectId}',null).then(()=>downloadHandoverPdf('${handoverId}'))">💾 Sauv. & PDF</button>
        <button class="btn btn-primary" onclick="saveHandoverFields('${handoverId}','${projectId||h.projectId}',this.closest('.overlay'))">💾 Sauvegarder</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // Populate comments textarea safely
  const commentsTA = document.getElementById('hf-comments-area');
  if (commentsTA) {
    const existingComments = f['comments'] !== undefined ? f['comments'] : 
      (h.items||[]).filter(i=>i.status!=='ok').map(i=>'• '+i.zoneName+(i.comment?' — '+i.comment:'')).join('\n');
    commentsTA.value = existingComments;
  }
  overlay.addEventListener('click', e => { if(e.target === overlay) overlay.remove(); });
}

async function updateHandoverItemStatus(itemId, handoverId, status) {
  await api('PATCH', `/handover/${handoverId}/items/${itemId}`, { status });
}

async function updateHandoverItemComment(itemId, handoverId, comment) {
  await api('PATCH', `/handover/${handoverId}/items/${itemId}`, { comment });
}

async function saveHandoverFields(handoverId, projectId, overlay) {
  const fields = {};
  ['projectName','projectLocation','clientName','contractor','startDate','completionDate','projectSummary',
   'clientContactName','clientContactPosition','clientContactEmail','clientContactPhone',
   'spantechContactName','spantechContactPosition','spantechContactEmail','spantechContactPhone',
   'handoverDate','attendees','clientRepName','clientFunction','spantechRepName','spantechFunction',
   'scope', 'siteAddress', 'scopeOfWork', 'clientTitle', 'clientRep', 'spantechTitle', 'spantechRep', 'comments'
  ].forEach(k => {
    const el = document.getElementById('hf-'+k);
    if (el) fields[k] = el.value;
  });

  const res = await api('PATCH', `/handover/${handoverId}`, {
    customFields: fields,
    clientName: fields.clientName || undefined,
    clientEmail: fields.clientContactEmail || undefined,
    generalNotes: document.getElementById('hf-projectSummary')?.value || undefined,
    scopeOfWork: document.getElementById('hf-scope')?.value || null,
  });
  if (res?.success) {
    toast('Handover mis à jour ✅','success');
    overlay?.remove();
    loadDetailHandovers(projectId);
  } else toast('Erreur sauvegarde','error');
}

// ── Lien de signature client (sans compte) ──
async function generateSignatureLink(handoverId) {
  // 1. Demande un nouveau token au backend (invalide tout token précédent)
  toast('Génération du lien...', 'info');
  const tokenRes = await api('POST', `/handover/${handoverId}/signature-token`);
  if (!tokenRes?.success) { toast('Erreur génération du lien', 'error'); return; }
  const token = tokenRes.data.token;

  // 2. Construit le lien complet vers la page publique
  const baseUrl = window.location.origin;
  const link = `${baseUrl}/sign-handover.html?token=${token}`;

  // 3. Modal d'affichage du lien
  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head">
        <div class="modal-title">🔗 Lien de Signature Client</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="background:rgba(45,198,83,.1);border:1px solid rgba(45,198,83,.3);border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:var(--green);">
        ✅ Nouveau lien généré (les liens précédents pour ce handover sont désactivés)
      </div>
      <div style="background:var(--bg3);border-radius:10px;padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;color:var(--text3);margin-bottom:8px;">Envoyez ce lien au client :</div>
        <div style="display:flex;gap:8px;">
          <input class="input" value="${link}" id="sig-link-input" readonly style="flex:1;font-size:11px;">
          <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('sig-link-input').value);toast('Lien copié ✅','success')">📋 Copier</button>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text3);line-height:1.7;">
        🔒 <strong>Lien à usage unique</strong> — expire après la première signature<br>
        📱 Le client peut signer depuis son téléphone ou ordinateur<br>
        ✉️ Vous recevrez le PDF signé par email automatiquement<br>
        ⚠️ Si vous regénérez un lien, l'ancien sera invalidé
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
        <button class="btn btn-primary" onclick="window.open('mailto:?subject=Signature du handover&body=Bonjour,%0A%0AVeuillez signer le document via ce lien :%0A${encodeURIComponent(link)}%0A%0ACordialement,%0AL%27équipe VIEWBOX')">📧 Envoyer par email</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
// ═══════════════════════════════════════════
// CAMIONS DANS CRÉATION PROJET
// ═══════════════════════════════════════════
let PROJ_TRUCKS = [];

function addProjTruck() {
  const id = Date.now();
  PROJ_TRUCKS.push({
    id,
    vehicleType: 'truck',
    truckNumber: '',
    licensePlate: '',
    driverName: '',
    driverPhone: '',
    loadingDate: '',   // datetime-local
    arrivalDate: '',   // datetime-local (arrivée sur site)
    notes: '',
  });
  renderProjTrucks();
  setTimeout(() => {
    const el = document.getElementById('pt-driver-' + id);
    if (el) el.focus();
  }, 80);
}

function renderProjTrucks() {
  const list = document.getElementById('proj-trucks-list');
  if (!list) return;
  if (!PROJ_TRUCKS.length) {
    list.innerHTML = '';
    return;
  }

  const typeIcons = {
    truck:'🚛', van:'🚐', crane:'🏗️', scissor:'🔧',
    manitou:'🔧', forklift:'🏗️', generator:'⚡', other:'🚗'
  };
  const typeLabels = {
    truck:'Camion', van:'Camionnette', crane:'Grue',
    scissor:'Nacelle', manitou:'Manitou', forklift:'Chariot élév.',
    generator:'Groupe élec.', other:'Autre'
  };

  list.innerHTML = PROJ_TRUCKS.map((t, idx) => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px;position:relative;">
      <!-- Header ligne -->
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:20px;">${typeIcons[t.vehicleType]||'🚛'}</span>
        <select style="padding:4px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"
          onchange="PROJ_TRUCKS[${idx}].vehicleType=this.value;renderProjTrucks()">
          ${Object.entries(typeLabels).map(([v,l])=>`<option value="${v}" ${t.vehicleType===v?'selected':''}>${l}</option>`).join('')}
        </select>
        <input placeholder="N° camion / immat..." value="${t.truckNumber}"
          style="flex:1;padding:4px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"
          oninput="PROJ_TRUCKS[${idx}].truckNumber=this.value">
        <button onclick="PROJ_TRUCKS.splice(${idx},1);renderProjTrucks()"
          style="background:none;border:none;color:var(--accent);cursor:pointer;font-size:18px;flex-shrink:0;">✕</button>
      </div>
      <!-- Plaque + chauffeur + téléphone (sur une ligne) -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:6px;">
        <input placeholder="🪪 Immatriculation" value="${t.licensePlate||''}"
          style="padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"
          oninput="PROJ_TRUCKS[${idx}].licensePlate=this.value">
        <input id="pt-driver-${t.id}" placeholder="👤 Chauffeur" value="${t.driverName}"
          style="padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"
          oninput="PROJ_TRUCKS[${idx}].driverName=this.value">
        <input placeholder="📞 Téléphone" value="${t.driverPhone}"
          style="padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"
          oninput="PROJ_TRUCKS[${idx}].driverPhone=this.value">
      </div>
      <!-- Dates et heures -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">📦 Chargement (date + heure)</div>
          <input type="datetime-local" value="${t.loadingDate||''}"
            style="width:100%;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;"
            oninput="PROJ_TRUCKS[${idx}].loadingDate=this.value">
        </div>
        <div>
          <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">📍 Arrivée sur site (date + heure)</div>
          <input type="datetime-local" value="${t.arrivalDate||''}"
            style="width:100%;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;"
            oninput="PROJ_TRUCKS[${idx}].arrivalDate=this.value">
        </div>
      </div>
      <input placeholder="Notes..." value="${t.notes}"
        style="width:100%;margin-top:6px;padding:5px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;"
        oninput="PROJ_TRUCKS[${idx}].notes=this.value">
    </div>`).join('');
}

async function confirmDeleteProject(projectId) {
  if (!projectId) return;
  const proj = PROJECTS.find(p => p.id === projectId);
  const name = proj?.name || 'ce projet';
  const isArchived = proj?.status === 'cancelled';

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:440px;">
      <div class="modal-head">
        <div class="modal-title">📦 Archiver le projet</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="padding:8px 0 16px;">
        <p style="font-size:14px;margin-bottom:14px;">Que souhaitez-vous faire avec <strong>${name}</strong> ?</p>

        <!-- Archive option -->
        <div style="border:2px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;cursor:pointer;transition:all .15s;"
          onmouseover="this.style.borderColor='var(--blue)'" onmouseout="this.style.borderColor='var(--border)'"
          onclick="archiveProject('${projectId}',this.closest('.overlay'))">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:24px;">📦</span>
            <div>
              <div style="font-weight:700;font-size:14px;">Archiver le projet</div>
              <div style="font-size:12px;color:var(--text3);margin-top:2px;">Le projet est conservé mais masqué de la liste active. Récupérable à tout moment.</div>
            </div>
          </div>
        </div>

        <!-- Restore option if already archived -->
        ${isArchived ? `
        <div style="border:2px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px;cursor:pointer;transition:all .15s;"
          onmouseover="this.style.borderColor='var(--green)'" onmouseout="this.style.borderColor='var(--border)'"
          onclick="restoreProject('${projectId}',this.closest('.overlay'))">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:24px;">♻️</span>
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--green);">Restaurer le projet</div>
              <div style="font-size:12px;color:var(--text3);margin-top:2px;">Remettre le projet en statut actif.</div>
            </div>
          </div>
        </div>` : ''}

        <!-- Delete option -->
        <div style="border:2px solid var(--border);border-radius:10px;padding:14px;cursor:pointer;transition:all .15s;"
          onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'"
          onclick="this.nextElementSibling.style.display='flex'">
          <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:24px;">🗑️</span>
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--accent);">Supprimer définitivement</div>
              <div style="font-size:12px;color:var(--text3);margin-top:2px;">Action irréversible — toutes les données seront perdues.</div>
            </div>
          </div>
        </div>
        <div style="display:none;gap:8px;justify-content:flex-end;padding:10px 0 0;">
          <span style="font-size:12px;color:var(--accent);align-self:center;">Confirmer la suppression ?</span>
          <button class="btn btn-outline btn-sm" onclick="this.closest('[style*=flex]').style.display='none'">Non</button>
          <button class="btn btn-primary btn-sm" style="background:var(--accent);" onclick="deleteProject('${projectId}',this.closest('.overlay'))">Oui, supprimer</button>
        </div>

      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if(e.target===overlay) overlay.remove(); });
}

async function archiveProject(projectId, overlay) {
  const res = await api('PATCH', `/projects/${projectId}`, { status: 'cancelled' });
  if (res?.success) {
    toast('Projet archivé 📦', 'success');
    overlay?.remove();
    PROJECTS = PROJECTS.map(p => p.id === projectId ? {...p, status:'cancelled'} : p);
    CURRENT_PROJECT_ID = null;
    goto('projects');
    loadProjects();
  } else toast('Erreur archivage: ' + (res?.error||'inconnue'), 'error');
}

async function restoreProject(projectId, overlay) {
  const res = await api('PATCH', `/projects/${projectId}`, { status: 'confirmed' });
  if (res?.success) {
    toast('Projet restauré ♻️', 'success');
    overlay?.remove();
    PROJECTS = PROJECTS.map(p => p.id === projectId ? {...p, status:'confirmed'} : p);
    loadProjects();
  } else toast('Erreur restauration', 'error');
}

async function deleteProject(projectId, overlay) {
  const btn = overlay?.querySelector('.btn-primary[onclick*=deleteProject]');
  if (btn) { btn.disabled = true; btn.textContent = '⏳...'; }
  const res = await api('DELETE', `/projects/${projectId}`);
  if (res?.success || res?.message) {
    toast('Projet supprimé', 'success');
    overlay?.remove();
    PROJECTS = PROJECTS.filter(p => p.id !== projectId);
    CURRENT_PROJECT_ID = null;
    goto('projects');
    loadProjects();
  } else {
    toast('Erreur: ' + (res?.error||'inconnue'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Oui, supprimer'; }
  }
}

// ═══════════════════════════════════════════
// MODAL VÉHICULE — création ET édition
// ═══════════════════════════════════════════
// Si "existing" est fourni, on est en mode édition (PATCH avec id), sinon création (POST).
