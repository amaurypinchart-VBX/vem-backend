// Viewbox identiques pour une vue « chaque Viewbox » : même définition + mêmes pièces visibles / fantômes (chemins
// relatifs) + mêmes accessoires (définition, position et orientation dans le repère de la Viewbox, à 5 mm près) +
// mêmes plans de coupe relatifs ⇒ un seul bloc « VBX-01 = VBX-04 », un seul calcul (traits translatés).
import type { SceneIndex } from '../types';
import type { SceneLookup } from '../subset';
import type { ModuleFrame, Vec3 } from '../views';
import { dot } from '../views';
import type { ClipPlane } from './cuts';
import type { PathIndex } from './paths';
import { segmentOf } from './paths';
import type { NodeState } from './visibility';

const r5 = (v: number) => Math.round(v / 5) * 5;
const r2 = (v: number) => (Math.abs(v) < 5e-3 ? 0 : Math.round(v * 100) / 100);

/** Point monde → repère de la Viewbox (x, y en plan, z hauteur). */
export function toLocal(f: ModuleFrame, p: Vec3): Vec3 {
  const q: Vec3 = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]];
  return [dot(q, f.xAxis), dot(q, f.yAxis), dot(q, f.up)];
}

/** Plan de coupe dans le repère de la Viewbox (arrondi à 0,01 mm) : clé de calcul relative. */
export function relativePlane(f: ModuleFrame, p: ClipPlane): string {
  const n: Vec3 = [dot(p.n, f.xAxis), dot(p.n, f.yAxis), dot(p.n, f.up)];
  const d = p.d - dot(p.n, f.origin);
  return [...n.map((v) => r2(v * 1e4) / 1e4), r2(d)].join(',');
}

export interface SignatureContext {
  index: SceneIndex;
  look: SceneLookup;
  paths: PathIndex;
  frames: ReadonlyMap<string, ModuleFrame>;
  states: ReadonlyMap<string, NodeState>;
  /** plans de chaque nœud maillé */
  planes: ReadonlyMap<string, ClipPlane[]>;
}

/** Signature d'une Viewbox dans une vue (null si elle n'a pas de repère). */
export function moduleSignature(ctx: SignatureContext, moduleId: string): string | null {
  const m = ctx.index.modules.find((x) => x.id === moduleId);
  const f = ctx.frames.get(moduleId);
  if (!m || !f) return null;
  const parts: string[] = [ctx.paths.moduleDefinition(moduleId), `${r5(f.max[0] - f.min[0])}x${r5(f.max[1] - f.min[1])}x${r5(f.max[2] - f.min[2])}`];
  const hier: string[] = [];
  const planeKeys = new Set<string>();
  for (const n of ctx.index.nodes) {
    if (n.moduleId !== moduleId || n.kind !== 'mesh' || n.triangles === 0) continue;
    const s = ctx.states.get(n.id) ?? 'hidden';
    if (s === 'hidden') continue;
    const p = ctx.paths.pathOf(n.id);
    const pl = (ctx.planes.get(n.id) ?? []).map((x) => relativePlane(f, x)).join(';');
    planeKeys.add(pl);
    if (p) hier.push(`${s[0]}:${p}`);
  }
  hier.sort();
  // accessoires rattachés par position : définition + position / orientation relatives + état
  const acc: string[] = [];
  for (const id of m.itemIds) {
    const n = ctx.look.byId.get(id);
    if (!n || ctx.paths.pathOf(id) || !n.bboxMm) continue;
    const s = ctx.states.get(id) ?? 'hidden';
    if (s === 'hidden') continue;
    const b = n.bboxMm;
    const c = toLocal(f, [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]);
    // étendue dans le repère (orientation à 90° près)
    const e0 = toLocal(f, [b[0], b[1], b[2]]);
    const e1 = toLocal(f, [b[3], b[4], b[5]]);
    acc.push(`${s[0]}:${segmentOf(n)}@${c.map(r5).join(',')}|${[0, 1].map((k) => r5(Math.abs(e1[k] - e0[k]))).join('x')}`);
  }
  acc.sort();
  parts.push(hier.join('\n'), acc.join('\n'), [...planeKeys].sort().join('|'));
  return parts.join('\n§\n');
}

/** Groupes de Viewbox identiques (ordre des numéros ; une Viewbox sans signature reste seule). */
export function groupIdentical(moduleIds: string[], signature: (id: string) => string | null): string[][] {
  const groups = new Map<string, string[]>();
  const out: string[][] = [];
  const sorted = [...moduleIds].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
  for (const id of sorted) {
    const s = signature(id);
    if (s === null) {
      out.push([id]);
      continue;
    }
    const g = groups.get(s);
    if (g) g.push(id);
    else {
      const ng = [id];
      groups.set(s, ng);
      out.push(ng);
    }
  }
  return out;
}

/** Titre d'un groupe : « VBX-01 = VBX-04 = VBX-07 ». */
export const groupTitle = (ids: string[]) => ids.join(' = ');
