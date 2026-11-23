// Appuis ajoutés (A. Pinchart 23.11.2026, IKEA place de l'Opéra après la note 99Vectors L01-99V-P263 : « quand on
// rajoute des points, qu'ils se rajoutent bien dedans » ; le bureau d'études avait ajouté 4 appuis P11 à P14) : blocs
// dessinés sous le plancher, hors des vérins / angles, calés → appuis du calcul 3D (tronçons des profils au-dessus),
// de l'estimation (surfaces d'influence), du calage, du plan, de la fiche et du rapport. Descente de charges par appui
// (charge locale sous chaque plaque), comme la note du bureau d'études.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { sectionMap } from '../../src/structure/core/assemble';
import type { DrawnBlock } from '../../src/structure/core/blocks';
import { computeCalage } from '../../src/structure/core/calage';
import { estimateReactions } from '../../src/structure/core/estimate';
import { PAD_LAYOUT_DEFAULT, addedSupportBlocks, floorOfPlaced, layoutPads, resolveGroundContact } from '../../src/structure/core/groundContact';
import { placedToEstimate } from '../../src/structure/core/mods';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, inputKey, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { blockPlateKey, joistKey } from '../../src/structure/core/ground';
import { groundSheetPages } from '../../src/structure/report/groundSheet';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import { LOADS, vbx } from './studyHelpers';

const two = [vbx('A', 0, 0), vbx('B', 0, 2.5)];
const floors = two.map(floorOfPlaced);
// IKEA : 9 blocs de 1 × 1 m sous les vérins (UNP 9,6 cm au-dessus), 4 blocs au centre à 1,2 cm sous les profils
const nine: DrawnBlock[] = layoutPads(floors, { ...PAD_LAYOUT_DEFAULT, thickness: 244 }, -96).map((b, i) => ({ ...b, id: `BL${i + 1}`, under: { feet: -2, frame: 96 } }));
const centre: DrawnBlock[] = layoutPads(floors, { ...PAD_LAYOUT_DEFAULT, corners: false, middles: false, centre: 2, thickness: 407 }, -12).map((b, i) => ({ ...b, id: `BL${10 + i}`, under: { feet: null, frame: 12 } }));
const blocks = [...nine, ...centre];
const base: StudyInputs = { modules: two, edgeItems: [], pointItems: [], library: SEED, sections: sectionMap(SEED), loads: { ...LOADS, liveGround: 0.49e-3 }, middleFeet: true, sls: true, options: { ...CALC_DEFAULTS, jacks: true }, blocking: [] };
const hyp = { ...DEFAULT_HYP, bearingValue: 450, bearingUnit: 'kg/m²' as const, bearingMode: 'distributed' as const, middleFeet: true, liveGround: 0.49, publicMode: 'persons' as const, persons: 8 };
const stock = { plates: [], commercial: [] };
const estMods = two.map(placedToEstimate);

describe('appuis ajoutés : blocs calés sous le plancher, hors des vérins', () => {
  it('sélection : les blocs sous un pied restent des blocs de calage, ceux sous le plancher seul sont des appuis ajoutés', () => {
    expect(addedSupportBlocks(blocks, two, true, true).map((b) => b.id)).toEqual(['BL10', 'BL11', 'BL12', 'BL13']);
    // sans mesure du dessin : la géométrie (sous le plancher, loin des pieds) décide
    const bare = blocks.map(({ under: _u, ...b }) => b);
    expect(addedSupportBlocks(bare, two, true, true).map((b) => b.id)).toEqual(['BL10', 'BL11', 'BL12', 'BL13']);
    // trop de vide sous la structure (> 10 cm) : pas un appui
    expect(addedSupportBlocks([{ ...centre[0], under: { feet: null, frame: 150 } }], two, true, true)).toEqual([]);
    // options de l'étape 3 : calés par défaut, « seulement leur poids » sur demande, avec ou sans vérins
    expect(resolveGroundContact(undefined, true, two, blocks, 0.03, true)).toMatchObject({ mode: 'added', pads: centre });
    expect(resolveGroundContact({ mode: 'points', added: 'weight' }, true, two, blocks, 0.03, true)).toBeNull();
    expect(resolveGroundContact({ mode: 'points' }, false, two, blocks, 0.03, true)!.mode).toBe('added');
    expect(resolveGroundContact({ mode: 'points' }, true, two, nine, 0.03, true)).toBeNull();
    // l'empreinte du calcul change avec les appuis ajoutés, même avec les vérins
    const gc = resolveGroundContact(undefined, true, two, blocks, 0.03, true)!;
    expect(inputKey({ ...base, groundContact: gc })).not.toBe(inputKey(base));
  });

  it('estimation instantanée : les blocs ajoutés prennent la part du plancher autour d’eux, la charge totale ne change pas', () => {
    const inp0 = calageInput(estMods, hyp, stock, true);
    const gc = resolveGroundContact(undefined, true, two, blocks, 0.03, true)!;
    const inp1 = calageInput(estMods, hyp, stock, true, [], false, gc);
    const e0 = estimateReactions(inp0.modules, inp0.estimate);
    const e1 = estimateReactions(inp1.modules, inp1.estimate);
    const added = e1.reactions.filter((r) => r.group.strip?.added);
    expect(new Set(added.map((r) => r.group.strip!.pad))).toEqual(new Set(['BL10', 'BL11', 'BL12', 'BL13']));
    expect(added.every((r) => !r.group.jack && r.group.id.startsWith('L'))).toBe(true);
    const G = (e: typeof e0) => e.reactions.reduce((a, r) => a + r.G, 0);
    expect(G(e1)).toBeCloseTo(G(e0), 3);
    expect(e1.verticalK!).toBeCloseTo(e0.verticalK!, 3);
    // le plancher porté par les blocs n'est plus sur les vérins
    const jacks = (e: typeof e0) => e.reactions.filter((r) => r.group.jack).reduce((a, r) => a + r.G, 0);
    expect(jacks(e1)).toBeLessThan(jacks(e0) - added.reduce((a, r) => a + r.G, 0) + 1);
    expect(added.reduce((a, r) => a + r.G, 0)).toBeGreaterThan(0.1 * G(e1));
  });

  it('calcul 3D : appuis sous les profils, angles soulagés, blocs dans le calage, plus de « bloc sous aucun appui »', async () => {
    const gc = resolveGroundContact(undefined, true, two, blocks, 0.03, true)!;
    const [r0, r1] = await Promise.all([runStudy(base, createInlineStudyRunner()), runStudy({ ...base, groundContact: gc }, createInlineStudyRunner())]);
    expect(r1.summary.errors).toEqual([]);
    expect(r1.structure.contact?.mode).toBe('added');
    // les vérins restent (6 par Viewbox) et les tronçons des blocs s'ajoutent
    expect(r1.structure.supportMeta.filter((m) => m.jack)).toHaveLength(12);
    const lines = r1.ground.reactions.filter((r) => r.group.strip);
    expect(new Set(lines.map((r) => r.group.strip!.pad))).toEqual(new Set(['BL10', 'BL11', 'BL12', 'BL13']));
    expect(lines.every((r) => r.group.strip!.added)).toBe(true);
    // même charge totale, les vérins d'angle soulagés
    expect(r1.ground.verticalK!).toBeCloseTo(r0.ground.verticalK!, -2);
    const corner = (r: typeof r0) => Math.max(...r.ground.reactions.filter((x) => x.group.jack && !x.group.middle).map((x) => x.Rk));
    expect(corner(r1)).toBeLessThan(0.95 * corner(r0));
    const cal = (r: typeof r0, c: typeof gc | null) => computeCalage({ ...calageInput(estMods, hyp, stock, true, [], false, c), reactions: r.ground, blocks, choices: { roadway: true }, roadwayThickness: 38, roadwayPlates: (19 * 9.81) / 1e6 });
    const [c0, c1] = [cal(r0, null), cal(r1, gc)];
    expect(c0.looseBlocks?.map((b) => b.id)).toEqual(['BL10', 'BL11', 'BL12', 'BL13']);
    expect(c1.looseBlocks ?? []).toEqual([]);
    expect(c1.checks).toHaveLength(13);
    const addedType = c1.types.find((t) => t.label.startsWith('bloc ajouté (calé)'))!;
    expect(addedType.checks.map((c) => c.block!.id).sort()).toEqual(['BL10', 'BL11', 'BL12', 'BL13']);
    expect(c1.warnings.some((w) => w.startsWith('Appuis ajoutés : les blocs BL10, BL11, BL12, BL13'))).toBe(true);
    expect(c1.warnings.some((w) => /sous aucun appui/.test(w))).toBe(false);
    // dalle sous chaque Viewbox : le même poids (ajouter des appuis ne le change pas)
    for (const z of c1.slab!.zones) expect(z.load).toBeCloseTo(c0.slab!.zones.find((x) => x.id === z.id)!.load, -3);
    // descente de charges par appui : un appui de plus par bloc, la charge locale de la jonction baisse
    expect(c1.slab!.supports).toHaveLength(13);
    const junction = (c: typeof c0) => Math.max(...c.slab!.supports!.filter((l) => l.members.length === 2).map((l) => l.q));
    expect(junction(c1)).toBeLessThan(junction(c0));
    const addedLoads = c1.slab!.supports!.filter((l) => /^BL1[0-3]$/.test(l.members[0]));
    expect(addedLoads).toHaveLength(4);
    // fiche : section « Descente de charges par appui » avec les blocs ajoutés, hypothèse « Appuis ajoutés »
    const info = { project: 'IKEA', source: 'test', date: '23/11/2026', assumptions: [['Appuis ajoutés', '4 bloc(s) calé(s) sous les profils du plancher, hors des vérins (BL10, BL11, BL12, BL13) : ils portent dans le calcul (coins serrés sur site)']] as Array<[string, string]> };
    const txt = groundSheetPages({ result: c1, modules: estMods, info }).map((p) => renderToStaticMarkup(p)).join('');
    expect(txt).toMatch(/Descente de charges par appui/);
    expect(txt).toMatch(/\(BL10\)/);
    expect(txt).toMatch(/bloc ajouté \(calé\)/);
  }, 300_000);
});

describe('descente de charges par appui (charge locale sous chaque plaque)', () => {
  const inp = { ...calageInput(estMods, hyp, stock, true), blocks: nine, choices: { roadway: true }, roadwayThickness: 38, roadwayPlates: (19 * 9.81) / 1e6 };

  it('q = (Rz,k + calage) / surface de la plaque élargie à 45° dans les plaques de roulage + plaques de roulage réparties', () => {
    const r = computeCalage(inp);
    const spread = (19 * 9.81) / 1e6;
    for (const l of r.slab!.supports!) {
      const c = r.checks.find((x) => x.id === l.id)!;
      expect(l.reaction).toBeCloseTo(c.Rzk, 6);
      expect(l.calage).toBeCloseTo(c.block!.massKg * 9.81, 3);
      expect(l.plate.dims[0]).toBeCloseTo(1000 + 2 * 38, 0);
      expect(l.q).toBeCloseTo((l.reaction + l.calage) / l.plate.area + spread, 9);
      expect(l.areaNeeded).toBeCloseTo((l.reaction + l.calage) / (r.slab!.bearing - spread), 3);
      expect(c.local?.id).toBe(l.id);
    }
    // information seulement : le taux de chaque appui reste celui de la dalle sous sa Viewbox
    expect(r.slab!.local).toBeUndefined();
    for (const c of r.checks) expect(c.etaGround).toBeCloseTo(c.zone!.eta, 9);
    expect(r.warnings[0]).toMatch(/La charge locale sous chaque plaque \(descente de charges par appui\) n’est qu’une information : la plus forte B\d+, /);
  });

  it('critère exigé par l’exploitant : chaque plaque doit passer (taux, problème, fiche de calcul)', () => {
    const r = computeCalage({ ...inp, slabLocal: true });
    expect(r.slab!.local).toBe(true);
    const worst = r.slab!.supports!.reduce((a, l) => (l.eta > a.eta ? l : a));
    expect(worst.eta).toBeGreaterThan(1);
    const c = r.checks.find((x) => x.id === worst.id)!;
    expect(c.etaGround).toBeCloseTo(worst.eta, 9);
    expect(c.problems.some((p) => p.startsWith(`charge locale sous la plaque de ${c.id}`))).toBe(true);
    expect(c.records.some((x) => x.key === 'slab.local')).toBe(true);
    expect(r.allPlates).toBe(false);
  });

  it('cale composée sur des blocs de 1 001 × 999,5 mm : dimensions arrondies, une seule ligne de matériel par pièce', () => {
    const odd = nine.map((b, i) => ({ ...b, x1: b.x0 + 1001.0000610351657, z1: b.z0 + (i % 2 ? 999.529541015625 : 1001.0000610351562) }));
    const cale = [{ plate: blockPlateKey('birch', 18), n: 2 }, { plate: joistKey(75, 225), n: 3 }, { plate: blockPlateKey('birch', 18), n: 3 }];
    const r = computeCalage({ ...inp, blocks: odd, choices: { roadway: true, blockComposition: cale } });
    const ply = r.materials.filter((m) => /Multiplex/.test(m.label));
    expect(ply).toHaveLength(1);
    expect(ply[0].dims).toBe('1000 × 1000 × 18 mm');
    expect(ply[0].quantity).toBe(45);
    const shown = [...r.materials.flatMap((m) => [m.label, m.dims]), ...(r.stacks ?? []).flatMap((st) => st.layers.map((l) => l.label))].join(' | ');
    expect(shown).not.toMatch(/\d\.\d{3,}/);
  });

  it('fiche : une valeur d’hypothèse longue continue à la ligne au lieu d’être coupée', () => {
    const r = computeCalage(inp);
    const long = 'limité à 8 personnes × 80 kg (nombre contrôlé sur place ; structure calculée avec 2,94 kN/m² au rez-de-chaussée, moins que la charge réglementaire de 5 kN/m²)';
    const txt = renderToStaticMarkup(groundSheetPages({ result: r, modules: estMods, info: { project: 'P', source: 'S', date: 'd', assumptions: [['Public pour le sol', long]] } })[0]);
    expect(txt).toMatch(/moins que la charge réglementaire de 5 kN\/m²\)/);
  });
});
