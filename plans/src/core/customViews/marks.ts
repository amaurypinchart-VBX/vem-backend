// Repères des coupes d'une vue spéciale sur les autres vues du jeu (pure) : trait A–A des coupes verticales nommées
// sur les vues en plan (dans chaque Viewbox pour une coupe « dans chaque Viewbox »), niveau « +2 550 » des coupes
// horizontales sur les élévations. Coordonnées monde (mm, Y vers le haut).
import type { ModuleFrame, Vec3 } from '../views';
import { cutPlanes } from './cuts';
import type { ModuleRefs } from './refs';
import type { CustomViewSpec } from './types';

export interface SectionMark {
  label: string;
  a: Vec3;
  b: Vec3;
  look: Vec3;
}

const local = (f: ModuleFrame, x: number, y: number, z: number): Vec3 => [
  f.origin[0] + x * f.xAxis[0] + y * f.yAxis[0] + z * f.up[0],
  f.origin[1] + x * f.xAxis[1] + y * f.yAxis[1] + z * f.up[1],
  f.origin[2] + x * f.xAxis[2] + y * f.yAxis[2] + z * f.up[2],
];

/** Traits A–A des coupes verticales nommées, sur le contour en plan de chaque Viewbox concernée. */
export function sectionMarks(spec: CustomViewSpec, frames: ReadonlyMap<string, ModuleFrame>, refs: ReadonlyMap<string, ModuleRefs>, modules: string[]): SectionMark[] {
  const out: SectionMark[] = [];
  for (const c of spec.cuts) {
    if (!c.label || c.axis === 'horizontal') continue;
    const mods = c.frame === 'module' ? modules : modules.slice(0, 1);
    for (const m of mods) {
      const f = frames.get(m);
      if (!f) continue;
      const pl = cutPlanes(c, f, refs.get(m))[0];
      // segment = intersection du plan (vertical) avec le rectangle en plan de la Viewbox (repère local)
      const corners: Array<[number, number]> = [
        [f.min[0], f.min[1]],
        [f.max[0], f.min[1]],
        [f.max[0], f.max[1]],
        [f.min[0], f.max[1]],
      ];
      const pts: Vec3[] = [];
      for (let i = 0; i < 4; i++) {
        const p = local(f, corners[i][0], corners[i][1], 0);
        const q = local(f, corners[(i + 1) % 4][0], corners[(i + 1) % 4][1], 0);
        const sp = pl.n[0] * p[0] + pl.n[1] * p[1] + pl.n[2] * p[2] - pl.d;
        const sq = pl.n[0] * q[0] + pl.n[1] * q[1] + pl.n[2] * q[2] - pl.d;
        if ((sp >= 0) === (sq >= 0) || sp === sq) continue;
        const t = sp / (sp - sq);
        pts.push([p[0] + t * (q[0] - p[0]), p[1], p[2] + t * (q[2] - p[2])]);
      }
      if (pts.length < 2) continue;
      // on regarde vers le côté gardé
      out.push({ label: c.label, a: pts[0], b: pts[1], look: pl.n });
    }
  }
  return out;
}

/** Niveaux des coupes horizontales (une valeur par hauteur, depuis le bas de la première Viewbox). */
export function cutLevels(spec: CustomViewSpec, frames: ReadonlyMap<string, ModuleFrame>, refs: ReadonlyMap<string, ModuleRefs>, modules: string[]): Array<{ y: number; text: string }> {
  const out = new Map<number, string>();
  for (const c of spec.cuts) {
    if (c.axis !== 'horizontal') continue;
    const mods = c.frame === 'module' ? modules : modules.slice(0, 1);
    for (const m of mods) {
      const f = frames.get(m);
      if (!f) continue;
      const pl = cutPlanes(c, f, refs.get(m))[0];
      const y = Math.round(pl.n[1] > 0 ? pl.d : -pl.d);
      const base = f.origin[1];
      const rel = Math.round(y - base);
      out.set(y, `${rel >= 0 ? '+' : '−'}${Math.abs(rel).toLocaleString('fr-FR').replace(/ | /g, ' ')}${c.label ? ` (${c.label})` : ''}`);
    }
  }
  return [...out.entries()].map(([y, text]) => ({ y, text }));
}
