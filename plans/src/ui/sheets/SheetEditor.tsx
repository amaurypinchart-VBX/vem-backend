// Éditeur de planches : barre d'outils, planches (vignettes), zone de dessin, propriétés, cartouche.
// Enregistrement automatique 2 s après la dernière modification ; annuler / rétablir illimités.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { Vec3 } from '../../core/views';
import { unprojectPoint } from '../../core/views';
import { resolveMeshes } from '../../core/subset';
import { displayName } from '../../core/report';
import type { LoadedScene } from '../../scene/loadedScene';
import { meshesOfNode, nodeIdOf } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import { PROJECT_ID, vem } from '../../api/vem';
import type { Image3dItem, LabelItem, PointMm, Sheet, SheetItem, TextItem, ViewportItem } from '../../sheets/types';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import { SheetSvg } from '../../sheets/SheetSvg';
import type { LegendEntry } from '../../sheets/SheetSvg';
import { useBank } from '../../sheets/bank';
import type { LineworkBank } from '../../sheets/bank';
import { actions, useEditor } from '../../sheets/store';
import { fitScale, viewportTransform } from '../../sheets/scales';
import { newId } from '../../sheets/generate';
import { templateScale } from '../../sheets/template';
import { captureOffscreen } from '../../viewer/offscreenCapture';
import type { IsoKind, Projection } from '../../viewer/SceneViewer';
import { SheetCanvas } from './SheetCanvas';
import type { SnapResult, Tool } from './SheetCanvas';
import type { SnapIndex } from '../../sheets/snap';
import { buildSnapIndex } from '../../sheets/snap';
import type { Linework2D } from '../../linework/types';
import { autoDimensionViewport } from '../../sheets/autoDim';
import type { DimensionItem } from '../../sheets/types';
import { PropertiesPanel } from './Properties';
import { downloadText } from '../common';

interface Props {
  scene: LoadedScene;
  bank: LineworkBank;
  glassTest: GlassTest;
  legendColors: Map<string, LegendEntry>;
  onClose: () => void;
}

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export function SheetEditor({ scene, bank, glassTest, legendColors, onClose }: Props) {
  const doc = useEditor((s) => s.doc)!;
  const sheetId = useEditor((s) => s.sheetId);
  const selection = useEditor((s) => s.selection);
  const version = useEditor((s) => s.version);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [tool, setTool] = useState<Tool>('select');
  const [hidden, setHidden] = useState<{ drawing?: boolean; annotations?: boolean; dims?: boolean }>({});
  const [fitSignal, setFitSignal] = useState(0);
  const [zoomSignal, setZoomSignal] = useState({ n: 0, factor: 1 });
  const [save, setSave] = useState<{ status: SaveStatus; error?: string }>({ status: 'saved' });
  const [busy, setBusy] = useState('');
  const bankTick = useBank(bank);
  const sheet = doc.sheets.find((s) => s.id === sheetId) ?? doc.sheets[0];

  const viewData = useCallback((vp: ViewportItem) => bank.data(vp), [bank, bankTick]); // eslint-disable-line react-hooks/exhaustive-deps
  const legend = useMemo(() => (sheet ? bank.legendFor(sheet, legendColors) : []), [sheet, bank, legendColors, bankTick]);

  // traits des vues de la planche affichée (et des autres, en arrière-plan)
  useEffect(() => {
    if (!sheet) return;
    const own = sheet.items.filter((i): i is ViewportItem => i.type === 'viewport');
    bank.ensure(own);
    const t = setTimeout(() => bank.ensure(doc.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport'))), 1500);
    return () => clearTimeout(t);
  }, [sheet, doc.sheets, bank]);

  // vues sans calcul de référence (nouvelles, « Recalculer ») : échelle, centrage et clé fixés dès que les traits arrivent
  useEffect(() => {
    const fixes: Array<{ sheetId: string; id: string; key: string; scale?: number; center?: [number, number] }> = [];
    for (const s of doc.sheets)
      for (const it of s.items) {
        if (it.type !== 'viewport' || (it.lineworkKey && it.scale && it.center)) continue;
        const key = bank.keyOf(it);
        const lw = bank.data(it).lw;
        if (!key || !lw) continue;
        const b = lw.boundsMm;
        fixes.push({ sheetId: s.id, id: it.id, key, scale: it.scale || fitScale(b, it.rect), center: it.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] });
      }
    if (!fixes.length) return;
    useEditor.getState().patchSilently((d) => {
      for (const f of fixes) {
        const it = d.sheets.find((s) => s.id === f.sheetId)?.items.find((i) => i.id === f.id) as ViewportItem | undefined;
        if (!it) continue;
        it.lineworkKey = f.key;
        it.scale = f.scale ?? it.scale;
        it.center = f.center;
      }
    });
  }, [bankTick, doc.sheets, bank]);

  // ─── enregistrement automatique ───
  const saveNow = useCallback(async () => {
    const d = useEditor.getState().doc;
    if (!d?.id) return;
    setSave({ status: 'saving' });
    try {
      await vem.saveDrawingSet(d.id, { title: d.title, data: { ...d, updatedAt: new Date().toISOString() } });
      setSave({ status: 'saved' });
    } catch (e) {
      setSave({ status: 'error', error: (e as Error).message });
    }
  }, []);
  useEffect(() => {
    if (!version) return;
    setSave({ status: 'pending' });
    const t = setTimeout(() => void saveNow(), 2000);
    return () => clearTimeout(t);
  }, [version, saveNow]);
  const versionRef = useRef(version);
  versionRef.current = version;
  useEffect(
    () => () => {
      if (versionRef.current) void saveNow();
    },
    [saveNow],
  );

  // ─── raccourcis clavier ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || t.isContentEditable) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) (e.preventDefault(), st.undo());
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) (e.preventDefault(), st.redo());
      else if (mod && e.key.toLowerCase() === 'c') actions.copy(st.selection);
      else if (mod && e.key.toLowerCase() === 'v') (e.preventDefault(), actions.paste());
      else if (mod && e.key.toLowerCase() === 'd') (e.preventDefault(), actions.copy(st.selection), actions.paste());
      else if (e.key === 'Delete' || e.key === 'Backspace') st.selection.length && (e.preventDefault(), actions.deleteItems(st.selection));
      else if (e.key === 'Escape') (setTool('select'), st.select([]));
      else if (e.key.startsWith('Arrow') && st.selection.length) {
        e.preventDefault();
        const step = e.shiftKey ? 5 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        actions.moveItems(st.selection, dx, dy);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─── repères : point du modèle sous le clic (accroche aux extrémités / milieux des traits) ───
  const raycaster = useMemo(() => new Raycaster(), []);
  // accroche : extrémités, milieux, centres de cercles des traits de la vue (index construit une fois par vue calculée)
  const snapIndexes = useMemo(() => new WeakMap<Linework2D, SnapIndex>(), []);
  const snapAt = (vp: ViewportItem, p: PointMm): SnapResult | null => {
    const data = bank.data(vp);
    if (!data.lw || !vp.scale) return null;
    const b = data.lw.boundsMm;
    const center = (vp.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]) as [number, number];
    const tr = viewportTransform(vp.rect, vp.scale, center);
    const [mx, my] = tr.toModel(p.x, p.y);
    let idx = snapIndexes.get(data.lw);
    if (!idx) {
      idx = buildSnapIndex(data.lw);
      snapIndexes.set(data.lw, idx);
    }
    const hit = idx.nearest(mx, my, 3 * vp.scale); // 3 mm papier
    const model: [number, number] = hit ? [hit.x, hit.y] : [mx, my];
    return { model, paper: tr.toPaper(model[0], model[1]), kind: hit?.kind ?? null };
  };

  // point 3D du modèle sous un point accroché : rayon lancé dans la direction de la vue
  const anchorAt = (vp: ViewportItem, p: PointMm): { model: [number, number]; anchor3d?: Vec3; nodeId?: string } | null => {
    const data = bank.data(vp);
    const s = snapAt(vp, p);
    if (!data.basis || !s) return null;
    const b = data.lw!.boundsMm;
    const center = (vp.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]) as [number, number];
    const [clickX, clickY] = viewportTransform(vp.rect, vp.scale, center).toModel(p.x, p.y);
    const meshes: Object3D[] = resolveMeshes(scene.index, scene.look, vp.request.subset.include, vp.request.subset.hideCategories, vp.request.subset.onlyCategories).flatMap((id) =>
      meshesOfNode(scene.objectsById.get(id)),
    );
    const cast = (x: number, y: number) => {
      const origin = new Vector3(...unprojectPoint(data.basis!, x, y, 1e7));
      raycaster.set(origin, new Vector3(...data.basis!.toward).negate());
      raycaster.firstHitOnly = true;
      return raycaster.intersectObjects(meshes, false)[0];
    };
    const hit = cast(s.model[0], s.model[1]) ?? cast(clickX, clickY);
    const depth = hit ? hit.point.x * data.basis.toward[0] + hit.point.y * data.basis.toward[1] + hit.point.z * data.basis.toward[2] : 0;
    return { model: s.model, anchor3d: unprojectPoint(data.basis, s.model[0], s.model[1], depth), nodeId: hit ? nodeIdOf(hit.object) : undefined };
  };

  /** « Coter automatiquement » des fenêtres de vue : remplace leurs cotes automatiques, ajuste échelle et centrage. */
  const autoDimension = (vps: ViewportItem[]) => {
    const results: Array<{ vp: ViewportItem; dims: DimensionItem[]; scale: number; center: [number, number] }> = [];
    let missing = 0;
    for (const vp of vps) {
      const data = bank.data(vp);
      if (!data.lw || !data.basis) {
        missing++;
        continue;
      }
      const r = autoDimensionViewport(vp, data.lw, data.basis, scene);
      results.push({ vp, ...r });
    }
    if (!results.length) {
      if (missing) window.alert('Les vues sont encore en calcul : réessaie dans un instant.');
      return;
    }
    const ids = new Set(results.map((r) => r.vp.id));
    useEditor.getState().apply('Cotes automatiques', (d) => {
      const s = d.sheets.find((x) => x.id === sheet.id);
      if (!s) return;
      s.items = s.items.filter((i) => !(i.type === 'dimension' && i.auto && ids.has(i.viewportId)));
      for (const r of results) {
        const it = s.items.find((i) => i.id === r.vp.id) as ViewportItem | undefined;
        if (it) {
          it.scale = r.scale;
          it.center = r.center;
        }
        s.items.push(...(r.dims as typeof s.items));
      }
    });
  };

  const suggestionsOf = (nodeId?: string): string[] => {
    if (!nodeId) return [];
    const item = scene.look.byId.get(scene.look.itemOf(nodeId)) ?? scene.look.byId.get(nodeId);
    if (!item) return [];
    const cat = scene.look.categoryOf(item.id);
    return [item.label, item.articleRef, cat ? legendColors.get(cat)?.label : undefined, displayName(item)].filter((x): x is string => !!x && !/^SketchUp_Instance|^VBXE-/.test(x));
  };
  const labelSuggestions = useRef(new Map<string, string[]>());

  const onPlace = (t: Tool, p: PointMm, vp: ViewportItem | null) => {
    const k = templateScale(sheet.paper);
    if (t === 'text') {
      const item: TextItem = { id: newId('t'), type: 'text', rect: { x: p.x, y: p.y, w: 80 * k, h: 10 * k }, text: 'Texte', size: 4 * k, font: 'serif' };
      actions.addItems([item], 'Ajouter un texte');
    } else if (t === 'label') {
      const a = vp ? anchorAt(vp, p) : null;
      const sugg = suggestionsOf(a?.nodeId);
      const item: LabelItem = {
        id: newId('l'),
        type: 'label',
        viewportId: vp && a?.anchor3d ? vp.id : undefined,
        anchor3d: vp ? a?.anchor3d : undefined,
        anchorPaper: vp && a?.anchor3d ? undefined : p,
        textPos: { x: p.x + 18 * k, y: p.y - 12 * k },
        text: sugg[0] ?? 'Repère',
        style: 'bold',
      };
      labelSuggestions.current.set(item.id, sugg);
      actions.addItems([item], 'Ajouter un repère');
    }
    setTool('select');
  };

  // ─── captures 3D ───
  const capture = async (item: Image3dItem | null, viewSpec: string, include?: string[]) => {
    const [view, projection] = viewSpec.split('|') as [IsoKind, Projection];
    const target = item ?? null;
    const inc = include ?? scene.index.modules.map((m) => m.nodeId).concat(scene.index.modules.flatMap((m) => m.itemIds), scene.index.commonIds);
    const rect = target?.rect ?? { x: 30, y: 60, w: 250, h: 180 };
    setBusy('Capture 3D…');
    try {
      const [r] = await captureOffscreen(scene, glassTest, [{ include: inc, hideCategories: [], view, projection, aspect: rect.w / rect.h }]);
      let url = URL.createObjectURL(r.blob);
      try {
        url = (await vem.uploadAsset(PROJECT_ID, r.blob, `capture-${Date.now()}.png`)).url;
      } catch {
        /* garde l'image locale : elle ne sera pas conservée à la réouverture */
      }
      if (target) actions.updateItem(target.id, { url, width: r.width, height: r.height } as Partial<SheetItem>, 'Nouvelle capture');
      else actions.addItems([{ id: newId('c'), type: 'image3d', rect, url, width: r.width, height: r.height, label: '3D', showLabel: false }], 'Ajouter une image 3D');
    } catch (e) {
      window.alert(`Capture impossible : ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const exportSvg = () => {
    const markup = renderToStaticMarkup(<SheetSvg sheet={sheet} titleBlock={doc.titleBlock} notes={doc.notes} legend={legend} viewData={viewData} />);
    downloadText(`${doc.titleBlock.projectNumber || doc.title}_${sheet.number}.svg`.replace(/\s+/g, '_'), markup, 'image/svg+xml');
  };

  const newSheet = () => {
    const s: Sheet = { id: newId('s'), number: '', title: sheet?.title ?? doc.title, paper: sheet?.paper ?? 'A1', orientation: 'landscape', kind: 'standard', items: [] };
    actions.addSheet(s);
  };

  const addViewport = () => {
    const k = templateScale(sheet.paper);
    const base = doc.sheets.flatMap((s) => s.items).find((i): i is ViewportItem => i.type === 'viewport');
    const include = scene.index.modules.map((m) => m.nodeId).concat(scene.index.modules.flatMap((m) => m.itemIds), scene.index.commonIds);
    const vp: ViewportItem = {
      id: newId('v'),
      type: 'viewport',
      rect: { x: 40 * k, y: 70 * k, w: 300 * k, h: 200 * k },
      request: { modelId: scene.modelKey, subset: { include }, view: { kind: 'top', frame: 'world' }, style: base?.request.style ?? { ...DEFAULT_LINE_STYLE } },
      scale: 0,
      label: 'Top side',
      showLabel: true,
      renderStyle: 'trait',
    };
    actions.addItems([vp], 'Ajouter une vue');
  };

  if (!sheet) return null;
  const sel = sheet.items.filter((i) => selection.includes(i.id));

  return (
    <div className="sheet-editor">
      <div className="sheet-toolbar">
        <button className="btn small" onClick={onClose}>
          ← Jeux de plans
        </button>
        <input
          className="set-title"
          type="text"
          value={doc.title}
          onChange={(e) => useEditor.getState().apply('Titre du jeu', (d) => void (d.title = e.target.value))}
          title="Nom du jeu de plans"
        />
        <span className="sep" />
        <button className="btn small" disabled={!canUndo} onClick={() => useEditor.getState().undo()} title="Annuler (Ctrl+Z)">
          ↶
        </button>
        <button className="btn small" disabled={!canRedo} onClick={() => useEditor.getState().redo()} title="Rétablir (Ctrl+Y)">
          ↷
        </button>
        <span className="sep" />
        <button className={`btn small${tool === 'select' ? ' primary' : ''}`} onClick={() => setTool('select')} title="Sélectionner / déplacer">
          ⬚ Sélection
        </button>
        <button className={`btn small${tool === 'label' ? ' primary' : ''}`} onClick={() => setTool('label')} title="Clique un point d'une vue : repère avec ligne d'attache">
          ↖ Repère
        </button>
        <button className={`btn small${tool === 'text' ? ' primary' : ''}`} onClick={() => setTool('text')}>
          T Texte
        </button>
        <button className={`btn small${tool === 'dim' ? ' primary' : ''}`} onClick={() => setTool('dim')} title="Cote : 2 clics sur la vue (accroche ■ extrémité ▲ milieu ● centre), 3e clic pour placer la ligne de cote (Maj = alignée)">
          ↔ Cote
        </button>
        <button className={`btn small${tool === 'chain' ? ' primary' : ''}`} onClick={() => setTool('chain')} title="Cote en chaîne : clics successifs, double-clic (ou Entrée) pour finir, puis clic pour placer">
          ⇹ Chaîne
        </button>
        <button
          className="btn small"
          onClick={() => autoDimension(sheet.items.filter((i): i is ViewportItem => i.type === 'viewport'))}
          title="Coter automatiquement toutes les vues de la planche (remplace les cotes automatiques existantes)"
        >
          📏 Cotes auto
        </button>
        <button className="btn small" onClick={addViewport} title="Nouvelle fenêtre de vue">
          ▭ Vue
        </button>
        <button className="btn small" disabled={!!busy} onClick={() => void capture(null, 'iso-sw|perspective')} title="Image 3D de tout le modèle (iso SO)">
          📷 Image 3D
        </button>
        <span className="sep" />
        {sel.length >= 2 && (
          <>
            {(
              [
                ['left', '⇤', 'Aligner à gauche'],
                ['hcenter', '↔', 'Centrer horizontalement'],
                ['right', '⇥', 'Aligner à droite'],
                ['top', '⤒', 'Aligner en haut'],
                ['vcenter', '↕', 'Centrer verticalement'],
                ['bottom', '⤓', 'Aligner en bas'],
              ] as const
            ).map(([m, icon, title]) => (
              <button key={m} className="btn small ghost" title={title} onClick={() => actions.align(selection, m)}>
                {icon}
              </button>
            ))}
            {sel.length >= 3 && (
              <>
                <button className="btn small ghost" title="Répartir horizontalement" onClick={() => actions.distribute(selection, 'h')}>
                  ⋯
                </button>
                <button className="btn small ghost" title="Répartir verticalement" onClick={() => actions.distribute(selection, 'v')}>
                  ⋮
                </button>
              </>
            )}
            <span className="sep" />
          </>
        )}
        {sel.length > 0 && (
          <>
            <button className="btn small ghost" onClick={() => actions.toggleLock(selection)} title="Verrouiller / déverrouiller">
              {sel.every((i) => i.locked) ? '🔓' : '🔒'}
            </button>
            <button className="btn small ghost" onClick={() => actions.deleteItems(selection)} title="Supprimer (Suppr)">
              🗑
            </button>
            <span className="sep" />
          </>
        )}
        <label className="check" title="Afficher les vues et images">
          <input type="checkbox" checked={!hidden.drawing} onChange={(e) => setHidden((h) => ({ ...h, drawing: !e.target.checked }))} />
          Dessin
        </label>
        <label className="check" title="Afficher les cotes">
          <input type="checkbox" checked={!hidden.dims} onChange={(e) => setHidden((h) => ({ ...h, dims: !e.target.checked }))} />
          Cotes
        </label>
        <label className="check" title="Afficher repères et textes">
          <input type="checkbox" checked={!hidden.annotations} onChange={(e) => setHidden((h) => ({ ...h, annotations: !e.target.checked }))} />
          Annotations
        </label>
        <span className="spacer" />
        <button className="btn small ghost" onClick={() => setZoomSignal((z) => ({ n: z.n + 1, factor: 1 / 1.25 }))}>
          −
        </button>
        <button className="btn small ghost" onClick={() => setFitSignal((n) => n + 1)} title="Toute la planche">
          ⤢
        </button>
        <button className="btn small ghost" onClick={() => setZoomSignal((z) => ({ n: z.n + 1, factor: 1.25 }))}>
          +
        </button>
        <button className="btn small" onClick={exportSvg} title="Planche au format SVG (A1 exact, vectoriel). Export PDF : étape suivante.">
          ⬇ SVG
        </button>
        <span className={`save-status ${save.status}`} title={save.error}>
          {busy || (save.status === 'saved' ? '✓ Enregistré' : save.status === 'saving' ? 'Enregistrement…' : save.status === 'pending' ? 'Modifié' : '⚠ Non enregistré')}
        </span>
      </div>

      <div className="sheet-body">
        <aside className="sheet-pages">
          {doc.sheets.map((s, i) => (
            <div key={s.id} className={`sheet-thumb${s.id === sheet.id ? ' on' : ''}`} onClick={() => useEditor.getState().setSheet(s.id)}>
              <SheetSvg sheet={s} titleBlock={doc.titleBlock} notes={doc.notes} legend={[]} viewData={viewData} thumbnail style={{ width: '100%', height: 'auto', display: 'block' }} />
              <div className="thumb-foot">
                <b>{s.number}</b>
                <span className="thumb-title">{s.kind === 'cover' ? 'Couverture' : (s.items.find((x) => x.type === 'viewport' && (x as ViewportItem).label) as ViewportItem | undefined)?.label ?? s.title}</span>
                {s.id === sheet.id && (
                  <span className="thumb-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn small ghost" disabled={i === 0} onClick={() => actions.moveSheet(s.id, -1)} title="Monter">
                      ↑
                    </button>
                    <button className="btn small ghost" disabled={i === doc.sheets.length - 1} onClick={() => actions.moveSheet(s.id, 1)} title="Descendre">
                      ↓
                    </button>
                    <button className="btn small ghost" onClick={() => actions.duplicateSheet(s.id)} title="Dupliquer">
                      ⧉
                    </button>
                    <button
                      className="btn small ghost"
                      disabled={doc.sheets.length === 1}
                      onClick={() => window.confirm(`Supprimer la planche ${s.number} ?`) && actions.deleteSheet(s.id)}
                      title="Supprimer"
                    >
                      🗑
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
          <button className="btn small" onClick={newSheet} style={{ width: '100%', justifyContent: 'center' }}>
            + Planche
          </button>
        </aside>
        <SheetCanvas
          doc={doc}
          sheet={sheet}
          legend={legend}
          viewData={viewData}
          tool={tool}
          hiddenLayers={hidden}
          onPlace={onPlace}
          snapAt={snapAt}
          pointAt={anchorAt}
          fitSignal={fitSignal}
          zoomSignal={zoomSignal}
        />
        <PropertiesPanel
          doc={doc}
          sheet={sheet}
          scene={scene}
          viewData={viewData}
          suggestionsFor={(l) => labelSuggestions.current.get(l.id) ?? []}
          onRecapture={(item, v) => void capture(item, v)}
          onAutoDimension={(vp) => autoDimension([vp])}
        />
      </div>
    </div>
  );
}
