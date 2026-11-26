// ═══════════════════════════════════════════════════════════════════════════
// Attestation de bon montage — annexe V de l'arrêté du 25 juillet 2022 (art. 38)
// Jointe en dernière page du PDF du handover une fois le client signé (A. Pinchart 26.11.2026).
// Préremplie par le serveur (projet, « ✏️ Modifier » du handover, société, étude structure) ; ici on
// vérifie / modifie avant d'envoyer le lien de signature. Seuls les champs modifiés sont gardés : les
// autres suivent le projet. API : GET / PUT /handover/:id/attestation, GET /handover/:id/attestation/pdf,
// PUT /handover/attestation/company (admin / technical manager).
// ═══════════════════════════════════════════════════════════════════════════

const ATT_TEXT_FIELDS = {
  event: [
    ['eventName', 'Nom'],
    ['eventAddress', 'Adresse'],
    ['eventDates', 'Dates', 'Prérempli : fin du montage → début du démontage'],
  ],
  company: [
    ['companyName', 'Nom'],
    ['companyAddress', 'Adresse'],
    ['companyEmail', 'Courriel'],
    ['companyPhone', 'Téléphone'],
    ['managerName', 'Nom et prénom du responsable du montage'],
    ['managerPhone', 'Téléphone du responsable'],
    ['managerFunction', 'Fonction dans l’entreprise'],
  ],
  structure: [
    ['manufacturer', 'Fabriqué par'],
    ['description', 'Descriptif sommaire et marquage(s)', '', 2],
    ['documents', 'Documents et plans utilisés (références, dates, indices)', 'Prérempli : plans validés par le client dans VEM, sinon les PDF de plans du projet', 3],
  ],
};
const ATT_GROUND = [['ancrage', 'Ancrage'], ['haubanage', 'Haubanage'], ['lestage', 'Lestage'], ['autoporte', 'Autoporté']];
const ATT_COMPANY_KEYS = { companyName: 'name', companyAddress: 'address', companyEmail: 'email', companyPhone: 'phone' };

/** Données de la fenêtre ouverte (valeurs préremplies pour « ↺ »). */
let ATT_CUR = null;

function attCanSaveCompany() {
  return !!(CURRENT_USER && ['admin', 'technical_manager'].includes(CURRENT_USER.role));
}

/** Ligne « 📜 Attestation » des cartes handover (colonne attestation de la liste). */
function attestationHandoverLine(h) {
  const off = h && h.attestation && h.attestation.enabled === false;
  return `<div style="font-size:11px;color:${off ? 'var(--text3)' : 'var(--text2)'};margin-top:4px;">📜 Attestation de bon montage : ${off
    ? 'désactivée'
    : h && h.clientSignedAt ? 'dans le PDF signé' : 'ajoutée au PDF quand le client aura signé'}</div>`;
}

function attField(key, label, hint, rows) {
  const v = ATT_CUR.values[key] || '';
  // « ↺ prérempli » seulement quand il y a une valeur préremplie à reprendre
  const edited = ATT_CUR.edited.includes(key) && !!String(ATT_CUR.defaults[key] || '').trim();
  const input = rows
    ? `<textarea class="input" id="att-${key}" rows="${rows}" oninput="attMarkEdited('${key}')">${esc(v)}</textarea>`
    : `<input class="input" id="att-${key}" value="${esc(v)}" oninput="attMarkEdited('${key}')">`;
  return `
    <div class="form-group2" style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <label class="form-label2" style="margin:0;" for="att-${key}">${label}</label>
        <button type="button" class="btn btn-ghost btn-xs" id="att-reset-${key}" style="${edited ? '' : 'display:none;'}" title="Revenir à la valeur préremplie" onclick="attResetField('${key}')">↺ prérempli</button>
      </div>
      ${input}
      ${hint ? `<div style="font-size:11px;color:var(--text3);margin-top:3px;">${hint}</div>` : ''}
    </div>`;
}

function attMarkEdited(key) {
  const el = document.getElementById('att-' + key);
  const btn = document.getElementById('att-reset-' + key);
  const def = String(ATT_CUR.defaults[key] || '').trim();
  if (el && btn) btn.style.display = def && el.value.trim() !== def ? '' : 'none';
}

function attResetField(key) {
  const el = document.getElementById('att-' + key);
  if (el) el.value = ATT_CUR.defaults[key] || '';
  attMarkEdited(key);
}

function attStatusHtml(d) {
  const lines = [];
  if (!d.enabled) lines.push(`<div style="color:var(--text3);">🚫 Désactivée : le PDF signé partira sans attestation.</div>`);
  else if (d.clientSigned) lines.push(`<div style="color:var(--green);">✅ Le client a signé : l’attestation est en dernière page du PDF du handover.</div>`);
  else lines.push(`<div style="color:var(--text2);">📎 Sera ajoutée en dernière page du PDF quand le client aura signé (lien « 🔗 Signer » ou signature sur place).</div>`);
  if (d.missing && d.missing.length) lines.push(`<div style="color:var(--amber);margin-top:4px;">⚠️ À compléter : ${d.missing.map(esc).join(' · ')}</div>`);
  else lines.push(`<div style="color:var(--green);margin-top:4px;">✅ Tous les champs sont remplis.</div>`);
  return lines.join('');
}

async function openHandoverAttestation(handoverId) {
  const res = await api('GET', `/handover/${handoverId}/attestation`);
  if (!res?.success) { toast(res?.error || 'Attestation introuvable', 'error'); return; }
  const d = res.data;
  ATT_CUR = { handoverId, values: d.values, defaults: d.defaults, edited: d.edited || [] };
  const v = d.values;
  const ground = new Set(v.groundLink || []);
  const radio = (name, val, label, cur) => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:4px 0;cursor:pointer;">
      <input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''} onchange="attToggleOther()"> ${label}</label>`;
  const check = (id, checked, label) => `<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin:4px 0;cursor:pointer;">
      <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}> ${label}</label>`;
  const box = (title, inner) => `
    <div style="background:var(--bg3);border-radius:10px;padding:14px;margin-bottom:12px;">
      <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;margin-bottom:10px;">${title}</div>
      ${inner}
    </div>`;

  document.querySelectorAll('.overlay.att-overlay').forEach((o) => o.remove());
  const overlay = document.createElement('div');
  overlay.className = 'overlay open att-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;">
      <div class="modal-head" style="flex-shrink:0;">
        <div>
          <div class="modal-title">📜 Attestation de bon montage</div>
          <div style="font-size:12px;color:var(--text2);">Annexe V de l’arrêté du 25 juillet 2022 — préremplie depuis le projet, modifiable</div>
        </div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="flex:1;overflow-y:auto;padding:0 2px 8px;">
        <label style="display:flex;align-items:center;gap:10px;background:var(--bg3);border-radius:10px;padding:12px 14px;margin-bottom:10px;cursor:pointer;font-weight:600;font-size:14px;">
          <input type="checkbox" id="att-enabled" ${d.enabled ? 'checked' : ''} style="width:18px;height:18px;">
          Joindre l’attestation au PDF signé du handover
        </label>
        <div id="att-status" style="font-size:12px;line-height:1.5;padding:0 4px 12px;">${attStatusHtml(d)}</div>

        ${box('Événement', ATT_TEXT_FIELDS.event.map((f) => attField(...f)).join(''))}
        ${box('Entreprise en charge de l’installation', ATT_TEXT_FIELDS.company.map((f) => attField(...f)).join('')
          + (attCanSaveCompany() ? `<div style="margin-top:6px;">${check('att-save-company', false, '🏢 Garder ce nom, cette adresse, ce courriel et ce téléphone pour tous les handovers')}</div>` : ''))}
        ${box('Caractéristiques de l’ensemble démontable', ATT_TEXT_FIELDS.structure.map((f) => attField(...f)).join('') + `
          <div class="form-label2" style="margin-top:6px;">Liaison au sol</div>
          <div style="display:flex;gap:4px 16px;flex-wrap:wrap;">${ATT_GROUND.map(([k, l]) => check('att-ground-' + k, ground.has(k), l)).join('')}</div>
          <div style="font-size:11px;color:var(--text3);margin:2px 0 10px;">Rien de coché = rubrique entièrement rayée (comme le modèle Viewbox). Les mentions non cochées sont rayées.</div>
          ${attField('windSpeed', 'Vitesse de vent retenue (km/h)', d.defaults.windSpeed ? 'Préremplie depuis la dernière étude structure du projet (vent en service)' : 'Pas d’étude structure dans VEM pour ce projet : à saisir')}
          <div class="form-label2" style="margin-top:6px;">Sécurisation des équipements techniques suspendus</div>
          ${radio('att-suspended', 'art26', 'Réalisée conformément aux dispositions de l’article 26', v.suspended)}
          ${radio('att-suspended', 'none', 'Sans objet', v.suspended)}
          ${radio('att-suspended', 'other', 'Autre à préciser', v.suspended)}
          <div id="att-other-wrap" style="${v.suspended === 'other' ? '' : 'display:none;'}">${attField('suspendedOther', 'Préciser', '')}</div>
        `)}
        ${box('Certification', `
          ${attField('signatory', 'Je, soussigné (nom, prénom et fonction)')}
          <div class="form-label2" style="margin-top:4px;">Certifie avoir monté</div>
          <div style="display:flex;gap:16px;flex-wrap:wrap;">
            ${radio('att-plural', 'le', 'l’ensemble démontable (un seul)', v.plural)}
            ${radio('att-plural', 'les', 'les ensembles démontables', v.plural)}
          </div>
          <div class="form-label2" style="margin-top:8px;">Conformément (décoché = rayé sur l’attestation)</div>
          <div style="font-size:12px;color:var(--text3);margin:2px 0;">— aux pièces graphiques (toujours)</div>
          ${check('att-notice', v.notice, 'à la notice technique et aux plans du fabricant')}
          ${check('att-calcNote', v.calcNote, 'à la conclusion de la note de calcul')}
          ${check('att-typeOpinion', v.typeOpinion, 'à l’avis sur modèle type ou sur dossier technique')}
          <div style="font-size:12px;color:var(--text3);margin:2px 0 10px;">— à l’arrêté sur les structures provisoires et démontables (toujours)</div>
          <div class="input-row">
            <div>${attField('place', 'Fait à')}</div>
            <div class="form-group2" style="margin-bottom:8px;">
              <label class="form-label2" for="att-date">Le</label>
              <input class="input" type="date" id="att-date" value="${esc(v.date || '')}">
              <div style="font-size:11px;color:var(--text3);margin-top:3px;">Vide = date de la signature du client${d.effectiveDate ? ` (date imprimée pour l’instant : ${esc(d.effectiveDate)})` : ''}</div>
            </div>
          </div>
          <div style="font-size:12px;color:${d.hasSignature ? 'var(--green)' : 'var(--amber)'};margin-top:4px;">
            ✍️ Signature : celle du Site Manager dans le handover (bloc « ✍️ Signatures ») — ${d.hasSignature ? '✅ présente' : '⚠️ pas encore signée : l’attestation partira sans signature'}
          </div>
          <div style="font-size:12px;color:var(--text3);margin-top:4px;">L’attestation est toujours en français (document réglementaire), même quand le handover est en anglais.</div>
        `)}
      </div>
      <div class="r-wrap" style="flex-shrink:0;border-top:1px solid var(--border);padding-top:12px;margin-top:4px;display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-ghost btn-sm" onclick="saveHandoverAttestation('${handoverId}', true)">👁 Enregistrer & aperçu PDF</button>
        <button class="btn btn-primary" onclick="saveHandoverAttestation('${handoverId}', false)">💾 Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // Pas de fermeture au clic sur le fond (perte de saisie au téléphone, audit M1).
}

function attToggleOther() {
  const sel = document.querySelector('input[name="att-suspended"]:checked');
  const wrap = document.getElementById('att-other-wrap');
  if (wrap) wrap.style.display = sel && sel.value === 'other' ? '' : 'none';
}

function attCollect() {
  const values = {};
  [...ATT_TEXT_FIELDS.event, ...ATT_TEXT_FIELDS.company, ...ATT_TEXT_FIELDS.structure].forEach(([k]) => {
    const el = document.getElementById('att-' + k);
    if (el) values[k] = el.value;
  });
  ['windSpeed', 'suspendedOther', 'signatory', 'place', 'date'].forEach((k) => {
    const el = document.getElementById('att-' + k);
    if (el) values[k] = el.value;
  });
  values.groundLink = ATT_GROUND.map(([k]) => k).filter((k) => document.getElementById('att-ground-' + k)?.checked);
  values.suspended = document.querySelector('input[name="att-suspended"]:checked')?.value || '';
  values.plural = document.querySelector('input[name="att-plural"]:checked')?.value || 'le';
  ['notice', 'calcNote', 'typeOpinion'].forEach((k) => { values[k] = !!document.getElementById('att-' + k)?.checked; });
  return values;
}

async function saveHandoverAttestation(handoverId, andPreview) {
  const values = attCollect();
  // ouvrir l'onglet tout de suite (sinon le navigateur du téléphone bloque la fenêtre ouverte après l'attente)
  const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const win = andPreview && touch ? window.open('', '_blank') : null;
  // coordonnées de la société d'abord : elles deviennent le préremplissage de tous les handovers
  if (document.getElementById('att-save-company')?.checked) {
    const company = {};
    Object.entries(ATT_COMPANY_KEYS).forEach(([k, c]) => { company[c] = values[k] || ''; });
    const cr = await api('PUT', '/handover/attestation/company', company);
    if (!cr?.success) { if (win) win.close(); toast(cr?.error || 'Coordonnées de la société non enregistrées', 'error'); return; }
  }
  const res = await api('PUT', `/handover/${handoverId}/attestation`, {
    enabled: !!document.getElementById('att-enabled')?.checked,
    values,
  });
  if (!res?.success) { if (win) win.close(); toast(res?.error || 'Attestation non enregistrée', 'error'); return; }
  ATT_CUR = { handoverId, values: res.data.values, defaults: res.data.defaults, edited: res.data.edited || [] };
  const st = document.getElementById('att-status');
  if (st) st.innerHTML = attStatusHtml(res.data);
  toast('Attestation enregistrée ✅', 'success');
  if (andPreview) previewHandoverAttestation(handoverId, win);
  else document.querySelector('.overlay.att-overlay')?.remove();
}

/** Aperçu de l'attestation seule (même rendu que la dernière page du PDF signé). */
async function previewHandoverAttestation(handoverId, win) {
  try {
    const r = await fetch(`${API}/handover/${handoverId}/attestation/pdf?inline=1`, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const url = URL.createObjectURL(await r.blob());
    if (win) win.location.href = url;
    else openFileViewer(url, 'Attestation_bon_montage.pdf');
  } catch (e) {
    if (win) win.close();
    console.error('[attestation pdf]', e);
    toast('Erreur génération de l’attestation', 'error');
  }
}

/** Rappel dans la fenêtre « 🔗 Signer » (choix de la langue) : l'attestation part avec le PDF signé. */
async function fillAttestationSignNote(handoverId) {
  const el = document.getElementById('att-sign-note');
  if (!el) return;
  const res = await api('GET', `/handover/${handoverId}/attestation`);
  if (!res?.success || !document.getElementById('att-sign-note')) return;
  const d = res.data;
  const open = `<button class="btn btn-ghost btn-xs" onclick="openHandoverAttestation('${handoverId}')">✏️ Vérifier</button>`;
  el.innerHTML = !d.enabled
    ? `📜 Attestation de bon montage : désactivée pour ce handover. ${open}`
    : `📜 L’attestation de bon montage (annexe V) sera ajoutée au PDF signé${d.missing.length ? ` — <span style="color:var(--amber);">⚠️ ${d.missing.length} champ(s) à compléter</span>` : ' — ✅ complète'}. ${open}`;
}
