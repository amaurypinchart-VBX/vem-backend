// Éditeur de planches : barre d'outils, planches (vignettes), zone de dessin, propriétés, cartouche.
// Enregistrement automatique 2 s après la dernière modification ; annuler / rétablir illimités.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { SavedCapture } from '../../api/vem';
import type { Image3dItem, LabelItem, PointMm, Sheet, SheetItem, SymbolItem, SymbolLegendItem, TextItem, ViewportItem } from '../../sheets/types';
import { SYMBOL_BY_KEY, SYMBOL_SIZE, alongWall, orientToWall } from '../../sheets/symbols';
import { SymbolPalette } from './SymbolPalette';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import { SheetSvg, itemBox } from '../../sheets/SheetSvg';
import type { LegendEntry } from '../../sheets/SheetSvg';
import { useBank } from '../../sheets/bank';
import type { LineworkBank } from '../../sheets/bank';
import { actions, useEditor } from '../../sheets/store';
import { fitScale, viewportTransform } from '../../sheets/scales';
import { newId } from '../../sheets/generate';
import { DRAW_AREA, scaleRect, templateScale } from '../../sheets/template';
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
import { downloadBlob, downloadText } from '../common';
import { CapturePicker } from './CapturePicker';
import { DxfDialog } from './DxfDialog';
import type { DxfChoice } from './DxfDialog';
import type { PickableImage } from '../../sheets/images';
import { insertRect, otherImagesOfSet } from '../../sheets/images';
import { DETAILS, detailRect } from '../../sheets/details';
import type { ProjectField, ProjectValues } from '../../sheets/titleBlock';
import { PROJECT_FIELDS, PROJECT_FIELD_LABELS, projectChanges, projectValues } from '../../sheets/titleBlock';
import type { Person, TitleBlockData } from '../../sheets/types';
import { freshImport, NewVersionError } from '../newVersion';
import { retargetSheet, sheetModule } from '../../sheets/duplicate';
import { SheetSelectionBar, ModulePickDialog } from './SheetSelectionBar';
import { useDevice } from '../useDevice';
import { ItemMenu } from './ItemMenu';
import { FileReadyDialog } from '../FileReady';
import type { ReadyFile } from '../FileReady';
import { deliveryPlan, estimatePdfMb, tooHeavyForPhone } from '../deliver';
import type { PaintState } from './usePaint';
import type { PaintedScene } from '../../linework/paintScene';
import { paintScene } from '../../linework/paintScene';
import type { PaintRegion } from '../../linework/paintOverlay';
import { computePaintOverlay } from '../../linework/paintOverlay';
import type { PaintContext } from '../../core/paint/resolve';
import type { PaintColor, PaintOp, PaintSettings, PaintZone } from '../../core/paint/types';
import { colorCode, nextTag, reassignOps } from '../../core/paint/ops';
import type { TargetKey, TargetOption } from '../../core/paint/targets';
import { paintBreadcrumb, targetOptions, zoneLabel } from '../../core/paint/targets';
import type { PaintFinish } from '../../core/paint/types';
import type { PaintSheetInfo } from '../../sheets/paintSheet';
import type { PaintLegendItem } from '../../sheets/types';
import type { FacePick } from './paintPick';
import { pickFace } from './paintPick';
import { PaintPanel } from './PaintPanel';
import type { PaintMode } from './PaintPanel';
import { PaintBubble } from './PaintBubble';
import { ColorDialog } from './ColorDialog';
import type { ColorDraft } from './ColorDialog';

/** Peinture du projet (SheetsPage) : état, résolution sur la scène, favoris partagés. */
export interface PaintBundle {
  state: PaintState;
  painted: PaintedScene | null;
  ctx: PaintContext;
  favorites: ColorDraft[];
  canEditFavorites: boolean;
  userName?: string;
  onFavorites: (list: ColorDraft[]) => void;
}

const uid = (p: string) => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : newId(p));

interface Props {
  paint?: PaintBundle;
  scene: LoadedScene;
  bank: LineworkBank;
  glassTest: GlassTest;
  legendColors: Map<string, LegendEntry>;
  captures: SavedCapture[];
  onClose: () => void;
}

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

export function SheetEditor({ scene, bank, glassTest, legendColors, captures, onClose, paint }: Props) {
  const doc = useEditor((s) => s.doc)!;
  const sheetId = useEditor((s) => s.sheetId);
  const selection = useEditor((s) => s.selection);
  const sheetSelection = useEditor((s) => s.sheetSelection);
  const version = useEditor((s) => s.version);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const [tool, setTool] = useState<Tool>('select');
  const [symbolKey, setSymbolKey] = useState('prise-2pt');
  const [hidden, setHidden] = useState<{ drawing?: boolean; annotations?: boolean; dims?: boolean }>({});
  const [fitSignal, setFitSignal] = useState(0);
  const [zoomSignal, setZoomSignal] = useState({ n: 0, factor: 1 });
  const [save, setSave] = useState<{ status: SaveStatus; error?: string }>({ status: 'saved' });
  const [busy, setBusy] = useState('');
  /** cartouche : champs changés dans le projet VEM depuis la dernière reprise */
  const [projectUpdate, setProjectUpdate] = useState<{ fresh: ProjectValues; fields: ProjectField[] } | null>(null);
  const [syncMessage, setSyncMessage] = useState('');
  /** choix d'une image 3D : image à remplacer, ou null = nouvelle image */
  const [picker, setPicker] = useState<{ itemId: string | null } | null>(null);
  const [dxfOpen, setDxfOpen] = useState(false);
  // glisser-déposer des planches dans la colonne des vignettes
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  // sélection de planches : Ctrl / Cmd + clic, Maj + clic (plage), mode « ☑ Sélectionner » (doigt : appui long)
  const [selectMode, setSelectMode] = useState(false);
  const lastThumb = useRef<string | null>(null);
  const longPress = useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  /** « Dupliquer pour d'autres Viewbox » : planche source */
  const [retarget, setRetarget] = useState<Sheet | null>(null);
  // téléphone / tablette : consultation par défaut (« ✏️ Édition » pour déplacer), menus en tiroirs
  const device = useDevice();
  const touchLayout = device.isTouch && device.isNarrow;
  const [editMode, setEditMode] = useState(false);
  const readOnly = touchLayout && !editMode;
  const [moreOpen, setMoreOpen] = useState(false);
  const [propsOpen, setPropsOpen] = useState(false);
  const [pagesOpen, setPagesOpen] = useState(true);
  const [itemMenu, setItemMenu] = useState<{ item: SheetItem; x: number; y: number } | null>(null);
  // ─── peinture ───
  const [paintMode, setPaintMode] = useState<PaintMode>('brush');
  const [activeColor, setActiveColor] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [colorDialog, setColorDialog] = useState<{ edit?: PaintColor } | null>(null);
  const [bubble, setBubble] = useState<{ vp: ViewportItem; pick: FacePick; options: TargetOption[]; choice: TargetKey; at: { x: number; y: number } } | null>(null);
  const [quick, setQuick] = useState<{ on: boolean; key: TargetKey }>({ on: false, key: 'face-box' });
  const [toast, setToast] = useState('');
  const lastPointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const rec = (e: PointerEvent) => (lastPointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener('pointerdown', rec, true);
    return () => window.removeEventListener('pointerdown', rec, true);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const paintRef = useRef(paint);
  paintRef.current = paint;
  /** fichier calculé, à remettre (téléphone : écran « PDF prêt ») */
  const [ready, setReady] = useState<ReadyFile | null>(null);
  const cancelExport = useRef(false);
  const deliver = (name: string, blob: Blob) => {
    if (deliveryPlan(device) === 'download') downloadBlob(name, blob);
    else setReady({ name, blob });
  };
  const bankTick = useBank(bank);
  const sheet = doc.sheets.find((s) => s.id === sheetId) ?? doc.sheets[0];

  // aperçu (face sous le doigt) et zone choisie dans le panneau : contour orange par-dessus la vue
  const [paintPreview, setPaintPreview] = useState<Map<string, PaintRegion[]> | null>(null);
  const viewData = useCallback(
    (vp: ViewportItem) => {
      const d = bank.data(vp);
      const pv = paintPreview?.get(vp.id);
      return pv?.length ? { ...d, paintPreview: pv } : d;
    },
    [bank, bankTick, paintPreview], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // DRAWING LEGEND : toutes les couleurs de catégorie (Viewbox + catégories personnalisées), sur chaque planche
  const legend = useMemo(() => [...legendColors.values()], [legendColors]);

  // traits des vues de la planche affichée (et des autres, en arrière-plan)
  useEffect(() => {
    if (!sheet) return;
    const own = sheet.items.filter((i): i is ViewportItem => i.type === 'viewport');
    bank.ensure(own);
    bank.ensurePaint(own);
    const t = setTimeout(() => bank.ensure(doc.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport'))), 1500);
    return () => clearTimeout(t);
  }, [sheet, doc.sheets, bank]);
  useEffect(() => {
    if (sheet) bank.ensurePaint(sheet.items.filter((i): i is ViewportItem => i.type === 'viewport'));
  }, [bankTick, sheet, bank]);

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

  // ─── cartouche ← projet VEM ───
  const applyProject = useCallback((fresh: ProjectValues, fields: ProjectField[]) => {
    const sync = { at: new Date().toISOString(), values: fresh };
    const st = useEditor.getState();
    if (fields.length)
      st.apply('Cartouche repris du projet', (d) => {
        for (const f of fields) (d.titleBlock as Record<ProjectField, unknown>)[f] = structuredClone(fresh[f]);
        d.projectSync = sync;
      });
    else st.patchSilently((d) => void (d.projectSync = sync));
    setProjectUpdate(null);
    setSyncMessage(fields.length ? `✓ Repris du projet : ${fields.map((f) => PROJECT_FIELD_LABELS[f]).join(', ')}` : '✓ Le cartouche est déjà à jour avec le projet');
  }, []);
  /** automatique à l'ouverture : propose ce qui a changé dans VEM ; à la demande : reprend tous les champs du projet */
  const syncProject = useCallback(
    async (manual: boolean) => {
      try {
        const fresh = projectValues(await vem.project(PROJECT_ID));
        const d = useEditor.getState().doc;
        if (!d) return;
        if (manual) applyProject(fresh, PROJECT_FIELDS.filter((f) => JSON.stringify(d.titleBlock[f]) !== JSON.stringify(fresh[f])));
        else {
          const fields = projectChanges(d.titleBlock, fresh, d.projectSync?.values);
          setProjectUpdate(fields.length ? { fresh, fields } : null);
        }
      } catch (e) {
        if (manual) setSyncMessage(`⚠ Projet VEM illisible : ${(e as Error).message}`);
      }
    },
    [applyProject],
  );
  useEffect(() => {
    setSyncMessage('');
    void syncProject(false);
  }, [doc.id, syncProject]);

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
      const pt = toolRef.current === 'paint' ? paintRef.current?.state : undefined;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) (e.preventDefault(), pt ? pt.undo() : st.undo());
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) (e.preventDefault(), pt ? pt.redo() : st.redo());
      else if (mod && e.key.toLowerCase() === 'c') actions.copy(st.selection);
      else if (mod && e.key.toLowerCase() === 'v') (e.preventDefault(), actions.paste());
      else if (mod && e.key.toLowerCase() === 'd') (e.preventDefault(), actions.copy(st.selection), actions.paste());
      else if (e.key === 'Delete' || e.key === 'Backspace') st.selection.length && (e.preventDefault(), actions.deleteItems(st.selection));
      else if (e.key === 'Escape') {
        if (toolRef.current === 'paint') {
          setBubble(null);
          setPaintPreview(null);
          return;
        }
        setTool('select');
        st.select([]);
      }
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

  /**
   * Autre sous-ensemble pour une vue (unités affichées) : la vue est calculée d'abord, puis sous-ensemble, échelle,
   * centrage et cotes automatiques (refaites si la vue en avait) changent en une seule action (un seul Ctrl+Z).
   */
  const setViewportInclude = async (vp: ViewportItem, include: string[], label: string) => {
    const next: ViewportItem = { ...vp, request: { ...vp.request, subset: { ...vp.request.subset, include } } };
    setBusy('Calcul de la vue…');
    const r = await bank.load(next);
    setBusy('');
    const data = bank.data(next);
    if (!r || !data.basis) {
      window.alert(`Vue impossible à calculer${data.error ? ` : ${data.error}` : ''}`);
      return;
    }
    const sheetOf = doc.sheets.find((x) => x.items.some((i) => i.id === vp.id));
    const hadAuto = !!sheetOf?.items.some((i) => i.type === 'dimension' && i.auto && i.viewportId === vp.id);
    const dimmed = hadAuto ? autoDimensionViewport(next, r.lw, data.basis, scene) : null;
    const b = r.lw.boundsMm;
    useEditor.getState().apply(label, (d) => {
      const s = d.sheets.find((x) => x.id === sheetOf?.id);
      const it = s?.items.find((i) => i.id === vp.id) as ViewportItem | undefined;
      if (!s || !it) return;
      it.request = next.request;
      it.lineworkKey = r.key;
      it.scale = dimmed?.scale ?? fitScale(b, it.rect);
      it.center = dimmed?.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
      s.items = s.items.filter((i) => !(i.type === 'dimension' && i.auto && i.viewportId === vp.id));
      if (dimmed) s.items.push(...(dimmed.dims as typeof s.items));
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

  /** Traits visibles d'une vue près d'un point de la planche (mm papier) : murs pour orienter les symboles. */
  const paperSegments = (vp: ViewportItem, p: PointMm, tol: number): Array<[number, number, number, number]> => {
    const data = bank.data(vp);
    const lw = data.lw;
    if (!lw || !vp.scale) return [];
    const b = lw.boundsMm;
    const tr = viewportTransform(vp.rect, vp.scale, vp.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]);
    const [mx, my] = tr.toModel(p.x, p.y);
    const r = tol * vp.scale;
    const out: Array<[number, number, number, number]> = [];
    for (const layer of lw.layers) {
      if (layer.key !== 'visible' && layer.key !== 'silhouette' && layer.key !== 'cut') continue;
      for (const pl of layer.polylines)
        for (let i = 0; i + 3 < pl.length; i += 2) {
          const [x0, y0, x1, y1] = [pl[i], pl[i + 1], pl[i + 2], pl[i + 3]];
          if (Math.max(x0, x1) < mx - r || Math.min(x0, x1) > mx + r || Math.max(y0, y1) < my - r || Math.min(y0, y1) > my + r) continue;
          const a = tr.toPaper(x0, y0);
          const c = tr.toPaper(x1, y1);
          out.push([a.x, a.y, c.x, c.y]);
        }
    }
    return out;
  };

  /** Légende des symboles, en bas à droite de la zone de dessin (déplaçable). */
  const symbolLegend = (): SymbolLegendItem => {
    const k = templateScale(sheet.paper);
    const w = 78;
    const h = 64;
    return { id: newId('g'), type: 'symbolLegend', rect: scaleRect({ x: DRAW_AREA.x + DRAW_AREA.w - w - 4, y: DRAW_AREA.y + DRAW_AREA.h - h - 4, w, h }, k), lang: 'en', counts: true };
  };

  const placeSymbol = (p: PointMm, vp: ViewportItem | null) => {
    const def = SYMBOL_BY_KEY.get(symbolKey);
    if (!def) return;
    const k = templateScale(sheet.paper);
    const size = SYMBOL_SIZE * k;
    let at = p;
    let rotation = 0;
    const data = vp ? bank.data(vp) : null;
    if (vp && data?.lw && vp.scale) {
      const tol = 6 * k;
      const segs = paperSegments(vp, p, tol);
      const o = def.linear ? alongWall(p, segs, tol, size * 0.35) : def.wall ? orientToWall(p, segs, tol, size) : null;
      if (o) [at, rotation] = [o.at, o.rotation];
    }
    let model: [number, number] | undefined;
    if (vp && vp.scale && data?.lw) {
      const b = data.lw.boundsMm;
      model = viewportTransform(vp.rect, vp.scale, vp.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]).toModel(at.x, at.y);
    }
    const item: SymbolItem = {
      id: newId('y'),
      type: 'symbol',
      symbol: def.key,
      at,
      ...(rotation ? { rotation } : {}),
      ...(vp && model ? { viewportId: vp.id, model } : {}),
      ...(def.note ? { note: def.note } : {}),
      ...(def.linear ? { length: def.length } : {}),
    };
    const items: SheetItem[] = [item];
    if (!sheet.items.some((i) => i.type === 'symbolLegend')) items.push(symbolLegend());
    actions.addItems(items, 'Poser un symbole');
  };

  // ─── peinture : clic sur une face ───
  const paintLegend = (): PaintLegendItem => {
    const k = templateScale(sheet.paper);
    const w = 90 * k;
    const h = 40 * k;
    // premier emplacement libre de la zone de dessin (de bas en haut, de droite à gauche), sinon en bas à gauche
    const area = scaleRect(DRAW_AREA, k);
    const boxes = sheet.items.map((i) => itemBox(i, sheet, viewData, k));
    const free = (x: number, y: number) => !boxes.some((b) => x < b.x + b.w + 2 * k && x + w + 2 * k > b.x && y < b.y + b.h + 2 * k && y + h + 2 * k > b.y);
    let rect = { x: area.x + 4 * k, y: area.y + area.h - h - 4 * k, w, h };
    search: for (let y = area.y + area.h - h - 4 * k; y >= area.y + 4 * k; y -= 5 * k)
      for (let x = area.x + area.w - w - 4 * k; x >= area.x + 4 * k; x -= 5 * k)
        if (free(x, y)) {
          rect = { x, y, w, h };
          break search;
        }
    return { id: newId('g'), type: 'paintLegend', rect, lang: 'en', scope: 'sheet', areas: true };
  };
  /** Aperçu d'une peinture provisoire (une zone) sur les vues de la planche. */
  const previewOf = (temp: PaintSettings, only?: string[]): Map<string, PaintRegion[]> | null => {
    if (!paint) return null;
    const painted = paintScene(scene, temp, paint.ctx);
    const out = new Map<string, PaintRegion[]>();
    for (const vp of sheet.items) {
      if (vp.type !== 'viewport' || vp.custom || (only && !only.includes(vp.id))) continue;
      const data = bank.data(vp);
      if (!data.basis || !data.lw) continue;
      const meshIds = resolveMeshes(scene.index, scene.look, vp.request.subset.include, vp.request.subset.hideCategories, vp.request.subset.onlyCategories);
      out.set(vp.id, computePaintOverlay({ scene, painted, meshIds, basis: data.basis, isGlass: glassTest, glassTransparent: vp.request.style.glassTransparent !== false }));
    }
    return out;
  };
  const tempPaint = (target: PaintZone['target']): PaintSettings => ({
    v: 1,
    colors: [{ id: '__preview', tag: '', name: '', system: 'autre', hex: '#F97316', createdAt: '' }],
    zones: [{ id: '__preview', colorId: '__preview', target, label: '', source: 'click', createdAt: '' }],
    updatedAt: '',
  });
  const applyPaint = (ops: PaintOp[], label: string) => {
    if (!paint || paint.state.disabled) return;
    paint.state.apply(ops, label);
  };
  const addZone = (vp: ViewportItem, pick: FacePick, opt: TargetOption, colorId: string) => {
    if (!paint) return;
    const color = paint.state.paint.colors.find((c) => c.id === colorId);
    const zone: PaintZone = {
      id: uid('z'),
      colorId,
      target: opt.target,
      label: zoneLabel(paint.ctx, pick.nodeId, opt, vp.label),
      source: 'click',
      createdAt: new Date().toISOString(),
      ...(paint.userName ? { by: paint.userName } : {}),
    };
    applyPaint([{ op: 'zone.put', zone }], `peinture ${color?.tag ?? ''}`);
    setToast(`${color?.tag ?? ''} · ${color ? colorCode(color) || color.name : ''} · ${opt.label.replace(/ \(\d+\)$/, '')}${opt.count > 1 ? ` (${opt.count})` : ''}`);
    if (!sheet.items.some((i) => i.type === 'paintLegend')) actions.addItems([paintLegend()], 'Ajouter la légende de la peinture');
    setBubble(null);
    setPaintPreview(null);
  };
  const paintAt = (p: PointMm, vp: ViewportItem | null) => {
    if (!paint) return;
    if (vp?.custom) {
      setToast('Peinture sur les vues spéciales : pas encore — peins sur une vue standard, elle apparaîtra partout où la face se voit.');
      return;
    }
    const k = templateScale(sheet.paper);
    const pick = vp ? pickFace(scene, vp, bank.data(vp), p, (device.isTouch ? 6 : 4) * k) : null;
    if (!vp || !pick) {
      setBubble(null);
      setPaintPreview(null);
      setToast('Aucune face sous le point : tape sur une pièce d’une vue.');
      return;
    }
    const hit = paint.painted?.nodes.get(pick.nodeId)?.get(pick.triangle);
    if (paintMode === 'pipette') {
      if (hit) {
        setActiveColor(hit.colorId);
        setSelectedZone(hit.zoneId);
        setPaintMode('brush');
      } else setToast('Cette face n’est pas peinte.');
      return;
    }
    if (paintMode === 'eraser') {
      if (hit) applyPaint([{ op: 'zone.del', id: hit.zoneId }], 'gomme');
      else setToast('Cette face n’est pas peinte.');
      return;
    }
    const options = targetOptions(paint.ctx, pick.nodeId, pick.face);
    const color = activeColor && paint.state.paint.colors.some((c) => c.id === activeColor) ? activeColor : null;
    if (quick.on && color) {
      const opt = options.find((o) => o.key === quick.key) ?? options[0];
      addZone(vp, pick, opt, color);
      return;
    }
    const choice: TargetKey = options.some((o) => o.key === quick.key) ? quick.key : 'face-box';
    const at = { x: Math.min(lastPointer.current.x + 12, window.innerWidth - 380), y: Math.min(lastPointer.current.y + 12, window.innerHeight - 320) };
    setBubble({ vp, pick, options, choice, at });
    setPaintPreview(previewOf(tempPaint(options.find((o) => o.key === choice)!.target)));
  };
  // zone choisie dans le panneau : montrée en orange sur les vues de la planche
  useEffect(() => {
    if (!paint || bubble) return;
    const z = selectedZone ? paint.state.paint.zones.find((x) => x.id === selectedZone) : undefined;
    setPaintPreview(z ? previewOf(tempPaint(z.target)) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZone, sheet.id, bankTick]);
  useEffect(() => {
    if (tool !== 'paint') {
      setBubble(null);
      setPaintPreview(null);
      setSelectedZone(null);
    }
  }, [tool]);
  const paintInfo: PaintSheetInfo | undefined = paint?.painted
    ? { colors: paint.state.paint.colors, areas: paint.painted.areaByColor, usedInSet: new Set([...paint.painted.areaByColor].filter(([, a]) => a > 0).map(([id]) => id)) }
    : undefined;

  const onPlace = (t: Tool, p: PointMm, vp: ViewportItem | null) => {
    const k = templateScale(sheet.paper);
    if (t === 'paint') {
      paintAt(p, vp);
      return;
    }
    if (t === 'symbol') {
      placeSymbol(p, vp);
      return;
    }
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
    const k = templateScale(sheet.paper);
    const rect = target?.rect ?? { x: 30 * k, y: 60 * k, w: 250 * k, h: 180 * k };
    setBusy('Capture 3D…');
    try {
      const [r] = await captureOffscreen(scene, glassTest, [{ include: inc, hideCategories: [], view, projection, aspect: rect.w / rect.h }]);
      let url = URL.createObjectURL(r.blob);
      try {
        url = (await vem.uploadAsset(PROJECT_ID, r.blob, `capture-${Date.now()}.png`)).url;
      } catch {
        /* garde l'image locale : elle ne sera pas conservée à la réouverture */
      }
      if (target) actions.updateItem(target.id, { url, width: r.width, height: r.height, retake: undefined } as Partial<SheetItem>, 'Nouvelle capture');
      else actions.addItems([{ id: newId('c'), type: 'image3d', rect, url, width: r.width, height: r.height, label: '3D', showLabel: false }], 'Ajouter une image 3D');
    } catch (e) {
      window.alert(`Capture impossible : ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  const otherImages = useMemo(() => otherImagesOfSet(doc, captures), [doc, captures]);
  const pickImage = (itemId: string | null, img: PickableImage) => {
    const { url, width, height } = img;
    if (itemId) actions.updateItem(itemId, { url, width, height } as Partial<SheetItem>, 'Changer l’image 3D');
    else
      actions.addItems(
        [{ id: newId('c'), type: 'image3d', rect: insertRect(img, templateScale(sheet.paper)), url, width, height, label: '3D', showLabel: false }],
        'Ajouter une image 3D',
      );
    setPicker(null);
  };
  // détail type (coupes profils, plancher et isolant) : dessin fixe à 1:10, coin haut-gauche de la zone de dessin
  const addDetail = (id: string) => {
    const dt = DETAILS[id];
    const k = templateScale(sheet.paper);
    actions.addItems(
      [{ id: newId('dt'), type: 'detail', detail: id, rect: detailRect(dt, 10 / k, 30 * k, 60 * k), label: 'Section details', showLabel: true }],
      'Ajouter un détail',
    );
  };
  const pickerItem = picker?.itemId ? (sheet?.items.find((i) => i.id === picker.itemId) as Image3dItem | undefined) : undefined;

  const exportSvg = () => {
    const markup = renderToStaticMarkup(<SheetSvg sheet={sheet} titleBlock={doc.titleBlock} notes={doc.notes} legend={legend} viewData={(vp) => (bank.paintOf(vp), bank.data(vp))} paint={paintInfo} />);
    downloadText(`${doc.titleBlock.projectNumber || doc.title}_${sheet.number}.svg`.replace(/\s+/g, '_'), markup, 'image/svg+xml');
  };

  /** PDF vectoriel du jeu entier ou de la planche affichée (une page par planche, format exact). */
  const exportPdf = async (scope: 'all' | 'sheet' | 'selection') => {
    const all = scope === 'all';
    const sheets = all ? doc.sheets : scope === 'sheet' ? [sheet] : doc.sheets.filter((s) => sheetSelection.includes(s.id));
    if (!sheets.length) return;
    // téléphone / tablette : images plus légères, une planche en mémoire à la fois, jeu lourd signalé avant de lancer
    const light = device.isTouch;
    if (light) {
      const nImages = new Set(sheets.flatMap((s) => s.items).flatMap((i) => (i.type === 'image3d' && i.url ? [i.url] : []))).size;
      const mb = estimatePdfMb(sheets.length, nImages, true);
      if (
        sheets.length > 1 &&
        tooHeavyForPhone(sheets.length, mb) &&
        !window.confirm(
          `Jeu lourd pour un téléphone : ${sheets.length} planches, ≈ ${Math.round(mb)} Mo.\n\nMieux : « PDF planche » ou « ☑ Sélectionner » quelques planches puis « PDF de la sélection ».\n\nLancer quand même ?`,
        )
      )
        return;
    }
    cancelExport.current = false;
    try {
      setBusy('PDF : calcul des vues…');
      const vps = sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport'));
      await Promise.all(vps.map((vp) => bank.load(vp)));
      const missing = vps.filter((vp) => !bank.data(vp).lw).length;
      if (missing && !window.confirm(`${missing} vue(s) n’ont pas pu être calculées (cadre vide dans le PDF). Exporter quand même ?`)) return;
      const { buildPdf, fontsUsed } = await freshImport(() => import('../../sheets/pdf/pdf'));
      const { loadFonts, pdfImageDataUrl, MAX_IMAGE_PX_MOBILE } = await freshImport(() => import('../../sheets/pdf/assets'));
      // images 3D (PNG si transparentes, sinon JPEG), une conversion par image
      const urls = [...new Set(sheets.flatMap((s) => s.items).flatMap((i) => (i.type === 'image3d' && i.url ? [i.url] : [])))];
      const images = new Map<string, string>();
      let failed = 0;
      for (const [n, url] of urls.entries()) {
        setBusy(`PDF : images 3D (${n + 1}/${urls.length})…`);
        try {
          images.set(url, light ? await pdfImageDataUrl(url, 0.88, MAX_IMAGE_PX_MOBILE) : await pdfImageDataUrl(url));
        } catch {
          failed++;
        }
      }
      const markup = (s: Sheet) =>
        renderToStaticMarkup(
          <SheetSvg
            sheet={{ ...s, items: s.items.map((i) => (i.type === 'image3d' && i.url ? { ...i, url: images.get(i.url) ?? '' } : i)) }}
            titleBlock={doc.titleBlock}
            notes={doc.notes}
            legend={legend}
            viewData={(vp) => (bank.paintOf(vp), bank.data(vp))}
            paint={paintInfo}
          />,
        );
      // téléphone : le SVG de chaque planche est refait au moment de sa page (polices relevées sans garder les textes)
      const fontKeys = light ? fontsUsed(sheets.map((s) => markup(s).replace(/<image[^>]*>/g, ''))) : null;
      const pages = sheets.map((s) => ({ paper: s.paper, svg: light ? () => markup(s) : markup(s) }));
      setBusy('PDF : polices…');
      const fonts = await loadFonts(fontKeys ?? fontsUsed(pages.map((p) => p.svg as string)));
      const one = sheets.length === 1 && !all;
      const pdf = await buildPdf(pages, fonts, { title: doc.title, subject: one ? `${sheets[0].number} ${sheets[0].title}` : `${sheets.length} planche(s)` }, (d, n) => {
        if (cancelExport.current) throw new Error('annulé');
        setBusy(`PDF : planche ${d}/${n}…`);
      });
      const suffix = all ? '' : one ? `_${sheets[0].number}` : `_${sheets[0].number}-${sheets[sheets.length - 1].number}`;
      const base = `${doc.titleBlock.projectNumber ? `${doc.titleBlock.projectNumber}_` : ''}${doc.title}${suffix}`;
      deliver(`${base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_')}.pdf`, pdf.output('blob'));
      if (failed) window.alert(`${failed} image(s) 3D n’ont pas pu être intégrées au PDF (image inaccessible).`);
    } catch (e) {
      if (!(e instanceof NewVersionError) && !cancelExport.current) window.alert(`Export PDF impossible : ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  /** DXF de la planche affichée ou du jeu (un seul .dxf ou un .zip) : planche à l'échelle papier ou vues en grandeur réelle. */
  const exportDxf = async ({ scope, mode }: DxfChoice) => {
    setDxfOpen(false);
    const sheets = scope === 'sheet' ? [sheet] : doc.sheets;
    try {
      setBusy('DXF : calcul des vues…');
      const vps = sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport'));
      await Promise.all(vps.map((vp) => bank.load(vp)));
      const missing = vps.filter((vp) => !bank.data(vp).lw).length;
      if (missing && !window.confirm(`${missing} vue(s) n’ont pas pu être calculées (absentes du DXF). Exporter quand même ?`)) return;
      const { sheetDxf, setDxf, zipDxf, safeFileName } = await freshImport(() => import('../../sheets/dxf/export'));
      const base = `${doc.titleBlock.projectNumber ? `${doc.titleBlock.projectNumber}_` : ''}${doc.title}`;
      const computed = (vp: ViewportItem) => !!bank.data(vp).lw;
      const rendered = [];
      for (const [n, s] of sheets.entries()) {
        setBusy(`DXF : planche ${n + 1}/${sheets.length}…`);
        await new Promise((r) => setTimeout(r, 0));
        // les images 3D ne gardent que leur cadre dans le DXF
        const markup = renderToStaticMarkup(
          <SheetSvg
            sheet={s}
            titleBlock={doc.titleBlock}
            notes={doc.notes}
            legend={legend}
            viewData={(vp) => (bank.paintOf(vp), bank.data(vp))}
            paint={paintInfo}
          />,
        );
        rendered.push({ sheet: s, markup });
      }
      const empty = () => window.alert(mode === 'real' ? 'Aucune vue calculée à exporter en grandeur réelle (planches sans vue 2D).' : 'Rien à exporter.');
      if (scope === 'single') {
        setBusy('DXF : assemblage du jeu…');
        await new Promise((r) => setTimeout(r, 0));
        const f = setDxf(rendered, mode, computed, base);
        if (!f) return empty();
        deliver(f.name, new Blob([f.dxf], { type: 'application/dxf' }));
        return;
      }
      const files = rendered.map((r) => sheetDxf(r.sheet, r.markup, mode, computed, base)).filter((f) => f !== null);
      if (!files.length) return empty();
      if (files.length === 1) deliver(files[0].name, new Blob([files[0].dxf], { type: 'application/dxf' }));
      else deliver(safeFileName(`${base}_DXF${mode === 'real' ? '_grandeur-reelle' : ''}.zip`), new Blob([zipDxf(files) as BlobPart], { type: 'application/zip' }));
    } catch (e) {
      if (!(e instanceof NewVersionError)) window.alert(`Export DXF impossible : ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  };

  /**
   * « Dupliquer pour d'autres Viewbox » : une copie par box choisie, vues repointées, calculées avant la pose (centrage,
   * clé, cotes automatiques refaites), posées après la planche source en une seule entrée d'historique.
   */
  const duplicateForModules = async (src: Sheet, targets: string[]) => {
    const from = sheetModule(src);
    if (!from || !targets.length) return;
    const warnings: string[] = [];
    const built: Sheet[] = [];
    try {
      for (const [n, to] of targets.entries()) {
        setBusy(`Copie pour ${to} (${n + 1}/${targets.length})…`);
        const r = retargetSheet(src, from, to, { index: scene.index, frames: scene.frames }, newId);
        for (const w of r.warnings) warnings.push(`${to} : ${w}`);
        const vps = r.sheet.items.filter((i): i is ViewportItem => i.type === 'viewport' && r.viewportIds.includes(i.id));
        await Promise.all(vps.map((vp) => bank.load(vp)));
        for (const vp of vps) {
          const data = bank.data(vp);
          const key = bank.keyOf(vp);
          if (!data.lw || !key) continue;
          const b = data.lw.boundsMm;
          vp.lineworkKey = key;
          vp.center = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
          if (r.autoDimViewportIds.includes(vp.id) && data.basis) {
            const res = autoDimensionViewport(vp, data.lw, data.basis, scene, vp.scale || undefined);
            vp.scale = res.scale;
            vp.center = res.center;
            r.sheet.items.push(...res.dims);
          }
        }
        built.push(r.sheet);
      }
      actions.insertSheets(built, src.id, built.length === 1 ? `Dupliquer pour ${targets[0]}` : `Dupliquer pour ${built.length} Viewbox`);
      if (warnings.length) window.alert(warnings.join('\n'));
    } finally {
      setBusy('');
    }
  };

  /** Clic sur une vignette : afficher, ou ajouter / retirer de la sélection (Ctrl / Cmd, mode sélection), plage (Maj). */
  const onThumbClick = (e: React.MouseEvent, s: Sheet) => {
    const st = useEditor.getState();
    if (longPress.current?.fired) {
      longPress.current = null;
      return;
    }
    if (e.shiftKey) {
      const ids = doc.sheets.map((x) => x.id);
      const a = ids.indexOf(lastThumb.current ?? sheet.id);
      const b = ids.indexOf(s.id);
      st.selectSheets(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
      st.setSheet(s.id);
      return;
    }
    lastThumb.current = s.id;
    if (e.ctrlKey || e.metaKey || selectMode) {
      const base = st.sheetSelection.length || selectMode ? st.sheetSelection : [sheet.id];
      const has = base.includes(s.id);
      st.selectSheets(has ? base.filter((id) => id !== s.id) : [...base, s.id]);
      if (!has) st.setSheet(s.id);
      return;
    }
    st.selectSheets([]);
    st.setSheet(s.id);
  };
  /** appui long (doigt) sur une vignette : mode sélection avec cette planche */
  const onThumbPointerDown = (e: React.PointerEvent, s: Sheet) => {
    if (e.pointerType === 'mouse') return;
    const timer = window.setTimeout(() => {
      if (!longPress.current) return;
      longPress.current.fired = true;
      setSelectMode(true);
      const st = useEditor.getState();
      if (!st.sheetSelection.includes(s.id)) st.selectSheets([...st.sheetSelection, s.id]);
      lastThumb.current = s.id;
      navigator.vibrate?.(15);
    }, 450);
    longPress.current = { timer, x: e.clientX, y: e.clientY, fired: false };
  };
  const onThumbPointerMove = (e: React.PointerEvent) => {
    const lp = longPress.current;
    if (lp && !lp.fired && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) {
      clearTimeout(lp.timer);
      longPress.current = null;
    }
  };
  const onThumbPointerUp = () => {
    const lp = longPress.current;
    if (lp && !lp.fired) {
      clearTimeout(lp.timer);
      longPress.current = null;
    }
  };
  // en consultation, un outil de pose passe en édition
  useEffect(() => {
    if (readOnly && tool !== 'select' && tool !== 'paint') setEditMode(true);
  }, [readOnly, tool]);
  const selectedSheets = doc.sheets.filter((s) => sheetSelection.includes(s.id));
  const groupIds = selectedSheets.length > 1 ? selectedSheets.map((s) => s.id) : null;

  const newSheet = () => {
    const s: Sheet = {
      id: newId('s'),
      number: '',
      title: sheet?.title ?? doc.title,
      paper: sheet?.paper ?? 'A1',
      orientation: 'landscape',
      kind: 'standard',
      ...(sheet?.unit ? { unit: sheet.unit } : {}),
      items: [],
    };
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
      <div className={`sheet-toolbar${moreOpen ? ' more-open' : ''}`}>
        <button className="btn small" onClick={onClose}>
          ← Jeux de plans
        </button>
        <div className="toolbar-more">
        <input
          className="set-title"
          type="text"
          value={doc.title}
          onChange={(e) => useEditor.getState().apply('Titre du jeu', (d) => void (d.title = e.target.value))}
          title="Nom du jeu de plans"
        />
        <span className="sep" />
        </div>
        {tool === 'paint' && paint ? (
          <>
            <button className="btn small" disabled={!paint.state.undoLabel} onClick={paint.state.undo} title={paint.state.undoLabel ? `Annuler : ${paint.state.undoLabel} (Ctrl+Z)` : 'Annuler (Ctrl+Z)'} data-testid="paint-undo">
              ↶
            </button>
            <button className="btn small" disabled={!paint.state.redoLabel} onClick={paint.state.redo} title={paint.state.redoLabel ? `Rétablir : ${paint.state.redoLabel} (Ctrl+Y)` : 'Rétablir (Ctrl+Y)'} data-testid="paint-redo">
              ↷
            </button>
          </>
        ) : (
          <>
            <button className="btn small" disabled={!canUndo} onClick={() => useEditor.getState().undo()} title="Annuler (Ctrl+Z)">
              ↶
            </button>
            <button className="btn small" disabled={!canRedo} onClick={() => useEditor.getState().redo()} title="Rétablir (Ctrl+Y)">
              ↷
            </button>
          </>
        )}
        <button className={`btn small mobile-only${editMode ? ' primary' : ''}`} data-testid="edit-mode" onClick={() => setEditMode(!editMode)}>
          ✏️ {editMode ? 'Édition' : 'Consultation'}
        </button>
        <button className="btn small mobile-only" onClick={() => setFitSignal((n) => n + 1)} aria-label="Toute la planche">
          ⤢
        </button>
        <button className={`btn small mobile-only${propsOpen ? ' primary' : ''}`} data-testid="props-toggle" onClick={() => setPropsOpen(!propsOpen)} aria-label="Propriétés">
          ☰
        </button>
        <button className={`btn small mobile-only${pagesOpen ? ' primary' : ''}`} onClick={() => setPagesOpen(!pagesOpen)} aria-label="Planches">
          ▤
        </button>
        <button className={`btn small mobile-only${moreOpen ? ' primary' : ''}`} data-testid="toolbar-more" onClick={() => setMoreOpen(!moreOpen)} aria-label="Plus d’actions">
          ⋯
        </button>
        <div className="toolbar-more">
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
        <button
          className={`btn small${tool === 'symbol' ? ' primary' : ''}`}
          data-testid="tool-symbol"
          onClick={() => setTool(tool === 'symbol' ? 'select' : 'symbol')}
          title="Prises, interrupteurs, éclairage, tableau, réseau, sécurité, clim… : symboles d’architecte à poser sur les vues, légende comptée"
        >
          ⚡ Symboles
        </button>
        {paint && (
          <button
            className={`btn small${tool === 'paint' ? ' primary' : ''}`}
            data-testid="tool-paint"
            onClick={() => {
              setTool(tool === 'paint' ? 'select' : 'paint');
              setMoreOpen(false);
            }}
            title="Peindre une face d’une vue (poteau, mur…) : couleur RAL, repère P1 sur toutes les vues où elle se voit, légende"
          >
            🎨 Peinture
          </button>
        )}
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
        <button className="btn small" disabled={!!busy} onClick={() => setPicker({ itemId: null })} title="Ajouter une image 3D : une des captures de la vue 3D, ou tout le modèle en iso SO">
          📷 Image 3D
        </button>
        <button className="btn small" onClick={() => addDetail('profiles')} title={`Détail type (dessin fixe) : ${DETAILS.profiles.title}`}>
          ▦ Détail
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
        <button className="btn small" disabled={!!busy} onClick={() => void exportPdf('all')} title="Tout le jeu de plans en un PDF vectoriel (une page par planche, format exact, polices intégrées)">
          ⬇ PDF du jeu
        </button>
        <button className="btn small ghost" disabled={!!busy} onClick={() => void exportPdf('sheet')} title="La planche affichée en PDF vectoriel">
          ⬇ PDF planche
        </button>
        <button className="btn small ghost" disabled={!!busy} onClick={() => setDxfOpen(true)} title="Plans en DXF pour AutoCAD / architectes : planche complète ou vues en grandeur réelle (1 unité = 1 mm)">
          ⬇ DXF
        </button>
        <button className="btn small ghost" onClick={exportSvg} title="La planche affichée au format SVG (format exact, vectoriel)">
          ⬇ SVG
        </button>
        </div>
        {busy.startsWith('PDF') && (
          <button className="btn small ghost" onClick={() => (cancelExport.current = true)} title="Arrêter l’export">
            Annuler
          </button>
        )}
        <span className={`save-status ${save.status}`} title={save.error}>
          {busy || (save.status === 'saved' ? '✓ Enregistré' : save.status === 'saving' ? 'Enregistrement…' : save.status === 'pending' ? 'Modifié' : '⚠ Non enregistré')}
        </span>
      </div>

      {projectUpdate && (
        <div className="sync-banner">
          <span>
            🔄 Le projet VEM a changé depuis ce jeu de plans :{' '}
            {projectUpdate.fields.map((f, i) => (
              <span key={f}>
                {i > 0 && ' · '}
                <b>{PROJECT_FIELD_LABELS[f]}</b> {shown(doc.titleBlock[f]) || '—'} → {shown(projectUpdate.fresh[f]) || '—'}
              </span>
            ))}
          </span>
          <span className="spacer" />
          <button className="btn small primary" onClick={() => applyProject(projectUpdate.fresh, projectUpdate.fields)}>
            Mettre à jour le cartouche
          </button>
          <button
            className="btn small ghost"
            title="Garder le cartouche tel quel (ces changements ne seront plus proposés)"
            onClick={() => {
              const fresh = projectUpdate.fresh;
              useEditor.getState().patchSilently((d) => void (d.projectSync = { at: new Date().toISOString(), values: fresh }));
              setProjectUpdate(null);
            }}
          >
            Garder tel quel
          </button>
        </div>
      )}
      {(selectMode || sheetSelection.length > 0) && (
        <SheetSelectionBar
          doc={doc}
          ids={sheetSelection}
          busy={!!busy}
          onPdf={() => void exportPdf('selection')}
          onClose={() => {
            useEditor.getState().selectSheets([]);
            setSelectMode(false);
          }}
        />
      )}
      <div className="sheet-body">
        <aside
          className={`sheet-pages${selectMode ? ' select-mode' : ''}${pagesOpen ? '' : ' collapsed'}`}
          tabIndex={0}
          data-testid="sheet-pages"
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
              e.preventDefault();
              e.stopPropagation();
              actions.duplicateSheets(sheetSelection.length ? sheetSelection : [sheet.id]);
            }
          }}
        >
          <div className="sheet-pages-head">
            <button
              className={`btn small${selectMode ? ' primary' : ' ghost'}`}
              data-testid="sheet-select-mode"
              onClick={() => {
                if (selectMode) useEditor.getState().selectSheets([]);
                setSelectMode(!selectMode);
              }}
              title="Choisir plusieurs planches (aussi : Ctrl + clic, Maj + clic, appui long au doigt)"
            >
              {selectMode ? '✓ Terminer' : '☑ Sélectionner'}
            </button>
          </div>
          {doc.sheets.map((s, i) => (
            <Fragment key={s.id}>
            {!!doc.units?.length && (i === 0 || doc.sheets[i - 1].unit !== s.unit) && (
              <div className="sheet-group">
                <span>{s.unit ? unitTitle(s.unit, doc.units.find((u) => u.n === s.unit)?.name) : 'Vue d’ensemble'}</span>
                {selectMode && (
                  <button
                    className="btn small ghost"
                    onClick={() => {
                      const ids = doc.sheets.filter((x) => (x.unit ?? 0) === (s.unit ?? 0)).map((x) => x.id);
                      useEditor.getState().selectSheets([...new Set([...sheetSelection, ...ids])]);
                    }}
                  >
                    Tout
                  </button>
                )}
              </div>
            )}
            <div
              className={`sheet-thumb${s.id === sheet.id ? ' on' : ''}${sheetSelection.includes(s.id) ? ' picked' : ''}${drop?.id === s.id ? (drop.after ? ' drop-after' : ' drop-before') : ''}${dragId === s.id || (dragId && groupIds?.includes(dragId) && groupIds.includes(s.id)) ? ' dragging' : ''}`}
              data-sheet-id={s.id}
              onClick={(e) => onThumbClick(e, s)}
              onPointerDown={(e) => onThumbPointerDown(e, s)}
              onPointerMove={onThumbPointerMove}
              onPointerUp={onThumbPointerUp}
              onPointerCancel={onThumbPointerUp}
              onContextMenu={(e) => longPress.current?.fired && e.preventDefault()}
              draggable={!selectMode}
              title="Glisser pour déplacer la planche dans le jeu · Ctrl + clic : choisir plusieurs planches"
              onDragStart={(e) => {
                setDragId(s.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', s.id);
              }}
              onDragEnd={() => {
                setDragId(null);
                setDrop(null);
              }}
              onDragOver={(e) => {
                if (!dragId || dragId === s.id) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                const after = e.clientY > r.top + r.height / 2;
                if (drop?.id !== s.id || drop.after !== after) setDrop({ id: s.id, after });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && drop && groupIds?.includes(dragId)) {
                  // groupe : posé après la cible (ou après la planche qui la précède hors du groupe)
                  if (drop.after) actions.moveSheetsAfter(groupIds, drop.id);
                  else {
                    const rest = doc.sheets.filter((x) => !groupIds.includes(x.id));
                    const t = rest.findIndex((x) => x.id === drop.id);
                    actions.moveSheetsAfter(groupIds, t > 0 ? rest[t - 1].id : null);
                  }
                } else if (dragId && drop) actions.moveSheetTo(dragId, drop.id, drop.after);
                setDragId(null);
                setDrop(null);
              }}
            >
              {selectMode && <input className="thumb-check" type="checkbox" readOnly checked={sheetSelection.includes(s.id)} aria-label={`Choisir la planche ${s.number}`} />}
              <SheetSvg sheet={s} titleBlock={doc.titleBlock} notes={doc.notes} legend={legend} viewData={viewData} thumbnail paint={paintInfo} style={{ width: '100%', height: 'auto', display: 'block' }} />
              <div className="thumb-foot">
                <b>{s.number}</b>
                <span className="thumb-title">{s.kind === 'cover' ? 'Couverture' : (s.items.find((x) => x.type === 'viewport' && (x as ViewportItem).label) as ViewportItem | undefined)?.label ?? s.title}</span>
                <span className="thumb-actions" onClick={(e) => e.stopPropagation()}>
                    <button className="btn small ghost" disabled={i === 0} onClick={() => actions.moveSheet(s.id, -1)} title="Monter la planche">
                      ↑
                    </button>
                    <button className="btn small ghost" disabled={i === doc.sheets.length - 1} onClick={() => actions.moveSheet(s.id, 1)} title="Descendre la planche">
                      ↓
                    </button>
                    <button className="btn small ghost" onClick={() => actions.duplicateSheet(s.id)} title="Dupliquer la planche">
                      ⧉
                    </button>
                    <button
                      className="btn small ghost"
                      disabled={doc.sheets.length === 1}
                      onClick={() => window.confirm(`Supprimer la planche ${s.number} (${s.title}) ?\n\nCtrl+Z pour annuler.`) && actions.deleteSheet(s.id)}
                      title="Supprimer la planche"
                    >
                      🗑
                    </button>
                  </span>
              </div>
            </div>
            </Fragment>
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
          onOpenItem={(it) => it.type === 'image3d' && setPicker({ itemId: it.id })}
          readOnly={readOnly}
          onItemMenu={(item, at) => setItemMenu({ item, ...at })}
          paint={paintInfo}
        />
        <div className={`sheet-side${propsOpen || tool === 'symbol' || tool === 'paint' ? ' open' : ''}${tool === 'paint' ? ' paint' : ''}`}>
        <button className="btn small mobile-only sheet-side-close" onClick={() => (setPropsOpen(false), tool === 'symbol' && setTool('select'))} aria-label="Fermer">
          ✕
        </button>
        {tool === 'paint' && paint ? (
          <PaintPanel
            paint={paint.state.paint}
            painted={paint.painted}
            active={activeColor}
            mode={paintMode}
            saving={paint.state.saving}
            error={paint.state.error}
            disabled={paint.state.disabled}
            selectedZone={selectedZone}
            onActive={(id) => {
              setActiveColor(id);
              setPaintMode('brush');
            }}
            onMode={setPaintMode}
            onNewColor={() => setColorDialog({})}
            onEditColor={(c) => setColorDialog({ edit: c })}
            onReplace={(from, to) => {
              const a = paint.state.paint.colors.find((c) => c.id === from);
              const b = paint.state.paint.colors.find((c) => c.id === to);
              applyPaint(reassignOps(paint.state.paint, from, to), `${a?.tag} → ${b?.tag} partout`);
            }}
            onDeleteColor={(c) => {
              const n = paint.state.paint.zones.filter((z) => z.colorId === c.id).length;
              if (n && !window.confirm(`Supprimer ${c.tag} et ses ${n} zone(s) peinte(s) ?\n\n(« Remplacer partout par… » garde les zones avec une autre couleur.)`)) return;
              applyPaint([{ op: 'color.del', id: c.id }], `suppression ${c.tag}`);
              if (activeColor === c.id) setActiveColor(null);
            }}
            onDeleteZone={(id) => applyPaint([{ op: 'zone.del', id }], 'retirer une zone')}
            onSelectZone={setSelectedZone}
            onDisplayAll={(mode) =>
              actions.editDoc(mode === 'off' ? 'Peinture masquée sur toutes les vues' : mode === 'fill' ? 'Couleurs de peinture sur toutes les vues' : 'Repères de peinture sur toutes les vues', (d) => {
                for (const sh of d.sheets)
                  for (const it of sh.items)
                    if (it.type === 'viewport') {
                      if (mode === 'marks') delete it.paint;
                      else it.paint = mode;
                    }
              })
            }
            onAddLegend={() => actions.addItems([paintLegend()], 'Ajouter la légende de la peinture')}
            onExcel={async () => {
              const { paintListXlsx } = await freshImport(() => import('../../core/paint/excel'));
              const pd = paint.painted;
              const bytes = paintListXlsx(
                paint.state.paint,
                { byColor: pd?.areaByColor ?? new Map(), byZone: pd?.areaByZone ?? new Map(), byColorModule: pd?.areaByColorModule ?? new Map(), noEffect: pd?.noEffect ?? new Set() },
                doc.title,
              );
              const base = `${doc.titleBlock.projectNumber ? `${doc.titleBlock.projectNumber}_` : ''}${doc.title}_peinture`;
              deliver(`${base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_')}.xlsx`, new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
            }}
            onClose={() => setTool('select')}
          />
        ) : tool === 'symbol' ? (
          <SymbolPalette
            doc={doc}
            sheet={sheet}
            current={symbolKey}
            onPick={setSymbolKey}
            onAddLegend={() => actions.addItems([symbolLegend()], 'Ajouter la légende des symboles')}
            onClose={() => setTool('select')}
          />
        ) : (
        <PropertiesPanel
          doc={doc}
          sheet={sheet}
          scene={scene}
          viewData={viewData}
          suggestionsFor={(l) => labelSuggestions.current.get(l.id) ?? []}
          onRecapture={(item, v) => void capture(item, v, item.retake?.include)}
          captures={captures}
          otherImages={otherImages}
          onPickImage={(item, img) => pickImage(item.id, img)}
          onOpenPicker={(item) => setPicker({ itemId: item.id })}
          onAutoDimension={(vp) => autoDimension([vp])}
          onSetInclude={(vp, include, label) => setViewportInclude(vp, include, label)}
          onSyncProject={() => void syncProject(true)}
          syncMessage={syncMessage}
          onDuplicateForModules={sheetModule(sheet) ? () => setRetarget(sheet) : undefined}
        />
        )}
        </div>
      </div>
      {itemMenu && (
        <ItemMenu
          item={itemMenu.item}
          at={itemMenu}
          editMode={!readOnly}
          onClose={() => setItemMenu(null)}
          onProps={() => setPropsOpen(true)}
          onOpenImage={() => setPicker({ itemId: itemMenu.item.id })}
          onEdit={() => setEditMode(true)}
        />
      )}
      {retarget && (
        <ModulePickDialog
          scene={scene}
          from={sheetModule(retarget)!}
          onCancel={() => setRetarget(null)}
          onConfirm={(targets) => {
            const src = retarget;
            setRetarget(null);
            void duplicateForModules(src, targets);
          }}
        />
      )}
      {bubble && paint && (
        <PaintBubble
          crumbs={paintBreadcrumb(paint.ctx, bubble.pick.nodeId)}
          options={bubble.options}
          choice={bubble.choice}
          colors={paint.state.paint.colors}
          colorId={activeColor && paint.state.paint.colors.some((c) => c.id === activeColor) ? activeColor : null}
          quick={quick.on}
          at={bubble.at}
          onChoice={(choice) => {
            setBubble({ ...bubble, choice });
            setPaintPreview(previewOf(tempPaint(bubble.options.find((o) => o.key === choice)!.target)));
          }}
          onColor={setActiveColor}
          onNewColor={() => setColorDialog({})}
          onQuick={(on) => setQuick({ on, key: bubble.choice })}
          onApply={() => {
            const opt = bubble.options.find((o) => o.key === bubble.choice)!;
            if (quick.on) setQuick({ on: true, key: bubble.choice });
            if (activeColor) addZone(bubble.vp, bubble.pick, opt, activeColor);
          }}
          onClose={() => {
            setBubble(null);
            setPaintPreview(null);
          }}
        />
      )}
      {colorDialog && paint && (
        <ColorDialog
          initial={colorDialog.edit}
          favorites={paint.favorites}
          canEditFavorites={paint.canEditFavorites}
          onClose={() => setColorDialog(null)}
          onToggleFavorite={(c, add) => {
            const same = (f: ColorDraft) => f.system === c.system && f.code === c.code && f.hex === c.hex;
            paint.onFavorites(add ? [...paint.favorites.filter((f) => !same(f)), { name: c.name, system: c.system, code: c.code, hex: c.hex, ...(c.finish ? { finish: c.finish as PaintFinish } : {}) }] : paint.favorites.filter((f) => !same(f)));
          }}
          onSave={(draft) => {
            const edit = colorDialog.edit;
            const color: PaintColor = edit
              ? { ...edit, ...draft }
              : { ...draft, id: uid('c'), tag: nextTag(paint.state.paint.colors), createdAt: new Date().toISOString(), ...(paint.userName ? { by: paint.userName } : {}) };
            for (const k of Object.keys(color) as Array<keyof PaintColor>) if (color[k] === undefined) delete color[k];
            applyPaint([{ op: 'color.put', color }], edit ? `couleur ${color.tag}` : `nouvelle couleur ${color.tag}`);
            setActiveColor(color.id);
            setColorDialog(null);
          }}
        />
      )}
      {toast && (
        <div className="paint-toast" role="status" data-testid="paint-toast">
          <span>{toast}</span>
          {paint?.state.undoLabel && (
            <button
              className="btn small"
              onClick={() => {
                paint.state.undo();
                setToast('');
              }}
            >
              Annuler
            </button>
          )}
        </div>
      )}
      {ready && (
        <FileReadyDialog
          file={ready}
          onClose={() => setReady(null)}
          onSaveToProject={async (f) => {
            await vem.saveProjectFile(PROJECT_ID, f.blob, f.name);
          }}
        />
      )}
      {dxfOpen && <DxfDialog sheetLabel={`${sheet.number} ${sheet.title}`.trim()} sheetCount={doc.sheets.length} onExport={(c) => void exportDxf(c)} onClose={() => setDxfOpen(false)} />}
      {picker && (
        <CapturePicker
          title={pickerItem ? 'Changer l’image 3D' : 'Ajouter une image 3D'}
          captures={captures}
          others={otherImages}
          current={pickerItem?.url}
          onPick={(img) => pickImage(picker.itemId, img)}
          onClose={() => setPicker(null)}
          footer={
            !picker.itemId && (
              <>
                <button
                  className="btn small"
                  onClick={() => {
                    setPicker(null);
                    void capture(null, 'iso-sw|perspective');
                  }}
                >
                  📷 Nouvelle capture : tout le modèle (iso SO)
                </button>
                <span className="hint">Pour un autre cadrage : onglet Vue 3D, puis 📷 Capturer.</span>
              </>
            )
          }
        />
      )}
    </div>
  );
}

const shown = (v: TitleBlockData[ProjectField]) => (typeof v === 'string' ? v : (v as Person).name);

/** « Unité 2 · Bar VIP » (le nom par défaut « Unit 2 » n'est pas répété). */
function unitTitle(n: number, name?: string): string {
  return !name || name === `Unit ${n}` ? `Unité ${n}` : `Unité ${n} · ${name}`;
}
