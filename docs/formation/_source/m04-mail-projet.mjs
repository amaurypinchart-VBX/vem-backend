import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';
import { MAIL } from './m03-mail-new.mjs';

export default {
  key: 'mail-projet', num: 4, icon: '📧', title: 'Compléter un projet par mail',
  public: 'Tout le monde (bureau et terrain)', duree: '25 min', parcours: 'Tronc commun',
  slides: [
    {
      title: 'Objectif & où trouver l\'adresse',
      body: () => cols(
        ul([
          '<b>Objectif</b> : envoyer dans le bon projet, depuis n\'importe quelle messagerie, des plans, des photos, des fichiers 3D, des confirmations de camion ou d\'hôtel.',
          '<b>Pour qui</b> : tout le monde, au bureau comme sur chantier.',
          `<b>Règle</b> : un mail à <b>${MAIL}</b> avec le <b>N° interne</b> du projet <b>n\'importe où</b> dans le sujet.`,
        ]),
        `<div class="m-mailbox"><div class="mb-t">📧 ${L('Envoyer des fichiers par email')}</div><div>Mail à <b>${MAIL}</b> avec <b>${FIL.ref}</b> dans le sujet</div><div class="mb-s">${L('⏱ Les fichiers apparaîtront dans les 5 minutes')}</div>${btn('📋 Copier')}</div>`
        + `<div class="cap-note">Encart visible dans l\'onglet ${L('📋 Infos')} › bloc ${L('📁 Fichiers')}. ${q('📋 Copier')} copie l\'adresse, le sujet et une ligne de rappel.</div>`),
      visual: 'Objectif à gauche, encadré orange « Envoyer des fichiers par email » recréé à droite.',
      notes: 'Le bouton Copier colle : « À: … / Sujet: <N° interne> / (Joindre les fichiers à envoyer dans le projet …) ».',
    },
    {
      title: 'Ce qui arrive dans le projet',
      body: () => `<div class="feeds">${[
        ['📎 Pièces jointes', `Toutes ajoutées dans ${L('📁 Fichiers')} (photos, PDF, Office, 3D…)`],
        ['🚛 Camions / engins', `Créés dans ${L('🚛 Logistique')} en brouillon`],
        ['🏨 Hôtels', `Créés dans ${L('✈️ Bookings')}, sans occupant`],
        ['✈️ Trajets d\'équipe', `Créés dans ${L('✈️ Bookings')} si la personne est déjà dans l\'équipe du projet`],
        ['🔔 Notification', `${L('🚛 Réservations créées depuis un email')} pour les admins et Project Managers`],
        ['❌ Notes du projet', 'Le texte du mail n\'est <b>pas</b> ajouté aux notes'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`
        + callout('info', 'Les réservations sont lues par l\'IA dans le <b>texte</b> du mail. Chacune porte la note « 📧 Créé auto depuis mail — à valider ».'),
      visual: 'Mail au centre et flèches vers Fichiers, Logistique, Bookings, Notifications.',
      notes: 'Si vous avez une info importante pour les notes (consigne d\'accès, horaire), ajoutez-la vous-même dans ✏️ Modifier.',
    },
    {
      title: 'Exemples de sujets',
      body: () => table(['Sujet', '', 'Résultat'], [
        [`<code>${FIL.ref}</code>`, '✅', 'Pièces jointes → Fichiers'],
        [`<code>Plans façade ${FIL.ref} v2</code>`, '✅', 'Le N° peut être au milieu'],
        [`<code>TR: Confirmation camion ${FIL.ref}</code>`, '✅', 'Camion lu dans le texte, créé en brouillon'],
        [`<code>Photos chantier Paddock</code>`, '❌', 'Pas de N° interne → mail ignoré, sans message'],
        [`<code>Photos 9999DEMOVI</code>`, '❌', 'N° incomplet ou mal tapé → ignoré'],
        [`<code>NEW ${FIL.ref}</code>`, '❌', 'NEW = création : le projet existe déjà → rien'],
      ]),
      visual: 'Tableau ✅ / ❌.',
      notes: 'Si plusieurs N° internes figurent dans le sujet, c\'est le plus long qui gagne : un seul N° par sujet, c\'est plus sûr.',
    },
    {
      title: 'Valider un camion créé par mail',
      body: () => cols(
        steps([
          `Onglet ${q('🚛 Logistique')} : le véhicule porte le badge gris « draft » (= brouillon).`,
          'Cliquez ✏️ sur la carte.',
          `Vérifiez type, plaques, chauffeur, lieux et dates. ${q('État du véhicule')} se place sur ${q('🟣 Planifié')}.`,
          'Effacez la mention « à valider » dans les notes.',
          `${q('💾 Enregistrer')} → le véhicule est validé.`,
        ]),
        callout('info', 'Il n\'y a pas de bouton « Valider » : enregistrer la fiche suffit.')
        + callout('tip', 'Lieu de chargement ou de déchargement à Tubize ? L\'entrepôt est prévenu automatiquement à la validation (changement de statut).')),
      visual: 'Étapes + encadrés.',
      notes: 'Tant qu\'il n\'est pas validé, un camion brouillon apparaît quand même sur le calendrier et le planning public.',
    },
    {
      title: 'Valider un hôtel ou un trajet créé par mail',
      body: () => cols(
        `<div class="sub-t">🏨 Hôtel</div>` + steps([
          `Onglet ${q('✈️ Bookings')} : carte hôtel avec ${q('👥 Occupants')} vide.`,
          '✏️ › cochez <b>au moins un occupant</b> (obligatoire pour enregistrer).',
          'Vérifiez dates et référence, effacez « à valider ».',
          `${q('💾 Enregistrer')}.`,
        ]),
        `<div class="sub-t">✈️ Trajet</div>` + steps([
          'Carte transport : le mode affiche ❔.',
          '✏️ › <b>re-choisissez le moyen de transport</b> aller et retour (sinon il est effacé).',
          'Vérifiez les dates de présence sur site.',
          `${q('💾 Enregistrer')}.`,
        ]) + callout('warn', 'Le trajet n\'est créé que si la personne citée est <b>déjà</b> dans l\'onglet 👥 Équipe. Ajoutez l\'équipe <b>avant</b> d\'envoyer les confirmations de voyage.')),
      visual: 'Deux colonnes Hôtel / Trajet.',
      notes: 'Les hôtels créés par mail n\'ont pas d\'occupant : l\'IA ne les rattache pas aux personnes.',
    },
    {
      title: 'Délais et « rien n\'est arrivé »',
      body: () => cols(
        steps([
          'Attendez <b>5 à 10 minutes</b>, puis rechargez la page du projet.',
          'Vérifiez le sujet : le N° interne est-il complet et exact ?',
          'Personne n\'a ouvert le mail dans la boîte Gmail ? Un mail déjà lu n\'est jamais traité.',
          'Toujours rien : renvoyez le mail avec le bon sujet, ou ajoutez les fichiers à la main (⬆️ Ajouter).',
        ]),
        callout('warn', 'VEM ne répond <b>jamais</b> à l\'expéditeur : ni accusé de réception, ni message d\'erreur.')
        + callout('info', 'Un fichier très lourd (plus de 10 Mo environ) peut être refusé : utilisez le lien 🔗 URL (chapitre 9).')),
      visual: 'Procédure de dépannage + encadrés.',
      notes: 'Les mails sans sujet sont ignorés.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        'Oublier le N° interne dans le sujet → mail perdu.',
        'Utiliser NEW pour un projet existant → rien.',
        'Mettre une consigne importante dans le mail et croire qu\'elle est dans les notes → elle n\'y est pas.',
        'Envoyer les billets de train avant d\'avoir ajouté la personne à l\'équipe → trajet ignoré.',
        'Oublier de valider les brouillons → camions et hôtels « à valider » qui traînent.',
        'Les logos et signatures du mail arrivent comme photos : faites le ménage dans Fichiers.',
      ]),
      visual: 'Liste.',
      notes: 'Rappel : un mail = un projet. Ne mélangez pas deux projets dans le même mail.',
    },
    {
      kind: 'exercise', title: 'Exercice — compléter le projet démo',
      body: () => cols(steps([
        `Copiez les instructions avec ${q('📋 Copier')} dans l\'onglet Infos du projet démo.`,
        `Rédigez le sujet d\'un mail qui envoie le plan PDF au projet <code>${FIL.ref}</code>.`,
        `Rédigez le texte d\'un mail de confirmation : camion ${FIL.camion}, chauffeur ${FIL.chauffeur}, chargement à l\'entrepôt de Tubize le 14/03/2027 à 14 h.`,
        'Listez les étapes pour valider ce camion une fois créé.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'N° interne dans le sujet, n\'importe où.',
        'Pièces jointes → Fichiers ; texte → réservations brouillon.',
        'Valider = ouvrir ✏️ et enregistrer.',
        'Rien dans les notes.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Si vous faites l\'exercice en réel, utilisez un projet de test.',
    },
  ],
};
