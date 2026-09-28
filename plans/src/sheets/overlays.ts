// Surcouches d'une fenêtre de vue calculées depuis les repères des Viewbox : contour de chaque Viewbox (plan
// d'implantation) et numéro au centre (plan d'assemblage), cadre + nom de chaque unité (vue aérienne de l'ensemble).
// Coordonnées : mm modèle, repère du dessin.
import type { ModuleFrame, Vec3, ViewBasis } from '../core/views';
import type { PointMm, RectMm, UnitOverlaySpec } from './types';
import { projectPoint } from '../core/views';

export interface ModuleOverlay {
  moduleId: string;
  /** contour fermé [x0, y0, x1, y1, …] */
  outline: Float64Array;
  center: { x: number; y: number };
  /** plus petite dimension du contour dans le dessin (mm modèle) */
  minSize: number;
}

export function moduleOverlays(frames: Iterable<ModuleFrame>, moduleIds: Set<string>, basis: ViewBasis): ModuleOverlay[] {
  const out: ModuleOverlay[] = [];
  for (const f of frames) {
    if (!moduleIds.has(f.moduleId)) continue;
    const corners: Array<[number, number]> = [
      [f.min[0], f.min[1]],
      [f.max[0], f.min[1]],
      [f.max[0], f.max[1]],
      [f.min[0], f.max[1]],
    ];
    const z = f.max[2];
    const pts = corners.map(([lx, ly]) => {
      const w: Vec3 = [
        f.origin[0] + f.xAxis[0] * lx + f.yAxis[0] * ly + f.up[0] * z,
        f.origin[1] + f.xAxis[1] * lx + f.yAxis[1] * ly + f.up[1] * z,
        f.origin[2] + f.xAxis[2] * lx + f.yAxis[2] * ly + f.up[2] * z,
      ];
      return projectPoint(basis, w);
    });
    const outline = Float64Array.from([...pts.flatMap((p) => [p.x, p.y]), pts[0].x, pts[0].y]);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    out.push({
      moduleId: f.moduleId,
      outline,
      center: { x: xs.reduce((a, b) => a + b) / 4, y: ys.reduce((a, b) => a + b) / 4 },
      minSize: Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)),
    });
  }
  return out;
}

/** Numéros à afficher : des Viewbox empilées (même emprise dans le dessin, vue de dessus) partagent « 1/4 ». */
export function numberLabels(overlays: ModuleOverlay[]): Array<{ key: string; label: string; center: { x: number; y: number }; minSize: number }> {
  const groups: ModuleOverlay[][] = [];
  for (const o of overlays) {
    const g = groups.find(([a]) => Math.hypot(a.center.x - o.center.x, a.center.y - o.center.y) < 0.15 * Math.min(a.minSize, o.minSize));
    if (g) g.push(o);
    else groups.push([o]);
  }
  return groups.map((g) => {
    const sorted = [...g].sort((a, b) => Number(moduleNumber(a.moduleId)) - Number(moduleNumber(b.moduleId)) || a.moduleId.localeCompare(b.moduleId));
    return { key: sorted.map((o) => o.moduleId).join('+'), label: sorted.map((o) => moduleNumber(o.moduleId)).join('/'), center: sorted[0].center, minSize: Math.min(...g.map((o) => o.minSize)) };
  });
}

/** Numéro affiché d'une Viewbox (« VBX-07 » → « 7 »). */
export function moduleNumber(moduleId: string): string {
  const m = moduleId.match(/(\d+)\s*$/);
  return m ? String(Number(m[1])) : moduleId;
}

/** Cadre des unités sur la planche : écart autour de leurs Viewbox, hauteur et écart du nom (mm papier, sous le cadre). */
export const UNIT_FRAME = { margin: 4, text: 5, textGap: 2.5 };

/** Place à laisser autour du dessin (mm papier) pour les cadres et noms des unités. */
export const UNIT_FRAME_MARGINS = { top: UNIT_FRAME.margin, left: UNIT_FRAME.margin, right: UNIT_FRAME.margin, bottom: UNIT_FRAME.margin + UNIT_FRAME.textGap + UNIT_FRAME.text * 1.3 };

/** Cadre (mm papier) de chaque unité, autour des contours de ses Viewbox. */
export function unitFrames(overlays: ModuleOverlay[], units: UnitOverlaySpec[], toPaper: (x: number, y: number) => PointMm): Array<{ name: string; rect: RectMm }> {
  const out: Array<{ name: string; rect: RectMm }> = [];
  for (const u of units) {
    const ids = new Set(u.moduleIds);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const o of overlays) {
      if (!ids.has(o.moduleId)) continue;
      for (let i = 0; i < o.outline.length; i += 2) {
        const p = toPaper(o.outline[i], o.outline[i + 1]);
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
    }
    if (!Number.isFinite(x0)) continue;
    const m = UNIT_FRAME.margin;
    out.push({ name: u.name, rect: { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m } });
  }
  return out;
}
