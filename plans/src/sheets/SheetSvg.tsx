// Rendu SVG d'une planche (écran, vignettes, export) : gabarit Viewbox (cadre, cartouche, légende automatique)
// et éléments (fenêtres de vue vectorielles, images 3D, repères, textes, formes, logos). Coordonnées en mm papier.
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { memo } from 'react';
import type { ViewBasis } from '../core/views';
import { projectPoint } from '../core/views';
import type { Linework2D } from '../linework/types';
import { STROKE_MM } from '../linework/svg';
import type { LogoShape } from './logos';
import { LOGO_COLOR, VB_LOGO, VIEWBOX_WORDMARK } from './logos';
import type { DimensionItem, Image3dItem, LabelItem, PointMm, RectMm, Sheet, SheetItem, TextItem, TitleBlockData, ViewportItem } from './types';
import type { DimInput } from './dimensions';
import { DIM, dimGeometry, dimOffsetAfterDrag } from './dimensions';
import { COVER, FONT_SANS, FONT_SERIF, FRAME, PAPER_MM, TB, TITLE_BOX, VIEW_TITLE_SIZE, scaleRect, templateScale } from './template';
import type { ModuleOverlay } from './overlays';
import { moduleNumber } from './overlays';
import { scaleLabel, viewportTransform } from './scales';

export interface LegendEntry {
  key: string;
  label: string;
  color: string;
}

/** Ce qu'il faut pour dessiner une fenêtre de vue (calculé par l'éditeur). */
export interface ViewportData {
  lw?: Linework2D;
  basis?: ViewBasis;
  stale?: boolean;
  busy?: boolean;
  error?: string;
  overlays?: ModuleOverlay[];
}

export interface SheetSvgProps {
  sheet: Sheet;
  titleBlock: TitleBlockData;
  notes: string;
  legend: LegendEntry[];
  viewData: (vp: ViewportItem) => ViewportData | undefined;
  /** vignette : vues esquissées (cadres), pas de traits */
  thumbnail?: boolean;
  /** édition : sélection, poignées, états des vues */
  editing?: {
    selection: string[];
    preview?: Map<string, RectMm | { dx: number; dy: number }>;
    hidden?: { drawing?: boolean; annotations?: boolean; dims?: boolean };
    /** éléments provisoires (cote en cours de tracé) */
    draft?: SheetItem[];
    onItemDown?: (e: ReactPointerEvent, item: SheetItem) => void;
    onHandleDown?: (e: ReactPointerEvent, item: SheetItem, handle: string) => void;
  };
  className?: string;
  style?: React.CSSProperties;
  svgRef?: React.Ref<SVGSVGElement>;
}

const num = (v: number) => Math.round(v * 1000) / 1000;

/** Coupe un texte en lignes pour une largeur donnée (estimation : largeur moyenne d'un caractère ≈ 0,5 × hauteur). */
export function wrapText(text: string, widthMm: number, sizeMm: number, charRatio = 0.5): string[] {
  const max = Math.max(4, Math.floor(widthMm / (sizeMm * charRatio)));
  const out: string[] = [];
  for (const para of (text || '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (!word) continue;
      if ((line + ' ' + word).trim().length > max && line) {
        out.push(line);
        line = word;
      } else line = (line + ' ' + word).trim();
    }
    out.push(line);
  }
  return out;
}

/** Texte positionné par le haut de sa ligne (comme les relevés des planches de référence). */
function T(props: { x: number; top: number; size: number; children: ReactNode; bold?: boolean; sans?: boolean; fill?: string; anchor?: 'start' | 'middle' | 'end' }) {
  const { x, top, size, bold, sans, fill, anchor } = props;
  return (
    <text
      x={num(x)}
      y={num(top + size * 0.8)}
      fontSize={num(size)}
      fontFamily={sans ? FONT_SANS : FONT_SERIF}
      fontWeight={bold ? 700 : 400}
      fill={fill ?? '#000'}
      textAnchor={anchor}
    >
      {props.children}
    </text>
  );
}

function Logo({ shape, rect }: { shape: LogoShape; rect: RectMm }) {
  return (
    <svg x={num(rect.x)} y={num(rect.y)} width={num(rect.w)} height={num(rect.h)} viewBox={`0 0 ${shape.width} ${shape.height}`} preserveAspectRatio="xMidYMid meet" overflow="visible">
      <g transform={shape.transform} fill={LOGO_COLOR}>
        <path d={shape.d} />
      </g>
    </svg>
  );
}

// ─── gabarit ───
function TitleColumn({ sheet, tb, notes, legend, k }: { sheet: Sheet; tb: TitleBlockData; notes: string; legend: LegendEntry[]; k: number }) {
  const s = TB.size;
  const x = TB.textX * k;
  const x2 = TB.col2 * k;
  const colW = (TB.col2 - TB.textX - 2) * k;
  const col2W = (TB.right - TB.col2 - 1) * k;
  const lines = (text: string, top: number, width: number, size: number, sans = false, max = 3) =>
    wrapText(text, width, size * k)
      .slice(0, max)
      .map((l, i) => (
        <T key={i} x={0} top={top + i * size * 1.15 * k} size={size * k} sans={sans}>
          {l}
        </T>
      ));
  const at = (dx: number, children: ReactNode) => <g transform={`translate(${num(dx)} 0)`}>{children}</g>;
  const person = (p: { name: string; email: string }, top: number, left: number) => (
    <>
      <T x={left} top={top} size={s.small * k}>
        {p.name}
      </T>
      <T x={left} top={top + 3.6 * k} size={s.small * k}>
        {p.email}
      </T>
    </>
  );
  const noteLines = notes.split('\n');
  return (
    <g>
      <Logo shape={VB_LOGO} rect={scaleRect(TB.logo, k)} />
      <T x={x} top={TB.company.y * k} size={s.header * k} bold>
        Viewbox International S.A.
      </T>
      {TB.company.lines.map((l, i) => (
        <T key={l} x={x} top={(TB.company.y + 4.7 + i * TB.company.lineStep) * k} size={s.body * k}>
          {l}
        </T>
      ))}
      <g stroke="#000" strokeWidth={num(0.18 * k)}>
        {TB.separators.map((y) => (
          <line key={y} x1={num(TB.left * k)} x2={num(TB.right * k)} y1={num(y * k)} y2={num(y * k)} />
        ))}
      </g>
      <T x={x} top={TB.client.y * k} size={s.header * k} bold>
        CLIENT
      </T>
      <T x={x2} top={TB.client.y * k} size={s.header * k} bold>
        Installation Address
      </T>
      {at(x, lines(tb.client, (TB.client.y + 5) * k, colW, s.body))}
      {at(x2, lines(tb.address, (TB.client.y + 5) * k, col2W, s.body))}
      <T x={x} top={TB.project.y * k} size={s.header * k} bold>
        PROJECT Name
      </T>
      <T x={x2} top={TB.project.y * k} size={s.header * k} bold>
        Project Date
      </T>
      {at(x, lines(tb.projectName, (TB.project.y + 5) * k, colW, s.body, false, 3))}
      <T x={x2} top={(TB.project.y + 4.6) * k} size={s.body * k}>
        {tb.projectDate}
      </T>
      <T x={x2} top={TB.project.issueY * k} size={s.body * k} bold>
        ISSUE
      </T>
      <T x={x2} top={(TB.project.issueY + 3.8) * k} size={s.body * k}>
        {tb.issue}
      </T>
      <T x={x} top={TB.people.y * k} size={s.header * k} bold>
        Sales Ingenior
      </T>
      {person(tb.salesEngineer, (TB.people.y + 4.6) * k, x)}
      <T x={x2} top={TB.people.y * k} size={s.header * k} bold>
        Technical Manager
      </T>
      {person(tb.technicalManager, (TB.people.y + 4.6) * k, x2)}
      <T x={x2} top={TB.people.projectManagerY * k} size={s.header * k} bold>
        PROJECT Manager
      </T>
      {person(tb.projectManager, (TB.people.projectManagerY + 4.6) * k, x2)}
      <T x={x} top={TB.notes.y * k} size={s.notes * k} sans>
        GENERAL NOTES VIEWBOX
      </T>
      {noteLines.map((l, i) => (
        <T key={i} x={x} top={(TB.notes.y + (i + 1) * TB.notes.lineStep) * k} size={s.notes * k} sans>
          {l}
        </T>
      ))}
      <T x={x} top={TB.legend.y * k} size={s.legend * k}>
        DRAWING LEGEND
      </T>
      {legend.map((e, i) => {
        const y = (TB.legend.firstItemY + i * TB.legend.step) * k;
        return (
          <g key={e.key}>
            <line x1={num(TB.legend.lineX0 * k)} x2={num(TB.legend.lineX1 * k)} y1={num(y + 1.3 * k)} y2={num(y + 1.3 * k)} stroke={e.color} strokeWidth={num(0.6 * k)} />
            <T x={TB.legend.labelX * k} top={y} size={s.legend * k} fill={e.color === '#FFFB14' ? '#b5a800' : e.color}>
              {e.label}
            </T>
          </g>
        );
      })}
      <T x={x} top={TB.drawnBy.y * k} size={s.small * k} bold>
        DRAWN BY
      </T>
      <T x={x} top={(TB.drawnBy.y + 3.9) * k} size={s.small * k}>
        {tb.drawnBy}
      </T>
      <T x={x2} top={TB.drawnBy.y * k} size={s.small * k} bold>
        Created date
      </T>
      <T x={x2} top={(TB.drawnBy.y + 3.9) * k} size={s.small * k}>
        {tb.createdDate}
      </T>
      <T x={x} top={TB.drawnBy.deadlineY * k} size={s.small * k} bold>
        Deadline for Approval
      </T>
      <T x={x} top={(TB.drawnBy.deadlineY + 3.9) * k} size={s.small * k}>
        {tb.deadline}
      </T>
      <T x={x2} top={TB.drawnBy.deadlineY * k} size={s.small * k} bold>
        Drawing Version
      </T>
      <T x={x2} top={(TB.drawnBy.deadlineY + 3.9) * k} size={s.small * k}>
        {tb.drawingVersion}
      </T>
      <T x={(TB.signature.box.x + 0.9) * k} top={TB.signature.labelY * k} size={s.small * k} bold>
        Signature
      </T>
      <rect {...rectAttrs(scaleRect(TB.signature.box, k))} fill="none" stroke="#000" strokeWidth={num(0.18 * k)} />
      <T x={(TB.left + (TB.right - TB.left) / 2) * k} top={TB.sheetNumber.y * k} size={TB.sheetNumber.size * k} bold anchor="middle">
        {sheet.number}
      </T>
    </g>
  );
}

function CoverBand({ tb, sheet, k }: { tb: TitleBlockData; sheet: Sheet; k: number }) {
  const b = COVER.band;
  const cols: Array<[string, string]> = [
    ['CLIENT', tb.client],
    ['PROJECT', tb.projectName],
    ['PROJECT NO.', tb.projectNumber],
    ['DRAWN BY', tb.drawnBy],
    ['ISSUE', tb.issue],
    ['DESCRIPTION', tb.description || sheet.title],
  ];
  return (
    <g>
      <Logo shape={VIEWBOX_WORDMARK} rect={scaleRect(COVER.wordmark, k)} />
      <Logo shape={VB_LOGO} rect={scaleRect(COVER.logo, k)} />
      {b.columns.map((cx, i) => {
        const w = (i < b.columns.length - 1 ? b.columns[i + 1] - cx : 100) - 3;
        return (
          <g key={cx}>
            <line x1={num(cx * k)} x2={num(cx * k)} y1={num(b.y * k)} y2={num((b.y + b.h) * k)} stroke="#000" strokeWidth={num(0.18 * k)} />
            <T x={(cx + 2.8) * k} top={b.labelY * k} size={b.size * k} bold>
              {cols[i][0]}
            </T>
            {wrapText(cols[i][1], w * k, b.size * k)
              .slice(0, 3)
              .map((l, j) => (
                <T key={j} x={(cx + 2.8) * k} top={(b.valueY + j * b.size * 1.15) * k} size={b.size * k}>
                  {l}
                </T>
              ))}
          </g>
        );
      })}
    </g>
  );
}

const rectAttrs = (r: RectMm) => ({ x: num(r.x), y: num(r.y), width: num(Math.max(0, r.w)), height: num(Math.max(0, r.h)) });

// ─── traits d'une vue (chemins mis en cache par jeu de traits) ───
const pathCache = new WeakMap<Linework2D, Array<{ key: string; d: string }>>();
function layerPaths(lw: Linework2D): Array<{ key: string; d: string }> {
  let hit = pathCache.get(lw);
  if (hit) return hit;
  hit = lw.layers.map((l) => {
    let d = '';
    for (const pl of l.polylines) {
      if (pl.length < 4) continue;
      d += `M${num(pl[0])} ${num(pl[1])}`;
      for (let i = 2; i < pl.length; i += 2) d += `L${num(pl[i])} ${num(pl[i + 1])}`;
    }
    return { key: l.key, d };
  });
  pathCache.set(lw, hit);
  return hit;
}

function viewportCenter(vp: ViewportItem, lw?: Linework2D): [number, number] {
  if (vp.center) return vp.center;
  if (!lw) return [0, 0];
  const b = lw.boundsMm;
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}

function ViewportContent({ vp, data, rect, thumbnail, categoryColors }: { vp: ViewportItem; data?: ViewportData; rect: RectMm; thumbnail?: boolean; categoryColors: Map<string, string> }) {
  const lw = data?.lw;
  const clipId = `clip-${vp.id}`;
  if (!lw || !vp.scale || thumbnail) {
    return (
      <g>
        <rect {...rectAttrs(rect)} fill={thumbnail ? '#f1f3f6' : '#fafbfc'} stroke="#c9ced8" strokeWidth={0.3} strokeDasharray={thumbnail ? undefined : '2 1.5'} />
        {!thumbnail && (
          <text x={num(rect.x + rect.w / 2)} y={num(rect.y + rect.h / 2)} fontSize={4} textAnchor="middle" fill="#8b94a7" fontFamily={FONT_SANS}>
            {data?.error ? `⚠ ${data.error}` : data?.busy ? 'Calcul de la vue…' : 'Vue non calculée'}
          </text>
        )}
      </g>
    );
  }
  const c = viewportCenter(vp, lw);
  const s = vp.scale;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const tr = `translate(${num(cx)} ${num(cy)}) scale(${num(1 / s)} ${num(-1 / s)}) translate(${num(-c[0])} ${num(-c[1])})`;
  const paths = layerPaths(lw);
  const overlays = data?.overlays ?? [];
  const toPaper = viewportTransform(rect, s, c).toPaper;
  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect {...rectAttrs(rect)} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g transform={tr} fill="none" strokeLinecap="round" strokeLinejoin="round">
          {vp.overlays?.statusColors &&
            overlays.map((o) =>
              vp.overlays?.statusColors?.[o.moduleId] ? (
                <path key={`f${o.moduleId}`} d={polyD(o.outline)} fill={vp.overlays.statusColors[o.moduleId]} fillOpacity={0.35} stroke="none" />
              ) : null,
            )}
          {paths.map(({ key, d }) => {
            if (!d) return null;
            if (key.startsWith('category:')) {
              const color = categoryColors.get(key.slice(9)) ?? '#888';
              return <path key={key} d={d} stroke={color} strokeWidth={num(STROKE_MM.category * s)} strokeLinecap="butt" opacity={0.9} />;
            }
            const w = STROKE_MM[key as 'silhouette' | 'visible' | 'fine' | 'hidden'] ?? 0.18;
            return <path key={key} d={d} stroke="#000" strokeWidth={num(w * s)} strokeDasharray={key === 'hidden' ? `${num(1.2 * s)} ${num(0.8 * s)}` : undefined} />;
          })}
          {vp.overlays?.moduleOutlines &&
            overlays.map((o) => <path key={`o${o.moduleId}`} d={polyD(o.outline)} stroke="#000" strokeWidth={num(0.18 * s)} strokeDasharray={`${num(3 * s)} ${num(1.5 * s)}`} />)}
        </g>
        {vp.overlays?.moduleNumbers &&
          overlays.map((o) => {
            const p = toPaper(o.center.x, o.center.y);
            const size = Math.max(5, Math.min(40, o.minSize / s / 2.2));
            return (
              <text key={`n${o.moduleId}`} x={num(p.x)} y={num(p.y + size * 0.35)} fontSize={num(size)} textAnchor="middle" fontFamily={FONT_SERIF} fontWeight={700} fill="#1a021d">
                {moduleNumber(o.moduleId)}
              </text>
            );
          })}
      </g>
    </g>
  );
}

function polyD(pl: Float64Array): string {
  let d = `M${num(pl[0])} ${num(pl[1])}`;
  for (let i = 2; i < pl.length; i += 2) d += `L${num(pl[i])} ${num(pl[i + 1])}`;
  return d + 'Z';
}

function ViewTitle({ text, pos, size }: { text: string; pos: PointMm; size: number }) {
  return (
    <T x={pos.x} top={pos.y} size={size}>
      {text}
    </T>
  );
}

/** Position papier de l'ancre d'un repère (suit la vue si le repère est ancré sur un point 3D). */
export function labelAnchor(label: LabelItem, sheet: Sheet, viewData: (vp: ViewportItem) => ViewportData | undefined): PointMm | null {
  if (label.viewportId && label.anchor3d) {
    const vp = sheet.items.find((i) => i.id === label.viewportId) as ViewportItem | undefined;
    const data = vp && viewData(vp);
    if (vp && data?.basis && vp.scale) {
      const p = projectPoint(data.basis, label.anchor3d);
      return viewportTransform(vp.rect, vp.scale, viewportCenter(vp, data.lw)).toPaper(p.x, p.y);
    }
  }
  return label.anchorPaper ?? null;
}

/** Points d'une cote sur la planche (et dans le dessin) : projection de ses ancrages 3D par sa fenêtre de vue. */
export function dimensionInput(dim: DimensionItem, sheet: Sheet, viewData: (vp: ViewportItem) => ViewportData | undefined): DimInput | null {
  const vp = sheet.items.find((i) => i.id === dim.viewportId) as ViewportItem | undefined;
  const data = vp && viewData(vp);
  if (!vp || !data?.basis || !vp.scale) return null;
  const tr = viewportTransform(vp.rect, vp.scale, viewportCenter(vp, data.lw));
  const model = dim.anchors3d.map((a) => {
    const p = projectPoint(data.basis!, a);
    return [p.x, p.y] as [number, number];
  });
  return { orient: dim.orient, paper: model.map(([x, y]) => tr.toPaper(x, y)), model, offsetMm: dim.offsetMm, textOverride: dim.textOverride, ends: dim.ends };
}

function DimensionView({ input }: { input: DimInput }) {
  const g = dimGeometry(input);
  return (
    <g>
      <g stroke="#000" strokeWidth={DIM.line} strokeLinecap="butt">
        {g.lines.map((l, i) => (
          <line key={i} x1={num(l[0])} y1={num(l[1])} x2={num(l[2])} y2={num(l[3])} />
        ))}
      </g>
      <g stroke="#000" strokeWidth={0.3} strokeLinecap="butt">
        {g.ticks.map((l, i) => (
          <line key={i} x1={num(l[0])} y1={num(l[1])} x2={num(l[2])} y2={num(l[3])} />
        ))}
      </g>
      {g.arrows.map((a, i) => (
        <path key={i} d="M0 0 L-2.2 -0.6 L-2.2 0.6 Z" fill="#000" transform={`translate(${num(a.x)} ${num(a.y)}) rotate(${num(a.angle)})`} />
      ))}
      {g.texts.map((t, i) => (
        <text
          key={i}
          x={num(t.x)}
          y={num(t.y)}
          fontSize={DIM.text}
          fontFamily={FONT_SERIF}
          fontStyle={t.override ? 'italic' : undefined}
          textAnchor="middle"
          transform={t.rotate ? `rotate(${num(t.rotate)} ${num(t.x)} ${num(t.y)})` : undefined}
        >
          {t.text}
          {t.override && <tspan fill="#c2410c"> ✱</tspan>}
        </text>
      ))}
    </g>
  );
}

function LabelView({ label, anchor, k }: { label: LabelItem; anchor: PointMm | null; k: number }) {
  const size = (label.style === 'bold' ? 4.2 : 3.6) * k;
  const width = label.text.length * size * 0.52;
  // la ligne d'attache arrive sur le bord du texte le plus proche de l'ancre
  const tx = label.textPos.x;
  const ty = label.textPos.y;
  const endX = anchor && anchor.x > tx + width / 2 ? tx + width : tx;
  const endY = ty - size * 0.3;
  return (
    <g>
      {anchor && (
        <>
          <line x1={num(anchor.x)} y1={num(anchor.y)} x2={num(endX)} y2={num(endY)} stroke="#000" strokeWidth={num(0.18 * k)} />
          <circle cx={num(anchor.x)} cy={num(anchor.y)} r={num(0.5 * k)} fill="#000" />
        </>
      )}
      <text x={num(tx)} y={num(ty)} fontSize={num(size)} fontFamily={FONT_SERIF} fontWeight={label.style === 'bold' ? 700 : 400}>
        {label.text}
      </text>
    </g>
  );
}

/** Rectangle englobant (mm papier) d'un élément, pour la sélection et l'accroche. */
export function itemBounds(item: SheetItem, anchor?: PointMm | null, k = 1, dimBox?: RectMm | null): RectMm {
  if (item.type === 'dimension') return dimBox ?? { x: 0, y: 0, w: 0, h: 0 };
  if (item.type !== 'label') return item.rect;
  const size = (item.style === 'bold' ? 4.2 : 3.6) * k;
  const w = Math.max(4, item.text.length * size * 0.52);
  let r = { x: item.textPos.x, y: item.textPos.y - size, w, h: size * 1.25 };
  if (anchor) {
    const x0 = Math.min(r.x, anchor.x);
    const y0 = Math.min(r.y, anchor.y);
    r = { x: x0, y: y0, w: Math.max(r.x + r.w, anchor.x) - x0, h: Math.max(r.y + r.h, anchor.y) - y0 };
  }
  return r;
}

function applyPreview(item: SheetItem, p?: RectMm | { dx: number; dy: number }): SheetItem {
  if (!p) return item;
  if (item.type === 'dimension') return 'dx' in p ? { ...item, offsetMm: dimOffsetAfterDrag(item, p.dx, p.dy) } : item;
  if ('dx' in p) {
    if (item.type === 'label')
      return { ...item, textPos: { x: item.textPos.x + p.dx, y: item.textPos.y + p.dy }, anchorPaper: item.anchorPaper && { x: item.anchorPaper.x + p.dx, y: item.anchorPaper.y + p.dy } };
    const moved = { ...item, rect: { ...item.rect, x: item.rect.x + p.dx, y: item.rect.y + p.dy } } as SheetItem;
    if ('labelPos' in moved && moved.labelPos) (moved as ViewportItem).labelPos = { x: moved.labelPos.x + p.dx, y: moved.labelPos.y + p.dy };
    return moved;
  }
  return item.type === 'label' ? item : ({ ...item, rect: p } as SheetItem);
}

/** Rectangle englobant (mm papier) de n'importe quel élément de la planche (repères et cotes suivent leur vue). */
export function itemBox(item: SheetItem, sheet: Sheet, viewData: (vp: ViewportItem) => ViewportData | undefined, k = 1): RectMm {
  if (item.type === 'label') return itemBounds(item, labelAnchor(item, sheet, viewData), k);
  if (item.type === 'dimension') {
    const input = dimensionInput(item, sheet, viewData);
    return itemBounds(item, null, k, input ? dimGeometry(input).box : null);
  }
  return item.rect;
}

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
export type Handle = (typeof HANDLES)[number];

export const SheetSvg = memo(function SheetSvg(props: SheetSvgProps) {
  const { sheet, titleBlock, notes, legend, viewData, thumbnail, editing } = props;
  const paper = PAPER_MM[sheet.paper];
  const k = templateScale(sheet.paper);
  const categoryColors = new Map(legend.map((e) => [e.key, e.color]));
  const titleSize = VIEW_TITLE_SIZE * k;
  const hidden = editing?.hidden ?? {};
  const items = [...sheet.items, ...(editing?.draft ?? [])].map((i) => applyPreview(i, editing?.preview?.get(i.id)));
  const previewSheet = editing?.preview?.size ? { ...sheet, items } : sheet;
  const selected = new Set(editing?.selection ?? []);

  const renderItem = (item: SheetItem) => {
    const isAnnotation = item.type === 'label' || item.type === 'text';
    const isDim = item.type === 'dimension';
    if ((isAnnotation && hidden.annotations) || (isDim && hidden.dims) || (!isAnnotation && !isDim && hidden.drawing)) return null;
    const down = editing?.onItemDown ? (e: ReactPointerEvent) => editing.onItemDown!(e, item) : undefined;
    let body: ReactNode = null;
    switch (item.type) {
      case 'viewport': {
        const data = viewData(item);
        body = (
          <>
            <ViewportContent vp={item} data={data} rect={item.rect} thumbnail={thumbnail} categoryColors={categoryColors} />
            {item.showLabel && item.label && (
              <ViewTitle text={item.label} pos={item.labelPos ?? { x: item.rect.x, y: item.rect.y - titleSize * 1.3 }} size={item.labelSize ?? titleSize} />
            )}
            {editing && data?.stale && (
              <text x={num(item.rect.x + item.rect.w - 1)} y={num(item.rect.y + 4)} fontSize={3} textAnchor="end" fill="#c2410c" fontFamily={FONT_SANS}>
                ⚠ vue obsolète : Recalculer
              </text>
            )}
            {editing && item.scale > 0 && (
              <text x={num(item.rect.x + item.rect.w - 1)} y={num(item.rect.y + item.rect.h - 1.2)} fontSize={2.6} textAnchor="end" fill="#9aa3b5" fontFamily={FONT_SANS}>
                {scaleLabel(item.scale)}
              </text>
            )}
          </>
        );
        break;
      }
      case 'image3d': {
        const it = item as Image3dItem;
        body = (
          <>
            {it.url ? (
              <image href={it.url} {...rectAttrs(it.rect)} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <g>
                <rect {...rectAttrs(it.rect)} fill="#f1f3f6" stroke="#c9ced8" strokeWidth={0.3} />
                {!thumbnail && (
                  <text x={num(it.rect.x + it.rect.w / 2)} y={num(it.rect.y + it.rect.h / 2)} fontSize={4} textAnchor="middle" fill="#8b94a7" fontFamily={FONT_SANS}>
                    Image 3D en préparation…
                  </text>
                )}
              </g>
            )}
            {it.showLabel && it.label && <ViewTitle text={it.label} pos={it.labelPos ?? { x: it.rect.x, y: it.rect.y - titleSize * 1.3 }} size={it.labelSize ?? titleSize} />}
          </>
        );
        break;
      }
      case 'label':
        body = <LabelView label={item} anchor={labelAnchor(item, previewSheet, viewData)} k={k} />;
        break;
      case 'dimension': {
        const input = dimensionInput(item, previewSheet, viewData);
        body = input ? <DimensionView input={input} /> : null;
        break;
      }
      case 'text': {
        const t = item as TextItem;
        const size = t.size;
        const x = t.align === 'center' ? t.rect.x + t.rect.w / 2 : t.align === 'right' ? t.rect.x + t.rect.w : t.rect.x;
        body = (
          <g>
            {wrapText(t.text, t.rect.w, size).map((l, i) => (
              <T key={i} x={x} top={t.rect.y + i * size * 1.2} size={size} bold={t.bold} sans={t.font === 'sans'} anchor={t.align === 'center' ? 'middle' : t.align === 'right' ? 'end' : 'start'}>
                {l}
              </T>
            ))}
          </g>
        );
        break;
      }
      case 'shape':
        body =
          item.shape === 'line' ? (
            <line x1={num(item.rect.x)} y1={num(item.rect.y)} x2={num(item.rect.x + item.rect.w)} y2={num(item.rect.y + item.rect.h)} stroke={item.stroke ?? '#000'} strokeWidth={num(item.strokeMm)} />
          ) : (
            <rect {...rectAttrs(item.rect)} fill={item.fill ?? 'none'} stroke={item.stroke ?? '#000'} strokeWidth={num(item.strokeMm)} />
          );
        break;
      case 'logo':
        body = <Logo shape={item.logo === 'vb' ? VB_LOGO : VIEWBOX_WORDMARK} rect={item.rect} />;
        break;
    }
    if (!editing) return <g key={item.id}>{body}</g>;
    const anchor = item.type === 'label' ? labelAnchor(item, previewSheet, viewData) : null;
    const b = itemBounds(item, anchor, k, dimBoxOf(item));
    return (
      <g key={item.id} onPointerDown={down} style={{ cursor: item.locked ? 'default' : 'move' }}>
        {body}
        {/* zone de clic : tout le cadre de l'élément */}
        <rect {...rectAttrs(b)} fill="transparent" stroke="none" />
      </g>
    );
  };

  const dimBoxOf = (item: SheetItem): RectMm | null => {
    if (item.type !== 'dimension') return null;
    const input = dimensionInput(item, previewSheet, viewData);
    return input ? dimGeometry(input).box : null;
  };

  const selOverlay = () => {
    if (!editing || !selected.size) return null;
    const out: ReactNode[] = [];
    const sel = items.filter((i) => selected.has(i.id));
    for (const item of sel) {
      const anchor = item.type === 'label' ? labelAnchor(item, previewSheet, viewData) : null;
      const b = itemBounds(item, anchor, k, dimBoxOf(item));
      out.push(
        <rect key={`sel-${item.id}`} {...rectAttrs({ x: b.x - 0.8, y: b.y - 0.8, w: b.w + 1.6, h: b.h + 1.6 })} fill="none" stroke={item.locked ? '#9aa3b5' : '#2563eb'} strokeWidth={0.4} strokeDasharray="1.5 1" pointerEvents="none" />,
      );
    }
    if (sel.length === 1 && sel[0].type !== 'label' && sel[0].type !== 'dimension' && !sel[0].locked && editing.onHandleDown) {
      const item = sel[0];
      const r = item.rect;
      const hs = 2.2;
      const pos: Record<Handle, [number, number]> = {
        nw: [r.x, r.y],
        n: [r.x + r.w / 2, r.y],
        ne: [r.x + r.w, r.y],
        e: [r.x + r.w, r.y + r.h / 2],
        se: [r.x + r.w, r.y + r.h],
        s: [r.x + r.w / 2, r.y + r.h],
        sw: [r.x, r.y + r.h],
        w: [r.x, r.y + r.h / 2],
      };
      for (const h of HANDLES) {
        out.push(
          <rect
            key={`h-${h}`}
            x={num(pos[h][0] - hs / 2)}
            y={num(pos[h][1] - hs / 2)}
            width={hs}
            height={hs}
            fill="#fff"
            stroke="#2563eb"
            strokeWidth={0.35}
            style={{ cursor: `${h}-resize` }}
            onPointerDown={(e) => editing.onHandleDown!(e, item, h)}
          />,
        );
      }
    }
    return <g>{out}</g>;
  };

  return (
    <svg
      ref={props.svgRef}
      xmlns="http://www.w3.org/2000/svg"
      width={`${paper.w}mm`}
      height={`${paper.h}mm`}
      viewBox={`0 0 ${paper.w} ${paper.h}`}
      className={props.className}
      style={props.style}
    >
      <rect x={0} y={0} width={paper.w} height={paper.h} fill="#fff" />
      {sheet.kind === 'cover' ? (
        <CoverBand tb={titleBlock} sheet={sheet} k={k} />
      ) : (
        <g>
          <rect {...rectAttrs(scaleRect(FRAME, k))} fill="none" stroke="#000" strokeWidth={num(0.18 * k)} />
          <rect {...rectAttrs(scaleRect(TITLE_BOX, k))} fill="#fff" stroke="#000" strokeWidth={num(0.18 * k)} />
          <T x={(TITLE_BOX.x + 0.8) * k} top={(TITLE_BOX.y + 5.3) * k} size={4.6 * k}>
            {sheet.title}
          </T>
          <TitleColumn sheet={sheet} tb={titleBlock} notes={notes} legend={legend} k={k} />
        </g>
      )}
      {items.map(renderItem)}
      {selOverlay()}
    </svg>
  );
});
