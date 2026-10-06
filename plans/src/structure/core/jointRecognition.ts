// Reconnaissance d'une pièce de liaison dessinée (S11c) : à partir de ses triangles (repère quelconque, mm), on
// retrouve les faces planes, puis les plaques (deux faces parallèles opposées à ≤ 40 mm : épaisseur, contour,
// dimensions), les trous (boucles intérieures : diamètre, pinces aux bords), les plis (deux plaques qui se
// rejoignent en angle) et les jonctions à souder (plaques qui se touchent sans pli). La géométrie ne donne ni la nuance,
// ni les boulons, ni les soudures : ce sont les questions posées ensuite. Proposition seulement (orange), jamais
// « confirmé » sans validation humaine. Fonctions pures.

export type V3 = [number, number, number];

export interface RecognizedHole {
  /** centre (repère de la plaque, mm), diamètre (cercle) ou dimensions (oblong) */
  center: [number, number];
  d: number;
  slot?: [number, number];
  /** distance du centre aux bords de la plaque dans ses deux axes (mm) : pinces e1 / e2 candidates */
  edge: [number, number];
}

export interface RecognizedPlate {
  id: string;
  t: number;
  /** dimensions du contour (axes principaux, mm) : longueur ≥ largeur */
  length: number;
  width: number;
  area: number;
  normal: V3;
  holes: RecognizedHole[];
  /** centre (repère de la pièce) */
  center: V3;
  /** contour extérieur (repère de la pièce) : contacts entre plaques */
  outline: V3[];
}

export interface RecognizedJunction {
  a: string;
  b: string;
  kind: 'bend' | 'weld';
  /** angle entre les plaques (°), longueur de contact (mm) */
  angle: number;
  length: number;
}

export interface PartRecognition {
  plates: RecognizedPlate[];
  junctions: RecognizedJunction[];
  /** boîte de la pièce (mm) */
  size: V3;
  /** faces planes non appariées (formes non reconnues) */
  leftovers: number;
  questions: string[];
  notes: string[];
}

interface Patch {
  normal: V3;
  offset: number;
  tris: number[];
  area: number;
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

/**
 * Décompose une pièce (positions de triangles à plat : x0, y0, z0, x1, … en mm) en plaques, trous et jonctions.
 * Tolérances : angle 1°, distance 0,5 mm, épaisseur de plaque ≤ 40 mm.
 */
export function recognizePart(positions: ArrayLike<number>, opts: { maxThickness?: number } = {}): PartRecognition {
  const maxT = opts.maxThickness ?? 40;
  const nTri = Math.floor(positions.length / 9);
  const P = (k: number, i: number): V3 => [positions[9 * k + 3 * i], positions[9 * k + 3 * i + 1], positions[9 * k + 3 * i + 2]];
  // ─── faces planes : triangles de même plan, connexes ───
  const triN: V3[] = [];
  const triC: number[] = [];
  const triA: number[] = [];
  for (let k = 0; k < nTri; k++) {
    const a = P(k, 0);
    const n = cross(sub(P(k, 1), a), sub(P(k, 2), a));
    const l = len(n);
    triA.push(l / 2);
    const u: V3 = l > 1e-12 ? scale(n, 1 / l) : [0, 0, 0];
    triN.push(u);
    triC.push(dot(u, a));
  }
  const vkey = (p: V3) => `${Math.round(p[0] * 20)},${Math.round(p[1] * 20)},${Math.round(p[2] * 20)}`;
  const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const edgeTris = new Map<string, number[]>();
  for (let k = 0; k < nTri; k++) {
    if (triA[k] < 1e-9) continue;
    const ks = [0, 1, 2].map((i) => vkey(P(k, i)));
    for (let i = 0; i < 3; i++) {
      const e = ekey(ks[i], ks[(i + 1) % 3]);
      if (!edgeTris.has(e)) edgeTris.set(e, []);
      edgeTris.get(e)!.push(k);
    }
  }
  const parent = Array.from({ length: nTri }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const coplanar = (a: number, b: number) => dot(triN[a], triN[b]) > Math.cos(Math.PI / 180) && Math.abs(triC[a] - triC[b]) < 0.5;
  for (const ts of edgeTris.values())
    for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) if (coplanar(ts[i], ts[j])) parent[find(ts[i])] = find(ts[j]);
  const groups = new Map<number, number[]>();
  for (let k = 0; k < nTri; k++) if (triA[k] >= 1e-9) groups.set(find(k), [...(groups.get(find(k)) ?? []), k]);
  const patches: Patch[] = [...groups.values()].map((tris) => ({ normal: triN[tris[0]], offset: triC[tris[0]], tris, area: tris.reduce((a, k) => a + triA[k], 0) })).filter((p) => p.area > 1);

  // ─── plaques : grandes faces opposées et parallèles, proches ───
  const used = new Set<Patch>();
  const plates: RecognizedPlate[] = [];
  const sorted = [...patches].sort((a, b) => b.area - a.area);
  for (const A of sorted) {
    if (used.has(A)) continue;
    let best: { B: Patch; t: number } | null = null;
    for (const B of sorted) {
      if (B === A || used.has(B)) continue;
      if (dot(A.normal, B.normal) > -Math.cos(Math.PI / 180)) continue;
      const t = Math.abs(A.offset + B.offset);
      if (t < 0.3 || t > maxT) continue;
      if (Math.min(A.area, B.area) < 0.5 * Math.max(A.area, B.area)) continue;
      // une vraie plaque a des faces plus larges que son épaisseur (exclut les facettes d'un trou, les chants)
      if (minExtent(A, P) < 1.5 * t || minExtent(B, P) < 1.5 * t) continue;
      if (!overlap(A, B, P)) continue;
      if (!best || t < best.t) best = { B, t };
    }
    if (!best) continue;
    used.add(A);
    used.add(best.B);
    plates.push(describePlate(`PL${plates.length + 1}`, A, best.t, P, vkey));
  }

  // ─── jonctions : plaques qui se touchent (pli si leurs bords se prolongent, sinon soudure à préciser) ───
  const junctions: RecognizedJunction[] = [];
  for (let i = 0; i < plates.length; i++)
    for (let j = i + 1; j < plates.length; j++) {
      const a = plates[i];
      const b = plates[j];
      const c = Math.abs(dot(a.normal, b.normal));
      if (c > 0.995) continue;
      const contact = contactLength(a, b, patches, P);
      if (contact.length < 5) continue;
      const angle = (Math.acos(Math.min(1, c)) * 180) / Math.PI;
      junctions.push({ a: a.id, b: b.id, kind: contact.curved ? 'bend' : 'weld', angle: Math.round(angle), length: Math.round(contact.length) });
    }

  const all: V3[] = [];
  for (let k = 0; k < nTri; k++) for (let i = 0; i < 3; i++) all.push(P(k, i));
  const lo = [0, 1, 2].map((i) => Math.min(...all.map((p) => p[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...all.map((p) => p[i])));
  // faces non rattachées, hors chants des plaques (largeur = épaisseur d'une plaque) et parois des trous
  const thick = plates.map((p) => p.t);
  const leftovers = patches.filter((p) => !used.has(p) && p.area > 50 && !thick.some((t) => Math.abs(minExtent(p, P) - t) <= 1)).length;
  const questions = [
    'nuance de l’acier de chaque plaque (S235, S275, S355)',
    ...(plates.some((p) => p.holes.length) ? ['boulons : diamètre, classe (8.8, 10.9…), serrage contrôlé ou non'] : []),
    ...(junctions.some((j) => j.kind === 'weld') ? ['soudures : gorge a et longueur de chaque cordon (non visibles sur le dessin)'] : []),
    'ce que la pièce prend et dans quel sens elle retient (soulèvement, glissement) — le chemin d’effort',
    'état de surface (brut, peint, galvanisé) si la pièce travaille par serrage',
  ];
  const notes: string[] = [];
  if (!plates.length) notes.push('aucune plaque reconnue (épaisseur ≤ 40 mm entre deux faces parallèles) : pièce massive ou dessin non fermé');
  if (leftovers) notes.push(`${leftovers} face(s) plane(s) non rattachée(s) à une plaque (chanfreins, rayons, filetages dessinés…)`);
  return { plates, junctions, size: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], leftovers, questions, notes };
}

/** Repère 2D d'une face plane : origine, axes u, v. */
function frameOf(n: V3): { u: V3; v: V3 } {
  const ref: V3 = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = cross(ref, n);
  const ul = len(u);
  const uu = scale(u, 1 / ul);
  return { u: uu, v: cross(n, uu) };
}

/** Plus petite dimension d'une face plane dans son plan (rectangle englobant orienté, pas de 5°). */
function minExtent(p: Patch, P: (k: number, i: number) => V3): number {
  const { u, v } = frameOf(p.normal);
  const pts = p.tris.flatMap((k) => [P(k, 0), P(k, 1), P(k, 2)]).map((q) => [dot(q, u), dot(q, v)] as [number, number]);
  let best = Infinity;
  for (let a = 0; a < 90; a += 5) {
    const th = (a * Math.PI) / 180;
    const [c, s] = [Math.cos(th), Math.sin(th)];
    const xs = pts.map((q) => q[0] * c + q[1] * s);
    const ys = pts.map((q) => -q[0] * s + q[1] * c);
    best = Math.min(best, Math.max(Math.max(...xs) - Math.min(...xs), 0), Math.max(Math.max(...ys) - Math.min(...ys), 0));
  }
  return best;
}

/** Les deux faces se recouvrent-elles en projection (centres des triangles de l'une dans l'autre) ? */
function overlap(A: Patch, B: Patch, P: (k: number, i: number) => V3): boolean {
  const { u, v } = frameOf(A.normal);
  const proj = (p: V3): [number, number] => [dot(p, u), dot(p, v)];
  const tri2 = (k: number) => [proj(P(k, 0)), proj(P(k, 1)), proj(P(k, 2))];
  const inTri = (q: [number, number], t: Array<[number, number]>) => {
    const s = (a: [number, number], b: [number, number], c: [number, number]) => (a[0] - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (a[1] - c[1]);
    const d1 = s(q, t[0], t[1]);
    const d2 = s(q, t[1], t[2]);
    const d3 = s(q, t[2], t[0]);
    return !((d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9) && (d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9));
  };
  const trisA = A.tris.map(tri2);
  let hit = 0;
  const sample = B.tris.slice(0, 40);
  for (const k of sample) {
    const c = proj(scale([P(k, 0), P(k, 1), P(k, 2)].reduce((a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as V3, [0, 0, 0] as V3), 1 / 3));
    if (trisA.some((t) => inTri(c, t))) hit++;
  }
  return hit >= Math.max(1, sample.length * 0.5);
}

/** Contour d'une face plane : boucles de bords (arêtes d'un seul triangle). */
function loopsOf(p: Patch, P: (k: number, i: number) => V3, vkey: (p: V3) => string): V3[][] {
  const count = new Map<string, { a: V3; b: V3; ka: string; kb: string; n: number }>();
  for (const k of p.tris)
    for (let i = 0; i < 3; i++) {
      const a = P(k, i);
      const b = P(k, (i + 1) % 3);
      const ka = vkey(a);
      const kb = vkey(b);
      const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = count.get(key);
      if (e) e.n++;
      else count.set(key, { a, b, ka, kb, n: 1 });
    }
  const next = new Map<string, Array<{ to: string; p: V3 }>>();
  const pos = new Map<string, V3>();
  for (const e of count.values()) {
    if (e.n !== 1) continue;
    pos.set(e.ka, e.a);
    pos.set(e.kb, e.b);
    next.set(e.ka, [...(next.get(e.ka) ?? []), { to: e.kb, p: e.b }]);
    next.set(e.kb, [...(next.get(e.kb) ?? []), { to: e.ka, p: e.a }]);
  }
  const seen = new Set<string>();
  const loops: V3[][] = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop: V3[] = [];
    let cur = start;
    let prev = '';
    for (let guard = 0; guard < 100000; guard++) {
      seen.add(cur);
      loop.push(pos.get(cur)!);
      const nx = (next.get(cur) ?? []).find((x) => x.to !== prev && (!seen.has(x.to) || (x.to === start && loop.length > 2)));
      if (!nx || nx.to === start) break;
      prev = cur;
      cur = nx.to;
    }
    if (loop.length >= 3) loops.push(loop);
  }
  return loops;
}

const area2 = (pts: Array<[number, number]>) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
};

function describePlate(id: string, A: Patch, t: number, P: (k: number, i: number) => V3, vkey: (p: V3) => string): RecognizedPlate {
  const loops = loopsOf(A, P, vkey);
  const { u, v } = frameOf(A.normal);
  const flat = loops.map((l) => l.map((p) => [dot(p, u), dot(p, v)] as [number, number]));
  const outerIdx = flat.reduce((bi, l, i) => (Math.abs(area2(l)) > Math.abs(area2(flat[bi])) ? i : bi), 0);
  const outer = flat[outerIdx] ?? [];
  // axes principaux du contour extérieur (rectangle orienté)
  const cx = outer.reduce((a, p) => a + p[0], 0) / Math.max(1, outer.length);
  const cy = outer.reduce((a, p) => a + p[1], 0) / Math.max(1, outer.length);
  let best = { L: 0, W: 0, th: 0, area: Infinity };
  for (let k = 0; k < 90; k++) {
    const th = (k * Math.PI) / 180;
    const [c, s] = [Math.cos(th), Math.sin(th)];
    const xs = outer.map((p) => (p[0] - cx) * c + (p[1] - cy) * s);
    const ys = outer.map((p) => -(p[0] - cx) * s + (p[1] - cy) * c);
    const L = Math.max(...xs) - Math.min(...xs);
    const W = Math.max(...ys) - Math.min(...ys);
    if (L * W < best.area - 1e-6) best = { L, W, th, area: L * W };
  }
  const [c, s] = [Math.cos(best.th), Math.sin(best.th)];
  const toLocal = (p: [number, number]): [number, number] => [(p[0] - cx) * c + (p[1] - cy) * s, -(p[0] - cx) * s + (p[1] - cy) * c];
  const ol = outer.map(toLocal);
  const xmin = Math.min(...ol.map((p) => p[0]));
  const xmax = Math.max(...ol.map((p) => p[0]));
  const ymin = Math.min(...ol.map((p) => p[1]));
  const ymax = Math.max(...ol.map((p) => p[1]));
  const holes: RecognizedHole[] = [];
  flat.forEach((l, i) => {
    if (i === outerIdx || l.length < 6) return;
    const loc = l.map(toLocal);
    const hx = loc.reduce((a, p) => a + p[0], 0) / loc.length;
    const hy = loc.reduce((a, p) => a + p[1], 0) / loc.length;
    const r = loc.map((p) => Math.hypot(p[0] - hx, p[1] - hy));
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    const sd = Math.sqrt(r.reduce((a, b) => a + (b - mean) ** 2, 0) / r.length);
    const ex = Math.min(hx - xmin, xmax - hx);
    const ey = Math.min(hy - ymin, ymax - hy);
    const round1 = (x: number) => Math.round(x * 10) / 10;
    if (sd / mean < 0.08) holes.push({ center: [round1(hx), round1(hy)], d: round1(2 * mean), edge: [round1(ex), round1(ey)] });
    else {
      const w = Math.max(...loc.map((p) => p[0])) - Math.min(...loc.map((p) => p[0]));
      const h = Math.max(...loc.map((p) => p[1])) - Math.min(...loc.map((p) => p[1]));
      holes.push({ center: [round1(hx), round1(hy)], d: round1(Math.min(w, h)), slot: [round1(Math.max(w, h)), round1(Math.min(w, h))], edge: [round1(ex), round1(ey)] });
    }
  });
  const net = Math.abs(area2(outer)) - flat.filter((_, i) => i !== outerIdx).reduce((a, l) => a + Math.abs(area2(l)), 0);
  const all = A.tris.flatMap((k) => [P(k, 0), P(k, 1), P(k, 2)]);
  const center = scale(all.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]] as V3, [0, 0, 0] as V3), 1 / all.length);
  const L = Math.max(best.L, best.W);
  const W = Math.min(best.L, best.W);
  return { id, t: Math.round(t * 10) / 10, length: Math.round(L), width: Math.round(W), area: Math.round(net), normal: A.normal, holes, center: [Math.round(center[0]), Math.round(center[1]), Math.round(center[2])], outline: loops[outerIdx] ?? [] };
}

/**
 * Contact entre deux plaques non parallèles : chacune arrive au plan de l'autre (distance du centre de l'une au plan de
 * l'autre ≤ demi-dimension + épaisseur). Pli : petites faces planes (facettes d'un rayon de pliage) orientées entre
 * les deux normales, près des deux plaques ; sinon jonction à souder.
 */
function contactLength(a: RecognizedPlate, b: RecognizedPlate, patches: Patch[], P: (k: number, i: number) => V3): { length: number; curved: boolean } {
  // points des contours à moins de (2 t + 25 mm) l'un de l'autre : plaques jointives ou reliées par un pli
  const lim = 2 * Math.max(a.t, b.t) + 25;
  const nearA = a.outline.filter((p) => b.outline.some((q) => len(sub(p, q)) <= lim));
  if (nearA.length < 2) return { length: 0, curved: false };
  const line = cross(a.normal, b.normal);
  const ll = len(line);
  const dir = ll > 1e-9 ? scale(line, 1 / ll) : ([1, 0, 0] as V3);
  const proj = nearA.map((p) => dot(p, dir));
  const length = Math.max(...proj) - Math.min(...proj);
  // pli : petites faces planes (facettes du rayon) orientées entre les deux normales, près du contact
  const dirs = [
    [a.normal[0] + b.normal[0], a.normal[1] + b.normal[1], a.normal[2] + b.normal[2]] as V3,
    [a.normal[0] - b.normal[0], a.normal[1] - b.normal[1], a.normal[2] - b.normal[2]] as V3,
  ]
    .filter((m) => len(m) > 1e-6)
    .map((m) => scale(m, 1 / len(m)));
  const curved = patches.some((p) => {
    if (p.area > Math.min(a.area, b.area) * 0.2) return false;
    if (!dirs.some((d) => Math.abs(dot(p.normal, d)) > 0.9)) return false;
    const c = P(p.tris[0], 0);
    return nearA.some((q) => len(sub(c, q)) <= lim);
  });
  return { length, curved };
}

/** Texte d'une plaque reconnue : « plaque 15 mm, 120 × 80 mm, 1 trou Ø 22 (pinces 40 / 40) ». */
export function plateText(p: RecognizedPlate): string {
  const f = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');
  const h = p.holes.length ? `, ${p.holes.length} trou(s) ${p.holes.map((x) => (x.slot ? `oblong ${f(x.slot[0])} × ${f(x.slot[1])}` : `Ø ${f(x.d)}`) + ` (pinces ${f(x.edge[0])} / ${f(x.edge[1])})`).join(', ')}` : '';
  return `plaque ${f(p.t)} mm, ${f(p.length)} × ${f(p.width)} mm${h}`;
}
