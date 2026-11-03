// Calage appui par appui : chaîne de répartition pied → couches de plaques → sol (ou plaques de roulage jointives sur
// toute la surface), avec l'emprise réellement efficace de chaque plaque — une plaque trop mince ne répartit que sur la
// partie qu'elle peut porter en flexion (méthode statico du porte-à-faux diagonal, même idée que la largeur d'appui
// efficace des platines EN 1993-1-8 § 6.2.5). Choix par type d'appui ou par appui, diagnostic et conseil (« 70 × 70 :
// 61 kN sur 0,49 m² → 125 kN/m² > 40 kN/m², il faut 1,53 m² → 2 × 100 × 100 × 36 »). Fonctions pures ; N, mm, N/mm².
import type { SpreadLayer, StockPlate } from './ground';
import { HDPE_GAMMA, PANELS, plateKey, stockLayer } from './ground';
import type { CalcRecord } from './records';
import { kgm2 } from './roadway';
import { fmtNumber } from './units';
import type { BlockChain } from './blocks';
import { blockPlateCaps } from './blocks';

/** Une couche choisie : n plaques identiques du stock (clé `plateKey`) empilées. */
export interface LayerRef {
  plate: string;
  n: number;
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
  /** longrines bois sous les grands côtés retenues à la place des plaques (sinon : variante proposée seulement) */
  longrine?: boolean;
  /** pose des plaques choisie pour un appui (« P4 », « B2 ») : à fleur de la Viewbox ou centrées ; absent = réglage général */
  placeBySupport?: Record<string, 'flush' | 'centered'>;
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

export const layersText = (layers: SpreadLayer[]) => layers.map((l) => `${l.n} × ${l.label}`).join(' + ');

/** Chaîne de répartition d'un appui : contact → chaque couche (emprise efficace) → sol ou plaques de roulage. */
export function checkChain(inp: ChainInput): ChainResult {
  const { bearing } = inp;
  const blk = inp.block;
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
  if (blk) {
    const [eu, ev] = blk.eff;
    const effA = Math.max(1, eu * ev);
    const blockA = blk.dims[0] * blk.dims[1];
    // pieds sur l'emprise efficace + poids du bloc sur toute sa base (superposition, côté de la sécurité)
    const q = inp.Rzk / effA + blk.weightK / blockA;
    const e = Math.hypot(blk.offset[0], blk.offset[1]);
    const notes: string[] = [];
    if (e > 10) notes.push(`résultante des pieds à ${f(Math.abs(blk.offset[0]) / 10, 0)} / ${f(Math.abs(blk.offset[1]) / 10, 0)} cm du centre du bloc : emprise centrée sur la charge, B' = B − 2 e`);
    if (blk.diffusionLimited) notes.push(`diffusion à 45° sur ${f(blk.height / 10, 0)} cm de hauteur : le bloc ne répartit pas sur toute sa base`);
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
  for (const L of inp.layers) {
    const r = spreadLayer(L, c, REd, capsOf(L), inp.subgrade);
    results.push(r);
    const lab = `${L.n > 1 ? `${L.n} × ` : ''}${L.label}`;
    let note: string | undefined;
    if (r.eccentric) note = blk ? (blk.plate === 'flush' ? 'plaque à fleur de la Viewbox sous le bloc : emprise centrée sur la charge (B\' = B − 2 e)' : 'plaque centrée sous le bloc : emprise centrée sur la charge (B\' = B − 2 e)') : capText();
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
      wLayers += L.n * L.massKg * 9.81;
      steps.push(stepOf(`+ ${lab}`, r.footprint, note));
      c = r.footprint;
      continue;
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
          : `appui ${dimsCm(c)} sur ${cm(L.l)} × ${cm(L.w)} cm${r.eccentric ? ` (${capText()})` : ''} : MEd = ${f(r.MEdFull / 1e3, 2)} kNcm/cm ; MRd = ${f(r.MRd / 1e3, 2)} kNcm/cm → ${r.full ? (r.eccentric ? `emprise efficace ${dimsCm(r.footprint)}` : 'toute la plaque répartit') : `emprise efficace ${dimsCm(r.footprint)}`}`,
      eta: L.material === 'commercial' ? Rzk / (L.capacity ?? Infinity) : Math.min(1, r.MEdFull / r.MRd),
    });
    wLayers += L.n * L.massKg * 9.81;
    steps.push(stepOf(`+ ${lab}`, r.footprint, note));
    c = r.footprint;
  }
  if (inp.roadway) {
    const q = inp.roadway.mean;
    steps.push({ label: '+ Plaques de roulage sur toute la surface (charge totale répartie uniformément)', dims: null, area: inp.roadway.area, pressure: q, eta: q / bearing });
  }
  const last = steps[steps.length - 1];
  const etaPoint = inp.pointLoadMax ? Rzk / inp.pointLoadMax : 0;
  if (etaPoint > 1) problems.push(`${kN(Rzk)} > charge ponctuelle admissible du support ${kN(inp.pointLoadMax!)}`);
  records.push({
    key: 'spread.ground',
    title: 'Pression au sol',
    clause: inp.roadway ? 'plaques de roulage jointives : charge verticale totale / surface couverte' : 'pression uniforme sous l’emprise efficace de la dernière couche',
    formula: 'σB = Rz,k / A ≤ portance admissible',
    withValues: inp.roadway
      ? `σB = ${pressureText(last.pressure)} ≤ ${pressureText(bearing)}`
      : blk && !inp.layers.length
        ? `σB = ${kN(inp.Rzk)} / ${m2(last.area)} + ${kN(blk.weightK)} / ${m2(blk.dims[0] * blk.dims[1])} = ${pressureText(last.pressure)} ≤ ${pressureText(bearing)}`
        : `σB = ${kN(Rzk)}${wLayers > 0 ? ` + plaques ${kN(wLayers)}` : ''} / ${m2(last.area)} = ${pressureText(last.pressure)} ≤ ${pressureText(bearing)}`,
    result: last.pressure,
    limit: bearing,
    eta: last.eta,
  });
  return {
    steps,
    layers: results,
    pressure: last.pressure,
    etaGround: last.eta,
    etaC90,
    etaCapacity,
    etaPoint,
    eta: Math.max(last.eta, etaC90, etaCapacity, etaPoint),
    areaRequired: (Rzk + wLayers) / bearing,
    problems,
    records,
  };
}

/** Couches du stock résolues ; les plaques qui ne sont plus au stock sont signalées. */
export function resolveLayers(refs: LayerRef[], stock: StockPlate[]): { layers: SpreadLayer[]; missing: string[] } {
  const layers: SpreadLayer[] = [];
  const missing: string[] = [];
  for (const r of refs) {
    const s = stock.find((p) => plateKey(p) === r.plate);
    if (s) layers.push(stockLayer(s, Math.max(1, Math.round(r.n))));
    else missing.push(r.plate);
  }
  return { layers, missing };
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
