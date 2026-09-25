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
  /** contour de chaque Viewbox (plan d'implantation), numéros de Viewbox (plan d'assemblage) */
  overlays?: { moduleOutlines?: boolean; moduleNumbers?: boolean; statusColors?: Record<string, string> };
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

export type SheetItem = ViewportItem | Image3dItem | LabelItem | TextItem | ShapeItem | LogoItem;
export type BoxItem = Exclude<SheetItem, LabelItem>;

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
  items: SheetItem[];
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
  /** incrémentée à l'export officiel (P5) */
  revision: number;
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
  return i.type !== 'label';
}
