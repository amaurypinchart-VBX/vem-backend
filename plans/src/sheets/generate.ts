// Assistant « Générer le jeu de plans » (§10.3) : gabarits de disposition reproduisant les planches Viewbox de
// référence (jeu NVIDIA : couverture, 4 vues, grands côtés, petits côtés, implantation ; planche par Viewbox SAP).
// Fonction pure : elle produit le document ; les échelles sont fixées ensuite, une fois les vues calculées, et les
// images 3D sont rendues par l'application (captureJobs).
import type { SceneIndex } from '../core/types';
import type { ViewKind } from '../core/views';
import { subsetForLevel, subsetForModules } from '../core/subset';
import type { LineStyleSpec, LineworkRequest } from '../linework/types';
import type { DrawingSet, Image3dItem, Paper, RectMm, Sheet, SheetItem, TitleBlockData, ViewportItem } from './types';
import { COVER, DEFAULT_GENERAL_NOTES, VIEW_TITLE_SIZE, scaleRect, templateScale } from './template';

export type SheetKind = 'cover' | 'fourViews' | 'longSides' | 'shortSides' | 'implantation' | 'assembly' | 'levels' | 'perModule';

export const SHEET_KIND_LABELS: Record<SheetKind, string> = {
  cover: 'Couverture (vues 3D, bandeau)',
  fourViews: '4 vues de l’ensemble (Long side · Top side · Short side · 3D)',
  longSides: 'Élévations des grands côtés',
  shortSides: 'Élévations des petits côtés',
  implantation: 'Plan d’implantation (pieds)',
  assembly: 'Plan d’assemblage (numéros des Viewbox)',
  levels: 'Plan de chaque niveau (sans toit)',
  perModule: 'Une planche par Viewbox (3D, dessus, avant, arrière, gauche, droite)',
};

export const DEFAULT_SHEET_KINDS: SheetKind[] = ['cover', 'fourViews', 'longSides', 'shortSides', 'implantation', 'perModule'];

export interface GenerateOptions {
  modules: string[];
  kinds: SheetKind[];
  paper: Paper;
  style: LineStyleSpec;
  title: string;
}

export interface GenerateContext {
  index: SceneIndex;
  projectId: string;
  modelVersionId: string | null;
  modelKey: string;
  titleBlock: TitleBlockData;
}

/** Image 3D à rendre par l'application (vue iso, sous-ensemble) puis à déposer dans l'élément `itemId`. */
export interface CaptureJob {
  sheetId: string;
  itemId: string;
  include: string[];
  hideCategories: string[];
  view: 'iso-ne' | 'iso-nw' | 'iso-se' | 'iso-sw';
  projection: 'perspective' | 'orthographic';
}

let counter = 0;
export function newId(prefix = 'i'): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}${rnd}`;
}

/** Grand axe de l'ensemble (en plan) : X monde ou Z monde (= Y SketchUp). */
function longAxisOf(index: SceneIndex, include: Set<string>): 'x' | 'z' {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const n of index.nodes) {
    if (!n.bboxMm || !include.has(n.id)) continue;
    x0 = Math.min(x0, n.bboxMm[0]);
    x1 = Math.max(x1, n.bboxMm[3]);
    z0 = Math.min(z0, n.bboxMm[2]);
    z1 = Math.max(z1, n.bboxMm[5]);
  }
  return x1 - x0 >= z1 - z0 ? 'x' : 'z';
}

export function generateDrawingSet(opts: GenerateOptions, ctx: GenerateContext): { set: DrawingSet; captures: CaptureJob[]; dimensioned: string[] } {
  const { index } = ctx;
  const k = templateScale(opts.paper);
  const R = (x: number, y: number, w: number, h: number): RectMm => scaleRect({ x, y, w, h }, k);
  const P = (x: number, y: number) => ({ x: x * k, y: y * k });
  const modules = index.modules.filter((m) => opts.modules.includes(m.id)).sort((a, b) => a.id.localeCompare(b.id));
  const moduleIds = modules.map((m) => m.id);
  const commons = index.commonIds;
  const all = [...subsetForModules(index, moduleIds), ...commons];
  const allSet = new Set(all);
  const long = longAxisOf(index, allSet);
  // vues monde : « long side » = regard perpendiculaire au grand axe
  const longViews: [ViewKind, ViewKind] = long === 'x' ? ['front', 'back'] : ['left', 'right'];
  const shortViews: [ViewKind, ViewKind] = long === 'x' ? ['left', 'right'] : ['front', 'back'];
  const sheets: Sheet[] = [];
  const captures: CaptureJob[] = [];
  /** fenêtres de vue à coter automatiquement une fois les vues calculées */
  const dimensioned: string[] = [];
  const dimmed = (vp: ViewportItem) => {
    dimensioned.push(vp.id);
    return vp;
  };

  const request = (include: string[], kind: ViewKind, frame: 'world' | { moduleId: string }, sub: Partial<LineworkRequest['subset']> = {}): LineworkRequest => ({
    modelId: ctx.modelKey,
    subset: { include, ...sub },
    view: { kind, frame },
    style: opts.style,
  });
  const viewport = (rect: RectMm, req: LineworkRequest, label: string, labelPos?: { x: number; y: number }, extra: Partial<ViewportItem> = {}): ViewportItem => ({
    id: newId('v'),
    type: 'viewport',
    rect,
    request: req,
    scale: 0, // fixée après le calcul des traits
    label,
    showLabel: !!label,
    labelPos,
    renderStyle: 'trait',
    ...extra,
  });
  const image3d = (sheetId: string, rect: RectMm, job: Omit<CaptureJob, 'sheetId' | 'itemId'>, label?: string, labelPos?: { x: number; y: number }): Image3dItem => {
    const item: Image3dItem = { id: newId('c'), type: 'image3d', rect, url: '', width: 0, height: 0, label, showLabel: !!label, labelPos };
    captures.push({ ...job, sheetId, itemId: item.id });
    return item;
  };
  const addSheet = (title: string, items: (sheetId: string) => SheetItem[], kind: Sheet['kind'] = 'standard') => {
    const id = newId('s');
    sheets.push({ id, number: '', title, paper: opts.paper, orientation: 'landscape', kind, items: items(id) });
  };
  const standTitle = `Extract - Plan View - ${opts.title}`;

  if (opts.kinds.includes('cover') && all.length) {
    addSheet(
      'Couverture',
      (sid) =>
        COVER.views.map((r, i) =>
          image3d(sid, scaleRect(r, k), {
            include: all,
            hideCategories: [],
            view: (['iso-sw', 'iso-ne', 'iso-nw', 'iso-se'] as const)[i],
            projection: 'perspective',
          }),
        ),
      'cover',
    );
  }

  if (opts.kinds.includes('fourViews') && all.length) {
    addSheet(standTitle, (sid) => [
      viewport(R(20, 62, 330, 215), request(all, longViews[0], 'world'), 'Long side', P(28, 40)),
      viewport(R(365, 62, 335, 215), request(all, 'top', 'world'), 'Top side', P(380, 40)),
      viewport(R(20, 312, 330, 262), request(all, shortViews[0], 'world'), 'Short side', P(40, 290)),
      image3d(sid, R(365, 312, 335, 262), { include: all, hideCategories: [], view: 'iso-sw', projection: 'perspective' }, '3D', P(362, 290)),
    ]);
  }

  if (opts.kinds.includes('longSides') && all.length) {
    addSheet(standTitle, () => [
      dimmed(viewport(R(20, 62, 685, 228), request(all, longViews[0], 'world'), 'Long side Right', P(25, 40))),
      dimmed(viewport(R(20, 330, 685, 245), request(all, longViews[1], 'world'), 'Long side Left', P(25, 305))),
    ]);
  }

  if (opts.kinds.includes('shortSides') && all.length) {
    addSheet(standTitle, () => [
      dimmed(viewport(R(20, 62, 685, 228), request(all, shortViews[0], 'world'), 'Short side entrance', P(25, 40))),
      dimmed(viewport(R(20, 330, 685, 245), request(all, shortViews[1], 'world'), 'Short side Exit', P(25, 305))),
    ]);
  }

  if (opts.kinds.includes('implantation') && moduleIds.length) {
    addSheet(standTitle, () => [
      dimmed(
        viewport(R(20, 62, 685, 513), request(all, 'top', 'world', { onlyCategories: ['PIED'] }), 'Implantation plan', P(25, 40), {
          overlays: { moduleOutlines: true },
        }),
      ),
    ]);
  }

  if (opts.kinds.includes('assembly') && moduleIds.length) {
    addSheet(standTitle, () => [
      dimmed(viewport(R(20, 62, 685, 513), request(all, 'top', 'world'), 'Assembly plan', P(25, 40), { overlays: { moduleOutlines: true, moduleNumbers: true } })),
    ]);
  }

  if (opts.kinds.includes('levels')) {
    for (const lv of index.levels) {
      const mods = lv.moduleIds.filter((id) => moduleIds.includes(id));
      if (!mods.length) continue;
      const include = subsetForLevel(index, lv.level).filter((id) => allSet.has(id));
      addSheet(`Extract - Plan View - ${lv.label}`, () => [
        dimmed(
          viewport(R(20, 62, 685, 513), request(include, 'top', 'world', { hideCategories: ['TOIT'] }), lv.label, P(25, 40), {
            overlays: { moduleNumbers: true },
          }),
        ),
      ]);
    }
  }

  if (opts.kinds.includes('perModule')) {
    for (const m of modules) {
      const include = subsetForModules(index, [m.id]);
      const f = { moduleId: m.id };
      const below = (r: RectMm) => ({ x: r.x, y: r.y + r.h + 1.5 * k });
      const small = { labelSize: viewTitleSize(opts.paper, true) };
      const r3d = R(20, 40, 325, 170);
      const rFront = R(360, 40, 165, 165);
      const rBack = R(540, 40, 165, 165);
      const rTop = R(20, 228, 325, 145);
      const rLeft = R(20, 395, 325, 160);
      const rRight = R(360, 395, 345, 160);
      addSheet(`Extract - Plan View - ${m.id}${m.type ? ` ${m.type}` : ''}`, (sid) => [
        image3d(sid, r3d, { include, hideCategories: [], view: 'iso-sw', projection: 'perspective' }),
        dimmed(viewport(rFront, request(include, 'front', f), 'Front', below(rFront), small)),
        dimmed(viewport(rBack, request(include, 'back', f), 'Back', below(rBack), small)),
        dimmed(viewport(rTop, request(include, 'top', f, { hideCategories: ['TOIT'] }), 'Top', below(rTop), small)),
        dimmed(viewport(rLeft, request(include, 'left', f), 'Left', below(rLeft), small)),
        dimmed(viewport(rRight, request(include, 'right', f), 'Right', below(rRight), small)),
      ]);
    }
  }

  renumber(sheets);
  const set: DrawingSet = {
    id: '',
    projectId: ctx.projectId,
    modelVersionId: ctx.modelVersionId,
    modelKey: ctx.modelKey,
    title: opts.title,
    templateId: 'viewbox',
    titleBlock: ctx.titleBlock,
    notes: DEFAULT_GENERAL_NOTES,
    sheets,
    revision: 0,
    updatedAt: new Date().toISOString(),
  };
  return { set, captures, dimensioned };
}

/** Numérotation Viewbox : couverture A0.0, puis A0.1, A0.2… */
export function renumber(sheets: Sheet[]): void {
  let n = sheets.some((s) => s.kind === 'cover') ? 0 : 1;
  for (const s of sheets) s.number = `A0.${n++}`;
}

/** Taille des titres de vue selon le format. */
export function viewTitleSize(paper: Paper, small = false): number {
  return VIEW_TITLE_SIZE * templateScale(paper) * (small ? 0.62 : 1);
}
