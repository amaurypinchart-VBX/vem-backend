// VS3 — moteur de coupe : solides coupés bouchés, trait de coupe, remplissages / hachures, maillages ouverts,
// coupe pile sur une face, fantômes, profondeur de vue. Paquets construits à la main (pas de navigateur).
import { describe, expect, it } from 'vitest';
import { ExtrudeGeometry, Shape } from 'three';
import type { Vec3, ViewBasis } from '../../src/core/views';
import { viewBasis } from '../../src/core/views';
import type { HlrPacket } from '../../src/linework/hlr';
import { computeView } from '../../src/linework/hlr';
import type { CustomJob } from '../../src/linework/customJob';
import { FILL_GREY, MATERIAL, computeCustomView } from '../../src/linework/customJob';
import { clipPacket } from '../../src/linework/clip';
import { chainSegments, loopsToPolygons, sliceTriangles } from '../../src/linework/section';
import { hatchRings, pointInRing, ringArea } from '../../src/linework/hatch';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';
import type { Linework2D } from '../../src/linework/types';
import { lineworkToSvg } from '../../src/linework/svg';

/** Boîte fermée, faces vers l'extérieur (soupe de triangles). */
function box(a: Vec3, b: Vec3): number[] {
  const c = (i: number): Vec3 => [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]];
  // quads (sens trigonométrique vu de l'extérieur)
  const quads = [
    [0, 2, 3, 1], // z = a (normale −Z)
    [4, 5, 7, 6], // z = b
    [0, 1, 5, 4], // y = a
    [2, 6, 7, 3], // y = b
    [0, 4, 6, 2], // x = a
    [1, 3, 7, 5], // x = b
  ];
  const out: number[] = [];
  for (const [p, q, r, s] of quads) out.push(...c(p), ...c(q), ...c(r), ...c(p), ...c(r), ...c(s));
  return out;
}

/** Tube rectangulaire fermé (parois + extrémités annulaires), axe Y, de y0 à y1. */
function tube(w: number, h: number, t: number, y0: number, y1: number): number[] {
  const shape = new Shape();
  shape.moveTo(0, 0).lineTo(w, 0).lineTo(w, h).lineTo(0, h).lineTo(0, 0);
  const hole = new Shape();
  hole.moveTo(t, t).lineTo(t, h - t).lineTo(w - t, h - t).lineTo(w - t, t).lineTo(t, t);
  shape.holes.push(hole);
  return extrudeY(shape, y0, y1);
}

/** Profil extrudé le long de Y (section dans le plan X / Z). */
function extrudeY(shape: Shape, y0: number, y1: number): number[] {
  const g = new ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  const p = g.attributes.position;
  const out: number[] = [];
  // ExtrudeGeometry extrude le long de +Z : (x, y, z) → (x, z + y0, y) puis triangles retournés pour rester directs
  const idx = g.index ? Array.from(g.index.array) : Array.from({ length: p.count }, (_, i) => i);
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 2], idx[i + 1]];
    for (const k of tri) out.push(p.getX(k), p.getZ(k) + y0, p.getY(k));
  }
  return out;
}

function packetOf(objects: number[][], ids = objects.map((_, i) => `o${i}`)): HlrPacket {
  const pos: number[] = [];
  const vStart: number[] = [];
  const vCount: number[] = [];
  for (const o of objects) {
    vStart.push(pos.length / 3);
    vCount.push(o.length / 3);
    pos.push(...o);
  }
  const n = pos.length / 3;
  const indices: number[] = [];
  objects.forEach((o, k) => {
    for (let i = 0; i < o.length / 3; i++) indices.push(i);
    void k;
  });
  return {
    positions: Float32Array.from(pos),
    indices: Uint32Array.from(indices),
    vertexStart: Uint32Array.from(vStart),
    vertexCount: Uint32Array.from(vCount),
    indexStart: Uint32Array.from(vStart),
    indexCount: Uint32Array.from(vCount),
    glass: new Uint8Array(n / 3),
    sourceIds: ids,
    center: [0, 0, 0],
  };
}

const TOP = viewBasis({ kind: 'top', frame: 'world' });
const FRONT = viewBasis({ kind: 'front', frame: 'world' });

function run(packet: HlrPacket, planes: CustomJob['planeSets'], opts: Partial<CustomJob> & { basis?: ViewBasis; scale?: number } = {}) {
  const n = packet.vertexStart.length;
  return computeCustomView(packet, {
    basis: opts.basis ?? TOP,
    style: { ...DEFAULT_LINE_STYLE, scaleDenominator: opts.scale ?? 50 },
    cacheKey: 't',
    custom: {
      planeSets: planes,
      objectSet: opts.objectSet ?? new Array(n).fill(planes.length ? 0 : -1),
      ghost: opts.ghost ?? new Array(n).fill(0),
      material: opts.material ?? new Array(n).fill(MATERIAL.steel),
      fill: opts.fill ?? 'by-material',
      beyondThin: opts.beyondThin ?? false,
    },
  });
}

const layer = (lw: Linework2D, key: string) => lw.layers.find((l) => l.key === key);
function length(lw: Linework2D, key: string): number {
  let s = 0;
  for (const p of layer(lw, key)?.polylines ?? []) for (let i = 2; i < p.length; i += 2) s += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
  return s;
}
const fillArea = (lw: Linework2D) => (lw.fills ?? []).reduce((a, f) => a + f.rings.reduce((b, r) => b + ringArea(r), 0), 0);

// garder sous le plan y = h : normale −Y, d = −h
const below = (h: number) => ({ n: [0, -1, 0] as Vec3, d: -h, section: true });

describe('sections', () => {
  it('cube coupé : carré bouché, trait de coupe, aplat noir (acier à 1:50), rien de l’intérieur', () => {
    const lw = run(packetOf([box([0, 0, 0], [100, 100, 100])]), [[below(50)]]);
    expect(length(lw, 'cut')).toBeCloseTo(400, 3);
    expect(layer(lw, 'visible')).toBeUndefined();
    expect(layer(lw, 'silhouette')).toBeUndefined();
    expect(lw.fills).toHaveLength(1);
    expect(lw.fills![0].color).toBe('#000');
    expect(Math.abs(fillArea(lw))).toBeCloseTo(10000, 1);
    // à 1:20 l'acier est hachuré, pas plein
    const lw20 = run(packetOf([box([0, 0, 0], [100, 100, 100])]), [[below(50)]], { scale: 20 });
    expect(lw20.fills).toBeUndefined();
    expect(layer(lw20, 'cut-hatch')!.polylines.length).toBeGreaterThan(2);
    const svg = lineworkToSvg(lw, { scale: 50 });
    expect(svg).toContain('data-layer="cut-fill"');
    expect(svg).toContain('data-layer="cut" stroke="#000" stroke-width="0.5"');
  });

  it('tube RHS 120 × 60 × 4 : anneau avec trou (aire 1 376 mm²)', () => {
    const segs = sliceTriangles(tube(120, 60, 4, 0, 1000), { n: [0, 1, 0], d: 500 });
    const loops = chainSegments(segs);
    expect(loops.filter((l) => l.closed)).toHaveLength(2);
    const polys = loopsToPolygons(loops, [0, 1, 0]);
    expect(polys).toHaveLength(1);
    expect(polys[0].rings).toHaveLength(2);
    const lw = run(packetOf([tube(120, 60, 4, 0, 1000)]), [[below(500)]]);
    expect(Math.abs(fillArea(lw))).toBeCloseTo(120 * 60 - 112 * 52, 0);
    expect(lw.fills![0].rings).toHaveLength(2);
    expect(length(lw, 'cut')).toBeCloseTo(2 * (120 + 60) + 2 * (112 + 52), 2);
  });

  it('UPN : polygone en U, 8 sommets, aire exacte', () => {
    const s = new Shape();
    // U 100 × 50, âme 6, ailes 8
    s.moveTo(0, 0).lineTo(50, 0).lineTo(50, 8).lineTo(6, 8).lineTo(6, 92).lineTo(50, 92).lineTo(50, 100).lineTo(0, 100).lineTo(0, 0);
    const loops = chainSegments(sliceTriangles(extrudeY(s, 0, 600), { n: [0, 1, 0], d: 300 }));
    expect(loops).toHaveLength(1);
    expect(loops[0].closed).toBe(true);
    const polys = loopsToPolygons(loops, [0, 1, 0]);
    const lw = run(packetOf([extrudeY(s, 0, 600)]), [[below(300)]]);
    expect(Math.abs(fillArea(lw))).toBeCloseTo(50 * 100 - 44 * 84, 0);
    // contour : chaque face coupée donne des points alignés (diagonale des quads) ; le U garde 8 coins
    const r = polys[0].rings[0];
    const m = r.length / 3;
    let corners = 0;
    for (let i = 0; i < m; i++) {
      const a = (i + m - 1) % m;
      const b = (i + 1) % m;
      const cr = (r[3 * i] - r[3 * a]) * (r[3 * b + 2] - r[3 * i + 2]) - (r[3 * i + 2] - r[3 * a + 2]) * (r[3 * b] - r[3 * i]);
      if (Math.abs(cr) > 1e-6) corners++;
    }
    expect(corners).toBe(8);
  });

  it('coupe pile sur une face : plan décalé de 0,37 mm, pas de trou', () => {
    // plancher posé sur une poutre : face commune à y = 50, coupe en y = 50
    const lw = run(packetOf([box([0, 0, 0], [100, 50, 100]), box([0, 50, 0], [100, 60, 100])]), [[below(50)]]);
    expect(Math.abs(fillArea(lw))).toBeCloseTo(10000, 1);
    expect(length(lw, 'cut')).toBeCloseTo(400, 2);
    const clipped = clipPacket(packetOf([box([0, 0, 0], [100, 50, 100]), box([0, 50, 0], [100, 60, 100])]), {
      planeSets: [[below(50)]],
      objectSet: Int32Array.from([0, 0]),
    });
    expect(clipped.kept).toEqual([0]); // la dalle du dessus est retirée
    expect(clipped.sections[0].plane.d).toBeCloseTo(-49.63, 5);
  });

  it('maillage ouvert : SECTION_OPEN, trait de coupe sans remplissage', () => {
    // trois parois sans épaisseur (pas un solide)
    const walls = [...box([0, 0, 0], [100, 100, 0]).slice(0, 18), ...box([0, 0, 0], [0, 100, 100]).slice(72, 90), ...box([100, 0, 0], [100, 100, 100]).slice(90, 108)];
    const lw = run(packetOf([walls], ['murs']), [[below(50)]]);
    expect(lw.meta.openSections).toEqual(['murs']);
    expect(lw.fills).toBeUndefined();
    expect(length(lw, 'cut')).toBeGreaterThan(250);
  });

  it('le bouchon cache l’intérieur : une pièce dans la boîte coupée n’est pas vue', () => {
    const outer = box([0, 0, 0], [1000, 1000, 1000]);
    const inner = box([400, 100, 400], [600, 300, 600]);
    const lw = run(packetOf([outer, inner], ['boite', 'dedans']), [[below(500)]]);
    for (const l of lw.layers) expect(l.sourceNodeIds).not.toContain('dedans');
    // sans bouchon (vue existante d'un cube ouvert), elle serait visible : contrôle du test
    const open = computeView(packetOf([box([0, 0, 0], [1000, 1000, 1000]).slice(0, 54), inner], ['boite', 'dedans']), { basis: TOP, style: DEFAULT_LINE_STYLE, cacheKey: 'x' });
    expect(open.layers.some((l) => l.sourceNodeIds?.includes('dedans'))).toBe(true);
  });
});

describe('hachures, fantômes, profondeur', () => {
  it('hachures seulement dans le polygone (trou exclu), calées sur l’origine', () => {
    const outer = Float64Array.from([0, 0, 1000, 0, 1000, 1000, 0, 1000]);
    const hole = Float64Array.from([300, 300, 300, 700, 700, 700, 700, 300]);
    const segs = hatchRings([outer, hole], 45, 50);
    expect(segs.length).toBeGreaterThan(20);
    for (const s of segs) {
      const mx = (s[0] + s[2]) / 2;
      const my = (s[1] + s[3]) / 2;
      expect(pointInRing(mx, my, outer)).toBe(true);
      expect(pointInRing(mx, my, hole)).toBe(false);
    }
    // deux carrés voisins : leurs hachures se prolongent (mêmes lignes)
    const a = hatchRings([Float64Array.from([0, 0, 100, 0, 100, 100, 0, 100])], 0, 10).map((s) => s[1]);
    const b = hatchRings([Float64Array.from([100, 0, 200, 0, 200, 100, 100, 100])], 0, 10).map((s) => s[1]);
    expect(b).toEqual(a);
  });

  it('remplissage par style : bois hachuré, verre vide, autres gris ; dessin d’architecte sans aplat', () => {
    const p = () => packetOf([box([0, 0, 0], [100, 100, 100]), box([200, 0, 0], [300, 100, 100]), box([400, 0, 0], [500, 100, 100])]);
    const lw = run(p(), [[below(50)]], { material: [MATERIAL.wood, MATERIAL.glass, MATERIAL.other] });
    expect(lw.fills!.map((f) => f.color)).toEqual([FILL_GREY]);
    expect(layer(lw, 'cut-hatch')!.sourceNodeIds!.every((s) => s === 'o0')).toBe(true);
    const drawing = run(p(), [[below(50)]], { fill: 'drawing', material: [MATERIAL.steel, MATERIAL.glass, MATERIAL.other] });
    expect(drawing.fills).toBeUndefined();
    expect(new Set(layer(drawing, 'cut-hatch')!.sourceNodeIds)).toEqual(new Set(['o0', 'o2']));
    expect(run(p(), [[below(50)]], { fill: 'none' }).layers.some((l) => l.key === 'cut-hatch')).toBe(false);
  });

  it('fantôme : gris, ne cache rien, caché par les éléments visibles', () => {
    // vue de face : un fantôme devant une boîte, une autre boîte devant un fantôme
    const back = box([0, 0, -1000], [1000, 1000, -900]);
    const ghostFront = box([200, 200, 0], [800, 800, 100]);
    const front = box([2000, 0, 0], [3000, 1000, 100]);
    const ghostBack = box([2200, 200, -1000], [2800, 800, -900]);
    const lw = run(packetOf([back, ghostFront, front, ghostBack], ['back', 'gf', 'front', 'gb']), [], { basis: FRONT, ghost: [0, 1, 0, 1], objectSet: [-1, -1, -1, -1] });
    // la boîte derrière le fantôme est entière (rien de caché)
    expect(length(lw, 'silhouette') + length(lw, 'visible')).toBeCloseTo(2 * 4000, 0);
    const ghost = layer(lw, 'ghost')!;
    expect(ghost.sourceNodeIds).toContain('gf');
    expect(ghost.sourceNodeIds).not.toContain('gb'); // caché par la boîte de devant
    expect(lineworkToSvg(lw, { scale: 50 })).toContain('data-layer="ghost" stroke="#b4b4b4"');
  });

  it('profondeur de vue : ce qui est au-delà est retiré (sans bouchon)', () => {
    // coupe horizontale à 500, on regarde vers le bas sur 200 mm
    const near = box([0, 350, 0], [100, 450, 100]);
    const far = box([300, 0, 0], [400, 100, 100]);
    const lw = run(packetOf([near, far], ['près', 'loin']), [[below(500), { n: [0, 1, 0], d: 300, section: false }]]);
    const ids = new Set(lw.layers.flatMap((l) => l.sourceNodeIds ?? []));
    expect(ids.has('près')).toBe(true);
    expect(ids.has('loin')).toBe(false);
  });
});
