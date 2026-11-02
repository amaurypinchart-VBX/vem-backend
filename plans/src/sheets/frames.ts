// Cadres textile (tissu tendu, SEG) sur les planches : détection (marqués dans SketchUp — extension ≥ 1.4.0 —, sinon
// étiquette de vue « cadre-textile » : catégorie FRAME-FOR-TEXTILE, nom TEXTILE / TISSU / FABRIC / SEG…, étiquette
// mémorisée), mesure dans le repère de leur Viewbox (largeur × hauteur × épaisseur), **un repère par cadre** F1, F2…
// (celui saisi dans SketchUp, sinon numéroté dans l'ordre Viewbox / tour de la box : chaque cadre a son impression),
// nomenclature ligne par ligne, dessins de détail regroupés par taille (« F1, F3 — 2 000 × 2 000 »), repères sur les vues.
// La mesure lit la géométrie (three) ; numérotation, regroupement, planches et repères sont purs.
import type { Mesh } from 'three';
import { Vector3 } from 'three';
import type { Vec3, ViewKind, ViewSpec } from '../core/views';
import { dot, viewBasis } from '../core/views';
import type { SceneIndex } from '../core/types';
import { TEXTILE_TAG } from '../core/customViews/tags';
import { displayLabel } from '../core/customViews/editor';
import type { LoadedScene } from '../scene/loadedScene';
import { nodeIdOf } from '../scene/loadedScene';
import { subsetEnv, textileFrameOf } from '../linework/subset';
import type { Linework2D, LineStyleSpec } from '../linework/types';
import { isDecorationLayer } from '../linework/types';
import type { ViewBasis } from '../core/views';
import type { LabelItem, Paper, RectMm, Sheet, SheetItem, TextItem, ViewportItem, ShapeItem } from './types';
import { DRAW_AREA, VIEW_TITLE_SIZE, scaleRect, templateScale } from './template';
import { newId } from './generate';
import { viewportTransform } from './scales';

export type FrameLang = 'fr' | 'en';

/** Un cadre du modèle, mesuré. */
export interface FrameInfo {
  nodeId: string;
  /** Viewbox du cadre (hiérarchie ou position), sinon null (élément commun) */
  moduleId: string | null;
  /** désignation lisible */
  label: string;
  definition?: string;
  /** largeur, hauteur (face vue), épaisseur (mm) */
  w: number;
  h: number;
  t: number;
  /** vue qui montre la face du cadre */
  view: ViewSpec;
  /** côté de la Viewbox (ou du monde) où il se trouve */
  side: ViewKind;
  /** centre (monde, mm) */
  center: Vec3;
  /** position le long du côté (mm, de gauche à droite vu de face) : ordre de numérotation */
  along?: number;
  /** repère du cadre : saisi dans SketchUp, sinon donné par numberFrames */
  ref?: string;
  /** repère venu de SketchUp (« Cadres textile… » de l'extension) */
  refSource?: 'sketchup' | 'auto';
  /** visuel / impression saisi dans SketchUp */
  visual?: string;
}

/** Cadres de même taille (même composant, dimensions à 2 mm) : un seul dessin de détail pour tous. */
export interface FrameType {
  /** repères des cadres du groupe, compactés : « F1 », « F1, F3 », « F1–F4 » */
  ref: string;
  /** repère de chaque cadre du groupe (même ordre que nodeIds) */
  refs: string[];
  label: string;
  definition?: string;
  w: number;
  h: number;
  t: number;
  /** cadre dessiné sur la planche de détail */
  rep: FrameInfo;
  /** cadres du groupe (repère, visuel, emplacement) */
  frames: FrameInfo[];
  nodeIds: string[];
  /** « VBX-01 Left » … (une entrée par cadre) */
  locations: string[];
}

const SIDE_LABELS: Record<FrameLang, Record<ViewKind, string>> = {
  en: { front: 'Front', back: 'Back', left: 'Left', right: 'Right', top: 'Top', bottom: 'Bottom' },
  fr: { front: 'avant', back: 'arrière', left: 'gauche', right: 'droite', top: 'dessus', bottom: 'dessous' },
};

export function frameLocation(f: Pick<FrameInfo, 'moduleId' | 'side'>, lang: FrameLang = 'en'): string {
  const side = SIDE_LABELS[lang][f.side];
  if (lang === 'fr') return f.moduleId ? `${f.moduleId} ${side}` : `commun ${side}`;
  return f.moduleId ? `${f.moduleId} ${side}` : `Common ${side}`;
}

// ─── mesure (géométrie) ───

/** Axes de mesure d'un cadre : ceux de sa Viewbox, sinon ceux du monde (X, Z = Y SketchUp, Y vertical). */
function axesFor(scene: LoadedScene, moduleId: string | null): { a: Vec3; b: Vec3; up: Vec3; frame: { moduleId: string } | 'world' } {
  const f = moduleId ? scene.frames.get(moduleId) : undefined;
  if (f) return { a: f.xAxis, b: f.yAxis, up: f.up, frame: { moduleId: f.moduleId } };
  return { a: [1, 0, 0], b: [0, 0, 1], up: [0, 1, 0], frame: 'world' };
}

/** Viewbox d'un nœud : la sienne, sinon celle de l'accessoire qui le porte. */
function moduleOfNode(scene: LoadedScene, id: string): string | null {
  for (let c: string | null | undefined = id; c; c = scene.look.byId.get(c)?.parentId) {
    const n = scene.look.byId.get(c);
    if (n?.moduleId) return n.moduleId;
  }
  return null;
}

/**
 * Choix de la vue d'un cadre à partir de ses étendues dans les axes (a, b, haut) : la plus petite est l'épaisseur ;
 * un cadre vertical est vu depuis l'extérieur de sa Viewbox (le côté où il se trouve), un cadre à plat de dessus.
 */
export function frameOrientation(
  ext: [number, number, number],
  outward: { a: number; b: number },
): { thin: 'a' | 'b' | 'up'; w: number; h: number; t: number; normal: { a: number; b: number; up: number } } {
  const [ea, eb, eu] = ext;
  if (eu <= ea && eu <= eb) return { thin: 'up', w: Math.max(ea, eb), h: Math.min(ea, eb), t: eu, normal: { a: 0, b: 0, up: 1 } };
  if (ea <= eb) return { thin: 'a', w: eb, h: eu, t: ea, normal: { a: outward.a >= 0 ? 1 : -1, b: 0, up: 0 } };
  return { thin: 'b', w: ea, h: eu, t: eb, normal: { a: 0, b: outward.b >= 0 ? 1 : -1, up: 0 } };
}

/** Mesure de chaque cadre textile du modèle (ou de ceux qui descendent de `roots`). */
export function measureFrames(scene: LoadedScene, nodeIds?: string[]): FrameInfo[] {
  const { tags } = subsetEnv(scene);
  const ids = nodeIds ?? tags.nodesWithTag(TEXTILE_TAG);
  const out: FrameInfo[] = [];
  const v = new Vector3();
  for (const id of ids) {
    const obj = scene.objectsById.get(id);
    const node = scene.look.byId.get(id);
    if (!obj || !node) continue;
    const moduleId = moduleOfNode(scene, id);
    const ax = axesFor(scene, moduleId);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    const c = [0, 0, 0];
    let count = 0;
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      // une pièce cachée par une autre étiquette (rare) reste dans le cadre : on mesure tout ce qu'il contient
      if (nodeIdOf(o) && scene.look.byId.get(nodeIdOf(o)!)?.role === 'context') return;
      const pos = m.geometry?.attributes?.position;
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const p: Vec3 = [v.x, v.y, v.z];
        const l = [dot(p, ax.a), dot(p, ax.b), dot(p, ax.up)];
        for (let k = 0; k < 3; k++) {
          if (l[k] < min[k]) min[k] = l[k];
          if (l[k] > max[k]) max[k] = l[k];
        }
        c[0] += v.x;
        c[1] += v.y;
        c[2] += v.z;
        count++;
      }
    });
    if (!count) continue;
    const center: Vec3 = [c[0] / count, c[1] / count, c[2] / count];
    // côté de la Viewbox : centre du cadre par rapport au centre de la Viewbox (dans ses axes)
    let outward = { a: 1, b: 1 };
    const f = moduleId ? scene.frames.get(moduleId) : undefined;
    if (f) {
      const mc = [(f.min[0] + f.max[0]) / 2, (f.min[1] + f.max[1]) / 2];
      const rel: Vec3 = [center[0] - f.origin[0], center[1] - f.origin[1], center[2] - f.origin[2]];
      outward = { a: dot(rel, f.xAxis) - mc[0], b: dot(rel, f.yAxis) - mc[1] };
    }
    const o = frameOrientation([max[0] - min[0], max[1] - min[1], max[2] - min[2]], outward);
    const normal: Vec3 = [
      ax.a[0] * o.normal.a + ax.b[0] * o.normal.b + ax.up[0] * o.normal.up,
      ax.a[1] * o.normal.a + ax.b[1] * o.normal.b + ax.up[1] * o.normal.up,
      ax.a[2] * o.normal.a + ax.b[2] * o.normal.b + ax.up[2] * o.normal.up,
    ];
    // vue standard (de la Viewbox ou du monde) dont l'observateur est du côté de la face du cadre
    const kinds: ViewKind[] = o.thin === 'up' ? ['top'] : ['front', 'back', 'left', 'right'];
    let best: ViewKind = kinds[0];
    let bestDot = -Infinity;
    for (const k of kinds) {
      const bs = viewBasis({ kind: k, frame: ax.frame }, scene.frames);
      const d = dot(bs.toward, normal);
      if (d > bestDot) [best, bestDot] = [k, d];
    }
    const bs = viewBasis({ kind: best, frame: ax.frame }, scene.frames);
    out.push({
      nodeId: id,
      moduleId,
      label: displayLabel(node),
      definition: node.definition,
      w: o.w,
      h: o.h,
      t: o.t,
      view: { kind: best, frame: ax.frame },
      side: best,
      center,
      along: dot(bs.right, center),
      ...(node.textileFrame?.ref ? { ref: node.textileFrame.ref, refSource: 'sketchup' as const } : {}),
      ...(node.textileFrame?.visual ? { visual: node.textileFrame.visual } : {}),
    });
  }
  return out;
}

// ─── numérotation et regroupement ───

const SIDE_ORDER: ViewKind[] = ['front', 'right', 'back', 'left', 'top', 'bottom'];

/** Ordre des cadres : Viewbox (VBX-01, VBX-02…, éléments communs à la fin), tour de la box, de gauche à droite, de bas en haut. */
export function frameOrder(frames: FrameInfo[]): FrameInfo[] {
  const num = (m: string | null) => (m ? Number(/\d+/.exec(m)?.[0] ?? 9998) : 9999);
  return [...frames].sort(
    (a, b) =>
      num(a.moduleId) - num(b.moduleId) ||
      (a.moduleId ?? '').localeCompare(b.moduleId ?? '') ||
      SIDE_ORDER.indexOf(a.side) - SIDE_ORDER.indexOf(b.side) ||
      Math.round(a.along ?? 0) - Math.round(b.along ?? 0) ||
      Math.round(a.center[1]) - Math.round(b.center[1]),
  );
}

/**
 * Un repère par cadre : celui saisi dans SketchUp (gardé s'il est unique), les autres reçoivent les plus petits
 * numéros libres dans l'ordre de `frameOrder`. Renvoie les cadres dans cet ordre, triés par repère.
 */
export function numberFrames(frames: FrameInfo[]): FrameInfo[] {
  const ordered = frameOrder(frames);
  const taken = new Set<string>();
  const out = ordered.map((f) => {
    if (f.ref && f.refSource === 'sketchup' && !taken.has(f.ref)) {
      taken.add(f.ref);
      return { ...f };
    }
    return { ...f, ref: undefined, refSource: 'auto' as const };
  });
  let n = 0;
  for (const f of out) {
    if (f.ref) continue;
    do n++;
    while (taken.has(`F${n}`));
    f.ref = `F${n}`;
    taken.add(f.ref);
  }
  return out.sort((a, b) => refNumber(a.ref) - refNumber(b.ref));
}

const refNumber = (r?: string) => Number(/\d+/.exec(r ?? '')?.[0] ?? 0);

/** « F1, F2, F3, F5 » → « F1–F3, F5 ». */
export function compactRefs(refs: string[]): string {
  const ns = [...new Set(refs.map(refNumber))].filter((n) => n > 0).sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < ns.length; ) {
    let j = i;
    while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    parts.push(j - i >= 2 ? `F${ns[i]}–F${ns[j]}` : ns.slice(i, j + 1).map((n) => `F${n}`).join(', '));
    i = j + 1;
  }
  return parts.join(', ');
}

/**
 * Cadres de même taille regroupés pour les dessins de détail (même composant SketchUp, dimensions à `tol` mm près),
 * plus grands d'abord ; les cadres sont numérotés (`numberFrames`) s'ils ne le sont pas déjà.
 */
export function groupFrames(frames: FrameInfo[], lang: FrameLang = 'en', tol = 2): FrameType[] {
  const numbered = frames.every((f) => f.ref) ? [...frames].sort((a, b) => refNumber(a.ref) - refNumber(b.ref)) : numberFrames(frames);
  const types: FrameType[] = [];
  for (const f of numbered) {
    const key = f.definition ?? f.label;
    const t = types.find((x) => (x.definition ?? x.label) === key && Math.abs(x.w - f.w) <= tol && Math.abs(x.h - f.h) <= tol && Math.abs(x.t - f.t) <= tol);
    if (t) {
      t.nodeIds.push(f.nodeId);
      t.refs.push(f.ref!);
      t.frames.push(f);
      t.locations.push(frameLocation(f, lang));
    } else types.push({ ref: '', refs: [f.ref!], label: f.label, definition: f.definition, w: f.w, h: f.h, t: f.t, rep: f, nodeIds: [f.nodeId], frames: [f], locations: [frameLocation(f, lang)] });
  }
  types.sort((a, b) => b.w * b.h - a.w * a.h || refNumber(a.refs[0]) - refNumber(b.refs[0]));
  for (const t of types) t.ref = compactRefs(t.refs);
  return types;
}

/** Tous les cadres, dans l'ordre des repères. */
export function framesOf(types: FrameType[]): FrameInfo[] {
  return types.flatMap((t) => t.frames).sort((a, b) => refNumber(a.ref) - refNumber(b.ref));
}

/** Nœud → repère du cadre (« F2 »). */
export function frameRefs(types: FrameType[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of types) t.nodeIds.forEach((id, i) => m.set(id, t.refs[i]));
  return m;
}

// ─── planches ───

const L = {
  en: {
    title: 'Textile frames',
    schedule: 'TEXTILE FRAME SCHEDULE',
    cont: '(continued)',
    cols: ['Ref', 'Size W × H (mm)', 'Depth', 'Face m²', 'Location', 'Visual / print', 'Description'],
    total: (n: number, m2: string, sizes: number) => `Total: ${n} frame${n > 1 ? 's' : ''} in ${sizes} size${sizes > 1 ? 's' : ''} · ${m2} m² of fabric face`,
    caption: (t: FrameType) => `Depth ${fmt(t.t)} mm · Qty ${t.nodeIds.length}`,
    note: 'Overall dimensions measured on the 3D model (frame profile included) — check on site before production. One reference per frame: each print is different.',
  },
  fr: {
    title: 'Cadres textile',
    schedule: 'NOMENCLATURE DES CADRES TEXTILE',
    cont: '(suite)',
    cols: ['Repère', 'Dimensions L × H (mm)', 'Ép.', 'Face m²', 'Emplacement', 'Visuel / impression', 'Désignation'],
    total: (n: number, m2: string, sizes: number) => `Total : ${n} cadre${n > 1 ? 's' : ''} en ${sizes} taille${sizes > 1 ? 's' : ''} · ${m2} m² de face textile`,
    caption: (t: FrameType) => `Ép. ${fmt(t.t)} mm · Qté ${t.nodeIds.length}`,
    note: 'Dimensions hors tout mesurées sur la maquette 3D (profil compris) — à vérifier sur site avant fabrication. Un repère par cadre : chaque impression est différente.',
  },
};

/** « 2 438 » */
export function fmt(mm: number): string {
  return String(Math.round(mm)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export const frameSize = (t: Pick<FrameType, 'w' | 'h'>) => `${fmt(t.w)} × ${fmt(t.h)}`;

/** Lignes estimées d'un texte dans une largeur (même estimation que le rendu : 0,5 × hauteur par caractère). */
function lines(text: string, width: number, size: number): number {
  const max = Math.max(4, Math.floor(width / (size * 0.5)));
  return Math.max(1, Math.ceil(text.length / max));
}

/** « VBX-01 Left, VBX-02 Left » → compacté : « VBX-01 Left ×2 » quand un même emplacement revient. */
export function compactLocations(locs: string[]): string {
  const counts = new Map<string, number>();
  for (const l of locs) counts.set(l, (counts.get(l) ?? 0) + 1);
  return [...counts].map(([l, n]) => (n > 1 ? `${l} ×${n}` : l)).join(', ');
}

export interface FrameSheetOptions {
  paper: Paper;
  modelKey: string;
  style: LineStyleSpec;
  lang?: FrameLang;
  /** nom du jeu de plans : encadré « Extract - Textile frames - <nom> » */
  title: string;
  unit?: number;
}

/**
 * Planches « Cadres textile » : nomenclature, une ligne par cadre (repère, dimensions, épaisseur, surface, emplacement,
 * visuel), puis un dessin par taille de cadre (« F1, F3 — 2 000 × 2 000 mm »), vu de face, seul, avec ses cotes hors
 * tout (posées après le calcul : `pendingAutoDims`).
 */
export function frameSheets(types: FrameType[], opts: FrameSheetOptions): Sheet[] {
  if (!types.length) return [];
  const lang = opts.lang ?? 'en';
  const T = L[lang];
  const k = templateScale(opts.paper);
  const area = DRAW_AREA;
  const sheets: Sheet[] = [];
  const newSheet = (): Sheet => {
    const s: Sheet = { id: newId('s'), number: '', title: `Extract - ${T.title} - ${opts.title}`, paper: opts.paper, orientation: 'landscape', kind: 'standard', role: 'frames', ...(opts.unit ? { unit: opts.unit } : {}), items: [] };
    sheets.push(s);
    return s;
  };
  const text = (rect: RectMm, t: string, size: number, extra: Partial<TextItem> = {}): TextItem => ({ id: newId('t'), type: 'text', rect: scaleRect(rect, k), text: t, size: size * k, font: 'sans', ...extra });
  const line = (x0: number, y0: number, x1: number, y1: number, w = 0.25): ShapeItem => ({ id: newId('h'), type: 'shape', shape: 'line', rect: scaleRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, k), strokeMm: w * k });

  // ─── nomenclature : une ligne par cadre (suite sur la planche suivante si besoin) ───
  const first = newSheet();
  let sheet = first;
  const x0 = area.x + 6;
  const width = area.w - 12;
  const size = 3.2;
  const pad = 1.6;
  const bottom = area.y + area.h - 6;
  // largeurs de colonnes (mm A1) : la dernière prend le reste
  const fixed = [16, 46, 18, 20, 62, 170];
  const widths = [...fixed, width - fixed.reduce((a, b) => a + b, 0)];
  const xs = widths.reduce<number[]>((acc, w) => [...acc, acc[acc.length - 1] + w], [x0]);
  const headerH = size * 1.2 + 2 * pad;
  let y = area.y + 8;
  let rowTop = 0;
  let rowLines: number[] = [];
  const closeTable = () => {
    for (const ly of rowLines) sheet.items.push(line(x0, ly, x0 + width, ly, ly === rowLines[1] ? 0.35 : 0.18));
    for (const lx of xs) sheet.items.push(line(lx, rowTop, lx, y, 0.18));
  };
  const openTable = (cont: boolean) => {
    sheet.items.push(text({ x: x0, y, w: width, h: 8 }, cont ? `${T.schedule} ${T.cont}` : T.schedule, 5.2, { bold: true }));
    y += 10;
    rowTop = y;
    T.cols.forEach((c, i) => sheet.items.push(text({ x: xs[i] + pad, y: y + pad, w: widths[i] - 2 * pad, h: headerH }, c, size, { bold: true })));
    y += headerH;
    rowLines = [rowTop, y];
  };
  openTable(false);
  let totalArea = 0;
  const all = framesOf(types);
  for (const f of all) {
    const m2 = (f.w * f.h) / 1e6;
    totalArea += m2;
    const cells = [f.ref ?? '', frameSize(f), fmt(f.t), m2.toFixed(2), frameLocation(f, lang), f.visual ?? '', f.label];
    const n = Math.max(...cells.map((c, i) => lines(c, widths[i] - 2 * pad, size)));
    const h = n * size * 1.2 + 2 * pad;
    if (y + h > bottom) {
      closeTable();
      sheet = newSheet();
      y = area.y + 8;
      openTable(true);
    }
    cells.forEach((c, i) => sheet.items.push(text({ x: xs[i] + pad, y: y + pad, w: widths[i] - 2 * pad, h }, c, size, i === 0 ? { bold: true } : {})));
    y += h;
    rowLines.push(y);
  }
  closeTable();
  y += 3;
  sheet.items.push(text({ x: x0, y, w: width, h: 6 }, T.total(all.length, totalArea.toFixed(2), types.length), size, { bold: true }));
  y += 6;
  sheet.items.push(text({ x: x0, y, w: width, h: 10 }, T.note, size * 0.9));
  y += 10;

  // ─── cadres : 3 par rangée, cases de même hauteur ───
  const cols = 3;
  const gap = 8;
  const cellW = (area.w - 2 * 6 - (cols - 1) * gap) / cols;
  const cellH = 250;
  let top = y + 4;
  let col = 0;
  const titleSize = VIEW_TITLE_SIZE * 0.55;
  for (const t of types) {
    if (col === 0 && top + cellH > area.y + area.h) {
      sheet = newSheet();
      top = area.y + 10;
    }
    const cx = area.x + 6 + col * (cellW + gap);
    // titre « F1 — 2 438 × 650 » puis le cadre ; légende sous le cadre
    const labelPos = { x: cx * k, y: top * k };
    const vpRect: RectMm = { x: cx, y: top + titleSize + 4, w: cellW, h: cellH - titleSize - 4 - 16 };
    const vp: ViewportItem = {
      id: newId('v'),
      type: 'viewport',
      rect: scaleRect(vpRect, k),
      request: { modelId: opts.modelKey, subset: { include: [t.rep.nodeId] }, view: t.rep.view, style: { ...opts.style, colorByCategory: false, facadeMarks: false, hiddenLines: false } },
      scale: 0,
      label: `${t.ref} — ${frameSize(t)} mm`,
      showLabel: true,
      labelPos,
      labelSize: titleSize * k,
      renderStyle: 'trait',
      frameView: { nodeId: t.rep.nodeId, ref: t.ref },
      pendingAutoDims: true,
    };
    sheet.items.push(vp);
    const capY = vpRect.y + vpRect.h + 2;
    sheet.items.push(text({ x: cx, y: capY, w: cellW, h: 6 }, T.caption(t), size, { bold: true }));
    sheet.items.push(text({ x: cx, y: capY + 5, w: cellW, h: 8 }, t.frames.map((f) => `${f.ref} ${frameLocation(f, lang)}`).join(' · '), size * 0.9));
    col++;
    if (col === cols) {
      col = 0;
      top += cellH + 6;
    }
  }
  return sheets;
}

// ─── repères « F1 » sur les vues ───

/** Cadres textile dessinés dans une vue (traits visibles, pas seulement cachés). */
export function framesInView(scene: Pick<LoadedScene, 'index' | 'look' | 'frames'>, lw: Linework2D): Set<string> {
  const out = new Set<string>();
  const seen = new Map<string, string | null>();
  for (const layer of lw.layers) {
    if (isDecorationLayer(layer.key)) continue;
    for (const src of layer.sourceNodeIds ?? []) {
      if (!src) continue;
      let f = seen.get(src);
      if (f === undefined) seen.set(src, (f = textileFrameOf(scene, src)));
      if (f) out.add(f);
    }
  }
  return out;
}

/** Centre d'un nœud (boîte monde de l'index). */
function centerOf(index: SceneIndex, id: string): Vec3 | null {
  const b = index.nodes.find((n) => n.id === id)?.bboxMm;
  return b ? [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2] : null;
}

/**
 * Repères « F1 » d'une fenêtre de vue : un par cadre textile visible, ancré au centre du cadre (suit la vue), texte
 * décalé en haut à droite. Les repères automatiques précédents de la fenêtre sont à retirer par l'appelant.
 */
export function frameLabels(
  scene: Pick<LoadedScene, 'index' | 'look' | 'frames'>,
  vp: ViewportItem,
  lw: Linework2D,
  basis: ViewBasis,
  refs: ReadonlyMap<string, string>,
  k: number,
): LabelItem[] {
  if (vp.frameView || !vp.scale) return [];
  const b = lw.boundsMm;
  const tr = viewportTransform(vp.rect, vp.scale, vp.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]);
  const out: LabelItem[] = [];
  const taken: Array<{ x: number; y: number }> = [];
  for (const id of framesInView(scene, lw)) {
    const ref = refs.get(id);
    const c = centerOf(scene.index, id);
    if (!ref || !c) continue;
    const p = tr.toPaper(dot(basis.right, c), dot(basis.up, c));
    // texte en haut à droite, décalé si un autre repère est déjà là
    let pos = { x: p.x + 9 * k, y: p.y - 9 * k };
    for (let i = 0; i < 6 && taken.some((q) => Math.abs(q.x - pos.x) < 9 * k && Math.abs(q.y - pos.y) < 5 * k); i++) pos = { x: pos.x, y: pos.y - 6 * k };
    taken.push(pos);
    out.push({ id: newId('l'), type: 'label', viewportId: vp.id, anchor3d: c, textPos: pos, text: ref, style: 'bold', auto: 'frame' });
  }
  return out;
}

/** Fenêtres de vue qui montrent des cadres textile (hors vues de détail des cadres). */
export function viewportsWithFrames(sheets: Sheet[], data: (vp: ViewportItem) => { lw?: Linework2D } | undefined, scene: Pick<LoadedScene, 'index' | 'look' | 'frames'>): ViewportItem[] {
  const out: ViewportItem[] = [];
  for (const s of sheets)
    for (const it of s.items as SheetItem[]) {
      if (it.type !== 'viewport' || it.frameView || it.custom) continue;
      const lw = data(it)?.lw;
      if (lw && framesInView(scene, lw).size) out.push(it);
    }
  return out;
}
