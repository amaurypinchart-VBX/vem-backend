import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'equipe', num: 6, icon: '👥', title: 'The team',
  public: 'Project & Technical Managers', duree: '25 min', parcours: 'Office',
  slides: [
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: every person has their own account, and every project has its team (with the phase).',
          '<b>Who</b>: Project and Technical Managers (accounts are created by an admin, Project Manager or Technical Manager; an admin or Technical Manager account can only be created by an admin).',
        ]) + path(['👥 Équipe', '+ Nouveau membre']) + path(['🏗️ Projets', '~project', '👥 Équipe', '+ Ajouter à l\'équipe']),
        callout('info', 'Two levels: the <b>Équipe page</b> (all VEM accounts) and a <b>project\'s Équipe tab</b> (who works on this site).')),
      visual: 'Goal + two paths.',
      notes: 'Members are grouped by role on the Équipe page.',
    },
    {
      title: 'Create a member',
      body: () => cols(
        win('👤 Nouveau Membre',
          `<div class="m-row">${btn('📷 Scanner la carte', 'blue')}${btn('🖼️ Depuis galerie')}</div>`
          + `<div class="m-grid2">${field('Prénom *', 'Luc')}${field('Nom *', 'Essai')}</div>`
          + `<div class="m-grid2">${field('Email *', 'luc.essai@…')}${field('Téléphone', '+32 470 …')}</div>`
          + `<div class="m-grid2">${field('Rôle', '🔧 Installateur')}${field('Sous-équipe', '— Aucune —')}</div>`
          + `<div class="m-row right">${btn('✅ Créer le compte', 'primary')}</div>`, { sub: 'Fiche membre complète' }),
        steps([
          `${q('👥 Équipe')} › ${q('+ Nouveau membre')}.`,
          `Optional: ${q('📷 Scanner la carte')} (scan the ID card) — the AI fills in the identity (the photo of the card is not kept).`,
          `${q('Prénom *')} (first name), ${q('Nom *')} (last name), ${q('Email *')}, phone, ${q('Rôle')} (role).`,
          `${q('✅ Créer le compte')}: VEM shows the generated password <b>only once</b>.`,
          'Pass it on to the person (or use 📧 Envoyer invitation) and ask them to change it (Mon profil).',
        ]) + callout('warn', 'The phone number is very useful: it appears in the briefing (Équipe slide).')),
      visual: 'Mock-up of the window + steps.',
      notes: 'The profile photo and sub-teams are not reliable today: don\'t rely on them.',
    },
    {
      title: 'Give access: invitation or temporary password',
      body: () => cols(
        `<div class="sub-t">${L('🔗 Inviter')} (link)</div>` + steps([
          `${q('👥 Équipe')} › ${q('🔗 Inviter')}: choose ${q('Rôle attribué')} (assigned role) and, optionally, the e-mail.`,
          `${q('🔗 Générer le lien')}: the link is copied.`,
          'The person creates their account themselves.',
        ]) + callout('warn', 'The link is valid for <b>15 minutes</b>, once only. Admins, Project and Technical Managers only. An invitation cannot give the Admin or Technical Manager role.'),
        `<div class="sub-t">${L('📧 Envoyer invitation')} (existing account)</div>` + steps([
          'Open the member\'s record (click their card).',
          `${q('📧 Envoyer invitation')}: they receive a temporary password valid for 15 min.`,
          `At login: ${q('🔐 Choisissez votre mot de passe')} (choose your password).`,
        ]) + callout('tip', 'This is also the solution for a <b>forgotten password</b>.')),
      visual: 'Two columns: invitation link / temporary password.',
      notes: 'Envoyer invitation replaces the member\'s current password and logs them out everywhere.',
    },
    {
      title: 'Add the team to a project',
      body: () => cols(
        win('👷 Ajouter à l\'équipe', field('Membre', `${FIL.siteManager} (site_manager)`) + field('Rôle sur ce projet', '🏗️ Site Manager') + field('Phase d\'intervention', '🔄 Les deux phases (installation + démontage)') + `<div class="m-row right">${btn('✅ Ajouter', 'primary')}</div>`),
        steps([
          `Project record › ${q('👥 Équipe')} tab › ${q('+ Ajouter à l\'équipe')}.`,
          `${q('Membre')}, ${q('Rôle sur ce projet')} (role on this project: Installer, Site Manager, Technical Manager, Worker, Engineer, or Client: they will only see the handover).`,
          `${q('Phase d\'intervention')}: both phases, installation only or dismantling only.`,
          `${q('✅ Ajouter')}. Repeat for each person.`,
        ]) + callout('info', 'The phase can then be changed directly in the table. To change the role: remove (✕) and add the person again.')),
      visual: 'Mock-up of the window + steps.',
      notes: 'No notification is sent automatically when someone is added: use 📤 (next slide).',
    },
    {
      title: 'Notify a member: 📤',
      body: () => cols(
        win('📤 Envoyer à Paul Démo', `<div class="m-txt"><b>${L('Quoi envoyer ?')}</b></div>`
          + ['📌 Notification d\'assignation', '📋 Infos du projet', '🚚 Ses réservations', '📄 Derniers rapports'].map((x) => `<div class="m-txt">☑ ${L(x)}</div>`).join('')
          + `<div class="m-txt"><b>${L('Canal')}</b> : ${L('📱 Notif')} · ${L('✉️ Email')} · ${L('📱+✉️ Les deux')}</div><div class="m-row right">${btn('📤 Envoyer', 'primary')}</div>`, { free: true }),
        ul([
          'On the member\'s row (👥 Équipe tab): the 📤 button.',
          'Tick what they should receive: project info, their bookings (transport + hotel), latest reports.',
          'Choose the channel and add a personal note if needed.',
        ]) + callout('tip', 'Ideal just before departure: everyone receives their train times and their hotel.')),
      visual: '📤 window recreated + explanations.',
      notes: 'The « 📊 Briefings » option only sends a link to VEM, not the PDF: send the briefing PDF instead.',
    },
    {
      title: 'Rights of an installer or a worker',
      body: () => cols(
        ul([
          'By default, an installer or a worker can <b>view</b> their projects (those where they are in the team) without changing anything.',
          'An admin, Project or Technical Manager can allow them to <b>fill in</b> some modules on their projects.',
        ]) + steps([
          `${q('👥 Équipe')} › click the member\'s card.`,
          `Block « 🔒 Consulte seulement ses projets. Peut aussi remplir : » (only views their projects, can also fill in): tick ${q('📓 Daily reports')} and / or ${q('🧾 Handover')}.`,
          'Message « Droits enregistrés ✅ »: takes effect immediately.',
        ]),
        callout('tip', 'An installer team leader who keeps the daily report? Give them the 📓 Daily reports right and add them to the project team.')
        + callout('info', 'A Site Manager already has these rights on their projects: nothing to tick.')),
      visual: 'Explanation + steps + callouts.',
      notes: 'The « Check-lists de montage » right also exists on the record, but the checklist screen does not take it into account yet: present it once fixed.',
    },
    {
      title: 'What the project team is used for',
      body: () => `<div class="feeds">${[
        ['📋 Briefing', '« Équipe » slide: name, role, phase, phone'],
        ['📧 Travel e-mails', 'A trip is only created by e-mail if the person is in the team'],
        ['🔒 Access', 'Site Managers, installers and workers <b>only</b> see the projects where they are in the team'],
        ['✈️ Bookings', 'Transport and hotels per member and per phase'],
        ['📊 AI report', 'Overview section: team'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: '« Project team » card and arrows.',
      notes: 'A Site Manager who is not in the team does not see the project at all.',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        `Ticking the team in the « Nouveau Projet » form → not saved. Use the ${q('👥 Équipe')} tab.`,
        'Creating a member with « + Créer membre » from a project does not add them to the project: add them afterwards.',
        'Invitation link sent too late → expired after 15 minutes.',
        'Keeping the default password → change it immediately.',
        'Sub-teams: they are only visible on the computer of the person who created them.',
        'Forgetting to add a Site Manager or an installer to the team → the project is invisible to them.',
        'Someone leaves the company: ask an admin (there is no deactivate button).',
      ]),
      visual: 'List.',
      notes: 'Identity data (national register number, ID card number) is only visible to admins, Project and Technical Managers.',
    },
    {
      kind: 'exercise', title: 'Exercise — the demo project team',
      body: () => cols(steps([
        `Add to ${FIL.ref}: ${FIL.siteManager} (Site Manager, both phases), ${FIL.techManager} (Technical Manager), ${FIL.installateur} (Installer, installation only).`,
        `Switch ${FIL.installateur} to « both phases » in the table.`,
        `Send ${FIL.siteManager} the project info with 📤.`,
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Accounts: Équipe page. Project: Équipe tab.',
        'Phase = installation, dismantling or both.',
        'Team first, travel e-mails afterwards.',
        'Forgotten password → Envoyer invitation.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Duration: 5 minutes.',
    },
  ],
};
