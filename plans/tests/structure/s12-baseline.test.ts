// S12.1 — filet de sécurité avant les types de structure personnalisés : instantané des résultats Viewbox (η de chaque
// contrôle, réactions, stabilité, plancher, calage, pages du rapport) sur le modèle synthétique (toujours) et sur les
// modèles réels Qatar / Xiaomi / test_structurelle quand ils sont présents. Les nombres sont arrondis à 10 chiffres
// significatifs. Premier passage sans instantané : il est écrit ; ensuite il doit être identique.
// S12_BASELINE_UPDATE=1 réécrit les instantanés (seulement pour un changement voulu des résultats Viewbox).
// Instantané du synthétique : tests/structure/baseline/ (versionné, empreintes par rubrique) ; détail complet et
// modèles réels : reference-reports/extract/s12-baseline/ (non versionné).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../../src/core/classification';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { analyzeLoadSet, prepare } from '../../src/structure/core/fem/analysis';
import { sectionMap } from '../../src/structure/core/assemble';
import { computeCalage } from '../../src/structure/core/calage';
import type { CalageResult } from '../../src/structure/core/calage';
import type { EstimateModule } from '../../src/structure/core/estimate';
import { mergeLibrary } from '../../src/structure/core/libraryStore';
import type { Assignments } from '../../src/structure/core/recognition';
import { recognize } from '../../src/structure/core/recognition';
import { SEED } from '../../src/structure/library/seed';
import { viewboxPresetFrame } from '../../src/structure/core/templates/frameModule';
import type { ReportInput } from '../../src/structure/report/build';
import { buildReport } from '../../src/structure/report/build';
import { itemBoxDims } from '../../src/structure/scene/geometry';
import { studyModelFromScene } from '../../src/structure/scene/studyModel';
import type { StudyInputs, StudyRun } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, inputKey, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import type { Hypotheses } from '../../src/ui/structure/GroundPanel';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import { modulesFromScene } from '../../src/ui/structure/StructurePage';
import { buildStudyInputs, carriedWeights, groundExtras } from '../../src/ui/structure/studyInputs';
import { LOADS, vbx } from './studyHelpers';
import { clusterLoads, viewboxCluster } from './syntheticViewbox';

const ROOT = join(__dirname, '..', '..');
const FULL_DIR = join(ROOT, 'reference-reports', 'extract', 's12-baseline');
const HASH_DIR = join(__dirname, 'baseline');
const UPDATE = !!process.env.S12_BASELINE_UPDATE;

/** Copie JSON stable : nombres à 10 chiffres significatifs, -0 → 0, tableaux typés en tableaux, clés triées. */
function canon(v: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return String(v);
    if (v === 0) return 0;
    return Number(v.toPrecision(10));
  }
  if (v === null || typeof v !== 'object') return typeof v === 'function' ? undefined : v;
  if (ArrayBuffer.isView(v)) return canon(Array.from(v as unknown as ArrayLike<number>), seen);
  if (seen.has(v)) return '[réf]';
  seen.add(v);
  let out: unknown;
  if (Array.isArray(v)) out = v.map((x) => canon(x, seen));
  else if (v instanceof Map) out = canon(Object.fromEntries([...v.entries()].map(([k, x]) => [String(k), x])), seen);
  else if (v instanceof Set) out = canon([...v], seen);
  else {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      if (k === 'durationMs') continue;
      const x = canon((v as Record<string, unknown>)[k], seen);
      if (x !== undefined) o[k] = x;
    }
    out = o;
  }
  seen.delete(v);
  return out;
}

const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
const texts = (svg: string) => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);

/** Rubriques comparées d'une étude. */
function digest(inputs: StudyInputs, run: StudyRun, calage: CalageResult | null, report: ReturnType<typeof buildReport> | null): Record<string, unknown> {
  return {
    inputKey: inputKey(inputs),
    nodes: run.structure.fem.nodes.length,
    members: run.structure.fem.members.length,
    supports: run.structure.fem.supports.length,
    warnings: canon(run.warnings),
    structureWarnings: canon(run.structure.warnings),
    loads: canon(run.loads),
    combos: canon(run.combos.map((c) => c.id)),
    states: canon(run.summary.states),
    summaryErrors: canon(run.summary.errors),
    verdict: canon(run.verdict),
    stability: canon(run.stability),
    plywood: canon(run.plywood),
    ground: canon(run.ground),
    facade: canon(run.facade),
    terraces: canon(run.terraces),
    stairFeet: canon(run.stairFeet),
    calage: canon(calage),
    report: report ? { pages: report.pages.length, mainPages: report.mainPages, annexPages: report.annexPages, texts: report.pages.map((p) => texts(p.svg)) } : null,
  };
}

function compare(name: string, d: Record<string, unknown>, versioned: boolean) {
  const hashes = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, sha(v)]));
  const full = join(FULL_DIR, `${name}.json`);
  const hashFile = join(HASH_DIR, `${name}.json`);
  const ref = versioned ? hashFile : full;
  if (UPDATE || !existsSync(ref)) {
    if (existsSync(join(ROOT, 'reference-reports'))) {
      mkdirSync(FULL_DIR, { recursive: true });
      writeFileSync(full, JSON.stringify(d, null, 1));
    }
    if (versioned) {
      mkdirSync(HASH_DIR, { recursive: true });
      writeFileSync(hashFile, JSON.stringify(hashes, null, 1) + '\n');
    }
    return;
  }
  if (versioned) {
    const expected = JSON.parse(readFileSync(hashFile, 'utf8')) as Record<string, string>;
    const changed = Object.keys({ ...expected, ...hashes }).filter((k) => expected[k] !== hashes[k]);
    // détail de l'écart quand l'instantané complet est là
    if (changed.length && existsSync(full)) {
      const before = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
      for (const k of changed) expect.soft(d[k], `${name} › ${k}`).toEqual(before[k]);
    }
    expect(changed, `${name} : rubriques changées`).toEqual([]);
  } else {
    const before = JSON.parse(readFileSync(full, 'utf8')) as Record<string, unknown>;
    for (const k of Object.keys({ ...before, ...d })) expect.soft(d[k], `${name} › ${k}`).toEqual(before[k]);
  }
}

const CALAGE_STOCK = { plates: [], commercial: [] };

function reportInput(inputs: StudyInputs, run: StudyRun, calage: CalageResult | null, hyp: Hypotheses, warnings: string[]): ReportInput {
  return {
    lang: 'fr',
    variant: 'detailed',
    project: { name: 'Instantané S12', number: '26-0000', client: 'Client', address: 'Adresse', installation: '01 / 01 / 2027' },
    author: 'Test',
    date: new Date(2026, 9, 7),
    model: { fileName: 'modele.zip', date: '07.10.2026' },
    version: 'v1.0',
    study: inputs,
    run,
    calage,
    bearing: { value: 200, label: 'Prairie' },
    moduleWeightKg: hyp.moduleWeightKg,
    sceneWarnings: warnings,
  };
}

/** Calage comme l'étape 5 / le rapport : modules de l'estimation + réactions du calcul complet. */
function calageOf(modules: EstimateModule[], inputs: StudyInputs, run: StudyRun, hyp: Hypotheses): CalageResult {
  const carried = carriedWeights(inputs);
  const placed = new Map(inputs.modules.map((pm) => [pm.id, pm]));
  const ground = modules.map((m) => {
    const pm = placed.get(m.id);
    return { ...m, ...(pm ? { height: pm.params.topZ } : {}), carried: (carried.get(m.id) ?? 0) + (pm?.weightDelta ?? 0) };
  });
  return computeCalage({ ...calageInput(ground, hyp, CALAGE_STOCK, inputs.options.jacks, groundExtras(inputs)), reactions: run.ground, jackMax: inputs.options.jackExtension });
}

describe('S12.1 — instantanés Viewbox (non-régression)', () => {
  it('modèle synthétique FEM (grappe 2 × 2 × 2) : déplacements et réactions', () => {
    const c = viewboxCluster(2, 2, 2);
    const prep = prepare(c.model);
    const res = clusterLoads(c, 2).map((s) => {
      const r = analyzeLoadSet(prep, s, { secondOrder: true });
      return { id: r.loadSet, iterations: r.iterations, displacements: r.displacements, reactions: r.reactions, warnings: r.warnings };
    });
    compare('synthetic-fem', { results: canon(res) }, true);
  });

  it('étude synthétique (3 Viewbox, empilement, murs, logo) : calcul, calage, rapport', async () => {
    const inputs: StudyInputs = {
      modules: [vbx('VBX-01', 0, 0), vbx('VBX-02', 0, 2.5), vbx('VBX-03', 0, 0, 1)],
      edgeItems: [
        { module: 'VBX-01', side: 'v0', from: 0, to: 5890, level: 'floor', q: 1.75, loadCase: 'G3', label: 'Vitrage lourd' },
        { module: 'VBX-02', side: 'u0', from: 0, to: 2490, level: 'floor', q: 0.5, loadCase: 'G3', label: 'Mur plein' },
        { module: 'VBX-03', side: 'v1', from: 0, to: 5890, level: 'floor', q: 0.1, loadCase: 'G5', label: 'Garde-corps 2 m' },
      ],
      pointItems: [{ module: 'VBX-03', u: 2950, v: 1250, level: 'roof', F: 400, loadCase: 'G7', label: 'Logo' }],
      library: SEED,
      sections: sectionMap(SEED),
      loads: LOADS,
      middleFeet: false,
      sls: true,
      options: { ...CALC_DEFAULTS, friction: 0.6 },
      blocking: [],
    };
    const run = await runStudy(inputs, createInlineStudyRunner());
    const calage = computeCalage({ ...calageInput([], DEFAULT_HYP, CALAGE_STOCK), reactions: run.ground });
    const report = buildReport(reportInput(inputs, run, calage, DEFAULT_HYP, []));
    compare('synthetic-study', digest(inputs, run, calage, report), true);
  }, 300_000);

  const models: Array<{ name: string; file: string; hyp: Hypotheses; calc?: Partial<typeof CALC_DEFAULTS>; answer: (t: { key: string; kind: string; category?: string | null; assignment?: { nature?: string } | null }) => Assignments[string] | null }> = [
    {
      name: 'qatar',
      file: join(process.env.VEM_MODELS_DIR ?? join(ROOT, '..', 'test-models'), 'Qatar_Airways_2024_VEM_20261001-1529.zip'),
      hyp: { ...DEFAULT_HYP, liveGround: 3.5, windIn: 0.41, windOut: 0.41 },
      answer: (t) => (t.assignment?.nature === 'stair' ? { scope: 'model', at: '', assignment: { role: 'ignored', nature: 'decor' } } : null),
    },
    { name: 'xiaomi', file: join(ROOT, 'reference-reports', 'Xiaomi_Paris_2026_VEM_20260929-0951.zip'), hyp: DEFAULT_HYP, answer: () => null },
    {
      name: 'test-structurelle',
      file: join(ROOT, 'reference-reports', 'test_structurelle_VEM_20261001-1554.zip'),
      hyp: DEFAULT_HYP,
      answer: (t) => (t.kind === 'item' && t.category === 'STRUCTURE' ? { scope: 'model', at: '', assignment: { role: 'ignored', nature: 'other' } } : null),
    },
  ];

  for (const m of models)
    it.skipIf(!existsSync(m.file))(`modèle réel ${m.name} : reconnaissance, calcul, calage, rapport`, async () => {
      const buf = readFileSync(m.file);
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const res = await ingest({ fileName: `${m.name}.zip`, data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
      const pkg = await loadPackage(await exportPackage(res.root));
      const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
      const library = mergeLibrary(SEED, []);
      const dims = itemBoxDims(scene, scene.index.nodes.filter((n) => n.role === 'item').map((n) => n.id));
      const accessoryCategories = compileRules(DEFAULT_RULES).accessoryKeys;
      const first = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments: {}, accessoryCategories });
      const assignments: Assignments = {};
      for (const t of first.types) {
        const a = m.answer(t);
        if (a) assignments[t.key] = a;
      }
      const recognition = recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments, accessoryCategories });
      const sceneModel = studyModelFromScene(scene, recognition, library);
      const { inputs } = buildStudyInputs({ sceneModel, library, hyp: m.hyp, roof: false, calc: { ...CALC_DEFAULTS, ...m.calc } });
      const run = await runStudy(inputs, createInlineStudyRunner());
      const { modules, warnings } = modulesFromScene(scene, false);
      const calage = calageOf(modules, inputs, run, m.hyp);
      const report = buildReport(reportInput(inputs, run, calage, m.hyp, [...warnings, ...sceneModel.warnings]));
      const d = {
        recognition: canon(recognition.types.map((t) => ({ key: t.key, kind: t.kind, status: t.status, assignment: t.assignment }))),
        templateParts: recognition.templateParts.size,
        ...digest(inputs, run, calage, report),
      };
      compare(m.name, d, false);
      // S12.2 : la même étude avec la Viewbox décrite en barres (gabarit générique) donne les mêmes η et réactions
      if (m.name === 'qatar') {
        const frameInputs = { ...inputs, modules: inputs.modules.map((pm) => ({ ...pm, params: { ...pm.params, frame: viewboxPresetFrame(pm.params) } })) };
        const fr = await runStudy(frameInputs, createInlineStudyRunner());
        expect(fr.index.items.map((i) => i.id)).toEqual(run.index.items.map((i) => i.id));
        run.summary.states.forEach((s, k) => {
          const t = fr.summary.states[k];
          if (s && t) expect(Math.abs(t.eta - s.eta)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(s.eta)));
          else expect(!!t).toBe(!!s);
        });
        for (const [combo, rs] of Object.entries(run.summary.reactions))
          rs.forEach((r, k) => r.R.forEach((x, dd) => expect(Math.abs(fr.summary.reactions[combo][k].R[dd] - x)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(x)))));
      }
    }, 900_000);
});
