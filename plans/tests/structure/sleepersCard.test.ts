// Carte « 🪵 Madriers sous les rangées d'appuis » (étape 5) : Calculer → les deux variantes (avec / sans les blocs) côte
// à côte, la conseillée en tête, « Appliquer » transmet la piste choisie.
import { describe, expect, it } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { computeCalage } from '../../src/structure/core/calage';
import type { CalageRemedy } from '../../src/structure/core/calageRemedies';
import { gridModules } from '../../src/structure/core/estimate';
import type { DrawnBlock } from '../../src/structure/core/blocks';
import { DEFAULT_HYP, SleepersCard, calageInput } from '../../src/ui/structure/GroundPanel';

const mods = gridModules(1, 2, [[1], [1]], false);
const xs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[0])))].sort((a, b) => a - b);
const zs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[1])))].sort((a, b) => a - b);
const block = (id: string, x: number, z: number): DrawnBlock => ({ id, label: 'S', x0: x - 500, x1: x + 500, z0: z - 500, z1: z + 500, bottom: -243, top: 0, massKg: 102.5, massSource: 'computed', material: 'C24', pieces: 1 });
const xMid = (xs[0] + xs[xs.length - 1]) / 2;
const zMid = (zs[0] + zs[zs.length - 1]) / 2;
const ux = (x: number) => (x === xs[0] ? x + 500 : x === xs[xs.length - 1] ? x - 500 : x);
const uz = (z: number) => (z === zs[0] ? z + 500 : z === zs[zs.length - 1] ? z - 500 : z);
const nine = [xs[0], xMid, xs[xs.length - 1]].flatMap((x, i) => [zs[0], zMid, zs[zs.length - 1]].map((z, j) => block(`BL${3 * i + j + 1}`, ux(x), uz(z))));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('carte Madriers sous les rangées d’appuis', () => {
  it('Calculer → avec / sans les blocs, la variante sans blocs conseillée, Appliquer', async () => {
    const input = { ...calageInput(mods, { ...DEFAULT_HYP, bearingValue: 450, bearingUnit: 'kg/m²' as const, middleFeet: true, liveGround: 0.981, publicMode: 'persons' as const, persons: 4, subgrade: 'slab' }, { plates: [], commercial: [] }, true), blocks: nine, bearingMode: 'distributed' as const };
    const result = computeCalage(input);
    const applied: CalageRemedy[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(createElement(SleepersCard, { input, result, choices: {}, onApply: (r: CalageRemedy) => applied.push(r) })));
    expect(host.querySelector('[data-testid="sleepers-section"]')!.textContent).toContain('10 × 23 cm, à plat (23 cm au sol)');
    await act(async () => {
      (host.querySelector('[data-testid="sleepers-compute"]') as HTMLButtonElement).click();
      await new Promise((r) => setTimeout(r, 50));
    });
    const rows = host.querySelectorAll('[data-testid="sleepers-variants"] tbody tr');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Sans les blocs');
    expect(rows[0].textContent).toContain('conseillée');
    expect(rows[1].textContent).toContain('Avec les blocs dessinés');
    expect(host.querySelector('[data-testid="sleepers-blocks-note"]')!.textContent).toMatch(/plus basse d’environ 24 cm/);
    await act(async () => (host.querySelector('[data-testid="sleepers-apply-no-blocks"]') as HTMLButtonElement).click());
    expect(applied).toHaveLength(1);
    expect(applied[0].apply && typeof applied[0].apply === 'object' && applied[0].apply.key).toBe('sleepers-no-blocks');
    await act(async () => root.unmount());
  }, 60000);
});

describe('étape 5 avec les madriers retenus sans les blocs', () => {
  it('affiche les appuis sans planter (bug 17.11.2026 : « Cannot read properties of undefined (reading id) »)', async () => {
    const { GroundPanel } = await import('../../src/ui/structure/GroundPanel');
    const { sleeperVariants } = await import('../../src/structure/core/sleeperCompare');
    const hyp = { ...DEFAULT_HYP, bearingValue: 450, bearingUnit: 'kg/m²' as const, middleFeet: true, liveGround: 0.981, publicMode: 'persons' as const, persons: 4, subgrade: 'slab', bearingMode: 'distributed' as const };
    const input = { ...calageInput(mods, hyp, { plates: [], commercial: [] }, true), blocks: nine, bearingMode: 'distributed' as const };
    const v = sleeperVariants(input, computeCalage(input), { beam: { b: 230, h: 100 } }).find((x) => !x.withBlocks)!;
    const apply = v.remedy.apply as Exclude<CalageRemedy['apply'], undefined | 'centre-blocks'>;
    const errors: unknown[] = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host, { onUncaughtError: (e) => errors.push(e), onCaughtError: (e) => errors.push(e) });
    await act(async () => root.render(createElement(GroundPanel, { modules: mods, source: 'test', storageKey: 'test-nb', hyp: { ...hyp, calage: { remedy: apply } }, onHypChange: () => {}, jacks: true, blocks: nine })));
    for (let i = 0; i < 100 && !host.textContent!.includes('madriers (bloc retiré)') && !errors.length; i++) await act(async () => new Promise((r) => setTimeout(r, 100)));
    expect(errors).toEqual([]);
    expect(host.textContent).toContain('sur les madriers (bloc retiré)');
    expect(host.textContent).not.toContain('Blocs de bois dessinés dans le modèle');
    await act(async () => root.unmount());
  }, 60000);
});
