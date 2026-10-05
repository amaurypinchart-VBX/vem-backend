// Calage S8 sur le vrai modèle SketchUp du projet statico 24-0569 « Viewbox – Qatar » (export viewbox_prep déposé dans
// test-models/, non versionné, ou VEM_MODELS_DIR) : reconnaissance → modèle de l'étude → calcul complet, avec les
// hypothèses de la note statico (murs 0,50 / vitrages 1,75 / garde-corps 0,10 kN/m, vent 0,41 kN/m² en et hors service,
// appuis aux angles sans vérins), escalier ignoré puis calculé (kit escalier + palier, gabarit relevé sur le modèle SCIA).
// Écarts connus avec la note : pression intérieure non appliquée à l'ensemble, position des murs seulement sur les plans
// statico, et un boulon B / C de plus en y = 2,71 m (perçages alignés) qui soulage la rive de la Viewbox perpendiculaire.
// Ignoré sans le fichier.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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

async function qatar(calibration: boolean, stair: 'ignored' | 'computed' = 'ignored', stairClad = false) {
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
  if (stair === 'ignored') for (const t of first.types) if (t.assignment?.nature === 'stair') assignments[t.key] = { scope: 'model', at: '', assignment: { role: 'ignored', nature: 'decor' } };
  const recognition = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments, accessoryCategories });
  const sceneModel = studyModelFromScene(scene, recognition, library);
  const hyp = { ...DEFAULT_HYP, windIn: 0.41, windOut: 0.41 };
  const { inputs } = buildStudyInputs({ sceneModel, library, hyp, roof: false, calc: { ...CALC_DEFAULTS, calibration, stairClad } });
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

  it('escalier calculé : charges, efforts des montants, des attaches et des pieds proches de statico 24-0569 § 3.2 / 3.10.3', async () => {
    const { sceneModel, run } = await qatar(false, 'computed');
    expect(sceneModel.stairs).toHaveLength(1);
    expect(sceneModel.stairs[0]).toMatchObject({ module: 'VBX-06', level: 'floor' });
    expect(run.summary.errors).toEqual([]);
    const R = (id: string) => run.loads.cases.find((c) => c.id === id)!.resultant;
    // exploitation totale avec escalier et palier : 337,84 kN chez statico ; marches G6 3,58 kN
    expect(Math.abs(-R('Q1.1')[1] / 1e3 / 337.84 - 1)).toBeLessThan(0.02);
    expect(Math.abs(-R('G6')[1] / 1e3 / 3.58 - 1)).toBeLessThan(0.15);
    // ΣRz CO13 sur les 12 angles des Viewbox (statico 618,6 kN, l'escalier porte le reste)
    const vbx = run.structure.supportMeta.map((m, k) => (m.kind === 'stair' ? -1 : k)).filter((k) => k >= 0);
    const co13 = run.summary.reactions.CO13!;
    expect(Math.abs(vbx.reduce((a, k) => a + co13[k].R[1], 0) / 1e3 / 618.6 - 1)).toBeLessThan(0.05);
    const state = (re: RegExp) => run.index.items.map((it, t) => ({ it, st: run.summary.states[t]! })).filter(({ it }) => re.test(it.label));
    // montants intermédiaires : NEd 11,71 kN chez statico ; pieds d'escalier Rz,Ed 11,71 kN (§ 3.10.3)
    const mid = state(/pied de montant intermédiaire/).map(({ st }) => Number(/N = ([\d,]+) kN/.exec(st.records.map((r) => r.withValues).join(' '))?.[1].replace(',', '.')));
    expect(Math.max(...mid)).toBeGreaterThan(9.5);
    expect(Math.max(...mid)).toBeLessThan(13.5);
    const stairGroups = run.ground.reactions.filter((r) => r.group.stair);
    expect(stairGroups).toHaveLength(8);
    expect(Math.max(...stairGroups.map((r) => r.REd)) / 1e3).toBeGreaterThan(9.5);
    expect(Math.max(...stairGroups.map((r) => r.REd)) / 1e3).toBeLessThan(13.5);
    // accroches (Vz,Ed 1,62 ≤ 5,88 kN), attaches du palier (FEd 7,75 ≤ 10,9 kN), limons (EC3 0,93)
    for (const { st } of state(/accroche du limon/)) expect(st.eta).toBeLessThan(0.5);
    for (const { st } of state(/attache du palier/)) expect(st.eta).toBeLessThan(1);
    const stringer = run.verdict.families.find((f) => /^Limon/.test(f.family))!;
    expect(stringer.eta).toBeGreaterThan(0.6);
    expect(stringer.eta).toBeLessThan(1.05);
  }, 600_000);

  it('escalier habillé : vent sur l’habillage, lest des pieds du même ordre que statico (250 kg par pied d’escalier)', async () => {
    const open = (await qatar(false, 'computed')).run;
    const clad = (await qatar(false, 'computed', true)).run;
    const kg = (r: typeof open) => Math.max(...r.stairFeet.map((f) => f.need / 9.81));
    writeFileSync(join(dir, 'qatar-stair-feet.txt'), [...open.stairFeet, ...clad.stairFeet].map((f) => `${f.label} Rz ${(f.Rz / 1e3).toFixed(2)} Rh ${(f.Rh / 1e3).toFixed(2)} lest ${(f.need / 9.81).toFixed(0)} kg ${f.combo}${f.lifted ? ' soulevé' : ''}`).join('\n'));
    expect(open.stairFeet).toHaveLength(8);
    expect(clad.stairFeet.some((f) => f.lifted)).toBe(false);
    expect(kg(clad)).toBeGreaterThan(kg(open));
    expect(kg(clad)).toBeGreaterThan(50);
    expect(kg(clad)).toBeLessThan(600);
  }, 600_000);

  it('option « calage statico » : toutes les combinaisons convergent (contacts en effort normal seul, comme SCIA)', async () => {
    const { run } = await qatar(true);
    expect(run.summary.errors).toEqual([]);
    expect(run.stability.overturning.verdict).toBe('ok');
  }, 600_000);
});
