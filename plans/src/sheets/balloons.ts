// Bulles d'un plan d'assemblage de production : une bulle « P03 » par pièce visible dans la vue (une seule fois par
// planche), reliée par une ligne d'attache à un point d'une de ses arêtes vues, rangées autour du dessin au-delà des
// cotes (côté le plus proche, écartées pour ne pas se toucher).
import type { Vec3, ViewBasis } from '../core/views';
import { dot, unprojectPoint } from '../core/views';
import type { Linework2D } from '../linework/types';
import type { LoadedScene } from '../scene/loadedScene';
import type { LabelItem, RectMm, ViewportItem } from './types';
import { viewportTransform } from './scales';
import { newId } from './generate';

import { BALLOON_R } from './template';

export { BALLOON_R };
/** Place réservée autour des cotes pour les bulles (mm papier). */
export const BALLOON_RING = 2 * BALLOON_R + 6;

const DRAWN = new Set(['silhouette', 'visible', 'fine', 'cut']);

interface Seen {
  mark: string;
  nodeId: string;
  /** longueur vue (mm modèle) */
  length: number;
  /** plus long segment vu : milieu (dessin) */
  at: [number, number];
  best: number;
  /** milieux des segments vus (dessin, ≤ 400) : la ligne d'attache part du plus proche de la bulle */
  pts: Array<[number, number]>;
}

/** Pièces vues dans une vue : pour chaque repère, l'exemplaire le plus visible et le milieu de son plus long trait. */
export function partsSeen(vp: ViewportItem, lw: Linework2D, scene: Pick<LoadedScene, 'look'>): Seen[] {
  const markOf = new Map((vp.assembly?.parts ?? []).map((p) => [p.nodeId, p]));
  const cache = new Map<string, { nodeId: string; mark: string } | null>();
  const partOf = (id: string) => {
    if (cache.has(id)) return cache.get(id)!;
    let hit: { nodeId: string; mark: string } | null = null;
    for (let c: string | null | undefined = id; c; c = scene.look.byId.get(c)?.parentId) {
      const m = markOf.get(c);
      if (m) {
        hit = m;
        break;
      }
    }
    cache.set(id, hit);
    return hit;
  };
  const byNode = new Map<string, Seen>();
  for (const layer of lw.layers) {
    if (!DRAWN.has(layer.key)) continue;
    layer.polylines.forEach((pl, i) => {
      const src = layer.sourceNodeIds?.[i];
      const part = src ? partOf(src) : null;
      if (!part) return;
      let s = byNode.get(part.nodeId);
      if (!s) byNode.set(part.nodeId, (s = { mark: part.mark, nodeId: part.nodeId, length: 0, at: [pl[0], pl[1]], best: -1, pts: [] }));
      for (let k = 2; k < pl.length; k += 2) {
        const l = Math.hypot(pl[k] - pl[k - 2], pl[k + 1] - pl[k - 1]);
        s.length += l;
        if (s.pts.length < 400) s.pts.push([(pl[k] + pl[k - 2]) / 2, (pl[k + 1] + pl[k - 1]) / 2]);
        if (l > s.best) {
          s.best = l;
          s.at = [(pl[k] + pl[k - 2]) / 2, (pl[k + 1] + pl[k - 1]) / 2];
        }
      }
    });
  }
  const byMark = new Map<string, Seen>();
  for (const s of byNode.values()) {
    const b = byMark.get(s.mark);
    if (!b || s.length > b.length) byMark.set(s.mark, s);
  }
  return [...byMark.values()].sort((a, b) => a.mark.localeCompare(b.mark));
}

type Side = 'top' | 'bottom' | 'left' | 'right';

/**
 * Bulles d'une vue d'assemblage (mm papier). `margins` = place prise par les cotes autour du dessin ; `taken` = repères
 * déjà posés sur la planche (complété ici).
 */
export function assemblyBalloons(
  vp: ViewportItem,
  lw: Linework2D,
  basis: ViewBasis,
  scene: Pick<LoadedScene, 'look' | 'index'>,
  fit: { scale: number; center: [number, number] },
  margins: Record<Side, number>,
  taken: Set<string>,
  k = 1,
): LabelItem[] {
  if (!vp.assembly) return [];
  const seen = partsSeen(vp, lw, scene).filter((s) => !taken.has(s.mark));
  if (!seen.length) return [];
  const tr = viewportTransform(vp.rect, fit.scale, fit.center);
  const b = lw.boundsMm;
  const p0 = tr.toPaper(b.minX, b.maxY);
  const p1 = tr.toPaper(b.maxX, b.minY);
  const r = BALLOON_R * k;
  const ring: RectMm = {
    x: p0.x - margins.left - r - 3,
    y: p0.y - margins.top - r - 3,
    w: p1.x - p0.x + margins.left + margins.right + 2 * r + 6,
    h: p1.y - p0.y + margins.top + margins.bottom + 2 * r + 6,
  };
  // dans le cadre de la vue
  const R: RectMm = {
    x: Math.max(ring.x, vp.rect.x + r + 1),
    y: Math.max(ring.y, vp.rect.y + r + 1),
    w: 0,
    h: 0,
  };
  R.w = Math.min(ring.x + ring.w, vp.rect.x + vp.rect.w - r - 1) - R.x;
  R.h = Math.min(ring.y + ring.h, vp.rect.y + vp.rect.h - r - 1) - R.y;
  const cx = (p0.x + p1.x) / 2;
  const cy = (p0.y + p1.y) / 2;
  const items = seen.map((s) => {
    const c = tr.toPaper(s.at[0], s.at[1]);
    // côté le plus proche (en proportion de la taille du dessin, pour ne pas tout mettre sur les grands côtés)
    const dx = (c.x - cx) / Math.max(1, p1.x - p0.x);
    const dy = (c.y - cy) / Math.max(1, p1.y - p0.y);
    const side: Side = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'bottom' : 'top';
    // point d'attache : le trait de la pièce le plus près de ce côté (la ligne d'attache ne traverse pas le dessin)
    let at = s.at;
    let bestD = Infinity;
    for (const q of s.pts) {
      const pp = tr.toPaper(q[0], q[1]);
      const d = side === 'left' ? pp.x : side === 'right' ? -pp.x : side === 'top' ? pp.y : -pp.y;
      if (d < bestD - 0.5) [bestD, at] = [d, q];
    }
    s.at = at;
    return { s, p: tr.toPaper(at[0], at[1]), side };
  });
  const out: LabelItem[] = [];
  const gap = 2 * r + 1.5;
  for (const side of ['top', 'bottom', 'left', 'right'] as Side[]) {
    const group = items.filter((i) => i.side === side);
    if (!group.length) continue;
    const horiz = side === 'top' || side === 'bottom';
    group.sort((a, b) => (horiz ? a.p.x - b.p.x : a.p.y - b.p.y));
    const lo = horiz ? R.x : R.y;
    const hi = horiz ? R.x + R.w : R.y + R.h;
    // positions voulues = en face de l'ancre, écartées, gardées dans le côté
    const pos: number[] = [];
    for (const g of group) {
      const want = Math.min(hi, Math.max(lo, horiz ? g.p.x : g.p.y));
      pos.push(pos.length ? Math.max(want, pos[pos.length - 1] + gap) : want);
    }
    // trop loin au bout du côté : on repousse vers le début (sans chevauchement tant qu'il y a la place)
    pos[pos.length - 1] = Math.min(pos[pos.length - 1], hi);
    for (let i = pos.length - 2; i >= 0; i--) pos[i] = Math.min(pos[i], pos[i + 1] - gap);
    const fixed = side === 'top' ? R.y : side === 'bottom' ? R.y + R.h : side === 'left' ? R.x : R.x + R.w;
    group.forEach((g, i) => {
      const depth = sceneDepth(scene, g.s.nodeId, basis);
      const anchor = unprojectPoint(basis, g.s.at[0], g.s.at[1], depth) as Vec3;
      taken.add(g.s.mark);
      out.push({
        id: newId('l'),
        type: 'label',
        viewportId: vp.id,
        anchor3d: anchor,
        textPos: horiz ? { x: pos[i], y: fixed } : { x: fixed, y: pos[i] },
        text: g.s.mark,
        style: 'normal',
        auto: 'balloon',
        balloon: true,
      });
    });
  }
  return out;
}

/** Profondeur du centre d'un nœud dans la vue (boîte de l'index). */
function sceneDepth(scene: Pick<LoadedScene, 'index'>, nodeId: string, basis: ViewBasis): number {
  const n = scene.index.nodes.find((x) => x.id === nodeId)?.bboxMm;
  if (!n) return 0;
  return dot(basis.toward, [(n[0] + n[3]) / 2, (n[1] + n[4]) / 2, (n[2] + n[5]) / 2]);
}
