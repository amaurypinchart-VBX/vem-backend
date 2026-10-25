import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip, check } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'projet-creation', num: 2, icon: '🏗️', title: 'Creating a project by hand',
  public: 'Sales, Customer Service, Project & Technical Managers', duree: '35 min', parcours: 'Office',
  slides: [
    {
      title: '3 ways to bring a project into VEM',
      body: () => `<div class="three">${[
        ['✍️', 'By hand', `${L('+ Nouveau Projet')} (new project) on the Dashboard or the Projects page.`, 'This chapter'],
        ['🆕', 'By « NEW » e-mail', 'You forward the client\'s e-mail with a subject starting with NEW: the AI creates the project as a draft.', 'Chapter 3'],
        ['📧', 'Complete by e-mail', 'The internal number in the subject: attachments and bookings arrive in the existing project.', 'Chapter 4'],
      ].map(([i, t, d, c]) => `<div class="three-card"><div class="ti">${i}</div><div class="tt">${t}</div><div class="td">${d}</div><div class="tc">${c}</div></div>`).join('')}</div>`,
      visual: '3 cards side by side.',
      notes: 'Whatever the path, you always finish with a check in the project sheet.',
    },
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: create a clean project, with an internal number in the right format, correct dates and address.',
          '<b>For whom</b>: Sales, Customer Service, Project and Technical Managers.',
        ]) + path(['📊 Dashboard', '+ Nouveau Projet']) + path(['🏗️ Projets', '+ Nouveau Projet']),
        callout('tip', 'Have at hand: the quote or order confirmation, the exact site address and the dates (with times).')),
      visual: 'Goal + two access paths.',
      notes: 'The window does not close when you click outside it: only with × or « Annuler » (cancel).',
    },
    {
      title: 'The form (1/3) — the essentials',
      body: () => cols(
        win('🏗️ Nouveau Projet',
          `<div class="m-grid2">${field('Nom *', FIL.projet)}${field('Client *', FIL.client)}</div>`
          + `<div class="m-grid2">${field('N° Interne', FIL.ref)}${field('Ouvriers', FIL.ouvriers)}</div>`
          + field('Adresse *', FIL.adresse, { wide: true })
          + `<div class="m-grid2">${field('Début installation *', FIL.instStart)}${field('Fin installation *', FIL.instEnd)}</div>`
          + `<div class="m-grid2">${field('Début démontage', FIL.disStart)}${field('Fin démontage', FIL.disEnd)}</div>`
          + field('Description / Instructions spéciales', '12 Viewbox, 1 staircase, delivery access via the East entrance', { wide: true })),
        steps([
          `${q('Nom *')} (name): a readable name (not a code).`,
          `${q('Client *')}: pick from the list, or ${q('+ Client')}.`,
          `${q('N° Interne')} (internal number): <b>always</b> in Viewbox format (${FIL.ref}).`,
          `${q('Adresse *')} (address): « street number, postcode City » — the city = the text after the <b>last comma</b>.`,
          'Installation dates <b>with times</b>, and dismantling dates if known.',
        ])),
      visual: 'Mock-up of the top of the form, filled with the demo project.',
      notes: 'Without an internal number, VEM makes up a VEM-year-digits number: the project will not be able to receive e-mails with the right reference.',
    },
    {
      title: 'The form (2/3) — the notes',
      body: () => cols(
        win('📝 Notes complémentaires',
          field('🌐 Notes globales du projet', 'Client is demanding about clean façades. Deliveries only before 9 am.', { wide: true })
          + `<div class="m-grid2">${field('🔨 Notes installation', '70 t crane on 15/03 from 8 am to 12 pm.')}${field('🔧 Notes démontage', 'Removal via the North car park.')}</div>`,
          { sub: 'Visibles dans le Rapport IA (section Vue d\'ensemble)' }),
        table(['Note', 'Where it shows up'], [
          [L('🌐 Notes globales du projet'), 'Infos tab · AI report · Briefing (« OBJET »)'],
          [L('🔨 Notes installation'), 'Infos tab · AI report · Briefing (« INSTALLATION »)'],
          [L('🔧 Notes démontage'), 'Infos tab · AI report · Briefing (« DÉMONTAGE »)'],
          [L('Description / Instructions spéciales'), 'Infos tab · Briefing (« DESCRIPTION »)'],
        ], { small: true }) + callout('tip', 'Write the notes for the field team: this text will appear as is in the briefing.')),
      visual: 'Additional notes block recreated + « where it shows up » table.',
      notes: 'Notes are never filled in by e-mails: it is up to you to type them.',
    },
    {
      title: 'The form (3/3) — the bottom blocks',
      body: () => table(['Block', 'What to do today'], [
        [`${L('👷 Équipes & Membres')}`, `<b>Do not use it</b>: the selection is not saved. Add the team after creation, in the ${L('👥 Équipe')} tab (chapter 6).`],
        [`${L('📋 Tâches à créer')}`, `Click <b>${L('☐ Aucun')}</b> (none): tasks are no longer used. Otherwise VEM creates some fifty invisible tasks.`],
        [`${L('🚛 Logistique')}`, `Possible, but prefer the project\'s ${L('🚛 Logistique')} tab (loading places, status). A vehicle without a number or registration is ignored.`],
      ]) + `<div class="m-row right">${btn('Annuler', 'outline')}${btn('✅ Créer le Projet', 'primary')}</div>`
        + callout('warn', `The ${q('📋 Tâches à créer')} (tasks to create) block is <b>all ticked by default</b>. Remember ${q('☐ Aucun')} before ${q('✅ Créer le Projet')}.`),
      visual: 'Table of the 3 blocks + Create button + box.',
      notes: 'These workarounds will disappear when the form is fixed (see the repair prompt).',
    },
    {
      title: 'Required or strongly recommended?',
      body: () => table(['Field', 'Status', 'Used by'], [
        [L('Nom *'), chip('Required', 'red', { free: true }), 'Everywhere'],
        [L('Client *'), chip('Required', 'red', { free: true }), 'Contacts, sending, handover'],
        [L('Adresse *'), chip('Required', 'red', { free: true }), 'Briefing map, project city'],
        [`${L('Début installation *')} / ${L('Fin installation *')}`, chip('Required', 'red', { free: true }), 'Calendar, briefing, hotels by e-mail'],
        [L('N° Interne'), chip('Essential', 'red', { free: true }), 'Receiving e-mails, search'],
        [`${L('Début démontage')} / ${L('Fin démontage')}`, chip('Strongly recommended', 'amber', { free: true }), 'Calendar, briefing, dismantling hotels'],
        [L('Ouvriers'), chip('Recommended', 'grey', { free: true }), 'Project sheet, report'],
        ['Notes and description', chip('Strongly recommended', 'amber', { free: true }), 'Briefing, AI report'],
      ], { small: true }),
      visual: 'Table with tags.',
      notes: 'VEM does not check that the end is after the start: double-check the dates.',
    },
    {
      title: 'After « ✅ Créer le Projet »',
      body: () => cols(
        steps([
          'VEM goes back to the list and opens the new project sheet.',
          `Starting status: ${q('📄 Brouillon')} (draft — the status list looks empty).`,
          `Choose the real status, e.g. ${q('📝 Devis à valider')}.`,
          `${q('👥 Équipe')} tab: add the team.`,
          `${q('🚛 Logistique')}, ${q('✈️ Bookings')}, ${q('📁 Fichiers')} tabs: complete them as soon as the information exists.`,
        ]),
        callout('info', `To correct later: ${q('✏️ Modifier')} in the header of the sheet (chapter 5).`)),
      visual: 'Numbered steps.',
      notes: 'The project appears in the Dashboard calendar as soon as it has an installation date.',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        'Internal number empty or in the wrong format → e-mails do not find the project.',
        `Internal number already used → message « Valeur déjà existante (contrainte unique) » (value already exists).`,
        'Address without a comma before the city → the city shown on the project card is wrong.',
        `Leaving ${q('📋 Tâches à créer')} all ticked → dozens of useless tasks.`,
        `Ticking the team in the form → nothing is saved: use the ${q('👥 Équipe')} tab.`,
        `Clearing a dismantling date in ${q('✏️ Modifier')} does not erase it: ask an admin.`,
      ]),
      visual: 'Bullet list.',
      notes: 'Insist on the internal number format: it is the key to the whole e-mail circuit.',
    },
    {
      kind: 'exercise', title: 'Exercise — create the demo project',
      body: () => cols(steps([
        `Create <b>${FIL.projet}</b> for ${FIL.client}, internal number <code>${FIL.ref}</code>.`,
        `Address: ${FIL.adresse}. Installation ${FIL.instStart} → ${FIL.instEnd}, dismantling ${FIL.disStart} → ${FIL.disEnd}.`,
        'Fill in the 3 additional notes.',
        `${q('☐ Aucun')} in the tasks, then ${q('✅ Créer le Projet')}.`,
        `Set the status to ${q('📝 Devis à valider')}.`,
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Internal number in Viewbox format, always.',
        'Dates with times, address « …, City ».',
        'Notes = content of the briefing.',
        'Tasks: ☐ Aucun. Team: Équipe tab.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Duration: 10 minutes.',
    },
  ],
};
