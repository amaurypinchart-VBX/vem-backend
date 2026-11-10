// ═══════════════════════════════════════════════════════════════
// PLANNING ESTIMATIF DE MONTAGE / DÉMONTAGE (onglet Infos du projet)
// Tableau type Gantt facile à remplir : lignes = tâches, colonnes = jours, tranches horaires ou heures.
// Se remplit tout seul avec les données du projet (camions → jalons à leur date et heure, présence de l'équipe,
// handover) et reste entièrement modifiable. Export PDF / image, envoi par mail au client, slide du briefing.
// Serveur : src/routes/assemblyPlans.ts (table assembly_plans, un planning par projet et par phase).
//
// Le planning (`plan`) est un JSON :
//   { v, title, lang 'fr'|'en', scale 'day'|'slot'|'hour', from / to 'YYYY-MM-DD', hours {start, end},
//     slots [{id, label, from 'HH:MM', to 'HH:MM'}], offDays {'YYYY-MM-DD': libellé}, note, dismissed [src],
//     rows [{ id, kind 'task'|'section'|'milestone'|'crew', label, labelAuto?, who, color, internal?,
//             bars [{id, s, e, text, color, src?}] (tâches), at, noTime (jalons), src?, detached?, tpl? }] }
// Les heures sont des chaînes locales « YYYY-MM-DDTHH:MM » (heure du chantier), sans fuseau.
// ═══════════════════════════════════════════════════════════════

const AP_EDIT_ROLES = ['admin', 'project_manager', 'technical_manager', 'engineer', 'sales_engineer', 'warehouse', 'site_manager'];
const AP_COLORS = ['#f4b183', '#9dc3e6', '#a9d18e', '#ffd966', '#c9a0dc', '#f8cbad', '#8faadc', '#ea9999', '#76a5af', '#b7b7b7'];
const AP_DEFAULT_COLOR = '#f4b183';
const AP_MS_COLOR = '#2f6db5';
const AP_PHASES = { installation: { fr: 'Montage', en: 'Installation', icon: '🏗️' }, dismantling: { fr: 'Démontage', en: 'Dismantling', icon: '🔨' } };
const AP_TXT = {
  fr: {
    title: { installation: 'Planning estimatif de montage', dismantling: 'Planning estimatif de démontage' },
    task: 'Tâche', who: 'Qui', note: '* Ce planning est donné à titre indicatif. Les horaires et priorités peuvent évoluer selon les besoins du projet.',
    truckArr: 'arrivée sur site', truckLoad: 'chargement', truckDep: 'départ', truck: 'Camion',
    handover: '🧾 Handover — structure', dismEnd: '🏁 Fin du démontage — site libéré', crew: '👷 Équipe sur site (pers.)',
    slots: ['Matin', 'Après-midi'], updated: 'Mis à jour le', timeTbc: 'heure à confirmer', legendMs: 'Jalon (livraison, handover…)',
    off: 'Jour grisé',
  },
  en: {
    title: { installation: 'Estimated installation schedule', dismantling: 'Estimated dismantling schedule' },
    task: 'Task', who: 'Who', note: '* This planning is provided on an indicative basis. Timing / priorities might shift according to the project’s needs.',
    truckArr: 'arrival on site', truckLoad: 'loading', truckDep: 'departure', truck: 'Truck',
    handover: '🧾 Anticipated handover — structure', dismEnd: '🏁 End of dismantling — site cleared', crew: '👷 Crew on site (people)',
    slots: ['Morning', 'Afternoon'], updated: 'Updated on', timeTbc: 'time to be confirmed', legendMs: 'Milestone (delivery, handover…)',
    off: 'Greyed day',
  },
};

// Planning type Viewbox (repris du planning de référence de 5 jours ; d = [premier, dernier] jour sur 5, étalé
// sur le nombre de jours réels du chantier). Sections = bandeaux de regroupement.
const AP_TEMPLATES = {
  installation: { ref: 5, rows: [
    { sec: true, k: 'i-log', fr: 'LOGISTIQUE & IMPLANTATION', en: 'LOGISTICS & SET-OUT', c: '#9dc3e6' },
    { k: 'i-tautliner', fr: 'Déchargement du camion bâché au chariot élévateur', en: 'Unload tautliner with a forklift on site', d: [1, 1], c: '#9dc3e6' },
    { k: 'i-level', fr: 'Niveaux et laser (implantation des Viewbox, cales bois de mise à niveau)', en: 'Levelling and laser work (Viewbox positioning, wooden sub-tiles for levelling)', d: [1, 1], c: '#9dc3e6' },
    { k: 'i-flatbed', fr: 'Déchargement du plateau à la grue', en: 'Unload flatbed truck on site with crane', d: [1, 1], c: '#9dc3e6' },
    { sec: true, k: 'i-mont', fr: 'MONTAGE DES VIEWBOX', en: 'VIEWBOX ASSEMBLY', c: '#f4b183' },
    { k: 'i-assemble', fr: 'Assemblage des Viewbox au sol', en: 'Assemble Viewbox units on the ground', d: [1, 1] },
    { k: 'i-facade-ground', fr: 'Équipement des façades des Viewbox de l’étage (montées au sol)', en: 'Fitting out façade elements of the first-floor Viewbox (assembled on the ground)', d: [1, 1] },
    { k: 'i-ground', fr: 'Mise en place des Viewbox du rez-de-chaussée', en: 'Placing ground floor units', d: [2, 2] },
    { k: 'i-lift', fr: 'Levage des Viewbox de l’étage', en: 'Lifting of first floor units', d: [2, 2] },
    { k: 'i-terrace', fr: 'Terrasses de toit et garde-corps', en: 'Placing roof terraces and corresponding handrails', d: [2, 2] },
    { k: 'i-plates', fr: 'Plaques de liaison verticales', en: 'Placement of vertical connecting plates', d: [2, 2] },
    { k: 'i-panels', fr: 'Pose des panneaux de façade du rez', en: 'Placing panels on ground floor units', d: [2, 3] },
    { k: 'i-stairs', fr: 'Pose des escaliers', en: 'Placement of staircases', d: [2, 3] },
    { sec: true, k: 'i-tech', fr: 'ÉLECTRICITÉ & ÉTANCHÉITÉ', en: 'ELECTRICITY & WATERPROOFING', c: '#ffd966' },
    { k: 'i-elec-gf', fr: 'Raccordement électrique entre les Viewbox du rez', en: 'Electrical connection between ground floor units', d: [4, 4], c: '#ffd966' },
    { k: 'i-elec-ff', fr: 'Raccordement électrique de l’étage (interconnexion des Viewbox)', en: 'Electrical connection — first floor units (interconnection of Viewbox only)', d: [4, 4], c: '#ffd966' },
    { k: 'i-sealing', fr: 'Étanchéité finale de la façade', en: 'Final sealing / waterproofing of façade', d: [2, 4], c: '#ffd966' },
    { sec: true, k: 'i-fin', fr: 'FINITIONS', en: 'FINISHING', c: '#a9d18e' },
    { k: 'i-doors', fr: 'Pose et réglage des portes', en: 'Placement and alignment of doors', d: [3, 4], c: '#a9d18e' },
    { k: 'i-ceilings', fr: 'Pose des plafonds intérieurs', en: 'Placement of inner ceilings', d: [4, 4], c: '#a9d18e' },
    { k: 'i-touch', fr: 'Finitions (peinture, nettoyage)', en: 'Finishing touches (paint, cleaning)', d: [4, 5], c: '#a9d18e' },
    { k: 'i-brand', fr: 'Pose du branding si applicable', en: 'Placement of branding if applicable', d: [5, 5], c: '#a9d18e' },
  ] },
  dismantling: { ref: 3, rows: [
    { sec: true, k: 'd-prep', fr: 'PRÉPARATION', en: 'PREPARATION', c: '#9dc3e6' },
    { k: 'd-kickoff', fr: 'Accueil sécurité et organisation du site', en: 'Safety briefing and site organisation', d: [1, 1], c: '#9dc3e6' },
    { k: 'd-elec', fr: 'Déconnexion électrique', en: 'Electrical disconnection', d: [1, 1], c: '#ffd966' },
    { sec: true, k: 'd-dism', fr: 'DÉMONTAGE', en: 'DISMANTLING', c: '#f4b183' },
    { k: 'd-brand', fr: 'Dépose du branding et de la décoration', en: 'Removal of branding and decoration', d: [1, 1] },
    { k: 'd-inside', fr: 'Dépose des portes, plafonds et équipements intérieurs', en: 'Removal of doors, ceilings and inner equipment', d: [1, 1] },
    { k: 'd-facade', fr: 'Dépose des panneaux de façade', en: 'Removal of façade panels', d: [1, 2] },
    { k: 'd-stairs', fr: 'Dépose des escaliers, terrasses et garde-corps', en: 'Removal of staircases, terraces and handrails', d: [2, 2] },
    { k: 'd-lift', fr: 'Descente des Viewbox de l’étage', en: 'Lifting down first floor units', d: [2, 2] },
    { k: 'd-boxes', fr: 'Démontage des Viewbox', en: 'Dismantling of Viewbox units', d: [2, 3] },
    { sec: true, k: 'd-log', fr: 'LOGISTIQUE', en: 'LOGISTICS', c: '#a9d18e' },
    { k: 'd-loading', fr: 'Chargement des camions', en: 'Loading of trucks', d: [2, 3], c: '#a9d18e' },
    { k: 'd-clean', fr: 'Nettoyage du site et état des lieux', en: 'Site cleaning and inspection', d: [3, 3], c: '#a9d18e' },
  ] },
};

const AP = {
  projectId: null, project: null, plans: {}, phase: 'installation', canEdit: false,
  plan: null, revision: 0, saveTimer: null, saving: false, savedAt: null, error: null,
  undo: [], redo: [], cols: [], drag: null,
};

// ─── utilitaires temps (minutes depuis 1970, sans fuseau) ───
function apT(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || '');
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) / 60000;
}
function apS(min) { return new Date(min * 60000).toISOString().slice(0, 16); }
function apDay(min) { return apS(min).slice(0, 10); }
function apHM(min) { return apS(min).slice(11, 16); }
function apMin(hm) { const [h, m] = String(hm || '0:0').split(':'); return (+h || 0) * 60 + (+m || 0); }
function apLocal(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function apUid() { return Math.random().toString(36).slice(2, 10); }
function apEsc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function apDayLabel(day, lang, withYear) {
  const d = new Date(apT(day) * 60000);
  const o = { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'UTC' };
  if (withYear) o.year = 'numeric';
  return d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', o);
}
function apDateTimeLabel(s, lang) { return `${apDayLabel(s.slice(0, 10), lang)} ${s.slice(11, 16)}`; }

// ─── colonnes et positions ───
function apColumns(plan) {
  const cols = [];
  const from = apT(plan.from), to = apT(plan.to);
  if (!(to >= from) || to - from > 120 * 1440) return cols;
  const hs = plan.hours.start * 60, he = plan.hours.end * 60;
  const slots = (plan.slots || []).filter(s => apMin(s.to) > apMin(s.from)).sort((a, b) => apMin(a.from) - apMin(b.from));
  for (let d = from; d <= to; d += 1440) {
    const day = apDay(d);
    const off = Object.prototype.hasOwnProperty.call(plan.offDays || {}, day);
    if (plan.scale === 'slot' && slots.length) {
      for (const sl of slots) cols.push({ day, s: d + apMin(sl.from), e: d + apMin(sl.to), label: sl.label, sub: `${sl.from}–${sl.to}`, off });
    } else if (plan.scale === 'hour') {
      for (let h = plan.hours.start; h < plan.hours.end; h++) cols.push({ day, s: d + h * 60, e: d + h * 60 + 60, label: String(h), off });
    } else cols.push({ day, s: d + hs, e: d + he, label: '', off });
  }
  return cols;
}
function apDayGroups(cols) {
  const g = [];
  cols.forEach((c, i) => {
    const last = g[g.length - 1];
    if (last && last.day === c.day) last.b = i;
    else g.push({ day: c.day, a: i, b: i, off: c.off });
  });
  return g;
}
/** position continue (en colonnes) d'un instant ; dans un trou (nuit) = début de la colonne suivante */
function apX(cols, t) {
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    if (t < c.s) return i;
    if (t <= c.e) return i + (t - c.s) / (c.e - c.s);
  }
  return cols.length;
}
function apRange(cols, s, e) {
  let a = -1, b = -1;
  for (let i = 0; i < cols.length; i++) if (s < cols[i].e && e > cols[i].s) { if (a < 0) a = i; b = i; }
  return a < 0 ? null : [a, b];
}
/** position et largeur d'une barre en colonnes : heures = exact, jours / tranches = cases entières */
function apBarBox(plan, cols, b) {
  const s = apT(b.s), e = apT(b.e);
  const r = apRange(cols, s, e);
  if (!r) return null;
  if (plan.scale === 'hour') { const x0 = apX(cols, s), x1 = apX(cols, e); return { x: x0, w: Math.max(0.25, x1 - x0), r }; }
  return { x: r[0], w: r[1] - r[0] + 1, r };
}
/** la barre ne remplit pas ses cases (ex. 08:00–12:00 en vue jour) → on écrit ses heures */
function apBarHours(plan, cols, b, r) {
  if (plan.scale === 'hour' || !r) return '';
  const s = apT(b.s), e = apT(b.e);
  if (s <= cols[r[0]].s && e >= cols[r[1]].e) return '';
  const days = b.s.slice(0, 10) === b.e.slice(0, 10);
  return days ? `${apHM(s)}–${apHM(e)}` : '';
}
function apColorOf(row, bar) { return (bar && bar.color) || row.color || (row.kind === 'milestone' ? AP_MS_COLOR : AP_DEFAULT_COLOR); }
function apTextOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#1a1a1a';
  const n = parseInt(m[1], 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1a1a1a' : '#ffffff';
}

// ─── données du projet → lignes automatiques ───
function apTruckName(t, lang) {
  const T = AP_TXT[lang];
  const types = { van: lang === 'en' ? 'Van' : 'Camionnette', crane: lang === 'en' ? 'Crane' : 'Grue', car: lang === 'en' ? 'Car' : 'Voiture', trailer: lang === 'en' ? 'Trailer' : 'Remorque' };
  const base = types[t.vehicleType] || T.truck;
  const num = t.truckNumber ? ` ${t.truckNumber}` : '';
  const plate = t.licensePlate ? ` (${t.licensePlate})` : '';
  return `${base}${num}${plate}`;
}
/** fin de période : une date « à minuit » = toute la journée */
function apEndOf(iso, hoursEnd) {
  const l = apLocal(iso);
  if (!l) return null;
  return l.endsWith('T00:00') ? `${l.slice(0, 10)}T${String(hoursEnd).padStart(2, '0')}:00` : l;
}
function apSources(plan, project, phase) {
  const lang = plan.lang, T = AP_TXT[lang];
  const from = apT(plan.from), to = apT(plan.to) + 1440;
  const inRange = l => { const t = apT(l); return t >= from && t < to; };
  const out = [];
  // Équipe sur site (compte calculé à l'affichage)
  const bookings = (project.teamBookings || []).filter(b => b.phase === phase);
  if (bookings.length || project.workersCount) out.push({ src: 'crew', kind: 'crew', label: T.crew, color: '#8faadc' });
  // Camions : chaque date (chargement, départ, arrivée) qui tombe dans la période
  for (const t of project.trucks || []) {
    const evs = [
      ['loadingDate', 'load', '📦', T.truckLoad],
      ['departureDate', 'dep', '🛫', T.truckDep],
      ['arrivalDate', 'arr', '🚚', T.truckArr],
    ];
    for (const [f, k, icon, what] of evs) {
      const l = apLocal(t[f]);
      if (!l || !inRange(l)) continue;
      const noTime = l.endsWith('T00:00');
      out.push({
        src: `truck:${t.id}:${k}`, kind: 'milestone', label: `${icon} ${apTruckName(t, lang)} — ${what}`,
        at: noTime ? `${l.slice(0, 10)}T${String(plan.hours.start).padStart(2, '0')}:00` : l, noTime, color: AP_MS_COLOR, group: 'truck',
      });
    }
  }
  // Handover / fin du démontage
  if (phase === 'installation' && project.installationEnd) {
    const l = apEndOf(project.installationEnd, plan.hours.end);
    if (l && inRange(l)) out.push({ src: 'handover', kind: 'milestone', label: T.handover, at: l, color: '#2dc653', group: 'end' });
  }
  if (phase === 'dismantling' && project.dismantlingEnd) {
    const l = apEndOf(project.dismantlingEnd, plan.hours.end);
    if (l && inRange(l)) out.push({ src: 'dism-end', kind: 'milestone', label: T.dismEnd, at: l, color: '#2dc653', group: 'end' });
  }
  // Tâches datées du projet (ajoutées seulement à la demande, puis suivies) : une ligne par intitulé
  const groups = new Map();
  for (const t of project.tasks || []) {
    const day = apLocal(t.taskDate)?.slice(0, 10);
    if (!day || !inRange(`${day}T12:00`)) continue;
    const st = /^\d{1,2}:\d{2}$/.test(t.startTime || '') ? t.startTime.padStart(5, '0') : `${String(plan.hours.start).padStart(2, '0')}:00`;
    let en = /^\d{1,2}:\d{2}$/.test(t.endTime || '') ? t.endTime.padStart(5, '0') : `${String(plan.hours.end).padStart(2, '0')}:00`;
    if (apMin(en) <= apMin(st)) en = `${String(Math.min(24, Math.floor(apMin(st) / 60) + 1)).padStart(2, '0')}:00`;
    const key = (t.title || '').trim();
    if (!groups.has(key)) groups.set(key, { src: `tasks:${key.toLowerCase()}`, kind: 'task', label: key, bars: [], optional: true, group: 'task' });
    groups.get(key).bars.push({ id: `t${t.id.slice(0, 8)}`, s: `${day}T${st}`, e: en === '24:00' ? `${apDay(apT(day) + 1440)}T00:00` : `${day}T${en}`, text: '', color: '', src: `task:${t.id}` });
  }
  out.push(...groups.values());
  return out;
}
function apInsertIndex(plan, s) {
  const rows = plan.rows;
  if (s.kind === 'crew') return 0;
  if (s.group === 'truck') {
    // après les autres camions (dans l'ordre des heures), sinon tout en haut sous l'équipe
    let idx = rows[0]?.src === 'crew' ? 1 : 0;
    rows.forEach((r, i) => { if (r.src?.startsWith('truck:') && r.kind === 'milestone' && (apT(r.at) <= apT(s.at))) idx = i + 1; });
    return idx;
  }
  return rows.length;
}
/** met les lignes liées au projet à jour ; renvoie true si quelque chose a changé */
function apSync(plan, project, phase, { addOptional = false } = {}) {
  const srcs = apSources(plan, project, phase);
  const dismissed = new Set(plan.dismissed || []);
  const bySrc = new Map(plan.rows.filter(r => r.src).map(r => [r.src, r]));
  let changed = false;
  for (const s of srcs) {
    const r = bySrc.get(s.src);
    if (r) {
      if (r.detached) continue;
      if (r.labelAuto === r.label && r.label !== s.label) { r.label = s.label; r.labelAuto = s.label; changed = true; }
      if (s.kind === 'milestone' && (r.at !== s.at || !!r.noTime !== !!s.noTime)) { r.at = s.at; r.noTime = !!s.noTime; changed = true; }
      if (s.bars) {
        const own = r.bars.filter(b => !b.src);
        const next = s.bars.map(b => { const old = r.bars.find(x => x.src === b.src); return old ? { ...old, s: b.s, e: b.e } : b; });
        const nb = [...own, ...next];
        if (JSON.stringify(nb) !== JSON.stringify(r.bars)) { r.bars = nb; changed = true; }
      }
      continue;
    }
    if (dismissed.has(s.src) || (s.optional && !addOptional)) continue;
    plan.rows.splice(apInsertIndex(plan, s), 0, {
      id: apUid(), kind: s.kind, src: s.src, label: s.label, labelAuto: s.label, who: '', color: s.color || '',
      at: s.at || null, noTime: !!s.noTime, bars: s.bars ? s.bars.map(b => ({ ...b })) : [],
    });
    changed = true;
  }
  // sources disparues (camion supprimé, date sortie de la période…) : on enlève la ligne liée
  const live = new Set(srcs.map(s => s.src));
  const kept = plan.rows.filter(r => {
    if (!r.src || r.detached || live.has(r.src)) return true;
    if (r.src.startsWith('tasks:')) { r.bars = r.bars.filter(b => !b.src); return r.bars.length > 0; }
    return false;
  });
  if (kept.length !== plan.rows.length) { plan.rows = kept; changed = true; }
  return changed;
}
/** nombre de personnes sur site par colonne (bookings de la phase, sinon effectif du projet sur les dates de la phase) */
function apCrewCounts(plan, project, phase, cols) {
  const bookings = (project.teamBookings || []).filter(b => b.phase === phase);
  if (bookings.length) {
    const bs = bookings.map(b => ({ s: apT(apLocal(b.onSiteStart)), e: apT(apEndOf(b.onSiteEnd, 24)), who: `${b.user?.firstName || ''} ${b.user?.lastName || ''}`.trim() }));
    return cols.map(c => new Set(bs.filter(b => b.s < c.e && b.e > c.s).map(b => b.who)).size);
  }
  const s = phase === 'dismantling' ? project.dismantlingStart : project.installationStart;
  const e = phase === 'dismantling' ? project.dismantlingEnd : project.installationEnd;
  if (!s || !e || !project.workersCount) return cols.map(() => 0);
  const a = apT(apLocal(s).slice(0, 10)), b = apT(apLocal(e).slice(0, 10)) + 1440;
  return cols.map(c => (c.s < b && c.e > a && !c.off) ? project.workersCount : 0);
}

// ─── création ───
function apPhaseDates(project, phase) {
  const s = apLocal(phase === 'dismantling' ? project.dismantlingStart : project.installationStart);
  const e = apLocal(phase === 'dismantling' ? project.dismantlingEnd : project.installationEnd);
  const today = apLocal(new Date().toISOString()).slice(0, 10);
  const from = s ? s.slice(0, 10) : today;
  let to = e ? e.slice(0, 10) : apDay(apT(from) + 4 * 1440);
  if (apT(to) < apT(from)) to = from;
  return { from, to };
}
function apNewPlan(project, phase, lang = 'fr') {
  const { from, to } = apPhaseDates(project, phase);
  const T = AP_TXT[lang];
  return {
    v: 1, title: '', lang, scale: 'day', from, to,
    hours: { start: 7, end: 19 },
    slots: [{ id: apUid(), label: T.slots[0], from: '07:00', to: '12:00' }, { id: apUid(), label: T.slots[1], from: '13:00', to: '18:00' }],
    offDays: {}, note: T.note, dismissed: [], rows: [],
  };
}
function apApplyTemplate(plan, phase) {
  const tpl = AP_TEMPLATES[phase];
  const days = apColumnsDays(plan).filter(d => !Object.prototype.hasOwnProperty.call(plan.offDays || {}, d));
  const N = Math.max(1, days.length);
  const hs = `${String(plan.hours.start).padStart(2, '0')}:00`, he = `${String(plan.hours.end).padStart(2, '0')}:00`;
  const rows = [];
  for (const t of tpl.rows) {
    if (t.sec) { rows.push({ id: apUid(), kind: 'section', label: t[plan.lang], tpl: t.k, who: '', color: t.c, bars: [] }); continue; }
    const a = Math.min(N - 1, Math.floor((t.d[0] - 1) * N / tpl.ref));
    const b = Math.max(a, Math.min(N - 1, Math.floor(t.d[1] * N / tpl.ref) - 1));
    rows.push({ id: apUid(), kind: 'task', label: t[plan.lang], tpl: t.k, who: '', color: t.c || '', bars: days.length ? [{ id: apUid(), s: `${days[a]}T${hs}`, e: `${days[b]}T${he}`, text: '', color: '' }] : [] });
  }
  // après les lignes automatiques du haut (équipe, camions), avant le handover
  const endIdx = plan.rows.findIndex(r => r.src === 'handover' || r.src === 'dism-end');
  plan.rows.splice(endIdx < 0 ? plan.rows.length : endIdx, 0, ...rows);
}
function apColumnsDays(plan) {
  const out = [];
  for (let d = apT(plan.from); d <= apT(plan.to) && out.length < 121; d += 1440) out.push(apDay(d));
  return out;
}
function apTemplateLabel(key, lang) {
  for (const ph of Object.values(AP_TEMPLATES)) { const r = ph.rows.find(x => x.k === key); if (r) return r[lang]; }
  return null;
}
/** change la langue : libellés du modèle, lignes automatiques, tranches et note par défaut suivent ; renvoie les textes saisis à la main */
function apSwitchLang(plan, lang) {
  const old = plan.lang;
  if (old === lang) return [];
  plan.lang = lang;
  const custom = [];
  for (const r of plan.rows) {
    if (r.tpl && r.label === apTemplateLabel(r.tpl, old)) r.label = apTemplateLabel(r.tpl, lang);
    else if (r.src && r.labelAuto === r.label) { /* recalculé par apSync */ }
    else if (r.label) custom.push({ obj: r, f: 'label' });
    for (const b of r.bars || []) if (b.text) custom.push({ obj: b, f: 'text' });
    if (r.who) custom.push({ obj: r, f: 'who' });
  }
  (plan.slots || []).forEach((s, i) => { if (s.label === AP_TXT[old].slots[i]) s.label = AP_TXT[lang].slots[i]; });
  if (plan.note === AP_TXT[old].note) plan.note = AP_TXT[lang].note;
  else if (plan.note) custom.push({ obj: plan, f: 'note' });
  if (plan.title) custom.push({ obj: plan, f: 'title' });
  for (const [d, l] of Object.entries(plan.offDays || {})) if (l) custom.push({ obj: plan.offDays, f: d });
  return custom;
}

// ═══ CARTE DE L'ONGLET INFOS ═══

function apCanEdit() { return !!CURRENT_USER && AP_EDIT_ROLES.includes(CURRENT_USER.role); }

(function apStyles() {
  if (document.getElementById('ap-styles')) return;
  const st = document.createElement('style');
  st.id = 'ap-styles';
  st.textContent = `
  .ap-card-prev{overflow:auto;border:1px solid var(--border);border-radius:var(--radius);background:#fff;max-height:460px;cursor:zoom-in;}
  .ap-card-prev svg{display:block;width:100%;height:auto;min-width:900px;}
  .ap-seg{display:inline-flex;border:1px solid var(--border);border-radius:8px;overflow:hidden;}
  .ap-seg button{background:transparent;border:none;color:var(--text2);padding:5px 10px;font-size:12px;cursor:pointer;}
  .ap-seg button.on{background:var(--accent);color:#fff;}
  .ap-ov{position:fixed;inset:0;z-index:9000;background:var(--bg);display:flex;flex-direction:column;}
  .ap-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 14px;border-bottom:1px solid var(--border);background:var(--bg2);}
  .ap-top .grow{flex:1;}
  .ap-top input[type=date],.ap-top select,.ap-top input[type=text]{background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 6px;font-size:12px;}
  .ap-tool{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--border);}
  .ap-tool .lbl{font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.5px;margin-left:6px;}
  .ap-tool .btn,.ap-top .btn{padding:5px 10px;font-size:12px;}
  .ap-scroll{flex:1;overflow:auto;position:relative;}
  .ap-sheet{position:relative;min-width:100%;}
  .ap-hrow{display:flex;position:sticky;z-index:4;background:var(--bg2);}
  .ap-h1{top:0;height:34px;line-height:34px;} .ap-h2{top:34px;height:24px;line-height:24px;}
  .ap-lab{position:sticky;left:0;z-index:3;flex:0 0 auto;display:flex;align-items:center;gap:4px;padding:0 6px;background:var(--bg2);border-right:2px solid var(--border);border-bottom:1px solid var(--border);box-sizing:border-box;}
  .ap-hrow .ap-lab{z-index:5;font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;}
  .ap-htrack{position:relative;flex:0 0 auto;border-bottom:1px solid var(--border);}
  .ap-hcell{position:absolute;top:0;bottom:0;display:block;text-align:center;padding:0 4px;text-overflow:ellipsis;font-size:12px;font-weight:600;border-left:1px solid var(--border);box-sizing:border-box;overflow:hidden;white-space:nowrap;color:var(--text);}
  .ap-h1 .ap-hcell{cursor:pointer;} .ap-h1 .ap-hcell:hover{background:var(--bg3);}
  .ap-h2 .ap-hcell{font-size:10px;font-weight:500;color:var(--text2);}
  .ap-hcell.off{background:repeating-linear-gradient(135deg,rgba(128,128,128,.25) 0 6px,rgba(128,128,128,.12) 6px 12px);color:var(--text3);}
  .ap-row{display:flex;height:32px;}
  .ap-row.sec{height:28px;}
  .ap-row.dragover .ap-lab{box-shadow:inset 0 3px 0 var(--accent);}
  .ap-lab input{background:transparent;border:1px solid transparent;color:var(--text);font-size:12.5px;padding:3px 4px;border-radius:4px;min-width:0;}
  .ap-lab input:hover,.ap-lab input:focus{border-color:var(--border);background:var(--bg3);outline:none;}
  .ap-lab .in-label{flex:1;} .ap-lab .in-who{width:92px;color:var(--text2);font-size:11.5px;}
  .ap-row.sec .ap-lab input.in-label{font-weight:800;letter-spacing:.4px;font-size:11.5px;}
  .ap-handle{cursor:grab;color:var(--text3);font-size:12px;user-select:none;padding:0 2px;}
  .ap-dot{width:14px;height:14px;border-radius:4px;flex:0 0 auto;cursor:pointer;border:1px solid rgba(0,0,0,.25);}
  .ap-ic{font-size:11px;flex:0 0 auto;}
  .ap-mbtn{background:transparent;border:none;color:var(--text2);cursor:pointer;font-size:15px;padding:0 4px;}
  .ap-track{position:relative;flex:0 0 auto;border-bottom:1px solid var(--border);box-sizing:border-box;touch-action:pan-x pan-y;cursor:crosshair;}
  .ap-row.sec .ap-track{cursor:default;}
  .ap-row.crew .ap-track{cursor:default;}
  .ap-bg{position:absolute;top:0;bottom:0;pointer-events:none;z-index:0;}
  .ap-bg .off{position:absolute;top:0;bottom:0;background:repeating-linear-gradient(135deg,rgba(128,128,128,.22) 0 6px,rgba(128,128,128,.10) 6px 12px);}
  .ap-bg .dl{position:absolute;top:0;bottom:0;width:0;border-left:2px solid var(--border);}
  .ap-bg .now{position:absolute;top:0;bottom:0;width:0;border-left:2px solid #e63946;}
  .ap-bar{position:absolute;top:4px;bottom:4px;border-radius:5px;display:flex;align-items:center;box-shadow:0 1px 2px rgba(0,0,0,.35);cursor:grab;z-index:1;overflow:hidden;}
  .ap-bar .bt{flex:1;font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 6px;text-align:center;pointer-events:none;}
  .ap-bar .hd{width:7px;align-self:stretch;cursor:ew-resize;flex:0 0 auto;}
  .ap-bar .hd:hover{background:rgba(0,0,0,.15);}
  .ap-bar.ro{cursor:pointer;}
  .ap-ms{position:absolute;top:0;bottom:0;display:flex;align-items:center;z-index:2;cursor:grab;white-space:nowrap;}
  .ap-dia{width:14px;height:14px;transform:translateX(-7px) rotate(45deg);border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,.35);flex:0 0 auto;}
  .ap-ms .mt{font-size:11px;font-weight:700;color:var(--text);margin-left:-1px;background:var(--bg2);padding:1px 4px;border-radius:4px;}
  .ap-crew{position:absolute;top:5px;bottom:5px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border-radius:4px;color:#10305a;}
  .ap-ghost{position:absolute;top:4px;bottom:4px;border-radius:5px;background:rgba(72,149,239,.35);border:2px dashed #4895ef;pointer-events:none;z-index:3;}
  .ap-sec-band{position:absolute;inset:0;opacity:.22;pointer-events:none;}
  .ap-add{display:flex;gap:6px;padding:10px;position:sticky;left:0;}
  .ap-foot{padding:8px 14px;border-top:1px solid var(--border);background:var(--bg2);display:flex;gap:10px;align-items:center;flex-wrap:wrap;}
  .ap-foot textarea{flex:1;min-width:240px;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 8px;font-size:12px;resize:vertical;height:34px;}
  .ap-help{font-size:11px;color:var(--text3);line-height:1.5;}
  .ap-pop{position:fixed;z-index:9600;background:var(--bg2);border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.5);padding:12px;min-width:240px;max-width:min(380px,94vw);font-size:12.5px;color:var(--text);}
  .ap-pop label{display:block;font-size:11px;color:var(--text3);margin:8px 0 3px;}
  .ap-pop input[type=text],.ap-pop input[type=datetime-local],.ap-pop input[type=time],.ap-pop input[type=email],.ap-pop select,.ap-pop textarea{width:100%;box-sizing:border-box;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 7px;font-size:12.5px;}
  .ap-pop .row{display:flex;gap:6px;align-items:center;}
  .ap-pop .acts{display:flex;gap:6px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;}
  .ap-pop .mi{display:block;width:100%;text-align:left;background:transparent;border:none;color:var(--text);padding:7px 8px;border-radius:6px;cursor:pointer;font-size:12.5px;}
  .ap-pop .mi:hover{background:var(--bg3);} .ap-pop .mi.danger{color:#e63946;}
  .ap-sw{display:flex;flex-wrap:wrap;gap:5px;}
  .ap-sw span{width:22px;height:22px;border-radius:5px;cursor:pointer;border:2px solid transparent;box-sizing:border-box;}
  .ap-sw span.on{border-color:var(--text);}
  .ap-modal{position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:12px;}
  .ap-modal .box{background:var(--bg2);border:1px solid var(--border);border-radius:12px;max-width:560px;width:100%;max-height:92vh;overflow:auto;padding:16px 18px;color:var(--text);}
  .ap-modal label{display:block;font-size:11px;color:var(--text3);margin:10px 0 4px;text-transform:uppercase;letter-spacing:.4px;}
  .ap-modal input[type=text],.ap-modal textarea,.ap-modal select{width:100%;box-sizing:border-box;background:var(--bg3);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:6px 8px;font-size:13px;}
  .ap-chk{display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 0;}
  @media (max-width:700px){ .ap-lab .in-who{display:none;} }
  `;
  document.head.appendChild(st);
})();

async function apLoad(projectId) {
  const res = await api('GET', `/assembly-plans/project/${projectId}`);
  if (!res?.success) return false;
  AP.projectId = projectId;
  AP.project = res.data.project;
  AP.plans = {};
  for (const p of res.data.plans || []) AP.plans[p.phase] = p;
  AP.canEdit = apCanEdit();
  // lignes liées aux camions / équipe / handover remises à jour à chaque ouverture
  for (const ph of Object.keys(AP.plans)) {
    const rec = AP.plans[ph];
    const plan = apClean(rec.data);
    rec.data = plan;
    if (apSync(plan, AP.project, ph) && AP.canEdit) {
      const r = await api('PUT', `/assembly-plans/project/${projectId}/${ph}`, { data: plan, revision: rec.revision });
      if (r?.success) AP.plans[ph] = { ...r.data, data: plan };
    }
  }
  return true;
}
function apClean(d) {
  const p = (d && typeof d === 'object') ? d : {};
  const lang = p.lang === 'en' ? 'en' : 'fr';
  const base = apNewPlan({}, 'installation', lang);
  return {
    ...base, ...p, lang,
    hours: { start: Math.max(0, Math.min(23, +p.hours?.start || base.hours.start)), end: Math.max(1, Math.min(24, +p.hours?.end || base.hours.end)) },
    slots: Array.isArray(p.slots) && p.slots.length ? p.slots : base.slots,
    offDays: p.offDays && typeof p.offDays === 'object' ? p.offDays : {},
    dismissed: Array.isArray(p.dismissed) ? p.dismissed : [],
    rows: (Array.isArray(p.rows) ? p.rows : []).map(r => ({ who: '', color: '', ...r, bars: Array.isArray(r.bars) ? r.bars : [] })),
    scale: ['day', 'slot', 'hour'].includes(p.scale) ? p.scale : 'day',
  };
}

async function loadAssemblyPlanCard(projectId) {
  const el = document.getElementById('detail-assembly-plan-card');
  if (!el) return;
  const ok = await apLoad(projectId);
  if (CURRENT_PROJECT_ID && CURRENT_PROJECT_ID !== projectId) return;
  if (!ok) { el.innerHTML = ''; return; }
  if (!AP.plans[AP.phase] && AP.plans.dismantling && !AP.plans.installation) AP.phase = 'dismantling';
  apRenderCard();
}

function apRenderCard() {
  const el = document.getElementById('detail-assembly-plan-card');
  if (!el || !AP.project) return;
  const rec = AP.plans[AP.phase];
  const pr = AP.project;
  const tasksInRange = (() => {
    const { from, to } = apPhaseDates(pr, AP.phase);
    const a = apT(from), b = apT(to) + 1440;
    return (pr.tasks || []).filter(t => { const l = apLocal(t.taskDate); return l && apT(l) >= a && apT(l) < b; }).length;
  })();
  const seg = Object.entries(AP_PHASES).map(([k, v]) => `<button class="${k === AP.phase ? 'on' : ''}" onclick="apSetCardPhase('${k}')">${v.icon} ${v.fr}${AP.plans[k] ? '' : ' <span style="opacity:.6;">(vide)</span>'}</button>`).join('');
  let body;
  if (rec) {
    const plan = rec.data;
    const { svg } = apSvg(plan, pr, AP.phase, { internal: true });
    const nTasks = plan.rows.filter(r => r.kind === 'task').length, nMs = plan.rows.filter(r => r.kind === 'milestone').length;
    body = `
      <div class="ap-card-prev" onclick="openAssemblyPlanEditor()" title="Cliquer pour ouvrir / modifier">${svg}</div>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">
        <div style="font-size:11px;color:var(--text3);">${nTasks} tâche${nTasks > 1 ? 's' : ''} · ${nMs} jalon${nMs > 1 ? 's' : ''} · ${apEsc(apDayLabel(plan.from, 'fr'))} → ${apEsc(apDayLabel(plan.to, 'fr'))}${rec.updatedBy ? ` · modifié par ${apEsc(rec.updatedBy)}` : ''}${rec.updatedAt ? ` le ${fmtDateTime(rec.updatedAt)}` : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" onclick="openAssemblyPlanEditor()">${AP.canEdit ? '✏️ Ouvrir / modifier' : '🔍 Ouvrir'}</button>
          <button class="btn btn-ghost btn-sm" onclick="apExportMenu(this)">⬇ PDF / Image</button>
          ${AP.canEdit ? `<button class="btn btn-ghost btn-sm" onclick="apOpenSend()">✉️ Envoyer</button>` : ''}
        </div>
      </div>`;
  } else if (AP.canEdit) {
    body = `
      <div style="font-size:13px;color:var(--text2);line-height:1.55;margin-bottom:10px;">
        Un tableau jour par jour (ou par tranches d'heures, ou heure par heure) de qui fait quoi sur le chantier, à envoyer au client ou à mettre dans le briefing.
        Les <b>camions</b> (date et heure d'arrivée), l'<b>équipe sur site</b> et le <b>handover</b> se placent tout seuls et suivent les changements du projet.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" onclick="apCreate('template')">🪄 Planning type Viewbox</button>
        <button class="btn btn-ghost btn-sm" onclick="apCreate('empty')">📄 Planning vide</button>
        ${tasksInRange ? `<button class="btn btn-ghost btn-sm" onclick="apCreate('tasks')">📋 Depuis les tâches du projet (${tasksInRange})</button>` : ''}
      </div>`;
  } else {
    body = `<div style="font-size:13px;color:var(--text3);">Pas encore de planning ${AP.phase === 'dismantling' ? 'de démontage' : 'de montage'}.</div>`;
  }
  el.innerHTML = `
    <div class="card" style="margin-bottom:14px;">
      <div class="card-header" style="flex-wrap:wrap;gap:8px;">
        <span class="card-title">📅 Planning estimatif ${AP.phase === 'dismantling' ? 'de démontage' : 'de montage'}</span>
        <div class="ap-seg">${seg}</div>
      </div>
      <div class="card-body" style="padding:12px 18px;">${body}</div>
    </div>`;
}
function apSetCardPhase(ph) { AP.phase = ph; apRenderCard(); }

async function apCreate(how) {
  const pr = AP.project;
  const plan = apNewPlan(pr, AP.phase, 'fr');
  apSync(plan, pr, AP.phase, { addOptional: how === 'tasks' });
  if (how === 'template') apApplyTemplate(plan, AP.phase);
  const r = await api('PUT', `/assembly-plans/project/${AP.projectId}/${AP.phase}`, { data: plan, revision: 0 });
  if (!r?.success) { toast(r?.error || 'Création impossible', 'error'); return; }
  AP.plans[AP.phase] = { ...r.data, data: plan };
  apRenderCard();
  openAssemblyPlanEditor();
}

// ═══ ÉDITEUR PLEIN ÉCRAN ═══

function openAssemblyPlanEditor() {
  const rec = AP.plans[AP.phase];
  if (!rec) return;
  AP.plan = JSON.parse(JSON.stringify(rec.data));
  AP.revision = rec.revision;
  AP.undo = []; AP.redo = []; AP.error = null; AP.savedAt = rec.updatedAt;
  document.getElementById('ap-editor')?.remove();
  const ov = document.createElement('div');
  ov.className = 'ap-ov';
  ov.id = 'ap-editor';
  document.body.appendChild(ov);
  document.addEventListener('keydown', apKey);
  apRenderEditor();
}
async function apCloseEditor() {
  if (AP.saveTimer) { clearTimeout(AP.saveTimer); AP.saveTimer = null; await apSave(); }
  apPopClose();
  document.removeEventListener('keydown', apKey);
  document.getElementById('ap-editor')?.remove();
  apRenderCard();
}
function apKey(e) {
  if (!document.getElementById('ap-editor')) return;
  const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
  if (e.key === 'Escape') { if (document.querySelector('.ap-pop')) apPopClose(); else if (inField) e.target.blur(); else if (!document.querySelector('.ap-modal')) apCloseEditor(); return; }
  if (inField || !AP.canEdit) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z' && !e.shiftKey) { e.preventDefault(); apUndo(); }
  else if ((e.ctrlKey || e.metaKey) && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); apRedo(); }
}

function apColW(plan) {
  const z = AP.zoom || 1;
  const base = Math.round(({ day: 104, slot: 64, hour: 30 }[plan.scale] || 104) * z);
  // peu de colonnes : on les élargit pour remplir l'écran
  const n = apColumns(plan).length;
  const fill = n ? Math.floor((window.innerWidth - apLabW() - 24) / n) : base;
  return Math.max(base, Math.min(fill, Math.round(260 * z)));
}
function apLabW() { return window.innerWidth < 700 ? 190 : 400; }

function apRenderEditor() {
  const ov = document.getElementById('ap-editor');
  if (!ov) return;
  const keepScroll = ov.querySelector('.ap-scroll');
  const sx = keepScroll?.scrollLeft || 0, sy = keepScroll?.scrollTop || 0;
  const plan = AP.plan, pr = AP.project, ro = !AP.canEdit;
  const cols = apColumns(plan);
  AP.cols = cols;
  const cw = apColW(plan), LW = apLabW(), W = cols.length * cw;
  const groups = apDayGroups(cols);
  const ph = AP_PHASES[AP.phase];
  const outside = plan.rows.reduce((n, r) => n + (r.kind === 'milestone' ? (r.at && (apT(r.at) < apT(plan.from) || apT(r.at) >= apT(plan.to) + 1440) ? 1 : 0)
    : (r.bars || []).filter(b => !apRange(cols, apT(b.s), apT(b.e))).length), 0);
  const saveState = AP.error ? `<span style="color:#e63946;">⚠️ ${apEsc(AP.error)}</span>`
    : AP.saving ? '⏳ Enregistrement…' : AP.saveTimer ? '✏️ Modifié' : AP.savedAt ? '✔ Enregistré' : '';
  const nowMin = apT(apLocal(new Date().toISOString()));
  const nowX = cols.length && nowMin >= cols[0].s && nowMin <= cols[cols.length - 1].e ? apX(cols, nowMin) : null;
  const hourOpts = (sel, min, max) => Array.from({ length: max - min + 1 }, (_, i) => i + min).map(h => `<option value="${h}" ${h === sel ? 'selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');

  ov.innerHTML = `
    <div class="ap-top">
      <span style="font-size:16px;font-weight:800;">📅 ${ph.icon}</span>
      <input type="text" id="ap-title" value="${apEsc(plan.title)}" placeholder="${apEsc(AP_TXT[plan.lang].title[AP.phase])}" style="min-width:220px;flex:0 1 340px;font-weight:700;font-size:14px;" ${ro ? 'disabled' : ''}>
      <span style="font-size:12px;color:var(--text3);">${apEsc(pr.name)} · ${apEsc(pr.internalNumber)}</span>
      <span class="grow"></span>
      <span id="ap-state" style="font-size:12px;color:var(--text2);">${saveState}</span>
      ${ro ? '' : `<button class="btn btn-ghost btn-sm" onclick="apUndo()" ${AP.undo.length ? '' : 'disabled'} title="Annuler (Ctrl+Z)">↶</button>
      <button class="btn btn-ghost btn-sm" onclick="apRedo()" ${AP.redo.length ? '' : 'disabled'} title="Rétablir (Ctrl+Y)">↷</button>`}
      <button class="btn btn-ghost btn-sm" onclick="apExportMenu(this)">⬇ PDF / Image</button>
      ${ro ? '' : `<button class="btn btn-ghost btn-sm" onclick="apOpenSend()">✉️ Envoyer</button>`}
      <button class="btn btn-primary btn-sm" onclick="apCloseEditor()">✕ Fermer</button>
    </div>
    <div class="ap-tool">
      <span class="lbl">Affichage</span>
      <div class="ap-seg">
        ${[['day', '📆 Jours'], ['slot', '🕘 Tranches'], ['hour', '⏱ Heures']].map(([k, l]) => `<button class="${plan.scale === k ? 'on' : ''}" ${ro ? '' : `onclick="apSet('scale','${k}')"`}>${l}</button>`).join('')}
      </div>
      ${plan.scale === 'slot' && !ro ? `<button class="btn btn-ghost btn-sm" onclick="apSlotsPop(this)" title="Définir les tranches (Matin, Après-midi, Nuit…)">⚙ Tranches</button>` : ''}
      <span class="lbl">Du</span><input type="date" id="ap-from" value="${plan.from}" ${ro ? 'disabled' : ''}>
      <span class="lbl">au</span><input type="date" id="ap-to" value="${plan.to}" ${ro ? 'disabled' : ''}>
      <span class="lbl">Journée</span>
      <select id="ap-hs" ${ro ? 'disabled' : ''}>${hourOpts(plan.hours.start, 0, 23)}</select>–<select id="ap-he" ${ro ? 'disabled' : ''}>${hourOpts(plan.hours.end, 1, 24)}</select>
      <span class="lbl">Langue export</span>
      <div class="ap-seg">${['fr', 'en'].map(l => `<button class="${plan.lang === l ? 'on' : ''}" ${ro ? '' : `onclick="apSetLang('${l}')"`}>${l.toUpperCase()}</button>`).join('')}</div>
      <span class="lbl">Zoom</span>
      <div class="ap-seg"><button onclick="apZoom(-1)">−</button><button onclick="apZoom(1)">＋</button></div>
    </div>
    ${ro ? '' : `<div class="ap-tool">
      <button class="btn btn-primary btn-sm" onclick="apAddRow('task')">＋ Tâche</button>
      <button class="btn btn-ghost btn-sm" onclick="apAddRow('section')">＋ Section</button>
      <button class="btn btn-ghost btn-sm" onclick="apAddRow('milestone')">◆ Jalon</button>
      <button class="btn btn-ghost btn-sm" onclick="apDataPop(this)" title="Camions, équipe, handover, tâches datées du projet">🔗 Données du projet</button>
      <button class="btn btn-ghost btn-sm" onclick="apTemplateAsk()">🪄 Ajouter le planning type</button>
      <span class="grow"></span>
      <button class="btn btn-ghost btn-sm" style="color:var(--text3);" onclick="apReset()" title="Supprimer ce planning">🗑 Tout effacer</button>
    </div>`}
    ${outside ? `<div style="padding:6px 14px;font-size:12px;color:var(--amber);background:rgba(244,162,97,.10);">⚠️ ${outside} élément${outside > 1 ? 's sont' : ' est'} hors de la période affichée (élargis les dates pour ${outside > 1 ? 'les' : 'le'} voir).</div>` : ''}
    <div class="ap-scroll">
      <div class="ap-sheet" style="width:${LW + W}px;">
        <div class="ap-hrow ap-h1">
          <div class="ap-lab" style="width:${LW}px;">${apEsc(AP_TXT[plan.lang].task)} <span style="margin-left:auto;">${apEsc(AP_TXT[plan.lang].who)}</span></div>
          <div class="ap-htrack" style="width:${W}px;">${groups.map(g => {
            const offL = plan.offDays?.[g.day];
            return `<div class="ap-hcell ${g.off ? 'off' : ''}" data-day="${g.day}" style="left:${g.a * cw}px;width:${(g.b - g.a + 1) * cw}px;" title="${ro ? '' : 'Clic : griser ce jour (événement, repos…)'}">${apEsc(apDayLabel(g.day, 'fr'))}${g.off && offL ? ` · ${apEsc(offL)}` : ''}</div>`;
          }).join('')}</div>
        </div>
        ${plan.scale !== 'day' ? `<div class="ap-hrow ap-h2">
          <div class="ap-lab" style="width:${LW}px;"></div>
          <div class="ap-htrack" style="width:${W}px;">${cols.map((c, i) => `<div class="ap-hcell ${c.off ? 'off' : ''}" style="left:${i * cw}px;width:${cw}px;" title="${apEsc(c.sub || '')}">${apEsc(plan.scale === 'hour' ? c.label + 'h' : c.label)}</div>`).join('')}</div>
        </div>` : ''}
        <div style="position:relative;">
          <div class="ap-bg" style="left:${LW}px;width:${W}px;">
            ${groups.filter(g => g.off).map(g => `<div class="off" style="left:${g.a * cw}px;width:${(g.b - g.a + 1) * cw}px;"></div>`).join('')}
            ${groups.slice(1).map(g => `<div class="dl" style="left:${g.a * cw}px;"></div>`).join('')}
            ${nowX !== null ? `<div class="now" style="left:${nowX * cw}px;" title="Maintenant"></div>` : ''}
          </div>
          ${plan.rows.map(r => apRowHtml(r, cols, cw, LW, W, ro)).join('')}
        </div>
        ${ro ? '' : `<div class="ap-add" style="width:${LW}px;">
          <button class="btn btn-ghost btn-sm" onclick="apAddRow('task')">＋ Tâche</button>
          <button class="btn btn-ghost btn-sm" onclick="apAddRow('section')">＋ Section</button>
          <button class="btn btn-ghost btn-sm" onclick="apAddRow('milestone')">◆ Jalon</button>
        </div>`}
      </div>
    </div>
    <div class="ap-foot">
      <textarea id="ap-note" placeholder="Note en bas du planning" ${ro ? 'disabled' : ''}>${apEsc(plan.note || '')}</textarea>
      <div class="ap-help">${ro ? 'Lecture seule.' : `🖱 <b>Clique-glisse</b> dans une ligne pour dessiner une barre · <b>clic sur une barre</b> = texte, couleur, heures exactes · <b>glisse</b> une barre pour la déplacer, ses <b>bords</b> pour l'allonger<br>◆ Jalon = un moment précis (livraison, grue, handover) · clic sur un <b>jour</b> en haut = le griser · ⋮⋮ = réordonner · 🔗 = suit les données du projet · 🔒 = pas dans la version client`}</div>
    </div>`;

  const sc = ov.querySelector('.ap-scroll');
  sc.scrollLeft = sx; sc.scrollTop = sy;
  if (!ro) apBindEditor(ov);
  else sc.addEventListener('pointerup', e => { const b = e.target.closest('.ap-bar'); if (b) apBarPop(b); });
}

function apRowHtml(r, cols, cw, LW, W, ro) {
  const plan = AP.plan;
  const color = apColorOf(r);
  const cls = r.kind === 'section' ? 'sec' : r.kind === 'crew' ? 'crew' : '';
  const T = AP_TXT[plan.lang];
  let track = '';
  if (r.kind === 'section') {
    track = `<div class="ap-sec-band" style="background:${color};"></div>`;
  } else if (r.kind === 'crew') {
    const counts = apCrewCounts(plan, AP.project, AP.phase, cols);
    const max = Math.max(1, ...counts);
    track = counts.map((n, i) => n ? `<div class="ap-crew" style="left:${i * cw + 2}px;width:${cw - 4}px;background:rgba(143,170,220,${0.25 + 0.65 * n / max});">${n}</div>` : '').join('');
  } else if (r.kind === 'milestone') {
    if (r.at) {
      const t = apT(r.at);
      const out = t < (cols[0]?.s ?? 0) ? 'before' : t > (cols[cols.length - 1]?.e ?? 0) + 1 ? 'after' : '';
      const x = out === 'before' ? 0 : out === 'after' ? cols.length : apX(cols, t);
      const txt = r.noTime ? `${apDayLabel(r.at.slice(0, 10), 'fr')} (${T.timeTbc})` : (out || plan.scale === 'day' && cw < 70 ? apDateTimeLabel(r.at, 'fr') : r.at.slice(11, 16));
      track = `<div class="ap-ms" data-ms="1" style="left:${x * cw}px;${out === 'after' ? 'flex-direction:row-reverse;' : ''}" title="${apEsc(apDateTimeLabel(r.at, 'fr'))}"><span class="ap-dia" style="background:${color};"></span><span class="mt">${out === 'before' ? '◀ ' : ''}${apEsc(out ? apDateTimeLabel(r.at, 'fr') : txt)}${out === 'after' ? ' ▶' : ''}</span></div>`;
    } else if (!ro) {
      track = `<div style="position:absolute;inset:0;display:flex;align-items:center;padding-left:8px;font-size:11px;color:var(--text3);pointer-events:none;">Clique à l'endroit du jalon ↦</div>`;
    }
  } else {
    track = (r.bars || []).map(b => {
      const box = apBarBox(plan, cols, b);
      if (!box) return '';
      const c = apColorOf(r, b);
      const hrs = apBarHours(plan, cols, b, box.r);
      const label = [b.text, hrs].filter(Boolean).join(' · ');
      return `<div class="ap-bar ${ro ? 'ro' : ''}" data-bar="${b.id}" style="left:${box.x * cw + 1}px;width:${Math.max(6, box.w * cw - 2)}px;background:${c};color:${apTextOn(c)};" title="${apEsc((b.text ? b.text + ' — ' : '') + apDateTimeLabel(b.s, 'fr') + ' → ' + apDateTimeLabel(b.e, 'fr'))}">${ro ? '' : '<span class="hd" data-h="l"></span>'}<span class="bt">${apEsc(label)}</span>${ro ? '' : '<span class="hd" data-h="r"></span>'}</div>`;
    }).join('');
  }
  const linked = r.src && !r.detached;
  return `
    <div class="ap-row ${cls}" data-row="${r.id}">
      <div class="ap-lab" style="width:${LW}px;">
        ${ro ? '' : `<span class="ap-handle" draggable="true" title="Glisser pour déplacer la ligne">⋮⋮</span>`}
        ${r.kind === 'crew' ? '' : `<span class="ap-dot" data-act="color" style="background:${color};" title="Couleur"></span>`}
        <input class="in-label" data-f="label" value="${apEsc(r.label)}" placeholder="${r.kind === 'section' ? 'SECTION' : r.kind === 'milestone' ? 'Jalon (ex. 🏗️ Grue sur site)' : 'Nouvelle tâche'}" ${ro ? 'disabled' : ''}>
        ${r.kind === 'section' ? '' : `<input class="in-who" data-f="who" value="${apEsc(r.who || '')}" placeholder="${apEsc(AP_TXT[plan.lang].who)}" ${ro ? 'disabled' : ''}>`}
        ${linked ? `<span class="ap-ic" title="Suit les données du projet (${apEsc(r.src.split(':')[0])})">🔗</span>` : ''}
        ${r.internal ? `<span class="ap-ic" title="Ligne interne : pas dans la version client">🔒</span>` : ''}
        ${ro ? '' : `<button class="ap-mbtn" data-act="menu" title="Options de la ligne">⋮</button>`}
      </div>
      <div class="ap-track" data-track="${r.id}" style="width:${W}px;">${track}</div>
    </div>`;
}

// ─── modifications / historique / enregistrement ───
function apPushUndo() {
  AP.undo.push(JSON.stringify(AP.plan));
  if (AP.undo.length > 60) AP.undo.shift();
  AP.redo = [];
}
function apChange(fn, { render = true } = {}) {
  apPushUndo();
  fn(AP.plan);
  apDirty();
  if (render) apRenderEditor();
}
function apUndo() {
  if (!AP.undo.length) return;
  AP.redo.push(JSON.stringify(AP.plan));
  AP.plan = JSON.parse(AP.undo.pop());
  apDirty(); apRenderEditor();
}
function apRedo() {
  if (!AP.redo.length) return;
  AP.undo.push(JSON.stringify(AP.plan));
  AP.plan = JSON.parse(AP.redo.pop());
  apDirty(); apRenderEditor();
}
function apDirty() {
  if (AP.saveTimer) clearTimeout(AP.saveTimer);
  AP.saveTimer = setTimeout(() => { AP.saveTimer = null; apSave(); }, 1200);
}
async function apSave(force = false) {
  if (!AP.plan || !AP.canEdit) return;
  AP.saving = true;
  const r = await fetch(`${API}/assembly-plans/project/${AP.projectId}/${AP.phase}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ data: AP.plan, revision: AP.revision, force }),
  }).then(x => x.json().then(j => ({ status: x.status, j }))).catch(() => null);
  AP.saving = false;
  if (r?.status === 409) {
    const keepMine = confirm(`${r.j.error}.\n\nOK = garder MA version (elle remplace la sienne)\nAnnuler = reprendre SA version (mes derniers changements sont perdus)`);
    if (keepMine) return apSave(true);
    AP.plan = apClean(r.j.data.data);
    AP.revision = r.j.data.revision;
    AP.plans[AP.phase] = { ...r.j.data, data: AP.plan };
    AP.undo = []; AP.redo = [];
    apRenderEditor();
    return;
  }
  if (!r?.j?.success) { AP.error = r?.j?.error || 'Enregistrement impossible (réseau)'; apRenderEditor(); return; }
  AP.error = null;
  AP.revision = r.j.data.revision;
  AP.savedAt = r.j.data.updatedAt;
  AP.plans[AP.phase] = { ...r.j.data, data: JSON.parse(JSON.stringify(AP.plan)) };
  const st = document.getElementById('ap-state');
  if (st && !AP.saveTimer) st.textContent = '✔ Enregistré';
}

function apRow(id) { return AP.plan.rows.find(r => r.id === id); }
function apSet(field, value) {
  apChange(p => { p[field] = value; });
}
function apZoom(d) {
  AP.zoom = Math.max(0.5, Math.min(2.5, (AP.zoom || 1) * (d > 0 ? 1.25 : 0.8)));
  apRenderEditor();
}
async function apSetLang(lang) {
  if (lang === AP.plan.lang) return;
  apPushUndo();
  const custom = apSwitchLang(AP.plan, lang);
  apSync(AP.plan, AP.project, AP.phase);
  apDirty(); apRenderEditor();
  const texts = custom.map(c => c.obj[c.f]).filter(Boolean);
  if (texts.length && confirm(`Langue de l'export : ${lang === 'en' ? 'anglais' : 'français'}.\n\nLes libellés du planning type, des camions et la note ont été changés.\nTraduire aussi les ${texts.length} texte(s) saisi(s) à la main ?`)) {
    toast('🌐 Traduction…', 'info');
    const r = await api('POST', '/translate', { texts: custom.map(c => String(c.obj[c.f] || '')), targetLang: lang, sourceLang: lang === 'en' ? 'fr' : 'en' });
    const tr = r?.data?.translations;
    if (!Array.isArray(tr)) { toast(r?.error || 'Traduction impossible', 'error'); return; }
    custom.forEach((c, i) => { if (tr[i]) c.obj[c.f] = tr[i]; });
    apDirty(); apRenderEditor();
    toast('🌐 Libellés traduits — vérifie-les', 'success');
  }
}
function apAddRow(kind, afterId) {
  apChange(p => {
    const row = { id: apUid(), kind, label: '', who: '', color: kind === 'section' ? '#9dc3e6' : '', bars: [], at: null };
    const i = afterId ? p.rows.findIndex(r => r.id === afterId) + 1 : p.rows.length;
    p.rows.splice(i, 0, row);
    AP.focusRow = row.id;
  });
  const inp = document.querySelector(`#ap-editor .ap-row[data-row="${AP.focusRow}"] .in-label`);
  if (inp) { inp.focus(); inp.scrollIntoView({ block: 'nearest' }); }
}
function apTemplateAsk() {
  if (!confirm(`Ajouter les tâches du planning type Viewbox (${AP.phase === 'dismantling' ? 'démontage' : 'montage'}) ?\n\nElles sont réparties sur les jours non grisés de la période, à ajuster ensuite.`)) return;
  apChange(p => apApplyTemplate(p, AP.phase));
}
async function apReset() {
  if (!confirm('Supprimer tout ce planning ? (les données du projet ne sont pas touchées)')) return;
  if (AP.saveTimer) { clearTimeout(AP.saveTimer); AP.saveTimer = null; }
  const r = await api('DELETE', `/assembly-plans/project/${AP.projectId}/${AP.phase}`);
  if (!r?.success) { toast(r?.error || 'Suppression impossible', 'error'); return; }
  delete AP.plans[AP.phase];
  AP.plan = null;
  document.removeEventListener('keydown', apKey);
  document.getElementById('ap-editor')?.remove();
  apRenderCard();
}

// ─── interactions de la grille ───
function apBindEditor(ov) {
  const g = id => ov.querySelector(id);
  g('#ap-title').addEventListener('change', e => apChange(p => { p.title = e.target.value.trim(); }, { render: false }));
  g('#ap-note').addEventListener('change', e => apChange(p => { p.note = e.target.value; }, { render: false }));
  g('#ap-from').addEventListener('change', e => apSetRange(e.target.value, AP.plan.to));
  g('#ap-to').addEventListener('change', e => apSetRange(AP.plan.from, e.target.value));
  g('#ap-hs').addEventListener('change', e => apSetHours(+e.target.value, AP.plan.hours.end));
  g('#ap-he').addEventListener('change', e => apSetHours(AP.plan.hours.start, +e.target.value));

  const sc = ov.querySelector('.ap-scroll');
  sc.addEventListener('change', e => {
    const inp = e.target.closest('input[data-f]');
    if (!inp) return;
    const row = apRow(inp.closest('.ap-row')?.dataset.row);
    if (!row) return;
    apChange(() => { row[inp.dataset.f] = inp.value.trim(); }, { render: false });
  });
  sc.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('input[data-f="label"]')) {
      e.preventDefault();
      const id = e.target.closest('.ap-row').dataset.row;
      e.target.blur();
      apAddRow(apRow(id)?.kind === 'section' ? 'task' : apRow(id)?.kind === 'milestone' ? 'milestone' : 'task', id);
    }
  });
  sc.addEventListener('click', e => {
    const act = e.target.closest('[data-act]');
    if (act) {
      const id = act.closest('.ap-row')?.dataset.row;
      if (act.dataset.act === 'menu') apRowMenu(act, id);
      if (act.dataset.act === 'color') apColorPop(act, c => apChange(() => { apRow(id).color = c; }), apRow(id)?.color);
      return;
    }
    const day = e.target.closest('.ap-h1 .ap-hcell');
    if (day) apDayPop(day, day.dataset.day);
  });
  sc.addEventListener('pointerdown', apDown);
  sc.addEventListener('pointermove', apMove);
  sc.addEventListener('pointerup', apUp);
  sc.addEventListener('pointercancel', () => apEndDrag());
  // réordonner les lignes (souris)
  sc.addEventListener('dragstart', e => {
    const h = e.target.closest?.('.ap-handle');
    if (!h) return;
    AP.dragRow = h.closest('.ap-row').dataset.row;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', AP.dragRow);
  });
  sc.addEventListener('dragover', e => {
    if (!AP.dragRow) return;
    const r = e.target.closest('.ap-row');
    sc.querySelectorAll('.ap-row.dragover').forEach(x => x.classList.remove('dragover'));
    if (r) { e.preventDefault(); r.classList.add('dragover'); }
  });
  sc.addEventListener('drop', e => {
    const r = e.target.closest('.ap-row');
    const from = AP.dragRow;
    AP.dragRow = null;
    if (!r || !from || r.dataset.row === from) { apRenderEditor(); return; }
    e.preventDefault();
    apChange(p => {
      const i = p.rows.findIndex(x => x.id === from);
      const [row] = p.rows.splice(i, 1);
      p.rows.splice(p.rows.findIndex(x => x.id === r.dataset.row), 0, row);
    });
  });
  sc.addEventListener('dragend', () => { AP.dragRow = null; sc.querySelectorAll('.ap-row.dragover').forEach(x => x.classList.remove('dragover')); });
}
function apSetRange(from, to) {
  if (!from || !to) return;
  if (apT(to) < apT(from)) { toast('La fin est avant le début', 'warning'); apRenderEditor(); return; }
  if (apT(to) - apT(from) > 60 * 1440) { toast('60 jours au plus', 'warning'); apRenderEditor(); return; }
  apChange(p => { p.from = from; p.to = to; apSync(p, AP.project, AP.phase); });
}
function apSetHours(s, e) {
  if (e <= s) { toast("L'heure de fin doit être après l'heure de début", 'warning'); apRenderEditor(); return; }
  apChange(p => { p.hours = { start: s, end: e }; apSync(p, AP.project, AP.phase); });
}

function apCovered(row, c) {
  const col = AP.cols[c];
  return (row.bars || []).some(b => apT(b.s) < col.e && apT(b.e) > col.s);
}
function apDown(e) {
  if (e.button > 0) return;
  const track = e.target.closest('.ap-track');
  if (!track || e.target.closest('input,button')) return;
  const row = apRow(track.dataset.track);
  if (!row || row.kind === 'section' || row.kind === 'crew' || !AP.cols.length) return;
  const rect = track.getBoundingClientRect(), cw = apColW(AP.plan);
  const colAt = x => Math.max(0, Math.min(AP.cols.length - 1, Math.floor((x - rect.left) / cw)));
  const barEl = e.target.closest('.ap-bar'), msEl = e.target.closest('.ap-ms');
  const st = { row, track, rect, cw, colAt, x0: e.clientX, y0: e.clientY, c0: colAt(e.clientX), moved: false, touch: e.pointerType !== 'mouse', id: e.pointerId };
  if (barEl) {
    st.mode = e.target.dataset.h === 'l' ? 'resize-l' : e.target.dataset.h === 'r' ? 'resize-r' : 'move';
    st.bar = row.bars.find(b => b.id === barEl.dataset.bar);
    st.el = barEl;
    st.left0 = parseFloat(barEl.style.left); st.width0 = parseFloat(barEl.style.width);
  } else if (msEl) { st.mode = 'ms'; st.el = msEl; st.left0 = parseFloat(msEl.style.left); }
  else if (row.kind === 'milestone') st.mode = 'ms-place';
  else { if (apCovered(row, st.c0)) return; st.mode = 'paint'; }
  AP.drag = st;
  if (!st.touch) { track.setPointerCapture(e.pointerId); e.preventDefault(); }
}
function apMove(e) {
  const st = AP.drag;
  if (!st || e.pointerId !== st.id) return;
  if (Math.abs(e.clientX - st.x0) > (st.touch ? 10 : 4) || Math.abs(e.clientY - st.y0) > (st.touch ? 10 : 30)) st.moved = true;
  if (st.touch || !st.moved) return;
  const c1 = st.colAt(e.clientX), cw = st.cw;
  if (st.mode === 'paint') {
    // jusqu'à la première case déjà occupée dans le sens du geste
    const dir = c1 >= st.c0 ? 1 : -1;
    let c = st.c0;
    while (c !== c1 && !apCovered(st.row, c + dir)) c += dir;
    st.c1 = c;
    let gh = st.track.querySelector('.ap-ghost');
    if (!gh) { gh = document.createElement('div'); gh.className = 'ap-ghost'; st.track.appendChild(gh); }
    const a = Math.min(st.c0, c), b = Math.max(st.c0, c);
    gh.style.left = `${a * cw}px`; gh.style.width = `${(b - a + 1) * cw}px`;
  } else if (st.mode === 'move' || st.mode === 'ms') {
    const dx = st.mode === 'move' ? (c1 - st.c0) * cw : e.clientX - st.x0;
    st.el.style.transform = `translateX(${dx}px)`;
    st.el.style.opacity = '.8';
  } else if (st.mode === 'resize-l' || st.mode === 'resize-r') {
    const r = apBarBox(AP.plan, AP.cols, st.bar)?.r;
    if (!r) return;
    if (st.mode === 'resize-l') { const a = Math.min(c1, r[1]); st.el.style.left = `${a * cw + 1}px`; st.el.style.width = `${(r[1] - a + 1) * cw - 2}px`; }
    else { const b = Math.max(c1, r[0]); st.el.style.width = `${(b + 1) * cw - st.left0 - 1}px`; }
  }
}
function apEndDrag() {
  const st = AP.drag;
  AP.drag = null;
  st?.track?.querySelector('.ap-ghost')?.remove();
  if (st?.el) { st.el.style.transform = ''; st.el.style.opacity = ''; }
}
function apUp(e) {
  const st = AP.drag;
  if (!st || e.pointerId !== st.id) return;
  apEndDrag();
  if (st.touch && st.moved) return; // c'était un défilement
  const cols = AP.cols, row = st.row;
  const c1 = st.colAt(e.clientX);
  if (st.mode === 'paint') {
    const c = st.moved && st.c1 !== undefined ? st.c1 : st.c0;
    const a = Math.min(st.c0, c), b = Math.max(st.c0, c);
    apChange(() => {
      row.bars.push({ id: apUid(), s: apS(cols[a].s), e: apS(cols[b].e), text: '', color: '' });
      apMerge(row);
    });
    return;
  }
  if (st.mode === 'ms-place') {
    const x = (e.clientX - st.rect.left) / st.cw;
    apChange(() => { row.at = apS(apSnapTime(cols, x)); row.noTime = false; });
    return;
  }
  if (st.mode === 'ms') {
    if (!st.moved) { apMsPop(st.el, row); return; }
    if (row.src && !row.detached) { toast('🔗 Ce jalon suit les données du projet : change la date dans le projet (Camions…), ou « Détacher » dans le menu ⋮ de la ligne', 'warning'); return; }
    const x = (st.left0 + (e.clientX - st.x0)) / st.cw;
    apChange(() => { row.at = apS(apSnapTime(cols, x)); row.noTime = false; });
    return;
  }
  if (!st.moved) { apBarPop(st.el); return; }
  const b = st.bar, box = apBarBox(AP.plan, cols, b);
  if (!box) return;
  const [a, z] = box.r, n = cols.length;
  const s = apT(b.s), en = apT(b.e);
  apChange(() => {
    if (st.mode === 'move') {
      const dc = Math.max(-a, Math.min(n - 1 - z, c1 - st.c0));
      if (!dc) return;
      b.s = apS(cols[a + dc].s + Math.max(0, s - cols[a].s));
      b.e = apS(cols[z + dc].e - Math.max(0, cols[z].e - en));
      if (b.src) delete b.src;
    } else if (st.mode === 'resize-l') {
      b.s = apS(cols[Math.min(c1, z)].s);
    } else {
      b.e = apS(cols[Math.max(c1, a)].e);
    }
    apMerge(row);
  });
}
/** temps à une position (colonnes) : heures = au quart d'heure, sinon début de la case */
function apSnapTime(cols, x) {
  const i = Math.max(0, Math.min(cols.length - 1, Math.floor(x)));
  const c = cols[i];
  if (AP.plan.scale !== 'hour') return c.s;
  const t = c.s + (x - i) * (c.e - c.s);
  return Math.round(t / 15) * 15;
}
/** barres qui se touchent / se chevauchent, même texte et même couleur → une seule */
function apMerge(row) {
  const cols = AP.cols;
  const bars = row.bars.slice().sort((x, y) => apT(x.s) - apT(y.s));
  const out = [];
  for (const b of bars) {
    const prev = out[out.length - 1];
    if (prev && !prev.src && !b.src && (prev.text || '') === (b.text || '') && (prev.color || '') === (b.color || '')) {
      const rp = apRange(cols, apT(prev.s), apT(prev.e)), rb = apRange(cols, apT(b.s), apT(b.e));
      if (apT(b.s) <= apT(prev.e) || (rp && rb && rb[0] <= rp[1] + 1)) {
        if (apT(b.e) > apT(prev.e)) prev.e = b.e;
        continue;
      }
    }
    out.push(b);
  }
  row.bars = out;
}

// ─── fenêtres (popovers) ───
function apPopClose() {
  document.querySelectorAll('.ap-pop').forEach(p => p.remove());
  document.removeEventListener('pointerdown', apPopOutside, true);
}
function apPopOutside(e) { if (!e.target.closest('.ap-pop')) apPopClose(); }
function apPop(anchor, html, mount) {
  apPopClose();
  const p = document.createElement('div');
  p.className = 'ap-pop';
  p.innerHTML = html;
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  const pw = p.offsetWidth, phh = p.offsetHeight;
  let left = Math.min(window.innerWidth - pw - 8, Math.max(8, r.left));
  let top = r.bottom + 6;
  if (top + phh > window.innerHeight - 8) top = Math.max(8, r.top - phh - 6);
  p.style.left = `${left}px`; p.style.top = `${top}px`;
  setTimeout(() => document.addEventListener('pointerdown', apPopOutside, true), 0);
  mount?.(p);
  return p;
}
function apSwatches(sel, withNone) {
  return `<div class="ap-sw">${withNone ? `<span data-c="" class="${!sel ? 'on' : ''}" title="Couleur de la ligne" style="background:linear-gradient(135deg,#fff 45%,#e63946 45% 55%,#fff 55%);"></span>` : ''}${AP_COLORS.map(c => `<span data-c="${c}" class="${sel === c ? 'on' : ''}" style="background:${c};"></span>`).join('')}<input type="color" value="${sel || AP_DEFAULT_COLOR}" title="Autre couleur" style="width:26px;height:22px;padding:0;border:none;background:none;"></div>`;
}
function apColorPop(anchor, onPick, sel) {
  apPop(anchor, `<div style="font-weight:700;margin-bottom:8px;">Couleur</div>${apSwatches(sel)}`, p => {
    p.querySelectorAll('[data-c]').forEach(s => s.onclick = () => { apPopClose(); onPick(s.dataset.c); });
    p.querySelector('input[type=color]').onchange = e => { apPopClose(); onPick(e.target.value); };
  });
}
function apRowMenu(anchor, id) {
  const r = apRow(id);
  if (!r) return;
  const linked = r.src && !r.detached;
  apPop(anchor, `
    <button class="mi" data-a="up">▲ Monter</button>
    <button class="mi" data-a="down">▼ Descendre</button>
    <button class="mi" data-a="task">＋ Tâche en dessous</button>
    <button class="mi" data-a="milestone">◆ Jalon en dessous</button>
    <button class="mi" data-a="section">＋ Section en dessous</button>
    ${r.kind !== 'crew' ? `<button class="mi" data-a="dup">⧉ Dupliquer</button>` : ''}
    ${r.kind === 'task' ? `<button class="mi" data-a="clear">⌫ Effacer les barres</button>` : ''}
    <button class="mi" data-a="internal">${r.internal ? '🔓 Montrer dans la version client' : '🔒 Ligne interne (pas pour le client)'}</button>
    ${linked ? `<button class="mi" data-a="detach">✂ Détacher des données du projet</button>` : ''}
    <button class="mi danger" data-a="del">🗑 Supprimer la ligne</button>`, p => {
    p.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      const a = b.dataset.a;
      apPopClose();
      if (['task', 'milestone', 'section'].includes(a)) return apAddRow(a, id);
      apChange(pl => {
        const i = pl.rows.findIndex(x => x.id === id);
        if (a === 'up' && i > 0) [pl.rows[i - 1], pl.rows[i]] = [pl.rows[i], pl.rows[i - 1]];
        if (a === 'down' && i < pl.rows.length - 1) [pl.rows[i + 1], pl.rows[i]] = [pl.rows[i], pl.rows[i + 1]];
        if (a === 'dup') {
          const c = JSON.parse(JSON.stringify(r));
          c.id = apUid(); delete c.src; delete c.labelAuto; delete c.detached;
          c.bars.forEach(x => { x.id = apUid(); delete x.src; });
          pl.rows.splice(i + 1, 0, c);
        }
        if (a === 'clear') r.bars = [];
        if (a === 'internal') r.internal = !r.internal;
        if (a === 'detach') r.detached = true;
        if (a === 'del') {
          if (r.src) pl.dismissed = [...new Set([...(pl.dismissed || []), r.src])];
          pl.rows.splice(i, 1);
        }
      });
    });
  });
}
function apBarPop(el) {
  const row = apRow(el.closest('.ap-row')?.dataset.row);
  const b = row?.bars.find(x => x.id === el.dataset.bar);
  if (!b) return;
  const ro = !AP.canEdit;
  apPop(el, `
    <div style="font-weight:700;">${apEsc(row.label || 'Tâche')}</div>
    <label>Texte dans la barre (ex. « L-shape », « 1 escalier », « 4 pers. »)</label>
    <input type="text" id="ap-b-text" value="${apEsc(b.text || '')}" ${ro ? 'disabled' : ''}>
    <div class="row"><div style="flex:1;"><label>Début</label><input type="datetime-local" id="ap-b-s" value="${b.s}" ${ro ? 'disabled' : ''}></div>
    <div style="flex:1;"><label>Fin</label><input type="datetime-local" id="ap-b-e" value="${b.e}" ${ro ? 'disabled' : ''}></div></div>
    ${b.src ? `<div style="font-size:11px;color:var(--text3);margin-top:6px;">🔗 Vient d'une tâche du projet : suit sa date tant que tu ne la déplaces pas.</div>` : ''}
    ${ro ? '' : `<label>Couleur</label>${apSwatches(b.color, true)}
    <div class="acts"><button class="btn btn-ghost btn-sm" data-a="del" style="color:#e63946;">🗑 Supprimer</button><button class="btn btn-ghost btn-sm" data-a="dup">⧉ Copier au jour suivant</button><button class="btn btn-primary btn-sm" data-a="ok">OK</button></div>`}`, p => {
    if (ro) return;
    let color = b.color || '';
    p.querySelectorAll('[data-c]').forEach(s => s.onclick = () => { color = s.dataset.c; p.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === s)); });
    p.querySelector('input[type=color]').onchange = e => { color = e.target.value; };
    const txt = p.querySelector('#ap-b-text');
    txt.focus(); txt.select();
    const ok = () => {
      const s = p.querySelector('#ap-b-s').value, e = p.querySelector('#ap-b-e').value;
      if (!s || !e || apT(e) <= apT(s)) { toast('La fin doit être après le début', 'warning'); return; }
      apPopClose();
      apChange(() => {
        if (s !== b.s || e !== b.e) delete b.src;
        b.text = txt.value.trim(); b.s = s.slice(0, 16); b.e = e.slice(0, 16); b.color = color;
        apMerge(row);
      });
    };
    txt.onkeydown = e => { if (e.key === 'Enter') ok(); };
    p.querySelector('[data-a=ok]').onclick = ok;
    p.querySelector('[data-a=del]').onclick = () => { apPopClose(); apChange(() => { row.bars = row.bars.filter(x => x !== b); }); };
    p.querySelector('[data-a=dup]').onclick = () => {
      apPopClose();
      apChange(() => { row.bars.push({ ...b, id: apUid(), s: apS(apT(b.s) + 1440), e: apS(apT(b.e) + 1440), src: undefined }); apMerge(row); });
    };
  });
}
function apMsPop(el, row) {
  const linked = row.src && !row.detached;
  apPop(el, `
    <div style="font-weight:700;">◆ ${apEsc(row.label || 'Jalon')}</div>
    ${linked ? `<div style="font-size:12px;color:var(--text2);margin-top:6px;">🔗 Suit les données du projet : ${apEsc(apDateTimeLabel(row.at, 'fr'))}${row.noTime ? ' (heure non renseignée)' : ''}.<br>Pour la changer, modifie le projet (onglet Camions…) ou détache ce jalon.</div>
      <div class="acts"><button class="btn btn-ghost btn-sm" data-a="detach">✂ Détacher</button><button class="btn btn-primary btn-sm" data-a="close">OK</button></div>`
    : `<label>Date et heure</label><input type="datetime-local" id="ap-m-at" value="${row.at || ''}">
      <label class="ap-chk" style="text-transform:none;"><input type="checkbox" id="ap-m-nt" ${row.noTime ? 'checked' : ''}> Heure à confirmer</label>
      <div class="acts"><button class="btn btn-ghost btn-sm" data-a="clear" style="color:#e63946;">Retirer la date</button><button class="btn btn-primary btn-sm" data-a="ok">OK</button></div>`}`, p => {
    p.querySelector('[data-a=close]')?.addEventListener('click', apPopClose);
    p.querySelector('[data-a=detach]')?.addEventListener('click', () => { apPopClose(); apChange(() => { row.detached = true; }); });
    p.querySelector('[data-a=clear]')?.addEventListener('click', () => { apPopClose(); apChange(() => { row.at = null; }); });
    p.querySelector('[data-a=ok]')?.addEventListener('click', () => {
      const v = p.querySelector('#ap-m-at').value, nt = p.querySelector('#ap-m-nt').checked;
      apPopClose();
      if (v) apChange(() => { row.at = v.slice(0, 16); row.noTime = nt; });
    });
  });
}
function apDayPop(anchor, day) {
  const off = Object.prototype.hasOwnProperty.call(AP.plan.offDays || {}, day);
  apPop(anchor, `
    <div style="font-weight:700;">${apEsc(apDayLabel(day, 'fr', true))}</div>
    <label class="ap-chk" style="text-transform:none;"><input type="checkbox" id="ap-d-off" ${off ? 'checked' : ''}> Jour grisé (pas de montage : événement, repos, week-end…)</label>
    <label>Texte affiché (facultatif)</label><input type="text" id="ap-d-l" value="${apEsc(AP.plan.offDays?.[day] || '')}" placeholder="ex. Événement, Repos">
    <div class="acts"><button class="btn btn-primary btn-sm" data-a="ok">OK</button></div>`, p => {
    const ok = () => {
      const on = p.querySelector('#ap-d-off').checked, l = p.querySelector('#ap-d-l').value.trim();
      apPopClose();
      apChange(pl => { pl.offDays = { ...(pl.offDays || {}) }; if (on || l) pl.offDays[day] = l; else delete pl.offDays[day]; });
    };
    p.querySelector('#ap-d-l').oninput = () => { p.querySelector('#ap-d-off').checked = true; };
    p.querySelector('#ap-d-l').onkeydown = e => { if (e.key === 'Enter') ok(); };
    p.querySelector('[data-a=ok]').onclick = ok;
  });
}
function apSlotsPop(anchor) {
  const slots = JSON.parse(JSON.stringify(AP.plan.slots || []));
  const draw = p => {
    p.querySelector('#ap-sl').innerHTML = slots.map((s, i) => `
      <div class="row" style="margin-top:6px;"><input type="text" data-i="${i}" data-f="label" value="${apEsc(s.label)}" style="flex:1;">
      <input type="time" data-i="${i}" data-f="from" value="${s.from}" style="width:92px;"><input type="time" data-i="${i}" data-f="to" value="${s.to === '24:00' ? '23:59' : s.to}" style="width:92px;">
      <button class="ap-mbtn" data-del="${i}" title="Supprimer">✕</button></div>`).join('');
    p.querySelectorAll('[data-f]').forEach(inp => inp.oninput = () => { slots[+inp.dataset.i][inp.dataset.f] = inp.value; });
    p.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { slots.splice(+b.dataset.del, 1); draw(p); });
  };
  apPop(anchor, `<div style="font-weight:700;">🕘 Tranches de la journée</div>
    <div style="font-size:11px;color:var(--text3);margin-top:4px;">Ex. Matin 07:00–12:00 · Après-midi 13:00–18:00 · Soir 18:00–22:00</div>
    <div id="ap-sl"></div>
    <div class="acts"><button class="btn btn-ghost btn-sm" data-a="add">＋ Tranche</button><button class="btn btn-primary btn-sm" data-a="ok">OK</button></div>`, p => {
    draw(p);
    p.querySelector('[data-a=add]').onclick = () => { const last = slots[slots.length - 1]; slots.push({ id: apUid(), label: 'Soir', from: last?.to || '18:00', to: '22:00' }); draw(p); };
    p.querySelector('[data-a=ok]').onclick = () => {
      const ok = slots.filter(s => s.label && apMin(s.to) > apMin(s.from));
      if (!ok.length) { toast('Au moins une tranche avec une fin après le début', 'warning'); return; }
      apPopClose();
      apChange(pl => { pl.slots = ok.sort((a, b) => apMin(a.from) - apMin(b.from)); });
    };
  });
}
/** 🔗 données du projet : ce qui est suivi, ce qui a été retiré, tâches datées à importer */
function apDataPop(anchor) {
  const plan = AP.plan, pr = AP.project;
  const srcs = apSources(plan, pr, AP.phase);
  const present = new Set(plan.rows.filter(r => r.src).map(r => r.src));
  const dismissed = srcs.filter(s => !present.has(s.src) && (plan.dismissed || []).includes(s.src));
  const taskGroups = srcs.filter(s => s.optional && !present.has(s.src));
  const linked = plan.rows.filter(r => r.src && !r.detached);
  const bookings = (pr.teamBookings || []).filter(b => b.phase === AP.phase).length;
  apPop(anchor, `
    <div style="font-weight:700;">🔗 Données du projet</div>
    <div style="font-size:12px;color:var(--text2);margin-top:6px;line-height:1.5;">
      🚚 ${(pr.trucks || []).length} camion(s) · 👷 ${bookings ? `${bookings} présence(s) d'équipe (Bookings)` : `${pr.workersCount || 0} ouvrier(s) prévu(s)`} · 📋 ${(pr.tasks || []).length} tâche(s) datée(s)<br>
      Suivi dans ce planning : <b>${linked.length}</b> ligne(s). Les dates hors de la période (${apEsc(apDayLabel(plan.from, 'fr'))} → ${apEsc(apDayLabel(plan.to, 'fr'))}) ne sont pas reprises.
    </div>
    ${dismissed.length ? `<label>Retirées à la main</label>${dismissed.map(s => `<label class="ap-chk" style="text-transform:none;"><input type="checkbox" data-src="${apEsc(s.src)}"> ${apEsc(s.label)}</label>`).join('')}` : ''}
    ${taskGroups.length ? `<label>Tâches datées du projet</label>${taskGroups.map(s => `<label class="ap-chk" style="text-transform:none;"><input type="checkbox" data-src="${apEsc(s.src)}" checked> ${apEsc(s.label)} <span style="color:var(--text3);">(${s.bars.length} j.)</span></label>`).join('')}` : ''}
    <div class="acts">
      ${dismissed.length || taskGroups.length ? `<button class="btn btn-primary btn-sm" data-a="add">Ajouter la sélection</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-a="refresh">↻ Mettre à jour</button>
    </div>`, p => {
    p.querySelector('[data-a=refresh]').onclick = async () => {
      apPopClose();
      const r = await api('GET', `/assembly-plans/project/${AP.projectId}`);
      if (r?.success) AP.project = r.data.project;
      apChange(pl => apSync(pl, AP.project, AP.phase));
      toast('🔗 Planning mis à jour avec le projet', 'success');
    };
    p.querySelector('[data-a=add]')?.addEventListener('click', () => {
      const pick = [...p.querySelectorAll('input[data-src]:checked')].map(i => i.dataset.src);
      apPopClose();
      if (!pick.length) return;
      apChange(pl => {
        pl.dismissed = (pl.dismissed || []).filter(s => !pick.includes(s));
        const want = new Set(pick);
        const all = apSources(pl, AP.project, AP.phase).filter(s => want.has(s.src));
        for (const s of all) {
          pl.rows.splice(apInsertIndex(pl, s), 0, { id: apUid(), kind: s.kind, src: s.src, label: s.label, labelAuto: s.label, who: '', color: s.color || '', at: s.at || null, noTime: !!s.noTime, bars: (s.bars || []).map(b => ({ ...b })) });
        }
      });
    });
  });
}

// ═══ RENDU SVG (aperçu de la carte, image, PDF, briefing) ═══

function apTrunc(s, px, size) {
  s = String(s || '');
  const max = Math.floor(px / (size * 0.56));
  return s.length > max ? s.slice(0, Math.max(1, max - 1)) + '…' : s;
}
/** opts.internal = garder les lignes 🔒 ; opts.logo = data URL du logo blanc */
function apSvg(plan, project, phase, opts = {}) {
  const lang = plan.lang, T = AP_TXT[lang];
  const cols = apColumns(plan);
  const rows = plan.rows.filter(r => opts.internal || !r.internal);
  const hasWho = rows.some(r => r.who && r.kind !== 'section');
  const CW = { day: 120, slot: 62, hour: 34 }[plan.scale] || 120;
  const M = 22, HEAD = 78, H1 = 30, H2 = plan.scale === 'day' ? 0 : 22, RH = 28, SH = 24;
  const LAB = 400, WHO = hasWho ? 130 : 0;
  const gx = M + LAB + WHO, GW = Math.max(1, cols.length) * CW;
  const W = gx + GW + M;
  const gy = M + HEAD + 14;
  const bodyY = gy + H1 + H2;
  let y = bodyY;
  const rowYs = rows.map(r => { const ry = y; y += r.kind === 'section' ? SH : RH; return ry; });
  const bodyH = y - bodyY;
  const noteLines = String(plan.note || '').split('\n').filter(Boolean);
  const H = y + 16 + noteLines.length * 16 + 26 + M;
  const groups = apDayGroups(cols);
  const x = c => gx + c * CW;
  const F = 'Arial, Helvetica, sans-serif';
  const s = [];
  s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${F}">`);
  s.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  // en-tête
  s.push(`<rect x="${M}" y="${M}" width="${W - 2 * M}" height="${HEAD}" rx="10" fill="#3a0343"/>`);
  if (opts.logo) s.push(`<image href="${opts.logo}" x="${W - M - 20 - 190}" y="${M + (HEAD - 41) / 2}" width="190" height="41"/>`);
  const title = plan.title || T.title[phase];
  s.push(`<text x="${M + 20}" y="${M + 32}" font-size="22" font-weight="700" fill="#ffffff">${apEsc(apTrunc(title, W - 2 * M - 260, 22))}</text>`);
  const sub = [project.name, project.internalNumber, project.client?.name, [project.address, project.city].filter(Boolean).join(', ')].filter(Boolean).join('  ·  ');
  s.push(`<text x="${M + 20}" y="${M + 56}" font-size="13" fill="#e8d9ec">${apEsc(apTrunc(sub, W - 2 * M - 260, 13))}</text>`);
  // fonds : jours grisés, cases
  s.push(`<rect x="${M}" y="${gy}" width="${W - 2 * M}" height="${H1 + H2 + bodyH}" fill="#ffffff" stroke="#9a9a9a"/>`);
  s.push(`<rect x="${M}" y="${gy}" width="${W - 2 * M}" height="${H1 + H2}" fill="#f1edf2"/>`);
  s.push(`<defs><pattern id="aphatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#d9d9d9"/><line x1="0" y1="0" x2="0" y2="8" stroke="#c4c4c4" stroke-width="4"/></pattern></defs>`);
  for (const g of groups.filter(g => g.off)) s.push(`<rect x="${x(g.a)}" y="${gy}" width="${(g.b - g.a + 1) * CW}" height="${H1 + H2 + bodyH}" fill="url(#aphatch)"/>`);
  rows.forEach((r, i) => {
    if (r.kind === 'section') s.push(`<rect x="${M}" y="${rowYs[i]}" width="${W - 2 * M}" height="${SH}" fill="${apColorOf(r)}" fill-opacity="0.35"/>`);
  });
  // lignes de la grille
  rows.forEach((r, i) => s.push(`<line x1="${M}" y1="${rowYs[i]}" x2="${W - M}" y2="${rowYs[i]}" stroke="#d0d0d0"/>`));
  cols.forEach((c, i) => { if (i) s.push(`<line x1="${x(i)}" y1="${gy + (cols[i - 1].day === c.day ? H1 : 0)}" x2="${x(i)}" y2="${bodyY + bodyH}" stroke="${cols[i - 1].day === c.day ? '#e3e3e3' : '#8c8c8c'}"/>`); });
  s.push(`<line x1="${gx}" y1="${gy}" x2="${gx}" y2="${bodyY + bodyH}" stroke="#8c8c8c" stroke-width="1.5"/>`);
  if (hasWho) s.push(`<line x1="${M + LAB}" y1="${gy}" x2="${M + LAB}" y2="${bodyY + bodyH}" stroke="#bdbdbd"/>`);
  s.push(`<line x1="${M}" y1="${bodyY}" x2="${W - M}" y2="${bodyY}" stroke="#8c8c8c"/>`);
  if (H2) s.push(`<line x1="${gx}" y1="${gy + H1}" x2="${W - M}" y2="${gy + H1}" stroke="#bdbdbd"/>`);
  // en-têtes colonnes
  s.push(`<text x="${M + 10}" y="${gy + (H1 + H2) / 2 + 5}" font-size="13" font-weight="700" fill="#3a0343">${apEsc(T.task)}</text>`);
  if (hasWho) s.push(`<text x="${M + LAB + 8}" y="${gy + (H1 + H2) / 2 + 5}" font-size="13" font-weight="700" fill="#3a0343">${apEsc(T.who)}</text>`);
  for (const g of groups) {
    const w = (g.b - g.a + 1) * CW;
    const lbl = apDayLabel(g.day, lang) + (g.off && plan.offDays?.[g.day] ? ` · ${plan.offDays[g.day]}` : '');
    s.push(`<text x="${x(g.a) + w / 2}" y="${gy + 20}" font-size="13" font-weight="700" text-anchor="middle" fill="#222">${apEsc(apTrunc(lbl, w - 6, 13))}</text>`);
  }
  if (H2) cols.forEach((c, i) => s.push(`<text x="${x(i) + CW / 2}" y="${gy + H1 + 15}" font-size="10.5" text-anchor="middle" fill="#555">${apEsc(apTrunc(plan.scale === 'hour' ? c.label + 'h' : c.label, CW - 4, 10.5))}</text>`));
  // lignes
  rows.forEach((r, i) => {
    const ry = rowYs[i], h = r.kind === 'section' ? SH : RH, cy = ry + h / 2;
    const color = apColorOf(r);
    if (r.kind === 'section') {
      s.push(`<text x="${M + 10}" y="${cy + 4.5}" font-size="12.5" font-weight="700" letter-spacing="0.6" fill="#222">${apEsc(apTrunc(r.label, LAB + WHO + GW - 20, 12.5))}</text>`);
      return;
    }
    s.push(`<text x="${M + 10}" y="${cy + 4.5}" font-size="12.5" fill="#1a1a1a" ${r.kind === 'milestone' ? 'font-weight="700"' : ''}>${apEsc(apTrunc(r.label, LAB - 18, 12.5))}</text>`);
    if (hasWho && r.who) s.push(`<text x="${M + LAB + 8}" y="${cy + 4.5}" font-size="11.5" fill="#555">${apEsc(apTrunc(r.who, WHO - 14, 11.5))}</text>`);
    if (r.kind === 'crew') {
      const counts = apCrewCounts(plan, project, phase, cols);
      const max = Math.max(1, ...counts);
      counts.forEach((n, ci) => { if (!n) return;
        s.push(`<rect x="${x(ci) + 3}" y="${ry + 5}" width="${CW - 6}" height="${h - 10}" rx="4" fill="#8faadc" fill-opacity="${0.3 + 0.6 * n / max}"/>`);
        s.push(`<text x="${x(ci) + CW / 2}" y="${cy + 4}" font-size="11.5" font-weight="700" text-anchor="middle" fill="#10305a">${n}</text>`);
      });
    } else if (r.kind === 'milestone' && r.at) {
      const t = apT(r.at);
      if (!cols.length || t < cols[0].s - 1440 || t > cols[cols.length - 1].e + 1440) return;
      const mx = Math.max(gx + 9, Math.min(gx + GW - 9, gx + Math.max(0, Math.min(cols.length, apX(cols, t))) * CW));
      s.push(`<rect x="${mx - 7}" y="${cy - 7}" width="14" height="14" transform="rotate(45 ${mx} ${cy})" fill="${color}" stroke="#ffffff" stroke-width="2"/>`);
      const txt = r.noTime ? `${apDayLabel(r.at.slice(0, 10), lang)} (${T.timeTbc})` : r.at.slice(11, 16);
      const right = mx + 12 + txt.length * 7 < W - M;
      s.push(`<text x="${right ? mx + 12 : mx - 12}" y="${cy + 4.5}" font-size="12" font-weight="700" text-anchor="${right ? 'start' : 'end'}" fill="#1a1a1a">${apEsc(txt)}</text>`);
    } else {
      for (const b of r.bars || []) {
        const box = apBarBox(plan, cols, b);
        if (!box) continue;
        const c = apColorOf(r, b), bx = gx + box.x * CW + 2, bw = Math.max(4, box.w * CW - 4);
        s.push(`<rect x="${bx}" y="${ry + 4}" width="${bw}" height="${h - 8}" rx="4" fill="${c}" stroke="#000" stroke-opacity="0.18"/>`);
        const label = [b.text, apBarHours(plan, cols, b, box.r)].filter(Boolean).join(' · ');
        if (label) s.push(`<text x="${bx + bw / 2}" y="${cy + 4}" font-size="11" font-weight="700" text-anchor="middle" fill="${apTextOn(c)}">${apEsc(apTrunc(label, bw - 6, 11))}</text>`);
      }
    }
  });
  // note + légende
  let ny = y + 20;
  noteLines.forEach(l => { s.push(`<text x="${M}" y="${ny}" font-size="12" font-style="italic" fill="#444">${apEsc(l)}</text>`); ny += 16; });
  ny += 6;
  s.push(`<rect x="${M + 4}" y="${ny - 9}" width="10" height="10" transform="rotate(45 ${M + 9} ${ny - 4})" fill="${AP_MS_COLOR}"/>`);
  s.push(`<text x="${M + 22}" y="${ny}" font-size="11" fill="#666">${apEsc(T.legendMs)}</text>`);
  if (groups.some(g => g.off)) { s.push(`<rect x="${M + 260}" y="${ny - 10}" width="18" height="12" fill="url(#aphatch)" stroke="#bbb"/>`); s.push(`<text x="${M + 284}" y="${ny}" font-size="11" fill="#666">${apEsc(T.off)}</text>`); }
  const upd = `${T.updated} ${new Date().toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR')} · Viewbox`;
  s.push(`<text x="${W - M}" y="${ny}" font-size="11" text-anchor="end" fill="#999">${apEsc(upd)}</text>`);
  s.push('</svg>');
  return { svg: s.join(''), width: W, height: H };
}

// ═══ EXPORTS ═══

let AP_LOGO = null;
async function apLogo() {
  if (AP_LOGO !== null) return AP_LOGO;
  try {
    const blob = await fetch('/logo_light.png').then(r => r.ok ? r.blob() : null);
    AP_LOGO = blob ? await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(''); fr.readAsDataURL(blob); }) : '';
  } catch { AP_LOGO = ''; }
  return AP_LOGO;
}
function apCurrentPlan() {
  return AP.plan && document.getElementById('ap-editor') ? AP.plan : AP.plans[AP.phase]?.data;
}
async function apCanvas(plan, project, phase, { internal = false, scale = 2 } = {}) {
  const { svg, width, height } = apSvg(plan, project, phase, { internal, logo: await apLogo() });
  return apRasterize(svg, width, height, scale);
}
function apPdfFromCanvas(canvas) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) throw new Error('Générateur PDF pas encore chargé, réessaie dans un instant');
  const ratio = canvas.width / canvas.height;
  const big = canvas.width / 2 > 1900;
  const pdf = new jsPDF({ orientation: ratio >= 1 ? 'landscape' : 'portrait', unit: 'mm', format: big ? 'a3' : 'a4' });
  const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), m = 8;
  let w = pw - 2 * m, h = w / ratio;
  if (h > ph - 2 * m) { h = ph - 2 * m; w = h * ratio; }
  pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pw - w) / 2, m, w, h, undefined, 'FAST');
  return pdf;
}
function apFileName(ext) {
  const pr = AP.project;
  const what = AP.phase === 'dismantling' ? 'Planning_demontage' : 'Planning_montage';
  return `${what}_${pr.internalNumber || ''}_${pr.name || ''}`.replace(/[^\w\-]+/g, '_').replace(/_+/g, '_').slice(0, 120) + '.' + ext;
}
function apHasInternal(plan) { return plan.rows.some(r => r.internal); }
function apExportMenu(anchor) {
  const plan = apCurrentPlan();
  if (!plan) return;
  const internal = apHasInternal(plan);
  apPop(anchor, `
    <div style="font-weight:700;">⬇ Exporter le planning</div>
    ${internal ? `<label class="ap-chk" style="text-transform:none;"><input type="checkbox" id="ap-x-int"> Inclure les lignes 🔒 internes</label>` : ''}
    <button class="mi" data-a="pdf">📄 Télécharger en PDF</button>
    <button class="mi" data-a="png">🖼 Télécharger en image (PNG)</button>
    ${AP.canEdit ? `<button class="mi" data-a="save">💾 Enregistrer le PDF dans les Fichiers du projet</button>` : ''}
    <div style="font-size:11px;color:var(--text3);margin-top:6px;line-height:1.4;">Pour le briefing : Briefing Studio › « 📂 Depuis projet » › « 📅 Planning estimatif de montage ».</div>`, p => {
    p.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const inc = !!p.querySelector('#ap-x-int')?.checked;
      apPopClose();
      try {
        toast('⏳ Préparation…', 'info');
        const canvas = await apCanvas(plan, AP.project, AP.phase, { internal: inc });
        if (b.dataset.a === 'png') {
          const a = document.createElement('a');
          a.href = canvas.toDataURL('image/png'); a.download = apFileName('png'); a.click();
        } else if (b.dataset.a === 'pdf') {
          apPdfFromCanvas(canvas).save(apFileName('pdf'));
        } else {
          const pdf = apPdfFromCanvas(canvas);
          const r = await api('POST', `/assembly-plans/project/${AP.projectId}/${AP.phase}/file`, { file: pdf.output('datauristring'), fileName: apFileName('pdf') });
          if (!r?.success) throw new Error(r?.error || 'Enregistrement impossible');
          toast('💾 PDF enregistré dans les Fichiers du projet', 'success');
        }
      } catch (e) { toast(e.message || String(e), 'error'); }
    });
  });
}

function apOpenSend() {
  const plan = apCurrentPlan();
  if (!plan) return;
  const pr = AP.project;
  const T = AP_TXT[plan.lang];
  const people = [];
  const add = (email, name, what) => { if (email && !people.some(p => p.email.toLowerCase() === email.toLowerCase())) people.push({ email, name, what }); };
  add(pr.client?.email, pr.client?.contactName || pr.client?.name, 'Client');
  (pr.client?.contacts || []).forEach(c => add(c.email, c.name, c.role ? `Client · ${c.role}` : 'Client'));
  (pr.team || []).forEach(m => add(m.user?.email, `${m.user?.firstName || ''} ${m.user?.lastName || ''}`.trim(), m.role || 'Équipe'));
  const en = plan.lang === 'en';
  const msg = en
    ? `Hello,\n\nPlease find attached the estimated ${AP.phase === 'dismantling' ? 'dismantling' : 'installation'} schedule for ${pr.name}.\nDo not hesitate to come back to us with any question.\n\nKind regards,`
    : `Bonjour,\n\nVous trouverez ci-joint le planning estimatif ${AP.phase === 'dismantling' ? 'de démontage' : 'de montage'} de ${pr.name}.\nN'hésitez pas à revenir vers nous pour toute question.\n\nBien à vous,`;
  const el = document.createElement('div');
  el.className = 'ap-modal';
  el.innerHTML = `
    <div class="box">
      <div style="display:flex;justify-content:space-between;align-items:center;"><div style="font-weight:800;font-size:16px;">✉️ Envoyer le planning</div><button class="ap-mbtn" data-a="x" style="font-size:20px;">×</button></div>
      <div style="font-size:12px;color:var(--text2);margin-top:4px;">Le planning part en PDF, en ${en ? 'anglais' : 'français'} (langue choisie dans l'éditeur).</div>
      <label>Destinataires</label>
      ${people.length ? people.map((p, i) => `<label class="ap-chk" style="text-transform:none;margin:0;"><input type="checkbox" data-i="${i}" ${p.what.startsWith('Client') ? 'checked' : ''}> <b>${apEsc(p.name || p.email)}</b> <span style="color:var(--text3);">${apEsc(p.email)} · ${apEsc(p.what)}</span></label>`).join('') : '<div style="font-size:12px;color:var(--text3);">Aucune adresse dans le projet.</div>'}
      <input type="text" id="ap-s-more" placeholder="Autres adresses, séparées par des virgules" style="margin-top:6px;">
      <label>Objet</label><input type="text" id="ap-s-sub" value="${apEsc(`${plan.title || T.title[AP.phase]} — ${pr.name}`)}">
      <label>Message</label><textarea id="ap-s-msg" rows="7">${apEsc(msg)}</textarea>
      ${apHasInternal(plan) ? `<label class="ap-chk" style="text-transform:none;"><input type="checkbox" id="ap-s-int"> Inclure les lignes 🔒 internes</label>` : ''}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
        <button class="btn btn-ghost btn-sm" data-a="x">Annuler</button>
        <button class="btn btn-primary btn-sm" data-a="send">✉️ Envoyer</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelectorAll('[data-a=x]').forEach(b => b.onclick = () => el.remove());
  el.querySelector('[data-a=send]').onclick = async (ev) => {
    const to = [...el.querySelectorAll('input[data-i]:checked')].map(i => people[+i.dataset.i].email)
      .concat(el.querySelector('#ap-s-more').value.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean));
    if (!to.length) { toast('Choisis au moins un destinataire', 'warning'); return; }
    const btn = ev.target;
    btn.disabled = true; btn.textContent = '⏳ Envoi…';
    try {
      const canvas = await apCanvas(plan, pr, AP.phase, { internal: !!el.querySelector('#ap-s-int')?.checked });
      const pdf = apPdfFromCanvas(canvas);
      const r = await api('POST', `/assembly-plans/project/${AP.projectId}/${AP.phase}/send`, {
        to, subject: el.querySelector('#ap-s-sub').value, message: el.querySelector('#ap-s-msg').value,
        lang: plan.lang, pdf: pdf.output('datauristring'), fileName: apFileName('pdf'),
      });
      if (!r?.success) throw new Error(r?.error || 'Envoi impossible');
      toast(`✉️ Planning envoyé à ${r.data.sent} destinataire(s)`, 'success');
      el.remove();
    } catch (e) {
      toast(e.message || String(e), 'error');
      btn.disabled = false; btn.textContent = '✉️ Envoyer';
    }
  };
}

// ═══ BRIEFING STUDIO ═══
// Le planning n'est plus l'image A4 portrait réduite dans la slide (illisible) : il est redessiné pour la slide 16:9
// (`apSlidePages`). Il remplit la zone sous le bandeau titre, les textes ont la taille des autres tableaux du briefing,
// et il est coupé sur plusieurs slides quand il a trop de lignes (coupure de préférence avant une section, section
// rappelée « (suite) », en-tête des jours répété) ou trop de jours pour que les colonnes restent lisibles.

/** zone de contenu d'une slide 1280 × 720 (sous le bandeau titre) ; image rendue × 2 = netteté de l'export PDF */
const AP_SLIDE = { x: 40, y: 158, w: 1200, h: 546, scale: 2 };
const AP_SLIDE_NAVY = '#000a3d';
const AP_FONT = 'Arial, Helvetica, sans-serif';

let AP_MEASURE = null;
function apTextW(text, size, bold, italic) {
  if (!AP_MEASURE) AP_MEASURE = document.createElement('canvas').getContext('2d');
  AP_MEASURE.font = `${italic ? 'italic ' : ''}${bold ? '700 ' : ''}${size}px ${AP_FONT}`;
  return AP_MEASURE.measureText(String(text ?? '')).width;
}
/** texte qui tient dans maxW : taille réduite jusqu'à minScale, puis coupé avec « … » (jamais au milieu d'un emoji) */
function apFitText(text, maxW, size, { bold = false, italic = false, minScale = 0.86 } = {}) {
  text = String(text ?? '').trim();
  if (!text || maxW <= 4) return { text: '', size };
  const w = apTextW(text, size, bold, italic);
  if (w <= maxW) return { text, size };
  const s2 = Math.max(size * minScale, size * maxW / w);
  if (apTextW(text, s2, bold, italic) <= maxW) return { text, size: s2 };
  const ch = Array.from(text);
  let lo = 0, hi = ch.length;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (apTextW(ch.slice(0, m).join('').trimEnd() + '…', s2, bold, italic) <= maxW) lo = m; else hi = m - 1;
  }
  return { text: lo ? ch.slice(0, lo).join('').trimEnd() + '…' : '', size: s2 };
}
/** libellé sur deux lignes (coupé aux espaces) */
function apWrap2(text, maxW, size, bold) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  let l1 = '', i = 0;
  for (; i < words.length; i++) {
    const t = l1 ? `${l1} ${words[i]}` : words[i];
    if (l1 && apTextW(t, size, bold) > maxW) break;
    l1 = t;
  }
  const rest = words.slice(i).join(' ');
  return [apFitText(l1, maxW, size, { bold, minScale: 1 }).text, rest ? apFitText(rest, maxW, size, { bold, minScale: 1 }).text : ''].filter(Boolean);
}
/** libellés d'un jour, du plus complet au plus court : « Jeudi 12/11 », « Jeu. 12/11 », « 12/11 » */
function apSlideDayForms(day, lang) {
  const d = new Date(apT(day) * 60000);
  const loc = lang === 'en' ? 'en-GB' : 'fr-FR';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const dm = d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
  return [`${cap(d.toLocaleDateString(loc, { weekday: 'long', timeZone: 'UTC' }))} ${dm}`, `${cap(d.toLocaleDateString(loc, { weekday: 'short', timeZone: 'UTC' }))} ${dm}`, dm];
}
/** le plus complet qui tient dans w */
function apSlideDayLabel(day, lang, w, size) {
  const forms = apSlideDayForms(day, lang);
  return forms.find(c => apTextW(c, size, true) <= w) || apFitText(forms[2], w, size, { bold: true }).text;
}
/** coupe les lignes en pages d'au plus `cap` unités, réparties équitablement ; une section ne reste jamais seule
 *  en bas de page, on coupe plutôt avant une section qui ne tient plus (si ça ne rajoute pas de page), et une page
 *  qui commence au milieu d'une section la rappelle (`cont`) */
function apSplitRows(list, cap, unit) {
  const run = (c, soft) => {
    const pages = [];
    let cur = [], u = 0, sec = null;
    const secUnits = i => { let s = unit(list[i]); for (let j = i + 1; j < list.length && list[j].kind !== 'section'; j++) s += unit(list[j]); return s; };
    for (let i = 0; i < list.length; i++) {
      const r = list[i], ur = unit(r), isSec = r.kind === 'section';
      const need = isSec && list[i + 1] && list[i + 1].kind !== 'section' ? ur + unit(list[i + 1]) : ur;
      const real = cur.some(x => !x.cont);
      if (real && (u + need > c + 1e-6 || (soft && isSec && u >= 0.6 * c && u + secUnits(i) > c + 1e-6))) {
        pages.push(cur); cur = []; u = 0;
        if (!isSec && sec) { cur.push({ ...sec, cont: true }); u += unit(sec); }
      }
      cur.push(r); u += ur;
      if (isSec) sec = r;
    }
    if (cur.length) pages.push(cur);
    return pages;
  };
  if (!list.length) return [[]];
  const total = list.reduce((s, r) => s + unit(r), 0);
  const n = run(cap, false).length;
  for (const soft of [true, false]) {
    for (let c = Math.max(1, total / n); c <= cap + 1e-6; c += 0.25) {
      const p = run(c, soft);
      if (p.length <= n) return p;
    }
  }
  return run(cap, false);
}

/** pages du planning pour le Briefing Studio : [{ svg, width, height }] ; [] si le planning n'a aucune colonne */
function apSlidePages(plan, project, phase, { internal = false } = {}) {
  const lang = plan.lang, T = AP_TXT[lang] || AP_TXT.fr;
  const allCols = apColumns(plan);
  if (!allCols.length) return [];
  const W = AP_SLIDE.w, HMAX = AP_SLIDE.h, P = 12, FT = 25;
  const H1 = 36, H2 = plan.scale === 'day' ? 0 : 26;
  const BH = HMAX - 2 * P - FT - H1 - H2;
  const gw = W - 2 * P;
  const rows = plan.rows.filter(r => internal || !r.internal);
  const hasWho = rows.some(r => r.who && r.kind !== 'section');
  // colonnes « Tâche » / « Qui » à la largeur des textes (mesurés à 15 px), 26 à 46 % de la largeur
  const labW = Math.max(0, ...rows.filter(r => r.kind !== 'section').map(r => apTextW(r.label, 15, r.kind === 'milestone')));
  let LAB = Math.round(Math.min(gw * 0.46, Math.max(gw * 0.26, labW + 28)));
  const whoW = Math.max(0, ...rows.filter(r => r.kind !== 'section' && r.who).map(r => apTextW(r.who, 13.5)));
  let WHO = hasWho ? Math.round(Math.min(180, Math.max(90, whoW + 22))) : 0;
  let GW = gw - LAB - WHO;
  // jours par slide : une case doit rester lisible (sinon les jours sont répartis sur plusieurs slides)
  const days = apDayGroups(allCols);
  const perDay = allCols.length / days.length;
  const minCol = { day: 105, slot: 62, hour: 15 }[plan.scale] || 105;
  const minDay = Math.max(105, perDay * minCol);
  const maxDays = Math.max(1, Math.floor(GW / minDay));
  const nChunks = Math.ceil(days.length / maxDays);
  const chunks = [];
  for (let k = 0, a = 0; k < nChunks; k++) { const n = Math.round((days.length - a) / (nChunks - k)); chunks.push(days.slice(a, a + n)); a += n; }

  const SU = 0.82, RH_MIN = 23, RH_MAX = 40;
  const unit = r => r.kind === 'section' ? SU : 1;
  const parts = chunks.map((ds, k) => {
    const set = new Set(ds.map(g => g.day));
    const cols = allCols.filter(c => set.has(c.day));
    const first = k === 0, last = k === nChunks - 1;
    const crew = rows.some(r => r.kind === 'crew') ? apCrewCounts(plan, project, phase, cols) : [];
    const keep = r => {
      if (nChunks === 1 || r.kind === 'section') return true;
      if (r.kind === 'crew') return crew.some(n => n > 0);
      if (r.kind === 'milestone') {
        if (!r.at) return first;
        const d = r.at.slice(0, 10);
        return set.has(d) || (first && d < ds[0].day) || (last && d > ds[ds.length - 1].day);
      }
      if (!(r.bars || []).length) return first;
      return r.bars.some(b => apRange(cols, apT(b.s), apT(b.e)));
    };
    let list = rows.filter(keep);
    if (nChunks > 1) list = list.filter((r, i) => r.kind !== 'section' || (list[i + 1] && list[i + 1].kind !== 'section'));
    return { cols, crew, pages: apSplitRows(list, BH / RH_MIN, unit) };
  });
  // même hauteur de ligne sur toutes les slides de la phase
  const pageUnits = parts.flatMap(p => p.pages.map(pg => pg.reduce((s, r) => s + unit(r), 0)));
  const RH = Math.min(RH_MAX, BH / Math.max(1, ...pageUnits));
  const SH = RH * SU;
  const f = Math.max(13.5, Math.min(18, RH * 0.55));  // libellés
  const fb = Math.max(12, Math.min(15.5, f - 1.5));   // textes des barres, heures
  // colonnes « Tâche » / « Qui » recalées sur la taille réelle des textes, si les jours tiennent toujours
  const lab2 = Math.round(Math.min(gw * 0.46, Math.max(LAB, labW * f / 15 + 28)));
  const who2 = hasWho ? Math.round(Math.min(200, Math.max(WHO, whoW * f * 0.88 / 13.5 + 22))) : 0;
  if (gw - lab2 - who2 >= Math.max(...chunks.map(c => c.length)) * minDay) { LAB = lab2; WHO = who2; GW = gw - LAB - WHO; }
  const note = String(plan.note || '').split('\n').map(s => s.trim()).filter(Boolean).join(' ');
  const cont = lang === 'en' ? '(cont.)' : '(suite)';

  const draw = (cols, crew, pageRows) => {
    const NC = cols.length, CW = GW / NC;
    const groups = apDayGroups(cols);
    const gx = P + LAB + WHO, gy = P, hh = H1 + H2, bodyY = gy + hh;
    const xc = c => gx + c * CW;
    let y = bodyY;
    const ys = pageRows.map(r => { const ry = y; y += r.kind === 'section' ? SH : RH; return ry; });
    const bodyEnd = y;
    const H = Math.round(bodyEnd + FT + P - 6);
    const s = [];
    const txt = (x, yy, t, size, o = '') => s.push(`<text x="${x.toFixed(1)}" y="${yy.toFixed(1)}" font-size="${size.toFixed(2)}" ${o}>${apEsc(t)}</text>`);
    s.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${AP_FONT}">`);
    s.push(`<defs><pattern id="aphs" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="9" height="9" fill="#e4e6ec"/><line x1="0" y1="0" x2="0" y2="9" stroke="#cfd3dc" stroke-width="4"/></pattern>`
      + `<clipPath id="apcl"><rect x="${P}" y="${gy}" width="${gw}" height="${bodyEnd - gy}" rx="8"/></clipPath></defs>`);
    s.push(`<rect width="${W}" height="${H}" rx="14" fill="#ffffff"/>`);
    s.push(`<g clip-path="url(#apcl)">`);
    // fonds : en-tête, lignes alternées, sections, jours grisés
    s.push(`<rect x="${P}" y="${gy}" width="${gw}" height="${hh}" fill="${AP_SLIDE_NAVY}"/>`);
    if (H2) s.push(`<rect x="${gx}" y="${gy + H1}" width="${GW}" height="${H2}" fill="#1d2a63"/>`);
    let zebra = 0;
    pageRows.forEach((r, i) => {
      if (r.kind === 'section') {
        zebra = 0;
        s.push(`<rect x="${P}" y="${ys[i]}" width="${gw}" height="${SH}" fill="${apColorOf(r)}" fill-opacity="0.32"/>`);
        s.push(`<rect x="${P}" y="${ys[i]}" width="6" height="${SH}" fill="${apColorOf(r)}"/>`);
      } else if (zebra++ % 2) s.push(`<rect x="${P}" y="${ys[i]}" width="${gw}" height="${RH}" fill="#f4f5f9"/>`);
    });
    for (const g of groups.filter(g => g.off)) s.push(`<rect x="${xc(g.a)}" y="${bodyY}" width="${(g.b - g.a + 1) * CW}" height="${bodyEnd - bodyY}" fill="url(#aphs)" fill-opacity="0.8"/>`);
    // grille
    pageRows.forEach((r, i) => { if (i) s.push(`<line x1="${P}" y1="${ys[i]}" x2="${W - P}" y2="${ys[i]}" stroke="#e1e4eb"/>`); });
    cols.forEach((c, i) => {
      if (!i) return;
      const sameDay = cols[i - 1].day === c.day;
      s.push(`<line x1="${xc(i)}" y1="${sameDay ? bodyY : gy + 6}" x2="${xc(i)}" y2="${bodyEnd}" stroke="${sameDay ? '#e9ebf1' : '#aeb5c4'}"/>`);
      if (!sameDay) s.push(`<line x1="${xc(i)}" y1="${gy + 6}" x2="${xc(i)}" y2="${bodyY}" stroke="#ffffff" stroke-opacity="0.35"/>`);
      else if (H2) s.push(`<line x1="${xc(i)}" y1="${gy + H1 + 4}" x2="${xc(i)}" y2="${bodyY - 4}" stroke="#ffffff" stroke-opacity="0.2"/>`);
    });
    s.push(`<line x1="${gx}" y1="${bodyY}" x2="${gx}" y2="${bodyEnd}" stroke="#8c94a6" stroke-width="1.5"/>`);
    if (WHO) s.push(`<line x1="${P + LAB}" y1="${bodyY}" x2="${P + LAB}" y2="${bodyEnd}" stroke="#d3d7e0"/>`);
    // en-têtes
    txt(P + 14, gy + hh / 2 + 5.5, T.task, 15, 'font-weight="700" fill="#ffffff"');
    if (WHO) txt(P + LAB + 10, gy + hh / 2 + 5.5, T.who, 15, 'font-weight="700" fill="#ffffff"');
    // même format pour tous les jours de la slide (le plus complet qui tient partout)
    const dayW = g => (g.b - g.a + 1) * CW - 12;
    const form = [0, 1, 2].find(k => groups.every(g => apTextW(apSlideDayForms(g.day, lang)[k], 16, true) <= dayW(g))) ?? 2;
    for (const g of groups) {
      const w = (g.b - g.a + 1) * CW;
      let lbl = apFitText(apSlideDayForms(g.day, lang)[form], w - 12, 16, { bold: true }).text;
      const offTxt = g.off && plan.offDays?.[g.day];
      if (offTxt && apTextW(`${lbl} · ${offTxt}`, 16, true) <= w - 12) lbl = `${lbl} · ${offTxt}`;
      txt(xc(g.a) + w / 2, gy + H1 / 2 + 6, lbl, 16, `font-weight="700" text-anchor="middle" fill="${g.off ? '#aab3cc' : '#ffffff'}"`);
    }
    if (H2) cols.forEach((c, i) => {
      const fs = Math.min(13, Math.max(10, CW * 0.62));
      const cands = plan.scale === 'hour' ? [`${c.label}h`, c.label] : [c.label, c.sub];
      const t = cands.find(x => x && apTextW(x, fs) <= CW - 6) || apFitText(cands[0], CW - 6, fs).text;
      txt(xc(i) + CW / 2, gy + H1 + H2 / 2 + 4.5, t, fs, 'text-anchor="middle" fill="#cdd5ee"');
    });
    // lignes
    pageRows.forEach((r, i) => {
      const ry = ys[i], h = r.kind === 'section' ? SH : RH, cy = ry + h / 2;
      if (r.kind === 'section') {
        const fs = Math.max(13, f * 0.9);
        const lb = r.cont ? `${r.label} ${cont}` : r.label;
        const ft = apFitText(lb, gw - 40, fs, { bold: true });
        txt(P + 18, cy + ft.size * 0.36, ft.text, ft.size, 'font-weight="700" letter-spacing="0.6" fill="#1a1f33"');
        return;
      }
      const bold = r.kind === 'milestone';
      const lw = LAB - 24, la = `fill="#1a1a1a" ${bold ? 'font-weight="700"' : ''}`;
      const ft = apFitText(r.label, lw, f, { bold });
      // trop long : sur deux lignes si la ligne est assez haute (et que ça reste plus grand qu'en le réduisant)
      const fs2 = Math.min(f, (RH - 6) / 2.3);
      const oneLine = f * lw / apTextW(r.label, f, bold);
      if (ft.text.endsWith('…') && RH >= 36 && oneLine < fs2) {
        const lines = apWrap2(r.label, lw, fs2, bold);
        lines.forEach((l, k) => txt(P + 14, cy + (k - (lines.length - 1) / 2) * fs2 * 1.12 + fs2 * 0.36, l, fs2, la));
      } else if (ft.text.endsWith('…') && oneLine >= Math.max(12.5, fs2)) txt(P + 14, cy + oneLine * 0.36, r.label, oneLine, la);
      else txt(P + 14, cy + ft.size * 0.36, ft.text, ft.size, la);
      if (WHO && r.who) { const fw = apFitText(r.who, WHO - 18, f * 0.88); txt(P + LAB + 10, cy + fw.size * 0.36, fw.text, fw.size, 'fill="#555b6e"'); }
      const color = apColorOf(r);
      if (r.kind === 'crew') {
        // une pastille par suite de cases du même jour avec le même effectif
        const max = Math.max(1, ...crew), runs = [];
        crew.forEach((n, ci) => {
          const last = runs[runs.length - 1];
          if (last && last.n === n && last.b === ci - 1 && cols[last.b].day === cols[ci].day) last.b = ci;
          else runs.push({ n, a: ci, b: ci });
        });
        for (const rn of runs.filter(x => x.n)) {
          const w = (rn.b - rn.a + 1) * CW;
          s.push(`<rect x="${xc(rn.a) + 4}" y="${ry + 4}" width="${Math.max(4, w - 8)}" height="${h - 8}" rx="5" fill="#8faadc" fill-opacity="${(0.35 + 0.55 * rn.n / max).toFixed(2)}"/>`);
          txt(xc(rn.a) + w / 2, cy + fb * 0.36, String(rn.n), fb, 'font-weight="700" text-anchor="middle" fill="#10305a"');
        }
      } else if (r.kind === 'milestone' && r.at) {
        const t = apT(r.at);
        const d = Math.max(10, Math.min(16, RH * 0.48));
        const mx = Math.max(gx + d * 0.8, Math.min(gx + GW - d * 0.8, gx + Math.max(0, Math.min(NC, apX(cols, t))) * CW));
        s.push(`<rect x="${mx - d / 2}" y="${cy - d / 2}" width="${d}" height="${d}" transform="rotate(45 ${mx} ${cy})" fill="${color}" stroke="#ffffff" stroke-width="2"/>`);
        const label = r.noTime ? `${apSlideDayLabel(r.at.slice(0, 10), lang, 999, fb)} (${T.timeTbc})` : r.at.slice(11, 16);
        const tw = apTextW(label, fb, true);
        const right = mx + d + tw + 4 < gx + GW;
        const fx = apFitText(label, right ? gx + GW - mx - d - 6 : mx - gx - d - 6, fb, { bold: true });
        txt(right ? mx + d * 0.85 + 4 : mx - d * 0.85 - 4, cy + fx.size * 0.36, fx.text, fx.size, `font-weight="700" text-anchor="${right ? 'start' : 'end'}" fill="#1a1a1a"`);
      } else {
        for (const b of r.bars || []) {
          const box = apBarBox(plan, cols, b);
          if (!box) continue;
          const c = apColorOf(r, b), bx = gx + box.x * CW + 3, bw = Math.max(6, box.w * CW - 6);
          s.push(`<rect x="${bx.toFixed(1)}" y="${ry + 4}" width="${bw.toFixed(1)}" height="${h - 8}" rx="5" fill="${c}" stroke="#000" stroke-opacity="0.15"/>`);
          const label = [b.text, apBarHours(plan, cols, b, box.r)].filter(Boolean).join(' · ');
          if (!label || bw < 26) continue;
          const fx = apFitText(label, bw - 10, fb, { bold: true, minScale: 0.8 });
          if (fx.text) txt(bx + bw / 2, cy + fx.size * 0.36, fx.text, fx.size, `font-weight="700" text-anchor="middle" fill="${apTextOn(c)}"`);
        }
      }
    });
    s.push('</g>');
    s.push(`<rect x="${P}" y="${gy}" width="${gw}" height="${bodyEnd - gy}" rx="8" fill="none" stroke="#c3c9d5"/>`);
    // pied : note à gauche, légende à droite
    const fy = bodyEnd + 19, fs = 12.5;
    const leg = [];
    let lx = W - P;
    if (groups.some(g => g.off)) {
      lx -= apTextW(T.off, fs); leg.push(`<text x="${lx}" y="${fy}" font-size="${fs}" fill="#555b6e">${apEsc(T.off)}</text>`);
      lx -= 26; leg.push(`<rect x="${lx}" y="${fy - 11}" width="20" height="13" fill="url(#aphs)" stroke="#b9bfcc"/>`);
      lx -= 22;
    }
    lx -= apTextW(T.legendMs, fs); leg.push(`<text x="${lx}" y="${fy}" font-size="${fs}" fill="#555b6e">${apEsc(T.legendMs)}</text>`);
    lx -= 16; leg.push(`<rect x="${lx - 5}" y="${fy - 10}" width="10" height="10" transform="rotate(45 ${lx} ${fy - 5})" fill="${AP_MS_COLOR}"/>`);
    s.push(...leg);
    if (note) { const fn = apFitText(note, lx - P - 30, fs, { italic: true, minScale: 0.88 }); txt(P + 2, fy, fn.text, fn.size, 'font-style="italic" fill="#555b6e"'); }
    s.push('</svg>');
    return { svg: s.join(''), width: W, height: H };
  };
  return parts.flatMap(p => p.pages.map(pg => draw(p.cols, p.crew, pg)));
}

/** SVG → canvas (fond transparent si bg est vide) */
async function apRasterize(svg, width, height, scale, bg = '#ffffff') {
  const k = Math.min(scale, 12000 / width, 12000 / height);
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Rendu du planning impossible')); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  const c = document.createElement('canvas');
  c.width = Math.round(width * k); c.height = Math.round(height * k);
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** images des slides du planning d'une phase (version client) : [{ url, w, h, title, name, slide }] ; [] si pas de planning */
async function apBriefingSlides(projectId, phase) {
  const res = await api('GET', `/assembly-plans/project/${projectId}`);
  if (!res?.success) return [];
  const rec = (res.data.plans || []).find(p => p.phase === phase);
  if (!rec) return [];
  const plan = apClean(rec.data);
  const project = res.data.project;
  apSync(plan, project, phase);
  const title = plan.title || AP_TXT[plan.lang].title[phase];
  const pages = apSlidePages(plan, project, phase, { internal: false });
  if (!pages.length) {
    // dates du planning illisibles : ancienne image entière plutôt que rien
    const canvas = await apCanvas(plan, project, phase, { internal: false, scale: 2 });
    return [{ url: canvas.toDataURL('image/jpeg', 0.92), w: canvas.width, h: canvas.height, title, name: '📅 Planning', slide: false }];
  }
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const c = await apRasterize(pages[i].svg, pages[i].width, pages[i].height, AP_SLIDE.scale, '');
    const n = pages.length > 1 ? ` (${i + 1}/${pages.length})` : '';
    out.push({ url: c.toDataURL('image/png'), w: c.width, h: c.height, title: title + n, name: '📅 Planning' + (n ? ` ${i + 1}/${pages.length}` : ''), slide: true });
  }
  return out;
}
/** pose l'image dans la zone de contenu d'une slide standard (sous le bandeau titre) */
function apFabricImage(canvas, img) {
  return new Promise(resolve => {
    fabric.Image.fromURL(img.url, fi => {
      if (!fi) { resolve(false); return; }
      const box = img.slide
        ? { x: AP_SLIDE.x, y: AP_SLIDE.y, w: AP_SLIDE.w, h: AP_SLIDE.h }
        : { x: 40, y: 165, w: BRF_CANVAS_W - 80, h: BRF_CANVAS_H - 185 };
      const k = Math.min(box.w / fi.width, box.h / fi.height);
      fi.set({ left: box.x + (box.w - fi.width * k) / 2, top: box.y, scaleX: k, scaleY: k });
      canvas.add(fi);
      // filigrane « WB » presque caché par le tableau : on l'enlève plutôt que d'en laisser dépasser un bout
      if (img.slide) {
        const bottom = box.y + fi.height * k;
        canvas.getObjects().filter(o => o.type === 'i-text' && o.text === 'WB' && !o.selectable && o.top + 30 < bottom).forEach(o => canvas.remove(o));
      }
      resolve(true);
    });
  });
}
/** Briefing Studio › 📂 Depuis projet › 📅 Planning estimatif : les slides de chaque phase qui a un planning */
async function brfAddAssemblyPlanSlides() {
  document.querySelectorAll('.brf-proj-menu').forEach(m => m.remove());
  const projectId = BRF_STUDIO.projectId;
  try {
    toast('⏳ Planning…', 'info');
    const imgs = [];
    for (const ph of ['installation', 'dismantling']) imgs.push(...await apBriefingSlides(projectId, ph));
    if (!imgs.length) { toast('Pas encore de planning estimatif : crée-le dans l’onglet Infos du projet', 'warning'); return; }
    for (const im of imgs) {
      saveCurrentSlideJson();
      const at = BRF_STUDIO.curIdx + 1;
      BRF_STUDIO.slides.splice(at, 0, { id: 'slide-plan-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6), name: im.name, json: null });
      BRF_STUDIO.curIdx = at;
      BRF_STUDIO.suppressSnapshot = true;
      BRF_STUDIO.fabricCanvas.clear();
      brfApplyStandardTemplate(im.title);
      await apFabricImage(BRF_STUDIO.fabricCanvas, im);
      saveCurrentSlideJson();
      BRF_STUDIO.suppressSnapshot = false;
    }
    loadSlideIntoCanvas(BRF_STUDIO.curIdx);
    renderStudioSidebar();
    toast(`📅 ${imgs.length} slide(s) planning ajoutée(s)`, 'success');
  } catch (e) {
    console.error('[brf planning]', e);
    toast('Erreur : ' + (e.message || e), 'error');
  }
}
