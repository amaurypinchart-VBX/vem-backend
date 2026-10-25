import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'dashboard', num: 15, icon: '📊', title: 'Dashboard, calendar & notifications',
  public: 'Everyone', duree: '20 min', parcours: 'Core track',
  slides: [
    {
      title: 'The Dashboard at a glance',
      body: () => cols(
        `<div class="m-stats"><div><b>4</b>${L('Projets actifs')}</div><div><b>—</b>${L('Tâches terminées')}</div><div><b>27</b>${L('Membres équipe')}</div></div>`
        + ul([
          `${q('Projets actifs')} (active projects): projects In preparation, In installation or On site.`,
          `${q('🏗️ Projets en cours')} (ongoing projects): 3 projects at most, with their progress.`,
          `${q('⚡ Actions rapides')} (quick actions): Daily report, Handover.`,
        ]),
        callout('info', `« Tâches terminées » (completed tasks) always shows « — »: ignore it. The figures cover the projects you can see.`)
        + `<div class="m-row">${btn('+ Nouveau Projet', 'primary')}</div>`),
      visual: 'Recreated statistics tiles + list.',
      notes: 'Landing page after logging in.',
    },
    {
      title: 'The project calendar',
      body: () => cols(
        capture('C-09', 'Dashboard › 📅 Calendrier projets', '8-week period, 🚛 Camions and 👥 Équipes boxes ticked', `demo project visible with a truck and a transport`),
        ul([
          `${q('Période :')} (period) from 2 to 26 weeks, starting this week.`,
          '<b>Blue</b> bar = installation, <b>orange</b> = dismantling, red line = today.',
          `${q('🚛 Camions')} (trucks): one green line per vehicle. ${q('👥 Équipes')} (teams): presence on site, travel hatched.`,
          `${q('🎯 Filtrer projets')} (filter projects): tick the projects to show (remembered on your computer).`,
          '▲ ▼: changes the order <b>for everyone</b>.',
          'Click a project = its sheet.',
        ])),
      visual: 'Calendar screenshot + legend.',
      notes: 'Completed or cancelled projects may still appear: use the filter.',
    },
    {
      title: 'Notifications',
      body: () => cols(
        table(['Notification', 'Who', 'When'], [
          [L('🆕 Projet créé depuis un email'), 'Admins, Project Managers', 'A NEW e-mail created a project'],
          [L('🚛 Réservations créées depuis un email'), 'Admins, Project Managers', 'An e-mail created trucks / hotels / trips'],
          ['📤 Project name', 'The member concerned', 'Someone sent them information (📤)'],
        ], { small: true }),
        steps([
          `Menu ${q('🔔 Notifications')} or 🔔 at the top.`,
          'Click a notification = marked as read.',
          `${q('Tout lire')} (read all) to mark everything.`,
        ]) + callout('info', 'Notifications do not open the project: search for the internal number in Projects.')),
      visual: 'Table of types + steps.',
      notes: 'There are no phone (push) notifications: check VEM.',
    },
    {
      title: 'The public schedule (warehouse screen)',
      body: () => cols(
        ul([
          'Read-only page « Planning Projets — 2 mois » (2-month project schedule), shown on the warehouse screens.',
          'Address: the VEM address followed by <code>/planning-public.html</code>, with the access key provided by the admin if there is one (no link in the menu).',
          'Shows the next 60 days: installation (status colour), dismantling (hatched), 🚛 on the loading day.',
          'Refreshes automatically.',
        ]),
        callout('warn', 'It opens without a VEM account and shows project and client names: do not share its address outside Viewbox.')
        + callout('tip', 'Correct dates and trucks in VEM = correct warehouse schedule.')),
      visual: 'List + boxes.',
      notes: 'Ask your admin for the exact VEM address if needed.',
    },
    {
      kind: 'exercise', title: 'Exercise — managing your week',
      body: () => cols(steps([
        'Show 8 weeks with Trucks and Teams.',
        'Hide all projects except the demo project with 🎯 Filtrer projets.',
        'Open the project from its bar.',
        'Open your notifications and mark them as read.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Blue installation, orange dismantling, green trucks.',
        '▲ ▼ changes the order for everyone.',
        'Notifications: mainly creations by e-mail.',
        'Public schedule = VEM data.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: '',
    },
  ],
};
