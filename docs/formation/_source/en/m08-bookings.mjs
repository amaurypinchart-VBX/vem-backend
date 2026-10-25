import { q, L, btn, field, win, steps, callout, cols, table, ul, path, chip } from '../ui.mjs';
import { FIL } from '../fil.mjs';

export default {
  key: 'bookings', num: 8, icon: '✈️', title: 'Bookings: transport & hotels',
  public: 'Project Managers, Customer Service', duree: '20 min', parcours: 'Office',
  slides: [
    {
      title: 'Goal & where to find them',
      body: () => cols(
        ul([
          '<b>Goal</b>: every member knows when they leave, how, and where they sleep — and the calendar shows who is on site.',
          '<b>Who</b>: Project Managers, Customer Service.',
        ]) + path(['🏗️ Projets', '~project', '✈️ Bookings']),
        table(['Section', 'Buttons'], [
          [L('✈️ Transport par membre'), `${L('+ Transport installation')} · ${L('+ Transport démontage')}`],
          [L('🏨 Hôtels (multi-occupants)'), `${L('+ Hôtel installation')} · ${L('+ Hôtel démontage')}`],
        ], { small: true })),
      visual: 'Goal + path + table of the two sections.',
      notes: 'One transport booking = one person for one phase.',
    },
    {
      title: 'One transport per member and per phase',
      body: () => cols(
        win('➕ Nouveau transport — 🏗️ Installation',
          `<div class="m-grid2">${field('Membre *', FIL.siteManager)}${field('Phase *', '🏗️ Installation')}</div>`
          + `<div class="m-txt"><b>${L('📍 Présence effective sur site')}</b></div><div class="m-grid2"><span class="m-val">15/03/2027</span><span class="m-val">18/03/2027</span></div>`
          + `<div class="m-grid2">${field('Moyen de transport', '🚄 Train')}${field('Détails (n° de vol, etc.)', 'Bruxelles-Midi 06:12')}</div>`
          + `<div class="m-txt">${L('📎 Pièce jointe (billet, voucher...)')}</div><div class="m-row right">${btn('💾 Créer', 'primary')}</div>`, { free: true }),
        steps([
          `${q('+ Transport installation')} (or dismantling).`,
          `${q('Membre *')} (member) and dates of presence on site (required).`,
          'Outbound and return: means (plane, train, car, bus / coach, other), date + time, details.',
          'Attach the ticket (PDF or image).',
          `${q('💾 Créer')}.`,
        ])),
      visual: 'Mock-up of the transport window + steps.',
      notes: 'The member list contains all VEM accounts, not only the team: check that the person is also in the Équipe tab.',
    },
    {
      title: 'One hotel for several occupants',
      body: () => cols(
        win('➕ Nouvelle réservation hôtel — 🏗️ Installation',
          `<div class="m-grid2">${field('Phase *', '🏗️ Installation')}${field('Référence (optionnel)', FIL.hotelRef)}</div>`
          + `<div class="m-grid2"><span class="m-val">${FIL.hotel}</span><span class="m-val">Bruxelles</span></div>`
          + `<div class="m-grid2">${field('Check-in *', '14/03/2027')}${field('Check-out *', '18/03/2027')}</div>`
          + `<div class="m-txt">${L('👥 Occupants (sélectionne tous les membres logés)')} : ☑ ${FIL.siteManager} ☑ ${FIL.installateur}</div>`, { free: true }),
        steps([
          `${q('+ Hôtel installation')} (or dismantling).`,
          'Hotel name, address, check-in and check-out.',
          'Tick <b>all</b> the occupants (at least one).',
          'Booking reference + confirmation as an attachment.',
          'Save: « Hôtel créé pour N occupant(s) ✅ ».',
        ])),
      visual: 'Mock-up of the hotel window + steps.',
      notes: 'A hotel created by e-mail arrives without occupants: tick them before saving.',
    },
    {
      title: 'What it is used for afterwards',
      body: () => `<div class="feeds">${[
        ['📅 Calendar', `${L('👥 Équipes')} box: presence on site (bar) and trips (hatching)`],
        ['📤 Member info', '« 🚚 Ses réservations »: everyone receives their transport and hotel'],
        ['📋 Briefing', '« Transport équipe » and « Hôtels équipe » slides'],
        ['📊 AI report', 'Bookings section'],
      ].map(([a, b]) => `<div class="feed"><div class="fa">${a}</div><div class="fb">${b}</div></div>`).join('')}</div>`,
      visual: 'Arrows to the uses.',
      notes: 'Hotels do not appear in the calendar, only transport.',
    },
    {
      title: 'Common mistakes',
      body: () => ul([
        'Presence dates outside the project dates: VEM does not check, read it again.',
        'Check-out before check-in: not checked either.',
        'Booking received by e-mail: transport mode ❔ → select it again before saving.',
        'Attachment: only visible when you open ✏️, not on the card.',
        'Two transports for the same person and the same phase: possible, but confusing.',
      ]),
      visual: 'List.',
      notes: 'There is no export of the bookings: use 📤 per member or the AI report (Bookings section).',
    },
    {
      kind: 'exercise', title: 'Exercise — demo project travel',
      body: () => cols(steps([
        `Installation transport for ${FIL.siteManager}: train out on 15/03 at 06:12, back on 18/03 at 19:00.`,
        `Installation hotel ${FIL.hotel}, ref. ${FIL.hotelRef}, from 14 to 18/03, occupants ${FIL.siteManager} and ${FIL.installateur}.`,
        'Tick 👥 Équipes in the Dashboard calendar: what do you see?',
      ]), `<div class="recap"><div class="rt">Key points</div>${ul([
        'Transport = 1 member × 1 phase.',
        'Hotel = several occupants.',
        'Attach tickets and confirmations.',
        'Drafts by e-mail: occupants and mode to complete.',
      ])}</div>`),
      visual: 'Exercise + recap.',
      notes: '',
    },
  ],
};
