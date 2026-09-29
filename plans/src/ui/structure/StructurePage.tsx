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
}

interface Props {
  scene: LoadedScene;
  model?: ModelVersion;
  glassTest: GlassTest;
  rules: ClassificationRules;
  framesVersion: number;
  active: boolean;
}

export function StructurePage({ scene, model, glassTest, rules, framesVersion, active }: Props) {
  const [step, setStep] = useState<Step>('recognition');
  const [me, setMe] = useState<VemUser | null>(null);
  const [rows, setRows] = useState<ServerLibraryRow[]>([]);
  const [study, setStudy] = useState<StudyRecord | null>(null);
  const [assignments, setAssignments] = useState<Assignments>({});
  const [hyp, setHyp] = useState<Hypotheses>(DEFAULT_HYP);
  const [roof, setRoof] = useState(false);
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

  // ─── enregistrement automatique (2 s après la dernière modification) ───
  const summary = useMemo(() => ({ recognition: recognition.counts }), [recognition.counts]);
  useEffect(() => {
    if (!loaded.current || !study) return;
    setSaveState('saving');
    const t = setTimeout(async () => {
      try {
        await vem.saveStudy(study.id, {
          assignments: assignments as unknown as Record<string, unknown>,
          settings: { hyp, roofAccessible: roof, fileName: model?.fileName },
          resultsSummary: summary,
        });
        setSaveState('saved');
      } catch (e) {
        setSaveState('error');
        setError(`Étude non enregistrée : ${(e as Error).message}`);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [assignments, hyp, roof, study, summary, model?.fileName]);

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
    calc: 'todo',
    results: 'todo',
    ground: modules.length ? 'warn' : 'todo',
    report: 'todo',
  };
  const STEPS: Array<{ key: Step; label: string; soon?: string }> = [
    { key: 'recognition', label: '1. Reconnaissance' },
    { key: 'site', label: '2. Site & hypothèses' },
    { key: 'calc', label: '3. Calcul', soon: 'S4–S5' },
    { key: 'results', label: '4. Résultats', soon: 'S5' },
    { key: 'ground', label: '5. Sol & calage' },
    { key: 'report', label: '6. Rapport', soon: 'S6' },
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
              <div className="hint">Lieu, zone de vent, exploitation et neige détaillés : phase S4 (calcul complet). Les valeurs ci-dessous servent déjà au calage.</div>
            </div>
          </div>
          <HypothesesForm hyp={hyp} setHyp={(u) => setHyp((h) => u(h))} />
        </>
      )}
      {(step === 'calc' || step === 'results' || step === 'report') && (
        <div className="card">
          <div className="card-body hint">
            {step === 'calc' && 'Calcul complet (modèle filaire 3D des Viewbox, charges, vent, 2ᵉ ordre) : prochaines phases (S4–S5). Le moteur de calcul est prêt.'}
            {step === 'results' && 'Résultats (taux de travail en couleurs, éléments les plus sollicités, réactions) : phase S5.'}
            {step === 'report' && 'Rapport PDF complet (FR / DE / EN) : phase S6. La fiche de calage PDF est déjà disponible à l’étape 5.'}
            {recognition.blocking > 0 && ` — ${recognition.blocking} type(s) de pièce encore inconnu(s) : le verdict serait « incomplet ».`}
          </div>
        </div>
      )}
      {step === 'ground' && (
        <GroundPanel
          modules={modules}
          source={`Modèle ${scene.index.source.fileName}`}
          storageKey={`vem.structure.model.${scene.modelKey}`}
          hyp={hyp}
          onHypChange={setHyp}
          showHypotheses={false}
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
