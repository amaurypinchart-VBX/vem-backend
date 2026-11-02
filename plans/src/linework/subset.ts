// Sous-ensemble d'une vue de planche → maillages à dessiner : catégories masquées / gardées (comme avant), puis les
// éléments masqués en plus (`subset.hide` : étiquettes de vue, pièce, même pièce dans toutes les Viewbox, type).
// Le contexte (chemins dans les Viewbox, étiquettes de vue avec celles mémorisées dans les réglages) est construit une
// fois par modèle ; les étiquettes mémorisées sont données par la page des planches (`setSubsetViewTags`).
import type { SceneIndex } from '../core/types';
import type { SceneLookup } from '../core/subset';
import { resolveMeshes } from '../core/subset';
import type { ModuleFrame } from '../core/views';
import type { PathIndex } from '../core/customViews/paths';
import { makePathIndex } from '../core/customViews/paths';
import type { TagResolver } from '../core/customViews/tags';
import { TEXTILE_TAG, makeTagResolver } from '../core/customViews/tags';
import type { ViewTagRule } from '../core/customViews/types';
import type { VisibilityContext } from '../core/customViews/visibility';
import { applyHideRules, hiddenByRules, subsetNodes } from '../core/subsetHide';
import type { LineworkSubset } from './types';

/** Ce qu'il faut d'un modèle chargé (LoadedScene) pour résoudre un sous-ensemble. */
export interface SubsetScene {
  index: SceneIndex;
  look: SceneLookup;
  frames: ReadonlyMap<string, ModuleFrame>;
}

export interface SubsetEnv {
  paths: PathIndex;
  tags: TagResolver;
  ctx: VisibilityContext;
  /** empreinte des étiquettes mémorisées (clé des vues qui masquent par étiquette) */
  tagsKey: string;
}

interface Slot {
  viewTags: ViewTagRule[];
  tagsKey: string;
  env?: SubsetEnv;
  paths?: PathIndex;
}

const slots = new WeakMap<SceneIndex, Slot>();

function slotOf(index: SceneIndex): Slot {
  let s = slots.get(index);
  if (!s) slots.set(index, (s = { viewTags: [], tagsKey: '[]' }));
  return s;
}

/** Étiquettes mémorisées (app_settings › plans.viewTags) à utiliser pour ce modèle. */
export function setSubsetViewTags(index: SceneIndex, viewTags: ViewTagRule[]): void {
  const s = slotOf(index);
  const key = JSON.stringify(viewTags);
  if (key === s.tagsKey) return;
  s.viewTags = viewTags;
  s.tagsKey = key;
  s.env = undefined;
}

export function subsetEnv(scene: SubsetScene): SubsetEnv {
  const s = slotOf(scene.index);
  if (!s.env) {
    const paths = s.paths ?? (s.paths = makePathIndex(scene.index));
    const tags = makeTagResolver(scene.index, s.viewTags);
    s.env = { paths, tags, ctx: { index: scene.index, look: scene.look, paths, tags }, tagsKey: s.tagsKey };
  }
  return s.env;
}

/** Maillages à dessiner pour un sous-ensemble (catégories puis éléments masqués). */
export function subsetMeshes(scene: SubsetScene, subset: LineworkSubset): string[] {
  const base = resolveMeshes(scene.index, scene.look, subset.include, subset.hideCategories, subset.onlyCategories);
  if (!subset.hide?.length) return base;
  const { hidden } = hiddenByRules(subsetEnv(scene).ctx, subset.include, subset.hide);
  return applyHideRules(scene.look, base, hidden);
}

/** Nombre de pièces touchées par chaque élément masqué (pastilles « ⚠ 0 »). */
export function hideRuleCounts(scene: SubsetScene, subset: LineworkSubset): Map<string, number> {
  if (!subset.hide?.length) return new Map();
  return hiddenByRules(subsetEnv(scene).ctx, subset.include, subset.hide).counts;
}

/** Nœuds du sous-ensemble (pour compter les étiquettes présentes). */
export function subsetScope(scene: SubsetScene, include: string[]): Set<string> {
  return subsetNodes(scene.index, scene.look, include);
}

/** Cadre textile (le plus haut nœud étiqueté « cadre-textile ») qui contient ce nœud, sinon null. */
export function textileFrameOf(scene: SubsetScene, nodeId: string): string | null {
  const { tags } = subsetEnv(scene);
  let found: string | null = null;
  for (let c: string | null | undefined = nodeId; c; c = scene.look.byId.get(c)?.parentId) {
    const n = scene.look.byId.get(c);
    if (!n || n.role === 'module' || n.role === 'context') break;
    if (tags.ownTag(c)?.tag === TEXTILE_TAG) found = c;
  }
  return found;
}
