import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from './ui.mjs';
import { FIL } from './fil.mjs';

export default {
  key: 'bookings', num: 8, icon: '✈️', title: 'Bookings : transports & hôtels',
  public: 'Project Managers, Customer Service', duree: '20 min', parcours: 'Bureau',
  slides: [
    {
      title: 'Objectif & où les trouver',
      body: () => cols(
        ul([
          '<b>Objectif</b> : chaque membre sait quand il part, comment, et où il dort — et le calendrier montre qui est sur site.',
          '<b>Pour qui</b> : Project Managers, Customer Service.',
        ]) + path(['🏗️ Projets', '~projet', '✈️ Bookings']),
        table(['Section', 'Boutons'], [
          [L('✈️ Transport par membre'), `${L('+ Transport installation')} · ${L('+ Transport démontage')}`],
          [L('🏨 Hôtels (multi-occupants)'), `${L('+ Hôtel installation')} · ${L('+ Hôtel démontage')}`],
        ], { small: true })),
      visual: 'Objectif + chemin + tableau des deux sections.',
      notes: 'Un booking transport = une personne pour une phase.',
    },
    {
      title: 'Un transport par membre et par phase',
      body: () => cols(
        win('➕ Nouveau transport — 🏗️ Installation',
          `<div class="m-grid2">${field('Membre *', FIL.siteManager)}${field('Phase *', '🏗️ Installation')}</div>`
          + `<div class="m-txt"><b>${L('📍 Présence effective sur site')}</b></div><div class="m-grid2"><span class="m-val">15/03/2027</span><span class="m-val">18/03/2027</span></div>`
          + `<div class="m-grid2">${field('Moyen de transport', '🚄 Train')}${field('Détails (n° de vol, etc.)', 'Bruxelles-Midi 06:12')}</div>`
          + `<div class="m-txt">${L('📎 Pièce jointe (billet, voucher...)')}</div><div class="m-row right">${btn('💾 Créer', 'primary')}</div>`, { free: true }),
        steps([
          `${q('+ Transport installation')} (ou démontage).`,
          `${q('Membre *')} et dates de présence sur site (obligatoires).`,
          'Aller et retour : moyen (Avion, Train, Voiture, Bus / Car, Autre), date + heure, détails.',
          'Joignez le billet (PDF ou image).',
          `${q('💾 Créer')}.`,
        ])),
      visual: 'Maquette de la fenêtre transport + étapes.',
      notes: 'La liste des membres contient tous les comptes VEM, pas seulement l\'équipe : vérifiez que la personne est aussi dans l\'onglet Équipe.',
    },
    {
      title: 'Un hôtel pour plusieurs occupants',
      body: () => cols(
        win('➕ Nouvelle réservation hôtel — 🏗️ Installation',
          `<div class="m-grid2">${field('Phase *', '🏗️ Installation')}${field('Référence (optionnel)', FIL.hotelRef)}</div>`
          + `<div class="m-grid2"><span class="m-val">${FIL.hotel}</span><span class="m-val">Bruxelles</span></div>`
          + `<div class="m-grid2">${field('Check-in *', '14/03/2027')}${field('Check-out *', '18/03/2027')}</div>`
          + `<div class="m-txt">${L('👥 Occupants (sélectionne tous les membres logés)')} : ☑ ${FIL.siteManager} ☑ ${FIL.installateur}</div>`, { free: true }),
        steps([
          `${q('+ Hôtel installation')} (ou démontage).`,
          'Nom de l\'hôtel, adresse, check-in et check-out.',
          'Cochez <b>tous</b> les occupants (au moins un).',
          'Référence de réservation + confirmation en pièce jointe.',
          'Enregistrez : « Hôtel créé pour N occupant(s) ✅ ».',
        ])),
      visual: 'Maquette de la fenêtre hôtel + étapes.',
      notes: 'Un hôtel créé par mail arrive sans occupant : cochez-les avant d\'enregistrer.',
    },
    {
      title: 'À quoi ça sert après',
      body: () => `<div class="feeds">${[
        ['📅 Calendrier', `Case ${L('👥 Équipes')} : présence sur site (barre) et trajets (hachures)`],
        ['📤 Infos membre', '« 🚚 Ses réservations » : chacun reçoit son transport et son hôtel'],
        ['📋 Briefing', 'Slides « Transport équipe » et « Hôtels équipe »'],
        ['📊 Rapport IA', 'Section Bookings'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Flèches vers les usages.',
      notes: 'Les hôtels n\'apparaissent pas dans le calendrier, seulement les transports.',
    },
    {
      title: 'Erreurs fréquentes',
      body: () => ul([
        'Dates de présence hors des dates du projet : VEM ne contrôle pas, relisez.',
        'Check-out avant check-in : pas de contrôle non plus.',
        'Booking reçu par mail : mode de transport ❔ → re-sélectionnez-le avant d\'enregistrer.',
        'Pièce jointe : visible seulement en ouvrant ✏️, pas sur la carte.',
        'Deux transports pour la même personne et la même phase : possible, mais source de confusion.',
      ]),
      visual: 'Liste.',
      notes: 'Il n\'y a pas d\'export des bookings : utilisez 📤 par membre ou le Rapport IA (section Bookings).',
    },
    {
      kind: 'exercise', title: 'Exercice — voyages du projet démo',
      body: () => cols(steps([
        `Transport installation de ${FIL.siteManager} : train aller le 15/03 à 06:12, retour le 18/03 à 19:00.`,
        `Hôtel installation ${FIL.hotel}, réf. ${FIL.hotelRef}, du 14 au 18/03, occupants ${FIL.siteManager} et ${FIL.installateur}.`,
        'Cochez 👥 Équipes dans le calendrier du Dashboard : que voyez-vous ?',
      ]), `<div class="recap"><div class="rt">À retenir</div>${ul([
        'Transport = 1 membre × 1 phase.',
        'Hôtel = plusieurs occupants.',
        'Joindre billets et confirmations.',
        'Brouillons par mail : occupants et mode à compléter.',
      ])}</div>`),
      visual: 'Exercice + récap.',
      notes: '',
    },
  ],
};
