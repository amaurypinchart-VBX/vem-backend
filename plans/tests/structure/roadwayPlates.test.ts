// Plaques de roulage choisies sur une offre (A. Pinchart 17.11.2026 : « choisir sur une offre en location en acier,
// alu ou plastique ; que le calcul se base sur la résistance de ces plaques et leur pouvoir de répartir la charge et
// la pression au sol ») : raideur (fiche, plaque pleine, plaque pleine de même masse), répartition sur sol élastique,
// joints, appuis voisins, flexion, compression, puis le calage complet.
import { describe, expect, it } from 'vitest';
import { computeCalage } from '../../src/structure/core/calage';
import { gridModules } from '../../src/structure/core/estimate';
import { VIEWBOX_STOCK, bearingFrom } from '../../src/structure/core/ground';
import { ROADWAY_PLATES, findRoadwayPlate, roadwayReach, roadwaySpread, roadwayStiffness } from '../../src/structure/core/roadwayPlates';
import type { RoadwayPlate } from '../../src/structure/core/roadwayPlates';
import { checkChain } from '../../src/structure/core/spreading';
import { calageInput, DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';

const plate = (key: string) => ROADWAY_PLATES.find((p) => p.key === key)!;
const steel20 = plate('steel-2000x1000x20');
const amp = plate('box-amp-panel');
const terratrak = plate('envhyro-terratrak-plus');

describe('raideur des plaques de roulage', () => {
  it('tôle acier pleine : E t³ / 12', () => {
    const s = roadwayStiffness(steel20);
    expect(s.how).toBe('solid');
    expect(s.EI).toBeCloseTo((210000 * 20 ** 3) / 12, 0);
    expect(s.fd).toBe(235);
    expect(s.W).toBeCloseTo(400 / 6, 6);
  });
  it('aluminium profilé sans raideur publiée : plaque pleine de même masse (minimum)', () => {
    const s = roadwayStiffness(amp);
    // 104 kg sur 3 × 1,15 m = 30,1 kg/m² d'aluminium → 11,2 mm de métal plein
    const teq = 104 / (2700 * 3 * 1.15) * 1000;
    expect(s.how).toBe('mass');
    expect(s.teq).toBeCloseTo(teq, 6);
    expect(s.EI).toBeCloseTo((70000 * teq ** 3) / 12, 3);
    expect(s.fd).toBeCloseTo(110 / 1.1, 9);
  });
  it('plastique sans module du fabricant : raideur inconnue, seule l’épaisseur compte', () => {
    const s = roadwayStiffness(terratrak);
    expect(s.EI).toBeNull();
    expect(s.reason).toMatch(/module d’élasticité/);
    expect(roadwayReach(terratrak, 0.03)).toBe(38);
  });
  it('raideur du fabricant prioritaire', () => {
    expect(roadwayStiffness({ ...amp, EI: 2e8 }).EI).toBe(2e8);
  });
});

describe('répartition sous un appui', () => {
  const k = 0.03; // sol moyen 30 MN/m³
  const c = Math.pow((4 * (210000 * 8000) / 12) / k, 0.25);
  it('tôle acier 20 mm au milieu d’une plaque : c = (4 E I / k)^¼ ≈ 37 cm de chaque côté', () => {
    const r = roadwaySpread({ plate: steel20, contact: [150, 150], Rk: 30000, REd: 40500, k, position: 'middle' });
    expect(r.mode).toBe('stiffness');
    expect(r.overhang).toBeCloseTo(c, 6);
    expect(c).toBeCloseTo(369.6, 1);
    expect(r.footprint[0]).toBeCloseTo(150 + 2 * c, 6);
    expect(r.footprint[1]).toBeCloseTo(150 + 2 * c, 6);
    const w = (314 * 9.81) / 2e6;
    expect(r.pressure).toBeCloseTo(30000 / (150 + 2 * c) ** 2 + w, 9);
    // flexion : M = q · c² / 2 ≤ 235 × 20² / 6
    expect(r.M).toBeCloseTo(((40500 / (150 + 2 * c) ** 2) * c * c) / 2, 6);
    expect(r.MRd).toBeCloseTo((235 * 400) / 6, 6);
  });
  it('sur un joint : verrou = moitié, bord à bord = quart de la répartition à travers le joint', () => {
    const loose = roadwaySpread({ plate: steel20, contact: [150, 150], Rk: 30000, REd: 40500, k, position: 'joint' });
    expect(loose.joint).toBe('loose');
    expect(loose.footprint[0] * loose.footprint[1]).toBeCloseTo((150 + 0.5 * c) * (150 + 2 * c), 3);
    const locked = roadwaySpread({ plate: { ...steel20, joints: 'locked' }, contact: [150, 150], Rk: 30000, REd: 40500, k, position: 'joint' });
    expect(locked.footprint[0] * locked.footprint[1]).toBeCloseTo((150 + c) * (150 + 2 * c), 3);
    // bord libre : moment × 1,29 (Hetényi)
    expect(loose.M).toBeGreaterThan(0);
  });
  it('emprise limitée à mi-distance de l’appui voisin, et à la plaque posée bord à bord', () => {
    const r = roadwaySpread({ plate: steel20, contact: [150, 150], Rk: 30000, REd: 40500, k, position: 'middle', cell: 600 });
    expect(r.footprint).toEqual([600, 600]);
    expect(r.limits).toContain('cell');
    const small = roadwaySpread({ plate: { ...steel20, l: 600, w: 500, massKg: 47 }, contact: [150, 150], Rk: 30000, REd: 40500, k, position: 'middle' });
    expect(Math.min(...small.footprint)).toBeCloseTo(500, 6);
    expect(Math.max(...small.footprint)).toBeCloseTo(600, 6);
    expect(small.limits).toContain('plate');
  });
  it('près du bord des plaques de roulage : emprise centrée sous la charge, ≤ 2 × la distance au bord', () => {
    const r = roadwaySpread({ plate: steel20, contact: [150, 150], Rk: 30000, REd: 40500, k, position: 'middle', edge: [185, Infinity] });
    expect(r.footprint[0]).toBeCloseTo(370, 6);
    expect(r.footprint[1]).toBeCloseTo(150 + 2 * c, 6);
    expect(r.limits).toContain('edge');
  });
  it('plaque trop faible en flexion : emprise réduite jusqu’à MEd = MRd', () => {
    const weak: RoadwayPlate = { ...steel20, key: 'x', fm: 20 };
    const r = roadwaySpread({ plate: weak, contact: [150, 150], Rk: 60000, REd: 81000, k, position: 'middle' });
    expect(r.mode).toBe('strength');
    expect(r.M).toBeCloseTo(r.MRd, 3);
    expect(r.overhang).toBeLessThan(c);
  });
  it('plastique sans module : diffusion dans l’épaisseur, compression sous le pied vérifiée', () => {
    const r = roadwaySpread({ plate: terratrak, contact: [150, 150], Rk: 30000, REd: 40500, k, position: 'middle' });
    expect(r.mode).toBe('thickness');
    expect(r.footprint).toEqual([150 + 2 * 38, 150 + 2 * 38]);
    expect(r.fcd).toBeCloseTo(7.288 / 1.3, 9);
    expect(r.sigmaC).toBeCloseTo(40500 / 22500, 9);
  });
});

describe('chaîne d’un appui sur plaque de roulage', () => {
  it('pied → plaque de roulage → sol : étape, textes, taux', () => {
    const ch = checkChain({ Rzk: 30000, REd: 40500, contact: [150, 150], contactLabel: 'Platine de vérin 15 × 15 cm', layers: [], bearing: 0.1, subgrade: 0.03, roadwayPlate: { plate: steel20, position: 'middle' } });
    const last = ch.steps[ch.steps.length - 1];
    expect(last.label).toBe('+ Plaque de roulage « Tôle de roulage acier 2 000 × 1 000 × 20 mm »');
    expect(last.note).toMatch(/répartit jusqu’à 37 cm autour de l’appui/);
    expect(ch.records.map((r) => r.key)).toEqual(['roadway.spread', 'roadway.bending', 'spread.ground']);
    expect(ch.etaGround).toBeCloseTo(last.pressure / 0.1, 9);
    expect(ch.eta).toBeLessThan(1);
  });
  it('plaque plastique : écrasement sous un petit pied très chargé signalé', () => {
    const ch = checkChain({ Rzk: 150000, REd: 202500, contact: [150, 150], contactLabel: 'pied', layers: [], bearing: 10, subgrade: 0.03, roadwayPlate: { plate: terratrak, position: 'middle' } });
    expect(ch.etaC90).toBeCloseTo(202500 / 22500 / (7.288 / 1.3), 6);
    expect(ch.problems.join(' ')).toMatch(/écrasée sous l’appui/);
  });
});

describe('calage complet avec une plaque de roulage choisie', () => {
  const mods = gridModules(1, 2, [[1], [1]], false);
  const hyp = { ...DEFAULT_HYP, bearingValue: 60, bearingUnit: 'kN/m²' as const, middleFeet: true, subgrade: 'medium' };
  const input = { ...calageInput(mods, hyp, { plates: [], commercial: [] }, true), stock: VIEWBOX_STOCK };

  it('sans modèle de plaque : ancien calcul uniforme, signalé', () => {
    const r = computeCalage({ ...input, choices: { roadway: true } });
    expect(r.roadwayPlate).toBeUndefined();
    expect(r.warnings.some((w) => /modèle de plaque non choisi/.test(w))).toBe(true);
    expect(r.checks[0].pressure).toBeCloseTo(r.roadway.mean, 9);
  });

  it('tôle acier : chaque appui réparti par la tôle, pression bien au-dessus de la moyenne uniforme', () => {
    const r = computeCalage({ ...input, choices: { roadway: true, roadwayPlate: steel20.key } });
    expect(r.roadwayPlate!.plate.key).toBe(steel20.key);
    expect(r.roadwayPlate!.reach).toBeCloseTo(roadwayReach(steel20, 0.03), 6);
    for (const c of r.checks) {
      expect(c.steps[c.steps.length - 1].label).toMatch(/Plaque de roulage « Tôle de roulage acier/);
      expect(c.pressure).toBeGreaterThan(r.roadway.mean);
    }
    expect(r.warnings.some((w) => /modèle de plaque non choisi/.test(w))).toBe(false);
    // matériel : nombre de plaques pour couvrir l'emprise
    const line = r.materials.find((m) => m.label.startsWith('Plaques de roulage'))!;
    expect(line.quantity).toBe(Math.ceil(r.roadway.area / 2e6));
    expect(line.massKg).toBe(line.quantity * 314);
    expect(r.stacks!.some((s) => s.layers.some((l) => l.kind === 'roadway' && l.thickness === 20))).toBe(true);
  });

  it('plaque plastique sans module : presque pas de répartition, plaques du stock ajoutées sous les pieds', () => {
    const steel = computeCalage({ ...input, choices: { roadway: true, roadwayPlate: steel20.key } });
    const plastic = computeCalage({ ...input, choices: { roadway: true, roadwayPlate: terratrak.key } });
    expect(plastic.warnings.some((w) => /module d’élasticité du plastique/.test(w))).toBe(true);
    // à plaques égales sous le pied, le plastique répartit bien moins que l'acier
    // pied posé directement sur la plaque de roulage (choix « aucune plaque » pour chaque type)
    const byType = Object.fromEntries(steel.types.map((t) => [t.typeKey, []]));
    const bare = (key: string) => computeCalage({ ...input, choices: { roadway: true, roadwayPlate: key, byType } });
    const pS = Math.max(...bare(steel20.key).checks.map((c) => c.pressure));
    const pP = Math.max(...bare(terratrak.key).checks.map((c) => c.pressure));
    // (aux bords de l'installation, la tôle aussi ne porte que sur la partie centrée sous la charge)
    expect(pP).toBeGreaterThan(2 * pS);
    // automatique : les plus petites plaques du stock qui suffisent, posées sur la plaque de roulage
    expect(plastic.checks.every((c) => c.eta <= 1)).toBe(true);
    expect(plastic.checks.some((c) => c.layerList.length > 0)).toBe(true);
    expect(steel.checks.filter((c) => c.layerList.length > 0).length).toBeLessThanOrEqual(plastic.checks.filter((c) => c.layerList.length > 0).length);
    const t = plastic.types.find((x) => x.checks.some((c) => c.layerList.length))!;
    expect(t.chosen!.title).toBe('Plaques du stock sous le pied, sur les plaques de roulage');
    expect(t.chosen!.summary).toMatch(/sur plaques de roulage « Terratrak Plus/);
  });

  it('plaque saisie à la main (fiche d’un loueur) : module du plastique donné → vraie répartition', () => {
    const custom: RoadwayPlate = { ...terratrak, key: 'custom', name: 'Plaque PEHD pleine 20 mm', custom: true, t: 20, massKg: 54, l: 3000, w: 1000, E: 300 };
    expect(findRoadwayPlate('custom', custom)).toBe(custom);
    const r = computeCalage({ ...input, stock: [], choices: { roadway: true, roadwayPlate: 'custom', roadwayCustom: custom } });
    const c0 = r.checks[0];
    expect(c0.steps[c0.steps.length - 1].note).toMatch(/répartit jusqu’à/);
    expect(r.roadwayPlate!.reach).toBeCloseTo(Math.pow((4 * 300 * 20 ** 3) / 12 / 0.03, 0.25), 6);
  });

  it('dalle en charge répartie : le débord des plaques ne compte que jusqu’où elles répartissent', () => {
    const slab = { ...calageInput(mods, { ...hyp, bearingValue: 450, bearingUnit: 'kg/m²' as const, subgrade: 'slab' }, { plates: [], commercial: [] }, true), bearingMode: 'distributed' as const };
    const wide = (key: string) => computeCalage({ ...slab, choices: { roadway: true, roadwayPlate: key, roadwayOverhang: 500 } });
    const legacy = computeCalage({ ...slab, choices: { roadway: true, roadwayOverhang: 500 } });
    const area = (r: ReturnType<typeof computeCalage>) => r.slab!.zones.reduce((s, z) => s + z.area, 0);
    // tôle acier sur dalle (k = 1 N/mm³) : ≈ 15 cm de répartition ; plastique : son épaisseur
    expect(area(wide(steel20.key))).toBeLessThan(area(legacy));
    expect(area(wide(terratrak.key))).toBeLessThan(area(wide(steel20.key)));
    expect(wide(steel20.key).checks.every((c) => c.layerList.length === 0)).toBe(true);
  });

  it('appuis sur blocs : le bloc répartit sur la plaque de roulage (plus d’avertissement « répartition uniforme »)', () => {
    const xs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[0])))].sort((a, b) => a - b);
    const zs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[1])))].sort((a, b) => a - b);
    const blocks = [xs[0], xs[xs.length - 1]].flatMap((x, i) =>
      [zs[0], zs[zs.length - 1]].map((z, j) => ({ id: `BL${2 * i + j + 1}`, label: 'S', x0: x - 400, x1: x + 400, z0: z - 400, z1: z + 400, bottom: -200, top: 0, massKg: 80, massSource: 'computed' as const, material: 'C24', pieces: 1 })),
    );
    const r = computeCalage({ ...input, bearing: bearingFrom(100, 'kN/m²'), blocks, choices: { roadway: true, roadwayPlate: steel20.key } });
    const onBlock = r.checks.filter((c) => c.block);
    expect(onBlock.length).toBeGreaterThan(0);
    for (const c of onBlock) expect(c.steps.map((s) => s.label).slice(-1)[0]).toMatch(/Plaque de roulage/);
    expect(r.warnings.some((w) => /Plaques de roulage et blocs de calage/.test(w))).toBe(false);
  });
});
