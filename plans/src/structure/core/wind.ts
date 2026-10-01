// Vent (§7.3) : en service selon DIN EN 13814 (pression forfaitaire par hauteur), hors service selon DIN EN 1991-1-4/NA
// (pression de pointe, profil mixte de l'intérieur des terres) abattue de 0,7 pour les constructions temporaires
// (MVV TB Anlage B 2.1/2). Les profils de côte et d'îles ne sont pas programmés : la pression est alors à saisir.
// Fonctions pures ; pressions en N/mm² (1 kN/m² = 1e-3 N/mm²), hauteurs en mm.
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

export type WindZone = 1 | 2 | 3 | 4;

/** Vitesse de référence vb,0 (m/s) et pression de référence qb (kN/m²) par zone (DIN EN 1991-1-4/NA tab. NA.A.1). */
export const WIND_ZONES: Record<WindZone, { vb0: number; qb: number }> = {
  1: { vb0: 22.5, qb: 0.32 },
  2: { vb0: 25.0, qb: 0.39 },
  3: { vb0: 27.5, qb: 0.47 },
  4: { vb0: 30.0, qb: 0.56 },
};

export type Terrain = 'inland' | 'coast' | 'island' | 'manual';

export interface WindSite {
  zone: WindZone;
  terrain: Terrain;
  /** altitude du site (m) */
  altitude: number;
  /** pression hors service saisie (N/mm²) quand le profil n'est pas programmé (côte, îles, hors Allemagne) */
  manualQp?: number;
  /** abattement des constructions temporaires hors service */
  temporaryFactor: number;
}

export const DEFAULT_SITE: WindSite = { zone: 1, terrain: 'inland', altitude: 100, temporaryFactor: 0.7 };

/**
 * Pression de pointe hors service à la hauteur z (mm), abattue (N/mm²). Intérieur des terres, profil mixte II/III :
 * qp = 1,5 qb (z ≤ 7 m) ; 1,7 qb (z / 10)^0,37 (7 < z ≤ 50 m). Lève une erreur si le profil n'est pas programmé.
 */
export function peakPressure(site: WindSite, zMm: number): number {
  if (site.terrain !== 'inland') {
    if (site.manualQp && site.manualQp > 0) return site.manualQp;
    throw new Error('Vent hors service : profil de côte / d’île non programmé — saisir la pression de pointe (kN/m²).');
  }
  const z = zMm / 1000;
  if (z > 50) throw new Error('Vent : hauteur supérieure à 50 m hors du domaine des profils programmés.');
  const qb = WIND_ZONES[site.zone].qb;
  const qp = z <= 7 ? 1.5 * qb : 1.7 * qb * (z / 10) ** 0.37;
  return (qp * site.temporaryFactor) / 1e3;
}

/** Vent en service (DIN EN 13814) : 0,20 kN/m² jusqu'à 8 m, 0,30 kN/m² jusqu'à 20 m ; au-delà : non couvert. */
export function inServicePressure(topMm: number): number {
  if (topMm <= 8000 + 1e-6) return 0.2e-3;
  if (topMm <= 20000 + 1e-6) return 0.3e-3;
  throw new Error('Vent en service : hauteur supérieure à 20 m non couverte par DIN EN 13814 — pression à saisir.');
}

/** Vitesse de vent correspondant à une pression q (N/mm²) : v = √(2 q / ρ), ρ = 1,25 kg/m³. */
export function speedOf(q: number): number {
  return Math.sqrt((2 * q * 1e6) / 1.25);
}

/** Contrôles du domaine d'emploi (altitude, zones) : avertissements affichés dans le rapport. */
export function siteWarnings(site: WindSite): string[] {
  const w: string[] = [];
  if (site.terrain === 'inland' && site.altitude > 800 && site.zone <= 2)
    w.push(`Altitude ${site.altitude} m > 800 m en zone ${site.zone} : au-delà du domaine des rapports de référence (majoration NA à appliquer).`);
  if (site.terrain !== 'inland') w.push('Profil de vent de côte / d’île : pression de pointe saisie à la main, à justifier.');
  return w;
}

export function windRecords(site: WindSite, buildingHeightMm: number): CalcRecord[] {
  const out: CalcRecord[] = [];
  const h = buildingHeightMm / 1000;
  const n = (x: number, d = 2) => fmtNumber(x, d);
  out.push({
    key: 'wind.inService',
    title: 'Vent en service',
    clause: 'DIN EN 13814',
    formula: 'q = 0,20 kN/m² (h ≤ 8 m) ; 0,30 kN/m² (8 m < h ≤ 20 m)',
    withValues: `vitesse d’arrêt d’exploitation : v = √(2 · 0,20 kN/m² / 1,25 kg/m³) = ${n(speedOf(0.2e-3), 1)} m/s`,
  });
  if (site.terrain === 'inland') {
    const zone = WIND_ZONES[site.zone];
    const qp = peakPressure(site, buildingHeightMm);
    out.push({
      key: 'wind.outOfService',
      title: 'Vent hors service',
      clause: 'DIN EN 1991-1-4/NA, MVV TB Anlage B 2.1/2',
      formula: h <= 7 ? 'qp = 0,7 · 1,5 · qb' : 'qp = 0,7 · 1,7 · qb · (z / 10)^0,37',
      withValues:
        h <= 7
          ? `zone ${site.zone} : vb,0 = ${n(zone.vb0, 1)} m/s, qb = ${n(zone.qb)} kN/m² ; qp = 0,7 · 1,5 · ${n(zone.qb)} = ${n(qp * 1e3)} kN/m² (h = ${n(h)} m)`
          : `zone ${site.zone} : vb,0 = ${n(zone.vb0, 1)} m/s, qb = ${n(zone.qb)} kN/m² ; qp = 0,7 · 1,7 · ${n(zone.qb)} · (${n(h)} / 10)^0,37 = ${n(qp * 1e3)} kN/m²`,
      result: qp,
    });
  } else
    out.push({
      key: 'wind.outOfService',
      title: 'Vent hors service',
      clause: 'pression saisie',
      formula: 'qp saisi',
      withValues: `qp = ${n((site.manualQp ?? 0) * 1e3)} kN/m²`,
      result: site.manualQp,
    });
  return out;
}
