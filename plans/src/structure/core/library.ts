// Bibliothèque structure (types) : ce que l'outil « sait » d'un type de pièce, d'une section, d'un assemblage…,
// partagé entre projets (table struct_library_items, phase S3). Chaque donnée garde sa source (rapport et page).
import type { Section } from './catalog';

export type LibraryKind = 'module_type' | 'part_type' | 'material' | 'section' | 'connection' | 'spreading' | 'stock';

/** known = confirmé par un humain ; suggested = proposé (heuristique, IA, données non vérifiées) ; unknown = à renseigner */
export type LibraryStatus = 'known' | 'suggested' | 'unknown';

export interface LibrarySource {
  /** « report:24-0571 », « drawing:7-364-27 », « standard:DIN EN 1993-1-1 », « user », « ai » */
  ref: string;
  /** page ou paragraphe (« A22 », « B5 », « § 3.12 ») */
  page?: string;
  note?: string;
}

/** Clés de correspondance d'un type de pièce du modèle SketchUp (ordre de priorité §5.2). */
export interface LibraryMatch {
  structRef?: string;
  articleRef?: string;
  definition?: string;
  fingerprint?: string;
}

interface EntryBase {
  kind: LibraryKind;
  key: string;
  name: string;
  status: LibraryStatus;
  source: LibrarySource[];
  match?: LibraryMatch;
  notes?: string[];
}

export interface SectionEntry extends EntryBase {
  kind: 'section';
  section: Section;
  /** matériau par défaut (prudent) et matériau du « calage statico » s'il diffère */
  material: string;
  calibrationMaterial?: string;
  /** courbes de flambement du « calage statico » (annexe SCIA) si elles diffèrent des courbes par défaut */
  calibrationCurves?: { y: Section['curveY']; z: Section['curveZ'] };
}

/** Résistance de calcul d'un assemblage (N ou N·mm), avec la formule telle qu'écrite dans la source. */
export interface Capacity {
  key: string;
  label: string;
  value: number;
  unit: 'N' | 'N·mm' | 'N/mm' | 'N·mm/rad' | '-';
  formula?: string;
  source: LibrarySource;
}

export interface ConnectionEntry extends EntryBase {
  kind: 'connection';
  composition: string;
  capacities: Capacity[];
  /** règle de vérification (texte + clé de la fonction de vérification, phase S5) */
  rule?: { check: string; text: string };
}

export interface SpreadingEntry extends EntryBase {
  kind: 'spreading';
  material: string;
  /** épaisseurs du commerce (mm) */
  thicknesses: number[];
  /** épaisseur mini d'une plaque (mm), pas de côté et d'épaisseur (mm) */
  minThickness: number;
  sideStep: number;
  thicknessStep: number;
  kmod: number;
  gammaM: number;
}

export interface StockItem {
  material: string;
  /** dimensions (mm) */
  length: number;
  width: number;
  thickness: number;
  quantity: number;
}

export interface StockEntry extends EntryBase {
  kind: 'stock';
  items: StockItem[];
}

/** Paramètres du gabarit filaire d'une Viewbox (repère local du module, mm) — utilisés en phase S4. */
export interface ViewboxTemplateParams {
  /** lignes de système des rives : x ∈ [x0, x1], y ∈ [y0, y1] */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** cotes des lignes de système : plancher, toiture, haut de poteau (= plancher du module du dessus) */
  floorZ: number;
  roofZ: number;
  topZ: number;
  /** traverses (selon y) aux abscisses x, lisses (selon x) aux ordonnées y */
  transverseX: number[];
  longitudinalY: number[];
  /** réceptions de pied : nœud décalé vers l'intérieur (mm) ; réception centrale des grands côtés */
  footOffset: number;
  middleFootX: number;
  /** boulons horizontaux entre modules voisins : abscisses sur les grands côtés, ordonnées sur les petits */
  boltLongX: number[];
  boltShortY: number[];
  /** écart entre deux modules juxtaposés (mm) */
  gap: number;
  sections: {
    rim: string;
    secondary: string;
    column: string;
    footCorner: string;
    footPlate: string;
    footMiddle: string;
    cornerLink: string;
    bolt: string;
    contact: string;
  };
  springs: {
    /** poteau / cadre (deux extrémités, rotations de flexion) : N·mm/rad */
    columnRotation: number;
    /** liaison d'angle entre modules empilés (cisaillement) : N/mm */
    cornerLinkShear: number;
    /** boulons horizontaux (translations) : N/mm */
    boltTranslation: number;
    /** appuis horizontaux (glissement sur la plaque de calage) : N/mm */
    supportHorizontal: number;
  };
  plywood: { floorLayers: number; roofLayers: number; thickness: number; material: string; maxSpan: number };
}

export interface ModuleTypeEntry extends EntryBase {
  kind: 'module_type';
  /** gabarit de calcul (null = inconnu : l'outil demande) */
  template: 'viewbox-eu' | 'viewbox-us' | null;
  params?: ViewboxTemplateParams;
  /** dimensions nominales en plan et hauteur hors tout (mm) */
  nominal: { long: number; short: number; height: number };
  /** poids pesé d'une unité nue (toit + plancher + poteaux, sans murs) — contrôle du gabarit ± 10 % */
  weighedN?: number;
}

export interface MaterialEntry extends EntryBase {
  kind: 'material';
  material: string;
}

export interface PartTypeEntry extends EntryBase {
  kind: 'part_type';
  role: 'structural' | 'load' | 'wind' | 'ignored';
  nature: string;
}

export type LibraryEntry = SectionEntry | ConnectionEntry | SpreadingEntry | StockEntry | ModuleTypeEntry | MaterialEntry | PartTypeEntry;
