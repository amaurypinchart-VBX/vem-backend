// Références réglementaires du calage Viewbox (Allemagne, Fliegende Bauten) : Prüfbuch TÜV Rheinland n° 190060 B
// (Ausführungsgenehmigung du 12.12.2019, Koblenz) sur la base du rapport FB bv 3703 / 19 - 02 (Köln, 12.06.2019) et du
// calcul statico 18-0573 Rev. 1 (HKES Eventlogistik). Auflage 4.7 : calage selon le plan 18-0573-03 ; Auflage 4.9 :
// portance admissible ≥ 200 kN/m². Plaques minimales du calcul 18-0573 § 3.9.1 (contreplaqué F40/30, 1, 2 ou 3 plaques
// identiques empilées) selon le nombre de containers posés sur la même plaque. Fonctions pures ; mm, N/mm².
import type { SpreadLayer } from './ground';

export const TUV = {
  prufbuch: '190060 B',
  issuer: 'TÜV Rheinland Industrie Service GmbH',
  approvalDate: '12.12.2019',
  validUntil: '30.06.2022',
  report: 'FB bv 3703 / 19 - 02',
  reportDate: '12.06.2019',
  statics: 'statico 18-0573 Rev. 1',
  calagePlan: '18-0573-03',
  /** portance admissible minimale (N/mm²) : Auflage 4.9 */
  minBearing: 0.2,
} as const;

/** Plaque minimale du Prüfbuch : côté (mm) et épaisseur de chaque plaque pour 1, 2, 3 plaques empilées (mm). */
export interface TuvPlate {
  containers: number;
  /** Rz,k du calcul 18-0573 (N) */
  Rzk: number;
  side: number;
  t: [number, number, number];
}

/** statico 18-0573 § 3.9.1 : max. aus einem / zwei / drei / vier angrenzenden Containern. */
export const TUV_PLATES: TuvPlate[] = [
  { containers: 1, Rzk: 92e3, side: 700, t: [53, 38, 31] },
  { containers: 2, Rzk: 130e3, side: 850, t: [40, 29, 24] },
  { containers: 3, Rzk: 200e3, side: 1000, t: [61, 43, 35] },
  { containers: 4, Rzk: 260e3, side: 1150, t: [78, 55, 45] },
];

/** Plaque minimale du Prüfbuch pour un appui de n containers (angles ou vérins d'angle) ; aucune pour un pied central. */
export function tuvPlate(containers: number, middle: boolean): TuvPlate | null {
  if (middle || containers < 1) return null;
  return TUV_PLATES[Math.min(4, containers) - 1];
}

/** « 70 × 70 cm, 1 × 5,3 / 2 × 3,8 / 3 × 3,1 cm » */
export function tuvPlateText(p: TuvPlate): string {
  const c = (mm: number) => String(mm / 10).replace('.', ',');
  return `${c(p.side)} × ${c(p.side)} cm, épaisseur 1 × ${c(p.t[0])} / 2 × ${c(p.t[1])} / 3 × ${c(p.t[2])} cm`;
}

export interface TuvCheck {
  plate: TuvPlate;
  /** conforme (taille et épaisseur), non conforme, ou non comparable (tôle, plaque du commerce, plusieurs tailles) */
  ok: boolean | null;
  text: string;
}

/**
 * Conformité d'un calage au minimum du Prüfbuch : plaque bois (contreplaqué F40/30 ou multiplex bouleau, au moins aussi
 * résistant en flexion) d'au moins la taille du tableau, chaque plaque au moins l'épaisseur donnée pour ce nombre de
 * plaques empilées. Une pyramide est jugée sur sa couche du dessous.
 */
export function tuvConformity(containers: number, middle: boolean, layers: SpreadLayer[]): TuvCheck | null {
  const plate = tuvPlate(containers, middle);
  if (!plate) return null;
  const req = tuvPlateText(plate);
  const bottom = layers[layers.length - 1];
  if (!bottom) return { plate, ok: false, text: `aucune plaque ; Prüfbuch : ${req}` };
  if (bottom.material !== 'F40' && bottom.material !== 'birch') return { plate, ok: null, text: `${bottom.label} : non prévu par le plan ${TUV.calagePlan} (Prüfbuch : ${req})` };
  const small = Math.min(bottom.l, bottom.w) < plate.side;
  const n = Math.min(3, bottom.n);
  const thin = bottom.n > 3 || bottom.t < plate.t[n - 1];
  if (!small && !thin) return { plate, ok: true, text: `conforme au Prüfbuch (${req})` };
  const why = [small ? `plaque ${bottom.l / 10} × ${bottom.w / 10} cm < ${plate.side / 10} × ${plate.side / 10} cm` : '', thin ? `${bottom.n} × ${String(bottom.t / 10).replace('.', ',')} cm < ${n} × ${String(plate.t[n - 1] / 10).replace('.', ',')} cm` : '']
    .filter(Boolean)
    .join(' ; ');
  return { plate, ok: false, text: `non conforme au Prüfbuch : ${why} (minimum : ${req})` };
}
