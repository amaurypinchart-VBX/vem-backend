// Topologie de l'installation, déterministe, depuis l'index de scène et les repères des Viewbox (ModuleFrame) — jamais
// depuis le .dae. Côtés de box (grands / petits, avant / arrière / gauche / droite), jonctions entre box d'un même
// niveau (faces parallèles à ≤ 50 mm, contact ≥ 80 % du plus petit côté, sinon « décalée »), empilage, îlots
// (composantes connexes), pieds (gabarit de la box, fusionnés à ≤ 100 mm), façades (éléments rangés le long de chaque
// côté, vides), puis bases de comptage globales et par îlot. Fonctions pures.
import type { NodeInfo, SceneIndex } from '../../core/types';
import type { ModuleFrame, Vec3 } from '../../core/views';
import { cross, dot, frontVector, neg } from '../../core/views';
import type { CatalogueItem, CountingBase, GlazingRegime } from '../core/types';
import type { ProductAnswers } from './products';
import { countProducts } from './products';
import type {
  BoxSide,
  Count,
  Counts,
  ElementKind,
  FacadeElement,
  FeetSource,
  Foot,
  Island,
  Junction,
  ModuleTopo,
  P2,
  SequenceItem,
  SideLabel,
  Topology,
  TopologyOptions,
  TopologyOverrides,
  TopologyWarning,
} from './types';
import { TOPOLOGY_DEFAULTS } from './types';

/** Largeur d'un panneau de façade Viewbox (mm) : nombre de panneaux équivalents d'une porte coulissante. */
const PANEL_WIDTH = 1130;

const sub2 = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const dot2 = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const add2 = (a: P2, b: P2, s = 1): P2 => [a[0] + b[0] * s, a[1] + b[1] * s];
const len2 = (a: P2) => Math.hypot(a[0], a[1]);
const unit2 = (a: P2): P2 => {
  const l = len2(a) || 1;
  return [a[0] / l, a[1] / l];
};

class UnionFind {
  private p = new Map<string, string>();
  find(a: string): string {
    if (!this.p.has(a)) this.p.set(a, a);
    const r = this.p.get(a)!;
    if (r === a) return a;
    const root = this.find(r);
    this.p.set(a, root);
    return root;
  }
  union(a: string, b: string) {
    const [ra, rb] = [this.find(a), this.find(b)];
    if (ra !== rb) this.p.set(ra < rb ? rb : ra, ra < rb ? ra : rb);
  }
}

// ─── Géométrie d'une box ────────────────────────────────────────────────────────────────────────────────────────

interface Geo {
  id: string;
  frame: ModuleFrame;
  level: number;
  toPlan: (lx: number, ly: number) => P2;
  toLocal: (p: Vec3) => [number, number];
  outline: P2[];
  y: [number, number];
}

function geometry(id: string, f: ModuleFrame, level: number): Geo {
  const toPlan = (lx: number, ly: number): P2 => [f.origin[0] + lx * f.xAxis[0] + ly * f.yAxis[0], f.origin[2] + lx * f.xAxis[2] + ly * f.yAxis[2]];
  const toLocal = (p: Vec3): [number, number] => {
    const d: Vec3 = [p[0] - f.origin[0], p[1] - f.origin[1], p[2] - f.origin[2]];
    return [dot(d, f.xAxis), dot(d, f.yAxis)];
  };
  const [x0, y0, z0] = f.min;
  const [x1, y1, z1] = f.max;
  return {
    id,
    frame: f,
    level,
    toPlan,
    toLocal,
    outline: [toPlan(x0, y0), toPlan(x1, y0), toPlan(x1, y1), toPlan(x0, y1)],
    y: [f.origin[1] + z0 * f.up[1], f.origin[1] + z1 * f.up[1]],
  };
}

const LOCALS = ['+x', '-x', '+y', '-y'] as const;

function sidesOf(g: Geo): BoxSide[] {
  const f = g.frame;
  const [x0, y0] = f.min;
  const [x1, y1] = f.max;
  const F = frontVector(f);
  const right = cross(neg(F), f.up);
  return LOCALS.map((local) => {
    const onX = local[1] === 'x';
    const plus = local[0] === '+';
    const a = onX ? g.toPlan(plus ? x1 : x0, y0) : g.toPlan(x0, plus ? y1 : y0);
    const b = onX ? g.toPlan(plus ? x1 : x0, y1) : g.toPlan(x1, plus ? y1 : y0);
    const axis = onX ? f.xAxis : f.yAxis;
    const n3: Vec3 = plus ? axis : neg(axis);
    const label: SideLabel = local === f.front ? 'avant' : local[1] === f.front[1] ? 'arriere' : dot(n3, right) > 0 ? 'droite' : 'gauche';
    return {
      id: `${g.id}:${local}`,
      moduleId: g.id,
      local,
      kind: (onX ? 'x' : 'y') === f.longAxis ? 'short' : 'long',
      label,
      a,
      b,
      normal: unit2([n3[0], n3[2]]),
      length: len2(sub2(b, a)),
      exposure: 'exterieur' as const,
      junctionIds: [],
      elements: [],
      sequence: [],
    };
  });
}

// ─── Jonctions, empilage, îlots ─────────────────────────────────────────────────────────────────────────────────

function contact(si: BoxSide, sj: BoxSide, o: TopologyOptions) {
  if (dot2(si.normal, sj.normal) > -0.98) return null;
  const gap = dot2(sub2(sj.a, si.a), si.normal);
  if (Math.abs(gap) > o.junctionGap) return null;
  const t = unit2(sub2(si.b, si.a));
  const s1 = dot2(sub2(sj.a, si.a), t);
  const s2 = dot2(sub2(sj.b, si.a), t);
  const lo = Math.max(0, Math.min(s1, s2));
  const hi = Math.min(si.length, Math.max(s1, s2));
  const overlap = hi - lo;
  if (overlap < o.minContact) return null;
  return { gap, overlap, segment: [add2(si.a, t, lo), add2(si.a, t, hi)] as [P2, P2] };
}

/** Aire d'intersection de deux polygones convexes (Sutherland-Hodgman). */
function convexOverlap(a: P2[], b: P2[]): number {
  const area = (p: P2[]) => Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;
  const orient = Math.sign(b.reduce((s, q, i) => s + q[0] * b[(i + 1) % b.length][1] - b[(i + 1) % b.length][0] * q[1], 0)) || 1;
  let out = a;
  for (let i = 0; i < b.length && out.length; i++) {
    const [p, q] = [b[i], b[(i + 1) % b.length]];
    const side = (r: P2) => orient * ((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
    const next: P2[] = [];
    for (let k = 0; k < out.length; k++) {
      const [c, d] = [out[k], out[(k + 1) % out.length]];
      const [sc, sd] = [side(c), side(d)];
      if (sc >= 0) next.push(c);
      if (sc * sd < 0) next.push(add2(c, sub2(d, c), sc / (sc - sd)));
    }
    out = next;
  }
  return out.length >= 3 ? area(out) : 0;
}

const polyArea = (p: P2[]) => Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;

// ─── Pieds ──────────────────────────────────────────────────────────────────────────────────────────────────────

const near = (v: number, ref: number, tol: number) => Math.abs(v - ref) <= tol;

function feetSource(g: Geo, boxRef: string | undefined, catalogue: ReadonlyMap<string, CatalogueItem>): FeetSource & { milieu: number } {
  const c = boxRef ? catalogue.get(boxRef) : undefined;
  if (c?.pieds) return { moduleId: g.id, total: c.pieds.total, from: 'catalogue', ref: boxRef, milieu: c.pieds.milieuParGrandCote };
  const f = g.frame;
  const long = Math.max(f.max[0] - f.min[0], f.max[1] - f.min[1]);
  const short = Math.min(f.max[0] - f.min[0], f.max[1] - f.min[1]);
  // Viewbox standard 5900 = 6 pieds, Viewbox 8,4 m = 8 (Amaury 12.10.2026)
  if (near(short, 2500, 150) && near(long, 5900, 150)) return { moduleId: g.id, total: 6, from: 'taille', ref: boxRef, milieu: 1 };
  if (near(short, 2500, 150) && near(long, 8400, 250)) return { moduleId: g.id, total: 8, from: 'taille', ref: boxRef, milieu: 2 };
  return { moduleId: g.id, total: null, from: 'inconnu', ref: boxRef, milieu: 0 };
}

function boxFeet(g: Geo, milieu: number): { plan: P2; kind: 'angle' | 'milieu' }[] {
  const [x0, y0] = g.frame.min;
  const [x1, y1] = g.frame.max;
  const out: { plan: P2; kind: 'angle' | 'milieu' }[] = [
    { plan: g.toPlan(x0, y0), kind: 'angle' },
    { plan: g.toPlan(x1, y0), kind: 'angle' },
    { plan: g.toPlan(x1, y1), kind: 'angle' },
    { plan: g.toPlan(x0, y1), kind: 'angle' },
  ];
  for (let k = 1; k <= milieu; k++) {
    const t = k / (milieu + 1);
    if (g.frame.longAxis === 'x') {
      const x = x0 + t * (x1 - x0);
      out.push({ plan: g.toPlan(x, y0), kind: 'milieu' }, { plan: g.toPlan(x, y1), kind: 'milieu' });
    } else {
      const y = y0 + t * (y1 - y0);
      out.push({ plan: g.toPlan(x0, y), kind: 'milieu' }, { plan: g.toPlan(x1, y), kind: 'milieu' });
    }
  }
  return out;
}

// ─── Façades ────────────────────────────────────────────────────────────────────────────────────────────────────

function elementKind(n: NodeInfo, c: CatalogueItem | undefined): { kind: ElementKind; porte?: FacadeElement['porte'] } | null {
  const cat = (n.category ?? '').toUpperCase();
  if (cat.startsWith('PORTE') || c?.porte) {
    const porte = cat === 'PORTE-DOUBLE' ? 'double' : cat === 'PORTE-COULISSANTE' ? 'coulissante' : cat === 'PORTE-SIMPLE' ? 'simple' : c?.porte;
    return { kind: 'porte', porte: porte ?? 'simple' };
  }
  if (cat.startsWith('VITRE') || c?.vitrage) return { kind: 'vitre' };
  if (cat.startsWith('MUR') || (c && /\bWALL\b/i.test(c.designation) && !/GLASSWALL/i.test(c.designation))) return { kind: 'mur' };
  return null;
}

function bboxCorners(b: readonly number[]): Vec3[] {
  return [
    [b[0], (b[1] + b[4]) / 2, b[2]],
    [b[3], (b[1] + b[4]) / 2, b[2]],
    [b[0], (b[1] + b[4]) / 2, b[5]],
    [b[3], (b[1] + b[4]) / 2, b[5]],
  ];
}

/** Place un élément sur le côté le plus proche de sa box (≤ facadeDistance), étendue projetée le long du côté. */
function placeElement(g: Geo, sides: BoxSide[], n: NodeInfo, o: TopologyOptions): { side: BoxSide; start: number; end: number; distance: number } | null {
  const b = n.bboxMm!;
  const [lx, ly] = g.toLocal([(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2]);
  const [x0, y0] = g.frame.min;
  const [x1, y1] = g.frame.max;
  const cand: [BoxSide['local'], number, number, number, number][] = [
    ['+x', Math.abs(lx - x1), ly - y0, y0, y1],
    ['-x', Math.abs(lx - x0), ly - y0, y0, y1],
    ['+y', Math.abs(ly - y1), lx - x0, x0, x1],
    ['-y', Math.abs(ly - y0), lx - x0, x0, x1],
  ];
  let best: (typeof cand)[number] | null = null;
  for (const c of cand) {
    const length = c[4] - c[3];
    if (c[1] > o.facadeDistance || c[2] < -o.facadeDistance || c[2] > length + o.facadeDistance) continue;
    if (!best || c[1] < best[1]) best = c;
  }
  if (!best) return null;
  const side = sides.find((s) => s.local === best![0])!;
  const onX = best[0][1] === 'x';
  const params = bboxCorners(b).map((p) => {
    const [px, py] = g.toLocal(p);
    return onX ? py - best![3] : px - best![3];
  });
  const start = Math.max(0, Math.min(...params));
  const end = Math.min(side.length, Math.max(...params));
  return end > start ? { side, start, end, distance: best[1] } : null;
}

function buildSequence(side: BoxSide, o: TopologyOptions): SequenceItem[] {
  const seq: SequenceItem[] = [];
  let cursor = 0;
  side.elements.forEach((e, index) => {
    if (e.start - cursor > o.gapMin) seq.push({ type: 'vide', start: cursor, end: e.start });
    seq.push({ type: 'element', index });
    cursor = Math.max(cursor, e.end);
  });
  if (side.length - cursor > o.gapMin) seq.push({ type: 'vide', start: cursor, end: side.length });
  return seq;
}

// ─── Comptages ──────────────────────────────────────────────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n > 1 ? many : one}`;

function counting(
  t: Omit<Topology, 'counts' | 'islandCounts' | 'warnings'>,
  items: NodeInfo[],
  catalogue: ReadonlyMap<string, CatalogueItem>,
  articleOf: Map<string, string>,
  excluded: Set<string>,
  moduleIds: Set<string>,
  global: boolean,
): Counts {
  const c: Counts = {};
  const set = (k: CountingBase, value: number | null, ids: string[], detail: string) => (c[k] = { value, ids, detail });
  const mods = t.modules.filter((m) => moduleIds.has(m.id));
  set('box', mods.length, mods.map((m) => m.id), plural(mods.length, 'Viewbox', 'Viewbox'));
  // pieds
  const ground = t.feetSources.filter((f) => moduleIds.has(f.moduleId));
  const feet = t.feet.filter((f) => f.members.every((m) => moduleIds.has(m.moduleId)));
  const unknownFeet = ground.filter((f) => f.total === null);
  set(
    'pied',
    unknownFeet.length ? null : feet.length,
    feet.map((f) => f.id),
    unknownFeet.length
      ? `pieds inconnus pour ${unknownFeet.map((f) => f.moduleId).join(', ')} (type de box sans gabarit de pieds)`
      : `${plural(feet.length, 'pied')} au sol (pieds communs fusionnés à ${TOPOLOGY_DEFAULTS.footMerge} mm)`,
  );
  const perBox = ground.reduce((s, f) => s + (f.total ?? 0), 0);
  set('pied_box', unknownFeet.length ? null : perBox, ground.map((f) => f.moduleId), `${perBox} pieds de box (avant fusion)`);
  // jonctions
  const js = t.junctions.filter((j) => moduleIds.has(j.modules[0]) && moduleIds.has(j.modules[1]));
  const jOf = (pred: (j: Junction) => boolean) => js.filter(pred);
  const jSet = (k: CountingBase, list: Junction[], what: string) => set(k, list.length, list.map((j) => j.id), `${plural(list.length, 'jonction')} ${what}`);
  jSet('jonction_box', js, 'entre box');
  jSet('jonction_grand_cote', jOf((j) => j.kind === 'grand_cote'), 'grand côté');
  jSet('jonction_petit_cote', jOf((j) => j.kind === 'petit_cote'), 'petit côté');
  jSet('jonction_toit_grand_cote', jOf((j) => j.roof && j.kind === 'grand_cote'), 'de toit grand côté');
  jSet('jonction_toit_petit_cote', jOf((j) => j.roof && j.kind === 'petit_cote'), 'de toit petit côté');
  set('cote_box_jonction', js.length * 2, js.map((j) => j.id), `${js.length} jonction(s) × 2 côtés`);
  // côtés et façades
  const sides = t.sides.filter((s) => moduleIds.has(s.moduleId));
  const outside = sides.filter((s) => s.exposure !== 'interieur');
  set('cote', outside.length, outside.map((s) => s.id), `${plural(outside.length, 'côté')} de box extérieurs`);
  const glazed = (k: 'long' | 'short') => outside.filter((s) => s.kind === k && s.elements.some((e) => e.kind === 'vitre'));
  set('cote_vitre_court', glazed('short').length, glazed('short').map((s) => s.id), `${plural(glazed('short').length, 'petit côté vitré', 'petits côtés vitrés')}`);
  set('cote_vitre_long', glazed('long').length, glazed('long').map((s) => s.id), `${plural(glazed('long').length, 'grand côté vitré', 'grands côtés vitrés')}`);
  const els = sides.flatMap((s) => s.elements);
  const panels = els.reduce((sum, e) => sum + e.panels, 0);
  set('panneau', panels, els.map((e) => e.nodeId), `${panels} panneaux (murs, vitres, portes ; porte double = 2)`);
  const walls = els.filter((e) => e.kind === 'mur');
  set('panneau_plein', walls.length, walls.map((e) => e.nodeId), plural(walls.length, 'mur plein', 'murs pleins'));
  const pj: string[] = [];
  const gj: string[] = [];
  const term: string[] = [];
  for (const s of sides) {
    const seq = s.sequence;
    for (let i = 0; i < seq.length; i++) {
      const it = seq[i];
      if (it.type !== 'element') continue;
      const e = s.elements[it.index];
      const nextIt = seq[i + 1];
      const prevIt = seq[i - 1];
      const next = nextIt?.type === 'element' ? s.elements[nextIt.index] : null;
      const prev = prevIt?.type === 'element' ? s.elements[prevIt.index] : null;
      // jonction avec une vitre (vitre / vitre ou vitre / porte) = profil plexi ; sans vitre = joint carrosserie
      // (Klokgebouw : 6 / box et 4 / box ; 6060 : « 7 vitres en ligne → 5 »)
      if (next) (e.kind === 'vitre' || next.kind === 'vitre' ? gj : pj).push(`${e.nodeId}|${next.nodeId}`);
      // terminaison d'une vitre contre un poteau (coin, bout de côté, mur ou vide) — pas contre une porte ni une vitre
      // (6060 : 6 terminaisons → square 10 mm 8, + 2 par porte coulissante → 10)
      if (e.kind === 'vitre') {
        if (prev?.kind !== 'vitre' && prev?.kind !== 'porte') term.push(`${e.nodeId}:début`);
        if (next?.kind !== 'vitre' && next?.kind !== 'porte') term.push(`${e.nodeId}:fin`);
      }
    }
  }
  set('jonction_panneau', pj.length, pj, `${plural(pj.length, 'jonction')} entre panneaux sans vitre (mur, porte)`);
  set('jonction_verre', gj.length, gj, `${plural(gj.length, 'jonction')} avec une vitre (vitre / vitre ou vitre / porte)`);
  set('terminaison_vitre', term.length, term, `${plural(term.length, 'terminaison')} de vitre contre un poteau (coin, mur ou vide)`);
  // produits par type (pièces comptées, dans ces box ; toutes les pièces pour le total). Une porte sans référence est
  // comptée par sa catégorie (le type de porte suffit pour les marches)
  const inScope = (n: NodeInfo) => global || (n.moduleId !== null && moduleIds.has(n.moduleId));
  const counted = items.filter((n) => articleOf.has(n.id) && inScope(n));
  for (const [k, type, label, many] of [
    ['porte_simple', 'simple', 'porte simple', 'portes simples'],
    ['porte_double', 'double', 'porte double', 'portes doubles'],
    ['porte_coulissante', 'coulissante', 'porte coulissante', 'portes coulissantes'],
  ] as const) {
    const d = items.filter((n) => !excluded.has(n.id) && inScope(n) && elementKind(n, catalogue.get(articleOf.get(n.id) ?? ''))?.porte === type);
    set(k, d.length, d.map((n) => n.id), plural(d.length, label, many));
  }
  // poteaux : compris dans les standards (7-355-014 / 015 dans 7-962-016) → nombre par box du catalogue, sinon à préciser
  const poleCounts = mods.map((m) => (m.boxRef ? catalogue.get(m.boxRef)?.poteaux : undefined));
  if (poleCounts.every((n) => n !== undefined)) {
    const n = poleCounts.reduce((s, x) => s + (x ?? 0), 0);
    set('poteau', n, mods.map((m) => m.id), `${plural(n, 'poteau')} (compris dans les box)`);
  } else set('poteau', null, mods.map((m) => m.id), `poteaux compris dans les standards : nombre de poteaux par box à préciser`);
  const airco = counted.filter((n) => catalogue.get(articleOf.get(n.id)!)?.hvac);
  set('airco', airco.length, airco.map((n) => n.id), `${plural(airco.length, 'airco')} dessinée(s) dans la 3D`);
  // îlots, toits
  const isl = t.islands.filter((i) => i.moduleIds.every((m) => moduleIds.has(m)));
  set('ilot', isl.length, isl.map((i) => i.id), plural(isl.length, 'îlot'));
  const cov = isl.filter((i) => i.covered);
  set('ilot_couvert', cov.length, cov.map((i) => i.id), plural(cov.length, 'îlot couvert', 'îlots couverts'));
  const tops = mods.filter((m) => m.above.length === 0);
  set('module_toit', tops.length, tops.map((m) => m.id), plural(tops.length, 'toit'));
  set('bord', null, [], 'côtés vers une terrasse ou le vide : pas encore détectés (à saisir)');
  if (global) set('job', 1, [], '1 chantier');
  return c;
}

export function applyOverrides(counts: Counts, overrides: TopologyOverrides = {}): Counts {
  const out: Counts = { ...counts };
  for (const [k, v] of Object.entries(overrides) as [CountingBase, number][]) {
    if (v === undefined || v === null || !Number.isFinite(v)) continue;
    const old = counts[k];
    out[k] = { value: v, ids: old?.ids ?? [], detail: `${v} (saisi à la main${old ? `, détecté : ${old.value ?? '?'}` : ''})`, manual: true, detected: old?.value ?? null };
  }
  return out;
}

export interface BuildInput {
  index: SceneIndex;
  frames: ReadonlyMap<string, ModuleFrame>;
  catalogue: ReadonlyMap<string, CatalogueItem>;
  answers?: ProductAnswers;
  memory?: Readonly<Record<string, string>>;
  overrides?: TopologyOverrides;
  options?: Partial<TopologyOptions>;
}

export function buildTopology(input: BuildInput): Topology {
  const o = { ...TOPOLOGY_DEFAULTS, ...input.options };
  const { index, frames, catalogue } = input;
  const warnings: TopologyWarning[] = [];
  const geos = index.modules.flatMap((m) => {
    const f = frames.get(m.id);
    if (!f) warnings.push({ code: 'NO_FRAME', text: `${m.id} : repère de la box introuvable, ignorée`, ids: [m.id] });
    return f ? [geometry(m.id, f, m.level)] : [];
  });
  const products = countProducts(index, catalogue, input.answers, input.memory);
  const items = index.nodes.filter((n) => n.role === 'item');
  // côtés
  const sides = geos.flatMap(sidesOf);
  const sidesOfModule = (id: string) => sides.filter((s) => s.moduleId === id);
  // empilage
  const above = new Map<string, string[]>(geos.map((g) => [g.id, []]));
  const below = new Map<string, string[]>(geos.map((g) => [g.id, []]));
  for (const u of geos)
    for (const l of geos) {
      if (u === l || Math.abs(u.y[0] - l.y[1]) > 400) continue;
      if (convexOverlap(u.outline, l.outline) >= 0.25 * polyArea(u.outline)) {
        above.get(l.id)!.push(u.id);
        below.get(u.id)!.push(l.id);
      }
    }
  // jonctions
  const junctions: Junction[] = [];
  for (let i = 0; i < geos.length; i++)
    for (let j = i + 1; j < geos.length; j++) {
      const [gi, gj] = [geos[i], geos[j]];
      if (Math.abs(gi.y[0] - gj.y[0]) > 300) continue;
      for (const si of sidesOfModule(gi.id))
        for (const sj of sidesOfModule(gj.id)) {
          const c = contact(si, sj, o);
          if (!c) continue;
          const ratio = c.overlap / Math.min(si.length, sj.length);
          const kind = si.kind === 'long' && sj.kind === 'long' ? 'grand_cote' : si.kind === 'short' && sj.kind === 'short' ? 'petit_cote' : 'mixte';
          const id = `J${junctions.length + 1}`;
          junctions.push({
            id,
            kind,
            modules: [gi.id, gj.id],
            sides: [si.id, sj.id],
            gap: Math.round(c.gap),
            overlap: Math.round(c.overlap),
            ratio,
            offset: ratio < o.alignedRatio,
            roof: above.get(gi.id)!.length === 0 && above.get(gj.id)!.length === 0,
            segment: c.segment,
            y: [Math.min(gi.y[0], gj.y[0]), Math.max(gi.y[1], gj.y[1])],
          });
          si.junctionIds.push(id);
          sj.junctionIds.push(id);
        }
    }
  for (const s of sides) {
    const covered = s.junctionIds.reduce((sum, id) => sum + junctions.find((j) => j.id === id)!.overlap, 0);
    s.exposure = covered >= o.alignedRatio * s.length ? 'interieur' : covered > 0 ? 'partiel' : 'exterieur';
  }
  for (const j of junctions) {
    if (j.kind === 'mixte') warnings.push({ code: 'JUNCTION_MIXED', text: `${j.id} : un grand côté contre un petit côté (${j.modules.join(' / ')}) — compté à part`, ids: [j.id] });
    else if (j.offset)
      warnings.push({ code: 'JUNCTION_OFFSET', text: `${j.id} : box décalées (${j.modules.join(' / ')}, contact ${Math.round(j.ratio * 100)} %)`, ids: [j.id] });
  }
  // îlots
  const uf = new UnionFind();
  for (const g of geos) uf.find(g.id);
  for (const j of junctions) uf.union(j.modules[0], j.modules[1]);
  for (const [l, us] of above) for (const u of us) uf.union(l, u);
  const groups = new Map<string, string[]>();
  for (const g of geos) groups.set(uf.find(g.id), [...(groups.get(uf.find(g.id)) ?? []), g.id]);
  const islands: Island[] = [...groups.values()]
    .map((ids) => ids.sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map((ids, k) => ({
      id: `I${k + 1}`,
      moduleIds: ids,
      regime: ids.length === 1 ? 'standalone' : 'connecte',
      covered: junctions.some((j) => j.roof && ids.includes(j.modules[0])),
      levels: new Set(geos.filter((g) => ids.includes(g.id)).map((g) => g.level)).size,
    }));
  const islandOf = new Map(islands.flatMap((i) => i.moduleIds.map((m) => [m, i.id] as const)));
  // référence de chaque box (pièce 7-962-… ou avec gabarit de pieds dans la box)
  const boxRefOf = new Map<string, string>();
  for (const n of items) {
    const a = products.articleOf.get(n.id);
    if (!a || !n.moduleId) continue;
    if (catalogue.get(a)?.pieds || a.startsWith('7-962-')) boxRefOf.set(n.moduleId, a);
  }
  for (const g of geos)
    if (!boxRefOf.has(g.id)) warnings.push({ code: 'BOX_NO_REF', text: `${g.id} : aucune référence de box (7-962-…) dans le modèle`, ids: [g.id] });
  // pieds : box qui ne reposent pas sur une autre
  const feetSources: FeetSource[] = [];
  const raw: { id: string; plan: P2; y: number; moduleId: string; kind: 'angle' | 'milieu' }[] = [];
  for (const g of geos) {
    if (below.get(g.id)!.length) continue;
    const src = feetSource(g, boxRefOf.get(g.id), catalogue);
    const { milieu, ...source } = src;
    feetSources.push(source);
    if (src.total === null) {
      warnings.push({ code: 'FEET_UNKNOWN', text: `${g.id} : nombre de pieds inconnu pour ce type de box`, ids: [g.id] });
      continue;
    }
    if (src.from === 'taille')
      warnings.push({ code: 'FEET_BY_SIZE', text: `${g.id} : ${src.total} pieds déduits de la taille (pas de référence de box connue)`, ids: [g.id] });
    boxFeet(g, milieu).forEach((p, k) => raw.push({ id: `${g.id}#${k}`, plan: p.plan, y: g.y[0], moduleId: g.id, kind: p.kind }));
  }
  const ufFeet = new UnionFind();
  for (const p of raw) ufFeet.find(p.id);
  for (let i = 0; i < raw.length; i++)
    for (let j = i + 1; j < raw.length; j++)
      if (Math.abs(raw[i].y - raw[j].y) < 300 && len2(sub2(raw[i].plan, raw[j].plan)) <= o.footMerge) ufFeet.union(raw[i].id, raw[j].id);
  const footGroups = new Map<string, typeof raw>();
  for (const p of raw) footGroups.set(ufFeet.find(p.id), [...(footGroups.get(ufFeet.find(p.id)) ?? []), p]);
  const feet: Foot[] = [...footGroups.values()].map((ps, k) => {
    const kinds = new Set(ps.map((p) => p.kind));
    return {
      id: `F${k + 1}`,
      plan: [ps.reduce((s, p) => s + p.plan[0], 0) / ps.length, ps.reduce((s, p) => s + p.plan[1], 0) / ps.length],
      y: ps[0].y,
      members: ps.map((p) => ({ moduleId: p.moduleId, kind: p.kind })),
      kind: kinds.size > 1 ? 'mixte' : [...kinds][0],
    };
  });
  // façades
  const geoById = new Map(geos.map((g) => [g.id, g]));
  const excludedEarly = new Set([...products.mirrorIds, ...products.ignored, ...products.boxParts]);
  const unplaced: string[] = [];
  for (const n of items) {
    if (excludedEarly.has(n.id) || !n.bboxMm) continue;
    const article = products.articleOf.get(n.id);
    const cat = article ? catalogue.get(article) : undefined;
    const k = elementKind(n, cat);
    if (!k) continue;
    const candidates = n.moduleId && geoById.has(n.moduleId) ? [geoById.get(n.moduleId)!] : geos;
    let placed: ReturnType<typeof placeElement> = null;
    for (const g of candidates) {
      const p = placeElement(g, sidesOfModule(g.id), n, o);
      if (p && (!placed || p.distance < placed.distance)) placed = p;
    }
    if (!placed) {
      unplaced.push(n.id);
      continue;
    }
    const len = placed.end - placed.start;
    placed.side.elements.push({
      nodeId: n.id,
      article,
      category: n.category,
      kind: k.kind,
      porte: k.porte,
      vitrage: cat?.vitrage,
      start: Math.round(placed.start),
      end: Math.round(placed.end),
      panels: k.porte === 'double' ? 2 : k.porte === 'coulissante' ? Math.max(1, Math.round(len / PANEL_WIDTH)) : 1,
    });
  }
  if (unplaced.length) warnings.push({ code: 'FACADE_UNPLACED', text: `${unplaced.length} élément(s) de façade loin de tout côté de box : non comptés dans les façades`, ids: unplaced });
  for (const s of sides) {
    s.elements.sort((a, b) => a.start - b.start);
    s.sequence = buildSequence(s, o);
    if (s.exposure === 'interieur' && s.elements.length)
      warnings.push({ code: 'FACADE_INSIDE', text: `${s.id} : ${s.elements.length} élément(s) sur un côté contre une autre box`, ids: s.elements.map((e) => e.nodeId) });
  }
  // vitrages présents
  const glazing = [...new Set(products.lines.map((l) => catalogue.get(l.article)?.vitrage).filter((v): v is GlazingRegime => !!v))].sort();
  if (glazing.length > 1) warnings.push({ code: 'GLAZING_MIXED', text: `Plusieurs régimes de vitrage : ${glazing.join(', ')}` });
  const levels = new Set(geos.map((g) => g.level)).size;
  if (levels > 1) warnings.push({ code: 'MULTI_LEVEL', text: `${levels} niveaux : le multi-niveaux n’a jamais été calé, les règles « étage » sortent en « règle manquante »` });
  for (const u of products.unknown)
    warnings.push({ code: 'PRODUCT_UNKNOWN', text: `À identifier : ${u.label} (${u.nodeIds.length} pièce(s))`, ids: u.nodeIds });
  for (const l of products.lines) if (!l.inCatalogue) warnings.push({ code: 'PRODUCT_NOT_IN_CATALOGUE', text: `${l.article} : référence absente du catalogue`, ids: l.nodeIds });
  const modules: ModuleTopo[] = geos.map((g) => {
    const f = g.frame;
    const dx = f.max[0] - f.min[0];
    const dy = f.max[1] - f.min[1];
    return {
      id: g.id,
      level: g.level,
      outline: g.outline,
      y: g.y,
      long: Math.round(Math.max(dx, dy)),
      short: Math.round(Math.min(dx, dy)),
      above: above.get(g.id)!,
      below: below.get(g.id)!,
      islandId: islandOf.get(g.id)!,
      boxRef: boxRefOf.get(g.id),
    };
  });
  const base = { schema: 'vem-loading-topology/1' as const, modules, sides, junctions, islands, feet, feetSources, products: products.lines, unknown: products.unknown, glazing, levels };
  const all = new Set(geos.map((g) => g.id));
  const excluded = excludedEarly;
  const counts = applyOverrides(counting(base, items, catalogue, products.articleOf, excluded, all, true), input.overrides);
  const islandCounts: Record<string, Counts> = {};
  for (const isl of islands) islandCounts[isl.id] = counting(base, items, catalogue, products.articleOf, excluded, new Set(isl.moduleIds), false);
  return { ...base, counts, islandCounts, warnings };
}

const v = (c: Count | undefined) => c?.value ?? 0;

/** « 4 Viewbox · 1 niveau · 1 îlot · 3 jonctions grand côté · 15 pieds · 1 porte double · vitrage seamless 8.8.2 (13 vitres) · couvert : oui ». */
export function topologySummary(t: Topology, catalogue?: ReadonlyMap<string, CatalogueItem>): string {
  const c = t.counts;
  const parts = [plural(v(c.box), 'Viewbox', 'Viewbox'), plural(t.levels, 'niveau', 'niveaux'), plural(v(c.ilot), 'îlot')];
  if (!v(c.jonction_box)) parts.push('standalone (aucune jonction)');
  if (v(c.jonction_grand_cote)) parts.push(plural(v(c.jonction_grand_cote), 'jonction grand côté', 'jonctions grand côté'));
  if (v(c.jonction_petit_cote)) parts.push(plural(v(c.jonction_petit_cote), 'jonction petit côté', 'jonctions petit côté'));
  const mixed = t.junctions.filter((j) => j.kind === 'mixte').length;
  if (mixed) parts.push(plural(mixed, 'jonction grand / petit côté', 'jonctions grand / petit côté'));
  parts.push(c.pied?.value === null ? 'pieds : à préciser' : plural(v(c.pied), 'pied'));
  for (const [k, label, many] of [
    ['porte_simple', 'porte simple', 'portes simples'],
    ['porte_double', 'porte double', 'portes doubles'],
    ['porte_coulissante', 'porte coulissante', 'portes coulissantes'],
  ] as const)
    if (v(c[k])) parts.push(plural(v(c[k]), label, many));
  for (const g of t.glazing) {
    const n = t.products.filter((l) => catalogue?.get(l.article)?.vitrage === g).reduce((s, l) => s + l.qty, 0);
    parts.push(`vitrage ${g === '10mm' ? '10 mm' : g} (${plural(n, 'vitre')})`);
  }
  parts.push(`couvert : ${v(c.ilot_couvert) ? (v(c.ilot_couvert) === v(c.ilot) ? 'oui' : `${v(c.ilot_couvert)} îlot(s) sur ${v(c.ilot)}`) : 'non'}`);
  return parts.join(' · ');
}
