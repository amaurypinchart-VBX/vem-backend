// Impact d'un changement de règles : le moteur est rejoué, avant / après, sur les bancs d'étalonnage et sur les
// listes déjà validées (leur topologie et leurs réponses sont gardées) → « aurait changé 3 projets : Klokgebouw
// 16 → 20 ». Les listes passées ne sont jamais modifiées. Fonctions pures.
import type { SiteAnswers, StudyInput } from '../core/answers';
import type { CatalogueItem, LoadingRule, SeedObservation } from '../core/types';
import { generate } from '../engine/generate';
import type { RealLine } from '../engine/compare';
import { compareLists } from '../engine/compare';
import type { Topology } from '../topology/types';

export interface ImpactCase {
  id: string;
  name: string;
  kind: 'banc' | 'liste';
  topology: Topology;
  answers: SiteAnswers;
  study: StudyInput | null;
  judgements?: Record<string, number>;
  /** liste réelle (banc) ou finale (liste validée) : pour le score avant / après */
  real?: RealLine[];
  partial?: boolean;
}

export interface ImpactChange {
  article: string;
  before: number | null;
  after: number | null;
}

export interface ImpactResult {
  case: Pick<ImpactCase, 'id' | 'name' | 'kind'>;
  changes: ImpactChange[];
  /** « 39 / 39 » avant → « 37 / 39 » après (bancs et listes validées) */
  scoreBefore?: string;
  scoreAfter?: string;
  worse: boolean;
}

export function impactOf(
  cases: readonly ImpactCase[],
  before: readonly LoadingRule[],
  after: readonly LoadingRule[],
  catalogue: ReadonlyMap<string, CatalogueItem>,
  observations?: readonly SeedObservation[],
  articles?: readonly string[],
): ImpactResult[] {
  return cases.map((c) => {
    const run = (rules: readonly LoadingRule[]) => generate({ topology: c.topology, rules, catalogue, answers: c.answers, study: c.study, observations, judgements: c.judgements });
    const a = run(before);
    const b = run(after);
    const qa = new Map(a.lines.map((l) => [l.article, l.qty]));
    const qb = new Map(b.lines.map((l) => [l.article, l.qty]));
    const all = new Set([...qa.keys(), ...qb.keys()]);
    const changes: ImpactChange[] = [];
    for (const art of all) {
      if (articles && !articles.includes(art)) continue;
      const x = qa.get(art) ?? null;
      const y = qb.get(art) ?? null;
      if (x !== y) changes.push({ article: art, before: x, after: y });
    }
    let scoreBefore: string | undefined;
    let scoreAfter: string | undefined;
    let worse = false;
    if (c.real) {
      const sa = compareLists(a, c.real, { partial: c.partial });
      const sb = compareLists(b, c.real, { partial: c.partial });
      scoreBefore = `${sa.identical} / ${sa.total}`;
      scoreAfter = `${sb.identical} / ${sb.total}`;
      worse = sb.identical < sa.identical;
    }
    return { case: { id: c.id, name: c.name, kind: c.kind }, changes: changes.sort((x, y) => (x.article < y.article ? -1 : 1)), scoreBefore, scoreAfter, worse };
  });
}

/** « aurait changé 2 projets : Klokgebouw 16 → 20 ; 6059 36 → 39 » (pour l'article choisi). */
export function impactSentence(results: readonly ImpactResult[], article: string): string {
  const hit = results.filter((r) => r.changes.some((c) => c.article === article));
  if (!hit.length) return 'Ne change aucun banc ni aucune liste validée.';
  const parts = hit.map((r) => {
    const c = r.changes.find((x) => x.article === article)!;
    return `${r.case.name} ${c.before ?? '—'} → ${c.after ?? '—'}`;
  });
  return `Aurait changé ${hit.length} ${hit.length > 1 ? 'chantiers' : 'chantier'} : ${parts.join(' ; ')}.`;
}
