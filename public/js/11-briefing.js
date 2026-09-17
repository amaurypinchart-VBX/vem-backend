async function loadDetailTrucks(projectId) {
  const el = document.getElementById('detail-trucks-content');
  if (!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-title">Chargement...</div></div>';
  const res = await api('GET', `/projects/${projectId}/trucks`);
  const trucks = res?.data || [];

  const archivedCount = trucks.filter(isTruckArchived).length;
  const visible = SHOW_ARCHIVED_TRUCKS ? trucks : trucks.filter(t => !isTruckArchived(t));

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
      <div style="font-size:13px;color:var(--text3);">
        ${visible.length} véhicule(s) actif(s)
        ${archivedCount > 0 ? `<span style="margin-left:8px;color:var(--text3);font-size:11px;">· ${archivedCount} archivé(s)</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        ${archivedCount > 0 ? `
        <label style="display:flex;gap:4px;align-items:center;font-size:12px;color:var(--text2);cursor:pointer;">
          <input type="checkbox" ${SHOW_ARCHIVED_TRUCKS?'checked':''} onchange="SHOW_ARCHIVED_TRUCKS=this.checked;loadDetailTrucks('${projectId}')" style="accent-color:var(--accent);">
          Voir archivés
        </label>` : ''}
        <button class="btn btn-primary btn-sm" onclick="showAddTruckModal('${projectId}')">+ Ajouter</button>
      </div>
    </div>`;

  if (!visible.length) {
    html += '<div class="empty"><div class="empty-icon">🚛</div><div class="empty-title">Aucun véhicule actif</div><div class="empty-sub">' +
      (archivedCount > 0 ? `${archivedCount} véhicule(s) archivé(s) — coche "Voir archivés" pour les afficher` : 'Ajoute un camion, une grue ou un forklift.') +
      '</div></div>';
    el.innerHTML = html;
    return;
  }

  html += '<div style="display:flex;flex-direction:column;gap:8px;">';
  for (const t of visible) {
    const icon    = TRUCK_VEHICLE_ICONS[t.vehicleType] || '🚛';
    const typeLbl = TRUCK_VEHICLE_LABELS[t.vehicleType] || 'Véhicule';
    const sLbl    = TRUCK_STATUS_LABELS[t.status] || t.status;
    const sColor  = TRUCK_STATUS_COLORS[t.status] || '#5a6275';
    const archived = isTruckArchived(t);
    const fmt = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '—';

    // Nom affiché : type + nom custom optionnel
    const displayName = t.truckNumber ? `${icon} ${typeLbl} — ${esc(t.truckNumber)}` : `${icon} ${typeLbl}`;

    html += `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px;${archived?'opacity:.65;':''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;">${displayName}${archived?' <span style="font-size:10px;color:var(--text3);font-weight:400;">(archivé)</span>':''}</div>
            <!-- Lieux chargement / déchargement sous le nom -->
            <div style="font-size:12px;color:var(--text2);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap;">
              ${t.loadingLocation ? `<span>📦 <strong>Chargement :</strong> ${esc(t.loadingLocation)}</span>` : ''}
              ${t.unloadingLocation ? `<span>🏗️ <strong>Déchargement :</strong> ${esc(t.unloadingLocation)}</span>` : ''}
            </div>
            <div style="font-size:12px;color:var(--text3);margin-top:3px;">
              ${t.licensePlate?`🪪 ${esc(t.licensePlate)} · `:''}${t.driverName?`👤 ${esc(t.driverName)}`:''}${t.driverPhone?` · 📞 <a href="tel:${esc(t.driverPhone)}" style="color:var(--blue);">${esc(t.driverPhone)}</a>`:''}
            </div>
          </div>
          <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">
            <span style="background:${sColor};color:#fff;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:600;">${sLbl}</span>
            <button class="btn btn-ghost btn-sm" onclick='showAddTruckModal("${projectId}", ${JSON.stringify(t).replace(/'/g,"&#39;")})' title="Modifier">✏️</button>
            <button class="btn btn-ghost btn-sm" onclick="deleteTruck('${projectId}','${t.id}')" title="Supprimer">🗑️</button>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;font-size:12px;">
          <div><div style="color:var(--text3);font-size:10px;text-transform:uppercase;">📅 Chargement</div><div>${fmt(t.loadingDate)}</div></div>
          <div><div style="color:var(--text3);font-size:10px;text-transform:uppercase;">📅 Arrivée</div><div>${fmt(t.arrivalDate)}</div></div>
        </div>
        ${t.notes?`<div style="margin-top:8px;font-size:12px;color:var(--text2);padding:6px 8px;background:var(--bg3);border-radius:6px;">📝 ${esc(t.notes)}</div>`:''}
      </div>`;
  }
  html += '</div>';
  el.innerHTML = html;
}


async function deleteTruck(projectId, truckId) {
  if (!confirm('Supprimer ce véhicule ?')) return;
  const res = await api('DELETE', `/projects/${projectId}/trucks/${truckId}`);
  if (res?.success) { toast('Supprimé', 'success'); loadDetailTrucks(projectId); loadProjectDetail(projectId); }
  else toast(res?.error || 'Erreur suppression — non trouvé en base', 'error');
}

// ═════════════════════════════════════════════
// 📋 BRIEFING — Document multi-slides, slides multi-blocs
// ═════════════════════════════════════════════
let CURRENT_BRIEFING = null;          // { id, projectId, title, slides: [{title, blocks:[{type, ...}]}] }
let CURRENT_SLIDE_IDX = 0;
let BRIEFING_AUTO = { tasks: [], trucks: [], project: {} };  // cache des données auto

const BLOCK_TYPES = {
  text:           { icon:'📝', label:'Texte / notes' },
  contacts:       { icon:'📞', label:'Contacts' },
  project:        { icon:'🏷️', label:'Infos projet (auto)' },
  tasks:          { icon:'✅', label:'Tâches (auto)' },
  trucks:         { icon:'🚛', label:'Logistique (auto)' },
  team_bookings:  { icon:'✈️', label:'Transport équipe (auto)' },
  hotel_bookings: { icon:'🏨', label:'Hôtels équipe (auto)' },
  photos:         { icon:'📸', label:'Photos / PDF' },
  location:       { icon:'📍', label:'Localisation' },
  planning: { icon:'📅', label:'Planning installation / démontage' },
  gantt:    { icon:'📊', label:'Gantt / Planning hebdomadaire' },
};

// Migration silencieuse : ancien format (slide.type) → nouveau (slide.blocks[])
function migrateSlide(s) {
  if (Array.isArray(s.blocks)) return s;
  const { type, title, ...rest } = s;
  return { title: title || '', blocks: type ? [{ type, ...rest }] : [] };
}

async function loadDetailBriefing(projectId) {
  const el = document.getElementById('detail-briefing-content');
  if (!el) return;
  el.innerHTML = '<div class="empty"><div class="empty-title">Chargement...</div></div>';

  const listRes = await api('GET', `/briefings/project/${projectId}`);
  if (!listRes?.success) {
    el.innerHTML = '<div class="empty"><div class="empty-title">Erreur de chargement</div></div>';
    return;
  }

  const briefings = listRes.data || [];

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:8px;flex-wrap:wrap;">
      <div style="font-size:13px;color:var(--text3);">${briefings.length} briefing${briefings.length>1?'s':''}</div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-outline btn-sm" id="brf-ai-generate-btn" onclick="generateBriefingWithAI('${projectId}')" title="Génère un premier jet (intro, planning, contacts) à partir des données du projet">✨ Générer avec l'IA</button>
        <button class="btn btn-primary btn-sm" onclick="createNewBriefing('${projectId}')">➕ Nouveau briefing</button>
      </div>
    </div>
    ${briefings.length === 0 ? `
      <div class="empty" style="padding:40px 20px;text-align:center;">
        <div style="font-size:48px;margin-bottom:12px;">📋</div>
        <div class="empty-title">Aucun briefing</div>
        <div style="font-size:13px;color:var(--text3);margin-top:8px;">Clique sur "Nouveau briefing" pour en créer un.</div>
      </div>
    ` : `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
        ${briefings.map(b => {
          const modeLabel = b.mode === 'studio' ? '🎨 Studio' : '📝 Classique';
          const modeBg = b.mode === 'studio' ? 'linear-gradient(135deg,#0a2540,#1a3a60)' : 'var(--bg3)';
          const modeColor = b.mode === 'studio' ? '#fff' : 'var(--text2)';
          const dt = new Date(b.updatedAt).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'});
          return `
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                <div style="font-weight:600;font-size:14px;flex:1;word-break:break-word;">${(b.title||'').replace(/</g,'&lt;')}</div>
                <span style="font-size:10px;padding:2px 8px;border-radius:10px;background:${modeBg};color:${modeColor};white-space:nowrap;">${modeLabel}</span>
              </div>
              <div style="font-size:11px;color:var(--text3);">
                ${b.nbSlides} slide${b.nbSlides>1?'s':''} · Modifié le ${dt}
              </div>
              <div style="display:flex;gap:6px;margin-top:4px;">
                <button class="btn btn-primary btn-sm" style="flex:1;" onclick="openBriefingEditor('${b.id}')">✏️ Ouvrir</button>
                <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteBriefingConfirm('${b.id}','${projectId}')" title="Supprimer">🗑️</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    `}
  `;
}

// Génère un brouillon de briefing par IA (intro + planning depuis les données
// projet, contacts réels, blocs logistique auto) puis ouvre l'éditeur dessus.
async function generateBriefingWithAI(projectId) {
  const btn = document.getElementById('brf-ai-generate-btn');
  if (btn) { btn.disabled = true; btn.textContent = '✨ Génération...'; }
  const res = await api('POST', `/briefings/project/${projectId}/generate`);
  if (btn) { btn.disabled = false; btn.textContent = "✨ Générer avec l'IA"; }
  if (!res?.success) { toast(res?.error || 'Erreur génération IA', 'error'); return; }
  toast('Brouillon généré ✅ — relis et ajuste avant envoi', 'success');
  openBriefingEditor(res.data.id);
}

// Créer un nouveau briefing (demande un nom, POST, puis ouvre l'éditeur)
async function createNewBriefing(projectId) {
  const name = prompt('Nom du briefing :', 'Briefing ' + new Date().toLocaleDateString('fr-FR'));
  if (!name || !name.trim()) return;
  const res = await api('POST', `/briefings/project/${projectId}`, { title: name.trim() });
  if (!res?.success) { toast('Erreur création', 'error'); return; }
  toast('Briefing créé ✅', 'success');
  openBriefingEditor(res.data.id);
}

// Supprimer un briefing (confirmation puis DELETE)
async function deleteBriefingConfirm(briefingId, projectId) {
  if (!confirm('Supprimer définitivement ce briefing ?')) return;
  const res = await api('DELETE', `/briefings/${briefingId}`);
  if (res?.success) {
    toast('Briefing supprimé', 'success');
    loadDetailBriefing(projectId);
  } else {
    toast('Erreur suppression', 'error');
  }
}

// Ouvre le briefing dans l'éditeur (classique ou studio selon le contenu)
async function openBriefingEditor(briefingId) {
  const projectId = CURRENT_PROJECT_ID;
  const el = document.getElementById('detail-briefing-content');
  if (el) el.innerHTML = '<div class="empty"><div class="empty-title">Chargement...</div></div>';

  const [briefRes, tasksRes, trucksRes, projRes] = await Promise.all([
    api('GET', `/briefings/${briefingId}`),
    api('GET', `/tasks?projectId=${projectId}`),
    api('GET', `/projects/${projectId}/trucks`),
    api('GET', `/projects/${projectId}`),
  ]);

  if (!briefRes?.success) {
    if (el) el.innerHTML = '<div class="empty"><div class="empty-title">Erreur de chargement</div></div>';
    return;
  }

  CURRENT_BRIEFING = briefRes.data;

  // Normalise les 2 champs
  if (!Array.isArray(CURRENT_BRIEFING.slides)) CURRENT_BRIEFING.slides = [];
  CURRENT_BRIEFING.slides = CURRENT_BRIEFING.slides.map(migrateSlide);

  // Note : avant Feature 1, on affichait un écran de bienvenue quand seul le
  // Studio avait du contenu. Plus nécessaire maintenant que les 2 modes coexistent.
  // L'éditeur Classique s'affiche toujours par défaut + ton bouton "Ouvrir Studio"
  // habituel reste accessible pour basculer.

  // Sinon → éditeur Classique (avec ton bouton existant pour ouvrir le Studio)
  BRIEFING_AUTO.tasks   = tasksRes?.data  || [];
  BRIEFING_AUTO.trucks  = trucksRes?.data || [];
  BRIEFING_AUTO.project = projRes?.data   || {};

  // Bookings transport + hôtel équipe
  try {
    const bookingsRes = await api('GET', `/projects/${projectId}/bookings`);
    const hotelsRes   = await api('GET', `/projects/${projectId}/hotel-bookings`);
    BRIEFING_AUTO.teamBookings  = bookingsRes?.data || [];
    BRIEFING_AUTO.hotelBookings = hotelsRes?.data   || [];
  } catch (e) {
    console.warn('[brf] échec chargement bookings :', e);
    BRIEFING_AUTO.teamBookings  = [];
    BRIEFING_AUTO.hotelBookings = [];
  }
  CURRENT_SLIDE_IDX = Math.min(CURRENT_SLIDE_IDX, Math.max(0, CURRENT_BRIEFING.slides.length - 1));
  renderBriefing();
}
function renderBriefingStudioWelcome(studioData, projectId) {
  const nb = (studioData.slides || []).length;
  return `
    <div style="background:linear-gradient(135deg,#0a2540 0%,#1a3a60 100%);color:#fff;border-radius:14px;padding:32px;text-align:center;">
      <div style="font-size:48px;margin-bottom:12px;">🎨</div>
      <div style="font-size:22px;font-weight:700;margin-bottom:6px;">Briefing Studio</div>
      <div style="font-size:13px;opacity:.8;margin-bottom:20px;">${studioData.title || 'Briefing'} · ${nb} slide${nb>1?'s':''}</div>
      <button class="btn btn-primary" onclick="openBriefingStudio(${JSON.stringify(studioData).replace(/"/g, '&quot;')})" style="font-size:14px;padding:10px 24px;">
        ✏️ Ouvrir le Studio
      </button>
      <div style="font-size:11px;opacity:.6;margin-top:14px;">Éditeur visuel type Canva : texte, images, formes et flèches en drag-and-drop.</div>
      <button class="btn btn-ghost btn-sm" onclick="briefingStudioRevertToClassic('${projectId}')" style="color:#fff;opacity:.5;margin-top:12px;font-size:11px;">↩︎ Revenir au mode classique</button>
    </div>`;
}

async function briefingStudioRevertToClassic(projectId) {
  // Avec Feature 1, les slides Studio sont déjà préservées dans studioSlides.
  // Cette fonction n'a plus de raison de wipe quoi que ce soit — elle juste
  // re-charge la vue (l'éditeur Classique s'affichera par défaut).
  loadDetailBriefing(projectId);
}

function renderBriefing() {
  const el = document.getElementById('detail-briefing-content');
  if (!el || !CURRENT_BRIEFING) return;
  const slides = CURRENT_BRIEFING.slides;
  const cur = slides[CURRENT_SLIDE_IDX];

  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;gap:8px;flex-wrap:wrap;">
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn btn-ghost btn-sm" onclick="loadDetailBriefing(CURRENT_PROJECT_ID)" title="Retour à la liste">← Liste</button>
        <input class="input" id="brf-title" placeholder="Nom du briefing…" value="${(CURRENT_BRIEFING.title||'').replace(/"/g,'&quot;')}" style="max-width:280px;" onchange="CURRENT_BRIEFING.title=this.value">
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-outline btn-sm" onclick="briefingStudioStart()" title="Nouveau mode : éditeur visuel type Canva" style="background:linear-gradient(135deg,#0a2540,#1a3a60);color:#fff;border:none;">🎨 Studio</button>
        <button class="btn btn-outline btn-sm" onclick="printBriefing()">🖨️ Imprimer</button>
        <button class="btn btn-primary btn-sm" onclick="saveBriefing()">💾 Enregistrer</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:240px 1fr;gap:14px;align-items:flex-start;">
      <!-- Sidebar : liste des slides -->
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:10px;">
        <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Slides (${slides.length})</div>
        <div id="brf-slides-list" style="display:flex;flex-direction:column;gap:4px;max-height:480px;overflow-y:auto;">
          ${slides.map((s,i)=>{
            const label = s.title || `Slide ${i+1}`;
            const icons = (s.blocks||[]).map(b=>(BLOCK_TYPES[b.type]||{}).icon||'·').slice(0,4).join('');
            return `
              <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;cursor:pointer;background:${i===CURRENT_SLIDE_IDX?'var(--bg3)':'transparent'};border:1px solid ${i===CURRENT_SLIDE_IDX?'var(--accent)':'transparent'};" onclick="selectSlide(${i})">
                <span style="font-size:13px;min-width:40px;">${icons||'·'}</span>
                <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</span>
                <span style="display:flex;gap:2px;">
                  <button class="btn btn-ghost btn-sm" style="padding:0 4px;" title="Monter" onclick="event.stopPropagation();moveSlide(${i},-1)">▲</button>
                  <button class="btn btn-ghost btn-sm" style="padding:0 4px;" title="Descendre" onclick="event.stopPropagation();moveSlide(${i},1)">▼</button>
                  <button class="btn btn-ghost btn-sm" style="padding:0 4px;color:var(--accent);" title="Supprimer" onclick="event.stopPropagation();deleteSlide(${i})">×</button>
                </span>
              </div>`;
          }).join('') || '<div style="font-size:12px;color:var(--text3);padding:8px;">Aucune slide</div>'}
        </div>
        <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;">
          <button class="btn btn-primary btn-sm" style="width:100%;" onclick="addSlide()">+ Nouvelle slide</button>
        </div>
      </div>

      <!-- Éditeur de la slide courante -->
      <div id="brf-editor" style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:14px;min-height:300px;">
        ${cur ? renderSlideEditor(cur, CURRENT_SLIDE_IDX) : '<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">Choisis ou ajoute une slide</div></div>'}
      </div>
    </div>`;
}

function renderSlideEditor(s, idx) {
  const esc = x => (x||'').toString().replace(/"/g,'&quot;');
  const blocks = s.blocks || [];
  return `
    <input class="input" placeholder="Titre de la slide…" value="${esc(s.title)}" onchange="CURRENT_BRIEFING.slides[${idx}].title=this.value;renderBriefing()" style="margin-bottom:14px;">

    <div style="display:flex;flex-direction:column;gap:10px;">
      ${blocks.map((b, bi) => renderBlockEditor(idx, bi, b)).join('') || '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px;border:1px dashed var(--border);border-radius:8px;">Cette slide est vide — ajoute un bloc ci-dessous</div>'}
    </div>

    <div style="border-top:1px solid var(--border);margin-top:12px;padding-top:10px;">
      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;margin-bottom:6px;">+ Ajouter un bloc à cette slide</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;">
        ${Object.entries(BLOCK_TYPES).map(([k,v])=>`<button class="btn btn-outline btn-sm" style="font-size:11px;padding:4px 8px;" onclick="addBlock(${idx},'${k}')">${v.icon} ${v.label}</button>`).join('')}
      </div>
    </div>`;
}

function renderBlockEditor(slideIdx, bi, b) {
  const esc = x => (x||'').toString().replace(/"/g,'&quot;');
  const meta = BLOCK_TYPES[b.type] || { icon:'·', label:b.type };

  let body = '';
  if (b.type === 'text') {
    body = `<textarea class="input" rows="6" placeholder="Notes, instructions, remarques..." onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].content=this.value">${b.content||''}</textarea>`;
  }
  else if (b.type === 'contacts') {
    const contacts = b.contacts || [];
    body = `
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${contacts.map((c,ci)=>renderContactRow(slideIdx, bi, ci, c)).join('') || '<div style="font-size:12px;color:var(--text3);">Aucun contact — ajoute en ci-dessous.</div>'}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;align-items:center;">
        <button class="btn btn-outline btn-sm" onclick="addContact(${slideIdx},${bi})">+ Contact manuel</button>
        <button class="btn btn-outline btn-sm" onclick="openPickContactFromClients(${slideIdx},${bi})">🤝 Depuis les clients</button>
        <select class="input" id="brf-pick-user-${slideIdx}-${bi}" style="flex:1;min-width:160px;">
          <option value="">+ Membre de l'équipe…</option>
          ${(USERS||[]).map(u=>`<option value="${u.id}">${u.firstName} ${u.lastName} ${u.role?'('+u.role+')':''}</option>`).join('')}
        </select>
        <button class="btn btn-outline btn-sm" onclick="addContactFromUser(${slideIdx},${bi})">Ajouter</button>
      </div>`;
  }
  else if (b.type === 'tasks') {
    const tasks = BRIEFING_AUTO.tasks || [];
    body = `<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">📌 Liste extraite automatiquement (${tasks.length} tâche${tasks.length>1?'s':''}). Mise à jour à chaque ouverture du briefing.</div>
      ${tasks.length ? `<div style="max-height:200px;overflow-y:auto;background:var(--bg3);border-radius:6px;padding:6px;">
        ${tasks.map(t=>`<div style="font-size:12px;padding:4px 6px;border-bottom:1px solid var(--border);">${t.taskDate?new Date(t.taskDate).toLocaleDateString('fr-FR')+' · ':''}<strong>${esc(t.title)}</strong> <span style="color:var(--text3);">— ${t.status}</span></div>`).join('')}
      </div>` : '<div style="color:var(--text3);font-size:12px;font-style:italic;">Aucune tâche pour ce projet.</div>'}`;
  }
  else if (b.type === 'trucks') {
    const trucks = BRIEFING_AUTO.trucks || [];
    body = `<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">📌 Liste extraite automatiquement (${trucks.length} véhicule${trucks.length>1?'s':''}).</div>
      ${trucks.length ? `<div style="max-height:200px;overflow-y:auto;background:var(--bg3);border-radius:6px;padding:6px;">
        ${trucks.map(t=>`<div style="font-size:12px;padding:4px 6px;border-bottom:1px solid var(--border);">${esc(t.vehicleType||'truck')} ${esc(t.truckNumber||'')} ${t.driverName?'· 👤 '+esc(t.driverName):''} ${t.driverPhone?'· 📞 '+esc(t.driverPhone):''} ${t.arrivalDate?'<br><span style="color:var(--text3);">Arrivée : '+new Date(t.arrivalDate).toLocaleString('fr-FR')+'</span>':''}</div>`).join('')}
      </div>` : '<div style="color:var(--text3);font-size:12px;font-style:italic;">Aucun véhicule pour ce projet.</div>'}`;
  }
  else if (b.type === 'project') {
    const p = BRIEFING_AUTO.project || {};
    const fmt = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '—';
    const row = (lbl, val) => `<div style="display:grid;grid-template-columns:140px 1fr;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid var(--border);"><span style="color:var(--text3);">${lbl}</span><span>${val||'—'}</span></div>`;
    body = `<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">📌 Infos extraites automatiquement de la fiche projet (mises à jour à chaque ouverture du briefing).</div>
      <div style="background:var(--bg3);border-radius:6px;padding:8px 12px;">
        ${row('Projet',          esc(p.name))}
        ${row('N° interne',      esc(p.internalNumber))}
        ${row('Statut',          esc(p.status))}
        ${row('Client',          esc(p.client?.name))}
        ${(p.client?.contactName || p.client?.phone || p.client?.email) ? row('Contact client', `${esc(p.client?.contactName)||''} ${p.client?.phone?'· '+esc(p.client.phone):''} ${p.client?.email?'· '+esc(p.client.email):''}`) : ''}
        ${row('Adresse',         `${esc(p.address)}${p.city?', '+esc(p.city):''}`)}
        ${row('Installation',    `${fmt(p.installationStart)} → ${fmt(p.installationEnd)}`)}
        ${p.dismantlingStart ? row('Démontage', `${fmt(p.dismantlingStart)} → ${fmt(p.dismantlingEnd)}`) : ''}
        ${row('Ouvriers prévus', esc(String(p.workersCount || 0)))}
        ${p.technicalManager ? row('Chef technique', esc(`${p.technicalManager.firstName} ${p.technicalManager.lastName}`)) : ''}
        ${p.description ? row('Description', esc(p.description)) : ''}
        ${p.specialInstructions ? row('Instructions spéciales', esc(p.specialInstructions)) : ''}
      </div>`;
  }
  else if (b.type === 'photos') {
    const photos = b.photos || [];
    // Helper : page N d'un PDF Cloudinary → URL JPG (pour l'impression)
    const isPdf = u => /\.pdf($|\?)/i.test(u || '');
      // PDFs : conversion Cloudinary pg_N/ → JPG (l'iframe Cloudinary est souvent bloquée
      // par X-Frame-Options ou Content-Disposition, donc on convertit en image fiable).
      const pdfPageUrl = (url, n) => url.includes('/upload/')
        ? url.replace('/upload/', `/upload/f_jpg,c_limit,w_1100,pg_${n}/`).replace(/\.pdf($|\?)/i, '.jpg$1')
        : url;
      body = `
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:8px;">
          ${photos.map((p,pi)=>{
            if (isPdf(p.url)) {
              // On rend 10 pages max (les onerror masquent celles qui n'existent pas)
              const PAGES = 10;
              const pagesHtml = Array.from({length: PAGES}, (_, i) => i + 1)
                .map(n => `<img src="${pdfPageUrl(p.url, n)}" onerror="this.style.display='none';" style="max-width:100%;display:block;margin:6px auto;border:1px solid var(--border);border-radius:4px;background:white;">`)
                .join('');
              return `<div style="position:relative;background:var(--bg3);border-radius:8px;padding:8px;">
                <div style="font-size:11px;color:var(--text3);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;">
                  <span>📄 ${esc(p.caption || 'PDF')}</span>
                  <a href="${p.url}" target="_blank" style="color:var(--blue);font-size:11px;">↗ Ouvrir le PDF original</a>
                </div>
                <div style="max-height:560px;overflow-y:auto;background:#fafafa;padding:6px;border-radius:6px;border:1px solid var(--border);">
                  ${pagesHtml}
                </div>
                <input class="input" style="font-size:11px;padding:4px;margin-top:6px;" placeholder="Légende" value="${esc(p.caption)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].photos[${pi}].caption=this.value">
                <button class="btn btn-ghost btn-sm" style="position:absolute;top:4px;right:4px;color:var(--accent);background:var(--bg2);" onclick="removeBriefPhoto(${slideIdx},${bi},${pi})">×</button>
              </div>`;
            }
          return `<div style="position:relative;background:var(--bg3);border-radius:8px;padding:8px;display:grid;grid-template-columns:280px 1fr;gap:10px;align-items:start;">
            <img src="${p.url}" style="width:280px;max-height:200px;object-fit:cover;border-radius:6px;">
            <div>
              <input class="input" style="font-size:12px;" placeholder="Légende (ex: vue d'ensemble du stand)" value="${esc(p.caption)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].photos[${pi}].caption=this.value">
            </div>
            <button class="btn btn-ghost btn-sm" style="position:absolute;top:4px;right:4px;color:var(--accent);background:var(--bg2);" onclick="removeBriefPhoto(${slideIdx},${bi},${pi})">×</button>
          </div>`;
        }).join('') || '<div style="text-align:center;color:var(--text3);font-size:12px;padding:14px;border:1px dashed var(--border);border-radius:8px;">Aucun fichier</div>'}
      </div>
      <input type="file" id="brf-photo-input-${slideIdx}-${bi}" multiple accept="image/*,application/pdf" style="display:none;" onchange="uploadBriefPhotos(${slideIdx},${bi},this.files)">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="document.getElementById('brf-photo-input-${slideIdx}-${bi}').click()">📎 Importer photos / PDF</button>
        <button class="btn btn-outline btn-sm" onclick="openPickFromProjectFiles(${slideIdx},${bi})">📁 Choisir parmi les fichiers du projet</button>
      </div>`;
  }
  else if (b.type === 'location') {
    const addr = b.address || '';
    body = `
      <div class="form-group"><label class="form-label">Adresse</label>
        <input class="input" value="${esc(addr)}" placeholder="Adresse complète" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].address=this.value">
      </div>
      <div class="form-group"><label class="form-label">N° de stand / hall</label>
        <input class="input" value="${esc(b.stand)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].stand=this.value">
      </div>
      <div class="form-group"><label class="form-label">Notes (accès, parking, horaires)</label>
        <textarea class="input" rows="3" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].notes=this.value">${b.notes||''}</textarea>
      </div>
      ${addr ? `<a class="btn btn-outline btn-sm" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}">🗺️ Google Maps</a>` : ''}`;
  }
  else if (b.type === 'team_bookings') {
    const bookings = BRIEFING_AUTO.teamBookings || [];
    if (!bookings.length) {
      body = '<div style="color:var(--text3);font-size:12px;font-style:italic;padding:10px;">Aucun booking transport pour ce projet. Ajoute-les depuis l\'onglet Équipe / Transport.</div>';
    } else {
      const fmtDt = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '—';
      const groups = {
        installation: bookings.filter(x => x.phase === 'installation'),
        dismantling:  bookings.filter(x => x.phase === 'dismantling'),
      };
      const renderRow = bk => {
        const u = bk.user || {};
        const name = `${u.firstName||''} ${u.lastName||''}`.trim() || '—';
        const out = bk.outboundMode ? `${esc(bk.outboundMode)}${bk.outboundDate?' · '+fmtDt(bk.outboundDate):''}${bk.outboundDetails?' · '+esc(bk.outboundDetails):''}` : '—';
        const ret = bk.returnMode   ? `${esc(bk.returnMode)}${bk.returnDate?' · '+fmtDt(bk.returnDate):''}${bk.returnDetails?' · '+esc(bk.returnDetails):''}` : '—';
        return `<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px;">
          <div style="font-weight:700;margin-bottom:4px;">👤 ${esc(name)} ${u.role?'<span style="color:var(--text3);font-weight:400;font-size:11px;">('+esc(u.role)+')</span>':''}</div>
          <div style="color:var(--text2);">📍 Sur site : ${fmtDt(bk.onSiteStart)} → ${fmtDt(bk.onSiteEnd)}</div>
          <div style="color:var(--text2);">🛫 Aller : ${out}</div>
          <div style="color:var(--text2);">🛬 Retour : ${ret}</div>
          ${bk.notes?`<div style="color:var(--text3);font-style:italic;margin-top:4px;">📝 ${esc(bk.notes)}</div>`:''}
          ${bk.attachmentUrl?`<a href="${esc(bk.attachmentUrl)}" target="_blank" style="color:var(--blue);font-size:11px;">📎 ${esc(bk.attachmentName||'Pièce jointe')}</a>`:''}
        </div>`;
      };
      body = `<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">📌 Bookings transport extraits automatiquement (${bookings.length} au total).</div>
        ${groups.installation.length ? `<div style="font-weight:700;font-size:12px;color:var(--accent);margin:8px 0 4px;">🏗️ Installation</div>${groups.installation.map(renderRow).join('')}` : ''}
        ${groups.dismantling.length ? `<div style="font-weight:700;font-size:12px;color:var(--accent);margin:8px 0 4px;">🔨 Démontage</div>${groups.dismantling.map(renderRow).join('')}` : ''}`;
    }
  }
  else if (b.type === 'hotel_bookings') {
    const hotels = BRIEFING_AUTO.hotelBookings || [];
    if (!hotels.length) {
      body = '<div style="color:var(--text3);font-size:12px;font-style:italic;padding:10px;">Aucune réservation hôtel pour ce projet.</div>';
    } else {
      const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
      body = `<div style="font-size:11px;color:var(--text3);margin-bottom:6px;">📌 Réservations extraites automatiquement (${hotels.length} hôtel${hotels.length>1?'s':''}).</div>
        ${hotels.map(h => {
          const phaseLbl = h.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Installation';
          const occupants = (h.occupants||[]).map(o => `${o.user?.firstName||''} ${o.user?.lastName||''}`.trim()).filter(Boolean);
          return `<div style="background:var(--bg2);padding:8px;border-radius:6px;margin-bottom:6px;font-size:12px;">
            <div style="font-weight:700;margin-bottom:4px;">🏨 ${esc(h.hotelName)} <span style="color:var(--text3);font-weight:400;font-size:11px;">— ${phaseLbl}</span></div>
            ${h.hotelAddress?`<div style="color:var(--text2);">📍 ${esc(h.hotelAddress)}</div>`:''}
            <div style="color:var(--text2);">📅 ${fmtDate(h.checkin)} → ${fmtDate(h.checkout)}</div>
            ${h.reference?`<div style="color:var(--text3);font-size:11px;">Réf : ${esc(h.reference)}</div>`:''}
            ${occupants.length?`<div style="color:var(--text2);margin-top:4px;">👥 ${occupants.map(esc).join(', ')}</div>`:''}
            ${h.notes?`<div style="color:var(--text3);font-style:italic;margin-top:4px;">📝 ${esc(h.notes)}</div>`:''}
            ${h.attachmentUrl?`<a href="${esc(h.attachmentUrl)}" target="_blank" style="color:var(--blue);font-size:11px;">📎 ${esc(h.attachmentName||'Voucher')}</a>`:''}
          </div>`;
        }).join('')}`;
    }
  }
  if (b.type === 'team_bookings') {
      const bookings = BRIEFING_AUTO.teamBookings || [];
      if (!bookings.length) return '<div style="color:#888;text-align:center;padding:10px;">Aucun booking transport</div>';
      const fmtDt = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '—';
      const rows = bookings.map(bk => {
        const u = bk.user || {};
        const name = `${u.firstName||''} ${u.lastName||''}`.trim();
        const phaseLbl = bk.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Installation';
        const out = bk.outboundMode ? `${esc(bk.outboundMode)}${bk.outboundDate?'<br>'+fmtDt(bk.outboundDate):''}${bk.outboundDetails?'<br><span style="color:#888;font-size:11px;">'+esc(bk.outboundDetails)+'</span>':''}` : '—';
        const ret = bk.returnMode   ? `${esc(bk.returnMode)}${bk.returnDate?'<br>'+fmtDt(bk.returnDate):''}${bk.returnDetails?'<br><span style="color:#888;font-size:11px;">'+esc(bk.returnDetails)+'</span>':''}` : '—';
        return `<tr><td><strong>${esc(name)}</strong>${u.role?'<br><span style="color:#888;font-size:11px;">'+esc(u.role)+'</span>':''}</td><td>${phaseLbl}</td><td>${fmtDt(bk.onSiteStart)}<br>→ ${fmtDt(bk.onSiteEnd)}</td><td>${out}</td><td>${ret}</td></tr>`;
      }).join('');
      return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0;"><thead><tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px;">Membre</th><th style="text-align:left;padding:6px;">Phase</th><th style="text-align:left;padding:6px;">Sur site</th><th style="text-align:left;padding:6px;">Aller</th><th style="text-align:left;padding:6px;">Retour</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
    if (b.type === 'hotel_bookings') {
      const hotels = BRIEFING_AUTO.hotelBookings || [];
      if (!hotels.length) return '<div style="color:#888;text-align:center;padding:10px;">Aucune réservation hôtel</div>';
      const rows = hotels.map(h => {
        const phaseLbl = h.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Installation';
        const occupants = (h.occupants||[]).map(o => `${o.user?.firstName||''} ${o.user?.lastName||''}`.trim()).filter(Boolean).join(', ');
        return `<tr><td><strong>${esc(h.hotelName)}</strong>${h.hotelAddress?'<br><span style="color:#888;font-size:11px;">'+esc(h.hotelAddress)+'</span>':''}</td><td>${phaseLbl}</td><td>${fmtDate(h.checkin)}<br>→ ${fmtDate(h.checkout)}</td><td>${esc(occupants||'—')}</td><td>${esc(h.reference||'')}${h.notes?'<br><span style="color:#888;font-size:11px;">'+esc(h.notes)+'</span>':''}</td></tr>`;
      }).join('');
      return `<table style="width:100%;border-collapse:collapse;font-size:12px;margin:8px 0;"><thead><tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px;">Hôtel</th><th style="text-align:left;padding:6px;">Phase</th><th style="text-align:left;padding:6px;">Séjour</th><th style="text-align:left;padding:6px;">Occupants</th><th style="text-align:left;padding:6px;">Réf / Notes</th></tr></thead><tbody>${rows}</tbody></table>`;
    }
else if (b.type === 'gantt') {
    // Initialise les défauts si bloc neuf
    if (typeof b.title    !== 'string')                                  b.title    = '';
    if (typeof b.prefix   !== 'string')                                  b.prefix   = 'KW';
    if (!Array.isArray(b.columns) || b.columns.length === 0)             b.columns  = ['1','2','3','4','5','6'];
    if (!Array.isArray(b.tasks))                                         b.tasks    = [];

    const cols = b.columns;
    const colLabel = (ci) => `${b.prefix?esc(b.prefix)+' ':''}${esc(cols[ci])}`;

    // ─── Aperçu : tableau Gantt avec barres colorées ───
    const previewHeader = cols.map((c, ci) =>
      `<th style="background:#f8f9fa;border:1px solid #ddd;padding:4px 6px;font-size:11px;text-align:center;min-width:50px;color:#222;">${b.prefix?esc(b.prefix)+' ':''}${esc(c)}</th>`
    ).join('');

    const previewRows = b.tasks.map((t, ti) => {
      const from = Math.max(0, Math.min(cols.length - 1, parseInt(t.from) || 0));
      const to   = Math.max(from, Math.min(cols.length - 1, parseInt(t.to) || from));
      let cellsHtml = '';
      let ci = 0;
      while (ci < cols.length) {
        if (ci < from || ci > to) {
          cellsHtml += '<td style="border:1px solid #eee;height:26px;background:white;"></td>';
          ci++;
        } else {
          const span = to - from + 1;
          const noteHtml = t.note ? `<span style="color:#fff;font-size:11px;font-weight:600;padding-left:6px;">${esc(t.note)}</span>` : '&nbsp;';
          cellsHtml += `<td colspan="${span}" style="background:${esc(t.color||'#4895ef')};border:1px solid #ddd;height:26px;padding:2px 6px;">${noteHtml}</td>`;
          ci = to + 1;
        }
      }
      return `<tr><td style="border:1px solid #eee;padding:4px 8px;font-size:12px;background:#fafafa;color:#222;min-width:200px;">${esc(t.title)||'<span style="color:#aaa;font-style:italic;">(sans titre)</span>'}</td>${cellsHtml}</tr>`;
    }).join('');

    const previewHtml = `<div style="overflow-x:auto;border:1px solid var(--border);border-radius:6px;background:white;">
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr><th style="background:#f8f9fa;border:1px solid #ddd;padding:4px 8px;font-size:11px;text-align:left;color:#222;">Tâche</th>${previewHeader}</tr></thead>
        <tbody>${previewRows||`<tr><td colspan="${cols.length+1}" style="text-align:center;padding:14px;color:#888;font-size:11px;font-style:italic;background:white;">Aucune tâche — ajoute-en ci-dessous</td></tr>`}</tbody>
      </table>
    </div>`;

    // ─── Éditeurs ligne-par-ligne ───
    const colEditorsHtml = cols.map((c, ci) =>
      `<input class="input" value="${esc(c)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].columns[${ci}]=this.value;renderBriefing()" style="width:60px;font-size:11px;padding:3px;text-align:center;" placeholder="${ci+1}">`
    ).join('');

    const taskEditorsHtml = b.tasks.map((t, ti) => {
      const fromOpts = cols.map((c, ci) => `<option value="${ci}" ${ci===parseInt(t.from)?'selected':''}>${b.prefix?esc(b.prefix)+' ':''}${esc(c)}</option>`).join('');
      const toOpts   = cols.map((c, ci) => `<option value="${ci}" ${ci===parseInt(t.to)?'selected':''}>${b.prefix?esc(b.prefix)+' ':''}${esc(c)}</option>`).join('');
      return `<div style="display:grid;grid-template-columns:1fr 110px 110px 110px 40px 28px;gap:4px;align-items:center;background:var(--bg2);padding:4px;border-radius:4px;margin-bottom:4px;">
        <input class="input" style="font-size:11px;padding:4px 6px;" placeholder="Description de la tâche" value="${esc(t.title)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].tasks[${ti}].title=this.value;renderBriefing()">
        <select class="input" style="font-size:11px;padding:4px;" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].tasks[${ti}].from=parseInt(this.value);renderBriefing()">${fromOpts}</select>
        <select class="input" style="font-size:11px;padding:4px;" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].tasks[${ti}].to=parseInt(this.value);renderBriefing()">${toOpts}</select>
        <input class="input" style="font-size:11px;padding:4px 6px;" placeholder="Date / note" value="${esc(t.note||'')}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].tasks[${ti}].note=this.value;renderBriefing()">
        <input type="color" value="${esc(t.color||'#4895ef')}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].tasks[${ti}].color=this.value;renderBriefing()" style="width:36px;height:24px;border:none;padding:0;cursor:pointer;background:transparent;" title="Couleur de la barre">
        <button class="btn btn-ghost btn-xs" style="color:var(--accent);" onclick="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].tasks.splice(${ti},1);renderBriefing()" title="Supprimer la tâche">×</button>
      </div>`;
    }).join('');

    body = `
      <input class="input" placeholder="Titre du planning (ex: SAP Planning Extension)" value="${esc(b.title)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].title=this.value;renderBriefing()" style="margin-bottom:8px;">

      <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
        <label style="font-size:11px;color:var(--text3);">Préfixe colonnes :</label>
        <input class="input" value="${esc(b.prefix)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].prefix=this.value;renderBriefing()" style="width:80px;font-size:11px;padding:3px 6px;" placeholder="ex: KW, Sem.">
        <span style="font-size:10px;color:var(--text3);">(laisse vide pour libellés libres comme "Janv.", "Févr.")</span>
      </div>

      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin:10px 0 4px;">Colonnes</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
        ${colEditorsHtml}
        <button class="btn btn-outline btn-xs" onclick="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].columns.push('');renderBriefing()" style="font-size:11px;padding:3px 8px;" title="Ajouter une colonne">+</button>
        ${cols.length>1?`<button class="btn btn-outline btn-xs" onclick="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].columns.pop();renderBriefing()" style="font-size:11px;padding:3px 8px;color:var(--accent);" title="Retirer la dernière colonne">−</button>`:''}
      </div>

      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin:10px 0 4px;">Aperçu</div>
      ${previewHtml}

      <div style="font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin:14px 0 4px;">Tâches</div>
      <div style="display:grid;grid-template-columns:1fr 110px 110px 110px 40px 28px;gap:4px;margin-bottom:4px;font-size:10px;color:var(--text3);padding:0 4px;">
        <div>Description</div><div>De</div><div>À</div><div>Date/Note</div><div>🎨</div><div></div>
      </div>
      ${taskEditorsHtml || '<div style="font-size:11px;color:var(--text3);font-style:italic;padding:8px;">Aucune tâche. Clique sur "+ Ajouter une tâche" ci-dessous.</div>'}

      <button class="btn btn-outline btn-sm" style="margin-top:6px;" onclick="addGanttTask(${slideIdx},${bi})">+ Ajouter une tâche</button>
    `;
  }
if (b.type === 'gantt') {
      const cols = b.columns || [];
      const tasks = b.tasks || [];
      if (cols.length === 0) return '<div style="color:#888;padding:10px;font-style:italic;">Gantt sans colonnes</div>';
      const headerCells = cols.map(c =>
        `<th style="background:#f8f9fa;border:1px solid #ddd;padding:6px;font-size:12px;text-align:center;min-width:60px;">${b.prefix?esc(b.prefix)+' ':''}${esc(c)}</th>`
      ).join('');
      const taskRows = tasks.map(t => {
        const from = Math.max(0, Math.min(cols.length - 1, parseInt(t.from) || 0));
        const to   = Math.max(from, Math.min(cols.length - 1, parseInt(t.to) || from));
        let cellsHtml = '';
        let ci = 0;
        while (ci < cols.length) {
          if (ci < from || ci > to) {
            cellsHtml += '<td style="border:1px solid #eee;height:28px;"></td>';
            ci++;
          } else {
            const span = to - from + 1;
            const note = t.note ? `<span style="font-size:11px;font-weight:600;color:#fff;padding-left:6px;">${esc(t.note)}</span>` : '&nbsp;';
            cellsHtml += `<td colspan="${span}" style="background:${esc(t.color||'#4895ef')};border:1px solid #ddd;height:28px;padding:4px 8px;">${note}</td>`;
            ci = to + 1;
          }
        }
        return `<tr><td style="border:1px solid #eee;padding:6px 8px;font-size:12px;background:#fafafa;min-width:220px;">${esc(t.title)}</td>${cellsHtml}</tr>`;
      }).join('');
      const titleHtml = b.title ? `<div style="font-weight:700;color:#1a1a2e;font-size:14px;margin-bottom:8px;">${esc(b.title)}</div>` : '';
      return `<div style="margin:14px 0;page-break-inside:avoid;">
        ${titleHtml}
        <table style="border-collapse:collapse;width:100%;">
          <thead><tr><th style="background:#f8f9fa;border:1px solid #ddd;padding:6px 8px;font-size:12px;text-align:left;">Tâche</th>${headerCells}</tr></thead>
          <tbody>${taskRows||`<tr><td colspan="${cols.length+1}" style="text-align:center;padding:14px;color:#888;font-size:12px;">Aucune tâche</td></tr>`}</tbody>
        </table>
      </div>`;
    }
  else if (b.type === 'planning') {
    // Bloc Planning : sélection du type (installation/démontage/jour spécifique) + liste d'étapes horaires
    // Chaque étape = { time: "HH:mm", duration: "Xh", description: "...", responsible: "..." }
    if (!Array.isArray(b.steps)) b.steps = [];
    if (!b.phase) b.phase = 'installation';
    if (!b.dateLabel) b.dateLabel = '';

    const phaseOptions = [
      { v: 'installation', l: '🏗️ Installation' },
      { v: 'dismantling',  l: '🔨 Démontage' },
      { v: 'event',        l: '🎉 Jour de l\'événement' },
      { v: 'preprod',      l: '📦 Pré-production / Atelier' },
      { v: 'custom',       l: '📅 Autre' },
    ];

    body = `
      <div class="input-row">
        <div class="form-group" style="margin:0;">
          <label class="form-label">Phase concernée</label>
          <select class="input" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].phase=this.value">
            ${phaseOptions.map(p => `<option value="${p.v}" ${b.phase===p.v?'selected':''}>${p.l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin:0;">
          <label class="form-label">Date / Libellé (optionnel)</label>
          <input class="input" placeholder="Ex: Jour 1 — 17 juin" value="${esc(b.dateLabel||'')}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].dateLabel=this.value">
        </div>
      </div>

      <div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:700;margin:10px 0 6px;">📋 Étapes du planning</div>
      <div id="planning-steps-${slideIdx}-${bi}" style="display:flex;flex-direction:column;gap:6px;">
        ${b.steps.map((s, si) => `
          <div style="display:grid;grid-template-columns:90px 70px 1fr 1fr 28px;gap:6px;align-items:center;background:var(--bg2);padding:6px;border-radius:6px;">
            <input class="input" type="time" value="${esc(s.time||'')}" placeholder="HH:mm"
              style="font-size:12px;padding:4px 6px;"
              onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].steps[${si}].time=this.value">
            <input class="input" value="${esc(s.duration||'')}" placeholder="durée"
              style="font-size:12px;padding:4px 6px;"
              onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].steps[${si}].duration=this.value">
            <input class="input" value="${esc(s.description||'')}" placeholder="Description de l'étape (ex: Montage structure scène)"
              style="font-size:12px;padding:4px 6px;"
              onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].steps[${si}].description=this.value">
            <input class="input" value="${esc(s.responsible||'')}" placeholder="Responsable"
              style="font-size:12px;padding:4px 6px;"
              onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].steps[${si}].responsible=this.value">
            <button class="btn btn-ghost btn-xs" onclick="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].steps.splice(${si},1);renderBriefing()" title="Supprimer cette étape" style="color:var(--accent);">×</button>
          </div>`).join('')}
        ${b.steps.length === 0 ? '<div style="font-size:11px;color:var(--text3);font-style:italic;padding:8px;">Aucune étape. Clique sur "+ Ajouter une étape" ci-dessous.</div>' : ''}
      </div>
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="addPlanningStep(${slideIdx},${bi})">+ Ajouter une étape</button>
        <button class="btn btn-ghost btn-sm" onclick="addPlanningStepsFromProject(${slideIdx},${bi})" title="Pré-remplir avec les heures du projet">⚡ Générer depuis le projet</button>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px;font-style:italic;">💡 Astuce : laisser un champ vide pour le masquer (heure, durée, responsable)</div>`;
  }

  return `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px;">
        <div style="font-size:12px;font-weight:600;color:var(--text2);">${meta.icon} ${meta.label}</div>
        <div style="display:flex;gap:2px;">
          <button class="btn btn-ghost btn-sm" style="padding:0 6px;" title="Monter" onclick="moveBlock(${slideIdx},${bi},-1)">▲</button>
          <button class="btn btn-ghost btn-sm" style="padding:0 6px;" title="Descendre" onclick="moveBlock(${slideIdx},${bi},1)">▼</button>
          <button class="btn btn-ghost btn-sm" style="padding:0 6px;color:var(--accent);" title="Supprimer ce bloc" onclick="removeBlock(${slideIdx},${bi})">×</button>
        </div>
      </div>
      ${body}
    </div>`;
}

function renderContactRow(slideIdx, bi, ci, c) {
  const esc = x => (x||'').toString().replace(/"/g,'&quot;');
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr auto;gap:6px;align-items:center;">
      <input class="input" placeholder="Nom" value="${esc(c.name)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].contacts[${ci}].name=this.value">
      <input class="input" placeholder="Rôle" value="${esc(c.role)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].contacts[${ci}].role=this.value">
      <input class="input" placeholder="Téléphone" value="${esc(c.phone)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].contacts[${ci}].phone=this.value">
      <input class="input" placeholder="Email" value="${esc(c.email)}" onchange="CURRENT_BRIEFING.slides[${slideIdx}].blocks[${bi}].contacts[${ci}].email=this.value">
      <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="removeContact(${slideIdx},${bi},${ci})">×</button>
    </div>`;
}

// ─── Manipulations slides ───
function selectSlide(i) { CURRENT_SLIDE_IDX = i; renderBriefing(); }

function addSlide() {
  if (!CURRENT_BRIEFING) return;
  CURRENT_BRIEFING.slides.push({ title:'', blocks:[] });
  CURRENT_SLIDE_IDX = CURRENT_BRIEFING.slides.length - 1;
  renderBriefing();
}

function deleteSlide(i) {
  if (!confirm('Supprimer cette slide ?')) return;
  CURRENT_BRIEFING.slides.splice(i,1);
  if (CURRENT_SLIDE_IDX >= CURRENT_BRIEFING.slides.length) CURRENT_SLIDE_IDX = Math.max(0, CURRENT_BRIEFING.slides.length-1);
  renderBriefing();
}

function moveSlide(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= CURRENT_BRIEFING.slides.length) return;
  const arr = CURRENT_BRIEFING.slides;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  if (CURRENT_SLIDE_IDX === i) CURRENT_SLIDE_IDX = j;
  renderBriefing();
}

// ─── Manipulations blocs ───
function addBlock(slideIdx, type) {
  const s = CURRENT_BRIEFING.slides[slideIdx];
  s.blocks = s.blocks || [];
  const fresh = { type };
  if (type === 'contacts') fresh.contacts = [];
  if (type === 'photos')   fresh.photos   = [];
  s.blocks.push(fresh);
  renderBriefing();
}

function removeBlock(slideIdx, bi) {
  if (!confirm('Supprimer ce bloc ?')) return;
  CURRENT_BRIEFING.slides[slideIdx].blocks.splice(bi, 1);
  renderBriefing();
}

function moveBlock(slideIdx, bi, dir) {
  const arr = CURRENT_BRIEFING.slides[slideIdx].blocks;
  const j = bi + dir;
  if (j < 0 || j >= arr.length) return;
  [arr[bi], arr[j]] = [arr[j], arr[bi]];
  renderBriefing();
}
// ─── Gantt-style planning ───
// Ajoute une nouvelle ligne de tâche dans un bloc Gantt avec une couleur cyclique.
function addGanttTask(slideIdx, bi) {
  const b = CURRENT_BRIEFING.slides[slideIdx].blocks[bi];
  if (!Array.isArray(b.tasks)) b.tasks = [];
  const palette = ['#4895ef', '#e63946', '#f4a261', '#2dc653', '#9b59b6', '#0a2540', '#e67e22'];
  const cols = Array.isArray(b.columns) ? b.columns : [];
  b.tasks.push({
    title: '',
    from: 0,
    to: Math.max(0, cols.length - 1),
    note: '',
    color: palette[b.tasks.length % palette.length],
  });
  renderBriefing();
}
// ─── Planning installation / démontage ───
function addPlanningStep(slideIdx, bi) {
  const b = CURRENT_BRIEFING.slides[slideIdx].blocks[bi];
  if (!Array.isArray(b.steps)) b.steps = [];
  b.steps.push({ time: '', duration: '', description: '', responsible: '' });
  renderBriefing();
}

// Pré-remplit le planning à partir des dates du projet courant
// Génère un template d'étapes standard selon la phase (installation/démontage)
function addPlanningStepsFromProject(slideIdx, bi) {
  const b = CURRENT_BRIEFING.slides[slideIdx].blocks[bi];
  const p = BRIEFING_AUTO?.project || {};
  if (!Array.isArray(b.steps)) b.steps = [];

  // Format date+heure de la phase concernée
  const phaseDates = b.phase === 'dismantling'
    ? { start: p.dismantlingStart, end: p.dismantlingEnd, label: 'Démontage' }
    : { start: p.installationStart, end: p.installationEnd, label: 'Installation' };

  if (!phaseDates.start) {
    toast(`Pas de date de ${phaseDates.label.toLowerCase()} renseignée sur le projet`, 'warning');
    return;
  }

  const startDt = new Date(phaseDates.start);
  const dateLabel = startDt.toLocaleDateString('fr-FR', { weekday:'long', day:'2-digit', month:'long' });
  const startTime = startDt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });

  // On pré-remplit le libellé de date s'il est vide
  if (!b.dateLabel) b.dateLabel = dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1);

  // Template d'étapes selon la phase
  const templates = {
    installation: [
      { time: startTime, duration: '30 min', description: 'Arrivée sur site, briefing équipe', responsible: '' },
      { time: '',        duration: '1h',     description: 'Déchargement camions', responsible: '' },
      { time: '',        duration: '4h',     description: 'Montage structure principale', responsible: '' },
      { time: '',        duration: '1h',     description: 'Pause déjeuner', responsible: '' },
      { time: '',        duration: '3h',     description: 'Installation équipements / habillage', responsible: '' },
      { time: '',        duration: '1h',     description: 'Tests + ajustements', responsible: '' },
      { time: '',        duration: '30 min', description: 'Nettoyage chantier + briefing fin de journée', responsible: '' },
    ],
    dismantling: [
      { time: startTime, duration: '30 min', description: 'Arrivée sur site, briefing équipe', responsible: '' },
      { time: '',        duration: '2h',     description: 'Démontage équipements', responsible: '' },
      { time: '',        duration: '3h',     description: 'Démontage structure principale', responsible: '' },
      { time: '',        duration: '1h',     description: 'Pause déjeuner', responsible: '' },
      { time: '',        duration: '2h',     description: 'Chargement camions', responsible: '' },
      { time: '',        duration: '30 min', description: 'Nettoyage final + état des lieux', responsible: '' },
    ],
    event: [
      { time: startTime, duration: '',       description: 'Ouverture événement', responsible: '' },
      { time: '',        duration: '',       description: 'Surveillance technique', responsible: '' },
      { time: '',        duration: '',       description: 'Fermeture événement', responsible: '' },
    ],
  };

  const template = templates[b.phase] || templates.installation;
  b.steps = template;
  renderBriefing();
  toast(`Planning ${phaseDates.label} pré-rempli — adapte les horaires à ton chantier`, 'success');
}

// ─── Contacts ───
function addContact(slideIdx, bi) {
  const b = CURRENT_BRIEFING.slides[slideIdx].blocks[bi];
  b.contacts = b.contacts || [];
  b.contacts.push({ name:'', role:'', phone:'', email:'' });
  renderBriefing();
}

function addContactFromUser(slideIdx, bi) {
  const sel = document.getElementById(`brf-pick-user-${slideIdx}-${bi}`);
  const userId = sel?.value;
  if (!userId) return;
  const u = (USERS||[]).find(x=>x.id===userId);
  if (!u) return;
  const b = CURRENT_BRIEFING.slides[slideIdx].blocks[bi];
  b.contacts = b.contacts || [];
  b.contacts.push({ name: `${u.firstName} ${u.lastName}`, role: u.role||'', phone: u.phone||'', email: u.email||'' });
  renderBriefing();
}

function removeContact(slideIdx, bi, ci) {
  CURRENT_BRIEFING.slides[slideIdx].blocks[bi].contacts.splice(ci, 1);
  renderBriefing();
}

// ─── Photos / PDF ───
async function uploadBriefPhotos(slideIdx, bi, files) {
  if (!files?.length) return;
  toast(`Upload de ${files.length} fichier(s)...`, 'info');
  const b = CURRENT_BRIEFING.slides[slideIdx].blocks[bi];
  b.photos = b.photos || [];
  for (const f of files) {
    const fd = new FormData(); fd.append('file', f);
    try {
      const r = await fetch(API + '/upload/photo', { method:'POST', headers:{ 'Authorization': `Bearer ${TOKEN}` }, body: fd });
      const j = await r.json();
      if (j?.success && j.data?.url) b.photos.push({ url: j.data.url, caption: f.name });
    } catch(e) { /* fichier ignoré */ }
  }
  toast('Upload terminé', 'success');
  renderBriefing();
}

function removeBriefPhoto(slideIdx, bi, pi) {
  CURRENT_BRIEFING.slides[slideIdx].blocks[bi].photos.splice(pi, 1);
  renderBriefing();
}

// ─── Enregistrement ───
async function saveBriefing() {
  if (!CURRENT_BRIEFING || !CURRENT_BRIEFING.id) return;
  const t = document.getElementById('brf-title'); if (t) CURRENT_BRIEFING.title = t.value;
  const res = await api('PATCH', `/briefings/${CURRENT_BRIEFING.id}`, { title: CURRENT_BRIEFING.title, slides: CURRENT_BRIEFING.slides });
  if (res?.success) toast('Briefing enregistré ✅', 'success');
  else toast('Erreur enregistrement', 'error');
}

// ─── Impression ───
async function printBriefing() {
  if (!CURRENT_BRIEFING || !CURRENT_PROJECT_ID) return;
  await saveBriefing();
  const projRes = await api('GET', `/projects/${CURRENT_PROJECT_ID}`);
  const proj = projRes?.data || {};

  const fmt = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '—';
  const fmtDate = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';
  const esc = x => (x==null?'':String(x)).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  const renderBlockPrint = b => {
    if (b.type === 'text') {
      return `<div style="white-space:pre-wrap;font-size:14px;line-height:1.5;margin:8px 0;">${esc(b.content)}</div>`;
    }
    if (b.type === 'contacts') {
      const rows = (b.contacts||[]).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.role)}</td><td>${esc(c.phone)}</td><td>${esc(c.email)}</td></tr>`).join('');
      return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;"><thead><tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px;">Nom</th><th style="text-align:left;padding:6px;">Rôle</th><th style="text-align:left;padding:6px;">Téléphone</th><th style="text-align:left;padding:6px;">Email</th></tr></thead><tbody>${rows||'<tr><td colspan="4" style="text-align:center;padding:10px;color:#888;">Aucun contact</td></tr>'}</tbody></table>`;
    }
    if (b.type === 'tasks') {
      const rows = (BRIEFING_AUTO.tasks||[]).map(t=>`<tr><td>${esc(t.title)}</td><td>${esc(t.status)}</td><td>${esc(t.priority)}</td><td>${fmtDate(t.taskDate)}</td></tr>`).join('');
      return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;"><thead><tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px;">Tâche</th><th style="text-align:left;padding:6px;">Statut</th><th style="text-align:left;padding:6px;">Priorité</th><th style="text-align:left;padding:6px;">Date</th></tr></thead><tbody>${rows||'<tr><td colspan="4" style="text-align:center;padding:10px;color:#888;">Aucune tâche</td></tr>'}</tbody></table>`;
    }
    if (b.type === 'trucks') {
      const rows = (BRIEFING_AUTO.trucks||[]).map(t=>`<tr><td>${esc(t.vehicleType||'truck')}</td><td>${esc(t.truckNumber)}</td><td>${esc(t.driverName)}${t.driverPhone?' · '+esc(t.driverPhone):''}</td><td>${fmt(t.loadingDate)}</td><td>${fmt(t.arrivalDate)}</td><td>${esc(t.status)}</td></tr>`).join('');
      return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;"><thead><tr style="background:#f0f0f0;"><th style="text-align:left;padding:6px;">Type</th><th style="text-align:left;padding:6px;">N°</th><th style="text-align:left;padding:6px;">Chauffeur</th><th style="text-align:left;padding:6px;">Chargement</th><th style="text-align:left;padding:6px;">Arrivée</th><th style="text-align:left;padding:6px;">Statut</th></tr></thead><tbody>${rows||'<tr><td colspan="6" style="text-align:center;padding:10px;color:#888;">Aucun véhicule</td></tr>'}</tbody></table>`;
    }
    if (b.type === 'project') {
      const p = BRIEFING_AUTO.project || {};
      const row = (lbl, val) => val ? `<tr><th style="text-align:left;padding:6px;background:#f8f9fa;color:#666;width:160px;">${lbl}</th><td style="padding:6px;">${val}</td></tr>` : '';
      const contact = (p.client?.contactName || p.client?.phone || p.client?.email)
        ? `${esc(p.client?.contactName)||''}${p.client?.phone?' · '+esc(p.client.phone):''}${p.client?.email?' · '+esc(p.client.email):''}` : '';
      return `<table style="width:100%;border-collapse:collapse;font-size:13px;margin:8px 0;border:1px solid #e5e7eb;">
        ${row('Projet',          esc(p.name))}
        ${row('N° interne',      esc(p.internalNumber))}
        ${row('Statut',          esc(p.status))}
        ${row('Client',          esc(p.client?.name))}
        ${row('Contact client',  contact)}
        ${row('Adresse',         `${esc(p.address)}${p.city?', '+esc(p.city):''}`)}
        ${row('Installation',    `${fmt(p.installationStart)} → ${fmt(p.installationEnd)}`)}
        ${p.dismantlingStart ? row('Démontage', `${fmt(p.dismantlingStart)} → ${fmt(p.dismantlingEnd)}`) : ''}
        ${row('Ouvriers prévus', esc(String(p.workersCount || 0)))}
        ${p.technicalManager ? row('Chef technique', esc(`${p.technicalManager.firstName} ${p.technicalManager.lastName}`)) : ''}
        ${row('Description',          esc(p.description))}
        ${row('Instructions spéciales', esc(p.specialInstructions))}
      </table>`;
    }
    if (b.type === 'photos') {
      // Pour chaque fichier : si PDF → on extrait jusqu'à 5 pages via Cloudinary en JPG
      const pdfPageUrl = (url, n) => url.includes('/upload/')
        ? url.replace('/upload/', `/upload/f_jpg,c_limit,w_1100,pg_${n}/`).replace(/\.pdf($|\?)/i, '.jpg$1')
        : url;
      const isPdf = u => /\.pdf($|\?)/i.test(u);
      const items = (b.photos||[]).map(p => {
        if (isPdf(p.url)) {
          // On rend les pages 1 à 15 en images (Cloudinary `pg_N/` transform).
          // Les pages au-delà du nombre réel produisent une img 404 qu'on masque via onerror.
          // 15 pages couvre la quasi-totalité des briefings techniques sans alourdir le PDF.
          const PAGES_TO_TRY = 15;
          const pages = Array.from({length: PAGES_TO_TRY}, (_, i) => i + 1)
            .map(n => `<img src="${pdfPageUrl(p.url, n)}" onerror="this.style.display='none';" style="max-width:100%;display:block;margin:8px auto;border:1px solid #ddd;page-break-inside:avoid;">`)
            .join('');
          return `<div style="margin:12px 0;">
            ${p.caption ? `<div style="font-size:12px;color:#666;margin-bottom:4px;"><strong>📄 ${esc(p.caption)}</strong></div>` : ''}
            ${pages}
          </div>`;
        }
        return `<div style="margin:12px 0;text-align:center;page-break-inside:avoid;">
          <img src="${p.url}" style="max-width:100%;max-height:520px;">
          ${p.caption ? `<div style="font-size:12px;color:#666;margin-top:6px;">${esc(p.caption)}</div>` : ''}
        </div>`;
      }).join('');
      return items || '<div style="color:#888;text-align:center;padding:10px;">Aucun fichier</div>';
    }
    if (b.type === 'location') {
      const mapsLink = b.address ? `<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}" target="_blank">${esc(b.address)}</a>` : '—';
      return `<div style="font-size:14px;line-height:1.6;margin:8px 0;"><div><strong>Adresse :</strong> ${mapsLink}</div>${b.stand?`<div><strong>Stand / hall :</strong> ${esc(b.stand)}</div>`:''}${b.notes?`<div style="margin-top:8px;white-space:pre-wrap;">${esc(b.notes)}</div>`:''}</div>`;
    }
    if (b.type === 'planning') {
      const phaseLabels = {
        installation: '🏗️ Planning d\'installation',
        dismantling:  '🔨 Planning de démontage',
        event:        '🎉 Jour de l\'événement',
        preprod:      '📦 Pré-production / Atelier',
        custom:       '📅 Planning',
      };
      const phaseLabel = phaseLabels[b.phase] || phaseLabels.custom;
      const steps = (b.steps || []).filter(s => s.time || s.description);
      if (steps.length === 0) {
        return `<div style="margin:8px 0;font-size:13px;color:#666;font-style:italic;">${phaseLabel}${b.dateLabel?' — '+esc(b.dateLabel):''} : aucune étape renseignée</div>`;
      }
      const rows = steps.map(s => `
        <tr>
          <td style="font-weight:700;font-family:monospace;color:#1a1a2e;width:80px;">${esc(s.time||'')}</td>
          <td style="color:#666;font-size:12px;width:70px;">${esc(s.duration||'')}</td>
          <td>${esc(s.description||'')}</td>
          <td style="color:#888;font-size:12px;">${esc(s.responsible||'')}</td>
        </tr>`).join('');
      return `
        <div style="margin:14px 0;">
          <div style="font-weight:700;color:#1a1a2e;font-size:14px;margin-bottom:8px;">
            ${phaseLabel}${b.dateLabel?` — <span style="color:#666;font-weight:400;">${esc(b.dateLabel)}</span>`:''}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead>
              <tr style="background:#f8f8f8;">
                <th style="text-align:left;">Heure</th>
                <th style="text-align:left;">Durée</th>
                <th style="text-align:left;">Étape</th>
                <th style="text-align:left;">Responsable</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }
    return '';
  };

  const renderSlide = s => {
    const title = s.title ? `<h2 style="margin:0 0 12px;border-bottom:2px solid #333;padding-bottom:6px;">${esc(s.title)}</h2>` : '';
    const blocksHtml = (s.blocks||[]).map(renderBlockPrint).join('');
    return title + (blocksHtml || '<div style="color:#888;text-align:center;padding:20px;">Slide vide</div>');
  };

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Briefing — ${esc(proj.name||'')}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      body { font-family: -apple-system, sans-serif; color:#222; }
      .slide { page-break-after: always; padding: 12px 0; }
      .slide:last-child { page-break-after: auto; }
      h1 { font-size: 26px; margin: 0 0 4px; }
      h2 { font-size: 18px; }
      table th, table td { border-bottom:1px solid #ddd; padding:6px; vertical-align:top; }
      .meta { color:#666; font-size:13px; margin-bottom: 18px; }
      .cover { text-align:center; padding-top: 80px; }
    </style></head><body>
    <div class="slide cover">
      <img src="/logo.png" alt="VIEWBOX" style="width:280px;height:auto;margin-bottom:30px;">
      <h1>📋 ${esc(CURRENT_BRIEFING.title || 'Briefing')}</h1>
      <div class="meta">${esc(proj.name||'')}${proj.city?' — '+esc(proj.city):''}<br>${proj.installationStart?fmt(proj.installationStart):''}</div>
    </div>
    ${(CURRENT_BRIEFING.slides||[]).map(s => `<div class="slide">${renderSlide(s)}</div>`).join('')}
    <script>setTimeout(()=>window.print(), 400);<\/script>
    </body></html>`;
  const w = window.open('', '_blank');
  w.document.open(); w.document.write(html); w.document.close();
}

// ─── Bloc Photos : piocher dans les fichiers déjà uploadés dans le projet ───
// Évite de re-uploader un PDF/image qui existe déjà dans /projects/:id/files
async function openPickFromProjectFiles(slideIdx, bi) {
  if (!CURRENT_PROJECT_ID) return;
  const res = await api('GET', `/projects/${CURRENT_PROJECT_ID}/files`);
  if (!res?.success) { toast('Impossible de récupérer les fichiers du projet', 'error'); return; }
  // On ne propose que photos + PDF (les autres formats n'ont pas leur place dans le briefing)
  const files = (res.data || []).filter(f => {
    const ext = (f.fileName || f.fileUrl || '').split('.').pop().toLowerCase();
    return ['jpg','jpeg','png','gif','webp','heic','pdf'].includes(ext);
  });

  // IDs déjà sélectionnés dans le bloc (pour éviter les doublons)
  const already = new Set(((CURRENT_BRIEFING.slides[slideIdx].blocks[bi].photos) || []).map(p => p.url));

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:760px;">
      <div class="modal-head">
        <div class="modal-title">📁 Fichiers du projet — Sélectionner pour le briefing</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <input id="pkf-search" class="input" placeholder="🔎 Rechercher par nom..." style="margin-bottom:10px;" oninput="filterPickFilesList(this.value)">

      <div id="pkf-files-list" style="max-height:60vh;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;background:var(--bg3);">
        ${files.length === 0 ? '<div style="text-align:center;color:var(--text3);padding:20px;font-size:13px;">Aucun fichier image ou PDF dans ce projet.<br>Uploade d\'abord des fichiers dans l\'onglet Infos.</div>' : ''}
        ${files.map((f, i) => {
          const isImage = !(f.fileName||'').toLowerCase().endsWith('.pdf');
          const checked = already.has(f.fileUrl) ? 'checked disabled' : '';
          const note = already.has(f.fileUrl) ? '<span style="color:var(--green);font-size:11px;">déjà ajouté</span>' : '';
          return `
            <label class="pkf-row" data-name="${esc(f.fileName||'')}" style="display:flex;align-items:center;gap:10px;padding:8px;border-radius:6px;cursor:pointer;border-bottom:1px solid var(--border);">
              <input type="checkbox" class="pkf-cb" value="${i}" data-url="${esc(f.fileUrl)}" data-name="${esc(f.fileName||'')}" ${checked} style="accent-color:var(--accent);width:18px;height:18px;flex-shrink:0;">
              ${isImage
                ? `<img src="${f.fileUrl}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0;">`
                : `<div style="width:48px;height:48px;background:var(--bg2);border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;">📄</div>`}
              <div style="flex:1;min-width:0;">
                <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.fileName||'Fichier')}</div>
                <div style="font-size:11px;color:var(--text3);">${isImage?'Image':'PDF'} ${f.fileSize?'· '+Math.round(f.fileSize/1024)+' KB':''}</div>
              </div>
              ${note}
            </label>`;
        }).join('')}
      </div>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;gap:8px;flex-wrap:wrap;">
        <div id="pkf-count" style="font-size:12px;color:var(--text3);">0 sélectionné(s)</div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
          <button class="btn btn-primary" onclick="submitPickFiles(${slideIdx},${bi},this.closest('.overlay'))">✅ Ajouter au briefing</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  // Compteur live
  overlay.querySelectorAll('.pkf-cb').forEach(cb => cb.addEventListener('change', () => {
    const n = overlay.querySelectorAll('.pkf-cb:checked:not(:disabled)').length;
    overlay.querySelector('#pkf-count').textContent = `${n} fichier(s) à ajouter`;
  }));
}

// Filtre live dans la modal de sélection des fichiers projet
function filterPickFilesList(q) {
  q = (q || '').toLowerCase().trim();
  document.querySelectorAll('.pkf-row').forEach(row => {
    const name = (row.dataset.name || '').toLowerCase();
    row.style.display = !q || name.includes(q) ? '' : 'none';
  });
}

// Submit : ajoute les fichiers cochés au bloc photos du briefing
function submitPickFiles(slideIdx, bi, overlay) {
  const block = CURRENT_BRIEFING.slides[slideIdx].blocks[bi];
  if (!block.photos) block.photos = [];
  let added = 0;
  overlay.querySelectorAll('.pkf-cb:checked:not(:disabled)').forEach(cb => {
    block.photos.push({ url: cb.dataset.url, caption: cb.dataset.name || '' });
    added++;
  });
  if (added === 0) { toast('Aucun fichier sélectionné', 'warning'); return; }
  toast(`${added} fichier(s) ajouté(s)`, 'success');
  overlay.remove();
  renderBriefing();
}

// ─── Bloc Contacts : piocher dans les clients enregistrés ───
// Permet d'ajouter rapidement un contact client (nom du contact, email, téléphone)
// sans avoir à les taper à la main.
