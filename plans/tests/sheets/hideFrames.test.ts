// Planches : éléments masqués en plus des catégories (étiquettes, clic), « Vue du sol » (coupe horizontale), cadres
// textile (étiquette, mesure, types F1…, planches de détail cotées, repères, cotes sur les vues), masquage sur tout le jeu.
import { describe, expect, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../../src/core/classification';
import type { NodeInfo, SceneIndex } from '../../src/core/types';
import { subsetAll, subsetForLevel, subsetForModule } from '../../src/core/subset';
import { TEXTILE_TAG, makeTagResolver } from '../../src/core/customViews/tags';
import { FLOOR_CUT_DEFAULT, tagHideRule, tagsInSubset } from '../../src/core/subsetHide';
import type { LoadedScene } from '../../src/scene/loadedScene';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { makeGlassTest } from '../../src/linework/packets';
import { BrowserHlrProvider } from '../../src/linework/provider';
import { createInlineRunner } from '../../src/linework/runner';
import { hideRuleCounts, subsetEnv, subsetMeshes, subsetScope, textileFrameOf } from '../../src/linework/subset';
import type { LineworkRequest } from '../../src/linework/types';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';
import { compactLocations, compactRefs, frameLabels, frameOrientation, frameRefs, frameSheets, framesInView, framesOf, groupFrames, measureFrames, numberFrames } from '../../src/sheets/frames';
import { cleanTextileFrame } from '../../src/core/manifest';
import { VIEW_PRESETS, specFromPreset } from '../../src/core/customViews/presets';
import { computeSpecialView } from '../../src/linework/customView';
import { customViewSheets } from '../../src/sheets/customSheets';
import { layerStack, spreadLabels } from '../../src/sheets/layers';
import { strToU8, zipSync } from 'fflate';
import type { FrameInfo } from '../../src/sheets/frames';
import { planDimensions } from '../../src/sheets/dimensions';
import { autoDimensionViewport } from '../../src/sheets/autoDim';
import { generateDrawingSet } from '../../src/sheets/generate';
import { hiddenCount, setHidden, standardViewports, withHidden } from '../../src/sheets/hideSet';
import { emptyTitleBlock } from '../../src/sheets/types';
import type { DimensionItem, LabelItem, TextItem, ViewportItem } from '../../src/sheets/types';
import { makeSketchupDae } from '../fixtures/sketchupDae';

async function textileScene(): Promise<LoadedScene> {
  const dae = makeSketchupDae({ twoSided: false, textile: true });
  const res = await ingest({ fileName: 'textile.dae', data: new TextEncoder().encode(dae).buffer as ArrayBuffer, sha256: 'tx', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  return makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'textile');
}

const provider = (scene: LoadedScene) =>
  new BrowserHlrProvider(scene, { runner: createInlineRunner(), glassTest: makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial), categoryColors: () => ({}), noCache: true });

const named = (scene: LoadedScene, name: string) => scene.index.nodes.filter((n) => n.name === name || n.sourceName === name);
/** Sources (accessoires / pièces) des traits d'une vue. */
const sourcesOf = (lw: { layers: Array<{ sourceNodeIds?: string[] }> }) => new Set(lw.layers.flatMap((l) => l.sourceNodeIds ?? []));
/** La pièce (ou un de ses parents) est-elle dessinée ? */
const drawn = (scene: LoadedScene, srcs: Set<string>, nodeId: string) => [...srcs].some((s) => s && scene.look.inSet(s, new Set([nodeId])));

describe('étiquette « cadre textile »', () => {
  const node = (id: string, name: string, category: string | null = null, source: NodeInfo['categorySource'] = null): NodeInfo => ({
    id,
    name,
    parentId: null,
    kind: 'group',
    role: 'item',
    category,
    categorySource: source,
    moduleId: null,
    assignment: null,
    level: null,
    bboxMm: null,
    triangles: 0,
  });
  const index = {
    nodes: [
      node('a', 'Cadre tissu tendu 2400'),
      node('b', 'SEG frame 1000'),
      node('c', 'Bloc 7', 'FRAME-FOR-TEXTILE', 'manifest'),
      node('d', 'Toilettes PMR'),
      node('e', 'Préfabriqué'),
      node('f', 'Barrisol plafond'),
      node('g', 'Logo textile print'),
      node('h', 'Bloc 8', 'FRAME-EXTERIEUR', 'manifest'),
      node('i', 'Bloc 9', 'FRAME-INTERIEUR', 'manifest'),
      node('j', 'Bloc 10', 'BOARDING', 'manifest'),
    ],
    modules: [],
  } as unknown as SceneIndex;
  const tags = makeTagResolver(index);
  it('reconnu par la catégorie (FRAME-FOR-TEXTILE) ou le nom ; « tissu tendu » n’est pas le plafond tendu', () => {
    expect(tags.ownTag('a')?.tag).toBe(TEXTILE_TAG);
    expect(tags.ownTag('b')?.tag).toBe(TEXTILE_TAG);
    expect(tags.ownTag('c')).toMatchObject({ tag: TEXTILE_TAG, source: 'category' });
    expect(tags.ownTag('d')).toBeNull();
    expect(tags.ownTag('e')).toBeNull();
    expect(tags.ownTag('f')?.tag).toBe('plafond-tendu');
    expect(tags.ownTag('g')?.tag).toBe(TEXTILE_TAG);
    // catégories « Frame extérieur / intérieur » de l'extension SketchUp 1.4.1
    expect(tags.ownTag('h')).toMatchObject({ tag: TEXTILE_TAG, source: 'category' });
    expect(tags.ownTag('i')).toMatchObject({ tag: TEXTILE_TAG, source: 'category' });
    expect(tags.ownTag('j')?.tag).not.toBe(TEXTILE_TAG);
  });
});

describe('orientation d’un cadre', () => {
  it('l’étendue la plus petite est l’épaisseur ; à plat = vu de dessus', () => {
    expect(frameOrientation([40, 2300, 350], { a: 1, b: 0 })).toMatchObject({ thin: 'a', w: 2300, h: 350, t: 40, normal: { a: 1 } });
    expect(frameOrientation([2000, 40, 2000], { a: 0, b: -3 })).toMatchObject({ thin: 'b', w: 2000, h: 2000, normal: { b: -1 } });
    expect(frameOrientation([3000, 1200, 30], { a: 0, b: 0 })).toMatchObject({ thin: 'up', w: 3000, h: 1200, t: 30 });
  });
  const f = (id: string, def: string, w: number, h: number, m: string | null, extra: Partial<FrameInfo> = {}): FrameInfo => ({ nodeId: id, moduleId: m, label: def, definition: def, w, h, t: 40, view: { kind: 'front', frame: m ? { moduleId: m } : 'world' }, side: 'front', center: [0, 0, 0], ...extra });
  it('un repère par cadre (Viewbox, tour de la box, gauche → droite) ; dessins regroupés par taille, plus grands d’abord', () => {
    const types = groupFrames([f('1', 'A', 1000, 500, 'VBX-02'), f('2', 'A', 1001.5, 499, 'VBX-01'), f('3', 'B', 2000, 2000, 'VBX-01'), f('4', 'A', 1200, 500, 'VBX-01')]);
    expect(types.map((t) => [t.ref, t.definition, Math.round(t.w), t.nodeIds.length])).toEqual([
      ['F2', 'B', 2000, 1],
      ['F3', 'A', 1200, 1],
      ['F1, F4', 'A', 1002, 2],
    ]);
    expect(types[2].locations).toEqual(['VBX-01 Front', 'VBX-02 Front']);
    expect(frameRefs(types).get('1')).toBe('F4');
    expect(framesOf(types).map((x) => x.ref)).toEqual(['F1', 'F2', 'F3', 'F4']);
    expect(compactLocations(['VBX-01 Left', 'VBX-01 Left', 'VBX-02 Left'])).toBe('VBX-01 Left ×2, VBX-02 Left');
  });
  it('repères saisis dans SketchUp gardés ; doublon ou absent → numéro libre ; ordre tour de la box', () => {
    const list = numberFrames([
      f('a', 'A', 1000, 500, 'VBX-01', { side: 'left', ref: 'F2', refSource: 'sketchup', visual: 'Logo' }),
      f('b', 'A', 1000, 500, 'VBX-01', { side: 'front', along: 900 }),
      f('c', 'A', 1000, 500, 'VBX-01', { side: 'front', along: -300 }),
      f('d', 'A', 1000, 500, 'VBX-02', { side: 'front', ref: 'F2', refSource: 'sketchup' }),
      f('e', 'A', 1000, 500, null, { side: 'front' }),
    ]);
    expect(list.map((x) => [x.nodeId, x.ref, x.refSource])).toEqual([
      ['c', 'F1', 'auto'],
      ['a', 'F2', 'sketchup'],
      ['b', 'F3', 'auto'],
      ['d', 'F4', 'auto'],
      ['e', 'F5', 'auto'],
    ]);
    expect(list[1].visual).toBe('Logo');
    expect(compactRefs(['F1', 'F2', 'F3', 'F5', 'F7', 'F8'])).toBe('F1–F3, F5, F7, F8');
    expect(cleanTextileFrame({ ref: ' f 07 ', visual: '  Logo IKEA  ' })).toEqual({ ref: 'F7', visual: 'Logo IKEA' });
    expect(cleanTextileFrame({ ref: 'cadre' })).toEqual({});
    expect(cleanTextileFrame(null)).toBeNull();
  });
});

describe('modèle avec plafond tendu et cadres textile', async () => {
  const scene = await textileScene();
  const prov = provider(scene);
  const all = subsetAll(scene.index);
  const style = { ...DEFAULT_LINE_STYLE, glassTransparent: false };
  const req = (patch: Partial<LineworkRequest> = {}, include = all): LineworkRequest => ({ modelId: scene.modelKey, subset: { include }, view: { kind: 'top', frame: 'world' }, style, ...patch });
  const ceilings = subsetEnv(scene).tags.nodesWithTag('plafond-tendu');
  const frameIds = subsetEnv(scene).tags.nodesWithTag(TEXTILE_TAG);

  it('étiquettes présentes dans la vue : plafond tendu (4), cadres textile (8)', () => {
    expect(ceilings).toHaveLength(4);
    expect(frameIds).toHaveLength(8);
    const present = tagsInSubset(subsetEnv(scene).tags, subsetScope(scene, all));
    expect(present.find((t) => t.tag === 'plafond-tendu')?.count).toBe(4);
    expect(present.find((t) => t.tag === TEXTILE_TAG)?.count).toBe(8);
  });

  it('masquer le plafond tendu : ses maillages ne sont plus dessinés, le reste ne change pas', () => {
    const base = subsetMeshes(scene, { include: all });
    const rule = tagHideRule('plafond-tendu', 'Plafond tendu');
    const hidden = subsetMeshes(scene, { include: all, hide: [rule] });
    expect(base.length - hidden.length).toBe(4);
    expect(hidden.some((id) => scene.look.inSet(id, new Set(ceilings)))).toBe(false);
    expect(hideRuleCounts(scene, { include: all, hide: [rule] }).get(rule.id)).toBe(4);
    // même pièce dans toutes les Viewbox (chemin dans la définition), puis une seule pièce
    const path = subsetEnv(scene).paths.pathOf(frameIds[0])!;
    expect(subsetMeshes(scene, { include: all, hide: [{ id: 'p', match: { modulePaths: [path] }, label: 'x' }] }).length).toBe(base.length - 4);
    expect(subsetMeshes(scene, { include: all, hide: [{ id: 'n', match: { nodeIds: [frameIds[0]] }, label: 'x' }] }).length).toBe(base.length - 1);
  });

  it('clé de cache : inchangée sans élément masqué ni coupe ; différente avec', async () => {
    const plain = await prov.cacheKey(req());
    expect(await prov.cacheKey(req({ subset: { include: all, hide: [] } }))).toBe(plain);
    expect(await prov.cacheKey(req({ subset: { include: all, hide: [tagHideRule('plafond-tendu', 'P')] } }))).not.toBe(plain);
    expect(await prov.cacheKey(req({ floorCut: 1200 }))).not.toBe(plain);
  });

  it('vue de dessus sans toit : le plafond tendu cache le plancher ; masqué, il disparaît des traits', async () => {
    const lv = subsetForLevel(scene.index, 0);
    // le modèle synthétique dessine sa toiture dans la structure : on la masque comme le TOIT d'un vrai modèle
    const noRoof = await prov.getLinework(req({ subset: { include: lv, hideCategories: ['STRUCTURE'] } }, lv));
    expect(ceilings.some((c) => drawn(scene, sourcesOf(noRoof), c))).toBe(true);
    const lw = await prov.getLinework(req({ subset: { include: lv, hideCategories: ['STRUCTURE'], hide: [tagHideRule('plafond-tendu', 'Plafond tendu')] } }, lv));
    expect(ceilings.some((c) => drawn(scene, sourcesOf(lw), c))).toBe(false);
  });

  it('vue du sol : coupe à 1,20 m au-dessus du plancher — plafond, toiture et bandeau retirés, cadre haut coupé', async () => {
    const one = subsetForModule(scene.index, 'VBX-02');
    const lw = await prov.getLinework(req({ floorCut: FLOOR_CUT_DEFAULT }, one));
    const src = sourcesOf(lw);
    const id = (name: string) => named(scene, name).find((n) => scene.look.inSet(n.id, new Set(one)))!.id;
    expect(drawn(scene, src, id('black_cieling'))).toBe(false);
    expect(drawn(scene, src, id('Cadre textile bandeau'))).toBe(false);
    // le grand cadre (400 → 2 400 mm) traverse la coupe : coupé, il reste (trait de coupe)
    expect(drawn(scene, src, id('SEG frame 2000'))).toBe(true);
    const cut = lw.layers.find((l) => l.key === 'cut');
    expect(cut?.polylines.length).toBeGreaterThan(0);
    // le dessus du cadre (toiture au-dessus de 2 700 mm) n'est plus dessiné : seuls les montants coupés restent
    expect(lw.boundsMm.maxX - lw.boundsMm.minX).toBeGreaterThan(5800);
  });

  it('cadres mesurés dans le repère de leur Viewbox : un repère par cadre, 2 tailles (grand cadre, bandeau), vues de face', () => {
    const frames = measureFrames(scene);
    expect(frames).toHaveLength(8);
    const types = groupFrames(frames);
    // tour de chaque box : bandeau (face avant) puis grand cadre (côté gauche) ; VBX-01, VBX-02…
    expect(types.map((t) => [t.ref, Math.round(t.w), Math.round(t.h), Math.round(t.t), t.nodeIds.length])).toEqual([
      ['F2, F4, F6, F8', 2000, 2000, 40, 4],
      ['F1, F3, F5, F7', 2300, 350, 40, 4],
    ]);
    // grand cadre sur le grand côté −Y : vue « gauche » de sa Viewbox ; bandeau sur le petit côté +X (face avant)
    expect(new Set(types[0].locations.map((l) => l.split(' ')[1]))).toEqual(new Set(['Left']));
    expect(new Set(types[1].locations.map((l) => l.split(' ')[1]))).toEqual(new Set(['Front']));
    expect(types[0].rep.view).toMatchObject({ kind: 'left' });
    // VBX-03 est tournée : même côté relatif
    expect(types[0].locations).toContain('VBX-03 Left');
  });

  it('planche de détail : le cadre seul, de face, coté largeur × hauteur hors tout', async () => {
    const [f1] = groupFrames(measureFrames(scene));
    const sheets = frameSheets([f1], { paper: 'A1', modelKey: scene.modelKey, style: DEFAULT_LINE_STYLE, title: 'T' });
    const vp = sheets[0].items.find((i): i is ViewportItem => i.type === 'viewport')!;
    expect(vp.frameView).toEqual({ nodeId: f1.rep.nodeId, ref: 'F2, F4, F6, F8' });
    expect(vp.label).toBe('F2, F4, F6, F8 — 2 000 × 2 000 mm');
    // nomenclature : une ligne par cadre
    const texts = sheets[0].items.filter((i): i is TextItem => i.type === 'text').map((i) => i.text);
    expect(['F2', 'F4', 'F6', 'F8'].every((r) => texts.includes(r))).toBe(true);
    const lw = await prov.getLinework(vp.request);
    expect(lw.boundsMm.maxX - lw.boundsMm.minX).toBeCloseTo(2000, 0);
    expect(lw.boundsMm.maxY - lw.boundsMm.minY).toBeCloseTo(2000, 0);
    const r = autoDimensionViewport(vp, lw, lw.meta.basis, scene);
    expect(r.dims.map((d) => d.orient).sort()).toEqual(['h', 'v']);
  });

  it('repères F3 / F4 (VBX-02) sur une élévation, cotes des cadres en plus des cotes automatiques', async () => {
    const types = groupFrames(measureFrames(scene));
    const refs = frameRefs(types);
    const one = subsetForModule(scene.index, 'VBX-02');
    const vp: ViewportItem = { id: 'v1', type: 'viewport', rect: { x: 20, y: 60, w: 680, h: 300 }, request: { ...req({}, one), view: { kind: 'left', frame: { moduleId: 'VBX-02' } } }, scale: 25, showLabel: false, renderStyle: 'trait' };
    const lw = await prov.getLinework(vp.request);
    const inView = framesInView(scene, lw);
    expect([...inView].map((id) => refs.get(id)).sort()).toEqual(['F3', 'F4']);
    const labels = frameLabels(scene, vp, lw, lw.meta.basis, refs, 1);
    expect(labels.map((l) => l.text).sort()).toEqual(['F3', 'F4']);
    expect(labels.every((l) => l.viewportId === 'v1' && l.auto === 'frame' && !!l.anchor3d)).toBe(true);
    const plain = autoDimensionViewport(vp, lw, lw.meta.basis, scene);
    const withFrames = autoDimensionViewport({ ...vp, dimFrames: true }, lw, lw.meta.basis, scene);
    expect(withFrames.dims.length).toBeGreaterThan(plain.dims.length);
    expect(textileFrameOf(scene, frameIds[0])).toBe(frameIds[0]);
  });

  it('assistant : planches « Vue du sol » par niveau et « Cadres textile » (nomenclature + détails), cadres masqués ailleurs', () => {
    const types = groupFrames(measureFrames(scene));
    const { set, dimensioned } = generateDrawingSet(
      { modules: scene.index.modules.map((m) => m.id), kinds: ['longSides', 'floorPlan', 'frames'], paper: 'A1', style: DEFAULT_LINE_STYLE, title: 'T', frames: types, hideFrames: true },
      { index: scene.index, projectId: 'p', modelVersionId: null, modelKey: scene.modelKey, titleBlock: emptyTitleBlock() },
    );
    const floor = set.sheets.flatMap((s) => s.items).filter((i): i is ViewportItem => i.type === 'viewport' && i.request.floorCut === FLOOR_CUT_DEFAULT);
    expect(floor).toHaveLength(scene.index.levels.length);
    const fr = set.sheets.filter((s) => s.role === 'frames');
    expect(fr.length).toBeGreaterThanOrEqual(1);
    expect(fr[0].items.some((i) => i.type === 'text' && (i as TextItem).text === 'TEXTILE FRAME SCHEDULE')).toBe(true);
    const details = fr.flatMap((s) => s.items).filter((i): i is ViewportItem => i.type === 'viewport');
    expect(details.map((v) => v.frameView?.ref)).toEqual(['F2, F4, F6, F8', 'F1, F3, F5, F7']);
    expect(details.every((v) => dimensioned.includes(v.id) && !v.pendingAutoDims && !v.request.subset.hide)).toBe(true);
    // les autres vues masquent les cadres
    for (const v of standardViewports(set)) expect(v.request.subset.hide?.[0].match).toEqual({ viewTags: [TEXTILE_TAG] });
    for (const s of set.sheets) expect(s.number).toMatch(/^A0\.\d+$/);
  });

  it('masquer sur tout le jeu : toutes les vues standard, pas les détails des cadres ni l’implantation', () => {
    const types = groupFrames(measureFrames(scene));
    const { set } = generateDrawingSet(
      { modules: scene.index.modules.map((m) => m.id), kinds: ['longSides', 'implantation', 'frames'], paper: 'A1', style: DEFAULT_LINE_STYLE, title: 'T', frames: types },
      { index: scene.index, projectId: 'p', modelVersionId: null, modelKey: scene.modelKey, titleBlock: emptyTitleBlock() },
    );
    const t = { kind: 'rule' as const, rule: tagHideRule(TEXTILE_TAG, 'Cadres') };
    expect(hiddenCount(set, t)).toEqual({ hidden: 0, total: 2 });
    for (const vp of standardViewports(set)) vp.lineworkKey = 'k';
    expect(setHidden(set, t, true)).toBe(2);
    expect(hiddenCount(set, t)).toEqual({ hidden: 2, total: 2 });
    expect(standardViewports(set).filter((v) => !v.request.subset.onlyCategories).every((v) => !v.lineworkKey)).toBe(true);
    expect(set.sheets.flatMap((s) => s.items).filter((i): i is ViewportItem => i.type === 'viewport' && !!i.frameView).every((v) => !v.request.subset.hide)).toBe(true);
    expect(setHidden(set, t, false)).toBe(2);
    expect(standardViewports(set).every((v) => !('hide' in v.request.subset))).toBe(true);
    // catégories : même mécanique
    expect(withHidden({ include: [] }, { kind: 'category', key: 'TOIT' }, true)).toEqual({ include: [], hideCategories: ['TOIT'] });
    expect(withHidden({ include: [], hideCategories: ['TOIT'] }, { kind: 'category', key: 'TOIT' }, false)).toEqual({ include: [] });
  });
});

describe('cotes automatiques des cadres', () => {
  const mod = { x0: 0, x1: 5900, y0: 0, y1: 3000 };
  it('élévation : chaîne des bords des cadres en haut (avant le total), hauteurs à droite ; cadres sur la tranche ignorés', () => {
    const dims = planDimensions({ purpose: 'elevation', bounds: { minX: 0, minY: 0, maxX: 5900, maxY: 3000 }, modules: [mod], doors: [], feet: [], frames: [{ x0: 500, x1: 2500, y0: 400, y1: 2400 }, { x0: 5900, x1: 5940, y0: 2350, y1: 2700 }] });
    const top = dims.filter((d) => d.side === 'top');
    expect(top[0].points.map((p) => p[0])).toEqual([0, 500, 2500, 5900]);
    expect(top[1].points.map((p) => p[0])).toEqual([0, 5900]);
    const right = dims.find((d) => d.side === 'right')!;
    expect(right.points.map((p) => p[1])).toEqual([0, 400, 2350, 2400, 2700, 3000]);
  });
  it('objet seul : largeur en bas, hauteur à gauche', () => {
    const dims = planDimensions({ purpose: 'object', bounds: { minX: 10, minY: 0, maxX: 2010, maxY: 650 }, modules: [], doors: [], feet: [] });
    expect(dims.map((d) => [d.side, d.points.length])).toEqual([
      ['bottom', 2],
      ['left', 2],
    ]);
  });
  it('sans cadres : cotes inchangées', () => {
    const inp = { purpose: 'elevation' as const, bounds: { minX: 0, minY: 0, maxX: 5900, maxY: 3000 }, modules: [mod], doors: [], feet: [] };
    expect(planDimensions({ ...inp, frames: [] })).toEqual(planDimensions(inp));
  });
});

describe('repères et visuels saisis dans SketchUp (manifest, extension 1.4)', async () => {
  const dae = makeSketchupDae({ twoSided: false, textile: true });
  const manifest = {
    schema: 'viewbox-manifest/1',
    units: 'mm',
    upAxis: 'Z',
    textileSchemaVersion: 1,
    modules: [{ id: 'VBX-01', accessories: [{ name: 'SEG frame 2000', textileFrame: { ref: 'F12', visual: 'Logo IKEA bleu' } }] }],
    common: [],
  };
  const zip = zipSync({ 'export/m.dae': strToU8(dae), 'export/manifest.json': strToU8(JSON.stringify(manifest)) });
  const res = await ingest({ fileName: 'm.zip', data: zip.buffer as ArrayBuffer, sha256: 'tm', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'tm');

  it('le cadre de VBX-01 garde F12 et son visuel ; les autres sont numérotés autour', () => {
    const marked = scene.index.nodes.filter((n) => n.textileFrame);
    expect(marked.map((n) => [n.moduleId, n.textileFrame])).toEqual([['VBX-01', { ref: 'F12', visual: 'Logo IKEA bleu' }]]);
    expect(subsetEnv(scene).tags.ownTag(marked[0].id)).toMatchObject({ tag: TEXTILE_TAG, source: 'sketchup' });
    const frames = framesOf(groupFrames(measureFrames(scene)));
    const seg1 = frames.find((x) => x.nodeId === marked[0].id)!;
    expect([seg1.ref, seg1.refSource, seg1.visual]).toEqual(['F12', 'sketchup', 'Logo IKEA bleu']);
    expect(frames.map((x) => x.ref)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F12']);
  });
});

describe('détail toiture / plancher : couches coupées cotées', async () => {
  const scene = await textileScene();
  const deps = { scene, runner: createInlineRunner(), glassTest: makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial), noCache: true };
  const preset = (key: string) => specFromPreset(VIEW_PRESETS.find((p) => p.key === key)!, key, '2026-11-02');

  it('toiture : plafond tendu 10 mm, vide technique 90 mm, toiture 100 mm (mesurés), un bloc par type de box', async () => {
    const spec = preset('roof-detail');
    expect(spec.style.layerDims).toBe('roof');
    const res = await computeSpecialView(spec, deps, DEFAULT_LINE_STYLE);
    // 4 Viewbox du même type : les identiques ne sont dessinées qu'une fois (une porte posée à côté d'une seule en fait 2)
    expect(res.blocks.length).toBeLessThan(scene.index.modules.length);
    const b = res.blocks[0];
    const stack = layerStack(b.lw, scene, 'roof')!;
    expect(stack.layers.map((l) => [l.kind, Math.round(l.y1 - l.y0)])).toEqual([
      ['part', 100],
      ['gap', 90],
      ['part', 10],
    ]);
    expect(stack.layers.map((l) => l.name)).toEqual(['STRUCTURE cadre', 'Vide technique', 'Plafond tendu']);
    // sur une planche (1:10) : chaîne des couches + total à droite, largeur en bas, un repère par couche
    const [sheet] = customViewSheets(
      spec,
      [{ key: b.key, title: b.title, modules: b.modules, lw: b.lw, basis: b.basis, view: b.view }],
      { paper: 'A1', mode: 'one', perSheet: 1, scale: 10, blocks: [], subtitle: '', style: DEFAULT_LINE_STYLE, modelKey: scene.modelKey, dims: true },
      { include: () => [], autoDim: (vp, blk, min) => autoDimensionViewport(vp, blk.lw, blk.basis, scene, min) },
    );
    const vp = sheet.items.find((i): i is ViewportItem => i.type === 'viewport')!;
    expect(vp.layerDims).toBe('roof');
    const dims = sheet.items.filter((i): i is DimensionItem => i.type === 'dimension');
    expect(dims.map((d) => [d.orient, d.anchors3d.length])).toEqual([
      ['v', 4],
      ['v', 2],
      ['h', 2],
    ]);
    const labels = sheet.items.filter((i): i is LabelItem => i.type === 'label');
    expect(labels.map((l) => l.text)).toEqual(['STRUCTURE cadre — 100 mm', 'Vide technique — 90 mm', 'Plafond tendu — 10 mm']);
    expect(labels.every((l) => l.viewportId === vp.id && l.auto === 'layer')).toBe(true);
    // repères en colonne à gauche du dessin, au moins 6 mm d'écart
    for (let i = 1; i < labels.length; i++) expect(labels[i].textPos.y - labels[i - 1].textPos.y).toBeGreaterThanOrEqual(5.9);
  });

  it('plancher : couches sous le recadrage (pas les vitres coupées par le recadrage)', async () => {
    const res = await computeSpecialView(preset('floor-detail'), deps, DEFAULT_LINE_STYLE);
    const stack = layerStack(res.blocks[0].lw, scene, 'floor')!;
    // dalle du plancher de la fixture : 150 mm
    expect(stack.layers.map((l) => Math.round(l.y1 - l.y0))).toContain(150);
    expect(stack.layers.every((l) => !/VITRE|Vitre/.test(l.name))).toBe(true);
  });

  it('repères écartés sans changer l’ordre', () => {
    expect(spreadLabels([10, 11, 12], 6)).toEqual([5, 11, 17]);
    expect(spreadLabels([0, 50], 6)).toEqual([0, 50]);
  });
});
