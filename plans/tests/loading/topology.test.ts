// Topologie : jonctions grand / petit côté, décalées, empilage, îlots, pieds fusionnés, façades, produits (miroirs),
// sur des installations synthétiques puis sur les 3 chantiers de référence (si présents dans reference-reports/loading).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { NodeInfo, SceneIndex } from '../../src/core/types';
import type { ModuleFrame, Vec3 } from '../../src/core/views';
import { makeModuleFrame } from '../../src/core/views';
import { applyOverrides, buildTopology, topologySummary } from '../../src/loading/topology/build';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';
import { productSignature } from '../../src/loading/topology/products';

const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));

/** Box 5900 × 2500 posée à (x, z) monde, grand côté le long de x (ou de z si turned), au niveau y. */
function box(id: string, x: number, z: number, opts: { y?: number; level?: number; turned?: boolean } = {}) {
  const y = opts.y ?? 0;
  const axes = opts.turned
    ? { xAxis: [0, 0, 1] as Vec3, yAxis: [1, 0, 0] as Vec3, up: [0, 1, 0] as Vec3, origin: [x, y, z] as Vec3 }
    : { xAxis: [1, 0, 0] as Vec3, yAxis: [0, 0, 1] as Vec3, up: [0, 1, 0] as Vec3, origin: [x, y, z] as Vec3 };
  return { id, level: opts.level ?? 0, frame: makeModuleFrame(id, axes, [0, 0, 0], [5900, 2500, 3080]) };
}

let seq = 0;
function item(moduleId: string | null, articleRef: string | undefined, category: string | null, bbox: [number, number, number, number, number, number], name = articleRef ?? 'Objet'): NodeInfo {
  return {
    id: `n${++seq}`,
    name,
    parentId: null,
    kind: 'group',
    role: 'item',
    category,
    categorySource: 'manifest',
    moduleId,
    assignment: moduleId ? 'hierarchy' : null,
    level: 0,
    bboxMm: bbox,
    triangles: 100,
    articleRef,
  };
}

function scene(boxes: ReturnType<typeof box>[], extra: NodeInfo[] = []) {
  const frames = new Map<string, ModuleFrame>(boxes.map((b) => [b.id, b.frame]));
  const nodes = [...boxes.map((b) => item(b.id, '7-962-016', 'STRUCTURE', [0, 0, 0, 1, 1, 1])), ...extra];
  const index = {
    modules: boxes.map((b) => ({ id: b.id, nodeId: b.id, name: b.id, level: b.level, planDimsMm: [5900, 2500], heightMm: 3080, expected: { label: 'Viewbox 5900', long: 5900, short: 2500, source: 'standard' }, dimsOk: true, bboxMm: [0, 0, 0, 0, 0, 0], itemIds: [], detectedBy: 'name' })),
    nodes,
    levels: [],
  } as unknown as SceneIndex;
  return { index, frames };
}

describe('jonctions, îlots, pieds', () => {
  it('box seule : standalone, 6 pieds, 4 côtés extérieurs', () => {
    const t = buildTopology({ ...scene([box('VBX-01', 0, 0)]), catalogue: cat });
    expect(t.islands).toEqual([expect.objectContaining({ regime: 'standalone', covered: false })]);
    expect(t.counts.pied?.value).toBe(6);
    expect(t.counts.cote?.value).toBe(4);
    expect(t.counts.jonction_box?.value).toBe(0);
  });
  it('deux box par les grands côtés : 1 jonction grand côté, toit jointif, 9 pieds', () => {
    const t = buildTopology({ ...scene([box('VBX-01', 0, 0), box('VBX-02', 0, 2520)]), catalogue: cat });
    expect(t.junctions).toHaveLength(1);
    expect(t.junctions[0]).toMatchObject({ kind: 'grand_cote', gap: 20, roof: true, offset: false });
    expect(t.counts.jonction_toit_grand_cote?.value).toBe(1);
    expect(t.counts.pied?.value).toBe(9);
    expect(t.counts.cote?.value).toBe(6);
    expect(t.islands).toEqual([expect.objectContaining({ regime: 'connecte', covered: true, moduleIds: ['VBX-01', 'VBX-02'] })]);
  });
  it('deux box bout à bout : jonction petit côté, 10 pieds', () => {
    const t = buildTopology({ ...scene([box('VBX-01', 0, 0), box('VBX-02', 5900, 0)]), catalogue: cat });
    expect(t.junctions.map((j) => j.kind)).toEqual(['petit_cote']);
    expect(t.counts.jonction_petit_cote?.value).toBe(1);
    expect(t.counts.pied?.value).toBe(10);
  });
  it('jeu > 50 mm : pas de jonction, 2 îlots', () => {
    const t = buildTopology({ ...scene([box('VBX-01', 0, 0), box('VBX-02', 0, 2560)]), catalogue: cat });
    expect(t.junctions).toHaveLength(0);
    expect(t.islands).toHaveLength(2);
  });
  it('box décalée : jonction signalée', () => {
    const t = buildTopology({ ...scene([box('VBX-01', 0, 0), box('VBX-02', 2950, 2500)]), catalogue: cat });
    expect(t.junctions[0]).toMatchObject({ kind: 'grand_cote', offset: true });
    expect(t.warnings.map((w) => w.code)).toContain('JUNCTION_OFFSET');
  });
  it('box tournée contre un grand côté : jonction grand / petit côté', () => {
    const t = buildTopology({ ...scene([box('VBX-01', 0, 0), box('VBX-02', 0, 2500, { turned: true })]), catalogue: cat });
    expect(t.junctions.map((j) => j.kind)).toEqual(['mixte']);
  });
  it('box empilée : même îlot, pas de pieds en haut, toits jointifs seulement en haut', () => {
    const t = buildTopology({
      ...scene([box('VBX-01', 0, 0), box('VBX-02', 0, 2500), box('VBX-03', 0, 0, { y: 3080, level: 1 })]),
      catalogue: cat,
    });
    expect(t.islands).toHaveLength(1);
    expect(t.modules.find((m) => m.id === 'VBX-03')?.below).toEqual(['VBX-01']);
    expect(t.counts.pied?.value).toBe(9);
    expect(t.junctions[0].roof).toBe(false);
    expect(t.levels).toBe(2);
    expect(t.warnings.map((w) => w.code)).toContain('MULTI_LEVEL');
  });
  it('valeurs saisies à la main', () => {
    const t = buildTopology({ ...scene([box('VBX-01', 0, 0)]), catalogue: cat, overrides: { pied: 8 } });
    expect(t.counts.pied).toMatchObject({ value: 8, manual: true, detected: 6 });
    expect(applyOverrides(t.counts, {}).pied?.value).toBe(8);
  });
});

describe('façades et produits', () => {
  // grand côté y = 0 (−y) : vitre, vitre, porte simple, mur, mur ; petit côté +x : 2 vitres
  const glass = (x0: number) => item('VBX-01', '7-637-009', 'VITRE-SEAMLESS', [x0, 0, -20, x0 + 1130, 2500, 20]);
  const els = [
    glass(130),
    glass(1260),
    item('VBX-01', '7-199-067', 'PORTE-SIMPLE', [2390, 0, -20, 3520, 2500, 20]),
    item('VBX-01', '7-636-008', 'MUR-LEGER', [3520, 0, -20, 4650, 2500, 20]),
    item('VBX-01', '7-636-008', 'MUR-LEGER', [4650, 0, -20, 5780, 2500, 20]),
    item('VBX-01', '7-637-009', 'VITRE-SEAMLESS', [5880, 0, 130, 5920, 2500, 1260]),
    item('VBX-01', '7-637-009', 'VITRE-SEAMLESS', [5880, 0, 1260, 5920, 2500, 2390]),
  ];
  const mirror = item('VBX-01', '7-637-009', 'VITRE-SEAMLESS', [130, 0, -20, 1260, 2500, 20], '7-637-009_1');
  const unknown = item('VBX-01', undefined, 'PORTE-COULISSANTE', [100, 0, 2480, 5800, 2500, 2520], 'full slidding door');
  const t = buildTopology({ ...scene([box('VBX-01', 0, 0)], [...els, mirror, unknown]), catalogue: cat });
  it('éléments rangés le long des côtés', () => {
    const long = t.sides.find((s) => s.id === 'VBX-01:-y')!;
    expect(long.elements.map((e) => e.kind)).toEqual(['vitre', 'vitre', 'porte', 'mur', 'mur']);
    expect(long.sequence.filter((q) => q.type === 'vide')).toHaveLength(0);
    expect(t.sides.find((s) => s.id === 'VBX-01:+x')!.elements).toHaveLength(2);
  });
  it('jonctions avec / sans vitre, terminaisons, côtés vitrés', () => {
    // −y : v|v, v|p (avec vitre), p|m, m|m (sans vitre) ; +x : v|v
    expect(t.counts.jonction_verre?.value).toBe(3);
    expect(t.counts.jonction_panneau?.value).toBe(2);
    // −y : début de la 1re vitre ; +x : début et fin (la vitre contre la porte ne compte pas)
    expect(t.counts.terminaison_vitre?.value).toBe(3);
    expect(t.counts.cote_vitre_long?.value).toBe(1);
    expect(t.counts.cote_vitre_court?.value).toBe(1);
    expect(t.counts.porte_simple?.value).toBe(1);
    expect(t.counts.porte_coulissante?.value).toBe(1);
    expect(t.counts.panneau_plein?.value).toBe(2);
  });
  it('miroir écarté, pièce sans référence à identifier puis reconnue', () => {
    expect(t.products.find((l) => l.article === '7-637-009')).toMatchObject({ qty: 4, mirrorIds: [mirror.id] });
    expect(t.unknown.map((u) => u.label)).toEqual(['FULL SLIDDING DOOR']);
    const sig = productSignature(unknown);
    const answered = buildTopology({ ...scene([box('VBX-01', 0, 0)], [...els, mirror, unknown]), catalogue: cat, answers: { [sig]: '7-625-020' } });
    expect(answered.unknown).toHaveLength(0);
    expect(answered.products.find((l) => l.article === '7-625-020')).toMatchObject({ qty: 1, source: 'reponse' });
    const remembered = buildTopology({ ...scene([box('VBX-01', 0, 0)], [...els, mirror, unknown]), catalogue: cat, memory: { [sig]: '7-625-020' } });
    expect(remembered.products.find((l) => l.article === '7-625-020')?.source).toBe('memoire');
    expect(remembered.counts.porte_coulissante?.value).toBe(1);
  });
  it('pièces de la box sans référence : livrées avec la box, ni produit ni « à identifier »', () => {
    const part = { ...item('VBX-01', undefined, 'STRUCTURE', [0, 0, 0, 5900, 3080, 2500], 'Structure cadre'), assignment: 'hierarchy' as const };
    const feet = { ...item('VBX-01', undefined, 'PIED', [0, -100, 0, 200, 0, 200], 'Pied'), assignment: 'hierarchy' as const };
    const t2 = buildTopology({ ...scene([box('VBX-01', 0, 0)], [part, feet]), catalogue: cat });
    expect(t2.unknown).toHaveLength(0);
    expect(t2.products.map((l) => l.article)).toEqual(['7-962-016']);
  });
  it('phrase de synthèse', () => {
    expect(topologySummary(t, cat)).toBe('1 Viewbox · 1 niveau · 1 îlot · standalone (aucune jonction) · 6 pieds · 1 porte simple · 1 porte coulissante · vitrage 10 mm (4 vitres) · couvert : non');
  });
});

const DIR = join(__dirname, '..', '..', 'reference-reports', 'loading');
const real = (name: string) => (existsSync(DIR) ? readdirSync(DIR).find((f) => f.includes(name)) : undefined);

describe.skipIf(!real('6059') || !real('6060') || !real('Klokgebouw'))('chantiers de référence', async () => {
  const { ingest } = await import('../../src/ingest/pipeline');
  const { inlineRunner } = await import('../../src/ingest/cleanup');
  const { exportPackage, loadPackage } = await import('../../src/ingest/package');
  const { DEFAULT_RULES } = await import('../../src/core/classification');
  const { makeLoadedScene } = await import('../../src/scene/loadedScene');
  const load = async (name: string) => {
    const f = real(name)!;
    const buf = readFileSync(join(DIR, f));
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const res = await ingest({ fileName: f, data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const s = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
    return buildTopology({ index: s.index, frames: s.frames, catalogue: cat });
  };
  const qty = (t: Awaited<ReturnType<typeof load>>, a: string) => t.products.find((l) => l.article === a)?.qty;

  it('Klokgebouw 6055RKLOKVIE : 2 box standalone, 2 îlots, 12 pieds, 16 vitres 8.8.2, 14 panneaux / box', async () => {
    const t = await load('Klokgebouw');
    expect(t.islands.map((i) => i.regime)).toEqual(['standalone', 'standalone']);
    expect(t.counts.pied?.value).toBe(12);
    expect(t.counts.panneau?.value).toBe(28);
    expect(t.glazing).toEqual(['8.8.2']);
    expect([qty(t, '7-637-020'), qty(t, '7-636-008'), qty(t, '7-199-067'), qty(t, '7-962-016')]).toEqual([16, 10, 2, 2]);
    // classeur : plexi 18 mm 6 / box (4 grand côté + 2 petits), joint carrosserie 4 jonctions / box
    expect(t.counts.jonction_verre?.value).toBe(12);
    expect(t.counts.jonction_panneau?.value).toBe(8);
    expect(t.counts.cote?.value).toBe(8);
  }, 120000);

  it('6059RFRAMVIE : 4 box connectées et couvertes, 3 jonctions grand côté, 13 vitres, 11 murs, 1 porte double', async () => {
    const t = await load('6059');
    expect(t.islands).toEqual([expect.objectContaining({ regime: 'connecte', covered: true })]);
    expect(t.counts.jonction_grand_cote?.value).toBe(3);
    expect(t.counts.jonction_toit_grand_cote?.value).toBe(3);
    // 4 box côte à côte × 6 pieds, pieds communs fusionnés = 15 (Amaury 12.10.2026 : on garde 15, le « 10 » du classeur n'est pas une règle)
    expect(t.counts.pied?.value).toBe(15);
    expect([qty(t, '7-637-020'), qty(t, '7-636-008'), qty(t, '7-199-066'), qty(t, '7-962-016')]).toEqual([13, 11, 1, 4]);
  }, 120000);

  it('6060RIAAHVIE : 2 îlots de 2 box, 9 pieds par paire, vitrage 10 mm (5 jonctions avec vitre, 6 terminaisons), porte coulissante à identifier', async () => {
    const t = await load('6060');
    expect(t.islands.map((i) => i.moduleIds.length)).toEqual([2, 2]);
    expect(Object.values(t.islandCounts).map((c) => c.pied?.value)).toEqual([9, 9]);
    expect(t.glazing).toEqual(['10mm']);
    expect(t.counts.jonction_verre?.value).toBe(5);
    expect(t.counts.terminaison_vitre?.value).toBe(6);
    expect(t.counts.cote_vitre_court?.value).toBe(2);
    expect(t.counts.cote_vitre_long?.value).toBe(1);
    expect(t.counts.porte_coulissante?.value).toBe(1);
    expect(t.unknown.map((u) => u.label)).toEqual(['FULL SLIDDING DOOR 5700MM']);
  }, 120000);
});
