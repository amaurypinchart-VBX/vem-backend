// Calage sur le modèle SCIA de la note statico 24-0569 « Viewbox – Qatar » (annexe B, extraite du PDF non versionné :
// plans/reference-reports/extract/qatar-model.json, ou VEM_REFS=<dossier>) : 3 Viewbox au sol dont une perpendiculaire
// (jonction en T) et 3 Viewbox empilées. Le modèle assemblé par l'outil doit contenir tous les nœuds des Viewbox SCIA,
// les mêmes contacts d'angle, les mêmes boulons aux écarts documentés près, et le même poids propre.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PlacedModule } from '../../src/structure/core/assemble';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import type { Vec3 } from '../../src/structure/core/fem/types';
import { buildLoadCases } from '../../src/structure/core/loads';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';

const file = [process.env.VEM_REFS, join(__dirname, '../../reference-reports/extract'), '/workspaces/vem-backend/plans/reference-reports/extract']
  .filter((x): x is string => !!x)
  .map((d) => join(d, 'qatar-model.json'))
  .find((f) => existsSync(f));

interface SciaModel {
  nodes: Record<string, [number, number, number]>;
  members: Record<string, { family: string; section: string; material: string; length: number; i: string; j: string }>;
}

const entry = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
/** Viewbox posée au coin SketchUp (x, y) en m, grand côté selon +X (θ = 0) ou −Y (θ = 90°) ; monde = (x, z, −y). */
function vbx(id: string, x: number, y: number, theta: 0 | 90, level: number): PlacedModule {
  const [u, v]: [Vec3, Vec3] = theta === 0 ? [[1, 0, 0], [0, 0, -1]] : [[0, 0, 1], [1, 0, 0]];
  return { id, level, origin: [x * 1000, level * 3080, -y * 1000], u, v, params: entry.params!, templateKey: entry.key };
}
/** Plan Qatar : A (0 ; 0), B (0 ; 2,5) le long de X, C (5,9 ; 5,0) perpendiculaire, sur deux niveaux. */
const modules = [0, 1].flatMap((lv) => [vbx(`A${lv}`, 0, 0, 0, lv), vbx(`B${lv}`, 0, 2.5, 0, lv), vbx(`C${lv}`, 5.9, 5.0, 90, lv)]);
const key = (p: [number, number, number]) => p.map((c) => Math.round(c * 1000)).join(':');

describe.skipIf(!file)('calage statico 24-0569 (Qatar, modèle SCIA)', () => {
  const M = JSON.parse(readFileSync(file!, 'utf8')) as SciaModel;
  const m = assembleStructure(modules, { sections: sectionMap(SEED), jacks: false, middleFeet: false, upliftReleases: 'vertical', calibration: true });
  const ours = (n: number) => key([m.fem.nodes[n].x / 1000, -m.fem.nodes[n].z / 1000, m.fem.nodes[n].y / 1000]);
  const viewboxFamily = (f: string) => /^(Randträger|Deckenträger|Bodenträger|Stütze|Fußaufnahme)/.test(f);
  const pairKey = (a: string, b: string) => [a, b].sort().join(' | ');

  it('tous les nœuds des Viewbox SCIA existent dans le modèle assemblé', () => {
    expect(m.errors).toEqual([]);
    const sciaNodes = new Set<string>();
    for (const b of Object.values(M.members)) if (viewboxFamily(b.family)) for (const n of [b.i, b.j]) if (M.nodes[n]) sciaNodes.add(key(M.nodes[n]));
    const oursSet = new Set(m.fem.nodes.map((_, k) => ours(k)));
    expect(sciaNodes.size).toBe(360);
    expect([...sciaNodes].filter((k) => !oursSet.has(k))).toEqual([]);
  });

  it('contacts d’angle identiques (24), jonction en T comprise', () => {
    const scia = new Set(
      Object.values(M.members)
        .filter((b) => b.family.startsWith('Druckkontakt_horizontal'))
        .map((b) => pairKey(key(M.nodes[b.i]), key(M.nodes[b.j]))),
    );
    const mine = new Set(m.fem.members.filter((b) => b.tag === 'contact').map((b) => pairKey(ours(b.i), ours(b.j))));
    expect(mine).toEqual(scia);
  });

  it('boulons : ceux de SCIA, sauf le perçage sur site (A1 / C1) ; en plus B / C en y = 2,71 m (perçages alignés)', () => {
    // SCIA : deux demi-boulons par boulon, reliés à un nœud milieu → boulon = ses deux nœuds de rive
    const halves = Object.values(M.members).filter((b) => b.family.startsWith('Verschraubung'));
    const byMiddle = new Map<string, string[]>();
    for (const b of halves) {
      const mid = [b.i, b.j].find((n) => halves.filter((h) => h.i === n || h.j === n).length === 2)!;
      const rim = mid === b.i ? b.j : b.i;
      byMiddle.set(mid, [...(byMiddle.get(mid) ?? []), key(M.nodes[rim])]);
    }
    const scia = new Set([...byMiddle.values()].map(([a, b]) => pairKey(a, b)));
    const mine = new Set(m.fem.members.filter((b) => b.tag === 'bolt').map((b) => pairKey(ours(b.i), ours(b.j))));
    const onlyScia = [...scia].filter((k) => !mine.has(k));
    const onlyOurs = [...mine].filter((k) => !scia.has(k)).sort();
    expect(scia.size).toBe(16);
    expect(onlyScia).toEqual([pairKey('5895:210:5870', '5905:210:5870')]);
    expect(onlyOurs).toEqual([pairKey('5895:2710:0', '5905:2710:0'), pairKey('5895:2710:3080', '5905:2710:3080'), pairKey('5895:2710:5870', '5905:2710:5870')].sort());
    // pas de boulons en toiture du niveau 0 (Viewbox du dessus)
    expect([...mine].some((k) => k.includes(':2790'))).toBe(false);
  });

  it('liaisons d’angle entre niveaux : 12 ; longueurs de barres par famille = SCIA ; poids propre', () => {
    expect(m.fem.members.filter((b) => b.tag === 'corner-link')).toHaveLength(12);
    const sciaLen = (f: string) => Object.values(M.members).filter((b) => b.family.startsWith(f)).reduce((s, b) => s + b.length, 0);
    const ourLen = (...fs: string[]) =>
      m.meta.reduce((s, x, k) => {
        if (!fs.includes(x.family)) return s;
        const b = m.fem.members[k];
        const A = m.fem.nodes[b.i];
        const B = m.fem.nodes[b.j];
        return s + Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z) / 1000;
      }, 0);
    expect(ourLen('rim-floor', 'rim-roof')).toBeCloseTo(sciaLen('Randträger'), 6);
    expect(ourLen('secondary-roof')).toBeCloseTo(sciaLen('Deckenträger'), 6);
    expect(ourLen('secondary-floor')).toBeCloseTo(sciaLen('Bodenträger'), 6);
    expect(ourLen('column')).toBeCloseTo(sciaLen('Stütze'), 6);
    expect(ourLen('foot-corner')).toBeCloseTo(sciaLen('Fußaufnahme_Ecke'), 2);
    expect(ourLen('foot-middle')).toBeCloseTo(sciaLen('Fußaufnahme_mitte'), 6);
    // plats de réception : 8 par Viewbox dans SCIA (lignes de l'annexe en partie perdues à l'extraction)
    expect(sciaLen('Fußaufnahme_Plattenersatz')).toBeLessThanOrEqual(ourLen('foot-plate') + 1e-9);
    const loads = buildLoadCases(m, {
      moduleWeight: 0,
      ceiling: 0,
      floorFinish: 0,
      live: 0,
      roofLive: 0,
      horizontalRatio: 0,
      roofAccessible: false,
      evacuateTopLevel: false,
      windInService: 0,
      windOutOfService: 0,
      cp: { windward: 0.8, leeward: -0.5, parallel: -0.8, roofStability: -0.7 },
      edgeItems: [],
      pointItems: [],
    });
    // G1 SCIA = 100,86 kN avec l'escalier ; les 6 Viewbox seules ≈ 99,9 kN
    const g1 = -loads.cases.find((c) => c.id === 'G1')!.resultant[1] / 1e3;
    expect(g1).toBeGreaterThan(99);
    expect(g1).toBeLessThan(100.86);
  });
});
