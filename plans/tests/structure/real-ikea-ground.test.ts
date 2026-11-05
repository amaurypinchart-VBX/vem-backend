// Modèle « IKEA 2026 UBI » d'A. Pinchart (reference-reports/ground/, non versionné) : 2 Viewbox côte à côte sur 9 blocs
// bois 1 × 1 × 0,646 m (« Sous bois pour 4 VBX »). Le même modèle calculé avec les vérins, les angles calés, posé au sol
// (toute la rive UNP porte) et posé sur les blocs (la rive porte sur la largeur de chaque bloc) : la répartition change
// avec les appuis, la rive plancher et les angles se déchargent, l'emprise efficace sous un bloc d'angle augmente.
// Ignoré sans le fichier.
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
import { buildStudyInputs, groundContactOf } from '../../src/ui/structure/studyInputs';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import type { CalcOptions, StudyRun } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { computeCalage } from '../../src/structure/core/calage';
import { placedToEstimate } from '../../src/structure/core/mods';

const file = join(__dirname, '..', '..', 'reference-reports', 'ground', 'IKEA_2026_UBI_PROJECT_VEM_20261103-1311.zip');

describe.skipIf(!existsSync(file))('modèle IKEA : vérins, angles, posé au sol, posé sur les blocs', () => {
  it('répartition selon les appuis', async () => {
    const buf = readFileSync(file);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const res = await ingest({ fileName: 'ikea.zip', data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
    const library = mergeLibrary(SEED, []);
    const dims = itemBoxDims(scene, scene.index.nodes.filter((n) => n.role === 'item').map((n) => n.id));
    const recognition = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments: {}, accessoryCategories: compileRules(DEFAULT_RULES).accessoryKeys });
    const sm = studyModelFromScene(scene, recognition, library);
    expect(sm.blocks).toHaveLength(9);
    const hyp = { ...DEFAULT_HYP, bearingValue: 200, bearingUnit: 'kN/m²' as const, middleFeet: true };
    const runs = new Map<string, { run: StudyRun; cal: ReturnType<typeof computeCalage> }>();
    for (const [name, calc] of [
      ['corners', { ...CALC_DEFAULTS }],
      ['rims', { ...CALC_DEFAULTS, contact: { mode: 'rims' } }],
      ['pads', { ...CALC_DEFAULTS, contact: { mode: 'pads' } }],
    ] as Array<[string, CalcOptions]>) {
      const { inputs } = buildStudyInputs({ sceneModel: sm, library, hyp, roof: false, calc });
      const run = await runStudy(inputs, createInlineStudyRunner());
      expect(run.summary.errors).toEqual([]);
      const cal = computeCalage({ ...calageInput(inputs.modules.map(placedToEstimate), hyp, { plates: [], commercial: [] }, false, [], false, groundContactOf(inputs)), blocks: inputs.groundBlocks, reactions: run.ground });
      runs.set(name, { run, cal });
    }
    const eta = (name: string, re: RegExp) => Math.max(...runs.get(name)!.run.verdict.families.filter((f) => re.test(f.family)).map((f) => f.eta));
    // angles calés (pieds centraux 155 mm à l'intérieur) : la rive plancher travaille ; posée au sol / sur blocs : presque plus
    expect(eta('corners', /^Rive plancher/)).toBeGreaterThan(0.8);
    expect(eta('rims', /^Rive plancher/)).toBeLessThan(0.2);
    expect(eta('pads', /^Rive plancher/)).toBeLessThan(0.2);
    // même charge totale au sol
    const vk = (n: string) => runs.get(n)!.run.ground.verticalK!;
    expect(vk('rims')).toBeCloseTo(vk('corners'), -2);
    expect(vk('pads')).toBeCloseTo(vk('corners'), -2);
    // sur les blocs : 9 appuis de calage ; bloc d'angle seul : emprise efficace > 0,25 m² (angle seul sur le bloc : 21 × 21 cm)
    const pads = runs.get('pads')!.cal;
    expect(pads.checks).toHaveLength(9);
    const area = (c: (typeof pads.checks)[number]) => c.steps[1].dims![0] * c.steps[1].dims![1];
    const cornerPad = pads.checks.filter((c) => c.typeKey === 'BLA');
    expect(cornerPad.length).toBe(4);
    for (const c of cornerPad) expect(area(c)).toBeGreaterThan(0.25e6);
    const cornerPt = runs.get('corners')!.cal.checks.filter((c) => c.typeKey === 'B1');
    for (const c of cornerPt) expect(area(c)).toBeLessThan(0.05e6);
    // blocs à fleur au milieu des grands côtés extérieurs : la rive est au bord, bande de la semelle seulement → conseil de centrer
    const mid = pads.checks.filter((c) => c.typeKey === 'BLM');
    expect(mid.length).toBe(2);
    for (const c of mid) expect(c.advice).toMatch(/[Bb]loc centré/);
  }, 600_000);
});
