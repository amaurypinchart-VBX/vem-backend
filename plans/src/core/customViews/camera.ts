// Caméra d'une vue spéciale → vue du moteur 2D (base directe, mêmes axes que core/views.ts) + transformation 2D
// appliquée après le retrait des lignes cachées (plan de plafond réfléchi, miroir, rotation : pas de recalcul, cache
// partagé). La base « affichée » (droite, haut) intègre cette transformation : cotes et repères restent exacts.
import type { ModuleFrame, Vec3, ViewBasis, ViewKind, ViewSpec } from '../views';
import { cross, frontVector, neg, normalize, viewBasis } from '../views';
import type { IsoCorner, ViewCamera } from './types';

/** x' = a·x + b·y ; y' = c·x + d·y (dessin, mm modèle). */
export interface Affine2D {
  a: number;
  b: number;
  c: number;
  d: number;
}

export const IDENTITY_2D: Affine2D = { a: 1, b: 0, c: 0, d: 1 };

export function compose(second: Affine2D, first: Affine2D): Affine2D {
  return {
    a: second.a * first.a + second.b * first.c,
    b: second.a * first.b + second.b * first.d,
    c: second.c * first.a + second.d * first.c,
    d: second.c * first.b + second.d * first.d,
  };
}

export function apply2D(t: Affine2D, x: number, y: number): [number, number] {
  return [t.a * x + t.b * y, t.c * x + t.d * y];
}

export const isIdentity2D = (t: Affine2D) => t.a === 1 && t.b === 0 && t.c === 0 && t.d === 1;

const MIRROR_X: Affine2D = { a: -1, b: 0, c: 0, d: 1 };
const MIRROR_Y: Affine2D = { a: 1, b: 0, c: 0, d: -1 };

/** Rotation dans la feuille, sens horaire (valeurs exactes pour 90 / 180 / 270). */
export function rotation2D(deg: number): Affine2D {
  const k = ((Math.round(deg / 90) % 4) + 4) % 4;
  const cs = [1, 0, -1, 0][k];
  const sn = [0, 1, 0, -1][k];
  return { a: cs, b: sn, c: -sn, d: cs };
}

export interface CameraView {
  /** vue calculée par le moteur 2D (base directe) */
  view: ViewSpec;
  /** transformation du dessin après calcul */
  transform: Affine2D;
  /** base affichée : point 3D → point du dessin final (cotes associatives, repères) */
  basis: ViewBasis;
  /** orientation dite sous le titre (conventions de dessin) */
  subtitle: string;
  /** titre court de la direction */
  title: string;
}

const WORLD_UP: Vec3 = [0, 1, 0];

const DIR_TITLES: Record<ViewKind, string> = {
  top: 'Vue de dessus',
  bottom: 'Vue de dessous',
  front: 'Vue avant',
  back: 'Vue arrière',
  left: 'Vue gauche',
  right: 'Vue droite',
};

/** Direction de regard d'une vue iso (observateur au coin indiqué, au-dessus ou en dessous). */
export function isoDirection(F: Vec3, R: Vec3, corner: IsoCorner, below: boolean): Vec3 {
  const sf = corner[0] === 'f' ? 1 : -1;
  const sr = corner[1] === 'r' ? 1 : -1;
  const pos: Vec3 = [sf * F[0] + sr * R[0], (below ? -1 : 1) + sf * F[1] + sr * R[1], sf * F[2] + sr * R[2]];
  return normalize(neg(pos));
}

/** Base d'une vue après transformation 2D. */
export function transformBasis(b: ViewBasis, t: Affine2D): ViewBasis {
  const lin = (p: number, q: number): Vec3 => [p * b.right[0] + q * b.up[0], p * b.right[1] + q * b.up[1], p * b.right[2] + q * b.up[2]];
  return { right: lin(t.a, t.b), up: lin(t.c, t.d), toward: b.toward };
}

/**
 * Vue du moteur + transformation pour une caméra. `moduleId` = Viewbox de référence d'une caméra « repère module »
 * (chaque bloc de la disposition « chaque Viewbox » passe la sienne).
 */
export function cameraView(cam: ViewCamera, frames: ReadonlyMap<string, ModuleFrame>, moduleId?: string): CameraView {
  const frame = cam.frame === 'module' && moduleId ? frames.get(moduleId) : undefined;
  const F: Vec3 = frame ? frontVector(frame) : [0, 0, 1];
  const R: Vec3 = cross(WORLD_UP, F);
  let view: ViewSpec;
  let title: string;
  if (cam.dir === 'iso' || cam.dir === 'iso-below') {
    const below = cam.dir === 'iso-below';
    view = { kind: 'custom', direction: isoDirection(F, R, cam.isoCorner ?? 'fl', below), up: WORLD_UP };
    title = below ? 'Vue iso de dessous' : 'Vue iso';
  } else if (cam.dir === 'custom') {
    const c = cam.custom ?? { dir: [0, -1, 0] as Vec3, up: [0, 0, -1] as Vec3 };
    view = { kind: 'custom', direction: normalize(c.dir), up: c.up };
    title = 'Vue';
  } else {
    view = { kind: cam.dir, frame: frame ? { moduleId: frame.moduleId } : 'world' };
    title = DIR_TITLES[cam.dir];
  }
  let t = IDENTITY_2D;
  let subtitle = '';
  if (cam.dir === 'bottom') {
    if (cam.reflected) {
      // superposable au plan de dessus : même droite / même haut que la vue de dessus
      t = view.kind !== 'custom' && typeof view.frame === 'object' ? MIRROR_Y : MIRROR_X;
      title = 'Plan de plafond réfléchi';
      subtitle = 'Plan de plafond réfléchi (même orientation que le plan)';
    } else subtitle = 'Vue de dessous (miroir du plan)';
  }
  if (cam.mirror) {
    t = compose(MIRROR_X, t);
    subtitle = subtitle ? `${subtitle}, retournée` : 'Vue retournée (miroir)';
  }
  if (cam.rotate) t = compose(rotation2D(cam.rotate), t);
  const base = viewBasis(view, frames);
  return { view, transform: t, basis: transformBasis(base, t), subtitle, title };
}
