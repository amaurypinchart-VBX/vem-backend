// Étiquettes de vue : « Plafond tendu », « Éclairage »… pour retirer la même chose dans tous les projets.
// Système séparé des catégories du SceneIndex (une catégorie « PLAFOND » ferait apparaître le plafond comme une pièce
// à renseigner dans l'étude structure). Base dans le code (motifs de nom), jamais écrasée ; les étiquettes mémorisées
// au clic (app_settings › plans.viewTags, par définition / référence / motif) passent avant les motifs de la base.
import type { NodeInfo, SceneIndex } from '../types';
import type { BaseViewTag, ViewTagRule } from './types';

/** Ordre = priorité : la première étiquette qui correspond gagne (les fixations avant le plafond lui-même). */
export const BASE_VIEW_TAGS: BaseViewTag[] = [
  {
    tag: 'fixations-plafond',
    label: 'Fixations du plafond tendu',
    patterns: ['TENSION.?CEILING', 'TENSION.?RAIL', 'SPANNPROFIL', 'PROFIL.{0,12}PLAFOND', 'FIXATION.{0,12}PLAFOND', 'CEILING.?(CLIP|PROFILE|FIX)'],
  },
  { tag: 'plafond-tendu', label: 'Plafond tendu', patterns: ['PLAFOND', 'CEILING', 'CIELING', 'TENDU', 'BARRISOL', 'STRETCH', 'SPANNDECKE'] },
  { tag: 'eclairage', label: 'Éclairage', patterns: ['SPOT', 'LIGHT', 'LUMINAIRE', 'LAMP', 'ECLAIRAGE', 'PENDEL', '(^|[^A-Z])LED([^A-Z]|$)'] },
  {
    tag: 'mobilier',
    label: 'Mobilier',
    patterns: ['MOBILIER', 'MEUBLE', 'FURNITURE', 'TABLE', 'CHAISE', 'CHAIR', 'SOFA', 'CANAPE', 'COMPTOIR', 'COUNTER', 'DESK', 'TABOURET', 'STOOL', 'ETAGERE', 'SHELF'],
  },
  { tag: 'calage', label: 'Calage', patterns: ['CALAGE', '(^|[^A-Z])CALES?([^A-Z]|$)', 'SHIM', 'PACKING', 'SOUS.?BOIS', 'UNTERLEG'] },
  { tag: 'pied', label: 'Pieds', categories: ['PIED'], patterns: ['(^|[^A-Z])PIEDS?([^A-Z]|$)', 'JACK', 'VERIN', 'FUSSSPINDEL'] },
  { tag: 'facade', label: 'Façades (vitrages, murs, portes)', categoryPrefixes: ['VITRE', 'MUR', 'PORTE'] },
  { tag: 'plancher', label: 'Plancher', categories: ['PLANCHER'], patterns: ['PLANCHER', 'FLOOR'] },
  { tag: 'couverture', label: 'Couverture (toiture)', categories: ['TOIT'], patterns: ['ROOF', 'TOITURE', 'BITUME'] },
  { tag: 'logo', label: 'Logos, enseignes', patterns: ['LOGO', 'ENSEIGNE', 'SIGNAGE'] },
  { tag: 'structure-acier', label: 'Structure acier', patterns: ['VERTICAL.?POLE', 'POTEAU', 'COLUMN'] },
];

export function normText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

export interface TagHit {
  tag: string;
  label: string;
  /** mémorisée (clic) / devinée par le nom / par la catégorie */
  source: 'memorised' | 'name' | 'category';
}

export interface TagResolver {
  /** étiquette propre du nœud (pas celle d'un parent) */
  ownTag(id: string): TagHit | null;
  /** nœuds portant une étiquette, à leur niveau le plus haut (un enfant d'un nœud étiqueté pareil n'est pas répété) */
  nodesWithTag(tag: string): string[];
  /** libellé d'une étiquette (base ou mémorisée) */
  labelOf(tag: string): string;
  /** toutes les étiquettes connues */
  all(): Array<{ tag: string; label: string }>;
}

function safeRegex(p: string): RegExp | null {
  try {
    return new RegExp(p, 'i');
  } catch {
    return null;
  }
}

/** Textes d'un nœud cherchés par les motifs : définition, nom d'origine, nom, désignation. */
export function nodeTexts(n: NodeInfo): string[] {
  return [n.definition, n.sourceName, n.name, n.label].filter((x): x is string => !!x && !/^SketchUp_Instance_\d+$/i.test(x)).map(normText);
}

export function makeTagResolver(index: SceneIndex, memorised: ViewTagRule[] = [], base: BaseViewTag[] = BASE_VIEW_TAGS): TagResolver {
  const byId = new Map(index.nodes.map((n) => [n.id, n]));
  const labels = new Map<string, string>();
  for (const t of base) labels.set(t.tag, t.label);
  for (const r of memorised) if (!labels.has(r.tag)) labels.set(r.tag, r.label);
  const byDef = new Map<string, ViewTagRule>();
  const byRef = new Map<string, ViewTagRule>();
  const byPattern: Array<{ re: RegExp; rule: ViewTagRule }> = [];
  for (const r of memorised) {
    if (r.match.definition) byDef.set(r.match.definition, r);
    else if (r.match.articleRef) byRef.set(r.match.articleRef, r);
    else if (r.match.namePattern) {
      const re = safeRegex(r.match.namePattern);
      if (re) byPattern.push({ re, rule: r });
    }
  }
  const compiled = base.map((t) => ({ t, res: (t.patterns ?? []).map((p) => new RegExp(p)) }));
  const cache = new Map<string, TagHit | null>();

  const ownTag = (id: string): TagHit | null => {
    if (cache.has(id)) return cache.get(id)!;
    const n = byId.get(id);
    let hit: TagHit | null = null;
    if (n && n.role !== 'module' && n.role !== 'context') {
      const mem = (n.definition && byDef.get(n.definition)) || (n.articleRef && byRef.get(n.articleRef)) || undefined;
      const texts = nodeTexts(n);
      const pat = mem ? undefined : byPattern.find((p) => texts.some((t) => p.re.test(t)))?.rule;
      const rule = mem ?? pat;
      if (rule) hit = { tag: rule.tag, label: labels.get(rule.tag) ?? rule.label, source: 'memorised' };
      else {
        // catégorie propre du nœud seulement (héritée = elle vient de la Viewbox entière)
        const cat = n.categorySource && n.categorySource !== 'inherited' ? n.category : null;
        for (const { t, res } of compiled) {
          if (cat && (t.categories?.includes(cat) || t.categoryPrefixes?.some((p) => cat.startsWith(p)))) {
            hit = { tag: t.tag, label: t.label, source: 'category' };
            break;
          }
          if (res.length && texts.some((s) => res.some((re) => re.test(s)))) {
            hit = { tag: t.tag, label: t.label, source: 'name' };
            break;
          }
        }
      }
    }
    cache.set(id, hit);
    return hit;
  };

  const tagged = new Map<string, string[]>();
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    for (const n of index.nodes) {
      const t = ownTag(n.id);
      if (!t) continue;
      // le plus haut seulement : un parent qui porte la même étiquette suffit
      let dup = false;
      for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined)
        if (ownTag(p.id)?.tag === t.tag) {
          dup = true;
          break;
        }
      if (dup) continue;
      const l = tagged.get(t.tag) ?? [];
      l.push(n.id);
      tagged.set(t.tag, l);
    }
  };

  return {
    ownTag,
    nodesWithTag: (tag) => {
      build();
      return tagged.get(tag) ?? [];
    },
    labelOf: (tag) => labels.get(tag) ?? tag,
    all: () => [...labels.entries()].map(([tag, label]) => ({ tag, label })),
  };
}

/** Lecture tolérante des étiquettes mémorisées (app_settings › plans.viewTags). */
export function cleanViewTags(raw: unknown): ViewTagRule[] {
  if (!Array.isArray(raw)) return [];
  const out: ViewTagRule[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const o = r as Record<string, unknown>;
    const tag = typeof o.tag === 'string' ? o.tag.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40) : '';
    const m = o.match && typeof o.match === 'object' ? (o.match as Record<string, unknown>) : {};
    const match: ViewTagRule['match'] = {};
    for (const k of ['definition', 'articleRef', 'namePattern'] as const) if (typeof m[k] === 'string' && (m[k] as string).trim()) match[k] = (m[k] as string).trim();
    if (match.namePattern && !safeRegex(match.namePattern)) delete match.namePattern;
    if (!tag || !Object.keys(match).length) continue;
    const rule: ViewTagRule = { tag, label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 80) : tag, match };
    if (typeof o.by === 'string') rule.by = o.by;
    if (typeof o.at === 'string') rule.at = o.at;
    out.push(rule);
  }
  return out;
}
