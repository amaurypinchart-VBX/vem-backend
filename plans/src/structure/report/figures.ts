// Figures vectorielles du rapport (SVG en mm, dessinées dans le cadre que la mise en page leur donne) : vue en plan
// des Viewbox avec leurs numéros, faces habillées par niveau, taux de travail par Viewbox et par niveau, plan des
// appuis et schéma de la plaque de calage (comme les notes statico). Vue de dessus comme SketchUp : x monde à droite,
// axe Y de SketchUp (= −z monde) vers le haut. Fonctions pures.
import type { StructuralModel } from '../core/assemble';
import type { GroupReaction } from '../core/estimate';
import { groupTypeKey } from '../core/estimate';
import type { EdgeItem } from '../core/loads';
import type { Side } from '../core/templates/viewboxEU';
import { moduleNumber } from '../../sheets/overlays';
import { BRAND, GREY, INK, LIGHT, r2, svgLine, svgRect, svgText } from './doc';
import { textWidth } from './metrics';

export type P2 = [number, number];

export interface PlanModule {
  id: string;
  level: number;
  /** angles en plan (x, z monde), dans l'ordre (x0, y0) (x1, y0) (x1, y1) (x0, y1) du repère du module */
  corners: P2[];
  /** extrémités de chaque côté en plan */
  sides: Record<Side, [P2, P2]>;
}

/** Emprises en plan des Viewbox du modèle de calcul. */
export function planModules(s: Pick<StructuralModel, 'modules'>): PlanModule[] {
  return s.modules.map((m) => {
    const p = m.params;
    const at = (u: number, v: number): P2 => [m.origin[0] + m.u[0] * u + m.v[0] * v, m.origin[2] + m.u[2] * u + m.v[2] * v];
    const c: P2[] = [at(p.x0, p.y0), at(p.x1, p.y0), at(p.x1, p.y1), at(p.x0, p.y1)];
    return { id: m.id, level: m.level, corners: c, sides: { v0: [c[0], c[1]], u1: [c[1], c[2]], v1: [c[3], c[2]], u0: [c[0], c[3]] } };
  });
}

export const centerOf = (m: PlanModule): P2 => [m.corners.reduce((a, p) => a + p[0], 0) / 4, m.corners.reduce((a, p) => a + p[1], 0) / 4];

interface Fit {
  X: (x: number) => number;
  Y: (z: number) => number;
  s: number;
}

/** Échelle et placement d'un ensemble de points (x, z) dans un cadre, marges comprises. */
function fitPoints(pts: P2[], x: number, y: number, w: number, h: number, margin: number): Fit {
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const s = Math.min((w - 2 * margin) / Math.max(x1 - x0, 1), (h - 2 * margin) / Math.max(z1 - z0, 1));
  const ox = x + (w - (x1 - x0) * s) / 2;
  const oy = y + (h - (z1 - z0) * s) / 2;
  return { X: (v) => ox + (v - x0) * s, Y: (v) => oy + (v - z0) * s, s };
}

const poly = (pts: P2[], f: Fit, fill: string, stroke: string, sw: number, dash?: string) =>
  `<polygon points="${pts.map((p) => `${r2(f.X(p[0]))},${r2(f.Y(p[1]))}`).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${r2(sw)}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

/** Piles de Viewbox (même emprise) : numéros « 1/5 » du bas vers le haut, comme les plans d'assemblage. */
export function stacks(mods: PlanModule[]): Array<{ center: P2; ids: string[]; label: string; base: PlanModule }> {
  const out: Array<{ center: P2; ids: string[]; label: string; base: PlanModule }> = [];
  for (const m of [...mods].sort((a, b) => a.level - b.level)) {
    const c = centerOf(m);
    const g = out.find((o) => Math.hypot(o.center[0] - c[0], o.center[1] - c[1]) < 600);
    if (g) g.ids.push(m.id);
    else out.push({ center: c, ids: [m.id], label: '', base: m });
  }
  for (const g of out) g.label = g.ids.map(moduleNumber).join('/');
  return out;
}

/** Flèches des axes de l'installation (x, y) en bas à gauche. */
function axes(x: number, y: number, size: number, labels: [string, string], ax: { x: P2; y: P2 }): string {
  const L = size * 3.2;
  const arrow = (dx: number, dy: number, t: string) => {
    const ex = x + dx * L;
    const ey = y + dy * L;
    const a = Math.atan2(dy, dx);
    const hx = (k: number) => ex - size * 0.7 * Math.cos(a + k);
    const hy = (k: number) => ey - size * 0.7 * Math.sin(a + k);
    return `${svgLine(x, y, ex, ey, INK, 0.25)}<path d="M${r2(ex)} ${r2(ey)}L${r2(hx(0.4))} ${r2(hy(0.4))}L${r2(hx(-0.4))} ${r2(hy(-0.4))}Z" fill="${INK}"/>${svgText(ex + dx * size * 0.9, ey + dy * size * 0.9 + size * 0.35, t, { size, anchor: 'middle' })}`;
  };
  // plan : x monde → droite, z monde → bas
  return arrow(ax.x[0], ax.x[1], labels[0]) + arrow(ax.y[0], ax.y[1], labels[1]);
}

export interface PlanOptions {
  /** couleur de remplissage par Viewbox (sinon gris clair au niveau 0) */
  fill?: Map<string, string>;
  /** texte sous le numéro (par Viewbox du bas de la pile) */
  sub?: Map<string, string>;
  /** axes de l'installation (x, z monde) et leur nom */
  axes?: { x: P2; y: P2; labels: [string, string] };
  text?: number;
}

/** Vue en plan : emprises (niveau 0 pleines, étages en pointillés), numéros des piles. */
export function planSvg(mods: PlanModule[], opt: PlanOptions = {}) {
  return (x: number, y: number, w: number, h: number): string => {
    if (!mods.length) return '';
    const t = opt.text ?? 2.6;
    const f = fitPoints(
      mods.flatMap((m) => m.corners),
      x,
      y,
      w,
      h,
      t * 2.2,
    );
    const p: string[] = [];
    const lvl0 = Math.min(...mods.map((m) => m.level));
    for (const m of [...mods].sort((a, b) => a.level - b.level)) {
      const fill = opt.fill?.get(m.id) ?? (m.level === lvl0 ? '#eef1f6' : 'none');
      p.push(poly(m.corners, f, fill, INK, m.level === lvl0 ? 0.3 : 0.2, m.level === lvl0 ? undefined : '1.2 0.8'));
    }
    for (const g of stacks(mods)) {
      const cx = f.X(g.center[0]);
      const cy = f.Y(g.center[1]);
      const size = Math.min(t * 1.5, Math.max(t * 0.8, (2500 * f.s) / 3));
      const sub = opt.sub?.get(g.base.id);
      p.push(svgText(cx, cy + (sub ? 0 : size * 0.35), g.label, { size, bold: true, color: BRAND, anchor: 'middle' }));
      if (sub) p.push(svgText(cx, cy + size * 1.05, sub, { size: size * 0.72, color: INK, anchor: 'middle' }));
    }
    if (opt.axes) {
      const k = (v: P2): P2 => {
        const n = Math.hypot(v[0], v[1]) || 1;
        return [v[0] / n, v[1] / n];
      };
      p.push(axes(x + t * 1.2, y + h - t * 1.2, t * 0.9, opt.axes.labels, { x: k(opt.axes.x), y: k(opt.axes.y) }));
    }
    return p.join('');
  };
}

export type FaceState = 'closed' | 'open' | 'shared';

/** État de chaque côté (intervalles le long du côté, mm depuis le premier angle) : fermé (murs, vitrages, portes), ouvert, mitoyen. */
export function faceStates(s: Pick<StructuralModel, 'faces' | 'modules'>, edgeItems: EdgeItem[]): Map<string, Array<{ from: number; to: number; state: FaceState }>> {
  const out = new Map<string, Array<{ from: number; to: number; state: FaceState }>>();
  for (const f of s.faces) {
    const list: Array<{ from: number; to: number; state: FaceState }> = [];
    // base : mitoyen, puis intervalles exposés = ouverts, puis objets portés = fermés
    list.push({ from: 0, to: f.length, state: 'shared' });
    for (const [a, b] of f.exposed) list.push({ from: a, to: b, state: 'open' });
    for (const it of edgeItems) if (it.module === f.module && it.side === f.side && it.level === 'floor' && it.loadCase === 'G3') list.push({ from: it.from, to: it.to, state: 'closed' });
    out.set(`${f.module}|${f.side}`, list);
  }
  return out;
}

const FACE_STYLE: Record<FaceState, { color: string; w: number; dash?: string }> = {
  closed: { color: BRAND, w: 0.9 },
  open: { color: INK, w: 0.22 },
  shared: { color: LIGHT, w: 0.18, dash: '0.8 0.6' },
};

/** Petits plans par niveau : côtés fermés en trait épais, ouverts en trait fin, mitoyens en pointillés. */
export function facesSvg(mods: PlanModule[], states: Map<string, Array<{ from: number; to: number; state: FaceState }>>, levelName: (l: number) => string, legend: Record<FaceState, string>) {
  return (x: number, y: number, w: number, h: number): string => {
    const levels = [...new Set(mods.map((m) => m.level))].sort((a, b) => a - b);
    if (!levels.length) return '';
    const cols = Math.min(levels.length, 3);
    const rows = Math.ceil(levels.length / cols);
    const legendH = 5;
    const cw = w / cols;
    const ch = (h - legendH) / rows;
    const all = mods.flatMap((m) => m.corners);
    const p: string[] = [];
    levels.forEach((lv, k) => {
      const cx = x + (k % cols) * cw;
      const cy = y + Math.floor(k / cols) * ch;
      // même échelle pour tous les niveaux : cadre de l'ensemble
      const f = fitPoints(all, cx, cy, cw, ch - 4, 3);
      for (const m of mods.filter((q) => q.level === lv)) {
        p.push(poly(m.corners, f, '#f7f8fa', 'none', 0));
        for (const side of ['v0', 'v1', 'u0', 'u1'] as Side[]) {
          const [a, b] = m.sides[side];
          const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const segs = states.get(`${m.id}|${side}`) ?? [{ from: 0, to: L, state: 'open' as FaceState }];
          for (const sg of segs) {
            const st = FACE_STYLE[sg.state];
            const pa: P2 = [a[0] + ((b[0] - a[0]) * sg.from) / L, a[1] + ((b[1] - a[1]) * sg.from) / L];
            const pb: P2 = [a[0] + ((b[0] - a[0]) * sg.to) / L, a[1] + ((b[1] - a[1]) * sg.to) / L];
            p.push(
              `<line x1="${r2(f.X(pa[0]))}" y1="${r2(f.Y(pa[1]))}" x2="${r2(f.X(pb[0]))}" y2="${r2(f.Y(pb[1]))}" stroke="${st.color}" stroke-width="${r2(st.w)}"${st.dash ? ` stroke-dasharray="${st.dash}"` : ''} stroke-linecap="butt"/>`,
            );
          }
        }
      }
      p.push(svgText(cx + cw / 2, cy + ch - 1, levelName(lv), { size: 2.5, bold: true, color: INK, anchor: 'middle' }));
    });
    // légende
    let lx = x;
    const ly = y + h - 1.5;
    for (const st of ['closed', 'open', 'shared'] as FaceState[]) {
      const s = FACE_STYLE[st];
      p.push(`<line x1="${r2(lx)}" y1="${r2(ly - 0.8)}" x2="${r2(lx + 7)}" y2="${r2(ly - 0.8)}" stroke="${s.color}" stroke-width="${r2(s.w)}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ''}/>`);
      p.push(svgText(lx + 8.5, ly, legend[st], { size: 2.3, color: GREY }));
      lx += 12 + textWidth(legend[st], 2.3);
    }
    return p.join('');
  };
}

/** Couleur d'un taux de travail (mêmes seuils que la vue 3D des résultats). */
export function etaHex(eta: number | undefined): string {
  if (eta === undefined || !Number.isFinite(eta)) return '#8b5cf6';
  if (eta <= 0.5) return '#22c55e';
  if (eta <= 0.9) return '#eab308';
  if (eta <= 1) return '#f97316';
  return '#ef4444';
}

/** Taux maxi de chaque Viewbox, un petit plan par niveau. */
export function etaLevelsSvg(mods: PlanModule[], etaOf: Map<string, number>, levelName: (l: number) => string, fmt: (v: number) => string) {
  return (x: number, y: number, w: number, h: number): string => {
    const levels = [...new Set(mods.map((m) => m.level))].sort((a, b) => a - b);
    if (!levels.length) return '';
    const cols = Math.min(levels.length, 3);
    const rows = Math.ceil(levels.length / cols);
    const cw = w / cols;
    const ch = h / rows;
    const all = mods.flatMap((m) => m.corners);
    const p: string[] = [];
    levels.forEach((lv, k) => {
      const cx = x + (k % cols) * cw;
      const cy = y + Math.floor(k / cols) * ch;
      const f = fitPoints(all, cx, cy, cw, ch - 4, 3);
      for (const m of mods.filter((q) => q.level === lv)) {
        const e = etaOf.get(m.id);
        p.push(poly(m.corners, f, etaHex(e), '#ffffff', 0.3));
        const c = centerOf(m);
        const size = Math.min(2.6, Math.max(1.6, (2500 * f.s) / 3.2));
        p.push(svgText(f.X(c[0]), f.Y(c[1]) - size * 0.1, moduleNumber(m.id), { size, bold: true, color: INK, anchor: 'middle' }));
        p.push(svgText(f.X(c[0]), f.Y(c[1]) + size * 1.0, e !== undefined && Number.isFinite(e) ? fmt(e) : '—', { size: size * 0.85, color: INK, anchor: 'middle' }));
      }
      p.push(svgText(cx + cw / 2, cy + ch - 1, levelName(lv), { size: 2.5, bold: true, color: INK, anchor: 'middle' }));
    });
    return p.join('');
  };
}

export const TYPE_HEX: Record<string, string> = { '1': '#2563eb', '2': '#16a34a', '3': '#d97706', '4': '#dc2626', M: '#7c3aed', E: '#0891b2' };
export const groupType = (r: GroupReaction) => groupTypeKey(r.group);

/** Plan des appuis : emprises du niveau 0, groupes colorés par type avec leur nom et Rz,k. */
export function supportsSvg(mods: PlanModule[], reactions: GroupReaction[], fmtKN: (n: number) => string) {
  return (x: number, y: number, w: number, h: number): string => {
    const ground = mods.filter((m) => m.level === Math.min(...mods.map((q) => q.level)));
    if (!ground.length) return '';
    const t = 2.3;
    const f = fitPoints(
      ground.flatMap((m) => m.corners),
      x,
      y,
      w,
      h,
      t * 3,
    );
    const p: string[] = [];
    for (const m of ground) p.push(poly(m.corners, f, '#eef1f6', INK, 0.25));
    for (const g of stacks(mods)) p.push(svgText(f.X(g.center[0]), f.Y(g.center[1]) + 0.9, g.label, { size: 2.6, bold: true, color: LIGHT, anchor: 'middle' }));
    const r = Math.max(1.1, 210 * f.s * 0.6);
    for (const re of reactions) {
      const [px, pz] = re.group.position;
      const cx = f.X(px);
      const cy = f.Y(pz);
      p.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(r)}" fill="${TYPE_HEX[groupType(re)]}" stroke="#ffffff" stroke-width="0.2"/>`);
      const id = re.group.id;
      const val = fmtKN(re.Rk);
      p.push(svgRect(cx - textWidth(id, t * 0.9, true) / 2 - 0.4, cy - r - t * 1.25, textWidth(id, t * 0.9, true) + 0.8, t * 1.05, '#ffffff'));
      p.push(svgText(cx, cy - r - t * 0.4, id, { size: t * 0.9, bold: true, anchor: 'middle' }));
      p.push(svgRect(cx - textWidth(val, t * 0.8) / 2 - 0.4, cy + r + 0.2, textWidth(val, t * 0.8) + 0.8, t * 1.0, '#ffffff'));
      p.push(svgText(cx, cy + r + t * 0.95, val, { size: t * 0.8, anchor: 'middle' }));
    }
    return p.join('');
  };
}

/** Schéma de la plaque (statico) : vue de dessus (contact a1 × a2 au centre, plaque b × l, porte-à-faux diagonal e) et coupe. */
export function plateSvg(a1: number, a2: number, b: number, l: number, labels: { e: string; section: string; rz: string; sigma: string }) {
  return (x: number, y: number, w: number, h: number): string => {
    const p: string[] = [];
    const side = Math.min(h - 8, w * 0.42);
    const s = side / Math.max(b, l);
    const ox = x + 6;
    const oy = y + 3;
    const B = l * s;
    const L = b * s;
    const A1 = a1 * s;
    const A2 = a2 * s;
    // vue de dessus
    p.push(svgRect(ox, oy, B, L, '#fdf6e3', INK, 0.3));
    const ix = ox + (B - A1) / 2;
    const iy = oy + (L - A2) / 2;
    p.push(svgRect(ix, iy, A1, A2, '#d1d5db', INK, 0.25));
    p.push(`<line x1="${r2(ix + A1)}" y1="${r2(iy + A2)}" x2="${r2(ox + B)}" y2="${r2(oy + L)}" stroke="#b91c1c" stroke-width="0.3"/>`);
    p.push(svgText(ix + A1 + (B - A1) / 4 + 1.5, iy + A2 + (L - A2) / 4 + 0.5, labels.e, { size: 2.5, color: '#b91c1c' }));
    p.push(svgText(ix + A1 / 2, iy + A2 / 2 + 0.9, 'a1 × a2', { size: 2.2, anchor: 'middle' }));
    p.push(svgText(ox + B / 2, oy + L + 3.4, 'b', { size: 2.5, anchor: 'middle', italic: true }));
    p.push(svgText(ox - 2.4, oy + L / 2, 'l', { size: 2.5, anchor: 'middle', italic: true }));
    // coupe
    const cx = ox + B + 14;
    const cw = Math.min(w - (cx - x) - 4, B);
    const cy = oy + L * 0.45;
    const th = 3;
    p.push(svgRect(cx, cy, cw, th, '#fdf6e3', INK, 0.3));
    const aw = (A1 / B) * cw;
    p.push(svgRect(cx + (cw - aw) / 2, cy - 6, aw, 6, '#d1d5db', INK, 0.25));
    p.push(`<path d="M${r2(cx + cw / 2)} ${r2(cy - 12)}L${r2(cx + cw / 2)} ${r2(cy - 6.6)}" stroke="${INK}" stroke-width="0.35"/><path d="M${r2(cx + cw / 2)} ${r2(cy - 6.2)}l-0.9 -1.8h1.8Z" fill="${INK}"/>`);
    p.push(svgText(cx + cw / 2 + 1.5, cy - 10, labels.rz, { size: 2.4 }));
    for (let k = 0; k <= 8; k++) {
      const ax = cx + (k / 8) * cw;
      p.push(`<path d="M${r2(ax)} ${r2(cy + th + 4)}L${r2(ax)} ${r2(cy + th + 0.6)}" stroke="#2563eb" stroke-width="0.2"/><path d="M${r2(ax)} ${r2(cy + th + 0.3)}l-0.5 1.1h1Z" fill="#2563eb"/>`);
    }
    p.push(svgText(cx + cw / 2, cy + th + 7, labels.sigma, { size: 2.4, anchor: 'middle', color: '#2563eb' }));
    p.push(svgText(cx + cw + 1.5, cy + th / 2 + 0.9, 'h', { size: 2.5, italic: true }));
    p.push(svgText(cx, cy - 14, labels.section, { size: 2.3, color: GREY }));
    return p.join('');
  };
}

/** Image raster (capture 3D) centrée dans le cadre, proportions gardées. */
export function imageSvg(img: { href: string; width: number; height: number }) {
  return (x: number, y: number, w: number, h: number): string => {
    const k = Math.min(w / img.width, h / img.height);
    const iw = img.width * k;
    const ih = img.height * k;
    return `<image href="${img.href}" x="${r2(x + (w - iw) / 2)}" y="${r2(y + (h - ih) / 2)}" width="${r2(iw)}" height="${r2(ih)}" preserveAspectRatio="xMidYMid meet"/>`;
  };
}
