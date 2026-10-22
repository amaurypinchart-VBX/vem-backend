// Journal de la dernière étape (téléphone surtout) : iOS ferme un onglet qui dépasse sa mémoire sans aucun message,
// puis le recharge. On note l'étape en cours ; une fermeture normale l'efface (pagehide) ; au rechargement, une étape
// restée notée = la page s'est fermée pendant cette étape → bandeau, pour savoir où chercher.
const KEY = 'vem_plans_step';
/** au-delà, une étape notée n'est plus signalée (ancienne visite) */
const RECENT_MS = 30 * 60 * 1000;

export function markStep(label: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ label, at: Date.now() }));
  } catch {
    /* stockage indisponible (navigation privée) */
  }
}

export function clearStep(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* idem */
  }
}

/** Étape pendant laquelle la page s'est fermée la dernière fois (lue une seule fois), sinon null. */
export function takeLastCrash(now = Date.now()): { label: string; at: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { label?: unknown; at?: unknown };
    if (typeof v.label !== 'string' || typeof v.at !== 'number' || now - v.at > RECENT_MS) return null;
    return { label: v.label, at: v.at };
  } catch {
    return null;
  }
}

let installed = false;
/** Fermeture normale (autre page, onglet fermé, rechargement volontaire) : rien à signaler ensuite. */
export function installCrashLog(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pagehide', clearStep);
}
