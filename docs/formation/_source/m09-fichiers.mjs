import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'fichiers', num: 9, icon: '📁', title: 'Fichiers & visionneuse 3D',
  public: 'Tout le monde', duree: '20 min', parcours: 'Bureau + Terrain',
  slides: [
    {
      title: 'Objectif & où les trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : tous les documents du projet au même endroit : plans, photos, PDF, modèles 3D.',
          '<b>Pour qui</b> : tout le monde.',
        ]) + path(['🏗️ Projets', '~projet', '📁 Fichiers']),
        `<div class="m-row">${btn('🔗 URL')}${btn('⬆️ Ajouter', 'primary')}</div>`
        + callout('info', `Trois façons d\'ajouter : ${q('⬆️ Ajouter')} (depuis l\'ordinateur ou le téléphone), ${q('🔗 URL')} (fichier lourd hébergé ailleurs), ou <b>par mail</b> avec le N° interne (chapitre 4).`)),
      visual: 'Objectif + chemin + boutons.',
      notes: 'Les mêmes boutons existent dans le bloc 📁 Fichiers de l\'onglet Infos.',
    },
    {
      title: 'Ajouter des fichiers',
      body: () => cols(
        steps([
          `${q('⬆️ Ajouter')} › choisissez un ou plusieurs fichiers.`,
          'Formats : images, PDF, Word, Excel, PowerPoint, vidéos, modèles 3D (.glb, .gltf, .obj, .stl, .dae, .zip…).',
          'Limite pratique : <b>environ 10 Mo par fichier</b>.',
          'Message « n fichier(s) uploadé(s) ✅ ».',
        ]) + callout('tip', 'Modèle 3D avec ses textures ? Sélectionnez-les <b>ensemble</b> : VEM les regroupe en un seul paquet.'),
        win('🔗 Ajouter un fichier via URL', field('Nom du fichier *', 'Paddock_demo.glb') + field('URL du fichier *', 'https://…/Paddock_demo.glb') + `<div class="m-row right">${btn('💾 Ajouter au projet', 'primary')}</div>`)
        + callout('info', 'Pour un fichier de plus de 10 Mo déjà en ligne : le lien doit pointer <b>directement</b> vers le fichier, et le nom doit garder la bonne extension.')),
      visual: 'Étapes + maquette « Ajouter un fichier via URL ».',
      notes: 'Le format .ifc est probablement refusé à l\'envoi : à confirmer avant de le promettre.',
    },
    {
      title: 'Ranger et consulter',
      body: () => cols(
        ul([
          'Deux groupes : <b>🖼️ Photos</b> et <b>📎 Documents</b>.',
          'Photos : clic = plein écran ; ▲ ▼ pour l\'ordre ; ✕ pour supprimer.',
          `Documents : ${q('👁️ Voir')}, ⬇️ (télécharger), ${q('🎮 Voir en 3D')} pour les modèles, 🗑️.`,
          `${q('Tout sélectionner')} puis ${q('🗑️ Supprimer la sélection')} pour faire le ménage.`,
        ]),
        callout('warn', 'Les fichiers reçus par mail (logos, signatures) et chaque PDF généré (rapports, handovers, briefings) s\'ajoutent ici, <b>à chaque téléchargement</b>. Supprimez les doublons et les logos inutiles.')
        + callout('info', 'Sur téléphone, un PDF s\'ouvre dans un nouvel onglet.')),
      visual: 'Liste + encadrés.',
      notes: 'La suppression d\'un fichier est définitive : ne supprimez que les doublons évidents.',
    },
    {
      title: 'La visionneuse 3D',
      body: () => cols(
        capture('C-03', 'Lecteur 3D Chantier ouvert depuis 🎮 Voir en 3D', 'modèle d\'un Viewbox chargé, une mesure affichée', `projet ${FIL.ref}`),
        steps([
          `${q('🎮 Voir en 3D')} ouvre le lecteur dans un nouvel onglet.`,
          'Souris : clic gauche = tourner, clic droit = déplacer, molette = zoom.',
          'Touches : F recadrer, M mesurer (2 points), P photo, E vue éclatée.',
          `${q('📷 Galerie')} › ${q('💾 Sauver sur VEM')} : la photo arrive dans les Fichiers du projet.`,
        ]) + callout('warn', 'Formats lus : .glb, .gltf, .obj, .stl, .dae, .zip. Un fichier SketchUp (.skp) doit d\'abord être exporté en .glb.')
        + callout('info', 'Le lecteur est fait pour l\'ordinateur (pas de gestes au doigt).')),
      visual: 'Capture du lecteur + étapes.',
      notes: 'Ne présentez que les fonctions ci-dessus ; les autres boutons du lecteur ne font pas partie de cette formation.',
    },
    {
      title: 'À quoi ça sert après',
      body: () => `<div class="feeds">${[
        ['📋 Briefing', '🪄 Auto-générer : une slide par photo ou par page de PDF cochée'],
        ['📊 Rapport IA', 'Section « Fichiers projet » : photos et PDF'],
        ['📋 Onglet Infos', 'Aperçu : photos, PDF, modèles 3D, documents'],
        ['📱 Terrain', 'Plans et photos consultables sur chantier'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Flèches.',
      notes: 'Des captures 3D sauvegardées sur VEM peuvent ensuite être mises dans le briefing.',
    },
    {
      kind: 'exercise', title: 'Exercice — fichiers du projet démo',
      body: () => cols(steps([
        'Ajoutez un plan PDF et 2 photos au projet démo.',
        'Remettez les photos dans l\'ordre avec ▲ ▼.',
        'Ouvrez un modèle .glb dans la visionneuse et sauvez une capture sur VEM.',
        'Supprimez un doublon.',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        '⬆️ Ajouter, 🔗 URL ou mail.',
        '≈ 10 Mo max par fichier.',
        'Faire le ménage : logos de mail, doublons de PDF.',
        '.skp → exporter en .glb.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: '',
    },
  ],
};
