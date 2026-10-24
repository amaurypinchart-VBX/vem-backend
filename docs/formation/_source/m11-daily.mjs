import { q, L, btn, tabs, field, win, steps, callout, capture, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'daily', num: 11, icon: '📓', title: 'Daily Reports',
  public: 'Site Managers (sur téléphone)', duree: '35 min', parcours: 'Terrain',
  slides: [
    {
      title: 'Objectif & où le trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : un rapport par jour de chantier : ce qui a été fait, par combien de personnes, avec photos.',
          '<b>Pour qui</b> : Site Managers (et toute personne qui tient le journal).',
        ]) + path(['🏗️ Projets', '~projet', '📓 Daily Reports', '+ Nouveau Rapport'])
        + path(['~Téléphone : bouton ＋', '📓 Daily Report']),
        callout('tip', 'Ouvrez d\'abord le projet : il sera présélectionné dans le rapport.')),
      visual: 'Objectif + 2 chemins.',
      notes: 'La page Menu › 📓 Daily Reports montre les rapports de tous les projets.',
    },
    {
      title: 'Les infos générales',
      body: () => cols(
        win('📓 Rapport Journalier',
          `<div class="m-grid2">${field('Projet *', `${FIL.projet} (${FIL.ref})`)}${field('Date *', '15/03/2027')}</div>`
          + `<div class="m-grid2">${field('Météo', '☀️ Ensoleillé')}${field('Ouvriers présents', FIL.ouvriers)}</div>`
          + `<div class="m-txt"><b>${L('⏱️ Heures par tâche')}</b> : ◉ ${L('🏗️ Installation')} ○ ${L('🔨 Démontage')}</div>`
          + `<div class="m-grid3"><span class="m-val">Placing Facade elements</span><span class="m-val">6 h</span><span class="m-val">4 hommes</span></div>`, { sub: 'Journal de chantier complet' }),
        steps([
          `${q('Projet *')} et ${q('Date *')} (aujourd\'hui par défaut).`,
          `${q('Météo')} et ${q('Ouvriers présents')}.`,
          `${q('⏱️ Heures par tâche')} : choisissez Installation ou Démontage, puis heures et nombre d\'hommes par tâche.`,
          'Une tâche manque ? « Ajouter une autre tâche... » + « + Ajouter ».',
        ]) + callout('info', 'Les heures par tâche servent à l\'analyse « Temps par tâche » du Rapport IA.')),
      visual: 'Maquette du haut de la fenêtre + étapes.',
      notes: 'Les heures par tâche n\'apparaissent pas dans le PDF du daily.',
    },
    {
      title: 'Le journal : 3 façons de l\'écrire',
      body: () => tabs(['✏️ Saisie entrée par entrée', '📋 Import texte libre (IA)', '🎙️ Dictée vocale'])
        + table(['Mode', 'Comment', 'Idéal pour'], [
          [L('✏️ Saisie entrée par entrée'), 'Heure + « Décrivez ce qui a été fait... » + « + Ajouter ». L\'heure avance de 30 min.', 'Saisie au fil de la journée'],
          [L('📋 Import texte libre (IA)'), `Collez vos notes, ${L('🤖 Analyser avec l\'IA → Extraire les entrées')}, vérifiez, ${L('✅ Valider et ajouter au journal')}.`, 'Notes prises dans le téléphone ou sur WhatsApp'],
          [L('🎙️ Dictée vocale'), `${L('🎙️ Démarrer la dictée')}, parlez, puis ${L('🤖 Analyser avec l\'IA')} ; ou ${L('🎵 Choisir un fichier audio')} (50 Mo max).`, 'Fin de journée, mains occupées'],
        ], { small: true }) + callout('info', 'L\'IA découpe le texte en entrées horodatées (sans inventer d\'heure) et rend le texte en français. Relisez toujours avant de valider.'),
      visual: 'Onglets recréés + tableau des 3 modes.',
      notes: 'La dictée vocale fonctionne en français, de préférence avec Chrome.',
    },
    {
      title: 'Notes, photos et pièces jointes',
      body: () => cols(
        steps([
          `${q('Notes générales / Résumé')} : incidents, points importants.`,
          `${q('📸 Prendre / Ajouter photos')} : sélectionnez <b>toutes les photos en une fois</b>.`,
          `${q('📎 Pièces jointes')} : cochez la check-list à joindre (état actuel), ajoutez PDF / photos / Word / Excel (10 Mo max par fichier).`,
        ]),
        callout('warn', 'Sur téléphone, une nouvelle sélection de photos <b>remplace</b> la précédente. Choisissez-les toutes ensemble, ou ajoutez-en d\'autres ensuite en modification.')
        + callout('info', 'PDF et photos joints sont ajoutés lisibles à la fin du PDF du rapport. Word / Excel restent en lien.')),
      visual: 'Étapes + encadrés.',
      notes: 'Ne remplissez pas « ✅ Avancement tâches » : les tâches ne sont plus utilisées.',
    },
    {
      title: 'Sauvegarder ou envoyer',
      body: () => cols(
        `<div class="m-row">${btn('Annuler', 'outline')}${btn('💾 Sauvegarder', 'primary')}${btn('📤 Sauv. & Envoyer', 'green')}</div>`
        + win('📤 Envoyer le rapport', `<div class="m-txt">${L('🌐 Langue du PDF')} : 🇫🇷 Français · 🇬🇧 English</div><div class="m-txt">${L('👥 Équipe')} : ☐ ☐ ☐</div><div class="m-txt">${L('🤝 Client')} : ☑ <b>coché par défaut</b></div><div class="m-txt">${L('✉️ Adresses manuelles')}</div><div class="m-row right">${btn('📤 Envoyer', 'primary')}</div>`),
        ul([
          `${q('💾 Sauvegarder')} : le rapport est enregistré, rien n\'est envoyé.`,
          `${q('📤 Sauv. & Envoyer')} : enregistre puis ouvre la fenêtre d\'envoi.`,
          'Le PDF part en pièce jointe, dans la langue choisie.',
        ]) + callout('warn', `Le <b>client est coché par défaut</b>. Décochez-le si le rapport est interne. Après l\'envoi, le bouton ${q('📤 Envoyer')} disparaît : pas de renvoi possible.`)),
      visual: 'Boutons + fenêtre d\'envoi recréée.',
      notes: 'La liste Équipe contient tous les utilisateurs de VEM, pas seulement l\'équipe du projet.',
    },
    {
      title: 'Relire, modifier, PDF',
      body: () => cols(
        steps([
          'Onglet 📓 Daily Reports du projet : 👁️ lire, ✏️ modifier, 📄 PDF.',
          `En modification : ${q('🤖 Assistant IA')} ajoute des entrées à partir d\'un nouveau texte ou audio (rien n\'est remplacé).`,
          'Légende des photos : ✏️ sur la photo.',
          `📄 PDF : choisissez ${q('🇫🇷 Français')} ou ${q('🇬🇧 English')} (textes traduits automatiquement).`,
        ]),
        callout('warn', `En modification, la météo ${q('🌩️ Orage')} n\'est pas proposée : un rapport « Orage » modifié repasse en Ensoleillé. Supprimer <b>toutes</b> les entrées n\'est pas enregistré.`)
        + callout('no', 'Ne supprimez pas un rapport : corrigez-le.')),
      visual: 'Étapes + encadrés.',
      notes: 'Le PDF contient le bloc contact du client : pensez-y avant d\'envoyer à un tiers.',
    },
    {
      title: 'À quoi ça sert après',
      body: () => `<div class="feeds">${[
        ['📊 Rapport IA', 'Section Daily Reports (7 derniers) + « Temps par tâche »'],
        ['🧾 Handover', 'L\'historique du chantier en cas de discussion avec le client'],
        ['📧 Client', 'Le PDF envoyé chaque jour'],
        ['📁 Fichiers', 'Les PDF générés y sont rangés'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Flèches.',
      notes: '',
    },
    {
      kind: 'exercise', title: 'Exercice — le daily du 15/03',
      body: () => cols(steps([
        `Créez le daily du projet démo du 15/03/2027 : ensoleillé, ${FIL.ouvriers} ouvriers.`,
        'Dictez ou collez : « 7h45 arrivée, 9h15 grue, montage des 3 premières box, 12h pause ».',
        'Ajoutez 2 photos (en une seule sélection) et joignez la check-list de montage.',
        'Sauvegardez sans envoyer, puis téléchargez le PDF en anglais.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Un daily par jour, avec photos.',
        'L\'IA structure, vous relisez.',
        'Client coché par défaut à l\'envoi.',
        'Pas de renvoi après envoi.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: 'Durée : 10 minutes.',
    },
  ],
};
