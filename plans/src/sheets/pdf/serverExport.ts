// PDF du jeu de plans fait par le serveur VEM (voir serverJob.ts) — côté navigateur : prépare chaque fenêtre de vue
// l'une après l'autre (peinture visible, contours ; traits envoyés seulement si le serveur ne les a pas), puis suit
// l'avancement du rendu. La mémoire de l'onglet ne grossit plus avec le jeu : une vue à la fois, rien n'est converti ici.
import { ApiError, putPdfJobPart, vem } from '../../api/vem';
import { encodeLinework, encodePacked } from '../../linework/remoteCache';
import type { LineworkBank } from '../bank';
import type { ViewportItem } from '../types';
import type { PdfJobManifest, PdfJobOptions, PdfJobStatus } from './serverJob';
import { snapshotView } from './serverJob';

let available: Promise<boolean> | null = null;

/** Le serveur sait-il faire le PDF ? (rendu compilé présent ; une seule question par session) */
export function serverPdfAvailable(): Promise<boolean> {
  available ??= vem
    .pdfJobAvailable()
    .then((r) => !!r.available)
    .catch(() => false);
  return available;
}

export class CancelledError extends Error {
  constructor() {
    super('annulé');
  }
}

export interface PrepareInput {
  projectId: string;
  manifest: PdfJobManifest;
  bank: LineworkBank;
  /** fenêtres de la planche affichée : gardées en mémoire */
  keep: ViewportItem[];
  onStep: (text: string) => void;
  cancelled: () => boolean;
  /** journal des plantages (« préparation de la vue n/N ») */
  note?: (detail: string) => void;
}

/** Crée la tâche sur le serveur et lui envoie ce qu'il faut pour chaque fenêtre de vue → id de la tâche. */
export async function prepareServerPdf(inp: PrepareInput): Promise<string> {
  const { bank } = inp;
  const seen = new Set<string>();
  const vps: ViewportItem[] = [];
  for (const s of inp.manifest.sheets)
    for (const i of s.items)
      if (i.type === 'viewport' && !seen.has(i.id)) {
        seen.add(i.id);
        vps.push(i);
      }
  const { id } = await vem.pdfJobCreate(inp.projectId, inp.manifest);
  try {
    const check = () => {
      if (inp.cancelled()) throw new CancelledError();
    };
    inp.onStep('PDF (serveur) : vues déjà sur le serveur…');
    const keys = new Map<string, string | undefined>();
    for (const vp of vps) {
      check();
      keys.set(vp.id, await bank.serverKey(vp));
    }
    const unique = [...new Set([...keys.values()].filter((k): k is string => !!k))];
    const missing = new Set(unique.length ? (await vem.pdfJobMissing(id, unique)).missing : []);
    for (const [n, vp] of vps.entries()) {
      check();
      const label = `${n + 1}/${vps.length}`;
      inp.onStep(`PDF (serveur) : préparation des vues (${label})…`);
      inp.note?.(`préparation de la vue ${label} (${vp.label ?? vp.id})`);
      let key = keys.get(vp.id);
      // vue absente du serveur (calculée ici, trop lourde pour le partage, vue spéciale) : envoyée avec la tâche ;
      // une vue spéciale est toujours lue ici (sa base de dessin vient de son calcul)
      if (key && (missing.has(key) || vp.custom)) {
        const r = await bank.load(vp);
        check();
        if (r && missing.has(key)) {
          await putPdfJobPart(id, 'linework', key, encodeLinework(r.lw, 3));
          missing.delete(key);
        }
      }
      if (key && missing.has(key)) key = undefined;
      await bank.preparePaint([vp], inp.cancelled, { withoutLinework: true }).catch((e) => {
        if (inp.cancelled()) throw new CancelledError();
        throw e;
      });
      await putPdfJobPart(id, 'views', vp.id, encodePacked(snapshotView(bank.data(vp), key), 3));
      bank.release([vp], inp.keep);
    }
    return id;
  } catch (e) {
    void vem.pdfJobDelete(id).catch(() => undefined);
    throw e;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Lance le rendu et attend la fin (avancement toutes les secondes). */
export async function runServerPdf(id: string, options: PdfJobOptions, onStatus: (s: PdfJobStatus) => void, cancelled: () => boolean): Promise<PdfJobStatus> {
  let st = await vem.pdfJobStart(id, options);
  let failures = 0;
  for (;;) {
    if (cancelled()) throw new CancelledError();
    if (st.status === 'done') return st;
    if (st.status === 'error') throw new Error(st.message || 'Erreur du serveur');
    onStatus(st);
    await sleep(1000);
    try {
      st = await vem.pdfJobStatus(id);
      failures = 0;
    } catch (e) {
      // coupure réseau passagère : on réessaie ; tâche perdue (serveur redémarré) : erreur
      if ((e instanceof ApiError && e.status === 404) || ++failures > 20) throw e;
    }
  }
}

/** Texte d'avancement d'une tâche. */
export function serverStatusText(s: PdfJobStatus): string {
  if (s.status === 'queued') return s.detail ? `PDF (serveur) : ${s.detail}…` : `PDF (serveur) : en attente${s.position ? ` (${s.position} PDF avant)` : ''}…`;
  if (s.status === 'running') return s.pages ? `PDF (serveur) : planche ${Math.min((s.page ?? 0) + 1, s.pages)}/${s.pages}…` : 'PDF (serveur) : démarrage…';
  return 'PDF (serveur)…';
}
