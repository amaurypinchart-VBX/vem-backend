// Zone d'influence de chaque appui sur un plateau de madriers (note ASIME3D « DDC Containers Opéra » du 24.11.2026,
// IKEA place de l'Opéra) : σ = R ELS / A zone + p ≤ 4,5 kN/m², zones aux mi-distances entre appuis et limitées au
// plateau. Leur descente de charges (poutre continue sur 5 appuis, charge uniforme sur les rives) met 1,86 kN sous un
// angle ; le calcul 3D d'une Viewbox (poids de la toiture et des poteaux aux angles) en met ≈ 5,4 kN : les zones
// d'angle dépassent 4,5 kN/m² avec leur propre méthode, sauf plateau qui déborde (≈ 30 cm).
import { describe, expect, it } from 'vitest';
import { sectionMap } from '../../src/structure/core/assemble';
import { computeCalage } from '../../src/structure/core/calage';
import { PAD_LAYOUT_DEFAULT, floorOfPlaced, layoutPads } from '../../src/structure/core/groundContact';
import { placedToEstimate } from '../../src/structure/core/mods';
import { platformVariants } from '../../src/structure/core/sleeperCompare';
import { influenceZones } from '../../src/structure/core/slabZones';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { calageInput, DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';
import { LOADS, vbx } from './studyHelpers';

describe('zones d’influence (mi-distances, limitées au bois)', () => {
  it('grille ASIME3D 6,00 × 5,00 m : 5 colonnes × 3 rangées d’appuis', () => {
    const xs = [150, 1500, 3000, 4500, 5850];
    const ys = [200, 2500, 4800];
    const pts = ys.flatMap((y, r) => xs.map((x, i) => ({ id: `${'ABC'[r]}${i + 1}`, at: [x, y] as [number, number] })));
    const z = influenceZones(pts, [[0, 0], [6000, 0], [6000, 5000], [0, 5000]]);
    // A2 : 0,825 → 2,25 m le long, 0 → 1,35 m en travers (leur 1,425 × 1,25 avec la limite de zone à mi-module)
    expect(z.get('A2')!.dims[0]).toBeCloseTo(1425, 6);
    expect(z.get('A1')!.dims[0]).toBeCloseTo(825, 6);
    expect(z.get('B3')!.dims).toEqual([1500, 2300]);
    // les zones couvrent exactement le plateau
    expect([...z.values()].reduce((a, x) => a + x.area, 0)).toBeCloseTo(30e6, 0);
    // deux appuis confondus : la zone est partagée
    const twin = influenceZones([{ id: 'a', at: [500, 500] }, { id: 'b', at: [500, 500] }], [[0, 0], [1000, 0], [1000, 1000], [0, 1000]]);
    expect(twin.get('a')!.area).toBeCloseTo(0.5e6, 0);
  });
});

describe('note ASIME3D : 5 appuis par grand côté, 2,5 t par Viewbox, 16 personnes, sans plaques de roulage', () => {
  const two = [vbx('A', 0, 0), vbx('B', 0, 2.5)];
  const pads = layoutPads(two.map(floorOfPlaced), { ...PAD_LAYOUT_DEFAULT, size: 200, thickness: 60, perSide: 3 });
  const q16 = (16 * 80 * 9.81) / 15e6;
  const loads = { ...LOADS, weightMode: 'weighed' as const, moduleWeight: 2500 * 9.81, live: q16, liveGround: q16, horizontalRatio: 0, windInService: 0, windOutOfService: 0 };
  const gc = { mode: 'pads' as const, pads, k: 30 };
  const hyp = { ...DEFAULT_HYP, bearingValue: 450, bearingUnit: 'kg/m²' as const, bearingMode: 'distributed' as const, publicMode: 'persons' as const, persons: 16, liveGround: 0.853, middleFeet: false };
  const choice = { upper: { b: 140, h: 240, grade: 'GL24h' as const }, lower: { b: 175, h: 63 } };

  it('disposition : 3 plaques entre les angles = 5 appuis par grand côté, celles de la jonction partagées (15 plaques)', () => {
    expect(pads).toHaveLength(15);
    const along = [...new Set(pads.map((p) => Math.round((p.x0 + p.x1) / 2)))].sort((a, b) => a - b);
    expect(along).toEqual([100, 1475, 2950, 4425, 5800]);
  });

  it('calcul 3D : les angles portent la toiture et les poteaux ; plateau sans débord ne passe pas, 30 cm de débord passe', async () => {
    const inpS: StudyInputs = { modules: two, edgeItems: [], pointItems: [], library: SEED, sections: sectionMap(SEED), loads, middleFeet: false, sls: true, options: { ...CALC_DEFAULTS, jacks: false }, blocking: [], groundContact: gc };
    const run = await runStudy(inpS, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    const inp = { ...calageInput(two.map(placedToEstimate), hyp, { plates: [], commercial: [] }, false, [], false, gc), reactions: run.ground, blocks: pads };
    // critère sous chaque plaque par défaut
    expect(inp.slabLocal).toBe(true);
    const res = computeCalage(inp);
    // appui d'angle (hors jonction) : ≈ 5,4 kN ELS, contre 1,86 kN dans la note (charge uniforme sur la rive)
    const corner = res.checks.find((c) => c.at[0] < 300 && c.at[1] > -300)!;
    expect(corner.Rzk / 1e3).toBeGreaterThan(5);
    expect(corner.Rzk / 1e3).toBeLessThan(6);
    const [flush] = platformVariants(inp, res, { ...choice, over: 0 });
    expect(flush.ok).toBe(false);
    const worst = flush.result!.checks.reduce((a, c) => (c.local!.eta > a.local!.eta ? c : a));
    expect(worst.local!.eta).toBeGreaterThan(1.25);
    // angle de la jonction : deux angles de Viewbox sur moins de 2 m²
    expect(worst.local!.plate.area / 1e6).toBeLessThan(2);
    // les appuis courants restent bien en dessous, comme dans la note
    const middle = flush.result!.checks.find((c) => Math.abs(c.at[0] - 2950) < 50 && c.at[1] > -300)!;
    expect(middle.local!.eta).toBeLessThan(0.6);
    const [over] = platformVariants(inp, res, { ...choice, over: 300 });
    expect(over.ok).toBe(true);
    expect(Math.max(...over.result!.checks.map((c) => c.local!.eta))).toBeLessThanOrEqual(1);
    // la pointe sous le bois reste une information, bien plus forte
    expect(over.result!.checks.every((c) => c.local!.zone!.peak > c.local!.q)).toBe(true);
    // contrôle seulement sous chaque Viewbox (décoché) : le plateau sans débord passe, zones données pour information
    const info = { ...inp, slabLocal: undefined };
    const [flushInfo] = platformVariants(info, computeCalage(info), { ...choice, over: 0 });
    expect(flushInfo.ok).toBe(true);
    expect(flushInfo.result!.slab!.local).toBeUndefined();
  }, 120_000);
});
