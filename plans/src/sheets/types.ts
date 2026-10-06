// Modèle de document des planches (§10.1) : un jeu de plans = un cartouche + des planches ; une planche = une pile
// d'éléments positionnés en mm papier. Les fenêtres de vue ne stockent pas de traits, seulement leur demande au moteur
// 2D (LineworkRequest) : les traits sont recalculés (et mis en cache) à l'ouverture.
import type { LineworkRequest } from '../linework/types';
import type { Vec3 } from '../core/views';

export type Paper = 'A1' | 'A3';

export interface RectMm {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PointMm {
  x: number;
  y: number;
}

export interface Person {
  name: string;
  email: string;
}

/** Champs du cartouche (§3.2), pré-remplis depuis le projet VEM, modifiables. */
export interface TitleBlockData {
  client: string;
  address: string;
  projectName: string;
  projectNumber: string;
  projectDate: string;
  issue: string;
  salesEngineer: Person;
  technicalManager: Person;
  projectManager: Person;
  drawnBy: string;
  createdDate: string;
  drawingVersion: string;
  deadline: string;
  /** description (bandeau de la couverture) */
  description: string;
}

/** Calques de l'éditeur : on peut en masquer ou en verrouiller. */
export type LayerKey = 'drawing' | 'annotations';

interface ItemBase {
  id: string;
  locked?: boolean;
}

/** Plaque de calage dessinée à l'échelle sur un plan (étude structure) : emprise et étiquette, coordonnées monde (mm). */
export interface CalagePlateSpec {
  id: string;
  /** « 2 × 55 × 55 × 40 mm » */
  label: string;
  /** « Rz,k 54 kN » */
  sub?: string;
  color: string;
  /** contour en plan (monde, mm, Y vers le haut) */
  corners: Vec3[];
  /** point d'attache de l'étiquette (centre du groupe d'appuis) */
  at: Vec3;
}

/** Niveau du sol relevé sous un pied (plan de calage) : repère ▽ avec sa valeur et la rehausse à apporter. */
export interface LevelMarkSpec {
  id: string;
  /** « −15 » (mm) */
  text: string;
  /** « ↑15 » */
  sub?: string;
  color: string;
  /** pied (monde, mm, Y vers le haut) */
  at: Vec3;
}

/** Unité montrée sur une vue de l'ensemble : ses Viewbox, encadrées, avec son nom. */
export interface UnitOverlaySpec {
  name: string;
  moduleIds: string[];
}

export interface ViewportItem extends ItemBase {
  type: 'viewport';
  rect: RectMm;
  request: LineworkRequest;
  /** échelle : 50 = 1:50 */
  scale: number;
  /** point du dessin (mm modèle) placé au centre du cadre ; défaut = centre de l'encombrement de la vue */
  center?: [number, number];
  label?: string;
  showLabel: boolean;
  /** position du titre de vue (mm papier) ; défaut = au-dessus à gauche du cadre */
  labelPos?: PointMm;
  /** hauteur du titre de vue (mm papier) ; défaut = titre de planche Viewbox */
  labelSize?: number;
  renderStyle: 'trait';
  /**
   * contour de chaque Viewbox (plan d'implantation), numéros de Viewbox (plan d'assemblage), cadre + nom de chaque
   * unité (vue aérienne de l'ensemble)
   */
  overlays?: { moduleOutlines?: boolean; moduleNumbers?: boolean; statusColors?: Record<string, string>; units?: UnitOverlaySpec[]; hideUnits?: boolean; calage?: CalagePlateSpec[]; levels?: LevelMarkSpec[] };
  /** clé du calcul utilisé pour le rendu : si elle ne correspond plus, la vue est obsolète */
  lineworkKey?: string;
}

export interface Image3dItem extends ItemBase {
  type: 'image3d';
  rect: RectMm;
  /** capture enregistrée (PNG) */
  url: string;
  width: number;
  height: number;
  label?: string;
  showLabel?: boolean;
  labelPos?: PointMm;
  labelSize?: number;
}

export interface LabelItem extends ItemBase {
  type: 'label';
  /** repère attaché à une fenêtre de vue : ancré sur un point 3D du modèle (il suit la vue) */
  viewportId?: string;
  anchor3d?: Vec3;
  /** sinon ancré sur un point de la planche */
  anchorPaper?: PointMm;
  textPos: PointMm;
  text: string;
  style: 'bold' | 'normal';
}

/**
 * Cote associative (§9.1) : ancrée sur des points 3D du modèle vus dans une fenêtre de vue ; sa valeur est calculée
 * à partir de la géométrie et elle suit la vue (échelle, cadrage, recalcul).
 */
export interface DimensionItem extends ItemBase {
  type: 'dimension';
  viewportId: string;
  /** linéaire (2 points) ou en chaîne (n points alignés sur une même ligne de cote) */
  kind: 'linear' | 'chain';
  /** horizontale / verticale (dans le dessin) ou alignée sur les deux points */
  orient: 'h' | 'v' | 'aligned';
  anchors3d: Vec3[];
  /**
   * distance (mm papier) de la ligne de cote aux points d'ancrage, perpendiculairement : négative = au-dessus / à
   * gauche du point le plus haut / le plus à gauche, positive = en dessous / à droite du point le plus bas / à droite
   */
  offsetMm: number;
  /** texte imposé (affiché en italique, signalé) */
  textOverride?: string;
  ends?: 'tick' | 'arrow';
  /** créée par « Coter automatiquement » (remplacée si on relance) */
  auto?: boolean;
}

export interface TextItem extends ItemBase {
  type: 'text';
  rect: RectMm;
  text: string;
  /** hauteur de texte (mm papier) */
  size: number;
  bold?: boolean;
  font?: 'serif' | 'sans';
  align?: 'left' | 'center' | 'right';
}

export interface ShapeItem extends ItemBase {
  type: 'shape';
  rect: RectMm;
  shape: 'rect' | 'line';
  strokeMm: number;
  stroke?: string;
  fill?: string;
}

export interface LogoItem extends ItemBase {
  type: 'logo';
  rect: RectMm;
  logo: 'vb' | 'wordmark';
}

/** Détail type (dessin fixe et vectoriel de la bibliothèque `details/`), placé à l'échelle de son cadre. */
export interface DetailItem extends ItemBase {
  type: 'detail';
  rect: RectMm;
  /** identifiant dans DETAILS */
  detail: string;
  label?: string;
  showLabel?: boolean;
  labelPos?: PointMm;
  labelSize?: number;
}

export type SheetItem = ViewportItem | Image3dItem | LabelItem | DimensionItem | TextItem | ShapeItem | LogoItem | DetailItem;
export type BoxItem = Exclude<SheetItem, LabelItem | DimensionItem>;

export interface Sheet {
  id: string;
  /** « A0.1 » */
  number: string;
  /** « Extract - Plan View - VBX Unit 12 » */
  title: string;
  paper: Paper;
  orientation: 'landscape';
  /** couverture : bandeau bas sans colonne cartouche */
  kind: 'standard' | 'cover';
  /** unité de l'installation (série A1.x, A2.x…) ; absent = vue d'ensemble (série A0.x) */
  unit?: number;
  items: SheetItem[];
}

/** Unité d'un jeu de plans séparé en unités (Viewbox espacées de plus de 2,5 m). */
export interface DrawingSetUnit {
  n: number;
  name: string;
  moduleIds: string[];
  /** éléments communs rattachés à l'unité */
  commonIds: string[];
}

export interface DrawingSet {
  id: string;
  projectId: string;
  modelVersionId: string | null;
  /** empreinte du modèle source (les fenêtres de vue en dépendent) */
  modelKey: string;
  title: string;
  templateId: 'viewbox';
  titleBlock: TitleBlockData;
  /** texte « GENERAL NOTES VIEWBOX » */
  notes: string;
  sheets: Sheet[];
  /** unités de l'installation, quand le jeu est séparé en unités */
  units?: DrawingSetUnit[];
  /** incrémentée à l'export officiel (P5) */
  revision: number;
  /** valeurs du projet VEM lors de la dernière reprise dans le cartouche (détecte ce qui a changé depuis) */
  projectSync?: { at: string; values: Partial<Pick<TitleBlockData, 'client' | 'address' | 'projectName' | 'projectNumber' | 'projectDate' | 'salesEngineer' | 'technicalManager' | 'projectManager'>> };
  updatedAt: string;
}

export const EMPTY_PERSON: Person = { name: '', email: '' };

export function emptyTitleBlock(): TitleBlockData {
  return {
    client: '',
    address: '',
    projectName: '',
    projectNumber: '',
    projectDate: '',
    issue: '',
    salesEngineer: { ...EMPTY_PERSON },
    technicalManager: { ...EMPTY_PERSON },
    projectManager: { ...EMPTY_PERSON },
    drawnBy: '',
    createdDate: '',
    drawingVersion: '1',
    deadline: '',
    description: '',
  };
}

export function hasRect(i: SheetItem): i is BoxItem {
  return i.type !== 'label' && i.type !== 'dimension';
}
