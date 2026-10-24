import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export const MAIL = 'warehouseviewbox@gmail.com';

export default {
  key: 'projet-mail', num: 3, icon: '🆕', title: 'Créer un projet par mail (NEW)',
  public: 'Sales, Customer Service, Project Managers', duree: '25 min', parcours: 'Tronc commun',
  slides: [
    {
      kind: 'rule', title: 'La règle du mail',
      body: () => `<div class="rule">
        <div class="rule-addr">📧 ${MAIL}</div>
        <div class="rule-grid">
          <div class="rule-card new"><div class="rk">CRÉER un projet</div><div class="rs">Sujet qui <b>commence par</b><br><code>NEW ${FIL.ref}</code></div><div class="rd">→ nouveau projet en brouillon, rempli par l\'IA</div></div>
          <div class="rule-card add"><div class="rk">COMPLÉTER un projet</div><div class="rs">Le <b>N° interne</b> n\'importe où dans le sujet<br><code>Plans ${FIL.ref}</code></div><div class="rd">→ pièces jointes dans Fichiers + réservations en brouillon</div></div>
        </div>
        <div class="rule-foot">⏱ Relève toutes les <b>5 minutes</b> · seuls les mails <b>non lus</b> sont traités · aucun message en cas d\'échec</div></div>`,
      visual: 'Slide « affiche » : adresse en très gros, deux cartes CRÉER / COMPLÉTER, bandeau délais.',
      notes: 'C\'est LA slide à retenir. Elle existe aussi en fiche mémo imprimable à la fin du support.',
    },
    {
      title: 'Objectif & quand l\'utiliser',
      body: () => cols(
        ul([
          '<b>Objectif</b> : transformer un mail de commande ou de confirmation en projet VEM sans tout retaper.',
          '<b>Quand</b> : un nouveau projet confirmé arrive par mail (client, Sales, partenaire).',
          `<b>Comment</b> : transférez le mail à <b>${MAIL}</b> avec un sujet qui <b>commence</b> par <code>NEW</code> suivi du N° interne.`,
        ]),
        callout('warn', '<b>Effacez « TR: » ou « Fwd: »</b> que votre messagerie ajoute au transfert : le sujet doit <b>commencer</b> par NEW (majuscules ou minuscules, peu importe).')),
      visual: 'Objectif + encadré « TR: / Fwd: ».',
      notes: 'Avec « TR: NEW … », VEM ne voit pas NEW au début : il cherche un projet existant, n\'en trouve pas, et le mail est ignoré sans message.',
    },
    {
      title: 'Ce que l\'IA lit dans le mail',
      body: () => cols(
        table(['Information', 'Va dans'], [
          ['Nom du projet', L('Nom *')], ['N° interne (sinon : le texte après NEW)', L('N° Interne')],
          ['Client final, contact, e-mail, téléphone', 'Fiche client (retrouvée ou créée)'],
          ['Adresse et ville du site', L('Adresse *')], ['Dates d\'installation et de démontage', 'Dates du projet'],
          ['Nombre d\'ouvriers', L('Ouvriers')], ['Résumé du montage (nombre de Viewbox, modules…)', L('Description / Instructions spéciales')],
          ['Pièces jointes', L('📁 Fichiers')],
        ], { small: true }),
        callout('info', 'L\'IA lit le sujet et le <b>début du texte</b> du mail (environ 8 000 caractères). Elle a pour consigne de ne jamais inventer une date.')
        + callout('warn', 'Elle ne crée <b>ni camions, ni hôtels, ni trajets</b>, et ne remplit <b>pas les notes</b> (globales, installation, démontage).')),
      visual: 'Tableau information → champ + deux encadrés.',
      notes: 'Le N° interne : si l\'IA n\'en trouve pas dans le mail, VEM prend le texte qui suit NEW s\'il fait au plus 24 caractères sans espace. D\'où l\'intérêt de NEW + référence seule.',
    },
    {
      title: 'Exemples de sujets',
      body: () => table(['Sujet', '', 'Résultat'], [
        [`<code>NEW ${FIL.ref}</code>`, '✅', 'Projet créé, N° interne = ' + FIL.ref],
        [`<code>new ${FIL.ref}</code>`, '✅', 'Majuscules ou minuscules : pareil'],
        [`<code>NEW: ${FIL.ref}</code> · <code>NEW - ${FIL.ref}</code>`, '✅', 'Séparateur accepté'],
        [`<code>TR: NEW ${FIL.ref}</code>`, '❌', 'Ne commence pas par NEW → ignoré'],
        [`<code>NEW Paddock démo Bruxelles</code>`, '⚠️', 'Créé, mais N° interne inventé (VEM-année-xxxx) si le mail n\'en contient pas'],
        [`<code>NEW ${FIL.ref}</code> (déjà existant)`, '❌', 'Rien n\'est créé (protection anti-doublon), sans message'],
      ]),
      visual: 'Tableau ✅ / ❌ des sujets.',
      notes: 'Rappelez que le mail doit arriver NON LU dans la boîte : personne ne doit l\'ouvrir dans Gmail avant la relève.',
    },
    {
      title: 'Ce qui se passe ensuite',
      body: () => cols(
        steps([
          'Dans les 5 minutes, VEM relève la boîte.',
          `Le projet est créé en ${q('📄 Brouillon')}.`,
          `Client inconnu ou absent du mail : rattaché à ${q('⚠️ Client à confirmer')} (ou à un nouveau client créé avec le nom trouvé).`,
          'Toutes les pièces jointes vont dans Fichiers.',
          `Les admins et Project Managers reçoivent la notification ${q('🆕 Projet créé depuis un email')} (« … À vérifier. »).`,
        ]),
        win('🆕 Projet créé depuis un email', `<div class="m-txt">${FIL.projet} (${FIL.ref}) · client : ${FIL.client} · 2 fichier(s). À vérifier.</div>`, { sub: '🔔 Notifications' })
        + callout('info', 'Les instructions du projet commencent par « 📧 Projet créé automatiquement depuis un mail de … ».')),
      visual: 'Étapes à gauche, maquette de la notification à droite.',
      notes: 'Les notifications se trouvent dans Admin › 🔔 Notifications ; cliquer une notification la marque comme lue mais n\'ouvre pas le projet.',
    },
    {
      title: 'Vérifier le projet créé (obligatoire)',
      body: () => cols(
        steps([
          `${q('🏗️ Projets')} › recherchez le N° interne › ouvrez le projet.`,
          `${q('✏️ Modifier')} et contrôlez : nom, client, N° interne, adresse, <b>dates</b>.`,
          `Client = ${q('⚠️ Client à confirmer')} ? Choisissez le bon client (ou créez-le avec ${q('+ Client')}).`,
          'Ajoutez les 3 notes complémentaires.',
          `${q('💾 Enregistrer les modifications')}, puis choisissez le statut.`,
        ]),
        callout('warn', '<b>Sans date dans le mail</b>, VEM met l\'installation à la <b>date du jour</b>. C\'est la première chose à corriger.')
        + callout('tip', 'Ensuite : équipe, logistique, bookings — comme pour un projet créé à la main.')),
      visual: 'Checklist de vérification + encadrés.',
      notes: 'Un projet créé par mail n\'est jamais « fini » : c\'est un brouillon à compléter.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        '<b>« TR: » / « Fwd: »</b> laissé devant NEW → aucun projet.',
        '<b>Mail ouvert dans Gmail</b> avant la relève → il n\'est plus « non lu » : jamais traité.',
        '<b>N° interne déjà existant</b> → rien n\'est créé, aucun message. Pour un projet existant, n\'utilisez pas NEW (chapitre 4).',
        '<b>Sujet commençant par « New… »</b> (ex. « Newsletter ») envoyé à cette adresse → un projet serait créé : n\'envoyez à cette boîte que des mails de projet.',
        '<b>Pas de vérification</b> → dates du jour, client à confirmer, doublon de client.',
        'Les logos et signatures du mail arrivent aussi dans Fichiers : supprimez-les si besoin (chapitre 9).',
      ]),
      visual: 'Liste d\'erreurs.',
      notes: 'Si rien n\'apparaît après 10 minutes : voir la FAQ du dernier chapitre.',
    },
    {
      kind: 'exercise', title: 'Exercice — un projet par mail',
      body: () => cols(steps([
        `Écrivez (sans l\'envoyer) le sujet pour créer le projet démo : <code>NEW ${FIL.ref}</code>.`,
        'Dans le texte, indiquez client, adresse, dates d\'installation et de démontage, nombre de Viewbox.',
        'Citez les 5 points à vérifier une fois le projet créé.',
        'Bonus : que se passe-t-il si vous envoyez « TR: NEW … » ?',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        `Adresse : ${MAIL}`,
        'Sujet qui COMMENCE par NEW + N° interne.',
        'Résultat = brouillon à vérifier (dates !).',
        'Ni réservations, ni notes : à compléter.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Ne faites pas l\'exercice en réel pendant la session : chaque mail NEW crée un vrai projet.',
    },
  ],
};
