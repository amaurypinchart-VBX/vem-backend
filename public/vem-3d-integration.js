// ════════════════════════════════════════════════════════════════════════
// VEM Integration pour le viewer 3D
// ════════════════════════════════════════════════════════════════════════
// Chargé en fin de viewer3d.html via <script src>. Gère :
//   1. Auto-chargement depuis ?modelUrl=...
//   2. Affichage du nom de projet dans le header
//   3. Bouton "💾 Sauver sur VEM" sur chaque capture
//   4. Bouton "💾 Tout sauver sur VEM" dans le footer galerie
//
// Compatibilité : utilise UNIQUEMENT window.loadFile (déclaré en `function`,
// donc accessible). N'accède PAS à state qui est `const` (non-global).
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

  function injectProjectBadge() {
    if (!projectName) return;
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) {
      brandSub.innerHTML = '· <span style="color:#ff8a3d;font-weight:600;">📁 ' + escapeHtml(projectName) + '</span>';
    }
  }

  async function autoLoadFromUrl(url) {
    try {
      console.log('[VEM] Téléchargement :', url);
      if (typeof window.setStatus === 'function') window.setStatus('📥 Téléchargement depuis VEM...', 'info');
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      console.log('[VEM] Blob reçu :', blob.size, 'bytes');
      let filename = (url.split('/').pop() || 'model').split('?')[0] || 'model.glb';
      try { filename = decodeURIComponent(filename); } catch {}
      const ext = filename.split('.').pop().toLowerCase();
      if (!['glb','gltf','stl','obj'].includes(ext)) filename = filename + '.glb';
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      await window.loadFile(file);
      console.log('[VEM] ✅ Modèle chargé');
    } catch (e) {
      console.error('[VEM] Échec chargement :', e);
      if (typeof window.setStatus === 'function') window.setStatus('Erreur : ' + e.message, 'error');
      else alert('Erreur chargement VEM : ' + e.message);
    }
  }

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