// Duplication de planches (pur, testé) : copie d'une planche avec de nouveaux identifiants et toutes ses références
// internes réécrites (repères, cotes et symboles attachés à leur fenêtre de vue), placement de plusieurs copies dans le
// jeu, et « Dupliquer pour d'autres Viewbox » (vues, sous-ensemble et ancrages 3D repointés sur une autre box).
import type { ModuleFrame, Vec3, ViewBasis } from '../core/views';
import { projectPoint, unprojectPoint, viewBasis } from '../core/views';
import type { SceneIndex } from '../core/types';
import { subsetForModule } from '../core/subset';
import type { Image3dItem, Sheet, SheetItem, ViewportItem } from './types';

type NewId = (prefix: string) => string;

/** Copie d'une planche : nouvel id pour la planche et chaque élément, références vers les fenêtres de vue réécrites. */
export function cloneSheet(src: Sheet, newId: NewId): Sheet {
  const copy = structuredClone(src);
  copy.id = newId('s');
  const map = new Map<string, string>();
  for (const it of copy.items) {
    const nid = newId(it.type[0]);
    map.set(it.id, nid);
    it.id = nid;
  }
  for (const it of copy.items) if ((it.type === 'label' || it.type === 'dimension' || it.type === 'symbol') && it.viewportId) it.viewportId = map.get(it.viewportId) ?? it.viewportId;
  return copy;
}

/** Une copie à poser juste après la planche `after` (id d'une planche du jeu ou d'une copie déjà posée). */
export interface PlacedCopy {
  sourceId: string;
  copy: Sheet;
  after: string;
}

/**
 * Copies de plusieurs planches, dans l'ordre du jeu. Toutes dans la même série (unité) : les copies à la suite de la
 * dernière planche sélectionnée, dans le même ordre ; sur plusieurs unités : chaque copie juste après son original
 * (elle garde son unité).
 */
export function planDuplicates(sheets: Sheet[], ids: string[], newId: NewId): PlacedCopy[] {
  const wanted = new Set(ids);
  const chosen = sheets.filter((s) => wanted.has(s.id));
  if (!chosen.length) return [];
  const sameSeries = new Set(chosen.map((s) => s.unit ?? 0)).size === 1;
  const out: PlacedCopy[] = [];
  let after = chosen[chosen.length - 1].id;
  for (const s of chosen) {
    const copy = cloneSheet(s, newId);
    if (sameSeries) {
      out.push({ sourceId: s.id, copy, after });
      after = copy.id;
    } else out.push({ sourceId: s.id, copy, after: s.id });
  }
  return out;
}

/** Pose les copies dans la liste (en place). */
export function insertCopies(sheets: Sheet[], copies: PlacedCopy[]): void {
  for (const c of copies) {
    const at = sheets.findIndex((s) => s.id === c.after);
    sheets.splice(at < 0 ? sheets.length : at + 1, 0, c.copy);
  }
}

/**
 * Déplace un groupe de planches juste après `targetId` (ou en tête si `targetId` vaut null), dans l'ordre du jeu ;
 * jeu séparé en unités : le groupe prend l'unité de la planche cible.
 */
export function moveGroupAfter(sheets: Sheet[], ids: string[], targetId: string | null, withUnits: boolean): void {
  const wanted = new Set(ids);
  if (targetId && wanted.has(targetId)) return;
  const group = sheets.filter((s) => wanted.has(s.id));
  if (!group.length) return;
  const rest = sheets.filter((s) => !wanted.has(s.id));
  const t = targetId ? rest.findIndex((s) => s.id === targetId) : -1;
  if (targetId && t < 0) return;
  const unit = targetId ? rest[t].unit : rest[0]?.unit;
  if (withUnits)
    for (const s of group) {
      if (unit) s.unit = unit;
      else delete s.unit;
    }
  rest.splice(t + 1, 0, ...group);
  sheets.splice(0, sheets.length, ...rest);
}

// ─── « Dupliquer pour d'autres Viewbox » ───

/** Viewbox d'une planche « une par Viewbox » : celle de toutes ses vues relatives à une box, si elle est unique. */
export function sheetModule(sheet: Sheet): string | null {
  const ids = new Set<string>();
  for (const it of sheet.items) {
    if (it.type !== 'viewport' || it.custom || it.request.view.kind === 'custom') continue;
    const f = it.request.view.frame;
    if (f && typeof f === 'object') ids.add(f.moduleId);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

/** Point monde de la box `from` vers la même position dans la box `to` (repères des deux Viewbox). */
export function mapBetweenFrames(p: Vec3, from: ModuleFrame, to: ModuleFrame): Vec3 {
  const d: Vec3 = [p[0] - from.origin[0], p[1] - from.origin[1], p[2] - from.origin[2]];
  const lx = d[0] * from.xAxis[0] + d[1] * from.xAxis[1] + d[2] * from.xAxis[2];
  const ly = d[0] * from.yAxis[0] + d[1] * from.yAxis[1] + d[2] * from.yAxis[2];
  const lz = d[0] * from.up[0] + d[1] * from.up[1] + d[2] * from.up[2];
  return [0, 1, 2].map((i) => to.origin[i] + lx * to.xAxis[i] + ly * to.yAxis[i] + lz * to.up[i]) as Vec3;
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && b.every((x) => a.includes(x));

export interface RetargetResult {
  sheet: Sheet;
  /** fenêtres de vue repointées (à recalculer : centrage et cotes automatiques) */
  viewportIds: string[];
  /** fenêtres qui avaient des cotes automatiques (à refaire après calcul) */
  autoDimViewportIds: string[];
  warnings: string[];
}

/**
 * Planche copiée pour une autre Viewbox : vues relatives à `from` repointées sur `to` (sous-ensemble de la box
 * remplacé), titres « … VBX-01 » → « … VBX-05 », cotes automatiques retirées (refaites après le calcul), cotes
 * manuelles, repères et symboles transportés par les repères des deux box (retirés avec avertissement si la box cible
 * est d'un autre type), images 3D marquées « à refaire ».
 */
export function retargetSheet(sheet: Sheet, from: string, to: string, ctx: { index: SceneIndex; frames: ReadonlyMap<string, ModuleFrame> }, newId: NewId): RetargetResult {
  const copy = cloneSheet(sheet, newId);
  const fa = ctx.frames.get(from);
  const fb = ctx.frames.get(to);
  const ma = ctx.index.modules.find((m) => m.id === from);
  const mb = ctx.index.modules.find((m) => m.id === to);
  const warnings: string[] = [];
  const sameType = !!ma && !!mb && (ma.type ?? '') === (mb.type ?? '');
  const subA = subsetForModule(ctx.index, from);
  const subB = subsetForModule(ctx.index, to);
  const rename = (s: string) => {
    const r = s.split(from).join(to);
    return ma?.type && mb?.type && ma.type !== mb.type ? r.split(ma.type).join(mb.type) : r;
  };
  copy.title = rename(copy.title);
  const bases = new Map<string, { a: ViewBasis; b: ViewBasis }>();
  const viewportIds: string[] = [];
  const autoDim = new Set<string>();
  for (const it of copy.items) {
    if (it.type !== 'viewport' || it.custom) continue;
    const before = it.request.view;
    if (before.kind === 'custom') continue;
    const f = before.frame;
    if (!f || typeof f !== 'object' || f.moduleId !== from) continue;
    let a: ViewBasis | undefined;
    try {
      a = viewBasis(before, ctx.frames);
    } catch {
      a = undefined;
    }
    it.request = {
      ...it.request,
      view: { ...before, frame: { moduleId: to } },
      subset: { ...it.request.subset, include: sameSet(it.request.subset.include, subA) ? subB : it.request.subset.include.filter((id) => !subA.includes(id)).concat(subB) },
    };
    let b: ViewBasis | undefined;
    try {
      b = viewBasis(it.request.view, ctx.frames);
    } catch {
      b = undefined;
    }
    if (a && b) bases.set(it.id, { a, b });
    delete it.lineworkKey;
    delete it.center;
    if (it.label) it.label = rename(it.label);
    viewportIds.push(it.id);
  }
  const moved = new Set(viewportIds);
  const map = (p: Vec3) => (fa && fb ? mapBetweenFrames(p, fa, fb) : p);
  let dropped = 0;
  copy.items = copy.items.filter((it: SheetItem) => {
    if (it.type === 'dimension' && moved.has(it.viewportId)) {
      if (it.auto) {
        autoDim.add(it.viewportId);
        return false;
      }
      if (!sameType || !fa || !fb) {
        dropped++;
        return false;
      }
      it.anchors3d = it.anchors3d.map(map);
      return true;
    }
    if (it.type === 'label' && it.viewportId && moved.has(it.viewportId) && it.anchor3d) {
      if (!sameType || !fa || !fb) {
        dropped++;
        return false;
      }
      it.anchor3d = map(it.anchor3d);
      return true;
    }
    if (it.type === 'symbol' && it.viewportId && moved.has(it.viewportId) && it.model) {
      const bb = bases.get(it.viewportId);
      if (!sameType || !fa || !fb || !bb) {
        dropped++;
        return false;
      }
      const q = projectPoint(bb.b, map(unprojectPoint(bb.a, it.model[0], it.model[1], 0)));
      it.model = [q.x, q.y];
      return true;
    }
    if (it.type === 'text' && it.text.includes(from)) it.text = rename(it.text);
    if (it.type === 'image3d') (it as Image3dItem).retake = { include: subB };
    return true;
  });
  if (dropped) warnings.push(`${dropped} cote(s) / repère(s) retiré(s) : ${to} n’est pas du même type que ${from}`);
  if (copy.items.some((i) => i.type === 'image3d')) warnings.push('Image 3D à refaire (« Recapturer » dans ses propriétés)');
  return { sheet: copy, viewportIds, autoDimViewportIds: [...autoDim], warnings };
}

/** Fenêtres de vue d'une planche. */
export const viewportsOf = (s: Sheet) => s.items.filter((i): i is ViewportItem => i.type === 'viewport');
