// scripts/test-roofcheck.ts — tests des règles pures du contrôle des jonctions de toiture (le backend n'a pas d'outil de test).
// Lancer : npx ts-node --transpile-only scripts/test-roofcheck.ts   (code de sortie 1 si un test échoue)
import {
  cleanRoofConfig, checkPointUpdate, parentSummary, planPublish, nextCode, isGenericRoofItem, photoDeleteBlock, cleanTasksDone,
  NOT_PUBLISHED_COMMENT,
} from '../src/services/roofCheckRules';
import { mergeRoofLibrary, cleanSavedLibrary, defaultTasksFor, ROOF_LIBRARY_BASE } from '../src/services/roofCheckLibrary';
import { CHECKLIST_LIBRARY, parseLibraryItem } from '../src/services/checklistLibrary';

let failed = 0;
let passed = 0;
function check(name: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}\n      obtenu  : ${a}\n      attendu : ${e}`); }
}

console.log('Config (lecture tolérante, valeurs par défaut = réponses d’Amaury)');
{
  const c = cleanRoofConfig(null);
  check('tous les types cochés', Object.values(c.types).every(Boolean), true);
  check('toits sous étage contrôlés', c.includeCovered, true);
  check('critique pas encore choisi', c.critical, null);
  check('1 photo par point', c.photo, { mode: 'per-point', min: 1 });
  check('schéma simplifié', c.background.style, 'schema');
  check('remplacement des points génériques', c.replaceGenericItems, true);
  check('installateurs non', c.installersCanFill, false);
  const d = cleanRoofConfig({ critical: true, types: { 'outer-corner': false }, photo: { mode: 'per-task', min: 99 }, levels: [1, 0, 1, -2, 'x'], tolerances: { gapMaxMm: 'abc', minOverlapMm: 150 } });
  check('valeurs lues et bornées', [d.critical, d.types['outer-corner'], d.types.cross, d.photo, d.levels, d.tolerances.gapMaxMm, d.tolerances.minOverlapMm], [true, false, true, { mode: 'per-task', min: 10 }, [0, 1], 60, 150]);
}

console.log('Bibliothèque des tâches');
{
  const lib = mergeRoofLibrary(cleanSavedLibrary({ tasks: { seam: [{ key: 'tape', label: 'Bande posée (modifiée)', photo: true }, { key: 'extra', label: 'Contrôle visuel', photo: false }, { key: 'BAD KEY', label: 'x' }] } }));
  check('même clé remplacée, nouvelle ajoutée, clé invalide ignorée', lib.seam.map((t) => t.key), ['rubber', 'tape', 'u-profile', 'extra']);
  check('libellé modifié', lib.seam[1].label, 'Bande posée (modifiée)');
  check('base intacte', ROOF_LIBRARY_BASE.seam[1].label.startsWith('Bande Rooftec'), true);
  const base = mergeRoofLibrary(null);
  check('jonction éphémère = caoutchouc + bande (U décoché)', defaultTasksFor('seam-long', base, 'ephemere').map((t) => t.key), ['rubber', 'tape']);
  check('jonction permanente + laine de roche', defaultTasksFor('seam-short', base, 'permanente').map((t) => t.key), ['rubber', 'tape', 'wool']);
  check('T = bandes croisées', defaultTasksFor('tee', base).map((t) => t.key), ['cross-tape']);
}

const T = [
  { key: 'rubber', label: 'Caoutchouc', photo: true, active: true },
  { key: 'tape', label: 'Bande', photo: true, active: true },
];
const point = (over: Partial<{ status: string; comment: string | null; tasksDone: Record<string, boolean>; minPhotos: number }> = {}) => ({
  status: 'pending', comment: null, tasks: T, tasksDone: { rubber: false, tape: false }, minPhotos: 1, ...over,
});
const err = (r: any) => ('error' in r ? r.error : null);

console.log('Règles d’un point (OK = tâches + photo)');
{
  check('OK refusé sans tâches ni photo', err(checkPointUpdate(point(), { status: 'ok' }, [], 'per-point')), 'Pas encore OK : coche les tâches : Caoutchouc ; Bande · prends au moins 1 photo.');
  check('OK refusé sans photo', err(checkPointUpdate(point(), { status: 'ok', tasksDone: { rubber: true, tape: true } }, [], 'per-point')), 'Pas encore OK : prends au moins 1 photo.');
  const ok = checkPointUpdate(point(), { status: 'ok', tasksDone: { rubber: true, tape: true } }, [{ taskKey: null }], 'per-point');
  check('OK accepté avec tâches + photo', [err(ok), (ok as any).status, (ok as any).statusChanged], [null, 'ok', true]);
  check('per-task : photo de chaque tâche', err(checkPointUpdate(point(), { status: 'ok', tasksDone: { rubber: true, tape: true } }, [{ taskKey: 'rubber' }], 'per-task')), 'Pas encore OK : photo de : Bande.');
  check('commentaire obligatoire pour Partiel', err(checkPointUpdate(point(), { status: 'partial' }, [], 'per-point')), 'Commentaire obligatoire pour « Partiel » : explique pourquoi.');
  check('Non fait avec commentaire accepté', err(checkPointUpdate(point(), { status: 'nok', comment: 'bande manquante' }, [], 'per-point')), null);
  check('N.A. sans tâches accepté avec commentaire', err(checkPointUpdate(point(), { status: 'na', comment: 'sous une gaine' }, [], 'per-point')), null);
  check('décocher une tâche d’un point OK refusé', err(checkPointUpdate(point({ status: 'ok', tasksDone: { rubber: true, tape: true } }), { tasksDone: { tape: false } }, [{}], 'per-point')), 'Ce point est OK : passe-le en « Partiel » ou « À faire » avant de décocher une tâche.');
  const back = checkPointUpdate(point({ status: 'ok', tasksDone: { rubber: true, tape: true } }), { status: 'pending', tasksDone: { tape: false } }, [{}], 'per-point');
  check('remettre À faire + décocher accepté', [err(back), (back as any).tasksDone], [null, { rubber: true, tape: false }]);
  check('clé de tâche inconnue ignorée', (checkPointUpdate(point(), { tasksDone: { rubber: true, pirate: true } }, [], 'per-point') as any).tasksDone, { rubber: true, tape: false });
  check('statut inconnu refusé', err(checkPointUpdate(point(), { status: 'done' }, [], 'per-point')), 'Statut invalide : done');
  check('0 photo demandée : OK sans photo', err(checkPointUpdate(point({ minPhotos: 0 }), { status: 'ok', tasksDone: { rubber: true, tape: true } }, [], 'per-point')), null);
  check('supprimer la seule photo d’un point OK refusé', !!photoDeleteBlock({ status: 'ok', tasks: T, minPhotos: 1, tasksDone: { rubber: true, tape: true } }, [{ id: 'a' }], 'a', 'per-point'), true);
  check('supprimer une photo en trop d’un point OK accepté', photoDeleteBlock({ status: 'ok', tasks: T, minPhotos: 1, tasksDone: { rubber: true, tape: true } }, [{ id: 'a' }, { id: 'b' }], 'a', 'per-point'), null);
  check('tâches cochées nettoyées', cleanTasksDone({ rubber: 'yes', tape: true, x: true }, T), { rubber: false, tape: true });
}

console.log('Point parent « roofmap »');
{
  const P = (code: string, status: string, o: Partial<{ covered: boolean; excluded: boolean; archived: boolean }> = {}) => ({ code, status, covered: false, excluded: false, archived: false, ...o });
  check('pas publié ⇒ À vérifier', [parentSummary([], true, false).status, parentSummary([], true, false).comment], ['pending', NOT_PUBLISHED_COMMENT]);
  check('aucun point actif ⇒ N.A.', parentSummary([P('N0-J01', 'pending', { excluded: true })], true, true).status, 'na');
  const s1 = parentSummary([P('N0-J01', 'ok'), P('N0-J02', 'pending'), P('N0-J03', 'nok')], true, true);
  check('un à faire ⇒ pending', s1.status, 'pending');
  check('commentaire automatique', s1.comment, '1 OK · 1 non fait (N0-J03) · 1 à faire — 1/3 points contrôlés sur le plan de toiture.');
  check('nok avant partial', parentSummary([P('a', 'ok'), P('b', 'partial'), P('c', 'nok')], true, true).status, 'nok');
  check('partial', parentSummary([P('a', 'ok'), P('b', 'partial'), P('c', 'na')], true, true).status, 'partial');
  const s2 = parentSummary([P('N0-J01', 'ok'), P('N0-E01', 'na'), P('N0-X01', 'pending', { archived: true }), P('N0-J02', 'pending', { covered: true })], false, true);
  check('archivés et couverts (sans includeCovered) ignorés ⇒ ok', [s2.status, s2.total, s2.closed], ['ok', 2, 2]);
  check('couverts comptés avec includeCovered', parentSummary([P('N0-J01', 'ok'), P('N0-J02', 'pending', { covered: true })], true, true).status, 'pending');
  const many = Array.from({ length: 10 }, (_, i) => P(`N0-J${String(i + 1).padStart(2, '0')}`, 'partial'));
  check('codes tronqués au-delà de 8', parentSummary(many, true, true).comment.includes('N0-J08…'), true);
}

console.log('Publication : correspondance des points');
{
  const existing = [
    { id: '1', key: 'seam-long|L0|VBX-01:L1|VBX-02:L0', source: 'model', archived: false },
    { id: '2', key: 'end|L0|A', source: 'model', archived: false },
    { id: '3', key: 'end|L0|B', source: 'model', archived: true },
    { id: '4', key: 'custom|abc', source: 'field', archived: false },
    { id: '5', key: 'cross|L0|old', source: 'model', archived: false },
  ];
  const plan = planPublish(existing, [
    { key: 'seam-long|L0|VBX-01:L1|VBX-02:L0' },
    { key: 'end|L0|B' },
    { key: 'cross|L0|new', matchKey: 'cross|L0|old' },
    { key: 'seam-short|L0|new' },
  ]);
  check('mises à jour (même clé, désarchivé, correspondance)', 'error' in plan ? plan : plan.updates, [
    { id: '1', index: 0, rekey: false, unarchive: false },
    { id: '3', index: 1, rekey: false, unarchive: true },
    { id: '5', index: 2, rekey: true, unarchive: false },
  ]);
  check('créations', 'error' in plan ? plan : plan.creates, [3]);
  check('archivés (le point libre de chantier est gardé)', 'error' in plan ? plan : plan.archives, ['2']);
  const plan2 = planPublish(existing, [], ['custom|abc']);
  check('point libre retiré explicitement', 'error' in plan2 ? plan2 : plan2.archives, ['1', '2', '4', '5']);
  check('clé en double refusée', planPublish(existing, [{ key: 'x' }, { key: 'x' }]), { error: 'Clé de point en double ou vide : x' });
  const plan3 = planPublish(existing, [{ key: 'end|L0|A' }, { key: 'zzz', matchKey: 'end|L0|A' }]);
  check('matchKey déjà pris par sa propre clé ⇒ création', 'error' in plan3 ? plan3 : plan3.creates, [1]);
}

console.log('Codes et points génériques');
{
  check('code suivant', nextCode(['N0-P01', 'N0-P02', 'N1-P07', 'N0-J03'], 0, 'P'), 'N0-P03');
  check('premier code d’un niveau', nextCode([], 1, 'P'), 'N1-P01');
  const joints = CHECKLIST_LIBRARY.find((c) => c.name === 'Joints et étanchéité entre boxes')!;
  const generic = joints.items.map((raw) => parseLibraryItem(raw).label).filter(isGenericRoofItem);
  check('les 3 points génériques de la bibliothèque reconnus', generic, [
    'Caoutchouc supérieur entre les toitures posé sans pli ni interruption',
    'Bandes de toiture Rooftec / Rooftape posées sur toutes les jonctions prévues',
    'Bandes croisées aux intersections entre boxes ; bords bien collés',
  ]);
}

console.log(`\n${passed} test(s) OK, ${failed} en échec`);
process.exit(failed ? 1 : 0);
