// Dalle / plancher donné en charge répartie admissible (A. Pinchart 04.11.2026 : « la place accepte 450 kg au m², pas
// une pression ; mets le poids qu'il y aura sur le sol au m² à cet endroit ») : zone de dalle de chaque pied, poids au
// m², ensemble de l'installation.
import { describe, expect, it } from 'vitest';
import { computeCalage } from '../../src/structure/core/calage';
import { calageRemedies } from '../../src/structure/core/calageRemedies';
import { gridModules } from '../../src/structure/core/estimate';
import { calageInput, DEFAULT_HYP, bearingModeOf } from '../../src/ui/structure/GroundPanel';
import { planPlates } from '../../src/structure/report/groundSheet';

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

  it('chaque pied a sa zone de dalle : les zones couvrent exactement l’emprise, poids au m² = poids / surface', () => {
    const r = computeCalage(slab);
    const s = r.slab!;
    const poly = (c: Array<[number, number]>) => Math.abs(c.reduce((a, p, i) => a + p[0] * c[(i + 1) % c.length][1] - c[(i + 1) % c.length][0] * p[1], 0)) / 2;
    const footprint = mods.reduce((a, m) => a + poly(m.corners as Array<[number, number]>), 0);
    expect(s.zones.reduce((a, z) => a + z.area, 0)).toBeCloseTo(footprint, -3);
    expect(s.global.area).toBeCloseTo(footprint, -3);
    for (const c of r.checks) {
      const z = c.zone!;
      expect(z.q).toBeCloseTo(z.load / z.area, 12);
      expect(z.load).toBeGreaterThanOrEqual(c.Rzk);
      // le critère est la zone : la pression sous la plaque n'est plus qu'une information
      expect(c.etaGround).toBeCloseTo(z.eta, 12);
      expect(c.pressure).toBeCloseTo(z.q, 12);
      expect(c.steps[c.steps.length - 1].label).toMatch(/^Zone de dalle de /);
      expect(c.records.some((x) => x.key === 'slab.zone')).toBe(true);
    }
    // une zone d'angle est plus petite qu'une zone de milieu
    const areas = s.zones.map((z) => z.area).sort((a, b) => a - b);
    expect(areas[0]).toBeLessThan(areas[areas.length - 1] / 2);
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

  it('charge ponctuelle admissible donnée : comptée en plus de la zone', () => {
    const d = computeCalage({ ...slab, pointLoadMax: 3000 });
    expect(d.checks.some((c) => c.etaPoint > 1 && c.eta === Math.max(c.etaPoint, c.zone!.eta, c.etaC90, c.etaCapacity))).toBe(true);
    expect(d.warnings[0]).not.toContain('Charge ponctuelle admissible de la dalle inconnue');
  });

  it('plan : zones de dalle en pointillés avec le poids au m² (kg/m²)', () => {
    const d = computeCalage(slab);
    const plates = planPlates(d.checks, { slab: d.slab, label: () => ['x'] });
    const zones = plates.filter((p) => p.zone);
    expect(zones.length).toBeGreaterThanOrEqual(d.checks.length);
    expect(zones.filter((z) => z.label).every((z) => /kg\/m²$/.test(z.label![0]) && /kg sur .* m²$/.test(z.label![1]))).toBe(true);
    // en mode dalle, les plaques ne portent plus la pression
    expect(plates.filter((p) => !p.zone).every((p) => !p.label)).toBe(true);
  });
});
