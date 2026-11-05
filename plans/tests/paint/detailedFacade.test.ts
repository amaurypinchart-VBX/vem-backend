// Façade très détaillée peinte (bug 04–05.11.2026, Xiaomi : « ça plante depuis la peinture ») : une région par pièce,
// des dizaines de milliers par élévation, gardées pour 400 vues et envoyées une à une à svg2pdf. Maintenant : les plus
// grandes régions gardent leur repère, les autres sont réunies sans repère ; seuls les contours qui se recouvrent sont
// réunis par Clipper ; la banque garde les repères dans un budget ; le PDF écrit les contours directement.
import { describe, expect, it } from 'vitest';
import { Clipper, Paths64 } from 'clipper2-js';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES } from '../../src/core/classification';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { makeSketchupDae } from '../fixtures/sketchupDae';
import { viewBasis } from '../../src/core/views';
import { paintContext } from '../../src/core/paint/resolve';
import type { PaintSettings } from '../../src/core/paint/types';
import { makeGlassTest } from '../../src/linework/packets';
import { paintScene } from '../../src/linework/paintScene';
import { exteriorSurvey, hasExteriorSurvey, prepareExteriorSurvey } from '../../src/linework/paintExterior';
import { TAGGED_REGIONS, computePaintOverlay, overlapClusters } from '../../src/linework/paintOverlay';
import { subsetMeshes } from '../../src/linework/subset';
import { loopsRun } from '../../src/sheets/paintSheet';
import { LineworkBank } from '../../src/sheets/bank';
import type { PaintRegion } from '../../src/linework/paintOverlay';

const sq = (x: number, y: number, w: number) => Clipper.makePath([x, y, x + w, y, x + w, y + w, x, y + w]);
const paths = (...ps: ReturnType<typeof sq>[]) => {
  const o = new Paths64();
  for (const p of ps) o.push(p);
  return o;
};

describe('façade très détaillée', () => {
  it('regroupement : seuls les contours de morceaux différents qui se recouvrent sont réunis', () => {
    const a = paths(sq(0, 0, 10), sq(100, 0, 10));
    const b = paths(sq(5, 5, 10), sq(300, 0, 10));
    const c = paths(sq(200, 0, 10));
    const groups = overlapClusters([a, b, c]);
    // a[0] + b[0] se recouvrent ; a[1], b[1], c seuls
    expect(groups.length).toBe(4);
    const both = groups.find((g) => g.length === 2)!;
    expect(both.map((g) => g.length)).toEqual([1, 1]);
    // emprises qui se touchent seulement par un bord : pas réunies
    expect(overlapClusters([paths(sq(0, 0, 10)), paths(sq(10, 0, 10))]).length).toBe(2);
  });

  it('bardage de 4 Viewbox : 25 régions au plus par couleur, une seule sans repère, surfaces conservées', async () => {
    const res = await ingest({ fileName: 'b.dae', data: new TextEncoder().encode(makeSketchupDae({ modules: 4, cladding: 40 })).buffer as ArrayBuffer, sha256: 'b', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const s = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'b');
    const glass = makeGlassTest(/VITRE|GLASS|VERRE/);
    const ctx = paintContext(s.index);
    const paint: PaintSettings = {
      v: 1,
      colors: [{ id: 'c', tag: 'P1', name: '', system: 'RAL', code: '7016', hex: '#383E42', createdAt: '' }],
      zones: [{ id: 'z', colorId: 'c', target: { scope: 'exterior', match: {}, exterior: { sides: ['long', 'short'], exclude: [] } }, label: '', source: 'click', createdAt: '' }],
      updatedAt: '',
    };
    // relevé par tranches (sans figer la page), retrouvé ensuite tel quel par paintScene
    expect(hasExteriorSurvey(s, glass)).toBe(false);
    const sv = await prepareExteriorSurvey(s, ctx, glass);
    expect(hasExteriorSurvey(s, glass)).toBe(true);
    expect(exteriorSurvey(s, ctx, glass)).toBe(sv);
    const painted = paintScene(s, paint, ctx, glass);
    const meshIds = subsetMeshes(s, { include: s.index.modules.map((m) => m.nodeId) });
    const regions = computePaintOverlay({ scene: s, painted, meshIds, basis: viewBasis({ kind: 'front', frame: 'world' }, s.frames), isGlass: glass, glassTransparent: false });
    expect(regions.length).toBeLessThanOrEqual(TAGGED_REGIONS + 1);
    const tail = regions.filter((r) => r.anchor.d < 0);
    expect(tail.length).toBe(1);
    // chaque tuile garde son contour (avant : une région par tuile, 2 737 régions pour cette vue)
    expect(regions.reduce((n, r) => n + r.loops.length, 0)).toBeGreaterThanOrEqual(2737);
    // même surface peinte visible que l'ancien calcul (tout réuni deux à deux) : 64 568 412 mm²
    expect(regions.reduce((a, r) => a + r.area, 0)).toBeCloseTo(64568412, -1);
  }, 120000);

  it('contours en une polyligne (séparés par NaN, chaque contour refermé)', () => {
    const run = loopsRun([Float64Array.from([0, 0, 1, 0, 1, 1]), Float64Array.from([5, 5, 6, 5, 6, 6])]);
    expect([...run].map((v) => (Number.isNaN(v) ? 'n' : v))).toEqual([0, 0, 1, 0, 1, 1, 0, 0, 'n', 'n', 5, 5, 6, 5, 6, 6, 5, 5, 'n', 'n']);
  });

  it('banque : repères de peinture gardés dans un budget (les plus anciens partent, la vue affichée reste)', () => {
    const bank = new LineworkBank({ frames: new Map(), index: { modules: [] } } as never, { cacheKey: async () => 'k' } as never);
    bank.maxPaintBytes = 2_000_000;
    const region = (n: number): PaintRegion => ({ colorId: 'c', loops: [new Float64Array(n)], anchor: { x: 0, y: 0, d: 1 }, area: 1 });
    const store = (base: string, n: number) => (bank as unknown as { storePaint(b: string, v: string, r: PaintRegion[], m: string[]): void }).storePaint(base, '1', [region(n)], []);
    const realNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      store('a', 100_000); // ≈ 0,8 Mo
      now += 10_000;
      store('b', 100_000);
      now += 10_000;
      store('c', 100_000); // dépasse 2 Mo : « a » (la plus ancienne) part
      expect(bank.paintMemoryUse().views).toBe(2);
      expect(bank.paintMemoryUse().bytes).toBeLessThanOrEqual(2_000_000);
      // utilisées il y a moins de 5 s : gardées même au-delà du budget
      store('d', 100_000);
      store('e', 100_000);
      expect(bank.paintMemoryUse().views).toBe(3);
    } finally {
      Date.now = realNow;
    }
  });
});
