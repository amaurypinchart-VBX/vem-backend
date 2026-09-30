// Onglet « Étude structure » : 6 étapes (Reconnaissance · Site & hypothèses · Calcul · Résultats · Sol & calage ·
// Rapport). L'étude (une par version de modèle) garde les réponses de la reconnaissance et les hypothèses ; elle est
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
import { SEED } from '../../structure/library/seed';
import { itemBoxDims } from '../../structure/scene/geometry';
import { studyModelFromScene } from '../../structure/scene/studyModel';
import { sectionMap } from '../../structure/core/assemble';
import type { EdgeItem } from '../../structure/core/loads';
import { DEFAULTS } from '../../structure/library/defaults';
import type { CalcOptions, StudyInputs, StudyRun } from '../../structure/studyRun';
import { CALC_DEFAULTS, inputKey, runStudy } from '../../structure/studyRun';
import type { StudyRunner } from '../../structure/worker/study';
import { createInlineStudyRunner, createStudyWorkerPool } from '../../structure/worker/study';
import { CalcPanel, ResultsPanel } from './CalcResults';
import { ReportPanel } from './ReportPanel';
import type { BrowserHlrProvider } from '../../linework/provider';
import type { ModelVersion, StudyRecord, VemUser } from '../../api/vem';
import { PROJECT_ID, vem } from '../../api/vem';
import type { Hypotheses } from './GroundPanel';
import { DEFAULT_HYP, GroundPanel, HypothesesForm } from './GroundPanel';
import type { AnswerOptions } from './RecognitionStep';
import { RecognitionStep } from './RecognitionStep';

/** Viewbox du modèle → modules de l'estimation (emprise en plan, niveau, surface). */
export function modulesFromScene(scene: LoadedScene, roofAccessible: boolean): { modules: EstimateModule[]; warnings: string[] } {
  const warnings: string[] = [];
  const idx = scene.index;
  const modules: EstimateModule[] = [];
  for (const m of idx.modules) {
    const fp = moduleFootprint(idx, m.id, scene.frames);
    if (!fp) continue;
    modules.push({ id: m.id, level: m.level, corners: fp, area: m.planDimsMm[0] * m.planDimsMm[1], height: 3080, roofAccessible: false });
    if (Math.abs(m.expected.long - 5900) > 50) warnings.push(`${m.id} (${m.expected.label}) : données de structure inconnues, poids pris au prorata de la surface.`);
  }
  // toitures accessibles : Viewbox sans rien au-dessus
  if (roofAccessible)
    for (const m of modules) {
      const above = modules.some((o) => o.level === m.level + 1 && o.corners.some((c) => m.corners.some((d) => Math.hypot(c[0] - d[0], c[1] - d[1]) < 200)));
      m.roofAccessible = !above;
    }
  return { modules, warnings };
}

type Step = 'recognition' | 'site' | 'calc' | 'results' | 'ground' | 'report';
type StepState = 'ok' | 'warn' | 'bad' | 'todo';
const STEP_ICON: Record<StepState, string> = { ok: '✔', warn: '⚠', bad: '✖', todo: '·' };
const STEP_COLOR: Record<StepState, string> = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)', todo: 'var(--text-dim)' };
const LIBRARY_EDITORS = ['admin', 'technical_manager', 'engineer'];

interface StudySettings {
  hyp?: Partial<Hypotheses>;
  roofAccessible?: boolean;
  fileName?: string;
  calc?: Partial<CalcOptions>;
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
  const [run, setRun] = useState<{ result: StudyRun; key: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [calcError, setCalcError] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const runnerRef = useRef<StudyRunner | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error' | 'local'>('idle');
  const [error, setError] = useState('');
  const loaded = useRef(false);

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
  const recognition = useMemo(
    () => recognize({ index: scene.index, look: scene.look, geometry: dims, library, assignments, accessoryCategories: accessory }),
    [scene, dims, library, assignments, accessory],
  );
  // framesVersion : les repères des Viewbox ont été recalculés (face avant modifiée)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const { modules, warnings } = useMemo(() => modulesFromScene(scene, roof), [scene, framesVersion, roof]);

  // ─── calcul complet ───
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sceneModel = useMemo(() => studyModelFromScene(scene, recognition, library), [scene, recognition, library, framesVersion]);
  const studyInputs = useMemo((): StudyInputs => {
    const kNm2 = (v: number) => v * 1e-3;
    // charge forfaitaire par Viewbox (hypothèses du calage) : répartie sur les 4 rives du plancher
    const extra: EdgeItem[] =
      hyp.extraKN > 0
        ? sceneModel.modules.flatMap((m) => {
            const p = m.params;
            const q = (hyp.extraKN * 1e3) / (2 * (p.x1 - p.x0 + (p.y1 - p.y0)));
            return (['u0', 'u1', 'v0', 'v1'] as const).map((side) => ({ module: m.id, side, from: 0, to: side[0] === 'v' ? p.x1 - p.x0 : p.y1 - p.y0, level: 'floor' as const, q, loadCase: 'G3' as const, label: 'charge forfaitaire' }));
          })
        : [];
    return {
      modules: sceneModel.modules,
      edgeItems: [...sceneModel.edgeItems, ...extra],
      pointItems: sceneModel.pointItems,
      library,
      sections: sectionMap(library),
      loads: {
        moduleWeight: hyp.moduleWeightKg * 9.81,
        ceiling: kNm2(hyp.ceiling),
        floorFinish: kNm2(hyp.floorFinish),
        live: kNm2(hyp.live),
        roofLive: kNm2(hyp.roofLive),
        horizontalRatio: DEFAULTS.horizontalRatio.value,
        roofAccessible: roof,
        evacuateTopLevel: hyp.evacuateTop,
        windInService: kNm2(hyp.windIn),
        windOutOfService: kNm2(hyp.windOut),
        cp: { windward: DEFAULTS.cpWindward.value, leeward: DEFAULTS.cpLeeward.value, parallel: DEFAULTS.cpParallel.value, roofStability: DEFAULTS.cpRoofStability.value },
      },
      middleFeet: hyp.middleFeet,
      sls: !hyp.staticoConversion,
      options: calcOpts,
      blocking: sceneModel.errors,
    };
  }, [sceneModel, library, hyp, roof, calcOpts]);
  const currentKey = useMemo(() => inputKey(studyInputs), [studyInputs]);
  const stale = !!run && run.key !== currentKey;
  useEffect(() => () => {
    abortRef.current?.abort();
    runnerRef.current?.dispose();
  }, []);
  const startRun = async () => {
    abortRef.current?.abort();
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
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setCalcError((e as Error).message);
    } finally {
      if (abortRef.current === ctrl) setRunning(false);
    }
  };
  const cancelRun = () => {
    abortRef.current?.abort();
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
          settings: { hyp, roofAccessible: roof, fileName: model?.fileName, calc: calcOpts },
          resultsSummary: summary,
        });
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        setError(`Étude non enregistrée : ${(e as Error).message}`);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [assignments, hyp, roof, study, summary, model?.fileName, calcOpts]);

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
  };
  const STEPS: Array<{ key: Step; label: string; soon?: string }> = [
    { key: 'recognition', label: '1. Reconnaissance' },
    { key: 'site', label: '2. Site & hypothèses' },
    { key: 'calc', label: '3. Calcul' },
    { key: 'results', label: '4. Résultats' },
    { key: 'ground', label: '5. Sol & calage' },
    { key: 'report', label: '6. Rapport' },
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
        />
      </div>
      {step === 'site' && (
        <>
          <div className="card">
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label className="row hint">
                <input type="checkbox" checked={roof} onChange={(e) => setRoof(e.target.checked)} /> Toitures sans Viewbox au-dessus accessibles (terrasses)
              </label>
              <div className="hint">
                Ces valeurs servent au calcul complet (étape 3) et au calage (étape 5). Vent : pressions en service (DIN EN 13814) et hors service (EN 1991-1-4/NA, abattement 0,7), cp luv +0,8 / lee −0,5 /
                parallèle −0,8, toiture −0,7 pour la stabilité ; neige non prise en compte (évacuation, comme les notes statico).
              </div>
            </div>
          </div>
          <HypothesesForm hyp={hyp} setHyp={(u) => setHyp((h) => u(h))} />
        </>
      )}
      {step === 'calc' && (
        <CalcPanel
          options={calcOpts}
          setOptions={setCalcOpts}
          modulesCount={sceneModel.modules.length}
          blocking={sceneModel.errors}
          warnings={sceneModel.warnings}
          running={running}
          progress={progress}
          run={run?.result ?? null}
          stale={stale}
          error={calcError}
          onRun={() => void startRun()}
          onCancel={cancelRun}
          onShowResults={() => setStep('results')}
        />
      )}
      <div style={{ display: step === 'results' ? 'block' : 'none' }}>
        <ResultsPanel scene={scene} glassTest={glassTest} active={active && step === 'results'} recognition={recognition} run={run?.result ?? null} stale={stale} />
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
          modules={modules}
          recognition={recognition}
          model={model}
          study={study}
          me={me}
        />
      )}
      {step === 'ground' && (
        <GroundPanel
          modules={modules}
          source={`Modèle ${scene.index.source.fileName}`}
          storageKey={`vem.structure.model.${scene.modelKey}`}
          hyp={hyp}
          onHypChange={setHyp}
          showHypotheses={false}
          reactions={run && !stale ? run.result.ground : null}
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
