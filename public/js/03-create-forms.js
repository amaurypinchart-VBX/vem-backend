async function createTicket() {
  const title = document.getElementById('ticket-title').value.trim();
  const desc  = document.getElementById('ticket-desc').value.trim();
  if (!title || !desc) { toast('Titre et description obligatoires', 'error'); return; }

  const res = await api('POST', '/tickets', {
    title, description: desc,
    projectId: document.getElementById('ticket-project').value || undefined,
    urgency: document.getElementById('ticket-urgency').value,
    locationOnSite: document.getElementById('ticket-location').value || undefined,
    assignedToId: document.getElementById('ticket-assign').value || undefined,
    plannedDate: document.getElementById('ticket-date').value || undefined,
  });
  if (res?.success) { toast('Ticket créé · Email envoyé 📧', 'success'); closeModal('modal-ticket'); loadAll(); loadTickets(); }
  else toast('Erreur création ticket', 'error');
}

async function createTask() {
  const title = document.getElementById('task-title').value.trim();
  const date  = document.getElementById('task-date').value;
  const projectId = document.getElementById('task-project').value;
  if (!title || !date || !projectId) { toast('Titre, projet et date obligatoires', 'error'); return; }

  const res = await api('POST', '/tasks', {
    title, taskDate: date, projectId,
    assignedToId: document.getElementById('task-assign').value || undefined,
    startTime: document.getElementById('task-start').value || undefined,
    endTime: document.getElementById('task-end').value || undefined,
    priority: document.getElementById('task-priority').value,
    status: document.getElementById('task-status').value,
    description: document.getElementById('task-desc').value || undefined,
  });
  if (res?.success) { toast('Tâche créée ✅', 'success'); closeModal('modal-task'); loadTasks(); if(CURRENT_PROJECT_ID) loadDetailTasks(CURRENT_PROJECT_ID); }
  else toast('Erreur création tâche', 'error');
}

// ═══ DAILY REPORT STATE ═══
let DAILY_ENTRIES = []; // {id, time, text}
let DAILY_TASK_UPDATES = {}; // {taskId: newStatus}
let DAILY_PHASE = null; // 'installation' | 'dismantling'
let DAILY_TASK_HOURS = []; // {taskTemplateId, taskTitle, hours, workers}
let DAILY_ALL_TEMPLATES = null; // cache brut de GET /task-templates
let voiceRecognition = null;
let isRecording = false;

function resetDailyReport() {
  DAILY_ENTRIES = [];
  DAILY_TASK_UPDATES = {};
  DAILY_PHASE = null;
  DAILY_TASK_HOURS = [];
  renderDailyEntries();
  document.getElementById('daily-tasks-list').innerHTML = '<div style="color:var(--text3);font-size:13px;text-align:center;padding:20px;">Sélectionne un projet</div>';
  document.getElementById('new-entry-text').value = '';
  document.getElementById('daily-notes').value = '';
  document.getElementById('daily-workers').value = '0';
  document.querySelectorAll('input[name="daily-phase"]').forEach(r => { r.checked = false; });
  renderDailyTaskHoursGrid();
  PENDING_DAILY_PHOTOS = [];
  const preview = document.getElementById('daily-photos-preview');
  if (preview) preview.innerHTML = '';
  const input = document.getElementById('daily-photos-input');
  if (input) input.value = '';
  // Set current time
  const now = new Date();
  document.getElementById('new-entry-time').value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

// ── HEURES PAR TÂCHE (Installation / Démontage) ──────────────
async function loadDailyAllTemplates() {
  if (DAILY_ALL_TEMPLATES) return DAILY_ALL_TEMPLATES;
  const res = await api('GET', '/task-templates');
  DAILY_ALL_TEMPLATES = res?.success ? (res.data || []) : [];
  return DAILY_ALL_TEMPLATES;
}

async function onDailyPhaseChange(phase) {
  DAILY_PHASE = phase;
  const templates = await loadDailyAllTemplates();
  const forPhase = templates.filter(t => t.phase === phase);
  DAILY_TASK_HOURS = forPhase.map(t => ({
    taskTemplateId: t.id,
    taskTitle: t.title,
    hours: 0,
    workers: 0,
  }));
  renderDailyTaskHoursGrid();
}

function renderDailyTaskHoursGrid() {
  const empty  = document.getElementById('daily-taskhours-empty');
  const header = document.getElementById('daily-taskhours-header');
  const addRow = document.getElementById('daily-taskhours-add');
  const list   = document.getElementById('daily-taskhours-list');
  if (!list) return;

  if (!DAILY_PHASE) {
    if (empty) empty.style.display = 'block';
    if (header) header.style.display = 'none';
    if (addRow) addRow.style.display = 'none';
    list.innerHTML = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (header) header.style.display = 'grid';
  if (addRow) addRow.style.display = 'flex';

  list.innerHTML = DAILY_TASK_HOURS.map((t, i) => `
    <div style="display:grid;grid-template-columns:1fr 85px 85px 26px;gap:8px;align-items:center;padding:5px 4px;border-bottom:1px solid var(--border);">
      <span style="font-size:12px;color:var(--text2);">${esc(t.taskTitle)}</span>
      <input type="number" step="0.25" min="0" value="${t.hours || ''}" placeholder="0"
        onchange="updateDailyTaskHour(${i},'hours',this.value)"
        style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;text-align:right;">
      <input type="number" step="1" min="0" value="${t.workers || ''}" placeholder="0"
        onchange="updateDailyTaskHour(${i},'workers',this.value)"
        style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;text-align:right;">
      <button onclick="removeDailyTaskHourRow(${i})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:13px;" title="Retirer">✕</button>
    </div>`).join('') || '<div style="color:var(--text3);font-size:12px;text-align:center;padding:10px;">Aucune tâche pour cette phase</div>';
}

function updateDailyTaskHour(idx, field, value) {
  if (!DAILY_TASK_HOURS[idx]) return;
  DAILY_TASK_HOURS[idx][field] = field === 'workers' ? (parseInt(value) || 0) : (parseFloat(value) || 0);
}

function removeDailyTaskHourRow(idx) {
  DAILY_TASK_HOURS.splice(idx, 1);
  renderDailyTaskHoursGrid();
}

function addCustomDailyTaskHourRow() {
  const input = document.getElementById('daily-taskhours-custom-title');
  const title = input?.value.trim();
  if (!title) { toast('Nom de la tâche requis', 'error'); return; }
  DAILY_TASK_HOURS.push({ taskTemplateId: null, taskTitle: title, hours: 0, workers: 0 });
  input.value = '';
  renderDailyTaskHoursGrid();
}

function addDailyEntry() {
  const time = document.getElementById('new-entry-time').value;
  const text = document.getElementById('new-entry-text').value.trim();
  if (!text) { toast('Décrivez ce qui a été fait','error'); return; }
  const entry = { id: Date.now(), time: time || '00:00', text };
  DAILY_ENTRIES.push(entry);
  DAILY_ENTRIES.sort((a,b) => a.time.localeCompare(b.time));
  renderDailyEntries();
  document.getElementById('new-entry-text').value = '';
  // Auto-advance time by 30min
  if (time) {
    const [h,m] = time.split(':').map(Number);
    const next = new Date(2000,0,1,h,m+30);
    document.getElementById('new-entry-time').value = `${String(next.getHours()).padStart(2,'0')}:${String(next.getMinutes()).padStart(2,'0')}`;
  }
}

function removeDailyEntry(id) {
  DAILY_ENTRIES = DAILY_ENTRIES.filter(e => e.id !== id);
  renderDailyEntries();
}

function renderDailyEntries() {
  const el = document.getElementById('daily-entries-list');
  if (!el) return;
  if (!DAILY_ENTRIES.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px;">Aucune entrée — ajoutez des activités ci-dessous</div>';
    return;
  }
  el.innerHTML = DAILY_ENTRIES.map(e => `
    <div style="display:flex;gap:8px;align-items:flex-start;background:var(--bg3);border-radius:var(--radius);padding:8px 10px;border-left:3px solid var(--accent);">
      <div style="font-family:monospace;font-size:12px;font-weight:700;color:var(--accent);min-width:40px;margin-top:1px;">${e.time||'--:--'}</div>
      <div style="flex:1;font-size:13px;color:var(--text2);line-height:1.4;">${e.text}</div>
      <button onclick="removeDailyEntry(${e.id})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;padding:0 2px;">✕</button>
    </div>`).join('');
  updateDailySummary();
}

// ── VOICE RECORDING ──────────────────────────────────────────
function toggleVoiceRecording() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Vocal non supporté sur ce navigateur — essayez Chrome','warning');
    return;
  }
  if (isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

function startVoiceRecording() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceRecognition = new SpeechRecognition();
  voiceRecognition.lang = 'fr-FR';
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;

  // Texte déjà finalisé (accumulé entre les appels onresult successifs)
  let finalTranscript = '';

  voiceRecognition.onstart = () => {
    isRecording = true;
    finalTranscript = '';
    // Petit bouton dans la tab manuelle
    const btn = document.getElementById('voice-btn');
    const status = document.getElementById('voice-status');
    if (btn) { btn.style.background = 'rgba(230,57,70,.2)'; btn.style.color = 'var(--accent)'; }
    if (status) status.style.display = 'inline';
    // Gros bouton dans la tab vocale
    const bigBtn = document.getElementById('voice-big-btn');
    const mainStatus = document.getElementById('voice-main-status');
    const icon = document.getElementById('voice-icon');
    const box = document.getElementById('voice-transcript-box');
    if (bigBtn) bigBtn.innerHTML = '⏹️ Arrêter la dictée';
    if (mainStatus) mainStatus.textContent = '🔴 Enregistrement en cours...';
    if (icon) icon.textContent = '🔴';
    if (box) box.style.display = 'block';
  };

  voiceRecognition.onresult = (event) => {
    let interim = '';
    // On parcourt tous les résultats depuis l'index courant : ceux marqués isFinal
    // sont définitivement acquis et s'ajoutent au texte final accumulé. Les autres
    // restent en "interim" et s'affichent en attendant validation.
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i];
      if (res.isFinal) {
        finalTranscript += res[0].transcript + ' ';
      } else {
        interim += res[0].transcript;
      }
    }
    const fullText = (finalTranscript + interim).trim();
    // Champ saisie manuelle
    const el = document.getElementById('new-entry-text');
    if (el) el.value = fullText;
    // Aperçu vocal
    const vt = document.getElementById('voice-transcript-text');
    if (vt) vt.textContent = fullText;
    // Aperçu import (si l'utilisateur dicte directement vers la zone IA)
    const raw = document.getElementById('daily-raw-text');
    if (raw && document.getElementById('panel-import')?.style.display !== 'none') raw.value = fullText;
  };

  voiceRecognition.onerror = (event) => {
    // 'no-speech' n'est pas une vraie erreur, juste un silence → on relance
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    toast('Erreur micro : ' + event.error, 'error');
    stopVoiceRecording();
  };

  voiceRecognition.onend = () => {
    // Si l'utilisateur n'a pas explicitement arrêté, on relance automatiquement
    // (Chrome coupe seul après ~60s ou en cas de silence prolongé).
    if (isRecording) {
      try { voiceRecognition.start(); }
      catch (e) { /* déjà démarré : on ignore */ }
    }
  };

  voiceRecognition.start();
}

function stopVoiceRecording() {
  isRecording = false;
  if (voiceRecognition) voiceRecognition.stop();
  // Reset small btn
  const btn = document.getElementById('voice-btn');
  const status = document.getElementById('voice-status');
  if (btn) { btn.style.background = ''; btn.style.color = ''; }
  if (status) status.style.display = 'none';
  // Reset big btn
  const bigBtn = document.getElementById('voice-big-btn');
  const mainStatus = document.getElementById('voice-main-status');
  const icon = document.getElementById('voice-icon');
  const actions = document.getElementById('voice-actions');
  if (bigBtn) bigBtn.innerHTML = '🎙️ Nouvelle dictée';
  if (mainStatus) mainStatus.textContent = 'Dictée terminée';
  if (icon) icon.textContent = '✅';
  if (actions) actions.style.display = 'flex';
  const text = document.getElementById('new-entry-text')?.value.trim();
  if (text) toast('✅ Transcription terminée', 'success');
}

// ── LOAD TASKS FOR DAILY REPORT ──────────────────────────────
async function loadDailyTasks(projectId) {
  const el = document.getElementById('daily-tasks-list');
  if (!el || !projectId) return;
  el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:12px;">Chargement...</div>';
  const res = await api('GET', `/tasks?projectId=${projectId}`);
  if (!res?.success || !res.data.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:12px;">Aucune tâche dans ce projet</div>';
    return;
  }
  const active = res.data.filter(t => t.status !== 'cancelled');
  const byStatus = { todo: [], in_progress: [], done: [], blocked: [] };
  active.forEach(t => { if(byStatus[t.status]) byStatus[t.status].push(t); });

  const statusColor = { todo:'var(--blue)', in_progress:'var(--amber)', done:'var(--green)', blocked:'var(--accent)' };
  const statusLabel = { todo:'À faire', in_progress:'En cours', done:'Terminé', blocked:'Bloqué' };

  let html = '';
  ['in_progress','todo','blocked','done'].forEach(s => {
    if (!byStatus[s].length) return;
    html += `<div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.7px;margin:8px 0 4px;">${statusLabel[s]}</div>`;
    byStatus[s].forEach(t => {
      const isDone = DAILY_TASK_UPDATES[t.id] === 'done' || t.status === 'done';
      const isInProg = DAILY_TASK_UPDATES[t.id] === 'in_progress' || (t.status === 'in_progress' && !DAILY_TASK_UPDATES[t.id]);
      html += `<div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:var(--radius);margin-bottom:3px;background:var(--bg3);border:1px solid ${isDone?'rgba(45,198,83,.3)':'var(--border)'};">
        <input type="checkbox" ${isDone?'checked':''} onchange="toggleTaskDone('${t.id}','${t.status}',this.checked)" style="accent-color:var(--green);width:15px;height:15px;flex-shrink:0;cursor:pointer;">
        <div style="flex:1;min-width:0;">
          <div style="font-size:12px;font-weight:${isDone?'400':'500'};color:${isDone?'var(--text3)':'var(--text)'};${isDone?'text-decoration:line-through;':''}white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${t.title}</div>
          ${t.assignedTo?`<div style="font-size:10px;color:var(--text3);">👤 ${t.assignedTo.firstName} ${t.assignedTo.lastName}</div>`:''}
        </div>
        <div style="display:flex;gap:3px;flex-shrink:0;">
          ${t.status!=='in_progress'&&!isDone?`<button onclick="setTaskInProgress('${t.id}')" style="background:rgba(244,162,97,.15);color:var(--amber);border:none;border-radius:5px;padding:2px 6px;font-size:10px;cursor:pointer;">▶ En cours</button>`:''}
        </div>
      </div>`;
    });
  });
  el.innerHTML = html;
}

function toggleTaskDone(taskId, currentStatus, checked) {
  if (checked) {
    DAILY_TASK_UPDATES[taskId] = 'done';
  } else {
    DAILY_TASK_UPDATES[taskId] = currentStatus === 'done' ? 'todo' : currentStatus;
  }
  // Refresh visual
  const projectId = document.getElementById('daily-project').value;
  if (projectId) loadDailyTasks(projectId);
}

function setTaskInProgress(taskId) {
  DAILY_TASK_UPDATES[taskId] = 'in_progress';
  const projectId = document.getElementById('daily-project').value;
  if (projectId) loadDailyTasks(projectId);
}

// ── CREATE DAILY REPORT ──────────────────────────────────────
let PENDING_DAILY_PHOTOS = [];
let HANDOVER_ZONES = [{id:1,name:'',status:'ok',comment:'',photos:[],_photoFiles:[]}];

// ═══════════════════════════════════════════════════════
// HANDOVER — ZONES TERRAIN
// ═══════════════════════════════════════════════════════

function addHandoverZone(prefill='') {
  const id = Date.now();
  HANDOVER_ZONES.push({id, name:prefill, status:'ok', comment:'', photos:[], _photoFiles:[]});
  renderHandoverZones();
  setTimeout(() => {
    const input = document.getElementById('hz-name-'+id);
    if (input) { input.focus(); input.scrollIntoView({behavior:'smooth',block:'center'}); }
  }, 80);
}

function addHandoverZoneVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Dictée non supportée sur ce navigateur','error'); return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR(); rec.lang='fr-FR'; rec.interimResults=false;
  toast('🎙️ Parlez la zone...','info');
  rec.onresult = e => { addHandoverZone(e.results[0][0].transcript); toast('Zone ajoutée ✅','success'); };
  rec.onerror = () => toast('Erreur dictée','error');
  rec.start();
}

function addZoneVoiceComment(zoneId) {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    toast('Dictée non supportée','error'); return;
  }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const rec = new SR(); rec.lang='fr-FR'; rec.interimResults=false;
  toast('🎙️ Dictez le commentaire...','info');
  rec.onresult = e => {
    const text = e.results[0][0].transcript;
    const zone = HANDOVER_ZONES.find(x=>x.id===zoneId);
    if (zone) zone.comment = (zone.comment ? zone.comment+' ' : '')+text;
    renderHandoverZones();
    toast('Commentaire ajouté','success');
  };
  rec.onerror = () => toast('Erreur dictée','error');
  rec.start();
}

function previewZonePhoto(zoneId, input) {
  if (!input.files?.length) return;
  const file = input.files[0];
  const url = URL.createObjectURL(file);
  const zone = HANDOVER_ZONES.find(x=>x.id===zoneId);
  if (zone) {
    zone.photos = zone.photos || [];
    zone.photos.push(url);
    zone._photoFiles = zone._photoFiles || [];
    zone._photoFiles.push(file);
    renderHandoverZones();
  }
}

function renderHandoverZones() {
  const list = document.getElementById('handover-zones-list');
  if (!list) return;
  if (!HANDOVER_ZONES.length) {
    list.innerHTML = '<div style="color:var(--text3);font-size:12px;text-align:center;padding:16px;">Appuyez sur + pour ajouter un point</div>';
    return;
  }
  const stColors = {ok:'var(--green)',remark:'var(--amber)',defect:'var(--accent)',pending:'var(--text3)'};
  list.innerHTML = HANDOVER_ZONES.map((z,idx) => `
    <div style="background:var(--bg3);border:1px solid var(--border);border-left:3px solid ${stColors[z.status]||'var(--border)'};border-radius:10px;overflow:hidden;" id="hz-card-${z.id}">
      <div style="display:flex;align-items:center;gap:8px;padding:10px 12px 6px;">
        <div style="width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${idx+1}</div>
        <input class="input" id="hz-name-${z.id}" placeholder="Zone / Emplacement..." value="${z.name}"
          oninput="HANDOVER_ZONES.find(x=>x.id===${z.id}).name=this.value"
          style="flex:1;font-size:14px;font-weight:600;background:transparent;border:none;padding:4px 0;border-bottom:1px solid var(--border);">
        <button onclick="addZoneVoiceComment(${z.id})" style="background:none;border:none;cursor:pointer;font-size:16px;" title="Dicter commentaire">🎙️</button>
        <button onclick="HANDOVER_ZONES=HANDOVER_ZONES.filter(x=>x.id!==${z.id});renderHandoverZones()" style="background:none;border:none;cursor:pointer;color:var(--accent);font-size:18px;">✕</button>
      </div>
      <div style="display:flex;gap:8px;padding:0 12px 8px;align-items:center;">
        <select class="input" style="font-size:12px;padding:5px 8px;width:140px;flex-shrink:0;"
          onchange="HANDOVER_ZONES.find(x=>x.id===${z.id}).status=this.value;renderHandoverZones()">
          <option value="ok" ${z.status==='ok'?'selected':''}>✅ OK</option>
          <option value="remark" ${z.status==='remark'?'selected':''}>⚠️ Remarque</option>
          <option value="defect" ${z.status==='defect'?'selected':''}>❌ Défaut</option>
          <option value="pending" ${z.status==='pending'?'selected':''}>⏳ En attente</option>
        </select>
        <input class="input" placeholder="Commentaire..." value="${z.comment}"
          oninput="HANDOVER_ZONES.find(x=>x.id===${z.id}).comment=this.value"
          style="flex:1;font-size:12px;">
      </div>
      <div style="padding:0 12px 10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
        ${(z.photos||[]).map(p=>`<img src="${p}" style="width:56px;height:56px;object-fit:cover;border-radius:7px;cursor:pointer;border:1px solid var(--border);" onclick="openPhotoViewer('${p}')">`).join('')}
        <label style="width:56px;height:56px;border:2px dashed var(--border);border-radius:7px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;color:var(--text3);" title="Photo">
          📸<input type="file" accept="image/*" style="display:none;" onchange="previewZonePhoto(${z.id},this)">
        </label>
      </div>
    </div>`).join('');
}

// Called when modal-handover opens
function initHandoverModal() {
  HANDOVER_ZONES = [{id:Date.now(),name:'',status:'ok',comment:'',photos:[],_photoFiles:[]}];
  renderHandoverZones();
  // Set today's date
  const dateEl = document.getElementById('handover-date');
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];
}

// Cache des templates de tâches — rempli au démarrage depuis l'API.
// La source de vérité est désormais la base de données (table task_categories
// + task_templates). L'admin peut modifier dans l'onglet "Templates Tâches"
// et tout est synchronisé sur tous les écrans.
let TASK_TEMPLATES_DATA = {};

// Charge les catégories + templates depuis l'API et alimente TASK_TEMPLATES_DATA
// au format { "Nom catégorie": [{ title, assignees: [] }, ...], ... }.
// Appelé une fois au démarrage et à chaque modification dans l'admin.
async function loadTaskTemplatesFromAPI() {
  const res = await api('GET', '/task-templates/categories');
  if (!res?.success) return;
  const data = {};
  // Tri stable par sortOrder (le backend le renvoie déjà trié)
  for (const cat of res.data || []) {
    data[cat.name] = (cat.templates || []).map(t => ({
      title: t.title,
      assignees: [],   // pas d'assignation par défaut depuis la DB
      _id: t.id,
      _categoryId: cat.id,
    }));
  }
  TASK_TEMPLATES_DATA = data;
}

function previewDailyPhotos(input) {
  PENDING_DAILY_PHOTOS = Array.from(input.files);
  const preview = document.getElementById('daily-photos-preview');
  const count = document.getElementById('daily-photos-count');
  if (!preview) return;
  preview.innerHTML = PENDING_DAILY_PHOTOS.map(f => {
    const url = URL.createObjectURL(f);
    return `<div style="aspect-ratio:1;border-radius:8px;overflow:hidden;border:1px solid var(--border);">
      <img src="${url}" style="width:100%;height:100%;object-fit:cover;display:block;">
    </div>`;
  }).join('');
  if (count) count.textContent = PENDING_DAILY_PHOTOS.length > 0 ? `${PENDING_DAILY_PHOTOS.length} photo(s) sélectionnée(s)` : '';
  if (typeof updateDailySummary === 'function') updateDailySummary();
}

async function createDailyReport(send=false) {
  const projectId = document.getElementById('daily-project').value;
  const date = document.getElementById('daily-date').value;
  if (!projectId || !date) { toast('Projet et date obligatoires', 'error'); return; }

  const entries = DAILY_ENTRIES.map(e => ({ entryTime: e.time, description: e.text }));
  const taskHours = DAILY_TASK_HOURS
    .filter(t => (t.hours || 0) > 0 || (t.workers || 0) > 0)
    .map(t => ({ taskTemplateId: t.taskTemplateId || undefined, taskTitle: t.taskTitle, hours: t.hours || 0, workers: t.workers || 0 }));

  const res = await api('POST', '/daily-reports', {
    projectId, reportDate: date,
    weather: document.getElementById('daily-weather').value,
    workersPresent: parseInt(document.getElementById('daily-workers').value)||0,
    generalNotes: document.getElementById('daily-notes').value || undefined,
    phase: DAILY_PHASE || undefined,
    entries,
    taskHours,
  });

  if (res?.success) {
    // Upload photos
    if (PENDING_DAILY_PHOTOS.length) {
      toast(`Upload ${PENDING_DAILY_PHOTOS.length} photo(s)...`, 'info');
      for (const file of PENDING_DAILY_PHOTOS) {
        const fd = new FormData();
        fd.append('file', file);
        try {
          await fetch(`${API}/upload/daily-photo/${res.data.id}`, {
            method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` }, body: fd
          });
        } catch {}
      }
      PENDING_DAILY_PHOTOS = [];
    }
    // Update task statuses
    const taskUpdates = Object.entries(DAILY_TASK_UPDATES);
    if (taskUpdates.length) {
      await Promise.all(taskUpdates.map(([taskId, status]) =>
        api('PATCH', `/tasks/${taskId}`, { status })
      ));
    }
    toast(`Rapport sauvegardé ✅${taskUpdates.length?` · ${taskUpdates.length} tâche(s) mises à jour`:''}${PENDING_DAILY_PHOTOS.length?` · photos ajoutées`:''}`, 'success');
    closeModal('modal-daily');
    resetDailyReport();
    if (send) sendDailyReport(res.data.id);
    loadDailyReports();
    if (CURRENT_PROJECT_ID) { loadDetailTasks(CURRENT_PROJECT_ID); loadDetailDailyReports(CURRENT_PROJECT_ID); }
  } else toast('Erreur création rapport', 'error');
}

async function createAndSendDailyReport() { await createDailyReport(true); }

async function createHandover() {
  const projectId = document.getElementById('handover-project')?.value;
  if (!projectId) { toast('Sélectionne un projet', 'error'); return; }

  const handoverDate = document.getElementById('handover-date')?.value;
  const clientName   = document.getElementById('handover-client-name')?.value || '';
  const responsible  = document.getElementById('handover-responsible')?.value || '';
  const notes        = document.getElementById('handover-notes')?.value || '';

  // Build items from zones
  const items = HANDOVER_ZONES.filter(z => z.name?.trim()).map((z, i) => ({
    zoneName: z.name.trim(),
    status:   z.status || 'ok',
    comment:  z.comment || undefined,
    sortOrder: i,
  }));
  if (!items.length) items.push({ zoneName: 'Inspection générale', status: 'ok', sortOrder: 0 });

  const btn = event?.target;
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Création...'; }

  const res = await api('POST', '/handover', {
    projectId,
    clientName:    clientName || responsible || undefined,
    generalNotes:  notes || undefined,
    siteManagerId: CURRENT_USER?.id,
    items,
  });

  if (res?.success) {
    const handoverId = res.data.id;
    // Items renvoyés par le backend dans l'ordre de création (sortOrder).
    // On match les photos par INDEX de la zone filtrée (même filtre qu'on a
    // utilisé pour construire items) — c'est plus robuste qu'un match par
    // zoneName, qui plante dès qu'il y a une espace en trop ou deux zones
    // homonymes.
    const filteredZones = HANDOVER_ZONES.filter(z => z.name?.trim());
    const items = (res.data.items || []).slice().sort((a,b) => (a.sortOrder||0) - (b.sortOrder||0));

    let totalUploaded = 0, totalFailed = 0;
    for (let i = 0; i < filteredZones.length; i++) {
      const zone = filteredZones[i];
      const item = items[i];
      if (!item || !zone._photoFiles?.length) continue;
      for (const file of zone._photoFiles) {
        try {
          const fd = new FormData(); fd.append('file', file);
          const up = await fetch(`${API}/upload/photo`, {
            method:'POST', headers:{'Authorization':`Bearer ${TOKEN}`}, body:fd
          });
          if (!up.ok) { console.error('handover upload failed', up.status); totalFailed++; continue; }
          const data = await up.json();
          const url = data.data?.url || data.url;
          if (!url) { totalFailed++; continue; }
          const link = await fetch(`${API}/handover/${handoverId}/items/${item.id}/photo`, {
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`},
            body: JSON.stringify({photoUrl: url, publicId: data.data?.public_id || null})
          });
          if (link.ok) totalUploaded++;
          else { console.error('handover link photo failed', link.status); totalFailed++; }
        } catch (e) {
          console.error('handover upload error', e);
          totalFailed++;
        }
      }
    }
    if (totalUploaded > 0) toast(`${totalUploaded} photo(s) uploadée(s)`, 'success');
    if (totalFailed  > 0) toast(`${totalFailed} photo(s) en échec — voir console`, 'error');

    toast('Handover créé ✅', 'success');
    closeModal('modal-handover');
    HANDOVER_ZONES = [{id: Date.now(), name:'', status:'ok', comment:'', photos:[], _photoFiles:[]}];
    if (CURRENT_PROJECT_ID) loadDetailHandovers(CURRENT_PROJECT_ID);
    loadHandovers();
  } else {
    toast('Erreur création: ' + (res?.error || 'vérifiez la console'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Créer et signer'; }
  }
}

async function createBox() {
  const name = document.getElementById('box-name').value.trim();
  const projectId = document.getElementById('box-project').value;
  if (!name || !projectId) { toast('Nom et projet obligatoires', 'error'); return; }

  const res = await api('POST', '/warehouse/boxes', {
    name, projectId,
    description: document.getElementById('box-desc').value || undefined,
  });
  if (res?.success) { toast('Box créée 📦', 'success'); closeModal('modal-box'); loadWarehouse(); }
  else toast('Erreur', 'error');
}

async function createUser() {
  const firstName = document.getElementById('user-fname').value.trim();
  const lastName  = document.getElementById('user-lname').value.trim();
  const email     = document.getElementById('user-email').value.trim();
  const role      = document.getElementById('user-role').value;
  if (!firstName || !lastName || !email) { toast('Remplis tous les champs', 'error'); return; }

  const payload = {
    firstName, lastName, email, role,
    phone:          document.getElementById('user-phone').value.trim()         || undefined,
    birthDate:      document.getElementById('user-birthdate').value.trim()     || undefined,
    birthPlace:     document.getElementById('user-birthplace').value.trim()    || undefined,
    nationality:    document.getElementById('user-nationality').value.trim()   || undefined,
    idNumber:       document.getElementById('user-id-number').value.trim()     || undefined,
    nationalNumber: document.getElementById('user-national-nr').value.trim()   || undefined,
    idExpiry:       document.getElementById('user-id-expiry').value.trim()     || undefined,
    teamGroupId:    document.getElementById('user-team-group').value           || undefined,
  };

  const res = await api('POST', '/users', payload);
  if (res?.success) { toast('Compte créé · Mot de passe : VEM2025! ✅', 'success'); closeModal('modal-user'); loadTeam(); loadAll(); }
  else toast('Erreur création compte', 'error');
}

// ═══ POPULATE SELECTS ═══
function populateProjectSelects() {
  const selects = ['proj-client','ticket-project','task-project','daily-project','handover-project','box-project'];
  // Load clients for proj-client
  loadClients();
  // Other project selects
  ['ticket-project','task-project','daily-project','handover-project','box-project'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const cur = el.value;
    el.innerHTML = '<option value="">— Sélectionner —</option>' + PROJECTS.map(p => `<option value="${p.id}">${p.name} (${p.internalNumber})</option>`).join('');
    if (cur) el.value = cur;
  });
}

async function loadClients() {
  const res = await api('GET', '/clients');
  if (!res?.success) return;
  CLIENTS = res.data;
  const opts = '<option value="">— Sélectionner —</option>' + res.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  ['proj-client'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { const cur = el.value; el.innerHTML = opts; if(cur) el.value = cur; }
  });
}

// ── CLIENT CONTACTS ──
let CLIENT_CONTACTS_COUNT = 1;

function addClientContact() {
  const idx = CLIENT_CONTACTS_COUNT++;
  const list = document.getElementById('client-contacts-list');
  const div = document.createElement('div');
  div.className = 'client-contact-row';
  div.id = `contact-${idx}`;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;margin-bottom:6px;';
  div.innerHTML = `
    <input class="input" placeholder="Prénom Nom" id="contact-${idx}-name" style="font-size:12px;">
    <input class="input" placeholder="Email" id="contact-${idx}-email" type="email" style="font-size:12px;">
    <input class="input" placeholder="Téléphone" id="contact-${idx}-phone" style="font-size:12px;">
    <button class="btn btn-ghost btn-xs" style="color:var(--accent);" onclick="this.closest('.client-contact-row').remove()">✕</button>`;
  list.appendChild(div);
}

async function createClientAndReturn() {
  const name = document.getElementById('client-name').value.trim();
  if (!name) { toast('Nom de société obligatoire', 'error'); return; }

  // Collect contacts (tous, pas seulement le 1er) + marque le 1er comme principal
  const contacts = [];
  document.querySelectorAll('.client-contact-row').forEach((row, i) => {
    const cname  = document.getElementById(`contact-${i}-name`)?.value.trim();
    const cemail = document.getElementById(`contact-${i}-email`)?.value.trim();
    const cphone = document.getElementById(`contact-${i}-phone`)?.value.trim();
    if (cname || cemail || cphone) {
      contacts.push({
        name: cname || '(sans nom)',
        email: cemail || null,
        phone: cphone || null,
        isPrimary: contacts.length === 0,  // le 1er rempli devient principal
        sortOrder: i,
      });
    }
  });
  // Filtrer les contacts sans vrai nom
  const validContacts = contacts.filter(c => c.name && c.name !== '(sans nom)');

  const primary = validContacts[0] || {};
  const res = await api('POST', '/clients', {
    name,
    vat:         document.getElementById('client-vat').value || null,
    contactName: primary.name || null,
    email:       document.getElementById('client-email').value || primary.email || null,
    phone:       document.getElementById('client-phone').value || primary.phone || null,
    address:     document.getElementById('client-address').value || null,
    contacts:    validContacts,
  });

  if (res?.success) {
    toast(`Client "${name}" créé ✅`, 'success');
    closeModal('modal-new-client');
    // Reset form
    ['client-name','client-vat','client-address','client-email','client-phone'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value='';
    });
    CLIENT_CONTACTS_COUNT = 1;
    const list = document.getElementById('client-contacts-list');
    if (list) {
      // Reset to single contact row
      list.querySelectorAll('.client-contact-row:not(#contact-0)').forEach(r=>r.remove());
      ['contact-0-name','contact-0-email','contact-0-phone'].forEach(id=>{
        const el=document.getElementById(id); if(el) el.value='';
      });
    }
    // Reload clients and select the new one
    await loadClients();
    const sel = document.getElementById('proj-client');
    if (sel) sel.value = res.data.id;
    toast('Client sélectionné dans le projet', 'success');
  } else toast('Erreur création client', 'error');
}

function populateUserSelects() {
  ['ticket-assign','task-assign','remark-assign'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = '<option value="">— Non assigné —</option>' + USERS.map(u => `<option value="${u.id}">${u.firstName} ${u.lastName}</option>`).join('');
  });
}

// ═══ MODAL HELPERS ═══
function showModal(id) {
  document.getElementById(id).classList.add('open');
  const today = new Date().toISOString().split('T')[0];
  if (id === 'modal-daily') {
    document.getElementById('daily-date').value = today;
    resetDailyReport();
    // Load tasks if project already selected
    const pid = document.getElementById('daily-project').value || CURRENT_PROJECT_ID;
    if (pid) { document.getElementById('daily-project').value = pid; loadDailyTasks(pid); }
  }
  if (id === 'modal-task')    document.getElementById('task-date').value  = today;
  if (id === 'modal-proj') {
    // Reset complet du formulaire — sinon les valeurs du projet précédent
    // restent visibles et l'utilisateur doit tout effacer à la main.
    // On NE reset PAS si on est en mode édition (les champs ont été pré-remplis).
    if (!EDITING_PROJECT_ID) {
      const modal = document.getElementById('modal-proj');
      if (modal) {
        modal.querySelectorAll('input').forEach(i => {
          if (i.type === 'date' || i.type === 'datetime-local') i.value = '';
          else if (i.type === 'checkbox' || i.type === 'radio') i.checked = false;
          else if (i.type === 'file') i.value = '';
          else i.value = '';
        });
        modal.querySelectorAll('textarea').forEach(t => t.value = '');
        modal.querySelectorAll('select').forEach(s => { s.selectedIndex = 0; });
      }
      PROJ_TRUCKS = [];
      if (typeof renderProjTrucks === 'function') renderProjTrucks();
    }
    // Titre + bouton selon le mode
    const titleEl = document.querySelector('#modal-proj .modal-title');
    const btnEl   = document.getElementById('proj-create-btn');
    if (titleEl) titleEl.innerHTML = EDITING_PROJECT_ID ? '✏️ Modifier le projet' : '🏗️ Nouveau Projet';
    if (btnEl)   btnEl.innerHTML   = EDITING_PROJECT_ID ? '💾 Enregistrer les modifications' : '✅ Créer le Projet';
    loadProjTemplateSelector();
  }
  if (id === 'modal-new-visite') {
    const vd = document.getElementById('visite-date'); if(vd) vd.value = today;
    const vps = document.getElementById('visite-project');
    if(vps) { vps.innerHTML = '<option value="">— Sélectionner —</option>' + PROJECTS.map(p=>`<option value="${p.id}">${p.name}</option>`).join(''); if(CURRENT_PROJECT_ID) vps.value=CURRENT_PROJECT_ID; }
    const vas = document.getElementById('visite-assigned');
    if(vas) { vas.innerHTML = '<option value="">— Non assigné —</option>' + USERS.map(u=>`<option value="${u.id}">${u.firstName} ${u.lastName}</option>`).join(''); }
  }
  if (id === 'modal-handover') {
    // Set today date
    if (document.getElementById('handover-date')) document.getElementById('handover-date').value = today;
    // Init zones
    HANDOVER_ZONES = [{id:1,name:'',status:'ok',comment:''},{id:2,name:'',status:'ok',comment:''}];
    renderHandoverZones();
    // Populate site manager select with site_managers and managers
    const smSel = document.getElementById('handover-site-manager');
    if (smSel) {
      const sms = USERS.filter(u=>['site_manager','technical_manager','project_manager','admin'].includes(u.role));
      smSel.innerHTML = '<option value="">— Sélectionner —</option>' + sms.map(u=>`<option value="${u.id}" ${u.id===CURRENT_USER?.id?'selected':''}>${u.firstName} ${u.lastName} (${u.role})</option>`).join('');
    }
    // Pre-select project if in detail
    if (CURRENT_PROJECT_ID && document.getElementById('handover-project')) {
      document.getElementById('handover-project').value = CURRENT_PROJECT_ID;
    }
    // Populate client select (base de données)
    const cliSel = document.getElementById('handover-client-select');
    if (cliSel && CLIENTS?.length) {
      cliSel.innerHTML = '<option value="">— Choisir dans la base —</option>' +
        CLIENTS.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
    // Si projet pré-sélectionné, pré-remplir avec son client
    if (CURRENT_PROJECT_ID) {
      const proj = PROJECTS.find(p => p.id === CURRENT_PROJECT_ID);
      if (proj?.client?.id && cliSel) {
        cliSel.value = proj.client.id;
        onHandoverClientPick(proj.client.id);
      }
    }
    // Vider les champs manuels pour repartir propre
    const nameEl = document.getElementById('handover-client-name');
    const respEl = document.getElementById('handover-responsible');
    const mailEl = document.getElementById('handover-client-email');
    const ctSel  = document.getElementById('handover-contact-select');
    if (nameEl && !nameEl.value) nameEl.value = '';
    if (respEl && !respEl.value) respEl.value = '';
    if (mailEl && !mailEl.value) mailEl.value = '';
    if (ctSel)  ctSel.innerHTML = '<option value="">— Choix base —</option>';
  }
}

// Quand l'utilisateur choisit un client dans la liste base, on auto-remplit le nom
// et l'email s'ils sont vides. On peuple aussi le select de contact (s'il y a un
// contactName en base, on le propose en option). L'utilisateur peut ensuite
// surcharger les champs libres en dessous.
function onHandoverClientPick(clientId) {
  const c = (CLIENTS || []).find(x => x.id === clientId);
  if (!c) return;
  const nameEl = document.getElementById('handover-client-name');
  const respEl = document.getElementById('handover-responsible');
  const mailEl = document.getElementById('handover-client-email');
  const ctSel  = document.getElementById('handover-contact-select');

  // Nom client : on remplace s'il était vide
  if (nameEl && !nameEl.value.trim()) nameEl.value = c.name || '';
  // Email : pareil
  if (mailEl && !mailEl.value.trim()) mailEl.value = c.email || '';
  // Select contact : on propose ce qu'on a en base
  if (ctSel) {
    const opts = ['<option value="">— Choix base —</option>'];
    if (c.contactName) opts.push(`<option value="${esc(c.contactName)}">${esc(c.contactName)}</option>`);
    ctSel.innerHTML = opts.join('');
    // Auto-sélectionner le contact si c'est le seul
    if (c.contactName) {
      ctSel.value = c.contactName;
      if (respEl && !respEl.value.trim()) respEl.value = c.contactName;
    }
  }
}

// Quand l'utilisateur choisit un contact dans la liste, on rebascule la valeur
// dans le champ libre (qui sert de source de vérité finale au moment du submit).
function onHandoverContactPick(name) {
  if (!name) return;
  const respEl = document.getElementById('handover-responsible');
  if (respEl) respEl.value = name;
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  // Si on ferme le modal projet, on sort du mode édition pour ne pas le réutiliser
  // par erreur si l'utilisateur ouvre ensuite "+ Nouveau Projet"
  if (id === 'modal-proj') EDITING_PROJECT_ID = null;
}

// Volontairement PAS de fermeture au clic sur le fond ("outside click") : sur
// mobile, un scroll/swipe qui se termine sur le fond du modal est souvent
// interprété comme un clic → le modal se refermait tout seul et on perdait
// tout ce qui avait été rempli. Il faut désormais utiliser explicitement la
// croix ✕ ou "Annuler" pour fermer un formulaire — pas de fermeture "par accident".

// ═══ DROPDOWN ═══
function toggleDropdown(id) {
  const menu = document.getElementById(id);
  const wasOpen = menu.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) menu.classList.add('open');
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
}

document.addEventListener('click', e => {
  if (!e.target.closest('.dropdown') && !e.target.closest('#topbar-avatar') && !e.target.closest('.nav-user')) {
    closeAllDropdowns();
  }
});

// ═══ PROFILE MODAL ═══
function showProfile() {
  closeAllDropdowns();
  if (!CURRENT_USER) return;
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:460px;">
      <div class="modal-head"><div class="modal-title">👤 Mon Profil</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div style="text-align:center;margin-bottom:18px;">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;color:#fff;margin:0 auto 12px;">${(CURRENT_USER.firstName[0]+CURRENT_USER.lastName[0]).toUpperCase()}</div>
        <div style="font-family:'Syne',sans-serif;font-size:18px;font-weight:700;">${CURRENT_USER.firstName} ${CURRENT_USER.lastName}</div>
        <div style="color:var(--text3);font-size:13px;margin-top:4px;">${CURRENT_USER.role}</div>
      </div>

      <div style="background:var(--bg3);border-radius:var(--radius);padding:14px;font-size:13px;display:grid;gap:8px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;"><span style="color:var(--text3);">Email</span><span>${CURRENT_USER.email}</span></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:var(--text3);">Rôle</span><span>${CURRENT_USER.role}</span></div>
      </div>

      <!-- Toggle changement mot de passe -->
      <div id="pwd-section">
        <button class="btn btn-outline" style="width:100%;" onclick="togglePasswordPanel(true)">🔑 Changer mon mot de passe</button>
      </div>

      <!-- Panneau de changement (caché par défaut) -->
      <div id="pwd-panel" style="display:none;background:var(--bg3);border-radius:var(--radius);padding:14px;margin-top:10px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">🔑 Changer le mot de passe</div>
        <div class="form-group" style="margin-bottom:8px;">
          <label class="form-label" style="font-size:11px;">Ancien mot de passe</label>
          <input class="input" type="password" id="pwd-current" autocomplete="current-password">
        </div>
        <div class="form-group" style="margin-bottom:8px;">
          <label class="form-label" style="font-size:11px;">Nouveau mot de passe (8 caractères min)</label>
          <input class="input" type="password" id="pwd-new" autocomplete="new-password">
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label" style="font-size:11px;">Confirmer le nouveau mot de passe</label>
          <input class="input" type="password" id="pwd-confirm" autocomplete="new-password">
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" onclick="togglePasswordPanel(false)">Annuler</button>
          <button class="btn btn-primary btn-sm" onclick="submitPasswordChange()">💾 Valider</button>
        </div>
      </div>

      <div style="margin-top:18px;display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
        <button class="btn btn-primary btn-sm" style="background:var(--accent);" onclick="doLogout()">🚪 Déconnexion</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if(e.target===el) el.remove(); });
}

function togglePasswordPanel(show) {
  document.getElementById('pwd-section').style.display = show ? 'none' : 'block';
  document.getElementById('pwd-panel').style.display   = show ? 'block' : 'none';
  if (show) setTimeout(() => document.getElementById('pwd-current')?.focus(), 50);
}

async function submitPasswordChange() {
  const current = document.getElementById('pwd-current').value;
  const next    = document.getElementById('pwd-new').value;
  const confirm = document.getElementById('pwd-confirm').value;

  if (!current || !next || !confirm) { toast('Remplis tous les champs', 'error'); return; }
  if (next.length < 8)               { toast('Le nouveau mot de passe doit faire au moins 8 caractères', 'error'); return; }
  if (next !== confirm)              { toast('Les deux nouveaux mots de passe ne correspondent pas', 'error'); return; }
  if (current === next)              { toast("Le nouveau doit être différent de l'ancien", 'error'); return; }

  const res = await api('POST', '/auth/change-password', { currentPassword: current, newPassword: next });
  if (res?.success) {
    toast('Mot de passe modifié ✅', 'success');
    document.querySelector('.overlay.open')?.remove();
  } else {
    toast(res?.error || 'Erreur lors du changement', 'error');
  }
}

// ═══ TOAST ═══
function toast(msg, type='info') {
  const c = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// ═══ UTILS ═══
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  // Si l'heure est différente de minuit (= heure réellement renseignée),
  // on affiche date + heure. Sinon on affiche juste la date.
  const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0;
  if (hasTime) {
    return dt.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' }) +
           ' à ' + dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
  }
  return dt.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function fmtDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) + ' ' +
         dt.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
}
/**
 * Convertit un ISO UTC (depuis la BD) en chaîne pour input type="date".
 * Renvoie une string au format "YYYY-MM-DD" en DATE LOCALE.
 */
function toLocalDateInput(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
 
/**
 * Convertit la valeur d'un input datetime-local (heure locale) en ISO UTC
 * pour l'envoi au backend. La conversion est correcte par défaut :
 * `new Date("2025-06-23T08:00")` est interprété comme heure locale.
 *
 * À utiliser à la place de `input.value + 'Z'` qui est BUGGÉ.
 */
function fromLocalDatetimeInput(localString) {
  if (!localString) return null;
  return new Date(localString).toISOString();
}

/**
 * Convertit une date ISO (depuis le backend) en format YYYY-MM-DDTHH:mm
 * pour pré-remplir un input type="datetime-local", en HEURE LOCALE.
 *
 * À utiliser à la place de `new Date(d).toISOString().slice(0,16)` qui décale
 * la valeur affichée du décalage UTC du navigateur (ex: -2h en été en Belgique).
 */
function toLocalDatetimeInput(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
 
/**
 * Idem pour les inputs type="date" : on garde la date au format "YYYY-MM-DD"
 * mais on s'assure qu'elle est interprétée à 00:00 LOCAL et pas 00:00 UTC.
 */
function fromLocalDateInput(localString) {
  if (!localString) return null;
  // Force midi (12:00) local pour éviter les bascules de jour dues au décalage
  const d = new Date(localString + 'T12:00:00');
  return d.toISOString();
}
 

function infoRow(label, value) {
  return `<div><div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">${label}</div><div style="font-weight:600;font-size:13px;">${value}</div></div>`;
}

// ═══ CLIENTS PAGE ═══
async function loadClientsPage() {
  const res = await api('GET', '/clients');
  const el = document.getElementById('clients-grid');
  if (!el) return;
  if (!res?.success || !res.data.length) {
    el.innerHTML = '<div class="empty" style="grid-column:1/-1;"><div class="empty-icon">🏢</div><div class="empty-title">Aucun client</div><div class="empty-sub">Créez votre premier client</div></div>';
    return;
  }
  CLIENTS = res.data;
  el.innerHTML = res.data.map(c => `
    <div class="card" style="cursor:pointer;" onclick="openClientDetail('${c.id}')">
      <div class="card-header">
        <div><div class="card-title">🏢 ${c.name}</div>${c.contactName?`<div style="font-size:12px;color:var(--text3);">👤 ${c.contactName}</div>`:''}</div>
        <button class="btn btn-ghost btn-xs" onclick="event.stopPropagation();editClient('${c.id}')">✏️</button>
      </div>
      <div class="card-body" style="padding:10px 18px;font-size:13px;display:grid;gap:4px;">
        ${c.email?`<div>✉️ ${c.email}</div>`:''}
        ${c.phone?`<div>📞 ${c.phone}</div>`:''}
        ${c.address?`<div style="color:var(--text3);">📍 ${c.address}</div>`:''}
      </div>
    </div>`).join('');
}

async function openClientDetail(id) {
  // Re-fetch pour récupérer les contacts (pas inclus dans la liste légère)
  const detail = await api('GET', `/clients/${id}`);
  if (!detail?.success) { toast('Client introuvable', 'error'); return; }
  const client = detail.data;
  const clientProjects = client.projects || [];
  const contacts = client.contacts || [];

  const contactsHtml = contacts.length ? `
    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Personnes de contact (${contacts.length})</div>
      ${contacts.map(c => `
        <div style="display:flex;justify-content:space-between;align-items:start;padding:8px 0;border-bottom:1px solid var(--border);gap:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;">${c.isPrimary?'★ ':''}${escapeHtml(c.name)}${c.role?` <span style="font-weight:400;color:var(--text3);font-size:12px;">— ${escapeHtml(c.role)}</span>`:''}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">
              ${c.email?`<span>✉️ ${escapeHtml(c.email)}</span>`:''}
              ${c.email && c.phone?' · ':''}
              ${c.phone?`<span>📞 ${escapeHtml(c.phone)}</span>`:''}
            </div>
          </div>
        </div>
      `).join('')}
    </div>` : '';

  const el = document.createElement('div'); el.className='overlay open';
  el.innerHTML=`
    <div class="modal" style="max-width:620px;">
      <div class="modal-head"><div class="modal-title">🏢 ${escapeHtml(client.name)}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:8px;">
        ${client.vat?`<div><div style="font-size:11px;color:var(--text3);margin-bottom:3px;">TVA</div><div>${escapeHtml(client.vat)}</div></div>`:''}
        ${client.email?`<div><div style="font-size:11px;color:var(--text3);margin-bottom:3px;">EMAIL SOCIÉTÉ</div><div>${escapeHtml(client.email)}</div></div>`:''}
        ${client.phone?`<div><div style="font-size:11px;color:var(--text3);margin-bottom:3px;">TÉLÉPHONE</div><div>${escapeHtml(client.phone)}</div></div>`:''}
        ${client.address?`<div><div style="font-size:11px;color:var(--text3);margin-bottom:3px;">ADRESSE</div><div>${escapeHtml(client.address)}</div></div>`:''}
      </div>
      ${contactsHtml}
      ${clientProjects.length?`<div style="border-top:1px solid var(--border);padding-top:12px;margin-top:12px;"><div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">Projets (${clientProjects.length})</div>${clientProjects.map(p=>`<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;" onclick="this.closest('.overlay').remove();openProject('${p.id}')"><span style="font-weight:600;">${escapeHtml(p.name)}</span><span class="badge badge-${p.status==='installation'?'red':p.status==='completed'?'green':'amber'}">${p.status}</span></div>`).join('')}</div>`:''}
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
        <button class="btn btn-primary btn-sm" onclick="this.closest('.overlay').remove();editClient('${client.id}')">✏️ Modifier</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e=>{if(e.target===el)el.remove();});
}

