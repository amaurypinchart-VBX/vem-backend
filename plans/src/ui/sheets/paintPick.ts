// Clic sur une vue 2D → face 3D sous le point : rayon dans la direction de la vue sur les pièces dessinées ; au doigt,
// 8 rayons de plus sur un cercle si le premier ne touche rien. Repère propre de la pièce → sélecteur de face.
import { Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import { unprojectPoint } from '../../core/views';
import { resolveMeshes } from '../../core/subset';
import type { LoadedScene } from '../../scene/loadedScene';
import { meshesOfNode, nodeIdOf } from '../../scene/loadedScene';
import type { PointMm, ViewportItem } from '../../sheets/types';
import type { ViewportData } from '../../sheets/SheetSvg';
import { viewportTransform } from '../../sheets/scales';
import type { FaceSelector, Vec3 } from '../../core/paint/types';
import { DEFAULT_CREASE_DEG } from '../../core/paint/types';
import { faceSelector, seedTriangle } from '../../core/paint/region';
import { nodeSoup, toLocalPoint } from '../../linework/paintScene';

export interface FacePick {
  nodeId: string;
  /** point touché (monde, mm) */
  point: Vec3;
  face: FaceSelector;
  /** triangle de la pièce sous le point (pipette, gomme) */
  triangle: number;
}

const raycaster = new Raycaster();

export function pickFace(scene: LoadedScene, vp: ViewportItem, data: ViewportData | undefined, p: PointMm, tolPaperMm: number): FacePick | null {
  if (!data?.lw || !data.basis || !vp.scale || vp.custom) return null;
  const b = data.lw.boundsMm;
  const center = (vp.center ?? [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2]) as [number, number];
  const tr = viewportTransform(vp.rect, vp.scale, center);
  const meshes: Object3D[] = resolveMeshes(scene.index, scene.look, vp.request.subset.include, vp.request.subset.hideCategories, vp.request.subset.onlyCategories).flatMap((id) =>
    meshesOfNode(scene.objectsById.get(id)),
  );
  const toward = new Vector3(...data.basis.toward);
  const cast = (q: PointMm) => {
    const [x, y] = tr.toModel(q.x, q.y);
    raycaster.set(new Vector3(...unprojectPoint(data.basis!, x, y, 1e7)), toward.clone().negate());
    (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    return raycaster.intersectObjects(meshes, false)[0];
  };
  let hit = cast(p);
  for (let i = 0; !hit && i < 8; i++) {
    const a = (i * Math.PI) / 4;
    hit = cast({ x: p.x + Math.cos(a) * tolPaperMm, y: p.y + Math.sin(a) * tolPaperMm });
  }
  if (!hit) return null;
  const nodeId = nodeIdOf(hit.object);
  if (!nodeId) return null;
  const ns = nodeSoup(scene, nodeId);
  if (!ns) return null;
  const point: Vec3 = [hit.point.x, hit.point.y, hit.point.z];
  const local = toLocalPoint(ns, point);
  const face = faceSelector(ns.soup, local, DEFAULT_CREASE_DEG);
  if (!face) return null;
  return { nodeId, point, face, triangle: seedTriangle(ns.soup, local) };
}
