// Calage d'une installation : estimation des réactions → types de groupes d'appuis (1, 2, 3, 4 angles, pieds centraux)
// → solutions de répartition par type, longrines sous les grands côtés, diffusion par couches (option) → solution
// retenue et liste de matériel. Utilisé par le panneau « Sol & calage » et la fiche PDF. Fonctions pures.
import type { CalcRecord } from './records';
import type { Estimate, EstimateModule, EstimateOptions, GroupReaction, P2 } from './estimate';
import { estimateReactions } from './estimate';
import type { CommercialPlate, LongrineResult, MaterialLine, PlateResult, Solution, StockPlate, TimberBeam } from './ground';
import { C24_BEAMS, chooseLongrine, designGroup, diffusionDepth, leastBad, recommended } from './ground';

/** Surface de contact (mm) selon le nombre d'angles posés sur la même plaque (statico 24-0571 § 3.12). */
export function contactArea(corners: number, middle: boolean, jack = false): { a1: number; a2: number; confirmed: boolean } {
  // platine de vérin 7-309-002 et réception centrale : 15 × 15 cm supposés
  if (middle || jack) return { a1: 150, a2: 150, confirmed: false };
  if (corners <= 1) return { a1: 210, a2: 210, confirmed: true };
  if (corners === 2) return { a1: 420, a2: 210, confirmed: true };
  // 3 angles : surface prise comme pour 2 angles (côté de la sécurité)
  if (corners === 3) return { a1: 420, a2: 210, confirmed: true };
  return { a1: 420, a2: 420, confirmed: true };
}

export interface CalageInput {
  modules: EstimateModule[];
  estimate: EstimateOptions;
  /** portance admissible (N/mm²) et charge ponctuelle admissible (N, dalles) */
  bearing: number;
  pointLoadMax?: number;
  /** Rz,k = Rz,Ed / 1,35 (méthode statico) au lieu de la réaction caractéristique calculée */
  staticoConversion: boolean;
  thicknesses: number[];
  stock: StockPlate[];
  commercial: CommercialPlate[];
  longrine: { k: number; beams: Array<Pick<TimberBeam, 'b' | 'h'>>; overhang: number; maxCount: number };
  diffusion: boolean;
  /** réactions du calcul complet (groupes d'appuis) à la place de l'estimation instantanée */
  reactions?: Estimate;
}

export interface CalageType {
  key: string;
  label: string;
  corners: number;
  middle: boolean;
  jack: boolean;
  reactions: GroupReaction[];
  RzEd: number;
  Rzk: number;
  a1: number;
  a2: number;
  plate: PlateResult;
  solutions: Solution[];
  /** solution retenue : faisable, sinon la moins mauvaise (standard = false) */
  chosen?: Solution;
  standard: boolean;
  extra: CalcRecord[];
}

export interface CalageResult {
  estimate: Estimate;
  types: CalageType[];
  longrine: null | {
    beam: Pick<TimberBeam, 'b' | 'h'>;
    count: number;
    pieces: number;
    length: number;
    result: LongrineResult;
    solution: Solution;
  };
  /** matériel de la solution retenue pour chaque type */
  materials: MaterialLine[];
  /** tout est calé par des plaques faisables */
  allPlates: boolean;
  warnings: string[];
}

const typeLabel = (corners: number, middle: boolean, jack = false) =>
  jack ? (middle ? 'vérin central' : 'vérin d’angle') : middle ? 'pied central' : corners === 1 ? 'angle seul' : `${corners} angles sur une plaque`;

export function computeCalage(inp: CalageInput): CalageResult {
  const est = inp.reactions ?? estimateReactions(inp.modules, inp.estimate);
  const warnings = [...new Set(est.warnings)];
  // pieds à vérin : décalés de 155 mm en diagonale depuis l'angle (réception de pied)
  const reach = 2 * inp.estimate.groupTolerance + (est.reactions.some((r) => r.group.jack) ? 250 : 0);
  const byType = new Map<string, GroupReaction[]>();
  for (const r of est.reactions) {
    const key = r.group.middle ? 'M' : String(r.group.corners);
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key)!.push(r);
  }
  const types: CalageType[] = [...byType.entries()]
    .sort((a, b) => (a[0] === 'M' ? 9 : Number(a[0])) - (b[0] === 'M' ? 9 : Number(b[0])))
    .map(([key, reactions]) => {
      const corners = reactions[0].group.corners;
      const middle = reactions[0].group.middle;
      const jack = !!reactions[0].group.jack;
      const RzEd = Math.max(...reactions.map((r) => r.REd));
      const Rzk = Math.max(...reactions.map((r) => r.Rk));
      const { a1, a2, confirmed } = contactArea(corners, middle, jack);
      if (!confirmed) warnings.push(jack ? 'Pieds à vérin : platine 15 × 15 cm supposée (7-309-002, à confirmer).' : 'Pieds centraux : surface de contact 15 × 15 cm supposée (à confirmer).');
      const label = typeLabel(corners, middle, jack);
      const d = designGroup({
        label: jack ? 'vérin' : middle ? 'pied central' : corners === 1 ? 'angle' : 'groupe',
        groups: reactions.length,
        RzEd,
        Rzk: inp.staticoConversion ? undefined : Rzk,
        bearing: inp.bearing,
        pointLoadMax: inp.pointLoadMax,
        a1,
        a2,
        thicknesses: inp.thicknesses,
        stock: inp.stock,
        commercial: inp.commercial,
      });
      const extra: CalcRecord[] = [];
      if (d.point) extra.push(d.point);
      if (inp.diffusion) {
        const df = diffusionDepth(d.plate.Rzk, inp.bearing, a1, a2);
        extra.push(df.record);
        d.solutions.push({
          kind: 'diffusion',
          title: 'Couches continues (diffusion à 45°)',
          summary: `épaisseur totale ≥ ${Math.ceil(df.H / 10)} cm sous chaque ${middle ? 'pied' : 'groupe'}`,
          feasible: false,
          remarks: ['hypothèse de diffusion à 45° : à valider pour le matériau des couches'],
          eta: 1,
          materials: [],
          records: [df.record],
        });
      }
      const ok = recommended(d.solutions);
      return { key, label, corners, middle, jack, reactions, RzEd, Rzk: d.plate.Rzk, a1, a2, plate: d.plate, solutions: d.solutions, chosen: ok ?? leastBad(d.solutions), standard: !!ok, extra };
    });

  // ─── longrines sous les grands côtés des Viewbox posées au sol ───
  let longrine: CalageResult['longrine'] = null;
  const groundMods = inp.modules.filter((m) => m.level === 0);
  const groupAt = (p: P2) => {
    let best: GroupReaction | undefined;
    let bd = Infinity;
    for (const r of est.reactions) {
      if (r.group.middle) continue;
      const d = Math.hypot(r.group.position[0] - p[0], r.group.position[1] - p[1]);
      if (d < bd) [bd, best] = [d, r];
    }
    return bd <= reach ? best : undefined;
  };
  const sides: Array<{ a: P2; b: P2 }> = [];
  for (const m of groundMods) {
    const c = m.corners;
    const edges: Array<[P2, P2]> = [
      [c[0], c[1]],
      [c[1], c[2]],
      [c[2], c[3]],
      [c[3], c[0]],
    ];
    edges.sort((x, y) => Math.hypot(y[1][0] - y[0][0], y[1][1] - y[0][1]) - Math.hypot(x[1][0] - x[0][0], x[1][1] - x[0][1]));
    for (const [a, b] of edges.slice(0, 2)) sides.push({ a, b });
  }
  const share = new Map<GroupReaction, number>();
  for (const s of sides)
    for (const p of [s.a, s.b]) {
      const g = groupAt(p);
      if (g) share.set(g, (share.get(g) ?? 0) + 1);
    }
  let worst: { L: number; loads: Array<{ x: number; Pk: number; PEd: number }> } | null = null;
  let worstSum = -Infinity;
  const oh = inp.longrine.overhang;
  for (const s of sides) {
    const len = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const L = len + 2 * oh;
    const loads: Array<{ x: number; Pk: number; PEd: number }> = [];
    [s.a, s.b].forEach((p, k) => {
      const g = groupAt(p);
      if (!g) return;
      const n = share.get(g) ?? 1;
      loads.push({ x: k === 0 ? oh + 100 : L - oh - 100, Pk: g.Rk / n, PEd: g.REd / n });
    });
    if (inp.estimate.middleFeet || inp.estimate.jacks) {
      const mid: P2 = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2];
      const g = est.reactions.find((r) => r.group.middle && Math.hypot(r.group.position[0] - mid[0], r.group.position[1] - mid[1]) <= reach);
      if (g) loads.push({ x: L / 2, Pk: g.Rk / g.group.moduleIds.length, PEd: g.REd / g.group.moduleIds.length });
    }
    const sum = loads.reduce((a, l) => a + l.PEd, 0);
    if (loads.length >= 2 && sum > worstSum) [worstSum, worst] = [sum, { L, loads }];
  }
  if (worst) {
    const best = chooseLongrine(
      { loads: worst.loads, length: worst.L, k: inp.longrine.k, bearing: inp.bearing, contact: 210 },
      inp.longrine.beams.length ? inp.longrine.beams : C24_BEAMS,
      inp.longrine.maxCount,
    );
    if (best) {
      const pieces = sides.length * best.count;
      const massEach = best.result.massKg / best.count;
      longrine = {
        ...best,
        pieces,
        length: worst.L,
        solution: {
          kind: 'longrine',
          title: 'Longrines bois C24 sous les grands côtés',
          summary: `${best.count} × ${best.beam.b} × ${best.beam.h} mm, L = ${(worst.L / 1000).toFixed(2).replace('.', ',')} m, sous chaque grand côté`,
          feasible: true,
          remarks: best.result.records.some((r) => r.key === 'longrine.c90' && (r.eta ?? 0) > 0.9) ? ['prévoir une tôle sous les angles (compression transversale du bois)'] : [],
          eta: best.result.eta,
          materials: [{ label: 'Bois C24', dims: `${best.beam.b} × ${best.beam.h} × ${Math.round(worst.L)} mm`, quantity: pieces, massKg: massEach * pieces }],
          records: best.result.records,
        },
      };
    } else warnings.push('Longrines : aucune section de la liste ne suffit (6 pièces côte à côte au plus).');
  }

  const allPlates = types.every((t) => t.standard);
  const materials = allPlates || !longrine ? types.flatMap((t) => t.chosen?.materials ?? []) : longrine.solution.materials;
  if (!allPlates && !longrine)
    warnings.push('Aucune solution standard pour tous les appuis : la moins mauvaise est chiffrée, une étude de répartition spécifique est nécessaire.');
  return { estimate: est, types, longrine, materials, allPlates, warnings };
}
