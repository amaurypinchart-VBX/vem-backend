// Contact des Viewbox avec le sol (A. Pinchart 05.11.2026 : « on calcule toujours au point des vérins ; j'aimerais
// aussi poser la box directement au sol — toute l'UPN du plancher touche le sol —, ou la poser sur des plaques en bois
// de 1 × 1 m aux angles et au milieu — l'UPN repose sur 2 × 1 m de plaque —, ou ajouter des blocs au milieu de la
// structure, sous les profils du plancher et pas sous l'UPN »).
//
// Démarche d'ingénieur : la répartition des réactions dépend de la raideur relative de la structure et de ses appuis.
// Au lieu de 4 à 6 appuis ponctuels, la rive (ou le profil) qui porte est découpée en appuis élastiques rapprochés
// (« ressorts de Winkler », compression seule) : posée au sol, chaque tronçon de semelle d'UNP vaut k_s · b · longueur ;
// sur une plaque ou un bloc, la plaque est un ressort k_s · A_plaque (sol sous la plaque) en série avec le bois
// comprimé, réparti sur les tronçons de rive qui portent dessus. Le calcul 3D trouve alors lui-même la part de chaque
// tronçon : plus il y a de points d'appui, plus la charge se répartit ; sans vérins, l'UNP porte directement (plus
// d'excentrement de 155 mm de la réception de pied).
//
// Ce qui porte sur une plaque : les profils les plus bas qui la traversent. Une rive (UNP 220) est plus basse que les
// traverses et les lisses (RHP 120 × 60) : une plaque sous une rive ne porte que la rive ; une plaque sous le milieu
// de la Viewbox (aucune rive) porte les traverses / lisses qui la traversent (cales à leur niveau).
//
// Fonctions pures ; mm, N, N/mm, N/mm³ ; plan = monde (x, z).
import type { DrawnBlock } from './blocks';
import { blockMaterial, unionArea } from './blocks';

export { unionArea };
import type { EstimateModule, P2 } from './estimate';
import type { PlacedModule } from './assemble';
import type { TemplateMember, ViewboxTemplate } from './templates/viewboxEU';
import { nodeKey } from './templates/viewboxEU';
import { fmtNumber } from './units';

export type GroundContactMode = 'points' | 'rims' | 'pads';

/** Disposition de plaques générée par l'outil (sans blocs dessinés dans le modèle). */
export interface PadLayout {
  /** côté des plaques (mm, carrées) et épaisseur (mm) */
  size: number;
  thickness: number;
  /** matériau (clé du catalogue : C24, CP-F40/30…) */
  material: string;
  /** une plaque à chaque angle (à fleur de la Viewbox ; un angle commun à plusieurs Viewbox = une plaque centrée) */
  corners: boolean;
  /** une plaque au milieu de chaque grand côté (à fleur) */
  middles: boolean;
  /** plaques au centre de chaque Viewbox, sous les profils du plancher (traverses / lisses), réparties sur la longueur */
  centre: number;
  /**
   * pose des plaques d'angle et de milieu : à fleur de l'installation (ne dépassent pas, la rive est au bord de la
   * plaque) ou centrées sous la rive (elles dépassent de la moitié : la charge est au centre de la plaque)
   */
  placement?: 'flush' | 'centered';
}

export interface GroundContactOptions {
  /** 'points' = appuis ponctuels (vérins ou angles, calcul habituel) */
  mode: GroundContactMode;
  /** plaques : blocs dessinés dans le modèle, ou disposition générée */
  pads?: 'model' | 'layout';
  layout?: PadLayout;
  /** raideur du sol (clé de `SUBGRADE_PRESETS`) ; absent = celle des hypothèses (étape 2) */
  subgrade?: string;
}

export const PAD_LAYOUT_DEFAULT: PadLayout = { size: 1000, thickness: 40, material: 'C24', corners: true, middles: true, centre: 0 };

/** Module de compression transversale du bois (N/mm²) : C24 E90,mean = 370 (EN 338) ; contreplaqué pris pareil. */
export const E_PERP_TIMBER = 370;
/** Espacement maxi des appuis élastiques le long d'un profil qui porte (mm). */
export const STATION_SPACING = 250;
/** Longueur des tronçons de rive vérifiés séparément au sol (posée au sol, mm). */
export const RIM_SEGMENT = 1000;

/** Ligne de profil du plancher dans le repère du module (u le long du grand côté, v le petit côté, origine au coin extérieur). */
export interface FloorLine {
  kind: 'rim' | 'secondary';
  /** la ligne court le long de u (v = at) ou le long de v (u = at) */
  axis: 'u' | 'v';
  at: number;
  /** étendue de la ligne de système (mm) */
  from: number;
  to: number;
  /** largeur d'appui du profil (semelle, mm) */
  width: number;
  /** rive : côté extérieur (−1 = vers 0, +1 = vers la taille du module) */
  outer?: -1 | 1;
  label: string;
}

/** Plancher d'un module posé au sol, en plan. */
export interface ModuleFloor {
  id: string;
  /** coin extérieur (0, 0) en plan et axes unitaires en plan */
  origin: P2;
  u: P2;
  v: P2;
  /** dimensions extérieures (mm) */
  size: [number, number];
  lines: FloorLine[];
}

export interface ContactStation {
  /** position du nœud (repère du module, sur la ligne de système) */
  u: number;
  v: number;
  /** longueur d'influence (mm) et surface de contact (mm²) */
  trib: number;
  area: number;
  /** raideurs verticale et horizontale de l'appui (N/mm) */
  kv: number;
  kh: number;
}

/** Tronçon de profil qui porte (une rive ou un profil sur une plaque, ou un tronçon de rive posée au sol). */
export interface ContactStrip {
  id: string;
  module: string;
  kind: 'rim' | 'secondary';
  label: string;
  /** plaque ou bloc sous ce tronçon */
  pad?: string;
  /** surface de contact en plan (repère du module) [u0, u1, v0, v1] */
  rect: [number, number, number, number];
  /** centre (monde), direction le long du tronçon (monde), longueur et largeur de contact (mm) */
  center: P2;
  along: P2;
  length: number;
  width: number;
  /** tronçon contre un angle de la Viewbox (il reprend le poteau d'angle) */
  corner: boolean;
  /** tronçon au milieu d'un grand côté (sous la réception centrale) */
  middle: boolean;
  stations: ContactStation[];
}

export interface ContactPlan {
  mode: 'rims' | 'pads';
  strips: ContactStrip[];
  pads: DrawnBlock[];
  /** raideur du sol utilisée (N/mm³) */
  k: number;
  warnings: string[];
}

const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const unit = (a: P2): P2 => {
  const d = len(a) || 1;
  return [a[0] / d, a[1] / d];
};
const cm = (mm: number) => fmtNumber(mm / 10, Math.abs(mm % 10) > 0.5 ? 1 : 0);

/** Point du repère du module → monde (plan). */
export function toWorld(f: ModuleFloor, u: number, v: number): P2 {
  return [f.origin[0] + f.u[0] * u + f.v[0] * v, f.origin[1] + f.u[1] * u + f.v[1] * v];
}

/** Point du monde (plan) → repère du module. */
export function toLocal(f: ModuleFloor, p: P2): [number, number] {
  const d = sub(p, f.origin);
  return [dot(d, f.u), dot(d, f.v)];
}

/**
 * Lignes de profils du plancher d'un gabarit : rives (famille rive plancher) et traverses / lisses (profils
 * secondaires du plancher), avec la largeur de leur semelle (`width(section)`, défaut 80 / 60 mm).
 */
export function floorLinesOfTemplate(tpl: ViewboxTemplate, width: (section: string) => number | undefined): FloorLine[] {
  const p = tpl.params;
  const nodes = new Map(tpl.nodes.map((n) => [n.key, n]));
  const byLine = new Map<string, TemplateMember[]>();
  for (const m of tpl.members) {
    if (m.family !== 'rim-floor' && m.family !== 'secondary-floor') continue;
    const a = nodes.get(m.i)!;
    const b = nodes.get(m.j)!;
    if (Math.abs(a.z - p.floorZ) > 1 || Math.abs(b.z - p.floorZ) > 1) continue;
    if (!byLine.has(m.line)) byLine.set(m.line, []);
    byLine.get(m.line)!.push(m);
  }
  const midU = (p.x0 + p.x1) / 2;
  const midV = (p.y0 + p.y1) / 2;
  const out: FloorLine[] = [];
  for (const ms of byLine.values()) {
    const pts = ms.flatMap((m) => [nodes.get(m.i)!, nodes.get(m.j)!]);
    const us = pts.map((n) => n.u);
    const vs = pts.map((n) => n.v);
    const alongU = Math.max(...vs) - Math.min(...vs) < 1;
    const alongV = Math.max(...us) - Math.min(...us) < 1;
    if (!alongU && !alongV) continue;
    const rim = ms[0].family === 'rim-floor';
    const at = alongU ? vs[0] : us[0];
    const w = width(ms[0].section) ?? (rim ? 80 : 60);
    const outer: -1 | 1 | undefined = rim ? (alongU ? (at < midV ? -1 : 1) : at < midU ? -1 : 1) : undefined;
    out.push({
      kind: rim ? 'rim' : 'secondary',
      axis: alongU ? 'u' : 'v',
      at,
      from: alongU ? Math.min(...us) : Math.min(...vs),
      to: alongU ? Math.max(...us) : Math.max(...vs),
      width: w,
      ...(outer ? { outer } : {}),
      label: rim ? (alongU ? 'rive (UNP) du grand côté' : 'rive (UNP) du petit côté') : alongU ? 'lisse du plancher' : 'traverse du plancher',
    });
  }
  return out;
}

/** Plancher d'un module de l'estimation (sans gabarit) : rives à 5 mm du bord, traverses et lisses de la Viewbox 5900 à l'échelle. */
export function floorOfEstimate(m: EstimateModule): ModuleFloor {
  const c = m.corners;
  const a = sub(c[1], c[0]);
  const b = sub(c[3], c[0]);
  const longFirst = len(a) >= len(b);
  // repère : u le long du grand côté depuis l'angle 0 ; v vers l'intérieur
  const u = unit(longFirst ? a : b);
  let v = unit(longFirst ? b : a);
  const L = longFirst ? len(a) : len(b);
  const W = longFirst ? len(b) : len(a);
  // v doit pointer vers l'intérieur (il l'est par construction), u × v quelconque
  v = dot(v, v) ? v : [-u[1], u[0]];
  const e = 5;
  const lines: FloorLine[] = [
    { kind: 'rim', axis: 'u', at: e, from: e, to: L - e, width: 80, outer: -1, label: 'rive (UNP) du grand côté' },
    { kind: 'rim', axis: 'u', at: W - e, from: e, to: L - e, width: 80, outer: 1, label: 'rive (UNP) du grand côté' },
    { kind: 'rim', axis: 'v', at: e, from: e, to: W - e, width: 80, outer: -1, label: 'rive (UNP) du petit côté' },
    { kind: 'rim', axis: 'v', at: L - e, from: e, to: W - e, width: 80, outer: 1, label: 'rive (UNP) du petit côté' },
    // Viewbox 5900 : traverses à 1 144 / 2 344 / 3 544 / 4 745 mm, lisses à 835 / 1 665 mm (gabarit statico)
    ...[1144, 2344, 3544, 4745].map((x): FloorLine => ({ kind: 'secondary', axis: 'v', at: (x / 5900) * L, from: e, to: W - e, width: 60, label: 'traverse du plancher' })),
    ...[835, 1665].map((y): FloorLine => ({ kind: 'secondary', axis: 'u', at: (y / 2500) * W, from: e, to: L - e, width: 60, label: 'lisse du plancher' })),
  ];
  return { id: m.id, origin: c[0], u, v, size: [L, W], lines };
}

/** Rectangle d'un bloc (monde x0…z1) dans le repère d'un module [u0, u1, v0, v1]. */
function rectIn(f: ModuleFloor, b: Pick<DrawnBlock, 'x0' | 'x1' | 'z0' | 'z1'>): [number, number, number, number] {
  const pts: P2[] = [
    [b.x0, b.z0],
    [b.x1, b.z0],
    [b.x1, b.z1],
    [b.x0, b.z1],
  ];
  const l = pts.map((p) => toLocal(f, p));
  return [Math.min(...l.map((q) => q[0])), Math.max(...l.map((q) => q[0])), Math.min(...l.map((q) => q[1])), Math.max(...l.map((q) => q[1]))];
}

/** Surface de contact d'une ligne (repère du module) : semelle de la rive côté extérieur, profil centré sur sa ligne. */
function lineRect(f: ModuleFloor, ln: FloorLine): [number, number, number, number] {
  const size = ln.axis === 'u' ? f.size[1] : f.size[0];
  const across: [number, number] =
    ln.kind === 'rim' && ln.outer ? (ln.outer < 0 ? [0, ln.width] : [size - ln.width, size]) : [ln.at - ln.width / 2, ln.at + ln.width / 2];
  // rive : contact sur toute la longueur extérieure ; profil secondaire : entre les rives
  const full = ln.axis === 'u' ? f.size[0] : f.size[1];
  const along: [number, number] = ln.kind === 'rim' ? [0, full] : [ln.from, ln.to];
  return ln.axis === 'u' ? [along[0], along[1], across[0], across[1]] : [across[0], across[1], along[0], along[1]];
}

/** Stations (nœuds d'appui) le long d'un tronçon [s0, s1] d'une ligne, espacement ≤ `spacing`, au moins 3 par tronçon. */
function stationsAlong(s0: number, s1: number, spacing: number): Array<{ s: number; trib: number }> {
  const L = s1 - s0;
  if (L <= 1) return [{ s: Math.round((s0 + s1) / 2), trib: Math.max(L, 1) }];
  const n = Math.max(2, Math.ceil(L / spacing));
  const pts = Array.from({ length: n + 1 }, (_, k) => Math.round(s0 + (L * k) / n));
  return pts.map((s, k) => ({ s, trib: ((k < n ? pts[k + 1] - s : 0) + (k > 0 ? s - pts[k - 1] : 0)) / 2 }));
}

/**
 * Disposition de plaques générée : une plaque par angle et/ou au milieu des grands côtés des Viewbox posées au sol,
 * à fleur de l'installation ; les points qui se touchent (angles de Viewbox voisines à moins de `tol`) partagent une
 * plaque centrée sur eux le long de l'axe où il y a des Viewbox des deux côtés ; plaques au centre sous les profils.
 */
export function layoutPads(floors: ModuleFloor[], layout: PadLayout, groundY = 0, tol = 150): DrawnBlock[] {
  if (!floors.length) return [];
  const s = layout.size;
  interface Anchor {
    p: P2;
    kind: 'corner' | 'middle' | 'centre';
  }
  const anchors: Anchor[] = [];
  for (const f of floors) {
    const [L, W] = f.size;
    if (layout.corners) for (const [a, b] of [[0, 0], [L, 0], [L, W], [0, W]] as const) anchors.push({ p: toWorld(f, a, b), kind: 'corner' });
    if (layout.middles) for (const b of [0, W]) anchors.push({ p: toWorld(f, L / 2, b), kind: 'middle' });
    for (let k = 1; k <= layout.centre; k++) anchors.push({ p: toWorld(f, (L * k) / (layout.centre + 1), W / 2), kind: 'centre' });
  }
  // regroupement des points voisins de même nature
  const parent = anchors.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < anchors.length; i++)
    for (let j = i + 1; j < anchors.length; j++) if (anchors[i].kind === anchors[j].kind && len(sub(anchors[i].p, anchors[j].p)) <= tol) parent[find(i)] = find(j);
  const clusters = new Map<number, Anchor[]>();
  anchors.forEach((a, i) => {
    const r = find(i);
    if (!clusters.has(r)) clusters.set(r, []);
    clusters.get(r)!.push(a);
  });
  const f0 = floors[0];
  // étendue des Viewbox le long des axes du premier module (pose à fleur)
  const ext = floors.map((f) => {
    const c = [toWorld(f, 0, 0), toWorld(f, f.size[0], 0), toWorld(f, f.size[0], f.size[1]), toWorld(f, 0, f.size[1])].map((p) => toLocal(f0, p));
    return [Math.min(...c.map((q) => q[0])), Math.max(...c.map((q) => q[0])), Math.min(...c.map((q) => q[1])), Math.max(...c.map((q) => q[1]))];
  });
  const mat = blockMaterial(layout.material);
  const out: DrawnBlock[] = [];
  const list = [...clusters.values()].map((cl) => {
    const p: P2 = [cl.reduce((a, x) => a + x.p[0], 0) / cl.length, cl.reduce((a, x) => a + x.p[1], 0) / cl.length];
    return { p, kind: cl[0].kind };
  });
  list.sort((a, b) => Math.round(a.p[1] / 500) - Math.round(b.p[1] / 500) || a.p[0] - b.p[0]);
  for (const { p, kind } of list) {
    const [pu, pv] = toLocal(f0, p);
    const span = (k: 0 | 1, c: number): [number, number] => {
      if (kind === 'centre' || layout.placement === 'centered') return [c - s / 2, c + s / 2];
      // Viewbox des deux côtés du point le long de cet axe : plaque centrée ; sinon à fleur du bord extérieur
      const lo = ext.filter((e) => e[2 * k] < c - 50 && e[2 * k + 1] >= c - 50 - tol);
      const hi = ext.filter((e) => e[2 * k + 1] > c + 50 && e[2 * k] <= c + 50 + tol);
      if (lo.length && hi.length) return [c - s / 2, c + s / 2];
      if (hi.length) return [c, c + s];
      if (lo.length) return [c - s, c];
      return [c - s / 2, c + s / 2];
    };
    const [u0, u1] = span(0, pu);
    const [v0, v1] = span(1, pv);
    const corners = [toWorld(f0, u0, v0), toWorld(f0, u1, v0), toWorld(f0, u1, v1), toWorld(f0, u0, v1)];
    const xs = corners.map((q) => q[0]);
    const zs = corners.map((q) => q[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    out.push({
      id: `PL${out.length + 1}`,
      label: `Plaque ${mat.key} ${cm(s)} × ${cm(s)} × ${cm(layout.thickness)} cm`,
      x0,
      x1,
      z0,
      z1,
      bottom: groundY - layout.thickness,
      top: groundY,
      massKg: ((x1 - x0) * (z1 - z0) * layout.thickness * mat.rho) / 1e9,
      massSource: 'computed',
      material: mat.key,
      pieces: 1,
    });
  }
  return out;
}

/**
 * Tronçons qui portent : rives posées au sol (mode 'rims', tronçons d'environ 1 m), ou profils les plus bas qui
 * traversent chaque plaque (mode 'pads'). `k` = raideur du sol (N/mm³), `kh` = raideur horizontale d'un appui de
 * référence (N/mm, comptée par mètre de contact).
 */
export function contactStrips(floors: ModuleFloor[], mode: 'rims' | 'pads', pads: DrawnBlock[], k: number, kh: number): ContactPlan {
  const warnings: string[] = [];
  const strips: ContactStrip[] = [];
  const padStations = new Map<string, Array<{ strip: ContactStrip; st: ContactStation; area: number }>>();
  const byKey = new Map<string, { st: ContactStation; entry?: { area: number } }>();
  for (const f of floors) {
    const [L, W] = f.size;
    const rims = f.lines.filter((l) => l.kind === 'rim');
    // rives d'un petit côté : contact raccourci de la largeur des rives des grands côtés (angles comptés une fois)
    const trimOf = (ln: FloorLine): [number, number] => {
      if (ln.kind !== 'rim' || ln.axis !== 'v') return [-Infinity, Infinity];
      const ws = rims.filter((r) => r.axis === 'u');
      const lo = ws.find((r) => r.outer === -1)?.width ?? 0;
      const hi = ws.find((r) => r.outer === 1)?.width ?? 0;
      return [lo, W - hi];
    };
    const make = (ln: FloorLine, a0: number, a1: number, pad: DrawnBlock | null, n: number) => {
      // [a0, a1] = étendue du contact le long de la ligne (repère du module) ; stations sur la ligne de système
      const [t0, t1] = trimOf(ln);
      const c0 = Math.max(a0, t0);
      const c1 = Math.min(a1, t1);
      if (c1 - c0 < 1) return null;
      const lr = lineRect(f, ln);
      const rect: [number, number, number, number] = ln.axis === 'u' ? [c0, c1, lr[2], lr[3]] : [lr[0], lr[1], c0, c1];
      const s0 = Math.max(ln.from, Math.min(ln.to, c0));
      const s1 = Math.max(ln.from, Math.min(ln.to, c1));
      const length = c1 - c0;
      const width = ln.axis === 'u' ? rect[3] - rect[2] : rect[1] - rect[0];
      const mid = (c0 + c1) / 2;
      const center = ln.axis === 'u' ? toWorld(f, mid, (rect[2] + rect[3]) / 2) : toWorld(f, (rect[0] + rect[1]) / 2, mid);
      const sizeAlong = ln.axis === 'u' ? L : W;
      const corner = ln.kind === 'rim' && (c0 <= Math.max(ln.width, 100) + 1 || c1 >= sizeAlong - Math.max(ln.width, 100) - 1 || (ln.axis === 'v' && (c0 <= t0 + 1 || c1 >= t1 - 1)));
      const middle = ln.kind === 'rim' && ln.axis === 'u' && c0 < L / 2 && c1 > L / 2;
      // stations le long de la ligne de système ; la surface de contact est répartie au prorata
      const sts = stationsAlong(s0, s1, STATION_SPACING);
      const totTrib = sts.reduce((x, q) => x + q.trib, 0) || 1;
      const strip: ContactStrip = {
        id: `${f.id}:${pad ? pad.id : 'sol'}:${ln.kind === 'rim' ? 'R' : 'S'}${ln.axis}${Math.round(ln.at)}:${n}`,
        module: f.id,
        kind: ln.kind,
        label: ln.label,
        ...(pad ? { pad: pad.id } : {}),
        rect,
        center,
        along: ln.axis === 'u' ? f.u : f.v,
        length,
        width,
        corner,
        middle,
        stations: [],
      };
      for (const q of sts) {
        const area = (length * width * q.trib) / totTrib;
        const [u, v] = ln.axis === 'u' ? [q.s, ln.at] : [ln.at, q.s];
        const key = `${f.id}|${nodeKey(u, v, 0)}`;
        // nœud déjà appuyé (angle commun à deux rives) : la surface s'ajoute à l'appui existant
        const prev = byKey.get(key);
        if (prev) {
          prev.st.area += area;
          prev.st.trib += q.trib;
          prev.st.kh += (kh * q.trib) / 1000;
          if (prev.entry) prev.entry.area += area;
          else prev.st.kv += k * area;
          continue;
        }
        const st: ContactStation = { u, v, trib: q.trib, area, kv: 0, kh: (kh * q.trib) / 1000 };
        strip.stations.push(st);
        if (pad) {
          if (!padStations.has(pad.id)) padStations.set(pad.id, []);
          const entry = { strip, st, area };
          padStations.get(pad.id)!.push(entry);
          byKey.set(key, { st, entry });
        } else {
          st.kv = k * area;
          byKey.set(key, { st });
        }
      }
      if (!strip.stations.length) return null;
      strips.push(strip);
      return strip;
    };
    if (mode === 'rims') {
      for (const ln of rims) {
        const full = ln.axis === 'u' ? L : W;
        const n = Math.max(1, Math.round(full / RIM_SEGMENT));
        for (let j = 0; j < n; j++) make(ln, (full * j) / n, (full * (j + 1)) / n, null, j + 1);
      }
      continue;
    }
    for (const pad of pads) {
      const r = rectIn(f, pad);
      // plaque hors de ce module
      if (r[1] <= 0 || r[0] >= L || r[3] <= 0 || r[2] >= W) continue;
      const hits = (lines: FloorLine[]) =>
        lines
          .map((ln) => {
            const lr = lineRect(f, ln);
            const ov = [Math.max(lr[0], r[0]), Math.min(lr[1], r[1]), Math.max(lr[2], r[2]), Math.min(lr[3], r[3])];
            return ov[1] - ov[0] > 1 && ov[3] - ov[2] > 1 ? { ln, ov } : null;
          })
          .filter((x): x is { ln: FloorLine; ov: number[] } => !!x);
      const onRims = hits(rims);
      // les profils les plus bas : les rives ; sinon les traverses / lisses (calées à leur niveau)
      const on = onRims.length ? onRims : hits(f.lines.filter((l) => l.kind === 'secondary'));
      on.forEach(({ ln, ov }, j) => make(ln, ln.axis === 'u' ? ov[0] : ov[2], ln.axis === 'u' ? ov[1] : ov[3], pad, j + 1));
    }
  }
  // plaques : sol sous la plaque (k · A) en série avec le bois comprimé sous chaque tronçon, réparti au prorata du contact
  for (const pad of pads) {
    const list = padStations.get(pad.id);
    if (!list?.length) {
      if (mode === 'pads') warnings.push(`${pad.id} (${pad.label}) : sous aucune rive ni profil du plancher d’une Viewbox posée au sol — ne porte rien.`);
      continue;
    }
    const A = (pad.x1 - pad.x0) * (pad.z1 - pad.z0);
    const h = Math.max(1, pad.top - pad.bottom);
    const tot = list.reduce((a, e) => a + e.area, 0) || 1;
    for (const e of list) {
      const soil = (k * A * e.area) / tot;
      const width = e.strip.width;
      const wood = (E_PERP_TIMBER * e.st.trib * (width + Math.min(h, 1000))) / h;
      e.st.kv = 1 / (1 / soil + 1 / wood);
    }
  }
  return { mode, strips, pads: mode === 'pads' ? pads : [], k, warnings };
}

/**
 * Découpe les barres du plancher d'un gabarit aux points donnés (repère du module, au niveau du plancher) : nouveaux
 * nœuds, barres coupées en deux (mêmes famille, section, ligne ; relâchements gardés aux extrémités d'origine), faces
 * (nœuds des rives) mises à jour. Une barre coupée en plusieurs morceaux sans charge au nœud donne le même résultat.
 */
export function splitFloor(tpl: ViewboxTemplate, points: ReadonlyArray<{ u: number; v: number }>): ViewboxTemplate {
  const z = tpl.params.floorZ;
  const nodes = new Map(tpl.nodes.map((n) => [n.key, { ...n }]));
  let members = tpl.members.map((m) => ({ ...m }));
  for (const p of points) {
    const key = nodeKey(p.u, p.v, z);
    if (nodes.has(key)) continue;
    const idx = members.findIndex((m) => {
      if (m.family !== 'rim-floor' && m.family !== 'secondary-floor') return false;
      const a = nodes.get(m.i)!;
      const b = nodes.get(m.j)!;
      if (Math.abs(a.z - z) > 1 || Math.abs(b.z - z) > 1) return false;
      const dx = b.u - a.u;
      const dy = b.v - a.v;
      const L2 = dx * dx + dy * dy;
      const t = ((p.u - a.u) * dx + (p.v - a.v) * dy) / L2;
      if (t <= 1e-6 || t >= 1 - 1e-6) return false;
      return Math.hypot(a.u + t * dx - p.u, a.v + t * dy - p.v) < 1;
    });
    if (idx < 0) continue;
    nodes.set(key, { key, u: Math.round(p.u), v: Math.round(p.v), z });
    const m = members[idx];
    const first = { ...m, j: key, endJ: undefined };
    const second = { ...m, i: key, endI: undefined };
    members = [...members.slice(0, idx), first, second, ...members.slice(idx + 1)];
  }
  const nodeList = [...nodes.values()];
  const byKey = new Map(nodeList.map((n) => [n.key, n]));
  const faces = tpl.faces.map((fc) => {
    const line = `floor:${fc.side}`;
    const rm = members.filter((m) => m.line === line);
    if (!rm.length) return fc;
    const keys = [...new Set(rm.flatMap((m) => [m.i, m.j]))];
    const a = byKey.get(fc.cornersFloor[0])!;
    keys.sort((x, y) => Math.hypot(byKey.get(x)!.u - a.u, byKey.get(x)!.v - a.v) - Math.hypot(byKey.get(y)!.u - a.u, byKey.get(y)!.v - a.v));
    return { ...fc, rimFloor: keys };
  });
  return { ...tpl, nodes: nodeList, members, faces };
}

/** Texte court d'un mode d'appui (étapes 3 / 5, rapport). */
export function contactModeText(c: Pick<ContactPlan, 'mode' | 'pads' | 'strips'> | null | undefined, jacks: boolean): string {
  if (!c) return jacks ? 'pieds à vérin (6 par Viewbox)' : 'angles posés directement sur le calage';
  if (c.mode === 'rims') return 'Viewbox posées directement au sol : toute la rive (UNP) du plancher porte';
  const sec = new Set(c.strips.filter((s) => s.kind === 'secondary').map((s) => s.pad));
  return `Viewbox posées sur ${c.pads.length} plaque(s) / bloc(s) : la rive (UNP) porte sur la largeur de chaque plaque${sec.size ? ` ; ${sec.size} sous les profils du plancher (traverses / lisses)` : ''}`;
}

/** Plancher d'une Viewbox placée (contour seulement, pour la disposition des plaques). */
export function floorOfPlaced(pm: PlacedModule): ModuleFloor {
  const p = pm.params;
  return { id: pm.id, origin: [pm.origin[0], pm.origin[2]], u: [pm.u[0], pm.u[2]], v: [pm.v[0], pm.v[2]], size: [p.x0 + p.x1, p.y0 + p.y1], lines: [] };
}

/**
 * Contact au sol de l'étude à partir des options de calcul : null = appuis ponctuels (vérins ou angles). Plaques :
 * blocs dessinés dans le modèle (s'il y en a et que la source n'est pas « disposition »), sinon disposition générée
 * sous les Viewbox posées au sol.
 */
export function resolveGroundContact(
  opts: GroundContactOptions | undefined,
  jacks: boolean,
  modules: readonly PlacedModule[],
  modelBlocks: readonly DrawnBlock[] | undefined,
  k: number,
): { mode: 'rims' | 'pads'; pads: DrawnBlock[]; k: number; source?: 'model' | 'layout' } | null {
  if (jacks || !opts || opts.mode === 'points') return null;
  if (opts.mode === 'rims') return { mode: 'rims', pads: [], k };
  const ground = modules.filter((m) => m.level === 0);
  const useModel = opts.pads !== 'layout' && !!modelBlocks?.length;
  if (useModel) return { mode: 'pads', pads: [...modelBlocks!], k, source: 'model' };
  const groundY = ground.length ? Math.min(...ground.map((m) => m.origin[1])) : 0;
  return { mode: 'pads', pads: layoutPads(ground.map(floorOfPlaced), opts.layout ?? PAD_LAYOUT_DEFAULT, groundY), k, source: 'layout' };
}
