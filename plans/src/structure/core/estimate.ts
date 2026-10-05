// Estimation instantanée des réactions d'appui (§ 11.2), avant le calcul complet : surfaces tributaires (chaque Viewbox
// descend son poids et ses charges à ses 4 angles, les niveaux empilés se cumulent), basculement de chaque ensemble
// relié traité comme un bloc rigide sous le vent, l'effort horizontal d'exploitation (V/10) et le défaut d'aplomb.
// Les angles distants de moins de 100 mm en plan forment un groupe d'appuis (une plaque commune). Fonctions pures.
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

export type P2 = [number, number];

export interface EstimateModule {
  id: string;
  /** niveau d'empilement (0 = posé au sol) */
  level: number;
  /** 4 angles en plan (mm) */
  corners: P2[];
  /** surface en plan (mm²) et hauteur d'étage (mm) */
  area: number;
  height: number;
  /** toiture accessible (terrasse) */
  roofAccessible?: boolean;
  /** poids propre de ce module s'il diffère du poids par défaut (N) */
  weight?: number;
}

/**
 * Poids des barres d'une Viewbox 5900 du gabarit statico (G1, 78,5 kN/m³), comme le calcul complet : le poids propre
 * « le plus lourd » compare la pesée à barres + plafond + sol (vérifié contre le gabarit dans estimate.test).
 */
export const VIEWBOX_STEEL_WEIGHT = 16615;

export interface EstimateLoads {
  /** poids d'une Viewbox (N) ; plafond, sol (N/mm²) ; exploitation des planchers et des toitures accessibles (N/mm²) */
  moduleWeight: number;
  /** poids propre retenu : le plus lourd (barres + plafond + sol ou pesée, défaut) ou la pesée exactement */
  weightMode?: 'max' | 'weighed';
  /** poids des barres d'une Viewbox standard (N), ramené à la surface comme la pesée */
  steelWeight?: number;
  ceiling: number;
  floorFinish: number;
  live: number;
  roofLive: number;
  /** murs, garde-corps, logos… par module (N) */
  extraPerModule: number;
  /** neige sur les toitures du dernier niveau (N/mm², coefficient de forme compris) */
  snowRoof?: number;
}

export interface EstimateOptions {
  loads: EstimateLoads;
  /** pression dynamique en service et hors service (N/mm²), cp total au vent (luv + lee) */
  windInService: number;
  windOutOfService: number;
  cp: number;
  horizontalRatio: number;
  sway: number;
  gammaG: number;
  gammaGQ: number;
  gammaQ: number;
  gammaW: number;
  /** tolérance de regroupement des angles (mm) */
  groupTolerance: number;
  /** pieds centraux des grands côtés utilisés (modules posés au sol) */
  middleFeet: boolean;
  /**
   * pieds à vérin : 6 appuis par Viewbox posée au sol (4 pieds d'angle + 2 pieds centraux), chacun sur sa platine,
   * décalés de `footOffset` vers l'intérieur ; un angle partagé par deux Viewbox devient deux vérins
   */
  jacks?: boolean;
  footOffset?: number;
  /** hors service, le dernier niveau est évacué (en plus des terrasses) */
  evacuateTopLevel: boolean;
  /** majoration forfaitaire supplémentaire (0,1 = +10 %) */
  extraFactor: number;
}

export const ESTIMATE_DEFAULTS: Omit<EstimateOptions, 'loads'> = {
  windInService: 0.2e-3,
  windOutOfService: 0.37e-3,
  cp: 1.3,
  horizontalRatio: 0.1,
  sway: 1 / 200,
  gammaG: 1.35,
  gammaGQ: 1.1,
  gammaQ: 1.35,
  gammaW: 1.35,
  groupTolerance: 100,
  middleFeet: false,
  evacuateTopLevel: true,
  extraFactor: 0,
};

export interface SupportGroup {
  id: string;
  position: P2;
  /** nombre d'angles de Viewbox posés au sol dans le groupe (0 = pied central) */
  corners: number;
  middle: boolean;
  /** pied à vérin (platine sous la tige) */
  jack?: boolean;
  /** pied d'escalier extérieur (montant sur vérin Layher, talon de limon) */
  stair?: boolean;
  moduleIds: string[];
}

/** Type de calage d'un groupe d'appuis : « 1 »…« 4 » angles, « M » pied central, « E » pied d'escalier. */
export const groupTypeKey = (g: Pick<SupportGroup, 'corners' | 'middle' | 'stair'>) => (g.stair ? 'E' : g.middle ? 'M' : String(Math.min(4, g.corners)));

/** Réaction d'un groupe d'appuis dans une combinaison et part du public qu'elle contient (public limité). */
export interface ComboReaction {
  combo: string;
  cls: 'SLS' | 'ULS' | 'STAB';
  /** réaction (N) ; coefficient du public dans la combinaison (0 = sans public) ; public plein à cet appui (N, sans coefficient) */
  R: number;
  gQ: number;
  Q: number;
}

export interface GroupReaction {
  group: SupportGroup;
  /** réaction caractéristique maxi / mini et de calcul maxi / mini (N) */
  Rk: number;
  RkMin: number;
  REd: number;
  REdMin: number;
  combo: string;
  comboK: string;
  /** part verticale permanente et d'exploitation (N) */
  G: number;
  Q: number;
  /** réaction dans chaque combinaison (public limité) */
  combos?: ComboReaction[];
}

export interface Estimate {
  groups: SupportGroup[];
  reactions: GroupReaction[];
  totalG: number;
  totalQ: number;
  /** charge verticale totale caractéristique (N) : combinaison ELS la plus lourde du calcul complet, sinon ΣG + ΣQ */
  verticalK?: number;
  /** origine des réactions : calcul complet (modèle 3D) ou estimation instantanée */
  method?: 'fem' | 'estimate';
  /** somme de tous les appuis par combinaison (charge verticale totale avec un public limité) */
  totals?: ComboReaction[];
  /**
   * public limité : un groupe d'appuis reçoit au plus publicCap × public limité (le public serré au-dessus de lui ; > 1
   * quand la part du public du calcul complet comprend l'effort horizontal H = V/10 des planchers en hauteur)
   */
  publicCap?: number;
  /** public limité appliqué (N) */
  publicLimit?: number;
  /** ensembles reliés (basculement calculé séparément) */
  units: string[][];
  warnings: string[];
  records: CalcRecord[];
}

const dist = (a: P2, b: P2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

class UnionFind {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    return this.p[i] === i ? i : (this.p[i] = this.find(this.p[i]));
  }
  join(a: number, b: number) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.p[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

/** Milieux des deux grands côtés d'un module (pieds centraux). */
function middlePoints(c: P2[]): P2[] {
  const edges: Array<[P2, P2]> = [
    [c[0], c[1]],
    [c[1], c[2]],
    [c[2], c[3]],
    [c[3], c[0]],
  ];
  const sorted = [...edges].sort((a, b) => dist(b[0], b[1]) - dist(a[0], a[1]));
  return sorted.slice(0, 2).map(([a, b]) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as P2);
}

interface Part {
  /** charges verticales par groupe (N) par nature */
  G: number;
  Q: number;
  QaB: number;
  /** neige (toitures du dernier niveau, reprise par les angles) */
  S?: number;
}

export function estimateReactions(modules: EstimateModule[], opt: EstimateOptions): Estimate {
  const warnings: string[] = [];
  const L = opt.loads;
  // ─── points d'appui : angles de tous les niveaux + pieds centraux des modules au sol ───
  interface Pt {
    pos: P2;
    module: number;
    level: number;
    middle: boolean;
  }
  const pts: Pt[] = [];
  modules.forEach((m, k) => {
    for (const c of m.corners) pts.push({ pos: c, module: k, level: m.level, middle: false });
    if ((opt.middleFeet || opt.jacks) && m.level === 0) for (const c of middlePoints(m.corners)) pts.push({ pos: c, module: k, level: 0, middle: true });
  });
  const uf = new UnionFind(pts.length);
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) if (pts[i].middle === pts[j].middle && dist(pts[i].pos, pts[j].pos) <= opt.groupTolerance) uf.join(i, j);
  const clusters = new Map<number, number[]>();
  pts.forEach((_, i) => {
    const r = uf.find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r)!.push(i);
  });
  const ground = [...clusters.values()].filter((c) => c.some((i) => pts[i].level === 0));
  // ordre de lecture : de gauche à droite puis de haut en bas en plan
  const center = (c: number[]): P2 => [c.reduce((s, i) => s + pts[i].pos[0], 0) / c.length, c.reduce((s, i) => s + pts[i].pos[1], 0) / c.length];
  // rangées de 500 mm : des groupes décalés de quelques mm (2, 3 ou 4 angles) restent sur la même rangée
  ground.sort((a, b) => Math.round(center(a)[1] / 500) - Math.round(center(b)[1] / 500) || center(a)[0] - center(b)[0]);
  const groups: SupportGroup[] = ground.map((c, k) => ({
    id: `${pts[c[0]].middle ? 'M' : 'P'}${k + 1}`,
    position: center(c),
    corners: pts[c[0]].middle ? 0 : c.filter((i) => pts[i].level === 0).length,
    middle: pts[c[0]].middle,
    moduleIds: [...new Set(c.map((i) => modules[pts[i].module].id))],
  }));
  const groupOfPoint = new Int32Array(pts.length).fill(-1);
  ground.forEach((c, g) => c.forEach((i) => (groupOfPoint[i] = g)));
  // points d'étage non portés par un appui au sol : rattachés au groupe le plus proche (empilement décalé)
  const floating = new Set<string>();
  pts.forEach((p, i) => {
    if (groupOfPoint[i] >= 0 || p.middle) return;
    let best = 0;
    let bd = Infinity;
    groups.forEach((g, k) => {
      if (g.middle) return;
      const d = dist(g.position, p.pos);
      if (d < bd) [bd, best] = [d, k];
    });
    groupOfPoint[i] = best;
    floating.add(modules[p.module].id);
  });
  if (floating.size) warnings.push(`Empilement décalé (${[...floating].join(', ')}) : angles sans appui en dessous, estimation peu fiable — calcul complet nécessaire.`);

  // ─── charges verticales par module et par groupe ───
  const isTop = modules.map((m) =>
    !modules.some((o) => o.level === m.level + 1 && o.corners.some((c) => m.corners.some((d) => dist(c, d) <= opt.groupTolerance))),
  );
  const parts: Part[] = groups.map(() => ({ G: 0, Q: 0, QaB: 0, S: 0 }));
  let totalG = 0;
  let totalQ = 0;
  let totalS = 0;
  const perModule = modules.map((m, k) => {
    // poids d'une Viewbox standard (5 900 × 2 500) ramené à la surface du module (8400 : prorata, données inconnues) ;
    // le poids pesé comprend planchers et isolants : « le plus lourd » le compare à barres + plafond + sol comme le
    // calcul complet (complément Gc), « pesée » le retient tel quel
    const ratio = m.area / (5900 * 2500);
    const weight = m.weight ?? L.moduleWeight * ratio;
    const modelled = (L.steelWeight ?? VIEWBOX_STEEL_WEIGHT) * ratio + (L.ceiling + L.floorFinish) * m.area;
    const G = (L.weightMode === 'weighed' ? weight : Math.max(weight, modelled)) + L.extraPerModule;
    const Qfloor = L.live * m.area;
    const Qroof = m.roofAccessible ? L.roofLive * m.area : 0;
    const QaB = opt.evacuateTopLevel && isTop[k] ? 0 : Qfloor;
    totalG += G;
    totalQ += Qfloor + Qroof;
    const S = isTop[k] ? (L.snowRoof ?? 0) * m.area : 0;
    totalS += S;
    return { G, Q: Qfloor + Qroof, QaB, floorG: L.floorFinish * m.area + 0.5 * weight, Qfloor, S };
  });
  modules.forEach((_, k) => {
    const lm = perModule[k];
    const cornerPts = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.module === k && !p.middle);
    const midPts = pts.map((p, i) => ({ p, i })).filter(({ p }) => p.module === k && p.middle);
    const add = (list: typeof cornerPts, G: number, Q: number, QaB: number) =>
      list.forEach(({ i }) => {
        const g = parts[groupOfPoint[i]];
        g.G += G / list.length;
        g.Q += Q / list.length;
        g.QaB += QaB / list.length;
      });
    for (const { i } of cornerPts) parts[groupOfPoint[i]].S! += lm.S / cornerPts.length;
    if (midPts.length) {
      // plancher sur rive continue à trois appuis : 62,5 % aux pieds centraux, 37,5 % aux angles
      const QaBfloor = lm.QaB;
      add(midPts, 0.625 * lm.floorG, 0.625 * lm.Qfloor, 0.625 * QaBfloor);
      add(cornerPts, lm.G - 0.625 * lm.floorG, lm.Q - 0.625 * lm.Qfloor, lm.QaB - 0.625 * QaBfloor);
    } else add(cornerPts, lm.G, lm.Q, lm.QaB);
  });

  // ─── ensembles reliés (angles partagés ou empilés) ───
  const muf = new UnionFind(modules.length);
  pts.forEach((p, i) => {
    const g = groupOfPoint[i];
    pts.forEach((q, j) => {
      if (j > i && groupOfPoint[j] === g && !p.middle && !q.middle) muf.join(p.module, q.module);
    });
  });
  const unitOf = modules.map((_, k) => muf.find(k));
  const unitIds = [...new Set(unitOf)];
  const units = unitIds.map((u) => modules.filter((_, k) => unitOf[k] === u).map((m) => m.id));
  const groupUnit = groups.map((g) => unitOf[modules.findIndex((m) => m.id === g.moduleIds[0])]);

  // ─── combinaisons ───
  interface Combo {
    name: string;
    gG: number;
    gQ: number;
    useQaB: boolean;
    gW: number;
    windQ: number;
    withH: boolean;
    dir: P2 | null;
    /** coefficient de la neige */
    gS?: number;
  }
  const dirs: Array<{ n: string; d: P2 }> = [
    { n: 'x+', d: [1, 0] },
    { n: 'x−', d: [-1, 0] },
    { n: 'y+', d: [0, 1] },
    { n: 'y−', d: [0, -1] },
  ];
  const combos = (design: boolean): Combo[] => {
    const f = (v: number) => (design ? v : 1);
    const out: Combo[] = [{ name: design ? 'CO1 : 1,35 G' : 'G', gG: f(opt.gammaG), gQ: 0, useQaB: false, gW: 0, windQ: 0, withH: false, dir: null }];
    for (const { n, d } of dirs) {
      const gG = f(opt.gammaGQ);
      const gQ = f(opt.gammaQ);
      const gW = f(opt.gammaW);
      out.push(
        { name: `G + Q + H (${n})`, gG, gQ, useQaB: false, gW: 0, windQ: 0, withH: true, dir: d },
        { name: `G + W en service (${n})`, gG, gQ: 0, useQaB: false, gW, windQ: opt.windInService, withH: false, dir: d },
        { name: `G + Q + H + W en service (${n})`, gG, gQ, useQaB: false, gW, windQ: opt.windInService, withH: true, dir: d },
        { name: `G + W hors service (${n})`, gG, gQ: 0, useQaB: false, gW, windQ: opt.windOutOfService, withH: false, dir: d },
        { name: `G + Q hors service + W hors service (${n})`, gG, gQ, useQaB: true, gW, windQ: opt.windOutOfService, withH: true, dir: d },
      );
    }
    if ((L.snowRoof ?? 0) > 0) {
      const psi = f(opt.gammaQ) * 0.5;
      out.push({ name: design ? 'G + S (neige)' : 'G + S (neige)', gG: f(opt.gammaGQ), gQ: 0, useQaB: false, gW: 0, windQ: 0, withH: false, dir: null, gS: f(opt.gammaQ) });
      for (const { n, d } of dirs) out.push({ name: `G + W hors service + ψ0 S (${n})`, gG: f(opt.gammaGQ), gQ: 0, useQaB: false, gW: f(opt.gammaW), windQ: opt.windOutOfService, withH: false, dir: d, gS: psi });
    }
    return out;
  };

  // géométrie par ensemble : groupes au sol, niveaux (largeur exposée selon la direction)
  const levelData = unitIds.map((u) => {
    const mods = modules.map((m, k) => ({ m, k })).filter(({ k }) => unitOf[k] === u);
    const levels = [...new Set(mods.map(({ m }) => m.level))].sort((a, b) => a - b);
    return { u, mods, levels };
  });

  const evaluate = (c: Combo): number[] => {
    const R = parts.map((p) => c.gG * p.G + c.gQ * (c.useQaB ? p.QaB : p.Q) + (c.gS ?? 0) * (p.S ?? 0));
    if (!c.dir) return R;
    const d = c.dir;
    const perp: P2 = [-d[1], d[0]];
    for (const { u, mods, levels } of levelData) {
      const gi = groups.map((_, g) => g).filter((g) => groupUnit[g] === u && !groups[g].middle);
      if (gi.length < 2) continue;
      let M = 0;
      for (const lv of levels) {
        const at = mods.filter(({ m }) => m.level === lv);
        const h = Math.max(...at.map(({ m }) => m.height));
        const z0 = lv * h;
        // largeur exposée : étendue des angles perpendiculairement au vent
        const proj = at.flatMap(({ m }) => m.corners.map((p) => p[0] * perp[0] + p[1] * perp[1]));
        const width = Math.max(...proj) - Math.min(...proj);
        const Fw = c.gW * c.windQ * opt.cp * width * h;
        const V = at.reduce((s, { k }) => s + c.gG * perModule[k].G + c.gQ * (c.useQaB ? perModule[k].QaB : perModule[k].Q) + (c.gS ?? 0) * perModule[k].S, 0);
        const Qlv = at.reduce((s, { k }) => s + c.gQ * (c.useQaB ? perModule[k].QaB : perModule[k].Q), 0);
        const Fh = c.withH ? opt.horizontalRatio * Qlv : 0;
        const Fi = opt.sway * V;
        M += (Fw + Fi) * (z0 + h / 2) + Fh * z0;
      }
      // bloc rigide, appuis de même raideur : ΔR = M · s / Σ s²
      const cx = gi.reduce((s, g) => s + groups[g].position[0], 0) / gi.length;
      const cy = gi.reduce((s, g) => s + groups[g].position[1], 0) / gi.length;
      const s = gi.map((g) => (groups[g].position[0] - cx) * d[0] + (groups[g].position[1] - cy) * d[1]);
      const s2 = s.reduce((a, b) => a + b * b, 0);
      if (s2 < 1) continue;
      gi.forEach((g, k) => (R[g] += (M * s[k]) / s2));
    }
    return R;
  };

  const extra = 1 + opt.extraFactor;
  // réaction de chaque groupe dans chaque combinaison (public limité : part du public par groupe, sans coefficient)
  const perGroup: ComboReaction[][] = groups.map(() => []);
  const totals: ComboReaction[] = [];
  const scan = (design: boolean) => {
    const max = groups.map(() => ({ v: -Infinity, c: '' }));
    const min = groups.map(() => Infinity);
    for (const c of combos(design)) {
      const R = evaluate(c);
      const cls = design ? 'ULS' : 'SLS';
      const qOf = (g: number) => (c.useQaB ? parts[g].QaB : parts[g].Q);
      R.forEach((v, g) => {
        if (v * extra > max[g].v) max[g] = { v: v * extra, c: c.name };
        min[g] = Math.min(min[g], v);
        perGroup[g].push({ combo: c.name, cls, R: v * extra, gQ: c.gQ * extra, Q: qOf(g) });
      });
      totals.push({ combo: c.name, cls, R: R.reduce((a, v) => a + v, 0) * extra, gQ: c.gQ * extra, Q: groups.reduce((a, _, g) => a + qOf(g), 0) });
    }
    return { max, min };
  };
  const ed = scan(true);
  const k = scan(false);
  let reactions: GroupReaction[] = groups.map((g, i) => ({
    group: g,
    Rk: k.max[i].v,
    RkMin: k.min[i],
    REd: ed.max[i].v,
    REdMin: ed.min[i],
    combo: ed.max[i].c,
    comboK: k.max[i].c,
    G: parts[i].G,
    Q: parts[i].Q,
    combos: perGroup[i],
  }));
  let outGroups = groups;
  if (opt.jacks) {
    // un vérin par Viewbox posée au sol dans chaque groupe, à parts égales, à la position de sa réception de pied
    const off = opt.footOffset ?? 155;
    const split: GroupReaction[] = [];
    reactions.forEach((r, g) => {
      const own = ground[g].filter((i) => pts[i].level === 0);
      const n = Math.max(1, own.length);
      for (const i of own) {
        const p = pts[i];
        const m = modules[p.module];
        split.push({
          ...r,
          group: { ...r.group, position: footPosition(m.corners, p.pos, p.middle, off), corners: p.middle ? 0 : 1, jack: true, moduleIds: [m.id] },
          Rk: r.Rk / n,
          RkMin: r.RkMin / n,
          REd: r.REd / n,
          REdMin: r.REdMin / n,
          G: r.G / n,
          Q: r.Q / n,
          combos: r.combos?.map((c) => ({ ...c, R: c.R / n, Q: c.Q / n })),
        });
      }
    });
    split.sort((a, b) => Math.round(a.group.position[1] / 500) - Math.round(b.group.position[1] / 500) || a.group.position[0] - b.group.position[0]);
    split.forEach((r, i) => (r.group.id = `${r.group.middle ? 'M' : 'P'}${i + 1}`));
    reactions = split;
    outGroups = split.map((r) => r.group);
  }
  if (reactions.some((r) => r.RkMin < 0)) warnings.push('Soulèvement possible d’un appui sous le vent hors service : lest ou ancrage à étudier (calcul complet).');
  const n0 = (x: number) => fmtNumber(x / 1e3, 1);
  const records: CalcRecord[] = [
    {
      key: 'estimate.vertical',
      title: 'Charges verticales (surfaces tributaires)',
      clause: 'estimation — chaque Viewbox descend ses charges à ses 4 angles',
      formula: L.weightMode === 'weighed' ? 'G = poids Viewbox pesé + divers ; Q = q · A' : 'G = max(poids Viewbox pesé, barres + (plafond + sol) · A) + divers ; Q = q · A',
      withValues: `ΣG = ${n0(totalG)} kN ; ΣQ = ${n0(totalQ)} kN (${modules.length} Viewbox)`,
      result: totalG + totalQ,
    },
    {
      key: 'estimate.overturning',
      title: 'Basculement sous les actions horizontales',
      clause: 'estimation — bloc rigide sur appuis de même raideur',
      formula: 'ΔR = M · s / Σ s² ; M = Σ (W + φ · V) · z + H · z',
      withValues: `vent en service ${fmtNumber(opt.windInService * 1e3, 2)} kN/m², hors service ${fmtNumber(opt.windOutOfService * 1e3, 2)} kN/m², cp ${fmtNumber(opt.cp, 1)} ; H = V/${fmtNumber(1 / opt.horizontalRatio, 0)} ; φ = 1/${fmtNumber(1 / opt.sway, 0)}`,
    },
  ];
  return { groups: outGroups, reactions, totalG, totalQ, verticalK: (totalG + Math.max(totalQ, totalS)) * extra, method: 'estimate', totals, publicCap: 1, units, warnings, records };
}

/**
 * Public limité à `load` (N, personnes × poids) : chaque groupe d'appuis garde sa réaction avec le public plein, moins la
 * part du public qui dépasse ce que le public limité peut lui apporter en se serrant au-dessus de lui (au plus
 * load × publicCap, et jamais plus que le public plein) ; les minima sont pris sans public ; la charge verticale totale
 * reprend load au lieu du public plein. Sans les réactions par combinaison : public plein conservé (prudent).
 */
export function limitPublic(est: Estimate, load: number): Estimate {
  if (!est.reactions.length || !est.reactions.every((r) => r.combos?.length))
    return { ...est, publicLimit: load, warnings: [...est.warnings, 'Public limité : réactions par combinaison indisponibles, public plein conservé (calcul complet à relancer).'] };
  const cap = load * (est.publicCap ?? 1);
  const occ = (c: ComboReaction, lim: number) => c.R - c.gQ * Math.max(0, c.Q - lim);
  const none = (c: ComboReaction) => c.R - c.gQ * c.Q;
  const best = (cs: ComboReaction[], f: (c: ComboReaction) => number): [number, string] => {
    let v = -Infinity;
    let name = '';
    for (const c of cs) {
      const x = f(c);
      if (x > v) [v, name] = [x, c.combo];
    }
    return [v, name];
  };
  const reactions = est.reactions.map((r): GroupReaction => {
    const cs = r.combos!;
    const uls = cs.filter((c) => c.cls === 'ULS');
    const sls = cs.filter((c) => c.cls === 'SLS');
    const [REd, combo] = best(uls, (c) => occ(c, cap));
    const REdMin = Math.min(...cs.filter((c) => c.cls !== 'SLS').map(none));
    const [Rk, comboK] = sls.length ? best(sls, (c) => occ(c, cap)) : [REd / 1.35, `${combo} / 1,35`];
    const RkMin = sls.length ? Math.min(...sls.map(none)) : REdMin / 1.35;
    return { ...r, Rk, RkMin, REd, REdMin, combo, comboK, Q: Math.min(r.Q, cap) };
  });
  let verticalK = est.verticalK;
  if (est.totals?.length) {
    const sls = est.totals.filter((t) => t.cls === 'SLS');
    verticalK = sls.length ? best(sls, (t) => occ(t, load))[0] : best(est.totals, (t) => occ(t, load))[0] / 1.35;
  }
  return { ...est, reactions, verticalK, totalQ: Math.min(est.totalQ, load), publicLimit: load };
}

/** Public plein (N) : la plus grande part de public d'une combinaison, tous appuis réunis. */
export function fullPublic(est: Estimate): number {
  const qs = (est.totals ?? []).filter((t) => t.gQ > 0).map((t) => t.Q);
  return qs.length ? Math.max(...qs) : est.totalQ;
}

/** Position d'un pied à vérin : angle décalé de `off` le long de ses deux côtés, pied central décalé vers l'intérieur. */
function footPosition(c: P2[], p: P2, middle: boolean, off: number): P2 {
  const unit = (a: P2, b: P2): P2 => {
    const d = dist(a, b) || 1;
    return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
  };
  if (middle) {
    const g: P2 = [c.reduce((s, q) => s + q[0], 0) / c.length, c.reduce((s, q) => s + q[1], 0) / c.length];
    const u = unit(p, g);
    return [p[0] + off * u[0], p[1] + off * u[1]];
  }
  const k = c.findIndex((q) => dist(q, p) < 1);
  if (k < 0) return p;
  const a = unit(c[k], c[(k + 1) % c.length]);
  const b = unit(c[k], c[(k + c.length - 1) % c.length]);
  return [p[0] + off * (a[0] + b[0]), p[1] + off * (a[1] + b[1])];
}

/** Installation en grille pour le calculateur sans modèle : nx Viewbox en longueur, ny en largeur, niveaux par case. */
export function gridModules(nx: number, ny: number, levels: number[][], roofAccessible: boolean, long = 5900, short = 2500, gap = 10): EstimateModule[] {
  const out: EstimateModule[] = [];
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const n = levels[j]?.[i] ?? 0;
      const x0 = i * (long + gap);
      const y0 = j * (short + gap);
      for (let lv = 0; lv < n; lv++)
        out.push({
          id: `VBX-${String(out.length + 1).padStart(2, '0')}`,
          level: lv,
          // angles = lignes de système des rives (5 mm du bord) : deux Viewbox voisines ont leurs angles à 20 mm
          corners: [
            [x0 + 5, y0 + 5],
            [x0 + long - 5, y0 + 5],
            [x0 + long - 5, y0 + short - 5],
            [x0 + 5, y0 + short - 5],
          ],
          area: long * short,
          height: 3080,
          roofAccessible: roofAccessible && lv === n - 1,
        });
    }
  return out;
}
