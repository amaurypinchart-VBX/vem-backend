// Plans de production : lecture d'une pièce (perçages, taraudages, coupes), regroupement, cotes et planches.
import { describe, expect, it } from 'vitest';
import type { V3 } from '../../src/production/analyze';
import { analyzePart, detectHoles, endCuts, holeName, niceDiameter, partKind, threadFor } from '../../src/production/analyze';
import type { PartInfo } from '../../src/production/parts';
import { cleanName, describePart, groupParts, holeAction, holeCallout, holeGroups, partKey } from '../../src/production/parts';
import { applyHoleSpecs, cleanHoleSpecs, diameterClasses, diameterSpec, partHoleKey, partSignature, specAction, specName } from '../../src/production/holeSpecs';
import { endDetails, holePositions, isCladding, partViewSpec, partViews, productionSheets } from '../../src/production/sheets';
import { zoneOfPart } from '../../src/production/parts';
import { assemblyBalloons, partsSeen } from '../../src/sheets/balloons';
import type { Linework2D } from '../../src/linework/types';
import type { LoadedScene } from '../../src/scene/loadedScene';
import type { ViewportItem } from '../../src/sheets/types';
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
    expect(holeAction({ d: 6.66, thread: threadFor(6.66), walls: 1 })).toBe('Drill Ø6.8 + tap M8×1.25 (to confirm)');
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

  it('plan d’assemblage : la structure sans l’habillage, nomenclature, après la liste de débit', () => {
    const pos = [...box(0, 0, 0, 1000, 80, 40), ...cylinder(250, 40, 5, 0, 40)];
    const types = groupParts([part('Rim', pos, 'r1'), part('Panel', box(0, 0, 0, 2400, 950, 60), 'pn')]);
    expect(isCladding(types.find((t) => t.name === 'Panel')!)).toBe(true);
    const res = productionSheets(types, { paper: 'A1', modelKey: 'k', style: DEFAULT_LINE_STYLE, moduleLabel: 'VBX-01', typeLabel: 'Permabox', module: { id: 'VBX-01', nodeId: 'm1' } });
    renumber(res.sheets);
    expect(res.sheets.map((s) => s.title).slice(0, 2)).toEqual(['Production - Cut list - Permabox', 'Production - Assembly - Permabox']);
    const asm = res.sheets[1];
    const vps = asm.items.filter((i): i is ViewportItem => i.type === 'viewport');
    expect(vps.map((v) => v.label)).toEqual(['TOP VIEW', 'PLAN — CUT AT 1.20 m', 'LONG SIDE', 'SHORT SIDE']);
    expect(vps[0].request.subset.include).toEqual(['r1']);
    expect(vps[0].assembly!.parts.map((p) => p.mark)).toEqual(['P01', 'P02']);
    expect(vps[1].request.floorCut).toBe(1200);
    const texts = asm.items.map((i) => (i.type === 'text' ? i.text : ''));
    expect(texts).toContain('PARTS LIST');
    expect(texts.some((t) => /cladding, not drawn/.test(t))).toBe(true);
    // renvois de la nomenclature vers les planches des pièces (PR.3 = P01 Rim)
    expect(texts).toContain('PR.3');
  });

  it('bulles : une par repère vu, attachée à son trait, hors du dessin, jamais deux fois sur la planche', () => {
    const vp: ViewportItem = {
      id: 'v1',
      type: 'viewport',
      rect: { x: 0, y: 0, w: 300, h: 200 },
      request: { modelId: 'k', subset: { include: [] }, view: { kind: 'top', frame: 'world' }, style: DEFAULT_LINE_STYLE },
      scale: 20,
      showLabel: false,
      renderStyle: 'trait',
      assembly: { parts: [{ nodeId: 'a', mark: 'P01' }, { nodeId: 'b', mark: 'P02' }, { nodeId: 'c', mark: 'P03' }] },
    };
    const basis = viewBasis({ kind: 'top', frame: 'world' });
    const lw = {
      boundsMm: { minX: 0, minY: 0, maxX: 2000, maxY: 1000 },
      layers: [
        // P01 : rive du bas (vue par un nœud maillé enfant de « a ») ; P02 : traverse au milieu ; P03 : seulement caché
        { key: 'visible', polylines: [new Float64Array([0, 0, 2000, 0]), new Float64Array([1000, 0, 1000, 1000])], sourceNodeIds: ['a-mesh', 'b'] },
        { key: 'hidden', polylines: [new Float64Array([0, 500, 2000, 500])], sourceNodeIds: ['c'] },
      ],
    } as unknown as Linework2D;
    const scene = {
      look: { byId: new Map([['a-mesh', { id: 'a-mesh', parentId: 'a' }], ['a', { id: 'a', parentId: null }], ['b', { id: 'b', parentId: null }]]) },
      index: { nodes: [] },
    } as unknown as Pick<LoadedScene, 'look' | 'index'>;
    expect(partsSeen(vp, lw, scene).map((s) => s.mark)).toEqual(['P01', 'P02']);
    const taken = new Set(['P02']);
    const fit = { scale: 20, center: [1000, 500] as [number, number] };
    const m = { top: 20, bottom: 20, left: 20, right: 20 };
    const out = assemblyBalloons(vp, lw, basis, scene, fit, m, taken);
    expect(out.map((l) => l.text)).toEqual(['P01']);
    expect(out[0].balloon).toBe(true);
    expect(taken.has('P01')).toBe(true);
    // rive du bas → bulle sous le dessin, au-delà des cotes (dessin : y papier 75 … 125)
    expect(out[0].textPos.y).toBeGreaterThan(125 + 20);
    expect(out[0].anchor3d![0]).toBeGreaterThanOrEqual(0);
    // posée une seconde fois : rien (déjà sur la planche)
    expect(assemblyBalloons(vp, lw, basis, scene, fit, m, taken)).toEqual([]);
  });

  it('zones de la box : plancher, toit, ossature', () => {
    expect(zoneOfPart([0, 200], [0, 3300])).toBe('floor');
    expect(zoneOfPart([3050, 3300], [0, 3300])).toBe('roof');
    expect(zoneOfPart([0, 3240], [0, 3300])).toBe('frame');
    expect(zoneOfPart([1000, 1200], [0, 3300])).toBe('frame');
  });

  it('plans des sous-ensembles plancher et toit, avec leur habillage, après la vue d’ensemble', () => {
    const rim = part('Rim', [...box(0, 0, 0, 3000, 80, 40), ...cylinder(250, 40, 5, 0, 40)], 'f1');
    const ply = part('Plywood', box(0, 0, 0, 3000, 2300, 36), 'f2');
    const roof = part('Roof rim', box(0, 0, 0, 2000, 80, 40), 'r1');
    const epdm = part('EPDM', box(0, 0, 0, 3000, 2300, 5), 'r2');
    const types = groupParts([rim, ply, roof, epdm]);
    const zoneOf = { f1: 'floor', f2: 'floor', r1: 'roof', r2: 'roof' } as const;
    const res = productionSheets(types, { paper: 'A1', modelKey: 'k', style: DEFAULT_LINE_STYLE, moduleLabel: 'VBX-01', typeLabel: 'Box', module: { id: 'VBX-01', nodeId: 'm1', zoneOf } });
    renumber(res.sheets);
    expect(res.sheets.slice(1, 4).map((s) => s.title)).toEqual(['Production - Assembly - Box', 'Production - Assembly - Floor platform - Box', 'Production - Assembly - Roof platform - Box']);
    const floor = res.sheets[2].items.filter((i): i is ViewportItem => i.type === 'viewport');
    expect(floor.map((v) => v.label)).toEqual(['TOP VIEW', 'BOTTOM VIEW', 'LONG SIDE', 'SHORT SIDE']);
    // le contreplaqué fait partie du plancher : dessiné ici (pas sur la vue d'ensemble)
    expect(new Set(floor[0].request.subset.include)).toEqual(new Set(['f1', 'f2']));
    expect(floor[1].request.view.kind).toBe('bottom');
    const overall = res.sheets[1].items.find((i): i is ViewportItem => i.type === 'viewport')!;
    expect(overall.request.subset.include).not.toContain('f2');
  });

  it('détails agrandis des bouts d’un profil percé près de ses bouts', () => {
    const pos = [...box(0, 0, 0, 3000, 80, 40), ...cylinder(55, 40, 5, 0, 40), ...cylinder(165, 40, 5, 0, 40), ...cylinder(1500, 40, 5, 0, 40), ...cylinder(2945, 40, 5, 0, 40)];
    const types = groupParts([part('Post', pos, 'p')]);
    const d = endDetails(types[0], 'w');
    expect(d.map((x) => x.side)).toEqual(['start', 'end']);
    expect(d[0].u1).toBeCloseTo(245, 0);
    expect(d[1].u0).toBeCloseTo(2800, 0); // au moins 200 mm de bout
    const res = productionSheets(types, { paper: 'A1', modelKey: 'k', style: DEFAULT_LINE_STYLE, moduleLabel: 'VBX-01', typeLabel: 'Box' });
    const vps = res.sheets[1].items.filter((i): i is ViewportItem => i.type === 'viewport');
    expect(vps.map((v) => v.label)).toEqual(['ELEVATION', 'PLAN', 'END VIEW', 'DETAIL A — LEFT END', 'DETAIL B — RIGHT END']);
    expect(vps[3].partView!.window).toBeDefined();
    // un profil court ou sans perçage près des bouts : pas de détail
    expect(endDetails(groupParts([part('Short', box(0, 0, 0, 800, 80, 40), 's')])[0], 'w')).toEqual([]);
    // cotes d'un détail : chaîne depuis le bout, pas de longueur totale
    const dims = planDimensions({ purpose: 'part', bounds: { minX: 0, minY: 0, maxX: 245, maxY: 80 }, modules: [], doors: [], feet: [], holes: [{ x: 55, y: 40 }, { x: 165, y: 40 }], endX: 0 });
    expect(dims.find((x) => x.side === 'top')!.points.map((p) => p[0])).toEqual([0, 55, 165]);
    expect(dims.some((x) => x.side === 'bottom')).toBe(false);
  });
});

describe('trous et taraudages dits dans l’application', () => {
  // profil 1 000 × 80 × 40 : deux Ø10 sur l'épaisseur, un Ø6,65 (taraudage M8 proposé) sur le côté
  const pos = [...box(0, 0, 0, 1000, 80, 40), ...cylinder(250, 40, 5, 0, 40), ...cylinder(900, 40, 5, 0, 40), ...cylinder(500, 40, 3.3235, 0, 40)];
  const types = () => groupParts([part('Roof C', pos, 'r1'), part('Roof C', pos, 'r2')]);

  it('lecture tolérante, opérations et désignations', () => {
    const s = cleanHoleSpecs({ byDiameter: { 'd6.6': { op: 'tap', size: 8 }, bad: { op: 'drill' }, 'd10': { op: 'nope' } }, byPart: { x: { op: 'tap' } } });
    expect(s).toEqual({ byDiameter: { 'd6.6': { op: 'tap', size: 8 } }, byPart: {} });
    expect(specAction({ op: 'tap', size: 8 }, 6.65, 1)).toBe('Drill Ø6.8 + tap M8×1.25');
    expect(specAction({ op: 'tap', size: 10, pitch: 1 }, 8.9, 1)).toBe('Drill Ø9 + tap M10×1');
    expect(specName({ op: 'tap', size: 10, pitch: 1 }, 9)).toBe('M10×1');
    expect(specAction({ op: 'countersink', size: 6 }, 6.6, 1)).toBe('Drill Ø6.6 + countersink 90° Ø12.6 (M6 flat head screw)');
    expect(specAction({ op: 'screw', d: 4.2, note: 'Ejot 5.5 × 25' }, 4.2, 1)).toBe('Pre-drill Ø4.2 for self-drilling screw — Ejot 5.5 × 25');
    expect(specAction({ op: 'drill', d: 11 }, 10, 2)).toBe('Drill Ø11 through 2 walls');
    expect(specAction({ op: 'rivet', d: 4.1 }, 4, 1)).toBe('Drill Ø4.1 for blind rivet');
    expect(specAction({ op: 'rivet' }, 5.02, 1)).toBe('Drill Ø5 for blind rivet');
  });

  it('choix pour tout le modèle par Ø dessiné, choix d’une pièce prioritaire, « rien à usiner » retiré', () => {
    const t = types();
    const classes = diameterClasses(t);
    expect(classes.map((c) => [c.key, c.holes, c.detected])).toEqual([
      ['d6.6', 2, 'M8×1.25'],
      ['d10', 4, 'Ø10'],
    ]);
    // tout le modèle : Ø10 → perçage Ø11 ; la pièce : son M8 → rien
    const sig = partSignature(t[0]);
    const m8 = t[0].rep.geo.holes.find((h) => h.thread)!;
    const specs = cleanHoleSpecs({ byDiameter: { d10: { op: 'drill', d: 11 } }, byPart: { [partHoleKey(sig, m8)]: { op: 'none' } } });
    const out = applyHoleSpecs(t, specs);
    expect(out[0].mark).toBe('P01');
    const groups = holeGroups(out[0].rep.geo.holes);
    expect(groups.map((g) => [g.holes.length, holeAction(g), holeCallout(g)])).toEqual([[2, 'Drill Ø11', 'Ø11']]);
    // la détection n'est pas touchée
    expect(t[0].rep.geo.holes).toHaveLength(3);
    // retrouvé à ± 0,12 mm (nouvelle analyse du modèle)
    expect(diameterSpec(specs, 9.93)?.key).toBe('d10');
    expect(diameterSpec(specs, 9.8)).toBeUndefined();
  });

  it('planches : opération et repère du choix, sans « to confirm »', () => {
    const t = types();
    const auto = productionSheets(t, { paper: 'A1', modelKey: 'k', style: DEFAULT_LINE_STYLE, moduleLabel: 'VBX-01', typeLabel: 'Permabox' });
    const textsOf = (r: typeof auto) => r.sheets.flatMap((s) => s.items.flatMap((i) => (i.type === 'text' ? [i.text] : [])));
    expect(textsOf(auto)).toContain('Drill Ø6.8 + tap M8×1.25 (to confirm)');
    const specs = cleanHoleSpecs({ byDiameter: { 'd6.6': { op: 'tap', size: 8 }, d10: { op: 'countersink', size: 8 } } });
    const res = productionSheets(applyHoleSpecs(t, specs), { paper: 'A1', modelKey: 'k', style: DEFAULT_LINE_STYLE, moduleLabel: 'VBX-01', typeLabel: 'Permabox' });
    const texts = textsOf(res);
    expect(texts).toContain('Drill Ø6.8 + tap M8×1.25');
    expect(texts).toContain('Drill Ø9 + countersink 90° Ø17.3 (M8 flat head screw)');
    expect(texts.some((x) => x.endsWith('(to confirm)'))).toBe(false);
    expect(texts.some((x) => x.includes('2× CSK M8') && x.includes('1× M8'))).toBe(true);
    const vp = res.sheets[1].items.find((i) => i.type === 'viewport' && i.partView);
    const names = vp?.type === 'viewport' ? [...new Set(vp.partView!.holes.map((h) => h.name))].sort() : [];
    expect(names).toEqual(['CSK M8', 'M8']);
  });
});
