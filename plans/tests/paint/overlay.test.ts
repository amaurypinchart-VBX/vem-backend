// Peinture sur une vue 2D (fixture SketchUp chargée comme dans l'app) : face visible → contour + repère ; face
// tournée vers l'arrière → rien ; face cachée par une pièce devant → rien ; face partiellement cachée → contour avec
// un trou ; même face retrouvée dans toutes les Viewbox de la même définition.
import { describe, expect, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES } from '../../src/core/classification';
import type { LoadedScene } from '../../src/scene/loadedScene';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { makeSketchupDae } from '../fixtures/sketchupDae';
import { nodeSoup, paintScene, toLocalPoint } from '../../src/linework/paintScene';
import { computePaintOverlay } from '../../src/linework/paintOverlay';
import { faceSelector } from '../../src/core/paint/region';
import { paintContext } from '../../src/core/paint/resolve';
import { targetOptions } from '../../src/core/paint/targets';
import type { PaintMatch, PaintSettings, Vec3 } from '../../src/core/paint/types';
import type { ViewBasis } from '../../src/core/views';
import { loopArea } from '../../src/core/paint/region';

let scene: LoadedScene;
const load = async () => {
  if (scene) return scene;
  const res = await ingest({ fileName: 'paint.dae', data: new TextEncoder().encode(makeSketchupDae({ twoSided: false })).buffer as ArrayBuffer, sha256: 'paint', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'paint');
  return scene;
};

/** maillage d'une Viewbox dont la boîte monde est `box` (± 1 mm) */
const meshAt = (s: LoadedScene, moduleId: string, box: number[]) =>
  s.index.nodes.find((n) => n.kind === 'mesh' && n.moduleId === moduleId && n.bboxMm && (n.bboxMm as unknown as number[]).every((v, i) => Math.abs(v - box[i]) < 1))?.id;

const fromAbove: ViewBasis = { right: [1, 0, 0], up: [0, 0, -1], toward: [0, 1, 0] };
const fromBelow: ViewBasis = { right: [1, 0, 0], up: [0, 0, 1], toward: [0, -1, 0] };

function zonePaint(s: LoadedScene, nodeId: string, seedWorld: Vec3, match?: PaintMatch): PaintSettings {
  const ns = nodeSoup(s, nodeId)!;
  const face = faceSelector(ns.soup, toLocalPoint(ns, seedWorld), 30)!;
  return {
    v: 1,
    colors: [{ id: 'c', tag: 'P1', name: 'RAL 9005', system: 'RAL', code: '9005', hex: '#0E0E10', createdAt: '' }],
    zones: [{ id: 'z', colorId: 'c', target: { scope: 'face', match: match ?? { nodeIds: [nodeId] }, face }, label: '', source: 'click', createdAt: '' }],
    updatedAt: '',
  };
}

describe('peinture sur une vue', () => {
  it('dessus d’une pièce vu d’en haut : 200 × 200 mm, repère au centre ; vu d’en dessous : rien', async () => {
    const s = await load();
    const misc = meshAt(s, 'VBX-01', [2000, 150, -1200, 2200, 400, -1000])!;
    const slab = meshAt(s, 'VBX-01', [0, 0, -2500, 5900, 150, 0])!;
    expect(misc && slab).toBeTruthy();
    const painted = paintScene(s, zonePaint(s, misc, [2100, 400, -1100]));
    expect(painted.areaByColor.get('c')).toBeCloseTo(0.04, 4);
    const top = computePaintOverlay({ scene: s, painted, meshIds: [misc, slab], basis: fromAbove });
    expect(top.length).toBe(1);
    expect(top[0].area).toBeCloseTo(40000, -1);
    expect(top[0].anchor.x).toBeCloseTo(2100, -1);
    expect(top[0].anchor.y).toBeCloseTo(1100, -1);
    expect(computePaintOverlay({ scene: s, painted, meshIds: [misc, slab], basis: fromBelow })).toEqual([]);
  });

  it('face cachée par une pièce devant : rien ; sans la pièce devant : visible', async () => {
    const s = await load();
    const misc = meshAt(s, 'VBX-01', [2000, 150, -1200, 2200, 400, -1000])!;
    const slab = meshAt(s, 'VBX-01', [0, 0, -2500, 5900, 150, 0])!;
    const painted = paintScene(s, zonePaint(s, misc, [2100, 150, -1100]));
    expect(computePaintOverlay({ scene: s, painted, meshIds: [misc, slab], basis: fromBelow })).toEqual([]);
    const alone = computePaintOverlay({ scene: s, painted, meshIds: [misc], basis: fromBelow });
    expect(alone[0].area).toBeCloseTo(40000, -1);
  });

  it('face partiellement cachée : contour avec un trou, sans point répété', async () => {
    const s = await load();
    const misc = meshAt(s, 'VBX-01', [2000, 150, -1200, 2200, 400, -1000])!;
    const slab = meshAt(s, 'VBX-01', [0, 0, -2500, 5900, 150, 0])!;
    const painted = paintScene(s, zonePaint(s, slab, [500, 150, -500]));
    const r = computePaintOverlay({ scene: s, painted, meshIds: [misc, slab], basis: fromAbove });
    expect(r.length).toBe(1);
    expect(r[0].loops.length).toBe(2);
    const full = 5900 * 2500;
    expect(r[0].area).toBeGreaterThan(full - 40000 - 2000);
    expect(r[0].area).toBeLessThan(full - 40000 + 2000);
    expect(r[0].loops.map(loopArea).filter((a) => a < 0).length).toBe(1);
    for (const l of r[0].loops) {
      const keys = new Set<string>();
      for (let i = 0; i < l.length; i += 2) keys.add(`${l[i].toFixed(2)},${l[i + 1].toFixed(2)}`);
      expect(keys.size).toBe(l.length / 2);
    }
  });

  it('même face dans toutes les Viewbox identiques, cette Viewbox seulement', async () => {
    const s = await load();
    const misc = meshAt(s, 'VBX-01', [2000, 150, -1200, 2200, 400, -1000])!;
    const ctx = paintContext(s.index);
    const ns = nodeSoup(s, misc)!;
    const face = faceSelector(ns.soup, toLocalPoint(ns, [2100, 400, -1100]), 30)!;
    const opts = targetOptions(ctx, misc, face);
    const all = opts.find((o) => o.key === 'face-all')!;
    const here = opts.find((o) => o.key === 'face-box')!;
    expect(here.count).toBe(1);
    expect(all.count).toBe(s.index.modules.length);
    const p: PaintSettings = { ...zonePaint(s, misc, [2100, 400, -1100]), zones: [{ id: 'z', colorId: 'c', target: all.target, label: '', source: 'click', createdAt: '' }] };
    const painted = paintScene(s, p, ctx);
    expect(painted.nodes.size).toBe(s.index.modules.length);
    // 0,04 m² par Viewbox (même la Viewbox tournée de 90°)
    expect(painted.areaByColor.get('c')).toBeCloseTo(0.04 * s.index.modules.length, 3);
    expect(painted.noEffect.size).toBe(0);
  });
});

describe('peinture absente : vues dessinées comme avant', () => {
  it('sans peinture (ou peinture « Rien » sur la vue) la banque ne donne aucune donnée de peinture', async () => {
    const { LineworkBank } = await import('../../src/sheets/bank');
    const s = await load();
    const bank = new LineworkBank(s, {} as never);
    const vp = {
      id: 'v', type: 'viewport' as const, rect: { x: 0, y: 0, w: 100, h: 100 }, scale: 50, showLabel: false, renderStyle: 'trait' as const,
      request: { modelId: 'k', subset: { include: s.index.modules.map((m) => m.nodeId) }, view: { kind: 'top' as const, frame: 'world' as const }, style: {} as never },
    };
    expect('paint' in bank.data(vp)).toBe(false);
    const misc = meshAt(s, 'VBX-01', [2000, 150, -1200, 2200, 400, -1000])!;
    bank.setPaint({ painted: paintScene(s, zonePaint(s, misc, [2100, 400, -1100])), colors: new Map(), version: '1', isGlass: () => false });
    expect('paint' in bank.data({ ...vp, paint: 'off' })).toBe(false);
    expect(bank.paintOf({ ...vp, paint: 'off' })).toBeNull();
  });
});
