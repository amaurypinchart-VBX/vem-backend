// Calage appui par appui : chaîne de répartition pied → couches de plaques → sol (ou plaques de roulage jointives sur
// toute la surface), avec l'emprise réellement efficace de chaque plaque — une plaque trop mince ne répartit que sur la
// partie qu'elle peut porter en flexion (méthode statico du porte-à-faux diagonal, même idée que la largeur d'appui
// efficace des platines EN 1993-1-8 § 6.2.5). Choix par type d'appui ou par appui, diagnostic et conseil (« 70 × 70 :
// 61 kN sur 0,49 m² → 125 kN/m² > 40 kN/m², il faut 1,53 m² → 2 × 100 × 100 × 36 »). Fonctions pures ; N, mm, N/mm².
import type { SpreadLayer, StockPlate } from './ground';
import { PANELS, plateKey, stockLayer } from './ground';
import type { CalcRecord } from './records';
import { kgm2 } from './roadway';
import { fmtNumber } from './units';

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
  /** pression uniforme sur toute la plaque : moment du porte-à-faux (N·mm/mm) ; moment résistant de la couche */
  MEdFull: number;
  MRd: number;
  /** épaisseur de chaque plaque (mm, n plaques empilées) pour répartir sur toute la plaque */
  tFull: number;
  /** compression transversale sous l'appui (bois) */
  sigmaC90: number;
  fc90d: number | null;
}

/**
 * Emprise efficace d'une couche sous un appui a1 × a2 : pression uniforme sous l'emprise (a1 + λ(l − a1)) × (a2 + λ(w − a2)),
 * porte-à-faux diagonal e = λ · √(((l − a1)/2)² + ((w − a2)/2)²), MEd = Rz,Ed / A · e² / 2 ≤ fm,d · n · t² / 6 : le plus
 * grand λ ≤ 1 (MEd croît avec λ). λ = 1 : méthode statico, toute la plaque répartit.
 */
export function spreadLayer(layer: SpreadLayer, contact: [number, number], REd: number): LayerResult {
  const { fmd, fc90d } = layerStrength(layer);
  const [c1, c2] = contact;
  // plaque plus petite que l'appui dans une direction : pas de porte-à-faux dans cette direction
  const b1 = Math.min(c1, layer.l);
  const b2 = Math.min(c2, layer.w);
  const d1 = Math.max(0, layer.l - c1);
  const d2 = Math.max(0, layer.w - c2);
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
  const { Rzk, REd, bearing } = inp;
  const steps: ChainStep[] = [];
  const records: CalcRecord[] = [];
  const problems: string[] = [];
  const stepOf = (label: string, dims: [number, number], note?: string): ChainStep => {
    const area = dims[0] * dims[1];
    const pressure = Rzk / area;
    return { label, dims, area, pressure, eta: pressure / bearing, note };
  };
  let c: [number, number] = [...inp.contact];
  steps.push(stepOf(inp.contactLabel, c));
  const results: LayerResult[] = [];
  let etaC90 = 0;
  let etaCapacity = 0;
  for (const L of inp.layers) {
    const r = spreadLayer(L, c, REd);
    results.push(r);
    const lab = `${L.n > 1 ? `${L.n} × ` : ''}${L.label}`;
    let note: string | undefined;
    if (!r.full) {
      note = `trop mince pour répartir sur toute la plaque : emprise efficace ${dimsCm(r.footprint)} (il faudrait ${f(r.tFull, 0)} mm par plaque)`;
      problems.push(`${lab} : ${note}`);
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
      clause: L.material === 'commercial' ? 'capacité du fabricant, emprise = toute la plaque' : 'méthode statico (porte-à-faux diagonal) ; emprise efficace si la plaque est trop mince',
      formula:
        L.material === 'commercial'
          ? 'Rz,k ≤ Fadm'
          : 'MEd = Rz,Ed / A · e² / 2 ≤ MRd = fm,d · n · t² / 6 ; sinon emprise réduite jusqu’à MEd = MRd',
      withValues:
        L.material === 'commercial'
          ? `${kN(Rzk)} ≤ ${kN(L.capacity ?? 0)}`
          : `appui ${dimsCm(c)} sur ${cm(L.l)} × ${cm(L.w)} cm : MEd = ${f(r.MEdFull / 1e3, 2)} kNcm/cm ; MRd = ${f(r.MRd / 1e3, 2)} kNcm/cm → ${r.full ? 'toute la plaque répartit' : `emprise efficace ${dimsCm(r.footprint)}`}`,
      eta: L.material === 'commercial' ? Rzk / (L.capacity ?? Infinity) : Math.min(1, r.MEdFull / r.MRd),
    });
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
      : `σB = ${kN(Rzk)} / ${m2(last.area)} = ${pressureText(last.pressure)} ≤ ${pressureText(bearing)}`,
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
    areaRequired: Rzk / bearing,
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
  const plates = stock.filter((s) => s.length > 0 && s.width > 0 && s.thickness > 0);
  const cands: SpreadLayer[][] = [];
  for (const s of plates) for (const n of [1, 2, 3]) cands.push([stockLayer(s, n)]);
  for (const top of plates)
    for (const bottom of plates) {
      if (top.length * top.width >= bottom.length * bottom.width) continue;
      for (const nb of [1, 2]) cands.push([stockLayer(top, 1), stockLayer(bottom, nb)]);
    }
  let best: { layers: SpreadLayer[]; chain: ChainResult; pieces: number; area: number; thick: number } | null = null;
  for (const layers of cands) {
    const chain = checkChain({ ...base, layers });
    if (chain.eta > 1) continue;
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
  const { Rzk, bearing } = ctx.base;
  const last = chain.steps[chain.steps.length - 1];
  const where = last.dims ? `${m2(last.area)} (${dimsCm(last.dims)})` : `${m2(last.area)} de plaques de roulage`;
  const what = ctx.roadwayOn
    ? `${id} : ${kN(Rzk)} ; avec les plaques de roulage, toute l’installation (${kN(ctx.roadway?.load ?? 0)}) est répartie sur ${where} → ${pressureText(last.pressure)}`
    : `${id} : ${kN(Rzk)} sur ${where} → ${pressureText(last.pressure)}`;
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
        : `${what}, le sol accepte ${pressureText(bearing)} : il faut au moins ${m2(chain.areaRequired)} au sol (≈ ${cm(side)} × ${cm(side)} cm).`,
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
