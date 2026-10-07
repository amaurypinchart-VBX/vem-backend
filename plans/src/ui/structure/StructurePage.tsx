// Onglet « Étude structure » : 6 étapes (Reconnaissance · Site & hypothèses · Calcul · Résultats · Sol & calage ·
// Rapport) et le conseil ingénieur (IA + pistes du diagnostic + variantes). L'étude (une par version de modèle) garde les réponses de la reconnaissance et les hypothèses ; elle est
// enregistrée 2 s après la dernière modification. La bibliothèque partagée = base de départ + entrées en ligne.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import { moduleFootprint } from '../../core/installUnits';
import { compileRules } from '../../core/classification';
import type { ClassificationRules } from '../../core/types';
import type { EstimateModule } from '../../structure/core/estimate';
import type { PartAssignment } from '../../structure/core/library';
import type { Assignments, PartType } from '../../structure/core/recognition';
import { recognize } from '../../structure/core/recognition';
import type { ServerLibraryRow } from '../../structure/core/libraryStore';
import { mergeLibrary, partTypeEntry, toPayload } from '../../structure/core/libraryStore';
import { SEED, SEED_MODULES } from '../../structure/library/seed';
const SEED_VIEWBOX = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
import { sectionMap } from '../../structure/core/assemble';
import { itemBoxDims } from '../../structure/scene/geometry';
import { studyModelFromScene } from '../../structure/scene/studyModel';
import type { CalcOptions, StudyInputs, StudyRun } from '../../structure/studyRun';
import { CALC_DEFAULTS, inputKey, runStudy } from '../../structure/studyRun';
import type { LibraryEntry } from '../../structure/core/library';
import { estimateTypeFields, isCustomType, moduleTypes } from '../../structure/core/moduleTypes';
import type { FrameExtraction } from '../../structure/core/frameExtract';
import { extractFrame, structureCheck } from '../../structure/core/frameExtract';
import { moduleStructureMesh } from '../../structure/scene/frameFromScene';
import { moduleTypeKey } from '../../structure/core/signature';
import { DEFAULTS } from '../../structure/library/defaults';
import { connectionSet, jackSpec } from '../../structure/core/checks/joints';
import type { StudyRunner } from '../../structure/worker/study';
import { createInlineStudyRunner, createStudyWorkerPool } from '../../structure/worker/study';
import { CalcPanel, ResultsPanel } from './CalcResults';
import { CapacityCard } from './CapacityCard';
import type { LiveCapacity } from '../../structure/capacity';
import { liveCapacity } from '../../structure/capacity';
import { computeCalage } from '../../structure/core/calage';
import { ReportPanel } from './ReportPanel';
import { useAiStatus } from './aiUi';
import type { CompositePanel } from '../../structure/core/composite';
import { panelEntry } from '../../structure/core/composite';
import { studyFacts } from '../../structure/report/facts';
import { bearingFrom } from '../../structure/core/ground';
import type { BrowserHlrProvider } from '../../linework/provider';
import type { StudyMods } from '../../structure/core/mods';
import { describeMods, placedToEstimate } from '../../structure/core/mods';
import type { SectionEntry } from '../../structure/core/library';
import { buildStudyInputs, carriedWeights, groundExtras, studyBase } from './studyInputs';
import { SupportsCard } from './SupportsCard';
import { designation } from '../../structure/core/library';
import { addedSupportEtas, sizeAddedSupports, supportKey } from '../../structure/advisor/supports';
import { assembleStudy } from '../../structure/studyRun';
import { AdvisorPanel } from './AdvisorPanel';
import { VariantsPanel } from './VariantsPanel';
import { AccessoriesPanel } from './AccessoriesPanel';
import type { JointDesign } from '../../structure/core/jointDesign';
import type { AdvisorMessage } from '../../api/vem';
import type { Variant } from './advisorTools';
import { variantSource } from './advisorTools';
import type { StructureStock } from './GroundPanel';
import type { ModelVersion, StudyRecord, VemUser } from '../../api/vem';
import { PROJECT_ID, STRUCTURE_STOCK_KEY, vem } from '../../api/vem';
import type { Hypotheses } from './GroundPanel';
import { DEFAULT_HYP, GroundPanel, HypothesesForm, calageInput } from './GroundPanel';
import type { AnswerOptions } from './RecognitionStep';
import { RecognitionStep } from './RecognitionStep';

/** Viewbox du modèle → modules de l'estimation (emprise en plan, niveau, surface). */
export function modulesFromScene(scene: LoadedScene, roofAccessible: boolean, library: readonly LibraryEntry[] = []): { modules: EstimateModule[]; warnings: string[] } {
  const warnings: string[] = [];
  // longueur d'un type de structure personnalisé de la bibliothèque : ses données sont connues (S12)
  const customSize = (long: number) => library.some((e) => e.kind === 'module_type' && isCustomType(e) && Math.abs(e.nominal.long - long) <= 50);
  const idx = scene.index;
  const modules: EstimateModule[] = [];
  for (const m of idx.modules) {
    const fp = moduleFootprint(idx, m.id, scene.frames);
    if (!fp) continue;
    modules.push({ id: m.id, level: m.level, corners: fp, area: m.planDimsMm[0] * m.planDimsMm[1], height: 3080, roofAccessible: false });
    if (Math.abs(m.expected.long - 5900) > 50 && !customSize(m.expected.long)) warnings.push(`${m.id} (${m.expected.label}) : données de structure inconnues, poids pris au prorata de la surface.`);
  }
  // toitures accessibles : Viewbox sans rien au-dessus
  if (roofAccessible)
    for (const m of modules) {
      const above = modules.some((o) => o.level === m.level + 1 && o.corners.some((c) => m.corners.some((d) => Math.hypot(c[0] - d[0], c[1] - d[1]) < 200)));
      m.roofAccessible = !above;
    }
  return { modules, warnings };
}

type Step = 'recognition' | 'site' | 'calc' | 'results' | 'ground' | 'report' | 'variants' | 'accessories' | 'advisor';
type StepState = 'ok' | 'warn' | 'bad' | 'todo';
const STEP_ICON: Record<StepState, string> = { ok: '✔', warn: '⚠', bad: '✖', todo: '·' };
const STEP_COLOR: Record<StepState, string> = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', todo: 'var(--text-dim)' };
const LIBRARY_EDITORS = ['admin', 'technical_manager', 'engineer'];

interface StudySettings {
  hyp?: Partial<Hypotheses>;
  roofAccessible?: boolean;
  fileName?: string;
  calc?: Partial<CalcOptions>;
  /** modifications de l'étude hors modèle SketchUp (conseil ingénieur) */
  mods?: StudyMods;
}

interface Props {
  scene: LoadedScene;
  model?: ModelVersion;
  glassTest: GlassTest;
  rules: ClassificationRules;
  framesVersion: number;
  active: boolean;
  /** moteur 2D (plan de calage du rapport) */
  provider?: BrowserHlrProvider | null;
}

export function StructurePage({ scene, model, glassTest, rules, framesVersion, active, provider = null }: Props) {
  const [step, setStep] = useState<Step>('recognition');
  const [me, setMe] = useState<VemUser | null>(null);
  const [rows, setRows] = useState<ServerLibraryRow[]>([]);
  const [study, setStudy] = useState<StudyRecord | null>(null);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [hyp, setHyp] = useState<Hypotheses>(DEFAULT_HYP);
  const [roof, setRoof] = useState(false);
  const [calcOpts, setCalcOpts] = useState<CalcOptions>(CALC_DEFAULTS);
  const [mods, setMods] = useState<StudyMods>({});
  // conversation du conseil ingénieur et variantes (partagées avec l'onglet Variantes), enregistrées avec l'étude
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const threadLoaded = useRef(false);
  // variante demandée depuis un autre onglet (accessoire calculé dans l'étude) : calculée par l'onglet Variantes
  const [variantRequest, setVariantRequest] = useState<{ id: number; title: string; changes: import('../../structure/advisor/diagnose').VariantChanges } | null>(null);
  const [stock, setStock] = useState<StructureStock>({ plates: [], commercial: [] });
  const [run, setRun] = useState<{ result: StudyRun; key: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [calcError, setCalcError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const runnerRef = useRef<StudyRunner | null>(null);
  // charge d'exploitation maximale : cherchée après chaque calcul (calculs complets successifs)
  const capAbortRef = useRef<AbortController | null>(null);
  const [capProgress, setCapProgress] = useState<{ done: number; total: number } | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'local'>('idle');
  const [error, setError] = useState('');
  const loaded = useRef(false);
  const ai = useAiStatus();

  const refreshLibrary = useCallback(async () => {
    try {
      setRows(await vem.structureLibrary());
    } catch (e) {
      setError(`Bibliothèque en ligne indisponible (${(e as Error).message}) : base de départ seulement.`);
    }
  }, []);

  // ─── chargement : utilisateur, bibliothèque, étude de ce modèle (créée au besoin, réponses du projet reprises) ───
  useEffect(() => {
    vem.me().then(setMe).catch(() => {});
    vem
      .getSetting<StructureStock>(STRUCTURE_STOCK_KEY)
      .then((v) => v && setStock({ plates: v.plates ?? [], commercial: v.commercial ?? [] }))
      .catch(() => {});
    void refreshLibrary();
    if (!PROJECT_ID || !model) {
      setSaveState('local');
      loaded.current = true;
      return;
    }
    (async () => {
      try {
        const list = await vem.listStudies(PROJECT_ID);
        let s = list.find((x) => x.modelVersionId === model.id) ?? null;
        if (!s) {
          const prev = list[0];
          const prevSettings = (prev?.settings ?? {}) as StudySettings;
          const carried: Assignments = {};
          for (const [k, v] of Object.entries((prev?.assignments ?? {}) as Assignments))
            if (v.scope === 'project' || prevSettings.fileName === model.fileName) carried[k] = v;
          s = await vem.createStudy(PROJECT_ID, {
            modelVersionId: model.id,
            name: `Étude structure — ${model.fileName}`,
            assignments: carried,
            settings: { hyp: prevSettings.hyp ?? {}, roofAccessible: prevSettings.roofAccessible ?? false, fileName: model.fileName },
          });
        }
        const st = (s.settings ?? {}) as StudySettings;
        setStudy(s);
        setAssignments((s.assignments ?? {}) as Assignments);
        setHyp({ ...DEFAULT_HYP, ...(st.hyp ?? {}) });
        setRoof(!!st.roofAccessible);
        setCalcOpts({ ...CALC_DEFAULTS, ...(st.calc ?? {}) });
        setMods(st.mods ?? {});
        setSaveState('saved');
      } catch (e) {
        setError(`Étude non chargée (${(e as Error).message}) : les réponses ne seront pas enregistrées.`);
        setSaveState('local');
      }
      loaded.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  const library = useMemo(() => mergeLibrary(SEED, rows), [rows]);
  const canEditLibrary = LIBRARY_EDITORS.includes(me?.role ?? '');
  const accessory = useMemo(() => compileRules(rules).accessoryKeys, [rules]);
  const dims = useMemo(() => itemBoxDims(scene, scene.index.nodes.filter((n) => n.role === 'item').map((n) => n.id)), [scene]);
  // structure dessinée de chaque type de module (S12.5) : relevée sur la première box du type, une fois par scène
  const drawnStructures = useMemo(() => {
    const out = new Map<string, FrameExtraction>();
    const first = new Map<string, string>();
    for (const m of scene.index.modules) if (!first.has(moduleTypeKey(m))) first.set(moduleTypeKey(m), m.id);
    for (const [key, id] of first) {
      try {
        const mesh = moduleStructureMesh(scene, id);
        if (mesh?.members.length) out.set(key, extractFrame(mesh.members, { ...mesh.dims, base: SEED_VIEWBOX.params!, file: scene.index.source.fileName, date: new Date().toLocaleDateString('fr-BE') }));
      } catch {
        // relevé impossible : comportement d'avant S12 (taille seule)
      }
    }
    return out;
  }, [scene]);
  const structures = useMemo(() => {
    const sections = sectionMap(library);
    const out: Record<string, ReturnType<typeof structureCheck>> = {};
    for (const [key, ex] of drawnStructures) {
      const lib = [...library, ...ex.newSections.filter((x) => !library.some((e) => e.key === x.key))];
      out[key] = structureCheck(ex, lib, ex.newSections.length ? sectionMap(lib) : sections);
    }
    return out;
  }, [drawnStructures, library]);
  const recognition = useMemo(
    () => recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments, accessoryCategories: accessory, structures }),
    [scene, dims, library, assignments, accessory, structures],
  );
  // framesVersion : les repères des Viewbox ont été recalculés (face avant modifiée)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // le toit d'une Viewbox ne reçoit jamais de public (seuls les éléments terrasse du modèle en portent)
  const { modules, warnings } = useMemo(() => modulesFromScene(scene, false, library), [scene, framesVersion, library]);

  // ─── calcul complet ───
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sceneModel = useMemo(() => studyModelFromScene(scene, recognition, library), [scene, recognition, library, framesVersion]);
  const inputsSource = useMemo(() => ({ sceneModel, library, hyp, roof, calc: calcOpts, mods }), [sceneModel, library, hyp, roof, calcOpts, mods]);
  const built = useMemo(() => buildStudyInputs(inputsSource), [inputsSource]);
  const studyInputs = built.inputs;
  // assemblage seul (sans calcul) : angles de Viewbox posés dans le vide et appui proposé pour chacun
  const precheck = useMemo(() => {
    try {
      return assembleStudy(studyInputs);
    } catch {
      return null;
    }
  }, [studyInputs]);
  const [sizing, setSizing] = useState<{ running: boolean; steps: string[] } | null>(null);
  // Viewbox ajoutées par l'étude : aussi dans le calage
  // Viewbox portant un élément terrasse sur leur toiture : son poids et son public descendent par elles
  // murs, vitrages, garde-corps, logos, lest du modèle et de l'étude : portés par leur Viewbox (estimation instantanée)
  const carriedBy = useMemo(() => carriedWeights(studyInputs), [studyInputs]);
  const groundModules = useMemo(() => {
    const roofT = new Set(sceneModel.terraces.filter((t) => t.kind === 'roof').map((t) => t.module));
    // Viewbox modifiées par l'étude : hauteur des poteaux et écart de poids des barres
    const placed = new Map(studyInputs.modules.map((pm) => [pm.id, pm]));
    // types de structure personnalisés (S12) : poids, acier, sol et surface d'appui de leur type
    const types = moduleTypes(studyInputs.modules, studyInputs.library, studyInputs.sections, { viewboxKg: hyp.moduleWeightKg, weights: hyp.moduleWeights });
    return [...modules, ...built.added.map(placedToEstimate)].map((m) => {
      const pm = placed.get(m.id);
      const own = pm ? estimateTypeFields(pm, types, DEFAULTS.ceiling.value, DEFAULTS.floorFinish.value) : {};
      // poids calculé d'un type sans pesée : déjà avec ses barres modifiées
      const delta = own.weightMode === 'computed' ? 0 : (pm?.weightDelta ?? 0);
      return { ...m, ...(pm ? { height: pm.params.topZ } : {}), ...own, carried: (carriedBy.get(m.id) ?? 0) + delta, ...(roofT.has(m.id) ? { terrace: true } : {}) };
    });
  }, [modules, built.added, sceneModel.terraces, carriedBy, studyInputs.modules, studyInputs.library, studyInputs.sections, hyp.moduleWeightKg, hyp.moduleWeights]);
  // types de structure personnalisés de l'étude : poids calculé (barres + plafond + sol) pour l'étape 2
  const customTypeRows = useMemo(() => {
    const types = moduleTypes(studyInputs.modules, studyInputs.library, studyInputs.sections, { viewboxKg: hyp.moduleWeightKg, weights: {} });
    return [...types.values()]
      .filter((t) => t.family === 'other')
      .map((t) => {
        const pm = studyInputs.modules.find((m) => m.templateKey === t.key)!;
        const area = (pm.params.x1 - pm.params.x0) * (pm.params.y1 - pm.params.y0);
        return { key: t.key, name: t.name, count: t.modules.length, computedKg: (t.steel + (DEFAULTS.ceiling.value + Math.max(DEFAULTS.floorFinish.value, t.deck)) * area) / 9.81 };
      });
  }, [studyInputs.modules, studyInputs.library, studyInputs.sections, hyp.moduleWeightKg]);
  const carriedTotal = useMemo(() => {
    const N = [...carriedWeights(sceneModel).values()].reduce((a, b) => a + b, 0);
    return { count: sceneModel.edgeItems.length + sceneModel.pointItems.length, kg: N / 9.81 };
  }, [sceneModel]);
  // pieds des éléments terrasse posés au sol : appuis du calage en plus de ceux des Viewbox
  const extraSupports = useMemo(() => groundExtras(studyInputs), [studyInputs]);
  const currentKey = useMemo(() => inputKey(studyInputs), [studyInputs]);
  const stale = !!run && run.key !== currentKey;
  useEffect(() => () => {
    abortRef.current?.abort();
    capAbortRef.current?.abort();
    runnerRef.current?.dispose();
  }, []);
  const searchCapacity = async (inputs: StudyInputs, result: StudyRun) => {
    capAbortRef.current?.abort();
    const ctrl = new AbortController();
    capAbortRef.current = ctrl;
    setCapProgress({ done: 0, total: 0 });
    // sol : calage (plaques choisies, sinon standard) refait avec les réactions de chaque calcul ; public limité en
    // personnes ou portance absente : sol non compté
    const withGround = bearingFrom(hyp.bearingValue, hyp.bearingUnit) > 0 && hyp.publicMode !== 'persons';
    const groundEta = (r: StudyRun, inp: StudyInputs) => {
      const res = computeCalage({ ...calageInput(groundModules, hyp, stock, calcOpts.jacks, groundExtras(inp)), reactions: r.ground, noAdvice: true });
      return res.checks.length ? Math.max(...res.checks.map((c) => c.eta)) : null;
    };
    let capacity: LiveCapacity;
    try {
      runnerRef.current ??= typeof Worker !== 'undefined' ? createStudyWorkerPool() : createInlineStudyRunner();
      capacity = await liveCapacity(inputs, result, runnerRef.current, { ...(withGround ? { groundEta } : {}), onProgress: (done, total) => setCapProgress({ done, total }), signal: ctrl.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      capacity = { levels: [], notes: [`Charge maximale non calculée : ${(e as Error).message}`] };
    } finally {
      if (capAbortRef.current === ctrl) setCapProgress(null);
    }
    setRun((r) => (r && r.result === result ? { ...r, result: { ...result, capacity } } : r));
  };
  const startRun = async (): Promise<StudyRun | null> => {
    abortRef.current?.abort();
    capAbortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    runnerRef.current ??= typeof Worker !== 'undefined' ? createStudyWorkerPool() : createInlineStudyRunner();
    setRunning(true);
    setCalcError('');
    setProgress({ done: 0, total: 0 });
    const key = currentKey;
    try {
      const result = await runStudy(studyInputs, runnerRef.current, (done, total) => setProgress({ done, total }), ctrl.signal);
      setRun({ result, key });
      void searchCapacity(studyInputs, result);
      return result;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setCalcError((e as Error).message);
      return null;
    } finally {
      if (abortRef.current === ctrl) setRunning(false);
    }
  };
  // appuis proposés sous les angles dans le vide : ajoutés aux modifications de l'étude puis dimensionnés par le calcul
  const addSupports = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    runnerRef.current ??= typeof Worker !== 'undefined' ? createStudyWorkerPool() : createInlineStudyRunner();
    const steps: string[] = [];
    setSizing({ running: true, steps });
    try {
      const { base, mods: all } = studyBase(inputsSource);
      const r = await sizeAddedSupports(base, all ?? {}, runnerRef.current, { signal: ctrl.signal, onStep: (t) => {
          steps.push(t);
          setSizing({ running: true, steps: [...steps] });
        },
      });
      setSizing({ running: false, steps: [...r.steps, 'Appuis ajoutés aux modifications de l’étude : lancer le calcul complet pour le verdict.'] });
      setMods((m) => ({ ...m, supports: r.supports }));
    } catch (e) {
      setSizing({ running: false, steps: [...steps, (e as Error).name === 'AbortError' ? 'Annulé.' : `Erreur : ${(e as Error).message}`] });
    }
  };
  // conseil ingénieur : calcul de l'étude actuelle (celui affiché s'il est à jour)
  const runRef = useRef(run);
  runRef.current = run;
  const keyRef = useRef(currentKey);
  keyRef.current = currentKey;
  const ensureRun = async (): Promise<StudyRun> => {
    const r = runRef.current;
    if (r && r.key === keyRef.current) return r.result;
    const res = await startRun();
    if (!res) throw new Error(calcError || 'Calcul de l’étude impossible (voir l’étape 3. Calcul).');
    return res;
  };
  const sectionName = (key: string) => {
    const e = studyInputs.sections.get(key) as SectionEntry | undefined;
    return e?.section.name ?? key;
  };
  const applyVariant = (v: Variant) => {
    const next = variantSource(inputsSource, v.changes);
    setHyp(next.hyp);
    setRoof(next.roof);
    setCalcOpts(next.calc);
    setMods(next.mods ?? {});
    // variante calculée sur l'étude actuelle : son calcul devient celui de l'étude
    if (v.run && v.baseKey === currentKey) {
      const inputs = buildStudyInputs(next).inputs;
      setRun({ result: v.run, key: inputKey(inputs) });
      void searchCapacity(inputs, v.run);
    }
  };
  const cancelRun = () => {
    abortRef.current?.abort();
    capAbortRef.current?.abort();
    setRunning(false);
  };

  // ─── enregistrement automatique (2 s après la dernière modification) ───
  const summary = useMemo(
    () => ({
      recognition: recognition.counts,
      ...(run
        ? {
            calc: {
              at: new Date().toISOString(),
              stale,
              verdict: run.result.verdict.verdict,
              reasons: run.result.verdict.reasons.slice(0, 5),
              families: run.result.verdict.families.map((f) => ({ family: f.family, count: f.count, eta: Number.isFinite(f.eta) ? Math.round(f.eta * 1000) / 1000 : null, verdict: f.verdict })),
              top: run.result.verdict.ranking.slice(0, 20).map((t) => ({ label: run.result.index.items[t].label, eta: run.result.summary.states[t]?.eta ?? null, combo: run.result.summary.states[t]?.combo })),
              ...(run.result.capacity
                ? {
                    maxLive: run.result.capacity.levels.map((l) => ({ level: l.target, studyKgm2: Math.round((l.q0 * 1e6) / 9.81), maxKgm2: Math.round((l.qMax * 1e6) / 9.81), above: l.above, governing: l.governing })),
                  }
                : {}),
            },
          }
        : {}),
    }),
    [recognition.counts, run, stale],
  );
  useEffect(() => {
    if (!loaded.current || !study) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await vem.saveStudy(study.id, {
          assignments: assignments as unknown as Record<string, unknown>,
          settings: { hyp, roofAccessible: roof, fileName: model?.fileName, calc: calcOpts, mods },
          resultsSummary: summary,
        });
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        setError(`Étude non enregistrée : ${(e as Error).message}`);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [assignments, hyp, roof, study, summary, model?.fileName, calcOpts, mods]);

  useEffect(() => {
    threadLoaded.current = false;
    if (!study?.id) return;
    vem
      .advisorThread(study.id)
      .then((t) => {
        setMessages(t.messages ?? []);
        setVariants(((t.variants ?? []) as Variant[]).map((v) => ({ ...v, run: undefined })));
      })
      .catch(() => {})
      .finally(() => (threadLoaded.current = true));
  }, [study?.id]);
  useEffect(() => {
    if (!threadLoaded.current || !study?.id) return;
    const t = setTimeout(() => {
      void vem.saveAdvisorThread(study.id, { messages, variants: variants.map(({ run: _run, ...v }) => v) }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [messages, variants, study?.id]);

  // la réponse est toujours gardée dans l'étude (un objet sans nom n'est reconnu ailleurs que « probablement », par
  // son empreinte) ; mémorisée, elle sert aussi aux autres modèles et projets
  const keep = (list: Array<{ t: PartType; a: PartAssignment }>, scope: 'model' | 'project') =>
    setAssignments((x) => {
      const next = { ...x };
      for (const { t, a } of list) next[t.key] = { assignment: a, scope, at: new Date().toISOString(), by: me?.id };
      return next;
    });

  const answer = async (t: PartType, a: PartAssignment, opts: AnswerOptions) => {
    if (opts.memorize) {
      await vem.saveLibraryEntry(toPayload(partTypeEntry(t, a, t.label)));
      await refreshLibrary();
    }
    keep([{ t, a }], opts.scope);
  };

  const confirmSuggested = async () => {
    const list = recognition.types.filter((t) => t.status === 'suggested' && t.assignment).map((t) => ({ t, a: t.assignment! }));
    if (canEditLibrary) {
      for (const { t, a } of list) await vem.saveLibraryEntry(toPayload(partTypeEntry(t, a, t.label)));
      await refreshLibrary();
    }
    keep(list, 'model');
  };

  const stepState: Record<Step, StepState> = {
    recognition: recognition.counts.unknown ? 'bad' : recognition.counts.suggested ? 'warn' : 'ok',
    site: hyp.bearingValue > 0 ? 'ok' : 'bad',
    calc: running ? 'warn' : run ? (stale ? 'warn' : 'ok') : sceneModel.errors.length ? 'bad' : 'todo',
    results: run ? (run.result.verdict.verdict === 'ok' ? 'ok' : run.result.verdict.verdict === 'limit' ? 'warn' : 'bad') : 'todo',
    ground: modules.length ? 'warn' : 'todo',
    report: run && !stale ? 'ok' : 'todo',
    advisor: run && !stale ? (run.result.verdict.verdict === 'ok' ? 'ok' : 'warn') : 'todo',
    variants: variants.length ? 'ok' : 'todo',
    accessories: library.some((e) => e.kind === 'joint_design') ? 'ok' : 'todo',
  };
  const STEPS: Array<{ key: Step; label: string; soon?: string }> = [
    { key: 'recognition', label: '1. Reconnaissance' },
    { key: 'site', label: '2. Site & hypothèses' },
    { key: 'calc', label: '3. Calcul' },
    { key: 'results', label: '4. Résultats' },
    { key: 'ground', label: '5. Sol & calage' },
    { key: 'report', label: '6. Rapport' },
    { key: 'variants', label: '🧪 Variantes' },
    { key: 'accessories', label: '🔩 Accessoires' },
    { key: 'advisor', label: '💬 Conseil ingénieur' },
  ];
  const saveLabel = { idle: '', saving: 'Enregistrement…', saved: '✓ Étude enregistrée', error: '✗ Non enregistrée', local: 'Étude non enregistrée (modèle sans version en ligne)' }[saveState];

  return (
    <div className="page">
      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap' }}>
          <h2>Étude structure</h2>
          <span className="badge orange">pré-étude interne</span>
          <nav className="tabs" style={{ flexWrap: 'wrap' }}>
            {STEPS.map((s) => (
              <button key={s.key} className={`tab ${step === s.key ? 'active' : ''}`} onClick={() => setStep(s.key)} title={s.soon ? `Arrive en phase ${s.soon}` : undefined}>
                <span style={{ color: STEP_COLOR[stepState[s.key]], marginRight: 4 }}>{STEP_ICON[stepState[s.key]]}</span>
                {s.label}
              </button>
            ))}
          </nav>
          <div className="spacer" style={{ flex: 1 }} />
          <span className="hint">{saveLabel}</span>
        </div>
        {error && (
          <div className="card-body">
            <div className="error-box">
              {error}{' '}
              <button className="btn small" onClick={() => setError('')}>
                OK
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: step === 'recognition' ? 'block' : 'none' }}>
        <RecognitionStep
          scene={scene}
          glassTest={glassTest}
          active={active && step === 'recognition'}
          recognition={recognition}
          library={library}
          canEditLibrary={canEditLibrary}
          onAnswer={answer}
          onConfirmSuggested={confirmSuggested}
          ai={ai}
          studyId={study?.id ?? null}
          onSavePanel={async (p: CompositePanel) => {
            await vem.saveLibraryEntry(toPayload(panelEntry(p)));
            await refreshLibrary();
          }}
          who={[me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'utilisateur'}
          drawnStructures={drawnStructures}
          onSaveEntries={async (entries) => {
            for (const e of entries) await vem.saveLibraryEntry(toPayload(e));
            await refreshLibrary();
          }}
        />
      </div>
      {step === 'site' && (
        <HypothesesForm
          hyp={hyp}
          setHyp={(u) => setHyp((h) => u(h))}
          jacks={calcOpts.jacks}
          carried={carriedTotal}
          levels={1 + Math.max(0, ...sceneModel.modules.map((m) => m.level))}
          customTypes={customTypeRows}
          hasViewbox={!sceneModel.modules.length || customTypeRows.reduce((a, t) => a + t.count, 0) < sceneModel.modules.length}
        />
      )}
      {step === 'calc' && (
        <SupportsCard
          modules={studyInputs.modules}
          members={studyInputs.members ?? []}
          unsupported={precheck?.unsupported ?? []}
          added={(mods.supports ?? []).map((a) => {
            const r = run && !stale ? addedSupportEtas(run.result).get(supportKey(a)) : undefined;
            return { ...a, eta: r?.eta, sectionName: designation(r ? sectionName(r.section) : a.section ? sectionName(a.section) : a.kind === 'post' ? 'QHP 100 × 5' : 'UNP 220') };
          })}
          sizing={sizing}
          canEdit
          onAddAndSize={() => void addSupports()}
          onRemove={(a) => setMods((m) => ({ ...m, supports: a ? (m.supports ?? []).filter((x) => supportKey(x) !== supportKey(a)) : undefined }))}
        />
      )}
      {step === 'calc' && (
        <CalcPanel
          options={calcOpts}
          setOptions={setCalcOpts}
          jack={jackSpec(connectionSet(library))}
          modulesCount={sceneModel.modules.length}
          stairs={sceneModel.stairs.length}
          blocking={sceneModel.errors}
          warnings={sceneModel.warnings}
          running={running}
          progress={progress}
          capProgress={capProgress}
          run={run?.result ?? null}
          stale={stale}
          error={calcError}
          onRun={() => void startRun()}
          middleFeet={hyp.middleFeet}
          modsLines={describeMods(mods, sectionName)}
          onCancel={cancelRun}
          onShowResults={() => setStep('results')}
        />
      )}
      <div style={{ display: step === 'results' ? 'block' : 'none' }}>
        {run && !stale && run.result.verdict.verdict !== 'ok' && (
          <div className="card" style={{ marginBottom: 12, borderColor: 'var(--orange)' }}>
            <div className="card-body row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <span>
                Ça ne passe pas (ou de justesse) ? Le <b>conseil ingénieur</b> explique pourquoi et propose des solutions vérifiées par le calcul (lest, contreventements, calage, Viewbox en plus…).
              </span>
              <button className="btn small primary" onClick={() => setStep('advisor')}>
                💬 Ouvrir le conseil ingénieur
              </button>
            </div>
          </div>
        )}
        {run && !stale && <CapacityCard capacity={run.result.capacity} progress={capProgress} />}
        <ResultsPanel
          scene={scene}
          glassTest={glassTest}
          active={active && step === 'results'}
          recognition={recognition}
          run={run?.result ?? null}
          stale={stale}
          ai={ai}
          studyId={study?.id ?? null}
          friction={calcOpts.friction}
          onSimulate={(title, changes) => {
            setVariantRequest({ id: Date.now(), title, changes });
            setStep('variants');
          }}
          facts={() =>
            run
              ? studyFacts({
                  lang: 'fr',
                  run: run.result,
                  inputs: studyInputs,
                  calage: null,
                  bearing: bearingFrom(hyp.bearingValue, hyp.bearingUnit) * 1e3,
                  warnings: [...sceneModel.warnings, ...warnings],
                })
              : {}
          }
        />
      </div>
      {step === 'report' && (
        <ReportPanel
          scene={scene}
          provider={provider}
          glassTest={glassTest}
          run={run?.result ?? null}
          stale={stale}
          inputs={studyInputs}
          hyp={hyp}
          modules={groundModules}
          modifications={describeMods(mods, sectionName)}
          recognition={recognition}
          model={model}
          study={study}
          me={me}
          ai={ai}
        />
      )}
      {step === 'advisor' && (
        <AdvisorPanel
          ai={ai}
          studyId={study?.id ?? null}
          run={run?.result ?? null}
          stale={stale}
          friction={calcOpts.friction}
          mods={mods}
          sectionName={sectionName}
          context={() => ({
            source: inputsSource,
            ensureRun,
            runner: () => (runnerRef.current ??= typeof Worker !== 'undefined' ? createStudyWorkerPool() : createInlineStudyRunner()),
            groundModules,
            stock,
          })}
          currentKey={currentKey}
          onApply={applyVariant}
          onClearMods={() => setMods({})}
          onRunStudy={() => void startRun()}
          running={running}
          messages={messages}
          setMessages={setMessages}
          variants={variants}
          setVariants={setVariants}
        />
      )}
      {step === 'variants' && (
        <VariantsPanel
          source={inputsSource}
          run={run?.result ?? null}
          stale={stale}
          currentKey={currentKey}
          variants={variants}
          setVariants={setVariants}
          runner={() => (runnerRef.current ??= typeof Worker !== 'undefined' ? createStudyWorkerPool() : createInlineStudyRunner())}
          onApply={(v) => {
            applyVariant(v);
            setVariants((list) => list.map((x) => (x.id === v.id ? { ...x, applied: true } : x)));
          }}
          onRunStudy={() => void startRun()}
          running={running}
          who={[me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'utilisateur'}
          request={variantRequest}
          onRequestDone={() => setVariantRequest(null)}
          renderResults={(r) => (
            <ResultsPanel scene={scene} glassTest={glassTest} active={active && step === 'variants'} recognition={recognition} run={r} stale={false} ai={ai} studyId={study?.id ?? null} facts={() => ({})} />
          )}
        />
      )}
      {step === 'accessories' && (
        <AccessoriesPanel
          library={library}
          canEdit={canEditLibrary}
          who={[me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'utilisateur'}
          ai={ai}
          studyId={study?.id ?? null}
          stackedCount={studyInputs.modules.filter((m) => m.level > 0).length}
          run={run?.result ?? null}
          onSave={async (e) => {
            await vem.saveLibraryEntry(toPayload(e));
            await refreshLibrary();
          }}
          onUseInStudy={(d: JointDesign) => {
            setVariantRequest({ id: Date.now(), title: `Liaison « ${d.name} »`, changes: { mods: { stackJoint: { design: d } } } });
            setStep('variants');
          }}
        />
      )}
      {step === 'ground' && (
        <GroundPanel
          modules={groundModules}
          source={`Modèle ${scene.index.source.fileName}`}
          storageKey={`vem.structure.model.${scene.modelKey}`}
          hyp={hyp}
          onHypChange={setHyp}
          showHypotheses={false}
          reactions={run && !stale ? run.result.ground : null}
          jacks={calcOpts.jacks}
          extraSupports={extraSupports}
          jackMax={calcOpts.jackExtension}
          onSendToPlans={() => setStep('report')}
          intro={
            warnings.length ? (
              <div className="warnings">
                {warnings.map((w, k) => (
                  <div key={k} className="warning warning">
                    <span className="sev">ATTENTION</span>
                    <span className="msg">{w}</span>
                  </div>
                ))}
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
