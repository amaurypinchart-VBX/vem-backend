// Nettoyage 2D des traits projetés (fonctions pures, testées) :
// suppression des segments minuscules, fusion des segments colinéaires qui se chevauchent (le calque le plus
// important gagne : contour > visible > détail > caché), accrochage à une grille, chaînage en polylignes.
// Unités : mm modèle, repère du dessin (x à droite, y en haut).

export interface SegmentSoup {
  /** [x0, y0, x1, y1] × count */
  coords: Float64Array;
  /** priorité du calque : en cas de superposition, la plus grande gagne */
  prio: Uint8Array;
  /** objet d'origine (index libre, −1 = inconnu) */
  owner: Int32Array;
  count: number;
}

export interface CleanOptions {
  /** pas de la grille d'accrochage (mm) */
  grid: number;
  /** longueur minimale d'un segment (mm) */
  minLength: number;
  /** écart maximal pour considérer deux segments sur la même droite (mm) */
  tolerance: number;
}

export const DEFAULT_CLEAN: CleanOptions = { grid: 0.05, minLength: 0.1, tolerance: 0.05 };

export function makeSoup(capacity: number): SegmentSoup {
  return { coords: new Float64Array(capacity * 4), prio: new Uint8Array(capacity), owner: new Int32Array(capacity), count: 0 };
}

export function pushSegment(s: SegmentSoup, x0: number, y0: number, x1: number, y1: number, prio: number, owner: number): void {
  if (s.count * 4 >= s.coords.length) {
    const cap = Math.max(16, s.count * 2);
    const c = new Float64Array(cap * 4);
    c.set(s.coords);
    const p = new Uint8Array(cap);
    p.set(s.prio);
    const o = new Int32Array(cap);
    o.set(s.owner);
    s.coords = c;
    s.prio = p;
    s.owner = o;
  }
  const i = s.count++;
  s.coords[i * 4] = x0;
  s.coords[i * 4 + 1] = y0;
  s.coords[i * 4 + 2] = x1;
  s.coords[i * 4 + 3] = y1;
  s.prio[i] = prio;
  s.owner[i] = owner;
}

export function concatSoups(...soups: SegmentSoup[]): SegmentSoup {
  const n = soups.reduce((a, s) => a + s.count, 0);
  const out = makeSoup(n);
  for (const s of soups) {
    out.coords.set(s.coords.subarray(0, s.count * 4), out.count * 4);
    out.prio.set(s.prio.subarray(0, s.count), out.count);
    out.owner.set(s.owner.subarray(0, s.count), out.count);
    out.count += s.count;
  }
  return out;
}

const snap = (v: number, g: number) => Math.round(v / g) * g;

/** Index spatial en grille : clé numérique de cellule. */
class CellGrid {
  private readonly map = new Map<number, number[]>();
  constructor(readonly cell: number) {}
  key(ix: number, iy: number): number {
    return (ix + 1_048_576) * 2_097_152 + (iy + 1_048_576);
  }
  add(x: number, y: number, id: number): void {
    const k = this.key(Math.floor(x / this.cell), Math.floor(y / this.cell));
    const l = this.map.get(k);
    if (!l) this.map.set(k, [id]);
    else if (l[l.length - 1] !== id) l.push(id);
  }
  /** identifiants enregistrés dans la cellule de (x, y) et ses 8 voisines */
  near(x: number, y: number, visit: (id: number) => void): void {
    const ix = Math.floor(x / this.cell);
    const iy = Math.floor(y / this.cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const l = this.map.get(this.key(ix + dx, iy + dy));
        if (l) for (const id of l) visit(id);
      }
  }
  /** enregistre `id` dans toutes les cellules traversées par le segment */
  addSegment(x0: number, y0: number, x1: number, y1: number, id: number): void {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.add(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, id);
    }
  }
}

function cellSizeFor(s: SegmentSoup): number {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < s.count * 4; i += 2) {
    const x = s.coords[i];
    const y = s.coords[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const extent = Math.max(maxX - minX, maxY - minY, 1);
  // ~ 256 cellules sur la plus grande dimension, sans descendre sous 5 mm ni dépasser 2 m
  return Math.min(2000, Math.max(5, extent / 256));
}

/**
 * Fusionne les segments colinéaires qui se chevauchent ou se touchent. Sur une portion couverte par plusieurs
 * segments, on garde un seul trait, du calque de plus grande priorité. Les coordonnées de sortie sont accrochées
 * à la grille ; les segments plus courts que `minLength` disparaissent.
 */
export function mergeCollinear(input: SegmentSoup, opts: CleanOptions = DEFAULT_CLEAN): SegmentSoup {
  const { grid, minLength, tolerance } = opts;
  const n = input.count;
  const c = input.coords;
  const lengths = new Float64Array(n);
  const order: number[] = [];
  for (let i = 0; i < n; i++) {
    const l = Math.hypot(c[i * 4 + 2] - c[i * 4], c[i * 4 + 3] - c[i * 4 + 1]);
    lengths[i] = l;
    if (l >= minLength * 0.5) order.push(i);
  }
  // les plus longs d'abord : ils définissent les droites de support avec le plus de précision
  order.sort((a, b) => lengths[b] - lengths[a]);

  // Regroupement par droite : un segment rejoint le groupe d'un segment déjà traité (plus long) si ses deux
  // extrémités sont à moins de `tolerance` de sa droite. Les groupes reliés par un même segment sont fusionnés.
  const cellGrid = new CellGrid(cellSizeFor(input));
  const parent: number[] = [];
  const find = (a: number): number => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const groupOf = new Int32Array(n).fill(-1);
  const stamp = new Int32Array(n).fill(-1);
  for (let k = 0; k < order.length; k++) {
    const i = order[k];
    const x0 = c[i * 4];
    const y0 = c[i * 4 + 1];
    const x1 = c[i * 4 + 2];
    const y1 = c[i * 4 + 3];
    let group = -1;
    const test = (j: number) => {
      if (stamp[j] === k) return;
      stamp[j] = k;
      const lj = lengths[j];
      const dx = (c[j * 4 + 2] - c[j * 4]) / lj;
      const dy = (c[j * 4 + 3] - c[j * 4 + 1]) / lj;
      const bx = c[j * 4];
      const by = c[j * 4 + 1];
      if (Math.abs((x0 - bx) * dy - (y0 - by) * dx) > tolerance) return;
      if (Math.abs((x1 - bx) * dy - (y1 - by) * dx) > tolerance) return;
      const g = find(groupOf[j]);
      if (group < 0) group = g;
      else if (g !== group) parent[g] = group;
    };
    cellGrid.near(x0, y0, test);
    cellGrid.near(x1, y1, test);
    cellGrid.near((x0 + x1) / 2, (y0 + y1) / 2, test);
    if (group < 0) {
      group = parent.length;
      parent.push(group);
    }
    groupOf[i] = group;
    cellGrid.addSegment(x0, y0, x1, y1, i);
  }
  // droite de chaque groupe : direction du plus long segment (traité en premier), passant par le barycentre
  const members = new Map<number, number[]>();
  for (const i of order) {
    const g = find(groupOf[i]);
    const l = members.get(g);
    if (l) l.push(i);
    else members.set(g, [i]);
  }
  const baseX: number[] = [];
  const baseY: number[] = [];
  const dirX: number[] = [];
  const dirY: number[] = [];
  const lists: number[][] = [];
  for (const list of members.values()) {
    const a = list[0];
    let dx = c[a * 4 + 2] - c[a * 4];
    let dy = c[a * 4 + 3] - c[a * 4 + 1];
    const l = Math.hypot(dx, dy);
    dx /= l;
    dy /= l;
    let sx = 0;
    let sy = 0;
    for (const i of list) {
      sx += c[i * 4] + c[i * 4 + 2];
      sy += c[i * 4 + 1] + c[i * 4 + 3];
    }
    baseX.push(sx / (2 * list.length));
    baseY.push(sy / (2 * list.length));
    dirX.push(dx);
    dirY.push(dy);
    lists.push(list);
  }

  const out = makeSoup(Math.max(16, lists.length));
  // balayage des intervalles de chaque droite
  for (let id = 0; id < lists.length; id++) {
    const list = lists[id];
    const bx = baseX[id];
    const by = baseY[id];
    const dx = dirX[id];
    const dy = dirY[id];
    const emit = (ta: number, tb: number, prio: number, owner: number) => {
      const ax = snap(bx + dx * ta, grid);
      const ay = snap(by + dy * ta, grid);
      const bx2 = snap(bx + dx * tb, grid);
      const by2 = snap(by + dy * tb, grid);
      if (Math.hypot(bx2 - ax, by2 - ay) < minLength) return;
      pushSegment(out, ax, ay, bx2, by2, prio, owner);
    };
    if (list.length === 1) {
      const i = list[0];
      const t0 = (c[i * 4] - bx) * dx + (c[i * 4 + 1] - by) * dy;
      const t1 = (c[i * 4 + 2] - bx) * dx + (c[i * 4 + 3] - by) * dy;
      emit(Math.min(t0, t1), Math.max(t0, t1), input.prio[i], input.owner[i]);
      continue;
    }
    // événements : [t, +1 début / −1 fin, index du segment]
    const ev: Array<[number, number, number]> = [];
    for (const i of list) {
      const t0 = (c[i * 4] - bx) * dx + (c[i * 4 + 1] - by) * dy;
      const t1 = (c[i * 4 + 2] - bx) * dx + (c[i * 4 + 3] - by) * dy;
      ev.push([Math.min(t0, t1), 1, i], [Math.max(t0, t1), -1, i]);
    }
    ev.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
    const count = new Int32Array(256);
    const lastOwner = new Int32Array(256).fill(-1);
    // intervalles actifs par (objet, calque) : on garde l'objet du trait en cours tant qu'il couvre encore la portion
    const active = new Map<number, number>();
    const activeKey = (owner: number, prio: number) => owner * 256 + prio;
    // « run » = plus grand intervalle où le calque gagnant (et son objet) ne change pas
    let runStart = 0;
    let runPrio = -1;
    let runOwner = -1;
    let e = 0;
    while (e < ev.length) {
      const t = ev[e][0];
      // tous les événements à ce t (tolérance : sous la grille = même point)
      while (e < ev.length && ev[e][0] - t <= grid * 0.5) {
        const [, kind, i] = ev[e];
        const p = input.prio[i];
        count[p] += kind;
        if (kind > 0) lastOwner[p] = input.owner[i];
        const ak = activeKey(input.owner[i], p);
        active.set(ak, (active.get(ak) ?? 0) + kind);
        e++;
      }
      let curPrio = -1;
      for (let p = 255; p >= 0; p--)
        if (count[p] > 0) {
          curPrio = p;
          break;
        }
      let curOwner = -1;
      if (curPrio >= 0) {
        if (curPrio === runPrio && (active.get(activeKey(runOwner, curPrio)) ?? 0) > 0) curOwner = runOwner;
        else if ((active.get(activeKey(lastOwner[curPrio], curPrio)) ?? 0) > 0) curOwner = lastOwner[curPrio];
        else
          for (const [k, v] of active)
            if (v > 0 && k % 256 === curPrio) {
              curOwner = Math.floor(k / 256);
              break;
            }
      }
      if (curPrio !== runPrio || curOwner !== runOwner) {
        if (runPrio >= 0) emit(runStart, t, runPrio, runOwner);
        runStart = t;
        runPrio = curPrio;
        runOwner = curOwner;
      }
    }
  }
  return out;
}

/**
 * Nombre de paires de segments colinéaires qui se chevauchent sur plus de `minOverlap` (contrôle qualité :
 * doit valoir 0 après `mergeCollinear`).
 */
export function countCollinearOverlaps(s: SegmentSoup, tolerance = 0.05, minOverlap = 0.1): number {
  const c = s.coords;
  const g = new CellGrid(cellSizeFor(s));
  for (let i = 0; i < s.count; i++) g.addSegment(c[i * 4], c[i * 4 + 1], c[i * 4 + 2], c[i * 4 + 3], i);
  let pairs = 0;
  const seen = new Set<number>();
  for (let i = 0; i < s.count; i++) {
    const x0 = c[i * 4];
    const y0 = c[i * 4 + 1];
    const x1 = c[i * 4 + 2];
    const y1 = c[i * 4 + 3];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l < 1e-9) continue;
    const dx = (x1 - x0) / l;
    const dy = (y1 - y0) / l;
    seen.clear();
    const visit = (j: number) => {
      if (j <= i || seen.has(j)) return;
      seen.add(j);
      const ax = c[j * 4];
      const ay = c[j * 4 + 1];
      const bx = c[j * 4 + 2];
      const by = c[j * 4 + 3];
      if (Math.abs((ax - x0) * dy - (ay - y0) * dx) > tolerance) return;
      if (Math.abs((bx - x0) * dy - (by - y0) * dx) > tolerance) return;
      const ta = (ax - x0) * dx + (ay - y0) * dy;
      const tb = (bx - x0) * dx + (by - y0) * dy;
      const overlap = Math.min(l, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb));
      if (overlap > minOverlap) pairs++;
    };
    const steps = Math.max(1, Math.ceil(l / (g.cell * 0.5)));
    for (let k = 0; k <= steps; k++) g.near(x0 + (x1 - x0) * (k / steps), y0 + (y1 - y0) * (k / steps), visit);
  }
  return pairs;
}

export interface Polyline {
  prio: number;
  owner: number;
  /** [x0, y0, x1, y1, …] */
  points: Float64Array;
}

/** Chaîne les segments qui se touchent (même calque, même objet) en polylignes. */
export function chainPolylines(s: SegmentSoup, grid = DEFAULT_CLEAN.grid): Polyline[] {
  const c = s.coords;
  const groups = new Map<string, number[]>();
  for (let i = 0; i < s.count; i++) {
    const k = `${s.prio[i]}|${s.owner[i]}`;
    const l = groups.get(k);
    if (l) l.push(i);
    else groups.set(k, [i]);
  }
  const key = (x: number, y: number) => `${Math.round(x / grid)},${Math.round(y / grid)}`;
  const out: Polyline[] = [];
  for (const list of groups.values()) {
    const at = new Map<string, number[]>();
    for (const i of list) {
      for (const end of [0, 1]) {
        const k = key(c[i * 4 + end * 2], c[i * 4 + end * 2 + 1]);
        const l = at.get(k);
        if (l) l.push(i);
        else at.set(k, [i]);
      }
    }
    const used = new Set<number>();
    const nextFrom = (k: string): number => {
      const l = at.get(k);
      if (!l) return -1;
      for (const j of l) if (!used.has(j)) return j;
      return -1;
    };
    const walk = (start: number) => {
      used.add(start);
      const pts: number[] = [c[start * 4], c[start * 4 + 1], c[start * 4 + 2], c[start * 4 + 3]];
      // vers l'avant
      for (;;) {
        const k = key(pts[pts.length - 2], pts[pts.length - 1]);
        const j = nextFrom(k);
        if (j < 0) break;
        used.add(j);
        const first = key(c[j * 4], c[j * 4 + 1]) === k;
        pts.push(first ? c[j * 4 + 2] : c[j * 4], first ? c[j * 4 + 3] : c[j * 4 + 1]);
      }
      // vers l'arrière
      for (;;) {
        const k = key(pts[0], pts[1]);
        const j = nextFrom(k);
        if (j < 0) break;
        used.add(j);
        const first = key(c[j * 4], c[j * 4 + 1]) === k;
        pts.unshift(first ? c[j * 4 + 2] : c[j * 4], first ? c[j * 4 + 3] : c[j * 4 + 1]);
      }
      out.push({ prio: s.prio[start], owner: s.owner[start], points: Float64Array.from(pts) });
    };
    // d'abord les extrémités libres (chaînes ouvertes), puis ce qui reste (boucles fermées)
    for (const i of list) {
      if (used.has(i)) continue;
      const k0 = key(c[i * 4], c[i * 4 + 1]);
      const k1 = key(c[i * 4 + 2], c[i * 4 + 3]);
      if ((at.get(k0)?.length ?? 0) !== 2 || (at.get(k1)?.length ?? 0) !== 2) walk(i);
    }
    for (const i of list) if (!used.has(i)) walk(i);
  }
  return out;
}

/** Extrémités et milieux dédupliqués (accroche des cotes). */
export function snapPointsOf(s: SegmentSoup, grid = DEFAULT_CLEAN.grid): Float64Array {
  const seen = new Set<string>();
  const pts: number[] = [];
  const add = (x: number, y: number) => {
    const k = `${Math.round(x / grid)},${Math.round(y / grid)}`;
    if (seen.has(k)) return;
    seen.add(k);
    pts.push(x, y);
  };
  const c = s.coords;
  for (let i = 0; i < s.count; i++) {
    add(c[i * 4], c[i * 4 + 1]);
    add(c[i * 4 + 2], c[i * 4 + 3]);
    add(snap((c[i * 4] + c[i * 4 + 2]) / 2, grid), snap((c[i * 4 + 1] + c[i * 4 + 3]) / 2, grid));
  }
  return Float64Array.from(pts);
}

export function soupBounds(s: SegmentSoup): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < s.count * 4; i += 2) {
    const x = s.coords[i];
    const y = s.coords[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return s.count ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
}
