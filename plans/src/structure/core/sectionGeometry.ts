// Propriétés de sections laminées décrites par leur contour (polygone, congés en arcs) : UPN à ailes inclinées
// (DIN 1026-1), poutrelles I / H à ailes parallèles avec congés, cornières, T, U marchands. Aire, centre de gravité,
// inerties (axes principaux pour les sections non symétriques), modules élastiques aux fibres extrêmes, modules
// plastiques (axe neutre plastique par découpe du polygone), torsion et gauchissement par les formules des parois
// minces (prudentes : sans le renfort des congés). Sert au catalogue des sections du commerce, dont les fiches ne
// donnent que les dimensions (et parfois A, Iy, Wel,y, recoupés par les tests). Fonctions pures ; mm.
import type { SectionProps } from './catalog';

export type Pt = [number, number];

/** Aire, moments statiques et d'inertie d'un polygone (sens trigonométrique), autour de l'origine. */
function rawMoments(p: Pt[]) {
  let A = 0;
  let Sy = 0;
  let Sz = 0;
  let Iyy = 0;
  let Izz = 0;
  let Iyz = 0;
  for (let i = 0; i < p.length; i++) {
    const [y0, z0] = p[i];
    const [y1, z1] = p[(i + 1) % p.length];
    const c = y0 * z1 - y1 * z0;
    A += c / 2;
    Sy += ((y0 + y1) * c) / 6;
    Sz += ((z0 + z1) * c) / 6;
    // Iyy = ∫ z² (flexion autour de y), Izz = ∫ y²
    Iyy += ((z0 * z0 + z0 * z1 + z1 * z1) * c) / 12;
    Izz += ((y0 * y0 + y0 * y1 + y1 * y1) * c) / 12;
    Iyz += ((y0 * z1 + 2 * y0 * z0 + 2 * y1 * z1 + y1 * z0) * c) / 24;
  }
  return { A, Sy, Sz, Iyy, Izz, Iyz };
}

/** Partie du polygone du côté `keep` de la droite coord(axis) = c (Sutherland-Hodgman, valable pour un polygone concave). */
function clip(p: Pt[], axis: 0 | 1, c: number, keep: 1 | -1): Pt[] {
  const out: Pt[] = [];
  const inside = (q: Pt) => keep * (q[axis] - c) >= 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const ia = inside(a);
    const ib = inside(b);
    if (ia) out.push(a);
    if (ia !== ib) {
      const t = (c - a[axis]) / (b[axis] - a[axis]);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

const areaOf = (p: Pt[]) => (p.length < 3 ? 0 : rawMoments(p).A);

/** Module plastique autour de l'axe ⟂ à `axis` (axis = 1 : fibres en z, flexion autour de y). */
function plasticModulus(p: Pt[], axis: 0 | 1): number {
  const A = areaOf(p);
  const vals = p.map((q) => q[axis]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (areaOf(clip(p, axis, mid, 1)) > A / 2) lo = mid;
    else hi = mid;
  }
  const c = (lo + hi) / 2;
  const first = (q: Pt[]) => {
    if (q.length < 3) return 0;
    const m = rawMoments(q);
    return Math.abs((axis === 1 ? m.Sz : m.Sy) - c * m.A);
  };
  return first(clip(p, axis, c, 1)) + first(clip(p, axis, c, -1));
}

export interface PolygonProps extends Omit<SectionProps, 'It' | 'Iw'> {
  /** centre de gravité dans le repère du contour */
  yc: number;
  zc: number;
  /** angle des axes principaux (rad) par rapport aux axes du contour ; 0 pour une section symétrique */
  theta: number;
}

/**
 * Propriétés d'un contour fermé. `principal` : axes principaux (y = axe fort, z = axe faible), sinon les axes du
 * contour (sections symétriques : identiques).
 */
export function polygonProps(contour: Pt[], principal = false): PolygonProps {
  let p = contour;
  if (rawMoments(p).A < 0) p = [...p].reverse();
  const m = rawMoments(p);
  const yc = m.Sy / m.A;
  const zc = m.Sz / m.A;
  let q: Pt[] = p.map(([y, z]) => [y - yc, z - zc]);
  let c = rawMoments(q);
  let theta = 0;
  if (principal && Math.abs(c.Iyz) > 1e-9 * (c.Iyy + c.Izz)) {
    theta = 0.5 * Math.atan2(-2 * c.Iyz, c.Iyy - c.Izz);
    const [co, si] = [Math.cos(theta), Math.sin(theta)];
    q = q.map(([y, z]) => [y * co + z * si, -y * si + z * co]);
    c = rawMoments(q);
    // y = axe fort
    if (c.Izz > c.Iyy) {
      q = q.map(([y, z]) => [z, -y]);
      c = rawMoments(q);
      theta += Math.PI / 2;
    }
  }
  const zmax = Math.max(...q.map((x) => Math.abs(x[1])));
  const ymax = Math.max(...q.map((x) => Math.abs(x[0])));
  return { A: c.A, Iy: c.Iyy, Iz: c.Izz, Wely: c.Iyy / zmax, Welz: c.Izz / ymax, Wply: plasticModulus(q, 1), Wplz: plasticModulus(q, 0), yc, zc, theta };
}

/**
 * Remplace les sommets indiqués par un arc de rayon r tangent aux deux côtés (congé rentrant : matière ajoutée ;
 * arrondi saillant : matière retirée). `radii[i]` = rayon au sommet i (0 = angle vif).
 */
export function roundCorners(p: Pt[], radii: number[], n = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < p.length; i++) {
    const r = radii[i] ?? 0;
    const P = p[i];
    if (!(r > 0)) {
      out.push(P);
      continue;
    }
    const A = p[(i - 1 + p.length) % p.length];
    const B = p[(i + 1) % p.length];
    const u1 = norm([A[0] - P[0], A[1] - P[1]]);
    const u2 = norm([B[0] - P[0], B[1] - P[1]]);
    const cosPhi = u1[0] * u2[0] + u1[1] * u2[1];
    const phi = Math.acos(Math.max(-1, Math.min(1, cosPhi)));
    const d = r / Math.tan(phi / 2);
    const T1: Pt = [P[0] + u1[0] * d, P[1] + u1[1] * d];
    const T2: Pt = [P[0] + u2[0] * d, P[1] + u2[1] * d];
    const bis = norm([u1[0] + u2[0], u1[1] + u2[1]]);
    const hc = r / Math.sin(phi / 2);
    const C: Pt = [P[0] + bis[0] * hc, P[1] + bis[1] * hc];
    let a0 = Math.atan2(T1[1] - C[1], T1[0] - C[0]);
    let a1 = Math.atan2(T2[1] - C[1], T2[0] - C[0]);
    // arc court de T1 à T2
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    for (let k = 0; k <= n; k++) {
      const a = a0 + (da * k) / n;
      out.push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]);
    }
    a1 = a0 + da;
    void a1;
  }
  return out;
}

function norm(v: Pt): Pt {
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
}

// ─── contours des profils laminés (y horizontal, z vertical, axe fort = y) ───

/** Pente intérieure des ailes des UPN jusqu'à h = 300 mm (DIN 1026-1) : 8 %. */
export const UPN_SLOPE = 0.08;

/**
 * UPN (DIN 1026-1) : dos de l'âme en y = 0, ailes vers +y ; épaisseur d'aile tf mesurée à b / 2 du dos, pente 8 %,
 * congé r1 = tf à la racine, arrondi r2 = tf / 2 en bout d'aile (règles de la norme ; les catalogues ne donnent pas les
 * rayons). UPN 220 : A, Iy, Iz, Wel, Wpl à 0,5 % de l'annexe SCIA statico 24-0571.
 */
export function upnContour(h: number, b: number, tw: number, tf: number, opts: { r1?: number; r2?: number; slope?: number; ym?: number } = {}): Pt[] {
  const slope = opts.slope ?? UPN_SLOPE;
  const r1 = opts.r1 ?? tf;
  const r2 = opts.r2 ?? tf / 2;
  const ym = opts.ym ?? b / 2;
  const t = (y: number) => tf + slope * (ym - y);
  const H = h / 2;
  // sens trigonométrique depuis le bas du dos de l'âme
  const p: Pt[] = [
    [0, -H],
    [b, -H],
    [b, -H + t(b)],
    [tw, -H + t(tw)],
    [tw, H - t(tw)],
    [b, H - t(b)],
    [b, H],
    [0, H],
  ];
  return roundCorners(p, [0, 0, r2, r1, r1, r2, 0, 0]);
}

/** Poutrelle I / H à ailes parallèles (IPE, HEA, HEB, HEM) avec congés r à la racine de l'âme. */
export function iContour(h: number, b: number, tw: number, tf: number, r: number): Pt[] {
  const H = h / 2;
  const B = b / 2;
  const w = tw / 2;
  const p: Pt[] = [
    [-B, -H],
    [B, -H],
    [B, -H + tf],
    [w, -H + tf],
    [w, H - tf],
    [B, H - tf],
    [B, H],
    [-B, H],
    [-B, H - tf],
    [-w, H - tf],
    [-w, -H + tf],
    [-B, -H + tf],
  ];
  return roundCorners(p, [0, 0, 0, r, r, 0, 0, 0, 0, r, r, 0]);
}

/** Cornière h × b × t (angle vif : les catalogues ne donnent pas les rayons, prudent). */
export function angleContour(h: number, b: number, t: number): Pt[] {
  return [
    [0, 0],
    [b, 0],
    [b, t],
    [t, t],
    [t, h],
    [0, h],
  ];
}

/** T : semelle b × tf en haut, âme tw sur la hauteur totale h (angles vifs). */
export function tContour(h: number, b: number, tw: number, tf: number): Pt[] {
  const w = tw / 2;
  return [
    [-w, 0],
    [w, 0],
    [w, h - tf],
    [b / 2, h - tf],
    [b / 2, h],
    [-b / 2, h],
    [-b / 2, h - tf],
    [-w, h - tf],
  ];
}

/** U à épaisseur constante (U marchand) : dos en y = 0, angles vifs. */
export function uContour(h: number, b: number, t: number): Pt[] {
  const H = h / 2;
  return [
    [0, -H],
    [b, -H],
    [b, -H + t],
    [t, -H + t],
    [t, H - t],
    [b, H - t],
    [b, H],
    [0, H],
  ];
}

// ─── torsion et gauchissement (parois minces, sans les congés : prudent) ───

/** UPN : It = (2 b tm³ + (h − 2 tm) tw³) / 3 avec tm = tf (épaisseur moyenne de l'aile). */
export function upnTorsion(h: number, b: number, tw: number, tf: number): number {
  return (2 * b * tf ** 3 + (h - 2 * tf) * tw ** 3) / 3;
}

/** UPN : gauchissement d'un U à parois minces, b' = b − tw / 2, h' = h − tf. */
export function upnWarping(h: number, b: number, tw: number, tf: number): number {
  const bp = b - tw / 2;
  const hp = h - tf;
  return ((tf * bp ** 3 * hp ** 2) / 12) * ((3 * bp * tf + 2 * hp * tw) / (6 * bp * tf + hp * tw));
}

export function iTorsion(h: number, b: number, tw: number, tf: number): number {
  return (2 * b * tf ** 3 + (h - 2 * tf) * tw ** 3) / 3;
}

/** I doublement symétrique : Iw = Iz (h − tf)² / 4. */
export const iWarping = (Iz: number, h: number, tf: number) => (Iz * (h - tf) ** 2) / 4;

/**
 * Congé r d'une poutrelle I retrouvé à partir de son aire publiée : A = 2 b tf + (h − 2 tf) tw + (4 − π) r².
 * null si l'aire publiée est incohérente avec les dimensions.
 */
export function iRootRadius(h: number, b: number, tw: number, tf: number, A: number): number | null {
  const plates = 2 * b * tf + (h - 2 * tf) * tw;
  const extra = A - plates;
  if (!(extra >= 0)) return null;
  const r = Math.sqrt(extra / (4 - Math.PI));
  return r <= Math.min(tf * 3, (b - tw) / 2) ? r : null;
}
