// Vues spéciales (Plans 2D) : description complète d'une vue — direction, coupes, éléments retirés / gardés /
// fantômes, disposition, style. Stockée dans plans_model_versions.settings.customViews ; un préréglage est la même
// description sans identifiant de nœud (clés portables seulement : étiquettes, catégories, définitions, références).
// Unités : mm, repère du SceneIndex (Y vers le haut). Le modèle n'est jamais modifié : retirer = règle de vue.

export type Vec3 = [number, number, number];

export type CameraDir = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right' | 'iso' | 'iso-below' | 'custom';
export type IsoCorner = 'fl' | 'fr' | 'bl' | 'br';
export type Rotation = 0 | 90 | 180 | 270;

export interface ViewCamera {
  /** module = repère de chaque Viewbox (ModuleFrame, face avant des réglages) */
  frame: 'world' | 'module';
  dir: CameraDir;
  isoCorner?: IsoCorner;
  /** direction de regard et haut, repère SceneIndex */
  custom?: { dir: Vec3; up: Vec3 };
  /** plan de plafond réfléchi (dir 'bottom' seulement) : vue de dessous retournée, superposable au plan de dessus */
  reflected?: boolean;
  /** rotation dans la feuille, sens horaire */
  rotate: Rotation;
  /** miroir gauche ↔ droite (vue « retournée ») */
  mirror: boolean;
}

export type LevelRef = 'ground' | 'floor-bottom' | 'floor-top' | 'ceiling' | 'roof-bottom' | 'roof-top';
export type ModuleRef = 'mid' | 'side0' | 'side1';

export type CutRef = { kind: 'level'; ref: LevelRef } | { kind: 'module'; ref: ModuleRef } | { kind: 'absolute' };

export type CutAxis = 'horizontal' | 'long' | 'short' | 'x' | 'z' | 'custom';

export interface CutPlane {
  id: string;
  /** « A » ⇒ titre « Coupe A-A » et repère sur les plans */
  label?: string;
  /** module : la coupe est posée dans chaque Viewbox, à sa propre référence */
  frame: 'world' | 'module';
  /** horizontal ; long = coupe longitudinale (plan parallèle au grand côté) ; short = transversale ; x / z = monde */
  axis: CutAxis;
  ref: CutRef;
  /** mm, signé, depuis la référence (le long de la normale positive) */
  offset: number;
  /** côté gardé, par rapport à la normale positive (horizontal : positive = au-dessus) */
  keep: 'positive' | 'negative';
  /** profondeur de vue au-delà du plan (mm) ; absente = illimitée */
  depth?: number;
  custom?: { point: Vec3; normal: Vec3 };
}

export interface SectionBox {
  frame: 'world' | 'module';
  /** « Entrer dans VBX-03 » : la boîte suit cette Viewbox (repère module) */
  moduleId?: string;
  /** garde l'intérieur ; repère module : x, y en plan dans le repère de la Viewbox, z = hauteur */
  min: Vec3;
  max: Vec3;
}

export type VisibilityOp = 'hide' | 'show' | 'ghost' | 'isolate';

/** Champs combinés en ET ; valeurs d'un même tableau en OU. */
export interface ViewMatch {
  /** « cette pièce seulement » (identifiant de nœud, change d'une version du modèle à l'autre) */
  nodeIds?: string[];
  /** chemin dans la définition de la Viewbox : même pièce dans toutes les Viewbox de cette définition */
  modulePaths?: string[];
  /** nom exact de définition SketchUp */
  definitions?: string[];
  /** étiquettes de vue (« plafond-tendu ») */
  viewTags?: string[];
  /** catégories du SceneIndex (lecture seule) */
  categories?: string[];
  moduleIds?: string[];
  articleRefs?: string[];
  common?: boolean;
}

export interface VisibilityRule {
  id: string;
  op: VisibilityOp;
  match: ViewMatch;
  /** texte de la pastille : « Plafond tendu — toutes les Viewbox » */
  label: string;
  source: 'click' | 'preset' | 'ai' | 'sketchup';
}

export type LayoutMode = 'assembled' | 'exploded' | 'per-module' | 'assembled+exploded';

export interface ViewLayout {
  mode: LayoutMode;
  /** mm entre Viewbox séparées */
  gap: number;
  /** séparées en gardant rangées / colonnes ; sinon grille compacte */
  keepArrangement: boolean;
  columns?: number;
  /** étages séparés eux aussi (un bloc par niveau), ou filtrés par scope.levels */
  levels: 'separate' | 'filter';
  /** chaque Viewbox : Viewbox identiques regroupées (un seul bloc, un seul calcul) */
  groupIdentical: boolean;
  labels: 'none' | 'id' | 'id+type';
  /** éléments communs en mode séparé */
  common: 'hide' | 'keep-in-place';
}

/**
 * Remplissage des pièces coupées : par matériau (acier noir plein à 1:50 et au-delà, hachuré en dessous ; bois
 * hachuré ; verre vide ; autres gris clair), dessin d'architecte (traits seulement : hachures par matériau, aucun
 * aplat), noir plein, hachures, rien.
 */
export type CutFill = 'by-material' | 'drawing' | 'solid' | 'hatch' | 'none';

export interface ViewStyle {
  cutFill: CutFill;
  /** épaisseur du trait de coupe (mm papier) */
  cutLine: number;
  /** éléments au-delà du plan */
  beyond: 'normal' | 'thin';
  /** lignes cachées en pointillé */
  hidden: boolean;
  /** gris des éléments fantôme (0 noir à 1 blanc) */
  ghostTone: number;
  /** calque catégorie existant (vues de dessus) */
  categoryColors: boolean;
}

export interface CustomViewSpec {
  v: 1;
  id: string;
  name: string;
  source: 'user' | 'preset' | 'ai' | 'sketchup';
  presetKey?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  scope: {
    modules: 'all' | string[];
    /** niveaux gardés (absent = tous) */
    levels?: number[];
    /** éléments communs (hors Viewbox) */
    common: boolean;
  };
  camera: ViewCamera;
  /** 0 à 6 */
  cuts: CutPlane[];
  box?: SectionBox;
  /** dans l'ordre : la dernière règle qui touche un nœud gagne */
  visibility: VisibilityRule[];
  layout: ViewLayout;
  style: ViewStyle;
  /** render = image 3D ombrée (VS7, optionnel) */
  output: 'vector' | 'render';
}

export const MAX_CUTS = 6;

export const DEFAULT_CAMERA: ViewCamera = { frame: 'world', dir: 'top', rotate: 0, mirror: false };

export const DEFAULT_LAYOUT: ViewLayout = {
  mode: 'assembled',
  gap: 1000,
  keepArrangement: true,
  levels: 'separate',
  groupIdentical: true,
  labels: 'id',
  common: 'hide',
};

export const DEFAULT_STYLE: ViewStyle = {
  cutFill: 'by-material',
  cutLine: 0.5,
  beyond: 'normal',
  hidden: false,
  ghostTone: 0.75,
  categoryColors: false,
};

/** Étiquette de vue mémorisée (app_settings › plans.viewTags) : une définition / référence / un motif de nom → une étiquette. */
export interface ViewTagRule {
  tag: string;
  label: string;
  match: { definition?: string; articleRef?: string; namePattern?: string };
  by?: string;
  at?: string;
}

/** Étiquette de la base (code) : motifs de nom et / ou catégories propres. */
export interface BaseViewTag {
  tag: string;
  label: string;
  /** motifs (sans accents, majuscules indifférentes) cherchés dans la définition, le nom d'origine, le nom, la désignation */
  patterns?: string[];
  /** catégories propres du nœud (pas héritées d'un parent) */
  categories?: string[];
  categoryPrefixes?: string[];
}

export interface CustomViewWarning {
  code: 'RULE_NO_EFFECT' | 'REF_FALLBACK' | 'SECTION_OPEN' | 'MODULE_MISSING' | 'CUT_IGNORED' | 'EMPTY';
  message: string;
  ruleId?: string;
  nodeIds?: string[];
}
