// Vérifications acier DIN EN 1993-1-1 + NA d'un tronçon de barre (§9.2), comme les impressions SCIA des notes statico :
//   classement des parois (tableau 5.2, contraintes élastiques de la section sous N, My, Mz ; parois en saillie avec
//   kσ de l'EN 1993-1-5 tab. 4.2), résistances de section (6.2 : N, My, Mz, Vy, Vz, torsion, interaction (6.41) pour les
//   tubes, addition linéaire 6.2.1(7) sinon, élastique en classe 3), flambement et déversement (6.3), interaction
//   (6.61) / (6.62) selon l'annexe B (méthode 2, termes (λ̄ − 0,2) bornés à 0 comme SCIA).
// Deux méthodes :
//   · défaut : 2ᵉ ordre global (défaut d'aplomb) + flambement des barres sur la longueur du tronçon entre attaches
//     (nœuds fixes, EN 1993-1-1 5.2.2(3)b), Cm selon le diagramme des moments (tab. B.3) ;
//   · statico : longueurs de flambement et de déversement nulles (le 2ᵉ ordre porte aussi la courbure initiale),
//     Cm = 0,9 (nœuds déplaçables) — reproduit les impressions SCIA (Qatar § 6.2) ;
//   · enveloppe (défaut) : la plus défavorable des deux (la méthode classique n'est pas toujours la plus sévère :
//     Cm = 0,4 sous moments de signes opposés).
// Classe 4 : méthode des contraintes réduites (EN 1993-1-5 § 10 : ρ · fy de la paroi la plus élancée, formules
// élastiques). Section non classable, acier hors tranches : vérification bloquée (⛔). Fonctions pures ; N, mm.
import type { BucklingCurve, Section } from '../catalog';
import { bucklingReduction, IMPERFECTION } from '../catalog';
import type { Material } from '../materials';
import { steelStrength } from '../materials';
import type { CalcRecord } from '../records';
import { fmtNumber } from '../units';

export interface Forces {
  /** traction + (N), efforts tranchants, torsion (N·mm), moments (N·mm, fibre −z / −y tendue positive) */
  N: number;
  Vy: number;
  Vz: number;
  T: number;
  My: number;
  Mz: number;
}

export interface StationForces extends Forces {
  /** abscisse le long du tronçon (mm) */
  x: number;
}

export type Ec3Method = 'envelope' | 'classic' | 'statico';

export interface Ec3Options {
  gammaM0: number;
  gammaM1: number;
  /** 'classic' ou 'statico' (voir en-tête) ; 'envelope' (défaut, prudent) = la plus défavorable des deux */
  method: Ec3Method;
}

/** γM0 = γM1 = 1,10 comme les notes statico (constructions temporaires, DIN EN 13814). */
export const EC3_DEFAULTS: Ec3Options = { gammaM0: 1.1, gammaM1: 1.1, method: 'envelope' };

export const EC3_METHOD_LABEL: Record<Ec3Method, string> = {
  envelope: 'enveloppe (classique et statico)',
  classic: 'flambement sur la longueur des tronçons (EN 1993-1-1 5.2.2(3)b)',
  statico: 'méthode statico (2ᵉ ordre avec imperfections, χ = 1, Cm = 0,9)',
};

export interface SpanInput {
  key: string;
  label: string;
  section: Section;
  material: Material;
  /** courbes de flambement (défaut : celles de la section) */
  curves?: { y: BucklingCurve; z: BucklingCurve };
  /** longueur du tronçon entre attaches (mm) */
  length: number;
  stations: StationForces[];
  combination?: string;
}

export type SectionClass = 1 | 2 | 3 | 4;

export interface Ec3Result {
  eta: number;
  /** vérification déterminante (« 6.41 », « 6.61 », « Vz »…) */
  governing: string;
  cls: SectionClass;
  blocked?: string;
  /** détail (formules avec valeurs) si demandé */
  records: CalcRecord[];
  /** taux par vérification */
  parts: Record<string, number>;
  /** méthode déterminante */
  method: 'classic' | 'statico';
}

// ─── parois de la section (repère principal, origine au centre de gravité) ───

interface Part {
  id: string;
  kind: 'internal' | 'outstand';
  c: number;
  t: number;
  /** extrémités (y, z) ; paroi en saillie : a = racine, b = bord libre */
  a: [number, number];
  b: [number, number];
}

/** Parois à classer ; plusieurs variantes quand l'orientation de la section dans le modèle n'est pas connue. */
function sectionParts(s: Section): Part[][] | null {
  const d = s.dims;
  switch (s.shape) {
    case 'SHS':
    case 'RHS': {
      const { h, b, t } = d;
      const cw = h - 3 * t;
      const cf = b - 3 * t;
      const yw = (b - t) / 2;
      const zf = (h - t) / 2;
      return [
        [
          { id: 'aile +z', kind: 'internal', c: cf, t, a: [-cf / 2, zf], b: [cf / 2, zf] },
          { id: 'âme +y', kind: 'internal', c: cw, t, a: [yw, -cw / 2], b: [yw, cw / 2] },
          { id: 'aile −z', kind: 'internal', c: cf, t, a: [-cf / 2, -zf], b: [cf / 2, -zf] },
          { id: 'âme −y', kind: 'internal', c: cw, t, a: [-yw, -cw / 2], b: [-yw, cw / 2] },
        ],
      ];
    }
    case 'UNP':
    case 'U_COLD':
    case 'C_COLD': {
      const cold = s.shape !== 'UNP';
      const h = d.h;
      const b = d.b;
      const tw = cold ? d.t : d.tw;
      const tf = cold ? d.t : d.tf;
      const r = cold ? (d.ri ?? 1.5 * d.t) : d.r;
      if (!(h > 0 && b > 0 && tw > 0 && tf > 0) || r === undefined) return null;
      // centre de gravité (rectangles) depuis le dos de l'âme
      const Aw = h * tw;
      const Af = 2 * (b - tw) * tf;
      const ey = (Aw * (tw / 2) + Af * (tw + (b - tw) / 2)) / (Aw + Af);
      const cw = h - 2 * tf - 2 * r;
      const cf = b - tw - r;
      const zf = (h - tf) / 2;
      const variant = (sy: number): Part[] => [
        { id: 'aile +z', kind: 'outstand', c: cf, t: tf, a: [sy * (tw + r - ey), zf], b: [sy * (b - ey), zf] },
        { id: 'âme', kind: 'internal', c: cw, t: tw, a: [sy * (tw / 2 - ey), -cw / 2], b: [sy * (tw / 2 - ey), cw / 2] },
        { id: 'aile −z', kind: 'outstand', c: cf, t: tf, a: [sy * (tw + r - ey), -zf], b: [sy * (b - ey), -zf] },
      ];
      return [variant(1), variant(-1)];
    }
    case 'T': {
      const { h, tw, b, tf } = d;
      const Af = b * tf;
      const Aw = (h - tf) * tw;
      const dc = (Af * (tf / 2) + Aw * (tf + (h - tf) / 2)) / (Af + Aw);
      const cf = (b - tw) / 2;
      const variant = (sz: number): Part[] => [
        { id: 'aile +y', kind: 'outstand', c: cf, t: tf, a: [tw / 2, sz * (dc - tf / 2)], b: [b / 2, sz * (dc - tf / 2)] },
        { id: 'aile −y', kind: 'outstand', c: cf, t: tf, a: [-tw / 2, sz * (dc - tf / 2)], b: [-b / 2, sz * (dc - tf / 2)] },
        { id: 'âme', kind: 'outstand', c: h - tf, t: tw, a: [0, sz * (dc - tf)], b: [0, sz * (dc - h)] },
      ];
      return [variant(1), variant(-1)];
    }
    case 'I': {
      const { h, b, tw, tf } = d;
      const r = d.r ?? 0;
      const cf = (b - tw - 2 * r) / 2;
      const cw = h - 2 * tf - 2 * r;
      const zf = (h - tf) / 2;
      return [
        [
          { id: 'aile +z +y', kind: 'outstand', c: cf, t: tf, a: [tw / 2 + r, zf], b: [b / 2, zf] },
          { id: 'aile +z −y', kind: 'outstand', c: cf, t: tf, a: [-tw / 2 - r, zf], b: [-b / 2, zf] },
          { id: 'âme', kind: 'internal', c: cw, t: tw, a: [0, -cw / 2], b: [0, cw / 2] },
          { id: 'aile −z +y', kind: 'outstand', c: cf, t: tf, a: [tw / 2 + r, -zf], b: [b / 2, -zf] },
          { id: 'aile −z −y', kind: 'outstand', c: cf, t: tf, a: [-tw / 2 - r, -zf], b: [-b / 2, -zf] },
        ],
      ];
    }
    default:
      return null;
  }
}

/** Contrainte de compression (positive) au point (y, z) : −N/A + My·z/Iy + Mz·y/Iz. */
const compression = (s: Section, f: Forces, y: number, z: number) => -f.N / s.A + (f.My * z) / s.Iy + (f.Mz * y) / s.Iz;

interface PartClass {
  part: Part;
  cls: SectionClass;
  ct: number;
  limits: [number, number, number];
  psi: number;
  alpha: number;
  ksigma?: number;
}

function classifyPart(p: Part, sa: number, sb: number, eps: number): PartClass {
  const ct = p.c / p.t;
  const out = (cls: SectionClass, limits: [number, number, number], psi: number, alpha: number, ksigma?: number): PartClass => ({ part: p, cls, ct, limits, psi, alpha, ksigma });
  const grade = (l: [number, number, number]): SectionClass => (ct <= l[0] ? 1 : ct <= l[1] ? 2 : ct <= l[2] ? 3 : 4);
  const smax = Math.max(sa, sb);
  const smin = Math.min(sa, sb);
  if (smax <= 1e-9) return out(1, [Infinity, Infinity, Infinity], NaN, 0);
  const alpha = smin >= 0 ? 1 : smax / (smax - smin);
  if (p.kind === 'internal') {
    const psi = smin / smax;
    const l1 = alpha > 0.5 ? (396 * eps) / (13 * alpha - 1) : (36 * eps) / alpha;
    const l2 = alpha > 0.5 ? (456 * eps) / (13 * alpha - 1) : (41.5 * eps) / alpha;
    const l3 = psi > -1 ? (42 * eps) / (0.67 + 0.33 * psi) : 62 * eps * (1 - psi) * Math.sqrt(-psi);
    const limits: [number, number, number] = [l1, l2, l3];
    return out(grade(limits), limits, psi, alpha);
  }
  // paroi en saillie : a = racine, b = bord libre
  const [root, tip] = [sa, sb];
  const tipCompressed = tip > 0;
  const f = tipCompressed ? alpha : alpha * Math.sqrt(alpha);
  let ksigma: number;
  let psi: number;
  if (tip >= root) {
    // compression maxi au bord libre
    psi = Math.max(-3, root / tip);
    ksigma = 0.57 - 0.21 * psi + 0.07 * psi * psi;
  } else {
    psi = tip / root;
    ksigma = psi >= 0 ? 0.578 / (psi + 0.34) : psi >= -1 ? 1.7 - 5 * psi + 17.1 * psi * psi : 23.8;
  }
  const limits: [number, number, number] = [(9 * eps) / f, (10 * eps) / f, 21 * eps * Math.sqrt(ksigma)];
  return out(grade(limits), limits, psi, alpha, ksigma);
}

/** Classe de la section sous les efforts d'une station (la pire des variantes d'orientation). */
export function classify(s: Section, f: Forces, fy: number): { cls: SectionClass; parts: PartClass[]; reason?: string } {
  const eps = Math.sqrt(235 / fy);
  if (s.shape === 'FLAT' || s.shape === 'RECT' || s.shape === 'ROUND') return { cls: 1, parts: [] };
  if (s.shape === 'CHS') {
    const dt = s.dims.d / s.dims.t;
    const e2 = eps * eps;
    return { cls: dt <= 50 * e2 ? 1 : dt <= 70 * e2 ? 2 : dt <= 90 * e2 ? 3 : 4, parts: [] };
  }
  if (s.shape === 'ANGLE') {
    const { h, b, t } = s.dims;
    return { cls: h / t <= 15 * eps && (b + h) / (2 * t) <= 11.5 * eps ? 3 : 4, parts: [] };
  }
  const variants = sectionParts(s);
  if (!variants) return { cls: 4, parts: [], reason: `section ${s.name} : géométrie des parois inconnue, classe non déterminable` };
  let worst: { cls: SectionClass; parts: PartClass[] } | null = null;
  for (const parts of variants) {
    const pcs = parts.map((p) => classifyPart(p, compression(s, f, p.a[0], p.a[1]), compression(s, f, p.b[0], p.b[1]), eps));
    const cls = pcs.reduce<SectionClass>((m, p) => (p.cls > m ? p.cls : m), 1);
    if (!worst || cls > worst.cls) worst = { cls, parts: pcs };
  }
  return worst!;
}

/** Réduction ρ d'une paroi de classe 4 (EN 1993-1-5 4.4, tab. 4.1 / 4.2). */
export function plateReduction(pc: PartClass, eps: number): number {
  const psi = Number.isFinite(pc.psi) ? pc.psi : 1;
  let k: number;
  if (pc.part.kind === 'outstand') k = pc.ksigma ?? 0.43;
  else if (psi >= 1) k = 4;
  else if (psi > 0) k = 8.2 / (1.05 + psi);
  else if (psi > -1) k = 7.81 - 6.29 * psi + 9.78 * psi * psi;
  else k = 5.98 * (1 - psi) ** 2;
  const lam = pc.ct / (28.4 * eps * Math.sqrt(k));
  const rho = pc.part.kind === 'outstand' ? (lam - 0.188) / (lam * lam) : (lam - 0.055 * (3 + Math.max(psi, -3))) / (lam * lam);
  return lam <= (pc.part.kind === 'outstand' ? 0.748 : 0.673) ? 1 : Math.min(1, rho);
}

// ─── résistances de section ───

function shearAreas(s: Section): { y: number; z: number } {
  const d = s.dims;
  const A = s.A;
  switch (s.shape) {
    case 'RHS':
    case 'SHS':
      return { z: (A * d.h) / (d.b + d.h), y: (A * d.b) / (d.b + d.h) };
    case 'CHS':
      return { z: (2 * A) / Math.PI, y: (2 * A) / Math.PI };
    case 'UNP':
      return { z: A - 2 * d.b * d.tf + (d.tw + (d.r ?? 0)) * d.tf, y: 2 * d.b * d.tf };
    case 'I': {
      const hw = d.h - 2 * d.tf;
      return { z: Math.max(A - 2 * d.b * d.tf + (d.tw + 2 * (d.r ?? 0)) * d.tf, 1.2 * hw * d.tw), y: 2 * d.b * d.tf };
    }
    case 'T':
      return { z: d.tw * (d.h - d.tf / 2), y: d.b * d.tf };
    case 'U_COLD':
    case 'C_COLD':
      return { z: d.t * (d.h - 2 * d.t), y: 2 * d.t * (d.b - d.t) };
    case 'ROUND':
      return { z: 0.9 * A, y: 0.9 * A };
    default:
      return { z: A, y: A };
  }
}

/** Contrainte de torsion (Bredt pour les profils creux, T · t / It sinon). */
function torsionStress(s: Section, T: number): number {
  const d = s.dims;
  if (s.shape === 'RHS' || s.shape === 'SHS') return Math.abs(T) / (2 * (d.b - d.t) * (d.h - d.t) * d.t);
  if (s.shape === 'CHS') return Math.abs(T) / (2 * Math.PI * ((d.d - d.t) / 2) ** 2 * d.t);
  const tmax = Math.max(d.t ?? 0, d.tf ?? 0, d.tw ?? 0, d.b && s.shape === 'FLAT' ? Math.min(d.b, d.t) : 0) || Math.sqrt(s.A) / 2;
  return s.It > 0 ? (Math.abs(T) * tmax) / s.It : Infinity;
}

const closed = (s: Section) => s.shape === 'RHS' || s.shape === 'SHS' || s.shape === 'CHS';
/** Sections sensibles au déversement (sections ouvertes). */
const ltbSensitive = (s: Section) => s.shape === 'UNP' || s.shape === 'U_COLD' || s.shape === 'C_COLD' || s.shape === 'T' || s.shape === 'I' || s.shape === 'ANGLE';

/** Coefficient Cm (tab. B.3, charges réparties) d'après le diagramme des moments du tronçon. */
export function momentFactor(xs: number[], ms: number[]): { cm: number; psi: number; alphaS?: number; alphaH?: number; Mh: number; Ms: number } {
  const n = ms.length;
  const [m0, m1] = [ms[0], ms[n - 1]];
  const [Mh, other] = Math.abs(m0) >= Math.abs(m1) ? [m0, m1] : [m1, m0];
  const L = xs[n - 1] - xs[0];
  // moment au milieu (interpolé) ; plus grand moment intérieur s'il dépasse les deux
  const xm = xs[0] + L / 2;
  let Ms = ms[0];
  for (let k = 0; k + 1 < n; k++)
    if (xs[k] <= xm && xm <= xs[k + 1]) {
      const t = xs[k + 1] > xs[k] ? (xm - xs[k]) / (xs[k + 1] - xs[k]) : 0;
      Ms = ms[k] + t * (ms[k + 1] - ms[k]);
      break;
    }
  for (let k = 1; k + 1 < n; k++) if (Math.abs(ms[k]) > Math.max(Math.abs(Mh), Math.abs(Ms))) Ms = ms[k];
  if (Math.abs(Mh) < 1e-6 && Math.abs(Ms) < 1e-6) return { cm: 1, psi: 1, Mh, Ms };
  const psi = Math.abs(Mh) > 1e-9 ? Math.max(-1, Math.min(1, other / Mh)) : 1;
  if (Math.abs(Mh) >= Math.abs(Ms)) {
    const aS = Ms / Mh;
    const cm = aS >= 0 ? 0.2 + 0.8 * aS : psi >= 0 ? 0.1 - 0.8 * aS : 0.1 * (1 - psi) - 0.8 * aS;
    return { cm: Math.max(0.4, Math.min(1, cm)), psi, alphaS: aS, Mh, Ms };
  }
  const aH = Mh / Ms;
  const cm = aH >= 0 || psi >= 0 ? 0.95 + 0.05 * aH : 0.95 + 0.05 * aH * (1 + 2 * psi);
  return { cm: Math.max(0.4, Math.min(1, cm)), psi, alphaH: aH, Mh, Ms };
}

const kN = (v: number, d = 2) => `${fmtNumber(v / 1e3, d)} kN`;
const kNm = (v: number, d = 2) => `${fmtNumber(v / 1e6, d)} kNm`;
const f2 = (v: number, d = 2) => fmtNumber(v, d);

/** Vérification complète d'un tronçon pour une combinaison. */
export function checkSpan(inp: SpanInput, opt: Ec3Options = EC3_DEFAULTS, detail = false): Ec3Result {
  if (opt.method !== 'envelope') return checkSpanWith(inp, opt, opt.method === 'statico', detail);
  const a = checkSpanWith(inp, opt, false, detail);
  const b = checkSpanWith(inp, opt, true, detail);
  const w = b.eta > a.eta ? b : a;
  // taux par vérification : le plus défavorable des deux méthodes
  const parts = { ...a.parts };
  for (const [k, v] of Object.entries(b.parts)) parts[k] = Math.max(parts[k] ?? 0, v);
  return { ...w, parts, method: w === b ? 'statico' : 'classic' };
}

function checkSpanWith(inp: SpanInput, opt: Ec3Options, staticoMethod: boolean, detail: boolean): Ec3Result {
  const s = inp.section;
  const records: CalcRecord[] = [];
  const parts: Record<string, number> = {};
  const method = staticoMethod ? 'statico' : 'classic';
  const blocked = (reason: string): Ec3Result => ({ eta: Infinity, governing: 'bloqué', cls: 4, blocked: reason, records, parts, method });
  if (s.fabrication === 'timber' || inp.material.family !== 'steel') return blocked(`${s.name} : ${inp.material.name} — vérification EC3 non applicable (bois / autre matériau)`);
  const tmax = Math.max(s.dims.t ?? 0, s.dims.tf ?? 0, s.dims.tw ?? 0, s.shape === 'FLAT' ? Math.min(s.dims.b, s.dims.t) : 0, s.shape === 'ROUND' ? s.dims.d / 2 : 0);
  const st = steelStrength(inp.material, tmax || 1);
  if (!st) return blocked(`${s.name} : épaisseur ${tmax} mm hors des tranches de ${inp.material.name}`);
  const fy = st.fy;
  const { gammaM0: g0, gammaM1: g1 } = opt;
  const stations = [...inp.stations].sort((a, b) => a.x - b.x);
  if (!stations.length) return { eta: 0, governing: '—', cls: 1, records, parts, method };

  // classe : la pire le long du tronçon ; classe 4 : méthode des contraintes réduites (EN 1993-1-5 § 10),
  // limite d'élasticité ρ · fy avec ρ de la paroi la plus élancée, formules élastiques (classe 3)
  let cls: SectionClass = 1;
  let clsDetail: ReturnType<typeof classify> | null = null;
  let rho = 1;
  let rhoPart = '';
  const eps = Math.sqrt(235 / fy);
  for (const f of stations) {
    const c = classify(s, f, fy);
    if (c.reason) return blocked(c.reason);
    if (!clsDetail || c.cls > cls) [cls, clsDetail] = [c.cls, c];
    for (const pc of c.parts)
      if (pc.cls === 4) {
        const r = plateReduction(pc, eps);
        if (r < rho) [rho, rhoPart] = [r, pc.part.id];
      }
  }
  if (cls === 4 && !(rho >= 0.2)) return blocked(`${s.name} : section de classe 4, paroi « ${rhoPart} » trop élancée (ρ = ${f2(rho)}) — hors du domaine de l'outil`);
  const clsEff: SectionClass = cls === 4 ? 3 : cls;
  const fyN = cls === 4 ? rho * fy : fy;
  const Wy = clsEff <= 2 ? (s.Wply ?? s.Wely) : s.Wely;
  const Wz = clsEff <= 2 ? (s.Wplz ?? s.Welz) : s.Welz;
  const Npl = (s.A * fyN) / g0;
  const Mpy = (Wy * fyN) / g0;
  const Mpz = (Wz * fyN) / g0;
  const Av = shearAreas(s);
  const Vply = (Av.y * fy) / Math.sqrt(3) / g0;
  const Vplz = (Av.z * fy) / Math.sqrt(3) / g0;
  const tauRd = fy / Math.sqrt(3) / g0;

  // ─── section, à chaque station ───
  let secEta = 0;
  let secWhere: { f: StationForces; key: string; text: string } | null = null;
  const bump = (key: string, eta: number) => (parts[key] = Math.max(parts[key] ?? 0, eta));
  for (const f of stations) {
    const n = Math.abs(f.N) / Npl;
    const tau = torsionStress(s, f.T);
    const etaT = tau / tauRd;
    bump('T', etaT);
    // torsion négligée sous 5 % (comme SCIA), sinon elle réduit la résistance à l'effort tranchant (6.26–6.28)
    const redT = etaT < 0.05 ? 1 : closed(s) ? Math.max(0, 1 - etaT) : Math.max(0, Math.sqrt(Math.max(0, 1 - tau / (1.25 * tauRd))));
    const vy = Math.abs(f.Vy) / (Vply * redT);
    const vz = Math.abs(f.Vz) / (Vplz * redT);
    bump('Vy', vy);
    bump('Vz', vz);
    // effort tranchant > 50 % : limite d'élasticité réduite (1 − ρ) sur le moment correspondant
    const rho = (v: number) => (v > 0.5 ? (2 * v - 1) ** 2 : 0);
    const My = Mpy * (1 - rho(vz));
    const Mz = Mpz * (1 - rho(vy));
    bump('N', n);
    bump('My', Math.abs(f.My) / My);
    bump('Mz', Math.abs(f.Mz) / Mz);
    let eta: number;
    let key: string;
    let text: string;
    if (closed(s) && clsEff <= 2 && s.shape !== 'CHS') {
      // (6.39)–(6.41) tubes rectangulaires
      const d = s.dims;
      const aw = Math.min((s.A - 2 * d.b * d.t) / s.A, 0.5);
      const af = Math.min((s.A - 2 * d.h * d.t) / s.A, 0.5);
      const MNy = Math.min(My, (My * (1 - n)) / (1 - 0.5 * aw));
      const MNz = Math.min(Mz, (Mz * (1 - n)) / (1 - 0.5 * af));
      const ab = Math.min(6, 1.66 / (1 - 1.13 * n * n));
      const ty = (Math.abs(f.My) / Math.max(MNy, 1e-9)) ** ab;
      const tz = (Math.abs(f.Mz) / Math.max(MNz, 1e-9)) ** ab;
      eta = n >= 1 ? Infinity : ty + tz;
      key = '6.41';
      text = `(${f2(Math.abs(f.My) / 1e6)} / ${f2(MNy / 1e6)})^${f2(ab)} + (${f2(Math.abs(f.Mz) / 1e6)} / ${f2(MNz / 1e6)})^${f2(ab)} = ${f2(ty)} + ${f2(tz)} = ${f2(eta)}`;
    } else if (s.shape === 'CHS' && clsEff <= 2) {
      const MN = My * (1 - n ** 1.7);
      eta = n >= 1 ? Infinity : (Math.hypot(f.My, f.Mz) / Math.max(MN, 1e-9)) ** 2;
      key = '6.41';
      text = `(√(My² + Mz²) / MN,Rd)² = (${f2(Math.hypot(f.My, f.Mz) / 1e6)} / ${f2(MN / 1e6)})² = ${f2(eta)}`;
    } else {
      // addition linéaire 6.2.1(7) (plastique en classes 1–2, élastique en classe 3)
      const a = n;
      const b = Math.abs(f.My) / My;
      const c = Math.abs(f.Mz) / Mz;
      eta = a + b + c;
      key = '6.2';
      text = `${f2(a)} + ${f2(b)} + ${f2(c)} = ${f2(eta)}`;
    }
    bump(key, eta);
    if (eta > secEta || !secWhere) [secEta, secWhere] = [eta, { f, key, text }];
  }

  // ─── stabilité (6.3) ───
  const E = inp.material.E;
  const G = inp.material.G;
  const curves = inp.curves ?? { y: s.curveY ?? 'c', z: s.curveZ ?? 'c' };
  const L = staticoMethod ? 0 : inp.length;
  const NRk = s.A * fyN;
  const lam = (I: number) => (L > 0 ? Math.sqrt(NRk / ((Math.PI ** 2 * E * I) / (L * L))) : 0);
  const lamY = lam(s.Iy);
  const lamZ = lam(s.Iz);
  const chiY = bucklingReduction(lamY, curves.y);
  const chiZ = bucklingReduction(lamZ, curves.z);
  const xs = stations.map((f) => f.x);
  const cmy = staticoMethod ? { cm: 0.9, psi: NaN } : momentFactor(xs, stations.map((f) => f.My));
  const cmz = staticoMethod ? { cm: 0.9, psi: NaN } : momentFactor(xs, stations.map((f) => f.Mz));
  const cmLT = momentFactor(xs, stations.map((f) => f.My));
  const NEd = Math.max(0, ...stations.map((f) => -f.N));
  const MyEd = Math.max(...stations.map((f) => Math.abs(f.My)));
  const MzEd = Math.max(...stations.map((f) => Math.abs(f.Mz)));
  const MyRk = Wy * fyN;
  const MzRk = Wz * fyN;
  // déversement des sections ouvertes : Mcr (formule générale, C1 = 1 sauf diagramme linéaire), courbe d
  let chiLT = 1;
  let lamLT = 0;
  let Mcr = Infinity;
  if (ltbSensitive(s) && L > 0 && MyEd > 0) {
    const linear = Math.abs(cmLT.Ms - (cmLT.Mh * (1 + cmLT.psi)) / 2) <= 0.05 * Math.abs(cmLT.Mh);
    const C1 = linear ? Math.min(2.7, 1.88 - 1.4 * cmLT.psi + 0.52 * cmLT.psi * cmLT.psi) : 1;
    const Iw = s.Iw ?? 0;
    Mcr = ((C1 * Math.PI ** 2 * E * s.Iz) / (L * L)) * Math.sqrt(Iw / s.Iz + (L * L * G * s.It) / (Math.PI ** 2 * E * s.Iz));
    lamLT = Math.sqrt(MyRk / Mcr);
    if (lamLT > 0.2 && MyEd / Mcr > 0.04) {
      const aLT = IMPERFECTION[s.shape === 'I' ? 'b' : 'd'];
      const phi = 0.5 * (1 + aLT * (lamLT - 0.2) + lamLT * lamLT);
      chiLT = Math.min(1, 1 / (phi + Math.sqrt(phi * phi - lamLT * lamLT)));
    }
  }
  let stabEta = 0;
  let stabText = '';
  let stabKey = '';
  if (NEd > 0) {
    const nY = NEd / ((chiY * NRk) / g1);
    const nZ = NEd / ((chiZ * NRk) / g1);
    const sus = ltbSensitive(s) && chiLT < 1;
    let kyy: number;
    let kzz: number;
    let kyz: number;
    let kzy: number;
    if (clsEff <= 2) {
      kyy = cmy.cm * (1 + Math.min(Math.max(lamY - 0.2, 0), 0.8) * nY);
      kzz = closed(s) ? cmz.cm * (1 + Math.min(Math.max(lamZ - 0.2, 0), 0.8) * nZ) : cmz.cm * (1 + Math.min(Math.max(2 * lamZ - 0.6, 0), 1.4) * nZ);
      kyz = 0.6 * kzz;
      kzy = sus ? (lamZ < 0.4 ? Math.min(0.6 + lamZ, 1 - (0.1 * lamZ * nZ) / (cmLT.cm - 0.25)) : Math.max(1 - (0.1 * lamZ * nZ) / (cmLT.cm - 0.25), 1 - (0.1 * nZ) / (cmLT.cm - 0.25))) : 0.6 * kyy;
    } else {
      kyy = cmy.cm * (1 + 0.6 * Math.min(lamY, 1) * nY);
      kzz = cmz.cm * (1 + 0.6 * Math.min(lamZ, 1) * nZ);
      kyz = kzz;
      kzy = sus ? Math.max(1 - (0.05 * lamZ * nZ) / (cmLT.cm - 0.25), 1 - (0.05 * nZ) / (cmLT.cm - 0.25)) : 0.8 * kyy;
    }
    const by = MyEd / ((chiLT * MyRk) / g1);
    const bz = MzEd / (MzRk / g1);
    const e61 = nY + kyy * by + kyz * bz;
    const e62 = nZ + kzy * by + kzz * bz;
    bump('6.61', e61);
    bump('6.62', e62);
    [stabEta, stabKey] = e61 >= e62 ? [e61, '6.61'] : [e62, '6.62'];
    stabText =
      stabKey === '6.61'
        ? `${f2(nY)} + ${f2(kyy)} · ${f2(by)} + ${f2(kyz)} · ${f2(bz)} = ${f2(nY)} + ${f2(kyy * by)} + ${f2(kyz * bz)} = ${f2(e61)}`
        : `${f2(nZ)} + ${f2(kzy)} · ${f2(by)} + ${f2(kzz)} · ${f2(bz)} = ${f2(nZ)} + ${f2(kzy * by)} + ${f2(kzz * bz)} = ${f2(e62)}`;
    if (detail)
      records.push({
        key: `${inp.key}.stab`,
        title: `${inp.label} — flambement et flexion (${stabKey}, ${staticoMethod ? 'méthode statico' : 'méthode classique'})`,
        clause: 'DIN EN 1993-1-1 6.3.3, annexe B (méthode 2)',
        formula: 'NEd / (χy NRk / γM1) + kyy My,Ed / (χLT My,Rk / γM1) + kyz Mz,Ed / (Mz,Rk / γM1) ≤ 1 ; idem (6.62) avec χz, kzy, kzz',
        withValues: `L = ${f2(L / 1e3, 3)} m ; λ̄y = ${f2(lamY)}, λ̄z = ${f2(lamZ)} ; χy = ${f2(chiY)}, χz = ${f2(chiZ)}, χLT = ${f2(chiLT)} ; Cmy = ${f2(cmy.cm)}, Cmz = ${f2(cmz.cm)} ; NEd = ${kN(NEd)}, My,Ed = ${kNm(MyEd)}, Mz,Ed = ${kNm(MzEd)} ; NRk = ${kN(NRk)}, My,Rk = ${kNm(MyRk)}, Mz,Rk = ${kNm(MzRk)} ; ${stabText}`,
        eta: stabEta,
        combination: inp.combination,
      });
  } else if (chiLT < 1) {
    stabKey = '6.54';
    stabEta = MyEd / ((chiLT * MyRk) / g1) + MzEd / (MzRk / g1);
    bump('6.54', stabEta);
    stabText = `${kNm(MyEd)} / (${f2(chiLT)} · ${kNm(MyRk)} / ${f2(g1)}) + ${kNm(MzEd)} / (${kNm(MzRk)} / ${f2(g1)}) = ${f2(stabEta)}`;
    if (detail)
      records.push({
        key: `${inp.key}.ltb`,
        title: `${inp.label} — déversement`,
        clause: 'DIN EN 1993-1-1 6.3.2',
        formula: 'My,Ed / Mb,Rd + Mz,Ed / Mz,Rd ≤ 1 ; Mb,Rd = χLT · Wy · fy / γM1',
        withValues: `Mcr = ${kNm(Mcr)} ; λ̄LT = ${f2(lamLT)} ; ${stabText}`,
        eta: stabEta,
        combination: inp.combination,
      });
  }
  if (detail && secWhere) {
    const f = secWhere.f;
    records.unshift({
      key: `${inp.key}.section`,
      title: `${inp.label} — résistance de la section (${secWhere.key === '6.41' ? '(6.41)' : '6.2.1(7)'})`,
      clause: secWhere.key === '6.41' ? 'DIN EN 1993-1-1 6.2.9.1 (6.41)' : 'DIN EN 1993-1-1 6.2.1(7)',
      formula: secWhere.key === '6.41' ? '(My,Ed / MN,y,Rd)^α + (Mz,Ed / MN,z,Rd)^β ≤ 1' : 'NEd / NRd + My,Ed / My,Rd + Mz,Ed / Mz,Rd ≤ 1',
      withValues: `${s.name}, ${inp.material.name} (fy = ${f2(fy / 10, 2)} kN/cm²), classe ${cls}${cls === 4 ? ` (contraintes réduites EN 1993-1-5 § 10 : paroi « ${rhoPart} », ρ = ${f2(rho)}, fy,réd = ${f2(fyN / 10, 2)} kN/cm²)` : ''}, γM0 = ${f2(g0)} ; x = ${f2(f.x / 1e3, 3)} m : N = ${kN(f.N)}, Vy = ${kN(f.Vy)}, Vz = ${kN(f.Vz)}, T = ${kNm(f.T)}, My = ${kNm(f.My)}, Mz = ${kNm(f.Mz)} ; Npl,Rd = ${kN(Npl)}, My,Rd = ${kNm(Mpy)}, Mz,Rd = ${kNm(Mpz)}, Vpl,y,Rd = ${kN(Vply)}, Vpl,z,Rd = ${kN(Vplz)} ; ${secWhere.text}`,
      eta: secEta,
      combination: inp.combination,
    });
  }
  const shear = Math.max(parts.Vy ?? 0, parts.Vz ?? 0);
  const cands: Array<[string, number]> = [
    // efforts seuls (6.5 / 6.9, 6.12) : (6.41) ne contient pas le terme N
    ['N', parts.N ?? 0],
    ['My', parts.My ?? 0],
    ['Mz', parts.Mz ?? 0],
    [secWhere?.key ?? '6.2', secEta],
    [stabKey || '6.61', stabEta],
    [(parts.Vz ?? 0) >= (parts.Vy ?? 0) ? 'Vz' : 'Vy', shear],
    ['T', parts.T ?? 0],
  ];
  const [governing, eta] = cands.reduce((a, b) => (b[1] > a[1] ? b : a));
  return { eta, governing, cls, records, parts, method };
}
