// Référentiel de calcul France (A. Pinchart 09.11.2026 : « il me faut les deux codes, Eurocode et la loi structure
// temporaire ; que ce soit choisissable dans le calcul et que ça prenne bien en compte cette façon de calculer ») :
//   — Eurocodes avec les annexes nationales françaises : NF EN 1990/NA (combinaisons, coefficients partiels et ψ),
//     NF EN 1991-1-1/NA (charges d'exploitation), NF EN 1991-1-3/NA (neige : régions A1…E), NF EN 1991-1-4/NA (vent :
//     régions 1 à 4, catégories de terrain 0, II, IIIa, IIIb, IV), NF EN 1991-1-6 (périodes de retour d'une situation
//     temporaire, tableau 3.1), NF EN 1993-1-1/NA (γM0 = γM1 = 1,00, γM2 = 1,25), NF EN 1995-1-1/NA ;
//   — arrêté du 25 juillet 2022 fixant les règles de sécurité et les dispositions techniques applicables aux structures
//     provisoires et démontables (modifié par l'arrêté du 13 mai 2025) : « vent de service » au moins 20 m/s (72 km/h),
//     structure occupée ou non, évacuation au-delà ; ensembles accessibles au public : 5 kN/m² vertical, charge
//     horizontale 6 % (10 % au-delà de 500 m²).
// Le référentiel Allemagne (DIN EN 13814, notes statico, Prüfbuch TÜV) reste celui par défaut : rien ne change pour lui.
// Valeurs des annexes nationales relevées sur des documents secondaires (cours, éditeurs de logiciels) : à confirmer sur
// les textes AFNOR. Fonctions pures ; pressions en N/mm², hauteurs en mm.
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

export type DesignCode = 'DE' | 'FR';

/** Coefficients partiels et de combinaison (NF EN 1990/NA bâtiments, NF EN 1993-1-1/NA, NF EN 1995-1-1/NA). */
export const FR_FACTORS = {
  /** STR / GEO (ensemble B) : permanentes défavorables / favorables, variables défavorables */
  gammaGsup: 1.35,
  gammaGinf: 1.0,
  gammaQ: 1.5,
  /** valeurs de combinaison ψ0 : exploitation (catégories C, D), vent, neige (altitude ≤ 1 000 m) */
  psi0Live: 0.7,
  psi0Wind: 0.6,
  psi0Snow: 0.5,
  /** EQU (ensemble A) : équilibre statique — permanentes favorables, variables défavorables */
  equGinf: 0.9,
  equQ: 1.5,
  /** acier */
  gammaM0: 1.0,
  gammaM1: 1.0,
  gammaM2: 1.25,
  /** bois massif, contreplaqué */
  timberSolid: 1.3,
  plywood: 1.2,
} as const;

/** Masse volumique de l'air (NF EN 1991-1-4 § 4.5, valeur recommandée). */
export const RHO_AIR = 1.225;

// ─── arrêté du 25 juillet 2022 (structures provisoires et démontables) ───

export const SPD = {
  /** vent de service minimal (m/s) : la structure, occupée ou non, y résiste sans défaillance, glissement ni renversement */
  serviceMin: 20,
  /** ensembles accessibles au public : charge verticale (N/mm²) */
  live: 5e-3,
  /** charge horizontale dynamique (part de la charge verticale) : 6 % jusqu'à 500 m², 10 % au-delà */
  horizontalSmall: 0.06,
  horizontalLarge: 0.1,
  areaLimit: 500e6,
} as const;

/** Charge horizontale de l'arrêté selon la surface accessible au public (mm²). */
export function spdHorizontalRatio(publicArea: number): number {
  return publicArea > SPD.areaLimit + 1e-6 ? SPD.horizontalLarge : SPD.horizontalSmall;
}

/** Pression du vent de service (N/mm²) : q = ½ ρ v², la vitesse de service étant une rafale mesurée sur place. */
export function serviceWindPressure(v: number): number {
  return (0.5 * RHO_AIR * v * v) / 1e6;
}

/** Vitesse correspondant à une pression (m/s), ρ = 1,225 kg/m³. */
export function speedOfFR(q: number): number {
  return Math.sqrt((2 * q * 1e6) / RHO_AIR);
}

// ─── vent hors service : NF EN 1991-1-4/NA ───

export type FrWindRegion = 1 | 2 | 3 | 4;
/** Valeur de base de la vitesse de référence vb,0 (m/s), France métropolitaine (figure 4.3(NA)). */
export const FR_WIND_REGIONS: Record<FrWindRegion, number> = { 1: 22, 2: 24, 3: 26, 4: 28 };

export type FrTerrain = '0' | 'II' | 'IIIa' | 'IIIb' | 'IV';
export const FR_TERRAIN_KEYS: FrTerrain[] = ['0', 'II', 'IIIa', 'IIIb', 'IV'];
/** Catégories de terrain (tableau 4.1(NA)) : longueur de rugosité z0 et hauteur minimale zmin (m). */
export const FR_TERRAINS: Record<FrTerrain, { z0: number; zmin: number; label: string }> = {
  '0': { z0: 0.005, zmin: 1, label: 'mer, zone côtière exposée aux vents de mer, lac ou plan d’eau parcouru par le vent sur au moins 5 km' },
  II: { z0: 0.05, zmin: 2, label: 'rase campagne, quelques obstacles isolés (arbres, bâtiments) espacés de plus de 40 fois leur hauteur' },
  IIIa: { z0: 0.2, zmin: 5, label: 'campagne avec des haies, vignobles, bocage, habitat dispersé' },
  IIIb: { z0: 0.5, zmin: 9, label: 'zones urbanisées ou industrielles, bocage dense, vergers' },
  IV: { z0: 1.0, zmin: 15, label: 'zones urbaines (au moins 15 % de la surface bâtie, hauteur moyenne plus de 15 m), forêts' },
};

export type FrDuration = '3d' | '3m' | '1y' | 'long';
export const FR_DURATION_KEYS: FrDuration[] = ['3d', '3m', '1y', 'long'];
/** Durée de l'installation → période de retour du vent (NF EN 1991-1-6 tableau 3.1). */
export const FR_DURATIONS: Record<FrDuration, { years: number; label: string }> = {
  '3d': { years: 2, label: '3 jours au plus' },
  '3m': { years: 5, label: '3 mois au plus' },
  '1y': { years: 10, label: '1 an au plus' },
  long: { years: 50, label: 'plus d’un an' },
};

export interface FrWindSite {
  region: FrWindRegion;
  terrain: FrTerrain;
  duration: FrDuration;
  /** vent de service (m/s), au moins 20 m/s */
  serviceSpeed: number;
  /** pression de pointe hors service saisie (N/mm²) : site particulier (relief, outre-mer…), remplace le calcul */
  manualQp?: number;
}

export const DEFAULT_FR_WIND: FrWindSite = { region: 2, terrain: 'IIIa', duration: '3m', serviceSpeed: 20 };

/**
 * Coefficient de probabilité (NF EN 1991-1-4 § 4.2 note 4, K = 0,2, n = 0,5) pour une période de retour T (années) :
 * cprob = [(1 − K ln(−ln(1 − 1/T))) / (1 − K ln(−ln 0,98))]^n.
 */
export function cprob(T: number): number {
  const K = 0.2;
  const p = 1 / T;
  return ((1 - K * Math.log(-Math.log(1 - p))) / (1 - K * Math.log(-Math.log(0.98)))) ** 0.5;
}

/** Vitesse minimale d'une situation de moins de 3 mois (NF EN 1991-1-6 § 3.1, valeur recommandée), m/s. */
export const SHORT_MIN_SPEED = 20;

export interface FrPeak {
  vb0: number;
  cprob: number;
  /** vitesse de référence retenue (m/s) */
  vb: number;
  /** relevée au minimum de 20 m/s (situation de moins de 3 mois) */
  raised: boolean;
  qb: number;
  z: number;
  kr: number;
  cr: number;
  kl: number;
  Iv: number;
  ce: number;
  /** pression dynamique de pointe (N/mm²) */
  qp: number;
}

/**
 * Pression dynamique de pointe hors service à la hauteur z (mm) : vb = cdir · cseason · cprob · vb,0 (cdir = cseason
 * = 1), qb = ½ ρ vb² ; cr = kr ln(z / z0), kr = 0,19 (z0 / 0,05)^0,07 ; Iv = kl / ln(z / z0), kl = 1 − 2·10⁻⁴ (log z0
 * + 3)⁶ (annexe nationale) ; qp = cr² (1 + 7 Iv) qb, z ≥ zmin, orographie plate (co = 1).
 */
export function frPeak(site: FrWindSite, zMm: number): FrPeak {
  const t = FR_TERRAINS[site.terrain];
  const z = Math.max(zMm / 1000, t.zmin);
  if (z > 200) throw new Error('Vent : hauteur supérieure à 200 m, hors du domaine de NF EN 1991-1-4.');
  const vb0 = FR_WIND_REGIONS[site.region];
  const cp = cprob(FR_DURATIONS[site.duration].years);
  const short = site.duration === '3d' || site.duration === '3m';
  const raised = short && vb0 * cp < SHORT_MIN_SPEED;
  const vb = raised ? SHORT_MIN_SPEED : vb0 * cp;
  const qb = (0.5 * RHO_AIR * vb * vb) / 1e6;
  const kr = 0.19 * (t.z0 / 0.05) ** 0.07;
  const ln = Math.log(z / t.z0);
  const cr = kr * ln;
  const kl = 1 - 2e-4 * (Math.log10(t.z0) + 3) ** 6;
  const Iv = kl / ln;
  const ce = cr * cr * (1 + 7 * Iv);
  return { vb0, cprob: cp, vb, raised, qb, z, kr, cr, kl, Iv, ce, qp: ce * qb };
}

/** Pression de pointe hors service retenue (N/mm²) : saisie, sinon NF EN 1991-1-4/NA. */
export function frOutOfService(site: FrWindSite, zMm: number): number {
  if (site.manualQp && site.manualQp > 0) return site.manualQp;
  return frPeak(site, zMm).qp;
}

export function frWindRecords(site: FrWindSite, heightMm: number): CalcRecord[] {
  const n = (x: number, d = 2) => fmtNumber(x, d);
  const out: CalcRecord[] = [];
  const qs = serviceWindPressure(site.serviceSpeed);
  out.push({
    key: 'wind.inService',
    title: 'Vent de service (structure occupée)',
    clause: 'arrêté du 25 juillet 2022, art. 10',
    formula: 'v ≥ 20 m/s (72 km/h) ; q = ½ · ρ · v², ρ = 1,225 kg/m³',
    withValues: `v = ${n(site.serviceSpeed, 1)} m/s (${n(site.serviceSpeed * 3.6, 0)} km/h) ; q = ½ · 1,225 · ${n(site.serviceSpeed, 1)}² = ${n(qs * 1e3, 3)} kN/m² — évacuation au-delà`,
    result: qs,
  });
  if (site.manualQp && site.manualQp > 0) {
    out.push({ key: 'wind.outOfService', title: 'Vent hors service (structure évacuée)', clause: 'pression saisie', formula: 'qp saisi', withValues: `qp = ${n(site.manualQp * 1e3)} kN/m²`, result: site.manualQp });
    return out;
  }
  const p = frPeak(site, heightMm);
  const t = FR_TERRAINS[site.terrain];
  const T = FR_DURATIONS[site.duration];
  out.push({
    key: 'wind.reference',
    title: `Vitesse de référence (région ${site.region}, ${T.label})`,
    clause: 'NF EN 1991-1-4/NA § 4.2 ; NF EN 1991-1-6 tab. 3.1',
    formula: 'vb = cdir · cseason · cprob · vb,0 ; cprob = [(1 − 0,2 ln(−ln(1 − 1/T))) / (1 − 0,2 ln(−ln 0,98))]^0,5',
    withValues: `vb,0 = ${n(p.vb0, 0)} m/s ; T = ${T.years} ans → cprob = ${n(p.cprob, 3)} ; vb = ${n(p.vb0 * p.cprob, 1)} m/s${p.raised ? ` < 20 m/s → vb = 20 m/s (minimum d’une situation de moins de 3 mois)` : ''} ; qb = ½ · 1,225 · ${n(p.vb, 1)}² = ${n(p.qb * 1e3, 3)} kN/m²`,
    result: p.qb,
  });
  out.push({
    key: 'wind.outOfService',
    title: `Vent hors service (structure évacuée), catégorie de terrain ${site.terrain}`,
    clause: 'NF EN 1991-1-4/NA § 4.3 – 4.5',
    formula: 'qp(z) = cr² · (1 + 7 Iv) · qb ; cr = kr ln(z / z0) ; Iv = kl / ln(z / z0) ; co = 1',
    withValues: `z = ${n(p.z, 2)} m (h = ${n(heightMm / 1e3, 2)} m, zmin = ${n(t.zmin, 0)} m), z0 = ${n(t.z0, 3)} m ; kr = ${n(p.kr, 3)}, cr = ${n(p.cr, 3)}, kl = ${n(p.kl, 3)}, Iv = ${n(p.Iv, 3)} ; ce = ${n(p.ce, 2)} ; qp = ${n(p.qp * 1e3, 3)} kN/m²`,
    result: p.qp,
  });
  return out;
}

/** Avertissements du site (rapport) : valeurs à confirmer, vent de service plus fort que le vent hors service. */
export function frSiteWarnings(site: FrWindSite, heightMm: number): string[] {
  const w: string[] = [];
  if (site.serviceSpeed < SPD.serviceMin - 1e-9) w.push(`Vent de service ${fmtNumber(site.serviceSpeed, 1)} m/s < 20 m/s : en dessous du minimum de l’arrêté du 25 juillet 2022 (art. 10).`);
  if (site.manualQp && site.manualQp > 0) w.push('Pression de pointe hors service saisie à la main, à justifier.');
  else if (frPeak(site, heightMm).qp < serviceWindPressure(site.serviceSpeed)) w.push('Vent hors service plus faible que le vent de service : la stabilité est aussi vérifiée sous le vent de service.');
  return w;
}

// ─── neige : NF EN 1991-1-3/NA ───

export type FrSnowRegion = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D' | 'E';
export const FR_SNOW_KEYS: FrSnowRegion[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D', 'E'];
/** Charge de neige au sol sk à 200 m d'altitude au plus (kN/m²). */
export const FR_SNOW_SK200: Record<FrSnowRegion, number> = { A1: 0.45, A2: 0.45, B1: 0.55, B2: 0.55, C1: 0.65, C2: 0.65, D: 0.9, E: 1.4 };

/**
 * Neige au sol (kN/m²) à l'altitude A (m) : sk,200 + Δs (annexe nationale) — régions A à D : Δs = A/1000 − 0,20
 * (200 – 500 m), 1,5 A/1000 − 0,45 (500 – 1 000 m), 3,5 A/1000 − 2,45 (1 000 – 2 000 m) ; région E : 1,5 A/1000 − 0,30,
 * 3,5 A/1000 − 1,30, 7 A/1000 − 4,80.
 */
export function frSnowGround(region: FrSnowRegion, altitude: number): number {
  const A = Math.max(0, altitude);
  if (A > 2000) throw new Error('Neige : altitude supérieure à 2 000 m, hors du domaine de l’annexe nationale.');
  const e = region === 'E';
  let ds = 0;
  if (A > 1000) ds = e ? (7 * A) / 1000 - 4.8 : (3.5 * A) / 1000 - 2.45;
  else if (A > 500) ds = e ? (3.5 * A) / 1000 - 1.3 : (1.5 * A) / 1000 - 0.45;
  else if (A > 200) ds = e ? (1.5 * A) / 1000 - 0.3 : A / 1000 - 0.2;
  return FR_SNOW_SK200[region] + ds;
}
