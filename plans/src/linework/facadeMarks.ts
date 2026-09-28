// Option « repères façade » des vues de face (élévations) : hachure de vitrage « // » sur chaque vitre visible
// depuis l'observateur, comme sur les plans Viewbox, et traits des portes et des murs dans leur couleur de légende
// (le DRAWING LEGEND dit quoi est quoi). Calculé après les traits (et leur cache) : l'activer ne relance pas le
// calcul des lignes cachées.
import type { BufferGeometry, Material, Mesh } from 'three';
import { Raycaster, Vector3 } from 'three';
import { computeBoundsTree } from 'three-mesh-bvh';
import type { ViewBasis } from '../core/views';
import { dot, unprojectPoint } from '../core/views';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import type { GlassTest } from './packets';
import type { Linework2D, LineworkLayer } from './types';

/** Vue de face : direction de regard horizontale (pas un dessus / dessous). */
export function isElevation(b: ViewBasis): boolean {
  return Math.abs(b.toward[1]) < 0.5;
}

// traits de la hachure, mesurés sur les élévations de référence (vitre 1000 × 2200 mm) : décalage perpendiculaire,
// glissement le long du trait et demi-longueur, en fraction du petit côté de la vitre ; traits à 63°
const HATCH_ANGLE = (63 * Math.PI) / 180;
const HATCH = [
  { off: -0.32, along: 0.41, half: 0.55 },
  { off: 0.03, along: 0, half: 0.73 },
  { off: 0.36, along: -0.37, half: 0.48 },
];

/** Segment coupé au rectangle (Liang-Barsky), ou null s'il est dehors. */
export function clipSegment(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number): [number, number, number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  for (const [p, q] of [
    [-dx, ax - x0],
    [dx, x1 - ax],
    [-dy, ay - y0],
    [dy, y1 - ay],
  ]) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return null;
    }
  }
  return [ax + t0 * dx, ay + t0 * dy, ax + t1 * dx, ay + t1 * dy];
}

/** Hachure « // » d'une vitre (emprise dans le dessin, mm modèle) : 3 traits parallèles, gardés dans la vitre. */
export function glassHatch(x0: number, y0: number, x1: number, y1: number): Float64Array[] {
  const s = Math.min(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const d = [Math.cos(HATCH_ANGLE), Math.sin(HATCH_ANGLE)];
  const n = [d[1], -d[0]];
  const inset = 0.06 * s;
  const out: Float64Array[] = [];
  for (const h of HATCH) {
    const mx = cx + n[0] * h.off * s + d[0] * h.along * s;
    const my = cy + n[1] * h.off * s + d[1] * h.along * s;
    const c = clipSegment(mx - d[0] * h.half * s, my - d[1] * h.half * s, mx + d[0] * h.half * s, my + d[1] * h.half * s, x0 + inset, y0 + inset, x1 - inset, y1 - inset);
    if (c && Math.hypot(c[2] - c[0], c[3] - c[1]) > 0.1 * s) out.push(Float64Array.from(c));
  }
  return out;
}

const panesCache = new WeakMap<Mesh, Float64Array[]>();

/** Vitres d'un maillage : groupes de triangles reliés par leurs sommets (positions monde arrondies au 1/2 mm). */
export function glassPanes(mesh: Mesh): Float64Array[] {
  const cached = panesCache.get(mesh);
  if (cached) return cached;
  const g = mesh.geometry as BufferGeometry;
  const pos = g.attributes.position;
  const idx = g.index;
  mesh.updateWorldMatrix(true, false);
  const world = new Float64Array(pos.count * 3);
  const v = new Vector3();
  const keyId = new Map<string, number>();
  const vid = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
    world[i * 3] = v.x;
    world[i * 3 + 1] = v.y;
    world[i * 3 + 2] = v.z;
    const k = `${Math.round(v.x * 2)},${Math.round(v.y * 2)},${Math.round(v.z * 2)}`;
    let id = keyId.get(k);
    if (id === undefined) keyId.set(k, (id = keyId.size));
    vid[i] = id;
  }
  const parent = new Int32Array(keyId.size).map((_, i) => i);
  const find = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  const tri = idx ? idx.count / 3 : pos.count / 3;
  const corner = (t: number, c: number) => (idx ? idx.getX(t * 3 + c) : t * 3 + c);
  for (let t = 0; t < tri; t++) {
    const a = find(vid[corner(t, 0)]);
    for (const c of [1, 2]) {
      const b = find(vid[corner(t, c)]);
      if (a !== b) parent[b] = a;
    }
  }
  const groups = new Map<number, number[]>();
  for (let t = 0; t < tri; t++) {
    const r = find(vid[corner(t, 0)]);
    const l = groups.get(r);
    if (l) l.push(corner(t, 0), corner(t, 1), corner(t, 2));
    else groups.set(r, [corner(t, 0), corner(t, 1), corner(t, 2)]);
  }
  const panes = [...groups.values()].map((corners) => {
    const out = new Float64Array(corners.length * 3);
    corners.forEach((i, k) => out.set(world.subarray(i * 3, i * 3 + 3), k * 3));
    return out;
  });
  panesCache.set(mesh, panes);
  return panes;
}

interface Pane {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  d0: number;
  d1: number;
}

function projectPane(pts: Float64Array, b: ViewBasis): Pane {
  const p: Pane = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, d0: Infinity, d1: -Infinity };
  for (let i = 0; i < pts.length; i += 3) {
    const w: [number, number, number] = [pts[i], pts[i + 1], pts[i + 2]];
    const x = dot(b.right, w);
    const y = dot(b.up, w);
    const d = dot(b.toward, w);
    if (x < p.x0) p.x0 = x;
    if (x > p.x1) p.x1 = x;
    if (y < p.y0) p.y0 = y;
    if (y > p.y1) p.y1 = y;
    if (d < p.d0) p.d0 = d;
    if (d > p.d1) p.d1 = d;
  }
  return p;
}

/** Plus petite vitre marquée (mm) ; une vitre vue de biais (profondeur > 35 % de sa largeur vue) n'est pas marquée. */
const MIN_PANE_MM = 150;
const MAX_SLANT = 0.35;

export function facadeMarkLayers(
  scene: LoadedScene,
  meshIds: string[],
  basis: ViewBasis,
  lw: Linework2D,
  isGlass: GlassTest,
  colors: Record<string, string>,
): LineworkLayer[] {
  if (!isElevation(basis)) return [];
  const layers = new Map<string, LineworkLayer>();
  const add = (key: `mark:${string}`, pl: Float64Array, source: string) => {
    let l = layers.get(key);
    if (!l) layers.set(key, (l = { key, polylines: [], sourceNodeIds: [] }));
    l.polylines.push(pl);
    l.sourceNodeIds!.push(source);
  };
  const meshes: Array<{ mesh: Mesh; nodeId: string }> = [];
  for (const id of meshIds) for (const mesh of meshesOfNode(scene.objectsById.get(id))) meshes.push({ mesh, nodeId: id });
  const glass = meshes.filter(({ mesh }) => isGlass((Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as Material | undefined));
  if (glass.length) {
    // tout ce qui est dessiné cache une vitre, y compris les autres vitres (celles du fond ne sont pas marquées)
    const occluders = meshes.map((m) => m.mesh);
    for (const m of occluders) {
      const g = m.geometry as BufferGeometry & { boundsTree?: unknown };
      if (!g.boundsTree) computeBoundsTree.call(g);
    }
    const ray = new Raycaster();
    (ray as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    const origin = new Vector3();
    const dir = new Vector3(...basis.toward);
    for (const { mesh, nodeId } of glass) {
      const item = scene.look.itemOf(nodeId);
      const cat = scene.look.categoryOf(item) ?? scene.look.categoryOf(nodeId);
      const key = cat && colors[cat] ? (`mark:${cat}` as const) : ('mark:VITRE' as const);
      for (const pts of glassPanes(mesh)) {
        const p = projectPane(pts, basis);
        const w = p.x1 - p.x0;
        const h = p.y1 - p.y0;
        if (Math.min(w, h) < MIN_PANE_MM || p.d1 - p.d0 > MAX_SLANT * Math.min(w, h)) continue;
        // visible si la majorité de 5 points de la vitre voit l'observateur sans obstacle
        let seen = 0;
        for (const [fx, fy] of [
          [0.5, 0.5],
          [0.25, 0.25],
          [0.75, 0.25],
          [0.25, 0.75],
          [0.75, 0.75],
        ]) {
          origin.set(...unprojectPoint(basis, p.x0 + fx * w, p.y0 + fy * h, p.d1 + 1));
          ray.set(origin, dir);
          if (!ray.intersectObjects(occluders, false).some((hit) => hit.object !== mesh)) seen++;
        }
        if (seen < 3) continue;
        for (const seg of glassHatch(p.x0, p.y0, p.x1, p.y1)) add(key, seg, item);
      }
    }
  }
  // portes et murs : leurs traits visibles repris dans leur couleur de légende
  for (const layer of lw.layers) {
    if (layer.key !== 'silhouette' && layer.key !== 'visible' && layer.key !== 'fine') continue;
    layer.polylines.forEach((pl, i) => {
      const id = layer.sourceNodeIds?.[i];
      const cat = id ? scene.look.categoryOf(id) : null;
      if (id && cat && colors[cat] && (cat.startsWith('PORTE') || cat.startsWith('MUR'))) add(`mark:${cat}`, pl, id);
    });
  }
  return [...layers.values()];
}
