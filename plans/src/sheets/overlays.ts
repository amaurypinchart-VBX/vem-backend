// Surcouches d'une fenêtre de vue calculées depuis les repères des Viewbox : contour de chaque Viewbox (plan
// d'implantation) et numéro au centre (plan d'assemblage). Coordonnées : mm modèle, repère du dessin.
import type { ModuleFrame, Vec3, ViewBasis } from '../core/views';
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

/** Numéro affiché d'une Viewbox (« VBX-07 » → « 7 »). */
export function moduleNumber(moduleId: string): string {
  const m = moduleId.match(/(\d+)\s*$/);
  return m ? String(Number(m[1])) : moduleId;
}
