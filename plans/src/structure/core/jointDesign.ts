// Liaison personnalisée entre Viewbox (phase S11) : une pièce (clamp, plat boulonné, équerre…) décrite par ses
// composants (plaques, boulons, soudures, surfaces de contact) et, pour chaque direction (soulèvement, glissement
// selon le grand côté, selon le petit côté, compression), le chemin d'effort = la suite des composants qui travaillent.
// La résistance d'une direction est le minimum des composants de son chemin (méthode des composants, EN 1993-1-8),
// calculée dans checks/jointDesign.ts. La géométrie ne dit pas tout : nuance, classe et serrage des boulons, soudures,
// état de surface sont demandés ; une donnée absente = « incomplet », jamais deviné. Fonctions pures ; N, mm.

export type JointDirection = 'uplift' | 'slideLong' | 'slideShort' | 'compression';

export const DIRECTION_LABEL: Record<JointDirection, string> = {
  uplift: 'soulèvement',
  slideLong: 'glissement le long du grand côté',
  slideShort: 'glissement le long du petit côté',
  compression: 'compression',
};

export type BoltGrade = '4.6' | '5.6' | '8.8' | '10.9';

export interface JointPlate {
  id: string;
  kind: 'plate';
  label: string;
  /** épaisseur, largeur (perpendiculaire à l'effort) en mm */
  t?: number;
  width?: number;
  /** longueur (dans le sens de l'effort), pour information et le poids */
  length?: number;
  grade?: string;
  /** trou : diamètre, pince longitudinale e1, pince transversale e2 (mm) */
  hole?: { d0?: number; e1?: number; e2?: number };
  /** pièce de la Viewbox existante (gousset, platine de pied, âme de rive) : pas comptée dans le poids ajouté */
  existing?: boolean;
}

export interface JointBolt {
  id: string;
  kind: 'bolt';
  label: string;
  d?: number;
  grade?: BoltGrade;
  /** plan de cisaillement dans le filetage (prudent) */
  threadInShear?: boolean;
  /** serrage : non spécifié, ou précontraint avec un couple contrôlé (seul cas où le frottement compte) */
  preload?: 'none' | 'controlled';
  /** taraudage dans une plaque : longueur en prise (mm) */
  tappedLength?: number;
}

export interface JointWeld {
  id: string;
  kind: 'weld';
  label: string;
  /** gorge a et longueur utile L (mm) : saisies, jamais déduites du dessin */
  a?: number;
  length?: number;
  /** nuance des pièces soudées (βw, fu) */
  grade?: string;
}

export interface JointContact {
  id: string;
  kind: 'contact';
  label: string;
  /** surface en appui (mm²), frottement, état de surface */
  area?: number;
  mu?: number;
  surface?: 'brut' | 'peint' | 'galvanisé' | string;
  grade?: string;
}

export type JointComponent = JointPlate | JointBolt | JointWeld | JointContact;

export type StepMode =
  | 'bolt-shear'
  | 'bolt-tension'
  | 'bolt-punching'
  | 'thread'
  | 'plate-bearing'
  | 'plate-net'
  | 'plate-gross'
  | 'plate-bending'
  | 'plate-hinges'
  | 'weld'
  | 'friction'
  | 'contact';

export const MODE_LABEL: Record<StepMode, string> = {
  'bolt-shear': 'boulon en cisaillement',
  'bolt-tension': 'boulon en traction',
  'bolt-punching': 'poinçonnement sous la tête ou l’écrou',
  thread: 'filetage en prise (taraudage)',
  'plate-bearing': 'pression diamétrale dans la plaque',
  'plate-net': 'section nette de la plaque (traction)',
  'plate-gross': 'section brute de la plaque',
  'plate-bending': 'plaque en flexion (console, une rotule)',
  'plate-hinges': 'plaque en flexion (deux rotules, méthode statico)',
  weld: 'soudure d’angle',
  friction: 'frottement sous serrage',
  contact: 'appui en compression',
};

/** Composant attendu par chaque mode. */
export const MODE_KIND: Record<StepMode, JointComponent['kind']> = {
  'bolt-shear': 'bolt',
  'bolt-tension': 'bolt',
  'bolt-punching': 'bolt',
  thread: 'bolt',
  'plate-bearing': 'plate',
  'plate-net': 'plate',
  'plate-gross': 'plate',
  'plate-bending': 'plate',
  'plate-hinges': 'plate',
  weld: 'weld',
  friction: 'bolt',
  contact: 'contact',
};

/** Un maillon du chemin d'effort. */
export interface PathStep {
  component: string;
  mode: StepMode;
  /** nombre d'éléments identiques qui travaillent ensemble dans ce maillon (2 boulons, 2 cordons…) */
  count?: number;
  /** boulon qui appuie sur la plaque (pression diamétrale, poinçonnement) / plaque sous la tête (poinçonnement) */
  bolt?: string;
  plate?: string;
  /** bras de levier (mm) pour la plaque en flexion */
  lever?: number;
  /** nombre de plans de frottement */
  planes?: number;
  note?: string;
}

export type JointQualification = 'prototype' | 'tested' | 'certified';

export interface JointDesign {
  key: string;
  name: string;
  description?: string;
  function: { antiSlide: boolean; antiUplift: boolean; carriesCompression: boolean };
  /** liaison d'origine remplacée */
  replaces: 'verticalLink' | 'horizontalLink' | 'none';
  /** principe de blocage : par forme / butée, par serrage / frottement, ou les deux */
  principle: 'positive' | 'friction' | 'mixed';
  components: JointComponent[];
  paths: Partial<Record<JointDirection, PathStep[]>>;
  /** raideur d'une pièce (N/mm) et jeu de montage (mm) */
  stiffness: { slide?: number; uplift?: number; play?: number };
  /** pièces par angle de Viewbox empilée */
  perCorner: number;
  qualification: JointQualification;
  source: 'form' | 'sketchup' | 'library' | 'ai' | 'template';
  /** gabarit de départ */
  template?: string;
  history?: Array<{ at: string; by: string; note: string }>;
}

export const QUALIFICATION_LABEL: Record<JointQualification, string> = {
  prototype: 'prototype — non qualifié',
  tested: 'testé (essai de qualification)',
  certified: 'certifié',
};

const plate = (id: string, label: string, p: Omit<JointPlate, 'id' | 'kind' | 'label'> = {}): JointPlate => ({ id, kind: 'plate', label, ...p });
const bolt = (id: string, label: string, p: Omit<JointBolt, 'id' | 'kind' | 'label'> = {}): JointBolt => ({ id, kind: 'bolt', label, ...p });
const weld = (id: string, label: string, p: Omit<JointWeld, 'id' | 'kind' | 'label'> = {}): JointWeld => ({ id, kind: 'weld', label, ...p });

/**
 * Gabarits de départ. « Plats d'empilement d'origine » reprend la liaison de la bibliothèque (VBX-VERTICAL-PLATE,
 * statico 24-0571 § 3.9) composant par composant : le calcul doit retomber sur ses capacités (test).
 */
export const JOINT_TEMPLATES: JointDesign[] = [
  {
    key: 'JD-ORIGINE-PLAT',
    name: 'Plat d’empilement d’origine 100 × 10 + 2 × M20',
    description: 'Plat 100 × 10 × 400 mm S235, un M20-8.8 dans chaque Viewbox (entraxe 290 mm), contre le dos des rives UNP 220 (statico 24-0571 § 3.9).',
    function: { antiSlide: true, antiUplift: true, carriesCompression: false },
    replaces: 'verticalLink',
    principle: 'positive',
    components: [
      plate('P', 'plat 100 × 10', { t: 10, width: 100, length: 400, grade: 'S235', hole: { d0: 22, e1: 55, e2: 50 } }),
      bolt('B', 'M20-8.8', { d: 20, grade: '8.8', threadInShear: true, preload: 'none' }),
      plate('W', 'âme de la rive UNP 220', { t: 9, width: 220, grade: 'S235', hole: { d0: 22, e1: 110, e2: 60 }, existing: true }),
    ],
    paths: {
      uplift: [
        { component: 'B', mode: 'bolt-shear' },
        { component: 'P', mode: 'plate-bearing', bolt: 'B' },
        { component: 'W', mode: 'plate-bearing', bolt: 'B' },
        { component: 'P', mode: 'plate-net' },
      ],
      // un plat ne reprend l'effort perpendiculaire à son côté que dans un sens (statico) : bras 290 − 220 / 2
      slideShort: [{ component: 'P', mode: 'plate-hinges', lever: 180 }],
      slideLong: [{ component: 'P', mode: 'plate-hinges', lever: 180 }],
    },
    stiffness: { slide: 1000, play: 0 },
    perCorner: 3,
    qualification: 'certified',
    source: 'template',
  },
  {
    key: 'JD-CLAMP-GOUSSET',
    name: 'Clamp sous le gousset d’angle + M20 dans la platine de pied',
    description:
      'Pièce en acier de 15 mm glissée sous le gousset trapézoïdal soudé sur l’angle de toiture de la Viewbox du dessous, qui remonte de la hauteur du gousset ; un M20 traverse la platine de pied de la Viewbox du dessus et se visse dans le clamp taraudé. Soulèvement : boulon tendu → clamp en console → gousset → soudure du gousset. Glissement : boulon cisaillé dans la platine et le clamp, butée du clamp contre le gousset.',
    function: { antiSlide: true, antiUplift: true, carriesCompression: false },
    replaces: 'verticalLink',
    principle: 'positive',
    components: [
      plate('C', 'clamp (plaque pliée 15 mm)', { t: 15, hole: {} }),
      plate('G', 'gousset trapézoïdal (Viewbox du dessous)', { existing: true }),
      weld('WG', 'soudure du gousset sur l’angle de toiture'),
      plate('F', 'platine de pied (Viewbox du dessus)', { t: 15, grade: 'S235', hole: {}, existing: true }),
      bolt('B', 'M20 vissé dans le clamp', { d: 20, threadInShear: true, preload: 'none', tappedLength: 15 }),
    ],
    paths: {
      uplift: [
        { component: 'B', mode: 'bolt-tension' },
        { component: 'B', mode: 'bolt-punching', plate: 'F' },
        { component: 'B', mode: 'thread' },
        { component: 'C', mode: 'plate-bending' },
        { component: 'G', mode: 'plate-bending' },
        { component: 'WG', mode: 'weld' },
      ],
      slideLong: [
        { component: 'B', mode: 'bolt-shear' },
        { component: 'F', mode: 'plate-bearing', bolt: 'B' },
        { component: 'C', mode: 'plate-bearing', bolt: 'B' },
        { component: 'WG', mode: 'weld' },
      ],
      slideShort: [
        { component: 'B', mode: 'bolt-shear' },
        { component: 'F', mode: 'plate-bearing', bolt: 'B' },
        { component: 'C', mode: 'plate-bearing', bolt: 'B' },
        { component: 'WG', mode: 'weld' },
      ],
    },
    stiffness: { play: 2 },
    perCorner: 1,
    qualification: 'prototype',
    source: 'template',
  },
  {
    key: 'JD-CLAMP-2-MACHOIRES',
    name: 'Clamp à 2 mâchoires boulonnées (serrage sur aile)',
    description: 'Deux mâchoires serrent l’aile du profil par 2 boulons : résistance par frottement, fiable seulement avec des boulons précontraints et un couple contrôlé.',
    function: { antiSlide: true, antiUplift: false, carriesCompression: false },
    replaces: 'none',
    principle: 'friction',
    components: [plate('M', 'mâchoire'), bolt('B', 'boulons de serrage', { preload: 'none' }), { id: 'S', kind: 'contact', label: 'aile serrée', mu: undefined }],
    paths: {
      slideLong: [{ component: 'B', mode: 'friction', count: 2, planes: 2 }],
      slideShort: [{ component: 'B', mode: 'friction', count: 2, planes: 2 }],
    },
    stiffness: { play: 0 },
    perCorner: 1,
    qualification: 'prototype',
    source: 'template',
  },
  {
    key: 'JD-EQUERRE',
    name: 'Équerre boulonnée',
    description: 'Cornière boulonnée sur chacune des deux Viewbox (un boulon de chaque côté).',
    function: { antiSlide: true, antiUplift: true, carriesCompression: false },
    replaces: 'none',
    principle: 'positive',
    components: [plate('A', 'aile de l’équerre', { hole: {} }), bolt('B', 'boulon', { threadInShear: true, preload: 'none' })],
    paths: {
      uplift: [
        { component: 'B', mode: 'bolt-shear' },
        { component: 'A', mode: 'plate-bearing', bolt: 'B' },
        { component: 'A', mode: 'plate-net' },
      ],
      slideLong: [{ component: 'B', mode: 'bolt-tension' }, { component: 'A', mode: 'plate-bending' }],
      slideShort: [{ component: 'B', mode: 'bolt-shear' }, { component: 'A', mode: 'plate-bearing', bolt: 'B' }],
    },
    stiffness: { play: 1 },
    perCorner: 1,
    qualification: 'prototype',
    source: 'template',
  },
];

/** Copie d'un gabarit pour un nouvel accessoire (clé « JD-… » unique). */
export function designFromTemplate(t: JointDesign, key: string, name?: string): JointDesign {
  const copy = JSON.parse(JSON.stringify(t)) as JointDesign;
  return { ...copy, key, name: name ?? t.name, source: 'form', template: t.key, qualification: t.key === 'JD-ORIGINE-PLAT' ? 'certified' : 'prototype', history: [] };
}

/** Clé de bibliothèque d'un accessoire à partir de son nom. */
export function jointKey(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `JD-${slug || 'LIAISON'}`;
}

/** Masse ajoutée par pièce (kg) : plaques non existantes (t × largeur × longueur × 7 850). */
export function jointMass(d: JointDesign): number {
  return d.components.reduce((a, c) => (c.kind === 'plate' && !c.existing && c.t && c.width && c.length ? a + (c.t * c.width * c.length * 7850) / 1e9 : a), 0);
}
