// Planche → DXF : on relit le SVG de la planche (le même que l'écran et le PDF, rendu par SheetSvg sans édition) et
// on le convertit élément par élément : traits → LWPOLYLINE (épaisseur et tirets conservés), cercles → CIRCLE,
// remplissages → HATCH plein, textes → TEXT (Georgia / Arial, mêmes métriques que Gelasio / Arimo). Les découpes
// des fenêtres de vue (clip-path rectangulaire) sont appliquées. Calques : attribut data-dxf du groupe le plus
// proche (posé par SheetSvg). Les images 3D ne sont pas reprises (cadre seul).
//
// Deux modes : « paper » = 1 unité = 1 mm papier, la planche entière comme le PDF ; « real » = grandeur réelle :
// seuls les éléments d'une fenêtre de vue (attribut data-vp : traits, titre, cotes, repères) sont gardés, chaque
// vue ramenée à 1 unité = 1 mm du modèle, les vues placées comme sur la planche.
import type { DxfStyle } from './writer';
import { DxfDocument } from './writer';

export interface DxfViewport {
  id: string;
  rect: { x: number; y: number; w: number; h: number };
  /** échelle (50 = 1:50) */
  scale: number;
}

export interface SvgToDxfOptions {
  /** taille de la planche en mm */
  paper: { w: number; h: number };
  mode: 'paper' | 'real';
  /** fenêtres de vue de la planche (mode « real ») */
  viewports?: DxfViewport[];
  /** document où écrire (jeu entier dans un seul DXF), sinon un nouveau */
  doc?: DxfDocument;
  /** décalage de la planche dans le DXF (unités DXF), coin bas gauche */
  origin?: { x: number; y: number };
  /** nom de la planche écrit au-dessus de son bloc (calque VBX-PLANCHES) */
  label?: string;
}

/** Matrice affine SVG [a, b, c, d, e, f] : x' = a x + c y + e, y' = b x + d y + f. */
type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];

function mul(m: M, n: M): M {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
}

const apply = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

export function parseTransform(t: string | null): M {
  let m: M = IDENTITY;
  if (!t) return m;
  for (const [, fn, args] of t.matchAll(/(\w+)\s*\(([^)]*)\)/g)) {
    const a = (args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number);
    let k: M = IDENTITY;
    switch (fn) {
      case 'matrix':
        if (a.length === 6) k = a as M;
        break;
      case 'translate':
        k = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
        break;
      case 'scale':
        k = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
        break;
      case 'rotate': {
        const r = ((a[0] ?? 0) * Math.PI) / 180;
        const [cx, cy] = [a[1] ?? 0, a[2] ?? 0];
        const rot: M = [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
        k = mul(mul([1, 0, 0, 1, cx, cy], rot), [1, 0, 0, 1, -cx, -cy]);
        break;
      }
      case 'skewX':
        k = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        k = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
        break;
    }
    m = mul(m, k);
  }
  return m;
}

// ─── tracés ───
export interface SubPath {
  pts: number[];
  closed: boolean;
}

/** Tracé SVG (toutes commandes, absolues et relatives) → sous-chemins en points ; courbes et arcs découpés. */
export function parsePath(d: string, segmentsFor: (approxLen: number) => number = (l) => Math.max(4, Math.min(48, Math.ceil(l / 2)))): SubPath[] {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: SubPath[] = [];
  let cur: SubPath | null = null;
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cmd = '';
  let lastCtrl: [number, number] | null = null;
  let lastCmd = '';
  let i = 0;
  const num = () => Number(tokens[i++]);
  const isNum = () => i < tokens.length && !/^[A-Za-z]$/.test(tokens[i]);
  const lineTo = (nx: number, ny: number) => {
    if (!cur) {
      cur = { pts: [x, y], closed: false };
      out.push(cur);
    }
    cur.pts.push(nx, ny);
    x = nx;
    y = ny;
  };
  const curve = (pts: Array<[number, number]>, at: (t: number) => [number, number]) => {
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
    const steps = segmentsFor(len);
    for (let k = 1; k <= steps; k++) {
      const p = at(k / steps);
      lineTo(p[0], p[1]);
    }
  };
  while (i < tokens.length) {
    if (!isNum()) cmd = tokens[i++];
    else if (!cmd) {
      i++;
      continue;
    }
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case 'M': {
        const nx = num() + ox;
        const ny = num() + oy;
        cur = { pts: [nx, ny], closed: false };
        out.push(cur);
        x = sx = nx;
        y = sy = ny;
        // coordonnées suivantes = lignes
        cmd = rel ? 'l' : 'L';
        lastCtrl = null;
        lastCmd = 'M';
        continue;
      }
      case 'L':
        lineTo(num() + ox, num() + oy);
        break;
      case 'H':
        lineTo(num() + ox, y);
        break;
      case 'V':
        lineTo(x, num() + oy);
        break;
      case 'C': {
        const p0: [number, number] = [x, y];
        const p1: [number, number] = [num() + ox, num() + oy];
        const p2: [number, number] = [num() + ox, num() + oy];
        const p3: [number, number] = [num() + ox, num() + oy];
        curve([p0, p1, p2, p3], (t) => cubic(p0, p1, p2, p3, t));
        lastCtrl = p2;
        lastCmd = 'C';
        continue;
      }
      case 'S': {
        const p0: [number, number] = [x, y];
        const p1: [number, number] = lastCtrl && /[CS]/.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const p2: [number, number] = [num() + ox, num() + oy];
        const p3: [number, number] = [num() + ox, num() + oy];
        curve([p0, p1, p2, p3], (t) => cubic(p0, p1, p2, p3, t));
        lastCtrl = p2;
        lastCmd = 'S';
        continue;
      }
      case 'Q': {
        const p0: [number, number] = [x, y];
        const p1: [number, number] = [num() + ox, num() + oy];
        const p2: [number, number] = [num() + ox, num() + oy];
        curve([p0, p1, p2], (t) => quad(p0, p1, p2, t));
        lastCtrl = p1;
        lastCmd = 'Q';
        continue;
      }
      case 'T': {
        const p0: [number, number] = [x, y];
        const p1: [number, number] = lastCtrl && /[QT]/.test(lastCmd) ? [2 * x - lastCtrl[0], 2 * y - lastCtrl[1]] : [x, y];
        const p2: [number, number] = [num() + ox, num() + oy];
        curve([p0, p1, p2], (t) => quad(p0, p1, p2, t));
        lastCtrl = p1;
        lastCmd = 'T';
        continue;
      }
      case 'A': {
        const rx = num();
        const ry = num();
        const rot = num();
        const large = num();
        const sweep = num();
        const nx = num() + ox;
        const ny = num() + oy;
        const pts = arcPoints(x, y, rx, ry, rot, !!large, !!sweep, nx, ny, segmentsFor);
        for (const [px, py] of pts) lineTo(px, py);
        break;
      }
      case 'Z':
        if (cur) {
          cur.closed = true;
          cur = null;
        }
        x = sx;
        y = sy;
        lastCtrl = null;
        lastCmd = 'Z';
        // « Z » n'a pas d'argument : une coordonnée qui suit reprend une ligne
        cmd = '';
        continue;
      default:
        i++;
    }
    lastCtrl = null;
    lastCmd = cmd.toUpperCase();
  }
  return out.filter((p) => p.pts.length >= 4 || (p.closed && p.pts.length >= 2));
}

function cubic(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
}

function quad(p0: [number, number], p1: [number, number], p2: [number, number], t: number): [number, number] {
  const u = 1 - t;
  return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]];
}

/** Arc elliptique SVG (paramétrage par extrémités, SVG 1.1 annexe F.6) → points après le point de départ. */
function arcPoints(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number, segmentsFor: (l: number) => number): Array<[number, number]> {
  if (!rx || !ry) return [[x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const den = rx * rx * yp * yp + ry * ry * xp * xp;
  let k = Math.sqrt(Math.max(0, num / den));
  if (large === sweep) k = -k;
  const cxp = (k * rx * yp) / ry;
  const cyp = (-k * ry * xp) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const steps = Math.max(2, segmentsFor(Math.abs(dt) * Math.max(rx, ry)));
  const out: Array<[number, number]> = [];
  for (let s = 1; s <= steps; s++) {
    const t = t1 + (dt * s) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    out.push(s === steps ? [x2, y2] : [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy]);
  }
  return out;
}

// ─── découpe par un rectangle (fenêtres de vue) ───
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Polyligne découpée par un rectangle (Liang-Barsky segment par segment) → morceaux intérieurs. */
export function clipPolyline(pts: number[], b: Box): number[][] {
  const runs: number[][] = [];
  let run: number[] | null = null;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const seg = clipSegment(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], b);
    if (!seg) {
      run = null;
      continue;
    }
    const [ax, ay, bx, by, startInside, endInside] = seg;
    if (!run || !startInside) {
      run = [ax, ay];
      runs.push(run);
    }
    run.push(bx, by);
    if (!endInside) run = null;
  }
  return runs.filter((r) => r.length >= 4);
}

function clipSegment(x0: number, y0: number, x1: number, y1: number, b: Box): [number, number, number, number, boolean, boolean] | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - b.x0, b.x1 - x0, y0 - b.y0, b.y1 - y0];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) {
      if (q[k] < 0) return null;
    } else {
      const r = q[k] / p[k];
      if (p[k] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy, t0 === 0, t1 === 1];
}

/** Contour fermé découpé par un rectangle (Sutherland-Hodgman). */
export function clipPolygon(pts: number[], b: Box): number[] {
  let poly: Array<[number, number]> = [];
  for (let i = 0; i + 1 < pts.length; i += 2) poly.push([pts[i], pts[i + 1]]);
  const edges: Array<[(p: [number, number]) => boolean, (a: [number, number], c: [number, number]) => [number, number]]> = [
    [(p) => p[0] >= b.x0, (a, c) => [b.x0, a[1] + ((c[1] - a[1]) * (b.x0 - a[0])) / (c[0] - a[0])]],
    [(p) => p[0] <= b.x1, (a, c) => [b.x1, a[1] + ((c[1] - a[1]) * (b.x1 - a[0])) / (c[0] - a[0])]],
    [(p) => p[1] >= b.y0, (a, c) => [a[0] + ((c[0] - a[0]) * (b.y0 - a[1])) / (c[1] - a[1]), b.y0]],
    [(p) => p[1] <= b.y1, (a, c) => [a[0] + ((c[0] - a[0]) * (b.y1 - a[1])) / (c[1] - a[1]), b.y1]],
  ];
  for (const [inside, cut] of edges) {
    if (!poly.length) break;
    const next: Array<[number, number]> = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      if (inside(cur)) {
        if (!inside(prev)) next.push(cut(prev, cur));
        next.push(cur);
      } else if (inside(prev)) next.push(cut(prev, cur));
    }
    poly = next;
  }
  return poly.flat();
}

// ─── couleurs ───
const NAMED: Record<string, number> = { black: 0, white: 0xffffff, red: 0xff0000, green: 0x008000, blue: 0x0000ff, gray: 0x808080, grey: 0x808080 };

/** Couleur SVG → 0xRRGGBB, ou null (none / transparent / inconnue). */
export function parseColor(c: string | null | undefined): number | null {
  if (!c) return null;
  const s = c.trim().toLowerCase();
  if (s === 'none' || s === 'transparent') return null;
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return parseInt(m[1].replace(/./g, (h) => h + h), 16);
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return parseInt(m[1], 16);
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (m) return (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]);
  return NAMED[s] ?? null;
}

const isWhite = (c: number) => ((c >> 16) & 255) > 245 && ((c >> 8) & 255) > 245 && (c & 255) > 245;

// ─── parcours ───
interface Ctx {
  m: M;
  stroke: string | null;
  strokeWidth: number;
  fill: string | null;
  fillOpacity: number;
  opacity: number;
  dash: number[] | null;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  anchor: string;
  layer: string;
  vp: string | null;
  clip: Box | null;
}

const FONT_FILES: Record<string, string> = {
  'SERIF-': 'georgia.ttf',
  'SERIF-GRAS': 'georgiab.ttf',
  'SERIF-ITALIQUE': 'georgiai.ttf',
  'SERIF-GRAS-ITALIQUE': 'georgiaz.ttf',
  'SANS-': 'arial.ttf',
  'SANS-GRAS': 'arialbd.ttf',
  'SANS-ITALIQUE': 'ariali.ttf',
  'SANS-GRAS-ITALIQUE': 'arialbi.ttf',
};

/** Hauteur des majuscules / taille du caractère (Georgia 0,69, Arial 0,72) : la hauteur d'un TEXT AutoCAD. */
const CAP = { SERIF: 0.692, SANS: 0.716 };

function attr(el: Element, name: string): string | null {
  const v = el.getAttribute(name);
  if (v !== null) return v;
  const style = el.getAttribute('style');
  if (!style) return null;
  const m = new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`).exec(style);
  return m ? m[1].trim() : null;
}

const numAttr = (el: Element, name: string, def = 0) => {
  const v = parseFloat(el.getAttribute(name) ?? '');
  return Number.isFinite(v) ? v : def;
};

export function svgToDxf(svg: Element, opt: SvgToDxfOptions): DxfDocument {
  const doc = opt.doc ?? new DxfDocument();
  const x0 = opt.origin?.x ?? 0;
  const y0 = opt.origin?.y ?? 0;
  const vps = new Map((opt.viewports ?? []).filter((v) => v.scale > 0).map((v) => [v.id, v]));
  const S = Math.max(1, ...[...vps.values()].map((v) => v.scale));
  const H = opt.paper.h;
  const real = opt.mode === 'real';

  /** mm papier → unités DXF (y vers le haut), et facteur d'échelle de la sortie. */
  const mapper = (vpId: string | null): { at: (x: number, y: number) => [number, number]; k: number } | null => {
    if (!real) return { at: (x, y) => [x0 + x, y0 + H - y], k: 1 };
    const vp = vpId ? vps.get(vpId) : undefined;
    if (!vp) return null;
    const cx = vp.rect.x + vp.rect.w / 2;
    const cy = vp.rect.y + vp.rect.h / 2;
    const s = vp.scale;
    return { at: (x, y) => [x0 + cx * S + (x - cx) * s, y0 + (H - cy) * S - (y - cy) * s], k: s };
  };

  const byId = (id: string): Element | null => svg.querySelector(`[id="${id.replace(/"/g, '')}"]`);

  const strokeStyle = (ctx: Ctx, k: number): DxfStyle | null => {
    const color = parseColor(ctx.stroke);
    if (color === null || isWhite(color) || !(ctx.strokeWidth > 0) || ctx.opacity < 0.05) return null;
    const ms = scaleOf(ctx.m);
    const st: DxfStyle = { layer: ctx.layer, color, weightMm: ctx.strokeWidth * ms };
    if (ctx.dash && ctx.dash.length >= 2 && ctx.dash.some((v) => v > 0)) {
      const pattern = ctx.dash.length % 2 ? [...ctx.dash, ...ctx.dash] : ctx.dash;
      st.linetype = doc.linetype(pattern.map((v, i) => (i % 2 ? -1 : 1) * v * ms * k));
    }
    return st;
  };

  const fillStyle = (ctx: Ctx): DxfStyle | null => {
    const color = parseColor(ctx.fill);
    if (color === null || isWhite(color)) return null;
    const opacity = ctx.fillOpacity * ctx.opacity;
    if (opacity < 0.05) return null;
    return { layer: ctx.layer, color, opacity };
  };

  /** Sous-chemins (coordonnées locales) → traits et remplissage, découpés et ramenés en unités DXF. */
  const draw = (ctx: Ctx, paths: SubPath[], fill: boolean) => {
    const map = mapper(ctx.vp);
    if (!map) return;
    const paper = paths.map((p) => {
      const pts: number[] = [];
      for (let i = 0; i < p.pts.length; i += 2) pts.push(...apply(ctx.m, p.pts[i], p.pts[i + 1]));
      // tracé revenu à son premier point : polyligne fermée
      const k = pts.length;
      if (!p.closed && k >= 8 && Math.abs(pts[0] - pts[k - 2]) < 1e-9 && Math.abs(pts[1] - pts[k - 1]) < 1e-9) return { pts: pts.slice(0, k - 2), closed: true };
      return { pts, closed: p.closed };
    });
    const out = (pts: number[]) => {
      const r: number[] = [];
      for (let i = 0; i < pts.length; i += 2) r.push(...map.at(pts[i], pts[i + 1]));
      return r;
    };
    if (fill) {
      const fs = fillStyle(ctx);
      if (fs) {
        const loops = paper.map((p) => (ctx.clip ? clipPolygon(p.pts, ctx.clip) : p.pts)).filter((l) => l.length >= 6);
        if (loops.length) doc.hatch(loops.map(out), fs);
      }
    }
    const ss = strokeStyle(ctx, map.k);
    if (!ss) return;
    for (const p of paper) {
      if (!ctx.clip) {
        doc.polyline(out(p.pts), p.closed, ss);
        continue;
      }
      const pts = p.closed ? [...p.pts, p.pts[0], p.pts[1]] : p.pts;
      const runs = clipPolyline(pts, ctx.clip);
      // contour fermé entièrement visible : il reste fermé
      if (p.closed && runs.length === 1 && runs[0].length === pts.length) doc.polyline(out(p.pts), true, ss);
      else for (const r of runs) doc.polyline(out(r), false, ss);
    }
  };

  const text = (el: Element, ctx: Ctx) => {
    const map = mapper(ctx.vp);
    if (!map) return;
    const value = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!value) return;
    const color = parseColor(ctx.fill) ?? 0;
    if (isWhite(color)) return;
    const [px, py] = apply(ctx.m, numAttr(el, 'x'), numAttr(el, 'y'));
    if (ctx.clip && (px < ctx.clip.x0 || px > ctx.clip.x1 || py < ctx.clip.y0 || py > ctx.clip.y1)) return;
    const sans = /arimo|arial|helvetica|sans-serif/i.test(ctx.fontFamily) && !/gelasio|georgia|times/i.test(ctx.fontFamily);
    const bold = /^(bold|bolder|[6-9]00)$/.test(ctx.fontWeight);
    const italic = /italic|oblique/.test(ctx.fontStyle);
    const fam = sans ? 'SANS' : 'SERIF';
    const variant = [bold ? 'GRAS' : '', italic ? 'ITALIQUE' : ''].filter(Boolean).join('-');
    const style = doc.textStyle(`VBX-${fam}${variant ? `-${variant}` : ''}`, FONT_FILES[`${fam}-${variant}`]);
    const [dx, dy] = [ctx.m[0], ctx.m[1]];
    const rotation = (Math.atan2(-dy, dx) * 180) / Math.PI;
    const [x, y] = map.at(px, py);
    doc.text(
      x,
      y,
      value,
      { style, height: ctx.fontSize * scaleOf(ctx.m) * map.k * CAP[fam], rotation: Math.abs(rotation) < 1e-6 ? 0 : rotation, align: ctx.anchor === 'middle' ? 'middle' : ctx.anchor === 'end' ? 'end' : 'start' },
      { layer: ctx.layer, color },
    );
  };

  const walk = (el: Element, parent: Ctx) => {
    const tag = el.tagName.toLowerCase().replace(/^svg:/, '');
    if (tag === 'defs' || tag === 'clippath' || tag === 'title' || tag === 'desc' || tag === 'style' || tag === 'mask' || tag === 'pattern') return;
    if (attr(el, 'display') === 'none' || attr(el, 'visibility') === 'hidden') return;
    const ctx: Ctx = { ...parent, opacity: parent.opacity };
    const stroke = attr(el, 'stroke');
    if (stroke !== null) ctx.stroke = stroke;
    const sw = attr(el, 'stroke-width');
    if (sw !== null) ctx.strokeWidth = parseFloat(sw);
    const fill = attr(el, 'fill');
    if (fill !== null) ctx.fill = fill;
    const fo = attr(el, 'fill-opacity');
    if (fo !== null) ctx.fillOpacity = parseFloat(fo);
    const op = attr(el, 'opacity');
    if (op !== null) ctx.opacity = parent.opacity * parseFloat(op);
    const dash = attr(el, 'stroke-dasharray');
    if (dash !== null) ctx.dash = dash === 'none' ? null : dash.split(/[\s,]+/).filter(Boolean).map(Number);
    const fs = attr(el, 'font-size');
    if (fs !== null) ctx.fontSize = parseFloat(fs);
    const ff = attr(el, 'font-family');
    if (ff !== null) ctx.fontFamily = ff;
    const fw = attr(el, 'font-weight');
    if (fw !== null) ctx.fontWeight = fw;
    const fst = attr(el, 'font-style');
    if (fst !== null) ctx.fontStyle = fst;
    const ta = attr(el, 'text-anchor');
    if (ta !== null) ctx.anchor = ta;
    const layer = el.getAttribute('data-dxf');
    if (layer) ctx.layer = layer;
    const vp = el.getAttribute('data-vp');
    if (vp) ctx.vp = vp;

    if (tag === 'svg') {
      // fenêtre SVG imbriquée (logos) : x, y, width, height, viewBox, preserveAspectRatio « meet »
      if (el !== svg) {
        const x = numAttr(el, 'x');
        const y = numAttr(el, 'y');
        const w = numAttr(el, 'width');
        const h = numAttr(el, 'height');
        const vb = (el.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
        let k: M = [1, 0, 0, 1, x, y];
        if (vb.length === 4 && vb[2] > 0 && vb[3] > 0 && w > 0 && h > 0) {
          const par = el.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet';
          let sx = w / vb[2];
          let sy = h / vb[3];
          let tx = 0;
          let ty = 0;
          if (!/none/.test(par)) {
            const s = /slice/.test(par) ? Math.max(sx, sy) : Math.min(sx, sy);
            sx = sy = s;
            tx = /xMid/.test(par) ? (w - vb[2] * s) / 2 : /xMax/.test(par) ? w - vb[2] * s : 0;
            ty = /YMid/.test(par) ? (h - vb[3] * s) / 2 : /YMax/.test(par) ? h - vb[3] * s : 0;
          }
          k = [sx, 0, 0, sy, x + tx - vb[0] * sx, y + ty - vb[1] * sy];
        }
        ctx.m = mul(ctx.m, k);
      }
    } else ctx.m = mul(ctx.m, parseTransform(el.getAttribute('transform')));

    // découpe rectangulaire (clip-path → <clipPath><rect/></clipPath>)
    const clipRef = /url\(\s*#([^)]+)\)/.exec(attr(el, 'clip-path') ?? '');
    if (clipRef) {
      const r = byId(clipRef[1])?.querySelector('rect');
      if (r) {
        const x = numAttr(r, 'x');
        const y = numAttr(r, 'y');
        const corners = [apply(ctx.m, x, y), apply(ctx.m, x + numAttr(r, 'width'), y + numAttr(r, 'height'))];
        const b: Box = { x0: Math.min(corners[0][0], corners[1][0]), y0: Math.min(corners[0][1], corners[1][1]), x1: Math.max(corners[0][0], corners[1][0]), y1: Math.max(corners[0][1], corners[1][1]) };
        ctx.clip = ctx.clip ? { x0: Math.max(ctx.clip.x0, b.x0), y0: Math.max(ctx.clip.y0, b.y0), x1: Math.min(ctx.clip.x1, b.x1), y1: Math.min(ctx.clip.y1, b.y1) } : b;
      }
    }

    const segFor = (len: number) => Math.max(4, Math.min(64, Math.ceil((len * scaleOf(ctx.m)) / 0.4)));
    switch (tag) {
      case 'svg':
      case 'g':
      case 'a':
        for (const c of Array.from(el.children)) walk(c, ctx);
        return;
      case 'path': {
        const d = el.getAttribute('d');
        if (d) draw(ctx, parsePath(d, segFor), true);
        return;
      }
      case 'line':
        draw(ctx, [{ pts: [numAttr(el, 'x1'), numAttr(el, 'y1'), numAttr(el, 'x2'), numAttr(el, 'y2')], closed: false }], false);
        return;
      case 'polyline':
      case 'polygon': {
        const pts = (el.getAttribute('points') ?? '').split(/[\s,]+/).filter(Boolean).map(Number);
        draw(ctx, [{ pts, closed: tag === 'polygon' }], true);
        return;
      }
      case 'rect': {
        const x = numAttr(el, 'x');
        const y = numAttr(el, 'y');
        const w = numAttr(el, 'width');
        const h = numAttr(el, 'height');
        if (w <= 0 || h <= 0) return;
        draw(ctx, [{ pts: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true }], true);
        return;
      }
      case 'image': {
        // image 3D : non reprise en DXF, seul son cadre est tracé (fin, gris)
        const x = numAttr(el, 'x');
        const y = numAttr(el, 'y');
        const w = numAttr(el, 'width');
        const h = numAttr(el, 'height');
        if (w > 0 && h > 0) draw({ ...ctx, stroke: '#808080', strokeWidth: 0.18 / Math.max(1e-9, scaleOf(ctx.m)), dash: null, fill: 'none' }, [{ pts: [x, y, x + w, y, x + w, y + h, x, y + h], closed: true }], false);
        return;
      }
      case 'circle':
      case 'ellipse': {
        const cx = numAttr(el, 'cx');
        const cy = numAttr(el, 'cy');
        const rx = tag === 'circle' ? numAttr(el, 'r') : numAttr(el, 'rx');
        const ry = tag === 'circle' ? rx : numAttr(el, 'ry');
        if (rx <= 0 || ry <= 0) return;
        const map = mapper(ctx.vp);
        if (!map) return;
        const [px, py] = apply(ctx.m, cx, cy);
        const uniform = Math.abs(ctx.m[0] - ctx.m[3]) < 1e-9 && Math.abs(ctx.m[1] + ctx.m[2]) < 1e-9 && rx === ry;
        const pr = rx * scaleOf(ctx.m);
        const inside = !ctx.clip || (px - pr >= ctx.clip.x0 && px + pr <= ctx.clip.x1 && py - pr >= ctx.clip.y0 && py + pr <= ctx.clip.y1);
        if (uniform && inside) {
          const [ox, oy] = map.at(px, py);
          const r = pr * map.k;
          const fsty = fillStyle(ctx);
          if (fsty) {
            const loop: number[] = [];
            for (let i = 0; i < 32; i++) loop.push(ox + r * Math.cos((i * Math.PI) / 16), oy + r * Math.sin((i * Math.PI) / 16));
            doc.hatch([loop], fsty);
          }
          const ss = strokeStyle(ctx, map.k);
          if (ss) doc.circle(ox, oy, r, ss);
          return;
        }
        const pts: number[] = [];
        for (let i = 0; i < 48; i++) pts.push(cx + rx * Math.cos((i * Math.PI) / 24), cy + ry * Math.sin((i * Math.PI) / 24));
        draw(ctx, [{ pts, closed: true }], true);
        return;
      }
      case 'text':
        text(el, ctx);
        return;
      default:
        return;
    }
  };

  const root: Ctx = {
    m: IDENTITY,
    stroke: null,
    strokeWidth: 1,
    fill: '#000',
    fillOpacity: 1,
    opacity: 1,
    dash: null,
    fontSize: 16,
    fontFamily: 'serif',
    fontWeight: '400',
    fontStyle: 'normal',
    anchor: 'start',
    layer: 'VBX-DIVERS',
    vp: null,
    clip: null,
  };
  // le SVG racine est en mm papier (viewBox 0 0 w h)
  const vb = (svg.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb[2] > 0 && Math.abs(vb[2] - opt.paper.w) > 1e-6) root.m = [opt.paper.w / vb[2], 0, 0, opt.paper.h / vb[3], -vb[0] * (opt.paper.w / vb[2]), -vb[1] * (opt.paper.h / vb[3])];
  const start = doc.entityCount;
  walk(svg, root);
  if (opt.label && doc.entityCount > start) {
    // 10 mm papier au-dessus de la planche, majuscules de 7 mm papier
    const k = real ? S : 1;
    doc.text(x0, y0 + (H + 10) * k, opt.label, { style: doc.textStyle('VBX-SANS-GRAS', FONT_FILES['SANS-GRAS']), height: 7 * k }, { layer: 'VBX-PLANCHES', color: 0 });
  }
  return doc;
}

/** SVG (texte) d'une planche → DXF (texte). */
export function sheetMarkupToDxf(markup: string, opt: SvgToDxfOptions): { dxf: string; entities: number } {
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') throw new Error('SVG de planche invalide');
  const doc = svgToDxf(svg, opt);
  return { dxf: doc.toString(), entities: doc.entityCount };
}
