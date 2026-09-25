// Espace de travail d'un modèle analysé : Contrôle (inspecteur) · Vue 3D (isolation, captures) · Vues 2D (plans).
// Le modèle 3D (paquet GLB) n'est chargé qu'à l'ouverture de la vue 3D ou des vues 2D.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ClassificationRules, SceneIndex } from '../core/types';
import { LEGEND } from '../core/types';
import { compileRules } from '../core/classification';
import type { FrontSide } from '../core/views';
import { defaultFront } from '../core/views';
import type { ModelSettings, ModelVersion } from '../api/vem';
import { downloadPackage, vem } from '../api/vem';
import { loadPackage } from '../ingest/package';
import type { LoadedScene } from '../scene/loadedScene';
import { computeFrames, makeLoadedScene } from '../scene/loadedScene';
import { makeGlassTest } from '../linework/packets';
import { BrowserHlrProvider } from '../linework/provider';
import { createInlineRunner, createWorkerPool } from '../linework/runner';
import { ProgressBar } from './common';
import { Viewer3DPage } from './Viewer3DPage';
import { Views2DPage } from './Views2DPage';
import { SheetsPage } from './sheets/SheetsPage';

type Tab = 'control' | '3d' | '2d' | 'sheets';

interface Props {
  index: SceneIndex;
  model?: ModelVersion;
  /** paquet GLB déjà en mémoire (analyse qui vient d'être faite) */
  glb?: ArrayBuffer;
  rules: ClassificationRules;
  /** analyse en cours d'enregistrement : le modèle 3D arrive */
  busy?: boolean;
  /** réanalyse le fichier source pour recréer le modèle 3D manquant */
  onRebuild?: () => void;
  onBack: () => void;
  inspector: ReactNode;
}

export function Workspace({ index, model, glb, rules, busy, onRebuild, onBack, inspector }: Props) {
  const [tab, setTab] = useState<Tab>('control');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(['control']));
  const [scene, setScene] = useState<LoadedScene | null>(null);
  const [framesVersion, setFramesVersion] = useState(0);
  const [loading, setLoading] = useState<{ label: string; fraction: number } | null>(null);
  const [error, setError] = useState('');
  const [missing, setMissing] = useState(false);
  const [settings, setSettings] = useState<ModelSettings>(() => model?.settings ?? {});
  const loadStarted = useRef(false);
  // analyse fraîche : la version enregistrée arrive après coup, avec les réglages repris de la précédente
  useEffect(() => {
    if (model?.settings) setSettings(model.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id]);

  const glassTest = useMemo(() => makeGlassTest(compileRules(rules).glassMaterial), [rules]);
  const categoryColors = useMemo(() => {
    const colors: Record<string, string> = {};
    for (const [k, v] of Object.entries(LEGEND)) colors[k] = v.color;
    for (const c of rules.categories) if (c.color) colors[c.key] = c.color;
    return colors;
  }, [rules]);

  const provider = useMemo(() => {
    if (!scene) return null;
    const runner = typeof Worker !== 'undefined' ? createWorkerPool() : createInlineRunner();
    return new BrowserHlrProvider(scene, { runner, glassTest, categoryColors: () => categoryColors });
  }, [scene, glassTest, categoryColors]);
  useEffect(() => () => provider?.dispose(), [provider]);

  const open = (t: Tab) => {
    setTab(t);
    setVisited((v) => new Set(v).add(t));
  };

  useEffect(() => {
    if (tab === 'control' || loadStarted.current) return;
    loadStarted.current = true;
    (async () => {
      try {
        let data = glb;
        if (!data) {
          if (!model?.glbUrl) {
            // analyse en cours : le modèle 3D arrive (l'effet repart quand il est là) ; sinon il n'a jamais été enregistré
            loadStarted.current = false;
            if (!busy) setMissing(true);
            return;
          }
          setLoading({ label: 'Téléchargement du modèle 3D', fraction: 0 });
          data = await downloadPackage(model, (f) => setLoading({ label: 'Téléchargement du modèle 3D', fraction: f * 0.8 }));
        }
        setLoading({ label: 'Lecture du modèle 3D', fraction: 0.85 });
        await new Promise((r) => setTimeout(r, 0));
        const pkg = await loadPackage(data.slice(0));
        setScene(makeLoadedScene(pkg.root, pkg.objectsById, index, index.source.sha256, settings.fronts ?? {}));
        setLoading(null);
        setMissing(false);
        setError('');
      } catch (e) {
        setLoading(null);
        setError((e as Error).message);
        loadStarted.current = false;
      }
    })();
  }, [tab, glb, model, index, settings.fronts, busy]);

  const saveSettings = async (patch: ModelSettings) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.fronts && scene) {
      scene.frames = computeFrames(index, scene.objectsById, scene.look, next.fronts ?? {});
      setFramesVersion((v) => v + 1);
    }
    if (!model) return;
    try {
      await vem.saveSettings(model.id, patch);
    } catch (e) {
      setError(`Réglage non enregistré : ${(e as Error).message}`);
    }
  };

  const setFront = (moduleId: string, front: FrontSide | null) => {
    const fronts = { ...(settings.fronts ?? {}) };
    const frame = scene?.frames.get(moduleId);
    // revenir au côté par défaut = supprimer le réglage manuel
    if (front && frame && front === defaultFront(frame.longAxis)) front = null;
    if (front) fronts[moduleId] = front;
    else delete fronts[moduleId];
    void saveSettings({ fronts });
  };

  return (
    <div className="workspace">
      <div className="workspace-head">
        <button className="btn" onClick={onBack}>
          ← Modèles
        </button>
        <h1 style={{ fontSize: 15 }}>{index.source.fileName}</h1>
        <nav className="tabs">
          <button className={`tab ${tab === 'control' ? 'active' : ''}`} onClick={() => open('control')}>
            Contrôle
          </button>
          <button className={`tab ${tab === '3d' ? 'active' : ''}`} onClick={() => open('3d')}>
            Vue 3D
          </button>
          <button className={`tab ${tab === '2d' ? 'active' : ''}`} onClick={() => open('2d')}>
            Vues 2D
          </button>
          <button className={`tab ${tab === 'sheets' ? 'active' : ''}`} onClick={() => open('sheets')}>
            Planches A1
          </button>
        </nav>
      </div>
      {error && (
        <div className="error-box" style={{ margin: '0 0 12px' }}>
          {error}{' '}
          <button className="btn small" onClick={() => setError('')}>
            OK
          </button>
        </div>
      )}
      <div style={{ display: tab === 'control' ? 'block' : 'none' }}>{inspector}</div>
      {tab !== 'control' && loading && <ProgressBar label={loading.label} fraction={loading.fraction} />}
      {tab !== 'control' && !scene && !loading && busy && !glb && <ProgressBar label="Préparation du modèle 3D…" fraction={0.5} />}
      {tab !== 'control' && !scene && missing && (
        <div className="card">
          <div className="card-body">
            <p style={{ marginBottom: 10 }}>
              Le modèle 3D de cette analyse n’a pas été enregistré (analyse faite avant la correction de la limite de 10 Mo, ou envoi
              interrompu). Il faut réanalyser le fichier une fois : ensuite la vue 3D et les vues 2D s’ouvrent directement.
            </p>
            {onRebuild ? (
              <button className="btn primary" onClick={onRebuild}>
                Réanalyser le fichier et créer le modèle 3D
              </button>
            ) : (
              <div className="hint">Le fichier d’origine n’est plus dans le projet : glisse-le à nouveau dans la page Modèles.</div>
            )}
          </div>
        </div>
      )}
      {scene && visited.has('3d') && (
        <div style={{ display: tab === '3d' ? 'block' : 'none' }}>
          <Viewer3DPage
            scene={scene}
            glassTest={glassTest}
            active={tab === '3d'}
            framesVersion={framesVersion}
            settings={settings}
            onSetFront={setFront}
            onSaveSettings={saveSettings}
          />
        </div>
      )}
      {scene && provider && visited.has('sheets') && (
        <div style={{ display: tab === 'sheets' ? 'block' : 'none' }}>
          <SheetsPage scene={scene} provider={provider} glassTest={glassTest} model={model} rules={rules} framesVersion={framesVersion} />
        </div>
      )}
      {scene && provider && visited.has('2d') && (
        <div style={{ display: tab === '2d' ? 'block' : 'none' }}>
          <Views2DPage scene={scene} provider={provider} framesVersion={framesVersion} categoryColors={categoryColors} />
        </div>
      )}
    </div>
  );
}
