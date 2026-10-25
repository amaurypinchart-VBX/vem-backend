import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'briefing', num: 13, icon: '🎨', title: 'Briefing Studio & 🪄 Auto-générer',
  public: 'Project & Technical Managers', duree: '40 min', parcours: 'Office',
  slides: [
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: produce the team\'s departure briefing (slides + PDF) in a few minutes, from the project data.',
          '<b>For whom</b>: Project and Technical Managers. To be done on a <b>computer</b>.',
        ]) + path(['🏗️ Projets', '~project', '📋 Briefing', '➕ Nouveau briefing', '🎨 Studio']),
        callout('info', `After ${q('➕ Nouveau briefing')} (New briefing), VEM first opens a simple editor: click ${q('🎨 Studio')} to switch to the Briefing Studio.`)),
      visual: 'Goal + path.',
      notes: 'You can create several briefings per project: name them « Installation briefing », « Dismantling briefing ».',
    },
    {
      title: 'The more complete the project, the better the briefing',
      body: () => table(['Generated slide', 'Data used', 'Where to enter it'], [
        ['Cover', 'Name, client, installation dates, address', `${L('✏️ Modifier')} the project`],
        ['Schedule', 'Installation and dismantling dates (with times)', `${L('✏️ Modifier')} the project`],
        ['Location', 'Full address (map)', `${L('Adresse *')}`],
        ['Team', 'Members, role, phase, phone', `${L('👥 Équipe')} tab`],
        ['Contacts', 'Client contacts', `${L('🏢 Clients')}`],
        ['Logistics', 'Type, route, loading, driver', `${L('🚛 Logistique')} tab`],
        ['Team transport · Hotels', 'Transport and hotels', `${L('✈️ Bookings')} tab`],
        ['Project notes', 'Global notes, description, installation, dismantling', `${L('✏️ Modifier')} › notes`],
        ['One slide per file', 'Ticked photos and PDFs', `${L('📁 Fichiers')} tab`],
      ], { small: true }) + callout('warn', '<b>Empty data = missing slide.</b> Fill in the project before generating.'),
      visual: 'Large table « slide → data → where to enter it ». This is the key slide of the chapter.',
      notes: 'Actual order: Cover, Schedule, Location, Team, Contacts, Logistics, Team transport, Hotels, Notes, files, Thank you.',
    },
    {
      title: '🪄 Auto-générer in 4 clicks',
      body: () => cols(
        steps([
          `In the Studio: ${q('🪄 Auto-générer')} (Auto-generate).`,
          'Confirm: the current slides will be <b>replaced</b>.',
          `${q('📁 Fichiers à inclure dans le briefing')} (files to include): tick the useful drawings and photos, then ${q('✅ Générer')} (or ${q('⏭️ Sans fichiers')}, without files).`,
          `Review, adjust, then ${q('💾 Sauvegarder')} (Save).`,
        ]),
        callout('warn', `<b>Nothing is saved until you click ${q('💾 Sauvegarder')}.</b> Closing without saving = back to the previous version.`)
        + callout('info', 'Auto-generation does not use AI: it lays out your data as it is.')),
      visual: 'Steps + boxes.',
      notes: 'A ticked PDF gives one slide per page (30 pages max).',
    },
    {
      title: 'The Studio toolbar',
      body: () => cols(
        `<div class="m-toolbar">${['↶', '↷', '📝 Texte', '🔤 Titre', '🖼️ Image/PDF', '▭', '⭕', '📂 Depuis projet ▾', '🎨 Templates ▾', '📌 Logo ▾'].map((b) => btn(b)).join('')}</div>`
        + capture('C-08', 'Briefing Studio after 🪄 Auto-générer', '« Planning » slide selected, Slides column visible on the left', `${FIL.projet}`),
        table(['Tool', 'Use'], [
          [`${L('📝 Texte')} · ${L('🔤 Titre')}`, 'Add a text or a title'],
          [L('🖼️ Image/PDF'), 'Image on the slide; a PDF = one slide per page'],
          [L('📂 Depuis projet ▾'), 'Insert project data (info, team, trucks, contacts…)'],
          [L('🎨 Templates ▾'), 'Add a template slide (cover page, contacts, divider…)'],
          [L('📌 Logo ▾'), 'Discreet logo on every slide'],
          ['↶ ↷', 'Undo / redo (Ctrl+Z / Ctrl+Y)'],
        ], { small: true })),
      visual: 'Recreated toolbar + screenshot + table.',
      notes: 'Copy / paste: Ctrl+C / Ctrl+V; Delete removes the selected element.',
    },
    {
      title: 'Managing slides',
      body: () => cols(
        ul([
          '« Slides » column: drag ⋮⋮ or use ▲ ▼ to reorder.',
          'Click a slide name to rename it.',
          `🗐 duplicates a slide, × deletes it; ${q('+ Nouvelle slide')} adds a blank slide in the Viewbox style.`,
        ]),
        callout('tip', 'For dismantling: create a second briefing, run 🪄 Auto-générer again, then delete the slides you do not need.')),
      visual: 'List + tip.',
      notes: 'The undo history is specific to each slide.',
    },
    {
      title: 'Exporting the PDF (FR or EN)',
      body: () => cols(
        win('📄 Langue du PDF', `<div class="m-row">${btn('🇫🇷 Français', 'primary')}${btn('🇬🇧 English')}</div>`),
        steps([
          `${q('📄 PDF')} in the Studio header.`,
          `Choose ${q('🇫🇷 Français')} or ${q('🇬🇧 English')}: in English, every text is translated automatically for the PDF.`,
          'The PDF is downloaded <b>and</b> stored in 📁 Files.',
          `Send it to the team (e-mail, or 📤 in the 👥 Équipe tab, as an attachment from your mail program).`,
        ]) + callout('warn', 'Review the English PDF: proper names and addresses may get translated.')),
      visual: 'Recreated language window + steps.',
      notes: 'Each export adds a new PDF to Files: delete the old versions.',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        'Generating a briefing on an empty project → 3 slides.',
        'Forgetting 💾 Sauvegarder.',
        'Running 🪄 Auto-générer again after editing the slides → edits lost (a confirmation is asked).',
        'Tables of more than 12 rows → they overflow the slide: split them.',
        'Using the Studio on a phone → prefer a computer.',
      ]),
      visual: 'List.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercise — the demo project briefing',
      body: () => cols(steps([
        'Check that the demo project has a team, truck, transport, hotel, notes and a PDF drawing.',
        'Create « Installation briefing », switch to 🎨 Studio, 🪄 Auto-générer with the drawing.',
        'Add a 🎨 Templates « Séparateur de section » (section divider) slide before logistics.',
        'Save and export the PDF in English.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Complete project = complete briefing.',
        '🪄 Auto-générer replaces everything.',
        '💾 Sauvegarder, always.',
        'PDF FR / EN, stored in Files.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Duration: 15 minutes.',
    },
  ],
};
