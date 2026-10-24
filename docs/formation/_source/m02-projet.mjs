import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip, check } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'projet-creation', num: 2, icon: '🏗️', title: 'Créer un projet à la main',
  public: 'Sales, Customer Service, Project & Technical Managers', duree: '35 min', parcours: 'Bureau',
  slides: [
    {
      title: '3 façons de faire entrer un projet dans VEM',
      body: () => `<div class="three">${[
        ['✍️', 'À la main', `${L('+ Nouveau Projet')} sur le Dashboard ou la page Projets.`, 'Ce chapitre'],
        ['🆕', 'Par mail « NEW »', 'Vous transférez le mail du client avec un sujet qui commence par NEW : l\'IA crée le projet en brouillon.', 'Chapitre 3'],
        ['📧', 'Compléter par mail', 'Le N° interne dans le sujet : les pièces jointes et les réservations arrivent dans le projet existant.', 'Chapitre 4'],
      ].map(([i, t, d, c]) => `<div class="three-card"><div class="ti">${i}</div><div class="tt">${t}</div><div class="td">${d}</div><div class="tc">${c}</div></div>`).join('')}</div>`,
      visual: '3 cartes côte à côte.',
      notes: 'Quel que soit le chemin, on termine toujours par une vérification dans la fiche projet.',
    },
    {
      title: 'Objectif & où le trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : créer un projet propre, avec un N° interne au bon format, des dates et une adresse justes.',
          '<b>Pour qui</b> : Sales, Customer Service, Project et Technical Managers.',
        ]) + path(['📊 Dashboard', '+ Nouveau Projet']) + path(['🏗️ Projets', '+ Nouveau Projet']),
        callout('tip', 'Ayez sous la main : le devis ou la confirmation de commande, l\'adresse exacte du site et les dates (avec les heures).')),
      visual: 'Objectif + deux chemins d\'accès.',
      notes: 'La fenêtre ne se ferme pas en cliquant à côté : seulement avec × ou « Annuler ».',
    },
    {
      title: 'Le formulaire (1/3) — l\'essentiel',
      body: () => cols(
        win('🏗️ Nouveau Projet',
          `<div class="m-grid2">${field('Nom *', FIL.projet)}${field('Client *', FIL.client)}</div>`
          + `<div class="m-grid2">${field('N° Interne', FIL.ref)}${field('Ouvriers', FIL.ouvriers)}</div>`
          + field('Adresse *', FIL.adresse, { wide: true })
          + `<div class="m-grid2">${field('Début installation *', FIL.instStart)}${field('Fin installation *', FIL.instEnd)}</div>`
          + `<div class="m-grid2">${field('Début démontage', FIL.disStart)}${field('Fin démontage', FIL.disEnd)}</div>`
          + field('Description / Instructions spéciales', '12 Viewbox, 1 escalier, accès livraison par l\'entrée Est', { wide: true })),
        steps([
          `${q('Nom *')} : un nom lisible (pas un code).`,
          `${q('Client *')} : choisissez dans la liste, ou ${q('+ Client')}.`,
          `${q('N° Interne')} : <b>toujours</b> au format Viewbox (${FIL.ref}).`,
          `${q('Adresse *')} : « rue numéro, code postal Ville » — la ville = le texte après la <b>dernière virgule</b>.`,
          'Dates <b>avec les heures</b> d\'installation, et de démontage si connues.',
        ])),
      visual: 'Maquette du haut du formulaire, remplie avec le projet démo.',
      notes: 'Sans N° interne, VEM invente un numéro VEM-année-chiffres : le projet ne pourra pas recevoir de mails avec la bonne référence.',
    },
    {
      title: 'Le formulaire (2/3) — les notes',
      body: () => cols(
        win('📝 Notes complémentaires',
          field('🌐 Notes globales du projet', 'Client exigeant sur la propreté des façades. Livraison uniquement avant 9 h.', { wide: true })
          + `<div class="m-grid2">${field('🔨 Notes installation', 'Grue 70 T le 15/03 de 8 h à 12 h.')}${field('🔧 Notes démontage', 'Évacuation par le parking Nord.')}</div>`,
          { sub: 'Visibles dans le Rapport IA (section Vue d\'ensemble)' }),
        table(['Note', 'Où elle ressort'], [
          [L('🌐 Notes globales du projet'), 'Onglet Infos · Rapport IA · Briefing (« OBJET »)'],
          [L('🔨 Notes installation'), 'Onglet Infos · Rapport IA · Briefing (« INSTALLATION »)'],
          [L('🔧 Notes démontage'), 'Onglet Infos · Rapport IA · Briefing (« DÉMONTAGE »)'],
          [L('Description / Instructions spéciales'), 'Onglet Infos · Briefing (« DESCRIPTION »)'],
        ], { small: true }) + callout('tip', 'Écrivez les notes pour l\'équipe sur le terrain : ce texte apparaîtra tel quel dans le briefing.')),
      visual: 'Bloc Notes complémentaires recréé + tableau « où ça ressort ».',
      notes: 'Les notes ne sont jamais remplies par les mails : c\'est à vous de les saisir.',
    },
    {
      title: 'Le formulaire (3/3) — les blocs du bas',
      body: () => table(['Bloc', 'Que faire aujourd\'hui'], [
        [`${L('👷 Équipes & Membres')}`, `<b>Ne pas l\'utiliser</b> : la sélection n\'est pas enregistrée. Ajoutez l\'équipe après la création, dans l\'onglet ${L('👥 Équipe')} (chapitre 6).`],
        [`${L('📋 Tâches à créer')}`, `Cliquez <b>${L('☐ Aucun')}</b> : les tâches ne sont plus utilisées. Sinon VEM crée une cinquantaine de tâches invisibles.`],
        [`${L('🚛 Logistique')}`, `Possible, mais préférez l\'onglet ${L('🚛 Logistique')} du projet (lieux de chargement, statut). Un véhicule sans n° ni immatriculation est ignoré.`],
      ]) + `<div class="m-row right">${btn('Annuler', 'outline')}${btn('✅ Créer le Projet', 'primary')}</div>`
        + callout('warn', `Le bloc ${q('📋 Tâches à créer')} est <b>tout coché par défaut</b>. Pensez à ${q('☐ Aucun')} avant ${q('✅ Créer le Projet')}.`),
      visual: 'Tableau des 3 blocs + bouton Créer + encadré.',
      notes: 'Ces contournements disparaîtront quand le formulaire sera corrigé (voir le prompt de réparation).',
    },
    {
      title: 'Obligatoire ou fortement recommandé ?',
      body: () => table(['Champ', 'Statut', 'Utilisé par'], [
        [L('Nom *'), chip('Obligatoire', 'red', { free: true }), 'Partout'],
        [L('Client *'), chip('Obligatoire', 'red', { free: true }), 'Contacts, envois, handover'],
        [L('Adresse *'), chip('Obligatoire', 'red', { free: true }), 'Carte du briefing, ville du projet'],
        [`${L('Début installation *')} / ${L('Fin installation *')}`, chip('Obligatoire', 'red', { free: true }), 'Calendrier, briefing, hôtels par mail'],
        [L('N° Interne'), chip('Indispensable', 'red', { free: true }), 'Réception des mails, recherche'],
        [`${L('Début démontage')} / ${L('Fin démontage')}`, chip('Fortement recommandé', 'amber', { free: true }), 'Calendrier, briefing, hôtels démontage'],
        [L('Ouvriers'), chip('Recommandé', 'grey', { free: true }), 'Fiche projet, rapport'],
        ['Notes et description', chip('Fortement recommandé', 'amber', { free: true }), 'Briefing, Rapport IA'],
      ], { small: true }),
      visual: 'Tableau avec pastilles.',
      notes: 'VEM ne contrôle pas que la fin est après le début : relisez les dates.',
    },
    {
      title: 'Après « ✅ Créer le Projet »',
      body: () => cols(
        steps([
          'VEM revient sur la liste et ouvre la nouvelle fiche projet.',
          `Statut de départ : ${q('📄 Brouillon')} (la liste de statut paraît vide).`,
          `Choisissez le statut réel, ex. ${q('📝 Devis à valider')}.`,
          `Onglet ${q('👥 Équipe')} : ajoutez l\'équipe.`,
          `Onglets ${q('🚛 Logistique')}, ${q('✈️ Bookings')}, ${q('📁 Fichiers')} : complétez dès que l\'info existe.`,
        ]),
        callout('info', `Pour corriger plus tard : ${q('✏️ Modifier')} dans l\'en-tête de la fiche (chapitre 5).`)),
      visual: 'Étapes numérotées.',
      notes: 'Le projet apparaît dans le calendrier du Dashboard dès qu\'il a une date d\'installation.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        'N° interne vide ou au mauvais format → les mails ne trouvent pas le projet.',
        `N° interne déjà utilisé → message « Valeur déjà existante (contrainte unique) ».`,
        'Adresse sans virgule avant la ville → la ville affichée sur la carte projet est fausse.',
        `Laisser ${q('📋 Tâches à créer')} tout coché → des dizaines de tâches inutiles.`,
        `Cocher l\'équipe dans le formulaire → rien n\'est enregistré : passez par l\'onglet ${q('👥 Équipe')}.`,
        `Vider une date de démontage dans ${q('✏️ Modifier')} ne l\'efface pas : demandez à un admin.`,
      ]),
      visual: 'Liste à puces.',
      notes: 'Insistez sur le format du N° interne : c\'est la clé de tout le circuit mail.',
    },
    {
      kind: 'exercise', title: 'Exercice — créer le projet démo',
      body: () => cols(steps([
        `Créez <b>${FIL.projet}</b> pour ${FIL.client}, N° interne <code>${FIL.ref}</code>.`,
        `Adresse : ${FIL.adresse}. Installation ${FIL.instStart} → ${FIL.instEnd}, démontage ${FIL.disStart} → ${FIL.disEnd}.`,
        'Remplissez les 3 notes complémentaires.',
        `${q('☐ Aucun')} dans les tâches, puis ${q('✅ Créer le Projet')}.`,
        `Passez le statut à ${q('📝 Devis à valider')}.`,
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'N° interne au format Viewbox, toujours.',
        'Dates avec heures, adresse « …, Ville ».',
        'Notes = contenu du briefing.',
        'Tâches : ☐ Aucun. Équipe : onglet Équipe.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Durée : 10 minutes.',
    },
  ],
};
