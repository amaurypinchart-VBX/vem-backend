// Détail toiture / plancher (vues spéciales « Détail toiture (coupe) », « Détail plancher (coupe) ») : couches lues sur
// les pièces coupées de la vue — panneau sandwich, cadre acier, vide technique, plafond tendu… — à l'endroit où la coupe
// traverse le plus de pièces ; chaîne de cotes verticale et repères « Plafond tendu — 10 mm ». Pur : traits de la vue,
// index de scène, étiquettes de vue. Les épaisseurs sont mesurées sur la maquette, rien n'est supposé.
import type { Linework2D } from '../linework/types';
import type { SceneIndex } from '../core/types';
import type { SceneLookup } from '../core/subset';
import type { ModuleFrame } from '../core/views';
import { LEGEND } from '../core/types';
import { displayLabel } from '../core/customViews/editor';
import { subsetEnv } from '../linework/subset';

export type LayerMode = 'roof' | 'floor';

/** Une couche de la coupe, de haut en bas : pièce coupée, ou vide entre deux pièces. */
export interface Layer {
  y0: number;
  y1: number;
  /** « Plafond tendu », « Vide technique », « Structure acier »… */
  name: string;
  kind: 'part' | 'gap';
  /** point du dessin où poser le repère (mm modèle) : vers la gauche de la couche, la ligne d'attache reste courte */
  x: number;
  /** étendue de la couche dans le dessin (pièce qui la forme ; vide = entre ses voisines) */
  x0: number;
  x1: number;
}

export interface LayerStack {
  /** abscisse de la colonne mesurée (mm modèle) */
  x: number;
  /** bords des couches, de bas en haut */
  edges: number[];
  /** couches, de haut en bas */
  layers: Layer[];
}

interface Part {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const TOL = 3;

const CATEGORY_NAMES: Record<string, string> = {
  TOIT: 'Toiture',
  STRUCTURE: 'Structure acier',
  PLANCHER: 'Plancher',
  PIED: 'Pied',
};

type Scene = { index: SceneIndex; look: SceneLookup; frames: ReadonlyMap<string, ModuleFrame> };

/** Nom d'une pièce : étiquette de vue (plafond tendu…), sinon catégorie, sinon sa désignation. */
export function partName(scene: Scene, id: string): string {
  const { tags } = subsetEnv(scene);
  for (let c: string | null | undefined = id; c; c = scene.look.byId.get(c)?.parentId) {
    const n = scene.look.byId.get(c);
    if (!n || n.role === 'module') break;
    const t = tags.ownTag(c);
    if (t) return t.label.replace(/\s*\(.*\)$/, '');
  }
  const n = scene.look.byId.get(id);
  const cat = scene.look.categoryOf(id);
  const label = n ? displayLabel(n) : '';
  if (label && label !== 'Pièce sans nom' && !/^(Group|Groupe|Component|Composant)[ _#]?\d*$/i.test(label)) return label;
  if (cat) return CATEGORY_NAMES[cat] ?? LEGEND[cat as keyof typeof LEGEND]?.label ?? cat;
  return label || 'Pièce';
}

/** Pièces coupées de la vue (traits de coupe + remplissages), une boîte par pièce d'origine. */
export function cutParts(lw: Linework2D): Part[] {
  const by = new Map<string, Part>();
  const add = (id: string | undefined, a: Float64Array) => {
    if (!id) return;
    let p = by.get(id);
    if (!p) by.set(id, (p = { id, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }));
    for (let i = 0; i + 1 < a.length; i += 2) {
      p.x0 = Math.min(p.x0, a[i]);
      p.x1 = Math.max(p.x1, a[i]);
      p.y0 = Math.min(p.y0, a[i + 1]);
      p.y1 = Math.max(p.y1, a[i + 1]);
    }
  };
  for (const l of lw.layers) if (l.key === 'cut') l.polylines.forEach((pl, i) => add(l.sourceNodeIds?.[i], pl));
  for (const f of lw.fills ?? []) for (const r of f.rings) add(f.sourceNodeId, r);
  return [...by.values()].filter((p) => Number.isFinite(p.x0));
}

/**
 * Couches de la coupe : pièces coupées entièrement dans la zone du détail (une pièce qui touche le bord recadré — mur,
 * vitre, poteau coupés par le recadrage — n'est pas une couche), mesurées dans la colonne qui en traverse le plus
 * (à égalité : la plus proche du milieu). null = rien à coter.
 */
export function layerStack(lw: Linework2D, scene: Scene, mode: LayerMode): LayerStack | null {
  const b = lw.boundsMm;
  const parts = cutParts(lw).filter((p) => p.y1 - p.y0 >= 1 && (mode === 'roof' ? p.y0 > b.minY + 5 : p.y1 < b.maxY - 5));
  if (!parts.length) return null;
  const mid = (b.minX + b.maxX) / 2;
  // colonnes candidates : milieu de chaque pièce et juste à l'intérieur de ses bords
  const xs = [...new Set(parts.flatMap((p) => [(p.x0 + p.x1) / 2, p.x0 + 1, p.x1 - 1]))];
  let best = { x: mid, n: -1 };
  for (const x of xs) {
    const n = parts.filter((p) => x >= p.x0 && x <= p.x1).length;
    if (n > best.n || (n === best.n && Math.abs(x - mid) < Math.abs(best.x - mid))) best = { x, n };
  }
  const col = parts.filter((p) => best.x >= p.x0 && best.x <= p.x1);
  const edges: number[] = [];
  for (const v of col.flatMap((p) => [p.y0, p.y1]).sort((a, c) => a - c)) if (!edges.length || v - edges[edges.length - 1] > TOL) edges.push(v);
  if (edges.length < 2) return null;
  // tranches entre deux bords : la pièce qui la couvre (la plus large), sinon un vide
  const slices: Layer[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const y0 = edges[i];
    const y1 = edges[i + 1];
    const cover = col.filter((p) => p.y0 <= y0 + TOL && p.y1 >= y1 - TOL).sort((a, c) => c.x1 - c.x0 - (a.x1 - a.x0))[0];
    slices.push(cover ? { y0, y1, name: partName(scene, cover.id), kind: 'part', x: best.x, x0: cover.x0, x1: cover.x1 } : { y0, y1, name: '', kind: 'gap', x: best.x, x0: -Infinity, x1: Infinity });
  }
  // tranches voisines de la même pièce réunies ; vides nommés d'après leurs voisins
  const merged: Layer[] = [];
  for (const s of slices) {
    const last = merged[merged.length - 1];
    if (last && last.kind === s.kind && last.name === s.name) last.y1 = s.y1;
    else merged.push({ ...s });
  }
  merged.forEach((s, i) => {
    if (s.kind !== 'gap') return;
    const below = merged[i - 1]?.name ?? '';
    const above = merged[i + 1]?.name ?? '';
    s.name = /plafond/i.test(below + above) || mode === 'roof' ? 'Vide technique' : 'Vide';
    s.x0 = Math.max(merged[i - 1]?.x0 ?? b.minX, merged[i + 1]?.x0 ?? b.minX);
    s.x1 = Math.min(merged[i - 1]?.x1 ?? b.maxX, merged[i + 1]?.x1 ?? b.maxX);
  });
  // repère vers la gauche de la couche (le texte est à gauche du dessin), dans la pièce
  const w = b.maxX - b.minX;
  for (const s of merged) {
    const lo = Math.max(s.x0, b.minX) + 0.02 * w;
    const hi = Math.min(s.x1, b.maxX) - 0.02 * w;
    s.x = lo <= hi ? Math.min(hi, Math.max(lo, b.minX + 0.08 * w)) : best.x;
  }
  const keptEdges = [merged[0].y0, ...merged.map((s) => s.y1)];
  return { x: best.x, edges: keptEdges, layers: merged.reverse() };
}

/** « Plafond tendu — 10 mm ». */
export function layerText(l: Layer): string {
  return `${l.name} — ${Math.round(l.y1 - l.y0)} mm`;
}

/** Largeur (mm papier) des repères des couches, pour réserver la place à gauche du dessin. */
export function layerLabelsWidth(stack: LayerStack, k: number): number {
  const size = 3.6 * k;
  return Math.max(0, ...stack.layers.map((l) => layerText(l).length * size * 0.52));
}

/**
 * Hauteurs (mm papier) des repères : en face de chaque couche, écartés d'au moins `gap` (couches fines), dans l'ordre
 * de haut en bas, centrés sur l'ensemble.
 */
export function spreadLabels(wanted: number[], gap: number): number[] {
  const out = [...wanted];
  for (let i = 1; i < out.length; i++) if (out[i] - out[i - 1] < gap) out[i] = out[i - 1] + gap;
  // recentrage : même moyenne que les positions voulues
  const shift = (wanted.reduce((a, v) => a + v, 0) - out.reduce((a, v) => a + v, 0)) / Math.max(1, out.length);
  const res = out.map((v) => v + shift);
  // le recentrage ne doit pas recréer de chevauchement
  for (let i = 1; i < res.length; i++) if (res[i] - res[i - 1] < gap) res[i] = res[i - 1] + gap;
  return res;
}
