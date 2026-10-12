// Base de règles effective = base de départ (seed.ts, générée du classeur) + règles enregistrées en base
// (table loading_rules). Une règle enregistrée de même clé remplace celle de la base de départ, jamais l'inverse :
// une validation dans l'app n'est jamais écrasée par un nouvel import du classeur. Même mécanique pour le catalogue
// (table loading_catalogue_items) et la mémoire des produits (loading_product_matches). Fonctions pures.
import { stableId } from '../../core/hash';
import type { CatalogueItem, LoadingRule } from '../core/types';

/** Ligne de la table loading_rules telle que renvoyée par GET /loading/rules. */
export interface ServerRuleRow {
  id: string;
  key: string;
  data: LoadingRule;
  active: boolean;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface ServerCatalogueRow {
  ref: string;
  designation: string;
  data: Partial<CatalogueItem>;
  createdBy: string | null;
  createdAt: string;
}

export interface EffectiveRule extends LoadingRule {
  /** seed = base de départ ; override = base de départ modifiée dans l'app ; user = ajoutée dans l'app */
  origin2: 'seed' | 'override' | 'user';
  rowId?: string;
  updatedAt?: string;
}

export function mergeRules(seed: readonly LoadingRule[], rows: readonly ServerRuleRow[]): EffectiveRule[] {
  const seedKeys = new Set(seed.map((r) => r.key));
  const out = new Map<string, EffectiveRule>(seed.map((r) => [r.key, { ...r, origin2: 'seed' as const }]));
  for (const row of rows) {
    out.set(row.key, {
      ...row.data,
      key: row.key,
      active: row.active,
      version: row.version,
      origin2: seedKeys.has(row.key) ? 'override' : 'user',
      rowId: row.id,
      updatedAt: row.updatedAt,
    });
  }
  return [...out.values()];
}

export function mergeCatalogue(seed: readonly CatalogueItem[], rows: readonly ServerCatalogueRow[]): CatalogueItem[] {
  const out = new Map(seed.map((c) => [c.ref, c]));
  for (const r of rows) out.set(r.ref, { ...(out.get(r.ref) ?? {}), ...r.data, ref: r.ref, designation: r.designation, source: out.has(r.ref) ? (out.get(r.ref)!.source) : 'ajout' } as CatalogueItem);
  return [...out.values()];
}

/** Forme canonique d'une valeur JSON (clés triées) : même règle ⇒ même texte. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v as object)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/** Ce qui change le calcul d'une règle (pas les remarques, l'historique ni les points de calage). */
function computedPart(r: LoadingRule) {
  const { key, kind, trigger, article, qty, per, unit, tranche, when, spare, replaces, confidence } = r;
  return { key, kind, trigger, article, qty, per, unit, tranche, when, spare, replaces, confidence };
}

/** Version de la base de règles = empreinte des règles actives ; chaque liste garde la version qui l'a générée. */
export function rulesVersion(rules: readonly LoadingRule[]): string {
  const active = rules.filter((r) => r.active).map(computedPart).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return stableId(canonical(active));
}
