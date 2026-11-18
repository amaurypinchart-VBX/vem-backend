// Calage appui par appui : chaîne de répartition pied → couches de plaques → sol (ou plaques de roulage jointives sur
// toute la surface), avec l'emprise réellement efficace de chaque plaque — une plaque trop mince ne répartit que sur la
// partie qu'elle peut porter en flexion (méthode statico du porte-à-faux diagonal, même idée que la largeur d'appui
// efficace des platines EN 1993-1-8 § 6.2.5). Choix par type d'appui ou par appui, diagnostic et conseil (« 70 × 70 :
// 61 kN sur 0,49 m² → 125 kN/m² > 40 kN/m², il faut 1,53 m² → 2 × 100 × 100 × 36 »). Fonctions pures ; N, mm, N/mm².
import type { LoadFoot, SpreadLayer, StockPlate } from './ground';
import { C24, HDPE_GAMMA, PANELS, joistAxes, joistLayer, layerThickness, parseBlockPlateKey, parseJoistKey, plateKey, stockLayer } from './ground';
import type { CalcRecord } from './records';
import { kgm2 } from './roadway';
import { fmtNumber } from './units';
import type { BlockChain } from './blocks';
import { blockPlateCaps } from './blocks';
import type { AppliedRemedy, RemedySupport } from './calageRemedies';

/**
 * Une couche choisie : n plaques identiques du stock (clé `plateKey`) empilées, ou n plaques à la taille du bloc
 * (clé `blockPlateKey`, cale composée), ou n madriers sur chant (clé `joistKey`, « joists:75x225 ») — `along` = sens des
 * madriers (le long du grand côté u ou du petit côté v de la Viewbox ; absent = le plus favorable).
 */
export interface LayerRef {
  plate: string;
  n: number;
  along?: 'u' | 'v';
}

/**
 * Choix de calage enregistrés avec les hypothèses : par type d'appui (« 1 », « 2 », « 3 », « 4 », « M ») et par appui
 * (« P4 ») ; clé absente = calage automatique, liste vide = pied posé directement au sol (ou sur les plaques de roulage).
 */
export interface CalageChoices {
  byType?: Record<string, LayerRef[]>;
  bySupport?: Record<string, LayerRef[]>;
  /** plaques de roulage jointives sur toute la surface couverte, sous tous les appuis */
  roadway?: boolean;
  /** débord des plaques de roulage tout autour de l'installation (mm, 0 = juste l'emprise des Viewbox) */
  roadwayOverhang?: number;
  /** longrines bois sous les grands côtés retenues à la place des plaques (sinon : variante proposée seulement) */
  longrine?: boolean;
  /** pose des plaques choisie pour un appui (« P4 », « B2 ») : à fleur de la Viewbox ou centrées ; absent = réglage général */
  placeBySupport?: Record<string, 'flush' | 'centered'>;
  /** blocs de calage dessinés centrés sous la résultante de leurs pieds (piste « Centrer les blocs », à déplacer sur site) */
  centreBlocks?: boolean;
  /** solution retenue parmi les pistes (grille de madriers, plateau) : remplace les plaques de tous les appuis concernés */
  remedy?: AppliedRemedy;
  /**
   * blocs de calage dessinés décrits comme des cales composées (A. Pinchart 18.11.2026 : « une cale de 1 m × 1 m
   * composée d'une plaque de multiplex 18 mm, de madriers 75 × 225 sur leur tranche à gauche, à droite et au milieu, puis
   * d'une plaque de 18 mm au-dessus ») : couches de haut en bas, plaques à la taille du bloc ; absent = bloc de bois plein
   */
  blockComposition?: LayerRef[];
}

const f = (v: number, d = 1) => fmtNumber(v, d);
const cm = (mm: number) => f(mm / 10, 0);
export const dimsCm = (d: readonly [number, number]) => `${cm(d[0])} × ${cm(d[1])} cm`;
export const kN = (n: number) => `${f(n / 1e3, 1)} kN`;
export const m2 = (a: number) => `${f(a / 1e6, a < 0.1e6 ? 3 : 2)} m²`;
/** « 125 kN/m² (12 740 kg/m²) » */
export const pressureText = (q: number) => `${f(q * 1e3, q * 1e3 < 10 ? 1 : 0)} kN/m² (${f(kgm2(q), 0)} kg/m²)`;

/** Résistances de calcul d'une couche : flexion (N/mm²), compression transversale (bois), rien pour une plaque du commerce. */
function layerStrength(layer: SpreadLayer): { fmd: number | null; fc90d: number | null } {
  if (layer.material === 'commercial') return { fmd: null, fc90d: null };
  // madriers C24 (kmod 0,9, γM 1,3 comme les blocs)
  if (layer.material === 'joists') return { fmd: (0.9 * C24.fmk) / 1.3, fc90d: (0.9 * C24.fc90k) / 1.3 };
  if (layer.material === 'steel') return { fmd: 235 / 1.0, fc90d: null };
  if (layer.material === 'hdpe') return { fmd: layer.hdpe?.fm ? layer.hdpe.fm / HDPE_GAMMA : null, fc90d: layer.hdpe?.fc ? layer.hdpe.fc / HDPE_GAMMA : null };
  const p = PANELS[layer.material].panel;
  return { fmd: (p.kmod * p.fmk) / p.gammaM, fc90d: (p.kmod * p.fc90k) / p.gammaM };
}

export interface LayerResult {
  layer: SpreadLayer;
  /** surface d'appui sur la couche (mm) : pied, ou emprise efficace de la couche du dessus */
  contact: [number, number];
  /** emprise efficace sous la couche (mm) : toute la plaque si elle est assez épaisse */
  footprint: [number, number];
  full: boolean;
  /** plaque à fleur : emprise limitée par la position de la charge (pas par l'épaisseur) */
  eccentric: boolean;
  /** pression uniforme sur toute la plaque : moment du porte-à-faux (N·mm/mm) ; moment résistant de la couche */
  MEdFull: number;
  MRd: number;
  /** épaisseur de chaque plaque (mm, n plaques empilées) pour répartir sur toute la plaque */
  tFull: number;
  /** compression transversale sous l'appui (bois) ; compression du PEHD */
  sigmaC90: number;
  fc90d: number | null;
  /**
   * plaque souple (PEHD) : débord efficace au-delà de l'appui (mm) et comment il est obtenu — raideur de la plaque et
   * du sol (poutre sur sol élastique), limité par la flexion, ou diffusion à 45° dans l'épaisseur seulement
   */
  flexible?: { mode: 'stiffness' | 'strength' | 'thickness'; overhang: number; reason?: string };
}

/**
 * Plaque souple (PEHD) sous un appui a1 × a2 : la plaque fléchit bien plus que le sol ne s'enfonce, elle ne répartit
 * donc que près de l'appui. Débord efficace de chaque côté c = 1/β, β = (k / (4 E I))^¼ avec E I = n · E · t³ / 12 par mm
 * de largeur (n plaques non collées) et k = module de réaction du sol (poutre sur sol élastique, Hetényi : appui rigide
 * sur une plaque semi-infinie, ∫ w dx = w0 / β) ; limité par la flexion si fm est donnée (q · c² / 2 ≤ fm/γ · n t² / 6).
 * Sans module E, sans raideur du sol ou si la plaque n'est pas pleine (masse < 80 % du PEHD plein : nervurée,
 * alvéolée), seule la diffusion à 45° dans l'épaisseur est comptée (c = n · t), côté de la sécurité.
 */
function spreadHdpe(layer: SpreadLayer, contact: [number, number], REd: number, caps: [number, number], subgrade?: number): LayerResult {
  const [c1, c2] = contact;
  const l = Math.min(layer.l, Math.max(caps[0], c1));
  const w = Math.min(layer.w, Math.max(caps[1], c2));
  const b1 = Math.min(c1, l);
  const b2 = Math.min(c2, w);
  const h = layer.hdpe;
  const { fmd, fc90d } = layerStrength(layer);
  const T = layer.n * layer.t;
  let mode: 'stiffness' | 'strength' | 'thickness' = 'thickness';
  let reason: string | undefined;
  let c = T;
  if (!h?.E) reason = 'module d’élasticité du PEHD non saisi (fiche technique)';
  else if (!(subgrade && subgrade > 0)) reason = 'raideur du sol inconnue';
  else if (!h.solid) reason = `plaque non pleine (${f(h.rho, 0)} kg/m³ < ${f(0.8 * 950, 0)}) : raideur à donner par le fabricant`;
  else {
    const EI = (layer.n * h.E * layer.t ** 3) / 12;
    c = Math.max(T, 1 / Math.pow(subgrade / (4 * EI), 0.25));
    mode = 'stiffness';
  }
  // flexion de la plaque (si fm connue) : q · c² / 2 ≤ fm,d · n · t² / 6
  const MRd = fmd === null ? Infinity : (fmd * layer.n * layer.t * layer.t) / 6;
  const dims = (cc: number): [number, number] => [Math.min(l, b1 + 2 * cc), Math.min(w, b2 + 2 * cc)];
  const M = (cc: number) => {
    const [a, b] = dims(cc);
    return ((REd / (a * b)) * cc * cc) / 2;
  };
  if (mode === 'stiffness' && M(c) > MRd) {
    let lo = T;
    let hi = c;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (M(mid) > MRd) hi = mid;
      else lo = mid;
    }
    c = lo;
    mode = 'strength';
  }
  const [a, b] = dims(c);
  return {
    layer,
    contact,
    footprint: [a, b],
    full: a >= l - 0.5 && b >= w - 0.5,
    eccentric: l < layer.l || w < layer.w,
    MEdFull: M(c),
    MRd,
    tFull: 0,
    sigmaC90: REd / (b1 * b2),
    fc90d,
    flexible: { mode, overhang: c, ...(reason ? { reason } : {}) },
  };
}

/**
 * Emprise efficace d'une couche sous un appui a1 × a2 : pression uniforme sous l'emprise (a1 + λ(l − a1)) × (a2 + λ(w − a2)),
 * porte-à-faux diagonal e = λ · √(((l − a1)/2)² + ((w − a2)/2)²), MEd = Rz,Ed / A · e² / 2 ≤ fm,d · n · t² / 6 : le plus
 * grand λ ≤ 1 (MEd croît avec λ). λ = 1 : méthode statico, toute la plaque répartit. Plaque posée excentrée (à fleur
 * de la Viewbox) : `caps` = emprise centrée sur la charge au plus (B' = B − 2 e), la plaque au-delà ne compte pas.
 */
export function spreadLayer(layer: SpreadLayer, contact: [number, number], REd: number, caps: [number, number] = [Infinity, Infinity], subgrade?: number): LayerResult {
  if (layer.material === 'hdpe') return spreadHdpe(layer, contact, REd, caps, subgrade);
  const { fmd, fc90d } = layerStrength(layer);
  const [c1, c2] = contact;
  const l = Math.min(layer.l, Math.max(caps[0], c1));
  const w = Math.min(layer.w, Math.max(caps[1], c2));
  // plaque plus petite que l'appui dans une direction : pas de porte-à-faux dans cette direction
  const b1 = Math.min(c1, l);
  const b2 = Math.min(c2, w);
  const d1 = Math.max(0, l - c1);
  const d2 = Math.max(0, w - c2);
  const at = (lam: number) => {
    const a = b1 + lam * d1;
    const b = b2 + lam * d2;
    const e = Math.hypot((lam * d1) / 2, (lam * d2) / 2);
    return { a, b, M: ((REd / (a * b)) * e * e) / 2 };
  };
  const whole = at(1);
  const MRd = fmd === null ? Infinity : (fmd * layer.n * layer.t * layer.t) / 6;
  let lam = 1;
  if (whole.M > MRd) {
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (at(mid).M > MRd) hi = mid;
      else lo = mid;
    }
    lam = lo;
  }
  const fp = at(lam);
  return {
    layer,
    contact,
    footprint: [fp.a, fp.b],
    full: lam === 1,
    eccentric: l < layer.l || w < layer.w,
    MEdFull: whole.M,
    MRd,
    tFull: fmd === null ? 0 : Math.sqrt((6 * whole.M) / (fmd * layer.n)),
    sigmaC90: REd / (b1 * b2),
    fc90d,
  };
}

export interface ChainStep {
  label: string;
  /** emprise au sol si le calage s'arrêtait là (mm ; null = toute la surface couverte), surface (mm²), pression (N/mm²) */
  dims: [number, number] | null;
  area: number;
  pressure: number;
  /** pression / portance */
  eta: number;
  note?: string;
}

export interface ChainInput {
  Rzk: number;
  REd: number;
  /** surface de contact de l'appui (mm) et son libellé (« 2 angles 42 × 21 cm ») */
  contact: [number, number];
  contactLabel: string;
  layers: SpreadLayer[];
  bearing: number;
  /** plaques de roulage : pression uniforme (N/mm²) sur toute la surface couverte (mm²) */
  roadway?: { mean: number; area: number } | null;
  pointLoadMax?: number;
  /** plaques à fleur de la Viewbox : emprise efficace maximale (u, v) et distance de la charge au bord (mm) */
  caps?: [number, number];
  edgeDist?: [number, number];
  /**
   * appui posé sur un bloc de calage bois dessiné : le bloc est la première couche (compression ⊥ sous les pieds,
   * diffusion, poids propre) ; Rzk / REd = réactions des pieds seules, le poids du bloc est ajouté ici ; les plaques
   * éventuelles sont sous le bloc, centrées sur lui (emprise efficace B − 2 e)
   */
  block?: BlockChain;
  /** module de réaction du sol (N/mm³) : répartition des plaques souples (PEHD) */
  subgrade?: number;
  /**
   * pieds posés sur le calage (par rapport à la résultante, mm, axes u v de l'appui) avec leur Rz,Ed : position des
   * pieds entre des madriers sur chant ; absent = un seul pied (la surface de contact) au centre
   */
  feet?: LoadFoot[];
  /**
   * appui posé sur la grille / le plateau de madriers de la solution retenue : pression maxi au sol calculée pour
   * toute la rangée (ou tout le plateau), taux du bois ; remplace les couches et les plaques de roulage
   */
  timber?: RemedySupport;
  /**
   * dalle / plancher en charge répartie admissible (`CalageInput.bearingMode` 'distributed') : la pression juste sous
   * le calage n'est qu'une information, le critère est la charge de la zone de dalle du pied (`slabZones.ts`)
   */
  groundInfo?: boolean;
}

export interface ChainResult {
  steps: ChainStep[];
  layers: LayerResult[];
  /** pression finale au sol (N/mm²) et taux de travail du sol, du bois sous l'appui, des plaques du commerce */
  pressure: number;
  etaGround: number;
  etaC90: number;
  etaCapacity: number;
  etaPoint: number;
  eta: number;
  /** surface nécessaire au sol (mm²) */
  areaRequired: number;
  problems: string[];
  records: CalcRecord[];
}

export const layersText = (layers: SpreadLayer[]) => layers.map((l) => (l.joist ? l.label : `${l.n} × ${l.label}`)).join(' + ');

/** « 4 × 100 × 100 × 18 mm », « 3 madriers 75 × 225 mm sur chant » : couche en court (calage choisi, matériel). */
export const layerShort = (l: SpreadLayer) => (l.joist ? `${l.n} madrier${l.n > 1 ? 's' : ''} ${l.joist.b} × ${l.joist.h} mm sur chant` : l.material === 'commercial' ? `${l.n} × ${l.label}` : `${l.n} × ${l.l / 10} × ${l.w / 10} × ${l.t} mm`);

/** Chaîne de répartition d'un appui : contact → chaque couche (emprise efficace) → sol ou plaques de roulage. */
export function checkChain(inp: ChainInput): ChainResult {
  const { bearing } = inp;
  const blk = inp.block;
  // bloc dessiné décrit comme une cale composée (plaques, madriers sur chant) au lieu d'un bloc de bois plein
  const comp = blk?.composition;
  // poids du bloc ajouté sous le bloc : réactions au sol = pieds + bloc
  const Rzk = inp.Rzk + (blk?.weightK ?? 0);
  const REd = inp.REd + (blk?.weightD ?? 0);
  const steps: ChainStep[] = [];
  const records: CalcRecord[] = [];
  const problems: string[] = [];
  // poids propre des plaques déjà posées (ajouté sous chaque couche)
  let wLayers = 0;
  const stepOf = (label: string, dims: [number, number], note?: string): ChainStep => {
    const area = dims[0] * dims[1];
    const pressure = (Rzk + wLayers) / area;
    return { label, dims, area, pressure, eta: pressure / bearing, note };
  };
  let c: [number, number] = [...inp.contact];
  // surface de contact des pieds : pression sous les pieds seuls
  steps.push({ ...stepOf(inp.contactLabel, c), pressure: inp.Rzk / (c[0] * c[1]), eta: inp.Rzk / (c[0] * c[1]) / bearing });
  const results: LayerResult[] = [];
  let etaC90 = 0;
  let etaCapacity = 0;
  const caps = inp.caps ?? [Infinity, Infinity];
  if (blk && !comp) {
    const [eu, ev] = blk.eff;
    const effA = Math.max(1, eu * ev);
    const blockA = blk.dims[0] * blk.dims[1];
    // pieds sur l'emprise efficace + poids du bloc sur toute sa base (superposition, côté de la sécurité)
    const q = inp.Rzk / effA + blk.weightK / blockA;
    const e = Math.hypot(blk.offset[0], blk.offset[1]);
    const notes: string[] = [];
    if (e > 10) notes.push(`résultante des pieds à ${f(Math.abs(blk.offset[0]) / 10, 0)} / ${f(Math.abs(blk.offset[1]) / 10, 0)} cm du centre du bloc : emprise centrée sur la charge, B' = B − 2 e`);
    if (blk.diffusionLimited)
      notes.push(
        blk.stripReach !== undefined
          ? `rives / profils posés sur la plaque : répartition jusqu’à ${f(blk.stripReach / 10, 0)} cm de chaque semelle (45° sur ${f(blk.height / 10, 0)} cm, flexion de la plaque) — la plaque ne porte pas sur toute sa surface`
          : `diffusion à 45° sur ${f(blk.height / 10, 0)} cm de hauteur : le bloc ne répartit pas sur toute sa base`,
      );
    if (eu <= 1 || ev <= 1) problems.push(`${blk.label} : la charge des pieds n’est pas sur le bloc (dessin à vérifier)`);
    steps.push({ label: `+ ${blk.label}`, dims: [eu, ev], area: effA, pressure: q, eta: q / bearing, note: notes.join(' ; ') || undefined });
    const eta90 = blk.c90.sigma / blk.c90.fc90d;
    etaC90 = Math.max(etaC90, eta90);
    if (eta90 > 1) problems.push(`${blk.label} : bois écrasé sous l’appui ${blk.c90.foot} (σc,90,d = ${f(blk.c90.sigma, 2)} > ${f(blk.c90.fc90d, 2)} N/mm²) — tôle acier sous le pied`);
    records.push({
      key: 'block.c90',
      title: `Compression transversale du bloc sous l’appui ${blk.c90.foot}`,
      clause: 'DIN EN 1995-1-1 6.1.5 (kc,90 = 1,0 : sens du fil inconnu, côté de la sécurité ; kmod 0,9, γM 1,3)',
      formula: 'σc,90,d = Rz,Ed / A ≤ fc,90,d = kmod · fc,90,k / γM',
      withValues: `σc,90,d = ${kN(blk.c90.REd)} / ${m2(blk.c90.area)} = ${f(blk.c90.sigma, 2)} N/mm² ≤ ${f(blk.c90.fc90d, 2)} N/mm²`,
      result: blk.c90.sigma,
      limit: blk.c90.fc90d,
      eta: eta90,
    });
    records.push({
      key: 'block.spread',
      title: `Répartition par ${blk.label}`,
      clause: 'diffusion à 45° dans la hauteur du bloc, emprise centrée sur la résultante (EN 1997-1 annexe D, B\' = B − 2 e) ; poids du bloc sur toute sa base',
      formula: 'σ = Rz,k,pieds / (B\'u · B\'v) + Gbloc / (Bu · Bv)',
      withValues: `σ = ${kN(inp.Rzk)} / ${m2(effA)} (${dimsCm([eu, ev])}) + ${kN(blk.weightK)} / ${m2(blockA)} = ${pressureText(q)}`,
      result: q,
    });
    c = [eu, ev];
  }
  // plaques sous un bloc : centrées sur le bloc, la charge est à `offset` du centre de la plaque
  const capsOf = (L: SpreadLayer): [number, number] => (blk ? blockPlateCaps(blk, L.l, L.w) : caps);
  const capText = () => {
    const d = Math.min(...(inp.edgeDist ?? [Infinity, Infinity]));
    return Number.isFinite(d)
      ? `à fleur de la Viewbox : charge à ${f(d / 10, 1)} cm du bord, la plaque ne répartit que sur ${f((2 * d) / 10, 0)} cm de large de ce côté (B' = B − 2 e)`
      : 'plaque excentrée : emprise centrée sur la charge (B\' = B − 2 e)';
  };
  // résultante des charges par rapport au centre de chaque couche (position des pieds entre les madriers) :
  // sous un bloc, comme `blockPlateCaps` ; à fleur de la Viewbox, la plaque part du bord ; centrée : au milieu
  const shiftOf = (L: SpreadLayer): [number, number] => {
    if (blk) return [0, 1].map((k) => (blk.plate === 'flush' && blk.edge[k] !== null ? (k ? L.w : L.l) / 2 - blk.edge[k]! : blk.offset[k])) as [number, number];
    const d = inp.edgeDist;
    return d ? ([0, 1].map((k) => (Number.isFinite(d[k]) ? (k ? L.w : L.l) / 2 - d[k] : 0)) as [number, number]) : [0, 0];
  };

  interface RunOpts {
    capsOf: (L: SpreadLayer) => [number, number];
    shiftOf: (L: SpreadLayer) => [number, number];
    /** charges sur la première couche, par rapport à la résultante ; null = contact rigide `c` centré sur la résultante */
    feet: LoadFoot[] | null;
    /** poids des couches ajouté sous chaque couche (non : déjà compté dans Rz, cale composée) */
    weight: boolean;
    /** suffixe des libellés (« (cale BL1) ») et note des plaques excentrées */
    tag: string;
    eccNote?: string;
    /** charge de calcul qui descend dans les couches (moments, compression transversale) */
    REd: number;
    /** compression transversale de la première couche sous chaque pied (cale composée : remplace celle du bloc plein) */
    c90Feet?: boolean;
  }

  /** Plaques (bois, PEHD, tôle, plaque du commerce) posées à plat : emprise efficace de la couche. */
  const plateLayer = (L: SpreadLayer, o: RunOpts) => {
    const r = spreadLayer(L, c, o.REd, o.capsOf(L), inp.subgrade);
    results.push(r);
    const lab = `${L.n > 1 ? `${L.n} × ` : ''}${L.label}${o.tag}`;
    let note: string | undefined;
    if (r.eccentric) note = o.eccNote ?? (blk ? (blk.plate === 'flush' ? 'plaque à fleur de la Viewbox sous le bloc : emprise centrée sur la charge (B\' = B − 2 e)' : 'plaque centrée sous le bloc : emprise centrée sur la charge (B\' = B − 2 e)') : capText());
    if (r.flexible) {
      const fx = r.flexible;
      const soft =
        fx.mode === 'thickness'
          ? `plaque souple : diffusion à 45° dans son épaisseur seulement (${f(fx.overhang / 10, 1)} cm de chaque côté) — ${fx.reason}`
          : `plaque souple : ne répartit qu’à ${f(fx.overhang / 10, 0)} cm au-delà de l’appui (raideur de la plaque et du sol${fx.mode === 'strength' ? ', limitée par la flexion' : ''})`;
      note = note ? `${note} ; ${soft}` : soft;
      if (r.fc90d !== null) {
        const eta = r.sigmaC90 / r.fc90d;
        etaC90 = Math.max(etaC90, eta);
        if (eta > 1) problems.push(`${lab} : PEHD écrasé sous l’appui (σ = ${f(r.sigmaC90, 2)} > ${f(r.fc90d, 2)} N/mm²)`);
      }
      const EI = L.hdpe?.E ? (L.n * L.hdpe.E * L.t ** 3) / 12 : 0;
      records.push({
        key: 'spread.hdpe',
        title: `Répartition par ${lab}`,
        clause:
          fx.mode === 'thickness'
            ? `plaque souple en PEHD : diffusion à 45° dans l’épaisseur seulement (${fx.reason})`
            : 'plaque souple en PEHD sur sol élastique (poutre de Hetényi, appui rigide) : débord efficace 1/β de chaque côté de l’appui',
        formula: fx.mode === 'thickness' ? 'c = n · t ; emprise = (a1 + 2 c) × (a2 + 2 c) ≤ plaque' : 'β = (k / (4 E I))^¼, E I = n · E · t³ / 12 ; c = 1/β ; emprise = (a1 + 2 c) × (a2 + 2 c) ≤ plaque',
        withValues:
          fx.mode === 'thickness'
            ? `c = ${L.n} × ${f(L.t, 0)} = ${f(fx.overhang, 0)} mm ; emprise ${dimsCm(r.footprint)}`
            : `E = ${f(L.hdpe!.E!, 0)} N/mm², t = ${f(L.t, 0)} mm, n = ${L.n} : E I = ${f(EI / 1e6, 2)} kN·m²/m ; k = ${f((inp.subgrade ?? 0) * 1e3, 0)} MN/m³ → c = ${f(fx.overhang, 0)} mm${fx.mode === 'strength' ? ' (limité par la flexion)' : ''} ; emprise ${dimsCm(r.footprint)}${r.fc90d !== null ? ` ; σ sous l’appui ${f(r.sigmaC90, 3)} ≤ ${f(r.fc90d, 2)} N/mm²` : ''}`,
        eta: r.fc90d !== null ? r.sigmaC90 / r.fc90d : undefined,
      });
      if (o.weight) wLayers += L.n * L.massKg * 9.81;
      steps.push(stepOf(`+ ${lab}`, r.footprint, note));
      c = r.footprint;
      return;
    }
    if (!r.full) {
      const thin = `trop mince pour répartir sur toute la plaque : emprise efficace ${dimsCm(r.footprint)} (il faudrait ${f(r.tFull, 0)} mm par plaque)`;
      note = note ? `${note} ; ${thin}` : thin;
      problems.push(`${lab} : ${thin}`);
    }
    if (r.fc90d !== null) {
      const eta = r.sigmaC90 / r.fc90d;
      etaC90 = Math.max(etaC90, eta);
      if (eta > 1) problems.push(`${lab} : bois écrasé sous l’appui (σc,90,d = ${f(r.sigmaC90, 2)} > ${f(r.fc90d, 2)} N/mm²) — tôle acier sous le pied`);
    }
    if (L.capacity) {
      etaCapacity = Math.max(etaCapacity, Rzk / L.capacity);
      if (Rzk > L.capacity) problems.push(`${lab} : ${kN(Rzk)} > charge admissible du fabricant ${kN(L.capacity)}`);
    }
    records.push({
      key: 'spread.layer',
      title: `Répartition par ${lab}`,
      clause:
        L.material === 'commercial'
          ? 'capacité du fabricant, emprise = toute la plaque'
          : `méthode statico (porte-à-faux diagonal) ; emprise efficace si la plaque est trop mince${r.eccentric ? ' ; plaque excentrée : EN 1997-1 annexe D' : ''}`,
      formula:
        L.material === 'commercial'
          ? 'Rz,k ≤ Fadm'
          : 'MEd = Rz,Ed / A · e² / 2 ≤ MRd = fm,d · n · t² / 6 ; sinon emprise réduite jusqu’à MEd = MRd',
      withValues:
        L.material === 'commercial'
          ? `${kN(Rzk)} ≤ ${kN(L.capacity ?? 0)}`
          : `appui ${dimsCm(c)} sur ${cm(L.l)} × ${cm(L.w)} cm${r.eccentric ? ` (${o.eccNote ?? capText()})` : ''} : MEd = ${f(r.MEdFull / 1e3, 2)} kNcm/cm ; MRd = ${f(r.MRd / 1e3, 2)} kNcm/cm → ${r.full ? (r.eccentric ? `emprise efficace ${dimsCm(r.footprint)}` : 'toute la plaque répartit') : `emprise efficace ${dimsCm(r.footprint)}`}`,
      eta: L.material === 'commercial' ? Rzk / (L.capacity ?? Infinity) : Math.min(1, r.MEdFull / r.MRd),
    });
    if (o.weight) wLayers += L.n * L.massKg * 9.81;
    steps.push(stepOf(`+ ${lab}`, r.footprint, note));
    c = r.footprint;
  };

  /**
   * Madriers sur chant et les plaques posées dessus : les plaques portent d'un madrier à l'autre (flexion), chaque
   * madrier reçoit sa part de chaque pied (compression transversale) et la répartit dans sa hauteur à 45° le long de
   * sa longueur ; l'emprise sous les madriers = les madriers chargés, centrée sur la charge.
   */
  const joistLayerStep = (above: SpreadLayer[], J: SpreadLayer, feet: LoadFoot[] | null, o: RunOpts) => {
    const jb = J.joist!;
    const ia = jb.along === 'u' ? 0 : 1;
    const ix = 1 - ia;
    const Lj = ia === 0 ? J.l : J.w;
    const W = ix === 0 ? J.l : J.w;
    const axes = joistAxes(W, jb.b, J.n);
    const half = jb.b / 2;
    const sh = o.shiftOf(J);
    const T = above.reduce((a, L) => a + layerThickness(L), 0);
    // contact rigide (bloc plein, couche de madriers au-dessus) ou pieds posés directement sur les madriers : la charge
    // va aux madriers qu'elle touche ; sinon les plaques au-dessus la portent jusqu'aux madriers voisins
    const direct = feet === null || !above.length;
    const loads = (feet ?? [{ at: [0, 0] as [number, number], size: [c[0], c[1]] as [number, number], REd: o.REd }]).map((ft) => ({
      p: ft.at[ix] + sh[ix],
      q: ft.at[ia] + sh[ia],
      a: ft.size[ix],
      ay: ft.size[ia],
      P: ft.REd,
      id: ft.id,
    }));
    const mPerMm = above.reduce((a, L) => {
      const fmd = layerStrength(L).fmd;
      return a + (fmd === null ? Infinity : (fmd * L.n * L.t * L.t) / 6);
    }, 0);
    const alongAbove = above.length ? Math.min(...above.map((L) => (ia === 0 ? L.l : L.w))) : Lj;
    const loaded = new Set<number>();
    let bend: { eta: number; M: number; MRd: number; beff: number; kind: 'span' | 'cantilever'; span: number; arm: number; P: number } | null = null;
    let c90: { sigma: number; R: number; lb: number } | null = null;
    let unsupported = false;
    const fc90dJ = (0.9 * C24.fc90k) / 1.3;
    for (const ld of loads) {
      const shares = axes.map(() => 0);
      let kind: 'direct' | 'span' | 'cantilever' = 'direct';
      let span = 0;
      let arm = 0;
      const on = axes.findIndex((x) => Math.abs(ld.p - x) <= half + 1e-6);
      if (on >= 0) shares[on] = 1;
      else if (direct) {
        // contact rigide ou pied sans plaque : les madriers qu'il touche, au prorata de la largeur touchée
        const ov = axes.map((x) => Math.max(0, Math.min(x + half, ld.p + ld.a / 2) - Math.max(x - half, ld.p - ld.a / 2)));
        const tot = ov.reduce((a, v) => a + v, 0);
        if (tot > 0) ov.forEach((v, i) => (shares[i] = v / tot));
        else unsupported = true;
      } else {
        const k = axes.findIndex((x, i) => i < axes.length - 1 && ld.p > x && ld.p < axes[i + 1]);
        if (k >= 0) {
          kind = 'span';
          span = axes[k + 1] - axes[k];
          arm = ld.p - axes[k];
          shares[k] = (span - arm) / span;
          shares[k + 1] = arm / span;
        } else {
          // au-delà du dernier madrier : la plaque est en console (et tire sur le madrier suivant)
          kind = 'cantilever';
          const out = ld.p < axes[0] ? 0 : axes.length - 1;
          arm = Math.abs(ld.p - axes[out]);
          span = arm;
          if (axes.length > 1) {
            const nb = out === 0 ? 1 : axes.length - 2;
            const s2 = Math.abs(axes[nb] - axes[out]);
            shares[out] = 1 + arm / s2;
            shares[nb] = -arm / s2;
          } else shares[out] = 1;
        }
      }
      if (kind !== 'direct') {
        const M = ld.P * (kind === 'span' ? (arm * (span - arm)) / span : arm);
        const beff = Math.min(alongAbove, ld.ay + (kind === 'span' ? span : 2 * arm));
        const MRd = beff * mPerMm;
        const eta = MRd > 0 ? M / MRd : Infinity;
        if (!bend || eta > bend.eta) bend = { eta, M, MRd, beff, kind, span, arm, P: ld.P };
      }
      // compression transversale du madrier : appui de la longueur du pied + 45° dans les plaques au-dessus, coupé aux bouts
      const reach = ld.ay / 2 + T;
      const lb = Math.max(1, Math.min(ld.q + Lj / 2, reach) + Math.min(Lj / 2 - ld.q, reach));
      shares.forEach((v, i) => {
        if (v <= 1e-6) return;
        loaded.add(i);
        const sigma = (v * ld.P) / (jb.b * lb);
        if (!c90 || sigma > c90.sigma) c90 = { sigma, R: v * ld.P, lb };
      });
    }
    // emprise sous les madriers : madriers chargés en travers, 45° dans les plaques et la hauteur du madrier le long
    const idx = [...loaded];
    const Ptot = loads.reduce((a, l) => a + l.P, 0) || 1;
    const rx = loads.reduce((a, l) => a + l.P * l.p, 0) / Ptot;
    const ry = loads.reduce((a, l) => a + l.P * l.q, 0) / Ptot;
    let fp: [number, number] = [c[0], c[1]];
    if (idx.length) {
      const lo = Math.min(...idx.map((i) => axes[i] - half));
      const hi = Math.max(...idx.map((i) => axes[i] + half));
      const reach = T + jb.h;
      const ylo = Math.min(...loads.map((l) => Math.max(-Lj / 2, l.q - l.ay / 2 - reach)));
      const yhi = Math.max(...loads.map((l) => Math.min(Lj / 2, l.q + l.ay / 2 + reach)));
      const across = Math.max(jb.b, 2 * Math.min(rx - lo, hi - rx));
      const along = Math.max(1, 2 * Math.min(ry - ylo, yhi - ry));
      fp = ia === 0 ? [along, across] : [across, along];
    }
    if (o.weight) wLayers += [...above, J].reduce((a, L) => a + L.n * L.massKg * 9.81, 0);
    const dir = jb.along === 'u' ? 'parallèles au grand côté de la Viewbox' : 'parallèles au petit côté de la Viewbox';
    const notes = [
      `${dir}, ${idx.length} madrier${idx.length > 1 ? 's' : ''} chargé${idx.length > 1 ? 's' : ''} sur ${J.n}`,
      `madriers à visser aux plaques en tête et en pied (h/b = ${f(jb.h / jb.b, 1)} : sinon ils se couchent)`,
    ];
    if (above.length) notes.unshift(`${layersText(above)} : ${above.reduce((a, L) => a + L.n, 0) > 1 ? 'portent' : 'porte'} d’un madrier à l’autre`);
    const lab = above.length ? `${layersText(above)} sur ${J.label}` : J.label;
    steps.push(stepOf(`+ ${lab}${o.tag}`, fp, notes.join(' ; ')));
    if (unsupported) problems.push(`${J.label}${o.tag} : pied entre deux madriers sans plaque au-dessus — poser une plaque sur les madriers ou un madrier sous le pied`);
    if (bend) {
      const b = bend as { eta: number; M: number; MRd: number; beff: number; kind: 'span' | 'cantilever'; span: number; arm: number; P: number };
      etaCapacity = Math.max(etaCapacity, b.eta);
      if (b.eta > 1) problems.push(`${layersText(above)}${o.tag} : ne porte${above.reduce((a, L) => a + L.n, 0) > 1 ? 'nt' : ''} pas la charge d’un madrier à l’autre (flexion η ${f(b.eta, 2)}) — plus de plaques au-dessus, des madriers plus rapprochés ou un madrier sous le pied`);
      records.push({
        key: 'joists.bend',
        title: `Flexion de ${layersText(above)} entre les madriers`,
        clause: 'plaques non collées (W = Σ n · t² / 6), portée entre les axes de deux madriers (travée simple) ou console au-delà du dernier madrier ; largeur efficace b = a + s (diffusion à 45° vers les madriers)',
        formula: b.kind === 'span' ? 'MEd = Rz,Ed · x · (s − x) / s ≤ MRd = fm,d · b · Σ n · t² / 6' : 'MEd = Rz,Ed · d ≤ MRd = fm,d · b · Σ n · t² / 6',
        withValues:
          b.kind === 'span'
            ? `MEd = ${kN(b.P)} × ${f(b.arm, 0)} × ${f(b.span - b.arm, 0)} / ${f(b.span, 0)} mm = ${f(b.M / 1e6, 2)} kNm ≤ MRd = ${f(b.MRd / 1e6, 2)} kNm (b = ${f(b.beff, 0)} mm)`
            : `MEd = ${kN(b.P)} × ${f(b.arm, 0)} mm = ${f(b.M / 1e6, 2)} kNm ≤ MRd = ${f(b.MRd / 1e6, 2)} kNm (b = ${f(b.beff, 0)} mm)`,
        result: b.M,
        limit: b.MRd,
        eta: b.eta,
      });
    }
    if (c90) {
      const k9 = c90 as { sigma: number; R: number; lb: number };
      const eta = k9.sigma / fc90dJ;
      etaC90 = Math.max(etaC90, eta);
      if (eta > 1) problems.push(`${J.label}${o.tag} : bois écrasé sous la charge (σc,90,d = ${f(k9.sigma, 2)} > ${f(fc90dJ, 2)} N/mm²) — plus de plaques au-dessus ou des madriers plus larges`);
      records.push({
        key: 'joists.c90',
        title: 'Compression transversale des madriers sur chant',
        clause: 'DIN EN 1995-1-1 6.1.5 (C24, kc,90 = 1,0 ; kmod 0,9, γM 1,3) ; longueur d’appui = longueur du pied + 2 × épaisseur des plaques au-dessus (45°), coupée aux bouts du madrier',
        formula: 'σc,90,d = R / (b · l) ≤ fc,90,d = kmod · fc,90,k / γM',
        withValues: `σc,90,d = ${kN(k9.R)} / (${f(jb.b, 0)} × ${f(k9.lb, 0)} mm) = ${f(k9.sigma, 2)} N/mm² ≤ ${f(fc90dJ, 2)} N/mm²`,
        result: k9.sigma,
        limit: fc90dJ,
        eta,
      });
    }
    records.push({
      key: 'joists.spread',
      title: `Répartition par ${J.label}`,
      clause: 'chaque madrier répartit sa charge à 45° dans sa hauteur (et dans les plaques au-dessus) le long de sa longueur ; emprise = madriers chargés, centrée sur la charge (B\' = B − 2 e)',
      formula: 'emprise = largeur des madriers chargés × (longueur du pied + 2 · (T + h))',
      withValues: `${idx.length} madrier${idx.length > 1 ? 's' : ''} chargé${idx.length > 1 ? 's' : ''} sur ${J.n}, T = ${f(T, 0)} mm, h = ${f(jb.h, 0)} mm : emprise ${dimsCm(fp)}`,
    });
    results.push({ layer: J, contact: [c[0], c[1]], footprint: fp, full: true, eccentric: false, MEdFull: bend ? (bend as { M: number }).M : 0, MRd: bend ? (bend as { MRd: number }).MRd : Infinity, tFull: 0, sigmaC90: c90 ? (c90 as { sigma: number }).sigma : 0, fc90d: fc90dJ });
    c = fp;
  };

  /** Couches de haut en bas : plaques posées à plat, et madriers sur chant avec les plaques qui portent dessus. */
  const runLayers = (layers: SpreadLayer[], o: RunOpts) => {
    // compression transversale de la première couche sous chaque pied (cale composée)
    const first = layers[0];
    if (o.c90Feet && o.feet && first && !first.joist) {
      const { fc90d } = layerStrength(first);
      if (fc90d !== null) {
        const worst = o.feet.reduce((a, ft) => (ft.REd / (ft.size[0] * ft.size[1]) > a.REd / (a.size[0] * a.size[1]) ? ft : a));
        const area = worst.size[0] * worst.size[1];
        const sigma = worst.REd / area;
        const eta = sigma / fc90d;
        etaC90 = Math.max(etaC90, eta);
        if (eta > 1) problems.push(`${first.label}${o.tag} : bois écrasé sous l’appui${worst.id ? ` ${worst.id}` : ''} (σc,90,d = ${f(sigma, 2)} > ${f(fc90d, 2)} N/mm²) — tôle acier sous le pied`);
        records.push({
          key: 'block.c90',
          title: `Compression transversale de la plaque du dessus sous l’appui${worst.id ? ` ${worst.id}` : ''}`,
          clause: 'DIN EN 1995-1-1 6.1.5 (kc,90 = 1,0 ; kmod 0,9, γM 1,3)',
          formula: 'σc,90,d = Rz,Ed / A ≤ fc,90,d = kmod · fc,90,k / γM',
          withValues: `σc,90,d = ${kN(worst.REd)} / ${m2(area)} = ${f(sigma, 2)} N/mm² ≤ ${f(fc90d, 2)} N/mm²`,
          result: sigma,
          limit: fc90d,
          eta,
        });
      }
    }
    let feet = o.feet;
    let i = 0;
    while (i < layers.length) {
      let j = i;
      while (j < layers.length && !layers[j].joist) j++;
      if (j >= layers.length) {
        for (let k = i; k < layers.length; k++) plateLayer(layers[k], o);
        return;
      }
      joistLayerStep(layers.slice(i, j), layers[j], feet, o);
      // sous des madriers : contact rigide (emprise des madriers chargés)
      feet = null;
      i = j + 1;
    }
  };

  // cale composée à la place du bloc plein : ses couches, centrées sur le bloc, sous les pieds
  if (blk && comp) {
    runLayers(comp.layers, {
      capsOf: (L) => [Math.max(1, L.l - 2 * Math.abs(blk.offset[0])), Math.max(1, L.w - 2 * Math.abs(blk.offset[1]))],
      shiftOf: () => [blk.offset[0], blk.offset[1]],
      feet: comp.feet,
      weight: false,
      tag: ` (${comp.name})`,
      eccNote: 'cale centrée sur le bloc dessiné : emprise centrée sur la charge (B\' = B − 2 e)',
      REd: inp.REd,
      c90Feet: true,
    });
  }
  // plaques (et madriers) sous le pied, ou sous le bloc : un bloc / une cale répartit sur un contact rigide
  const feet0: LoadFoot[] = inp.feet?.length ? inp.feet : [{ at: [0, 0], size: [inp.contact[0], inp.contact[1]], REd: inp.REd }];
  runLayers(inp.layers, { capsOf, shiftOf, feet: blk ? null : feet0, weight: true, tag: '', REd });
  const tb = inp.timber;
  if (tb) {
    steps.push({ label: `+ ${tb.label}`, dims: null, area: tb.area, pressure: tb.pressure, eta: tb.info ? 0 : tb.pressure / bearing, note: tb.note });
    records.push(...tb.records);
    etaCapacity = Math.max(etaCapacity, tb.etaTimber);
    if (tb.etaTimber > 1) problems.push(`${tb.label} : madriers insuffisants (η ${f(tb.etaTimber, 2)})`);
  } else if (inp.roadway) {
    const q = inp.roadway.mean;
    steps.push({ label: '+ Plaques de roulage sur toute la surface (charge totale répartie uniformément)', dims: null, area: inp.roadway.area, pressure: q, eta: q / bearing });
  }
  const last = steps[steps.length - 1];
  const etaPoint = inp.pointLoadMax ? Rzk / inp.pointLoadMax : 0;
  if (etaPoint > 1) problems.push(`${kN(Rzk)} > charge ponctuelle admissible du support ${kN(inp.pointLoadMax!)}`);
  // dalle en charge répartie : la pression sous le calage (ou sous les madriers retenus) n'est qu'une information
  const info = !!inp.groundInfo && (!tb || !!tb.info);
  records.push({
    key: 'spread.ground',
    title: info ? 'Pression juste sous le calage (information : le critère est la charge de la zone de dalle)' : 'Pression au sol',
    clause: tb
      ? 'grille de madriers sur sol élastique : pression maxi sous la partie qui porte l’appui (toutes ses charges + poids des madriers)'
      : inp.roadway ? 'plaques de roulage jointives : charge verticale totale / surface couverte' : 'pression uniforme sous l’emprise efficace de la dernière couche',
    formula: tb ? (info ? 'σ = max p (Winkler)' : 'σB = max p (Winkler) ≤ portance admissible') : 'σB = Rz,k / A ≤ portance admissible',
    withValues: tb
      ? info
        ? `σ = ${pressureText(last.pressure)}`
        : `σB = ${pressureText(last.pressure)} ≤ ${pressureText(bearing)}`
      : inp.roadway
      ? `σB = ${pressureText(last.pressure)} ≤ ${pressureText(bearing)}`
      : blk && !inp.layers.length
        ? `σB = ${kN(inp.Rzk)} / ${m2(last.area)} + ${kN(blk.weightK)} / ${m2(blk.dims[0] * blk.dims[1])} = ${pressureText(last.pressure)} ≤ ${pressureText(bearing)}`
        : `σB = ${kN(Rzk)}${wLayers > 0 ? ` + plaques ${kN(wLayers)}` : ''} / ${m2(last.area)} = ${pressureText(last.pressure)} ≤ ${pressureText(bearing)}`,
    result: last.pressure,
    ...(info ? {} : { limit: bearing, eta: last.eta }),
  });
  return {
    steps,
    layers: results,
    pressure: last.pressure,
    etaGround: info ? 0 : last.eta,
    etaC90,
    etaCapacity,
    etaPoint,
    eta: Math.max(info ? 0 : last.eta, etaC90, etaCapacity, etaPoint),
    areaRequired: (Rzk + wLayers) / bearing,
    problems,
    records,
  };
}

/**
 * Couches choisies résolues : plaques du stock, plaques à la taille du bloc (`blockSize` = côtés du bloc le long de u, v)
 * et madriers sur chant — à la taille de la plaque posée dessous (sinon de celle du dessus, sinon du bloc, sinon
 * 1 × 1 m). Les plaques qui ne sont plus au stock sont signalées.
 */
export function resolveLayers(refs: LayerRef[], stock: StockPlate[], blockSize?: [number, number]): { layers: SpreadLayer[]; missing: string[] } {
  const out: Array<SpreadLayer | { joists: { b: number; h: number }; ref: LayerRef }> = [];
  const missing: string[] = [];
  const n = (r: LayerRef) => Math.max(1, Math.round(r.n));
  for (const r of refs) {
    const jt = parseJoistKey(r.plate);
    if (jt) {
      out.push({ joists: jt, ref: r });
      continue;
    }
    const bp = parseBlockPlateKey(r.plate);
    if (bp) {
      const [l, w] = blockSize ?? [1000, 1000];
      out.push(stockLayer({ length: l, width: w, thickness: bp.t, quantity: 0, material: bp.material }, n(r)));
      continue;
    }
    const s = stock.find((p) => plateKey(p) === r.plate);
    if (s) out.push(stockLayer(s, n(r)));
    else missing.push(r.plate);
  }
  const isPlate = (x: (typeof out)[number] | undefined): x is SpreadLayer => !!x && !('joists' in x);
  const layers = out.map((x, i): SpreadLayer => {
    if (isPlate(x)) return x;
    const below = out.slice(i + 1).find(isPlate);
    const above = [...out.slice(0, i)].reverse().find(isPlate);
    const ref = below ?? above;
    const [l, w] = ref ? [ref.l, ref.w] : (blockSize ?? [1000, 1000]);
    return joistLayer(x.joists.b, x.joists.h, n(x.ref), l, w, x.ref.along ?? 'u', !x.ref.along);
  });
  return { layers, missing };
}

/** Sens des madriers « le plus favorable » : les deux variantes (le long de u, le long de v) quand un sens n'est pas choisi. */
export function joistVariants(layers: SpreadLayer[]): SpreadLayer[][] {
  if (!layers.some((l) => l.joist?.auto)) return [layers];
  const flip = (l: SpreadLayer): SpreadLayer => {
    if (!l.joist?.auto) return l;
    const along = l.joist.along === 'u' ? 'v' : 'u';
    return joistLayer(l.joist.b, l.joist.h, l.n, l.l, l.w, along, true);
  };
  return [layers, layers.map(flip)];
}

/**
 * Meilleur calage du stock pour un appui : une plaque (1 à 3 empilées) ou deux tailles en pyramide (la petite sur la
 * grande), qui tient la portance et le bois sous l'appui ; le moins de pièces, puis la plus petite emprise, puis le
 * moins d'épaisseur.
 */
export function bestStockLayers(base: Omit<ChainInput, 'layers'>, stock: StockPlate[]): { layers: SpreadLayer[]; chain: ChainResult } | null {
  return bestStockForAll([base], stock);
}

function stockCandidates(stock: StockPlate[]): SpreadLayer[][] {
  const plates = stock.filter((s) => s.length > 0 && s.width > 0 && s.thickness > 0);
  const cands: SpreadLayer[][] = [];
  // plaque rectangulaire : les deux sens de pose
  const turned = (L: SpreadLayer): SpreadLayer[] => (L.l !== L.w ? [L, { ...L, l: L.w, w: L.l }] : [L]);
  for (const s of plates) for (const n of [1, 2, 3]) for (const L of turned(stockLayer(s, n))) cands.push([L]);
  for (const top of plates)
    for (const bottom of plates) {
      if (top.length * top.width >= bottom.length * bottom.width) continue;
      for (const nb of [1, 2]) cands.push([stockLayer(top, 1), stockLayer(bottom, nb)]);
    }
  return cands;
}

/** Même choix que `bestStockLayers`, pour que tous les appuis donnés passent (chaîne de l'appui le plus défavorable). */
export function bestStockForAll(bases: Array<Omit<ChainInput, 'layers'>>, stock: StockPlate[]): { layers: SpreadLayer[]; chain: ChainResult } | null {
  if (!bases.length) return null;
  let best: { layers: SpreadLayer[]; chain: ChainResult; pieces: number; area: number; thick: number } | null = null;
  for (const layers of stockCandidates(stock)) {
    let chain: ChainResult | null = null;
    for (const base of bases) {
      const c = checkChain({ ...base, layers });
      if (c.eta > 1) {
        chain = null;
        break;
      }
      if (!chain || c.eta > chain.eta) chain = c;
    }
    if (!chain) continue;
    const pieces = layers.reduce((a, l) => a + l.n, 0);
    const bottom = layers[layers.length - 1];
    const area = bottom.l * bottom.w;
    const thick = layers.reduce((a, l) => a + l.n * l.t, 0);
    if (!best || pieces < best.pieces || (pieces === best.pieces && (area < best.area || (area === best.area && thick < best.thick)))) best = { layers, chain, pieces, area, thick };
  }
  return best && { layers: best.layers, chain: best.chain };
}

export interface AdviceContext {
  base: Omit<ChainInput, 'layers'>;
  stock: StockPlate[];
  /** plaques de roulage : pression uniforme et surface couverte, charge verticale totale (N) — même si elles ne sont pas retenues */
  roadway: { mean: number; area: number; load: number } | null;
  roadwayOn: boolean;
  /** calage choisi par l'utilisateur (sinon automatique) */
  custom: boolean;
}

/** Diagnostic d'un appui en une ou deux phrases : ce qui se passe, pourquoi, et quoi faire. */
export function adviseChain(id: string, chain: ChainResult, layers: SpreadLayer[], ctx: AdviceContext): string {
  const { bearing } = ctx.base;
  const Rzk = ctx.base.Rzk + (ctx.base.block?.weightK ?? 0);
  const last = chain.steps[chain.steps.length - 1];
  const where = last.dims ? `${m2(last.area)} (${dimsCm(last.dims)})` : `${m2(last.area)} de plaques de roulage`;
  const what = ctx.roadwayOn
    ? `${id} : ${kN(Rzk)} ; avec les plaques de roulage, toute l’installation (${kN(ctx.roadway?.load ?? 0)}) est répartie sur ${where} → ${pressureText(last.pressure)}`
    : ctx.base.block && !layers.length
      ? `${id} : ${kN(ctx.base.Rzk)} des pieds + ${kN(ctx.base.block.weightK)} de bloc, répartis par ${ctx.base.block.label} sur ${where} → ${pressureText(last.pressure)}`
      : `${id} : ${kN(Rzk)}${ctx.base.block ? ` (pieds + bloc ${kN(ctx.base.block.weightK)})` : ''} sur ${where} → ${pressureText(last.pressure)}`;
  const thin = chain.layers.filter((r) => !r.full).map((r) => `${r.layer.label} trop mince, ne répartit que sur ${dimsCm(r.footprint)}`);
  const other = chain.problems.filter((p) => !p.includes('trop mince'));
  if (chain.eta <= 1) {
    let txt = `${what} ≤ ${pressureText(bearing)} admissibles : OK (η ${f(chain.eta, 2)}).`;
    if (ctx.custom && !ctx.roadwayOn) {
      const best = bestStockLayers(ctx.base, ctx.stock);
      const bottom = layers[layers.length - 1];
      const bb = best?.layers[best.layers.length - 1];
      if (best && bottom && bb && bb.l * bb.w < bottom.l * bottom.w) txt += ` Plus petit possible : ${layersText(best.layers)}.`;
    }
    return txt;
  }
  const parts: string[] = [];
  if (chain.etaGround > 1) {
    const side = Math.sqrt(chain.areaRequired);
    parts.push(
      ctx.roadwayOn
        ? `${what}, le sol accepte ${pressureText(bearing)} : même avec des plaques de roulage partout, la surface couverte est trop petite pour ce sol (il faudrait ${m2((ctx.roadway?.load ?? 0) / bearing)}) — lest réduit, autre implantation ou étude spécifique.`
        : `${what}, le sol accepte ${pressureText(bearing)} : il faut au moins ${m2(chain.areaRequired)} au sol (≈ ${cm(side)} × ${cm(side)} cm${ctx.base.block ? ', plaques de répartition sous le bloc' : ''}).`,
    );
  } else parts.push(`${what} ≤ ${pressureText(bearing)} admissibles, mais :`);
  if (thin.length) parts.push(`${thin.join(' ; ')}.`);
  if (other.length) parts.push(`${other.join(' ; ')}.`);
  // madriers sur chant / cale composée : des plaques en dessous n'y changent rien
  if (chain.etaGround <= 1 && chain.problems.length && chain.problems.every((p) => /madrier/.test(p))) {
    parts.push('→ Plus de plaques sur les madriers, un madrier de plus (plus rapprochés) ou un madrier sous chaque pied.');
    return parts.join(' ');
  }
  if (!ctx.roadwayOn) {
    const best = bestStockLayers(ctx.base, ctx.stock);
    if (best) parts.push(`→ Prendre ${layersText(best.layers)} : ${pressureText(best.chain.pressure)}, OK (η ${f(best.chain.eta, 2)}).`);
    else {
      const rw = ctx.roadway;
      const rwOk = rw ? rw.mean <= bearing : false;
      parts.push(
        `→ Aucune plaque du stock ne suffit${rw ? ` ; plaques de roulage sur toute la surface : ${pressureText(rw.mean)}${rwOk ? ', OK' : ', insuffisant aussi'}` : ''} ; sinon longrines ou plaque sur mesure d’au moins ${cm(Math.sqrt(chain.areaRequired))} × ${cm(Math.sqrt(chain.areaRequired))} cm.`,
      );
    }
  } else if (chain.etaGround <= 1 && (thin.length || other.length)) parts.push('→ Plaque plus épaisse ou tôle acier sous le pied.');
  return parts.join(' ');
}
