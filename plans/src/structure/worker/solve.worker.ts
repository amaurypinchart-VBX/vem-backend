// Worker de calcul de structure : un modèle + une série de cas de charge (combinaisons) par demande ('solve'), ou un
// paquet de combinaisons d'une étude avec les vérifications ('study', résumé seulement).
import type { SolveRequest, SolveResponse } from './protocol';
import { handleSolve } from './protocol';
import type { StudyRequest, StudyResponse } from './study';
import { handleStudy } from './study';

const post = (m: SolveResponse | StudyResponse) => (self as unknown as Worker).postMessage(m);

self.onmessage = (e: MessageEvent<SolveRequest | StudyRequest>) => {
  if (e.data?.type === 'solve') post(handleSolve(e.data, post));
  else if (e.data?.type === 'study') post(handleStudy(e.data, post));
};
