// Plans de production : lecture d'une pièce (perçages, taraudages, coupes), regroupement, cotes et planches.
import { describe, expect, it } from 'vitest';
import type { V3 } from '../../src/production/analyze';
import { analyzePart, detectHoles, endCuts, holeName, niceDiameter, partKind, threadFor } from '../../src/production/analyze';
import type { PartInfo } from '../../src/production/parts';
import { cleanName, describePart, groupParts, holeAction, holeGroups, partKey } from '../../src/production/parts';
import { holePositions, partViewSpec, partViews, productionSheets } from '../../src/production/sheets';
import { planDimensions } from '../../src/sheets/dimensions';
import { viewBasis } from '../../src/core/views';
import { renumber } from '../../src/sheets/generate';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';

/** Boîte fermée (faces vers l'extérieur), triangles à plat. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const p = (i: number): V3 => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  // quads (sens direct vu de l'extérieur)
  const quads = [
    [0, 2, 3, 1], // z0
    [4, 5, 7, 6], // z1
    [0, 1, 5, 4], // y0
    [2, 6, 7, 3], // y1
    [0, 4, 6, 2], // x0
    [1, 3, 7, 5], // x1
  ];
  const out: number[] = [];
  for (const [a, b, c, d] of quads) out.push(...p(a), ...p(b), ...p(c), ...p(a), ...p(c), ...p(d));
  return out;
}

/** Paroi d'un trou cylindrique d'axe z (normales vers l'axe), ou d'un pion (vers l'extérieur). */
function cylinder(cx: number, cy: number, r: number, z0: number, z1: number, inward = true, n = 24): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a0 = (2 * Math.PI * i) / n;
    const a1 = (2 * Math.PI * (i + 1)) / n;
    const A: V3 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0), z0];
    const B: V3 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1), z0];
    const C: V3 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1), z1];
    const D: V3 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0), z1];
    if (inward) out.push(...A, ...C, ...B, ...A, ...D, ...C);
    else out.push(...A, ...B, ...C, ...A, ...C, ...D);
  }
  return out;
}

const AXES: [V3, V3, V3] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

describe('taraudages et diamètres', () => {
  it('reconnaît le diamètre intérieur ISO (Inventor) et le perçage avant taraudage', () => {
    expect(threadFor(6.647)?.name).toBe('M8');
    expect(threadFor(6.66)?.from).toBe('minor');
    expect(threadFor(13.84)?.name).toBe('M16');
    expect(threadFor(10.2)?.name).toBe('M12');
    expect(threadFor(10.2)?.from).toBe('tapDrill');
    // un Ø10 ou un Ø14 restent des perçages
    expect(threadFor(10.01)).toBeUndefined();
    expect(threadFor(14.02)).toBeUndefined();
    expect(holeName({ d: 6.66, thread: threadFor(6.66) })).toBe('M8×1.25');
    expect(holeName({ d: 29.7 })).toBe('Ø30');
    expect(niceDiameter(6.6)).toBe(6.6);
  });
});

describe('lecture d’une pièce', () => {
  it('plaque percée : deux trous traversants, pas le pion', () => {
    const pos = [...box(0, 0, 0, 200, 100, 10), ...cylinder(50, 50, 8, 0, 10), ...cylinder(150, 50, 3.3235, 0, 10), ...cylinder(100, 20, 5, 10, 25, false)];
    const g = analyzePart(pos, AXES);
    expect(g.kind).toBe('plate');
    expect(g.size.map(Math.round)).toEqual([200, 100, 25]);
    const holes = [...g.holes].sort((a, b) => a.c[0] - b.c[0]);
    expect(holes).toHaveLength(2);
    expect(holes[0].axis).toBe('w');
    expect(holes[0].d).toBeCloseTo(16, 0);
    expect(holes[0].c[0]).toBeCloseTo(50, 1);
    expect(holes[1].thread?.name).toBe('M8');
  });

  it('tube percé de part en part : un perçage « 2 parois » ; l’alésage du tube n’est pas un trou', () => {
    const L = 1000;
    // tube 100 × 100 × 5 le long de x (4 parois), trou Ø14 à x = 300 à travers les deux parois en z
    const pos = [
      ...box(0, 0, 0, L, 100, 5),
      ...box(0, 0, 95, L, 100, 100),
      ...box(0, 0, 5, L, 5, 95),
      ...box(0, 95, 5, L, 100, 95),
      // trou dans la paroi basse (z 0–5) et la paroi haute (z 95–100), même axe
      ...cylinder(300, 50, 7, 0, 5),
      ...cylinder(300, 50, 7, 95, 100),
    ];
    // un rond intérieur le long du tube (alésage d'un tube rond, axe x) : rotation du cylindre z → x
    const bore = cylinder(50, 50, 26, 0, L).reduce<number[]>((acc, _, i, a) => (i % 3 === 0 ? [...acc, a[i + 2], a[i], a[i + 1]] : acc), []);
    const g = analyzePart([...pos, ...bore], AXES);
    expect(g.kind).toBe('profile');
    const z = g.holes.filter((h) => h.axis === 'w');
    expect(z).toHaveLength(1);
    expect(z[0].walls).toBe(2);
    expect(z[0].c[0]).toBeCloseTo(300, 1);
    expect(g.holes.some((h) => h.axis === 'u')).toBe(false);
    expect(g.ends).toEqual([90, 90]);
  });

  it('coupe d’onglet : angle de la coupe à l’axe', () => {
    // profil plein 1000 × 50 × 50 dont la fin est coupée à 45° (dans le plan x-y)
    const p: V3[] = [
      [0, 0, 0],
      [1000, 0, 0],
      [950, 50, 0],
      [0, 50, 0],
    ];
    const top = p.map(([x, y]): V3 => [x, y, 50]);
    const tri = (a: V3, b: V3, c: V3) => [...a, ...b, ...c];
    const pos = [
      ...tri(p[0], p[2], p[1]),
      ...tri(p[0], p[3], p[2]),
      ...tri(top[0], top[1], top[2]),
      ...tri(top[0], top[2], top[3]),
      ...tri(p[0], p[1], top[1]),
      ...tri(p[0], top[1], top[0]),
      ...tri(p[1], p[2], top[2]),
      ...tri(p[1], top[2], top[1]),
      ...tri(p[2], p[3], top[3]),
      ...tri(p[2], top[3], top[2]),
      ...tri(p[3], p[0], top[0]),
      ...tri(p[3], top[0], top[3]),
    ];
    expect(endCuts(pos, 1000)).toEqual([90, 45]);
  });

  it('nature selon les dimensions', () => {
    expect(partKind([5708, 162, 80])).toBe('profile');
    expect(partKind([5748, 2343, 36])).toBe('plate');
    expect(partKind([2495, 1000, 100])).toBe('plate');
    expect(partKind([168, 95, 10])).toBe('plate');
    expect(partKind([70, 70, 30])).toBe('block');
  });

  it('les faces retournées (SketchUp) ne font pas perdre les trous', () => {
    const pos = [...box(0, 0, 0, 200, 100, 10), ...cylinder(50, 50, 8, 0, 10)];
    // inverse le sens de tous les triangles
    const flipped: number[] = [];
    for (let i = 0; i < pos.length; i += 9) flipped.push(...pos.slice(i, i + 3), ...pos.slice(i + 6, i + 9), ...pos.slice(i + 3, i + 6));
    expect(detectHoles(flipped, -1)).toHaveLength(1);
  });
});

const part = (name: string, pos: number[], nodeId = name): PartInfo => ({ nodeId, moduleId: 'VBX-01', name, category: null, geo: analyzePart(pos, AXES) });

describe('regroupement et désignations', () => {
  it('même pièce retournée = même repère ; trous différents = autre repère', () => {
    const a = part('Plat', [...box(0, 0, 0, 200, 100, 10), ...cylinder(30, 50, 8, 0, 10)], 'a');
    const b = part('Plat', [...box(0, 0, 0, 200, 100, 10), ...cylinder(170, 50, 8, 0, 10)], 'b');
    const c = part('Plat', [...box(0, 0, 0, 200, 100, 10), ...cylinder(100, 50, 8, 0, 10)], 'c');
    expect(partKey(a)).toBe(partKey(b));
    expect(partKey(a)).not.toBe(partKey(c));
    const types = groupParts([a, b, c]);
    expect(types.map((t) => [t.mark, t.qty])).toEqual([
      ['P01', 2],
      ['P02', 1],
    ]);
    expect(types[0].description).toBe('Plate 10 × 100 × 200');
    expect(cleanName('Profile_C_toiture_long__2')).toBe('Profile C toiture long');
    expect(describePart({ geo: { ...a.geo, kind: 'profile', size: [5708, 162, 80] }, section: 'UPN 160' })).toBe('UPN 160 — L 5 708');
  });

  it('opérations de perçage', () => {
    expect(holeAction({ d: 6.66, thread: threadFor(6.66), walls: 1 })).toBe('Drill Ø6.8 + tap M8×1.25');
    expect(holeAction({ d: 14.02, walls: 2 })).toBe('Drill Ø14 through 2 walls');
  });
});

describe('vues, cotes et planches', () => {
  it('vue d’une pièce : la longueur à l’horizontale, regard dans l’axe demandé', () => {
    const spec = partViewSpec([0, 0, 1], [0, 1, 0]);
    const b = viewBasis(spec);
    expect(b.right.map((x) => Math.round(x) + 0)).toEqual([0, 1, 0]);
    expect(b.toward.map((x) => Math.round(x) + 0)).toEqual([0, 0, 1]);
  });

  it('cotes d’une pièce : chaîne des perçages depuis les bouts, longueur et hauteur', () => {
    const dims = planDimensions({ purpose: 'part', bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 80 }, modules: [], doors: [], feet: [], holes: [{ x: 250, y: 40 }, { x: 900, y: 40 }] });
    const top = dims.find((d) => d.side === 'top')!;
    expect(top.points.map((p) => p[0])).toEqual([0, 250, 900, 1000]);
    expect(dims.find((d) => d.side === 'bottom')!.points.map((p) => p[0])).toEqual([0, 1000]);
    expect(dims.find((d) => d.side === 'right')!.points.map((p) => p[1])).toEqual([0, 40, 80]);
  });

  it('liste de débit puis une planche par pièce, en anglais, numérotées PR', () => {
    const pos = [...box(0, 0, 0, 1000, 80, 40), ...cylinder(250, 40, 5, 0, 40), ...cylinder(900, 40, 5, 0, 40)];
    const types = groupParts([part('Roof C', pos, 'r1'), part('Roof C', pos, 'r2'), part('', box(0, 0, 0, 20, 20, 10), 'tiny')]);
    const res = productionSheets(types, { paper: 'A1', modelKey: 'k', style: DEFAULT_LINE_STYLE, moduleLabel: 'VBX-01', typeLabel: 'Permabox' });
    renumber(res.sheets);
    expect(res.sheets.map((s) => s.number)).toEqual(['PR.1', 'PR.2']);
    expect(res.sheets[0].title).toBe('Production - Cut list - Permabox');
    expect(res.sheets[1].title).toBe('Production - P01 - Roof C');
    const vps = res.sheets[1].items.filter((i) => i.type === 'viewport');
    expect(vps.map((v) => v.type === 'viewport' && v.label)).toEqual(['ELEVATION', 'PLAN', 'END VIEW']);
    expect(res.dimensioned).toHaveLength(3);
    expect(res.captures).toHaveLength(1);
    const texts = res.sheets.flatMap((s) => s.items.filter((i) => i.type === 'text').map((i) => (i.type === 'text' ? i.text : '')));
    expect(texts).toContain('PR.2'); // renvoi de la liste de débit
    expect(texts).toContain('small unnamed piece — no sheet');
    expect(texts.some((t) => t === '250, 900')).toBe(true);
    // la vue d'élévation regarde le côté percé
    expect(partViews(types[0])[0].toward).toBe('w');
    expect(holePositions(types[0], holeGroups(types[0].rep.geo.holes)[0])).toBe('250, 900');
  });
});
