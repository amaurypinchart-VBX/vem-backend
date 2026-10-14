// Vues spéciales sur les planches (pure) : une fenêtre de vue par bloc (ensemble, chaque Viewbox…), chacune avec sa
// base et ses cotes automatiques ; une planche (tout), une planche par bloc ou une mosaïque de N vues par planche ;
// titre « nom de la vue — 1:50 » + orientation dite ; repères de coupe A–A et niveaux posés sur les autres vues du jeu
// (calques de décoration : les traits de ces vues ne changent pas).
import type { Linework2D, LineStyleSpec } from '../linework/types';
import type { ViewBasis, ViewSpec } from '../core/views';
import type { CustomViewSpec } from '../core/customViews/types';
import type { CutLevelSpec, DimensionItem, DrawingSet, Paper, RectMm, SectionMarkSpec, Sheet, ViewportItem } from './types';
import { DRAW_AREA, scaleRect, templateScale } from './template';
import { fitScale } from './scales';
import { newId, renumber, viewTitleSize } from './generate';

export interface CustomBlockInfo {
  key: string;
  title: string;
  modules: string[];
  lw: Linework2D;
  basis: ViewBasis;
  /** vue du moteur pour ce bloc (avant rotation / miroir) */
  view: ViewSpec;
}

export type CustomSheetMode = 'one' | 'per-block' | 'mosaic';

export interface CustomSheetOptions {
  paper: Paper;
  mode: CustomSheetMode;
  /** mosaïque : vues par planche */
  perSheet: number;
  /** échelle imposée (50 = 1:50) ; 0 = ajustée au cadre */
  scale: number;
  /** blocs posés (clés) ; vide = tous */
  blocks: string[];
  /** orientation dite (« Vue de dessous (miroir du plan) ») */
  subtitle: string;
  style: LineStyleSpec;
  modelKey: string;
  /** cotes automatiques (encombrement de chaque bloc) */
  dims: boolean;
}

export interface CustomSheetDeps {
  /** nœuds du sous-ensemble d'un bloc (Viewbox + accessoires) : cotes automatiques */
  include: (block: CustomBlockInfo) => string[];
  /** cotes automatiques d'une fenêtre (échelle minimale) ; null = pas de cotes (vues iso…) */
  autoDim?: (vp: ViewportItem, block: CustomBlockInfo, minScale: number) => { dims: DimensionItem[]; scale: number; center: [number, number] } | null;
}

/** Rectangles d'une grille de n vues dans la zone de dessin (place pour les titres au-dessus). */
export function gridRects(n: number, paper: Paper): RectMm[] {
  const k = templateScale(paper);
  const area = scaleRect(DRAW_AREA, k);
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cw = area.w / cols;
  const ch = area.h / rows;
  const title = (n > 1 ? 22 : 28) * k;
  const out: RectMm[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ x: area.x + c * cw + 4 * k, y: area.y + r * ch + title, w: cw - 8 * k, h: ch - title - 4 * k });
  }
  return out;
}

/** Titre d'un bloc : « Dessous de toiture — sans plafond tendu » (+ « — VBX-01 = VBX-04 » s'il y a plusieurs blocs). */
export function blockLabel(spec: CustomViewSpec, block: CustomBlockInfo, many: boolean): string {
  return many && block.key !== 'assembled' ? `${spec.name} — ${block.title}` : spec.name;
}

/** Planches d'une vue spéciale. */
export function customViewSheets(spec: CustomViewSpec, all: CustomBlockInfo[], opts: CustomSheetOptions, deps: CustomSheetDeps): Sheet[] {
  const blocks = opts.blocks.length ? all.filter((b) => opts.blocks.includes(b.key)) : all;
  const groups: CustomBlockInfo[][] =
    opts.mode === 'one' ? [blocks] : opts.mode === 'per-block' ? blocks.map((b) => [b]) : Array.from({ length: Math.ceil(blocks.length / Math.max(1, opts.perSheet)) }, (_, i) => blocks.slice(i * opts.perSheet, (i + 1) * opts.perSheet));
  const many = blocks.length > 1;
  const sheets: Sheet[] = [];
  for (const g of groups) {
    if (!g.length) continue;
    const rects = gridRects(g.length, opts.paper);
    const titleSize = viewTitleSize(opts.paper, g.length > 1);
    const items: Sheet['items'] = [];
    const vps: Array<{ vp: ViewportItem; block: CustomBlockInfo }> = g.map((block, i) => {
      const rect = rects[i];
      const b = block.lw.boundsMm;
      const vp: ViewportItem = {
        id: newId('v'),
        type: 'viewport',
        rect,
        request: { modelId: opts.modelKey, subset: { include: deps.include(block) }, view: block.view, style: opts.style },
        scale: opts.scale || fitScale(b, rect),
        center: [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2],
        label: blockLabel(spec, block, many),
        showLabel: true,
        labelSize: titleSize,
        renderStyle: 'trait',
        custom: { viewId: spec.id, block: block.key, subtitle: opts.subtitle || undefined, scaleInTitle: true },
      };
      return { vp, block };
    });
    // cotes automatiques ; une planche de plusieurs Viewbox garde une seule échelle
    if (opts.dims && deps.autoDim) {
      const first = vps.map(({ vp, block }) => ({ vp, block, r: deps.autoDim!(vp, block, opts.scale || 1) }));
      const common = g.length > 1 ? Math.max(...first.map((x) => x.r?.scale ?? x.vp.scale)) : 0;
      for (const { vp, block, r } of first) {
        const res = r && common && r.scale !== common && !opts.scale ? deps.autoDim!(vp, block, common) : r;
        if (!res) continue;
        vp.scale = opts.scale || res.scale;
        vp.center = res.center;
        items.push(...res.dims.map((d) => ({ ...d, viewportId: vp.id })));
      }
    } else if (g.length > 1 && !opts.scale) {
      const common = Math.max(...vps.map((x) => x.vp.scale));
      for (const x of vps) x.vp.scale = common;
    }
    items.unshift(...vps.map((x) => x.vp));
    sheets.push({
      id: newId('s'),
      number: '',
      title: `Extract - ${spec.name}${groups.length > 1 && g.length === 1 && many ? ` - ${g[0].title}` : ''}`,
      paper: opts.paper,
      orientation: 'landscape',
      kind: 'standard',
      items,
    });
  }
  return sheets;
}

/**
 * Ajoute des planches à un jeu (document ou brouillon de l'éditeur) et pose les repères de coupe sur ses vues en plan
 * (dessus / dessous) et les niveaux de coupe sur ses élévations — vues standard seulement, sans doublon.
 */
export function addCustomSheets(set: DrawingSet, sheets: Sheet[], marks: SectionMarkSpec[], levels: CutLevelSpec[]): void {
  set.sheets.push(...sheets);
  renumber(set.sheets);
  if (!marks.length && !levels.length) return;
  for (const s of set.sheets)
    for (const it of s.items) {
      if (it.type !== 'viewport' || it.custom) continue;
      const kind = it.request.view.kind;
      if ((kind === 'top' || kind === 'bottom') && marks.length) {
        const prev = it.overlays?.sectionMarks ?? [];
        const key = (m: SectionMarkSpec) => `${m.label}|${m.a.map(Math.round).join(',')}|${m.b.map(Math.round).join(',')}`;
        const have = new Set(prev.map(key));
        it.overlays = { ...it.overlays, sectionMarks: [...prev, ...marks.filter((m) => !have.has(key(m)))] };
      } else if (kind !== 'custom' && kind !== 'top' && kind !== 'bottom' && levels.length) {
        const prev = it.overlays?.cutLevels ?? [];
        const have = new Set(prev.map((l) => Math.round(l.y)));
        it.overlays = { ...it.overlays, cutLevels: [...prev, ...levels.filter((l) => !have.has(Math.round(l.y)))] };
      }
    }
}
