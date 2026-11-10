// Numéros des Viewbox sur les planches (voir core/moduleNumbers.ts). Chaque planche garde les numéros avec lesquels
// elle est dessinée (`Sheet.moduleLabels`) : quand on renumérote une box dans la Vue 3D, les planches touchées sont
// signalées « à mettre à jour » et « Mettre à jour » réécrit leurs textes (titres, titres de vue, textes, repères,
// nomenclature des cadres…) ; les numéros des plans d'assemblage sont lus de la planche au dessin (SheetSvg). Les
// planches « une par Viewbox » restent dans l'ordre des numéros quand elles l'étaient. Fonctions pures (le document
// peut être un brouillon Immer).
import type { ModuleInfo } from '../core/types';
import type { ModuleLabels } from '../core/moduleNumbers';
import { compareLabels, labelOf, relabelText, renameMap, sameLabels } from '../core/moduleNumbers';
import type { DrawingSet, Sheet, SheetItem, ViewportItem } from './types';
import { sheetModule } from './duplicate';
import { renumber } from './generate';

type Mod = Pick<ModuleInfo, 'id' | 'nodeId'>;

/** Numéros (non triviaux) à enregistrer sur une planche ; undefined = numéros SketchUp. */
function stored(labels: ModuleLabels): ModuleLabels | undefined {
  const out = Object.fromEntries(Object.entries(labels).filter(([id, l]) => l && l !== id));
  return Object.keys(out).length ? out : undefined;
}

/** Applique `fn` à chaque texte de la planche ; renvoie vrai si l'un d'eux change. */
function mapTexts(sheet: Sheet, fn: (s: string) => string, write: boolean): boolean {
  let changed = false;
  const visit = (v: string | undefined, set: (s: string) => void) => {
    if (!v) return;
    const n = fn(v);
    if (n === v) return;
    changed = true;
    if (write) set(n);
  };
  visit(sheet.title, (s) => (sheet.title = s));
  for (const it of sheet.items as SheetItem[]) {
    switch (it.type) {
      case 'viewport':
        visit(it.label, (s) => (it.label = s));
        if (it.custom) {
          const c = it.custom;
          visit(c.subtitle, (s) => (c.subtitle = s));
        }
        for (const u of it.overlays?.units ?? []) visit(u.name, (s) => (u.name = s));
        break;
      case 'image3d':
      case 'detail':
        visit(it.label, (s) => (it.label = s));
        break;
      case 'label':
      case 'text':
        visit(it.text, (s) => (it.text = s));
        break;
      case 'dimension':
        visit(it.textOverride, (s) => (it.textOverride = s));
        break;
      case 'symbol':
        visit(it.note, (s) => (it.note = s));
        break;
      case 'symbolLegend':
      case 'paintLegend':
        visit(it.title, (s) => (it.title = s));
        break;
    }
  }
  return changed;
}

/** La planche montre-t-elle le numéro d'une de ces box sur un plan (numéros des Viewbox au centre des box) ? */
function showsNumbers(sheet: Sheet, changed: Set<string>, modules: Mod[]): boolean {
  if (!changed.size) return false;
  const nodes = modules.filter((m) => changed.has(m.id)).map((m) => m.nodeId);
  return sheet.items.some((it) => {
    if (it.type !== 'viewport' || !(it as ViewportItem).overlays?.moduleNumbers) return false;
    const include = new Set((it as ViewportItem).request.subset.include);
    return nodes.some((n) => include.has(n));
  });
}

/** Planches dont ce qu'on voit change avec ces numéros (titres, textes, numéros sur un plan). */
export function outdatedSheets(set: DrawingSet, labels: ModuleLabels, modules: Mod[]): string[] {
  const ids = modules.map((m) => m.id);
  return set.sheets
    .filter((s) => {
      if (sameLabels(s.moduleLabels, labels)) return false;
      const renames = renameMap(ids, s.moduleLabels, labels);
      const changed = new Set(modules.filter((m) => labelOf(s.moduleLabels, m.id) !== labelOf(labels, m.id)).map((m) => m.id));
      return mapTexts(s, (t) => relabelText(t, renames), false) || showsNumbers(s, changed, modules);
    })
    .map((s) => s.id);
}

/** Planches qui ne gardent pas encore ces numéros (même sans rien de visible à changer). */
export function sheetsWithOtherLabels(set: DrawingSet, labels: ModuleLabels): string[] {
  return set.sheets.filter((s) => !sameLabels(s.moduleLabels, labels)).map((s) => s.id);
}

/** Réécrit les textes d'une planche avec ces numéros et les lui donne. Renvoie vrai si un texte a changé. */
export function relabelSheet(sheet: Sheet, labels: ModuleLabels, modules: Mod[]): boolean {
  const renames = renameMap(
    modules.map((m) => m.id),
    sheet.moduleLabels,
    labels,
  );
  const changed = mapTexts(sheet, (t) => relabelText(t, renames), true);
  const next = stored(labels);
  if (next) sheet.moduleLabels = next;
  else delete sheet.moduleLabels;
  return changed;
}

/**
 * Met tout le jeu aux numéros `labels` : textes réécrits, numéros enregistrés sur chaque planche, planches « une par
 * Viewbox » remises dans l'ordre des nouveaux numéros quand elles étaient dans l'ordre des anciens (un ordre choisi à
 * la main est gardé), planches renumérotées. Renvoie le nombre de planches dont un texte a changé et si l'ordre a changé.
 */
export function relabelDrawingSet(set: DrawingSet, labels: ModuleLabels, modules: Mod[]): { texts: number; reordered: boolean } {
  // nom de la box de chaque planche « une par Viewbox », avant et après
  const names = new Map<string, { before: string; after: string }>();
  for (const s of set.sheets) {
    const m = sheetModule(s as Sheet);
    if (m) names.set(s.id, { before: labelOf(s.moduleLabels, m), after: labelOf(labels, m) });
  }
  let texts = 0;
  for (const s of set.sheets) if (relabelSheet(s as Sheet, labels, modules)) texts++;
  // suites de planches « une par Viewbox » consécutives (même série d'unité) : retriées si elles étaient triées
  const order = [...set.sheets];
  let reordered = false;
  let i = 0;
  while (i < order.length) {
    const unit = order[i].unit ?? 0;
    let j = i;
    while (j < order.length && names.has(order[j].id) && (order[j].unit ?? 0) === unit) j++;
    if (j - i >= 2) {
      const run = order.slice(i, j);
      const sortedBefore = run.every((s, k) => k === 0 || compareLabels(names.get(run[k - 1].id)!.before, names.get(s.id)!.before) <= 0);
      if (sortedBefore) {
        const sorted = run
          .map((s, k) => ({ s, k }))
          .sort((a, b) => compareLabels(names.get(a.s.id)!.after, names.get(b.s.id)!.after) || a.k - b.k)
          .map((x) => x.s);
        if (sorted.some((s, k) => s !== run[k])) {
          order.splice(i, j - i, ...sorted);
          reordered = true;
        }
      }
    }
    i = Math.max(j, i + 1);
  }
  if (reordered) {
    set.sheets.splice(0, set.sheets.length, ...order);
    renumber(set.sheets as Sheet[]);
  }
  return { texts, reordered };
}
