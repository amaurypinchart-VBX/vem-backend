// Repères de vue : Dessus / Dessous / Avant / Arrière / Gauche / Droite, dans le repère du monde (vues standard
// SketchUp) ou dans celui d'une Viewbox (comme TOP_RELATIVE_VIEW de LayOut : un module tourné donne des vues propres).
// Fonctions pures. Repère monde interne : mm, Y vers le haut (SketchUp X = X, SketchUp Y = −Z, SketchUp Z = Y).

export type Vec3 = [number, number, number];
export type ViewKind = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';
export type ViewSpec =
  | { kind: ViewKind; frame: 'world' | { moduleId: string } }
  | { kind: 'custom'; direction: Vec3; up: Vec3 };

/** Face avant d'une Viewbox, exprimée dans son repère local SketchUp. */
export type FrontSide = '+x' | '-x' | '+y' | '-y';

export interface ModuleFrame {
  moduleId: string;
  /** origine du repère local, en coordonnées monde (mm) */
  origin: Vec3;
  /** axes locaux X, Y (horizontaux) et vertical, unitaires, en coordonnées monde */
  xAxis: Vec3;
  yAxis: Vec3;
  up: Vec3;
  /** boîte de la Viewbox dans son repère (x, y, hauteur), pieds exclus */
  min: Vec3;
  max: Vec3;
  longAxis: 'x' | 'y';
  front: FrontSide;
  frontSource: 'default' | 'manual';
}

/** Base d'une vue : `right` et `up` = axes du dessin, `toward` = vers l'observateur (opposé à la direction de regard). */
export interface ViewBasis {
  right: Vec3;
  up: Vec3;
  toward: Vec3;
}

export const VIEW_LABELS: Record<ViewKind, string> = {
  top: 'Dessus',
  bottom: 'Dessous',
  front: 'Avant',
  back: 'Arrière',
  left: 'Gauche',
  right: 'Droite',
};

export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const scale3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
export function normalize(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]);
  if (l < 1e-12) throw new Error('Vecteur nul');
  return [a[0] / l, a[1] / l, a[2] / l];
}

const WORLD_UP: Vec3 = [0, 1, 0];
const NORTH: Vec3 = [0, 0, -1]; // SketchUp +Y

/** Axes d'un repère local à partir de sa matrice monde (16 nombres, ordre colonne de three.js). */
export function frameAxesFromMatrix(e: ArrayLike<number>): { xAxis: Vec3; yAxis: Vec3; up: Vec3; origin: Vec3 } {
  const cols: Vec3[] = [
    [e[0], e[1], e[2]],
    [e[4], e[5], e[6]],
    [e[8], e[9], e[10]],
  ].map((c) => normalize(c as Vec3));
  // l'axe local le plus aligné avec la verticale du monde (normalement Z SketchUp) devient l'axe vertical
  let upIdx = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(cols[i][1]) > Math.abs(cols[upIdx][1])) upIdx = i;
  const plan = [0, 1, 2].filter((i) => i !== upIdx);
  const c = cols[plan[0]];
  const xAxis = normalize([c[0], 0, c[2]]);
  // repère direct vu de dessus (x × y = haut), y orthogonal à x même si la matrice est cisaillée ou miroir
  const yAxis = normalize(cross(WORLD_UP, xAxis));
  return { xAxis, yAxis, up: WORLD_UP, origin: [e[12], e[13], e[14]] };
}

export function defaultFront(longAxis: 'x' | 'y'): FrontSide {
  return longAxis === 'x' ? '+x' : '+y';
}

export function makeModuleFrame(
  moduleId: string,
  axes: { xAxis: Vec3; yAxis: Vec3; up: Vec3; origin: Vec3 },
  min: Vec3,
  max: Vec3,
  front?: FrontSide | null,
): ModuleFrame {
  const longAxis = max[0] - min[0] >= max[1] - min[1] ? 'x' : 'y';
  return {
    moduleId,
    ...axes,
    min,
    max,
    longAxis,
    front: front ?? defaultFront(longAxis),
    frontSource: front ? 'manual' : 'default',
  };
}

/** Direction monde de la face avant (normale sortante). */
export function frontVector(f: ModuleFrame): Vec3 {
  const axis = f.front[1] === 'x' ? f.xAxis : f.yAxis;
  return f.front[0] === '-' ? neg(axis) : axis;
}

/** Face (±x / ±y locale) la plus proche d'une normale monde : « clic sur une face → définir comme Avant ». */
export function frontFromNormal(f: ModuleFrame, normal: Vec3): FrontSide {
  const dx = dot(normal, f.xAxis);
  const dy = dot(normal, f.yAxis);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? '+x' : '-x';
  return dy >= 0 ? '+y' : '-y';
}

function basisFrom(toward: Vec3, right: Vec3): ViewBasis {
  const t = normalize(toward);
  const r = normalize(right);
  return { right: r, toward: t, up: normalize(cross(t, r)) };
}

/**
 * Base d'une vue. Monde = vues standard SketchUp (Avant = regard vers +Y SketchUp, Dessus = nord en haut).
 * Viewbox : Avant/Arrière = petits côtés (face avant réglable), Gauche/Droite = grands côtés vus depuis l'avant ;
 * le dessus est tracé avant à droite, grand côté horizontal, aligné avec la vue Gauche (projection américaine).
 */
export function viewBasis(spec: ViewSpec, frames?: ReadonlyMap<string, ModuleFrame>): ViewBasis {
  if (spec.kind === 'custom') {
    const toward = neg(normalize(spec.direction));
    let right = cross(spec.up, toward);
    if (Math.hypot(...right) < 1e-9) right = cross(NORTH, toward);
    return basisFrom(toward, right);
  }
  const U = WORLD_UP;
  if (spec.frame === 'world') {
    switch (spec.kind) {
      case 'top':
        return { right: [1, 0, 0], up: NORTH, toward: U };
      case 'bottom':
        return { right: [-1, 0, 0], up: NORTH, toward: [0, -1, 0] };
      case 'front':
        return { right: [1, 0, 0], up: U, toward: [0, 0, 1] };
      case 'back':
        return { right: [-1, 0, 0], up: U, toward: [0, 0, -1] };
      case 'left':
        return { right: [0, 0, 1], up: U, toward: [-1, 0, 0] };
      case 'right':
        return { right: [0, 0, -1], up: U, toward: [1, 0, 0] };
    }
  }
  const frame = frames?.get(spec.frame.moduleId);
  if (!frame) throw new Error(`Repère de la Viewbox ${spec.frame.moduleId} introuvable`);
  const F = frontVector(frame);
  const rFront = cross(U, F); // droite de l'observateur qui regarde la face avant
  switch (spec.kind) {
    case 'front':
      return basisFrom(F, rFront);
    case 'back':
      return basisFrom(neg(F), neg(rFront));
    case 'left':
      return basisFrom(neg(rFront), F);
    case 'right':
      return basisFrom(rFront, neg(F));
    case 'top':
      return { right: F, up: rFront, toward: U };
    case 'bottom':
      return { right: F, up: neg(rFront), toward: [0, -1, 0] };
  }
}

/**
 * Matrice monde → espace de projection (3 × 3, lignes) : X = droite du dessin, Y = vers l'observateur
 * (three-edge-projection projette le long de Y, ce qui est plus haut cache ce qui est plus bas), Z = droite × Y.
 * Un point de l'espace de projection (X, Y, Z) se trouve au point du dessin (X, −Z).
 */
export function viewRows(b: ViewBasis): [Vec3, Vec3, Vec3] {
  return [b.right, b.toward, cross(b.right, b.toward)];
}

/** Point monde → point du dessin (mm modèle), et profondeur (plus grand = plus près de l'observateur). */
export function projectPoint(b: ViewBasis, p: Vec3): { x: number; y: number; depth: number } {
  return { x: dot(b.right, p), y: dot(b.up, p), depth: dot(b.toward, p) };
}

/** Point du dessin + profondeur → point monde (cotes associatives). */
export function unprojectPoint(b: ViewBasis, x: number, y: number, depth: number): Vec3 {
  return [
    b.right[0] * x + b.up[0] * y + b.toward[0] * depth,
    b.right[1] * x + b.up[1] * y + b.toward[1] * depth,
    b.right[2] * x + b.up[2] * y + b.toward[2] * depth,
  ];
}

export function viewKey(spec: ViewSpec, frames?: ReadonlyMap<string, ModuleFrame>): string {
  if (spec.kind === 'custom') return `custom:${spec.direction.map((v) => v.toFixed(6)).join(',')}:${spec.up.map((v) => v.toFixed(6)).join(',')}`;
  if (spec.frame === 'world') return `world:${spec.kind}`;
  const f = frames?.get(spec.frame.moduleId);
  // la face avant et l'orientation de la Viewbox changent la vue : elles font partie de la clé
  const axes = f ? `${f.front}:${f.xAxis.map((v) => v.toFixed(6)).join(',')}` : '?';
  return `module:${spec.frame.moduleId}:${spec.kind}:${axes}`;
}
