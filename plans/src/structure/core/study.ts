// Préparation du calcul d'une étude : une géométrie par défaut d'aplomb (3 variantes au plus), les combinaisons de
// chaque variante en cas du solveur, puis le regroupement des résultats et des réactions (enveloppes par appui).
// Fonctions pures : le calcul lui-même passe par le SolveRunner (Workers ou direct).
import type { StructuralModel } from './assemble';
import { withSway } from './assemble';
import type { Combination } from './combos';
import { swayKey, swayVector } from './combos';
import type { AnalysisResult, FemModel, LoadSet, Vec3 } from './fem/types';
import type { LoadCase, LoadModel } from './loads';
import { combineCases } from './loads';

export interface StudyJob {
  sway: string;
  model: FemModel;
  sets: LoadSet[];
  combos: Combination[];
}

/** Cas du solveur par variante de défaut d'aplomb φ (géométrie décalée de φ · hauteur). */
export function prepareJobs(structure: StructuralModel, loads: LoadModel, combos: Combination[], phi: number): StudyJob[] {
  const cases = new Map<string, LoadCase>(loads.cases.map((c) => [c.id, c]));
  const byKey = new Map<string, Combination[]>();
  for (const c of combos) {
    const k = swayKey(c.sway);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(c);
  }
  return [...byKey].map(([key, cs]) => ({
    sway: key,
    model: phi ? withSway(structure.fem, phi, swayVector(loads.axes, cs[0].sway), structure.baseY) : structure.fem,
    sets: cs.map((c) => combineCases(c.id, cases, c.factors)),
    combos: cs,
  }));
}

/** Résultante verticale (N, vers le bas positive) des charges d'une combinaison. */
export function comboVertical(loads: LoadModel, c: Combination): number {
  const byId = new Map(loads.cases.map((x) => [x.id, x]));
  return c.factors.reduce((s, [id, f]) => s - f * (byId.get(id)?.resultant[1] ?? 0), 0);
}

export function comboResultant(loads: LoadModel, c: Combination): Vec3 {
  const byId = new Map(loads.cases.map((x) => [x.id, x]));
  const R: Vec3 = [0, 0, 0];
  for (const [id, f] of c.factors) {
    const r = byId.get(id)?.resultant;
    if (r) for (let d = 0; d < 3; d++) R[d] += f * r[d];
  }
  return R;
}

export interface ComboResult {
  combo: Combination;
  result: AnalysisResult;
}

/** Remet les résultats des variantes dans l'ordre des combinaisons. */
export function collectResults(jobs: StudyJob[], results: AnalysisResult[][], order: Combination[]): ComboResult[] {
  const map = new Map<string, ComboResult>();
  jobs.forEach((j, k) => j.combos.forEach((c, t) => map.set(c.id, { combo: c, result: results[k][t] })));
  return order.map((c) => map.get(c.id)!).filter(Boolean);
}

export interface SupportEnvelope {
  support: number;
  module: string;
  corner: number;
  kind: 'corner' | 'foot' | 'middle' | 'stair';
  /** réaction verticale maxi / mini (N, vers le haut positive) et combinaison */
  max: number;
  maxCombo: string;
  min: number;
  minCombo: string;
  /** effort horizontal maxi (N) et combinaison */
  hMax: number;
  hCombo: string;
  lifted: string[];
}

/** Enveloppe des réactions par appui sur une classe de combinaisons. */
export function supportEnvelopes(structure: StructuralModel, results: ComboResult[], cls: Combination['cls'][]): SupportEnvelope[] {
  const sel = results.filter((r) => cls.includes(r.combo.cls));
  return structure.fem.supports.map((_, k) => {
    const meta = structure.supportMeta[k];
    const env: SupportEnvelope = { support: k, module: meta.module, corner: meta.corner, kind: meta.kind, max: -Infinity, maxCombo: '', min: Infinity, minCombo: '', hMax: 0, hCombo: '', lifted: [] };
    for (const { combo, result } of sel) {
      const R = result.reactions[k];
      if (R.lifted) env.lifted.push(combo.id);
      if (R.R[1] > env.max) [env.max, env.maxCombo] = [R.R[1], combo.id];
      if (R.R[1] < env.min) [env.min, env.minCombo] = [R.R[1], combo.id];
      const h = Math.hypot(R.R[0], R.R[2]);
      if (h > env.hMax) [env.hMax, env.hCombo] = [h, combo.id];
    }
    return env;
  });
}
