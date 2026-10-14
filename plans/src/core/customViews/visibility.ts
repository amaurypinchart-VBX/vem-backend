// Règles de visibilité d'une vue spéciale → état de chaque nœud (visible / masqué / fantôme). Pure, déterministe.
// Les règles s'appliquent dans l'ordre et la dernière qui touche un nœud gagne ; un nœud prend l'état explicite le
// plus proche en remontant (masquer un nœud masque son sous-arbre, « montrer » un descendant le rend visible).
import type { SceneIndex } from '../types';
import type { SceneLookup } from '../subset';
import { subsetForModules } from '../subset';
import type { PathIndex } from './paths';
import type { TagResolver } from './tags';
import type { CustomViewSpec, CustomViewWarning, ViewMatch, VisibilityRule } from './types';

export type NodeState = 'visible' | 'hidden' | 'ghost';

export interface VisibilityContext {
  index: SceneIndex;
  look: SceneLookup;
  paths: PathIndex;
  tags: TagResolver;
}

export interface VisibilityResult {
  /** état effectif de chaque nœud (tous les nœuds de l'index) */
  states: Map<string, NodeState>;
  /** nombre de pièces touchées par chaque règle (nœuds touchés au plus haut niveau) */
  counts: Map<string, number>;
  warnings: CustomViewWarning[];
}

/** Viewbox de la vue (scope.modules, filtrées par niveaux). */
export function scopeModules(index: SceneIndex, scope: CustomViewSpec['scope']): string[] {
  const wanted = scope.modules === 'all' ? null : new Set(scope.modules);
  const levels = scope.levels?.length ? new Set(scope.levels) : null;
  return index.modules.filter((m) => (!wanted || wanted.has(m.id)) && (!levels || levels.has(m.level))).map((m) => m.id);
}

/** Nœuds racines du périmètre de la vue : Viewbox + accessoires rattachés, éléments communs. */
export function scopeRoots(index: SceneIndex, scope: CustomViewSpec['scope']): string[] {
  const roots = subsetForModules(index, scopeModules(index, scope));
  if (scope.common) {
    const levels = scope.levels?.length ? new Set(scope.levels) : null;
    const byId = new Map(index.nodes.map((n) => [n.id, n]));
    for (const id of index.commonIds) {
      const n = byId.get(id);
      if (!levels || n?.level == null || levels.has(n.level)) roots.push(id);
    }
  }
  return roots;
}

/** Le nœud satisfait-il le critère (champs en ET, valeurs en OU) ? */
export function matchesNode(ctx: VisibilityContext, id: string, m: ViewMatch): boolean {
  const n = ctx.look.byId.get(id);
  if (!n) return false;
  if (m.nodeIds && !m.nodeIds.includes(id)) return false;
  if (m.modulePaths) {
    const p = ctx.paths.pathOf(id);
    if (!p || !m.modulePaths.includes(p)) return false;
  }
  if (m.definitions && !(n.definition && m.definitions.includes(n.definition))) return false;
  if (m.viewTags) {
    const t = ctx.tags.ownTag(id);
    if (!t || !m.viewTags.includes(t.tag)) return false;
  }
  if (m.categories) {
    const c = ctx.look.categoryOf(id);
    if (!c || !m.categories.includes(c)) return false;
  }
  if (m.moduleIds && !(n.moduleId && m.moduleIds.includes(n.moduleId))) return false;
  if (m.articleRefs && !(n.articleRef && m.articleRefs.includes(n.articleRef))) return false;
  if (m.common !== undefined && (n.assignment === 'common') !== m.common) return false;
  return true;
}

/** Nœuds touchés par une règle, au plus haut niveau (un descendant d'un nœud touché n'est pas compté deux fois). */
export function ruleTargets(ctx: VisibilityContext, rule: VisibilityRule, candidates?: ReadonlySet<string>): string[] {
  const hit = new Set<string>();
  for (const n of ctx.index.nodes) {
    if (n.role === 'context') continue;
    if (candidates && !candidates.has(n.id)) continue;
    if (matchesNode(ctx, n.id, rule.match)) hit.add(n.id);
  }
  const out: string[] = [];
  for (const id of hit) {
    let covered = false;
    for (let p = ctx.look.byId.get(id)?.parentId; p; p = ctx.look.byId.get(p)?.parentId) {
      if (hit.has(p)) {
        covered = true;
        break;
      }
    }
    if (!covered) out.push(id);
  }
  return out;
}

export function resolveVisibility(ctx: VisibilityContext, spec: Pick<CustomViewSpec, 'scope' | 'visibility'>): VisibilityResult {
  const { index, look } = ctx;
  const roots = new Set(scopeRoots(index, spec.scope));
  // nœuds du périmètre (racines et descendants)
  const inScope = new Set<string>();
  for (const n of index.nodes) if (n.role !== 'context' && look.inSet(n.id, roots)) inScope.add(n.id);
  const explicit = new Map<string, NodeState>();
  const counts = new Map<string, number>();
  const warnings: CustomViewWarning[] = [];
  const childrenOf = new Map<string, string[]>();
  for (const n of index.nodes) {
    if (!n.parentId) continue;
    const l = childrenOf.get(n.parentId) ?? [];
    l.push(n.id);
    childrenOf.set(n.parentId, l);
  }
  const subtree = (id: string, out: Set<string>) => {
    out.add(id);
    for (const c of childrenOf.get(id) ?? []) subtree(c, out);
  };

  for (const rule of spec.visibility) {
    const targets = ruleTargets(ctx, rule, inScope);
    counts.set(rule.id, targets.length);
    if (!targets.length) {
      warnings.push({ code: 'RULE_NO_EFFECT', message: `Règle sans effet : « ${rule.label} » (aucune pièce trouvée)`, ruleId: rule.id });
      continue;
    }
    if (rule.op === 'isolate') {
      // garder seulement les cibles : leurs sous-arbres visibles, leurs ancêtres = conteneurs, tout le reste masqué
      const keep = new Set<string>();
      const targetSet = new Set(targets);
      for (const t of targets) subtree(t, keep);
      const ancestors = new Set<string>();
      for (const t of targets) for (let p = look.byId.get(t)?.parentId; p; p = look.byId.get(p)?.parentId) ancestors.add(p);
      for (const id of inScope) {
        if (keep.has(id)) {
          if (targetSet.has(id)) explicit.set(id, 'visible');
        } else if (ancestors.has(id)) explicit.set(id, 'visible');
        else explicit.set(id, 'hidden');
      }
      continue;
    }
    const state: NodeState = rule.op === 'hide' ? 'hidden' : rule.op === 'ghost' ? 'ghost' : 'visible';
    for (const t of targets) {
      explicit.set(t, state);
      // « la dernière règle qui touche un nœud gagne » : une règle sur un parent remplace celles de ses descendants
      const sub = new Set<string>();
      subtree(t, sub);
      for (const s of sub) if (s !== t) explicit.delete(s);
    }
  }

  const states = new Map<string, NodeState>();
  const resolve = (id: string, parentState: NodeState, parentInScope: boolean) => {
    const here = inScope.has(id);
    // une racine du périmètre sous un nœud hors périmètre (accessoire rattaché par position, élément commun) repart de « visible »
    const inherited = here && !parentInScope ? 'visible' : parentState;
    const s: NodeState = here ? explicit.get(id) ?? inherited : 'hidden';
    states.set(id, s);
    for (const c of childrenOf.get(id) ?? []) resolve(c, s, here);
  };
  for (const n of index.nodes) if (!n.parentId) resolve(n.id, 'hidden', false);
  return { states, counts, warnings };
}

/** Nœuds maillés (à projeter) par état. */
export function meshesByState(index: SceneIndex, states: ReadonlyMap<string, NodeState>): { visible: string[]; ghost: string[] } {
  const visible: string[] = [];
  const ghost: string[] = [];
  for (const n of index.nodes) {
    if (n.kind !== 'mesh' || n.role === 'context' || n.triangles === 0) continue;
    const s = states.get(n.id);
    if (s === 'visible') visible.push(n.id);
    else if (s === 'ghost') ghost.push(n.id);
  }
  return { visible, ghost };
}
