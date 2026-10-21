// Zones peintes → pièces (nœuds maillés) du modèle ouvert. Pur, déterministe : la face elle-même est retrouvée plus
// tard sur la géométrie (region.ts).
import type { NodeInfo, SceneIndex } from '../types';
import type { PathIndex } from '../customViews/paths';
import { makePathIndex, segmentOf } from '../customViews/paths';
import type { PaintMatch, PaintSettings, PaintTarget } from './types';

export interface ResolvedZone {
  zoneId: string;
  colorId: string;
  target: PaintTarget;
}

export interface PaintContext {
  index: SceneIndex;
  paths: PathIndex;
  byId: Map<string, NodeInfo>;
  kids: Map<string, NodeInfo[]>;
}

export function paintContext(index: SceneIndex, paths?: PathIndex): PaintContext {
  const byId = new Map(index.nodes.map((n) => [n.id, n]));
  const kids = new Map<string, NodeInfo[]>();
  for (const n of index.nodes)
    if (n.parentId) {
      const l = kids.get(n.parentId) ?? [];
      l.push(n);
      kids.set(n.parentId, l);
    }
  return { index, paths: paths ?? makePathIndex(index), byId, kids };
}

/** Viewbox d'un nœud : dans sa hiérarchie, sinon celle à laquelle il est rattaché. */
const moduleOfNode = (ctx: PaintContext, id: string) => ctx.paths.moduleOf(id) ?? ctx.byId.get(id)?.moduleId ?? null;

/** Nœuds visés par une correspondance (avant expansion aux maillages). */
export function matchNodes(ctx: PaintContext, m: PaintMatch): string[] {
  let cand: string[];
  if (m.nodeIds) cand = m.nodeIds.filter((id) => ctx.byId.has(id));
  else if (m.modulePaths) cand = m.modulePaths.flatMap((p) => ctx.paths.nodesAtPath(p));
  else if (m.definitions) {
    const defs = new Set(m.definitions);
    cand = ctx.index.nodes.filter((n) => defs.has(segmentOf(n))).map((n) => n.id);
  } else cand = [];
  return [...new Set(cand)].filter((id) => {
    if (m.modulePaths && !m.modulePaths.includes(ctx.paths.pathOf(id) ?? '\u0000')) return false;
    if (m.definitions && !m.definitions.includes(segmentOf(ctx.byId.get(id)!))) return false;
    if (m.moduleIds && !m.moduleIds.includes(moduleOfNode(ctx, id) ?? '\u0000')) return false;
    return true;
  });
}

/** Le nœud et ses descendants qui portent des triangles. */
export function meshDescendants(ctx: PaintContext, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  while (stack.length) {
    const n = ctx.byId.get(stack.pop()!);
    if (!n) continue;
    if (n.kind === 'mesh' && n.triangles > 0) out.push(n.id);
    for (const c of ctx.kids.get(n.id) ?? []) stack.push(c.id);
  }
  return out;
}

/**
 * Pour chaque nœud maillé : les zones qui le touchent, dans l'ordre de la peinture (la dernière qui touche un triangle
 * gagne). Une face / un côté vise les triangles du nœud lui-même ; « pièce entière » couvre aussi ses descendants.
 */
export function resolvePaint(ctx: PaintContext, paint: PaintSettings): Map<string, ResolvedZone[]> {
  const out = new Map<string, ResolvedZone[]>();
  const colors = new Set(paint.colors.map((c) => c.id));
  for (const z of paint.zones) {
    if (!colors.has(z.colorId)) continue;
    const nodes = matchNodes(ctx, z.target.match);
    const meshes = z.target.scope === 'node' ? nodes.flatMap((id) => meshDescendants(ctx, id)) : nodes.filter((id) => ctx.byId.get(id)?.kind === 'mesh');
    for (const id of new Set(meshes)) {
      const l = out.get(id) ?? [];
      l.push({ zoneId: z.id, colorId: z.colorId, target: z.target });
      out.set(id, l);
    }
  }
  return out;
}

/** Nombre de pièces que toucherait une cible (comptes de la bulle). */
export function countTargets(ctx: PaintContext, target: PaintTarget): number {
  const nodes = matchNodes(ctx, target.match);
  return target.scope === 'node' ? nodes.length : nodes.filter((id) => ctx.byId.get(id)?.kind === 'mesh').length;
}
