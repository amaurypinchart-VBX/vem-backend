import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip, esc } from '../ui.mjs';
import { FIL } from '../fil.mjs';


export const MAIL = 'warehouseviewbox@gmail.com';

// Modèle de mail « NEW » : une ligne par champ que l'IA sait lire (src/services/projectFromEmail.ts).
// Les dates sans heure : VEM ne garde que le jour.
export const MAIL_TEMPLATE_LINES = [
  ['NOM DU PROJET', '[nom court et lisible, ex. « Viewbox Klokgebouw Eindhoven »]', FIL.projet],
  ['N° INTERNE', '[4 chiffres + 4 à 6 lettres + VIE]', FIL.ref],
  ['CLIENT (société finale)', '[nom exact du client, comme dans VEM]', FIL.client],
  ['CONTACT CLIENT', '[prénom nom]', FIL.contact],
  ['E-MAIL DU CONTACT', '[adresse e-mail]', FIL.contactMail],
  ['TÉLÉPHONE DU CONTACT', '[numéro]', FIL.contactTel],
  ['ADRESSE DU SITE', '[rue, numéro, code postal, ville]', FIL.adresse],
  ['VILLE', '[ville du site]', FIL.ville],
  ['INSTALLATION', 'du [JJ/MM/AAAA] au [JJ/MM/AAAA]', 'du 15/03/2027 au 18/03/2027'],
  ['DÉMONTAGE', 'du [JJ/MM/AAAA] au [JJ/MM/AAAA]', 'du 22/03/2027 au 23/03/2027'],
  ['NOMBRE D\'OUVRIERS', '[nombre]', FIL.ouvriers],
  ['DESCRIPTION DU MONTAGE', '[nombre de Viewbox, modules (HVAC…), équipement fourni]', '4 Viewbox 5900 en ligne, 1 module HVAC, mobilier fourni par le client'],
  ['INSTRUCTIONS / LOGISTIQUE', '[transport, accès au site, horaires, disponibilité du client…]', 'Accès camion par la rue arrière, déchargement avant 9 h, client sur place dès le 15/03'],
];
export function mailTemplate(filled) {
  const subject = filled ? `NEW ${FIL.ref}` : 'NEW [N° interne]';
  const lines = MAIL_TEMPLATE_LINES.map(([k, blank, ex]) => `${k} : ${filled ? ex : blank}`);
  return `Objet : ${subject}\n\nBonjour,\n\nMerci de créer le projet suivant dans VEM.\n\n${lines.join('\n')}\n\nPièces jointes : plans, devis, bon de commande…\n\nMerci !`;
}
// Même modèle en anglais (l'IA lit aussi les mails en anglais).
export const MAIL_TEMPLATE_LINES_EN = [
  ['PROJECT NAME', '[short, readable name, e.g. "Viewbox Klokgebouw Eindhoven"]', 'Hospitality Paddock — Demo'],
  ['INTERNAL NUMBER', '[4 digits + 4 to 6 letters + VIE]', FIL.ref],
  ['CLIENT (end customer)', '[exact client name, as in VEM]', FIL.client],
  ['CLIENT CONTACT', '[first name last name]', FIL.contact],
  ['CONTACT E-MAIL', '[e-mail address]', FIL.contactMail],
  ['CONTACT PHONE', '[number]', FIL.contactTel],
  ['SITE ADDRESS', '[street, number, postcode, city]', 'Rue de l\'Exemple 1, 1000 Brussels'],
  ['CITY', '[site city]', 'Brussels'],
  ['INSTALLATION', 'from [DD/MM/YYYY] to [DD/MM/YYYY]', 'from 15/03/2027 to 18/03/2027'],
  ['DISMANTLING', 'from [DD/MM/YYYY] to [DD/MM/YYYY]', 'from 22/03/2027 to 23/03/2027'],
  ['NUMBER OF WORKERS', '[number]', FIL.ouvriers],
  ['SCOPE OF WORK', '[number of Viewbox, modules (HVAC…), equipment supplied]', '4 Viewbox 5900 in a row, 1 HVAC module, furniture supplied by the client'],
  ['INSTRUCTIONS / LOGISTICS', '[transport, site access, working hours, client availability…]', 'Truck access via the back street, unloading before 9 am, client on site from 15/03'],
];
export function mailTemplateEn(filled) {
  const subject = filled ? `NEW ${FIL.ref}` : 'NEW [internal number]';
  const lines = MAIL_TEMPLATE_LINES_EN.map(([k, blank, ex]) => `${k}: ${filled ? ex : blank}`);
  return `Subject: ${subject}\n\nHello,\n\nPlease create the following project in VEM.\n\n${lines.join('\n')}\n\nAttachments: drawings, quote, purchase order…\n\nThank you!`;
}
const tplBox = (filled, en) => `<div class="mailtpl"><button class="mailtpl-copy" data-copy data-label="${en ? '📋 Copy' : '📋 Copier'}" data-done="${en ? '✅ Copied' : '✅ Copié'}">${en ? '📋 Copy' : '📋 Copier'}</button><pre>${esc(en ? mailTemplateEn(filled) : mailTemplate(filled))}</pre></div>`;


export default {
  key: 'projet-mail', num: 3, icon: '🆕', title: 'Create a project by email (NEW)',
  public: 'Sales, Customer Service, Project Managers', duree: '25 min', parcours: 'Core track',
  slides: [
    {
      kind: 'rule', title: 'The email rule',
      body: () => `<div class="rule">
        <div class="rule-addr">📧 ${MAIL}</div>
        <div class="rule-grid">
          <div class="rule-card new"><div class="rk">CREATE a project</div><div class="rs">Subject that <b>starts with</b><br><code>NEW ${FIL.ref}</code></div><div class="rd">→ new draft project, filled in by the AI</div></div>
          <div class="rule-card add"><div class="rk">ADD TO a project</div><div class="rs">The <b>internal number</b> anywhere in the subject<br><code>Plans ${FIL.ref}</code></div><div class="rd">→ attachments in Files + draft bookings</div></div>
        </div>
        <div class="rule-foot">⏱ Checked every <b>5 minutes</b> · only <b>unread</b> emails are processed · no message if something fails</div></div>`,
      visual: '"Poster" slide: address in very large type, two cards CREATE / ADD TO, timing banner.',
      notes: 'This is THE slide to remember. It also exists as a printable memo sheet at the end of the deck.',
    },
    {
      title: 'Goal & when to use it',
      body: () => cols(
        ul([
          '<b>Goal</b>: turn an order or confirmation email into a VEM project without retyping everything.',
          '<b>When</b>: a new confirmed project arrives by email (client, Sales, partner).',
          `<b>How</b>: forward the email to <b>${MAIL}</b> with a subject that <b>starts</b> with <code>NEW</code> followed by the internal number.`,
        ]),
        callout('warn', '<b>Delete the "TR:" or "Fwd:"</b> your mail program adds when forwarding: the subject must <b>start</b> with NEW (upper or lower case, it doesn\'t matter).')),
      visual: 'Goal + "TR: / Fwd:" box.',
      notes: 'With "TR: NEW …", VEM does not see NEW at the start: it looks for an existing project, finds none, and the email is ignored without any message.',
    },
    {
      title: 'What the AI reads in the email',
      body: () => cols(
        table(['Information', 'Goes into'], [
          ['Project name', L('Nom *')], ['Internal number (otherwise: the text after NEW)', L('N° Interne')],
          ['End client, contact, e-mail, phone', 'Client record (found or created)'],
          ['Site address and city', L('Adresse *')], ['Installation and dismantling dates', 'Project dates'],
          ['Number of workers', L('Ouvriers')], ['Summary of the job (number of Viewbox, modules…)', L('Description / Instructions spéciales')],
          ['Attachments', L('📁 Fichiers')],
        ], { small: true }),
        callout('info', 'The AI reads the subject and the <b>beginning of the text</b> of the email (about 8,000 characters). It is instructed never to invent a date.')
        + callout('warn', 'It creates <b>no trucks, no hotels, no trips</b>, and does <b>not fill in the notes</b> (global, installation, dismantling).')),
      visual: 'Information → field table + two boxes.',
      notes: 'Internal number: if the AI finds none in the email, VEM takes the text after NEW if it is at most 24 characters with no space. Hence NEW + the reference alone.',
    },
    {
      key: 'modele-mail', title: 'Email template to copy',
      body: () => cols(tplBox(false, true),
        callout('ok', 'Copy this template, replace every <b>[…]</b> and delete the lines you don\'t know. One piece of information per line: the AI always finds it.')
        + callout('warn', '<b>Dates with the year</b> (DD/MM/YYYY). Without a date, installation is set to today. Times are not kept.')
        + callout('tip', '<b>Client</b>: write the name exactly as in VEM, otherwise a new (duplicate) client is created.'), '1.35fr 1fr'),
      visual: 'Blank email template with a Copy button, three tip boxes.',
      notes: 'The template can also be pasted at the top of a forwarded order email: the AI reads the whole text (about 8,000 characters). Empty or missing lines are simply ignored.',
    },
    {
      key: 'modele-mail-exemple', title: 'Same template, filled in',
      body: () => cols(tplBox(true, true),
        table(['Email line', 'In VEM'], [
          ['PROJECT NAME', L('Nom *')], ['INTERNAL NUMBER', L('N° Interne')],
          ['CLIENT, CONTACT, E-MAIL, PHONE', 'Client record'], ['SITE ADDRESS, CITY', L('Adresse *')],
          ['INSTALLATION, DISMANTLING', 'Project dates'], ['NUMBER OF WORKERS', L('Ouvriers')],
          ['SCOPE, INSTRUCTIONS', L('Description / Instructions spéciales')], ['Attachments', L('📁 Fichiers')],
        ], { small: true }), '1.35fr 1fr'),
      visual: 'Template filled in with the demo project + email line → field table (VEM labels in French).',
      notes: 'Fictitious example (demo project). Do not send it: every NEW email creates a real project.',
    },
    {
      key: 'mail-template-fr', title: 'Email template (French)',
      body: () => cols(tplBox(false, false),
        callout('info', 'Both languages work: the AI reads emails in French, English or Dutch. Use the French version when writing to French-speaking colleagues.')
        + callout('warn', 'The subject always starts with <code>NEW</code>, in any language.')),
      visual: 'French blank template with a Copier button.',
      notes: 'Same lines as the English template, in French.',
    },
    {
      key: 'mail-template-fr-example', title: 'Same template, filled in (French)',
      body: () => cols(tplBox(true, false),
        callout('info', 'Same demo project as the English example: the result in VEM is identical.')),
      visual: 'French template filled in with the demo project.',
      notes: 'Fictitious example. Do not send it: every NEW email creates a real project.',
    },
    {
      title: 'Subject examples',
      body: () => table(['Subject', '', 'Result'], [
        [`<code>NEW ${FIL.ref}</code>`, '✅', 'Project created, internal number = ' + FIL.ref],
        [`<code>new ${FIL.ref}</code>`, '✅', 'Upper or lower case: same thing'],
        [`<code>NEW: ${FIL.ref}</code> · <code>NEW - ${FIL.ref}</code>`, '✅', 'Separator accepted'],
        [`<code>TR: NEW ${FIL.ref}</code>`, '❌', 'Does not start with NEW → ignored'],
        [`<code>NEW Paddock demo Brussels</code>`, '⚠️', 'Created, but with a made-up internal number (VEM-year-xxxx) if the email contains none'],
        [`<code>NEW ${FIL.ref}</code> (already exists)`, '❌', 'Nothing is created (duplicate protection), no message'],
      ]),
      visual: '✅ / ❌ table of subjects.',
      notes: 'Remind everyone that the email must arrive UNREAD in the mailbox: nobody should open it in Gmail before it is picked up.',
    },
    {
      title: 'What happens next',
      body: () => cols(
        steps([
          'Within 5 minutes, VEM checks the mailbox.',
          `The project is created as ${q('📄 Brouillon')} (draft).`,
          `Client unknown or missing from the email: linked to ${q('⚠️ Client à confirmer')} (client to confirm), or to a new client created with the name found.`,
          'All attachments go into Files.',
          `Admins and Project Managers receive the notification ${q('🆕 Projet créé depuis un email')} ("… À vérifier." = to check).`,
        ]),
        win('🆕 Projet créé depuis un email', `<div class="m-txt">${FIL.projet} (${FIL.ref}) · client : ${FIL.client} · 2 fichier(s). À vérifier.</div>`, { sub: '🔔 Notifications' })
        + callout('info', 'The project instructions start with "📧 Projet créé automatiquement depuis un mail de …" (created automatically from an email from …).')),
      visual: 'Steps on the left, notification mock-up on the right.',
      notes: 'Notifications are in Admin › 🔔 Notifications; clicking a notification marks it as read but does not open the project.',
    },
    {
      title: 'Check the created project (mandatory)',
      body: () => cols(
        steps([
          `${q('🏗️ Projets')} › search for the internal number › open the project.`,
          `${q('✏️ Modifier')} (Edit) and check: name, client, internal number, address, <b>dates</b>.`,
          `Client = ${q('⚠️ Client à confirmer')}? Choose the right client (or create it with ${q('+ Client')}).`,
          'Add the 3 additional notes.',
          `${q('💾 Enregistrer les modifications')} (Save changes), then choose the status.`,
        ]),
        callout('warn', '<b>With no date in the email</b>, VEM sets the installation to <b>today</b>. That is the first thing to fix.')
        + callout('tip', 'Then: team, logistics, bookings — just like for a project created by hand.')),
      visual: 'Verification checklist + boxes.',
      notes: 'A project created by email is never "finished": it is a draft to complete.',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        '<b>"TR:" / "Fwd:"</b> left in front of NEW → no project.',
        '<b>Email opened in Gmail</b> before it was picked up → no longer "unread": never processed.',
        '<b>Internal number already exists</b> → nothing is created, no message. For an existing project, do not use NEW (chapter 4).',
        '<b>Subject starting with "New…"</b> (e.g. "Newsletter") sent to this address → a project would be created: send only project emails to this mailbox.',
        '<b>No check</b> → today\'s dates, client to confirm, duplicate client.',
        'Logos and signatures in the email also land in Files: delete them if needed (chapter 9).',
      ]),
      visual: 'List of mistakes.',
      notes: 'If nothing shows up after 10 minutes: see the FAQ in the last chapter.',
    },
    {
      kind: 'exercise', title: 'Exercise — a project by email',
      body: () => cols(steps([
        `Write (without sending it) the subject that creates the demo project: <code>NEW ${FIL.ref}</code>.`,
        'In the text, give the client, address, installation and dismantling dates, number of Viewbox.',
        'Name the 5 points to check once the project is created.',
        'Bonus: what happens if you send "TR: NEW …"?',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        `Address: ${MAIL}`,
        'Subject STARTS with NEW + internal number.',
        'Result = draft to check (dates!).',
        'No bookings, no notes: complete them yourself.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Do not do the exercise for real during the session: every NEW email creates a real project.',
    },
  ],
};
