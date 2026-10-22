// BrowserHlrProvider : implémentation « navigateur » du LineworkProvider (three-edge-projection dans des Workers),
// avec cache IndexedDB. L'éditeur de planches n'utilisera que l'interface LineworkProvider.
import { resolveMeshes } from '../core/subset';
import { viewBasis, viewKey } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import { cacheGet, cachePut, hashKey } from './cache';
import { categoryStrokeLayers, isTopView } from './categoryStrokes';
import { facadeMarkLayers } from './facadeMarks';
import type { HlrPacket } from './hlr';
import type { GlassTest } from './packets';
import { buildPacket } from './packets';
import type { RemoteLineworkCache } from './remoteCache';
import type { HlrRunner } from './runner';
import type { Linework2D, LineworkProvider, LineworkRequest } from './types';

/** Version du moteur 2D : la changer invalide le cache des vues. */
export const LINEWORK_ENGINE = 'p2-hlr-1';

export interface ProviderOptions {
  runner: HlrRunner;
  glassTest: GlassTest;
  /** couleurs de légende par catégorie (option « colorer par catégorie ») */
  categoryColors: () => Record<string, string>;
  /** désactive le cache IndexedDB (tests) */
  noCache?: boolean;
  /**
   * téléphone : vues calculées (paquet construit + calcul) au plus N à la fois — les autres attendent avant de
   * construire leur paquet ; sans limite = comme avant
   */
  maxConcurrent?: number;
  /** sous-ensembles gardés en mémoire (défaut 3) */
  maxPackets?: number;
  /** vues partagées par le serveur : lues avant de calculer, envoyées après un calcul */
  remote?: RemoteLineworkCache;
  /**
   * téléphone : au-delà de ce nombre de triangles, une vue absente des caches n'est pas calculée ici (la page
   * serait fermée par iOS) — erreur `HEAVY_VIEW` ; `allowHeavy` lève la limite
   */
  heavyTriangles?: number;
}

/** Message d'une vue trop lourde pour être calculée sur ce téléphone. */
export const HEAVY_VIEW = 'Vue trop lourde pour le téléphone : ouvre ce jeu une fois sur ordinateur (les vues y sont calculées puis partagées) ou « ⋯ › Calculer les vues lourdes ici »';

export class BrowserHlrProvider implements LineworkProvider {
  readonly id = 'browser-hlr' as const;
  private readonly packets = new Map<string, HlrPacket>();
  private active = 0;
  private readonly waiting: Array<() => void> = [];
  /** « calculer quand même » les vues lourdes sur ce téléphone */
  allowHeavy = false;

  constructor(
    private readonly scene: LoadedScene,
    private readonly opts: ProviderOptions,
  ) {}

  private subsetKey(req: LineworkRequest): string {
    return JSON.stringify([
      [...req.subset.include].sort(),
      [...(req.subset.hideCategories ?? [])].sort(),
      ...(req.subset.onlyCategories?.length ? [[...req.subset.onlyCategories].sort()] : []),
    ]);
  }

  async cacheKey(req: LineworkRequest): Promise<string> {
    return hashKey({
      engine: LINEWORK_ENGINE,
      model: this.scene.modelKey,
      subset: this.subsetKey(req),
      view: viewKey(req.view, this.scene.frames),
      // couleurs et repères sont ajoutés après le calcul : ils ne changent pas la clé des traits
      style: { ...req.style, colorByCategory: undefined, facadeMarks: undefined },
    });
  }

  private packetFor(req: LineworkRequest): { key: string; packet: HlrPacket; meshIds: string[] } {
    const key = this.subsetKey(req);
    const meshIds = resolveMeshes(this.scene.index, this.scene.look, req.subset.include, req.subset.hideCategories, req.subset.onlyCategories);
    let packet = this.packets.get(key);
    if (!packet) {
      packet = buildPacket(this.scene, meshIds, this.opts.glassTest);
      this.packets.set(key, packet);
      // garde les 3 derniers sous-ensembles (téléphone : moins)
      while (this.packets.size > (this.opts.maxPackets ?? 3)) this.packets.delete(this.packets.keys().next().value!);
    }
    return { key, packet, meshIds };
  }

  async getLinework(req: LineworkRequest, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Linework2D> {
    const basis = viewBasis(req.view, this.scene.frames);
    const cacheKey = await this.cacheKey(req);
    let lw = this.opts.noCache ? null : await cacheGet(cacheKey);
    if (lw) this.opts.remote?.share(cacheKey, lw);
    let meshIds: string[] | null = null;
    if (!lw && this.opts.remote && !this.opts.noCache) {
      lw = await this.opts.remote.get(cacheKey, signal).catch(() => null);
      if (lw) void cachePut(cacheKey, lw);
    }
    if (!lw) {
      await this.acquire(signal);
      try {
        // une autre fenêtre a pu calculer la même vue pendant l'attente
        lw = this.opts.maxConcurrent && !this.opts.noCache ? await cacheGet(cacheKey) : null;
        if (!lw) {
          if (this.opts.heavyTriangles && !this.allowHeavy) {
            const ids = resolveMeshes(this.scene.index, this.scene.look, req.subset.include, req.subset.hideCategories, req.subset.onlyCategories);
            if (this.triangles(ids) > this.opts.heavyTriangles) throw new Error(HEAVY_VIEW);
          }
          const p = this.packetFor(req);
          meshIds = p.meshIds;
          if (!p.packet.sourceIds.length) throw new Error('Rien à dessiner : le sous-ensemble est vide (tout est masqué ?)');
          lw = await this.opts.runner.run({ packetKey: p.key, packet: p.packet, job: { basis, style: req.style, cacheKey }, onProgress: (f) => onProgress?.(f) }, signal);
          if (!this.opts.noCache) {
            void cachePut(cacheKey, lw);
            this.opts.remote?.put(cacheKey, lw);
          }
        }
      } finally {
        this.release();
      }
    } else onProgress?.(1);
    if (req.style.colorByCategory && isTopView(basis)) {
      meshIds ??= resolveMeshes(this.scene.index, this.scene.look, req.subset.include, req.subset.hideCategories, req.subset.onlyCategories);
      const extra = categoryStrokeLayers(this.scene, meshIds, basis, this.opts.categoryColors());
      lw = { ...lw, layers: [...lw.layers.filter((l) => !l.key.startsWith('category:')), ...extra] };
    }
    if (req.style.facadeMarks) {
      meshIds ??= resolveMeshes(this.scene.index, this.scene.look, req.subset.include, req.subset.hideCategories, req.subset.onlyCategories);
      const marks = facadeMarkLayers(this.scene, meshIds, basis, lw, this.opts.glassTest, this.opts.categoryColors());
      lw = { ...lw, layers: [...lw.layers.filter((l) => !l.key.startsWith('mark:')), ...marks] };
    }
    return lw;
  }

  /** Nombre de triangles des maillages (index de scène, sans construire le paquet). */
  private triangles(meshIds: string[]): number {
    const ids = new Set(meshIds);
    let n = 0;
    for (const node of this.scene.index.nodes) if (ids.has(node.id)) n += node.triangles ?? 0;
    return n;
  }

  /** Attend une place de calcul (sans limite : immédiat). */
  private acquire(signal?: AbortSignal): Promise<void> {
    const max = this.opts.maxConcurrent;
    if (!max || this.active < max) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const go = () => {
        signal?.removeEventListener('abort', onAbort);
        this.active++;
        resolve();
      };
      const onAbort = () => {
        const i = this.waiting.indexOf(go);
        if (i >= 0) this.waiting.splice(i, 1);
        reject(new DOMException('Annulé', 'AbortError'));
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.waiting.push(go);
    });
  }

  private release(): void {
    this.active--;
    this.waiting.shift()?.();
  }

  /** Pool de calcul (vues spéciales : même pool de Workers que les vues existantes). */
  get runner(): HlrRunner {
    return this.opts.runner;
  }

  dispose(): void {
    this.packets.clear();
    this.opts.runner.dispose();
  }
}
