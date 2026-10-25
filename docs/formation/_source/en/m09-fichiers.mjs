import { q, L, btn, field, win, steps, callout, capture, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'fichiers', num: 9, icon: '📁', title: 'Files & 3D viewer',
  public: 'Everyone', duree: '20 min', parcours: 'Office + Field',
  slides: [
    {
      title: 'Goal & where to find them',
      body: () => cols(
        ul([
          '<b>Goal</b>: all the project documents in one place: drawings, photos, PDFs, 3D models.',
          '<b>Who</b>: everyone.',
        ]) + path(['🏗️ Projets', '~project', '📁 Fichiers']),
        `<div class="m-row">${btn('🔗 URL')}${btn('⬆️ Ajouter', 'primary')}</div>`
        + callout('info', `Three ways to add: ${q('⬆️ Ajouter')} (from the computer or the phone), ${q('🔗 URL')} (heavy file hosted elsewhere), or <b>by e-mail</b> with the internal number (chapter 4).`)),
      visual: 'Goal + path + buttons.',
      notes: 'The same buttons exist in the 📁 Fichiers block of the Infos tab.',
    },
    {
      title: 'Add files',
      body: () => cols(
        steps([
          `${q('⬆️ Ajouter')} › choose one or more files.`,
          'Formats: images, PDF, Word, Excel, PowerPoint, videos, 3D models (.glb, .gltf, .obj, .stl, .dae, .zip…).',
          'Practical limit: <b>about 10 MB per file</b>.',
          'Message « n fichier(s) uploadé(s) ✅ ».',
        ]) + callout('tip', '3D model with its textures? Select them <b>together</b>: VEM bundles them into a single package.'),
        win('🔗 Ajouter un fichier via URL', field('Nom du fichier *', 'Paddock_demo.glb') + field('URL du fichier *', 'https://…/Paddock_demo.glb') + `<div class="m-row right">${btn('💾 Ajouter au projet', 'primary')}</div>`)
        + callout('info', 'For a file over 10 MB that is already online: the link must point <b>directly</b> to the file, and the name must keep the right extension.')),
      visual: 'Steps + « Ajouter un fichier via URL » mock-up.',
      notes: 'The .ifc format is probably refused on upload: to be confirmed before promising it.',
    },
    {
      title: 'Organise and view',
      body: () => cols(
        ul([
          'Two groups: <b>🖼️ Photos</b> and <b>📎 Documents</b>.',
          'Photos: click = full screen; ▲ ▼ to reorder; ✕ to delete.',
          `Documents: ${q('👁️ Voir')} (view), ⬇️ (download), ${q('🎮 Voir en 3D')} for models, 🗑️.`,
          `${q('Tout sélectionner')} (select all) then ${q('🗑️ Supprimer la sélection')} (delete selection) to clean up.`,
        ]),
        callout('warn', 'Files received by e-mail (logos, signatures) and every generated PDF (reports, handovers, briefings) are added here, <b>at every download</b>. Delete duplicates and useless logos.')
        + callout('info', 'On a phone, a PDF opens in a new tab.')),
      visual: 'List + callouts.',
      notes: 'Deleting a file is permanent: only delete obvious duplicates.',
    },
    {
      title: 'The 3D viewer',
      body: () => cols(
        capture('C-03', '3D site viewer opened from 🎮 Voir en 3D', 'a Viewbox model loaded, one measurement shown', `project ${FIL.ref}`),
        steps([
          `${q('🎮 Voir en 3D')} opens the viewer in a new tab.`,
          'Mouse: left click = rotate, right click = pan, wheel = zoom.',
          'Keys: F reframe, M measure (2 points), P photo, E exploded view.',
          `${q('📷 Galerie')} › ${q('💾 Sauver sur VEM')}: the photo goes to the project Files.`,
        ]) + callout('warn', 'Formats read: .glb, .gltf, .obj, .stl, .dae, .zip. A SketchUp file (.skp) must first be exported to .glb.')
        + callout('info', 'The viewer is made for a computer (no finger gestures).')),
      visual: 'Viewer screenshot + steps.',
      notes: 'Only present the functions above; the other viewer buttons are not part of this training.',
    },
    {
      title: 'What it is used for afterwards',
      body: () => `<div class="feeds">${[
        ['📋 Briefing', '🪄 Auto-générer: one slide per ticked photo or PDF page'],
        ['📊 AI report', '« Fichiers projet » section: photos and PDFs'],
        ['📋 Infos tab', 'Preview: photos, PDFs, 3D models, documents'],
        ['📱 Field', 'Drawings and photos available on site'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Arrows.',
      notes: '3D captures saved to VEM can then be put in the briefing.',
    },
    {
      kind: 'exercise', title: 'Exercise — demo project files',
      body: () => cols(steps([
        'Add a PDF drawing and 2 photos to the demo project.',
        'Put the photos back in order with ▲ ▼.',
        'Open a .glb model in the viewer and save a capture to VEM.',
        'Delete a duplicate.',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        '⬆️ Ajouter, 🔗 URL or e-mail.',
        '≈ 10 MB max per file.',
        'Clean up: e-mail logos, duplicate PDFs.',
        '.skp → export to .glb.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: '',
    },
  ],
};
