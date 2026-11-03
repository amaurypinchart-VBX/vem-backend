// « Côtés extérieurs » sur la scène chargée : pour chaque Viewbox, triangles de ses pièces (hiérarchie + rattachées)
// tournés vers un de ses 4 côtés et près de son plan, puis ceux qu'on voit de dehors (occlusion dans le plan du côté)
// et hors des parties collées à une box voisine. Fait une fois par modèle ouvert (et par réglage des faces avant) :
// une règle ne fait ensuite que filtrer (Viewbox, grands / petits côtés, catégories, vitrages).
// Numérotation des triangles = celle de nodeSoup (maillages de meshesOfNode dans l'ordre, index dans l'ordre).
import { Vector3 } from 'three';
import type { BufferGeometry, Material } from 'three';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import type { BoxSide, ExteriorRule } from '../core/paint/exterior';
import { boxSides, exteriorKey, isCovered, sideOfTriangle, visibleFromOutside } from '../core/paint/exterior';
import type { PaintContext } from '../core/paint/resolve';
import { categoryOfNode, moduleOfNode } from '../core/paint/resolve';
import type { Vec3 } from '../core/views';
import { dot } from '../core/views';
import type { GlassTest } from './packets';

/** Triangle vu de dehors sur un côté extérieur. */
export interface ExteriorTri {
  t: number;
  /** indice dans `sides` */
  side: number;
  glass: boolean;
  /** mm² */
  area: number;
}

export interface ExteriorSurvey {
  sides: BoxSide[];
  /** pièce → ses triangles extérieurs vus de dehors */
  byNode: Map<string, ExteriorTri[]>;
  /** catégorie de chaque pièce de `byNode` ('' = sans catégorie : structure de la box) */
  category: Map<string, string>;
  /** Viewbox de chaque pièce */
  module: Map<string, string>;
}

const surveys = new WeakMap<object, Map<GlassTest | undefined, ExteriorSurvey>>();
const selections = new WeakMap<ExteriorSurvey, Map<string, Map<string, number[]>>>();

/** Relevé des faces extérieures du modèle (gardé tant que la scène et ses repères ne changent pas). */
export function exteriorSurvey(scene: LoadedScene, ctx: PaintContext, isGlass?: GlassTest): ExteriorSurvey {
  let byGlass = surveys.get(scene.frames);
  if (!byGlass) surveys.set(scene.frames, (byGlass = new Map()));
  const hit = byGlass.get(isGlass);
  if (hit) return hit;
  const out = computeSurvey(scene, ctx, isGlass);
  byGlass.set(isGlass, out);
  return out;
}

function computeSurvey(scene: LoadedScene, ctx: PaintContext, isGlass?: GlassTest): ExteriorSurvey {
  const sides = boxSides(scene.frames.values());
  const sidesOf = new Map<string, number[]>();
  sides.forEach((s, i) => sidesOf.set(s.moduleId, [...(sidesOf.get(s.moduleId) ?? []), i]));
  const cat = categoryOfNode(ctx);
  const byNode = new Map<string, ExteriorTri[]>();
  const category = new Map<string, string>();
  const module = new Map<string, string>();
  // pièces maillées par Viewbox
  const nodesOf = new Map<string, string[]>();
  for (const n of ctx.index.nodes) {
    if (n.kind !== 'mesh' || !n.triangles || n.role === 'context') continue;
    const m = moduleOfNode(ctx, n.id);
    if (!m || !sidesOf.has(m)) continue;
    const l = nodesOf.get(m) ?? [];
    l.push(n.id);
    nodesOf.set(m, l);
  }
  scene.root.updateMatrixWorld(true);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const e1 = new Vector3();
  const e2 = new Vector3();
  const n = new Vector3();
  for (const [moduleId, nodeIds] of nodesOf) {
    const mySides = sidesOf.get(moduleId)!.map((i) => sides[i]);
    // triangles candidats par côté (toutes catégories, vitrages compris : ils cachent ce qui est derrière)
    const per = mySides.map(() => ({ uv: [] as number[], depth: [] as number[], refs: [] as Array<{ node: string; t: number; glass: boolean; area: number; covered: boolean }> }));
    for (const nodeId of nodeIds) {
      const obj = scene.objectsById.get(nodeId);
      if (!obj) continue;
      const seen = new Set<string>();
      let t0 = 0;
      for (const mesh of meshesOfNode(obj)) {
        const g = mesh.geometry as BufferGeometry;
        const p = g.attributes.position;
        if (!p) continue;
        const idx = g.index;
        const nt = (idx ? idx.count : p.count) / 3;
        const m = mesh.material as Material | Material[] | undefined;
        const glass = !!isGlass?.(Array.isArray(m) ? m[0] : m);
        const w = mesh.matrixWorld;
        for (let t = 0; t < nt; t++) {
          const i0 = idx ? idx.getX(t * 3) : t * 3;
          const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          a.fromBufferAttribute(p, i0).applyMatrix4(w);
          b.fromBufferAttribute(p, i1).applyMatrix4(w);
          c.fromBufferAttribute(p, i2).applyMatrix4(w);
          e1.subVectors(b, a);
          e2.subVectors(c, a);
          n.crossVectors(e1, e2);
          const len = n.length();
          if (len < 1e-6) continue;
          n.multiplyScalar(1 / len);
          const centre: Vec3 = [(a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3, (a.z + b.z + c.z) / 3];
          const si = sideOfTriangle(mySides, centre, [n.x, n.y, n.z]);
          if (si < 0) continue;
          // export « faces doublées » : la même face deux fois (endroit + envers) ne compte qu'une fois
          const key = [a, b, c]
            .map((v) => `${Math.round(v.x * 10)},${Math.round(v.y * 10)},${Math.round(v.z * 10)}`)
            .sort()
            .join('|');
          if (seen.has(key)) continue;
          seen.add(key);
          const s = mySides[si];
          const q = per[si];
          for (const v of [a, b, c]) {
            const pv: Vec3 = [v.x, v.y, v.z];
            q.uv.push(dot(pv, s.t), dot(pv, s.up));
            q.depth.push(s.plane - dot(pv, s.out));
          }
          q.refs.push({ node: nodeId, t: t0 + t, glass, area: len / 2, covered: isCovered(s, dot(centre, s.t), dot(centre, s.up)) });
        }
        t0 += nt;
      }
    }
    per.forEach((q, k) => {
      if (!q.refs.length) return;
      const vis = visibleFromOutside({ uv: q.uv, depth: q.depth });
      const sideIndex = sidesOf.get(moduleId)![k];
      q.refs.forEach((r, i) => {
        if (!vis[i] || r.covered) return;
        const l = byNode.get(r.node) ?? [];
        l.push({ t: r.t, side: sideIndex, glass: r.glass, area: r.area });
        byNode.set(r.node, l);
        if (!category.has(r.node)) {
          category.set(r.node, cat(r.node) ?? '');
          module.set(r.node, moduleId);
        }
      });
    });
  }
  return { sides, byNode, category, module };
}

/** Triangles peints par une règle (pièce → triangles), filtrés dans le relevé. */
export function exteriorSelection(survey: ExteriorSurvey, rule: ExteriorRule): Map<string, number[]> {
  let cache = selections.get(survey);
  if (!cache) selections.set(survey, (cache = new Map()));
  const key = exteriorKey(rule);
  const hit = cache.get(key);
  if (hit) return hit;
  const mods = rule.modules ? new Set(rule.modules) : null;
  const ex = new Set(rule.exclude);
  const kinds = new Set(rule.sides);
  const out = new Map<string, number[]>();
  for (const [node, tris] of survey.byNode) {
    if (mods && !mods.has(survey.module.get(node)!)) continue;
    if (ex.has(survey.category.get(node) ?? '')) continue;
    const l = tris.filter((x) => kinds.has(survey.sides[x.side].kind) && (rule.glass || !x.glass)).map((x) => x.t);
    if (l.length) out.set(node, l);
  }
  cache.set(key, out);
  return out;
}

/** Surface (m²) vue de dehors par catégorie, pour les cases à cocher du dialogue (vitrages à part). */
export function exteriorAreas(survey: ExteriorSurvey, rule: Pick<ExteriorRule, 'modules' | 'sides'>): { byCategory: Map<string, number>; glass: number } {
  const mods = rule.modules ? new Set(rule.modules) : null;
  const kinds = new Set(rule.sides);
  const byCategory = new Map<string, number>();
  let glass = 0;
  for (const [node, tris] of survey.byNode) {
    if (mods && !mods.has(survey.module.get(node)!)) continue;
    const c = survey.category.get(node) ?? '';
    for (const x of tris) {
      if (!kinds.has(survey.sides[x.side].kind)) continue;
      if (x.glass) glass += x.area / 1e6;
      else byCategory.set(c, (byCategory.get(c) ?? 0) + x.area / 1e6);
    }
  }
  return { byCategory, glass };
}

