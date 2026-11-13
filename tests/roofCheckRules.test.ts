// Tests des règles pures du plan de contrôle de l'étanchéité de toiture (src/services/roofCheckRules.ts).
// Lancer : npm run test:roof-check   (code de sortie 1 si un test échoue)
import {
  cleanRoofConfig, checkPointUpdate, parentSummary, planPublish, nextCode, isGenericRoofItem, photoDeleteBlock, tasksFor,
  cleanTasksDone, NOT_PUBLISHED_COMMENT,
} from '../src/services/roofCheckRules';
import { CHECKLIST_LIBRARY } from '../src/services/checklistLibrary';

let fails = 0, n = 0;
function eq(name: string, got: any, exp: any) {
  n++;
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g !== e) { fails++; console.log(`✗ ${name}\n   got ${g}\n   exp ${e}`); }
}

// ─── Config : valeurs par défaut = réponses d'A. Pinchart (18.10.2026) ───
{
  const c = cleanRoofConfig(null);
  eq('tous les types', Object.values(c.types).every(Boolean), true);
  eq('toits sous étage contrôlés', c.includeCovered, true);
  eq('bloquant pas encore choisi', c.critical, null);
  eq('1 photo par point', c.minPhotos, 1);
  eq('points génériques remplacés', c.replaceGenericItems, true);
  const d = cleanRoofConfig({ critical: true, types: { 'outer-corner': false, custom: false }, minPhotos: 99 });
  eq('lu et borné', [d.critical, d.types['outer-corner'], d.types.cross, d.types.custom, d.minPhotos], [true, false, true, true, 10]);
  eq('ancien format photo.min', cleanRoofConfig({ photo: { min: 2 } }).minPhotos, 2);
}

// ─── Tâches par type ───
eq('jonction = caoutchouc + bande', tasksFor('seam-long').map((t) => t.key), ['rubber', 'tape']);
eq('jonction permanente + laine', tasksFor('seam-short', 'permanente').map((t) => t.key), ['rubber', 'tape', 'wool']);
eq('croisement permanente sans laine', tasksFor('cross', 'permanente').map((t) => t.key), ['cross-tape']);
eq('type inconnu = point ajouté', tasksFor('xx' as any).map((t) => t.key), ['through']);

// ─── Statut d'un point ───
{
  const tasks = tasksFor('seam-long');
  const p = { status: 'pending', comment: null, tasks, tasksDone: cleanTasksDone({}, tasks), minPhotos: 1 };
  eq('OK sans photo refusé', 'error' in checkPointUpdate(p, { status: 'ok' }, 0), true);
  const ok = checkPointUpdate(p, { status: 'ok' }, 1) as any;
  eq('OK avec photo : tâches cochées d’office', [ok.ok, ok.tasksDone, ok.statusChanged], [true, { rubber: true, tape: true }, true]);
  eq('Partiel sans commentaire refusé', 'error' in checkPointUpdate(p, { status: 'partial' }, 1), true);
  const part = checkPointUpdate(p, { status: 'partial', comment: ' bande décollée ', tasksDone: { rubber: true } }, 1) as any;
  eq('Partiel avec commentaire', [part.status, part.comment, part.tasksDone], ['partial', 'bande décollée', { rubber: true, tape: false }]);
  eq('N.A. sans commentaire refusé', 'error' in checkPointUpdate(p, { status: 'na', comment: '  ' }, 0), true);
  eq('statut inconnu refusé', 'error' in checkPointUpdate(p, { status: 'done' }, 1), true);
  const okP = { ...p, status: 'ok', tasksDone: { rubber: true, tape: true } };
  eq('décocher une tâche d’un point OK refusé', 'error' in checkPointUpdate(okP, { tasksDone: { tape: false } }, 1), true);
  eq('sans photo demandée, OK direct', (checkPointUpdate({ ...p, minPhotos: 0 }, { status: 'ok' }, 0) as any).ok, true);
  eq('photo de preuve non supprimable', typeof photoDeleteBlock({ status: 'ok', minPhotos: 1 }, 1), 'string');
  eq('2e photo supprimable', photoDeleteBlock({ status: 'ok', minPhotos: 1 }, 2), null);
  eq('photo d’un point à faire supprimable', photoDeleteBlock({ status: 'pending', minPhotos: 1 }, 1), null);
}

// ─── Point « roofmap » de la check-list ───
{
  const pt = (code: string, status: string, extra: any = {}) => ({ code, status, covered: false, excluded: false, archived: false, ...extra });
  eq('pas publié', [parentSummary([], true, false).status, parentSummary([], true, false).comment], ['pending', NOT_PUBLISHED_COMMENT]);
  eq('aucun point actif = N.A.', parentSummary([pt('J01', 'pending', { archived: true })], true, true).status, 'na');
  const s = parentSummary([pt('N0-J01', 'ok'), pt('N0-J02', 'partial'), pt('N0-X01', 'nok'), pt('N0-A01', 'na'), pt('N0-E01', 'pending')], true, true);
  eq('un à faire ⇒ à vérifier', s.status, 'pending');
  eq('compteurs', [s.total, s.ok, s.partial, s.nok, s.na, s.pending, s.closed, s.problems, s.percent], [5, 1, 1, 1, 1, 1, 2, 2, 40]);
  eq('commentaire', s.comment, '1 OK · 1 N.A. · 1 partiel (N0-J02) · 1 non fait (N0-X01) · 1 à faire — 2/5 points contrôlés sur le plan de toiture.');
  eq('non fait l’emporte sur partiel', parentSummary([pt('a', 'ok'), pt('b', 'partial'), pt('c', 'nok')], true, true).status, 'nok');
  eq('tout OK', parentSummary([pt('a', 'ok'), pt('b', 'na')], true, true).status, 'ok');
  eq('sous l’étage ignorés si demandé', parentSummary([pt('a', 'ok'), pt('b', 'pending', { covered: true })], false, true).status, 'ok');
  eq('type non contrôlé ignoré', parentSummary([pt('a', 'ok'), pt('b', 'pending', { excluded: true })], true, true).status, 'ok');
}

// ─── Publication ───
{
  const existing = [
    { id: '1', key: 'seam|VBX-01|VBX-02', source: 'model', archived: false },
    { id: '2', key: 'corner|VBX-01|x0y0', source: 'model', archived: false },
    { id: '3', key: 'field|abc', source: 'field', archived: false },
    { id: '4', key: 'end|VBX-01|VBX-02|x1y0', source: 'model', archived: true },
  ];
  const plan = planPublish(existing, [{ key: 'seam|VBX-01|VBX-02' }, { key: 'end|VBX-01|VBX-02|x1y0' }, { key: 'seam|VBX-02|VBX-03' }]) as any;
  eq('même clé = même point, archivé remis', plan.updates, [{ id: '1', index: 0, unarchive: false }, { id: '4', index: 1, unarchive: true }]);
  eq('nouveau point', plan.creates, [2]);
  eq('absent archivé, point de chantier gardé', plan.archives, ['2']);
  eq('clé en double refusée', 'error' in planPublish([], [{ key: 'a' }, { key: 'a' }]), true);
}

eq('code suivant', nextCode(['N0-P01', 'N0-P02', 'N1-P07', 'N0-J01'], 0, 'P'), 'N0-P03');
eq('premier code', nextCode([], 1, 'P'), 'N1-P01');

// ─── Les 3 points génériques de la bibliothèque sont bien reconnus ───
{
  const cat = CHECKLIST_LIBRARY.find((c: any) => c.name === 'Joints et étanchéité entre boxes');
  const labels: string[] = (cat?.items || []).map((x: any) => (typeof x === 'string' ? x : x.label));
  eq('3 points génériques trouvés dans la bibliothèque', labels.filter(isGenericRoofItem).length, 3);
}

console.log(fails ? `${fails} / ${n} test(s) en échec` : `${n} tests OK`);
process.exit(fails ? 1 : 0);
