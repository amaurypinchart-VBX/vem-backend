// Zone de dessin de l'éditeur : zoom (molette, vers le pointeur), déplacement (molette enfoncée ou Espace + glisser),
// sélection (Maj = ajouter), déplacement des éléments avec magnétisme (bords/centres des autres éléments, cadre, grille
// 5 mm ; Maj = sans magnétisme), poignées de redimensionnement, Alt + glisser dans une vue = recadrer son contenu.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { DimensionItem, PointMm, RectMm, Sheet, SheetItem, ViewportItem } from '../../sheets/types';
import type { Vec3 } from '../../core/views';
import type { SnapKind } from '../../sheets/snap';
import { viewportTransform } from '../../sheets/scales';
import { newId } from '../../sheets/generate';
import { hasRect } from '../../sheets/types';
import type { Handle, LegendEntry, ViewportData } from '../../sheets/SheetSvg';
import { SheetSvg, itemBox } from '../../sheets/SheetSvg';
import { FRAME, PAPER_MM, scaleRect, templateScale } from '../../sheets/template';
import type { DrawingSet } from '../../sheets/types';
import { actions, useEditor } from '../../sheets/store';

export type Tool = 'select' | 'label' | 'text' | 'dim' | 'chain';

/** Point accroché dans une vue : position dans le dessin, sur la planche, type d'accroche. */
export interface SnapResult {
  model: [number, number];
  paper: PointMm;
  kind: SnapKind | null;
}

interface Props {
  doc: DrawingSet;
  sheet: Sheet;
  legend: LegendEntry[];
  viewData: (vp: ViewportItem) => ViewportData | undefined;
  tool: Tool;
  hiddenLayers: { drawing?: boolean; annotations?: boolean; dims?: boolean };
  /** clic avec l'outil Repère / Texte (point papier, fenêtre de vue sous le pointeur) */
  onPlace: (tool: Tool, p: PointMm, viewport: ViewportItem | null) => void;
  /** accroche aux traits d'une vue (survol) */
  snapAt: (vp: ViewportItem, p: PointMm) => SnapResult | null;
  /** point 3D du modèle sous un point accroché (clic) */
  pointAt: (vp: ViewportItem, p: PointMm) => { model: [number, number]; anchor3d?: Vec3 } | null;
  fitSignal: number;
  zoomSignal: { n: number; factor: number };
}

const GRID = 5;

type Drag =
  | { kind: 'move'; ids: string[]; start: PointMm; moved: boolean; noSnap: boolean }
  | { kind: 'resize'; id: string; handle: Handle; start: PointMm; rect: RectMm }
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | { kind: 'content'; id: string; start: PointMm; center: [number, number]; scale: number };

interface DimDraft {
  vpId: string;
  points: Array<{ model: [number, number]; anchor3d: Vec3 }>;
  phase: 'points' | 'place';
  orient: DimensionItem['orient'];
  offset: number;
}

/** Indicateur d'accroche : carré = extrémité, triangle = milieu, cercle = centre, croix = point libre. */
function SnapMarker({ p, kind }: { p: PointMm; kind: SnapKind | null }) {
  const r = 1.6;
  const common = { fill: 'none', stroke: '#2563eb', strokeWidth: 0.35 };
  if (kind === 'end') return <rect x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} {...common} />;
  if (kind === 'mid') return <path d={`M${p.x} ${p.y - r * 1.2}L${p.x + r * 1.1} ${p.y + r * 0.8}L${p.x - r * 1.1} ${p.y + r * 0.8}Z`} {...common} />;
  if (kind === 'center') return <circle cx={p.x} cy={p.y} r={r} {...common} />;
  return <path d={`M${p.x - r} ${p.y}L${p.x + r} ${p.y}M${p.x} ${p.y - r}L${p.x} ${p.y + r}`} {...common} />;
}

export function SheetCanvas({ doc, sheet, legend, viewData, tool, hiddenLayers, onPlace, snapAt, pointAt, fitSignal, zoomSignal }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const selection = useEditor((s) => s.selection);
  const paper = PAPER_MM[sheet.paper];
  const [view, setView] = useState({ zoom: 1, panX: 20, panY: 20 });
  const [preview, setPreview] = useState<Map<string, RectMm | { dx: number; dy: number }> | undefined>();
  const [guides, setGuides] = useState<{ x?: number; y?: number }>({});
  const drag = useRef<Drag | null>(null);
  const space = useRef(false);
  const [dimDraft, setDimDraft] = useState<DimDraft | null>(null);
  const [hover, setHover] = useState<SnapResult | null>(null);
  useEffect(() => {
    setDimDraft(null);
    setHover(null);
  }, [tool, sheet.id]);

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

  const viewportAt = (p: PointMm) =>
    [...sheet.items].reverse().find((i): i is ViewportItem => i.type === 'viewport' && p.x >= i.rect.x && p.x <= i.rect.x + i.rect.w && p.y >= i.rect.y && p.y <= i.rect.y + i.rect.h) ?? null;
  const paperOf = (vp: ViewportItem, m: [number, number]): PointMm | null => {
    const lw = viewData(vp)?.lw;
    if (!lw || !vp.scale) return null;
    const b = lw.boundsMm;
    const c = vp.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
    return viewportTransform(vp.rect, vp.scale, c as [number, number]).toPaper(m[0], m[1]);
  };
  /** orientation et décalage de la ligne de cote d'après la position du pointeur (3e clic) */
  const placeDim = (d: DimDraft, cursor: PointMm, aligned: boolean): Pick<DimDraft, 'orient' | 'offset'> => {
    const vp = sheet.items.find((i) => i.id === d.vpId) as ViewportItem | undefined;
    const pts = vp ? (d.points.map((q) => paperOf(vp, q.model)).filter(Boolean) as PointMm[]) : [];
    if (pts.length < 2) return { orient: d.orient, offset: d.offset };
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    let orient: DimensionItem['orient'];
    if (d.points.length > 2) orient = x1 - x0 >= y1 - y0 ? 'h' : 'v';
    else if (aligned) orient = 'aligned';
    else {
      const outX = cursor.x < x0 ? x0 - cursor.x : cursor.x > x1 ? cursor.x - x1 : 0;
      const outY = cursor.y < y0 ? y0 - cursor.y : cursor.y > y1 ? cursor.y - y1 : 0;
      orient = outY >= outX ? 'h' : 'v';
    }
    const signed = (v: number, lo: number, hi: number) => (v < lo ? v - lo : v > hi ? v - hi : v < (lo + hi) / 2 ? -4 : 4);
    let offset: number;
    if (orient === 'h') offset = signed(cursor.y, y0, y1);
    else if (orient === 'v') offset = signed(cursor.x, x0, x1);
    else {
      const [a, b] = pts;
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      offset = ((cursor.x - a.x) * -(b.y - a.y) + (cursor.y - a.y) * (b.x - a.x)) / l;
    }
    if (Math.abs(offset) < 3) offset = Math.sign(offset || 1) * 3;
    return { orient, offset };
  };
  const finishDim = (d: DimDraft) => {
    const dim: DimensionItem = {
      id: newId('d'),
      type: 'dimension',
      viewportId: d.vpId,
      kind: d.points.length > 2 ? 'chain' : 'linear',
      orient: d.orient,
      anchors3d: d.points.map((q) => q.anchor3d),
      offsetMm: d.offset,
    };
    actions.addItems([dim], d.points.length > 2 ? 'Cote en chaîne' : 'Cote');
    setDimDraft(null);
  };
  const dimClick = (e: ReactPointerEvent, p: PointMm) => {
    if (dimDraft?.phase === 'place') {
      finishDim({ ...dimDraft, ...placeDim(dimDraft, p, e.shiftKey) });
      return;
    }
    const vp = dimDraft ? (sheet.items.find((i) => i.id === dimDraft.vpId) as ViewportItem | undefined) : viewportAt(p);
    if (!vp) return;
    if (tool === 'chain' && dimDraft && e.detail >= 2 && dimDraft.points.length >= 2) {
      setDimDraft({ ...dimDraft, phase: 'place', ...placeDim({ ...dimDraft, phase: 'place' }, p, false) });
      return;
    }
    const pt = pointAt(vp, p);
    if (!pt?.anchor3d) return;
    const last = dimDraft?.points[dimDraft.points.length - 1];
    if (last && Math.hypot(last.model[0] - pt.model[0], last.model[1] - pt.model[1]) < 1e-6) return;
    const points = [...(dimDraft?.points ?? []), { model: pt.model, anchor3d: pt.anchor3d }];
    const next: DimDraft = { vpId: vp.id, points, phase: tool === 'dim' && points.length === 2 ? 'place' : 'points', orient: 'h', offset: -10 };
    setDimDraft(next.phase === 'place' ? { ...next, ...placeDim(next, p, e.shiftKey) } : next);
  };
  useEffect(() => {
    if (tool !== 'chain') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && dimDraft && dimDraft.phase === 'points' && dimDraft.points.length >= 2) setDimDraft({ ...dimDraft, phase: 'place' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tool, dimDraft]);

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
    if (tool === 'dim' || tool === 'chain') {
      dimClick(e, p);
      return;
    }
    if (tool !== 'select') {
      onPlace(tool, p, viewportAt(p));
      return;
    }
    useEditor.getState().select([]);
  };

  const onMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d && (tool === 'dim' || tool === 'chain')) {
      const p = toPaper(e);
      if (dimDraft?.phase === 'place') {
        setDimDraft({ ...dimDraft, ...placeDim(dimDraft, p, e.shiftKey) });
        setHover(null);
        return;
      }
      const vp = dimDraft ? (sheet.items.find((i) => i.id === dimDraft.vpId) as ViewportItem | undefined) ?? null : viewportAt(p);
      setHover(vp ? snapAt(vp, p) : null);
      return;
    }
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
        const bs = moving.map((i) => itemBox(i, sheet, viewData, k));
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
      className={`sheet-canvas tool-${tool === 'chain' ? 'dim' : tool}`}
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
          editing={{
            selection,
            preview: drag.current?.kind === 'content' ? undefined : preview,
            hidden: hiddenLayers,
            onItemDown,
            onHandleDown,
            draft:
              dimDraft && dimDraft.phase === 'place'
                ? [
                    {
                      id: '__draft',
                      type: 'dimension',
                      viewportId: dimDraft.vpId,
                      kind: dimDraft.points.length > 2 ? 'chain' : 'linear',
                      orient: dimDraft.orient,
                      anchors3d: dimDraft.points.map((q) => q.anchor3d),
                      offsetMm: dimDraft.offset,
                    } as DimensionItem,
                  ]
                : undefined,
          }}
        />
        {(tool === 'dim' || tool === 'chain') && (hover || dimDraft) && (
          <svg className="sheet-guides" viewBox={`0 0 ${paper.w} ${paper.h}`} preserveAspectRatio="none">
            {dimDraft?.points.map((q, i) => {
              const vp = sheet.items.find((x) => x.id === dimDraft.vpId) as ViewportItem | undefined;
              const pp = vp && paperOf(vp, q.model);
              return pp ? <circle key={i} cx={pp.x} cy={pp.y} r={0.9} fill="#e63946" /> : null;
            })}
            {hover && <SnapMarker p={hover.paper} kind={hover.kind} />}
          </svg>
        )}
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
