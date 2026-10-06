// Modèle SketchUp « Xiaomi_Paris_2026_VEM_20260929-0951 » d'A. Pinchart (reference-reports/, non versionné) : 16 Viewbox
// dont une rangée de 4 empilées sur 4, escalier extérieur avec palier contre les petits côtés de la rangée du haut,
// palier au bout de VBX-16. Ignoré sans le fichier.
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
import { buildStudyInputs } from '../../src/ui/structure/studyInputs';
import { DEFAULT_HYP } from '../../src/ui/structure/GroundPanel';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';

const file = join(__dirname, '..', '..', 'reference-reports', 'Xiaomi_Paris_2026_VEM_20260929-0951.zip');

describe.skipIf(!existsSync(file))('modèle Xiaomi Paris 2026 (escalier contre une rangée de Viewbox empilées)', () => {
  it('palier porté par VBX-16, escalier et glissement des Viewbox empilées calculés, verdict complet, longueur par ensemble, plancher 2 couches', async () => {
    const buf = readFileSync(file);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const res = await ingest({ fileName: 'xiaomi.zip', data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
    const library = mergeLibrary(SEED, []);
    const dims = itemBoxDims(scene, scene.index.nodes.filter((n) => n.role === 'item').map((n) => n.id));
    const recognition = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments: {}, accessoryCategories: compileRules(DEFAULT_RULES).accessoryKeys });
    const sceneModel = studyModelFromScene(scene, recognition, library);
    expect(sceneModel.errors).toEqual([]);
    expect(sceneModel.stairs).toHaveLength(1);
    expect(sceneModel.stairs[0]).toMatchObject({ module: 'VBX-16', side: 'u1', level: 'floor' });
    const { inputs } = buildStudyInputs({ sceneModel, library, hyp: DEFAULT_HYP, roof: false, calc: CALC_DEFAULTS });
    const run = await runStudy(inputs, createInlineStudyRunner());
    expect(run.structure.errors).toEqual([]);
    expect(run.summary.errors).toEqual([]);
    expect(run.verdict.families.filter((f) => f.verdict === 'incomplete')).toEqual([]);
    expect(run.verdict.families.find((f) => /^Limon/.test(f.family))?.eta).toBeGreaterThan(0);
    expect(run.verdict.families.find((f) => f.family === 'Glissement entre Viewbox empilées')?.eta).toBeLessThan(1);
    // les 4 Viewbox du dessus (VBX-13 à 16) boulonnées entre elles : un seul groupe pour le glissement
    const stacks = run.index.items.filter((it) => it.kind === 'stack');
    expect(stacks.map((it) => it.stackGroup?.modules.length)).toEqual([4, 4, 4, 4]);
    // 3 ensembles séparés, le plus long 11,8 m : pas de remarque « > 30 m » ; pas de fenêtre coulissante dans le modèle
    expect(run.warnings.filter((w) => /> 30 m/.test(w))).toEqual([]);
    expect(run.facade.notes.filter((n) => /coulissantes/.test(n))).toEqual([]);
    // plancher : 2 couches croisées de 18 mm
    expect(run.plywood.records[0].title).toMatch(/2 couches croisées/);
  }, 600_000);
});
