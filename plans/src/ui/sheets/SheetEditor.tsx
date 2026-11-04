// Éditeur de planches : barre d'outils, planches (vignettes), zone de dessin, propriétés, cartouche.
// Enregistrement automatique 2 s après la dernière modification ; annuler / rétablir illimités.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HEAVY_VIEW } from '../../linework/provider';
import { renderToStaticMarkup } from 'react-dom/server';
import { Raycaster } from 'three';
import type { Object3D } from 'three';
import type { Vec3 } from '../../core/views';
import { unprojectPoint } from '../../core/views';
import { subsetMeshes } from '../../linework/subset';
import { castInView, viewportObjects } from '../../sheets/viewRay';
import { displayName } from '../../core/report';
import type { LoadedScene } from '../../scene/loadedScene';
import { nodeIdOf } from '../../scene/loadedScene';
import type { GlassTest } from '../../linework/packets';
import { PROJECT_ID, vem } from '../../api/vem';
import type { SavedCapture } from '../../api/vem';
import type { DrawingSet, Image3dItem, LabelItem, PointMm, Sheet, SheetItem, SymbolItem, SymbolLegendItem, TextItem, ViewportItem } from '../../sheets/types';
import { SYMBOL_BY_KEY, SYMBOL_SIZE, alongWall, orientToWall } from '../../sheets/symbols';
import { SymbolPalette } from './SymbolPalette';
import { DEFAULT_LINE_STYLE } from '../../linework/types';
import { SheetSvg, itemBox } from '../../sheets/SheetSvg';
import type { LegendEntry } from '../../sheets/SheetSvg';
import { dimensionDrawingSet, useBank } from '../../sheets/bank';
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
import { insertRect, otherImagesOfSet, screenImageUrl } from '../../sheets/images';
import { DETAILS, detailRect } from '../../sheets/details';
import type { ProjectField, ProjectValues } from '../../sheets/titleBlock';
import { PROJECT_FIELDS, PROJECT_FIELD_LABELS, projectChanges, projectValues } from '../../sheets/titleBlock';
import type { Person, TitleBlockData } from '../../sheets/types';
import { freshImport, NewVersionError } from '../newVersion';
import { retargetSheet, sheetModule } from '../../sheets/duplicate';
import { SheetSelectionBar, ModulePickDialog } from './SheetSelectionBar';
import { lowPowerDevice, useDevice } from '../useDevice';
import { clearStep, markStep } from '../crashLog';
import { ItemMenu } from './ItemMenu';
import { FileReadyDialog } from '../FileReady';
import type { ReadyFile } from '../FileReady';
import { PROJECT_FILE_MAX, deliveryPlan, estimatePdfMb, formatSize, tooHeavyForPhone } from '../deliver';
import type { PaintState } from './usePaint';
import type { PaintedScene } from '../../linework/paintScene';
import { paintScene } from '../../linework/paintScene';
import type { PaintRegion } from '../../linework/paintOverlay';
import { paintOverlaySteps } from '../../linework/paintOverlay';
import { runSliced, SlicedCancelled } from '../../linework/sliced';
import type { PaintContext } from '../../core/paint/resolve';
import type { PaintColor, PaintOp, PaintSettings, PaintZone } from '../../core/paint/types';
import { NO_PAINT } from '../../core/paint/types';
import { countTargets } from '../../core/paint/resolve';
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
import { ExteriorDialog } from './ExteriorDialog';
import { exteriorLabel } from '../../core/paint/exterior';
import type { ColorDraft } from './ColorDialog';
import { ClickBubble } from '../customViews/ClickBubble';
import type { ActionProposal, ClickAction, Crumb } from '../../core/customViews/editor';
import { breadcrumb, defaultTarget } from '../../core/customViews/editor';
import { subsetEnv, subsetScope } from '../../linework/subset';
import { tagHideRule } from '../../core/subsetHide';
import type { HideTarget } from '../../sheets/hideSet';
import { setHidden as hideInSet } from '../../sheets/hideSet';
import { SetHideDialog } from './HideControls';
import { FramesDialog } from './FramesDialog';
import type { FramesChoice } from './FramesDialog';
import type { FrameLang, FrameType } from '../../sheets/frames';
import { frameLabels, frameRefs, frameSheets, groupFrames, measureFrames } from '../../sheets/frames';
import { TEXTILE_TAG } from '../../core/customViews/tags';
import { renumber } from '../../sheets/generate';

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

const LEGEND_AREAS_KEY = 'vem_paint_legend_areas';
/** m² dans une nouvelle légende peinture : dernier choix fait dans le panneau (oui par défaut). */
function legendAreasPref(): boolean {
  try {
    return localStorage.getItem(LEGEND_AREAS_KEY) !== '0';
  } catch {
    return true;
  }
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

/** téléphone : images 3D réduites par Cloudinary (planche affichée / vignettes) */
const PHONE_IMAGE = (url: string) => screenImageUrl(url, 1400);
const THUMB_IMAGE = (url: string) => screenImageUrl(url, 320);
const lightDevice = lowPowerDevice();

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
  /** fenêtres du jeu « obsolètes » (modèle changé depuis leur mise en page) : bandeau « Tout mettre à jour » */
  const [staleIds, setStaleIds] = useState<string[]>([]);
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
  const [exteriorOpen, setExteriorOpen] = useState(false);
  /** redessine le panneau quand le choix « m² dans la légende » change sans légende sur le jeu */
  const [, setPrefTick] = useState(0);
  const [bubble, setBubble] = useState<{ vp: ViewportItem; pick: FacePick; options: TargetOption[]; choice: TargetKey; at: { x: number; y: number } } | null>(null);
  const [quick, setQuick] = useState<{ on: boolean; key: TargetKey }>({ on: false, key: 'face-box' });
  const [toast, setToast] = useState('');
  // ─── masquer en cliquant / sur tout le jeu, cadres textile ───
  const [hideBubble, setHideBubble] = useState<{ vp: ViewportItem; crumbs: Crumb[]; level: string; scope: Set<string>; at: { x: number; y: number } } | null>(null);
  const [hideAll, setHideAll] = useState(false);
  const [setHideOpen, setSetHideOpen] = useState(false);
  const [frames, setFrames] = useState<{ types: FrameType[]; lang: FrameLang } | null>(null);
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
  /** « Enregistré dans les Fichiers du projet » (disparaît après 6 s) */
  const [savedNote, setSavedNote] = useState('');
  useEffect(() => {
    if (!savedNote) return;
    const t = setTimeout(() => setSavedNote(''), 6000);
    return () => clearTimeout(t);
  }, [savedNote]);
  const cancelExport = useRef(false);
  const deliver = (name: string, blob: Blob) => {
    if (deliveryPlan(device) === 'download') downloadBlob(name, blob);
    else setReady({ name, blob });
  };
  const bankTick = useBank(bank);
  useEffect(() => {
    let alive = true;
    const vps = doc.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport'));
    bank.staleViewports(vps).then(
      (ids) => alive && setStaleIds((old) => (old.join('|') === ids.join('|') ? old : ids)),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [doc.sheets, bank, bankTick]);
  /** « Recalculer » de toutes les fenêtres obsolètes du jeu, en une étape d'historique */
  const updateAllViews = () => {
    const ids = new Set(staleIds);
    if (!ids.size) return;
    actions.editDoc(`Mettre à jour ${ids.size} vue(s)`, (d) => {
      for (const sh of d.sheets)
        for (const it of sh.items)
          if (it.type === 'viewport' && ids.has(it.id)) {
            delete it.lineworkKey;
            delete it.center;
          }
    });
    // ordinateur : toutes les vues mises à jour sont calculées tout de suite (téléphone : à l'affichage de leur planche)
    if (!lightDevice) bank.ensure(doc.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport' && ids.has(i.id))));
    setStaleIds([]);
  };
  const sheet = doc.sheets.find((s) => s.id === sheetId) ?? doc.sheets[0];

  // aperçu (face sous le doigt) et zone choisie dans le panneau : contour orange par-dessus la vue
  const [paintPreview, setPaintPreview] = useState<Map<string, PaintRegion[]> | null>(null);
  /** aperçu en cours de calcul : un nouvel aperçu (ou sa fermeture) abandonne le précédent */
  const previewGen = useRef(0);
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
    // téléphone : seulement la planche affichée (calculer tout le jeu d'avance remplit la mémoire et iOS ferme la page)
    if (device.isTouch || lowPowerDevice()) return;
    const t = setTimeout(() => bank.ensure(doc.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport'))), 1500);
    return () => clearTimeout(t);
  }, [sheet, doc.sheets, bank]);
  const heavyViews = useMemo(
    () => (sheet ? sheet.items.filter((i): i is ViewportItem => i.type === 'viewport' && bank.data(i).error === HEAVY_VIEW) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bankTick, sheet, bank],
  );
  useEffect(() => {
    if (!sheet) return;
    const own = sheet.items.filter((i): i is ViewportItem => i.type === 'viewport');
    bank.ensurePaint(own);
    // journal des fermetures (téléphone) : calcul puis affichage de la planche en cours (effacé 3 s après l'affichage)
    if (own.some((vp) => bank.data(vp).busy && !bank.data(vp).error)) {
      markStep(`Calcul des vues de la planche ${sheet.number}`);
      return;
    }
    markStep(`Affichage de la planche ${sheet.number}`);
    const t = setTimeout(clearStep, 3000);
    return () => clearTimeout(t);
  }, [bankTick, sheet, bank]);

  // vues sans calcul de référence (nouvelles, « Recalculer ») : échelle, centrage et clé fixés dès que les traits arrivent
  useEffect(() => {
    const fixes: Array<{ sheetId: string; id: string; key: string; scale?: number; center?: [number, number] }> = [];
    for (const s of doc.sheets)
      for (const it of s.items) {
        if (it.type !== 'viewport' || it.pendingAutoDims || (it.lineworkKey && it.scale && it.center)) continue;
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

  // jeu généré sur téléphone : cotes automatiques posées dès que les vues d'une planche sont là (échelle commune
  // sur une planche par Viewbox, comme à la génération) — sans entrée d'historique
  useEffect(() => {
    const ready = (vp: ViewportItem) => {
      const x = bank.data(vp);
      return !!x.lw && !!x.basis;
    };
    const todo: string[] = [];
    for (const s of doc.sheets) {
      const pend = s.items.filter((i): i is ViewportItem => i.type === 'viewport' && !!i.pendingAutoDims);
      if (pend.length && !pend.some((vp) => bank.data(vp).busy) && pend.some(ready)) todo.push(s.id);
    }
    if (!todo.length) return;
    useEditor.getState().patchSilently((d) => {
      for (const id of todo) {
        const sh = d.sheets.find((x) => x.id === id);
        if (!sh) continue;
        const vps = (sh.items as SheetItem[]).filter((i): i is ViewportItem => i.type === 'viewport' && !!i.pendingAutoDims && ready(i));
        dimensionDrawingSet({ sheets: [sh] } as unknown as DrawingSet, bank, vps.map((v) => v.id));
        for (const vp of vps) {
          vp.lineworkKey = bank.keyOf(vp) ?? vp.lineworkKey;
          delete vp.pendingAutoDims;
        }
      }
    });
  }, [bankTick, doc.sheets, bank]);

  // jeu généré sur téléphone : images 3D rendues ici (ordinateur), envoyées puis posées sans entrée d'historique
  const capturing = useRef(false);
  useEffect(() => {
    if (lightDevice || capturing.current) return;
    const jobs = doc.sheets.flatMap((s) => s.items.filter((i): i is Image3dItem => i.type === 'image3d' && !!i.pendingCapture).map((item) => ({ sheetId: s.id, item })));
    if (!jobs.length) return;
    capturing.current = true;
    void (async () => {
      try {
        await captureOffscreen(
          scene,
          glassTest,
          jobs.map(({ item }) => ({ ...item.pendingCapture!, aspect: item.rect.w / item.rect.h })),
          2400,
          async (i, r) => {
            let url: string;
            try {
              url = (await vem.uploadAsset(PROJECT_ID, r.blob, `vue3d-${i + 1}.png`)).url;
            } catch {
              return;
            }
            const { sheetId, item } = jobs[i];
            useEditor.getState().patchSilently((d) => {
              const it = d.sheets.find((x) => x.id === sheetId)?.items.find((x) => x.id === item.id) as Image3dItem | undefined;
              if (!it) return;
              Object.assign(it, { url, width: r.width, height: r.height });
              delete it.pendingCapture;
            });
          },
        );
      } catch {
        /* rendu impossible : réessayé à la prochaine ouverture */
      } finally {
        capturing.current = false;
      }
    })();
  }, [doc.sheets, scene, glassTest]);

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
        if (toolRef.current === 'hide') setHideBubble(null);
        if (toolRef.current === 'paint') {
          setBubble(null);
          previewGen.current++;
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
    const meshes: Object3D[] = viewportObjects(scene, vp);
    const cast = (x: number, y: number) => castInView(scene, vp, data.basis!, x, y, meshes, raycaster);
    const hit = cast(s.model[0], s.model[1]) ?? cast(clickX, clickY);
    const depth = hit ? hit.point.x * data.basis.toward[0] + hit.point.y * data.basis.toward[1] + hit.point.z * data.basis.toward[2] : 0;
    return { model: s.model, anchor3d: unprojectPoint(data.basis, s.model[0], s.model[1], depth), nodeId: hit ? nodeIdOf(hit.object) : undefined };
  };

  /** « Coter automatiquement » des fenêtres de vue : remplace leurs cotes automatiques, ajuste échelle et centrage. */
  const autoDimension = (vps: ViewportItem[]) => {
    const results: Array<{ vp: ViewportItem; dims: DimensionItem[]; scale: number; center: [number, number]; labels?: LabelItem[] }> = [];
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
      s.items = s.items.filter((i) => !(i.type === 'dimension' && i.auto && ids.has(i.viewportId)) && !(i.type === 'label' && i.auto === 'layer' && ids.has(i.viewportId ?? '')));
      for (const r of results) {
        const it = s.items.find((i) => i.id === r.vp.id) as ViewportItem | undefined;
        if (it) {
          it.scale = r.scale;
          it.center = r.center;
          if (r.vp.dimFrames) it.dimFrames = true;
          else delete it.dimFrames;
          if (r.vp.layerDims) it.layerDims = r.vp.layerDims;
          else delete it.layerDims;
        }
        s.items.push(...(r.dims as typeof s.items));
        if (r.labels) s.items.push(...(r.labels as typeof s.items));
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
    return { id: newId('g'), type: 'paintLegend', rect, lang: 'en', scope: 'sheet', areas: legendAreasPref() };
  };
  // m² dans les légendes PAINTING (A. Pinchart 04.11.2026 : « je peux vouloir choisir de mettre les m² ou pas ») :
  // réglé pour tout le jeu depuis le panneau Peinture, choix gardé pour les prochaines légendes
  const paintLegends = doc.sheets.flatMap((sh) => sh.items.filter((i): i is PaintLegendItem => i.type === 'paintLegend'));
  const legendAreas: boolean | null = paintLegends.length ? (paintLegends.every((i) => i.areas) ? true : paintLegends.every((i) => !i.areas) ? false : null) : legendAreasPref();
  const setLegendAreas = (on: boolean) => {
    try {
      localStorage.setItem(LEGEND_AREAS_KEY, on ? '1' : '0');
    } catch {
      /* stockage indisponible : le choix vaut pour ce jeu seulement */
    }
    if (!paintLegends.length) {
      setPrefTick((n) => n + 1);
      return;
    }
    actions.editDoc(on ? 'm² dans les légendes peinture' : 'Sans m² dans les légendes peinture', (d) => {
      for (const sh of d.sheets) for (const it of sh.items) if (it.type === 'paintLegend') it.areas = on;
    });
  };
  /**
   * Aperçu (contour orange) d'une peinture provisoire (une zone) sur les vues de la planche, calculé en arrière-plan
   * vue par vue (la vue cliquée d'abord) : la bulle s'ouvre tout de suite, l'aperçu suit. `null` = plus d'aperçu.
   */
  const showPreview = (temp: PaintSettings | null, first?: string) => {
    const gen = ++previewGen.current;
    setPaintPreview(null);
    if (!temp || !paint) return;
    const painted = paintScene(scene, temp, paint.ctx, glassTest);
    const vps = sheet.items.filter((vp): vp is ViewportItem => vp.type === 'viewport' && !vp.custom);
    vps.sort((a, b) => (b.id === first ? 1 : 0) - (a.id === first ? 1 : 0));
    void (async () => {
      const out = new Map<string, PaintRegion[]>();
      for (const vp of vps) {
        const data = bank.data(vp);
        if (!data.basis || !data.lw) continue;
        const meshIds = subsetMeshes(scene, vp.request.subset);
        const job = paintOverlaySteps({ scene, painted, meshIds, basis: data.basis, isGlass: glassTest, glassTransparent: vp.request.style.glassTransparent !== false });
        try {
          out.set(vp.id, await runSliced(job, () => previewGen.current !== gen));
        } catch (e) {
          if (e instanceof SlicedCancelled) return;
          console.error('Aperçu de peinture', vp.label, e);
          setToast(`Aperçu impossible sur la vue « ${vp.label || 'sans nom'} » : ${(e as Error).message}`);
          continue;
        }
        if (previewGen.current !== gen) return;
        setPaintPreview(new Map(out));
      }
    })();
  };
  const tempPaint = (target: PaintZone['target']): PaintSettings => ({
    v: 1,
    colors: [{ id: '__preview', tag: '', name: '', system: 'autre', hex: '#F97316', createdAt: '' }],
    zones: [{ id: '__preview', colorId: '__preview', target, label: '', source: 'click', createdAt: '' }],
    updatedAt: '',
  });
  /** couleur active encore valable : une couleur de la palette, ou « ⊘ Sans peinture » */
  const validColor = (id: string | null): string | null => (id && (id === NO_PAINT || paint?.state.paint.colors.some((c) => c.id === id)) ? id : null);
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
    const none = colorId === NO_PAINT;
    applyPaint([{ op: 'zone.put', zone }], none ? 'sans peinture' : `peinture ${color?.tag ?? ''}`);
    setToast(`${none ? '⊘ Sans peinture' : `${color?.tag ?? ''} · ${color ? colorCode(color) || color.name : ''}`} · ${opt.label.replace(/ \(\d+\)$/, '')}${opt.count > 1 ? ` (${opt.count})` : ''}`);
    if (!none && !sheet.items.some((i) => i.type === 'paintLegend')) actions.addItems([paintLegend()], 'Ajouter la légende de la peinture');
    setBubble(null);
    showPreview(null);
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
      showPreview(null);
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
      if (!hit) {
        setToast('Cette face n’est pas peinte.');
        return;
      }
      const zone = paint.state.paint.zones.find((z) => z.id === hit.zoneId);
      // zone posée sur cette seule pièce : on la retire ; zone plus large (côtés extérieurs, toutes les Viewbox, un type…) :
      // « ⊘ Sans peinture » ici, le reste de la zone reste peint (A. Pinchart 04.11.2026)
      if (zone && zone.target.scope !== 'exterior' && countTargets(paint.ctx, zone.target) <= 1) {
        applyPaint([{ op: 'zone.del', id: hit.zoneId }], 'gomme');
        return;
      }
      setActiveColor(NO_PAINT);
    }
    const options = targetOptions(paint.ctx, pick.nodeId, pick.face);
    const color = validColor(activeColor);
    if (quick.on && color && paintMode !== 'eraser') {
      const opt = options.find((o) => o.key === quick.key) ?? options[0];
      addZone(vp, pick, opt, color);
      return;
    }
    const choice: TargetKey = options.some((o) => o.key === quick.key) ? quick.key : 'face-box';
    const at = { x: Math.min(lastPointer.current.x + 12, window.innerWidth - 380), y: Math.min(lastPointer.current.y + 12, window.innerHeight - 320) };
    setBubble({ vp, pick, options, choice, at });
    if (paintMode === 'eraser') setToast('Partie d’une zone plus large : choisis où retirer la peinture, « ⊘ Sans peinture » est sélectionné.');
    showPreview(tempPaint(options.find((o) => o.key === choice)!.target), vp.id);
  };
  // zone choisie dans le panneau : montrée en orange sur les vues de la planche (recalculée quand une vue de la planche
  // arrive, pas à chaque nouvelle de la banque : chaque vue peinte en arrière-plan en donne une)
  const viewsReady = sheet.items
    .filter((i): i is ViewportItem => i.type === 'viewport' && !i.custom)
    .map((vp) => (bank.data(vp).lw ? vp.id : ''))
    .join('|');
  useEffect(() => {
    if (!paint || bubble) return;
    const z = selectedZone ? paint.state.paint.zones.find((x) => x.id === selectedZone) : undefined;
    showPreview(z ? tempPaint(z.target) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedZone, sheet.id, viewsReady]);
  useEffect(() => {
    if (tool !== 'paint') {
      setBubble(null);
      showPreview(null);
      setSelectedZone(null);
    }
  }, [tool]);
  const paintInfo: PaintSheetInfo | undefined = paint?.painted
    ? { colors: paint.state.paint.colors, areas: paint.painted.areaByColor, usedInSet: new Set([...paint.painted.areaByColor].filter(([, a]) => a > 0).map(([id]) => id)) }
    : undefined;

  const onPlace = (t: Tool, p: PointMm, vp: ViewportItem | null) => {
    const k = templateScale(sheet.paper);
    if (t === 'hide') {
      hideAt(p, vp);
      return;
    }
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

  // ─── masquer en cliquant : pièce sous le clic → bulle (cette pièce, toutes les Viewbox, ce type, l'étiquette) ───
  const hideAt = (p: PointMm, vp: ViewportItem | null) => {
    if (!vp || vp.custom) {
      setHideBubble(null);
      setToast(vp?.custom ? 'Vue spéciale : retire les pièces dans Vues 2D › Vues spéciales.' : 'Clique une pièce dans une vue.');
      return;
    }
    const data = bank.data(vp);
    if (!data.lw || !data.basis || !vp.scale) return;
    const b = data.lw.boundsMm;
    const [x, y] = viewportTransform(vp.rect, vp.scale, vp.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]).toModel(p.x, p.y);
    const objs = viewportObjects(scene, vp);
    let hit = castInView(scene, vp, data.basis, x, y, objs, raycaster);
    const tol = (device.isTouch ? 6 : 3) * templateScale(sheet.paper) * vp.scale;
    for (let i = 0; !hit && i < 8; i++) hit = castInView(scene, vp, data.basis, x + Math.cos((i * Math.PI) / 4) * tol, y + Math.sin((i * Math.PI) / 4) * tol, objs, raycaster);
    const meshId = hit ? nodeIdOf(hit.object) : undefined;
    if (!meshId) {
      setHideBubble(null);
      setToast('Aucune pièce sous le point.');
      return;
    }
    const env = subsetEnv(scene);
    const at = { x: Math.min(lastPointer.current.x + 12, window.innerWidth - 580), y: Math.min(lastPointer.current.y + 12, window.innerHeight - 260) };
    setHideBubble({ vp, crumbs: breadcrumb(env.ctx, meshId), level: defaultTarget(env.ctx, meshId), scope: subsetScope(scene, vp.request.subset.include), at });
  };
  const HIDE_ACTIONS: ClickAction[] = ['hide-one', 'hide-all-boxes', 'hide-tag', 'hide-type', 'hide-category'];
  const applyHide = (a: ActionProposal) => {
    if (!hideBubble) return;
    const t: HideTarget =
      a.action === 'hide-category' && a.rule.match.categories?.[0]
        ? { kind: 'category', key: a.rule.match.categories[0] }
        : a.action === 'hide-tag' && a.rule.match.viewTags?.[0]
          ? { kind: 'rule', rule: tagHideRule(a.rule.match.viewTags[0], subsetEnv(scene).tags.labelOf(a.rule.match.viewTags[0])) }
          : { kind: 'rule', rule: { id: a.rule.id, match: a.rule.match, label: a.rule.label } };
    const vpId = hideBubble.vp.id;
    let n = 0;
    actions.editDoc(`Masquer : ${a.rule.label}${hideAll ? ' (tout le jeu)' : ''}`, (d) => void (n = hideInSet(d as DrawingSet, t, true, hideAll ? undefined : new Set([vpId]))));
    setHideBubble(null);
    setToast(`Masqué : ${a.rule.label}${hideAll ? ` — ${n} vue(s)` : ''} · Ctrl+Z pour annuler`);
  };

  // ─── cadres textile : planches de détail, repères F1…, cotes, masquage ───
  const openFrames = (lang: FrameLang = frames?.lang ?? 'en') => setFrames({ types: groupFrames(measureFrames(scene), lang), lang });
  const applyFrames = (types: FrameType[], c: FramesChoice) => {
    const k = templateScale(sheet.paper);
    const refs = frameRefs(types);
    const vps = doc.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport' && !i.custom && !i.frameView));
    const ready = vps.filter((vp) => bank.data(vp).lw && bank.data(vp).basis && vp.scale);
    // cotes des cadres : vues où un cadre se voit, cotes automatiques refaites avec les cadres
    const dimmed = new Map<string, ReturnType<typeof autoDimensionViewport>>();
    const labels = new Map<string, LabelItem[]>();
    if (!c.hide)
      for (const vp of ready) {
        const data = bank.data(vp);
        const ls = frameLabels(scene, vp, data.lw!, data.basis!, refs, k);
        if (!ls.length) continue;
        if (c.dims) dimmed.set(vp.id, autoDimensionViewport({ ...vp, dimFrames: true }, data.lw!, data.basis!, scene));
        if (c.labels) labels.set(vp.id, ls);
      }
    const fresh = c.sheets ? frameSheets(types, { paper: sheet.paper, modelKey: scene.modelKey, style: vps[0]?.request.style ?? { ...DEFAULT_LINE_STYLE }, lang: c.lang, title: doc.title }) : [];
    actions.editDoc('Cadres textile', (d) => {
      if (c.sheets) {
        const old = d.sheets.findIndex((s) => s.role === 'frames');
        d.sheets = d.sheets.filter((s) => s.role !== 'frames');
        const firstUnit = d.sheets.findIndex((s) => s.unit);
        const at = old >= 0 ? Math.min(old, d.sheets.length) : firstUnit < 0 ? d.sheets.length : firstUnit;
        d.sheets.splice(at, 0, ...(fresh as typeof d.sheets));
        renumber(d.sheets as Sheet[]);
      }
      if (c.hide) hideInSet(d as DrawingSet, { kind: 'rule', rule: tagHideRule(TEXTILE_TAG, 'Cadres textile (tissu tendu)') }, true);
      for (const sh of d.sheets) {
        if (c.labels || c.hide) sh.items = sh.items.filter((i) => !(i.type === 'label' && i.auto === 'frame' && (c.hide || labels.has(i.viewportId ?? ''))));
        for (const it of [...sh.items]) {
          if (it.type !== 'viewport') continue;
          const r = dimmed.get(it.id);
          if (r) {
            it.scale = r.scale;
            it.center = r.center;
            it.dimFrames = true;
            sh.items = sh.items.filter((i) => !(i.type === 'dimension' && i.auto && i.viewportId === it.id));
            sh.items.push(...(r.dims as typeof sh.items));
          }
          const ls = labels.get(it.id);
          if (ls) {
            // repères recalculés après le nouveau cadrage (cotes des cadres)
            const data = bank.data(it as ViewportItem);
            const again = r ? frameLabels(scene, { ...(it as ViewportItem), scale: r.scale, center: r.center }, data.lw!, data.basis!, refs, k) : ls;
            sh.items.push(...(again as typeof sh.items));
          }
        }
      }
    });
    if (fresh.length) useEditor.getState().setSheet(fresh[0].id);
    setFrames(null);
    setToast(
      [
        fresh.length ? `${fresh.length} planche(s) « Cadres textile »` : '',
        labels.size ? `repères sur ${labels.size} vue(s)` : '',
        dimmed.size ? `cotes sur ${dimmed.size} vue(s)` : '',
        c.hide ? 'cadres masqués sur les autres vues' : '',
      ]
        .filter(Boolean)
        .join(' · ') + ' — Ctrl+Z pour annuler',
    );
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
  const exportPdf = async (scope: 'all' | 'sheet' | 'selection', target: 'deliver' | 'project' = 'deliver') => {
    const toProject = target === 'project';
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
    markStep(`Export PDF (${sheets.length} planche${sheets.length > 1 ? 's' : ''})`);
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
      // Fichiers du projet : 10 Mo au plus (Cloudinary) ⇒ images allégées d'emblée, puis encore plus si le PDF dépasse
      const loadImages = async (quality: number, maxPx: number | undefined) => {
        images.clear();
        failed = 0;
        for (const [n, url] of urls.entries()) {
          setBusy(`PDF : images 3D (${n + 1}/${urls.length})…`);
          try {
            images.set(url, maxPx ? await pdfImageDataUrl(url, quality, maxPx) : await pdfImageDataUrl(url));
          } catch {
            failed++;
          }
        }
      };
      await loadImages(0.88, light || toProject ? MAX_IMAGE_PX_MOBILE : undefined);
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
      const build = async () => {
        const pdf = await buildPdf(pages, fonts, { title: doc.title, subject: one ? `${sheets[0].number} ${sheets[0].title}` : `${sheets.length} planche(s)` }, (d, n) => {
          if (cancelExport.current) throw new Error('annulé');
          setBusy(`PDF : planche ${d}/${n}…`);
        });
        return pdf.output('blob');
      };
      let blob = await build();
      const suffix = all ? '' : one ? `_${sheets[0].number}` : `_${sheets[0].number}-${sheets[sheets.length - 1].number}`;
      const base = `${doc.titleBlock.projectNumber ? `${doc.titleBlock.projectNumber}_` : ''}${doc.title}${suffix}`;
      const fileName = `${base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_')}.pdf`;
      if (toProject) {
        // trop lourd : images 3D plus petites (1 200 px, JPEG 0,75), puis 800 px
        for (const [q, px] of [
          [0.75, 1200],
          [0.6, 800],
        ] as const) {
          if (blob.size <= PROJECT_FILE_MAX || !urls.length) break;
          await loadImages(q, px);
          blob = await build();
        }
        if (blob.size > PROJECT_FILE_MAX) {
          if (window.confirm(`Le PDF fait ${formatSize(blob.size)} : les Fichiers du projet acceptent 10 Mo au plus.\n\nLe télécharger à la place ?`)) deliver(fileName, blob);
          return;
        }
        setBusy('PDF : enregistrement dans les Fichiers du projet…');
        await vem.saveProjectFile(PROJECT_ID, blob, fileName);
        setSavedNote(`✓ « ${fileName} » enregistré dans les Fichiers du projet VEM`);
      } else deliver(fileName, blob);
      if (failed) window.alert(`${failed} image(s) 3D n’ont pas pu être intégrées au PDF (image inaccessible).`);
    } catch (e) {
      if (!(e instanceof NewVersionError) && !cancelExport.current) window.alert(`${toProject ? 'Enregistrement dans le projet' : 'Export PDF'} impossible : ${(e as Error).message}`);
    } finally {
      clearStep();
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
        <button
          className={`btn small${tool === 'hide' ? ' primary' : ''}`}
          data-testid="tool-hide"
          onClick={() => {
            setTool(tool === 'hide' ? 'select' : 'hide');
            setHideBubble(null);
            setMoreOpen(false);
          }}
          title="Masquer en cliquant : plafond tendu, éclairage, cadre… dans cette vue ou sur tout le jeu"
        >
          🙈 Masquer
        </button>
        <button className="btn small" data-testid="open-frames" onClick={() => (openFrames(), setMoreOpen(false))} title="Cadres textile : planches cotées + nomenclature, repères F1… et cotes sur les vues, ou les masquer">
          ▦ Cadres textile
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
        {heavyViews.length > 0 && (
          <button
            className="btn small"
            data-testid="retry-heavy"
            onClick={() => {
              if (window.confirm('Ces vues sont lourdes : le téléphone peut fermer la page pendant le calcul. Le plus sûr : ouvrir ce jeu une fois sur un ordinateur, les vues y sont calculées puis partagées.\n\nCalculer ici quand même ?')) bank.retryHeavy(heavyViews);
            }}
          >
            Calculer les vues lourdes ici
          </button>
        )}
        <button className="btn small" disabled={!!busy} onClick={() => void exportPdf('all')} title="Tout le jeu de plans en un PDF vectoriel (une page par planche, format exact, polices intégrées)">
          ⬇ PDF du jeu
        </button>
        <button className="btn small ghost" disabled={!!busy} onClick={() => void exportPdf('sheet')} title="La planche affichée en PDF vectoriel">
          ⬇ PDF planche
        </button>
        <button
          className="btn small"
          data-testid="save-set-project"
          disabled={!!busy}
          onClick={() => void exportPdf('all', 'project')}
          title="Tout le jeu de plans en PDF, enregistré dans les Fichiers du projet VEM (onglet Fichiers du projet)"
        >
          💾 Enregistrer dans le projet
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

      {staleIds.length > 0 && (
        <div className="sync-banner" data-testid="stale-banner">
          <span>
            ⚠ <b>{staleIds.length} vue{staleIds.length > 1 ? 's' : ''}</b> du jeu {staleIds.length > 1 ? 'ne sont' : 'n’est'} plus à jour : le modèle a changé depuis leur mise en page.
          </span>
          <span className="spacer" />
          <button className="btn small primary" data-testid="update-all-views" onClick={updateAllViews} title="Recalcule et recentre toutes les vues obsolètes de toutes les planches (Ctrl+Z pour annuler)">
            ↻ Tout mettre à jour
          </button>
        </div>
      )}
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
              <SheetSvg sheet={s} titleBlock={doc.titleBlock} notes={doc.notes} legend={legend} viewData={viewData} thumbnail paint={paintInfo} imageSrc={lightDevice ? THUMB_IMAGE : undefined} style={{ width: '100%', height: 'auto', display: 'block' }} />
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
          imageSrc={lightDevice ? PHONE_IMAGE : undefined}
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
            computing={bank.paintPending()}
            failures={sheet.items.flatMap((i) => (i.type === 'viewport' && bank.paintFailures().has(i.id) ? [`« ${i.label || 'vue'} » : ${bank.paintFailures().get(i.id)}`] : []))}
            error={paint.state.error}
            disabled={paint.state.disabled}
            selectedZone={selectedZone}
            onActive={(id) => {
              setActiveColor(id);
              setPaintMode('brush');
            }}
            onMode={setPaintMode}
            onNewColor={() => setColorDialog({})}
            onExterior={() => setExteriorOpen(true)}
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
            legendAreas={legendAreas}
            onLegendAreas={setLegendAreas}
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
          onHideTool={() => setTool('hide')}
          onSetWide={() => setSetHideOpen(true)}
          onLayerDims={(vp, mode) => autoDimension([{ ...vp, layerDims: mode ?? undefined }])}
          onDimFrames={(vp, on) => {
            if (!on) {
              actions.updateItem(vp.id, { dimFrames: undefined } as Partial<SheetItem>, 'Cadres non cotés');
              autoDimension([{ ...vp, dimFrames: false }]);
            } else autoDimension([{ ...vp, dimFrames: true }]);
          }}
        />
        )}
        </div>
      </div>
      {hideBubble && tool === 'hide' && (
        <ClickBubble
          ctx={subsetEnv(scene).ctx}
          crumbs={hideBubble.crumbs}
          level={hideBubble.level}
          scopeNodes={hideBubble.scope}
          only={HIDE_ACTIONS}
          style={touchLayout ? undefined : { position: 'fixed', left: Math.max(8, hideBubble.at.x), top: Math.max(8, hideBubble.at.y), zIndex: 45 }}
          onLevel={(id) => setHideBubble({ ...hideBubble, level: id })}
          onHover={() => {}}
          onAction={applyHide}
          onClose={() => setHideBubble(null)}
        >
          <div className="row wrap">
            <label className="check">
              <input type="radio" checked={!hideAll} onChange={() => setHideAll(false)} /> dans cette vue
            </label>
            <label className="check">
              <input type="radio" data-testid="hide-all-views" checked={hideAll} onChange={() => setHideAll(true)} /> sur toutes les vues du jeu
            </label>
            <button className="btn small ghost" onClick={() => (setHideBubble(null), setSetHideOpen(true))}>
              Liste…
            </button>
          </div>
        </ClickBubble>
      )}
      {setHideOpen && <SetHideDialog doc={doc} scene={scene} onClose={() => setSetHideOpen(false)} />}
      {frames && (
        <FramesDialog
          types={frames.types}
          existing={doc.sheets.filter((s) => s.role === 'frames').length}
          pendingViews={doc.sheets.reduce((n, s) => n + s.items.filter((i) => i.type === 'viewport' && !i.custom && !i.frameView && !bank.data(i).lw).length, 0)}
          onLang={(lang) => openFrames(lang)}
          onClose={() => setFrames(null)}
          onApply={(c) => applyFrames(frames.types, c)}
        />
      )}
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
          colorId={validColor(activeColor)}
          quick={quick.on}
          at={bubble.at}
          onChoice={(choice) => {
            setBubble({ ...bubble, choice });
            showPreview(tempPaint(bubble.options.find((o) => o.key === choice)!.target), bubble.vp.id);
          }}
          onColor={setActiveColor}
          onNewColor={() => setColorDialog({})}
          onQuick={(on) => setQuick({ on, key: bubble.choice })}
          onApply={() => {
            const opt = bubble.options.find((o) => o.key === bubble.choice)!;
            if (quick.on) setQuick({ on: true, key: bubble.choice });
            const col = validColor(activeColor);
            if (col) addZone(bubble.vp, bubble.pick, opt, col);
          }}
          onClose={() => {
            setBubble(null);
            showPreview(null);
          }}
        />
      )}
      {exteriorOpen && paint && (
        <ExteriorDialog
          scene={scene}
          ctx={paint.ctx}
          glassTest={glassTest}
          paint={paint.state.paint}
          activeColor={activeColor}
          categoryLabel={(k) => (k ? legendColors.get(k)?.label ?? k : 'Structure de la box (sans catégorie)')}
          onNewColor={() => setColorDialog({})}
          onClose={() => setExteriorOpen(false)}
          onApply={(rule, colorId, replaceZone) => {
            const color = paint.state.paint.colors.find((c) => c.id === colorId);
            const zone: PaintZone = {
              id: replaceZone ?? uid('z'),
              colorId,
              target: { scope: 'exterior', match: {}, exterior: rule },
              label: exteriorLabel(rule, scene.frames.size),
              source: 'click',
              createdAt: new Date().toISOString(),
              ...(paint.userName ? { by: paint.userName } : {}),
            };
            applyPaint([{ op: 'zone.put', zone }], `côtés extérieurs ${color?.tag ?? ''}`);
            setActiveColor(colorId);
            setToast(`${color?.tag ?? ''} · ${color ? colorCode(color) || color.name : ''} · côtés extérieurs des Viewbox`);
            if (!sheet.items.some((i) => i.type === 'paintLegend')) actions.addItems([paintLegend()], 'Ajouter la légende de la peinture');
            setExteriorOpen(false);
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
      {savedNote && (
        <div className="paint-toast" role="status" data-testid="saved-project-toast">
          <span>{savedNote}</span>
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
