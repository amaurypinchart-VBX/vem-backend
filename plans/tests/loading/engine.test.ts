// Moteur de la loading liste sur des topologies synthétiques : bases, conditions, tranches / paliers, spares,
// exclusion des régimes de vitrage, kits de portes, substitutions (airco, murs RAL), sous-bois de l'étude, questions
// quand une réponse manque, règle manquante en box connectées, appréciation, corrections « seulement ce chantier ».
import { describe, expect, it } from 'vitest';
import type { NodeInfo, SceneIndex } from '../../src/core/types';
import type { ModuleFrame, Vec3 } from '../../src/core/views';
import { makeModuleFrame } from '../../src/core/views';
import { buildTopology } from '../../src/loading/topology/build';
import { generate } from '../../src/loading/engine/generate';
import type { LoadingRule } from '../../src/loading/core/types';
import { platesFromMaterials } from '../../src/loading/core/answers';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';
import { SEED_OBSERVATIONS, SEED_RULES } from '../../src/loading/library/seed';

const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));
let seq = 0;
const item = (moduleId: string, articleRef: string | undefined, category: string, b: [number, number, number, number, number, number]): NodeInfo => ({
  id: `n${++seq}`,
  name: articleRef ?? 'x',
  parentId: null,
  kind: 'group',
  role: 'item',
  category,
  categorySource: 'manifest',
  moduleId,
  assignment: 'spatial',
  level: 0,
  bboxMm: b,
  triangles: 10,
  articleRef,
});
/** n box côte à côte par les grands côtés (z = 0, 2500…), chacune avec son standard 7-962-016 ; éléments en plus. */
function topo(n: number, extra: (ids: string[]) => NodeInfo[] = () => [], gap = 0) {
  const ids = Array.from({ length: n }, (_, k) => `VBX-0${k + 1}`);
  const frames = new Map<string, ModuleFrame>(
    ids.map((id, k) => [id, makeModuleFrame(id, { xAxis: [1, 0, 0] as Vec3, yAxis: [0, 0, 1] as Vec3, up: [0, 1, 0] as Vec3, origin: [0, 0, k * (2500 + gap)] as Vec3 }, [0, 0, 0], [5900, 2500, 3080])]),
  );
  const nodes = [...ids.map((id) => item(id, '7-962-016', 'STRUCTURE', [0, 0, 0, 1, 1, 1])), ...extra(ids)];
  const index = { modules: ids.map((id) => ({ id, nodeId: id, level: 0 })), nodes, levels: [] } as unknown as SceneIndex;
  return buildTopology({ index, frames, catalogue: cat });
}
const run = (t: ReturnType<typeof topo>, opts: Partial<Parameters<typeof generate>[0]> = {}) =>
  generate({ topology: t, rules: SEED_RULES, catalogue: cat, observations: SEED_OBSERVATIONS, ...opts });
const line = (l: ReturnType<typeof run>, a: string) => l.lines.find((x) => x.article === a);

describe('bases, conditions, spares', () => {
  it('box seule : règles standalone, spare + 20 % sur le total, rien des box connectées', () => {
    const l = run(topo(1), { answers: { aircoCount: 0 } });
    expect(line(l, '4-700-065')).toMatchObject({ qty: 10, status: 'calcule' });
    expect(line(l, '4-700-003')?.qty).toBe(2);
    expect(line(l, '4-700-039')).toBeUndefined();
    expect(line(l, '4-710-001')).toBeUndefined();
    expect(line(l, '4-700-096')).toBeUndefined();
  });
  it('box connectées : plaques, boulons, EPDM par jonction ; joints de box seules en règle manquante', () => {
    const l = run(topo(2), { answers: { aircoCount: 0 } });
    expect(line(l, '4-700-039')).toMatchObject({ qty: 7 }); // 5 × 1 = 5 + 30 % → 7
    expect(line(l, '4-710-001')).toMatchObject({ qty: 13 }); // 10 + 30 % → 13
    expect(line(l, '4-700-096')).toMatchObject({ qty: 2 }); // 1 jonction de toit + 1
    expect(line(l, '4-700-065')).toMatchObject({ qty: null, status: 'regle_manquante' });
    expect(line(l, '4-700-065')?.detail).toContain('observé');
  });
  it('box séparées de 30 cm : deux îlots standalone', () => {
    const l = run(topo(2, () => [], 300), { answers: { aircoCount: 0 } });
    expect(line(l, '4-700-065')?.qty).toBe(20);
    expect(line(l, '4-730-001')?.qty).toBe(2);
  });
  it('toolkit : paliers, au-delà = question', () => {
    expect(line(run(topo(8)), '4-750-001')?.qty).toBe(2);
    const big = run(topo(16));
    expect(line(big, '4-750-001')).toMatchObject({ qty: null, status: 'a_confirmer' });
    expect(big.questions.map((q) => q.text).join()).toMatch(/au-delà des paliers/);
  });
});

describe('vitrages, portes, substitutions', () => {
  const glass10 = (ids: string[]) => [
    item(ids[0], '7-637-009', 'VITRE-SEAMLESS', [130, 0, -20, 1260, 2500, 20]),
    item(ids[0], '7-637-009', 'VITRE-SEAMLESS', [1260, 0, -20, 2390, 2500, 20]),
    item(ids[0], '7-199-067', 'PORTE-SIMPLE', [2390, 0, -20, 3520, 2500, 20]),
    item(ids[0], '7-636-008', 'MUR-LEGER', [3520, 0, -20, 4650, 2500, 20]),
  ];
  it('régime 10 mm seul : plexi 10 mm, square, joints du côté vitré ; rien du 8.8.2', () => {
    const l = run(topo(1, glass10), { answers: { aircoCount: 0 } });
    expect(line(l, '4-700-060')?.qty).toBe(2); // v|v + v|porte
    expect(line(l, '4-700-072')?.qty).toBe(2); // 1 bout contre le coin + 20 % → 2
    expect(line(l, '4-700-074')?.qty).toBe(3); // 1 grand côté vitré × 2 + 50 %
    expect(line(l, '4-700-061')).toBeUndefined();
    expect(line(l, '4-700-073')?.qty).toBe(8); // 2 / côté : règle de box seule sans condition de vitrage
  });
  it('porte simple : 3 marches, même si les marches ne sont pas dans la 3D', () => {
    expect(line(run(topo(1, glass10)), '7-632-017')?.qty).toBe(3);
  });
  it('murs RAL 7024 : les nidaplast dessinés sortent en 7-636-006', () => {
    const l = run(topo(1, glass10), { answers: { ralMurs: '7024' } });
    expect(line(l, '7-636-006')?.qty).toBe(1);
    expect(line(l, '7-636-008')).toBeUndefined();
    const q = run(topo(1, glass10));
    expect(q.questions.map((x) => x.id)).toContain('q:ralMurs');
    expect(line(q, '7-636-008')?.qty).toBe(1);
  });
  it('airco : un mur à trou en plus par airco, aucun mur retiré', () => {
    const l = run(topo(1, glass10), { answers: { aircoCount: 1 } });
    expect(line(l, '4-700-027')?.qty).toBe(1);
    expect([line(l, '4-700-083')?.qty, line(l, '7-636-008')?.qty]).toEqual([1, 1]);
    expect(l.questions.map((x) => x.id)).not.toContain('q:aircoSlot');
  });
  it('racks de 15 : places libres proposées en spares, jamais ajoutées d’office', () => {
    const l = run(topo(1, glass10), { answers: { aircoCount: 0 } });
    expect(l.notes.join()).toMatch(/4 pièces → 1 rack\(s\) de 15 → 11 place\(s\) libre\(s\)/);
    expect(line(l, '7-636-008')?.qty).toBe(1);
  });
});

describe('questions, étude structure, appréciation, corrections', () => {
  it('sans étude structure : les sous-bois attendent l’étude', () => {
    const l = run(topo(1));
    expect(line(l, '4-740-001')).toMatchObject({ qty: null, status: 'a_confirmer' });
    expect(l.questions.find((q) => q.id === 'q:etude')?.text).toMatch(/Étude structure/);
  });
  it('plaques de l’étude × 2, plaque sans référence signalée', () => {
    const plates = platesFromMaterials([
      { label: 'Multiplex bouleau', dims: '400 × 400 × 18 mm', quantity: 6 },
      { label: 'Multiplex bouleau', dims: '1000 × 1000 × 36 mm', quantity: 4 },
      { label: 'Contreplaqué F40/30', dims: '550 × 550 × 27 mm', quantity: 2 },
      { label: 'Bois C24', dims: '100 × 200 × 6000 mm', quantity: 2 },
    ]);
    expect(plates).toHaveLength(3);
    const l = run(topo(1), { study: { plates, source: 'test' } });
    expect([line(l, '4-740-001')?.qty, line(l, '4-740-003')?.qty, line(l, '4-740-002')]).toEqual([12, 8, undefined]);
    expect(l.notes.join()).toMatch(/550 × 550/);
  });
  it('réponse manquante = question, jamais une supposition', () => {
    const l = run(topo(1));
    const ids = l.questions.map((q) => q.id);
    expect(ids).toEqual(expect.arrayContaining(['q:plancherLamine', 'q:hauteur', 'q:tailleJob']));
    expect(line(l, '4-740-010')).toMatchObject({ qty: null });
    expect(line(l, '4-750-006')).toMatchObject({ qty: null });
  });
  it('appréciation : sans quantité tant qu’elle n’est pas saisie', () => {
    expect(line(run(topo(1)), '4-730-005')).toMatchObject({ qty: null, status: 'appreciation' });
    expect(line(run(topo(1), { answers: { appreciation: { '4-730-005': 25 } } }), '4-730-005')).toMatchObject({ qty: 25, status: 'appreciation' });
  });
  it('correction « seulement ce chantier »', () => {
    const l = run(topo(1), { judgements: { '4-730-008': 1 } });
    expect(line(l, '4-730-008')).toMatchObject({ qty: 1, status: 'jugement' });
    expect(line(l, '4-730-008')?.detail).toContain('corrigé pour ce chantier : 2 → 1');
  });
  it('une ligne garde ses règles et ses versions ; inputKey change avec une réponse', () => {
    const a = run(topo(1));
    expect(line(a, '4-700-065')?.contributions[0]).toMatchObject({ ruleKey: 'acc:4-700-065@box[standalone]', ruleVersion: 1 });
    expect(run(topo(1), { answers: { hauteur: true } }).inputKey).not.toBe(a.inputKey);
    expect(run(topo(1)).inputKey).toBe(a.inputKey);
  });
  it('quantité en texte : règle à préciser, aucune quantité inventée', () => {
    const r: LoadingRule = { ...SEED_RULES.find((x) => x.key === 'acc:4-700-003@box')!, key: 'test', qty: null, qtyText: '~2/box' };
    const l = generate({ topology: topo(1), rules: [r], catalogue: cat });
    expect(line(l, '4-700-003')).toMatchObject({ qty: null, status: 'a_confirmer' });
  });
});
