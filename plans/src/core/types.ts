// Types partagés du module Plans Viewbox (index de scène, avertissements, règles).
// Convention interne unique : millimètres, Y vers le haut (convention three.js).

export const ENGINE_VERSION = 'p0-ingest-1';

export const CATEGORIES = [
  'VITRE-SEAMLESS',
  'VITRE-CADRE',
  'VITRE',
  'MUR-LEGER',
  'MUR-LOURD',
  'PORTE-SIMPLE',
  'PORTE-DOUBLE',
  'PORTE-COULISSANTE',
  'STRUCTURE',
  'PLANCHER',
  'TOIT',
  'PIED',
  'ESCALIER',
  'GARDE-CORPS',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Catégories d'accessoires "de façade" : hors module, elles sont signalées comme orphelines. */
export const MODULE_ACCESSORY_CATEGORIES: ReadonlySet<Category> = new Set<Category>([
  'VITRE-SEAMLESS',
  'VITRE-CADRE',
  'VITRE',
  'MUR-LEGER',
  'MUR-LOURD',
  'PORTE-SIMPLE',
  'PORTE-DOUBLE',
  'PORTE-COULISSANTE',
]);

/** Légende des planches Viewbox (libellés + couleurs de la charte). */
export const LEGEND: Partial<Record<Category, { label: string; color: string }>> = {
  'VITRE-SEAMLESS': { label: 'Windows Seamless', color: '#1030FF' },
  'VITRE-CADRE': { label: 'Windows Frame', color: '#800080' },
  'MUR-LEGER': { label: 'Wall Light', color: '#FFFB14' },
  'MUR-LOURD': { label: 'Wall Heavy', color: '#17FF28' },
  'PORTE-SIMPLE': { label: 'Single Door', color: '#CC0043' },
  'PORTE-DOUBLE': { label: 'Double Door', color: '#FF3712' },
  'PORTE-COULISSANTE': { label: 'Full Sliding Door', color: '#FF69B4' },
};

/** [minX, minY, minZ, maxX, maxY, maxZ] en mm, repère monde Y-up. */
export type BBox = [number, number, number, number, number, number];

export type CategorySource = 'manifest' | 'name' | 'definition' | 'article' | 'material' | 'inherited';

export type NodeRole = 'module' | 'item' | 'part' | 'wrapper' | 'context';

export interface NodeInfo {
  id: string;
  name: string;
  /** nom de la définition de composant SketchUp, quand il diffère du nom d'instance */
  definition?: string;
  parentId: string | null;
  kind: 'group' | 'mesh' | 'lines';
  role: NodeRole;
  category: Category | null;
  categorySource: CategorySource | null;
  moduleId: string | null;
  /** 'hierarchy' = descendant du module, 'spatial' = rattaché par sa position, 'common' = élément commun */
  assignment: 'hierarchy' | 'spatial' | 'common' | null;
  level: number | null;
  bboxMm: BBox | null;
  triangles: number;
  materialNames?: string[];
  articleRef?: string;
  glass?: boolean;
}

export interface ModuleInfo {
  id: string;
  nodeId: string;
  name: string;
  level: number;
  planDimsMm: [number, number];
  heightMm: number;
  dimsSource: 'structure' | 'all';
  dimsOk: boolean;
  bboxMm: BBox;
  itemIds: string[];
  detectedBy: 'name' | 'dimensions';
}

export interface LevelInfo {
  level: number;
  label: string;
  minYmm: number;
  moduleIds: string[];
}

export type Severity = 'blocking' | 'warning' | 'info';

export interface Warning {
  code: string;
  severity: Severity;
  message: string;
  nodeIds?: string[];
}

export interface SourceInfo {
  fileName: string;
  sha256: string;
  sizeBytes: number;
  format: 'dae' | 'glb';
  unitMeter: number;
  unitName: string;
  upAxis: 'X_UP' | 'Y_UP' | 'Z_UP';
  loaderAppliedUnit: boolean;
  hasManifest: boolean;
  hasEdges: boolean;
}

export interface IngestStats {
  nodes: number;
  meshes: number;
  triangles: number;
  degenerateRemoved: number;
  duplicateRemoved: number;
  backToBackRemoved: number;
  modules: number;
  levels: number;
  items: number;
  unclassified: number;
  durationMs: number;
}

export interface SceneIndex {
  schema: 'vem-plans-index/1';
  engineVersion: string;
  createdAt: string;
  source: SourceInfo;
  stats: IngestStats;
  nodes: NodeInfo[];
  modules: ModuleInfo[];
  levels: LevelInfo[];
  commonIds: string[];
  contextIds: string[];
  warnings: Warning[];
}

export interface CategoryRule {
  key: Category;
  patterns: string[];
}

/** Règles de classification, éditables dans la page Réglages (stockées dans app_settings). */
export interface ClassificationRules {
  version: 1;
  modulePattern: string;
  articlePattern: string;
  contextPattern: string;
  commonPattern: string;
  glassMaterialPattern: string;
  categories: CategoryRule[];
  /** Référence article ERP → catégorie (ex. "7-230-044" → "MUR-LEGER"). */
  articleCategories: Record<string, Category>;
  moduleDims: { long: number; short: number; toleranceMm: number };
}
