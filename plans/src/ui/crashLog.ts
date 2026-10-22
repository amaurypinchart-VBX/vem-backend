// Journal de la dernière étape (téléphone surtout) : iOS ferme un onglet qui dépasse sa mémoire sans aucun message,
// puis le recharge. On note l'étape en cours ; une fermeture normale l'efface (pagehide) ; au rechargement, une étape
// restée notée = la page s'est fermée pendant cette étape → bandeau, pour savoir où chercher.
const KEY = 'vem_plans_step';
/** au-delà, une étape notée n'est plus signalée (ancienne visite) */
const RECENT_MS = 30 * 60 * 1000;

export function markStep(label: string): void {
  try {
    // même étape : garde sa précision en cours
    const raw = localStorage.getItem(KEY);
    const cur = raw ? (JSON.parse(raw) as { label?: string; detail?: string }) : null;
    localStorage.setItem(KEY, JSON.stringify({ label, at: Date.now(), ...(cur?.label === label && cur.detail ? { detail: cur.detail } : {}) }));
  } catch {
    /* stockage indisponible (navigation privée) */
  }
}

/**
 * Précision sur l'étape en cours (calcul d'une vue, repères…) ; null = finie. Sans étape notée, la précision devient
 * l'étape elle-même.
 */
export function markDetail(detail: string | null): void {
  try {
    const raw = localStorage.getItem(KEY);
    const cur = raw ? (JSON.parse(raw) as { label?: string; detail?: string }) : null;
    if (!cur?.label) {
      if (detail) localStorage.setItem(KEY, JSON.stringify({ label: detail, at: Date.now(), auto: true }));
      return;
    }
    if ((cur as { auto?: boolean }).auto && !detail) return localStorage.removeItem(KEY);
    localStorage.setItem(KEY, JSON.stringify({ ...cur, detail: detail ?? undefined, at: Date.now() }));
  } catch {
    /* idem */
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
    const v = JSON.parse(raw) as { label?: unknown; at?: unknown; detail?: unknown };
    if (typeof v.label !== 'string' || typeof v.at !== 'number' || now - v.at > RECENT_MS) return null;
    return { label: typeof v.detail === 'string' && v.detail ? `${v.label} — ${v.detail}` : v.label, at: v.at };
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
