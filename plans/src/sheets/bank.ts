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
import { HEAVY_VIEW, NotCachedError } from '../linework/provider';
import { lineworkBytes, registerReleaser } from '../linework/memory';
import type { Linework2D } from '../linework/types';
import type { ViewportData } from './SheetSvg';
import { moduleOverlays } from './overlays';
import { fitScale } from './scales';
import { autoDimensionViewport } from './autoDim';
import { subsetMeshes } from '../linework/subset';
import type { PaintColor } from '../core/paint/types';
import type { PaintedScene } from '../linework/paintScene';
import { changedPaintNodes } from '../linework/paintScene';
import type { PaintRegion } from '../linework/paintOverlay';
import { computePaintOverlay, paintOverlaySteps } from '../linework/paintOverlay';
import { runSliced, SlicedCancelled } from '../linework/sliced';
import type { LightSource } from './consult';
import { NOT_PREPARED } from './consult';
import type { PdfJobViewport } from './pdf/serverJob';
import { restoreView } from './pdf/serverJob';

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
  /** octets approximatifs des traits (budget mémoire) */
  bytes?: number;
  /** consultation sans 3D : instantané relu du serveur (base, contours, peinture…) */
  snap?: PdfJobViewport;
  /** dernier usage (affichage, export) : les vues les plus anciennes quittent la mémoire d'abord */
  used?: number;
}

/** une vue utilisée depuis moins longtemps n'est jamais retirée (planche affichée, page en cours d'export) */
const IN_USE_MS = 5000;

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
  /**
   * budget des traits en mémoire (octets, 0 = sans limite) : une vue de toute l'installation d'un très gros modèle pèse
   * des dizaines de Mo, compter les vues ne suffit pas. Les vues retirées sont relues de l'IndexedDB / du serveur.
   */
  maxBytes = 0;
  private bytes = 0;
  private paintSrc: PaintSource | null = null;
  /**
   * peinture visible par vue : clé = vue + calcul (sans la version de la peinture), avec la version pour laquelle elle a
   * été calculée. Une version plus ancienne reste affichée pendant le recalcul (les repères ne disparaissent plus à
   * chaque coup de pinceau) ; une vue dont aucune pièce n'a changé de peinture garde ses repères sans recalcul.
   */
  private readonly paintRegions = new Map<string, { version: string; regions: PaintRegion[]; meshes: Set<string>; bytes: number; used: number }>();
  /**
   * budget des repères de peinture gardés (octets, 0 = sans limite) : sur une façade très détaillée une vue peinte pèse
   * des dizaines de Mo de contours ; ils étaient gardés pour 400 vues (Xiaomi, « ça plante depuis la peinture »).
   */
  maxPaintBytes = 0;
  private paintBytes = 0;
  private paintQueue: ViewportItem[] = [];
  private paintRunning = false;
  /** peinture impossible à calculer sur une vue (message par fenêtre) */
  private readonly paintErrors = new Map<string, string>();

  /**
   * consultation sans le modèle 3D (scene.light) : les fenêtres sont relues de leurs instantanés sur le serveur, rien
   * n'est calculé ici (voir sheets/consult.ts)
   */
  light: LightSource | null = null;
  /** consultation : instantanés lus (légers), gardés même quand les traits quittent la mémoire */
  private readonly snaps = new Map<string, PdfJobViewport | null>();

  /** Instantané d'une fenêtre (consultation), lu une fois. */
  private async snapshotOf(key: string): Promise<PdfJobViewport | null> {
    if (this.snaps.has(key)) return this.snaps.get(key)!;
    const snap = this.light ? await this.light.snapshot(key) : null;
    this.snaps.set(key, snap);
    while (this.snaps.size > 600) this.snaps.delete(this.snaps.keys().next().value!);
    return snap;
  }

  constructor(
    readonly scene: LoadedScene,
    readonly provider: BrowserHlrProvider | null,
  ) {
    // mémoire pleine : on ne garde que les vues en cours d'usage (`trim`), ou plus rien de ce qui peut être relu (`all`)
    // référence faible : une banque abandonnée sans dispose() (aperçu du rapport) ne reste pas en mémoire
    const ref = new WeakRef(this);
    const name = `bank:${Math.random()}`;
    this.unregister = registerReleaser(name, (level) => {
      const b = ref.deref();
      if (b) b.relieve(level);
      else unregister();
    });
    const unregister = this.unregister;
  }
  private readonly unregister: () => void;

  /** La banque n'est plus utilisée (changement de modèle) : elle ne répond plus aux demandes de mémoire. */
  dispose(): void {
    this.unregister();
    this.entries.clear();
    this.bytes = 0;
    this.customRuns.clear();
    this.paintRegions.clear();
    this.paintBytes = 0;
  }

  /** Retire de la mémoire les traits des vues qui ne sont plus utiles maintenant (relus de l'IndexedDB au besoin). */
  private relieve(level: 'trim' | 'all'): void {
    const now = Date.now();
    for (const [k, e] of this.entries) {
      if (!e.lw || this.pendingKeys.has(k)) continue;
      if (level === 'trim' && now - (e.used ?? 0) < IN_USE_MS) continue;
      this.drop(k);
    }
    for (const [k, e] of this.paintRegions) if (level === 'all' || now - e.used >= IN_USE_MS) this.dropPaint(k);
    this.customRuns.clear();
    this.emit();
  }

  private drop(k: string): void {
    const e = this.entries.get(k);
    if (!e) return;
    this.bytes -= e.bytes ?? 0;
    this.entries.delete(k);
  }

  private put(k: string, e: Entry): void {
    this.drop(k);
    if (e.lw) {
      e.bytes = lineworkBytes(e.lw);
      this.bytes += e.bytes;
    }
    e.used = Date.now();
    this.entries.set(k, e);
  }

  /** Export PDF : les vues d'une page déjà écrite quittent la mémoire (sauf celles de la planche affichée). */
  release(viewports: ViewportItem[], keep: ViewportItem[] = []): void {
    const kept = new Set(keep.map((vp) => this.keyOf(vp) && this.entryKey(this.keyOf(vp)!, vp)));
    for (const vp of viewports) {
      const key = this.keyOf(vp);
      if (!key) continue;
      const ek = this.entryKey(key, vp);
      if (!kept.has(ek) && !this.pendingKeys.has(ek)) this.drop(ek);
    }
    // repères de peinture des vues écrites (pas ceux de la planche affichée)
    const keptPaint = new Set(keep.map((vp) => this.paintBase(vp)));
    for (const vp of viewports) {
      const base = this.paintBase(vp);
      if (base && !keptPaint.has(base)) this.dropPaint(base);
    }
  }

  private dropPaint(base: string): void {
    const e = this.paintRegions.get(base);
    if (!e) return;
    this.paintBytes -= e.bytes;
    this.paintRegions.delete(base);
  }

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
    if (this.scene.light) return JSON.stringify(['light', vp.request, vp.lineworkKey ?? null, vp.custom ?? null, vp.paint ?? null, vp.overlays ?? null, vp.frameView ?? null]);
    if (!vp.custom) return JSON.stringify(vp.request);
    const spec = this.custom?.spec(vp.custom.viewId);
    return `custom|${vp.custom.viewId}|${vp.custom.block}|${spec ? specForKey(spec) : 'absente'}`;
  }

  keyOf(vp: ViewportItem): string | undefined {
    return this.keys.get(this.reqKey(vp));
  }

  /**
   * Clé des traits dessinés d'une fenêtre dans le cache partagé du serveur (vue décorée comprise) ; vue spéciale = sa
   * clé locale (jamais sur le serveur : envoyée avec le PDF). undefined = vue impossible (base introuvable…).
   */
  async serverKey(vp: ViewportItem): Promise<string | undefined> {
    if (this.scene.light) {
      if (!this.light) return undefined;
      // instantané seulement : les traits sont déjà sur le serveur
      const snap = await this.snapshotOf(await this.keyFor(vp));
      this.emit();
      return snap?.key;
    }
    if (!this.provider) return undefined;
    try {
      const key = await this.keyFor(vp);
      return vp.custom ? key : await this.provider.displayKey(vp.request);
    } catch {
      return undefined;
    }
  }

  /** Clé de calcul d'une fenêtre (sans calculer ses traits). */
  async keyFor(vp: ViewportItem): Promise<string> {
    const reqKey = this.reqKey(vp);
    let key = this.keys.get(reqKey);
    if (!key) {
      if (this.light) key = await this.light.key(vp);
      else if (!this.provider) throw new Error('Modèle 3D non chargé');
      else key = vp.custom ? `custom-${await hashKey(reqKey)}` : await this.provider.cacheKey(vp.request);
      this.keys.set(reqKey, key);
    }
    return key;
  }

  /**
   * Fenêtres « obsolètes » du jeu : mises en page sur un calcul qui ne correspond plus au modèle (nouvel export
   * SketchUp, face avant changée, vue spéciale modifiée…). Seules les clés sont calculées, pas les traits.
   */
  async staleViewports(vps: ViewportItem[]): Promise<string[]> {
    const out: string[] = [];
    // consultation : l'état « obsolète » vient de l'instantané (calculé avec le modèle)
    if (this.scene.light) return out;
    for (const vp of vps) {
      if (!vp.lineworkKey) continue;
      if ((await this.keyFor(vp)) !== vp.lineworkKey) out.push(vp.id);
    }
    return out;
  }

  /** Traits gardés en mémoire : clé du calcul + ce qui est ajouté après (couleurs, repères façade). */
  private entryKey(key: string, vp: ViewportItem): string {
    return `${key}|${vp.request.style.colorByCategory ? 'c' : ''}${vp.request.style.facadeMarks ? 'f' : ''}`;
  }

  /**
   * Nouvelle peinture : seules les vues qui montrent une pièce dont la peinture a changé la recalculent (jamais les
   * traits) ; les autres gardent leurs repères (Xiaomi 04.11.2026 : tout effacer et tout recalculer à chaque action, deux
   * fois avec la réponse du serveur, laissait « Calcul des repères… » sans fin sur un gros modèle).
   */
  setPaint(src: PaintSource | null): void {
    const prev = this.paintSrc;
    this.paintSrc = src;
    this.paintErrors.clear();
    if (!src) {
      this.paintRegions.clear();
      this.paintBytes = 0;
    }
    else if (prev && prev.isGlass === src.isGlass) {
      const changed = changedPaintNodes(prev.painted, src.painted);
      for (const e of this.paintRegions.values()) {
        if (e.version !== prev.version) continue;
        let touched = false;
        for (const id of changed)
          if (e.meshes.has(id)) {
            touched = true;
            break;
          }
        if (!touched) e.version = src.version;
      }
    }
    this.emit();
  }

  /** clé de la peinture d'une vue, sans la version (null = pas de peinture sur cette vue) */
  private paintBase(vp: ViewportItem): string | null {
    const key = this.keyOf(vp);
    if (!this.paintSrc || !key || vp.custom || vp.paint === 'off' || vp.request.floorCut != null) return null;
    return `${vp.id}|${key}|${JSON.stringify(vp.request.subset)}|${vp.request.style.glassTransparent ?? ''}`;
  }

  /** repères à jour pour la peinture actuelle */
  private currentPaint(base: string): PaintRegion[] | null {
    const e = this.paintRegions.get(base);
    if (e) e.used = Date.now();
    return e && this.paintSrc && e.version === this.paintSrc.version ? e.regions : null;
  }

  /** Peinture visible d'une vue (calcul immédiat, d'un seul tenant — exports ; null = rien à peindre / vue pas calculée). */
  paintOf(vp: ViewportItem): PaintRegion[] | null {
    const base = this.paintBase(vp);
    if (!base) return null;
    const hit = this.currentPaint(base);
    if (hit) return hit;
    const basis = this.data(vp).basis;
    if (!basis || !this.paintSrc || !this.entries.get(this.entryKey(this.keyOf(vp)!, vp))?.lw) return null;
    const meshIds = subsetMeshes(this.scene, vp.request.subset);
    const regions = computePaintOverlay({
      scene: this.scene,
      painted: this.paintSrc.painted,
      meshIds,
      basis,
      isGlass: this.paintSrc.isGlass,
      glassTransparent: vp.request.style.glassTransparent !== false,
    });
    this.storePaint(base, this.paintSrc.version, regions, meshIds);
    return regions;
  }

  /**
   * Calcule la peinture des vues une par une, en arrière-plan par tranches de quelques ms (une grande façade peinte
   * peut demander plusieurs secondes : la page reste utilisable). Une nouvelle peinture abandonne le calcul en cours.
   */
  ensurePaint(vps: ViewportItem[]): void {
    if (!this.paintSrc) return;
    const missing = vps.filter((vp) => {
      const base = this.paintBase(vp);
      return base && !this.currentPaint(base) && this.keyOf(vp) && this.entries.get(this.entryKey(this.keyOf(vp)!, vp))?.lw;
    });
    if (!missing.length) return;
    this.paintQueue = [...missing, ...this.paintQueue.filter((v) => !missing.some((m) => m.id === v.id))];
    if (this.paintRunning) return;
    this.paintRunning = true;
    void (async () => {
      try {
        for (let vp = this.paintQueue.shift(); vp; vp = this.paintQueue.shift()) {
          const src = this.paintSrc;
          const base = this.paintBase(vp);
          if (!src || !base || this.currentPaint(base)) continue;
          const basis = this.data(vp).basis;
          if (!basis || !this.entries.get(this.entryKey(this.keyOf(vp)!, vp))?.lw) continue;
          const meshIds = subsetMeshes(this.scene, vp.request.subset);
          const job = paintOverlaySteps({ scene: this.scene, painted: src.painted, meshIds, basis, isGlass: src.isGlass, glassTransparent: vp.request.style.glassTransparent !== false });
          try {
            const regions = await runSliced(job, () => this.paintSrc !== src);
            this.storePaint(base, src.version, regions, meshIds);
            this.paintErrors.delete(vp.id);
            this.emit();
          } catch (e) {
            if (e instanceof SlicedCancelled) {
              // peinture changée pendant le calcul : la vue est reprise avec la nouvelle (si elle est encore demandée)
              if (this.paintSrc && !this.paintQueue.some((v) => v.id === vp!.id)) this.paintQueue.push(vp);
              continue;
            }
            // une vue qui échoue ne bloque pas les autres : elle est signalée dans le panneau Peinture
            console.error('Peinture de la vue', vp.label ?? vp.id, e);
            this.storePaint(base, src.version, [], meshIds);
            this.paintErrors.set(vp.id, (e as Error).message || String(e));
            this.emit();
          }
        }
      } finally {
        this.paintRunning = false;
      }
    })();
  }

  /**
   * Export : calcule la peinture des vues par tranches (sans figer la page) avant de dessiner leur planche ; paintOf
   * la retrouve ensuite toute prête. Avant, paintOf la calculait d'un seul bloc au milieu de l'export (vue de toute
   * l'installation peinte = plusieurs secondes figées et des centaines de Mo d'un coup sur un très gros modèle).
   */
  async preparePaint(vps: ViewportItem[], cancelled: () => boolean = () => false, opts: { withoutLinework?: boolean } = {}): Promise<void> {
    for (const vp of vps) {
      // PDF du serveur : la clé suffit (la peinture ne lit pas les traits, seulement la base de la vue et la scène)
      if (opts.withoutLinework) await this.keyFor(vp);
      const src = this.paintSrc;
      const base = this.paintBase(vp);
      if (!src || !base || this.currentPaint(base) || vp.paint === 'off') continue;
      const basis = this.data(vp).basis;
      if (!basis || (!opts.withoutLinework && !this.entries.get(this.entryKey(this.keyOf(vp)!, vp))?.lw)) continue;
      const meshIds = subsetMeshes(this.scene, vp.request.subset);
      const job = paintOverlaySteps({ scene: this.scene, painted: src.painted, meshIds, basis, isGlass: src.isGlass, glassTransparent: vp.request.style.glassTransparent !== false });
      try {
        this.storePaint(base, src.version, await runSliced(job, () => this.paintSrc !== src || cancelled()), meshIds);
      } catch (e) {
        if (e instanceof SlicedCancelled) {
          if (cancelled()) throw new Error('annulé');
          continue;
        }
        console.error('Peinture de la vue', vp.label ?? vp.id, e);
        this.storePaint(base, src.version, [], meshIds);
        this.paintErrors.set(vp.id, (e as Error).message || String(e));
      }
    }
  }

  /**
   * Consultation : fenêtres sans instantané sur le serveur (jeu jamais préparé, modèle réanalysé, peinture changée…),
   * vérifiées sans rien lire. -1 = source pas encore prête.
   */
  async unprepared(vps: ViewportItem[]): Promise<number> {
    if (!this.scene.light || !this.light) return -1;
    const keys = new Map<string, number>();
    for (const vp of vps) {
      const k = await this.keyFor(vp);
      keys.set(k, (keys.get(k) ?? 0) + 1);
    }
    let n = 0;
    for (const [k, count] of keys) if (!(this.snaps.get(k) ?? (await this.light.has(k)))) n += count;
    return n;
  }

  /** Peinture de la vue à jour (ou pas de peinture sur cette vue) : son instantané peut être écrit. */
  paintReady(vp: ViewportItem): boolean {
    const base = this.paintBase(vp);
    return !base || !!this.currentPaint(base);
  }

  /** Version de la peinture posée dans la banque (null = aucune). */
  paintVersion(): string | null {
    return this.paintSrc?.version ?? null;
  }

  /** Vues dont la peinture n'a pas pu être calculée : fenêtre → message. */
  paintFailures(): Map<string, string> {
    return this.paintErrors;
  }

  /** Vues dont la peinture est encore en calcul (en arrière-plan). */
  paintPending(): number {
    return this.paintQueue.length + (this.paintRunning ? 1 : 0);
  }

  private storePaint(base: string, version: string, regions: PaintRegion[], meshIds: string[]): void {
    this.dropPaint(base);
    let bytes = 200 + meshIds.length * 40;
    for (const r of regions) {
      bytes += 160;
      for (const l of r.loops) bytes += 80 + l.length * 8;
    }
    this.paintRegions.set(base, { version, regions, meshes: new Set(meshIds), bytes, used: Date.now() });
    this.paintBytes += bytes;
    // les plus anciennes d'abord, jamais une vue utilisée il y a moins de 5 s (planche affichée, page en cours)
    const over = () => this.paintRegions.size > 400 || (this.maxPaintBytes > 0 && this.paintBytes > this.maxPaintBytes);
    if (!over()) return;
    const now = Date.now();
    const old = [...this.paintRegions].filter(([k, e]) => k !== base && now - e.used >= IN_USE_MS).sort((a, b) => a[1].used - b[1].used);
    for (const [k] of old) {
      if (!over()) break;
      this.dropPaint(k);
    }
  }

  /** Mémoire des repères de peinture gardés (octets approximatifs, vues) — diagnostic. */
  paintMemoryUse(): { bytes: number; views: number } {
    return { bytes: this.paintBytes, views: this.paintRegions.size };
  }

  data(vp: ViewportItem): ViewportData {
    const key = this.keyOf(vp);
    const e = key ? this.entries.get(this.entryKey(key, vp)) : undefined;
    if (e?.lw) e.used = Date.now();
    if (this.scene.light) {
      if (e?.error) return { error: e.error };
      if (e?.lw) return restoreView(e.snap, e.lw);
      // traits pas (ou plus) en mémoire : base, contours, peinture de l'instantané déjà lu
      const snap = key ? this.snaps.get(key) : undefined;
      return snap ? { ...restoreView(snap, undefined), error: undefined, busy: true } : { busy: true };
    }
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
    // repères de la peinture actuelle, sinon ceux d'avant tant que le recalcul n'est pas fini (couleurs retirées exclues)
    const base = this.paintSrc ? this.paintBase(vp) : null;
    const src = this.paintSrc;
    const entry = base ? this.paintRegions.get(base) : undefined;
    if (entry) entry.used = Date.now();
    const stored = entry?.regions;
    const regions = stored && src ? stored.filter((r) => src.colors.has(r.colorId)) : undefined;
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

  /** Téléphone : calcule quand même les vues refusées comme trop lourdes (risque de fermeture par iOS). */
  retryHeavy(viewports: ViewportItem[]): void {
    if (!this.provider) return;
    this.provider.allowHeavy = true;
    for (const [k, e] of this.entries) if (e.error === HEAVY_VIEW) this.entries.delete(k);
    this.emit();
    this.ensure(viewports);
  }

  /** Lance le calcul des vues qui manquent (sans attendre). */
  ensure(viewports: ViewportItem[]): void {
    for (const vp of viewports) void this.load(vp);
  }

  /** Traits d'une fenêtre de vue (calcul si besoin). */
  async load(vp: ViewportItem, signal?: AbortSignal, opts: { cacheOnly?: boolean } = {}): Promise<{ key: string; lw: Linework2D } | null> {
    // consultation : rien tant que la source des instantanés n'est pas prête
    if (this.scene.light && !this.light) return null;
    // seulement les caches (génération sur téléphone) : les vues spéciales attendent l'affichage
    if (opts.cacheOnly && vp.custom) return null;
    const key = await this.keyFor(vp);
    const ek = this.entryKey(key, vp);
    const e = this.entries.get(ek);
    if (e?.lw) {
      e.used = Date.now();
      return { key, lw: e.lw };
    }
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
      if (this.light) {
        // consultation : instantané puis ses traits, du serveur
        const snap = await this.snapshotOf(key);
        if (!snap) {
          this.entries.set(ek, { error: NOT_PREPARED });
          return null;
        }
        const lw = snap.key ? await this.light.linework(snap.key) : null;
        if (!lw) {
          this.entries.set(ek, { error: snap.error ?? NOT_PREPARED });
          return null;
        }
        this.put(ek, { lw, snap });
        this.trim();
        return { key, lw };
      }
      if (!this.provider) throw new Error('Modèle 3D non chargé');
      if (vp.custom) {
        const block = await this.customBlock(vp, signal);
        this.put(ek, { lw: block.lw, basis: block.basis });
        this.trim();
        return { key, lw: block.lw };
      }
      const lw = await this.provider.getLinework(vp.request, undefined, signal, opts);
      // seulement les caches : traits peut-être sans leurs repères, pas gardés (refaits à l'affichage)
      if (opts.cacheOnly) {
        this.entries.delete(ek);
        return { key, lw };
      }
      this.put(ek, { lw });
      this.trim();
      return { key, lw };
    } catch (err) {
      // absente des caches : rien n'est retenu, la vue sera calculée à l'affichage
      if (err instanceof NotCachedError) this.entries.delete(ek);
      else this.entries.set(ek, { error: (err as Error).name === 'AbortError' ? 'annulé' : (err as Error).message });
      return null;
    } finally {
      this.pendingKeys.delete(ek);
      this.emit();
    }
  }
  /**
   * Garde au plus `maxEntries` vues et `maxBytes` octets de traits : les moins récemment utilisées partent d'abord,
   * jamais une vue en cours de calcul ni une vue utilisée il y a moins de 5 s (planche affichée, page exportée).
   */
  private trim(): void {
    const count = () => [...this.entries.values()].filter((e) => e.lw).length;
    const over = () => (this.maxEntries > 0 && count() > this.maxEntries) || (this.maxBytes > 0 && this.bytes > this.maxBytes);
    if (!over()) return;
    const now = Date.now();
    const old = [...this.entries].filter(([k, e]) => e.lw && !this.pendingKeys.has(k) && now - (e.used ?? 0) >= IN_USE_MS).sort((a, b) => (a[1].used ?? 0) - (b[1].used ?? 0));
    for (const [k] of old) {
      if (!over()) break;
      this.drop(k);
    }
  }

  /** Mémoire des traits gardés (octets approximatifs, vues gardées) — diagnostic. */
  memoryUse(): { bytes: number; views: number } {
    return { bytes: this.bytes, views: [...this.entries.values()].filter((e) => e.lw).length };
  }

  /** Bloc d'une vue spéciale (la vue entière est calculée une fois pour toutes ses fenêtres). */
  private async customBlock(vp: ViewportItem, signal?: AbortSignal): Promise<{ lw: Linework2D; basis: ViewBasis }> {
    const ref = vp.custom!;
    const src = this.custom;
    const spec = src?.spec(ref.viewId);
    if (!src || !spec) throw new Error(DELETED_VIEW);
    if (!this.provider) throw new Error('Modèle 3D non chargé');
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
  opts: { cacheOnly?: boolean; sequential?: boolean } = {},
): Promise<void> {
  const vps = set.sheets.flatMap((s) => s.items.filter((i): i is ViewportItem => i.type === 'viewport'));
  let done = 0;
  onProgress(0, vps.length);
  // seulement l'étendue de chaque vue (pas ses traits : un téléphone n'a pas la place de garder tout le jeu)
  const results = new Map<string, { key: string; lw: { boundsMm: Linework2D['boundsMm'] } } | null>();
  const one = async (vp: ViewportItem) => {
    const r = await bank.load(vp, signal, { cacheOnly: opts.cacheOnly });
    results.set(vp.id, r && { key: r.key, lw: { boundsMm: r.lw.boundsMm } });
    onProgress(++done, vps.length);
  };
  if (opts.sequential) for (const vp of vps) await one(vp);
  else await Promise.all(vps.map(one));
  for (const sheet of set.sheets) {
    const own = sheet.items.filter((i): i is ViewportItem => i.type === 'viewport');
    const moduleSheet = own.length > 1 && own.every((v) => !v.frameView && v.request.view.kind !== 'custom' && typeof v.request.view.frame === 'object');
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
    const moduleSheet = ready.length > 1 && ready.every(({ vp }) => !vp.frameView && vp.request.view.kind !== 'custom' && typeof vp.request.view.frame === 'object');
    const common = moduleSheet ? Math.max(...first.map((x) => x.r.scale)) : 0;
    for (const { vp, data, r } of first) {
      const res = moduleSheet && r.scale !== common ? autoDimensionViewport(vp, data.lw, data.basis, bank.scene, common) : r;
      vp.scale = res.scale;
      vp.center = res.center;
      sheet.items.push(...res.dims);
      if (res.labels) {
        sheet.items = sheet.items.filter((i) => !(i.type === 'label' && i.auto === 'layer' && i.viewportId === vp.id));
        sheet.items.push(...res.labels);
      }
      count += res.dims.length;
    }
  }
  return count;
}
