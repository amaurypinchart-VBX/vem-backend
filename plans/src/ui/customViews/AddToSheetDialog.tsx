// « 📐 Ajouter à une planche » : pose une vue spéciale dans un jeu de plans du projet (ou un nouveau jeu) — une planche
// avec tous les blocs, une planche par bloc ou une mosaïque —, échelle, cotes automatiques, repères de coupe A–A et
// niveaux sur les autres vues du jeu. Si le jeu est ouvert dans l'onglet Planches, l'ajout passe par l'éditeur
// (annulable, enregistré automatiquement).
import { useEffect, useMemo, useState } from 'react';
import type { CustomViewSpec } from '../../core/customViews/types';
import type { CustomViewResult } from '../../linework/customView';
import type { LoadedScene } from '../../scene/loadedScene';
import type { ModuleRefs } from '../../core/customViews/refs';
import { cutLevels, sectionMarks } from '../../core/customViews/marks';
import { subsetForModules } from '../../core/subset';
import type { DrawingSetRecord, ModelVersion, Project, VemUser } from '../../api/vem';
import { PROJECT_ID, vem } from '../../api/vem';
import type { CustomSheetMode } from '../../sheets/customSheets';
import { addCustomSheets, customViewSheets } from '../../sheets/customSheets';
import { autoDimensionViewport } from '../../sheets/autoDim';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import type { DrawingSet, Paper } from '../../sheets/types';
import { DEFAULT_GENERAL_NOTES } from '../../sheets/template';
import { titleBlockFromProject } from '../../sheets/titleBlock';
import { actions as sheetActions, useEditor } from '../../sheets/store';

interface Props {
  spec: CustomViewSpec;
  result: CustomViewResult;
  scene: LoadedScene;
  model?: ModelVersion;
  refs: ReadonlyMap<string, ModuleRefs>;
  modules: string[];
  onClose: () => void;
}

const SCALES = [0, 10, 20, 25, 50, 75, 100];

export function AddToSheetDialog({ spec, result, scene, model, refs, modules, onClose }: Props) {
  const [sets, setSets] = useState<DrawingSetRecord[]>([]);
  const [target, setTarget] = useState('');
  const [paper, setPaper] = useState<Paper>('A1');
  const [mode, setMode] = useState<CustomSheetMode>(result.blocks.length > 1 ? 'per-block' : 'one');
  const [perSheet, setPerSheet] = useState(4);
  const [scale, setScale] = useState(50);
  const [dims, setDims] = useState(spec.camera.dir !== 'iso' && spec.camera.dir !== 'iso-below' && spec.camera.dir !== 'custom');
  const [chosen, setChosen] = useState<string[]>(result.blocks.map((b) => b.key));
  const marks = useMemo(() => sectionMarks(spec, scene.frames, refs, modules), [spec, scene, refs, modules]);
  const levels = useMemo(() => cutLevels(spec, scene.frames, refs, modules), [spec, scene, refs, modules]);
  const [withMarks, setWithMarks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!PROJECT_ID) return;
    vem
      .listDrawingSets(PROJECT_ID)
      .then((l) => {
        setSets(l);
        const open = useEditor.getState().doc;
        setTarget(open?.id && l.some((x) => x.id === open.id) ? open.id : l.find((x) => x.modelVersionId === model?.id)?.id ?? l[0]?.id ?? '');
      })
      .catch(() => {});
  }, [model?.id]);

  const add = async () => {
    setBusy(true);
    setError('');
    try {
      const nodeIds = (mods: string[]) => subsetForModules(scene.index, mods);
      const sheets = customViewSheets(
        spec,
        result.blocks.map((b) => ({ key: b.key, title: b.title, modules: b.modules, lw: b.lw, basis: b.basis, view: b.view })),
        { paper, mode, perSheet, scale, blocks: chosen, subtitle: result.subtitle, style: DEFAULT_LINE_STYLE, modelKey: scene.modelKey, dims },
        {
          include: (b) => nodeIds(b.modules),
          autoDim: (vp, b, minScale) => {
            try {
              return autoDimensionViewport(vp, b.lw, b.basis, scene, minScale);
            } catch {
              return null;
            }
          },
        },
      );
      const m = withMarks ? marks : [];
      const lv = withMarks ? levels : [];
      const open = useEditor.getState().doc;
      if (target && open?.id === target) {
        sheetActions.editDoc('Vue spéciale', (d) => addCustomSheets(d as DrawingSet, sheets, m, lv));
        setInfo(`${sheets.length} planche${sheets.length > 1 ? 's' : ''} ajoutée${sheets.length > 1 ? 's' : ''} au jeu « ${open.title} » (onglet Planches A1).`);
      } else if (target) {
        const rec = await vem.getDrawingSet(target);
        const data = rec.data as DrawingSet;
        addCustomSheets(data, sheets, m, lv);
        await vem.saveDrawingSet(rec.id, { title: rec.title, data: { ...data, updatedAt: new Date().toISOString() } });
        setInfo(`${sheets.length} planche${sheets.length > 1 ? 's' : ''} ajoutée${sheets.length > 1 ? 's' : ''} au jeu « ${rec.title} » (onglet Planches A1).`);
      } else {
        if (!PROJECT_ID) throw new Error('projet VEM inconnu');
        let project: Project | null = null;
        let me: VemUser | null = null;
        try {
          [project, me] = await Promise.all([vem.project(PROJECT_ID), vem.me()]);
        } catch {
          /* cartouche vide */
        }
        const title = `Vues spéciales ${project?.name ?? ''}`.trim();
        const data: DrawingSet = {
          id: '',
          projectId: PROJECT_ID,
          modelVersionId: model?.id ?? null,
          modelKey: scene.modelKey,
          title,
          templateId: 'viewbox',
          titleBlock: titleBlockFromProject(project, me),
          notes: DEFAULT_GENERAL_NOTES,
          sheets: [],
          revision: 0,
          updatedAt: new Date().toISOString(),
        };
        addCustomSheets(data, sheets, [], []);
        const rec = await vem.createDrawingSet(PROJECT_ID, { title, modelVersionId: model?.id ?? null, data });
        setTarget(rec.id);
        setSets(await vem.listDrawingSets(PROJECT_ID));
        setInfo(`Nouveau jeu « ${title} » créé avec ${sheets.length} planche${sheets.length > 1 ? 's' : ''} (onglet Planches A1).`);
      }
    } catch (e) {
      setError(`Ajout impossible : ${(e as Error).message}`);
    }
    setBusy(false);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal dxf-dialog" onClick={(e) => e.stopPropagation()} data-testid="cv-sheet-dialog">
        <div className="card-head">
          <h2>Ajouter « {spec.name} » à une planche</h2>
        </div>
        <div className="modal-body">
          <fieldset>
            <legend>Jeu de plans</legend>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="">＋ Nouveau jeu de plans</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </fieldset>
          <fieldset>
            <legend>Planches</legend>
            <label className="check">
              <input type="radio" checked={mode === 'one'} onChange={() => setMode('one')} /> Une planche (tous les blocs)
            </label>
            <label className="check">
              <input type="radio" checked={mode === 'per-block'} onChange={() => setMode('per-block')} /> Une planche par bloc (Viewbox identiques regroupées)
            </label>
            <label className="check">
              <input type="radio" checked={mode === 'mosaic'} onChange={() => setMode('mosaic')} /> Mosaïque de
              <input type="number" min={2} max={9} value={perSheet} onChange={(e) => setPerSheet(Math.max(2, Math.min(9, Number(e.target.value) || 4)))} style={{ width: 54 }} /> vues par planche
            </label>
            {result.blocks.length > 1 && (
              <div className="row">
                {result.blocks.map((b) => (
                  <label key={b.key} className="check">
                    <input type="checkbox" checked={chosen.includes(b.key)} onChange={(e) => setChosen((c) => (e.target.checked ? [...c, b.key] : c.filter((x) => x !== b.key)))} />
                    {b.title}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>Mise en page</legend>
            <div className="row">
              <select value={paper} onChange={(e) => setPaper(e.target.value as Paper)} style={{ width: 90 }}>
                <option value="A1">A1</option>
                <option value="A3">A3</option>
              </select>
              <select value={scale} onChange={(e) => setScale(Number(e.target.value))} style={{ width: 130 }} data-testid="cv-sheet-scale">
                {SCALES.map((s) => (
                  <option key={s} value={s}>
                    {s ? `1:${s}` : 'ajustée au cadre'}
                  </option>
                ))}
              </select>
            </div>
            <label className="check">
              <input type="checkbox" checked={dims} onChange={(e) => setDims(e.target.checked)} /> Cotes automatiques (encombrement de chaque bloc)
            </label>
            {(marks.length > 0 || levels.length > 0) && (
              <label className="check">
                <input type="checkbox" checked={withMarks} onChange={(e) => setWithMarks(e.target.checked)} /> Repères de coupe sur les autres vues du jeu
                {marks.length ? ` (${[...new Set(marks.map((m) => `${m.label}–${m.label}`))].join(', ')} sur les vues en plan)` : ''}
                {levels.length ? ` (niveau ${levels.map((l) => l.text).join(', ')} sur les élévations)` : ''}
              </label>
            )}
            <div className="hint">Titre : « {spec.name} — 1:{scale || '…'} »{result.subtitle ? `, sous-titre « ${result.subtitle} »` : ''}.</div>
          </fieldset>
          {info && <div className="hint" style={{ color: 'var(--ok)' }} data-testid="cv-sheet-info">{info}</div>}
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="modal-foot">
          <div className="spacer" />
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
          <button className="btn primary" disabled={busy || !chosen.length} onClick={() => void add()} data-testid="cv-sheet-add">
            {busy ? 'Ajout…' : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}
