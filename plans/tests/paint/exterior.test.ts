// « Peindre les côtés extérieurs » (A. Pinchart 03.11.2026) : côtés collés à une autre box jamais peints, côtés
// extérieurs peints là où on les voit de dehors ; une règle par couleur, repères sur les vues de chaque Viewbox.
import { describe, expect, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES } from '../../src/core/classification';
import type { LoadedScene } from '../../src/scene/loadedScene';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { makeSketchupDae } from '../fixtures/sketchupDae';
import type { ModuleFrame, Vec3 } from '../../src/core/views';
import { viewBasis } from '../../src/core/views';
import { boxSides, cleanExterior, defaultExclude, exteriorLabel, visibleFromOutside } from '../../src/core/paint/exterior';
import type { ExteriorRule } from '../../src/core/paint/exterior';
import { cleanPaint } from '../../src/core/paint/ops';
import { paintContext } from '../../src/core/paint/resolve';
import type { PaintSettings } from '../../src/core/paint/types';
import { makeGlassTest } from '../../src/linework/packets';
import { exteriorAreas, exteriorSurvey } from '../../src/linework/paintExterior';
import { paintScene } from '../../src/linework/paintScene';
import { computePaintOverlay } from '../../src/linework/paintOverlay';
import { subsetForModules } from '../../src/core/subset';
import { subsetMeshes } from '../../src/linework/subset';

/** Viewbox 5900 × 2500 × 2800 posée à (x, y) du plan (monde : x, z ; Y vers le haut), grand côté le long de X */
const box = (id: string, x: number, z: number): ModuleFrame => ({
  moduleId: id,
  origin: [x, 0, z],
  xAxis: [1, 0, 0],
  yAxis: [0, 0, 1],
  up: [0, 1, 0],
  min: [0, 0, 0],
  max: [5900, 2500, 2800],
  longAxis: 'x',
  front: '+x',
  frontSource: 'default',
});
const exposure = (frames: ModuleFrame[]) => {
  const out: Record<string, string> = {};
  for (const s of boxSides(frames)) out[`${s.moduleId} ${s.kind === 'long' ? 'L' : 'S'}${s.local}`] = s.exposure;
  return out;
};

describe('côtés des box : extérieurs / collés', () => {
  it('4 box côte à côte par les grands côtés (son exemple) : 1 et 4 = un grand côté + 2 petits, 2 et 3 = 2 petits', () => {
    const e = exposure([box('VBX-01', 0, 0), box('VBX-02', 0, 2500), box('VBX-03', 0, 5000), box('VBX-04', 0, 7500)]);
    expect(e).toMatchObject({
      'VBX-01 L-y': 'exterieur', 'VBX-01 L+y': 'interieur', 'VBX-01 S+x': 'exterieur', 'VBX-01 S-x': 'exterieur',
      'VBX-02 L-y': 'interieur', 'VBX-02 L+y': 'interieur', 'VBX-02 S+x': 'exterieur', 'VBX-02 S-x': 'exterieur',
      'VBX-03 L-y': 'interieur', 'VBX-03 L+y': 'interieur', 'VBX-03 S+x': 'exterieur', 'VBX-03 S-x': 'exterieur',
      'VBX-04 L-y': 'interieur', 'VBX-04 L+y': 'exterieur', 'VBX-04 S+x': 'exterieur', 'VBX-04 S-x': 'exterieur',
    });
  });

  it('box décalée : côté partiel ; écart > 50 mm : extérieur ; box empilée : ses côtés restent extérieurs', () => {
    expect(exposure([box('A', 0, 0), box('B', 3000, 2500)])['A L+y']).toBe('partiel');
    expect(exposure([box('A', 0, 0), box('B', 0, 2560)])['A L+y']).toBe('exterieur');
    expect(exposure([box('A', 0, 0), box('B', 0, 2530)])['A L+y']).toBe('interieur');
    const up = { ...box('B', 0, 0), origin: [0, 2800, 0] as Vec3 };
    expect(Object.values(exposure([box('A', 0, 0), up]))).toEqual(Array(8).fill('exterieur'));
  });

  it('box tournée de 90° contre un petit côté (en T) : petit côté collé, grand côté de l’autre collé en partie', () => {
    const turned: ModuleFrame = { ...box('B', 5900, 0), xAxis: [0, 0, 1], yAxis: [-1, 0, 0], origin: [5900 + 2500, 0, 0] };
    const sides = boxSides([box('A', 0, 0), turned]);
    expect(sides.find((s) => s.moduleId === 'A' && s.local === '+x')!.exposure).toBe('interieur');
    const t = sides.find((s) => s.moduleId === 'B' && s.exposure !== 'exterieur')!;
    expect(t.kind).toBe('long');
    expect(t.exposure).toBe('partiel');
    expect(t.coveredRatio).toBeCloseTo(2500 / 5900, 2);
  });
});

describe('vu de dehors', () => {
  it('un triangle derrière un autre (plus profond) est caché ; côte à côte, les deux se voient', () => {
    const tri = (x: number, y: number, s: number): number[] => [x, y, x + s, y, x, y + s];
    const vis = visibleFromOutside({ uv: [...tri(0, 0, 1000), ...tri(100, 100, 300), ...tri(2000, 0, 500)], depth: [0, 0, 0, 60, 60, 60, 80, 80, 80] });
    expect(vis).toEqual([true, false, true]);
  });
});

describe('lecture', () => {
  it('zone « côtés extérieurs » gardée par cleanPaint, règle nettoyée, texte', () => {
    const rule: ExteriorRule = { sides: ['long', 'short'], exclude: ['VITRE'] };
    const p = cleanPaint({
      colors: [{ id: 'c', tag: 'P1', hex: '#8f8f8c', system: 'RAL', code: '7047' }],
      zones: [{ id: 'z', colorId: 'c', target: { scope: 'exterior', match: {}, exterior: { ...rule, junk: 1 } }, label: 'x' }],
    });
    expect(p.zones[0].target).toEqual({ scope: 'exterior', match: {}, exterior: rule });
    expect(cleanExterior({ sides: [], exclude: [] })).toBeNull();
    expect(exteriorLabel({ ...rule, modules: ['VBX-01'] }, 4)).toBe('Côtés extérieurs — VBX-01 · sans VITRE');
    expect(defaultExclude(['STRUCTURE', 'VITRE-CADRE', 'PIED', 'MUR-LEGER', 'FRAME-EXTERIEUR'])).toEqual(['FRAME-EXTERIEUR', 'PIED', 'VITRE-CADRE']);
  });
});

describe('sur le modèle (8 Viewbox en 2 rangées de 4)', () => {
  let scene: LoadedScene;
  const glass = makeGlassTest(/VITRE|GLASS|VERRE/);
  const load = async () => {
    if (scene) return scene;
    const res = await ingest({ fileName: 'ext.dae', data: new TextEncoder().encode(makeSketchupDae({ modules: 8 })).buffer as ArrayBuffer, sha256: 'ext', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'ext');
    return scene;
  };
  const paintOf = (rule: ExteriorRule): PaintSettings => ({
    v: 1,
    colors: [{ id: 'c', tag: 'P1', name: 'Télégris 4', system: 'RAL', code: '7047', hex: '#D0D0D0', createdAt: '' }],
    zones: [{ id: 'z', colorId: 'c', target: { scope: 'exterior', match: {}, exterior: rule }, label: '', source: 'click', createdAt: '' }],
    updatedAt: '',
  });

  it('surfaces : seulement les côtés extérieurs, vitrages et pieds exclus, chaque face une fois', async () => {
    const s = await load();
    const ctx = paintContext(s.index);
    const survey = exteriorSurvey(s, ctx, glass);
    const areas = exteriorAreas(survey, { sides: ['long', 'short'] });
    const rule: ExteriorRule = { sides: ['long', 'short'], exclude: defaultExclude(areas.byCategory.keys()) };
    expect(rule.exclude).toContain('PIED');
    const p = paintScene(s, paintOf(rule), ctx, glass);
    const byModule = p.areaByColorModule.get('c')!;
    // structure : petit côté 1,155 m² (2 poteaux, chant du plancher, chant du toit), grand côté 2,005 m², porte 1,935 m²
    // rangée 1 : façade vitrée −y extérieure (structure seulement) ; VBX-01 et VBX-04 aussi leur bout ; VBX-04 sa porte
    // rangée 2 : grand côté +y extérieur ; VBX-05 et VBX-08 leur bout
    const want: Record<string, number> = {
      'VBX-01': 2.005 + 1.155, 'VBX-02': 2.005, 'VBX-03': 2.005, 'VBX-04': 2.005 + 1.155 + 1.935,
      'VBX-05': 2.005 + 1.155, 'VBX-06': 2.005, 'VBX-07': 2.005, 'VBX-08': 2.005 + 1.155 + 1.935,
    };
    for (const [m, a] of Object.entries(want)) expect(byModule.get(m), m).toBeCloseTo(a, 2);
    // vitrages compris : + la façade vitrée de la rangée 1
    const withGlass = paintScene(s, paintOf({ ...rule, glass: true, exclude: rule.exclude.filter((c) => !c.startsWith('VITRE')) }), ctx, glass);
    expect(withGlass.areaByColorModule.get('c')!.get('VBX-02')).toBeCloseTo(2.005 + 5.7 * 2.55, 2);
    // grands côtés seulement, VBX-01 seulement
    const one = paintScene(s, paintOf({ ...rule, sides: ['long'], modules: ['VBX-01'] }), ctx, glass);
    expect([...one.areaByColorModule.get('c')!.keys()]).toEqual(['VBX-01']);
    expect(one.areaByColor.get('c')).toBeCloseTo(2.005, 2);
  });

  it('repères : sur la vue du bout extérieur de VBX-01, rien sur son côté collé à VBX-02', async () => {
    const s = await load();
    const ctx = paintContext(s.index);
    const survey = exteriorSurvey(s, ctx, glass);
    const rule: ExteriorRule = { sides: ['long', 'short'], exclude: defaultExclude(exteriorAreas(survey, { sides: ['long', 'short'] }).byCategory.keys()) };
    const painted = paintScene(s, paintOf(rule), ctx, glass);
    const meshIds = subsetMeshes(s, { include: subsetForModules(s.index, ['VBX-01']) });
    const view = (kind: 'front' | 'back' | 'left' | 'right') => computePaintOverlay({ scene: s, painted, meshIds, basis: viewBasis({ kind, frame: { moduleId: 'VBX-01' } }, s.frames), isGlass: glass, glassTransparent: false });
    const frame = s.frames.get('VBX-01')!;
    // face avant = +x local (collée à VBX-02), arrière = −x (bout de la rangée)
    expect(frame.front).toBe('+x');
    expect(view('front')).toEqual([]);
    const back = view('back');
    expect(back.length).toBeGreaterThan(0);
    expect(back.reduce((a, r) => a + r.area, 0) / 1e6).toBeCloseTo(1.155, 1);
  });
});
