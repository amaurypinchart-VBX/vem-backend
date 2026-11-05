// Correctif de clipper2-js 0.9.0 (portage JavaScript de Clipper2), chargé avant toute utilisation de la bibliothèque.
//
// En C#, Point64 est une valeur (copiée à chaque affectation). Le portage JS en fait un objet partagé :
// `InternalClipper.getIntersectPt` rend, quand l'intersection tombe au bout d'un segment, le point d'extrémité LUI-MÊME
// (sommet du contour d'entrée), et `addNewIntersectNode` le déplace ensuite (`ip.y = topY; ip.x = …`). Le contour d'entrée
// est alors modifié pendant le calcul : un triangle devient plat, et `getCurrYMaximaVertex` tourne sans fin autour de lui
// (Xiaomi, 05.11.2026 : repères de peinture de l'élévation de toute l'installation, l'onglet figé puis fermé). C'est aussi
// l'origine des morceaux de faces perdus déjà contournés (résultats copiés par `owned`, unions deux à deux).
//
// Correctif : ces fonctions rendent une copie du point, et les boucles qui suivent un contour à la même hauteur s'arrêtent
// (exception, rattrapée par les appelants) si elles en font le tour au lieu de tourner sans fin.
import { InternalClipper, ClipperBase, Point64 } from 'clipper2-js';

type Pt = { x: number; y: number };
type Hit = { ip: Pt; success: boolean };
type Vtx = { pt: Pt; next: Vtx; prev: Vtx; flags: number };
type Edge = { vertexTop: Vtx; windDx: number };

export class ClipperLoopError extends Error {
  constructor() {
    super('clipper2-js : contour plat, calcul interrompu');
  }
}

const IC = InternalClipper as unknown as Record<string, (...a: Pt[]) => Hit> & { __vemFixed?: boolean };
const CB = ClipperBase as unknown as {
  getCurrYMaximaVertex: (ae: Edge) => Vtx | undefined;
  isMaxima: (v: Vtx) => boolean;
};

if (!IC.__vemFixed) {
  IC.__vemFixed = true;
  for (const name of ['getIntersectPt', 'getIntersectPoint']) {
    const orig = IC[name];
    if (typeof orig !== 'function') continue;
    IC[name] = function (a: Pt, b: Pt, c: Pt, d: Pt): Hit {
      const r = orig.call(this, a, b, c, d);
      if (r.ip === a || r.ip === b || r.ip === c || r.ip === d) r.ip = new Point64(r.ip.x, r.ip.y);
      return r;
    };
  }
  const closest = (IC as unknown as Record<string, (o: Pt, s1: Pt, s2: Pt) => Pt>).getClosestPtOnSegment;
  if (typeof closest === 'function')
    (IC as unknown as Record<string, (o: Pt, s1: Pt, s2: Pt) => Pt>).getClosestPtOnSegment = function (o: Pt, s1: Pt, s2: Pt): Pt {
      const r = closest.call(this, o, s1, s2);
      return r === s1 || r === s2 ? new Point64(r.x, r.y) : r;
    };
  CB.getCurrYMaximaVertex = (ae: Edge): Vtx | undefined => {
    const start = ae.vertexTop;
    let result = start;
    if (ae.windDx > 0) {
      while (result.next.pt.y === result.pt.y) {
        result = result.next;
        if (result === start) throw new ClipperLoopError();
      }
    } else {
      while (result.prev.pt.y === result.pt.y) {
        result = result.prev;
        if (result === start) throw new ClipperLoopError();
      }
    }
    return CB.isMaxima(result) ? result : undefined;
  };
}

export const CLIPPER_FIXED = true;
