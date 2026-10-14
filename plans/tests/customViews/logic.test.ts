// VS2 — vues spéciales, logique pure : règles de visibilité (ET / OU, ordre, show sous un parent masqué, isolate,
// règle sans effet), étiquettes, chemins relatifs, références de hauteur, coupes par Viewbox, caméras (dessous,
// plafond réfléchi, rotation, miroir), placement séparé, Viewbox identiques, préréglages, lecture tolérante.
import { describe, expect, it } from 'vitest';
import { makeLookup } from '../../src/core/subset';
import type { Vec3 } from '../../src/core/views';
import { projectPoint, viewBasis } from '../../src/core/views';
import { makePathIndex } from '../../src/core/customViews/paths';
import { cleanViewTags, makeTagResolver } from '../../src/core/customViews/tags';
import { meshesByState, resolveVisibility, scopeModules } from '../../src/core/customViews/visibility';
import type { VisibilityContext } from '../../src/core/customViews/visibility';
import { describeRef, moduleRefs } from '../../src/core/customViews/refs';
import { resolveCuts } from '../../src/core/customViews/cuts';
import type { ClipPlane } from '../../src/core/customViews/cuts';
import { apply2D, cameraView } from '../../src/core/customViews/camera';
import { arrangeBlocks, clusterRanks } from '../../src/core/customViews/layout';
import type { LayoutBlock } from '../../src/core/customViews/layout';
import { groupIdentical, moduleSignature } from '../../src/core/customViews/identical';
import { VIEW_PRESETS, cleanSharedPresetRecords, isPortable, presetFromRecord, presetRecordFromSpec, specFromPreset } from '../../src/core/customViews/presets';
import { cleanCustomView, cleanCustomViews } from '../../src/core/customViews/clean';
import type { CustomViewSpec, VisibilityRule } from '../../src/core/customViews/types';
import { DEFAULT_CAMERA, DEFAULT_LAYOUT, DEFAULT_STYLE } from '../../src/core/customViews/types';
import { fakeScene, grid2x3 } from './helpers';

function ctxOf(s: ReturnType<typeof fakeScene>, mem = cleanViewTags([])): VisibilityContext {
  return { index: s.index, look: makeLookup(s.index), paths: makePathIndex(s.index), tags: makeTagResolver(s.index, mem) };
}

const spec = (visibility: VisibilityRule[], scope: CustomViewSpec['scope'] = { modules: 'all', common: true }): CustomViewSpec => ({
  v: 1,
  id: 'v',
  name: 'V',
  source: 'user',
  createdAt: '',
  updatedAt: '',
  scope,
  camera: { ...DEFAULT_CAMERA },
  cuts: [],
  visibility,
  layout: { ...DEFAULT_LAYOUT },
  style: { ...DEFAULT_STYLE },
  output: 'vector',
});
const rule = (id: string, op: VisibilityRule['op'], match: VisibilityRule['match']): VisibilityRule => ({ id, op, match, label: id, source: 'click' });

/** Nœud par définition dans une Viewbox. */
function nodeOf(s: ReturnType<typeof fakeScene>, moduleId: string, def: string, k = 0): string {
  return s.index.nodes.filter((n) => n.moduleId === moduleId && n.definition === def)[k].id;
}
const meshUnder = (s: ReturnType<typeof fakeScene>, id: string) => s.index.nodes.find((n) => n.parentId === id && n.kind === 'mesh')!.id;

describe('étiquettes de vue et chemins', () => {
  it('motifs de la base : plafond tendu ≠ ses fixations, éclairage, pieds par catégorie ; la Viewbox n’a pas d’étiquette', () => {
    const s = fakeScene(grid2x3());
    const ctx = ctxOf(s);
    expect(ctx.tags.ownTag(nodeOf(s, 'VBX-01', 'black_cieling'))?.tag).toBe('plafond-tendu');
    expect(ctx.tags.ownTag(nodeOf(s, 'VBX-01', 'tension_ceiling_large'))?.tag).toBe('fixations-plafond');
    expect(ctx.tags.ownTag(nodeOf(s, 'VBX-01', 'LIght_Rail_3P'))?.tag).toBe('eclairage');
    expect(ctx.tags.ownTag(nodeOf(s, 'VBX-01', 'PIED_REGLABLE'))).toMatchObject({ tag: 'pied', source: 'category' });
    expect(ctx.tags.ownTag(s.index.modules[0].nodeId)).toBeNull();
    expect(ctx.tags.nodesWithTag('plafond-tendu')).toHaveLength(6);
  });

  it('une étiquette mémorisée par définition passe avant le motif de nom', () => {
    const s = fakeScene(grid2x3());
    const ctx = ctxOf(s, cleanViewTags([{ tag: 'Plafond tendu', label: 'Plafond tendu', match: { definition: 'tension_ceiling_large' } }, { tag: 'x', match: {} }]));
    expect(ctx.tags.ownTag(nodeOf(s, 'VBX-02', 'tension_ceiling_large'))).toMatchObject({ tag: 'plafond-tendu', source: 'memorised' });
  });

  it('même chemin relatif dans toutes les Viewbox de la même définition', () => {
    const s = fakeScene(grid2x3());
    const p = makePathIndex(s.index);
    const a = p.pathOf(nodeOf(s, 'VBX-01', 'tension_ceiling_large', 1));
    expect(a).toBe('7-962-016 VIEWBOX STANDARD M16#0/VBXM16FULL#0/tension_ceiling_large#1');
    expect(p.pathOf(nodeOf(s, 'VBX-05', 'tension_ceiling_large', 1))).toBe(a);
    expect(p.nodesAtPath(a!)).toHaveLength(6);
  });
});

describe('règles de visibilité', () => {
  it('« retirer dans toutes les Viewbox » par chemin : 6 pièces ; par étiquette : idem ; nœuds masqués avec leur sous-arbre', () => {
    const s = fakeScene(grid2x3());
    const ctx = ctxOf(s);
    const path = ctx.paths.pathOf(nodeOf(s, 'VBX-03', 'black_cieling'))!;
    const r = resolveVisibility(ctx, spec([rule('r1', 'hide', { modulePaths: [path] })]));
    expect(r.counts.get('r1')).toBe(6);
    for (const m of s.index.modules) expect(r.states.get(meshUnder(s, nodeOf(s, m.id, 'black_cieling')))).toBe('hidden');
    expect(r.states.get(meshUnder(s, nodeOf(s, 'VBX-03', 'LIght_Rail_3P')))).toBe('visible');
    const t = resolveVisibility(ctx, spec([rule('r1', 'hide', { viewTags: ['plafond-tendu'] })]));
    expect(t.counts.get('r1')).toBe(6);
    expect(meshesByState(s.index, t.states).visible.length).toBe(meshesByState(s.index, r.states).visible.length);
  });

  it('champs en ET, valeurs en OU ; la dernière règle gagne ; show sous un parent masqué', () => {
    const s = fakeScene(grid2x3());
    const ctx = ctxOf(s);
    const r = resolveVisibility(
      ctx,
      spec([
        rule('a', 'hide', { viewTags: ['plafond-tendu', 'eclairage'], moduleIds: ['VBX-01', 'VBX-02'] }),
        rule('b', 'show', { definitions: ['LIght_Rail_3P'], moduleIds: ['VBX-02'] }),
      ]),
    );
    expect(r.counts.get('a')).toBe(4);
    expect(r.states.get(meshUnder(s, nodeOf(s, 'VBX-01', 'LIght_Rail_3P')))).toBe('hidden');
    expect(r.states.get(meshUnder(s, nodeOf(s, 'VBX-02', 'LIght_Rail_3P')))).toBe('visible');
    expect(r.states.get(meshUnder(s, nodeOf(s, 'VBX-03', 'black_cieling')))).toBe('visible');
    // show sur un descendant d'une Viewbox masquée
    const inner = nodeOf(s, 'VBX-04', 'VBXM16FULL');
    const r2 = resolveVisibility(ctx, spec([rule('h', 'hide', { moduleIds: ['VBX-04'] }), rule('s', 'show', { nodeIds: [inner] })]));
    expect(r2.states.get(meshUnder(s, nodeOf(s, 'VBX-04', 'black_cieling')))).toBe('visible');
    expect(r2.states.get(meshUnder(s, nodeOf(s, 'VBX-04', '_7-632-002_Roof_module')))).toBe('hidden');
    // ordre inverse : la règle sur le parent, venue après, l'emporte
    const r3 = resolveVisibility(ctx, spec([rule('s', 'show', { nodeIds: [inner] }), rule('h', 'hide', { moduleIds: ['VBX-04'] })]));
    expect(r3.states.get(meshUnder(s, nodeOf(s, 'VBX-04', 'black_cieling')))).toBe('hidden');
  });

  it('isolate : seulement les pieds, leurs conteneurs visibles, le reste masqué ; fantôme', () => {
    const s = fakeScene(grid2x3(), { common: true });
    const ctx = ctxOf(s);
    const r = resolveVisibility(ctx, spec([rule('i', 'isolate', { viewTags: ['pied'] })]));
    const { visible } = meshesByState(s.index, r.states);
    expect(visible.length).toBe(24);
    expect(visible.every((id) => ctx.look.categoryOf(id) === 'PIED')).toBe(true);
    const g = resolveVisibility(ctx, spec([rule('g', 'ghost', { viewTags: ['facade', 'couverture'] })]));
    expect(meshesByState(s.index, g.states).ghost.length).toBe(6);
  });

  it('règle sans effet ⇒ 0 et avertissement ; périmètre (Viewbox, niveaux, communs, accessoires rattachés)', () => {
    const s = fakeScene([{ id: 'VBX-01', x: 0, z: 0 }, { id: 'VBX-02', x: 0, z: 0, level: 1 }], { wallOn: ['VBX-01'], common: true });
    const ctx = ctxOf(s);
    const r = resolveVisibility(ctx, spec([rule('z', 'hide', { definitions: ['n’existe pas'] })], { modules: 'all', levels: [0], common: false }));
    expect(r.counts.get('z')).toBe(0);
    expect(r.warnings[0].code).toBe('RULE_NO_EFFECT');
    expect(scopeModules(s.index, { modules: 'all', levels: [0], common: false })).toEqual(['VBX-01']);
    const { visible } = meshesByState(s.index, r.states);
    expect(visible.some((id) => ctx.look.categoryOf(id) === 'MUR-LEGER')).toBe(true); // mur rattaché par position
    expect(visible.some((id) => ctx.look.byId.get(id)!.moduleId === 'VBX-02')).toBe(false);
    expect(visible.some((id) => ctx.look.categoryOf(id) === 'ESCALIER')).toBe(false);
  });
});

describe('références de hauteur et coupes', () => {
  it('mesurées dans chaque Viewbox (niveau 1 compris), repli sur le type sans plafond', () => {
    const s = fakeScene([{ id: 'VBX-01', x: 0, z: 0 }, { id: 'VBX-02', x: 0, z: 0, level: 1, noCeiling: true }]);
    const ctx = ctxOf(s);
    const r1 = moduleRefs(s.index, ctx.look, ctx.tags, s.frames.get('VBX-01')!);
    expect(r1['floor-top'].local).toBe(238);
    expect(r1['roof-bottom']).toMatchObject({ local: 2750, source: 'measured' });
    expect(r1.ceiling.local).toBe(2748);
    expect(r1.ground.local).toBe(-100);
    expect(describeRef('roof-bottom', r1['roof-bottom'])).toBe('sous la toiture = 2 750 mm (mesuré)');
    const r2 = moduleRefs(s.index, ctx.look, ctx.tags, s.frames.get('VBX-02')!);
    expect(r2['roof-bottom'].y).toBe(3080 + 2750);
    expect(r2.ceiling.y).toBe(r2['roof-bottom'].y); // pas de plafond : dessous de la toiture
  });

  it('coupe horizontale « module » : à la hauteur de chaque Viewbox ; communs à la Viewbox la plus proche', () => {
    const s = fakeScene([{ id: 'VBX-01', x: 0, z: 0 }, { id: 'VBX-02', x: 0, z: 0, level: 1 }], { common: true });
    const ctx = ctxOf(s);
    const refs = new Map(['VBX-01', 'VBX-02'].map((m) => [m, moduleRefs(s.index, ctx.look, ctx.tags, s.frames.get(m)!)]));
    const meshes = s.index.nodes.filter((n) => n.kind === 'mesh').map((n) => n.id);
    const res = resolveCuts(
      { index: s.index, look: ctx.look, frames: s.frames, refs, modules: ['VBX-01', 'VBX-02'] },
      { cuts: [{ id: 'c', frame: 'module', axis: 'horizontal', ref: { kind: 'level', ref: 'roof-bottom' }, offset: -200, keep: 'positive' }] },
      meshes,
    );
    const planeOf = (m: string) => res.byNode.get(meshUnder(s, nodeOf(s, m, 'black_cieling')))![0];
    expect(planeOf('VBX-01')).toMatchObject({ n: [0, 1, 0], d: 2550 });
    expect(planeOf('VBX-02').d).toBe(3080 + 2550);
    const stair = s.index.nodes.find((n) => n.kind === 'mesh' && n.assignment === 'common')!.id;
    expect(res.byNode.get(stair)![0].d).toBe(2550);
  });

  it('coupe longitudinale au milieu d’une Viewbox tournée + profondeur ; boîte de coupe « entrer dans VBX-02 »', () => {
    const s = fakeScene([{ id: 'VBX-01', x: 0, z: 0, rot: 90 }, { id: 'VBX-02', x: 5000, z: 0 }]);
    const ctx = ctxOf(s);
    const refs = new Map(['VBX-01', 'VBX-02'].map((m) => [m, moduleRefs(s.index, ctx.look, ctx.tags, s.frames.get(m)!)]));
    const meshes = s.index.nodes.filter((n) => n.kind === 'mesh').map((n) => n.id);
    const c = { index: s.index, look: ctx.look, frames: s.frames, refs, modules: ['VBX-01', 'VBX-02'] };
    const res = resolveCuts(c, { cuts: [{ id: 'a', label: 'A', frame: 'module', axis: 'long', ref: { kind: 'module', ref: 'mid' }, offset: 0, keep: 'negative', depth: 500 }] }, meshes);
    const p1 = res.byNode.get(meshUnder(s, nodeOf(s, 'VBX-01', 'black_cieling')))!;
    expect(p1).toHaveLength(2);
    // VBX-01 tournée de 90° : petit axe = −X monde, milieu à x = −1250
    const f = s.frames.get('VBX-01')!;
    expect(f.yAxis[0]).toBeCloseTo(-1);
    const keepPoint = (pl: ClipPlane[], p: Vec3) => pl.every((q) => q.n[0] * p[0] + q.n[1] * p[1] + q.n[2] * p[2] >= q.d - 1e-9);
    expect(keepPoint(p1, [-1000, 1000, -3000])).toBe(true); // côté gardé (local y < 1250)
    expect(keepPoint(p1, [-1500, 1000, -3000])).toBe(false);
    expect(keepPoint(p1, [-400, 1000, -3000])).toBe(false); // au-delà de la profondeur 500
    const box = resolveCuts(c, { cuts: [], box: { frame: 'module', moduleId: 'VBX-02', min: [0, 0, 0], max: [5900, 2500, 3080] } }, meshes);
    const any = box.byNode.get(meshes[0])!;
    expect(any).toHaveLength(6);
    expect(keepPoint(any, [7000, 1000, -1000])).toBe(true); // local y = −Z monde
    expect(keepPoint(any, [1000, 1000, -1000])).toBe(false);
  });
});

describe('caméras', () => {
  // repère asymétrique : coin nord-est d'un plan (x grand, nord = −Z three)
  const marker: Vec3 = [5000, 2700, -2000];
  const origin: Vec3 = [0, 2700, 0];
  const rel = (b: ReturnType<typeof cameraView>['basis'], p: Vec3) => {
    const a = projectPoint(b, p);
    const o = projectPoint(b, origin);
    return [Math.round(a.x - o.x), Math.round(a.y - o.y)];
  };

  it('plan de plafond réfléchi = même place que la vue de dessus ; vraie vue de dessous = miroir', () => {
    const frames = new Map();
    const top = cameraView({ ...DEFAULT_CAMERA, dir: 'top' }, frames);
    const rcp = cameraView({ ...DEFAULT_CAMERA, dir: 'bottom', reflected: true }, frames);
    const under = cameraView({ ...DEFAULT_CAMERA, dir: 'bottom' }, frames);
    expect(rel(top.basis, marker)).toEqual([5000, 2000]);
    expect(rel(rcp.basis, marker)).toEqual([5000, 2000]);
    expect(rel(under.basis, marker)).toEqual([-5000, 2000]);
    expect(under.subtitle).toBe('Vue de dessous (miroir du plan)');
    expect(rcp.title).toBe('Plan de plafond réfléchi');
    // la vue calculée reste la vue de dessous existante (même cache) ; la transformation est un miroir
    expect(rcp.view).toEqual({ kind: 'bottom', frame: 'world' });
    expect(apply2D(rcp.transform, -5000, 2000)).toEqual([5000, 2000]);
  });

  it('repère Viewbox : plafond réfléchi superposé au dessus de la Viewbox, même tournée', () => {
    const s = fakeScene([{ id: 'VBX-01', x: 1000, z: -300, rot: 90 }]);
    const f = s.frames.get('VBX-01')!;
    const p: Vec3 = [f.origin[0] + f.xAxis[0] * 5000 + f.yAxis[0] * 400, 2700, f.origin[2] + f.xAxis[2] * 5000 + f.yAxis[2] * 400];
    const top = cameraView({ ...DEFAULT_CAMERA, frame: 'module', dir: 'top' }, s.frames, 'VBX-01');
    const rcp = cameraView({ ...DEFAULT_CAMERA, frame: 'module', dir: 'bottom', reflected: true }, s.frames, 'VBX-01');
    const under = cameraView({ ...DEFAULT_CAMERA, frame: 'module', dir: 'bottom' }, s.frames, 'VBX-01');
    const proj = (b: typeof top.basis) => {
      const a = projectPoint(b, p);
      const o = projectPoint(b, f.origin);
      return [Math.round(a.x - o.x), Math.round(a.y - o.y)];
    };
    expect(proj(rcp.basis)).toEqual(proj(top.basis));
    expect(proj(under.basis)).toEqual([proj(top.basis)[0], -proj(top.basis)[1]]);
  });

  it('rotation horaire et miroir après calcul ; iso du coin avant gauche', () => {
    const frames = new Map();
    const r90 = cameraView({ ...DEFAULT_CAMERA, dir: 'top', rotate: 90 }, frames);
    expect(rel(r90.basis, marker)).toEqual([2000, -5000]);
    const m = cameraView({ ...DEFAULT_CAMERA, dir: 'top', mirror: true }, frames);
    expect(rel(m.basis, marker)).toEqual([-5000, 2000]);
    const iso = cameraView({ ...DEFAULT_CAMERA, dir: 'iso', isoCorner: 'fl' }, frames);
    expect(iso.view.kind).toBe('custom');
    if (iso.view.kind === 'custom') expect(iso.view.direction.map((v) => Math.round(v * 1000))).toEqual([577, -577, -577]);
    // une vue standard reste identique à core/views (mêmes axes écran)
    expect(cameraView({ ...DEFAULT_CAMERA, dir: 'front' }, frames).basis).toEqual(viewBasis({ kind: 'front', frame: 'world' }));
  });
});

describe('disposition et Viewbox identiques', () => {
  const block = (key: string, x: number, y: number, level = 0, w = 2500, h = 5900): LayoutBlock => ({
    key,
    modules: [key],
    level,
    bounds: { minX: x, minY: y, maxX: x + w, maxY: y + h },
    anchor: [x + w / 2, y + h / 2],
  });

  it('séparées en gardant rangées / colonnes : 2 × 3 Viewbox jointives écartées de 1 m exactement', () => {
    const blocks = [0, 1].flatMap((r) => [0, 1, 2].map((c) => block(`R${r}C${c}`, c * 2500, r * 5900)));
    const moves = arrangeBlocks(blocks, { ...DEFAULT_LAYOUT, mode: 'exploded' }, { plan: true });
    const placed = blocks.map((b) => ({ k: b.key, x: b.bounds.minX + moves.get(b.key)![0], y: b.bounds.minY + moves.get(b.key)![1] }));
    expect(placed.find((p) => p.k === 'R0C1')!.x - (placed.find((p) => p.k === 'R0C0')!.x + 2500)).toBe(1000);
    expect(placed.find((p) => p.k === 'R1C2')!.y - (placed.find((p) => p.k === 'R0C2')!.y + 5900)).toBe(1000);
    expect(clusterRanks([0, 250, 2500, 2700])).toEqual([0, 0, 1, 1]);
  });

  it('deux niveaux en plan : un bloc par niveau, côte à côte ; grille compacte', () => {
    const blocks = [block('A', 0, 0, 0), block('B', 2500, 0, 0), block('C', 0, 0, 1)];
    const moves = arrangeBlocks(blocks, { ...DEFAULT_LAYOUT, mode: 'exploded' }, { plan: true });
    const cx = blocks[2].bounds.minX + moves.get('C')![0];
    const bMax = blocks[1].bounds.maxX + moves.get('B')![0];
    expect(cx - bMax).toBe(2000);
    const grid = arrangeBlocks(blocks, { ...DEFAULT_LAYOUT, mode: 'exploded', keepArrangement: false, columns: 2, levels: 'filter' }, { plan: true });
    expect(new Set([...grid.values()].map(([x, y]) => `${x},${y}`)).size).toBe(3);
  });

  it('identiques regroupées, différentes séparées (plafond retiré dans une seule, mur rattaché, définition)', () => {
    const s = fakeScene(
      [
        { id: 'VBX-01', x: 0, z: 0 },
        { id: 'VBX-02', x: 0, z: -2500 },
        { id: 'VBX-03', x: 0, z: -5000, noCeiling: true },
        { id: 'VBX-04', x: 0, z: -7500, definition: 'AUTRE' },
        { id: 'VBX-05', x: 0, z: -10000 },
      ],
      { wallOn: ['VBX-05'] },
    );
    const ctx = ctxOf(s);
    const { states } = resolveVisibility(ctx, spec([]));
    const sig = (id: string) => moduleSignature({ index: s.index, look: ctx.look, paths: ctx.paths, frames: s.frames, states, planes: new Map() }, id);
    expect(groupIdentical(['VBX-05', 'VBX-01', 'VBX-02', 'VBX-03', 'VBX-04'], sig)).toEqual([['VBX-01', 'VBX-02'], ['VBX-03'], ['VBX-04'], ['VBX-05']]);
    // une règle sur une seule Viewbox la distingue
    const st2 = resolveVisibility(ctx, spec([rule('h', 'hide', { nodeIds: [nodeOf(s, 'VBX-02', 'LIght_Rail_3P')] })])).states;
    const sig2 = (id: string) => moduleSignature({ index: s.index, look: ctx.look, paths: ctx.paths, frames: s.frames, states: st2, planes: new Map() }, id);
    expect(groupIdentical(['VBX-01', 'VBX-02'], sig2)).toEqual([['VBX-01'], ['VBX-02']]);
  });
});

describe('préréglages et lecture tolérante', () => {
  it('préréglages portables, sans identifiant de nœud ; options ajoutées', () => {
    expect(VIEW_PRESETS.map((p) => p.key)).toEqual(['roof-under-no-ceiling', 'roof-under', 'box-under', 'plan-cut-1200', 'section-long', 'section-short', 'structure-only', 'feet-layout']);
    for (const p of VIEW_PRESETS) {
      const sp = specFromPreset(p, 'id', 'now');
      expect(isPortable(sp)).toBe(true);
      expect(cleanCustomView(sp)).toEqual(sp); // déjà propre
    }
    const roof = VIEW_PRESETS[0];
    expect(roof.spec.camera).toMatchObject({ dir: 'bottom' });
    expect(roof.spec.camera.reflected).toBeUndefined(); // vraie vue de dessous (réponse d'Amaury, VS0)
    expect(specFromPreset(roof, 'x', 'n', ['lights']).visibility.map((r) => r.match.viewTags![0])).toEqual(['plafond-tendu', 'eclairage']);
  });

  it('coupes A-A / B-B : l’observateur est du côté retiré (la partie gardée est derrière le plan)', () => {
    const s = fakeScene([{ id: 'VBX-01', x: 0, z: 0, rot: 30 }]);
    const ctx = ctxOf(s);
    const refs = new Map([['VBX-01', moduleRefs(s.index, ctx.look, ctx.tags, s.frames.get('VBX-01')!)]]);
    for (const key of ['section-long', 'section-short']) {
      const sp = specFromPreset(VIEW_PRESETS.find((p) => p.key === key)!, 'x', 'n');
      const cam = cameraView(sp.camera, s.frames, 'VBX-01');
      const pl = resolveCuts({ index: s.index, look: ctx.look, frames: s.frames, refs, modules: ['VBX-01'] }, sp, s.index.nodes.filter((n) => n.kind === 'mesh').map((n) => n.id));
      const n = [...pl.byNode.values()][0][0].n;
      const t = cam.basis.toward;
      // normale gardée opposée à « vers l'observateur », et plan vu de face
      expect(n[0] * t[0] + n[1] * t[1] + n[2] * t[2]).toBeCloseTo(-1, 6);
    }
  });

  it('champ inconnu ignoré, valeurs hors bornes ramenées, entrées illisibles écartées, doublons écartés', () => {
    const out = cleanCustomViews([
      null,
      { id: 'a', name: 'A', futur: 1, camera: { dir: 'diagonale', rotate: 45, mirror: 'oui' }, cuts: [{ axis: 'long', ref: { kind: 'module', ref: 'mid' } }, { axis: 'custom' }, ...Array(8).fill({ axis: 'horizontal' })], visibility: [{ op: 'hide', match: {} }, { op: 'zap', match: { viewTags: ['plafond-tendu', 3] } }], layout: { gap: -5, columns: 0 }, style: { cutLine: 9 } },
      { id: 'a', name: 'doublon' },
      { name: 'sans id' },
      { id: 'b' },
    ]);
    expect(out.map((v) => v.id)).toEqual(['a', 'b']);
    const a = out[0];
    expect(a.camera).toEqual({ frame: 'world', dir: 'top', rotate: 0, mirror: false });
    expect(a.cuts).toHaveLength(6);
    expect(a.cuts[0]).toMatchObject({ frame: 'module', axis: 'long', ref: { kind: 'module', ref: 'mid' }, offset: 0, keep: 'positive' });
    expect(a.visibility).toEqual([{ id: 'rule-2', op: 'hide', match: { viewTags: ['plafond-tendu'] }, label: 'Règle', source: 'click' }]);
    expect(a.layout.gap).toBe(0);
    expect(a.layout.columns).toBeUndefined();
    expect(a.style.cutLine).toBe(2);
    expect(out[1]).toMatchObject({ name: 'Vue spéciale', scope: { modules: 'all', common: true }, layout: DEFAULT_LAYOUT, style: DEFAULT_STYLE, output: 'vector' });
    expect(cleanCustomViews('rien')).toEqual([]);
  });
});

describe('mémoire entre projets (VS7)', () => {
  it('préréglage partagé : clés portables seulement, relu tel quel', () => {
    const s = fakeScene(grid2x3());
    const ctx = ctxOf(s);
    const one = s.index.nodes.find((n) => n.definition === 'LIght_Rail_3P')!.id;
    const base = specFromPreset(VIEW_PRESETS[0], 'v', 'n');
    const sp = { ...base, visibility: [...base.visibility, rule('one', 'hide', { nodeIds: [one] })], box: { frame: 'module' as const, moduleId: 'VBX-01', min: [0, 0, 0] as Vec3, max: [1, 1, 1] as Vec3 } };
    const { record, dropped } = presetRecordFromSpec(sp, 'Mon dessous', 'sans plafond', 'Amaury', '2026-10-14');
    expect(dropped).toEqual(['one']);
    expect(record.key).toBe('shared-mon-dessous');
    expect(JSON.stringify(record.spec)).not.toContain(one);
    expect(JSON.stringify(record.spec)).not.toContain('VBX-01');
    const back = cleanSharedPresetRecords([record, { key: 'x' }, record, null]);
    expect(back).toHaveLength(1);
    const p = presetFromRecord(back[0], (x) => cleanCustomView(x))!;
    const again = specFromPreset(p, 'w', 'n');
    expect(again.visibility.map((r) => r.match.viewTags?.[0])).toEqual(['plafond-tendu']);
    expect(resolveVisibility(ctx, again).counts.get(again.visibility[0].id)).toBe(6);
  });

  it('étiquette mémorisée par définition : reconnue dans un autre projet ; motif accentué normalisé', () => {
    const other = fakeScene([{ id: 'VBX-01', x: 0, z: 0 }]);
    const mem = cleanViewTags([{ tag: 'Écran LED', label: 'Écran LED', match: { definition: 'LIght_Rail_3P' } }]);
    expect(mem[0].tag).toBe('ecran-led');
    const ctx = ctxOf(other, mem);
    const rail = other.index.nodes.find((n) => n.definition === 'LIght_Rail_3P')!.id;
    expect(ctx.tags.ownTag(rail)).toMatchObject({ tag: 'ecran-led', source: 'memorised' });
  });
});
