// Découpe d'un paquet du moteur 2D par des plans (vues spéciales) : pure, utilisable dans un Worker.
// - objet entièrement du côté gardé : recopié tel quel ; entièrement retiré : supprimé ;
// - objet traversé : triangles découpés (points d'intersection canoniques, identiques sur une arête commune), puis
//   bouchons sur chaque plan de section (polygones avec trous) : on ne voit jamais l'intérieur d'un solide ;
// - sommets posés sur un plan de section marqués (cutVertex) : leurs arêtes deviennent le trait de coupe ;
// - plan pile sur une face : décalé de 0,37 mm du côté gardé (sinon la face serait à moitié gardée).
import type { Vec3 } from '../core/views';
import type { HlrPacket } from './hlr';
import type { Loop, PlaneEq } from './section';
import { capTriangles, chainSegments, edgePoint, loopsToPolygons, sliceTriangles } from './section';

/** Décalage d'un plan qui tombe pile sur une face (mm). */
export const FACE_OFFSET = 0.37;
/** Distance sous laquelle un sommet est « sur » le plan (mm). */
const ON_PLANE = 0.01;

export interface ClipPlaneSpec {
  /** normale unitaire vers le côté gardé (repère monde) */
  n: Vec3;
  /** n·p ≥ d gardé (repère monde) */
  d: number;
  /** plan de section (bouché, trait de coupe) ; sinon plan de profondeur (seulement découpé) */
  section: boolean;
}

export interface ClipInput {
  /** jeux de plans */
  planeSets: ClipPlaneSpec[][];
  /** jeu de plans de chaque objet du paquet (−1 = aucun) */
  objectSet: Int32Array;
}

export interface ObjectSection {
  /** objet du paquet découpé (indice dans le nouveau paquet) */
  object: number;
  /** plan de section (repère monde) */
  plane: PlaneEq;
  /** boucles en coordonnées monde */
  loops: Loop[];
}

export interface ClipOutput {
  packet: HlrPacket;
  /** indice d'origine de chaque objet gardé */
  kept: number[];
  sections: ObjectSection[];
  /** objets (indices d'origine) dont une section ne se ferme pas */
  open: number[];
}

/** Clé d'un plan pour numéroter les traits de coupe : même plan = même numéro. */
const planeKey = (p: PlaneEq) => `${p.n.map((v) => v.toFixed(6)).join(',')},${p.d.toFixed(3)}`;

/** Garde la partie d'un polygone convexe (points 3D à plat) du côté s ≥ 0 ; marque les points créés. */
function clipPolygon(pts: number[], flags: number[], n: Vec3, d: number, mark: number): { pts: number[]; flags: number[] } {
  const m = pts.length / 3;
  const s: number[] = [];
  let allIn = true;
  let allOut = true;
  for (let i = 0; i < m; i++) {
    const v = n[0] * pts[3 * i] + n[1] * pts[3 * i + 1] + n[2] * pts[3 * i + 2] - d;
    s.push(v);
    if (v < 0) allIn = false;
    else allOut = false;
  }
  if (allIn) return { pts, flags };
  if (allOut) return { pts: [], flags: [] };
  const op: number[] = [];
  const of: number[] = [];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    const inI = s[i] >= 0;
    const inJ = s[j] >= 0;
    if (inI) {
      op.push(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2]);
      of.push(flags[i]);
    }
    if (inI !== inJ) {
      edgePoint(pts[3 * i], pts[3 * i + 1], pts[3 * i + 2], pts[3 * j], pts[3 * j + 1], pts[3 * j + 2], n, d, op);
      of.push(mark);
    }
  }
  return { pts: op, flags: of };
}

/** Triangles (9 nombres) d'un objet, en coordonnées du paquet (monde − centre). */
function objectTriangles(p: HlrPacket, m: number): number[] {
  const out: number[] = [];
  const vs = p.vertexStart[m];
  const is = p.indexStart[m];
  for (let k = 0; k < p.indexCount[m]; k++) {
    const v = (vs + p.indices[is + k]) * 3;
    out.push(p.positions[v], p.positions[v + 1], p.positions[v + 2]);
  }
  return out;
}

/** Découpe une soupe de triangles par des plans (repère du paquet) ; drapeaux = numéro de plan des points créés. */
function clipSoup(tris: number[], planes: Array<PlaneEq & { mark: number }>): { pts: number[]; flags: number[] } {
  const outP: number[] = [];
  const outF: number[] = [];
  for (let t = 0; t < tris.length; t += 9) {
    let poly = { pts: tris.slice(t, t + 9), flags: [0, 0, 0] };
    for (const pl of planes) {
      poly = clipPolygon(poly.pts, poly.flags, pl.n, pl.d, pl.mark);
      if (!poly.pts.length) break;
    }
    const m = poly.pts.length / 3;
    for (let k = 1; k + 1 < m; k++)
      for (const i of [0, k, k + 1]) {
        outP.push(poly.pts[3 * i], poly.pts[3 * i + 1], poly.pts[3 * i + 2]);
        outF.push(poly.flags[i]);
      }
  }
  return { pts: outP, flags: outF };
}

export function clipPacket(packet: HlrPacket, input: ClipInput): ClipOutput {
  const c = packet.center;
  const objects = packet.vertexStart.length;
  // plans dans le repère du paquet, décalés s'ils tombent pile sur une face ; numéro commun par plan identique
  const numbers = new Map<string, number>();
  const sets = input.planeSets.map((set, si) =>
    set.map((p) => {
      let d = p.d - (p.n[0] * c[0] + p.n[1] * c[1] + p.n[2] * c[2]);
      let onFace = false;
      for (let m = 0; m < objects && !onFace; m++) {
        if (input.objectSet[m] !== si) continue;
        const vs = packet.vertexStart[m];
        for (let v = vs; v < vs + packet.vertexCount[m]; v++) {
          const s = p.n[0] * packet.positions[3 * v] + p.n[1] * packet.positions[3 * v + 1] + p.n[2] * packet.positions[3 * v + 2] - d;
          if (Math.abs(s) < ON_PLANE) {
            onFace = true;
            break;
          }
        }
      }
      if (onFace) d += FACE_OFFSET;
      const world: PlaneEq = { n: p.n, d: d + (p.n[0] * c[0] + p.n[1] * c[1] + p.n[2] * c[2]) };
      let mark = 0;
      if (p.section) {
        const k = planeKey(world);
        mark = numbers.get(k) ?? numbers.size + 1;
        numbers.set(k, mark);
      }
      return { n: p.n, d, mark, section: p.section, world };
    }),
  );

  const pos: number[] = [];
  const idx: number[] = [];
  const glass: number[] = [];
  const cut: number[] = [];
  const vStart: number[] = [];
  const vCount: number[] = [];
  const iStart: number[] = [];
  const iCount: number[] = [];
  const sourceIds: string[] = [];
  const kept: number[] = [];
  const sections: ObjectSection[] = [];
  const open: number[] = [];

  for (let m = 0; m < objects; m++) {
    const vs = packet.vertexStart[m];
    const vc = packet.vertexCount[m];
    const is = packet.indexStart[m];
    const ic = packet.indexCount[m];
    const planes = input.objectSet[m] >= 0 ? sets[input.objectSet[m]] : [];
    // classement rapide sur les sommets
    let removed = false;
    const crossing: typeof planes = [];
    for (const pl of planes) {
      let pos0 = false;
      let neg0 = false;
      for (let v = vs; v < vs + vc; v++) {
        const s = pl.n[0] * packet.positions[3 * v] + pl.n[1] * packet.positions[3 * v + 1] + pl.n[2] * packet.positions[3 * v + 2] - pl.d;
        if (s >= 0) pos0 = true;
        else neg0 = true;
        if (pos0 && neg0) break;
      }
      if (!pos0) {
        removed = true;
        break;
      }
      if (neg0) crossing.push(pl);
    }
    if (removed) continue;
    const obj = kept.length;
    kept.push(m);
    sourceIds.push(packet.sourceIds[m]);
    const base = pos.length / 3;
    vStart.push(base);
    iStart.push(idx.length);
    if (!crossing.length) {
      for (let v = vs; v < vs + vc; v++) {
        pos.push(packet.positions[3 * v], packet.positions[3 * v + 1], packet.positions[3 * v + 2]);
        cut.push(0);
      }
      for (let k = 0; k < ic; k++) idx.push(packet.indices[is + k]);
      for (let t = 0; t < ic / 3; t++) glass.push(packet.glass[is / 3 + t]);
      vCount.push(vc);
      iCount.push(ic);
      continue;
    }
    // objet traversé : découpe triangle par triangle (le vitrage suit son triangle d'origine)
    const tris = objectTriangles(packet, m);
    let glassCount = 0;
    for (let t = 0; t < ic / 3; t++) {
      const one = clipSoup(tris.slice(t * 9, t * 9 + 9), crossing);
      const g = packet.glass[is / 3 + t];
      glassCount += g;
      for (let k = 0; k < one.flags.length; k++) {
        pos.push(one.pts[3 * k], one.pts[3 * k + 1], one.pts[3 * k + 2]);
        cut.push(one.flags[k]);
        idx.push(pos.length / 3 - 1 - base);
      }
      for (let k = 0; k < one.flags.length / 3; k++) glass.push(g);
    }
    // sections et bouchons : chaque plan de section, sur les triangles découpés par les autres plans
    const capGlass = glassCount * 2 > ic / 3 ? 1 : 0;
    for (const pl of crossing) {
      if (!pl.section) continue;
      const others = crossing.filter((q) => q !== pl);
      const src = others.length ? clipSoup(tris, others).pts : tris;
      const loops = chainSegments(sliceTriangles(src, pl));
      if (!loops.length) continue;
      if (loops.some((l) => !l.closed)) open.push(m);
      const outward: Vec3 = [-pl.n[0], -pl.n[1], -pl.n[2]];
      for (const poly of loopsToPolygons(loops, pl.n)) {
        const capTris = capTriangles(poly, pl.n, outward);
        for (let k = 0; k < capTris.length; k += 3) {
          pos.push(capTris[k], capTris[k + 1], capTris[k + 2]);
          cut.push(pl.mark);
          idx.push(pos.length / 3 - 1 - base);
        }
        for (let k = 0; k < capTris.length / 9; k++) glass.push(capGlass);
      }
      sections.push({
        object: obj,
        plane: pl.world,
        loops: loops.map((l) => ({ closed: l.closed, points: l.points.map((v, i) => v + c[i % 3]) })),
      });
    }
    vCount.push(pos.length / 3 - base);
    iCount.push(idx.length - iStart[iStart.length - 1]);
  }

  return {
    packet: {
      positions: Float32Array.from(pos),
      indices: Uint32Array.from(idx),
      vertexStart: Uint32Array.from(vStart),
      vertexCount: Uint32Array.from(vCount),
      indexStart: Uint32Array.from(iStart),
      indexCount: Uint32Array.from(iCount),
      glass: Uint8Array.from(glass),
      sourceIds,
      center: c,
      cutVertex: Uint16Array.from(cut),
    },
    kept,
    sections,
    open: [...new Set(open)],
  };
}
