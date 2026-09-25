// Vues 2D vectorielles : les 6 vues d'une Viewbox (repère de la Viewbox) ou d'un niveau / de tout le modèle
// (repère SketchUp), lignes cachées retirées, mesurées au mm, exportables en SVG (1:1 ou à l'échelle).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ViewKind, ViewSpec } from '../core/views';
import { VIEW_LABELS } from '../core/views';
import { categoriesIn, subsetAll, subsetForLevel, subsetForModule } from '../core/subset';
import { fmtInt } from '../core/report';
import type { LoadedScene } from '../scene/loadedScene';
import type { BrowserHlrProvider } from '../linework/provider';
import type { LineStyleSpec, Linework2D } from '../linework/types';
import { DEFAULT_LINE_STYLE } from '../linework/types';
import { lineworkToSvg } from '../linework/svg';
import { CategoryChip, downloadText } from './common';

type Scope = { kind: 'module'; moduleId: string } | { kind: 'level'; level: number } | { kind: 'all' };

interface ViewState {
  status: 'waiting' | 'running' | 'done' | 'error';
  progress: number;
  lw?: Linework2D;
  url?: string;
  error?: string;
}

const KINDS: ViewKind[] = ['top', 'front', 'back', 'left', 'right', 'bottom'];
const SCALES = [1, 10, 20, 25, 50, 75, 100, 200];

const fmtMm = (v: number) => fmtInt(Math.round(v));

interface Props {
  scene: LoadedScene;
  provider: BrowserHlrProvider;
  framesVersion: number;
  categoryColors: Record<string, string>;
}

export function Views2DPage({ scene, provider, framesVersion, categoryColors }: Props) {
  const { index } = scene;
  const firstModule = [...index.modules].sort((a, b) => a.id.localeCompare(b.id))[0]?.id;
  const [scope, setScope] = useState<Scope>(firstModule ? { kind: 'module', moduleId: firstModule } : { kind: 'all' });
  const [hideCats, setHideCats] = useState<string[]>([]);
  const [style, setStyle] = useState<LineStyleSpec>(DEFAULT_LINE_STYLE);
  const [exportScale, setExportScale] = useState(50);
  const [views, setViews] = useState<Partial<Record<ViewKind, ViewState>>>({});
  const [running, setRunning] = useState(false);
  const ctrl = useRef<AbortController | null>(null);
  const urls = useRef<string[]>([]);

  const include = useMemo(() => {
    if (scope.kind === 'module') return subsetForModule(index, scope.moduleId);
    if (scope.kind === 'level') return subsetForLevel(index, scope.level);
    return subsetAll(index);
  }, [scope, index]);
  const categories = useMemo(() => categoriesIn(index, scene.look, include), [index, scene, include]);
  const module = scope.kind === 'module' ? index.modules.find((m) => m.id === scope.moduleId) : undefined;
  const frame = scope.kind === 'module' ? scene.frames.get(scope.moduleId) : undefined;

  useEffect(
    () => () => {
      ctrl.current?.abort();
      for (const u of urls.current) URL.revokeObjectURL(u);
    },
    [],
  );

  const specFor = (kind: ViewKind): ViewSpec => ({ kind, frame: scope.kind === 'module' ? { moduleId: scope.moduleId } : 'world' });

  const run = async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current = [];
    setViews(Object.fromEntries(KINDS.map((k) => [k, { status: 'waiting', progress: 0 }])));
    setRunning(true);
    const t0 = performance.now();
    await Promise.all(
      KINDS.map(async (kind) => {
        try {
          const lw = await provider.getLinework(
            { modelId: scene.modelKey, subset: { include, hideCategories: hideCats }, view: specFor(kind), style },
            (p) => setViews((v) => ({ ...v, [kind]: { ...v[kind], status: 'running', progress: p } as ViewState })),
            c.signal,
          );
          const svg = lineworkToSvg(lw, { scale: 20, categoryColors });
          const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
          urls.current.push(url);
          setViews((v) => ({ ...v, [kind]: { status: 'done', progress: 1, lw, url } }));
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          setViews((v) => ({ ...v, [kind]: { status: 'error', progress: 0, error: (e as Error).message } }));
        }
      }),
    );
    if (!c.signal.aborted) {
      setRunning(false);
      console.info(`[plans] 6 vues en ${((performance.now() - t0) / 1000).toFixed(1)} s`);
    }
  };

  const cancel = () => {
    ctrl.current?.abort();
    setRunning(false);
    setViews((v) => Object.fromEntries(Object.entries(v).map(([k, s]) => [k, s?.status === 'done' ? s : { status: 'waiting', progress: 0 }])));
  };

  // la face avant a changé : les vues d'une Viewbox ne sont plus valables
  useEffect(() => {
    if (scope.kind === 'module') setViews({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesVersion]);

  const scopeLabel = scope.kind === 'module' ? scope.moduleId : scope.kind === 'level' ? index.levels.find((l) => l.level === scope.level)?.label ?? `niveau ${scope.level}` : 'ensemble';
  const exportSvg = (kind: ViewKind, lw: Linework2D, scale: number) =>
    downloadText(`${scopeLabel}_${VIEW_LABELS[kind]}_1-${scale}.svg`.replace(/\s+/g, '-'), lineworkToSvg(lw, { scale, categoryColors }), 'image/svg+xml');

  const presentCategories = useMemo(() => {
    const s = new Set<string>();
    for (const v of Object.values(views)) for (const l of v?.lw?.layers ?? []) if (l.key.startsWith('category:')) s.add(l.key.slice(9));
    return [...s];
  }, [views]);

  return (
    <div className="views2d">
      <div className="card">
        <div className="card-body views2d-controls">
          <div className="field">
            <label>Sous-ensemble</label>
            <select
              value={scope.kind === 'module' ? `m:${scope.moduleId}` : scope.kind === 'level' ? `l:${scope.level}` : 'all'}
              onChange={(e) => {
                const v = e.target.value;
                setScope(v === 'all' ? { kind: 'all' } : v.startsWith('m:') ? { kind: 'module', moduleId: v.slice(2) } : { kind: 'level', level: Number(v.slice(2)) });
                setViews({});
              }}
            >
              <optgroup label="Une Viewbox (vues relatives à la Viewbox)">
                {[...index.modules]
                  .sort((a, b) => a.id.localeCompare(b.id))
                  .map((m) => (
                    <option key={m.id} value={`m:${m.id}`}>
                      {m.id}
                      {m.type ? ` — ${m.type}` : ''} (avec ses {m.itemIds.length} accessoires)
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Plusieurs Viewbox (vues SketchUp)">
                {index.levels.map((l) => (
                  <option key={l.level} value={`l:${l.level}`}>
                    {l.label} ({l.moduleIds.length} Viewbox)
                  </option>
                ))}
                <option value="all">Tout le modèle</option>
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label>Masquer</label>
            <div className="chips-select">
              {categories.map((c) => (
                <label key={c} className={`chip-toggle${hideCats.includes(c) ? ' off' : ''}`} title="Masquer / afficher cette catégorie">
                  <input
                    type="checkbox"
                    checked={hideCats.includes(c)}
                    onChange={(e) => setHideCats((h) => (e.target.checked ? [...h, c] : h.filter((x) => x !== c)))}
                  />
                  <CategoryChip category={c} />
                </label>
              ))}
            </div>
          </div>
          <div className="field-row">
            <label className="check">
              <input type="checkbox" checked={style.glassTransparent} onChange={(e) => setStyle({ ...style, glassTransparent: e.target.checked })} />
              Vitres transparentes
            </label>
            <label className="check">
              <input type="checkbox" checked={style.hiddenLines} onChange={(e) => setStyle({ ...style, hiddenLines: e.target.checked })} />
              Lignes cachées (pointillés)
            </label>
            <label className="check">
              <input type="checkbox" checked={style.colorByCategory} onChange={(e) => setStyle({ ...style, colorByCategory: e.target.checked })} />
              Colorer par catégorie (dessus)
            </label>
            <label className="check" title="Échelle visée : fixe le seuil des détails fins et des très petits objets">
              Échelle
              <select value={style.scaleDenominator} onChange={(e) => setStyle({ ...style, scaleDenominator: Number(e.target.value) })} style={{ width: 80 }}>
                {[20, 25, 50, 75, 100, 200].map((s) => (
                  <option key={s} value={s}>
                    1:{s}
                  </option>
                ))}
              </select>
            </label>
            <label className="check" title="Angle entre deux faces au-delà duquel leur arête est dessinée">
              Arêtes à partir de
              <input
                type="number"
                min={1}
                max={89}
                value={style.angleThresholdDeg}
                onChange={(e) => setStyle({ ...style, angleThresholdDeg: Math.min(89, Math.max(1, Number(e.target.value) || 30)) })}
                style={{ width: 60 }}
              />
              °
            </label>
            <div className="spacer" />
            {running ? (
              <button className="btn" onClick={cancel}>
                Annuler
              </button>
            ) : (
              <button className="btn primary" onClick={() => void run()}>
                Calculer les 6 vues
              </button>
            )}
          </div>
          {module && frame && (
            <div className="hint">
              {module.id} : {fmtMm(module.planDimsMm[0])} × {fmtMm(module.planDimsMm[1])} mm en plan, {fmtMm(module.heightMm)} mm de haut (pieds exclus). Face
              avant : côté {frame.front} du composant{frame.frontSource === 'manual' ? ' (choisie à la main)' : ' (par défaut)'} — à changer dans la Vue 3D.
            </div>
          )}
        </div>
      </div>

      {presentCategories.length > 0 && (
        <div className="row">
          <span className="hint">Légende :</span>
          {presentCategories.map((c) => (
            <CategoryChip key={c} category={c} />
          ))}
        </div>
      )}

      <div className="views-grid">
        {KINDS.map((kind) => {
          const v = views[kind];
          const b = v?.lw?.boundsMm;
          return (
            <div key={kind} className="card view-card">
              <div className="card-head">
                <h2>{VIEW_LABELS[kind]}</h2>
                <div className="spacer" />
                {v?.lw && (
                  <>
                    <button className="btn small ghost" onClick={() => exportSvg(kind, v.lw!, 1)} title="SVG à l’échelle 1:1 (mesurable en mm réels)">
                      SVG 1:1
                    </button>
                    <select value={exportScale} onChange={(e) => setExportScale(Number(e.target.value))} style={{ width: 72 }} title="Échelle d’export">
                      {SCALES.filter((s) => s > 1).map((s) => (
                        <option key={s} value={s}>
                          1:{s}
                        </option>
                      ))}
                    </select>
                    <button className="btn small ghost" onClick={() => exportSvg(kind, v.lw!, exportScale)}>
                      SVG
                    </button>
                  </>
                )}
              </div>
              <div className="card-body view-body">
                {!v && <div className="hint">Clique « Calculer les 6 vues ».</div>}
                {v && (v.status === 'waiting' || v.status === 'running') && (
                  <div className="progress-row" style={{ width: '100%' }}>
                    <div className="progress">
                      <div style={{ width: `${Math.round(v.progress * 100)}%` }} />
                    </div>
                    <span className="hint">{v.status === 'waiting' ? 'en attente' : `${Math.round(v.progress * 100)} %`}</span>
                  </div>
                )}
                {v?.status === 'error' && <div className="error-box">{v.error}</div>}
                {v?.status === 'done' && v.url && (
                  <a href={v.url} target="_blank" rel="noreferrer" title="Ouvrir en grand (zoom du navigateur)">
                    <img className="view-img" src={v.url} alt={VIEW_LABELS[kind]} />
                  </a>
                )}
              </div>
              {v?.lw && b && (
                <div className="view-foot hint">
                  Encombrement {fmtMm(b.maxX - b.minX)} × {fmtMm(b.maxY - b.minY)} mm · {fmtInt(v.lw.meta.segmentCount)} traits ·{' '}
                  {v.lw.meta.durationMs ? `${(v.lw.meta.durationMs / 1000).toFixed(1)} s` : 'cache'}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
