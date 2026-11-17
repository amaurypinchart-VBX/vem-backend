// « 📏 Coter une pièce » (A. Pinchart 17.11.2026 : « pouvoir cliquer sur les différents groupes où je veux des cotes et
// que ça me donne les bonnes cotes … des bois de 45 × 45 en horizontal et vertical … leur mesure et leur emplacement
// par rapport au sol et aux côtés des poteaux ») : clic sur une pièce d'une vue de planche (standard ou spéciale) → la
// pièce, son groupe ou toutes les pièces identiques dessinées dans la vue, puis leurs cotes en chaîne : position et
// largeur de chaque pièce depuis les faces intérieures des poteaux de la Viewbox, hauteurs depuis le dessus du plancher
// (ou le sol). Pur : traits de la vue (objet d'origine de chaque trait), index de scène, repères des Viewbox. Une
// référence introuvable n'est pas cotée : rien n'est supposé.
import type { Vec3, ViewBasis, ModuleFrame } from '../core/views';
import { dot, unprojectPoint } from '../core/views';
import type { NodeInfo, SceneIndex } from '../core/types';
import type { SceneLookup } from '../core/subset';
import type { TagResolver } from '../core/customViews/tags';
import { moduleRefs } from '../core/customViews/refs';
import { displayLabel } from '../core/customViews/editor';
import type { Linework2D } from '../linework/types';
import { isDecorationLayer } from '../linework/types';
import type { DimensionItem, PointMm } from './types';
import type { DimInput } from './dimensions';
import { DIM, dimGeometry, uniqueSorted } from './dimensions';
import { newId } from './generate';

export interface Box2 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Une pièce dans le dessin (mm modèle, repère du dessin) : nœud de la maquette et son emprise. */
export interface Piece extends Box2 {
  id: string;
}

/** Comment lire la sélection : chaque pièce sous un nœud (groupe), ou toutes les pièces identiques de la vue. */
export type PieceMode = 'level' | 'same';

/** Hauteurs mesurées depuis le dessus du plancher de la Viewbox, ou depuis le sol (dessous des pieds). */
export type HeightFrom = 'floor-top' | 'ground';

export const HEIGHT_FROM_LABELS: Record<HeightFrom, string> = {
  'floor-top': 'dessus du plancher',
  ground: 'sol (dessous des pieds)',
};

/** Les poteaux sont cherchés à moins de ça d'un bord de la Viewbox (poteau d'angle 100 × 100, profils de façade). */
export const POST_BAND = 300;
/** Une face de poteau est un trait parallèle à la hauteur qui en couvre au moins cette part (bouts mis ensemble). */
const POST_MIN_SHARE = 0.35;
/** Au-delà, les longueurs différentes ne sont plus cotées une par une. */
const MAX_SPANS = 3;

const scene = (look: SceneLookup, id: string): NodeInfo | undefined => look.byId.get(id);

// ─── pièce sous le clic ───

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

function ringContains(r: Float64Array, x: number, y: number): boolean {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[2 * i];
    const yi = r[2 * i + 1];
    const xj = r[2 * j];
    const yj = r[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Objet d'origine du trait le plus proche du point (mm modèle) à moins de `tol`, sinon de la pièce coupée qui le
 * contient (vues spéciales). Les traits de décoration (couleurs, repères, lignes cachées, hachures) ne comptent pas.
 */
export function pickSource(lw: Linework2D, x: number, y: number, tol: number): string | null {
  let best: string | null = null;
  let bestD = tol;
  for (const layer of lw.layers) {
    if (isDecorationLayer(layer.key) || !layer.sourceNodeIds) continue;
    const ids = layer.sourceNodeIds;
    layer.polylines.forEach((pl, i) => {
      const id = ids[i];
      if (!id) return;
      for (let k = 0; k + 3 < pl.length; k += 2) {
        // boîte du segment d'abord : la plupart sont loin
        if (Math.min(pl[k], pl[k + 2]) - bestD > x || Math.max(pl[k], pl[k + 2]) + bestD < x) continue;
        if (Math.min(pl[k + 1], pl[k + 3]) - bestD > y || Math.max(pl[k + 1], pl[k + 3]) + bestD < y) continue;
        const d = segDist(x, y, pl[k], pl[k + 1], pl[k + 2], pl[k + 3]);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
    });
  }
  if (best) return best;
  let area = Infinity;
  for (const f of lw.fills ?? []) {
    if (!f.sourceNodeId) continue;
    let inside = false;
    for (const r of f.rings) if (ringContains(r, x, y)) inside = !inside;
    if (!inside) continue;
    const b = boxOf(f.rings);
    const a = (b.x1 - b.x0) * (b.y1 - b.y0);
    if (a < area) {
      area = a;
      best = f.sourceNodeId;
    }
  }
  return best;
}

function boxOf(arrays: Float64Array[]): Box2 {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const a of arrays) grow(b, a);
  return b;
}

function grow(b: Box2, a: Float64Array): void {
  for (let k = 0; k + 1 < a.length; k += 2) {
    if (a[k] < b.x0) b.x0 = a[k];
    if (a[k] > b.x1) b.x1 = a[k];
    if (a[k + 1] < b.y0) b.y0 = a[k + 1];
    if (a[k + 1] > b.y1) b.y1 = a[k + 1];
  }
}

// ─── sélection : quelles pièces ───

/**
 * Pièces sous un nœud. Un groupe qui n'en contient qu'un autre (et rien de dessiné à lui) est traversé ; ensuite
 * chaque groupe / composant enfant (avec tout ce qu'il contient) est une pièce, et la géométrie posée directement
 * dans le nœud forme une pièce (le nœud lui-même). Un bois dessiné comme composant ou groupe = une pièce ; un nœud
 * qui n'a que des faces = une seule pièce.
 */
export function levelPieceOf(look: SceneLookup, level: string, drawn: Iterable<string>): (source: string) => string | null {
  // nœuds dessinés sous `level` (chemins depuis chaque objet d'origine)
  const under = new Set<string>();
  for (const s of drawn) {
    const path: string[] = [];
    let found = false;
    for (let c: string | null | undefined = s; c; c = scene(look, c)?.parentId) {
      path.push(c);
      if (c === level) {
        found = true;
        break;
      }
    }
    if (found) for (const p of path) under.add(p);
  }
  const children = (id: string) => [...under].filter((n) => n !== id && scene(look, n)?.parentId === id);
  let root = level;
  for (let guard = 0; guard < 20; guard++) {
    const kids = children(root);
    const groups = kids.filter((k) => scene(look, k)?.kind === 'group');
    if (groups.length === 1 && groups.length === kids.length) root = groups[0];
    else break;
  }
  const pieces = new Set(children(root).filter((k) => scene(look, k)?.kind === 'group'));
  return (source) => {
    for (let c: string | null | undefined = source; c; c = scene(look, c)?.parentId) {
      if (pieces.has(c)) return c;
      if (c === root) return root;
      if (c === level) return null;
    }
    return null;
  };
}

/** Clé « pièce identique » : la définition SketchUp, sinon le nom donné (pas « Groupe 12 » ni « Pièce sans nom »). */
export function sameKey(n: NodeInfo | undefined): string | null {
  if (!n || n.role === 'module' || n.role === 'context' || n.role === 'wrapper') return null;
  if (n.definition) return `def:${n.definition}`;
  const label = displayLabel(n);
  if (!label || label === 'Pièce sans nom' || /^(Group|Groupe|Component|Composant|Composante)[ _#]?\d*$/i.test(label)) return null;
  return `name:${label}`;
}

/** Toutes les pièces de la vue identiques au nœud (même définition / même nom), chacune une pièce. */
export function samePieceOf(look: SceneLookup, level: string): ((source: string) => string | null) | null {
  const key = sameKey(scene(look, level));
  if (!key) return null;
  return (source) => {
    for (let c: string | null | undefined = source; c; c = scene(look, c)?.parentId) {
      const n = scene(look, c);
      if (!n || n.role === 'module') return null;
      if (sameKey(n) === key) return c;
    }
    return null;
  };
}

/**
 * Pièces : maillages dessinés regroupés par pièce (`pieceOf`), emprise = réunion de leurs emprises dans le dessin
 * (`boxOf` : triangles projetés après les coupes de la vue), `sources` = objets d'origine de leurs traits.
 */
export function groupPieces(meshIds: Iterable<string>, pieceOf: (mesh: string) => string | null, boxOf: (mesh: string) => Box2 | null, sourceOf: (mesh: string) => string): Array<Piece & { sources: Set<string> }> {
  const by = new Map<string, Piece & { sources: Set<string> }>();
  for (const m of meshIds) {
    const id = pieceOf(m);
    if (!id) continue;
    const b = boxOf(m);
    if (!b) continue;
    let p = by.get(id);
    if (!p) by.set(id, (p = { id, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, sources: new Set() }));
    p.x0 = Math.min(p.x0, b.x0);
    p.x1 = Math.max(p.x1, b.x1);
    p.y0 = Math.min(p.y0, b.y0);
    p.y1 = Math.max(p.y1, b.y1);
    p.sources.add(sourceOf(m));
  }
  return [...by.values()].sort((a, b) => a.x0 - b.x0 || a.y0 - b.y0);
}

/** Le segment coupe-t-il la boîte (Liang–Barsky) ? */
function segInBox(ax: number, ay: number, bx: number, by: number, b: Box2): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, ax - b.x0) && clip(dx, b.x1 - ax) && clip(-dy, ay - b.y0) && clip(dy, b.y1 - ay);
}

/**
 * Pièces qu'on voit dans le dessin : un trait de leur objet passe dans leur emprise (une pièce cachée derrière un mur
 * n'est pas cotée).
 */
export function seenPieces<P extends Piece & { sources: Set<string> }>(lw: Linework2D, pieces: P[], tol = 1): P[] {
  const wanted = new Set(pieces.flatMap((p) => [...p.sources]));
  const lines: Array<{ src: string; pl: Float64Array }> = [];
  for (const l of lw.layers) {
    if (isDecorationLayer(l.key)) continue;
    l.polylines.forEach((pl, i) => {
      const src = l.sourceNodeIds?.[i];
      if (src && wanted.has(src)) lines.push({ src, pl });
    });
  }
  return pieces.filter((p) => {
    const box = { x0: p.x0 - tol, x1: p.x1 + tol, y0: p.y0 - tol, y1: p.y1 + tol };
    return lines.some(({ src, pl }) => {
      if (!p.sources.has(src)) return false;
      for (let k = 0; k + 3 < pl.length; k += 2) if (segInBox(pl[k], pl[k + 1], pl[k + 2], pl[k + 3], box)) return true;
      return false;
    });
  });
}

/** Contour (rectangle) de chaque pièce : surbrillance dans l'éditeur. */
export function pieceOutlines(pieces: Box2[]): Float64Array[] {
  return pieces.map((p) => new Float64Array([p.x0, p.y0, p.x1, p.y0, p.x1, p.y1, p.x0, p.y1, p.x0, p.y0]));
}

// ─── références : faces des poteaux, plancher ───

/** Axe du dessin qui porte la hauteur (Y monde) : élévations, coupes verticales ; null en plan. */
export function heightAxis(basis: ViewBasis): { axis: 'x' | 'y'; sign: 1 | -1 } | null {
  if (Math.abs(basis.up[1]) > 0.98) return { axis: 'y', sign: basis.up[1] > 0 ? 1 : -1 };
  if (Math.abs(basis.right[1]) > 0.98) return { axis: 'x', sign: basis.right[1] > 0 ? 1 : -1 };
  return null;
}

/** Emprise d'une Viewbox dans le dessin : les 8 coins de sa boîte (pieds exclus) projetés. */
export function moduleExtent(f: ModuleFrame, basis: ViewBasis): Box2 {
  const e = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (let c = 0; c < 8; c++) {
    const lx = c & 1 ? f.max[0] : f.min[0];
    const ly = c & 2 ? f.max[1] : f.min[1];
    const lz = c & 4 ? f.max[2] : f.min[2];
    const w: Vec3 = [
      f.origin[0] + f.xAxis[0] * lx + f.yAxis[0] * ly + f.up[0] * lz,
      f.origin[1] + f.xAxis[1] * lx + f.yAxis[1] * ly + f.up[1] * lz,
      f.origin[2] + f.xAxis[2] * lx + f.yAxis[2] * ly + f.up[2] * lz,
    ];
    const x = dot(basis.right, w);
    const y = dot(basis.up, w);
    e.x0 = Math.min(e.x0, x);
    e.x1 = Math.max(e.x1, x);
    e.y0 = Math.min(e.y0, y);
    e.y1 = Math.max(e.y1, y);
  }
  return e;
}

export function unionBox(boxes: Box2[]): Box2 {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const p of boxes) {
    b.x0 = Math.min(b.x0, p.x0);
    b.x1 = Math.max(b.x1, p.x1);
    b.y0 = Math.min(b.y0, p.y0);
    b.y1 = Math.max(b.y1, p.y1);
  }
  return b;
}

/**
 * Viewbox de référence : celle dont l'emprise dans le dessin contient le milieu des pièces — de préférence celle à
 * laquelle elles appartiennent (une vue spéciale « séparées » dessine les Viewbox identiques avec les pièces de la
 * première), sinon celle qui recouvre le plus les pièces.
 */
export function referenceModule(frames: ReadonlyMap<string, ModuleFrame>, look: SceneLookup, basis: ViewBasis, pieces: Piece[]): { frame: ModuleFrame; extent: Box2 } | null {
  if (!pieces.length) return null;
  const sel = unionBox(pieces);
  const cx = (sel.x0 + sel.x1) / 2;
  const cy = (sel.y0 + sel.y1) / 2;
  const own = new Map<string, number>();
  for (const p of pieces) {
    const m = scene(look, p.id)?.moduleId;
    if (m) own.set(m, (own.get(m) ?? 0) + 1);
  }
  const cands = [...frames.values()]
    .map((frame) => ({ frame, extent: moduleExtent(frame, basis) }))
    .filter(({ extent: e }) => cx >= e.x0 - 50 && cx <= e.x1 + 50 && cy >= e.y0 - 50 && cy <= e.y1 + 50);
  if (!cands.length) return null;
  const overlap = (e: Box2) => Math.max(0, Math.min(e.x1, sel.x1) - Math.max(e.x0, sel.x0)) * Math.max(0, Math.min(e.y1, sel.y1) - Math.max(e.y0, sel.y0));
  cands.sort((a, b) => (own.get(b.frame.moduleId) ?? 0) - (own.get(a.frame.moduleId) ?? 0) || overlap(b.extent) - overlap(a.extent) || dot(basis.toward, b.frame.origin) - dot(basis.toward, a.frame.origin));
  return cands[0];
}

/** Références le long d'un axe du dessin : valeur basse / haute et ce qu'elles sont. */
export interface AxisRefs {
  lo?: number;
  hi?: number;
  loLabel?: string;
  hiLabel?: string;
}

export interface PieceRefs {
  x: AxisRefs;
  y: AxisRefs;
  /** Viewbox de référence */
  moduleId?: string;
  /** profondeur des ancrages (celle de la Viewbox) */
  depth: number;
  /** ce qui sert de référence, en clair (bulle de l'éditeur) */
  notes: string[];
}

interface Face {
  b: number;
  a0: number;
  a1: number;
  len: number;
}

/**
 * Faces de poteaux le long de l'axe `b` du dessin : traits parallèles à la hauteur (axe `a`), d'une pièce de la
 * structure de la Viewbox (sans catégorie, STRUCTURE, VIEWBOX — pas les façades, portes, vitres), à moins de
 * `POST_BAND` d'un bord de la Viewbox, assez longs (morceaux coupés par ce qui passe devant mis bout à bout).
 */
export function postFaces(lw: Linework2D, a: 'x' | 'y', isPost: (source: string) => boolean, ext: Box2): Face[] {
  const bins = new Map<number, Face>();
  const [b0, b1] = a === 'y' ? [ext.x0, ext.x1] : [ext.y0, ext.y1];
  const height = a === 'y' ? ext.y1 - ext.y0 : ext.x1 - ext.x0;
  const cache = new Map<string, boolean>();
  const ok = (s: string | undefined) => {
    if (!s) return false;
    if (!cache.has(s)) cache.set(s, isPost(s));
    return cache.get(s)!;
  };
  for (const l of lw.layers) {
    if (isDecorationLayer(l.key)) continue;
    l.polylines.forEach((pl, i) => {
      if (!ok(l.sourceNodeIds?.[i])) return;
      for (let k = 0; k + 3 < pl.length; k += 2) {
        const [pb, pa, qb, qa] = a === 'y' ? [pl[k], pl[k + 1], pl[k + 2], pl[k + 3]] : [pl[k + 1], pl[k], pl[k + 3], pl[k + 2]];
        if (Math.abs(qb - pb) > 0.5) continue;
        const b = (pb + qb) / 2;
        if (b < b0 - 1 || b > b1 + 1 || (b > b0 + POST_BAND && b < b1 - POST_BAND)) continue;
        const key = Math.round(b * 2);
        let f = bins.get(key);
        if (!f) bins.set(key, (f = { b, a0: Infinity, a1: -Infinity, len: 0 }));
        f.a0 = Math.min(f.a0, pa, qa);
        f.a1 = Math.max(f.a1, pa, qa);
        f.len += Math.abs(qa - pa);
      }
    });
  }
  return [...bins.values()].filter((f) => f.len >= POST_MIN_SHARE * height);
}

/** Catégories de la structure de la Viewbox (poteaux) : sans catégorie (composant Viewbox), STRUCTURE, VIEWBOX. */
const POST_CATEGORIES = new Set<string | null>([null, 'STRUCTURE', 'VIEWBOX']);

export interface PieceDimScene {
  index: SceneIndex;
  look: SceneLookup;
  frames: ReadonlyMap<string, ModuleFrame>;
  tags: TagResolver;
}

/**
 * Références des cotes d'un groupe de pièces : le long de la hauteur, le dessus du plancher (ou le sol) de la Viewbox
 * où elles sont ; en travers, les faces intérieures de ses poteaux les plus proches de part et d'autre (sinon les bords
 * de la Viewbox). Vue en plan : les bords de la Viewbox dans les deux sens.
 */
export function pieceRefs(sc: PieceDimScene, lw: Linework2D, basis: ViewBasis, pieces: Piece[], selected: (source: string) => boolean, from: HeightFrom = 'floor-top', tol = 3): PieceRefs {
  const refs: PieceRefs = { x: {}, y: {}, depth: 0, notes: [] };
  const mod = referenceModule(sc.frames, sc.look, basis, pieces);
  if (!mod) {
    refs.notes.push('Pièces hors des Viewbox : seules leurs dimensions et leurs écarts sont cotés.');
    return refs;
  }
  const { frame, extent: ext } = mod;
  refs.moduleId = frame.moduleId;
  refs.depth = dot(basis.toward, frame.origin);
  const sel = unionBox(pieces);
  const h = heightAxis(basis);
  const name = sc.index.modules.find((m) => m.id === frame.moduleId)?.name ?? frame.moduleId;
  const edge = (axis: 'x' | 'y') => {
    const [e0, e1] = axis === 'x' ? [ext.x0, ext.x1] : [ext.y0, ext.y1];
    const [s0, s1] = axis === 'x' ? [sel.x0, sel.x1] : [sel.y0, sel.y1];
    const r: AxisRefs = {};
    if (s0 >= e0 - tol) Object.assign(r, { lo: e0, loLabel: 'bord de la Viewbox' });
    if (s1 <= e1 + tol) Object.assign(r, { hi: e1, hiLabel: 'bord de la Viewbox' });
    return r;
  };
  if (!h) {
    refs.x = edge('x');
    refs.y = edge('y');
    refs.notes.push(`Positions depuis les bords de ${name}.`);
    return refs;
  }
  // hauteurs : dessus du plancher (ou sol) de la Viewbox
  const levels = moduleRefs(sc.index, sc.look, sc.tags, frame);
  const level = levels[from];
  const p: Vec3 = [frame.origin[0], level.y, frame.origin[2]];
  const at = h.axis === 'y' ? dot(basis.up, p) : dot(basis.right, p);
  const hRef: AxisRefs = h.sign > 0 ? { lo: at, loLabel: HEIGHT_FROM_LABELS[from] } : { hi: at, hiLabel: HEIGHT_FROM_LABELS[from] };
  refs.notes.push(`Hauteurs depuis le ${HEIGHT_FROM_LABELS[from]} de ${name}${level.source === 'type' ? ' (valeur du type : plancher non reconnu dans la maquette)' : ''}.`);
  // en travers : faces intérieures des poteaux les plus proches
  const b = h.axis === 'y' ? 'x' : 'y';
  const modNode = sc.index.modules.find((m) => m.id === frame.moduleId)?.nodeId;
  const inModule = new Set(modNode ? [modNode] : []);
  const faces = postFaces(lw, h.axis, (s) => !selected(s) && sc.look.inSet(s, inModule) && POST_CATEGORIES.has(sc.look.categoryOf(s)), ext);
  const [s0, s1, sa0, sa1] = b === 'x' ? [sel.x0, sel.x1, sel.y0, sel.y1] : [sel.y0, sel.y1, sel.x0, sel.x1];
  const [e0, e1] = b === 'x' ? [ext.x0, ext.x1] : [ext.y0, ext.y1];
  const facing = faces.filter((f) => f.a1 >= sa0 - tol && f.a0 <= sa1 + tol);
  const lo = facing.filter((f) => f.b <= e0 + POST_BAND && f.b <= s0 + tol).sort((p1, p2) => p2.b - p1.b)[0];
  const hi = facing.filter((f) => f.b >= e1 - POST_BAND && f.b >= s1 - tol).sort((p1, p2) => p1.b - p2.b)[0];
  const across: AxisRefs = {};
  if (lo) Object.assign(across, { lo: lo.b, loLabel: 'face du poteau' });
  else if (s0 >= e0 - tol) Object.assign(across, { lo: e0, loLabel: 'bord de la Viewbox' });
  if (hi) Object.assign(across, { hi: hi.b, hiLabel: 'face du poteau' });
  else if (s1 <= e1 + tol) Object.assign(across, { hi: e1, hiLabel: 'bord de la Viewbox' });
  const said = [across.loLabel, across.hiLabel].filter(Boolean);
  if (said.length) refs.notes.push(`Positions depuis ${said.every((t) => t === 'face du poteau') ? 'les faces intérieures des poteaux' : said.every((t) => t === 'bord de la Viewbox') ? 'les bords de la Viewbox' : 'la face du poteau et le bord de la Viewbox'} (${name}).`);
  if (h.axis === 'y') {
    refs.x = across;
    refs.y = hRef;
  } else {
    refs.y = across;
    refs.x = hRef;
  }
  return refs;
}

// ─── chaînes de cotes ───

export interface PieceChain {
  orient: 'h' | 'v';
  /** valeurs le long de l'axe (mm modèle, repère du dessin), triées */
  values: number[];
  /** positions (bords des pièces depuis les références) ou longueur d'un groupe de pièces de même longueur */
  what: 'position' | 'span';
}

/** Groupes de pièces de même longueur le long d'un axe (les plus nombreux d'abord). */
function spans(pieces: Piece[], axis: 'x' | 'y', tol: number): Array<[number, number]> {
  const groups: Array<{ lo: number; hi: number; n: number }> = [];
  for (const p of pieces) {
    const [lo, hi] = axis === 'x' ? [p.x0, p.x1] : [p.y0, p.y1];
    const g = groups.find((x) => Math.abs(x.lo - lo) <= tol && Math.abs(x.hi - hi) <= tol);
    if (g) g.n++;
    else groups.push({ lo, hi, n: 1 });
  }
  return groups.sort((a, b) => b.n - a.n || a.lo - b.lo).map((g) => [g.lo, g.hi]);
}

/**
 * Cotes d'un groupe de pièces :
 * - pièces debout (montants) : en travers, chaîne références → bords de chaque pièce → référence (positions et
 *   largeurs) ; le long, leur départ et leur hauteur depuis le plancher (une chaîne par longueur différente, 3 au plus) ;
 * - pièces couchées (traverses) : chaîne des hauteurs depuis le plancher (bas et haut de chaque pièce) ; leur longueur
 *   et l'écart aux poteaux quand elles ne vont pas d'un poteau à l'autre ;
 * - pièces trapues (bois vus en bout, coupés) : positions dans les deux sens.
 * Une chaîne qui ne dit rien de plus qu'une autre n'est pas ajoutée.
 */
export function planPieceDims(pieces: Piece[], refs: { x: AxisRefs; y: AxisRefs }, tol = 3): PieceChain[] {
  const out: PieceChain[] = [];
  const tall = pieces.filter((p) => p.y1 - p.y0 >= 2 * (p.x1 - p.x0));
  const wide = pieces.filter((p) => p.x1 - p.x0 >= 2 * (p.y1 - p.y0));
  const compact = pieces.filter((p) => !tall.includes(p) && !wide.includes(p));
  const withRefs = (r: AxisRefs, vals: number[]) => uniqueSorted([...(r.lo != null ? [r.lo] : []), ...vals, ...(r.hi != null ? [r.hi] : [])], tol);
  const add = (orient: 'h' | 'v', values: number[], what: PieceChain['what']) => {
    if (values.length < 2 || values[values.length - 1] - values[0] <= tol) return;
    if (out.some((c) => c.orient === orient && values.every((v) => c.values.some((w) => Math.abs(w - v) <= tol)))) return;
    out.push({ orient, values, what });
  };
  const across = [...tall, ...compact];
  if (across.length) add('h', withRefs(refs.x, across.flatMap((p) => [p.x0, p.x1])), 'position');
  const heights = [...wide, ...compact];
  if (heights.length) add('v', withRefs(refs.y, heights.flatMap((p) => [p.y0, p.y1])), 'position');
  for (const [lo, hi] of spans(tall, 'y', tol).slice(0, MAX_SPANS)) add('v', withRefs(refs.y, [lo, hi]), 'span');
  for (const [lo, hi] of spans(wide, 'x', tol).slice(0, MAX_SPANS)) add('h', withRefs(refs.x, [lo, hi]), 'span');
  return out;
}

/** Longueurs différentes laissées de côté (au-delà de 3 par sens). */
export function skippedSpans(pieces: Piece[], tol = 3): number {
  const tall = pieces.filter((p) => p.y1 - p.y0 >= 2 * (p.x1 - p.x0));
  const wide = pieces.filter((p) => p.x1 - p.x0 >= 2 * (p.y1 - p.y0));
  return Math.max(0, spans(tall, 'y', tol).length - MAX_SPANS) + Math.max(0, spans(wide, 'x', tol).length - MAX_SPANS);
}

// ─── pose sur la planche ───

export type Side = 'top' | 'bottom' | 'left' | 'right';

export interface PlacedChain {
  orient: 'h' | 'v';
  side: Side;
  /** points d'ancrage (mm modèle) : sur le bord du dessin du côté de la cote */
  points: Array<[number, number]>;
  offsetMm: number;
}

/**
 * Pose des chaînes autour du dessin, du côté le plus proche des pièces (en haut ou en bas, à droite ou à gauche ; à
 * égalité : en bas, à droite), chacune au-delà des cotes déjà là (rangées de 7 mm, plus si leurs textes débordent) —
 * comme « Coter automatiquement ». Ancrées sur le bord du dessin : elles restent dehors à toute échelle.
 */
export function placePieceDims(
  chains: PieceChain[],
  ctx: { bounds: Linework2D['boundsMm']; sel: Box2; toPaper: (x: number, y: number) => PointMm; existing: DimInput[] },
): PlacedChain[] {
  const { bounds: bd, sel, toPaper } = ctx;
  const tl = toPaper(bd.minX, bd.maxY);
  const brp = toPaper(bd.maxX, bd.minY);
  const edge: Record<Side, number> = { top: tl.y, bottom: brp.y, left: tl.x, right: brp.x };
  const outward = (side: Side) => (side === 'top' || side === 'left' ? -1 : 1);
  // ligne et bord extérieur (textes compris) des cotes déjà posées de chaque côté
  const outer = new Map<Side, { line: number; box: number }>();
  const note = (orient: DimInput['orient'], input: DimInput) => {
    if (orient === 'aligned') return;
    const g = dimGeometry(input);
    if (!g.lines.length) return;
    const line = orient === 'h' ? g.lines[0][1] : g.lines[0][0];
    const side: Side | null = orient === 'h' ? (line < edge.top - 0.5 ? 'top' : line > edge.bottom + 0.5 ? 'bottom' : null) : line < edge.left - 0.5 ? 'left' : line > edge.right + 0.5 ? 'right' : null;
    if (!side) return;
    const box = side === 'top' ? g.box.y : side === 'bottom' ? g.box.y + g.box.h : side === 'left' ? g.box.x : g.box.x + g.box.w;
    const o = outer.get(side);
    const s = outward(side);
    if (!o) outer.set(side, { line, box });
    else outer.set(side, { line: s < 0 ? Math.min(o.line, line) : Math.max(o.line, line), box: s < 0 ? Math.min(o.box, box) : Math.max(o.box, box) });
  };
  for (const e of ctx.existing) note(e.orient, e);
  const out: PlacedChain[] = [];
  for (const c of chains) {
    const side: Side =
      c.orient === 'h' ? (bd.maxY - sel.y1 < sel.y0 - bd.minY ? 'top' : 'bottom') : sel.x0 - bd.minX < bd.maxX - sel.x1 ? 'left' : 'right';
    const s = outward(side);
    const o = outer.get(side);
    const line = o ? (s < 0 ? Math.min(o.line - DIM.rowStep, o.box - 3.5) : Math.max(o.line + DIM.rowStep, o.box + 3.5)) : edge[side] + s * DIM.firstRow;
    const fixed = side === 'top' ? bd.maxY : side === 'bottom' ? bd.minY : side === 'left' ? bd.minX : bd.maxX;
    const points = c.values.map((v) => (c.orient === 'h' ? [v, fixed] : [fixed, v]) as [number, number]);
    const offsetMm = line - edge[side];
    out.push({ orient: c.orient, side, points, offsetMm });
    note(c.orient, { orient: c.orient, paper: points.map(([x, y]) => toPaper(x, y)), model: points, offsetMm });
  }
  return out;
}

/** Cotes d'un groupe de pièces, prêtes à poser sur la planche (associatives : elles suivent la vue). */
export function pieceDimensionItems(placed: PlacedChain[], viewportId: string, basis: ViewBasis, depth: number): DimensionItem[] {
  return placed.map((c) => ({
    id: newId('d'),
    type: 'dimension',
    viewportId,
    kind: c.points.length > 2 ? 'chain' : 'linear',
    orient: c.orient,
    anchors3d: c.points.map(([x, y]) => unprojectPoint(basis, x, y, depth) as Vec3),
    offsetMm: c.offsetMm,
  }));
}

/** Résumé d'une sélection : « 3 montants, 2 traverses ». */
export function describePieces(pieces: Piece[]): string {
  const tall = pieces.filter((p) => p.y1 - p.y0 >= 2 * (p.x1 - p.x0)).length;
  const wide = pieces.filter((p) => p.x1 - p.x0 >= 2 * (p.y1 - p.y0)).length;
  const other = pieces.length - tall - wide;
  const parts = [
    tall ? `${tall} debout` : '',
    wide ? `${wide} couchée${wide > 1 ? 's' : ''}` : '',
    other ? `${other} autre${other > 1 ? 's' : ''}` : '',
  ].filter(Boolean);
  return `${pieces.length} pièce${pieces.length > 1 ? 's' : ''}${parts.length > 1 || (parts.length === 1 && !other) ? ` (${parts.join(', ')})` : ''}`;
}

// ─── fil d'Ariane de la bulle ───

export interface PieceCrumb {
  id: string;
  label: string;
}

/**
 * Niveaux proposés pour un trait cliqué : chaque groupe / composant au-dessus de lui jusqu'à la Viewbox (ou jusqu'à
 * l'accessoire posé contre elle), groupes sans nom compris (« Groupe ») — un bois est souvent un groupe sans nom dans
 * un groupe « Ossature ». Le niveau proposé = le groupe le plus proche (la pièce cliquée).
 */
export function pieceCrumbs(look: SceneLookup, source: string): { crumbs: PieceCrumb[]; level: string } {
  const chain: NodeInfo[] = [];
  for (let n = scene(look, source); n; n = n.parentId ? scene(look, n.parentId) : undefined) {
    if (n.role === 'context' || n.role === 'wrapper') break;
    chain.push(n);
    if (n.role === 'module') break;
  }
  const groups = chain.filter((n) => n.kind === 'group' || n.role === 'module');
  const levels = groups.some((n) => n.role !== 'module') ? groups : chain.slice(0, 1).concat(groups);
  // une maille dans un groupe : c'est le groupe qu'on cote
  const pick = levels.find((n) => n.kind === 'group' && n.role !== 'module') ?? levels[0];
  let kept = levels.slice().reverse();
  // très longue hiérarchie : la Viewbox puis les 5 niveaux les plus proches de la pièce
  if (kept.length > 6) kept = [kept[0], ...kept.slice(-5)];
  const crumbs = kept.map((n) => ({ id: n.id, label: n.role === 'module' ? n.name : crumbLabel(n) }));
  return { crumbs, level: pick?.id ?? source };
}

function crumbLabel(n: NodeInfo): string {
  const l = displayLabel(n);
  if (l === 'Pièce sans nom') return n.kind === 'group' ? 'Groupe' : 'Faces';
  return l.length > 38 ? `${l.slice(0, 36)}…` : l;
}
