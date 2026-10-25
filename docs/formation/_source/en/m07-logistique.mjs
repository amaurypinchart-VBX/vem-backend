import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'logistique', num: 7, icon: '🚛', title: 'Logistics: trucks & machines',
  public: 'Project & Technical Managers, Customer Service', duree: '20 min', parcours: 'Office',
  slides: [
    {
      title: 'Goal & where to find it',
      body: () => cols(
        ul([
          '<b>Goal</b>: every truck, crane, aerial platform or generator of the project is in VEM, with its dates and places.',
          '<b>Who</b>: Project and Technical Managers, Customer Service.',
        ]) + path(['🏗️ Projets', '~project', '🚛 Logistique', '+ Ajouter']),
        callout('tip', 'Received a transport confirmation by e-mail? Forward it with the internal number in the subject: the vehicle is created as a draft (chapter 4).')),
      visual: 'Goal + path.',
      notes: 'Prefer this tab to the Logistique block of the project form: it has the places and the status.',
    },
    {
      title: 'Add a vehicle',
      body: () => cols(
        win('🚛 Ajouter un véhicule',
          `<div class="m-grid2">${field('Type *', '🚛 Camion (Tautliner)')}${field('Nom / référence supplémentaire (optionnel)', 'Camion n°1')}</div>`
          + `<div class="m-grid2">${field('Plaque 1 (Tracteur)', FIL.camion)}${field('Plaque 2 (Remorque)', '')}</div>`
          + `<div class="m-grid2">${field('Nom du chauffeur', FIL.chauffeur)}${field('📞 Téléphone', '+32 470 …')}</div>`
          + `<div class="m-grid2">${field('Lieu de chargement', '🏭 Entrepôt Tubize')}${field('📅 Date & heure de chargement', '14/03/2027 14:00')}</div>`
          + `<div class="m-grid2">${field('Lieu de déchargement', '📍 Site événement')}${field('📅 Arrivée estimée', '15/03/2027 07:00')}</div>`
          + field('📍 Zone de déchargement', 'East entrance', { wide: true })
          + `<div class="m-row right">${btn('✅ Ajouter le véhicule', 'primary')}</div>`),
        table(['Types', ''], [
          [L('🚛 Camion (Tautliner)'), L('🚛 Camion (Flatbed)')], [L('🚐 Camionnette'), L('🏗️ Grue')],
          [L('✂️ Nacelle ciseaux'), L('🔧 Manitou / Roto')], [L('🚜 Chariot élévateur'), L('⚡ Groupe électrogène')], [L('📦 Autre'), ''],
        ], { small: true }) + callout('info', `Places: ${q('🏭 Entrepôt Tubize')} (Tubize warehouse), event site, or ${q('📦 Autre lieu (adresse spéciale)')} (other place) with the address.`)),
      visual: 'Mock-up of the filled-in vehicle window + list of types.',
      notes: 'Only the type is marked as required, but fill in dates, places and driver: they are what appears everywhere.',
    },
    {
      title: 'Statuses and automatic archiving',
      body: () => cols(
        `<div class="m-dropdown">${['🟣 Planifié', '🟠 En chargement', '🔵 En route', '🟢 Livré', '⚫ Retour entrepôt'].map((s) => `<div>${L(s)}</div>`).join('')}</div>`,
        steps([
          `On creation: ${q('🟣 Planifié')} (planned).`,
          `Then: ✏️ › ${q('État du véhicule')} › ${q('💾 Enregistrer')}.`,
          `${q('🟢 Livré')} (delivered) or ${q('⚫ Retour entrepôt')} (back at the warehouse) → the vehicle is <b>archived</b>: hidden from the tab (tick ${q('Voir archivés')} to see it).`,
        ]) + callout('info', 'Loading or unloading at Tubize: the warehouse group is notified automatically on creation and on every change of date, place or status.')),
      visual: 'List of the 5 statuses + steps.',
      notes: 'An archived vehicle stays visible on the Dashboard calendar and on the public planning.',
    },
    {
      title: 'What it is used for afterwards',
      body: () => `<div class="feeds">${[
        ['📋 Infos tab', '« 🚛 Logistique — Dates clés »: loading, departure, arrival'],
        ['📅 Calendar', `${L('🚛 Camions')} box: one green bar per vehicle`],
        ['🖥️ Public planning', 'Warehouse screen: 🚛 on the loading day'],
        ['📋 Briefing', '« Logistique » slide: type, route, loading, driver'],
        ['📊 AI report', 'Logistics section (vehicles not delivered)'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Arrows to the 5 uses.',
      notes: 'The public planning is presented in chapter 15.',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        `Editing a vehicle through the project\'s ${q('✏️ Modifier')} → lost. Always use ✏️ <b>on the vehicle card</b>.`,
        'Draft created by e-mail (« draft » badge) never validated.',
        'Forgetting to switch to Livré / Retour entrepôt → the tab stays cluttered.',
        '« Autre » place without an address → « Autre lieu » shown everywhere.',
        'The unloading zone is added to the notes: don\'t retype it at every change.',
      ]),
      visual: 'List.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercise — the demo project logistics',
      body: () => cols(steps([
        `Add the truck ${FIL.camion} (Tautliner), driver ${FIL.chauffeur}, loading at Entrepôt Tubize on 14/03/2027 at 2 pm, arrival on site on 15/03 at 7 am, zone « East entrance ».`,
        'Add a crane (loading place: directly on site).',
        'Switch the truck to 🔵 En route, then 🟢 Livré: where did it go?',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'One vehicle = one card in the Logistique tab.',
        'Dates + places + driver = calendar and briefing.',
        'Livré / Retour entrepôt = archived.',
        'Draft by e-mail → ✏️ then Enregistrer.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: 'Answer: the delivered truck is hidden, tick « Voir archivés ».',
    },
  ],
};
