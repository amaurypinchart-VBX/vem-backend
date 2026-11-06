// Pistes pour faire passer un calage au sol qui ne passe pas (étape « Sol & calage ») : ce qu'un ingénieur proposerait,
// chiffré par l'outil — blocs centrés sous les pieds, surface d'appui nécessaire par appui (et si les surfaces se
// touchent), madriers C24 continus sous chaque rangée d'appuis (poutre sur sol élastique, Winkler, avec et sans les
// blocs dessinés), plateau continu, réduction de la charge. Chaque piste dit ce qu'elle suppose ; seule une piste
// vérifiée par le calcul est marquée « passe ». Fonctions pures ; N, mm, N/mm².
import type { CalageInput, CalageResult, SupportCheck } from './calage';
import type { MaterialLine, TimberBeam } from './ground';
import { C24, C24_BEAMS, checkLongrine } from './ground';
import type { P2 } from './estimate';
import { moduleAxes } from './placement';
import type { CalcRecord } from './records';
import { pressureText } from './spreading';
import { fmtNumber } from './units';

export type RemedyVerdict = 'ok' | 'fail' | 'study' | 'info';

type Beam = Pick<TimberBeam, 'b' | 'h'>;

/** Grille de madriers retenue pour une rangée d'appuis (appuis par leur id, pour retrouver la rangée). */
export interface SleeperRowDesign {
  ids: string[];
  beam: Beam;
  count: number;
  /** répartiteurs transversaux du dessus (null : aucun) */
  top: Beam | null;
}

/**
 * Solution choisie à l'étape Sol & calage (`CalageChoices.remedy`) : la géométrie trouvée par la recherche, figée ;
 * le calage la revérifie à chaque calcul (charges, portance et raideur du sol actuelles).
 */
export type AppliedRemedy =
  | { key: 'sleepers' | 'sleepers-no-blocks'; rows: SleeperRowDesign[] }
  | { key: 'platform' | 'platform-no-blocks'; over: number; lower: Beam; upper: Beam };

/** Contour en plan d'une partie de la solution (monde x, z, mm), pour les plans. */
export interface RemedyOutline {
  id: string;
  corners: [P2, P2, P2, P2];
  label: string;
  sub?: string;
}

/** Ce que la solution appliquée apporte à chaque appui : pression au sol, taux du bois, libellé de l'étape. */
export interface RemedySupport {
  label: string;
  /** pression maxi au sol sous les madriers (N/mm²) et surface de la partie qui porte l'appui (mm²) */
  pressure: number;
  area: number;
  /** taux du bois (flexion, cisaillement, compression transversale, répartiteurs) */
  etaTimber: number;
  records: CalcRecord[];
  note?: string;
}

export interface RemedyEvaluation {
  remedy: CalageRemedy;
  perSupport: Map<string, RemedySupport>;
  outlines: RemedyOutline[];
}

export interface CalageRemedy {
  key: 'centre-blocks' | 'area' | 'sleepers' | 'sleepers-no-blocks' | 'platform' | 'platform-no-blocks' | 'load';
  title: string;
  verdict: RemedyVerdict;
  /** taux de travail le plus défavorable de la piste (sol, bois…) quand elle est calculée */
  eta?: number;
  summary: string;
  details: string[];
  materials: MaterialLine[];
  records: CalcRecord[];
  /** hypothèses et limites de la piste */
  notes: string[];
  /** ce qu'il faut retenir pour appliquer la piste (absent : piste d'information) */
  apply?: AppliedRemedy | 'centre-blocks';
}

const f = (v: number, d = 1) => fmtNumber(v, d);
const kN = (n: number) => `${f(n / 1e3, 1)} kN`;
const m = (mm: number) => `${f(mm / 1e3, 2)} m`;
const G = 9.81;

/** Charge au sol d'un appui (N) : pieds + bloc dessiné (caractéristique, de calcul). */
function supportLoad(c: SupportCheck, withBlock = true): { Pk: number; PEd: number } {
  const w = withBlock && c.block ? c.block.massKg * G : 0;
  return { Pk: c.Rzk + w, PEd: c.REd + 1.35 * w };
}

/** Rangées d'appuis alignés le long du grand côté de l'installation (centres à ± 400 mm en travers). */
export function supportRows(checks: SupportCheck[], u: P2): Array<{ v: number; items: Array<{ c: SupportCheck; s: number }> }> {
  const v: P2 = [-u[1], u[0]];
  const pts = checks.map((c) => ({ c, s: c.at[0] * u[0] + c.at[1] * u[1], t: c.at[0] * v[0] + c.at[1] * v[1] }));
  const rows: Array<{ v: number; items: Array<{ c: SupportCheck; s: number }> }> = [];
  for (const p of [...pts].sort((a, b) => a.t - b.t)) {
    const row = rows.find((r) => Math.abs(r.v - p.t) <= 400);
    if (row) {
      row.items.push({ c: p.c, s: p.s });
      row.v = (row.v * (row.items.length - 1) + p.t) / row.items.length;
    } else rows.push({ v: p.t, items: [{ c: p.c, s: p.s }] });
  }
  for (const r of rows) r.items.sort((a, b) => a.s - b.s);
  return rows;
}

interface RowDesign {
  beam: Beam;
  count: number;
  length: number;
  pressure: number;
  /** taux de la pression au sol et taux du bois */
  etaGround: number;
  etaTimber: number;
  eta: number;
  massKg: number;
  records: CalcRecord[];
  /** répartiteurs transversaux sous les appuis (couche du dessus), quand la charge est plus étroite que les madriers */
  top: { beam: Beam; pieces: number; perSupport: number; length: number; massKg: number; eta: number } | null;
}

type TopPiece = { beam: Beam; perSupport: number; length: number; massKg: number; eta: number };

/**
 * Répartiteurs transversaux d'une section donnée (couche du dessus d'une grille de madriers) : sous un appui de
 * largeur `width`, des madriers posés en travers sur toute la largeur B des madriers du dessous, en nombre suffisant
 * pour couvrir l'appui le long de la rangée (`along`). Au-delà du bord de l'appui, un madrier sur sol élastique ne
 * porte que sur ≈ 1/β (comme une plaque souple, Hetényi) : β = (k · b / 4 E I)^¼ = (3 k / E h³)^¼ ; largeur chargée =
 * width + 2/β, au plus B. Flexion du porte-à-faux : M = P / n · (B − a) / 8 ≤ fm,d · W.
 */
function topFixed(P: number, width: number, along: number, B: number, k: number, beam: Beam | null): { top: TopPiece | null; reach: number } {
  if (width >= B - 1) return { top: null, reach: B };
  if (!beam) return { top: null, reach: width };
  const fmd = (0.9 * C24.fmk) / 1.3;
  const n = Math.max(1, Math.ceil(along / beam.b - 1e-9));
  const beta = Math.pow((3 * k) / (C24.E * beam.h ** 3), 0.25);
  const reach = Math.min(B, width + 2 / beta);
  const M = ((P / n) * (reach - Math.min(width, reach))) / 8;
  const eta = M / ((beam.b * beam.h * beam.h) / 6) / fmd;
  return { top: { beam, perSupport: n, length: B, massKg: (n * beam.b * beam.h * B * C24.rho) / 1e9, eta }, reach };
}

const TOP_BEAMS: Beam[] = [...C24_BEAMS, { b: 200, h: 300 }, { b: 250, h: 300 }];

/** Répartiteurs les mieux adaptés : la plus grande largeur chargée, puis les plus légers. */
function designTop(P: number, width: number, along: number, B: number, k: number): { top: TopPiece | null; reach: number } {
  if (width >= B - 1) return { top: null, reach: B };
  let best: { top: TopPiece; reach: number } | null = null;
  for (const beam of TOP_BEAMS) {
    const t = topFixed(P, width, along, B, k, beam);
    if (!t.top || t.top.eta > 1) continue;
    if (!best || t.reach > best.reach + 1 || (Math.abs(t.reach - best.reach) <= 1 && t.top.massKg < best.top.massKg)) best = { top: t.top, reach: t.reach };
  }
  return best ?? { top: null, reach: width };
}

type RowLoad = { x: number; Pk: number; PEd: number; width: number; along: number };

/**
 * Une grille de madriers C24 donnée sous une rangée : madriers jointifs le long de la rangée (`count` × `beam`),
 * vérifiés en poutre sur sol élastique sans traction (pression maxi + poids propre de la grille, flexion,
 * cisaillement, compression transversale), et répartiteurs transversaux sous chaque appui plus étroit que les
 * madriers (`topBeam` ; undefined = choisis au mieux pour chaque appui, null = aucun). Si les répartiteurs ne chargent
 * pas toute la largeur, la pression est rapportée à la largeur qu'ils chargent. null : répartiteurs automatiques et
 * largeur inutile (au-delà de ce qu'ils peuvent charger).
 */
function evalRow(loads: RowLoad[], length: number, inp: CalageInput, beam: Beam, count: number, topBeam?: Beam | null): RowDesign | null {
  const B = beam.b * count;
  const contact = Math.min(...loads.map((l) => l.along));
  const tops = loads.map((l) => (topBeam === undefined ? designTop(l.PEd, l.width, l.along, B, inp.longrine.k) : topFixed(l.PEd, l.width, l.along, B, inp.longrine.k, topBeam)));
  if (topBeam === undefined && tops.some((t) => t.reach < B - 1)) return null;
  const topList = tops.map((t) => t.top).filter((t): t is TopPiece => !!t);
  const topKg = topList.reduce((a, t) => a + t.massKg, 0);
  const ld = loads.map((l, k) => {
    const t = tops[k].top;
    const w = t ? t.massKg * G : 0;
    return { x: l.x, Pk: l.Pk + w, PEd: l.PEd + 1.35 * w };
  });
  const r = checkLongrine({ loads: ld, length, beam, count, k: inp.longrine.k, bearing: inp.bearing, contact });
  const self = (r.massKg * G) / (B * length);
  // largeur réellement chargée par les répartiteurs (la plus faible de la rangée)
  const loaded = Math.min(B, ...tops.map((t) => t.reach));
  const narrow = loaded < B - 1 ? B / Math.max(loaded, 1) : 1;
  const pressure = r.pMaxK * narrow + self;
  const others = r.records.filter((x) => x.key !== 'longrine.pressure').map((x) => x.eta ?? 0);
  const etaTimber = Math.max(0, ...others, ...topList.map((t) => t.eta));
  const etaGround = pressure / inp.bearing;
  const rec: CalcRecord = {
    key: 'sleepers.pressure',
    title: 'Pression au sol sous les madriers (sol élastique + poids de la grille)',
    clause: 'poutre sur sol élastique sans traction (Winkler), charges caractéristiques ; poids propre réparti',
    formula: narrow > 1 ? 'max p = max (k · w) · B / largeur chargée + G madriers / (B · L) ≤ portance' : 'max p = max (k · w) + G madriers / (B · L) ≤ portance',
    withValues: `k = ${f(inp.longrine.k * 1e3, 0)} MN/m³ ; B = ${count} × ${beam.b} = ${f(B / 10, 0)} cm${narrow > 1 ? ` (chargés sur ${f(loaded / 10, 0)} cm)` : ''} ; L = ${m(length)} ; max p = ${pressureText(r.pMaxK * narrow)} + ${pressureText(self)} = ${pressureText(pressure)} ≤ ${pressureText(inp.bearing)}`,
    result: pressure,
    limit: inp.bearing,
    eta: etaGround,
  };
  const topRec: CalcRecord[] = topList.length
    ? [
        {
          key: 'sleepers.top',
          title: 'Répartiteurs transversaux sous les appuis (rigidité et flexion)',
          clause: 'madriers sur sol élastique (Hetényi) : au-delà de l’appui, ils ne chargent que ≈ 1/β, β = (3 k / E h³)^¼ ; flexion du porte-à-faux M = P (B − a) / 8',
          formula: 'largeur chargée = a + 2/β ≥ B ; σm,d = M / W ≤ fm,d',
          withValues: `${topList[0].perSupport} × C24 ${topList[0].beam.b} × ${topList[0].beam.h} mm, L = ${m(B)} sous chaque appui ; η ≤ ${f(Math.max(...topList.map((t) => t.eta)), 2)}`,
          eta: Math.max(...topList.map((t) => t.eta)),
        },
      ]
    : [];
  const heaviest = topList.length ? topList.reduce((a, t) => (t.massKg > a.massKg ? t : a)) : null;
  return {
    beam,
    count,
    length,
    pressure,
    etaGround,
    etaTimber,
    eta: Math.max(etaGround, etaTimber),
    massKg: r.massKg + topKg,
    records: [rec, ...r.records.filter((x) => x.key !== 'longrine.pressure'), ...topRec],
    top: heaviest && { ...heaviest, pieces: topList.reduce((a, t) => a + t.perSupport, 0), massKg: topKg },
  };
}

/**
 * Grille de madriers C24 sous une rangée d'appuis (largeur au plus `maxWidth`) : la plus légère qui passe ; les
 * répartiteurs sont ensuite unifiés (une seule section par rangée, celle de l'appui le plus exigeant).
 */
function designRow(loads: RowLoad[], length: number, inp: CalageInput, maxWidth: number): RowDesign | null {
  let best: RowDesign | null = null;
  const beams = inp.longrine.beams.length ? inp.longrine.beams : C24_BEAMS;
  const sum = loads.reduce((a, l) => a + l.Pk, 0);
  for (const beam of beams) {
    // nombre minimal de pièces en pression uniforme (charges + poids propre) : évite les calculs inutiles
    const w1 = (beam.b * beam.h * length * C24.rho * G) / 1e9;
    const den = inp.bearing * beam.b * length - w1;
    if (den <= 0) continue;
    const n0 = Math.max(1, Math.ceil(sum / den - 1e-9));
    for (let count = n0; count * beam.b <= maxWidth; count++) {
      // au-delà de la largeur que chargent les répartiteurs, des madriers de plus ne servent à rien
      const cand = evalRow(loads, length, inp, beam, count);
      if (!cand) break;
      if (cand.eta > 1) continue;
      if (!best || cand.massKg < best.massKg - 1e-6 || (Math.abs(cand.massKg - best.massKg) < 1e-6 && cand.eta < best.eta)) best = cand;
      // plus de pièces = plus lourd : le premier nombre qui passe suffit pour cette section
      break;
    }
  }
  if (best?.top) {
    const fixed = evalRow(loads, length, inp, best.beam, best.count, best.top.beam);
    if (fixed && fixed.eta <= 1) return fixed;
  }
  return best;
}

/** Appuis qui reçoivent une grille ou un plateau de madriers (pas les pieds d'escalier ni de terrasse). */
const gridChecks = (res: CalageResult) => res.checks.filter((c) => !c.reaction.group.stair && !c.reaction.group.terrace);

/** Point en plan (monde) depuis les coordonnées le long de u et de v = u tourné de 90°. */
const fromUV = (u: P2, s: number, t: number): P2 => [s * u[0] - t * u[1], s * u[1] + t * u[0]];
const rectUV = (u: P2, s0: number, s1: number, t0: number, t1: number): [P2, P2, P2, P2] => [fromUV(u, s0, t0), fromUV(u, s1, t0), fromUV(u, s1, t1), fromUV(u, s0, t1)];
const rowKey = (ids: string[]) => [...ids].sort().join('|');

/**
 * Madriers sous chaque rangée d'appuis (avec les blocs, ou vérins / pieds posés directement sur les madriers) :
 * recherche (`fixed` absent) ou vérification d'une grille retenue (null si les rangées ont changé).
 */
function sleepers(inp: CalageInput, res: CalageResult, u: P2, withBlocks: boolean, fixed?: SleeperRowDesign[]): RemedyEvaluation | null {
  const checks = gridChecks(res);
  if (checks.length < 2) return null;
  const rows = supportRows(checks, u);
  if (fixed && (fixed.length !== rows.length || rows.some((r) => !fixed.some((x) => rowKey(x.ids) === rowKey(r.items.map((i) => i.c.id)))))) return null;
  const oh = Math.max(inp.longrine.overhang, 100);
  const details: string[] = [];
  const materials: MaterialLine[] = [];
  const records: CalcRecord[] = [];
  const perSupport = new Map<string, RemedySupport>();
  const outlines: RemedyOutline[] = [];
  const design: SleeperRowDesign[] = [];
  let eta = 0;
  let ok = true;
  rows.forEach((row, k) => {
    const half = (c: SupportCheck) => (withBlocks && c.block ? c.block.size[0] / 2 : c.geometry.contact[0] / 2);
    const s0 = Math.min(...row.items.map((i) => i.s - half(i.c))) - oh;
    const s1 = Math.max(...row.items.map((i) => i.s + half(i.c))) + oh;
    const L = s1 - s0;
    // largeur de l'appui en travers de la rangée et sa longueur le long de la rangée
    const across = (c: SupportCheck) => (withBlocks && c.block ? c.block.size[1] : c.geometry.contact[1]);
    const loads = row.items.map((i) => ({ x: i.s - s0, ...supportLoad(i.c, withBlocks), width: across(i.c), along: 2 * half(i.c) }));
    // largeur au plus : jusqu'à 10 cm des rangées voisines (entraxe)
    const gaps = rows.filter((r) => r !== row).map((r) => Math.abs(r.v - row.v));
    const maxWidth = Math.min(gaps.length ? Math.min(...gaps) - 100 : 3000, 3000);
    const ids = row.items.map((i) => i.c.id);
    const fx = fixed?.find((x) => rowKey(x.ids) === rowKey(ids));
    const d = fx ? evalRow(loads, L, inp, fx.beam, fx.count, fx.top) : designRow(loads, L, inp, maxWidth);
    const label = `rangée ${k + 1} (${ids.join(', ')})`;
    if (!d) {
      ok = false;
      const sum = loads.reduce((a, l) => a + l.Pk, 0);
      details.push(`${label} : ${kN(sum)} sur ${m(L)} — aucune largeur de madriers ≤ ${f(maxWidth / 10, 0)} cm ne suffit (il faudrait au moins ${f(sum / (inp.bearing * L) / 10, 0)} cm de large en pression uniforme) : plateau continu sur toute la surface.`);
      return;
    }
    if (d.eta > 1) ok = false;
    eta = Math.max(eta, d.eta);
    design.push({ ids, beam: d.beam, count: d.count, top: d.top?.beam ?? null });
    const lowerKg = d.massKg - (d.top?.massKg ?? 0);
    const B = d.count * d.beam.b;
    details.push(
      `${label} : couche du dessous ${d.count} madriers C24 ${d.beam.b} × ${d.beam.h} mm jointifs le long de la rangée (${f(B / 10, 0)} cm de large), L = ${m(L)}${
        d.top ? ` ; couche du dessus ${d.top.perSupport} madriers ${d.top.beam.b} × ${d.top.beam.h} mm en travers sous chaque appui (L = ${m(d.top.length)})` : ''
      } — pression maxi ${pressureText(d.pressure)} (η ${f(d.eta, 2)}).`,
    );
    materials.push({ label: 'Madrier bois C24', dims: `${d.beam.b} × ${d.beam.h} × ${Math.round(L)} mm`, quantity: d.count, massKg: lowerKg });
    if (d.top)
      materials.push({ label: 'Madrier bois C24 (répartiteur transversal)', dims: `${d.top.beam.b} × ${d.top.beam.h} × ${Math.round(d.top.length)} mm`, quantity: d.top.pieces, massKg: d.top.massKg });
    const rowRecords = d.records.map((r) => ({ ...r, title: `${r.title} — ${label}` }));
    records.push(...rowRecords);
    const stepLabel = `Grille de madriers, ${label.replace(/ \(.*\)$/, '')} : ${d.count} × ${d.beam.b} × ${d.beam.h} mm${d.top ? ` + répartiteurs ${d.top.beam.b} × ${d.top.beam.h}` : ''}`;
    for (const it of row.items)
      perSupport.set(it.c.id, { label: stepLabel, pressure: d.pressure, area: B * L, etaTimber: d.etaTimber, records: rowRecords, note: 'pression maxi sous la rangée (sol élastique, toutes les charges de la rangée + poids de la grille)' });
    outlines.push({ id: `G${k + 1}`, corners: rectUV(u, s0, s1, row.v - B / 2, row.v + B / 2), label: `${d.count} × ${d.beam.b} × ${d.beam.h} mm`, sub: `L = ${m(L)}` });
  });
  const merged = mergeLines(materials);
  const mass = merged.reduce((a, x) => a + x.massKg, 0);
  const blocksKg = res.checks.reduce((a, c) => a + (c.block?.massKg ?? 0), 0);
  const notes = [
    'Grille en 2 couches : madriers jointifs le long de chaque rangée sur le sol réglé, puis sous chaque appui des répartiteurs en travers (vissés aux madriers du dessous) qui chargent toute la largeur ; chaque appui au milieu de la largeur.',
    `Raideur du sol prise à ${f(inp.longrine.k * 1e3, 0)} MN/m³ (étape 2, options avancées) : plus le sol est dur, plus la pression se concentre sous les appuis — à confirmer.`,
    'Pression vérifiée sous charges caractéristiques ; bois en classe de service 2, kmod 0,9 (court terme), γM 1,3.',
  ];
  if (withBlocks) notes.push('Les blocs dessinés restent sur les madriers, centrés sur leur largeur.');
  else notes.push(`Sans les blocs : les vérins (ou les pieds) se posent directement sur les madriers — ${f(blocksKg, 0)} kg de moins au sol, hauteur de l’installation abaissée de la hauteur des blocs (à vérifier avec l’exploitant et les accès).`);
  const complete = design.length === rows.length;
  const key = withBlocks ? 'sleepers' : 'sleepers-no-blocks';
  return {
    remedy: {
      key,
      title: withBlocks ? 'Grille de madriers C24 sous chaque rangée de blocs' : 'Grille de madriers C24 sans les blocs (vérins directement sur les madriers)',
      verdict: ok ? 'ok' : 'fail',
      ...(complete ? { eta } : {}),
      summary: ok
        ? `${rows.length} rangée(s), ${merged.reduce((a, x) => a + x.quantity, 0)} madriers, ${f(mass, 0)} kg de bois : la pression au sol passe partout (η ${f(eta, 2)}).`
        : complete
          ? `${rows.length} rangée(s), ${f(mass, 0)} kg de bois : certaines rangées ne passent pas (η ${f(eta, 2)}).`
          : 'Même avec des madriers jointifs sur toute la largeur disponible, certaines rangées ne passent pas : il faut un plateau continu.',
      details,
      materials: merged,
      records,
      notes,
      ...(complete ? { apply: { key, rows: design } } : {}),
    },
    perSupport,
    outlines,
  };
}

function mergeLines(lines: MaterialLine[]): MaterialLine[] {
  const out: MaterialLine[] = [];
  for (const l of lines) {
    const same = out.find((o) => o.label === l.label && o.dims === l.dims);
    if (same) {
      same.quantity += l.quantity;
      same.massKg += l.massKg;
    } else out.push({ ...l });
  }
  return out;
}

/** Axe des rangées : grand côté de la première Viewbox posée au sol. */
const rowAxis = (inp: CalageInput): P2 => {
  const ground = inp.modules.filter((x) => x.level === 0);
  return ground[0] ? moduleAxes(ground[0]).u : [1, 0];
};

/**
 * Vérifie une solution retenue (`CalageChoices.remedy`) sur le calage `res` calculé sans elle : pression au sol et
 * taux du bois de chaque appui, matériel, contours en plan. null : la solution ne correspond plus aux appuis (rangées
 * changées, plus de rangées) — il faut relancer la recherche.
 */
export function evaluateRemedy(inp: CalageInput, res: CalageResult, applied: AppliedRemedy): RemedyEvaluation | null {
  if (!(inp.bearing > 0)) return null;
  const u = rowAxis(inp);
  if ('rows' in applied) return sleepers(inp, res, u, applied.key === 'sleepers', applied.rows);
  return platformGrid(inp, res, u, applied.key === 'platform', { over: applied.over, lower: applied.lower, upper: applied.upper });
}

/** Pistes chiffrées quand au moins un appui ne passe pas (vide sinon). */
export function calageRemedies(inp: CalageInput, res: CalageResult): CalageRemedy[] {
  const failing = res.checks.filter((c) => c.eta > 1);
  if (!failing.length || !(inp.bearing > 0)) return [];
  if (inp.bearingMode === 'distributed' && res.slab) return slabRemedies(inp, res);
  const out: CalageRemedy[] = [];
  const u = rowAxis(inp);
  const q = inp.bearing;

  // 1. blocs centrés sous les pieds
  const eccentric = res.checks.filter((c) => c.block && c.block.offset > 50);
  if (eccentric.length) {
    const worst = Math.max(...res.checks.map((c) => (c.block && c.block.offset > 50 ? c.block.centred.eta : c.eta)));
    out.push({
      key: 'centre-blocks',
      title: 'Centrer les blocs sous les pieds',
      verdict: worst <= 1 ? 'ok' : 'fail',
      eta: worst,
      summary:
        worst <= 1
          ? `En déplaçant ${eccentric.length} bloc(s) pour que la charge soit au centre, tous les appuis passent (η ${f(worst, 2)}).`
          : `Indispensable mais pas suffisant : blocs centrés, le plus chargé reste à η ${f(worst, 2)}.`,
      details: eccentric.map((c) => `${c.id} (${c.block!.id}) : charge à ${f(c.block!.offset / 10, 0)} cm du centre du bloc → ${pressureText(c.pressure)} ; centré → ${pressureText(c.block!.centred.pressure)} (η ${f(c.block!.centred.eta, 2)}).`),
      materials: [],
      records: [],
      notes: ['Un bloc chargé près de son bord ne porte que sur la zone centrée sous la charge (B’ = B − 2 e) : le bloc doit être centré sous le pied, quitte à dépasser de la Viewbox.'],
      apply: 'centre-blocks',
    });
  }

  // 2. surface d'appui nécessaire par appui
  const need = res.checks.map((c) => {
    const { Pk } = supportLoad(c);
    return { c, A: Pk / q, side: Math.sqrt(Pk / q) };
  });
  let overlap = 0;
  for (let i = 0; i < need.length; i++)
    for (let j = i + 1; j < need.length; j++) {
      const a = need[i];
      const b = need[j];
      const d = Math.max(Math.abs(a.c.at[0] - b.c.at[0]), Math.abs(a.c.at[1] - b.c.at[1]));
      if (a.side / 2 + b.side / 2 > d) overlap++;
    }
  const totalN = res.checks.reduce((a, c) => a + supportLoad(c).Pk, 0);
  const worstNeed = need.reduce((a, b) => (b.A > a.A ? b : a));
  out.push({
    key: 'area',
    title: 'Surface d’appui nécessaire sous chaque appui',
    verdict: 'info',
    summary: `Pour ${pressureText(q)}, chaque appui doit porter sur une surface rigide de Rz / portance : jusqu’à ${f(worstNeed.A / 1e6, 2)} m² (${f(worstNeed.side / 10, 0)} × ${f(worstNeed.side / 10, 0)} cm) sous ${worstNeed.c.id} ; ${f(totalN / q / 1e6, 1)} m² au total.${overlap ? ` ${overlap} paire(s) de surfaces se touchent : des plaques séparées ne suffisent pas, il faut un système continu (madriers ou plateau).` : ''}`,
    details: [...need]
      .sort((a, b) => b.A - a.A)
      .slice(0, 6)
      .map((x) => `${x.c.id} : ${kN(supportLoad(x.c).Pk)} → ${f(x.A / 1e6, 2)} m² (${f(x.side / 10, 0)} × ${f(x.side / 10, 0)} cm)`),
    materials: [],
    records: [],
    notes: ['Surface « rigide » : qui reste plane sous la charge. Une plaque souple (PEHD, contreplaqué mince) ne répartit que près de l’appui.'],
  });

  // 3. madriers continus sous chaque rangée (avec les blocs, puis sans)
  const withBlocks = sleepers(inp, res, u, true);
  if (withBlocks) out.push(withBlocks.remedy);
  if (res.checks.some((c) => c.block)) {
    const without = sleepers(inp, res, u, false);
    if (without) out.push(without.remedy);
  }

  // 4. plateau continu en grille de madriers (2 couches), sans débord puis avec 50 cm de débord ; avec et sans les blocs
  const plat = platformGrid(inp, res, u, true);
  if (plat) out.push(plat.remedy);
  if (res.checks.some((c) => c.block)) {
    const platNo = platformGrid(inp, res, u, false);
    if (platNo) out.push(platNo.remedy);
  }

  // 5. réduire la charge
  const blocksKg = res.checks.reduce((a, c) => a + (c.block?.massKg ?? 0), 0);
  const items: string[] = [];
  if (blocksKg > 0) items.push(`Blocs dessinés : ${f(blocksKg, 0)} kg, soit ${f((blocksKg * G * 100) / totalN, 0)} % de la charge au sol — des cales plus légères (pile de madriers croisés, alvéolée) ou plus basses allègent d’autant.`);
  if (inp.publicLimit) items.push(`Public déjà limité à ${inp.publicLimit.persons} personne(s) pour le sol.`);
  else items.push('Limiter le public sur l’installation (étape 2, « Public pour le sol ») réduit la charge des appuis.');
  items.push('Faire confirmer la portance et sa définition par l’exploitant du site (en surface, ou au niveau d’un ouvrage enterré avec répartition dans les couches).');
  out.push({ key: 'load', title: 'Réduire la charge ou préciser la portance', verdict: 'info', summary: items[0], details: items.slice(1), materials: [], records: [], notes: [] });

  // les pistes vérifiées d'abord, puis les plus légères
  const rank = (r: CalageRemedy) => (r.verdict === 'ok' ? 0 : r.verdict === 'study' ? 1 : r.verdict === 'fail' ? 2 : 3);
  return out.sort((a, b) => rank(a) - rank(b) || a.materials.reduce((s, x) => s + x.massKg, 0) - b.materials.reduce((s, x) => s + x.massKg, 0));
}


/**
 * Plateau continu en grille de madriers C24 sous toute l'installation : couche du dessous = madriers jointifs EN
 * TRAVERS des rangées d'appuis, sur toute la longueur ; couche du dessus = madriers le long de chaque rangée, sous les
 * blocs / pieds (largeur de l'appui). La couche du dessus répartit chaque appui le long de la rangée (au-delà de
 * l'appui, ≈ 1/β, Hetényi) ; chaque madrier du dessous reçoit alors, au droit de chaque rangée, la charge de la rangée
 * sur sa largeur, et il est vérifié en poutre sur sol élastique sans traction (pression maxi + poids des deux couches,
 * flexion, cisaillement). Sans débord, puis 50 cm de débord de chaque côté.
 */
function platformGrid(inp: CalageInput, res: CalageResult, u: P2, withBlocks: boolean, fixed?: { over: number; lower: Beam; upper: Beam }): RemedyEvaluation | null {
  const checks = gridChecks(res);
  const rows = supportRows(checks, u);
  if (rows.length < 2) return null;
  const v: P2 = [-u[1], u[0]];
  const ground = inp.modules.filter((x) => x.level === 0);
  const pts = ground.flatMap((x) => x.corners);
  const us = pts.map((p) => p[0] * u[0] + p[1] * u[1]);
  const vs = pts.map((p) => p[0] * v[0] + p[1] * v[1]);
  const [U0, U1, V0, V1] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  const fmd = (0.9 * C24.fmk) / 1.3;
  type Grid = { over: number; lower: Beam; upper: Beam; nUpper: number; eta: number; etaTimber: number; pressure: number; massKg: number; records: CalcRecord[]; L: number; W: number; reach: number };
  let best: Grid | null = null;
  let leastBad: Grid | null = null;
  for (const over of fixed ? [fixed.over] : [100, 500])
    for (const lower of fixed ? [fixed.lower] : C24_BEAMS)
      for (const upper of fixed ? [fixed.upper] : C24_BEAMS) {
        const L = U1 - U0 + 2 * over;
        const W = V1 - V0 + 2 * over;
        // couche du dessus : sous chaque rangée, de la largeur de ses appuis
        const across = Math.max(...checks.map((c) => (withBlocks && c.block ? c.block.size[1] : c.geometry.contact[1])));
        const nUpper = Math.max(1, Math.ceil(across / upper.b - 1e-9));
        const beta = Math.pow((3 * inp.longrine.k) / (C24.E * upper.h ** 3), 0.25);
        const alongMin = Math.min(...checks.map((c) => (withBlocks && c.block ? c.block.size[0] : c.geometry.contact[0])));
        const reach = alongMin + 2 / beta;
        // charge d'une rangée par mm le long de la rangée : répartie sur la longueur couverte par ses appuis
        const rowLine = rows.map((r) => {
          const P = r.items.reduce((a, i) => a + supportLoad(i.c, withBlocks).Pk, 0);
          const PEd = r.items.reduce((a, i) => a + supportLoad(i.c, withBlocks).PEd, 0);
          const spread = Math.min(L, (r.items[r.items.length - 1].s - r.items[0].s) + reach);
          // pointe sous l'appui le plus chargé : sa charge sur la longueur qu'il atteint seul
          const peak = Math.max(...r.items.map((i) => supportLoad(i.c, withBlocks).Pk)) / Math.min(reach, L);
          return { v: r.v - V0 + over, q: Math.max(P / spread, peak), qEd: Math.max(PEd / spread, (peak * PEd) / Math.max(P, 1)) };
        });
        const upperKgPerMm = (nUpper * upper.b * upper.h * C24.rho) / 1e9;
        // un madrier du dessous (largeur b) : charges des rangées + poids de la couche du dessus
        const loads = rowLine.map((r) => ({ x: r.v, Pk: (r.q + upperKgPerMm * G) * lower.b, PEd: (r.qEd + 1.35 * upperKgPerMm * G) * lower.b }));
        const rr = checkLongrine({ loads, length: W, beam: lower, count: 1, k: inp.longrine.k, bearing: inp.bearing, contact: across });
        const self = C24.rho * G * lower.h * 1e-9;
        const pressure = rr.pMaxK + self;
        // flexion de la couche du dessus entre deux appuis de la rangée (portée = entraxe maxi, charge de l'appui)
        const spans = rows.flatMap((r) => r.items.slice(1).map((it, k) => it.s - r.items[k].s));
        const span = spans.length ? Math.max(...spans) : 0;
        const Pmax = Math.max(...checks.map((c) => supportLoad(c, withBlocks).PEd));
        const Mup = (Pmax * Math.min(span, 2 / beta)) / 8 / nUpper;
        const etaUp = Mup / ((upper.b * upper.h ** 2) / 6) / fmd;
        const others = rr.records.filter((x) => x.key !== 'longrine.pressure').map((x) => x.eta ?? 0);
        const etaTimber = Math.max(etaUp, ...others);
        const eta = Math.max(pressure / inp.bearing, etaTimber);
        const nLower = Math.ceil(L / lower.b - 1e-9);
        const massKg = ((nLower * lower.b * lower.h * W + rows.length * nUpper * upper.b * upper.h * L) * C24.rho) / 1e9;
        const records: CalcRecord[] = [
          {
            key: 'platform.pressure',
            title: 'Pression au sol sous le plateau (madriers du dessous, sol élastique)',
            clause: 'poutre sur sol élastique sans traction (Winkler) ; charge de chaque rangée répartie le long de la rangée par la couche du dessus (≈ 1/β au-delà de l’appui)',
            formula: 'max p = max (k · w) + poids des deux couches ≤ portance',
            withValues: `madrier ${lower.b} × ${lower.h} mm, L = ${m(W)}, k = ${f(inp.longrine.k * 1e3, 0)} MN/m³ ; max p = ${pressureText(rr.pMaxK)} + ${pressureText(self)} = ${pressureText(pressure)} ≤ ${pressureText(inp.bearing)}`,
            result: pressure,
            limit: inp.bearing,
            eta: pressure / inp.bearing,
          },
          ...rr.records.filter((x) => x.key !== 'longrine.pressure'),
          {
            key: 'platform.upper',
            title: 'Flexion de la couche du dessus (le long des rangées)',
            clause: 'charge de l’appui le plus chargé sur la longueur qu’il atteint (entraxe des appuis, au plus 2/β)',
            formula: 'M = P · ℓ / 8 / n ≤ fm,d · W',
            withValues: `${nUpper} × ${upper.b} × ${upper.h} mm ; P = ${kN(Pmax)} ; ℓ = ${m(Math.min(span, 2 / beta))} ; σ = ${f(Mup / ((upper.b * upper.h ** 2) / 6), 2)} ≤ ${f(fmd, 2)} N/mm²`,
            eta: etaUp,
          },
        ];
        const g: Grid = { over, lower, upper, nUpper, eta, etaTimber, pressure, massKg, records, L, W, reach };
        if (eta <= 1 && (!best || g.over < best.over || (g.over === best.over && g.massKg < best.massKg))) best = g;
        if (!leastBad || g.eta < leastBad.eta) leastBad = g;
      }
  const g = best ?? leastBad;
  if (!g) return null;
  const totalN = checks.reduce((a, c) => a + supportLoad(c, withBlocks).Pk, 0);
  const blocksKg = res.checks.reduce((a, c) => a + (c.block?.massKg ?? 0), 0);
  const nLower = Math.ceil(g.L / g.lower.b - 1e-9);
  const ok = !!best;
  const key = withBlocks ? 'platform' : 'platform-no-blocks';
  const perSupport = new Map<string, RemedySupport>();
  const stepLabel = `Plateau de madriers ${m(g.L)} × ${m(g.W)} : ${nLower} × ${g.lower.b} × ${g.lower.h} mm + ${g.nUpper} × ${g.upper.b} × ${g.upper.h} mm sous chaque rangée`;
  for (const c of checks)
    perSupport.set(c.id, { label: stepLabel, pressure: g.pressure, area: g.L * g.W, etaTimber: g.etaTimber, records: g.records, note: 'pression maxi sous le plateau (sol élastique, charge de chaque rangée répartie par la couche du dessus + poids des deux couches)' });
  const s0 = U0 - g.over;
  const t0 = V0 - g.over;
  const outlines: RemedyOutline[] = [
    { id: 'PL', corners: rectUV(u, s0, s0 + g.L, t0, t0 + g.W), label: `${nLower} × ${g.lower.b} × ${g.lower.h} mm`, sub: `${m(g.L)} × ${m(g.W)}` },
    ...rows.map((r, k): RemedyOutline => {
      const half = (g.nUpper * g.upper.b) / 2;
      return { id: `PR${k + 1}`, corners: rectUV(u, s0, s0 + g.L, r.v - half, r.v + half), label: `${g.nUpper} × ${g.upper.b} × ${g.upper.h} mm` };
    }),
  ];
  const remedy: CalageRemedy = {
    key,
    title: withBlocks ? 'Plateau continu en grille de madriers (2 couches)' : 'Plateau continu en grille de madriers, sans les blocs (vérins sur le plateau)',
    verdict: ok ? 'ok' : 'fail',
    eta: g.eta,
    summary: ok
      ? `Plateau ${m(g.L)} × ${m(g.W)}${g.over > 100 ? ` (débord ${f(g.over / 10, 0)} cm de chaque côté)` : ' (sans débord)'} : ${nLower} madriers ${g.lower.b} × ${g.lower.h} en travers + ${g.nUpper} × ${g.upper.b} × ${g.upper.h} sous chaque rangée, ${f(g.massKg, 0)} kg de bois — pression maxi ${pressureText(g.pressure)} (η ${f(g.eta, 2)}).`
      : fixed
        ? `Plateau retenu ${m(g.L)} × ${m(g.W)} : ne passe pas avec les charges actuelles (η ${f(g.eta, 2)}, ${pressureText(g.pressure)}) — relancer la recherche de solutions.`
        : `Même un plateau continu en grille de madriers ne passe pas (meilleur essai : η ${f(g.eta, 2)}, ${pressureText(g.pressure)}) : la charge (${kN(totalN)}) est trop grande pour ${pressureText(inp.bearing)} sur cette emprise — alléger, agrandir l’emprise ou faire préciser la portance.`,
    details: [
      `Couche du dessous : ${nLower} madriers C24 ${g.lower.b} × ${g.lower.h} mm jointifs, longueur ${m(g.W)}, posés en travers des rangées d’appuis sur toute la longueur ${m(g.L)}.`,
      `Couche du dessus : sous chaque rangée, ${g.nUpper} madriers ${g.upper.b} × ${g.upper.h} mm le long de la rangée (longueur ${m(g.L)}), vissés aux madriers du dessous ; chaque appui (bloc ou pied) posé dessus, centré.`,
      `Chaque appui est réparti le long de sa rangée sur ≈ ${m(g.reach)} par la couche du dessus.`,
    ],
    materials: mergeLines([
      { label: 'Madrier bois C24 (plateau, couche du dessous)', dims: `${g.lower.b} × ${g.lower.h} × ${Math.round(g.W)} mm`, quantity: nLower, massKg: (nLower * g.lower.b * g.lower.h * g.W * C24.rho) / 1e9 },
      { label: 'Madrier bois C24 (plateau, couche du dessus)', dims: `${g.upper.b} × ${g.upper.h} × ${Math.round(g.L)} mm`, quantity: g.nUpper * rows.length, massKg: (g.nUpper * rows.length * g.upper.b * g.upper.h * g.L * C24.rho) / 1e9 },
    ]),
    records: g.records,
    notes: [
      'Sol réglé et compacté avant pose ; madriers jointifs (sans vide), les deux couches vissées entre elles pour travailler ensemble.',
      `Raideur du sol ${f(inp.longrine.k * 1e3, 0)} MN/m³ (étape 2, options avancées) : à confirmer — plus le sol est dur, plus la pression se concentre sous les rangées.`,
      'Modèle simplifié (chaque madrier du dessous calculé seul, charge des rangées répartie par la couche du dessus) : à faire valider par un ingénieur pour l’exécution.',
      ...(withBlocks || !blocksKg ? [] : [`Sans les blocs : ${f(blocksKg, 0)} kg de moins ; l’installation est plus basse de la hauteur des blocs moins celle du plateau.`]),
    ],
    apply: { key, over: g.over, lower: g.lower, upper: g.upper },
  };
  return { remedy, perSupport, outlines };
}

/** Masse volumique C24 (kg/m³), pour l'affichage. */
export const SLEEPER_RHO = C24.rho;

/**
 * Dalle en charge répartie : ce qui fait baisser la charge au m² des zones trop chargées. Les plaques sous les pieds
 * n'y changent presque rien (seule la surface de dalle chargée compte) : alléger ou agrandir la surface chargée.
 */
function slabRemedies(inp: CalageInput, res: CalageResult): CalageRemedy[] {
  const slab = res.slab!;
  const over = slab.zones.filter((z) => z.eta > 1).sort((a, b) => b.eta - a.eta);
  const kg = (q: number) => `${f((q * 1e6) / G, 0)} kg/m²`;
  const blocksKg = res.checks.reduce((a, c) => a + (c.block?.massKg ?? 0), 0);
  const details = over.slice(0, 8).map((z) => `${z.id} : ${f(z.load / 1e3, 1)} kN sur ${f(z.area / 1e6, 2)} m² → ${kg(z.q)} ; pour ${kg(inp.bearing)} il faudrait ${f(z.load / inp.bearing / 1e6, 2)} m² de dalle ou ${f(Math.max(0, z.load - inp.bearing * z.area) / G, 0)} kg de moins.`);
  const levers = [
    slab.global.eta > 1
      ? `L’ensemble de l’installation dépasse déjà (${kg(slab.global.q)} > ${kg(inp.bearing)}) : il faut alléger ou couvrir une plus grande surface de dalle (plateau qui dépasse de l’installation).`
      : `L’ensemble de l’installation passe (${kg(slab.global.q)}) : il faut mieux répartir les pieds les plus chargés sur la dalle — plateau de madriers ou plaques de roulage rigides qui relient les zones (et dépassent de l’installation au droit des angles).`,
    'Installation à l’intérieur ou abritée : vent à 0 à l’étape 2 — les pieds d’angle (pire cas = vent) se déchargent nettement.',
    ...(blocksKg > 0 ? [`Blocs dessinés : ${f(blocksKg, 0)} kg posés sur la dalle — des cales plus légères allègent d’autant.`] : []),
    inp.publicLimit ? `Public déjà limité à ${inp.publicLimit.persons} personne(s).` : 'Limiter le public (étape 2, « Public pour le sol »).',
    'Demander à l’exploitant la charge ponctuelle admissible et la portée de la dalle : avec elles, un calcul de la dalle (moments) remplace ce contrôle zone par zone.',
  ];
  return [
    {
      key: 'load',
      title: 'Dalle : faire baisser la charge au m² des zones trop chargées',
      verdict: 'info',
      summary: `${over.length} zone(s) de dalle au-dessus de ${kg(inp.bearing)} ; la plus chargée : ${over[0]?.id ?? '—'} ${over[0] ? kg(over[0].q) : ''}.`,
      details: [...details, ...levers],
      materials: [],
      records: [],
      notes: ['Contrôle « charge répartie » : poids de chaque Viewbox sur la dalle (tous ses pieds dans la combinaison la plus lourde + calage) / surface de dalle chargée. Des plaques plus grandes sous un pied ou des appuis en plus sous une Viewbox ne changent presque rien : c’est la surface de dalle chargée qui compte.'],
    },
  ];
}
