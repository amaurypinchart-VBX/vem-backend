// Plan de contrôle de l'étanchéité de toiture : points à contrôler sur chaque toit, trouvés à partir du repère de
// chaque Viewbox (ModuleFrame). Pur, testé (tests/roofCheck/detect.test.ts) ; publié vers VEM par ui/roofCheck.
//
//   - jonction (grand / petit côté) : deux toits côte à côte (faces opposées ≤ 60 mm, contact ≥ 200 mm) ;
//   - croisement (4 jonctions qui se rejoignent), jonction en T / en L (2 ou 3) ;
//   - extrémité : bout d'une jonction seule (là où caoutchouc et bande se ferment sur la rive) ;
//   - angle de toiture : coin d'une box qui dépasse de l'ensemble (un seul quart autour du coin est couvert) ;
//   - raccord d'étage : côté d'une box du dessus posée sur un toit plus grand (le toit du dessous continue) ;
//   - « sous l'étage » : point d'un toit recouvert par une box de l'étage du dessus (à contrôler avant de la poser).
// Plan = (x, z) du monde en mm (vue de dessus : x vers la droite, z vers le bas de l'écran).
import type { ModuleFrame } from '../views';

export type P2 = [number, number];

/** Version du calcul (enregistrée avec la publication). */
export const ROOF_ENGINE = 'roof-1';

export type RoofPointType = 'seam-long' | 'seam-short' | 'cross' | 'tee' | 'end' | 'outer-corner' | 'step';

export const ROOF_TYPE_LABELS: Record<RoofPointType | 'custom', string> = {
  'seam-long': 'Jonction grand côté',
  'seam-short': 'Jonction petit côté',
  cross: 'Croisement',
  tee: 'Jonction en T / en L',
  end: 'Extrémité de jonction',
  'outer-corner': 'Angle de toiture',
  step: 'Raccord d’étage',
  custom: 'Point ajouté',
};

const LETTERS: Record<RoofPointType, string> = {
  'seam-long': 'J', 'seam-short': 'J', cross: 'X', tee: 'T', end: 'E', 'outer-corner': 'A', step: 'R',
};

export const ROOF_TOL = {
  /** jeu maximal entre deux toits pour une jonction */
  gap: 60,
  /** contact minimal pour une jonction */
  overlap: 200,
  /** extrémités de jonctions confondues */
  merge: 50,
  /** sondes autour d'un coin / d'un nœud */
  probe: 150,
  /** marge pour dire qu'un point est sous une box de l'étage du dessus */
  cover: 100,
  /** différence de hauteur de toit au-delà de laquelle deux box voisines ne font pas une jonction */
  height: 300,
  /** pas des sondes le long d'un côté de box du dessus (raccord d'étage) */
  step: 250,
  /** distance libre voulue autour d'une pastille de raccord d'étage (sinon elle glisse le long de son côté) */
  free: 700,
};

export interface RoofBox {
  id: string;
  label: string;
  level: number;
  /** 4 coins en plan, tous les contours dans le même sens */
  c: P2[];
  /** nom local de chaque coin (x0y0…) dans le même ordre que c */
  names: string[];
  /** hauteur du dessus du toit (mm) */
  top: number;
  bottom: number;
}

export interface RoofPoint {
  key: string;
  code: string;
  type: RoofPointType;
  level: number;
  modules: string[];
  at: { x: number; z: number; y?: number };
  seg?: { a: P2; b: P2 };
  lengthMm?: number;
  label: string;
  hint?: string;
  covered: boolean;
  order: number;
}

export interface RoofLevel {
  level: number;
  label: string;
  boxes: Array<{ id: string; label: string; c: P2[] }>;
  above: Array<{ id: string; label: string; c: P2[] }>;
}

export interface RoofDetection {
  levels: RoofLevel[];
  points: RoofPoint[];
  warnings: string[];
}

const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: P2, b: P2, s = 1): P2 => [a[0] + b[0] * s, a[1] + b[1] * s];
const dot = (a: P2, b: P2) => a[0] * b[0] + a[1] * b[1];
const len = (a: P2) => Math.hypot(a[0], a[1]);
const unit = (a: P2): P2 => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const dist = (a: P2, b: P2) => len(sub(a, b));
const mid = (a: P2, b: P2): P2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const r1 = (v: number) => Math.round(v);

/** Boîte de chaque Viewbox en plan (repère du composant, pieds exclus) et hauteurs de son toit. */
export function roofBoxes(
  modules: Array<{ id: string; level: number }>,
  frames: ReadonlyMap<string, ModuleFrame>,
  labels: Readonly<Record<string, string>> = {},
): RoofBox[] {
  const out: RoofBox[] = [];
  for (const m of modules) {
    const f = frames.get(m.id);
    if (!f) continue;
    const w = (x: number, y: number): P2 => [f.origin[0] + x * f.xAxis[0] + y * f.yAxis[0], f.origin[2] + x * f.xAxis[2] + y * f.yAxis[2]];
    let c: P2[] = [w(f.min[0], f.min[1]), w(f.max[0], f.min[1]), w(f.max[0], f.max[1]), w(f.min[0], f.max[1])];
    let names = ['x0y0', 'x1y0', 'x1y1', 'x0y1'];
    const area = c.reduce((s, p, i) => s + p[0] * c[(i + 1) % 4][1] - c[(i + 1) % 4][0] * p[1], 0);
    if (area < 0) { c = [c[0], c[3], c[2], c[1]]; names = [names[0], names[3], names[2], names[1]]; }
    out.push({
      id: m.id, label: labels[m.id] || m.id, level: m.level, c, names,
      top: f.origin[1] + f.max[2] * f.up[1], bottom: f.origin[1] + f.min[2] * f.up[1],
    });
  }
  return out;
}

/** Point dans le rectangle (marge > 0 = agrandi, < 0 = rétréci). */
export function insideBox(b: { c: P2[] }, p: P2, margin = 0): boolean {
  const o = b.c[0];
  const ex = sub(b.c[1], o), ey = sub(b.c[3], o);
  const lx = len(ex), ly = len(ey);
  const u = dot(sub(p, o), ex) / lx, v = dot(sub(p, o), ey) / ly;
  return u >= -margin && u <= lx + margin && v >= -margin && v <= ly + margin;
}

interface Seam { a: RoofBox; b: RoofBox; p: P2; q: P2; type: 'seam-long' | 'seam-short'; key: string; dir: P2 }

/** Jonctions entre toits d'un même niveau, et box presque jointives (60–300 mm). */
function seamsOf(boxes: RoofBox[], warnings: string[]): Seam[] {
  const seams: Seam[] = [];
  const cos1 = Math.cos(Math.PI / 180);
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const [A, B] = [boxes[i], boxes[j]];
      if (Math.abs(A.top - B.top) > ROOF_TOL.height) continue;
      for (let ea = 0; ea < 4; ea++)
        for (let eb = 0; eb < 4; eb++) {
          const a0 = A.c[ea], a1 = A.c[(ea + 1) % 4], b0 = B.c[eb], b1 = B.c[(eb + 1) % 4];
          const da = unit(sub(a1, a0)), db = unit(sub(b1, b0));
          // côtés en vis-à-vis = sens opposés (contours dans le même sens)
          if (dot(da, db) > -cos1) continue;
          // normale sortante du côté de A, et B de ce côté-là
          let n: P2 = [-da[1], da[0]];
          if (dot(sub(mid(a0, a1), mid(A.c[0], A.c[2])), n) < 0) n = [da[1], -da[0]];
          if (dot(sub(mid(B.c[0], B.c[2]), mid(a0, a1)), n) <= 0) continue;
          const off = dot(sub(b0, a0), n);
          const s0 = dot(sub(b0, a0), da), s1 = dot(sub(b1, a0), da);
          const lo = Math.max(0, Math.min(s0, s1)), hi = Math.min(dist(a0, a1), Math.max(s0, s1));
          if (hi - lo < ROOF_TOL.overlap) continue;
          if (Math.abs(off) > ROOF_TOL.gap) {
            if (off > ROOF_TOL.gap && off <= 300)
              warnings.push(`${A.label} / ${B.label} : ${Math.round(off)} mm d’écart entre les toits — pas compté comme jonction.`);
            continue;
          }
          const shift: P2 = [n[0] * off / 2, n[1] * off / 2];
          const p = add(add(a0, da, lo), shift);
          const q = add(add(a0, da, hi), shift);
          const longA = dist(a0, a1) >= dist(A.c[(ea + 1) % 4], A.c[(ea + 2) % 4]) - 1;
          const longB = dist(b0, b1) >= dist(B.c[(eb + 1) % 4], B.c[(eb + 2) % 4]) - 1;
          const type = longA && longB ? 'seam-long' : !longA && !longB ? 'seam-short' : hi - lo >= 3000 ? 'seam-long' : 'seam-short';
          const ids = [A.id, B.id].sort();
          seams.push({ a: A, b: B, p, q, type, key: `seam|${ids.join('|')}`, dir: da });
        }
    }
  return seams;
}

interface Node { at: P2; arms: Array<{ seam: Seam; out: P2 }> }

/** Bouts de jonctions confondus (≤ 50 mm) : nœuds avec la direction de chaque jonction qui en part. */
function nodesOf(seams: Seam[]): Node[] {
  const nodes: Node[] = [];
  for (const s of seams)
    for (const [e, other] of [[s.p, s.q], [s.q, s.p]] as Array<[P2, P2]>) {
      const out = unit(sub(other, e));
      const n = nodes.find((x) => dist(x.at, e) <= ROOF_TOL.merge);
      if (n) {
        n.at = [(n.at[0] * n.arms.length + e[0]) / (n.arms.length + 1), (n.at[1] * n.arms.length + e[1]) / (n.arms.length + 1)];
        n.arms.push({ seam: s, out });
      } else nodes.push({ at: e, arms: [{ seam: s, out }] });
    }
  return nodes;
}

/** Ordre de passage sur un niveau : bandes de 2 m en z, de gauche à droite puis de droite à gauche. */
function walkOrder(a: RoofPoint, b: RoofPoint): number {
  const ra = Math.floor(a.at.z / 2000), rb = Math.floor(b.at.z / 2000);
  if (ra !== rb) return ra - rb;
  return ra % 2 === 0 ? a.at.x - b.at.x : b.at.x - a.at.x;
}

const uniqLabels = (boxes: RoofBox[]) => [...new Set(boxes.map((b) => b.label))].sort((x, y) => x.localeCompare(y, 'fr', { numeric: true }));

/**
 * Points à contrôler sur les toits de toutes les Viewbox. Les clés ne dépendent que des identifiants SketchUp des box
 * (VBX-01…) et du type de point : une nouvelle publication retrouve les mêmes points (statut et photos gardés).
 */
export function detectRoofPoints(boxes: RoofBox[], levelLabels: Readonly<Record<number, string>> = {}): RoofDetection {
  const warnings: string[] = [];
  const points: RoofPoint[] = [];
  const levelIds = [...new Set(boxes.map((b) => b.level))].sort((a, b) => a - b);
  const levels: RoofLevel[] = [];
  const shape = (b: RoofBox) => ({ id: b.id, label: b.label, c: b.c.map((p) => [r1(p[0]), r1(p[1])] as P2) });

  for (const L of levelIds) {
    const here = boxes.filter((b) => b.level === L);
    const upper = boxes.filter((b) => b.level === L + 1);
    levels.push({ level: L, label: levelLabels[L] || (L === 0 ? 'Rez-de-chaussée' : `Niveau ${L}`), boxes: here.map(shape), above: upper.map(shape) });
    // jonction : sous l'étage si son milieu est nettement sous une box du dessus ; nœud / angle : dessous ou sur son bord
    const covered = (p: P2, strict = false) => upper.some((u) => insideBox(u, p, strict ? -ROOF_TOL.cover : 10));
    const onRoof = (p: P2) => here.some((b) => insideBox(b, p, ROOF_TOL.gap / 2));
    const roofY = (bs: RoofBox[]) => r1(Math.max(...bs.map((b) => b.top)));
    const mine: RoofPoint[] = [];
    const used = new Set<string>();
    const push = (p: Omit<RoofPoint, 'code' | 'order'>) => {
      let key = p.key;
      for (let k = 2; used.has(key); k++) key = `${p.key}#${k}`;
      used.add(key);
      mine.push({ ...p, key, code: '', order: 0 });
    };

    // jonctions
    const seams = seamsOf(here, warnings);
    for (const s of seams) {
      const m = mid(s.p, s.q);
      const length = dist(s.p, s.q);
      push({
        key: s.key, type: s.type, level: L, modules: [s.a.id, s.b.id].sort(),
        at: { x: r1(m[0]), z: r1(m[1]), y: roofY([s.a, s.b]) },
        seg: { a: [r1(s.p[0]), r1(s.p[1])], b: [r1(s.q[0]), r1(s.q[1])] }, lengthMm: r1(length),
        label: `${s.type === 'seam-long' ? 'Jonction grand côté' : 'Jonction petit côté'} ${uniqLabels([s.a, s.b]).join(' / ')} (${(length / 1000).toFixed(2).replace('.', ',')} m)`,
        covered: covered(m, true),
      });
    }

    // nœuds : croisements, T / L, extrémités
    const nodeAt: P2[] = [];
    for (const n of nodesOf(seams)) {
      const arms = n.arms.length;
      const collinear = arms === 2 && dot(n.arms[0].out, n.arms[1].out) < -0.98;
      if (collinear) continue; // une jonction qui continue sur une autre : rien de plus à contrôler ici
      const touch = here.filter((b) => insideBox(b, n.at, ROOF_TOL.gap));
      const type: RoofPointType = arms >= 4 || touch.length >= 4 ? 'cross' : arms >= 2 ? 'tee' : 'end';
      const mods = touch.length ? touch : [...new Set(n.arms.flatMap((a) => [a.seam.a, a.seam.b]))];
      const ids = mods.map((b) => b.id).sort();
      let key: string;
      if (type === 'end') {
        // extrémité : la jonction + le coin de box le plus proche (stable d'une publication à l'autre)
        const s = n.arms[0].seam;
        let best = { d: Infinity, name: '' };
        for (const b of [s.a, s.b].sort((x, y) => (x.id < y.id ? -1 : 1)))
          b.c.forEach((c, i) => { const d = dist(c, n.at); if (d < best.d - 1) best = { d, name: `${b.id}:${b.names[i]}` }; });
        key = `end|${s.key.slice(5)}|${best.name}`;
      } else key = `node|${ids.join('|')}`;
      nodeAt.push(n.at);
      push({
        key, type, level: L, modules: ids, at: { x: r1(n.at[0]), z: r1(n.at[1]), y: roofY(mods) },
        label: type === 'end'
          ? `Extrémité jonction ${uniqLabels([n.arms[0].seam.a, n.arms[0].seam.b]).join(' / ')}`
          : `${type === 'cross' ? 'Croisement' : arms === 2 ? 'Jonction en L' : 'Jonction en T'} ${uniqLabels(mods).join(' / ')}`,
        hint: type === 'end' ? 'Caoutchouc et bande fermés / retournés sur la rive.' : undefined,
        covered: covered(n.at),
      });
    }

    // angles de toiture : un seul quart couvert autour du coin
    for (const b of here) {
      b.c.forEach((corner, i) => {
        if (nodeAt.some((n) => dist(n, corner) <= ROOF_TOL.probe)) return;
        const ex = unit(sub(b.c[(i + 1) % 4], corner)), ey = unit(sub(b.c[(i + 3) % 4], corner));
        let k = 0;
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (onRoof(add(add(corner, ex, sx * ROOF_TOL.probe), ey, sy * ROOF_TOL.probe))) k++;
        if (k !== 1) return;
        push({
          key: `corner|${b.id}|${b.names[i]}`, type: 'outer-corner', level: L, modules: [b.id],
          at: { x: r1(corner[0]), z: r1(corner[1]), y: r1(b.top) }, label: `Angle de toiture ${b.label}`, covered: covered(corner),
        });
      });
    }

    // raccords d'étage : côté d'une box du dessus le long duquel le toit du dessous continue
    for (const u of upper) {
      for (let e = 0; e < 4; e++) {
        const a = u.c[e], bb = u.c[(e + 1) % 4];
        const d = unit(sub(bb, a));
        const out: P2 = [d[1], -d[0]]; // contour dans le sens direct : la normale sortante est à droite
        const centre = mid(u.c[0], u.c[2]);
        const n: P2 = dot(sub(mid(a, bb), centre), out) >= 0 ? out : [-out[0], -out[1]];
        const total = dist(a, bb);
        const steps = Math.max(2, Math.ceil(total / ROOF_TOL.step));
        const hit: boolean[] = [];
        for (let k = 0; k <= steps; k++) {
          const t = Math.min(total - 20, Math.max(20, (k / steps) * total));
          const probe = add(add(a, d, t), n, ROOF_TOL.probe);
          hit.push(here.some((b) => insideBox(b, probe, 0) && Math.abs(b.top - u.bottom) <= 400));
        }
        // portions continues sur le toit du dessous
        let runs = 0;
        for (let k = 0; k <= steps; k++) {
          if (!hit[k]) continue;
          let k2 = k;
          while (k2 + 1 <= steps && hit[k2 + 1]) k2++;
          const t0 = (k / steps) * total, t1 = (k2 / steps) * total;
          if (t1 - t0 >= 300) {
            const p0 = add(a, d, t0), p1 = add(a, d, t1), m = mid(p0, p1);
            const below = here.filter((b) => insideBox(b, add(m, n, ROOF_TOL.probe), 0));
            runs++;
            push({
              key: `step|${u.id}|${u.names[e]}-${u.names[(e + 1) % 4]}${runs > 1 ? `|${runs}` : ''}`, type: 'step', level: L,
              modules: [u.id, ...below.map((b) => b.id)].filter((x, i, arr) => arr.indexOf(x) === i),
              at: { x: r1(m[0]), z: r1(m[1]), y: r1(u.bottom) }, seg: { a: [r1(p0[0]), r1(p0[1])], b: [r1(p1[0]), r1(p1[1])] }, lengthMm: r1(t1 - t0),
              label: `Raccord d’étage ${u.label}${below.length ? ` sur ${uniqLabels(below).join(' / ')}` : ''}`,
              covered: false,
            });
          }
          k = k2;
        }
      }
    }

    // un raccord d'étage tombe souvent pile sur le milieu d'une jonction (box du dessus alignée sur une box du
    // dessous) : sa pastille glisse le long de son côté jusqu'à un endroit libre, pour pouvoir toucher les deux
    for (const p of mine) {
      if (p.type !== 'step' || !p.seg) continue;
      const others = mine.filter((q) => q !== p).map((q): P2 => [q.at.x, q.at.z]);
      const along = (t: number): P2 => [p.seg!.a[0] + (p.seg!.b[0] - p.seg!.a[0]) * t, p.seg!.a[1] + (p.seg!.b[1] - p.seg!.a[1]) * t];
      const room = (q: P2) => Math.min(Infinity, ...others.map((o) => dist(o, q)));
      if (room([p.at.x, p.at.z]) >= ROOF_TOL.free) continue;
      let best = { t: 0.5, d: -1 };
      for (const t of [0.3, 0.7, 0.2, 0.8, 0.4, 0.6, 0.12, 0.88]) {
        const d = room(along(t));
        if (d > best.d + 1) best = { t, d };
        if (d >= ROOF_TOL.free) break;
      }
      const q = along(best.t);
      p.at = { ...p.at, x: r1(q[0]), z: r1(q[1]) };
    }

    // codes et ordre de passage
    mine.sort(walkOrder);
    const count = new Map<string, number>();
    for (const p of mine) {
      const letter = LETTERS[p.type];
      const k = (count.get(letter) ?? 0) + 1;
      count.set(letter, k);
      p.code = `N${L}-${letter}${String(k).padStart(2, '0')}`;
    }
    points.push(...mine);
  }
  points.forEach((p, i) => { p.order = i + 1; });
  return { levels, points, warnings: [...new Set(warnings)] };
}

/** Nombre de points par type (pour l'écran Toiture). */
export function countByType(points: RoofPoint[]): Record<RoofPointType, number> {
  const out = { 'seam-long': 0, 'seam-short': 0, cross: 0, tee: 0, end: 0, 'outer-corner': 0, step: 0 } as Record<RoofPointType, number>;
  for (const p of points) out[p.type]++;
  return out;
}
