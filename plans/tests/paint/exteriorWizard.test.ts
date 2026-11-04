// « Peindre les côtés extérieurs » dès la génération du jeu : couleur RAL ajoutée une seule fois, zone remplacée
// (pas empilée) quand on régénère avec la même couleur, catégories non peintes par défaut.
import { describe, expect, it } from 'vitest';
import { exteriorPaintOps } from '../../src/core/paint/exteriorWizard';
import { applyOps, cleanPaint } from '../../src/core/paint/ops';
import { searchRal } from '../../src/core/paint/ral';
import type { PaintSettings } from '../../src/core/paint/types';

const empty = (): PaintSettings => ({ v: 1, colors: [], zones: [], updatedAt: '' });
let n = 0;
const ctx = { categories: ['MUR', 'VITRE', 'PIED', 'FRAME-EXTERIEUR', 'PORTE-SIMPLE'], moduleCount: 16, uid: (p: string) => `${p}${++n}`, now: '2026-11-04T10:00:00Z' };

describe('côtés extérieurs depuis l’assistant de génération', () => {
  it('nouvelle couleur RAL : P1 ajoutée à la palette + zone « côtés extérieurs » de toutes les Viewbox', () => {
    const ral = searchRal('7016')[0];
    const res = exteriorPaintOps(empty(), { ral, sides: ['short', 'long'] }, ctx)!;
    expect(res.tag).toBe('P1');
    const p = applyOps(empty(), res.ops);
    expect(p.colors).toHaveLength(1);
    expect(p.colors[0]).toMatchObject({ system: 'RAL', code: '7016', tag: 'P1' });
    expect(p.zones).toHaveLength(1);
    const z = p.zones[0];
    expect(z.target.scope).toBe('exterior');
    expect(z.target.exterior).toEqual({ sides: ['long', 'short'], exclude: ['FRAME-EXTERIEUR', 'PIED', 'VITRE'] });
    expect(z.label).toContain('toutes les Viewbox (16)');
    // relu par cleanPaint comme le serveur le rendra
    expect(cleanPaint(JSON.parse(JSON.stringify(p))).zones[0].target.exterior?.sides).toEqual(['long', 'short']);
  });

  it('même RAL déjà dans la palette : réutilisée ; même couleur déjà posée à l’extérieur : zone remplacée', () => {
    const ral = searchRal('7016')[0];
    const first = applyOps(empty(), exteriorPaintOps(empty(), { ral, sides: ['long', 'short'] }, ctx)!.ops);
    const again = exteriorPaintOps(first, { ral, sides: ['long'] }, ctx)!;
    expect(again.ops.filter((o) => o.op === 'color.put')).toHaveLength(0);
    const p = applyOps(first, again.ops);
    expect(p.colors).toHaveLength(1);
    expect(p.zones).toHaveLength(1);
    expect(p.zones[0].target.exterior?.sides).toEqual(['long']);
    expect(p.zones[0].label).toContain('grands côtés');
  });

  it('couleur de la palette choisie ; sans couleur ou sans côté : rien', () => {
    const ral = searchRal('9005')[0];
    const base = applyOps(empty(), exteriorPaintOps(empty(), { ral, sides: ['long'] }, ctx)!.ops);
    const res = exteriorPaintOps(base, { colorId: base.colors[0].id, sides: ['short'] }, ctx)!;
    expect(res.colorId).toBe(base.colors[0].id);
    expect(res.ops).toHaveLength(1);
    expect(exteriorPaintOps(base, { sides: ['long'] }, ctx)).toBeNull();
    expect(exteriorPaintOps(base, { colorId: base.colors[0].id, sides: [] }, ctx)).toBeNull();
  });
});
