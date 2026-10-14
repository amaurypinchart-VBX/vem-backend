// Coupes d'une vue spéciale → plans de coupe par nœud, dans le repère du SceneIndex (mm, Y vers le haut).
// Un plan garde les points p tels que n·p ≥ d (la normale pointe vers le côté gardé).
// - repère monde : un même plan pour tout le modèle ;
// - repère module : le plan est posé dans chaque Viewbox, à sa propre référence (hauteur mesurée, milieu, côté) ;
//   un élément commun (hors Viewbox) le reçoit à la référence de la Viewbox la plus proche en plan ;
// - profondeur de vue : second plan parallèle, à `depth` au-delà ; boîte de coupe : 6 plans.
import type { SceneIndex } from '../types';
import type { SceneLookup } from '../subset';
import type { ModuleFrame, Vec3 } from '../views';
import { dot, normalize } from '../views';
import type { ModuleRefs } from './refs';
import type { CustomViewSpec, CustomViewWarning, CutPlane, SectionBox } from './types';

export interface ClipPlane {
  /** normale unitaire vers le côté gardé */
  n: Vec3;
  d: number;
  /** coupe d'origine (repère A–A, plan de section à boucher) ; absent = plan de profondeur / boîte (pas de section) */
  cutId?: string;
}

export interface CutContext {
  index: SceneIndex;
  look: SceneLookup;
  frames: ReadonlyMap<string, ModuleFrame>;
  /** références de hauteur par Viewbox (moduleRefs) */
  refs: ReadonlyMap<string, ModuleRefs>;
  /** Viewbox de la vue (ordre : niveau puis numéro) */
  modules: string[];
}

const local = (f: ModuleFrame, x: number, y: number, z: number): Vec3 => [
  f.origin[0] + x * f.xAxis[0] + y * f.yAxis[0] + z * f.up[0],
  f.origin[1] + x * f.xAxis[1] + y * f.yAxis[1] + z * f.up[1],
  f.origin[2] + x * f.xAxis[2] + y * f.yAxis[2] + z * f.up[2],
];

const shortAxis = (f: ModuleFrame): 'x' | 'y' => (f.longAxis === 'x' ? 'y' : 'x');

function plane(n: Vec3, point: Vec3, keep: 'positive' | 'negative', cutId?: string): ClipPlane {
  const u = normalize(n);
  const s = keep === 'positive' ? 1 : -1;
  const nn: Vec3 = [u[0] * s, u[1] * s, u[2] * s];
  return { n: nn, d: dot(nn, point), cutId };
}

function withDepth(p: ClipPlane, depth: number | undefined): ClipPlane[] {
  if (!depth) return [p];
  // garde aussi n·x ≤ d + depth
  return [p, { n: [-p.n[0], -p.n[1], -p.n[2]], d: -(p.d + depth) }];
}

/** Plans d'une coupe pour une Viewbox (repère module) ou pour le monde (frame absent). */
export function cutPlanes(cut: CutPlane, frame: ModuleFrame | undefined, refs: ModuleRefs | undefined): ClipPlane[] {
  if (cut.axis === 'custom' && cut.custom) return withDepth(plane(cut.custom.normal, cut.custom.point, cut.keep, cut.id), cut.depth);
  if (cut.axis === 'horizontal') {
    let y = cut.offset;
    if (cut.ref.kind === 'level') y = (refs ? refs[cut.ref.ref].y : 0) + cut.offset;
    else if (cut.frame === 'module' && frame) y = frame.origin[1] + cut.offset;
    return withDepth(plane([0, 1, 0], [0, y, 0], cut.keep, cut.id), cut.depth);
  }
  if ((cut.axis === 'long' || cut.axis === 'short') && frame) {
    // longitudinale : plan parallèle au grand côté (normale = petit axe) ; transversale : normale = grand axe
    const ax = cut.axis === 'long' ? shortAxis(frame) : frame.longAxis;
    const k = ax === 'x' ? 0 : 1;
    let c = cut.offset;
    if (cut.ref.kind === 'module') {
      const base = cut.ref.ref === 'mid' ? (frame.min[k] + frame.max[k]) / 2 : cut.ref.ref === 'side0' ? frame.min[k] : frame.max[k];
      c = base + cut.offset;
    }
    const n = ax === 'x' ? frame.xAxis : frame.yAxis;
    const p = local(frame, k === 0 ? c : 0, k === 1 ? c : 0, 0);
    return withDepth(plane(n, p, cut.keep, cut.id), cut.depth);
  }
  const n: Vec3 = cut.axis === 'z' ? [0, 0, 1] : [1, 0, 0];
  return withDepth(plane(n, [n[0] * cut.offset, 0, n[2] * cut.offset], cut.keep, cut.id), cut.depth);
}

/** 6 plans d'une boîte de coupe (intérieur gardé). */
export function boxPlanes(box: SectionBox, frame: ModuleFrame | undefined): ClipPlane[] {
  const out: ClipPlane[] = [];
  if (box.frame === 'module' && frame) {
    const axes: Vec3[] = [frame.xAxis, frame.yAxis, frame.up];
    for (let k = 0; k < 3; k++) {
      const pMin = local(frame, k === 0 ? box.min[0] : 0, k === 1 ? box.min[1] : 0, k === 2 ? box.min[2] : 0);
      const pMax = local(frame, k === 0 ? box.max[0] : 0, k === 1 ? box.max[1] : 0, k === 2 ? box.max[2] : 0);
      out.push(plane(axes[k], pMin, 'positive'), plane(axes[k], pMax, 'negative'));
    }
    return out;
  }
  for (let k = 0; k < 3; k++) {
    const n: Vec3 = [k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0];
    out.push({ n, d: box.min[k] }, { n: [-n[0], -n[1], -n[2]], d: -box.max[k] });
  }
  return out;
}

export interface ResolvedCuts {
  /** plans de chaque nœud maillé (absent = aucun plan) */
  byNode: Map<string, ClipPlane[]>;
  warnings: CustomViewWarning[];
}

/** Viewbox la plus proche en plan d'un point (éléments communs). */
export function nearestModule(frames: ReadonlyMap<string, ModuleFrame>, modules: string[], p: Vec3): string | undefined {
  let best: string | undefined;
  let bestD = Infinity;
  for (const id of modules) {
    const f = frames.get(id);
    if (!f) continue;
    const c = local(f, (f.min[0] + f.max[0]) / 2, (f.min[1] + f.max[1]) / 2, 0);
    const dd = Math.hypot(c[0] - p[0], c[2] - p[2]);
    if (dd < bestD) {
      bestD = dd;
      best = id;
    }
  }
  return best;
}

export function resolveCuts(ctx: CutContext, spec: Pick<CustomViewSpec, 'cuts' | 'box'>, meshIds: string[]): ResolvedCuts {
  const warnings: CustomViewWarning[] = [];
  const byNode = new Map<string, ClipPlane[]>();
  if (!spec.cuts.length && !spec.box) return { byNode, warnings };
  const refModule = ctx.modules[0];
  const worldPlanes: ClipPlane[] = [];
  const moduleCuts: CutPlane[] = [];
  for (const c of spec.cuts) {
    if (c.frame === 'module') moduleCuts.push(c);
    else {
      // repère monde avec une référence de niveau : celle de la première Viewbox de la vue
      const f = refModule ? ctx.frames.get(refModule) : undefined;
      if (c.ref.kind === 'level' && !f) {
        warnings.push({ code: 'CUT_IGNORED', message: `Coupe ${c.label ?? ''} ignorée : aucune Viewbox pour mesurer la référence` });
        continue;
      }
      worldPlanes.push(...cutPlanes(c, f, refModule ? ctx.refs.get(refModule) : undefined));
    }
  }
  if (spec.box) {
    if (spec.box.frame === 'module' && spec.box.moduleId) {
      const f = ctx.frames.get(spec.box.moduleId);
      if (f) worldPlanes.push(...boxPlanes(spec.box, f));
      else warnings.push({ code: 'MODULE_MISSING', message: `Boîte de coupe : ${spec.box.moduleId} n’existe plus dans ce modèle` });
    } else if (spec.box.frame === 'world') worldPlanes.push(...boxPlanes(spec.box, undefined));
  }
  const perModule = new Map<string, ClipPlane[]>();
  const planesOfModule = (m: string): ClipPlane[] => {
    let l = perModule.get(m);
    if (l) return l;
    const f = ctx.frames.get(m);
    const r = ctx.refs.get(m);
    l = [...worldPlanes];
    if (f) {
      for (const c of moduleCuts) l.push(...cutPlanes(c, f, r));
      if (spec.box && spec.box.frame === 'module' && !spec.box.moduleId) l.push(...boxPlanes(spec.box, f));
    }
    perModule.set(m, l);
    return l;
  };
  const needsModule = moduleCuts.length > 0 || (!!spec.box && spec.box.frame === 'module' && !spec.box.moduleId);
  for (const id of meshIds) {
    let planes = worldPlanes;
    if (needsModule) {
      const n = ctx.look.byId.get(id);
      let m = n?.moduleId ?? undefined;
      if (!m && n?.bboxMm) {
        const b = n.bboxMm;
        m = nearestModule(ctx.frames, ctx.modules, [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]);
      }
      planes = m && ctx.frames.has(m) ? planesOfModule(m) : worldPlanes;
    }
    if (planes.length) byNode.set(id, planes);
  }
  return { byNode, warnings };
}
