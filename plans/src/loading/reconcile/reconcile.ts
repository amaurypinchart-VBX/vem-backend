// Rapprochement d'une loading liste avec la liste réelle (ce qui est vraiment parti) : ✔ identique · ↕ quantité
// différente (un peu plus / moins) · ➕ seulement dans le réel · ➖ seulement dans la liste. Chaque écart reçoit une
// proposition de classement (règle à revoir, seulement ce chantier, erreur du 3D, erreur du bordereau, je ne sais pas
// encore) avec sa raison ; c'est l'utilisateur qui tranche. Les choix deviennent des observations (prédit / réel) et,
// pour un banc, des jugements et des écarts connus. Fonctions pures.
import type { CatalogueItem, LoadingRule } from '../core/types';
import type { LoadingLine, LoadingList } from '../engine/generate';
import type { RealLine } from '../engine/compare';

export type ReconKind = 'identique' | 'plus' | 'moins' | 'a_determiner' | 'reel_seul' | 'prediction_seule';

/** Classement d'un écart, choisi par l'utilisateur. */
export type GapDecision = 'regle' | 'chantier' | 'erreur_3d' | 'erreur_bordereau' | 'inconnu';

export const RECON_ICON: Record<ReconKind, string> = {
  identique: '✔',
  plus: '↕',
  moins: '↕',
  a_determiner: '?',
  reel_seul: '➕',
  prediction_seule: '➖',
};

export const RECON_LABEL: Record<ReconKind, string> = {
  identique: 'identique',
  plus: 'un peu plus dans la liste',
  moins: 'moins dans la liste',
  a_determiner: 'quantité laissée à déterminer',
  reel_seul: 'seulement dans le réel',
  prediction_seule: 'seulement dans la liste',
};

export const DECISION_LABEL: Record<GapDecision, string> = {
  regle: 'Règle à revoir (pour tous les projets)',
  chantier: 'Seulement ce chantier',
  erreur_3d: 'Erreur du 3D',
  erreur_bordereau: 'Erreur du bordereau',
  inconnu: 'Je ne sais pas encore',
};

/** Genre d'observation enregistré pour chaque classement (table loading_observations). */
export const DECISION_KIND: Record<GapDecision, 'calage' | 'jugement' | 'erreur_3d' | 'erreur_bordereau' | 'inconnu'> = {
  regle: 'calage',
  chantier: 'jugement',
  erreur_3d: 'erreur_3d',
  erreur_bordereau: 'erreur_bordereau',
  inconnu: 'inconnu',
};

export interface ReconRow {
  article: string;
  designation: string;
  kind: ReconKind;
  /** quantité de la liste (corrections comprises) */
  listed: number | null;
  /** quantité calculée par les règles (sans les corrections « seulement ce chantier ») */
  computed: number | null;
  real: number | null;
  /** réel − liste */
  delta: number | null;
  status?: LoadingLine['status'];
  detail?: string;
  sources: string[];
  ruleKeys: string[];
  suggestion?: { decision: GapDecision; why: string };
  /** écart connu (banc d'étalonnage) */
  known?: string;
}

export interface Reconciliation {
  rows: ReconRow[];
  identical: number;
  /** lignes de la liste réelle */
  total: number;
  counts: Record<ReconKind, number>;
  /** « 30 / 54 lignes identiques » */
  score: string;
}

export interface ReconcileOptions {
  /** liste calculée sans les corrections (sinon = la liste) */
  computed?: LoadingList;
  catalogue?: ReadonlyMap<string, CatalogueItem>;
  rules?: readonly LoadingRule[];
  /** liste réelle partielle : les lignes absentes du réel ne sont pas des écarts */
  partial?: boolean;
  known?: Readonly<Record<string, string>>;
}

const ruleKeysOf = (l: LoadingLine | undefined) => [...new Set((l?.contributions ?? []).map((c) => c.ruleKey).filter((k): k is string => !!k))];

/** Proposition de classement d'un écart, avec sa raison (jamais appliquée sans clic). */
export function suggestDecision(row: Omit<ReconRow, 'suggestion'>, line: LoadingLine | undefined, opts: ReconcileOptions = {}): ReconRow['suggestion'] {
  if (row.kind === 'identique') return undefined;
  const item = opts.catalogue?.get(row.article);
  const fromProduct = !!line?.contributions.some((c) => c.kind === 'produit');
  const onlyProduct = !!line && line.contributions.every((c) => c.kind === 'produit');
  const rules = (opts.rules ?? []).filter((r) => r.active && r.article === row.article);
  if (line?.status === 'jugement' || (row.computed !== null && row.listed !== row.computed))
    return { decision: 'chantier', why: 'la quantité avait déjà été corrigée à la main pour ce chantier' };
  if (line?.status === 'appreciation' || row.kind === 'a_determiner')
    return { decision: 'chantier', why: 'quantité à l’appréciation : elle dépend du chantier' };
  if (onlyProduct) return { decision: 'erreur_3d', why: 'compté dans la 3D, pose par pose : vérifier le modèle (pièce manquante, en trop ou en double)' };
  if (row.kind === 'reel_seul') {
    if (item?.inclusDans) return { decision: 'erreur_bordereau', why: `compris dans ${item.inclusDans} : ne devrait pas sortir seul` };
    if (!rules.length && !item) return { decision: 'regle', why: 'référence inconnue du catalogue et sans règle : à ajouter' };
    if (!rules.length && (item?.categorie === 'structure' || item?.vitrage || item?.porte))
      return { decision: 'erreur_3d', why: 'produit de façade ou de structure : il n’est pas dessiné dans la 3D' };
    if (!rules.length) return { decision: 'regle', why: 'aucune règle ne fait sortir cette référence' };
    return { decision: 'regle', why: 'les règles existent mais leurs conditions ne sont pas remplies sur ce chantier' };
  }
  if (fromProduct) return { decision: 'erreur_3d', why: 'une partie de la quantité vient du comptage 3D' };
  if (line?.status === 'regle_manquante') return { decision: 'regle', why: 'règle manquante pour ce cas (box connectées, multi-niveaux…)' };
  if (row.kind === 'prediction_seule') return { decision: 'regle', why: 'une règle fait sortir cette référence et rien n’est parti : condition ou quantité à revoir' };
  if (line?.confidence === 'a_confirmer' || line?.confidence === 'hypothese' || line?.status === 'a_confirmer')
    return { decision: 'regle', why: 'règle encore « à confirmer » : ce chantier sert à la caler' };
  if (row.kind === 'plus' && row.real !== null && row.listed !== null && row.listed - row.real <= Math.max(2, Math.ceil(row.real * 0.3)))
    return { decision: 'inconnu', why: 'un peu plus que parti : spare (« toujours un peu plus que trouvé ») ou règle trop large' };
  return { decision: 'inconnu', why: 'règle confirmée qui ne tombe pas juste : à regarder' };
}

/** Rapproche la liste (`list`, corrections comprises) de la liste réelle. */
export function reconcile(list: LoadingList, real: readonly RealLine[], opts: ReconcileOptions = {}): Reconciliation {
  const computed = opts.computed ?? list;
  const known = opts.known ?? {};
  const byArt = new Map(list.lines.map((l) => [l.article, l]));
  const compArt = new Map(computed.lines.map((l) => [l.article, l]));
  const realArt = new Map<string, number>();
  for (const r of real) realArt.set(r.article, Math.round(((realArt.get(r.article) ?? 0) + r.qty) * 1000) / 1000);
  const rows: ReconRow[] = [];
  const push = (article: string, line: LoadingLine | undefined, realQty: number | null) => {
    const listed = line?.qty ?? null;
    const comp = compArt.get(article)?.qty ?? null;
    let kind: ReconKind;
    if (realQty === null) kind = 'prediction_seule';
    else if (!line || (listed === 0 && realQty > 0)) kind = 'reel_seul';
    else if (listed === null) kind = 'a_determiner';
    else kind = listed === realQty ? 'identique' : listed > realQty ? 'plus' : 'moins';
    const base: Omit<ReconRow, 'suggestion'> = {
      article,
      designation: line?.designation ?? opts.catalogue?.get(article)?.designation ?? '',
      kind,
      listed,
      computed: comp,
      real: realQty,
      delta: realQty !== null && listed !== null ? Math.round((realQty - listed) * 1000) / 1000 : null,
      status: line?.status,
      detail: line?.detail,
      sources: line?.sources ?? [],
      ruleKeys: ruleKeysOf(line ?? compArt.get(article)),
      ...(known[article] ? { known: known[article] } : {}),
    };
    const suggestion = suggestDecision(base, line, opts);
    rows.push({ ...base, ...(suggestion ? { suggestion } : {}) });
  };
  for (const [article, q] of realArt) push(article, byArt.get(article), q);
  if (!opts.partial)
    for (const l of list.lines) if (!realArt.has(l.article) && l.qty !== null && l.qty !== 0) push(l.article, l, null);
  const counts = { identique: 0, plus: 0, moins: 0, a_determiner: 0, reel_seul: 0, prediction_seule: 0 } as Record<ReconKind, number>;
  for (const r of rows) counts[r.kind]++;
  const order: ReconKind[] = ['reel_seul', 'prediction_seule', 'moins', 'plus', 'a_determiner', 'identique'];
  rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.article < b.article ? -1 : 1));
  return { rows, identical: counts.identique, total: realArt.size, counts, score: `${counts.identique} / ${realArt.size} lignes identiques` };
}

/** Résumé d'une ligne en français (« 4-700-039 : liste 12, réel 10 — un peu plus dans la liste »). */
export function rowSentence(r: ReconRow): string {
  const q = (n: number | null) => (n === null ? '—' : String(n).replace('.', ','));
  return `${r.article} : liste ${q(r.listed)}, réel ${q(r.real)} — ${RECON_LABEL[r.kind]}`;
}

export interface ReconObservation {
  article: string;
  ruleKeys: string[];
  predicted: number | null;
  final: number | null;
  kind: 'calage' | 'jugement' | 'erreur_3d' | 'erreur_bordereau' | 'inconnu';
  note: string;
}

/** Observations d'un rapprochement : chaque ligne identique est un point de calage, chaque écart classé donne son
 *  genre ; un écart non classé n'est pas enregistré. `predicted` = calcul des règles (sans les corrections). */
export function reconObservations(rec: Reconciliation, decisions: Readonly<Record<string, GapDecision>>, label: string): ReconObservation[] {
  const out: ReconObservation[] = [];
  for (const r of rec.rows) {
    const d = r.kind === 'identique' ? 'regle' : decisions[r.article];
    if (!d) continue;
    // une ligne identique seulement grâce à une correction n'est pas un point de calage des règles
    if (r.kind === 'identique' && r.computed !== r.listed) continue;
    out.push({
      article: r.article,
      ruleKeys: r.ruleKeys,
      predicted: r.computed,
      final: r.real ?? 0,
      kind: DECISION_KIND[d],
      note: `${label} : ${rowSentence(r)}${r.kind === 'identique' ? '' : ` — ${DECISION_LABEL[d].toLowerCase()}`}`,
    });
  }
  return out;
}

/** Ce qu'un banc garde d'un rapprochement : jugements (« seulement ce chantier » → quantité réelle imposée) et écarts
 *  connus (erreurs du 3D / du bordereau, questions en attente, règles à revoir) — jamais forcés dans les règles. */
export function benchFromReconciliation(
  rec: Reconciliation,
  decisions: Readonly<Record<string, GapDecision>>,
  when: string,
): { judgements: Record<string, number>; known: Record<string, string> } {
  const judgements: Record<string, number> = {};
  const known: Record<string, string> = {};
  for (const r of rec.rows) {
    if (r.kind === 'identique') continue;
    const d = decisions[r.article];
    if (d === 'chantier' && r.real !== null) judgements[r.article] = r.real;
    else if (d) known[r.article] = `${DECISION_LABEL[d].toLowerCase()} (rapprochement du ${when}) : liste ${r.listed ?? '—'}, réel ${r.real ?? '—'}`;
  }
  return { judgements, known };
}

/** Rapprochement enregistré sur la liste (loading_lists.reconciliation). */
export interface StoredReconciliation {
  fileName: string;
  /** n° de bon trouvé dans le fichier (« RVIE/OUT/00066 ») */
  picking?: string;
  /** feuille / tableau lu */
  table?: string;
  /** colonnes choisies (null = texte libre) */
  columnMap: import('./parseRealList').ColumnMap | null;
  real: import('./parseRealList').RealListLine[];
  ignored: import('./parseRealList').IgnoredRow[];
  decisions: Record<string, GapDecision>;
  score: string;
  identical: number;
  total: number;
  at?: string;
  by?: string | null;
}
