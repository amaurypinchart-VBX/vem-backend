// Module « Loading liste » — types de la base de règles (données, pas du code : tout ce qui varie est une donnée).
// Une règle dit : « tel article sort, telle quantité, par telle base de comptage, à telles conditions, avec tel spare ».
// La base de départ est générée depuis le classeur VIEWBOX_regles_loading_N.xlsx (scripts/import-loading-rules.mjs) ;
// les règles validées dans l'app (table loading_rules) la complètent ou la remplacent (même clé ⇒ la base gagne).

/** Unité de comptage d'une règle (ce que la topologie sait compter). */
export type CountingBase =
  | 'produit' // instances des produits déclencheurs (trigger.articles)
  | 'box' // Viewbox (VBX)
  | 'pied' // pieds au sol après fusion des pieds communs (≤ 100 mm)
  | 'pied_box' // pieds de chaque box avant fusion (« chaque box garde ses pieds de levage »)
  | 'jonction_box' // jonctions entre deux box du même niveau
  | 'jonction_grand_cote' // jonctions où deux grands côtés se touchent
  | 'jonction_petit_cote' // jonctions où deux petits côtés se touchent
  | 'jonction_toit_grand_cote' // toits jointifs par les grands côtés (rien posé dessus)
  | 'jonction_toit_petit_cote' // toits jointifs par les petits côtés (rien posé dessus)
  | 'cote_box_jonction' // côtés de box à une jonction (2 par jonction)
  | 'bord' // côtés de box vers une terrasse / le vide
  | 'jonction_panneau' // jonctions entre panneaux voisins sans vitre (mur / mur, mur / porte) : joint carrosserie
  | 'jonction_verre' // jonctions avec une vitre (vitre / vitre, vitre / porte) : profil plexi
  | 'terminaison_vitre' // bout de vitre contre un poteau (coin, mur, vide), pas contre une porte
  | 'cote' // côtés de box (4 par box)
  | 'cote_vitre_court' // petits côtés vitrés
  | 'cote_vitre_long' // grands côtés vitrés
  | 'panneau' // panneaux de façade (mur, vitre, porte)
  | 'panneau_plein' // murs pleins
  | 'porte_simple'
  | 'porte_double'
  | 'porte_coulissante'
  | 'poteau'
  | 'ilot' // ensemble de box jointives (unité séparée, cluster)
  | 'ilot_couvert' // îlot dont les toits sont jointifs
  | 'module_toit'
  | 'poteau_connecte' // bandes de poteaux : coins de box qui se touchent (2 poteaux → 1, 4 poteaux → 4)
  | 'paire_box' // paires de box dans les îlots connectés (⌊box / 2⌋ par îlot)
  | 'airco'
  | 'm2_plancher'
  | 'job' // forfait par chantier
  | 'sous_bois_etude' // plaques de calage données par l'Étude structure
  | 'motif'; // occurrences d'un motif appris en 3D

export const COUNTING_BASE_LABEL: Record<CountingBase, string> = {
  produit: 'par produit',
  box: 'par box',
  pied: 'par pied',
  pied_box: 'par pied de box',
  jonction_box: 'par jonction de box',
  jonction_grand_cote: 'par jonction grand côté',
  jonction_petit_cote: 'par jonction petit côté',
  jonction_toit_grand_cote: 'par jonction de toit grand côté',
  jonction_toit_petit_cote: 'par jonction de toit petit côté',
  cote_box_jonction: 'par côté de box à une jonction',
  bord: 'par bord libre',
  jonction_panneau: 'par jonction de panneaux sans vitre',
  jonction_verre: 'par jonction avec une vitre',
  terminaison_vitre: 'par terminaison vitre / poteau',
  cote: 'par côté de box',
  cote_vitre_court: 'par petit côté vitré',
  cote_vitre_long: 'par grand côté vitré',
  panneau: 'par panneau',
  panneau_plein: 'par mur plein',
  porte_simple: 'par porte simple',
  porte_double: 'par porte double',
  porte_coulissante: 'par porte coulissante',
  poteau: 'par poteau',
  ilot: 'par îlot',
  ilot_couvert: 'par îlot couvert',
  module_toit: 'par module de toit',
  poteau_connecte: 'par bande de poteaux jointifs',
  paire_box: 'par paire de box',
  airco: 'par airco',
  m2_plancher: 'par m² de plancher',
  job: 'forfait chantier',
  sous_bois_etude: 'selon l’étude structure',
  motif: 'par motif',
};

export type RuleKind = 'accessoire' | 'ajout_chantier' | 'appreciation' | 'substitution' | 'kit' | 'exclusion';
export type Confidence = 'confirme' | 'a_confirmer' | 'hypothese' | 'observe';
export type RuleSource = 'seed' | 'decision' | 'correction' | 'montre_3d' | 'chantier_reel' | 'atelier_texte';
export type GlazingRegime = '8.8.2' | '10mm' | '4.4.2';
export type Unit = 'pce' | 'm' | 'm2' | 'L';

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirme: 'confirmé',
  a_confirmer: 'à confirmer',
  hypothese: 'hypothèse',
  observe: 'observé',
};

/** « Ce produit + ce produit, dans telle relation » (appris en 3D, § 7.2). */
export interface Pattern {
  elements: { articleRef?: string; category?: string }[];
  relation?: 'seul' | 'cote_a_cote' | 'meme_cote' | 'meme_box' | 'de_part_et_d_autre_jonction' | 'meme_niveau';
}

export interface RuleTrigger {
  /** produits déclencheurs : la règle ne sort que s'ils sont présents ; base « produit » = leurs instances */
  articles?: string[];
  categories?: string[];
  /** régime de vitrage déclencheur (seul le régime présent sort) */
  vitrage?: GlazingRegime;
  pattern?: Pattern;
}

/** Conditions : la règle ne sort que si toutes sont vraies. Absente = toujours. */
export interface RuleConditions {
  niveau?: 'rez' | 'etage';
  position?: 'angle' | 'bord' | 'milieu';
  /** standalone = box seule dans son îlot ; connecte = îlot d'au moins 2 box */
  regime?: 'standalone' | 'connecte';
  connexion?: 'longueur' | 'largeur' | 'les_deux';
  /** valeur « Appui » du classeur, gardée telle quelle (au_sol / suspendu) */
  appui?: string;
  couvert?: boolean;
  chargeLourde?: boolean;
  airco?: boolean;
  /** emplacement de l'airco dans la 3D : dessiné en nidaplast (substitution) ou autre (module airco / vide : ajout) */
  aircoSlot?: 'nidaplast' | 'autre';
  /** RAL des murs demandé (variante de mur) */
  ralMurs?: string;
  plancherLamine?: boolean;
  hauteur?: boolean;
  tailleJob?: 'petit' | 'gros';
  montage?: 'atelier' | 'chantier';
}

export type Spare =
  | { type: 'fixe'; valeur: number }
  | { type: 'pourcent'; valeur: number }
  /** spare écrit en texte dans le classeur (« +arrondi », « +spare ») : non traduit, à préciser */
  | { type: 'texte'; texte: string };

/** « quantité pour / par tranche de » (Ajouts_chantier), ou paliers explicites. */
export type Tranche =
  | { mode: 'tranche'; pour: number; parTranche: number; arrondi: 'sup' }
  | { mode: 'paliers'; paliers: { min: number; max?: number; qty: number }[] };

export interface CalibrationPoint {
  chantier: string;
  bordereau?: string;
  base?: number;
  predit?: number;
  livre?: number;
  note?: string;
}

export interface RuleOrigin {
  sheet: string;
  row: number;
}

export interface LoadingRule {
  /** stable, ex. « acc:4-700-065@box[standalone] » */
  key: string;
  kind: RuleKind;
  trigger: RuleTrigger;
  /** réf. catalogue qui sort */
  article: string;
  /** désignation donnée dans la règle (le catalogue fait foi à l'affichage) */
  articleName?: string;
  /** quantité par unité de base ; null = appréciation (jamais calculée seule) */
  qty: number | null;
  /** quantité écrite en texte dans le classeur (« ~10/jonction »), quand elle n'est pas un nombre */
  qtyText?: string;
  per: CountingBase;
  unit: Unit;
  tranche?: Tranche;
  when?: RuleConditions;
  spare?: Spare;
  /** substitution : article remplacé par chaque unité qui sort */
  replaces?: { article: string; qty: number };
  confidence: Confidence;
  calibration: CalibrationPoint[];
  remark?: string;
  /** règles qui vont ensemble et s'additionnent (ex. jonctions grand côté + petit côté) : jamais une contradiction entre elles */
  group?: string;
  /** les règles d'un même groupe se contredisent (même article, conditions qui se chevauchent) : à trancher */
  conflict?: string;
  /** remplacée par cette règle (gardée pour l'historique, inactive) */
  supersededBy?: string;
  origin?: RuleOrigin[];
  version: number;
  active: boolean;
  source: RuleSource;
}

/** Valeur observée sur un chantier réel sans règle établie (cellules mauves du classeur : régime connecté). */
export interface SeedObservation {
  key: string;
  article: string;
  articleName?: string;
  chantier: string;
  valeur: number;
  contexte: string;
  regime?: 'standalone' | 'connecte';
  note?: string;
  origin: RuleOrigin;
}

export type LoadingCategory = 'structure' | 'quincaillerie' | 'joints' | 'electrique' | 'consommables' | 'ajouts';

/** Ordre du bordereau (fiche 02). */
export const LOADING_CATEGORIES: { key: LoadingCategory; label: string }[] = [
  { key: 'structure', label: 'Structure / façade' },
  { key: 'quincaillerie', label: 'Quincaillerie / liaison' },
  { key: 'joints', label: 'Joints / étanchéité' },
  { key: 'electrique', label: 'Électrique' },
  { key: 'consommables', label: 'Consommables / finition' },
  { key: 'ajouts', label: 'Ajouts chantier' },
];

/** Pieds d'une box (gabarit) : 4 coins + des pieds intermédiaires sur chaque grand côté. */
export interface FeetLayout {
  total: number;
  angle: number;
  /** pieds intermédiaires par grand côté */
  milieuParGrandCote: number;
}

export interface CatalogueItem {
  ref: string;
  designation: string;
  /** « Gros produit ? » du classeur (produit visible dans la 3D) */
  gros: boolean;
  categorie: LoadingCategory;
  unit: Unit;
  /** régime de vitrage d'un vitrage */
  vitrage?: GlazingRegime;
  /** plaque de calage (mm) : correspondance avec les plaques de l'Étude structure */
  plaque?: { l: number; w: number };
  /** pieds d'une Viewbox de cette référence */
  pieds?: FeetLayout;
  /** porte (d'après la désignation) : base des kits de marches */
  porte?: 'simple' | 'double' | 'coulissante';
  /** produit airco / chauffage (HVAC) : demande un mur avec trou airco */
  hvac?: boolean;
  /** pièce comprise dans un autre produit (ex. poteaux et modules de toit dans le standard 7-962-016) : jamais une ligne à part */
  inclusDans?: string;
  /** poteaux (7-355-014 / 015) d'une box de cette référence, quand on le sait */
  poteaux?: number;
  /** référence du produit dans Odoo (Product Reference Code = la référence Viewbox) ; absent = inconnu d'Odoo */
  odoo?: string;
  source: 'classeur' | 'ajout' | 'odoo';
}

export interface ImportIssue {
  /** onglet + ligne du classeur */
  where: string;
  article?: string;
  kind: 'texte' | 'doublon' | 'contradiction' | 'catalogue' | 'condition' | 'interpretation' | 'decision' | 'ignore' | 'odoo';
  text: string;
  /** question posée à Amaury (vide = information) */
  question?: string;
}
