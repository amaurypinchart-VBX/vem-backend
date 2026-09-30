// Modèle filaire 3D pour le solveur (éléments finis de barres, 6 ddl par nœud). Unités : N, mm, N/mm², rad.
// Repère global = celui du SceneIndex : mm, Y vers le haut (le rapport affiche Z vers le haut).
// Ordre des ddl d'un nœud : ux, uy, uz, rx, ry, rz.

export type Vec3 = [number, number, number];
export type Vec6 = [number, number, number, number, number, number];

/**
 * Liaison d'une extrémité de barre, par ddl local (ux, uy, uz, rx, ry, rz) :
 * 'rigid' = encastré au nœud, 'free' = relâché, nombre = ressort (N/mm en translation, N·mm/rad en rotation).
 */
export type EndDof = 'rigid' | 'free' | number;
export type EndSpec = [EndDof, EndDof, EndDof, EndDof, EndDof, EndDof];

export const RIGID_END: EndSpec = ['rigid', 'rigid', 'rigid', 'rigid', 'rigid', 'rigid'];
/** rotule : rotations de flexion libres, torsion et translations transmises */
export const PINNED_END: EndSpec = ['rigid', 'rigid', 'rigid', 'rigid', 'free', 'free'];

export interface FemNode {
  id: string;
  /** coordonnées globales (mm) */
  x: number;
  y: number;
  z: number;
}

export interface FemMember {
  id: string;
  /** indices des nœuds de départ et d'arrivée */
  i: number;
  j: number;
  /** module d'Young et module de cisaillement (N/mm²) */
  E: number;
  G: number;
  /** section : aire (mm²), inerties de flexion autour des axes locaux y (forte) et z (faible), torsion (mm⁴) */
  A: number;
  Iy: number;
  Iz: number;
  It: number;
  /** 'beam' = poutre (défaut) ; 'truss' = barre articulée ne reprenant que l'effort normal */
  kind?: 'beam' | 'truss';
  /**
   * vecteur de référence de l'axe local z (défaut : Y global, vers le haut ; pour une barre verticale : X global).
   * L'axe local x va du nœud i au nœud j, z = composante de `ref` orthogonale à x, y = z × x.
   */
  ref?: Vec3;
  /** rotation supplémentaire des axes locaux y, z autour de x (rad) */
  roll?: number;
  endI?: EndSpec;
  endJ?: EndSpec;
  /** barre active seulement en traction (contreventement) ou en compression (contact) */
  nonlinear?: 'tensionOnly' | 'compressionOnly';
  /** false = barre de liaison équivalente (boulon, contact de 10 mm) : pas de rigidité géométrique au 2ᵉ ordre */
  geometric?: boolean;
  /** découpage interne en n éléments (effet P-δ au 2ᵉ ordre, efforts intermédiaires) */
  segments?: number;
  /** famille (rive, poteau, liaison…) : sert au rapport et aux vérifications */
  tag?: string;
}

/** Appui d'un ddl global : libre, bloqué, ou ressort (N/mm, N·mm/rad). */
export type SupportDof = 'free' | 'fixed' | number;

export interface FemSupport {
  node: number;
  /** ux, uy, uz, rx, ry, rz dans le repère global */
  dofs: [SupportDof, SupportDof, SupportDof, SupportDof, SupportDof, SupportDof];
  /** appui en compression seule : la réaction verticale ne peut être que vers le haut (+Y) */
  compressionOnly?: boolean;
  /** si l'appui se soulève : 'vertical' = seul uy est libéré ; 'all' = les translations aussi (défaut, prudent) */
  upliftReleases?: 'vertical' | 'all';
}

export interface FemModel {
  nodes: FemNode[];
  members: FemMember[];
  supports: FemSupport[];
}

/** Force (N) et moment (N·mm) appliqués à un nœud, repère global. */
export interface NodalLoad {
  node: number;
  f: Vec6;
}

/** Direction d'une charge sur barre : axes locaux (x, y, z) ou globaux (X, Y, Z). */
export type LoadDir = 'x' | 'y' | 'z' | 'X' | 'Y' | 'Z';

export interface DistributedLoad {
  member: number;
  kind: 'distributed';
  dir: LoadDir;
  /** intensité au début et à la fin du tronçon chargé (N/mm par mm de barre) */
  q1: number;
  q2?: number;
  /** tronçon chargé, distances depuis le nœud i (mm) ; défaut toute la barre */
  a?: number;
  b?: number;
  /** charge globale donnée par mm de projection horizontale (neige, exploitation sur rampant) */
  projected?: boolean;
}

export interface PointLoad {
  member: number;
  kind: 'point';
  dir: LoadDir;
  /** force (N) */
  P: number;
  /** distance depuis le nœud i (mm) */
  a: number;
}

export type MemberLoad = DistributedLoad | PointLoad;

export interface LoadSet {
  id: string;
  nodal: NodalLoad[];
  member: MemberLoad[];
}

export interface AnalysisOptions {
  /** théorie du 2ᵉ ordre (P-Δ par la matrice de rigidité géométrique ; P-δ en découpant les barres) */
  secondOrder?: boolean;
  /** itérations maximales (non-linéarités + 2ᵉ ordre) */
  maxIterations?: number;
  /** convergence du 2ᵉ ordre : variation relative des déplacements */
  tolerance?: number;
  /** points de sortie des efforts par élément (≥ 2, extrémités comprises) */
  stations?: number;
  /**
   * contacts et appuis unilatéraux : effort résiduel admis (N) — une barre en compression seule tendue de moins que
   * cette valeur reste active. Défaut 1 N.
   */
  contactTolerance?: number;
}

export interface Station {
  /** abscisse depuis le nœud i de la barre (mm) */
  x: number;
  /** efforts internes, axes locaux : N (traction +), Vy, Vz, T (forces et moment de torsion exercés sur la partie
   * gauche par la partie droite), My et Mz positifs quand la fibre −z (resp. −y) est tendue — moment positif en travée
   * pour une poutre chargée vers le bas. Contrainte en un point (y, z) de la section : σ = N/A − My·z/Iy − Mz·y/Iz. */
  N: number;
  Vy: number;
  Vz: number;
  T: number;
  My: number;
  Mz: number;
}

export interface MemberResult {
  id: string;
  active: boolean;
  /** efforts d'extrémité exercés par les nœuds sur la barre, axes locaux (i puis j) */
  endForces: number[];
  stations: Station[];
}

export interface Reaction {
  node: number;
  /** force et moment exercés par l'appui sur la structure, repère global */
  R: Vec6;
  /** appui en compression seule soulevé */
  lifted: boolean;
}

export interface AnalysisResult {
  loadSet: string;
  /** déplacements des nœuds du modèle (6 par nœud, repère global) */
  displacements: Float64Array;
  reactions: Reaction[];
  members: MemberResult[];
  iterations: number;
  warnings: string[];
}

export type FemErrorCode = 'mechanism' | 'instability' | 'no-convergence' | 'invalid-model';

/** Erreur de calcul lisible (mécanisme, instabilité…) avec les nœuds concernés à surligner. */
export class FemError extends Error {
  constructor(
    readonly code: FemErrorCode,
    message: string,
    readonly nodes: string[] = [],
  ) {
    super(message);
    this.name = 'FemError';
  }
}
