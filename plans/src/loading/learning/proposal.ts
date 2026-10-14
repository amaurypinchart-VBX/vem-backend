// D'une correction à une règle proposée : la base choisie (inferBase), où elle s'applique (toujours, box seules,
// box connectées…), sa confiance ; puis les règles du même article qui la contredisent (même article, conditions
// qui se chevauchent) et le choix proposé : remplacer, ajouter une condition, garder les deux. Fonctions pures.
import type { Confidence, LoadingRule, RuleConditions, RuleKind, RuleSource, Unit } from '../core/types';
import { overlaps, ruleKey } from '../library/importClasseur';
import type { BaseCandidate } from './inferBase';

export type Scope = 'toujours' | 'standalone' | 'connecte';

export interface ProposalInput {
  article: string;
  articleName?: string;
  candidate: BaseCandidate;
  scope: Scope;
  confidence: Confidence;
  unit?: Unit;
  kind?: RuleKind;
  source?: RuleSource;
  remark?: string;
  /** chantier d'origine : point de calage de la nouvelle règle */
  chantier?: string;
}

export function proposeRule(p: ProposalInput, existing: readonly LoadingRule[]): LoadingRule {
  const when: RuleConditions = p.scope === 'toujours' ? {} : { regime: p.scope };
  const r: LoadingRule = {
    key: '',
    kind: p.kind ?? 'accessoire',
    trigger: p.candidate.trigger ? { articles: [p.candidate.trigger] } : {},
    article: p.article,
    articleName: p.articleName,
    qty: p.candidate.qty,
    per: p.candidate.per,
    unit: p.unit ?? 'pce',
    when: Object.keys(when).length ? when : undefined,
    spare: p.candidate.spare,
    confidence: p.confidence,
    calibration: p.chantier ? [{ chantier: p.chantier, base: p.candidate.base, predit: p.candidate.result, livre: p.candidate.result, note: 'règle apprise sur ce chantier' }] : [],
    remark: p.remark,
    version: 1,
    active: true,
    source: p.source ?? 'correction',
  };
  const key = ruleKey(r);
  const taken = new Set(existing.map((x) => x.key));
  r.key = key;
  for (let n = 2; taken.has(r.key) && existing.find((x) => x.key === r.key)?.active; n++) r.key = `${key}#${n}`;
  return r;
}

export interface Conflict {
  rule: LoadingRule;
  /** même base et mêmes conditions : la nouvelle règle la remplace naturellement */
  sameScope: boolean;
}

/** Règles actives du même article dont les conditions chevauchent celles de la proposition. */
export function conflictsFor(r: LoadingRule, rules: readonly LoadingRule[]): Conflict[] {
  return rules
    .filter((x) => x.active && x.key !== r.key && x.article === r.article && x.kind !== 'appreciation' && overlaps(x, r))
    .map((x) => ({ rule: x, sameScope: x.per === r.per && JSON.stringify(x.when ?? {}) === JSON.stringify(r.when ?? {}) }));
}

export type ConflictChoice = 'remplacer' | 'condition' | 'garder';

/** Règles à enregistrer selon le choix : la nouvelle, + les anciennes désactivées (remplacer) ou regroupées (garder). */
export function resolveConflicts(r: LoadingRule, conflicts: readonly Conflict[], choice: ConflictChoice, condition?: RuleConditions): LoadingRule[] {
  if (!conflicts.length) return [r];
  if (choice === 'remplacer') return [r, ...conflicts.map((c) => ({ ...c.rule, active: false, supersededBy: r.key }))];
  if (choice === 'garder') {
    const group = r.group ?? `additionne:${r.article}`;
    return [{ ...r, group }, ...conflicts.map((c) => ({ ...c.rule, group }))];
  }
  const w = { ...(r.when ?? {}), ...(condition ?? {}) };
  const nr = { ...r, when: Object.keys(w).length ? w : undefined };
  return [{ ...nr, key: ruleKey(nr) }];
}
