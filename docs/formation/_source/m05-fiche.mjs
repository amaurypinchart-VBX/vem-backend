import { q, L, btn, tabs, field, win, steps, callout, capture, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

const STATUTS = ['📝 Devis à valider', '✅ Devis validé', '🔧 En préparation', '🏗️ En installation', '📍 Sur site', '🧾 Handover OK', '🔨 Démontage', '🎉 Terminé', '❌ Annulé'];

export default {
  key: 'fiche-projet', num: 5, icon: '📋', title: 'La fiche projet',
  public: 'Tout le monde', duree: '30 min', parcours: 'Bureau',
  slides: [
    {
      title: 'Objectif & où la trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : savoir lire et tenir à jour la fiche d\'un projet, le point central de VEM.',
          '<b>Pour qui</b> : tout le monde.',
        ]) + path(['🏗️ Projets', '~clic sur la carte du projet'])
        + `<div class="m-search">${L('Rechercher un projet...')} · ${L('Tous les statuts')} · ${L('Trier par...')} · ${L('📦 Voir archivés')}</div>`,
        callout('tip', 'La recherche porte sur le <b>nom</b> et le <b>N° interne</b> (pas le client). Le plus rapide : tapez le N° interne.')
        + callout('info', `Les projets ${q('🎉 Terminé')} et archivés sont masqués : cochez ${q('📦 Voir archivés')} pour les revoir.`)),
      visual: 'Objectif + chemin + barre de recherche recréée.',
      notes: 'Le tri « 📐 Installation (plus proche) » est pratique pour préparer la semaine.',
    },
    {
      title: 'L\'en-tête de la fiche',
      body: () => `<div class="m-header"><div class="mh-l">${btn('← Retour', 'outline')}<div><div class="mh-t">${FIL.projet}</div><div class="mh-s">${FIL.ref} · ${FIL.client} <span class="m-select">${L('📝 Devis à valider')} ▾</span></div></div></div>
        <div class="mh-r">${btn('✏️ Modifier')}${btn('📊 Rapport IA')}${btn('🧾 Handover')}${btn('🛠️ Ticket', 'ghost dim')}${btn('📋 Plusieurs tâches', 'ghost dim')}${btn('➕ 1 tâche', 'primary dim')}${btn('📦')}</div></div>`
        + table(['Bouton', 'À utiliser ?'], [
          [L('✏️ Modifier'), '✅ Corriger les infos du projet (slide suivante).'],
          [L('📊 Rapport IA'), '✅ Générer un rapport (chapitre 14).'],
          [L('🧾 Handover'), '⚠️ Ouvre la page de <b>tous</b> les handovers : préférez l\'<b>onglet</b> 🧾 Handover du projet.'],
          [`${L('🛠️ Ticket')} · ${L('📋 Plusieurs tâches')} · ${L('➕ 1 tâche')}`, '❌ Ne plus utiliser (tickets et tâches abandonnés).'],
          [L('📦'), '✅ Archiver un projet terminé ou annulé (jamais supprimer).'],
        ], { small: true }),
      visual: 'Maquette de l\'en-tête (boutons à ne plus utiliser grisés) + tableau.',
      notes: 'Les boutons grisés sur la maquette sont encore visibles dans l\'app : dites-le clairement.',
    },
    {
      title: 'Les onglets',
      body: () => tabs(['📋 Infos', '📓 Daily Reports', '🧾 Handover', '👥 Équipe', '🚛 Logistique', '✈️ Bookings', '📋 Briefing', '📁 Fichiers'])
        + table(['Onglet', 'Contenu', 'Chapitre'], [
          [L('📋 Infos'), 'Résumé, notes, contact client, progression, check-list de préparation, fichiers', '5'],
          [L('📓 Daily Reports'), 'Check-list de montage / démontage + rapports journaliers', '10 · 11'],
          [L('🧾 Handover'), 'Rappel check-list + handovers du projet', '12'],
          [L('👥 Équipe'), 'Membres du projet, phase, envoi d\'infos', '6'],
          [L('🚛 Logistique'), 'Camions, grues, nacelles…', '7'],
          [L('✈️ Bookings'), 'Transports et hôtels de l\'équipe', '8'],
          [L('📋 Briefing'), 'Briefing Studio', '13'],
          [L('📁 Fichiers'), 'Plans, photos, PDF, 3D', '9'],
        ], { small: true }) + callout('warn', `L\'onglet ${q('📸 Visites Client')} est encore visible : ne l\'utilisez plus.`),
      visual: 'Barre d\'onglets recréée + tableau de correspondance.',
      notes: 'Deux onglets ont la même icône 📋 : Infos et Briefing.',
    },
    {
      title: 'L\'onglet 📋 Infos',
      body: () => cols(
        ul([
          `<b>Check-list de préparation</b> (en haut) : les points à vérifier avant le montage (chapitre 10).`,
          `<b>${L('📋 Informations')}</b> : client, N° interne, dates, ouvriers, statut, adresse, description.`,
          '<b>📝 Notes complémentaires</b> : 🌐 Global, 🔨 Installation, 🔧 Démontage.',
          `<b>${L('📞 Contact client')}</b> : contact principal ★, téléphone et e-mail cliquables.`,
          `<b>${L('📊 Progression')}</b> : % de points de check-list OK ou N.A.`,
          '<b>🚛 Logistique — Dates clés</b> : chargement, départ, arrivée des véhicules.',
          '<b>📁 Fichiers</b> : aperçu + encadré « Envoyer des fichiers par email ».',
        ]),
        capture('C-02', 'Fiche projet, onglet 📋 Infos', 'projet démo rempli, faire défiler pour montrer notes + progression', `${FIL.projet} / ${FIL.ref}`)
        + callout('info', 'La progression suit uniquement la <b>check-list</b> (plus les tâches). Sans check-list configurée : « — ».')),
      visual: 'Liste des blocs + capture réelle de l\'onglet Infos.',
      notes: 'L\'heure d\'une date n\'est affichée que si elle n\'est pas minuit.',
    },
    {
      title: 'Le statut du projet',
      body: () => cols(
        `<div class="m-dropdown">${STATUTS.map((s) => `<div>${L(s)}</div>`).join('')}</div>`,
        table(['Quand', 'Statut à choisir'], [
          ['Devis envoyé', L('📝 Devis à valider')], ['Devis accepté', L('✅ Devis validé')],
          ['Préparation entrepôt, achats, bookings', L('🔧 En préparation')], ['Équipe arrivée', L('📍 Sur site')],
          ['Montage en cours', L('🏗️ En installation')], ['Handover signé', L('🧾 Handover OK')],
          ['Démontage en cours', L('🔨 Démontage')], ['Tout est rentré', L('🎉 Terminé')],
          ['Projet abandonné', L('❌ Annulé')],
        ], { small: true }) + callout('warn', 'Le statut ne change <b>jamais</b> automatiquement. La personne qui fait l\'étape met le statut à jour.')),
      visual: 'Liste déroulante recréée + tableau quand / statut.',
      notes: 'Changer la valeur enregistre tout de suite (« Statut du projet mis à jour ✅ »). Le compteur « Projets actifs » du Dashboard ne compte que En préparation, En installation et Sur site.',
    },
    {
      title: '✏️ Modifier un projet',
      body: () => cols(
        steps([
          `${q('✏️ Modifier')} ouvre ${q('✏️ Modifier le projet')} (même formulaire que la création).`,
          'Modifiables : nom, client, N° interne, ouvriers, adresse, dates, description, les 3 notes.',
          `${q('💾 Enregistrer les modifications')}.`,
        ]),
        callout('warn', `Les blocs Équipe, Tâches et Logistique s\'affichent aussi, mais <b>ne sont pas enregistrés</b> ici. Un véhicule se modifie <b>dans l\'onglet ${q('🚛 Logistique')}</b>.`)
        + callout('info', 'Vider une date de démontage ou la description ne l\'efface pas. Les 3 notes, elles, s\'effacent.')),
      visual: 'Étapes + encadrés.',
      notes: 'Le statut ne se change pas ici mais dans la liste de l\'en-tête.',
    },
    {
      title: 'Archiver (et ne jamais supprimer)',
      body: () => cols(
        win('📦 Archiver le projet', `<div class="m-opt">${L('📦 Archiver le projet')}<small>Le projet est conservé mais masqué de la liste active. Récupérable à tout moment.</small></div>
          <div class="m-opt">${L('♻️ Restaurer le projet')}<small>Remettre le projet en statut actif.</small></div>
          <div class="m-opt danger">${L('🗑️ Supprimer définitivement')}<small>Action irréversible — toutes les données seront perdues.</small></div>`, { free: true }),
        ul([
          `Archiver = statut ${q('❌ Annulé')} (même chose).`,
          `Restaurer = statut ${q('✔️ Confirmé')} : choisissez ensuite le bon statut.`,
          'Supprimer efface tout : daily reports, handovers, fichiers, équipe, camions.',
        ]) + callout('no', '<b>Ne supprimez jamais un projet.</b> Pour un projet fini : statut 🎉 Terminé. Pour un projet abandonné : 📦 Archiver.')),
      visual: 'Fenêtre Archiver recréée (option Supprimer en rouge) + règles.',
      notes: 'Seuls les rôles qui voient tous les projets peuvent supprimer un projet ; c\'est aussi une règle de conduite pour eux.',
    },
    {
      title: 'Un projet est « complet » quand…',
      body: () => table(['Avant…', 'Doit être rempli'], [
        ['Devis validé', 'Client complet · N° interne · adresse · dates d\'installation (et démontage) · description'],
        ['Départ (briefing)', 'Équipe + phases · camions & engins · transports & hôtels · notes · plans dans Fichiers · check-lists configurées'],
        ['Handover', 'Check-list de montage remplie et validée · daily reports de chaque jour · photos'],
        ['Clôture', 'Handover signé · statut 🎉 Terminé · check-list de démontage · fichiers rangés'],
      ]) + `<div class="cap-note">Version détaillée : fiche « Checklist projet complet » à la fin du support.</div>`,
      visual: 'Tableau en 4 étapes.',
      notes: 'Cette grille est reprise dans 04_CHECKLIST_PROJET_COMPLET.md.',
    },
    {
      kind: 'exercise', title: 'Exercice — tenir la fiche à jour',
      body: () => cols(steps([
        `Retrouvez le projet démo par son N° interne <code>${FIL.ref}</code>.`,
        `Passez-le en ${q('✅ Devis validé')}.`,
        `Ajoutez avec ${q('✏️ Modifier')} une note démontage : « Évacuation par le parking Nord ».`,
        'Trouvez où s\'affiche la note dans l\'onglet Infos.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Onglets = un sujet chacun.',
        'Statut : à la main, à chaque étape.',
        'Véhicules : onglet Logistique, pas ✏️ Modifier.',
        'Archiver, jamais supprimer.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Durée : 5 minutes.',
    },
  ],
};
