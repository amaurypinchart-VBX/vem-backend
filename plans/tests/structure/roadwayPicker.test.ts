// Choix de la plaque de roulage à l'étape 5 (17.11.2026) : catalogue acier / aluminium / plastique, plaque saisie depuis
// la fiche d'un loueur, position des pieds sur les plaques — monté dans jsdom avec le vrai calage.
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { computeCalage } from '../../src/structure/core/calage';
import { gridModules } from '../../src/structure/core/estimate';
import type { CalageChoices } from '../../src/structure/core/spreading';
import { RoadwayPicker } from '../../src/ui/structure/RoadwayPicker';
import type { RoadwayPatch } from '../../src/ui/structure/RoadwayPicker';
import { calageInput, DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mods = gridModules(1, 2, [[1], [1]], false);
const input = calageInput(mods, { ...DEFAULT_HYP, bearingValue: 60, bearingUnit: 'kN/m²' as const, middleFeet: true, subgrade: 'medium' }, { plates: [], commercial: [] }, true);

async function mount(choices: CalageChoices) {
  const patches: RoadwayPatch[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const result = computeCalage({ ...input, choices });
  await act(async () => root.render(createElement(RoadwayPicker, { result, choices, onChange: (p: RoadwayPatch) => patches.push(p) })));
  return { host, root, patches };
}

const change = (el: Element, value: string) => {
  const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('choix de la plaque de roulage', () => {
  it('catalogue par matériau, choix d’une tôle acier, position des pieds', async () => {
    const { host, root, patches } = await mount({ roadway: true });
    const sel = host.querySelector('[data-testid="roadway-plate"]') as HTMLSelectElement;
    expect([...sel.querySelectorAll('optgroup')].map((g) => g.label)).toEqual(['Acier', 'Aluminium', 'Plastique (PEHD, PP…)']);
    expect(sel.textContent).toContain('Terratrak Plus');
    expect(host.querySelector('[data-testid="roadway-position"]')).toBeNull();
    await act(async () => change(sel, 'steel-2000x1000x20'));
    expect(patches).toEqual([{ roadwayPlate: 'steel-2000x1000x20' }]);
    await act(async () => root.unmount());
  });

  it('plaque choisie : ce que le calcul en retient ; plastique sans module signalé', async () => {
    const steel = await mount({ roadway: true, roadwayPlate: 'steel-2000x1000x20' });
    expect(steel.host.querySelector('[data-testid="roadway-plate-info"]')!.textContent).toMatch(/répartit la charge d’un pied jusqu’à ≈ 37 cm/);
    await act(async () => change(steel.host.querySelector('[data-testid="roadway-position"]')!, 'middle'));
    expect(steel.patches).toEqual([{ roadwayPosition: 'middle' }]);
    await act(async () => steel.root.unmount());
    const plastic = await mount({ roadway: true, roadwayPlate: 'envhyro-terratrak-plus' });
    expect(plastic.host.querySelector('[data-testid="roadway-plate-info"]')!.textContent).toMatch(/Module d’élasticité non donné/);
    await act(async () => plastic.root.unmount());
  });

  it('« Modifier les données » : module du plastique saisi → plaque « saisie » utilisée', async () => {
    const { host, root, patches } = await mount({ roadway: true, roadwayPlate: 'envhyro-terratrak-plus' });
    await act(async () => (host.querySelector('[data-testid="roadway-edit"]') as HTMLButtonElement).click());
    expect((host.querySelector('[data-testid="roadway-custom-name"]') as HTMLInputElement).value).toBe('Terratrak Plus 2 200 × 1 100 × 38 mm (PEHD) (modifiée)');
    await act(async () => change(host.querySelector('[data-testid="roadway-custom-E"]')!, '300'));
    await act(async () => (host.querySelector('[data-testid="roadway-custom-save"]') as HTMLButtonElement).click());
    expect(patches).toHaveLength(1);
    const p = patches[0];
    expect(p.roadwayPlate).toBe('custom');
    expect(p.roadwayCustom).toMatchObject({ key: 'custom', custom: true, material: 'plastic', l: 2200, w: 1100, t: 38, massKg: 46, E: 300, joints: 'locked', fc: 7.288 });
    // avec ce module, le calage compte une vraie répartition
    const r = computeCalage({ ...input, choices: { roadway: true, ...p } });
    expect(r.roadwayPlate!.reach).toBeGreaterThan(38);
    await act(async () => root.unmount());
  });

  it('« Autre plaque » vide : données obligatoires demandées', async () => {
    const { host, root, patches } = await mount({ roadway: true });
    await act(async () => change(host.querySelector('[data-testid="roadway-plate"]')!, '__new'));
    await act(async () => (host.querySelector('[data-testid="roadway-custom-save"]') as HTMLButtonElement).click());
    expect(patches).toEqual([]);
    expect(host.textContent).toContain('Nom de la plaque à saisir.');
    await act(async () => root.unmount());
  });
});
