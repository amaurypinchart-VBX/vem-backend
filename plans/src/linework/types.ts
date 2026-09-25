// Couture d'architecture « LineworkProvider » : l'éditeur de planches ne dépend jamais directement de
// three-edge-projection. Il demande des traits 2D (en mm modèle) pour un sous-ensemble du modèle et une vue.
import type { ViewBasis, ViewSpec } from '../core/views';

export interface LineStyleSpec {
  /** angle (°) entre deux faces au-delà duquel leur arête commune est dessinée */
  angleThresholdDeg: number;
  /** dessiner les lignes cachées (pointillés) */
  hiddenLines: boolean;
  /** les vitrages ne cachent pas ce qu'il y a derrière (leurs arêtes restent dessinées) */
  glassTransparent: boolean;
  /** arêtes d'intersection entre objets qui se traversent (SketchUp/LayOut ne les dessine pas) */
  intersectionEdges: boolean;
  /** échelle visée (50 = 1:50) : sert au seuil des détails fins */
  scaleDenominator: number;
  /** un objet dont la projection fait moins que ce seuil (mm papier) passe en « détail fin » (trait fin) */
  fineThresholdPaperMm: number;
  /** un objet plus petit que ce seuil (mm papier) n'est pas dessiné (il cache toujours ce qu'il y a derrière) */
  detailMinPaperMm: number;
  /** trait épais de couleur le long de la face du module qui porte l'accessoire (vues de dessus) */
  colorByCategory: boolean;
}

export const DEFAULT_LINE_STYLE: LineStyleSpec = {
  angleThresholdDeg: 30,
  hiddenLines: false,
  glassTransparent: true,
  intersectionEdges: false,
  scaleDenominator: 50,
  fineThresholdPaperMm: 1,
  detailMinPaperMm: 0.3,
  colorByCategory: false,
};

export interface LineworkSubset {
  /** nœuds visibles (Viewbox, accessoires, éléments communs) ; tout le reste est masqué */
  include: string[];
  /** catégories masquées en plus (ex. TOIT pour voir l'intérieur en plan) */
  hideCategories?: string[];
}

export interface LineworkRequest {
  modelId: string;
  subset: LineworkSubset;
  view: ViewSpec;
  style: LineStyleSpec;
}

export type LayerKey = 'silhouette' | 'visible' | 'fine' | 'hidden' | `category:${string}`;

export interface LineworkLayer {
  key: LayerKey;
  /** [x0, y0, x1, y1, …] en mm modèle, repère du dessin (x à droite, y en haut) */
  polylines: Float64Array[];
  /** objet d'origine de chaque polyligne (même ordre) */
  sourceNodeIds?: string[];
}

export interface Linework2D {
  boundsMm: { minX: number; minY: number; maxX: number; maxY: number };
  layers: LineworkLayer[];
  snapPoints: Float64Array;
  meta: {
    provider: string;
    durationMs: number;
    segmentCount: number;
    cacheKey: string;
    /** base de la vue : point du dessin (x, y) + profondeur → point 3D (cotes associatives) */
    basis: ViewBasis;
    /** nombre d'objets projetés */
    objectCount: number;
    /** segments visibles avant nettoyage 2D */
    rawSegmentCount?: number;
    /** durée de chaque étape du calcul */
    timingsMs?: Record<string, number>;
  };
}

export interface LineworkProvider {
  id: 'browser-hlr' | 'sketchup-export';
  getLinework(req: LineworkRequest, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Linework2D>;
}

/** Priorités des calques de traits (en cas de superposition, le plus grand gagne). */
export const PRIO = { hidden: 0, fine: 1, visible: 2, silhouette: 3 } as const;
export const PRIO_LAYER: Record<number, LayerKey> = { 0: 'hidden', 1: 'fine', 2: 'visible', 3: 'silhouette' };
