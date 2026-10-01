// Sections : propriétés (mm, mm², mm⁴, mm³, mm⁶), courbes de flambement EC3, générateurs paramétriques (rectangle,
// plat, rond, tube rond, tube rectangulaire à coins arrondis EN 10210 / EN 10219, profils ouverts à parois minces
// pliés ou soudés). Les sections des rapports de référence sont reprises telles quelles dans la bibliothèque
// (library/seed.ts) ; les générateurs servent aux sections saisies à la main. Fonctions pures.

export type BucklingCurve = 'a0' | 'a' | 'b' | 'c' | 'd';

/** Facteur d'imperfection α (DIN EN 1993-1-1, tableau 6.1). */
export const IMPERFECTION: Record<BucklingCurve, number> = { a0: 0.13, a: 0.21, b: 0.34, c: 0.49, d: 0.76 };

export type SectionShape = 'UNP' | 'I' | 'SHS' | 'RHS' | 'CHS' | 'FLAT' | 'RECT' | 'ROUND' | 'T' | 'U_COLD' | 'C_COLD' | 'ANGLE' | 'GENERIC';

export type Fabrication = 'hot-rolled' | 'hot-finished' | 'cold-formed' | 'welded' | 'timber' | 'equivalent';

export interface SectionProps {
  /** aire (mm²) */
  A: number;
  /** inerties autour de l'axe fort y et de l'axe faible z (mm⁴) */
  Iy: number;
  Iz: number;
  /** inertie de torsion (mm⁴), de gauchissement (mm⁶) */
  It: number;
  Iw?: number;
  /** modules élastiques et plastiques (mm³) */
  Wely: number;
  Welz: number;
  Wply?: number;
  Wplz?: number;
}

export interface Section extends SectionProps {
  key: string;
  name: string;
  shape: SectionShape;
  fabrication: Fabrication;
  /** dimensions nominales (mm) : h, b, t, tw, tf, r, ri, ro, d… */
  dims: Record<string, number>;
  /** courbes de flambement autour de y et de z ; absent pour une barre équivalente sans vérification */
  curveY?: BucklingCurve;
  curveZ?: BucklingCurve;
  /** barre équivalente sans masse (liaisons modélisées, contacts, boulons) */
  massless?: boolean;
  /** masse linéique (kg/m), si connue indépendamment de A × ρ */
  kgPerM?: number;
}

// ─── pleins ───

/** Inertie de torsion d'un rectangle b × h (b ≤ h), formule de Roark. */
export function rectTorsion(b: number, h: number): number {
  const [t, w] = b <= h ? [b, h] : [h, b];
  return w * t ** 3 * (1 / 3 - 0.21 * (t / w) * (1 - t ** 4 / (12 * w ** 4)));
}

/** Rectangle plein : h selon z local (hauteur), b selon y. */
export function rectangle(b: number, h: number): SectionProps {
  return {
    A: b * h,
    Iy: (b * h ** 3) / 12,
    Iz: (h * b ** 3) / 12,
    It: rectTorsion(b, h),
    Wely: (b * h * h) / 6,
    Welz: (h * b * b) / 6,
    Wply: (b * h * h) / 4,
    Wplz: (h * b * b) / 4,
  };
}

export function roundBar(d: number): SectionProps {
  const I = (Math.PI * d ** 4) / 64;
  return { A: (Math.PI * d * d) / 4, Iy: I, Iz: I, It: 2 * I, Wely: (Math.PI * d ** 3) / 32, Welz: (Math.PI * d ** 3) / 32, Wply: d ** 3 / 6, Wplz: d ** 3 / 6 };
}

export function chs(d: number, t: number): SectionProps {
  const di = d - 2 * t;
  const I = (Math.PI * (d ** 4 - di ** 4)) / 64;
  const W = I / (d / 2);
  const Wpl = (d ** 3 - di ** 3) / 6;
  return { A: (Math.PI * (d * d - di * di)) / 4, Iy: I, Iz: I, It: 2 * I, Wely: W, Welz: W, Wply: Wpl, Wplz: Wpl };
}

// ─── tubes rectangulaires ───

/** Rayons extérieur / intérieur des coins (EN 10210-2 formé à chaud, EN 10219-2 formé à froid). */
export function hollowRadii(t: number, fabrication: 'hot-finished' | 'cold-formed'): { ro: number; ri: number } {
  if (fabrication === 'hot-finished') return { ro: 1.5 * t, ri: t };
  if (t <= 6) return { ro: 2 * t, ri: t };
  if (t <= 10) return { ro: 2.5 * t, ri: 1.5 * t };
  return { ro: 3 * t, ri: 2 * t };
}

/** Rectangle w × h à coins arrondis (rayon r) : aire, inertie et moment statique de la demi-section autour de l'axe ∥ w. */
function roundedRect(w: number, h: number, r: number): { A: number; I: number; Q: number } {
  // coin = carré r × r moins un quart de cercle ; yc = ordonnée du centre du quart de cercle
  const yc = h / 2 - r;
  const Asq = r * r;
  const Aqc = (Math.PI * r * r) / 4;
  const Isq = r ** 4 / 12 + Asq * (h / 2 - r / 2) ** 2;
  const Iqc = (Math.PI * r ** 4) / 16 + 2 * yc * (r ** 3 / 3) + yc * yc * Aqc;
  const Qsq = Asq * (h / 2 - r / 2);
  const Qqc = Aqc * yc + r ** 3 / 3;
  return {
    A: w * h - 4 * (Asq - Aqc),
    I: (w * h ** 3) / 12 - 4 * (Isq - Iqc),
    Q: (w * (h / 2) ** 2) / 2 - 2 * (Qsq - Qqc),
  };
}

/** Tube rectangulaire h × b × t (h selon z local) : propriétés exactes avec coins arrondis, torsion selon EN 10219-2. */
export function rhs(h: number, b: number, t: number, fabrication: 'hot-finished' | 'cold-formed'): SectionProps {
  const { ro, ri } = hollowRadii(t, fabrication);
  const oy = roundedRect(b, h, ro);
  const iy = roundedRect(b - 2 * t, h - 2 * t, ri);
  const oz = roundedRect(h, b, ro);
  const iz = roundedRect(h - 2 * t, b - 2 * t, ri);
  const Rc = (ro + ri) / 2;
  const hp = 2 * (b - t + (h - t)) - 2 * Rc * (4 - Math.PI);
  const Ap = (b - t) * (h - t) - Rc * Rc * (4 - Math.PI);
  const K = (2 * Ap * t) / hp;
  const Iy = oy.I - iy.I;
  const Iz = oz.I - iz.I;
  return {
    A: oy.A - iy.A,
    Iy,
    Iz,
    It: (t ** 3 * hp) / 3 + 2 * K * Ap,
    Wely: Iy / (h / 2),
    Welz: Iz / (b / 2),
    Wply: 2 * (oy.Q - iy.Q),
    Wplz: 2 * (oz.Q - iz.Q),
  };
}

// ─── profils ouverts à parois minces (pliés) et profils soudés en plats ───

export interface Wall {
  /** extrémités de la ligne moyenne dans le plan de la section : (y, z) en mm */
  a: [number, number];
  b: [number, number];
  t: number;
}

/**
 * Propriétés d'un profil ouvert décrit par ses parois (lignes moyennes et épaisseurs) : aire, inerties (rectangle
 * incliné exact), modules élastiques aux fibres extrêmes, modules plastiques par recherche de l'axe neutre plastique,
 * torsion Σ L t³ / 3.
 */
export function openSection(walls: Wall[]): SectionProps & { yc: number; zc: number } {
  let A = 0;
  let Sy = 0;
  let Sz = 0;
  for (const w of walls) {
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
    A += L * w.t;
    Sy += L * w.t * ((w.a[0] + w.b[0]) / 2);
    Sz += L * w.t * ((w.a[1] + w.b[1]) / 2);
  }
  const yc = Sy / A;
  const zc = Sz / A;
  let Iy = 0;
  let Iz = 0;
  let It = 0;
  let zmax = 0;
  let ymax = 0;
  // points d'échantillonnage (pour Wpl) : chaque paroi découpée en bandes le long et dans l'épaisseur
  const pts: Array<[number, number, number]> = [];
  for (const w of walls) {
    const dy = w.b[0] - w.a[0];
    const dz = w.b[1] - w.a[1];
    const L = Math.hypot(dy, dz);
    const cy = (w.a[0] + w.b[0]) / 2 - yc;
    const cz = (w.a[1] + w.b[1]) / 2 - zc;
    const c = dy / L;
    const s = dz / L;
    // rectangle L × t incliné : inertie propre (L³ t / 12 selon la paroi, L t³ / 12 à travers)
    const iAlong = (t: number) => (L * t) / 12;
    Iy += iAlong(w.t) * (L * L * s * s + w.t * w.t * c * c) + L * w.t * cz * cz;
    Iz += iAlong(w.t) * (L * L * c * c + w.t * w.t * s * s) + L * w.t * cy * cy;
    It += (L * w.t ** 3) / 3;
    // fibres extrêmes : coins du rectangle de paroi
    const ny = -s;
    const nz = c;
    for (const e of [w.a, w.b])
      for (const k of [-0.5, 0.5]) {
        zmax = Math.max(zmax, Math.abs(e[1] + k * w.t * nz - zc));
        ymax = Math.max(ymax, Math.abs(e[0] + k * w.t * ny - yc));
      }
    const nl = Math.max(4, Math.ceil(L / 1));
    const nt = 4;
    for (let i = 0; i < nl; i++)
      for (let j = 0; j < nt; j++) {
        const u = (i + 0.5) / nl;
        const v = ((j + 0.5) / nt - 0.5) * w.t;
        pts.push([w.a[0] + dy * u + ny * v, w.a[1] + dz * u + nz * v, (L * w.t) / (nl * nt)]);
      }
  }
  const plastic = (axis: 0 | 1) => {
    // axe neutre plastique : partage l'aire en deux moitiés égales
    const sorted = [...pts].sort((p, q) => p[axis] - q[axis]);
    let acc = 0;
    let pna = sorted[0][axis];
    for (const p of sorted) {
      acc += p[2];
      if (acc >= A / 2) {
        pna = p[axis];
        break;
      }
    }
    return pts.reduce((sum, p) => sum + Math.abs(p[axis] - pna) * p[2], 0);
  };
  return { A, Iy, Iz, It, Wely: Iy / zmax, Welz: Iz / ymax, Wply: plastic(1), Wplz: plastic(0), yc, zc };
}

/** Arc de ligne moyenne (rayon rm, centre c, angles a0 → a1) découpé en parois droites. */
function arc(c: [number, number], rm: number, a0: number, a1: number, t: number, n = 8): Wall[] {
  const out: Wall[] = [];
  for (let k = 0; k < n; k++) {
    const t0 = a0 + ((a1 - a0) * k) / n;
    const t1 = a0 + ((a1 - a0) * (k + 1)) / n;
    out.push({ a: [c[0] + rm * Math.cos(t0), c[1] + rm * Math.sin(t0)], b: [c[0] + rm * Math.cos(t1), c[1] + rm * Math.sin(t1)], t });
  }
  return out;
}

/**
 * U plié à froid h × b × t (âme verticale de hauteur h, ailes de largeur b), rayon intérieur des plis ri, bords
 * tombés facultatifs de longueur c (profil C). Dimensions hors tout.
 */
export function coldFormedU(h: number, b: number, t: number, ri = 1.5 * t, c = 0): SectionProps {
  const rm = ri + t / 2;
  const y0 = t / 2; // ligne moyenne de l'âme
  const yb = b - t / 2; // extrémité des ailes (ligne moyenne des bords tombés)
  const zt = h / 2 - t / 2;
  const walls: Wall[] = [
    { a: [y0, -zt + rm], b: [y0, zt - rm], t },
    ...arc([y0 + rm, zt - rm], rm, Math.PI, Math.PI / 2, t),
    ...arc([y0 + rm, -zt + rm], rm, Math.PI, (3 * Math.PI) / 2, t),
  ];
  if (c > 0) {
    walls.push({ a: [y0 + rm, zt], b: [yb - rm, zt], t }, { a: [y0 + rm, -zt], b: [yb - rm, -zt], t });
    walls.push(...arc([yb - rm, zt - rm], rm, Math.PI / 2, 0, t), ...arc([yb - rm, -zt + rm], rm, -Math.PI / 2, 0, t));
    walls.push({ a: [yb, zt - rm], b: [yb, zt - c + t / 2] as [number, number], t }, { a: [yb, -zt + rm], b: [yb, -zt + c - t / 2] as [number, number], t });
  } else {
    walls.push({ a: [y0 + rm, zt], b: [b, zt], t }, { a: [y0 + rm, -zt], b: [b, -zt], t });
  }
  return openSection(walls);
}

/** T soudé : semelle bf × tf en haut, âme tw sur la hauteur totale h (propriétés exactes par rectangles). */
export function weldedT(h: number, tw: number, bf: number, tf: number): SectionProps {
  const Af = bf * tf;
  const hw = h - tf;
  const Aw = tw * hw;
  const A = Af + Aw;
  // z depuis le haut de la semelle
  const zf = tf / 2;
  const zw = tf + hw / 2;
  const zc = (Af * zf + Aw * zw) / A;
  const Iy = (bf * tf ** 3) / 12 + Af * (zc - zf) ** 2 + (tw * hw ** 3) / 12 + Aw * (zw - zc) ** 2;
  const Iz = (tf * bf ** 3) / 12 + (hw * tw ** 3) / 12;
  // axe neutre plastique : aire/2 depuis le haut
  const half = A / 2;
  const zp = half <= Af ? half / bf : tf + (half - Af) / tw;
  const firstMoment = (z0: number, z1: number, width: number) => (width * ((z1 - zp) * Math.abs(z1 - zp) - (z0 - zp) * Math.abs(z0 - zp))) / 2;
  const Wply = firstMoment(0, tf, bf) + firstMoment(tf, h, tw);
  return {
    A,
    Iy,
    Iz,
    It: rectTorsion(tf, bf) + rectTorsion(tw, hw),
    Wely: Iy / Math.max(zc, h - zc),
    Welz: Iz / (bf / 2),
    Wply,
    Wplz: (tf * bf * bf) / 4 + (hw * tw * tw) / 4,
  };
}

/** Longueur réduite λ̄ et coefficient χ de flambement (DIN EN 1993-1-1, 6.3.1.2). */
export function bucklingReduction(lambdaBar: number, curve: BucklingCurve): number {
  if (lambdaBar <= 0.2) return 1;
  const phi = 0.5 * (1 + IMPERFECTION[curve] * (lambdaBar - 0.2) + lambdaBar * lambdaBar);
  return Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lambdaBar * lambdaBar)));
}

/** Masse linéique (kg/m) d'une section d'aire A (mm²) dans un matériau de masse volumique ρ (kg/m³). */
export const kgPerMeter = (A: number, rho: number) => (A * 1e-6 * rho);
