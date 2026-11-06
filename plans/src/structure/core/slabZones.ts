// Dalle, plancher ou toiture donnés en « charge répartie admissible » (kg/m²) — A. Pinchart 04.11.2026 : « la place
// accepte un poids de 450 kg au m², pas une pression ; ne mets pas la pression au sol mais le poids qu'il y aura sur
// le sol au m² à cet endroit ». Une telle valeur est la charge moyenne que l'ouvrage porte partout à la fois : le
// critère n'est pas la pression juste sous une plaque mais le poids rapporté à la surface de dalle chargée.
//
// Contrôle par Viewbox (05–06.11.2026 : « j'ajoute 4 supports au centre, ça devrait alléger les angles ») : la dalle
// est découpée par Viewbox posée au sol (son emprise, + ce qui dépasse autour d'elle : plaques de roulage, plaques
// centrées, rattaché à la Viewbox la plus proche) ; poids de la zone = somme, combinaison par combinaison, des
// réactions des pieds de cette Viewbox (un pied commun à plusieurs Viewbox est partagé à parts égales) + calage, la
// combinaison la plus lourde ; charge = poids / surface ≤ charge admissible. Ajouter des appuis sous une Viewbox ne
// change pas le poids qu'elle met sur la dalle : il ne la pénalise jamais (un découpage pied par pied, à mi-chemin des
// pieds voisins, faisait prendre à un bloc central peu chargé la dalle des angles). La charge sous un seul pied
// reste affichée (charge ponctuelle admissible de l'exploitant). L'ensemble = charge verticale totale (combinaison la
// plus lourde) + calage, sur toute l'emprise ; un plateau de madriers retenu = une seule zone.
// Fonctions pures ; N, mm, N/mm².
import '../../core/clipperFix';
import { Clipper, FillRule, Paths64 } from 'clipper2-js';
import type { CalageResult, SupportCheck } from './calage';
import type { P2 } from './estimate';
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

const G = 9.81;

export interface SlabZone {
  /** Viewbox (« VBX-01 »), plateau « PL », ou appui hors des Viewbox (pied d'escalier, de terrasse : « E2 ») */
  id: string;
  /** appuis de calage dont les pieds chargent cette zone */
  supports: string[];
  /** combinaison retenue (la plus lourde) */
  combo?: string;
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

/** Polygones → chemins Clipper en mm entiers (sens trigonométrique). */
function toPaths(polys: P2[][]): Paths64 {
  const out = new Paths64();
  for (const p of polys) {
    const q = ccw(p);
    if (q.length >= 3 && areaOf(q) > 1) out.push(Clipper.makePath(q.flatMap((a) => [Math.round(a[0]), Math.round(a[1])])));
  }
  return out;
}
/** Résultat Clipper copié (ses points sont partagés avec son état interne) : boucles en mm, aire signée. */
function fromPaths(ps: Paths64): Array<{ loop: P2[]; area: number }> {
  const out: Array<{ loop: P2[]; area: number }> = [];
  for (const path of ps) {
    const loop: P2[] = path.map((pt) => [Number(pt.x), Number(pt.y)] as P2);
    if (loop.length >= 3) out.push({ loop, area: Clipper.area(path) });
  }
  return out;
}

/** Rectangle (4 angles) agrandi de `d` mm de chaque côté. */
export function grownRect(c: P2[], d: number): P2[] {
  if (!(d > 0) || c.length !== 4) return c;
  const unit = (a: P2, b: P2): P2 => {
    const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
    return [(a[0] - b[0]) / l, (a[1] - b[1]) / l];
  };
  return c.map((a, k) => {
    const prev = c[(k + 3) % 4];
    const next = c[(k + 1) % 4];
    const u1 = unit(a, next);
    const u2 = unit(a, prev);
    return [a[0] + d * (u1[0] + u2[0]), a[1] + d * (u1[1] + u2[1])] as P2;
  });
}

/** Surface couverte (union des polygones) et son aire (mm²). */
export function coveredArea(polys: P2[][]): number {
  const u = Clipper.Union(toPaths(polys), undefined, FillRule.NonZero);
  return fromPaths(u).reduce((s, x) => s + x.area, 0);
}

/** Contours extérieurs de l'union de polygones (plaques de roulage jointives sur toute la surface). */
export function unionLoops(polys: P2[][]): P2[][] {
  const u = Clipper.Union(toPaths(polys), undefined, FillRule.NonZero);
  return fromPaths(u).filter((x) => x.area > 0).map((x) => x.loop);
}

/** Contour d'un rectangle (4 angles) remis dans le sens trigonométrique. */
function ccw(p: P2[]): P2[] {
  const s = p.reduce((acc, a, i) => { const b = p[(i + 1) % p.length]; return acc + a[0] * b[1] - b[0] * a[1]; }, 0);
  return s < 0 ? [...p].reverse() : p;
}

/** Poids des plaques posées sous un appui (N). */
const platesWeight = (c: SupportCheck) => c.layerList.reduce((s, l) => s + l.n * l.massKg * G, 0);

/** Options du contrôle par Viewbox. */
export interface SlabOptions {
  /** Viewbox posées au sol (zones) ; absent / vide = une seule zone pour toute la surface */
  modules?: Array<{ id: string; level: number; corners: P2[] }>;
  /** Rz,k = Rz,Ed / 1,35 (méthode statico) */
  statico?: boolean;
  /** toute la surface est une seule zone (plateau de madriers retenu) */
  single?: string;
}

const dist2Rect = (p: P2, c: P2[]) => {
  // distance d'un point à un polygone convexe (0 dedans)
  let inside = true;
  let best = Infinity;
  for (let i = 0; i < c.length; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cross < 0) inside = false;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]));
  }
  return inside ? 0 : best;
};
const centroid = (p: P2[]): P2 => [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length];

/**
 * Zones de dalle (une par Viewbox posée au sol) et charge au m². `surface` = polygones couverts (emprise des Viewbox
 * au sol, ce qui dépasse, ou le plateau de madriers retenu) ; `spread` = poids réparti sur toute la surface (plaques de
 * roulage, madriers), N/mm². Les pieds d'escalier et de terrasse, hors de l'emprise, gardent la surface de leur plaque.
 */
export function slabZones(res: CalageResult, bearing: number, surface: P2[][], spread: number, opts: SlabOptions = {}): SlabResult {
  const covered = Clipper.Union(toPaths(surface), undefined, FillRule.NonZero);
  const coveredLoops = fromPaths(covered);
  const total = coveredLoops.reduce((s, x) => s + x.area, 0);
  const sites = res.checks.filter((c) => !c.reaction.group.stair && !c.reaction.group.terrace);
  const boxes = opts.single ? [] : (opts.modules ?? []).filter((m) => m.level === 0).map((m) => ({ id: m.id, poly: ccw(m.corners) }));
  // surface couverte découpée par Viewbox : entre deux Viewbox voisines, frontière au milieu de l'espace qui les
  // sépare (perpendiculaire à la ligne de leurs centres) — ce qui dépasse autour d'une Viewbox lui revient
  const pts = coveredLoops.flatMap((x) => x.loop);
  const bb: P2[] = pts.length
    ? [
        [Math.min(...pts.map((p) => p[0])) - 10, Math.min(...pts.map((p) => p[1])) - 10],
        [Math.max(...pts.map((p) => p[0])) + 10, Math.min(...pts.map((p) => p[1])) - 10],
        [Math.max(...pts.map((p) => p[0])) + 10, Math.max(...pts.map((p) => p[1])) + 10],
        [Math.min(...pts.map((p) => p[0])) - 10, Math.max(...pts.map((p) => p[1])) + 10],
      ]
    : [];
  const regions: Array<{ id: string; pieces: Array<{ loop: P2[]; area: number }> }> = boxes.length
    ? boxes.map((b, i) => {
        let cell: P2[] = bb;
        const ci = centroid(b.poly);
        boxes.forEach((o, j) => {
          if (j === i || cell.length < 3) return;
          const cj = centroid(o.poly);
          const len = Math.hypot(cj[0] - ci[0], cj[1] - ci[1]);
          if (len < 1) return;
          const d: P2 = [(cj[0] - ci[0]) / len, (cj[1] - ci[1]) / len];
          const pr = (p: P2) => p[0] * d[0] + p[1] * d[1];
          const hi = Math.max(...b.poly.map(pr));
          const lo = Math.min(...o.poly.map(pr));
          // espace entre les deux Viewbox le long de leurs centres ; si elles se chevauchent dans ce sens : milieu des centres
          const m = lo >= hi - 1 ? (hi + lo) / 2 : (pr(ci) + pr(cj)) / 2;
          cell = clipHalf(cell, [d[0] * m, d[1] * m], d);
        });
        return { id: b.id, pieces: cell.length >= 3 ? fromPaths(Clipper.Intersect(covered, toPaths([cell]), FillRule.NonZero)) : [] };
      })
    : [{ id: opts.single ?? 'dalle', pieces: coveredLoops }];
  // pieds → zones : les Viewbox de l'appui (posées au sol), sinon celle sous le pied, sinon la plus proche
  const shareOf = (c: SupportCheck): Array<{ k: number; w: number }> => {
    if (!boxes.length) return [{ k: 0, w: 1 }];
    const own = c.reaction.group.moduleIds.map((id) => boxes.findIndex((b) => b.id === id)).filter((k) => k >= 0);
    if (own.length) return [...new Set(own)].map((k) => ({ k, w: 1 / new Set(own).size }));
    let k = 0;
    boxes.forEach((b, i) => {
      if (dist2Rect(c.at, b.poly) < dist2Rect(c.at, boxes[k].poly)) k = i;
    });
    return [{ k, w: 1 }];
  };
  const shares = sites.map(shareOf);
  // charge des pieds de chaque zone combinaison par combinaison (public limité : au plus le public limité dans la zone)
  const est = res.estimate;
  const cap = est.publicLimit !== undefined ? est.publicLimit * (est.publicCap ?? 1) : Infinity;
  const allCombos = sites.every((c) => c.reaction.combos?.length);
  const useSls = !opts.statico && sites.some((c) => c.reaction.combos?.some((x) => x.cls === 'SLS'));
  const feetOf = (k: number): { N: number; combo?: string } => {
    const mine = sites.map((c, i) => ({ c, w: shares[i].find((x) => x.k === k)?.w ?? 0 })).filter((x) => x.w > 0);
    if (!mine.length) return { N: 0 };
    if (!allCombos) return { N: mine.reduce((a, x) => a + x.w * x.c.Rzk, 0) };
    const by = new Map<string, { R: number; Q: number; gQ: number; name: string }>();
    for (const { c, w } of mine)
      for (const x of c.reaction.combos!) {
        if (useSls ? x.cls !== 'SLS' : x.cls !== 'ULS') continue;
        const key = `${x.cls}|${x.combo}`;
        const acc = by.get(key) ?? { R: 0, Q: 0, gQ: x.gQ, name: x.combo };
        acc.R += w * x.R;
        acc.Q += w * x.Q;
        by.set(key, acc);
      }
    let best = { N: 0, combo: undefined as string | undefined };
    for (const v of by.values()) {
      const R = (v.R - v.gQ * Math.max(0, v.Q - cap)) / (useSls ? 1 : 1.35);
      if (R > best.N) best = { N: R, combo: v.name };
    }
    return best;
  };
  const zones: SlabZone[] = regions.map((r, k) => {
    const area = r.pieces.reduce((s, x) => s + x.area, 0);
    const mine = sites.map((c, i) => ({ c, w: shares[i].find((x) => x.k === k)?.w ?? 0 })).filter((x) => x.w > 0);
    const f = feetOf(k);
    const parts = {
      feet: f.N,
      block: mine.reduce((s, x) => s + x.w * (x.c.block ? x.c.block.massKg * G : 0), 0),
      plates: mine.reduce((s, x) => s + x.w * platesWeight(x.c), 0),
      spread: spread * area,
    };
    const load = parts.feet + parts.block + parts.plates + parts.spread;
    const q = area > 0 ? load / area : Infinity;
    return { id: r.id, supports: mine.map((x) => x.c.id), ...(f.combo ? { combo: f.combo } : {}), area, load, q, eta: q / bearing, pieces: r.pieces.filter((x) => x.area > 0).map((x) => x.loop), parts };
  });
  // escaliers, terrasses : la surface de leur plaque du dessous (ou du contact)
  for (const c of res.checks.filter((x) => !sites.includes(x))) {
    const poly = c.plan?.corners ?? null;
    const area = poly ? areaOf(poly) : c.geometry.contact[0] * c.geometry.contact[1];
    const parts = { feet: c.Rzk, block: 0, plates: platesWeight(c), spread: 0 };
    const load = parts.feet + parts.plates;
    const q = load / area;
    zones.push({ id: c.id, supports: [c.id], area, load, q, eta: q / bearing, pieces: poly ? [poly] : [], parts });
  }
  // ensemble : charge verticale de la combinaison la plus lourde (pas la somme des maxima de chaque pied) + calage
  const calageN = sites.reduce((s, c) => s + (c.block ? c.block.massKg * G : 0) + platesWeight(c), 0) + spread * total;
  const gLoad = (est.verticalK ?? est.totalG + est.totalQ) + calageN;
  const gq = total > 0 ? gLoad / total : Infinity;
  const worst = zones.reduce<SlabZone | null>((a, z) => (!a || z.eta > a.eta ? z : a), null);
  return { bearing, global: { area: total, load: gLoad, q: gq, eta: gq / bearing }, zones, worst };
}

/** Zone de dalle d'un appui : la plus chargée des zones qu'il charge. */
export function zoneOfSupport(s: SlabResult, id: string): SlabZone | undefined {
  return s.zones.filter((z) => z.supports.includes(id)).reduce<SlabZone | undefined>((a, z) => (!a || z.eta > a.eta ? z : a), undefined);
}

/** Fiche de calcul d'une zone de dalle (une Viewbox). */
export function zoneRecord(z: SlabZone, bearing: number): CalcRecord {
  const extra = [z.parts.block > 0 ? `bloc ${kN(z.parts.block)}` : '', z.parts.plates > 0 ? `plaques ${kN(z.parts.plates)}` : '', z.parts.spread > 0 ? `plaques de roulage / madriers ${kN(z.parts.spread)}` : '']
    .filter(Boolean)
    .join(' + ');
  return {
    key: 'slab.zone',
    title: `Charge sur la dalle — sous ${z.id}`,
    clause: `charge répartie admissible de l’ouvrage : poids sur la dalle sous ${z.id} (somme des pieds dans la combinaison la plus lourde${z.combo ? ` ${z.combo}` : ''}, + calage) / surface de dalle chargée`,
    formula: 'q = (ΣRz,k + G calage) / A ≤ charge admissible',
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
