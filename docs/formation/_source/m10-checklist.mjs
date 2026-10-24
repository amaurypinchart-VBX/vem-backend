import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'checklist', num: 10, icon: '☑️', title: 'La check-list de montage (todolist)',
  public: 'Technical & Project Managers (configurer), Site Managers (remplir), installateurs (consulter)', duree: '40 min', parcours: 'Terrain',
  slides: [
    {
      title: 'Objectif : la todolist du chantier',
      body: () => cols(
        ul([
          '<b>Objectif</b> : contrôler chaque point du montage, avec photos et commentaires, au jour le jour.',
          'Elle <b>remplace les tâches</b>.',
          'Elle alimente la <b>progression</b> du projet, le <b>daily report</b> et le <b>handover</b> (PDF et page de signature du client).',
        ]),
        table(['Qui', 'Fait quoi'], [
          ['Technical / Project Manager, admin', 'Configure la check-list du projet'],
          ['Site Manager', 'Remplit (sur ses projets)'],
          ['Installateur', 'Consulte (sur ses projets)'],
        ], { small: true })),
      visual: 'Objectif + tableau des rôles.',
      notes: 'Un Site Manager ou un installateur doit être dans l\'onglet 👥 Équipe du projet pour voir le projet et sa check-list.',
    },
    {
      title: 'Où la trouver : 3 phases',
      body: () => table(['Phase', 'Où', 'Quand'], [
        [L('📋 Préparation'), `Onglet ${L('📋 Infos')}, en haut`, 'Avant le montage (réception du site)'],
        [L('🏗️ Installation'), `Onglet ${L('📓 Daily Reports')}, en haut`, 'Pendant le montage, jour après jour'],
        [L('🔨 Démontage'), `Onglet ${L('📓 Daily Reports')}, en haut`, 'Pendant le démontage'],
      ]) + callout('info', `L\'onglet ${q('🧾 Handover')} affiche seulement un <b>rappel</b> de l\'état de la check-list de montage.`)
        + capture('C-04', 'Onglet 📓 Daily Reports d\'un projet', 'carte « ☑️ Check-list de montage » configurée, à moitié remplie', `${FIL.ref}, 20/48 OK`),
      visual: 'Tableau des 3 phases + capture de la carte check-list.',
      notes: 'Sur la carte : barre de progression, compteurs ✅ 🟠 ❌ ➖ ⏳, alertes critiques et photos manquantes.',
    },
    {
      title: 'Configurer la check-list d\'un projet',
      body: () => cols(
        steps([
          `Sur la carte de la phase : ${q('⚙️ Configurer la check-list')}.`,
          'Type de Viewbox : ⛺ Éphémère ou 🏠 Permanente.',
          'Cochez / décochez les points utiles (pré-cochés par défaut).',
          `Ajoutez des points propres au chantier : ${q('+ Point spécifique au projet')} (photo obligatoire, critique).`,
          `${q('💾 Enregistrer')}.`,
        ]),
        callout('info', 'Les points sont <b>copiés</b> dans le projet : modifier la bibliothèque ensuite ne change pas une check-list déjà configurée.')
        + callout('warn', 'Retirer un point déjà rempli efface aussi ses photos et son historique : VEM demande confirmation.')),
      visual: 'Étapes + encadrés.',
      notes: 'Rôles : admin, Technical Manager, Project Manager. Sans configuration, la carte affiche « Pas encore configurée — le Technical Manager la prépare. »',
    },
    {
      title: 'Les 5 statuts d\'un point',
      body: () => `<div class="statuses">${[
        ['⏳ À vérifier', 'Pas encore contrôlé (départ)', 'grey'],
        ['✅ OK', 'Conforme. Photo exigée si le point est 📷', 'green'],
        ['🟠 Partiel', 'Commentaire obligatoire', 'amber'],
        ['❌ Non fait', 'Commentaire obligatoire', 'red'],
        ['➖ N.A.', 'Non applicable — commentaire obligatoire', 'blue'],
      ].map(([s, d, c]) => `<div class="st c-${c}"><div class="sn">${L(s)}</div><div class="sd">${d}</div></div>`).join('')}</div>`
        + cols(callout('warn', '⚠️ <b>Point critique</b> : il doit être OK ou N.A. avant de pouvoir générer le lien de signature du handover.'),
          callout('info', '📷 <b>Photo obligatoire</b> : OK est refusé sans photo. Un document PDF ne compte pas comme photo.')),
      visual: '5 cartes de statut colorées + règles.',
      notes: 'Chaque changement de statut est historisé (qui, quand, commentaire).',
    },
    {
      title: 'Remplir en mode ☰ Liste',
      body: () => cols(
        steps([
          `${q('☰ Liste')} sur la carte.`,
          `Filtre ${q('À traiter')} (par défaut), ${q('Problèmes')} ou ${q('Tout')}.`,
          'Sur chaque ligne : ✓ OK · ½ Partiel · ✕ Non fait · N/A.',
          'Le volet ＋ : commentaire (🎙️ dictée), 📸 Photo, 🖼️ Galerie, 📎 Document, historique.',
          'Le commentaire s\'enregistre seul après quelques secondes.',
        ]),
        capture('C-05', 'Check-list en mode Liste sur téléphone', 'un point « Partiel » avec le volet ouvert (commentaire + photo)', `${FIL.ref}`)),
      visual: 'Étapes + capture mobile.',
      notes: 'En cas de réseau faible : « Non enregistré (réseau) » + « ↻ Réessayer ».',
    },
    {
      title: 'Remplir en mode 🃏 Diaporama',
      body: () => cols(
        ul([
          `${q('🃏 Remplir en diaporama')} : une carte par point, comme des cartes à faire glisser.`,
          '<b>Glisser à droite = OK</b>, <b>à gauche = Non fait</b>.',
          `Boutons : ↶ Retour · ✕ NON · ½ PARTIEL · N/A · ✓ OK · ${q('⏭ Passer')}.`,
          `Si un commentaire ou une photo manque, la carte reste : complétez puis ${q('Enregistrer et suivant →')}.`,
          'Sur ordinateur : → OK, ← Non fait, P Partiel, A N/A.',
        ]),
        callout('tip', 'Le mode choisi (Liste ou Diaporama) est mémorisé sur votre appareil.')
        + capture('C-06', 'Check-list en mode Diaporama sur téléphone', 'une carte « photo obligatoire » au centre, barre de progression en haut', `${FIL.ref}`)),
      visual: 'Liste + capture.',
      notes: 'Écran de fin : anneau de progression, compteurs, « ▶ Continuer », validation.',
    },
    {
      title: 'Valider, exporter, joindre au daily',
      body: () => cols(
        steps([
          `Quand plus aucun point n\'est « À vérifier » : ${q('✅ Valider la check-list')}.`,
          `${q('📄 PDF / Envoyer')} : PDF en français ou anglais, ${q('⬇️ Télécharger le PDF')}.`,
          `Envoi par e-mail : cochez les destinataires, puis ${q('✉️ Envoyer le PDF')}.`,
          `${q('📓 Joindre à un daily report')} : à un rapport existant ou un nouveau rapport du jour.`,
        ]),
        callout('info', 'La check-list jointe au daily est une <b>photo de l\'état du moment</b> : ↻ Actualiser dans le daily pour la mettre à jour.')
        + callout('warn', 'Remettre un point « À vérifier » ou ajouter des points annule la validation.')),
      visual: 'Étapes + encadrés.',
      notes: 'Aucun destinataire n\'est coché par défaut dans l\'envoi de la check-list.',
    },
    {
      title: 'Lien avec la signature du handover',
      body: () => cols(
        win('⚠️ Check-list de montage incomplète', `<div class="m-txt">2 point(s) critique(s) non validé(s)<br>⏳ 5 point(s) encore « À vérifier »</div><div class="m-txt">Complète la check-list avant de faire signer le client.</div><div class="m-row right">${btn('Annuler', 'outline')}${btn('☑️ Ouvrir la check-list', 'primary')}</div>`),
        ul([
          'Le lien de signature client est <b>bloqué</b> tant qu\'il reste des points critiques non OK / N.A. ou des points « À vérifier » (check-list de montage).',
          'Seuls un admin ou un Technical Manager peuvent « Générer quand même ».',
          'Le client voit la check-list (sans les points N.A.) sur sa page de signature et dans le PDF.',
        ])),
      visual: 'Fenêtre de blocage recréée + règles.',
      notes: 'Les points non critiques Partiel ou Non fait ne bloquent pas.',
    },
    {
      title: 'La bibliothèque (Templates check-list)',
      body: () => cols(
        ul([
          `Menu ${q('☑️ Templates check-list')} : les points de contrôle Viewbox par phase (catégories, points).`,
          `Bibliothèque vide : ${q('📥 Charger la bibliothèque Viewbox')} (116 points).`,
          'Par point : 📷 photo obligatoire, ⚠️ critique, « si présent », Permanentes uniquement, actif.',
          'Modifiable par les admins, Technical et Project Managers ; lecture seule pour les autres.',
        ]),
        callout('info', 'Modifier la bibliothèque n\'affecte que les <b>prochaines</b> configurations, jamais un projet déjà configuré.')),
      visual: 'Liste + encadré.',
      notes: 'Réservé aux personnes qui préparent les chantiers.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        'Check-list non configurée → pas de suivi, pas de progression.',
        'Site Manager absent de l\'équipe du projet → il ne voit pas la check-list.',
        'Tout cocher « OK » en fin de chantier sans photos → refusé sur les points 📷, et sans valeur pour le client.',
        'N.A. sans explication → refusé (commentaire obligatoire).',
        'Fermer avec des points non enregistrés → VEM avertit : lisez le message.',
        'Deux personnes remplissent en même temps → rouvrez pour voir les changements de l\'autre.',
      ]),
      visual: 'Liste.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercice — la check-list du projet démo',
      body: () => cols(steps([
        'Configurez la check-list de montage du projet démo (Éphémère).',
        'Ajoutez un point spécifique « Escalier client contrôlé » avec photo obligatoire.',
        'Remplissez 5 points en Diaporama, dont un Partiel avec commentaire.',
        'Joignez la check-list au daily du jour.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Configurer → remplir au jour le jour → valider.',
        'Commentaire pour Partiel / Non fait / N.A.',
        'Photo pour les points 📷.',
        'Points critiques ouverts = pas de lien de signature.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Durée : 10 minutes, sur téléphone si possible.',
    },
  ],
};
