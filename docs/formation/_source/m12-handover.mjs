import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'handover', num: 12, icon: '🧾', title: 'Handover & signature client',
  public: 'Site Managers, Technical Managers', duree: '35 min', parcours: 'Terrain',
  slides: [
    {
      title: 'Objectif & où le trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : faire réceptionner l\'installation par le client, avec les points inspectés et sa signature.',
          '<b>Pour qui</b> : Site Managers, Technical Managers (et un installateur avec le droit 🧾 Handover). Un compte Client du projet peut consulter son handover et le PDF.',
        ]) + path(['🏗️ Projets', '~projet', '🧾 Handover', '+ Nouveau Handover']),
        callout('warn', `Passez toujours par l\'<b>onglet</b> 🧾 Handover du projet. Le menu ${q('🧾 Handover')} et le bouton du même nom dans l\'en-tête ouvrent la liste de tous les projets, avec moins de fonctions.`)
        + callout('info', 'Avant : la check-list de montage doit être remplie (chapitre 10).')),
      visual: 'Objectif + chemin + encadrés.',
      notes: 'On peut créer plusieurs handovers par projet (ex. par zone ou par phase).',
    },
    {
      title: 'Créer le handover',
      body: () => cols(
        win('🧾 Nouveau Handover',
          `<div class="m-grid2">${field('Projet *', FIL.projet)}${field('Client / Société', FIL.client)}</div>`
          + field('Représentant présent', FIL.contact, { wide: true })
          + `<div class="m-txt"><b>${L('🔍 Points d\'inspection')}</b> ${btn('🎙️ Voix')}${btn('+ Ajouter')}</div>`
          + `<div class="m-grid2"><span class="m-val">Façade Nord</span><span class="m-val">${L('✅ OK')} · ${L('⚠️ Remarque')} · ${L('❌ Défaut')} · ${L('⏳ En attente')}</span></div>`
          + field('Notes générales', 'Réception en présence du client.', { wide: true })
          + `<div class="m-row right">${btn('✅ Créer le Handover', 'primary')}</div>`),
        steps([
          `Onglet ${q('🧾 Handover')} › ${q('+ Nouveau Handover')} : projet et client pré-remplis.`,
          'Un point par zone inspectée : nom, statut, commentaire, photo(s).',
          `${q('🎙️ Voix')} pour dicter le nom d\'une zone.`,
          `${q('Notes générales')} : elles deviennent « Remarques / Réservations » dans le PDF.`,
          `${q('✅ Créer le Handover')}.`,
        ]) + callout('warn', 'La date de réception et l\'e-mail saisis ici ne sont pas enregistrés : le PDF prend la date de création, et le PDF signé part à l\'e-mail de la fiche client.')),
      visual: 'Maquette de la fenêtre + étapes.',
      notes: 'La personne qui crée le handover en devient le Site Manager : c\'est elle qui recevra le PDF signé.',
    },
    {
      title: 'La fiche du handover',
      body: () => cols(
        steps([
          `Sur la carte : ${q('👁️ Ouvrir')}.`,
          `${q('+ Point')} pour ajouter une zone ; le statut de chaque zone se change directement.`,
          `${q('✏️ Modifier')} › ${q('📋 Étendue des travaux (Scope of work)')} et le nom du client.`,
          'Section check-list : état de la check-list de montage, « ✍️ Remplir ».',
        ]),
        callout('info', `Dans ${q('📝 Handover Certificate — Champs')}, seuls <b>Client</b> et <b>Étendue des travaux</b> passent dans le PDF aujourd\'hui. Laissez l\'étendue vide pour un texte automatique.`)
        + callout('warn', 'Un point d\'inspection ne peut plus être supprimé ni renommé une fois créé : relisez avant de créer.')),
      visual: 'Étapes + encadrés.',
      notes: 'Le champ « Comments / Reservations » ne fonctionne pas : utilisez les Notes générales à la création.',
    },
    {
      title: 'Faire signer sur place',
      body: () => cols(
        capture('C-07', 'Fiche handover ouverte, section « ✍️ Signatures »', 'cadre Site Manager signé, cadre Client vide', `${FIL.projet}, client ${FIL.client}`),
        steps([
          'Dans la fiche, section ✍️ Signatures : deux cadres, Site Manager et Client.',
          'Chacun signe au doigt ou à la souris, puis « ✅ Valider ».',
          'Quand les <b>deux</b> signatures sont là, le handover passe en « ✅ Signé ».',
        ]) + callout('warn', 'La signature sur place n\'est pas bloquée par la check-list : vérifiez-la <b>avant</b> de faire signer.')),
      visual: 'Capture + étapes.',
      notes: '',
    },
    {
      title: 'Faire signer à distance : 🔗 le lien client',
      body: () => cols(
        win('🔗 Lien de Signature Client', `<div class="m-txt">Envoyez ce lien au client :</div><div class="m-grid2"><span class="m-val">https://…/sign-handover…</span>${btn('📋 Copier')}</div><div class="m-txt">🔒 Lien à usage unique — expire après la première signature</div><div class="m-row right">${btn('Fermer', 'outline')}${btn('📧 Envoyer par email', 'primary')}</div>`),
        steps([
          `Carte ou fiche › ${q('🔗 Signer')}.`,
          'Check-list incomplète ? VEM bloque (chapitre 10) : complétez-la.',
          `${q('📋 Copier')} le lien, ou ${q('📧 Envoyer par email')} (votre messagerie s\'ouvre : saisissez le destinataire).`,
          'Le client ouvre le lien sur téléphone ou ordinateur, tape son nom et signe.',
        ]) + callout('info', 'Générer un nouveau lien désactive l\'ancien.')),
      visual: 'Fenêtre du lien recréée + étapes.',
      notes: 'Le lien n\'expire pas dans le temps : il ne sert qu\'une fois.',
    },
    {
      title: 'Ce que voit le client, ce qui se passe ensuite',
      body: () => cols(
        ul([
          'Page en français : infos du projet, étendue des travaux, zones inspectées, check-list de montage (sans les points N.A.).',
          `Il saisit « Votre nom complet », signe, ${q('✅ Valider la signature')}.`,
        ]),
        ul([
          'Le PDF signé est rangé dans les Fichiers du projet.',
          'Il est envoyé par e-mail à la <b>personne qui a créé le handover</b> et à l\'<b>e-mail de la fiche client</b>.',
          'Le handover passe « ✅ Signé » si le Site Manager a aussi signé dans la fiche.',
        ]) + callout('warn', `Le statut du <b>projet</b> ne change pas : passez-le vous-même en ${q('🧾 Handover OK')}.`)),
      visual: 'Deux colonnes : côté client / côté VEM.',
      notes: 'Sans e-mail sur la fiche client, le client ne reçoit pas le PDF : envoyez-le avec 📤.',
    },
    {
      title: 'PDF et envoi',
      body: () => cols(
        steps([
          `<b>Depuis la fiche ouverte</b> (${q('👁️ Ouvrir')}) : ${q('📄 PDF')} → ${q('🇫🇷 Français')} ou ${q('🇬🇧 English')}.`,
          `${q('📤 Envoyer')} : langue, équipe, client (coché par défaut), adresses manuelles.`,
        ]),
        callout('warn', 'Utilisez le 📄 PDF <b>de la fiche ouverte</b>. Celui de la carte dans l\'onglet ne fonctionne pas, et celui de la page Menu › Handover produit un ancien PDF (sans signatures).')
        + callout('info', 'Chaque PDF téléchargé est aussi rangé dans 📁 Fichiers.')),
      visual: 'Étapes + encadrés.',
      notes: '',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        'Créer le handover depuis le menu global au lieu de l\'onglet du projet.',
        'Faire signer avant d\'avoir terminé la check-list.',
        'Compter sur la date ou l\'e-mail saisis à la création (non enregistrés).',
        'Oublier de passer le projet en 🧾 Handover OK.',
        'Fiche client sans e-mail → le client ne reçoit pas le PDF signé.',
        'Supprimer un handover (🗑️ sur la carte) : définitif, ne le faites pas.',
      ]),
      visual: 'Liste.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercice — réceptionner le projet démo',
      body: () => cols(steps([
        'Créez un handover pour le projet démo avec 3 zones (Façade Nord OK, Escalier Remarque, Toiture OK).',
        'Saisissez l\'étendue des travaux dans ✏️ Modifier.',
        'Générez le lien 🔗 et notez ce qui se passe si la check-list n\'est pas finie.',
        'Téléchargez le PDF en anglais depuis la fiche, puis passez le projet en 🧾 Handover OK.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Onglet Handover du projet.',
        'Check-list finie avant la signature.',
        'PDF depuis la fiche ouverte.',
        'Statut projet : à la main.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Durée : 10 minutes.',
    },
  ],
};
