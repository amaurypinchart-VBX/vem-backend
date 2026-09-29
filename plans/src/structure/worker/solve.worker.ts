// Worker de calcul de structure : un modèle + une série de cas de charge (combinaisons) par demande.
import type { SolveRequest, SolveResponse } from './protocol';
import { handleSolve } from './protocol';

const post = (m: SolveResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<SolveRequest>) => {
  if (e.data?.type !== 'solve') return;
  post(handleSolve(e.data, post));
};
