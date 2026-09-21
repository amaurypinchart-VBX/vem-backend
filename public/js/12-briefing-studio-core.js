async function openPickContactFromClients(slideIdx, bi) {
  const res = await api('GET', '/clients');
  if (!res?.success) { toast('Impossible de récupérer les clients', 'error'); return; }
  const clients = res.data || [];
  // Le client du projet courant en premier, le reste après
  const currentClientId = BRIEFING_AUTO.project?.clientId;
  const sorted = [...clients].sort((a, b) => {
    if (a.id === currentClientId) return -1;
    if (b.id === currentClientId) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const overlay = document.createElement('div');
  overlay.className = 'overlay open';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px;">
      <div class="modal-head">
        <div class="modal-title">🤝 Choisir un contact client</div>
        <button class="modal-close" onclick="this.closest('.overlay').remove()">×</button>
      </div>

      <input id="pkc-search" class="input" placeholder="🔎 Rechercher un client ou un contact..." style="margin-bottom:10px;" oninput="filterPickContactsList(this.value)">

      <div style="max-height:55vh;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:6px;background:var(--bg3);">
        ${sorted.length === 0 ? '<div style="text-align:center;color:var(--text3);padding:20px;font-size:13px;">Aucun client en base.</div>' : ''}
        ${sorted.map(c => {
          const isProjectClient = c.id === currentClientId;
          // On ne propose le contact que si on a au moins email OU téléphone OU nom de contact
          if (!c.contactName && !c.email && !c.phone) return `
            <div class="pkc-row" data-search="${esc((c.name||'').toLowerCase())}" style="padding:10px;opacity:.5;border-bottom:1px solid var(--border);font-size:13px;">
              ${esc(c.name||'Client sans nom')} <span style="color:var(--text3);font-size:11px;">(pas de coordonnées renseignées)</span>
            </div>`;
          return `
            <div class="pkc-row" data-search="${esc(((c.name||'')+' '+(c.contactName||'')+' '+(c.email||'')).toLowerCase())}" style="padding:10px;border-bottom:1px solid var(--border);border-left:3px solid ${isProjectClient?'var(--accent)':'transparent'};">
              <div style="font-weight:700;font-size:13px;margin-bottom:4px;">
                ${esc(c.name||'—')}${isProjectClient?' <span style="font-size:10px;color:var(--accent);background:var(--accent)20;padding:1px 6px;border-radius:99px;font-weight:600;">CLIENT DU PROJET</span>':''}
              </div>
              <div style="font-size:12px;color:var(--text2);margin-bottom:6px;">
                ${c.contactName?`👤 ${esc(c.contactName)}`:''}
                ${c.phone?`  📞 ${esc(c.phone)}`:''}
                ${c.email?`  ✉️ ${esc(c.email)}`:''}
              </div>
              <button class="btn btn-primary btn-sm" onclick='pickThisContact(${slideIdx},${bi},${JSON.stringify({
                name: c.contactName || c.name || '',
                role: c.contactName ? `Contact (${c.name||''})` : 'Société cliente',
                phone: c.phone || '',
                email: c.email || ''
              }).replace(/"/g,"&quot;")})'>+ Ajouter ce contact</button>
            </div>`;
        }).join('')}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Fermer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  // Pas de fermeture au clic sur le fond (voir 03-create-forms.js) — évite la perte de saisie sur un scroll/swipe mobile mal interprété.
}

function filterPickContactsList(q) {
  q = (q || '').toLowerCase().trim();
  document.querySelectorAll('.pkc-row').forEach(row => {
    const s = row.dataset.search || '';
    row.style.display = !q || s.includes(q) ? '' : 'none';
  });
}

function pickThisContact(slideIdx, bi, contactData) {
  const block = CURRENT_BRIEFING.slides[slideIdx].blocks[bi];
  if (!block.contacts) block.contacts = [];
  block.contacts.push(contactData);
  toast(`${contactData.name} ajouté`, 'success');
  // Fermer la modal et rafraîchir
  document.querySelector('.overlay.open')?.remove();
  renderBriefing();
}


// ═══════════════════════════════════════════════════════════
// 🎨 BRIEFING STUDIO — Éditeur visuel canvas (Canva-like)
// ═══════════════════════════════════════════════════════════
// Stack : Fabric.js 5.x (canvas + drag/resize/rotate) + jsPDF (export)
// Stocké dans le même modèle Briefing, dans le champ `slides` JSON
// avec un objet { version: 2, logoUrl, slides: [{id, name, json}] }.
// ═══════════════════════════════════════════════════════════════
// Design Template Viewbox — constantes + helpers de rendu
// ═══════════════════════════════════════════════════════════════
// Format date+heure pour les briefings : "22 juin 2026 à 08:00"
// Si seulement la date est disponible (pas d'heure), retombe sur date seule.
function brfFmtDateTime(d) {
  if (!d) return '?';
  const dt = new Date(d);
  // Heure 00:00 = probablement "pas d'heure définie" → date seule
  if (dt.getHours() === 0 && dt.getMinutes() === 0) {
    return dt.toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });
  }
  return dt.toLocaleString('fr-FR', { day:'2-digit', month:'long', year:'numeric', hour:'2-digit', minute:'2-digit' });
}

// Variante courte (sans année) pour les tableaux
function brfFmtDateTimeShort(d) {
  if (!d) return '?';
  const dt = new Date(d);
  if (dt.getHours() === 0 && dt.getMinutes() === 0) {
    return dt.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
  }
  return dt.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
}
const BRF_TPL = {
  NAVY:        '#000a3d',
  NAVY_BORDER: '#4a6dba',
  BG:          '#e8e8e8',
  LOGO_URL:    '/logo.png',
};

// Logo préchargé une seule fois en DOM Image (pas d'async dans la génération de slides)
let BRF_TPL_LOGO_IMG = null;
function brfPreloadLogo() {
  return new Promise((resolve) => {
    if (BRF_TPL_LOGO_IMG) { resolve(BRF_TPL_LOGO_IMG); return; }
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload  = () => { BRF_TPL_LOGO_IMG = im; resolve(im); };
    im.onerror = () => { console.warn('[brf] Logo non chargé:', BRF_TPL.LOGO_URL); resolve(null); };
    im.src = BRF_TPL.LOGO_URL;
  });
}

// Ajoute le logo en haut-droite. SYNCHRONE — utilise l'image DOM préchargée.
// Si le logo n'est pas encore préchargé, ne rien faire (graceful).
function brfAddLogoTopRight(width) {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv || !BRF_TPL_LOGO_IMG) return;
  const fImg = new fabric.Image(BRF_TPL_LOGO_IMG);
  fImg.scaleToWidth(width || 220);
  fImg.set({
    left: BRF_CANVAS_W - fImg.getScaledWidth() - 30,
    top: 30,
    selectable: false, evented: false,
  });
  cv.add(fImg);
}

// Ajoute le watermark "WB" en bas-droite. SYNCHRONE.
// Mesure la largeur réelle du texte pour qu'il ne dépasse jamais du canvas.
function brfAddWatermarkBottomRight() {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv) return;
  const wb = new fabric.IText('WB', {
    fontSize: 150, fontFamily: 'Helvetica', fontWeight: '900',
    fill: '#ffffff', opacity: 0.85,
    selectable: false, evented: false,
  });
  // wb.width et wb.height sont calculés par Fabric à la création
  wb.set({
    left: BRF_CANVAS_W - wb.width - 30,
    top:  BRF_CANVAS_H - wb.height - 20,
  });
  cv.add(wb);
}

// Applique le template Viewbox standard à la slide courante (encadré titre + logo + watermark + fond)
// Le titre est éditable, le reste est verrouillé. TOUT SYNCHRONE.
function brfApplyStandardTemplate(title) {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv) return;

  // 1. Fond gris clair
  cv.setBackgroundColor(BRF_TPL.BG, () => {});

  // 2. Encadré titre (taille adaptée au texte)
  if (title) {
    const tempText = new fabric.IText(String(title), {
      fontSize: 36, fontFamily: 'Helvetica', fontWeight: 'bold',
    });
    const textWidth = tempText.width;
    const padX = 36;
    const frameW = Math.max(textWidth + padX * 2, 220);
    const frameH = 90;

    cv.add(new fabric.Rect({
      left: 60, top: 50, width: frameW, height: frameH,
      fill: BRF_TPL.NAVY, stroke: BRF_TPL.NAVY_BORDER, strokeWidth: 3,
      rx: 12, ry: 12,
      selectable: false, evented: false,
    }));
    cv.add(new fabric.IText(String(title), {
      left: 60 + padX,
      top: 50 + (frameH - 40) / 2,
      fontSize: 36, fontFamily: 'Helvetica', fontWeight: 'bold',
      fill: '#ffffff',
    }));
  }

  // 3. Logo top-right (SYNCHRONE via image préchargée)
  brfAddLogoTopRight();

  // 4. Watermark "WB" bottom-right (SYNCHRONE)
  brfAddWatermarkBottomRight();

  cv.requestRenderAll();
}

// Rend un tableau Fabric (header bleu marine + lignes alternées)
function brfRenderDataTable(opts) {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv) return;
  const headers      = opts.headers      || [];
  const rows         = opts.rows         || [];
  const colWidths    = opts.colWidths    || headers.map(() => 200);
  const rowHeight    = opts.rowHeight    || 40;
  const headerHeight = opts.headerHeight || 46;
  const startX       = opts.x || 60;
  const startY       = opts.y || 200;
  const totalWidth   = colWidths.reduce((s, w) => s + w, 0);
  let y = startY;

  // Header
  cv.add(new fabric.Rect({
    left: startX, top: y, width: totalWidth, height: headerHeight,
    fill: BRF_TPL.NAVY, rx: 6, ry: 6,
    selectable: false, evented: false,
  }));
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    cv.add(new fabric.Textbox(String(headers[i] ?? ''), {
      left: x + 14, top: y + 14, width: colWidths[i] - 28,
      fontSize: 14, fontFamily: 'Helvetica', fontWeight: 'bold',
      fill: '#ffffff', selectable: false, evented: false,
    }));
    x += colWidths[i];
  }
  y += headerHeight + 4;

  // Rows
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    cv.add(new fabric.Rect({
      left: startX, top: y, width: totalWidth, height: rowHeight,
      fill: ri % 2 === 0 ? '#ffffff' : '#f4f4f4',
      stroke: '#ddd', strokeWidth: 1,
      selectable: false, evented: false,
    }));
    x = startX;
    for (let ci = 0; ci < row.length; ci++) {
      cv.add(new fabric.Textbox(String(row[ci] ?? ''), {
        left: x + 14, top: y + 11, width: colWidths[ci] - 28,
        fontSize: 13, fontFamily: 'Helvetica',
        fill: '#222', selectable: false, evented: false,
      }));
      x += colWidths[ci];
    }
    y += rowHeight;
  }
  cv.requestRenderAll();
  return y;
}
// ═══════════════════════════════════════════════════════════════
// Map helpers — géocodage robuste + image OSM + fallback manuel
// ═══════════════════════════════════════════════════════════════

// Déduplique les parties d'une adresse (insensible à la casse)
// ex: "Messestraße 1, 12529 Schönefeld, Allemagne, Allemagne" → "Messestraße 1, 12529 Schönefeld, Allemagne"
function brfDedupAddressParts(address) {
  const seen = new Set();
  return address.split(',')
    .map(s => s.trim())
    .filter(s => {
      const key = s.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(', ');
}

// Construit des variations d'une adresse, de la plus précise à la plus générale
function brfBuildAddressVariations(address) {
  const variations = [];
  variations.push(address);
  const dedup = brfDedupAddressParts(address);
  if (dedup !== address) variations.push(dedup);

  const parts = dedup.split(',').map(s => s.trim()).filter(Boolean);

  // Sans le dernier élément (généralement le pays)
  if (parts.length > 1) variations.push(parts.slice(0, -1).join(', '));
  // Juste les 2 derniers (ville + pays)
  if (parts.length > 2) variations.push(parts.slice(-2).join(', '));
  // Code postal + pays (si on peut extraire un code postal)
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    const cityPart = parts[parts.length - 2].match(/(\d{4,5})\s+(.+)/);
    if (cityPart) variations.push(`${cityPart[1]} ${cityPart[2]}, ${last}`);
  }

  return [...new Set(variations)];
}

// Géocode une adresse via Nominatim (essaie les variations en cas d'échec)
async function brfGeocodeAddress(address) {
  if (!address) return null;
  const variations = brfBuildAddressVariations(address);
  for (let i = 0; i < variations.length; i++) {
    const variant = variations[i];
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(variant)}&limit=1`;
      const r = await fetch(url, { headers: { 'Accept-Language': 'fr' } });
      const data = await r.json();
      if (Array.isArray(data) && data.length > 0) {
        console.log('[brf] adresse géocodée via la variante :', variant);
        return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      }
    } catch (e) {
      console.warn('[brf] erreur géocodage pour :', variant, e);
    }
    if (i < variations.length - 1) await new Promise(r => setTimeout(r, 250));  // throttle Nominatim
  }
  return null;
}

// Parse un lien Google Maps pour en extraire des coordonnées
function brfParseGoogleMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  // @LAT,LON,Zoom (format le plus courant dans l'URL bar Google Maps)
  let m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  // ?q=LAT,LON
  m = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  // !3dLAT!4dLON (Google Maps embed)
  m = url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  return null;
}

// MapTiler API key — restreindre par HTTP origin dans le dashboard MapTiler
// (sinon n'importe qui peut utiliser ta clé en copiant ton code source)
// Geoapify API key — gratuit 3000 requêtes/jour
const BRF_GEOAPIFY_KEY = 'b7848fefea234db3a4c4fa9628aa5cad';
const BRF_MAP_STYLE = 'osm-bright';  // ou: osm-carto, klokantech-basic, positron, dark-matter, toner

// Construit l'URL de l'image statique Geoapify
function brfStaticMapUrl(lat, lon, opts) {
  opts = opts || {};
  const zoom = opts.zoom || 15;
  const w = opts.width || 1100;
  const h = opts.height || 600;
  if (!BRF_GEOAPIFY_KEY || BRF_GEOAPIFY_KEY.length < 10) {
    console.warn('[brf] BRF_GEOAPIFY_KEY manquante — la carte ne se chargera pas');
    return null;
  }
  return `https://maps.geoapify.com/v1/staticmap?style=${BRF_MAP_STYLE}&width=${w}&height=${h}&center=lonlat:${lon},${lat}&zoom=${zoom}&apiKey=${BRF_GEOAPIFY_KEY}`;
}
// Ajoute le plan au canvas à partir de coordonnées GPS
async function brfAddMapImageByCoords(lat, lon, x, y, targetWidth) {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv) return y;
  const mapUrl = brfStaticMapUrl(lat, lon, { zoom: 15, width: 1100, height: 600 });
  if (!mapUrl) return y;
  console.log('[brf] map URL:', mapUrl);

  return new Promise(resolve => {
    let resolved = false;
    const fail = () => { if (resolved) return; resolved = true; resolve(y); };
    const timer = setTimeout(fail, 15000);
    const tryLoad = (useCors) => {
      const img = new Image();
      if (useCors) img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try {
          const fImg = new fabric.Image(img);
          fImg.scaleToWidth(targetWidth || 1100);
          fImg.set({
            left: x || 60, top: y || 200,
            selectable: true, evented: true,
          });
          cv.add(fImg);

          // Marqueur rouge au centre de l'image (= position géocodée)
          const cx = (x || 60) + fImg.getScaledWidth() / 2;
          const cy = (y || 200) + fImg.getScaledHeight() / 2;
          const marker = new fabric.Circle({
            left: cx - 14, top: cy - 28,
            radius: 14, fill: '#e63946',
            stroke: '#ffffff', strokeWidth: 4,
            selectable: true, evented: true,
          });
          cv.add(marker);

          cv.requestRenderAll();
          resolve((y || 200) + fImg.getScaledHeight() + 20);
        } catch (e) { console.warn('[brf]', e); resolve(y); }
      };
      img.onerror = () => {
        if (useCors) tryLoad(false);
        else { console.warn('[brf] échec chargement plan. URL:', mapUrl); fail(); }
      };
      img.src = mapUrl;
    };
    tryLoad(true);
  });
}
// Ajoute le plan au canvas à partir d'une adresse (géocode d'abord)
async function brfAddMapToCanvas(address, x, y, targetWidth) {
  if (!address) return y;
  const coords = await brfGeocodeAddress(address);
  if (!coords) {
    console.warn('[brf] adresse non géocodable:', address);
    return y;
  }
  return brfAddMapImageByCoords(coords.lat, coords.lon, x, y, targetWidth);
}

// Demande manuellement une localisation : adresse, coords GPS, ou lien Google Maps
async function brfPromptForLocationAndAddMap(x, y, targetWidth) {
  const input = prompt(
    '🗺️  Placer une carte sur la slide\n\n' +
    'Colle au choix :\n' +
    '• Une adresse (ex: "Berlin Messezentrum, Allemagne")\n' +
    '• Des coordonnées GPS (ex: "52.5074,13.5414")\n' +
    '• Un lien Google Maps complet (copié depuis l\'URL bar)\n\n' +
    'Astuce : sur Google Maps, fais clic-droit sur l\'endroit voulu → "Copier les coordonnées" → colle ici.'
  );
  if (!input || !input.trim()) return y;

  let coords = brfParseGoogleMapsUrl(input);
  if (!coords) {
    const m = input.match(/^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$/);
    if (m) coords = { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
  }
  if (!coords) coords = await brfGeocodeAddress(input);

  if (!coords) {
    alert('Impossible de localiser. Réessaie avec :\n• Une adresse plus standard (rue + ville + pays)\n• Ou des coordonnées GPS (lat,lon)');
    return y;
  }
  return brfAddMapImageByCoords(coords.lat, coords.lon, x || 90, y || 200, targetWidth || 1100);
}
// ⚡ Démarrer le préchargement du logo dès le chargement du script
// → au moment où le user ouvre le Studio, le logo est déjà prêt en DOM
brfPreloadLogo();
const BRF_STUDIO_VERSION = 2;
const BRF_CANVAS_W = 1280;
const BRF_CANVAS_H = 720;
let BRF_STUDIO = null;

// Démarre un nouveau briefing Studio (depuis le mode classique)
function briefingStudioStart() {
  if (!CURRENT_BRIEFING?.id) { toast('Aucun briefing ouvert', 'error'); return; }
  // Si un contenu Studio existe déjà → on le reprend (pas de redémarrage à zéro)
  const existing = CURRENT_BRIEFING?.studioSlides;
  if (existing && existing.version === 2 && Array.isArray(existing.slides) && existing.slides.length > 0) {
    openBriefingStudio({ ...existing, __briefingId: CURRENT_BRIEFING.id });
    return;
  }
  // Sinon → première ouverture du Studio pour ce briefing : 1 slide vide
  openBriefingStudio({
    version: BRF_STUDIO_VERSION,
    title: CURRENT_BRIEFING?.title || 'Briefing',
    logoUrl: null,
    slides: [{ id: 'slide-' + Date.now(), name: 'Slide 1', json: null }],
    __briefingId: CURRENT_BRIEFING.id,
  });
}

async function openBriefingStudio(initialData) {
  if (typeof fabric === 'undefined') {
    toast('Chargement Fabric.js...', 'info');
    await new Promise(r => {
      const check = () => (typeof fabric !== 'undefined') ? r() : setTimeout(check, 100);
      check();
    });
  }

  // Récupère le logo global (s'il y en a un) — utilisé par défaut si pas de logo spécifique
  let globalLogo = null;
  try {
    const r = await api('GET', '/settings/briefing-default-logo');
    if (r?.success && r.data?.url) globalLogo = r.data.url;
  } catch {}
// ═══════════════════════════════════════════════════════════════
// Design Template Viewbox — constantes + helpers de rendu
// ═══════════════════════════════════════════════════════════════
const BRF_TPL = {
  NAVY:        '#000a3d',
  NAVY_BORDER: '#4a6dba',
  BG:          '#e8e8e8',
  LOGO_URL:    '/logo.png',
};

// Logo préchargé une seule fois en DOM Image (évite les race conditions async)
let BRF_TPL_LOGO_IMG = null;
function brfPreloadLogo() {
  return new Promise((resolve) => {
    if (BRF_TPL_LOGO_IMG) { resolve(BRF_TPL_LOGO_IMG); return; }
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload  = () => { BRF_TPL_LOGO_IMG = im; resolve(im); };
    im.onerror = () => { console.warn('[brf] Logo non chargé:', BRF_TPL.LOGO_URL); resolve(null); };
    im.src = BRF_TPL.LOGO_URL;
  });
}

// Ajoute le logo en haut-droite (synchrone via image préchargée)
function brfAddLogoTopRight(width) {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv || !BRF_TPL_LOGO_IMG) return;
  const fImg = new fabric.Image(BRF_TPL_LOGO_IMG);
  fImg.scaleToWidth(width || 220);
  fImg.set({
    left: BRF_CANVAS_W - fImg.getScaledWidth() - 30,
    top: 30,
    selectable: false, evented: false,
  });
  cv.add(fImg);
}

// Ajoute le watermark "WB" en bas-droite (positionné précisément pour ne pas déborder)
function brfAddWatermarkBottomRight() {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv) return;
  const wb = new fabric.IText('WB', {
    fontSize: 150, fontFamily: 'Helvetica', fontWeight: '900',
    fill: '#ffffff', opacity: 0.85,
    selectable: false, evented: false,
  });
  wb.set({
    left: BRF_CANVAS_W - wb.width - 30,
    top:  BRF_CANVAS_H - wb.height - 20,
  });
  cv.add(wb);
}

// Applique le template Viewbox standard à la slide courante : fond gris + encadré titre bleu + logo + watermark
function brfApplyStandardTemplate(title) {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv) return;

  cv.setBackgroundColor(BRF_TPL.BG, () => {});

  if (title) {
    const tempText = new fabric.IText(String(title), {
      fontSize: 36, fontFamily: 'Helvetica', fontWeight: 'bold',
    });
    const textWidth = tempText.width;
    const padX = 36;
    const frameW = Math.max(textWidth + padX * 2, 220);
    const frameH = 90;

    cv.add(new fabric.Rect({
      left: 60, top: 50, width: frameW, height: frameH,
      fill: BRF_TPL.NAVY, stroke: BRF_TPL.NAVY_BORDER, strokeWidth: 3,
      rx: 12, ry: 12,
      selectable: false, evented: false,
    }));
    cv.add(new fabric.IText(String(title), {
      left: 60 + padX,
      top: 50 + (frameH - 40) / 2,
      fontSize: 36, fontFamily: 'Helvetica', fontWeight: 'bold',
      fill: '#ffffff',
    }));
  }

  brfAddLogoTopRight();
  brfAddWatermarkBottomRight();

  cv.requestRenderAll();
}

// Rend un tableau Fabric (header bleu marine + lignes alternées)
function brfRenderDataTable(opts) {
  const cv = BRF_STUDIO?.fabricCanvas;
  if (!cv) return;
  const headers      = opts.headers      || [];
  const rows         = opts.rows         || [];
  const colWidths    = opts.colWidths    || headers.map(() => 200);
  const rowHeight    = opts.rowHeight    || 40;
  const headerHeight = opts.headerHeight || 46;
  const startX       = opts.x || 60;
  const startY       = opts.y || 200;
  const totalWidth   = colWidths.reduce((s, w) => s + w, 0);
  let y = startY;

  cv.add(new fabric.Rect({
    left: startX, top: y, width: totalWidth, height: headerHeight,
    fill: BRF_TPL.NAVY, rx: 6, ry: 6,
    selectable: false, evented: false,
  }));
  let x = startX;
  for (let i = 0; i < headers.length; i++) {
    cv.add(new fabric.Textbox(String(headers[i] ?? ''), {
      left: x + 14, top: y + 14, width: colWidths[i] - 28,
      fontSize: 14, fontFamily: 'Helvetica', fontWeight: 'bold',
      fill: '#ffffff', selectable: false, evented: false,
    }));
    x += colWidths[i];
  }
  y += headerHeight + 4;

  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    cv.add(new fabric.Rect({
      left: startX, top: y, width: totalWidth, height: rowHeight,
      fill: ri % 2 === 0 ? '#ffffff' : '#f4f4f4',
      stroke: '#ddd', strokeWidth: 1,
      selectable: false, evented: false,
    }));
    x = startX;
    for (let ci = 0; ci < row.length; ci++) {
      cv.add(new fabric.Textbox(String(row[ci] ?? ''), {
        left: x + 14, top: y + 11, width: colWidths[ci] - 28,
        fontSize: 13, fontFamily: 'Helvetica',
        fill: '#222', selectable: false, evented: false,
      }));
      x += colWidths[ci];
    }
    y += rowHeight;
  }
  cv.requestRenderAll();
  return y;
}

// ⚡ Démarrer le préchargement du logo dès le chargement du script
brfPreloadLogo();
  BRF_STUDIO = {
    fabricCanvas: null,
    slides: Array.isArray(initialData?.slides) && initialData.slides.length
      ? initialData.slides
      : [{ id: 'slide-' + Date.now(), name: 'Slide 1', json: null }],
    curIdx: 0,
    // Logo spécifique de CE briefing > logo global Viewbox > rien
    logoUrl: initialData?.logoUrl || globalLogo || null,
    globalLogoUrl: globalLogo,
    title: initialData?.title || 'Briefing',
    projectId: CURRENT_PROJECT_ID,
    briefingId: initialData?.__briefingId || CURRENT_BRIEFING?.id || null,
    undoStack: [],
    redoStack: [],
    suppressSnapshot: false,
  };

  const overlay = document.createElement('div');
  overlay.id = 'brf-studio-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:#1a1a1a;color:#eee;z-index:10000;display:flex;flex-direction:column;';
  overlay.innerHTML = buildStudioHTML();
  document.body.appendChild(overlay);

  // Init Fabric canvas
await brfPreloadLogo();
  BRF_STUDIO.fabricCanvas = new fabric.Canvas('brf-studio-canvas', {    width: BRF_CANVAS_W,
    height: BRF_CANVAS_H,
    backgroundColor: '#ffffff',
    selection: true,
    preserveObjectStacking: true,
  });

  // Listeners pour undo/redo et thumbnails
  ['object:modified', 'object:added', 'object:removed'].forEach(evt => {
    BRF_STUDIO.fabricCanvas.on(evt, () => brfSnapshot());
  });

  // Anti-déformation du texte + synchro de la barre d'outils
  BRF_STUDIO.fabricCanvas.on('object:scaling', e => brfLiveTextScale(e.target));
  BRF_STUDIO.fabricCanvas.on('object:added', e => brfSetupTextObject(e.target));
  ['selection:created','selection:updated','object:modified'].forEach(evt => {
    BRF_STUDIO.fabricCanvas.on(evt, () => {
      const o = BRF_STUDIO.fabricCanvas.getActiveObject();
      brfSetupTextObject(o); brfSyncTextControls(o);
    });
  });

  loadSlideIntoCanvas(0);
  renderStudioSidebar();
  resizeStudioCanvas();
  brfUpdateUndoButtons();
  window.addEventListener('resize', resizeStudioCanvas);
  document.addEventListener('keydown', handleStudioKeydown);
}

function buildStudioHTML() {
  return `
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:10px;padding:10px 16px;background:#0f0f0f;border-bottom:1px solid #333;flex-wrap:wrap;">
      <strong style="font-size:14px;">🎨 Briefing Studio</strong>
      <input id="brf-st-title" value="${(BRF_STUDIO?.title||'Briefing').replace(/"/g,'&quot;')}"
        style="background:#222;color:#eee;border:1px solid #444;border-radius:6px;padding:6px 10px;font-size:13px;max-width:280px;"
        oninput="BRF_STUDIO.title=this.value">
      <button class="btn btn-sm" onclick="brfAutoGenerateBriefing(this)" title="Génère automatiquement un briefing complet à partir des données du projet" style="background:linear-gradient(135deg,#7b2cbf,#c77dff);color:#fff;border:none;font-weight:600;">🪄 Auto-générer</button>
      <div style="flex:1;"></div>
      <button class="btn btn-outline btn-sm" onclick="briefingStudioExportPDF(this)" style="border-color:#666;color:#eee;background:#222;">📄 PDF</button>
      <button class="btn btn-primary btn-sm" onclick="briefingStudioSave()">💾 Sauvegarder</button>
      <button onclick="briefingStudioClose()" style="background:transparent;color:#eee;border:none;font-size:22px;cursor:pointer;padding:0 8px;">✕</button>
    </div>

    <!-- Toolbar -->
    <div style="display:flex;align-items:center;gap:4px;padding:6px 16px;background:#161616;border-bottom:1px solid #333;flex-wrap:wrap;">
      <button class="brf-tbtn" onclick="brfUndo()" title="Annuler (Ctrl+Z)" id="brf-undo-btn">↶</button>
      <button class="brf-tbtn" onclick="brfRedo()" title="Rétablir (Ctrl+Y)" id="brf-redo-btn">↷</button>
      <span class="brf-sep"></span>
      <button class="brf-tbtn" onclick="brfAddText()" title="Ajouter du texte">📝 Texte</button>
      <button class="brf-tbtn" onclick="brfAddTitle()" title="Ajouter un titre">🔤 Titre</button>
     <button class="brf-tbtn" onclick="document.getElementById('brf-image-input').click()" title="Image ou PDF">🖼️ Image/PDF</button>
      <input type="file" id="brf-image-input" accept="image/*,application/pdf" style="display:none;" onchange="brfAddImage(this.files[0]);this.value='';">
      <span class="brf-sep"></span>
      <button class="brf-tbtn" onclick="brfAddRect()" title="Rectangle">▭</button>
      <button class="brf-tbtn" onclick="brfAddCircle()" title="Cercle">⭕</button>
      <button class="brf-tbtn" onclick="brfAddLine()" title="Ligne">— Ligne</button>
      <button class="brf-tbtn" onclick="brfAddArrow()" title="Flèche">➜ Flèche</button>
      <span class="brf-sep"></span>
      <button class="brf-tbtn" onclick="brfOpenProjectMenu(this)" title="Insérer depuis les données du projet" style="background:linear-gradient(135deg,#0a2540,#1a3a60);">📂 Depuis projet ▾</button>
      <button class="brf-tbtn" onclick="brfOpenTemplatesMenu(this)" title="Templates de slides prêts à l'emploi" style="background:linear-gradient(135deg,#7b2cbf,#9d4edd);">🎨 Templates ▾</button>
      <button class="brf-tbtn" onclick="brfImportFromClassic()" title="Importer les slides du Briefing Classique" style="background:linear-gradient(135deg,#2d6a4f,#40916c);">📥 Depuis Classique</button>
      <span class="brf-sep"></span>
      <button class="brf-tbtn" onclick="brfBringForward()" title="Avancer">⬆</button>
      <button class="brf-tbtn" onclick="brfSendBack()" title="Reculer">⬇</button>
      <button class="brf-tbtn" onclick="brfCopySel()" title="Copier (Ctrl+C)">📋</button>
      <button class="brf-tbtn" onclick="brfPasteSel()" title="Coller (Ctrl+V)">📥</button>
      <button class="brf-tbtn" onclick="brfDuplicateSel()" title="Dupliquer">⎘</button>
      <button class="brf-tbtn" onclick="brfDeleteSel()" title="Supprimer (Suppr)" style="color:#e63946;">🗑️</button>
      <span class="brf-sep"></span>
      <label style="font-size:11px;color:#aaa;">Couleur :</label>
      <input type="color" id="brf-color" value="#222222" onchange="brfApplyColor(this.value)" style="width:28px;height:24px;border:none;cursor:pointer;background:transparent;">
      <label style="font-size:11px;color:#aaa;margin-left:6px;">Police :</label>
      <select id="brf-fontfamily" onchange="brfApplyFont(this.value)" style="font-size:11px;padding:3px 4px;background:#222;color:#eee;border:1px solid #444;border-radius:4px;">
        <option value="Helvetica">Helvetica</option>
        <option value="Arial">Arial</option>
        <option value="Verdana">Verdana</option>
        <option value="Trebuchet MS">Trebuchet MS</option>
        <option value="Georgia">Georgia</option>
        <option value="Times New Roman">Times New Roman</option>
        <option value="Courier New">Courier New</option>
        <option value="Impact">Impact</option>
        <option value="Comic Sans MS">Comic Sans</option>
      </select>
      <label style="font-size:11px;color:#aaa;margin-left:6px;">Taille :</label>
      <button class="brf-tbtn" onclick="brfBumpFontSize(-2)" title="Réduire" style="padding:5px 8px;">−</button>
      <input type="number" id="brf-fontsize" value="24" min="8" max="200" onchange="brfApplyFontSize(this.value)" style="width:50px;font-size:11px;padding:3px 6px;background:#222;color:#eee;border:1px solid #444;border-radius:4px;">
      <button class="brf-tbtn" onclick="brfBumpFontSize(2)" title="Augmenter" style="padding:5px 8px;">+</button>
      <button class="brf-tbtn" onclick="brfToggleBold()" title="Gras"><b>B</b></button>
      <button class="brf-tbtn" onclick="brfToggleItalic()" title="Italique"><i>I</i></button>
      <span class="brf-sep"></span>
      <button class="brf-tbtn" onclick="brfOpenLogoMenu(this)" title="Gestion du logo de fond">📌 Logo ▾</button>
    </div>

    <style>
      .brf-tbtn { background:#222;color:#eee;border:1px solid #444;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px;}
      .brf-tbtn:hover { background:#333; }
      .brf-sep { border-left:1px solid #444; padding-left:6px; margin-left:2px; height:18px; display:inline-block;}
    </style>

    <!-- Main area -->
    <div style="display:flex;flex:1;overflow:hidden;">
      <!-- Sidebar -->
      <div style="width:200px;background:#0f0f0f;border-right:1px solid #333;display:flex;flex-direction:column;">
        <div style="padding:8px 12px;border-bottom:1px solid #333;font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;">Slides</div>
        <div id="brf-st-sidebar" style="flex:1;overflow-y:auto;padding:8px;display:flex;flex-direction:column;gap:6px;"></div>
        <div style="padding:8px;border-top:1px solid #333;">
          <button class="btn btn-primary btn-sm" style="width:100%;" onclick="brfAddSlide()">+ Nouvelle slide</button>
        </div>
      </div>

      <!-- Canvas -->
      <div id="brf-st-wrap" style="flex:1;display:flex;align-items:center;justify-content:center;background:#222;overflow:auto;padding:20px;">
        <div id="brf-st-canvas-container" style="position:relative;box-shadow:0 4px 24px rgba(0,0,0,0.6);background:#fff;">
          <canvas id="brf-studio-canvas"></canvas>
        </div>
      </div>
    </div>
  `;
}

function resizeStudioCanvas() {
  if (!BRF_STUDIO?.fabricCanvas) return;
  const wrap = document.getElementById('brf-st-wrap');
  if (!wrap) return;
  const availW = wrap.clientWidth - 40;
  const availH = wrap.clientHeight - 40;
  let scale = Math.min(availW / BRF_CANVAS_W, availH / BRF_CANVAS_H);
  scale = Math.min(scale, 1);
  // Fabric : on garde les coords internes 1280×720 mais on adapte l'affichage CSS
  BRF_STUDIO.fabricCanvas.setDimensions({ width: BRF_CANVAS_W * scale, height: BRF_CANVAS_H * scale }, { cssOnly: true });
  BRF_STUDIO.fabricCanvas.setDimensions({ width: BRF_CANVAS_W, height: BRF_CANVAS_H }, { backstoreOnly: true });
}

function handleStudioKeydown(e) {
  if (!document.getElementById('brf-studio-overlay')) {
    document.removeEventListener('keydown', handleStudioKeydown);
    return;
  }
  const t = e.target;
  if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
  // Undo / Redo
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault(); brfUndo(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y' || ((e.shiftKey) && (e.key === 'z' || e.key === 'Z')))) {
    e.preventDefault(); brfRedo(); return;
  }
  // Copier
  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
    if (BRF_STUDIO?.fabricCanvas?.getActiveObject()?.isEditing) return;
    e.preventDefault(); brfCopySel(); return;
  }
  // Couper
  if ((e.ctrlKey || e.metaKey) && (e.key === 'x' || e.key === 'X')) {
    if (BRF_STUDIO?.fabricCanvas?.getActiveObject()?.isEditing) return;
    e.preventDefault(); brfCutSel(); return;
  }
  // Coller
  if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
    if (BRF_STUDIO?.fabricCanvas?.getActiveObject()?.isEditing) return;
    e.preventDefault(); brfPasteSel(); return;
  }
  // Delete
  if (BRF_STUDIO?.fabricCanvas?.getActiveObject() && (e.key === 'Delete' || e.key === 'Backspace')) {
    if (BRF_STUDIO.fabricCanvas.getActiveObject().isEditing) return;
    e.preventDefault();
    brfDeleteSel();
  }
}

// ─── Ajout d'objets ───
function brfAddText() {
  const t = new fabric.Textbox('Texte...', { left:120, top:120, width:400, fontSize:24, fontFamily:'Helvetica', fill:'#222' });
  brfSetupTextObject(t);
  BRF_STUDIO.fabricCanvas.add(t).setActiveObject(t);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfAddTitle() {
  const t = new fabric.IText('Titre principal', { left:80, top:60, fontSize:54, fontFamily:'Helvetica', fontWeight:'bold', fill:'#0a2540' });
  BRF_STUDIO.fabricCanvas.add(t).setActiveObject(t);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
async function brfAddImage(file) {
  if (!file) return;
  const isPdf = file.type === 'application/pdf' || (file.name || '').toLowerCase().endsWith('.pdf');
  toast(isPdf ? 'Upload du PDF...' : 'Upload...', 'info');
  const fd = new FormData(); fd.append('file', file);
  try {
    const r = await fetch(window.location.origin + '/api/v1/upload/project-file/' + BRF_STUDIO.projectId, {
      method:'POST', headers:{ 'Authorization': 'Bearer ' + TOKEN }, body: fd,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const url = data?.data?.fileUrl;
    if (!url) throw new Error('Pas d\'URL renvoyée');

    if (isPdf) {
      // PDF uploadé → 1 slide par page (au lieu d'une image sur slide courante)
      const fakeFile = { fileName: file.name, fileUrl: url };
      const pageCount = await brfAddPdfPagesAsSlides(fakeFile);
      renderStudioSidebar();
      if (pageCount > 0) toast(`✅ PDF ajouté : ${pageCount} slide(s) créée(s)`, 'success');
      else toast('PDF uploadé mais aucune page lisible', 'warning');
    } else {
      // Image normale → preload avec fallback sans CORS (au cas où Cloudinary tainte le canvas)
      const place = (loadedImg) => {
        const fImg = new fabric.Image(loadedImg);
        const maxW = 600;
        if (fImg.width > maxW) fImg.scaleToWidth(maxW);
        fImg.set({ left:200, top:150 });
        BRF_STUDIO.fabricCanvas.add(fImg).setActiveObject(fImg);
        BRF_STUDIO.fabricCanvas.requestRenderAll();
      };
      const tryWithCors = new Image();
      tryWithCors.crossOrigin = 'anonymous';
      tryWithCors.onload  = () => { place(tryWithCors); toast('Image ajoutée', 'success'); };
      tryWithCors.onerror = () => {
        const noCors = new Image();
        noCors.onload  = () => { place(noCors); toast('⚠️ Image ajoutée (export PDF risque de rater)', 'warning'); };
        noCors.onerror = () => toast('Impossible de charger l\'image depuis le serveur', 'error');
        noCors.src = url;
      };
      tryWithCors.src = url;
    }
  } catch (e) {
    toast('Échec upload : ' + e.message, 'error');
  }
}
function brfAddRect() {
  const r = new fabric.Rect({ left:200, top:200, width:240, height:140, fill:'#e63946', opacity:0.85, rx:4, ry:4 });
  BRF_STUDIO.fabricCanvas.add(r).setActiveObject(r);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfAddCircle() {
  const c = new fabric.Circle({ left:250, top:200, radius:70, fill:'#4895ef', opacity:0.85 });
  BRF_STUDIO.fabricCanvas.add(c).setActiveObject(c);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfAddLine() {
  const l = new fabric.Line([100, 200, 400, 200], { stroke:'#222', strokeWidth:4, originX:'center', originY:'center' });
  BRF_STUDIO.fabricCanvas.add(l).setActiveObject(l);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfAddArrow() {
  // Flèche horizontale = ligne + triangle
  const line = new fabric.Line([0, 12, 180, 12], { stroke:'#e63946', strokeWidth:4 });
  const tri  = new fabric.Triangle({ left:184, top:12, width:20, height:24, fill:'#e63946', angle:90, originX:'center', originY:'center' });
  const grp = new fabric.Group([line, tri], { left:200, top:300 });
  BRF_STUDIO.fabricCanvas.add(grp).setActiveObject(grp);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}

function brfBringForward(){ const o=BRF_STUDIO.fabricCanvas.getActiveObject(); if(o){BRF_STUDIO.fabricCanvas.bringForward(o);BRF_STUDIO.fabricCanvas.requestRenderAll();}}
function brfSendBack(){ const o=BRF_STUDIO.fabricCanvas.getActiveObject(); if(o){BRF_STUDIO.fabricCanvas.sendBackwards(o);BRF_STUDIO.fabricCanvas.requestRenderAll();}}
function brfDuplicateSel(){
  const o=BRF_STUDIO.fabricCanvas.getActiveObject(); if(!o) return;
  o.clone(c => { c.set({ left:(c.left||0)+24, top:(c.top||0)+24 }); BRF_STUDIO.fabricCanvas.add(c).setActiveObject(c); BRF_STUDIO.fabricCanvas.requestRenderAll(); });
}
let BRF_CLIPBOARD = null;
function brfCopySel(){
  const o = BRF_STUDIO?.fabricCanvas?.getActiveObject(); if(!o) return;
  o.clone(c => { BRF_CLIPBOARD = c; toast('Élément copié 📋', 'info'); });
}
function brfCutSel(){
  const o = BRF_STUDIO?.fabricCanvas?.getActiveObject(); if(!o) return;
  o.clone(c => { BRF_CLIPBOARD = c; brfDeleteSel(); toast('Élément coupé ✂️', 'info'); });
}
function brfPasteSel(){
  if (!BRF_CLIPBOARD || !BRF_STUDIO?.fabricCanvas) return;
  BRF_CLIPBOARD.clone(clone => {
    const cv = BRF_STUDIO.fabricCanvas;
    cv.discardActiveObject();
    clone.set({ left:(clone.left||0)+24, top:(clone.top||0)+24, evented:true });
    if (clone.type === 'activeSelection') {
      clone.canvas = cv;
      clone.forEachObject(obj => cv.add(obj));
      clone.setCoords();
    } else {
      cv.add(clone);
    }
    // On décale le presse-papier pour un collage multiple en escalier
    BRF_CLIPBOARD.top = (BRF_CLIPBOARD.top||0) + 24;
    BRF_CLIPBOARD.left = (BRF_CLIPBOARD.left||0) + 24;
    cv.setActiveObject(clone);
    cv.requestRenderAll();
  });
}
function brfDeleteSel(){
  const objs = BRF_STUDIO.fabricCanvas.getActiveObjects();
  if (!objs?.length) return;
  objs.forEach(o => BRF_STUDIO.fabricCanvas.remove(o));
  BRF_STUDIO.fabricCanvas.discardActiveObject();
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfIsText(o){ return !!o && (o.type==='i-text' || o.type==='text' || o.type==='textbox'); }

function brfApplyColor(color){
  const o = BRF_STUDIO.fabricCanvas.getActiveObject(); if(!o) return;
  if (brfIsText(o)) o.set('fill', color);
  else if (o.type==='line') o.set('stroke', color);
  else if (o.type==='group') {
    o.getObjects().forEach(sub => {
      if (sub.type==='line') sub.set('stroke', color);
      else sub.set('fill', color);
    });
    o.dirty = true;
  } else {
    o.set('fill', color);
  }
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfApplyFontSize(size){
  const o = BRF_STUDIO.fabricCanvas.getActiveObject(); if(!brfIsText(o)) return;
  o.set('fontSize', parseInt(size, 10) || 24);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfBumpFontSize(delta){
  const o = BRF_STUDIO.fabricCanvas.getActiveObject(); if(!brfIsText(o)) return;
  const ns = Math.max(6, Math.round((o.fontSize||24) + delta));
  o.set('fontSize', ns);
  const sz = document.getElementById('brf-fontsize'); if(sz) sz.value = ns;
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfApplyFont(family){
  const o = BRF_STUDIO.fabricCanvas.getActiveObject(); if(!brfIsText(o)) return;
  o.set('fontFamily', family);
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfToggleBold(){
  const o = BRF_STUDIO.fabricCanvas.getActiveObject(); if(!brfIsText(o)) return;
  o.set('fontWeight', o.fontWeight==='bold' ? 'normal' : 'bold');
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
function brfToggleItalic(){
  const o = BRF_STUDIO.fabricCanvas.getActiveObject(); if(!brfIsText(o)) return;
  o.set('fontStyle', o.fontStyle==='italic' ? 'normal' : 'italic');
  BRF_STUDIO.fabricCanvas.requestRenderAll();
}
// Empêche la déformation : on convertit le "scale" en vraie taille de police / largeur
function brfLiveTextScale(o){
  if(!brfIsText(o)) return;
  if(o.type==='textbox'){
    // La zone d'écriture change seulement de LARGEUR (le texte se replie), police inchangée
    o.set({ width: Math.max(20, (o.width||100) * o.scaleX), scaleX:1, scaleY:1 });
  } else {
    // Titre / texte simple : la police grossit proprement, sans étirement
    const f = Math.max(o.scaleX||1, o.scaleY||1);
    o.set({ fontSize: Math.max(6, Math.round((o.fontSize||24) * f)), scaleX:1, scaleY:1 });
  }
  o.setCoords();
}
function brfSetupTextObject(o){
  if(o && o.type==='textbox'){ o.setControlsVisibility({ mt:false, mb:false }); }
}
function brfSyncTextControls(o){
  if(!brfIsText(o)) return;
  const sz = document.getElementById('brf-fontsize'); if(sz) sz.value = Math.round(o.fontSize||24);
  const ff = document.getElementById('brf-fontfamily'); if(ff && o.fontFamily) ff.value = o.fontFamily;
  const cl = document.getElementById('brf-color'); if(cl && typeof o.fill==='string' && o.fill.startsWith('#')) cl.value = o.fill;
}

// ─── Menu Logo (filigrane de fond) ───
function brfOpenLogoMenu(btn) {
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  const hasLogo = !!BRF_STUDIO.logoUrl;
  const hasGlobal = !!BRF_STUDIO.globalLogoUrl;
  const menu = document.createElement('div');
  menu.className = 'brf-proj-menu';
  menu.style.cssText = 'position:fixed;background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:6px;z-index:10010;box-shadow:0 6px 20px rgba(0,0,0,0.6);min-width:280px;';
  menu.innerHTML = `
    <button class="brf-pm-item" onclick="document.getElementById('brf-logo-input').click()">📤 Uploader un logo pour ce briefing</button>
    <input type="file" id="brf-logo-input" accept="image/*" style="display:none;" onchange="brfSetLogo(this.files[0], false);this.value='';">
    <button class="brf-pm-item" onclick="document.getElementById('brf-logo-global-input').click()" title="Devient le logo par défaut pour TOUS les briefings (admin)">🌐 Définir comme logo global Viewbox</button>
    <input type="file" id="brf-logo-global-input" accept="image/*" style="display:none;" onchange="brfSetLogo(this.files[0], true);this.value='';">
    ${hasGlobal && !hasLogo ? '' : `<button class="brf-pm-item" onclick="brfUseGlobalLogo()" ${!hasGlobal?'disabled style="opacity:.4;"':''}>🔄 Réutiliser le logo global Viewbox</button>`}
    ${hasLogo ? '<button class="brf-pm-item" onclick="brfRemoveLogo()" style="color:#e63946;">✕ Retirer le logo de ce briefing</button>' : ''}
  `;
  const r = btn.getBoundingClientRect();
  menu.style.top  = (r.bottom + 4) + 'px';
  menu.style.right = (window.innerWidth - r.right) + 'px';
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

async function brfSetLogo(file, asGlobal) {
  if (!file) return;
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  toast('Upload du logo...', 'info');
  const fd = new FormData(); fd.append('file', file);
  try {
      const r = await fetch(window.location.origin + '/api/v1/upload/project-file/' + BRF_STUDIO.projectId, {
      method:'POST', headers:{ 'Authorization': 'Bearer ' + TOKEN }, body: fd,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const data = await r.json();
    const url = data?.data?.fileUrl;
    if (!url) throw new Error('Pas d\'URL');
    BRF_STUDIO.logoUrl = url;
    applyLogoBackground();
    if (asGlobal) {
      // Sauvegarde dans app_settings pour réutiliser dans tous les briefings
      const r2 = await api('PUT', '/settings/briefing-default-logo', { value: { url } });
      if (r2?.success) {
        BRF_STUDIO.globalLogoUrl = url;
        toast('🌐 Logo global défini ✅ (visible sur tous les briefings)', 'success');
      } else {
        toast('Logo appliqué à ce briefing mais pas globalisé : ' + (r2?.error || 'admin requis'), 'warning');
      }
    } else {
      toast('Logo défini sur ce briefing ✅', 'success');
    }
  } catch (e) {
    toast('Échec : ' + e.message, 'error');
  }
}
function brfRemoveLogo() {
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  BRF_STUDIO.logoUrl = null;
  applyLogoBackground();
  toast('Logo retiré de ce briefing', 'info');
}
function brfUseGlobalLogo() {
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  if (!BRF_STUDIO.globalLogoUrl) { toast('Aucun logo global défini', 'warning'); return; }
  BRF_STUDIO.logoUrl = BRF_STUDIO.globalLogoUrl;
  applyLogoBackground();
  toast('Logo global appliqué ✅', 'success');
}

// ─── Undo / Redo (pile d'états JSON Fabric) ───
const BRF_UNDO_MAX = 30;
function brfSnapshot() {
  if (!BRF_STUDIO?.fabricCanvas || BRF_STUDIO.suppressSnapshot) return;
  // Snapshot du JSON courant (sans backgroundImage qui est appliqué séparément)
  const json = BRF_STUDIO.fabricCanvas.toJSON();
  delete json.backgroundImage;
  // Évite de stocker le même état 2 fois de suite
  const last = BRF_STUDIO.undoStack[BRF_STUDIO.undoStack.length - 1];
  if (last && JSON.stringify(last) === JSON.stringify(json)) return;
  BRF_STUDIO.undoStack.push(json);
  if (BRF_STUDIO.undoStack.length > BRF_UNDO_MAX) BRF_STUDIO.undoStack.shift();
  BRF_STUDIO.redoStack = []; // nouvelle action → on perd la pile de redo
  brfUpdateUndoButtons();
  // Régénérer thumbnail (async pour ne pas bloquer)
  setTimeout(() => brfRegenThumbnail(), 80);
}
function brfUndo() {
  if (!BRF_STUDIO?.undoStack?.length) return;
  // Pop l'état actuel pour le mettre dans redo, puis charger l'état précédent
  const current = BRF_STUDIO.undoStack.pop();
  BRF_STUDIO.redoStack.push(current);
  const prev = BRF_STUDIO.undoStack[BRF_STUDIO.undoStack.length - 1];
  brfLoadJsonSilent(prev || { objects: [] });
  brfUpdateUndoButtons();
}
function brfRedo() {
  if (!BRF_STUDIO?.redoStack?.length) return;
  const next = BRF_STUDIO.redoStack.pop();
  BRF_STUDIO.undoStack.push(next);
  brfLoadJsonSilent(next);
  brfUpdateUndoButtons();
}
function brfLoadJsonSilent(json) {
  if (!BRF_STUDIO?.fabricCanvas) return;
  BRF_STUDIO.suppressSnapshot = true;
  BRF_STUDIO.fabricCanvas.clear();
  BRF_STUDIO.fabricCanvas.setBackgroundColor('#ffffff', () => {});
  BRF_STUDIO.fabricCanvas.loadFromJSON(json, () => {
    applyLogoBackground();
    BRF_STUDIO.fabricCanvas.renderAll();
    BRF_STUDIO.suppressSnapshot = false;
  });
}
function brfUpdateUndoButtons() {
  const u = document.getElementById('brf-undo-btn');
  const r = document.getElementById('brf-redo-btn');
  if (u) u.style.opacity = BRF_STUDIO?.undoStack?.length > 1 ? '1' : '0.4';
  if (r) r.style.opacity = BRF_STUDIO?.redoStack?.length > 0 ? '1' : '0.4';
}

// ─── Thumbnails ───
function brfRegenThumbnail() {
  if (!BRF_STUDIO?.fabricCanvas) return;
  const idx = BRF_STUDIO.curIdx;
  if (idx == null || !BRF_STUDIO.slides[idx]) return;
  try {
    // Mini ~192×108 px en jpeg compressé
    const dataUrl = BRF_STUDIO.fabricCanvas.toDataURL({ format: 'jpeg', quality: 0.5, multiplier: 0.15 });
    BRF_STUDIO.slides[idx].thumbnail = dataUrl;
    // Re-render sidebar pour montrer le nouveau thumbnail
    renderStudioSidebar();
  } catch (e) {
    // CORS error si le logo est cross-origin sans CORS — silencieux
  }
}

// ─── Menu Templates de slides ───
