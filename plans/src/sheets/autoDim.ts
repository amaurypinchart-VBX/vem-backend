// « Coter automatiquement » une fenêtre de vue : lit la vue calculée (traits + objets d'origine) et les repères des
// Viewbox, place les cotes (dimensions.ts), puis choisit l'échelle et le centrage qui font tenir dessin + cotes dans
// le cadre, sans chevauchement entre rangées ni avec le dessin.
import type { Vec3, ViewBasis } from '../core/views';
import { dot, unprojectPoint } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import type { Linework2D } from '../linework/types';
import type { DimensionItem, RectMm, ViewportItem } from './types';
import type { AutoDim, AutoDimInput, DimPurpose, Extent } from './dimensions';
import { DIM, dimGeometry, dimMargins, fitWithDims, planDimensions, rowOffset } from './dimensions';
import { viewportTransform } from './scales';
import { newId } from './generate';

export function dimPurpose(vp: ViewportItem): DimPurpose {
  if (vp.request.subset.onlyCategories?.includes('PIED')) return 'implantation';
  const k = vp.request.view.kind;
  return k === 'top' || k === 'bottom' ? 'plan' : 'elevation';
}

/** Emprises (dans le dessin) des objets d'une vue, regroupées par objet d'origine, pour une catégorie donnée. */
function extentsBy(lw: Linework2D, scene: LoadedScene, pick: (category: string | null) => boolean): Extent[] {
  const byId = new Map<string, Extent>();
  for (const layer of lw.layers) {
    if (layer.key === 'hidden' || layer.key.startsWith('category:')) continue;
    layer.polylines.forEach((pl, i) => {
      const id = layer.sourceNodeIds?.[i];
      if (!id || !pick(scene.look.categoryOf(id))) return;
      let e = byId.get(id);
      if (!e) byId.set(id, (e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }));
      for (let k = 0; k < pl.length; k += 2) {
        e.x0 = Math.min(e.x0, pl[k]);
        e.x1 = Math.max(e.x1, pl[k]);
        e.y0 = Math.min(e.y0, pl[k + 1]);
        e.y1 = Math.max(e.y1, pl[k + 1]);
      }
    });
  }
  return [...byId.values()];
}

export function autoDimInput(vp: ViewportItem, lw: Linework2D, basis: ViewBasis, scene: LoadedScene): AutoDimInput {
  const include = new Set(vp.request.subset.include);
  const moduleIds = new Set(scene.index.modules.filter((m) => include.has(m.nodeId)).map((m) => m.id));
  // emprise de chaque Viewbox dans le dessin : les 8 coins de sa boîte (pieds exclus) projetés dans la vue
  const modules: Extent[] = [];
  for (const f of scene.frames.values()) {
    if (!moduleIds.has(f.moduleId)) continue;
    const e: Extent = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (let c = 0; c < 8; c++) {
      const lx = c & 1 ? f.max[0] : f.min[0];
      const ly = c & 2 ? f.max[1] : f.min[1];
      const lz = c & 4 ? f.max[2] : f.min[2];
      const w: Vec3 = [
        f.origin[0] + f.xAxis[0] * lx + f.yAxis[0] * ly + f.up[0] * lz,
        f.origin[1] + f.xAxis[1] * lx + f.yAxis[1] * ly + f.up[1] * lz,
        f.origin[2] + f.xAxis[2] * lx + f.yAxis[2] * ly + f.up[2] * lz,
      ];
      const x = dot(basis.right, w);
      const y = dot(basis.up, w);
      e.x0 = Math.min(e.x0, x);
      e.x1 = Math.max(e.x1, x);
      e.y0 = Math.min(e.y0, y);
      e.y1 = Math.max(e.y1, y);
    }
    modules.push(e);
  }
  const purpose = dimPurpose(vp);
  const doors = purpose === 'elevation' ? extentsBy(lw, scene, (c) => !!c && c.startsWith('PORTE')) : [];
  const feet = purpose === 'implantation' ? extentsBy(lw, scene, (c) => c === 'PIED').map((e) => ({ x: (e.x0 + e.x1) / 2, y: (e.y0 + e.y1) / 2 })) : [];
  let roofBand: AutoDimInput['roofBand'];
  if (purpose === 'elevation') {
    const roof = extentsBy(lw, scene, (c) => c === 'TOIT');
    if (roof.length) roofBand = { y0: Math.min(...roof.map((r) => r.y0)), y1: Math.max(...roof.map((r) => r.y1)) };
  }
  // la vue d'implantation n'a que les pieds : les Viewbox donnent le contour à coter
  const b = lw.boundsMm;
  const bounds =
    purpose === 'implantation' && modules.length
      ? { minX: Math.min(b.minX, ...modules.map((m) => m.x0)), minY: Math.min(b.minY, ...modules.map((m) => m.y0)), maxX: Math.max(b.maxX, ...modules.map((m) => m.x1)), maxY: Math.max(b.maxY, ...modules.map((m) => m.y1)) }
      : b;
  return { purpose, bounds, modules, doors, feet, roofBand };
}

/** Profondeur de référence des ancrages : celle des Viewbox de la vue (sans effet sur le dessin, utile en 3D). */
function depthRef(vp: ViewportItem, basis: ViewBasis, scene: LoadedScene): number {
  const include = new Set(vp.request.subset.include);
  const ds = scene.index.modules
    .filter((m) => include.has(m.nodeId))
    .map((m) => scene.frames.get(m.id))
    .filter((f): f is NonNullable<typeof f> => !!f)
    .map((f) => dot(basis.toward, f.origin));
  return ds.length ? ds.reduce((a, c) => a + c, 0) / ds.length : 0;
}

export interface AutoDimResult {
  dims: DimensionItem[];
  scale: number;
  center: [number, number];
}

/** Cotes automatiques d'une fenêtre de vue, avec l'échelle et le centrage qui les font tenir dans son cadre. */
export function autoDimensionViewport(vp: ViewportItem, lw: Linework2D, basis: ViewBasis, scene: LoadedScene, minScale = 1): AutoDimResult {
  const input = autoDimInput(vp, lw, basis, scene);
  const plan = planDimensions(input);
  const depth = depthRef(vp, basis, scene);
  // décalage de chaque rangée : 10 mm, puis +7 mm (plus si les textes d'une rangée sont décalés pour ne pas se toucher)
  const offsets = new Map<AutoDim, number>();
  for (const d of plan) offsets.set(d, rowOffset(d.side, d.row));
  let margins = dimMargins(plan);
  let fit = fitWithDims(input.bounds, vp.rect, margins, minScale);
  for (let pass = 0; pass < 2; pass++) {
    const tr = viewportTransform(vp.rect, fit.scale, fit.center);
    const extra = { top: 0, bottom: 0, left: 0, right: 0 };
    for (const side of ['top', 'bottom', 'left', 'right'] as const) {
      let pushed = 0;
      for (const d of plan.filter((x) => x.side === side).sort((a, b) => a.row - b.row)) {
        const base = rowOffset(side, d.row);
        const off = base + Math.sign(base) * pushed;
        offsets.set(d, off);
        const g = dimGeometry({ orient: d.orient, paper: d.points.map(([x, y]) => tr.toPaper(x, y)), model: d.points, offsetMm: off });
        // débord des textes au-delà de la ligne de cote, vers l'extérieur
        const lineAt = (p: { x: number; y: number }) => (d.orient === 'h' ? p.y : p.x);
        const papers = d.points.map(([x, y]) => lineAt(tr.toPaper(x, y)));
        const lineW = (off < 0 ? Math.min(...papers) : Math.max(...papers)) + off;
        const outward = Math.max(
          0,
          ...g.texts.map((t) => (d.orient === 'h' ? (off < 0 ? lineW - t.box.y : t.box.y + t.box.h - lineW) : off < 0 ? lineW - t.box.x : t.box.x + t.box.w - lineW)),
        );
        // la rangée suivante doit passer au-delà des textes de celle-ci
        pushed += Math.max(0, outward + 1.5 - DIM.rowStep);
        extra[side] = pushed;
      }
    }
    const next = { top: margins.top + extra.top, bottom: margins.bottom + extra.bottom, left: margins.left + extra.left, right: margins.right + extra.right };
    if (next.top === margins.top && next.bottom === margins.bottom && next.left === margins.left && next.right === margins.right) break;
    margins = next;
    fit = fitWithDims(input.bounds, vp.rect, margins, minScale);
  }
  const dims: DimensionItem[] = plan.map((d) => ({
    id: newId('d'),
    type: 'dimension',
    viewportId: vp.id,
    kind: d.points.length > 2 ? 'chain' : 'linear',
    orient: d.orient,
    anchors3d: d.points.map(([x, y]) => unprojectPoint(basis, x, y, depth) as Vec3),
    offsetMm: offsets.get(d) ?? rowOffset(d.side, d.row),
    auto: true,
  }));
  return { dims, scale: fit.scale, center: fit.center };
}

/** Boîtes (mm papier) des textes de cotes et du dessin : sert aux contrôles de chevauchement. */
export function paperBoxes(dims: DimensionItem[], vpRect: RectMm, scale: number, center: [number, number], basis: ViewBasis) {
  const tr = viewportTransform(vpRect, scale, center);
  return dims.map((d) => {
    const model = d.anchors3d.map((a) => [dot(basis.right, a), dot(basis.up, a)] as [number, number]);
    return dimGeometry({ orient: d.orient, paper: model.map(([x, y]) => tr.toPaper(x, y)), model, offsetMm: d.offsetMm });
  });
}
