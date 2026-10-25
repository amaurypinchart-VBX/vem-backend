import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'handover', num: 12, icon: '🧾', title: 'Handover & client signature',
  public: 'Site Managers, Technical Managers', duree: '35 min', parcours: 'Field',
  slides: [
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: have the client accept the installation, with the inspected points and their signature.',
          '<b>For whom</b>: Site Managers, Technical Managers (and an installer with the 🧾 Handover right). A Client account of the project can view its handover and the PDF.',
        ]) + path(['🏗️ Projets', '~project', '🧾 Handover', '+ Nouveau Handover']),
        callout('warn', `Always go through the project's 🧾 Handover <b>tab</b>. The ${q('🧾 Handover')} menu and the button of the same name in the header open the list of all projects, with fewer functions.`)
        + callout('info', 'Before that: the assembly checklist must be filled in (chapter 10).')),
      visual: 'Goal + path + boxes.',
      notes: 'You can create several handovers per project (e.g. per zone or per phase).',
    },
    {
      title: 'Create the handover',
      body: () => cols(
        win('🧾 Nouveau Handover',
          `<div class="m-grid2">${field('Projet *', FIL.projet)}${field('Client / Société', FIL.client)}</div>`
          + field('Représentant présent', FIL.contact, { wide: true })
          + `<div class="m-txt"><b>${L('🔍 Points d\'inspection')}</b> ${btn('🎙️ Voix')}${btn('+ Ajouter')}</div>`
          + `<div class="m-grid2"><span class="m-val">Façade Nord</span><span class="m-val">${L('✅ OK')} · ${L('⚠️ Remarque')} · ${L('❌ Défaut')} · ${L('⏳ En attente')}</span></div>`
          + field('Notes générales', 'Réception en présence du client.', { wide: true })
          + `<div class="m-row right">${btn('✅ Créer le Handover', 'primary')}</div>`),
        steps([
          `${q('🧾 Handover')} tab › ${q('+ Nouveau Handover')}: project and client prefilled.`,
          'One point per inspected zone: name, status, comment, photo(s).',
          `${q('🎙️ Voix')} (Voice) to dictate the name of a zone.`,
          `${q('Notes générales')} (general notes): they become « Remarques / Réservations » in the PDF.`,
          `${q('✅ Créer le Handover')}.`,
        ]) + callout('warn', 'The acceptance date and the e-mail typed here are not saved: the PDF uses the creation date, and the signed PDF goes to the e-mail of the client record.')),
      visual: 'Mock-up of the window + steps.',
      notes: 'The person who creates the handover becomes its Site Manager: they will receive the signed PDF.',
    },
    {
      title: 'The handover sheet',
      body: () => cols(
        steps([
          `On the card: ${q('👁️ Ouvrir')} (Open).`,
          `${q('+ Point')} to add a zone; the status of each zone can be changed directly.`,
          `${q('✏️ Modifier')} (Edit) › ${q('📋 Étendue des travaux (Scope of work)')} and the client name.`,
          'Checklist section: state of the assembly checklist, « ✍️ Remplir » (Fill in).',
        ]),
        callout('info', `In ${q('📝 Handover Certificate — Champs')}, only <b>Client</b> and <b>Scope of work</b> go into the PDF today. Leave the scope empty for an automatic text.`)
        + callout('warn', 'An inspection point can no longer be deleted or renamed once created: check before creating.')),
      visual: 'Steps + boxes.',
      notes: 'The « Comments / Reservations » field does not work: use the general notes when creating.',
    },
    {
      title: 'Signing on site',
      body: () => cols(
        capture('C-07', 'Open handover sheet, « ✍️ Signatures » section', 'Site Manager box signed, Client box empty', `${FIL.projet}, client ${FIL.client}`),
        steps([
          'In the sheet, ✍️ Signatures section: two boxes, Site Manager and Client.',
          'Each person signs with a finger or the mouse, then « ✅ Valider » (Confirm).',
          'When <b>both</b> signatures are there, the handover becomes « ✅ Signé » (Signed).',
        ]) + callout('warn', 'Signing on site is not blocked by the checklist: check it <b>before</b> asking for the signature.')),
      visual: 'Screenshot + steps.',
      notes: '',
    },
    {
      title: 'Signing remotely: 🔗 the client link',
      body: () => cols(
        win('🔗 Lien de Signature Client', `<div class="m-txt">Envoyez ce lien au client :</div><div class="m-grid2"><span class="m-val">https://…/sign-handover…</span>${btn('📋 Copier')}</div><div class="m-txt">🔒 Lien à usage unique — expire après la première signature</div><div class="m-row right">${btn('Fermer', 'outline')}${btn('📧 Envoyer par email', 'primary')}</div>`),
        steps([
          `Card or sheet › ${q('🔗 Signer')} (Sign).`,
          'Checklist incomplete? VEM blocks it (chapter 10): complete it.',
          `${q('📋 Copier')} (Copy) the link, or ${q('📧 Envoyer par email')} (your mail program opens: type the recipient).`,
          'The client opens the link on a phone or computer, types their name and signs.',
        ]) + callout('info', 'Generating a new link deactivates the old one.')),
      visual: 'Recreated link window + steps.',
      notes: 'The link does not expire over time: it can only be used once.',
    },
    {
      title: 'What the client sees, what happens next',
      body: () => cols(
        ul([
          'Page in French: project info, scope of work, inspected zones, assembly checklist (without the N.A. points).',
          `They type « Votre nom complet » (full name), sign, ${q('✅ Valider la signature')}.`,
        ]),
        ul([
          'The signed PDF is stored in the project Files.',
          'It is e-mailed to the <b>person who created the handover</b> and to the <b>e-mail of the client record</b>.',
          'The handover becomes « ✅ Signé » if the Site Manager has also signed in the sheet.',
        ]) + callout('warn', `The <b>project</b> status does not change: set it yourself to ${q('🧾 Handover OK')}.`)),
      visual: 'Two columns: client side / VEM side.',
      notes: 'Without an e-mail on the client record, the client does not receive the PDF: send it with 📤.',
    },
    {
      title: 'PDF and sending',
      body: () => cols(
        steps([
          `<b>From the open sheet</b> (${q('👁️ Ouvrir')}): ${q('📄 PDF')} → ${q('🇫🇷 Français')} or ${q('🇬🇧 English')}.`,
          `${q('📤 Envoyer')} (Send): language, team, client (ticked by default), manual addresses.`,
        ]),
        callout('warn', 'Use the 📄 PDF <b>of the open sheet</b>. The one on the card in the tab does not work, and the one on the Menu › Handover page produces an old PDF (without signatures).')
        + callout('info', 'Each downloaded PDF is also stored in 📁 Files.')),
      visual: 'Steps + boxes.',
      notes: '',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        'Creating the handover from the global menu instead of the project tab.',
        'Asking for the signature before the checklist is finished.',
        'Relying on the date or e-mail typed at creation (not saved).',
        'Forgetting to set the project to 🧾 Handover OK.',
        'Client record without an e-mail → the client does not receive the signed PDF.',
        'Deleting a handover (🗑️ on the card): permanent, do not do it.',
      ]),
      visual: 'List.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercise — accepting the demo project',
      body: () => cols(steps([
        'Create a handover for the demo project with 3 zones (North façade OK, Stairs Remark, Roof OK).',
        'Enter the scope of work in ✏️ Modifier.',
        'Generate the 🔗 link and note what happens if the checklist is not finished.',
        'Download the PDF in English from the sheet, then set the project to 🧾 Handover OK.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Handover tab of the project.',
        'Checklist finished before signing.',
        'PDF from the open sheet.',
        'Project status: set by hand.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Duration: 10 minutes.',
    },
  ],
};
