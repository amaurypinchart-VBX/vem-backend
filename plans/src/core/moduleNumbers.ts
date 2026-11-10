// Numéros des Viewbox choisis dans l'application (A. Pinchart 10.11.2026 : « pouvoir changer les numéros des boxes dans
// l'app : cliquer sur la box, dire le numéro, et que ça change dans les planches »).
// L'identifiant d'une Viewbox (VBX-01…, numéro SketchUp) ne change jamais : il sert de clé partout (faces avant, vues,
// cache des traits, études). Seul le nom affiché change : `settings.moduleNumbers` du modèle garde, pour chaque Viewbox
// renumérotée, son identifiant SketchUp, son nouveau nom et la position de sa boîte. Les réglages sont repris par la
// version suivante du modèle : la position retrouve la même box même si SketchUp l'a renumérotée entre-temps, et une
// box déplacée de plus d'un mètre reprend son numéro SketchUp.
// Fonctions pures.
import type { ModuleInfo } from './types';

export type Vec3 = [number, number, number];

/** Entrée enregistrée dans les réglages du modèle. */
export interface ModuleNumberEntry {
  /** identifiant SketchUp de la box (« VBX-01 ») */
  id: string;
  /** nom affiché (« VBX-05 ») */
  label: string;
  /** centre de la boîte de la box (mm, repère du modèle) */
  at: Vec3;
}

/** Noms affichés des Viewbox renumérotées : identifiant SketchUp → nom (les autres gardent leur identifiant). */
export type ModuleLabels = Record<string, string>;

/** Écart maximal (mm) entre la position enregistrée et la box retrouvée. */
export const MODULE_MATCH_MM = 1000;

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Lecture tolérante de `settings.moduleNumbers`. */
export function cleanModuleNumbers(v: unknown): ModuleNumberEntry[] {
  if (!Array.isArray(v)) return [];
  const out: ModuleNumberEntry[] = [];
  for (const e of v) {
    if (!e || typeof e !== 'object') continue;
    const { id, label, at } = e as Record<string, unknown>;
    if (typeof id !== 'string' || typeof label !== 'string' || !label.trim() || !isVec3(at)) continue;
    if (out.some((x) => x.id === id)) continue;
    out.push({ id, label: label.trim(), at });
  }
  return out;
}

/** Centre de la boîte d'une Viewbox (mm). */
export function moduleCenter(m: Pick<ModuleInfo, 'bboxMm'>): Vec3 {
  const b = m.bboxMm;
  return [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2];
}

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Noms affichés du modèle ouvert : chaque entrée retrouve sa box (même identifiant au même endroit, sinon la box la plus
 * proche de la position enregistrée) ; une entrée sans box à moins d'un mètre est ignorée. Les noms restent uniques :
 * une entrée qui donnerait le nom d'une autre box (box ajoutée dans SketchUp depuis) est ignorée.
 */
export function resolveModuleLabels(modules: Array<Pick<ModuleInfo, 'id' | 'bboxMm'>>, entries: ModuleNumberEntry[]): ModuleLabels {
  const centers = new Map(modules.map((m) => [m.id, moduleCenter(m)]));
  const taken = new Set<string>();
  const found: Array<{ id: string; label: string }> = [];
  // même identifiant au même endroit d'abord, puis par position
  const rest: ModuleNumberEntry[] = [];
  for (const e of entries) {
    const c = centers.get(e.id);
    if (c && dist(c, e.at) <= MODULE_MATCH_MM && !taken.has(e.id)) {
      taken.add(e.id);
      found.push({ id: e.id, label: e.label });
    } else rest.push(e);
  }
  for (const e of rest) {
    let best: string | null = null;
    let bd = MODULE_MATCH_MM;
    for (const [id, c] of centers) {
      if (taken.has(id)) continue;
      const d = dist(c, e.at);
      if (d <= bd) [best, bd] = [id, d];
    }
    if (best) {
      taken.add(best);
      found.push({ id: best, label: e.label });
    }
  }
  // noms uniques : on retire les entrées en conflit jusqu'à ce qu'il n'y en ait plus
  let labels: ModuleLabels = Object.fromEntries(found.filter((f) => f.label !== f.id).map((f) => [f.id, f.label]));
  for (let guard = 0; guard < modules.length + 1; guard++) {
    const byName = new Map<string, string[]>();
    for (const m of modules) {
      const n = labels[m.id] ?? m.id;
      byName.set(n, [...(byName.get(n) ?? []), m.id]);
    }
    const bad = [...byName.values()].filter((ids) => ids.length > 1).flat().filter((id) => id in labels);
    if (!bad.length) break;
    labels = Object.fromEntries(Object.entries(labels).filter(([id]) => !bad.includes(id)));
  }
  return labels;
}

/** Nom affiché d'une Viewbox. */
export function labelOf(labels: ModuleLabels | undefined, id: string): string {
  return labels?.[id] ?? id;
}

/** « 5 », « 05 », « VBX-5 », « vbx 05 » → 5 ; null si ce n'est pas un numéro. */
export function parseModuleNumber(input: string): number | null {
  const m = input.trim().match(/^(?:vbx[\s_-]*)?0*(\d{1,3})$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

/** 5 → « VBX-05 » (même forme que les numéros SketchUp). */
export function formatModuleLabel(n: number): string {
  return `VBX-${String(n).padStart(2, '0')}`;
}

/** Numéro d'un nom (« VBX-07 » → 7), null sans numéro. */
export function labelNumber(label: string): number | null {
  const m = label.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : null;
}

/** Tri naturel des noms (VBX-2 avant VBX-10). */
export function compareLabels(a: string, b: string): number {
  const na = labelNumber(a);
  const nb = labelNumber(b);
  if (na !== null && nb !== null && na !== nb) return na - nb;
  return a.localeCompare(b);
}

/**
 * Donne le numéro `n` à la box `moduleId`. Si une autre box porte déjà ce numéro, les deux échangent leurs numéros
 * (deux Viewbox n'ont jamais le même nom sur les plans).
 */
export function setModuleNumber(
  modules: Array<Pick<ModuleInfo, 'id'>>,
  labels: ModuleLabels,
  moduleId: string,
  n: number,
): { labels: ModuleLabels; swappedWith: string | null; changed: boolean } {
  const target = formatModuleLabel(n);
  const before = labelOf(labels, moduleId);
  if (before === target) return { labels, swappedWith: null, changed: false };
  const other = modules.find((m) => m.id !== moduleId && labelOf(labels, m.id) === target)?.id ?? null;
  const next: ModuleLabels = { ...labels, [moduleId]: target };
  if (other) next[other] = before;
  for (const id of [moduleId, other]) if (id && next[id] === id) delete next[id];
  return { labels: next, swappedWith: other, changed: true };
}

/** Entrées à enregistrer pour ces noms (position actuelle de chaque box renumérotée). */
export function entriesFromLabels(modules: Array<Pick<ModuleInfo, 'id' | 'bboxMm'>>, labels: ModuleLabels): ModuleNumberEntry[] {
  const out: ModuleNumberEntry[] = [];
  for (const m of [...modules].sort((a, b) => compareLabels(a.id, b.id))) {
    const label = labels[m.id];
    if (!label || label === m.id) continue;
    out.push({ id: m.id, label, at: moduleCenter(m).map((x) => Math.round(x)) as Vec3 });
  }
  return out;
}

/** Mêmes noms ? (absents = identifiant) */
export function sameLabels(a: ModuleLabels | undefined, b: ModuleLabels | undefined): boolean {
  const ka = Object.keys(a ?? {}).filter((k) => a![k] !== k);
  const kb = Object.keys(b ?? {}).filter((k) => b![k] !== k);
  return ka.length === kb.length && ka.every((k) => b?.[k] === a![k]);
}

/** Noms qui changent entre deux numérotations (« VBX-01 » → « VBX-05 »), triés. */
export function labelChanges(ids: Iterable<string>, from: ModuleLabels | undefined, to: ModuleLabels | undefined): Array<{ id: string; before: string; after: string }> {
  const all = new Set([...ids, ...Object.keys(from ?? {}), ...Object.keys(to ?? {})]);
  const out: Array<{ id: string; before: string; after: string }> = [];
  for (const id of all) {
    const before = labelOf(from, id);
    const after = labelOf(to, id);
    if (before !== after) out.push({ id, before, after });
  }
  return out.sort((a, b) => compareLabels(a.before, b.before));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Remplace tous les noms d'un coup (« VBX-01 » ↔ « VBX-05 » s'échangent sans se mélanger). Un nom n'est remplacé que
 * seul : « VBX-01 » ne touche ni « VBX-011 » ni « XVBX-01 ».
 */
export function relabelText(text: string, renames: ReadonlyMap<string, string>): string {
  if (!text || !renames.size) return text;
  const keys = [...renames.keys()].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(?<![A-Za-z0-9])(?:${keys.map(escapeRe).join('|')})(?![0-9])`, 'g');
  return text.replace(re, (m) => renames.get(m) ?? m);
}

/** Table des noms à remplacer pour passer d'une numérotation à l'autre. */
export function renameMap(ids: Iterable<string>, from: ModuleLabels | undefined, to: ModuleLabels | undefined): Map<string, string> {
  return new Map(labelChanges(ids, from, to).map((c) => [c.before, c.after]));
}
