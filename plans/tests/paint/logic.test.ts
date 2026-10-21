// Peinture : logique pure (faces, côtés, surfaces, zones → pièces, opérations, lecture tolérante, RAL, contours).
import { describe, expect, it } from 'vitest';
import { CylinderGeometry, ExtrudeGeometry, Path, Shape } from 'three';
import type { BufferGeometry } from 'three';
import type { TriSoup } from '../../src/core/paint/region';
import { faceSelector, outlineLoops, poleOfInaccessibility, selectTriangles, trianglesArea, loopArea } from '../../src/core/paint/region';
import { applyOps, cleanPaint, colorCode, inverseOps, luminance, mixWhite, nextTag, reassignOps } from '../../src/core/paint/ops';
import { countTargets, paintContext, resolvePaint } from '../../src/core/paint/resolve';
import { searchRal, RAL_BY_CODE, RAL_CLASSIC } from '../../src/core/paint/ral';
import type { PaintColor, PaintSettings, PaintZone, Vec3 } from '../../src/core/paint/types';
import type { SceneIndex } from '../../src/core/types';

const soupOf = (g: BufferGeometry): TriSoup => {
  const pos = Float64Array.from(g.attributes.position.array as ArrayLike<number>);
  const index = g.index ? Uint32Array.from(g.index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
  return { pos, index };
};

/** cube 0..s, 12 triangles (2 par face, sens trigonométrique vu de l'extérieur) */
function cube(s = 1000): TriSoup {
  const v: Vec3[] = [
    [0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0],
    [0, 0, s], [s, 0, s], [s, s, s], [0, s, s],
  ];
  const quads = [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3],
  ];
  const idx: number[] = [];
  for (const [a, b, c, d] of quads) idx.push(a, b, c, a, c, d);
  return { pos: Float64Array.from(v.flat()), index: Uint32Array.from(idx) };
}

/** tube RHS 120 × 60 × 4, 1 000 mm de long (axe z) */
function rhs(): TriSoup {
  const outer = new Shape().moveTo(-60, -30).lineTo(60, -30).lineTo(60, 30).lineTo(-60, 30).lineTo(-60, -30);
  outer.holes.push(new Path().moveTo(-56, -26).lineTo(-56, 26).lineTo(56, 26).lineTo(56, -26).lineTo(-56, -26));
  return soupOf(new ExtrudeGeometry(outer, { depth: 1000, bevelEnabled: false }));
}

describe('peinture : faces', () => {
  it('cube : une face = 2 triangles, 1 m²', () => {
    const s = cube();
    const sel = faceSelector(s, [500, 500, 1000], 30)!;
    expect(sel.normal).toEqual([0, 0, 1]);
    expect(sel.d).toBe(1000);
    const tris = selectTriangles(s, 'face', sel)!;
    expect(tris.length).toBe(2);
    expect(trianglesArea(s, tris) / 1e6).toBeCloseTo(1, 6);
    expect(selectTriangles(s, 'node')!.length).toBe(12);
  });

  it('tube RHS 120 × 60 × 4 : la face extérieure seule, pas l’intérieur du tube', () => {
    const s = rhs();
    const sel = faceSelector(s, [0, 30, 500], 30)!;
    expect(sel.normal.map(Math.round)).toEqual([0, 1, 0]);
    const tris = selectTriangles(s, 'face', sel)!;
    // 120 × 1 000 mm = 0,12 m²
    expect(trianglesArea(s, tris) / 1e6).toBeCloseTo(0.12, 4);
    for (const t of tris) for (let k = 0; k < 3; k++) expect(s.pos[s.index[t * 3 + k] * 3 + 1]).toBeCloseTo(30, 6);
    // la face intérieure (y = 26) a la même normale : « côté » la prend, « face » non
    const side = selectTriangles(s, 'side', sel)!;
    expect(trianglesArea(s, side) / 1e6).toBeCloseTo(0.12 + 0.112, 4);
  });

  it('tube rond (facettes adoucies) : toute la surface lisse', () => {
    const s = soupOf(new CylinderGeometry(50, 50, 1000, 32, 1, true));
    const sel = faceSelector(s, [50, 0, 0], 30)!;
    const tris = selectTriangles(s, 'face', sel)!;
    expect(tris.length).toBe(64);
    // π × 100 × 1 000 ≈ 0,314 m² (polygone à 32 côtés : 0,3136)
    expect(trianglesArea(s, tris) / 1e6).toBeCloseTo(0.3136, 3);
    // pli plus serré que les facettes : une seule bande
    expect(selectTriangles(s, 'face', { ...sel, creaseDeg: 5 })!.length).toBeLessThan(4);
  });

  it('point cliqué perdu (pièce modifiée) : zone sans effet', () => {
    const s = cube();
    const sel = faceSelector(s, [500, 500, 1000], 30)!;
    expect(selectTriangles(s, 'face', { ...sel, seed: [500, 500, 1100] })).toBeNull();
  });
});

describe('peinture : contours et repère', () => {
  it('deux triangles d’un carré → un contour de 4 sommets, point intérieur au centre', () => {
    const loops = outlineLoops(Float64Array.from([0, 0, 100, 0, 100, 100, 0, 0, 100, 100, 0, 100]));
    expect(loops.length).toBe(1);
    expect(loops[0].length).toBe(8);
    expect(Math.abs(loopArea(loops[0]))).toBeCloseTo(10000);
    const p = poleOfInaccessibility(loops, 0.5);
    expect(p.x).toBeCloseTo(50, 0);
    expect(p.y).toBeCloseTo(50, 0);
  });
  it('anneau : un contour extérieur et un trou, pas de point répété', () => {
    // carré 0..30 moins le carré 10..20, 8 triangles
    const q = (a: number[], b: number[], c: number[], d: number[]) => [...a, ...b, ...c, ...a, ...c, ...d];
    const tris = [
      ...q([0, 0], [30, 0], [30, 10], [0, 10]),
      ...q([0, 20], [30, 20], [30, 30], [0, 30]),
      ...q([0, 10], [10, 10], [10, 20], [0, 20]),
      ...q([20, 10], [30, 10], [30, 20], [20, 20]),
    ];
    const loops = outlineLoops(Float64Array.from(tris));
    expect(loops.length).toBe(2);
    const areas = loops.map(loopArea).sort((a, b) => a - b);
    expect(areas[0]).toBeCloseTo(-100); // trou dans l'autre sens
    expect(areas[1]).toBeCloseTo(900);
    for (const l of loops) {
      const keys = new Set<string>();
      for (let i = 0; i < l.length; i += 2) keys.add(`${l[i]},${l[i + 1]}`);
      expect(keys.size).toBe(l.length / 2);
    }
    const p = poleOfInaccessibility(loops, 0.2);
    expect(p.d).toBeGreaterThan(4); // dans l'anneau, à ~5 mm des bords
  });
});

// index de scène minimal : 6 Viewbox de la même définition, chacune avec un poteau d'angle au même chemin
function sixBoxes(): SceneIndex {
  const nodes: SceneIndex['nodes'] = [];
  const modules: SceneIndex['modules'] = [];
  const node = (id: string, parentId: string | null, name: string, kind: 'group' | 'mesh', moduleId: string | null, definition?: string) =>
    nodes.push({ id, name, definition, parentId, kind, role: 'item', category: null, categorySource: null, moduleId, assignment: moduleId ? 'hierarchy' : null, level: 0, bboxMm: null, triangles: kind === 'mesh' ? 12 : 0 } as SceneIndex['nodes'][number]);
  for (let i = 1; i <= 6; i++) {
    const m = `VBX-0${i}`;
    node(`m${i}`, null, `box${i}`, 'group', m, 'VIEWBOX M16');
    node(`s${i}`, `m${i}`, 'struct', 'group', m, 'STRUCT');
    node(`p${i}`, `s${i}`, 'poteau', 'mesh', m, 'POTEAU');
    node(`q${i}`, `s${i}`, 'poteau', 'mesh', m, 'POTEAU');
    modules.push({ id: m, nodeId: `m${i}`, name: m, itemIds: [] } as unknown as SceneIndex['modules'][number]);
  }
  return { nodes, modules, commonIds: [], contextIds: [] } as unknown as SceneIndex;
}

const color = (id: string, tag: string, code = '9005'): PaintColor => ({ id, tag, name: `RAL ${code}`, system: 'RAL', code, hex: RAL_BY_CODE.get(code)?.hex ?? '#000000', createdAt: '' });
const face = { normal: [0, 0, 1] as Vec3, d: 1000, seed: [500, 500, 1000] as Vec3, creaseDeg: 30 };
const zone = (id: string, colorId: string, match: PaintZone['target']['match'], scope: PaintZone['target']['scope'] = 'face'): PaintZone => ({
  id, colorId, target: { scope, match, ...(scope === 'node' ? {} : { face }) }, label: id, source: 'click', createdAt: '',
});

describe('peinture : zones → pièces', () => {
  const ctx = paintContext(sixBoxes());
  it('même face dans toutes les Viewbox identiques (chemin), ou cette Viewbox seulement', () => {
    const path = ctx.paths.pathOf('p3')!;
    expect(path).toBe('STRUCT#0/POTEAU#0');
    expect(ctx.paths.pathOf('q3')).toBe('STRUCT#0/POTEAU#1');
    const all = zone('z1', 'c1', { modulePaths: [path] });
    expect(countTargets(ctx, all.target)).toBe(6);
    const one = zone('z2', 'c2', { modulePaths: [path], moduleIds: ['VBX-03'] });
    expect(countTargets(ctx, one.target)).toBe(1);
    const p: PaintSettings = { v: 1, colors: [color('c1', 'P1'), color('c2', 'P2', '7016')], zones: [all, one], updatedAt: '' };
    const r = resolvePaint(ctx, p);
    expect([...r.keys()].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    // VBX-03 : les deux zones, la dernière gagne (repeinte)
    expect(r.get('p3')!.map((x) => x.colorId)).toEqual(['c1', 'c2']);
  });
  it('pièce entière (groupe) → ses maillages ; toutes les pièces du type', () => {
    const r = resolvePaint(ctx, { v: 1, colors: [color('c1', 'P1')], zones: [zone('z', 'c1', { nodeIds: ['s2'] }, 'node')], updatedAt: '' });
    expect([...r.keys()].sort()).toEqual(['p2', 'q2']);
    expect(countTargets(ctx, zone('t', 'c1', { definitions: ['POTEAU'] }).target)).toBe(12);
  });
});

describe('peinture : opérations', () => {
  const base: PaintSettings = { v: 1, colors: [color('c1', 'P1')], zones: [zone('z1', 'c1', { nodeIds: ['p1'] })], updatedAt: '' };
  it('inverse = état exact d’avant', () => {
    const ops = [
      { op: 'color.put' as const, color: color('c2', 'P2', '7016') },
      { op: 'zone.put' as const, zone: zone('z2', 'c2', { nodeIds: ['p2'] }) },
      { op: 'zone.put' as const, zone: { ...zone('z1', 'c2', { nodeIds: ['p1'] }) } },
      { op: 'color.del' as const, id: 'c1' },
    ];
    const after = applyOps(base, ops);
    expect(after.colors.map((c) => c.id)).toEqual(['c2']);
    expect(after.zones.map((z) => z.id)).toEqual(['z1', 'z2']);
    const back = applyOps(after, inverseOps(base, ops));
    expect(back.colors).toEqual(base.colors);
    expect(back.zones.map((z) => [z.id, z.colorId])).toEqual([['z1', 'c1']]);
  });
  it('supprimer une couleur emporte ses zones ; l’inverse les remet', () => {
    const ops = [{ op: 'color.del' as const, id: 'c1' }];
    const after = applyOps(base, ops);
    expect(after.zones).toEqual([]);
    expect(applyOps(after, inverseOps(base, ops))).toEqual(base);
  });
  it('deux personnes en même temps : fusion par id, rien n’est perdu', () => {
    const a = [{ op: 'zone.put' as const, zone: zone('za', 'c1', { nodeIds: ['p2'] }) }];
    const b = [{ op: 'zone.put' as const, zone: zone('zb', 'c1', { nodeIds: ['p3'] }) }];
    const server = applyOps(applyOps(base, a), b);
    expect(server.zones.map((z) => z.id)).toEqual(['z1', 'za', 'zb']);
  });
  it('remplacer une couleur partout, repères, codes, luminance', () => {
    const p = applyOps(base, [{ op: 'color.put', color: color('c2', 'P2', '7016') }]);
    const r = applyOps(p, reassignOps(p, 'c1', 'c2'));
    expect(r.zones.every((z) => z.colorId === 'c2')).toBe(true);
    expect(nextTag([color('a', 'P1'), color('b', 'P4')])).toBe('P5');
    expect(colorCode({ system: 'RAL', code: '9005' })).toBe('RAL 9005');
    expect(luminance('#0E0E10')).toBeLessThan(0.2);
    expect(luminance('#F1ECE1')).toBeGreaterThan(0.8);
    expect(mixWhite('#000000', 0.5)).toBe('#808080');
  });
  it('lecture tolérante : champ inconnu, entrées invalides, ancien JSON', () => {
    expect(cleanPaint(undefined)).toEqual({ v: 1, colors: [], zones: [], updatedAt: '' });
    const p = cleanPaint({
      v: 1,
      truc: 3,
      colors: [{ ...color('c1', 'P1'), extra: 1 }, { id: 'x' }],
      zones: [zone('z1', 'c1', { nodeIds: ['p1'] }), zone('z2', 'inconnue', { nodeIds: ['p1'] }), { id: 'z3' }],
    });
    expect(p.colors.length).toBe(1);
    expect(p.colors[0]).not.toHaveProperty('extra');
    expect(p.zones.map((z) => z.id)).toEqual(['z1']);
  });
});

describe('RAL classic', () => {
  it('par code et par nom FR / EN / DE', () => {
    expect(RAL_CLASSIC.length).toBeGreaterThan(200);
    expect(new Set(RAL_CLASSIC.map((c) => c.code)).size).toBe(RAL_CLASSIC.length);
    expect(searchRal('9005')[0].code).toBe('9005');
    expect(searchRal('RAL 7016')[0].code).toBe('7016');
    expect(searchRal('noir foncé')[0].code).toBe('9005');
    expect(searchRal('jet black')[0].code).toBe('9005');
    expect(searchRal('Tiefschwarz')[0].code).toBe('9005');
    expect(searchRal('anthrazit')[0].code).toBe('7016');
    expect(searchRal('gris fenetre')[0].code).toBe('7040');
  });
});
