// ═══ PIÈCES JOINTES DES DAILY REPORTS ═══════════════════════════════
// Fichiers (PDF, photos, Word / Excel) et état des check-lists du projet joints à un daily report.
// Dans le PDF du rapport : check-lists dessinées dans le rapport, pages des PDF et images ajoutées en annexe
// (lisibles), Word / Excel listés avec leur lien. Backend : src/routes/dailyReports.ts + src/services/dailyAttachments.ts.

/** Cloudinary refuse les fichiers de plus de 10 Mo. */
const DAILY_ATT_MAX = 10 * 1024 * 1024;
const DAILY_ATT_ACCEPT = '.pdf,image/*,.doc,.docx,.xls,.xlsx,.ppt,.pptx';
const DAILY_CHECKLIST_PHASES = {
  preparation: { label: 'Check-list de préparation', icon: '📋' },
  installation: { label: 'Check-list de montage', icon: '☑️' },
  dismantling: { label: 'Check-list de démontage', icon: '🔨' },
};

function dailyAttClass(a) {
  const m = (a.mimeType || '').toLowerCase();
  const ext = (a.fileName || '').split('.').pop().toLowerCase();
  if (m === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (m.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'bmp'].includes(ext)) return 'image';
  if (/msword|officedocument|ms-excel|ms-powerpoint/.test(m) || ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext)) return 'office';
  return 'other';
}

function dailyAttSize(n) {
  if (!n) return '';
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;
}

function dailyAttDateTime(d) {
  return d ? new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}

/** Une ligne de pièce jointe : icône, nom, ce que deviendra le fichier dans le PDF du rapport. */
function dailyAttRowHtml(a, reportId, editable) {
  let icon, detail, color = 'var(--text3)';
  if (a.kind === 'checklist') {
    const ph = DAILY_CHECKLIST_PHASES[a.checklistPhase] || DAILY_CHECKLIST_PHASES.installation;
    const st = a.stats;
    icon = ph.icon;
    detail = `État du ${dailyAttDateTime(a.snapshotAt)}${st ? ` · ${st.ok + st.na}/${st.total} OK${st.partial + st.nok ? ` · ⚠️ ${st.partial + st.nok} problème(s)` : ''}${st.pending ? ` · ${st.pending} à vérifier` : ''}` : ''} · reprise dans le PDF`;
    color = 'var(--green)';
  } else {
    const cls = dailyAttClass(a);
    icon = { pdf: '📄', image: '🖼️', office: '📝', other: '📎' }[cls];
    const size = dailyAttSize(a.sizeBytes);
    if (cls === 'pdf' && a.embeddable) { detail = `PDF · ${a.pageCount || '?'} page(s) · ${size} · pages ajoutées au PDF du rapport`; color = 'var(--green)'; }
    else if (cls === 'pdf') { detail = `PDF ${a.pageCount ? 'protégé' : 'illisible'} · ${size} · envoyé en lien seulement`; color = 'var(--amber)'; }
    else if (cls === 'image') { detail = `Image · ${size} · ajoutée au PDF du rapport`; color = 'var(--green)'; }
    else { detail = `${size} · Word / Excel ne s’affiche pas dans un PDF : envoyé en lien (exporte-le en PDF pour qu’il soit lisible dedans)`; color = 'var(--amber)'; }
  }
  // la check-list jointe est un état figé : elle se lit dans le PDF du rapport
  const open = a.kind === 'checklist' ? '' : `openFileViewer('${a.fileUrl}', ${JSON.stringify(a.fileName).replace(/"/g, '&quot;')})`;
  return `
    <div data-att-id="${a.id}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;">
      <div style="font-size:20px;flex-shrink:0;">${icon}</div>
      <div style="min-width:0;flex:1;${open ? 'cursor:pointer;' : ''}" ${open ? `onclick="${open}"` : ''}>
        <div style="font-size:13px;font-weight:600;overflow-wrap:anywhere;">${esc(a.fileName)}</div>
        <div style="font-size:11px;color:${color};margin-top:2px;">${detail}</div>
      </div>
      ${editable && a.kind === 'checklist' ? `<button type="button" class="btn btn-ghost btn-xs" title="Reprendre l’état actuel de la check-list" onclick="attachChecklistToDaily('${reportId}','${a.checklistPhase}',this)">↻ Actualiser</button>` : ''}
      ${editable ? `<button type="button" class="btn btn-ghost btn-xs" style="color:var(--accent);" title="Retirer" onclick="deleteDailyAttachment('${reportId}','${a.id}',this)">✕</button>` : ''}
    </div>`;
}

/** Check-lists configurées du projet : [{ phase, stats }] (projet non accessible : []). */
async function dailyProjectChecklists(projectId) {
  if (!projectId) return [];
  const res = await Promise.all(Object.keys(DAILY_CHECKLIST_PHASES).map(ph => api('GET', `/checklists/project/${projectId}?phase=${ph}`)));
  return Object.keys(DAILY_CHECKLIST_PHASES)
    .map((ph, i) => ({ phase: ph, cl: res[i]?.success ? res[i].data : null }))
    .filter(x => x.cl && (x.cl.items || []).length)
    .map(x => ({ phase: x.phase, stats: x.cl.stats }));
}

/**
 * Bloc « Pièces jointes » dans un conteneur (modale d'édition ou de lecture d'un daily report).
 * editable : ajout de fichiers, check-lists à joindre / actualiser, suppression.
 */
async function loadDailyAttachmentsBox(containerId, reportId, projectId, editable) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.dataset.reportId = reportId;
  el.dataset.projectId = projectId || '';
  el.dataset.editable = editable ? '1' : '';
  const [att, lists] = await Promise.all([
    api('GET', `/daily-reports/${reportId}/attachments`),
    editable ? dailyProjectChecklists(projectId) : Promise.resolve([]),
  ]);
  if (!document.getElementById(containerId)) return;
  const items = att?.success ? att.data : [];
  const attachedPhases = new Set(items.filter(a => a.kind === 'checklist').map(a => a.checklistPhase));
  const toAttach = lists.filter(l => !attachedPhases.has(l.phase));
  if (!editable && !items.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">📎 Pièces jointes (${items.length})</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">
      ${items.map(a => dailyAttRowHtml(a, reportId, editable)).join('') || '<div style="color:var(--text3);font-size:12px;font-style:italic;padding:4px 0;">Aucune pièce jointe</div>'}
    </div>
    ${editable ? `
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;border:2px dashed var(--border);">
          📎 Ajouter un fichier (PDF, photo, Word, Excel)
          <input type="file" accept="${DAILY_ATT_ACCEPT}" multiple style="display:none;" onchange="uploadDailyAttachments('${reportId}',this)">
        </label>
        ${toAttach.map(l => `<button type="button" class="btn btn-ghost btn-sm" onclick="attachChecklistToDaily('${reportId}','${l.phase}',this)">${DAILY_CHECKLIST_PHASES[l.phase].icon} Joindre la ${DAILY_CHECKLIST_PHASES[l.phase].label.toLowerCase()} (${l.stats.ok + l.stats.na}/${l.stats.total})</button>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:6px;">Les PDF et les photos sont ajoutés lisibles à la fin du PDF du rapport ; la check-list y est reprise telle qu’elle est au moment où tu la joins (↻ pour la mettre à jour).</div>` : ''}`;
}

function reloadDailyAttachmentsBoxes(reportId) {
  document.querySelectorAll(`[data-report-id="${reportId}"]`).forEach(el => {
    if (el.id) loadDailyAttachmentsBox(el.id, reportId, el.dataset.projectId, !!el.dataset.editable);
  });
}

/** Envoie des fichiers (un par un) ; retourne le nombre ajouté. */
async function sendDailyAttachmentFiles(reportId, files) {
  let ok = 0;
  for (const file of files) {
    if (file.size > DAILY_ATT_MAX) { toast(`${file.name} : trop lourd (10 Mo maximum)`, 'error'); continue; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await fetch(`${API}/daily-reports/${reportId}/attachments`, { method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` }, body: fd });
      const data = await r.json().catch(() => null);
      if (r.ok && data?.success) ok++;
      else toast(`${file.name} : ${data?.error || 'erreur ' + r.status}`, 'error');
    } catch { toast(`${file.name} : erreur réseau`, 'error'); }
  }
  return ok;
}

async function uploadDailyAttachments(reportId, input) {
  const files = Array.from(input.files || []);
  input.value = '';
  if (!files.length) return;
  toast(`Envoi de ${files.length} fichier(s)…`, 'info');
  const ok = await sendDailyAttachmentFiles(reportId, files);
  if (ok) toast(`${ok} pièce(s) jointe(s) ajoutée(s) ✅`, 'success');
  reloadDailyAttachmentsBoxes(reportId);
}

async function attachChecklistToDaily(reportId, phase, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const res = await api('POST', `/daily-reports/${reportId}/attachments/checklist`, { phase });
  if (res?.success) toast(`${DAILY_CHECKLIST_PHASES[phase].label} jointe (état actuel) ✅`, 'success');
  else { toast(res?.error || 'Erreur', 'error'); if (btn) btn.disabled = false; }
  reloadDailyAttachmentsBoxes(reportId);
  return !!res?.success;
}

async function deleteDailyAttachment(reportId, attId, btn) {
  if (!confirm('Retirer cette pièce jointe du rapport ?')) return;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const res = await api('DELETE', `/daily-reports/${reportId}/attachments/${attId}`);
  if (res?.success) toast('Pièce jointe retirée', 'success');
  else toast(res?.error || 'Erreur', 'error');
  reloadDailyAttachmentsBoxes(reportId);
}

// ─── Formulaire de création (modal-daily) : fichiers + check-lists, envoyés après la création du rapport ───
let PENDING_DAILY_ATTACHMENTS = [];

async function loadDailyChecklistOptions(projectId) {
  const el = document.getElementById('daily-att-checklists');
  if (!el) return;
  el.innerHTML = '';
  const lists = await dailyProjectChecklists(projectId);
  if (document.getElementById('daily-project')?.value !== projectId) return;
  el.innerHTML = lists.map(l => `
    <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:4px 0;">
      <input type="checkbox" class="daily-att-cl" value="${l.phase}" style="accent-color:var(--accent);">
      ${DAILY_CHECKLIST_PHASES[l.phase].icon} Joindre la ${DAILY_CHECKLIST_PHASES[l.phase].label.toLowerCase()} — état actuel (${l.stats.ok + l.stats.na}/${l.stats.total})
    </label>`).join('');
}

function previewDailyAttachments(input) {
  const files = Array.from(input.files || []);
  input.value = '';
  for (const f of files) {
    if (f.size > DAILY_ATT_MAX) { toast(`${f.name} : trop lourd (10 Mo maximum)`, 'error'); continue; }
    PENDING_DAILY_ATTACHMENTS.push(f);
  }
  renderPendingDailyAttachments();
}

function removePendingDailyAttachment(i) {
  PENDING_DAILY_ATTACHMENTS.splice(i, 1);
  renderPendingDailyAttachments();
}

function renderPendingDailyAttachments() {
  const el = document.getElementById('daily-att-list');
  if (!el) return;
  el.innerHTML = PENDING_DAILY_ATTACHMENTS.map((f, i) => `
    <div style="display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 8px;background:var(--bg3);border-radius:6px;">
      <span style="flex:1;min-width:0;overflow-wrap:anywhere;">${{ pdf: '📄', image: '🖼️', office: '📝', other: '📎' }[dailyAttClass({ mimeType: f.type, fileName: f.name })]} ${esc(f.name)} <span style="color:var(--text3);">${dailyAttSize(f.size)}</span></span>
      <button type="button" class="btn btn-ghost btn-xs" style="color:var(--accent);" onclick="removePendingDailyAttachment(${i})">✕</button>
    </div>`).join('');
}

function resetDailyAttachmentsForm() {
  PENDING_DAILY_ATTACHMENTS = [];
  renderPendingDailyAttachments();
  document.querySelectorAll('.daily-att-cl').forEach(cb => { cb.checked = false; });
}

/** Après la création du rapport : check-lists cochées puis fichiers en attente. */
async function uploadPendingDailyAttachments(reportId) {
  const phases = [...document.querySelectorAll('.daily-att-cl:checked')].map(cb => cb.value);
  for (const ph of phases) await api('POST', `/daily-reports/${reportId}/attachments/checklist`, { phase: ph });
  if (PENDING_DAILY_ATTACHMENTS.length) {
    toast(`Envoi de ${PENDING_DAILY_ATTACHMENTS.length} pièce(s) jointe(s)…`, 'info');
    await sendDailyAttachmentFiles(reportId, PENDING_DAILY_ATTACHMENTS);
  }
  PENDING_DAILY_ATTACHMENTS = [];
}

// ─── PDF : ouvrir pour imprimer ───

/**
 * Ouvre un PDF de l'API dans un nouvel onglet (impression avec le bouton du navigateur).
 * L'onglet est ouvert tout de suite (sinon le navigateur le bloque), puis rempli quand le PDF est prêt.
 */
async function openApiPdf(path) {
  const w = window.open('', '_blank');
  if (w) w.document.write('<p style="font-family:sans-serif;padding:20px;">Préparation du PDF…</p>');
  try {
    const r = await fetch(API + path, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    if (!r.ok) {
      const data = await r.json().catch(() => null);
      throw new Error(data?.error || 'HTTP ' + r.status);
    }
    const url = URL.createObjectURL(new Blob([await r.blob()], { type: 'application/pdf' }));
    if (w) w.location.href = url;
    else window.location.href = url;
  } catch (e) {
    if (w) w.close();
    toast(`PDF impossible : ${e.message}`, 'error');
  }
}

async function printDailyPDF(id) {
  const lang = await pickPdfLang();
  if (!lang) return;
  openApiPdf(`/daily-reports/${id}/pdf?lang=${lang}&inline=1`);
}
