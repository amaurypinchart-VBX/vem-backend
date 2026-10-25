import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'clients', num: 1, icon: '🏢', title: 'Clients & contacts',
  public: 'Sales, Customer Service, Project Managers', duree: '20 min', parcours: 'Office',
  slides: [
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: every project is linked to a <b>complete and unique</b> client record, with its contacts.',
          '<b>For whom</b>: Sales, Customer Service, Project Managers.',
        ]) + path(['🏢 Clients', '+ Nouveau Client']),
        callout('info', `You can also create a client <b>without leaving</b> the project form: ${q('+ Client')} button next to the ${q('Client *')} field. The new client is then selected automatically.`)),
      visual: 'Goal + access path + box.',
      notes: 'The Clients menu is in the Admin section of the side menu.',
    },
    {
      title: 'Creating a client',
      body: () => cols(
        win('🏢 Nouveau Client',
          `<div class="m-grid2">${field('Nom de la société *', FIL.client)}${field('N° TVA / VAT', FIL.tva)}</div>`
          + field('Adresse', 'Avenue Démo 10, 1000 Bruxelles', { wide: true })
          + `<div class="m-grid2">${field('Email société', 'info@demo-events.example')}${field('Téléphone société', '+32 2 000 00 00')}</div>`
          + `<div class="m-sep">${L('Personnes de contact')} ${btn('+ Ajouter contact')}</div>`
          + `<div class="m-grid3"><span class="m-val">${FIL.contact}</span><span class="m-val">${FIL.contactMail}</span><span class="m-val">${FIL.contactTel}</span></div>`
          + `<div class="m-row right">${btn('Annuler', 'outline')}${btn('✅ Créer le client', 'primary')}</div>`),
        steps([
          `Menu ${q('🏢 Clients')} › ${q('+ Nouveau Client')} (new client).`,
          `Fill in ${q('Nom de la société *')} (company name — the only required field).`,
          'Add the company address, e-mail and phone.',
          `Add each contact (First name Last name, Email, Phone) with ${q('+ Ajouter contact')} (add contact).`,
          `${q('✅ Créer le client')} (create the client).`,
        ]) + callout('tip', 'The first contact filled in becomes the <b>main contact</b>.')),
      visual: 'Mock-up of the « 🏢 Nouveau Client » window filled with the demo client.',
      notes: 'If the company e-mail or phone are empty, VEM copies those of the main contact into them.',
    },
    {
      title: 'Job title and main contact ★',
      body: () => cols(
        steps([
          `Open the client (click its card) › ${q('✏️ Modifier')} (edit).`,
          `For each contact: ${q('Fonction')} (job title, e.g. ${FIL.contactFonction}).`,
          `Tick ${q('★')} in front of the main contact.`,
          `${q('💾 Sauvegarder')} (save).`,
        ]),
        callout('info', 'The job title and the main contact choice are only available <b>when editing</b>, not at creation. Remember to come back to it.')
        + callout('warn', 'A contact line without a name is ignored without warning: always fill in the name.')),
      visual: 'Steps + two boxes.',
      notes: 'The ★ contact is the one shown in the project\'s Infos tab and in the briefing.',
    },
    {
      title: 'Fields: required and strongly recommended',
      body: () => table(['Field', 'Status', 'Why'], [
        [L('Nom de la société *'), chip('Required', 'red', { free: true }), 'Without it, no client.'],
        [L('Email société'), chip('Strongly recommended', 'amber', { free: true }), '« Client » recipient offered when sending daily reports and the handover; receives the signed handover PDF.'],
        [L('Téléphone société'), chip('Strongly recommended', 'amber', { free: true }), 'Shown in the project\'s Infos tab (📞 clickable).'],
        ['Contacts (name, e-mail, phone, job title)', chip('Strongly recommended', 'amber', { free: true }), '« Contacts » slide of the briefing, prefilling of the handover.'],
        [L('Adresse'), chip('Recommended', 'grey', { free: true }), 'Complete client record.'],
        [L('N° TVA / VAT'), chip('Recommended', 'grey', { free: true }), 'Administrative reference.'],
      ]),
      visual: '3-column table with coloured tags.',
      notes: 'The company e-mail is the most important field after the name: it is used for everything sent to the client.',
    },
    {
      title: 'What it is used for later',
      body: () => `<div class="feeds">${[
        ['🏗️ Project form', `${L('Client *')} list`],
        ['📋 Infos tab', `${L('📞 Contact client')} block (★ contact + company phone / e-mail)`],
        ['🧾 Handover', 'Client, representative and e-mail prefilled'],
        ['📓 Daily Reports', '« Client » box ticked when sending'],
        ['📋 Briefing', '« Contacts » slide generated automatically'],
        ['✍️ Signed handover', 'The signed PDF goes to the client record\'s e-mail'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: '« Client » card in the centre and 6 arrows to the screens that use it.',
      notes: 'A badly filled client = messages sent to the wrong place, or nowhere.',
    },
    {
      title: 'Common mistakes',
      body: () => cols(
        ul([
          '<b>Duplicates</b>: « Demo Events » and « Demo Events SA » are two different clients. <b>Search the list first</b>.',
          `A project created by e-mail links an unknown name to a <b>new client</b> created automatically, or to the generic client ${q('⚠️ Client à confirmer')} (client to confirm). Correct the project\'s client afterwards (chapter 3).`,
          'Contact without a name: ignored.',
        ]),
        callout('no', `${q('🗑️ Supprimer ce client')} (delete this client) is refused as long as a project is linked to it. A successful deletion is <b>permanent</b> (contacts included): do not delete, ask an admin.`)),
      visual: 'List of mistakes + forbidden box.',
      notes: 'Show the Clients list sorted by name: that is where duplicates are spotted.',
    },
    {
      kind: 'exercise', title: 'Exercise — Demo Events SA',
      body: () => cols(steps([
        `Create the client <b>${FIL.client}</b> with VAT number, address, company e-mail and phone.`,
        `Add the contact <b>${FIL.contact}</b> (${FIL.contactMail}, ${FIL.contactTel}).`,
        `Reopen it with ${q('✏️ Modifier')}: job title « ${FIL.contactFonction} » and ★ main contact.`,
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'One client = one unique record (search before creating).',
        'The company e-mail is used for everything sent to the client.',
        'Job title and ★: when editing.',
        'Do not delete a client.',
      ])}</div>`),
      visual: 'Exercise on the left, recap box on the right.',
      notes: 'Duration: 5 minutes. Check that everyone sees the client in the list.',
    },
  ],
};
