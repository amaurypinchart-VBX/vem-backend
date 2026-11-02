// Calcul long en étapes (générateur) exécuté par tranches de quelques millisecondes, sur plusieurs tâches du navigateur :
// la page reste utilisable (clics, défilement) pendant le calcul, qui peut être abandonné entre deux tranches.

/** Tranche de calcul avant de rendre la main au navigateur (ms). */
export const SLICE_MS = 16;

/** Calcul abandonné (aperçu remplacé, outil fermé…). */
export class SlicedCancelled extends Error {
  constructor() {
    super('calcul abandonné');
  }
}

/** Rend la main au navigateur (après le traitement des événements en attente). */
export const nextTask = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Fait avancer `job` par tranches de `budgetMs` ; `cancelled()` est consulté entre deux tranches (abandon =
 * `SlicedCancelled`). Une étape du générateur n'est jamais coupée : elle doit rester courte.
 */
export async function runSliced<T>(job: Generator<void, T, void>, cancelled: () => boolean = () => false, budgetMs = SLICE_MS): Promise<T> {
  for (;;) {
    const t0 = performance.now();
    let r = job.next();
    while (!r.done && performance.now() - t0 < budgetMs) r = job.next();
    if (r.done) return r.value;
    await nextTask();
    if (cancelled()) {
      job.return(undefined as never);
      throw new SlicedCancelled();
    }
  }
}
