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

  // revue du 09.11.2026 (IKEA, place de l’Opéra, 450 kg/m²) : blocs qui ne portent rien, appuis communs, bilan, coupe
  const box = (i: number) => {
    const c = mods[i].corners;
    return { x0: Math.min(...c.map((p) => p[0])), x1: Math.max(...c.map((p) => p[0])), z0: Math.min(...c.map((p) => p[1])), z1: Math.max(...c.map((p) => p[1])) };
  };
  const blockAt = (id: string, x: number, z: number, under?: { feet: number | null; frame: number | null }) => ({
    id, label: 'Bloc', x0: x - 500, x1: x + 500, z0: z - 500, z1: z + 500, bottom: -339, top: -96, massKg: 102.5, massSource: 'computed' as const, material: 'C24', pieces: 1, ...(under ? { under } : {}),
  });

  it('bloc posé sous aucun pied : il ne porte rien mais son poids compte sur la dalle (sa zone et l’ensemble)', () => {
    const b0 = box(0);
    const loose = blockAt('BL9', (b0.x0 + b0.x1) / 2, (b0.z0 + b0.z1) / 2);
    const without = computeCalage(slab);
    const withBlock = computeCalage({ ...slab, blocks: [loose] });
    expect(withBlock.looseBlocks?.map((b) => b.id)).toEqual(['BL9']);
    const zone = (r: typeof without) => r.slab!.zones.find((z) => z.id === mods[0].id)!;
    expect(zone(withBlock).load - zone(without).load).toBeCloseTo(102.5 * 9.81, 3);
    expect(zone(withBlock).loose).toEqual(['BL9']);
    expect(withBlock.slab!.global.load - without.slab!.global.load).toBeCloseTo(102.5 * 9.81, 3);
    expect(withBlock.warnings.some((w) => /BL9\) — ils ne portent rien mais leur poids est compté sur la dalle/.test(w))).toBe(true);
    // l’autre Viewbox n’est pas touchée
    const other = (r: typeof without) => r.slab!.zones.find((z) => z.id === mods[1].id)!.load;
    expect(other(withBlock)).toBeCloseTo(other(without), 6);
  });

  it('bloc commun à deux Viewbox : chaque Viewbox reprend ses propres pieds (pas la moitié du bloc)', async () => {
    const { estimateReactions } = await import('../../src/structure/core/estimate');
    const norm = { ...calageInput(mods, { ...hyp450, publicMode: 'norm' as const }, { plates: [], commercial: [] }, true), bearingMode: 'distributed' as const, reactionsEnvelope: false };
    const est = estimateReactions(norm.modules, norm.estimate);
    // calcul 3D fictif : la première Viewbox deux fois plus lourde que l’autre
    const heavy = mods[0].id;
    const k = (r: (typeof est.reactions)[number], f: number) => ({ ...r, Rk: r.Rk * f, REd: r.REd * f, combos: r.combos?.map((c) => ({ ...c, R: c.R * f, Q: c.Q * f })) });
    const fem = { ...est, method: 'fem' as const, reactions: est.reactions.map((r) => (r.group.moduleIds.length === 1 && r.group.moduleIds[0] === heavy ? k(r, 2) : r)) };
    // angle commun aux deux Viewbox : un bloc sous les deux vérins d’angle voisins
    const pts = mods[0].corners.filter((p) => mods[1].corners.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 50));
    expect(pts.length).toBe(2);
    const twin = mods[1].corners.find((q) => Math.hypot(pts[0][0] - q[0], pts[0][1] - q[1]) < 50)!;
    const shared = blockAt('BL1', (pts[0][0] + twin[0]) / 2, (pts[0][1] + twin[1]) / 2);
    const r = computeCalage({ ...norm, reactions: fem, blocks: [shared] });
    const onBlock = r.checks.find((c) => c.block?.id === 'BL1')!;
    expect(onBlock.reaction.group.moduleIds.length).toBe(2);
    expect(onBlock.parts?.length).toBe(2);
    // attendu : pour chaque Viewbox, la combinaison ELS la plus lourde de la somme de ses propres vérins
    const own = (id: string) => {
      const by = new Map<string, number>();
      for (const g of fem.reactions)
        if (g.group.moduleIds.length === 1 && g.group.moduleIds[0] === id)
          for (const c of g.combos!) if (c.cls === 'SLS') by.set(c.combo, (by.get(c.combo) ?? 0) + c.R);
      return Math.max(...by.values());
    };
    for (const m of mods) expect(r.slab!.zones.find((z) => z.id === m.id)!.parts.feet).toBeCloseTo(own(m.id), 3);
  });

  it('bilan de la dalle sous chaque Viewbox : postes (Viewbox, objets portés, public, report, calage) = poids de la zone', () => {
    const items = [{ label: 'Vitrage', count: 3, N: 3 * 201 * 9.81, proposed: true as const }];
    const m2 = mods.map((m, i) => (i ? m : { ...m, carried: items[0].N, carriedItems: items }));
    const inp = { ...calageInput(m2, hyp450, { plates: [], commercial: [] }, true), bearingMode: 'distributed' as const, choices: { roadway: true }, roadwayPlates: (23 * 9.81) / 1e6 };
    const r = computeCalage(inp);
    for (const z of r.slab!.zones) {
      const sum = z.budget!.reduce((a, l) => a + l.N, 0);
      expect(sum).toBeCloseTo(z.load, 3);
      expect(z.budget![0]).toMatchObject({ key: 'box', N: 2564 * 9.81 });
      expect(z.budget!.find((l) => l.key === 'public')?.note).toMatch(/4 personnes × 80 kg/);
    }
    // plaques de roulage : tout leur poids, réparti sur la surface couverte
    const spread = r.slab!.zones.reduce((a, z) => a + z.budget!.find((l) => l.key === 'spread')!.N, 0);
    expect(spread).toBeCloseTo((23 * 9.81 * r.roadway.area) / 1e6, 3);
    const glazed = r.slab!.zones.find((z) => z.id === mods[0].id)!.budget!.find((l) => l.key === 'item')!;
    expect(glazed).toMatchObject({ label: 'Vitrage', count: 3, proposed: true });
  });

  it('coupe du calage : plaques de roulage → bloc → vérin (d’après le dessin) → dessous de la Viewbox, hauteur totale', () => {
    // vérins d’angle posés sur des blocs (platine sur le bloc, UPN 9,6 cm au-dessus), plaques de roulage de 20 mm
    const blocks = [0, 1].flatMap((i) => {
      const b = box(i);
      return [blockAt(`BL${2 * i + 1}`, b.x0 + 500, b.z0 + 500, { feet: -2, frame: 96 }), blockAt(`BL${2 * i + 2}`, b.x1 - 500, b.z1 - 500, { feet: -2, frame: 96 })];
    });
    const r = computeCalage({ ...slab, blocks, choices: { roadway: true }, roadwayThickness: 20 });
    expect(r.groundMode).toBe('jacks');
    const st = r.stacks!.find((s) => s.layers.some((l) => l.kind === 'block'))!;
    expect(st.layers.map((l) => l.kind)).toEqual(['roadway', 'block', 'jack']);
    expect(st.layers.map((l) => l.thickness)).toEqual([20, 243, 96]);
    expect(st.height).toBe(20 + 243 + 96);
    expect(st.underside).toBe(true);
    // 4 blocs identiques : une seule coupe
    expect(st.supports.length).toBe(4);
    // sans épaisseur des plaques de roulage : hauteur inconnue, partie connue gardée
    const r2 = computeCalage({ ...slab, blocks, choices: { roadway: true } });
    const st2 = r2.stacks!.find((s) => s.layers.some((l) => l.kind === 'block'))!;
    expect(st2.height).toBeNull();
    expect(st2.known).toBe(243 + 96);
  });
});
