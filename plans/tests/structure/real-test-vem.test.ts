// Modèle SketchUp « test_structurelle_VEM_20261001-1554 » d'A. Pinchart (reference-reports/, non versionné) : 3 Viewbox
// en ligne, VBX-05 alignée sur VBX-01, VBX-04 et VBX-06 tournées de 90° en porte-à-faux de 0,90 m à l'arrière, 6 cales
// 300 × 60 × 20 mm (catégorie STRUCTURE) aux croisements de rives. Les cales sont ignorées (l'appui rive sur rive les
// représente) ; les angles en porte-à-faux ne bloquent plus, le calcul complet passe. Ignoré sans le fichier.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../../src/core/classification';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { itemBoxDims } from '../../src/structure/scene/geometry';
import type { Assignments } from '../../src/structure/core/recognition';
import { recognize } from '../../src/structure/core/recognition';
import { studyModelFromScene } from '../../src/structure/scene/studyModel';
import { mergeLibrary } from '../../src/structure/core/libraryStore';
import { SEED } from '../../src/structure/library/seed';
import { buildStudyInputs } from '../../src/ui/structure/studyInputs';
import { DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';
import { CALC_DEFAULTS, assembleStudy, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';

const file = join(__dirname, '..', '..', 'reference-reports', 'test_structurelle_VEM_20261001-1554.zip');

describe.skipIf(!existsSync(file))('modèle « test structurelle VEM » (Viewbox tournées en porte-à-faux)', () => {
  it('cales ignorées, appuis rive sur rive, porte-à-faux 0,90 m vérifié, calcul complet sans erreur', async () => {
    const buf = readFileSync(file);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const res = await ingest({ fileName: 'test.zip', data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
    const library = mergeLibrary(SEED, []);
    const dims = itemBoxDims(scene, scene.index.nodes.filter((n) => n.role === 'item').map((n) => n.id));
    const accessoryCategories = compileRules(DEFAULT_RULES).accessoryKeys;
    const first = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments: {}, accessoryCategories });
    const plates = first.types.filter((t) => t.kind === 'item' && t.category === 'STRUCTURE');
    expect(plates).toHaveLength(6);
    const assignments: Assignments = {};
    for (const t of plates) assignments[t.key] = { scope: 'model', at: '', assignment: { role: 'ignored', nature: 'other' } };
    const recognition = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments, accessoryCategories });
    const sceneModel = studyModelFromScene(scene, recognition, library);
    expect(sceneModel.errors).toEqual([]);
    const { inputs } = buildStudyInputs({ sceneModel, library, hyp: DEFAULT_HYP, roof: false, calc: CALC_DEFAULTS });
    const s = assembleStudy(inputs);
    expect(s.errors).toEqual([]);
    expect(s.unsupported.map((u) => [u.module, u.corner + 1, Math.round(u.cantilever! / 100) / 10])).toEqual([
      ['VBX-04', 2, 0.9],
      ['VBX-04', 3, 0.9],
      ['VBX-06', 2, 0.9],
      ['VBX-06', 3, 0.9],
    ]);
    expect(s.meta.filter((m) => m.family === 'rim-bearing')).toHaveLength(8);
    const run = await runStudy(inputs, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    expect(run.stability.overturning.verdict).toBe('ok');
  }, 600_000);
});
