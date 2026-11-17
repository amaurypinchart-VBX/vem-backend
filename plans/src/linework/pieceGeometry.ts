// « 📏 Coter une pièce » côté maquette 3D : les traits d'une vue ne disent que l'objet posé (« Ossature bois » entier),
// pas chaque bois — l'emprise de chaque pièce dans le dessin vient donc de ses triangles, projetés dans la base de la
// vue après les coupes de la vue (vue spéciale : coupes, boîte, éléments retirés ; vue du sol : coupe horizontale).
import { Vector3 } from 'three';
import type { BufferGeometry } from 'three';
import type { Vec3, ViewBasis } from '../core/views';
import { dot } from '../core/views';
import type { ClipPlane } from '../core/customViews/cuts';
import { resolveCuts } from '../core/customViews/cuts';
import type { CustomViewSpec, ViewTagRule } from '../core/customViews/types';
import { makePathIndex } from '../core/customViews/paths';
import { makeTagResolver } from '../core/customViews/tags';
import { meshesByState, resolveVisibility, scopeModules } from '../core/customViews/visibility';
import type { ModuleRefs } from '../core/customViews/refs';
import { moduleRefs } from '../core/customViews/refs';
import { floorCutPlanes } from '../core/subsetHide';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode } from '../scene/loadedScene';
import type { ViewportItem } from '../sheets/types';
import type { Box2 } from '../sheets/pieceDims';
import { subsetEnv, subsetMeshes } from './subset';

/** Maillages dessinés dans une fenêtre de vue et plans de coupe de chacun (n·p ≥ d gardé). */
export interface ViewMeshes {
  meshes: string[];
  planes: ReadonlyMap<string, ClipPlane[]>;
}

/**
 * Maillages d'une fenêtre : vue standard = son sous-ensemble (+ coupe « vue du sol ») ; vue spéciale = éléments
 * visibles de la vue (règles), coupes et boîte, limités aux Viewbox du bloc posé (« m:VBX-03 »).
 */
export function viewMeshes(scene: LoadedScene, vp: ViewportItem, spec?: CustomViewSpec, viewTags: ViewTagRule[] = []): ViewMeshes {
  const drawable = (id: string) => meshesOfNode(scene.objectsById.get(id)).length > 0;
  if (vp.custom && spec) {
    const { index, look, frames } = scene;
    const tags = makeTagResolver(index, viewTags);
    const vis = resolveVisibility({ index, look, paths: makePathIndex(index), tags }, spec);
    const modules = scopeModules(index, spec.scope);
    const refs = new Map<string, ModuleRefs>();
    for (const m of modules) {
      const f = frames.get(m);
      if (f) refs.set(m, moduleRefs(index, look, tags, f));
    }
    let meshes = meshesByState(index, vis.states).visible.filter(drawable);
    const block = vp.custom.block.startsWith('m:') ? vp.custom.block.slice(2) : null;
    if (block) meshes = meshes.filter((id) => look.byId.get(id)?.moduleId === block);
    const cuts = resolveCuts({ index, look, frames, refs, modules }, spec, meshes);
    return { meshes, planes: cuts.byNode };
  }
  const meshes = subsetMeshes(scene, vp.request.subset).filter(drawable);
  if (vp.request.floorCut == null) return { meshes, planes: new Map() };
  const env = subsetEnv(scene);
  return { meshes, planes: floorCutPlanes({ index: scene.index, look: scene.look, tags: env.tags, frames: scene.frames }, meshes, vp.request.floorCut).byNode };
}

/** Polygone 3D coupé par un plan (côté gardé n·p ≥ d), Sutherland–Hodgman. */
function clipPoly(poly: Vec3[], pl: ClipPlane): Vec3[] {
  const out: Vec3[] = [];
  const side = (p: Vec3) => pl.n[0] * p[0] + pl.n[1] * p[1] + pl.n[2] * p[2] - pl.d;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if (sa >= 0 !== sb >= 0) {
      const t = sa / (sa - sb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/** Triangles d'un maillage dans le monde, coupés par ses plans, projetés dans la vue : [x, y, profondeur] par sommet. */
function projectedPolys(scene: LoadedScene, meshId: string, basis: ViewBasis, planes: ClipPlane[] | undefined, each: (poly: Array<[number, number, number]>) => void): void {
  const obj = scene.objectsById.get(meshId);
  if (!obj) return;
  obj.updateWorldMatrix(true, true);
  const v = new Vector3();
  for (const mesh of meshesOfNode(obj)) {
    const g = mesh.geometry as BufferGeometry;
    const pos = g.attributes.position;
    if (!pos) continue;
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    const world = (i: number): Vec3 => {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      return [v.x, v.y, v.z];
    };
    for (let k = 0; k + 2 < n; k += 3) {
      let poly: Vec3[] = [world(k), world(k + 1), world(k + 2)];
      for (const pl of planes ?? []) {
        poly = clipPoly(poly, pl);
        if (poly.length < 3) break;
      }
      if (poly.length < 3) continue;
      each(poly.map((p) => [dot(basis.right, p), dot(basis.up, p), dot(basis.toward, p)]));
    }
  }
}

/** Emprise d'un maillage dans le dessin (après coupes) ; null = rien ne reste. */
export function meshBox(scene: LoadedScene, meshId: string, basis: ViewBasis, planes?: ClipPlane[]): Box2 | null {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  projectedPolys(scene, meshId, basis, planes, (poly) => {
    for (const [x, y] of poly) {
      if (x < b.x0) b.x0 = x;
      if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y;
      if (y > b.y1) b.y1 = y;
    }
  });
  return Number.isFinite(b.x0) ? b : null;
}

function inTri(x: number, y: number, a: number[], b: number[], c: number[]): number | null {
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(d) < 1e-9) return null;
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d;
  const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d;
  const l3 = 1 - l1 - l2;
  if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) return null;
  return l1 * a[2] + l2 * b[2] + l3 * c[2];
}

function distSeg(x: number, y: number, a: number[], b: number[]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2)) : 0;
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

/**
 * Maillage sous le point (x, y) du dessin : le plus proche de l'observateur parmi ceux dont une face (après coupes)
 * couvre le point ; sinon celui dont une arête passe à moins de `tol`.
 */
export function meshAt(scene: LoadedScene, meshIds: string[], basis: ViewBasis, planes: ReadonlyMap<string, ClipPlane[]>, x: number, y: number, tol: number, boxes?: (id: string) => Box2 | null): string | null {
  let best: string | null = null;
  let bestDepth = -Infinity;
  let near: string | null = null;
  let nearD = tol;
  for (const id of meshIds) {
    const b = boxes?.(id);
    if (boxes && (!b || x < b.x0 - tol || x > b.x1 + tol || y < b.y0 - tol || y > b.y1 + tol)) continue;
    projectedPolys(scene, id, basis, planes.get(id), (poly) => {
      for (let i = 1; i + 1 < poly.length; i++) {
        const z = inTri(x, y, poly[0], poly[i], poly[i + 1]);
        if (z !== null && z > bestDepth) {
          bestDepth = z;
          best = id;
        }
      }
      if (best) return;
      for (let i = 0; i < poly.length; i++) {
        const dd = distSeg(x, y, poly[i], poly[(i + 1) % poly.length]);
        if (dd < nearD) {
          nearD = dd;
          near = id;
        }
      }
    });
  }
  return best ?? near;
}
