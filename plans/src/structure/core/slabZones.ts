// Dalle, plancher ou toiture donnés en « charge répartie admissible » (kg/m²) — A. Pinchart 04.11.2026 : « la place
// accepte un poids de 450 kg au m², pas une pression ; ne mets pas la pression au sol mais le poids qu'il y aura sur
// le sol au m² à cet endroit ». Une telle valeur est la charge moyenne que l'ouvrage porte partout à la fois : le
// critère n'est pas la pression juste sous une plaque mais le poids rapporté à la surface de dalle que chaque pied
// charge. Chaque pied reçoit sa zone (la moitié de la distance aux pieds voisins = cellule de Voronoï, limitée à
// l'emprise au sol des Viewbox, ou au plateau de madriers retenu) ; poids de la zone = réaction maxi du pied (pire
// cas des combinaisons) + son bloc + ses plaques + sa part des plaques de roulage / madriers ; charge de la zone =
// poids / surface ≤ charge admissible. L'ensemble = charge verticale totale (combinaison la plus lourde) + calage,
// sur toute l'emprise. Fonctions pures ; N, mm, N/mm².
import type { CalageResult, SupportCheck } from './calage';
import type { P2 } from './estimate';
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

const G = 9.81;

export interface SlabZone {
  /** appui de calage (« P4 », « B2 ») */
  id: string;
  /** surface de dalle de la zone (mm²) et poids qui la charge (N, caractéristique) */
  area: number;
  load: number;
  /** charge de la zone (N/mm²) et taux = charge / charge admissible */
  q: number;
  eta: number;
  /** morceaux convexes de la zone en plan (monde x, z, mm) */
  pieces: P2[][];
  /** détail du poids : pied, bloc, plaques, plaques de roulage / madriers (N) */
  parts: { feet: number; block: number; plates: number; spread: number };
}

export interface SlabResult {
  bearing: number;
  /** ensemble : surface couverte, poids total simultané (combinaison la plus lourde + calage), charge moyenne, taux */
  global: { area: number; load: number; q: number; eta: number };
  zones: SlabZone[];
  worst: SlabZone | null;
}

const kgm2 = (q: number) => (q * 1e6) / G;
const f = (v: number, d = 1) => fmtNumber(v, d);
/** « 458 kg/m² (4,5 kN/m²) » : charge au m², en poids d'abord */
export const loadPerM2Text = (q: number) => `${f(kgm2(q), 0)} kg/m² (${f(q * 1e3, q * 1e3 < 10 ? 1 : 0)} kN/m²)`;
const kN = (n: number) => `${f(n / 1e3, 1)} kN`;
const m2 = (a: number) => `${f(a / 1e6, 2)} m²`;

const areaOf = (p: P2[]) => Math.abs(p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0)) / 2;

/** Polygone convexe coupé par le demi-plan (p − m) · n ≤ 0 (Sutherland–Hodgman). */
function clipHalf(poly: P2[], m: P2, n: P2): P2[] {
  const out: P2[] = [];
  const s = (p: P2) => (p[0] - m[0]) * n[0] + (p[1] - m[1]) * n[1];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = s(a);
    const sb = s(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/** Contour d'un rectangle (4 angles) remis dans le sens trigonométrique. */
function ccw(p: P2[]): P2[] {
  const s = p.reduce((acc, a, i) => { const b = p[(i + 1) % p.length]; return acc + a[0] * b[1] - b[0] * a[1]; }, 0);
  return s < 0 ? [...p].reverse() : p;
}

/** Poids des plaques posées sous un appui (N). */
const platesWeight = (c: SupportCheck) => c.layerList.reduce((s, l) => s + l.n * l.massKg * G, 0);

/**
 * Zones de dalle de chaque appui et charge au m². `surface` = rectangles couverts (emprise des Viewbox au sol, ou le
 * plateau de madriers retenu) ; `spread` = poids réparti sur toute la surface (plaques de roulage, madriers), N/mm².
 * Les pieds d'escalier et de terrasse, hors de l'emprise, gardent la surface de leur plaque (ou de leur contact).
 */
export function slabZones(res: CalageResult, bearing: number, surface: P2[][], spread: number): SlabResult {
  const rects = surface.map(ccw);
  const total = rects.reduce((s, r) => s + areaOf(r), 0);
  const sites = res.checks.filter((c) => !c.reaction.group.stair && !c.reaction.group.terrace);
  const zones: SlabZone[] = [];
  for (const c of sites) {
    const pieces: P2[][] = [];
    for (const r of rects) {
      let poly = r;
      for (const o of sites) {
        if (o === c || !poly.length) continue;
        const n: P2 = [o.at[0] - c.at[0], o.at[1] - c.at[1]];
        if (Math.hypot(n[0], n[1]) < 1) continue;
        poly = clipHalf(poly, [(o.at[0] + c.at[0]) / 2, (o.at[1] + c.at[1]) / 2], n);
      }
      if (poly.length >= 3 && areaOf(poly) > 1) pieces.push(poly);
    }
    const area = pieces.reduce((s, p) => s + areaOf(p), 0);
    const parts = { feet: c.Rzk, block: c.block ? c.block.massKg * G : 0, plates: platesWeight(c), spread: spread * area };
    const load = parts.feet + parts.block + parts.plates + parts.spread;
    const q = area > 0 ? load / area : Infinity;
    zones.push({ id: c.id, area, load, q, eta: q / bearing, pieces, parts });
  }
  // escaliers, terrasses : la surface de leur plaque du dessous (ou du contact)
  for (const c of res.checks.filter((x) => !sites.includes(x))) {
    const poly = c.plan?.corners ?? null;
    const area = poly ? areaOf(poly) : c.geometry.contact[0] * c.geometry.contact[1];
    const parts = { feet: c.Rzk, block: 0, plates: platesWeight(c), spread: 0 };
    const load = parts.feet + parts.plates;
    const q = load / area;
    zones.push({ id: c.id, area, load, q, eta: q / bearing, pieces: poly ? [poly] : [], parts });
  }
  // ensemble : charge verticale de la combinaison la plus lourde (pas la somme des maxima de chaque pied) + calage
  const est = res.estimate;
  const calageN = sites.reduce((s, c) => s + (c.block ? c.block.massKg * G : 0) + platesWeight(c), 0) + spread * total;
  const gLoad = (est.verticalK ?? est.totalG + est.totalQ) + calageN;
  const gq = total > 0 ? gLoad / total : Infinity;
  const worst = zones.reduce<SlabZone | null>((a, z) => (!a || z.eta > a.eta ? z : a), null);
  return { bearing, global: { area: total, load: gLoad, q: gq, eta: gq / bearing }, zones, worst };
}

/** Fiche de calcul de la zone d'un appui. */
export function zoneRecord(z: SlabZone, bearing: number): CalcRecord {
  const extra = [z.parts.block > 0 ? `bloc ${kN(z.parts.block)}` : '', z.parts.plates > 0 ? `plaques ${kN(z.parts.plates)}` : '', z.parts.spread > 0 ? `plaques de roulage / madriers ${kN(z.parts.spread)}` : '']
    .filter(Boolean)
    .join(' + ');
  return {
    key: 'slab.zone',
    title: `Charge sur la dalle — zone de ${z.id}`,
    clause: 'charge répartie admissible de l’ouvrage : poids de la zone (réaction maxi du pied, pire cas, + calage) / surface de dalle de la zone (moitié de la distance aux pieds voisins)',
    formula: 'q = (Rz,k + G calage) / A zone ≤ charge admissible',
    withValues: `q = (${kN(z.parts.feet)}${extra ? ` + ${extra}` : ''}) / ${m2(z.area)} = ${loadPerM2Text(z.q)} ≤ ${loadPerM2Text(bearing)}`,
    result: z.q,
    limit: bearing,
    eta: z.eta,
  };
}

/** Fiche de calcul de l'ensemble de l'installation. */
export function globalRecord(s: SlabResult): CalcRecord {
  return {
    key: 'slab.global',
    title: 'Charge sur la dalle — ensemble de l’installation',
    clause: 'poids total (combinaison la plus lourde + calage) / surface couverte',
    formula: 'q = ΣG / A ≤ charge admissible',
    withValues: `q = ${kN(s.global.load)} / ${m2(s.global.area)} = ${loadPerM2Text(s.global.q)} ≤ ${loadPerM2Text(s.bearing)}`,
    result: s.global.q,
    limit: s.bearing,
    eta: s.global.eta,
  };
}
