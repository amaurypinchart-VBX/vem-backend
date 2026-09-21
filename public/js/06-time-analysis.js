// Heures par tâche : lues directement depuis les rapports journaliers (saisie
// manuelle heures + hommes par tâche, plus d'extraction/devinette IA depuis du
// texte libre). L'IA n'intervient plus qu'à la toute fin, pour rédiger une
// courte synthèse à partir de ces chiffres déjà exacts.
async function runTimeAnalysisForReport() {
  let projectId = CURRENT_PROJECT_ID;
  if (!projectId) {
    const sel = document.getElementById('report-project-select');
    if (sel) projectId = sel.value;
  }
  if (!projectId) { toast('Sélectionne un projet d\'abord', 'error'); return; }

  const runBtn = document.getElementById('ta-run-btn');
  if (runBtn) runBtn.disabled = true;

  try {
    setTAStatus('📥', 'Chargement des heures saisies dans les rapports journaliers...');
    const res = await api('GET', `/projects/${projectId}/task-hours`);
    if (!res?.success) throw new Error('Erreur chargement des heures par tâche');
    const rows = res.data || [];

    if (!rows.length) {
      setTAStatus('⚠️', 'Aucune heure saisie — remplis le tableau "Heures par tâche" dans les rapports journaliers');
      TA_REPORT_DATA = { categories: [], insights: [], summary: {} };
      renderTAEditTable();
      if (runBtn) runBtn.disabled = false;
      return;
    }

    // Regroupe les lignes par tâche (une catégorie du tableau = une tâche du
    // template Installation/Démontage), chaque ligne = un jour saisi.
    const byTask = new Map();
    rows.forEach(r => {
      const key = r.taskTemplateId || r.taskTitle;
      if (!byTask.has(key)) {
        byTask.set(key, {
          name: r.taskTitle,
          icon: r.icon || '📋',
          color: r.color || null,
          parentCategory: r.categoryName || null,
          templateId: r.taskTemplateId || undefined,
          subtasks: [],
        });
      }
      const date = r.reportDate ? r.reportDate.split('T')[0] : '';
      byTask.get(key).subtasks.push({
        date,
        time: '',
        description: date ? `Journée du ${date}` : r.taskTitle,
        durationHours: r.hours || 0,
        workers: r.workers || 0,
        workersKnown: true,
      });
    });

    const categories = Array.from(byTask.values()).sort((a, b) => {
      const totalA = a.subtasks.reduce((s, st) => s + (st.durationHours || 0) * (st.workers || 0), 0);
      const totalB = b.subtasks.reduce((s, st) => s + (st.durationHours || 0) * (st.workers || 0), 0);
      return totalB - totalA;
    });

    const dates = [...new Set(rows.map(r => r.reportDate ? r.reportDate.split('T')[0] : '').filter(Boolean))].sort();
    const totalManHours = rows.reduce((s, r) => s + (r.hours || 0) * (r.workers || 0), 0);
    const avgWorkers = rows.length ? rows.reduce((s, r) => s + (r.workers || 0), 0) / rows.length : 0;

    TA_REPORT_DATA = {
      categories,
      insights: [],
      summary: {
        totalDays: dates.length,
        avgWorkersPerDay: Math.round(avgWorkers * 10) / 10,
        period: dates.length ? `${dates[0]} → ${dates[dates.length - 1]}` : '',
      },
    };
    renderTAEditTable();

    // Synthèse IA légère — les chiffres sont déjà exacts (saisis à la main),
    // l'IA ne fait ici que rédiger 3-5 phrases d'analyse, best-effort.
    setTAStatus('🤖', 'Rédaction de la synthèse IA...');
    try {
      const summaryLines = categories.map(c => {
        const total = c.subtasks.reduce((s, st) => s + (st.durationHours || 0) * (st.workers || 0), 0);
        return `- ${c.name}${c.parentCategory ? ` (${c.parentCategory})` : ''} : ${total.toFixed(1)}h-hommes sur ${c.subtasks.length} jour(s) saisi(s)`;
      }).join('\n');

      const prompt = `Voici les heures-hommes enregistrées par tâche sur ce chantier (période ${TA_REPORT_DATA.summary.period || 'N/A'}, ${TA_REPORT_DATA.summary.totalDays} jour(s), ${totalManHours.toFixed(1)}h-hommes au total) :

${summaryLines}

Rédige 3 à 5 phrases courtes et concrètes (une par ligne, sans puces ni numéros) qui identifient les tâches ayant pris le plus de temps, d'éventuels déséquilibres, et un point d'attention utile pour la suite. Style factuel, direct. Réponds UNIQUEMENT avec ces phrases, une par ligne, sans autre texte.`;

      const aiRes = await fetch(`${API}/ai/parse-daily`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
        body: JSON.stringify({ text: prompt, mode: 'text' }),
      });
      const aiData = await aiRes.json();
      if (aiData.success) {
        const text = Array.isArray(aiData.data) ? aiData.data.map(e => e.text || e).join(' ') : String(aiData.data || '');
        TA_REPORT_DATA.insights = text.split('\n').map(l => l.replace(/^[-•\d.\s]+/, '').trim()).filter(Boolean);
      }
    } catch (e) {
      console.warn('[TA] synthèse IA indisponible:', e);
    }

    renderTAEditTable();
    setTAStatus('✅', `Analyse terminée — ${totalManHours.toFixed(1)}h-hommes sur ${TA_REPORT_DATA.summary.totalDays} jour(s)`);

  } catch (e) {
    console.error('[TA] error:', e);
    setTAStatus('❌', e.message || 'Erreur analyse');
    toast('Erreur analyse', 'error');
  } finally {
    if (runBtn) runBtn.disabled = false;
  }
}

function renderTAEditTable() {
  if (!TA_REPORT_DATA) return;
  const el = document.getElementById('ta-edit-result');
  if (!el) return;

  const cats = TA_REPORT_DATA.categories || [];
  const barColors = ['#e63946','#4895ef','#2dc653','#f4a261','#9b59b6','#ff6b6b','#8b5cf6','#22d3ee','#facc15','#fb923c','#6b7280'];

  const html = cats.map((cat, ci) => {
    const color = barColors[ci % barColors.length];
    const subs = cat.subtasks || [];
    const catTotalMH = subs.reduce((sum, st) => {
      const w = st.workers ?? 0;
      return sum + (st.durationHours||0) * w;
    }, 0);

    const rows = subs.map((st, si) => {
      const wDisplay = st.workersKnown && st.workers != null ? st.workers : '';
      const wPlaceholder = st.workersKnown ? '' : '?';
      return `
        <div style="display:grid;grid-template-columns:80px 1fr 90px 90px 80px 30px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
          <span style="color:var(--text3);font-family:monospace;font-size:11px;">${st.date||''} ${st.time||''}</span>
          <span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(st.description||'')}">${esc(st.description||'')}</span>
          <div style="display:flex;align-items:center;gap:4px;">
            <input type="number" step="0.25" min="0" value="${st.durationHours||0}"
              onchange="updateTASubtask(${ci},${si},'durationHours',this.value)"
              style="width:60px;background:var(--bg2);border:1px solid var(--border);border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;text-align:right;">
            <span style="color:var(--text3);font-size:11px;">h</span>
          </div>
          <div style="display:flex;align-items:center;gap:4px;">
            <span style="color:var(--text3);font-size:11px;">×</span>
            <input type="number" step="1" min="0" value="${wDisplay}" placeholder="${wPlaceholder}"
              onchange="updateTASubtask(${ci},${si},'workers',this.value)"
              style="width:50px;background:var(--bg2);border:1px solid ${st.workersKnown ? 'var(--border)' : 'var(--amber)'};border-radius:4px;padding:3px 6px;color:var(--text);font-size:12px;text-align:right;">
            <span style="color:var(--text3);font-size:11px;">h.</span>
          </div>
          <span style="text-align:right;font-weight:700;color:${color};font-size:12px;" id="ta-mh-${ci}-${si}">${((st.durationHours||0)*(st.workers||0)).toFixed(1)}H</span>
          <button onclick="removeTASubtask(${ci},${si})" style="background:none;border:none;color:var(--text3);cursor:pointer;font-size:14px;" title="Supprimer">✕</button>
        </div>`;
    }).join('');

    const catColor = cat.color || color;
    return `
      <div style="background:var(--bg2);border-radius:var(--radius);padding:12px;margin-bottom:10px;border-left:4px solid ${catColor};">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:18px;">${cat.icon || '📋'}</span>
            <div>
              <div style="font-weight:700;font-size:14px;color:var(--text);">${esc(cat.name)}${cat.templateId ? '' : ' <span style="color:var(--amber);font-size:11px;">(hors templates)</span>'}</div>
              ${cat.parentCategory ? `<div style="font-size:10px;color:var(--text3);">Catégorie : ${esc(cat.parentCategory)}</div>` : ''}
            </div>
            <span style="font-size:11px;color:var(--text3);">${subs.length} tâche(s)</span>
          </div>
          <div style="text-align:right;">
            <div style="font-size:18px;font-weight:800;color:${catColor};font-family:'Syne',sans-serif;" id="ta-cattotal-${ci}">${catTotalMH.toFixed(1)}H</div>
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase;">Total heures-hommes</div>
          </div>
        </div>
        ${subs.length ? `
          <div style="display:grid;grid-template-columns:80px 1fr 90px 90px 80px 30px;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;font-weight:700;">
            <span>Date</span>
            <span>Description</span>
            <span style="text-align:right;">Durée</span>
            <span style="text-align:right;">Ouvriers</span>
            <span style="text-align:right;">H-hommes</span>
            <span></span>
          </div>
          ${rows}
        ` : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:10px;">Aucune tâche</div>'}
      </div>`;
  }).join('');

  const grandTotal = cats.reduce((sum, cat) =>
    sum + (cat.subtasks||[]).reduce((s,st) => s + (st.durationHours||0)*(st.workers||0), 0), 0);

  el.innerHTML = `
    <div style="background:linear-gradient(135deg,rgba(230,57,70,.12),rgba(72,149,239,.12));border-radius:var(--radius);padding:12px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;font-weight:700;">Total général</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px;">${cats.reduce((n,c)=>n+(c.subtasks||[]).length,0)} tâches · ${TA_REPORT_DATA.summary?.period||''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:26px;font-weight:800;color:var(--accent);font-family:'Syne',sans-serif;" id="ta-grandtotal">${grandTotal.toFixed(1)}H</div>
        <div style="font-size:11px;color:var(--text3);">heures-hommes</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--amber);margin-bottom:8px;">💡 Les champs bordure orange indiquent que l'IA n'a pas trouvé le nombre d'ouvriers — complète-les.</div>
    ${html}
  `;
  el.style.display = 'block';
}

function updateTASubtask(catIdx, subIdx, field, value) {
  if (!TA_REPORT_DATA?.categories?.[catIdx]?.subtasks?.[subIdx]) return;
  const st = TA_REPORT_DATA.categories[catIdx].subtasks[subIdx];
  if (field === 'durationHours') {
    st.durationHours = parseFloat(value) || 0;
  } else if (field === 'workers') {
    const v = value === '' ? null : (parseInt(value) || 0);
    st.workers = v;
    st.workersKnown = v != null;
  }
  const mh = (st.durationHours||0) * (st.workers||0);
  const mhCell = document.getElementById(`ta-mh-${catIdx}-${subIdx}`);
  if (mhCell) mhCell.textContent = `${mh.toFixed(1)}H`;

  const catTotal = (TA_REPORT_DATA.categories[catIdx].subtasks||[])
    .reduce((sum,s)=> sum + (s.durationHours||0)*(s.workers||0), 0);
  const catCell = document.getElementById(`ta-cattotal-${catIdx}`);
  if (catCell) catCell.textContent = `${catTotal.toFixed(1)}H`;

  const grand = TA_REPORT_DATA.categories.reduce((sum, cat) =>
    sum + (cat.subtasks||[]).reduce((s,s2) => s + (s2.durationHours||0)*(s2.workers||0), 0), 0);
  const grandCell = document.getElementById('ta-grandtotal');
  if (grandCell) grandCell.textContent = `${grand.toFixed(1)}H`;
}

function removeTASubtask(catIdx, subIdx) {
  if (!TA_REPORT_DATA?.categories?.[catIdx]?.subtasks) return;
  TA_REPORT_DATA.categories[catIdx].subtasks.splice(subIdx, 1);
  renderTAEditTable();
}

function getSelectedSections() {
  return Array.from(document.querySelectorAll('.report-section-toggle.active'))
    .map(el => el.dataset.section).filter(Boolean);
}

function getReportLang() {
  return document.querySelector('input[name="report-lang"]:checked')?.value || 'fr';
}

function setReportStatus(icon, text, sub='') {
  const el = document.getElementById('report-status');
  if (el) el.style.display = 'block';
  const i = document.getElementById('report-status-icon');
  const t = document.getElementById('report-status-text');
  const s = document.getElementById('report-status-sub');
  if (i) i.textContent = icon;
  if (t) t.textContent = text;
  if (s) s.textContent = sub;
}

// Rend un fragment HTML complet (doctype+head+body) dans un iframe caché, le
// capture avec html2canvas, puis découpe l'image obtenue en pages A4 pour
// produire un vrai fichier PDF (Blob) avec jsPDF — utilisé pour archiver le
// "Rapport IA" dans les fichiers du projet, en plus de l'aperçu imprimable.
async function captureHtmlToPdfBlob(html, pxWidth = 900) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.left = '-99999px';
    iframe.style.top = '0';
    iframe.style.width = pxWidth + 'px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const cleanup = () => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };

    iframe.onload = async () => {
      try {
        const doc = iframe.contentDocument;
        const fullHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight, 200);
        iframe.style.height = fullHeight + 'px';
        // Laisse le temps au reflow avant la capture
        await new Promise(r => setTimeout(r, 200));

        const canvas = await html2canvas(doc.body, {
          width: pxWidth, windowWidth: pxWidth, height: fullHeight,
          scale: 1.5, backgroundColor: '#ffffff', useCORS: true,
        });

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();
        const imgW = pageW;
        const imgH = canvas.height * (imgW / canvas.width);
        const imgData = canvas.toDataURL('image/jpeg', 0.92);

        let heightLeft = imgH;
        let position = 0;
        pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
        heightLeft -= pageH;
        while (heightLeft > 0) {
          position = heightLeft - imgH;
          pdf.addPage();
          pdf.addImage(imgData, 'JPEG', 0, position, imgW, imgH);
          heightLeft -= pageH;
        }

        cleanup();
        resolve(pdf.output('blob'));
      } catch (e) {
        cleanup();
        reject(e);
      }
    };
    iframe.onerror = () => { cleanup(); reject(new Error('Chargement iframe échoué')); };
    iframe.srcdoc = html;
  });
}

// Archive le rapport (HTML déjà généré) dans les fichiers du projet — best
// effort : ne bloque jamais l'affichage/impression du rapport si ça échoue.
async function saveReportToProjectFiles(reportHTML, projectId, project) {
  try {
    const pdfBlob = await captureHtmlToPdfBlob(reportHTML);
    const fileName = `Rapport_${project?.internalNumber || project?.name || projectId}_${new Date().toISOString().slice(0,10)}_${Date.now()}.pdf`;
    const fd = new FormData();
    fd.append('file', pdfBlob, fileName);
    fd.append('category', 'rapport_ia');
    const upRes = await fetch(`${API}/upload/project-file/${projectId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${TOKEN}` },
      body: fd,
    });
    if (upRes.ok) toast('Rapport enregistré dans les fichiers du projet ✅', 'success');
    else toast('Rapport généré mais non sauvegardé dans le projet', 'warning');
  } catch (e) {
    console.error('[report] sauvegarde projet échouée:', e);
    toast('Rapport généré mais non sauvegardé dans le projet', 'warning');
  }
}

async function generateReport(mode) {
  // If no project selected, ask user to pick one
  let projectId = CURRENT_PROJECT_ID;
  if (!projectId) {
    // Try to get from report project selector
    const sel = document.getElementById('report-project-select');
    if (sel) projectId = sel.value;
  }
  if (!projectId) {
    toast('Ouvre un projet avant de générer un rapport','error');
    closeModal('modal-report');
    goto('projects');
    return;
  }
  // Update CURRENT_PROJECT_ID temporarily
  const origProjectId = CURRENT_PROJECT_ID;
  if (!CURRENT_PROJECT_ID) CURRENT_PROJECT_ID = projectId;

  const sections = getSelectedSections();
  if (!sections.length) { toast('Sélectionne au moins une section','error'); return; }

  const pdfBtn = document.getElementById('report-pdf-btn');
  const prevBtn = document.getElementById('report-preview-btn');
  if (pdfBtn) pdfBtn.disabled=true;
  if (prevBtn) prevBtn.disabled=true;

  // Ouvrir la fenêtre MAINTENANT, en réponse directe au clic — le rapport
  // prend plusieurs dizaines de secondes à générer (appels IA), et un
  // window.open() lancé après tous ces await n'est plus considéré comme
  // déclenché par un geste utilisateur : la plupart des navigateurs le
  // bloquent silencieusement, sans erreur visible (exactement le symptôme
  // "rien ne se passe"). On garde le handle et on le remplit une fois prêt.
  const reportWin = window.open('', '_blank');
  if (reportWin) {
    reportWin.document.write('<html><body style="font-family:Arial,sans-serif;padding:60px;text-align:center;color:#555;"><div style="font-size:32px;margin-bottom:16px;">⏳</div>Génération du rapport en cours...<br><span style="font-size:13px;color:#999;">Ça peut prendre jusqu\'à une minute si l\'analyse IA est incluse.</span></body></html>');
  } else {
    toast('Autorise les popups pour générer le rapport','warning');
  }

  try {
    // ── STEP 1: Collect all project data ──
    setReportStatus('🔄','Collecte des données du projet...','Chargement en cours');

    const [projRes, tasksRes, dailyRes, handoverRes, ticketsRes, remarksRes, filesRes, bookingsRes, hotelsRes] = await Promise.all([
      api('GET', `/projects/${CURRENT_PROJECT_ID}`),
      sections.includes('tasks')    ? api('GET', `/tasks?projectId=${CURRENT_PROJECT_ID}`)    : null,
      sections.includes('daily')    ? api('GET', `/daily-reports?projectId=${CURRENT_PROJECT_ID}`) : null,
      sections.includes('handover') ? api('GET', `/handover?projectId=${CURRENT_PROJECT_ID}`) : null,
      sections.includes('tickets')  ? api('GET', `/tickets?projectId=${CURRENT_PROJECT_ID}`)  : null,
      sections.includes('visite')   ? api('GET', `/client-remarks?projectId=${CURRENT_PROJECT_ID}`) : null,
      sections.includes('files')    ? api('GET', `/projects/${CURRENT_PROJECT_ID}/files`)     : null,
      sections.includes('bookings') ? api('GET', `/projects/${CURRENT_PROJECT_ID}/bookings`)  : null,
      sections.includes('bookings') ? api('GET', `/projects/${CURRENT_PROJECT_ID}/hotel-bookings`) : null,
    ]);

    const project = projRes?.data;
    if (!project) { toast('Erreur chargement projet','error'); return; }

    const tasks    = tasksRes?.data    || [];
    const dailys   = dailyRes?.data    || [];
    const handovers = handoverRes?.data || [];
    const tickets  = ticketsRes?.data  || [];
    const remarks  = remarksRes?.data  || [];
    const trucks   = (project.trucks || []).filter(t => t.status !== 'delivered' && t.status !== 'returned');
    const files    = filesRes?.data    || [];
    const bookings = bookingsRes?.data || [];
    const hotels   = hotelsRes?.data   || [];
    const customComment = document.getElementById('report-custom-comment')?.value?.trim() || '';

    // ── STEP 2: AI Summary ──
    let aiSummary = '';
    if (sections.includes('ai_summary')) {
      setReportStatus('🤖','Analyse IA en cours...','Génération du résumé exécutif');
      const lang = getReportLang();
      const langName = {fr:'français',en:'English',nl:'Nederlands'}[lang]||'français';

      const taskDone  = tasks.filter(t=>t.status==='done').length;
      const taskTotal = tasks.length;
      const ticketOpen = tickets.filter(t=>['open','in_progress'].includes(t.status)).length;
      const ticketCritical = tickets.filter(t=>t.urgency==='critical').length;
      const lastDaily = dailys[0];

      const prompt = `Tu es un chef de projet expert. Rédige un résumé exécutif ${langName} pour ce rapport de projet.

PROJET : ${project.name} (${project.internalNumber})
CLIENT : ${project.client?.name||'N/A'}
STATUT : ${project.status}
AVANCEMENT : ${project.progress||0}% (${taskDone}/${taskTotal} tâches)
DATES : ${project.installationStart?.split('T')[0]||'N/A'} → ${project.installationEnd?.split('T')[0]||'N/A'}
${project.dismantlingStart?`DÉMONTAGE : ${project.dismantlingStart?.split('T')[0]} → ${project.dismantlingEnd?.split('T')[0]}`:''}
ÉQUIPE : ${(project.team||[]).map(m=>m.user?.firstName+' '+m.user?.lastName).join(', ')||'N/A'}
OUVRIERS : ${project.workersCount}

TICKETS : ${ticketOpen} ouverts, ${ticketCritical} critiques
${lastDaily?`DERNIER DAILY : ${lastDaily.reportDate?.split('T')[0]} — ${lastDaily.generalNotes||'Pas de notes'}` : ''}
${handovers.length?`HANDOVERS : ${handovers.filter(h=>h.status==='signed').length}/${handovers.length} signés`:''}
${remarks.filter(r=>r.status!=='resolved').length?`POINTS VISITE EN COURS : ${remarks.filter(r=>r.status!=='resolved').length}`:''}

Rédige un résumé de 3-4 paragraphes structurés :
1. État général du projet et avancement
2. Points forts et réalisations
3. Points d'attention et risques
4. Prochaines étapes recommandées

Style : professionnel, factuel, concis. Répondre UNIQUEMENT avec le texte du résumé, sans titre, sans markdown.`;

      const aiRes = await fetch(`${API}/ai/parse-daily`, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${TOKEN}`},
        body: JSON.stringify({ text: prompt, mode: 'text' })
      });
      const aiData = await aiRes.json();
      aiSummary = aiData.success ? (Array.isArray(aiData.data) ? aiData.data.map(e=>e.text||e).join(' ') : String(aiData.data)) : 'Résumé non disponible.';
    }

    // ── STEP 3: Generate HTML report ──
    setReportStatus('📄','Mise en page du rapport...','Génération du document');

    const lang = getReportLang();
    const labels = {
      fr: { report:'Rapport de Projet', client_report:'Rapport Client', date:'Date', status:'Statut',
            progress:'Avancement', team:'Équipe', tasks:'Tâches', daily:'Journal', handover:'Handovers',
            tickets:'Tickets SAV', visite:'Visites Client', logistics:'Logistique', summary:'Résumé Exécutif',
            generated:'Généré le', by:'par VEM — ViewBox Event Manager', done:'Terminé', todo:'À faire',
            in_progress:'En cours', blocked:'Bloqué', open:'Ouvert', resolved:'Résolu', signed:'Signé' },
      en: { report:'Project Report', client_report:'Client Report', date:'Date', status:'Status',
            progress:'Progress', team:'Team', tasks:'Tasks', daily:'Daily Reports', handover:'Handovers',
            tickets:'SAV Tickets', visite:'Client Visits', logistics:'Logistics', summary:'Executive Summary',
            generated:'Generated on', by:'by VEM — ViewBox Event Manager', done:'Done', todo:'To Do',
            in_progress:'In Progress', blocked:'Blocked', open:'Open', resolved:'Resolved', signed:'Signed' },
      nl: { report:'Projectrapport', client_report:'Klantrapport', date:'Datum', status:'Status',
            progress:'Voortgang', team:'Team', tasks:'Taken', daily:'Dagraporten', handover:'Handovers',
            tickets:'SAV Tickets', visite:'Klantbezoeken', logistics:'Logistiek', summary:'Samenvatting',
            generated:'Gegenereerd op', by:'door VEM — ViewBox Event Manager', done:'Klaar', todo:'Te doen',
            in_progress:'Bezig', blocked:'Geblokkeerd', open:'Open', resolved:'Opgelost', signed:'Getekend' },
    };
    const L = labels[lang]||labels.fr;
    const isClient = REPORT_TYPE === 'client';
    const reportTitle = isClient ? L.client_report : L.report;
    const today = new Date().toLocaleDateString(lang==='nl'?'nl-BE':lang==='en'?'en-GB':'fr-FR', {day:'numeric',month:'long',year:'numeric'});

    const statusColor = {draft:'#8892a4',in_preparation:'#f4a261',installation:'#e63946',completed:'#2dc653',cancelled:'#5a6275'}[project.status]||'#8892a4';

    let reportHTML = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${reportTitle} — ${project.name}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f5f6f8;color:#1a1a2e;font-size:14px;}
  .page{max-width:900px;margin:0 auto;background:#fff;}

  /* HEADER */
  .header{background:#1a1a2e;color:#fff;padding:36px 40px;display:flex;justify-content:space-between;align-items:flex-start;}
  .header-brand{display:flex;align-items:center;gap:12px;}
  .brand-mark{width:44px;height:44px;background:#e63946;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;color:#fff;flex-shrink:0;}
  .brand-name{font-size:11px;color:#8892a4;text-transform:uppercase;letter-spacing:1.5px;}
  .header-right{text-align:right;}
  .report-title{font-size:24px;font-weight:800;letter-spacing:-0.5px;}
  .report-meta{font-size:12px;color:#8892a4;margin-top:4px;}

  /* PROJECT HERO */
  .hero{padding:32px 40px;background:linear-gradient(135deg,#1a1a2e 0%,#22262f 100%);color:#fff;border-bottom:3px solid #e63946;}
  .hero-name{font-size:28px;font-weight:800;margin-bottom:6px;}
  .hero-sub{font-size:14px;color:#8892a4;margin-bottom:20px;}
  .hero-stats{display:flex;gap:24px;flex-wrap:wrap;}
  .hero-stat{text-align:center;}
  .hero-stat-val{font-size:32px;font-weight:800;color:#e63946;}
  .hero-stat-lbl{font-size:11px;color:#8892a4;text-transform:uppercase;letter-spacing:.8px;margin-top:2px;}
  .progress-bar{background:rgba(255,255,255,.15);border-radius:99px;height:8px;margin-top:16px;overflow:hidden;}
  .progress-fill{height:100%;background:#e63946;border-radius:99px;}
  .status-pill{display:inline-block;background:${statusColor};color:#fff;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:600;margin-top:8px;}

  /* CONTENT */
  .content{padding:0 40px 40px;}
  .section{margin-top:32px;}
  .section-title{font-size:16px;font-weight:800;border-bottom:2px solid #e63946;padding-bottom:8px;margin-bottom:16px;display:flex;align-items:center;gap:8px;}
  .section-icon{font-size:18px;}

  /* INFO GRID */
  .info-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}
  .info-card{background:#f8f9fb;border-radius:8px;padding:14px;}
  .info-label{font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;}
  .info-value{font-weight:600;font-size:14px;}

  /* AI SUMMARY */
  .ai-box{background:#f0f7ff;border-left:4px solid #4895ef;border-radius:0 8px 8px 0;padding:20px 24px;font-size:14px;line-height:1.8;color:#2a3040;}
  .ai-label{font-size:10px;font-weight:700;color:#4895ef;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;}

  /* TASKS */
  .task-row{display:flex;align-items:center;padding:9px 14px;border-radius:6px;margin-bottom:4px;}
  .task-row:nth-child(even){background:#f8f9fb;}
  .task-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-right:10px;}
  .task-title{flex:1;font-size:13px;}
  .task-badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;}
  .badge-done{background:#e8faf0;color:#1da840;}
  .badge-progress{background:#fff8e8;color:#d48806;}
  .badge-todo{background:#f0f2f5;color:#5a6275;}
  .badge-blocked{background:#fff0f0;color:#e63946;}
  .task-assign{font-size:11px;color:#8892a4;margin-left:8px;}
  .tasks-summary{display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap;}
  .tasks-stat{text-align:center;padding:10px 16px;border-radius:8px;}
  .tasks-stat-val{font-size:22px;font-weight:800;}
  .tasks-stat-lbl{font-size:11px;color:#8892a4;margin-top:2px;}

  /* DAILY */
  .daily-entry{padding:12px 16px;border-left:3px solid #e63946;margin-bottom:10px;background:#f8f9fb;border-radius:0 6px 6px 0;}
  .daily-date{font-weight:700;font-size:13px;color:#1a1a2e;margin-bottom:4px;}
  .daily-meta{font-size:12px;color:#8892a4;margin-bottom:6px;}
  .daily-notes{font-size:13px;color:#4a5568;line-height:1.6;}

  /* TICKETS */
  .ticket-row{display:flex;align-items:flex-start;gap:10px;padding:12px 14px;border-radius:6px;margin-bottom:6px;background:#f8f9fb;}
  .ticket-urgency{width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:5px;}
  .ticket-title{flex:1;font-weight:600;font-size:13px;}
  .ticket-desc{font-size:12px;color:#8892a4;margin-top:3px;}

  /* HANDOVER */
  .handover-card{border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:12px;}
  .handover-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
  .zone-pills{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;}
  .zone-pill{padding:3px 10px;border-radius:99px;font-size:11px;font-weight:600;}
  .zone-ok{background:#e8faf0;color:#1da840;}
  .zone-remark{background:#fff8e8;color:#d48806;}
  .zone-defect{background:#fff0f0;color:#e63946;}

  /* TEAM */
  .team-grid{display:flex;gap:10px;flex-wrap:wrap;}
  .team-card{background:#f8f9fb;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;}
  .team-avatar{width:36px;height:36px;background:#e63946;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;flex-shrink:0;}
  .team-name{font-weight:600;font-size:13px;}
  .team-role{font-size:11px;color:#8892a4;}

  /* FOOTER */
  .footer{background:#1a1a2e;color:#8892a4;padding:20px 40px;display:flex;justify-content:space-between;align-items:center;font-size:12px;}

  @media print{
    body{background:#fff;}
    .page{max-width:100%;}
    .no-print{display:none!important;}
    .section{page-break-inside:avoid;}
  }
</style>
</head>
<body>
<div class="page">

  <!-- PRINT TOOLBAR -->
  <div class="no-print" style="background:#1a1a2e;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:10;">
    <span style="color:#fff;font-weight:600;font-size:14px;">📄 ${reportTitle} — ${project.name}</span>
    <div style="display:flex;gap:8px;">
      <button onclick="window.print()" style="background:#e63946;color:#fff;border:none;padding:8px 18px;border-radius:6px;cursor:pointer;font-weight:600;">🖨️ Imprimer / PDF</button>
      <button onclick="window.close()" style="background:#22262f;color:#8892a4;border:1px solid #2a2f3a;padding:8px 18px;border-radius:6px;cursor:pointer;">✕ Fermer</button>
    </div>
  </div>

  <!-- HEADER -->
  <div class="header">
    <div class="header-brand">
      <div class="brand-mark">V</div>
      <div>
        <div style="font-weight:800;font-size:16px;">ViewBox</div>
        <div class="brand-name">Event Manager</div>
      </div>
    </div>
    <div class="header-right">
      <div class="report-title">${reportTitle}</div>
      <div class="report-meta">${L.generated} ${today}</div>
    </div>
  </div>

  <!-- HERO -->
  <div class="hero">
    <div class="hero-name">${project.name}</div>
    <div class="hero-sub">${project.client?.name||''} ${project.city?'· '+project.city:''} ${project.internalNumber?'· '+project.internalNumber:''}</div>
    <div class="status-pill">${project.status}</div>
    <div class="progress-bar"><div class="progress-fill" style="width:${project.progress||0}%"></div></div>
    <div class="hero-stats" style="margin-top:16px;">
      <div class="hero-stat"><div class="hero-stat-val">${project.progress||0}%</div><div class="hero-stat-lbl">${L.progress}</div></div>
      <div class="hero-stat"><div class="hero-stat-val">${tasks.filter(t=>t.status==='done').length}/${tasks.length}</div><div class="hero-stat-lbl">${L.tasks}</div></div>
      <div class="hero-stat"><div class="hero-stat-val">${project.workersCount||0}</div><div class="hero-stat-lbl">Ouvriers</div></div>
      ${tickets.length?`<div class="hero-stat"><div class="hero-stat-val">${tickets.filter(t=>t.status!=='resolved').length}</div><div class="hero-stat-lbl">${L.tickets}</div></div>`:''}
    </div>
  </div>

  <div class="content">`;

    // ── Section: Overview ──
    if (sections.includes('overview')) {
      const team = project.team || [];
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">📋</span>${lang === 'en' ? 'Project Overview' : 'Vue ensemble'}</div>
      <div class="info-grid">
        <div class="info-card"><div class="info-label">${L.date} début</div><div class="info-value">${project.installationStart?.split('T')[0]||'N/A'}</div></div>
        <div class="info-card"><div class="info-label">${L.date} fin</div><div class="info-value">${project.installationEnd?.split('T')[0]||'N/A'}</div></div>
        <div class="info-card"><div class="info-label">Client</div><div class="info-value">${project.client?.name||'N/A'}</div></div>
        ${project.dismantlingStart?`<div class="info-card"><div class="info-label">Démontage</div><div class="info-value">${project.dismantlingStart?.split('T')[0]} → ${project.dismantlingEnd?.split('T')[0]||'?'}</div></div>`:''}
        <div class="info-card"><div class="info-label">Adresse</div><div class="info-value">${project.address||'N/A'}</div></div>
        <div class="info-card"><div class="info-label">Ouvriers</div><div class="info-value">${project.workersCount}</div></div>
      </div>
      ${team.length ? `
      <div style="margin-top:16px;">
        <div style="font-size:12px;font-weight:700;color:#8892a4;text-transform:uppercase;margin-bottom:10px;">${L.team}</div>
        <div class="team-grid">
          ${team.map(m=>`<div class="team-card">
            <div class="team-avatar">${(m.user?.firstName?.[0]||'?')+(m.user?.lastName?.[0]||'')}</div>
            <div>
              <div class="team-name">${m.user?.firstName||''} ${m.user?.lastName||''}</div>
              <div class="team-role">${m.role}${m.isLead?' ⭐':''}</div>
              ${m.user?.email?`<div style="font-size:10px;color:#4895ef;">✉️ ${m.user.email}</div>`:''}
              ${m.user?.phone?`<div style="font-size:10px;color:#2dc653;">📞 ${m.user.phone}</div>`:''}
            </div>
          </div>`).join('')}
        </div>
      </div>` : ''}
      ${(project.scope || project.installNotes || project.dismantleNotes) ? `
      <div style="margin-top:16px;">
        <div style="font-size:12px;font-weight:700;color:#8892a4;text-transform:uppercase;margin-bottom:10px;">📝 ${lang==='en'?'Project notes':lang==='nl'?'Project notities':'Notes complémentaires'}</div>
        ${project.scope ? `
        <div style="background:#eff6ff;border-left:4px solid #4895ef;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:10px;">
          <div style="font-size:11px;font-weight:700;color:#4895ef;text-transform:uppercase;margin-bottom:6px;">🌐 ${lang==='en'?'Global notes':lang==='nl'?'Globale notities':'Notes globales'}</div>
          <div style="font-size:13px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;">${project.scope.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        </div>` : ''}
        ${project.installNotes ? `
        <div style="background:#fff5f5;border-left:4px solid #e63946;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:10px;">
          <div style="font-size:11px;font-weight:700;color:#e63946;text-transform:uppercase;margin-bottom:6px;">🔨 ${lang==='en'?'Installation notes':lang==='nl'?'Installatie notities':'Notes installation'}</div>
          <div style="font-size:13px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;">${project.installNotes.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        </div>` : ''}
        ${project.dismantleNotes ? `
        <div style="background:#f0fdf4;border-left:4px solid #2dc653;border-radius:0 8px 8px 0;padding:12px 16px;">
          <div style="font-size:11px;font-weight:700;color:#2dc653;text-transform:uppercase;margin-bottom:6px;">🔧 ${lang==='en'?'Dismantle notes':lang==='nl'?'Demontage notities':'Notes démontage'}</div>
          <div style="font-size:13px;line-height:1.6;color:#3a3a3a;white-space:pre-wrap;">${project.dismantleNotes.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        </div>` : ''}
      </div>` : ''}
    </div>`;
    }

    // ── Section: AI Summary ──
    if (sections.includes('ai_summary') && aiSummary) {
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">🤖</span>${L.summary}</div>
      <div class="ai-box">
        <div class="ai-label">🤖 Analyse IA — ViewBox Event Manager</div>
        ${aiSummary.split(' | ').filter(p=>p.trim()).map(p=>`<p style="margin-bottom:12px;">${p}</p>`).join('')}
      </div>
    </div>`;
    }

    // ── Section: Tasks ──
    if (sections.includes('tasks') && tasks.length) {
      const done     = tasks.filter(t=>t.status==='done');
      const inprog   = tasks.filter(t=>t.status==='in_progress');
      const todo     = tasks.filter(t=>t.status==='todo');
      const blocked  = tasks.filter(t=>t.status==='blocked');
      const dotColors = {done:'#2dc653',in_progress:'#f4a261',todo:'#8892a4',blocked:'#e63946'};
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">✅</span>${L.tasks}</div>
      <div class="tasks-summary">
        <div class="tasks-stat" style="background:#e8faf0;"><div class="tasks-stat-val" style="color:#1da840;">${done.length}</div><div class="tasks-stat-lbl">${L.done}</div></div>
        <div class="tasks-stat" style="background:#fff8e8;"><div class="tasks-stat-val" style="color:#d48806;">${inprog.length}</div><div class="tasks-stat-lbl">${L.in_progress}</div></div>
        <div class="tasks-stat" style="background:#f0f2f5;"><div class="tasks-stat-val" style="color:#5a6275;">${todo.length}</div><div class="tasks-stat-lbl">${L.todo}</div></div>
        ${blocked.length?`<div class="tasks-stat" style="background:#fff0f0;"><div class="tasks-stat-val" style="color:#e63946;">${blocked.length}</div><div class="tasks-stat-lbl">${L.blocked}</div></div>`:''}
      </div>
      ${[...inprog,...todo,...blocked,...(isClient?[]:done)].map(t=>`
      <div class="task-row">
        <div class="task-dot" style="background:${dotColors[t.status]||'#8892a4'};"></div>
        <div class="task-title">${t.title}</div>
        ${t.taskDate?`<div style="font-size:11px;color:#8892a4;margin-right:8px;">${t.taskDate?.split('T')[0]||''}</div>`:''}
        <span class="task-badge badge-${t.status==='done'?'done':t.status==='in_progress'?'progress':t.status==='blocked'?'blocked':'todo'}">${L[t.status]||t.status}</span>
        ${t.assignedTo&&!isClient?`<span class="task-assign">👤 ${t.assignedTo.firstName}</span>`:''}
      </div>`).join('')}
    </div>`;
    }

    // ── Section: Analyse Temps par Tâche ──
    if (sections.includes('time_analysis')) {
      if (!TA_REPORT_DATA) {
        setReportStatus('⏱️','Analyse temps par tâche...','L\'IA calcule les heures par catégorie');
        await runTimeAnalysisForReport();
      }
      if (TA_REPORT_DATA) {
        const cats = (TA_REPORT_DATA.categories || []).filter(c => (c.subtasks||[]).length);
        const barColors = ['#e63946','#4895ef','#2dc653','#f4a261','#9b59b6','#ff6b6b','#8b5cf6','#22d3ee','#facc15','#fb923c','#6b7280'];

        const grandTotal = cats.reduce((sum, cat) =>
          sum + (cat.subtasks||[]).reduce((s,st) => s + (st.durationHours||0)*(st.workers||0), 0), 0);

        const catsHTML = cats.map((cat, ci) => {
          const color = cat.color || barColors[ci % barColors.length];
          const icon = cat.icon || '📋';
          const subs = cat.subtasks || [];
          const catTotal = subs.reduce((s,st)=> s+(st.durationHours||0)*(st.workers||0), 0);
          const pct = grandTotal > 0 ? Math.round(catTotal/grandTotal*100) : 0;

          const rows = subs.map(st => {
            const w = st.workers ?? '?';
            const mh = (st.durationHours||0) * (st.workers||0);
            return `
              <tr>
                <td style="padding:6px 8px;font-family:monospace;font-size:11px;color:#8892a4;white-space:nowrap;">${st.date||''} ${st.time||''}</td>
                <td style="padding:6px 8px;font-size:12px;color:#4a5568;">${st.description||''}</td>
                <td style="padding:6px 8px;text-align:right;font-size:12px;color:#1a1a2e;white-space:nowrap;"><strong>${(st.durationHours||0).toFixed(1)}H</strong> × ${w} ${w==='?'?'':'👷'}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:700;color:${color};white-space:nowrap;">${mh.toFixed(1)}H</td>
              </tr>`;
          }).join('');

          return `
            <div style="background:#f9fafb;border-radius:8px;padding:12px;margin-bottom:12px;border-left:4px solid ${color};">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:22px;">${icon}</span>
                  <div>
                    <div style="font-weight:700;font-size:15px;color:#1a1a2e;">${cat.name}</div>
                    <div style="font-size:11px;color:#8892a4;margin-top:2px;">${cat.parentCategory ? `${cat.parentCategory} · ` : ''}${subs.length} tâche(s) · ${pct}% du total</div>
                  </div>
                </div>
                <div style="text-align:right;">
                  <div style="font-size:22px;font-weight:800;color:${color};">${catTotal.toFixed(1)}H</div>
                  <div style="font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.5px;">heures-hommes</div>
                </div>
              </div>
              <div style="background:#e5e7eb;border-radius:4px;height:6px;overflow:hidden;margin-bottom:${subs.length?'10px':'0'};">
                <div style="background:${color};height:100%;width:${pct}%;"></div>
              </div>
              ${subs.length ? `
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                  <thead>
                    <tr style="border-bottom:1px solid #e5e7eb;">
                      <th style="padding:6px 8px;text-align:left;font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Quand</th>
                      <th style="padding:6px 8px;text-align:left;font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Tâche</th>
                      <th style="padding:6px 8px;text-align:right;font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Durée × Ouvriers</th>
                      <th style="padding:6px 8px;text-align:right;font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.5px;font-weight:700;">Total</th>
                    </tr>
                  </thead>
                  <tbody>${rows}</tbody>
                </table>
              ` : ''}
            </div>`;
        }).join('');

        const insightsHTML = (TA_REPORT_DATA.insights||[]).length ? `
          <div style="background:#eff6ff;border-left:3px solid #4895ef;border-radius:8px;padding:12px;margin-bottom:14px;">
            <div style="font-size:11px;font-weight:700;color:#4895ef;text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px;">🤖 Analyse IA</div>
            ${(TA_REPORT_DATA.insights||[]).map(i => `<div style="font-size:13px;color:#4a5568;margin-bottom:4px;">• ${i}</div>`).join('')}
          </div>` : '';

        reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">⏱️</span>Temps passé par tâche</div>
      <div style="background:linear-gradient(135deg,rgba(230,57,70,.08),rgba(72,149,239,.08));border-radius:8px;padding:14px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="font-size:11px;color:#8892a4;text-transform:uppercase;letter-spacing:.6px;font-weight:700;">Total général</div>
          <div style="font-size:11px;color:#8892a4;margin-top:2px;">${cats.reduce((n,c)=>n+(c.subtasks||[]).length,0)} tâches · ${cats.length} catégories · ${TA_REPORT_DATA.summary?.period||''}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:32px;font-weight:800;color:#e63946;">${grandTotal.toFixed(1)}H</div>
          <div style="font-size:11px;color:#8892a4;">heures-hommes totales</div>
        </div>
      </div>
      ${insightsHTML}
      ${catsHTML || '<div style="text-align:center;color:#8892a4;padding:20px;">Aucune tâche catégorisée</div>'}
    </div>`;
      }
    }

    // ── Section: Daily Reports — fetch entries detail ──
    if (sections.includes('daily') && dailys.length && !isClient) {
      setReportStatus('📓','Chargement des daily reports...','');
      // Fetch detail for each report to get entries
      const dailysWithEntries = await Promise.all(
        dailys.slice(0,7).map(r => api('GET', `/daily-reports/${r.id}`).then(res => res?.data || r))
      );
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">📓</span>${L.daily}</div>
      ${dailysWithEntries.map(r => {
        const entries = (r.entries||[]).sort((a,b)=>(a.entryTime||'').localeCompare(b.entryTime||''));
        return `
      <div class="daily-entry">
        <div class="daily-date">${new Date(r.reportDate).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div>
        <div class="daily-meta">👷 ${r.workersPresent} ouvriers · ${r.weather||''}</div>
        ${entries.length ? `
        <div style="margin-top:10px;border-left:2px solid #e63946;padding-left:12px;">
          ${entries.map(e=>`
          <div style="display:flex;gap:10px;margin-bottom:6px;align-items:baseline;">
            <span style="font-family:monospace;font-size:12px;font-weight:700;color:#e63946;flex-shrink:0;min-width:40px;">${e.entryTime||''}</span>
            <span style="font-size:13px;color:#4a5568;line-height:1.5;">${e.description}</span>
          </div>`).join('')}
        </div>` : ''}
        ${r.generalNotes?`<div class="daily-notes" style="margin-top:8px;">${r.generalNotes}</div>`:''}
      </div>`;
      }).join('')}
      ${dailys.length>7?`<div style="text-align:center;color:#8892a4;font-size:12px;margin-top:8px;">... et ${dailys.length-7} rapport(s) supplémentaire(s)</div>`:''}
    </div>`;
    }

    // ── Section: Handovers ──
    if (sections.includes('handover') && handovers.length) {
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">🧾</span>${L.handover}</div>
      ${handovers.map(h=>`
      <div class="handover-card">
        <div class="handover-header">
          <div><strong>${h.clientName||'Handover'}</strong> · ${h.createdAt?.split('T')[0]||''}</div>
          <span class="task-badge ${h.status==='signed'?'badge-done':'badge-progress'}">${L[h.status]||h.status}</span>
        </div>
        <div class="zone-pills">
          ${(h.items||[]).map(i=>`<span class="zone-pill ${i.status==='ok'?'zone-ok':i.status==='remark'?'zone-remark':'zone-defect'}">${i.zoneName}</span>`).join('')}
        </div>
        ${h.generalNotes?`<div style="font-size:12px;color:#8892a4;margin-top:10px;">📝 ${h.generalNotes}</div>`:''}
      </div>`).join('')}
    </div>`;
    }

    // ── Section: Tickets ──
    if (sections.includes('tickets') && tickets.length && !isClient) {
      const urgColors = {critical:'#e63946',high:'#f4a261',medium:'#4895ef',low:'#2dc653'};
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">🛠️</span>${L.tickets}</div>
      ${tickets.map(t=>`
      <div class="ticket-row">
        <div class="ticket-urgency" style="background:${urgColors[t.urgency]||'#8892a4'};"></div>
        <div style="flex:1;">
          <div class="ticket-title">${t.title}</div>
          ${t.locationOnSite?`<div class="ticket-desc">📍 ${t.locationOnSite}</div>`:''}
        </div>
        <span class="task-badge ${t.status==='resolved'?'badge-done':'badge-todo'}">${L[t.status]||t.status}</span>
      </div>`).join('')}
    </div>`;
    }

    // ── Section: Visite Client ──
    if (sections.includes('visite') && remarks.length) {
      const open = remarks.filter(r=>r.status!=='resolved');
      const done = remarks.filter(r=>r.status==='resolved');
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">📸</span>${L.visite}</div>
      ${open.length?`<div style="margin-bottom:10px;font-size:12px;font-weight:700;color:#e63946;">⏳ En cours (${open.length})</div>`:''}
      ${remarks.slice(0,10).map(r=>`
      <div class="ticket-row">
        <div class="ticket-urgency" style="background:${r.priority==='critical'?'#e63946':r.priority==='high'?'#f4a261':'#8892a4'};"></div>
        <div style="flex:1;">
          <div class="ticket-title">${r.title}</div>
          ${r.zone?`<div class="ticket-desc">📍 ${r.zone}</div>`:''}
        </div>
        <span class="task-badge ${r.status==='resolved'?'badge-done':'badge-todo'}">${r.status==='resolved'?L.resolved:'En cours'}</span>
      </div>`).join('')}
    </div>`;
    }

    // ── Section: Logistics ──
    if (sections.includes('logistics') && trucks.length) {
      const icons = {truck:'🚛',van:'🚐',crane:'🏗️',scissor:'✂️',manitou:'🔧',forklift:'🚜',generator:'⚡',machine:'⚙️',other:'📦'};
      const statusLabel = {draft:'📝 Brouillon',planned:'Planifié',loading:'En chargement',in_transit:'En transit',delivered:'✅ Livré',returned:'Retourné'};
      const fmtDT = d => d ? new Date(d).toLocaleDateString('fr-BE',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">🚛</span>${L.logistics}</div>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f0f2f5;">
            <th style="padding:8px 10px;text-align:left;font-weight:700;color:#5a6275;text-transform:uppercase;font-size:11px;">Véhicule</th>
            <th style="padding:8px 10px;text-align:left;font-weight:700;color:#5a6275;text-transform:uppercase;font-size:11px;">Chauffeur</th>
            <th style="padding:8px 10px;text-align:left;font-weight:700;color:#5a6275;text-transform:uppercase;font-size:11px;">📦 Chargement entrepôt</th>
            <th style="padding:8px 10px;text-align:left;font-weight:700;color:#5a6275;text-transform:uppercase;font-size:11px;">🚀 Départ</th>
            <th style="padding:8px 10px;text-align:left;font-weight:700;color:#5a6275;text-transform:uppercase;font-size:11px;">✅ Arrivée site</th>
            <th style="padding:8px 10px;text-align:left;font-weight:700;color:#5a6275;text-transform:uppercase;font-size:11px;">Statut</th>
          </tr>
        </thead>
        <tbody>
          ${trucks.map((t,i)=>`
          <tr style="background:${i%2===0?'#fff':'#f8f9fb'};border-bottom:1px solid #e5e7eb;">
            <td style="padding:8px 10px;font-weight:600;">${icons[t.vehicleType]||'🚛'} ${t.truckNumber||t.vehicleType||'Véhicule'}</td>
            <td style="padding:8px 10px;color:#5a6275;">
              ${t.driverName||'—'}
              ${t.driverPhone?`<br><span style="font-size:11px;color:#4895ef;">📞 ${t.driverPhone}</span>`:''}
            </td>
            <td style="padding:8px 10px;color:#5a6275;font-size:12px;">${fmtDT(t.loadingDate)}</td>
            <td style="padding:8px 10px;color:#5a6275;font-size:12px;">${fmtDT(t.departureDate)}</td>
            <td style="padding:8px 10px;font-size:12px;${t.arrivalDate?'color:#16a34a;font-weight:600;':'color:#d48806;'}">${fmtDT(t.arrivalDate)}</td>
            <td style="padding:8px 10px;">
              <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;background:${t.status==='delivered'?'#e8faf0':t.status==='in_transit'?'#eff6ff':'#f0f2f5'};color:${t.status==='delivered'?'#1da840':t.status==='in_transit'?'#4895ef':'#5a6275'};">
                ${statusLabel[t.status]||t.status}
              </span>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
    }

    // ── Section: Commentaire personnalisé ──
    if (sections.includes('comment') && customComment) {
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">💬</span>${lang==='en'?'Custom Note':lang==='nl'?'Opmerking':'Commentaire'}</div>
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;padding:16px 20px;font-size:14px;line-height:1.7;color:#3a3a3a;white-space:pre-wrap;">
        ${customComment.replace(/</g,'&lt;').replace(/>/g,'&gt;')}
      </div>
    </div>`;
    }

    // ── Section: Bookings (transport + hôtels) ──
    if (sections.includes('bookings') && (bookings.length || hotels.length)) {
      const fmtDT = d => d ? new Date(d).toLocaleDateString('fr-BE',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
      const fmtD  = d => d ? new Date(d).toLocaleDateString('fr-BE',{day:'2-digit',month:'short',year:'numeric'}) : '—';
      const phaseLabel = p => p === 'installation' ? '🔨 Installation' : p === 'dismantling' ? '🔧 Démontage' : (p||'');
      const modeIcon = m => ({plane:'✈️',train:'🚆',car:'🚗',bus:'🚌',taxi:'🚕',other:'🚗'})[m] || '🚗';

      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">✈️</span>${lang==='en'?'Bookings':lang==='nl'?'Boekingen':'Bookings'}</div>

      ${bookings.length ? `
      <div style="margin-bottom:20px;">
        <div style="font-size:12px;font-weight:700;color:#8892a4;text-transform:uppercase;margin-bottom:10px;">🚆 Transports équipe (${bookings.length})</div>
        ${bookings.map(b => `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;background:#e63946;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:13px;">
                ${(b.user?.firstName?.[0]||'?')+(b.user?.lastName?.[0]||'')}
              </div>
              <div>
                <div style="font-weight:700;font-size:14px;">${b.user?.firstName||''} ${b.user?.lastName||''}</div>
                <div style="font-size:11px;color:#8892a4;">${phaseLabel(b.phase)} · Sur site ${fmtD(b.onSiteStart)} → ${fmtD(b.onSiteEnd)}</div>
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px;">
            <div style="background:#f8f9fb;padding:8px 10px;border-radius:6px;">
              <div style="font-size:10px;color:#8892a4;text-transform:uppercase;margin-bottom:3px;">🛬 Aller</div>
              ${b.outboundMode?`<div style="font-weight:600;">${modeIcon(b.outboundMode)} ${b.outboundMode}</div>`:''}
              ${b.outboundDate?`<div style="color:#5a6275;">${fmtDT(b.outboundDate)}</div>`:''}
              ${b.outboundDetails?`<div style="color:#5a6275;font-size:11px;">${b.outboundDetails}</div>`:''}
              ${!b.outboundMode && !b.outboundDate ? '<div style="color:#8892a4;">Non renseigné</div>' : ''}
            </div>
            <div style="background:#f8f9fb;padding:8px 10px;border-radius:6px;">
              <div style="font-size:10px;color:#8892a4;text-transform:uppercase;margin-bottom:3px;">🛫 Retour</div>
              ${b.returnMode?`<div style="font-weight:600;">${modeIcon(b.returnMode)} ${b.returnMode}</div>`:''}
              ${b.returnDate?`<div style="color:#5a6275;">${fmtDT(b.returnDate)}</div>`:''}
              ${b.returnDetails?`<div style="color:#5a6275;font-size:11px;">${b.returnDetails}</div>`:''}
              ${!b.returnMode && !b.returnDate ? '<div style="color:#8892a4;">Non renseigné</div>' : ''}
            </div>
          </div>
          ${b.attachmentUrl ? `<div style="margin-top:8px;font-size:12px;"><a href="${b.attachmentUrl}" target="_blank" style="color:#4895ef;text-decoration:none;">📎 ${b.attachmentName||'Pièce jointe'}</a></div>` : ''}
          ${b.notes ? `<div style="margin-top:8px;font-size:12px;color:#5a6275;background:#fffbeb;padding:6px 10px;border-radius:4px;">📝 ${b.notes}</div>` : ''}
        </div>`).join('')}
      </div>` : ''}

      ${hotels.length ? `
      <div>
        <div style="font-size:12px;font-weight:700;color:#8892a4;text-transform:uppercase;margin-bottom:10px;">🏨 Hôtels (${hotels.length})</div>
        ${hotels.map(h => `
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:10px;page-break-inside:avoid;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px;">
            <div>
              <div style="font-weight:700;font-size:14px;">🏨 ${h.hotelName}</div>
              ${h.hotelAddress ? `<div style="font-size:12px;color:#8892a4;margin-top:2px;">📍 ${h.hotelAddress}</div>` : ''}
              <div style="font-size:12px;color:#5a6275;margin-top:4px;">
                ${phaseLabel(h.phase)} · ${fmtD(h.checkin)} → ${fmtD(h.checkout)}
                ${h.reference?` · Réf: ${h.reference}`:''}
              </div>
            </div>
          </div>
          ${(h.occupants||[]).length ? `
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
            ${h.occupants.map(o => `
            <div style="background:#f8f9fb;padding:4px 10px;border-radius:99px;font-size:11px;display:flex;align-items:center;gap:6px;">
              <span style="width:20px;height:20px;background:#e63946;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:9px;">${(o.user?.firstName?.[0]||'?')+(o.user?.lastName?.[0]||'')}</span>
              ${o.user?.firstName||''} ${o.user?.lastName||''}
            </div>`).join('')}
          </div>` : ''}
          ${h.attachmentUrl ? `<div style="margin-top:8px;font-size:12px;"><a href="${h.attachmentUrl}" target="_blank" style="color:#4895ef;text-decoration:none;">📎 ${h.attachmentName||'Confirmation'}</a></div>` : ''}
          ${h.notes ? `<div style="margin-top:8px;font-size:12px;color:#5a6275;background:#fffbeb;padding:6px 10px;border-radius:4px;">📝 ${h.notes}</div>` : ''}
        </div>`).join('')}
      </div>` : ''}
    </div>`;
    }

    // ── Section: Files ──
    if (sections.includes('files') && files.length) {
      const extOf  = f => (f.fileName||'').split('.').pop().toLowerCase();
      const isImg  = f => ['jpg','jpeg','png','gif','webp'].includes(extOf(f));
      const isPdf  = f => extOf(f) === 'pdf';
      const imgs   = files.filter(isImg);
      const pdfs   = files.filter(isPdf);
      const otherDocs = files.filter(f => !isImg(f) && !isPdf(f));
      const fileIcon = f => {
        const e = extOf(f);
        if (['ppt','pptx'].includes(e)) return '📊';
        if (['xls','xlsx'].includes(e)) return '📈';
        if (['doc','docx'].includes(e)) return '📝';
        if (['mp4','mov'].includes(e)) return '🎬';
        return '📎';
      };
      // Helper Cloudinary : page N d'un PDF → URL JPG
      const pdfPageUrl = (url, n) => url.includes('/upload/')
        ? url.replace('/upload/', `/upload/f_jpg,c_limit,w_1100,pg_${n}/`).replace(/\.pdf($|\?)/i, '.jpg$1')
        : url;
      reportHTML += `
    <div class="section">
      <div class="section-title"><span class="section-icon">📁</span>Fichiers du projet</div>
      ${imgs.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:#8892a4;text-transform:uppercase;margin-bottom:8px;">🖼️ Photos (${imgs.length})</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;">
          ${imgs.map(f=>`
          <div style="text-align:center;page-break-inside:avoid;">
            <img src="${f.fileUrl}" style="width:100%;max-height:240px;object-fit:contain;border-radius:6px;border:1px solid #e5e7eb;display:block;">
            <div style="font-size:10px;color:#8892a4;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.fileName||''}</div>
          </div>`).join('')}
        </div>
      </div>` : ''}
      ${pdfs.length ? `
      <div style="margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:#8892a4;text-transform:uppercase;margin-bottom:8px;">📄 Documents PDF (${pdfs.length})</div>
        ${pdfs.map(f => `
          <div style="margin-bottom:20px;page-break-inside:avoid;">
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8f9fb;border-radius:6px 6px 0 0;border:1px solid #e5e7eb;border-bottom:none;">
              <div style="display:flex;align-items:center;gap:10px;">
                <span style="font-size:20px;">📄</span>
                <div style="font-weight:600;font-size:13px;">${f.fileName||'Document'}</div>
              </div>
              <a href="${f.fileUrl}" target="_blank" style="font-size:11px;color:#4895ef;text-decoration:none;">Original ↗</a>
            </div>
            <div style="padding:8px;border:1px solid #e5e7eb;border-radius:0 0 6px 6px;background:white;">
              ${[1,2,3,4,5,6,7,8,9,10].map(n => `<img src="${pdfPageUrl(f.fileUrl, n)}" onerror="this.style.display='none';" style="max-width:100%;display:block;margin:6px auto;border:1px solid #e5e7eb;page-break-inside:avoid;">`).join('')}
            </div>
          </div>
        `).join('')}
      </div>` : ''}
      ${otherDocs.length ? `
      <div>
        <div style="font-size:12px;font-weight:700;color:#8892a4;text-transform:uppercase;margin-bottom:8px;">📎 Autres documents (${otherDocs.length})</div>
        ${otherDocs.map(f=>`
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#f8f9fb;border-radius:6px;margin-bottom:4px;">
          <span style="font-size:20px;">${fileIcon(f)}</span>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${f.fileName||'Fichier'}</div>
            <div style="font-size:11px;color:#8892a4;">${extOf(f).toUpperCase()} ${f.fileSize?'· '+Math.round(f.fileSize/1024)+'KB':''}</div>
          </div>
          <a href="${f.fileUrl}" target="_blank" style="font-size:12px;color:#4895ef;text-decoration:none;">Voir ↗</a>
        </div>`).join('')}
      </div>` : ''}
    </div>`;
    }

    reportHTML += `
  </div><!-- /content -->

  <!-- FOOTER -->
  <div class="footer">
    <span>${L.generated} ${today} ${L.by}</span>
    <span>${project.internalNumber||''}</span>
  </div>

</div><!-- /page -->
</body></html>`;

    // ── STEP 4: Output ──
    setReportStatus('✅','Rapport généré !','');

    if (reportWin && !reportWin.closed) {
      reportWin.document.open();
      reportWin.document.write(reportHTML);
      reportWin.document.close();
      if (mode !== 'preview') setTimeout(()=>reportWin.print(), 800);
    } else {
      toast('La fenêtre du rapport a été fermée ou bloquée — réessaie et autorise les popups','warning');
    }

    // Archivage automatique dans les fichiers du projet — en arrière-plan,
    // ne bloque pas la fermeture de la modale ni l'aperçu/impression.
    saveReportToProjectFiles(reportHTML, CURRENT_PROJECT_ID, project);

    closeModal('modal-report');

  } catch(err) {
    console.error(err);
    toast('Erreur génération rapport: '+err.message,'error');
    // Sinon la fenêtre ouverte au clic reste bloquée sur "Génération en cours..."
    // indéfiniment, sans que l'erreur n'y soit visible.
    if (reportWin && !reportWin.closed) {
      reportWin.document.open();
      reportWin.document.write(`<html><body style="font-family:Arial,sans-serif;padding:60px;text-align:center;color:#e63946;">❌ Erreur génération du rapport<br><span style="font-size:13px;color:#999;">${(err.message||'').replace(/</g,'&lt;')}</span></body></html>`);
      reportWin.document.close();
    }
  } finally {
    if (pdfBtn) pdfBtn.disabled=false;
    if (prevBtn) prevBtn.disabled=false;
    const statusEl = document.getElementById('report-status');
    if (statusEl) statusEl.style.display='none';
  }
}

// ═══════════════════════════════════════════════════════════
// PDF TERRAIN — Handover + Visite Client
// Style rapport de réception avec photos et numérotation
// ═══════════════════════════════════════════════════════════

function buildTerrainPDFHeader(title, subtitle, date, project, client, nextMeeting='') {
  return `
  <div style="border-bottom:2px solid #1a1a2e;padding-bottom:16px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;">
    <div style="display:flex;align-items:center;gap:14px;">
      <div style="width:48px;height:48px;background:#e63946;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:22px;color:#fff;">V</div>
      <div>
        <div style="font-weight:800;font-size:18px;">ViewBox Event Manager</div>
        <div style="font-size:12px;color:#8892a4;">viewboxsitemanagement.up.railway.app</div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-weight:700;font-size:15px;">${title}</div>
      <div style="font-size:12px;color:#8892a4;">${date}</div>
      ${nextMeeting ? `<div style="font-size:12px;color:#e63946;font-weight:600;">Prochaine réunion : ${nextMeeting}</div>` : ''}
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;padding:14px;background:#f8f9fb;border-radius:8px;">
    <div>
      <div style="font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Projet</div>
      <div style="font-weight:700;font-size:15px;">${project.name}</div>
      <div style="font-size:12px;color:#5a6275;">${project.internalNumber||''} ${project.address?'· '+project.address:''}</div>
    </div>
    <div>
      <div style="font-size:10px;color:#8892a4;text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;">Client</div>
      <div style="font-weight:700;font-size:15px;">${client}</div>
    </div>
  </div>`;
}

