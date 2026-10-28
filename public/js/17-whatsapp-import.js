// ═══ IMPORT WHATSAPP → DAILY REPORTS ═══════════════════════════════
// Conversation d'un groupe WhatsApp de chantier exportée depuis le téléphone → un daily report par journée.
//   1. Fichier : l'export (.zip avec médias, ou .txt, ou .txt + photos) est lu ICI, dans le navigateur (lecteur .zip
//      maison : seuls les fichiers utiles sont décompressés, un export de plusieurs centaines de Mo passe) ; seul le texte
//      part au serveur, qui le découpe en journées (POST /daily-reports/whatsapp/parse).
//   2. Jours : journées à analyser (déjà un rapport ce jour-là / hors dates du projet = décochées), phase de chaque jour.
//   3. Brouillons : chaque journée part à l'IA (POST /daily-reports/whatsapp/analyze-day ; notes vocales transcrites avant
//      si demandé) → journal, résumé, météo, ouvriers, heures par tâche, avancement des tâches, légendes des photos.
//      Tout se corrige, et chaque journée doit être validée (« Je valide ce rapport »).
//   4. Confirmation (liste de ce qui va être créé), puis création avec les routes habituelles : POST /daily-reports,
//      /upload/daily-photo/:id, /daily-reports/:id/attachments (PDF), PATCH /tasks/:id. Rien n'est créé avant.
// Backend : src/services/whatsappChat.ts (lecture), src/services/whatsappDaily.ts (IA), src/routes/dailyReports.ts.

let WA = null;

const WA_WEATHER = ['☀️ Ensoleillé', '⛅ Nuageux', '🌧️ Pluie', '❄️ Froid', '🌩️ Orage'];
const WA_STATUS = { todo: 'à faire', in_progress: 'en cours', done: 'terminée', blocked: 'bloquée' };
const WA_PHASE = { installation: '🏗️ Installation', dismantling: '🔨 Démontage' };
const WA_MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', bmp: 'image/bmp',
  opus: 'audio/ogg', ogg: 'audio/ogg', oga: 'audio/ogg', m4a: 'audio/mp4', mp3: 'audio/mpeg', aac: 'audio/aac', wav: 'audio/wav',
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

// ─── Lecture d'un .zip sans bibliothèque (Blob.slice + DecompressionStream) ───

/** Liste des fichiers d'un .zip : seul le répertoire central est lu (fin du fichier). ZIP64 géré. */
async function waZipEntries(blob) {
  const tailLen = Math.min(blob.size, 65557);
  const tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('Ce fichier n’est pas un .zip lisible.');
  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOff = tail.getUint32(eocd + 16, true);
  if (cdOff === 0xffffffff || cdSize === 0xffffffff || count === 0xffff) {
    const loc = eocd - 20;
    if (loc >= 0 && tail.getUint32(loc, true) === 0x07064b50) {
      const off = Number(tail.getBigUint64(loc + 8, true));
      const z = new DataView(await blob.slice(off, off + 56).arrayBuffer());
      if (z.getUint32(0, true) === 0x06064b50) {
        count = Number(z.getBigUint64(32, true));
        cdSize = Number(z.getBigUint64(40, true));
        cdOff = Number(z.getBigUint64(48, true));
      }
    }
  }
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const utf8 = new TextDecoder('utf-8');
  const entries = [];
  let p = 0;
  for (let n = 0; n < count && p + 46 <= cd.byteLength; n++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const flags = cd.getUint16(p + 8, true);
    const method = cd.getUint16(p + 10, true);
    let csize = cd.getUint32(p + 20, true);
    let usize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let localOff = cd.getUint32(p + 42, true);
    const name = utf8.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    if (csize === 0xffffffff || usize === 0xffffffff || localOff === 0xffffffff) {
      let e = p + 46 + nameLen;
      const end = e + extraLen;
      while (e + 4 <= end) {
        const id = cd.getUint16(e, true), len = cd.getUint16(e + 2, true);
        if (id === 1) {
          let q = e + 4;
          if (usize === 0xffffffff) { usize = Number(cd.getBigUint64(q, true)); q += 8; }
          if (csize === 0xffffffff) { csize = Number(cd.getBigUint64(q, true)); q += 8; }
          if (localOff === 0xffffffff) { localOff = Number(cd.getBigUint64(q, true)); }
        }
        e += 4 + len;
      }
    }
    if (!name.endsWith('/')) entries.push({ name, method, flags, csize, usize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Contenu d'un fichier du .zip (Blob). */
async function waZipRead(blob, entry) {
  const head = new DataView(await blob.slice(entry.localOff, entry.localOff + 30).arrayBuffer());
  if (head.getUint32(0, true) !== 0x04034b50) throw new Error('Fichier .zip abîmé.');
  const start = entry.localOff + 30 + head.getUint16(26, true) + head.getUint16(28, true);
  const data = blob.slice(start, start + entry.csize);
  if (entry.flags & 1) throw new Error('Fichier .zip protégé par mot de passe.');
  if (entry.method === 0) return data;
  if (entry.method !== 8) throw new Error('Compression .zip non gérée.');
  if (typeof DecompressionStream === 'undefined') throw new Error('Navigateur trop ancien pour lire un .zip : mets-le à jour, ou importe le .txt seul.');
  return await new Response(data.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob();
}

const waBase = name => String(name || '').split('/').pop().toLowerCase();
const waExt = name => (String(name || '').split('.').pop() || '').toLowerCase();
const waMime = name => WA_MIME[waExt(name)] || 'application/octet-stream';
const waHasMedia = m => !!(m.file && WA?.media.has(waBase(m.file)));

/** Fichier joint d'un message (Blob), depuis le .zip ou les fichiers choisis à côté du .txt. */
async function waMediaBlob(file) {
  const src = WA.media.get(waBase(file));
  if (!src) throw new Error(`${file} absent de l’export`);
  return src.file || await waZipRead(src.zip, src.entry);
}

async function waMediaUrl(file) {
  const key = waBase(file);
  if (!WA.urls.has(key)) WA.urls.set(key, URL.createObjectURL(await waMediaBlob(file)));
  return WA.urls.get(key);
}

function waRevokeUrls() {
  if (WA?.urls) WA.urls.forEach(u => URL.revokeObjectURL(u));
}

async function waPool(items, n, fn) {
  let k = 0;
  const run = async () => { while (k < items.length) { const it = items[k++]; await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
}

function waDayLabel(date, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('fr-FR', { ...opts, timeZone: 'UTC' });
}

function waShiftDate(date, days) {
  if (!date) return null;
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

// ─── Ouverture / fermeture ───

/** Styles propres à l'import (téléphone : barre d'action juste au-dessus du menu du bas, heures empilées). */
function waStyles() {
  if (document.getElementById('wa-styles')) return;
  const st = document.createElement('style');
  st.id = 'wa-styles';
  st.textContent = `
    .wa-foot{position:sticky;bottom:0;background:var(--bg2);border-top:1px solid var(--border);margin-top:14px;padding:12px 0;z-index:4;}
    .wa-hhead,.wa-hrow{display:grid;grid-template-columns:minmax(0,1fr) 70px 70px 54px;gap:6px;align-items:center;}
    .wa-hhead{font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;padding:0 2px 4px;}
    .wa-unit{display:none;}
    @media(max-width:768px){
      #wa-modal{padding-bottom:calc(84px + env(safe-area-inset-bottom))!important;}
      .wa-foot{box-shadow:0 60px 0 var(--bg2);}
    }
    @media(max-width:640px){
      .wa-hhead{display:none;}
      .wa-hrow{grid-template-columns:1fr 1fr auto;}
      .wa-hrow .wa-htask{grid-column:1/-1;}
      .wa-unit{display:block;font-size:10px;color:var(--text3);text-transform:uppercase;font-weight:700;margin-bottom:2px;}
    }`;
  document.head.appendChild(st);
}

function openWhatsAppImport(projectId) {
  document.getElementById('wa-overlay')?.remove();
  waRevokeUrls();
  waStyles();
  WA = {
    projectId: projectId || CURRENT_PROJECT_ID || document.getElementById('daily-project')?.value || '',
    step: 'file', media: new Map(), urls: new Map(), chatText: '', chatName: '', zipName: '',
    parsed: null, days: [], dayStart: 0, transcribe: true, transcribeOff: false, busy: false, confirm: false,
  };
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.id = 'wa-overlay';
  el.innerHTML = '<div class="modal" id="wa-modal" style="max-width:980px;padding-bottom:0;"></div>';
  document.body.appendChild(el);
  waRender();
}

function closeWhatsAppImport(force) {
  if (!WA) return;
  if (!force && WA.busy) { toast('Création en cours : patiente jusqu’à la fin.', 'warning'); return; }
  if (!force && WA.step === 'drafts' && WA.days.some(d => d.draft) && !confirm('Fermer l’import ? Les brouillons non créés seront perdus.')) return;
  document.getElementById('wa-overlay')?.remove();
  waRevokeUrls();
  WA = null;
}

// ─── Rendu ───

function waRender() {
  const modal = document.getElementById('wa-modal');
  if (!modal || !WA) return;
  const steps = [['file', '1 Fichier'], ['days', '2 Jours'], ['drafts', '3 Brouillons'], ['create', '4 Création']];
  const cur = steps.findIndex(s => s[0] === WA.step);
  // garder la position de lecture (cocher un jour ne doit pas ramener en haut de la liste)
  const keep = WA.renderedStep === WA.step ? { modal: modal.scrollTop, list: document.getElementById('wa-days-list')?.scrollTop || 0 } : null;
  WA.renderedStep = WA.step;
  modal.innerHTML = `
    <div class="modal-head">
      <div>
        <div class="modal-title">💬 Import WhatsApp</div>
        <div style="font-size:12px;color:var(--text2);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap;">
          ${steps.map(([, l], i) => `<span style="${i === cur ? 'color:var(--accent);font-weight:700;' : i < cur ? 'color:var(--text2);' : 'color:var(--text3);'}">${l}</span>`).join('<span style="color:var(--text3);">›</span>')}
        </div>
      </div>
      <button class="modal-close" onclick="closeWhatsAppImport()">×</button>
    </div>
    <div id="wa-body">${WA.step === 'file' ? waFileHtml() : WA.step === 'days' ? waDaysHtml() : WA.step === 'drafts' ? waDraftsHtml() : waCreateHtml()}</div>`;
  if (WA.step === 'drafts') { waRenderFooter(); waFillThumbs(modal); }
  if (keep) {
    modal.scrollTop = keep.modal;
    const list = document.getElementById('wa-days-list');
    if (list) list.scrollTop = keep.list;
  }
}

// ─── Étape 1 : fichier ───

function waFileHtml() {
  const projects = (typeof PROJECTS !== 'undefined' ? PROJECTS : []) || [];
  return `
    <div class="form-group2" style="margin:0 0 12px;">
      <label class="form-label2">Projet *</label>
      <select class="input" id="wa-project" onchange="WA.projectId=this.value">
        <option value="">— Sélectionner —</option>
        ${projects.map(p => `<option value="${esc(p.id)}" ${p.id === WA.projectId ? 'selected' : ''}>${esc(p.internalNumber ? p.internalNumber + ' · ' : '')}${esc(p.name)}</option>`).join('')}
      </select>
    </div>

    <details ${localStorage.getItem('vem_wa_help_seen') ? '' : 'open'} style="background:rgba(37,211,102,.08);border:1px solid rgba(37,211,102,.3);border-radius:var(--radius);padding:10px 14px;margin-bottom:12px;">
      <summary style="cursor:pointer;font-weight:700;font-size:13px;">📱 Comment exporter la conversation WhatsApp du groupe</summary>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:10px;font-size:13px;color:var(--text2);line-height:1.55;">
        <div>
          <div style="font-weight:700;color:var(--text);margin-bottom:4px;">📱 iPhone</div>
          <ol style="margin:0;padding-left:18px;">
            <li>Ouvre le groupe WhatsApp du chantier.</li>
            <li>Touche le <b>nom du groupe</b> en haut, descends tout en bas → <b>Exporter la discussion</b>.</li>
            <li>Choisis <b>Joindre les médias</b> (pour avoir les photos).</li>
            <li><b>Enregistrer dans Fichiers</b> (ou envoie-le-toi par e-mail / AirDrop pour l’ordinateur).</li>
            <li>Ici : choisis le fichier <b>.zip</b>.</li>
          </ol>
        </div>
        <div>
          <div style="font-weight:700;color:var(--text);margin-bottom:4px;">🤖 Android</div>
          <ol style="margin:0;padding-left:18px;">
            <li>Ouvre le groupe WhatsApp du chantier.</li>
            <li><b>⋮</b> (en haut à droite) → <b>Plus</b> → <b>Exporter la discussion</b>.</li>
            <li>Choisis <b>Inclure les médias</b>.</li>
            <li>Enregistre-le dans <b>Drive / Fichiers</b>, ou envoie-le-toi par e-mail.</li>
            <li>Ici : choisis le fichier <b>.zip</b> — ou, si tu as reçu plusieurs fichiers, sélectionne ensemble le <b>.txt</b> et les photos.</li>
          </ol>
        </div>
      </div>
      <div style="font-size:12px;color:var(--text3);margin-top:8px;line-height:1.5;">
        L’export se fait depuis le téléphone (WhatsApp Web / ordinateur ne sait pas exporter). Avec les médias, WhatsApp n’exporte que les ~10 000 derniers messages. Les vidéos ne sont pas reprises dans les rapports. <b>Rien n’est créé avant ta validation.</b>
      </div>
    </details>

    <label id="wa-drop" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;border:2px dashed var(--border);border-radius:var(--radius);padding:26px 14px;cursor:pointer;color:var(--text2);font-size:14px;text-align:center;">
      <span style="font-size:30px;">📦</span>
      <b>Choisir l’export WhatsApp</b>
      <span style="font-size:12px;color:var(--text3);">.zip (avec médias) · ou .txt (+ photos)</span>
      <input type="file" id="wa-file" multiple accept=".zip,.txt,text/plain,application/zip,application/x-zip-compressed,image/*,audio/*,.opus,.pdf" style="display:none;" onchange="waReadFiles(this.files)">
    </label>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px;font-size:13px;color:var(--text2);">
      Une journée de chantier va de
      <select class="input" style="width:auto;padding:5px 8px;font-size:13px;" onchange="WA.dayStart=+this.value">
        ${[0, 3, 4, 5, 6].map(h => `<option value="${h}" ${WA.dayStart === h ? 'selected' : ''}>${String(h).padStart(2, '0')}:00 à ${String((h + 23) % 24).padStart(2, '0')}:59${h ? ' (montage de nuit)' : ''}</option>`).join('')}
      </select>
    </div>
    <div id="wa-file-status" style="margin:12px 0 18px;font-size:13px;"></div>`;
}

function waStatus(html, color) {
  const el = document.getElementById('wa-file-status');
  if (el) el.innerHTML = `<span style="color:${color || 'var(--text2)'};">${html}</span>`;
}

async function waReadFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length || !WA) return;
  if (!WA.projectId) { waStatus('Choisis d’abord le projet.', 'var(--accent)'); return; }
  try { localStorage.setItem('vem_wa_help_seen', '1'); } catch { /* stockage indisponible */ }
  waStatus('<span class="loader"></span> Lecture de l’export…');
  waRevokeUrls();
  WA.media = new Map();
  WA.urls = new Map();
  let chatText = null, chatName = '';
  try {
    const zip = files.find(f => /\.zip$/i.test(f.name) || /zip/.test(f.type));
    if (zip) {
      const entries = (await waZipEntries(zip)).filter(e => !/(^|\/)(__MACOSX|\._)/.test(e.name));
      const txts = entries.filter(e => /\.txt$/i.test(e.name));
      const chat = txts.find(e => /(^|\/)_chat\.txt$/i.test(e.name)) || txts.sort((a, b) => b.usize - a.usize)[0];
      if (!chat) throw new Error('Aucune conversation (.txt) dans ce .zip : est-ce bien un export WhatsApp ?');
      chatText = await (await waZipRead(zip, chat)).text();
      chatName = chat.name;
      WA.zipName = zip.name;
      for (const e of entries) if (e !== chat) WA.media.set(waBase(e.name), { zip, entry: e, size: e.usize });
    }
    for (const f of files) {
      if (f === zip) continue;
      if (/\.txt$/i.test(f.name) || f.type === 'text/plain') {
        if (!chatText) { chatText = await f.text(); chatName = f.name; }
      } else {
        WA.media.set(waBase(f.name), { file: f, size: f.size });
      }
    }
    if (!chatText) throw new Error('Choisis le fichier .zip de l’export, ou le fichier .txt de la conversation.');
  } catch (e) {
    waStatus(`❌ ${esc(e.message)}`, 'var(--accent)');
    return;
  }
  WA.chatText = chatText;
  WA.chatName = chatName;
  await waParse();
}

async function waParse() {
  waStatus(`<span class="loader"></span> Lecture des messages…`);
  const res = await api('POST', '/daily-reports/whatsapp/parse', { projectId: WA.projectId, text: WA.chatText, dayStartHour: WA.dayStart });
  if (!WA) return;
  if (!res?.success) { waStatus(`❌ ${esc(res?.error || 'Erreur réseau')}`, 'var(--accent)'); return; }
  const P = res.data;
  if (!P.days.length) { waStatus(`❌ ${esc(P.warnings?.[0] || 'Aucun message reconnu dans ce fichier.')}`, 'var(--accent)'); return; }
  WA.parsed = P;
  const from = waShiftDate(P.project.installation[0], -3);
  const to = waShiftDate(P.project.dismantling[1] || P.project.dismantling[0] || P.project.installation[1], 1);
  WA.days = P.days.map((d, k) => {
    const inWindow = (!from || d.date >= from) && (!to || d.date <= to);
    return {
      ...d, k, inWindow,
      selected: inWindow && !d.existingReports,
      byI: new Map(d.messages.map(m => [m.i, m])),
      status: 'idle', draft: null, error: null, approved: false, open: false,
      photoSel: new Set(), captions: {}, docSel: new Set(), taskSel: new Set(),
    };
  });
  WA.step = 'days';
  waRender();
}

// ─── Étape 2 : jours ───

function waDaysHtml() {
  const P = WA.parsed;
  const msgs = WA.days.reduce((s, d) => s + d.counts.messages, 0);
  const photos = WA.days.reduce((s, d) => s + d.messages.filter(m => m.kind === 'photo').length, 0);
  const photosHere = WA.days.reduce((s, d) => s + d.messages.filter(m => m.kind === 'photo' && waHasMedia(m)).length, 0);
  const audios = WA.days.filter(d => d.selected).reduce((s, d) => s + d.messages.filter(m => m.kind === 'audio' && waHasMedia(m)).length, 0);
  const sel = WA.days.filter(d => d.selected).length;
  const inst = P.project.installation, dism = P.project.dismantling;
  return `
    <div style="background:var(--bg3);border-radius:var(--radius);padding:12px 14px;margin-bottom:12px;font-size:13px;color:var(--text2);line-height:1.6;">
      <div><b style="color:var(--text);">${esc(P.project.name)}</b> · installation ${inst[0] ? fmtDate(inst[0]) : '—'} → ${inst[1] ? fmtDate(inst[1]) : '—'}${dism[0] ? ` · démontage ${fmtDate(dism[0])} → ${dism[1] ? fmtDate(dism[1]) : '—'}` : ''}</div>
      <div>📱 Export ${P.format === 'ios' ? 'iPhone' : 'Android'} · ${msgs} messages · ${WA.days.length} jour(s) du ${fmtDate(WA.days[0].date)} au ${fmtDate(WA.days[WA.days.length - 1].date)} · ${P.participants.length} participant(s)</div>
      <div>📷 Photos dans l’export : ${photosHere} / ${photos}${photos && !photosHere ? ' — <span style="color:var(--amber);">export sans médias : refais-le avec « Joindre / Inclure les médias » pour avoir les photos</span>' : ''}</div>
      ${(P.warnings || []).map(w => `<div style="color:var(--amber);">⚠️ ${esc(w)}</div>`).join('')}
      ${!P.ai.enabled ? '<div style="color:var(--accent);">⚠️ IA non configurée sur le serveur : seuls les brouillons « messages bruts » sont possibles.</div>' : ''}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
      <div style="font-size:13px;font-weight:700;">Journées à transformer en rapport <span style="color:var(--text3);font-weight:400;">(${sel} cochée${sel > 1 ? 's' : ''})</span></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn btn-ghost btn-xs" onclick="waSelectDays('window')">Dates du projet</button>
        <button class="btn btn-ghost btn-xs" onclick="waSelectDays('all')">Tout</button>
        <button class="btn btn-ghost btn-xs" onclick="waSelectDays('none')">Rien</button>
      </div>
    </div>
    <div id="wa-days-list" style="display:flex;flex-direction:column;gap:6px;max-height:48vh;overflow-y:auto;padding-right:2px;">
      ${WA.days.map(d => waDayRowHtml(d)).join('')}
    </div>

    ${audios ? `
      <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-top:12px;cursor:pointer;">
        <input type="checkbox" ${WA.transcribe ? 'checked' : ''} onchange="WA.transcribe=this.checked" style="accent-color:var(--accent);margin-top:2px;">
        <span>🎙️ Transcrire les <b>${audios}</b> note(s) vocale(s) des jours cochés avant l’analyse <span style="color:var(--text3);">(plus long ; nécessite la transcription audio configurée sur le serveur)</span></span>
      </label>` : ''}

    <div class="wa-foot" style="display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;">
      <button class="btn btn-outline btn-sm" onclick="WA.step='file';waRender()">← Changer de fichier</button>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:11px;color:var(--text3);">Rien n’est créé à cette étape</span>
        <button class="btn btn-ghost btn-sm" ${sel ? '' : 'disabled'} onclick="waStartDrafts(false)" title="Sans IA : les messages repris tels quels, à résumer toi-même">📝 Sans IA</button>
        <button class="btn btn-primary" ${sel && P.ai.enabled ? '' : 'disabled'} onclick="waStartDrafts(true)">🤖 Préparer ${sel} rapport${sel > 1 ? 's' : ''}</button>
      </div>
    </div>`;
}

function waDayRowHtml(d) {
  const c = d.counts;
  const photosHere = d.messages.filter(m => m.kind === 'photo' && waHasMedia(m)).length;
  return `
    <div style="background:var(--bg3);border:1px solid ${d.selected ? 'rgba(37,211,102,.45)' : 'var(--border)'};border-radius:10px;padding:8px 10px;">
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <input type="checkbox" ${d.selected ? 'checked' : ''} onchange="waToggleDay(${d.k},this.checked)" style="accent-color:var(--green);width:17px;height:17px;flex-shrink:0;">
        <div style="flex:1;min-width:200px;">
          <div style="font-size:13px;font-weight:600;color:var(--text);">${waDayLabel(d.date)} <span style="color:var(--text3);font-weight:400;">${d.date.slice(0, 4)}</span>
            ${d.existingReports ? `<span class="badge badge-amber" style="font-size:10px;margin-left:4px;">déjà ${d.existingReports} rapport${d.existingReports > 1 ? 's' : ''}</span>` : ''}
            ${!d.inWindow ? '<span class="badge badge-muted" style="font-size:10px;margin-left:4px;">hors dates du projet</span>' : ''}
          </div>
          <div style="font-size:12px;color:var(--text3);">${c.messages} message${c.messages > 1 ? 's' : ''} · ${d.firstTime} → ${d.lastTime}${c.photo ? ` · 📷 ${photosHere}${photosHere < c.photo ? `/${c.photo}` : ''}` : ''}${c.audio ? ` · 🎙️ ${c.audio}` : ''}${c.document ? ` · 📄 ${c.document}` : ''}${c.video ? ` · 🎬 ${c.video}` : ''} · ${esc(d.authors.slice(0, 4).join(', '))}${d.authors.length > 4 ? '…' : ''}</div>
        </div>
        <select class="input" style="width:auto;padding:4px 8px;font-size:12px;" onchange="WA.days[${d.k}].phase=this.value">
          ${Object.entries(WA_PHASE).map(([v, l]) => `<option value="${v}" ${d.phase === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-xs" onclick="waToggleMsgs(${d.k})">💬 Messages</button>
      </div>
      <div id="wa-msgs-${d.k}" style="display:none;"></div>
    </div>`;
}

function waToggleDay(k, on) {
  WA.days[k].selected = on;
  waRender();
}

function waSelectDays(mode) {
  WA.days.forEach(d => { d.selected = mode === 'all' ? true : mode === 'none' ? false : d.inWindow && !d.existingReports; });
  waRender();
}

function waMessagesHtml(list, d) {
  return list.map(m => `
    <div style="display:flex;gap:8px;font-size:12px;line-height:1.45;padding:2px 0;">
      <span style="font-family:monospace;color:var(--text3);flex-shrink:0;">${m.time}</span>
      <span style="color:var(--text2);"><b style="color:var(--text);">${esc(m.author || 'Système')}</b> :
        ${m.kind ? `<span style="color:var(--blue);">${{ photo: '📷', video: '🎬', audio: '🎙️', document: '📄', sticker: '🙂', contact: '👤', other: '📎' }[m.kind]} ${waHasMedia(m) ? '' : '(absent de l’export) '}</span>` : ''}${m.omitted ? '<span style="color:var(--text3);">[média non exporté]</span> ' : ''}${esc(m.text)}${m.transcript ? ` <i style="color:var(--text3);">« ${esc(m.transcript)} »</i>` : ''}
      </span>
    </div>`).join('') || '<div style="font-size:12px;color:var(--text3);">—</div>';
}

function waToggleMsgs(k) {
  const el = document.getElementById(`wa-msgs-${k}`);
  if (!el) return;
  if (el.style.display === 'none') {
    el.innerHTML = `<div style="max-height:260px;overflow-y:auto;border-top:1px solid var(--border);margin-top:8px;padding-top:6px;">${waMessagesHtml(WA.days[k].messages, WA.days[k])}</div>`;
    el.style.display = 'block';
  } else el.style.display = 'none';
}

// ─── Étape 3 : brouillons ───

async function waStartDrafts(useAi) {
  const todo = WA.days.filter(d => d.selected);
  if (!todo.length) return;
  todo.forEach(d => { d.status = 'waiting'; d.draft = null; d.error = null; d.approved = false; });
  WA.days.forEach(d => { if (!d.selected) { d.status = 'idle'; d.draft = null; } });
  if (typeof loadDailyAllTemplates === 'function') await loadDailyAllTemplates(); // tâches types du tableau heures / hommes
  if (!WA) return;
  WA.step = 'drafts';
  WA.confirm = false;
  waRender();
  if (!useAi) { todo.forEach(d => waUseRaw(d.k, true)); waRender(); return; }
  await waPool(todo, 2, d => waAnalyzeDay(d));
  if (!WA) return;
  const failed = todo.filter(d => d.status === 'error').length;
  toast(failed ? `${todo.length - failed} brouillon(s) prêt(s), ${failed} en erreur` : `${todo.length} brouillon(s) prêt(s) : vérifie et valide chaque jour`, failed ? 'warning' : 'success');
}

function waMsgPayload(m) {
  const { i, date, time, author, text, file, kind, omitted, transcript } = m;
  return { i, date, time, author, text, file, kind, omitted, transcript };
}

/** Notes vocales du jour → texte (route /ai/transcribe, Whisper). Arrêté au premier refus de configuration. */
async function waTranscribeDay(d) {
  const audios = d.messages.filter(m => m.kind === 'audio' && waHasMedia(m) && m.transcript === undefined);
  for (const m of audios) {
    if (!WA || WA.transcribeOff) return;
    d.sub = `🎙️ Transcription des notes vocales (${audios.indexOf(m) + 1}/${audios.length})…`;
    waRenderDay(d);
    try {
      const blob = await waMediaBlob(m.file);
      if (blob.size > 24 * 1024 * 1024 || !/^audio\//.test(waMime(m.file))) { m.transcript = ''; continue; }
      const fd = new FormData();
      fd.append('audio', new File([blob], m.file.split('/').pop().replace(/\.(opus|oga)$/i, '.ogg'), { type: waMime(m.file) }));
      const r = await fetch(`${API}/ai/transcribe`, { method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` }, body: fd });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) {
        if (/OPENAI_API_KEY|non configur/i.test(j?.error || '') || r.status === 403) {
          if (WA && !WA.transcribeOff) toast('Transcription des notes vocales indisponible : analyse sans elles.', 'warning');
          if (WA) WA.transcribeOff = true;
          return;
        }
        m.transcript = '';
        continue;
      }
      m.transcript = j.data?.text || '';
    } catch { m.transcript = ''; }
  }
}

async function waAnalyzeDay(d) {
  if (!WA) return;
  d.status = 'running';
  d.error = null;
  d.sub = '';
  waRenderDay(d);
  try {
    if (WA.transcribe && !WA.transcribeOff) await waTranscribeDay(d);
    if (!WA) return;
    d.sub = '🤖 Analyse des messages…';
    waRenderDay(d);
    const res = await api('POST', '/daily-reports/whatsapp/analyze-day', {
      projectId: WA.projectId, date: d.date, phase: d.phase, messages: d.messages.map(waMsgPayload),
    });
    if (!WA) return;
    if (!res?.success) throw new Error(res?.error || 'Erreur réseau');
    waApplyDraft(d, res.data);
  } catch (e) {
    d.status = 'error';
    d.error = e.message;
  }
  waRenderDay(d);
  waRenderFooter();
}

function waApplyDraft(d, draft) {
  d.draft = draft;
  d.status = 'done';
  d.approved = false;
  d.open = draft.relevant !== false;
  const photos = d.messages.filter(m => m.kind === 'photo' && waHasMedia(m));
  d.photoSel = new Set(draft.relevant === false ? [] : photos.map(m => m.i));
  d.captions = {};
  photos.forEach(m => { d.captions[m.i] = draft.photoCaptions?.[m.i] || (m.text || '').slice(0, 200) || `Photo — ${m.author || ''} ${m.time}`.trim(); });
  d.docSel = new Set();
  d.taskSel = new Set((draft.taskUpdates || []).map(u => u.taskId));
}

/** Brouillon sans IA : les messages repris tels quels (à résumer à la main). */
function waUseRaw(k, silent) {
  const d = WA.days[k];
  const entries = d.messages
    .filter(m => m.author && (m.text || m.transcript))
    .map(m => ({ time: m.time, text: `${m.author} : ${[m.transcript ? `🎙️ ${m.transcript}` : '', m.text].filter(Boolean).join(' — ')}`, refs: [m.i] }));
  waApplyDraft(d, {
    date: d.date, phase: d.phase, relevant: true, summary: '', weather: '', workersPresent: null, workersBasis: '',
    entries, taskHours: [], taskUpdates: [], photoCaptions: {}, questions: ['Brouillon sans IA : les messages sont repris tels quels — résume et nettoie avant de valider.'], model: null, costUsd: null,
  });
  if (!silent) { waRenderDay(d); waRenderFooter(); }
}

function waDraftsHtml() {
  return `
    <div style="font-size:12px;color:var(--text2);background:var(--bg3);border-radius:var(--radius);padding:10px 12px;margin-bottom:12px;line-height:1.5;">
      Vérifie chaque brouillon, corrige ce qu’il faut (💬 = messages d’où vient l’information), puis coche <b>« Je valide ce rapport »</b>. Les heures et le nombre d’hommes ne sont repris que s’ils sont dits dans les messages : complète-les sinon.
    </div>
    <div id="wa-days" style="display:flex;flex-direction:column;gap:10px;">
      ${WA.days.filter(d => d.status !== 'idle').map(d => `<div id="wa-day-${d.k}">${waDayCardHtml(d)}</div>`).join('')}
    </div>
    <div id="wa-footer" class="wa-foot"></div>`;
}

function waRenderDay(d) {
  const el = document.getElementById(`wa-day-${d.k}`);
  if (!el) return;
  el.innerHTML = waDayCardHtml(d);
  waFillThumbs(el);
}

function waSourcesBtn(d, refs, key) {
  if (!refs || !refs.length) return '';
  return `<button class="btn btn-ghost btn-xs" style="padding:2px 6px;min-height:0;" title="Messages d’origine" onclick="waToggleSources(${d.k},'${key}')">💬 ${refs.length}</button>`;
}

function waToggleSources(k, key) {
  const box = document.getElementById(`wa-src-${k}-${key}`);
  if (!box) return;
  if (box.style.display !== 'none') { box.style.display = 'none'; return; }
  const d = WA.days[k];
  const [kind, j] = key.split('-');
  const dr = d.draft;
  const refs = kind === 'e' ? dr.entries[+j]?.refs : kind === 'h' ? dr.taskHours[+j]?.refs : kind === 't' ? dr.taskUpdates[+j]?.refs : [];
  box.innerHTML = waMessagesHtml((refs || []).map(i => d.byI.get(i)).filter(Boolean), d);
  box.style.display = 'block';
}

function waSrcBox(d, key) {
  return `<div id="wa-src-${d.k}-${key}" style="display:none;margin:4px 0 2px 0;padding:6px 8px;border-left:3px solid var(--blue);background:var(--bg2);border-radius:6px;"></div>`;
}

function waDayCardHtml(d) {
  const head = (right) => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
      <div style="font-size:14px;font-weight:700;cursor:${d.draft ? 'pointer' : 'default'};" ${d.draft ? `onclick="waToggleOpen(${d.k})"` : ''}>
        ${d.draft ? (d.open ? '▾' : '▸') : ''} 📓 ${waDayLabel(d.date)} <span style="font-size:12px;color:var(--text3);font-weight:400;">${WA_PHASE[d.phase] || ''} · ${d.counts.messages} messages</span>
        ${d.existingReports ? `<span class="badge badge-amber" style="font-size:10px;">déjà ${d.existingReports} rapport${d.existingReports > 1 ? 's' : ''} ce jour</span>` : ''}
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${right}</div>
    </div>`;
  const box = (inner, border) => `<div style="background:var(--bg3);border:1px solid ${border || 'var(--border)'};border-radius:12px;padding:12px 14px;">${inner}</div>`;

  if (d.status === 'waiting') return box(head('<span style="font-size:12px;color:var(--text3);">⏳ En attente…</span>'));
  if (d.status === 'running') return box(head(`<span style="font-size:12px;color:var(--blue);"><span class="loader"></span> ${esc(d.sub || 'Analyse…')}</span>`));
  if (d.status === 'error') {
    return box(head(`
      <button class="btn btn-ghost btn-xs" onclick="waAnalyzeDay(WA.days[${d.k}])">↻ Relancer</button>
      <button class="btn btn-ghost btn-xs" onclick="waUseRaw(${d.k})">📝 Messages bruts</button>`) +
      `<div style="font-size:12px;color:var(--accent);margin-top:6px;">❌ ${esc(d.error || 'Erreur')}</div>`, 'rgba(230,57,70,.4)');
  }

  const dr = d.draft;
  const approve = `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:700;cursor:pointer;color:${d.approved ? 'var(--green)' : 'var(--text)'};padding:4px 10px;border-radius:8px;border:1px solid ${d.approved ? 'var(--green)' : 'var(--border)'};background:${d.approved ? 'rgba(45,198,83,.1)' : 'transparent'};">
      <input type="checkbox" ${d.approved ? 'checked' : ''} onchange="waApprove(${d.k},this.checked)" style="accent-color:var(--green);width:16px;height:16px;"> Je valide ce rapport
    </label>`;
  const meta = `${dr.entries.length} entrée(s) · 📷 ${d.photoSel.size}${dr.taskHours.length ? ` · ⏱️ ${dr.taskHours.length}` : ''}${d.taskSel.size ? ` · ✅ ${d.taskSel.size} tâche(s)` : ''}${dr.costUsd != null ? ` · IA ≈ ${dr.costUsd.toFixed(2).replace('.', ',')} $` : dr.model === null ? ' · sans IA' : ''}`;
  let html = head(`<span style="font-size:11px;color:var(--text3);">${meta}</span>${approve}`);
  if (!d.open) return box(html, d.approved ? 'var(--green)' : undefined);

  if (dr.relevant === false) {
    html += `<div style="font-size:12px;color:var(--amber);margin-top:8px;">ℹ️ L’IA n’a trouvé aucun travail de chantier ce jour-là. Ne valide ce rapport que s’il a lieu d’être.</div>`;
  }
  if (dr.questions?.length) {
    html += `<div style="background:rgba(244,162,97,.1);border:1px solid rgba(244,162,97,.35);border-radius:8px;padding:8px 10px;margin-top:10px;font-size:12px;color:var(--text2);">
      <b style="color:var(--amber);">À vérifier :</b><ul style="margin:4px 0 0;padding-left:18px;">${dr.questions.map(q => `<li>${esc(q)}</li>`).join('')}</ul></div>`;
  }

  // infos générales
  html += `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px;">
      <div class="form-group2" style="margin:0;"><label class="form-label2">Phase</label>
        <select class="input" onchange="waChangePhase(${d.k},this.value)">${Object.entries(WA_PHASE).map(([v, l]) => `<option value="${v}" ${d.phase === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="form-group2" style="margin:0;"><label class="form-label2">Météo</label>
        <select class="input" onchange="WA.days[${d.k}].draft.weather=this.value">
          <option value="" ${!dr.weather ? 'selected' : ''}>— non mentionnée —</option>
          ${WA_WEATHER.map(w => `<option ${dr.weather === w ? 'selected' : ''}>${w}</option>`).join('')}
        </select></div>
      <div class="form-group2" style="margin:0;"><label class="form-label2">Ouvriers présents</label>
        <input class="input" type="number" min="0" value="${dr.workersPresent ?? ''}" placeholder="?" oninput="WA.days[${d.k}].draft.workersPresent=this.value===''?null:Math.max(0,parseInt(this.value)||0)">
        ${dr.workersBasis ? `<div style="font-size:10px;color:var(--text3);margin-top:2px;">${esc(dr.workersBasis)}</div>` : ''}</div>
    </div>
    <div class="form-group2" style="margin:10px 0 0;"><label class="form-label2">Notes générales / Résumé</label>
      <textarea class="input" rows="3" oninput="WA.days[${d.k}].draft.summary=this.value">${esc(dr.summary)}</textarea></div>`;

  // journal
  html += `
    <div style="font-size:12px;font-weight:700;margin:12px 0 6px;">⏱️ Journal de chantier (${dr.entries.length})</div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${dr.entries.map((e, j) => `
        <div>
          <div style="display:flex;gap:6px;align-items:flex-start;">
            <input class="input" type="time" value="${esc(e.time)}" onchange="WA.days[${d.k}].draft.entries[${j}].time=this.value" style="width:92px;padding:6px;font-size:12px;flex-shrink:0;">
            <textarea class="input" rows="${Math.min(4, Math.max(1, Math.ceil(e.text.length / 90)))}" oninput="WA.days[${d.k}].draft.entries[${j}].text=this.value" style="flex:1;font-size:12px;padding:6px 8px;resize:vertical;min-height:34px;">${esc(e.text)}</textarea>
            ${waSourcesBtn(d, e.refs, `e-${j}`)}
            <button class="btn btn-ghost btn-xs" style="color:var(--accent);padding:2px 6px;min-height:0;" onclick="waEntryDel(${d.k},${j})" title="Retirer">✕</button>
          </div>
          ${waSrcBox(d, `e-${j}`)}
        </div>`).join('')}
    </div>
    <button class="btn btn-ghost btn-xs" style="margin-top:6px;" onclick="waEntryAdd(${d.k})">＋ Ajouter une entrée</button>`;

  // heures par tâche
  const templates = (typeof DAILY_ALL_TEMPLATES !== 'undefined' && DAILY_ALL_TEMPLATES || []).filter(t => t.phase === d.phase);
  const manHours = dr.taskHours.reduce((s, t) => s + (t.hours || 0) * (t.workers || 0), 0);
  html += `
    <div style="font-size:12px;font-weight:700;margin:14px 0 6px;">⏱️ Heures par tâche${manHours ? ` <span style="color:var(--text3);font-weight:400;">— ${String(Math.round(manHours * 100) / 100).replace('.', ',')} h-hommes</span>` : ''}</div>
    ${dr.taskHours.length ? '<div class="wa-hhead"><span>Tâche</span><span style="text-align:right;">Heures</span><span style="text-align:right;">Hommes</span><span></span></div>' : ''}
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${dr.taskHours.map((t, j) => {
        const missing = !(t.hours > 0) || !(t.workers > 0);
        return `
        <div>
          <div class="wa-hrow">
            <div class="wa-htask" style="display:flex;flex-direction:column;gap:4px;min-width:0;">
              <select class="input" style="font-size:12px;padding:5px 6px;" onchange="waHourTpl(${d.k},${j},this.value)">
                ${(t.taskTemplateId && !templates.some(tp => tp.id === t.taskTemplateId) ? [{ id: t.taskTemplateId, title: t.taskTitle }, ...templates] : templates).map(tp => `<option value="${esc(tp.id)}" ${tp.id === t.taskTemplateId ? 'selected' : ''}>${esc(tp.title)}</option>`).join('')}
                <option value="" ${!t.taskTemplateId ? 'selected' : ''}>Autre (texte libre)…</option>
              </select>
              ${!t.taskTemplateId ? `<input class="input" value="${esc(t.taskTitle)}" placeholder="Nom de la tâche" oninput="WA.days[${d.k}].draft.taskHours[${j}].taskTitle=this.value" style="font-size:12px;padding:5px 6px;">` : ''}
            </div>
            <label style="margin:0;"><span class="wa-unit">Heures</span><input class="input" type="number" step="0.25" min="0" value="${t.hours || ''}" placeholder="?" oninput="waHourNum(${d.k},${j},'hours',this.value)" style="font-size:12px;padding:5px 6px;text-align:right;${missing ? 'border-color:var(--amber);' : ''}"></label>
            <label style="margin:0;"><span class="wa-unit">Hommes</span><input class="input" type="number" step="1" min="0" value="${t.workers || ''}" placeholder="?" oninput="waHourNum(${d.k},${j},'workers',this.value)" style="font-size:12px;padding:5px 6px;text-align:right;${missing ? 'border-color:var(--amber);' : ''}"></label>
            <div style="display:flex;gap:2px;">${waSourcesBtn(d, t.refs, `h-${j}`)}<button class="btn btn-ghost btn-xs" style="color:var(--accent);padding:2px 6px;min-height:0;" onclick="waHourDel(${d.k},${j})">✕</button></div>
          </div>
          ${t.basis ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">${esc(t.basis)}</div>` : ''}
          ${missing ? '<div style="font-size:11px;color:var(--amber);">Heures ou hommes non trouvés dans les messages : à compléter, sinon la ligne n’est pas enregistrée.</div>' : ''}
          ${waSrcBox(d, `h-${j}`)}
        </div>`;
      }).join('') || '<div style="font-size:12px;color:var(--text3);">Aucune heure trouvée dans les messages.</div>'}
    </div>
    <button class="btn btn-ghost btn-xs" style="margin-top:6px;" onclick="waHourAdd(${d.k})">＋ Ajouter une ligne</button>`;

  // avancement des tâches du planning
  if (dr.taskUpdates.length) {
    html += `
      <div style="font-size:12px;font-weight:700;margin:14px 0 6px;">✅ Avancement des tâches du planning</div>
      <div style="display:flex;flex-direction:column;gap:4px;">
        ${dr.taskUpdates.map((u, j) => `
          <div>
            <label style="display:flex;gap:8px;align-items:flex-start;font-size:12px;cursor:pointer;">
              <input type="checkbox" ${d.taskSel.has(u.taskId) ? 'checked' : ''} onchange="waTaskToggle(${d.k},'${u.taskId}',this.checked)" style="accent-color:var(--green);margin-top:2px;">
              <span style="flex:1;"><b>${esc(u.title)}</b> : ${WA_STATUS[u.current] || esc(u.current)} → <b style="color:${u.status === 'done' ? 'var(--green)' : u.status === 'blocked' ? 'var(--accent)' : 'var(--amber)'};">${WA_STATUS[u.status]}</b>
                ${u.evidence ? `<span style="color:var(--text3);"> — ${esc(u.evidence)}</span>` : ''}</span>
              ${waSourcesBtn(d, u.refs, `t-${j}`)}
            </label>
            ${waSrcBox(d, `t-${j}`)}
          </div>`).join('')}
      </div>`;
  }

  // photos
  const photos = d.messages.filter(m => m.kind === 'photo');
  const here = photos.filter(waHasMedia);
  if (photos.length) {
    html += `
      <div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 6px;gap:8px;flex-wrap:wrap;">
        <div style="font-size:12px;font-weight:700;">📸 Photos (${d.photoSel.size}/${here.length})${here.length < photos.length ? ` <span style="color:var(--amber);font-weight:400;">· ${photos.length - here.length} absente(s) de l’export</span>` : ''}</div>
        ${here.length ? `<div style="display:flex;gap:6px;"><button class="btn btn-ghost btn-xs" onclick="waPhotosAll(${d.k},true)">Toutes</button><button class="btn btn-ghost btn-xs" onclick="waPhotosAll(${d.k},false)">Aucune</button></div>` : ''}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;">
        ${here.map(m => `
          <div style="background:var(--bg2);border:1px solid ${d.photoSel.has(m.i) ? 'var(--green)' : 'var(--border)'};border-radius:8px;padding:4px;opacity:${d.photoSel.has(m.i) ? 1 : .55};">
            <div style="position:relative;">
              <img data-wa-file="${esc(m.file)}" alt="" style="width:100%;aspect-ratio:1;object-fit:cover;border-radius:6px;background:var(--bg3);display:block;cursor:pointer;" onclick="waOpenPhoto(this)">
              <input type="checkbox" ${d.photoSel.has(m.i) ? 'checked' : ''} onchange="waPhotoToggle(${d.k},${m.i},this.checked)" style="position:absolute;top:6px;left:6px;width:18px;height:18px;accent-color:var(--green);">
              <span style="position:absolute;bottom:4px;right:4px;font-size:10px;background:rgba(0,0,0,.6);color:#fff;border-radius:4px;padding:0 4px;">${m.time}</span>
            </div>
            <input class="input" value="${esc(d.captions[m.i] || '')}" placeholder="Légende" oninput="WA.days[${d.k}].captions[${m.i}]=this.value" style="font-size:11px;padding:4px 6px;margin-top:4px;">
          </div>`).join('')}
      </div>`;
  }

  // documents partagés dans le groupe (PDF / Office) → pièces jointes du rapport
  const docs = d.messages.filter(m => m.kind === 'document' && waHasMedia(m) && ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(waExt(m.file)));
  if (docs.length) {
    html += `
      <div style="font-size:12px;font-weight:700;margin:14px 0 6px;">📎 Documents partagés ce jour-là <span style="color:var(--text3);font-weight:400;">(à joindre au rapport)</span></div>
      ${docs.map(m => {
        const size = WA.media.get(waBase(m.file))?.size || 0;
        const tooBig = size > 10 * 1024 * 1024;
        return `<label style="display:flex;gap:8px;align-items:center;font-size:12px;cursor:${tooBig ? 'default' : 'pointer'};padding:2px 0;">
          <input type="checkbox" ${d.docSel.has(m.i) ? 'checked' : ''} ${tooBig ? 'disabled' : ''} onchange="waDocToggle(${d.k},${m.i},this.checked)" style="accent-color:var(--accent);">
          📄 ${esc(m.file)} <span style="color:var(--text3);">${typeof dailyAttSize === 'function' ? dailyAttSize(size) : ''}${tooBig ? ' · trop lourd (10 Mo max)' : ''}</span></label>`;
      }).join('')}`;
  }

  html += `
    <div style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px;border-top:1px solid var(--border);padding-top:10px;">
      <button class="btn btn-ghost btn-xs" onclick="waToggleMsgsDraft(${d.k})">💬 Tous les messages du jour</button>
      ${WA.parsed.ai.enabled ? `<button class="btn btn-ghost btn-xs" onclick="if(confirm('Relancer l’analyse de ce jour ? Tes corrections seront perdues.'))waAnalyzeDay(WA.days[${d.k}])">↻ Relancer l’IA</button>` : ''}
    </div>
    <div id="wa-dmsgs-${d.k}" style="display:none;max-height:280px;overflow-y:auto;margin-top:8px;"></div>`;
  return box(html, d.approved ? 'var(--green)' : undefined);
}

function waToggleOpen(k) { const d = WA.days[k]; d.open = !d.open; waRenderDay(d); }

function waToggleMsgsDraft(k) {
  const el = document.getElementById(`wa-dmsgs-${k}`);
  if (!el) return;
  if (el.style.display === 'none') { el.innerHTML = waMessagesHtml(WA.days[k].messages, WA.days[k]); el.style.display = 'block'; }
  else el.style.display = 'none';
}

function waApprove(k, on) {
  const d = WA.days[k];
  d.approved = on;
  if (on) {
    // validé : replié, et le jour suivant à relire s'ouvre
    d.open = false;
    const next = WA.days.find(x => x.k > k && x.draft && !x.approved && x.draft.relevant !== false);
    if (next && !next.open) { next.open = true; waRenderDay(next); }
  }
  waRenderDay(d);
  waRenderFooter();
}

function waChangePhase(k, phase) {
  const d = WA.days[k];
  d.phase = phase;
  if (WA.parsed.ai.enabled && d.draft?.model !== null && confirm('Changer de phase change la liste des tâches types : relancer l’analyse de ce jour ? (tes corrections seront perdues)')) {
    waAnalyzeDay(d);
    return;
  }
  waRenderDay(d);
}

function waEntryDel(k, j) { WA.days[k].draft.entries.splice(j, 1); waRenderDay(WA.days[k]); }
function waEntryAdd(k) {
  const dr = WA.days[k].draft;
  dr.entries.push({ time: dr.entries[dr.entries.length - 1]?.time || '', text: '', refs: [] });
  waRenderDay(WA.days[k]);
}

function waHourTpl(k, j, id) {
  const t = WA.days[k].draft.taskHours[j];
  const tpl = (typeof DAILY_ALL_TEMPLATES !== 'undefined' && DAILY_ALL_TEMPLATES || []).find(x => x.id === id);
  t.taskTemplateId = tpl ? tpl.id : null;
  if (tpl) t.taskTitle = tpl.title;
  waRenderDay(WA.days[k]);
}
function waHourNum(k, j, field, v) {
  WA.days[k].draft.taskHours[j][field] = field === 'workers' ? Math.max(0, parseInt(v) || 0) : Math.max(0, parseFloat(String(v).replace(',', '.')) || 0);
}
function waHourDel(k, j) { WA.days[k].draft.taskHours.splice(j, 1); waRenderDay(WA.days[k]); }
function waHourAdd(k) {
  const d = WA.days[k];
  const tpl = (typeof DAILY_ALL_TEMPLATES !== 'undefined' && DAILY_ALL_TEMPLATES || []).find(t => t.phase === d.phase);
  d.draft.taskHours.push({ taskTemplateId: tpl?.id || null, taskTitle: tpl?.title || '', hours: 0, workers: 0, basis: '', refs: [] });
  waRenderDay(d);
}

function waTaskToggle(k, taskId, on) { const s = WA.days[k].taskSel; on ? s.add(taskId) : s.delete(taskId); waRenderFooter(); }
function waPhotoToggle(k, i, on) { const s = WA.days[k].photoSel; on ? s.add(i) : s.delete(i); waRenderDay(WA.days[k]); }
function waPhotosAll(k, on) {
  const d = WA.days[k];
  d.photoSel = new Set(on ? d.messages.filter(m => m.kind === 'photo' && waHasMedia(m)).map(m => m.i) : []);
  waRenderDay(d);
}
function waDocToggle(k, i, on) { const s = WA.days[k].docSel; on ? s.add(i) : s.delete(i); }

/** Vignettes : décompressées à l'affichage seulement. */
function waFillThumbs(root) {
  root.querySelectorAll('img[data-wa-file]:not([src])').forEach(img => {
    waMediaUrl(img.dataset.waFile).then(u => { img.src = u; }).catch(() => { img.alt = '⚠️'; });
  });
}

function waOpenPhoto(img) {
  if (img.src && typeof openPhotoViewer === 'function') openPhotoViewer(img.src);
}

function waRenderFooter() {
  const el = document.getElementById('wa-footer');
  if (!el || !WA) return;
  const shown = WA.days.filter(d => d.status !== 'idle');
  const ready = shown.filter(d => d.draft).length;
  const running = shown.filter(d => d.status === 'running' || d.status === 'waiting').length;
  const ok = shown.filter(d => d.draft && d.approved);
  const cost = shown.reduce((s, d) => s + (d.draft?.costUsd || 0), 0);
  if (WA.confirm && ok.length) { el.innerHTML = waConfirmHtml(ok); return; }
  WA.confirm = false;
  el.innerHTML = `
    <div style="display:flex;gap:8px;justify-content:space-between;align-items:center;flex-wrap:wrap;">
      <div style="font-size:12px;color:var(--text2);">
        ${running ? `<span class="loader"></span> ${ready}/${shown.length} prêt(s)…` : `${ready}/${shown.length} brouillon(s)`} · <b style="color:${ok.length ? 'var(--green)' : 'var(--text3)'};">${ok.length} validé(s)</b>${cost ? ` · IA ≈ ${cost.toFixed(2).replace('.', ',')} $` : ''}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" ${running ? 'disabled' : ''} onclick="if(confirm('Revenir au choix des jours ? Les brouillons seront perdus.')){WA.step='days';waRender();}">← Jours</button>
        <button class="btn btn-green" ${ok.length && !running ? '' : 'disabled'} onclick="WA.confirm=true;waRenderFooter()">✅ Créer ${ok.length || ''} rapport${ok.length > 1 ? 's' : ''} validé${ok.length > 1 ? 's' : ''}…</button>
      </div>
    </div>`;
}

/** Tâches à mettre à jour sur tous les jours validés : le jour le plus récent l'emporte, « terminée » n'est jamais défait. */
function waTaskPlan(days) {
  const plan = new Map();
  [...days].sort((a, b) => a.date.localeCompare(b.date)).forEach(d => {
    d.draft.taskUpdates.filter(u => d.taskSel.has(u.taskId)).forEach(u => {
      const prev = plan.get(u.taskId);
      if (prev?.status === 'done') return;
      plan.set(u.taskId, { taskId: u.taskId, title: u.title, from: prev?.from || u.current, status: u.status, date: d.date });
    });
  });
  return [...plan.values()];
}

function waConfirmHtml(days) {
  const tasks = waTaskPlan(days);
  const rows = days.map(d => {
    const dr = d.draft;
    const hours = dr.taskHours.filter(t => t.taskTitle.trim() && (t.hours > 0 || t.workers > 0));
    const dropped = dr.taskHours.length - hours.length;
    return `<li>${waDayLabel(d.date, { weekday: 'short', day: 'numeric', month: 'short' })} — ${dr.entries.filter(e => e.text.trim()).length} entrée(s), ${d.photoSel.size} photo(s)${hours.length ? `, ${hours.length} ligne(s) d’heures` : ''}${d.docSel.size ? `, ${d.docSel.size} document(s)` : ''}${dropped ? ` <span style="color:var(--amber);">(${dropped} ligne(s) d’heures vide(s) ignorée(s))</span>` : ''}${d.existingReports ? ' <span style="color:var(--amber);">— un rapport existe déjà ce jour-là, celui-ci s’ajoute</span>' : ''}</li>`;
  }).join('');
  return `
    <div style="font-size:13px;line-height:1.55;">
      <div style="font-weight:700;margin-bottom:4px;">Créer ${days.length} rapport${days.length > 1 ? 's' : ''} journalier${days.length > 1 ? 's' : ''} ?</div>
      <ul style="margin:0 0 6px;padding-left:18px;max-height:150px;overflow-y:auto;">${rows}</ul>
      ${tasks.length ? `<div style="margin-bottom:4px;">et mettre à jour ${tasks.length} tâche(s) du planning : ${tasks.map(t => `${esc(t.title)} → <b>${WA_STATUS[t.status]}</b>`).join(' · ')}</div>` : ''}
      <div style="font-size:11px;color:var(--text3);">Les rapports ne sont pas envoyés : tu pourras les relire, les modifier et les envoyer depuis la liste.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm" onclick="WA.confirm=false;waRenderFooter()">← Revenir</button>
        <button class="btn btn-green" onclick="waCreateAll()">✅ Oui, créer</button>
      </div>
    </div>`;
}

// ─── Étape 4 : création ───

async function waUploadPhoto(reportId, m, caption) {
  const blob = await waMediaBlob(m.file);
  const fd = new FormData();
  fd.append('file', new File([blob], m.file.split('/').pop(), { type: waMime(m.file) }));
  if (caption) fd.append('caption', caption.slice(0, 300));
  const r = await fetch(`${API}/upload/daily-photo/${reportId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${TOKEN}` }, body: fd });
  if (!r.ok) throw new Error(`photo ${m.file} : ${r.status}`);
}

async function waCreateAll() {
  if (!WA || WA.busy) return;
  const days = WA.days.filter(d => d.draft && d.approved).sort((a, b) => a.date.localeCompare(b.date));
  if (!days.length) return;
  const tasks = waTaskPlan(days);
  WA.busy = true;
  WA.step = 'create';
  WA.tasks = tasks.map(t => ({ ...t, state: 'waiting' }));
  days.forEach(d => { d.create = { state: 'waiting', photosOk: 0, photosKo: 0, docs: 0, error: null }; });
  WA.created = days;
  waRender();

  for (const d of days) {
    const dr = d.draft;
    d.create.state = 'running';
    waRender();
    try {
      const res = await api('POST', '/daily-reports', {
        projectId: WA.projectId,
        reportDate: d.date,
        weather: dr.weather || undefined,
        workersPresent: Number(dr.workersPresent) || 0,
        generalNotes: dr.summary.trim() || undefined,
        phase: d.phase,
        entries: dr.entries.filter(e => e.text.trim()).map(e => ({ entryTime: e.time || null, description: e.text.trim() })),
        taskHours: dr.taskHours
          .filter(t => t.taskTitle.trim() && (t.hours > 0 || t.workers > 0))
          .map(t => ({ taskTemplateId: t.taskTemplateId || undefined, taskTitle: t.taskTitle.trim(), hours: t.hours || 0, workers: t.workers || 0 })),
      });
      if (!res?.success) throw new Error(res?.error || 'création refusée');
      d.create.reportId = res.data.id;
      const photos = d.messages.filter(m => d.photoSel.has(m.i) && waHasMedia(m));
      await waPool(photos, 3, async m => {
        try { await waUploadPhoto(d.create.reportId, m, (d.captions[m.i] || '').trim()); d.create.photosOk++; }
        catch { d.create.photosKo++; }
        waRender();
      });
      const docs = d.messages.filter(m => d.docSel.has(m.i) && waHasMedia(m));
      if (docs.length) {
        const files = [];
        for (const m of docs) files.push(new File([await waMediaBlob(m.file)], m.file.split('/').pop(), { type: waMime(m.file) }));
        d.create.docs = await sendDailyAttachmentFiles(d.create.reportId, files);
      }
      d.create.state = 'done';
    } catch (e) {
      d.create.state = 'error';
      d.create.error = e.message;
    }
    waRender();
  }

  for (const t of WA.tasks) {
    const res = await api('PATCH', `/tasks/${t.taskId}`, { status: t.status });
    t.state = res?.success ? 'done' : 'error';
  }
  WA.busy = false;
  waRender();
  const okCount = days.filter(d => d.create.state === 'done').length;
  toast(`${okCount} rapport(s) créé(s) depuis WhatsApp${WA.tasks.length ? ` · ${WA.tasks.filter(t => t.state === 'done').length} tâche(s) mise(s) à jour` : ''}`, okCount === days.length ? 'success' : 'warning');
  if (typeof loadDailyReports === 'function') loadDailyReports();
  if (CURRENT_PROJECT_ID === WA.projectId) {
    if (typeof loadDetailDailyReports === 'function') loadDetailDailyReports(WA.projectId);
    if (typeof loadDetailTasks === 'function') loadDetailTasks(WA.projectId);
  }
}

function waCreateHtml() {
  const days = WA.created || [];
  const icon = s => ({ waiting: '⏳', running: '<span class="loader"></span>', done: '✅', error: '❌' }[s] || '');
  return `
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
      ${days.map(d => `
        <div style="display:flex;gap:10px;align-items:center;background:var(--bg3);border-radius:8px;padding:8px 12px;font-size:13px;">
          <span style="width:20px;text-align:center;">${icon(d.create.state)}</span>
          <span style="flex:1;">📓 ${waDayLabel(d.date)}
            <span style="color:var(--text3);font-size:12px;">${d.create.photosOk ? ` · 📷 ${d.create.photosOk}/${d.photoSel.size}` : d.photoSel.size ? ` · 📷 0/${d.photoSel.size}` : ''}${d.create.photosKo ? ` <span style="color:var(--accent);">(${d.create.photosKo} en échec)</span>` : ''}${d.create.docs ? ` · 📎 ${d.create.docs}` : ''}</span>
            ${d.create.error ? `<div style="color:var(--accent);font-size:12px;">${esc(d.create.error)}</div>` : ''}
          </span>
          ${d.create.state === 'done' && typeof openDailyDetail === 'function' && !WA.busy ? `<button class="btn btn-ghost btn-xs" onclick="openDailyDetail('${d.create.reportId}','${WA.projectId}')">👁️ Voir</button>` : ''}
        </div>`).join('')}
      ${(WA.tasks || []).map(t => `
        <div style="display:flex;gap:10px;align-items:center;font-size:12px;padding:2px 12px;color:var(--text2);">
          <span style="width:20px;text-align:center;">${icon(t.state)}</span> Tâche « ${esc(t.title)} » → ${WA_STATUS[t.status]}
        </div>`).join('')}
    </div>
    <div class="wa-foot" style="display:flex;justify-content:flex-end;gap:8px;">
      ${WA.busy ? '<span style="font-size:12px;color:var(--text3);">Création en cours, ne ferme pas cette fenêtre…</span>' : '<button class="btn btn-primary" onclick="closeWhatsAppImport(true)">Fermer</button>'}
    </div>`;
}
