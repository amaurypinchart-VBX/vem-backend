// Traits des fenêtres de vue des planches : calculés à la demande par le moteur 2D (pool de Workers, cache
// IndexedDB) et gardés en mémoire pendant l'édition. Une fenêtre dont le calcul d'origine ne correspond plus au
// modèle (modèle réanalysé, face avant changée…) est signalée « obsolète ».
import { useEffect, useReducer } from 'react';
import type { ViewportItem, DrawingSet } from './types';
import type { ViewBasis } from '../core/views';
import { viewBasis } from '../core/views';
import type { CustomViewSpec, ViewTagRule } from '../core/customViews/types';
import type { GlassTest } from '../linework/packets';
import type { CustomViewResult } from '../linework/customView';
import { computeSpecialView } from '../linework/customView';
import { hashKey } from '../linework/cache';
import type { LoadedScene } from '../scene/loadedScene';
import type { BrowserHlrProvider } from '../linework/provider';
import type { Linework2D } from '../linework/types';
import type { ViewportData } from './SheetSvg';
import { moduleOverlays } from './overlays';
import { fitScale } from './scales';
import { autoDimensionViewport } from './autoDim';
import { resolveMeshes } from '../core/subset';
import type { PaintColor } from '../core/paint/types';
import type { PaintedScene } from '../linework/paintScene';
import type { PaintRegion } from '../linework/paintOverlay';
import { computePaintOverlay } from '../linework/paintOverlay';

/** Peinture du projet résolue sur la scène (SheetsPage) : les vues dessinent la partie visible des faces peintes. */
export interface PaintSource {
  painted: PaintedScene;
  colors: Map<string, PaintColor>;
  /** change à chaque modification de la peinture */
  version: string;
  isGlass: GlassTest;
}

interface Entry {
  lw?: Linework2D;
  busy?: boolean;
  error?: string;
  /** vue spéciale : base du bloc (rotation / miroir / plafond réfléchi compris) */
  basis?: ViewBasis;
}

/** Vues spéciales d'un modèle, pour les fenêtres de vue `custom`. */
export interface CustomSource {
  spec: (viewId: string) => CustomViewSpec | undefined;
  glassTest: GlassTest;
  viewTags?: ViewTagRule[];
  categoryColors?: Record<string, string>;
}

/** Gris des fantômes (0 noir → 1 blanc). */
export function ghostColorOf(tone: number): string {
  const v = Math.min(255, Math.round(255 * Math.max(0, Math.min(1, tone)) * 0.85 + 20));
  const h = v.toString(16).padStart(2, '0');
  return `#${h}${h}${h}`;
}

/** Vue spéciale sans ce qui ne change pas le dessin (nom, dates). */
export const specForKey = (s: CustomViewSpec) => JSON.stringify({ ...s, name: '', createdAt: '', updatedAt: '', updatedBy: '', source: '', presetKey: '' });

export class LineworkBank {
  private readonly entries = new Map<string, Entry>();
  /** clé de calcul de chaque demande (JSON de la demande → clé) */
  private readonly keys = new Map<string, string>();
  private readonly listeners = new Set<() => void>();
  private readonly pendingKeys = new Set<string>();
  /** vues spéciales : calcul complet (tous les blocs) par vue, partagé par ses fenêtres */
  private readonly customRuns = new Map<string, Promise<CustomViewResult>>();
  custom: CustomSource | null = null;
  /** téléphone : traits gardés en mémoire au plus pour N vues (les plus anciennes sont relues du cache au besoin) */
  maxEntries = 0;
  private paintSrc: PaintSource | null = null;
  /** peinture visible par vue : clé = vue + calcul + version de la peinture */
  private readonly paintRegions = new Map<string, PaintRegion[]>();
  private paintQueue: ViewportItem[] = [];
  private paintTimer: ReturnType<typeof setTimeout> | null = null;

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

  /** Clé de la demande : la requête (vue standard) ou la vue spéciale + son bloc. */
  private reqKey(vp: ViewportItem): string {
    if (!vp.custom) return JSON.stringify(vp.request);
    const spec = this.custom?.spec(vp.custom.viewId);
    return `custom|${vp.custom.viewId}|${vp.custom.block}|${spec ? specForKey(spec) : 'absente'}`;
  }

  keyOf(vp: ViewportItem): string | undefined {
    return this.keys.get(this.reqKey(vp));
  }

  /** Traits gardés en mémoire : clé du calcul + ce qui est ajouté après (couleurs, repères façade). */
  private entryKey(key: string, vp: ViewportItem): string {
    return `${key}|${vp.request.style.colorByCategory ? 'c' : ''}${vp.request.style.facadeMarks ? 'f' : ''}`;
  }

  /** Nouvelle peinture : les vues la recalculent (seulement la peinture, jamais les traits). */
  setPaint(src: PaintSource | null): void {
    this.paintSrc = src;
    this.paintRegions.clear();
    this.emit();
  }

  private paintKey(vp: ViewportItem): string | null {
    const key = this.keyOf(vp);
    if (!this.paintSrc || !key || vp.custom || vp.paint === 'off') return null;
    return `${vp.id}|${key}|${this.paintSrc.version}|${JSON.stringify(vp.request.subset)}|${vp.request.style.glassTransparent ?? ''}`;
  }

  /** Peinture visible d'une vue (calcul immédiat ; null = rien à peindre / vue pas calculée). */
  paintOf(vp: ViewportItem): PaintRegion[] | null {
    const pk = this.paintKey(vp);
    if (!pk) return null;
    const hit = this.paintRegions.get(pk);
    if (hit) return hit;
    const basis = this.data(vp).basis;
    if (!basis || !this.paintSrc || !this.entries.get(this.entryKey(this.keyOf(vp)!, vp))?.lw) return null;
    const meshIds = resolveMeshes(this.scene.index, this.scene.look, vp.request.subset.include, vp.request.subset.hideCategories, vp.request.subset.onlyCategories);
    const regions = computePaintOverlay({
      scene: this.scene,
      painted: this.paintSrc.painted,
      meshIds,
      basis,
      isGlass: this.paintSrc.isGlass,
      glassTransparent: vp.request.style.glassTransparent !== false,
    });
    this.paintRegions.set(pk, regions);
    while (this.paintRegions.size > 400) this.paintRegions.delete(this.paintRegions.keys().next().value!);
    return regions;
  }

  /** Calcule la peinture des vues une par une, sans figer l'interface (une vue par tâche). */
  ensurePaint(vps: ViewportItem[]): void {
    if (!this.paintSrc) return;
    const missing = vps.filter((vp) => {
      const pk = this.paintKey(vp);
      return pk && !this.paintRegions.has(pk) && this.keyOf(vp) && this.entries.get(this.entryKey(this.keyOf(vp)!, vp))?.lw;
    });
    if (!missing.length) return;
    this.paintQueue = [...missing, ...this.paintQueue.filter((v) => !missing.some((m) => m.id === v.id))];
    if (this.paintTimer) return;
    const step = () => {
      this.paintTimer = null;
      const vp = this.paintQueue.shift();
      if (!vp) return;
      this.paintOf(vp);
      this.emit();
      if (this.paintQueue.length) this.paintTimer = setTimeout(step, 0);
    };
    this.paintTimer = setTimeout(step, 0);
  }

  data(vp: ViewportItem): ViewportData {
    const key = this.keyOf(vp);
    const e = key ? this.entries.get(this.entryKey(key, vp)) : undefined;
    let basis;
    try {
      basis = e?.basis ?? viewBasis(vp.request.view, this.scene.frames);
    } catch {
      basis = undefined;
    }
    const include = new Set(vp.request.subset.include);
    const overlays =
      basis && (vp.overlays?.moduleOutlines || vp.overlays?.moduleNumbers || vp.overlays?.statusColors || vp.overlays?.units?.length)
        ? moduleOverlays(this.scene.frames.values(), new Set(this.scene.index.modules.filter((m) => include.has(m.nodeId)).map((m) => m.id)), basis)
        : undefined;
    const spec = vp.custom ? this.custom?.spec(vp.custom.viewId) : undefined;
    const pk = this.paintSrc ? this.paintKey(vp) : null;
    const regions = pk ? this.paintRegions.get(pk) : undefined;
    return {
      ...(regions?.length && this.paintSrc ? { paint: { regions, colors: this.paintSrc.colors, mode: vp.paint === 'fill' ? ('fill' as const) : ('marks' as const) } } : {}),
      lw: e?.lw,
      busy: !key || e?.busy,
      error: e?.error ?? (vp.custom && this.custom && !spec ? DELETED_VIEW : undefined),
      basis,
      overlays,
      stale: !!(key && vp.lineworkKey && vp.lineworkKey !== key),
      cutLineMm: spec?.style.cutLine,
      ghostColor: spec ? ghostColorOf(spec.style.ghostTone) : undefined,
    };
  }

  /** Lance le calcul des vues qui manquent (sans attendre). */
  ensure(viewports: ViewportItem[]): void {
    for (const vp of viewports) void this.load(vp);
  }

  /** Traits d'une fenêtre de vue (calcul si besoin). */
  async load(vp: ViewportItem, signal?: AbortSignal): Promise<{ key: string; lw: Linework2D } | null> {
    const reqKey = this.reqKey(vp);
    let key = this.keys.get(reqKey);
    if (!key) {
      key = vp.custom ? `custom-${await hashKey(reqKey)}` : await this.provider.cacheKey(vp.request);
      this.keys.set(reqKey, key);
    }
    const ek = this.entryKey(key, vp);
    const e = this.entries.get(ek);
    if (e?.lw) return { key, lw: e.lw };
    if (this.pendingKeys.has(ek)) {
      // déjà en cours : on attend la fin
      await new Promise<void>((resolve) => {
        const off = this.subscribe(() => {
          if (!this.pendingKeys.has(ek)) {
            off();
            resolve();
          }
        });
      });
      const done = this.entries.get(ek);
      return done?.lw ? { key, lw: done.lw } : null;
    }
    this.pendingKeys.add(ek);
    this.entries.set(ek, { busy: true });
    this.emit();
    try {
      if (vp.custom) {
        const block = await this.customBlock(vp, signal);
        this.entries.set(ek, { lw: block.lw, basis: block.basis });
        return { key, lw: block.lw };
      }
      const lw = await this.provider.getLinework(vp.request, undefined, signal);
      this.entries.set(ek, { lw });
      this.trim();
      return { key, lw };
    } catch (err) {
      this.entries.set(ek, { error: (err as Error).name === 'AbortError' ? 'annulé' : (err as Error).message });
      return null;
    } finally {
      this.pendingKeys.delete(ek);
      this.emit();
    }
  }
  /** Garde au plus `maxEntries` vues calculées (les plus anciennes d'abord), jamais celles en cours. */
  private trim(): void {
    if (!this.maxEntries || this.entries.size <= this.maxEntries) return;
    for (const [k, e] of this.entries) {
      if (this.entries.size <= this.maxEntries) break;
      if (e.lw && !this.pendingKeys.has(k)) this.entries.delete(k);
    }
  }

  /** Bloc d'une vue spéciale (la vue entière est calculée une fois pour toutes ses fenêtres). */
  private async customBlock(vp: ViewportItem, signal?: AbortSignal): Promise<{ lw: Linework2D; basis: ViewBasis }> {
    const ref = vp.custom!;
    const src = this.custom;
    const spec = src?.spec(ref.viewId);
    if (!src || !spec) throw new Error(DELETED_VIEW);
    const runKey = `${ref.viewId}|${specForKey(spec)}|${JSON.stringify(vp.request.style)}`;
    let run = this.customRuns.get(runKey);
    if (!run) {
      run = computeSpecialView(spec, { scene: this.scene, runner: this.provider.runner, glassTest: src.glassTest, viewTags: src.viewTags, categoryColors: src.categoryColors }, vp.request.style, undefined, signal);
      this.customRuns.set(runKey, run);
      run.catch(() => this.customRuns.delete(runKey));
      while (this.customRuns.size > 12) this.customRuns.delete(this.customRuns.keys().next().value!);
    }
    const res = await run;
    const block = res.blocks.find((b) => b.key === ref.block) ?? (ref.block === 'all' ? { lw: res.lw, basis: res.blocks[0]?.basis } : undefined);
    if (!block?.basis) throw new Error(`Bloc « ${ref.block} » absent de la vue (disposition changée ?)`);
    return { lw: block.lw, basis: block.basis };
  }
}

/** Message d'une fenêtre dont la vue spéciale a été supprimée. */
export const DELETED_VIEW = 'Vue supprimée';

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

/**
 * Cotes automatiques des fenêtres de vue désignées (assistant) ; sur une planche par Viewbox, toutes les vues
 * gardent la même échelle (la plus petite qui laisse la place aux cotes dans chaque cadre).
 */
export function dimensionDrawingSet(set: DrawingSet, bank: LineworkBank, ids: string[]): number {
  const wanted = new Set(ids);
  let count = 0;
  for (const sheet of set.sheets) {
    const vps = sheet.items.filter((i): i is ViewportItem => i.type === 'viewport' && wanted.has(i.id));
    const ready = vps
      .map((vp) => ({ vp, data: bank.data(vp) }))
      .filter((x): x is { vp: ViewportItem; data: ViewportData & { lw: Linework2D; basis: NonNullable<ViewportData['basis']> } } => !!x.data.lw && !!x.data.basis);
    if (!ready.length) continue;
    const first = ready.map(({ vp, data }) => ({ vp, data, r: autoDimensionViewport(vp, data.lw, data.basis, bank.scene) }));
    const moduleSheet = ready.length > 1 && ready.every(({ vp }) => vp.request.view.kind !== 'custom' && typeof vp.request.view.frame === 'object');
    const common = moduleSheet ? Math.max(...first.map((x) => x.r.scale)) : 0;
    for (const { vp, data, r } of first) {
      const res = moduleSheet && r.scale !== common ? autoDimensionViewport(vp, data.lw, data.basis, bank.scene, common) : r;
      vp.scale = res.scale;
      vp.center = res.center;
      sheet.items.push(...res.dims);
      count += res.dims.length;
    }
  }
  return count;
}
