// Vue spéciale complète (fil principal) : règles de visibilité, coupes par nœud, caméra, disposition (ensemble /
// séparées / chaque Viewbox / ensemble + séparées), un calcul par bloc dans le pool de Workers (cache IndexedDB),
// Viewbox identiques calculées une seule fois (traits translatés), transformation 2D (dessous réfléchi, miroir,
// rotation) appliquée après calcul, assemblage en un seul dessin.
// Les vues existantes ne passent jamais par ici : leurs clés de cache et leurs traits sont inchangés.
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import type { ModuleFrame, Vec3, ViewBasis } from '../core/views';
import { dot, projectPoint, viewBasis, viewKey } from '../core/views';
import type { CustomViewSpec, CustomViewWarning, ViewTagRule } from '../core/customViews/types';
import { makePathIndex } from '../core/customViews/paths';
import { makeTagResolver } from '../core/customViews/tags';
import type { NodeState, VisibilityContext } from '../core/customViews/visibility';
import { meshesByState, resolveVisibility, scopeModules } from '../core/customViews/visibility';
import type { ModuleRefs } from '../core/customViews/refs';
import { moduleRefs } from '../core/customViews/refs';
import type { ClipPlane } from '../core/customViews/cuts';
import { nearestModule, resolveCuts } from '../core/customViews/cuts';
import type { Affine2D, CameraView } from '../core/customViews/camera';
import { apply2D, cameraView, isIdentity2D } from '../core/customViews/camera';
import type { Bounds2D, LayoutBlock } from '../core/customViews/layout';
import { arrangeBlocks, stackBelow, translateBounds } from '../core/customViews/layout';
import { groupIdentical, groupTitle, moduleSignature } from '../core/customViews/identical';
import { cacheGet, cachePut, hashKey } from './cache';
import type { GlassTest } from './packets';
import { buildPacket } from './packets';
import type { HlrRunner } from './runner';
import { LINEWORK_ENGINE } from './provider';
import type { CustomJob } from './customJob';
import { MATERIAL } from './customJob';
import { categoryStrokeLayers, isTopView } from './categoryStrokes';
import type { LineStyleSpec, Linework2D, LineworkFill, LineworkLayer } from './types';

/** Version du calcul des vues spéciales (découpe, bouchons, remplissages) : la changer invalide leur cache seulement. */
export const CUSTOM_ENGINE = 'vs3-cut-1';

export interface CustomViewDeps {
  scene: LoadedScene;
  runner: HlrRunner;
  glassTest: GlassTest;
  /** étiquettes de vue mémorisées (app_settings › plans.viewTags) */
  viewTags?: ViewTagRule[];
  categoryColors?: Record<string, string>;
  noCache?: boolean;
  /** compteur de calculs évités (console de debug) */
  log?: (msg: string) => void;
}

export interface CustomBlock {
  key: string;
  /** « Ensemble », « VBX-01 = VBX-04 »… */
  title: string;
  modules: string[];
  /** traits dans le repère du bloc (après transformation 2D, avant placement) */
  lw: Linework2D;
  /** base du bloc (point 3D → dessin du bloc) */
  basis: ViewBasis;
  /** translation du bloc dans le dessin assemblé */
  offset: [number, number];
  /** clé de calcul (cache) ; un bloc identique à un autre partage la sienne */
  cacheKey: string;
  /** bloc recopié d'un bloc identique (pas de calcul) */
  sharedFrom?: string;
}

export interface CustomViewResult {
  blocks: CustomBlock[];
  /** dessin assemblé (tous les blocs placés) : mêmes calques que les vues existantes + cut / cut-hatch / ghost */
  lw: Linework2D;
  /** titres des blocs (calque de décoration), position = au-dessus à gauche du bloc */
  labels: Array<{ text: string; x: number; y: number }>;
  title: string;
  subtitle: string;
  warnings: CustomViewWarning[];
  stats: { computed: number; cached: number; reused: number; durationMs: number };
  /** pièces touchées par chaque règle */
  counts: Map<string, number>;
  refs: Map<string, ModuleRefs>;
}

const GLASS_RE = /VITRE|GLASS|VERRE|GLAS\b/;
const WOOD_RE = /BOIS|WOOD|PLY|CONTREPLAQUE|MULTIPLEX|MDF|OSB|TIMBER|HOLZ|BIRCH|BOULEAU/;
const STEEL_RE = /ACIER|STEEL|METAL|INOX|GALVA|ALU|STAHL/;

/** Matériau d'une pièce pour le remplissage des coupes. */
export function materialOf(scene: LoadedScene, id: string): number {
  const n = scene.look.byId.get(id);
  const cat = scene.look.categoryOf(id) ?? '';
  const mats = (n?.materialNames ?? []).join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  if (n?.glass || cat.startsWith('VITRE') || (mats && GLASS_RE.test(mats) && !WOOD_RE.test(mats) && !STEEL_RE.test(mats))) return MATERIAL.glass;
  if (WOOD_RE.test(mats)) return MATERIAL.wood;
  if (STEEL_RE.test(mats)) return MATERIAL.steel;
  if (cat === 'PLANCHER') return MATERIAL.wood;
  if (cat === 'STRUCTURE' || cat === 'PIED' || cat === 'TOIT') return MATERIAL.steel;
  return MATERIAL.other;
}

const planeStr = (p: ClipPlane) => `${p.n.map((v) => v.toFixed(6)).join(',')},${p.d.toFixed(2)},${p.cutId ? 1 : 0}`;

/** Transformation 2D d'un dessin (base du moteur → dessin final). */
export function transformLinework(lw: Linework2D, t: Affine2D, basis: ViewBasis): Linework2D {
  if (isIdentity2D(t)) return { ...lw, meta: { ...lw.meta, basis } };
  const map = (a: Float64Array) => {
    const out = new Float64Array(a.length);
    for (let i = 0; i + 1 < a.length; i += 2) {
      const [x, y] = apply2D(t, a[i], a[i + 1]);
      out[i] = x;
      out[i + 1] = y;
    }
    return out;
  };
  const layers = lw.layers.map((l) => ({ ...l, polylines: l.polylines.map(map) }));
  const fills = lw.fills?.map((f) => ({ ...f, rings: f.rings.map(map) }));
  return { ...lw, layers, fills, snapPoints: map(lw.snapPoints), boundsMm: boundsOfAll(layers, fills ?? []), meta: { ...lw.meta, basis } };
}

export function translateLinework(lw: Linework2D, d: [number, number]): Linework2D {
  if (!d[0] && !d[1]) return lw;
  const map = (a: Float64Array) => {
    const out = new Float64Array(a.length);
    for (let i = 0; i + 1 < a.length; i += 2) {
      out[i] = a[i] + d[0];
      out[i + 1] = a[i + 1] + d[1];
    }
    return out;
  };
  return {
    ...lw,
    layers: lw.layers.map((l) => ({ ...l, polylines: l.polylines.map(map) })),
    fills: lw.fills?.map((f) => ({ ...f, rings: f.rings.map(map) })),
    snapPoints: map(lw.snapPoints),
    boundsMm: translateBounds(lw.boundsMm, d),
  };
}

function boundsOfAll(layers: LineworkLayer[], fills: LineworkFill[]): Bounds2D {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (a: Float64Array) => {
    for (let i = 0; i + 1 < a.length; i += 2) {
      if (a[i] < b.minX) b.minX = a[i];
      if (a[i] > b.maxX) b.maxX = a[i];
      if (a[i + 1] < b.minY) b.minY = a[i + 1];
      if (a[i + 1] > b.maxY) b.maxY = a[i + 1];
    }
  };
  for (const l of layers) for (const p of l.polylines) add(p);
  for (const f of fills) for (const r of f.rings) add(r);
  return Number.isFinite(b.minX) ? b : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}

/** Assemble des dessins (déjà placés) en un seul. */
export function mergeLinework(parts: Linework2D[], basis: ViewBasis, cacheKey: string): Linework2D {
  const layers = new Map<string, LineworkLayer>();
  const fills: LineworkFill[] = [];
  const snaps: number[] = [];
  let segments = 0;
  let objects = 0;
  let duration = 0;
  for (const p of parts) {
    for (const l of p.layers) {
      let t = layers.get(l.key);
      if (!t) {
        t = { key: l.key, polylines: [], sourceNodeIds: [] };
        layers.set(l.key, t);
      }
      t.polylines.push(...l.polylines);
      t.sourceNodeIds!.push(...(l.sourceNodeIds ?? l.polylines.map(() => '')));
    }
    if (p.fills) fills.push(...p.fills);
    for (const v of p.snapPoints) snaps.push(v);
    segments += p.meta.segmentCount;
    objects += p.meta.objectCount;
    duration += p.meta.durationMs;
  }
  const order = ['ghost', 'cut-hatch', 'hidden', 'fine', 'visible', 'silhouette', 'cut'];
  const ls = [...layers.values()].sort((a, b) => {
    const ia = order.indexOf(a.key);
    const ib = order.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return {
    boundsMm: boundsOfAll(ls, fills),
    layers: ls,
    fills: fills.length ? fills : undefined,
    snapPoints: Float64Array.from(snaps),
    meta: { provider: 'browser-hlr', durationMs: duration, segmentCount: segments, cacheKey, basis, objectCount: objects },
  };
}

interface BlockPlan {
  key: string;
  title: string;
  modules: string[];
  level: number;
  /** nœuds maillés du bloc */
  meshes: string[];
  camera: CameraView;
  /** identique à ce bloc (même calcul, traits translatés) */
  sameAs?: string;
  group: 'assembled' | 'exploded';
}

const origin = (f: ModuleFrame | undefined): Vec3 => (f ? f.origin : [0, 0, 0]);

/**
 * Calcule une vue spéciale. `lineStyle` = réglages du moteur 2D (échelle visée pour les détails fins…) ; les lignes
 * cachées suivent `spec.style.hidden`.
 */
export async function computeSpecialView(
  spec: CustomViewSpec,
  deps: CustomViewDeps,
  lineStyle: LineStyleSpec,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<CustomViewResult> {
  const t0 = performance.now();
  const { scene } = deps;
  const { index, look, frames } = scene;
  const paths = makePathIndex(index);
  const tags = makeTagResolver(index, deps.viewTags ?? []);
  const ctx: VisibilityContext = { index, look, paths, tags };
  const vis = resolveVisibility(ctx, spec);
  const warnings: CustomViewWarning[] = [...vis.warnings];
  const levelOf = new Map(index.modules.map((m) => [m.id, m.level]));
  const modules = scopeModules(index, spec.scope).sort((a, b) => (levelOf.get(a)! - levelOf.get(b)!) || a.localeCompare(b, 'fr', { numeric: true }));
  const refs = new Map<string, ModuleRefs>();
  for (const m of modules) {
    const f = frames.get(m);
    if (f) refs.set(m, moduleRefs(index, look, tags, f));
  }
  const { visible, ghost } = meshesByState(index, vis.states);
  const drawable = (id: string) => meshesOfNode(scene.objectsById.get(id)).length > 0;
  const allMeshes = [...visible, ...ghost].filter(drawable);
  const cuts = resolveCuts({ index, look, frames, refs, modules }, spec, allMeshes);
  warnings.push(...cuts.warnings);
  const state = (id: string): NodeState => vis.states.get(id) ?? 'hidden';
  const style: LineStyleSpec = { ...lineStyle, hiddenLines: spec.style.hidden, colorByCategory: false, facadeMarks: false };

  // rattachement des nœuds aux Viewbox (communs : la plus proche en plan, ou aucun)
  const moduleOfMesh = (id: string): string | null => {
    const n = look.byId.get(id);
    if (n?.moduleId) return n.moduleId;
    if (spec.layout.common === 'keep-in-place' && n?.bboxMm) {
      const b = n.bboxMm;
      return nearestModule(frames, modules, [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]) ?? null;
    }
    return null;
  };

  // blocs à calculer
  const plans: BlockPlan[] = [];
  const mode = spec.layout.mode;
  const refModule = modules[0];
  if (mode === 'assembled' || mode === 'assembled+exploded')
    plans.push({ key: 'assembled', title: 'Ensemble', modules, level: 0, meshes: allMeshes, camera: cameraView(spec.camera, frames, refModule), group: 'assembled' });
  if (mode !== 'assembled') {
    const perModule = mode === 'per-module';
    const meshesOf = new Map<string, string[]>(modules.map((m) => [m, []]));
    for (const id of allMeshes) {
      const m = moduleOfMesh(id);
      if (m && meshesOf.has(m)) meshesOf.get(m)!.push(id);
    }
    const camOf = (m: string) => cameraView(spec.camera, frames, perModule || spec.camera.frame === 'module' ? m : refModule);
    // Viewbox identiques : même signature + même orientation par rapport à la vue
    const viewRel = (m: string) => {
      const f = frames.get(m);
      const cam = camOf(m);
      if (!f) return null;
      const r = (v: Vec3) => [dot(v, f.xAxis), dot(v, f.yAxis), dot(v, f.up)].map((x) => Math.round(x * 1e4) / 1e4).join(',');
      return `${r(cam.basis.right)}|${r(cam.basis.up)}|${r(cam.basis.toward)}`;
    };
    const sig = (m: string) => {
      const s = moduleSignature({ index, look, paths, frames, states: vis.states, planes: cuts.byNode }, m);
      const v = viewRel(m);
      return s === null || v === null ? null : `${s}\n${v}`;
    };
    const groups = spec.layout.groupIdentical || !perModule ? groupIdentical(modules, sig) : modules.map((m) => [m]);
    for (const g of groups) {
      const lead = g[0];
      if (perModule && spec.layout.groupIdentical) {
        // un seul bloc pour le groupe
        plans.push({ key: `m:${lead}`, title: groupTitle(g), modules: g, level: levelOf.get(lead) ?? 0, meshes: meshesOf.get(lead) ?? [], camera: camOf(lead), group: 'exploded' });
      } else
        for (const m of g)
          plans.push({
            key: `m:${m}`,
            title: m,
            modules: [m],
            level: levelOf.get(m) ?? 0,
            meshes: meshesOf.get(m) ?? [],
            camera: camOf(m),
            sameAs: m === lead ? undefined : `m:${lead}`,
            group: 'exploded',
          });
    }
  }

  // calcul des blocs (les identiques reprennent le calcul de leur modèle)
  const total = plans.filter((p) => !p.sameAs).length || 1;
  let done = 0;
  let computed = 0;
  let cached = 0;
  const results = new Map<string, { lw: Linework2D; cacheKey: string }>();
  const planeKeyOf = (id: string) => (cuts.byNode.get(id) ?? []).map(planeStr).join(';');
  for (const p of plans) {
    if (p.sameAs) continue;
    if (signal?.aborted) throw new DOMException('Annulé', 'AbortError');
    const meshes = p.meshes;
    const visibleMeshes = meshes.filter((id) => state(id) === 'visible');
    if (!meshes.length) {
      results.set(p.key, { lw: emptyLinework(p.camera.basis), cacheKey: '' });
      continue;
    }
    const baseBasis = viewBasis(p.camera.view, frames);
    // jeux de plans
    const setIndex = new Map<string, number>();
    const planeSets: CustomJob['planeSets'] = [];
    const objectSet = meshes.map((id) => {
      const pl = cuts.byNode.get(id);
      if (!pl?.length) return -1;
      const k = planeKeyOf(id);
      let i = setIndex.get(k);
      if (i === undefined) {
        i = planeSets.length;
        setIndex.set(k, i);
        planeSets.push(pl.map((q) => ({ n: q.n, d: q.d, section: !!q.cutId })));
      }
      return i;
    });
    const job: CustomJob = {
      planeSets,
      objectSet,
      ghost: meshes.map((id) => (state(id) === 'ghost' ? 1 : 0)),
      material: meshes.map((id) => materialOf(scene, id)),
      fill: spec.style.cutFill,
      beyondThin: spec.style.beyond === 'thin',
    };
    const cacheKey = await hashKey({
      kind: 'custom',
      engine: LINEWORK_ENGINE,
      custom: CUSTOM_ENGINE,
      model: scene.modelKey,
      meshes: meshes.map((id) => `${id}:${state(id)[0]}:${planeKeyOf(id)}`).sort(),
      view: viewKey(p.camera.view, frames),
      style,
      fill: job.fill,
      beyond: job.beyondThin,
    });
    let lw = deps.noCache ? null : await cacheGet(cacheKey);
    if (lw) cached++;
    else {
      const packet = buildPacket(scene, meshes, deps.glassTest);
      const from = done / total;
      lw = await deps.runner.run(
        { packetKey: `custom:${cacheKey}`, packet, job: { basis: baseBasis, style, cacheKey, custom: job }, onProgress: (f) => onProgress?.(from + f / total) },
        signal,
      );
      computed++;
      if (!deps.noCache) void cachePut(cacheKey, lw);
    }
    if (spec.style.categoryColors && deps.categoryColors && isTopView(baseBasis))
      lw = { ...lw, layers: [...lw.layers, ...categoryStrokeLayers(scene, visibleMeshes, baseBasis, deps.categoryColors)] };
    for (const id of (lw.meta as { openSections?: string[] }).openSections ?? [])
      warnings.push({ code: 'SECTION_OPEN', message: `Coupe ouverte (pièce non fermée dans SketchUp) : ${look.byId.get(id)?.label ?? look.byId.get(id)?.definition ?? look.byId.get(id)?.name ?? id} — trait de coupe sans remplissage`, nodeIds: [id] });
    results.set(p.key, { lw: transformLinework(lw, p.camera.transform, p.camera.basis), cacheKey });
    done++;
    onProgress?.(done / total);
  }

  // blocs : identiques = traits du modèle translatés de l'écart des origines projetées
  const blocks: CustomBlock[] = plans.map((p) => {
    if (p.sameAs) {
      const lead = plans.find((q) => q.key === p.sameAs)!;
      const r = results.get(lead.key)!;
      const a = projectPoint(lead.camera.basis, origin(frames.get(lead.modules[0])));
      const b = projectPoint(p.camera.basis, origin(frames.get(p.modules[0])));
      return { key: p.key, title: p.title, modules: p.modules, lw: translateLinework(r.lw, [b.x - a.x, b.y - a.y]), basis: p.camera.basis, offset: [0, 0], cacheKey: r.cacheKey, sharedFrom: lead.key };
    }
    const r = results.get(p.key)!;
    return { key: p.key, title: p.title, modules: p.modules, lw: r.lw, basis: p.camera.basis, offset: [0, 0], cacheKey: r.cacheKey };
  });
  const reused = blocks.filter((b) => b.sharedFrom).length;
  if (reused) deps.log?.(`[vues spéciales] ${reused} calcul(s) évité(s) (Viewbox identiques)`);

  // placement
  const exploded = blocks.filter((b) => b.key !== 'assembled');
  const plan = spec.camera.dir === 'top' || spec.camera.dir === 'bottom';
  if (exploded.length) {
    const anchorBasis = cameraView({ ...spec.camera, frame: 'world' }, frames).basis;
    const lb: LayoutBlock[] = exploded.map((b) => {
      const f = frames.get(b.modules[0]);
      const c: Vec3 = f
        ? [
            f.origin[0] + ((f.min[0] + f.max[0]) / 2) * f.xAxis[0] + ((f.min[1] + f.max[1]) / 2) * f.yAxis[0],
            f.origin[1] + (f.min[2] + f.max[2]) / 2,
            f.origin[2] + ((f.min[0] + f.max[0]) / 2) * f.xAxis[2] + ((f.min[1] + f.max[1]) / 2) * f.yAxis[2],
          ]
        : [0, 0, 0];
      const pr = projectPoint(anchorBasis, c);
      return { key: b.key, modules: b.modules, level: levelOf.get(b.modules[0]) ?? 0, bounds: b.lw.boundsMm, anchor: [pr.x, pr.y] };
    });
    const moves = arrangeBlocks(lb, spec.layout, { plan, ownFrames: mode === 'per-module' && spec.camera.frame === 'module' });
    for (const b of exploded) b.offset = moves.get(b.key) ?? [0, 0];
    const asm = blocks.find((b) => b.key === 'assembled');
    if (asm) {
      const u = exploded.reduce<Bounds2D | null>((acc, b) => {
        const t = translateBounds(b.lw.boundsMm, b.offset);
        return acc ? { minX: Math.min(acc.minX, t.minX), minY: Math.min(acc.minY, t.minY), maxX: Math.max(acc.maxX, t.maxX), maxY: Math.max(acc.maxY, t.maxY) } : t;
      }, null)!;
      const d = stackBelow(asm.lw.boundsMm, u, spec.layout.gap);
      for (const b of exploded) b.offset = [b.offset[0] + d[0], b.offset[1] + d[1]];
    }
  }

  const placed = blocks.map((b) => translateLinework(b.lw, b.offset));
  const lw = mergeLinework(placed, blocks[0]?.basis ?? cameraView(spec.camera, frames, refModule).basis, blocks.map((b) => b.cacheKey).join('+'));
  const labels: CustomViewResult['labels'] = [];
  const showLabels = spec.layout.labels !== 'none' && (blocks.length > 1 || mode !== 'assembled');
  if (showLabels)
    for (const b of blocks) {
      const bb = translateBounds(b.lw.boundsMm, b.offset);
      let text = b.title;
      if (spec.layout.labels === 'id+type') {
        const type = index.modules.find((m) => m.id === b.modules[0])?.type;
        if (type && b.key !== 'assembled') text = `${text} — ${type}`;
      }
      labels.push({ text, x: bb.minX, y: bb.maxY });
    }
  if (mode === 'assembled+exploded' && exploded.length) {
    const u = placed.slice(1).reduce((acc, p) => ({ minX: Math.min(acc.minX, p.boundsMm.minX), maxY: Math.max(acc.maxY, p.boundsMm.maxY) }), { minX: Infinity, maxY: -Infinity });
    labels.push({ text: 'Séparées', x: u.minX, y: u.maxY });
  }
  if (!allMeshes.length) warnings.push({ code: 'EMPTY', message: 'Rien à dessiner : tout est retiré ou coupé' });
  const cam = cameraView(spec.camera, frames, refModule);
  return {
    blocks,
    lw,
    labels,
    title: cam.title,
    subtitle: cam.subtitle,
    warnings,
    stats: { computed, cached, reused, durationMs: Math.round(performance.now() - t0) },
    counts: vis.counts,
    refs,
  };
}

function emptyLinework(basis: ViewBasis): Linework2D {
  return { boundsMm: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, layers: [], snapPoints: new Float64Array(), meta: { provider: 'browser-hlr', durationMs: 0, segmentCount: 0, cacheKey: '', basis, objectCount: 0 } };
}

