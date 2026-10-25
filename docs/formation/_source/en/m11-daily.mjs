import { q, L, btn, tabs, field, win, steps, callout, capture, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'daily', num: 11, icon: '📓', title: 'Daily Reports',
  public: 'Site Managers (on a phone)', duree: '35 min', parcours: 'Field',
  slides: [
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: one report per site day: what was done, by how many people, with photos.',
          '<b>For whom</b>: Site Managers (and an installer who was given the 📓 Daily reports right, chapter 6).',
        ]) + path(['🏗️ Projets', '~project', '📓 Daily Reports', '+ Nouveau Rapport'])
        + path(['~Phone: ＋ button', '📓 Daily Report']),
        callout('tip', 'Open the project first: it will be preselected in the report.')),
      visual: 'Goal + 2 paths.',
      notes: 'The Menu › 📓 Daily Reports page shows the reports of all projects.',
    },
    {
      title: 'General information',
      body: () => cols(
        win('📓 Rapport Journalier',
          `<div class="m-grid2">${field('Projet *', `${FIL.projet} (${FIL.ref})`)}${field('Date *', '15/03/2027')}</div>`
          + `<div class="m-grid2">${field('Météo', '☀️ Ensoleillé')}${field('Ouvriers présents', FIL.ouvriers)}</div>`
          + `<div class="m-txt"><b>${L('⏱️ Heures par tâche')}</b> : ◉ ${L('🏗️ Installation')} ○ ${L('🔨 Démontage')}</div>`
          + `<div class="m-grid3"><span class="m-val">Placing Facade elements</span><span class="m-val">6 h</span><span class="m-val">4 hommes</span></div>`, { sub: 'Journal de chantier complet' }),
        steps([
          `${q('Projet *')} (Project) and ${q('Date *')} (today by default).`,
          `${q('Météo')} (Weather) and ${q('Ouvriers présents')} (Workers present).`,
          `${q('⏱️ Heures par tâche')} (Hours per task): choose Installation or Dismantling, then hours and number of people per task.`,
          'A task is missing? « Ajouter une autre tâche... » (Add another task) + « + Ajouter ».',
        ]) + callout('info', 'Hours per task feed the « Time per task » analysis of the AI Report.')),
      visual: 'Mock-up of the top of the window + steps.',
      notes: 'Hours per task do not appear in the daily PDF.',
    },
    {
      title: 'The log: 3 ways to write it',
      body: () => tabs(['✏️ Saisie entrée par entrée', '📋 Import texte libre (IA)', '🎙️ Dictée vocale'])
        + table(['Mode', 'How', 'Best for'], [
          [L('✏️ Saisie entrée par entrée') + ' (entry by entry)', 'Time + « Décrivez ce qui a été fait... » (describe what was done) + « + Ajouter ». The time moves on by 30 min.', 'Writing as the day goes'],
          [L('📋 Import texte libre (IA)') + ' (free text)', `Paste your notes, ${L('🤖 Analyser avec l\'IA → Extraire les entrées')}, check, ${L('✅ Valider et ajouter au journal')}.`, 'Notes taken on the phone or on WhatsApp'],
          [L('🎙️ Dictée vocale') + ' (voice)', `${L('🎙️ Démarrer la dictée')}, speak, then ${L('🤖 Analyser avec l\'IA')}; or ${L('🎵 Choisir un fichier audio')} (50 MB max).`, 'End of day, hands busy'],
        ], { small: true }) + callout('info', 'The AI splits the text into time-stamped entries (without inventing times) and returns the text in French. Always read it again before validating.'),
      visual: 'Recreated tabs + table of the 3 modes.',
      notes: 'Voice dictation works in French, preferably with Chrome.',
    },
    {
      title: 'Notes, photos and attachments',
      body: () => cols(
        steps([
          `${q('Notes générales / Résumé')} (general notes): incidents, important points.`,
          `${q('📸 Prendre / Ajouter photos')}: select <b>all photos at once</b>.`,
          `${q('📎 Pièces jointes')} (attachments): tick the checklist to attach (current state), add PDF / photos / Word / Excel (10 MB max per file).`,
        ]),
        callout('warn', 'On a phone, a new photo selection <b>replaces</b> the previous one. Pick them all together, or add more later when editing.')
        + callout('info', 'Attached PDFs and photos are added, readable, at the end of the report PDF. Word / Excel stay as links.')),
      visual: 'Steps + boxes.',
      notes: 'Do not fill in « ✅ Avancement tâches »: tasks are no longer used.',
    },
    {
      title: 'Save or send',
      body: () => cols(
        `<div class="m-row">${btn('Annuler', 'outline')}${btn('💾 Sauvegarder', 'primary')}${btn('📤 Sauv. & Envoyer', 'green')}</div>`
        + win('📤 Envoyer le rapport', `<div class="m-txt">${L('🌐 Langue du PDF')} : 🇫🇷 Français · 🇬🇧 English</div><div class="m-txt">${L('👥 Équipe')} : ☐ ☐ ☐</div><div class="m-txt">${L('🤝 Client')} : ☑ <b>ticked by default</b></div><div class="m-txt">${L('✉️ Adresses manuelles')}</div><div class="m-row right">${btn('📤 Envoyer', 'primary')}</div>`),
        ul([
          `${q('💾 Sauvegarder')} (Save): the report is saved, nothing is sent.`,
          `${q('📤 Sauv. & Envoyer')} (Save & Send): saves, then opens the sending window.`,
          'The PDF is sent as an attachment, in the chosen language.',
        ]) + callout('warn', `The <b>client is ticked by default</b>. Untick it if the report is internal. After sending, the ${q('📤 Envoyer')} button disappears: it cannot be sent again.`)),
      visual: 'Buttons + recreated sending window.',
      notes: 'The Team list contains every VEM user, not only the project team.',
    },
    {
      title: 'Review, edit, PDF',
      body: () => cols(
        steps([
          'Project tab 📓 Daily Reports: 👁️ read, ✏️ edit, 📄 PDF.',
          `When editing: ${q('🤖 Assistant IA')} adds entries from a new text or audio (nothing is replaced).`,
          'Photo caption: ✏️ on the photo.',
          `📄 PDF: choose ${q('🇫🇷 Français')} or ${q('🇬🇧 English')} (texts translated automatically).`,
        ]),
        callout('warn', `When editing, the weather ${q('🌩️ Orage')} (Storm) is not offered: an edited « Orage » report goes back to Sunny. Deleting <b>all</b> entries is not saved.`)
        + callout('no', 'Do not delete a report: correct it.')),
      visual: 'Steps + boxes.',
      notes: 'The PDF contains the client contact block: keep it in mind before sending it to a third party.',
    },
    {
      title: 'What it is used for afterwards',
      body: () => `<div class="feeds">${[
        ['📊 AI Report', 'Daily Reports section (last 7) + « Time per task »'],
        ['🧾 Handover', 'The site history in case of a discussion with the client'],
        ['📧 Client', 'The PDF sent every day'],
        ['📁 Files', 'Generated PDFs are stored there'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Arrows.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercise — the daily of 15/03',
      body: () => cols(steps([
        `Create the daily of the demo project for 15/03/2027: sunny, ${FIL.ouvriers} workers.`,
        'Dictate or paste: « 7:45 arrival, 9:15 crane, assembly of the first 3 boxes, 12:00 break ».',
        'Add 2 photos (in a single selection) and attach the assembly checklist.',
        'Save without sending, then download the PDF in English.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'One daily per day, with photos.',
        'The AI structures, you review.',
        'Client ticked by default when sending.',
        'No resending after sending.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Duration: 10 minutes.',
    },
  ],
};
