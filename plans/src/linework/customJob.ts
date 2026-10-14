// Calcul d'un bloc de vue spéciale (dans un Worker) : découpe + bouchons, retrait des lignes cachées, fantômes
// (passe séparée : leurs arêtes visibles seulement, cachées par le reste, ils ne cachent rien), remplissage et
// hachures des pièces coupées. Pure : aucune dépendance au DOM.
import type { Vec3 } from '../core/views';
import { dot } from '../core/views';
import type { CutFill } from '../core/customViews/types';
import type { HlrJob, HlrPacket, HlrProgress } from './hlr';
import { computeView } from './hlr';
import type { ClipPlaneSpec } from './clip';
import { clipPacket } from './clip';
import { loopsToPolygons } from './section';
import { hatchRings } from './hatch';
import type { Linework2D, LineworkFill, LineworkLayer } from './types';

/** Matériau d'un objet pour le remplissage des coupes. */
export const MATERIAL = { other: 0, steel: 1, wood: 2, glass: 3 } as const;

export interface CustomJob {
  planeSets: ClipPlaneSpec[][];
  /** jeu de plans de chaque objet du paquet (−1 = aucun) */
  objectSet: number[];
  /** 1 = objet en fantôme */
  ghost: number[];
  /** MATERIAL de chaque objet */
  material: number[];
  fill: CutFill;
  beyondThin: boolean;
}

export type CustomHlrJob = HlrJob & { custom: CustomJob };

/** Couleur des aplats « autres matériaux ». */
export const FILL_GREY = '#d9d9d9';

/** Sous-ensemble d'objets d'un paquet (copie). */
export function subsetPacket(p: HlrPacket, objects: number[], edgeless?: (m: number) => boolean): HlrPacket {
  let vTotal = 0;
  let iTotal = 0;
  for (const m of objects) {
    vTotal += p.vertexCount[m];
    iTotal += p.indexCount[m];
  }
  const positions = new Float32Array(vTotal * 3);
  const indices = new Uint32Array(iTotal);
  const glass = new Uint8Array(iTotal / 3);
  const cutVertex = p.cutVertex ? new Uint16Array(vTotal) : undefined;
  const n = objects.length;
  const out: HlrPacket = {
    positions,
    indices,
    glass,
    vertexStart: new Uint32Array(n),
    vertexCount: new Uint32Array(n),
    indexStart: new Uint32Array(n),
    indexCount: new Uint32Array(n),
    sourceIds: objects.map((m) => p.sourceIds[m]),
    center: p.center,
    cutVertex,
    edgeless: edgeless ? Uint8Array.from(objects.map((m) => (edgeless(m) ? 1 : 0))) : undefined,
  };
  let vo = 0;
  let io = 0;
  objects.forEach((m, k) => {
    const vs = p.vertexStart[m];
    const vc = p.vertexCount[m];
    const is = p.indexStart[m];
    const ic = p.indexCount[m];
    positions.set(p.positions.subarray(vs * 3, (vs + vc) * 3), vo * 3);
    if (cutVertex && p.cutVertex) cutVertex.set(p.cutVertex.subarray(vs, vs + vc), vo);
    indices.set(p.indices.subarray(is, is + ic), io);
    glass.set(p.glass.subarray(is / 3, (is + ic) / 3), io / 3);
    out.vertexStart[k] = vo;
    out.vertexCount[k] = vc;
    out.indexStart[k] = io;
    out.indexCount[k] = ic;
    vo += vc;
    io += ic;
  });
  return out;
}

/** Remplissage d'une section selon le style et le matériau : aplat, hachures (angle, pas en mm papier) ou rien. */
export function fillFor(mode: CutFill, material: number, scaleDenominator: number): { solid?: string; hatch?: { angle: number; paperMm: number } } {
  if (mode === 'none' || material === MATERIAL.glass) return {};
  if (mode === 'solid') return { solid: '#000' };
  if (mode === 'hatch') return { hatch: { angle: 45, paperMm: 1.5 } };
  if (mode === 'drawing') {
    // dessin d'architecte : traits seulement
    if (material === MATERIAL.steel) return { hatch: { angle: 45, paperMm: 0.8 } };
    if (material === MATERIAL.wood) return { hatch: { angle: 45, paperMm: 2 } };
    return { hatch: { angle: 45, paperMm: 3 } };
  }
  // par matériau : acier noir plein à 1:50 et au-delà, hachuré au-dessous ; bois hachuré ; autres gris clair
  if (material === MATERIAL.steel) return scaleDenominator >= 50 ? { solid: '#000' } : { hatch: { angle: 45, paperMm: 1 } };
  if (material === MATERIAL.wood) return { hatch: { angle: 45, paperMm: 2 } };
  return { solid: FILL_GREY };
}

function boundsOf(layers: LineworkLayer[], fills: LineworkFill[]): Linework2D['boundsMm'] {
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
  if (!Number.isFinite(b.minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  return b;
}

export interface CustomLinework extends Linework2D {
  meta: Linework2D['meta'] & { openSections?: string[] };
}

export function computeCustomView(packet: HlrPacket, job: CustomHlrJob, onProgress: HlrProgress = () => {}): CustomLinework {
  const t0 = performance.now();
  const { basis, style, custom } = job;
  onProgress(0.02, 'Coupe');
  const clipped = clipPacket(packet, { planeSets: custom.planeSets, objectSet: Int32Array.from(custom.objectSet) });
  const cp = clipped.packet;
  const isGhost = (k: number) => custom.ghost[clipped.kept[k]] === 1;
  const mainObjs: number[] = [];
  const ghostObjs: number[] = [];
  clipped.kept.forEach((_, k) => (isGhost(k) ? ghostObjs : mainObjs).push(k));
  const report = (from: number, to: number) => (f: number, msg: string) => onProgress(from + (to - from) * f, msg);

  // 1. traits des éléments visibles (coupés, bouchés)
  let lw: Linework2D;
  if (mainObjs.length) lw = computeView(subsetPacket(cp, mainObjs), job, report(0.05, ghostObjs.length ? 0.6 : 0.9));
  else
    lw = {
      boundsMm: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      layers: [],
      snapPoints: new Float64Array(),
      meta: { provider: 'browser-hlr', durationMs: 0, segmentCount: 0, cacheKey: job.cacheKey, basis, objectCount: 0 },
    };
  const layers: LineworkLayer[] = [];

  // 2. fantômes : arêtes visibles des fantômes, cachées par les éléments visibles, ne cachant rien eux-mêmes
  if (ghostObjs.length) {
    const all = [...mainObjs, ...ghostObjs];
    const g = computeView(subsetPacket(cp, all, (m) => !isGhost(m)), { ...job, style: { ...style, hiddenLines: false } }, report(0.6, 0.9));
    const ghost: LineworkLayer = { key: 'ghost', polylines: [], sourceNodeIds: [] };
    for (const l of g.layers) {
      if (l.key === 'hidden') continue;
      ghost.polylines.push(...l.polylines);
      ghost.sourceNodeIds!.push(...(l.sourceNodeIds ?? l.polylines.map(() => '')));
    }
    if (ghost.polylines.length) layers.push(ghost);
  }

  // 3. remplissage / hachures des pièces coupées (plans vus de face seulement)
  onProgress(0.92, 'Remplissage des coupes');
  const fills: LineworkFill[] = [];
  const hatch: LineworkLayer = { key: 'cut-hatch', polylines: [], sourceNodeIds: [] };
  const toward: Vec3 = basis.toward;
  for (const sec of clipped.sections) {
    if (isGhost(sec.object)) continue;
    if (Math.abs(dot(sec.plane.n, toward)) < 0.999) continue;
    const mat = custom.material[clipped.kept[sec.object]] ?? MATERIAL.other;
    const f = fillFor(custom.fill, mat, style.scaleDenominator);
    if (!f.solid && !f.hatch) continue;
    const src = cp.sourceIds[sec.object];
    for (const poly of loopsToPolygons(sec.loops, sec.plane.n)) {
      const rings = poly.rings.map((r) => {
        const out = new Float64Array((r.length / 3) * 2);
        for (let i = 0, k = 0; i < r.length; i += 3, k += 2) {
          out[k] = basis.right[0] * r[i] + basis.right[1] * r[i + 1] + basis.right[2] * r[i + 2];
          out[k + 1] = basis.up[0] * r[i] + basis.up[1] * r[i + 1] + basis.up[2] * r[i + 2];
        }
        return out;
      });
      if (f.solid) fills.push({ key: 'cut-fill', color: f.solid, rings, sourceNodeId: src });
      if (f.hatch)
        for (const seg of hatchRings(rings, f.hatch.angle, f.hatch.paperMm * style.scaleDenominator)) {
          hatch.polylines.push(seg);
          hatch.sourceNodeIds!.push(src);
        }
    }
  }
  if (hatch.polylines.length) layers.push(hatch);

  // 4. calques : fantômes, hachures, puis les traits (au-delà de la coupe en trait fin si demandé)
  for (const l of lw.layers) {
    if (custom.beyondThin && (l.key === 'visible' || l.key === 'silhouette')) {
      const fine = layers.find((x) => x.key === 'fine');
      if (fine) {
        fine.polylines.push(...l.polylines);
        fine.sourceNodeIds!.push(...(l.sourceNodeIds ?? []));
      } else layers.push({ key: 'fine', polylines: [...l.polylines], sourceNodeIds: [...(l.sourceNodeIds ?? [])] });
      continue;
    }
    if (l.key === 'fine' && custom.beyondThin) {
      const fine = layers.find((x) => x.key === 'fine');
      if (fine) {
        fine.polylines.push(...l.polylines);
        fine.sourceNodeIds!.push(...(l.sourceNodeIds ?? []));
        continue;
      }
    }
    layers.push(l);
  }
  const order = (k: string) => ['ghost', 'cut-hatch', 'hidden', 'fine', 'visible', 'silhouette', 'cut'].indexOf(k);
  layers.sort((a, b) => order(a.key) - order(b.key));
  onProgress(1, 'Terminé');
  return {
    ...lw,
    boundsMm: boundsOf(layers, fills),
    layers,
    fills: fills.length ? fills : undefined,
    meta: {
      ...lw.meta,
      durationMs: Math.round(performance.now() - t0),
      objectCount: clipped.kept.length,
      openSections: clipped.open.length ? [...new Set(clipped.open.map((m) => packet.sourceIds[m]))] : undefined,
    },
  };
}
