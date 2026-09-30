// Hypothèses par défaut (annexe B du cahier des charges) : toutes paramétrables dans l'étape « Site & hypothèses » ou dans
// Réglages, et imprimées dans le rapport. Unités internes : N, mm, N/mm² (1 kN/m² = 1e-3 N/mm², 1 kN/m = 1 N/mm).
import { KN_PER_M, KN_PER_M2 } from '../core/units';

export interface Assumption {
  value: number;
  /** unité d'affichage */
  unit: string;
  label: string;
  source: string;
}

const a = (value: number, unit: string, label: string, source: string): Assumption => ({ value, unit, label, source });

export const DEFAULTS = {
  // charges permanentes
  moduleWeight: a(
    2564 * 9.81,
    'kg',
    'Poids d’une Viewbox 5900, planchers et isolants compris (contrôle du gabarit)',
    'A. Pinchart 29.09.2026 ; plan Spantech « VIEWBOX M16 60MM » 2 563,752 kg (statico 24-0571 § 2.1 : ≈ 20 kN sans planchers)',
  ),
  ceiling: a(0.35 * KN_PER_M2, 'kN/m²', 'Plafond + isolation', 'statico 24-0571 § 2.1'),
  wall: a(0.5 * KN_PER_M, 'kN/m', 'Mur plein', 'statico 24-0571 § 2.1'),
  glazedWall: a(1.75 * KN_PER_M, 'kN/m', 'Mur vitré (vitrage lourd)', 'statico 24-0569'),
  floorFinish: a(0.4 * KN_PER_M2, 'kN/m²', 'Sol + isolation', 'statico 24-0571 § 2.1'),
  railing: a(0.1 * KN_PER_M, 'kN/m', 'Garde-corps', 'statico 24-0571 § 2.1'),
  steps: a(0.42 * KN_PER_M2, 'kN/m²', 'Marches', 'statico 24-0571 § 2.1'),
  // exploitation
  liveLoad: a(3.5 * KN_PER_M2, 'kN/m²', 'Exploitation publique', 'DIN EN 13814 ; statico 24-0571 § 2.2.1'),
  horizontalRatio: a(0.1, '−', 'Charge horizontale d’exploitation H = V / 10', 'DIN EN 13814 ; statico 24-0571 § 2.2.2'),
  handrail: a(0.5 * KN_PER_M, 'kN/m', 'Main courante', 'DIN EN 13814 ; statico 24-0571 § 2.2.2'),
  // vent
  windInService8: a(0.2 * KN_PER_M2, 'kN/m²', 'Vent en service (h ≤ 8 m)', 'DIN EN 13814 ; statico 24-0571 § 2.4'),
  windInService20: a(0.3 * KN_PER_M2, 'kN/m²', 'Vent en service (8 m < h ≤ 20 m)', 'DIN EN 13814 ; statico 24-0571 § 2.4'),
  windOutOfServiceFactor: a(0.7, '−', 'Abattement du vent hors service', 'MVV TB Anlage B 2.1/2 ; statico 24-0571 § 2.4'),
  cpWindward: a(0.8, '−', 'cp au vent (luv)', 'statico 24-0571 § 2.4'),
  cpLeeward: a(-0.5, '−', 'cp sous le vent (lee)', 'statico 24-0571 § 2.4'),
  cpParallel: a(-0.8, '−', 'cp parois parallèles au vent', 'statico 24-0571 § 2.4'),
  cpRoof: a(-0.6, '−', 'cp toiture', 'statico 24-0571 § 2.4'),
  cpRoofStability: a(-0.7, '−', 'cp toiture pour la stabilité (niveau supérieur)', 'statico 24-0571 § 2.4'),
  cpLogo: a(1.3, '−', 'cp logo (A ≤ 1,85 m²)', 'statico 24-0571 § 2.4'),
  // imperfections, coefficients
  sway: a(1 / 200, '−', 'Défaut d’aplomb φ (5 mm/m)', 'statico 24-0571 § 3'),
  gammaGOnly: a(1.35, '−', 'γG (permanentes seules)', 'DIN EN 13814 ; statico'),
  gammaGWithQ: a(1.1, '−', 'γG (avec actions variables)', 'DIN EN 13814 ; statico'),
  gammaQ: a(1.35, '−', 'γQ', 'DIN EN 13814 ; statico'),
  gammaW: a(1.35, '−', 'γW', 'DIN EN 13814 ; statico'),
  stabilityGammaG: a(1.0, '−', 'Stabilité : γG favorable', 'DIN EN 13814 ; statico 24-0571 § 4'),
  stabilityFinishes: a(0.5, '−', 'Stabilité : part des plafonds, murs et sols retenue', 'statico 24-0571 § 4'),
  stabilityLogo: a(0, '−', 'Stabilité : part du logo retenue', 'statico 24-0571 § 4'),
  stabilityGammaW: a(1.2, '−', 'Stabilité : γW', 'DIN EN 13814 ; statico 24-0571 § 4'),
  rdToRk: a(1.35, '−', 'Conversion simplifiée Rd → Rk (÷)', 'statico 24-0571 § 3.12'),
  // sol et calage
  bearing: a(200 * KN_PER_M2, 'kN/m²', 'Portance admissible par défaut', 'DIN EN 13814 ; statico 24-0571 § 3.12'),
  bearingSmall: a(150 * KN_PER_M2, 'kN/m²', 'Portance admissible des petits appuis (escaliers)', 'statico 24-0571 § 3.12.7'),
  plateSideStep: a(50, 'mm', 'Pas des côtés de plaque', 'statico 24-0571 § 3.12'),
  plateThicknessStep: a(1, 'mm', 'Pas des épaisseurs de plaque', 'statico 24-0571 § 3.12'),
  plateMinThickness: a(12, 'mm', 'Épaisseur mini d’une plaque', 'statico 24-0571 § 3.12.7'),
  plateKmod: a(0.9, '−', 'kmod des plaques (court terme, NKL 2)', 'statico 24-0571 § 3.12'),
  timberGammaM: a(1.3, '−', 'γM bois', 'DIN EN 1995-1-1/NA'),
  steelFriction: a(0.1, '−', 'Frottement acier / acier dans les liaisons', 'statico 24-0571 § 3.9'),
  groundFriction: a(0.4, '−', 'Frottement disponible calage / sol (glissement global)', 'valeur prudente à confirmer sur site (statico 24-0571 § 4 : μ requis seulement, 0,12)'),
  snow: a(0, '−', 'Neige prise en compte (0 = non)', 'statico 24-0571 § 2.3'),
} as const;

export type AssumptionKey = keyof typeof DEFAULTS;
