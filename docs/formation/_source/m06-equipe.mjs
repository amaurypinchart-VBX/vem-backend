import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'equipe', num: 6, icon: '👥', title: 'L\'équipe',
  public: 'Project & Technical Managers', duree: '25 min', parcours: 'Bureau',
  slides: [
    {
      title: 'Objectif & où la trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : chaque personne a son compte, et chaque projet a son équipe (avec la phase).',
          '<b>Pour qui</b> : Project et Technical Managers (création des comptes : admin, Project Manager, Technical Manager).',
        ]) + path(['👥 Équipe', '+ Nouveau membre']) + path(['🏗️ Projets', '~projet', '👥 Équipe', '+ Ajouter à l\'équipe']),
        callout('info', 'Deux niveaux : la <b>page Équipe</b> (tous les comptes VEM) et l\'<b>onglet Équipe d\'un projet</b> (qui travaille sur ce chantier).')),
      visual: 'Objectif + deux chemins.',
      notes: 'Les membres sont regroupés par rôle sur la page Équipe.',
    },
    {
      title: 'Créer un membre',
      body: () => cols(
        win('👤 Nouveau Membre',
          `<div class="m-row">${btn('📷 Scanner la carte', 'blue')}${btn('🖼️ Depuis galerie')}</div>`
          + `<div class="m-grid2">${field('Prénom *', 'Luc')}${field('Nom *', 'Essai')}</div>`
          + `<div class="m-grid2">${field('Email *', 'luc.essai@…')}${field('Téléphone', '+32 470 …')}</div>`
          + `<div class="m-grid2">${field('Rôle', '🔧 Installateur')}${field('Sous-équipe', '— Aucune —')}</div>`
          + `<div class="m-row right">${btn('✅ Créer le compte', 'primary')}</div>`, { sub: 'Fiche membre complète' }),
        steps([
          `${q('👥 Équipe')} › ${q('+ Nouveau membre')}.`,
          `Option : ${q('📷 Scanner la carte')} — l\'IA remplit l\'identité (la photo de la carte n\'est pas conservée).`,
          `${q('Prénom *')}, ${q('Nom *')}, ${q('Email *')}, téléphone, ${q('Rôle')}.`,
          `${q('✅ Créer le compte')} : le mot de passe par défaut est affiché dans la fenêtre.`,
          'Communiquez-le à la personne et demandez-lui de le changer (Mon profil).',
        ]) + callout('warn', 'Le téléphone est très utile : il apparaît dans le briefing (slide Équipe).')),
      visual: 'Maquette de la fenêtre + étapes.',
      notes: 'La photo de profil et les sous-équipes ne sont pas fiables aujourd\'hui : ne comptez pas dessus.',
    },
    {
      title: 'Donner un accès : invitation ou mot de passe temporaire',
      body: () => cols(
        `<div class="sub-t">${L('🔗 Inviter')} (lien)</div>` + steps([
          `${q('👥 Équipe')} › ${q('🔗 Inviter')} : choisissez ${q('Rôle attribué')}, éventuellement l\'e-mail.`,
          `${q('🔗 Générer le lien')} : le lien est copié.`,
          'La personne crée son compte elle-même.',
        ]) + callout('warn', 'Lien valable <b>15 minutes</b>, une seule fois. Réservé aux admins et Project Managers.'),
        `<div class="sub-t">${L('📧 Envoyer invitation')} (compte existant)</div>` + steps([
          'Ouvrez la fiche du membre (clic sur sa carte).',
          `${q('📧 Envoyer invitation')} : il reçoit un mot de passe temporaire valable 15 min.`,
          `À la connexion : ${q('🔐 Choisissez votre mot de passe')}.`,
        ]) + callout('tip', 'C\'est aussi la solution en cas de <b>mot de passe oublié</b>.')),
      visual: 'Deux colonnes : lien d\'invitation / mot de passe temporaire.',
      notes: 'Envoyer invitation remplace le mot de passe actuel du membre et le déconnecte partout.',
    },
    {
      title: 'Ajouter l\'équipe à un projet',
      body: () => cols(
        win('👷 Ajouter à l\'équipe', field('Membre', `${FIL.siteManager} (site_manager)`) + field('Rôle sur ce projet', '🏗️ Site Manager') + field('Phase d\'intervention', '🔄 Les deux phases (installation + démontage)') + `<div class="m-row right">${btn('✅ Ajouter', 'primary')}</div>`),
        steps([
          `Fiche projet › onglet ${q('👥 Équipe')} › ${q('+ Ajouter à l\'équipe')}.`,
          `${q('Membre')}, ${q('Rôle sur ce projet')} (Installateur, Site Manager, Technical Manager, Ouvrier, Engineer).`,
          `${q('Phase d\'intervention')} : les deux, installation seule ou démontage seul.`,
          `${q('✅ Ajouter')}. Répétez pour chaque personne.`,
        ]) + callout('info', 'La phase se change ensuite directement dans le tableau. Pour changer le rôle : retirez (✕) puis rajoutez la personne.')),
      visual: 'Maquette de la fenêtre + étapes.',
      notes: 'Aucune notification n\'est envoyée automatiquement à l\'ajout : utilisez 📤 (slide suivante).',
    },
    {
      title: 'Prévenir un membre : 📤',
      body: () => cols(
        win('📤 Envoyer à Paul Démo', `<div class="m-txt"><b>${L('Quoi envoyer ?')}</b></div>`
          + ['📌 Notification d\'assignation', '📋 Infos du projet', '🚚 Ses réservations', '📄 Derniers rapports'].map((x) => `<div class="m-txt">☑ ${L(x)}</div>`).join('')
          + `<div class="m-txt"><b>${L('Canal')}</b> : ${L('📱 Notif')} · ${L('✉️ Email')} · ${L('📱+✉️ Les deux')}</div><div class="m-row right">${btn('📤 Envoyer', 'primary')}</div>`, { free: true }),
        ul([
          'Sur la ligne du membre (onglet 👥 Équipe) : bouton 📤.',
          'Cochez ce qu\'il doit recevoir : infos du projet, ses réservations (transport + hôtel), derniers rapports.',
          'Choisissez le canal et ajoutez un mot personnel si besoin.',
        ]) + callout('tip', 'Idéal juste avant le départ : chacun reçoit ses horaires de train et son hôtel.')),
      visual: 'Fenêtre 📤 recréée + explications.',
      notes: 'L\'option « 📊 Briefings » envoie seulement un lien vers VEM, pas le PDF : envoyez plutôt le PDF du briefing.',
    },
    {
      title: 'À quoi sert l\'équipe du projet',
      body: () => `<div class="feeds">${[
        ['📋 Briefing', 'Slide « Équipe » : nom, rôle, phase, téléphone'],
        ['📧 Mails de voyage', 'Un trajet n\'est créé par mail que si la personne est dans l\'équipe'],
        ['☑️ Check-list', 'Installateurs et Site Managers ne voient la check-list que des projets où ils sont dans l\'équipe'],
        ['✈️ Bookings', 'Transports et hôtels par membre et par phase'],
        ['📊 Rapport IA', 'Section Vue d\'ensemble : équipe'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Carte « Équipe du projet » et flèches.',
      notes: 'Un Site Manager absent de l\'équipe ne pourra pas remplir la check-list du projet.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        `Cocher l\'équipe dans le formulaire « Nouveau Projet » → non enregistré. Utilisez l\'onglet ${q('👥 Équipe')}.`,
        'Créer un membre avec « + Créer membre » depuis un projet ne l\'ajoute pas au projet : ajoutez-le ensuite.',
        'Lien d\'invitation envoyé trop tard → expiré après 15 minutes.',
        'Garder le mot de passe par défaut → à changer immédiatement.',
        'Sous-équipes : elles ne sont visibles que sur l\'ordinateur de la personne qui les a créées.',
        'Personne qui quitte l\'entreprise : demandez à un admin (pas de bouton de désactivation).',
      ]),
      visual: 'Liste.',
      notes: 'Les données d\'identité (registre national…) sont visibles par tous les comptes : n\'en saisissez que si nécessaire.',
    },
    {
      kind: 'exercise', title: 'Exercice — l\'équipe du projet démo',
      body: () => cols(steps([
        `Ajoutez à ${FIL.ref} : ${FIL.siteManager} (Site Manager, les deux phases), ${FIL.techManager} (Technical Manager), ${FIL.installateur} (Installateur, installation seule).`,
        `Passez ${FIL.installateur} en « les deux phases » dans le tableau.`,
        `Envoyez à ${FIL.siteManager}, par 📤, les infos du projet.`,
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Comptes : page Équipe. Projet : onglet Équipe.',
        'Phase = installation, démontage ou les deux.',
        'Équipe d\'abord, mails de voyage ensuite.',
        'Mot de passe oublié → Envoyer invitation.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Durée : 5 minutes.',
    },
  ],
};
