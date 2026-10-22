// Onglet « Planches » : jeux de plans du projet, assistant de génération, éditeur.
import { useEffect, useMemo, useState } from 'react';
import type { ClassificationRules } from '../../core/types';
import { LEGEND } from '../../core/types';
import type { LoadedScene } from '../../scene/loadedScene';
import type { BrowserHlrProvider } from '../../linework/provider';
import type { GlassTest } from '../../linework/packets';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import type { DrawingSetRecord, ModelVersion, Project, SavedCapture, VemUser } from '../../api/vem';
import { PROJECT_ID, vem } from '../../api/vem';
import type { DrawingSet, Image3dItem, Paper } from '../../sheets/types';
import { emptyTitleBlock } from '../../sheets/types';
import type { InstallUnit } from '../../core/installUnits';
import { UNIT_GAP_MM, detectUnits } from '../../core/installUnits';
import type { SheetKind } from '../../sheets/generate';
import { DEFAULT_SHEET_KINDS, SHEET_KIND_LABELS, generateDrawingSet } from '../../sheets/generate';
import { projectValues, titleBlockFromProject } from '../../sheets/titleBlock';
import { cleanCustomViews } from '../../core/customViews/clean';
import { cleanViewTags } from '../../core/customViews/tags';
import type { ViewTagRule } from '../../core/customViews/types';
import { LineworkBank, dimensionDrawingSet, fitDrawingSet } from '../../sheets/bank';
import type { LegendEntry } from '../../sheets/SheetSvg';
import { useEditor } from '../../sheets/store';
import { captureOffscreen } from '../../viewer/offscreenCapture';
import { ProgressBar } from '../common';
import { SheetEditor } from './SheetEditor';
import { lowPowerDevice } from '../useDevice';
import { clearStep, markStep } from '../crashLog';
import type { PaintBundle } from './SheetEditor';
import { usePaint } from './usePaint';
import { paintContext } from '../../core/paint/resolve';
import { paintScene } from '../../linework/paintScene';
import type { PaintSettings } from '../../core/paint/types';
import type { ColorDraft } from './ColorDialog';

interface Props {
  scene: LoadedScene;
  provider: BrowserHlrProvider;
  glassTest: GlassTest;
  model?: ModelVersion;
  rules: ClassificationRules;
  framesVersion: number;
  /** captures enregistrées dans la vue 3D */
  captures: SavedCapture[];
  /** vues spéciales du modèle (réglages) : fenêtres de vue `custom` */
  customViews?: unknown[];
  categoryColors?: Record<string, string>;
  /** peinture du modèle (réglages) */
  paint?: unknown;
  onPaintSaved?: (p: PaintSettings) => void;
}

export function SheetsPage({ scene, provider, glassTest, model, rules, framesVersion, captures, customViews, categoryColors, paint, onPaintSaved }: Props) {
  const bank = useMemo(() => {
    const b = new LineworkBank(scene, provider);
    // téléphone : mémoire limitée (les vues relues du cache IndexedDB en un instant)
    if (lowPowerDevice()) b.maxEntries = 24;
    return b;
  }, [scene, provider]);
  useEffect(() => bank.invalidateKeys(), [bank, framesVersion]);
  // vues spéciales : la banque relit les vues du modèle (une vue modifiée rend ses fenêtres « obsolètes »)
  const [viewTags, setViewTags] = useState<ViewTagRule[]>([]);
  useEffect(() => {
    vem
      .getSetting<unknown>('plans.viewTags')
      .then((v) => setViewTags(cleanViewTags(v)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    const list = cleanCustomViews(customViews);
    bank.custom = { spec: (id) => list.find((v) => v.id === id), glassTest, viewTags, categoryColors };
    bank.invalidateKeys();
  }, [bank, customViews, glassTest, viewTags, categoryColors]);
  const legendColors = useMemo(() => {
    const m = new Map<string, LegendEntry>();
    for (const [key, v] of Object.entries(LEGEND)) m.set(key, { key, label: v.label, color: v.color });
    for (const c of rules.categories) if (c.color) m.set(c.key, { key: c.key, label: c.label || m.get(c.key)?.label || c.key, color: c.color });
    return m;
  }, [rules]);
  // ─── peinture du projet : résolue sur la scène, dessinée par la banque des vues ───
  const paintState = usePaint(model?.id, paint, onPaintSaved);
  const paintCtx = useMemo(() => paintContext(scene.index), [scene]);
  const painted = useMemo(
    () => (paintState.paint.zones.length ? paintScene(scene, paintState.paint, paintCtx) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, paintCtx, paintState.version],
  );
  useEffect(() => {
    bank.setPaint(painted ? { painted, colors: new Map(paintState.paint.colors.map((c) => [c.id, c])), version: String(paintState.version), isGlass: glassTest } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bank, painted, glassTest]);
  const [favorites, setFavorites] = useState<ColorDraft[]>([]);
  useEffect(() => {
    vem
      .getSetting<unknown>('plans.paintFavorites')
      .then((v) => setFavorites(Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && typeof (x as ColorDraft).hex === 'string') as ColorDraft[]) : []))
      .catch(() => {});
  }, []);
  const doc = useEditor((s) => s.doc);
  const [sets, setSets] = useState<DrawingSetRecord[]>([]);
  const [error, setError] = useState('');
  const [wizard, setWizard] = useState(false);
  const [progress, setProgress] = useState<{ label: string; fraction: number } | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [me, setMe] = useState<VemUser | null>(null);

  const refresh = async () => {
    try {
      setSets(await vem.listDrawingSets(PROJECT_ID));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    vem.project(PROJECT_ID).then(setProject, () => {});
    vem.me().then(setMe, () => {});
    return () => useEditor.getState().close();
  }, []);

  const open = async (id: string) => {
    try {
      setError('');
      const rec = await vem.getDrawingSet(id);
      const data = rec.data as DrawingSet;
      const d: DrawingSet = { ...data, id: rec.id, title: rec.title };
      if (d.modelKey !== scene.modelKey) {
        // jeu fait sur une autre analyse : les vues sont recalculées sur le modèle ouvert et signalées si elles changent
        d.modelKey = scene.modelKey;
        for (const s of d.sheets) for (const it of s.items) if (it.type === 'viewport') it.request = { ...it.request, modelId: scene.modelKey };
      }
      useEditor.getState().load(d);
    } catch (e) {
      setError(`Ouverture impossible : ${(e as Error).message}`);
    }
  };

  const remove = async (s: DrawingSetRecord) => {
    if (!window.confirm(`Supprimer le jeu de plans « ${s.title} » ?`)) return;
    await vem.deleteDrawingSet(s.id).catch((e) => setError((e as Error).message));
    await refresh();
  };

  const paintBundle: PaintBundle = {
    state: paintState,
    painted,
    ctx: paintCtx,
    favorites,
    canEditFavorites: me?.role === 'admin' || me?.role === 'technical_manager',
    userName: me ? [me.firstName, me.lastName].filter(Boolean).join(' ') : undefined,
    onFavorites: async (list) => {
      setFavorites(list);
      try {
        await vem.saveSetting('plans.paintFavorites', list);
      } catch (e) {
        window.alert(`Favoris non enregistrés : ${(e as Error).message}`);
      }
    },
  };

  if (doc) {
    return (
      <SheetEditor
        paint={paintBundle}
        scene={scene}
        bank={bank}
        glassTest={glassTest}
        legendColors={legendColors}
        captures={captures}
        onClose={() => {
          useEditor.getState().close();
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      {error && <div className="error-box">{error}</div>}
      {progress && <ProgressBar label={progress.label} fraction={progress.fraction} />}
      {wizard && !progress && (
        <Wizard
          scene={scene}
          defaultTitle={project?.name ?? index0Title(scene)}
          onCancel={() => setWizard(false)}
          onGenerate={async (opts) => {
            setError('');
            try {
              setProgress({ label: 'Mise en page des planches', fraction: 0.02 });
              markStep('Génération du jeu de plans');
              // données du projet à jour (modifiées dans VEM depuis l'ouverture ?) pour le cartouche
              const fresh = await vem.project(PROJECT_ID).catch(() => project);
              const who = me ?? (await vem.me().catch(() => null));
              const { set, captures, dimensioned } = generateDrawingSet(
                { ...opts, style: { ...DEFAULT_LINE_STYLE, facadeMarks: opts.facadeMarks, glassTransparent: !opts.opaqueGlass }, topColors: opts.topColors },
                { index: scene.index, projectId: PROJECT_ID, modelVersionId: model?.id ?? null, modelKey: scene.modelKey, titleBlock: titleBlockFromProject(fresh, who) },
              );
              if (fresh) set.projectSync = { at: new Date().toISOString(), values: projectValues(fresh) };
              await fitDrawingSet(set, bank, (done, total) => setProgress({ label: `Calcul des vues 2D (${done}/${total})`, fraction: 0.05 + 0.65 * (done / Math.max(total, 1)) }));
              setProgress({ label: 'Cotes automatiques', fraction: 0.7 });
              dimensionDrawingSet(set, bank, dimensioned);
              if (captures.length) {
                const items = new Map(set.sheets.flatMap((s) => s.items).filter((i): i is Image3dItem => i.type === 'image3d').map((i) => [i.id, i]));
                await captureOffscreen(
                  scene,
                  glassTest,
                  captures.map((c) => {
                    const it = items.get(c.itemId)!;
                    return { include: c.include, hideCategories: c.hideCategories, view: c.view, projection: c.projection, aspect: it.rect.w / it.rect.h };
                  }),
                  lowPowerDevice() ? 1400 : 2400,
                  async (i, r) => {
                    setProgress({ label: `Images 3D (${i + 1}/${captures.length})`, fraction: 0.7 + 0.25 * ((i + 1) / captures.length) });
                    const it = items.get(captures[i].itemId)!;
                    let url: string;
                    try {
                      url = (await vem.uploadAsset(PROJECT_ID, r.blob, `vue3d-${i + 1}.png`)).url;
                    } catch {
                      url = URL.createObjectURL(r.blob);
                    }
                    Object.assign(it, { url, width: r.width, height: r.height });
                  },
                );
              }
              setProgress({ label: 'Enregistrement', fraction: 0.97 });
              const rec = await vem.createDrawingSet(PROJECT_ID, { title: set.title, modelVersionId: set.modelVersionId, data: set });
              set.id = rec.id;
              setWizard(false);
              setProgress(null);
              clearStep();
              useEditor.getState().load(set);
            } catch (e) {
              clearStep();
              setProgress(null);
              setError(`Génération impossible : ${(e as Error).message}`);
            }
          }}
        />
      )}
      {!wizard && (
        <div className="card">
          <div className="card-head">
            <h2>Jeux de plans</h2>
            <div className="spacer" />
            <button className="btn primary" onClick={() => setWizard(true)}>
              ✨ Générer un jeu de plans
            </button>
          </div>
          <div className="card-body">
            {!sets.length ? (
              <div className="hint">
                Aucun jeu de plans pour ce projet. « Générer un jeu de plans » crée en une fois la couverture, les 4 vues, les élévations, le plan
                d’implantation et une planche par Viewbox, au gabarit Viewbox A1 — tout reste modifiable ensuite.
              </div>
            ) : (
              <table className="list">
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Modifié le</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sets.map((s) => (
                    <tr key={s.id}>
                      <td>{s.title}</td>
                      <td>{new Date(s.updatedAt).toLocaleString('fr-FR')}</td>
                      <td className="actions">
                        <button className="btn small primary" onClick={() => void open(s.id)}>
                          Ouvrir
                        </button>
                        <button className="btn small ghost" onClick={() => void remove(s)} title="Supprimer">
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function index0Title(scene: LoadedScene): string {
  return scene.index.source.fileName.replace(/\.[^.]+$/, '').replace(/_VEM_\d{8}-\d{4}$/, '');
}

function Wizard({
  scene,
  defaultTitle,
  onCancel,
  onGenerate,
}: {
  scene: LoadedScene;
  defaultTitle: string;
  onCancel: () => void;
  onGenerate: (o: { modules: string[]; units?: InstallUnit[]; kinds: SheetKind[]; paper: Paper; title: string; facadeMarks: boolean; opaqueGlass: boolean; topColors: boolean }) => void;
}) {
  const mods = [...scene.index.modules].sort((a, b) => a.id.localeCompare(b.id));
  const detected = useMemo(() => detectUnits(scene.index, scene.frames), [scene]);
  const [split, setSplit] = useState(true);
  const [unitNames, setUnitNames] = useState<string[]>(() => detected.map((u) => u.name));
  const [modules, setModules] = useState<Set<string>>(() => new Set(mods.map((m) => m.id)));
  const [kinds, setKinds] = useState<Set<SheetKind>>(() => new Set(DEFAULT_SHEET_KINDS));
  const [paper, setPaper] = useState<Paper>('A1');
  const [title, setTitle] = useState(defaultTitle);
  const [facadeMarks, setFacadeMarks] = useState(true);
  const [opaqueGlass, setOpaqueGlass] = useState(true);
  const [topColors, setTopColors] = useState(true);
  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };
  const units = split && detected.length > 1 ? detected.map((u, i) => ({ ...u, name: unitNames[i]?.trim() || u.name })) : undefined;
  const splitUsed = !!units && units.filter((u) => u.moduleIds.some((id) => modules.has(id))).length > 1;
  const nSheets = useMemo(
    () =>
      generateDrawingSet(
        { modules: [...modules], units, kinds: [...kinds], paper, style: DEFAULT_LINE_STYLE, title: '' },
        { index: scene.index, projectId: '', modelVersionId: null, modelKey: '', titleBlock: emptyTitleBlock() },
      ).set.sheets.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [modules, kinds, paper, split, unitNames, scene],
  );
  return (
    <div className="card">
      <div className="card-head">
        <h2>Générer un jeu de plans</h2>
      </div>
      <div className="card-body wizard">
        <div className="form-grid">
          <label>Nom du jeu de plans</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label>Format</label>
          <div className="row">
            {(['A1', 'A3'] as Paper[]).map((p) => (
              <label key={p} className="check">
                <input type="radio" checked={paper === p} onChange={() => setPaper(p)} /> {p} paysage
              </label>
            ))}
          </div>
          <label>Planches</label>
          <div className="wizard-list">
            {(Object.keys(SHEET_KIND_LABELS) as SheetKind[]).map((k) => (
              <label key={k} className="check">
                <input type="checkbox" checked={kinds.has(k)} onChange={() => setKinds((s) => toggle(s, k))} /> {SHEET_KIND_LABELS[k]}
              </label>
            ))}
          </div>
          <label>Vues de face</label>
          <label className="check" title="Hachure « // » sur les vitres visibles, croix sur les murs visibles, portes dans leur couleur de légende (modifiable ensuite vue par vue)">
            <input type="checkbox" checked={facadeMarks} onChange={(e) => setFacadeMarks(e.target.checked)} /> Repères façade : vitres //, murs en croix, portes en couleur
          </label>
          <label>Vitres</label>
          <label className="check" title="Coché : une vitre cache ce qu’il y a derrière, comme un mur (modifiable ensuite vue par vue : « Vitres transparentes »)">
            <input type="checkbox" checked={opaqueGlass} onChange={(e) => setOpaqueGlass(e.target.checked)} data-testid="wizard-opaque-glass" /> Vitres opaques : on ne voit pas à travers
          </label>
          <label>Vues du dessus</label>
          <label className="check" title="Trait épais de la couleur de la légende le long de la face qui porte l’accessoire (modifiable ensuite vue par vue)">
            <input type="checkbox" checked={topColors} onChange={(e) => setTopColors(e.target.checked)} data-testid="wizard-top-colors" /> Colorer par catégorie
          </label>
          <label>Unités</label>
          {detected.length > 1 ? (
            <div className="wizard-units">
              <label className="check">
                <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} /> Séparer en {detected.length} unités (Viewbox espacées de plus de{' '}
                {(UNIT_GAP_MM / 1000).toLocaleString('fr-FR')} m) : vue d’ensemble (vue aérienne, façades) puis toutes les planches pour chaque unité
              </label>
              {split &&
                detected.map((u, i) => (
                  <div key={u.n} className="row wizard-unit">
                    <span className="unit-n">Unité {u.n}</span>
                    <input
                      type="text"
                      value={unitNames[i] ?? ''}
                      title="Nom sur les planches"
                      onChange={(e) => setUnitNames((ns) => ns.map((n, j) => (j === i ? e.target.value : n)))}
                    />
                    <span className="hint">{u.moduleIds.filter((id) => modules.has(id)).join(', ') || 'aucune Viewbox choisie'}</span>
                  </div>
                ))}
            </div>
          ) : (
            <div className="hint">Une seule unité : toutes les Viewbox sont à {(UNIT_GAP_MM / 1000).toLocaleString('fr-FR')} m ou moins les unes des autres.</div>
          )}
          <label>Viewbox à inclure</label>
          <div className="wizard-mods">
            {mods.map((m) => (
              <label key={m.id} className="check">
                <input type="checkbox" checked={modules.has(m.id)} onChange={() => setModules((s) => toggle(s, m.id))} /> {m.id}
              </label>
            ))}
            <button className="btn small ghost" onClick={() => setModules(new Set(modules.size === mods.length ? [] : mods.map((m) => m.id)))}>
              {modules.size === mods.length ? 'Aucune' : 'Toutes'}
            </button>
          </div>
        </div>
        <div className="hint" style={{ margin: '12px 0' }}>
          {nSheets} planche(s){splitUsed ? ' : série A0 pour la vue d’ensemble, puis A1, A2… pour chaque unité' : ''}. Les vues sont calculées au mm près (lignes cachées retirées), l’échelle normalisée est choisie pour remplir chaque cadre,
          le cartouche est rempli avec les données du projet VEM. Compte de quelques secondes à quelques minutes selon la taille du
          stand (les vues déjà calculées sont réutilisées).
        </div>
        <div className="row">
          <button className="btn primary" disabled={!nSheets || (!modules.size && !kinds.has('cover'))} onClick={() => onGenerate({ modules: [...modules], units, kinds: [...kinds], paper, title: title.trim() || defaultTitle, facadeMarks, opaqueGlass, topColors })}>
            Générer
          </button>
          <button className="btn" onClick={onCancel}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
