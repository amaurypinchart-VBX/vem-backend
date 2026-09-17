function brfOpenTemplatesMenu(btn) {
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'brf-proj-menu';
  menu.style.cssText = 'position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;z-index:10010;box-shadow:0 6px 20px rgba(0,0,0,0.6);min-width:240px;';
  menu.innerHTML = `
    <div style="font-size:10px;color:#888;padding:4px 12px;text-transform:uppercase;letter-spacing:1px;">Ajouter une slide depuis un modèle</div>
    <button class="brf-pm-item" onclick="brfAddSlideFromTemplate('title-bullets')">📝 Titre + points clés</button>
    <button class="brf-pm-item" onclick="brfAddSlideFromTemplate('photo-text')">🖼️ Photo + texte</button>
    <button class="brf-pm-item" onclick="brfAddSlideFromTemplate('contacts')">📞 Contacts</button>
    <button class="brf-pm-item" onclick="brfAddSlideFromTemplate('calendar')">📅 Calendrier / Planning</button>
    <button class="brf-pm-item" onclick="brfAddSlideFromTemplate('cover')">🎯 Page de garde</button>
    <button class="brf-pm-item" onclick="brfAddSlideFromTemplate('section')">📍 Séparateur de section</button>
  `;
  const r = btn.getBoundingClientRect();
  menu.style.top  = (r.bottom + 4) + 'px';
  menu.style.left = r.left + 'px';
  document.body.appendChild(menu);
  menu.querySelectorAll('.brf-pm-item').forEach(b => {
    b.style.cssText = (b.style.cssText || '') + ';display:block;width:100%;text-align:left;background:transparent;color:#eee;border:none;padding:8px 12px;cursor:pointer;border-radius:4px;font-size:12px;';
    b.onmouseover = () => b.style.background = '#333';
    b.onmouseout  = () => b.style.background = 'transparent';
  });
  setTimeout(() => {
    const closeIt = (e) => { if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeIt); }};
    document.addEventListener('click', closeIt);
  }, 50);
}
function brfAddSlideFromTemplate(type) {
  saveCurrentSlideJson();
  const insertAt = BRF_STUDIO.curIdx + 1;
  const slideNum = insertAt + 1;

  // Mapping type → nom affiché dans la sidebar
  const sidebarNames = {
    cover:           'Couverture',
    section:         'Section',
    'title-bullets': 'Liste',
    'photo-text':    'Photo + texte',
    contacts:        'Contacts',
    calendar:        'Planning',
  };
  const sidebarName = sidebarNames[type] || ('Slide ' + slideNum);

  BRF_STUDIO.slides.splice(insertAt, 0, { id: 'slide-' + Date.now(), name: sidebarName, json: null });
  BRF_STUDIO.curIdx = insertAt;
  BRF_STUDIO.suppressSnapshot = true;
  BRF_STUDIO.fabricCanvas.clear();

  if (type === 'cover') {
    // Couverture : layout spécial (pas d'encadré titre), MAIS avec logo + watermark
    BRF_STUDIO.fabricCanvas.setBackgroundColor(BRF_TPL.BG, () => {});
    brfAddLogoTopRight(240);
    brfAddWatermarkBottomRight();
    BRF_STUDIO.fabricCanvas.add(new fabric.IText('BRIEFING', {
      left: 60, top: 200, fontSize: 24, fontFamily: 'Helvetica', fontWeight: 'bold', fill: '#666',
    }));
    BRF_STUDIO.fabricCanvas.add(new fabric.Textbox('NOM DU PROJET', {
      left: 60, top: 240, width: 1000, fontSize: 64, fontFamily: 'Helvetica', fontWeight: 'bold', fill: BRF_TPL.NAVY, lineHeight: 1.05,
    }));
    BRF_STUDIO.fabricCanvas.add(new fabric.IText('Client : ...', {
      left: 60, top: 420, fontSize: 28, fontFamily: 'Helvetica', fill: '#333',
    }));
  } else if (type === 'section') {
    // Section : fond bleu marine + gros titre blanc + logo + watermark
    BRF_STUDIO.fabricCanvas.setBackgroundColor(BRF_TPL.NAVY, () => {});
    brfAddLogoTopRight(180);
    brfAddWatermarkBottomRight();
    BRF_STUDIO.fabricCanvas.add(new fabric.Textbox('TITRE DE SECTION', {
      left: 60, top: 300, width: 1100, fontSize: 72, fontFamily: 'Helvetica', fontWeight: 'bold', fill: '#ffffff', lineHeight: 1.05,
    }));
    BRF_STUDIO.fabricCanvas.add(new fabric.IText('Sous-titre / contexte', {
      left: 60, top: 440, fontSize: 26, fontFamily: 'Helvetica', fill: '#aac', fontStyle: 'italic',
    }));
  } else if (type === 'title-bullets') {
    brfApplyStandardTemplate('Titre de la slide');
    BRF_STUDIO.fabricCanvas.add(new fabric.Textbox('• Premier point\n• Deuxième point\n• Troisième point\n• Quatrième point', {
      left: 60, top: 200, width: 1100, fontSize: 22, fontFamily: 'Helvetica', fill: '#222', lineHeight: 1.8,
    }));
  } else if (type === 'photo-text') {
    brfApplyStandardTemplate('Titre de la slide');
    BRF_STUDIO.fabricCanvas.add(new fabric.Rect({
      left: 60, top: 200, width: 540, height: 400, fill: '#ddd', stroke: '#bbb', strokeWidth: 2,
    }));
    BRF_STUDIO.fabricCanvas.add(new fabric.IText('Glisser une image ici', {
      left: 200, top: 380, fontSize: 16, fontFamily: 'Helvetica', fill: '#999',
    }));
    BRF_STUDIO.fabricCanvas.add(new fabric.Textbox('Texte de description...', {
      left: 640, top: 200, width: 560, fontSize: 18, fontFamily: 'Helvetica', fill: '#222', lineHeight: 1.5,
    }));
  } else if (type === 'contacts') {
    brfApplyStandardTemplate('Contacts');
    brfRenderDataTable({
      x: 60, y: 200,
      headers: ['Nom', 'Rôle', 'Téléphone', 'Email'],
      rows: [
        ['Nom 1', 'Rôle', '+32 ...', 'mail@...'],
        ['Nom 2', 'Rôle', '+32 ...', 'mail@...'],
        ['Nom 3', 'Rôle', '+32 ...', 'mail@...'],
      ],
      colWidths: [280, 260, 240, 380],
    });
  } else if (type === 'calendar') {
    brfApplyStandardTemplate('Planning');
    brfRenderDataTable({
      x: 60, y: 200,
      headers: ['Phase', 'Début', 'Fin'],
      rows: [
        ['🏗️ Installation', 'dd/mm/yyyy', 'dd/mm/yyyy'],
        ['🔨 Démontage',    'dd/mm/yyyy', 'dd/mm/yyyy'],
      ],
      colWidths: [260, 470, 430],
    });
  } else {
    // Fallback : slide standard vide avec template
    brfApplyStandardTemplate('Titre de la slide');
  }

  // Sauvegarde
  const json = BRF_STUDIO.fabricCanvas.toJSON();
  delete json.backgroundImage;
  BRF_STUDIO.slides[BRF_STUDIO.curIdx].json = json;
  BRF_STUDIO.undoStack = [];
  BRF_STUDIO.redoStack = [];
  BRF_STUDIO.suppressSnapshot = false;
  brfSnapshot();
  renderStudioSidebar();
}

function brfTemplateName(type) {
  return ({
    'title-bullets': 'Titre + points',
    'photo-text':    'Photo + texte',
    'contacts':      'Contacts',
    'calendar':      'Planning',
    'cover':         'Page de garde',
    'section':       'Section',
  })[type] || 'Slide';
}

function brfApplyTemplate(type) {
  const cv = BRF_STUDIO.fabricCanvas;
  // Couleurs Viewbox
  const PRIMARY = '#0a2540';
  const ACCENT  = '#e63946';
  const GRAY    = '#666';

  if (type === 'cover') {
    // Bande accent en haut, gros titre + sous-titre
    cv.add(new fabric.Rect({ left:0, top:0, width:BRF_CANVAS_W, height:8, fill:ACCENT, selectable:false, evented:false }));
    cv.add(new fabric.IText('TITRE DU PROJET', { left:80, top:240, fontSize:64, fontFamily:'Helvetica', fontWeight:'bold', fill:PRIMARY }));
    cv.add(new fabric.IText('Sous-titre ou nom du client', { left:80, top:330, fontSize:28, fontFamily:'Helvetica', fill:GRAY }));
    cv.add(new fabric.IText('— Briefing préparé par Viewbox —', { left:80, top:560, fontSize:18, fontFamily:'Helvetica', fontStyle:'italic', fill:GRAY }));
  }
  else if (type === 'section') {
    // Page séparatrice : grand rectangle en fond + numéro de section
    cv.add(new fabric.Rect({ left:0, top:0, width:BRF_CANVAS_W, height:BRF_CANVAS_H, fill:PRIMARY, selectable:false, evented:false }));
    cv.add(new fabric.IText('01', { left:80, top:200, fontSize:120, fontFamily:'Helvetica', fontWeight:'bold', fill:ACCENT }));
    cv.add(new fabric.IText('TITRE DE LA SECTION', { left:80, top:380, fontSize:48, fontFamily:'Helvetica', fontWeight:'bold', fill:'#ffffff' }));
  }
  else if (type === 'title-bullets') {
    // Petit accent + titre + ligne de séparation + bullets
    cv.add(new fabric.Rect({ left:80, top:80, width:60, height:5, fill:ACCENT, selectable:false, evented:false }));
    cv.add(new fabric.IText('Titre de la slide', { left:80, top:100, fontSize:42, fontFamily:'Helvetica', fontWeight:'bold', fill:PRIMARY }));
    const bullets = [
      '•  Premier point important',
      '•  Deuxième point à retenir',
      '•  Troisième élément clé',
      '•  Quatrième information',
    ];
    cv.add(new fabric.Textbox(bullets.join('\n'), {
      left:80, top:200, width:1120, fontSize:24, fontFamily:'Helvetica',
      fill:'#333', lineHeight:1.6,
    }));
  }
  else if (type === 'photo-text') {
    // Zone photo à gauche (placeholder rect) + titre/texte à droite
    cv.add(new fabric.Rect({
      left:60, top:80, width:560, height:560, fill:'#e0e0e0', stroke:'#bbb', strokeDashArray:[8,4],
    }));
    cv.add(new fabric.IText('🖼️\nCliquez Image pour insérer', {
      left:140, top:300, fontSize:24, fontFamily:'Helvetica', fill:'#888', textAlign:'center',
    }));
    cv.add(new fabric.Rect({ left:680, top:120, width:60, height:5, fill:ACCENT, selectable:false, evented:false }));
    cv.add(new fabric.IText('Titre', { left:680, top:140, fontSize:40, fontFamily:'Helvetica', fontWeight:'bold', fill:PRIMARY }));
    cv.add(new fabric.Textbox('Tapez ici le texte qui décrit votre photo, le contexte ou les points à retenir. Le texte va s\'adapter automatiquement à la largeur.', {
      left:680, top:220, width:540, fontSize:20, fontFamily:'Helvetica', fill:'#333', lineHeight:1.4,
    }));
  }
  else if (type === 'contacts') {
    cv.add(new fabric.Rect({ left:80, top:80, width:60, height:5, fill:ACCENT, selectable:false, evented:false }));
    cv.add(new fabric.IText('📞 Contacts', { left:80, top:100, fontSize:42, fontFamily:'Helvetica', fontWeight:'bold', fill:PRIMARY }));
    cv.add(new fabric.Textbox('Tu peux remplacer ce texte ou cliquer sur "📂 Depuis projet" puis "Contacts du client" pour piocher dans les contacts enregistrés.\n\n★ Nom Prénom\n   Fonction\n   ✉️ email@exemple.com\n   📞 +32 ...\n\n☆ Autre contact\n   ...', {
      left:80, top:200, width:1120, fontSize:20, fontFamily:'Helvetica', fill:'#333', lineHeight:1.5,
    }));
  }
  else if (type === 'calendar') {
    cv.add(new fabric.Rect({ left:80, top:80, width:60, height:5, fill:ACCENT, selectable:false, evented:false }));
    cv.add(new fabric.IText('📅 Planning', { left:80, top:100, fontSize:42, fontFamily:'Helvetica', fontWeight:'bold', fill:PRIMARY }));
    // 2 colonnes : installation + démontage
    cv.add(new fabric.Rect({ left:80,  top:220, width:540, height:380, fill:'#f8f9fb', stroke:'#ddd' }));
    cv.add(new fabric.IText('🏗️ INSTALLATION', { left:110, top:250, fontSize:26, fontFamily:'Helvetica', fontWeight:'bold', fill:ACCENT }));
    cv.add(new fabric.Textbox('Lundi 25 juin\n  08:00  Arrivée camion Tubize\n  09:00  Déchargement\n  10:00  Mise en place\n\nMardi 26 juin\n  08:00  ...', {
      left:110, top:300, width:480, fontSize:18, fontFamily:'Helvetica', fill:'#333', lineHeight:1.6,
    }));
    cv.add(new fabric.Rect({ left:660, top:220, width:540, height:380, fill:'#f8f9fb', stroke:'#ddd' }));
    cv.add(new fabric.IText('🔨 DÉMONTAGE', { left:690, top:250, fontSize:26, fontFamily:'Helvetica', fontWeight:'bold', fill:ACCENT }));
    cv.add(new fabric.Textbox('Vendredi 29 juin\n  17:00  Fin événement\n  18:00  Début démontage\n\nSamedi 30 juin\n  ...', {
      left:690, top:300, width:480, fontSize:18, fontFamily:'Helvetica', fill:'#333', lineHeight:1.6,
    }));
  }
  cv.requestRenderAll();
}

function applyLogoBackground() {
  if (!BRF_STUDIO?.fabricCanvas) return;
  const c = BRF_STUDIO.fabricCanvas;
  if (!BRF_STUDIO.logoUrl) {
    c.backgroundImage = null;
    c.renderAll();
    return;
  }
  // On charge en bypass Fabric.fromURL pour mieux gérer les erreurs CORS et logger
  const place = (imgEl) => {
    const fImg = new fabric.Image(imgEl);
    fImg.scaleToWidth(BRF_CANVAS_W * 0.20);
    fImg.set({
      left: BRF_CANVAS_W - fImg.getScaledWidth() - 30,
      top:  BRF_CANVAS_H - fImg.getScaledHeight() - 30,
      opacity: 0.25,
      selectable: false,
      evented: false,
    });
    c.setBackgroundImage(fImg, () => c.renderAll());
  };
  // Essai 1 : avec crossOrigin (permet l'export PDF)
  const imgEl = new Image();
  imgEl.crossOrigin = 'anonymous';
  imgEl.onload  = () => { console.log('[brf] logo chargé avec CORS'); place(imgEl); };
  imgEl.onerror = () => {
    console.warn('[brf] logo bloqué par CORS, retry sans crossOrigin (l\'export PDF perdra le logo)');
    // Essai 2 : sans crossOrigin → s'affiche mais ne pourra pas être exporté en PDF
    const imgEl2 = new Image();
    imgEl2.onload  = () => place(imgEl2);
    imgEl2.onerror = () => console.error('[brf] logo introuvable : ' + BRF_STUDIO.logoUrl);
    imgEl2.src = BRF_STUDIO.logoUrl;
  };
  imgEl.src = BRF_STUDIO.logoUrl;
}

// ─── Gestion des slides ───
function brfAddSlide() {
  saveCurrentSlideJson();
  const insertAt = BRF_STUDIO.curIdx + 1;
  const slideNum = insertAt + 1;
  BRF_STUDIO.slides.splice(insertAt, 0, { id:'slide-'+Date.now(), name:'Slide '+slideNum, json:null });
  BRF_STUDIO.curIdx = insertAt;
  BRF_STUDIO.suppressSnapshot = true;
  BRF_STUDIO.fabricCanvas.clear();
  brfApplyStandardTemplate('Titre de la slide');
  const json = BRF_STUDIO.fabricCanvas.toJSON();
  delete json.backgroundImage;
  BRF_STUDIO.slides[BRF_STUDIO.curIdx].json = json;
  BRF_STUDIO.undoStack = [];
  BRF_STUDIO.redoStack = [];
  BRF_STUDIO.suppressSnapshot = false;
  brfSnapshot();
  renderStudioSidebar();
}
function brfSelectSlide(idx) {
  saveCurrentSlideJson();
  BRF_STUDIO.curIdx = idx;
  loadSlideIntoCanvas(idx);
  renderStudioSidebar();
}

// ═══════════════════════════════════════════════════════════════
// Import des slides du Briefing Classique dans le Studio
// ═══════════════════════════════════════════════════════════════
async function brfImportFromClassic() {
  if (!CURRENT_BRIEFING?.slides?.length) {
    toast('Aucune slide classique à importer', 'warning');
    return;
  }
  const nb = CURRENT_BRIEFING.slides.length;
  if (!confirm(`Importer ${nb} slide(s) du Briefing Classique dans le Studio ?\n\nElles seront insérées juste après la slide courante.`)) return;

  saveCurrentSlideJson();
  const savedIdx  = BRF_STUDIO.curIdx;
  const beforeLen = BRF_STUDIO.slides.length;

  toast(`⏳ Import de ${nb} slide(s)...`, 'info');

  for (const cs of CURRENT_BRIEFING.slides) {
    BRF_STUDIO.slides.push({
      id: 'slide-import-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
      name: cs.title || 'Slide importée',
      json: null,
    });
    BRF_STUDIO.curIdx = BRF_STUDIO.slides.length - 1;
    BRF_STUDIO.suppressSnapshot = true;
    BRF_STUDIO.fabricCanvas.clear();
    brfApplyStandardTemplate(cs.title || 'Slide');

    let y = 170;
    for (const block of (cs.blocks || [])) {
      y = await brfRenderClassicBlock(block, y);
      if (y > BRF_CANVAS_H - 60) break; // évite le débordement
    }

    const json = BRF_STUDIO.fabricCanvas.toJSON();
    delete json.backgroundImage;
    BRF_STUDIO.slides[BRF_STUDIO.curIdx].json = json;
    BRF_STUDIO.suppressSnapshot = false;
  }

  // Déplace les slides importées juste après savedIdx
  const insertAt = savedIdx + 1;
  const imported = BRF_STUDIO.slides.splice(beforeLen, BRF_STUDIO.slides.length - beforeLen);
  BRF_STUDIO.slides.splice(insertAt, 0, ...imported);
  BRF_STUDIO.curIdx = insertAt;

  loadSlideIntoCanvas(BRF_STUDIO.curIdx);
  renderStudioSidebar();
  toast(`✅ ${imported.length} slide(s) importée(s) depuis le classique`, 'success');
}

async function brfRenderClassicBlock(block, y) {
  const cv = BRF_STUDIO.fabricCanvas;
  const maxW = BRF_CANVAS_W - 120;

  if (block.type === 'text' && block.content) {
    const tb = new fabric.Textbox(String(block.content), {
      left: 60, top: y, width: maxW, fontSize: 16, fontFamily: 'Helvetica', fill: '#222',
    });
    cv.add(tb);
    return y + Math.min(tb.height || 40, 300) + 20;
  }
  if (block.type === 'contacts' && (block.contacts || []).length) {
    brfRenderDataTable({
      x: 60, y,
      headers: ['Nom', 'Rôle', 'Téléphone', 'Email'],
      rows: block.contacts.map(c => [c.name||'', c.role||'', c.phone||'', c.email||'']),
      colWidths: [220, 180, 200, 260],
    });
    return y + 50 + block.contacts.length * 40 + 20;
  }
  if (block.type === 'project') {
    const p = BRIEFING_AUTO.project || {};
    const fmt = d => d ? new Date(d).toLocaleString('fr-FR', { dateStyle:'short', timeStyle:'short' }) : '';
    const rows = [
      ['Projet',        p.name || ''],
      ['N° interne',    p.internalNumber || ''],
      ['Client',        p.client?.name || ''],
      ['Adresse',       `${p.address||''}${p.city?', '+p.city:''}`],
      ['Installation',  p.installationStart ? `${fmt(p.installationStart)} → ${fmt(p.installationEnd)}` : ''],
      ['Ouvriers',      p.workersCount ? String(p.workersCount) : ''],
    ].filter(r => r[1]);
    brfRenderDataTable({ x: 60, y, headers: ['Champ','Valeur'], rows, colWidths: [220, 640] });
    return y + 50 + rows.length * 40 + 20;
  }
  if (block.type === 'tasks' && (BRIEFING_AUTO.tasks||[]).length) {
    const rows = (BRIEFING_AUTO.tasks || []).slice(0, 12).map(t => [
      t.taskDate ? new Date(t.taskDate).toLocaleDateString('fr-FR') : '',
      t.title || '',
      t.status || '',
    ]);
    brfRenderDataTable({ x: 60, y, headers: ['Date','Tâche','Statut'], rows, colWidths: [140, 540, 180] });
    return y + 50 + rows.length * 40 + 20;
  }
  if (block.type === 'trucks' && (BRIEFING_AUTO.trucks||[]).length) {
    const rows = (BRIEFING_AUTO.trucks || []).map(t => [
      `${t.vehicleType||'truck'} ${t.truckNumber||''}`.trim(),
      t.driverName || '',
      t.driverPhone || '',
      t.arrivalDate ? new Date(t.arrivalDate).toLocaleString('fr-FR') : '',
    ]);
    brfRenderDataTable({ x: 60, y, headers: ['Véhicule','Chauffeur','Téléphone','Arrivée'], rows, colWidths: [200, 220, 200, 240] });
    return y + 50 + rows.length * 40 + 20;
  }
  if (block.type === 'photos' && (block.photos || []).length) {
    let x = 60;
    let rowH = 0;
    for (const p of block.photos) {
      if (!p.url || /\.pdf($|\?)/i.test(p.url)) continue;
      await new Promise(resolve => {
        const place = (im) => {
          try {
            const fImg = new fabric.Image(im);
            fImg.scaleToWidth(280);
            if (x + fImg.getScaledWidth() > BRF_CANVAS_W - 40) { x = 60; y += rowH + 20; rowH = 0; }
            fImg.set({ left: x, top: y });
            cv.add(fImg);
            x += fImg.getScaledWidth() + 20;
            rowH = Math.max(rowH, fImg.getScaledHeight());
          } catch (e) { console.warn('[brf import photo]', e); }
          resolve();
        };
        const tryCors = new Image();
        tryCors.crossOrigin = 'anonymous';
        tryCors.onload  = () => place(tryCors);
        tryCors.onerror = () => {
          const noCors = new Image();
          noCors.onload  = () => place(noCors);
          noCors.onerror = () => resolve();
          noCors.src = p.url;
        };
        tryCors.src = p.url;
      });
    }
    return y + rowH + 20;
  }
  return y;
}
function brfDeleteSlide(idx) {
  if (BRF_STUDIO.slides.length <= 1) { toast('Au moins une slide doit rester', 'warning'); return; }
  if (!confirm('Supprimer la slide "' + (BRF_STUDIO.slides[idx].name || '') + '" ?')) return;
  BRF_STUDIO.slides.splice(idx, 1);
  if (BRF_STUDIO.curIdx >= BRF_STUDIO.slides.length) BRF_STUDIO.curIdx = BRF_STUDIO.slides.length - 1;
  loadSlideIntoCanvas(BRF_STUDIO.curIdx);
  renderStudioSidebar();
}
function brfMoveSlide(idx, dir) {
  saveCurrentSlideJson();
  const ni = idx + dir;
  if (ni < 0 || ni >= BRF_STUDIO.slides.length) return;
  [BRF_STUDIO.slides[idx], BRF_STUDIO.slides[ni]] = [BRF_STUDIO.slides[ni], BRF_STUDIO.slides[idx]];
  if (BRF_STUDIO.curIdx === idx) BRF_STUDIO.curIdx = ni;
  else if (BRF_STUDIO.curIdx === ni) BRF_STUDIO.curIdx = idx;
  renderStudioSidebar();
}
function brfDuplicateSlide(idx) {
  saveCurrentSlideJson();
  const src = BRF_STUDIO.slides[idx];
  if (!src) return;
  const copy = {
    id: 'slide-' + Date.now() + '-' + Math.random().toString(36).slice(2,6),
    name: (src.name || 'Slide') + ' (copie)',
    json: src.json ? JSON.parse(JSON.stringify(src.json)) : null,
    thumbnail: src.thumbnail || null,
  };
  BRF_STUDIO.slides.splice(idx + 1, 0, copy);
  BRF_STUDIO.curIdx = idx + 1;
  loadSlideIntoCanvas(BRF_STUDIO.curIdx);
  renderStudioSidebar();
  toast('Slide dupliquée 🗐', 'success');
}

// ═══════════════════════════════════════════════════════════════
// Drag & drop de réordonnancement des slides (sidebar)
// ═══════════════════════════════════════════════════════════════
let BRF_DRAG_FROM = -1;
function brfSlideDragStart(e, idx) {
  BRF_DRAG_FROM = idx;
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', String(idx)); } catch {}
  e.currentTarget.style.opacity = '0.4';
}
function brfSlideDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  if (BRF_DRAG_FROM < 0 || idx === BRF_DRAG_FROM) return;
  e.currentTarget.style.borderTop    = idx < BRF_DRAG_FROM ? '2px solid #e63946' : '1px solid #333';
  e.currentTarget.style.borderBottom = idx > BRF_DRAG_FROM ? '2px solid #e63946' : '1px solid #333';
}
function brfSlideDragLeave(e) {
  e.currentTarget.style.borderTop    = '';
  e.currentTarget.style.borderBottom = '';
}
function brfSlideDrop(e, idx) {
  e.preventDefault();
  const from = BRF_DRAG_FROM;
  BRF_DRAG_FROM = -1;
  if (from < 0 || from === idx) return;
  saveCurrentSlideJson();
  const [moved] = BRF_STUDIO.slides.splice(from, 1);
  BRF_STUDIO.slides.splice(idx, 0, moved);
  // Recalcule curIdx
  if (BRF_STUDIO.curIdx === from) {
    BRF_STUDIO.curIdx = idx;
  } else if (from < BRF_STUDIO.curIdx && idx >= BRF_STUDIO.curIdx) {
    BRF_STUDIO.curIdx--;
  } else if (from > BRF_STUDIO.curIdx && idx <= BRF_STUDIO.curIdx) {
    BRF_STUDIO.curIdx++;
  }
  renderStudioSidebar();
}
function brfSlideDragEnd(e) {
  BRF_DRAG_FROM = -1;
  document.querySelectorAll('#brf-st-sidebar > div').forEach(d => {
    d.style.opacity = '';
    d.style.borderTop = '';
    d.style.borderBottom = '';
  });
}

function saveCurrentSlideJson() {
  if (!BRF_STUDIO?.fabricCanvas) return;
  const json = BRF_STUDIO.fabricCanvas.toJSON();
  delete json.backgroundImage; // appliqué séparément depuis logoUrl
  if (BRF_STUDIO.slides[BRF_STUDIO.curIdx]) BRF_STUDIO.slides[BRF_STUDIO.curIdx].json = json;
}

function loadSlideIntoCanvas(idx) {
  const slide = BRF_STUDIO.slides[idx];
  if (!slide || !BRF_STUDIO.fabricCanvas) return;
  BRF_STUDIO.suppressSnapshot = true;
  BRF_STUDIO.fabricCanvas.clear();
  BRF_STUDIO.fabricCanvas.setBackgroundColor('#ffffff', () => BRF_STUDIO.fabricCanvas.renderAll());
  const finish = () => {
    applyLogoBackground();
    BRF_STUDIO.fabricCanvas.renderAll();
    // Reset undo/redo pour cette slide + premier snapshot
    BRF_STUDIO.undoStack = [];
    BRF_STUDIO.redoStack = [];
    BRF_STUDIO.suppressSnapshot = false;
    brfSnapshot();
    brfUpdateUndoButtons();
  };
  if (slide.json) {
    BRF_STUDIO.fabricCanvas.loadFromJSON(slide.json, finish);
  } else {
    finish();
  }
}

function renderStudioSidebar() {
  const sb = document.getElementById('brf-st-sidebar');
  if (!sb) return;
  sb.innerHTML = BRF_STUDIO.slides.map((s, i) => {
    const isCur = i === BRF_STUDIO.curIdx;
    const thumb = s.thumbnail;
    return `
    <div draggable="true"
      ondragstart="brfSlideDragStart(event,${i})"
      ondragover="brfSlideDragOver(event,${i})"
      ondragleave="brfSlideDragLeave(event)"
      ondrop="brfSlideDrop(event,${i})"
      ondragend="brfSlideDragEnd(event)"
      style="display:flex;flex-direction:column;gap:4px;padding:6px;background:${isCur?'#2a1518':'#1a1a1a'};border:1px solid ${isCur?'#e63946':'#333'};border-radius:6px;cursor:grab;" onclick="brfSelectSlide(${i})" title="Glisse-dépose la miniature pour réordonner">
      <div style="display:flex;align-items:center;gap:4px;">
        <span style="font-size:14px;color:#666;min-width:14px;cursor:grab;line-height:1;" title="Glisse-dépose pour réordonner">⋮⋮</span>
        <span style="font-size:11px;color:#aaa;min-width:18px;">${i+1}.</span>
        <input value="${(s.name||'').replace(/"/g,'&quot;')}"
          draggable="false"
          style="flex:1;min-width:0;background:transparent;border:none;color:#eee;font-size:11px;padding:1px 2px;outline:none;cursor:text;"
          onclick="event.stopPropagation();" oninput="BRF_STUDIO.slides[${i}].name=this.value">
        <button style="background:transparent;border:none;color:#888;cursor:pointer;padding:0 2px;font-size:10px;" onclick="event.stopPropagation();brfMoveSlide(${i},-1)" title="Monter">▲</button>
        <button style="background:transparent;border:none;color:#888;cursor:pointer;padding:0 2px;font-size:10px;" onclick="event.stopPropagation();brfMoveSlide(${i},1)" title="Descendre">▼</button>
        <button style="background:transparent;border:none;color:#4895ef;cursor:pointer;padding:0 3px;font-size:12px;" onclick="event.stopPropagation();brfDuplicateSlide(${i})" title="Dupliquer la slide">🗐</button>
        <button style="background:transparent;border:none;color:#e63946;cursor:pointer;padding:0 4px;font-size:14px;" onclick="event.stopPropagation();brfDeleteSlide(${i})" title="Supprimer">×</button>
      </div>
      <div style="aspect-ratio:16/9;background:${thumb?'#fff':'#222'};border-radius:4px;overflow:hidden;border:1px solid #333;cursor:grab;">
        ${thumb ? `<img src="${thumb}" draggable="false" style="width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;">` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:10px;color:#666;pointer-events:none;">(vide)</div>`}
      </div>
    </div>`;
  }).join('');
}

// ─── Save / Export / Close ───
async function briefingStudioSave() {
  saveCurrentSlideJson();
  if (!BRF_STUDIO?.briefingId) { toast('Aucun briefing associé', 'error'); return; }
  const payload = {
    title: BRF_STUDIO.title || 'Briefing',
    studioSlides: {
      version: BRF_STUDIO_VERSION,
      logoUrl: BRF_STUDIO.logoUrl || null,
      title:   BRF_STUDIO.title || 'Briefing',
      slides:  BRF_STUDIO.slides,
    },
  };
  const res = await api('PATCH', `/briefings/${BRF_STUDIO.briefingId}`, payload);
  if (res?.success) toast('Briefing sauvegardé ✅', 'success');
  else toast('Échec sauvegarde', 'error');
}
// Traduit tous les objets texte d'une slide Fabric via /api/v1/translate
// Retourne le nombre de textes traduits (pour debug / toast)
async function brfTranslateSlideTexts(canvas, targetLang) {
  if (!canvas || !targetLang || targetLang === 'fr') return 0;

  // Collecte tous les objets texte ET leurs textes
  const textObjects = [];
  canvas.getObjects().forEach(obj => {
    if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') {
      if (obj.text && String(obj.text).trim()) {
        textObjects.push(obj);
      }
    }
  });

  if (textObjects.length === 0) return 0;

  const texts = textObjects.map(o => String(o.text));

  try {
    const r = await fetch('/api/v1/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ texts, targetLang, sourceLang: 'fr' }),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const translations = data?.data?.translations || [];

    // Applique les traductions aux objets Fabric
    textObjects.forEach((obj, i) => {
      const t = translations[i];
      if (t && typeof t === 'string') {
        obj.set('text', t);
        // Force le recalcul du rendu pour les textbox/i-text
        if (typeof obj.initDimensions === 'function') obj.initDimensions();
      }
    });
    canvas.requestRenderAll();
    return translations.length;
  } catch (e) {
    console.error('[brf translate]', e);
    return 0;
  }
}
async function briefingStudioExportPDF(btn) {
  saveCurrentSlideJson();
  if (!window.jspdf) { toast('jsPDF non chargé', 'error'); return; }

  // 1. Demande de la langue
  const lang = await pickPdfLang();
  if (!lang) return;

  const { jsPDF } = window.jspdf;
  const orig = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Export...'; }

  try {
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297, pageH = 210;
    const imgW = pageW;
    const imgH = pageW * (BRF_CANVAS_H / BRF_CANVAS_W);
    const offsetY = (pageH - imgH) / 2;
    const curIdx = BRF_STUDIO.curIdx;

    let totalTranslated = 0;

    for (let i = 0; i < BRF_STUDIO.slides.length; i++) {
      if (btn) btn.innerHTML = `⏳ Slide ${i + 1}/${BRF_STUDIO.slides.length}...`;

      BRF_STUDIO.curIdx = i;
      loadSlideIntoCanvas(i);

      // attendre rendu initial (images, background, logo)
      await new Promise(r => setTimeout(r, 1000));

      // 2. Traduction IA si lang === 'en'
      if (lang === 'en') {
        if (btn) btn.innerHTML = `🌐 Traduction slide ${i + 1}/${BRF_STUDIO.slides.length}...`;
        const n = await brfTranslateSlideTexts(BRF_STUDIO.fabricCanvas, lang);
        totalTranslated += n;
        // Petit délai pour que le canvas se re-rende après les set('text')
        await new Promise(r => setTimeout(r, 300));
      }

      // 3. Export du canvas
      const dataUrl = BRF_STUDIO.fabricCanvas.toDataURL({ format: 'jpeg', quality: 0.9, multiplier: 2 });
      if (i > 0) pdf.addPage();
      pdf.addImage(dataUrl, 'JPEG', 0, offsetY, imgW, imgH);
    }

    // 4. Restaurer la slide originale (la traduction n'est pas persistée — on recharge le JSON original)
    BRF_STUDIO.curIdx = curIdx;
    loadSlideIntoCanvas(curIdx);

    // 5. Save PDF (téléchargement local)
    const safeTitle = (BRF_STUDIO.title || 'briefing').replace(/[^\w-]/g, '_');
    const fileName = `${safeTitle}_${lang}.pdf`;
    pdf.save(fileName);

    // 6. Upload du PDF dans les fichiers du projet
    if (btn) btn.innerHTML = '📁 Sauvegarde dans les fichiers...';
    try {
      const pdfBlob = pdf.output('blob');
      const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });
      const fd = new FormData();
      fd.append('file', pdfFile);
      const upRes = await fetch(window.location.origin + '/api/v1/upload/project-file/' + BRF_STUDIO.projectId, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || TOKEN) },
        body: fd,
      });
      if (upRes.ok) {
        toast(
          lang === 'en'
            ? `PDF exporté + sauvegardé dans les fichiers ✅ (${totalTranslated} textes traduits)`
            : 'PDF exporté + sauvegardé dans les fichiers ✅',
          'success'
        );
      } else {
        toast('PDF téléchargé mais échec sauvegarde dans les fichiers', 'warning');
      }
    } catch (upErr) {
      console.error('[briefing pdf upload]', upErr);
      toast('PDF téléchargé mais échec sauvegarde dans les fichiers', 'warning');
    }
  } catch (e) {
    console.error('[briefing export]', e);
    toast('Échec export : ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = orig; }
  }
}

function briefingStudioClose() {
  if (!confirm('Fermer le Studio ? Pensez à sauvegarder.')) return;
  document.removeEventListener('keydown', handleStudioKeydown);
  window.removeEventListener('resize', resizeStudioCanvas);
  document.getElementById('brf-studio-overlay')?.remove();
  BRF_STUDIO = null;
  // Retour à la liste des briefings du projet
  if (CURRENT_PROJECT_ID) loadDetailBriefing(CURRENT_PROJECT_ID);
  CURRENT_BRIEFING = null;
}

// ─── BRIEFING STUDIO — Insertion depuis les données du projet ───────
// Menu déroulant "📂 Depuis projet" qui propose d'insérer dans le canvas :
// camions, équipes, contacts, tâches, planning, infos projet.
// Pour les listes (camions/équipes/contacts/tâches) → modal sélecteur
// avec checkboxes pour choisir précisément ce qu'on veut insérer.

function brfOpenProjectMenu(btn) {
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'brf-proj-menu';
  menu.style.cssText = 'position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;z-index:10010;box-shadow:0 6px 20px rgba(0,0,0,0.6);min-width:260px;max-height:80vh;overflow-y:auto;';
  menu.innerHTML = `
    <div class="brf-pm-section">PROJET</div>
    <button class="brf-pm-item" onclick="brfPickFromProject('infos')">🏷️ Infos projet (résumé)</button>
    <button class="brf-pm-item" onclick="brfPickFromProject('planning')">📅 Planning install/démontage</button>
    <button class="brf-pm-item" onclick="brfPickFromProject('location')">📍 Localisation + lien Maps</button>
    <button class="brf-pm-item" onclick="brfPickFromProject('notes')">📓 Notes projet (scope, install...)</button>
    <div class="brf-pm-section">PERSONNES</div>
    <button class="brf-pm-item" onclick="brfPickFromProject('contacts')">📞 Contacts du client</button>
    <button class="brf-pm-item" onclick="brfPickFromProject('team')">👥 Équipes (+ téléphones)</button>
    <div class="brf-pm-section">LOGISTIQUE</div>
    <button class="brf-pm-item" onclick="brfPickFromProject('trucks')">🚛 Camions (détaillé)</button>
    <button class="brf-pm-item" onclick="brfPickFromProject('team_bookings')">✈️ Bookings transport équipe</button>
    <button class="brf-pm-item" onclick="brfPickFromProject('hotel_bookings')">🏨 Réservations hôtels équipe</button>
    <div class="brf-pm-section">CONTENU</div>
    <button class="brf-pm-item" onclick="brfPickFromProject('tasks')">📋 Tâches</button>
    <button class="brf-pm-item" onclick="brfPickFromProject('files')">📁 Fichiers / Photos</button>
    <button class="brf-pm-item" onclick="brfPickFromProject('remarks')">⚠️ Remarques client</button>
    <style>
      .brf-pm-section { font-size:10px;color:#888;padding:6px 12px 2px;text-transform:uppercase;letter-spacing:1px; }
    </style>
  `;
  const r = btn.getBoundingClientRect();
  menu.style.top  = (r.bottom + 4) + 'px';
  menu.style.left = r.left + 'px';
  document.body.appendChild(menu);
  menu.querySelectorAll('.brf-pm-item').forEach(b => {
    b.style.cssText = 'display:block;width:100%;text-align:left;background:transparent;color:#eee;border:none;padding:7px 12px;cursor:pointer;border-radius:4px;font-size:12px;';
    b.onmouseover = () => b.style.background = '#333';
    b.onmouseout  = () => b.style.background = 'transparent';
  });
  setTimeout(() => {
    const closeIt = (e) => {
      if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', closeIt); }
    };
    document.addEventListener('click', closeIt);
  }, 50);
}

async function brfPickFromProject(type) {
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  const projectId = BRF_STUDIO.projectId;
  if (!projectId) { toast('Pas de projet', 'error'); return; }
  toast('Chargement...', 'info');

  try {
    if (type === 'infos') {
      const r = await api('GET', `/projects/${projectId}`);
      if (!r?.success) throw new Error('Projet introuvable');
      brfAddInfoBlock(r.data);
      return;
    }
    if (type === 'planning') {
      const r = await api('GET', `/projects/${projectId}`);
      if (!r?.success) throw new Error('Projet introuvable');
      brfAddPlanningBlock(r.data);
      return;
    }
    if (type === 'location') {
      const r = await api('GET', `/projects/${projectId}`);
      if (!r?.success) throw new Error('Projet introuvable');
      brfAddLocationBlock(r.data);
      return;
    }
    if (type === 'notes') {
      const r = await api('GET', `/projects/${projectId}`);
      if (!r?.success) throw new Error('Projet introuvable');
      const p = r.data;
      if (!p.scope && !p.installNotes && !p.dismantleNotes && !p.description && !p.specialInstructions) {
        toast('Aucune note saisie sur ce projet', 'warning'); return;
      }
      brfAddNotesBlock(p);
      return;
    }
    if (type === 'trucks') {
      const r = await api('GET', `/projects/${projectId}/trucks`);
      const items = r?.data || [];
      if (!items.length) { toast('Aucun camion sur ce projet', 'warning'); return; }
      brfOpenPicker('🚛 Choisir les camions à inclure', items, t => ({
        key:   t.id,
        label: `${vehicleLabel(t.vehicleType)} — ${t.loadingLocation || '?'} → ${t.unloadingLocation || '?'}`,
        sub:   formatTruckSub(t),
      }), selected => brfAddTrucksBlock(selected));
      return;
    }
    if (type === 'team') {
      const r = await api('GET', `/projects/${projectId}`);
      const team = r?.data?.team || [];
      if (!team.length) { toast('Aucun membre dans l\'équipe', 'warning'); return; }
      brfOpenPicker('👥 Choisir les membres à inclure', team, m => ({
        key:   m.userId || m.id,
        label: `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim() || '—',
        sub:   [m.role, phaseLabel(m.phase), m.user?.phone ? '📞 ' + m.user.phone : null].filter(Boolean).join(' · '),
      }), selected => brfAddTeamBlock(selected));
      return;
    }
    if (type === 'team_bookings') {
      const r = await api('GET', `/projects/${projectId}/bookings`);
      const bookings = r?.data || [];
      if (!bookings.length) { toast('Aucun booking transport sur ce projet', 'warning'); return; }
      brfOpenPicker('✈️ Choisir les bookings transport à inclure', bookings, b => ({
        key:   b.id,
        label: `${b.user?.firstName||''} ${b.user?.lastName||''}`.trim() + ' — ' + (b.phase === 'dismantling' ? 'démontage' : 'install'),
        sub:   [
          b.onSiteStart ? new Date(b.onSiteStart).toLocaleDateString('fr-FR') : null,
          b.outboundMode ? '🛫 ' + b.outboundMode : null,
          b.returnMode   ? '🛬 ' + b.returnMode   : null,
        ].filter(Boolean).join(' · '),
      }), selected => brfAddTeamBookingsBlock(selected));
      return;
    }
    if (type === 'hotel_bookings') {
      const r = await api('GET', `/projects/${projectId}/hotel-bookings`);
      const hotels = r?.data || [];
      if (!hotels.length) { toast('Aucune réservation hôtel sur ce projet', 'warning'); return; }
      brfOpenPicker('🏨 Choisir les hôtels à inclure', hotels, h => ({
        key:   h.id,
        label: h.hotelName + ' — ' + (h.phase === 'dismantling' ? 'démontage' : 'install'),
        sub:   [
          h.checkin ? new Date(h.checkin).toLocaleDateString('fr-FR') + ' → ' + new Date(h.checkout).toLocaleDateString('fr-FR') : null,
          h.hotelAddress,
          (h.occupants||[]).length + ' occupant(s)',
        ].filter(Boolean).join(' · '),
      }), selected => brfAddHotelBookingsBlock(selected));
      return;
    }
    if (type === 'tasks') {
      const r = await api('GET', `/tasks?projectId=${projectId}`);
      const tasks = r?.data || [];
      if (!tasks.length) { toast('Aucune tâche sur ce projet', 'warning'); return; }
      brfOpenPicker('📋 Choisir les tâches à inclure', tasks, t => ({
        key:   t.id,
        label: t.title || '—',
        sub:   [
          t.taskDate ? new Date(t.taskDate).toLocaleDateString('fr-FR') : null,
          t.assignedTo?.firstName ? '👤 ' + t.assignedTo.firstName : null,
          taskStatusLabel(t.status),
        ].filter(Boolean).join(' · '),
      }), selected => brfAddTasksBlock(selected));
      return;
    }
    if (type === 'contacts') {
      const projRes = await api('GET', `/projects/${projectId}`);
      const clientId = projRes?.data?.clientId;
      if (!clientId) { toast('Pas de client lié à ce projet', 'warning'); return; }
      const cliRes = await api('GET', `/clients/${clientId}`);
      if (!cliRes?.success) throw new Error('Client introuvable');
      const client = cliRes.data;
      const contacts = Array.isArray(client.contacts) ? [...client.contacts] : [];
      if (contacts.length === 0 && client.contactName) {
        contacts.push({ id:'main', name: client.contactName, email: client.email, phone: client.phone, role:'Contact principal', isPrimary:true });
      }
      if (!contacts.length) { toast('Aucun contact défini pour ce client', 'warning'); return; }
      brfOpenPicker(`📞 Choisir les contacts de ${client.name}`, contacts, c => ({
        key:   c.id,
        label: (c.isPrimary?'★ ':'') + (c.name || '—'),
        sub:   [c.role, c.email, c.phone].filter(Boolean).join(' · '),
      }), selected => brfAddContactsBlock(selected, client.name));
      return;
    }
    if (type === 'files') {
      const r = await api('GET', `/projects/${projectId}/files`);
      const files = (r?.data || []).filter(f => {
        const ext = (f.fileName || f.fileUrl || '').split('.').pop().toLowerCase();
        return ['jpg','jpeg','png','gif','webp','heic','pdf','svg'].includes(ext);
      });
      if (!files.length) { toast('Aucun fichier image/PDF sur ce projet', 'warning'); return; }
      brfOpenPicker('📁 Choisir les fichiers à insérer', files, f => ({
        key:   f.id,
        label: f.fileName || 'fichier',
        sub:   (f.fileType || '?') + (f.fileSize ? ' · ' + Math.round(f.fileSize/1024) + ' KB' : ''),
      }), selected => brfAddFilesBlock(selected));
      return;
    }
    if (type === 'remarks') {
      const r = await api('GET', `/client-remarks?projectId=${projectId}`);
      const remarks = r?.data || [];
      if (!remarks.length) { toast('Aucune remarque client sur ce projet', 'warning'); return; }
      brfOpenPicker('⚠️ Choisir les remarques à inclure', remarks, rk => ({
        key:   rk.id,
        label: (rk.title || rk.description || '—').slice(0, 80),
        sub:   [rk.status, rk.priority, rk.createdAt ? new Date(rk.createdAt).toLocaleDateString('fr-FR') : null].filter(Boolean).join(' · '),
      }), selected => brfAddRemarksBlock(selected));
      return;
    }
  } catch (e) {
    toast('Erreur : ' + (e.message || e), 'error');
    console.error('[brf] pick error:', e);
  }
}

function vehicleLabel(t) {
  const map = { truck:'Camion', tautliner:'Tautliner', flatbed:'Flatbed', van:'Camionnette', crane:'Grue', scissor:'Nacelle', manitou:'Manitou', forklift:'Chariot', generator:'Groupe', machine:'Machine', other:'Véhicule' };
  return map[t] || 'Camion';
}
function phaseLabel(p) {
  return p === 'installation' ? 'install' : p === 'dismantling' ? 'démontage' : '';
}
function taskStatusLabel(s) {
  return s === 'completed' ? '✓ terminé' : s === 'in_progress' ? '↻ en cours' : '○ à faire';
}
function formatTruckSub(t) {
  const parts = [];
  if (t.loadingDate) {
    parts.push(new Date(t.loadingDate).toLocaleString('fr-FR', { weekday:'short', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }));
  }
  if (t.driverName) parts.push('👤 ' + t.driverName);
  if (t.licensePlate) parts.push('🪧 ' + t.licensePlate);
  return parts.join(' · ');
}

// ─── Modal sélecteur générique avec checkboxes ───
function brfOpenPicker(title, items, itemFormatter, onConfirm) {
  if (!items.length) { toast('Aucun élément', 'warning'); return; }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10020;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#1a1a1a;border:1px solid #444;border-radius:10px;padding:18px;max-width:640px;width:100%;max-height:80vh;display:flex;flex-direction:column;color:#eee;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <div style="font-size:15px;font-weight:700;">${title}</div>
        <button onclick="this.closest('div').parentElement.remove()" style="background:transparent;color:#eee;border:none;font-size:24px;cursor:pointer;padding:0;line-height:1;">×</button>
      </div>
      <div style="margin-bottom:10px;display:flex;gap:6px;">
        <button class="brf-pick-act" onclick="this.closest('div').parentElement.querySelectorAll('.brf-pick-cb').forEach(cb=>cb.checked=true)">Tout cocher</button>
        <button class="brf-pick-act" onclick="this.closest('div').parentElement.querySelectorAll('.brf-pick-cb').forEach(cb=>cb.checked=false)">Décocher</button>
        <div style="flex:1;"></div>
        <input id="brf-pick-search" placeholder="🔎 Rechercher..." style="background:#222;color:#eee;border:1px solid #444;border-radius:6px;padding:4px 10px;font-size:11px;max-width:200px;">
      </div>
      <div id="brf-pick-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:14px;padding-right:4px;">
        ${items.map((it, i) => {
          const f = itemFormatter(it, i);
          const escLabel = String(f.label).replace(/</g,'&lt;');
          const escSub   = String(f.sub || '').replace(/</g,'&lt;');
          return `<label class="brf-pick-row" data-search="${escLabel.toLowerCase()} ${escSub.toLowerCase()}" style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;background:#222;border:1px solid #333;border-radius:6px;cursor:pointer;">
            <input type="checkbox" class="brf-pick-cb" data-idx="${i}" checked style="accent-color:#e63946;margin-top:2px;width:16px;height:16px;flex-shrink:0;">
            <div style="flex:1;min-width:0;">
              <div style="font-size:12px;font-weight:600;">${escLabel}</div>
              ${escSub ? `<div style="font-size:11px;color:#aaa;margin-top:2px;">${escSub}</div>` : ''}
            </div>
          </label>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="this.closest('div').parentElement.remove()" style="background:transparent;color:#eee;border:1px solid #666;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">Annuler</button>
        <button id="brf-pick-confirm" style="background:#e63946;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">✅ Ajouter au canvas</button>
      </div>
      <style>
        .brf-pick-act { background:#333;color:#eee;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;}
        .brf-pick-row:hover { background:#2a2a2a; }
      </style>
    </div>
  `;
  document.body.appendChild(overlay);
  // Recherche live
  overlay.querySelector('#brf-pick-search').oninput = (e) => {
    const q = e.target.value.toLowerCase().trim();
    overlay.querySelectorAll('.brf-pick-row').forEach(row => {
      row.style.display = !q || (row.dataset.search || '').includes(q) ? '' : 'none';
    });
  };
  overlay.querySelector('#brf-pick-confirm').onclick = () => {
    const selected = [];
    overlay.querySelectorAll('.brf-pick-cb:checked').forEach(cb => {
      selected.push(items[parseInt(cb.dataset.idx)]);
    });
    overlay.remove();
    if (selected.length) onConfirm(selected);
    else toast('Aucun élément coché', 'warning');
  };
}
// Picker dédié à l'auto-génération du briefing : 3 issues possibles
//   • "✅ Générer avec ces fichiers" → resolve(arrayOfFiles)
//   • "Continuer sans fichiers"      → resolve([])
//   • "Annuler" ou X                 → resolve(null) → l'auto-gen est ABORTÉE
// Cette logique 3-way (vs le picker générique qui en a 2) justifie une fonction séparée.
function brfPickFilesForAutoGen(files) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:10020;display:flex;align-items:center;justify-content:center;padding:20px;';
    overlay.innerHTML = `
      <div style="background:#1a1a1a;border:1px solid #444;border-radius:10px;padding:18px;max-width:680px;width:100%;max-height:80vh;display:flex;flex-direction:column;color:#eee;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-size:15px;font-weight:700;">📁 Fichiers à inclure dans le briefing</div>
          <button id="brf-pickf-x" style="background:transparent;color:#eee;border:none;font-size:24px;cursor:pointer;padding:0;line-height:1;">×</button>
        </div>
        <div style="font-size:12px;color:#aaa;margin-bottom:12px;">${files.length} fichier(s) disponible(s) — coche ceux à inclure. Chaque fichier coché créera une slide dédiée dans le briefing.</div>

        <div style="display:flex;gap:6px;margin-bottom:10px;align-items:center;">
          <button class="brf-pickf-act" id="brf-pickf-all">Tout cocher</button>
          <button class="brf-pickf-act" id="brf-pickf-none">Décocher</button>
          <div style="flex:1;"></div>
          <input id="brf-pickf-search" placeholder="🔎 Rechercher..." style="background:#222;color:#eee;border:1px solid #444;border-radius:6px;padding:4px 10px;font-size:11px;max-width:200px;">
        </div>

        <div id="brf-pickf-list" style="flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-bottom:14px;padding-right:4px;">
          ${files.map((f, i) => {
            const ext = (f.fileName || f.fileUrl || '').split('.').pop().toLowerCase();
            const isImage = ['jpg','jpeg','png','gif','webp','heic','svg'].includes(ext);
            const icon = isImage ? '🖼️' : '📄';
            const escLabel = String(f.fileName || 'fichier').replace(/</g, '&lt;');
            return `<label class="brf-pickf-row" data-search="${escLabel.toLowerCase()}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#222;border:1px solid #333;border-radius:6px;cursor:pointer;">
              <input type="checkbox" class="brf-pickf-cb" data-idx="${i}" style="accent-color:#e63946;width:16px;height:16px;flex-shrink:0;">
              <div style="font-size:24px;flex-shrink:0;">${icon}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escLabel}</div>
                <div style="font-size:11px;color:#aaa;margin-top:2px;">${ext.toUpperCase()}${f.fileSize ? ' · '+Math.round(f.fileSize/1024)+' KB' : ''}</div>
              </div>
            </label>`;
          }).join('')}
        </div>

        <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;">
          <div id="brf-pickf-count" style="flex:1;font-size:11px;color:#aaa;">0 fichier(s) coché(s)</div>
          <button id="brf-pickf-cancel" style="background:transparent;color:#aaa;border:1px solid #555;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">Annuler</button>
          <button id="brf-pickf-skip" style="background:#333;color:#eee;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;">⏭️ Sans fichiers</button>
          <button id="brf-pickf-go" style="background:#e63946;color:#fff;border:none;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">✅ Générer</button>
        </div>
        <style>
          .brf-pickf-act { background:#333;color:#eee;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;}
          .brf-pickf-row:hover { background:#2a2a2a; }
        </style>
      </div>
    `;
    document.body.appendChild(overlay);

    const updateCount = () => {
      const n = overlay.querySelectorAll('.brf-pickf-cb:checked').length;
      overlay.querySelector('#brf-pickf-count').textContent = `${n} fichier(s) coché(s)`;
    };
    overlay.querySelectorAll('.brf-pickf-cb').forEach(cb => cb.addEventListener('change', updateCount));

    overlay.querySelector('#brf-pickf-all').onclick  = () => { overlay.querySelectorAll('.brf-pickf-cb').forEach(cb => cb.checked = true);  updateCount(); };
    overlay.querySelector('#brf-pickf-none').onclick = () => { overlay.querySelectorAll('.brf-pickf-cb').forEach(cb => cb.checked = false); updateCount(); };

    overlay.querySelector('#brf-pickf-search').oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      overlay.querySelectorAll('.brf-pickf-row').forEach(row => {
        row.style.display = !q || (row.dataset.search || '').includes(q) ? '' : 'none';
      });
    };

    const cancel = () => { overlay.remove(); resolve(null); };
    overlay.querySelector('#brf-pickf-cancel').onclick = cancel;
    overlay.querySelector('#brf-pickf-x').onclick      = cancel;
    overlay.addEventListener('click', e => { if (e.target === overlay) cancel(); });

    overlay.querySelector('#brf-pickf-skip').onclick = () => { overlay.remove(); resolve([]); };

    overlay.querySelector('#brf-pickf-go').onclick = () => {
      const selected = [];
      overlay.querySelectorAll('.brf-pickf-cb:checked').forEach(cb => {
        selected.push(files[parseInt(cb.dataset.idx)]);
      });
      overlay.remove();
      resolve(selected);
    };
  });
}

// ─── Générateurs de blocs Fabric depuis les données projet ───
// Utilise fabric.Textbox (multi-ligne avec wrap auto) pour rester éditable.
function brfAddTextbox(content, options = {}) {
  // Position : trouve une zone libre approximative
  const t = new fabric.Textbox(content, {
    left:       options.left ?? 100 + (BRF_STUDIO.fabricCanvas.getObjects().length * 18) % 200,
    top:        options.top  ?? 100 + (BRF_STUDIO.fabricCanvas.getObjects().length * 18) % 200,
    width:      options.width || 520,
    fontSize:   options.fontSize || 16,
    fontFamily: 'Helvetica',
    fill:       options.fill || '#222',
    lineHeight: 1.35,
    splitByGrapheme: false,
    textAlign:  options.textAlign || 'left',
  });
  BRF_STUDIO.fabricCanvas.add(t).setActiveObject(t);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
  return t;
}

function brfAddInfoBlock(p) {
  const lines = [];
  lines.push(`🏷️ ${(p.name || 'Projet').toUpperCase()}`);
  if (p.internalNumber) lines.push(`Ref : ${p.internalNumber}`);
  lines.push('');
  if (p.client?.name) lines.push(`Client : ${p.client.name}`);
  if (p.address) lines.push(`📍 ${p.address}${p.city ? ', ' + p.city : ''}`);
  if (p.installationStart) {
    lines.push(`📅 Install : ${brfFmtDateTime(p.installationStart)} → ${brfFmtDateTime(p.installationEnd)}`);
  }
  if (p.dismantlingStart) {
    lines.push(`🔨 Démontage : ${brfFmtDateTime(p.dismantlingStart)} → ${brfFmtDateTime(p.dismantlingEnd)}`);
  }
  brfAddTextbox(lines.join('\n'), { width: 480, fontSize: 18 });
}

function brfAddPlanningBlock(p) {
  const lines = ['📅 PLANNING', ''];
  // Format : "lundi 22 juin 2026 à 08:00"
  const fmt = d => {
    if (!d) return '?';
    const weekday = new Date(d).toLocaleDateString('fr-FR', { weekday:'long' });
    return weekday + ' ' + brfFmtDateTime(d);
  };
  if (p.installationStart) {
    lines.push('INSTALLATION');
    lines.push(`  Début : ${fmt(p.installationStart)}`);
    lines.push(`  Fin   : ${fmt(p.installationEnd)}`);
    lines.push('');
  }
  if (p.dismantlingStart) {
    lines.push('DÉMONTAGE');
    lines.push(`  Début : ${fmt(p.dismantlingStart)}`);
    lines.push(`  Fin   : ${fmt(p.dismantlingEnd)}`);
  }
  brfAddTextbox(lines.join('\n'), { width: 480, fontSize: 18 });
}

