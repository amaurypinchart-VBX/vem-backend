// Moteur de vues 2D : repères de vue, nettoyage 2D, retrait des lignes cachées (critères §8.3 sur des cas simples).
import { describe, expect, it } from 'vitest';
import type { ModuleFrame, Vec3 } from '../src/core/views';
import { frameAxesFromMatrix, frontFromNormal, makeModuleFrame, projectPoint, unprojectPoint, viewBasis, viewRows } from '../src/core/views';
import {
  DEFAULT_CLEAN,
  chainPolylines,
  countCollinearOverlaps,
  makeSoup,
  mergeCollinear,
  pushSegment,
  snapPointsOf,
} from '../src/core/lines2d';
import type { HlrPacket } from '../src/linework/hlr';
import { computeView } from '../src/linework/hlr';
import type { LineStyleSpec, Linework2D } from '../src/linework/types';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import { lineworkToSvg } from '../src/linework/svg';
import { Matrix4 } from 'three';

const close = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;
const vclose = (a: Vec3, b: Vec3, eps = 1e-6) => a.every((v, i) => close(v, b[i], eps));

describe('repères de vue', () => {
  it('vues monde = vues standard SketchUp (nord en haut, Avant = regard vers +Y SketchUp)', () => {
    const top = viewBasis({ kind: 'top', frame: 'world' });
    // SketchUp +Y = three −Z : un point au nord est en haut du dessin
    expect(projectPoint(top, [0, 0, -1000]).y).toBeCloseTo(1000);
    expect(projectPoint(top, [1000, 0, 0]).x).toBeCloseTo(1000);
    const front = viewBasis({ kind: 'front', frame: 'world' });
    expect(front.toward).toEqual([0, 0, 1]); // l'observateur est au sud
    expect(projectPoint(front, [0, 3000, 0]).y).toBeCloseTo(3000);
  });

  it('toutes les bases sont orthonormées et directes (droite × haut = vers l’observateur)', () => {
    const frames = new Map<string, ModuleFrame>([['VBX-01', makeModuleFrame('VBX-01', frameAxesFromMatrix(new Matrix4().elements), [0, 0, 0], [5900, 2500, 3000])]]);
    for (const frame of ['world', { moduleId: 'VBX-01' }] as const)
      for (const kind of ['top', 'bottom', 'front', 'back', 'left', 'right'] as const) {
        const b = viewBasis({ kind, frame }, frames);
        const [r, t, z] = viewRows(b);
        const c: Vec3 = [r[1] * b.up[2] - r[2] * b.up[1], r[2] * b.up[0] - r[0] * b.up[2], r[0] * b.up[1] - r[1] * b.up[0]];
        expect(vclose(c, t)).toBe(true);
        expect(vclose(z, [-b.up[0], -b.up[1], -b.up[2]])).toBe(true);
      }
  });

  it('repère d’une Viewbox tournée de 90° : vues relatives identiques à la Viewbox non tournée', () => {
    const rot = new Matrix4().makeRotationY(Math.PI / 2).setPosition(1000, 0, -500);
    const f = makeModuleFrame('M', frameAxesFromMatrix(rot.elements), [0, 0, 0], [5900, 2500, 3000]);
    expect(f.longAxis).toBe('x');
    expect(f.front).toBe('+x');
    const frames = new Map([['M', f]]);
    // un point à l'avant (x local = 5900) apparaît à droite en vue de dessus, au milieu en vue avant
    const pLocal = (x: number, y: number, z: number): Vec3 => {
      const o = f.origin;
      return [o[0] + f.xAxis[0] * x + f.yAxis[0] * y, o[1] + z, o[2] + f.xAxis[2] * x + f.yAxis[2] * y];
    };
    const top = viewBasis({ kind: 'top', frame: { moduleId: 'M' } }, frames);
    const a = projectPoint(top, pLocal(0, 0, 0));
    const b = projectPoint(top, pLocal(5900, 2500, 0));
    expect(b.x - a.x).toBeCloseTo(5900);
    expect(Math.abs(b.y - a.y)).toBeCloseTo(2500);
    const front = viewBasis({ kind: 'front', frame: { moduleId: 'M' } }, frames);
    const c = projectPoint(front, pLocal(5900, 0, 0));
    const d = projectPoint(front, pLocal(5900, 2500, 3000));
    expect(Math.abs(d.x - c.x)).toBeCloseTo(2500); // petit côté
    expect(d.y - c.y).toBeCloseTo(3000);
    // la vue gauche montre le grand côté, avant à droite (même orientation que le dessus)
    const left = viewBasis({ kind: 'left', frame: { moduleId: 'M' } }, frames);
    expect(projectPoint(left, pLocal(5900, 0, 0)).x - projectPoint(left, pLocal(0, 0, 0)).x).toBeCloseTo(5900);
  });

  it('face avant réglable (clic sur une face) et aller-retour 2D ↔ 3D', () => {
    const f = makeModuleFrame('M', frameAxesFromMatrix(new Matrix4().elements), [0, 0, 0], [2500, 5900, 3000]);
    expect(f.longAxis).toBe('y');
    expect(f.front).toBe('+y');
    expect(frontFromNormal(f, [-0.9, 0.1, 0.05])).toBe('-x');
    const b = viewBasis({ kind: 'left', frame: 'world' });
    const p: Vec3 = [123, 456, -789];
    const q = projectPoint(b, p);
    expect(vclose(unprojectPoint(b, q.x, q.y, q.depth), p, 1e-9)).toBe(true);
  });
});

describe('nettoyage 2D', () => {
  it('fusionne les colinéaires qui se chevauchent, le calque prioritaire gagne', () => {
    const s = makeSoup(8);
    pushSegment(s, 0, 0, 100, 0, 2, 1); // visible
    pushSegment(s, 50, 0.01, 150, 0.01, 2, 2); // chevauche (écart < tolérance)
    pushSegment(s, 20, 0, 40, 0, 3, 3); // contour par-dessus
    pushSegment(s, 0, 10, 0.05, 10, 2, 4); // trop court
    const out = mergeCollinear(s);
    const segs = Array.from({ length: out.count }, (_, i) => [...out.coords.slice(i * 4, i * 4 + 4), out.prio[i]]);
    expect(segs.every((g) => Math.abs(g[1]) < 0.06 && Math.abs(g[3]) < 0.06)).toBe(true);
    const total = segs.reduce((a, g) => a + Math.abs(g[2] - g[0]), 0);
    expect(total).toBeCloseTo(150, 1);
    expect(segs.filter((g) => g[4] === 3).length).toBe(1);
    expect(countCollinearOverlaps(out)).toBe(0);
  });

  it('0 chevauchement après nettoyage sur des milliers de morceaux aléatoires', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const s = makeSoup(16);
    for (let i = 0; i < 3000; i++) {
      const line = Math.floor(rnd() * 12);
      const angle = (line * Math.PI) / 12;
      const off = line * 37;
      const a = rnd() * 4000;
      const b = a + rnd() * 800 + 1;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const nx = -dy * off;
      const ny = dx * off;
      const jitter = (rnd() - 0.5) * 0.02;
      pushSegment(s, nx + dx * a, ny + dy * a + jitter, nx + dx * b, ny + dy * b - jitter, Math.floor(rnd() * 3) + 1, i);
    }
    expect(countCollinearOverlaps(s)).toBeGreaterThan(100);
    const out = mergeCollinear(s);
    expect(countCollinearOverlaps(out)).toBe(0);
    expect(out.count).toBeLessThan(s.count / 5);
  });

  it('chaîne en polylignes et donne les points d’accroche', () => {
    const s = makeSoup(4);
    pushSegment(s, 0, 0, 10, 0, 2, 0);
    pushSegment(s, 10, 0, 10, 10, 2, 0);
    pushSegment(s, 10, 10, 0, 10, 2, 0);
    pushSegment(s, 0, 10, 0, 0, 2, 0);
    const pl = chainPolylines(s);
    expect(pl.length).toBe(1);
    expect(pl[0].points.length).toBe(10); // boucle fermée : 5 points
    expect(snapPointsOf(s).length / 2).toBe(8); // 4 coins + 4 milieux
    expect(DEFAULT_CLEAN.grid).toBe(0.05);
  });
});

// ─── retrait des lignes cachées sur des boîtes ───
type Box = { min: Vec3; max: Vec3; glass?: boolean; id?: string };

/** Boîtes fermées (12 triangles, sens trigonométrique vu de l'extérieur, ou retournées), repère monde Y-up. */
function boxPacket(boxes: Box[], inverted = false): HlrPacket {
  const positions: number[] = [];
  const indices: number[] = [];
  const glass: number[] = [];
  const vertexStart: number[] = [];
  const indexStart: number[] = [];
  const faces = [
    [1, 2, 6, 5], [0, 4, 7, 3], [3, 7, 6, 2], [0, 1, 5, 4], [4, 5, 6, 7], [0, 3, 2, 1],
  ];
  for (const b of boxes) {
    vertexStart.push(positions.length / 3);
    indexStart.push(indices.length);
    const [a, c] = [b.min, b.max];
    // sommets : x, y = hauteur, z (repère three)
    const corners: Vec3[] = [
      [a[0], a[1], a[2]], [c[0], a[1], a[2]], [c[0], c[1], a[2]], [a[0], c[1], a[2]],
      [a[0], a[1], c[2]], [c[0], a[1], c[2]], [c[0], c[1], c[2]], [a[0], c[1], c[2]],
    ];
    for (const p of corners) positions.push(...p);
    for (const [i0, i1, i2, i3] of faces) {
      if (inverted) indices.push(i0, i2, i1, i0, i3, i2);
      else indices.push(i0, i1, i2, i0, i2, i3);
      glass.push(b.glass ? 1 : 0, b.glass ? 1 : 0);
    }
  }
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    vertexStart: Uint32Array.from(vertexStart),
    vertexCount: Uint32Array.from(boxes.map(() => 8)),
    indexStart: Uint32Array.from(indexStart),
    indexCount: Uint32Array.from(boxes.map(() => 36)),
    glass: Uint8Array.from(glass),
    sourceIds: boxes.map((b, i) => b.id ?? `box${i}`),
    center: [0, 0, 0],
  };
}

const style = (s: Partial<LineStyleSpec> = {}): LineStyleSpec => ({ ...DEFAULT_LINE_STYLE, fineThresholdPaperMm: 0, detailMinPaperMm: 0, ...s });
const run = (p: HlrPacket, kind: 'top' | 'front' | 'left' | 'right', s?: Partial<LineStyleSpec>) =>
  computeView(p, { basis: viewBasis({ kind, frame: 'world' }), style: style(s), cacheKey: 't' });
const layer = (lw: Linework2D, key: string) => lw.layers.find((l) => l.key === key)?.polylines ?? [];
const totalLength = (pls: Float64Array[]) =>
  pls.reduce((a, pl) => {
    let l = 0;
    for (let i = 2; i < pl.length; i += 2) l += Math.hypot(pl[i] - pl[i - 2], pl[i + 1] - pl[i - 1]);
    return a + l;
  }, 0);
const segmentsOf = (lw: Linework2D) => {
  const s = makeSoup(16);
  for (const l of lw.layers) for (const pl of l.polylines) for (let i = 2; i < pl.length; i += 2) pushSegment(s, pl[i - 2], pl[i - 1], pl[i], pl[i + 1], 0, 0);
  return s;
};

describe('retrait des lignes cachées (three-edge-projection)', () => {
  // Viewbox simplifiée : 5900 × 2500 en plan, 3000 de haut (SketchUp Y = −Z three)
  const module: Box = { min: [0, 0, -2500], max: [5900, 3000, 0] };

  it('dessus d’une boîte : un rectangle 5900 × 2500 ± 1 mm, sans diagonale ni trait en double', () => {
    const lw = run(boxPacket([module]), 'top');
    const b = lw.boundsMm;
    expect(b.maxX - b.minX).toBeCloseTo(5900, 0);
    expect(b.maxY - b.minY).toBeCloseTo(2500, 0);
    // uniquement les 4 côtés (contour), aucune diagonale de triangulation
    expect(totalLength(lw.layers.flatMap((l) => l.polylines))).toBeCloseTo(2 * (5900 + 2500), 0);
    expect(layer(lw, 'silhouette').length).toBeGreaterThan(0);
    expect(layer(lw, 'visible').length).toBe(0);
    expect(countCollinearOverlaps(segmentsOf(lw))).toBe(0);
    expect(lw.meta.provider).toBe('browser-hlr');
  });

  it('un objet caché derrière un autre disparaît ; lignes cachées en option ; visible à travers un vitrage', () => {
    const behind: Box = { min: [1000, 500, -2000], max: [2000, 1500, -1800], id: 'derriere' }; // plus au nord
    const wall: Box = { min: [0, 0, -100], max: [5900, 3000, 0], id: 'mur' }; // mur au sud, devant
    const hiddenRun = run(boxPacket([wall, behind]), 'front');
    expect(totalLength(hiddenRun.layers.flatMap((l) => l.polylines))).toBeCloseTo(2 * (5900 + 3000), 0);
    const withHidden = run(boxPacket([wall, behind]), 'front', { hiddenLines: true });
    expect(totalLength(layer(withHidden, 'hidden'))).toBeCloseTo(2 * (1000 + 1000), 0);
    const glassWall = run(boxPacket([{ ...wall, glass: true }, behind]), 'front');
    const seen = glassWall.layers.flatMap((l) => l.polylines.filter((_, i) => l.sourceNodeIds?.[i] === 'derriere'));
    expect(totalLength(seen)).toBeCloseTo(2 * (1000 + 1000), 0);
    const opaque = run(boxPacket([{ ...wall, glass: true }, behind]), 'front', { glassTransparent: false });
    expect(opaque.layers.flatMap((l) => l.sourceNodeIds ?? []).includes('derriere')).toBe(false);
  });

  it('faces retournées dans SketchUp (solide à l’envers) : même dessin', () => {
    const behind: Box = { min: [1000, 500, -2000], max: [2000, 1500, -1800], id: 'derriere' };
    const wall: Box = { min: [0, 0, -100], max: [5900, 3000, 0], id: 'mur' };
    for (const kind of ['front', 'top', 'right'] as const) {
      const a = run(boxPacket([wall, behind]), kind);
      const b = run(boxPacket([wall, behind], true), kind);
      expect(totalLength(b.layers.flatMap((l) => l.polylines))).toBeCloseTo(totalLength(a.layers.flatMap((l) => l.polylines)), 0);
    }
  });

  it('un petit objet posé devant : ses arêtes sont visibles, en détail fin selon l’échelle', () => {
    const knob: Box = { min: [2900, 1400, 0], max: [2940, 1440, 30], id: 'poignee' };
    const lw = run(boxPacket([module, knob]), 'front', { fineThresholdPaperMm: 1, scaleDenominator: 50 });
    expect(layer(lw, 'fine').length).toBeGreaterThan(0);
    const tiny = run(boxPacket([module, knob]), 'front', { detailMinPaperMm: 1, scaleDenominator: 50 });
    expect(tiny.layers.flatMap((l) => l.sourceNodeIds ?? []).includes('poignee')).toBe(false);
  });

  it('SVG à l’échelle 1:1 : dimensions papier = dimensions réelles', () => {
    const lw = run(boxPacket([module]), 'top');
    const svg = lineworkToSvg(lw, { scale: 1, marginMm: 0 });
    expect(svg).toContain('width="5900mm"');
    expect(svg).toContain('height="2500mm"');
    expect(svg).toContain('stroke-width="0.35"');
    expect(svg).not.toContain('<image');
  });
});
