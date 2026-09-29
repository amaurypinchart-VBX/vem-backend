// Reconnaissance et bibliothèque : signatures (même définition = même type, numéros ignorés, objets sans nom par
// empreinte), statuts, pièces comprises dans le gabarit Viewbox, critère S3 (9 Viewbox → 1 type à confirmer ; un 2ᵉ
// modèle différent → 0 question pour les Viewbox), empreinte « probable », fusion base de départ + base en ligne.
import { describe, expect, it } from 'vitest';
import type { ModuleInfo, NodeInfo, SceneIndex } from '../../src/core/types';
import { makeLookup } from '../../src/core/subset';
import { recognize } from '../../src/structure/core/recognition';
import type { Assignments } from '../../src/structure/core/recognition';
import { baseName, itemTypeKey, roundDims } from '../../src/structure/core/signature';
import { fromServer, mergeLibrary, partTypeEntry, toPayload } from '../../src/structure/core/libraryStore';
import type { ServerLibraryRow } from '../../src/structure/core/libraryStore';
import type { LibraryEntry } from '../../src/structure/core/library';
import { SEED } from '../../src/structure/library/seed';

let seq = 0;
function node(p: Partial<NodeInfo>): NodeInfo {
  return {
    id: p.id ?? `n${++seq}`,
    name: p.name ?? 'Groupe',
    parentId: p.parentId ?? null,
    kind: p.kind ?? 'group',
    role: p.role ?? 'item',
    category: p.category ?? null,
    categorySource: null,
    moduleId: p.moduleId ?? null,
    assignment: p.assignment ?? null,
    level: 0,
    bboxMm: p.bboxMm ?? [0, 0, 0, 100, 100, 100],
    triangles: p.triangles ?? 12,
    ...p,
  } as NodeInfo;
}

/** Modèle : n Viewbox 5900 (définition `def`), chacune avec un mur, une vitre, son plancher, un objet inconnu. */
function model(n: number, def: string, extra: NodeInfo[] = []): SceneIndex {
  const nodes: NodeInfo[] = [];
  const modules: ModuleInfo[] = [];
  for (let k = 0; k < n; k++) {
    const id = `VBX-${String(k + 1).padStart(2, '0')}`;
    const mn = node({ id: `m${k}-${def}`, name: id, definition: def, role: 'module', moduleId: id });
    nodes.push(
      mn,
      node({ name: 'Plancher', category: 'PLANCHER', parentId: mn.id, moduleId: id, assignment: 'hierarchy', triangles: 400 }),
      node({ name: 'Mur léger 2500', definition: 'Mur léger 2500', category: 'MUR-LEGER', parentId: mn.id, moduleId: id, assignment: 'hierarchy', triangles: 24 }),
      node({ name: `Vitre ${k + 1}`, category: 'VITRE', parentId: mn.id, moduleId: id, assignment: 'hierarchy', bboxMm: [0, 0, 0, 2400, 2700, 10], triangles: 12 }),
      node({ name: 'Groupe', parentId: mn.id, moduleId: id, assignment: 'hierarchy', bboxMm: [0, 0, 0, 800, 400, 600], triangles: 300 }),
    );
    modules.push({
      id,
      nodeId: mn.id,
      name: id,
      level: 0,
      planDimsMm: [5900, 2500],
      heightMm: 3080,
      expected: { label: 'Viewbox 5900', long: 5900, short: 2500, source: 'standard' },
      dimsOk: true,
      bboxMm: [0, 0, 0, 5900, 3080, 2500],
      itemIds: [],
      detectedBy: 'name',
    });
  }
  nodes.push(...extra);
  return { schema: 'vem-plans-index/1', engineVersion: 't', createdAt: '', source: {} as SceneIndex['source'], stats: {} as SceneIndex['stats'], nodes, modules, levels: [], commonIds: [], contextIds: [], warnings: [] };
}

const run = (index: SceneIndex, library: LibraryEntry[] = SEED, assignments: Assignments = {}) =>
  recognize({ index, look: makeLookup(index), library, assignments, accessoryCategories: new Set() });

describe('signatures', () => {
  it('même définition = même type ; numéros finaux ignorés ; objets sans nom par empreinte', () => {
    const fp = { dims: roundDims([2400, 10, 2700]), materials: ['Verre'], category: 'VITRE', triangles: 12 };
    expect(itemTypeKey(node({ name: 'Porte A', definition: 'Porte 90' }), fp)).toBe(itemTypeKey(node({ name: 'Porte B', definition: 'Porte 90' }), fp));
    expect(baseName('MUR_LEGER#12')).toBe('MUR LEGER');
    expect(baseName('Vitre 3')).toBe('VITRE');
    expect(itemTypeKey(node({ name: 'Vitre 3' }), fp)).toBe(itemTypeKey(node({ name: 'Vitre 17' }), fp));
    expect(itemTypeKey(node({ name: 'Groupe#4' }), fp)).toMatch(/^geo:2700x2400x10\|VERRE\|VITRE$/);
    expect(itemTypeKey(node({ name: 'Mur', articleRef: '7-230-044' }), fp)).toBe('art:7-230-044');
  });
});

describe('reconnaissance', () => {
  it('9 Viewbox : un seul type Viewbox proposé, pièces du composant comprises dans le gabarit', () => {
    const r = run(model(9, 'Viewbox M16'));
    const mods = r.types.filter((t) => t.kind === 'module');
    expect(mods).toHaveLength(1);
    expect(mods[0].nodeIds).toHaveLength(9);
    expect(mods[0].status).toBe('suggested');
    expect(mods[0].assignment?.moduleTemplate).toBe('VIEWBOX-5900-EU');
    // les planchers des 9 Viewbox ne sont pas demandés
    expect(r.templateParts.size).toBe(9);
    // murs (même définition) et vitres (même nom, numéro différent) : un type chacun, proposés par catégorie
    const wall = r.types.find((t) => t.category === 'MUR-LEGER')!;
    expect(wall.nodeIds).toHaveLength(9);
    expect(wall.status).toBe('suggested');
    expect(r.types.find((t) => t.category === 'VITRE')!.nodeIds).toHaveLength(9);
    // objet sans nom ni catégorie : inconnu, bloquant
    const unk = r.types.find((t) => t.status === 'unknown')!;
    expect(unk.nodeIds).toHaveLength(9);
    expect(r.blocking).toBe(1);
    expect(r.types[0].status).toBe('unknown');
  });

  it('critère S3 : la Viewbox confirmée et mémorisée n’est plus demandée dans un autre modèle', () => {
    const first = run(model(9, 'Viewbox M16'));
    const vbx = first.types.find((t) => t.kind === 'module')!;
    const memorized = partTypeEntry(vbx, vbx.assignment!, 'Viewbox 5900 EU');
    // enregistrée en base puis relue (aller-retour serveur)
    const payload = toPayload(memorized);
    const row: ServerLibraryRow = {
      id: 'r1',
      kind: payload.kind,
      key: payload.key,
      name: payload.name,
      data: payload.data,
      source: payload.source,
      keyStructRef: payload.match.structRef ?? null,
      keyArticle: payload.match.articleRef ?? null,
      keyDefinition: payload.match.definition ?? null,
      keyFingerprint: payload.match.fingerprint ?? null,
      keyModuleType: payload.match.moduleType ?? null,
      disabled: false,
      confirmedBy: 'u1',
      confirmedAt: null,
    };
    const lib = mergeLibrary(SEED, [row]);
    // 2ᵉ modèle : autre nom de composant, autre nombre de Viewbox
    const second = run(model(4, 'VBX 5900 client X'), lib);
    const mods = second.types.filter((t) => t.kind === 'module');
    expect(mods).toHaveLength(1);
    expect(mods[0].status).toBe('known');
    expect(mods[0].source).toBe('library');
    expect(second.types.filter((t) => t.kind === 'module' && t.status !== 'known')).toHaveLength(0);
  });

  it('réponse locale : prioritaire, « ignorer » passe en gris', () => {
    const idx = model(2, 'VBX');
    const first = run(idx);
    const unk = first.types.find((t) => t.status === 'unknown')!;
    const r = run(idx, SEED, { [unk.key]: { assignment: { role: 'ignored', nature: 'decor' }, scope: 'model', at: '' } });
    expect(r.types.find((t) => t.key === unk.key)!.status).toBe('ignored');
    expect(r.blocking).toBe(0);
  });

  it('pièce porteuse sans section : reste inconnue ; Viewbox 8400 : données inconnues', () => {
    const idx = model(1, 'VBX', [node({ name: 'Poutre IPE', category: 'STRUCTURE', triangles: 50 })]);
    idx.modules.push({ ...idx.modules[0], id: 'VBX-02', nodeId: 'x8400', expected: { label: 'Viewbox 8400', long: 8400, short: 2500, source: 'standard' } });
    idx.nodes.push(node({ id: 'x8400', role: 'module', name: 'VBX-02' }));
    const r = run(idx);
    const beam = r.types.find((t) => t.category === 'STRUCTURE')!;
    expect(beam.status).toBe('unknown');
    expect(beam.reason).toMatch(/section/);
    const big = r.types.find((t) => t.kind === 'module' && t.label === 'Viewbox 8400')!;
    expect(big.status).toBe('unknown');
    expect(big.reason).toMatch(/inconnues/);
  });

  it('empreinte seule (objet renommé) : correspondance probable, à confirmer', () => {
    const idx = model(1, 'VBX');
    const r0 = run(idx);
    const unk = r0.types.find((t) => t.status === 'unknown')!;
    const entry = partTypeEntry(unk, { role: 'ignored', nature: 'decor' }, 'Caisson déco');
    // même géométrie, autre nom, triangles à 3 % près
    const idx2 = model(1, 'VBX');
    const other = idx2.nodes.find((n) => n.name === 'Groupe' && n.role === 'item')!;
    other.name = 'Bloc machin';
    other.triangles = 309;
    delete (entry.match as { definition?: string }).definition;
    const r = run(idx2, [...SEED, entry]);
    const t = r.types.find((x) => x.nodeIds.includes(other.id))!;
    expect(t.status).toBe('suggested');
    expect(t.source).toBe('fingerprint');
  });

  it('couleurs : Viewbox et pièces de son gabarit de la couleur de la Viewbox', () => {
    const r = run(model(1, 'VBX'));
    const floor = [...r.templateParts.keys()][0];
    const mod = r.types.find((t) => t.kind === 'module')!;
    expect(r.colors.get(floor)).toBe(r.colors.get(mod.nodeIds[0]));
  });
});

describe('bibliothèque en ligne', () => {
  it('une entrée enregistrée remplace celle de la base ; désactivée, elle est ignorée', () => {
    const row = (p: Partial<ServerLibraryRow>): ServerLibraryRow => ({
      id: 'x',
      kind: 'module_type',
      key: 'VIEWBOX-8400-EU',
      name: 'Viewbox 8400 (données reçues)',
      data: { status: 'known', template: 'viewbox-eu', nominal: { long: 8400, short: 2500, height: 3080 } },
      source: 'user',
      keyStructRef: null,
      keyArticle: null,
      keyDefinition: null,
      keyFingerprint: null,
      keyModuleType: null,
      disabled: false,
      confirmedBy: null,
      confirmedAt: null,
      ...p,
    });
    const lib = mergeLibrary(SEED, [row({})]);
    const e = lib.find((x) => x.key === 'VIEWBOX-8400-EU')!;
    expect(e.name).toBe('Viewbox 8400 (données reçues)');
    expect(e.status).toBe('known');
    expect(e.origin).toBe('override');
    expect(lib.filter((x) => x.key === 'VIEWBOX-8400-EU')).toHaveLength(1);
    expect(fromServer(row({ key: 'PT-1', kind: 'part_type' }), new Set()).origin).toBe('user');
    const disabled = mergeLibrary(SEED, [row({ disabled: true })]);
    expect(disabled.find((x) => x.key === 'VIEWBOX-8400-EU')!.disabled).toBe(true);
  });
});
