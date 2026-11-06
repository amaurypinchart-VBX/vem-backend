// Contact des Viewbox avec le sol sans vérins (A. Pinchart 05.11.2026) : posées directement au sol (toute la rive UNP
// porte), ou posées sur des plaques / blocs (la rive porte sur la largeur de la plaque ; hors rive, les traverses /
// lisses). Géométrie des tronçons, disposition des plaques, appuis élastiques du calcul 3D, estimation instantanée,
// calage (tronçons = « pieds » sur la plaque, résultante, compression ⊥, flexion d'une plaque mince).
import { describe, expect, it } from 'vitest';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import type { DrawnBlock } from '../../src/structure/core/blocks';
import { blockChain } from '../../src/structure/core/blocks';
import { computeCalage } from '../../src/structure/core/calage';
import { estimateReactions, gridModules, rigidShares } from '../../src/structure/core/estimate';
import type { ModuleFloor } from '../../src/structure/core/groundContact';
import { PAD_LAYOUT_DEFAULT, contactStrips, floorLinesOfTemplate, floorOfEstimate, floorOfPlaced, layoutPads, resolveGroundContact, splitFloor } from '../../src/structure/core/groundContact';
import { placedToEstimate } from '../../src/structure/core/mods';
import { viewboxTemplate } from '../../src/structure/core/templates/viewboxEU';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, inputKey, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';
import { calageInput, DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';
import { LOADS, vbx } from './studyHelpers';

const params = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!.params!;
const sections = sectionMap(SEED);
const one = [vbx('A', 0, 0)];
const two = [vbx('A', 0, 0), vbx('B', 0, 2.5)];
const floors = (mods: typeof one): ModuleFloor[] => mods.map(floorOfPlaced);
const base: StudyInputs = { modules: one, edgeItems: [], pointItems: [], library: SEED, sections, loads: LOADS, middleFeet: false, sls: true, options: { ...CALC_DEFAULTS }, blocking: [] };
const hyp = { ...DEFAULT_HYP, bearingValue: 200, bearingUnit: 'kN/m²' as const };

describe('disposition des plaques', () => {
  it('une Viewbox : 4 angles + 2 milieux à fleur, blocs au centre sous les profils', () => {
    const pads = layoutPads(floors(one), { ...PAD_LAYOUT_DEFAULT, centre: 1 });
    expect(pads).toHaveLength(7);
    // à fleur de l'installation : aucune plaque ne dépasse de 0…5 900 × −2 500…0
    for (const p of pads) {
      expect(p.x0).toBeGreaterThanOrEqual(-0.01);
      expect(p.x1).toBeLessThanOrEqual(5900.01);
      expect(p.z0).toBeGreaterThanOrEqual(-2500.01);
      expect(p.z1).toBeLessThanOrEqual(0.01);
      expect(p.x1 - p.x0).toBeCloseTo(1000, 6);
    }
    // centrée sous la rive : la plaque d'angle dépasse de la moitié
    const centred = layoutPads(floors(one), { ...PAD_LAYOUT_DEFAULT, middles: false, placement: 'centered' });
    expect(centred.map((p) => [p.x0, p.x1]).sort((a, b) => a[0] - b[0])[0]).toEqual([-500, 500]);
  });

  it('deux Viewbox côte à côte : les angles et les milieux de la jonction partagent une plaque (9 plaques, comme IKEA)', () => {
    const pads = layoutPads(floors(two), PAD_LAYOUT_DEFAULT);
    expect(pads).toHaveLength(9);
    // plaques de la jonction (z = −2 500) centrées sur elle
    const junction = pads.filter((p) => p.z0 < -2500 && p.z1 > -2500);
    expect(junction).toHaveLength(3);
    for (const p of junction) expect((p.z0 + p.z1) / 2).toBeCloseTo(-2500, 6);
  });
});

describe('tronçons qui portent', () => {
  const tpl = viewboxTemplate(params);
  const lines = (t = tpl): ModuleFloor[] => [{ ...floorOfPlaced(one[0]), lines: floorLinesOfTemplate(t, (k) => sections.get(k)?.section.dims.b) }];

  it('posée au sol : les 4 rives, semelle de l’UNP (80 mm), surface = périmètre × 80 sans compter deux fois les angles', () => {
    const f = lines();
    expect(f[0].lines.filter((l) => l.kind === 'rim')).toHaveLength(4);
    expect(f[0].lines.filter((l) => l.kind === 'secondary')).toHaveLength(6);
    const plan = contactStrips(f, 'rims', [], 0.03, 1000);
    // 6 + 6 tronçons le long des grands côtés, 3 + 3 le long des petits
    expect(plan.strips).toHaveLength(18);
    const area = plan.strips.reduce((a, s) => a + s.stations.reduce((b, x) => b + x.area, 0), 0);
    expect(area).toBeCloseTo(2 * 5900 * 80 + 2 * (2500 - 160) * 80, 0);
    // raideur = k · surface de contact
    const kv = plan.strips.reduce((a, s) => a + s.stations.reduce((b, x) => b + x.kv, 0), 0);
    expect(kv).toBeCloseTo(0.03 * area, 3);
    // espacement des appuis ≤ 250 mm
    for (const s of plan.strips) {
      const along = s.stations.map((x) => (Math.abs(s.along[0]) > 0.5 ? x.u : x.v)).sort((a, b) => a - b);
      for (let k = 1; k < along.length; k++) expect(along[k] - along[k - 1]).toBeLessThanOrEqual(251);
    }
  });

  it('plaque d’angle : les deux rives portent ; plaque au centre : les lisses (pas de rive à cet endroit)', () => {
    const pads = layoutPads(floors(one), { ...PAD_LAYOUT_DEFAULT, middles: false, centre: 1 });
    const plan = contactStrips(lines(), 'pads', pads, 0.03, 1000);
    const corner = pads.find((p) => p.x0 === 0 && p.z1 === 0)!;
    const onCorner = plan.strips.filter((s) => s.pad === corner.id);
    expect(onCorner.map((s) => s.kind)).toEqual(['rim', 'rim']);
    expect(onCorner.map((s) => Math.round(s.length)).sort((a, b) => a - b)).toEqual([920, 1000]);
    expect(onCorner.every((s) => s.corner)).toBe(true);
    const centre = pads.find((p) => p.x0 > 1000 && p.x1 < 4900)!;
    const onCentre = plan.strips.filter((s) => s.pad === centre.id);
    // lisses à 835 et 1 665 mm traversent la plaque 2 450…3 450 × 750…1 750 ; aucune traverse (2 344 / 3 544)
    expect(onCentre.map((s) => s.label)).toEqual(['lisse du plancher', 'lisse du plancher']);
    // plaque : sol (k · A) en série avec le bois, réparti au prorata ; moins raide que le sol seul
    const kv = onCentre.reduce((a, s) => a + s.stations.reduce((b, x) => b + x.kv, 0), 0);
    expect(kv).toBeLessThan(0.03 * 1e6);
    expect(kv).toBeGreaterThan(0.5 * 0.03 * 1e6);
  });

  it('découpe des barres du plancher : nœuds ajoutés, mêmes lignes, rives des faces complétées', () => {
    const t2 = splitFloor(tpl, [
      { u: 500, v: 5 },
      { u: 2950, v: 1665 },
      { u: 5, v: 700 },
    ]);
    expect(t2.nodes.length).toBe(tpl.nodes.length + 3);
    expect(t2.members.length).toBe(tpl.members.length + 3);
    expect(t2.faces.find((f) => f.side === 'v0')!.rimFloor.length).toBe(tpl.faces.find((f) => f.side === 'v0')!.rimFloor.length + 1);
    // un point déjà nœud ne change rien
    expect(splitFloor(tpl, [{ u: 5, v: 5 }]).members.length).toBe(tpl.members.length);
  });
});

describe('calcul 3D posé au sol / sur plaques', () => {
  it('posée au sol : équilibre, la rive plancher ne travaille presque plus, les angles se déchargent', async () => {
    const points = await runStudy(base, createInlineStudyRunner());
    const rims = await runStudy({ ...base, groundContact: { mode: 'rims', pads: [], k: 0.03 } }, createInlineStudyRunner());
    expect(rims.summary.errors).toEqual([]);
    expect(rims.structure.fem.supports.length).toBeGreaterThan(60);
    expect(rims.structure.supportMeta.every((m) => m.kind === 'line')).toBe(true);
    // même charge totale au sol, une réaction par tronçon de rive
    expect(rims.ground.verticalK!).toBeCloseTo(points.ground.verticalK!, -1);
    expect(rims.ground.groups).toHaveLength(18);
    expect(rims.ground.groups.every((g) => g.strip?.kind === 'rim')).toBe(true);
    const eta = (r: typeof points, re: RegExp) => Math.max(...r.verdict.families.filter((f) => re.test(f.family)).map((f) => f.eta));
    expect(eta(rims, /^Rive plancher/)).toBeLessThan(0.3 * eta(points, /^Rive plancher/));
    expect(eta(rims, /^Angles poteau/)).toBeLessThan(eta(points, /^Angles poteau/));
    // plus grande réaction d'un tronçon d'environ 1 m bien plus petite que celle d'un angle
    expect(Math.max(...rims.ground.reactions.map((r) => r.Rk))).toBeLessThan(0.5 * Math.max(...points.ground.reactions.map((r) => r.Rk)));
    // empreinte des entrées : le contact au sol en fait partie, rien de changé sans lui
    expect(inputKey({ ...base, groundContact: { mode: 'rims', pads: [], k: 0.03 } })).not.toBe(inputKey(base));
    expect(inputKey({ ...base, groundContact: null })).toBe(inputKey(base));
    // avec les vérins le contact est ignoré
    expect(inputKey({ ...base, options: { ...base.options, jacks: true }, groundContact: { mode: 'rims', pads: [], k: 0.03 } })).toBe(inputKey({ ...base, options: { ...base.options, jacks: true } }));
  }, 120_000);

  it('sur plaques : chaque tronçon sur sa plaque, la plaque centrale soulage les angles', async () => {
    const pads = layoutPads(floors(one), { ...PAD_LAYOUT_DEFAULT, centre: 1 });
    const run = await runStudy({ ...base, groundContact: { mode: 'pads', pads, k: 0.03 } }, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    const byPad = new Map<string, number>();
    for (const r of run.ground.reactions) byPad.set(r.group.strip!.pad!, (byPad.get(r.group.strip!.pad!) ?? 0) + r.Rk);
    expect(byPad.size).toBe(7);
    const centre = pads.find((p) => p.x0 > 1000 && p.x1 < 4900 && p.z0 > -2000 && p.z1 < -500)!;
    expect(byPad.get(centre.id)!).toBeGreaterThan(10e3);
    // calage : appuis « B… » par plaque, types angle / milieu / profils
    const cal = computeCalage({ ...calageInput(one.map(placedToEstimate), hyp, { plates: [], commercial: [] }), reactions: run.ground, blocks: pads });
    expect(cal.checks).toHaveLength(7);
    expect(new Set(cal.types.map((t) => t.typeKey))).toEqual(new Set(['BLA', 'BLM', 'BLS']));
    expect(cal.checks.every((c) => c.block)).toBe(true);
  }, 120_000);

  it('dalle en charge répartie : des blocs ajoutés au centre ne pénalisent pas la Viewbox (A. Pinchart 05.11.2026)', async () => {
    const hypSlab = { ...DEFAULT_HYP, bearingValue: 450, bearingUnit: 'kg/m²' as const, bearingMode: 'distributed' as const };
    const q = async (centre: number) => {
      const pads = layoutPads(floors(one), { ...PAD_LAYOUT_DEFAULT, centre });
      const run = await runStudy({ ...base, groundContact: { mode: 'pads', pads, k: 0.03 } }, createInlineStudyRunner());
      const cal = computeCalage({ ...calageInput(one.map(placedToEstimate), hypSlab, { plates: [], commercial: [] }, false, [], false, { mode: 'pads', pads, k: 0.03 }), reactions: run.ground, blocks: pads });
      const corner = cal.checks.filter((c) => c.typeKey === 'BLA').map((c) => c.Rzk);
      return { zone: cal.slab!.zones[0], corner: Math.max(...corner) };
    };
    const a = await q(0);
    const b = await q(2);
    // la charge d'angle baisse un peu, le poids de la Viewbox sur la dalle ne change que du poids des 2 plaques ajoutées
    expect(b.corner).toBeLessThan(a.corner);
    expect(b.zone.area).toBeCloseTo(a.zone.area, -3);
    expect(b.zone.load).toBeLessThan(a.zone.load + 2 * 20 * 9.81 + 300);
  }, 120_000);

  it('Viewbox sans aucune plaque sous ses profils : erreur bloquante', () => {
    const far: DrawnBlock = { id: 'PL1', label: 'loin', x0: 10000, x1: 11000, z0: 0, z1: 1000, bottom: -40, top: 0, massKg: 20, massSource: 'computed', material: 'C24', pieces: 1 };
    const s = assembleStructure(one, { sections, jacks: false, middleFeet: false, upliftReleases: 'all', calibration: false, groundContact: { mode: 'pads', pads: [far], k: 0.03 } });
    expect(s.errors.join(' ')).toMatch(/aucune rive ni aucun profil/);
    expect(s.warnings.join(' ')).toMatch(/PL1.*ne porte rien/);
  });
});

describe('estimation instantanée et calage', () => {
  it('plancher rigide sur appuis élastiques : charge centrée = parts proportionnelles aux raideurs, moments en équilibre', () => {
    const pos: Array<[number, number]> = [
      [0, 0],
      [4, 0],
      [4, 2],
      [0, 2],
    ];
    expect(rigidShares(pos, [1, 1, 1, 1], [2, 1]).map((x) => +x.toFixed(6))).toEqual([0.25, 0.25, 0.25, 0.25]);
    const s = rigidShares(pos, [1, 1, 1, 1], [3, 1]);
    expect(s.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(s.reduce((a, b, i) => a + b * pos[i][0], 0)).toBeCloseTo(3, 9);
    // appuis alignés : seul le moment le long de la ligne est repris
    const line = rigidShares([[0, 0], [1, 0], [2, 0]], [1, 1, 1], [1.5, 0]);
    expect(line.reduce((a, b, i) => a + b * i, 0)).toBeCloseTo(1.5, 9);
  });

  const mods = gridModules(1, 1, [[1]], false);
  const est = (contact: Parameters<typeof calageInput>[6]) => calageInput(mods, hyp, { plates: [], commercial: [] }, false, [], false, contact);

  it('posée au sol : un groupe par tronçon de rive, mêmes charges totales que l’estimation aux angles', () => {
    const pts = estimateReactions(mods, est(null).estimate);
    const rims = estimateReactions(mods, est({ mode: 'rims', pads: [], k: 0.03 }).estimate);
    expect(rims.groups.every((g) => g.strip?.kind === 'rim')).toBe(true);
    // angles de la grille = lignes de système (5 890 × 2 490) : 6 + 6 tronçons de grand côté, 2 + 2 de petit côté
    expect(rims.groups).toHaveLength(16);
    const sumG = (e: typeof pts) => e.reactions.reduce((a, r) => a + r.G, 0);
    expect(sumG(rims)).toBeCloseTo(sumG(pts), 3);
    // calage : types « LA » (tronçon d'angle) et « L » ; tronçon à la semelle de l'UNP (≈ 98 × 8 cm)
    const cal = computeCalage(est({ mode: 'rims', pads: [], k: 0.03 }));
    expect(new Set(cal.types.map((t) => t.typeKey))).toEqual(new Set(['LA', 'L']));
    const c = cal.checks.find((x) => x.reaction.group.strip && Math.abs(x.reaction.group.strip.along[0]) > 0.5)!;
    expect(Math.max(...c.geometry.contact)).toBeGreaterThan(900);
    expect(Math.min(...c.geometry.contact)).toBeCloseTo(80, 6);
    expect(cal.checks.every((x) => x.tuv === null)).toBe(true);
  });

  it('plaques à l’angle : l’UNP des deux côtés ramène la charge vers l’intérieur (emprise bien plus grande qu’un angle sur bloc)', () => {
    const blocks = layoutPads(mods.map(floorOfEstimate), { ...PAD_LAYOUT_DEFAULT, thickness: 600, middles: false });
    const onRims = computeCalage({ ...est({ mode: 'pads', pads: blocks, k: 0.03 }), blocks });
    const onCorners = computeCalage({ ...est(null), blocks });
    const effArea = (c: (typeof onRims.checks)[number]) => c.steps[1].dims![0] * c.steps[1].dims![1];
    const a1 = Math.min(...onRims.checks.map(effArea));
    const a0 = Math.min(...onCorners.checks.map(effArea));
    // angle seul sur un bloc à fleur : 21 × 21 cm ; rives des deux côtés sur 1 m : > 0,25 m²
    expect(a0).toBeCloseTo(210 * 210, -2);
    expect(a1).toBeGreaterThan(0.25e6);
  });

  it('plaque mince : répartition limitée à la semelle élargie (45° + flexion), plaque épaisse : toute la zone centrée sur la charge', () => {
    const thin = layoutPads(mods.map(floorOfEstimate), { ...PAD_LAYOUT_DEFAULT, thickness: 18, middles: false, corners: false, centre: 1 });
    const thick = thin.map((b) => ({ ...b, bottom: b.top - 300 }));
    const run = (blocks: DrawnBlock[]) => computeCalage({ ...est({ mode: 'pads', pads: blocks, k: 0.03 }), blocks }).checks[0];
    const t = run(thin);
    const T = run(thick);
    const bc = blockChain({ block: thin[0], feet: [], geometry: t.geometry, rect: [0, 1, 0, 1], edges: [null, null] });
    expect(bc.stripReach).toBeUndefined();
    expect(t.steps[1].area).toBeLessThan(T.steps[1].area);
    expect(t.steps[1].note ?? '').toMatch(/flexion de la plaque/);
  });

  it('options de l’étape 3 : blocs du modèle par défaut, disposition générée sinon ; rien avec les vérins', () => {
    const drawn: DrawnBlock[] = [{ id: 'BL1', label: 'sous-bois', x0: 0, x1: 1000, z0: -1000, z1: 0, bottom: -600, top: 0, massKg: 250, massSource: 'computed', material: 'C24', pieces: 1 }];
    expect(resolveGroundContact({ mode: 'pads' }, false, one, drawn, 0.03)!.pads).toEqual(drawn);
    expect(resolveGroundContact({ mode: 'pads', pads: 'layout' }, false, one, drawn, 0.03)!.pads).toHaveLength(6);
    expect(resolveGroundContact({ mode: 'rims' }, true, one, drawn, 0.03)).toBeNull();
    expect(resolveGroundContact({ mode: 'points' }, false, one, drawn, 0.03)).toBeNull();
  });
});

describe('rapport : pose au sol / sur plaques traduite', () => {
  it('FR / DE / EN sans mot français dans les textes du moteur', async () => {
    const { buildReport } = await import('../../src/structure/report/build');
    const { FRENCH_MARKERS } = await import('../../src/structure/report/translate');
    const texts = (svg: string) => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
    const pads = layoutPads(floors(two), { ...PAD_LAYOUT_DEFAULT, centre: 1 });
    for (const gc of [{ mode: 'rims' as const, pads: [], k: 0.03 }, { mode: 'pads' as const, pads, k: 0.03 }]) {
      const study: StudyInputs = { ...base, modules: two, groundContact: gc };
      const run = await runStudy(study, createInlineStudyRunner());
      const calage = computeCalage({ ...calageInput(two.map(placedToEstimate), hyp, { plates: [], commercial: [] }, false, [], false, gc), reactions: run.ground, ...(gc.mode === 'pads' ? { blocks: pads } : {}) });
      for (const lang of ['fr', 'de', 'en'] as const) {
        const r = buildReport({
          lang,
          variant: 'detailed',
          project: { name: 'P', number: '1', client: 'C', address: 'A', installation: '1' },
          author: 'A',
          date: new Date(2026, 10, 5),
          model: { fileName: 'm.zip', date: '05.11.2026' },
          version: 'v1',
          study,
          run,
          calage,
          bearing: { value: 200, label: 'Ref.' },
          moduleWeightKg: 2564,
          sceneWarnings: [],
        });
        const all = r.pages.flatMap((p) => texts(p.svg)).join('\n');
        if (lang === 'fr') {
          expect(all.replace(/\n/g, ' ')).toMatch(gc.mode === 'rims' ? /toute la rive \(UNP 220\) du plancher porte/ : /porte sur toute la largeur de chaque plaque/);
          continue;
        }
        const markers = FRENCH_MARKERS.filter((w) => !(lang === 'de' && ['des', 'service'].includes(w)) && !(lang === 'en' && ['service', 'charge'].includes(w)));
        const found = markers.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(all));
        expect(found.map((w) => all.split('\n').find((l) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(l)))).toEqual([]);
      }
    }
  }, 300_000);
});
