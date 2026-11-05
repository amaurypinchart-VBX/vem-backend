// Instantanés des planches sur le serveur (voir sheets/consult.ts) : lecture en consultation sans le modèle 3D, écriture
// quand le modèle est chargé (une fenêtre de vue à la fois, en arrière-plan, sans garder les vues en mémoire).
import { getSharedLinework, hasSharedLinework, putSharedLinework } from '../../api/vem';
import { decodeLinework, decodePacked, encodeLinework, encodePacked, REMOTE_MAX_BYTES } from '../../linework/remoteCache';
import type { CustomViewSpec } from '../../core/customViews/types';
import type { ModuleFrame } from '../../core/views';
import type { LineworkBank } from '../../sheets/bank';
import type { ConsultInfo, LightSource } from '../../sheets/consult';
import { consultInfoKey, consultKey, customShareKey } from '../../sheets/consult';
import type { PdfJobViewport } from '../../sheets/pdf/serverJob';
import { snapshotView } from '../../sheets/pdf/serverJob';
import type { DrawingSet, ViewportItem } from '../../sheets/types';

/** Lecture des instantanés et de leurs traits sur le serveur. */
export function serverLightSource(env: string, specOf: (viewId: string) => CustomViewSpec | undefined): LightSource {
  return {
    key: (vp) => consultKey(vp, env, specOf),
    has: (key) => hasSharedLinework(key).catch(() => false),
    async snapshot(key) {
      try {
        const b = await getSharedLinework(key);
        return b ? decodePacked<PdfJobViewport>(b) : null;
      } catch {
        return null;
      }
    },
    async linework(key) {
      try {
        const b = await getSharedLinework(key);
        return b ? decodeLinework(b) : null;
      } catch {
        return null;
      }
    },
  };
}

/** Repères des Viewbox et surfaces peintes du jeu (null = jamais enregistrés avec le modèle 3D). */
export async function fetchConsultInfo(env: string): Promise<ConsultInfo | null> {
  try {
    const b = await getSharedLinework(await consultInfoKey(env));
    return b ? decodePacked<ConsultInfo>(b) : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Écrit les instantanés manquants d'un jeu, modèle 3D chargé : une fenêtre après l'autre (planche affichée d'abord),
 * vues relues du cache, peinture calculée par tranches, puis instantané + traits envoyés ; les vues des autres planches
 * quittent ensuite la mémoire. Une fenêtre déjà enregistrée (même clé) n'est pas refaite.
 */
export class ConsultWriter {
  private readonly done = new Set<string>();
  private infoDone = new Set<string>();
  private gen = 0;

  constructor(
    private readonly bank: LineworkBank,
    private readonly modelKey: string,
  ) {}

  stop(): void {
    this.gen++;
  }

  /** Repères des Viewbox + surfaces peintes (une fois par état du jeu). */
  async writeInfo(env: string, frames: Iterable<ModuleFrame>, areas: Map<string, number> | null): Promise<void> {
    if (this.infoDone.has(env)) return;
    this.infoDone.add(env);
    try {
      const key = await consultInfoKey(env);
      const info: ConsultInfo = { frames: [...frames], areas: [...(areas ?? [])] };
      await putSharedLinework(key, this.modelKey, encodePacked(info, 3));
    } catch {
      this.infoDone.delete(env);
    }
  }

  /**
   * Toutes les fenêtres du jeu ; `ready()` = la peinture est à jour dans la banque (sinon l'instantané serait faux).
   * Renvoie le nombre d'instantanés écrits.
   */
  async run(doc: DrawingSet, env: string, specOf: (viewId: string) => CustomViewSpec | undefined, ready: () => boolean, firstSheetId: string | null): Promise<number> {
    const gen = ++this.gen;
    const alive = () => gen === this.gen && ready();
    const sheets = [...doc.sheets].sort((a, b) => Number(b.id === firstSheetId) - Number(a.id === firstSheetId));
    const shown = new Set(doc.sheets.find((s) => s.id === firstSheetId)?.items.filter((i) => i.type === 'viewport').map((i) => i.id) ?? []);
    const keep = (sheets[0]?.items ?? []).filter((i): i is ViewportItem => i.type === 'viewport' && shown.has(i.id));
    let written = 0;
    for (const s of sheets)
      for (const it of s.items) {
        if (it.type !== 'viewport') continue;
        if (!alive()) return written;
        try {
          if (await this.write(it, env, specOf, alive)) written++;
        } catch (e) {
          console.warn('Instantané de la vue', it.label ?? it.id, e);
        }
        if (!shown.has(it.id)) this.bank.release([it], keep);
        await sleep(60);
      }
    return written;
  }

  /** true = instantané écrit maintenant (false = déjà là, ou vue pas prête). */
  private async write(vp: ViewportItem, env: string, specOf: (viewId: string) => CustomViewSpec | undefined, alive: () => boolean): Promise<boolean> {
    const key = await consultKey(vp, env, specOf);
    if (this.done.has(key)) return false;
    if (await hasSharedLinework(key)) {
      this.done.add(key);
      return false;
    }
    const r = await this.bank.load(vp);
    if (!r || !alive()) return false;
    await this.bank.preparePaint([vp], () => !alive());
    if (!alive() || !this.bank.paintReady(vp)) return false;
    const data = this.bank.data(vp);
    if (!data.lw || data.error || !data.basis) return false;
    // traits de la vue dans le cache partagé (vue spéciale : sous une clé du serveur)
    const lwKey = vp.custom ? await customShareKey(r.key) : await this.bank.serverKey(vp);
    if (!lwKey) return false;
    if (!(await hasSharedLinework(lwKey))) {
      const bytes = encodeLinework(data.lw, 3);
      if (bytes.length > REMOTE_MAX_BYTES) return false;
      await putSharedLinework(lwKey, this.modelKey, bytes);
    }
    const snap = encodePacked(snapshotView(data, lwKey), 3);
    if (snap.length > REMOTE_MAX_BYTES) return false;
    await putSharedLinework(key, this.modelKey, snap);
    this.done.add(key);
    return true;
  }
}
