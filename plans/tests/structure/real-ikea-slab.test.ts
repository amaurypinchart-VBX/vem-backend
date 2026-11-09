// Modèle « IKEA 2026 UBI » du 05.11.2026 (reference-reports/ground/, non versionné) : 2 Viewbox posées sur leurs
// vérins, eux-mêmes sur 9 blocs bois 1 × 1 × 0,244 m, + 4 blocs centraux 1 × 1 × 0,407 m à 1,2 cm sous les profils du
// plancher ; place de l'Opéra (Paris) au-dessus du métro : dalle en charge répartie admissible 450 kg/m², plaques de
// roulage, public limité à 8 personnes. Revue du 09.11.2026 : ce qui touche les blocs dans le dessin, blocs qui ne
// portent rien comptés sur la dalle, bilan par Viewbox, coupe du calage. Ignoré sans le fichier.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../../src/core/classification';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { itemBoxDims } from '../../src/structure/scene/geometry';
import { recognize } from '../../src/structure/core/recognition';
import { studyModelFromScene } from '../../src/structure/scene/studyModel';
import { mergeLibrary } from '../../src/structure/core/libraryStore';
import { SEED } from '../../src/structure/library/seed';
import { buildStudyInputs, carriedDetail, carriedWeights, groundContactOf } from '../../src/ui/structure/studyInputs';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import type { Hypotheses } from '../../src/ui/structure/GroundPanel';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import type { CalcOptions } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { computeCalage } from '../../src/structure/core/calage';
import { placedToEstimate } from '../../src/structure/core/mods';

const file = join(__dirname, '..', '..', 'reference-reports', 'ground', 'IKEA_2026_UBI_PROJECT_VEM_20261105-1154.zip');

describe.skipIf(!existsSync(file))('modèle IKEA (place de l’Opéra, dalle 450 kg/m²)', () => {
  it('dessin, blocs, dalle sous chaque Viewbox, coupe du calage', async () => {
    const buf = readFileSync(file);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const res = await ingest({ fileName: 'ikea.zip', data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
    const library = mergeLibrary(SEED, []);
    const dims = itemBoxDims(scene, scene.index.nodes.filter((n) => n.role === 'item').map((n) => n.id));
    const recognition = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments: {}, accessoryCategories: compileRules(DEFAULT_RULES).accessoryKeys });
    const sm = studyModelFromScene(scene, recognition, library);
    // 9 blocs sous les vérins (platine sur le bloc, UPN 9,6 cm au-dessus), 4 blocs centraux à 1,2 cm sous les profils
    const blocks = sm.blocks!;
    expect(blocks).toHaveLength(13);
    const onJacks = blocks.filter((b) => b.under?.feet !== null && Math.abs(b.under!.feet!) < 5);
    expect(onJacks).toHaveLength(9);
    for (const b of onJacks) expect(b.under!.frame).toBeCloseTo(95.5, 0);
    const centre = blocks.filter((b) => b.under?.feet === null);
    expect(centre).toHaveLength(4);
    for (const b of centre) expect(b.under!.frame).toBeCloseTo(11.7, 0);

    const hyp: Hypotheses = {
      ...DEFAULT_HYP,
      bearingPreset: 'slab',
      bearingValue: 450,
      bearingUnit: 'kg/m²',
      liveGround: 0.49,
      live: 0,
      publicMode: 'persons',
      persons: 8,
      roadwayKg: 23,
      platePlacement: 'flush',
      calage: { roadway: true },
    };
    const run = async (calc: CalcOptions) => {
      const { inputs } = buildStudyInputs({ sceneModel: sm, library, hyp, roof: false, calc });
      const study = await runStudy(inputs, createInlineStudyRunner());
      const carried = carriedWeights(inputs);
      const items = carriedDetail(inputs);
      const modules = inputs.modules.map(placedToEstimate).map((m) => ({ ...m, carried: carried.get(m.id) ?? 0, carriedItems: items.get(m.id) ?? [] }));
      return computeCalage({ ...calageInput(modules, hyp, { plates: [], commercial: [] }, !!calc.jacks, [], false, groundContactOf(inputs)), blocks: inputs.groundBlocks, reactions: study.ground });
    };

    // posées sur leurs vérins (le dessin) : les 4 blocs centraux ne portent rien mais pèsent sur la dalle
    const jacks = await run({ ...CALC_DEFAULTS, jacks: true });
    expect(jacks.groundMode).toBe('jacks');
    expect(jacks.looseBlocks?.map((b) => b.id).sort()).toEqual(['BL10', 'BL11', 'BL12', 'BL9']);
    expect(jacks.warnings.some((w) => /BL9, BL10, BL11, BL12 sont à 1,2 cm sous la structure/.test(w))).toBe(true);
    expect(jacks.warnings.some((w) => w.startsWith('Dessin ≠ calcul'))).toBe(false);
    const blocksKg = blocks.reduce((a, b) => a + b.massKg, 0);
    expect(jacks.slab!.zones.reduce((a, z) => a + z.parts.block, 0) / 9.81).toBeCloseTo(blocksKg, 0);
    for (const z of jacks.slab!.zones) {
      expect(z.budget!.reduce((a, l) => a + l.N, 0)).toBeCloseTo(z.load, 3);
      expect(z.eta).toBeLessThan(1);
    }
    // coupe : plaques de roulage → bloc 24,4 cm → vérin 9,6 cm → dessous de la Viewbox (33,9 cm + plaques de roulage)
    const st = jacks.stacks!.find((s) => s.layers.some((l) => l.kind === 'jack'))!;
    expect(st.layers.map((l) => l.kind)).toEqual(['roadway', 'block', 'jack']);
    expect(st.known).toBeCloseTo(339, 0);
    expect(st.supports).toHaveLength(9);

    // UPN sur les blocs (calcul « sur plaques / blocs ») : le dessin pose les vérins → de combien rehausser
    const pads = await run({ ...CALC_DEFAULTS, contact: { mode: 'pads' } });
    expect(pads.warnings.find((w) => w.startsWith('Dessin ≠ calcul'))).toMatch(/l’UPN est 9,6 cm au-dessus de ces blocs.*rehausser ces blocs de 9,6 cm/);
    const rim = pads.stacks!.find((s) => s.layers.some((l) => l.kind === 'packing') && s.underside)!;
    expect(rim.layers.map((l) => l.kind)).toEqual(['roadway', 'block', 'packing']);
    expect(rim.known).toBeCloseTo(339, 0);
    const prof = pads.stacks!.find((s) => !s.underside)!;
    expect(prof.layers.find((l) => l.kind === 'packing')!.thickness).toBeCloseTo(11.7, 0);
    // dalle : la Viewbox vitrée est la plus chargée ; vitrages au poids type de la catégorie (à confirmer)
    const glazed = pads.slab!.zones.find((z) => z.id === 'VBX-01')!;
    expect(pads.slab!.worst!.id).toBe('VBX-01');
    const glass = glazed.budget!.find((l) => l.key === 'item' && /7-637-010/.test(l.label))!;
    expect(glass.count).toBe(9);
    expect(glass.proposed).toBe(true);
    // même poids total pour les deux poses, à la combinaison près
    expect(pads.slab!.global.load).toBeCloseTo(jacks.slab!.global.load, -3);
  }, 900_000);
});
