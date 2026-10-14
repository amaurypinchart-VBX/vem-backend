// Vues 2D › « ✂️ Vues spéciales » : éditeur de vues coupées / de dessous / sans certaines pièces.
// Gauche : vues enregistrées du modèle + préréglages · centre : 3D (coupes, clic = bulle) + aperçu 2D vectoriel ·
// droite : Direction, Coupes, Éléments retirés, Disposition, Style. Annuler / rétablir (Ctrl+Z / Ctrl+Y), enregistrement
// automatique 2 s après le dernier changement (réglages du modèle : settings.customViews).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LoadedScene } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import type { BrowserHlrProvider } from '../../linework/provider';
import type { ModelSettings, ModelVersion, SettingsUpdate, VemUser } from '../../api/vem';
import { vem } from '../../api/vem';
import type { CustomViewSpec, SectionBox, ViewTagRule } from '../../core/customViews/types';
import { cleanCustomViews } from '../../core/customViews/clean';
import { VIEW_PRESETS, specFromPreset } from '../../core/customViews/presets';
import type { ViewPreset } from '../../core/customViews/presets';
import { makePathIndex } from '../../core/customViews/paths';
import { cleanViewTags, makeTagResolver } from '../../core/customViews/tags';
import type { VisibilityContext } from '../../core/customViews/visibility';
import { resolveVisibility, scopeModules, scopeRoots } from '../../core/customViews/visibility';
import type { ModuleRefs } from '../../core/customViews/refs';
import { moduleRefs } from '../../core/customViews/refs';
import { cutPlanes, resolveCuts } from '../../core/customViews/cuts';
import type { ActionProposal, History } from '../../core/customViews/editor';
import { blankSpec, breadcrumb, defaultTarget, historyPush, historyRedo, historyStart, historyUndo, proposeName, restoreRule } from '../../core/customViews/editor';
import type { CustomViewResult } from '../../linework/customView';
import { computeSpecialView } from '../../linework/customView';
import { customViewSvg } from '../../linework/customSvg';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import type { PickInfo, PlaneGizmo, StandardView } from '../../viewer/SceneViewer';
import { SceneViewer } from '../../viewer/SceneViewer';
import { newId } from '../../sheets/generate';
import { CutsPanel, DirectionPanel, LayoutPanel, RulesPanel, StylePanel } from './Panels';
import { ClickBubble } from './ClickBubble';
import { AddToSheetDialog } from './AddToSheetDialog';
import { downloadText } from '../common';
import { ghostColorOf } from '../../sheets/bank';

interface Props {
  scene: LoadedScene;
  provider: BrowserHlrProvider;
  glassTest: GlassTest;
  active: boolean;
  settings: ModelSettings;
  onSaveSettings: (update: SettingsUpdate) => Promise<void>;
  categoryColors: Record<string, string>;
  model?: ModelVersion;
}

interface Preview {
  status: 'idle' | 'waiting' | 'running' | 'done' | 'error';
  progress: number;
  result?: CustomViewResult;
  url?: string;
  svg?: string;
  error?: string;
}

/** Préréglages partagés (app_settings › plans.viewPresets) : lecture tolérante. */
export function cleanSharedPresets(raw: unknown): ViewPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: ViewPreset[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const spec = cleanCustomViews([{ ...(o.spec as object), id: 'preset' }])[0];
    if (!spec || typeof o.key !== 'string' || typeof o.name !== 'string') continue;
    if ((o as { disabled?: boolean }).disabled) continue;
    const { id: _id, createdAt: _c, updatedAt: _u, source: _s, name: _n, ...rest } = spec;
    out.push({ key: o.key, name: o.name, description: typeof o.description === 'string' ? o.description : '', spec: rest });
  }
  return out;
}

const ISO_OF: Record<string, StandardView> = { fl: 'iso-sw', fr: 'iso-se', bl: 'iso-nw', br: 'iso-ne' };

export function CustomViewsPage({ scene, provider, glassTest, active, settings, onSaveSettings, categoryColors, model }: Props) {
  const { index, look, frames } = scene;
  const holder = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const [memTags, setMemTags] = useState<ViewTagRule[]>([]);
  const [shared, setShared] = useState<ViewPreset[]>([]);
  const [me, setMe] = useState<VemUser | null>(null);
  const views = useMemo(() => cleanCustomViews(settings.customViews), [settings.customViews]);
  const [hist, setHist] = useState<History<CustomViewSpec> | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'' | 'pending' | 'saved' | 'error'>('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [bubble, setBubble] = useState<{ meshId: string; level: string } | null>(null);
  const [preview, setPreview] = useState<Preview>({ status: 'idle', progress: 0 });
  const [sheetDialog, setSheetDialog] = useState(false);
  const spec = hist?.present ?? null;

  useEffect(() => {
    vem.me().then(setMe).catch(() => {});
    vem
      .getSetting<unknown>('plans.viewTags')
      .then((v) => setMemTags(cleanViewTags(v)))
      .catch(() => {});
    vem
      .getSetting<unknown>('plans.viewPresets')
      .then((v) => setShared(cleanSharedPresets(v)))
      .catch(() => {});
  }, []);

  const paths = useMemo(() => makePathIndex(index), [index]);
  const tags = useMemo(() => makeTagResolver(index, memTags), [index, memTags]);
  const ctx: VisibilityContext = useMemo(() => ({ index, look, paths, tags }), [index, look, paths, tags]);
  const allModules = useMemo(() => [...index.modules].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id, 'fr', { numeric: true })).map((m) => m.id), [index]);
  const refs = useMemo(() => {
    const out = new Map<string, ModuleRefs>();
    for (const m of allModules) {
      const f = frames.get(m);
      if (f) out.set(m, moduleRefs(index, look, tags, f));
    }
    return out;
  }, [allModules, frames, index, look, tags]);
  const allMeshes = useMemo(() => index.nodes.filter((n) => n.kind === 'mesh' && n.role !== 'context' && n.triangles > 0).map((n) => n.id), [index]);

  const vis = useMemo(() => (spec ? resolveVisibility(ctx, spec) : null), [ctx, spec]);
  const scopeMods = useMemo(() => (spec ? scopeModules(index, spec.scope) : allModules), [spec, index, allModules]);
  const scopeNodes = useMemo(() => {
    const roots = new Set(spec ? scopeRoots(index, spec.scope) : []);
    return new Set(index.nodes.filter((n) => look.inSet(n.id, roots)).map((n) => n.id));
  }, [spec, index, look]);
  const cuts = useMemo(() => (spec ? resolveCuts({ index, look, frames, refs, modules: scopeMods }, spec, allMeshes) : null), [spec, index, look, frames, refs, scopeMods, allMeshes]);

  // ─── viewer 3D ───
  useEffect(() => {
    if (!holder.current) return;
    const v = new SceneViewer(holder.current, scene, glassTest);
    v.setFrontMarkers(false);
    viewerRef.current = v;
    return () => {
      v.dispose();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);
  useEffect(() => {
    if (active) viewerRef.current?.reclaim();
  }, [active]);

  const hoverTarget = useCallback((meshId: string) => defaultTarget(ctx, meshId), [ctx]);
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    if (!spec || !vis || !cuts) {
      v.setCustomDisplay(null);
      v.setPlaneGizmos([]);
      return;
    }
    v.setCustomDisplay({ states: vis.states, planesOf: (id) => cuts.byNode.get(id), showRemoved, hoverTarget });
    // plans dessinés : chaque coupe dans chaque Viewbox (ou une fois en repère monde)
    const giz: PlaneGizmo[] = [];
    for (const c of spec.cuts) {
      const mods = c.frame === 'module' ? scopeMods : scopeMods.slice(0, 1);
      for (const m of mods) {
        const f = frames.get(m);
        if (!f) continue;
        const pl = cutPlanes(c, f, refs.get(m))[0];
        const cx = (f.min[0] + f.max[0]) / 2;
        const cy = (f.min[1] + f.max[1]) / 2;
        const centre: [number, number, number] = [f.origin[0] + f.xAxis[0] * cx + f.yAxis[0] * cy, f.origin[1] + (f.min[2] + f.max[2]) / 2, f.origin[2] + f.xAxis[2] * cx + f.yAxis[2] * cy];
        const dist = pl.n[0] * centre[0] + pl.n[1] * centre[1] + pl.n[2] * centre[2] - pl.d;
        const point: [number, number, number] = [centre[0] - pl.n[0] * dist, centre[1] - pl.n[1] * dist, centre[2] - pl.n[2] * dist];
        giz.push({ point, normal: pl.n, size: (c.frame === 'module' ? Math.hypot(f.max[0] - f.min[0], f.max[1] - f.min[1]) : 30000) * 1.05, color: c.label ? 0xe63946 : 0x3b82f6 });
      }
    }
    v.setPlaneGizmos(giz);
  }, [spec, vis, cuts, showRemoved, hoverTarget, scopeMods, frames, refs]);

  // caméra 3D : suit la direction choisie
  const camKey = spec ? `${spec.id}|${spec.camera.dir}|${spec.camera.isoCorner}|${spec.camera.frame}|${spec.box?.moduleId ?? ''}` : '';
  useEffect(() => {
    const v = viewerRef.current;
    if (!v || !spec) return;
    const t = setTimeout(() => {
      const cam = spec.camera;
      const moduleId = spec.box?.moduleId ?? (cam.frame === 'module' ? scopeMods[0] : undefined);
      if (cam.dir === 'iso' || cam.dir === 'iso-below' || cam.dir === 'custom') {
        const kind = ISO_OF[cam.isoCorner ?? 'fl'];
        const pose = v.poseFor(kind, undefined, 1.4, 1.08);
        if (cam.dir === 'iso-below') pose.position[1] = 2 * pose.target[1] - pose.position[1];
        v.applyPose(pose, false);
      } else v.setView(cam.dir, moduleId);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camKey]);

  // clic dans la 3D : bulle (pièce affichée) ou « remettre » (pièce retirée, rouge)
  const specRef = useRef(spec);
  specRef.current = spec;
  useEffect(() => {
    const v = viewerRef.current;
    if (!v) return;
    v.onPick((p: PickInfo | null) => {
      if (!p || !specRef.current) {
        setBubble(null);
        return;
      }
      if (p.removed) {
        change({ ...specRef.current, visibility: [...specRef.current.visibility, restoreRule(ctx, defaultTarget(ctx, p.nodeId))] });
        return;
      }
      setBubble({ meshId: p.nodeId, level: defaultTarget(ctx, p.nodeId) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  // ─── édition, historique, enregistrement ───
  const change = (next: CustomViewSpec) => setHist((h) => (h ? historyPush(h, { ...next, updatedAt: new Date().toISOString() }) : historyStart(next)));
  const open = (s: CustomViewSpec) => {
    setHist(historyStart(s));
    setBubble(null);
    setPreview({ status: 'idle', progress: 0 });
  };
  const undo = () => setHist((h) => (h ? historyUndo(h) : h));
  const redo = () => setHist((h) => (h ? historyRedo(h) : h));

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  const persist = useCallback(
    async (s: CustomViewSpec, remove = false) => {
      setSaveState('pending');
      try {
        await onSaveSettings((cur) => {
          const list = cleanCustomViews(cur.customViews);
          const next = remove ? list.filter((x) => x.id !== s.id) : list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
          return { customViews: next };
        });
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    },
    [onSaveSettings],
  );

  // enregistrement automatique (vue déjà enregistrée) 2 s après le dernier changement
  const isSaved = !!spec && (savedIds.has(spec.id) || views.some((v) => v.id === spec.id));
  useEffect(() => {
    if (!spec || !isSaved) return;
    const stored = views.find((v) => v.id === spec.id);
    if (stored && JSON.stringify(stored) === JSON.stringify(spec)) return;
    setSaveState('pending');
    const t = setTimeout(() => void persist(spec), 2000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec]);

  const saveNew = async () => {
    if (!spec) return;
    setSavedIds((s) => new Set(s).add(spec.id));
    await persist(spec);
  };

  const removeView = async (id: string) => {
    const v = views.find((x) => x.id === id);
    if (!v || !window.confirm(`Supprimer la vue « ${v.name} » ? Les planches qui l’utilisent afficheront « Vue supprimée ».`)) return;
    if (spec?.id === id) setHist(null);
    await persist(v, true);
  };

  const now = () => new Date().toISOString();
  const newBlank = () => open(blankSpec(newId('cv'), now()));
  const fromPreset = (p: ViewPreset) => {
    const s = specFromPreset(p, newId('cv'), now());
    open({ ...s, name: proposeName(s, tags.labelOf) });
  };
  const duplicate = (v: CustomViewSpec) => open({ ...JSON.parse(JSON.stringify(v)), id: newId('cv'), name: `${v.name} (copie)`, createdAt: now(), updatedAt: now() });

  // ─── aperçu 2D (600 ms après le dernier changement, le calcul précédent est annulé) ───
  const previewSpec = spec ? JSON.stringify({ ...spec, name: '', updatedAt: '' }) : '';
  useEffect(() => {
    if (!spec || !active) return;
    const ctrl = new AbortController();
    setPreview((p) => ({ ...p, status: 'waiting', progress: 0 }));
    const t = setTimeout(async () => {
      setPreview((p) => ({ ...p, status: 'running', progress: 0, error: undefined }));
      try {
        const result = await computeSpecialView(
          spec,
          { scene, runner: provider.runner, glassTest, viewTags: memTags, categoryColors, log: (m) => console.info(m) },
          DEFAULT_LINE_STYLE,
          (f) => setPreview((p) => ({ ...p, progress: f })),
          ctrl.signal,
        );
        if (ctrl.signal.aborted) return;
        const svg = customViewSvg(result.lw, result.labels, { scale: 50, categoryColors, cutLineMm: spec.style.cutLine, ghostColor: ghostColorOf(spec.style.ghostTone) });
        setPreview((p) => {
          if (p.url) URL.revokeObjectURL(p.url);
          return { status: 'done', progress: 1, result, svg, url: URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' })) };
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        setPreview({ status: 'error', progress: 0, error: (e as Error).message });
      }
    }, 600);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewSpec, active, memTags]);

  const tagCounts = useMemo(() => tags.all().map((t) => ({ ...t, count: tags.nodesWithTag(t.tag).filter((id) => scopeNodes.has(id)).length })), [tags, scopeNodes]);
  const isEditor = me?.role === 'admin' || me?.role === 'technical_manager';

  const onAction = (a: ActionProposal) => {
    if (!spec) return;
    change({ ...spec, visibility: [...spec.visibility, a.rule] });
    setBubble(null);
    viewerRef.current?.setHighlightNode(null);
  };

  const memoriseTag = async (nodeId: string, tag: string | null) => {
    const n = look.byId.get(nodeId);
    if (!n?.definition || !isEditor) return;
    const rest = memTags.filter((r) => r.match.definition !== n.definition);
    const label = tag ? tags.labelOf(tag) : '';
    const next = tag ? [...rest, { tag, label, match: { definition: n.definition }, by: [me?.firstName, me?.lastName].filter(Boolean).join(' '), at: now() }] : rest;
    try {
      await vem.saveSetting('plans.viewTags', next);
      setMemTags(next);
    } catch (e) {
      window.alert(`Étiquette non enregistrée : ${(e as Error).message}`);
    }
  };

  const boxFor = (m: string): SectionBox | undefined => {
    const f = frames.get(m);
    if (!f) return undefined;
    // les pieds sont sous la boîte mesurée : 400 mm de marge en dessous, 5 mm autour
    return { frame: 'module', moduleId: m, min: [f.min[0] - 5, f.min[1] - 5, f.min[2] - 400], max: [f.max[0] + 5, f.max[1] + 5, f.max[2] + 5] };
  };

  const firstRefModule = scopeMods[0];
  const result = preview.result;

  return (
    <div className="cv-page" data-testid="custom-views">
      <aside className="cv-side">
        <div className="card">
          <div className="card-head">
            <h2>Vues spéciales</h2>
            <div className="spacer" />
            <button className="btn small primary" onClick={newBlank} data-testid="cv-new">
              ＋ Nouvelle vue
            </button>
          </div>
          <div className="card-body side-list">
            {!views.length && <div className="hint">Aucune vue enregistrée pour ce modèle.</div>}
            {views.map((v) => (
              <div key={v.id} className={`side-row${spec?.id === v.id ? ' on' : ''}`} data-testid="cv-saved">
                <span className="nm" onClick={() => open(v)} title={v.name}>
                  {v.name}
                </span>
                <button className="btn small ghost" onClick={() => duplicate(v)} title="Dupliquer">
                  ⧉
                </button>
                <button className="btn small ghost" onClick={() => void removeView(v.id)} title="Supprimer">
                  🗑
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Préréglages</h2>
          </div>
          <div className="card-body side-list">
            {[...VIEW_PRESETS, ...shared].map((p) => (
              <button key={p.key} className="cv-preset" onClick={() => fromPreset(p)} title={p.description} data-testid={`cv-preset-${p.key}`}>
                <b>{p.name}</b>
                <span className="hint">{p.description}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="cv-main">
        <div className="viewer-toolbar">
          {spec ? (
            <>
              <input type="text" value={spec.name} onChange={(e) => change({ ...spec, name: e.target.value })} style={{ width: 340 }} data-testid="cv-name" title="Nom de la vue" />
              <button className="btn small ghost" onClick={() => change({ ...spec, name: proposeName(spec, tags.labelOf) })} title="Nom proposé d’après la vue">
                ↺ Nom
              </button>
              <div className="sep" />
              <button className="btn small" onClick={undo} disabled={!hist?.past.length} title="Annuler (Ctrl+Z)">
                ↶
              </button>
              <button className="btn small" onClick={redo} disabled={!hist?.future.length} title="Rétablir (Ctrl+Y)">
                ↷
              </button>
              <div className="sep" />
              {isSaved ? (
                <span className={`save-status ${saveState}`} data-testid="cv-save-state">
                  {saveState === 'pending' ? 'Enregistrement…' : saveState === 'error' ? 'Non enregistrée' : 'Enregistrée'}
                </span>
              ) : (
                <button className="btn small primary" onClick={() => void saveNew()} data-testid="cv-save">
                  Enregistrer
                </button>
              )}
              <button
                className="btn small"
                disabled={!isSaved || preview.status !== 'done'}
                onClick={() => setSheetDialog(true)}
                title={!isSaved ? 'Enregistre d’abord la vue' : preview.status !== 'done' ? 'Attends la fin de l’aperçu' : 'Poser cette vue sur une planche'}
                data-testid="cv-add-sheet"
              >
                📐 Ajouter à une planche
              </button>
            </>
          ) : (
            <span className="hint">Choisis une vue, un préréglage ou « ＋ Nouvelle vue ».</span>
          )}
        </div>
        <div className="cv-3d">
          <div ref={holder} className="viewer-canvas" />
          {spec && bubble && (
            <ClickBubble
              ctx={ctx}
              crumbs={breadcrumb(ctx, bubble.meshId)}
              level={bubble.level}
              scopeNodes={scopeNodes}
              onLevel={(id) => setBubble({ ...bubble, level: id })}
              onHover={(id) => viewerRef.current?.setHighlightNode(id ?? bubble.level)}
              onAction={onAction}
              onClose={() => {
                setBubble(null);
                viewerRef.current?.setHighlightNode(null);
              }}
              memorise={
                look.byId.get(bubble.level)?.definition
                  ? {
                      tags: tags.all(),
                      current: memTags.find((r) => r.match.definition === look.byId.get(bubble.level)?.definition)?.tag ?? null,
                      reason: isEditor ? undefined : 'Réservé aux administrateurs et technical managers',
                      onChange: (t) => void memoriseTag(bubble.level, t),
                    }
                  : undefined
              }
            />
          )}
          {!spec && <div className="cv-empty">Clique une pièce pour la retirer une fois une vue ouverte.</div>}
        </div>
        <div className="cv-preview" data-testid="cv-preview" data-status={preview.status}>
          <div className="cv-preview-head">
            <b>Aperçu 2D</b>
            {result && (
              <span className="hint">
                {result.title}
                {result.subtitle ? ` — ${result.subtitle}` : ''} · {result.blocks.length} bloc{result.blocks.length > 1 ? 's' : ''} · {result.stats.computed} calcul{result.stats.computed > 1 ? 's' : ''}
                {result.stats.reused ? `, ${result.stats.reused} repris (identiques)` : ''} · {(result.stats.durationMs / 1000).toFixed(1)} s
              </span>
            )}
            <div className="spacer" />
            {preview.url && (
              <>
                <a className="btn small ghost" href={preview.url} target="_blank" rel="noreferrer">
                  ⤢ Plein écran
                </a>
                <button className="btn small ghost" onClick={() => spec && preview.svg && downloadText(`${spec.name.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || 'vue'}_1-50.svg`, preview.svg, 'image/svg+xml')}>
                  SVG
                </button>
              </>
            )}
          </div>
          {(preview.status === 'running' || preview.status === 'waiting') && (
            <div className="progress-row">
              <div className="progress">
                <div style={{ width: `${Math.round(preview.progress * 100)}%` }} />
              </div>
              <span className="hint">{Math.round(preview.progress * 100)} %</span>
            </div>
          )}
          {preview.status === 'error' && <div className="error-box">{preview.error}</div>}
          {result?.warnings.length ? (
            <div className="cv-warnings" data-testid="cv-warnings">
              {result.warnings.slice(0, 6).map((w, i) => (
                <div key={i} className="hint">
                  ⚠ {w.message}
                </div>
              ))}
            </div>
          ) : null}
          <div className="cv-preview-body">{preview.url ? <img src={preview.url} alt="Aperçu" data-testid="cv-preview-img" /> : <span className="hint">L’aperçu se calcule après chaque changement.</span>}</div>
        </div>
      </section>

      {sheetDialog && spec && result && <AddToSheetDialog spec={spec} result={result} scene={scene} model={model} refs={refs} modules={scopeMods} onClose={() => setSheetDialog(false)} />}
      <aside className="cv-side">
        {spec && vis ? (
          <>
            <DirectionPanel spec={spec} onChange={change} modules={scopeMods} />
            <CutsPanel spec={spec} onChange={change} refs={firstRefModule ? refs.get(firstRefModule) : undefined} refModule={firstRefModule} modules={allModules} boxFor={boxFor} />
            <RulesPanel spec={spec} onChange={change} counts={vis.counts} showRemoved={showRemoved} onShowRemoved={setShowRemoved} tags={tagCounts} />
            <LayoutPanel spec={spec} onChange={change} />
            <StylePanel spec={spec} onChange={change} />
          </>
        ) : (
          <div className="card">
            <div className="card-body hint">Les réglages de la vue apparaissent ici.</div>
          </div>
        )}
      </aside>
    </div>
  );
}
