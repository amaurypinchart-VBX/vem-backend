// Dalle / plancher donné en charge répartie admissible (A. Pinchart 04.11.2026 : « la place accepte 450 kg au m², pas
// une pression ; mets le poids qu'il y aura sur le sol au m² à cet endroit ») : dalle sous chaque Viewbox (06.11.2026,
// ajouter des appuis ne pénalise plus), poids au m², ensemble de l'installation.
import { describe, expect, it } from 'vitest';
import { computeCalage } from '../../src/structure/core/calage';
import { calageRemedies } from '../../src/structure/core/calageRemedies';
import { gridModules } from '../../src/structure/core/estimate';
import { calageInput, DEFAULT_HYP, bearingModeOf } from '../../src/ui/structure/GroundPanel';
import { checkPlan, planPlates, pressureLines } from '../../src/structure/report/groundSheet';
import { fmtNumber } from '../../src/structure/core/units';

const mods = gridModules(1, 2, [[1], [1]], false);
const hyp450 = { ...DEFAULT_HYP, bearingValue: 450, bearingUnit: 'kg/m²' as const, middleFeet: true, liveGround: 0.981, publicMode: 'persons' as const, persons: 4 };
const base = calageInput(mods, hyp450, { plates: [], commercial: [] }, true);
const slab = { ...base, bearingMode: 'distributed' as const };

describe('dalle en charge répartie admissible', () => {
  it('lecture de la valeur : dalle / toiture / exploitant = charge répartie, sol = pression ; choix enregistré prioritaire', () => {
    expect(bearingModeOf({ bearingPreset: 'meadow' })).toBe('pressure');
    expect(bearingModeOf({ bearingPreset: 'operator' })).toBe('distributed');
    expect(bearingModeOf({ bearingPreset: 'slab', bearingMode: 'pressure' })).toBe('pressure');
    expect(calageInput(mods, { ...hyp450, bearingPreset: 'operator' }, { plates: [], commercial: [] }, true).bearingMode).toBe('distributed');
  });

  it('une zone de dalle par Viewbox : les zones couvrent exactement l’emprise, poids au m² = poids / surface', () => {
    const r = computeCalage(slab);
    const s = r.slab!;
    const poly = (c: Array<[number, number]>) => Math.abs(c.reduce((a, p, i) => a + p[0] * c[(i + 1) % c.length][1] - c[(i + 1) % c.length][0] * p[1], 0)) / 2;
    const footprint = mods.reduce((a, m) => a + poly(m.corners as Array<[number, number]>), 0);
    expect(s.zones.map((z) => z.id).sort()).toEqual(mods.map((m) => m.id).sort());
    expect(s.zones.reduce((a, z) => a + z.area, 0)).toBeCloseTo(s.global.area, -3);
    // l'emprise, plus ce que les plaques automatiques dépassent (quelques cm aux angles)
    expect(s.global.area).toBeGreaterThanOrEqual(footprint - 1000);
    expect(s.global.area).toBeLessThan(footprint * 1.01);
    for (const c of r.checks) {
      const z = c.zone!;
      expect(z.supports).toContain(c.id);
      expect(z.q).toBeCloseTo(z.load / z.area, 12);
      // le critère est la dalle sous la Viewbox : la pression sous la plaque n'est plus qu'une information
      expect(c.etaGround).toBeCloseTo(z.eta, 12);
      expect(c.pressure).toBeCloseTo(z.q, 12);
      expect(c.steps[c.steps.length - 1].label).toMatch(/^Dalle sous VBX-0\d : /);
      expect(c.records.some((x) => x.key === 'slab.zone')).toBe(true);
    }
    // poids de la Viewbox = ses pieds dans une même combinaison : pas plus que la somme des maxima de ses pieds
    for (const z of s.zones) {
      const sumMax = r.checks.filter((c) => z.supports.includes(c.id)).reduce((a, c) => a + c.Rzk, 0);
      expect(z.parts.feet).toBeLessThanOrEqual(sumMax + 1);
      expect(z.parts.feet).toBeGreaterThan(0.5 * sumMax);
    }
    // ensemble = charge verticale simultanée + calage, pas la somme des pieds au pire cas
    const sumMax = r.checks.reduce((a, c) => a + c.Rzk, 0);
    expect(s.global.load).toBeLessThan(sumMax + 2000);
    expect(r.warnings[0]).toMatch(/^Dalle — charge répartie admissible/);
  });

  it('450 kg/m² : en pression ça ne passe pas, en charge répartie ça passe ; petites plaques du stock', () => {
    const p = computeCalage(base);
    expect(p.slab).toBeUndefined();
    expect(p.checks.some((c) => c.eta > 1)).toBe(true);
    const d = computeCalage(slab);
    expect(Math.max(...d.checks.map((c) => c.eta))).toBeLessThanOrEqual(1);
    expect(d.allPlates).toBe(true);
    // la plaque sert à poser le pied : pas de plaque géante dimensionnée pour la pression
    for (const c of d.checks) for (const l of c.layerList) expect(l.l * l.w).toBeLessThanOrEqual(1000 * 1000 + 1);
  });

  it('zone trop chargée : pistes d’information (alléger, répartir, charge ponctuelle à demander)', () => {
    const d = computeCalage({ ...slab, bearing: slab.bearing / 3 });
    expect(d.checks.some((c) => c.eta > 1)).toBe(true);
    const rem = calageRemedies({ ...slab, bearing: slab.bearing / 3 }, d);
    expect(rem.map((x) => x.key)).toEqual(['load']);
    expect(rem[0].details.join(' ')).toContain('m² de dalle');
  });

  it('plans : plaques de roulage dessinées (contour + texte) et même plan à l’écran et dans la fiche (checkPlan)', () => {
    const d = computeCalage({ ...slab, choices: { ...(slab.choices ?? {}), roadway: true } });
    expect(d.roadwayOn).toBe(true);
    expect(d.roadwayOutline?.length).toBe(1);
    const plan = checkPlan(d);
    const rw = plan.plates.filter((p) => p.roadway);
    expect(rw).toHaveLength(1);
    expect(rw[0].label).toEqual(['Plaques de roulage sur toute la surface']);
    expect(checkPlan(d, 'en').plates.find((p) => p.roadway)!.label).toEqual(['Roadway plates over the whole area']);
    const r = d.estimate.reactions[0];
    expect(plan.pointSub(r)).toMatch(/kN · η /);
    expect(computeCalage(slab).roadwayOutline).toBeUndefined();
  });

  it('charge ponctuelle admissible donnée : comptée en plus de la zone', () => {
    const d = computeCalage({ ...slab, pointLoadMax: 3000 });
    expect(d.checks.some((c) => c.etaPoint > 1 && c.eta === Math.max(c.etaPoint, c.zone!.eta, c.etaC90, c.etaCapacity))).toBe(true);
    expect(d.warnings[0]).not.toContain('Charge ponctuelle admissible de la dalle inconnue');
  });

  it('plan : zones de dalle en pointillés avec le poids au m² (kg/m²)', () => {
    const d = computeCalage(slab);
    const plates = planPlates(d.checks, { slab: d.slab, label: pressureLines });
    const zones = plates.filter((p) => p.zone);
    expect(zones.length).toBeGreaterThanOrEqual(mods.length);
    expect(zones.filter((z) => z.label).every((z) => /^Dalle : .* kg\/m²$/.test(z.label![0]) && /kg \/ .* m²$/.test(z.label![1]))).toBe(true);
    // chaque appui porte le poids réparti sur la dalle de sa Viewbox (pas la pression sous sa plaque)
    const sup = plates.filter((p) => !p.zone && !p.id.startsWith('T'));
    expect(sup.length).toBeGreaterThan(0);
    for (const p of sup) {
      const c = d.checks.find((x) => x.id === p.id)!;
      expect(p.label).toEqual([`${fmtNumber((c.zone!.q * 1e6) / 9.81, 0)} kg/m²`]);
    }
  });

  it('plaques de roulage qui dépassent tout autour : zones plus grandes, charge au m² plus faible', () => {
    const a = computeCalage({ ...slab, choices: { roadway: true } });
    const b = computeCalage({ ...slab, choices: { roadway: true, roadwayOverhang: 300 } });
    expect(b.slab!.global.area).toBeGreaterThan(a.slab!.global.area + 2e6);
    const corner = (r: typeof a) => r.slab!.zones.reduce((x, z) => (z.area < x.area ? z : x));
    expect(corner(b).area).toBeGreaterThan(corner(a).area);
    expect(Math.max(...b.slab!.zones.map((z) => z.q))).toBeLessThan(Math.max(...a.slab!.zones.map((z) => z.q)));
    // la répartition uniforme (mode pression) suit aussi la surface couverte
    expect(b.roadway.area).toBeGreaterThan(a.roadway.area);
  });

  it('plaque centrée qui dépasse de l’installation sous un angle : la zone de sa Viewbox s’agrandit (à fleur : non)', async () => {
    const { VIEWBOX_STOCK, plateKey } = await import('../../src/structure/core/ground');
    const big = VIEWBOX_STOCK.find((p) => p.length === 1000 && p.thickness === 36)!;
    const pick = { bySupport: {} as Record<string, Array<{ plate: string; n: number }>> };
    const r0 = computeCalage({ ...slab, stock: VIEWBOX_STOCK });
    const corner = r0.checks.find((c) => c.reaction.group.corners === 1 && c.reaction.group.moduleIds.length === 1)!;
    pick.bySupport[corner.id] = [{ plate: plateKey(big), n: 3 }];
    const flush = computeCalage({ ...slab, stock: VIEWBOX_STOCK, choices: { ...pick, placeBySupport: { [corner.id]: 'flush' } } });
    const centred = computeCalage({ ...slab, stock: VIEWBOX_STOCK, choices: { ...pick, placeBySupport: { [corner.id]: 'centered' } } });
    const z = (r: typeof r0) => r.checks.find((c) => c.id === corner.id)!.zone!;
    expect(z(flush).area).toBeCloseTo(z(r0).area, -3);
    // la plaque centrée dépasse d'environ 3/4 de m² autour de l'angle
    expect(z(centred).area).toBeGreaterThan(z(r0).area + 0.5e6);
    expect(z(centred).q).toBeLessThan(z(flush).q);
  });

  it('blocs sur plaques de roulage : « bloc posé sur les plaques de roulage »', async () => {
    const blk = { id: 'BL1', label: 'Bloc', x0: 0, x1: 0, z0: 0, z1: 0, bottom: -244, top: 0, massKg: 22, massSource: 'computed' as const, material: 'C24', pieces: 1 };
    const m0 = mods[0].corners;
    const xs = m0.map((p) => p[0]);
    const zs = m0.map((p) => p[1]);
    const x = Math.min(...xs) + 500;
    const zc = Math.min(...zs) + 500;
    const b = { ...blk, x0: x - 500, x1: x + 500, z0: zc - 500, z1: zc + 500 };
    const r = computeCalage({ ...slab, blocks: [b], choices: { roadway: true } });
    const t = r.types.find((x) => x.block)!;
    expect(t.chosen!.summary).toBe('bloc posé sur les plaques de roulage');
  });

  it('vérins + calcul 3D : chaque appui garde au moins la réaction de l’estimation (enveloppe)', async () => {
    const { estimateReactions } = await import('../../src/structure/core/estimate');
    const est = estimateReactions(slab.modules, slab.estimate);
    // calcul 3D fictif : pieds centraux presque déchargés, angles plus chargés
    const k = (r: (typeof est.reactions)[number], f: number) => ({ ...r, Rk: r.Rk * f, REd: r.REd * f, combos: r.combos?.map((c) => ({ ...c, R: c.R * f })) });
    const fem = { ...est, method: 'fem' as const, reactions: est.reactions.map((r) => k(r, r.group.middle ? 0.2 : 1.3)) };
    const env = computeCalage({ ...slab, reactions: fem });
    const only = computeCalage({ ...slab, reactions: fem, reactionsEnvelope: false });
    expect(env.estimate.envelope).toBe(true);
    expect(env.warnings.some((w) => w.startsWith('Pieds à vérin : le calcul 3D suppose'))).toBe(true);
    const mid = (r: typeof env) => Math.max(...r.estimate.reactions.filter((x) => x.group.middle).map((x) => x.Rk));
    expect(mid(env)).toBeGreaterThan(mid(only) * 3);
    const corner = (r: typeof env) => Math.max(...r.estimate.reactions.filter((x) => !x.group.middle).map((x) => x.Rk));
    expect(corner(env)).toBeCloseTo(corner(only), 6);
  });
});
