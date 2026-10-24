import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'clients', num: 1, icon: '🏢', title: 'Clients & contacts',
  public: 'Sales, Customer Service, Project Managers', duree: '20 min', parcours: 'Bureau',
  slides: [
    {
      title: 'Objectif & où le trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : chaque projet est rattaché à une fiche client <b>complète et unique</b>, avec ses contacts.',
          '<b>Pour qui</b> : Sales, Customer Service, Project Managers.',
        ]) + path(['🏢 Clients', '+ Nouveau Client']),
        callout('info', `On peut aussi créer un client <b>sans quitter</b> le formulaire projet : bouton ${q('+ Client')} à côté du champ ${q('Client *')}. Le nouveau client est alors sélectionné automatiquement.`)),
      visual: 'Objectif + chemin d\'accès + encadré.',
      notes: 'Le menu Clients est dans la section Admin du menu latéral.',
    },
    {
      title: 'Créer un client',
      body: () => cols(
        win('🏢 Nouveau Client',
          `<div class="m-grid2">${field('Nom de la société *', FIL.client)}${field('N° TVA / VAT', FIL.tva)}</div>`
          + field('Adresse', 'Avenue Démo 10, 1000 Bruxelles', { wide: true })
          + `<div class="m-grid2">${field('Email société', 'info@demo-events.example')}${field('Téléphone société', '+32 2 000 00 00')}</div>`
          + `<div class="m-sep">${L('Personnes de contact')} ${btn('+ Ajouter contact')}</div>`
          + `<div class="m-grid3"><span class="m-val">${FIL.contact}</span><span class="m-val">${FIL.contactMail}</span><span class="m-val">${FIL.contactTel}</span></div>`
          + `<div class="m-row right">${btn('Annuler', 'outline')}${btn('✅ Créer le client', 'primary')}</div>`),
        steps([
          `Menu ${q('🏢 Clients')} › ${q('+ Nouveau Client')}.`,
          `Remplissez ${q('Nom de la société *')} (seul champ obligatoire).`,
          'Ajoutez l\'adresse, l\'e-mail et le téléphone de la société.',
          `Ajoutez chaque contact (Prénom Nom, Email, Téléphone) avec ${q('+ Ajouter contact')}.`,
          `${q('✅ Créer le client')}.`,
        ]) + callout('tip', 'Le premier contact rempli devient le <b>contact principal</b>.')),
      visual: 'Maquette de la fenêtre « 🏢 Nouveau Client » remplie avec le client démo.',
      notes: 'Si l\'e-mail ou le téléphone de la société sont vides, VEM y recopie ceux du contact principal.',
    },
    {
      title: 'Fonction et contact principal ★',
      body: () => cols(
        steps([
          `Ouvrez le client (clic sur sa carte) › ${q('✏️ Modifier')}.`,
          `Pour chaque contact : ${q('Fonction')} (ex. ${FIL.contactFonction}).`,
          `Cochez ${q('★')} devant le contact principal.`,
          `${q('💾 Sauvegarder')}.`,
        ]),
        callout('info', 'La fonction et le choix du contact principal ne sont disponibles <b>qu\'en modification</b>, pas à la création. Pensez à y revenir.')
        + callout('warn', 'Une ligne de contact sans nom est ignorée sans prévenir : mettez toujours le nom.')),
      visual: 'Étapes + deux encadrés.',
      notes: 'Le contact ★ est celui affiché dans l\'onglet Infos du projet et dans le briefing.',
    },
    {
      title: 'Champs : obligatoires et fortement recommandés',
      body: () => table(['Champ', 'Statut', 'Pourquoi'], [
        [L('Nom de la société *'), chip('Obligatoire', 'red', { free: true }), 'Sans lui, pas de client.'],
        [L('Email société'), chip('Fortement recommandé', 'amber', { free: true }), 'Destinataire « Client » proposé à l\'envoi des daily reports et du handover ; reçoit le PDF de handover signé.'],
        [L('Téléphone société'), chip('Fortement recommandé', 'amber', { free: true }), 'Affiché dans l\'onglet Infos du projet (📞 cliquable).'],
        ['Contacts (nom, e-mail, téléphone, fonction)', chip('Fortement recommandé', 'amber', { free: true }), 'Slide « Contacts » du briefing, pré-remplissage du handover.'],
        [L('Adresse'), chip('Recommandé', 'grey', { free: true }), 'Fiche client complète.'],
        [L('N° TVA / VAT'), chip('Recommandé', 'grey', { free: true }), 'Référence administrative.'],
      ]),
      visual: 'Tableau à 3 colonnes avec pastilles de couleur.',
      notes: 'L\'e-mail de la société est le champ le plus important après le nom : il sert à tous les envois au client.',
    },
    {
      title: 'À quoi ça sert après',
      body: () => `<div class="feeds">${[
        ['🏗️ Formulaire projet', `Liste ${L('Client *')}`],
        ['📋 Onglet Infos', `Bloc ${L('📞 Contact client')} (contact ★ + téléphone / e-mail société)`],
        ['🧾 Handover', 'Client, représentant et e-mail pré-remplis'],
        ['📓 Daily Reports', 'Case « Client » cochée à l\'envoi'],
        ['📋 Briefing', 'Slide « Contacts » générée automatiquement'],
        ['✍️ Handover signé', 'Le PDF signé part à l\'e-mail de la fiche client'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Carte « Client » au centre et 6 flèches vers les écrans qui l\'utilisent.',
      notes: 'Un client mal rempli = des envois qui partent au mauvais endroit, ou nulle part.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => cols(
        ul([
          '<b>Doublons</b> : « Demo Events » et « Demo Events SA » sont deux clients différents. <b>Cherchez d\'abord</b> dans la liste.',
          `Un projet créé par mail rattache un nom inconnu à un <b>nouveau client</b> créé automatiquement, ou au client générique ${q('⚠️ Client à confirmer')}. Corrigez le client du projet ensuite (chapitre 3).`,
          'Contact sans nom : ignoré.',
        ]),
        callout('no', `${q('🗑️ Supprimer ce client')} est refusé tant qu\'un projet y est rattaché. Une suppression réussie est <b>définitive</b> (contacts compris) : ne supprimez pas, demandez à un admin.`)),
      visual: 'Liste d\'erreurs + encadré interdit.',
      notes: 'Montrez la liste Clients triée par nom : c\'est là qu\'on repère les doublons.',
    },
    {
      kind: 'exercise', title: 'Exercice — Demo Events SA',
      body: () => cols(steps([
        `Créez le client <b>${FIL.client}</b> avec TVA, adresse, e-mail et téléphone société.`,
        `Ajoutez le contact <b>${FIL.contact}</b> (${FIL.contactMail}, ${FIL.contactTel}).`,
        `Rouvrez-le en ${q('✏️ Modifier')} : fonction « ${FIL.contactFonction} » et ★ principal.`,
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Un client = une fiche unique (cherchez avant de créer).',
        'L\'e-mail société sert à tous les envois au client.',
        'Fonction et ★ : en modification.',
        'Ne supprimez pas un client.',
      ])}</div>`),
      visual: 'Exercice à gauche, encadré récap à droite.',
      notes: 'Durée : 5 minutes. Vérifiez que chacun voit le client dans la liste.',
    },
  ],
};
