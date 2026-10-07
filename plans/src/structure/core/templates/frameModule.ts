// Gabarit générique d'un type de module « comme une Viewbox » (S12) : barres explicites (`FrameLayout`) dans le repère du
// gabarit (u grand côté, v petit côté, z vers le haut, origine au coin extérieur bas, mm). Produit la même interface que
// `viewboxTemplate` (nœuds, barres, côtés, cases de plancher, angles, pieds) pour que l'assemblage, les charges, le
// calage… fonctionnent sans changement. Les barres sont coupées à chaque attache (extrémité d'une autre barre sur leur
// axe, croisement à 10 mm près), les rives aussi aux perçages (boulons, contacts) et aux jonctions en T entre modules.
// `viewboxPresetFrame` décrit la Viewbox 5900 EU en barres : `frameTemplate` de ce préréglage redonne exactement
// `viewboxTemplate` (test d'équivalence). Fonctions pures.
import type { EndSpec } from '../fem/types';
import type { DeckSpec, FrameBar, FrameEnd, FrameFoot, FrameLayout, FrameRole, ViewboxTemplateParams } from '../library';
import type { RimExtras, Side, TemplateFace, TemplateFamily, TemplateMember, TemplatePanel, ViewboxTemplate } from './viewboxEU';
import { nodeKey, uniq, viewboxTemplate } from './viewboxEU';

type P3 = [number, number, number];
export type FrameParams = ViewboxTemplateParams & { frame: FrameLayout };

/** tolérance d'attache : extrémité sur l'axe d'une autre barre, croisement de deux barres (mm) */
export const FRAME_TOL = 10;
const SIDES: Side[] = ['u0', 'u1', 'v0', 'v1'];
const PINNED: EndSpec = ['rigid', 'rigid', 'rigid', 'rigid', 'free', 'free'];

/** Aiguillage unique : structure explicite (`params.frame`) ou gabarit Viewbox. */
export function moduleTemplate(p: ViewboxTemplateParams, extras: RimExtras = {}): ViewboxTemplate {
  return p.frame ? frameTemplate(p as FrameParams, extras) : viewboxTemplate(p, extras);
}

export function endSpec(e: FrameEnd | undefined): EndSpec | undefined {
  if (!e || e === 'rigid') return undefined;
  if (e === 'pinned') return PINNED;
  return ['rigid', 'rigid', 'rigid', 'rigid', e.semi, e.semi];
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: P3) => Math.hypot(a[0], a[1], a[2]);

/** Paramètre t et distance du point p à l'axe a → b (t non borné). */
function project(p: P3, a: P3, b: P3): { t: number; d: number } {
  const ab = sub(b, a);
  const L2 = dot(ab, ab);
  const t = L2 > 0 ? dot(sub(p, a), ab) / L2 : 0;
  const q: P3 = [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]];
  return { t, d: len(sub(p, q)) };
}

/** Points les plus proches de deux segments (paramètres s, t) et leur distance. */
function closest(a: P3, b: P3, c: P3, d: P3): { s: number; t: number; dist: number; p: P3 } {
  const u = sub(b, a);
  const v = sub(d, c);
  const w = sub(a, c);
  const A = dot(u, u);
  const B = dot(u, v);
  const C = dot(v, v);
  const D = dot(u, w);
  const E = dot(v, w);
  const den = A * C - B * B;
  if (den < 1e-9 * A * C) return { s: NaN, t: NaN, dist: Infinity, p: a };
  const s = (B * E - C * D) / den;
  const t = (A * E - B * D) / den;
  const p: P3 = [a[0] + s * u[0], a[1] + s * u[1], a[2] + s * u[2]];
  const q: P3 = [c[0] + t * v[0], c[1] + t * v[1], c[2] + t * v[2]];
  return { s, t, dist: len(sub(p, q)), p };
}

/** Côté d'une rive horizontale parallèle à un côté du module (null : barre intérieure). */
export function rimSide(bar: Pick<FrameBar, 'a' | 'b' | 'side'>, p: Pick<ViewboxTemplateParams, 'x0' | 'x1' | 'y0' | 'y1'>, tol = FRAME_TOL): Side | null {
  if (bar.side) return bar.side;
  const [a, b] = [bar.a, bar.b];
  if (Math.abs(a[1] - b[1]) <= tol) {
    if (Math.abs(a[1] - p.y0) <= tol && Math.abs(b[1] - p.y0) <= tol) return 'v0';
    if (Math.abs(a[1] - p.y1) <= tol && Math.abs(b[1] - p.y1) <= tol) return 'v1';
  }
  if (Math.abs(a[0] - b[0]) <= tol) {
    if (Math.abs(a[0] - p.x0) <= tol && Math.abs(b[0] - p.x0) <= tol) return 'u0';
    if (Math.abs(a[0] - p.x1) <= tol && Math.abs(b[0] - p.x1) <= tol) return 'u1';
  }
  return null;
}

const levelOf = (role: FrameRole): 'floor' | 'roof' | null => (/-floor$/.test(role) ? 'floor' : /-roof$/.test(role) ? 'roof' : null);

/** Famille de calcul d'une barre du frame. */
export function frameFamily(bar: FrameBar, feet: readonly FrameFoot[]): TemplateFamily {
  switch (bar.role) {
    case 'rim-floor':
    case 'rim-roof':
      return bar.role;
    case 'transverse-floor':
    case 'stringer-floor':
      return 'secondary-floor';
    case 'transverse-roof':
    case 'stringer-roof':
      return 'secondary-roof';
    case 'column':
      return 'column';
    case 'brace':
      return 'frame-brace';
    case 'foot': {
      if (bar.footPart) return bar.footPart === 'corner' ? 'foot-corner' : bar.footPart === 'plate' ? 'foot-plate' : 'foot-middle';
      const near = (q: P3) => feet.find((f) => Math.hypot(f.u - q[0], f.v - q[1]) <= FRAME_TOL);
      const f = near(bar.a) ?? near(bar.b);
      if (f?.kind === 'middle') return 'foot-middle';
      const diag = Math.abs(bar.a[0] - bar.b[0]) > FRAME_TOL && Math.abs(bar.a[1] - bar.b[1]) > FRAME_TOL;
      return diag ? 'foot-corner' : 'foot-plate';
    }
    default:
      return 'frame-other';
  }
}

/** Barre physique par défaut (mêmes clés que `viewboxTemplate` pour les rives, traverses, lisses et poteaux d'angle). */
function defaultLine(bar: FrameBar, side: Side | null): string {
  const lvl = levelOf(bar.role);
  if ((bar.role === 'rim-floor' || bar.role === 'rim-roof') && side) return `${lvl}:${side}`;
  if (bar.role === 'transverse-floor' || bar.role === 'transverse-roof') return `${lvl}:t${Math.round((bar.a[0] + bar.b[0]) / 2)}`;
  if (bar.role === 'stringer-floor' || bar.role === 'stringer-roof') return `${lvl}:l${Math.round((bar.a[1] + bar.b[1]) / 2)}`;
  if (bar.role === 'column') return bar.corner !== undefined ? `column:${bar.corner}` : `column:${bar.id}`;
  if (bar.role === 'foot') return `foot:${bar.id}`;
  if (bar.role === 'brace') return `brace:${bar.id}`;
  return `other:${bar.id}`;
}

export function frameTemplate(p: FrameParams, extras: RimExtras = {}): ViewboxTemplate {
  const fr = p.frame;
  const { x0, x1, y0, y1 } = p;
  // poteaux orientés du bas vers le haut (contrôle d'angle : « pied » = nœud i, « tête » = nœud j)
  const bars = fr.bars
    .filter((b) => b.role !== 'none')
    .map((b) => (b.role === 'column' && b.a[2] > b.b[2] ? { ...b, a: b.b, b: b.a, ...(b.ends ? { ends: [b.ends[1], b.ends[0]] as [FrameEnd, FrameEnd] } : {}) } : b));
  const sides = bars.map((b) => (b.role === 'rim-floor' || b.role === 'rim-roof' ? rimSide(b, p) : null));
  // ─── points d'attache de chaque barre (coordonnées exactes, triés le long de la barre) ───
  const pts: P3[][] = bars.map((b) => [b.a, b.b]);
  const addOn = (k: number, q: P3) => {
    const b = bars[k];
    const { t, d } = project(q, b.a, b.b);
    const L = len(sub(b.b, b.a));
    if (d <= FRAME_TOL && t * L > 0.5 && (1 - t) * L > 0.5) pts[k].push(q);
  };
  bars.forEach((b, k) =>
    bars.forEach((c, j) => {
      if (j === k) return;
      // extrémité de c sur l'axe de b (jonction en T)
      addOn(k, c.a);
      addOn(k, c.b);
      // croisement intérieur aux deux barres (pas entre deux diagonales en traction seule : un nœud tenu par deux
      // barres détendues serait un mécanisme)
      if (j > k && !(b.tensionOnly && c.tensionOnly)) {
        const x = closest(b.a, b.b, c.a, c.b);
        const [Lb, Lc] = [len(sub(b.b, b.a)), len(sub(c.b, c.a))];
        if (x.dist <= FRAME_TOL && x.s * Lb > 0.5 && (1 - x.s) * Lb > 0.5 && x.t * Lc > 0.5 && (1 - x.t) * Lc > 0.5) {
          pts[k].push(x.p);
          pts[j].push(x.p);
        }
      }
    }),
  );
  // rives : perçages (boulons, contacts verticaux), jonctions en T entre modules, pieds posés sur la rive
  const rimFixed = (side: Side) => (side === 'u0' ? x0 : side === 'u1' ? x1 : side === 'v0' ? y0 : y1);
  const rimPoint = (side: Side, s: number, z: number): P3 => (side === 'v0' || side === 'v1' ? [s, rimFixed(side), z] : [rimFixed(side), s, z]);
  bars.forEach((b, k) => {
    const side = sides[k];
    if (!side) return;
    const z = (b.a[2] + b.b[2]) / 2;
    const long = side === 'v0' || side === 'v1';
    const along = [...(long ? [...p.boltLongX, ...(p.verticalContactX ?? [])] : p.boltShortY), ...(extras[side] ?? [])];
    for (const s of along) addOn(k, rimPoint(side, s, z));
  });
  for (const f of fr.feet) {
    const z = f.z ?? p.floorZ;
    bars.forEach((_, k) => addOn(k, [f.u, f.v, z]));
    // pied central : nœud sur la rive du grand côté le plus proche (cale posée sous la rive, ou réception centrale)
    if (f.kind === 'middle') {
      const side: Side = Math.abs(f.v - y0) <= Math.abs(f.v - y1) ? 'v0' : 'v1';
      bars.forEach((b, k) => {
        if (b.role === 'rim-floor' && sides[k] === side) addOn(k, rimPoint(side, f.u, z));
      });
    }
  }

  // ─── nœuds et barres (dans l'ordre des barres, de a vers b : même numérotation que viewboxTemplate pour le préréglage) ───
  const nodes = new Map<string, { key: string; u: number; v: number; z: number }>();
  const node = (q: P3) => {
    const k = nodeKey(q[0], q[1], q[2]);
    if (!nodes.has(k)) nodes.set(k, { key: k, u: q[0], v: q[1], z: q[2] });
    return k;
  };
  const members: TemplateMember[] = [];
  const colModel = fr.joints.column;
  const colEnd: FrameEnd = colModel.model === 'semi' ? { semi: colModel.stiffness ?? p.springs.columnRotation } : colModel.model;
  bars.forEach((b, k) => {
    const ab = sub(b.b, b.a);
    const L2 = dot(ab, ab);
    const list = pts[k]
      .map((q) => ({ q, t: dot(sub(q, b.a), ab) / L2 }))
      .sort((m, n) => m.t - n.t)
      .filter((m, i, arr) => i === 0 || nodeKey(...m.q) !== nodeKey(...arr[i - 1].q));
    const family = frameFamily(b, fr.feet);
    const line = b.line ?? defaultLine(b, sides[k]);
    const section = b.grade ? `${b.section}@${b.grade}` : b.section;
    const secondary = /^(transverse|stringer)-/.test(b.role);
    const [eA, eB]: [FrameEnd | undefined, FrameEnd | undefined] = b.ends ?? (b.role === 'column' ? [colEnd, colEnd] : secondary && fr.joints.secondary.model === 'pinned' ? ['pinned', 'pinned'] : [undefined, undefined]);
    for (let x = 0; x + 1 < list.length; x++) {
      const m: TemplateMember = { family, section, i: node(list[x].q), j: node(list[x + 1].q), line };
      const ei = x === 0 ? endSpec(eA) : undefined;
      const ej = x + 2 === list.length ? endSpec(eB) : undefined;
      if (ei) m.endI = ei;
      if (ej) m.endJ = ej;
      if (b.roll) m.roll = b.roll;
      if (b.role === 'column') m.joint = colModel.model === 'semi' ? 'corner' : 'none';
      if (b.tensionOnly) m.tensionOnly = true;
      members.push(m);
    }
  });

  // ─── côtés : nœuds de rive triés le long du côté ───
  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  const rimNodes = (side: Side, lvl: 'floor' | 'roof') => {
    const keys = new Set<string>();
    members.filter((m) => m.line === `${lvl}:${side}`).forEach((m) => keys.add(m.i).add(m.j));
    const alongU = side === 'v0' || side === 'v1';
    return [...keys].sort((a, b) => {
      const [na, nb] = [nodes.get(a)!, nodes.get(b)!];
      return alongU ? na.u - nb.u : na.v - nb.v;
    });
  };
  const missing: string[] = [];
  const face = (side: Side): TemplateFace => {
    const alongU = side === 'v0' || side === 'v1';
    const fixed = rimFixed(side);
    const at = (s: number, z: number) => (alongU ? nodeKey(s, fixed, z) : nodeKey(fixed, s, z));
    const [a, b] = alongU ? [x0, x1] : [y0, y1];
    const rimFloor = rimNodes(side, 'floor');
    const rimRoof = rimNodes(side, 'roof');
    for (const [lvl, list, z] of [
      ['plancher', rimFloor, p.floorZ],
      ['toiture', rimRoof, p.roofZ],
    ] as const)
      if (!list.includes(at(a, z)) || !list.includes(at(b, z))) missing.push(`rive ${lvl} ${side}`);
    return {
      side,
      cornersFloor: [at(a, p.floorZ), at(b, p.floorZ)],
      cornersRoof: [at(a, p.roofZ), at(b, p.roofZ)],
      bolts: (alongU ? p.boltLongX : p.boltShortY).map((s) => ({ floor: at(s, p.floorZ), roof: at(s, p.roofZ), s: s - a })),
      contacts: (alongU ? (p.verticalContactX ?? []) : []).map((s) => ({ floor: at(s, p.floorZ), roof: at(s, p.roofZ), s: s - a })),
      rimFloor,
      rimRoof,
      length: b - a,
    };
  };
  const faces = SIDES.map(face);
  if (missing.length) throw new Error(`Structure du type incomplète : ${missing.join(', ')} absente(s) ou n'allant pas d'un angle à l'autre.`);

  // ─── cases de plancher / toiture : lignes de la grille de chaque niveau ───
  const panels: TemplatePanel[] = [];
  for (const level of ['floor', 'roof'] as const) {
    const t = bars.filter((b) => b.role === `transverse-${level}` && Math.abs(b.a[0] - b.b[0]) <= FRAME_TOL).map((b) => (b.a[0] + b.b[0]) / 2);
    const l = bars.filter((b) => b.role === `stringer-${level}` && Math.abs(b.a[1] - b.b[1]) <= FRAME_TOL).map((b) => (b.a[1] + b.b[1]) / 2);
    const us = uniq([x0, x1, ...t]);
    const vs = uniq([y0, y1, ...l]);
    const deck: DeckSpec | null = level === 'floor' ? fr.deck.floor : fr.deck.roof;
    const span = deck && deck.span !== 'two-way' ? deck.span : undefined;
    for (let a = 0; a + 1 < us.length; a++)
      for (let b = 0; b + 1 < vs.length; b++) panels.push({ level, u0: us[a], u1: us[a + 1], v0: vs[b], v1: vs[b + 1], ...(span ? { span } : {}) });
  }

  // ─── pieds : nœud existant le plus proche au plancher ───
  const nodeNear = (u: number, v: number, z: number) => {
    const k = nodeKey(u, v, z);
    if (nodes.has(k)) return k;
    let best = '';
    let bd = Infinity;
    for (const n of nodes.values()) {
      if (Math.abs(n.z - z) > FRAME_TOL) continue;
      const d = Math.hypot(n.u - u, n.v - v);
      if (d < bd) [best, bd] = [n.key, d];
    }
    return best;
  };
  const cornerFeet = fr.feet.filter((f) => f.kind === 'corner').sort((a, b) => (a.corner ?? 0) - (b.corner ?? 0));
  const otherFeet = fr.feet.filter((f) => f.kind === 'other');
  const middle = fr.feet.filter((f) => f.kind === 'middle');
  const footNodes = [...cornerFeet, ...otherFeet].map((f) => nodeNear(f.u, f.v, f.z ?? p.floorZ));
  const middleFeet = middle.map((f) => nodeNear(f.u, f.v, f.z ?? p.floorZ));
  const middleRim = middle.map((f) => {
    const v = Math.abs(f.v - y0) <= Math.abs(f.v - y1) ? y0 : y1;
    return nodeNear(f.u, v, f.z ?? p.floorZ);
  });
  return {
    nodes: [...nodes.values()],
    members,
    faces,
    panels,
    cornerFloor: corners.map(([u, v]) => nodeKey(u, v, p.floorZ)),
    cornerRoof: corners.map(([u, v]) => nodeKey(u, v, p.roofZ)),
    footNodes: footNodes.length ? footNodes : corners.map(([u, v]) => nodeKey(u, v, p.floorZ)),
    middleFeet,
    middleRim,
    params: p,
  };
}

/** Viewbox 5900 EU décrite en barres explicites (préréglage « Partir de la Viewbox 5900 » de l'atelier). */
export function viewboxPresetFrame(p: ViewboxTemplateParams): FrameLayout {
  const { x0, x1, y0, y1 } = p;
  const bars: FrameBar[] = [];
  const bar = (b: Omit<FrameBar, 'source'>) => bars.push({ ...b, source: { sectionStatus: 'library' } });
  for (const [lvl, z] of [
    ['floor', p.floorZ],
    ['roof', p.roofZ],
  ] as const) {
    const floor = lvl === 'floor';
    const rim = floor ? p.sections.rim : (p.sections.rimRoof ?? p.sections.rim);
    const sec = floor ? p.sections.secondary : (p.sections.secondaryRoof ?? p.sections.secondary);
    const role = (r: 'rim' | 'transverse' | 'stringer') => `${r}-${lvl}` as FrameRole;
    bar({ id: `R-${lvl}-v0`, role: role('rim'), a: [x0, y0, z], b: [x1, y0, z], section: rim, side: 'v0' });
    bar({ id: `R-${lvl}-v1`, role: role('rim'), a: [x0, y1, z], b: [x1, y1, z], section: rim, side: 'v1' });
    bar({ id: `R-${lvl}-u0`, role: role('rim'), a: [x0, y0, z], b: [x0, y1, z], section: rim, side: 'u0' });
    bar({ id: `R-${lvl}-u1`, role: role('rim'), a: [x1, y0, z], b: [x1, y1, z], section: rim, side: 'u1' });
    for (const u of p.transverseX) bar({ id: `T-${lvl}-${Math.round(u)}`, role: role('transverse'), a: [u, y0, z], b: [u, y1, z], section: sec });
    for (const v of p.longitudinalY) bar({ id: `L-${lvl}-${Math.round(v)}`, role: role('stringer'), a: [x0, v, z], b: [x1, v, z], section: sec });
  }
  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  corners.forEach(([u, v], c) => bar({ id: `P-${c}`, role: 'column', a: [u, v, p.floorZ], b: [u, v, p.roofZ], section: p.sections.column, corner: c as 0 | 1 | 2 | 3 }));
  const feetU = [x0 + p.footOffset, x1 - p.footOffset];
  const feetV = [y0 + p.footOffset, y1 - p.footOffset];
  const feet: FrameFoot[] = [];
  corners.forEach(([u, v], c) => {
    const fu = u === x0 ? feetU[0] : feetU[1];
    const fv = v === y0 ? feetV[0] : feetV[1];
    const z = p.floorZ;
    feet.push({ id: `F-${c}`, u: fu, v: fv, kind: 'corner', corner: c as 0 | 1 | 2 | 3 });
    bar({ id: `FT-${c}`, role: 'foot', footPart: 'corner', a: [fu, fv, z], b: [u, v, z], section: p.sections.footCorner, line: `foot:${c}` });
    bar({ id: `FP-${c}-u`, role: 'foot', footPart: 'plate', a: [fu, fv, z], b: [fu, v, z], section: p.sections.footPlate, line: `footplate:${c}:u` });
    bar({ id: `FP-${c}-v`, role: 'foot', footPart: 'plate', a: [fu, fv, z], b: [u, fv, z], section: p.sections.footPlate, line: `footplate:${c}:v` });
  });
  for (const [v, fv] of [
    [y0, feetV[0]],
    [y1, feetV[1]],
  ]) {
    feet.push({ id: `FM-${Math.round(v)}`, u: p.middleFootX, v: fv, kind: 'middle' });
    bar({ id: `FM-${Math.round(v)}`, role: 'foot', footPart: 'middle', a: [p.middleFootX, fv, p.floorZ], b: [p.middleFootX, v, p.floorZ], section: p.sections.footMiddle, line: `footmid:${Math.round(v)}` });
  }
  const deck = (layers: number): DeckSpec => ({ material: p.plywood.material, thickness: p.plywood.thickness, layers, span: 'two-way', maxSpan: p.plywood.maxSpan });
  return {
    v: 1,
    origin: 'preset-viewbox',
    bars,
    feet,
    deck: { floor: deck(p.plywood.floorLayers), roof: p.plywood.roofLayers ? deck(p.plywood.roofLayers) : null },
    joints: { column: { model: 'semi', stiffness: p.springs.columnRotation }, secondary: { model: 'rigid' }, side: { model: 'bolts' } },
  };
}

/** Grille paramétrique (modèle sans profils dessinés) : description simple d'une box rectangulaire. */
export interface ParametricSpec {
  /** dimensions hors tout en plan (mm) et retrait des lignes de système des rives depuis la face extérieure */
  long: number;
  short: number;
  inset: number;
  /** lignes de système : toiture, haut de poteau (= plancher du module du dessus) ; plancher à z = 0 */
  roofZ: number;
  topZ: number;
  sections: {
    rimFloorLong: string;
    rimFloorShort: string;
    rimRoofLong: string;
    rimRoofShort: string;
    transverseFloor: string;
    transverseRoof: string;
    stringerFloor?: string;
    stringerRoof?: string;
    column: string;
  };
  /** traverses : nombre (réparties) ou abscisses u (mm) */
  transversesFloor: number | number[];
  transversesRoof: number | number[];
  /** lisses : ordonnées v (mm), vide = aucune */
  stringersFloor: number[];
  stringersRoof: number[];
  /** poteaux intermédiaires par grand côté (0, 1 ou 2) */
  intermediateColumns: 0 | 1 | 2;
  /** pieds centraux des grands côtés (sous la rive) */
  middleFeet: boolean;
  columnModel: FrameLayout['joints']['column'];
  secondaryModel: 'rigid' | 'pinned';
  sideModel: FrameLayout['joints']['side']['model'];
  floor: DeckSpec | null;
  roof: DeckSpec | null;
  /** liaisons de calcul (barres équivalentes sans masse) et raideurs ; défaut = celles de la Viewbox */
  base: Pick<ViewboxTemplateParams, 'sections' | 'springs' | 'plywood'>;
}

/** Positions réparties de n barres entre a et b (bornes exclues). */
const spread = (n: number, a: number, b: number) => Array.from({ length: n }, (_, k) => a + ((b - a) * (k + 1)) / (n + 1));

export function parametricFrame(s: ParametricSpec): FrameParams {
  const x0 = s.inset;
  const x1 = s.long - s.inset;
  const y0 = s.inset;
  const y1 = s.short - s.inset;
  const tr = (t: number | number[]) => (Array.isArray(t) ? [...t] : spread(t, x0, x1)).map((u) => Math.round(u));
  const tf = tr(s.transversesFloor);
  const tR = tr(s.transversesRoof);
  const bars: FrameBar[] = [];
  const user = { sectionStatus: 'user' as const };
  for (const [lvl, z] of [
    ['floor', 0],
    ['roof', s.roofZ],
  ] as const) {
    const floor = lvl === 'floor';
    const rl = floor ? s.sections.rimFloorLong : s.sections.rimRoofLong;
    const rs = floor ? s.sections.rimFloorShort : s.sections.rimRoofShort;
    const role = `rim-${lvl}` as FrameRole;
    bars.push({ id: `R-${lvl}-v0`, role, a: [x0, y0, z], b: [x1, y0, z], section: rl, side: 'v0', source: user });
    bars.push({ id: `R-${lvl}-v1`, role, a: [x0, y1, z], b: [x1, y1, z], section: rl, side: 'v1', source: user });
    bars.push({ id: `R-${lvl}-u0`, role, a: [x0, y0, z], b: [x0, y1, z], section: rs, side: 'u0', source: user });
    bars.push({ id: `R-${lvl}-u1`, role, a: [x1, y0, z], b: [x1, y1, z], section: rs, side: 'u1', source: user });
    for (const u of floor ? tf : tR) bars.push({ id: `T-${lvl}-${u}`, role: `transverse-${lvl}` as FrameRole, a: [u, y0, z], b: [u, y1, z], section: floor ? s.sections.transverseFloor : s.sections.transverseRoof, source: user });
    const st = floor ? s.stringersFloor : s.stringersRoof;
    const ss = (floor ? s.sections.stringerFloor : s.sections.stringerRoof) ?? (floor ? s.sections.transverseFloor : s.sections.transverseRoof);
    for (const v of st) bars.push({ id: `L-${lvl}-${Math.round(v)}`, role: `stringer-${lvl}` as FrameRole, a: [x0, v, z], b: [x1, v, z], section: ss, source: user });
  }
  const corners: Array<[number, number]> = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
  corners.forEach(([u, v], c) => bars.push({ id: `P-${c}`, role: 'column', a: [u, v, 0], b: [u, v, s.roofZ], section: s.sections.column, corner: c as 0 | 1 | 2 | 3, source: user }));
  for (const u of spread(s.intermediateColumns, x0, x1).map((x) => Math.round(x)))
    for (const [v, side] of [
      [y0, 'v0'],
      [y1, 'v1'],
    ] as const)
      bars.push({ id: `P-${side}-${u}`, role: 'column', a: [u, v, 0], b: [u, v, s.roofZ], section: s.sections.column, side, source: user });
  const feet: FrameFoot[] = corners.map(([u, v], c) => ({ id: `F-${c}`, u, v, kind: 'corner', corner: c as 0 | 1 | 2 | 3 }));
  const mid = Math.round((x0 + x1) / 2);
  if (s.middleFeet) feet.push({ id: 'FM-v0', u: mid, v: y0, kind: 'middle' }, { id: 'FM-v1', u: mid, v: y1, kind: 'middle' });
  const frame: FrameLayout = {
    v: 1,
    origin: 'parametric',
    bars,
    feet,
    deck: { floor: s.floor, roof: s.roof },
    joints: { column: s.columnModel, secondary: { model: s.secondaryModel }, side: { model: s.sideModel } },
  };
  const near = 205;
  return {
    x0,
    x1,
    y0,
    y1,
    floorZ: 0,
    roofZ: s.roofZ,
    topZ: s.topZ,
    transverseX: tf,
    longitudinalY: [...s.stringersFloor],
    footOffset: 0,
    middleFootX: mid,
    boltLongX: s.sideModel === 'bolts' ? [x0 + near, x1 - near] : [],
    boltShortY: s.sideModel === 'bolts' ? [y0 + near, y1 - near] : [],
    verticalContactX: [],
    gap: 10,
    sections: {
      ...s.base.sections,
      rim: s.sections.rimFloorLong,
      rimRoof: s.sections.rimRoofLong,
      secondary: s.sections.transverseFloor,
      secondaryRoof: s.sections.transverseRoof,
      column: s.sections.column,
    },
    springs: { ...s.base.springs, ...(s.columnModel.model === 'semi' && s.columnModel.stiffness ? { columnRotation: s.columnModel.stiffness } : {}) },
    plywood: {
      ...s.base.plywood,
      ...(s.floor ? { thickness: s.floor.thickness, floorLayers: s.floor.layers, material: s.floor.material, maxSpan: s.floor.maxSpan ?? s.base.plywood.maxSpan } : {}),
      roofLayers: s.roof?.layers ?? 0,
    },
    frame,
  };
}
