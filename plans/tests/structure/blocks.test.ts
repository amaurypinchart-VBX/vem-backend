// Blocs de calage bois dessinés sous les pieds (A. Pinchart 03.11.2026 : « des blocs de bois de 1 × 1 m qui répartissent
// déjà la charge, et qui ont un poids ; si ça ne passe pas, je remets des plaques de répartition ») : appuis posés sur
// un même bloc fusionnés, compression transversale, diffusion à 45°, résultante excentrée (B' = B − 2 e), poids du
// bloc, plaques sous le bloc, plan, matériel.
import { describe, expect, it } from 'vitest';
import { computeCalage } from '../../src/structure/core/calage';
import { gridModules } from '../../src/structure/core/estimate';
import { VIEWBOX_STOCK, bearingFrom } from '../../src/structure/core/ground';
import type { DrawnBlock } from '../../src/structure/core/blocks';
import { blockChain, clusterBlocks, makeBlocks } from '../../src/structure/core/blocks';
import { calageInput, DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';

// 2 Viewbox côte à côte (grands côtés communs), pieds centraux : 3 × 3 = 9 blocs, comme le modèle IKEA Table d'hôte
const mods = gridModules(1, 2, [[1], [1]], false);
const xs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[0])))].sort((a, b) => a - b);
const zs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[1])))].sort((a, b) => a - b);

/** bloc de `side` mm centré en (x, z), posé au sol, 645 mm de haut */
function block(id: string, x: number, z: number, side = 1000, h = 645, massKg = 270): DrawnBlock {
  return { id, label: 'Structure sole', x0: x - side / 2, x1: x + side / 2, z0: z - side / 2, z1: z + side / 2, bottom: -h, top: 0, massKg, massSource: 'computed', material: 'C24', pieces: 1 };
}
const xMid = (xs[0] + xs[xs.length - 1]) / 2;
const zMid = (zs[0] + zs[zs.length - 1]) / 2;
// blocs à fleur de l'installation (bord extérieur du bloc = bord des Viewbox)
const ux = (x: number) => (x === xs[0] ? x + 500 : x === xs[xs.length - 1] ? x - 500 : x);
const uz = (z: number) => (z === zs[0] ? z + 500 : z === zs[zs.length - 1] ? z - 500 : z);
const nine = [xs[0], xMid, xs[xs.length - 1]].flatMap((x, i) => [zs[0], zMid, zs[zs.length - 1]].map((z, j) => block(`BL${3 * i + j + 1}`, ux(x), uz(z))));

const hyp = { ...DEFAULT_HYP, bearingValue: 200, bearingUnit: 'kN/m²' as const, middleFeet: true };
const base = calageInput(mods, hyp, { plates: [], commercial: [] });

describe('blocs de calage bois dessinés', () => {
  it('pièces qui se touchent = un bloc (pile de madriers), volume additionné', () => {
    const boxes = [
      { min: [0, 0, 0] as [number, number, number], max: [1000, 100, 200] as [number, number, number], volume: 1000 * 100 * 200 },
      { min: [0, 100, 0] as [number, number, number], max: [200, 200, 1000] as [number, number, number], volume: 200 * 100 * 1000 },
      { min: [3000, 0, 0] as [number, number, number], max: [4000, 100, 1000] as [number, number, number], volume: 1e8 },
    ];
    const c = clusterBlocks(boxes);
    expect(c.length).toBe(2);
    expect(c.find((x) => x.pieces === 2)!.volume).toBe(4e7);
    const b = makeBlocks(c, { label: 'cale', firstIndex: 1 });
    // C24 420 kg/m³
    expect(b.find((x) => x.pieces === 1)!.massKg).toBeCloseTo(42, 5);
    // masse saisie pour toute la pièce : répartie au volume
    const g = makeBlocks(c, { label: 'cale', firstIndex: 1, weight: { value: 140, unit: 'kg' } });
    expect(g.reduce((a, x) => a + x.massKg, 0)).toBeCloseTo(140, 6);
  });

  const r = computeCalage({ ...base, blocks: nine });

  it('chaque bloc chargé = un appui de calage, les pieds posés dessus additionnés', () => {
    const onBlocks = r.checks.filter((c) => c.block);
    expect(onBlocks.length).toBe(9);
    expect(r.checks.length).toBe(9);
    // bloc de la jonction au milieu : 2 pieds centraux
    const centre = onBlocks.find((c) => c.block!.id === 'BL5')!;
    expect(centre.reaction.group.middle).toBe(true);
    expect(centre.reaction.group.moduleIds.length).toBe(2);

    // blocs d'angle de jonction : 2 angles
    expect(onBlocks.find((c) => c.block!.id === 'BL2')!.reaction.group.corners).toBe(2);
    // types « B… »
    expect(new Set(r.types.map((t) => t.typeKey))).toEqual(new Set(['B1', 'B2', 'BM']));
    expect(r.types.every((t) => t.block)).toBe(true);
  });

  it('poids du bloc ajouté au sol, compression ⊥ sous les pieds, excentricité', () => {
    const c = r.checks.find((x) => x.block?.id === 'BL1')!;
    const step = c.steps[1];
    expect(step.label).toContain('Bloc bois BL1');
    // angle seul à fleur : charge à 10,5 cm du bord, emprise B' = 2 × 10,5 = 21 cm dans les deux directions
    expect(step.dims![0]).toBeCloseTo(210, 0);
    expect(step.dims![1]).toBeCloseTo(210, 0);
    const W = 270 * 9.81;
    expect(step.pressure).toBeCloseTo(c.Rzk / (210 * 210) + W / 1e6, 6);
    expect(c.records.some((x) => x.key === 'block.c90')).toBe(true);
    // le bloc centré sous la jonction : pieds centraux au centre → tout le bloc répartit
    const mid = r.checks.find((x) => x.block?.id === 'BL5')!;
    expect(mid.steps[1].dims![0]).toBeCloseTo(1000, 0);
    expect(mid.steps[1].pressure).toBeCloseTo(mid.Rzk / 1e6 + W / 1e6, 6);
    expect(mid.eta).toBeLessThan(1);
  });

  it('bloc centré sous l’angle : il répartit sur toute sa base', () => {
    const centred = [block('BL1', xs[0], zs[0])];
    const one = computeCalage({ ...base, blocks: centred });
    const c = one.checks.find((x) => x.block)!;
    // contact d'angle 21 × 21 au coin, centre du bloc au coin : e = 10,5 cm → B' = 100 − 21 = 79 cm
    expect(c.steps[1].dims![0]).toBeCloseTo(790, 0);
    // les autres appuis restent calés comme avant (sans bloc)
    expect(one.checks.filter((x) => !x.block).length).toBe(r.estimate.reactions.length - 1);
  });

  it('sol faible : plaques du stock sous le bloc, sinon conseil « plaques de répartition sous le bloc »', () => {
    const soft = computeCalage({ ...base, bearing: bearingFrom(100, 'kN/m²'), blocks: nine.map((b) => ({ ...b, x0: (b.x0 + b.x1) / 2 - 300, x1: (b.x0 + b.x1) / 2 + 300, z0: (b.z0 + b.z1) / 2 - 300, z1: (b.z0 + b.z1) / 2 + 300 })), stock: VIEWBOX_STOCK });
    const mid = soft.checks.find((x) => x.block?.id === 'BL5')!;
    // 60 × 60 au centre : trop petit sur 100 kN/m² → plaques sous le bloc
    expect(mid.layerList.length).toBeGreaterThan(0);
    expect(mid.layerList[mid.layerList.length - 1].l).toBeGreaterThan(600);
    const t = soft.types.find((x) => x.checks.includes(mid))!;
    expect(t.chosen!.title).toContain('plaques de répartition sous le bloc');
    // plan : la plaque du dessous, centrée sur le bloc
    expect(mid.plan!.corners.length).toBe(4);
  });

  it('matériel : les blocs dessinés et leur masse ; bloc sous aucun appui signalé', () => {
    expect(r.materials[0].label).toContain('Bloc de calage');
    expect(r.materials[0].quantity).toBe(9);
    expect(r.materials[0].massKg).toBeCloseTo(9 * 270, 6);
    const noMid = computeCalage({ ...calageInput(mods, { ...hyp, middleFeet: false }, { plates: [], commercial: [] }), blocks: nine });
    expect(noMid.warnings.some((w) => w.includes('sous aucun appui') && w.includes('pieds centraux'))).toBe(true);
  });

  it('chaîne du bloc : diffusion à 45° limitée par la hauteur', () => {
    const thin = computeCalage({ ...base, blocks: [block('BL1', xMid, zMid, 1000, 100)] });
    const c = thin.checks.find((x) => x.block)!;
    // 2 pieds centraux 15 × 15 côte à côte au centre (15 × 30 cm) + 2 × 10 cm de diffusion : 35 × 50 cm
    expect(c.steps[1].dims![0] * c.steps[1].dims![1]).toBeCloseTo(350 * 500, -3);
    expect(c.steps[1].note).toContain('diffusion à 45°');
    void blockChain;
  });
});

describe('blocs : reconnaissance, conseil, traduction', () => {
  it('catégorie de calage → nature « Blocs de calage bois » proposée', async () => {
    const { proposeFor, isBlockCategory, missingData } = await import('../../src/structure/core/recognition');
    expect(isBlockCategory('CALLE-DE-BOIS')).toBe(true);
    expect(isBlockCategory('CALAGE')).toBe(true);
    expect(isBlockCategory('PLOTS')).toBe(true);
    expect(isBlockCategory('MUR-LEGER')).toBe(false);
    expect(isBlockCategory('VITRE-CALEPINAGE')).toBe(false);
    const p = proposeFor('CALLE-DE-BOIS', false)!;
    expect(p.assignment.nature).toBe('timber-block');
    // rien à saisir (pas de section) : poids calculé au volume si rien n'est saisi
    expect(missingData(p.assignment, new Map(), 'item')).toBeNull();
  });

  it('bloc à fleur sous un angle extérieur : conseil « bloc centré sous l’appui »', () => {
    const c = computeCalage({ ...base, blocks: nine }).checks.find((x) => x.block?.id === 'BL1')!;
    expect(c.eta).toBeGreaterThan(1);
    expect(c.advice).toContain('Bloc centré sous l’appui');
  });

  it('textes des appuis sur blocs traduits en allemand et en anglais', async () => {
    const { FRENCH_MARKERS, translate } = await import('../../src/structure/report/translate');
    const soft = computeCalage({ ...base, bearing: bearingFrom(100, 'kN/m²'), blocks: nine, stock: VIEWBOX_STOCK });
    const texts = soft.types.flatMap((t) => [t.label, t.chosen?.title ?? '', t.chosen?.summary ?? '', ...(t.chosen?.remarks ?? []), ...(t.chosen?.records ?? []).flatMap((r) => [r.title, r.clause ?? ''])]).concat(soft.materials.map((m) => m.label));
    for (const lang of ['de', 'en'] as const) {
      const all = texts.map((t) => translate(lang, t)).join('\n');
      const markers = FRENCH_MARKERS.filter((w) => !(lang === 'de' && ['des', 'service'].includes(w)) && !(lang === 'en' && ['service', 'charge'].includes(w)));
      const found = markers.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(all));
      expect(found.map((w) => all.split('\n').find((l) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(l)))).toEqual([]);
    }
  });
});

describe('blocs : extraction du modèle 3D', () => {
  it('groupe « Structure sole » de 9 blocs (dont une pile de 2 madriers) → 9 blocs, masse au volume', async () => {
    const { BoxGeometry, Group, Mesh } = await import('three');
    const { blockPieces } = await import('../../src/structure/scene/geometry');
    const root = new Group();
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        if (i === 1 && j === 1) {
          // pile : deux madriers 1000 × 300 × 1000 l'un sur l'autre
          for (const y of [-450, -150]) {
            const m = new Mesh(new BoxGeometry(1000, 300, 1000));
            m.position.set(i * 2500, y, j * 2000);
            root.add(m);
          }
          continue;
        }
        const m = new Mesh(new BoxGeometry(1000, 600, 1000));
        m.position.set(i * 2500, -300, j * 2000);
        root.add(m);
      }
    root.updateMatrixWorld(true);
    const scene = { objectsById: new Map([['sole', root]]) } as unknown as Parameters<typeof blockPieces>[0];
    const pieces = blockPieces(scene, 'sole');
    expect(pieces.length).toBe(10);
    const blocks = makeBlocks(clusterBlocks(pieces), { label: 'Structure sole', firstIndex: 1 });
    expect(blocks.length).toBe(9);
    const pile = blocks.find((b) => b.pieces === 2)!;
    expect(pile.top - pile.bottom).toBeCloseTo(600, 3);
    // 1 × 1 × 0,6 m³ × 420 kg/m³ = 252 kg
    expect(pile.massKg).toBeCloseTo(252, 3);
    expect(blocks.every((b) => Math.abs(b.x1 - b.x0 - 1000) < 1e-6)).toBe(true);
  });
});
