// Tests de la logique pure de VEM Chantier (src/services/chantierLogic.ts) : téléphone, code, période d'accès,
// fichiers visibles, compteurs, lignes de la feuille de temps, qui valide. Lancer : npm run test:chantier
import * as L from '../src/services/chantierLogic';
let fails = 0, n = 0;
function eq(name: string, got: any, exp: any) {
  n++;
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g !== e) { fails++; console.log(`✗ ${name}\n   got ${g}\n   exp ${e}`); }
}

// téléphone : même numéro écrit de plusieurs façons
eq('phone +32', L.phoneKey('+32 470 12 34 56'), '470123456');
eq('phone 0032', L.phoneKey('0032470123456'), '470123456');
eq('phone 04', L.phoneKey('0470/12.34.56'), '470123456');
eq('phone PL', L.phoneKey('+48 600 111 222'), '600111222');
eq('phone vide', L.phoneKey(null), '');

// code à 4 chiffres
eq('pin ok', L.pinProblem('2580'), null);
eq('pin format', L.pinProblem('258'), 'format');
eq('pin lettres', L.pinProblem('12a4'), 'format');
eq('pin faible', L.pinProblem('1234'), 'weak');
eq('pin faible 2', L.pinProblem('0000'), 'weak');

// période d'accès : J−14 avant l'installation, J+14 après la fin du démontage (ou de l'installation)
const p = { installationStart: new Date('2026-12-06T00:00:00Z'), installationEnd: new Date('2026-12-08T00:00:00Z'), dismantlingStart: new Date('2026-12-20T00:00:00Z'), dismantlingEnd: new Date('2026-12-21T00:00:00Z') };
eq('fenêtre', L.siteWindow(p, { before: 14, after: 14 }), { from: '2026-11-22', to: '2027-01-04', before: 14, after: 14 });
eq('fenêtre sans démontage', L.siteWindow({ ...p, dismantlingStart: null, dismantlingEnd: null }, { before: 14, after: 14 }).to, '2026-12-22');
eq('fenêtre propre au projet', L.siteWindow({ ...p, siteDaysBefore: 3, siteDaysAfter: 0 }, { before: 14, after: 14 }), { from: '2026-12-03', to: '2026-12-21', before: 3, after: 0 });
eq('phase installation', L.phaseOn(p, '2026-12-07'), 'installation');
eq('phase démontage', L.phaseOn(p, '2026-12-20'), 'dismantling');

// fichiers visibles sur chantier
eq('plans validés d’office', L.siteSectionOf({ fileName: 'Hoka_Rev-B_VALIDE.pdf', category: 'plans' }), 'plans');
eq('briefing d’office', L.siteSectionOf({ fileName: 'Briefing_Hoka.pdf', category: 'general' }), 'briefing');
eq('planning → infos', L.siteSectionOf({ fileName: 'planning.pdf', category: 'planning' }), 'info');
eq('devis caché', L.siteSectionOf({ fileName: 'devis.pdf', category: 'general' }), 'none');
eq('choix du bureau', L.siteSectionOf({ fileName: 'devis.pdf', category: 'general', siteSection: 'plans' }), 'plans');
eq('choix du bureau : caché', L.siteSectionOf({ fileName: 'X_VALIDE.pdf', siteSection: 'none' }), 'none');
// fichier masqué pour certaines personnes (par défaut : toute l'équipe le voit)
eq('visible par défaut', L.fileVisibleFor({ siteHiddenFor: null }, 'u1'), true);
eq('masqué pour u1', [L.fileVisibleFor({ siteHiddenFor: ['u1'] }, 'u1'), L.fileVisibleFor({ siteHiddenFor: ['u1'] }, 'u2')], [false, true]);
eq('liste nettoyée', L.cleanHiddenFor(['u1', ' u1 ', '', null, 'u2', 3]), ['u1', 'u2', '3']);
eq('liste invalide', L.cleanHiddenFor('u1'), []);
eq('masquer', L.withVisibility(['u2'], 'u1', false), ['u2', 'u1']);
eq('masquer deux fois', L.withVisibility(['u1'], 'u1', false), ['u1']);
eq('remontrer', L.withVisibility(['u1', 'u2'], 'u1', true), ['u2']);

// compteurs d'un modèle de tâche
eq('compteurs', L.cleanQuantityFields([{ label: 'Vitres' }, { label: { fr: 'Vitres', pl: 'Szyby' } }, { label: { en: 'only en' } }, { label: { fr: 'Portes' }, unit: 'pcs' }]),
  [{ key: 'vitres', label: { fr: 'Vitres' } }, { key: 'vitres-2', label: { fr: 'Vitres', pl: 'Szyby' } }, { key: 'portes', label: { fr: 'Portes' }, unit: 'pcs' }]);
eq('compteurs vides', L.cleanQuantityFields([]), null);
eq('quantités', L.cleanQuantities([{ key: 'viewbox', label: 'Viewbox', qty: 6.4 }, { key: 'x', label: 'X', qty: -3 }, { label: '' }]), [{ key: 'viewbox', label: 'Viewbox', qty: 6 }, { key: 'x', label: 'X', qty: 0 }]);
eq('quantités texte', L.quantitiesText([{ key: 'viewbox', label: 'Viewbox', qty: 6 }, { key: 'vitres', label: 'vitres', qty: 0 }, { key: 'portes', label: 'portes', qty: 2 }]), '6 Viewbox · 2 portes');

// lignes de la feuille
const lines = L.cleanLines([
  { id: 'a', title: '  Construction Viewbox ', hours: 7.6, workers: 4.2, taskTemplateId: 'tpl1', comment: 'Zrobione', commentLang: 'pl', photos: [{ url: 'http://x' }, { url: 'https://ok/p.jpg', publicId: 'p' }] },
  { id: 'a', title: 'doublon id', hours: 30, workers: -1 },
  { title: '' },
  { title: 'Déchargement', hours: 1 },
], [], 'pl');
eq('ligne 1', { h: lines[0].hours, w: lines[0].workers, t: lines[0].title, fr: lines[0].commentFr, ph: lines[0].photos, nt: lines[0].newTask }, { h: 7.5, w: 4, t: 'Construction Viewbox', fr: null, ph: [{ url: 'https://ok/p.jpg', publicId: 'p' }], nt: false });
eq('ligne 2 bornée, nouvel id', { h: lines[1].hours, w: lines[1].workers, other: lines[1].id !== 'a' }, { h: 24, w: 0, other: true });
eq('lignes vides ignorées', lines.length, 3);
eq('tâche libre = nouvelle tâche', lines[2].newTask, true);
// la traduction déjà faite est gardée tant que le commentaire ne change pas
const prev = [{ ...lines[0], commentFr: 'Fait' }];
eq('traduction gardée', L.cleanLines([{ ...lines[0] }], prev, 'pl')[0].commentFr, 'Fait');
eq('traduction refaite', L.cleanLines([{ ...lines[0], comment: 'Inny' }], prev, 'pl')[0].commentFr, null);
eq('commentaire FR = sa traduction', L.cleanLines([{ id: 'z', title: 'x', comment: 'ok', commentLang: 'fr' }])[0].commentFr, 'ok');
// tâche créée dans le projet à une validation précédente : son id est gardé
eq('tâche créée gardée', L.cleanLines([{ id: 'b', title: 'Déchargement', newTask: true }], [{ id: 'b', title: 'Déchargement', hours: 0, workers: 0, newTask: true, taskId: 'task-9' }])[0].taskId, 'task-9');
eq('total', L.sheetTotals([{ id: '1', title: 'a', hours: 7.5, workers: 4 }, { id: '2', title: 'b', hours: 1, workers: 3 }]), { manHours: 33, hours: 8.5, tasks: 2 });
eq('présents', L.cleanPresent([{ userId: 'u1', name: 'Jan' }, { userId: 'u1', name: 'Jan' }, { name: ' Intérim  X ' }, { name: 'intérim x' }, {}]), [{ userId: 'u1', name: 'Jan' }, { name: 'Intérim X' }]);

// journée complète en une tâche : jamais une tâche du projet, titre français imposé
const gen = L.cleanLines([{ id: 'g', general: 'dismantling', title: 'Demontaż', taskId: 't1', newTask: true, done: true, hours: 8, workers: 4, comment: 'Zdemontowaliśmy dach', commentLang: 'pl' }], [], 'pl')[0];
eq('générale : titre FR', gen.title, 'Démontage (journée complète)');
eq('générale : pas de tâche', [gen.general, gen.taskId, gen.newTask, gen.done], ['dismantling', null, false, false]);
eq('générale : commentaire polonais gardé, à traduire', [gen.comment, gen.commentLang, gen.commentFr], ['Zdemontowaliśmy dach', 'pl', null]);
eq('générale inconnue = ligne normale', L.cleanLines([{ id: 'x', general: 'autre', title: 'Câblage' }])[0].general, undefined);
eq('journal : traduction', L.journalText({ ...gen, commentFr: 'Nous avons démonté le toit' }), 'Démontage (journée complète) : Nous avons démonté le toit');
eq('journal : original sans traduction', L.journalText(gen), 'Démontage (journée complète) : Zdemontowaliśmy dach');
eq('journal : rien sans commentaire', L.journalText({ ...gen, comment: '' }), null);

// qui valide : le niveau juste au-dessus, jamais soi-même
const v = (validatorRole: string, filledRole: L.FilledRole, isPSM = false, same = false) =>
  L.canValidate({ validatorId: same ? 'me' : 'v', validatorRole, filledById: 'me', filledRole, isProjectSiteManager: isPSM });
eq('SM valide chef', v('site_manager', 'crew_lead', true), true);
eq('SM d’un autre projet', v('site_manager', 'crew_lead', false), false);
eq('TM valide chef', v('technical_manager', 'crew_lead'), true);
eq('sales valide SM', v('sales_engineer', 'site_manager'), true);
eq('SM ne valide pas SM', v('site_manager', 'site_manager', true), false);
eq('engineer non', v('engineer', 'crew_lead'), false);
eq('project manager non', v('project_manager', 'crew_lead'), false);
eq('installateur non', v('installer', 'crew_lead'), false);
eq('jamais soi-même', v('technical_manager', 'crew_lead', false, true), false);
eq('admin', v('admin', 'site_manager'), true);
eq('rôle de celui qui remplit', [L.filledRoleOf('installer'), L.filledRoleOf('site_manager'), L.filledRoleOf('worker')], ['crew_lead', 'site_manager', 'crew_lead']);
eq('modifiable', [L.fillerCanEdit('draft'), L.fillerCanEdit('submitted'), L.fillerCanEdit('returned'), L.fillerCanEdit('validated')], [true, true, true, false]);

console.log(fails ? `\n${fails} / ${n} échec(s)` : `VEM Chantier (logique) : ${n} tests OK`);
if (fails) process.exit(1);
