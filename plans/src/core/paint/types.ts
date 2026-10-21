// Peinture du projet : palette de couleurs (RAL + finition) et zones peintes sur le modèle. Donnée à côté du modèle
// (plans_model_versions.settings.paint, reprise à la version suivante) : le modèle, l'index de scène et la
// classification ne sont jamais modifiés. Une zone vise d'abord des clés stables d'une version à l'autre (chemin dans
// la définition de la Viewbox, définition SketchUp) ; la face est décrite dans le repère propre de la pièce.
export type Vec3 = [number, number, number];

export interface PaintSettings {
  v: 1;
  colors: PaintColor[];
  /** dans l'ordre : la dernière zone qui touche un triangle gagne (« repeindre ») */
  zones: PaintZone[];
  updatedAt: string;
  updatedBy?: string;
}

export type PaintSystem = 'RAL' | 'NCS' | 'Pantone' | 'fournisseur' | 'autre';
export type PaintFinish = 'mat' | 'satiné' | 'brillant' | 'texturé' | 'structuré';
export const PAINT_FINISHES: PaintFinish[] = ['mat', 'satiné', 'brillant', 'texturé', 'structuré'];

export interface PaintColor {
  id: string;
  /** « P1 » — attribué à la création, jamais renuméroté automatiquement */
  tag: string;
  /** « Noir Viewbox » */
  name: string;
  system: PaintSystem;
  /** '9005' */
  code?: string;
  /** couleur d'écran ('#0E0E10') — approchée, le code fait foi */
  hex: string;
  finish?: PaintFinish;
  product?: string;
  note?: string;
  createdAt: string;
  by?: string;
}

export interface PaintZone {
  id: string;
  colorId: string;
  target: PaintTarget;
  /** « VBX-03 › Poteau d'angle — face avant » */
  label: string;
  source: 'click' | 'duplicate' | 'import';
  createdAt: string;
  by?: string;
}

export interface PaintTarget {
  /** cette face · toutes les faces de ce côté · pièce entière */
  scope: 'face' | 'side' | 'node';
  match: PaintMatch;
  face?: FaceSelector;
}

/** Champs combinés en ET, valeurs d'un même tableau en OU (comme les règles des vues spéciales). */
export interface PaintMatch {
  /** identifiants de nœud — « cette pièce seulement » (ne survit pas à une nouvelle version du modèle) */
  nodeIds?: string[];
  /** même pièce dans toutes les Viewbox de la même définition (core/customViews/paths.ts) */
  modulePaths?: string[];
  /** restreint à ces Viewbox (« cette Viewbox seulement » = modulePaths + moduleIds) */
  moduleIds?: string[];
  /** « toutes les pièces de ce type » (définition SketchUp) */
  definitions?: string[];
}

/** Face dans le repère PROPRE de la pièce (= repère de sa définition SketchUp, en mm). */
export interface FaceSelector {
  /** normale unitaire, arrondie à 1e-4 */
  normal: Vec3;
  /** plan n·p = d (mm, arrondi 0,1) */
  d: number;
  /** point cliqué (mm) */
  seed: Vec3;
  /** angle de pli qui borne la face (défaut 30°) */
  creaseDeg: number;
  /** « côté » : toutes les faces dont la normale est à ≤ sideDeg de `normal` (défaut 30°) */
  sideDeg?: number;
}

/** Opération sur la peinture : appliquée côté serveur (PATCH /plans/models/:id/paint), fusion par id. */
export type PaintOp =
  | { op: 'color.put'; color: PaintColor }
  | { op: 'color.del'; id: string }
  | { op: 'zone.put'; zone: PaintZone }
  | { op: 'zone.del'; id: string };

export const DEFAULT_CREASE_DEG = 30;
export const DEFAULT_SIDE_DEG = 30;
/** Limites (même valeurs côté serveur) */
export const PAINT_LIMITS = { colors: 200, zones: 5000, bytes: 150_000 };

export const emptyPaint = (): PaintSettings => ({ v: 1, colors: [], zones: [], updatedAt: '' });
