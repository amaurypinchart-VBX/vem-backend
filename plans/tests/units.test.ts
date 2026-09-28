// Unités d'une installation : Viewbox espacées de plus de 2,5 m → unités séparées, chacune avec sa série de planches
// (A1.x, A2.x…), plus une vue d'ensemble (A0.x : couverture, 4 vues, vue aérienne avec les unités, façades).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { UNIT_GAP_MM, detectUnits, polygonDistance } from '../src/core/installUnits';
import type { InstallUnit } from '../src/core/installUnits';
import { makeModuleFrame } from '../src/core/views';
import type { ModuleFrame, Vec3 } from '../src/core/views';
import { subsetForModules } from '../src/core/subset';
import { generateDrawingSet, renumber } from '../src/sheets/generate';
import { actions, useEditor } from '../src/sheets/store';
import { SheetSvg } from '../src/sheets/SheetSvg';
import { moduleOverlays } from '../src/sheets/overlays';
import { emptyTitleBlock } from '../src/sheets/types';
import type { Sheet, ViewportItem } from '../src/sheets/types';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import type { SceneIndex } from '../src/core/types';
import { ingest } from '../src/ingest/pipeline';
import { inlineRunner } from '../src/ingest/cleanup';
import { DEFAULT_RULES } from '../src/core/classification';
import { makeSketchupDae } from './fixtures/sketchupDae';

async function fixtureIndex(): Promise<SceneIndex> {
  const dae = makeSketchupDae({ twoSided: false });
  const buf = new TextEncoder().encode(dae);
  const res = await ingest({ fileName: 'test.dae', data: buf.buffer as ArrayBuffer, sha256: 'x', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  return res.index;
}

/** Viewbox 5900 × 2500 posée à plat en (x, z), tournée de `deg` degrés autour de la verticale. */
function frame(id: string, x: number, z: number, deg = 0): ModuleFrame {
  const a = (deg * Math.PI) / 180;
  const xAxis: Vec3 = [Math.cos(a), 0, Math.sin(a)];
  const yAxis: Vec3 = [-Math.sin(a), 0, Math.cos(a)];
  return makeModuleFrame(id, { origin: [x, 0, z], xAxis, yAxis, up: [0, 1, 0] }, [0, 0, 0], [5900, 2500, 2800], null);
}

function indexOf(ids: string[]): SceneIndex {
  return {
    modules: ids.map((id) => ({ id, nodeId: `n-${id}`, itemIds: [], bboxMm: [0, 0, 0, 0, 0, 0] })),
    nodes: [],
    commonIds: [],
    levels: [],
  } as unknown as SceneIndex;
}

describe('détection des unités', () => {
  it('distance entre emprises : 0 si elles se touchent ou se croisent', () => {
    const sq = (x: number, y: number, s = 10): Array<[number, number]> => [
      [x, y],
      [x + s, y],
      [x + s, y + s],
      [x, y + s],
    ];
    expect(polygonDistance(sq(0, 0), sq(10, 0))).toBe(0);
    expect(polygonDistance(sq(0, 0), sq(13, 4))).toBe(3);
    expect(polygonDistance(sq(0, 0), sq(13, 14))).toBeCloseTo(5);
    // croix : aucun sommet de l'un dans l'autre, mais les côtés se coupent
    const wide: Array<[number, number]> = [[-10, -1], [10, -1], [10, 1], [-10, 1]];
    const tall: Array<[number, number]> = [[-1, -10], [1, -10], [1, 10], [-1, 10]];
    expect(polygonDistance(wide, tall)).toBe(0);
  });

  it('2,5 m ou moins : même unité ; plus de 2,5 m : unité séparée (repères orientés des Viewbox)', () => {
    const frames = new Map<string, ModuleFrame>([
      ['VBX-01', frame('VBX-01', 0, 0)],
      ['VBX-02', frame('VBX-02', 5900, 0)], // touche VBX-01
      ['VBX-03', frame('VBX-03', 5900 + 5900 + UNIT_GAP_MM, 0)], // à 2,5 m pile de VBX-02
      ['VBX-10', frame('VBX-10', 0, 2500 + 2600)], // à 2,6 m derrière VBX-01
      ['VBX-11', frame('VBX-11', 40000, 0, 45)], // tournée de 45°, isolée
    ]);
    const units = detectUnits(indexOf(['VBX-11', 'VBX-10', 'VBX-03', 'VBX-02', 'VBX-01']), frames);
    expect(units.map((u) => u.moduleIds)).toEqual([['VBX-01', 'VBX-02', 'VBX-03'], ['VBX-10'], ['VBX-11']]);
    expect(units.map((u) => `${u.n}:${u.name}`)).toEqual(['1:Unit 1', '2:Unit 2', '3:Unit 3']);
  });

  it('une Viewbox tournée est mesurée sur son emprise réelle, pas sur sa boîte monde', () => {
    // coin à coin : les boîtes monde des deux Viewbox à 45° se chevauchent, leurs emprises sont à plus de 2,5 m
    const frames = new Map<string, ModuleFrame>([
      ['VBX-01', frame('VBX-01', 0, 0, 45)],
      ['VBX-02', frame('VBX-02', 4500, -4500, 45)], // 3,86 m de côté à côté
    ]);
    expect(detectUnits(indexOf(['VBX-01', 'VBX-02']), frames).length).toBe(2);
  });

  it('modèle d’essai : VBX-03 (à 3,2 m) est une unité à part, l’escalier commun va à l’unité la plus proche', async () => {
    const index = await fixtureIndex();
    const units = detectUnits(index);
    expect(units.length).toBe(2);
    expect(units[1].moduleIds).toEqual(['VBX-03']);
    expect(units[0].moduleIds).toContain('VBX-01');
    const stair = index.nodes.find((n) => n.name === 'COMMUN_ESCALIER-01')!;
    expect(index.commonIds).toContain(stair.id);
    expect(units[0].commonIds).toEqual([stair.id]);
    expect(units[1].commonIds).toEqual([]);
  });
});

describe('jeu de plans séparé en unités', () => {
  const kinds = ['cover', 'fourViews', 'longSides', 'shortSides', 'implantation', 'perModule'] as const;
  const gen = (index: SceneIndex, units: InstallUnit[] | undefined, modules = index.modules.map((m) => m.id)) =>
    generateDrawingSet(
      { modules, units, kinds: [...kinds], paper: 'A1', style: DEFAULT_LINE_STYLE, title: 'NVIDIA' },
      { index, projectId: 'p1', modelVersionId: 'm1', modelKey: 'k', titleBlock: emptyTitleBlock() },
    );

  it('vue d’ensemble A0.x (couverture, 4 vues, vue aérienne, façades) puis une série complète par unité', async () => {
    const index = await fixtureIndex();
    const units = detectUnits(index);
    const { set, captures, dimensioned } = gen(index, units);
    const u1 = units[0].moduleIds.length;
    expect(set.sheets.map((s) => s.number)).toEqual([
      'A0.0',
      'A0.1',
      'A0.2',
      'A0.3',
      ...Array.from({ length: 4 + u1 }, (_, i) => `A1.${i + 1}`),
      ...Array.from({ length: 5 }, (_, i) => `A2.${i + 1}`),
    ]);
    expect(set.sheets.map((s) => s.unit ?? 0)).toEqual([0, 0, 0, 0, ...Array(4 + u1).fill(1), ...Array(5).fill(2)]);
    expect(set.units?.map((u) => u.name)).toEqual(['Unit 1', 'Unit 2']);
    const label = (s: Sheet) => (s.items.find((i) => i.type === 'viewport' && (i as ViewportItem).label) as ViewportItem | undefined)?.label;
    expect(set.sheets.slice(0, 4).map(label)).toEqual([undefined, 'Long side', 'Overall aerial view', 'Overall facade - Long side Right']);
    expect(set.sheets.filter((s) => s.kind === 'cover').length).toBe(1);

    // vue aérienne : tout le modèle vu de dessus, unités encadrées et nommées, cotée
    const aerial = set.sheets[2].items[0] as ViewportItem;
    expect(aerial.request.view.kind).toBe('top');
    expect(aerial.request.subset.include.length).toBe(subsetForModules(index, index.modules.map((m) => m.id)).length + index.commonIds.length);
    expect(aerial.overlays?.units?.map((u) => u.name)).toEqual(['Unit 1', 'Unit 2']);
    expect(dimensioned).toContain(aerial.id);

    // planches d'une unité : seulement ses Viewbox et ses éléments communs
    const unit2 = set.sheets.filter((s) => s.unit === 2);
    expect(unit2.map((s) => s.title)).toEqual([...Array(4).fill('Extract - Plan View - Unit 2'), expect.stringContaining('VBX-03')]);
    const inUnit2 = new Set(subsetForModules(index, ['VBX-03']));
    for (const s of unit2)
      for (const it of s.items) if (it.type === 'viewport') expect(it.request.subset.include.every((id) => inUnit2.has(id))).toBe(true);
    const u1Four = set.sheets.find((s) => s.unit === 1)!.items[0] as ViewportItem;
    expect(u1Four.request.subset.include).toContain(units[0].commonIds[0]);
    // images 3D : couverture (4) + 4 vues de l'ensemble et de chaque unité (1 chacune) + 1 par Viewbox
    expect(captures.length).toBe(4 + 3 + index.modules.length);
  });

  it('une seule unité parmi les Viewbox choisies : jeu classique, sans séparation', async () => {
    const index = await fixtureIndex();
    const units = detectUnits(index);
    const { set } = gen(index, units, units[0].moduleIds);
    expect(set.units).toBeUndefined();
    expect(set.sheets.every((s) => s.unit === undefined)).toBe(true);
    expect(set.sheets.map((s) => s.number)).toEqual(Array.from({ length: 5 + units[0].moduleIds.length }, (_, i) => `A0.${i}`));
    // sans unités fournies : inchangé
    expect(gen(index, undefined).set.sheets.length).toBe(5 + index.modules.length);
  });

  it('numérotation par série ; planche ajoutée ou changée de partie : renumérotée dans sa série', () => {
    const sheet = (id: string, unit?: number, kind: Sheet['kind'] = 'standard'): Sheet => ({ id, number: '', title: id, paper: 'A1', orientation: 'landscape', kind, ...(unit ? { unit } : {}), items: [] });
    const sheets = [sheet('c', undefined, 'cover'), sheet('o'), sheet('a', 1), sheet('b', 1), sheet('x', 2)];
    renumber(sheets);
    expect(sheets.map((s) => s.number)).toEqual(['A0.0', 'A0.1', 'A1.1', 'A1.2', 'A2.1']);
    useEditor.getState().load({
      id: 'd',
      projectId: 'p',
      modelVersionId: null,
      modelKey: 'k',
      title: 'Jeu',
      templateId: 'viewbox',
      titleBlock: emptyTitleBlock(),
      notes: '',
      sheets,
      units: [
        { n: 1, name: 'Unit 1', moduleIds: [], commonIds: [] },
        { n: 2, name: 'Unit 2', moduleIds: [], commonIds: [] },
      ],
      revision: 0,
      updatedAt: '',
    });
    actions.addSheet(sheet('new', 1));
    const nums = () => useEditor.getState().doc!.sheets.map((s) => `${s.id}=${s.number}`);
    expect(nums()).toEqual(['c=A0.0', 'o=A0.1', 'a=A1.1', 'b=A1.2', 'new=A1.3', 'x=A2.1']);
    actions.updateSheet('b', { unit: undefined });
    expect(nums()).toEqual(['c=A0.0', 'o=A0.1', 'a=A1.1', 'b=A0.2', 'new=A1.2', 'x=A2.1']);
    expect(useEditor.getState().doc!.sheets.find((s) => s.id === 'b')).not.toHaveProperty('unit');
  });

  it('rendu : cadre et nom de chaque unité sur la vue aérienne (masquables)', () => {
    const frames = [frame('VBX-01', 0, 0), frame('VBX-02', 20000, 0)];
    const basis = { right: [1, 0, 0] as Vec3, up: [0, 0, -1] as Vec3, toward: [0, 1, 0] as Vec3 };
    const vp: ViewportItem = {
      id: 'v1',
      type: 'viewport',
      rect: { x: 20, y: 62, w: 685, h: 513 },
      request: { modelId: 'k', subset: { include: [] }, view: { kind: 'top', frame: 'world' }, style: DEFAULT_LINE_STYLE },
      scale: 100,
      center: [13000, -1250],
      showLabel: false,
      renderStyle: 'trait',
      overlays: { units: [{ name: 'Bar VIP', moduleIds: ['VBX-01'] }, { name: 'Unit 2', moduleIds: ['VBX-02'] }] },
    };
    const lw = { boundsMm: { minX: 0, minY: -2500, maxX: 25900, maxY: 0 }, layers: [], snapPoints: new Float64Array(), meta: {} } as never;
    const overlays = moduleOverlays(frames, new Set(['VBX-01', 'VBX-02']), basis);
    const render = (v: ViewportItem) =>
      renderToStaticMarkup(
        createElement(SheetSvg, {
          sheet: { id: 's', number: 'A0.2', title: 'T', paper: 'A1', orientation: 'landscape', kind: 'standard', items: [v] },
          titleBlock: emptyTitleBlock(),
          notes: '',
          legend: [],
          viewData: () => ({ lw, basis, overlays }),
        }),
      );
    const svg = render(vp);
    expect(svg).toContain('>Bar VIP</text>');
    expect(svg).toContain('>Unit 2</text>');
    expect((svg.match(/stroke-dasharray="8 1.5 1.5 1.5"/g) ?? []).length).toBe(2);
    const hidden = render({ ...vp, overlays: { ...vp.overlays, hideUnits: true } });
    expect(hidden).not.toContain('Bar VIP');
  });
});
