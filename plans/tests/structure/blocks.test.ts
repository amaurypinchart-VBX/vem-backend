// Blocs de calage bois dessinés sous les pieds (A. Pinchart 03.11.2026 : « des blocs de bois de 1 × 1 m qui répartissent
// déjà la charge, et qui ont un poids ; si ça ne passe pas, je remets des plaques de répartition ») : appuis posés sur
// un même bloc fusionnés, compression transversale, diffusion à 45°, résultante excentrée (B' = B − 2 e), poids du
// bloc, plaques sous le bloc, plan, matériel.
import { describe, expect, it } from 'vitest';
import { computeCalage } from '../../src/structure/core/calage';
import { gridModules } from '../../src/structure/core/estimate';
import { VIEWBOX_STOCK, bearingFrom } from '../../src/structure/core/ground';
import type { DrawnBlock } from '../../src/structure/core/blocks';
import { blockBearing, blockChain, blockDrawingNotes, clusterBlocks, makeBlocks } from '../../src/structure/core/blocks';
import { translate } from '../../src/structure/report/translate';
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

describe('blocs + plaques de roulage (revue 03.11.2026)', () => {
  it('sur blocs, la charge ne se répartit pas uniformément : chaque bloc garde sa propre emprise ; poids des blocs dans la moyenne', () => {
    const soft = { ...base, bearing: bearingFrom(450, 'kg/m²') };
    const off = computeCalage({ ...soft, blocks: nine });
    const on = computeCalage({ ...soft, blocks: nine, choices: { roadway: true } });
    // la moyenne (information, dalle) compte les 9 blocs de 270 kg
    expect(on.roadway.load - computeCalage({ ...soft, choices: { roadway: true } }).roadway.load).toBeCloseTo(9 * 270 * 9.81, 3);
    // le verdict de chaque bloc ne change pas avec les plaques de roulage
    for (const c of on.checks.filter((x) => x.block)) {
      const same = off.checks.find((x) => x.id === c.id)!;
      expect(c.eta).toBeCloseTo(same.eta, 9);
      expect(c.steps.some((s) => s.label.includes('roulage'))).toBe(false);
    }
    expect(on.warnings.some((w) => w.includes('Plaques de roulage et blocs de calage'))).toBe(true);
    // 450 kg/m² : un bloc de 1 m² sous un angle ne passe pas
    expect(on.checks.find((x) => x.block?.id === 'BL1')!.eta).toBeGreaterThan(1);
  });
});

describe('pose des plaques sous les blocs et solutions (A. Pinchart 03.11.2026)', () => {
  const pehd = { label: 'PEHD', length: 2200, width: 1100, thickness: 38, quantity: 0, material: 'hdpe' as const, massKg: 46 };
  const corner = [block('BL1', xs[0] + 500, zs[0] + 500)];

  it('plaque à fleur de la Viewbox sous un bloc d’angle : elle ne dépasse pas ; centrée : elle dépasse', async () => {
    const { plateKey } = await import('../../src/structure/core/ground');
    const choose = { byType: { B1: [{ plate: plateKey(pehd), n: 1 }] } };
    const flush = computeCalage({ ...base, blocks: corner, stock: [pehd], choices: choose, placement: 'flush' });
    const c = flush.checks.find((x) => x.block)!;
    expect(c.placement).toBe('flush');
    expect(c.plan!.overhang).toBe(0);
    // le contour part du bord des Viewbox
    expect(Math.min(...c.plan!.corners.map((p) => p[0]))).toBeCloseTo(xs[0], 3);
    expect(Math.min(...c.plan!.corners.map((p) => p[1]))).toBeCloseTo(zs[0], 3);
    const centred = computeCalage({ ...base, blocks: corner, stock: [pehd], choices: choose, placement: 'centered' });
    const cc = centred.checks.find((x) => x.block)!;
    expect(cc.plan!.overhang).toBeGreaterThan(0);
    expect(cc.advice).toContain('dépasse de l’installation');
    // choix propre à l'appui : prime sur le réglage général
    const own = computeCalage({ ...base, blocks: corner, stock: [pehd], choices: { ...choose, placeBySupport: { [cc.id]: 'flush' } }, placement: 'centered' });
    expect(own.checks.find((x) => x.block)!.placement).toBe('flush');
  });

  it('plaque rectangulaire posée dans le sens qui répartit le mieux', async () => {
    const { plateKey } = await import('../../src/structure/core/ground');
    const r = computeCalage({ ...base, blocks: corner, stock: [pehd], choices: { byType: { B1: [{ plate: plateKey(pehd), n: 1 }] } }, placement: 'centered' });
    const c = r.checks.find((x) => x.block)!;
    const turned = { ...c.layerList[0], l: c.layerList[0].w, w: c.layerList[0].l };
    const { checkChain } = await import('../../src/structure/core/spreading');
    expect(c.eta).toBeLessThanOrEqual(checkChain({ ...c.chainBase, layers: [turned] }).eta + 1e-9);
  });

  it('pression au sol écrite sur le plan, en kN/m² et kg/m²', async () => {
    const { pressureLines } = await import('../../src/structure/report/groundSheet');
    const c = computeCalage({ ...base, blocks: nine }).checks.find((x) => x.block?.id === 'BL5')!;
    const [a, b] = pressureLines(c);
    expect(a).toContain(String(Math.round(c.pressure * 1e3)));
    expect(a).toMatch(/kN\/m²$/);
    expect(b).toMatch(/kg\/m²$/);
  });

  it('450 kg/m² : les pistes — blocs centrés insuffisants, plateau en grille de madriers vérifié', async () => {
    const { calageRemedies } = await import('../../src/structure/core/calageRemedies');
    const hyp450 = { ...hyp, bearingValue: 450, bearingUnit: 'kg/m²' as const, liveGround: 0.981, publicMode: 'persons' as const, persons: 4 };
    const inp = { ...calageInput(mods, hyp450, { plates: [], commercial: [] }, true), blocks: nine };
    const res = computeCalage(inp);
    expect(res.checks.some((c) => c.eta > 1)).toBe(true);
    const rem = calageRemedies(inp, res);
    const keys = rem.map((x) => x.key);
    expect(keys).toEqual(expect.arrayContaining(['centre-blocks', 'area', 'sleepers', 'platform', 'platform-no-blocks', 'load']));
    expect(rem.find((x) => x.key === 'centre-blocks')!.verdict).toBe('fail');
    const plat = rem.find((x) => x.key === 'platform')!;
    // une piste « passe » est vérifiée par le calcul (η ≤ 1) et donne son matériel
    if (plat.verdict === 'ok') {
      expect(plat.eta!).toBeLessThanOrEqual(1);
      expect(plat.materials.length).toBeGreaterThan(0);
    }
    // les pistes vérifiées d'abord
    const firstNotOk = rem.findIndex((x) => x.verdict !== 'ok');
    expect(rem.slice(firstNotOk).every((x) => x.verdict !== 'ok')).toBe(true);
    // sans aucun appui qui dépasse : rien à proposer
    expect(calageRemedies(base, computeCalage(base))).toEqual([]);
  }, 60000);

  it('solution choisie : le calage est recalculé avec elle (pression, matériel, plan) ; blocs centrés', async () => {
    const { calageRemedies } = await import('../../src/structure/core/calageRemedies');
    const hyp450 = { ...hyp, bearingValue: 450, bearingUnit: 'kg/m²' as const, liveGround: 0.981, publicMode: 'persons' as const, persons: 4 };
    const inp = { ...calageInput(mods, hyp450, { plates: [], commercial: [] }, true), blocks: nine };
    const res = computeCalage(inp);
    const rem = calageRemedies(inp, res);
    const plat = rem.find((x) => x.key === 'platform')!;
    expect(typeof plat.apply).toBe('object');
    const applied = computeCalage({ ...inp, choices: { remedy: plat.apply as Exclude<typeof plat.apply, 'centre-blocks' | undefined> } });
    expect(applied.remedy?.remedy.key).toBe('platform');
    // chaque appui porte sur le plateau : même pression au sol, celle trouvée par la recherche
    for (const c of applied.checks) {
      expect(c.pressure).toBeCloseTo(applied.checks[0].pressure, 9);
      expect(c.steps[c.steps.length - 1].label).toMatch(/^\+ Plateau de madriers/);
      expect(c.layerList).toEqual([]);
    }
    expect(applied.remedy!.remedy.eta).toBeCloseTo(plat.eta!, 6);
    expect(applied.allPlates).toBe(plat.verdict === 'ok');
    // matériel : les blocs + les madriers, plus de plaques
    expect(applied.materials.some((l) => l.label.startsWith('Bloc de calage'))).toBe(true);
    expect(applied.materials.some((l) => l.label.includes('plateau'))).toBe(true);
    expect(applied.remedy!.outlines.length).toBeGreaterThan(1);
    // sans les blocs : les blocs ne sont plus posés ni comptés
    const no = rem.find((x) => x.key === 'platform-no-blocks')!;
    const appliedNo = computeCalage({ ...inp, choices: { remedy: no.apply as Exclude<typeof no.apply, 'centre-blocks' | undefined> } });
    expect(appliedNo.checks.every((c) => !c.block)).toBe(true);
    expect(appliedNo.materials.some((l) => l.label.startsWith('Bloc de calage'))).toBe(false);
    expect(appliedNo.remedy!.remedy.eta).toBeCloseTo(no.eta!, 6);
    // la solution suit les charges : plus de public → pression plus forte
    const more = computeCalage({ ...inp, publicLimit: { persons: 40, kg: 80 }, choices: { remedy: plat.apply as Exclude<typeof plat.apply, 'centre-blocks' | undefined> } });
    expect(more.remedy!.remedy.eta!).toBeGreaterThan(applied.remedy!.remedy.eta!);
    // grille par rangée retenue
    const sl = rem.find((x) => x.key === 'sleepers')!;
    if (sl.apply) {
      const a = computeCalage({ ...inp, choices: { remedy: sl.apply as Exclude<typeof sl.apply, 'centre-blocks' | undefined> } });
      expect(a.remedy!.remedy.key).toBe('sleepers');
      expect(a.checks.every((c) => /Grille de madriers/.test(c.steps[c.steps.length - 1].label))).toBe(true);
    }
    // blocs centrés : même résultat que la piste, déplacements listés
    const cb = rem.find((x) => x.key === 'centre-blocks')!;
    expect(cb.apply).toBe('centre-blocks');
    const centred = computeCalage({ ...inp, choices: { centreBlocks: true } });
    expect(centred.centredBlocks!.length).toBeGreaterThan(0);
    expect(Math.max(...centred.checks.map((c) => c.eta))).toBeCloseTo(cb.eta!, 2);
    expect(centred.warnings.some((w) => w.startsWith('Blocs centrés sous les pieds'))).toBe(true);
  }, 60000);
});

// Revue IKEA 09.11.2026 : dans le dessin, les Viewbox posent sur leurs vérins (platines sur les blocs, UPN 9,6 cm
// au-dessus) et 4 blocs centraux sont 1,2 cm sous les profils du plancher — le mode de pose calculé doit le dire.
describe('dessin et mode de pose au sol', () => {
  const blk = (id: string, under: { feet: number | null; frame: number | null }): DrawnBlock => ({ id, label: 'Sous bois', x0: 0, x1: 1000, z0: 0, z1: 1000, bottom: -339, top: -96, massKg: 102.5, massSource: 'computed', material: 'C24', pieces: 1, under });
  const onJacks = ['BL1', 'BL2'].map((id) => blk(id, { feet: -2.5, frame: 95.5 }));
  const centre = ['BL9', 'BL10'].map((id) => blk(id, { feet: null, frame: 11.7 }));

  it('ce qui porte sur un bloc : vérins / pieds ou structure, et l’écart', () => {
    expect(blockBearing(onJacks[0])).toEqual({ kind: 'feet', gap: -2.5, frameGap: 95.5 });
    expect(blockBearing(centre[0])).toEqual({ kind: 'frame', gap: 11.7, frameGap: 11.7 });
    expect(blockBearing({ under: { feet: null, frame: null } })).toBeNull();
    expect(blockBearing({})).toBeNull();
  });

  it('UPN sur les blocs calculé, vérins sur les blocs dessinés : de combien rehausser ; blocs centraux à caler', () => {
    const notes = blockDrawingNotes([...onJacks, ...centre], 'pads');
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatch(/^Dessin ≠ calcul : .*les blocs BL1, BL2 et l’UPN est 9,6 cm au-dessus de ces blocs.*rehausser ces blocs de 9,6 cm/);
    expect(notes[1]).toMatch(/les blocs BL9, BL10 sont à 1,2 cm sous la structure .* le calcul les fait porter comme s’ils étaient calés/);
    // sur vérins : cohérent pour BL1, BL2 ; les blocs centraux ne comptent que comme poids
    const jacks = blockDrawingNotes([...onJacks, ...centre], 'jacks');
    expect(jacks).toHaveLength(1);
    expect(jacks[0]).toMatch(/compte seulement comme poids/);
    // UPN directement sur un bloc, calcul sur vérins : à signaler
    expect(blockDrawingNotes([blk('BL5', { feet: null, frame: 1 })], 'jacks')[0]).toMatch(/l’UPN ou les profils du plancher reposent directement sur le bloc BL5/);
    expect(blockDrawingNotes([...onJacks], 'rims')).toEqual([]);
  });

  it('traduits en allemand et en anglais', () => {
    const notes = [...blockDrawingNotes([...onJacks, ...centre], 'pads'), ...blockDrawingNotes([blk('BL5', { feet: null, frame: 1 }), ...centre], 'jacks')];
    for (const n of notes) {
      expect(translate('en', n)).not.toMatch(/\b(blocs?|vérins?|calcul|dessin|rehausser|caler)\b/);
      expect(translate('de', n)).not.toMatch(/\b(blocs?|vérins?|calcul|dessin|rehausser|caler)\b/);
    }
  });
});
