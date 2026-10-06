// Bibliothèque structure (types) : ce que l'outil « sait » d'un type de pièce, d'une section, d'un assemblage…,
// partagé entre projets (table struct_library_items, phase S3). Chaque donnée garde sa source (rapport et page).
import type { Section } from './catalog';

export type LibraryKind = 'module_type' | 'part_type' | 'material' | 'section' | 'connection' | 'spreading' | 'stock' | 'joint_design';

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
  /** clé de type complète (« def:… » nom de définition, « name:…|empreinte ») */
  definition?: string;
  /** empreinte géométrique (correspondance « probable » seulement) */
  fingerprint?: string;
  /** type de module (« TYPE:… » saisi dans SketchUp, « SIZE:5900x2500 ») */
  moduleType?: string;
}

interface EntryBase {
  kind: LibraryKind;
  key: string;
  name: string;
  status: LibraryStatus;
  source: LibrarySource[];
  match?: LibraryMatch;
  notes?: string[];
  /** entrée désactivée (ignorée par la reconnaissance et les calculs) */
  disabled?: boolean;
  /** d'où vient l'entrée : base de départ du module, base modifiée en ligne, ajoutée par un utilisateur */
  origin?: 'seed' | 'override' | 'user';
  /** identifiant en base (entrées enregistrées) */
  id?: string;
  confirmedAt?: string;
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
  unit: 'N' | 'N·mm' | 'N/mm' | 'N·mm/rad' | 'mm' | 'mm²' | 'mm³' | 'N/mm²' | '-';
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
  /** contacts verticaux entre Viewbox empilées, le long des grands côtés (abscisses ; SCIA Druckkontakt_vertikal) */
  verticalContactX?: number[];
  /** écart entre deux modules juxtaposés (mm) */
  gap: number;
  sections: {
    /** rives et traverses / lisses du plancher */
    rim: string;
    secondary: string;
    /** rives et traverses / lisses de toiture (absent = celles du plancher, comme les notes statico) */
    rimRoof?: string;
    secondaryRoof?: string;
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
    /** appuis verticaux (compression seule) : N/mm ; absent = appui rigide */
    supportVertical?: number;
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
  /** poids d'une unité (planchers et isolants compris, sans murs) — contrôle du gabarit ± 10 % */
  weighedN?: number;
}

export interface MaterialEntry extends EntryBase {
  kind: 'material';
  /** matériau du catalogue du module (clé) ; « PANEL » = panneau composé ci-dessous */
  material: string;
  /** panneau composé (murs, habillages) : couches et cadre, poids surfacique calculé par l'outil */
  panel?: import('./composite').CompositePanel;
}

/** Rôle d'un type de pièce dans le calcul (§5.4). */
export type PartRole = 'structural' | 'load' | 'wind' | 'ignored';

export type PartNature =
  | 'viewbox'
  | 'beam'
  | 'column'
  | 'bracing'
  | 'deck'
  | 'stair'
  | 'landing'
  | 'terrace'
  | 'railing'
  | 'wall'
  | 'glazing'
  | 'door'
  | 'sign'
  | 'ballast'
  | 'spreading-plate'
  | 'decor'
  | 'other';

export const ROLE_LABEL: Record<PartRole, string> = {
  structural: 'Élément porteur',
  load: 'Charge uniquement',
  wind: 'Surface au vent uniquement',
  ignored: 'Non structurel / ignorer',
};

export const NATURE_LABEL: Record<PartNature, string> = {
  viewbox: 'Viewbox (gabarit)',
  beam: 'Poutre',
  column: 'Poteau',
  bracing: 'Contreventement (traction seule)',
  deck: 'Plancher / platelage',
  stair: 'Escalier',
  landing: 'Palier',
  terrace: 'Terrasse',
  railing: 'Garde-corps',
  wall: 'Mur plein',
  glazing: 'Vitrage',
  door: 'Porte',
  sign: 'Logo / enseigne',
  ballast: 'Lest',
  'spreading-plate': 'Plaque de répartition',
  decor: 'Décor / mobilier',
  other: 'Autre',
};

export const NATURES_BY_ROLE: Record<PartRole, PartNature[]> = {
  structural: ['viewbox', 'beam', 'column', 'bracing', 'deck', 'stair', 'landing', 'terrace', 'other'],
  load: ['wall', 'glazing', 'door', 'railing', 'sign', 'ballast', 'deck', 'other'],
  wind: ['sign', 'wall', 'other'],
  ignored: ['decor', 'spreading-plate', 'other'],
};

/** Natures porteuses calculées par un gabarit de la bibliothèque (pas de section à saisir). */
export const TEMPLATE_NATURES: ReadonlySet<PartNature> = new Set<PartNature>(['viewbox', 'stair', 'landing', 'terrace']);

export type WeightUnit = 'kg/m' | 'kg/m²' | 'kg';

export interface PartConnection {
  kind: 'fixed' | 'pinned' | 'bolted' | 'welded' | 'contact';
  bolts?: { count: number; diameter: number; grade: string };
}

/** Ce que l'utilisateur (ou la bibliothèque, ou une proposition) dit d'un type de pièce. */
export interface PartAssignment {
  role: PartRole;
  nature: PartNature;
  material?: string;
  /** section de la bibliothèque (clé) */
  section?: string;
  weight?: { value: number; unit: WeightUnit };
  /** ferme la face au vent (murs, vitrages, portes) */
  windClosed?: boolean;
  connection?: PartConnection;
  /** gabarit de module de la bibliothèque (Viewbox) */
  moduleTemplate?: string;
  note?: string;
}

export interface PartTypeEntry extends EntryBase {
  kind: 'part_type';
  assignment: PartAssignment;
  /** nombre de triangles du type mémorisé (tolérance ± 5 % sur l'empreinte) */
  triangles?: number;
  /** catégorie du classement au moment de la confirmation */
  category?: string | null;
}

/** Accessoire / liaison personnalisée (atelier des accessoires, S11) : pièce décrite par ses composants. */
export interface JointDesignEntry extends EntryBase {
  kind: 'joint_design';
  design: import('./jointDesign').JointDesign;
}

export type LibraryEntry = SectionEntry | ConnectionEntry | SpreadingEntry | StockEntry | ModuleTypeEntry | MaterialEntry | PartTypeEntry | JointDesignEntry;

/**
 * Désignation technique d'une section ou d'un matériau de la bibliothèque, sans sa description d'usage :
 * « UNP 220 (rives plancher / toiture) » → « UNP 220 » ; « Réception de pied d’angle (T soudé 215 × 10 / 130 × 15, …) »
 * → « T soudé 215 × 10 / 130 × 15 ».
 */
export function designation(name: string): string {
  const m = name.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!m) return name;
  const t = m[2].match(/T soudé [^,]*/);
  if (t && !/^(UNP|UPE|IPE|HE[ABM]|QHP|RHP|SHS|RHS|CHS|QRO|RD|Plat|U plié|C plié)/.test(m[1])) return t[0];
  return m[1];
}
