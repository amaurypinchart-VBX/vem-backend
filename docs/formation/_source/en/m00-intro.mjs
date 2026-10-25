import { q, L, btn, tabs, field, win, menu, steps, callout, capture, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'intro', num: 0, icon: '🚀', title: 'Welcome to VEM',
  public: 'Everyone', duree: '30 min', parcours: 'Core track',
  slides: [
    {
      kind: 'cover', title: 'VEM Training',
      body: () => `<div class="cover-sub">ViewBox Event Manager</div>
        <div class="cover-line">Create, feed and follow a project from start to finish</div>
        <div class="cover-meta">Viewbox International · Tubize</div>`,
      visual: 'Cover page: navy background, white title, red rule.',
      notes: 'Introduce yourself, the agenda and the duration. Remind everyone that everything shown really exists in VEM today.',
    },
    {
      title: 'Why this training?',
      body: () => cols(
        ul([
          'VEM works, but it is <b>not filled in enough</b>.',
          'A well-filled project produces <b>by itself</b>: the briefing, the report, the calendar, the handover PDF.',
          'An empty project forces everyone to <b>ask again</b> for information by phone or e-mail.',
        ]),
        callout('info', 'Goal: by the end, everyone knows <b>what</b> to fill in, <b>when</b>, and <b>through which channel</b> (form or e-mail).')),
      visual: 'Two columns: findings on the left, goal box on the right.',
      notes: 'Insist: this is not extra paperwork, it is what prevents things being forgotten on site.',
    },
    {
      title: 'How to use this deck',
      body: () => cols(
        ul([
          '<b>← →</b> or space: next / previous slide. On a phone: swipe.',
          '<b>☰ Contents</b> at the top: direct access to each chapter.',
          'In VEM: menu <b>🎓 Formation VEM</b> (Help section), for signed-in users only.',
          '<b>N</b>: show the trainer\'s notes. <b>Ctrl + P</b>: print (one slide per page).',
        ]),
        table(['Track', 'For whom', 'Chapters'], [
          ['🟦 Core track', 'Everyone', 'Welcome · E-mail rule · Dashboard · Practice'],
          ['🟥 Office', 'Sales, Customer Service, Project &amp; Technical Managers', 'Clients · Create a project · E-mails · Project sheet · Team · Logistics · Bookings · Files · Briefing · AI report'],
          ['🟩 Field', 'Site Managers, installers (on a phone)', 'Checklist · Daily Reports · Handover · Files / photos by e-mail'],
        ], { small: true })),
      visual: 'Command list on the left, table of the 3 tracks on the right.',
      notes: 'The deck is a single file: it opens in any browser, even offline.',
    },
    {
      title: 'Our running example project (fictitious)',
      body: () => cols(
        table(['Item', 'Value'], [
          ['Project', FIL.projet], ['Internal number', `<b>${FIL.ref}</b>`], ['Client', FIL.client],
          ['Client contact', `${FIL.contact} (${FIL.contactFonction})`], ['Address', FIL.adresse],
          ['Installation', `${FIL.instStart} → ${FIL.instEnd}`], ['Dismantling', `${FIL.disStart} → ${FIL.disEnd}`],
          ['Team', `${FIL.siteManager} (Site Manager), ${FIL.techManager} (Technical Manager), ${FIL.installateur} (Installer)`],
        ], { small: true }),
        callout('info', `Viewbox internal number format: <b>4 digits + 4 to 6 letters + VIE</b>.<br>Real example: <code>6055RKLOKVIE</code> · Our demo: <code>${FIL.ref}</code>`)
        + callout('warn', 'All data in this deck is fictitious: do not use this project in production.')),
      visual: 'Identity card of the demo project + internal number format box.',
      notes: 'This project comes back in every exercise. If you do the exercises in VEM, delete or archive the demo project at the end with an admin\'s agreement.',
    },
    {
      title: 'Signing in',
      body: () => cols(
        win('Connexion', field('Email', 'firstname.lastname@…') + field('Mot de passe', '••••••••')
          + `<div class="m-row">${btn('Se connecter', 'primary')}</div><div class="m-link">${L('🔑 Mot de passe oublié ?')}</div>`, { sub: 'Accédez à votre espace de gestion' }),
        steps([
          `Open VEM, enter ${q('Email')} and ${q('Mot de passe')} (password), then ${q('Se connecter')} (sign in).`,
          'A session lasts <b>8 hours</b>. After that, VEM sends you back to the sign-in screen: save your work before a long break.',
          `First sign-in with a temporary password: VEM opens ${q('🔐 Choisissez votre mot de passe')} (choose your password, 8 characters min.).`,
        ])
        + callout('warn', `Forgotten password: the ${q('🔑 Mot de passe oublié ?')} link does not work for now. <b>Ask an admin, a Project or Technical Manager</b> to send you access again (${q('📧 Envoyer invitation')}, valid 15 min).`)),
      visual: 'Mock-up of the sign-in screen on the left, steps on the right.',
      notes: 'The « Rester connecté » (stay signed in) box has no effect today: do not present it as an option. The temporary password e-mail is called « Votre acces VEM - mot de passe temporaire ».',
    },
    {
      title: 'My profile: changing your password',
      body: () => cols(
        steps([
          `Click your initials at the top right (or your name at the bottom of the menu) › ${q('👤 Mon profil')} (my profile).`,
          `${q('🔑 Changer mon mot de passe')} (change my password): old, new (8 characters min.), confirmation.`,
          `${q('💾 Valider')} → message « Mot de passe modifié ✅ ».`,
        ]),
        callout('ok', 'You received your password when your account was created? <b>Change it at your first sign-in</b>.')
        + callout('info', 'The profile only lets you change the password. Name, e-mail, phone: ask an admin or a Project Manager.')),
      visual: 'Numbered steps + two boxes.',
      notes: 'Never share an account: the signed-in person is recorded as the author of the reports.',
    },
    {
      title: 'The menu (computer)',
      body: () => cols(
        menu([
          ['Principal', ['!📊 Dashboard', '🏗️ Projets']],
          ['Terrain', ['📓 Daily Reports', '🧾 Handover']],
          ['Admin', ['☑️ Templates check-list', '🏢 Clients', '👥 Équipe', '🔔 Notifications']],
        ]),
        ul([
          `<b>Principal</b> (main): the dashboard and the list of all projects.`,
          `<b>Terrain</b> (field): daily reports and handovers of all projects.`,
          `<b>Admin</b>: the checklist library, clients, members, your notifications.`,
          `The ${q('‹')} button collapses the menu (choice remembered).`,
        ]) + callout('warn', `You will also see ${q('✅ Tâches')}, ${q('📸 Visites Client')} and ${q('📋 Templates tâches')}: <b>do not use them any more</b>. Follow-up is now done with the <b>checklist</b> (chapter 10).`)),
      visual: 'Mock-up of the side menu (Principal / Terrain / Admin sections) on the left.',
      notes: 'The menu depends on the role: a Site Manager, an installer or a worker does not see Clients or Templates check-list; a Client account only sees Handover and Notifications. A « Aide » (help) section contains « 🎓 Formation VEM ».',
    },
    {
      title: 'On a phone',
      body: () => cols(
        `<div class="m-phone"><div class="m-phone-screen">${capture('C-01', 'VEM on a phone, Dashboard page', 'bottom bar visible, ＋ menu open', 'signed in as demo Site Manager')}</div>
         <div class="m-bottom"><span>📊<br>${L('Dashboard')}</span><span>🏗️<br>${L('Projets')}</span><span class="fab">＋</span><span>☰<br>${L('Menu')}</span></div></div>`,
        steps([
          `Bottom bar: ${q('Dashboard')}, ${q('Projets')} (projects), round <b>＋</b> button, ${q('Menu')} (= the full menu).`,
          `The <b>＋</b> gives direct access to ${q('📓 Daily Report')} and ${q('🧾 Handover')}.`,
          'Windows open full screen: close them with the <b>×</b>.',
        ]) + callout('tip', 'Open the right project first, then use ＋: the project is then preselected.')),
      visual: 'Phone frame with the bottom bar recreated + screenshot to take.',
      notes: 'The « 📸 Point visite » choice of the ＋ button is no longer used (client visits module dropped).',
    },
    {
      title: 'The life cycle of a project',
      body: () => `<div class="flow">${[
        ['Quote', '📝 Devis à valider → ✅ Devis validé'],
        ['Preparation', '🔧 En préparation'],
        ['Departure', 'Briefing'],
        ['Installation', '📍 Sur site → 🏗️ En installation'],
        ['Handover', '🧾 Handover OK'],
        ['Dismantling', '🔨 Démontage'],
        ['Closing', '🎉 Terminé'],
      ].map(([t, s]) => `<div class="flow-step"><div class="ft">${t}</div><div class="fs">${s}</div></div>`).join('')}</div>`
        + cols(callout('info', `The status is changed in the project sheet (list under the name). <b>Anyone with access to VEM</b> can do it, and it <b>never changes by itself</b> (neither when the handover is signed, nor with the dates).`),
          callout('warn', `A new project is in ${q('📄 Brouillon')} (draft): the status list looks empty. Choose the right status directly (e.g. ${q('📝 Devis à valider')}, quote to approve).`)),
      visual: 'Horizontal timeline of the 7 phases with the VEM statuses under each phase.',
      notes: 'Selectable statuses: Devis à valider, Devis validé, En préparation, En installation, Sur site, Handover OK, Démontage, Terminé, Annulé (quote to approve, quote approved, in preparation, in installation, on site, handover OK, dismantling, completed, cancelled).',
    },
    {
      title: 'Who can do what?',
      body: () => cols(
        table(['Role', 'Visible projects', 'Can edit'], [
          ['Admin, Technical Manager', 'All', 'Everything'],
          ['Project Manager, Engineer, Sales Engineer, Warehouse', 'All', 'Everything (except reserved settings)'],
          ['Site Manager', '<b>Their</b> projects (project team)', 'Everything on their projects'],
          ['Installer, Worker', '<b>Their</b> projects', 'Nothing by default; daily reports / handover if a manager grants the right'],
          ['Client', 'Their project', 'Nothing: they only view the handover'],
        ], { small: true }),
        callout('info', '« Their projects » = projects where the person is in the 👥 Équipe (team) tab. <b>Not in the team = project invisible.</b>')
        + callout('no', '<b>Never delete</b> a project, a client, a report or a handover: deletion is permanent (no recycle bin).')
        + callout('info', `Message ${q('Permission insuffisante')} (insufficient permission): the action is reserved for another role.`)),
      visual: 'Roles table on the left, boxes on the right.',
      notes: 'Creating members: admin, Technical Manager, Project Manager (admin and Technical Manager accounts: admin only). Configuring a checklist: admin, TM, PM; filling it: + Site Manager. Signature link despite an incomplete checklist: admin and TM.',
    },
    {
      title: 'The 6 golden rules',
      body: () => `<div class="golden">${[
        ['1', 'One project = one internal number', `In Viewbox format (e.g. <code>${FIL.ref}</code>). Without an internal number, the project cannot receive e-mails.`],
        ['2', 'Everything goes through VEM', 'Files, drawings, bookings: in the project, through the form or by e-mail.'],
        ['3', 'Check what an e-mail creates', 'Projects, trucks, hotels and trips created by e-mail arrive as drafts: review them.'],
        ['4', 'The checklist day by day', 'It replaces tasks and is required before the handover can be signed.'],
        ['5', 'One daily per site day', 'With photos: it is the memory of the project and the basis of the report.'],
        ['6', 'Never delete', 'Archive a project; ask an admin for anything else.'],
      ].map(([n, t, d]) => `<div class="gold"><div class="gn">${n}</div><div><div class="gt">${t}</div><div class="gd">${d}</div></div></div>`).join('')}</div>`,
      visual: 'Grid of 6 numbered cards.',
      notes: 'These rules come back in every chapter. You can print them at the end of the training.',
    },
  ],
};
