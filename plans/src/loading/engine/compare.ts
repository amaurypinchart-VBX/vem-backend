// Comparaison ligne à ligne d'une loading liste générée avec une liste réelle (bordereau livré) : bancs
// d'étalonnage. ✔ identique · ↑ un peu plus (accepté : « toujours un peu plus que trouvé ») · ↓ moins · ➕ seulement
// dans le réel · ➖ seulement dans la prédiction. Une liste réelle partielle (reconstituée) ne compte que ses lignes.
// Fonctions pures.
import type { LoadingList } from './generate';

export interface RealLine {
  article: string;
  qty: number;
  note?: string;
}

export type GapKind = 'identique' | 'plus' | 'moins' | 'reel_seul' | 'prediction_seule';

export interface Gap {
  article: string;
  kind: GapKind;
  predicted: number | null;
  real: number | null;
  status?: string;
  /** écart connu (non résolu, jamais forcé) */
  known?: string;
}

export interface Comparison {
  gaps: Gap[];
  identical: number;
  /** lignes de la liste réelle */
  total: number;
  /** « 37 / 39 lignes reproduites » */
  score: string;
}

export function compareLists(list: LoadingList, real: readonly RealLine[], opts: { partial?: boolean; known?: Readonly<Record<string, string>> } = {}): Comparison {
  const known = opts.known ?? {};
  const pred = new Map(list.lines.filter((l) => l.qty !== 0).map((l) => [l.article, l]));
  const gaps: Gap[] = [];
  for (const r of real) {
    const p = pred.get(r.article);
    const q = p?.qty ?? null;
    const kind: GapKind = q === null ? 'reel_seul' : q === r.qty ? 'identique' : q > r.qty ? 'plus' : 'moins';
    gaps.push({ article: r.article, kind, predicted: q, real: r.qty, status: p?.status, known: known[r.article] });
  }
  if (!opts.partial)
    for (const [article, l] of pred)
      if (!real.some((r) => r.article === article) && l.qty !== null)
        gaps.push({ article, kind: 'prediction_seule', predicted: l.qty, real: null, status: l.status, known: known[article] });
  const identical = gaps.filter((g) => g.kind === 'identique').length;
  return { gaps, identical, total: real.length, score: `${identical} / ${real.length} lignes reproduites` };
}
