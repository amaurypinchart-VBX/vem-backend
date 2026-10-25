import { q, L, btn, tabs, field, win, steps, callout, capture, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

const STATUTS = ['📝 Devis à valider', '✅ Devis validé', '🔧 En préparation', '🏗️ En installation', '📍 Sur site', '🧾 Handover OK', '🔨 Démontage', '🎉 Terminé', '❌ Annulé'];

export default {
  key: 'fiche-projet', num: 5, icon: '📋', title: 'The project record',
  public: 'Everyone', duree: '30 min', parcours: 'Office',
  slides: [
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: read and keep up to date a project\'s record, the heart of VEM.',
          '<b>Who</b>: everyone.',
        ]) + path(['🏗️ Projets', '~click the project card'])
        + `<div class="m-search">${L('Rechercher un projet...')} · ${L('Tous les statuts')} · ${L('Trier par...')} · ${L('📦 Voir archivés')}</div>`,
        callout('tip', 'Search looks at the <b>name</b> and the <b>internal number</b> (not the client). Fastest: type the internal number.')
        + callout('info', `${q('🎉 Terminé')} (completed) and archived projects are hidden: tick ${q('📦 Voir archivés')} (show archived) to see them again.`)),
      visual: 'Goal + path + recreated search bar.',
      notes: 'The sort "📐 Installation (plus proche)" (nearest installation) is handy to prepare the week.',
    },
    {
      title: 'The record header',
      body: () => `<div class="m-header"><div class="mh-l">${btn('← Retour', 'outline')}<div><div class="mh-t">${FIL.projet}</div><div class="mh-s">${FIL.ref} · ${FIL.client} <span class="m-select">${L('📝 Devis à valider')} ▾</span></div></div></div>
        <div class="mh-r">${btn('✏️ Modifier')}${btn('📊 Rapport IA')}${btn('🧾 Handover')}${btn('🛠️ Ticket', 'ghost dim')}${btn('📋 Plusieurs tâches', 'ghost dim')}${btn('➕ 1 tâche', 'primary dim')}${btn('📦')}</div></div>`
        + table(['Button', 'Use it?'], [
          [L('✏️ Modifier'), '✅ Correct the project information (next slide).'],
          [L('📊 Rapport IA'), '✅ Generate a report (chapter 14).'],
          [L('🧾 Handover'), '⚠️ Opens the page with <b>all</b> handovers: use the project\'s 🧾 Handover <b>tab</b> instead.'],
          [`${L('🛠️ Ticket')} · ${L('📋 Plusieurs tâches')} · ${L('➕ 1 tâche')}`, '❌ No longer use (tickets and tasks are discontinued).'],
          [L('📦'), '✅ Archive a completed or cancelled project (never delete).'],
        ], { small: true }),
      visual: 'Header mock-up (buttons no longer used greyed out) + table.',
      notes: 'The greyed-out buttons on the mock-up are still visible in the app: say so clearly.',
    },
    {
      title: 'The tabs',
      body: () => tabs(['📋 Infos', '📓 Daily Reports', '🧾 Handover', '👥 Équipe', '🚛 Logistique', '✈️ Bookings', '📋 Briefing', '📁 Fichiers'])
        + table(['Tab', 'Content', 'Chapter'], [
          [L('📋 Infos'), 'Summary, notes, client contact, progress, preparation checklist, files', '5'],
          [L('📓 Daily Reports'), 'Installation / dismantling checklist + daily reports', '10 · 11'],
          [L('🧾 Handover'), 'Checklist reminder + the project\'s handovers', '12'],
          [L('👥 Équipe'), 'Project members, phase, sending information (Team)', '6'],
          [L('🚛 Logistique'), 'Trucks, cranes, aerial platforms… (Logistics)', '7'],
          [L('✈️ Bookings'), 'Team transport and hotels', '8'],
          [L('📋 Briefing'), 'Briefing Studio', '13'],
          [L('📁 Fichiers'), 'Drawings, photos, PDF, 3D (Files)', '9'],
        ], { small: true }) + callout('warn', `The ${q('📸 Visites Client')} (client visits) tab is still visible: do not use it any more.`),
      visual: 'Recreated tab bar + mapping table.',
      notes: 'Two tabs share the 📋 icon: Infos and Briefing.',
    },
    {
      title: 'The 📋 Infos tab',
      body: () => cols(
        ul([
          `<b>Preparation checklist</b> (at the top): the points to check before installation (chapter 10).`,
          `<b>${L('📋 Informations')}</b>: client, internal number, dates, workers, status, address, description.`,
          '<b>📝 Additional notes</b>: 🌐 Global, 🔨 Installation, 🔧 Dismantling.',
          `<b>${L('📞 Contact client')}</b>: main contact ★, clickable phone and e-mail.`,
          `<b>${L('📊 Progression')}</b>: % of checklist points OK or N.A.`,
          '<b>🚛 Logistics — key dates</b>: loading, departure, arrival of vehicles.',
          '<b>📁 Files</b>: preview + "Envoyer des fichiers par email" box.',
        ]),
        capture('C-02', 'Project record, 📋 Infos tab', 'demo project filled in, scroll to show notes + progress', `${FIL.projet} / ${FIL.ref}`)
        + callout('info', 'Progress only follows the <b>checklist</b> (no longer the tasks). With no checklist configured: "—".')),
      visual: 'List of blocks + real screenshot of the Infos tab.',
      notes: 'The time of a date is only shown when it is not midnight.',
    },
    {
      title: 'The project status',
      body: () => cols(
        `<div class="m-dropdown">${STATUTS.map((s) => `<div>${L(s)}</div>`).join('')}</div>`,
        table(['When', 'Status to choose'], [
          ['Quote sent', L('📝 Devis à valider')], ['Quote accepted', L('✅ Devis validé')],
          ['Warehouse preparation, purchases, bookings', L('🔧 En préparation')], ['Team arrived', L('📍 Sur site')],
          ['Installation in progress', L('🏗️ En installation')], ['Handover signed', L('🧾 Handover OK')],
          ['Dismantling in progress', L('🔨 Démontage')], ['Everything is back', L('🎉 Terminé')],
          ['Project abandoned', L('❌ Annulé')],
        ], { small: true }) + callout('warn', 'The status <b>never</b> changes automatically. The person doing the step updates the status.')),
      visual: 'Recreated drop-down list + when / status table.',
      notes: 'Changing the value saves immediately ("Statut du projet mis à jour ✅"). The Dashboard "Projets actifs" counter only counts En préparation, En installation and Sur site.',
    },
    {
      title: '✏️ Edit a project',
      body: () => cols(
        steps([
          `${q('✏️ Modifier')} opens ${q('✏️ Modifier le projet')} (same form as creation).`,
          'Editable: name, client, internal number, workers, address, dates, description, the 3 notes.',
          `${q('💾 Enregistrer les modifications')} (Save changes).`,
        ]),
        callout('warn', `The Team, Tasks and Logistics blocks are shown too, but <b>are not saved</b> here. A vehicle is edited <b>in the ${q('🚛 Logistique')} tab</b>.`)
        + callout('info', 'Clearing a dismantling date or the description does not erase it. The 3 notes, however, are erased.')),
      visual: 'Steps + boxes.',
      notes: 'The status is not changed here but in the header drop-down.',
    },
    {
      title: 'Archive (and never delete)',
      body: () => cols(
        win('📦 Archiver le projet', `<div class="m-opt">${L('📦 Archiver le projet')}<small>Le projet est conservé mais masqué de la liste active. Récupérable à tout moment.</small></div>
          <div class="m-opt">${L('♻️ Restaurer le projet')}<small>Remettre le projet en statut actif.</small></div>
          <div class="m-opt danger">${L('🗑️ Supprimer définitivement')}<small>Action irréversible — toutes les données seront perdues.</small></div>`, { free: true }),
        ul([
          `Archive = status ${q('❌ Annulé')} (cancelled — same thing).`,
          `Restore = status ${q('✔️ Confirmé')} (confirmed): then choose the right status.`,
          'Delete erases everything: daily reports, handovers, files, team, trucks.',
        ]) + callout('no', '<b>Never delete a project.</b> For a finished project: status 🎉 Terminé. For an abandoned project: 📦 Archive.')),
      visual: 'Recreated Archive window (Delete option in red) + rules.',
      notes: 'Only roles that see all projects can delete a project; for them it is also a rule of conduct.',
    },
    {
      title: 'A project is "complete" when…',
      body: () => table(['Before…', 'Must be filled in'], [
        ['Quote accepted', 'Full client · internal number · address · installation (and dismantling) dates · description'],
        ['Departure (briefing)', 'Team + phases · trucks & machines · transport & hotels · notes · drawings in Files · checklists configured'],
        ['Handover', 'Installation checklist filled in and validated · daily reports for every day · photos'],
        ['Closing', 'Handover signed · status 🎉 Terminé · dismantling checklist · files tidied up'],
      ]) + `<div class="cap-note">Detailed version: "Complete project checklist" sheet at the end of the deck.</div>`,
      visual: 'Table in 4 stages.',
      notes: 'This grid is also in 04_CHECKLIST_PROJET_COMPLET.md.',
    },
    {
      kind: 'exercise', title: 'Exercise — keep the record up to date',
      body: () => cols(steps([
        `Find the demo project by its internal number <code>${FIL.ref}</code>.`,
        `Set it to ${q('✅ Devis validé')} (quote accepted).`,
        `With ${q('✏️ Modifier')}, add a dismantling note: "Evacuation via the North car park".`,
        'Find where the note is shown in the Infos tab.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'One topic per tab.',
        'Status: by hand, at every step.',
        'Vehicles: Logistics tab, not ✏️ Modifier.',
        'Archive, never delete.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Duration: 5 minutes.',
    },
  ],
};
