// Numéros des Viewbox changés dans l'application (Vue 3D › 🔢 Numéros) : saisie, échange, réglages repris par la version
// suivante du modèle (retrouvés par position), textes des planches réécrits, planches à mettre à jour, ordre des planches
// « une par Viewbox », numéros des plans d'assemblage.
import { describe, expect, it } from 'vitest';
import {
  cleanModuleNumbers,
  entriesFromLabels,
  formatModuleLabel,
  labelChanges,
  parseModuleNumber,
  relabelText,
  resolveModuleLabels,
  sameLabels,
  setModuleNumber,
} from '../../src/core/moduleNumbers';
import type { ModuleInfo } from '../../src/core/types';
import type { BBox } from '../../src/core/types';
import { outdatedSheets, relabelDrawingSet, relabelSheet, sheetsWithOtherLabels } from '../../src/sheets/moduleLabels';
import { numberLabels } from '../../src/sheets/overlays';
import { retargetSheet } from '../../src/sheets/duplicate';
import { actions, useEditor } from '../../src/sheets/store';
import { emptyTitleBlock } from '../../src/sheets/types';
import type { DrawingSet, LabelItem, Sheet, TextItem, ViewportItem } from '../../src/sheets/types';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';

type Mod = Pick<ModuleInfo, 'id' | 'nodeId' | 'bboxMm'>;
/** box n à x = 6 m × (n − 1), au sol */
const box = (n: number, x = 6000 * (n - 1), y = 0): Mod => ({ id: formatModuleLabel(n), nodeId: `node${n}`, bboxMm: [x, y, 0, x + 5900, y + 3000, 2500] as BBox });
const mods = [box(1), box(2), box(3), box(4)];

describe('saisie et échange', () => {
  it('lit « 5 », « 05 », « VBX-5 », « vbx 05 » et refuse le reste', () => {
    expect(['5', '05', 'VBX-5', 'vbx 05', ' VBX-005 '].map(parseModuleNumber)).toEqual([5, 5, 5, 5, 5]);
    expect(['', '0', 'abc', '5a', 'VBX-', '1234'].map(parseModuleNumber)).toEqual([null, null, null, null, null, null]);
    expect(formatModuleLabel(5)).toBe('VBX-05');
    expect(formatModuleLabel(123)).toBe('VBX-123');
  });

  it('un numéro libre est donné, un numéro pris est échangé', () => {
    const a = setModuleNumber(mods, {}, 'VBX-01', 7);
    expect(a).toEqual({ labels: { 'VBX-01': 'VBX-07' }, swappedWith: null, changed: true });
    const b = setModuleNumber(mods, {}, 'VBX-01', 3);
    expect(b.labels).toEqual({ 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' });
    expect(b.swappedWith).toBe('VBX-03');
    // revenir au numéro SketchUp efface les entrées
    expect(setModuleNumber(mods, b.labels, 'VBX-01', 1).labels).toEqual({});
    expect(setModuleNumber(mods, {}, 'VBX-02', 2).changed).toBe(false);
  });

  it('numéroter dans l’ordre des clics donne 1, 2, 3, 4 sans doublon', () => {
    let labels = {};
    for (const [n, id] of ['VBX-04', 'VBX-02', 'VBX-03', 'VBX-01'].entries()) labels = setModuleNumber(mods, labels, id, n + 1).labels;
    expect(labels).toEqual({ 'VBX-04': 'VBX-01', 'VBX-01': 'VBX-04' });
    const names = mods.map((m) => (labels as Record<string, string>)[m.id] ?? m.id);
    expect(new Set(names).size).toBe(4);
  });
});

describe('réglages du modèle', () => {
  it('lecture tolérante', () => {
    expect(cleanModuleNumbers(null)).toEqual([]);
    expect(cleanModuleNumbers([{ id: 'VBX-01', label: 'VBX-05', at: [1, 2, 3] }, { id: 'VBX-02' }, 'x', { id: 'VBX-01', label: 'VBX-06', at: [0, 0, 0] }])).toEqual([
      { id: 'VBX-01', label: 'VBX-05', at: [1, 2, 3] },
    ]);
  });

  it('même modèle : chaque box garde son nom', () => {
    const labels = { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' };
    const entries = entriesFromLabels(mods, labels);
    expect(entries.map((e) => [e.id, e.label])).toEqual([
      ['VBX-01', 'VBX-03'],
      ['VBX-03', 'VBX-01'],
    ]);
    expect(resolveModuleLabels(mods, JSON.parse(JSON.stringify(entries)))).toEqual(labels);
  });

  it('nouvelle version renumérotée dans SketchUp : le nom suit la box (position)', () => {
    const entries = entriesFromLabels(mods, { 'VBX-01': 'VBX-09' });
    // SketchUp a échangé 1 et 2 : la box de gauche s'appelle maintenant VBX-02
    const next = [{ ...box(2, 0) }, { ...box(1, 6000) }, box(3), box(4)];
    expect(resolveModuleLabels(next, entries)).toEqual({ 'VBX-02': 'VBX-09' });
  });

  it('box déplacée de plus d’un mètre : numéro SketchUp', () => {
    const entries = entriesFromLabels(mods, { 'VBX-01': 'VBX-09' });
    expect(resolveModuleLabels([box(1, -3000), box(2), box(3), box(4)], entries)).toEqual({});
  });

  it('nom déjà pris par une box ajoutée depuis dans SketchUp : l’entrée est ignorée', () => {
    const entries = entriesFromLabels(mods, { 'VBX-01': 'VBX-05' });
    expect(resolveModuleLabels([...mods, box(5)], entries)).toEqual({});
    expect(resolveModuleLabels(mods, entries)).toEqual({ 'VBX-01': 'VBX-05' });
  });

  it('changements et comparaison', () => {
    expect(labelChanges(['VBX-01', 'VBX-02'], {}, { 'VBX-01': 'VBX-02', 'VBX-02': 'VBX-01' })).toEqual([
      { id: 'VBX-01', before: 'VBX-01', after: 'VBX-02' },
      { id: 'VBX-02', before: 'VBX-02', after: 'VBX-01' },
    ]);
    expect(sameLabels(undefined, {})).toBe(true);
    expect(sameLabels({ 'VBX-01': 'VBX-01' }, undefined)).toBe(true);
    expect(sameLabels({ 'VBX-01': 'VBX-02' }, {})).toBe(false);
  });
});

describe('textes', () => {
  it('remplace tous les noms d’un coup, seulement les noms entiers', () => {
    const r = new Map([
      ['VBX-01', 'VBX-05'],
      ['VBX-05', 'VBX-01'],
    ]);
    expect(relabelText('Extract - Plan View - VBX-01 Viewbox M16', r)).toBe('Extract - Plan View - VBX-05 Viewbox M16');
    expect(relabelText('VBX-01 Left, VBX-05 Right', r)).toBe('VBX-05 Left, VBX-01 Right');
    expect(relabelText('VBX-011 XVBX-01 VBX-01/VBX-05', r)).toBe('VBX-011 XVBX-01 VBX-05/VBX-01');
    expect(relabelText('', r)).toBe('');
  });
});

// ─── planches ───
const vp = (id: string, opts: { moduleId?: string; include?: string[]; numbers?: boolean; label?: string } = {}): ViewportItem => ({
  id,
  type: 'viewport',
  rect: { x: 10, y: 10, w: 100, h: 80 },
  request: {
    modelId: 'k',
    subset: { include: opts.include ?? ['node1'] },
    view: { kind: 'top', frame: opts.moduleId ? { moduleId: opts.moduleId } : 'world' },
    style: { ...DEFAULT_LINE_STYLE },
  },
  scale: 50,
  label: opts.label ?? 'Top',
  showLabel: true,
  renderStyle: 'trait',
  ...(opts.numbers ? { overlays: { moduleNumbers: true } } : {}),
});
const sheet = (id: string, title: string, items: Sheet['items'], unit?: number): Sheet => ({ id, number: '', title, paper: 'A1', orientation: 'landscape', kind: 'standard', ...(unit ? { unit } : {}), items });
const perBox = (n: number) => sheet(`s${n}`, `Extract - Plan View - VBX-0${n} Viewbox M16`, [vp(`v${n}`, { moduleId: `VBX-0${n}`, include: [`node${n}`], label: 'Front' })]);
const doc = (sheets: Sheet[]): DrawingSet => ({
  id: 'd',
  projectId: 'p',
  modelVersionId: null,
  modelKey: 'k',
  title: 'Jeu',
  templateId: 'viewbox',
  titleBlock: emptyTitleBlock(),
  notes: '',
  sheets,
  revision: 0,
  updatedAt: '',
});

function sampleSet(): DrawingSet {
  const d = doc([
    sheet('cover', 'Couverture', []),
    sheet('assembly', 'Extract - Plan View - Stand', [vp('va', { include: ['node1', 'node2', 'node3', 'node4'], numbers: true, label: 'Assembly plan' })]),
    sheet('elev', 'Extract - Plan View - Stand', [vp('ve', { include: ['node1', 'node2'], label: 'Long side' })]),
    perBox(1),
    perBox(2),
    perBox(3),
    perBox(4),
    sheet('frames', 'TEXTILE FRAME SCHEDULE', [{ id: 't1', type: 'text', rect: { x: 0, y: 0, w: 10, h: 10 }, text: 'F1  VBX-01 Left\nF2  VBX-03 Right', size: 3 } as TextItem]),
  ]);
  d.sheets.forEach((s, i) => (s.number = `A0.${i}`));
  return d;
}

describe('planches', () => {
  it('rien de changé = rien à mettre à jour', () => {
    expect(outdatedSheets(sampleSet(), {}, mods)).toEqual([]);
  });

  it('planches touchées : titres, textes, numéros du plan d’assemblage ; pas les autres', () => {
    const d = sampleSet();
    const labels = { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' };
    expect(outdatedSheets(d, labels, mods)).toEqual(['assembly', 's1', 's3', 'frames']);
    // les élévations montrent VBX-01 mais sans numéro dessiné : rien de visible ne change
    expect(sheetsWithOtherLabels(d, labels)).toHaveLength(8);
  });

  it('mise à jour : textes réécrits, ordre des planches par Viewbox, numéros enregistrés', () => {
    const d = sampleSet();
    const labels = { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' };
    const res = relabelDrawingSet(d, labels, mods);
    expect(res).toEqual({ texts: 3, reordered: true });
    expect(d.sheets.map((s) => s.id)).toEqual(['cover', 'assembly', 'elev', 's3', 's2', 's1', 's4', 'frames']);
    expect(d.sheets.map((s) => s.number)).toEqual(['A0.1', 'A0.2', 'A0.3', 'A0.4', 'A0.5', 'A0.6', 'A0.7', 'A0.8']);
    expect(d.sheets.find((s) => s.id === 's1')!.title).toBe('Extract - Plan View - VBX-03 Viewbox M16');
    expect(d.sheets.find((s) => s.id === 's3')!.title).toBe('Extract - Plan View - VBX-01 Viewbox M16');
    expect((d.sheets.find((s) => s.id === 'frames')!.items[0] as TextItem).text).toBe('F1  VBX-03 Left\nF2  VBX-01 Right');
    expect(d.sheets.every((s) => sameLabels(s.moduleLabels, labels))).toBe(true);
    expect(outdatedSheets(d, labels, mods)).toEqual([]);
    // retour aux numéros SketchUp : tout revient, ordre compris
    relabelDrawingSet(d, {}, mods);
    expect(d.sheets.map((s) => s.id)).toEqual(['cover', 'assembly', 'elev', 's1', 's2', 's3', 's4', 'frames']);
    expect(d.sheets.find((s) => s.id === 's1')!.title).toBe('Extract - Plan View - VBX-01 Viewbox M16');
    expect(d.sheets.every((s) => s.moduleLabels === undefined)).toBe(true);
  });

  it('ordre choisi à la main : gardé', () => {
    const d = sampleSet();
    // planches par Viewbox rangées 2, 1, 3, 4 à la main
    const [s1, s2] = [d.sheets[3], d.sheets[4]];
    d.sheets.splice(3, 2, s2, s1);
    const res = relabelDrawingSet(d, { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' }, mods);
    expect(res.reordered).toBe(false);
    expect(d.sheets.map((s) => s.id)).toEqual(['cover', 'assembly', 'elev', 's2', 's1', 's3', 's4', 'frames']);
  });

  it('chaque planche part de ses propres numéros (planche ajoutée avec les numéros SketchUp)', () => {
    const d = sampleSet();
    const labels = { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' };
    relabelDrawingSet(d, labels, mods);
    // planche ajoutée ensuite (plan de calage, vue spéciale) : écrite avec les numéros SketchUp
    d.sheets.push(sheet('late', 'Détail VBX-01', []));
    expect(outdatedSheets(d, labels, mods)).toEqual(['late']);
    relabelDrawingSet(d, labels, mods);
    expect(d.sheets.at(-1)!.title).toBe('Détail VBX-03');
    expect(d.sheets.find((s) => s.id === 's1')!.title).toBe('Extract - Plan View - VBX-03 Viewbox M16');
  });

  it('les numéros du plan d’assemblage sont ceux de la planche', () => {
    const o = (moduleId: string, x: number) => ({ moduleId, outline: new Float64Array(), center: { x, y: 0 }, minSize: 2500 });
    const overlays = [o('VBX-01', 0), o('VBX-02', 6000), o('VBX-03', 12000), o('VBX-13', 12000)];
    expect(numberLabels(overlays).map((l) => l.label)).toEqual(['1', '2', '3/13']);
    expect(numberLabels(overlays, { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' }).map((l) => l.label)).toEqual(['3', '2', '1/13']);
  });

  it('« Dupliquer pour d’autres Viewbox » écrit les titres avec les numéros de la planche', () => {
    const s = perBox(1);
    relabelSheet(s, { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' }, mods);
    expect(s.title).toBe('Extract - Plan View - VBX-03 Viewbox M16');
    const frames = new Map(
      mods.map((m) => [m.id, { moduleId: m.id, origin: [m.bboxMm[0], 0, 0], xAxis: [1, 0, 0], yAxis: [0, 0, 1], up: [0, 1, 0], min: [0, 0, 0], max: [5900, 3000, 2500], front: '+x', frontSource: 'default', longAxis: 'x' }]),
    );
    const index = { modules: mods.map((m) => ({ ...m, itemIds: [], name: m.id, level: 0 })), nodes: mods.map((m) => ({ id: m.nodeId, moduleId: m.id, parentId: null, children: [] })) };
    let k = 0;
    // la copie pour la box SketchUp VBX-01 (affichée VBX-03 → VBX-01) part de VBX-03 (affichée VBX-01)
    const src = perBox(3);
    relabelSheet(src, { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' }, mods);
    expect(src.title).toBe('Extract - Plan View - VBX-01 Viewbox M16');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = retargetSheet(src, 'VBX-03', 'VBX-02', { index: index as any, frames: frames as any }, (p) => `${p}${++k}`);
    expect(r.sheet.title).toBe('Extract - Plan View - VBX-02 Viewbox M16');
    expect(r.sheet.moduleLabels).toEqual({ 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' });
  });

  it('dans l’éditeur : une entrée d’historique, annulable', () => {
    useEditor.getState().load(sampleSet());
    const labels = { 'VBX-01': 'VBX-03', 'VBX-03': 'VBX-01' };
    actions.editDoc('Mettre à jour les numéros des Viewbox', (d) => void relabelDrawingSet(d as DrawingSet, labels, mods));
    let d = useEditor.getState().doc!;
    expect(d.sheets.map((s) => s.id)).toEqual(['cover', 'assembly', 'elev', 's3', 's2', 's1', 's4', 'frames']);
    expect(d.sheets[3].title).toBe('Extract - Plan View - VBX-01 Viewbox M16');
    expect(outdatedSheets(d, labels, mods)).toEqual([]);
    useEditor.getState().undo();
    d = useEditor.getState().doc!;
    expect(d.sheets.map((s) => s.id)).toEqual(['cover', 'assembly', 'elev', 's1', 's2', 's3', 's4', 'frames']);
    expect(outdatedSheets(d, labels, mods)).toEqual(['assembly', 's1', 's3', 'frames']);
    // les repères ne changent pas (« Repère » n'est pas un nom de Viewbox)
    const l: LabelItem = { id: 'l', type: 'label', textPos: { x: 0, y: 0 }, text: 'Repère VBX-01', style: 'bold' };
    const s = sheet('x', 'X', [l]);
    relabelSheet(s, labels, mods);
    expect((s.items[0] as LabelItem).text).toBe('Repère VBX-03');
  });
});
