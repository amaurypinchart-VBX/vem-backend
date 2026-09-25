// Classification des nœuds par leur nom (fonctions pures, testées).
// Ordre de priorité global (appliqué dans buildIndex) :
//   manifest.json > nom d'instance > nom de définition > référence article > matériau > héritage du parent.
import type { Category, ClassificationRules } from './types';

export const DEFAULT_RULES: ClassificationRules = {
  version: 1,
  // "VBX-03" ou "VBX 3 entrée" = module ; "VBX-03|PORTE-SIMPLE|02" (nom d'accessoire posé par
  // vbx_prep.rb) n'en est PAS un : le "|" juste après le numéro l'exclut.
  modulePattern: '^VBX[-_ ]?(\\d+)\\b(?!\\s*\\|)',
  articlePattern: '(?:^|[^0-9])(\\d-\\d{3}-\\d{3,5})(?![0-9])',
  contextPattern: '^CTX[-_ ]',
  commonPattern: '^COMMUN[-_ ]',
  glassMaterialPattern: 'VITRE|GLASS|VERRE',
  // L'ordre compte : le premier motif qui correspond gagne (les plus spécifiques d'abord).
  categories: [
    { key: 'VITRE-SEAMLESS', patterns: ['VITRE[-_ ]?SEAMLESS', 'SEAMLESS'] },
    { key: 'VITRE-CADRE', patterns: ['VITRE[-_ ]?CADRE', 'WINDOWS?[-_ ]?FRAME', 'FRAMED[-_ ]?(GLASS|WINDOW)'] },
    // "Full Slidding door" : orthographe de la légende actuelle des planches, d'où SLID+
    { key: 'PORTE-COULISSANTE', patterns: ['PORTE[-_ ]?COULISSANTE', 'SLID+(E|ING)[-_ ]?DOOR', 'FULL[-_ ]?SLID', 'COULISSANT'] },
    { key: 'PORTE-DOUBLE', patterns: ['PORTE[-_ ]?DOUBLE', 'DOUBLE[-_ ]?DOOR'] },
    { key: 'PORTE-SIMPLE', patterns: ['PORTE[-_ ]?SIMPLE', 'SINGLE[-_ ]?DOOR'] },
    { key: 'MUR-LEGER', patterns: ['MUR[-_ ]?LEGER', 'WALL[-_ ]?LIGHT', 'LIGHT[-_ ]?WALL'] },
    { key: 'MUR-LOURD', patterns: ['MUR[-_ ]?LOURD', 'WALL[-_ ]?HEAVY', 'HEAVY[-_ ]?WALL'] },
    { key: 'GARDE-CORPS', patterns: ['GARDE[-_ ]?CORPS', 'RAILING', 'HANDRAIL', 'BALUSTRADE'] },
    { key: 'ESCALIER', patterns: ['ESCALIER', 'STAIR'] },
    { key: 'PIED', patterns: ['(^|[^A-Z])PIED', 'VERIN', '(^|[^A-Z])JACK'] },
    { key: 'TOIT', patterns: ['TOIT', 'ROOF'] },
    { key: 'PLANCHER', patterns: ['PLANCHER', 'FLOOR[-_ ]?PANEL'] },
    { key: 'STRUCTURE', patterns: ['STRUCTURE', 'CHASSIS', 'POTEAU', 'POUTRE'] },
    { key: 'VITRE', patterns: ['(^|[^A-Z])VITRE', 'VITRAGE', 'GLAZING'] },
  ],
  articleCategories: {},
  moduleDims: { long: 5900, short: 2500, toleranceMm: 30 },
};

/** Majuscules, sans accents. Les séparateurs sont conservés (les motifs les gèrent). */
export function normalizeName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
}

export interface CompiledRules {
  module: RegExp;
  article: RegExp;
  context: RegExp;
  common: RegExp;
  glassMaterial: RegExp;
  categories: Array<{ key: Category; res: RegExp[] }>;
  articleCategories: Record<string, Category>;
  moduleDims: ClassificationRules['moduleDims'];
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
    articleCategories: rules.articleCategories,
    moduleDims: rules.moduleDims,
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

/** Fusionne des règles enregistrées (éventuellement partielles/anciennes) avec les valeurs par défaut. */
export function mergeRules(saved: Partial<ClassificationRules> | null | undefined): ClassificationRules {
  if (!saved || typeof saved !== 'object') return structuredClone(DEFAULT_RULES);
  return {
    ...structuredClone(DEFAULT_RULES),
    ...saved,
    version: 1,
    categories: Array.isArray(saved.categories) && saved.categories.length ? saved.categories : structuredClone(DEFAULT_RULES.categories),
    articleCategories: saved.articleCategories ?? {},
    moduleDims: { ...DEFAULT_RULES.moduleDims, ...(saved.moduleDims ?? {}) },
  };
}
