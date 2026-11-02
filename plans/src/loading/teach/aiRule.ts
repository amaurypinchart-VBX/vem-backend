// Atelier texte (L7) côté module : listes envoyées à l'IA (catalogue, bases de comptage, conditions, traits des
// motifs de ce chantier) et règle brouillon construite depuis sa réponse déjà nettoyée par le serveur
// (src/services/loadingAiGuard.ts : aucun chiffre de l'IA, rien hors des listes). Le brouillon passe ensuite par
// l'écran de validation des règles, comme une correction. Fonctions pures.
import type { CatalogueItem, CountingBase, LoadingRule, MotifKind, Unit } from '../core/types';
import { COUNTING_BASE_LABEL } from '../core/types';
import { ruleKey } from '../library/importClasseur';
import type { TElement } from './motif';
import { ATTRS, attrChoices } from './motif';

/** Même forme que LoadingAiAllowed (src/services/loadingAiGuard.ts). */
export interface AiAllowed {
  articles: { ref: string; designation?: string }[];
  bases: string[];
  conditions: Record<string, string[]>;
  motifs: Record<string, Record<string, string[]>>;
  units: string[];
}

/** Même forme que LoadingAiNormalized + usage (réponse de POST /loading/ai/rule). */
export interface AiRuleAnswer {
  draft: {
    kind: 'accessoire' | 'ajout_chantier' | 'appreciation';
    article: string | null;
    qty: number | null;
    per: string | null;
    trigger: { articles?: string[]; vitrage?: string } | null;
    motif: { kind: string; attrs: Record<string, string | boolean> } | null;
    when: Record<string, string | boolean>;
    spare: { type: 'fixe' | 'pourcent'; valeur: number } | null;
    tranche: { pour: number; parTranche: number } | null;
    unit: string;
  };
  removed: string[];
  questions: string[];
  confidence: number;
  rationale: string;
  usage?: { model: string; costUsd: number | null };
}

/** Conditions qu'une règle peut porter, avec leurs valeurs (booléens écrits « true » / « false »). */
export const CONDITION_VALUES: Record<string, string[]> = {
  regime: ['standalone', 'connecte'],
  couvert: ['true', 'false'],
  position: ['angle', 'milieu', 'bord'],
  niveau: ['rez', 'etage'],
  chargeLourde: ['true', 'false'],
  airco: ['true', 'false'],
  plancherLamine: ['true', 'false'],
  revetementSol: ['laminate', 'vinyle'],
  boarding: ['true', 'false'],
  hauteur: ['true', 'false'],
  tailleJob: ['petit', 'gros'],
  montage: ['atelier', 'chantier'],
  ralMurs: ['blanc', '7024'],
};

/** Bases que l'IA peut choisir (les plaques de l'étude et les m² ont leurs propres règles). */
const AI_BASES = (Object.keys(COUNTING_BASE_LABEL) as CountingBase[]).filter((b) => b !== 'sous_bois_etude');

export function aiAllowed(catalogue: Iterable<CatalogueItem>, elements?: readonly TElement[]): AiAllowed {
  const motifs: Record<string, Record<string, string[]>> = {};
  if (elements?.length) Object.assign(motifs, attrChoices(elements));
  else for (const k of Object.keys(ATTRS) as MotifKind[]) motifs[k] = Object.fromEntries(Object.entries(ATTRS[k]).map(([a, d]) => [a, Object.keys(d.values)]));
  return {
    articles: [...catalogue].map((c) => ({ ref: c.ref, designation: c.designation })),
    bases: AI_BASES,
    conditions: CONDITION_VALUES,
    motifs,
    units: ['pce', 'm', 'm2', 'L'],
  };
}

/** Règle brouillon (source « atelier texte », à confirmer) depuis la réponse nettoyée. null = pas d'article. */
export function draftFromAi(a: AiRuleAnswer, rules: readonly LoadingRule[], catalogue: ReadonlyMap<string, CatalogueItem>, opts: { article?: string; text?: string } = {}): LoadingRule | null {
  const d = a.draft;
  const article = opts.article ?? d.article;
  if (!article) return null;
  const per = (d.per as CountingBase | null) ?? 'box';
  const unit = (['pce', 'm', 'm2', 'L'].includes(d.unit) ? d.unit : (catalogue.get(article)?.unit ?? 'pce')) as Unit;
  const r: LoadingRule = {
    key: '',
    kind: d.kind,
    trigger: d.motif && per === 'motif' ? { motif: { kind: d.motif.kind as MotifKind, attrs: d.motif.attrs } } : d.trigger ? { ...(d.trigger.articles ? { articles: d.trigger.articles } : {}), ...(d.trigger.vitrage ? { vitrage: d.trigger.vitrage as LoadingRule['trigger']['vitrage'] } : {}) } : {},
    article,
    articleName: catalogue.get(article)?.designation,
    qty: d.kind === 'appreciation' ? null : d.qty,
    per,
    unit,
    ...(d.tranche ? { tranche: { mode: 'tranche' as const, pour: d.tranche.pour, parTranche: d.tranche.parTranche, arrondi: 'sup' as const } } : {}),
    ...(Object.keys(d.when).length ? { when: d.when as LoadingRule['when'] } : {}),
    ...(d.spare ? { spare: d.spare } : {}),
    confidence: 'a_confirmer',
    calibration: [],
    ...(opts.text ? { remark: `Écrite : « ${opts.text.slice(0, 300)} »` } : {}),
    version: 1,
    active: true,
    source: 'atelier_texte',
  };
  const key = ruleKey(r);
  r.key = key;
  for (let n = 2; rules.some((x) => x.key === r.key && x.active); n++) r.key = `${key}#${n}`;
  return r;
}
