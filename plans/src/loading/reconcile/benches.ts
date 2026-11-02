// Bancs d'étalonnage ajoutés dans l'app (table loading_benches) : une loading liste rapprochée de sa liste réelle
// devient un chantier de référence, rejoué comme les bancs de base (impact d'une nouvelle règle, page des bancs).
// Fonctions pures.
import type { Bench } from '../benches';
import type { SiteAnswers, StudyInput } from '../core/answers';
import type { CatalogueItem, LoadingRule, SeedObservation } from '../core/types';
import type { Comparison, RealLine } from '../engine/compare';
import { compareLists } from '../engine/compare';
import type { LoadingList } from '../engine/generate';
import { generate } from '../engine/generate';
import type { Topology } from '../topology/types';
import type { ColumnMap } from './parseRealList';

/** Ligne de la table loading_benches (le JSON `answers` porte aussi l'en-tête du banc). */
export interface BenchRow {
  id: string;
  name: string;
  projectId: string | null;
  modelVersionId: string | null;
  topology: unknown;
  answers: unknown;
  realLines: unknown;
  judgements: unknown;
  columnMap: unknown;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Contenu de `answers` d'un banc enregistré dans l'app. */
export interface BenchAnswers {
  site: SiteAnswers;
  study: StudyInput | null;
  known: Record<string, string>;
  order: string;
  bordereau: string;
  source: string;
  partial: boolean;
  model: string;
  /** liste d'origine (loading_lists.id) */
  listId?: string;
}

export interface AppBench extends Bench {
  /** banc de la table (supprimable) ou de base (dans le code) */
  origin: 'seed' | 'app';
  rowId?: string;
  columnMap?: ColumnMap | null;
  createdAt?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Ligne de la table → banc (null si elle est abîmée : pas de topologie ou pas de liste réelle). */
export function benchFromRow(row: BenchRow): AppBench | null {
  const t = row.topology as Topology | null;
  if (!isObj(t) || !isObj(t.counts) || !Array.isArray(t.islands)) return null;
  if (!Array.isArray(row.realLines)) return null;
  const a = (isObj(row.answers) ? row.answers : {}) as Partial<BenchAnswers>;
  const real: RealLine[] = (row.realLines as unknown[])
    .filter((r): r is RealLine => isObj(r) && typeof r.article === 'string' && typeof r.qty === 'number' && Number.isFinite(r.qty))
    .map((r) => ({ article: r.article, qty: r.qty }));
  const judgements = isObj(row.judgements) ? Object.fromEntries(Object.entries(row.judgements).filter(([, v]) => typeof v === 'number')) as Record<string, number> : {};
  return {
    id: `db:${row.id}`,
    rowId: row.id,
    origin: 'app',
    name: row.name,
    order: a.order ?? '',
    bordereau: a.bordereau ?? '',
    model: a.model ?? '',
    partial: !!a.partial,
    source: a.source ?? '',
    productAnswers: {},
    answers: isObj(a.site) ? (a.site as SiteAnswers) : {},
    study: (isObj(a.study) ? a.study : { plates: [], source: '' }) as StudyInput,
    judgements,
    known: isObj(a.known) ? (a.known as Record<string, string>) : {},
    real,
    topology: t,
    columnMap: (row.columnMap as ColumnMap | null) ?? null,
    createdAt: row.createdAt,
  };
}

export interface BenchReplay {
  bench: AppBench | Bench;
  list: LoadingList;
  comparison: Comparison;
}

/** Banc rejoué avec les règles du moment. */
export function replayBench(b: Bench, rules: readonly LoadingRule[], catalogue: ReadonlyMap<string, CatalogueItem>, observations?: readonly SeedObservation[]): BenchReplay {
  const study = b.study && b.study.plates?.length ? b.study : b.study?.source ? b.study : null;
  const list = generate({ topology: b.topology, rules, catalogue, answers: b.answers, study, observations, judgements: b.judgements });
  return { bench: b, list, comparison: compareLists(list, b.real, { partial: b.partial, known: b.known }) };
}
