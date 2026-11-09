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

// opts.ai = true : « ✨ Générer avec l'IA » — mêmes slides, plus un court texte
// rédigé par l'IA sous le titre de chaque slide (route /studio-texts : l'IA
// n'invente rien, les tableaux viennent toujours des vraies données).
async function brfAutoGenerateBriefing(btn, opts = {}) {
  const useAI = !!opts.ai;
  if (!confirm((useAI ? '✨ Générer le briefing avec l\'IA ?\n\nLes slides sont construites à partir des données du projet et l\'IA rédige un court texte pour chacune.' : '🪄 Auto-générer un briefing complet à partir des données du projet ?') + '\n\nLes slides actuelles seront REMPLACÉES.\n(Tu peux les éditer ensuite.)')) return;

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
    // Textes IA demandés tout de suite : ils se rédigent pendant le choix des fichiers
    const aiPromise = useAI
      ? api('POST', `/briefings/project/${projectId}/studio-texts`).catch(e => ({ success: false, error: e?.message }))
      : null;
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

    // Slides sécurité du pays de l'événement (demande seulement si le pays est inconnu
    // ou s'il n'existe pas de slides pour ce pays)
    if (btn) btn.innerHTML = '🦺 Pays de l\'événement...';
    const safetyChoice = await brfResolveSafetyChoice(project, { cancelLabel: 'Annuler la génération' });
    if (safetyChoice === null) {
      toast('Génération annulée', 'info');
      return;
    }
    let aiTexts = {};
    if (aiPromise) {
      if (btn) btn.innerHTML = '✨ Rédaction IA...';
      const aiRes = await aiPromise;
      if (aiRes?.success && aiRes.data) aiTexts = aiRes.data;
      else toast('Textes IA indisponibles (' + (aiRes?.error || 'erreur') + ') — slides générées sans texte', 'warning');
    }
    const T = (key) => String(aiTexts?.[key] || '').trim();
    if (btn) btn.innerHTML = '⏳ Génération...';

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
    // Texte d'accompagnement sous le titre (ou sous-titre) → renvoie le y suivant
    const CONTENT_TOP = 160;
    const PAGE_BOTTOM = BRF_CANVAS_H - 20;
    const captionBox = (text, top, fontSize = 18) => new fabric.Textbox(text, {
      left: 60, top, width: 1160, fontSize, fontFamily: 'Helvetica', fill: '#1f2a44', lineHeight: 1.3,
    });
    const addCaption = (text, top, fontSize = 18) => {
      if (!text) return top;
      const tb = captionBox(text, top, fontSize);
      BRF_STUDIO.fabricCanvas.add(tb);
      return top + tb.height + 16;
    };
    const captionHeight = (text, fontSize) => text ? captionBox(text, 0, fontSize).height + 16 : 0;

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
    if (T('intro')) {
      BRF_STUDIO.fabricCanvas.add(new fabric.Textbox(T('intro'), {
        left: 60, top: 570, width: 1000, fontSize: 17, fontFamily: 'Helvetica', fill: '#1f2a44', lineHeight: 1.3,
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
      const yPlan = addCaption(T('planning'), CONTENT_TOP);
      brfRenderDataTable({ x: 60, y: Math.max(200, yPlan), headers, rows, colWidths: [260, 470, 430] });
      saveSlide();
    }

   // ─── SLIDE LIEU (avec plan OSM affiché, drawable) ───────────
    if (project.address) {
      newSlide('Lieu', 'Localisation');
      const addr = [project.address, project.city].filter(Boolean).join(', ');
      // Adresse en gros texte au-dessus du plan
      const addrBox = new fabric.Textbox(addr, {
        left: 60, top: 170, width: 1160, fontSize: 22, fontFamily: 'Helvetica', fontWeight: 'bold', fill: '#222',
      });
      BRF_STUDIO.fabricCanvas.add(addrBox);
      // Texte IA (accès / arrivée) sous l'adresse, puis le plan réduit pour tenir sous le texte
      const yMap = T('location') ? addCaption(T('location'), 170 + addrBox.height + 10, 17) : 220;
      const mapW = Math.min(1100, Math.round((PAGE_BOTTOM - yMap) * 1100 / 600));
      // Plan OSM — drag/resize/draw-on dispos via les outils Studio
      await brfAddMapToCanvas(addr, Math.round((BRF_CANVAS_W - mapW) / 2), yMap, mapW);
      saveSlide();
    }

    // ─── SLIDES D'INFORMATIONS (tableaux) ───────────────────────
    // Plusieurs petits tableaux sur une même slide tant qu'ils tiennent
    // (ex. équipe + camions + transport + hôtels) ; un tableau trop long
    // pour une slide est coupé en « (suite) ».
    const fmtDM  = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' }) : '?';
    const fmtDMY = d => d ? new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '?';
    const fmtDT  = d => d ? new Date(d).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const phaseTxt = p => p === 'dismantling' ? '🔨 Démontage' : p === 'installation' ? '🏗️ Install.' : 'Les deux';
    const sec = (key, title, icon, headers, colWidths, rows, rowHeight = 40) => rows.length ? { key, title, icon, headers, colWidths, rows, rowHeight } : null;

    const infoSections = [
      sec('team', 'Équipe', '👥', ['Nom', 'Rôle', 'Phase', 'Téléphone'], [340, 260, 200, 360],
        (project.team || []).map(m => [`${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim() || '—', m.role || '', phaseTxt(m.phase), m.user?.phone || ''])),
      sec('contacts', `Contacts${client?.name ? ' ' + client.name : ''}`, '📞', ['Nom', 'Rôle', 'Téléphone', 'Email'], [280, 260, 240, 380],
        clientContacts.map(c => [(c.isPrimary ? '★ ' : '') + (c.name || '—'), c.role || '', c.phone || '', c.email || ''])),
      sec('trucks', 'Logistique', '🚛', ['Type', 'Trajet', 'Chargement', 'Chauffeur'], [180, 420, 240, 320],
        trucks.map(t => [vehicleLabel(t.vehicleType), `${t.loadingLocation || '?'} → ${t.unloadingLocation || '?'}`,
          t.loadingDate ? fmtDT(t.loadingDate) : '', t.driverName ? `${t.driverName}${t.driverPhone ? ' · ' + t.driverPhone : ''}` : ''])),
      sec('teamBookings', 'Transport équipe', '✈️', ['Membre', 'Phase', 'Sur site', 'Aller', 'Retour'], [220, 160, 220, 280, 280],
        teamBookings.map(bk => [`${bk.user?.firstName || ''} ${bk.user?.lastName || ''}`.trim() || '—',
          bk.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Install.', `${fmtDM(bk.onSiteStart)} → ${fmtDM(bk.onSiteEnd)}`,
          bk.outboundMode ? `${bk.outboundMode}${bk.outboundDate ? '\n' + fmtDT(bk.outboundDate) : ''}` : '—',
          bk.returnMode ? `${bk.returnMode}${bk.returnDate ? '\n' + fmtDT(bk.returnDate) : ''}` : '—']), 50),
      sec('hotels', 'Hôtels', '🏨', ['Hôtel', 'Phase', 'Séjour', 'Occupants', 'Réf.'], [320, 160, 240, 340, 100],
        hotelBookings.map(h => [h.hotelName || '—', h.phase === 'dismantling' ? '🔨 Démontage' : '🏗️ Install.',
          `${fmtDMY(h.checkin)} → ${fmtDMY(h.checkout)}`,
          (h.occupants || []).map(o => `${o.user?.firstName || ''} ${o.user?.lastName || ''}`.trim()).filter(Boolean).join(', '), h.reference || ''])),
    ].filter(Boolean);

    const importantTasks = tasks.filter(t => ['high','critical'].includes(t.priority)).slice(0, 12);
    const openRemarks = remarks.filter(r => r.status !== 'resolved').slice(0, 10);
    const followSections = [
      sec('tasks', 'Tâches importantes', '📋', ['Tâche', 'Date', 'Assigné', 'Statut'], [580, 140, 240, 200],
        importantTasks.map(t => [t.title || '?', t.taskDate ? fmtDM(t.taskDate) : '',
          t.assignedTo?.firstName ? `${t.assignedTo.firstName} ${t.assignedTo.lastName || ''}`.trim() : '',
          t.status === 'completed' ? '✓ Terminé' : t.status === 'in_progress' ? '↻ En cours' : '○ À faire'])),
      sec('remarks', 'Remarques client', '⚠️', ['Remarque', 'Status', 'Priorité', 'Date'], [620, 180, 160, 200],
        openRemarks.map(r => [(r.title || r.description || '—').slice(0, 120), r.status === 'in_progress' ? '↻ En cours' : '○ Ouvert',
          r.priority || '', r.createdAt ? new Date(r.createdAt).toLocaleDateString('fr-FR') : ''])),
    ].filter(Boolean);

    // Hauteur d'un bloc (sous-titre + texte IA + tableau + marge), estimée avec le sous-titre
    const SUBTITLE_H = 34, TABLE_HEAD_H = 50, BLOCK_GAP = 22;
    const blockHeight = (s, nRows, withText) =>
      SUBTITLE_H + (withText ? captionHeight(T(s.key), 15) : 0) + TABLE_HEAD_H + nRows * s.rowHeight + BLOCK_GAP;
    const packPages = (sections) => {
      const pages = [];
      let page = [], y = CONTENT_TOP;
      const flush = () => { if (page.length) pages.push(page); page = []; y = CONTENT_TOP; };
      for (const s of sections) {
        const h = blockHeight(s, s.rows.length, true);
        if (page.length && y + h - BLOCK_GAP <= PAGE_BOTTOM) { page.push({ s, rows: s.rows, first: true }); y += h; continue; }
        flush();
        if (CONTENT_TOP + h - BLOCK_GAP <= PAGE_BOTTOM) { page.push({ s, rows: s.rows, first: true }); y += h; continue; }
        // Trop long pour une slide : découpé
        let rest = s.rows, first = true;
        while (rest.length) {
          const fixed = blockHeight(s, 0, first);
          const per = Math.max(1, Math.floor((PAGE_BOTTOM - CONTENT_TOP - fixed + BLOCK_GAP) / s.rowHeight));
          const chunk = rest.slice(0, per);
          rest = rest.slice(per);
          page.push({ s, rows: chunk, first, cont: !first });
          y = CONTENT_TOP + blockHeight(s, chunk.length, first);
          if (rest.length) flush();
          first = false;
        }
      }
      flush();
      return pages;
    };
    const renderPages = (pages, groupTitle) => {
      for (const page of pages) {
        const label = b => b.s.title + (b.cont ? ' (suite)' : '');
        const joined = page.map(label).join(' · ');
        const title = page.length > 1 && joined.length > 38 ? groupTitle : joined;
        newSlide(page.length > 1 ? joined : label(page[0]), title);
        let y = CONTENT_TOP;
        for (const b of page) {
          if (page.length > 1) {
            BRF_STUDIO.fabricCanvas.add(new fabric.IText(`${b.s.icon}  ${label(b)}`, {
              left: 60, top: y, fontSize: 20, fontFamily: 'Helvetica', fontWeight: 'bold', fill: BRF_TPL.NAVY,
            }));
            y += SUBTITLE_H;
          }
          if (b.first) y = addCaption(T(b.s.key), y, page.length > 1 ? 15 : 18);
          y = brfRenderDataTable({ x: 60, y, headers: b.s.headers, rows: b.rows, colWidths: b.s.colWidths, rowHeight: b.s.rowHeight }) + BLOCK_GAP;
        }
        saveSlide();
      }
    };

    renderPages(packPages(infoSections), 'Équipe & logistique');

    // ─── SLIDE NOTES (TEXTBOX) ──────────────────────────────────
    if (project.scope || project.installNotes || project.dismantleNotes || project.specialInstructions || project.description) {
      newSlide('Notes', 'Notes projet');
      const lines = [];
      if (project.scope)               { lines.push('▶ OBJET');                  lines.push(project.scope);               lines.push(''); }
      if (project.description)         { lines.push('▶ DESCRIPTION');            lines.push(project.description);         lines.push(''); }
      if (project.installNotes)        { lines.push('▶ INSTALLATION');           lines.push(project.installNotes);        lines.push(''); }
      if (project.dismantleNotes)      { lines.push('▶ DÉMONTAGE');              lines.push(project.dismantleNotes);      lines.push(''); }
      if (project.specialInstructions) { lines.push('▶ INSTRUCTIONS SPÉCIALES'); lines.push(project.specialInstructions);                  }
      const yNotes = addCaption(T('notes'), CONTENT_TOP);
      BRF_STUDIO.fabricCanvas.add(new fabric.Textbox(lines.join('\n').trim(), { left: 60, top: Math.max(200, yNotes), width: 1100, fontSize: 16, fontFamily: 'Helvetica', fill: '#222', lineHeight: 1.5 }));
      saveSlide();
    }

    renderPages(packPages(followSections), 'Tâches & remarques');

    // ─── SLIDES SÉCURITÉ PAYS (images Viewbox, FR → EN à l'export) ──
    if (!safetyChoice.none) {
      try {
        const n = await brfInsertSafetySlides(safetyChoice);
        BRF_STUDIO.curIdx = BRF_STUDIO.slides.length - 1;
        if (n && safetyChoice.code) toast(`🦺 Slides sécurité ${brfCountryName(safetyChoice.code)} ajoutées`, 'info');
      } catch (e) {
        console.warn('[brf safety]', e);
        toast('Slides sécurité non ajoutées : ' + (e.message || e), 'warning');
      }
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
    if (T('closing')) {
      BRF_STUDIO.fabricCanvas.add(new fabric.Textbox(T('closing'), { left: 240, top: 470, width: 800, textAlign: 'center', fontSize: 20, fontFamily: 'Helvetica', fill: '#ffffff', lineHeight: 1.3 }));
    }
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



// ════════════════════════════════════════════════════════════════════
// 🦺 SLIDES SÉCURITÉ PAYS (A. Pinchart 09.11.2026)
// ════════════════════════════════════════════════════════════════════
// Images 1920 × 1080 dans public/briefing-safety/<fr|en>/ :
//   common.png = « Règles d'or Viewbox » (tous pays)
//   <CC>_1.png = cadre légal & documents · <CC>_2.png = EPI & travail en hauteur
// Sources éditables (PPTX) + prompt : docs/briefing-safety/.
// Les slides sont insérées en FR ; à l'export PDF « EN », l'image est remplacée
// par la version anglaise (brfSafetyJsonForLang). Pour ajouter un pays :
// déposer <CC>_1.png / <CC>_2.png dans fr/ et en/ puis l'ajouter ci-dessous.
const BRF_SAFETY_BASE = '/briefing-safety';
const BRF_SAFETY_COUNTRIES = {
  FR: { fr: 'France',      en: 'France',         flag: '🇫🇷' },
  BE: { fr: 'Belgique',    en: 'Belgium',        flag: '🇧🇪' },
  NL: { fr: 'Pays-Bas',    en: 'Netherlands',    flag: '🇳🇱' },
  DE: { fr: 'Allemagne',   en: 'Germany',        flag: '🇩🇪' },
  UK: { fr: 'Royaume-Uni', en: 'United Kingdom', flag: '🇬🇧' },
  IT: { fr: 'Italie',      en: 'Italy',          flag: '🇮🇹' },
  CH: { fr: 'Suisse',      en: 'Switzerland',    flag: '🇨🇭' },
};

// Pays reconnus dans le texte de l'adresse (noms FR / EN / NL / DE / IT / langue locale).
// Les pays sans slides sont aussi reconnus, pour pouvoir dire « pas de slides pour l'Espagne ».
const BRF_COUNTRY_NAMES = [
  ['FR', ['france', 'frankrijk', 'frankreich', 'francia']],
  ['BE', ['belgique', 'belgium', 'belgie', 'belgien', 'belgio']],
  ['NL', ['pays-bas', 'pays bas', 'netherlands', 'the netherlands', 'nederland', 'niederlande', 'paesi bassi', 'holland', 'hollande']],
  ['DE', ['allemagne', 'germany', 'deutschland', 'duitsland', 'germania']],
  ['UK', ['royaume-uni', 'royaume uni', 'united kingdom', 'uk', 'u.k.', 'great britain', 'grande-bretagne', 'england', 'angleterre', 'scotland', 'ecosse', 'wales', 'pays de galles', 'verenigd koninkrijk', 'vereinigtes konigreich', 'regno unito']],
  ['IT', ['italie', 'italy', 'italia', 'italien']],
  ['CH', ['suisse', 'switzerland', 'schweiz', 'svizzera', 'zwitserland', 'suisse romande']],
  ['LU', ['luxembourg', 'luxemburg', 'lussemburgo', 'grand-duche de luxembourg']],
  ['ES', ['espagne', 'spain', 'espana', 'spanje', 'spanien', 'spagna']],
  ['PT', ['portugal', 'portogallo']],
  ['AT', ['autriche', 'austria', 'osterreich', 'oostenrijk']],
  ['PL', ['pologne', 'poland', 'polska', 'polen']],
  ['MC', ['monaco', 'monte-carlo', 'monte carlo']],
  ['IE', ['irlande', 'ireland', 'eire']],
  ['DK', ['danemark', 'denmark', 'danmark']],
  ['SE', ['suede', 'sweden', 'sverige']],
  ['US', ['usa', 'u.s.a.', 'united states', 'etats-unis', 'etats unis']],
  ['AE', ['emirats arabes unis', 'united arab emirates', 'uae', 'dubai', 'abu dhabi', 'abou dabi']],
  ['QA', ['qatar', 'doha']],
  ['SA', ['arabie saoudite', 'saudi arabia', 'riyadh', 'riyad', 'jeddah']],
  ['MA', ['maroc', 'morocco']],
];

function brfNormText(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Nom lisible d'un code pays (UK accepté), en français
function brfCountryName(code) {
  if (!code) return '';
  if (BRF_SAFETY_COUNTRIES[code]) return BRF_SAFETY_COUNTRIES[code].fr;
  try {
    return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code === 'UK' ? 'GB' : code) || code;
  } catch { return code; }
}

// Cherche un pays dans un morceau de texte (mot entier)
function brfCountryInText(text) {
  const t = ' ' + brfNormText(text).replace(/[(),;/]+/g, ' ') + ' ';
  for (const [code, names] of BRF_COUNTRY_NAMES) {
    for (const n of names) {
      const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`).test(t)) return code;
    }
  }
  return null;
}

// Pays depuis le texte de l'adresse : dernier élément de l'adresse, ville, préfixes postaux (B-1000, F-75001…)
function brfCountryFromAddressText(p) {
  const address = String(p?.address || '');
  const city = String(p?.city || '');
  const lastPart = address.split(/[,\n]/).map(s => s.trim()).filter(Boolean).pop() || '';
  const cityLast = city.split(/[,\n]/).map(s => s.trim()).filter(Boolean).pop() || '';
  for (const part of [lastPart, cityLast]) {
    const c = part && brfCountryInText(part);
    if (c) return c;
  }
  const all = `${address} ${city}`;
  const pref = all.match(/\b(B|F|D|NL|CH|I|L|A|E)-\s?\d{4,5}\b/);
  if (pref) return ({ B: 'BE', F: 'FR', D: 'DE', NL: 'NL', CH: 'CH', I: 'IT', L: 'LU', A: 'AT', E: 'ES' })[pref[1]];
  if (/\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b/.test(all)) return 'UK'; // code postal britannique (SW1A 1AA)
  return null;
}

// Pays via le géocodage OpenStreetMap (Nominatim, même service que la carte)
async function brfCountryFromGeocode(addr) {
  if (!addr) return null;
  const variations = brfBuildAddressVariations(addr);
  for (let i = 0; i < variations.length; i++) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&q=${encodeURIComponent(variations[i])}`;
      const r = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
      const data = await r.json();
      const cc = Array.isArray(data) && data[0]?.address?.country_code;
      if (cc) return cc.toUpperCase() === 'GB' ? 'UK' : cc.toUpperCase();
    } catch (e) { console.warn('[brf safety] géocodage pays', e); }
    if (i < variations.length - 1) await new Promise(r => setTimeout(r, 250));
  }
  return null;
}

// → { code, source: 'adresse' | 'carte' } ou null
async function brfDetectProjectCountry(p) {
  const fromText = brfCountryFromAddressText(p);
  if (fromText) return { code: fromText, source: 'adresse' };
  const addr = [p?.address, p?.city].filter(Boolean).join(', ');
  const fromGeo = await brfCountryFromGeocode(addr);
  if (fromGeo) return { code: fromGeo, source: 'carte' };
  return null;
}

function brfSafetyUrl(lang, file) { return `${BRF_SAFETY_BASE}/${lang}/${file}.png`; }

function brfSafetyLastChoiceKey(projectId) { return 'vem_brf_safety_' + (projectId || ''); }

// Fenêtre de choix du pays. Résout :
//   { code: 'BE' | null, common: bool }  (code null = seulement les règles d'or)
//   { none: true }                        = pas de slides sécurité
//   null                                  = annuler
function brfAskSafetyCountry({ title, message, preselect, cancelLabel = 'Annuler' }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10030;display:flex;align-items:center;justify-content:center;padding:20px;';
    const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const btns = Object.entries(BRF_SAFETY_COUNTRIES).map(([code, c]) => `
      <button class="brf-sfc-c" data-code="${code}" style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:${code === preselect ? '#1f5f3f' : '#222'};border:1px solid ${code === preselect ? '#2ecc71' : '#444'};border-radius:8px;color:#eee;cursor:pointer;font-size:13px;text-align:left;">
        <span style="font-size:20px;">${c.flag}</span><span style="flex:1;">${c.fr}</span><span style="color:#888;font-size:11px;">${code}</span>
      </button>`).join('');
    overlay.innerHTML = `
      <div style="background:#1a1a1a;border:1px solid #444;border-radius:10px;padding:18px;max-width:560px;width:100%;color:#eee;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:15px;font-weight:700;">${esc(title)}</div>
          <button id="brf-sfc-x" style="background:transparent;color:#eee;border:none;font-size:24px;cursor:pointer;padding:0;line-height:1;">×</button>
        </div>
        <div style="font-size:12px;color:#bbb;margin-bottom:12px;line-height:1.5;">${message}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">${btns}</div>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:14px;cursor:pointer;">
          <input type="checkbox" id="brf-sfc-common" checked style="accent-color:#2ecc71;width:16px;height:16px;">
          Ajouter aussi la slide « Règles d'or Viewbox » (tous pays)
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button id="brf-sfc-cancel" style="background:transparent;color:#aaa;border:1px solid #555;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">${esc(cancelLabel)}</button>
          <button id="brf-sfc-none" style="background:#333;color:#eee;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">Pas de slides sécurité</button>
          <button id="brf-sfc-common-only" style="background:#333;color:#eee;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">Seulement les règles d'or</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const done = v => { overlay.remove(); resolve(v); };
    const common = () => overlay.querySelector('#brf-sfc-common').checked;
    overlay.querySelectorAll('.brf-sfc-c').forEach(b => { b.onclick = () => done({ code: b.dataset.code, common: common() }); });
    overlay.querySelector('#brf-sfc-common-only').onclick = () => done({ code: null, common: true });
    overlay.querySelector('#brf-sfc-none').onclick = () => done({ none: true });
    overlay.querySelector('#brf-sfc-cancel').onclick = () => done(null);
    overlay.querySelector('#brf-sfc-x').onclick = () => done(null);
  });
}

// Décide quelles slides sécurité mettre pour ce projet.
//   pays détecté + slides disponibles → directement, sans question
//   sinon → demande lequel mettre (pays détecté sans slides / pays inconnu)
// Résout comme brfAskSafetyCountry (+ detected).
async function brfResolveSafetyChoice(project, { ask = false, cancelLabel } = {}) {
  const detected = await brfDetectProjectCountry(project);
  const code = detected?.code || null;
  if (!ask && code && BRF_SAFETY_COUNTRIES[code]) return { code, common: true, detected };

  let last = null;
  try { last = localStorage.getItem(brfSafetyLastChoiceKey(project?.id)); } catch {}
  const addr = [project?.address, project?.city].filter(Boolean).join(', ');
  const addrTxt = addr ? `« ${addr.replace(/</g, '&lt;')} »` : '(aucune adresse sur le projet)';
  let message;
  if (code && BRF_SAFETY_COUNTRIES[code]) {
    message = `Pays détecté : <b>${brfCountryName(code)}</b> (${detected.source}). Adresse : ${addrTxt}.<br>Choisis les slides sécurité à insérer.`;
  } else if (code) {
    message = `L'événement est en <b>${brfCountryName(code)}</b> (${detected.source} ${addrTxt}) — <b>il n'existe pas encore de slides sécurité pour ce pays.</b><br>Lesquelles faut-il mettre ?`;
  } else {
    message = `Impossible de savoir dans quel pays a lieu l'événement — adresse : ${addrTxt}.<br>Quelles slides sécurité faut-il mettre ?`;
  }
  const pre = (code && BRF_SAFETY_COUNTRIES[code]) ? code : (BRF_SAFETY_COUNTRIES[last] ? last : null);
  const res = await brfAskSafetyCountry({ title: '🦺 Slides sécurité pays', message, preselect: pre, cancelLabel });
  if (res && res.code) { try { localStorage.setItem(brfSafetyLastChoiceKey(project?.id), res.code); } catch {} }
  return res ? { ...res, detected } : null;
}

// Liste des slides à créer pour un choix
function brfSafetySlideDefs(choice) {
  const defs = [];
  if (choice?.common) defs.push({ file: 'common', name: "🦺 Sécurité — Règles d'or Viewbox" });
  const c = choice?.code && BRF_SAFETY_COUNTRIES[choice.code];
  if (c) {
    defs.push({ file: `${choice.code}_1`, name: `🦺 ${c.flag} ${c.fr} — Cadre légal & documents` });
    defs.push({ file: `${choice.code}_2`, name: `🦺 ${c.flag} ${c.fr} — EPI & travail en hauteur` });
  }
  return defs;
}

function brfLoadImageEl(url) {
  return new Promise(resolve => {
    const img = new Image();
    const timer = setTimeout(() => resolve(null), 20000);
    img.onload  = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

// Construit une slide (objet BRF_STUDIO.slides) avec l'image plein cadre, sans toucher au canvas affiché
async function brfBuildSafetySlide(def) {
  const url = brfSafetyUrl('fr', def.file);
  const el = await brfLoadImageEl(url);
  if (!el) throw new Error(`Slide sécurité introuvable : ${url}`);
  const cv = new fabric.StaticCanvas(document.createElement('canvas'), { width: BRF_CANVAS_W, height: BRF_CANVAS_H });
  try {
    const img = new fabric.Image(el, { left: 0, top: 0, selectable: false, evented: false });
    img.scaleX = BRF_CANVAS_W / img.width;
    img.scaleY = BRF_CANVAS_H / img.height;
    cv.add(img);
    const json = cv.toJSON();
    delete json.backgroundImage;
    return {
      id: 'slide-safety-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      name: def.name,
      json,
      thumbnail: url,
    };
  } finally { cv.dispose(); }
}

// Ajoute les slides du choix à BRF_STUDIO.slides (à la fin, ou après `afterIdx`). Retourne le nombre ajouté.
async function brfInsertSafetySlides(choice, afterIdx = null) {
  const defs = brfSafetySlideDefs(choice);
  const built = [];
  for (const d of defs) built.push(await brfBuildSafetySlide(d));
  if (afterIdx == null) BRF_STUDIO.slides.push(...built);
  else BRF_STUDIO.slides.splice(afterIdx + 1, 0, ...built);
  return built.length;
}

// Une slide sécurité = une image venant de /briefing-safety/
function brfIsSafetyImageSrc(src) { return /\/briefing-safety\/(fr|en)\//.test(String(src || '')); }
function brfJsonHasSafetyImage(json) {
  return !!json?.objects?.some(o => o.type === 'image' && brfIsSafetyImageSrc(o.src));
}
function brfCanvasHasSafetyImage(canvas) {
  return !!canvas?.getObjects?.().some(o => o.type === 'image' && brfIsSafetyImageSrc(o.getSrc?.() || o.src));
}
// Verrouille l'image de fond d'une slide sécurité (Fabric ne sauvegarde pas selectable/evented)
function brfLockSafetyImages(canvas) {
  canvas?.getObjects?.().forEach(o => {
    if (o.type === 'image' && brfIsSafetyImageSrc(o.getSrc?.() || o.src)) o.set({ selectable: false, evented: false });
  });
}
// Copie du JSON d'une slide avec les images sécurité dans la langue d'export
function brfSafetyJsonForLang(json, lang) {
  if (!json || !brfJsonHasSafetyImage(json)) return json;
  const l = lang === 'en' ? 'en' : 'fr';
  const copy = JSON.parse(JSON.stringify(json));
  copy.objects.forEach(o => {
    if (o.type === 'image' && brfIsSafetyImageSrc(o.src)) o.src = String(o.src).replace(/\/briefing-safety\/(fr|en)\//, `/briefing-safety/${l}/`);
  });
  return copy;
}

// Menu « 📂 Depuis projet » › Slides sécurité pays : insère après la slide courante
async function brfAddSafetySlidesFromMenu() {
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  try {
    const r = await api('GET', `/projects/${BRF_STUDIO.projectId}`);
    if (!r?.success) throw new Error('Projet introuvable');
    const choice = await brfResolveSafetyChoice(r.data, { ask: true });
    if (!choice || choice.none) return;
    saveCurrentSlideJson();
    const n = await brfInsertSafetySlides(choice, BRF_STUDIO.curIdx);
    if (!n) { toast('Aucune slide sélectionnée', 'warning'); return; }
    BRF_STUDIO.curIdx = BRF_STUDIO.curIdx + 1;
    loadSlideIntoCanvas(BRF_STUDIO.curIdx);
    renderStudioSidebar();
    toast(`🦺 ${n} slide(s) sécurité ajoutée(s) — en anglais automatiquement à l'export PDF EN`, 'success');
  } catch (e) {
    console.error('[brf safety]', e);
    toast('Erreur : ' + (e.message || e), 'error');
  }
}
