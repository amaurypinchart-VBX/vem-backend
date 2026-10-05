// Matériaux : caractéristiques mécaniques et masses volumiques (N/mm², kg/m³). Chaque valeur porte sa source.
// Les valeurs par défaut des Viewbox (annexe A.2 du cahier des charges) sont celles des annexes SCIA statico.

export type MaterialFamily = 'steel' | 'timber' | 'plywood' | 'aluminium' | 'glass' | 'concrete' | 'plastic' | 'massless' | 'other';

export interface ThicknessRange {
  /** épaisseur maxi (mm) de la tranche */
  tMax: number;
  fy: number;
  fu: number;
}

export interface Material {
  key: string;
  name: string;
  family: MaterialFamily;
  /** module d'Young, de cisaillement (N/mm²), coefficient de Poisson */
  E: number;
  G: number;
  nu: number;
  /** masse volumique (kg/m³) : 0 pour les barres équivalentes sans masse */
  rho: number;
  /** acier / aluminium : limites d'élasticité et résistances à la traction par épaisseur */
  ranges?: ThicknessRange[];
  /** bois et panneaux : résistances caractéristiques (N/mm²) */
  strength?: Partial<Record<'fmk' | 'ft0k' | 'ft90k' | 'fc0k' | 'fc90k' | 'fvk' | 'frk', number>>;
  source: string;
  /** valeur à vérifier avant usage (données américaines, rapports non signés…) */
  unverified?: boolean;
}

const steel = (key: string, name: string, ranges: ThicknessRange[], source: string, unverified = false): Material => ({
  key,
  name,
  family: 'steel',
  E: 210000,
  G: 80769.23,
  nu: 0.3,
  rho: 7850,
  ranges,
  source,
  unverified,
});

export const MATERIALS: Material[] = [
  steel('S235', 'Acier S235', [
    { tMax: 40, fy: 235, fu: 360 },
    { tMax: 80, fy: 215, fu: 360 },
  ], 'DIN EN 1993-1-1 tab. 3.1 ; annexe SCIA statico 24-0571 p. B13'),
  steel('S275', 'Acier S275', [
    { tMax: 40, fy: 275, fu: 430 },
    { tMax: 80, fy: 255, fu: 410 },
  ], 'DIN EN 1993-1-1 tab. 3.1 ; annexe SCIA statico 24-0571 p. B13'),
  steel('S355', 'Acier S355', [
    { tMax: 40, fy: 355, fu: 490 },
    { tMax: 80, fy: 335, fu: 470 },
  ], 'DIN EN 1993-1-1 tab. 3.1'),
  steel('A36', 'ASTM A36', [{ tMax: 200, fy: 250, fu: 400 }], 'ASTM A36 (36 ksi / 58 ksi)', true),
  steel('A500B', 'ASTM A500 Gr B (tubes rectangulaires)', [{ tMax: 25, fy: 317, fu: 400 }], 'ASTM A500 (46 ksi / 58 ksi)', true),
  steel('A500C', 'ASTM A500 Gr C (tubes rectangulaires)', [{ tMax: 25, fy: 345, fu: 427 }], 'ASTM A500 (50 ksi / 62 ksi) — 317 MPa sur les plans Spantech US', true),
  {
    key: 'MASSLESS',
    name: 'Barre équivalente sans masse',
    family: 'massless',
    E: 210000,
    G: 80769.23,
    nu: 0.3,
    rho: 0,
    source: 'annexe SCIA statico 24-0571 p. B13 (« masselos »)',
  },
  {
    key: 'C24',
    name: 'Bois massif C24',
    family: 'timber',
    E: 11000,
    G: 690,
    nu: 0,
    rho: 420,
    strength: { fmk: 24, ft0k: 14.5, ft90k: 0.4, fc0k: 21, fc90k: 2.5, fvk: 4.0 },
    source: 'DIN EN 338 ; E, G, ρ : annexe SCIA statico 24-0571 p. B13',
  },
  {
    key: 'C30',
    name: 'Bois massif C30',
    family: 'timber',
    E: 12000,
    G: 750,
    nu: 0,
    rho: 460,
    strength: { fmk: 30, ft0k: 18, ft90k: 0.4, fc0k: 23, fc90k: 2.7, fvk: 4.0 },
    source: 'DIN EN 338 ; solives des éléments terrasse statico 18-0573 § 3.5.3',
  },
  {
    key: 'GL24h',
    name: 'Lamellé-collé GL24h',
    family: 'timber',
    E: 11500,
    G: 650,
    nu: 0,
    rho: 420,
    strength: { fmk: 24, ft0k: 19.2, ft90k: 0.5, fc0k: 24, fc90k: 2.5, fvk: 3.5 },
    source: 'DIN EN 14080',
  },
  {
    key: 'CP-F20/15',
    name: 'Contreplaqué F20/15 (planchers et toitures Viewbox)',
    family: 'plywood',
    E: 0,
    G: 0,
    nu: 0,
    rho: 600,
    // valeurs retenues par statico dans la direction faible (flexion 15, cisaillement 0,7)
    strength: { fmk: 15, fvk: 0.7 },
    source: 'statico 24-0571 § 3.5 p. A18',
  },
  {
    key: 'CP-F40/30',
    name: 'Contreplaqué F40/30 non revêtu (calage)',
    family: 'plywood',
    E: 0,
    G: 0,
    nu: 0,
    rho: 600,
    strength: { fmk: 30, fc90k: 9 },
    source: 'statico 24-0571 § 3.12 p. A28 (fm,d = 0,9 · 30 / 1,3 ; fc,90,d = 0,9 · 9 / 1,3)',
  },
  {
    key: 'EN-AW-6060-T66',
    name: 'Aluminium EN AW-6060 T66 (profilés filés)',
    family: 'aluminium',
    E: 70000,
    G: 27000,
    nu: 0.3,
    rho: 2700,
    ranges: [
      { tMax: 3, fy: 160, fu: 215 },
      { tMax: 25, fy: 150, fu: 195 },
    ],
    source: 'DIN EN 1999-1-1 tab. 3.2b',
  },
  {
    key: 'EN-AW-6082-T6',
    name: 'Aluminium EN AW-6082 T6 (profilés filés)',
    family: 'aluminium',
    E: 70000,
    G: 27000,
    nu: 0.3,
    rho: 2700,
    ranges: [
      { tMax: 5, fy: 250, fu: 290 },
      { tMax: 15, fy: 260, fu: 310 },
    ],
    source: 'DIN EN 1999-1-1 tab. 3.2b',
  },
  { key: 'GLASS', name: 'Verre (ESG / VSG)', family: 'glass', E: 70000, G: 28000, nu: 0.23, rho: 2500, source: 'DIN 18008-1' },
  { key: 'CONCRETE', name: 'Béton', family: 'concrete', E: 30000, G: 12500, nu: 0.2, rho: 2500, source: 'DIN EN 1991-1-1 tab. A.1 (béton armé 25 kN/m³)' },
  { key: 'PEHD', name: 'Polyéthylène haute densité (PEHD)', family: 'plastic', E: 1000, G: 350, nu: 0.4, rho: 950, source: 'valeur indicative (fiche fabricant à saisir)' },
];

export function materialByKey(key: string): Material | undefined {
  return MATERIALS.find((m) => m.key === key);
}

/** Limite d'élasticité et résistance à la traction pour une épaisseur t (mm) ; undefined au-delà des tranches connues. */
export function steelStrength(m: Material, t: number): { fy: number; fu: number } | undefined {
  const r = m.ranges?.find((x) => t <= x.tMax + 1e-9);
  return r ? { fy: r.fy, fu: r.fu } : undefined;
}

/** Coefficients partiels de l'acier (DIN EN 1993-1-1/NA). */
export const GAMMA_M = { M0: 1.0, M1: 1.1, M2: 1.25 } as const;

/** kmod (DIN EN 1995-1-1 tab. 3.1, bois massif et contreplaqué, classe de service 1 ou 2). */
export const KMOD: Record<'permanent' | 'long' | 'medium' | 'short' | 'instantaneous', number> = {
  permanent: 0.6,
  long: 0.7,
  medium: 0.8,
  short: 0.9,
  instantaneous: 1.1,
};

/** γM du bois massif et du contreplaqué (DIN EN 1995-1-1/NA). */
export const GAMMA_M_TIMBER = 1.3;
