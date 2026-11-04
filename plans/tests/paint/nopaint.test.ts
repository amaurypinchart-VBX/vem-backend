// « ⊘ Sans peinture » (A. Pinchart 04.11.2026 : « j'ai mis une zone en peinture et finalement il n'y a pas de peinture,
// j'aimerais cliquer dessus et mettre pas de peinture spéciale ») : une zone NO_PAINT retire la peinture des zones posées
// avant là où elle s'applique, le reste reste peint ; gardée par cleanPaint / applyOps et par le serveur.
import { describe, expect, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES } from '../../src/core/classification';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { makeSketchupDae } from '../fixtures/sketchupDae';
import { paintContext } from '../../src/core/paint/resolve';
import { applyOps, cleanPaint } from '../../src/core/paint/ops';
import { defaultExclude } from '../../src/core/paint/exterior';
import type { PaintSettings } from '../../src/core/paint/types';
import { NO_PAINT } from '../../src/core/paint/types';
import { makeGlassTest } from '../../src/linework/packets';
import { exteriorAreas, exteriorSurvey } from '../../src/linework/paintExterior';
import { changedPaintNodes, paintScene } from '../../src/linework/paintScene';

describe('Sans peinture', () => {
  it('lecture : une zone « none » est gardée sans couleur de palette', () => {
    const zone = { id: 'n', colorId: NO_PAINT, target: { scope: 'node', match: { nodeIds: ['x'] } }, label: 'ici', source: 'click', createdAt: '' };
    const p = cleanPaint({ colors: [{ id: 'c', tag: 'P1', hex: '#111111' }], zones: [zone] });
    expect(p.zones.map((z) => z.id)).toEqual(['n']);
    expect(applyOps(p, [{ op: 'color.del', id: 'c' }]).zones.map((z) => z.id)).toEqual(['n']);
  });

  it('sur les côtés extérieurs : la pièce choisie n’est plus peinte, le reste oui ; surface comptée sur la zone', async () => {
    const res = await ingest({ fileName: 'np.dae', data: new TextEncoder().encode(makeSketchupDae({ modules: 8 })).buffer as ArrayBuffer, sha256: 'np', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const s = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'np');
    const glass = makeGlassTest(/VITRE|GLASS|VERRE/);
    const ctx = paintContext(s.index);
    const survey = exteriorSurvey(s, ctx, glass);
    const exclude = defaultExclude(exteriorAreas(survey, { sides: ['long', 'short'] }).byCategory.keys());
    const base: PaintSettings = {
      v: 1,
      colors: [{ id: 'c', tag: 'P1', name: '', system: 'RAL', code: '7047', hex: '#D0D0D0', createdAt: '' }],
      zones: [{ id: 'ext', colorId: 'c', target: { scope: 'exterior', match: {}, exterior: { sides: ['long', 'short'], exclude } }, label: '', source: 'click', createdAt: '' }],
      updatedAt: '',
    };
    const before = paintScene(s, base, ctx, glass);
    // une pièce peinte de VBX-04 (porte du bout de rangée) : « Sans peinture » sur la pièce entière
    const door = [...before.nodes.keys()].find((id) => s.index.nodes.find((n) => n.id === id)?.category === 'PORTE-SIMPLE')!;
    expect(door).toBeTruthy();
    const after = paintScene(s, { ...base, zones: [...base.zones, { id: 'none', colorId: NO_PAINT, target: { scope: 'node', match: { nodeIds: [door] } }, label: '', source: 'click', createdAt: '' }] }, ctx, glass);
    expect(after.nodes.has(door)).toBe(false);
    expect(after.nodes.size).toBe(before.nodes.size - 1);
    expect(after.areaByZone.get('none')).toBeCloseTo(1.935, 2);
    expect(after.areaByColor.get('c')).toBeCloseTo(before.areaByColor.get('c')! - 1.935, 2);
    expect(after.noEffect.size).toBe(0);
    // seule la porte a changé : seules les vues qui la montrent recalculent leurs repères (bug « Calcul des repères » sans fin)
    expect([...changedPaintNodes(before, after)]).toEqual([door]);
    expect(changedPaintNodes(before, paintScene(s, base, ctx, glass)).size).toBe(0);
    // posée AVANT la zone extérieure, elle est repeinte par elle (la dernière zone gagne)
    const first = paintScene(s, { ...base, zones: [{ ...after_none(door) }, ...base.zones] }, ctx, glass);
    expect(first.nodes.has(door)).toBe(true);
  });
});

const after_none = (door: string) => ({ id: 'none', colorId: NO_PAINT, target: { scope: 'node' as const, match: { nodeIds: [door] } }, label: '', source: 'click' as const, createdAt: '' });
