// BrowserHlrProvider : implémentation « navigateur » du LineworkProvider (three-edge-projection dans des Workers),
// avec cache IndexedDB. L'éditeur de planches n'utilisera que l'interface LineworkProvider.
import { resolveMeshes } from '../core/subset';
import { viewBasis, viewKey } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import { cacheGet, cachePut, hashKey } from './cache';
import { categoryStrokeLayers, isTopView } from './categoryStrokes';
import type { HlrPacket } from './hlr';
import type { GlassTest } from './packets';
import { buildPacket } from './packets';
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
}

export class BrowserHlrProvider implements LineworkProvider {
  readonly id = 'browser-hlr' as const;
  private readonly packets = new Map<string, HlrPacket>();

  constructor(
    private readonly scene: LoadedScene,
    private readonly opts: ProviderOptions,
  ) {}

  private subsetKey(req: LineworkRequest): string {
    return JSON.stringify([[...req.subset.include].sort(), [...(req.subset.hideCategories ?? [])].sort()]);
  }

  async cacheKey(req: LineworkRequest): Promise<string> {
    return hashKey({
      engine: LINEWORK_ENGINE,
      model: this.scene.modelKey,
      subset: this.subsetKey(req),
      view: viewKey(req.view, this.scene.frames),
      style: { ...req.style, colorByCategory: undefined },
    });
  }

  private packetFor(req: LineworkRequest): { key: string; packet: HlrPacket; meshIds: string[] } {
    const key = this.subsetKey(req);
    const meshIds = resolveMeshes(this.scene.index, this.scene.look, req.subset.include, req.subset.hideCategories);
    let packet = this.packets.get(key);
    if (!packet) {
      packet = buildPacket(this.scene, meshIds, this.opts.glassTest);
      this.packets.set(key, packet);
      // garde les 3 derniers sous-ensembles
      while (this.packets.size > 3) this.packets.delete(this.packets.keys().next().value!);
    }
    return { key, packet, meshIds };
  }

  async getLinework(req: LineworkRequest, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Linework2D> {
    const basis = viewBasis(req.view, this.scene.frames);
    const cacheKey = await this.cacheKey(req);
    let lw = this.opts.noCache ? null : await cacheGet(cacheKey);
    let meshIds: string[] | null = null;
    if (!lw) {
      const p = this.packetFor(req);
      meshIds = p.meshIds;
      if (!p.packet.sourceIds.length) throw new Error('Rien à dessiner : le sous-ensemble est vide (tout est masqué ?)');
      lw = await this.opts.runner.run({ packetKey: p.key, packet: p.packet, job: { basis, style: req.style, cacheKey }, onProgress: (f) => onProgress?.(f) }, signal);
      if (!this.opts.noCache) void cachePut(cacheKey, lw);
    } else onProgress?.(1);
    if (req.style.colorByCategory && isTopView(basis)) {
      meshIds ??= resolveMeshes(this.scene.index, this.scene.look, req.subset.include, req.subset.hideCategories);
      const extra = categoryStrokeLayers(this.scene, meshIds, basis, this.opts.categoryColors());
      lw = { ...lw, layers: [...lw.layers.filter((l) => !l.key.startsWith('category:')), ...extra] };
    }
    return lw;
  }

  dispose(): void {
    this.packets.clear();
    this.opts.runner.dispose();
  }
}
