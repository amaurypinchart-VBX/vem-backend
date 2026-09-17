function brfAddTrucksBlock(trucks) {
  const headers = ['Type', 'Trajet', 'Chargement', 'Chauffeur'];
  const rows = trucks.map(t => {
    const trajet = `${t.loadingLocation || '?'} → ${t.unloadingLocation || '?'}`;
    const chargement = t.loadingDate
      ? new Date(t.loadingDate).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
      : '';
    const chauffeur = t.driverName
      ? `${t.driverName}${t.driverPhone ? ' · ' + t.driverPhone : ''}`
      : '';
    return [vehicleLabel(t.vehicleType), trajet, chargement, chauffeur];
  });
  brfRenderDataTable({
    x: 60, y: 200,
    headers, rows,
    colWidths: [180, 420, 240, 320],
  });
}

function brfAddTeamBlock(members) {
  const headers = ['Nom', 'Rôle', 'Phase', 'Téléphone'];
  const rows = members.map(m => {
    const name = `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim() || '—';
    const phase = m.phase === 'dismantling' ? '🔨 Démontage'
                : m.phase === 'installation' ? '🏗️ Install.'
                : 'Les deux';
    return [name, m.role || '', phase, m.user?.phone || ''];
  });
  brfRenderDataTable({
    x: 60, y: 200,
    headers, rows,
    colWidths: [340, 260, 200, 360],
  });
}

// ─── Nouveaux générateurs : location, notes, files, remarks ──────────
async function brfAddLocationBlock(p) {
  const addr = [p.address, p.city].filter(Boolean).join(', ');
  if (!addr) {
    // Pas d'adresse renseignée → propose direct la saisie manuelle
    if (confirm('Pas d\'adresse pour ce projet. Veux-tu placer une carte manuellement ?')) {
      await brfPromptForLocationAndAddMap(90, 220, 1100);
    }
    return;
  }
  BRF_STUDIO.fabricCanvas.add(new fabric.Textbox(addr, {
    left: 60, top: 170, width: 1160, fontSize: 22, fontFamily: 'Helvetica', fontWeight: 'bold', fill: '#222',
  }));
  // Try auto-geocode
  const coords = await brfGeocodeAddress(addr);
  if (coords) {
    await brfAddMapImageByCoords(coords.lat, coords.lon, 90, 220, 1100);
  } else {
    // Auto a échoué → propose le manuel
    if (confirm(`Carte introuvable automatiquement pour :\n\n"${addr}"\n\nVeux-tu la placer manuellement (autre adresse, coords GPS, ou lien Google Maps) ?`)) {
      await brfPromptForLocationAndAddMap(90, 220, 1100);
    }
  }
}

function brfAddNotesBlock(p) {
  const lines = ['📓 NOTES PROJET', ''];
  if (p.scope)               { lines.push('OBJET'); lines.push(p.scope); lines.push(''); }
  if (p.description)         { lines.push('DESCRIPTION'); lines.push(p.description); lines.push(''); }
  if (p.installNotes)        { lines.push('NOTES INSTALLATION'); lines.push(p.installNotes); lines.push(''); }
  if (p.dismantleNotes)      { lines.push('NOTES DÉMONTAGE'); lines.push(p.dismantleNotes); lines.push(''); }
  if (p.specialInstructions) { lines.push('INSTRUCTIONS SPÉCIALES'); lines.push(p.specialInstructions); lines.push(''); }
  brfAddTextbox(lines.join('\n').trim(), { width: 1000, fontSize: 16 });
}
// ─── Helpers PDF multi-pages ────────────────────────────────────────
// Sonde la page 1, 2, 3... d'un PDF Cloudinary jusqu'au premier 404.
// Utilise des miniatures (w_300) pour ne pas surcharger le réseau.
// Retourne 0 si le fichier n'est pas Cloudinary ou si aucune page n'est lisible.
async function brfGetPdfPageCount(fileUrl, maxPages = 30) {
  if (!fileUrl?.includes('/upload/')) return 0;
  const probeUrl = (n) => fileUrl
    .replace('/upload/', `/upload/f_jpg,c_limit,w_300,pg_${n}/`)
    .replace(/\.pdf($|\?)/i, '.jpg$1');
  let count = 0;
  for (let n = 1; n <= maxPages; n++) {
    const exists = await new Promise(resolve => {
      const img = new Image();
      let done = false;
      const finish = (val) => { if (!done) { done = true; resolve(val); } };
      img.onload  = () => finish(true);
      img.onerror = () => finish(false);
      // Sécurité : pas plus de 8s par page (au cas où Cloudinary est lent)
      setTimeout(() => finish(false), 8000);
      img.src = probeUrl(n);
    });
    if (!exists) break;
    count = n;
  }
  return count;
}

// Pour un PDF Cloudinary multi-pages : crée 1 slide par page,
// avec la page en image plein cadre et un header bleu avec le nom du fichier + le n° de page.
// Sauve automatiquement la slide en cours avant de commencer.
// Retourne le nombre de slides créées (0 si erreur ou PDF hors Cloudinary).
async function brfAddPdfPagesAsSlides(file) {
  const fileName = file.fileName || file.name || 'PDF';
  const fileUrl  = file.fileUrl  || '';
  if (!fileUrl.includes('/upload/')) {
    toast(`PDF "${fileName}" hors Cloudinary — impossible de séparer les pages`, 'warning');
    return 0;
  }

  // Sauve la slide en cours pour pouvoir ajouter les nouvelles en sécurité
  saveCurrentSlideJson();

  toast(`Analyse du PDF "${fileName}"...`, 'info');
  const pageCount = await brfGetPdfPageCount(fileUrl);

  if (pageCount === 0) {
    toast(`Aucune page lisible dans "${fileName}"`, 'warning');
    return 0;
  }

  toast(`📄 "${fileName}" : création de ${pageCount} slide(s)...`, 'info');

  const PRIMARY = '#0a2540';
  const renderUrl = (n) => fileUrl
    .replace('/upload/', `/upload/f_jpg,c_limit,w_1280,pg_${n}/`)
    .replace(/\.pdf($|\?)/i, '.jpg$1');

  for (let n = 1; n <= pageCount; n++) {
    // Crée une nouvelle slide
    BRF_STUDIO.slides.push({
      id: 'slide-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
      name: `${fileName} — p.${n}/${pageCount}`,
      json: null,
    });
    BRF_STUDIO.curIdx = BRF_STUDIO.slides.length - 1;
    BRF_STUDIO.suppressSnapshot = true;
    BRF_STUDIO.fabricCanvas.clear();
    BRF_STUDIO.fabricCanvas.setBackgroundColor('#ffffff', () => {});
    applyLogoBackground();

    // Header bandeau bleu
    BRF_STUDIO.fabricCanvas.add(new fabric.Rect({
      left:0, top:0, width:BRF_CANVAS_W, height:50, fill:PRIMARY, selectable:false, evented:false,
    }));
    BRF_STUDIO.fabricCanvas.add(new fabric.IText(
      `📄 ${fileName} — Page ${n}/${pageCount}`,
      { left:20, top:14, fontSize:18, fontFamily:'Helvetica', fontWeight:'bold', fill:'#ffffff', selectable:false }
    ));

    // Page en image plein cadre (scaling auto)
    await new Promise(resolve => {
      const place = (loadedImg) => {
        try {
          const fImg = new fabric.Image(loadedImg);
          const availW = BRF_CANVAS_W - 40;
          const availH = BRF_CANVAS_H - 50 - 20;
          const scale = Math.min(availW / fImg.width, availH / fImg.height, 1);
          fImg.scale(scale);
          fImg.set({
            left: (BRF_CANVAS_W - fImg.getScaledWidth()) / 2,
            top:  60 + (availH - fImg.getScaledHeight()) / 2,
          });
          BRF_STUDIO.fabricCanvas.add(fImg);
        } catch (e) { console.warn('[brf] échec page', n, e); }
        resolve();
      };
      const tryWithCors = new Image();
      tryWithCors.crossOrigin = 'anonymous';
      tryWithCors.onload  = () => place(tryWithCors);
      tryWithCors.onerror = () => {
        const noCors = new Image();
        noCors.onload  = () => place(noCors);
        noCors.onerror = () => resolve();
        noCors.src = renderUrl(n);
      };
      tryWithCors.src = renderUrl(n);
    });

    // Sauve la slide
    const slideJson = BRF_STUDIO.fabricCanvas.toJSON();
    delete slideJson.backgroundImage;
    BRF_STUDIO.slides[BRF_STUDIO.curIdx].json = slideJson;
    BRF_STUDIO.suppressSnapshot = false;
  }

  return pageCount;
}
async function brfAddFilesBlock(files) {
  // Tri des fichiers par type :
  //   • images → ajoutées sur la slide COURANTE
  //   • PDFs   → chaque PDF crée N NOUVELLES slides (une par page)
  //   • autres → carte icône sur la slide courante
  const images = [];
  const pdfs   = [];
  const others = [];
  for (const f of files) {
    const ext = (f.fileName || f.fileUrl || '').split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp','heic','svg'].includes(ext)) images.push(f);
    else if (ext === 'pdf') pdfs.push(f);
    else others.push(f);
  }

  // ── 1. Images + autres sur la slide courante ──
  let xCursor = 100, yCursor = 100;
  const advance = (w) => {
    xCursor += w;
    if (xCursor > BRF_CANVAS_W - 200) { xCursor = 100; yCursor += 280; }
  };

  for (const f of images) {
    await new Promise(resolve => {
      const place = (loadedImg) => {
        try {
          const fImg = new fabric.Image(loadedImg);
          const maxW = 380;
          if (fImg.width > maxW) fImg.scaleToWidth(maxW);
          fImg.set({ left: xCursor, top: yCursor });
          BRF_STUDIO.fabricCanvas.add(fImg);
          advance(fImg.getScaledWidth() + 20);
        } catch (e) { console.warn('[brf]', e); }
        resolve();
      };
      const tryWithCors = new Image();
      tryWithCors.crossOrigin = 'anonymous';
      tryWithCors.onload  = () => place(tryWithCors);
      tryWithCors.onerror = () => {
        const noCors = new Image();
        noCors.onload  = () => place(noCors);
        noCors.onerror = () => resolve();
        noCors.src = f.fileUrl;
      };
      tryWithCors.src = f.fileUrl;
    });
  }

  for (const f of others) {
    const grp = new fabric.Group([
      new fabric.Rect({ width: 260, height: 90, fill:'#f4f4f4', stroke:'#bbb', rx:8, ry:8 }),
      new fabric.IText('📄', { left:14, top:20, fontSize:40 }),
      new fabric.Textbox(f.fileName || 'Document', { left:70, top:20, width:180, fontSize:14, fill:'#0a2540', fontWeight:'bold' }),
      new fabric.Textbox(f.fileUrl || '', { left:70, top:50, width:180, fontSize:10, fill:'#888' }),
    ], { left: xCursor, top: yCursor });
    BRF_STUDIO.fabricCanvas.add(grp);
    advance(280);
  }
  BRF_STUDIO.fabricCanvas.requestRenderAll();

  // ── 2. PDFs : chacun crée N nouvelles slides ──
  let totalPdfSlides = 0;
  for (const pdf of pdfs) {
    totalPdfSlides += await brfAddPdfPagesAsSlides(pdf);
  }

  // Rafraîchit la sidebar pour montrer les nouvelles slides
  renderStudioSidebar();

  // Toast récap
  const parts = [];
  if (images.length)   parts.push(`${images.length} image(s) sur slide courante`);
  if (others.length)   parts.push(`${others.length} autre(s)`);
  if (totalPdfSlides)  parts.push(`${totalPdfSlides} slide(s) PDF`);
  toast(`✅ Ajouté : ${parts.join(' + ')}`, 'success');
}
function brfAddRemarksBlock(remarks) {
  const headers = ['Remarque', 'Status', 'Priorité', 'Date'];
  const rows = remarks.map(r => {
    const text = (r.title || r.description || '—').slice(0, 120);
    const status = r.status === 'resolved' ? '✓ Résolu'
                 : r.status === 'in_progress' ? '↻ En cours'
                 : '○ Ouvert';
    return [text, status, r.priority || '', r.createdAt ? new Date(r.createdAt).toLocaleDateString('fr-FR') : ''];
  });
  brfRenderDataTable({
    x: 60, y: 200,
    headers, rows,
    colWidths: [620, 180, 160, 200],
  });
}

// ════════════════════════════════════════════════════════════════════
// 🪄 AUTO-GÉNÉRATION DE BRIEFING COMPLET
// ════════════════════════════════════════════════════════════════════
// Charge toutes les données du projet et construit automatiquement un
// briefing complet de 6 à 10 slides avec un design Viewbox cohérent.
// L'utilisateur peut ensuite ajuster chaque slide à sa guise.

async function brfAutoGenerateBriefing(btn) {
  if (!confirm('🪄 Auto-générer un briefing complet à partir des données du projet ?\n\nLes slides actuelles seront REMPLACÉES.\n(Tu peux les éditer ensuite.)')) return;

  const orig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Génération...'; }
  toast('Chargement des données du projet...', 'info');

  try {
    const projectId = BRF_STUDIO.projectId;
    const [pRes, tRes, taskRes, fileRes, remarkRes] = await Promise.all([
      api('GET', `/projects/${projectId}`),
      api('GET', `/projects/${projectId}/trucks`),
      api('GET', `/tasks?projectId=${projectId}`),
      api('GET', `/projects/${projectId}/files`),
      api('GET', `/client-remarks?projectId=${projectId}`).catch(() => ({ data: [] })),
    ]);
    if (!pRes?.success) throw new Error('Impossible de charger le projet');
    const project = pRes.data;
    const trucks  = tRes?.data    || [];
    const tasks   = taskRes?.data || [];
    const files   = fileRes?.data || [];
    const remarks = remarkRes?.data || [];

    // Client + contacts
    let client = null;
    let clientContacts = [];
    if (project.clientId) {
      const cli = await api('GET', `/clients/${project.clientId}`);
      if (cli?.success) {
        client = cli.data;
        clientContacts = client.contacts || [];
        if (!clientContacts.length && client.contactName) {
          clientContacts = [{ name: client.contactName, email: client.email, phone: client.phone, role: 'Contact principal', isPrimary: true }];
        }
      }
    }

    // Bookings (Feature 1)
    const tbRes = await api('GET', `/projects/${projectId}/bookings`).catch(() => ({ data: [] }));
    const hbRes = await api('GET', `/projects/${projectId}/hotel-bookings`).catch(() => ({ data: [] }));
    const teamBookings  = tbRes?.data || [];
    const hotelBookings = hbRes?.data || [];

    // File picker (Feature 3)
    const mediaFiles = files.filter(f => {
      const ext = (f.fileName || f.fileUrl || '').split('.').pop().toLowerCase();
      return ['jpg','jpeg','png','gif','webp','heic','pdf','svg'].includes(ext);
    });
    let pickedFiles = [];
    if (mediaFiles.length) {
      if (btn) btn.innerHTML = '📁 Choix des fichiers...';
      pickedFiles = await brfPickFilesForAutoGen(mediaFiles);
      if (pickedFiles === null) {
        toast('Génération annulée', 'info');
        return;
      }
      if (btn) btn.innerHTML = '⏳ Génération...';
    }

    // Wipe
    BRF_STUDIO.slides = [];
    BRF_STUDIO.curIdx = 0;

    // Helpers locaux
    const newSlide = (sidebarName, title) => {
      BRF_STUDIO.slides.push({
        id: 'slide-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
        name: sidebarName, json: null,
      });
      BRF_STUDIO.curIdx = BRF_STUDIO.slides.length - 1;
      BRF_STUDIO.suppressSnapshot = true;
      BRF_STUDIO.fabricCanvas.clear();
      brfApplyStandardTemplate(title);
    };
    const saveSlide = () => {
      const json = BRF_STUDIO.fabricCanvas.toJSON();
      delete json.backgroundImage;
      BRF_STUDIO.slides[BRF_STUDIO.curIdx].json = json;
      BRF_STUDIO.suppressSnapshot = false;
    };

   // ─── SLIDE 1 : COUVERTURE ─────────────────────────────────
    // Slide spéciale : pas d'encadré titre standard, gros titre projet
    BRF_STUDIO.slides.push({ id: 'slide-cover-'+Date.now(), name: 'Couverture', json: null });
    BRF_STUDIO.curIdx = 0;
    BRF_STUDIO.suppressSnapshot = true;
    BRF_STUDIO.fabricCanvas.clear();
    BRF_STUDIO.fabricCanvas.setBackgroundColor(BRF_TPL.BG, () => {});
    // Logo + watermark SYNCHRONES
    brfAddLogoTopRight(240);
    brfAddWatermarkBottomRight();
    BRF_STUDIO.fabricCanvas.add(new fabric.IText('BRIEFING', {
      left: 60, top: 200, fontSize: 24, fontFamily: 'Helvetica', fontWeight: 'bold', fill: '#666',
    }));
    BRF_STUDIO.fabricCanvas.add(new fabric.Textbox((project.name || 'Projet').toUpperCase(), {
      left: 60, top: 240, width: 1000, fontSize: 64, fontFamily: 'Helvetica', fontWeight: 'bold', fill: BRF_TPL.NAVY, lineHeight: 1.05,
    }));
    if (client?.name) {
      BRF_STUDIO.fabricCanvas.add(new fabric.IText('Client : ' + client.name, {
        left: 60, top: 420, fontSize: 28, fontFamily: 'Helvetica', fill: '#333',
      }));
    }
    if (project.installationStart) {
      const ds = brfFmtDateTime(project.installationStart);
      const de = brfFmtDateTime(project.installationEnd);
      BRF_STUDIO.fabricCanvas.add(new fabric.IText(`📅  Installation : ${ds} → ${de}`, {
        left: 60, top: 480, fontSize: 20, fontFamily: 'Helvetica', fill: '#666',
      }));
    }
    if (project.address) {
      BRF_STUDIO.fabricCanvas.add(new fabric.IText(`📍  ${project.address}${project.city ? ', ' + project.city : ''}`, {
        left: 60, top: 520, fontSize: 20, fontFamily: 'Helvetica', fill: '#666',
      }));
    }
    saveSlide();

    // ─── SLIDE PLANNING ─────────────────────────────────────────
    if (project.installationStart || project.dismantlingStart) {
      newSlide('Planning', 'Planning');
const fmt = d => {
        if (!d) return '?';
        const dt = new Date(d);
        const weekday = dt.toLocaleDateString('fr-FR', { weekday:'long' });
        return weekday + ' ' + brfFmtDateTime(d);
      };      const headers = ['Phase', 'Début', 'Fin'];
      const rows = [];
      if (project.installationStart) rows.push(['🏗️ Installation', fmt(project.installationStart), fmt(project.installationEnd)]);
      if (project.dismantlingStart)  rows.push(['🔨 Démontage',    fmt(project.dismantlingStart),  fmt(project.dismantlingEnd)]);
      brfRenderDataTable({ x: 60, y: 200, headers, rows, colWidths: [260, 470, 430] });
      saveSlide();
    }

   // ─── SLIDE LIEU (avec plan OSM affiché, drawable) ───────────
    if (project.address) {
      newSlide('Lieu', 'Localisation');
      const addr = [project.address, project.city].filter(Boolean).join(', ');
      // Adresse en gros texte au-dessus du plan
      BRF_STUDIO.fabricCanvas.add(new fabric.Textbox(addr, {
        left: 60, top: 170, width: 1160, fontSize: 22, fontFamily: 'Helvetica', fontWeight: 'bold', fill: '#222',
      }));
      // Plan OSM — drag/resize/draw-on dispos via les outils Studio
      await brfAddMapToCanvas(addr, 90, 220, 1100);
      saveSlide();
    }

    // ─── SLIDE ÉQUIPE (TABLEAU) ─────────────────────────────────
    if (project.team?.length) {
      newSlide('Équipe', 'Équipe');
      const headers = ['Nom', 'Rôle', 'Phase', 'Téléphone'];
      const rows = project.team.map(m => {
        const name = `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim() || '—';
        const phase = m.phase === 'dismantling' ? '🔨 Démontage'
                    : m.phase === 'installation' ? '🏗️ Install.'
                    : 'Les deux';
        return [name, m.role || '', phase, m.user?.phone || ''];
      });
      brfRenderDataTable({ x: 60, y: 200, headers, rows, colWidths: [340, 260, 200, 360] });
      saveSlide();
    }

    // ─── SLIDE CONTACTS (TABLEAU) ───────────────────────────────
    if (clientContacts.length) {
      newSlide('Contacts', `Contacts${client?.name ? ' — ' + client.name : ''}`);
      const headers = ['Nom', 'Rôle', 'Téléphone', 'Email'];
      const rows = clientContacts.map(c => [
        (c.isPrimary ? '★ ' : '') + (c.name || '—'),
        c.role || '', c.phone || '', c.email || '',
      ]);
      brfRenderDataTable({ x: 60, y: 200, headers, rows, colWidths: [280, 260, 240, 380] });
      saveSlide();
    }

    // ─── SLIDE LOGISTIQUE CAMIONS (TABLEAU) ─────────────────────
    if (trucks.length) {
      newSlide('Logistique', 'Logistique');
      const headers = ['Type', 'Trajet', 'Chargement', 'Chauffeur'];
      const rows = trucks.map(t => {
        const trajet = `${t.loadingLocation || '?'} → ${t.unloadingLocation || '?'}`;
        const chargement = t.loadingDate ? new Date(t.loadingDate).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
        const chauffeur = t.driverName ? `${t.driverName}${t.driverPhone ? ' · ' + t.driverPhone : ''}` : '';
        return [vehicleLabel(t.vehicleType), trajet, chargement, chauffeur];
      });
      brfRenderDataTable({ x: 60, y: 200, headers, rows, colWidths: [180, 420, 240, 320] });
      saveSlide();
    }

    // ─── SLIDE TRANSPORT ÉQUIPE (TABLEAU) ───────────────────────
    if (teamBookings.length) {
      newSlide('Transport équipe', 'Transport équipe');
      const fmt  = d => d ? new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
      const fmtD = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) : '?';
      const headers = ['Membre', 'Phase', 'Sur site', 'Aller', 'Retour'];
      const rows = teamBookings.map(bk => {
        const name = `${bk.user?.firstName || ''} ${bk.user?.lastName || ''}`.trim() || '—';
        const phase = bk.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Install.';
        const onsite = `${fmtD(bk.onSiteStart)} → ${fmtD(bk.onSiteEnd)}`;
        const aller  = bk.outboundMode ? `${bk.outboundMode}${bk.outboundDate ? '\n'+fmt(bk.outboundDate) : ''}` : '—';
        const retour = bk.returnMode   ? `${bk.returnMode}${bk.returnDate     ? '\n'+fmt(bk.returnDate)     : ''}` : '—';
        return [name, phase, onsite, aller, retour];
      });
      brfRenderDataTable({ x: 60, y: 200, headers, rows, colWidths: [220, 160, 220, 280, 280], rowHeight: 50 });
      saveSlide();
    }

    // ─── SLIDE HÔTELS (TABLEAU) ─────────────────────────────────
    if (hotelBookings.length) {
      newSlide('Hôtels', 'Hôtels équipe');
      const fmtD = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '?';
      const headers = ['Hôtel', 'Phase', 'Séjour', 'Occupants', 'Réf.'];
      const rows = hotelBookings.map(h => {
        const phase = h.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Install.';
        const sejour = `${fmtD(h.checkin)} → ${fmtD(h.checkout)}`;
        const occ = (h.occupants || []).map(o => `${o.user?.firstName||''} ${o.user?.lastName||''}`.trim()).filter(Boolean).join(', ');
        return [h.hotelName || '—', phase, sejour, occ, h.reference || ''];
      });
      brfRenderDataTable({ x: 60, y: 200, headers, rows, colWidths: [320, 160, 240, 340, 100] });
      saveSlide();
    }

    // ─── SLIDE NOTES (TEXTBOX) ──────────────────────────────────
    if (project.scope || project.installNotes || project.dismantleNotes || project.specialInstructions || project.description) {
      newSlide('Notes', 'Notes projet');
      const lines = [];
      if (project.scope)               { lines.push('▶ OBJET');                  lines.push(project.scope);               lines.push(''); }
      if (project.description)         { lines.push('▶ DESCRIPTION');            lines.push(project.description);         lines.push(''); }
      if (project.installNotes)        { lines.push('▶ INSTALLATION');           lines.push(project.installNotes);        lines.push(''); }
      if (project.dismantleNotes)      { lines.push('▶ DÉMONTAGE');              lines.push(project.dismantleNotes);      lines.push(''); }
      if (project.specialInstructions) { lines.push('▶ INSTRUCTIONS SPÉCIALES'); lines.push(project.specialInstructions);                  }
      BRF_STUDIO.fabricCanvas.add(new fabric.Textbox(lines.join('\n').trim(), { left: 60, top: 200, width: 1100, fontSize: 16, fontFamily: 'Helvetica', fill: '#222', lineHeight: 1.5 }));
      saveSlide();
    }

    // ─── SLIDE TÂCHES CLÉS (TABLEAU) ────────────────────────────
    const importantTasks = tasks.filter(t => ['high','critical'].includes(t.priority)).slice(0, 12);
    if (importantTasks.length) {
      newSlide('Tâches clés', 'Tâches importantes');
      const headers = ['Tâche', 'Date', 'Assigné', 'Statut'];
      const rows = importantTasks.map(t => {
        const stat = t.status === 'completed' ? '✓ Terminé' : t.status === 'in_progress' ? '↻ En cours' : '○ À faire';
        const date = t.taskDate ? new Date(t.taskDate).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) : '';
        const ass  = t.assignedTo?.firstName ? `${t.assignedTo.firstName} ${t.assignedTo.lastName || ''}`.trim() : '';
        return [t.title || '?', date, ass, stat];
      });
      brfRenderDataTable({ x: 60, y: 200, headers, rows, colWidths: [580, 140, 240, 200] });
      saveSlide();
    }

    // ─── SLIDE REMARQUES CLIENT (TABLEAU) ───────────────────────
    const openRemarks = remarks.filter(r => r.status !== 'resolved').slice(0, 10);
    if (openRemarks.length) {
      newSlide('Remarques', 'Remarques client');
      const headers = ['Remarque', 'Status', 'Priorité', 'Date'];
      const rows = openRemarks.map(r => {
        const text = (r.title || r.description || '—').slice(0, 120);
        const status = r.status === 'in_progress' ? '↻ En cours' : '○ Ouvert';
        return [text, status, r.priority || '', r.createdAt ? new Date(r.createdAt).toLocaleDateString('fr-FR') : ''];
      });
      brfRenderDataTable({ x: 60, y: 200, headers, rows, colWidths: [620, 180, 160, 200] });
      saveSlide();
    }

    // ─── SLIDES FICHIERS (Feature 3 + PDF multi-page) ────────────
    if (pickedFiles?.length) {
      for (const file of pickedFiles) {
        const ext = (file.fileName || '').split('.').pop().toLowerCase();
        const isPdf = ext === 'pdf';
        if (isPdf && file.fileUrl?.includes('/upload/')) {
          // PDF Cloudinary : 1 slide par page (pas de template — image plein cadre)
          const pageCount = await brfGetPdfPageCount(file.fileUrl);
          if (pageCount === 0) continue;
          const renderPageUrl = (n) => file.fileUrl.replace('/upload/', `/upload/f_jpg,c_limit,w_1280,pg_${n}/`).replace(/\.pdf($|\?)/i, '.jpg$1');
          for (let n = 1; n <= pageCount; n++) {
            // Slide PDF : pas de template Viewbox, juste l'image
            BRF_STUDIO.slides.push({ id: 'slide-' + Date.now() + '-' + Math.random().toString(36).slice(2,6), name: `${file.fileName} — p.${n}/${pageCount}`, json: null });
            BRF_STUDIO.curIdx = BRF_STUDIO.slides.length - 1;
            BRF_STUDIO.suppressSnapshot = true;
            BRF_STUDIO.fabricCanvas.clear();
            BRF_STUDIO.fabricCanvas.setBackgroundColor('#ffffff', () => {});
            BRF_STUDIO.fabricCanvas.add(new fabric.Rect({ left:0, top:0, width:BRF_CANVAS_W, height:50, fill:BRF_TPL.NAVY, selectable:false, evented:false }));
            BRF_STUDIO.fabricCanvas.add(new fabric.IText(`📄 ${file.fileName || 'PDF'} — Page ${n}/${pageCount}`, { left:20, top:14, fontSize:18, fontFamily:'Helvetica', fontWeight:'bold', fill:'#fff', selectable:false }));
            await new Promise(resolve => {
              const place = (loadedImg) => {
                try {
                  const fImg = new fabric.Image(loadedImg);
                  const availW = BRF_CANVAS_W - 40;
                  const availH = BRF_CANVAS_H - 50 - 20;
                  const scale = Math.min(availW / fImg.width, availH / fImg.height, 1);
                  fImg.scale(scale);
                  fImg.set({ left: (BRF_CANVAS_W - fImg.getScaledWidth()) / 2, top: 60 + (availH - fImg.getScaledHeight()) / 2 });
                  BRF_STUDIO.fabricCanvas.add(fImg);
                } catch (e) { console.warn('[brf]', e); }
                resolve();
              };
              const im1 = new Image(); im1.crossOrigin = 'anonymous';
              im1.onload  = () => place(im1);
              im1.onerror = () => { const im2 = new Image(); im2.onload = () => place(im2); im2.onerror = resolve; im2.src = renderPageUrl(n); };
              im1.src = renderPageUrl(n);
            });
            saveSlide();
          }
        } else {
          // Image → 1 slide avec template Viewbox + image centrée sous le titre
          newSlide(file.fileName || 'Fichier', file.fileName || 'Fichier');
          await new Promise(resolve => {
            const place = (loadedImg) => {
              try {
                const fImg = new fabric.Image(loadedImg);
                const availW = BRF_CANVAS_W - 120;
                const availH = BRF_CANVAS_H - 200;
                const scale = Math.min(availW / fImg.width, availH / fImg.height, 1);
                fImg.scale(scale);
                fImg.set({ left: (BRF_CANVAS_W - fImg.getScaledWidth()) / 2, top: 180 + (availH - fImg.getScaledHeight()) / 2 });
                BRF_STUDIO.fabricCanvas.add(fImg);
              } catch (e) { console.warn('[brf]', e); }
              resolve();
            };
            const im1 = new Image(); im1.crossOrigin = 'anonymous';
            im1.onload  = () => place(im1);
            im1.onerror = () => { const im2 = new Image(); im2.onload = () => place(im2); im2.onerror = resolve; im2.src = file.fileUrl; };
            im1.src = file.fileUrl;
          });
          saveSlide();
        }
      }
    }

    // ─── SLIDE FINAL : MERCI ────────────────────────────────────
    BRF_STUDIO.slides.push({ id: 'slide-merci-' + Date.now(), name: 'Merci', json: null });
    BRF_STUDIO.curIdx = BRF_STUDIO.slides.length - 1;
    BRF_STUDIO.suppressSnapshot = true;
    BRF_STUDIO.fabricCanvas.clear();
    BRF_STUDIO.fabricCanvas.setBackgroundColor(BRF_TPL.NAVY, () => {});
    BRF_STUDIO.fabricCanvas.add(new fabric.IText('MERCI', { left: 480, top: 280, fontSize: 96, fontFamily: 'Helvetica', fontWeight: 'bold', fill: '#ffffff' }));
    BRF_STUDIO.fabricCanvas.add(new fabric.IText('Des questions ?', { left: 480, top: 400, fontSize: 26, fontFamily: 'Helvetica', fill: '#aac', fontStyle: 'italic' }));
    saveSlide();

    // Retour à la première slide
    BRF_STUDIO.curIdx = 0;
    loadSlideIntoCanvas(0);
    renderStudioSidebar();

    toast(`✅ ${BRF_STUDIO.slides.length} slides générées — pense à sauvegarder !`, 'success');
  } catch (e) {
    console.error('[brf auto] error:', e);
    toast('Erreur : ' + (e.message || e), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

function brfAddTeamBookingsBlock(bookings) {
  const fmt = d => d ? new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const fmtD = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) : '?';
  const headers = ['Membre', 'Phase', 'Sur site', 'Aller', 'Retour'];
  const rows = bookings.map(bk => {
    const name = `${bk.user?.firstName || ''} ${bk.user?.lastName || ''}`.trim() || '—';
    const phase = bk.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Install.';
    const onsite = `${fmtD(bk.onSiteStart)} → ${fmtD(bk.onSiteEnd)}`;
    const aller = bk.outboundMode ? `${bk.outboundMode}${bk.outboundDate ? '\n' + fmt(bk.outboundDate) : ''}` : '—';
    const retour = bk.returnMode  ? `${bk.returnMode}${bk.returnDate  ? '\n' + fmt(bk.returnDate)  : ''}` : '—';
    return [name, phase, onsite, aller, retour];
  });
  brfRenderDataTable({
    x: 60, y: 200,
    headers, rows,
    colWidths: [220, 160, 220, 280, 280],
    rowHeight: 50, // un peu plus haut car aller/retour ont 2 lignes
  });
}

function brfAddHotelBookingsBlock(hotels) {
  const fmtD = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '?';
  const headers = ['Hôtel', 'Phase', 'Séjour', 'Occupants', 'Réf.'];
  const rows = hotels.map(h => {
    const phase = h.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Install.';
    const sejour = `${fmtD(h.checkin)} → ${fmtD(h.checkout)}`;
    const occ = (h.occupants || [])
      .map(o => `${o.user?.firstName || ''} ${o.user?.lastName || ''}`.trim())
      .filter(Boolean)
      .join(', ');
    return [h.hotelName || '—', phase, sejour, occ, h.reference || ''];
  });
  brfRenderDataTable({
    x: 60, y: 200,
    headers, rows,
    colWidths: [320, 160, 240, 340, 100],
  });
}

function brfAddTasksBlock(tasks) {
  const headers = ['Tâche', 'Date', 'Assigné', 'Statut'];
  const rows = tasks.map(t => {
    const stat = t.status === 'completed' ? '✓ Terminé'
               : t.status === 'in_progress' ? '↻ En cours'
               : '○ À faire';
    const date = t.taskDate ? new Date(t.taskDate).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) : '';
    const ass  = t.assignedTo?.firstName ? `${t.assignedTo.firstName} ${t.assignedTo.lastName || ''}`.trim() : '';
    return [t.title || '?', date, ass, stat];
  });
  brfRenderDataTable({
    x: 60, y: 200,
    headers, rows,
    colWidths: [580, 140, 240, 200],
  });
}

function brfAddContactsBlock(contacts, clientName) {
  // clientName n'est plus utilisé directement ici (il devient le titre du template).
  // Si tu veux le réafficher dans la slide, fais-le côté appelant via brfApplyStandardTemplate.
  const headers = ['Nom', 'Rôle', 'Téléphone', 'Email'];
  const rows = contacts.map(c => [
    (c.isPrimary ? '★ ' : '') + (c.name || '—'),
    c.role || '',
    c.phone || '',
    c.email || '',
  ]);
  brfRenderDataTable({
    x: 60, y: 200,
    headers, rows,
    colWidths: [280, 260, 240, 380],
  });
}


