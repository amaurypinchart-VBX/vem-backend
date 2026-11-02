// Planches : éléments masqués d'une vue standard en plus des catégories (étiquettes de vue « Plafond tendu »,
// « Cadres textile »…, pièce cliquée, même pièce dans toutes les Viewbox, type), et coupe horizontale « Vue du sol ».
// Pure : index de scène, étiquettes, chemins, repères des Viewbox. Mêmes critères que les vues spéciales (ViewMatch).
import type { SceneIndex } from './types';
import type { SceneLookup } from './subset';
import type { ModuleFrame } from './views';
import type { VisibilityContext } from './customViews/visibility';
import { ruleTargets } from './customViews/visibility';
import type { CustomViewSpec, VisibilityRule } from './customViews/types';
import type { ModuleRefs } from './customViews/refs';
import { moduleRefs } from './customViews/refs';
import type { TagResolver } from './customViews/tags';
import type { ClipPlane } from './customViews/cuts';
import { resolveCuts } from './customViews/cuts';
import type { SubsetHideRule } from '../linework/types';

/** Nœuds du sous-ensemble (racines `include` et leurs descendants), hors contexte. */
export function subsetNodes(index: SceneIndex, look: SceneLookup, include: string[]): Set<string> {
  const roots = new Set(include);
  const out = new Set<string>();
  for (const n of index.nodes) if (n.role !== 'context' && look.inSet(n.id, roots)) out.add(n.id);
  return out;
}

const asRule = (r: SubsetHideRule): VisibilityRule => ({ id: r.id, op: 'hide', match: r.match, label: r.label, source: 'click' });

/**
 * Racines masquées par les règles (sous-arbres entiers) et nombre de pièces touchées par chaque règle, dans le
 * sous-ensemble de la vue.
 */
export function hiddenByRules(ctx: VisibilityContext, include: string[], rules: SubsetHideRule[], scope?: ReadonlySet<string>): { hidden: Set<string>; counts: Map<string, number> } {
  const hidden = new Set<string>();
  const counts = new Map<string, number>();
  if (!rules.length) return { hidden, counts };
  const inScope = scope ?? subsetNodes(ctx.index, ctx.look, include);
  for (const r of rules) {
    const t = ruleTargets(ctx, asRule(r), inScope);
    counts.set(r.id, t.length);
    for (const id of t) hidden.add(id);
  }
  return { hidden, counts };
}

/** Maillages à dessiner après les règles : ceux qui ne descendent d'aucune racine masquée. */
export function applyHideRules(look: SceneLookup, meshIds: string[], hidden: ReadonlySet<string>): string[] {
  if (!hidden.size) return meshIds;
  return meshIds.filter((id) => !look.inSet(id, hidden));
}

/** Étiquettes de vue présentes dans un sous-ensemble, avec le nombre de pièces (au plus haut niveau). */
export function tagsInSubset(tags: TagResolver, scope: ReadonlySet<string>): Array<{ tag: string; label: string; count: number }> {
  const out: Array<{ tag: string; label: string; count: number }> = [];
  for (const t of tags.all()) {
    const n = tags.nodesWithTag(t.tag).filter((id) => scope.has(id)).length;
    if (n) out.push({ ...t, count: n });
  }
  return out;
}

/** Règle « masquer l'étiquette » (identifiant stable : une pastille par étiquette). */
export function tagHideRule(tag: string, label: string): SubsetHideRule {
  return { id: `tag:${tag}`, match: { viewTags: [tag] }, label };
}

/** Hauteur de coupe par défaut de la « Vue du sol » : 1,20 m au-dessus du plancher (comme le plan coupé). */
export const FLOOR_CUT_DEFAULT = 1200;

/**
 * Plans de la « Vue du sol » : dans chaque Viewbox, coupe horizontale à `height` au-dessus du dessus de son plancher
 * (mesuré), on garde le dessous ; un élément commun suit la Viewbox la plus proche en plan.
 */
export function floorCutPlanes(
  env: { index: SceneIndex; look: SceneLookup; tags: TagResolver; frames: ReadonlyMap<string, ModuleFrame> },
  meshIds: string[],
  height: number,
): { byNode: Map<string, ClipPlane[]>; refs: Map<string, ModuleRefs> } {
  const { index, look, tags, frames } = env;
  const modules = index.modules.filter((m) => frames.has(m.id)).sort((a, b) => a.level - b.level || a.id.localeCompare(b.id)).map((m) => m.id);
  const refs = new Map<string, ModuleRefs>();
  for (const m of modules) refs.set(m, moduleRefs(index, look, tags, frames.get(m)!));
  const spec: Pick<CustomViewSpec, 'cuts' | 'box'> = {
    cuts: [{ id: 'floor', frame: 'module', axis: 'horizontal', ref: { kind: 'level', ref: 'floor-top' }, offset: height, keep: 'negative' }],
  };
  return { byNode: resolveCuts({ index, look, frames, refs, modules }, spec, meshIds).byNode, refs };
}
