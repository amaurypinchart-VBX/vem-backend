// Mapping statut projet → libellé lisible + couleur badge (utilisé dans loadProjectDetail)
function projectStatusLabel(status) {
  const map = {
    draft:             { lbl: '📄 Brouillon',       cls: 'badge-muted' },
    confirmed:         { lbl: '✔️ Confirmé',         cls: 'badge-blue'  },
    quote_to_validate: { lbl: '📝 Devis à valider',  cls: 'badge-amber' },
    quote_validated:   { lbl: '✅ Devis validé',     cls: 'badge-blue'  },
    in_preparation:    { lbl: '🔧 En préparation',   cls: 'badge-amber' },
    loading:           { lbl: '📦 Chargement',       cls: 'badge-amber' },
    installation:      { lbl: '🏗️ En installation',  cls: 'badge-red'   },
    on_site:           { lbl: '📍 Sur site',         cls: 'badge-red'   },
    handover:          { lbl: '🧾 Handover',         cls: 'badge-blue'  },
    handover_ok:       { lbl: '🧾 Handover OK',      cls: 'badge-green' },
    dismantling:       { lbl: '🔨 Démontage',        cls: 'badge-amber' },
    completed:         { lbl: '🎉 Terminé',          cls: 'badge-green' },
    cancelled:         { lbl: '❌ Annulé',            cls: 'badge-muted' },
  };
  return map[status] || { lbl: status, cls: 'badge-muted' };
}

async function loadProjectDetail(id) {
  const res = await api('GET', `/projects/${id}`);
  if (!res?.success) return;
  const p = res.data;

  document.getElementById('detail-name').textContent = p.name;
  document.getElementById('detail-sub').textContent = `${p.internalNumber} · ${p.client?.name||''}`;
  const statusSel = document.getElementById('detail-status');
  if (statusSel) statusSel.value = p.status || 'in_preparation';

  // Info tab — avec camions + fichiers
  // On exclut les camions archivés (livrés ou retournés) du décompte / liste Infos
  const infoTrucks = (p.trucks || []).filter(t => t.status !== 'delivered' && t.status !== 'returned');
  const filesRes = await api('GET', `/projects/${id}/files`);
  const files = filesRes?.data || [];

  const extOf  = f => (f.fileName||f.fileUrl||'').split('.').pop().toLowerCase();
  const isImg  = f => ['jpg','jpeg','png','gif','webp'].includes(extOf(f));
  const isPDF  = f => extOf(f) === 'pdf';
  const fileIcon = f => {
    if (isImg(f))  return '🖼️';
    if (isPDF(f))  return '📄';
    if (['ppt','pptx'].includes(extOf(f))) return '📊';
    if (['xls','xlsx'].includes(extOf(f))) return '📈';
    if (['doc','docx'].includes(extOf(f))) return '📝';
    if (['mp4','mov'].includes(extOf(f)))  return '🎬';
    return '📎';
  };

  // Truck loading + arrival dates sorted
  const truckDates = infoTrucks
    .filter(t => t.loadingDate || t.arrivalDate || t.departureDate)
    .sort((a,b) => new Date(a.loadingDate||a.departureDate||0) - new Date(b.loadingDate||b.departureDate||0));

  document.getElementById('detail-info-content').innerHTML = `
    <div class="grid-2">

      <!-- INFOS PROJET -->
      <div class="card">
        <div class="card-header"><span class="card-title">📋 Informations</span></div>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            ${infoRow('Client', p.client?.name||'N/A')}
            ${infoRow('N° Interne', p.internalNumber)}
            ${infoRow('Installation', fmtDate(p.installationStart)+' → '+fmtDate(p.installationEnd))}
            ${infoRow('Démontage', p.dismantlingStart ? fmtDate(p.dismantlingStart)+' → '+fmtDate(p.dismantlingEnd) : 'Non défini')}
            ${infoRow('Ouvriers', p.workersCount+' personnes')}
            ${(() => { const s = projectStatusLabel(p.status); return infoRow('Statut', `<span class="badge ${s.cls}">${s.lbl}</span>`); })()}
          </div>
          <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
          ${infoRow('Adresse', p.address)}
          ${p.description ? '<div style="margin-top:10px;font-size:13px;color:var(--text2);">'+p.description+'</div>' : ''}

          ${(p.scope || p.installNotes || p.dismantleNotes) ? `
          <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:10px;">📝 Notes complémentaires</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${p.scope ? `
            <div style="background:rgba(72,149,239,.08);border-left:3px solid #4895ef;border-radius:0 6px 6px 0;padding:8px 12px;">
              <div style="font-size:10px;font-weight:700;color:#4895ef;text-transform:uppercase;margin-bottom:4px;">🌐 Global</div>
              <div style="font-size:13px;color:var(--text);line-height:1.5;white-space:pre-wrap;">${p.scope.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            </div>` : ''}
            ${p.installNotes ? `
            <div style="background:rgba(230,57,70,.08);border-left:3px solid #e63946;border-radius:0 6px 6px 0;padding:8px 12px;">
              <div style="font-size:10px;font-weight:700;color:#e63946;text-transform:uppercase;margin-bottom:4px;">🔨 Installation</div>
              <div style="font-size:13px;color:var(--text);line-height:1.5;white-space:pre-wrap;">${p.installNotes.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            </div>` : ''}
            ${p.dismantleNotes ? `
            <div style="background:rgba(45,198,83,.08);border-left:3px solid #2dc653;border-radius:0 6px 6px 0;padding:8px 12px;">
              <div style="font-size:10px;font-weight:700;color:#2dc653;text-transform:uppercase;margin-bottom:4px;">🔧 Démontage</div>
              <div style="font-size:13px;color:var(--text);line-height:1.5;white-space:pre-wrap;">${p.dismantleNotes.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            </div>` : ''}
          </div>
          ` : ''}

          ${(p.client?.contactName || p.client?.phone || p.client?.email) ? `
          <hr style="border:none;border-top:1px solid var(--border);margin:14px 0;">
          <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">📞 Contact client</div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${p.client?.contactName ? `<div style="display:flex;align-items:center;gap:8px;font-size:13px;"><span>👤</span><span>${p.client.contactName}</span></div>` : ''}
            ${p.client?.phone       ? `<div style="display:flex;align-items:center;gap:8px;font-size:13px;"><span>📞</span><a href="tel:${p.client.phone}" style="color:var(--blue);text-decoration:none;">${p.client.phone}</a></div>` : ''}
            ${p.client?.email       ? `<div style="display:flex;align-items:center;gap:8px;font-size:13px;"><span>✉️</span><a href="mailto:${p.client.email}" style="color:var(--blue);text-decoration:none;">${p.client.email}</a></div>` : ''}
          </div>
          ` : ''}
        </div>
      </div>

      <!-- PROGRESSION -->
      <div class="card">
        <div class="card-header"><span class="card-title">📊 Progression</span></div>
        <div class="card-body" style="text-align:center;padding:24px 20px;">
          <div style="font-family:'Syne',sans-serif;font-size:48px;font-weight:800;color:var(--accent);">${p.progress||0}%</div>
          <div style="font-size:13px;color:var(--text2);margin-bottom:12px;">Tâches complétées</div>
          <div class="prog" style="height:10px;margin-bottom:14px;"><div class="prog-bar" style="width:${p.progress||0}%;background:var(--accent);"></div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div style="background:var(--bg3);border-radius:var(--radius);padding:10px;">
              <div style="font-weight:700;font-size:18px;">${p.tasksTotal||0}</div>
              <div style="font-size:11px;color:var(--text3);">Tâches totales</div>
            </div>
            <div style="background:rgba(45,198,83,.1);border-radius:var(--radius);padding:10px;">
              <div style="font-weight:700;font-size:18px;color:var(--green);">${p.tasksDone||0}</div>
              <div style="font-size:11px;color:var(--text3);">Terminées</div>
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- DATES LOGISTIQUE CAMIONS -->
    ${truckDates.length ? `
    <div class="card" style="margin-top:14px;">
      <div class="card-header">
        <span class="card-title">🚛 Logistique — Dates clés</span>
        <button class="btn btn-ghost btn-sm" onclick="switchTab(document.querySelector('[onclick*=dtab-trucks]'),'dtab-trucks')">Voir tous</button>
      </div>
      <div class="card-body" style="padding:10px 18px;">
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px;">
          ${truckDates.map(t => {
            const icon = {truck:'🚛',van:'🚐',crane:'🏗️',scissor:'🔧',manitou:'🔧',forklift:'🚜',generator:'⚡'}[t.vehicleType]||'🚛';
            const arrived = t.status === 'delivered' || !!t.arrivalDate;
            return `<div style="background:var(--bg3);border-radius:10px;padding:12px;border-left:3px solid ${arrived?'var(--green)':'var(--amber)'};display:flex;flex-direction:column;gap:4px;">
              <div style="font-weight:700;font-size:13px;">${icon} ${t.truckNumber||t.vehicleType||'Camion'}</div>
              ${t.driverName ? `<div style="font-size:11px;color:var(--text3);">👤 ${t.driverName}${t.driverPhone?' · 📞'+t.driverPhone:''}</div>` : ''}
              ${t.loadingDate  ? `<div style="font-size:12px;">📦 <strong>Chargement entrepôt :</strong> ${fmtDateTime(t.loadingDate)}</div>`  : ''}
              ${t.departureDate? `<div style="font-size:12px;">🚀 <strong>Départ :</strong> ${fmtDateTime(t.departureDate)}</div>` : ''}
              ${t.arrivalDate  ? `<div style="font-size:12px;color:var(--green);">✅ <strong>Arrivée site :</strong> ${fmtDateTime(t.arrivalDate)}</div>` : `<div style="font-size:12px;color:var(--amber);">⏳ En attente d'arrivée sur site</div>`}
            
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>` : ''}

    <!-- FICHIERS DU PROJET -->
    <div class="card" style="margin-top:14px;">
      <div class="card-header">
        <span class="card-title">📁 Fichiers</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="switchTab(document.querySelector('[onclick*=dtab-files]'),'dtab-files');loadDetailFiles('${id}')">Gérer</button>
          <button class="btn btn-ghost btn-sm" onclick="showAddFileByUrlModal('${id}')" title="Ajouter un fichier via une URL externe (GitHub Releases, etc.) — utile pour les gros fichiers 3D > 10 Mo">🔗 URL</button>
          <label style="display:flex;align-items:center;gap:4px;background:var(--accent);color:#fff;padding:5px 12px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600;">
            ⬆️ Ajouter
           <input type="file" multiple accept="image/*,.pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.glb,.gltf,.usdz,.skp,.obj,.stl,.fbx,.dae,.ifc,.zip" style="display:none;" onchange="uploadProjectFiles('${id}',this).then(()=>loadProjectDetail('${id}'))">
          </label>
        </div>
      </div>
      <!-- Encart : envoyer des fichiers par mail (Gmail IMAP polling) -->
      <div style="margin:0 18px 8px;padding:8px 12px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:12px;">
        <span style="font-size:18px;">📧</span>
        <div style="flex:1;min-width:200px;">
          <div style="font-weight:600;color:#92400e;">Envoyer des fichiers par email</div>
          <div style="color:#9a3412;">Mail à <strong>warehouseviewbox@gmail.com</strong> avec <strong>${esc(p.internalNumber||'N/A')}</strong> dans le sujet</div>
          <div style="font-size:10px;color:#9a3412;opacity:.85;margin-top:2px;">⏱ Les fichiers apparaîtront dans les 5 minutes</div>
        </div>
        <button class="btn btn-ghost btn-xs" onclick="copyEmailInstructions('${esc(p.internalNumber||'')}');event.stopPropagation();" style="color:#92400e;border-color:#fed7aa;">📋 Copier</button>
      </div>
      <div class="card-body" style="padding:12px 18px;">
        ${!files.length ? `
          <label style="display:flex;flex-direction:column;align-items:center;gap:8px;border:2px dashed var(--border);border-radius:12px;padding:24px;cursor:pointer;color:var(--text3);">
            <span style="font-size:36px;">📁</span>
            <div style="font-weight:600;">Ajouter des fichiers</div>
            <div style="font-size:11px;">Photos, PDF, Office, modèles 3D (GLB/glTF/SketchUp)...</div>
            <input type="file" multiple accept="image/*,.pdf,.ppt,.pptx,.xls,.xlsx,.doc,.docx,.glb,.gltf,.usdz,.skp,.obj,.stl,.fbx,.dae,.zip" style="display:none;" onchange="uploadProjectFiles('${id}',this).then(()=>loadProjectDetail('${id}'))">
          </label>` : (() => {
            // Catégorisation : images / PDF / modèles 3D / autres
            // .zip inclus : peut être un modèle DAE/glTF/OBJ empaqueté avec ses textures
            const is3D = f => ['glb','gltf','usdz','skp','obj','stl','fbx','dae','3ds','blend','ifc','zip'].includes(extOf(f));
            const isPDF = f => extOf(f) === 'pdf';
            const imgs    = files.filter(f => isImg(f));
            const pdfs    = files.filter(f => isPDF(f));
            const models  = files.filter(f => is3D(f));
            const others  = files.filter(f => !isImg(f) && !isPDF(f) && !is3D(f));
            let html = '';

            // ── Photos
            if (imgs.length) {
              html += `<div style="margin-bottom:14px;">
                <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🖼️ Photos (${imgs.length})</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;">
                  ${imgs.map(f=>`
                    <div style="aspect-ratio:1;border-radius:8px;overflow:hidden;cursor:pointer;border:1px solid var(--border);position:relative;" onclick="openFileViewer('${f.fileUrl}','${esc(f.fileName||'')}')">
                      <img src="${f.fileUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" loading="lazy">
                      <div style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(transparent,rgba(0,0,0,.6));padding:3px 5px;">
                        <div style="font-size:9px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.fileName||'')}</div>
                      </div>
                    </div>`).join('')}
                </div></div>`;
            }

            // ── PDF avec preview iframe inline (1 par ligne)
            if (pdfs.length) {
              html += `<div style="margin-bottom:14px;">
                <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">📄 PDF (${pdfs.length})</div>
                <div style="display:flex;flex-direction:column;gap:10px;">
                  ${pdfs.map(f=>`
                    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--bg3);">
                      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--bg2);border-bottom:1px solid var(--border);">
                        <div style="font-weight:600;font-size:13px;display:flex;align-items:center;gap:6px;overflow:hidden;"><span>📄</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.fileName||'PDF')}</span></div>
                        <div style="display:flex;gap:6px;flex-shrink:0;">
                          <button class="btn btn-ghost btn-xs" onclick="openFileViewer('${f.fileUrl}','${esc(f.fileName||'')}')">🔍 Plein écran</button>
                          <a href="${f.fileUrl}" download="${esc(f.fileName||'')}" target="_blank" class="btn btn-ghost btn-xs">⬇️</a>
                        </div>
                      </div>
                      <iframe src="${f.fileUrl}#toolbar=0&view=FitH" style="width:100%;height:340px;border:none;display:block;background:#525659;"></iframe>
                    </div>`).join('')}
                </div></div>`;
            }

            // ── Modèles 3D
            if (models.length) {
              html += `<div style="margin-bottom:14px;">
                <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🎨 Modèles 3D (${models.length})</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;">
                  ${models.map(f=>{
                    const e = extOf(f);
                    const supported  = ['glb','gltf','usdz'].includes(e);
                    const viewer3DOk = ['glb','gltf','stl','obj','dae','zip'].includes(e);
                    const label = e === 'zip' ? '.ZIP · Peut contenir un modèle 3D' : `.${e.toUpperCase()}${supported?' · Visualisable':' · Aperçu indispo'}`;
                    return `<div style="border:1px solid ${supported?'var(--blue)':'var(--amber)'}55;background:var(--bg3);border-radius:10px;padding:14px;transition:all .15s;" onmouseover="this.style.borderColor='${supported?'var(--blue)':'var(--amber)'}'" onmouseout="this.style.borderColor='${supported?'var(--blue)':'var(--amber)'}55'">
                      <div style="cursor:pointer;text-align:center;" onclick="${e === 'zip' ? `openIn3DViewer('${f.fileUrl}','${esc(f.fileName||'')}','${CURRENT_PROJECT_ID}')` : `openFileViewer('${f.fileUrl}','${esc(f.fileName||'')}')`}">
                        <div style="font-size:42px;line-height:1;">${e === 'zip' ? '🗜️' : '🎨'}</div>
                        <div style="font-weight:700;font-size:12px;margin-top:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.fileName||'Modèle')}</div>
                        <div style="font-size:10px;color:var(--text3);margin-top:2px;">${label}</div>
                      </div>
                      ${viewer3DOk ? `
                      <button class="btn btn-primary btn-xs" style="width:100%;margin-top:10px;font-size:11px;" onclick="openIn3DViewer('${f.fileUrl}','${esc(f.fileName||'')}','${CURRENT_PROJECT_ID}')">🎮 Ouvrir Viewer 3D (mesures + photos)</button>
                      ` : ''}
                    </div>`;
                  }).join('')}
                </div></div>`;
            }

            // ── Autres documents
            if (others.length) {
              html += `<div>
                <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">📎 Documents (${others.length})</div>
                <div style="display:flex;flex-direction:column;gap:5px;">
                  ${others.map(f=>`
                    <a href="${f.fileUrl}" target="_blank" style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg3);border-radius:8px;border:1px solid var(--border);text-decoration:none;color:var(--text);" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
                      <span style="font-size:24px;flex-shrink:0;">${fileIcon(f)}</span>
                      <div style="flex:1;min-width:0;">
                        <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.fileName||'Fichier')}</div>
                        <div style="font-size:11px;color:var(--text3);">${extOf(f).toUpperCase()} ${f.fileSize?'· '+Math.round(f.fileSize/1024)+'KB':''}</div>
                      </div>
                      <span style="font-size:18px;color:var(--text3);">↗</span>
                    </a>`).join('')}
                </div></div>`;
            }

            return html;
          })()}
      </div>
    </div>`;

  // Team tab
  const team = p.team || [];
  document.getElementById('detail-team-content').innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">👥 Équipe du Projet</span>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="showModal('modal-user')">+ Créer membre</button>
          <button class="btn btn-primary btn-sm" onclick="showAddToTeamModal('${p.id}')">+ Ajouter à l'équipe</button>
        </div>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Nom</th><th>Rôle</th><th>Phase</th><th>Téléphone</th><th>Lead</th><th></th></tr></thead>
        <tbody>${team.map(m => {
          const phaseLabels = { both:'🔄 Les deux', installation:'🔨 Installation', dismantling:'🔧 Démontage' };
          const currentPhase = m.phase || 'both';
          return `<tr>
          <td><div style="display:flex;align-items:center;gap:8px;"><div style="width:28px;height:28px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;">${(m.user.firstName[0]+m.user.lastName[0]).toUpperCase()}</div><strong>${m.user.firstName} ${m.user.lastName}</strong></div></td>
          <td><span class="badge badge-blue">${m.role}</span></td>
          <td>
            <select onchange="updateTeamMemberPhase('${p.id}','${m.id}',this.value)" style="padding:4px 8px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;cursor:pointer;">
              <option value="both" ${currentPhase==='both'?'selected':''}>${phaseLabels.both}</option>
              <option value="installation" ${currentPhase==='installation'?'selected':''}>${phaseLabels.installation}</option>
              <option value="dismantling" ${currentPhase==='dismantling'?'selected':''}>${phaseLabels.dismantling}</option>
            </select>
          </td>
          <td style="color:var(--text3);">${m.user.phone||'—'}</td>
          <td>${m.isLead?'⭐ Lead':''}</td>
          <td style="white-space:nowrap;">
            <button class="btn btn-ghost btn-xs" onclick="showSendToMemberModal('${p.id}','${m.id}')" title="Envoyer infos / notifier">📤</button>
            <button class="btn btn-ghost btn-xs" onclick="if(confirm('Retirer ${m.user.firstName} ${m.user.lastName} de l\\'équipe ?')) removeTeamMember('${p.id}','${m.id}')" title="Retirer">✕</button>
          </td>
        </tr>`;
        }).join('')}</tbody>
      </table></div>
    </div>`;

  // Trucks tab
  const trucks = p.trucks || [];
  const truckIcons = {truck:'🚛',van:'🚐',crane:'🏗️',lift:'🔼',forklift:'🚜',generator:'⚡',trailer:'🚛',machine:'⚙️',other:'📦'};
  const truckStatusBadge = {planned:'badge-muted',loading:'badge-amber',in_transit:'badge-blue',delivered:'badge-green',returned:'badge-muted'};
  const truckStatusLabel = {draft:'📝 Brouillon',planned:'Planifié',loading:'En chargement',in_transit:'En transit',delivered:'✅ Livré',returned:'Retourné'};
  document.getElementById('detail-trucks-content').innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:14px;">
      <button class="btn btn-primary btn-sm" onclick="showAddTruckModal('${p.id}')">+ Ajouter camion / machine</button>
    </div>
    <div class="grid-2">${trucks.length ? trucks.map(t => {
      const icon = truckIcons[t.vehicleType]||'🚛';
      const isArrived = t.status === 'delivered';
      return `
      <div class="card" style="cursor:pointer;transition:all .2s;" onclick='showAddTruckModal("${p.id}", ${JSON.stringify(t).replace(/'/g,"&#39;")})' onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <div class="card-header">
          <div>
            <div class="card-title">${icon} ${t.truckNumber||t.vehicleType||''}</div>
            ${t.licensePlate?`<div style="font-size:11px;color:var(--text3);">🚘 ${t.licensePlate}</div>`:''}
            ${t.driverName?`<div style="font-size:12px;color:var(--text3);">👤 ${t.driverName}${t.driverPhone?` · <a href="tel:${t.driverPhone}" style="color:var(--blue);">📞 ${t.driverPhone}</a>`:''}</div>`:''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
            <span class="badge ${truckStatusBadge[t.status]||'badge-muted'}">${truckStatusLabel[t.status]||t.status}</span>
            ${!isArrived?`<button class="btn btn-green btn-xs" onclick="event.stopPropagation();quickArrivalTruck('${t.id}','${p.id}')">✅ Arrivé</button>`:''}
          </div>
        </div>
        <div class="card-body" style="padding:10px 18px;font-size:13px;display:grid;gap:5px;">
          ${t.licensePlate?`<div>🚘 ${t.licensePlate}</div>`:''}
          ${t.loadingDate?`<div>📦 Chargement : ${fmtDateTime(t.loadingDate)}</div>`:''}
          ${t.departureDate?`<div>🚀 Départ : ${fmtDateTime(t.departureDate)}</div>`:''}
          ${t.arrivalDate?`<div style="color:var(--green);">✅ Arrivée site : ${fmtDateTime(t.arrivalDate)}</div>`:`<div style="color:var(--amber);">⏳ Arrivée en attente</div>`}
          ${t.notes?`<div style="color:var(--text3);font-size:12px;">📝 ${t.notes}</div>`:''}
        </div>
      </div>`;
    }).join('') : `<div class="empty" style="grid-column:1/-1;"><div class="empty-icon">🚛</div><div class="empty-title">Aucun véhicule planifié</div></div>`}
    </div>`;

  // Load tasks for detail
  loadDetailTasks(id);
}

// ── taskCardHTML helper (used by global tasks view) ──
function taskCardHTML(t) {
  const cls = {todo:'todo',in_progress:'inprog',done:'done',blocked:'blocked'}[t.status]||'';
  const prio = {critical:'badge-red',high:'badge-amber',normal:'badge-muted',low:'badge-muted'}[t.priority]||'badge-muted';
  return `<div class="kcard ${cls}" onclick="openTaskModal('${t.id}','${t.projectId||''}')">
    <div style="font-weight:600;font-size:12px;margin-bottom:5px;line-height:1.3;">${t.title}</div>
    ${t.taskDate?`<div style="font-size:11px;color:var(--text3);">📅 ${fmtDate(t.taskDate)}</div>`:''}
    ${t.assignedTo?`<div style="font-size:11px;color:var(--blue);margin-top:2px;">👤 ${t.assignedTo.firstName} ${t.assignedTo.lastName}</div>`:''}
    <div style="display:flex;gap:4px;margin-top:8px;align-items:center;">
      <span class="badge ${prio}" style="font-size:10px;">${t.priority}</span>
      ${t.status!=='done'?`<button class="btn btn-green" style="font-size:10px;padding:2px 7px;margin-left:auto;" onclick="event.stopPropagation();updateTaskStatus('${t.id}','done')">✓</button>`:''}
    </div>
  </div>`;
}

// ═══ TASKS ═══
async function loadTasks() {
  const res = await api('GET', '/tasks');
  if (!res?.success) return;
  const tasks = res.data;
  const cols = { todo:'col-todo', in_progress:'col-inprog', done:'col-done', blocked:'col-blocked' };
  Object.values(cols).forEach(c => document.getElementById(c).innerHTML = '');
  tasks.forEach(t => {
    const colId = cols[t.status];
    if (colId) document.getElementById(colId).innerHTML += taskCardHTML(t);
  });
  if (!tasks.length) {
    document.getElementById('col-todo').innerHTML = '<div style="color:var(--text3);font-size:12px;padding:10px;">Aucune tâche</div>';
  }
}

async function updateTaskStatus(id, status) {
  const res = await api('PATCH', `/tasks/${id}`, { status });
  if (res?.success) { toast('Tâche mise à jour ✅', 'success'); loadTasks(); if(CURRENT_PROJECT_ID) loadDetailTasks(CURRENT_PROJECT_ID); }
}

// ═══ TICKETS ═══
async function loadTickets() {
  const urgency = document.getElementById('ticket-urgency-filter')?.value || '';
  const url = '/tickets' + (urgency ? `?urgency=${urgency}` : '') + (status ? `${urgency?'&':'?'}status=${status}` : '');
  const [ticketsRes, statsRes] = await Promise.all([api('GET', url), api('GET', '/tickets/stats')]);

  if (statsRes?.success) {
    const s = statsRes.data;
    document.getElementById('tstat-open').textContent = s.open;
    document.getElementById('tstat-inprog').textContent = s.inProgress;
    document.getElementById('tstat-resolved').textContent = s.resolved;
    document.getElementById('tstat-critical').textContent = s.critical;
  }

  if (!ticketsRes?.success) return;
  const urgencyBadge = { critical:'badge-red', high:'badge-amber', medium:'badge-blue', low:'badge-green' };
  const urgencyLabel = { critical:'🔴 Critique', high:'🟠 Élevé', medium:'🟡 Moyen', low:'🟢 Faible' };
  const statusBadge = { open:'badge-red', assigned:'badge-amber', in_progress:'badge-amber', resolved:'badge-green', validated:'badge-green', closed:'badge-muted' };

  document.getElementById('tickets-tbody').innerHTML = ticketsRes.data.length
    ? ticketsRes.data.map(t => `<tr style="cursor:pointer;" onclick="openTicketDetail('${t.id}')">
        <td><strong>${t.title}</strong>${t.locationOnSite?`<br><span style="font-size:11px;color:var(--text3);">${t.locationOnSite}</span>`:''}</td>
        <td>${t.project?.name||'—'}</td>
        <td><span class="badge ${urgencyBadge[t.urgency]||''}">${urgencyLabel[t.urgency]||t.urgency}</span></td>
        <td>${t.assignedTo?`${t.assignedTo.firstName} ${t.assignedTo.lastName}`:'<span style="color:var(--text3);">Non assigné</span>'}</td>
        <td><span class="badge ${statusBadge[t.status]||''}">${t.status}</span></td>
        <td style="color:var(--text3);">${fmtDate(t.createdAt)}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();openTicketDetail('${t.id}')">👁️</button></td>
      </tr>`).join('')
    : '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text3);">Aucun ticket</td></tr>';
}

async function openTicketDetail(id) {
  const res = await api('GET', `/tickets/${id}`);
  if (!res?.success) return;
  const t = res.data;
  const urgencyLabel = { critical:'🔴 Critique', high:'🟠 Élevé', medium:'🟡 Moyen', low:'🟢 Faible' };
  const urgencyColor = { critical:'var(--accent)', high:'var(--amber)', medium:'var(--blue)', low:'var(--green)' };

  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:720px;">
      <div class="modal-head">
        <div class="modal-title">🛠️ ${t.title}</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
        <span class="badge badge-${t.urgency==='critical'?'red':'amber'}">${urgencyLabel[t.urgency]||t.urgency}</span>
        <span class="badge badge-muted">${t.status}</span>
        ${t.project?`<span style="font-size:12px;color:var(--text3);align-self:center;">${t.project.name}</span>`:''}
      </div>
      <div class="grid-2">
        <div>
          <div style="font-size:13px;color:var(--text2);line-height:1.6;margin-bottom:14px;">${t.description}</div>
          ${t.locationOnSite?`<div style="background:var(--bg3);border-radius:var(--radius);padding:10px;font-size:13px;margin-bottom:14px;">📍 ${t.locationOnSite}</div>`:''}
          <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Changer le statut</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm" onclick="updateTicket('${t.id}','in_progress');this.closest('.overlay').remove()">⚡ En cours</button>
            <button class="btn btn-green btn-sm" onclick="updateTicket('${t.id}','resolved');this.closest('.overlay').remove()">✅ Résolu</button>
            <button class="btn btn-outline btn-sm" onclick="updateTicket('${t.id}','closed');this.closest('.overlay').remove()">🔒 Clôturer</button>
          </div>
          <div style="margin-top:14px;">
            <div style="font-size:12px;color:var(--text3);margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Temps passé (heures)</div>
            <div style="display:flex;gap:8px;">
              <input class="input" type="number" id="ticket-time-${t.id}" step="0.5" value="${t.timeSpent||''}" placeholder="0.0" style="width:100px;">
              <button class="btn btn-ghost btn-sm" onclick="saveTicketTime('${t.id}')">Sauvegarder</button>
            </div>
          </div>
        </div>
        <div>
          <div style="background:var(--bg3);border-radius:var(--radius);padding:14px;margin-bottom:12px;font-size:13px;">
            <div style="color:var(--text3);margin-bottom:4px;">Assigné à</div>
            <div style="font-weight:600;">${t.assignedTo?`${t.assignedTo.firstName} ${t.assignedTo.lastName}`:'Non assigné'}</div>
            ${t.plannedDate?`<div style="color:var(--text3);margin-top:8px;margin-bottom:4px;">Date prévue</div><div style="font-weight:600;">${fmtDate(t.plannedDate)}</div>`:''}
          </div>
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">Historique</div>
          <div style="border-left:1px solid var(--border);padding-left:10px;font-size:12px;display:flex;flex-direction:column;gap:8px;">
            ${(t.history||[]).map(h => `<div>
              <div style="color:var(--text3);">${fmtDate(h.createdAt)}</div>
              <div style="color:var(--text2);">${h.comment||`${h.oldStatus||''} → ${h.newStatus||''}`}</div>
            </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if(e.target===el) el.remove(); });
}

async function updateTicket(id, status) {
  const res = await api('PATCH', `/tickets/${id}`, { status });
  if (res?.success) { toast('Ticket mis à jour ✅', 'success'); loadTickets(); }
}

async function saveTicketTime(id) {
  const val = parseFloat(document.getElementById(`ticket-time-${id}`)?.value);
  if (isNaN(val)) return;
  const res = await api('PATCH', `/tickets/${id}`, { timeSpent: val });
  if (res?.success) toast('Temps sauvegardé ✅', 'success');
}

// ═══ TEAM ═══
// Team categories — ordered display
const TEAM_CATEGORIES = [
  { key: 'sales_engineer',     label: 'Sales Engineer',      icon: '💼', color: '#8b5cf6' },
  { key: 'project_manager',    label: 'Project Manager',     icon: '📊', color: '#4895ef' },
  { key: 'technical_manager',  label: 'Technical Manager',   icon: '⚙️',  color: '#f4a261' },
  { key: 'site_manager',       label: 'Site Manager',        icon: '🏗️', color: '#2dc653' },
  { key: 'installer',          label: 'Installateur',        icon: '🔧', color: '#e63946' },
  { key: 'worker',             label: 'Ouvrier / Équipe',    icon: '👷', color: '#6b7280' },
  { key: 'admin',              label: 'Admin',               icon: '🔑', color: '#e63946' },
  { key: 'engineer',           label: 'Engineer',            icon: '🛠️', color: '#4895ef' },
  { key: 'warehouse',          label: 'Entrepôt',            icon: '📦', color: '#f4a261' },
  { key: 'client',             label: 'Client',              icon: '🤝', color: '#6b7280' },
];

// ═══ DAILY REPORTS ═══
async function loadDailyReports() {
  const res = await api('GET', '/daily-reports');
  if (!res?.success) return;
  const el = document.getElementById('daily-list');
  if (!res.data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📓</div><div class="empty-title">Aucun rapport</div><div class="empty-sub">Créez votre premier rapport journalier</div></div>';
    return;
  }
  el.innerHTML = res.data.map(r => {
    const nbEntries = r._count?.entries || 0;
    const nbPhotos  = r._count?.photos  || 0;
    const preview   = (r.entries || []).slice(0, 3);
    const updatedAt = r.updatedAt ? new Date(r.updatedAt) : null;
    const updatedAgo = updatedAt ? `Modifié ${updatedAt.toLocaleDateString('fr-FR')} ${updatedAt.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}` : '';
    return `
    <div class="card" style="margin-bottom:12px;cursor:pointer;" onclick="editDailyReport('${r.id}')">
      <div class="card-header">
        <div style="flex:1;min-width:0;">
          <div class="card-title">📓 Rapport du ${fmtDate(r.reportDate)}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">
            Par ${r.createdBy?`${r.createdBy.firstName} ${r.createdBy.lastName}`:'N/A'} · ${r.workersPresent} ouvriers ${r.weather?' · '+r.weather:''}
          </div>
          <div style="display:flex;gap:10px;margin-top:6px;font-size:12px;flex-wrap:wrap;align-items:center;">
            <span style="background:var(--bg3);padding:2px 8px;border-radius:10px;">⏱️ ${nbEntries} entrée${nbEntries>1?'s':''}</span>
            ${nbPhotos>0?`<span style="background:var(--bg3);padding:2px 8px;border-radius:10px;">📸 ${nbPhotos} photo${nbPhotos>1?'s':''}</span>`:''}
            ${updatedAgo?`<span style="color:var(--text3);font-size:11px;">· ${updatedAgo}</span>`:''}
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:flex-start;flex-shrink:0;" onclick="event.stopPropagation();">
          ${r.sentAt?'<span class="badge badge-green">✉️ Envoyé</span>':''}
          <button class="btn btn-ghost btn-sm" onclick="downloadDailyPDF('${r.id}')">📄 PDF</button>
          ${!r.sentAt?`<button class="btn btn-primary btn-sm" onclick="sendDailyReport('${r.id}')">📤 Envoyer</button>`:''}
        </div>
      </div>
      ${preview.length ? `
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:3px;">
          ${preview.map(e => `<div style="display:flex;gap:8px;"><span style="font-family:monospace;font-weight:600;color:var(--accent);min-width:42px;flex-shrink:0;">${e.entryTime||'--:--'}</span><span style="color:var(--text2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${e.description||''}</span></div>`).join('')}
          ${nbEntries > 3 ? `<div style="font-size:11px;color:var(--text3);margin-top:2px;">+ ${nbEntries-3} autre${nbEntries-3>1?'s':''}…</div>` : ''}
        </div>
      ` : ''}
      ${r.generalNotes?`<div class="card-body" style="font-size:13px;color:var(--text2);margin-top:6px;">${r.generalNotes}</div>`:''}
    </div>`;
  }).join('');
}

async function downloadDailyPDF(id) {
  const lang = await pickPdfLang();
  if (!lang) return;
  toast('Génération PDF...', 'info');
  try {
    const r = await fetch(`${API}/daily-reports/${id}/pdf?lang=${lang}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` },
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DailyReport_${id.slice(0,8)}_${lang}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('PDF téléchargé ✅', 'success');
  } catch (e) {
    console.error('[daily pdf]', e);
    toast('Erreur PDF', 'error');
  }
}

async function sendDailyReport(id) {
  const teamOptions = (USERS || [])
    .filter(u => u.email && u.isActive !== false)
    .map(u => ({ id: u.id, email: u.email, name: `${u.firstName} ${u.lastName}`, role: u.role }));

  const repRes = await api('GET', `/daily-reports/${id}`);
  if (!repRes?.success) { toast('Rapport introuvable', 'error'); return; }
  const r = repRes.data;
  const clientEmail = r.project?.client?.email || null;

  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head">
        <div class="modal-title">📤 Envoyer le rapport</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px;">
        Rapport du ${fmtDate(r.reportDate)} — ${r.project?.name || ''}
      </div>

      <!-- 🌐 Langue du PDF -->
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🌐 Langue du PDF</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;" id="send-lang-wrap">
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--bg3);border:2px solid var(--accent);border-radius:6px;cursor:pointer;font-weight:600;">
          <input type="radio" name="send-lang" value="fr" checked style="accent-color:var(--accent);">
          🇫🇷 Français
        </label>
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--bg3);border:2px solid var(--border);border-radius:6px;cursor:pointer;">
          <input type="radio" name="send-lang" value="en" style="accent-color:var(--accent);">
          🇬🇧 English
        </label>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">👥 Équipe</div>
      <div id="send-team-list" style="max-height:200px;overflow-y:auto;background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:12px;">
        ${teamOptions.length ? teamOptions.map(u => `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;border-radius:6px;" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background='transparent'">
            <input type="checkbox" class="send-team-cb" value="${u.email}" style="accent-color:var(--accent);">
            <span style="font-size:13px;flex:1;">${u.name}</span>
            <span style="font-size:11px;color:var(--text3);">${u.email}</span>
          </label>
        `).join('') : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px;">Aucun membre avec email</div>'}
      </div>

      ${clientEmail ? `
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🤝 Client</div>
        <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg3);border-radius:6px;margin-bottom:12px;cursor:pointer;">
          <input type="checkbox" id="send-client-cb" value="${clientEmail}" checked style="accent-color:var(--accent);">
          <span style="font-size:13px;flex:1;">${esc(r.project.client.name||'Client')}</span>
          <span style="font-size:11px;color:var(--text3);">${clientEmail}</span>
        </label>
      ` : ''}

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">✉️ Adresses manuelles</div>
      <textarea class="input" id="send-manual-emails" rows="3" placeholder="Une adresse par ligne ou séparées par des virgules&#10;ex : contact@viewbox.be, jean@example.com" style="font-size:13px;margin-bottom:14px;"></textarea>

      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="submitSendDaily('${id}',this.closest('.overlay'))">📤 Envoyer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });

  // Highlight visuel du toggle FR/EN sur clic
  el.querySelectorAll('input[name="send-lang"]').forEach(r => {
    r.addEventListener('change', () => {
      el.querySelectorAll('#send-lang-wrap label').forEach(l => {
        const checked = l.querySelector('input').checked;
        l.style.borderColor = checked ? 'var(--accent)' : 'var(--border)';
      });
    });
  });
}
async function submitSendDaily(id, overlay) {
  const list = new Set();
  document.querySelectorAll('.send-team-cb:checked').forEach(cb => list.add(cb.value));
  const cli = document.getElementById('send-client-cb');
  if (cli && cli.checked) list.add(cli.value);
  (document.getElementById('send-manual-emails')?.value || '').split(/[\s,;]+/).forEach(e => {
    const s = e.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) list.add(s);
  });
  if (list.size === 0) { toast('Sélectionne au moins un destinataire', 'error'); return; }

  // Lecture de la langue choisie
  const lang = document.querySelector('input[name="send-lang"]:checked')?.value || 'fr';

  toast(`Envoi à ${list.size} destinataire(s)...`, 'info');
  const res = await api('POST', `/daily-reports/${id}/send`, {
    recipients: Array.from(list),
    lang,  // ⬅️ ajout
  });
  if (res?.success) {
    toast(`Rapport envoyé à ${res.data.sentTo} destinataire(s) ✉️`, 'success');
    overlay?.remove();
  } else {
    toast(res?.error || 'Erreur envoi', 'error');
  }
}

// ═══ HANDOVERS ═══
async function loadHandovers() {
  const res = await api('GET', '/handover');
  if (!res?.success) return;
  const el = document.getElementById('handover-list');
  if (!res.data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🧾</div><div class="empty-title">Aucun handover</div><div class="empty-sub">Créez votre premier rapport de réception</div></div>';
    return;
  }
  el.innerHTML = res.data.map(h => `
    <div class="card" style="margin-bottom:12px;">
      <div class="card-header">
        <div>
          <div class="card-title">🧾 ${h.project?.name||'Handover'}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">${h.clientName||''} · ${fmtDate(h.createdAt)}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge ${h.status==='signed'?'badge-green':'badge-amber'}">${h.status}</span>
          <button class="btn btn-ghost btn-sm" onclick="downloadHandoverPDF('${h.id}')">📄 PDF</button>
          <button class="btn btn-primary btn-sm" onclick="generateAndSendHandover('${h.id}')">📤 Générer & Envoyer</button>
        </div>
      </div>
      <div class="card-body" style="padding:12px 18px;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${(h.items||[]).map(i => `<span class="badge ${i.status==='ok'?'badge-green':i.status==='remark'?'badge-amber':'badge-red'}">${i.zoneName}</span>`).join('')}
        </div>
      </div>
    </div>`).join('');
}

async function downloadHandoverPDF(id) {
  toast('Génération PDF...', 'info');
  const r = await fetch(`${API}/reports/handover/${id}`, { headers: { 'Authorization': `Bearer ${TOKEN}` } });
  if (r.ok) {
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Handover_${id}.pdf`;
    a.click();
    toast('PDF téléchargé ✅', 'success');
  } else toast('Erreur PDF', 'error');
}

async function generateAndSendHandover(id) {
  const hRes = await api('GET', `/handover/${id}`);
  if (!hRes?.success) { toast('Handover introuvable', 'error'); return; }
  const h = hRes.data;
  const clientEmail = h.project?.client?.email || null;

  const teamOptions = (USERS || [])
    .filter(u => u.email && u.isActive !== false)
    .map(u => ({ id: u.id, email: u.email, name: `${u.firstName} ${u.lastName}` }));

  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:520px;">
      <div class="modal-head">
        <div class="modal-title">📤 Envoyer le handover</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>
      <div style="font-size:13px;color:var(--text2);margin-bottom:14px;">
        ${h.project?.name || ''} · ${fmtDate(h.createdAt)}
      </div>

      <!-- 🌐 Langue du PDF -->
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🌐 Langue du PDF</div>
      <div style="display:flex;gap:8px;margin-bottom:14px;" id="hsend-lang-wrap">
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--bg3);border:2px solid var(--accent);border-radius:6px;cursor:pointer;font-weight:600;">
          <input type="radio" name="hsend-lang" value="fr" checked style="accent-color:var(--accent);">
          🇫🇷 Français
        </label>
        <label style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:10px;background:var(--bg3);border:2px solid var(--border);border-radius:6px;cursor:pointer;">
          <input type="radio" name="hsend-lang" value="en" style="accent-color:var(--accent);">
          🇬🇧 English
        </label>
      </div>

      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">👥 Équipe</div>
      <div style="max-height:200px;overflow-y:auto;background:var(--bg3);border-radius:var(--radius);padding:8px;margin-bottom:12px;">
        ${teamOptions.length ? teamOptions.map(u => `
          <label style="display:flex;align-items:center;gap:8px;padding:5px 6px;cursor:pointer;border-radius:6px;">
            <input type="checkbox" class="hsend-team-cb" value="${u.email}" style="accent-color:var(--accent);">
            <span style="font-size:13px;flex:1;">${u.name}</span>
            <span style="font-size:11px;color:var(--text3);">${u.email}</span>
          </label>
        `).join('') : '<div style="font-size:12px;color:var(--text3);text-align:center;padding:8px;">Aucun membre avec email</div>'}
      </div>
      ${clientEmail ? `
        <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">🤝 Client</div>
        <label style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:var(--bg3);border-radius:6px;margin-bottom:12px;cursor:pointer;">
          <input type="checkbox" id="hsend-client-cb" value="${clientEmail}" checked style="accent-color:var(--accent);">
          <span style="font-size:13px;flex:1;">${esc(h.project.client.name||'Client')}</span>
          <span style="font-size:11px;color:var(--text3);">${clientEmail}</span>
        </label>
      ` : ''}
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;margin-bottom:8px;">✉️ Adresses manuelles</div>
      <textarea class="input" id="hsend-manual" rows="3" placeholder="Une adresse par ligne ou séparées par des virgules" style="font-size:13px;margin-bottom:14px;"></textarea>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="submitSendHandover('${id}',this.closest('.overlay'))">📤 Envoyer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });

  // Highlight visuel du toggle FR/EN sur clic
  el.querySelectorAll('input[name="hsend-lang"]').forEach(r => {
    r.addEventListener('change', () => {
      el.querySelectorAll('#hsend-lang-wrap label').forEach(l => {
        const checked = l.querySelector('input').checked;
        l.style.borderColor = checked ? 'var(--accent)' : 'var(--border)';
      });
    });
  });
}
async function submitSendHandover(id, overlay) {
  const list = new Set();
  document.querySelectorAll('.hsend-team-cb:checked').forEach(cb => list.add(cb.value));
  const cli = document.getElementById('hsend-client-cb');
  if (cli && cli.checked) list.add(cli.value);
  (document.getElementById('hsend-manual')?.value || '').split(/[\s,;]+/).forEach(e => {
    const s = e.trim().toLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) list.add(s);
  });
  if (list.size === 0) { toast('Sélectionne au moins un destinataire', 'error'); return; }

  // Lecture de la langue choisie
  const lang = document.querySelector('input[name="hsend-lang"]:checked')?.value || 'fr';

  toast(`Envoi à ${list.size} destinataire(s)...`, 'info');
  const res = await api('POST', `/handover/${id}/send`, {
    recipients: Array.from(list),
    lang,  // ⬅️ ajout
  });
  if (res?.success) {
    toast(`Handover envoyé à ${res.data.sentTo} destinataire(s) ✉️`, 'success');
    overlay?.remove();
  } else {
    toast(res?.error || 'Erreur envoi', 'error');
  }
}
// ═══ WAREHOUSE ═══
async function loadWarehouse() {
  const res = await api('GET', '/warehouse/boxes');
  if (!res?.success) return;
  const el = document.getElementById('warehouse-content');
  if (!res.data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📦</div><div class="empty-title">Aucune box</div><div class="empty-sub">Créez votre première box de matériel</div></div>';
    return;
  }
  const statusColors = { preparing:'badge-amber', ready:'badge-green', loaded:'badge-blue', on_site:'badge-blue', returned:'badge-muted', incomplete:'badge-red' };
  el.innerHTML = res.data.map(b => `
    <div class="card" style="margin-bottom:12px;">
      <div class="card-header">
        <div>
          <div class="card-title">📦 ${b.name}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px;">${b._count?.items||0} articles · ${b.preparedBy?`${b.preparedBy.firstName} ${b.preparedBy.lastName}`:''}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span class="badge ${statusColors[b.status]||'badge-muted'}">${b.status}</span>
          <button class="btn btn-ghost btn-sm" onclick="openBoxDetail('${b.id}')">👁️ Voir</button>
          ${b.status==='preparing'?`<button class="btn btn-green btn-sm" onclick="validateBox('${b.id}')">✅ Valider</button>`:''}
        </div>
      </div>
      ${b.qrCode?`<div class="card-body" style="padding:8px 18px;"><span style="font-size:11px;background:var(--bg3);padding:3px 8px;border-radius:6px;font-family:monospace;">🔲 ${b.qrCode}</span></div>`:''}
    </div>`).join('');
}

async function openBoxDetail(id) {
  const res = await api('GET', `/warehouse/boxes/${id}`);
  if (!res?.success) return;
  const b = res.data;
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-head"><div class="modal-title">📦 ${b.name}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div style="margin-bottom:16px;">
        <span class="badge badge-muted">${b.status}</span>
        ${b.qrCode?`<span style="font-size:11px;background:var(--bg3);padding:3px 8px;border-radius:6px;font-family:monospace;margin-left:8px;">🔲 ${b.qrCode}</span>`:''}
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>Article</th><th>Quantité</th><th>Unité</th><th>Présent</th><th>Notes</th></tr></thead>
        <tbody>${(b.items||[]).map(i => `<tr>
          <td><strong>${i.productName}</strong></td>
          <td>${i.quantity}</td>
          <td>${i.unit}</td>
          <td>${i.isPresent===true?'✅':i.isPresent===false?'❌':'—'}</td>
          <td style="color:var(--text3);">${i.notes||''}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="margin-top:16px;display:flex;gap:8px;">
        <input class="input" id="new-item-name" placeholder="Nouveau article..." style="flex:1;">
        <input class="input" id="new-item-qty" type="number" value="1" style="width:70px;">
        <button class="btn btn-primary btn-sm" onclick="addBoxItem('${b.id}')">+ Ajouter</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if(e.target===el) el.remove(); });
}

async function addBoxItem(boxId) {
  const name = document.getElementById('new-item-name').value.trim();
  const qty = parseFloat(document.getElementById('new-item-qty').value);
  if (!name) return;
  const res = await api('POST', `/warehouse/boxes/${boxId}/items`, { productName: name, quantity: qty });
  if (res?.success) { toast('Article ajouté ✅', 'success'); document.querySelector('.overlay.open')?.remove(); loadWarehouse(); }
}

async function validateBox(id) {
  const res = await api('PATCH', `/warehouse/boxes/${id}`, { status: 'ready', validatedAt: new Date().toISOString() });
  if (res?.success) { toast('Box validée ✅', 'success'); loadWarehouse(); }
}

// ═══ TOOLBOXES ═══
async function loadToolboxes() {
  const res = await api('GET', '/toolbox');
  if (!res?.success) return;
  const el = document.getElementById('toolbox-content');
  if (!res.data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🧰</div><div class="empty-title">Aucune boîte</div><div class="empty-sub">Créez votre première boîte à outils</div></div>';
    return;
  }
  el.innerHTML = res.data.map(tb => {
    const drawers = tb.drawers || [];
    const allTools = drawers.flatMap(d => d.tools || []);
    const checked = allTools.filter(t => t.isChecked).length;
    const pct = allTools.length > 0 ? Math.round(checked/allTools.length*100) : 0;
    return `
      <div class="card" style="margin-bottom:12px;">
        <div class="card-header">
          <div>
            <div class="card-title">🧰 ${tb.name}</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">${drawers.length} tiroirs · ${allTools.length} outils · ${checked} vérifiés</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <span class="badge badge-muted">${pct}%</span>
            <button class="btn btn-ghost btn-sm" onclick="openToolboxDetail('${tb.id}')">👁️ Voir</button>
          </div>
        </div>
        <div class="card-body" style="padding:8px 18px;">
          <div class="prog" style="height:5px;"><div class="prog-bar" style="width:${pct}%;background:var(--green);"></div></div>
        </div>
      </div>`;
  }).join('');
}

async function openToolboxDetail(id) {
  const res = await api('GET', `/toolbox/${id}`);
  if (!res?.success) return;
  const tb = res.data;
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:700px;">
      <div class="modal-head"><div class="modal-title">🧰 ${tb.name}</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div style="margin-bottom:16px;display:flex;gap:8px;align-items:center;">
        <span>${tb.stats?.checked||0}/${tb.stats?.total||0} outils vérifiés</span>
        ${tb.stats?.missing>0?`<span class="badge badge-red">${tb.stats.missing} manquant(s)</span>`:''}
      </div>
      ${(tb.drawers||[]).map(d => `
        <div class="card" style="margin-bottom:10px;">
          <div class="card-header">
            <span class="card-title">${d.name}</span>
            <span class="badge ${d.isValidated?'badge-green':'badge-amber'}">${d.isValidated?'✅ Validé':'En attente'}</span>
          </div>
          <div class="card-body" style="padding:10px 18px;">
            ${(d.tools||[]).map(t => `
              <div class="check-item ${t.isChecked?'checked':''}">
                <input type="checkbox" class="check-cb" ${t.isChecked?'checked':''} onchange="checkTool('${t.id}',this.checked)">
                <div style="flex:1;font-size:13px;">${t.name}</div>
                <span style="font-size:12px;background:var(--bg3);padding:2px 8px;border-radius:6px;">×${t.expectedQty}</span>
                <span class="badge ${t.status==='ok'?'badge-green':t.status==='missing'?'badge-red':'badge-amber'}">${t.status}</span>
              </div>`).join('')}
            ${!d.isValidated?`<button class="btn btn-green btn-sm" style="margin-top:8px;" onclick="validateDrawer('${d.id}')">✅ Valider le tiroir</button>`:''}
          </div>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if(e.target===el) el.remove(); });
}

async function checkTool(id, isChecked) {
  await api('PATCH', `/toolbox/tools/${id}`, { isChecked, status: isChecked ? 'ok' : 'missing' });
}

async function validateDrawer(id) {
  const res = await api('POST', `/toolbox/drawers/${id}/validate`);
  if (res?.success) { toast('Tiroir validé ✅', 'success'); document.querySelector('.overlay.open')?.remove(); loadToolboxes(); }
}

// ═══ NOTIFICATIONS ═══
async function loadNotifs() {
  const res = await api('GET', '/notifications');
  if (!res?.success) return;
  const el = document.getElementById('notifs-list');
  document.getElementById('notifs-badge').textContent = res.meta.unread;
  if (!res.data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">🔔</div><div class="empty-title">Aucune notification</div></div>';
    return;
  }
  el.innerHTML = res.data.map(n => `
    <div style="display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border);${!n.isRead?'background:rgba(230,57,70,.03);':''}" onclick="markRead('${n.id}')">
      <div style="font-size:22px;">${n.type.includes('ticket')?'🛠️':n.type.includes('task')?'✅':n.type.includes('daily')?'📓':'🔔'}</div>
      <div style="flex:1;">
        <div style="font-weight:${n.isRead?'400':'600'};font-size:14px;">${n.title}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px;">${n.body||''} · ${fmtDate(n.createdAt)}</div>
      </div>
      ${!n.isRead?'<span class="badge badge-red">Nouveau</span>':'<span class="badge badge-muted">Lu</span>'}
    </div>`).join('');
}

async function markRead(id) {
  await api('PATCH', `/notifications/${id}/read`);
  loadNotifs();
}

async function markAllRead() {
  await api('PATCH', '/notifications/read-all');
  toast('Tout marqué comme lu ✅', 'success');
  loadNotifs();
}

// ═══ CREATE ACTIONS ═══
// ═══════════════════════════════════════════
// Édition d'un projet existant — ouvre le modal "modal-proj" pré-rempli
// ═══════════════════════════════════════════
async function openEditProjectModal(projectId) {
  // 1) Récupérer le projet complet (avec camions, équipe, etc.)
  const res = await api('GET', `/projects/${projectId}`);
  if (!res?.success) { toast('Projet introuvable', 'error'); return; }
  const p = res.data;

  // 2) Activer le mode édition (intercepté par showModal et createProject)
  EDITING_PROJECT_ID = projectId;

  // 3) Pré-remplir les inputs simples
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('proj-name',              p.name);
  set('proj-num',               p.internalNumber);
  set('proj-workers',           p.workersCount || 5);
  set('proj-addr',              p.address);
  set('proj-desc',              p.description || p.notes || '');
  set('proj-scope',             p.scope || '');
  set('proj-install-notes',     p.installNotes || '');
  set('proj-dismantle-notes',   p.dismantleNotes || '');
  // Les dates ISO doivent être tronquées en YYYY-MM-DDTHH:mm pour les inputs type="datetime-local"
  // En HEURE LOCALE pour éviter le décalage UTC qui faisait apparaître +2h
  const toDT = toLocalDatetimeInput;
  set('proj-start',             toDT(p.installationStart));
  set('proj-end',               toDT(p.installationEnd));
  set('proj-dismantling-start', toDT(p.dismantlingStart));
  set('proj-dismantling-end',   toDT(p.dismantlingEnd));

  // 4) Pré-sélectionner le client (le select existant a déjà ses options chargées)
  const cliSel = document.getElementById('proj-client');
  if (cliSel) cliSel.value = p.clientId || '';

  // 5) Pré-remplir la liste des camions/véhicules avec ceux déjà en base
  PROJ_TRUCKS = (p.trucks || []).map(t => ({
    id:           t.id,           // ⚠️ On garde l'ID pour pouvoir distinguer ajout / mise à jour au submit
    vehicleType:  t.vehicleType || 'truck',
    truckNumber:  t.truckNumber  || '',
    licensePlate: t.licensePlate || '',
    driverName:   t.driverName   || '',
    driverPhone:  t.driverPhone  || '',
    loadingDate:  t.loadingDate ? toLocalDatetimeInput(t.loadingDate) : '',
    arrivalDate:  t.arrivalDate ? toLocalDatetimeInput(t.arrivalDate) : '',
    notes:        t.notes        || '',
  }));
  if (typeof renderProjTrucks === 'function') renderProjTrucks();

  // 6) Ouvrir le modal (showModal va voir EDITING_PROJECT_ID et passer en mode édition)
  showModal('modal-proj');
}

async function createProject() {
  const name     = document.getElementById('proj-name').value.trim();
  const clientId = document.getElementById('proj-client').value;
  const address  = document.getElementById('proj-addr').value.trim();
  const start    = document.getElementById('proj-start').value;
  const end      = document.getElementById('proj-end').value;
  const dismStart = document.getElementById('proj-dismantling-start')?.value || '';
  const dismEnd   = document.getElementById('proj-dismantling-end')?.value || '';

  if (!name || !clientId || !address || !start || !end) {
    toast('Remplis les champs obligatoires (Nom, Client, Adresse, Dates installation)', 'error');
    return;
  }

  const btn = document.getElementById('proj-create-btn');
  const isEdit = !!EDITING_PROJECT_ID;
  if (btn) { btn.disabled=true; btn.innerHTML='<span class="loader"></span> ' + (isEdit?'Enregistrement...':'Création...'); }

  // Build body — only include dismantling if filled
  // Les dates datetime-local doivent être converties en ISO UTC explicite via
  // fromLocalDatetimeInput, sinon le serveur Node (en UTC) les interprète mal.
  const body = {
    name, clientId, address,
    internalNumber: document.getElementById('proj-num').value.trim() || undefined,
    workersCount: parseInt(document.getElementById('proj-workers').value) || 0,
    description: document.getElementById('proj-desc').value.trim() || undefined,
    scope:          document.getElementById('proj-scope')?.value.trim() || null,
    installNotes:   document.getElementById('proj-install-notes')?.value.trim() || null,
    dismantleNotes: document.getElementById('proj-dismantle-notes')?.value.trim() || null,
    installationStart: fromLocalDatetimeInput(start),
    installationEnd:   fromLocalDatetimeInput(end),
    city: address.split(',').pop()?.trim() || '',
  };
  if (dismStart) body.dismantlingStart = fromLocalDatetimeInput(dismStart);
  if (dismEnd)   body.dismantlingEnd   = fromLocalDatetimeInput(dismEnd);

  // En mode édition : PATCH ; sinon POST
  const res = isEdit
    ? await api('PATCH', `/projects/${EDITING_PROJECT_ID}`, body)
    : await api('POST',  '/projects', body);

  if (btn) {
    btn.disabled=false;
    btn.innerHTML = isEdit ? '💾 Enregistrer les modifications' : '✅ Créer le Projet';
  }

  if (res?.success) {
    const projectId = res.data.id;

    // ─── Mode ÉDITION : on saute la création de tâches/camions par template ───
    // (Les tâches existent déjà, les camions ont leur propre flux d'édition via
    // l'onglet Logistique. On ferme juste le modal et on recharge.)
    if (isEdit) {
      toast('Projet mis à jour ✅', 'success');
      EDITING_PROJECT_ID = null;
      PROJ_TRUCKS = [];
      closeModal('modal-proj');
      // Rafraîchir l'affichage
      const idx = PROJECTS.findIndex(x => x.id === projectId);
      if (idx >= 0) PROJECTS[idx] = { ...PROJECTS[idx], ...res.data };
      loadProjectDetail(projectId);
      filterProjects();
      return;
    }

    // ─── Mode CRÉATION : on continue avec la création tâches + camions ───
    // Apply selected templates
    // Créer les tâches sélectionnées (depuis TASK_TEMPLATES_DATA Excel)
    const selectedTasks = typeof getSelectedProjTasks === 'function' ? getSelectedProjTasks() : [];
    if (selectedTasks.length) {
      toast(`Création de ${selectedTasks.length} tâche(s)...`, 'info');
      const projStartDate = document.getElementById('proj-start')?.value || new Date().toISOString().split('T')[0];
      const results = await Promise.all(selectedTasks.map(task =>
        api('POST', '/tasks', {
          projectId,
          title:        task.title,
          description:  task.stage ? `Stage: ${task.stage}` : undefined,
          status:       'todo',
          priority:     'normal',
          taskDate:     task.taskDate || projStartDate,
          assignedToId: task.assignedTo || undefined,
        })
      ));
      const ok = results.filter(r => r?.success).length;
      const fail = results.length - ok;
      if (fail === 0)      toast(`${ok} tâche(s) créée(s) ✅`, 'success');
      else if (ok === 0)   toast(`Aucune tâche créée (${fail} échec(s))`, 'error');
      else                 toast(`${ok} tâche(s) créée(s) — ${fail} échec(s)`, 'warning');
    } else {
      toast('Projet créé ✅', 'success');
    }

    // Création des camions/véhicules saisis dans le formulaire
    // (avant cette correction, PROJ_TRUCKS étaient saisis mais jamais persistés !)
    console.log('[createProject] PROJ_TRUCKS contient', PROJ_TRUCKS.length, 'véhicule(s) à enregistrer', PROJ_TRUCKS);
    if (PROJ_TRUCKS.length > 0) {
      toast(`Enregistrement de ${PROJ_TRUCKS.length} véhicule(s)...`, 'info');
      let truckOk = 0, truckFail = 0;
      for (const t of PROJ_TRUCKS) {
        if (!t.truckNumber?.trim() && !t.licensePlate?.trim()) {
          console.log('[createProject] véhicule ignoré (vide)', t);
          continue;
        }
        const payload = {
          vehicleType:  t.vehicleType || 'truck',
          truckNumber:  t.truckNumber?.trim() || null,
          licensePlate: t.licensePlate?.trim() || null,
          driverName:   t.driverName?.trim() || null,
          driverPhone:  t.driverPhone?.trim() || null,
          loadingDate:  t.loadingDate ? fromLocalDatetimeInput(t.loadingDate) : null,
          arrivalDate:  t.arrivalDate ? fromLocalDatetimeInput(t.arrivalDate) : null,
          notes:        t.notes?.trim() || null,
          status:       'planned',
        };
        console.log('[createProject] POST /projects/' + projectId + '/trucks ←', payload);
        const r = await api('POST', `/projects/${projectId}/trucks`, payload);
        console.log('[createProject] réponse :', r);
        if (r?.success) truckOk++; else { truckFail++; console.error('[createProject] échec :', r?.error); }
      }
      if (truckOk)   toast(`${truckOk} véhicule(s) ajouté(s) 🚛`, 'success');
      if (truckFail) toast(`${truckFail} véhicule(s) en échec — voir console F12`, 'error');
      PROJ_TRUCKS = []; // reset pour le prochain projet
    } else {
      console.log('[createProject] aucun véhicule à enregistrer (PROJ_TRUCKS vide)');
    }

    closeModal('modal-proj');
    ['proj-name','proj-num','proj-addr','proj-desc','proj-start','proj-end','proj-dismantling-start','proj-dismantling-end'].forEach(id => {
      const el = document.getElementById(id); if(el) el.value='';
    });
    document.getElementById('proj-workers').value = '5';
    loadAll();
    goto('projects');
    // Open the new project
    setTimeout(() => openProject(projectId), 800);
  } else {
    console.error('[createProject/edit] échec :', res);
    toast(res?.error || (isEdit ? 'Erreur lors de la modification' : 'Erreur création projet'), 'error');
  }
}

