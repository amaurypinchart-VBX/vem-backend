// Éléments masqués des vues d'un jeu de plans : une vue, ou toutes les vues standard du jeu d'un coup (« masquer les
// cadres textile partout »). Les vues de détail des cadres et les vues spéciales ne sont jamais touchées. Pur.
import type { LineworkSubset, SubsetHideRule } from '../linework/types';
import type { DrawingSet, ViewportItem } from './types';

/** Ce qu'on masque : une catégorie du modèle, ou un élément (étiquette, pièce, type…). */
export type HideTarget = { kind: 'category'; key: string } | { kind: 'rule'; rule: SubsetHideRule };

const sameMatch = (a: SubsetHideRule, b: SubsetHideRule) => a.id === b.id || JSON.stringify(a.match) === JSON.stringify(b.match);

/** Vues standard du jeu (sans les vues spéciales ni les vues de détail des cadres textile). */
export function standardViewports(doc: Pick<DrawingSet, 'sheets'>): ViewportItem[] {
  return doc.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport' && !i.custom && !i.frameView));
}

export function isHidden(vp: ViewportItem, t: HideTarget): boolean {
  if (t.kind === 'category') return !!vp.request.subset.hideCategories?.includes(t.key);
  return !!vp.request.subset.hide?.some((r) => sameMatch(r, t.rule));
}

/** Sous-ensemble avec / sans la cible. */
export function withHidden(subset: LineworkSubset, t: HideTarget, on: boolean): LineworkSubset {
  if (t.kind === 'category') {
    const cur = subset.hideCategories ?? [];
    const next = on ? (cur.includes(t.key) ? cur : [...cur, t.key]) : cur.filter((c) => c !== t.key);
    const out: LineworkSubset = { ...subset, hideCategories: next };
    if (!next.length) delete out.hideCategories;
    return out;
  }
  const cur = subset.hide ?? [];
  const next = on ? [...cur.filter((r) => !sameMatch(r, t.rule)), t.rule] : cur.filter((r) => !sameMatch(r, t.rule));
  const out: LineworkSubset = { ...subset, hide: next };
  if (!next.length) delete out.hide;
  return out;
}

/**
 * Masque (ou montre) la cible dans des vues du jeu (brouillon de l'éditeur) : la vue garde son échelle et son cadrage,
 * seul son calcul est refait. Renvoie le nombre de vues changées.
 */
export function setHidden(doc: Pick<DrawingSet, 'sheets'>, t: HideTarget, on: boolean, only?: ReadonlySet<string>): number {
  let n = 0;
  for (const vp of standardViewports(doc)) {
    if (only && !only.has(vp.id)) continue;
    if (isHidden(vp, t) === on) continue;
    // plan d'implantation (pieds seuls) : rien à masquer
    if (vp.request.subset.onlyCategories?.length) continue;
    vp.request = { ...vp.request, subset: withHidden(vp.request.subset, t, on) };
    delete vp.lineworkKey;
    n++;
  }
  return n;
}

/** Nombre de vues standard du jeu où la cible est masquée, sur le total (hors plan d'implantation). */
export function hiddenCount(doc: Pick<DrawingSet, 'sheets'>, t: HideTarget): { hidden: number; total: number } {
  const vps = standardViewports(doc).filter((vp) => !vp.request.subset.onlyCategories?.length);
  return { hidden: vps.filter((vp) => isHidden(vp, t)).length, total: vps.length };
}
