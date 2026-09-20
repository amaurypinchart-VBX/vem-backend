// ═══════════════════════════════════════════════════════
// CONFIG — change cette URL si ton domaine Railway change
// ═══════════════════════════════════════════════════════
const API = window.location.origin + '/api/v1';

// ═══ HELPER UTILITAIRE — échappement HTML ═══
// Utilisé partout dans le code pour empêcher l'injection XSS depuis les noms
// d'utilisateurs/clients/projets (innerHTML accepte du HTML brut, donc tout
// caractère < > & " ' qui vient d'une saisie utilisateur doit être encodé).
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// ═══════════════════════════════════════════════════════════════
// Choix de langue pour les PDFs (FR/EN) — modal de sélection
// ═══════════════════════════════════════════════════════════════
function pickPdfLang() {
  return new Promise(resolve => {
    const el = document.createElement('div');
    el.className = 'overlay open';
    el.style.zIndex = '100000';
    el.innerHTML = `
      <div class="modal" style="max-width:360px;">
        <div class="modal-head">
          <div class="modal-title">📄 Langue du PDF</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;padding:8px 0 4px;">
          <button class="btn btn-primary" data-lang="fr" style="padding:14px;font-size:14px;">🇫🇷 Français</button>
          <button class="btn btn-primary" data-lang="en" style="padding:14px;font-size:14px;">🇬🇧 English</button>
          <button class="btn btn-ghost"   data-lang=""   style="margin-top:4px;">Annuler</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el) { el.remove(); resolve(null); return; }
      const btn = e.target.closest('button[data-lang]');
      if (!btn) return;
      el.remove();
      resolve(btn.dataset.lang || null);
    });
  });
}

// Télécharge un PDF avec choix de langue — générique pour handover/daily-report
async function downloadPdfWithLang(endpoint, filenameHint) {
  const lang = await pickPdfLang();
  if (!lang) return;
  try {
    const r = await fetch(`${endpoint}?lang=${lang}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (filenameHint || 'document') + `_${lang}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('PDF téléchargé ✅', 'success');
  } catch (e) {
    console.error('[pdf download]', e);
    toast('Erreur génération PDF', 'error');
  }
}

// Wrappers spécifiques pour chaque type
async function downloadHandoverPdf(id) {
  return downloadPdfWithLang(`/api/v1/handover/${id}/pdf`, `Handover_${id.slice(0,8)}`);
}
async function downloadDailyReportPdf(id) {
  return downloadPdfWithLang(`/api/v1/daily-reports/${id}/pdf`, `DailyReport_${id.slice(0,8)}`);
}
async function downloadProjectReportPdf(id) {
  return downloadPdfWithLang(`/api/v1/projects/${id}/report/pdf`, `Rapport_${id.slice(0,8)}`);
}
// ═══ VIEWER FICHIER UNIVERSEL ═══════════════════════════════════════
// Ouvre une modale pleine taille avec le visualiseur adapté au type de fichier :
//   - Image (jpg, png, webp, gif...) → affichage plein écran avec fond noir
//   - PDF                            → iframe avec contrôles du navigateur
//   - 3D (glb, gltf, usdz)           → composant <model-viewer> de Google (charge auto)
//   - SketchUp (.skp)                → message expliquant qu'il faut exporter en GLB
//   - Autre                          → téléchargement
//
// Utilisé par openPhotoViewer (alias) et appelé au clic sur les cartes
// de fichiers dans la page Infos du projet.
// ─────────────────────────────────────────────────────────────────
// Ouvrir un fichier 3D dans le viewer dédié (avec mesures + photos)
// Le viewer est servi à /viewer3d.html et accepte les params :
//   modelUrl, projectId, projectName, token
// Les photos prises dans le viewer peuvent être sauvegardées sur le projet
// via le bouton "💾 Sauver sur VEM" (intégration par vem-3d-integration.js).
// ─────────────────────────────────────────────────────────────────
function openIn3DViewer(modelUrl, fileName, projectId) {
  const proj = PROJECTS?.find(p => p.id === projectId);
  const projectName = proj?.name || '';
  const url = '/viewer3d.html'
    + '?modelUrl='    + encodeURIComponent(modelUrl)
    + '&projectId='   + encodeURIComponent(projectId || '')
    + '&projectName=' + encodeURIComponent(projectName)
    + '&token='       + encodeURIComponent(TOKEN || '');
  window.open(url, '_blank');
}

async function openFileViewer(url, filename) {
  filename = filename || url.split('/').pop() || 'Fichier';
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const isImg = ['jpg','jpeg','png','gif','webp','svg','bmp','heic'].includes(ext);
  const isPDF = ext === 'pdf';
  const is3DSupported   = ['glb','gltf','usdz'].includes(ext);
  const is3DUnsupported = ['skp','fbx','3ds','blend'].includes(ext);

  // Pour les formats supportés par notre viewer 3D dédié (avec mesures + photos),
  // on ouvre directement notre viewer dans un nouvel onglet plutôt que le component
  // <model-viewer> de Google qui est plus basique et plante avec certaines compressions.
  // Un .zip est inclus : il peut contenir un modèle DAE/glTF/OBJ + ses textures
  // (empaqueté automatiquement à l'upload, ou zippé manuellement) — le viewer le
  // dézippe lui-même à l'ouverture et affiche une erreur claire si rien d'exploitable.
  const supportedByOurViewer = ['glb','gltf','stl','obj','dae','zip'].includes(ext);
  if (supportedByOurViewer && CURRENT_PROJECT_ID) {
    openIn3DViewer(url, filename, CURRENT_PROJECT_ID);
    return;
  }

  // Supprimer un éventuel viewer ouvert (évite l'accumulation)
  document.querySelectorAll('.overlay.file-viewer-overlay').forEach(o => o.remove());

  const overlay = document.createElement('div');
  overlay.className = 'overlay open file-viewer-overlay';
  overlay.style.padding = '0';

  // ─── IMAGE ───
  if (isImg) {
    overlay.innerHTML = `
      <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#000;">
        <img src="${url}" style="max-width:96vw;max-height:92vh;object-fit:contain;border-radius:6px;box-shadow:0 8px 40px rgba(0,0,0,.6);">
        <button onclick="this.closest('.overlay').remove()" style="position:absolute;top:14px;right:14px;background:rgba(0,0,0,.6);color:#fff;border:none;width:40px;height:40px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">×</button>
        <a href="${url}" download="${esc(filename)}" target="_blank" style="position:absolute;bottom:14px;right:14px;background:rgba(0,0,0,.6);color:#fff;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:13px;">⬇️ Télécharger</a>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return;
  }

  // ─── PDF ───
  if (isPDF) {
    overlay.innerHTML = `
      <div class="modal" style="max-width:1100px;width:96vw;height:92vh;display:flex;flex-direction:column;padding:0;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--border);">
          <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;"><span>📄</span><span>${esc(filename)}</span></div>
          <div style="display:flex;gap:8px;align-items:center;">
            <a href="${url}" download="${esc(filename)}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:12px;">⬇️ Télécharger</a>
            <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
          </div>
        </div>
        <iframe src="${url}#toolbar=1&view=FitH" style="flex:1;width:100%;border:none;background:#525659;"></iframe>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return;
  }

  // ─── 3D — formats supportés par model-viewer (GLB / glTF / USDZ) ───
  if (is3DSupported) {
    overlay.innerHTML = `
      <div class="modal" style="max-width:1100px;width:96vw;height:92vh;display:flex;flex-direction:column;padding:0;overflow:hidden;">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--bg2);border-bottom:1px solid var(--border);">
          <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px;"><span>🎨</span><span>${esc(filename)}</span></div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span style="font-size:11px;color:var(--text3);">Pinçer/Molette : zoom · Glisser : tourner</span>
            <a href="${url}" download="${esc(filename)}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:12px;">⬇️ Télécharger</a>
            <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
          </div>
        </div>
        <div id="mv-container" style="flex:1;background:linear-gradient(180deg,#3a3a44,#1a1a22);display:flex;align-items:center;justify-content:center;color:#888;">
          <span>Chargement du visualiseur 3D...</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Chargement lazy de model-viewer (≈ 130 KB, on l'évite tant qu'on n'en a pas besoin)
    if (!window._mvLoaded) {
      const s = document.createElement('script');
      s.type = 'module';
      s.src = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
      document.head.appendChild(s);
      window._mvLoaded = true;
    }
    try { await customElements.whenDefined('model-viewer'); } catch (e) {}
    const container = overlay.querySelector('#mv-container');
    if (container) {
      container.innerHTML = `
        <model-viewer src="${url}" style="width:100%;height:100%;background:transparent;"
          camera-controls touch-action="pan-y" auto-rotate auto-rotate-delay="2000"
          shadow-intensity="1" exposure="1" environment-image="neutral"
          ar ar-modes="webxr scene-viewer quick-look">
          <div slot="poster" style="display:flex;align-items:center;justify-content:center;color:#aaa;">Chargement du modèle...</div>
        </model-viewer>`;
    }
    return;
  }

  // ─── 3D non supporté nativement (SketchUp, OBJ, FBX, STL, etc.) ───
  if (is3DUnsupported) {
    const help = ext === 'skp'
      ? 'Pour visualiser ce fichier SketchUp ici, exporte-le en <strong>glTF / GLB</strong> depuis SketchUp :<br>1. Ouvre le fichier dans SketchUp<br>2. Menu <em>Fichier → Exporter → 3D Model</em><br>3. Choisis le format <strong>glTF (.glb)</strong><br>4. Reupload ici → visualisation instantanée'
      : `Le format <strong>.${ext.toUpperCase()}</strong> n'est pas visualisable directement dans le navigateur.<br>Convertis-le en <strong>GLB / glTF</strong> (ex. via <a href="https://anyconv.com/${ext}-to-glb-converter/" target="_blank" style="color:var(--blue);">anyconv.com</a> ou <a href="https://www.makesweet.com/cards/3d-cards/converter" target="_blank" style="color:var(--blue);">makesweet</a>) puis reupload.`;
    overlay.innerHTML = `
      <div class="modal" style="max-width:560px;width:90vw;">
        <div class="modal-head">
          <div class="modal-title">🎨 Fichier 3D — ${esc(filename)}</div>
          <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
        </div>
        <div style="background:var(--bg3);border-radius:10px;padding:18px;font-size:13px;line-height:1.6;">
          ${help}
        </div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
          <a href="${url}" download="${esc(filename)}" target="_blank" class="btn btn-outline">⬇️ Télécharger</a>
          <button class="btn btn-primary" onclick="this.closest('.overlay').remove()">OK</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return;
  }

  // ─── Tout autre type : on ouvre dans un nouvel onglet (téléchargement implicite) ───
  window.open(url, '_blank');
}

// Alias rétrocompatible — beaucoup d'endroits dans l'app appellent openPhotoViewer
function openPhotoViewer(url, filename) { return openFileViewer(url, filename); }

// ═══ STATE ═══
let TOKEN = localStorage.getItem('vem_token') || sessionStorage.getItem('vem_token') || '';
let CURRENT_USER = JSON.parse(localStorage.getItem('vem_user') || sessionStorage.getItem('vem_user') || 'null');
let PROJECTS = [];
let USERS = [];
let CLIENTS = [];
let CURRENT_PROJECT_ID = null;
// Mode édition du modal de projet : null = création, string = ID du projet en cours d'édition
let EDITING_PROJECT_ID = null;

// ═══ API HELPER ═══
async function api(method, path, body) {
  try {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(API + path, opts);
    const data = await r.json();
    if (r.status === 401) { doLogout(); return null; }
    return data;
  } catch(e) {
    toast('Erreur réseau', 'error');
    return null;
  }
}

// ═══ LOGIN ═══
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pwd   = document.getElementById('login-pwd').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');

  if (!email || !pwd) { err.style.display='block'; err.textContent='Remplis tous les champs'; return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> Connexion...';
  err.style.display = 'none';

  const res = await api('POST', '/auth/login', { email, password: pwd });

  if (res && res.success) {
    TOKEN = res.data.token;
    CURRENT_USER = res.data.user;
    localStorage.setItem('vem_token', TOKEN);
    localStorage.setItem('vem_user', JSON.stringify(CURRENT_USER));
    btn.disabled = false;
    btn.innerHTML = 'Se connecter';
    if (res.data.user.mustChangePassword) {
      forcePasswordChange(pwd);   // pwd = mot de passe temporaire saisi
    } else {
      showApp();
    }
  } else {
    err.style.display = 'block';
    err.textContent = res?.error || 'Email ou mot de passe incorrect';
    btn.disabled = false;
    btn.innerHTML = 'Se connecter';
  }
}

document.getElementById('login-pwd').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });

// Changement de mot de passe forcé après connexion avec un mot de passe temporaire
function forcePasswordChange(tempPwd) {
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:9999;';
  el.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:32px;width:90%;max-width:420px;box-shadow:0 32px 80px rgba(0,0,0,.6);">
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;margin-bottom:6px;">🔐 Choisissez votre mot de passe</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:20px;">Votre accès était temporaire. Définissez maintenant votre mot de passe personnel.</div>
      <div class="form-group">
        <label class="form-label">Nouveau mot de passe (8 caractères min)</label>
        <input class="form-input" type="password" id="force-pwd-new" autocomplete="new-password">
      </div>
      <div class="form-group">
        <label class="form-label">Confirmer</label>
        <input class="form-input" type="password" id="force-pwd-confirm" autocomplete="new-password">
      </div>
      <div id="force-pwd-err" style="display:none;color:var(--accent);font-size:13px;margin-bottom:10px;"></div>
      <button class="login-btn" id="force-pwd-btn" onclick="submitForcePassword('${tempPwd.replace(/'/g,"\\'")}')">💾 Valider</button>
    </div>`;
  document.body.appendChild(el);
  setTimeout(() => document.getElementById('force-pwd-new')?.focus(), 100);
}

async function submitForcePassword(tempPwd) {
  const next    = document.getElementById('force-pwd-new').value;
  const confirm = document.getElementById('force-pwd-confirm').value;
  const errEl   = document.getElementById('force-pwd-err');
  const btn     = document.getElementById('force-pwd-btn');
  const showErr = m => { errEl.style.display='block'; errEl.textContent=m; };

  if (next.length < 8)    return showErr('Au moins 8 caractères.');
  if (next !== confirm)   return showErr('Les mots de passe ne correspondent pas.');
  if (next === tempPwd)   return showErr('Choisissez un mot de passe différent du temporaire.');

  btn.disabled = true; btn.innerHTML = '<span class="loader"></span> Validation...';
  const res = await api('POST', '/auth/change-password', { currentPassword: tempPwd, newPassword: next });
  if (res?.success) {
    if (CURRENT_USER) { delete CURRENT_USER.mustChangePassword; localStorage.setItem('vem_user', JSON.stringify(CURRENT_USER)); }
    document.querySelector('.overlay.open')?.remove();
    toast('Mot de passe défini ✅', 'success');
    showApp();
  } else {
    showErr(res?.error || 'Erreur — le mot de passe temporaire a peut-être expiré.');
    btn.disabled = false; btn.innerHTML = '💾 Valider';
  }
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
  updateNavUser();
  ensureAssistantWidget();
  loadAll();
  goto('dashboard');
}

// ═══════════════════════════════════════════════════════════
// 🤖 ASSISTANT IA — panneau flottant. Réservé aux rôles pilotage (miroir de la
// restriction serveur sur /assistant). Peut désormais aussi créer des choses
// (projet, camion, booking hôtel, tâche, ticket...) après confirmation
// conversationnelle, et générer un rapport complet de projet (texte + PDF).
// ASSISTANT_HISTORY garde les derniers échanges pour que l'assistant se
// souvienne d'un récapitulatif proposé au tour précédent avant de confirmer.
// ═══════════════════════════════════════════════════════════
const ASSISTANT_ROLES = ['admin', 'project_manager', 'technical_manager', 'site_manager'];
let ASSISTANT_HISTORY = [];

function ensureAssistantWidget() {
  if (document.getElementById('assistant-widget')) return;
  if (!CURRENT_USER || !ASSISTANT_ROLES.includes(CURRENT_USER.role)) return;

  const wrap = document.createElement('div');
  wrap.id = 'assistant-widget';
  wrap.innerHTML = `
    <button id="assistant-fab" onclick="toggleAssistantPanel()" title="Assistant IA"
      style="position:fixed;bottom:24px;right:24px;width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;border:none;font-size:22px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);z-index:9000;">🤖</button>
    <div id="assistant-panel" style="display:none;flex-direction:column;position:fixed;bottom:88px;right:24px;width:340px;max-width:calc(100vw - 32px);height:440px;max-height:calc(100vh - 120px);background:var(--bg2);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.3);overflow:hidden;z-index:9000;">
      <div style="padding:10px 14px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;font-weight:600;font-size:13px;">
        <span>🤖 Assistant VEM</span>
        <button onclick="toggleAssistantPanel()" style="background:none;border:none;font-size:16px;cursor:pointer;color:var(--text3);">×</button>
      </div>
      <div id="assistant-messages" style="flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px;font-size:13px;">
        <div style="align-self:flex-start;color:var(--text3);font-size:12px;font-style:italic;">Pose une question, demande de créer un projet/camion/booking hôtel/tâche/ticket, ou demande un rapport complet sur un projet...</div>
      </div>
      <div style="padding:8px;border-top:1px solid var(--border);display:flex;gap:6px;">
        <input id="assistant-input" class="input" placeholder="Pose ta question…" style="flex:1;font-size:13px;" onkeydown="if(event.key==='Enter')sendAssistantQuestion()">
        <button class="btn btn-primary btn-sm" id="assistant-send-btn" onclick="sendAssistantQuestion()">➤</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
}

function toggleAssistantPanel() {
  const panel = document.getElementById('assistant-panel');
  if (!panel) return;
  const opening = panel.style.display === 'none';
  panel.style.display = opening ? 'flex' : 'none';
  if (opening) document.getElementById('assistant-input')?.focus();
}

function renderAssistantMessage(role, text) {
  const box = document.getElementById('assistant-messages');
  if (!box) return null;
  const bubble = document.createElement('div');
  bubble.style.cssText = role === 'user'
    ? 'align-self:flex-end;background:var(--accent);color:#fff;padding:8px 12px;border-radius:12px 12px 2px 12px;max-width:85%;white-space:pre-wrap;'
    : 'align-self:flex-start;background:var(--bg3);padding:8px 12px;border-radius:12px 12px 12px 2px;max-width:85%;white-space:pre-wrap;';
  bubble.textContent = text;
  box.appendChild(bubble);
  box.scrollTop = box.scrollHeight;
  return bubble;
}

// Ajoute un bouton "Télécharger le PDF" sous une réponse quand l'assistant
// vient de générer un rapport complet de projet (generate_project_report).
function renderAssistantReportButton(projectId) {
  const box = document.getElementById('assistant-messages');
  if (!box) return;
  const wrap = document.createElement('div');
  wrap.style.cssText = 'align-self:flex-start;';
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm btn-ghost';
  btn.style.cssText = 'font-size:12px;';
  btn.textContent = '📄 Télécharger le PDF';
  btn.onclick = () => downloadProjectReportPdf(projectId);
  wrap.appendChild(btn);
  box.appendChild(wrap);
  box.scrollTop = box.scrollHeight;
}

async function sendAssistantQuestion() {
  const input = document.getElementById('assistant-input');
  const question = (input?.value || '').trim();
  if (!question) return;
  input.value = '';
  renderAssistantMessage('user', question);
  const loadingBubble = renderAssistantMessage('assistant', '…');
  const btn = document.getElementById('assistant-send-btn');
  if (btn) btn.disabled = true;

  const res = await api('POST', '/assistant/ask', { question, history: ASSISTANT_HISTORY });

  if (btn) btn.disabled = false;
  const answer = res?.success ? res.data.answer : (res?.error || "Erreur de l'assistant");
  if (loadingBubble) loadingBubble.textContent = answer;

  if (res?.success) {
    ASSISTANT_HISTORY.push({ role: 'user', text: question });
    ASSISTANT_HISTORY.push({ role: 'assistant', text: answer });
    ASSISTANT_HISTORY = ASSISTANT_HISTORY.slice(-12);
    if (res.data.reportProjectId) renderAssistantReportButton(res.data.reportProjectId);
  }
}

function doLogout() {
  TOKEN = '';
  CURRENT_USER = null;
  ASSISTANT_HISTORY = [];
  localStorage.removeItem('vem_token');
  localStorage.removeItem('vem_user');
  document.getElementById('app-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'block';
  document.getElementById('login-error').style.display = 'none';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn').innerHTML = 'Se connecter';
  closeAllDropdowns();
}

function updateNavUser() {
  if (!CURRENT_USER) return;
  const name = `${CURRENT_USER.firstName} ${CURRENT_USER.lastName}`;
  const initials = (CURRENT_USER.firstName[0] + CURRENT_USER.lastName[0]).toUpperCase();
  const roles = { admin:'Admin', project_manager:'Chef Projet', site_manager:'Site Manager', technical_manager:'Tech. Manager', engineer:'Engineer', worker:'Ouvrier', client:'Client' };

  document.getElementById('nav-user-name').textContent = name;
  document.getElementById('nav-user-role').textContent = roles[CURRENT_USER.role] || CURRENT_USER.role;
  document.getElementById('nav-avatar-initials').textContent = initials;
  document.getElementById('topbar-avatar').textContent = initials;
  document.getElementById('dash-greeting').textContent = `Bonjour, ${CURRENT_USER.firstName} 👋`;

  const now = new Date();
  document.getElementById('dash-date').textContent = now.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ═══ NAVIGATION ═══
const pgTitles = {
  dashboard:'Dashboard', projects:'Projets', tasks:'Tâches', daily:'Daily Reports',
  handover:'Handover', remarks:'Visites Client', tickets:'Tickets SAV',
  warehouse:'Entrepôt / Box', toolbox:'Boîtes à Outils', team:'Équipe',
  notifs:'Notifications', 'project-detail':'Détail Projet'
};

// ─── Bascule de la sidebar (mode collapsed / expanded) ───
// Persistant via localStorage pour que le choix de l'utilisateur soit gardé
// entre les sessions. La transition CSS est de 250ms.
function toggleNav() {
  document.body.classList.toggle('nav-collapsed');
  localStorage.setItem('vem_nav_collapsed', document.body.classList.contains('nav-collapsed') ? '1' : '0');
}
// Restauration de l'état au chargement (si l'utilisateur l'avait replié)
(function initNavState() {
  if (localStorage.getItem('vem_nav_collapsed') === '1') {
    // On utilise un setTimeout pour que le body existe au moment où on ajoute la classe
    if (document.body) document.body.classList.add('nav-collapsed');
    else document.addEventListener('DOMContentLoaded', () => document.body.classList.add('nav-collapsed'));
  }
})();

// Copie dans le presse-papiers les instructions d'envoi par mail pour un projet
function copyEmailInstructions(internalNumber) {
  const text = `À: warehouseviewbox@gmail.com\nSujet: ${internalNumber}\n\n(Joindre les fichiers à envoyer dans le projet ${internalNumber})`;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(
      () => toast('Instructions copiées 📋', 'success'),
      () => toast('Impossible de copier — copie manuelle nécessaire', 'error'),
    );
  } else {
    toast('Sujet à mettre : ' + internalNumber, 'info');
  }
}

function goto(page) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('pg-' + page);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('onclick')?.includes("'" + page + "'")) item.classList.add('active');
  });
  document.getElementById('pg-title').textContent = pgTitles[page] || page;
  document.getElementById('nav').classList.remove('open');
  closeAllDropdowns();
  window.scrollTo(0,0);

  if (page === 'projects')  { loadAll().then(() => filterProjects()); }
  if (page === 'tasks')     loadTasks();
  if (page === 'tickets')   loadTickets();
  if (page === 'warehouse') loadWarehouse();
  if (page === 'toolbox')   loadToolboxes();
  if (page === 'team')      loadTeam();
  if (page === 'notifs')    loadNotifs();
  if (page === 'daily')     loadDailyReports();
  if (page === 'handover')  loadHandovers();
  if (page === 'clients')   loadClientsPage();
  if (page === 'templates') loadTemplatesPage();
  if (page === 'remarks')   {} // loaded per project
  // Update bottom nav
  const bnMap = { dashboard:'bn-dashboard', projects:'bn-projects', tickets:'bn-tickets' };
  if (bnMap[page]) setActiveBN(bnMap[page]);
  updateMobileBadges();
  closeFAB();
}

function switchTab(el, tabId) {
  document.querySelectorAll('[id^="dtab-"]').forEach(t => t.style.display='none');
  document.querySelectorAll('#proj-tabs .tab, .tabs .tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(tabId);
  if (tab) tab.style.display='block';
  el.classList.add('active');
  // Lazy-load tab content
  if (!CURRENT_PROJECT_ID) return;
  if (tabId==='dtab-tasks')     loadDetailTasks(CURRENT_PROJECT_ID);
  if (tabId==='dtab-daily')     loadDetailDailyReports(CURRENT_PROJECT_ID);
  if (tabId==='dtab-handover')  loadDetailHandovers(CURRENT_PROJECT_ID);
  if (tabId==='dtab-remarks')   loadDetailRemarks(CURRENT_PROJECT_ID);
  if (tabId==='dtab-tickets')   loadDetailTickets(CURRENT_PROJECT_ID);
  if (tabId==='dtab-warehouse') loadDetailWarehouse(CURRENT_PROJECT_ID);
  if (tabId==='dtab-toolbox')   loadDetailToolboxes(CURRENT_PROJECT_ID);
  if (tabId==='dtab-trucks')    loadDetailTrucks(CURRENT_PROJECT_ID);
  if (tabId==='dtab-bookings')  loadDetailBookings(CURRENT_PROJECT_ID);
  if (tabId==='dtab-briefing')  loadDetailBriefing(CURRENT_PROJECT_ID);
}

function openProject(id) {
  CURRENT_PROJECT_ID = id;
  goto('project-detail');
  document.querySelectorAll('[id^="dtab-"]').forEach(t => t.style.display='none');
  document.getElementById('dtab-info').style.display='block';
  document.querySelectorAll('#proj-tabs .tab').forEach((t,i) => t.classList.toggle('active', i===0));
  loadProjectDetail(id);
}

// ═══ LOAD ALL ═══
async function loadAll() {
  const [projRes, usersRes, ticketStats, notifRes] = await Promise.all([
    api('GET', '/projects'),
    api('GET', '/users'),
    api('GET', '/tickets/stats'),
    api('GET', '/notifications'),
  ]);

  // Charger les templates de tâches depuis la base (source de vérité)
  loadTaskTemplatesFromAPI();

  if (projRes?.success) {
    PROJECTS = projRes.data;
    renderDashProjects();
    renderDashCalendar();
    populateProjectSelects();
    document.getElementById('stat-projects').textContent = PROJECTS.filter(p => ['installation','on_site','in_preparation'].includes(p.status)).length;
  }
  if (usersRes?.success) {
    USERS = usersRes.data;
    populateUserSelects();
    document.getElementById('stat-team').textContent = USERS.length;
  }
  if (ticketStats?.success) {
    const s = ticketStats.data;
    document.getElementById('stat-tickets').textContent = s.open + s.inProgress;
    document.getElementById('tstat-open').textContent = s.open;
    document.getElementById('tstat-inprog').textContent = s.inProgress;
    document.getElementById('tstat-resolved').textContent = s.resolved;
    document.getElementById('tstat-critical').textContent = s.critical;
    const total = s.open + s.inProgress;
    document.getElementById('tickets-badge').textContent = total;
    if (total > 0) document.getElementById('notif-pip').style.display = 'block';
  }
  if (notifRes?.success) {
    document.getElementById('notifs-badge').textContent = notifRes.meta.unread;
  }

  loadDashTickets();
  document.getElementById('stat-tasks').textContent = '—';
}

// ═══ DASHBOARD ═══
function renderDashProjects() {
  const el = document.getElementById('dash-projects');
  const active = PROJECTS.filter(p => ['installation','on_site','in_preparation','loading'].includes(p.status)).slice(0,3);
  if (!active.length) { el.innerHTML = '<div class="empty"><div class="empty-icon">🏗️</div><div class="empty-title">Aucun projet actif</div></div>'; return; }
  el.innerHTML = active.map(p => projCardHTML(p)).join('');
}

function projCardHTML(p) {
  const statusColors = { draft:'badge-muted', confirmed:'badge-blue', in_preparation:'badge-amber', loading:'badge-amber', on_site:'badge-blue', installation:'badge-red', handover:'badge-purple', dismantling:'badge-amber', completed:'badge-green', cancelled:'badge-muted' };
  const statusLabels = { draft:'Brouillon', confirmed:'Confirmé', in_preparation:'Préparation', loading:'Chargement', on_site:'Sur site', installation:'Installation', handover:'Handover', dismantling:'Démontage', completed:'Terminé', cancelled:'Annulé' };
  const progress = p.progress || 0;
  return `<div class="proj-card" onclick="openProject('${p.id}')" style="margin-bottom:10px;">
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span class="badge ${statusColors[p.status]||'badge-muted'}">${statusLabels[p.status]||p.status}</span>
      <span style="font-size:11px;color:var(--text3);">${p.internalNumber}</span>
    </div>
    <div style="font-family:'Syne',sans-serif;font-size:15px;font-weight:700;margin-bottom:2px;">${p.name}</div>
    <div style="font-size:12px;color:var(--text3);margin-bottom:10px;">📍 ${p.city||p.address} · ${p.client?.name||''}</div>
    <div style="display:flex;align-items:center;gap:10px;">
      <div class="prog" style="flex:1;height:5px;"><div class="prog-bar" style="width:${progress}%;background:var(--accent);"></div></div>
      <span style="font-size:12px;font-weight:600;color:var(--text2);">${progress}%</span>
    </div>
  </div>`;
}

// État global des projets décochés dans le calendrier (persisté en localStorage)
let HIDDEN_CAL_PROJECTS = new Set(JSON.parse(localStorage.getItem('vem_hidden_cal_projects') || '[]'));

function saveHiddenCalProjects() {
  localStorage.setItem('vem_hidden_cal_projects', JSON.stringify(Array.from(HIDDEN_CAL_PROJECTS)));
}

// Construit le popup avec une checkbox par projet (visible dans le calendrier)
function buildProjectsFilter() {
  const dropdown = document.getElementById('cal-filter-dropdown');
  if (!dropdown) return;

  // On ne propose que les projets qui sont éligibles à l'affichage (non archivés + avec dates)
  const candidates = (PROJECTS || []).filter(p => {
    if (p.status === 'cancelled') return false;
    return p.installationStart;
  }).sort((a, b) => new Date(a.installationStart) - new Date(b.installationStart));

  const visibleCount = candidates.filter(p => !HIDDEN_CAL_PROJECTS.has(p.id)).length;

  // MAJ du label du bouton avec compteur visible/total
  const btn = document.getElementById('cal-filter-btn');
  if (btn) btn.innerHTML = `🎯 Filtrer projets (${visibleCount}/${candidates.length})`;

  dropdown.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;">
      <span>Projets visibles</span>
      <div style="display:flex;gap:4px;">
        <button class="btn btn-ghost btn-xs" onclick="setAllProjectsCalVisible(true)" style="font-size:10px;padding:2px 6px;">Tout cocher</button>
        <button class="btn btn-ghost btn-xs" onclick="setAllProjectsCalVisible(false)" style="font-size:10px;padding:2px 6px;">Tout décocher</button>
      </div>
    </div>
    ${candidates.map(p => `
      <label style="display:flex;align-items:center;gap:8px;padding:5px 4px;cursor:pointer;border-radius:4px;font-size:12px;" onmouseover="this.style.background='var(--bg3)'" onmouseout="this.style.background='transparent'">
        <input type="checkbox" ${HIDDEN_CAL_PROJECTS.has(p.id) ? '' : 'checked'} onchange="toggleProjectCalVisibility('${p.id}')" style="accent-color:var(--accent);width:16px;height:16px;flex-shrink:0;">
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <span style="font-weight:600;">${esc(p.name)}</span>
          <span style="color:var(--text3);font-size:11px;"> · ${esc(p.client?.name||'')}</span>
        </span>
      </label>`).join('')}
    ${candidates.length === 0 ? '<div style="text-align:center;color:var(--text3);font-size:12px;padding:12px;">Aucun projet planifié</div>' : ''}`;
}

function toggleProjectsFilter() {
  const dropdown = document.getElementById('cal-filter-dropdown');
  if (!dropdown) return;
  if (dropdown.style.display === 'none') {
    buildProjectsFilter();
    dropdown.style.display = 'block';
    // Fermeture sur clic extérieur (un seul handler attaché)
    setTimeout(() => {
      const closer = (e) => {
        if (!dropdown.contains(e.target) && e.target.id !== 'cal-filter-btn') {
          dropdown.style.display = 'none';
          document.removeEventListener('click', closer);
        }
      };
      document.addEventListener('click', closer);
    }, 50);
  } else {
    dropdown.style.display = 'none';
  }
}

function toggleProjectCalVisibility(projectId) {
  if (HIDDEN_CAL_PROJECTS.has(projectId)) HIDDEN_CAL_PROJECTS.delete(projectId);
  else HIDDEN_CAL_PROJECTS.add(projectId);
  saveHiddenCalProjects();
  buildProjectsFilter();    // refresh du compteur
  renderDashCalendar();
}

function setAllProjectsCalVisible(visible) {
  if (visible) {
    HIDDEN_CAL_PROJECTS.clear();
  } else {
    (PROJECTS || []).forEach(p => HIDDEN_CAL_PROJECTS.add(p.id));
  }
  saveHiddenCalProjects();
  buildProjectsFilter();
  renderDashCalendar();
}

// Déplacer un projet vers le haut/bas dans le Gantt — met à jour sortOrder
// uniquement pour les projets visibles (en respectant les filtres).
async function moveProjectInGantt(projectId, direction) {
  if (!PROJECTS || !PROJECTS.length) return;

  // Liste actuellement affichée (mêmes filtres que renderDashCalendar)
  const visible = PROJECTS
    .filter(p => p.installationStart && !HIDDEN_CAL_PROJECTS.has(p.id))
    .sort((a, b) => {
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (so !== 0) return so;
      return new Date(a.installationStart) - new Date(b.installationStart);
    });

  const idx = visible.findIndex(p => p.id === projectId);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= visible.length) return;

  // Échange leurs positions dans le tableau visible
  [visible[idx], visible[swapIdx]] = [visible[swapIdx], visible[idx]];

  // Renumérote TOUS les visibles avec un sortOrder propre (0, 10, 20, 30...)
  // (espacement de 10 pour permettre des insertions futures sans tout renuméroter)
  const orders = visible.map((p, i) => ({ id: p.id, sortOrder: (i + 1) * 10 }));

  // Met à jour localement dans PROJECTS (optimistic UI)
  orders.forEach(o => {
    const p = PROJECTS.find(x => x.id === o.id);
    if (p) p.sortOrder = o.sortOrder;
  });
  renderDashCalendar();

  // Persiste sur le serveur
  try {
    await api('PATCH', '/projects/reorder', { orders });
  } catch (e) {
    toast('Erreur enregistrement de l\'ordre — recharge la page', 'error');
    console.error('[moveProjectInGantt]', e);
  }
}

// Calendrier Gantt projets — période ajustable + groupage des ressources par projet
async function renderDashCalendar() {
  const el = document.getElementById('dash-calendar');
  if (!el) return;

  const NUM_WEEKS = parseInt(document.getElementById('cal-zoom')?.value || '6');
  const showTrucks = document.getElementById('cal-show-trucks')?.checked || false;
  const showTeams  = document.getElementById('cal-show-teams')?.checked  || false;

  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(today);
  start.setDate(today.getDate() - ((today.getDay() + 6) % 7));   // lundi de la semaine
  const totalDays = NUM_WEEKS * 7;
  const end = new Date(start.getTime() + totalDays * 86400000);

  const overlap = (a, b) => a && b && b >= start && a <= end;
  const inWindow = (p) => {
    const insS = p.installationStart ? new Date(p.installationStart) : null;
    const insE = p.installationEnd   ? new Date(p.installationEnd)   : null;
    const disS = p.dismantlingStart  ? new Date(p.dismantlingStart)  : null;
    const disE = p.dismantlingEnd    ? new Date(p.dismantlingEnd)    : null;
    return overlap(insS, insE) || overlap(disS, disE);
  };

  // Filtre : visible ET non décoché manuellement
  // Tri par sortOrder (drag/flèches), avec installationStart en fallback
  const list = (PROJECTS || [])
    .filter(p => p.installationStart && inWindow(p) && !HIDDEN_CAL_PROJECTS.has(p.id))
    .sort((a, b) => {
      const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (so !== 0) return so;
      return new Date(a.installationStart) - new Date(b.installationStart);
    });

  if (!list.length) {
    el.innerHTML = `<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px;">Aucun projet visible sur ${NUM_WEEKS} semaines.<br>Vérifie le filtre "🎯 Filtrer projets" si tu as décoché des projets.</div>`;
    return;
  }

  const posPct = d => {
    const dt = new Date(d);
    const days = (dt - start) / 86400000;
    return Math.max(0, Math.min(100, (days / totalDays) * 100));
  };
  const todayPct = posPct(today);

  // Formats de date
  const fmtD = d => d ? new Date(d).toLocaleDateString('fr-FR') : '';
  const shortD = d => {
    if (!d) return '';
    const dt = new Date(d);
    return `${dt.getDate()}/${String(dt.getMonth()+1).padStart(2,'0')}`;
  };
  const MOIS = ['janv','févr','mars','avr','mai','juin','juil','août','sept','oct','nov','déc'];
  const DAYS = ['L','M','M','J','V','S','D'];

  // ─── En-tête : labels de semaine plus visibles (jour de début → fin) ───
  // Si > 12 semaines on condense, sinon on affiche "DD-DD mois"
  const weeks = [];
  for (let i = 0; i < NUM_WEEKS; i++) {
    const dStart = new Date(start.getTime() + i * 7 * 86400000);
    const dEnd   = new Date(start.getTime() + (i * 7 + 6) * 86400000);
    const isCurrent = i === 0;
    const sameMonth = dStart.getMonth() === dEnd.getMonth();
    let mainLbl, subLbl;
    if (NUM_WEEKS > 12) {
      mainLbl = `S${getWeekNum(dStart)}`;
      subLbl  = `${dStart.getDate()}/${String(dStart.getMonth()+1).padStart(2,'0')}`;
    } else if (sameMonth) {
      mainLbl = `${dStart.getDate()}-${dEnd.getDate()}`;
      subLbl  = MOIS[dStart.getMonth()];
    } else {
      mainLbl = `${dStart.getDate()} ${MOIS[dStart.getMonth()].slice(0,3)} → ${dEnd.getDate()} ${MOIS[dEnd.getMonth()].slice(0,3)}`;
      subLbl  = '';
    }
    weeks.push(`<div title="Semaine du ${fmtD(dStart)} au ${fmtD(dEnd)}" style="text-align:center;padding:5px 2px;border-radius:5px;${isCurrent?'background:rgba(230,57,70,.1);border:1px solid var(--accent);':'background:var(--bg3);'}">
      <div style="font-size:${NUM_WEEKS>12?'10':'12'}px;font-weight:700;color:${isCurrent?'var(--accent)':'var(--text)'};line-height:1.1;">${mainLbl}</div>
      ${subLbl ? `<div style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.3px;line-height:1.1;margin-top:1px;">${subLbl}</div>` : ''}
    </div>`);
  }

  // ─── Sous-header : ligne jour-par-jour avec week-end visible ───
  // Affiché seulement jusqu'à 12 semaines (84 jours) — au-delà ça devient trop dense
  let daysHeader = '';
  if (NUM_WEEKS <= 12) {
    const dayCells = [];
    for (let d = 0; d < totalDays; d++) {
      const day = new Date(start.getTime() + d * 86400000);
      const dow = day.getDay();           // 0=dim, 6=sam
      const isWeekend = dow === 0 || dow === 6;
      const isToday = day.toDateString() === today.toDateString();
      const dayLetter = DAYS[(dow + 6) % 7];  // DAYS = ['L','M','M','J','V','S','D']
      dayCells.push(`<div title="${day.toLocaleDateString('fr-FR', {weekday:'long', day:'2-digit', month:'short'})}" style="text-align:center;font-size:9px;line-height:1.2;padding:2px 0;${isWeekend?'background:rgba(244,162,97,.15);color:var(--amber);font-weight:700;':isToday?'background:var(--accent);color:#fff;font-weight:700;border-radius:3px;':'color:var(--text3);'}">
        <div>${dayLetter}</div>
        <div style="font-size:8px;${isToday?'':'opacity:.7;'}">${day.getDate()}</div>
      </div>`);
    }
    daysHeader = `<div style="display:grid;grid-template-columns:200px 1fr;gap:10px;margin-top:6px;padding-bottom:6px;border-bottom:1px solid var(--border);">
      <div></div>
      <div style="display:grid;grid-template-columns:repeat(${totalDays}, 1fr);gap:1px;">${dayCells.join('')}</div>
    </div>`;
  }

  // ─── Pre-fetch en parallèle : camions + bookings de chaque projet ───
  const trucksByProject = {};
  const bookingsByProject = {};
  if (showTrucks) {
    const trucksFetches = await Promise.all(list.map(p =>
      api('GET', `/projects/${p.id}/trucks`).then(r => ({ pid: p.id, trucks: r?.success ? r.data : [] })).catch(() => ({ pid: p.id, trucks: [] }))
    ));
    trucksFetches.forEach(t => trucksByProject[t.pid] = t.trucks);
  }
  if (showTeams) {
    const bookingsFetches = await Promise.all(list.map(p =>
      api('GET', `/projects/${p.id}/bookings`).then(r => ({ pid: p.id, bks: r?.success ? r.data : [] })).catch(() => ({ pid: p.id, bks: [] }))
    ));
    bookingsFetches.forEach(b => bookingsByProject[b.pid] = b.bks);
  }

  const truckIcons = {truck:'🚛',van:'🚐',crane:'🏗️',scissor:'🔧',manitou:'🔧',forklift:'🚜',generator:'⚡',other:'🚗'};

  // ─── Construction des lignes ───
  const rows = list.map((p, idx) => {
    const insS = p.installationStart ? posPct(p.installationStart) : null;
    const insE = p.installationEnd   ? posPct(p.installationEnd)   : null;
    const disS = p.dismantlingStart  ? posPct(p.dismantlingStart)  : null;
    const disE = p.dismantlingEnd    ? posPct(p.dismantlingEnd)    : null;

    // Pour afficher les dates DANS la barre si elle est assez large (> 7% de l'axe)
    const insLabel = (insE-insS) > 7 ? `${shortD(p.installationStart)} → ${shortD(p.installationEnd)}` : '📐';
    const disLabel = (disE != null && disE-disS > 7) ? `${shortD(p.dismantlingStart)} → ${shortD(p.dismantlingEnd)}` : '📦';

    // Boutons flèches pour réordonner manuellement
    const canUp   = idx > 0;
    const canDown = idx < list.length - 1;

    let html = `<div style="display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:center;background:var(--bg2);border-radius:6px;padding:6px;">
      <div style="display:flex;align-items:center;gap:4px;overflow:hidden;">
        <div style="display:flex;flex-direction:column;gap:1px;flex-shrink:0;">
          <button onclick="event.stopPropagation();moveProjectInGantt('${p.id}','up')" ${canUp?'':'disabled'} style="background:none;border:none;color:${canUp?'var(--text2)':'var(--text3)'};cursor:${canUp?'pointer':'not-allowed'};padding:0 2px;font-size:10px;line-height:1;opacity:${canUp?'1':'.3'};" title="Monter">▲</button>
          <button onclick="event.stopPropagation();moveProjectInGantt('${p.id}','down')" ${canDown?'':'disabled'} style="background:none;border:none;color:${canDown?'var(--text2)':'var(--text3)'};cursor:${canDown?'pointer':'not-allowed'};padding:0 2px;font-size:10px;line-height:1;opacity:${canDown?'1':'.3'};" title="Descendre">▼</button>
        </div>
        <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;flex:1;" onclick="openProject('${p.id}')">
          <div style="font-size:13px;font-weight:700;">${esc(p.name)}</div>
          <div style="font-size:11px;color:var(--text3);">${esc(p.client?.name||'')}${p.internalNumber?' · '+esc(p.internalNumber):''}</div>
        </div>
      </div>
      <div style="position:relative;height:28px;background:var(--bg3);border-radius:6px;cursor:pointer;" onclick="openProject('${p.id}')">
        ${insS != null && insE != null ? `<div title="Installation : ${fmtD(p.installationStart)} → ${fmtD(p.installationEnd)}" style="position:absolute;left:${insS}%;width:${Math.max(1.5, insE-insS)}%;height:100%;background:var(--blue);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:700;overflow:hidden;padding:0 4px;">${esc(insLabel)}</div>` : ''}
        ${disS != null && disE != null ? `<div title="Démontage : ${fmtD(p.dismantlingStart)} → ${fmtD(p.dismantlingEnd)}" style="position:absolute;left:${disS}%;width:${Math.max(1.5, disE-disS)}%;height:100%;background:#f4a261;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:10px;color:white;font-weight:700;overflow:hidden;padding:0 4px;">${esc(disLabel)}</div>` : ''}
        <div style="position:absolute;left:${todayPct}%;top:-3px;width:2px;height:34px;background:var(--accent);pointer-events:none;"></div>
      </div>
    </div>`;

    // ─── Sous-lignes : camions ───
    if (showTrucks) {
      const trucks = (trucksByProject[p.id] || []).filter(t => {
        const tStart = t.loadingDate || p.installationStart;
        const tEnd   = t.arrivalDate || t.departureDate || p.installationEnd;
        if (!tStart || !tEnd) return false;
        const sD = new Date(tStart), eD = new Date(tEnd);
        return !(eD < start || sD > end);
      });
      trucks.forEach(t => {
        const tStart = t.loadingDate || p.installationStart;
        const tEnd   = t.arrivalDate || t.departureDate || p.installationEnd;
        const sP = posPct(tStart);
        const eP = posPct(tEnd);
        const icon = truckIcons[t.vehicleType] || '🚛';
        const lbl = (eP - sP) > 5 ? `${shortD(tStart)}→${shortD(tEnd)}` : '';
        html += `<div style="display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:center;padding:2px 6px 2px 22px;">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <div style="font-size:11px;font-weight:600;color:var(--text2);">└ ${icon} ${esc(t.truckNumber||t.licensePlate||'Véhicule')}</div>
            ${t.driverName ? `<div style="font-size:10px;color:var(--text3);padding-left:8px;">${esc(t.driverName)}</div>` : ''}
          </div>
          <div style="position:relative;height:16px;background:var(--bg3);border-radius:3px;">
            <div title="${fmtD(tStart)} → ${fmtD(tEnd)}" style="position:absolute;left:${sP}%;width:${Math.max(1.5, eP-sP)}%;height:100%;background:#22c55e;border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;color:white;font-weight:600;overflow:hidden;padding:0 3px;">${lbl}</div>
            <div style="position:absolute;left:${todayPct}%;top:-2px;width:2px;height:20px;background:var(--accent);pointer-events:none;"></div>
          </div>
        </div>`;
      });
    }

    // ─── Sous-lignes : équipes ───
    if (showTeams) {
      const bookings = (bookingsByProject[p.id] || []).filter(b => {
        const sD = new Date(b.outboundDate || b.onSiteStart);
        const eD = new Date(b.returnDate   || b.onSiteEnd);
        return !(eD < start || sD > end);
      });
      bookings.forEach(b => {
        const u = b.user || {};
        const onS = posPct(b.onSiteStart);
        const onE = posPct(b.onSiteEnd);
        const ouS = b.outboundDate ? posPct(b.outboundDate) : onS;
        const reE = b.returnDate   ? posPct(b.returnDate)   : onE;
        const color = b.phase === 'installation' ? 'var(--blue)' : '#f4a261';
        const phaseIcon = b.phase === 'installation' ? '🏗️' : '🔨';
        const lbl = (onE - onS) > 5 ? `${shortD(b.onSiteStart)}→${shortD(b.onSiteEnd)}` : '';
        html += `<div style="display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:center;padding:2px 6px 2px 22px;">
          <div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <div style="font-size:11px;font-weight:600;color:var(--text2);">└ ${phaseIcon} ${esc(u.firstName||'')} ${esc(u.lastName||'')}</div>
            <div style="font-size:10px;color:var(--text3);padding-left:8px;">${esc(u.role||'')}</div>
          </div>
          <div style="position:relative;height:16px;background:var(--bg3);border-radius:3px;">
            ${ouS < onS ? `<div title="Trajet aller" style="position:absolute;left:${ouS}%;width:${onS-ouS}%;height:100%;background:repeating-linear-gradient(45deg,${color} 0,${color} 3px,transparent 3px,transparent 6px);opacity:.5;border-radius:3px;"></div>` : ''}
            <div title="${fmtD(b.onSiteStart)} → ${fmtD(b.onSiteEnd)}" style="position:absolute;left:${onS}%;width:${Math.max(1.5, onE-onS)}%;height:100%;background:${color};border-radius:3px;display:flex;align-items:center;justify-content:center;font-size:9px;color:white;font-weight:600;overflow:hidden;padding:0 3px;">${lbl}</div>
            ${reE > onE ? `<div title="Trajet retour" style="position:absolute;left:${onE}%;width:${reE-onE}%;height:100%;background:repeating-linear-gradient(45deg,${color} 0,${color} 3px,transparent 3px,transparent 6px);opacity:.5;border-radius:3px;"></div>` : ''}
            <div style="position:absolute;left:${todayPct}%;top:-2px;width:2px;height:20px;background:var(--accent);pointer-events:none;"></div>
          </div>
        </div>`;
      });
      if (bookings.length === 0) {
        html += `<div style="display:grid;grid-template-columns:200px 1fr;gap:10px;align-items:center;padding:2px 6px 2px 22px;font-size:10px;color:var(--text3);font-style:italic;">
          <div>└ Aucun booking équipe</div><div></div>
        </div>`;
      }
    }

    return html;
  }).join('<div style="height:6px;"></div>');

  el.innerHTML = `
    <div style="padding:12px;">
      <!-- Header semaines : taille augmentée pour lisibilité -->
      <div style="display:grid;grid-template-columns:200px 1fr;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--border);">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;font-weight:600;">Projet / Ressource</div>
        <div style="display:grid;grid-template-columns:repeat(${NUM_WEEKS}, 1fr);gap:3px;">${weeks.join('')}</div>
      </div>
      ${daysHeader}
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:10px;">${rows}</div>
      <div style="display:flex;gap:16px;margin-top:14px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--text3);flex-wrap:wrap;">
        <span><span style="display:inline-block;width:12px;height:8px;background:var(--blue);border-radius:2px;vertical-align:middle;margin-right:4px;"></span>📐 Installation</span>
        <span><span style="display:inline-block;width:12px;height:8px;background:#f4a261;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>📦 Démontage</span>
        ${showTrucks ? '<span><span style="display:inline-block;width:12px;height:8px;background:#22c55e;border-radius:2px;vertical-align:middle;margin-right:4px;"></span>🚛 Camion</span>' : ''}
        ${showTeams ? '<span style="opacity:.8;">Pointillés = trajets</span>' : ''}
        <span><span style="display:inline-block;width:12px;height:8px;background:rgba(244,162,97,.3);border-radius:2px;vertical-align:middle;margin-right:4px;"></span>Week-end</span>
        <span><span style="display:inline-block;width:2px;height:10px;background:var(--accent);vertical-align:middle;margin-right:4px;"></span>Aujourd'hui</span>
      </div>
    </div>`;

  // Met à jour le compteur du bouton filtre (au cas où c'est la première fois)
  const btn = document.getElementById('cal-filter-btn');
  if (btn && !btn.innerHTML.includes('/')) {
    const totalCandidates = (PROJECTS || []).filter(p => p.status !== 'cancelled' && p.installationStart).length;
    const visible = totalCandidates - HIDDEN_CAL_PROJECTS.size;
    btn.innerHTML = `🎯 Filtrer projets (${visible}/${totalCandidates})`;
  }
}

// Helper : numéro de semaine ISO (utilisé pour les labels condensés en >12 sem.)
function getWeekNum(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = date.getTime();
  date.setUTCMonth(0, 1);
  if (date.getUTCDay() !== 4) date.setUTCMonth(0, 1 + ((4 - date.getUTCDay()) + 7) % 7);
  return 1 + Math.ceil((firstThursday - date.getTime()) / 604800000);
}

async function loadDashTickets() {
  const res = await api('GET', '/tickets?status=open&status=in_progress');
  const el = document.getElementById('dash-tickets');
  if (!res?.success || !res.data.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px;">Aucun ticket urgent</div>';
    return;
  }
  const urgent = res.data.filter(t => ['critical','high'].includes(t.urgency)).slice(0,3);
  if (!urgent.length) { el.innerHTML = '<div style="color:var(--green);font-size:13px;text-align:center;padding:20px;">✅ Aucun ticket critique</div>'; return; }
  el.innerHTML = urgent.map(t => `
    <div style="padding:10px;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:8px;cursor:pointer;border-left:3px solid ${t.urgency==='critical'?'var(--accent)':'var(--amber)'};" onclick="goto('tickets')">
      <div style="display:flex;gap:6px;margin-bottom:4px;">
        <span class="badge ${t.urgency==='critical'?'badge-red':'badge-amber'}">${t.urgency==='critical'?'🔴 Critique':'🟠 Élevé'}</span>
        <span style="font-size:11px;color:var(--text3);">${t.project?.name||''}</span>
      </div>
      <div style="font-weight:600;font-size:13px;">${t.title}</div>
      <div style="font-size:11px;color:var(--text3);margin-top:3px;">${t.assignedTo?`${t.assignedTo.firstName} ${t.assignedTo.lastName}`:'Non assigné'}</div>
    </div>`).join('');
}

// ═══ PROJECTS ═══
async function loadProjects() {
  const res = await api('GET', '/projects');
  if (!res?.success) return;
  PROJECTS = res.data;
  const showArchived = document.getElementById('show-archived')?.checked;
  const visible = showArchived
    ? PROJECTS.filter(p => p.status === 'cancelled')
    : PROJECTS.filter(p => p.status !== 'cancelled');
  const count = document.getElementById('proj-count');
  if (count) count.textContent = showArchived
    ? visible.length + ' projet(s) archivé(s)'
    : visible.length + ' projet(s) actif(s)';
  renderProjectsGrid(visible);
}

function renderProjectsGrid(projects) {
  const el = document.getElementById('projects-grid');
  if (!projects.length) {
    el.innerHTML = '<div class="empty" style="grid-column:1/-1;"><div class="empty-icon">🏗️</div><div class="empty-title">Aucun projet</div><div class="empty-sub">Créez votre premier projet</div></div>';
    return;
  }
  el.innerHTML = projects.map(p => `
    <div class="proj-card" onclick="openProject('${p.id}')">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <span class="badge badge-${p.status==='cancelled'?'muted':p.status==='installation'?'red':p.status==='completed'?'green':'amber'}">${p.status==='cancelled'?'📦 Archivé':p.status}</span>
        <span style="font-size:11px;color:var(--text3);">${p.internalNumber}</span>
      </div>
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:700;margin-bottom:3px;">${p.name}</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:4px;">${p.client?.name||''}</div>
      <div style="font-size:13px;margin-bottom:12px;">📍 ${p.city||''}</div>
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">
        <span style="font-size:12px;background:var(--bg3);padding:2px 8px;border-radius:6px;">👷 ${p.workersCount}</span>
        ${p._count?.tickets>0?`<span class="badge badge-red">🛠️ ${p._count.tickets}</span>`:''}
      </div>
      <div class="prog" style="height:5px;"><div class="prog-bar" style="width:${p.progress||0}%;background:var(--accent);"></div></div>
      <div style="display:flex;justify-content:space-between;margin-top:6px;font-size:11px;color:var(--text3);">
        <span>${p.technicalManager?`${p.technicalManager.firstName} ${p.technicalManager.lastName}`:''}</span>
        <span style="font-weight:600;">${p.progress||0}%</span>
      </div>
    </div>`).join('');
}

function filterProjects() {
  const search = document.getElementById('proj-search').value.toLowerCase();
  const status = document.getElementById('proj-status-filter').value;
  const showArchived = document.getElementById('show-archived')?.checked;
  const filtered = PROJECTS.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search) || p.internalNumber.toLowerCase().includes(search);
    const matchStatus = !status || p.status === status;
    // Comportement attendu : par défaut on cache les archivés.
    // Si la case est cochée → on affiche TOUT (archivés inclus).
    const archived = p.status === 'cancelled' || p.status === 'completed';
    const matchArch = showArchived ? true : !archived;
    return matchSearch && matchStatus && matchArch;
  });
  renderProjectsGrid(filtered);
}
// Alias pour le onchange du checkbox
function renderProjects() { filterProjects(); }

// ═══ PROJECT DETAIL ═══
async function updateProjectStatus(projectId, status) {
  if (!projectId) return;
  const res = await api('PATCH', `/projects/${projectId}`, { status });
  if (res?.success) {
    toast('Statut du projet mis à jour ✅', 'success');
    // Mettre à jour le cache global
    const proj = PROJECTS?.find(p => p.id === projectId);
    if (proj) proj.status = status;
    // Rafraîchir tous les endroits où le statut est affiché : badge dans la carte
    // Infos, le calendrier dashboard, la liste des projets.
    if (typeof renderDashCalendar === 'function') renderDashCalendar();
    // Recharger le détail projet complet pour que le badge "Statut" dans la carte Infos
    // affiche la nouvelle valeur (avec son libellé lisible et sa couleur correcte).
    loadProjectDetail(projectId);
  } else {
    toast('Erreur changement de statut', 'error');
  }
}

