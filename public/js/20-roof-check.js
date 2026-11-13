// ═══ PLAN DE CONTRÔLE DE L'ÉTANCHÉITÉ DE TOITURE ═══
// Le plan est préparé et publié depuis Plans Viewbox › onglet « Toiture » (une pastille par jonction, croisement,
// extrémité, angle de toiture, raccord d'étage). Ici, sur chantier : on touche un point, on prend la photo, on valide
// → le point « 💧 Plan de contrôle de l'étanchéité de toiture » de la check-list de montage suit tout seul
// (API /roof-checks, src/routes/roofChecks.ts). Carte en haut de l'onglet Daily Reports, plan plein écran.

const RC_STATUS = {
  pending: { label: 'À faire', color: '#64748b', icon: '⏳' },
  ok:      { label: 'OK',      color: '#16a34a', icon: '✅' },
  partial: { label: 'Partiel', color: '#f59e0b', icon: '🟠' },
  nok:     { label: 'Non fait', color: '#dc2626', icon: '❌' },
  na:      { label: 'N.A.',    color: '#94a3b8', icon: '➖' },
};
const RC_COMMENT_REQUIRED = ['partial', 'nok', 'na'];
const RC_TYPE_ORDER = ['seam-long', 'seam-short', 'cross', 'tee', 'end', 'outer-corner', 'step', 'custom'];
const RC_FILTERS = {
  todo: { label: 'À faire', match: p => ['pending', 'partial', 'nok'].includes(p.status) },
  problems: { label: 'Problèmes', match: p => ['partial', 'nok'].includes(p.status) },
  all: { label: 'Tout', match: () => true },
};
let RCF = null; // état du plan plein écran

const rcShort = code => String(code || '').replace(/^N\d+-/, '');

function rcActive(p, cfg) {
  return !p.archived && !p.excluded && (cfg?.includeCovered !== false || !p.covered);
}

function rcProgressHtml(s) {
  if (!s) return '';
  return `
    <div style="display:flex;align-items:center;gap:10px;margin-top:8px;">
      <div class="prog" style="flex:1;height:8px;"><div class="prog-bar" style="width:${s.percent}%;background:var(--green);"></div></div>
      <div style="font-size:12px;font-weight:700;color:var(--text2);white-space:nowrap;">${s.closed}/${s.total}</div>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:12px;margin-top:6px;color:var(--text2);">
      ${['ok', 'partial', 'nok', 'na', 'pending'].map(k => `<span title="${RC_STATUS[k].label}" style="white-space:nowrap;">${RC_STATUS[k].icon} ${s[k] || 0}</span>`).join('')}
    </div>`;
}

// ─── Carte du projet (onglet Daily Reports) ───

async function loadRoofCheckCard(projectId) {
  const el = document.getElementById('detail-roofcheck-card');
  if (!el) return;
  if (el.dataset.projectId !== projectId) el.innerHTML = '';
  const res = await api('GET', `/roof-checks/project/${projectId}`);
  if (CURRENT_PROJECT_ID !== projectId) return;
  el.dataset.projectId = projectId;
  if (!res?.success) { el.innerHTML = ''; return; }
  const v = res.data;
  const rc = v.roofCheck;
  const published = !!rc?.publishedAt;
  const canConf = v.perms?.canConfigure;
  // pas encore préparé : seulement pour ceux qui peuvent le préparer
  if (!published && !canConf) { el.innerHTML = ''; return; }
  const disabled = rc && !rc.enabled;
  const plans = typeof hasPlansAccess === 'function' && hasPlansAccess();
  let body;
  if (disabled) {
    body = `<div style="font-size:12px;color:var(--text3);margin-top:6px;">Désactivé pour ce projet.</div>`;
  } else if (!published) {
    body = `<div style="font-size:12px;color:var(--text3);margin-top:6px;line-height:1.6;">Pas encore préparé. Il se prépare en un clic depuis le modèle 3D : <b>Plans Viewbox › onglet Toiture › 📤 Publier dans VEM</b>. Chaque jonction, croisement, extrémité et angle de toiture devient un point à photographier sur chantier.</div>`;
  } else {
    const blocking = v.config.critical === true ? '<span class="badge badge-red" title="Le lien de signature du handover attend que tous les points soient faits">Bloquant pour la signature</span>'
      : v.config.critical === false ? '<span class="badge badge-muted">Non bloquant</span>' : '';
    body = `
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
        ${blocking}
        ${v.summary?.problems ? `<span class="badge badge-amber">⚠️ ${v.summary.problems} problème(s)</span>` : ''}
        ${v.newerModel ? `<span class="badge badge-amber" title="${esc(v.newerModel.fileName)}">Modèle 3D plus récent : à republier depuis Plans › Toiture</span>` : ''}
      </div>
      ${rcProgressHtml(v.summary)}`;
  }
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px;">
      <div class="card-body" style="padding:12px 14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:14px;">💧 Étanchéité de toiture — plan de contrôle</div>
            <div style="font-size:12px;color:var(--text3);margin-top:2px;">Un point par jonction, croisement, extrémité et angle : on le touche, on prend la photo, on valide.</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${published && !disabled ? `<button class="btn btn-primary btn-sm" onclick="openRoofCheck('${projectId}')">💧 ${v.perms?.canFill ? 'Ouvrir le plan' : 'Voir le plan'}</button>` : ''}
            ${published && !disabled ? `<button class="btn btn-ghost btn-sm" title="PDF de la check-list de montage, avec le plan de toiture et ses photos" onclick="openChecklistExport('${projectId}','installation')">📄 PDF</button>` : ''}
            ${canConf && plans ? `<button class="btn btn-ghost btn-sm" onclick="openPlansViewbox('${projectId}')">📐 Plans Viewbox</button>` : ''}
            ${canConf && rc ? `<button class="btn btn-ghost btn-sm" onclick="openRoofCheckSettings('${projectId}')">⚙️ Réglages</button>` : ''}
          </div>
        </div>
        ${body}
      </div>
    </div>`;
}

// ─── Ligne / bannière dans la check-list de montage (js/15-checklists.js) ───

function roofmapChecklistRowHtml(it, projectId) {
  const st = RC_STATUS[it.status] || RC_STATUS.pending;
  return `
    <div id="clf-item-${it.id}" class="clf-row" style="border-left-color:${it.status === 'pending' ? 'var(--border)' : st.color};">
      <div class="clf-line">
        <div class="clf-label" onclick="openRoofCheck('${projectId}')" style="cursor:pointer;">
          <div class="clf-label-text">${esc(it.label)}${it.critical ? '<span title="Point critique" style="color:var(--accent);"> ⚠️</span>' : ''}</div>
          <div class="clf-sub">${esc(it.comment || it.hint || '')}</div>
        </div>
        <span class="badge" style="background:${st.color}22;color:${st.color};flex-shrink:0;">${st.icon} ${st.label}</span>
        <button class="btn btn-primary btn-sm" style="min-height:44px;flex-shrink:0;" onclick="openRoofCheck('${projectId}')">💧 Ouvrir le plan</button>
      </div>
    </div>`;
}

function roofmapSlidesBannerHtml() {
  if (!CLF) return '';
  const it = [...CLF.items.values()].find(x => x.kind === 'roofmap');
  if (!it) return '';
  const st = RC_STATUS[it.status] || RC_STATUS.pending;
  return `
    <div style="max-width:560px;margin:12px auto 0;padding:0 14px;">
      <div style="display:flex;align-items:center;gap:10px;background:var(--bg2);border:1px solid var(--border);border-left:4px solid ${st.color};border-radius:12px;padding:10px 12px;">
        <div style="flex:1;min-width:0;font-size:12px;">
          <div style="font-weight:700;font-size:13px;">💧 Plan de toiture — ${st.icon} ${st.label}</div>
          <div style="color:var(--text3);overflow-wrap:anywhere;">${esc(it.comment || '')}</div>
        </div>
        <button class="btn btn-primary btn-sm" style="min-height:44px;" onclick="openRoofCheck('${CLF.projectId}')">Ouvrir</button>
      </div>
    </div>`;
}

/** Après le plan : le point « roofmap » de la check-list ouverte reprend son statut et son commentaire. */
async function roofmapRefreshChecklist(projectId) {
  if (!CLF || CLF.projectId !== projectId || CLF.phase !== 'installation') return;
  const res = await api('GET', `/checklists/project/${projectId}?phase=installation`);
  if (!res?.success || !res.data || !CLF) return;
  for (const it of res.data.items) {
    if (it.kind !== 'roofmap') continue;
    const cur = CLF.items.get(it.id);
    const next = { ...(cur || {}), ...it, _status: it.status, _comment: it.comment || '', _showComment: false };
    CLF.items.set(it.id, next);
    if (!CLF.order.includes(it.id)) CLF.order.push(it.id);
  }
  if (CLF.checklist) CLF.checklist.validatedAt = res.data.validatedAt;
  renderChecklistFull();
}

// ─── Plan plein écran ───

async function openRoofCheck(projectId, pointId) {
  const [res, proj] = await Promise.all([
    api('GET', `/roof-checks/project/${projectId}`),
    api('GET', `/projects/${projectId}`),
  ]);
  if (!res?.success) { toast(res?.error || 'Plan de toiture introuvable', 'error'); return; }
  if (!res.data.roofCheck?.publishedAt) { toast('Plan de toiture pas encore préparé (Plans Viewbox › Toiture › Publier)', 'error'); return; }
  const levels = res.data.roofCheck.levels || [];
  const first = res.data.points.find(p => rcActive(p, res.data.config) && p.status === 'pending');
  const level = pointId ? res.data.points.find(p => p.id === pointId)?.level : (first?.level ?? levels[0]?.level ?? 0);
  RCF = { projectId, data: res.data, project: proj?.success ? proj.data : null, level: level ?? 0, sel: pointId || null, zoom: null, filter: 'all', placing: false, busy: false, draft: null, poll: null };
  document.getElementById('roof-check-full')?.remove();
  const view = document.createElement('div');
  view.id = 'roof-check-full';
  view.style.cssText = 'position:fixed;inset:0;z-index:460;background:var(--bg);overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;';
  document.body.appendChild(view);
  document.querySelector('.bottom-nav')?.style.setProperty('display', 'none', 'important');
  document.getElementById('assistant-widget')?.style.setProperty('display', 'none');
  rcRender();
  if (pointId) rcOpenPoint(pointId);
  // un autre téléphone peut remplir en même temps : relecture toutes les 30 s quand aucun point n'est ouvert
  RCF.poll = setInterval(() => { if (RCF && !RCF.sel && !RCF.busy && document.visibilityState === 'visible') rcReload(); }, 30000);
  window.addEventListener('resize', rcOnResize);
}

function rcOnResize() {
  if (!RCF) return;
  clearTimeout(RCF._rz);
  RCF._rz = setTimeout(() => rcRenderPlan(), 150);
}

function closeRoofCheck() {
  if (!RCF) return;
  if (RCF.draft && RCF.draft.dirty && !confirm('Le commentaire de ce point n’est pas enregistré. Fermer quand même ?')) return;
  clearInterval(RCF.poll);
  window.removeEventListener('resize', rcOnResize);
  const projectId = RCF.projectId;
  RCF = null;
  document.getElementById('roof-check-full')?.remove();
  if (!document.getElementById('checklist-full')) {
    document.querySelector('.bottom-nav')?.style.removeProperty('display');
    document.getElementById('assistant-widget')?.style.removeProperty('display');
  }
  if (typeof reloadChecklistCards === 'function') reloadChecklistCards(projectId);
  if (CURRENT_PROJECT_ID === projectId) loadRoofCheckCard(projectId);
  roofmapRefreshChecklist(projectId);
}

async function rcReload() {
  if (!RCF) return;
  const projectId = RCF.projectId;
  const res = await api('GET', `/roof-checks/project/${projectId}`);
  if (!RCF || RCF.projectId !== projectId || !res?.success) return;
  RCF.data = res.data;
  rcRender();
  if (RCF.sel) rcRenderSheet();
}

function rcPoints() {
  return (RCF?.data?.points || []).filter(p => rcActive(p, RCF.data.config));
}

/** Résumé recalculé localement (mêmes règles que parentSummary côté serveur). */
function rcSummary(points) {
  const s = { total: points.length, pending: 0, ok: 0, partial: 0, nok: 0, na: 0 };
  for (const p of points) if (s[p.status] !== undefined) s[p.status]++;
  s.closed = s.ok + s.na;
  s.problems = s.partial + s.nok;
  s.percent = s.total ? Math.round((s.closed / s.total) * 100) : 0;
  return s;
}

function rcRender() {
  const view = document.getElementById('roof-check-full');
  if (!view || !RCF) return;
  const d = RCF.data;
  const levels = d.roofCheck.levels || [];
  const pts = rcPoints();
  const s = rcSummary(pts);
  const p = RCF.project;
  view.innerHTML = `
    <div style="position:sticky;top:0;z-index:5;background:var(--bg2);border-bottom:1px solid var(--border);box-shadow:0 4px 14px rgba(0,0,0,.25);">
      <div style="max-width:1000px;margin:0 auto;padding:10px 14px 10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <button class="btn btn-ghost btn-sm" style="min-height:44px;flex-shrink:0;" onclick="closeRoofCheck()">← Fermer</button>
          <div style="min-width:0;flex:1;">
            <div style="font-family:'Syne',sans-serif;font-weight:800;font-size:15px;">💧 Étanchéité de toiture</div>
            <div style="font-size:12px;color:var(--text2);overflow-wrap:anywhere;">${esc(p ? `${p.name} · ${p.internalNumber || ''}` : '')}</div>
          </div>
          <button class="btn btn-ghost btn-sm" style="min-height:44px;flex-shrink:0;" title="Relire (un autre téléphone a pu remplir des points)" onclick="rcReload()">↻</button>
        </div>
        ${rcProgressHtml(s)}
        ${levels.length > 1 ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${levels.map(l => {
          const lp = pts.filter(x => x.level === l.level);
          const ls = rcSummary(lp);
          return `<button class="btn btn-sm ${l.level === RCF.level ? 'btn-primary' : 'btn-ghost'}" style="min-height:40px;" onclick="rcSetLevel(${l.level})">${esc(l.label)} · ${ls.closed}/${ls.total}</button>`;
        }).join('')}</div>` : ''}
      </div>
    </div>
    <div style="max-width:1000px;margin:0 auto;padding:10px 14px calc(${RCF.sel ? '70vh' : '40px'} + env(safe-area-inset-bottom));">
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px;">
        <button class="btn btn-ghost btn-sm" style="min-width:44px;min-height:40px;justify-content:center;" title="Zoom arrière" onclick="rcZoom(-1)">−</button>
        <button class="btn btn-ghost btn-sm" style="min-width:44px;min-height:40px;justify-content:center;" title="Zoom avant" onclick="rcZoom(1)">＋</button>
        ${d.perms?.canFill && (d.config.fieldPoints || d.perms.canConfigure) ? `<button class="btn btn-sm ${RCF.placing ? 'btn-primary' : 'btn-ghost'}" style="min-height:40px;" onclick="rcTogglePlacing()">${RCF.placing ? '👆 Touche le plan à l’endroit du point…' : '＋ Ajouter un point'}</button>` : ''}
        <div style="flex:1;"></div>
        <span style="font-size:11px;color:var(--text3);">${['ok', 'partial', 'nok', 'pending'].map(k => `<span style="color:${RC_STATUS[k].color};">●</span> ${RC_STATUS[k].label}`).join(' · ')}</span>
      </div>
      <div id="rc-plan" style="overflow:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--border);border-radius:10px;background:#fff;touch-action:pan-x pan-y;"></div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:14px 0 8px;">
        ${Object.entries(RC_FILTERS).map(([k, f]) => `<button class="btn btn-sm ${RCF.filter === k ? 'btn-primary' : 'btn-ghost'}" style="justify-content:center;min-height:40px;" onclick="rcSetFilter('${k}')">${f.label} (${pts.filter(x => x.level === RCF.level && f.match(x)).length})</button>`).join('')}
      </div>
      <div id="rc-list"></div>
    </div>
    <div id="rc-sheet"></div>`;
  rcRenderPlan();
  rcRenderList();
  if (RCF.sel) rcRenderSheet();
}

function rcSetLevel(level) {
  if (!RCF) return;
  RCF.level = level;
  RCF.zoom = null;
  rcRender();
}

function rcSetFilter(k) {
  if (!RCF) return;
  RCF.filter = k;
  rcRender();
}

function rcZoom(dir) {
  if (!RCF) return;
  RCF.zoom = Math.max(1, Math.min(6, (RCF.zoom || 1) * (dir > 0 ? 1.5 : 1 / 1.5)));
  rcRenderPlan();
}

function rcTogglePlacing() {
  if (!RCF) return;
  RCF.placing = !RCF.placing;
  rcRender();
}

/** Plan d'un niveau : box (étage du dessus en pointillés), jonctions, pastilles de taille fixe à l'écran. */
function rcRenderPlan() {
  const host = document.getElementById('rc-plan');
  if (!host || !RCF) return;
  const lvl = (RCF.data.roofCheck.levels || []).find(l => l.level === RCF.level);
  if (!lvl) { host.innerHTML = '<div class="empty"><div class="empty-title">Niveau introuvable</div></div>'; return; }
  const pts = rcPoints().filter(p => p.level === RCF.level);
  const all = [...lvl.boxes, ...(lvl.above || [])].flatMap(b => b.c).concat(pts.map(p => [p.geom.at.x, p.geom.at.z]));
  const minX = Math.min(...all.map(p => p[0])), maxX = Math.max(...all.map(p => p[0]));
  const minZ = Math.min(...all.map(p => p[1])), maxZ = Math.max(...all.map(p => p[1]));
  const pad = 700;
  const w = maxX - minX + 2 * pad, h = maxZ - minZ + 2 * pad;
  const boxW = Math.max(240, host.clientWidth || 360);
  const fit = boxW / w;
  // zoom de départ : assez pour que deux pastilles voisines ne se recouvrent pas (au plus × 3)
  if (!RCF.zoom) {
    let dmin = Infinity;
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
      dmin = Math.min(dmin, Math.hypot(pts[i].geom.at.x - pts[j].geom.at.x, pts[i].geom.at.z - pts[j].geom.at.z));
    RCF.zoom = Number.isFinite(dmin) && dmin > 0 ? Math.max(1, Math.min(3, 34 / (dmin * fit))) : 1;
  }
  const scale = fit * RCF.zoom; // px par mm
  const R = 15 / scale; // rayon d'une pastille : 15 px
  const X = x => (x - minX + pad).toFixed(0), Z = z => (z - minZ + pad).toFixed(0);
  const color = p => (RC_STATUS[p.status] || RC_STATUS.pending).color;
  const boxes = lvl.boxes.map(b => {
    const c = b.c.reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4], [0, 0]);
    return `<polygon points="${b.c.map(q => `${X(q[0])},${Z(q[1])}`).join(' ')}" fill="#e2e8f0" stroke="#334155" stroke-width="${(1.2 / scale).toFixed(1)}"/>
      <text x="${X(c[0])}" y="${Z(c[1])}" font-size="${(13 / scale).toFixed(0)}" text-anchor="middle" dominant-baseline="middle" fill="#94a3b8" font-family="Arial, sans-serif">${esc(b.label)}</text>`;
  }).join('');
  const above = (lvl.above || []).map(b => `<polygon points="${b.c.map(q => `${X(q[0])},${Z(q[1])}`).join(' ')}" fill="#94a3b8" fill-opacity="0.18" stroke="#475569" stroke-width="${(1.4 / scale).toFixed(1)}" stroke-dasharray="${(8 / scale).toFixed(0)} ${(5 / scale).toFixed(0)}"/>`).join('');
  const segs = pts.filter(p => p.geom.seg).map(p => `<line x1="${X(p.geom.seg.a[0])}" y1="${Z(p.geom.seg.a[1])}" x2="${X(p.geom.seg.b[0])}" y2="${Z(p.geom.seg.b[1])}" stroke="${color(p)}" stroke-width="${((p.id === RCF.sel ? 7 : 4.5) / scale).toFixed(0)}" stroke-linecap="round" opacity="0.85" pointer-events="none"/>`).join('');
  const dots = pts.map(p => {
    const sel = p.id === RCF.sel;
    const r = sel ? R * 1.3 : R;
    return `<g data-point="${p.id}" style="cursor:pointer;" onclick="event.stopPropagation();rcOpenPoint('${p.id}')">
      <circle cx="${X(p.geom.at.x)}" cy="${Z(p.geom.at.z)}" r="${(r * 1.6).toFixed(0)}" fill="transparent"/>
      <circle cx="${X(p.geom.at.x)}" cy="${Z(p.geom.at.z)}" r="${r.toFixed(0)}" fill="${color(p)}" stroke="${sel ? '#0f172a' : '#fff'}" stroke-width="${((sel ? 3 : 2) / scale).toFixed(0)}" ${p.covered ? `stroke-dasharray="${(4 / scale).toFixed(0)} ${(3 / scale).toFixed(0)}"` : ''}/>
      <text x="${X(p.geom.at.x)}" y="${Z(p.geom.at.z)}" font-size="${(r * 0.82).toFixed(0)}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-weight="700" font-family="Arial, sans-serif" pointer-events="none">${p.status === 'ok' ? '✓' : esc(rcShort(p.code))}</text>
    </g>`;
  }).join('');
  host.innerHTML = `<svg id="rc-svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="${(w * scale).toFixed(0)}" height="${(h * scale).toFixed(0)}" style="display:block;${RCF.placing ? 'cursor:crosshair;' : ''}" onclick="rcPlanClick(event)">${boxes}${above}${segs}${dots}</svg>`;
  RCF.planBox = { minX, minZ, pad };
  // point choisi : visible dans la zone qui défile
  if (RCF.sel) {
    const g = host.querySelector(`[data-point="${RCF.sel}"]`);
    g?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }
}

/** Clic sur le plan : ajoute un point à cet endroit en mode « ＋ Ajouter un point ». */
async function rcPlanClick(ev) {
  if (!RCF?.placing) return;
  const svg = document.getElementById('rc-svg');
  if (!svg) return;
  const pt = svg.createSVGPoint();
  pt.x = ev.clientX; pt.y = ev.clientY;
  const m = svg.getScreenCTM();
  if (!m) return;
  const q = pt.matrixTransform(m.inverse());
  const { minX, minZ, pad } = RCF.planBox;
  const at = { x: Math.round(q.x + minX - pad), z: Math.round(q.y + minZ - pad) };
  const label = prompt('Nom du point (ex. « Traversée câble airco », « Raccord gouttière ») :');
  if (!label || !label.trim()) return;
  const res = await checklistRequest('POST', `/roof-checks/project/${RCF.projectId}/points`, { level: RCF.level, at, label: label.trim() });
  if (!res.ok) { toast(res.data?.error || 'Point non ajouté', 'error'); return; }
  RCF.placing = false;
  RCF.data.points.push(res.data.data);
  toast(`Point ${rcShort(res.data.data.code)} ajouté`, 'success');
  rcRender();
  rcOpenPoint(res.data.data.id);
}

function rcRenderList() {
  const el = document.getElementById('rc-list');
  if (!el || !RCF) return;
  const typeLabels = RCF.data.typeLabels || {};
  const pts = rcPoints().filter(p => p.level === RCF.level && RC_FILTERS[RCF.filter].match(p));
  if (!pts.length) {
    el.innerHTML = `<div class="empty"><div class="empty-icon">${RCF.filter === 'all' ? '💧' : '🎉'}</div><div class="empty-title">${RCF.filter === 'todo' ? 'Plus rien à faire sur ce niveau' : RCF.filter === 'problems' ? 'Aucun problème' : 'Aucun point'}</div></div>`;
    return;
  }
  el.innerHTML = pts.map(p => {
    const st = RC_STATUS[p.status] || RC_STATUS.pending;
    return `
      <div onclick="rcOpenPoint('${p.id}')" style="display:flex;align-items:center;gap:10px;padding:10px 12px;margin-bottom:6px;background:var(--bg2);border:1px solid ${p.id === RCF.sel ? 'var(--accent)' : 'var(--border)'};border-left:4px solid ${st.color};border-radius:10px;cursor:pointer;min-height:48px;">
        <span style="flex-shrink:0;min-width:42px;text-align:center;font-weight:800;font-size:12px;color:#fff;background:${st.color};border-radius:14px;padding:4px 6px;">${esc(rcShort(p.code))}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;overflow-wrap:anywhere;">${esc(p.label || typeLabels[p.type] || p.type)}</div>
          <div style="font-size:11px;color:var(--text3);">${esc(typeLabels[p.type] || '')}${p.covered ? ' · sous l’étage du dessus' : ''}${p.photos.length ? ` · 📷 ${p.photos.length}` : ''}${p.comment ? ` · ${esc(p.comment)}` : ''}</div>
        </div>
        <span style="font-size:12px;color:${st.color};white-space:nowrap;">${st.icon} ${st.label}</span>
      </div>`;
  }).join('');
}

// ─── Fiche d'un point (volet du bas) ───

function rcPoint(id) {
  return RCF?.data?.points.find(p => p.id === id) || null;
}

function rcOpenPoint(id) {
  if (!RCF) return;
  if (RCF.draft?.dirty && RCF.draft.id !== id && !confirm('Le commentaire du point ouvert n’est pas enregistré. Changer de point quand même ?')) return;
  const p = rcPoint(id);
  if (!p) return;
  if (p.level !== RCF.level) { RCF.level = p.level; RCF.zoom = null; }
  RCF.sel = id;
  RCF.draft = { id, comment: p.comment || '', tasksDone: { ...(p.tasksDone || {}) }, dirty: false };
  rcRender();
}

function rcCloseSheet() {
  if (!RCF) return;
  if (RCF.draft?.dirty && !confirm('Le commentaire n’est pas enregistré. Fermer quand même ?')) return;
  RCF.sel = null;
  RCF.draft = null;
  rcRender();
}

function rcRenderSheet() {
  const el = document.getElementById('rc-sheet');
  const p = rcPoint(RCF?.sel);
  if (!el || !p) { if (el) el.innerHTML = ''; return; }
  const d = RCF.draft || { comment: p.comment || '', tasksDone: { ...(p.tasksDone || {}) } };
  const canFill = !!RCF.data.perms?.canFill;
  const st = RC_STATUS[p.status] || RC_STATUS.pending;
  const typeLabel = (RCF.data.typeLabels || {})[p.type] || p.type;
  const photos = p.photos || [];
  const needPhoto = photos.length < (p.minPhotos ?? 1);
  el.innerHTML = `
    <div style="position:fixed;left:0;right:0;bottom:0;z-index:470;background:var(--bg2);border-top:1px solid var(--border);box-shadow:0 -8px 24px rgba(0,0,0,.35);border-radius:16px 16px 0 0;max-height:70vh;overflow-y:auto;overscroll-behavior:contain;">
      <div style="max-width:720px;margin:0 auto;padding:12px 14px calc(16px + env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:flex-start;gap:10px;">
          <span style="flex-shrink:0;font-weight:800;font-size:13px;color:#fff;background:${st.color};border-radius:14px;padding:5px 9px;">${esc(rcShort(p.code))}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:14px;overflow-wrap:anywhere;">${esc(p.label || typeLabel)}</div>
            <div style="font-size:12px;color:var(--text3);">${esc(typeLabel)} · ${st.icon} ${st.label}${p.checkedBy ? ` par ${esc(checklistShortName(p.checkedBy))} le ${fmtDateTime(p.checkedAt)}` : ''}</div>
            ${p.covered ? '<div style="font-size:12px;color:var(--amber);margin-top:3px;">⬆️ Sous la box de l’étage du dessus : à contrôler et photographier avant de la poser.</div>' : ''}
            ${p.hint ? `<div style="font-size:12px;color:var(--text2);margin-top:3px;">${esc(p.hint)}</div>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm" style="min-width:44px;min-height:44px;justify-content:center;" title="Point précédent" onclick="rcStep(-1)">◀</button>
          <button class="btn btn-ghost btn-sm" style="min-width:44px;min-height:44px;justify-content:center;" title="Point suivant" onclick="rcStep(1)">▶</button>
          <button class="btn btn-ghost btn-sm" style="min-width:44px;min-height:44px;justify-content:center;" title="Fermer" onclick="rcCloseSheet()">✕</button>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px;">
          ${photos.map(ph => `
            <div style="position:relative;">
              <img src="${esc(ph.photoUrl)}" alt="" loading="lazy" onclick="openFileViewer('${esc(ph.photoUrl)}','photo.jpg')" style="width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid var(--border);cursor:pointer;">
              ${canFill ? `<button title="Supprimer la photo" onclick="rcDeletePhoto('${ph.id}')" style="position:absolute;top:-6px;right:-6px;width:24px;height:24px;border-radius:12px;border:none;background:var(--accent);color:#fff;font-size:12px;cursor:pointer;">✕</button>` : ''}
            </div>`).join('')}
          ${canFill ? `
            <label class="btn ${needPhoto ? 'btn-primary' : 'btn-ghost'}" style="min-height:52px;cursor:pointer;">
              📷 ${photos.length ? 'Autre photo' : 'Prendre la photo'}
              <input type="file" accept="image/*" capture="environment" style="display:none;" onchange="rcUploadPhotos(this)">
            </label>
            <label class="btn btn-ghost btn-sm" style="min-height:44px;cursor:pointer;" title="Choisir dans la galerie">
              🖼️ Galerie
              <input type="file" accept="image/*" multiple style="display:none;" onchange="rcUploadPhotos(this)">
            </label>` : (photos.length ? '' : '<span style="font-size:12px;color:var(--text3);">Pas encore de photo.</span>')}
          <span id="rc-upload-state" style="font-size:12px;color:var(--text3);"></span>
        </div>

        ${p.tasks?.length ? `
          <div style="margin-top:12px;">
            <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px;">À vérifier</div>
            ${p.tasks.map(t => `
              <label style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;font-size:13px;cursor:${canFill ? 'pointer' : 'default'};min-height:40px;">
                <input type="checkbox" ${d.tasksDone[t.key] ? 'checked' : ''} ${canFill ? '' : 'disabled'} onchange="rcToggleTask('${t.key}', this.checked)" style="width:22px;height:22px;flex-shrink:0;margin-top:1px;">
                <span>${esc(t.label)}</span>
              </label>`).join('')}
          </div>` : ''}

        <div style="margin-top:10px;">
          ${canFill ? `<textarea class="input" id="rc-comment" rows="2" placeholder="Commentaire (obligatoire pour Partiel, Non fait, N.A.)" oninput="rcCommentInput(this.value)" style="width:100%;min-height:48px;resize:vertical;">${esc(d.comment)}</textarea>`
            : (p.comment ? `<div style="font-size:13px;color:var(--text2);white-space:pre-wrap;">${esc(p.comment)}</div>` : '')}
        </div>

        ${canFill ? `
          <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;margin-top:12px;">
            <button class="btn" style="min-height:54px;justify-content:center;font-weight:800;background:${RC_STATUS.ok.color};color:#fff;border:none;" ${RCF.busy ? 'disabled' : ''} onclick="rcSave('ok')">✓ OK${needPhoto ? ' 📷' : ''}</button>
            <button class="btn btn-ghost" style="min-height:54px;justify-content:center;color:${RC_STATUS.partial.color};" ${RCF.busy ? 'disabled' : ''} onclick="rcSave('partial')">½ Partiel</button>
            <button class="btn btn-ghost" style="min-height:54px;justify-content:center;color:${RC_STATUS.nok.color};" ${RCF.busy ? 'disabled' : ''} onclick="rcSave('nok')">✕ Non fait</button>
            <button class="btn btn-ghost" style="min-height:54px;justify-content:center;" ${RCF.busy ? 'disabled' : ''} onclick="rcSave('na')">N/A</button>
          </div>
          <div style="display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:12px;color:var(--text3);">
            <span>${needPhoto ? 'OK demande la photo du point.' : 'OK coche toutes les vérifications.'}</span>
            ${p.status !== 'pending' ? `<a href="#" onclick="event.preventDefault();rcSave('pending')" style="color:var(--text3);">Remettre « À faire »</a>` : ''}
          </div>` : ''}
        ${p.logsCount ? `<div style="margin-top:8px;"><a href="#" style="font-size:12px;color:var(--text3);" onclick="event.preventDefault();rcShowHistory('${p.id}')">🕘 Historique (${p.logsCount})</a></div>` : ''}
      </div>
    </div>`;
}

function rcToggleTask(key, on) {
  if (!RCF?.draft) return;
  RCF.draft.tasksDone[key] = on;
  RCF.draft.dirty = true;
}

function rcCommentInput(v) {
  if (!RCF?.draft) return;
  RCF.draft.comment = v;
  RCF.draft.dirty = true;
}

/** Ordre de passage : niveau puis ordre du plan. */
function rcOrdered() {
  return rcPoints().slice().sort((a, b) => a.level - b.level || a.sortOrder - b.sortOrder || String(a.code).localeCompare(String(b.code)));
}

function rcStep(dir) {
  if (!RCF?.sel) return;
  const list = rcOrdered();
  const i = list.findIndex(p => p.id === RCF.sel);
  const next = list[(i + dir + list.length) % list.length];
  if (next) rcOpenPoint(next.id);
}

/** Point suivant à faire après celui-ci (même niveau d'abord), ou null. */
function rcNextTodo(fromId) {
  const list = rcOrdered();
  const i = list.findIndex(p => p.id === fromId);
  const rest = [...list.slice(i + 1), ...list.slice(0, Math.max(0, i))];
  return rest.find(p => p.status === 'pending') || null;
}

function rcReplacePoint(pt) {
  if (!RCF || !pt) return;
  const i = RCF.data.points.findIndex(p => p.id === pt.id);
  if (i >= 0) RCF.data.points[i] = pt; else RCF.data.points.push(pt);
}

async function rcSave(status) {
  if (!RCF?.sel || RCF.busy) return;
  const p = rcPoint(RCF.sel);
  const d = RCF.draft || { comment: p.comment || '', tasksDone: p.tasksDone || {} };
  const comment = (d.comment || '').trim();
  if (RC_COMMENT_REQUIRED.includes(status) && !comment) {
    toast(`Commentaire obligatoire pour « ${RC_STATUS[status].label} » : explique ce qui manque.`, 'error');
    document.getElementById('rc-comment')?.focus();
    return;
  }
  if (status === 'ok' && (p.photos || []).length < (p.minPhotos ?? 1)) {
    toast('Prends d’abord la photo du point.', 'error');
    return;
  }
  RCF.busy = true;
  rcRenderSheet();
  const res = await checklistRequest('PATCH', `/roof-checks/points/${p.id}`, { status, comment, tasksDone: d.tasksDone, version: p.version });
  if (!RCF) return;
  RCF.busy = false;
  if (res.status === 409 && res.data?.data) {
    rcReplacePoint(res.data.data);
    RCF.draft = { id: p.id, comment: res.data.data.comment || '', tasksDone: { ...(res.data.data.tasksDone || {}) }, dirty: false };
    toast(res.data.error || 'Ce point vient d’être modifié', 'error');
    rcRender();
    return;
  }
  if (!res.ok) { toast(res.data?.error || 'Pas enregistré (réseau ?) : réessaie', 'error'); rcRenderSheet(); return; }
  rcReplacePoint(res.data.data);
  RCF.draft = null;
  toast(`${rcShort(p.code)} : ${RC_STATUS[status].label}`, 'success');
  // OK / N.A. : on passe directement au point suivant à faire
  const next = status === 'ok' || status === 'na' ? rcNextTodo(p.id) : null;
  if (next) rcOpenPoint(next.id);
  else { RCF.sel = status === 'ok' || status === 'na' ? null : p.id; if (RCF.sel) RCF.draft = { id: p.id, comment: res.data.data.comment || '', tasksDone: { ...(res.data.data.tasksDone || {}) }, dirty: false }; rcRender(); }
  if (!next && (status === 'ok' || status === 'na') && !rcPoints().some(x => x.status === 'pending')) toast('🎉 Tous les points de la toiture sont contrôlés', 'success');
}

async function rcUploadPhotos(input) {
  if (!RCF?.sel) return;
  const id = RCF.sel;
  const files = [...(input.files || [])];
  input.value = '';
  if (!files.length) return;
  const state = document.getElementById('rc-upload-state');
  RCF.busy = true;
  let done = 0;
  for (const f of files) {
    if (state) state.textContent = `Envoi ${done + 1}/${files.length}…`;
    const file = typeof checklistShrinkPhoto === 'function' ? await checklistShrinkPhoto(f) : f;
    const fd = new FormData();
    fd.append('file', file, file.name || 'photo.jpg');
    const res = await checklistRequest('POST', `/roof-checks/points/${id}/photos`, fd);
    if (!RCF) return;
    if (!res.ok) { toast(res.data?.error || 'Photo non envoyée (réseau ?)', 'error'); break; }
    rcReplacePoint(res.data.data.point);
    done++;
  }
  RCF.busy = false;
  if (RCF.draft && RCF.sel === id) { /* garder le commentaire en cours */ }
  if (done) toast(done > 1 ? `${done} photos envoyées` : 'Photo envoyée — touche « ✓ OK » si tout est fait', 'success');
  rcRender();
}

async function rcDeletePhoto(photoId) {
  if (!RCF?.sel || !confirm('Supprimer cette photo ?')) return;
  const res = await checklistRequest('DELETE', `/roof-checks/photos/${photoId}`);
  if (!res.ok) { toast(res.data?.error || 'Photo non supprimée', 'error'); return; }
  rcReplacePoint(res.data.data);
  rcRender();
}

async function rcShowHistory(pointId) {
  const res = await api('GET', `/roof-checks/points/${pointId}/logs`);
  if (!res?.success) { toast(res?.error || 'Historique indisponible', 'error'); return; }
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.innerHTML = `
    <div class="modal" style="max-width:480px;">
      <div class="modal-head"><div class="modal-title">🕘 Historique du point</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      ${res.data.map(l => `
        <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <div><b>${(RC_STATUS[l.fromStatus] || {}).label || '—'} → ${(RC_STATUS[l.toStatus] || {}).label || '—'}</b> <span style="color:var(--text3);font-size:12px;">${fmtDateTime(l.createdAt)}${l.user ? ` · ${esc(checklistShortName(l.user))}` : ''}</span></div>
          ${l.comment ? `<div style="color:var(--text2);white-space:pre-wrap;">${esc(l.comment)}</div>` : ''}
        </div>`).join('') || '<div style="color:var(--text3);">Rien pour l’instant.</div>'}
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

// ─── Réglages du projet (admin, technical manager, project manager) ───

async function openRoofCheckSettings(projectId) {
  const res = await api('GET', `/roof-checks/project/${projectId}`);
  if (!res?.success) { toast(res?.error || 'Erreur de chargement', 'error'); return; }
  const v = res.data;
  const c = v.config;
  const labels = v.typeLabels || {};
  const counts = {};
  for (const p of v.points) if (!p.archived) counts[p.type] = (counts[p.type] || 0) + 1;
  const radio = (name, val, cur, text) => `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;font-size:13px;cursor:pointer;"><input type="radio" name="${name}" value="${val}" ${cur === val ? 'checked' : ''}> ${text}</label>`;
  const check = (id, on, text, sub) => `<label style="display:flex;gap:10px;align-items:flex-start;padding:6px 0;font-size:13px;cursor:pointer;"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} style="margin-top:2px;"><span>${text}${sub ? `<br><span style="font-size:11px;color:var(--text3);">${sub}</span>` : ''}</span></label>`;
  const el = document.createElement('div');
  el.className = 'overlay open';
  el.id = 'rc-settings';
  el.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-head"><div class="modal-title">⚙️ Plan de toiture — réglages du projet</div><button class="modal-close" onclick="this.closest('.overlay').remove()">×</button></div>
      <div class="form-group2"><label class="form-label2">Signature du handover</label>
        ${radio('rc-critical', 'true', c.critical === true ? 'true' : c.critical === false ? 'false' : '', 'Bloquante : le lien de signature attend que tous les points soient faits')}
        ${radio('rc-critical', 'false', c.critical === true ? 'true' : c.critical === false ? 'false' : '', 'Non bloquante : le plan est montré au client, mais ne bloque pas la signature')}
      </div>
      <div class="form-group2"><label class="form-label2">Points à contrôler</label>
        ${RC_TYPE_ORDER.filter(t => t !== 'custom').map(t => check(`rc-type-${t}`, c.types?.[t] !== false, `${esc(labels[t] || t)}${counts[t] ? ` <span style="color:var(--text3);">(${counts[t]})</span>` : ''}`)).join('')}
      </div>
      <div class="form-group2"><label class="form-label2">Options</label>
        ${check('rc-covered', c.includeCovered !== false, 'Contrôler aussi les toits sous un étage', 'À photographier avant de poser la box du dessus.')}
        ${check('rc-field', c.fieldPoints !== false, 'Le site manager peut ajouter des points sur chantier', 'Traversée de câble, airco, gouttière…')}
        ${check('rc-generic', c.replaceGenericItems !== false, 'Les 3 points « toiture » de la check-list sont faits par le plan', 'Caoutchouc supérieur, bandes Rooftec, bandes croisées : N.A. « Contrôlé sur le plan de toiture ».')}
        <label style="display:flex;gap:10px;align-items:center;padding:6px 0;font-size:13px;">Photos par point <input class="input" id="rc-photos" type="number" min="0" max="10" value="${c.minPhotos ?? 1}" style="width:70px;"></label>
      </div>
      ${v.roofCheck ? check('rc-enabled', v.roofCheck.enabled !== false, 'Plan de toiture activé pour ce projet', 'Désactivé : le point de la check-list passe N.A.') : ''}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="btn btn-outline" onclick="this.closest('.overlay').remove()">Annuler</button>
        <button class="btn btn-primary" onclick="saveRoofCheckSettings('${projectId}')">💾 Enregistrer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}

async function saveRoofCheckSettings(projectId) {
  const el = document.getElementById('rc-settings');
  if (!el) return;
  const crit = el.querySelector('input[name="rc-critical"]:checked')?.value;
  const types = {};
  for (const t of RC_TYPE_ORDER) { const cb = el.querySelector(`#rc-type-${t}`); if (cb) types[t] = cb.checked; }
  const body = {
    types,
    includeCovered: el.querySelector('#rc-covered').checked,
    fieldPoints: el.querySelector('#rc-field').checked,
    replaceGenericItems: el.querySelector('#rc-generic').checked,
    minPhotos: Number(el.querySelector('#rc-photos').value) || 0,
  };
  if (crit === 'true' || crit === 'false') body.critical = crit === 'true';
  const en = el.querySelector('#rc-enabled');
  if (en) body.enabled = en.checked;
  const res = await checklistRequest('PUT', `/roof-checks/project/${projectId}/config`, body);
  if (!res.ok) { toast(res.data?.error || 'Réglages non enregistrés', 'error'); return; }
  el.remove();
  toast('Réglages du plan de toiture enregistrés', 'success');
  if (CURRENT_PROJECT_ID === projectId) loadRoofCheckCard(projectId);
  if (typeof reloadChecklistCards === 'function') reloadChecklistCards(projectId);
  if (RCF && RCF.projectId === projectId) rcReload();
}
