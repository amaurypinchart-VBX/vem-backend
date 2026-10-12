// Ce que la 3D montre de la topologie : jonctions (bandes au sol et au toit), pieds (croix), côtés choisis, couleurs des
// îlots et des pièces surlignées. Segments en mm monde pour SceneViewer.setBarOverlay. Fonctions pures.
import type { P2, Topology } from './types';

export const HIGHLIGHT = 0xdb2777;
export const ISLAND_COLORS = [0x93c5fd, 0x86efac, 0xfde68a, 0xc4b5fd, 0xfda4af, 0x99f6e4, 0xfdba74, 0xd9f99d];
export const JUNCTION_COLORS = { grand_cote: 0x1d4ed8, petit_cote: 0x15803d, mixte: 0xea580c } as const;
const FOOT_COLOR = 0x92400e;
const OFFSET_COLOR = 0xea580c;

const rgb = (c: number) => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];

export interface OverlayItem {
  /** id de la topologie dessiné par ce segment (jonction, pied, côté) : clic sur la barre → cet id */
  id: string;
}

export function topologyOverlay(t: Topology, highlight: ReadonlySet<string>, show: { junctions?: boolean; feet?: boolean } = { junctions: true, feet: true }) {
  const pos: number[] = [];
  const col: number[] = [];
  const ids: string[] = [];
  const seg = (a: P2, b: P2, y: number, color: number, id: string) => {
    pos.push(a[0], y, a[1], b[0], y, b[1]);
    const c = rgb(highlight.has(id) ? HIGHLIGHT : color);
    col.push(...c, ...c);
    ids.push(id);
  };
  if (show.junctions)
    for (const j of t.junctions) {
      const color = j.offset ? OFFSET_COLOR : JUNCTION_COLORS[j.kind];
      seg(j.segment[0], j.segment[1], j.y[0] + 20, color, j.id);
      seg(j.segment[0], j.segment[1], j.y[1] - 20, color, j.id);
    }
  if (show.feet)
    for (const f of t.feet) {
      const r = 180;
      seg([f.plan[0] - r, f.plan[1]], [f.plan[0] + r, f.plan[1]], f.y + 10, FOOT_COLOR, f.id);
      seg([f.plan[0], f.plan[1] - r], [f.plan[0], f.plan[1] + r], f.y + 10, FOOT_COLOR, f.id);
    }
  for (const s of t.sides) {
    if (!highlight.has(s.id)) continue;
    const m = t.modules.find((x) => x.id === s.moduleId)!;
    const inset: P2 = [-s.normal[0] * 60, -s.normal[1] * 60];
    const a: P2 = [s.a[0] + inset[0], s.a[1] + inset[1]];
    const b: P2 = [s.b[0] + inset[0], s.b[1] + inset[1]];
    seg(a, b, (m.y[0] + m.y[1]) / 2, HIGHLIGHT, s.id);
    seg(a, b, m.y[0] + 40, HIGHLIGHT, s.id);
  }
  return { positions: Float32Array.from(pos), colors: Float32Array.from(col), ids };
}

/** Couleurs des pièces : box par îlot (étape topologie), pièces surlignées en magenta. Clé = nœud. */
export function nodeColors(t: Topology, moduleNode: ReadonlyMap<string, string>, highlightNodes: Iterable<string>, byIsland: boolean, extra?: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map<string, number>();
  if (byIsland)
    t.islands.forEach((isl, k) => {
      for (const m of isl.moduleIds) {
        const n = moduleNode.get(m);
        if (n) out.set(n, ISLAND_COLORS[k % ISLAND_COLORS.length]);
      }
    });
  for (const [k, v] of extra ?? []) out.set(k, v);
  for (const id of highlightNodes) out.set(id, HIGHLIGHT);
  return out;
}
