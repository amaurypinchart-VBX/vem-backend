import { q, L, btn, tabs, field, win, menu, steps, callout, capture, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'intro', num: 0, icon: '🚀', title: 'Bienvenue dans VEM',
  public: 'Tout le monde', duree: '30 min', parcours: 'Tronc commun',
  slides: [
    {
      kind: 'cover', title: 'Formation VEM',
      body: () => `<div class="cover-sub">ViewBox Event Manager</div>
        <div class="cover-line">Créer, alimenter et suivre un projet de A à Z</div>
        <div class="cover-meta">Viewbox International · Tubize</div>`,
      visual: 'Page de garde : fond navy, titre blanc, filet rouge.',
      notes: 'Présentez-vous, le déroulé et la durée. Rappelez que tout ce qui est montré existe réellement dans VEM aujourd\'hui.',
    },
    {
      title: 'Pourquoi cette formation ?',
      body: () => cols(
        ul([
          'VEM fonctionne, mais il est <b>trop peu rempli</b>.',
          'Un projet bien rempli produit <b>tout seul</b> : le briefing, le rapport, le calendrier, le PDF de handover.',
          'Un projet vide oblige chacun à <b>redemander</b> les infos par téléphone ou par mail.',
        ]),
        callout('info', 'Objectif : qu\'à la fin, chacun sache <b>quoi</b> remplir, <b>quand</b>, et <b>par quel canal</b> (formulaire ou mail).')),
      visual: 'Deux colonnes : constat à gauche, encadré objectif à droite.',
      notes: 'Insistez : ce n\'est pas de l\'administratif en plus, c\'est ce qui évite les oublis sur chantier.',
    },
    {
      title: 'Comment utiliser ce support',
      body: () => cols(
        ul([
          '<b>← →</b> ou espace : slide suivante / précédente. Sur téléphone : glissez.',
          '<b>☰ Sommaire</b> en haut : accès direct à chaque chapitre.',
          'Dans VEM : menu <b>🎓 Formation VEM</b> (section Aide), réservé aux personnes connectées.',
          '<b>N</b> : afficher les notes de l\'animateur. <b>Ctrl + P</b> : imprimer (une slide par page).',
        ]),
        table(['Parcours', 'Pour qui', 'Chapitres'], [
          ['🟦 Tronc commun', 'Tout le monde', 'Bienvenue · Règle du mail · Dashboard · Mise en pratique'],
          ['🟥 Bureau', 'Sales, Customer Service, Project &amp; Technical Managers', 'Clients · Créer un projet · Mails · Fiche projet · Équipe · Logistique · Bookings · Fichiers · Briefing · Rapport IA'],
          ['🟩 Terrain', 'Site Managers, installateurs (sur téléphone)', 'Check-list · Daily Reports · Handover · Fichiers / photos par mail'],
        ], { small: true })),
      visual: 'Liste des commandes à gauche, tableau des 3 parcours à droite.',
      notes: 'Le support est un fichier unique : il s\'ouvre dans n\'importe quel navigateur, même sans connexion.',
    },
    {
      title: 'Notre projet fil rouge (fictif)',
      body: () => cols(
        table(['Donnée', 'Valeur'], [
          ['Projet', FIL.projet], ['N° interne', `<b>${FIL.ref}</b>`], ['Client', FIL.client],
          ['Contact client', `${FIL.contact} (${FIL.contactFonction})`], ['Adresse', FIL.adresse],
          ['Installation', `${FIL.instStart} → ${FIL.instEnd}`], ['Démontage', `${FIL.disStart} → ${FIL.disEnd}`],
          ['Équipe', `${FIL.siteManager} (Site Manager), ${FIL.techManager} (Technical Manager), ${FIL.installateur} (Installateur)`],
        ], { small: true }),
        callout('info', `Format du N° interne Viewbox : <b>4 chiffres + 4 à 6 lettres + VIE</b>.<br>Exemple réel : <code>6055RKLOKVIE</code> · Notre démo : <code>${FIL.ref}</code>`)
        + callout('warn', 'Toutes les données de ce support sont fictives : n\'utilisez pas ce projet en production.')),
      visual: 'Fiche d\'identité du projet démo + encadré format du N° interne.',
      notes: 'Ce projet revient dans tous les exercices. Si vous faites les exercices dans VEM, supprimez ou archivez le projet démo à la fin avec l\'accord d\'un admin.',
    },
    {
      title: 'Se connecter',
      body: () => cols(
        win('Connexion', field('Email', 'prenom.nom@…') + field('Mot de passe', '••••••••')
          + `<div class="m-row">${btn('Se connecter', 'primary')}</div><div class="m-link">${L('🔑 Mot de passe oublié ?')}</div>`, { sub: 'Accédez à votre espace de gestion' }),
        steps([
          `Ouvrez VEM, saisissez ${q('Email')} et ${q('Mot de passe')}, puis ${q('Se connecter')}.`,
          'La session dure <b>8 heures</b>. Ensuite, VEM vous renvoie à l\'écran de connexion : enregistrez votre travail avant une longue pause.',
          `Premier accès avec un mot de passe temporaire : VEM ouvre ${q('🔐 Choisissez votre mot de passe')} (8 caractères min.).`,
        ])
        + callout('warn', `Mot de passe oublié : le lien ${q('🔑 Mot de passe oublié ?')} ne fonctionne pas pour l\'instant. <b>Demandez à un admin ou un Project Manager</b> de vous renvoyer un accès (${q('📧 Envoyer invitation')}, valable 15 min).`)),
      visual: 'Maquette de l\'écran Connexion à gauche, étapes à droite.',
      notes: 'La case « Rester connecté » n\'a pas d\'effet aujourd\'hui : ne la présentez pas comme une option. Le mail de mot de passe temporaire s\'appelle « Votre acces VEM - mot de passe temporaire ».',
    },
    {
      title: 'Mon profil : changer son mot de passe',
      body: () => cols(
        steps([
          `Cliquez sur vos initiales en haut à droite (ou votre nom en bas du menu) › ${q('👤 Mon profil')}.`,
          `${q('🔑 Changer mon mot de passe')} : ancien, nouveau (8 caractères min.), confirmation.`,
          `${q('💾 Valider')} → message « Mot de passe modifié ✅ ».`,
        ]),
        callout('ok', 'Compte créé avec le mot de passe par défaut annoncé dans la fiche membre ? <b>Changez-le dès la première connexion</b> : VEM ne l\'impose pas.')
        + callout('info', 'Le profil ne permet de changer que le mot de passe. Nom, e-mail, téléphone : demandez à un admin ou un Project Manager.')),
      visual: 'Étapes numérotées + deux encadrés.',
      notes: 'Ne jamais partager un compte : la personne connectée est enregistrée comme auteur des rapports.',
    },
    {
      title: 'Le menu (ordinateur)',
      body: () => cols(
        menu([
          ['Principal', ['!📊 Dashboard', '🏗️ Projets']],
          ['Terrain', ['📓 Daily Reports', '🧾 Handover']],
          ['Admin', ['☑️ Templates check-list', '🏢 Clients', '👥 Équipe', '🔔 Notifications']],
        ]),
        ul([
          `<b>Principal</b> : le tableau de bord et la liste de tous les projets.`,
          `<b>Terrain</b> : les rapports journaliers et les handovers de tous les projets.`,
          `<b>Admin</b> : la bibliothèque de check-list, les clients, les membres, vos notifications.`,
          `Le bouton ${q('‹')} replie le menu (choix mémorisé).`,
        ]) + callout('warn', `Vous verrez aussi ${q('✅ Tâches')}, ${q('📸 Visites Client')} et ${q('📋 Templates tâches')} : <b>ne les utilisez plus</b>. Le suivi se fait désormais par la <b>check-list</b> (chapitre 10).`)),
      visual: 'Maquette du menu latéral (sections Principal / Terrain / Admin) à gauche.',
      notes: 'Tout le monde voit la même navigation, y compris la section Admin. Certaines actions restent réservées (slide suivante).',
    },
    {
      title: 'Sur téléphone',
      body: () => cols(
        `<div class="m-phone"><div class="m-phone-screen">${capture('C-01', 'VEM sur téléphone, page Dashboard', 'barre du bas visible, menu ＋ ouvert', 'connecté comme Site Manager démo')}</div>
         <div class="m-bottom"><span>📊<br>${L('Dashboard')}</span><span>🏗️<br>${L('Projets')}</span><span class="fab">＋</span><span>☰<br>${L('Menu')}</span></div></div>`,
        steps([
          `Barre du bas : ${q('Dashboard')}, ${q('Projets')}, bouton rond <b>＋</b>, ${q('Menu')} (= le menu complet).`,
          `Le <b>＋</b> donne un accès direct à ${q('📓 Daily Report')} et ${q('🧾 Handover')}.`,
          'Les fenêtres s\'ouvrent en plein écran : fermez-les avec la croix <b>×</b>.',
        ]) + callout('tip', 'Ouvrez d\'abord le bon projet, puis utilisez ＋ : le projet est alors présélectionné.')),
      visual: 'Cadre de téléphone avec la barre du bas recréée + capture à faire.',
      notes: 'Le choix « 📸 Point visite » du bouton ＋ n\'est plus utilisé (module Visites client abandonné).',
    },
    {
      title: 'Le cycle de vie d\'un projet',
      body: () => `<div class="flow">${[
        ['Devis', '📝 Devis à valider → ✅ Devis validé'],
        ['Préparation', '🔧 En préparation'],
        ['Départ', 'Briefing'],
        ['Installation', '📍 Sur site → 🏗️ En installation'],
        ['Handover', '🧾 Handover OK'],
        ['Démontage', '🔨 Démontage'],
        ['Clôture', '🎉 Terminé'],
      ].map(([t, s]) => `<div class="flow-step"><div class="ft">${t}</div><div class="fs">${s}</div></div>`).join('')}</div>`
        + cols(callout('info', `Le statut se change dans la fiche projet (liste sous le nom). <b>Toute personne qui a accès à VEM</b> peut le faire, et il <b>ne change jamais tout seul</b> (ni à la signature du handover, ni aux dates).`),
          callout('warn', `Un projet neuf est en ${q('📄 Brouillon')} : la liste de statut paraît vide. Choisissez directement le bon statut (ex. ${q('📝 Devis à valider')}).`)),
      visual: 'Frise horizontale des 7 phases avec les statuts VEM sous chaque phase.',
      notes: 'Statuts sélectionnables : Devis à valider, Devis validé, En préparation, En installation, Sur site, Handover OK, Démontage, Terminé, Annulé.',
    },
    {
      title: 'Qui peut faire quoi ?',
      body: () => cols(
        ul([
          'Tout le monde voit <b>tous les menus et tous les projets</b>.',
          'Presque tout est modifiable par tous : c\'est pratique, mais cela demande de la discipline.',
        ]) + callout('no', '<b>Ne supprimez jamais</b> un projet, un client, un rapport ou un handover. Une suppression est définitive (pas de corbeille). En cas de doute : demandez à un admin.'),
        table(['Action réservée', 'Qui'], [
          ['Créer un membre', 'Admin, Project Manager, Technical Manager'],
          ['Modifier un autre membre, inviter, renvoyer un accès', 'Admin, Project Manager'],
          ['Configurer une check-list', 'Admin, Technical Manager, Project Manager'],
          ['Remplir une check-list', '+ Site Manager (sur ses projets)'],
          ['Installateur', 'Voit la check-list de ses projets, sans la remplir'],
          ['Générer le lien de signature malgré une check-list incomplète', 'Admin, Technical Manager'],
        ], { small: true })),
      visual: 'Règle de discipline à gauche, tableau des actions réservées à droite.',
      notes: 'Si un bouton affiche « Permission insuffisante », c\'est normal : l\'action est réservée.',
    },
    {
      title: 'Les 6 règles d\'or',
      body: () => `<div class="golden">${[
        ['1', 'Un projet = un N° interne', `Au format Viewbox (ex. <code>${FIL.ref}</code>). Sans N° interne, le projet ne peut pas recevoir de mails.`],
        ['2', 'Tout passe par VEM', 'Fichiers, plans, réservations : dans le projet, par le formulaire ou par mail.'],
        ['3', 'Vérifiez ce que crée un mail', 'Projets, camions, hôtels et trajets créés par mail arrivent en brouillon : relisez-les.'],
        ['4', 'La check-list au jour le jour', 'Elle remplace les tâches et conditionne la signature du handover.'],
        ['5', 'Un daily par jour de chantier', 'Avec photos : c\'est la mémoire du projet et la base du rapport.'],
        ['6', 'Ne jamais supprimer', 'Archivez un projet ; demandez à un admin pour le reste.'],
      ].map(([n, t, d]) => `<div class="gold"><div class="gn">${n}</div><div><div class="gt">${t}</div><div class="gd">${d}</div></div></div>`).join('')}</div>`,
      visual: 'Grille de 6 cartes numérotées.',
      notes: 'Ces règles reviennent dans chaque chapitre. Vous pouvez les imprimer en fin de formation.',
    },
  ],
};
