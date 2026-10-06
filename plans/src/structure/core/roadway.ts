// Plaques de roulage : la charge verticale de l'installation répartie uniformément sur toute la surface couverte
// (emprise des Viewbox posées au sol), comparée à la portance admissible ; et, si les plaques ne répartissent que
// localement, la pression sous l'emprise la plus chargée (niveaux empilés). Coordonnées des appuis pour le plan
// d'implantation (origine en bas à gauche du plan, x vers la droite, y vers le haut). Fonctions pures ; N, mm.
import type { Estimate, EstimateModule, GroupReaction, P2 } from './estimate';
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

export const GRAVITY = 9.81;

export interface RoadwayZone {
  /** Viewbox posée au sol et Viewbox empilées au-dessus */
  module: string;
  stack: string[];
  /** surface de l'emprise (mm²), charge caractéristique de ses appuis (N), pression avec les plaques (N/mm²) */
  area: number;
  load: number;
  q: number;
  eta: number;
}

export interface RoadwayResult {
  /** surface couverte (mm²) et charge verticale caractéristique totale (N) */
  area: number;
  load: number;
  /** poids propre des plaques (N/mm²) */
  plates: number;
  /** pression uniforme sur toute la surface (N/mm²), plaques comprises */
  mean: number;
  zones: RoadwayZone[];
  max: RoadwayZone | null;
  bearing: number;
  etaMean: number;
  etaMax: number;
  records: CalcRecord[];
}

const centroid = (c: P2[]): P2 => [c.reduce((s, p) => s + p[0], 0) / c.length, c.reduce((s, p) => s + p[1], 0) / c.length];

function inside(p: P2, poly: P2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** kN/m² et kg/m² d'une pression en N/mm². */
export const kNm2 = (q: number) => q * 1e3;
export const kgm2 = (q: number) => (q * 1e6) / GRAVITY;

/**
 * Répartition sous plaques de roulage. `bearing` = portance admissible (N/mm²), `plates` = poids propre des plaques
 * (N/mm²). La charge d'un groupe d'appuis partagé par plusieurs Viewbox posées au sol est partagée à parts égales.
 */
export function roadwayPressure(modules: EstimateModule[], est: Estimate, bearing: number, plates = 0): RoadwayResult {
  const ground = modules.filter((m) => m.level === 0);
  const groundIds = new Set(ground.map((m) => m.id));
  const area = ground.reduce((s, m) => s + m.area, 0);
  const load = est.verticalK ?? est.totalG + est.totalQ;
  const mean = area > 0 ? load / area + plates : 0;
  // Viewbox empilées : rattachées à l'emprise au sol qui contient leur centre
  const stackOf = new Map<string, string[]>(ground.map((m) => [m.id, [m.id]]));
  for (const m of modules) {
    if (m.level === 0) continue;
    const c = centroid(m.corners);
    const base = ground.find((g) => inside(c, g.corners));
    if (base) stackOf.get(base.id)!.push(m.id);
  }
  const loadOf = new Map<string, number>(ground.map((m) => [m.id, 0]));
  for (const r of est.reactions) {
    const own = r.group.moduleIds.filter((id) => groundIds.has(id));
    for (const id of own) loadOf.set(id, loadOf.get(id)! + r.Rk / own.length);
  }
  const zones: RoadwayZone[] = ground.map((m) => {
    const L = loadOf.get(m.id)!;
    const q = L / m.area + plates;
    return { module: m.id, stack: stackOf.get(m.id)!, area: m.area, load: L, q, eta: bearing > 0 ? q / bearing : Infinity };
  });
  const max = zones.reduce<RoadwayZone | null>((a, z) => (!a || z.q > a.q ? z : a), null);
  const etaMean = bearing > 0 ? mean / bearing : Infinity;
  const etaMax = max ? max.eta : 0;
  const f = (v: number, d = 1) => fmtNumber(v, d);
  const records: CalcRecord[] = [
    {
      key: 'roadway.mean',
      title: 'Répartition uniforme sous plaques de roulage',
      clause: 'plaques rigides et jointives sur toute la surface couverte',
      formula: 'q = ΣRz,k / A + poids des plaques ≤ portance admissible',
      withValues: `ΣRz,k = ${f(load / 1e3)} kN ; A = ${f(area / 1e6, 2)} m² ; q = ${f(load / 1e3)} / ${f(area / 1e6, 2)} + ${f(kNm2(plates), 2)} = ${f(kNm2(mean), 2)} kN/m² (${f(kgm2(mean), 0)} kg/m²) ; portance ${f(kNm2(bearing), 0)} kN/m²`,
      eta: etaMean,
    },
  ];
  if (max)
    records.push({
      key: 'roadway.max',
      title: `Emprise la plus chargée — ${max.stack.join(' + ')}`,
      clause: 'plaques qui ne répartissent que sous chaque emprise (réactions maxi de ses appuis)',
      formula: 'q = Σ Rz,k des appuis de l’emprise / A de l’emprise + poids des plaques',
      withValues: `${f(max.load / 1e3)} kN / ${f(max.area / 1e6, 2)} m² + ${f(kNm2(plates), 2)} = ${f(kNm2(max.q), 2)} kN/m² (${f(kgm2(max.q), 0)} kg/m²)`,
      eta: etaMax,
    });
  return { area, load, plates, mean, zones, max, bearing, etaMean, etaMax, records };
}

/** Repère du plan d'implantation : origine au coin bas gauche de l'installation vue de dessus. */
export function planOrigin(modules: EstimateModule[]): { x: number; y: number } {
  const pts = modules.flatMap((m) => m.corners);
  return { x: Math.min(...pts.map((p) => p[0])), y: Math.max(...pts.map((p) => p[1])) };
}

/** Coordonnées (mm) d'un point du plan dans le repère d'implantation (y vers le haut du plan). */
export const planCoords = (p: P2, o: { x: number; y: number }): P2 => [p[0] - o.x, o.y - p[1]];

/** Libellé du type d'un appui. */
export function supportType(r: GroupReaction): string {
  const g = r.group;
  if (g.terrace) return g.middle ? 'pied central de terrasse' : 'pied d’angle de terrasse';
  if (g.post) return 'pied de poteau';
  if (g.stair) return 'pied d’escalier';
  if (g.jack) return g.middle ? 'vérin central' : 'vérin d’angle';
  if (g.middle) return 'pied central';
  return g.corners <= 1 ? 'angle seul' : `${g.corners} angles`;
}
