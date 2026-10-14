// Nouvelle version mise en ligne pendant que la page est ouverte : Railway reconstruit l'application, les fichiers
// chargés à la demande (PDF, DXF, rapport…) changent de nom et l'ancienne page ne les trouve plus (« Failed to fetch
// dynamically imported module »). On le détecte (import raté, ou version du serveur différente toutes les 5 min) et on
// propose de recharger la page au lieu d'afficher une erreur incompréhensible.

/** Erreur d'un fichier de l'application introuvable (version remplacée sur le serveur). */
export function isChunkError(e: unknown): boolean {
  const msg = String((e as Error)?.message ?? e);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Failed to load module script/i.test(msg);
}

/** Levée après la proposition de rechargement : l'appelant n'affiche pas d'autre message. */
export class NewVersionError extends Error {
  constructor() {
    super('Nouvelle version de Plans Viewbox en ligne : recharge la page (Ctrl + Maj + R) puis recommence.');
  }
}

const RELOAD_TEXT =
  'Une nouvelle version de Plans Viewbox a été mise en ligne depuis l’ouverture de cette page : il faut la recharger pour continuer.\n\n' +
  'Les plans et les études s’enregistrent automatiquement (attends 2 secondes après ta dernière modification).\n\nRecharger la page maintenant ?';

let asked = false;
export function offerReload(): void {
  if (asked) return;
  asked = true;
  // une seule question par page (Vite et l'import raté la déclenchent tous les deux) ; refusée : bandeau
  if (window.confirm(RELOAD_TEXT)) window.location.reload();
  else showBanner();
}

/** `import()` d'un module chargé à la demande : propose de recharger la page s'il n'existe plus sur le serveur. */
export async function freshImport<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (e) {
    if (isChunkError(e)) {
      offerReload();
      throw new NewVersionError();
    }
    throw e;
  }
}

function showBanner(): void {
  if (document.getElementById('vbx-new-version')) return;
  const bar = document.createElement('div');
  bar.id = 'vbx-new-version';
  bar.setAttribute('role', 'status');
  bar.style.cssText =
    'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:10000;background:#1e293b;color:#fff;border:1px solid #f59e0b;border-radius:8px;padding:10px 14px;font:14px system-ui,sans-serif;display:flex;gap:12px;align-items:center;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:calc(100vw - 32px)';
  const text = document.createElement('span');
  text.textContent = 'Nouvelle version de Plans Viewbox en ligne : recharge la page pour l’utiliser (exports PDF / DXF compris).';
  const btn = document.createElement('button');
  btn.textContent = '↻ Recharger';
  btn.style.cssText = 'background:#f59e0b;color:#111;border:0;border-radius:6px;padding:6px 10px;font-weight:600;cursor:pointer';
  btn.onclick = () => window.location.reload();
  bar.append(text, btn);
  document.body.append(bar);
}

/** Script d'entrée de cette page (« /plans/assets/index-XXXX.js ») ; rien en développement. */
function entryScript(html: Document | string): string | null {
  const src =
    typeof html === 'string'
      ? html.match(/<script[^>]+type="module"[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/)?.[1]
      : html.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src');
  return src ?? null;
}

/** Surveille les mises en ligne : import raté (Vite) et comparaison du script d'entrée avec celui du serveur. */
export function watchNewVersion(everyMs = 5 * 60_000): void {
  window.addEventListener('vite:preloadError', () => offerReload());
  const mine = entryScript(document);
  if (!mine) return;
  const check = async () => {
    if (document.hidden) return;
    try {
      const r = await fetch(window.location.pathname.replace(/[^/]*$/, ''), { cache: 'no-store' });
      if (!r.ok) return;
      const theirs = entryScript(await r.text());
      if (theirs && theirs !== mine) showBanner();
    } catch {
      /* hors ligne : on réessaiera */
    }
  };
  window.setInterval(check, everyMs);
  document.addEventListener('visibilitychange', () => void (!document.hidden && check()));
}
