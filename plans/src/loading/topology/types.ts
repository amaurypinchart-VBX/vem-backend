// Topologie d'une installation pour la loading liste : ce que l'app comprend du modèle (box, côtés, jonctions, îlots,
// pieds, façades, produits). Sérialisable ; chaque nombre garde sa provenance (ids de nœuds / modules / jonctions /
// côtés / pieds) pour le « Détail du calcul » et la mise en surbrillance dans la 3D. Plan = (x, z) monde en mm.
import type { CountingBase, GlazingRegime } from '../core/types';

export type P2 = [number, number];
export type SideKind = 'long' | 'short';
export type SideLabel = 'avant' | 'arriere' | 'gauche' | 'droite';

export interface BoxSide {
  /** « VBX-01:+x » */
  id: string;
  moduleId: string;
  local: '+x' | '-x' | '+y' | '-y';
  kind: SideKind;
  label: SideLabel;
  /** extrémités en plan (mm) et normale sortante unitaire */
  a: P2;
  b: P2;
  normal: P2;
  length: number;
  /** extérieur, intérieur (contre une box sur ≥ 80 %), ou en partie contre une box */
  exposure: 'exterieur' | 'interieur' | 'partiel';
  junctionIds: string[];
  elements: FacadeElement[];
  /** séquence le long du côté (de a vers b) : éléments et vides */
  sequence: SequenceItem[];
}

export type ElementKind = 'vitre' | 'mur' | 'porte';

export interface FacadeElement {
  nodeId: string;
  article?: string;
  category: string | null;
  kind: ElementKind;
  porte?: 'simple' | 'double' | 'coulissante';
  vitrage?: GlazingRegime;
  /** position le long du côté (mm depuis a) */
  start: number;
  end: number;
  /** nombre de panneaux équivalents (porte double = 2, coulissante = largeur / 1130) */
  panels: number;
}

export type SequenceItem = { type: 'element'; index: number } | { type: 'vide'; start: number; end: number };

export type JunctionKind = 'grand_cote' | 'petit_cote' | 'mixte';

export interface Junction {
  /** « J1 » */
  id: string;
  kind: JunctionKind;
  modules: [string, string];
  sides: [string, string];
  /** jeu entre les faces (mm) et longueur de contact */
  gap: number;
  overlap: number;
  /** contact / plus petit des deux côtés */
  ratio: number;
  /** décalé : contact < 80 % du plus petit côté */
  offset: boolean;
  /** les deux toits sont libres (rien posé dessus) : toits jointifs */
  roof: boolean;
  /** segment de contact en plan et hauteur (mm) pour l'affichage */
  segment: [P2, P2];
  y: [number, number];
}

export interface Foot {
  /** « F1 » */
  id: string;
  plan: P2;
  y: number;
  members: { moduleId: string; kind: 'angle' | 'milieu' }[];
  /** angle = que des coins de box, milieu = que des milieux, mixte sinon */
  kind: 'angle' | 'milieu' | 'mixte';
}

export interface FeetSource {
  moduleId: string;
  total: number | null;
  /** d'où vient le gabarit : référence de la box au catalogue, taille standard, inconnu */
  from: 'catalogue' | 'taille' | 'inconnu';
  ref?: string;
}

export interface Island {
  /** « I1 » */
  id: string;
  moduleIds: string[];
  regime: 'standalone' | 'connecte';
  covered: boolean;
  levels: number;
}

export interface ModuleTopo {
  id: string;
  level: number;
  /** contour en plan (4 coins) et hauteurs bas / haut (mm) */
  outline: P2[];
  y: [number, number];
  long: number;
  short: number;
  /** box posée dessus / dessous (empilage) */
  above: string[];
  below: string[];
  islandId: string;
  boxRef?: string;
}

export interface ProductLine {
  article: string;
  qty: number;
  /** nœuds retenus (une instance par pose) */
  nodeIds: string[];
  /** doublons miroir écartés (même réf. + même boîte à 5 mm) */
  mirrorIds: string[];
  /** comment la réf. a été trouvée */
  source: 'modele' | 'reponse' | 'memoire';
  inCatalogue: boolean;
}

export interface UnknownProduct {
  signature: string;
  label: string;
  category: string | null;
  nodeIds: string[];
  dims: [number, number, number];
}

export interface Count {
  value: number | null;
  ids: string[];
  detail: string;
  /** saisi à la main (valeur détectée gardée pour mémoire) */
  manual?: boolean;
  detected?: number | null;
}

export type Counts = Partial<Record<CountingBase, Count>>;

export interface TopologyWarning {
  code: string;
  text: string;
  ids?: string[];
}

export interface Topology {
  schema: 'vem-loading-topology/1';
  modules: ModuleTopo[];
  sides: BoxSide[];
  junctions: Junction[];
  islands: Island[];
  feet: Foot[];
  feetSources: FeetSource[];
  products: ProductLine[];
  unknown: UnknownProduct[];
  glazing: GlazingRegime[];
  levels: number;
  counts: Counts;
  islandCounts: Record<string, Counts>;
  warnings: TopologyWarning[];
}

/** Valeurs corrigées à la main (3D non conforme) : base de comptage → valeur. */
export type TopologyOverrides = Partial<Record<CountingBase, number>>;

export interface TopologyOptions {
  /** jeu maximal entre deux faces de box jointives (mm) */
  junctionGap: number;
  /** contact minimal pour une jonction (mm) */
  minContact: number;
  /** contact / plus petit côté en dessous duquel la jonction est « décalée » */
  alignedRatio: number;
  /** pieds fusionnés en dessous de cette distance (mm) */
  footMerge: number;
  /** distance maximale d'un élément de façade à son côté (mm) */
  facadeDistance: number;
  /** vide le long d'un côté au-delà de cette longueur (mm) */
  gapMin: number;
}

export const TOPOLOGY_DEFAULTS: TopologyOptions = {
  junctionGap: 50,
  minContact: 100,
  alignedRatio: 0.8,
  footMerge: 100,
  facadeDistance: 300,
  gapMin: 300,
};
