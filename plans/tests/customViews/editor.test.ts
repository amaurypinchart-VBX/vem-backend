// VS4 — éditeur de vues spéciales, logique pure : fil d'Ariane, niveau proposé au clic, actions de la bulle (nombre de
// pièces touchées, « dans toutes les Viewbox » par défaut), remettre une pièce, nom proposé, historique, ordre des règles.
import { describe, expect, it } from 'vitest';
import { makeLookup } from '../../src/core/subset';
import { makePathIndex } from '../../src/core/customViews/paths';
import { makeTagResolver } from '../../src/core/customViews/tags';
import { resolveVisibility } from '../../src/core/customViews/visibility';
import type { VisibilityContext } from '../../src/core/customViews/visibility';
import { blankSpec, breadcrumb, clickActions, defaultTarget, displayLabel, historyPush, historyRedo, historyStart, historyUndo, moveRule, proposeName, restoreRule, HISTORY_LIMIT } from '../../src/core/customViews/editor';
import { VIEW_PRESETS, specFromPreset } from '../../src/core/customViews/presets';
import { fakeScene, grid2x3 } from './helpers';

function setup() {
  const s = fakeScene(grid2x3(), { wallOn: ['VBX-02'] });
  const ctx: VisibilityContext = { index: s.index, look: makeLookup(s.index), paths: makePathIndex(s.index), tags: makeTagResolver(s.index) };
  const node = (m: string, def: string) => s.index.nodes.find((n) => n.moduleId === m && n.definition === def)!.id;
  const mesh = (id: string) => s.index.nodes.find((n) => n.parentId === id && n.kind === 'mesh')!.id;
  return { s, ctx, node, mesh };
}

describe('bulle de clic', () => {
  it('fil d’Ariane de la Viewbox à la pièce, sans identifiant ni « SketchUp_Instance »', () => {
    const { ctx, node, mesh } = setup();
    const crumbs = breadcrumb(ctx, mesh(node('VBX-03', 'black_cieling')));
    expect(crumbs.map((c) => c.label)).toEqual(['VBX-03', '7-962-016 VIEWBOX STANDARD M16', 'VBXM16FULL', 'black cieling']);
    expect(crumbs.every((c) => !/^n\d+$/.test(c.label))).toBe(true);
  });

  it('niveau proposé : la pièce étiquetée (plafond) ; un mur posé contre la Viewbox en entier', () => {
    const { ctx, node, mesh, s } = setup();
    expect(defaultTarget(ctx, mesh(node('VBX-03', 'black_cieling')))).toBe(node('VBX-03', 'black_cieling'));
    const wall = s.index.nodes.find((n) => n.category === 'MUR-LEGER' && n.role === 'item')!;
    expect(defaultTarget(ctx, mesh(wall.id))).toBe(wall.id);
    expect(displayLabel(wall)).toBe('7-636-008 NIDAPLAST WALL');
  });

  it('actions : « dans toutes les Viewbox (6) » par défaut, étiquette partout, type, compte dans le périmètre', () => {
    const { ctx, node } = setup();
    const id = node('VBX-03', 'black_cieling');
    const acts = clickActions(ctx, id);
    const by = Object.fromEntries(acts.map((a) => [a.action, a]));
    expect(by['hide-all-boxes'].count).toBe(6);
    expect(by['hide-all-boxes'].primary).toBe(true);
    expect(by['hide-all-boxes'].text).toBe('Retirer dans toutes les Viewbox (6)');
    expect(by['hide-tag'].text).toBe('Retirer « Plafond tendu » partout (6)');
    expect(by['hide-type'].count).toBe(6);
    expect(by['hide-one'].count).toBe(1);
    expect(by['hide-category']).toBeUndefined(); // catégorie héritée de la Viewbox : jamais proposée
    expect(by.isolate.rule.op).toBe('isolate');
    // périmètre réduit à 2 Viewbox
    const scope = new Set(ctx.index.nodes.filter((n) => n.moduleId === 'VBX-01' || n.moduleId === 'VBX-02').map((n) => n.id));
    expect(clickActions(ctx, id, scope).find((a) => a.action === 'hide-all-boxes')!.count).toBe(2);
    // la règle retire bien les 6 plafonds
    const spec = { ...blankSpec('v', 'n'), visibility: [by['hide-all-boxes'].rule] };
    expect(resolveVisibility(ctx, spec).counts.get(by['hide-all-boxes'].rule.id)).toBe(6);
  });

  it('pièce retirée cliquée (rouge) : règle « remettre » qui gagne', () => {
    const { ctx, node, mesh } = setup();
    const id = node('VBX-04', 'black_cieling');
    const hideAll = clickActions(ctx, id).find((a) => a.action === 'hide-all-boxes')!.rule;
    const spec = { ...blankSpec('v', 'n'), visibility: [hideAll, restoreRule(ctx, id)] };
    const st = resolveVisibility(ctx, spec).states;
    expect(st.get(mesh(id))).toBe('visible');
    expect(st.get(mesh(node('VBX-05', 'black_cieling')))).toBe('hidden');
    expect(restoreRule(ctx, id).label).toBe('Remis : black cieling — VBX-04');
  });
});

describe('nom, historique, ordre', () => {
  it('nom proposé d’après la vue', () => {
    const p = (k: string) => specFromPreset(VIEW_PRESETS.find((x) => x.key === k)!, 'x', 'n');
    const label = (t: string) => ({ 'plafond-tendu': 'Plafond tendu', eclairage: 'Éclairage' })[t] ?? t;
    expect(proposeName(p('roof-under-no-ceiling'), label)).toBe('Dessous de toiture — sans plafond tendu');
    expect(proposeName({ ...p('roof-under-no-ceiling'), layout: { ...p('roof-under').layout, mode: 'exploded' } }, label)).toBe('Dessous de toiture — sans plafond tendu — séparées');
    expect(proposeName(p('section-long'))).toBe('Coupe A-A');
    expect(proposeName(p('plan-cut-1200'))).toBe('Plan coupé à 1,2 m');
    expect(proposeName({ ...blankSpec('v', 'n'), camera: { ...blankSpec('v', 'n').camera, dir: 'bottom', reflected: true } })).toBe('Plan de plafond réfléchi');
  });

  it('annuler / rétablir, 50 pas au plus, une nouvelle action efface le « rétablir »', () => {
    let h = historyStart(0);
    for (let i = 1; i <= 60; i++) h = historyPush(h, i);
    expect(h.past.length).toBe(HISTORY_LIMIT);
    h = historyUndo(historyUndo(h));
    expect(h.present).toBe(58);
    h = historyRedo(h);
    expect(h.present).toBe(59);
    h = historyPush(h, 100);
    expect(h.future).toEqual([]);
    expect(historyRedo(h)).toBe(h);
  });

  it('glisser une pastille change l’ordre (la dernière règle gagne)', () => {
    const r = (id: string) => ({ id, op: 'hide' as const, match: { nodeIds: [id] }, label: id, source: 'click' as const });
    expect(moveRule([r('a'), r('b'), r('c')], 0, 2).map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(moveRule([r('a'), r('b')], 5, 0).map((x) => x.id)).toEqual(['a', 'b']);
  });
});
