import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'rapport', num: 14, icon: '📊', title: 'The AI Report',
  public: 'Project & Technical Managers', duree: '20 min', parcours: 'Office',
  slides: [
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: a complete project report or a presentation for the client, with a summary written by the AI.',
          '<b>For whom</b>: Project and Technical Managers.',
        ]) + path(['🏗️ Projets', '~project', '📊 Rapport IA']),
        table(['Type', 'Difference'], [
          [L('Rapport complet') + ' (full report)', 'All ticked sections'],
          [L('Présentation client') + ' (client presentation)', 'Without the daily reports or assignments (same layout)'],
        ], { small: true })),
      visual: 'Goal + path + table of the 2 types.',
      notes: 'In Client presentation, the e-mails and phone numbers of the team and the driver remain visible if their section is ticked.',
    },
    {
      title: 'Choosing the sections',
      body: () => table(['Section', 'Default', 'Content'], [
        [L('Vue d\'ensemble'), '☑', 'Dates, client, team, additional notes'],
        [L('Résumé IA'), '☑', 'Summary written by the AI (status, strengths, risks, next steps)'],
        [L('Tâches'), '☑', '<b>Untick it</b>: tasks are no longer used'],
        [L('Daily Reports'), '☑', 'The last 7 reports'],
        [L('Temps par tâche'), '☐', 'Hours × people entered in the daily reports'],
        [L('Handover'), '☐', 'Zones and acceptance status'],
        [`${L('Logistique')} · ${L('Bookings')}`, '☐', 'Vehicles, transport, hotels'],
        [L('Fichiers projet'), '☐', 'Project photos and PDFs'],
        [L('Commentaire'), '☐', 'Your free text (« 💬 Commentaire personnalisé » box)'],
      ], { small: true }) + callout('warn', `Do not tick ${q('Tickets SAV')} or ${q('Visites client')}: these modules are no longer used.`),
      visual: 'Recreated section grid as a table.',
      notes: 'Languages: Français, English, Nederlands (partial translation in EN / NL).',
    },
    {
      title: 'Preview, generate the PDF',
      body: () => cols(
        steps([
          'Choose the language: Français, English or Nederlands.',
          `${q('👁️ Prévisualiser')} (Preview): the report opens in a new tab.`,
          `${q('📄 Générer PDF')}: same thing, then the print window opens → choose <b>« Save as PDF »</b>.`,
        ]),
        callout('info', 'Each generation (preview included) also stores a PDF in 📁 Files.')
        + callout('warn', 'The browser blocks the tab? Allow pop-up windows for VEM.')),
      visual: 'Steps + boxes.',
      notes: 'Allow up to one minute with the AI summary.',
    },
    {
      title: 'Time per task',
      body: () => cols(
        steps([
          `Tick ${q('Temps par tâche')} (time per task) › ${q('🤖 Lancer / relancer l\'analyse')}.`,
          'The figures come from the « ⏱️ Heures par tâche » lines of the daily reports.',
          'You can correct or remove a line for this report only.',
        ]),
        callout('info', 'The figures are exact (no calculation by the AI); the AI only writes a short summary.')
        + callout('warn', 'Nothing entered in the daily reports → « Aucune heure saisie » (no hours entered).')),
      visual: 'Steps + boxes.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercise — demo project report',
      body: () => cols(steps([
        'Open 📊 Rapport IA on the demo project.',
        'Untick Tâches, tick Logistique and Bookings.',
        'Add a comment and preview in English.',
        'Generate the PDF as Présentation client.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Notes and daily reports = report content.',
        'Untick Tâches.',
        'PDF = « Save as PDF ».',
        'A copy goes to Files.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: '',
    },
  ],
};
