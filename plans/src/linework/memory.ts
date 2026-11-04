// Budget mémoire du module (très gros modèles : Xiaomi 1,6 M de triangles, l'onglet fermé par le navigateur dès qu'il
// dépasse sa mémoire, sans message). Chaque cache qui grossit avec la session s'inscrit ici avec une fonction qui le
// vide ; la surveillance (`startMemoryWatch`) les vide quand le tas JavaScript approche de sa limite, et le journal
// des fermetures note la mémoire au moment de chaque étape lourde.

type Releaser = (level: 'trim' | 'all') => void;
const releasers = new Map<string, Releaser>();

/** Inscrit un cache qui peut être vidé (`trim` = garder le strict utile, `all` = tout vider). */
export function registerReleaser(name: string, fn: Releaser): () => void {
  releasers.set(name, fn);
  return () => {
    if (releasers.get(name) === fn) releasers.delete(name);
  };
}

/** Vide les caches inscrits. */
export function relieveMemory(level: 'trim' | 'all' = 'trim'): void {
  for (const fn of releasers.values()) {
    try {
      fn(level);
    } catch {
      /* un cache qui échoue n'empêche pas les autres */
    }
  }
}

interface ChromeMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

/** Tas JavaScript utilisé / limite (Chrome, Edge ; null ailleurs). */
export function heapInfo(): { used: number; limit: number } | null {
  const m = (globalThis.performance as unknown as { memory?: ChromeMemory } | undefined)?.memory;
  if (!m || !m.jsHeapSizeLimit) return null;
  return { used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit };
}

/** « mémoire 1 840 Mo / 4 096 » pour le journal des fermetures (vide si le navigateur ne le dit pas). */
export function heapNote(): string {
  const h = heapInfo();
  if (!h) return '';
  const mo = (n: number) => Math.round(n / 1048576).toLocaleString('fr-BE');
  return `mémoire ${mo(h.used)} Mo / ${mo(h.limit)}`;
}

let watch: ReturnType<typeof setInterval> | null = null;
/**
 * Surveillance : au-delà de 55 % de la limite du tas, les caches gardent le strict utile ; au-delà de 70 %, tout est
 * vidé (les vues sont relues de l'IndexedDB ou du serveur à l'affichage). Sans `performance.memory`, rien.
 */
export function startMemoryWatch(everyMs = 2000): () => void {
  if (watch || !heapInfo()) return () => {};
  watch = setInterval(() => {
    const h = heapInfo();
    if (!h) return;
    const r = h.used / h.limit;
    if (r > 0.7) relieveMemory('all');
    else if (r > 0.55) relieveMemory('trim');
  }, everyMs);
  return () => {
    if (watch) clearInterval(watch);
    watch = null;
  };
}

/** Octets approximatifs des traits d'une vue (tableaux de coordonnées + objets). */
export function lineworkBytes(lw: { layers: Array<{ polylines: ArrayLike<number>[] }>; fills?: Array<{ rings: ArrayLike<number>[] }> }): number {
  let n = 0;
  for (const l of lw.layers) for (const p of l.polylines) n += p.length * 8 + 96;
  for (const f of lw.fills ?? []) for (const r of f.rings) n += r.length * 8 + 96;
  return n;
}
