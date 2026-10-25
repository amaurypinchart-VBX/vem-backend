(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var deck = document.getElementById('deck');
  var cur = 0;
  var notesOpen = false;
  try { notesOpen = localStorage.getItem('vemFormationNotes') === '1'; } catch (e) {}

  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    deck.style.transform = 'scale(' + s + ')';
  }
  function show(i, fromHash) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    slides[cur].classList.remove('on');
    cur = i;
    var el = slides[cur];
    el.classList.add('on');
    document.getElementById('count').textContent = (cur + 1) + ' / ' + slides.length;
    document.getElementById('prog').style.width = ((cur + 1) / slides.length * 100) + '%';
    var n = el.querySelector('.notes');
    document.getElementById('notesPanel').textContent = n ? n.textContent : '';
    var mod = el.getAttribute('data-module');
    document.querySelectorAll('.toc a').forEach(function (a) {
      a.classList.toggle('cur', a.querySelector('.tt').textContent === mod);
    });
    if (!fromHash && history.replaceState) history.replaceState(null, '', '#' + el.id);
  }
  function fromHash() {
    var h = decodeURIComponent((location.hash || '').slice(1));
    if (!h) return 0;
    var el = document.getElementById(h);
    if (el && el.classList.contains('slide')) return slides.indexOf(el);
    var m = /^s(\d+)$/.exec(h);
    return m ? +m[1] - 1 : 0;
  }
  function selectText(el) {
    var r = document.createRange(); r.selectNodeContents(el);
    var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  }
  function toggleToc(open) { document.getElementById('toc').classList.toggle('open', open); }
  function toggleNotes() {
    notesOpen = !notesOpen;
    document.getElementById('notesPanel').classList.toggle('open', notesOpen);
    try { localStorage.setItem('vemFormationNotes', notesOpen ? '1' : '0'); } catch (e) {}
  }

  document.getElementById('prev').onclick = function () { show(cur - 1); };
  document.getElementById('next').onclick = function () { show(cur + 1); };
  document.getElementById('notesBtn').onclick = toggleNotes;
  document.getElementById('tocBtn').onclick = function () { toggleToc(true); };
  document.getElementById('tocClose').onclick = function () { toggleToc(false); };
  document.getElementById('toc').addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (a) { e.preventDefault(); show(+a.getAttribute('data-go') - 1); toggleToc(false); }
    else if (e.target.id === 'toc') toggleToc(false);
  });
  document.getElementById('stage').addEventListener('click', function (e) {
    var cp = e.target.closest('[data-copy]');
    if (cp) {
      var pre = cp.parentNode.querySelector('pre');
      var done = function () { cp.textContent = '✅ Copié'; setTimeout(function () { cp.textContent = '📋 Copier'; }, 2000); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pre.textContent).then(done, function () { selectText(pre); });
      else selectText(pre);
      return;
    }
    if (e.target.closest('a,button,pre')) return;
    if (e.clientX < window.innerWidth * 0.25) show(cur - 1); else show(cur + 1);
  });
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key;
    if (k === 'ArrowRight' || k === 'PageDown' || k === ' ') { e.preventDefault(); show(cur + 1); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { e.preventDefault(); show(cur - 1); }
    else if (k === 'Home') show(0);
    else if (k === 'End') show(slides.length - 1);
    else if (k === 'n' || k === 'N') toggleNotes();
    else if (k === 's' || k === 'S') toggleToc(!document.getElementById('toc').classList.contains('open'));
    else if (k === 'Escape') toggleToc(false);
  });
  var tx = null, ty = null;
  document.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (tx === null) return;
    var dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(dx < 0 ? cur + 1 : cur - 1);
    tx = ty = null;
  });
  window.addEventListener('hashchange', function () { show(fromHash(), true); });
  window.addEventListener('resize', fit);
  document.getElementById('notesPanel').classList.toggle('open', notesOpen);
  fit();
  slides[0].classList.add('on');
  show(fromHash(), true);
})();
