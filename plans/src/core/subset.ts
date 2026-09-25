// Sous-ensembles du modèle (fonctions pures sur l'index de scène) : une Viewbox avec ses accessoires, un niveau,
// les éléments communs, tout le modèle ; et résolution d'un sous-ensemble en liste d'objets maillés visibles.
import type { NodeInfo, SceneIndex } from './types';

export interface SceneLookup {
  byId: Map<string, NodeInfo>;
  /** catégorie effective (le nœud, sinon son plus proche parent classé) */
  categoryOf(id: string): string | null;
  /** accessoire porteur (plus proche nœud « item » en remontant), sinon le nœud lui-même */
  itemOf(id: string): string;
  /** vrai si le nœud ou l'un de ses parents est dans `set` */
  inSet(id: string, set: ReadonlySet<string>): boolean;
}

export function makeLookup(index: SceneIndex): SceneLookup {
  const byId = new Map(index.nodes.map((n) => [n.id, n]));
  const catCache = new Map<string, string | null>();
  const itemCache = new Map<string, string>();
  const categoryOf = (id: string): string | null => {
    if (catCache.has(id)) return catCache.get(id)!;
    const n = byId.get(id);
    const c = !n ? null : n.category ?? (n.parentId ? categoryOf(n.parentId) : null);
    catCache.set(id, c);
    return c;
  };
  const itemOf = (id: string): string => {
    const hit = itemCache.get(id);
    if (hit) return hit;
    let res = id;
    for (let c: NodeInfo | undefined = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined) {
      if (c.role === 'item') {
        res = c.id;
        break;
      }
      if (c.role === 'module') break;
    }
    itemCache.set(id, res);
    return res;
  };
  const inSet = (id: string, set: ReadonlySet<string>): boolean => {
    for (let c: NodeInfo | undefined = byId.get(id); c; c = c.parentId ? byId.get(c.parentId) : undefined) if (set.has(c.id)) return true;
    return false;
  };
  return { byId, categoryOf, itemOf, inSet };
}

/** Une Viewbox : son nœud + les accessoires rattachés (hiérarchie ou position). */
export function subsetForModule(index: SceneIndex, moduleId: string): string[] {
  const m = index.modules.find((x) => x.id === moduleId);
  return m ? [m.nodeId, ...m.itemIds] : [];
}

export function subsetForModules(index: SceneIndex, moduleIds: string[]): string[] {
  return [...new Set(moduleIds.flatMap((id) => subsetForModule(index, id)))];
}

export function commonIdsAtLevel(index: SceneIndex, level: number | null): string[] {
  return index.commonIds.filter((id) => {
    if (level === null) return true;
    const n = index.nodes.find((x) => x.id === id);
    return n?.level === level;
  });
}

/** Un niveau : ses Viewbox, leurs accessoires, et les éléments communs de ce niveau. */
export function subsetForLevel(index: SceneIndex, level: number): string[] {
  const mods = index.modules.filter((m) => m.level === level).map((m) => m.id);
  return [...subsetForModules(index, mods), ...commonIdsAtLevel(index, level)];
}

/** Tout le modèle (hors contexte). */
export function subsetAll(index: SceneIndex): string[] {
  return [...subsetForModules(index, index.modules.map((m) => m.id)), ...index.commonIds];
}

/** Objets maillés à projeter / afficher : dans le sous-ensemble, hors contexte, hors catégories masquées. */
export function resolveMeshes(
  index: SceneIndex,
  look: SceneLookup,
  include: string[],
  hideCategories: string[] = [],
  onlyCategories: string[] = [],
): string[] {
  const set = new Set(include);
  const hidden = new Set(hideCategories);
  const only = new Set(onlyCategories);
  const out: string[] = [];
  for (const n of index.nodes) {
    if (n.kind !== 'mesh' || n.role === 'context' || n.triangles === 0) continue;
    if (!look.inSet(n.id, set)) continue;
    if (hidden.size || only.size) {
      const c = look.categoryOf(n.id);
      if (c && hidden.has(c)) continue;
      if (only.size && (!c || !only.has(c))) continue;
    }
    out.push(n.id);
  }
  return out;
}

/** Catégories présentes dans un sous-ensemble (pour « Masquer la catégorie… » et la légende). */
export function categoriesIn(index: SceneIndex, look: SceneLookup, include: string[]): string[] {
  const set = new Set<string>();
  for (const id of resolveMeshes(index, look, include)) {
    const c = look.categoryOf(id);
    if (c) set.add(c);
  }
  return [...set].sort();
}
