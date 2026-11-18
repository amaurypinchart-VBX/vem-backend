// Madriers sur chant et cales composées (A. Pinchart 18.11.2026 : « plaque de roulage, puis 4 plaques de multiplex
// 18 mm 1 × 1 m, puis des madriers de 75 × 225 sur leur tranche, un à gauche, un à droite et un au milieu, puis 3 ou 4
// plaques de 18 mm » ; « ou bien 3 plaques de 18 mm puis une cale de 1 × 1 m : une plaque de 18 mm, les madriers sur
// chant, une plaque de 18 mm au-dessus » ; « je ne vois pas où choisir le type de plaques de roulage ») : chaîne de
// répartition à travers les madriers, flexion des plaques d'un madrier à l'autre, compression transversale, poids,
// coupe du calage (plaques empilées une à une, madriers coupés), matériel, type de plaques de roulage.
import { describe, expect, it } from 'vitest';
import { computeCalage } from '../../src/structure/core/calage';
import { gridModules } from '../../src/structure/core/estimate';
import type { DrawnBlock } from '../../src/structure/core/blocks';
import type { LayerRef } from '../../src/structure/core/spreading';
import { checkChain, resolveLayers } from '../../src/structure/core/spreading';
import { C24, PANELS, ROADWAY_PRESETS, VIEWBOX_STOCK, blockPlateKey, joistAxes, joistKey, roadwayTypes } from '../../src/structure/core/ground';
import { stackLines, stacksFigureSvg } from '../../src/structure/report/stackFigure';
import { FRENCH_MARKERS, translate } from '../../src/structure/report/translate';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';

const MX18 = 'birch:1000x1000x18';
const J = joistKey(75, 225);
// composition A, de haut en bas : 3 plaques 18 mm, 3 madriers 75 × 225 sur chant, 4 plaques 18 mm
const compoA: LayerRef[] = [
  { plate: MX18, n: 3 },
  { plate: J, n: 3, along: 'u' },
  { plate: MX18, n: 4 },
];
const fmd = (0.9 * PANELS.birch.panel.fmk) / PANELS.birch.panel.gammaM;
const fc90J = (0.9 * C24.fc90k) / 1.3;

const base = (REd: number, at: [number, number] = [0, 0]) => ({
  Rzk: REd / 1.35,
  REd,
  contact: [150, 150] as [number, number],
  contactLabel: 'vérin 15 × 15 cm',
  bearing: 0.2,
  feet: [{ at, size: [150, 150] as [number, number], REd }],
});

describe('madriers sur chant', () => {
  const { layers } = resolveLayers(compoA, VIEWBOX_STOCK);

  it('couches résolues : madriers à la taille de la plaque du dessous, un à chaque bord et un au milieu', () => {
    expect(layers.map((l) => l.material)).toEqual(['birch', 'joists', 'birch']);
    const j = layers[1];
    expect([j.l, j.w, j.t, j.n]).toEqual([1000, 1000, 225, 3]);
    // masse d'un madrier C24 75 × 225 × 1 000 mm
    expect(j.massKg).toBeCloseTo((75 * 225 * 1000 * C24.rho) / 1e9, 9);
    expect(joistAxes(1000, 75, 3)).toEqual([-462.5, 0, 462.5]);
    // sens non choisi : variante « le plus favorable »
    expect(resolveLayers([{ plate: J, n: 3 }], VIEWBOX_STOCK).layers[0].joist!.auto).toBe(true);
  });

  it('pied au-dessus du madrier du milieu : pas de flexion, compression transversale sur 15 + 2 × 5,4 cm', () => {
    const c = checkChain({ ...base(20000), layers });
    expect(c.records.some((r) => r.key === 'joists.bend')).toBe(false);
    const c90 = c.records.find((r) => r.key === 'joists.c90')!;
    // longueur d'appui : 150 + 2 × 3 × 18 = 258 mm
    expect(c90.result).toBeCloseTo(20000 / (75 * 258), 6);
    expect(c90.limit).toBeCloseTo(fc90J, 9);
    // un seul madrier chargé : emprise 7,5 cm × (15 + 2 × (5,4 + 22,5)) = 70,8 cm le long du madrier
    const step = c.steps.find((s) => s.label.includes('madriers'))!;
    expect(step.dims![0]).toBeCloseTo(150 + 2 * (54 + 225), 6);
    expect(step.dims![1]).toBeCloseTo(75, 6);
    // puis les 4 plaques de dessous répartissent sur toute la plaque
    expect(c.steps[c.steps.length - 1].dims).toEqual([1000, 1000]);
    // poids des plaques et des madriers ajouté au sol
    const w = (7 * layers[0].massKg + 3 * layers[1].massKg) * 9.81;
    expect(c.pressure).toBeCloseTo((20000 / 1.35 + w) / 1e6, 9);
  });

  it('pied entre deux madriers : les plaques du dessus portent d’un madrier à l’autre (flexion)', () => {
    // pied à 155 mm du bord (vérin d'angle à fleur) : entre le madrier du bord (37,5) et celui du milieu (500)
    const p = -500 + 155;
    const c = checkChain({ ...base(20000, [0, p]), layers });
    const r = c.records.find((x) => x.key === 'joists.bend')!;
    const s = 462.5;
    const a = p - -462.5;
    expect(r.result).toBeCloseTo((20000 * a * (s - a)) / s, 3);
    // b = 15 + 46,25 cm, 3 plaques de 18 mm non collées
    expect(r.limit).toBeCloseTo((150 + s) * fmd * (3 * 18 * 18) / 6, 3);
    expect(c.etaCapacity).toBeCloseTo(r.eta!, 9);
    // les deux madriers voisins chargés au prorata
    const c90 = c.records.find((x) => x.key === 'joists.c90')!;
    expect(c90.result).toBeCloseTo((20000 * (s - a)) / s / (75 * 258), 6);
    // une seule plaque de 18 mm au-dessus : trop mince
    const thin = checkChain({ ...base(20000, [0, p]), layers: resolveLayers([{ plate: MX18, n: 1 }, compoA[1], compoA[2]], VIEWBOX_STOCK).layers });
    expect(thin.eta).toBeGreaterThan(1);
    expect(thin.problems.join(' ')).toMatch(/ne porte pas la charge d’un madrier à l’autre/);
  });

  it('pied posé sur les madriers sans plaque, entre deux madriers : signalé', () => {
    const c = checkChain({ ...base(20000, [0, 250]), layers: resolveLayers([compoA[1], compoA[2]], VIEWBOX_STOCK).layers });
    expect(c.problems.join(' ')).toMatch(/pied entre deux madriers sans plaque au-dessus/);
  });
});

// 2 Viewbox côte à côte sur vérins, 9 blocs de 1 × 1 m (IKEA place de l'Opéra, 450 kg/m²)
const mods = gridModules(1, 2, [[1], [1]], false);
const xs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[0])))].sort((a, b) => a - b);
const zs = [...new Set(mods.flatMap((m) => m.corners.map((c) => c[1])))].sort((a, b) => a - b);
const block = (id: string, x: number, z: number): DrawnBlock => ({ id, label: 'Cale', x0: x - 500, x1: x + 500, z0: z - 500, z1: z + 500, bottom: -339, top: -96, massKg: 102.5, massSource: 'computed', material: 'C24', pieces: 1, under: { feet: -2, frame: 96 } });
const xMid = (xs[0] + xs[xs.length - 1]) / 2;
const zMid = (zs[0] + zs[zs.length - 1]) / 2;
const ux = (x: number) => (x === xs[0] ? x + 500 : x === xs[xs.length - 1] ? x - 500 : x);
const uz = (z: number) => (z === zs[0] ? z + 500 : z === zs[zs.length - 1] ? z - 500 : z);
const nine = [xs[0], xMid, xs[xs.length - 1]].flatMap((x, i) => [zs[0], zMid, zs[zs.length - 1]].map((z, j) => block(`BL${3 * i + j + 1}`, ux(x), uz(z))));
const hyp450 = { ...DEFAULT_HYP, middleFeet: true, bearingValue: 450, bearingUnit: 'kg/m²' as const, liveGround: 0.981, publicMode: 'persons' as const, persons: 4 };
const stock = { plates: [], commercial: [] };

describe('cale composée à la place des blocs dessinés', () => {
  // la cale : plaque 18 mm, 3 madriers 75 × 225 sur chant, plaque 18 mm ; dessous : 3 plaques 18 mm
  const cale: LayerRef[] = [{ plate: blockPlateKey('birch', 18), n: 1 }, { plate: J, n: 3 }, { plate: blockPlateKey('birch', 18), n: 1 }];
  const inp = { ...calageInput(mods, hyp450, stock, true), bearingMode: 'distributed' as const, blocks: nine, roadwayThickness: 38, roadwayPlates: (46 / 2.42) * 9.81 / 1e6, roadwayType: { label: ROADWAY_PRESETS[0].label, piece: [2200, 1100] as [number, number] } };
  const solid = computeCalage(inp);
  const r = computeCalage({ ...inp, choices: { blockComposition: cale, byType: Object.fromEntries(solid.types.map((t) => [t.typeKey, [{ plate: MX18, n: 3 }]])), roadway: true } });

  it('masse et hauteur de la cale (et non plus du bloc plein dessiné)', () => {
    const plate = (1 * 1 * 0.018 * PANELS.birch.panel.rho);
    const joist = (0.075 * 0.225 * 1 * C24.rho);
    const c = r.checks.find((x) => x.block)!;
    expect(c.block!.massKg).toBeCloseTo(2 * plate + 3 * joist, 6);
    expect(c.block!.composition!.height).toBe(18 + 225 + 18);
    expect(c.block!.composition!.drawnHeight).toBe(243);
    // la dalle porte le poids des cales, plus celui des blocs pleins dessinés
    const blocksN = (x: typeof r) => x.slab!.zones.reduce((a, z) => a + z.parts.block, 0);
    expect(blocksN(r)).toBeCloseTo(9 * (2 * plate + 3 * joist) * 9.81, 3);
    expect(blocksN(solid)).toBeCloseTo(9 * 102.5 * 9.81, 3);
    expect(r.warnings.some((w) => /Cale composée de 26,1 cm de haut/.test(w))).toBe(true);
    expect(r.warnings.some((w) => /Madriers posés sur chant : les visser/.test(w))).toBe(true);
    // la chaîne passe par les couches de la cale (pas par la diffusion dans un bloc plein)
    expect(c.records.some((x) => x.key === 'block.spread')).toBe(false);
    expect(c.records.some((x) => x.key === 'joists.c90')).toBe(true);
    expect(r.types.find((t) => t.block)!.chosen!.summary).toBe('3 × 100 × 100 × 18 mm sous chaque cale, centrées sur la cale, sur les plaques de roulage');
    // sans plaque choisie sous la cale : la cale suffit sur la dalle
    const alone = computeCalage({ ...inp, choices: { blockComposition: cale } });
    expect(alone.types.find((t) => t.block)!.chosen!.title).toBe('Cale composée (bloc dessiné), sans plaque');
  });

  it('coupe du calage : plaques de roulage PEHD, 3 plaques empilées, la cale couche par couche, le vérin', () => {
    const st = r.stacks!.find((s) => s.layers.some((l) => l.kind === 'joists'))!;
    expect(st.layers.map((l) => l.kind)).toEqual(['roadway', 'plate', 'plate', 'joists', 'plate', 'jack']);
    expect(st.layers[0].label).toMatch(/PEHD 220 × 110 × 38 mm/);
    expect(st.layers[0].thickness).toBe(38);
    // 3 plaques empilées = 5,4 cm (et non 1,8)
    expect(st.layers[1].thickness).toBe(54);
    expect(st.layers[1].count).toBe(3);
    expect(st.layers[1].label).toMatch(/3 plaques empilées/);
    expect(st.layers[3].label).toMatch(/^3 madriers C24 75 × 225 mm sur chant \(répartis sur 100 cm : un à chaque bord et un au milieu ; longueur 100 cm ; parallèles au (grand|petit) côté de la Viewbox\)$/);
    expect(st.layers[3].joists).toEqual({ n: 3, b: 75, width: 1000 });
    expect(st.layers.slice(2, 5).every((l) => l.group?.startsWith('Cale composée 100 × 100 cm'))).toBe(true);
    // vérin : vide du dessin (9,6 cm) moins ce que la cale a de plus que le bloc dessiné (1,8 cm)
    expect(st.layers[5].thickness).toBeCloseTo(96 - 18, 6);
    expect(st.known).toBeCloseTo(38 + 54 + 261 + 78, 6);
    const svg = stacksFigureSvg(r.stacks!, 'fr', true)(0, 0, 186, 46);
    expect(svg).toContain('Cale composée');
    expect(svg).toContain('Madriers 3 × 75×225 mm');
    expect(svg).toContain('Plaques 3 × 1,8 cm');
  });

  it('matériel : plaques de roulage PEHD (nombre minimal), plaques et madriers des cales', () => {
    const rw = r.materials.find((m) => m.label.startsWith('Plaques de roulage jointives'))!;
    expect(rw.label).toBe('Plaques de roulage jointives — PEHD 220 × 110 × 38 mm (46 kg la plaque)');
    expect(rw.quantity).toBe(Math.ceil(r.roadway.area / (2200 * 1100)));
    const joists = r.materials.find((m) => m.label === 'Cale composée (bloc dessiné) — Madriers C24 posés sur chant')!;
    expect(joists.quantity).toBe(27);
    expect(joists.dims).toBe('75 × 225 × 1000 mm');
    expect(r.materials.some((m) => m.label.startsWith('Bloc de calage'))).toBe(false);
  });

  it('textes en anglais et en allemand sans mot français', () => {
    const extra = ['madriers?', 'chant', 'cale', 'bord', 'milieu', 'empilées', 'vérins?', 'roulage', 'plaques?', 'bloc', 'longueur', 'répartis', 'dessus', 'pied'];
    const texts = [...r.stacks!.flatMap((s) => stackLines(s, 'fr')), ...r.warnings.filter((w) => /madrier|cale/i.test(w)), ...r.materials.map((m) => `${m.label} ${m.dims}`), ...r.checks.flatMap((c) => c.records.filter((x) => x.key.startsWith('joists.') || x.key === 'block.c90' || x.key === 'spread.layer').flatMap((x) => [x.title, x.clause, x.formula, x.withValues])), ...r.checks.flatMap((c) => c.steps.filter((x) => /madrier|cale/.test(x.label)).map((x) => `${x.label} ${x.note ?? ''}`))];
    const left: string[] = [];
    for (const lang of ['en', 'de'] as const) {
      const skip = lang === 'de' ? ['des', 'service', 'une?'] : ['service', 'charge'];
      const re = new RegExp(`(^|[^\\p{L}])(${[...FRENCH_MARKERS, ...extra].filter((w) => !skip.includes(w)).join('|')})([^\\p{L}]|$)`, 'iu');
      for (const t of texts) {
        const out = translate(lang, t ?? '');
        if (re.test(out.replace(/\binformation\b/gi, '')) || (lang === 'en' && /[éèàçêôûœÉÈÀ]/.test(out))) left.push(`${lang} : ${out}`);
      }
    }
    expect([...new Set(left)]).toEqual([]);
    expect(translate('en', st0())).toMatch(/^3 C24 joists 75 × 225 mm on edge \(spread over 100 cm: one at each edge and one in the middle; length 100 cm; parallel to the (long|short) side of the Viewbox\)$/);
    expect(translate('de', st0())).toMatch(/^3 Kanthölzer C24 75 × 225 mm hochkant \(verteilt auf 100 cm: je eines an jedem Rand und eines in der Mitte; Länge 100 cm; parallel zur (Längs|Stirn)seite der Viewbox\)$/);
  });
  const st0 = () => r.stacks!.flatMap((s) => s.layers).find((l) => l.kind === 'joists')!.label;
});

describe('madriers sur chant sous les vérins, sans bloc dessiné', () => {
  it('composition A choisie pour tous les types : coupe, matériel, sens le plus favorable', () => {
    const inp = calageInput(mods, { ...DEFAULT_HYP, middleFeet: true }, stock, true);
    const auto = computeCalage(inp);
    const refs: LayerRef[] = [{ plate: MX18, n: 3 }, { plate: J, n: 3 }, { plate: MX18, n: 4 }];
    const r = computeCalage({ ...inp, choices: { byType: Object.fromEntries(auto.types.map((t) => [t.typeKey, refs])) } });
    for (const c of r.checks) {
      expect(c.layerList.map((l) => l.material)).toEqual(['birch', 'joists', 'birch']);
      // sens choisi : le plus favorable des deux
      const other = c.layerList.map((l) => (l.joist ? { ...l, joist: { ...l.joist, along: l.joist.along === 'u' ? ('v' as const) : ('u' as const) } } : l));
      expect(c.eta).toBeLessThanOrEqual(checkChain({ ...c.chainBase, layers: other }).eta + 1e-9);
    }
    const st = r.stacks![0];
    expect(st.layers.map((l) => [l.kind, l.thickness])).toEqual([
      ['plate', 72],
      ['joists', 225],
      ['plate', 54],
      ['jack', null],
    ]);
    const j = r.materials.find((m) => m.label === 'Madriers C24 posés sur chant')!;
    expect(j.quantity).toBe(3 * r.checks.length);
    expect(r.types[0].chosen!.summary).toMatch(/^3 × 100 × 100 × 18 mm \+ 3 madriers 75 × 225 mm sur chant \+ 4 × 100 × 100 × 18 mm par /);
    expect(r.types.every((t) => t.tuv === null || t.tuv.ok === null)).toBe(true);
  });

  it('types de plaques de roulage : stock puis types courants, PEHD Viewbox une seule fois', () => {
    const pehd = { label: 'PEHD', length: 2200, width: 1100, thickness: 38, quantity: 0, material: 'hdpe' as const, massKg: 46 };
    const t = roadwayTypes([pehd]);
    expect(t[0].key).toBe('stock:hdpe:2200x1100x38');
    expect(t[0].kgm2).toBeCloseTo(46 / 2.42, 9);
    expect(t.filter((x) => x.label.includes('220 × 110 × 38')).length).toBe(1);
    expect(roadwayTypes([]).find((x) => x.key === 'steel-20')!.kgm2).toBeCloseTo(157, 6);
  });
});
