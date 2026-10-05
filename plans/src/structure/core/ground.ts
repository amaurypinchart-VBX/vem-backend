// Charges au sol et répartition (§ 11) : plaques de calage en contreplaqué (algorithme des notes statico), tôle acier,
// diffusion à 45° par couches, longrines bois sur sol élastique (Winkler, calculées avec le solveur 3D), choix dans les
// épaisseurs du commerce ou le stock, liste de matériel. Fonctions pures ; unités N, mm, N/mm² ; les enregistrements
// de calcul sont écrits en kN / cm comme les notes statico.
import type { CalcRecord } from './records';
import { verdictOf } from './records';
import { fmtNumber } from './units';
import { analyze } from './fem/analysis';
import type { FemModel, LoadSet, SupportDof } from './fem/types';

// ─── affichage façon statico ───
const kN = (n: number, d = 2) => `${fmtNumber(n / 1e3, d)} kN`;
const cmv = (mm: number, d = 2) => `${fmtNumber(mm / 10, d)} cm`;
const kNm2 = (s: number, d = 0) => `${fmtNumber(s * 1e3, d)} kN/m²`;
const kNcm2 = (s: number, d = 2) => `${fmtNumber(s / 10, d)} kN/cm²`;
const m2 = (a: number, d = 2) => `${fmtNumber(a / 1e6, d)} m²`;
const kNcmPerCm = (m: number, d = 2) => `${fmtNumber(m / 1e3, d)} kNcm/cm`;
const cm3PerCm = (w: number, d = 2) => `${fmtNumber(w / 100, d)} cm³/cm`;
const num = (x: number, d = 2) => fmtNumber(x, d);

/** arrondi au pas supérieur, insensible aux erreurs d'arrondi (7,2999999 → 7,3) */
export const ceilTo = (x: number, step: number) => Math.ceil(x / step - 1e-9) * step;

// ─── portance ───

export interface BearingPreset {
  key: string;
  label: string;
  /** portance admissible (N/mm²) ; null = à saisir */
  value: number | null;
  /** charge ponctuelle admissible (N) à saisir aussi (dalles) */
  pointLoad?: boolean;
  source: string;
}

export const BEARING_PRESETS: BearingPreset[] = [
  { key: 'meadow', label: 'Sol légèrement déformable (prairie carrossable)', value: 0.2, source: 'DIN EN 13814 ; statico 24-0571 § 3.12' },
  { key: 'small', label: 'Petits appuis (escaliers)', value: 0.15, source: 'statico 24-0571 § 3.12.7' },
  { key: 'firm', label: 'Sol ferme', value: 0.5, source: 'statico 24-0571 § 3.12.2' },
  { key: 'asphalt', label: 'Enrobé', value: null, source: 'à renseigner (exploitant du site)' },
  { key: 'concrete', label: 'Béton', value: null, source: 'à renseigner (exploitant du site)' },
  { key: 'slab', label: 'Dalle / plancher de hall', value: null, pointLoad: true, source: 'à renseigner (fiche du bâtiment : charge surfacique et ponctuelle)' },
  { key: 'roof', label: 'Toiture-terrasse', value: null, pointLoad: true, source: 'à renseigner (bureau d’études du bâtiment)' },
];

export type BearingUnit = 'kN/m²' | 'kg/m²' | 't/m²' | 'kg/cm²';

/** Portance saisie dans une unité usuelle → N/mm² (1 kN/m² ≈ 102 kg/m² ; 1 kg/cm² = 10 t/m²). */
export function bearingFrom(value: number, unit: BearingUnit): number {
  if (unit === 'kN/m²') return value * 1e-3;
  if (unit === 'kg/m²') return value * 9.81e-6;
  if (unit === 't/m²') return value * 9.81e-3;
  return value * 9.81e-2;
}

export const GROUND_NOTE = 'Portance à vérifier sur site par l’exploitant. Calage valable sur sol légèrement compressible (prairie carrossable) ; sol dur (béton, asphalte) : seul le frottement compte ; sol détrempé : étude particulière (statico 18-0573 § 3.9).';

// ─── plaques de contreplaqué (méthode statico) ───

export interface WoodPanel {
  /** résistances caractéristiques (N/mm²) : flexion (direction faible), compression transversale */
  fmk: number;
  fc90k: number;
  kmod: number;
  gammaM: number;
  /** masse volumique (kg/m³), pour la liste de matériel */
  rho: number;
}

/** Contreplaqué F40/30 non revêtu, court terme, classe de service 2 (statico 24-0571 § 3.12). */
export const PLYWOOD_F40: WoodPanel = { fmk: 30, fc90k: 9, kmod: 0.9, gammaM: 1.3, rho: 600 };

/**
 * Multiplex bouleau (plaques de calage Viewbox, 18 et 36 mm) : flexion = plus faible valeur caractéristique des deux
 * directions sur les épaisseurs 18 à 30 mm de la fiche Metsä (Birch Ply — technical data, 2024, p. 2 : 18 mm
 * fm a 34,1 / fm b 40,2 N/mm², EN 789, 12 % d'humidité ; 36 mm hors du tableau, même valeur prise) ; compression
 * transversale reprise du F40/30 (9 N/mm², non donnée par la fiche) ; masse 12,2 kg/m² en 18 mm → 680 kg/m³.
 * Valeurs à confirmer pour le fournisseur réel des plaques.
 */
export const BIRCH_MULTIPLEX: WoodPanel = { fmk: 34.1, fc90k: 9, kmod: 0.9, gammaM: 1.3, rho: 680 };

export type PanelMaterial = 'birch' | 'F40';
export const PANELS: Record<PanelMaterial, { panel: WoodPanel; label: string }> = {
  birch: { panel: BIRCH_MULTIPLEX, label: 'Multiplex bouleau' },
  F40: { panel: PLYWOOD_F40, label: 'Contreplaqué F40/30' },
};

export interface PlateInput {
  /** réaction de calcul (ELU) et caractéristique (ELS) du groupe d'appuis (N) ; Rzk absent = Rz,Ed / rdToRk */
  RzEd: number;
  Rzk?: number;
  rdToRk?: number;
  /** portance admissible (N/mm²) */
  bearing: number;
  /** surface de contact de l'appui sur la plaque (mm) */
  a1: number;
  a2: number;
  panel?: WoodPanel;
  sideStep?: number;
  thicknessStep?: number;
  minThickness?: number;
  /** côté imposé (plaque du stock) */
  side?: number;
}

export interface PlateResult {
  Rzk: number;
  side: number;
  A: number;
  sigmaB: number;
  etaGround: number;
  e: number;
  MEd: number;
  fmd: number;
  fc90d: number;
  /** module de flexion requis par mm de largeur (mm³/mm) */
  Wreq: number;
  /** épaisseur requise par plaque pour 1, 2, 3 plaques empilées (mm, arrondie) */
  h: [number, number, number];
  sigmaC90: number;
  etaC90: number;
  records: CalcRecord[];
}

/** Épaisseur requise (mm) de chaque plaque quand n plaques identiques sont empilées (elles fléchissent séparément). */
export function plyThickness(Wreq: number, n: number, step = 1, min = 12): number {
  return Math.max(min, ceilTo(Math.sqrt((6 * Wreq) / n), step));
}

export function sizePlate(inp: PlateInput): PlateResult {
  const p = inp.panel ?? PLYWOOD_F40;
  const step = inp.sideStep ?? 50;
  const conv = inp.rdToRk ?? 1.35;
  const Rzk = inp.Rzk ?? inp.RzEd / conv;
  const { a1, a2, RzEd, bearing } = inp;
  const side = inp.side ?? Math.max(ceilTo(Math.sqrt(Rzk / bearing), step), ceilTo(Math.max(a1, a2), step));
  const A = side * side;
  const sigmaB = Rzk / A;
  const e = Math.hypot((side - a1) / 2, (side - a2) / 2);
  const MEd = (RzEd / A) * (e * e) / 2;
  const fmd = (p.kmod * p.fmk) / p.gammaM;
  const fc90d = (p.kmod * p.fc90k) / p.gammaM;
  const Wreq = MEd / fmd;
  const h: [number, number, number] = [1, 2, 3].map((n) => plyThickness(Wreq, n, inp.thicknessStep ?? 1, inp.minThickness ?? 12)) as [number, number, number];
  const sigmaC90 = RzEd / (a1 * a2);
  const records: CalcRecord[] = [
    {
      key: 'ground.rzk',
      title: 'Réaction caractéristique',
      clause: inp.Rzk === undefined ? 'méthode statico (Rz,k ≈ Rz,Ed / 1,35)' : 'combinaison caractéristique (ELS)',
      formula: inp.Rzk === undefined ? 'Rz,k = Rz,Ed / 1,35' : 'Rz,k = max Rz (ELS)',
      withValues: inp.Rzk === undefined ? `Rz,k = ${kN(RzEd)} / ${num(conv)} = ${kN(Rzk)}` : `Rz,k = ${kN(Rzk)} (Rz,Ed = ${kN(RzEd)})`,
      result: Rzk,
    },
    {
      key: 'ground.pressure',
      title: 'Pression au sol',
      clause: 'DIN EN 13814',
      formula: 'σB = Rz,k / A ≤ zul. σB',
      withValues: `b = l = ${cmv(side, 0)} ; A = ${m2(A)} ; σB = ${kN(Rzk)} / ${m2(A)} = ${kNm2(sigmaB)} ≤ ${kNm2(bearing)}`,
      result: sigmaB,
      limit: bearing,
      eta: sigmaB / bearing,
    },
    {
      key: 'ground.plate.bending',
      title: 'Flexion de la plaque (porte-à-faux diagonal)',
      clause: 'DIN EN 1995-1-1 ; méthode statico',
      formula: 'e = √(((l − a1)/2)² + ((b − a2)/2)²) ; MEd = Rz,Ed / A · e² / 2 ; erf. W = MEd / fm,d ; erf. h = √(6 · erf. W / n)',
      withValues:
        `e = ${cmv(e)} ; MEd = ${kN(RzEd)} / ${m2(A)} · (${cmv(e)})² / 2 = ${kNcmPerCm(MEd)} ; ` +
        `fm,d = ${num(p.kmod, 1)} · ${num(p.fmk / 10)} kN/cm² / ${num(p.gammaM, 1)} = ${kNcm2(fmd)} ; erf. W = ${cm3PerCm(Wreq)} ; ` +
        `h = ${h.map((x, k) => `${cmv(x, 1)} (${k + 1} plaque${k ? 's' : ''})`).join(' / ')}`,
      result: Wreq,
    },
    {
      key: 'ground.plate.c90',
      title: 'Compression transversale sous l’appui',
      clause: 'DIN EN 1995-1-1 6.1.5',
      formula: 'σc,90,d = Rz,Ed / (a1 · a2) ≤ fc,90,d = kmod · fc,90,k / γM',
      withValues: `σc,90,d = ${kN(RzEd)} / (${cmv(a1)} · ${cmv(a2)}) = ${kNcm2(sigmaC90)} ≤ ${kNcm2(fc90d)}`,
      result: sigmaC90,
      limit: fc90d,
      eta: sigmaC90 / fc90d,
    },
  ];
  return { Rzk, side, A, sigmaB, etaGround: sigmaB / bearing, e, MEd, fmd, fc90d, Wreq, h, sigmaC90, etaC90: sigmaC90 / fc90d, records };
}

export interface PlyChoice {
  /** épaisseur d'une plaque (mm) et nombre de plaques empilées */
  t: number;
  n: number;
  /** plaque du stock utilisée (sinon plaque du commerce découpée au côté requis) */
  stockIndex?: number;
  /** pièces nécessaires en tout et pièces disponibles (stock) */
  needed: number;
  available?: number;
}

/** Choix dans les épaisseurs du commerce : le moins de plaques, puis la plus faible épaisseur totale. */
export function choosePlywood(Wreq: number, thicknesses: number[], groups: number, min = 12): PlyChoice | null {
  let best: PlyChoice | null = null;
  for (const t of thicknesses) {
    if (t < min) continue;
    const n = Math.max(1, Math.ceil((6 * Wreq) / (t * t) - 1e-9));
    const c = { t, n, needed: n * groups };
    if (!best || n < best.n || (n === best.n && n * t < best.n * best.t)) best = c;
  }
  return best;
}

export interface StockPlate {
  label?: string;
  length: number;
  width: number;
  thickness: number;
  /** pièces disponibles au dépôt ; 0 = quantité non renseignée (pas de contrôle de quantité) */
  quantity: number;
  /** matériau de la plaque (défaut F40/30, comme avant les plaques de calage Viewbox) */
  material?: PanelMaterial;
}

/** Clé d'une plaque du stock (choix de calage enregistrés) : matériau et dimensions. */
export const plateKey = (s: StockPlate) => `${s.material ?? 'F40'}:${s.length}x${s.width}x${s.thickness}`;

/** « Multiplex bouleau 70 × 70 × 36 mm ». */
export const stockPlateLabel = (s: StockPlate) => `${PANELS[s.material ?? 'F40'].label} ${s.length / 10} × ${s.width / 10} × ${s.thickness} mm`;

/**
 * Couche de calage sous un appui : n plaques identiques empilées (bois ou tôle, elles fléchissent séparément), ou
 * plaque de répartition du commerce (charge admissible du fabricant, répartit sur toute sa surface).
 */
export interface SpreadLayer {
  key: string;
  label: string;
  l: number;
  w: number;
  t: number;
  n: number;
  material: PanelMaterial | 'steel' | 'commercial';
  capacity?: number;
  /** masse d'une plaque (kg) */
  massKg: number;
}

export function stockLayer(s: StockPlate, n: number): SpreadLayer {
  const mat = s.material ?? 'F40';
  return { key: plateKey(s), label: stockPlateLabel(s), l: s.length, w: s.width, t: s.thickness, n, material: mat, massKg: (s.length * s.width * s.thickness * PANELS[mat].panel.rho) / 1e9 };
}

/** Plaques de calage Viewbox : multiplex bouleau 18 et 36 mm, 40 × 40, 70 × 70 et 100 × 100 cm (quantités à saisir). */
export const VIEWBOX_STOCK: StockPlate[] = [400, 700, 1000].flatMap((side) =>
  [18, 36].map((thickness) => ({ label: `Multiplex bouleau ${side / 10} × ${side / 10}`, length: side, width: side, thickness, quantity: 0, material: 'birch' as const })),
);

/** Plaques du stock : chaque dimension assez grande est recalculée à sa taille réelle (plus grande = plus de moment). */
export function chooseFromStock(base: PlateInput, stock: StockPlate[], groups: number): Array<PlyChoice & { result: PlateResult }> {
  const out: Array<PlyChoice & { result: PlateResult }> = [];
  const need = sizePlate(base).side;
  stock.forEach((s, k) => {
    const side = Math.min(s.length, s.width);
    if (side < need || s.thickness < (base.minThickness ?? 12)) return;
    const result = sizePlate({ ...base, side, panel: PANELS[s.material ?? 'F40'].panel });
    const n = Math.max(1, Math.ceil((6 * result.Wreq) / (s.thickness * s.thickness) - 1e-9));
    out.push({ t: s.thickness, n, stockIndex: k, needed: n * groups, available: s.quantity > 0 ? s.quantity : undefined, result });
  });
  const enough = (c: PlyChoice) => (c.available === undefined || c.available >= c.needed ? 1 : 0);
  // la plus petite plaque qui suffit, puis le moins de plaques empilées, puis la plus faible épaisseur totale
  const area = (c: PlyChoice) => stock[c.stockIndex!].length * stock[c.stockIndex!].width;
  return out.sort((a, b) => enough(b) - enough(a) || a.n - b.n || area(a) - area(b) || a.n * a.t - b.n * b.t);
}

// ─── tôle acier ───

export const STEEL_PLATE_THICKNESSES = [5, 6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50];

export interface SteelPlateResult {
  side: number;
  e: number;
  MEd: number;
  tReq: number;
  t: number | null;
  massKg: number;
  records: CalcRecord[];
}

/** Tôle S235 de même côté que la plaque bois (même pression au sol) : t = √(6 · MEd / fy,d). */
export function steelPlate(inp: PlateInput, fy = 235, gammaM0 = 1.0, thicknesses = STEEL_PLATE_THICKNESSES): SteelPlateResult {
  const wood = sizePlate(inp);
  const fyd = fy / gammaM0;
  const tReq = Math.sqrt((6 * wood.MEd) / fyd);
  const t = thicknesses.find((x) => x >= tReq - 1e-9) ?? null;
  const massKg = t ? (wood.A * t * 7850) / 1e9 : NaN;
  return {
    side: wood.side,
    e: wood.e,
    MEd: wood.MEd,
    tReq,
    t,
    massKg,
    records: [
      wood.records[1],
      {
        key: 'ground.steel.bending',
        title: 'Flexion de la tôle acier',
        clause: 'DIN EN 1993-1-1 (élastique, pression uniforme sous la tôle)',
        formula: 't = √(6 · MEd / fy,d)',
        withValues: `MEd = ${kNcmPerCm(wood.MEd)} ; fy,d = ${num(fyd, 0)} N/mm² ; t = ${cmv(tReq)} → ${t ? `${t} mm` : 'hors des épaisseurs du commerce'}`,
        result: tReq,
        limit: t ?? undefined,
        eta: t ? (tReq / t) ** 2 : undefined,
      },
    ],
  };
}

// ─── diffusion à 45° par couches ───

/** Épaisseur de couches (mm) pour que la surface diffusée à 45° (a1 + 2H)(a2 + 2H) ramène la pression à la portance. */
export function diffusionDepth(Rzk: number, bearing: number, a1: number, a2: number): { H: number; record: CalcRecord } {
  const Areq = Rzk / bearing;
  const s = a1 + a2;
  const H = Math.max(0, (-2 * s + Math.sqrt(4 * s * s - 16 * (a1 * a2 - Areq))) / 8);
  return {
    H,
    record: {
      key: 'ground.diffusion',
      title: 'Répartition à 45° à travers des couches continues',
      clause: 'hypothèse de diffusion à 45° (couches continues, rigides et bien calées)',
      formula: '(a1 + 2 H) · (a2 + 2 H) ≥ Rz,k / zul. σB',
      withValues: `Rz,k / zul. σB = ${m2(Areq)} → H ≥ ${cmv(H, 1)}`,
      result: H,
    },
  };
}

// ─── longrines sur sol élastique ───

export interface TimberBeam {
  /** largeur et hauteur d'une pièce (mm) */
  b: number;
  h: number;
  E: number;
  fmk: number;
  fvk: number;
  fc90k: number;
  rho: number;
}

export const C24_BEAMS: Array<Pick<TimberBeam, 'b' | 'h'>> = [
  { b: 75, h: 225 },
  { b: 100, h: 200 },
  { b: 150, h: 150 },
  { b: 200, h: 200 },
];

export const C24 = { E: 11000, fmk: 24, fvk: 4.0, fc90k: 2.5, rho: 420 };

/** Coefficients de réaction du sol (N/mm³) : valeurs indicatives, à confirmer par une étude de sol. */
export const SUBGRADE_PRESETS = [
  { key: 'soft', label: 'Sol meuble (10 MN/m³)', k: 0.01 },
  { key: 'medium', label: 'Sol moyen (30 MN/m³)', k: 0.03 },
  { key: 'firm', label: 'Sol compact (80 MN/m³)', k: 0.08 },
  { key: 'gravel', label: 'Grave compactée (150 MN/m³)', k: 0.15 },
];

export interface LongrineInput {
  /** charges (N) aux abscisses x (mm) depuis le bout de la longrine */
  loads: Array<{ x: number; Pk: number; PEd: number }>;
  length: number;
  beam: Pick<TimberBeam, 'b' | 'h'>;
  /** nombre de pièces côte à côte */
  count: number;
  k: number;
  bearing: number;
  /** longueur d'appui de l'angle le long de la longrine (mm) */
  contact: number;
  kmod?: number;
  gammaM?: number;
  /** sol sans traction (défaut) : la longrine peut décoller ; false = ressorts bilatéraux (solution de Hetényi) */
  tensionless?: boolean;
}

export interface LongrineResult {
  pMaxK: number;
  pUniformK: number;
  MEd: number;
  VEd: number;
  sigmaM: number;
  fmd: number;
  tau: number;
  fvd: number;
  sigmaC90: number;
  fc90dk: number;
  eta: number;
  massKg: number;
  records: CalcRecord[];
}

/** Poutre sur appuis élastiques (Winkler) : un ressort vertical k · B · Δx par nœud, en compression seule. */
function winkler(inp: LongrineInput, which: 'Pk' | 'PEd', rigidAtLoads: boolean): { p: number[]; M: number; V: number; dx: number } {
  const { length: L, beam, count } = inp;
  const B = beam.b * count;
  const nseg = Math.max(20, Math.ceil(L / 50));
  const dx = L / nseg;
  const model: FemModel = { nodes: [], members: [], supports: [] };
  for (let k = 0; k <= nseg; k++) model.nodes.push({ id: `L${k}`, x: k * dx, y: 0, z: 0 });
  const I = (B * beam.h ** 3) / 12;
  for (let k = 0; k < nseg; k++) model.members.push({ id: `b${k}`, i: k, j: k + 1, E: C24.E, G: C24.E / 16, A: B * beam.h, Iy: I, Iz: I, It: I });
  const sumP = inp.loads.reduce((s, l) => s + l[which], 0);
  const set: LoadSet = { id: which, nodal: [], member: [] };
  if (rigidAtLoads && inp.loads.length >= 2) {
    // méthode simplifiée : pression uniforme vers le haut, appuis rigides aux points de charge
    for (let k = 0; k < nseg; k++) set.member.push({ member: k, kind: 'distributed', dir: 'Y', q1: sumP / L });
    const at = new Set(inp.loads.map((l) => Math.round(l.x / dx)));
    for (let k = 0; k <= nseg; k++) {
      const vertical: SupportDof = at.has(k) ? 'fixed' : 'free';
      model.supports.push({ node: k, dofs: [k === 0 ? 'fixed' : 'free', vertical, 'fixed', 'fixed', 'fixed', 'free'] });
    }
  } else {
    for (let k = 0; k <= nseg; k++) {
      const trib = k === 0 || k === nseg ? dx / 2 : dx;
      model.supports.push({
        node: k,
        dofs: [k === 0 ? 'fixed' : 'free', inp.k * B * trib, 'fixed', 'fixed', 'fixed', 'free'],
        compressionOnly: inp.tensionless ?? true,
        upliftReleases: 'vertical',
      });
    }
    for (const l of inp.loads) {
      const m = Math.min(nseg - 1, Math.floor(l.x / dx));
      set.member.push({ member: m, kind: 'point', dir: 'Y', P: -l[which], a: l.x - m * dx });
    }
  }
  const [r] = analyze(model, [set], { stations: 3 });
  const p = rigidAtLoads && inp.loads.length >= 2 ? [] : r.reactions.map((x, k) => x.R[1] / (B * (k === 0 || k === nseg ? dx / 2 : dx)));
  let M = 0;
  let V = 0;
  for (const m of r.members)
    for (const s of m.stations) {
      M = Math.max(M, Math.abs(s.My));
      V = Math.max(V, Math.abs(s.Vz));
    }
  return { p, M, V, dx };
}

export function checkLongrine(inp: LongrineInput): LongrineResult {
  const kmod = inp.kmod ?? 0.9;
  const gM = inp.gammaM ?? 1.3;
  const B = inp.beam.b * inp.count;
  const h = inp.beam.h;
  const elastic = winkler(inp, 'Pk', false);
  const elasticEd = winkler(inp, 'PEd', false);
  const uniformEd = winkler(inp, 'PEd', true);
  const pMaxK = Math.max(...elastic.p);
  const pUniformK = inp.loads.reduce((s, l) => s + l.Pk, 0) / (B * inp.length);
  // moment : le plus défavorable de la poutre sur sol élastique et de la pression uniforme (prudent)
  const MEd = Math.max(elasticEd.M, uniformEd.M);
  const VEd = Math.max(elasticEd.V, uniformEd.V);
  const W = (B * h * h) / 6;
  const fmd = (kmod * C24.fmk) / gM;
  const sigmaM = MEd / W;
  const kcr = 0.67;
  const fvd = (kmod * C24.fvk) / gM;
  const tau = (1.5 * VEd) / (kcr * B * h);
  const PEdMax = Math.max(...inp.loads.map((l) => l.PEd));
  // compression transversale sous l'angle : longueur efficace + 30 mm de chaque côté, kc,90 = 1,25 (appui continu)
  const Aef = B * (inp.contact + 60);
  const fc90dk = (1.25 * kmod * C24.fc90k) / gM;
  const sigmaC90 = PEdMax / Aef;
  const massKg = (B * h * inp.length * C24.rho) / 1e9;
  const records: CalcRecord[] = [
    {
      key: 'longrine.pressure',
      title: 'Pression au sol sous la longrine (sol élastique)',
      clause: 'poutre sur appuis élastiques (Winkler), charges caractéristiques',
      formula: 'max p = max Ri / (B · Δx) ≤ zul. σB',
      withValues: `k = ${num(inp.k * 1e3, 0)} MN/m³ ; B = ${cmv(B, 0)} ; max p = ${kNm2(pMaxK)} (moyenne ${kNm2(pUniformK)}) ≤ ${kNm2(inp.bearing)}`,
      result: pMaxK,
      limit: inp.bearing,
      eta: pMaxK / inp.bearing,
    },
    {
      key: 'longrine.bending',
      title: 'Flexion de la longrine',
      clause: 'DIN EN 1995-1-1 6.1.6 (max. sol élastique / pression uniforme)',
      formula: 'σm,d = MEd / W ≤ fm,d = kmod · fm,k / γM',
      withValues: `MEd = ${num(MEd / 1e6)} kNm ; W = ${num(W / 1e3, 0)} cm³ ; σm,d = ${num(sigmaM)} N/mm² ≤ ${num(fmd)} N/mm²`,
      result: sigmaM,
      limit: fmd,
      eta: sigmaM / fmd,
    },
    {
      key: 'longrine.shear',
      title: 'Cisaillement de la longrine',
      clause: 'DIN EN 1995-1-1 6.1.7 (kcr = 0,67)',
      formula: 'τd = 1,5 · VEd / (kcr · B · h) ≤ fv,d',
      withValues: `VEd = ${kN(VEd)} ; τd = ${num(tau)} N/mm² ≤ ${num(fvd)} N/mm²`,
      result: tau,
      limit: fvd,
      eta: tau / fvd,
    },
    {
      key: 'longrine.c90',
      title: 'Compression transversale sous l’angle',
      clause: 'DIN EN 1995-1-1 6.1.5 (kc,90 = 1,25, appui continu)',
      formula: 'σc,90,d = F / (B · (a + 60 mm)) ≤ kc,90 · fc,90,d',
      withValues: `F = ${kN(PEdMax)} ; σc,90,d = ${num(sigmaC90)} N/mm² ≤ ${num(fc90dk)} N/mm²`,
      result: sigmaC90,
      limit: fc90dk,
      eta: sigmaC90 / fc90dk,
    },
  ];
  const eta = Math.max(...records.map((r) => r.eta ?? 0));
  return { pMaxK, pUniformK, MEd, VEd, sigmaM, fmd, tau, fvd, sigmaC90, fc90dk, eta, massKg, records };
}

/** Longrine la plus légère (sections × nombre de pièces ≤ maxCount) qui passe toutes les vérifications. */
export function chooseLongrine(
  base: Omit<LongrineInput, 'beam' | 'count'>,
  beams: Array<Pick<TimberBeam, 'b' | 'h'>> = C24_BEAMS,
  maxCount = 6,
): { beam: Pick<TimberBeam, 'b' | 'h'>; count: number; result: LongrineResult } | null {
  let best: { beam: Pick<TimberBeam, 'b' | 'h'>; count: number; result: LongrineResult } | null = null;
  for (const beam of beams)
    for (let count = 1; count <= maxCount; count++) {
      const result = checkLongrine({ ...base, beam, count });
      if (result.eta > 1) continue;
      if (!best || result.massKg < best.result.massKg) best = { beam, count, result };
      break;
    }
  return best;
}

// ─── synthèse par type de groupe d'appuis ───

export type SolutionKind = 'plywood' | 'plywood-stock' | 'steel' | 'longrine' | 'diffusion' | 'commercial' | 'custom' | 'roadway';

export interface MaterialLine {
  label: string;
  dims: string;
  quantity: number;
  massKg: number;
}

export interface Solution {
  kind: SolutionKind;
  title: string;
  /** description courte : « 2 × 60 × 60 × 27 mm par angle » */
  summary: string;
  feasible: boolean;
  /** raisons de réserve (trop grand, plus de 3 plis, stock insuffisant…) */
  remarks: string[];
  eta: number;
  materials: MaterialLine[];
  records: CalcRecord[];
  /** emprise d'une plaque sous le groupe d'appuis (mm), pour le plan de calage */
  footprint?: { l: number; w: number };
  /** couches de plaques sous chaque appui, du haut vers le bas (chaîne de répartition appui par appui) */
  layers?: SpreadLayer[];
}

export interface CommercialPlate {
  label: string;
  length: number;
  width: number;
  /** charge admissible du fabricant (N, caractéristique) */
  capacity: number;
  massKg: number;
}

export interface GroupDesignInput {
  /** type de groupe (« 1 angle », « 2 angles »…) et nombre de groupes de ce type */
  label: string;
  groups: number;
  RzEd: number;
  Rzk?: number;
  bearing: number;
  /** charge ponctuelle admissible du support (dalle) */
  pointLoadMax?: number;
  a1: number;
  a2: number;
  thicknesses?: number[];
  stock?: StockPlate[];
  commercial?: CommercialPlate[];
  maxSide?: number;
  maxPlies?: number;
}

/** Solutions de calage pour un type de groupe d'appuis : plaques bois (commerce, stock), tôle, plaques du commerce, couches. */
export function designGroup(g: GroupDesignInput): { plate: PlateResult; solutions: Solution[]; point?: CalcRecord } {
  const base: PlateInput = { RzEd: g.RzEd, Rzk: g.Rzk, bearing: g.bearing, a1: g.a1, a2: g.a2 };
  const plate = sizePlate(base);
  const maxSide = g.maxSide ?? 1200;
  const maxPlies = g.maxPlies ?? 3;
  const solutions: Solution[] = [];
  const woodMass = (side: number, t: number) => (side * side * t * PLYWOOD_F40.rho) / 1e9;
  // contreplaqué du commerce découpé au côté requis
  const ply = choosePlywood(plate.Wreq, g.thicknesses ?? [18, 21, 24, 27, 30, 40], g.groups);
  if (ply) {
    const remarks: string[] = [];
    if (plate.side > maxSide) remarks.push(`plaque de ${cmv(plate.side, 0)} de côté : plus grande que ${cmv(maxSide, 0)}`);
    if (ply.n > maxPlies) remarks.push(`${ply.n} plaques empilées (plus de ${maxPlies})`);
    if (plate.etaC90 > 1) remarks.push('compression transversale dépassée sous l’appui');
    const s = `${plate.side / 10}`;
    solutions.push({
      kind: 'plywood',
      title: 'Plaques de contreplaqué F40/30',
      summary: `${ply.n} × ${s} × ${s} × ${ply.t} mm par ${g.label}`,
      feasible: !remarks.length,
      remarks,
      eta: Math.max(plate.etaGround, plate.etaC90, (6 * plate.Wreq) / (ply.n * ply.t * ply.t)),
      materials: [{ label: 'Contreplaqué F40/30', dims: `${plate.side} × ${plate.side} × ${ply.t} mm`, quantity: ply.needed, massKg: woodMass(plate.side, ply.t) * ply.needed }],
      records: plate.records,
      footprint: { l: plate.side, w: plate.side },
      layers: [
        {
          key: `cut:F40:${plate.side}x${plate.side}x${ply.t}`,
          label: `Contreplaqué F40/30 ${s} × ${s} × ${ply.t} mm`,
          l: plate.side,
          w: plate.side,
          t: ply.t,
          n: ply.n,
          material: 'F40',
          massKg: woodMass(plate.side, ply.t),
        },
      ],
    });
  }
  // plaques du stock
  for (const c of chooseFromStock(base, g.stock ?? [], g.groups).slice(0, 2)) {
    const st = g.stock![c.stockIndex!];
    const mat = PANELS[st.material ?? 'F40'];
    const remarks: string[] = [];
    if (c.available !== undefined && c.available < c.needed) remarks.push(`stock insuffisant : ${c.needed} pièces nécessaires, ${c.available} disponibles`);
    if (c.n > maxPlies) remarks.push(`${c.n} plaques empilées (plus de ${maxPlies})`);
    if (c.result.etaC90 > 1) remarks.push('compression transversale dépassée sous l’appui');
    solutions.push({
      kind: 'plywood-stock',
      title: `Plaques du stock${st.label ? ` « ${st.label} »` : ` (${mat.label})`}`,
      summary: `${c.n} × ${st.length / 10} × ${st.width / 10} × ${st.thickness} mm par ${g.label}`,
      feasible: !remarks.length && c.result.etaGround <= 1,
      remarks,
      eta: Math.max(c.result.etaGround, c.result.etaC90, (6 * c.result.Wreq) / (c.n * c.t * c.t)),
      materials: [{ label: `${mat.label} (stock${c.available === undefined ? ', quantité à vérifier au dépôt' : ''})`, dims: `${st.length} × ${st.width} × ${st.thickness} mm`, quantity: c.needed, massKg: (st.length * st.width * st.thickness * mat.panel.rho * c.needed) / 1e9 }],
      records: c.result.records,
      footprint: { l: st.length, w: st.width },
      layers: [stockLayer(st, c.n)],
    });
  }
  // tôle acier
  const steel = steelPlate(base);
  {
    const remarks: string[] = [];
    if (!steel.t) remarks.push('épaisseur hors des tôles courantes');
    if (steel.side > 1500) remarks.push(`tôle de ${cmv(steel.side, 0)} de côté`);
    if (steel.massKg > 150) remarks.push(`${num(steel.massKg, 0)} kg par tôle : manutention mécanique`);
    solutions.push({
      kind: 'steel',
      title: 'Tôle acier S235',
      summary: steel.t ? `1 tôle ${steel.side / 10} × ${steel.side / 10} × ${steel.t} mm par ${g.label}` : 'aucune épaisseur courante suffisante',
      feasible: !!steel.t && steel.side <= 1500,
      remarks,
      eta: Math.max(plate.etaGround, steel.records[1].eta ?? Infinity),
      materials: steel.t ? [{ label: 'Tôle acier S235', dims: `${steel.side} × ${steel.side} × ${steel.t} mm`, quantity: g.groups, massKg: steel.massKg * g.groups }] : [],
      records: steel.records,
      ...(steel.t
        ? {
            footprint: { l: steel.side, w: steel.side },
            layers: [
              {
                key: `steel:${steel.side}x${steel.side}x${steel.t}`,
                label: `Tôle acier S235 ${steel.side / 10} × ${steel.side / 10} × ${steel.t} mm`,
                l: steel.side,
                w: steel.side,
                t: steel.t,
                n: 1,
                material: 'steel' as const,
                massKg: steel.massKg,
              },
            ],
          }
        : {}),
    });
  }
  // plaques de répartition du commerce (capacité du fabricant)
  for (const c of g.commercial ?? []) {
    const Rzk = plate.Rzk;
    const sigma = Rzk / (c.length * c.width);
    const remarks: string[] = [];
    if (Rzk > c.capacity) remarks.push(`charge ${kN(Rzk)} > capacité du fabricant ${kN(c.capacity)}`);
    if (sigma > g.bearing) remarks.push(`pression ${kNm2(sigma)} > portance`);
    solutions.push({
      kind: 'commercial',
      title: `Plaque de répartition « ${c.label} »`,
      summary: `1 plaque ${c.length / 10} × ${c.width / 10} cm par ${g.label}`,
      feasible: !remarks.length,
      remarks,
      eta: Math.max(Rzk / c.capacity, sigma / g.bearing),
      materials: [{ label: c.label, dims: `${c.length} × ${c.width} mm`, quantity: g.groups, massKg: c.massKg * g.groups }],
      records: [
        {
          key: 'ground.commercial',
          title: `Plaque « ${c.label} »`,
          clause: 'capacité du fabricant',
          formula: 'Rz,k ≤ Fadm ; σB = Rz,k / A ≤ zul. σB',
          withValues: `${kN(Rzk)} ≤ ${kN(c.capacity)} ; σB = ${kNm2(sigma)} ≤ ${kNm2(g.bearing)}`,
          eta: Math.max(Rzk / c.capacity, sigma / g.bearing),
        },
      ],
      footprint: { l: c.length, w: c.width },
      layers: [{ key: `com:${c.label}`, label: c.label, l: c.length, w: c.width, t: 0, n: 1, material: 'commercial', capacity: c.capacity, massKg: c.massKg }],
    });
  }
  let point: CalcRecord | undefined;
  if (g.pointLoadMax) {
    const eta = plate.Rzk / g.pointLoadMax;
    point = {
      key: 'ground.point',
      title: 'Charge ponctuelle admissible du support',
      clause: 'donnée du bâtiment',
      formula: 'Rz,k ≤ Fadm',
      withValues: `${kN(plate.Rzk)} ≤ ${kN(g.pointLoadMax)}`,
      result: plate.Rzk,
      limit: g.pointLoadMax,
      eta,
    };
  }
  return { plate, solutions, point };
}

/** Solution retenue : la première faisable dans l'ordre stock → contreplaqué → plaque du commerce → tôle. */
export function recommended(solutions: Solution[]): Solution | undefined {
  const order: SolutionKind[] = ['custom', 'roadway', 'plywood-stock', 'plywood', 'commercial', 'steel', 'longrine', 'diffusion'];
  return [...solutions].filter((s) => s.feasible && verdictOf(s.eta) !== 'fail').sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0];
}

/** Aucune solution standard : la moins mauvaise solution chiffrée (le moins de réserves, puis la plus légère). */
export function leastBad(solutions: Solution[]): Solution | undefined {
  const mass = (s: Solution) => s.materials.reduce((a, m) => a + m.massKg, 0);
  return [...solutions]
    .filter((s) => s.materials.length && verdictOf(s.eta) !== 'fail')
    .sort((a, b) => a.remarks.length - b.remarks.length || mass(a) - mass(b))[0];
}

export const plateLabel = (corners: number) => (corners === 1 ? 'angle' : `groupe de ${corners} angles`);
