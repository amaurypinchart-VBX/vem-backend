// Cotes (§3.5, §9) — fonctions pures : géométrie d'une cote sur la planche (lignes, lignes d'attache, ticks à 45°,
// textes « 17700 mm ») et disposition automatique des cotes d'une vue (chaînes + totaux, rangées à 10 mm puis + 7 mm,
// textes sans chevauchement).
import type { DimensionItem, PointMm, RectMm } from './types';
import { STANDARD_SCALES } from './scales';

export const DIM = {
  /** hauteur du texte (mm papier) — Gelasio 2,5 mm */
  text: 2.5,
  /** épaisseur des traits de cote */
  line: 0.13,
  /** écart entre l'objet et le début de la ligne d'attache */
  gap: 2,
  /** dépassement de la ligne d'attache au-delà de la ligne de cote */
  overshoot: 2,
  /** 1re rangée : distance au dessin ; rangées suivantes : + step */
  firstRow: 10,
  rowStep: 7,
  /** demi-longueur du tick oblique */
  tick: 1.25,
  /** largeur moyenne d'un caractère / hauteur du texte (Gelasio) */
  charRatio: 0.55,
};

export function formatDim(mm: number): string {
  return `${Math.round(Math.abs(mm))} mm`;
}

export function textWidth(text: string, size = DIM.text): number {
  return text.length * size * DIM.charRatio;
}

export interface DimText {
  x: number;
  y: number;
  /** rotation (°) : −90 pour une cote verticale */
  rotate: number;
  text: string;
  override: boolean;
  /** boîte englobante (mm papier) pour les tests de chevauchement */
  box: RectMm;
}

export interface DimGeometry {
  /** segments [x1, y1, x2, y2] : ligne de cote et lignes d'attache */
  lines: Array<[number, number, number, number]>;
  /** ticks obliques (ou flèches) aux points de cote */
  ticks: Array<[number, number, number, number]>;
  arrows: Array<{ x: number; y: number; angle: number }>;
  texts: DimText[];
  /** valeurs mesurées (mm modèle), une par intervalle */
  values: number[];
  box: RectMm;
}

export interface DimInput {
  orient: 'h' | 'v' | 'aligned';
  /** points d'ancrage sur la planche (mm papier) */
  paper: PointMm[];
  /** mêmes points dans le repère du dessin (mm modèle) : les valeurs affichées en viennent */
  model: Array<[number, number]>;
  offsetMm: number;
  textOverride?: string;
  ends?: 'tick' | 'arrow';
}

/** Géométrie d'une cote (mm papier). */
export function dimGeometry(d: DimInput): DimGeometry {
  const lines: DimGeometry['lines'] = [];
  const ticks: DimGeometry['ticks'] = [];
  const arrows: DimGeometry['arrows'] = [];
  const texts: DimText[] = [];
  const values: number[] = [];
  const n = d.paper.length;
  const arrowsOn = d.ends === 'arrow';
  if (n < 2) return { lines, ticks, arrows, texts, values, box: { x: 0, y: 0, w: 0, h: 0 } };

  // repère de la cote : u = direction mesurée, w = normale (vers où la ligne de cote est décalée)
  let ux: number;
  let uy: number;
  if (d.orient === 'h') [ux, uy] = [1, 0];
  else if (d.orient === 'v') [ux, uy] = [0, 1];
  else {
    const dx = d.paper[n - 1].x - d.paper[0].x;
    const dy = d.paper[n - 1].y - d.paper[0].y;
    const l = Math.hypot(dx, dy) || 1;
    [ux, uy] = [dx / l, dy / l];
  }
  // normale : vers le bas pour une cote horizontale, vers la droite pour une verticale (décalage négatif = au-dessus / à gauche)
  const [wx, wy] = d.orient === 'h' ? [0, 1] : d.orient === 'v' ? [1, 0] : [-uy, ux];
  // position de la ligne de cote le long de w : au-delà du point le plus extrême du côté du décalage
  const ws = d.paper.map((p) => p.x * wx + p.y * wy);
  const base = d.offsetMm < 0 ? Math.min(...ws) : Math.max(...ws);
  const lineW = base + d.offsetMm;
  const side = Math.sign(d.offsetMm) || 1;
  // points de cote = projections des ancrages sur la ligne de cote, triés le long de u
  const order = d.paper.map((p, i) => ({ i, t: p.x * ux + p.y * uy })).sort((a, b) => a.t - b.t);
  const at = (t: number) => ({ x: t * ux + lineW * wx, y: t * uy + lineW * wy });
  const t0 = order[0].t;
  const t1 = order[order.length - 1].t;
  const a = at(t0);
  const b = at(t1);
  lines.push([a.x, a.y, b.x, b.y]);
  for (const o of order) {
    const p = d.paper[o.i];
    const pw = p.x * wx + p.y * wy;
    const q = at(o.t);
    // ligne d'attache : de l'objet (écart 2 mm) jusqu'à 2 mm au-delà de la ligne de cote
    const startW = pw + side * DIM.gap;
    const endW = lineW + side * DIM.overshoot;
    if ((endW - startW) * side > 0) lines.push([o.t * ux + startW * wx, o.t * uy + startW * wy, o.t * ux + endW * wx, o.t * uy + endW * wy]);
    if (arrowsOn) continue;
    // tick oblique à 45° (architecte), montant vers la droite « / »
    const kx = (ux - wx) * DIM.tick * Math.SQRT1_2;
    const ky = (uy - wy) * DIM.tick * Math.SQRT1_2;
    ticks.push([q.x - kx, q.y - ky, q.x + kx, q.y + ky]);
  }
  // valeurs et textes, intervalle par intervalle
  const rotate = d.orient === 'v' ? -90 : d.orient === 'h' ? 0 : (Math.atan2(uy, ux) * 180) / Math.PI;
  const upright = rotate > 90 || rotate < -90 ? rotate + 180 : rotate;
  let stagger = 0;
  for (let k = 0; k + 1 < order.length; k++) {
    const i0 = order[k].i;
    const i1 = order[k + 1].i;
    const [mx0, my0] = d.model[i0];
    const [mx1, my1] = d.model[i1];
    const v = d.orient === 'h' ? Math.abs(mx1 - mx0) : d.orient === 'v' ? Math.abs(my1 - my0) : Math.hypot(mx1 - mx0, my1 - my0);
    values.push(v);
    if (arrowsOn) {
      const pa = at(order[k].t);
      const pb = at(order[k + 1].t);
      const ang = (Math.atan2(uy, ux) * 180) / Math.PI;
      arrows.push({ x: pa.x, y: pa.y, angle: ang + 180 }, { x: pb.x, y: pb.y, angle: ang });
    }
    const override = !!d.textOverride && order.length === 2;
    const text = override ? d.textOverride! : formatDim(v);
    const len = order[k + 1].t - order[k].t;
    const tw = textWidth(text);
    // texte centré au-dessus de la ligne de cote (côté opposé au dessin) ; s'il ne tient pas dans l'intervalle,
    // on l'écarte d'une ligne de texte de plus (alternance) pour éviter qu'il chevauche ses voisins
    const tight = tw + 1 > len;
    stagger = tight ? (stagger === 1 ? 2 : 1) : 0;
    const lift = 0.8 + stagger * (DIM.text * 1.25);
    const mid = at((order[k].t + order[k + 1].t) / 2);
    // décalage du texte : vers l'extérieur (côté du décalage), c'est-à-dire « au-dessus » pour une cote au-dessus
    const offW = side * lift + (side > 0 ? DIM.text : 0);
    const tx = mid.x + wx * offW;
    const ty = mid.y + wy * offW;
    const h = DIM.text;
    const box =
      d.orient === 'v'
        ? { x: tx - h, y: ty - tw / 2, w: h * 1.1, h: tw }
        : d.orient === 'h'
          ? { x: tx - tw / 2, y: ty - h, w: tw, h: h * 1.1 }
          : { x: tx - Math.max(tw, h) / 2, y: ty - Math.max(tw, h) / 2, w: Math.max(tw, h), h: Math.max(tw, h) };
    texts.push({ x: tx, y: ty, rotate: upright, text, override, box });
  }
  const xs = [...lines.flatMap((l) => [l[0], l[2]]), ...texts.flatMap((t) => [t.box.x, t.box.x + t.box.w])];
  const ys = [...lines.flatMap((l) => [l[1], l[3]]), ...texts.flatMap((t) => [t.box.y, t.box.y + t.box.h])];
  const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  return { lines, ticks, arrows, texts, values, box };
}

export function boxesOverlap(a: RectMm, b: RectMm, margin = 0): boolean {
  return a.x < b.x + b.w + margin && b.x < a.x + a.w + margin && a.y < b.y + b.h + margin && b.y < a.y + a.h + margin;
}

// ─── cotation automatique ───

export type DimPurpose = 'elevation' | 'plan' | 'implantation';

export interface Extent {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface AutoDimInput {
  purpose: DimPurpose;
  /** encombrement de la vue (mm modèle, repère du dessin) */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** emprise de chaque Viewbox dans le dessin */
  modules: Extent[];
  /** portes (objets PORTE-*) visibles */
  doors: Extent[];
  /** centres des pieds */
  feet: Array<{ x: number; y: number }>;
  /** bandeau de toit (élévations) */
  roofBand?: { y0: number; y1: number };
}

export interface AutoDim {
  orient: 'h' | 'v';
  side: 'top' | 'bottom' | 'left' | 'right';
  row: number;
  /** points d'ancrage (mm modèle, repère du dessin) */
  points: Array<[number, number]>;
}

/** Valeurs triées, sans doublons (tolérance en mm modèle). */
export function uniqueSorted(values: number[], tol: number): number[] {
  const s = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
}

/**
 * Cotes automatiques d'une vue (§9.2) :
 * - élévation : longueur totale (haut), largeurs des Viewbox en chaîne (bas) précédées des portes (position +
 *   largeur), hauteur totale et bandeau de toit (gauche) ;
 * - plan : Viewbox en chaîne + totaux sur les côtés extérieurs (haut et gauche) ;
 * - implantation : entraxes des pieds en chaîne + totaux.
 */
export function planDimensions(inp: AutoDimInput, tol = 5): AutoDim[] {
  const out: AutoDim[] = [];
  const { minX, minY, maxX, maxY } = inp.bounds;
  const row = (side: AutoDim['side']) => out.filter((d) => d.side === side).length;
  const add = (orient: 'h' | 'v', side: AutoDim['side'], values: number[]) => {
    if (values.length < 2) return;
    const fixed = side === 'top' ? maxY : side === 'bottom' ? minY : side === 'left' ? minX : maxX;
    out.push({ orient, side, row: row(side), points: values.map((v) => (orient === 'h' ? [v, fixed] : [fixed, v])) });
  };
  const chainAndTotal = (orient: 'h' | 'v', side: AutoDim['side'], values: number[]) => {
    const u = uniqueSorted(values, tol);
    if (u.length > 2) add(orient, side, u);
    add(orient, side, [u[0], u[u.length - 1]]);
  };

  if (inp.purpose === 'implantation') {
    if (inp.feet.length >= 2) {
      chainAndTotal('h', 'top', inp.feet.map((f) => f.x));
      chainAndTotal('v', 'left', inp.feet.map((f) => f.y));
    }
    return out.filter((d) => d.points.length >= 2 && Math.abs(d.orient === 'h' ? d.points[d.points.length - 1][0] - d.points[0][0] : d.points[d.points.length - 1][1] - d.points[0][1]) > tol);
  }

  // les cotes globales mesurent les Viewbox (pieds, poignées… qui dépassent n'entrent pas dans les totaux)
  const mods = inp.modules;
  const mX0 = mods.length ? Math.min(...mods.map((m) => m.x0)) : minX;
  const mX1 = mods.length ? Math.max(...mods.map((m) => m.x1)) : maxX;
  const mY0 = mods.length ? Math.min(...mods.map((m) => m.y0)) : minY;
  const mY1 = mods.length ? Math.max(...mods.map((m) => m.y1)) : maxY;

  if (inp.purpose === 'plan') {
    chainAndTotal('h', 'top', mods.length ? mods.flatMap((m) => [m.x0, m.x1]) : [minX, maxX]);
    chainAndTotal('v', 'left', mods.length ? mods.flatMap((m) => [m.y0, m.y1]) : [minY, maxY]);
    return out;
  }

  // élévation
  const moduleXs = mods.length ? uniqueSorted(mods.flatMap((m) => [m.x0, m.x1]), tol) : [minX, maxX];
  if (inp.doors.length) {
    const withDoors = uniqueSorted([...moduleXs, ...inp.doors.flatMap((d) => [d.x0, d.x1])], tol).filter((x) => x >= mX0 - tol && x <= mX1 + tol);
    if (withDoors.length > moduleXs.length) add('h', 'bottom', withDoors);
  }
  if (moduleXs.length > 2 || !inp.doors.length) add('h', 'bottom', moduleXs);
  add('h', 'top', [mX0, mX1]);
  const top = inp.roofBand ? Math.max(mY1, inp.roofBand.y1) : mY1;
  if (inp.roofBand && inp.roofBand.y0 - mY0 > tol && top - inp.roofBand.y0 > tol) {
    add('v', 'left', uniqueSorted([mY0, inp.roofBand.y0, top], tol));
    add('v', 'left', [mY0, top]);
  } else add('v', 'left', [mY0, top]);
  return out;
}

/** Place mm papier nécessaire autour du dessin, côté par côté, pour ces cotes. */
export function dimMargins(dims: AutoDim[]): Record<AutoDim['side'], number> {
  const m = { top: 0, bottom: 0, left: 0, right: 0 };
  for (const d of dims) m[d.side] = Math.max(m[d.side], DIM.firstRow + d.row * DIM.rowStep + DIM.text * 2.6 + 1);
  return m;
}

/** Décalage (mm papier, signé) de la ligne de cote d'une rangée, pour un côté. */
export function rowOffset(side: AutoDim['side'], row: number): number {
  const d = DIM.firstRow + row * DIM.rowStep;
  return side === 'top' || side === 'left' ? -d : d;
}

/**
 * Échelle normalisée et centrage pour que le dessin ET ses cotes tiennent dans le cadre de la fenêtre de vue.
 * `center` = point du dessin (mm modèle) à placer au centre du cadre.
 */
export function fitWithDims(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  rect: RectMm,
  margins: Record<AutoDim['side'], number>,
  minScale = 1,
): { scale: number; center: [number, number] } {
  const bw = Math.max(1e-6, bounds.maxX - bounds.minX);
  const bh = Math.max(1e-6, bounds.maxY - bounds.minY);
  const aw = Math.max(1, rect.w - margins.left - margins.right - 4);
  const ah = Math.max(1, rect.h - margins.top - margins.bottom - 4);
  const needed = Math.max(bw / aw, bh / ah, minScale);
  const scale = STANDARD_SCALES.find((s) => s >= needed - 1e-9) ?? Math.ceil(needed);
  // boîte papier (dessin + marges de cotes) centrée dans le cadre
  const boxW = bw / scale + margins.left + margins.right;
  const boxH = bh / scale + margins.top + margins.bottom;
  const left = rect.x + (rect.w - boxW) / 2 + margins.left;
  const top = rect.y + (rect.h - boxH) / 2 + margins.top;
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return { scale, center: [bounds.minX - (left - cx) * scale, bounds.maxY - (cy - top) * scale] };
}

/** Glisser une cote la décale perpendiculairement à sa mesure (elle garde ses points d'ancrage). */
export function dimOffsetAfterDrag(d: Pick<DimensionItem, 'orient' | 'offsetMm'>, dx: number, dy: number): number {
  const delta = d.orient === 'v' ? dx : dy;
  const next = d.offsetMm + delta;
  // ne pas traverser les points d'ancrage (la ligne de cote changerait de côté)
  return Math.sign(next) === Math.sign(d.offsetMm) || !d.offsetMm ? next : Math.sign(d.offsetMm) * 3;
}
