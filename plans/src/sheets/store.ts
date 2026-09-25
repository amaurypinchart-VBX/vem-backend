// État de l'éditeur de planches : Zustand + Immer. Chaque modification enregistre ses patches Immer
// (et leurs inverses) : annuler / rétablir illimités, sans copier tout le document.
import { create } from 'zustand';
import { applyPatches, enablePatches, produceWithPatches } from 'immer';
import type { Draft, Patch } from 'immer';
import type { DimensionItem, DrawingSet, PointMm, RectMm, Sheet, SheetItem } from './types';
import { hasRect } from './types';
import { newId, renumber } from './generate';
import { dimOffsetAfterDrag } from './dimensions';

enablePatches();

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
}

export interface EditorState {
  doc: DrawingSet | null;
  sheetId: string | null;
  selection: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** incrémenté à chaque modification du document (enregistrement automatique) */
  version: number;
  clipboard: SheetItem[];
  load: (doc: DrawingSet) => void;
  close: () => void;
  apply: (label: string, recipe: (d: Draft<DrawingSet>) => void) => void;
  /** modification dérivée (ex. clé du calcul d'une vue) : enregistrée, mais pas dans l'historique */
  patchSilently: (recipe: (d: Draft<DrawingSet>) => void) => void;
  undo: () => void;
  redo: () => void;
  setSheet: (id: string) => void;
  select: (ids: string[]) => void;
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: null,
  sheetId: null,
  selection: [],
  past: [],
  future: [],
  version: 0,
  clipboard: [],
  load: (doc) => set({ doc, sheetId: doc.sheets[0]?.id ?? null, selection: [], past: [], future: [], version: 0 }),
  close: () => set({ doc: null, sheetId: null, selection: [], past: [], future: [] }),
  apply: (label, recipe) => {
    const { doc, past } = get();
    if (!doc) return;
    const [next, patches, inverse] = produceWithPatches(doc, recipe);
    if (!patches.length) return;
    set({ doc: next, past: [...past.slice(-199), { label, patches, inverse }], future: [], version: get().version + 1 });
    // la sélection ne garde que des éléments qui existent encore
    const sheet = next.sheets.find((s) => s.id === get().sheetId) ?? next.sheets[0];
    const ids = new Set(sheet?.items.map((i) => i.id));
    set({ sheetId: sheet?.id ?? null, selection: get().selection.filter((id) => ids.has(id)) });
  },
  patchSilently: (recipe) => {
    const { doc } = get();
    if (!doc) return;
    const [next, patches] = produceWithPatches(doc, recipe);
    if (!patches.length) return;
    set({ doc: next, version: get().version + 1 });
  },
  undo: () => {
    const { doc, past, future } = get();
    const e = past[past.length - 1];
    if (!doc || !e) return;
    const next = applyPatches(doc, e.inverse);
    set({ doc: next, past: past.slice(0, -1), future: [...future, e], version: get().version + 1 });
    if (!next.sheets.some((s) => s.id === get().sheetId)) set({ sheetId: next.sheets[0]?.id ?? null, selection: [] });
  },
  redo: () => {
    const { doc, past, future } = get();
    const e = future[future.length - 1];
    if (!doc || !e) return;
    const next = applyPatches(doc, e.patches);
    set({ doc: next, past: [...past, e], future: future.slice(0, -1), version: get().version + 1 });
    if (!next.sheets.some((s) => s.id === get().sheetId)) set({ sheetId: next.sheets[0]?.id ?? null, selection: [] });
  },
  setSheet: (id) => set({ sheetId: id, selection: [] }),
  select: (ids) => set({ selection: ids }),
}));

// ─── actions sur le document (chacune = une entrée d'historique) ───
const findSheet = (d: Draft<DrawingSet>, id: string | null) => d.sheets.find((s) => s.id === id);

export const actions = {
  addItems(items: SheetItem[], label = 'Ajouter') {
    const { sheetId } = useEditor.getState();
    useEditor.getState().apply(label, (d) => {
      findSheet(d, sheetId)?.items.push(...(items as Draft<SheetItem>[]));
    });
    useEditor.getState().select(items.map((i) => i.id));
  },
  updateItem(id: string, patch: Partial<SheetItem>, label = 'Modifier') {
    const { sheetId } = useEditor.getState();
    useEditor.getState().apply(label, (d) => {
      const it = findSheet(d, sheetId)?.items.find((i) => i.id === id);
      if (it) Object.assign(it, patch);
    });
  },
  /** déplace les éléments (et les repères ancrés sur la planche) de (dx, dy) mm */
  moveItems(ids: string[], dx: number, dy: number) {
    if (!dx && !dy) return;
    const { sheetId } = useEditor.getState();
    useEditor.getState().apply('Déplacer', (d) => {
      for (const it of findSheet(d, sheetId)?.items ?? []) {
        if (!ids.includes(it.id) || it.locked) continue;
        if (hasRect(it as SheetItem)) {
          const r = (it as { rect: RectMm }).rect;
          r.x += dx;
          r.y += dy;
          const lp = (it as { labelPos?: PointMm }).labelPos;
          if (lp) {
            lp.x += dx;
            lp.y += dy;
          }
        } else if (it.type === 'dimension') {
          it.offsetMm = dimOffsetAfterDrag(it as DimensionItem, dx, dy);
        } else if (it.type === 'label') {
          it.textPos.x += dx;
          it.textPos.y += dy;
          if (it.anchorPaper) {
            it.anchorPaper.x += dx;
            it.anchorPaper.y += dy;
          }
        }
      }
    });
  },
  setRect(id: string, rect: RectMm) {
    actions.updateItem(id, { rect } as Partial<SheetItem>, 'Redimensionner');
  },
  deleteItems(ids: string[]) {
    const { sheetId } = useEditor.getState();
    useEditor.getState().apply('Supprimer', (d) => {
      const s = findSheet(d, sheetId);
      if (!s) return;
      // repères et cotes attachés à une vue supprimée disparaissent avec elle
      s.items = s.items.filter((i) => !ids.includes(i.id) && !((i.type === 'label' || i.type === 'dimension') && i.viewportId && ids.includes(i.viewportId)));
    });
    useEditor.getState().select([]);
  },
  copy(ids: string[]) {
    const { doc, sheetId } = useEditor.getState();
    const s = doc?.sheets.find((x) => x.id === sheetId);
    if (!s) return;
    useEditor.setState({ clipboard: structuredClone(s.items.filter((i) => ids.includes(i.id))) });
  },
  /** colle (sur la planche active, même position si autre planche, décalée de 5 mm sinon) */
  paste() {
    const { clipboard, doc, sheetId } = useEditor.getState();
    if (!clipboard.length || !doc) return;
    const sheet = doc.sheets.find((s) => s.id === sheetId);
    const sameSheet = sheet?.items.some((i) => clipboard.some((c) => c.id === i.id));
    const off = sameSheet ? 5 : 0;
    const map = new Map<string, string>();
    const items = structuredClone(clipboard).map((it) => {
      const id = newId(it.type[0]);
      map.set(it.id, id);
      return { ...it, id };
    });
    for (const it of items) {
      if (hasRect(it)) {
        it.rect.x += off;
        it.rect.y += off;
        if ('labelPos' in it && it.labelPos) it.labelPos = { x: it.labelPos.x + off, y: it.labelPos.y + off };
      } else if (it.type === 'dimension') {
        // une cote n'existe que dans sa vue : collée avec sa vue, ou sur la même planche
        const vid = map.get(it.viewportId) ?? (sheet?.items.some((i) => i.id === it.viewportId) ? it.viewportId : undefined);
        if (vid) it.viewportId = vid;
        else it.viewportId = '';
      } else {
        it.textPos = { x: it.textPos.x + off, y: it.textPos.y + off };
        if (it.viewportId) it.viewportId = map.get(it.viewportId) ?? (sheet?.items.some((i) => i.id === it.viewportId) ? it.viewportId : undefined);
        if (!it.viewportId && it.anchor3d) it.anchorPaper = it.anchorPaper ?? { x: it.textPos.x - 10, y: it.textPos.y + 10 };
      }
    }
    actions.addItems(
      items.filter((it) => it.type !== 'dimension' || it.viewportId),
      'Coller',
    );
  },
  toggleLock(ids: string[]) {
    const { doc, sheetId } = useEditor.getState();
    const s = doc?.sheets.find((x) => x.id === sheetId);
    const lock = !s?.items.filter((i) => ids.includes(i.id)).every((i) => i.locked);
    useEditor.getState().apply(lock ? 'Verrouiller' : 'Déverrouiller', (d) => {
      for (const it of findSheet(d, sheetId)?.items ?? []) if (ids.includes(it.id)) it.locked = lock;
    });
  },
  /** alignement des éléments sélectionnés (bords ou centres) */
  align(ids: string[], mode: 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom') {
    const { doc, sheetId } = useEditor.getState();
    const items = (doc?.sheets.find((s) => s.id === sheetId)?.items ?? []).filter((i) => ids.includes(i.id) && hasRect(i) && !i.locked);
    if (items.length < 2) return;
    const rects = items.map((i) => (i as { rect: RectMm }).rect);
    const minX = Math.min(...rects.map((r) => r.x));
    const maxX = Math.max(...rects.map((r) => r.x + r.w));
    const minY = Math.min(...rects.map((r) => r.y));
    const maxY = Math.max(...rects.map((r) => r.y + r.h));
    useEditor.getState().apply('Aligner', (d) => {
      for (const it of findSheet(d, sheetId)?.items ?? []) {
        if (!items.some((x) => x.id === it.id)) continue;
        const r = (it as { rect: RectMm }).rect;
        const lp = (it as { labelPos?: PointMm }).labelPos;
        const ox = r.x;
        const oy = r.y;
        if (mode === 'left') r.x = minX;
        if (mode === 'right') r.x = maxX - r.w;
        if (mode === 'hcenter') r.x = (minX + maxX) / 2 - r.w / 2;
        if (mode === 'top') r.y = minY;
        if (mode === 'bottom') r.y = maxY - r.h;
        if (mode === 'vcenter') r.y = (minY + maxY) / 2 - r.h / 2;
        if (lp) {
          lp.x += r.x - ox;
          lp.y += r.y - oy;
        }
      }
    });
  },
  /** répartition régulière (espaces égaux) horizontale ou verticale */
  distribute(ids: string[], axis: 'h' | 'v') {
    const { doc, sheetId } = useEditor.getState();
    const items = (doc?.sheets.find((s) => s.id === sheetId)?.items ?? []).filter((i) => ids.includes(i.id) && hasRect(i) && !i.locked) as Array<SheetItem & { rect: RectMm }>;
    if (items.length < 3) return;
    const key = axis === 'h' ? 'x' : 'y';
    const size = axis === 'h' ? 'w' : 'h';
    const sorted = [...items].sort((a, b) => a.rect[key] - b.rect[key]);
    const start = sorted[0].rect[key];
    const end = sorted[sorted.length - 1].rect[key] + sorted[sorted.length - 1].rect[size];
    const total = sorted.reduce((a, i) => a + i.rect[size], 0);
    const gap = (end - start - total) / (sorted.length - 1);
    const pos = new Map<string, number>();
    let p = start;
    for (const i of sorted) {
      pos.set(i.id, p);
      p += i.rect[size] + gap;
    }
    useEditor.getState().apply('Répartir', (d) => {
      for (const it of findSheet(d, sheetId)?.items ?? []) {
        const v = pos.get(it.id);
        if (v === undefined) continue;
        const r = (it as { rect: RectMm }).rect;
        const lp = (it as { labelPos?: PointMm }).labelPos;
        const delta = v - r[key];
        r[key] = v;
        if (lp) lp[key] += delta;
      }
    });
  },
  // ─── planches ───
  addSheet(sheet: Sheet) {
    useEditor.getState().apply('Nouvelle planche', (d) => {
      d.sheets.push(sheet as Draft<Sheet>);
      renumber(d.sheets as Sheet[]);
    });
    useEditor.getState().setSheet(sheet.id);
  },
  duplicateSheet(id: string) {
    const { doc } = useEditor.getState();
    const src = doc?.sheets.find((s) => s.id === id);
    if (!src) return;
    const copy = structuredClone(src);
    copy.id = newId('s');
    const map = new Map<string, string>();
    for (const it of copy.items) {
      const nid = newId(it.type[0]);
      map.set(it.id, nid);
      it.id = nid;
    }
    for (const it of copy.items) if ((it.type === 'label' || it.type === 'dimension') && it.viewportId) it.viewportId = map.get(it.viewportId) ?? it.viewportId;
    useEditor.getState().apply('Dupliquer la planche', (d) => {
      const at = d.sheets.findIndex((s) => s.id === id);
      d.sheets.splice(at + 1, 0, copy as Draft<Sheet>);
      renumber(d.sheets as Sheet[]);
    });
    useEditor.getState().setSheet(copy.id);
  },
  deleteSheet(id: string) {
    useEditor.getState().apply('Supprimer la planche', (d) => {
      d.sheets = d.sheets.filter((s) => s.id !== id);
      renumber(d.sheets as Sheet[]);
    });
  },
  moveSheet(id: string, delta: -1 | 1) {
    useEditor.getState().apply('Déplacer la planche', (d) => {
      const i = d.sheets.findIndex((s) => s.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= d.sheets.length) return;
      const [s] = d.sheets.splice(i, 1);
      d.sheets.splice(j, 0, s);
      renumber(d.sheets as Sheet[]);
    });
  },
  updateSheet(id: string, patch: Partial<Pick<Sheet, 'title' | 'number' | 'paper'>>) {
    useEditor.getState().apply('Modifier la planche', (d) => {
      const s = d.sheets.find((x) => x.id === id);
      if (s) Object.assign(s, patch);
    });
  },
};
