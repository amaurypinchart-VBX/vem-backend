// Duplication de planches : copies (ids, références), placement dans le jeu, une seule entrée d'historique,
// déplacement / suppression groupés, « Dupliquer pour d'autres Viewbox ».
import { describe, expect, it } from 'vitest';
import { actions, useEditor } from '../../src/sheets/store';
import { cloneSheet, mapBetweenFrames, moveGroupAfter, planDuplicates, insertCopies, retargetSheet, sheetModule } from '../../src/sheets/duplicate';
import { emptyTitleBlock } from '../../src/sheets/types';
import type { DimensionItem, DrawingSet, LabelItem, Sheet, SymbolItem, ViewportItem } from '../../src/sheets/types';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';
import type { ModuleFrame, Vec3 } from '../../src/core/views';
import type { SceneIndex } from '../../src/core/types';

let n = 0;
const nid = (p: string) => `${p}${++n}`;

const vp = (id: string, moduleId = 'VBX-01', include = ['n1', 'i1']): ViewportItem => ({
  id,
  type: 'viewport',
  rect: { x: 10, y: 10, w: 100, h: 80 },
  request: { modelId: 'k', subset: { include }, view: { kind: 'front', frame: { moduleId } }, style: { ...DEFAULT_LINE_STYLE } },
  scale: 20,
  center: [100, 200],
  label: 'Front',
  showLabel: true,
  renderStyle: 'trait',
  lineworkKey: 'key-1',
});

const sheetWith = (id: string, unit?: number): Sheet => ({
  id,
  number: '',
  title: `Extract - Plan View - VBX-01`,
  paper: 'A1',
  orientation: 'landscape',
  kind: 'standard',
  ...(unit ? { unit } : {}),
  items: [
    vp(`${id}-v`),
    { id: `${id}-d`, type: 'dimension', viewportId: `${id}-v`, kind: 'linear', orient: 'h', anchors3d: [[0, 0, 0], [1000, 0, 0]], offsetMm: -10 } as DimensionItem,
    { id: `${id}-da`, type: 'dimension', viewportId: `${id}-v`, kind: 'linear', orient: 'h', anchors3d: [[0, 0, 0], [500, 0, 0]], offsetMm: -20, auto: true } as DimensionItem,
    { id: `${id}-l`, type: 'label', viewportId: `${id}-v`, anchor3d: [100, 100, 100], textPos: { x: 50, y: 50 }, text: 'Repère', style: 'bold' } as LabelItem,
    { id: `${id}-y`, type: 'symbol', symbol: 'prise-2pt', viewportId: `${id}-v`, model: [200, 300], at: { x: 30, y: 30 } } as SymbolItem,
  ],
});

const doc = (sheets: Sheet[], units = false): DrawingSet => ({
  id: 'd',
  projectId: 'p',
  modelVersionId: null,
  modelKey: 'k',
  title: 'Jeu',
  templateId: 'viewbox',
  titleBlock: emptyTitleBlock(),
  notes: '',
  sheets,
  ...(units ? { units: [{ n: 1, name: 'U1', moduleIds: [], commonIds: [] }, { n: 2, name: 'U2', moduleIds: [], commonIds: [] }] } : {}),
  revision: 0,
  updatedAt: '',
});

describe('copie d’une planche', () => {
  it('nouveaux ids, références vers la vue réécrites, clé de calcul gardée', () => {
    const s = sheetWith('a');
    const c = cloneSheet(s, nid);
    expect(c.id).not.toBe('a');
    const ids = new Set(c.items.map((i) => i.id));
    expect(ids.size).toBe(s.items.length);
    for (const i of s.items) expect(ids.has(i.id)).toBe(false);
    const v = c.items.find((i) => i.type === 'viewport') as ViewportItem;
    for (const it of c.items) if (it.type !== 'viewport') expect((it as { viewportId?: string }).viewportId).toBe(v.id);
    expect(v.lineworkKey).toBe('key-1');
    expect(s.items[1]).toMatchObject({ viewportId: 'a-v' }); // original intact
  });
});

describe('placement des copies', () => {
  it('même série : à la suite de la dernière choisie, dans l’ordre', () => {
    const sheets = ['a', 'b', 'c', 'd'].map((id) => sheetWith(id));
    const plan = planDuplicates(sheets, ['c', 'a'], nid);
    insertCopies(sheets, plan);
    const order = sheets.map((s) => (plan.find((p) => p.copy.id === s.id)?.sourceId ?? s.id) + (plan.some((p) => p.copy.id === s.id) ? "'" : ''));
    expect(order).toEqual(['a', 'b', 'c', "a'", "c'", 'd']);
  });
  it('plusieurs unités : chaque copie après son original, avec son unité', () => {
    const sheets = [sheetWith('a', 1), sheetWith('b', 1), sheetWith('c', 2)];
    const plan = planDuplicates(sheets, ['a', 'c'], nid);
    insertCopies(sheets, plan);
    expect(sheets.map((s) => s.unit)).toEqual([1, 1, 1, 2, 2]);
    expect(sheets[1].id).toBe(plan[0].copy.id);
    expect(sheets[4].id).toBe(plan[1].copy.id);
  });
  it('groupe déplacé après une planche, ordre gardé, unité de la cible', () => {
    const sheets = [sheetWith('a', 1), sheetWith('b', 1), sheetWith('c', 2), sheetWith('d', 2)];
    moveGroupAfter(sheets, ['b', 'a'], 'd', true);
    expect(sheets.map((s) => s.id)).toEqual(['c', 'd', 'a', 'b']);
    expect(sheets.map((s) => s.unit)).toEqual([2, 2, 2, 2]);
    moveGroupAfter(sheets, ['b'], null, false);
    expect(sheets[0].id).toBe('b');
  });
});

describe('store : actions groupées', () => {
  it('dupliquer 3 planches = une entrée d’historique, annuler = état exact d’avant', () => {
    useEditor.getState().load(doc(['a', 'b', 'c', 'd'].map((id) => sheetWith(id))));
    const before = JSON.stringify(useEditor.getState().doc);
    const ids = actions.duplicateSheets(['a', 'b', 'c']);
    const st = useEditor.getState();
    expect(st.past.length).toBe(1);
    expect(st.past[0].label).toBe('Dupliquer 3 planches');
    expect(st.doc!.sheets.length).toBe(7);
    expect(st.sheetSelection).toEqual(ids);
    expect(st.sheetId).toBe(ids[0]);
    expect(st.doc!.sheets.map((s) => s.number)).toEqual(['A0.1', 'A0.2', 'A0.3', 'A0.4', 'A0.5', 'A0.6', 'A0.7']);
    expect(st.doc!.sheets.slice(3, 6).map((s) => s.id)).toEqual(ids);
    st.undo();
    expect(JSON.stringify(useEditor.getState().doc)).toBe(before);
    expect(useEditor.getState().sheetSelection).toEqual([]);
  });
  it('supprimer et déplacer un groupe', () => {
    useEditor.getState().load(doc(['a', 'b', 'c', 'd'].map((id) => sheetWith(id))));
    actions.moveSheetsAfter(['a', 'b'], 'd');
    expect(useEditor.getState().doc!.sheets.map((s) => s.id)).toEqual(['c', 'd', 'a', 'b']);
    actions.deleteSheets(['c', 'a']);
    expect(useEditor.getState().doc!.sheets.map((s) => s.id)).toEqual(['d', 'b']);
    actions.deleteSheets(['d', 'b']);
    expect(useEditor.getState().doc!.sheets.length).toBe(2); // jamais toutes
  });
});

describe('Dupliquer pour d’autres Viewbox', () => {
  const frame = (moduleId: string, origin: Vec3, rot = false): ModuleFrame => ({
    moduleId,
    origin,
    xAxis: rot ? [0, 0, -1] : [1, 0, 0],
    yAxis: rot ? [1, 0, 0] : [0, 0, -1],
    up: [0, 1, 0],
    min: [0, 0, 0],
    max: [5900, 2500, 3000],
    longAxis: 'x',
    front: 'x+' as ModuleFrame['front'],
    frontSource: 'default',
  });
  const frames = new Map([
    ['VBX-01', frame('VBX-01', [0, 0, 0])],
    ['VBX-02', frame('VBX-02', [10000, 0, 0], true)],
    ['VBX-03', frame('VBX-03', [20000, 0, 0])],
  ]);
  const index = {
    modules: [
      { id: 'VBX-01', nodeId: 'n1', itemIds: ['i1'], type: 'M16' },
      { id: 'VBX-02', nodeId: 'n2', itemIds: ['i2'], type: 'M16' },
      { id: 'VBX-03', nodeId: 'n3', itemIds: ['i3'], type: 'M8' },
    ],
    commonIds: [],
  } as unknown as SceneIndex;

  it('point transporté par les repères des deux box', () => {
    const p = mapBetweenFrames([100, 200, -300], frames.get('VBX-01')!, frames.get('VBX-02')!);
    // local (100, 300, 200) → origine (10000,0,0) + 100·(0,0,−1) + 300·(1,0,0) + 200·(0,1,0)
    expect(p.map((v) => Math.round(v))).toEqual([10300, 200, -100]);
  });

  it('vues, sous-ensemble, titre, cotes, repère et symbole repointés', () => {
    const s = sheetWith('a');
    expect(sheetModule(s)).toBe('VBX-01');
    const r = retargetSheet(s, 'VBX-01', 'VBX-02', { index, frames }, nid);
    expect(r.sheet.title).toBe('Extract - Plan View - VBX-02');
    const v = r.sheet.items.find((i) => i.type === 'viewport') as ViewportItem;
    expect(v.request.view).toMatchObject({ kind: 'front', frame: { moduleId: 'VBX-02' } });
    expect(v.request.subset.include).toEqual(['n2', 'i2']);
    expect(v.lineworkKey).toBeUndefined();
    expect(v.center).toBeUndefined();
    expect(v.scale).toBe(20);
    expect(r.viewportIds).toEqual([v.id]);
    expect(r.autoDimViewportIds).toEqual([v.id]);
    const dims = r.sheet.items.filter((i) => i.type === 'dimension') as DimensionItem[];
    expect(dims.length).toBe(1); // l'automatique est retirée (refaite après calcul)
    expect(dims[0].anchors3d[1].map((x) => Math.round(x))).toEqual([10000, 0, -1000]);
    const l = r.sheet.items.find((i) => i.type === 'label') as LabelItem;
    expect(l.anchor3d!.map((x) => Math.round(x))).toEqual([9900, 100, -100]);
    expect(r.sheet.items.some((i) => i.type === 'symbol')).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('box d’un autre type : cotes manuelles et ancrages retirés avec avertissement', () => {
    const r = retargetSheet(sheetWith('a'), 'VBX-01', 'VBX-03', { index, frames }, nid);
    expect(r.sheet.items.filter((i) => i.type !== 'viewport')).toEqual([]);
    expect(r.warnings[0]).toMatch(/3 cote\(s\) \/ repère\(s\) retiré\(s\)/);
  });
});
