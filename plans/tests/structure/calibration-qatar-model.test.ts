// Calage S8 sur le vrai modèle SketchUp du projet statico 24-0569 « Viewbox – Qatar » (export viewbox_prep déposé dans
// test-models/, non versionné, ou VEM_MODELS_DIR) : reconnaissance → modèle de l'étude → calcul complet, avec les
// hypothèses de la note statico (murs 0,50 / vitrages 1,75 / garde-corps 0,10 kN/m, vent 0,41 kN/m² en et hors service,
// appuis aux angles sans vérins). Écarts connus avec la note : escalier + palier absents du calcul (ignorés), pression
// intérieure non appliquée à l'ensemble, position des murs seulement sur les plans statico, et un boulon B / C de plus
// en y = 2,71 m (perçages alignés) qui soulage la rive de la Viewbox perpendiculaire. Ignoré sans le fichier.
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
import type { StudyRun } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';

const dir = process.env.VEM_MODELS_DIR ?? join(__dirname, '..', '..', '..', 'test-models');
const file = join(dir, 'Qatar_Airways_2024_VEM_20261001-1529.zip');

async function qatar(calibration: boolean) {
  const buf = readFileSync(file);
  const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  const res = await ingest({ fileName: 'qatar.zip', data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
  const library = mergeLibrary(SEED, []);
  const dims = itemBoxDims(scene, scene.index.nodes.filter((n) => n.role === 'item').map((n) => n.id));
  const accessoryCategories = compileRules(DEFAULT_RULES).accessoryKeys;
  const first = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments: {}, accessoryCategories });
  // l'escalier n'est pas encore modélisé : ignoré (comme l'a fait l'utilisateur), le reste = propositions par catégorie
  const assignments: Assignments = {};
  for (const t of first.types) if (t.assignment?.nature === 'stair') assignments[t.key] = { scope: 'model', at: '', assignment: { role: 'ignored', nature: 'decor' } };
  const recognition = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments, accessoryCategories });
  const sceneModel = studyModelFromScene(scene, recognition, library);
  const hyp = { ...DEFAULT_HYP, windIn: 0.41, windOut: 0.41 };
  const { inputs } = buildStudyInputs({ sceneModel, library, hyp, roof: false, calc: { ...CALC_DEFAULTS, calibration } });
  return { first, sceneModel, run: await runStudy(inputs, createInlineStudyRunner()) };
}

const family = (run: StudyRun, re: RegExp) => run.verdict.families.find((f) => re.test(f.family))!;

describe.skipIf(!existsSync(file))('calage statico 24-0569 sur le modèle SketchUp Qatar', () => {
  it('reconnaissance : 6 Viewbox, murs / vitrages / porte / garde-corps proposés, escalier ignoré = cité ; taux proches de statico', async () => {
    const { first, sceneModel, run } = await qatar(false);
    expect(first.types.filter((t) => t.status === 'unknown')).toEqual([]);
    expect(sceneModel.modules).toHaveLength(6);
    expect(sceneModel.ignored.map((p) => p.label)).toEqual(['STAIRWAYKIT WITH PLATEFORM#1']);
    expect(sceneModel.warnings.join(' ')).toContain('pièce porteuse ignorée');
    // charges permanentes de statico (§ B 4.1) : G1 100,86 ; G2 30,80 ; G4 35,20 kN
    const G = (id: string) => -run.loads.cases.find((c) => c.id === id)!.resultant[1] / 1e3;
    expect(Math.abs(G('G1') / 100.86 - 1)).toBeLessThan(0.02);
    expect(G('G2')).toBeCloseTo(30.8, 1);
    expect(G('G4')).toBeCloseTo(35.2, 1);
    // ΣRz CO13 : 618,6 kN sur les 12 angles chez statico (+ appuis de l'escalier) ; ici sans escalier
    const R = (run.summary.reactions.CO13 ?? []).reduce((a, r) => a + r.R[1], 0) / 1e3;
    expect(Math.abs(R / 618.6 - 1)).toBeLessThan(0.05);
    // statico : angles η 0,96, poteaux (B107) 0,76, glissement μ requis 0,28 (avec escalier et pression intérieure)
    expect(family(run, /^Angles/).eta).toBeGreaterThan(0.85);
    expect(family(run, /^Angles/).eta).toBeLessThan(1.05);
    expect(family(run, /^Poteau/).eta).toBeGreaterThan(0.6);
    expect(family(run, /^Poteau/).eta).toBeLessThan(0.85);
    expect(run.stability.sliding.muReq).toBeGreaterThan(0.2);
    expect(run.stability.sliding.muReq).toBeLessThan(0.3);
    expect(run.verdict.reasons).toEqual([]);
  }, 600_000);

  it('option « calage statico » : toutes les combinaisons convergent (contacts en effort normal seul, comme SCIA)', async () => {
    const { run } = await qatar(true);
    expect(run.summary.errors).toEqual([]);
    expect(run.stability.overturning.verdict).toBe('ok');
  }, 600_000);
});
