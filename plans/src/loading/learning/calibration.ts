// Calage automatique : à chaque liste validée, chaque ligne donne un point « prédit / final ». Une règle « à
// confirmer » qui tombe juste sur les 2 derniers chantiers → l'app propose de la passer « confirmée » (Amaury
// clique) ; jamais en silence. Les corrections « seulement ce chantier » (jugements) ne comptent pas. Fonctions pures.
import type { LoadingRule } from '../core/types';

export interface ObservationRow {
  id: string;
  listId: string | null;
  article: string;
  ruleKeys: string[] | null;
  predicted: number | null;
  final: number | null;
  kind: string;
  note?: string | null;
  createdAt: string;
}

export interface PromotionProposal {
  rule: LoadingRule;
  hits: ObservationRow[];
}

export function promotionProposals(rules: readonly LoadingRule[], observations: readonly ObservationRow[], needed = 2): PromotionProposal[] {
  const out: PromotionProposal[] = [];
  for (const r of rules) {
    if (!r.active || r.confidence !== 'a_confirmer' || r.qty === null) continue;
    const mine = observations
      .filter((o) => o.kind === 'calage' && (o.ruleKeys ?? []).includes(r.key))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    // un point par liste (la plus récente)
    const perList: ObservationRow[] = [];
    for (const o of mine) if (!perList.some((x) => x.listId === o.listId)) perList.push(o);
    const last = perList.slice(0, needed);
    if (last.length === needed && last.every((o) => o.predicted !== null && o.predicted === o.final)) out.push({ rule: r, hits: last });
  }
  return out;
}

/** Questions en attente (« je ne sais pas encore ») : observations « inconnu » avec une quantité finale (les lignes restées
 *  indéterminées à la validation n'en sont pas), plus récentes que la dernière modification des règles de l'article. */
export function pendingQuestions(observations: readonly ObservationRow[], ruleUpdated: ReadonlyMap<string, string>): Map<string, ObservationRow[]> {
  const out = new Map<string, ObservationRow[]>();
  for (const o of observations) {
    if (o.kind !== 'inconnu' || o.final === null) continue;
    const changed = ruleUpdated.get(o.article);
    if (changed && changed > o.createdAt) continue;
    out.set(o.article, [...(out.get(o.article) ?? []), o]);
  }
  return out;
}
