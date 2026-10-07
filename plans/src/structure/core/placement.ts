// Plaques de calage en plan : appuis voisins posés sur une même plaque (les vérins de 4 Viewbox qui se touchent = une
// grande plaque, de 2 Viewbox = une plaque plus petite), surface de contact de chaque plaque, position de la plaque —
// à fleur de la Viewbox (elle ne dépasse pas de l'installation, comme posée sur chantier) ou centrée sous l'appui
// (méthode statico, plan TÜV 18-0573-03 : elle dépasse) — et emprise efficace d'une plaque posée excentrée : la
// charge n'est pas au centre de la plaque, le sol ne peut être chargé uniformément que sur une emprise centrée sur la
// charge, B' = B − 2 e (Meyerhof, EN 1997-1 annexe D) ; sous un angle extérieur, une plaque à fleur ne répartit donc
// que sur deux fois la distance de la charge au bord, quelle que soit sa taille. Fonctions pures ; mm, N.
import type { ComboReaction, EstimateModule, GroupReaction, P2 } from './estimate';

/** Platine de vérin et réception de pied central (mm, supposée 15 × 15 cm). */
export const JACK_PLATE = 150;
/** Surface de contact d'un angle de Viewbox posé directement sur le calage (statico 24-0571 § 3.12 : 21 × 21 cm). */
export const CORNER_CONTACT = 210;

export type PlatePlacement = 'auto' | 'flush' | 'centered';

/** Côté d'un axe : Viewbox des deux côtés de l'appui (plaque centrée) ou d'un seul, avec la coordonnée du bord extérieur. */
export interface AxisSide {
  side: 'both' | 'plus' | 'minus';
  edge: number;
}

/** Géométrie d'un appui de calage en plan (repère de la première Viewbox posée au sol de l'appui). */
export interface SupportGeometry {
  /** axes unitaires : u = grand côté, v = petit côté */
  u: P2;
  v: P2;
  /** centre de la surface de contact (coordonnées le long de u, v) et dimensions de cette surface (mm) */
  center: [number, number];
  contact: [number, number];
  sides: [AxisSide, AxisSide];
}

/** Plaque (couche du dessous) posée sous un appui. */
export interface PlatePlan {
  placement: 'flush' | 'centered';
  /** contour en plan (mm) */
  corners: [P2, P2, P2, P2];
  /** emprise efficace maximale le long de u, v (Infinity = pas de limite) */
  caps: [number, number];
  /** distance de la charge au bord extérieur le long de u, v (plaque à fleur ; Infinity = Viewbox des deux côtés) */
  edgeDist: [number, number];
  /** dépassement hors de l'installation (mm, plaque centrée) */
  overhang: number;
}

const dot = (p: P2, a: P2) => p[0] * a[0] + p[1] * a[1];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const unit = (a: P2): P2 => {
  const d = len(a) || 1;
  return [a[0] / d, a[1] / d];
};

/** Axes d'une Viewbox en plan : u le long du grand côté, v perpendiculaire. */
export function moduleAxes(m: EstimateModule): { u: P2; v: P2 } {
  const c = m.corners;
  const a = sub(c[1], c[0]);
  const b = sub(c[2], c[1]);
  const u = unit(len(a) >= len(b) ? a : b);
  return { u, v: [-u[1], u[0]] };
}

/** Points de référence d'un appui sur sa Viewbox : son angle, ou le milieu de son côté (pied central). */
function anchorOf(r: GroupReaction, m: EstimateModule): P2 {
  const c = m.corners;
  const pts = r.group.middle ? c.map((p, k): P2 => [(p[0] + c[(k + 1) % c.length][0]) / 2, (p[1] + c[(k + 1) % c.length][1]) / 2]) : c;
  let best = pts[0];
  for (const p of pts) if (len(sub(p, r.group.position)) < len(sub(best, r.group.position))) best = p;
  return best;
}

/** Réactions de plusieurs appuis posés sur une même plaque : additionnées combinaison par combinaison. */
export function sumReactions(rs: GroupReaction[]): Omit<GroupReaction, 'group'> {
  const sum = (f: (r: GroupReaction) => number) => rs.reduce((a, r) => a + f(r), 0);
  const all = rs.every((r) => r.combos?.length);
  if (!all) {
    return { Rk: sum((r) => r.Rk), RkMin: sum((r) => r.RkMin), REd: sum((r) => r.REd), REdMin: sum((r) => r.REdMin), combo: rs[0].combo, comboK: rs[0].comboK, G: sum((r) => r.G), Q: sum((r) => r.Q) };
  }
  const by = new Map<string, ComboReaction>();
  for (const r of rs)
    for (const c of r.combos!) {
      // même nom de combinaison en ELU et en ELS (estimation) : clé = classe + nom
      const k = `${c.cls}|${c.combo}`;
      const acc = by.get(k);
      if (acc) {
        acc.R += c.R;
        acc.Q += c.Q;
      } else by.set(k, { ...c });
    }
  const combos = [...by.values()];
  const max = (cls: ComboReaction['cls'][]): [number, string] => {
    let [v, n] = [-Infinity, ''];
    for (const c of combos) if (cls.includes(c.cls) && c.R > v) [v, n] = [c.R, c.combo];
    return [v, n];
  };
  const min = (cls: ComboReaction['cls'][]) => Math.min(...combos.filter((c) => cls.includes(c.cls)).map((c) => c.R));
  const [REd, combo] = max(['ULS']);
  const hasSls = combos.some((c) => c.cls === 'SLS');
  const [Rk, comboK] = hasSls ? max(['SLS']) : [REd / 1.35, `${combo} / 1,35`];
  return {
    Rk,
    RkMin: hasSls ? min(['SLS']) : min(['ULS', 'STAB']) / 1.35,
    REd,
    REdMin: min(['ULS', 'STAB']),
    combo,
    comboK,
    G: sum((r) => r.G),
    Q: sum((r) => r.Q),
    combos,
  };
}

export interface PlateGroup {
  reaction: GroupReaction;
  /** appuis (points du plan des appuis) posés sur cette plaque */
  members: GroupReaction[];
}

/**
 * Appuis de calage : les vérins des Viewbox qui se touchent au même angle (ou au milieu du même côté) sont posés sur
 * une seule plaque — 4 vérins = une grande plaque, 2 = une plus petite ; leurs réactions sont additionnées par
 * combinaison. Sans vérins, les angles voisins forment déjà un seul groupe d'appuis (une plaque).
 */
export function plateGroups(reactions: GroupReaction[], modules: EstimateModule[], tolerance: number): PlateGroup[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const jacks = reactions.filter((r) => r.group.jack);
  const out: PlateGroup[] = reactions.filter((r) => !r.group.jack).map((r) => ({ reaction: r, members: [r] }));
  if (!jacks.length) return out;
  const anchors = jacks.map((r) => {
    const m = byId.get(r.group.moduleIds[0]);
    return m ? anchorOf(r, m) : r.group.position;
  });
  const parent = jacks.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < jacks.length; i++)
    for (let j = i + 1; j < jacks.length; j++)
      if (jacks[i].group.middle === jacks[j].group.middle && len(sub(anchors[i], anchors[j])) <= tolerance) parent[find(i)] = find(j);
  const clusters = new Map<number, number[]>();
  jacks.forEach((_, i) => {
    const k = find(i);
    if (!clusters.has(k)) clusters.set(k, []);
    clusters.get(k)!.push(i);
  });
  const merged = [...clusters.values()].map((idx) => {
    const members = idx.map((i) => jacks[i]);
    const pos: P2 = [members.reduce((a, r) => a + r.group.position[0], 0) / members.length, members.reduce((a, r) => a + r.group.position[1], 0) / members.length];
    const middle = members[0].group.middle;
    const reaction: GroupReaction = {
      ...members[0],
      ...sumReactions(members),
      group: { id: '', position: pos, corners: middle ? 0 : members.length, middle, jack: true, moduleIds: [...new Set(members.flatMap((r) => r.group.moduleIds))] },
    };
    return { reaction, members };
  });
  merged.sort((a, b) => Math.round(a.reaction.group.position[1] / 500) - Math.round(b.reaction.group.position[1] / 500) || a.reaction.group.position[0] - b.reaction.group.position[0]);
  merged.forEach((g, k) => (g.reaction.group.id = `C${k + 1}`));
  return [...out, ...merged];
}

/** Côté de l'installation le long d'un axe, vu depuis le point p : Viewbox des deux côtés, ou bord extérieur. */
function axisSide(p: P2, axis: P2, mods: EstimateModule[]): AxisSide {
  const pc = dot(p, axis);
  const plus: number[] = [];
  const minus: number[] = [];
  let both = false;
  for (const m of mods) {
    const proj = m.corners.map((c) => dot(c, axis));
    const mn = Math.min(...proj);
    const mx = Math.max(...proj);
    if (mn < pc - 400 && mx > pc + 400) both = true;
    else if (mx - pc > pc - mn) plus.push(mn);
    else minus.push(mx);
  }
  if (both || (plus.length && minus.length) || (!plus.length && !minus.length)) return { side: 'both', edge: pc };
  return plus.length ? { side: 'plus', edge: Math.min(...plus) } : { side: 'minus', edge: Math.max(...minus) };
}

/**
 * Surface de contact et côtés d'un appui de calage. Vérins : rectangle englobant les platines 15 × 15 cm. Angles posés
 * directement : 21 cm par Viewbox le long de chaque axe (1 angle 21 × 21, 2 angles 42 × 21, 4 angles 42 × 42 ; 3 angles
 * pris comme 42 × 21, côté de la sécurité), pieds centraux 15 × 15 cm, au bord de la Viewbox.
 */
export function supportGeometry(g: PlateGroup, modules: EstimateModule[]): SupportGeometry {
  const r = g.reaction;
  const ids = new Set(r.group.moduleIds);
  const own = modules.filter((m) => ids.has(m.id));
  const ground = own.filter((m) => m.level === Math.min(...own.map((q) => q.level)));
  const mods = ground.length ? ground : modules.filter((m) => m.level === 0);
  const first = mods[0];
  const { u, v } = first ? moduleAxes(first) : { u: [1, 0] as P2, v: [0, 1] as P2 };
  if (r.group.jack) {
    const us = g.members.map((m) => dot(m.group.position, u));
    const vs = g.members.map((m) => dot(m.group.position, v));
    const h = JACK_PLATE / 2;
    const box = [Math.min(...us) - h, Math.max(...us) + h, Math.min(...vs) - h, Math.max(...vs) + h];
    const center: [number, number] = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
    const c: P2 = [u[0] * center[0] + v[0] * center[1], u[1] * center[0] + v[1] * center[1]];
    return { u, v, center, contact: [box[1] - box[0], box[3] - box[2]], sides: [axisSide(c, u, mods), axisSide(c, v, mods)] };
  }
  const p = r.group.position;
  // pied d'escalier : platine 15 × 15 cm hors des Viewbox, plaque centrée
  if (r.group.stair || r.group.terrace) return { u, v, center: [dot(p, u), dot(p, v)], contact: [JACK_PLATE, JACK_PLATE], sides: [{ side: 'both', edge: dot(p, u) }, { side: 'both', edge: dot(p, v) }] };
  const sides: [AxisSide, AxisSide] = [axisSide(p, u, mods), axisSide(p, v, mods)];
  // surface de contact d'un angle : celle du type du module (S12), sinon 21 × 21 cm (Viewbox) ; la plus petite des modules
  const own2 = mods.map((m) => m.contact).filter((c): c is { a1: number; a2: number } => !!c);
  const [bu, bv] = r.group.middle ? [JACK_PLATE, JACK_PLATE] : own2.length ? [Math.min(...own2.map((c) => c.a1)), Math.min(...own2.map((c) => c.a2))] : [CORNER_CONTACT, CORNER_CONTACT];
  let contact: [number, number] = r.group.middle ? [bu, bv] : [sides[0].side === 'both' ? 2 * bu : bu, sides[1].side === 'both' ? 2 * bv : bv];
  // 3 angles : surface prise comme pour 2 angles (côté de la sécurité)
  if (!r.group.middle && Math.min(4, r.group.corners) === 3) contact = [2 * bu, bv];
  const at = (k: 0 | 1) => {
    const s = sides[k];
    const pc = dot(p, k ? v : u);
    if (s.side === 'both') return pc;
    return s.side === 'plus' ? Math.max(pc, s.edge + contact[k] / 2) : Math.min(pc, s.edge - contact[k] / 2);
  };
  return { u, v, center: [at(0), at(1)], contact, sides };
}

/** Emprise efficace maximale d'une plaque à fleur : 2 × distance de la charge au bord (B' = B − 2 e). */
export function flushCaps(geo: SupportGeometry): { caps: [number, number]; edgeDist: [number, number] } {
  const d = geo.sides.map((s, k) => (s.side === 'both' ? Infinity : Math.abs(geo.center[k] - s.edge))) as [number, number];
  return { caps: [2 * d[0], 2 * d[1]], edgeDist: d };
}

/** Contour d'une plaque l × w (l le long de u) sous un appui, à fleur de la Viewbox ou centrée sur la charge. */
export function platePlan(geo: SupportGeometry, l: number, w: number, placement: 'flush' | 'centered'): PlatePlan {
  const dims = [l, w];
  const span = geo.sides.map((s, k): [number, number] => {
    const c = geo.center[k];
    const size = dims[k];
    if (placement === 'centered' || s.side === 'both') return [c - size / 2, c + size / 2];
    // à fleur : la plaque part du bord extérieur ; elle couvre toujours la surface de contact
    const reach = Math.max(size, Math.abs(c - s.edge) + geo.contact[k] / 2);
    return s.side === 'plus' ? [s.edge, s.edge + reach] : [s.edge - reach, s.edge];
  });
  const P = (a: number, b: number): P2 => [geo.u[0] * a + geo.v[0] * b, geo.u[1] * a + geo.v[1] * b];
  const [[u0, u1], [v0, v1]] = span;
  const { caps, edgeDist } = flushCaps(geo);
  let overhang = 0;
  geo.sides.forEach((s, k) => {
    if (s.side === 'plus') overhang = Math.max(overhang, s.edge - span[k][0]);
    if (s.side === 'minus') overhang = Math.max(overhang, span[k][1] - s.edge);
  });
  return {
    placement,
    corners: [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)],
    caps: placement === 'flush' ? caps : [Infinity, Infinity],
    edgeDist,
    overhang: Math.max(0, overhang),
  };
}
