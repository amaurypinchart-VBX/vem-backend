// Tests de la logique pure des demandes d'infos par mail (src/services/infoRequestLogic.ts) :
// lecture des réponses, dates, rythme des rappels. Lancer : npm run test:info-requests
import * as L from '../src/services/infoRequestLogic';
let fails = 0, n = 0;
function eq(name: string, got: any, exp: any) {
  n++;
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g !== e) { fails++; console.log(`✗ ${name}\n   got ${g}\n   exp ${e}`); }
}
const now = new Date('2026-10-28T09:00:00Z'); // mercredi 10:00 Bruxelles
const items: L.ParseItem[] = [
  { number: 1, label: 'Adresse de montage', kind: 'text' },
  { number: 2, label: 'Début du montage', kind: 'date' },
  { number: 3, label: 'Camions : quel camion arrive quand ?', kind: 'bookings' },
];
const ans = (t: string) => Object.fromEntries(L.parseReply(t, items).answers);

// mailto template filled
const tpl = L.templateLines(items, 'INFO-ABC234', 'fr');
eq('template', tpl[1], '[1] Adresse de montage :');
eq('template date', tpl[3], '[2] Début du montage (JJ/MM/AAAA, heure si connue) :');
eq('mailto filled', ans([tpl[0], '[1] Adresse de montage : Tour & Taxis, Bruxelles', '', '[2] Début du montage (JJ/MM/AAAA, heure si connue) :', '12/11/2026 8h', '', '[3] Camions : quel camion arrive quand ? :', '1. Camion A chargement 10/11', '2. Camion B 11/11 14h', '', '----- FIN -----', '', 'Cordialement,', 'Tao'].join('\n')),
  { 1: 'Tour & Taxis, Bruxelles', 2: '12/11/2026 8h', 3: '1. Camion A chargement 10/11\n2. Camion B 11/11 14h' });
// top reply with plain numbers + gmail quote with empty template
eq('top reply', ans(['1 : Rue de la Loi 16, 1000 Bruxelles', '2) 12 novembre à 7h30', '', 'Merci,', 'Norick', '', 'Le mar. 28 oct. 2026 à 10:00, VEM <warehouseviewbox@gmail.com> a écrit :', '> Q1 · Adresse de montage', '> ' + tpl[0], '> [1] Adresse de montage :', '>', '> [2] Début du montage (JJ/MM/AAAA, heure si connue) :', '>', '> ----- FIN -----'].join('\n')),
  { 1: 'Rue de la Loi 16, 1000 Bruxelles', 2: '12 novembre à 7h30' });
// inline answers inside gmail quote
eq('inline in quote', ans(['Voir ci-dessous', '', 'On Tue, Oct 28, 2026 at 10:00 AM VEM <x@y.com> wrote:', '> [1] Adresse de montage :', 'Hangar 26, Anvers', '>', '> [2] Début du montage (JJ/MM/AAAA, heure si connue) :', '>', '> ----- FIN -----'].join('\n')),
  { 1: 'Hangar 26, Anvers' });
// outlook style unquoted original: question table must not be parsed
eq('outlook quote', ans(['2: 14/11', '', '________________________________', 'De : VEM <x@y.com>', 'Envoyé : mardi 28 octobre 2026 10:00', 'Q1 · Adresse de montage — pour le 01/11/2026', '1. Adresse de montage', tpl[0], '[1] Adresse de montage :', '', '[2] Début du montage (JJ/MM/AAAA, heure si connue) :', '', '----- FIN -----'].join('\n')),
  { 2: '14/11' });
// label on same line split
eq('label then colon', ans(['[2] Début du montage : 12/11 à 8:30'].join('\n')), { 2: '12/11 à 8:30' });
eq('plain with label', ans('1 : Adresse de montage : Quai X'), { 1: 'Quai X' });
eq('plain empty then lines', ans(['1 :', 'Rue A 1', '1000 Bxl', '', 'Best Western Bruxelles'].join('\n')), { 1: 'Rue A 1\n1000 Bxl' });
eq('best western not signature', ans(['[3] Camions :', 'Best Western', '----- FIN -----'].join('\n')), { 3: 'Best Western' });
eq('unknown number ignored', ans('7 : blabla'), {});
eq('date line not marker', ans(['[2] Début du montage :', '12.11.2026'].join('\n')), { 2: '12.11.2026' });
eq('userText', L.stripQuoted('Hello\nOn Tue, X wrote:\n> old'), 'Hello');

// refs
eq('ref', L.findRef('Re: [VEM] Infos — réf. info-abc234 ok'), 'INFO-ABC234');
eq('ref none', L.findRef('INFO-ABC23', 'nothing'), null);
eq('refFromBytes', /^INFO-[A-Z2-9]{6}$/.test(L.refFromBytes([1, 2, 3, 4, 5, 250])), true);

// dates
const d = (t: string) => { const p = L.parseDateAnswer(t, now); return p ? L.fmtDate(p.date, 'fr') + (p.hasTime ? ' T' : '') : null; };
eq('d1', d('12/11/2026 8h'), '12/11/2026 à 08:00 T');
eq('d2', d('12/11'), '12/11/2026');
eq('d3', d('12-11-26 14h30'), '12/11/2026 à 14:30 T');
eq('d4', d('2026-11-12'), '12/11/2026');
eq('d5', d('2026-11-12T07:15'), '12/11/2026 à 07:15 T');
eq('d6', d('le 12 novembre à 7h30'), '12/11/2026 à 07:30 T');
eq('d7', d('Nov 12, 2026 2pm'), '12/11/2026 à 14:00 T');
eq('d8', d('lundi 1er décembre'), '01/12/2026');
eq('d9', d('15/01'), '15/01/2027');  // janvier prochain
eq('d10', d('31/02'), null);
eq('d11', d('bientôt'), null);
eq('d12', d('12/11, 2 hôtels'), '12/11/2026');
eq('d13', d('12 nov 8 heures'), '12/11/2026 à 08:00 T');
eq('d14', d('03/07/2027 à 9:00'), '03/07/2027 à 09:00 T'); // été (UTC+2)
eq('d14 iso', L.parseDateAnswer('03/07/2027 à 9:00', now)!.iso, '2027-07-03T07:00:00.000Z');
eq('d15 iso winter', L.parseDateAnswer('12/11/2026', now)!.iso, '2026-11-11T23:00:00.000Z');

// normalize
eq('n empty', L.normalizeAnswer('date', 'je ne sais pas encore', now).status, 'empty');
eq('n ?', L.normalizeAnswer('text', '?', now).status, 'empty');
eq('n na', L.normalizeAnswer('bookings', 'aucun', now).status, 'na');
eq('n pas d hotel', L.normalizeAnswer('bookings', "pas d'hôtel", now).status, 'na');
eq('n invalid', L.normalizeAnswer('date', 'la semaine du 10', now).status, 'invalid');
eq('n number', L.normalizeAnswer('number', '6 monteurs', now), { status: 'ok', value: '6', display: '6' });
eq('names', L.splitNames('Norick, Tao et Jean-Pierre Dupont; Ali'), ['Norick', 'Tao', 'Jean-Pierre Dupont', 'Ali']);

// auto reply
eq('auto1', L.isAutoReply('Réponse automatique : absent', {}), true);
eq('auto2', L.isAutoReply('Re: Infos', { 'auto-submitted': 'auto-replied' }), true);
eq('auto3', L.isAutoReply('Re: Infos', { 'auto-submitted': 'no' }), false);
eq('bounce', L.isBounce('Mail Delivery Subsystem <mailer-daemon@googlemail.com>', 'Delivery Status Notification (Failure)'), true);

// window
const fmt = (x: Date | null) => x ? L.fmtDate(x, 'fr', true) + ' ' + ['dim','lun','mar','mer','jeu','ven','sam'][L.zParts(x).wd] : null;
eq('align sat', fmt(L.alignToWindow(new Date('2026-10-31T10:00:00Z'), true)), '02/11/2026 à 08:00 lun');
eq('align night', fmt(L.alignToWindow(new Date('2026-10-28T20:00:00Z'), true)), '29/10/2026 à 08:00 jeu');
eq('align early', fmt(L.alignToWindow(new Date('2026-10-28T05:00:00Z'), true)), '28/10/2026 à 08:00 mer');
eq('align sat allowed', fmt(L.alignToWindow(new Date('2026-10-31T10:00:00Z'), false)), '31/10/2026 à 11:00 sam');

// schedule: user example — event in 2 months, trucks needed 2 weeks before
const install = new Date('2026-12-28T08:00:00Z');
const neededBy = new Date(install.getTime() - 14 * 86400000);
const plan = L.cleanPlan({ mode: 'urgency' });
const sim = L.simulateReminders(plan, now, neededBy, 20).map(fmt);
console.log('urgency schedule (needed by', L.fmtDate(neededBy), '):\n  ' + sim.join('\n  '));
const fixed = L.simulateReminders(L.cleanPlan({ mode: 'fixed', intervalHours: 6 }), now, null, 6).map(fmt);
console.log('2x/day:\n  ' + fixed.join('\n  '));
eq('2/day', fixed.slice(0, 4), ['28/10/2026 à 16:00 mer', '29/10/2026 à 08:00 jeu', '29/10/2026 à 14:00 jeu', '30/10/2026 à 08:00 ven']);
eq('none', L.nextReminderAt(L.cleanPlan({ mode: 'none' }), { from: now, remindersSent: 0, neededBy: null }), null);
eq('max', L.nextReminderAt(L.cleanPlan({ mode: 'fixed', maxReminders: 2 }), { from: now, remindersSent: 2, neededBy: null }), null);
eq('daily first 24h', fmt(L.nextReminderAt(L.cleanPlan({ mode: 'fixed', intervalHours: 24 }), { from: now, remindersSent: 0, neededBy: null })), '29/10/2026 à 10:00 jeu');
eq('default needed', L.fmtDate(L.defaultNeededBy(L.fieldOf('trucks')!, install, now), 'fr', true), '14/12/2026 à 12:00');
eq('default needed now', L.fmtDate(L.defaultNeededBy(L.fieldOf('installationStart')!, install, now), 'fr', true), '02/11/2026 à 12:00');
console.log(`${n - fails}/${n} ok`);
// ─── robustesse : libellés coupés / recopiés ───
const items2: L.ParseItem[] = [
  { number: 1, label: 'Installation start', kind: 'date' },
  { number: 2, label: 'Team hotel', kind: 'bookings' },
  { number: 5, label: 'Équipe : qui vient ?', kind: 'names' },
  { number: 7, label: 'Faut-il un badge pour entrer sur le site et à quelle heure ouvre le quai de déchargement le premier jour du montage ?', kind: 'longtext' },
  { number: 8, label: 'Ville', kind: 'text' },
];
const ans2 = (t: string) => Object.fromEntries(L.parseReply(t, items2).answers);
eq('wrapped quoted labels', ans2(['Hi', '', 'On Tue, X wrote:', '> [5] Équipe : qui vient ? (noms séparés par des', '> virgules) :', '>', '> [7] Faut-il un badge pour entrer sur le site et à quelle heure ouvre le quai', '> de déchargement le premier jour du montage ? :', '>', '> ----- FIN -----'].join('\n')), {});
eq('wrong label = no answer', ans2('> [1] Team hotel :\n> [2] Installation start (DD/MM/YYYY, time if known) :'), {});
eq('wrapped label + answer', ans2(['[7] Faut-il un badge pour entrer sur le site et à quelle heure ouvre le quai', 'de déchargement le premier jour du montage ? : oui, 7h', '----- FIN -----'].join('\n')), { 7: 'oui, 7h' });
eq('plain blank then lines', ans2(['5 :', '', 'Norick, Tao', '', 'Cordialement'].join('\n')), { 5: 'Norick, Tao' });
eq('ville de', ans2('8 : Ville de Bruxelles'), { 8: 'Ville de Bruxelles' });
eq('label no space colon', ans2('[8] Ville:Liège'), { 8: 'Liège' });
eq('format only en', ans2('[1] Installation start (DD/MM/YYYY, time if known) : 12/11 9am'), { 1: '12/11 9am' });
eq('custom non', L.normalizeAnswer('longtext', 'Non', now), { status: 'ok', value: 'Non', display: 'Non' });
eq('trucks aucun', L.normalizeAnswer('bookings', 'Aucun', now).status, 'na');
console.log(`${n - fails}/${n} ok (with robustness)`);
process.exit(fails ? 1 : 0);
