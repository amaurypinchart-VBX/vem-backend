// Classification des nœuds par leur nom (fonctions pures, testées).
// Ordre de priorité global (appliqué dans buildIndex) :
//   manifest.json (choix faits dans SketchUp) > nom d'instance > nom de définition > réf. article
//   > matériau > héritage du parent.
// Garder aligné avec l'extension SketchUp : plans/sketchup/viewbox_prep/core.rb.
import type { Category, CategoryRule, ClassificationRules, ModuleSize } from './types';
import { BUILTIN_ACCESSORY_CATEGORIES, LEGEND } from './types';

export const DEFAULT_RULES: ClassificationRules = {
  version: 1,
  // "VBX-03" ou "VBX 3 entrée" = module ; "VBX-03|PORTE-SIMPLE|02" n'en est PAS un (le "|" l'exclut).
  modulePattern: '^VBX[-_ ]?(\\d+)\\b(?!\\s*\\|)',
  articlePattern: '(?:^|[^0-9])(\\d-\\d{3}-\\d{3,5})(?![0-9])',
  contextPattern: '^CTX[-_ ]',
  commonPattern: '^COMMUN[-_ ]',
  glassMaterialPattern: 'VITRE|GLASS|VERRE',
  // L'ordre compte : le premier motif qui correspond gagne (les plus spécifiques d'abord).
  categories: [
    { key: 'VITRE-SEAMLESS', patterns: ['VITRE[-_ ]?SEAMLESS', 'SEAMLESS'], accessory: true },
    { key: 'VITRE-CADRE', patterns: ['VITRE[-_ ]?CADRE', 'WINDOWS?[-_ ]?FRAME', 'FRAMED[-_ ]?(GLASS|WINDOW)'], accessory: true },
    // "Full Slidding door" : orthographe de la légende actuelle des planches, d'où SLID+
    { key: 'PORTE-COULISSANTE', patterns: ['PORTE[-_ ]?COULISSANTE', 'SLID+(E|ING)[-_ ]?DOOR', 'FULL[-_ ]?SLID', 'COULISSANT'], accessory: true },
    { key: 'PORTE-DOUBLE', patterns: ['PORTE[-_ ]?DOUBLE', 'DOUBLE[-_ ]?DOOR'], accessory: true },
    { key: 'PORTE-SIMPLE', patterns: ['PORTE[-_ ]?SIMPLE', 'SINGLE[-_ ]?DOOR'], accessory: true },
    // murs Nidaplast (« 7-636-008 NIDAPLAST WALL WHITE / WHITE… ») : murs légers
    { key: 'MUR-LEGER', patterns: ['MUR[-_ ]?LEGER', 'WALL[-_ ]?LIGHT', 'LIGHT[-_ ]?WALL', 'NIDAPLAST'], accessory: true },
    { key: 'MUR-LOURD', patterns: ['MUR[-_ ]?LOURD', 'WALL[-_ ]?HEAVY', 'HEAVY[-_ ]?WALL'], accessory: true },
    // cadres de tissu tendu (SEG) posés à l'extérieur / à l'intérieur de la box (extension SketchUp ≥ 1.4.1)
    { key: 'FRAME-EXTERIEUR', label: 'Frame extérieur', patterns: ['FRAME[-_ ]?EXT', 'CADRE[-_ ]?(TEXTILE[-_ ]?)?EXT', '(OUTSIDE|OUTER|EXTERIOR)[-_ ]?FRAME'] },
    { key: 'FRAME-INTERIEUR', label: 'Frame intérieur', patterns: ['FRAME[-_ ]?INT', 'CADRE[-_ ]?(TEXTILE[-_ ]?)?INT', '(INSIDE|INNER|INTERIOR)[-_ ]?FRAME'] },
    // protection de sol (plaques bakélite)
    { key: 'BOARDING', label: 'Boarding', patterns: ['BOARDING', 'BAKELIT'] },
    { key: 'GARDE-CORPS', patterns: ['GARDE[-_ ]?CORPS', 'RAILING', 'HANDRAIL', 'BALUSTRADE'] },
    // escalier à l'intérieur d'une Viewbox (entre deux niveaux, extension SketchUp ≥ 1.5.0) : une charge sur le plancher,
    // pas le gabarit d'escalier extérieur
    { key: 'ESCALIER-INTERIEUR', label: 'Escalier intérieur', patterns: ['ESCALIER[-_ ]?INT(ERIEUR|[^A-Z]|$)', '(INTERIOR|INTERNAL|INSIDE|INDOOR|INNER)[-_ ]?STAIR', 'STAIR(S|CASE)?[-_ ]?(INTERI|INTERN|INSIDE|INDOOR)'] },
    { key: 'ESCALIER', patterns: ['ESCALIER', 'STAIR'] },
    // élément terrasse 5,9 × 2,5 m (« 7-632-029 TERRACE PLATFORM - VIEWBOX M16 ») : jamais une Viewbox
    { key: 'TERRASSE', patterns: ['TERRASS', 'TERRACE'] },
    { key: 'PIED', patterns: ['(^|[^A-Z])PIED', 'VERIN', '(^|[^A-Z])JACK', 'LEVEL+ING', '(^|[^A-Z])FEET', '(^|[^A-Z])FOOT([^A-Z]|$)'] },
    { key: 'TOIT', patterns: ['TOIT', 'ROOF'] },
    { key: 'PLANCHER', patterns: ['PLANCHER', 'FLOOR[-_ ]?(PANEL|MODULE)'] },
    { key: 'STRUCTURE', patterns: ['STRUCTURE', 'CHASSIS', 'POTEAU', 'POUTRE', '(^|[^A-Z])POLES?([^A-Z]|$)', 'COLUMN', '(^|[^A-Z])BEAM', 'UPN[-_ ]?\\d', 'IPE[-_ ]?\\d', 'HE[AB][-_ ]?\\d'] },
    { key: 'VITRE', patterns: ['(^|[^A-Z])VITRE', 'VITRAGE', 'GLAZING'], accessory: true },
  ],
  articleCategories: {},
  moduleSizes: [
    { label: 'Viewbox 5900', long: 5900, short: 2500 },
    { label: 'Viewbox 8400', long: 8400, short: 2500 },
  ],
  moduleToleranceMm: 30,
};

/** Majuscules, sans accents. Les séparateurs sont conservés (les motifs les gèrent). */
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

/** Clé de catégorie propre : "Porte orangerie" → "PORTE-ORANGERIE". */
export function categoryKey(value: string): string {
  return normalizeName(value).replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface CompiledRules {
  module: RegExp;
  article: RegExp;
  context: RegExp;
  common: RegExp;
  glassMaterial: RegExp;
  categories: Array<{ key: Category; res: RegExp[] }>;
  known: Map<Category, CategoryRule>;
  accessoryKeys: Set<Category>;
  articleCategories: Record<string, Category>;
  moduleSizes: ModuleSize[];
  moduleToleranceMm: number;
}

/** Compile les règles ; lève une erreur lisible si un motif est invalide (affichée dans Réglages). */
export function compileRules(rules: ClassificationRules): CompiledRules {
  const re = (label: string, src: string) => {
    try {
      return new RegExp(src, 'i');
    } catch (e) {
      throw new Error(`Motif invalide pour « ${label} » : ${src} (${(e as Error).message})`);
    }
  };
  return {
    module: re('module', rules.modulePattern),
    article: re('référence article', rules.articlePattern),
    context: re('contexte', rules.contextPattern),
    common: re('éléments communs', rules.commonPattern),
    glassMaterial: re('matériau vitre', rules.glassMaterialPattern),
    categories: rules.categories.map((c) => ({ key: c.key, res: c.patterns.map((p) => re(c.key, p)) })),
    known: new Map(rules.categories.map((c) => [c.key, c])),
    accessoryKeys: new Set(rules.categories.filter((c) => c.accessory ?? BUILTIN_ACCESSORY_CATEGORIES.has(c.key)).map((c) => c.key)),
    articleCategories: rules.articleCategories,
    moduleSizes: rules.moduleSizes.length ? rules.moduleSizes : DEFAULT_RULES.moduleSizes,
    moduleToleranceMm: rules.moduleToleranceMm,
  };
}

/** "VBX-3" → "VBX-03". Retourne null si le nom n'est pas un nom de module. */
export function moduleIdFromName(name: string, rules: CompiledRules): string | null {
  const m = normalizeName(name).match(rules.module);
  if (!m) return null;
  const num = parseInt(m[1] ?? '', 10);
  if (!Number.isFinite(num)) return null;
  return 'VBX-' + String(num).padStart(2, '0');
}

export function categoryFromName(name: string, rules: CompiledRules): Category | null {
  const n = normalizeName(name);
  if (!n) return null;
  for (const c of rules.categories) {
    if (c.res.some((r) => r.test(n))) return c.key;
  }
  return null;
}

export function articleRefFromName(name: string, rules: CompiledRules): string | null {
  const m = name.match(rules.article);
  return m ? (m[1] ?? null) : null;
}

export function isContextName(name: string, rules: CompiledRules): boolean {
  return rules.context.test(normalizeName(name));
}

export function isCommonName(name: string, rules: CompiledRules): boolean {
  return rules.common.test(normalizeName(name));
}

export function isGlassMaterial(materialName: string, rules: CompiledRules): boolean {
  return rules.glassMaterial.test(normalizeName(materialName));
}

/** Libellé et couleur de légende d'une catégorie (intégrée, personnalisée ou inconnue). */
export function categoryInfo(key: Category, rules?: ClassificationRules): { label: string; color: string } {
  const r = rules?.categories.find((c) => c.key === key);
  return {
    label: r?.label || LEGEND[key]?.label || key,
    color: r?.color || LEGEND[key]?.color || '#9aa3b5',
  };
}

/** Catégories intégrées ajoutées après la première version des réglages : [clé, catégorie après laquelle l'insérer]. */
const LATER_BUILTINS: Array<[string, string]> = [
  ['TERRASSE', 'ESCALIER'],
  ['FRAME-EXTERIEUR', 'MUR-LOURD'],
  ['FRAME-INTERIEUR', 'FRAME-EXTERIEUR'],
  ['BOARDING', 'FRAME-INTERIEUR'],
  // avant ESCALIER (premier motif trouvé) : juste après GARDE-CORPS
  ['ESCALIER-INTERIEUR', 'GARDE-CORPS'],
];

/** Motifs ajoutés après coup à une catégorie intégrée : repris dans des réglages enregistrés avant eux. */
const LATER_PATTERNS: Array<[string, string]> = [['MUR-LEGER', 'NIDAPLAST']];

/** Fusionne des règles enregistrées (éventuellement partielles/anciennes) avec les valeurs par défaut. */
export function mergeRules(saved: (Partial<ClassificationRules> & { moduleDims?: { long?: number; short?: number; toleranceMm?: number } }) | null | undefined): ClassificationRules {
  const base = structuredClone(DEFAULT_RULES);
  if (!saved || typeof saved !== 'object') return base;
  const { moduleDims, ...rest } = saved;
  const merged: ClassificationRules = {
    ...base,
    ...rest,
    version: 1,
    categories: Array.isArray(saved.categories) && saved.categories.length ? saved.categories : base.categories,
    articleCategories: saved.articleCategories ?? {},
    moduleSizes: Array.isArray(saved.moduleSizes) && saved.moduleSizes.length ? saved.moduleSizes : base.moduleSizes,
    moduleToleranceMm: saved.moduleToleranceMm ?? moduleDims?.toleranceMm ?? base.moduleToleranceMm,
  };
  // catégories intégrées ajoutées après coup : reprises dans des réglages enregistrés avant elles, juste après
  // la catégorie qui les précède dans les règles par défaut (l'ordre compte : premier motif trouvé)
  for (const [key, after] of LATER_BUILTINS) {
    if (merged.categories.some((c) => c.key === key)) continue;
    const t = base.categories.find((c) => c.key === key)!;
    const at = merged.categories.findIndex((c) => c.key === after);
    merged.categories = at >= 0 ? [...merged.categories.slice(0, at + 1), t, ...merged.categories.slice(at + 1)] : [t, ...merged.categories];
  }
  for (const [key, pattern] of LATER_PATTERNS) {
    merged.categories = merged.categories.map((c) => (c.key === key && Array.isArray(c.patterns) && !c.patterns.includes(pattern) ? { ...c, patterns: [...c.patterns, pattern] } : c));
  }
  // Anciens réglages (une seule taille "moduleDims") : conservée en tête de liste.
  if (moduleDims?.long && moduleDims?.short && !saved.moduleSizes) {
    const legacy = { label: `Viewbox ${moduleDims.long}`, long: moduleDims.long, short: moduleDims.short };
    merged.moduleSizes = [legacy, ...base.moduleSizes.filter((m) => m.long !== legacy.long || m.short !== legacy.short)];
  }
  return merged;
}
