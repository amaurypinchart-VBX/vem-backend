// ═══════════════════════════════════════════════════════════════════════════════
// TÉLÉPHONE / TABLETTE — fenêtres, retour arrière, onglets (phase M1,
// docs/mobile/PROMPT_Refonte_Mobile_Tablette.md ; audit docs/mobile/AUDIT_Mobile_Tablette.md).
// Chargé en dernier : il observe l'interface existante, aucun écran n'a besoin d'être
// réécrit pour en profiter. Mise en page associée : css/responsive.css.
//
// 1. Fenêtres (« feuilles ») : toute .overlay ouverte, l'éditeur du planning de montage,
//    la check-list plein écran et les Studios. Tant qu'il y en a une :
//    - body.has-sheet → barre du bas, menu ＋ et bouton 🤖 masqués (ils passaient par-dessus) ;
//    - page derrière bloquée (écran tactile / ≤ 1180 px) ;
//    - pied de fenêtre collant : la dernière rangée de boutons reçoit .modal-foot.
// 2. Retour arrière : chaque page (goto / openProject) et chaque fenêtre ouverte a une entrée
//    d'historique → geste retour Android / bord gauche iPhone = ferme la fenêtre du dessus
//    (« Quitter sans enregistrer ? » si un champ a changé) ou revient à la page d'avant, au
//    lieu de quitter VEM. Recharger la page revient sur le même projet (#projet/<id>).
// 3. Onglets du projet : l'onglet touché est ramené à l'écran, fondu quand il en reste à droite.
// 4. iPad (769–1180 px) : barre latérale repliée en icônes tant que l'utilisateur n'a pas choisi.
// ═══════════════════════════════════════════════════════════════════════════════
(function () {
  const TOUCHY = () => window.matchMedia('(max-width: 1180px), (pointer: coarse)').matches;
  // CURRENT_PROJECT_ID est déclaré avec « let » dans 01-core.js : pas sur window
  const currentProject = () => (typeof CURRENT_PROJECT_ID !== 'undefined' ? CURRENT_PROJECT_ID : null) || null;
  const SHEET_SEL = '.overlay.open, .ap-ov, #checklist-full, #brf-studio-overlay, body > .bn';

  // ── 1. Fenêtres ouvertes ──────────────────────────────────────────────────
  let stack = [];            // fenêtres ouvertes, dans l'ordre d'ouverture
  let locked = null;         // { y, page } quand la page derrière est bloquée

  function visible(el) {
    return el.isConnected && getComputedStyle(el).display !== 'none';
  }
  function openSheets() {
    return [...document.querySelectorAll(SHEET_SEL)].filter(visible);
  }
  function activePage() {
    return document.querySelector('.pg.active')?.id?.replace(/^pg-/, '') || 'dashboard';
  }

  // Pied collant : dernière rangée de boutons d'une fenêtre qui défile elle-même
  function markFooter(sheet) {
    const modal = sheet.matches('.modal') ? sheet : sheet.querySelector(':scope > .modal');
    if (!modal || modal.querySelector(':scope > .modal-foot')) return;
    if (!/(auto|scroll)/.test(getComputedStyle(modal).overflowY)) return;
    let last = modal.lastElementChild;
    while (last && (/^(SCRIPT|STYLE)$/.test(last.tagName) || getComputedStyle(last).display === 'none')) last = last.previousElementSibling;
    if (!last || last.classList.contains('modal-head')) return;
    const btns = last.querySelectorAll('button, a.btn, label.btn');
    if (!btns.length || btns.length > 8) return;
    if (last.querySelector('input:not([type=hidden]):not([type=file]), select, textarea, canvas, img, table')) return;
    if ((last.textContent || '').trim().length > 220) return;
    last.classList.add('modal-foot');
  }

  function lock() {
    if (locked || !TOUCHY()) return;
    const y = window.scrollY;
    locked = { y, page: activePage() };
    const b = document.body.style;
    b.position = 'fixed'; b.top = `-${y}px`; b.left = '0'; b.right = '0'; b.width = '100%';
  }
  function unlock() {
    if (!locked) return;
    const { y, page } = locked;
    locked = null;
    const b = document.body.style;
    b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = '';
    window.scrollTo(0, page === activePage() ? y : 0);
  }

  let scheduled = false;
  function refresh() {
    scheduled = false;
    const open = openSheets();
    const before = stack.length;
    stack = stack.filter(el => open.includes(el));
    for (const el of open) {
      if (!stack.includes(el)) { stack.push(el); delete el.dataset.dirty; }
    }
    for (const el of stack) markFooter(el);
    document.body.classList.toggle('has-sheet', stack.length > 0);
    if (stack.length) lock(); else unlock();
    if (before === 0 && stack.length > 0) History.sheetOpened();
    if (before > 0 && stack.length === 0) History.sheetsClosed();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(refresh);
  }
  new MutationObserver(schedule).observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'],
  });

  // Un champ modifié dans une fenêtre → « Quitter sans enregistrer ? » au geste retour
  const markDirty = e => {
    const s = e.target?.closest?.('.overlay');
    if (s) s.dataset.dirty = '1';
  };
  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);

  // Ferme la fenêtre du dessus comme le ferait son propre bouton. Renvoie false si
  // l'utilisateur a choisi de rester.
  function closeTop() {
    const el = stack[stack.length - 1];
    if (!el) return true;
    if (el.id === 'checklist-full' && typeof closeChecklistFull === 'function') { closeChecklistFull(); return true; }
    if (el.classList.contains('ap-ov') && typeof apCloseEditor === 'function') { apCloseEditor(); return true; }
    if (el.id === 'brf-studio-overlay' && typeof briefingStudioClose === 'function') { briefingStudioClose(); return !el.isConnected; }
    if (el.classList.contains('bn')) {
      const b = el.querySelector('[data-act="close"]');
      if (b) { b.click(); return true; }
      return false;
    }
    if (el.dataset.dirty && !confirm('Quitter sans enregistrer ?\nLes modifications de cette fenêtre seront perdues.')) return false;
    const btn = el.querySelector('.modal-close')
      || [...el.querySelectorAll('button')].find(b => /^(×|✕|← Fermer|Fermer|Annuler)$/.test((b.textContent || '').trim()));
    if (btn) btn.click();
    else if (el.id && typeof closeModal === 'function' && el.classList.contains('overlay') && el.closest('#app-screen')) closeModal(el.id);
    else el.remove();
    return true;
  }

  // ── 2. Historique ─────────────────────────────────────────────────────────
  const History = {
    sheetEntry: false,   // une entrée « fenêtre » est en haut de l'historique
    ignore: 0,           // nombre de popstate provoqués par nous à ignorer
    restoring: false,    // navigation déclenchée par le retour : ne rien empiler
    backTimer: null,

    state() {
      const page = activePage();
      return { vem: 1, page, id: page === 'project-detail' ? currentProject() : null };
    },
    url(s) {
      const base = location.pathname + location.search;
      if (s.page === 'project-detail' && s.id) return base + '#projet/' + s.id;
      if (s.page && s.page !== 'dashboard') return base + '#' + s.page;
      return base;
    },
    same(a, b) { return a && b && a.page === b.page && (a.id || null) === (b.id || null) && !b.sheet; },

    pagePushed() {
      if (this.restoring) return;
      refresh(); // une fenêtre fermée juste avant (ex. « Enregistrer » puis changement de page) est déjà comptée
      const s = this.state();
      if (this.backTimer && !stack.length) {
        // une fenêtre vient de se fermer et son entrée n'est pas encore retirée : on la réutilise
        clearTimeout(this.backTimer); this.backTimer = null; this.sheetEntry = false;
        history.replaceState(s, '', this.url(s));
        return;
      }
      if (stack.length) { history.replaceState({ ...s, sheet: true }, '', this.url(s)); return; }
      if (this.same(s, history.state)) history.replaceState(s, '', this.url(s));
      else history.pushState(s, '', this.url(s));
    },
    sheetOpened() {
      if (this.backTimer) { clearTimeout(this.backTimer); this.backTimer = null; return; } // fenêtre suivante (ex. Lecture → Modifier)
      if (this.sheetEntry) return;
      history.pushState({ ...this.state(), sheet: true }, '', location.href);
      this.sheetEntry = true;
    },
    sheetsClosed() {
      if (!this.sheetEntry) return;
      clearTimeout(this.backTimer);
      this.backTimer = setTimeout(() => {
        this.backTimer = null;
        if (stack.length || !this.sheetEntry) return;
        this.sheetEntry = false;
        this.ignore++;
        history.back();
      }, 150);
    },
    onPop(e) {
      if (this.ignore > 0) { this.ignore--; return; }
      if (stack.length) {
        // retour avec une fenêtre ouverte : on ferme celle du dessus
        this.sheetEntry = false;
        const closed = closeTop();
        requestAnimationFrame(() => requestAnimationFrame(() => {
          refresh();
          if (!closed || stack.length) {
            history.pushState({ ...this.state(), sheet: true }, '', location.href);
            this.sheetEntry = true;
          }
        }));
        return;
      }
      const s = e.state;
      if (!s || !s.vem || !s.page || s.sheet) return;
      this.navigate(s);
    },
    navigate(s) {
      this.restoring = true;
      try {
        if (s.page === 'project-detail' && s.id) {
          if (currentProject() !== s.id || activePage() !== 'project-detail') openProject(s.id);
        } else if (s.page !== activePage() && document.getElementById('pg-' + s.page)) {
          goto(s.page);
        }
      } finally { this.restoring = false; }
    },
  };
  window.addEventListener('popstate', e => History.onPop(e));

  // goto() / openProject() empilent une entrée (les fonctions globales sont remplacées : les
  // onclick="goto(…)" de la page appellent la nouvelle version).
  if (typeof window.goto === 'function') {
    const origGoto = window.goto;
    window.goto = function (page) {
      const r = origGoto.apply(this, arguments);
      // onglet actif de la barre du bas (audit S7) : Projets reste allumé dans un projet
      const bn = { dashboard: 'bn-dashboard', projects: 'bn-projects', 'project-detail': 'bn-projects', tickets: 'bn-tickets' }[page];
      document.querySelectorAll('.bn-item').forEach(el => el.classList.toggle('active', el.id === bn));
      History.pagePushed();
      return r;
    };
  }

  // Au chargement : entrée de la page affichée, puis retour sur le projet / la page de l'URL
  // (après un rechargement).
  function restoreFromUrl() {
    const app = document.getElementById('app-screen');
    if (!app || app.style.display === 'none') return;
    const role = typeof CURRENT_USER !== 'undefined' ? CURRENT_USER?.role : null;
    if (role === 'client') { const s0 = History.state(); history.replaceState(s0, '', History.url(s0)); return; }
    const m = location.hash.match(/^#projet\/([\w-]+)$/);
    const p = location.hash.match(/^#([\w-]+)$/);
    if (m) History.navigate({ page: 'project-detail', id: m[1] });
    else if (p && document.getElementById('pg-' + p[1])) {
      const navItem = [...document.querySelectorAll('.nav-item')].find(n => (n.getAttribute('onclick') || '').includes(`'${p[1]}'`));
      if (!navItem || navItem.style.display !== 'none') History.navigate({ page: p[1] });
    }
    const s = History.state();
    history.replaceState(s, '', History.url(s));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreFromUrl);
  else restoreFromUrl();

  // ── 3. Onglets du projet ──────────────────────────────────────────────────
  function tabsHint() {
    const t = document.getElementById('proj-tabs');
    if (!t) return;
    t.classList.toggle('tabs-more-right', t.scrollWidth - t.clientWidth - t.scrollLeft > 4);
  }
  if (typeof window.switchTab === 'function') {
    const origSwitch = window.switchTab;
    window.switchTab = function (el) {
      const r = origSwitch.apply(this, arguments);
      if (TOUCHY() && el?.scrollIntoView && el.closest('#proj-tabs')) {
        el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
      }
      return r;
    };
  }
  document.getElementById('proj-tabs')?.addEventListener('scroll', tabsHint, { passive: true });
  window.addEventListener('resize', tabsHint);
  new MutationObserver(tabsHint).observe(document.getElementById('pg-project-detail') || document.body, { attributes: true, attributeFilter: ['class'] });

  // ── 4. iPad : barre latérale en icônes par défaut ─────────────────────────
  if (localStorage.getItem('vem_nav_collapsed') === null
    && window.matchMedia('(min-width: 769px) and (max-width: 1180px)').matches) {
    document.body.classList.add('nav-collapsed');
  }
})();
