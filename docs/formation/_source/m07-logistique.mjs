import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'logistique', num: 7, icon: '🚛', title: 'Logistique : camions & engins',
  public: 'Project & Technical Managers, Customer Service', duree: '20 min', parcours: 'Bureau',
  slides: [
    {
      title: 'Objectif & où la trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : chaque camion, grue, nacelle ou groupe électrogène du projet est dans VEM, avec ses dates et ses lieux.',
          '<b>Pour qui</b> : Project et Technical Managers, Customer Service.',
        ]) + path(['🏗️ Projets', '~projet', '🚛 Logistique', '+ Ajouter']),
        callout('tip', 'Une confirmation de transport reçue par mail ? Transférez-la avec le N° interne dans le sujet : le véhicule est créé en brouillon (chapitre 4).')),
      visual: 'Objectif + chemin.',
      notes: 'Préférez cet onglet au bloc Logistique du formulaire projet : il a les lieux et le statut.',
    },
    {
      title: 'Ajouter un véhicule',
      body: () => cols(
        win('🚛 Ajouter un véhicule',
          `<div class="m-grid2">${field('Type *', '🚛 Camion (Tautliner)')}${field('Nom / référence supplémentaire (optionnel)', 'Camion n°1')}</div>`
          + `<div class="m-grid2">${field('Plaque 1 (Tracteur)', FIL.camion)}${field('Plaque 2 (Remorque)', '')}</div>`
          + `<div class="m-grid2">${field('Nom du chauffeur', FIL.chauffeur)}${field('📞 Téléphone', '+32 470 …')}</div>`
          + `<div class="m-grid2">${field('Lieu de chargement', '🏭 Entrepôt Tubize')}${field('📅 Date & heure de chargement', '14/03/2027 14:00')}</div>`
          + `<div class="m-grid2">${field('Lieu de déchargement', '📍 Site événement')}${field('📅 Arrivée estimée', '15/03/2027 07:00')}</div>`
          + field('📍 Zone de déchargement', 'Entrée Est', { wide: true })
          + `<div class="m-row right">${btn('✅ Ajouter le véhicule', 'primary')}</div>`),
        table(['Types', ''], [
          [L('🚛 Camion (Tautliner)'), L('🚛 Camion (Flatbed)')], [L('🚐 Camionnette'), L('🏗️ Grue')],
          [L('✂️ Nacelle ciseaux'), L('🔧 Manitou / Roto')], [L('🚜 Chariot élévateur'), L('⚡ Groupe électrogène')], [L('📦 Autre'), ''],
        ], { small: true }) + callout('info', `Lieux : ${q('🏭 Entrepôt Tubize')}, site événement, ou ${q('📦 Autre lieu (adresse spéciale)')} avec l\'adresse.`)),
      visual: 'Maquette de la fenêtre véhicule remplie + liste des types.',
      notes: 'Seul le type est marqué obligatoire, mais remplissez dates, lieux et chauffeur : ce sont eux qui apparaissent partout.',
    },
    {
      title: 'Statuts et archivage automatique',
      body: () => cols(
        `<div class="m-dropdown">${['🟣 Planifié', '🟠 En chargement', '🔵 En route', '🟢 Livré', '⚫ Retour entrepôt'].map((s) => `<div>${L(s)}</div>`).join('')}</div>`,
        steps([
          `À la création : ${q('🟣 Planifié')}.`,
          `Ensuite : ✏️ › ${q('État du véhicule')} › ${q('💾 Enregistrer')}.`,
          `${q('🟢 Livré')} ou ${q('⚫ Retour entrepôt')} → le véhicule est <b>archivé</b> : masqué de l\'onglet (case ${q('Voir archivés')}).`,
        ]) + callout('info', 'Chargement ou déchargement à Tubize : le groupe de l\'entrepôt est prévenu automatiquement à la création et à chaque changement de date, de lieu ou de statut.')),
      visual: 'Liste des 5 statuts + étapes.',
      notes: 'Un véhicule archivé reste visible sur le calendrier du Dashboard et le planning public.',
    },
    {
      title: 'À quoi ça sert après',
      body: () => `<div class="feeds">${[
        ['📋 Onglet Infos', '« 🚛 Logistique — Dates clés » : chargement, départ, arrivée'],
        ['📅 Calendrier', `Case ${L('🚛 Camions')} : une barre verte par véhicule`],
        ['🖥️ Planning public', 'Écran de l\'entrepôt : 🚛 au jour de chargement'],
        ['📋 Briefing', 'Slide « Logistique » : type, trajet, chargement, chauffeur'],
        ['📊 Rapport IA', 'Section Logistique (véhicules non livrés)'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Flèches vers les 5 usages.',
      notes: 'Le planning public est présenté au chapitre 15.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        `Modifier un véhicule via ${q('✏️ Modifier')} du projet → perdu. Toujours ✏️ <b>sur la carte</b> du véhicule.`,
        'Brouillon créé par mail (badge « draft ») jamais validé.',
        'Oublier de passer à Livré / Retour entrepôt → l\'onglet reste encombré.',
        'Lieu « Autre » sans adresse → « Autre lieu » affiché partout.',
        'La zone de déchargement est ajoutée aux notes : ne la retapez pas à chaque modification.',
      ]),
      visual: 'Liste.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercice — la logistique du projet démo',
      body: () => cols(steps([
        `Ajoutez le camion ${FIL.camion} (Tautliner), chauffeur ${FIL.chauffeur}, chargement Entrepôt Tubize le 14/03/2027 à 14 h, arrivée sur site le 15/03 à 7 h, zone « Entrée Est ».`,
        'Ajoutez une grue (lieu de chargement : directement sur site).',
        'Passez le camion en 🔵 En route, puis 🟢 Livré : où est-il passé ?',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Un véhicule = une carte dans l\'onglet Logistique.',
        'Dates + lieux + chauffeur = calendrier et briefing.',
        'Livré / Retour entrepôt = archivé.',
        'Brouillon par mail → ✏️ puis Enregistrer.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Réponse : le camion livré est masqué, cochez « Voir archivés ».',
    },
  ],
};
