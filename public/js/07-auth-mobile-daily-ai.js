function buildTerrainPoint(num, title, description, status, photos, zone='') {
  const statusColors = {ok:'#2dc653',remark:'#f4a261',defect:'#e63946',pending:'#8892a4',open:'#e63946',in_progress:'#f4a261',resolved:'#2dc653',critical:'#e63946',high:'#f4a261',normal:'#4895ef'};
  const statusLabels = {ok:'✅ OK',remark:'⚠️ Remarque',defect:'❌ Défaut',pending:'⏳ En attente',open:'En cours',in_progress:'En traitement',resolved:'✅ Traité',critical:'🔴 Critique',high:'🟠 Élevé',normal:'🔵 Normal'};
  const color = statusColors[status] || '#8892a4';
  const label = statusLabels[status] || status;

  return `
  <div style="border:1px solid #e5e7eb;border-left:4px solid ${color};border-radius:8px;margin-bottom:14px;overflow:hidden;page-break-inside:avoid;">
    <div style="padding:12px 16px;background:#fff;display:flex;justify-content:space-between;align-items:flex-start;">
      <div style="display:flex;gap:10px;align-items:flex-start;flex:1;">
        <div style="width:28px;height:28px;background:${color}20;border:2px solid ${color};border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:12px;color:${color};flex-shrink:0;">${num}</div>
        <div style="flex:1;">
          <div style="font-weight:700;font-size:14px;margin-bottom:3px;">${title}</div>
          ${zone ? `<div style="font-size:12px;color:#8892a4;margin-bottom:4px;">📍 ${zone}</div>` : ''}
          ${description ? `<div style="font-size:13px;color:#4a5568;line-height:1.6;">${description}</div>` : ''}
        </div>
      </div>
      <div style="background:${color}15;color:${color};font-size:11px;font-weight:600;padding:3px 10px;border-radius:99px;white-space:nowrap;margin-left:10px;">${label}</div>
    </div>
    ${photos && photos.length ? `
    <div style="padding:0 12px 12px;background:#fafafa;display:grid;grid-template-columns:repeat(${Math.min(photos.length,3)},1fr);gap:8px;">
      ${photos.map(p=>`<img src="${p.photoUrl||p}" style="width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;">`).join('')}
    </div>` : ''}
  </div>`;
}

// ═══ MOBILE NAV ═══
function setActiveBN(id) {
  document.querySelectorAll('.bn-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeMobileNav() {
  document.getElementById('nav')?.classList.remove('open');
  document.getElementById('nav-overlay')?.classList.remove('open');
}

function toggleMobileMenu() {
  const nav = document.getElementById('nav');
  const overlay = document.getElementById('nav-overlay');
  nav?.classList.toggle('open');
  overlay?.classList.toggle('open');
}

function toggleFAB() {
  const menu = document.getElementById('fab-menu');
  const circle = document.getElementById('fab-circle');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  menu.classList.toggle('open');
  if (circle) circle.classList.toggle('open', !isOpen);
}

function closeFAB() {
  document.getElementById('fab-menu')?.classList.remove('open');
  document.getElementById('fab-circle')?.classList.remove('open');
}

// Close FAB when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('#fab-btn') && !e.target.closest('#fab-menu')) closeFAB();
});

// Update badge on bottom nav
function updateMobileBadges() {
  const ticketBadge = document.getElementById('bn-badge-tickets');
  const count = parseInt(document.getElementById('tickets-badge')?.textContent || '0');
  if (ticketBadge) {
    ticketBadge.textContent = count;
    ticketBadge.style.display = count > 0 ? 'block' : 'none';
  }
}

// Override goto to also update bottom nav
const _origGoto = goto;

// Patch mobile nav close on nav item click
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      closeMobileNav();
      closeFAB();
    });
  });
});

// ═══ MOBILE — SWIPE TO CLOSE MODAL ═══
let touchStartY = 0;
document.addEventListener('touchstart', e => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

// (Désactivé) Le swipe-to-close fermait par erreur les modals longs (handover, daily report)
// dès que l'utilisateur faisait défiler le contenu vers le bas. L'utilisateur peut toujours
// fermer via la croix × du modal.
// document.addEventListener('touchmove', e => { ... });

// ═══ MOBILE — BETTER DASHBOARD ═══
function renderDashboardMobile() {
  // Update bottom nav badges
  updateMobileBadges();
}

// ═══ FORGOT PASSWORD ═══
function showForgotPassword() {
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.style.cssText = 'display:flex;align-items:center;justify-content:center;';
  el.innerHTML = `
    <div style="background:var(--bg2);border:1px solid var(--border);border-radius:18px;padding:32px;width:90%;max-width:400px;box-shadow:0 32px 80px rgba(0,0,0,.6);">
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;margin-bottom:6px;">🔑 Réinitialiser le mot de passe</div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:24px;">Entrez votre email — vous recevrez un lien de réinitialisation.</div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input class="form-input" type="email" id="forgot-email" placeholder="votre@email.com" autocomplete="email">
      </div>
      <div id="forgot-msg" style="display:none;margin-top:12px;padding:10px 14px;border-radius:var(--radius);font-size:13px;"></div>
      <button class="login-btn" id="forgot-btn" onclick="sendForgotPassword()" style="margin-top:16px;">📤 Envoyer le lien</button>
      <div style="text-align:center;margin-top:14px;">
        <span style="font-size:13px;color:var(--text3);cursor:pointer;" onclick="this.closest('.overlay').remove()" onmouseover="this.style.color='var(--text)'" onmouseout="this.style.color='var(--text3)'">← Retour à la connexion</span>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if(e.target===el) el.remove(); });
  setTimeout(() => document.getElementById('forgot-email')?.focus(), 100);
}

async function sendForgotPassword() {
  const email = document.getElementById('forgot-email')?.value.trim();
  const msg   = document.getElementById('forgot-msg');
  const btn   = document.getElementById('forgot-btn');
  if (!email) { 
    if(msg){ msg.style.display='block'; msg.style.background='rgba(230,57,70,.1)'; msg.style.color='var(--accent)'; msg.textContent='Entrez votre email.'; }
    return; 
  }
  if(btn){ btn.disabled=true; btn.innerHTML='<span class="loader"></span> Envoi...'; }
  try {
    const res = await fetch(`${window.location.origin}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if(msg){ 
      msg.style.display='block'; 
      if(res.ok || res.status===200) {
        msg.style.background='rgba(45,198,83,.1)'; 
        msg.style.color='var(--green)'; 
        msg.textContent='✅ Si cet email existe, vous recevrez un lien de réinitialisation dans quelques minutes.';
        if(btn){ btn.disabled=true; btn.innerHTML='✅ Email envoyé'; }
      } else {
        msg.style.background='rgba(230,57,70,.1)'; 
        msg.style.color='var(--accent)'; 
        msg.textContent='Erreur — vérifiez votre email ou contactez un administrateur.';
        if(btn){ btn.disabled=false; btn.innerHTML='📤 Renvoyer'; }
      }
    }
  } catch {
    if(msg){ msg.style.display='block'; msg.style.background='rgba(244,162,97,.1)'; msg.style.color='var(--amber)'; msg.textContent='Erreur réseau — réessayez.'; }
    if(btn){ btn.disabled=false; btn.innerHTML='📤 Envoyer le lien'; }
  }
}

// ═══════════════════════════════════════════════════════════
// INVITATION SYSTEM
// ═══════════════════════════════════════════════════════════

function showInviteModal() {
  document.getElementById('invite-result').style.display = 'none';
  document.getElementById('invite-link-input').value = '';
  showModal('modal-invite');
}

async function generateInviteLink() {
  const role = document.getElementById('invite-role').value;
  const email = document.getElementById('invite-email').value || undefined;
  const note = document.getElementById('invite-note').value || undefined;
  const btn = document.getElementById('invite-gen-btn');
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="loader"></span>'; }

  const res = await api('POST', '/auth/invite', { role, email, note });

  if (btn) { btn.disabled=false; btn.innerHTML='🔗 Générer le lien'; }

  if (res?.success) {
    const link = res.data.inviteUrl;
    document.getElementById('invite-link-input').value = link;
    document.getElementById('invite-result').style.display = 'block';
    // Auto-copy
    copyInviteLink();
  } else {
    // Fallback: generate client-side token for demo
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    const link = `${window.location.origin}?invite=${token}&role=${role}`;
    document.getElementById('invite-link-input').value = link;
    document.getElementById('invite-result').style.display = 'block';
    toast('Lien généré (API invite non déployée — fonctionne en mode démo)', 'warning');
  }
}

function copyInviteLink() {
  const input = document.getElementById('invite-link-input');
  if (!input) return;
  input.select();
  navigator.clipboard?.writeText(input.value).then(()=>toast('Lien copié ✅','success')).catch(()=>{
    document.execCommand('copy');
    toast('Lien copié ✅','success');
  });
}

// ═══════════════════════════════════════════════════════════
// REGISTER PAGE — shown when ?invite=TOKEN in URL
// ═══════════════════════════════════════════════════════════

function checkInviteParam() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('invite');
  const role = params.get('role');
  if (!token) return false;

  // Show register screen
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'none';
  const regScreen = document.getElementById('register-screen');
  if (regScreen) regScreen.style.display = 'flex';

  // Pre-fill role if in URL
  if (role) {
    const roleLabels = {
      worker:'👷 Installation Team',
      engineer:'⚙️ Sales Engineer',
      site_manager:'🏗️ Site Manager',
      technical_manager:'🔧 Technical Manager',
      warehouse:'📦 Warehouse Labour',
    };
    const sel = document.getElementById('reg-role');
    if (sel) sel.value = role;
    const lbl = document.getElementById('register-role-label');
    if (lbl && roleLabels[role]) lbl.textContent = `Rôle : ${roleLabels[role]}`;
  }

  // Store invite token
  window.INVITE_TOKEN = token;
  return true;
}

async function submitRegister() {
  const firstName = document.getElementById('reg-firstname')?.value.trim();
  const lastName  = document.getElementById('reg-lastname')?.value.trim();
  const email     = document.getElementById('reg-email')?.value.trim();
  const role      = document.getElementById('reg-role')?.value;
  const password  = document.getElementById('reg-password')?.value;
  const password2 = document.getElementById('reg-password2')?.value;
  const errEl     = document.getElementById('reg-error');
  const btn       = document.getElementById('reg-btn');

  const showErr = (msg) => {
    if (errEl) { errEl.style.display='block'; errEl.textContent=msg; }
  };

  if (!firstName||!lastName||!email||!password) return showErr('Tous les champs obligatoires doivent être remplis.');
  if (password.length < 8) return showErr('Le mot de passe doit contenir au moins 8 caractères.');
  if (password !== password2) return showErr('Les mots de passe ne correspondent pas.');

  if (btn) { btn.disabled=true; btn.innerHTML='<span class="loader"></span> Création...'; }

  // Try register via invite endpoint
  const res = await fetch(`${window.location.origin}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName, lastName, email, password, role,
      inviteToken: window.INVITE_TOKEN,
    }),
  }).then(r=>r.json()).catch(()=>null);

  if (res?.success) {
    // Auto-login
    TOKEN = res.data.token;
    CURRENT_USER = res.data.user;
    localStorage.setItem('vem_token', TOKEN);
    localStorage.setItem('vem_user', JSON.stringify(CURRENT_USER));
    document.getElementById('register-screen').style.display = 'none';
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
    showApp();
    toast(`Bienvenue ${firstName} ! 🎉`, 'success');
  } else {
    const msg = res?.error || 'Erreur création de compte';
    showErr(msg);
    if (btn) { btn.disabled=false; btn.innerHTML='✅ Créer mon compte'; }
  }
}

function showLoginFromRegister() {
  document.getElementById('register-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  window.history.replaceState({}, '', window.location.pathname);
}

// ═══ INIT ═══
if (checkInviteParam()) {
  // Show register page — handled in checkInviteParam
} else if (TOKEN && CURRENT_USER) {
  showApp();
} else {
  document.getElementById('login-screen').style.display = 'flex';
}

// ═══ HANDOVER — SIGNATURE PAD ═══
function initSigPad(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let drawing = false;
  ctx.strokeStyle = '#e63946';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - r.left, y: src.clientY - r.top };
  };

  canvas.addEventListener('mousedown',  (e) => { drawing=true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); });
  canvas.addEventListener('mousemove',  (e) => { if(!drawing) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); });
  canvas.addEventListener('mouseup',    () => drawing=false);
  canvas.addEventListener('mouseleave', () => drawing=false);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing=true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); });
  canvas.addEventListener('touchmove',  (e) => { e.preventDefault(); if(!drawing) return; const p=getPos(e); ctx.lineTo(p.x,p.y); ctx.stroke(); });
  canvas.addEventListener('touchend',   () => drawing=false);
}

function clearSig(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
}

function isSigEmpty(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return true;
  const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  return !data.some(x => x !== 0);
}

async function saveSig(handoverId, type, canvasId, overlay) {
  if (isSigEmpty(canvasId)) { toast('Signez dans le cadre avant de valider', 'error'); return; }
  const canvas = document.getElementById(canvasId);
  const sigData = canvas.toDataURL('image/png');
  const res = await api('POST', `/handover/${handoverId}/sign`, { type, signatureBase64: sigData });
  if (res?.success) {
    toast(`Signature ${type==='manager'?'Site Manager':'client'} enregistrée ✅`, 'success');
    overlay?.remove();
    loadHandovers();
    if (CURRENT_PROJECT_ID) loadDetailHandovers(CURRENT_PROJECT_ID);
  } else toast('Erreur signature', 'error');
}

// ── HANDOVER — UPDATE ZONE STATUS ──
async function updateZoneStatus(handoverId, itemId, newStatus) {
  const res = await api('PATCH', `/handover/${handoverId}`, {
    items: [{ id: itemId, status: newStatus }]
  });
  if (res?.success) toast('Zone mise à jour ✅', 'success');
}

// ── HANDOVER — UPLOAD ZONE PHOTO ──
async function uploadHandoverZonePhoto(handoverId, itemId, input, previewEl) {
  if (!input.files?.length) return;
  toast('Upload photo...', 'info');
  const fd = new FormData();
  fd.append('file', input.files[0]);
  fd.append('handoverId', handoverId);
  fd.append('itemId', itemId);
  try {
    const r = await fetch(`${API}/upload/handover-photo/${handoverId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: fd
    });
    const data = await r.json();
    if (data.success) {
      // Si on a un previewEl, on ajoute l'image en preview locale
      if (previewEl) {
        const img = document.createElement('img');
        img.src = data.data.photoUrl;
        img.onclick = () => openPhotoViewer(data.data.photoUrl);
        img.style.cssText = 'width:70px;height:70px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid var(--border);';
        const labelEl = previewEl.querySelector('label');
        if (labelEl) previewEl.insertBefore(img, labelEl);
        else previewEl.appendChild(img);
      }
      toast('Photo ajoutée ✅', 'success');
      // On rafraîchit la modal du handover pour que la photo apparaisse dans la liste des items
      // (elle n'apparaissait pas avant car la liste est statique tant qu'on ne recharge pas).
      if (document.querySelector('.overlay.open')) {
        document.querySelectorAll('.overlay.open').forEach(o => o.remove());
        openHandoverFull(handoverId);
      }
    } else {
      toast(data.error || 'Erreur upload', 'error');
    }
  } catch (e) {
    console.error('uploadHandoverZonePhoto', e);
    toast('Erreur upload', 'error');
  }
}

// ═══ DAILY REPORT — TABS ═══
function switchDailyTab(tab) {
  ['manual','import','voice'].forEach(t => {
    document.getElementById('panel-'+t).style.display = t===tab?
      (t==='manual'?'grid':'block'):'none';
    const tabEl = document.getElementById('tab-'+t);
    if (tabEl) {
      tabEl.style.color = t===tab?'var(--accent)':'var(--text2)';
      tabEl.style.borderBottomColor = t===tab?'var(--accent)':'transparent';
    }
  });
}

async function runTimeAnalysis__V1_REMOVED() {
  if (false) {

  try {
    // ── Étape 1 : charger tous les daily reports du projet ──
    setTAStatus('📥', 'Chargement des rapports journaliers...', 'Récupération de toutes les entrées');
    const listRes = await api('GET', `/daily-reports?projectId=${CURRENT_PROJECT_ID}`);
    if (!listRes?.success) throw new Error('Erreur chargement rapports');
    const reports = listRes.data || [];
    if (!reports.length) {
      setTAStatus('⚠️', 'Aucun rapport journalier', 'Ajoute au moins un daily report pour lancer l\'analyse');
      if (runBtn) runBtn.disabled = false;
      return;
    }

    // Fetch détail de chaque rapport (pour avoir les entries)
    setTAStatus('📥', `Chargement de ${reports.length} rapport(s)...`, 'Récupération des entrées détaillées');
    const detailed = await Promise.all(
      reports.map(r => api('GET', `/daily-reports/${r.id}`).then(res => res?.data || r))
    );

    // ── Étape 2 : construire le texte source pour l'IA ──
    const sourceLines = [];
    let totalEntries = 0;
    detailed.forEach(r => {
      const date = r.reportDate?.split('T')[0] || '';
      const workers = r.workersPresent || 0;
      const entries = (r.entries || []).sort((a,b)=>(a.entryTime||'').localeCompare(b.entryTime||''));
      if (!entries.length && !r.generalNotes) return;
      sourceLines.push(`\n=== JOUR ${date} — ${workers} ouvrier(s) présent(s) ===`);
      entries.forEach(e => {
        sourceLines.push(`[${e.entryTime || '?'}] ${e.description || ''}`);
        totalEntries++;
      });
      if (r.generalNotes) sourceLines.push(`Notes générales : ${r.generalNotes}`);
    });

    if (!totalEntries) {
      setTAStatus('⚠️', 'Aucune entrée détaillée', 'Les rapports existent mais ne contiennent pas d\'entrées à analyser');
      if (runBtn) runBtn.disabled = false;
      return;
    }

    const sourceText = sourceLines.join('\n');
    const categoriesRaw = document.getElementById('ta-categories')?.value?.trim() || '';
    const categories = categoriesRaw.split('\n').map(c=>c.trim()).filter(Boolean);

    // ── Étape 3 : construire le prompt pour l'IA ──
    setTAStatus('🤖', `Analyse IA en cours...`, `${totalEntries} entrées sur ${detailed.length} jours`);

    const prompt = `Tu es un expert en gestion de chantier. Analyse les rapports journaliers ci-dessous et calcule les heures totales passées par type de tâche.

CATÉGORIES DE TÂCHES À IDENTIFIER (regroupe les entrées similaires sous ces catégories) :
${categories.map(c => `- ${c}`).join('\n')}

INSTRUCTIONS :
1. Chaque entrée a un horaire [HH:MM] et une description
2. Calcule la DURÉE de chaque tâche = temps entre l'entrée courante et la suivante (dans le même jour). Ignore les pauses évidentes (déjeuner, café).
3. Détermine le NOMBRE D'OUVRIERS sur chaque tâche :
   - Si le texte le mentionne explicitement ("3 ouvriers sur la façade", "l'équipe complète", "seul", "avec Jeremy"), utilise cette info
   - Sinon utilise le total d'ouvriers présents du jour (indiqué dans "=== JOUR ...")
4. HEURES-HOMMES d'une tâche = durée (h) × nombre d'ouvriers
5. Regroupe toutes les tâches par catégorie et somme les heures-hommes
6. Si une entrée ne correspond à aucune catégorie, mets-la dans "Autres tâches"
7. Ignore les entrées non productives (pause, arrivée, départ, réunion courte < 15 min sauf si elles concernent le briefing)

RÉPONDS UNIQUEMENT AVEC UN OBJET JSON VALIDE (pas de markdown, pas de backticks), format exact :
{
  "summary": {
    "totalDays": nombre,
    "totalManHours": nombre (arrondi à 1 décimale),
    "avgWorkersPerDay": nombre (arrondi à 1 décimale),
    "period": "YYYY-MM-DD → YYYY-MM-DD"
  },
  "categories": [
    {
      "name": "Installation Viewbox",
      "manHours": 24.5,
      "durationHours": 8.0,
      "avgWorkers": 3.1,
      "occurrences": 4,
      "days": ["2025-01-15", "2025-01-16"],
      "details": [
        {"date": "2025-01-15", "time": "09:15", "description": "Montage 1ère box", "durationHours": 0.25, "workers": 4, "manHours": 1.0}
      ]
    }
  ],
  "insights": [
    "Point d'analyse 1 (ex: 40% du temps a été consacré à l'installation Viewbox)",
    "Point d'analyse 2 (ex: Le déchargement a été particulièrement long jour 3)"
  ]
}

Trie les catégories par manHours décroissant. Sois précis dans les calculs.

RAPPORTS À ANALYSER :
${sourceText}`;

    // ── Étape 4 : appel IA ──
    const aiRes = await fetch(`${API}/ai/parse-daily`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
      body: JSON.stringify({ text: prompt, mode: 'json' })
    });
    const aiData = await aiRes.json();
    if (!aiData.success) throw new Error(aiData.error || 'Erreur IA');

    // Parser la réponse — peut être un objet direct ou une string JSON
    let result;
    try {
      if (typeof aiData.data === 'object' && !Array.isArray(aiData.data)) {
        result = aiData.data;
      } else if (typeof aiData.data === 'string') {
        // Nettoyer d'éventuels backticks/markdown
        const clean = aiData.data.replace(/```json|```/g, '').trim();
        result = JSON.parse(clean);
      } else if (Array.isArray(aiData.data)) {
        // Backend a peut-être parsé comme array — cas de repli
        result = { summary: {}, categories: aiData.data, insights: [] };
      }
    } catch (parseErr) {
      console.error('[TA] parse err:', parseErr, aiData.data);
      throw new Error('Format de réponse IA invalide — réessaie');
    }

    if (!result || !result.categories) throw new Error('Réponse IA incomplète');

    // ── Étape 5 : afficher le résultat ──
    TA_LAST_RESULT = { ...result, projectId: CURRENT_PROJECT_ID };
    renderTimeAnalysisReport(result);
    setTAStatus('✅', 'Analyse terminée', `${result.summary?.totalManHours || 0} heures-hommes analysées sur ${result.summary?.totalDays || detailed.length} jours`);
    if (exportBtn) exportBtn.style.display = 'inline-flex';

  } catch (e) {
    console.error('[TA] error:', e);
    setTAStatus('❌', 'Erreur d\'analyse', e.message || 'Impossible de générer le rapport');
    toast('Erreur analyse IA', 'error');
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

function renderTimeAnalysisReport(data) {
  const el = document.getElementById('ta-result');
  if (!el) return;

  const s = data.summary || {};
  const cats = (data.categories || []).sort((a,b)=>(b.manHours||0)-(a.manHours||0));
  const totalMH = s.totalManHours || cats.reduce((sum,c)=>sum+(c.manHours||0),0);
  const insights = data.insights || [];

  // Palette couleurs pour les barres
  const barColors = ['#e63946','#4895ef','#2dc653','#f4a261','#9b59b6','#ff6b6b','#8b5cf6','#22d3ee','#facc15','#fb923c','#6b7280'];

  const catsHTML = cats.map((c,i) => {
    const pct = totalMH > 0 ? Math.round((c.manHours||0)/totalMH*100) : 0;
    const color = barColors[i % barColors.length];
    const detailsHTML = (c.details||[]).slice(0, 20).map(d => `
      <div style="display:flex;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span style="color:var(--text3);min-width:90px;">${d.date || ''}</span>
        <span style="color:var(--text3);min-width:50px;font-family:monospace;">${d.time || ''}</span>
        <span style="flex:1;color:var(--text2);">${esc(d.description || '')}</span>
        <span style="color:var(--text3);min-width:100px;text-align:right;">${d.workers||0}👷 × ${(d.durationHours||0).toFixed(2)}h = <strong style="color:var(--text);">${(d.manHours||0).toFixed(1)}h</strong></span>
      </div>
    `).join('');

    return `
      <div style="background:var(--bg3);border-radius:var(--radius);padding:14px;margin-bottom:10px;border-left:4px solid ${color};">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px;">
          <div style="flex:1;min-width:200px;">
            <div style="font-weight:700;font-size:15px;color:var(--text);">${esc(c.name)}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">
              ${(c.durationHours||0).toFixed(1)}h de travail × ${(c.avgWorkers||0).toFixed(1)} ouvriers en moyenne
              ${c.occurrences ? ` · ${c.occurrences} occurrence(s)` : ''}
              ${c.days?.length ? ` · ${c.days.length} jour(s)` : ''}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:22px;font-weight:800;color:${color};font-family:'Syne',sans-serif;">${(c.manHours||0).toFixed(1)}h</div>
            <div style="font-size:11px;color:var(--text3);">${pct}% du total</div>
          </div>
        </div>
        <div style="background:var(--bg2);border-radius:6px;height:8px;overflow:hidden;margin-bottom:${(c.details||[]).length?'10px':'0'};">
          <div style="background:${color};height:100%;width:${pct}%;transition:width .3s;"></div>
        </div>
        ${(c.details||[]).length ? `
          <details style="margin-top:6px;">
            <summary style="cursor:pointer;font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:600;padding:4px 0;">📋 Voir le détail (${(c.details||[]).length} entrée${(c.details||[]).length>1?'s':''})</summary>
            <div style="margin-top:8px;background:var(--bg2);border-radius:6px;padding:8px 12px;">${detailsHTML}</div>
          </details>
        ` : ''}
      </div>`;
  }).join('');

  el.innerHTML = `
    <!-- Résumé global -->
    <div style="background:linear-gradient(135deg,rgba(230,57,70,.12),rgba(72,149,239,.12));border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;">📊 Résumé global</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
        <div>
          <div style="font-size:24px;font-weight:800;color:var(--accent);font-family:'Syne',sans-serif;">${(s.totalManHours||totalMH||0).toFixed(1)}h</div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;">Heures-hommes totales</div>
        </div>
        <div>
          <div style="font-size:24px;font-weight:800;color:var(--blue);font-family:'Syne',sans-serif;">${s.totalDays||0}</div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;">Jours analysés</div>
        </div>
        <div>
          <div style="font-size:24px;font-weight:800;color:var(--green);font-family:'Syne',sans-serif;">${(s.avgWorkersPerDay||0).toFixed(1)}</div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;">Ouvriers/jour (moy.)</div>
        </div>
        <div>
          <div style="font-size:24px;font-weight:800;color:var(--amber);font-family:'Syne',sans-serif;">${cats.length}</div>
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;">Catégories</div>
        </div>
      </div>
      ${s.period ? `<div style="font-size:12px;color:var(--text3);margin-top:10px;">📅 Période : <strong style="color:var(--text2);">${esc(s.period)}</strong></div>` : ''}
    </div>

    <!-- Insights IA -->
    ${insights.length ? `
    <div style="background:var(--bg3);border-left:3px solid var(--blue);border-radius:var(--radius);padding:14px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--blue);text-transform:uppercase;letter-spacing:.7px;margin-bottom:8px;">🤖 Analyse IA</div>
      ${insights.map(i => `<div style="font-size:13px;color:var(--text2);margin-bottom:6px;line-height:1.5;">• ${esc(i)}</div>`).join('')}
    </div>
    ` : ''}

    <!-- Catégories -->
    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px;">⏱️ Répartition par tâche</div>
    ${catsHTML || '<div class="empty"><div class="empty-title">Aucune tâche catégorisée</div></div>'}
  `;

  el.style.display = 'block';
}

async function exportTimeAnalysisPDF() {
  if (!TA_LAST_RESULT) { toast('Lance d\'abord une analyse', 'error'); return; }

  const proj = await api('GET', `/projects/${TA_LAST_RESULT.projectId}`);
  const project = proj?.data || {};

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  // Header
  doc.setFillColor(10, 37, 64); // navy Viewbox
  doc.rect(0, 0, pageW, 70, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Analyse Temps par Tâche', margin, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${project.name || 'Projet'} — ${project.internalNumber || ''}`, margin, 50);
  doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageW - margin, 50, { align: 'right' });
  y = 90;

  // Résumé
  const s = TA_LAST_RESULT.summary || {};
  const cats = TA_LAST_RESULT.categories || [];
  const totalMH = s.totalManHours || cats.reduce((sum,c)=>sum+(c.manHours||0),0);

  doc.setTextColor(10, 37, 64);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Résumé global', margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  const summaryLines = [
    `Heures-hommes totales : ${totalMH.toFixed(1)} h`,
    `Jours analysés : ${s.totalDays || 0}`,
    `Ouvriers/jour (moyenne) : ${(s.avgWorkersPerDay || 0).toFixed(1)}`,
    `Nombre de catégories : ${cats.length}`,
    s.period ? `Période : ${s.period}` : null,
  ].filter(Boolean);
  summaryLines.forEach(line => { doc.text(line, margin, y); y += 14; });
  y += 10;

  // Insights
  const insights = TA_LAST_RESULT.insights || [];
  if (insights.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(10, 37, 64);
    doc.text('Analyse IA', margin, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(50, 50, 50);
    insights.forEach(ins => {
      const wrapped = doc.splitTextToSize(`• ${ins}`, pageW - 2*margin);
      wrapped.forEach(w => {
        if (y > pageH - 40) { doc.addPage(); y = margin; }
        doc.text(w, margin, y);
        y += 14;
      });
    });
    y += 8;
  }

  // Catégories
  if (y > pageH - 100) { doc.addPage(); y = margin; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(10, 37, 64);
  doc.text('Répartition par tâche', margin, y);
  y += 18;

  const barColors = [[230,57,70],[72,149,239],[45,198,83],[244,162,97],[155,89,182],[139,92,246],[34,211,238],[250,204,21]];

  cats.forEach((c, i) => {
    if (y > pageH - 80) { doc.addPage(); y = margin; }
    const col = barColors[i % barColors.length];
    const pct = totalMH > 0 ? Math.round((c.manHours||0)/totalMH*100) : 0;

    // Barre couleur
    doc.setFillColor(col[0], col[1], col[2]);
    doc.rect(margin, y - 8, 4, 30, 'F');

    // Nom + heures
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text(c.name, margin + 12, y);
    doc.setTextColor(col[0], col[1], col[2]);
    doc.text(`${(c.manHours||0).toFixed(1)} h`, pageW - margin, y, { align: 'right' });

    // Détails ligne 2
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const sub = `${(c.durationHours||0).toFixed(1)}h × ${(c.avgWorkers||0).toFixed(1)} ouvriers · ${c.occurrences||0} occurrence(s) · ${pct}%`;
    doc.text(sub, margin + 12, y + 13);

    // Barre de progression
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(margin + 12, y + 18, pageW - 2*margin - 12, 4, 2, 2, 'F');
    doc.setFillColor(col[0], col[1], col[2]);
    doc.roundedRect(margin + 12, y + 18, (pageW - 2*margin - 12) * pct/100, 4, 2, 2, 'F');

    y += 34;
  });

  // Footer
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`VEM — ViewBox Event Manager · Page ${p}/${totalPages}`, pageW/2, pageH - 20, { align: 'center' });
  }

  const filename = `Analyse-Temps_${(project.internalNumber||'projet')}_${new Date().toISOString().split('T')[0]}.pdf`;
  doc.save(filename);
  toast('PDF exporté ✅', 'success');
}

} // fin runTimeAnalysis__V1_REMOVED

// ═══ DAILY REPORT — AI PARSE RAW TEXT ═══
async function parseRawTextWithAI() {
  const raw = document.getElementById('daily-raw-text')?.value.trim();
  if (!raw) { toast('Colle ton texte de rapport dabord', 'error'); return; }

  const status = document.getElementById('ai-status');
  if (status) status.style.display = 'inline';
  document.querySelector('[onclick="parseRawTextWithAI()"]').disabled = true;

  try {
    const response = await fetch(`${API}/ai/parse-daily`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      },
      body: JSON.stringify({ text: raw })
    });

    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Erreur IA');
    const entries = data.data;

    // Store AI entries
    window.AI_PARSED_ENTRIES = entries;
    window.AI_SOURCE_TEXT = raw;

    // Show preview
    const preview = document.getElementById('ai-result-preview');
    const list = document.getElementById('ai-entries-list');
    if (!preview || !list) return;

    // Affichage du texte source dans la zone repliable (pour vérification)
    const srcBox = document.getElementById('ai-source-text');
    if (srcBox) srcBox.textContent = raw;

    renderAIEntriesList();

    preview.style.display = 'block';
    toast(`✅ ${entries.length} entrée(s) extraite(s) — vérifie, complète et valide`, 'success');

  } catch(e) {
    toast('Erreur connexion IA', 'error');
    console.error(e);
  } finally {
    if (status) status.style.display = 'none';
    const btn = document.querySelector('[onclick="parseRawTextWithAI()"]');
    if (btn) btn.disabled = false;
  }
}

// Re-rend la liste des entrées IA (utilisé après chaque modif : suppression, ajout manuel)
// Lit dans window.AI_PARSED_ENTRIES qui est la source de vérité.
function renderAIEntriesList() {
  const list = document.getElementById('ai-entries-list');
  if (!list) return;
  const entries = window.AI_PARSED_ENTRIES || [];
  list.innerHTML = entries.map((e, i) => `
    <div style="display:flex;gap:8px;align-items:flex-start;background:var(--bg3);border-radius:var(--radius);padding:8px 10px;border-left:3px solid var(--accent);">
      <input class="input" type="time" value="${e.time||''}" id="ai-time-${i}" style="width:80px;padding:5px 6px;font-size:12px;flex-shrink:0;">
      <textarea class="input" id="ai-text-${i}" rows="2" style="flex:1;font-size:12px;resize:vertical;min-height:36px;">${esc(e.text||'')}</textarea>
      <span style="font-size:10px;background:var(--bg4);color:var(--text3);padding:2px 6px;border-radius:4px;align-self:center;flex-shrink:0;">${e.category||''}</span>
      <button onclick="removeAIEntry(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;flex-shrink:0;" title="Supprimer">✕</button>
    </div>`).join('');
}

// Suppression propre d'une entrée (collecte avant suppr pour ne pas perdre les édits)
function removeAIEntry(idx) {
  // On collecte les valeurs actuelles pour ne pas écraser des modifs en cours
  const list = document.getElementById('ai-entries-list');
  if (list && window.AI_PARSED_ENTRIES) {
    window.AI_PARSED_ENTRIES.forEach((e, i) => {
      const t = document.getElementById(`ai-time-${i}`);
      const x = document.getElementById(`ai-text-${i}`);
      if (t) e.time = t.value;
      if (x) e.text = x.value;
    });
  }
  window.AI_PARSED_ENTRIES.splice(idx, 1);
  renderAIEntriesList();
}

// Ajout d'un point manuel après analyse IA (au cas où l'IA aurait raté quelque chose)
function addAIEntryManually() {
  if (!window.AI_PARSED_ENTRIES) window.AI_PARSED_ENTRIES = [];
  // On préserve les modifs en cours avant le re-render
  const list = document.getElementById('ai-entries-list');
  if (list) {
    window.AI_PARSED_ENTRIES.forEach((e, i) => {
      const t = document.getElementById(`ai-time-${i}`);
      const x = document.getElementById(`ai-text-${i}`);
      if (t) e.time = t.value;
      if (x) e.text = x.value;
    });
  }
  window.AI_PARSED_ENTRIES.push({ time: '', text: '', category: '' });
  renderAIEntriesList();
  // Met le focus sur le nouveau textarea
  setTimeout(() => {
    const newIdx = window.AI_PARSED_ENTRIES.length - 1;
    document.getElementById(`ai-text-${newIdx}`)?.focus();
  }, 50);
}

// Affiche/masque la boîte du texte source d'origine (pour vérifier la fidélité de l'IA)
function toggleAISourceText() {
  const box = document.getElementById('ai-source-box');
  const btn = document.getElementById('ai-source-toggle');
  if (!box) return;
  if (box.style.display === 'none') {
    box.style.display = 'block';
    if (btn) btn.textContent = '📄 Masquer texte source';
  } else {
    box.style.display = 'none';
    if (btn) btn.textContent = '📄 Voir texte source';
  }
}

function validateAIEntries() {
  // Collect edited entries from the preview
  const list = document.getElementById('ai-entries-list');
  if (!list) return;
  const rows = list.querySelectorAll('[id^="ai-time-"]');
  rows.forEach((timeEl, i) => {
    const textEl = document.getElementById(`ai-text-${i}`);
    if (!textEl) return;
    const time = timeEl.value || '';
    const text = textEl.value.trim();
    if (text) {
      DAILY_ENTRIES.push({ id: Date.now() + i, time, text });
    }
  });
  DAILY_ENTRIES.sort((a,b) => (a.time||'').localeCompare(b.time||''));
  renderDailyEntries();
  updateDailySummary();
  // Switch to manual tab to show result
  switchDailyTab('manual');
  document.getElementById('ai-result-preview').style.display = 'none';
  document.getElementById('daily-raw-text').value = '';
  toast(`${DAILY_ENTRIES.length} entrées ajoutées au journal ✅`, 'success');
}

// ═══ VOICE — ADD AS ENTRY OR SEND TO AI ═══
// ─── Upload d'un fichier audio pour transcription via Whisper ───
// L'utilisateur peut enregistrer ailleurs (mémo vocal téléphone, dictaphone)
// et déposer le fichier ici. Le backend renvoie le texte transcrit.
async function uploadAudioForTranscription(input) {
  if (!input.files?.length) return;
  const file = input.files[0];
  const statusEl = document.getElementById('voice-audio-status');
  const transcriptBox = document.getElementById('voice-transcript-box');
  const transcriptText = document.getElementById('voice-transcript-text');
  const actions = document.getElementById('voice-actions');

  // Limite côté front : 50 Mo (le backend limite à 50 Mo aussi via multer)
  if (file.size > 50 * 1024 * 1024) {
    toast('Fichier trop volumineux (max 50 Mo)', 'error');
    return;
  }

  // Feedback visuel pendant l'upload + transcription (peut prendre 10-30s)
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.innerHTML = `<span style="color:var(--blue);">⏳ Transcription en cours (~${Math.max(5, Math.round(file.size/1024/100))}s)...</span>`;
  }

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
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">❌ ${esc(data.error || 'Erreur transcription')}</span>`;
      toast(data.error || 'Erreur transcription', 'error');
      return;
    }

    const text = (data.data?.text || '').trim();
    if (!text) {
      if (statusEl) statusEl.innerHTML = `<span style="color:var(--amber);">⚠️ Aucun texte détecté dans l'audio</span>`;
      return;
    }

    // Succès — on remplit le textarea daily-raw-text aussi pour faciliter l'usage
    if (transcriptText) transcriptText.textContent = text;
    if (transcriptBox)  transcriptBox.style.display = 'block';
    if (actions)        actions.style.display = 'flex';
    if (statusEl)       statusEl.innerHTML = `<span style="color:var(--green);">✅ Transcription OK (${text.length} caractères)</span>`;

    // Si le textarea import existe, on le pré-remplit aussi
    const rawTextarea = document.getElementById('daily-raw-text');
    if (rawTextarea && !rawTextarea.value.trim()) rawTextarea.value = text;

    toast('Audio transcrit ✅', 'success');
  } catch (err) {
    console.error('uploadAudioForTranscription error:', err);
    if (statusEl) statusEl.innerHTML = `<span style="color:var(--accent);">❌ Erreur réseau</span>`;
    toast('Erreur réseau pendant la transcription', 'error');
  } finally {
    // Reset l'input pour permettre de re-sélectionner le même fichier
    input.value = '';
  }
}

function addVoiceAsEntry() {
  const text = document.getElementById('voice-transcript-text')?.textContent.trim();
  if (!text) return;
  const time = document.getElementById('new-entry-time')?.value || '';
  DAILY_ENTRIES.push({ id: Date.now(), time, text });
  DAILY_ENTRIES.sort((a,b) => (a.time||'').localeCompare(b.time||''));
  renderDailyEntries();
  updateDailySummary();
  switchDailyTab('manual');
  toast('Dictée ajoutée ✅', 'success');
}

async function parseVoiceWithAI() {
  const text = document.getElementById('voice-transcript-text')?.textContent.trim();
  if (!text) return;
  // Move text to import panel and parse
  document.getElementById('daily-raw-text').value = text;
  switchDailyTab('import');
  await parseRawTextWithAI();
}

function updateDailySummary() {
  const el = document.getElementById('daily-summary-count');
  if (el) {
    const n = DAILY_ENTRIES.length;
    const tasks = Object.keys(DAILY_TASK_UPDATES).length;
    el.textContent = `${n} entrée(s)${tasks?` · ${tasks} tâche(s) à mettre à jour`:''}`;
  }
  // Also update entry count
  const ec = document.getElementById('entry-count');
  if (ec) ec.textContent = DAILY_ENTRIES.length + ' entrée(s)';
}

// ═══ LOAD DETAIL TAB CONTENT ═══

async function loadDetailDailyReports(projectId) {
  const res = await api('GET', `/daily-reports?projectId=${projectId}`);
  const el = document.getElementById('detail-daily-content');
  if (!res?.success) return;
  const btn = `<div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button class="btn btn-primary btn-sm" onclick="showModal('modal-daily')">+ Nouveau Rapport</button></div>`;
  if (!res.data.length) { el.innerHTML = btn + '<div class="empty"><div class="empty-icon">📓</div><div class="empty-title">Aucun rapport journalier</div></div>'; return; }
  el.innerHTML = btn + res.data.map(r => `
    <div class="card" style="margin-bottom:10px;cursor:pointer;" onclick="openDailyDetail('${r.id}','${projectId}')">
      <div class="card-header">
        <div>
          <div class="card-title">📓 ${fmtDate(r.reportDate)}</div>
          <div style="font-size:12px;color:var(--text3);">${r.workersPresent} ouvriers · ${r.weather||''} · ${r._count?.entries||0} entrée(s)</div>
          ${r.generalNotes?`<div style="font-size:12px;color:var(--text2);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:300px;">${r.generalNotes}</div>`:''}
        </div>
        <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;" onclick="event.stopPropagation()">
          ${r.sentAt?'<span class="badge badge-green" style="font-size:10px;">✉️</span>':''}
          <button class="btn btn-ghost btn-xs" style="min-height:36px;min-width:36px;padding:6px;" onclick="event.stopPropagation();openDailyDetail('${r.id}','${projectId}')">👁️</button>
          <button class="btn btn-ghost btn-xs" style="min-height:36px;min-width:36px;padding:6px;" onclick="event.stopPropagation();editDailyReport('${r.id}')">✏️</button>
          <button class="btn btn-ghost btn-xs" style="min-height:36px;min-width:36px;padding:6px;" onclick="event.stopPropagation();downloadDailyPDF('${r.id}')">📄</button>
          <button class="btn btn-ghost btn-xs" style="min-height:36px;min-width:36px;padding:6px;color:var(--accent);" onclick="event.stopPropagation();deleteDailyReport('${r.id}')">🗑️</button>
        </div>
      </div>
    </div>`).join('');
}

async function openDailyDetail(id, projectId) {
  const res = await api('GET', `/daily-reports/${id}`);
  if (!res?.success) { toast('Rapport introuvable','error'); return; }
  const r = res.data;
  const entries = (r.entries||[]).sort((a,b)=>(a.entryTime||'').localeCompare(b.entryTime||''));
  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-head">
        <div>
          <div class="modal-title">📓 Daily Report — ${fmtDate(r.reportDate)}</div>
          <div style="font-size:12px;color:var(--text2);">${r.project?.name||''} · ${r.workersPresent} ouvriers · ${r.weather||''}</div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      ${entries.length ? `
        <div style="margin-bottom:16px;">
          <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px;">⏱️ Journal chronologique</div>
          <div style="border-left:3px solid var(--accent);padding-left:14px;display:flex;flex-direction:column;gap:8px;">
            ${entries.map(e=>`
              <div style="display:flex;gap:12px;align-items:baseline;">
                <span style="font-family:monospace;font-size:12px;font-weight:700;color:var(--accent);flex-shrink:0;min-width:44px;">${e.entryTime||'--:--'}</span>
                <span style="font-size:13px;color:var(--text);line-height:1.5;flex:1;">${e.description}</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

      ${r.generalNotes ? `
        <div style="background:var(--bg3);border-radius:var(--radius);padding:12px;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);margin-bottom:6px;text-transform:uppercase;">📝 Notes</div>
          <div style="font-size:13px;color:var(--text2);line-height:1.5;">${r.generalNotes}</div>
        </div>` : ''}

      ${(r.photos||[]).length ? `
        <div style="margin-bottom:14px;">
          <div style="font-size:12px;font-weight:700;color:var(--text3);margin-bottom:8px;text-transform:uppercase;">📸 Photos (${r.photos.length})</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px;">
            ${r.photos.map(p=>`
              <div data-photo-id="${p.id}" style="position:relative;">
                <img src="${p.photoUrl}" onclick="openPhotoViewer('${p.photoUrl}')" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;cursor:pointer;border:1px solid var(--border);display:block;">
                <button onclick="deleteDailyPhotoFromView('${r.id}','${p.id}','${projectId}',this)" title="Supprimer cette photo"
                  style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:50%;background:var(--accent);color:white;border:2px solid var(--bg);cursor:pointer;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0;z-index:5;">✕</button>
                ${p.caption?`<div style="font-size:10px;color:var(--text3);margin-top:3px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.caption)}</div>`:''}
              </div>
            `).join('')}
          </div>
        </div>` : ''}

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-ghost btn-sm" style="color:var(--accent);" onclick="deleteDailyReport('${r.id}');this.closest('.overlay').remove()">🗑️ Supprimer</button>
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
        <button class="btn btn-ghost btn-sm" onclick="this.closest('.overlay').remove();editDailyReport('${r.id}')">✏️ Modifier</button>
        <button class="btn btn-ghost btn-sm" onclick="downloadDailyPDF('${r.id}')">📄 PDF</button>
        ${!r.sentAt?`<button class="btn btn-primary btn-sm" onclick="sendDailyReport('${r.id}')">📤 Envoyer</button>`:''}
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) el.remove(); });
}

async function loadDetailHandovers(projectId) {
  const res = await api('GET', `/handover?projectId=${projectId}`);
  const el = document.getElementById('detail-handover-content');
  if (!res?.success) return;
  const btn = `<div style="display:flex;justify-content:flex-end;margin-bottom:14px;"><button class="btn btn-primary btn-sm" onclick="showModal('modal-handover')">+ Nouveau Handover</button></div>`;
  if (!res.data.length) { el.innerHTML = btn + '<div class="empty"><div class="empty-icon">🧾</div><div class="empty-title">Aucun handover</div></div>'; return; }
  const sc = {draft:'badge-amber',signed:'badge-green',pending:'badge-amber'};
  const sl = {draft:'En cours',signed:'✅ Signé',pending:'En attente'};
  el.innerHTML = btn + res.data.map(h => {
    const items = h.items||[];
    const ok = items.filter(i=>i.status==='ok').length;
    const rem = items.filter(i=>i.status==='remark').length;
    const def = items.filter(i=>i.status==='defect').length;
    return `
    <div class="card" style="margin-bottom:12px;cursor:pointer;" onclick="openHandoverFull('${h.id}')">
      <div class="card-header">
        <div>
          <div class="card-title">🧾 ${h.clientName||'Handover'}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">
            ${fmtDate(h.createdAt)}
            ${h.siteManager?` · ${h.siteManager.firstName} ${h.siteManager.lastName}`:''}
            ${items.length?` · ${items.length} zone(s)`:''}
          </div>
          <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;">
            ${ok?`<span style="font-size:11px;color:var(--green);">✅ ${ok} OK</span>`:''}
            ${rem?`<span style="font-size:11px;color:var(--amber);">⚠️ ${rem} remarque(s)</span>`:''}
            ${def?`<span style="font-size:11px;color:var(--accent);">❌ ${def} défaut(s)</span>`:''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;" onclick="event.stopPropagation()">
          <span class="badge ${sc[h.status]||'badge-muted'}">${sl[h.status]||h.status}</span>
          <div style="display:flex;gap:4px;">
            <button class="btn btn-ghost btn-xs" onclick="openHandoverFull('${h.id}')">👁️ Ouvrir</button>
            <button class="btn btn-ghost btn-xs" onclick="editHandoverFields('${h.id}','${projectId}')">✏️ Modifier</button>
            <button class="btn btn-ghost btn-xs" onclick="generateHandoverPDF('${h.id}')">📄 PDF</button>
            <button class="btn btn-ghost btn-xs" onclick="generateSignatureLink('${h.id}')">🔗 Signer</button>
            <button class="btn btn-ghost btn-xs" style="color:var(--accent);" onclick="deleteHandover('${h.id}')">🗑️</button>
          </div>
        </div>
      </div>
      ${items.length?`<div class="card-body" style="padding:8px 18px;display:flex;gap:5px;flex-wrap:wrap;">
        ${items.map(i=>`<span class="badge ${i.status==='ok'?'badge-green':i.status==='remark'?'badge-amber':'badge-red'}" style="font-size:11px;">${i.zoneName}</span>`).join('')}
      </div>`:''}
    </div>`}).join('');
}

