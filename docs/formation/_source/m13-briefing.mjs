import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'briefing', num: 13, icon: '🎨', title: 'Briefing Studio & 🪄 Auto-générer',
  public: 'Project & Technical Managers', duree: '40 min', parcours: 'Bureau',
  slides: [
    {
      title: 'Objectif & où le trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : produire en quelques minutes le briefing de départ de l\'équipe (slides + PDF), à partir des données du projet.',
          '<b>Pour qui</b> : Project et Technical Managers. À faire sur <b>ordinateur</b>.',
        ]) + path(['🏗️ Projets', '~projet', '📋 Briefing', '➕ Nouveau briefing', '🎨 Studio']),
        callout('info', `Après ${q('➕ Nouveau briefing')}, VEM ouvre d\'abord un éditeur simple : cliquez ${q('🎨 Studio')} pour passer au Briefing Studio.`)),
      visual: 'Objectif + chemin.',
      notes: 'On peut créer plusieurs briefings par projet : nommez-les « Briefing installation », « Briefing démontage ».',
    },
    {
      title: 'Plus le projet est rempli, meilleur est le briefing',
      body: () => table(['Slide générée', 'Données utilisées', 'Où les saisir'], [
        ['Couverture', 'Nom, client, dates d\'installation, adresse', `${L('✏️ Modifier')} le projet`],
        ['Planning', 'Dates d\'installation et de démontage (avec heures)', `${L('✏️ Modifier')} le projet`],
        ['Localisation', 'Adresse complète (carte)', `${L('Adresse *')}`],
        ['Équipe', 'Membres, rôle, phase, téléphone', `Onglet ${L('👥 Équipe')}`],
        ['Contacts', 'Contacts du client', `${L('🏢 Clients')}`],
        ['Logistique', 'Type, trajet, chargement, chauffeur', `Onglet ${L('🚛 Logistique')}`],
        ['Transport équipe · Hôtels', 'Transports et hôtels', `Onglet ${L('✈️ Bookings')}`],
        ['Notes projet', 'Notes globales, description, installation, démontage', `${L('✏️ Modifier')} › notes`],
        ['Une slide par fichier', 'Photos et PDF cochés', `Onglet ${L('📁 Fichiers')}`],
      ], { small: true }) + callout('warn', '<b>Donnée vide = slide absente.</b> Remplissez le projet avant de générer.'),
      visual: 'Grand tableau « slide → données → où les saisir ». C\'est la slide clé du chapitre.',
      notes: 'Ordre réel : Couverture, Planning, Localisation, Équipe, Contacts, Logistique, Transport équipe, Hôtels, Notes, fichiers, Merci.',
    },
    {
      title: '🪄 Auto-générer en 4 clics',
      body: () => cols(
        steps([
          `Dans le Studio : ${q('🪄 Auto-générer')}.`,
          'Confirmez : les slides actuelles seront <b>remplacées</b>.',
          `${q('📁 Fichiers à inclure dans le briefing')} : cochez plans et photos utiles, puis ${q('✅ Générer')} (ou ${q('⏭️ Sans fichiers')}).`,
          `Relisez, ajustez, puis ${q('💾 Sauvegarder')}.`,
        ]),
        callout('warn', `<b>Rien n\'est enregistré tant que vous n\'avez pas cliqué ${q('💾 Sauvegarder')}.</b> Fermer sans sauvegarder = retour à l\'ancienne version.`)
        + callout('info', 'L\'auto-génération n\'utilise pas l\'IA : elle met en page vos données telles quelles.')),
      visual: 'Étapes + encadrés.',
      notes: 'Un PDF coché donne une slide par page (30 pages max).',
    },
    {
      title: 'La barre d\'outils du Studio',
      body: () => cols(
        `<div class="m-toolbar">${['↶', '↷', '📝 Texte', '🔤 Titre', '🖼️ Image/PDF', '▭', '⭕', '📂 Depuis projet ▾', '🎨 Templates ▾', '📌 Logo ▾'].map((b) => btn(b)).join('')}</div>`
        + capture('C-08', 'Briefing Studio après 🪄 Auto-générer', 'slide « Planning » sélectionnée, colonne Slides visible à gauche', `${FIL.projet}`),
        table(['Outil', 'Usage'], [
          [`${L('📝 Texte')} · ${L('🔤 Titre')}`, 'Ajouter un texte ou un titre'],
          [L('🖼️ Image/PDF'), 'Image sur la slide ; un PDF = une slide par page'],
          [L('📂 Depuis projet ▾'), 'Insérer les données du projet (infos, équipe, camions, contacts…)'],
          [L('🎨 Templates ▾'), 'Ajouter une slide modèle (page de garde, contacts, séparateur…)'],
          [L('📌 Logo ▾'), 'Logo discret sur toutes les slides'],
          ['↶ ↷', 'Annuler / rétablir (Ctrl+Z / Ctrl+Y)'],
        ], { small: true })),
      visual: 'Barre d\'outils recréée + capture + tableau.',
      notes: 'Copier / coller : Ctrl+C / Ctrl+V ; Suppr pour effacer l\'élément sélectionné.',
    },
    {
      title: 'Gérer les slides',
      body: () => cols(
        ul([
          'Colonne « Slides » : glissez ⋮⋮ ou ▲ ▼ pour réordonner.',
          'Cliquez le nom d\'une slide pour le renommer.',
          `🗐 duplique une slide, × la supprime ; ${q('+ Nouvelle slide')} ajoute une slide vierge au style Viewbox.`,
        ]),
        callout('tip', 'Pour le démontage : créez un second briefing, relancez 🪄 Auto-générer, puis supprimez les slides inutiles.')),
      visual: 'Liste + astuce.',
      notes: 'L\'historique d\'annulation est propre à chaque slide.',
    },
    {
      title: 'Exporter le PDF (FR ou EN)',
      body: () => cols(
        win('📄 Langue du PDF', `<div class="m-row">${btn('🇫🇷 Français', 'primary')}${btn('🇬🇧 English')}</div>`),
        steps([
          `${q('📄 PDF')} dans l\'en-tête du Studio.`,
          `Choisissez ${q('🇫🇷 Français')} ou ${q('🇬🇧 English')} : en anglais, tous les textes sont traduits automatiquement pour le PDF.`,
          'Le PDF est téléchargé <b>et</b> rangé dans 📁 Fichiers.',
          `Envoyez-le à l\'équipe (mail ou 📤 de l\'onglet 👥 Équipe en pièce jointe de votre messagerie).`,
        ]) + callout('warn', 'Relisez le PDF anglais : noms propres et adresses peuvent être traduits.')),
      visual: 'Fenêtre de langue recréée + étapes.',
      notes: 'Chaque export ajoute un nouveau PDF dans Fichiers : supprimez les anciennes versions.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        'Générer un briefing sur un projet vide → 3 slides.',
        'Oublier 💾 Sauvegarder.',
        'Relancer 🪄 Auto-générer après avoir retouché les slides → retouches perdues (confirmation).',
        'Tableaux de plus de 12 lignes → ils dépassent de la slide : scindez.',
        'Utiliser le Studio sur téléphone → préférez l\'ordinateur.',
      ]),
      visual: 'Liste.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercice — le briefing du projet démo',
      body: () => cols(steps([
        'Vérifiez que le projet démo a équipe, camion, transport, hôtel, notes et un plan PDF.',
        'Créez « Briefing installation », passez en 🎨 Studio, 🪄 Auto-générer avec le plan.',
        'Ajoutez une slide 🎨 Templates « Séparateur de section » avant la logistique.',
        'Sauvegardez et exportez le PDF en anglais.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Projet rempli = briefing complet.',
        '🪄 Auto-générer remplace tout.',
        '💾 Sauvegarder, toujours.',
        'PDF FR / EN, rangé dans Fichiers.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Durée : 15 minutes.',
    },
  ],
};
