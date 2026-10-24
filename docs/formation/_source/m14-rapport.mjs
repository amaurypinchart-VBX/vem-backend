import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'rapport', num: 14, icon: '📊', title: 'Le Rapport IA',
  public: 'Project & Technical Managers', duree: '20 min', parcours: 'Bureau',
  slides: [
    {
      title: 'Objectif & où le trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : un rapport de projet complet ou une présentation pour le client, avec un résumé rédigé par l\'IA.',
          '<b>Pour qui</b> : Project et Technical Managers.',
        ]) + path(['🏗️ Projets', '~projet', '📊 Rapport IA']),
        table(['Type', 'Différence'], [
          [L('Rapport complet'), 'Toutes les sections cochées'],
          [L('Présentation client'), 'Sans les daily reports ni les assignations (même mise en page)'],
        ], { small: true })),
      visual: 'Objectif + chemin + tableau des 2 types.',
      notes: 'En Présentation client, les e-mails et téléphones de l\'équipe et du chauffeur restent visibles si leur section est cochée.',
    },
    {
      title: 'Choisir les sections',
      body: () => table(['Section', 'Par défaut', 'Contenu'], [
        [L('Vue d\'ensemble'), '☑', 'Dates, client, équipe, notes complémentaires'],
        [L('Résumé IA'), '☑', 'Résumé rédigé par l\'IA (état, points forts, risques, suite)'],
        [L('Tâches'), '☑', '<b>Décochez-la</b> : les tâches ne sont plus utilisées'],
        [L('Daily Reports'), '☑', 'Les 7 derniers rapports'],
        [L('Temps par tâche'), '☐', 'Heures × hommes saisies dans les daily reports'],
        [L('Handover'), '☐', 'Zones et statut de réception'],
        [`${L('Logistique')} · ${L('Bookings')}`, '☐', 'Véhicules, transports, hôtels'],
        [L('Fichiers projet'), '☐', 'Photos et PDF du projet'],
        [L('Commentaire'), '☐', 'Votre texte libre (zone « 💬 Commentaire personnalisé »)'],
      ], { small: true }) + callout('warn', `Ne cochez pas ${q('Tickets SAV')} ni ${q('Visites client')} : ces modules ne sont plus utilisés.`),
      visual: 'Grille de sections recréée sous forme de tableau.',
      notes: 'Langues : Français, English, Nederlands (traduction partielle en EN / NL).',
    },
    {
      title: 'Prévisualiser, générer le PDF',
      body: () => cols(
        steps([
          'Choisissez la langue : Français, English ou Nederlands.',
          `${q('👁️ Prévisualiser')} : le rapport s\'ouvre dans un nouvel onglet.`,
          `${q('📄 Générer PDF')} : même chose, puis la fenêtre d\'impression s\'ouvre → choisissez <b>« Enregistrer au format PDF »</b>.`,
        ]),
        callout('info', 'Chaque génération (aperçu compris) range aussi un PDF dans 📁 Fichiers.')
        + callout('warn', 'Le navigateur bloque l\'onglet ? Autorisez les fenêtres pop-up pour VEM.')),
      visual: 'Étapes + encadrés.',
      notes: 'Comptez jusqu\'à une minute avec le résumé IA.',
    },
    {
      title: 'Temps par tâche',
      body: () => cols(
        steps([
          `Cochez ${q('Temps par tâche')} › ${q('🤖 Lancer / relancer l\'analyse')}.`,
          'Les chiffres viennent des lignes « ⏱️ Heures par tâche » des daily reports.',
          'Vous pouvez corriger ou retirer une ligne pour ce rapport seulement.',
        ]),
        callout('info', 'Les chiffres sont exacts (aucun calcul par l\'IA) ; l\'IA rédige seulement une courte synthèse.')
        + callout('warn', 'Rien de saisi dans les daily reports → « Aucune heure saisie ».')),
      visual: 'Étapes + encadrés.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercice — rapport du projet démo',
      body: () => cols(steps([
        'Ouvrez 📊 Rapport IA sur le projet démo.',
        'Décochez Tâches, cochez Logistique et Bookings.',
        'Ajoutez un commentaire et prévisualisez en anglais.',
        'Générez le PDF en Présentation client.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Notes et daily reports = contenu du rapport.',
        'Décocher Tâches.',
        'PDF = « Enregistrer au format PDF ».',
        'Une copie va dans Fichiers.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: '',
    },
  ],
};
