// Messages échangés avec le Worker de calcul (le même traitement sert en direct : résultats identiques).
import { analyzeLoadSet, prepare } from '../core/fem/analysis';
import type { AnalysisOptions, AnalysisResult, FemErrorCode, FemModel, LoadSet } from '../core/fem/types';
import { FemError } from '../core/fem/types';

export interface SolveRequest {
  type: 'solve';
  id: number;
  model: FemModel;
  sets: LoadSet[];
  options: AnalysisOptions;
}

export type SolveResponse =
  | { type: 'progress'; id: number; done: number; total: number }
  | { type: 'result'; id: number; results: AnalysisResult[] }
  | { type: 'error'; id: number; code: FemErrorCode | 'internal'; message: string; nodes: string[] };

/** Calcule une demande en envoyant la progression ; renvoie le message final. */
export function handleSolve(req: SolveRequest, post: (m: SolveResponse) => void): SolveResponse {
  try {
    const prep = prepare(req.model);
    const results: AnalysisResult[] = [];
    for (let k = 0; k < req.sets.length; k++) {
      results.push(analyzeLoadSet(prep, req.sets[k], req.options));
      post({ type: 'progress', id: req.id, done: k + 1, total: req.sets.length });
    }
    return { type: 'result', id: req.id, results };
  } catch (e) {
    if (e instanceof FemError) return { type: 'error', id: req.id, code: e.code, message: e.message, nodes: e.nodes };
    return { type: 'error', id: req.id, code: 'internal', message: (e as Error)?.message ?? String(e), nodes: [] };
  }
}

/** Erreur reconstruite côté page à partir du message du Worker. */
export function errorFromResponse(r: Extract<SolveResponse, { type: 'error' }>): Error {
  if (r.code === 'internal') return new Error(`Calcul de structure : ${r.message}`);
  return new FemError(r.code, r.message, r.nodes);
}
