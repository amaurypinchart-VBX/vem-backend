// Traits des fenêtres de vue des planches : calculés à la demande par le moteur 2D (pool de Workers, cache
// IndexedDB) et gardés en mémoire pendant l'édition. Une fenêtre dont le calcul d'origine ne correspond plus au
// modèle (modèle réanalysé, face avant changée…) est signalée « obsolète ».
import { useEffect, useReducer } from 'react';
import type { ViewportItem, Sheet, DrawingSet } from './types';
import { viewBasis } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import type { BrowserHlrProvider } from '../linework/provider';
import type { Linework2D } from '../linework/types';
import type { LegendEntry, ViewportData } from './SheetSvg';
import { moduleOverlays } from './overlays';
import { fitScale } from './scales';

interface Entry {
  lw?: Linework2D;
  busy?: boolean;
  error?: string;
}

export class LineworkBank {
  private readonly entries = new Map<string, Entry>();
  /** clé de calcul de chaque demande (JSON de la demande → clé) */
  private readonly keys = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly pendingKeys = new Set<string>();

  constructor(
    readonly scene: LoadedScene,
    readonly provider: BrowserHlrProvider,
  ) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /** la face avant d'une Viewbox a changé : les clés des vues relatives aux Viewbox sont à refaire */
  invalidateKeys(): void {
    this.keys.clear();
    this.emit();
  }

  keyOf(vp: ViewportItem): string | undefined {
    return this.keys.get(JSON.stringify(vp.request));
  }

  data(vp: ViewportItem): ViewportData {
    const key = this.keyOf(vp);
    const e = key ? this.entries.get(key) : undefined;
    let basis;
    try {
      basis = viewBasis(vp.request.view, this.scene.frames);
    } catch {
      basis = undefined;
    }
    const include = new Set(vp.request.subset.include);
    const overlays =
      basis && (vp.overlays?.moduleOutlines || vp.overlays?.moduleNumbers || vp.overlays?.statusColors)
        ? moduleOverlays(this.scene.frames.values(), new Set(this.scene.index.modules.filter((m) => include.has(m.nodeId)).map((m) => m.id)), basis)
        : undefined;
    return {
      lw: e?.lw,
      busy: !key || e?.busy,
      error: e?.error,
      basis,
      overlays,
      stale: !!(key && vp.lineworkKey && vp.lineworkKey !== key),
    };
  }

  /** Lance le calcul des vues qui manquent (sans attendre). */
  ensure(viewports: ViewportItem[]): void {
    for (const vp of viewports) void this.load(vp);
  }

  /** Traits d'une fenêtre de vue (calcul si besoin). */
  async load(vp: ViewportItem, signal?: AbortSignal): Promise<{ key: string; lw: Linework2D } | null> {
    const reqKey = JSON.stringify(vp.request);
    let key = this.keys.get(reqKey);
    if (!key) {
      key = await this.provider.cacheKey(vp.request);
      this.keys.set(reqKey, key);
    }
    const e = this.entries.get(key);
    if (e?.lw) return { key, lw: e.lw };
    if (this.pendingKeys.has(key)) {
      // déjà en cours : on attend la fin
      await new Promise<void>((resolve) => {
        const off = this.subscribe(() => {
          if (!this.pendingKeys.has(key!)) {
            off();
            resolve();
          }
        });
      });
      const done = this.entries.get(key);
      return done?.lw ? { key, lw: done.lw } : null;
    }
    this.pendingKeys.add(key);
    this.entries.set(key, { busy: true });
    this.emit();
    try {
      const lw = await this.provider.getLinework(vp.request, undefined, signal);
      this.entries.set(key, { lw });
      return { key, lw };
    } catch (err) {
      this.entries.set(key, { error: (err as Error).name === 'AbortError' ? 'annulé' : (err as Error).message });
      return null;
    } finally {
      this.pendingKeys.delete(key);
      this.emit();
    }
  }

  /** Légende d'une planche : catégories présentes dans ses vues qui ont une couleur de légende. */
  legendFor(sheet: Sheet, colors: Map<string, LegendEntry>): LegendEntry[] {
    const present = new Set<string>();
    for (const it of sheet.items) {
      if (it.type !== 'viewport') continue;
      const lw = this.data(it).lw;
      for (const l of lw?.layers ?? []) {
        if (l.key.startsWith('category:')) present.add(l.key.slice(9));
        for (const id of l.sourceNodeIds ?? []) {
          const c = this.scene.look.categoryOf(id);
          if (c) present.add(c);
        }
      }
    }
    return [...colors.values()].filter((e) => present.has(e.key));
  }
}

/** Re-rendu React quand des traits arrivent. */
export function useBank(bank: LineworkBank | null): number {
  const [n, bump] = useReducer((x: number) => x + 1, 0);
  useEffect(() => bank?.subscribe(bump), [bank]);
  return n;
}

/**
 * Après la génération : calcule toutes les vues du jeu, puis fixe l'échelle normalisée qui remplit chaque cadre
 * (même échelle pour les vues d'une même planche par Viewbox) et le centrage.
 */
export async function fitDrawingSet(
  set: DrawingSet,
  bank: LineworkBank,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const vps = set.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport'));
  let done = 0;
  onProgress(0, vps.length);
  const results = new Map<string, { key: string; lw: Linework2D } | null>();
  await Promise.all(
    vps.map(async (vp) => {
      results.set(vp.id, await bank.load(vp, signal));
      onProgress(++done, vps.length);
    }),
  );
  for (const sheet of set.sheets) {
    const own = sheet.items.filter((i): i is ViewportItem => i.type === 'viewport');
    const moduleSheet = own.length > 1 && own.every((v) => v.request.view.kind !== 'custom' && typeof v.request.view.frame === 'object');
    for (const vp of own) {
      const r = results.get(vp.id);
      if (!r) continue;
      vp.scale = fitScale(r.lw.boundsMm, vp.rect);
      const b = r.lw.boundsMm;
      vp.center = [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
      vp.lineworkKey = r.key;
    }
    // planche par Viewbox : une seule échelle pour toutes ses vues (la plus petite qui convient à toutes)
    if (moduleSheet) {
      const common = Math.max(...own.map((v) => v.scale || 0));
      for (const vp of own) if (vp.scale) vp.scale = common;
    }
  }
}
