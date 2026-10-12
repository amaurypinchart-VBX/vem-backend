// Une règle en français clair (bibliothèque, écran de validation, détail du calcul). Fonctions pures.
import type { CatalogueItem, LoadingRule, RuleConditions, Spare } from './types';
import { COUNTING_BASE_LABEL } from './types';

const num = (n: number) => String(Math.round(n * 1000) / 1000).replace('.', ',');

const UNIT_SHORT = { pce: '', m: ' m', m2: ' m²', L: ' L' } as const;

export function describeSpare(s: Spare | undefined): string {
  if (!s) return '';
  if (s.type === 'fixe') return `+ ${s.valeur} en spare`;
  if (s.type === 'pourcent') return `+ ${num(s.valeur)} % arrondi au-dessus`;
  return `spare « ${s.texte} » à préciser`;
}

const CONDITION_TEXT: { [K in keyof RuleConditions]-?: (v: NonNullable<RuleConditions[K]>) => string } = {
  niveau: (v) => (v === 'rez' ? 'au rez' : 'à l’étage'),
  position: (v) => (v === 'angle' ? 'aux angles' : v === 'milieu' ? 'aux milieux' : 'aux bords'),
  regime: (v) => (v === 'standalone' ? 'box seule (standalone)' : 'box connectées'),
  connexion: (v) => `connexion ${v === 'les_deux' ? 'longueur ou largeur' : v}`,
  appui: (v) => `appui « ${v} »`,
  couvert: (v) => (v ? 'toits jointifs (couvert)' : 'non couvert'),
  chargeLourde: (v) => (v ? 'charge lourde' : 'sans charge lourde'),
  airco: (v) => (v ? 'avec airco' : 'sans airco'),
  aircoSlot: (v) => (v === 'nidaplast' ? 'emplacement airco dessiné en nidaplast' : 'airco dessinée ou emplacement vide'),
  ralMurs: (v) => `murs RAL ${v}`,
  plancherLamine: (v) => (v ? 'plancher laminé' : 'sans plancher laminé'),
  hauteur: (v) => (v ? 'travail en hauteur' : 'sans travail en hauteur'),
  tailleJob: (v) => (v === 'petit' ? 'petit job' : 'gros job'),
  montage: (v) => (v === 'atelier' ? 'montage atelier' : 'montage chantier'),
};

export function describeConditions(w: RuleConditions | undefined): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(w ?? {}) as [keyof RuleConditions, never][]) {
    if (v === undefined) continue;
    const f = CONDITION_TEXT[k] as ((x: unknown) => string) | undefined;
    out.push(f ? f(v) : `${k} = ${String(v)}`);
  }
  return out;
}

export function describeTrigger(r: LoadingRule, catalogue?: ReadonlyMap<string, CatalogueItem>): string {
  if (r.trigger.vitrage) return `vitrage ${r.trigger.vitrage === '10mm' ? '10 mm' : r.trigger.vitrage}`;
  if (r.trigger.articles?.length)
    return r.trigger.articles.map((a) => `${a}${catalogue?.get(a) ? ` ${catalogue.get(a)!.designation}` : ''}`).join(' ou ');
  return '';
}

/** « 8 par box · si box seule (standalone) · + 20 % arrondi au-dessus ». */
export function describeRule(r: LoadingRule, catalogue?: ReadonlyMap<string, CatalogueItem>): string {
  const parts: string[] = [];
  const unit = UNIT_SHORT[r.unit];
  const base = r.per === 'produit' && r.trigger.articles?.length ? `par ${describeTrigger(r, catalogue)}` : COUNTING_BASE_LABEL[r.per];
  if (r.kind === 'appreciation' || (r.qty === null && !r.qtyText)) parts.push('à apprécier (jamais calculé seul)');
  else if (r.qty === null) parts.push(`« ${r.qtyText} » — quantité à préciser`);
  else if (r.tranche?.mode === 'tranche') parts.push(`${num(r.qty)}${unit} par tranche de ${num(r.tranche.parTranche)} (${base.replace(/^par /, '')}), tranche entamée comptée`);
  else if (r.tranche?.mode === 'paliers')
    parts.push(r.tranche.paliers.map((p) => `${num(p.qty)}${unit} de ${p.min} à ${p.max ?? '…'}`).join(', ') + ` (${base.replace(/^par /, '')})`);
  else parts.push(`${num(r.qty)}${unit} ${base}`);
  if (r.per !== 'produit' && (r.trigger.vitrage || r.trigger.articles?.length)) parts.push(`si ${describeTrigger(r, catalogue)} présent`);
  const cond = describeConditions(r.when);
  if (cond.length) parts.push(`si ${cond.join(', ')}`);
  if (r.replaces) parts.push(`remplace ${num(r.replaces.qty)} × ${r.replaces.article}`);
  const sp = describeSpare(r.spare);
  if (sp) parts.push(sp);
  return parts.join(' · ');
}
