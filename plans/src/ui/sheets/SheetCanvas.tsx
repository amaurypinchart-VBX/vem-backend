// Zone de dessin de l'éditeur : zoom (molette, vers le pointeur), déplacement (molette enfoncée ou Espace + glisser),
// sélection (Maj = ajouter), déplacement des éléments avec magnétisme (bords/centres des autres éléments, cadre, grille
// 5 mm ; Maj = sans magnétisme), poignées de redimensionnement, Alt + glisser dans une vue = recadrer son contenu.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { PointMm, RectMm, Sheet, SheetItem, ViewportItem } from '../../sheets/types';
import { hasRect } from '../../sheets/types';
import type { Handle, LegendEntry, ViewportData } from '../../sheets/SheetSvg';
import { SheetSvg, itemBounds, labelAnchor } from '../../sheets/SheetSvg';
import { FRAME, PAPER_MM, scaleRect, templateScale } from '../../sheets/template';
import type { DrawingSet } from '../../sheets/types';
import { actions, useEditor } from '../../sheets/store';

export type Tool = 'select' | 'label' | 'text';

interface Props {
  doc: DrawingSet;
  sheet: Sheet;
  legend: LegendEntry[];
  viewData: (vp: ViewportItem) => ViewportData | undefined;
  tool: Tool;
  hiddenLayers: { drawing?: boolean; annotations?: boolean };
  /** clic avec l'outil Repère / Texte (point papier, fenêtre de vue sous le pointeur) */
  onPlace: (tool: Tool, p: PointMm, viewport: ViewportItem | null) => void;
  fitSignal: number;
  zoomSignal: { n: number; factor: number };
}

const GRID = 5;

type Drag =
  | { kind: 'move'; ids: string[]; start: PointMm; moved: boolean; noSnap: boolean }
  | { kind: 'resize'; id: string; handle: Handle; start: PointMm; rect: RectMm }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'content'; id: string; start: PointMm; center: [number, number]; scale: number };

export function SheetCanvas({ doc, sheet, legend, viewData, tool, hiddenLayers, onPlace, fitSignal, zoomSignal }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const selection = useEditor((s) => s.selection);
  const paper = PAPER_MM[sheet.paper];
  const [view, setView] = useState({ zoom: 1, panX: 20, panY: 20 });
  const [preview, setPreview] = useState<Map<string, RectMm | { dx: number; dy: number }> | undefined>();
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);

  const fit = useCallback(() => {
    const el = host.current;
    if (!el) return;
    const zoom = Math.min((el.clientWidth - 40) / paper.w, (el.clientHeight - 40) / paper.h);
    setView({ zoom, panX: (el.clientWidth - paper.w * zoom) / 2, panY: (el.clientHeight - paper.h * zoom) / 2 });
  }, [paper.w, paper.h]);
  useLayoutEffect(fit, [fit, fitSignal, sheet.id]);
  useEffect(() => {
    if (!zoomSignal.n) return;
    const el = host.current;
    if (!el) return;
    zoomAt(el.clientWidth / 2, el.clientHeight / 2, zoomSignal.factor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomSignal]);

  const zoomAt = (sx: number, sy: number, factor: number) =>
    setView((v) => {
      const zoom = Math.min(40, Math.max(0.15, v.zoom * factor));
      const px = (sx - v.panX) / v.zoom;
      const py = (sy - v.panY) / v.zoom;
      return { zoom, panX: sx - px * zoom, panY: sy - py * zoom };
    });

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) space.current = true;
    };
    const ku = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

  const toPaper = (e: { clientX: number; clientY: number }): PointMm => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * paper.w, y: ((e.clientY - r.top) / r.height) * paper.h };
  };

  // ─── magnétisme ───
  const k = templateScale(sheet.paper);
  const snapTargets = (exclude: Set<string>) => {
    const xs: number[] = [];
    const ys: number[] = [];
    const frame = scaleRect(FRAME, k);
    const add = (r: RectMm) => {
      xs.push(r.x, r.x + r.w / 2, r.x + r.w);
      ys.push(r.y, r.y + r.h / 2, r.y + r.h);
    };
    add(frame);
    for (const it of sheet.items) if (!exclude.has(it.id) && hasRect(it)) add(it.rect);
    return { xs, ys };
  };
  const snapDelta = (value: number[], targets: number[], tol: number): number | null => {
    let best: number | null = null;
    for (const v of value)
      for (const t of targets) {
        const d = t - v;
        if (Math.abs(d) <= tol && (best === null || Math.abs(d) < Math.abs(best))) best = d;
      }
    return best;
  };

  const onItemDown = (e: ReactPointerEvent, item: SheetItem) => {
    if (e.button !== 0 || space.current || tool !== 'select') return;
    e.stopPropagation();
    const sel = useEditor.getState().selection;
    let ids = sel;
    if (e.shiftKey) ids = sel.includes(item.id) ? sel.filter((i) => i !== item.id) : [...sel, item.id];
    else if (!sel.includes(item.id)) ids = [item.id];
    useEditor.getState().select(ids);
    const p = toPaper(e);
    if (e.altKey && item.type === 'viewport') {
      const data = viewData(item);
      const b = data?.lw?.boundsMm;
      const center: [number, number] = item.center ?? (b ? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2] : [0, 0]);
      drag.current = { kind: 'content', id: item.id, start: p, center, scale: item.scale };
    } else drag.current = { kind: 'move', ids: ids.filter((id) => !sheet.items.find((i) => i.id === id)?.locked), start: p, moved: false, noSnap: e.shiftKey };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onHandleDown = (e: ReactPointerEvent, item: SheetItem, handle: string) => {
    if (e.button !== 0 || !hasRect(item)) return;
    e.stopPropagation();
    drag.current = { kind: 'resize', id: item.id, handle: handle as Handle, start: toPaper(e), rect: item.rect };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onBackgroundDown = (e: ReactPointerEvent) => {
    if (e.button === 1 || (e.button === 0 && space.current)) {
      e.preventDefault();
      drag.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: view.panX, panY: view.panY };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.button !== 0) return;
    const p = toPaper(e);
    if (tool !== 'select') {
      const vp = [...sheet.items].reverse().find((i): i is ViewportItem => i.type === 'viewport' && p.x >= i.rect.x && p.x <= i.rect.x + i.rect.w && p.y >= i.rect.y && p.y <= i.rect.y + i.rect.h);
      onPlace(tool, p, vp ?? null);
      return;
    }
    useEditor.getState().select([]);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'pan') {
      setView((v) => ({ ...v, panX: d.panX + e.clientX - d.startX, panY: d.panY + e.clientY - d.startY }));
      return;
    }
    const p = toPaper(e);
    const tol = 6 / view.zoom;
    if (d.kind === 'move') {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (!d.moved && Math.hypot(dx, dy) < 0.6) return;
      d.moved = true;
      const g: { x?: number; y?: number } = {};
      const moving = sheet.items.filter((i) => d.ids.includes(i.id));
      if (!d.noSnap && !e.shiftKey && moving.length) {
        const bs = moving.map((i) => itemBounds(i, i.type === 'label' ? labelAnchor(i, sheet, viewData) : null, k));
        const x0 = Math.min(...bs.map((b) => b.x)) + dx;
        const x1 = Math.max(...bs.map((b) => b.x + b.w)) + dx;
        const y0 = Math.min(...bs.map((b) => b.y)) + dy;
        const y1 = Math.max(...bs.map((b) => b.y + b.h)) + dy;
        const t = snapTargets(new Set(d.ids));
        const sx = snapDelta([x0, (x0 + x1) / 2, x1], t.xs, tol);
        const sy = snapDelta([y0, (y0 + y1) / 2, y1], t.ys, tol);
        if (sx !== null) {
          dx += sx;
          g.x = [x0, (x0 + x1) / 2, x1].map((v) => v + sx).find((v) => t.xs.some((q) => Math.abs(q - v) < 1e-6));
        } else dx += Math.round(x0 / GRID) * GRID - x0; // grille 5 mm (bord gauche)
        if (sy !== null) {
          dy += sy;
          g.y = [y0, (y0 + y1) / 2, y1].map((v) => v + sy).find((v) => t.ys.some((q) => Math.abs(q - v) < 1e-6));
        } else dy += Math.round(y0 / GRID) * GRID - y0; // grille 5 mm (bord haut)
      }
      setGuides(g);
      setPreview(new Map(d.ids.map((id) => [id, { dx, dy }])));
    } else if (d.kind === 'resize') {
      const r = { ...d.rect };
      let x = p.x;
      let y = p.y;
      if (!e.shiftKey) {
        const t = snapTargets(new Set([d.id]));
        const sx = snapDelta([x], t.xs, tol);
        const sy = snapDelta([y], t.ys, tol);
        x = sx !== null ? x + sx : Math.round(x / GRID) * GRID;
        y = sy !== null ? y + sy : Math.round(y / GRID) * GRID;
      }
      const hdl = d.handle;
      if (hdl.includes('w')) {
        r.w = d.rect.x + d.rect.w - x;
        r.x = x;
      }
      if (hdl.includes('e')) r.w = x - d.rect.x;
      if (hdl.includes('n')) {
        r.h = d.rect.y + d.rect.h - y;
        r.y = y;
      }
      if (hdl.includes('s')) r.h = y - d.rect.y;
      if (r.w < 5) {
        if (hdl.includes('w')) r.x = d.rect.x + d.rect.w - 5;
        r.w = 5;
      }
      if (r.h < 5) {
        if (hdl.includes('n')) r.y = d.rect.y + d.rect.h - 5;
        r.h = 5;
      }
      setPreview(new Map([[d.id, r]]));
    } else if (d.kind === 'content') {
      const dxm = (p.x - d.start.x) * d.scale;
      const dym = (p.y - d.start.y) * d.scale;
      const vp = sheet.items.find((i) => i.id === d.id) as ViewportItem;
      viewportPreview.current = { id: d.id, center: [d.center[0] - dxm, d.center[1] + dym] };
      setPreview(new Map([[d.id, vp.rect]]));
    }
  };

  const viewportPreview = useRef<{ id: string; center: [number, number] } | null>(null);

  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setGuides({});
    if (!d) return;
    if (d.kind === 'move' && d.moved && preview) {
      const first = preview.values().next().value as { dx: number; dy: number } | undefined;
      if (first && 'dx' in first) actions.moveItems(d.ids, first.dx, first.dy);
    } else if (d.kind === 'resize' && preview) {
      const r = preview.get(d.id) as RectMm | undefined;
      if (r) actions.setRect(d.id, r);
    } else if (d.kind === 'content' && viewportPreview.current) {
      actions.updateItem(d.id, { center: viewportPreview.current.center } as Partial<SheetItem>, 'Recadrer la vue');
      viewportPreview.current = null;
    }
    setPreview(undefined);
  };

  // contenu recadré en direct pendant Alt + glisser
  const liveViewData = (vp: ViewportItem) => viewData(vp);
  const liveSheet =
    viewportPreview.current && drag.current?.kind === 'content'
      ? { ...sheet, items: sheet.items.map((i) => (i.id === viewportPreview.current!.id ? { ...i, center: viewportPreview.current!.center } : i)) as SheetItem[] }
      : sheet;

  return (
    <div
      ref={host}
      className={`sheet-canvas tool-${tool}`}
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="sheet-paper" style={{ transform: `translate(${view.panX}px, ${view.panY}px)`, width: paper.w * view.zoom, height: paper.h * view.zoom }}>
        <SheetSvg
          svgRef={svgRef}
          sheet={liveSheet}
          titleBlock={doc.titleBlock}
          notes={doc.notes}
          legend={legend}
          viewData={liveViewData}
          style={{ width: '100%', height: '100%', display: 'block' }}
          editing={{ selection, preview: drag.current?.kind === 'content' ? undefined : preview, hidden: hiddenLayers, onItemDown, onHandleDown }}
        />
        {(guides.x !== undefined || guides.y !== undefined) && (
          <svg className="sheet-guides" viewBox={`0 0 ${paper.w} ${paper.h}`} preserveAspectRatio="none">
            {guides.x !== undefined && <line x1={guides.x} x2={guides.x} y1={0} y2={paper.h} stroke="#e63946" strokeWidth={0.3} />}
            {guides.y !== undefined && <line y1={guides.y} y2={guides.y} x1={0} x2={paper.w} stroke="#e63946" strokeWidth={0.3} />}
          </svg>
        )}
      </div>
      <div className="sheet-zoom hint">{Math.round((view.zoom / (96 / 25.4)) * 100)} %</div>
    </div>
  );
}
