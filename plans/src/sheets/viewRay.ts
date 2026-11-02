// Clic sur une vue de planche → pièce 3D sous le point : rayon dans la direction de la vue, sur les maillages dessinés
// (catégories et éléments masqués exclus). « Vue du sol » : ce qui est au-dessus de la coupe est ignoré (le rayon
// traverse la toiture et le plafond retirés par la coupe).
import { Raycaster, Vector3 } from 'three';
import type { Intersection, Object3D } from 'three';
import type { ViewBasis } from '../core/views';
import { unprojectPoint } from '../core/views';
import { floorCutPlanes } from '../core/subsetHide';
import type { LoadedScene } from '../scene/loadedScene';
import { meshesOfNode, nodeIdOf } from '../scene/loadedScene';
import { subsetEnv, subsetMeshes } from '../linework/subset';
import type { ViewportItem } from './types';

/** Objets three.js dessinés dans une fenêtre de vue. */
export function viewportObjects(scene: LoadedScene, vp: ViewportItem): Object3D[] {
  return subsetMeshes(scene, vp.request.subset).flatMap((id) => meshesOfNode(scene.objectsById.get(id)));
}

/** Premier impact d'un rayon lancé vers le point (x, y) du dessin (mm modèle), du côté de l'observateur. */
export function castInView(scene: LoadedScene, vp: ViewportItem, basis: ViewBasis, x: number, y: number, objects: Object3D[], raycaster = new Raycaster()): Intersection | undefined {
  raycaster.set(new Vector3(...unprojectPoint(basis, x, y, 1e7)), new Vector3(...basis.toward).negate());
  const cut = vp.request.floorCut;
  (raycaster as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = cut == null;
  const hits = raycaster.intersectObjects(objects, false);
  if (cut == null) return hits[0];
  const ids = [...new Set(hits.map((h) => nodeIdOf(h.object)).filter((id): id is string => !!id))];
  if (!ids.length) return undefined;
  const { byNode } = floorCutPlanes({ ...scene, tags: subsetEnv(scene).tags }, ids, cut);
  return hits.find((h) => {
    const id = nodeIdOf(h.object);
    const planes = id ? byNode.get(id) : undefined;
    return !planes || planes.every((p) => p.n[0] * h.point.x + p.n[1] * h.point.y + p.n[2] * h.point.z >= p.d - 1);
  });
}
