import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'dashboard', num: 15, icon: '📊', title: 'Dashboard, calendrier & notifications',
  public: 'Tout le monde', duree: '20 min', parcours: 'Tronc commun',
  slides: [
    {
      title: 'Le Dashboard en un coup d\'œil',
      body: () => cols(
        `<div class="m-stats"><div><b>4</b>${L('Projets actifs')}</div><div><b>—</b>${L('Tâches terminées')}</div><div><b>27</b>${L('Membres équipe')}</div></div>`
        + ul([
          `${q('Projets actifs')} : projets En préparation, En installation ou Sur site.`,
          `${q('🏗️ Projets en cours')} : 3 projets au plus, avec leur progression.`,
          `${q('⚡ Actions rapides')} : Daily report, Handover.`,
        ]),
        callout('info', `« Tâches terminées » affiche toujours « — » : ignorez-le. Les chiffres portent sur les projets que vous voyez.`)
        + `<div class="m-row">${btn('+ Nouveau Projet', 'primary')}</div>`),
      visual: 'Tuiles de statistiques recréées + liste.',
      notes: 'Page d\'arrivée après la connexion.',
    },
    {
      title: 'Le calendrier projets',
      body: () => cols(
        capture('C-09', 'Dashboard › 📅 Calendrier projets', 'période 8 sem., cases 🚛 Camions et 👥 Équipes cochées', `projet démo visible avec un camion et un transport`),
        ul([
          `${q('Période :')} de 2 à 26 semaines, à partir de cette semaine.`,
          'Barre <b>bleue</b> = installation, <b>orange</b> = démontage, trait rouge = aujourd\'hui.',
          `${q('🚛 Camions')} : une ligne verte par véhicule. ${q('👥 Équipes')} : présence sur site, trajets en hachures.`,
          `${q('🎯 Filtrer projets')} : cochez les projets à afficher (mémorisé sur votre ordinateur).`,
          '▲ ▼ : change l\'ordre <b>pour tout le monde</b>.',
          'Clic sur un projet = sa fiche.',
        ])),
      visual: 'Capture du calendrier + légende.',
      notes: 'Les projets terminés ou annulés peuvent encore apparaître : utilisez le filtre.',
    },
    {
      title: 'Les notifications',
      body: () => cols(
        table(['Notification', 'Qui', 'Quand'], [
          [L('🆕 Projet créé depuis un email'), 'Admins, Project Managers', 'Un mail NEW a créé un projet'],
          [L('🚛 Réservations créées depuis un email'), 'Admins, Project Managers', 'Un mail a créé camions / hôtels / trajets'],
          ['📤 Nom du projet', 'Le membre visé', 'Quelqu\'un lui a envoyé des infos (📤)'],
        ], { small: true }),
        steps([
          `Menu ${q('🔔 Notifications')} ou 🔔 en haut.`,
          'Clic sur une notification = marquée lue.',
          `${q('Tout lire')} pour tout marquer.`,
        ]) + callout('info', 'Les notifications ne s\'ouvrent pas sur le projet : recherchez le N° interne dans Projets.')),
      visual: 'Tableau des types + étapes.',
      notes: 'Il n\'y a pas de notification sur le téléphone (push) : consultez VEM.',
    },
    {
      title: 'Le planning public (écran de l\'entrepôt)',
      body: () => cols(
        ul([
          'Page en lecture seule « Planning Projets — 2 mois », affichée sur les écrans de l\'entrepôt.',
          'Adresse : celle de VEM suivie de <code>/planning-public.html</code>, avec la clé d\'accès éventuelle fournie par l\'admin (pas de lien dans le menu).',
          'Montre les 60 prochains jours : installation (couleur du statut), démontage (hachures), 🚛 au jour de chargement.',
          'Actualisation automatique.',
        ]),
        callout('warn', 'Elle s\'ouvre sans compte VEM et affiche les noms des projets et des clients : ne partagez pas son adresse hors de Viewbox.')
        + callout('tip', 'Dates et camions justes dans VEM = planning de l\'entrepôt juste.')),
      visual: 'Liste + encadrés.',
      notes: 'Demandez l\'adresse exacte de VEM à votre admin si besoin.',
    },
    {
      kind: 'exercise', title: 'Exercice — piloter sa semaine',
      body: () => cols(steps([
        'Affichez 8 semaines avec Camions et Équipes.',
        'Masquez tous les projets sauf le projet démo avec 🎯 Filtrer projets.',
        'Ouvrez le projet depuis sa barre.',
        'Ouvrez vos notifications et marquez-les comme lues.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Bleu installation, orange démontage, vert camions.',
        '▲ ▼ change l\'ordre de tous.',
        'Notifications : surtout les créations par mail.',
        'Planning public = données VEM.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: '',
    },
  ],
};
