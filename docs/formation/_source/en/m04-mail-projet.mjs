import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';
import { MAIL } from './m03-mail-new.mjs';

export default {
  key: 'mail-projet', num: 4, icon: '📧', title: 'Add to a project by email',
  public: 'Everyone (office and site)', duree: '25 min', parcours: 'Core track',
  slides: [
    {
      title: 'Goal & where to find the address',
      body: () => cols(
        ul([
          '<b>Goal</b>: send drawings, photos, 3D files, truck or hotel confirmations into the right project, from any mail program.',
          '<b>Who</b>: everyone, in the office and on site.',
          `<b>Rule</b>: an email to <b>${MAIL}</b> with the project\'s <b>internal number</b> <b>anywhere</b> in the subject.`,
        ]),
        `<div class="m-mailbox"><div class="mb-t">📧 ${L('Envoyer des fichiers par email')}</div><div>Mail à <b>${MAIL}</b> avec <b>${FIL.ref}</b> dans le sujet</div><div class="mb-s">${L('⏱ Les fichiers apparaîtront dans les 5 minutes')}</div>${btn('📋 Copier')}</div>`
        + `<div class="cap-note">Box shown in the ${L('📋 Infos')} tab › ${L('📁 Fichiers')} block. ${q('📋 Copier')} (Copy) copies the address, the subject and a reminder line.</div>`),
      visual: 'Goal on the left, orange box "Envoyer des fichiers par email" recreated on the right.',
      notes: 'The Copy button pastes: "À: … / Sujet: <internal number> / (Joindre les fichiers à envoyer dans le projet …)".',
    },
    {
      title: 'What arrives in the project',
      body: () => `<div class="feeds">${[
        ['📎 Attachments', `All added to ${L('📁 Fichiers')} (photos, PDF, Office, 3D…)`],
        ['🚛 Trucks / machines', `Created in ${L('🚛 Logistique')} as drafts`],
        ['🏨 Hotels', `Created in ${L('✈️ Bookings')}, with no occupant`],
        ['✈️ Team trips', `Created in ${L('✈️ Bookings')} if the person is already in the project team`],
        ['🔔 Notification', `${L('🚛 Réservations créées depuis un email')} for admins and Project Managers`],
        ['❌ Project notes', 'The email text is <b>not</b> added to the notes'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`
        + callout('info', 'The AI reads bookings in the <b>text</b> of the email. Each one carries the note "📧 Créé auto depuis mail — à valider" (created from email — to validate).'),
      visual: 'Email in the centre with arrows to Files, Logistics, Bookings, Notifications.',
      notes: 'If you have important information for the notes (access instructions, times), add it yourself in ✏️ Modifier.',
    },
    {
      title: 'Subject examples',
      body: () => table(['Subject', '', 'Result'], [
        [`<code>${FIL.ref}</code>`, '✅', 'Attachments → Files'],
        [`<code>Facade drawings ${FIL.ref} v2</code>`, '✅', 'The number can be in the middle'],
        [`<code>TR: Truck confirmation ${FIL.ref}</code>`, '✅', 'Truck read from the text, created as a draft'],
        [`<code>Site photos Paddock</code>`, '❌', 'No internal number → email ignored, no message'],
        [`<code>Photos 9999DEMOVI</code>`, '❌', 'Number incomplete or mistyped → ignored'],
        [`<code>NEW ${FIL.ref}</code>`, '❌', 'NEW = creation: the project already exists → nothing'],
      ]),
      visual: '✅ / ❌ table.',
      notes: 'If the subject contains several internal numbers, the longest one wins: one number per subject is safer.',
    },
    {
      title: 'Validate a truck created by email',
      body: () => cols(
        steps([
          `${q('🚛 Logistique')} tab: the vehicle has the grey "draft" badge.`,
          'Click ✏️ on the card.',
          `Check type, plates, driver, places and dates. ${q('État du véhicule')} (vehicle status) switches to ${q('🟣 Planifié')} (planned).`,
          'Delete the "à valider" (to validate) mention in the notes.',
          `${q('💾 Enregistrer')} (Save) → the vehicle is validated.`,
        ]),
        callout('info', 'There is no "Validate" button: saving the record is enough.')
        + callout('tip', 'Loading or unloading place in Tubize? The warehouse is notified automatically on validation (status change).')),
      visual: 'Steps + boxes.',
      notes: 'Even before validation, a draft truck already shows on the calendar and the public planning.',
    },
    {
      title: 'Validate a hotel or a trip created by email',
      body: () => cols(
        `<div class="sub-t">🏨 Hotel</div>` + steps([
          `${q('✈️ Bookings')} tab: hotel card with ${q('👥 Occupants')} empty.`,
          '✏️ › tick <b>at least one occupant</b> (required to save).',
          'Check dates and reference, delete "à valider".',
          `${q('💾 Enregistrer')}.`,
        ]),
        `<div class="sub-t">✈️ Trip</div>` + steps([
          'Transport card: the mode shows ❔.',
          '✏️ › <b>choose the means of transport again</b> for outbound and return (otherwise it is cleared).',
          'Check the on-site dates.',
          `${q('💾 Enregistrer')}.`,
        ]) + callout('warn', 'The trip is only created if the person named is <b>already</b> in the 👥 Équipe tab. Add the team <b>before</b> sending the travel confirmations.')),
      visual: 'Two columns Hotel / Trip.',
      notes: 'Hotels created by email have no occupant: the AI does not link them to people.',
    },
    {
      title: 'Timing and "nothing arrived"',
      body: () => cols(
        steps([
          'Wait <b>5 to 10 minutes</b>, then reload the project page.',
          'Check the subject: is the internal number complete and correct?',
          'Did someone open the email in the Gmail mailbox? An email already read is never processed.',
          'Still nothing: send the email again with the right subject, or add the files by hand (⬆️ Ajouter).',
        ]),
        callout('warn', 'VEM <b>never</b> replies to the sender: no acknowledgement, no error message.')
        + callout('info', 'A very large file (above about 10 MB) may be refused: use the 🔗 URL link (chapter 9).')),
      visual: 'Troubleshooting procedure + boxes.',
      notes: 'Emails without a subject are ignored.',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        'Forgetting the internal number in the subject → email lost.',
        'Using NEW for an existing project → nothing.',
        'Putting an important instruction in the email and thinking it is in the notes → it is not.',
        'Sending train tickets before adding the person to the team → trip ignored.',
        'Forgetting to validate the drafts → trucks and hotels left "à valider".',
        'Logos and signatures in the email arrive as photos: clean up Files.',
      ]),
      visual: 'List.',
      notes: 'Reminder: one email = one project. Do not mix two projects in the same email.',
    },
    {
      kind: 'exercise', title: 'Exercise — add to the demo project',
      body: () => cols(steps([
        `Copy the instructions with ${q('📋 Copier')} in the Infos tab of the demo project.`,
        `Write the subject of an email that sends the PDF drawing to project <code>${FIL.ref}</code>.`,
        `Write the text of a confirmation email: truck ${FIL.camion}, driver ${FIL.chauffeur}, loading at the Tubize warehouse on 14/03/2027 at 2 pm.`,
        'List the steps to validate this truck once it is created.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Internal number in the subject, anywhere.',
        'Attachments → Files; text → draft bookings.',
        'Validate = open ✏️ and save.',
        'Nothing in the notes.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'If you do the exercise for real, use a test project.',
    },
  ],
};
