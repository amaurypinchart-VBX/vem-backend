// Charge d'exploitation maximale admissible : jusqu'où peut-on charger les planchers du rez-de-chaussée (et des étages)
// avec la même installation ? L'étude est faite pour la charge retenue (5,0 kN/m² au rez-de-chaussée…) ; on cherche ici
// la charge pour laquelle le plancher bois, la structure (calcul complet, mêmes combinaisons) ou le sol avec son calage
// arrivent à η = 1. Plancher : exact (formule) ; structure et sol : calculs complets successifs à des charges
// croissantes (fausse position), au plus quelques calculs. Résultat arrondi vers le bas à 10 kg/m².
import type { StudyInputs, StudyRun } from './studyRun';
import { plywoodStrip, runStudy } from './studyRun';
import type { StudyRunner } from './worker/study';

export type CapacityTarget = 'ground' | 'upper';
export type CapacityKey = 'floor' | 'structure' | 'ground';

/** Un calcul à la charge q (N/mm²) : taux de travail de chaque critère (absent : non évalué). */
export interface CapacityPoint {
  q: number;
  eta: Partial<Record<CapacityKey, number>>;
  /** vérification la plus chargée de la structure */
  label?: string;
}

export interface CapacityCriterion {
  key: CapacityKey;
  /** charge maximale (N/mm²) ; `above` : pas atteinte jusqu'à cette charge (recherche arrêtée) */
  q: number;
  above: boolean;
  /** interpolée entre deux calculs, pas recalculée à cette charge */
  approx: boolean;
  /** élément déterminant (structure) */
  governing?: string;
}

export interface CapacityLevel {
  target: CapacityTarget;
  /** charge de l'étude et charge maximale admissible (N/mm²), toutes vérifications */
  q0: number;
  qMax: number;
  /** aucune limite atteinte jusqu'à qMax */
  above: boolean;
  governing: CapacityKey;
  governingLabel?: string;
  criteria: CapacityCriterion[];
  /** calculs complets faits pour la recherche */
  runs: number;
}

export interface LiveCapacity {
  levels: CapacityLevel[];
  notes: string[];
}

/** 10 kg/m² en N/mm² : pas d'arrondi du résultat. */
export const CAPACITY_STEP = (10 * 9.81) / 1e6;
/** Charge la plus forte cherchée : 1 500 kg/m² (≈ 15 kN/m², au-delà d'une foule dense). */
export const CAPACITY_CAP = (1500 * 9.81) / 1e6;
const floorStep = (q: number) => Math.max(0, Math.floor(q / CAPACITY_STEP + 1e-6) * CAPACITY_STEP);

export interface LimitSearch {
  /** plus forte charge calculée qui passe (0 si aucune : supposée sans public) */
  lo: number;
  /** plus faible charge calculée qui ne passe pas (null : jamais dépassée jusqu'au plafond) */
  hi: number | null;
  points: Array<{ q: number; eta: number }>;
}

/**
 * Charge q pour laquelle η(q) = 1 (η croissant, presque linéaire) : premier essai à 1,5 × q0, puis fausse position
 * entre le dernier point qui passe et le premier qui ne passe pas (dichotomie si l'interpolation sort de l'intervalle),
 * extrapolation tant qu'aucun point ne dépasse. Arrêt dès que l'intervalle est plus petit que `tol`, qu'un point passe
 * à η ≥ 0,99, ou après `maxEvals` calculs. Fonction pure (le calcul est fourni).
 */
export async function searchLimit(evalAt: (q: number) => Promise<number>, q0: number, eta0: number, opt: { tol?: number; cap?: number; maxEvals?: number } = {}): Promise<LimitSearch> {
  const tol = opt.tol ?? CAPACITY_STEP;
  const cap = opt.cap ?? CAPACITY_CAP;
  const maxEvals = opt.maxEvals ?? 6;
  const points = [{ q: q0, eta: eta0 }];
  const ok = (e: number) => Number.isFinite(e) && e <= 1;
  const state = () => {
    const pass = points.filter((p) => ok(p.eta)).sort((a, b) => b.q - a.q)[0];
    const fail = points.filter((p) => !ok(p.eta)).sort((a, b) => a.q - b.q)[0];
    return { pass, fail };
  };
  for (let k = 0; k < maxEvals; k++) {
    const { pass, fail } = state();
    const lo = pass?.q ?? 0;
    if (fail && fail.q - lo <= tol) break;
    if (pass && pass.eta >= 0.99) break;
    let q: number;
    if (pass && fail) {
      q = Number.isFinite(fail.eta) && fail.eta > pass.eta ? pass.q + ((0.995 - pass.eta) * (fail.q - pass.q)) / (fail.eta - pass.eta) : (pass.q + fail.q) / 2;
      // la fausse position stagne d'un côté : on reste à l'intérieur de l'intervalle
      if (!(q > pass.q + tol / 2 && q < fail.q - tol / 2)) q = (pass.q + fail.q) / 2;
    } else if (pass) {
      if (pass.q >= cap - 1e-12) break;
      const below = points.filter((p) => ok(p.eta) && p.q < pass.q).sort((a, b) => b.q - a.q)[0];
      const slope = below ? (pass.eta - below.eta) / (pass.q - below.q) : NaN;
      q = slope > 1e-12 ? pass.q + (1 - pass.eta) / slope : pass.q * 1.5;
      q = Math.min(cap, Math.max(pass.q * 1.1, Math.min(q, pass.q * 2.5)));
    } else {
      // rien ne passe : vers le bas (jusqu'à 0)
      const f = fail!;
      const above = points.filter((p) => Number.isFinite(p.eta) && p.q > f.q).sort((a, b) => a.q - b.q)[0];
      const slope = above && Number.isFinite(f.eta) ? (above.eta - f.eta) / (above.q - f.q) : NaN;
      q = slope > 1e-12 ? f.q - (f.eta - 0.995) / slope : f.q * 0.6;
      q = Math.max(f.q * 0.3, Math.min(q, f.q * 0.9));
      if (f.q < tol) break;
    }
    points.push({ q, eta: await evalAt(q) });
  }
  const { pass, fail } = state();
  return { lo: pass?.q ?? 0, hi: fail?.q ?? null, points: points.sort((a, b) => a.q - b.q) };
}

/** Limite d'un critère d'après les points calculés : interpolée entre le dernier qui passe et le premier qui dépasse. */
export function criterionLimit(points: CapacityPoint[], key: CapacityKey): CapacityCriterion | null {
  const pts = points.filter((p) => p.eta[key] !== undefined).map((p) => ({ q: p.q, e: p.eta[key]!, label: p.label })).sort((a, b) => a.q - b.q);
  if (!pts.length) return null;
  const firstFail = pts.findIndex((p) => !(p.e <= 1));
  if (firstFail < 0) {
    // jamais dépassé : extrapolation des deux derniers points (au plus au double de la charge calculée)
    const last = pts[pts.length - 1];
    const prev = pts[pts.length - 2];
    const slope = prev ? (last.e - prev.e) / (last.q - prev.q) : NaN;
    const q = slope > 1e-12 ? last.q + (1 - last.e) / slope : Infinity;
    if (q > Math.min(CAPACITY_CAP, 2 * last.q)) return { key, q: floorStep(Math.min(last.q, CAPACITY_CAP)), above: true, approx: false };
    return { key, q: floorStep(q), above: false, approx: true };
  }
  const b = pts[firstFail];
  const a = pts[firstFail - 1];
  if (!a) {
    const next = pts[firstFail + 1];
    const slope = next && Number.isFinite(b.e) && Number.isFinite(next.e) ? (next.e - b.e) / (next.q - b.q) : NaN;
    const q = slope > 1e-12 ? b.q - (b.e - 1) / slope : 0;
    return { key, q: floorStep(Math.max(0, q)), above: false, approx: true, governing: b.label };
  }
  const q = Number.isFinite(b.e) && b.e > a.e ? a.q + ((1 - a.e) * (b.q - a.q)) / (b.e - a.e) : a.q;
  return { key, q: floorStep(Math.min(q, b.q)), above: false, approx: !(a.e >= 0.99), governing: b.label };
}

/** Charge maximale du plancher bois (exacte, dichotomie sur la formule). */
export function plywoodLimit(inp: Pick<StudyInputs, 'modules' | 'loads' | 'options'>, target: CapacityTarget): CapacityCriterion {
  const eta = (q: number) => plywoodStrip(inp, target, q).eta;
  if (eta(CAPACITY_CAP) <= 1) return { key: 'floor', q: CAPACITY_CAP, above: true, approx: false };
  let lo = 0;
  let hi = CAPACITY_CAP;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (eta(mid) <= 1) lo = mid;
    else hi = mid;
  }
  return { key: 'floor', q: floorStep(lo), above: false, approx: false };
}

/** Mêmes entrées avec la charge d'exploitation du rez-de-chaussée ou des étages changée. */
export function withLive(inp: StudyInputs, target: CapacityTarget, q: number): StudyInputs {
  return { ...inp, loads: { ...inp.loads, ...(target === 'ground' ? { liveGround: q } : { live: q }) } };
}

/** Taux de travail de la structure d'un calcul : pire vérification ELU et éléments terrasse ; ∞ si bloqué ou en erreur. */
export function structureEta(run: StudyRun): { eta: number; label?: string } {
  if (run.summary.errors.some((e) => e.cls === 'ULS') || run.summary.states.some((s) => s?.blocked)) return { eta: Infinity };
  let eta = -Infinity;
  let label: string | undefined;
  run.summary.states.forEach((s, t) => {
    if (s && s.eta > eta) [eta, label] = [s.eta, run.index.items[t].label];
  });
  if (run.terraces.records.length && run.terraces.eta > eta) [eta, label] = [run.terraces.eta, run.terraces.records.reduce((a, r) => ((r.eta ?? 0) > (a.eta ?? 0) ? r : a)).title];
  return { eta, label };
}

export interface CapacityOptions {
  /** taux de travail du sol avec le calage (plaques choisies, sinon standard) pour un calcul ; absent : sol non évalué */
  groundEta?: (run: StudyRun, inputs: StudyInputs) => number | null;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
  maxEvals?: number;
}

/**
 * Charge maximale admissible du rez-de-chaussée (les étages gardent leur charge) et, s'il y a des étages ouverts au
 * public, des étages (le rez-de-chaussée garde la sienne), à partir du calcul de l'étude `base`.
 */
export async function liveCapacity(inp: StudyInputs, base: StudyRun, runner: StudyRunner, opt: CapacityOptions = {}): Promise<LiveCapacity> {
  const notes: string[] = [];
  const baseS = structureEta(base);
  if (!Number.isFinite(baseS.eta)) return { levels: [], notes: ['Charge maximale non cherchée : le calcul de l’étude a des vérifications bloquées ou en erreur.'] };
  const closed = new Set(inp.loads.closedLevels ?? []);
  const targets: CapacityTarget[] = ['ground'];
  if (inp.modules.some((m) => m.level > 0 && !closed.has(m.level)) || (inp.loads.roofTerraces ?? []).length || (inp.stairs ?? []).length) targets.push('upper');
  const maxEvals = opt.maxEvals ?? 6;
  const total = targets.length * maxEvals;
  let done = 0;
  const levels: CapacityLevel[] = [];
  for (const target of targets) {
    const q0 = target === 'ground' ? inp.loads.liveGround ?? inp.loads.live : inp.loads.live;
    const points: CapacityPoint[] = [];
    const evaluate = (run: StudyRun, inputs: StudyInputs, q: number) => {
      const s = structureEta(run);
      const g = opt.groundEta?.(run, inputs) ?? undefined;
      const p: CapacityPoint = { q, eta: { structure: s.eta, ...(g !== undefined && g !== null ? { ground: g } : {}) }, label: s.label };
      points.push(p);
      return Math.max(s.eta, p.eta.ground ?? -Infinity);
    };
    const eta0 = evaluate(base, inp, q0);
    let runs = 0;
    const search = await searchLimit(
      async (q) => {
        if (opt.signal?.aborted) throw new DOMException('Annulé', 'AbortError');
        const inputs: StudyInputs = { ...withLive(inp, target, q), classes: opt.groundEta ? ['ULS', 'SLS'] : ['ULS'] };
        const run = await runStudy(inputs, runner, undefined, opt.signal);
        runs++;
        opt.onProgress?.(++done, total);
        return evaluate(run, inputs, q);
      },
      q0,
      eta0,
      { maxEvals },
    );
    done = levels.length * maxEvals + maxEvals;
    opt.onProgress?.(done, total);
    const floor = plywoodLimit(inp, target);
    const fem = (['structure', 'ground'] as const).map((key) => criterionLimit(points, key)).filter((c): c is CapacityCriterion => !!c);
    // limite commune structure + sol : la plus forte charge calculée qui passe ; critère déterminant = celui qui dépasse
    // le plus au premier calcul qui ne passe pas (sinon la plus faible limite interpolée)
    const femQ = floorStep(search.lo);
    const femAbove = search.hi === null;
    const failPoint = search.hi === null ? undefined : points.filter((p) => Math.abs(p.q - search.hi!) < 1e-12)[0];
    const femGov = failPoint
      ? fem.reduce((a, c) => ((failPoint.eta[c.key] ?? -Infinity) > (failPoint.eta[a.key] ?? -Infinity) ? c : a))
      : fem.reduce<CapacityCriterion | undefined>((a, c) => (!a || c.q < a.q ? c : a), undefined);
    for (const c of fem) {
      if (c === femGov) Object.assign(c, { q: femQ, approx: false, above: femAbove });
      else if (c.q < femQ) c.q = femQ;
    }
    const floorGoverns = !femGov || floor.q < femQ || (floor.q === femQ && !floor.above && femAbove);
    levels.push({
      target,
      q0,
      qMax: floorGoverns ? floor.q : femQ,
      above: floorGoverns ? floor.above && femAbove : femAbove,
      governing: floorGoverns ? 'floor' : femGov!.key,
      governingLabel: !floorGoverns && femGov?.key === 'structure' ? failPoint?.label ?? femGov.governing : undefined,
      criteria: [floor, ...fem],
      runs,
    });
  }
  const rails = inp.edgeItems.some((i) => i.nature === 'railing');
  if (rails && levels.some((l) => l.qMax > 3.5e-3 + 1e-9)) notes.push('Garde-corps : au-delà de 357 kg/m² (3,5 kN/m²) sur une surface bordée de garde-corps, main courante à 1,0 kN/m à justifier (statico 18-0573 § 3.7).');
  return { levels, notes };
}
