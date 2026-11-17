// Plaques de roulage choisies sur une offre (location / vente) : acier, aluminium ou plastique, avec leurs données du
// fabricant, et leur vraie répartition sous chaque appui. Une plaque de roulage n'est pas un plateau rigide : posée
// sur le sol, elle fléchit et ne répartit la charge d'un pied qu'autour de lui, sur une distance qui dépend de sa
// raideur et de celle du sol (plaque sur sol élastique). Une tôle acier de 20 mm répartit sur ≈ 1 m², une plaque
// plastique de 20 mm sur quelques décimètres seulement. Fonctions pures ; N, mm, N/mm².
import { fmtNumber } from './units';

export type RoadwayMaterial = 'steel' | 'aluminium' | 'plastic';

/** Une plaque de roulage du commerce (fiche du fabricant / du loueur) ou saisie à la main. */
export interface RoadwayPlate {
  key: string;
  name: string;
  supplier: string;
  material: RoadwayMaterial;
  /** dimensions (mm) : longueur, largeur, épaisseur ; masse d'une plaque (kg) */
  l: number;
  w: number;
  t: number;
  massKg: number;
  /** offre : location, vente… (texte) */
  offer: string;
  /**
   * module d'élasticité (N/mm²) ; acier / aluminium : celui du métal par défaut ; plastique : à donner par le fabricant
   * pour la durée de la charge (le plastique flue sous une charge de plusieurs jours)
   */
  E?: number;
  /** raideur en flexion par mm de largeur (N·mm²/mm) donnée par le fabricant (plaque nervurée, alvéolée, profilée) */
  EI?: number;
  /** résistance caractéristique en flexion du matériau (N/mm²) ; acier / aluminium : valeur de la norme par défaut */
  fm?: number;
  /** résistance à la compression de la plaque (N/mm²) */
  fc?: number;
  /** poinçonnement donné par le fabricant (information) : kg sur un poinçon de diamètre (mm) */
  punching?: { kg: number; diameter: number };
  /** plaques reliées par verrous / connecteurs (l'effort passe d'une plaque à l'autre) ou simplement posées bord à bord */
  joints: 'locked' | 'loose';
  /** charge annoncée par le fabricant (texte, information : dépend du sol et du véhicule) */
  rated?: string;
  url?: string;
  /** d'où viennent les données */
  source: string;
  note?: string;
  /** plaque saisie par l'utilisateur (« Autre plaque ») */
  custom?: boolean;
}

export interface RoadwayMaterialData {
  label: string;
  /** masse volumique du matériau plein (kg/m³) */
  rho: number;
  E?: number;
  f?: number;
  gamma: number;
  /** coefficient de Poisson (information) */
  source: string;
}

export const ROADWAY_MATERIALS: Record<RoadwayMaterial, RoadwayMaterialData> = {
  steel: { label: 'Acier', rho: 7850, E: 210000, f: 235, gamma: 1.0, source: 'acier S235 : E = 210 000 N/mm², fy = 235 N/mm² (EN 1993-1-1 § 3.2), γM0 = 1,0' },
  aluminium: {
    label: 'Aluminium',
    rho: 2700,
    E: 70000,
    f: 110,
    gamma: 1.1,
    source: 'aluminium : E = 70 000 N/mm² (EN 1999-1-1 § 3.2.5) ; alliage non donné : f0 = 110 N/mm² (EN AW-6063 T5, 10 < t ≤ 25 mm, EN 755-2 — le plus faible des alliages courants de profilés), γM1 = 1,1',
  },
  plastic: { label: 'Plastique (PEHD, PP…)', rho: 950, gamma: 1.3, source: 'plastique : module et résistance en flexion à donner par le fabricant pour la durée de la charge (fluage) ; masse volumique du PEHD plein 950 kg/m³' },
};

export const ROADWAY_MATERIAL_ORDER: RoadwayMaterial[] = ['steel', 'aluminium', 'plastic'];

/**
 * Offres trouvées (17.11.2026). Données recopiées des fiches ; la masse des tôles acier = volume × 7 850 kg/m³. Les
 * plaques plastique n'ont pas de module d'élasticité publié : sans lui, seule la diffusion dans leur épaisseur compte.
 */
export const ROADWAY_PLATES: RoadwayPlate[] = [
  {
    key: 'steel-2000x1000x20',
    name: 'Tôle de roulage acier 2 000 × 1 000 × 20 mm',
    supplier: 'loueurs de matériel BTP',
    material: 'steel',
    l: 2000,
    w: 1000,
    t: 20,
    massKg: 314,
    offer: 'location (loueurs BTP, à demander)',
    joints: 'loose',
    source: 'tôle acier S235 pleine, posée bord à bord ; masse = 2 × 1 × 0,020 m³ × 7 850 kg/m³',
  },
  {
    key: 'steel-2000x1000x25',
    name: 'Tôle de roulage acier 2 000 × 1 000 × 25 mm',
    supplier: 'loueurs de matériel BTP',
    material: 'steel',
    l: 2000,
    w: 1000,
    t: 25,
    massKg: 393,
    offer: 'location (loueurs BTP, à demander)',
    joints: 'loose',
    source: 'tôle acier S235 pleine, posée bord à bord ; masse = 2 × 1 × 0,025 m³ × 7 850 kg/m³',
  },
  {
    key: 'steel-3000x1500x25',
    name: 'Tôle de roulage acier 3 000 × 1 500 × 25 mm',
    supplier: 'loueurs de matériel BTP',
    material: 'steel',
    l: 3000,
    w: 1500,
    t: 25,
    massKg: 883,
    offer: 'location (loueurs BTP, à demander) — manutention à la grue / au chariot',
    joints: 'loose',
    source: 'tôle acier S235 pleine, posée bord à bord ; masse = 3 × 1,5 × 0,025 m³ × 7 850 kg/m³',
  },
  {
    key: 'box-amp-panel',
    name: 'AmP Panel (aluminium) 3 000 × 1 150 × 40 mm',
    supplier: 'The Box Group',
    material: 'aluminium',
    l: 3000,
    w: 1150,
    t: 40,
    massKg: 104,
    offer: 'location (hire)',
    joints: 'locked',
    rated: 'jusqu’à 12,5 t par essieu, 100 t/m² en statique (selon le sol)',
    url: 'https://www.theboxgrp.com/amp-aluminium-trackway/',
    source: 'fiche The Box Group (AmP Panel) : 3 000 × 1 150 × 40 mm, 104 kg ; raideur non publiée → plaque pleine de même masse (côté de la sécurité)',
  },
  {
    key: 'envhyro-terratrak-plus',
    name: 'Terratrak Plus 2 200 × 1 100 × 38 mm (PEHD)',
    supplier: 'Envhyro',
    material: 'plastic',
    l: 2200,
    w: 1100,
    t: 38,
    massKg: 46,
    offer: 'location (Envhyro, accès temporaires — dépôts Yonne, Île-de-France, Var)',
    fc: 7.288,
    punching: { kg: 1173, diameter: 20 },
    joints: 'locked',
    rated: 'poinçonnement 1 173 kg sur Ø 20 mm ; compression 7 288 kN/m²',
    url: 'https://www.envhyro.fr',
    source: 'fiche technique Envhyro Terratrak Plus (PEHD vierge moussé, injection structurelle, plaques reliées par verrous) : 2,20 × 1,10 m × 38 mm, 46 kg',
  },
  {
    key: 'induplates-3000x1000x20',
    name: 'Plaque de roulage 3 000 × 1 000 × 20 mm (PE)',
    supplier: 'Induplates',
    material: 'plastic',
    l: 3000,
    w: 1000,
    t: 20,
    massKg: 54,
    offer: 'à demander (location ou vente)',
    joints: 'loose',
    rated: '60 t (charge répartie, selon le sol)',
    url: 'https://www.induplates.fr/fr/plaques-de-roulage/plaque-de-roulage-1000x3000x20.htm',
    source: 'fiche Induplates : 3 000 × 1 000 × 20 mm, 54 kg, 4 poignées, antidérapant une face, capacité 60 t',
  },
];

/** Plaque retenue : du catalogue, ou la plaque saisie à la main. */
export function findRoadwayPlate(key: string | undefined, custom?: RoadwayPlate | null): RoadwayPlate | null {
  if (!key) return null;
  if (custom && custom.key === key) return custom;
  return ROADWAY_PLATES.find((p) => p.key === key) ?? null;
}

const f = (v: number, d = 1) => fmtNumber(v, d);

/** Poids propre des plaques de roulage posées partout (N/mm²). */
export const roadwayPlateWeight = (p: RoadwayPlate) => (p.l > 0 && p.w > 0 ? (p.massKg * 9.81) / (p.l * p.w) : 0);

export interface RoadwayStiffness {
  /** raideur en flexion par mm de largeur (N·mm²/mm) ; null = inconnue (plastique sans module) */
  EI: number | null;
  /** fiche du fabricant, plaque pleine, ou plaque pleine de même masse (nervurée / alvéolée / moussée) */
  how: 'datasheet' | 'solid' | 'mass' | null;
  /** épaisseur de matière pleine de même masse (mm) et rapport à la plaque pleine */
  teq: number;
  ratio: number;
  E: number | null;
  /** résistance de calcul en flexion (N/mm²) et module de flexion par mm de largeur (mm³/mm) ; null = inconnue */
  fd: number | null;
  W: number | null;
  /** pourquoi la raideur est inconnue */
  reason?: string;
  text: string;
}

/**
 * Raideur d'une plaque : celle du fabricant ; sinon plaque pleine (masse ≥ 80 % de la matière pleine) E t³ / 12 ;
 * sinon plaque pleine de même masse, E · teq³ / 12 avec teq = masse / (ρ · surface) — à masse égale, mettre la
 * matière loin du milieu (nervures, caissons, peaux d'une mousse) ne fait qu'augmenter la raideur : c'est la valeur
 * minimale, côté de la sécurité. Même règle pour le module de flexion W.
 */
export function roadwayStiffness(p: RoadwayPlate): RoadwayStiffness {
  const mat = ROADWAY_MATERIALS[p.material];
  const vol = (p.l * p.w * p.t) / 1e9;
  const rhoEff = vol > 0 ? p.massKg / vol : mat.rho;
  const ratio = rhoEff / mat.rho;
  const solid = ratio >= 0.8;
  const teq = solid ? p.t : Math.min(p.t, ratio * p.t);
  const E = p.E ?? mat.E ?? null;
  const fk = p.fm ?? mat.f;
  const fd = fk ? fk / mat.gamma : null;
  const W = fd ? (teq * teq) / 6 : null;
  if (p.EI && p.EI > 0) return { EI: p.EI, how: 'datasheet', teq, ratio, E, fd, W, text: `raideur du fabricant E I = ${f(p.EI / 1e6, 2)} kN·m²/m` };
  if (!E) return { EI: null, how: null, teq, ratio, E: null, fd, W, reason: 'module d’élasticité du plastique non donné par le fabricant (à la durée de la charge)', text: 'raideur inconnue' };
  const EI = (E * teq ** 3) / 12;
  return solid
    ? { EI, how: 'solid', teq, ratio, E, fd, W, text: `plaque pleine : E I = E · t³ / 12 = ${f(E, 0)} × ${f(p.t, 0)}³ / 12 = ${f(EI / 1e6, 2)} kN·m²/m` }
    : {
        EI,
        how: 'mass',
        teq,
        ratio,
        E,
        fd,
        W,
        text: `plaque non pleine (${f(ratio * 100, 0)} % de la matière pleine) : raideur minimale d’une plaque pleine de même masse, teq = ${f(teq, 1)} mm → E I = ${f(E, 0)} × ${f(teq, 1)}³ / 12 = ${f(EI / 1e6, 2)} kN·m²/m`,
      };
}

/** Distance sur laquelle la plaque répartit au-delà de l'appui (mm), par sa raideur et celle du sol : c = (4 E I / k)^¼. */
export function roadwayReach(p: RoadwayPlate, k: number | undefined): number {
  const s = roadwayStiffness(p);
  if (!s.EI || !(k && k > 0)) return p.t;
  return Math.max(p.t, Math.pow((4 * s.EI) / k, 0.25));
}

export type RoadwayPosition = 'joint' | 'middle';

export interface RoadwaySpreadInput {
  plate: RoadwayPlate;
  /** surface d'appui sur la plaque (mm) : pied, ou emprise de la plaque / du bloc posé dessus */
  contact: [number, number];
  /** charges sur la plaque (N), poids des couches du dessus compris */
  Rk: number;
  REd: number;
  /** module de réaction du sol (N/mm³) */
  k?: number;
  /** appui n'importe où (il peut tomber sur un joint) ou au milieu d'une plaque (pose contrôlée) */
  position: RoadwayPosition;
  /** côté maxi de l'emprise (mm) : la moitié de chaque côté vers l'appui voisin le plus proche */
  cell?: number;
  /** distance de la charge au bord extérieur des plaques de roulage (mm, u / v) : emprise centrée, ≤ 2 × cette distance */
  edge?: [number, number];
}

export interface RoadwaySpread {
  footprint: [number, number];
  /** débord efficace au-delà de l'appui (mm), au milieu d'une plaque */
  overhang: number;
  mode: 'stiffness' | 'strength' | 'thickness';
  stiffness: RoadwayStiffness;
  /** au joint : la répartition à travers le joint est réduite (verrou : moitié, bord à bord : quart) */
  joint: 'none' | 'locked' | 'loose';
  /** emprise limitée par la taille de la plaque, par l'appui voisin, par le bord des plaques de roulage */
  limits: Array<'plate' | 'cell' | 'edge'>;
  /** flexion (N·mm/mm) : moment sous l'appui et moment résistant (Infinity = inconnu) */
  M: number;
  MRd: number;
  /** compression sous l'appui (N/mm²) et résistance de calcul (null = sans objet / inconnue) */
  sigmaC: number;
  fcd: number | null;
  /** poids propre des plaques (N/mm²) */
  weight: number;
  /** pression au sol sous l'emprise, poids des plaques compris (N/mm²) */
  pressure: number;
}

/**
 * Répartition par une plaque de roulage posée sur le sol (plaque sur sol élastique, même modèle que les plaques PEHD :
 * poutre de Hetényi, appui rigide) : débord efficace c = 1/β = (4 E I / k)^¼ de chaque côté de l'appui au milieu
 * d'une plaque. Sur un joint, à travers le joint : plaques verrouillées = deux bords qui portent chacun la moitié →
 * c/2 de chaque côté ; posées bord à bord = un bord libre → c/4 de chaque côté (pression ×2 et ×4 dans ce sens) ; le
 * plus défavorable des deux sens. Emprise ≤ la plaque (bord à bord) et ≤ la cellule de l'appui (pas de double compte
 * avec le voisin). Flexion : M = κ · q · c² / 2 ≤ fd · W (κ = 1,29 au bord libre, Hetényi) ; si elle ne passe pas,
 * l'emprise est réduite jusqu'à M = MRd. Sans raideur (plastique sans module) : diffusion à 45° dans l'épaisseur.
 */
export function roadwaySpread(inp: RoadwaySpreadInput): RoadwaySpread {
  const p = inp.plate;
  const s = roadwayStiffness(p);
  const [a1, a2] = inp.contact;
  const k = inp.k;
  let c = p.t;
  let mode: RoadwaySpread['mode'] = 'thickness';
  if (s.EI && k && k > 0) {
    c = Math.max(p.t, Math.pow((4 * s.EI) / k, 0.25));
    mode = 'stiffness';
  }
  // diffusion dans l'épaisseur seulement : locale, les joints n'y changent rien
  const joint: RoadwaySpread['joint'] = inp.position === 'middle' || mode === 'thickness' ? 'none' : p.joints;
  const across = joint === 'locked' ? 0.5 : joint === 'loose' ? 0.25 : 1;
  const kappa = joint === 'loose' ? 1.29 : 1;
  const [small, large] = [Math.min(p.l, p.w), Math.max(p.l, p.w)];
  const limits = new Set<'plate' | 'cell' | 'edge'>();
  const edgeCap = (k: 0 | 1) => (inp.edge && Number.isFinite(inp.edge[k]) ? 2 * inp.edge[k] : Infinity);
  const dims = (cc: number): [number, number] => {
    const cands: Array<[number, number]> =
      across === 1
        ? [[a1 + 2 * cc, a2 + 2 * cc]]
        : [
            [a1 + 2 * across * cc, a2 + 2 * cc],
            [a1 + 2 * cc, a2 + 2 * across * cc],
          ];
    let best: [number, number] | null = null;
    for (let [u, v] of cands) {
      // bord à bord : la plaque ne répartit pas au-delà d'elle-même
      if (p.joints === 'loose') {
        const [lu, lv] = u <= v ? [small, large] : [large, small];
        if (u > Math.max(a1, lu)) u = Math.max(a1, lu);
        if (v > Math.max(a2, lv)) v = Math.max(a2, lv);
      }
      if (inp.cell && inp.cell > 0) {
        u = Math.min(u, Math.max(a1, inp.cell));
        v = Math.min(v, Math.max(a2, inp.cell));
      }
      // bord des plaques de roulage : la partie qui porte est centrée sous la charge (B' = B − 2 e)
      u = Math.min(u, Math.max(a1, edgeCap(0)));
      v = Math.min(v, Math.max(a2, edgeCap(1)));
      if (!best || u * v < best[0] * best[1]) best = [u, v];
    }
    return best!;
  };
  const MRd = s.fd !== null && s.W !== null ? s.fd * s.W : Infinity;
  const moment = (cc: number) => {
    const [u, v] = dims(cc);
    const reach = Math.max(u - a1, v - a2, 0) / 2;
    return (kappa * (inp.REd / (u * v)) * reach * reach) / 2;
  };
  if (mode === 'stiffness' && moment(c) > MRd) {
    let lo = p.t;
    let hi = c;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (moment(mid) > MRd) hi = mid;
      else lo = mid;
    }
    c = lo;
    mode = 'strength';
  }
  const fp = dims(c);
  // limites atteintes (pour le texte) : comparer à l'emprise sans limite
  {
    const free: Array<[number, number]> =
      across === 1 ? [[a1 + 2 * c, a2 + 2 * c]] : [[a1 + 2 * across * c, a2 + 2 * c], [a1 + 2 * c, a2 + 2 * across * c]];
    const freeMin = Math.min(...free.map(([u, v]) => u * v));
    if (fp[0] * fp[1] < freeMin - 1) {
      if (inp.cell && (fp[0] >= inp.cell - 0.5 || fp[1] >= inp.cell - 0.5)) limits.add('cell');
      if (Math.abs(fp[0] - edgeCap(0)) < 0.5 || Math.abs(fp[1] - edgeCap(1)) < 0.5) limits.add('edge');
      if (p.joints === 'loose' && (Math.abs(Math.max(...fp) - large) < 0.5 || Math.abs(Math.min(...fp) - small) < 0.5)) limits.add('plate');
    }
  }
  const weight = roadwayPlateWeight(p);
  const mat = ROADWAY_MATERIALS[p.material];
  const fcd = p.fc ? p.fc / mat.gamma : null;
  return {
    footprint: fp,
    overhang: c,
    mode,
    stiffness: s,
    joint,
    limits: [...limits],
    M: moment(c),
    MRd,
    sigmaC: inp.REd / Math.max(1, a1 * a2),
    fcd,
    weight,
    pressure: inp.Rk / (fp[0] * fp[1]) + weight,
  };
}

/** Libellé court : « Terratrak Plus 2 200 × 1 100 × 38 mm (PEHD) — Envhyro ». */
export const roadwayPlateLabel = (p: RoadwayPlate) => `${p.name}${p.supplier ? ` — ${p.supplier}` : ''}`;

/** Nombre de plaques pour couvrir une surface (mm²), sans les chutes. */
export const roadwayPlateCount = (p: RoadwayPlate, area: number) => (p.l > 0 && p.w > 0 ? Math.ceil(area / (p.l * p.w)) : 0);
