// « C'est la règle, pour tous les projets » : quelles bases de comptage expliquent la nouvelle quantité ? Essaie toutes
// les bases que la topologie sait compter (box, jonctions, côtés, panneaux, portes, îlots, pieds, produits présents,
// forfait chantier), avec un rapport simple, sans ou avec spare (+ 10 / 20 / 25 / 30 / 50 %, + 1 / + 2). Ex. boulons
// 4-710-001 passés à 26 avec 2 jonctions → « 13 / jonction » ou « 10 / jonction + 30 % ». Déterministe, sans IA :
// Amaury choisit. Fonctions pures.
import type { CountingBase, LoadingRule, Spare } from '../core/types';
import type { Topology } from '../topology/types';

export interface BaseCandidate {
  per: CountingBase;
  /** produit déclencheur quand la base est « par produit » */
  trigger?: string;
  qty: number;
  spare?: Spare;
  /** valeur de la base sur ce chantier */
  base: number;
  /** quantité que la règle donnerait ici (= la quantité demandée) */
  result: number;
  /** « 13 / jonction » ou « 10 / jonction + 30 % » */
  label: string;
  score: number;
}

const PERCENTS = [10, 20, 25, 30, 50];
const FIXED = [1, 2];
/** bases jamais proposées : comptées ailleurs ou sans sens comme base d'une règle apprise */
const SKIP = new Set<CountingBase>(['sous_bois_etude', 'motif', 'm2_plancher', 'bord']);

const BASE_WORD: Partial<Record<CountingBase, string>> = {
  box: 'box',
  pied: 'pied',
  pied_box: 'pied de box',
  jonction_box: 'jonction',
  jonction_grand_cote: 'jonction grand côté',
  jonction_petit_cote: 'jonction petit côté',
  jonction_toit_grand_cote: 'jonction de toit grand côté',
  jonction_toit_petit_cote: 'jonction de toit petit côté',
  cote_box_jonction: 'côté à une jonction',
  jonction_panneau: 'jonction de panneaux sans vitre',
  jonction_verre: 'jonction avec vitre',
  terminaison_vitre: 'bout de vitre',
  cote: 'côté extérieur',
  cote_vitre_court: 'petit côté vitré',
  cote_vitre_long: 'grand côté vitré',
  cote_facade_court: 'petit côté avec façade',
  cote_facade_long: 'grand côté avec façade',
  panneau: 'panneau',
  panneau_plein: 'mur',
  porte_simple: 'porte simple',
  porte_double: 'porte double',
  porte_coulissante: 'porte coulissante',
  poteau: 'poteau',
  poteau_connecte: 'bande de poteaux',
  paire_box: 'paire de box',
  ilot: 'îlot',
  ilot_couvert: 'îlot couvert',
  module_toit: 'toit',
  airco: 'airco',
  job: 'chantier',
};

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
const ceil = (x: number) => Math.ceil(x - 1e-9);
/** rapport « simple » : entier, ou demi (2,5), ou deux décimales au plus pour les mètres */
const simple = (r: number, metres: boolean) => r > 0 && (Number.isInteger(r) || Number.isInteger(r * 2) || (metres && Math.abs(r * 100 - Math.round(r * 100)) < 1e-9));

function apply(qty: number, base: number, spare?: Spare): number {
  const raw = qty * base;
  if (!spare) return ceil(raw);
  if (spare.type === 'fixe') return ceil(raw + spare.valeur);
  if (spare.type === 'pourcent') return ceil(raw * (1 + spare.valeur / 100));
  return ceil(raw);
}

export interface InferOptions {
  /** règles actuelles de l'article : leur base passe en tête */
  rules?: readonly LoadingRule[];
  /** quantités au mètre (bande, câble) : rapports à deux décimales acceptés */
  metres?: boolean;
  max?: number;
}

export function inferBase(article: string, target: number, t: Topology, opts: InferOptions = {}): BaseCandidate[] {
  if (!(target > 0)) return [];
  const metres = !!opts.metres;
  const known = new Set((opts.rules ?? []).filter((r) => r.article === article && r.active).map((r) => r.per));
  const bases: { per: CountingBase; trigger?: string; value: number; word: string }[] = [];
  for (const [k, c] of Object.entries(t.counts) as [CountingBase, { value: number | null } | undefined][]) {
    if (SKIP.has(k) || !c || c.value === null || !(c.value > 0)) continue;
    bases.push({ per: k, value: c.value, word: BASE_WORD[k] ?? k });
  }
  for (const p of t.products) if (p.qty > 0 && p.article !== article) bases.push({ per: 'produit', trigger: p.article, value: p.qty, word: p.article });
  if (!bases.some((b) => b.per === 'job')) bases.push({ per: 'job', value: 1, word: 'chantier' });
  const out: BaseCandidate[] = [];
  const push = (b: (typeof bases)[number], qty: number, spare: Spare | undefined, extra: number) => {
    if (apply(qty, b.value, spare) !== target) return;
    const sp = spare ? (spare.type === 'pourcent' ? ` + ${spare.valeur} %` : spare.type === 'fixe' ? ` + ${spare.valeur}` : '') : '';
    out.push({
      per: b.per,
      trigger: b.trigger,
      qty,
      spare,
      base: b.value,
      result: target,
      label: `${fmt(qty)} / ${b.word}${sp}`,
      score:
        (known.has(b.per) ? 0 : 10) + // la base déjà utilisée pour cet article d'abord
        (b.per === 'job' ? 6 : b.per === 'produit' ? 3 : 0) + // forfait et « par produit » après les bases de topologie
        (Number.isInteger(qty) ? 0 : 2) +
        (spare ? 1 + extra : 0) +
        (b.value === 1 ? 2 : 0), // une base qui vaut 1 explique tout : peu probante
    });
  };
  for (const b of bases) {
    // sans spare
    const r = target / b.value;
    if (simple(r, metres)) push(b, r, undefined, 0);
    // avec spare en pourcentage : rapport entier (ou demi) dont l'arrondi au-dessus donne la quantité
    PERCENTS.forEach((p, i) => {
      const guess = target / (b.value * (1 + p / 100));
      for (const q of [Math.floor(guess), Math.ceil(guess), Math.floor(guess * 2) / 2, Math.ceil(guess * 2) / 2])
        if (q > 0 && simple(q, metres) && !(q === r && Number.isInteger(r))) push(b, q, { type: 'pourcent', valeur: p }, i * 0.1);
    });
    // avec spare fixe
    for (const k of FIXED) {
      const q = (target - k) / b.value;
      if (q > 0 && simple(q, metres)) push(b, q, { type: 'fixe', valeur: k }, k * 0.2);
    }
  }
  // une seule proposition par libellé, les plus simples d'abord
  const seen = new Set<string>();
  return out
    .sort((a, b) => a.score - b.score || a.base - b.base || (a.label < b.label ? -1 : 1))
    .filter((c) => (seen.has(c.label + c.per) ? false : (seen.add(c.label + c.per), true)))
    .slice(0, opts.max ?? 8);
}
