// ════════════════════════════════════════════════════════════════════════
// VEM Integration pour le viewer 3D
// ════════════════════════════════════════════════════════════════════════
// Ce script est chargé en fin de viewer3d.html (via <script src>).
// Il gère :
//   1. Chargement automatique d'un modèle depuis ?modelUrl=...
//   2. Affichage du nom de projet dans le header (si ?projectName=...)
//   3. Bouton "💾 Sauver sur le projet" sur chaque capture de la galerie
//   4. Bouton "💾 Tout sauver sur le projet" dans le footer de la galerie
//
// Paramètres URL acceptés :
//   modelUrl    — URL d'un fichier 3D (.glb/.gltf/.stl/.obj) à auto-charger
//   projectId   — UUID du projet VEM dans lequel sauvegarder les captures
//   projectName — Nom du projet (affiché dans le header)
//   token       — JWT pour authentifier les uploads vers l'API VEM
//
// Si ni modelUrl ni projectId n'est présent, ce script ne fait rien
// (le viewer fonctionne en mode standalone).
// ════════════════════════════════════════════════════════════════════════

(function() {
  const params       = new URLSearchParams(window.location.search);
  const modelUrl     = params.get('modelUrl');
  const projectId    = params.get('projectId');
  const projectName  = params.get('projectName');
  const token        = params.get('token');

  if (!modelUrl && !projectId) return; // Mode standalone — rien à faire

  console.log('[VEM] Mode intégré actif', { projectName, hasModel: !!modelUrl, hasToken: !!token });

  // ─── Attente que le viewer soit prêt (loadFile + scene définis) ─────
  function waitForViewerReady() {
    return new Promise(resolve => {
      const check = () => {
        if (typeof window.loadFile === 'function' && typeof window.state !== 'undefined') {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  // ─── 1. Affichage du nom de projet dans le header ──────────────────
  function injectProjectBadge() {
    if (!projectName) return;
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) {
      brandSub.innerHTML = `· <span style="color:#ff8a3d;font-weight:600;">📁 ${escapeHtml(projectName)}</span>`;
    }
  }

  // ─── 2. Chargement automatique depuis URL ──────────────────────────
  async function autoLoadFromUrl(url) {
    try {
      if (typeof window.setStatus === 'function') {
        window.setStatus('📥 Téléchargement du modèle depuis VEM...', 'info');
      }
      const r = await fetch(url);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const blob = await r.blob();
      // Nom de fichier : on prend la dernière partie de l'URL (avant les ?)
      const filename = (url.split('/').pop() || 'model').split('?')[0] || 'model.glb';
      // Construire un objet File compatible avec loadFile()
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
      await window.loadFile(file);
      console.log('[VEM] Modèle chargé automatiquement :', filename);
    } catch (e) {
      console.error('[VEM] Échec chargement automatique :', e);
      if (typeof window.setStatus === 'function') {
        window.setStatus('Erreur chargement depuis VEM : ' + e.message, 'error');
      }
    }
  }

  // ─── 3. Sauvegarde des captures sur le projet VEM ──────────────────
  async function saveCaptureToProject(captureId, btn) {
    const cap = window.state.captures.find(c => c.id === captureId);
    if (!cap) { console.warn('[VEM] Capture introuvable :', captureId); return; }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⏳ Envoi...';

    try {
      // Récupérer le blob depuis l'URL.createObjectURL
      const blob = await fetch(cap.url).then(r => r.blob());
      const baseName = (cap.modelName || 'modele').replace(/\.[^.]+$/, '');
      const ts = new Date(cap.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `3D_${baseName}_${ts}.png`;
      const file = new File([blob], filename, { type: 'image/png' });

      const fd = new FormData();
      fd.append('file', file);

      // URL de l'API VEM (même origine que le viewer)
      const apiUrl = `${window.location.origin}/api/v1/upload/project-file/${projectId}`;
      const r = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: fd,
      });

      if (!r.ok) throw new Error('HTTP ' + r.status);
      // Succès
      btn.innerHTML = '✅ Sauvé !';
      btn.style.background = '#22c55e';
      btn.style.borderColor = '#22c55e';
      // Marquer la capture comme sauvée (pour ne pas re-sauver)
      cap._vemSaved = true;
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        btn.style.background = '';
        btn.style.borderColor = '';
      }, 3000);
    } catch (e) {
      console.error('[VEM] Échec sauvegarde :', e);
      btn.disabled = false;
      btn.innerHTML = '❌ ' + (e.message || 'Erreur');
      setTimeout(() => btn.innerHTML = originalHtml, 3000);
    }
  }

  async function saveAllCapturesToProject(btn) {
    if (!window.state.captures.length) return;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    let ok = 0, fail = 0;
    for (let i = 0; i < window.state.captures.length; i++) {
      const cap = window.state.captures[i];
      btn.innerHTML = `⏳ Envoi ${i + 1}/${window.state.captures.length}...`;
      try {
        const blob = await fetch(cap.url).then(r => r.blob());
        const baseName = (cap.modelName || 'modele').replace(/\.[^.]+$/, '');
        const ts = new Date(cap.timestamp).toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `3D_${baseName}_${ts}.png`;
        const file = new File([blob], filename, { type: 'image/png' });
        const fd = new FormData();
        fd.append('file', file);
        const r = await fetch(`${window.location.origin}/api/v1/upload/project-file/${projectId}`, {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + token },
          body: fd,
        });
        if (r.ok) { ok++; cap._vemSaved = true; }
        else fail++;
      } catch { fail++; }
    }
    btn.innerHTML = `✅ ${ok} sauvée${ok > 1 ? 's' : ''}${fail ? ' · ❌ ' + fail + ' échec' : ''}`;
    btn.style.background = ok > 0 ? '#22c55e' : '#f87171';
    btn.style.borderColor = ok > 0 ? '#22c55e' : '#f87171';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
      btn.style.background = '';
      btn.style.borderColor = '';
    }, 4000);
  }

  // ─── 4. Injection des boutons VEM dans la galerie ──────────────────
  function injectSaveButtons() {
    document.querySelectorAll('.gallery-actions').forEach(actions => {
      if (actions.querySelector('.vem-save-btn')) return;
      const idAttr = actions.querySelector('[data-id]');
      if (!idAttr) return;
      const id = idAttr.dataset.id;
      const cap = window.state.captures.find(c => c.id === id);

      const btn = document.createElement('button');
      btn.className = 'btn vem-save-btn';
      btn.style.cssText = 'background:#e63946;color:white;border-color:#e63946;';
      btn.innerHTML = cap?._vemSaved ? '✅ Sauvé sur VEM' : '💾 Sauver sur VEM';
      btn.onclick = (e) => { e.stopPropagation(); saveCaptureToProject(id, btn); };
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

  // ─── Monkey-patch renderGallery pour injecter à chaque ré-affichage ─
  function patchRenderGallery() {
    if (typeof window.renderGallery !== 'function') return;
    const _orig = window.renderGallery;
    window.renderGallery = function() {
      _orig.apply(this, arguments);
      if (projectId && token) {
        injectSaveButtons();
        injectSaveAllButton();
      }
    };
  }

  // ─── Helper ────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
  }

  // ─── Bootstrap ─────────────────────────────────────────────────────
  waitForViewerReady().then(() => {
    injectProjectBadge();
    patchRenderGallery();
    if (modelUrl) {
      autoLoadFromUrl(modelUrl);
    }
    if (projectId && token) {
      console.log('[VEM] Sauvegarde sur projet activée — projectId=' + projectId);
    }
  });
})();