import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'checklist', num: 10, icon: '☑️', title: 'The assembly checklist (to-do list)',
  public: 'Technical & Project Managers (set up), Site Managers (fill in), installers (view)', duree: '40 min', parcours: 'Field',
  slides: [
    {
      title: 'Goal: the site to-do list',
      body: () => cols(
        ul([
          '<b>Goal</b>: check every point of the assembly, with photos and comments, day by day.',
          'It <b>replaces the tasks</b>.',
          'It feeds the project <b>progress</b>, the <b>daily report</b> and the <b>handover</b> (PDF and the client\'s signature page).',
        ]),
        table(['Who', 'Does what'], [
          ['Technical / Project Manager, admin', 'Sets up the project checklist'],
          ['Site Manager', 'Fills it in (on their projects)'],
          ['Installer', 'Views it (on their projects)'],
        ], { small: true })),
      visual: 'Goal + table of roles.',
      notes: 'A Site Manager or an installer must be in the project\'s 👥 Équipe tab to see the project and its checklist.',
    },
    {
      title: 'Where to find it: 3 phases',
      body: () => table(['Phase', 'Where', 'When'], [
        [L('📋 Préparation'), `${L('📋 Infos')} tab, at the top`, 'Before the assembly (site acceptance)'],
        [L('🏗️ Installation'), `${L('📓 Daily Reports')} tab, at the top`, 'During the assembly, day after day'],
        [L('🔨 Démontage'), `${L('📓 Daily Reports')} tab, at the top`, 'During the dismantling'],
      ]) + callout('info', `The ${q('🧾 Handover')} tab only shows a <b>reminder</b> of the state of the assembly checklist.`)
        + capture('C-04', '📓 Daily Reports tab of a project', '« ☑️ Check-list de montage » card set up, half filled in', `${FIL.ref}, 20/48 OK`),
      visual: 'Table of the 3 phases + screenshot of the checklist card.',
      notes: 'On the card: progress bar, ✅ 🟠 ❌ ➖ ⏳ counters, critical alerts and missing photos.',
    },
    {
      title: 'Set up a project checklist',
      body: () => cols(
        steps([
          `On the phase card: ${q('⚙️ Configurer la check-list')}.`,
          'Viewbox type: ⛺ Éphémère (temporary) or 🏠 Permanente.',
          'Tick / untick the useful points (pre-ticked by default).',
          `Add site-specific points: ${q('+ Point spécifique au projet')} (photo required, critical).`,
          `${q('💾 Enregistrer')}.`,
        ]),
        callout('info', 'The points are <b>copied</b> into the project: changing the library afterwards does not change a checklist already set up.')
        + callout('warn', 'Removing a point already filled in also deletes its photos and history: VEM asks for confirmation.')),
      visual: 'Steps + callouts.',
      notes: 'Roles: admin, Technical Manager, Project Manager. Without set-up, the card shows « Pas encore configurée — le Technical Manager la prépare. »',
    },
    {
      title: 'The 5 statuses of a point',
      body: () => `<div class="statuses">${[
        ['⏳ À vérifier', 'Not checked yet (start)', 'grey'],
        ['✅ OK', 'Compliant. Photo required if the point is 📷', 'green'],
        ['🟠 Partiel', 'Partial — comment required', 'amber'],
        ['❌ Non fait', 'Not done — comment required', 'red'],
        ['➖ N.A.', 'Not applicable — comment required', 'blue'],
      ].map(([s, d, c]) => `<div class="st c-${c}"><div class="sn">${L(s)}</div><div class="sd">${d}</div></div>`).join('')}</div>`
        + cols(callout('warn', '⚠️ <b>Critical point</b>: it must be OK or N.A. before the handover signature link can be generated.'),
          callout('info', '📷 <b>Photo required</b>: OK is refused without a photo. A PDF document does not count as a photo.')),
      visual: '5 coloured status cards + rules.',
      notes: 'Every status change is logged (who, when, comment).',
    },
    {
      title: 'Fill in with ☰ Liste (list mode)',
      body: () => cols(
        steps([
          `${q('☰ Liste')} on the card.`,
          `Filter ${q('À traiter')} (to do, default), ${q('Problèmes')} (problems) or ${q('Tout')} (all).`,
          'On each row: ✓ OK · ½ Partial · ✕ Not done · N/A.',
          'The ＋ panel: comment (🎙️ dictation), 📸 Photo, 🖼️ Gallery, 📎 Document, history.',
          'The comment saves itself after a few seconds.',
        ]),
        capture('C-05', 'Checklist in list mode on a phone', 'a « Partiel » point with the panel open (comment + photo)', `${FIL.ref}`)),
      visual: 'Steps + mobile screenshot.',
      notes: 'With a weak network: « Non enregistré (réseau) » + « ↻ Réessayer » (retry).',
    },
    {
      title: 'Fill in with 🃏 Diaporama (card mode)',
      body: () => cols(
        ul([
          `${q('🃏 Remplir en diaporama')}: one card per point, like cards you swipe.`,
          '<b>Swipe right = OK</b>, <b>left = Not done</b>.',
          `Buttons: ↶ Back · ✕ NO · ½ PARTIAL · N/A · ✓ OK · ${q('⏭ Passer')} (skip).`,
          `If a comment or a photo is missing, the card stays: complete it then ${q('Enregistrer et suivant →')} (save and next).`,
          'On a computer: → OK, ← Not done, P Partial, A N/A.',
        ]),
        callout('tip', 'The chosen mode (list or card) is remembered on your device.')
        + capture('C-06', 'Checklist in card mode on a phone', 'a « photo required » card in the centre, progress bar at the top', `${FIL.ref}`)),
      visual: 'List + screenshot.',
      notes: 'End screen: progress ring, counters, « ▶ Continuer », validation.',
    },
    {
      title: 'Validate, export, attach to the daily report',
      body: () => cols(
        steps([
          `When no point is « À vérifier » any more: ${q('✅ Valider la check-list')}.`,
          `${q('📄 PDF / Envoyer')}: PDF in French or English, ${q('⬇️ Télécharger le PDF')}.`,
          `Send by e-mail: tick the recipients, then ${q('✉️ Envoyer le PDF')}.`,
          `${q('📓 Joindre à un daily report')}: to an existing report or a new report for today.`,
        ]),
        callout('info', 'The checklist attached to the daily report is a <b>snapshot of the current state</b>: ↻ Actualiser in the daily report to update it.')
        + callout('warn', 'Setting a point back to « À vérifier » or adding points cancels the validation.')),
      visual: 'Steps + callouts.',
      notes: 'No recipient is ticked by default when sending the checklist.',
    },
    {
      title: 'Link with the handover signature',
      body: () => cols(
        win('⚠️ Check-list de montage incomplète', `<div class="m-txt">2 point(s) critique(s) non validé(s)<br>⏳ 5 point(s) encore « À vérifier »</div><div class="m-txt">Complète la check-list avant de faire signer le client.</div><div class="m-row right">${btn('Annuler', 'outline')}${btn('☑️ Ouvrir la check-list', 'primary')}</div>`),
        ul([
          'The client signature link is <b>blocked</b> while critical points are not OK / N.A. or points are still « À vérifier » (assembly checklist).',
          'Only an admin or a Technical Manager can « Générer quand même » (generate anyway).',
          'The client sees the checklist (without the N.A. points) on their signature page and in the PDF.',
        ])),
      visual: 'Blocking window recreated + rules.',
      notes: 'Non-critical Partial or Not done points do not block.',
    },
    {
      title: 'The library (Templates check-list)',
      body: () => cols(
        ul([
          `${q('☑️ Templates check-list')} menu: the Viewbox checkpoints per phase (categories, points).`,
          `Empty library: ${q('📥 Charger la bibliothèque Viewbox')} (116 points).`,
          'Per point: 📷 photo required, ⚠️ critical, « if present », permanent only, active.',
          'Editable by admins, Technical and Project Managers; read-only for others.',
        ]),
        callout('info', 'Changing the library only affects the <b>next</b> set-ups, never a project already set up.')),
      visual: 'List + callout.',
      notes: 'For the people who prepare the sites.',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        'Checklist not set up → no follow-up, no progress.',
        'Site Manager not in the project team → they don\'t see the checklist.',
        'Ticking everything « OK » at the end of the job without photos → refused on 📷 points, and worthless for the client.',
        'N.A. without explanation → refused (comment required).',
        'Closing with unsaved points → VEM warns you: read the message.',
        'Two people fill it in at the same time → reopen to see the other person\'s changes.',
      ]),
      visual: 'List.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercise — the demo project checklist',
      body: () => cols(steps([
        'Set up the assembly checklist of the demo project (Éphémère).',
        'Add a specific point « Client stair checked » with photo required.',
        'Fill in 5 points in card mode, including one Partial with a comment.',
        'Attach the checklist to today\'s daily report.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Set up → fill in day by day → validate.',
        'Comment for Partial / Not done / N.A.',
        'Photo for 📷 points.',
        'Open critical points = no signature link.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Duration: 10 minutes, on a phone if possible.',
    },
  ],
};
