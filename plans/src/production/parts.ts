// Pièces de production d'une Viewbox (pur) : désignation en anglais (section reconnue, plaque, bloc), regroupement des
// pièces identiques (mêmes dimensions au mm, mêmes perçages, à un retournement près) et repères P01, P02…
import type { DetectedSection } from '../structure/core/sectionDetect';
import { barAxis, catalogueCandidates, memberSection } from '../structure/core/sectionDetect';
import type { Hole, PartGeometry, V3 } from './analyze';
import { holeName, niceDiameter, toLocal } from './analyze';

/** Une pièce dessinée, lue dans le modèle. */
export interface PartInfo {
  nodeId: string;
  moduleId: string;
  /** nom dans SketchUp (désignation, définition, sinon nom d'instance), nettoyé */
  name: string;
  category: string | null;
  geo: PartGeometry;
  /** section reconnue (profils) : « Channel 162 × 80 × 4 », « UPN 220 » */
  section?: string;
}

/** Pièces identiques regroupées : un repère, une planche. */
export interface PartType {
  /** « P01 » */
  mark: string;
  name: string;
  /** « Channel 162 × 80 × 4 — L 5 708 » */
  description: string;
  rep: PartInfo;
  nodeIds: string[];
  qty: number;
}

/** « Profile_C_toiture_long__2 » → « Profile C toiture long ». */
export function cleanName(raw: string): string {
  return raw
    .replace(/(__?\d+)+$/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Noms sans intérêt (export STL, instances SketchUp sans nom). */
export function genericName(name: string): boolean {
  return !name || /^(group|mesh|sketchup instance|component|composant|groupe)\s*\d*$/i.test(name);
}

/** « 2 438 » */
export function fmtMm(mm: number): string {
  return String(Math.round(mm)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

const fmt1 = (v: number) => (Math.round(v * 10) / 10).toString();

const SHAPE_EN: Record<DetectedSection['shape'], string> = {
  'tube-rect': 'RHS',
  'tube-round': 'CHS',
  I: 'I-beam',
  U: 'Channel',
  L: 'Angle',
  T: 'Tee',
  flat: 'Flat bar',
  'solid-rect': 'Solid bar',
  round: 'Round bar',
  other: 'Profile',
};

/** Désignation anglaise d'une coupe mesurée. */
export function sectionNameEn(s: DetectedSection): string {
  const d = s.dims;
  if (s.shape === 'tube-round') return `CHS Ø${fmt1(d.d ?? d.h)} × ${fmt1(d.t ?? 0)}`;
  if (s.shape === 'round') return `Round bar Ø${fmt1(d.d ?? d.h)}`;
  if (s.shape === 'flat' || s.shape === 'solid-rect') return `${SHAPE_EN[s.shape]} ${fmt1(d.h)} × ${fmt1(d.b)}`;
  const t = d.tw ?? d.t;
  return `${SHAPE_EN[s.shape]} ${fmt1(d.h)} × ${fmt1(d.b)}${t ? ` × ${fmt1(t)}` : ''}`;
}

/** Section d'un profil (catalogue quand elle correspond : « UPN 160 », sinon la coupe mesurée). */
export function profileSection(geo: PartGeometry, pos: ArrayLike<number>): string | undefined {
  if (geo.kind !== 'profile') return undefined;
  try {
    const local = toLocal(pos, geo.frame);
    const ms = memberSection(local, barAxis(local));
    const s = ms.section;
    if (!s || s.shape === 'other') return undefined;
    const best = catalogueCandidates(s, 1)[0];
    if (best?.match) return best.entry.name.replace(/\s*\(.*\)\s*$/, '');
    return sectionNameEn(s);
  } catch {
    return undefined;
  }
}

/** Désignation de la pièce. */
export function describePart(p: Pick<PartInfo, 'geo' | 'section'>): string {
  const [L, B, T] = p.geo.size;
  const welded = p.geo.solids > 1 ? ` — welded, ${p.geo.solids} pieces` : '';
  if (p.geo.kind === 'profile') return `${p.section ?? `Profile ${fmtMm(B)} × ${fmtMm(T)}`} — L ${fmtMm(L)}${welded}`;
  if (p.geo.kind === 'plate') return `${T <= 25 ? 'Plate' : 'Panel'} ${fmt1(T)} × ${fmtMm(B)} × ${fmtMm(L)}${welded}`;
  return `Block ${fmtMm(L)} × ${fmtMm(B)} × ${fmtMm(T)}${welded}`;
}

/** Perçages vus depuis un retournement de la pièce (rotation de 180° autour d'un axe : le repère reste direct). */
function flipped(holes: Hole[], size: V3, flip: 0 | 1 | 2 | 3): Hole[] {
  if (!flip) return holes;
  const f: [boolean, boolean, boolean] = flip === 1 ? [true, true, false] : flip === 2 ? [true, false, true] : [false, true, true];
  return holes.map((h) => ({ ...h, c: h.c.map((x, i) => (f[i] ? size[i] - x : x)) as V3 }));
}

/** Empreinte d'une pièce : nature, dimensions au mm, perçages (le plus petit des 4 retournements). */
export function partKey(p: Pick<PartInfo, 'geo' | 'section'>): string {
  const g = p.geo;
  const dims = g.size.map((x) => Math.round(x)).join('x');
  const variants = ([0, 1, 2, 3] as const).map((fl) =>
    flipped(g.holes, g.size, fl)
      .map((h) => `${h.axis}${holeName(h)}@${h.c.map((x) => Math.round(x)).join(',')}`)
      .sort()
      .join(';'),
  );
  return `${g.kind}|${dims}|${p.section ?? ''}|${g.solids}|${variants.sort()[0]}`;
}

const KIND_ORDER = { profile: 0, plate: 1, block: 2 } as const;

/** Pièces identiques regroupées, repérées P01, P02… (profils du plus long au plus court, puis plaques, puis blocs). */
export function groupParts(parts: PartInfo[]): PartType[] {
  const byKey = new Map<string, PartInfo[]>();
  for (const p of parts) {
    const k = partKey(p);
    const g = byKey.get(k);
    if (g) g.push(p);
    else byKey.set(k, [p]);
  }
  const groups = [...byKey.values()].sort(
    (a, b) =>
      KIND_ORDER[a[0].geo.kind] - KIND_ORDER[b[0].geo.kind] ||
      b[0].geo.size[0] - a[0].geo.size[0] ||
      b[0].geo.size[1] - a[0].geo.size[1] ||
      a[0].name.localeCompare(b[0].name),
  );
  const width = groups.length >= 100 ? 3 : 2;
  return groups.map((g, i) => {
    const rep = g.find((p) => !genericName(p.name)) ?? g[0];
    return {
      mark: `P${String(i + 1).padStart(width, '0')}`,
      name: genericName(rep.name) ? '' : rep.name,
      description: describePart(rep),
      rep,
      nodeIds: g.map((p) => p.nodeId),
      qty: g.length,
    };
  });
}

/** Perçages regroupés pour la nomenclature : même axe et même désignation. */
export interface HoleGroup {
  /** « A », « B »… */
  ref: string;
  name: string;
  thread?: Hole['thread'];
  d: number;
  axis: Hole['axis'];
  walls: number;
  holes: Hole[];
}

export function holeGroups(holes: Hole[]): HoleGroup[] {
  const out: HoleGroup[] = [];
  for (const h of [...holes].sort((a, b) => a.c[0] - b.c[0] || a.c[1] - b.c[1] || a.c[2] - b.c[2])) {
    const name = holeName(h);
    const g = out.find((x) => x.name === name && x.axis === h.axis && x.walls === h.walls);
    if (g) g.holes.push(h);
    else out.push({ ref: '', name, ...(h.thread ? { thread: h.thread } : {}), d: h.d, axis: h.axis, walls: h.walls, holes: [h] });
  }
  out.sort((a, b) => b.holes.length - a.holes.length || a.d - b.d);
  out.forEach((g, i) => (g.ref = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26)) : '')));
  return out;
}

/** « Tapped M8×1.25 (from Ø6.6) », « Drill Ø10 through 2 walls ». */
export function holeAction(g: Pick<HoleGroup, 'thread' | 'd' | 'walls'>): string {
  const walls = g.walls > 1 ? ` through ${g.walls} walls` : '';
  if (g.thread) return `Drill Ø${g.thread.from === 'minor' ? fmt1(niceDrill(g.thread.name)) : fmt1(g.d)} + tap ${g.thread.name}×${g.thread.pitch}${walls}`;
  return `Drill Ø${niceDiameter(g.d)}${walls}`;
}

const TAP_DRILL: Record<string, number> = { M3: 2.5, M4: 3.3, M5: 4.2, M6: 5, M8: 6.8, M10: 8.5, M12: 10.2, M14: 12, M16: 14, M20: 17.5, M24: 21 };
const niceDrill = (m: string) => TAP_DRILL[m] ?? 0;

/** Zone d'une pièce dans la hauteur de sa Viewbox : plancher, toit, ou ossature / murs (poteaux, panneaux de façade). */
export type PartZone = 'floor' | 'roof' | 'frame';

/** Épaisseur des zones plancher / toit comptée depuis le bas / le haut de la box (mm). */
export const PLATFORM_ZONE = 500;

/**
 * Zone d'une pièce d'après sa hauteur (y0…y1, mm) dans celle de sa box (Y0…Y1, pieds compris ou non) : entièrement dans
 * les 500 mm du bas = plancher, du haut = toit, sinon ossature (un poteau traverse toute la hauteur).
 */
export function zoneOfPart(part: [number, number], box: [number, number]): PartZone {
  const [y0, y1] = part;
  const [Y0, Y1] = box;
  const zone = Math.min(PLATFORM_ZONE, (Y1 - Y0) / 3);
  if (y1 <= Y0 + zone) return 'floor';
  if (y0 >= Y1 - zone) return 'roof';
  return 'frame';
}
