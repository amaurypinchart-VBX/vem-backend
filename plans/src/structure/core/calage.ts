// Calage d'une installation : estimation des réactions → types de groupes d'appuis (1, 2, 3, 4 angles, pieds centraux)
// → solutions de répartition par type, longrines sous les grands côtés, diffusion par couches (option) → solution
// retenue et liste de matériel. Les choix de l'utilisateur (plaques par type ou par appui, plaques de roulage sur toute
// la surface) remplacent la solution automatique ; chaque appui est vérifié sous sa propre réaction (chaîne pied →
// plaques → sol, `spreading.ts`) avec un diagnostic. Utilisé par le panneau « Sol & calage », la fiche PDF et le
// rapport. Fonctions pures.
import type { CalcRecord } from './records';
import type { Estimate, EstimateModule, EstimateOptions, GroupReaction, P2 } from './estimate';
import { estimateReactions } from './estimate';
import type { CommercialPlate, LongrineResult, MaterialLine, PlateResult, Solution, SpreadLayer, StockPlate, TimberBeam } from './ground';
import { C24_BEAMS, PANELS, chooseLongrine, designGroup, diffusionDepth, leastBad, recommended } from './ground';
import type { RoadwayResult } from './roadway';
import { roadwayPressure } from './roadway';
import type { CalageChoices, ChainResult, LayerRef } from './spreading';
import { adviseChain, checkChain, resolveLayers } from './spreading';
import { verdictOf } from './records';

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
  /** calage choisi par type d'appui ou par appui, plaques de roulage */
  choices?: CalageChoices;
  /** poids propre des plaques de roulage (N/mm²) */
  roadwayPlates?: number;
}

/** Vérification d'un appui sous sa propre réaction avec le calage qui lui est appliqué. */
export interface SupportCheck extends ChainResult {
  id: string;
  reaction: GroupReaction;
  /** type d'appui (« 1 »…« 4 », « M ») */
  typeKey: string;
  /** calage automatique, choisi pour le type, choisi pour cet appui */
  source: 'auto' | 'type' | 'support';
  layerList: SpreadLayer[];
  Rzk: number;
  REd: number;
  advice: string;
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
  /** type d'appui de base (« 1 »…« 4 », « M ») ; calage choisi (sinon automatique) et couches choisies */
  typeKey: string;
  custom: boolean;
  refs?: LayerRef[];
  /** chaque appui du groupe et diagnostic de l'appui le plus défavorable */
  checks: SupportCheck[];
  advice: string;
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
  /** chaque appui (ordre des réactions) ; plaques de roulage (toujours calculées, retenues si `roadwayOn`) */
  checks: SupportCheck[];
  roadway: RoadwayResult;
  roadwayOn: boolean;
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
  const choices = inp.choices ?? {};
  const roadway = roadwayPressure(inp.modules, est, inp.bearing, inp.roadwayPlates ?? 0);
  // plaques de roulage : il faut l'emprise au sol des Viewbox
  const roadwayOn = !!choices.roadway && roadway.area > 0;
  if (choices.roadway && !roadwayOn) warnings.push('Plaques de roulage : emprise au sol des Viewbox inconnue, non prises en compte.');
  const rw = { mean: roadway.mean, area: roadway.area, load: roadway.load };
  const types: CalageType[] = [];
  const checkOf = new Map<GroupReaction, SupportCheck>();
  for (const [key, all] of [...byType.entries()].sort((a, b) => (a[0] === 'M' ? 9 : Number(a[0])) - (b[0] === 'M' ? 9 : Number(b[0])))) {
    const corners = all[0].group.corners;
    const middle = all[0].group.middle;
    const jack = !!all[0].group.jack;
    const { a1, a2, confirmed } = contactArea(corners, middle, jack);
    if (!confirmed) warnings.push(jack ? 'Pieds à vérin : platine 15 × 15 cm supposée (7-309-002, à confirmer).' : 'Pieds centraux : surface de contact 15 × 15 cm supposée (à confirmer).');
    const baseLabel = typeLabel(corners, middle, jack);
    const unit = jack ? 'vérin' : middle ? 'pied central' : corners === 1 ? 'angle' : 'groupe';
    const contactLabel = `${jack ? 'Platine de vérin' : middle ? 'Pied central' : corners === 1 ? 'Angle' : `${corners} angles`} ${a1 / 10} × ${a2 / 10} cm`;
    // appuis du type regroupés par calage : automatique, choix du type, choix propre à un appui
    const parts = new Map<string, { refs: LayerRef[] | null; reactions: GroupReaction[]; own: boolean }>();
    for (const r of all) {
      const own = choices.bySupport?.[r.group.id];
      const refs = own ?? choices.byType?.[key] ?? null;
      const k = refs ? JSON.stringify(refs) : 'auto';
      if (!parts.has(k)) parts.set(k, { refs, reactions: [], own: false });
      const p = parts.get(k)!;
      p.reactions.push(r);
      if (own && JSON.stringify(own) !== JSON.stringify(choices.byType?.[key] ?? null)) p.own = true;
    }
    // automatique, puis le choix du type, puis les appuis choisis à part
    const rank = ([k, p]: [string, { own: boolean }]) => (k === 'auto' ? 0 : p.own ? 2 : 1);
    for (const [pk, part] of [...parts.entries()].sort((a, b) => rank(a) - rank(b))) {
      const reactions = part.reactions;
      const RzEd = Math.max(...reactions.map((r) => r.REd));
      const Rzk = Math.max(...reactions.map((r) => r.Rk));
      const d = designGroup({
        label: unit,
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
      const auto = recommended(d.solutions);
      const autoChosen = auto ?? leastBad(d.solutions);
      // couches appliquées : choix de l'utilisateur, sinon celles de la solution automatique (aucune sur plaques de roulage)
      let layers: SpreadLayer[] = [];
      if (part.refs) {
        const res = resolveLayers(part.refs, inp.stock);
        layers = res.layers;
        for (const m of res.missing) warnings.push(`Calage choisi : la plaque « ${m} » n’est plus dans le stock, elle est ignorée.`);
      } else if (!roadwayOn) layers = autoChosen?.layers ?? [];
      const custom = !!part.refs || roadwayOn;
      const checks = reactions.map((r): SupportCheck => {
        const Rk = inp.staticoConversion ? r.REd / 1.35 : r.Rk;
        const base = { Rzk: Rk, REd: r.REd, contact: [a1, a2] as [number, number], contactLabel, bearing: inp.bearing, roadway: roadwayOn ? rw : null, pointLoadMax: inp.pointLoadMax };
        const chain = checkChain({ ...base, layers });
        const source = choices.bySupport?.[r.group.id] ? 'support' : choices.byType?.[key] ? 'type' : 'auto';
        const advice = adviseChain(r.group.id, chain, layers, { base, stock: inp.stock, roadway: rw, roadwayOn, custom: !!part.refs });
        const c: SupportCheck = { ...chain, id: r.group.id, reaction: r, typeKey: key, source, layerList: layers, Rzk: Rk, REd: r.REd, advice };
        checkOf.set(r, c);
        return c;
      });
      const worst = checks.reduce((a, c) => (c.eta > a.eta ? c : a));
      let chosen = autoChosen;
      let solutions = d.solutions;
      if (custom) {
        const bottom = layers[layers.length - 1];
        const stack = layers.map((l) => `${l.n} × ${l.l / 10} × ${l.w / 10}${l.t ? ` × ${l.t} mm` : ' cm'}`).join(' + ');
        chosen = {
          kind: layers.length ? 'custom' : 'roadway',
          title: layers.length ? (roadwayOn ? 'Calage choisi, sur plaques de roulage' : 'Calage choisi') : roadwayOn ? 'Plaques de roulage sur toute la surface' : 'Sans plaque',
          summary: layers.length ? `${stack} par ${unit}${roadwayOn ? ', sur plaques de roulage' : ''}` : roadwayOn ? 'pied posé sur les plaques de roulage' : 'pied posé directement au sol',
          feasible: worst.eta <= 1,
          remarks: worst.problems,
          eta: worst.eta,
          materials: layers.map((l) => ({
            label: materialLabel(l),
            dims: l.material === 'commercial' ? `${l.l} × ${l.w} mm` : `${l.l} × ${l.w} × ${l.t} mm`,
            quantity: l.n * reactions.length,
            massKg: l.massKg * l.n * reactions.length,
          })),
          records: worst.records,
          ...(bottom ? { footprint: { l: bottom.l, w: bottom.w } } : {}),
          layers,
        };
        solutions = [chosen, ...d.solutions];
      }
      const standard = custom ? verdictOf(worst.eta) !== 'fail' : !!auto;
      const ids = reactions.map((r) => r.group.id);
      types.push({
        key: pk === 'auto' ? key : `${key}:${pk}`,
        label: part.own ? `${baseLabel} — ${ids.join(', ')}` : baseLabel,
        corners,
        middle,
        jack,
        reactions,
        RzEd,
        Rzk: d.plate.Rzk,
        a1,
        a2,
        plate: d.plate,
        solutions,
        chosen,
        standard,
        extra,
        typeKey: key,
        custom: !!part.refs,
        ...(part.refs ? { refs: part.refs } : {}),
        checks,
        advice: worst.advice,
      });
    }
  }
  const checks = est.reactions.map((r) => checkOf.get(r)!).filter(Boolean);

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
  const anyChoice = roadwayOn || !!Object.keys(choices.byType ?? {}).length || !!Object.keys(choices.bySupport ?? {}).length;
  const materials = mergeMaterials(allPlates || !longrine || anyChoice ? types.flatMap((t) => t.chosen?.materials ?? []) : longrine.solution.materials);
  if (roadwayOn)
    materials.push({
      label: 'Plaques de roulage jointives',
      dims: `${(roadway.area / 1e6).toFixed(1).replace('.', ',')} m² à couvrir (toute l’emprise au sol)`,
      quantity: 1,
      massKg: (roadway.plates * roadway.area) / 9.81,
    });
  if (!allPlates && !longrine)
    warnings.push('Aucune solution standard pour tous les appuis : la moins mauvaise est chiffrée, une étude de répartition spécifique est nécessaire.');
  return { estimate: est, types, longrine, materials, allPlates, warnings, checks, roadway, roadwayOn };
}

function materialLabel(l: SpreadLayer): string {
  if (l.material === 'commercial') return l.label;
  if (l.material === 'steel') return 'Tôle acier S235';
  return PANELS[l.material].label;
}

/** Lignes de matériel identiques (même désignation et mêmes dimensions) additionnées. */
function mergeMaterials(lines: MaterialLine[]): MaterialLine[] {
  const out: MaterialLine[] = [];
  for (const m of lines) {
    const same = out.find((o) => o.label === m.label && o.dims === m.dims);
    if (same) {
      same.quantity += m.quantity;
      same.massKg += m.massKg;
    } else out.push({ ...m });
  }
  return out;
}
