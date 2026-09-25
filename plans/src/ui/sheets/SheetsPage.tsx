// Onglet « Planches » : jeux de plans du projet, assistant de génération, éditeur.
import { useEffect, useMemo, useState } from 'react';
import type { ClassificationRules } from '../../core/types';
import { LEGEND } from '../../core/types';
import type { LoadedScene } from '../../scene/loadedScene';
import type { BrowserHlrProvider } from '../../linework/provider';
import type { GlassTest } from '../../linework/packets';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import type { DrawingSetRecord, ModelVersion, Project, VemUser } from '../../api/vem';
import { PROJECT_ID, vem } from '../../api/vem';
import type { DrawingSet, Image3dItem, Paper } from '../../sheets/types';
import type { SheetKind } from '../../sheets/generate';
import { DEFAULT_SHEET_KINDS, SHEET_KIND_LABELS, generateDrawingSet } from '../../sheets/generate';
import { titleBlockFromProject } from '../../sheets/titleBlock';
import { LineworkBank, fitDrawingSet } from '../../sheets/bank';
import type { LegendEntry } from '../../sheets/SheetSvg';
import { useEditor } from '../../sheets/store';
import { captureOffscreen } from '../../viewer/offscreenCapture';
import { ProgressBar } from '../common';
import { SheetEditor } from './SheetEditor';

interface Props {
  scene: LoadedScene;
  provider: BrowserHlrProvider;
  glassTest: GlassTest;
  model?: ModelVersion;
  rules: ClassificationRules;
  framesVersion: number;
}

export function SheetsPage({ scene, provider, glassTest, model, rules, framesVersion }: Props) {
  const bank = useMemo(() => new LineworkBank(scene, provider), [scene, provider]);
  useEffect(() => bank.invalidateKeys(), [bank, framesVersion]);
  const legendColors = useMemo(() => {
    const m = new Map<string, LegendEntry>();
    for (const [key, v] of Object.entries(LEGEND)) m.set(key, { key, label: v.label, color: v.color });
    for (const c of rules.categories) if (c.color) m.set(c.key, { key: c.key, label: c.label || m.get(c.key)?.label || c.key, color: c.color });
    return m;
  }, [rules]);
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

  if (doc) {
    return (
      <SheetEditor
        scene={scene}
        bank={bank}
        glassTest={glassTest}
        legendColors={legendColors}
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
              const { set, captures } = generateDrawingSet(
                { ...opts, style: DEFAULT_LINE_STYLE },
                { index: scene.index, projectId: PROJECT_ID, modelVersionId: model?.id ?? null, modelKey: scene.modelKey, titleBlock: titleBlockFromProject(project, me) },
              );
              await fitDrawingSet(set, bank, (done, total) => setProgress({ label: `Calcul des vues 2D (${done}/${total})`, fraction: 0.05 + 0.65 * (done / Math.max(total, 1)) }));
              if (captures.length) {
                const items = new Map(set.sheets.flatMap((s) => s.items).filter((i): i is Image3dItem => i.type === 'image3d').map((i) => [i.id, i]));
                await captureOffscreen(
                  scene,
                  glassTest,
                  captures.map((c) => {
                    const it = items.get(c.itemId)!;
                    return { include: c.include, hideCategories: c.hideCategories, view: c.view, projection: c.projection, aspect: it.rect.w / it.rect.h };
                  }),
                  2400,
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
              useEditor.getState().load(set);
            } catch (e) {
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
  onGenerate: (o: { modules: string[]; kinds: SheetKind[]; paper: Paper; title: string }) => void;
}) {
  const mods = [...scene.index.modules].sort((a, b) => a.id.localeCompare(b.id));
  const [modules, setModules] = useState<Set<string>>(() => new Set(mods.map((m) => m.id)));
  const [kinds, setKinds] = useState<Set<SheetKind>>(() => new Set(DEFAULT_SHEET_KINDS));
  const [paper, setPaper] = useState<Paper>('A1');
  const [title, setTitle] = useState(defaultTitle);
  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };
  const nSheets =
    (kinds.has('cover') ? 1 : 0) +
    (kinds.has('fourViews') ? 1 : 0) +
    (kinds.has('longSides') ? 1 : 0) +
    (kinds.has('shortSides') ? 1 : 0) +
    (kinds.has('implantation') ? 1 : 0) +
    (kinds.has('assembly') ? 1 : 0) +
    (kinds.has('levels') ? scene.index.levels.length : 0) +
    (kinds.has('perModule') ? modules.size : 0);
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
          {nSheets} planche(s). Les vues sont calculées au mm près (lignes cachées retirées), l’échelle normalisée est choisie pour remplir chaque cadre,
          le cartouche est rempli avec les données du projet VEM. Compte de quelques secondes à quelques minutes selon la taille du
          stand (les vues déjà calculées sont réutilisées).
        </div>
        <div className="row">
          <button className="btn primary" disabled={!nSheets || (!modules.size && !kinds.has('cover'))} onClick={() => onGenerate({ modules: [...modules], kinds: [...kinds], paper, title: title.trim() || defaultTitle })}>
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
