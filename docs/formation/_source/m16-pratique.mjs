import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';
import { MAIL } from './m03-mail-new.mjs';

export const MATRICE = [
  ['Devis', 'Sales / Customer Service', 'Client + contacts · projet (N° interne, adresse, dates) · statut Devis à valider', 'Formulaire ou mail NEW', 'PM, TM'],
  ['Devis validé', 'Sales / PM', 'Statut Devis validé · description · notes globales · plans et devis dans Fichiers', 'Formulaire, mail N° interne', 'Toute l\'équipe'],
  ['Préparation', 'PM / TM', 'Équipe + phases · camions & engins · transports & hôtels · notes installation / démontage · check-lists configurées', 'Onglets, mail N° interne', 'Entrepôt, équipe, calendrier'],
  ['Départ', 'PM / TM', 'Check-list de préparation · briefing Studio (🪄) · PDF envoyé à l\'équipe · 📤 infos à chaque membre', 'Studio, 📤', 'Équipe terrain'],
  ['Installation', 'Site Manager', 'Statut Sur site / En installation · check-list de montage chaque jour · daily report chaque jour · photos', 'Téléphone, mail N° interne', 'PM, client, rapport'],
  ['Handover', 'Site Manager / TM', 'Check-list validée · handover + signature · statut Handover OK', 'Onglet Handover, lien 🔗', 'Client, direction'],
  ['Démontage', 'Site Manager', 'Statut Démontage · check-list de démontage · daily reports · camions → Retour entrepôt', 'Téléphone', 'Entrepôt, PM'],
  ['Clôture', 'PM', 'Rapport IA · ménage des Fichiers · statut Terminé', 'Fiche projet', 'Direction'],
];

export default {
  key: 'pratique', num: 16, icon: '🏁', title: 'Mise en pratique & dépannage',
  public: 'Tout le monde', duree: '30 min', parcours: 'Tronc commun',
  slides: [
    {
      title: 'Qui remplit quoi, quand',
      body: () => table(['Phase', 'Qui', 'Quoi', 'Canal', 'Utilisé par'], MATRICE, { small: true }),
      visual: 'Matrice phase × qui × quoi × canal × utilisateurs.',
      notes: 'La même matrice est détaillée dans 01_PLAN_PEDAGOGIQUE.md.',
    },
    {
      title: 'Le projet démo de A à Z',
      body: () => `<div class="flow">${[
        ['1', 'Client', 'Demo Events SA + Jean Exemple ★'],
        ['2', 'Projet', `${FIL.ref}, dates, adresse, notes`],
        ['3', 'Équipe', 'Paul, Marie, Luc + phases'],
        ['4', 'Logistique', `Camion ${FIL.camion}, grue`],
        ['5', 'Bookings', `Train + ${FIL.hotel}`],
        ['6', 'Check-lists', 'Préparation + montage'],
        ['7', 'Briefing', '🪄 + PDF à l\'équipe'],
        ['8', 'Chantier', 'Daily + check-list chaque jour'],
        ['9', 'Handover', 'Signature 🔗 + Handover OK'],
        ['10', 'Clôture', 'Rapport IA + Terminé'],
      ].map(([n, t, s]) => `<div class="flow-step"><div class="ft">${n}. ${t}</div><div class="fs">${s}</div></div>`).join('')}</div>`
        + callout('tip', 'Exercice final (45 min, en binôme) : déroulez ces 10 étapes sur un projet de test, puis comparez vos briefings.'),
      visual: 'Frise en 10 étapes.',
      notes: 'Pour l\'exercice final, faites créer un projet de test par binôme avec un N° interne fictif différent.',
    },
    {
      title: 'FAQ — dépannage (1/2)',
      body: () => table(['Problème', 'Que faire'], [
        ['Mon mail n\'a rien créé', 'Attendez 10 min et rechargez. Vérifiez : sujet commençant par NEW (création) ou N° interne exact (projet existant), pas de « TR: » devant NEW, mail non ouvert dans la boîte Gmail. Sinon : renvoyez avec le bon sujet ou ajoutez à la main.'],
        ['Le client est « ⚠️ Client à confirmer »', `${L('✏️ Modifier')} le projet › ${L('Client *')} : choisissez ou créez le bon client.`],
        ['Les dates du projet créé par mail sont fausses', 'Le mail ne contenait pas de date : corrigez dans ✏️ Modifier.'],
        ['Mon trajet par mail n\'est pas créé', 'La personne n\'était pas dans l\'onglet 👥 Équipe : ajoutez-la, puis saisissez le trajet à la main.'],
        ['La liste de statut est vide', 'Le projet est en Brouillon ou Confirmé : choisissez simplement le bon statut.'],
      ], { small: true }),
      visual: 'Tableau problème / solution.',
      notes: '',
    },
    {
      title: 'FAQ — dépannage (2/2)',
      body: () => table(['Problème', 'Que faire'], [
        ['Je suis renvoyé à l\'écran de connexion', 'La session dure 8 h : reconnectez-vous. Rechargez la page en cas d\'affichage bizarre.'],
        ['J\'ai oublié mon mot de passe', 'Demandez à un admin, un Project ou Technical Manager « 📧 Envoyer invitation » (valable 15 min).'],
        ['« Permission insuffisante »', 'Action réservée à certains rôles : demandez à un admin ou à votre responsable.'],
        ['Je ne vois pas un projet', 'Site Manager, installateur, ouvrier : vous devez être dans l\'onglet 👥 Équipe du projet.'],
        ['Je ne vois pas la check-list (Site Manager / installateur)', 'Vous devez être dans l\'onglet 👥 Équipe du projet.'],
        ['Le lien de signature est bloqué', 'Terminez la check-list de montage (points critiques, points « À vérifier »).'],
        ['Mes 3 photos sont devenues 1 (téléphone)', 'Sélectionnez toutes les photos en une fois, ou ajoutez-les en modification.'],
        ['Mon véhicule modifié n\'a pas changé', 'Modifiez-le dans l\'onglet 🚛 Logistique, pas dans ✏️ Modifier.'],
      ], { small: true }),
      visual: 'Tableau problème / solution.',
      notes: '',
    },
    {
      kind: 'memo', key: 'memo-mail', title: 'Fiche mémo — la règle du mail',
      body: () => `<div class="memo">
        <div class="memo-addr">📧 ${MAIL}</div>
        <div class="memo-grid">
          <div class="memo-col new"><h3>🆕 CRÉER un projet</h3>
            <p>Le sujet <b>commence par</b> <code>NEW</code> + N° interne.</p>
            <p class="ex ok">✅ NEW ${FIL.ref}</p><p class="ex ok">✅ new: ${FIL.ref}</p>
            <p class="ex ko">❌ TR: NEW ${FIL.ref} <small>(effacez TR: / Fwd:)</small></p>
            <p class="ex ko">❌ NEW pour un projet qui existe déjà</p>
            <p><b>Résultat</b> : projet en Brouillon + pièces jointes. <b>À vérifier</b> : client, adresse, <b>dates</b>, notes, statut.</p></div>
          <div class="memo-col add"><h3>📧 COMPLÉTER un projet</h3>
            <p>Le <b>N° interne</b> n\'importe où dans le sujet.</p>
            <p class="ex ok">✅ Plans façade ${FIL.ref}</p><p class="ex ok">✅ TR: Confirmation camion ${FIL.ref}</p>
            <p class="ex ko">❌ Photos chantier Paddock <small>(pas de N°)</small></p>
            <p><b>Résultat</b> : pièces jointes → 📁 Fichiers ; camions, hôtels, trajets → brouillons à valider. <b>Pas</b> d\'ajout aux notes.</p></div>
        </div>
        <div class="memo-foot">⏱ Relève toutes les 5 min · ne jamais ouvrir ces mails dans la boîte Gmail · aucun message en cas d\'échec · N° interne = 4 chiffres + 4 à 6 lettres + VIE</div></div>`,
      visual: 'Fiche mémo imprimable sur une page (A4 paysage).',
      notes: 'Imprimez cette slide seule (Ctrl+P, page courante) ou utilisez 03_FICHE_MEMO_MAIL.md.',
    },
    {
      kind: 'cover', title: 'Merci !',
      body: () => `<div class="cover-sub">Questions ?</div><div class="cover-line">Le support reste disponible : ☰ Sommaire pour retrouver un chapitre, lien direct par chapitre à partager.</div>`,
      visual: 'Slide de fin.',
      notes: 'Rappelez les 6 règles d\'or et où trouver la fiche mémo.',
    },
  ],
};
