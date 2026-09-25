// Captures 3D pour les planches, sans passer par l'onglet Vue 3D : un viewer invisible rend les vues demandées
// (sous-ensemble, vue iso, perspective ou axonométrie) puis se ferme.
import type { LoadedScene } from '../scene/loadedScene';
import type { GlassTest } from '../linework/packets';
import type { IsoKind, Projection } from './SceneViewer';
import { SceneViewer } from './SceneViewer';

export interface OffscreenShot {
  include: string[];
  hideCategories: string[];
  view: IsoKind;
  projection: Projection;
  /** proportions du cadre de la planche (largeur / hauteur) */
  aspect: number;
}

export interface OffscreenResult {
  blob: Blob;
  width: number;
  height: number;
}

/** Rend plusieurs captures avec un seul viewer caché (fond transparent, recadrées, marge 2 %). */
export async function captureOffscreen(
  scene: LoadedScene,
  glassTest: GlassTest,
  shots: OffscreenShot[],
  size = 2400,
  onEach?: (i: number, r: OffscreenResult) => Promise<void> | void,
): Promise<OffscreenResult[]> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;pointer-events:none;';
  document.body.appendChild(host);
  const viewer = new SceneViewer(host, scene, glassTest);
  viewer.setFrontMarkers(false);
  const results: OffscreenResult[] = [];
  try {
    for (let i = 0; i < shots.length; i++) {
      const s = shots[i];
      host.style.width = `${Math.round(900 * s.aspect)}px`;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      viewer.setVisibility(s.include, s.hideCategories, false);
      const pose = viewer.poseFor(s.view, undefined, s.aspect, 1.02, s.projection);
      const r = await viewer.capture({ size, background: 'transparent', marginPct: 2, pose });
      results.push(r);
      await onEach?.(i, r);
    }
  } finally {
    viewer.dispose();
    host.remove();
  }
  return results;
}
