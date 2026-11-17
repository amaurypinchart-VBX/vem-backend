// « 📏 Coter une pièce » : pièces d'un groupe / identiques, références (faces des poteaux, plancher), chaînes de cotes
// et leur pose autour du dessin ; sur une vraie élévation calculée (ossature bois 45 × 45 dans une Viewbox) et sur une
// vue spéciale coupée.
import { describe, expect, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../../src/core/classification';
import { subsetForModule } from '../../src/core/subset';
import type { LoadedScene } from '../../src/scene/loadedScene';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { makeGlassTest } from '../../src/linework/packets';
import { BrowserHlrProvider } from '../../src/linework/provider';
import { createInlineRunner } from '../../src/linework/runner';
import { subsetEnv } from '../../src/linework/subset';
import type { Linework2D, LineworkRequest } from '../../src/linework/types';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';
import type { ViewBasis } from '../../src/core/views';
import { meshAt, meshBox, viewMeshes } from '../../src/linework/pieceGeometry';
import type { ViewportItem } from '../../src/sheets/types';
import type { Piece, PieceRefs } from '../../src/sheets/pieceDims';
import {
  groupPieces,
  levelPieceOf,
  pickSource,
  pieceCrumbs,
  pieceDimensionItems,
  pieceRefs,
  placePieceDims,
  planPieceDims,
  samePieceOf,
  seenPieces,
} from '../../src/sheets/pieceDims';
import { VIEW_PRESETS, specFromPreset } from '../../src/core/customViews/presets';
import { computeSpecialView } from '../../src/linework/customView';
import { makeSketchupDae } from '../fixtures/sketchupDae';

async function battenScene(): Promise<LoadedScene> {
  const dae = makeSketchupDae({ twoSided: false, battens: true });
  const res = await ingest({ fileName: 'battens.dae', data: new TextEncoder().encode(dae).buffer as ArrayBuffer, sha256: 'bt', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  return makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'battens');
}

const vpOf = (req: LineworkRequest): ViewportItem => ({ id: 'vp', type: 'viewport', rect: { x: 0, y: 0, w: 400, h: 250 }, request: req, scale: 25, showLabel: false, renderStyle: 'trait' });

function setup(scene: LoadedScene, lw: Linework2D, basis: ViewBasis, vp: ViewportItem, view = viewMeshes(scene, vp)) {
  const boxes = new Map<string, ReturnType<typeof meshBox>>();
  const boxOf = (id: string) => {
    if (!boxes.has(id)) boxes.set(id, meshBox(scene, id, basis, view.planes.get(id)));
    return boxes.get(id)!;
  };
  const click = (x: number, y: number) => {
    const src = pickSource(lw, x, y, 30);
    const own = src ? view.meshes.filter((m) => scene.look.itemOf(m) === src) : [];
    return (own.length ? meshAt(scene, own, basis, view.planes, x, y, 30, boxOf) : null) ?? meshAt(scene, view.meshes, basis, view.planes, x, y, 30, boxOf);
  };
  const piecesAt = (level: string, same = false) => {
    const look = scene.look;
    const under = view.meshes.filter((m) => look.inSet(m, new Set([level])));
    const pieceOf = same ? samePieceOf(look, level)! : levelPieceOf(look, level, under);
    return seenPieces(lw, groupPieces(same ? view.meshes : under, pieceOf, boxOf, look.itemOf));
  };
  return { view, boxOf, click, piecesAt };
}

const r = (v: number[]) => v.map((x) => Math.round(x));
const chainsOf = (pieces: Array<Piece & { sources: Set<string> }>, refs: PieceRefs) => planPieceDims(pieces, refs).map((c) => [c.orient, c.what, r(c.values)]);

describe('élévation réelle : ossature bois 45 × 45', async () => {
  const scene = await battenScene();
  const provider = new BrowserHlrProvider(scene, { runner: createInlineRunner(), glassTest: makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial), categoryColors: () => ({}), noCache: true });
  const req: LineworkRequest = { modelId: 'bt', subset: { include: subsetForModule(scene.index, 'VBX-01') }, view: { kind: 'front', frame: 'world' }, style: { ...DEFAULT_LINE_STYLE } };
  const lw = await provider.getLinework(req);
  const basis = lw.meta.basis;
  const { click, piecesAt } = setup(scene, lw, basis, vpOf(req));
  const refsOf = (pieces: Array<Piece & { sources: Set<string> }>, from: 'floor-top' | 'ground' = 'floor-top') => {
    const sel = new Set(pieces.flatMap((p) => [...p.sources]));
    return pieceRefs({ index: scene.index, look: scene.look, frames: scene.frames, tags: subsetEnv(scene).tags }, lw, basis, pieces, (s) => sel.has(s), from);
  };

  it('les traits ne disent que l’objet posé : chaque bois vient de la maquette 3D', () => {
    const wood = scene.index.nodes.find((n) => n.name === 'Ossature bois' && n.moduleId === 'VBX-01')!;
    const sources = new Set(lw.layers.flatMap((l) => l.sourceNodeIds ?? []));
    expect(sources.has(wood.id)).toBe(true);
    expect([...sources].some((s) => scene.look.byId.get(s)?.parentId === wood.id)).toBe(false);
  });

  it('clic sur un montant → la pièce, son groupe au-dessus', () => {
    const mesh = click(1520, 2400)!;
    const { crumbs, level } = pieceCrumbs(scene.look, mesh);
    expect(crumbs.map((c) => c.label)).toEqual(['VBX-01', 'Ossature bois', 'Bois 45x45 montant']);
    expect(level).toBe(crumbs[2].id);
    // traverse devant le montant : c'est elle qu'on touche
    const rail = click(1520, 1020)!;
    expect(scene.look.byId.get(pieceCrumbs(scene.look, rail).level)?.definition).toBe('Bois 45x45 traverse');
    // montant devant la traverse (contre la vitre)
    const near = click(2220, 1020)!;
    const nb = piecesAt(pieceCrumbs(scene.look, near).level);
    expect(nb.map((p) => r([p.x0, p.x1]))).toEqual([[2200, 2245]]);
  });

  it('le groupe : positions et largeurs depuis les faces des poteaux, hauteurs depuis le plancher', () => {
    const level = pieceCrumbs(scene.look, click(1520, 2400)!).crumbs[1].id;
    const pieces = piecesAt(level);
    expect(pieces.length).toBe(6);
    const refs = refsOf(pieces);
    expect(refs.moduleId).toBe('VBX-01');
    expect([refs.x.lo, refs.x.hi, refs.x.loLabel]).toEqual([100, 5800, 'face du poteau']);
    expect(Math.round(refs.y.lo!)).toBe(150);
    expect(chainsOf(pieces, refs)).toEqual([
      ['h', 'position', [100, 1500, 1545, 2200, 2245, 3000, 3045, 4500, 4545, 5800]],
      ['v', 'position', [150, 1000, 1045, 1800, 1845]],
      ['v', 'span', [150, 2700]],
    ]);
    // depuis le sol : dessous des pieds (−100)
    expect(chainsOf(pieces, refsOf(pieces, 'ground'))[1]).toEqual(['v', 'position', [-100, 1000, 1045, 1800, 1845]]);
  });

  it('une pièce seule, toutes les identiques', () => {
    const stud = pieceCrumbs(scene.look, click(1520, 2400)!).level;
    const one = piecesAt(stud);
    expect(one.length).toBe(1);
    expect(chainsOf(one, refsOf(one))).toEqual([
      ['h', 'position', [100, 1500, 1545, 5800]],
      ['v', 'span', [150, 2700]],
    ]);
    const same = piecesAt(stud, true);
    expect(same.map((p) => r([p.x0]))).toEqual([[1500], [2200], [3000], [4500]]);
    // une traverse : sa hauteur, son épaisseur et sa longueur d'un poteau à l'autre
    const rail = pieceCrumbs(scene.look, click(3500, 1020)!).level;
    const rp = piecesAt(rail);
    expect(chainsOf(rp, refsOf(rp))).toEqual([
      ['v', 'position', [150, 1000, 1045]],
      ['h', 'span', [100, 5800]],
    ]);
  });
});

describe('vue spéciale : coupe longitudinale', async () => {
  const scene = await battenScene();
  const deps = { scene, runner: createInlineRunner(), glassTest: makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial), noCache: true };
  const spec = specFromPreset(VIEW_PRESETS.find((p) => p.key === 'section-long')!, 'cv', '2026-11-17');
  spec.scope = { ...spec.scope, modules: ['VBX-01'] };
  const res = await computeSpecialView(spec, deps, DEFAULT_LINE_STYLE);
  const block = res.blocks[0];
  const vp: ViewportItem = { ...vpOf({ modelId: 'bt', subset: { include: [] }, view: { kind: 'front', frame: 'world' }, style: { ...DEFAULT_LINE_STYLE } }), custom: { viewId: 'cv', block: block.key } };
  const view = viewMeshes(scene, vp, spec);
  const { click, piecesAt } = setup(scene, block.lw, block.basis, vp, view);

  it('le montant contre le côté retiré par la coupe n’est pas une pièce ; cotes comme sur l’élévation', () => {
    const mesh = click(1520, 2400)!;
    expect(mesh).toBeTruthy();
    const { crumbs } = pieceCrumbs(scene.look, mesh);
    const pieces = piecesAt(crumbs[1].id);
    expect(pieces.length).toBe(5);
    const sel = new Set(pieces.flatMap((p) => [...p.sources]));
    const refs = pieceRefs({ index: scene.index, look: scene.look, frames: scene.frames, tags: subsetEnv(scene).tags }, block.lw, block.basis, pieces, (s) => sel.has(s));
    const chains = chainsOf(pieces, refs);
    const along = chains[0][2] as number[];
    // la vue peut être en miroir selon le côté regardé : mêmes écarts
    const gaps = along.slice(1).map((v, i) => v - along[i]);
    expect([gaps, gaps.slice().reverse()]).toContainEqual([1400, 45, 1455, 45, 1455, 45, 1255]);
    expect(chains.slice(1)).toEqual([
      ['v', 'position', [150, 1000, 1045, 1800, 1845]],
      ['v', 'span', [150, 2700]],
    ]);
  });
});

describe('pose autour du dessin', () => {
  const bounds = { minX: 0, minY: -100, maxX: 5900, maxY: 2800 };
  const toPaper = (x: number, y: number) => ({ x: 100 + x / 25, y: 300 - y / 25 });
  const sel = { x0: 100, x1: 5800, y0: 150, y1: 2700 };

  it('côté le plus proche des pièces, au-delà des cotes déjà posées', () => {
    const chains = [
      { orient: 'h' as const, values: [100, 1500, 1545, 5800], what: 'position' as const },
      { orient: 'v' as const, values: [150, 1000, 1045], what: 'position' as const },
      { orient: 'v' as const, values: [150, 2700], what: 'span' as const },
    ];
    const placed = placePieceDims(chains, { bounds, sel, toPaper, existing: [] });
    // plus près du haut (100 mm) que du bas (250 mm) ; à égalité à droite
    expect(placed.map((p) => p.side)).toEqual(['top', 'right', 'right']);
    expect(placed[0].offsetMm).toBe(-10);
    expect(placed[1].offsetMm).toBe(10);
    // 2e rangée : 7 mm plus loin, plus si les textes de la 1re (45 mm, trop serrés) sont décalés vers l'extérieur
    expect(placed[2].offsetMm).toBeGreaterThanOrEqual(17);
    expect(placed[0].points.every(([, y]) => y === bounds.maxY)).toBe(true);
    // une cote déjà au-dessus à 10 mm : la nouvelle va 7 mm plus haut
    const existing = [{ orient: 'h' as const, paper: [toPaper(0, 2800), toPaper(5900, 2800)], model: [[0, 2800], [5900, 2800]] as Array<[number, number]>, offsetMm: -10 }];
    const again = placePieceDims(chains.slice(0, 1), { bounds, sel, toPaper, existing });
    expect(again[0].offsetMm).toBe(-17);
  });

  it('cotes associatives (points 3D dans la base de la vue)', () => {
    const placed = placePieceDims([{ orient: 'h', values: [100, 1500], what: 'position' }], { bounds, sel, toPaper, existing: [] });
    const [d] = pieceDimensionItems(placed, 'vp', { right: [1, 0, 0], up: [0, 1, 0], toward: [0, 0, 1] }, 42);
    expect(d).toMatchObject({ type: 'dimension', viewportId: 'vp', kind: 'linear', orient: 'h', offsetMm: -10 });
    expect(d.anchors3d).toEqual([[100, 2800, 42], [1500, 2800, 42]]);
    expect(d.auto).toBeUndefined();
  });
});

describe('pièce sous le clic (traits)', () => {
  const lw = {
    boundsMm: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    layers: [
      { key: 'visible' as const, polylines: [new Float64Array([0, 0, 100, 0])], sourceNodeIds: ['a'] },
      { key: 'hidden' as const, polylines: [new Float64Array([0, 50, 100, 50])], sourceNodeIds: ['h'] },
    ],
    fills: [{ key: 'cut-fill' as const, color: '#000', rings: [new Float64Array([40, 40, 60, 40, 60, 60, 40, 60])], sourceNodeId: 'f' }],
    snapPoints: new Float64Array(),
    meta: {} as Linework2D['meta'],
  } as Linework2D;

  it('trait le plus proche (pas les lignes cachées), sinon la pièce coupée qui contient le point', () => {
    expect(pickSource(lw, 50, 2, 3)).toBe('a');
    expect(pickSource(lw, 10, 51, 3)).toBe(null);
    expect(pickSource(lw, 50, 55, 3)).toBe('f');
  });
});
