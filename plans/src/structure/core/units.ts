// Unités du module Étude structure. Tout le calcul se fait en N, mm, N/mm² (MPa) et rad ; les conversions ne servent
// qu'à la saisie et à l'affichage (kN, kN·m, kN/m², kg…). Fonctions pures.

/** 1 kN en N */
export const KN = 1e3;
/** 1 kN·m en N·mm */
export const KNM = 1e6;
/** 1 kN·cm en N·mm */
export const KNCM = 1e4;
/** 1 kN/m (charge linéique) en N/mm */
export const KN_PER_M = 1;
/** 1 kN/m² en N/mm² */
export const KN_PER_M2 = 1e-3;
/** 1 kN/cm² en N/mm² */
export const KN_PER_CM2 = 10;
/** 1 kN/cm (raideur) en N/mm */
export const KN_PER_CM = 100;
/** 1 kN·cm/deg (raideur en rotation) en N·mm/rad */
export const KNCM_PER_DEG = (1e4 * 180) / Math.PI;
/** 1 kN/m³ (poids volumique) en N/mm³ */
export const KN_PER_M3 = 1e-6;
/** accélération de la pesanteur (m/s²) : poids d'une masse en kg → N */
export const GRAVITY = 9.81;

/** Poids (N) d'une masse en kg. */
export const kgToN = (kg: number) => kg * GRAVITY;
/** Masse (kg) équivalente à un poids en N. */
export const nToKg = (n: number) => n / GRAVITY;

/** Charge surfacique : t/m² → kN/m² (1 t = 1 000 kg). */
export const tPerM2ToKnPerM2 = (t: number) => (t * 1e3 * GRAVITY) / 1e3;
/** Charge surfacique : kg/cm² → kN/m². */
export const kgPerCm2ToKnPerM2 = (kg: number) => (kg * GRAVITY * 1e4) / 1e3;

const nf = new Map<number, Intl.NumberFormat>();
/** Nombre à la française (virgule décimale, espace fine pour les milliers). */
export function fmtNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : value < 0 ? '−∞' : '—';
  let f = nf.get(decimals);
  if (!f) nf.set(decimals, (f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })));
  // Intl met une espace insécable étroite pour les milliers et « - » pour le signe
  return f.format(value === 0 ? 0 : value).replace(/[\u202f\u00a0]/g, ' ').replace('-', '\u2212');
}

export type DisplayUnit = 'kN' | 'kNm' | 'kNcm' | 'kN/m' | 'kN/m²' | 'N/mm²' | 'kN/cm²' | 'mm' | 'cm' | 'm' | 'kg';

const FACTOR: Record<DisplayUnit, number> = {
  kN: KN,
  kNm: KNM,
  kNcm: KNCM,
  'kN/m': KN_PER_M,
  'kN/m²': KN_PER_M2,
  'N/mm²': 1,
  'kN/cm²': KN_PER_CM2,
  mm: 1,
  cm: 10,
  m: 1e3,
  kg: GRAVITY, // poids en N → masse en kg
};

/** Valeur interne (N, mm…) → unité d'affichage. */
export const toUnit = (internal: number, unit: DisplayUnit) => internal / FACTOR[unit];
/** Valeur saisie dans une unité d'affichage → valeur interne. */
export const fromUnit = (value: number, unit: DisplayUnit) => value * FACTOR[unit];

/** « 12,50 kN » à partir d'une valeur interne. */
export function fmt(internal: number, unit: DisplayUnit, decimals = 2): string {
  return `${fmtNumber(toUnit(internal, unit), decimals)} ${unit}`;
}
