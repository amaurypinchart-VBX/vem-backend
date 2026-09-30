// Langues du rapport de l'étude structure (FR par défaut, DE, EN) : textes fixes du rapport (titres calqués sur les
// notes statico : « Lastannahmen », « Nachweise der Tragfähigkeit », « Bodenpressung und Unterpallung »…), consignes
// standard, et traduction des textes produits par le moteur de calcul (titres des vérifications, libellés des
// éléments, messages), écrits en français : table de correspondances appliquée des expressions les plus longues aux
// plus courtes. Les nombres gardent la virgule en FR / DE et passent au point en EN. Fonctions pures.
import type { Verdict } from '../core/records';
import { fmtNumber } from '../core/units';

export type Lang = 'fr' | 'de' | 'en';
export const LANGS: Lang[] = ['fr', 'de', 'en'];
export const LANG_LABEL: Record<Lang, string> = { fr: 'Français', de: 'Deutsch', en: 'English' };

/** Nombre formaté dans la langue du rapport. */
export function num(lang: Lang, v: number, d = 2): string {
  const s = fmtNumber(v, d);
  return lang === 'en' ? s.replace(/(\d),(\d)/g, '$1.$2') : s;
}

export interface Labels {
  watermark: string;
  coverWarning: string;
  header: { number: string; client: string; project: string };
  footer: string;
  verdict: Record<Verdict, string>;
  verdictSentence: Record<Verdict, string>;
  combination: string;
  elements: string;
  // couverture
  coverTitle: string;
  coverSubtitle: string;
  coverFields: { client: string; project: string; number: string; address: string; installation: string; model: string; author: string; date: string; software: string; variant: string };
  variant: { compact: string; detailed: string };
  coverPages: (main: number, annex: number) => string;
  toc: string;
  // synthèse
  summary: string;
  installation: string;
  modulesOnLevels: (n: number, levels: number) => string;
  approxDims: (a: string, b: string, c: string) => string;
  overallDims: string;
  moduleDims: string;
  totalPermanent: string;
  imposed: string;
  windInOut: string;
  maxEta: string;
  colCheck: string;
  colCount: string;
  colEta: string;
  colElement: string;
  colCombo: string;
  plywoodRow: string;
  slidingRow: (mu: string) => string;
  overturningRow: string;
  groundRow: string;
  groundTitle: string;
  colSupport: string;
  colSolution: string;
  materialsTitle: string;
  colDesignation: string;
  colDims: string;
  colQty: string;
  colMass: string;
  noStandardSolution: string;
  windOperation: string;
  shutdown: (v: string, surfaces: string) => string;
  outdoorSurfaces: string;
  topLevelAndOutdoor: string;
  notCovered: string;
  notCoveredItems: { glazing: string; cladding: string; logo: string; steps: string; decking: string; railings: string; blocking: string };
  reasons: string;
  // chapitre 1
  ch1: string;
  s11: string;
  basisText: (file: string, date: string) => string;
  descriptionTitle: string;
  descriptionText: (n: number, levels: number) => string;
  outerDims: string;
  figure3d: string;
  figurePlan: string;
  figureFaces: string;
  levelName: (level: number) => string;
  facesLegend: { closed: string; open: string; shared: string };
  claddingNote: string;
  s12: string;
  generalNotes: string[];
  jacksForbidden: string;
  jacksUsed: string;
  glazingNote: string;
  impactNote: string;
  snowNote: string;
  s13: string;
  windConditions: (qp: string, v: string) => string;
  windInService: (q: string, v: string, surfaces: string) => string;
  windTerrain: string;
  windWater: string;
  windPlanTitle: string;
  colThreshold: string;
  colSpeed: string;
  colAction: string;
  windPlan: { watch: [string, string]; stop: [string, string]; limit: [string, string] };
  windPlanNotes: string[];
  s14: string;
  overturning: string;
  sliding: string;
  slidingValue: (req: string, mu: string) => string;
  ballast: string;
  ballastNone: string;
  ballastRequired: (kN: string, kg: string) => string;
  ballastOverturning: string;
  jacks: string;
  bearing: string;
  bearingValue: (v: string, label: string) => string;
  groundNote: string;
  s15: string;
  materialsText: string;
  normsTitle: string;
  norms: Array<[string, string]>;
  docsTitle: string;
  docs: string[];
  softwareTitle: string;
  softwareText: (version: string) => string;
  // chapitre 2
  ch2: string;
  s21: string;
  weighed: (kN: string, kg: string) => string;
  steelWeight: string;
  ceiling: string;
  walls: string;
  wallsNone: string;
  wallRow: (label: string, q: string, len: string) => string;
  floor: string;
  railings: string;
  logos: string;
  pointRow: (label: string, F: string) => string;
  s22: string;
  s221: string;
  liveText: string;
  roofLive: string;
  outOfServiceLive: (evacuated: string) => string;
  evacuatedTop: string;
  evacuatedOutdoor: string;
  s222: string;
  horizontalText: string;
  handrail: string;
  impact: string;
  s23: string;
  snowText: string;
  s24: string;
  windTwoStates: string;
  inServiceTitle: string;
  outOfServiceTitle: string;
  outOfServiceText: string;
  cpTitle: string;
  cpRows: Array<[string, string]>;
  internalPressure: string;
  roofSuction: string;
  s25: string;
  imperfection: string;
  combosText: string;
  colId: string;
  colClass: string;
  colFactors: string;
  comboClass: Record<'ULS' | 'STAB' | 'SLS', string>;
  // chapitre 3
  ch3: string;
  ch3Intro: (method: string) => string;
  method: Record<'envelope' | 'classic' | 'statico', string>;
  floors: string;
  floorsText: string;
  viewbox: string;
  sectionsTitle: string;
  colRole: string;
  colSection: string;
  colMaterial: string;
  figureEta: string;
  figureEtaMembers: string;
  etaLegend: string;
  mostLoaded: string;
  governingPerFamily: string;
  corners: string;
  cornersText: string;
  vlinks: string;
  vlinksText: string;
  bolts: string;
  boltsText: string;
  ground: string;
  groundIntro: (source: string) => string;
  groundSourceSls: string;
  groundSourceStatico: string;
  groundCase: (type: string, bearing: string) => string;
  actions: string;
  plateTable: { stack: string; dims: string; thickness: string };
  plateFigure: string;
  chosenSolution: string;
  otherSolutions: string;
  longrine: string;
  // chapitre 4
  ch4: string;
  stabilityBasis: string;
  stabilityFactors: Array<[string, string]>;
  stabilityFootnote: string;
  overturningTitle: string;
  slidingTitle: string;
  // chapitre 5
  ch5: string;
  conclusion: Record<Verdict, (eta: string) => string>;
  reserve: string;
  remarksTitle: string;
  hintsTitle: string;
  hints: { sliding: (kg: string) => string; overturning: string; corners: string; members: string; ground: string; plywood: string; blocked: string; jacks: string };
  // annexe
  annex: string;
  b1: string;
  modelCounts: (nodes: number, members: number, supports: number) => string;
  sectionsAnnex: string;
  materialsAnnex: string;
  springsTitle: string;
  springs: Array<[string, string]>;
  b2: string;
  colCase: string;
  colLabel: string;
  b3: string;
  b4: string;
  b5: string;
  colGroup: string;
  colModules: string;
  b6: string;
  none: string;
  calagePlan: string;
  calagePlanTitle: string;
  heightWindWarning: (h: string, q: string) => string;
  bearingMissing: string;
  aiNote: string;
  overturningFail: (combos: string, modules: string) => string;
  jacksYes: string;
  jacksNo: string;
  combosNote: (n: number) => string;
  supportsFigure: string;
  contactArea: string;
  curves: string;
  colFamily: string;
  colMembers: string;
  colLength: string;
}

const FR: Labels = {
  heightWindWarning: (h, q) => `Hauteur de l’installation ${h} m > 8 m : DIN EN 13814 demande q = 0,30 kN/m² en service (valeur retenue : ${q} kN/m²).`,
  bearingMissing: 'Portance du sol non renseignée : calage non dimensionné.',
  aiNote: 'Texte rédigé avec l’aide de l’IA à partir des résultats du calcul, puis relu ; aucun chiffre ne provient de l’IA (contrôle automatique).',
  overturningFail: (c, m) => `Basculement sous le vent hors service (${c}) : un appui de ${m} se soulève et l’ensemble devient instable — lest ou ancrage nécessaire.`,
  jacksYes: 'utilisés (capacité et sortie maximale à justifier)',
  jacksNo: 'non utilisés : angles posés directement sur le calage',
  combosNote: (n) => `Directions x+ seulement ; les directions x−, y+ et y− sont identiques au sens près (${n} combinaisons calculées au total, liste complète dans la version détaillée).`,
  supportsFigure: 'Groupes d’appuis (couleur = type) et réaction caractéristique maximale Rz,k',
  contactArea: 'Surface de contact',
  curves: 'Courbes',
  colFamily: 'Famille',
  colMembers: 'Barres',
  colLength: 'Longueur totale',
  watermark: 'Pré-étude interne — non vérifiée par un ingénieur',
  coverWarning: 'PRÉ-ÉTUDE INTERNE — NON VÉRIFIÉE PAR UN INGÉNIEUR',
  header: { number: 'N° de projet', client: 'Client', project: 'Projet' },
  footer: 'Viewbox International SA · VEM Étude structure',
  verdict: { ok: 'passe', limit: 'limite', fail: 'ne passe pas', incomplete: 'incomplet' },
  verdictSentence: {
    ok: 'La configuration passe',
    limit: 'La configuration passe, à la limite',
    fail: 'La configuration ne passe pas',
    incomplete: 'Pré-étude incomplète',
  },
  combination: 'Combinaison déterminante',
  elements: 'Éléments',
  coverTitle: 'Pré-étude structurelle',
  coverSubtitle: 'Construction temporaire modulaire Viewbox (Fliegender Bau)',
  coverFields: {
    client: 'Client',
    project: 'Projet',
    number: 'N° de projet',
    address: 'Lieu d’installation',
    installation: 'Date de montage',
    model: 'Modèle',
    author: 'Établi par',
    date: 'Date du rapport',
    software: 'Logiciel',
    variant: 'Version',
  },
  variant: { compact: 'compacte', detailed: 'détaillée (avec annexe de calcul)' },
  coverPages: (m, a) => `Ce rapport comporte ${m} pages${a ? ` et ${a} pages d’annexe` : ''}, plus la page de garde.`,
  toc: 'Sommaire',
  summary: 'Synthèse',
  installation: 'Installation',
  modulesOnLevels: (n, l) => `${n} Viewbox sur ${l} niveau${l > 1 ? 'x' : ''}`,
  approxDims: (a, b, c) => `env. ${a} × ${b} × ${c} m (L × l × H)`,
  overallDims: 'Dimensions de l’ensemble',
  moduleDims: 'Dimensions d’une Viewbox',
  totalPermanent: 'Charges permanentes',
  imposed: 'Exploitation',
  windInOut: 'Vent en service / hors service',
  maxEta: 'Taux de travail maximaux',
  colCheck: 'Vérification',
  colCount: 'Nb',
  colEta: 'η max',
  colElement: 'Élément déterminant',
  colCombo: 'Comb.',
  plywoodRow: 'Plancher contreplaqué (bande de 1 m)',
  slidingRow: (mu) => `Glissement global (μ = ${mu})`,
  overturningRow: 'Basculement',
  groundRow: 'Pression au sol et calage',
  groundTitle: 'Charges au sol et calage',
  colSupport: 'Appui',
  colSolution: 'Calage retenu',
  materialsTitle: 'Matériel de calage à préparer',
  colDesignation: 'Désignation',
  colDims: 'Dimensions',
  colQty: 'Quantité',
  colMass: 'Masse',
  noStandardSolution: 'aucune solution standard : étude de répartition spécifique',
  windOperation: 'Exploitation par vent fort',
  shutdown: (v, s) => `Arrêt de l’exploitation et évacuation ${s} au plus tard à ${v} m/s (rafale), vent en service de DIN EN 13814.`,
  outdoorSurfaces: 'des surfaces extérieures',
  topLevelAndOutdoor: 'du dernier niveau et des surfaces extérieures',
  notCovered: 'Non vérifié dans cette pré-étude',
  notCoveredItems: {
    glazing: 'Vitrages : justification séparée selon DIN 18008.',
    cladding: 'Habillages (murs, plafonds, sols) et leurs fixations.',
    logo: 'Logos, enseignes et leurs fixations.',
    steps: 'Marches d’escalier : à choisir avec agrément pour les portées et charges.',
    decking: 'Platelage de terrasse (WPC…) : selon son agrément.',
    railings: 'Garde-corps : justifiés dans l’étude de base statico 18-0573 (main courante 0,50 kN/m).',
    blocking: 'Éléments non modélisés (verdict incomplet)',
  },
  reasons: 'Motifs',
  ch1: 'Remarques préliminaires, bases et consignes',
  s11: 'Bases de calcul et description de l’ouvrage',
  basisText: (f, d) => `La présente pré-étude repose sur le modèle SketchUp « ${f} » analysé dans VEM (version du ${d}) et sur les hypothèses saisies dans l’étude. Toutes les valeurs sont calculées par le moteur de l’outil (aucune valeur n’est estimée par l’IA).`,
  descriptionTitle: 'Description de l’ouvrage',
  descriptionText: (n, l) =>
    `La construction est une construction temporaire modulaire (« Fliegender Bau ») composée de ${n} modules acier « Viewbox » juxtaposés${l > 1 ? ` et empilés sur ${l} niveaux` : ''}. Chaque Viewbox se compose d’un élément de plancher, de quatre poteaux boulonnés et d’un élément de toiture. Les éléments porteurs sont des profilés acier soudés ou boulonnés ; la stabilité est assurée par le poids propre et par les cadres (assemblages poteau / cadre semi-rigides). Les Viewbox voisines sont boulonnées entre elles (M20-8.8) et les Viewbox empilées reliées par leurs plats de liaison d’angle.`,
  outerDims: 'Dimensions extérieures',
  figure3d: 'Vue 3D du modèle',
  figurePlan: 'Vue en plan avec repères des Viewbox (les numéros superposés sont empilés)',
  figureFaces: 'Faces habillées par niveau',
  levelName: (l) => (l === 0 ? 'Rez-de-chaussée' : `Niveau ${l}`),
  facesLegend: { closed: 'face fermée (mur, vitrage, porte)', open: 'face ouverte', shared: 'face mitoyenne' },
  claddingNote: 'Les habillages (murs, vitrages, plafonds), le logo et leurs fixations ne font pas partie de cette pré-étude et sont supposés suffisamment résistants. Des justifications séparées sont à fournir le cas échéant.',
  s12: 'Consignes générales',
  generalNotes: [
    'Tout écart par rapport aux données de ce document doit être signalé immédiatement : la pré-étude peut perdre sa validité.',
    'L’entreprise de montage est responsable de la stabilité en phase de montage, de la qualité des matériaux et des éléments utilisés et du montage dans les règles de l’art. L’exploitant est responsable de l’exploitation de la construction.',
    'Le sol doit être suffisamment portant pour reprendre les charges de la construction ; à défaut, des mesures de répartition adaptées sont à prendre. Les irrégularités du sol sont à rattraper.',
    'Tous les éléments en acier doivent être protégés contre la corrosion.',
    'Les travaux de soudage sont réservés à du personnel qualifié.',
    'Seuls des profils creux formés à froid soudables dans la zone formée à froid (DIN EN 1993-1-8, tableau 4.2) sont admis.',
    'Sauf indication contraire, les distances aux bords et entre fixations et les profondeurs d’ancrage minimales sont à respecter.',
    'Un desserrage involontaire des assemblages est à empêcher par des moyens adaptés.',
    'Les sections et assemblages non précisés sont à choisir et à réaliser selon les règles de l’art.',
    'Les notices de montage, agréments et consignes d’exploitation des fabricants sont à respecter.',
  ],
  jacksForbidden: 'Les pieds à vérins intégrés des Viewbox ne doivent pas être utilisés (réceptions de pied surchargées) : les vérins sont retirés et les angles posés directement sur le calage.',
  jacksUsed: 'Pieds à vérins utilisés : leur capacité et leur sortie maximale ne sont pas renseignées dans la bibliothèque — à justifier avant exploitation.',
  glazingNote: 'Vitrages : leur vérification (DIN 18008) ne fait pas partie de cette pré-étude.',
  impactNote: 'Les chocs de véhicules ou de personnes ne sont pas pris en compte : ils sont à empêcher par des mesures adaptées.',
  snowNote: 'La neige n’est pas prise en compte : elle est à empêcher par des mesures techniques ou organisationnelles.',
  s13: 'Bases du vent et plan d’action vent fort',
  windConditions: (qp, v) => `Hors service, la construction est justifiée pour une pression dynamique de pointe qp = ${qp} kN/m² (DIN EN 1991-1-4/NA, abattement 0,7 des constructions temporaires selon MVV TB Anlage B 2.1/2), soit une rafale de ${v} m/s.`,
  windInService: (q, v, s) => `En service, la pression dynamique est de q = ${q} kN/m² (DIN EN 13814) : l’exploitation est arrêtée et l’évacuation ${s} achevée au plus tard à une rafale de ${v} m/s. La vitesse du vent sur la construction est surveillée en continu.`,
  windTerrain: 'Le dimensionnement suppose une construction au niveau du terrain. En site surélevé (colline, podium…), consulter le bureau d’études. Les obstructions sous la construction ne sont pas prises en compte.',
  windWater: 'Les accumulations d’eau sont à empêcher par des mesures constructives ou organisationnelles.',
  windPlanTitle: 'Plan d’action vent fort',
  colThreshold: 'Seuil',
  colSpeed: 'Rafale',
  colAction: 'Mesure',
  windPlan: {
    watch: ['Vigilance', 'Surveillance renforcée (anémomètre relevé toutes les 15 min), responsable prévenu, évacuation des surfaces extérieures préparée.'],
    stop: ['Arrêt d’exploitation', 'Arrêt de l’exploitation ; évacuation des terrasses, du dernier niveau et des surfaces extérieures ; portes et accès fermés.'],
    limit: ['Limite hors service', 'Limite du dimensionnement hors service : personne dans la construction ni à proximité, périmètre de sécurité.'],
  },
  windPlanNotes: [
    'Anémomètre installé sur la construction ou à proximité immédiate, à hauteur du toit, lisible en permanence.',
    'Un responsable désigné sur site décide de l’arrêt et de l’évacuation.',
    'Registre quotidien : vitesses relevées, mesures prises, heure et responsable.',
  ],
  s14: 'Résumé ancrage et calage',
  overturning: 'Basculement',
  sliding: 'Glissement global',
  slidingValue: (r, m) => `μ requis = ${r} ; μ disponible = ${m}`,
  ballast: 'Lest',
  ballastNone: 'aucun lest nécessaire',
  ballastRequired: (k, g) => `lest total ≥ ${k} kN (≈ ${g} kg), réparti sur les appuis, ou ancrage`,
  ballastOverturning: 'lest ou ancrage à dimensionner (basculement)',
  jacks: 'Pieds à vérins',
  bearing: 'Portance admissible du sol',
  bearingValue: (v, l) => `${v} kN/m² (${l})`,
  groundNote: 'Portance à vérifier sur site par l’exploitant.',
  s15: 'Matériaux, normes, documentation et logiciel',
  materialsText: 'Acier S235 et S275 (profilés et tubes), contreplaqué F20/15 (planchers, toitures), contreplaqué F40/30 (calage), bois C24 (longrines). Les matériaux de chaque vérification sont indiqués au chapitre 3.',
  normsTitle: 'Normes',
  norms: [
    ['DIN EN 1990', 'Bases de calcul des structures'],
    ['DIN EN 1991-1', 'Actions sur les structures (+ NA)'],
    ['DIN EN 1993-1', 'Calcul des structures en acier (+ NA)'],
    ['DIN EN 1995-1', 'Calcul des structures en bois (+ NA)'],
    ['DIN EN 13814', 'Constructions temporaires (Fliegende Bauten) et installations foraines'],
    ['MVV TB', 'Anlage B 2.1/2 : vent des constructions temporaires'],
  ],
  docsTitle: 'Documents de référence',
  docs: [
    'statico 18-0573 « Viewbox – Modulares Containersystem » (étude de base, garde-corps).',
    'statico 24-0571 « Viewbox – Hoka » et 24-0569 « Viewbox – Qatar » (modèles SCIA de référence du gabarit et des vérifications).',
    'Plans Spantech « VIEWBOX M16 60MM » (poids pesé 2 564 kg, planchers et isolants compris).',
  ],
  softwareTitle: 'Logiciel',
  softwareText: (v) => `VEM · Plans Viewbox · Étude structure ${v} : modèle filaire 3D (barres, ressorts, contacts et appuis en compression seule), calcul au 2ᵉ ordre, vérifications DIN EN 1993 / 1995 et assemblages Viewbox.`,
  ch2: 'Hypothèses de charges',
  s21: 'Charges permanentes',
  weighed: (k, g) => `Poids pesé d’une Viewbox (plancher, toiture, poteaux, planchers et isolants compris, sans murs ni garde-corps) : G ≈ ${k} kN (${g} kg).`,
  steelWeight: 'Poids propre des barres : sections et matériaux du modèle, acier 78,5 kN/m³ ; le complément jusqu’au poids pesé est réparti sur les rives du plancher.',
  ceiling: 'Plafond et isolation',
  walls: 'Murs, vitrages, portes',
  wallsNone: 'aucun',
  wallRow: (l, q, len) => `${l} : ${q} kN/m sur ${len} m`,
  floor: 'Sol et isolation',
  railings: 'Garde-corps',
  logos: 'Logos et charges ponctuelles',
  pointRow: (l, F) => `${l} : ${F} kN`,
  s22: 'Charges d’exploitation',
  s221: 'Charges verticales',
  liveText: 'Exploitation des planchers (DIN EN 13814, public)',
  roofLive: 'Toitures accessibles (terrasses)',
  outOfServiceLive: (e) => `Hors service : ${e}, les autres surfaces restent chargées.`,
  evacuatedTop: 'le dernier niveau et les surfaces extérieures sont évacués',
  evacuatedOutdoor: 'les surfaces extérieures sont évacuées',
  s222: 'Charges horizontales',
  horizontalText: 'Charge horizontale simultanée à l’exploitation verticale, au niveau du plancher, dans les 4 directions (DIN EN 13814) : H = V / 10.',
  handrail: 'Main courante (zones à 3,50 kN/m²) : 0,50 kN/m — garde-corps justifiés dans l’étude de base 18-0573.',
  impact: 'Chocs : non pris en compte, à empêcher par des mesures adaptées.',
  s23: 'Neige',
  snowText: 'Le calcul ne prend pas en compte la neige ; en cas de chute de neige, elle est à empêcher par des mesures techniques ou organisationnelles.',
  s24: 'Vent',
  windTwoStates: 'La construction est dimensionnée pour deux états d’exploitation.',
  inServiceTitle: 'En service (DIN EN 13814)',
  outOfServiceTitle: 'Hors service (DIN EN 1991-1-4/NA, abattement MVV TB Anlage B 2.1/2)',
  outOfServiceText: 'Pression de pointe du profil mixte des catégories de terrain II et III, abattue de 0,7 pour une construction temporaire.',
  cpTitle: 'Coefficients de pression',
  cpRows: [
    ['cp = +0,8', 'face au vent (luv)'],
    ['cp = −0,5', 'face sous le vent (lee)'],
    ['cp = −0,8', 'faces parallèles au vent'],
    ['cp = −0,7', 'succion des toitures du dernier niveau (stabilité)'],
  ],
  internalPressure: 'Pression intérieure : non prise en compte dans le calcul d’ensemble (elle s’équilibre), prise en compte localement pour le plancher (cp,i = +0,8).',
  roofSuction: 'La succion des toitures ne sert qu’à la stabilité (combinaisons COB) ; dans les autres combinaisons, elle est favorable.',
  s25: 'Imperfections et combinaisons',
  imperfection: 'Calcul au 2ᵉ ordre avec un défaut d’aplomb φ = 1/200 (dx = dy = 5,0 mm/m) de l’ensemble, orienté dans le sens de l’action horizontale de chaque combinaison.',
  combosText: 'Combinaisons des notes statico (DIN EN 13814) : ELU (RC1), stabilité (RC2, G favorable 1,0, finitions 50 %, logos 0, vent 1,2) et combinaisons caractéristiques pour les réactions au sol.',
  colId: 'Comb.',
  colClass: 'Type',
  colFactors: 'Cas et coefficients',
  comboClass: { ULS: 'ELU', STAB: 'stabilité', SLS: 'ELS' },
  ch3: 'Vérifications de résistance',
  ch3Intro: (m) => `Les efforts proviennent du calcul aux éléments finis de l’ensemble (théorie du 2ᵉ ordre, défaut d’aplomb 1/200, appuis et contacts en compression seule). Chaque tronçon de barre et chaque assemblage est vérifié pour toutes les combinaisons ELU ; le cas déterminant est imprimé avec ses formules. Vérification des barres acier : ${m}.`,
  method: {
    envelope: 'enveloppe des méthodes classique (EN 1993-1-1 annexe B) et statico (Cm = 0,9, sans flambement au 2ᵉ ordre)',
    classic: 'méthode classique EN 1993-1-1 annexe B',
    statico: 'méthode des notes statico (SCIA)',
  },
  floors: 'Planchers',
  floorsText: 'Contreplaqué de plancher vérifié en bande de 1 m sur la portée maximale entre traverses (statico 24-0571 § 3.5).',
  viewbox: 'Viewbox — barres acier',
  sectionsTitle: 'Sections et matériaux',
  colRole: 'Élément',
  colSection: 'Section',
  colMaterial: 'Matériau',
  figureEta: 'Taux de travail maximal de chaque Viewbox (toutes vérifications)',
  figureEtaMembers: 'Taux de travail maximal des barres acier de chaque Viewbox',
  etaLegend: 'vert ≤ 0,50 · jaune ≤ 0,90 · orange ≤ 1,00 · rouge > 1,00 · violet : non vérifié',
  mostLoaded: 'Éléments les plus sollicités',
  governingPerFamily: 'Vérification déterminante de chaque famille',
  corners: 'Assemblages poteau / cadre (angles)',
  cornersText: 'Platines de 10 mm soudées sur les rives, 4 × M16-8.8 par angle (entraxe 110 mm), 2 plats 180 × 50 × 15 mm intérieurs ; rigidité ≈ 3 500 kNcm/deg dans le modèle. Capacités ideaStatiCa (statico) : biaxial My, Mz ≤ 8,0 kNm ; uniaxial max ≤ 11,5 kNm et min ≤ 3,3 kNm ; N ≤ 70 kN ; la plus favorable des deux interactions est retenue.',
  vlinks: 'Liaisons verticales entre Viewbox empilées',
  vlinksText: 'Plats de liaison 100 × 10 mm (2 par côté, trou Ø 22) : HRd = 5,81 kN par plat et par sens, frottement acier / acier μ = 0,1 ; contact vertical poteau / poteau NRd = 176 kN (soudure du couvercle).',
  bolts: 'Liaisons horizontales (boulons M20-8.8)',
  boltsText: 'Boulons M20-8.8 dans l’âme des UNP (tw = 9 mm), plancher et toiture : cisaillement, traction et interaction selon DIN EN 1993-1-8.',
  ground: 'Pression au sol et calage',
  groundIntro: (s) => `Les réactions sont regroupées par groupe d’appuis (angles posés sur la même plaque). ${s} La portance est à vérifier sur site par l’exploitant ; en cas de sol différent, le calage est à adapter.`,
  groundSourceSls: 'Les réactions caractéristiques viennent des combinaisons ELS du calcul ; les réactions de calcul des combinaisons ELU.',
  groundSourceStatico: 'Les réactions de calcul (ELU) sont ramenées au niveau caractéristique par Rz,k = Rz,Ed / 1,35 (méthode statico).',
  groundCase: (t, b) => `Calage — ${t} — ${b} kN/m²`,
  actions: 'Actions',
  plateTable: { stack: 'Plaques empilées', dims: 'Dimensions', thickness: 'Épaisseur requise par plaque' },
  plateFigure: 'Plaque de calage : surface de contact a1 × a2, plaque b × l, porte-à-faux diagonal e',
  chosenSolution: 'Solution retenue',
  otherSolutions: 'Autres solutions',
  longrine: 'Variante : longrines sous les grands côtés',
  ch4: 'Stabilité d’ensemble',
  stabilityBasis: 'Coefficients des actions (DIN EN 13814) :',
  stabilityFactors: [
    ['charges permanentes favorables', 'γF = 1,0 (*)'],
    ['vent défavorable', 'γF = 1,2'],
  ],
  stabilityFootnote: '(*) Plafonds, murs et sols pris à 50 % ; logos non pris en compte (côté de la sécurité).',
  overturningTitle: 'Basculement',
  slidingTitle: 'Glissement global',
  ch5: 'Conclusion',
  conclusion: {
    ok: (e) => `Dans le cadre des hypothèses de cette pré-étude, la construction est suffisamment résistante et stable (taux de travail maximal η = ${e}). Les exigences et consignes de ce document sont à respecter.`,
    limit: (e) => `Dans le cadre des hypothèses de cette pré-étude, la construction passe avec des taux de travail proches de la limite (η max = ${e}). Toute charge ou tout habillage supplémentaire demande une nouvelle vérification.`,
    fail: (e) => `La construction ne passe pas dans les hypothèses de cette pré-étude (η max = ${e}). Les pistes ci-dessous sont à étudier, puis le calcul à relancer.`,
    incomplete: () => 'La pré-étude est incomplète : des éléments n’ont pas pu être vérifiés (voir les motifs ci-dessous). Aucune conclusion ne peut être tirée tant qu’ils ne sont pas renseignés.',
  },
  reserve: 'Pré-étude interne réalisée avec l’outil VEM, non vérifiée par un ingénieur : elle ne remplace pas une note de calcul visée par un bureau d’études ou un contrôleur (Prüfamt) avant exploitation.',
  remarksTitle: 'Remarques et avertissements',
  hintsTitle: 'Pistes de correction',
  hints: {
    sliding: (kg) => `Glissement : lest d’environ ${kg} kg réparti sur les appuis, ancrage, ou interface de calage à frottement justifié plus élevé (bois / béton 0,6).`,
    overturning: 'Basculement : lester ou ancrer les appuis qui se soulèvent, élargir l’installation (Viewbox côte à côte) ou limiter le vent hors service (démontage anticipé).',
    corners: 'Angles poteau / cadre : ajouter des contreventements (plats 60 × 6 + ridoir ¾") dans les faces les plus sollicitées, ou réduire les charges horizontales.',
    members: 'Barres : réduire l’exploitation ou les charges portées, supprimer un habillage exposé au vent, ou renforcer localement.',
    ground: 'Sol : plaques plus grandes, longrines sous les grands côtés, ou portance plus élevée à justifier.',
    plywood: 'Plancher : réduire l’exploitation ou ajouter une lisse intermédiaire.',
    blocked: 'Éléments non vérifiés : renseigner les données manquantes (reconnaissance, bibliothèque) puis relancer le calcul.',
    jacks: 'Vérins : renseigner leur capacité dans la bibliothèque (VBX-JACK) ou poser les angles directement sur le calage.',
  },
  annex: 'Annexe de calcul',
  b1: 'Modèle de calcul',
  modelCounts: (n, m, s) => `${n} nœuds, ${m} barres, ${s} appuis (compression seule, ressorts horizontaux 50 kN/cm).`,
  sectionsAnnex: 'Sections',
  materialsAnnex: 'Matériaux',
  springsTitle: 'Liaisons du modèle',
  springs: [
    ['Poteau / cadre', 'rotation semi-rigide 3 500 kNcm/deg (ideaStatiCa)'],
    ['Boulon horizontal', '50 kN/cm par demi-boulon (grands côtés : deux en série), rotations libres'],
    ['Liaison d’angle empilée', 'QRO 100 × 4 sans masse, 10 kN/cm en cisaillement'],
    ['Contact d’angle', 'barre en compression seule, sans masse'],
    ['Appui', 'compression seule, 50 kN/cm horizontalement, libéré s’il se soulève'],
  ],
  b2: 'Cas de charge',
  colCase: 'Cas',
  colLabel: 'Désignation',
  b3: 'Combinaisons',
  b4: 'Vérifications',
  b5: 'Réactions d’appui par groupe',
  colGroup: 'Groupe',
  colModules: 'Viewbox',
  b6: 'Messages du calcul',
  none: 'aucun',
  calagePlan: 'Plan de calage',
  calagePlanTitle: 'Plan de calage — niveau 0',
};

const DE: Labels = {
  heightWindWarning: (h, q) => `Höhe der Anlage ${h} m > 8 m: DIN EN 13814 fordert q = 0,30 kN/m² in Betrieb (angesetzt: ${q} kN/m²).`,
  bearingMissing: 'Zulässige Bodenpressung nicht angegeben: Unterpallung nicht bemessen.',
  aiNote: 'Text mit KI-Unterstützung aus den Berechnungsergebnissen verfasst und geprüft; keine Zahl stammt aus der KI (automatische Kontrolle).',
  overturningFail: (c, m) => `Kippen unter Wind außer Betrieb (${c}): ein Auflager von ${m} hebt ab und die Anlage wird instabil — Ballast oder Verankerung erforderlich.`,
  jacksYes: 'verwendet (Tragfähigkeit und maximale Auszugslänge nachzuweisen)',
  jacksNo: 'nicht verwendet: Ecken direkt unterpallt',
  combosNote: (n) => `Nur Richtung x+; die Richtungen x−, y+ und y− sind bis auf das Vorzeichen gleich (insgesamt ${n} berechnete Kombinationen, vollständige Liste in der ausführlichen Fassung).`,
  supportsFigure: 'Auflagergruppen (Farbe = Typ) und maximale charakteristische Reaktion Rz,k',
  contactArea: 'Aufstandsfläche',
  curves: 'KL',
  colFamily: 'Bauteilgruppe',
  colMembers: 'Stäbe',
  colLength: 'Gesamtlänge',
  watermark: 'Vorabzug – ungeprüft (interne Vorbemessung)',
  coverWarning: 'VORABZUG – UNGEPRÜFT · INTERNE VORBEMESSUNG',
  header: { number: 'Projekt-Nr.', client: 'Auftraggeber', project: 'Projektname' },
  footer: 'Viewbox International SA · VEM Statische Vorbemessung',
  verdict: { ok: 'erfüllt', limit: 'grenzwertig', fail: 'nicht erfüllt', incomplete: 'unvollständig' },
  verdictSentence: {
    ok: 'Nachweise erfüllt',
    limit: 'Nachweise erfüllt, grenzwertig',
    fail: 'Nachweise nicht erfüllt',
    incomplete: 'Vorbemessung unvollständig',
  },
  combination: 'Maßgebende Kombination',
  elements: 'Bauteile',
  coverTitle: 'Statische Vorbemessung',
  coverSubtitle: 'Modularer Fliegender Bau aus Viewbox-Containermodulen',
  coverFields: {
    client: 'Auftraggeber',
    project: 'Projekt',
    number: 'Projekt-Nr.',
    address: 'Aufstellort',
    installation: 'Aufbau',
    model: 'Modell',
    author: 'Bearbeiter',
    date: 'Datum',
    software: 'Software',
    variant: 'Fassung',
  },
  variant: { compact: 'kompakt', detailed: 'ausführlich (mit EDV-Anhang)' },
  coverPages: (m, a) => `Diese Vorbemessung umfasst ${m} Seiten${a ? ` und ${a} Seiten EDV-Anhang` : ''} zzgl. Deckblatt.`,
  toc: 'Inhaltsverzeichnis',
  summary: 'Zusammenfassung',
  installation: 'Anlage',
  modulesOnLevels: (n, l) => `${n} Viewbox in ${l} Geschoss${l > 1 ? 'en' : ''}`,
  approxDims: (a, b, c) => `ca. ${a} × ${b} × ${c} m (B × T × H)`,
  overallDims: 'Gesamtanlage',
  moduleDims: 'Einzelne Viewbox',
  totalPermanent: 'Ständige Lasten',
  imposed: 'Verkehrslast',
  windInOut: 'Wind in Betrieb / außer Betrieb',
  maxEta: 'Maximale Ausnutzungen',
  colCheck: 'Nachweis',
  colCount: 'Anz.',
  colEta: 'η max',
  colElement: 'Maßgebendes Bauteil',
  colCombo: 'LK',
  plywoodRow: 'Bodenplatte Sperrholz (1-m-Streifen)',
  slidingRow: (mu) => `Globale Gleitsicherheit (μ = ${mu})`,
  overturningRow: 'Kippsicherheit',
  groundRow: 'Bodenpressung und Unterpallung',
  groundTitle: 'Bodenpressung und Unterpallung',
  colSupport: 'Auflager',
  colSolution: 'Gewählte Unterpallung',
  materialsTitle: 'Vorzubereitendes Unterpallungsmaterial',
  colDesignation: 'Bezeichnung',
  colDims: 'Abmessungen',
  colQty: 'Anzahl',
  colMass: 'Masse',
  noStandardSolution: 'keine Standardlösung: gesonderte Lastverteilung erforderlich',
  windOperation: 'Betrieb bei Starkwind',
  shutdown: (v, s) => `Einstellen des Betriebs und Räumung ${s} spätestens bei Böengeschwindigkeiten von ${v} m/s (Wind in Betrieb nach DIN EN 13814).`,
  outdoorSurfaces: 'aller Außenflächen',
  topLevelAndOutdoor: 'des obersten Geschosses und aller Außenflächen',
  notCovered: 'Nicht Bestandteil dieser Vorbemessung',
  notCoveredItems: {
    glazing: 'Verglasungen: gesonderter Nachweis nach DIN 18008.',
    cladding: 'Verkleidungen (Wände, Decken, Böden) und deren Befestigungen.',
    logo: 'Logos, Werbeanlagen und deren Befestigungen.',
    steps: 'Treppenstufen: für Spannweiten und Lasten zugelassene Stufen wählen.',
    decking: 'Terrassenbelag (WPC …): gemäß Zulassung.',
    railings: 'Geländer: nachgewiesen in der Grundstatik statico 18-0573 (Holmlast 0,50 kN/m).',
    blocking: 'Nicht modellierte Bauteile (Vorbemessung unvollständig)',
  },
  reasons: 'Gründe',
  ch1: 'Vorbemerkungen, Grundlagen und Hinweise',
  s11: 'Berechnungsgrundlagen und Konstruktionsbeschreibung',
  basisText: (f, d) => `Dieser Vorbemessung liegen das in VEM ausgewertete SketchUp-Modell „${f}“ (Stand ${d}) und die in der Studie erfassten Annahmen zu Grunde. Alle Werte werden vom Rechenkern des Programms ermittelt (keine Werte aus der KI).`,
  descriptionTitle: 'Konstruktionsbeschreibung',
  descriptionText: (n, l) =>
    `Die vorliegende Konstruktion ist ein modularer Fliegender Bau aus ${n} Stahl-Containermodulen („Viewbox“)${l > 1 ? ` in ${l} Geschossen` : ''}. Die Grundmodule bestehen aus einem Bodenelement, vier verschraubten Stützen und einem Dachelement. Die wesentlichen Tragelemente bilden die verschweißten bzw. verschraubten Stahlprofile; die Stabilität wird durch das Eigengewicht und die Rahmen (nachgiebige Eckverbindungen) sichergestellt. Benachbarte Viewboxen werden horizontal verschraubt (M20-8.8), übereinander stehende über ihre Eckverbindungslaschen verbunden.`,
  outerDims: 'Äußere Abmessungen',
  figure3d: '3D-Ansicht des Modells',
  figurePlan: 'Draufsicht mit Bezeichnung der Viewboxen (übereinander stehende Nummern sind gestapelt)',
  figureFaces: 'Verkleidete Wände je Geschoss',
  levelName: (l) => (l === 0 ? 'EG' : `${l}. OG`),
  facesLegend: { closed: 'geschlossene Wand (Wand, Verglasung, Tür)', open: 'offene Seite', shared: 'Innenseite (angrenzende Viewbox)' },
  claddingNote: 'Das Logo, die Verkleidung der Wände und Decken sowie deren Befestigungen sind nicht Bestandteil dieser Vorbemessung und werden als ausreichend tragfähig vorausgesetzt. Ggf. sind gesonderte Nachweise zu führen.',
  s12: 'Allgemeine Hinweise',
  generalNotes: [
    'Bei Abweichungen jeglicher Art von den Angaben in diesem Dokument ist umgehend der Aufsteller zu informieren. Die Vorbemessung verliert u. U. ihre Gültigkeit.',
    'Die ausführende Firma ist für die Standsicherheit der Bauzustände, die Güte der verwendeten Materialien und Bauteile sowie die fachgerechte Montage verantwortlich. Der fachgerechte Betrieb unterliegt der Verantwortung des Betreibers.',
    'Der Untergrund muss ausreichend tragfähig sein, um die Belastungen aus der Konstruktion sicher aufzunehmen. Andernfalls sind geeignete lastverteilende Maßnahmen zu treffen. Unebenheiten sind auszugleichen.',
    'Alle Stahlbauteile sind mit einem geeigneten Korrosionsschutz zu versehen.',
    'Alle Schweißarbeiten dürfen nur von dafür zugelassenem Fachpersonal ausgeführt werden.',
    'Es dürfen nur kaltgefertigte Hohlprofile benutzt werden, die gemäß DIN EN 1993-1-8 Tabelle 4.2 im kaltgeformten Bereich geschweißt werden dürfen.',
    'Sofern nichts Abweichendes angegeben wird, sind bei allen Verbindungsmitteln die Abstände zu den Rändern und untereinander sowie die Mindesteinbindetiefen einzuhalten.',
    'Ein ungewolltes Lösen von Verbindungen ist auf geeignete Weise zu verhindern.',
    'Alle nicht angegebenen Querschnitte und Anschlüsse sind nach den Regeln der Technik zu wählen und auszubilden.',
    'Einbauvorschriften, bauaufsichtliche Zulassungen und Aufbau- bzw. Betriebshinweise der Hersteller sind zu beachten.',
  ],
  jacksForbidden: 'Die integrierten Spindelfüße der Viewbox dürfen nicht verwendet werden, da die Fußaufnahmen sonst überlastet wären. Die Spindeln sind zu entfernen und die Ecken direkt zu unterpallen.',
  jacksUsed: 'Spindelfüße verwendet: Tragfähigkeit und maximale Auszugslänge sind in der Bibliothek nicht erfasst — vor Inbetriebnahme nachzuweisen.',
  glazingNote: 'Verglasungen: der Nachweis nach DIN 18008 ist nicht Bestandteil dieser Vorbemessung.',
  impactNote: 'Personen- oder Fahrzeuganprall wird nicht berücksichtigt und ist durch geeignete Maßnahmen zu verhindern.',
  snowNote: 'Schneelasten werden nicht berücksichtigt und sind technisch / organisatorisch zu verhindern.',
  s13: 'Grundlagen der Windeinwirkungen und Starkwind-Maßnahmenplan',
  windConditions: (qp, v) => `Außer Betrieb ist die Konstruktion für einen Böengeschwindigkeitsdruck qp = ${qp} kN/m² nachgewiesen (DIN EN 1991-1-4/NA, Abminderung 0,7 für Fliegende Bauten nach MVV TB Anlage B 2.1/2), entsprechend einer Böe von ${v} m/s.`,
  windInService: (q, v, s) => `In Betrieb beträgt der Staudruck q = ${q} kN/m² (DIN EN 13814): der Betrieb ist einzustellen und die Räumung ${s} spätestens bei Böengeschwindigkeiten von ${v} m/s gefährdungsfrei abzuschließen. Eine geeignete Überwachung der Windgeschwindigkeit ist durchzuführen.`,
  windTerrain: 'Die Bemessung erfolgt unter Annahme eines dem Geländeniveau entsprechenden Aufbaus. Bei erhöhten Standorten (Hügel, Podest o. ä.) ist Rücksprache mit dem Aufsteller zu halten. Versperrungen unterhalb der Konstruktion wurden nicht berücksichtigt.',
  windWater: 'Das Bilden von Wasseransammlungen ist durch konstruktive oder organisatorische Maßnahmen zu verhindern.',
  windPlanTitle: 'Starkwind-Maßnahmenplan',
  colThreshold: 'Stufe',
  colSpeed: 'Böe',
  colAction: 'Maßnahme',
  windPlan: {
    watch: ['Vorwarnung', 'Verstärkte Überwachung (Anemometer alle 15 min ablesen), Verantwortlichen informieren, Räumung der Außenflächen vorbereiten.'],
    stop: ['Betriebseinstellung', 'Betrieb einstellen; Terrassen, oberstes Geschoss und Außenflächen räumen; Türen und Zugänge schließen.'],
    limit: ['Grenze außer Betrieb', 'Bemessungsgrenze außer Betrieb: niemand in oder in der Nähe der Konstruktion, Sicherheitsabstand einhalten.'],
  },
  windPlanNotes: [
    'Anemometer auf der Konstruktion oder in unmittelbarer Nähe in Dachhöhe, jederzeit ablesbar.',
    'Ein benannter Verantwortlicher vor Ort entscheidet über Betriebseinstellung und Räumung.',
    'Tägliches Protokoll: gemessene Geschwindigkeiten, getroffene Maßnahmen, Uhrzeit und Verantwortlicher.',
  ],
  s14: 'Zusammenfassung Verankerung und Unterpallung',
  overturning: 'Kippsicherheit',
  sliding: 'Globale Gleitsicherheit',
  slidingValue: (r, m) => `erf. μ = ${r} ; vorh. μ = ${m}`,
  ballast: 'Ballast',
  ballastNone: 'kein Ballast erforderlich',
  ballastRequired: (k, g) => `Ballast gesamt ≥ ${k} kN (≈ ${g} kg), auf die Auflager verteilt, oder Verankerung`,
  ballastOverturning: 'Ballast oder Verankerung zu bemessen (Kippen)',
  jacks: 'Spindelfüße',
  bearing: 'Zulässige Bodenpressung',
  bearingValue: (v, l) => `${v} kN/m² (${l})`,
  groundNote: 'Die Bodenbelastbarkeit ist eigenverantwortlich vor Ort durch den Betreiber zu prüfen.',
  s15: 'Materialien, Vorschriften, Literatur und Software',
  materialsText: 'Stahl S235 und S275 (Profile und Hohlprofile), Sperrholz F20/15 (Böden, Dächer), Sperrholz F40/30 (Unterpallung), Holz C24 (Kanthölzer). Die Materialien sind den Einzelnachweisen in Kapitel 3 zu entnehmen.',
  normsTitle: 'Vorschriften',
  norms: [
    ['DIN EN 1990', 'Grundlagen der Tragwerksplanung'],
    ['DIN EN 1991-1', 'Einwirkungen auf Tragwerke (+ NA)'],
    ['DIN EN 1993-1', 'Bemessung und Konstruktion von Stahlbauten (+ NA)'],
    ['DIN EN 1995-1', 'Bemessung und Konstruktion von Holzbauten (+ NA)'],
    ['DIN EN 13814', 'Fliegende Bauten und Anlagen für Veranstaltungsplätze und Vergnügungsparks'],
    ['MVV TB', 'Anlage B 2.1/2: Windlasten für Fliegende Bauten'],
  ],
  docsTitle: 'Unterlagen',
  docs: [
    'statico 18-0573 „Viewbox – Modulares Containersystem“ (Grundstatik, Geländer).',
    'statico 24-0571 „Viewbox – Hoka“ und 24-0569 „Viewbox – Qatar“ (SCIA-Referenzmodelle des Moduls und der Nachweise).',
    'Pläne Spantech „VIEWBOX M16 60MM“ (Gewicht 2 564 kg inkl. Böden und Dämmung).',
  ],
  softwareTitle: 'Software',
  softwareText: (v) => `VEM · Plans Viewbox · Étude structure ${v}: räumliches Stabwerksmodell (Stäbe, Federn, nur druckaktive Kontakte und Auflager), Berechnung nach Theorie II. Ordnung, Nachweise nach DIN EN 1993 / 1995 und der Viewbox-Verbindungen.`,
  ch2: 'Lastannahmen',
  s21: 'Ständige Lasten',
  weighed: (k, g) => `Gewogenes Eigengewicht einer Viewbox (Boden-, Dacheinheit und Stützen inkl. Böden und Dämmung, ohne Wände und Geländer): G ≈ ${k} kN (${g} kg).`,
  steelWeight: 'Eigengewicht der Stäbe anhand der Material- und Querschnittsdefinitionen, Stahl 78,5 kN/m³; die Differenz zum gewogenen Gewicht wird auf die Bodenrandträger verteilt.',
  ceiling: 'Deckenverkleidung inkl. Dämmung',
  walls: 'Wände, Verglasungen, Türen',
  wallsNone: 'keine',
  wallRow: (l, q, len) => `${l}: ${q} kN/m auf ${len} m`,
  floor: 'Bodenbelag inkl. Dämmung',
  railings: 'Geländer',
  logos: 'Logos und Einzellasten',
  pointRow: (l, F) => `${l}: ${F} kN`,
  s22: 'Verkehrslasten',
  s221: 'Vertikale Verkehrslasten',
  liveText: 'Verkehrslast nach DIN EN 13814 (öffentliche Begehung)',
  roofLive: 'Begehbare Dächer (Terrassen)',
  outOfServiceLive: (e) => `Außer Betrieb: ${e}, die übrigen Flächen bleiben belastet.`,
  evacuatedTop: 'oberstes Geschoss und Außenflächen sind geräumt',
  evacuatedOutdoor: 'Außenflächen sind geräumt',
  s222: 'Horizontale Verkehrslasten',
  horizontalText: 'Horizontallast gleichzeitig mit der vertikalen Verkehrslast in Höhe der Bodenebene, in den 4 Richtungen (DIN EN 13814): H = V / 10.',
  handrail: 'Holmlast (Bereiche mit 3,50 kN/m²): 0,50 kN/m — Geländer in der Grundstatik 18-0573 nachgewiesen.',
  impact: 'Anprall: nicht berücksichtigt, durch geeignete Maßnahmen zu verhindern.',
  s23: 'Schneelasten',
  snowText: 'Die Bemessung erfolgt ohne Berücksichtigung von Schneelasten. Entsprechende Einwirkungen müssen bei ggf. auftretendem Schneefall technisch / organisatorisch verhindert werden.',
  s24: 'Windlasten',
  windTwoStates: 'Die Konstruktion wird für zwei Betriebszustände dimensioniert.',
  inServiceTitle: 'In Betrieb (DIN EN 13814)',
  outOfServiceTitle: 'Außer Betrieb (DIN EN 1991-1-4/NA, Abminderung nach MVV TB Anlage B 2.1/2)',
  outOfServiceText: 'Böengeschwindigkeitsdruck des Mischprofils der Geländekategorien II und III, abgemindert mit 0,7 für Fliegende Bauten.',
  cpTitle: 'Aerodynamische Beiwerte',
  cpRows: [
    ['cp = +0,8', 'Luv'],
    ['cp = −0,5', 'Lee'],
    ['cp = −0,8', 'windparallele Wände'],
    ['cp = −0,7', 'Dachsog der obersten Container (Lagesicherheit)'],
  ],
  internalPressure: 'Innendruck/-sog: in der Gesamtberechnung nicht berücksichtigt (hebt sich global auf), lokal beim Nachweis der Bodenplatten berücksichtigt (cp,i = +0,8).',
  roofSuction: 'Der Dachsog wird nur für die Lagesicherheit angesetzt (Kombinationen COB); in den übrigen Kombinationen wirkt er günstig.',
  s25: 'Imperfektionen und Kombinationen',
  imperfection: 'Berechnung nach Theorie II. Ordnung mit einer Schiefstellung φ = 1/200 (dx = dy = 5,0 mm/m) der Gesamtstruktur in Richtung der horizontalen Einwirkung jeder Kombination.',
  combosText: 'Kombinationen der statico-Berechnungen (DIN EN 13814): GZT (RC1), Lagesicherheit (RC2, günstige ständige Lasten 1,0, Ausbau 50 %, Logos 0, Wind 1,2) und charakteristische Kombinationen für die Auflagerreaktionen.',
  colId: 'LK',
  colClass: 'Art',
  colFactors: 'Lastfälle und Beiwerte',
  comboClass: { ULS: 'GZT', STAB: 'Lagesicherheit', SLS: 'GZG' },
  ch3: 'Nachweise der Tragfähigkeit',
  ch3Intro: (m) => `Die Schnittgrößen stammen aus der räumlichen Stabwerksberechnung der Gesamtanlage (Theorie II. Ordnung, Schiefstellung 1/200, nur druckaktive Auflager und Kontakte). Jeder Stababschnitt und jede Verbindung wird für alle GZT-Kombinationen nachgewiesen; der maßgebende Fall wird mit seinen Formeln ausgegeben. Stahlnachweis: ${m}.`,
  method: {
    envelope: 'Einhüllende aus klassischem Verfahren (EN 1993-1-1 Anhang B) und statico-Verfahren (Cm = 0,9, ohne Knicken nach Theorie II. Ordnung)',
    classic: 'klassisches Verfahren EN 1993-1-1 Anhang B',
    statico: 'Verfahren der statico-Berechnungen (SCIA)',
  },
  floors: 'Boden-/Dachverkleidungen',
  floorsText: 'Bodenplatte aus Sperrholz als 1-m-Streifen über die größte Spannweite zwischen den Nebenträgern nachgewiesen (statico 24-0571 Kap. 3.5).',
  viewbox: 'Viewbox — Stahlbauteile',
  sectionsTitle: 'Querschnitte und Materialien',
  colRole: 'Bauteil',
  colSection: 'Querschnitt',
  colMaterial: 'Material',
  figureEta: 'Maximale Ausnutzung je Viewbox (alle Nachweise)',
  figureEtaMembers: 'Maximale Ausnutzung der Stahlbauteile je Viewbox',
  etaLegend: 'grün ≤ 0,50 · gelb ≤ 0,90 · orange ≤ 1,00 · rot > 1,00 · violett: nicht nachgewiesen',
  mostLoaded: 'Am höchsten ausgenutzte Bauteile',
  governingPerFamily: 'Maßgebender Nachweis je Bauteilgruppe',
  corners: 'Eckverbindung der Stütze mit den Boden- bzw. Dachelementen',
  cornersText: '10-mm-Flanschplatten an den Randträgern geschweißt, vier M16-8.8 je Ecke (Abstand 110 mm), zwei 180 × 50 × 15 mm Platten innenliegend; Nachgiebigkeit ca. 3 500 kNcm/deg im Gesamtmodell. Tragfähigkeiten aus ideaStatiCa (statico): zweiachsig My, Mz ≤ 8,0 kNm; einachsig max ≤ 11,5 kNm und min ≤ 3,3 kNm; N ≤ 70 kN; die günstigere Ausnutzung wird gewählt.',
  vlinks: 'Nachweis der vertikalen Verbindungen',
  vlinksText: 'Verbindungslaschen 100 × 10 mm (2 je Seite, Loch Ø 22): HRd = 5,81 kN je Lasche und Richtung, Reibung Stahl / Stahl μ = 0,1; vertikaler Druckkontakt Stütze / Stütze NRd = 176 kN (Deckelnaht).',
  bolts: 'Nachweis der horizontalen Verschraubungen',
  boltsText: 'M20-8.8 im Steg der UNP (tw = 9 mm), Boden und Dach: Abscheren, Zug und Interaktion nach DIN EN 1993-1-8.',
  ground: 'Bodenpressung und Unterpallung',
  groundIntro: (s) => `Die Auflagerreaktionen sind die resultierende Reaktion der jeweiligen Auflagergruppe (Ecken auf einer gemeinsamen Unterpallung). ${s} Die Bodenbelastbarkeit ist vor Ort zu prüfen; bei abweichenden Bodenverhältnissen ist die Unterpallung anzupassen.`,
  groundSourceSls: 'Die charakteristischen Reaktionen stammen aus den GZG-Kombinationen, die Bemessungswerte aus den GZT-Kombinationen.',
  groundSourceStatico: 'Die Bemessungswerte werden näherungsweise mit γ = 1,35 auf ein charakteristisches Niveau zurückgerechnet (statico-Verfahren).',
  groundCase: (t, b) => `Unterpallung — ${t} — ${b} kN/m²`,
  actions: 'Einwirkungen',
  plateTable: { stack: 'Gestapelte Platten', dims: 'Abmessungen', thickness: 'Erforderliche Dicke je Platte' },
  plateFigure: 'Unterpallung: Aufstandsfläche a1 × a2, Platte b × l, diagonaler Überstand e',
  chosenSolution: 'Gewählte Lösung',
  otherSolutions: 'Alternativen',
  longrine: 'Variante: Kanthölzer unter den Längsseiten',
  ch4: 'Nachweise der Lagesicherheit',
  stabilityBasis: 'Beiwerte der Einwirkungen gemäß DIN EN 13814:',
  stabilityFactors: [
    ['günstig wirkende ständige Lasten', 'γF = 1,0 (*)'],
    ['ungünstig wirkende Windlasten', 'γF = 1,2'],
  ],
  stabilityFootnote: '(*) Decken, Wände und Böden werden auf der sicheren Seite nur zu 50 % angesetzt, Logos gar nicht.',
  overturningTitle: 'Nachweis Kippsicherheit',
  slidingTitle: 'Nachweis (globale) Gleitsicherheit',
  ch5: 'Schlussbemerkungen',
  conclusion: {
    ok: (e) => `Die Konstruktion wurde im Rahmen der Annahmen dieser Vorbemessung untersucht und als ausreichend standsicher ermittelt (maximale Ausnutzung η = ${e}). Die Anforderungen und Hinweise dieses Dokuments sind zu beachten und einzuhalten.`,
    limit: (e) => `Im Rahmen der Annahmen dieser Vorbemessung ist die Konstruktion mit grenzwertigen Ausnutzungen nachgewiesen (η max = ${e}). Zusätzliche Lasten oder Verkleidungen erfordern einen erneuten Nachweis.`,
    fail: (e) => `Die Konstruktion ist im Rahmen der Annahmen dieser Vorbemessung nicht nachgewiesen (η max = ${e}). Die nachfolgenden Maßnahmen sind zu prüfen und die Berechnung ist zu wiederholen.`,
    incomplete: () => 'Die Vorbemessung ist unvollständig: einige Bauteile konnten nicht nachgewiesen werden (siehe Gründe). Eine Aussage ist erst nach Ergänzung der Angaben möglich.',
  },
  reserve: 'Interne Vorbemessung mit dem VEM-Werkzeug, nicht von einem Ingenieur geprüft: sie ersetzt keine geprüfte statische Berechnung (Prüfamt für Fliegende Bauten) vor der Inbetriebnahme.',
  remarksTitle: 'Hinweise und Warnungen',
  hintsTitle: 'Mögliche Maßnahmen',
  hints: {
    sliding: (kg) => `Gleiten: Ballast von ca. ${kg} kg auf die Auflager verteilt, Verankerung oder Unterpallung mit höherem nachgewiesenem Reibbeiwert (Holz / Beton 0,6).`,
    overturning: 'Kippen: abhebende Auflager ballastieren oder verankern, Anlage verbreitern (Viewboxen nebeneinander) oder Wind außer Betrieb begrenzen (vorzeitiger Abbau).',
    corners: 'Eckverbindungen: Wandverbände (Flachstahl 60 × 6 + Spannschloss ¾") in den am stärksten beanspruchten Wänden anordnen oder Horizontallasten reduzieren.',
    members: 'Stäbe: Verkehrslast oder Auflasten reduzieren, windbeanspruchte Verkleidung entfernen oder örtlich verstärken.',
    ground: 'Boden: größere Platten, Kanthölzer unter den Längsseiten oder höhere nachgewiesene Bodenpressung.',
    plywood: 'Boden: Verkehrslast reduzieren oder zusätzlichen Nebenträger anordnen.',
    blocked: 'Nicht nachgewiesene Bauteile: fehlende Angaben ergänzen (Erkennung, Bibliothek) und die Berechnung wiederholen.',
    jacks: 'Spindeln: Tragfähigkeit in der Bibliothek erfassen (VBX-JACK) oder Ecken direkt unterpallen.',
  },
  annex: 'EDV-Anhang',
  b1: 'Berechnungsmodell',
  modelCounts: (n, m, s) => `${n} Knoten, ${m} Stäbe, ${s} Auflager (nur druckaktiv, horizontale Federn 50 kN/cm).`,
  sectionsAnnex: 'Querschnitte',
  materialsAnnex: 'Materialien',
  springsTitle: 'Verbindungen im Modell',
  springs: [
    ['Stütze / Rahmen', 'nachgiebige Einspannung 3 500 kNcm/deg (ideaStatiCa)'],
    ['Horizontale Schraube', '50 kN/cm je halber Schraube (Längsseiten: zwei in Reihe), Rotationen frei'],
    ['Eckverbindung gestapelt', 'QRO 100 × 4 masselos, 10 kN/cm Schub'],
    ['Druckkontakt Ecke', 'nur druckaktiver Stab, masselos'],
    ['Auflager', 'nur druckaktiv, horizontal 50 kN/cm, bei Abheben gelöst'],
  ],
  b2: 'Lastfälle',
  colCase: 'LF',
  colLabel: 'Bezeichnung',
  b3: 'Lastfallkombinationen',
  b4: 'Nachweise',
  b5: 'Auflagerreaktionen je Gruppe',
  colGroup: 'Gruppe',
  colModules: 'Viewbox',
  b6: 'Meldungen der Berechnung',
  none: 'keine',
  calagePlan: 'Unterpallungsplan',
  calagePlanTitle: 'Unterpallungsplan — EG',
};

const EN: Labels = {
  heightWindWarning: (h, q) => `Installation height ${h} m > 8 m: DIN EN 13814 requires q = 0.30 kN/m² in service (value used: ${q} kN/m²).`,
  bearingMissing: 'Ground bearing capacity not entered: packing not designed.',
  aiNote: 'Text drafted with AI assistance from the calculation results, then reviewed; no figure comes from the AI (automatic check).',
  overturningFail: (c, m) => `Overturning under out-of-service wind (${c}): a support of ${m} lifts off and the installation becomes unstable — ballast or anchorage required.`,
  jacksYes: 'used (capacity and maximum extension to be justified)',
  jacksNo: 'not used: corners placed directly on the packing',
  combosNote: (n) => `Direction x+ only; directions x−, y+ and y− are identical except for the sign (${n} combinations computed in total, full list in the detailed version).`,
  supportsFigure: 'Support groups (colour = type) and maximum characteristic reaction Rz,k',
  contactArea: 'Contact area',
  curves: 'Curves',
  colFamily: 'Family',
  colMembers: 'Members',
  colLength: 'Total length',
  watermark: 'Internal pre-study — not checked by an engineer',
  coverWarning: 'INTERNAL PRE-STUDY — NOT CHECKED BY AN ENGINEER',
  header: { number: 'Project no.', client: 'Client', project: 'Project' },
  footer: 'Viewbox International SA · VEM Structural study',
  verdict: { ok: 'passes', limit: 'at the limit', fail: 'fails', incomplete: 'incomplete' },
  verdictSentence: {
    ok: 'The configuration passes',
    limit: 'The configuration passes, at the limit',
    fail: 'The configuration fails',
    incomplete: 'Incomplete pre-study',
  },
  combination: 'Governing combination',
  elements: 'Elements',
  coverTitle: 'Structural pre-study',
  coverSubtitle: 'Modular temporary structure made of Viewbox units',
  coverFields: {
    client: 'Client',
    project: 'Project',
    number: 'Project no.',
    address: 'Location',
    installation: 'Installation',
    model: 'Model',
    author: 'Prepared by',
    date: 'Report date',
    software: 'Software',
    variant: 'Version',
  },
  variant: { compact: 'compact', detailed: 'detailed (with calculation appendix)' },
  coverPages: (m, a) => `This report has ${m} pages${a ? ` and ${a} appendix pages` : ''}, plus the cover page.`,
  toc: 'Contents',
  summary: 'Summary',
  installation: 'Installation',
  modulesOnLevels: (n, l) => `${n} Viewbox units on ${l} level${l > 1 ? 's' : ''}`,
  approxDims: (a, b, c) => `approx. ${a} × ${b} × ${c} m (L × W × H)`,
  overallDims: 'Overall dimensions',
  moduleDims: 'Single Viewbox',
  totalPermanent: 'Permanent loads',
  imposed: 'Imposed load',
  windInOut: 'Wind in service / out of service',
  maxEta: 'Maximum utilisation',
  colCheck: 'Check',
  colCount: 'No.',
  colEta: 'η max',
  colElement: 'Governing element',
  colCombo: 'Comb.',
  plywoodRow: 'Plywood floor (1 m strip)',
  slidingRow: (mu) => `Global sliding (μ = ${mu})`,
  overturningRow: 'Overturning',
  groundRow: 'Ground pressure and packing',
  groundTitle: 'Ground loads and packing',
  colSupport: 'Support',
  colSolution: 'Chosen packing',
  materialsTitle: 'Packing material to prepare',
  colDesignation: 'Item',
  colDims: 'Dimensions',
  colQty: 'Quantity',
  colMass: 'Mass',
  noStandardSolution: 'no standard solution: specific load spreading design required',
  windOperation: 'Operation in high winds',
  shutdown: (v, s) => `Stop operation and evacuate ${s} at the latest at ${v} m/s (gust), in-service wind of DIN EN 13814.`,
  outdoorSurfaces: 'all outdoor areas',
  topLevelAndOutdoor: 'the top level and all outdoor areas',
  notCovered: 'Not covered by this pre-study',
  notCoveredItems: {
    glazing: 'Glazing: separate verification to DIN 18008.',
    cladding: 'Cladding (walls, ceilings, floors) and its fixings.',
    logo: 'Logos, signs and their fixings.',
    steps: 'Stair treads: to be chosen with an approval for the spans and loads.',
    decking: 'Terrace decking (WPC…): according to its approval.',
    railings: 'Railings: verified in the statico base study 18-0573 (handrail load 0.50 kN/m).',
    blocking: 'Elements not modelled (incomplete verdict)',
  },
  reasons: 'Reasons',
  ch1: 'Preliminary remarks, basis and instructions',
  s11: 'Design basis and description of the structure',
  basisText: (f, d) => `This pre-study is based on the SketchUp model “${f}” analysed in VEM (version of ${d}) and on the assumptions entered in the study. All values are computed by the tool's calculation engine (no value is estimated by AI).`,
  descriptionTitle: 'Description of the structure',
  descriptionText: (n, l) =>
    `The structure is a modular temporary structure (“Fliegender Bau”) made of ${n} steel “Viewbox” units placed side by side${l > 1 ? ` and stacked on ${l} levels` : ''}. Each Viewbox consists of a floor element, four bolted columns and a roof element. The load-bearing elements are welded or bolted steel sections; stability is provided by self-weight and by the frames (semi-rigid column-to-frame joints). Adjacent units are bolted together (M20-8.8) and stacked units are connected by their corner link plates.`,
  outerDims: 'Outer dimensions',
  figure3d: '3D view of the model',
  figurePlan: 'Plan view with Viewbox references (numbers shown together are stacked)',
  figureFaces: 'Clad faces per level',
  levelName: (l) => (l === 0 ? 'Ground level' : `Level ${l}`),
  facesLegend: { closed: 'closed face (wall, glazing, door)', open: 'open face', shared: 'shared face' },
  claddingNote: 'Cladding (walls, glazing, ceilings), the logo and their fixings are not covered by this pre-study and are assumed to be sufficiently strong. Separate verifications are to be provided where required.',
  s12: 'General instructions',
  generalNotes: [
    'Any deviation from the data of this document must be reported immediately: the pre-study may lose its validity.',
    'The installation company is responsible for stability during erection, for the quality of the materials and parts used and for proper assembly. The operator is responsible for the operation of the structure.',
    'The ground must be able to carry the loads of the structure; otherwise, suitable load spreading measures are to be taken. Unevenness of the ground is to be compensated.',
    'All steel parts must be protected against corrosion.',
    'Welding may only be carried out by qualified personnel.',
    'Only cold-formed hollow sections that may be welded in the cold-formed zone (DIN EN 1993-1-8, table 4.2) are allowed.',
    'Unless stated otherwise, edge and spacing distances of fasteners and minimum embedment depths are to be respected.',
    'Unintended loosening of connections is to be prevented by suitable means.',
    'Sections and connections not specified are to be chosen and detailed according to good practice.',
    'Manufacturers’ installation instructions, approvals and operating instructions are to be followed.',
  ],
  jacksForbidden: 'The integrated jack feet of the Viewbox units must not be used (the foot receptacles would be overloaded): the jacks are removed and the corners placed directly on the packing.',
  jacksUsed: 'Jack feet used: their capacity and maximum extension are not recorded in the library — to be justified before operation.',
  glazingNote: 'Glazing: its verification (DIN 18008) is not covered by this pre-study.',
  impactNote: 'Vehicle or crowd impact is not considered and is to be prevented by suitable measures.',
  snowNote: 'Snow is not considered: it is to be prevented by technical or organisational measures.',
  s13: 'Wind basis and high-wind action plan',
  windConditions: (qp, v) => `Out of service, the structure is verified for a peak velocity pressure qp = ${qp} kN/m² (DIN EN 1991-1-4/NA, reduction factor 0.7 for temporary structures according to MVV TB Annex B 2.1/2), i.e. a gust of ${v} m/s.`,
  windInService: (q, v, s) => `In service, the velocity pressure is q = ${q} kN/m² (DIN EN 13814): operation is stopped and ${s} evacuated at the latest at a gust speed of ${v} m/s. The wind speed on the structure is monitored continuously.`,
  windTerrain: 'The design assumes a structure at ground level. On elevated sites (hill, platform…), consult the design office. Obstructions under the structure are not considered.',
  windWater: 'Accumulation of water is to be prevented by structural or organisational measures.',
  windPlanTitle: 'High-wind action plan',
  colThreshold: 'Level',
  colSpeed: 'Gust',
  colAction: 'Action',
  windPlan: {
    watch: ['Alert', 'Increased monitoring (anemometer read every 15 min), person in charge informed, evacuation of outdoor areas prepared.'],
    stop: ['Stop operation', 'Stop operation; evacuate terraces, the top level and outdoor areas; close doors and accesses.'],
    limit: ['Out-of-service limit', 'Out-of-service design limit: nobody inside or near the structure, safety perimeter.'],
  },
  windPlanNotes: [
    'Anemometer on the structure or in its immediate vicinity, at roof height, readable at all times.',
    'A designated person in charge on site decides on stopping and evacuation.',
    'Daily log: measured speeds, actions taken, time and person in charge.',
  ],
  s14: 'Anchorage and packing summary',
  overturning: 'Overturning',
  sliding: 'Global sliding',
  slidingValue: (r, m) => `required μ = ${r} ; available μ = ${m}`,
  ballast: 'Ballast',
  ballastNone: 'no ballast required',
  ballastRequired: (k, g) => `total ballast ≥ ${k} kN (≈ ${g} kg), spread over the supports, or anchorage`,
  ballastOverturning: 'ballast or anchorage to be designed (overturning)',
  jacks: 'Jack feet',
  bearing: 'Allowable ground bearing pressure',
  bearingValue: (v, l) => `${v} kN/m² (${l})`,
  groundNote: 'Bearing capacity to be checked on site by the operator.',
  s15: 'Materials, standards, documents and software',
  materialsText: 'Steel S235 and S275 (sections and hollow sections), plywood F20/15 (floors, roofs), plywood F40/30 (packing), timber C24 (sleepers). The material of each check is stated in chapter 3.',
  normsTitle: 'Standards',
  norms: [
    ['DIN EN 1990', 'Basis of structural design'],
    ['DIN EN 1991-1', 'Actions on structures (+ NA)'],
    ['DIN EN 1993-1', 'Design of steel structures (+ NA)'],
    ['DIN EN 1995-1', 'Design of timber structures (+ NA)'],
    ['DIN EN 13814', 'Temporary structures (Fliegende Bauten) and amusement rides'],
    ['MVV TB', 'Annex B 2.1/2: wind loads on temporary structures'],
  ],
  docsTitle: 'Reference documents',
  docs: [
    'statico 18-0573 “Viewbox – Modulares Containersystem” (base study, railings).',
    'statico 24-0571 “Viewbox – Hoka” and 24-0569 “Viewbox – Qatar” (SCIA reference models of the unit and of the checks).',
    'Spantech drawings “VIEWBOX M16 60MM” (weighed 2 564 kg including floors and insulation).',
  ],
  softwareTitle: 'Software',
  softwareText: (v) => `VEM · Plans Viewbox · Étude structure ${v}: 3D frame model (members, springs, compression-only contacts and supports), second-order analysis, checks to DIN EN 1993 / 1995 and of the Viewbox connections.`,
  ch2: 'Loads',
  s21: 'Permanent loads',
  weighed: (k, g) => `Weighed self-weight of one Viewbox (floor, roof, columns, floors and insulation included, without walls or railings): G ≈ ${k} kN (${g} kg).`,
  steelWeight: 'Self-weight of the members from the sections and materials of the model, steel 78.5 kN/m³; the difference to the weighed weight is spread over the floor edge beams.',
  ceiling: 'Ceiling and insulation',
  walls: 'Walls, glazing, doors',
  wallsNone: 'none',
  wallRow: (l, q, len) => `${l}: ${q} kN/m over ${len} m`,
  floor: 'Floor finish and insulation',
  railings: 'Railings',
  logos: 'Logos and point loads',
  pointRow: (l, F) => `${l}: ${F} kN`,
  s22: 'Imposed loads',
  s221: 'Vertical imposed loads',
  liveText: 'Imposed floor load (DIN EN 13814, public)',
  roofLive: 'Accessible roofs (terraces)',
  outOfServiceLive: (e) => `Out of service: ${e}; the other areas stay loaded.`,
  evacuatedTop: 'the top level and outdoor areas are evacuated',
  evacuatedOutdoor: 'outdoor areas are evacuated',
  s222: 'Horizontal imposed loads',
  horizontalText: 'Horizontal load acting together with the vertical imposed load, at floor level, in the 4 directions (DIN EN 13814): H = V / 10.',
  handrail: 'Handrail load (areas with 3.50 kN/m²): 0.50 kN/m — railings verified in the base study 18-0573.',
  impact: 'Impact: not considered, to be prevented by suitable measures.',
  s23: 'Snow',
  snowText: 'The design does not consider snow loads; in case of snowfall, they are to be prevented by technical or organisational measures.',
  s24: 'Wind',
  windTwoStates: 'The structure is designed for two operating states.',
  inServiceTitle: 'In service (DIN EN 13814)',
  outOfServiceTitle: 'Out of service (DIN EN 1991-1-4/NA, reduction to MVV TB Annex B 2.1/2)',
  outOfServiceText: 'Peak velocity pressure of the mixed profile of terrain categories II and III, reduced by 0.7 for a temporary structure.',
  cpTitle: 'Pressure coefficients',
  cpRows: [
    ['cp = +0.8', 'windward face'],
    ['cp = −0.5', 'leeward face'],
    ['cp = −0.8', 'faces parallel to the wind'],
    ['cp = −0.7', 'suction on the roofs of the top level (stability)'],
  ],
  internalPressure: 'Internal pressure: not considered in the global analysis (it balances out), considered locally for the floor (cp,i = +0.8).',
  roofSuction: 'Roof suction is only used for stability (COB combinations); in the other combinations it is favourable.',
  s25: 'Imperfections and combinations',
  imperfection: 'Second-order analysis with an initial sway φ = 1/200 (dx = dy = 5.0 mm/m) of the whole structure, in the direction of the horizontal action of each combination.',
  combosText: 'Combinations of the statico reports (DIN EN 13814): ULS (RC1), stability (RC2, favourable permanent loads 1.0, finishes 50 %, logos 0, wind 1.2) and characteristic combinations for the ground reactions.',
  colId: 'Comb.',
  colClass: 'Type',
  colFactors: 'Load cases and factors',
  comboClass: { ULS: 'ULS', STAB: 'stability', SLS: 'SLS' },
  ch3: 'Resistance checks',
  ch3Intro: (m) => `Internal forces come from the finite element analysis of the whole installation (second order, initial sway 1/200, compression-only supports and contacts). Each member span and each connection is checked for all ULS combinations; the governing case is printed with its formulas. Steel member checks: ${m}.`,
  method: {
    envelope: 'envelope of the classic method (EN 1993-1-1 Annex B) and of the statico method (Cm = 0.9, no buckling at second order)',
    classic: 'classic method EN 1993-1-1 Annex B',
    statico: 'method of the statico reports (SCIA)',
  },
  floors: 'Floors',
  floorsText: 'Plywood floor checked as a 1 m strip over the largest span between secondary beams (statico 24-0571 § 3.5).',
  viewbox: 'Viewbox — steel members',
  sectionsTitle: 'Sections and materials',
  colRole: 'Element',
  colSection: 'Section',
  colMaterial: 'Material',
  figureEta: 'Maximum utilisation of each Viewbox (all checks)',
  figureEtaMembers: 'Maximum utilisation of the steel members of each Viewbox',
  etaLegend: 'green ≤ 0.50 · yellow ≤ 0.90 · orange ≤ 1.00 · red > 1.00 · purple: not checked',
  mostLoaded: 'Most loaded elements',
  governingPerFamily: 'Governing check of each family',
  corners: 'Column-to-frame joints (corners)',
  cornersText: '10 mm flange plates welded to the edge beams, 4 × M16-8.8 per corner (spacing 110 mm), 2 inner plates 180 × 50 × 15 mm; stiffness ≈ 3 500 kNcm/deg in the model. ideaStatiCa capacities (statico): biaxial My, Mz ≤ 8.0 kNm; uniaxial max ≤ 11.5 kNm and min ≤ 3.3 kNm; N ≤ 70 kN; the more favourable interaction is used.',
  vlinks: 'Vertical connections between stacked units',
  vlinksText: 'Link plates 100 × 10 mm (2 per side, hole Ø 22): HRd = 5.81 kN per plate and direction, steel-to-steel friction μ = 0.1; vertical column-to-column contact NRd = 176 kN (cover plate weld).',
  bolts: 'Horizontal connections (M20-8.8 bolts)',
  boltsText: 'M20-8.8 bolts in the web of the UPN edge beams (tw = 9 mm), floor and roof: shear, tension and interaction to DIN EN 1993-1-8.',
  ground: 'Ground pressure and packing',
  groundIntro: (s) => `Reactions are summed per support group (corners standing on the same packing). ${s} The bearing capacity is to be checked on site by the operator; for different ground conditions, the packing is to be adapted.`,
  groundSourceSls: 'Characteristic reactions come from the SLS combinations of the analysis, design reactions from the ULS combinations.',
  groundSourceStatico: 'Design reactions (ULS) are converted to characteristic values with Rz,k = Rz,Ed / 1.35 (statico method).',
  groundCase: (t, b) => `Packing — ${t} — ${b} kN/m²`,
  actions: 'Actions',
  plateTable: { stack: 'Stacked plates', dims: 'Dimensions', thickness: 'Required thickness per plate' },
  plateFigure: 'Packing plate: contact area a1 × a2, plate b × l, diagonal overhang e',
  chosenSolution: 'Chosen solution',
  otherSolutions: 'Other solutions',
  longrine: 'Alternative: sleepers under the long sides',
  ch4: 'Global stability',
  stabilityBasis: 'Action factors (DIN EN 13814):',
  stabilityFactors: [
    ['favourable permanent loads', 'γF = 1.0 (*)'],
    ['unfavourable wind loads', 'γF = 1.2'],
  ],
  stabilityFootnote: '(*) Ceilings, walls and floors taken at 50 %; logos not considered (on the safe side).',
  overturningTitle: 'Overturning',
  slidingTitle: 'Global sliding',
  ch5: 'Conclusion',
  conclusion: {
    ok: (e) => `Within the assumptions of this pre-study, the structure is sufficiently strong and stable (maximum utilisation η = ${e}). The requirements and instructions of this document are to be followed.`,
    limit: (e) => `Within the assumptions of this pre-study, the structure passes with utilisations close to the limit (η max = ${e}). Any additional load or cladding requires a new check.`,
    fail: (e) => `The structure fails under the assumptions of this pre-study (η max = ${e}). The measures below are to be studied and the analysis run again.`,
    incomplete: () => 'The pre-study is incomplete: some elements could not be checked (see reasons below). No conclusion can be drawn until they are completed.',
  },
  reserve: 'Internal pre-study made with the VEM tool, not checked by an engineer: it does not replace a structural calculation approved by a design office or checking authority before operation.',
  remarksTitle: 'Remarks and warnings',
  hintsTitle: 'Possible measures',
  hints: {
    sliding: (kg) => `Sliding: ballast of about ${kg} kg spread over the supports, anchorage, or packing with a higher justified friction coefficient (timber / concrete 0.6).`,
    overturning: 'Overturning: ballast or anchor the uplifting supports, widen the installation (units side by side) or limit the out-of-service wind (early dismantling).',
    corners: 'Column-to-frame joints: add bracing (flat bars 60 × 6 + ¾" turnbuckle) in the most loaded faces, or reduce the horizontal loads.',
    members: 'Members: reduce the imposed or carried loads, remove cladding exposed to wind, or strengthen locally.',
    ground: 'Ground: larger plates, sleepers under the long sides, or a higher justified bearing pressure.',
    plywood: 'Floor: reduce the imposed load or add an intermediate secondary beam.',
    blocked: 'Unchecked elements: complete the missing data (recognition, library) and run the analysis again.',
    jacks: 'Jacks: record their capacity in the library (VBX-JACK) or place the corners directly on the packing.',
  },
  annex: 'Calculation appendix',
  b1: 'Analysis model',
  modelCounts: (n, m, s) => `${n} nodes, ${m} members, ${s} supports (compression only, horizontal springs 50 kN/cm).`,
  sectionsAnnex: 'Sections',
  materialsAnnex: 'Materials',
  springsTitle: 'Connections in the model',
  springs: [
    ['Column / frame', 'semi-rigid rotation 3 500 kNcm/deg (ideaStatiCa)'],
    ['Horizontal bolt', '50 kN/cm per half bolt (long sides: two in series), free rotations'],
    ['Stacked corner link', 'massless SHS 100 × 4, 10 kN/cm in shear'],
    ['Corner contact', 'compression-only member, massless'],
    ['Support', 'compression only, 50 kN/cm horizontally, released when lifting off'],
  ],
  b2: 'Load cases',
  colCase: 'Case',
  colLabel: 'Description',
  b3: 'Combinations',
  b4: 'Checks',
  b5: 'Support reactions per group',
  colGroup: 'Group',
  colModules: 'Viewbox',
  b6: 'Analysis messages',
  none: 'none',
  calagePlan: 'Packing plan',
  calagePlanTitle: 'Packing plan — ground level',
};

export const LABELS: Record<Lang, Labels> = { fr: FR, de: DE, en: EN };
