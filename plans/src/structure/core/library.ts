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
  /**
   * structure explicite d'un type personnalisé (S12, gabarit 'frame') : barres, pieds, plancher, assemblages. Les
   * champs d'enveloppe ci-dessus restent remplis (déduits du frame) pour l'assemblage, les charges et le calage.
   */
  frame?: FrameLayout;
}

// ─── S12 : structure explicite d'un type de module (repère du gabarit : u grand côté, v petit côté, z vers le haut) ───

export type FrameRole =
  | 'rim-floor'
  | 'rim-roof'
  | 'transverse-floor'
  | 'transverse-roof'
  | 'stringer-floor'
  | 'stringer-roof'
  | 'column'
  | 'foot'
  | 'brace'
  | 'other'
  | 'none';

export const FRAME_ROLES: readonly FrameRole[] = ['rim-floor', 'rim-roof', 'transverse-floor', 'transverse-roof', 'stringer-floor', 'stringer-roof', 'column', 'foot', 'brace', 'other', 'none'];

export const FRAME_ROLE_LABEL: Record<FrameRole, string> = {
  'rim-floor': 'rive du plancher',
  'rim-roof': 'rive de toiture',
  'transverse-floor': 'traverse du plancher',
  'transverse-roof': 'traverse de toiture',
  'stringer-floor': 'lisse du plancher',
  'stringer-roof': 'lisse de toiture',
  column: 'poteau',
  foot: 'réception de pied',
  brace: 'diagonale',
  other: 'autre barre porteuse',
  none: 'non porteur',
};

/** extrémité d'une barre en flexion : rigide, articulée (torsion retenue) ou semi-rigide (N·mm/rad) */
export type FrameEnd = 'rigid' | 'pinned' | { semi: number };

export interface FrameBar {
  /** stable (« T-R-03 », ou id de la pièce SketchUp) */
  id: string;
  role: FrameRole;
  /** u, v, z sur la ligne de système (mm) */
  a: [number, number, number];
  b: [number, number, number];
  /** clé bibliothèque / catalogue (CAT-…, SEC-…, ETUDE-…) */
  section: string;
  /** S235 | S275 | S355 (sinon matériau de la section) */
  grade?: string;
  /** rotation de la section autour de son axe (rad) : profil posé à plat, U ouvert vers l'intérieur… */
  roll?: number;
  /** défaut selon le rôle et les assemblages du type */
  ends?: [FrameEnd, FrameEnd];
  /** diagonale en plat / câble : traction seule */
  tensionOnly?: boolean;
  /** rives et poteaux de façade */
  side?: 'u0' | 'u1' | 'v0' | 'v1';
  /** poteau d'angle (ordre des angles du gabarit : (x0, y0), (x1, y0), (x1, y1), (x0, y1)) */
  corner?: 0 | 1 | 2 | 3;
  /** réception de pied : T d'angle, plat, réception centrale (défaut : déduit de la position) */
  footPart?: 'corner' | 'plate' | 'middle';
  /** barre physique (longueurs de flambement, libellés) ; défaut déduit du rôle et de la position */
  line?: string;
  source?: { node?: string; definition?: string; name?: string; eccentricity?: number; sectionStatus: 'library' | 'catalogue' | 'measured' | 'user' };
}

export interface FrameFoot {
  id: string;
  u: number;
  v: number;
  kind: 'corner' | 'middle' | 'other';
  corner?: 0 | 1 | 2 | 3;
  /** nœud du plancher qui reçoit le pied (défaut : nœud de rive / de barre le plus proche au plancher) */
  z?: number;
}

export interface DeckSpec {
  /** clé matériau (CP-F20/15, CP-F40/30, bouleau, acier…) */
  material: string;
  thickness: number;
  layers: number;
  /** grille (enveloppe 45°, comme la Viewbox) ou portée dans un sens */
  span: 'two-way' | 'u' | 'v';
  /** plancher non contreplaqué justifié hors outil (fiche fabricant) : « Non vérifié », verdict plafonné */
  justifiedElsewhere?: boolean;
  /** portée maxi saisie (mm) */
  maxSpan?: number;
}

export interface FrameLayout {
  v: 1;
  origin: 'sketchup' | 'mesh' | 'preset-viewbox' | 'parametric' | 'editor';
  bars: FrameBar[];
  feet: FrameFoot[];
  deck: { floor: DeckSpec | null; roof: DeckSpec | null };
  joints: {
    column: { model: 'semi' | 'rigid' | 'pinned'; stiffness?: number; fullStrengthDeclared?: boolean };
    /** traverses / lisses ↔ rives */
    secondary: { model: 'rigid' | 'pinned' };
    side: { model: 'bolts' | 'contact-only' | 'custom' };
  };
  /** relevé : tolérance de recalage, écarts, avertissements (affichés et repris dans le rapport) */
  survey?: { snapTol: number; maxEccentricity: number; warnings: string[]; extractedFrom?: string; extractedAt?: string };
}

export interface ModuleTypeEntry extends EntryBase {
  kind: 'module_type';
  /** gabarit de calcul (null = inconnu : l'outil demande) ; 'frame' = structure explicite (`params.frame`, S12) */
  template: 'viewbox-eu' | 'viewbox-us' | 'frame' | null;
  /** famille : 'viewbox' (défaut si absent : données Viewbox, TÜV, statico) ou 'other' (type personnalisé) */
  family?: 'viewbox' | 'other';
  params?: ViewboxTemplateParams;
  /** dimensions nominales en plan et hauteur hors tout (mm) */
  nominal: { long: number; short: number; height: number };
  /** poids d'une unité (planchers et isolants compris, sans murs) — contrôle du gabarit ± 10 % ; absent = calculé */
  weighedN?: number;
  /** assemblages du type : clés de la bibliothèque (connection / joint_design) ; absent = VBX-* si Viewbox, sinon inconnu */
  connections?: { corner?: string; contact?: string; plate?: string; bolt?: string; jack?: string; bracing?: string; stackDesign?: string };
  /** surface de contact d'un pied sur le calage (mm) ; absent = règles Viewbox si Viewbox, sinon inconnue */
  footContact?: { a1: number; a2: number; jack?: { a1: number; a2: number } };
  /** signatures des dessins SketchUp reconnus comme ce type (structure relevée conforme) */
  drawings?: string[];
}

/** Famille d'un type de module (absent = Viewbox, comme avant S12). */
export const moduleFamily = (e: Pick<ModuleTypeEntry, 'family'> | null | undefined): 'viewbox' | 'other' => e?.family ?? 'viewbox';

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
