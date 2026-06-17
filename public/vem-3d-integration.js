// ════════════════════════════════════════════════════════════════════════
// VEM Integration pour le viewer 3D
// ════════════════════════════════════════════════════════════════════════
// Chargé en fin de viewer3d.html via <script src>. Gère :
//   1. Auto-chargement depuis ?modelUrl=... (+ décompression Draco auto)
//   2. Affichage du nom de projet dans le header
//   3. Bouton "💾 Sauver sur VEM" sur chaque capture
//   4. Bouton "💾 Tout sauver sur VEM" dans le footer galerie
//
// Le viewer custom (parseGLB) ne supporte ni Draco ni Meshopt. On les détecte
// dans le fichier reçu et on les décompresse côté browser avant de passer
// au viewer, en utilisant GLTFLoader + DRACOLoader + GLTFExporter de three.js.
// ════════════════════════════════════════════════════════════════════════

(function() {
  const params       = new URLSearchParams(window.location.search);
  const modelUrl     = params.get('modelUrl');
  const projectId    = params.get('projectId');
  const projectName  = params.get('projectName');
  const token        = params.get('token');

  if (!modelUrl && !projectId) return;
  console.log('[VEM] Mode intégré actif', { projectName, hasModel: !!modelUrl, hasToken: !!token });

  function waitForViewerReady() {
    return new Promise(resolve => {
      let attempts = 0;
      const check = () => {
        attempts++;
        if (typeof window.loadFile === 'function') {
          console.log('[VEM] Viewer prêt après ' + attempts + ' tentatives');
          resolve();
        } else if (attempts > 100) {
          console.error('[VEM] loadFile introuvable après 10s');
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  // ─── Détection Draco / Meshopt dans un GLB ─────────────────────────
  function detectCompressionFromGLB(arrayBuffer) {
    try {
      const dv = new DataView(arrayBuffer);
      const magic = dv.getUint32(0, true);
      if (magic !== 0x46546C67) return { draco: false, meshopt: false }; // pas un GLB
      const jsonLength = dv.getUint32(12, true);
      const jsonStart = 20;
      const jsonBytes = new Uint8Array(arrayBuffer, jsonStart, jsonLength);
      const json = JSON.parse(new TextDecoder().decode(jsonBytes));
      const used = json.extensionsUsed || [];
      return {
        draco:   used.includes('KHR_draco_mesh_compression'),
        meshopt: used.includes('EXT_meshopt_compression'),
      };
    } catch (e) {
      console.warn('[VEM] Détection compression échouée :', e);
      return { draco: false, meshopt: false };
    }
  }

  // ─── Chargement dynamique des libs three.js examples ───────────────
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + src + '"]');
      if (existing) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  let _libsLoaded = false;
  async function loadDecompressionLibs() {
    if (_libsLoaded) return;
    // three.js r128 examples/js (UMD classique, ajoute à THREE globalement)
    const base = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js';
    await loadScript(base + '/loaders/GLTFLoader.js');
    await loadScript(base + '/loaders/DRACOLoader.js');
    await loadScript(base + '/libs/meshopt_decoder.js');
    await loadScript(base + '/exporters/GLTFExporter.js');
    _libsLoaded = true;
    console.log('[VEM] Libs Draco/Meshopt/GLTFExporter chargées');
  }

  // ─── Décompression d'un GLB compressé vers un GLB non compressé ────
  async function decompressGLB(arrayBuffer) {
    await loadDecompressionLibs();
    if (!window.THREE || !window.THREE.GLTFLoader) {
      throw new Error('GLTFLoader indisponible');
    }
    const loader = new window.THREE.GLTFLoader();
    if (window.THREE.DRACOLoader) {
      const draco = new window.THREE.DRACOLoader();
      draco.setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
      loader.setDRACOLoader(draco);
    }
    if (window.MeshoptDecoder) {
      loader.setMeshoptDecoder(window.MeshoptDecoder);
    }
    // 1. Parser le GLB compressé
    const gltf = await new Promise((resolve, reject) => {
      loader.parse(arrayBuffer, '', resolve, reject);
    });
    console.log('[VEM] GLB compressé parsé OK, ré-export en cours...');
    // 2. Ré-exporter en GLB binaire sans compression
    const exporter = new window.THREE.GLTFExporter();
    const out = await new Promise((resolve, reject) => {
      try {
        exporter.parse(gltf.scene, resolve, { binary: true, embedImages: true });
      } catch (e) { reject(e); }
    });
    if (!(out instanceof ArrayBuffer)) {
      throw new Error('GLTFExporter n\'a pas renvoyé un ArrayBuffer (compression non décompressée ?)');
    }
    return out;
  }

  function injectProjectBadge() {
    if (!projectName) return;
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) {
      brandSub.innerHTML = '· <span style="color:#ff8a3d;font-weight:600;">📁 ' + escapeHtml(projectName) + '</span>';
    }
  }

  // ─── Chargement auto depuis URL avec décompression si besoin ───────
  async function autoLoadFromUrl(url) {
    try {
      console.log('[VEM] Téléchargement :', url);
      if (typeof window.setStatus === 'function') window.setStatus('📥 Téléchargement depuis VEM...', 'info');
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      let arrayBuffer = await r.arrayBuffer();
      console.log('[VEM] Reçu :', arrayBuffer.byteLength, 'bytes');

      // Détection de compression et décompression si besoin
      const comp = detectCompressionFromGLB(arrayBuffer);
      if (comp.draco || comp.meshopt) {
        console.log('[VEM] Compression détectée :', comp.draco ? 'Draco' : '', comp.meshopt ? 'Meshopt' : '');
        if (typeof window.setStatus === 'function') {
          window.setStatus('🔧 Décompression ' + (comp.draco ? 'Draco' : 'Meshopt') + ' en cours...', 'info');
        }
        const decompressed = await decompressGLB(arrayBuffer);
        console.log('[VEM] Décompression OK :', arrayBuffer.byteLength, '→', decompressed.byteLength, 'bytes');
        arrayBuffer = decompressed;
      }

      // Construire un File et appeler le loadFile du viewer
      let filename = (url.split('/').pop() || 'model').split('?')[0] || 'model.glb';
      try { filename = decodeURIComponent(filename); } catch {}
      const ext = filename.split('.').pop().toLowerCase();
      if (!['glb','gltf','stl','obj'].includes(ext)) filename = filename + '.glb';
      const blob = new Blob([arrayBuffer], { type: 'model/gltf-binary' });
      const file = new File([blob], filename, { type: blob.type });
      await window.loadFile(file);
      console.log('[VEM] ✅ Modèle chargé');
    } catch (e) {
      console.error('[VEM] Échec chargement :', e);
      if (typeof window.setStatus === 'function') window.setStatus('Erreur : ' + e.message, 'error');
      else alert('Erreur chargement VEM : ' + e.message);
    }
  }

  // ─── Sauvegarde sur projet ─────────────────────────────────────────
  async function uploadBlobToProject(blob, filename) {
    const file = new File([blob], filename, { type: 'image/png' });
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(window.location.origin + '/api/v1/upload/project-file/' + projectId, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: fd,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  }

  async function saveCaptureToProject(captureUrl, btn) {
    const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '⏳ Envoi...';
    try {
      const blob = await fetch(captureUrl).then(r => r.blob());
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      await uploadBlobToProject(blob, '3D_capture_' + ts + '.png');
      btn.innerHTML = '✅ Sauvé !';
      btn.style.background = '#22c55e'; btn.style.borderColor = '#22c55e';
      setTimeout(() => {
        btn.disabled = false; btn.innerHTML = orig;
        btn.style.background = ''; btn.style.borderColor = '';
      }, 3000);
    } catch (e) {
      console.error('[VEM] Échec :', e);
      btn.disabled = false; btn.innerHTML = '❌ Erreur';
      setTimeout(() => btn.innerHTML = orig, 3000);
    }
  }

  async function saveAllCapturesToProject(btn) {
    const items = document.querySelectorAll('#gallery-body .gallery-item');
    if (!items.length) return;
    const orig = btn.innerHTML;
    btn.disabled = true;
    let ok = 0, fail = 0, i = 0;
    for (const item of items) {
      i++;
      btn.innerHTML = '⏳ Envoi ' + i + '/' + items.length + '...';
      const img = item.querySelector('img.gallery-thumb');
      if (!img) { fail++; continue; }
      try {
        const blob = await fetch(img.src).then(r => r.blob());
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        await uploadBlobToProject(blob, '3D_capture_' + ts + '_' + i + '.png');
        ok++;
      } catch { fail++; }
    }
    btn.innerHTML = '✅ ' + ok + ' sauvée' + (ok > 1 ? 's' : '') + (fail ? ' · ❌ ' + fail : '');
    btn.style.background = ok > 0 ? '#22c55e' : '#f87171';
    btn.style.borderColor = ok > 0 ? '#22c55e' : '#f87171';
    setTimeout(() => {
      btn.disabled = false; btn.innerHTML = orig;
      btn.style.background = ''; btn.style.borderColor = '';
    }, 4000);
  }

  function injectSaveButtons() {
    document.querySelectorAll('#gallery-body .gallery-item').forEach(item => {
      const actions = item.querySelector('.gallery-actions');
      if (!actions || actions.querySelector('.vem-save-btn')) return;
      const img = item.querySelector('img.gallery-thumb');
      if (!img) return;
      const btn = document.createElement('button');
      btn.className = 'btn vem-save-btn';
      btn.style.cssText = 'background:#e63946;color:white;border-color:#e63946;';
      btn.innerHTML = '💾 Sauver sur VEM';
      btn.onclick = (e) => { e.stopPropagation(); saveCaptureToProject(img.src, btn); };
      actions.insertBefore(btn, actions.firstChild);
    });
  }

  function injectSaveAllButton() {
    const footer = document.querySelector('#gallery-modal .modal-footer > div:last-child');
    if (!footer || footer.querySelector('#vem-save-all')) return;
    const btn = document.createElement('button');
    btn.id = 'vem-save-all';
    btn.className = 'btn';
    btn.style.cssText = 'background:#e63946;color:white;border-color:#e63946;';
    btn.innerHTML = '💾 Tout sauver sur VEM';
    btn.onclick = () => saveAllCapturesToProject(btn);
    footer.insertBefore(btn, footer.firstChild);
  }

  function observeGallery() {
    const body = document.getElementById('gallery-body');
    if (!body) return;
    const obs = new MutationObserver(() => { injectSaveButtons(); injectSaveAllButton(); });
    obs.observe(body, { childList: true, subtree: true });
    setTimeout(() => { injectSaveButtons(); injectSaveAllButton(); }, 500);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  waitForViewerReady().then(() => {
    injectProjectBadge();
    if (modelUrl) autoLoadFromUrl(modelUrl);
    if (projectId && token) {
      observeGallery();
      console.log('[VEM] Sauvegarde activée — projectId=' + projectId);
    }
  });
})();