// « ⬇ Liste peinture (Excel) » : couleurs du projet (repère, code, nom, finition, produit, surface), surfaces par
// Viewbox et liste des zones. Pur (écrivain .xlsx de la loading liste).
import type { XCell, XSheet, XStyle } from '../../loading/xlsx/write';
import { writeXlsx } from '../../loading/xlsx/write';
import { colorCode } from './ops';
import type { PaintSettings } from './types';

export interface PaintAreas {
  byColor: Map<string, number>;
  byZone: Map<string, number>;
  byColorModule: Map<string, Map<string, number>>;
  noEffect: Set<string>;
}

const STYLES: Record<string, XStyle> = {
  title: { bold: true, size: 14 },
  head: { bold: true, fill: 'DDEBF7', border: true },
  cell: { border: true },
  num: { border: true, number: 'dec', align: 'right' },
  total: { bold: true, border: true, number: 'dec', align: 'right' },
  warn: { border: true, color: 'B45309' },
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function paintListSheets(paint: PaintSettings, areas: PaintAreas, title: string): XSheet[] {
  const h = (v: string): XCell => ({ v, s: 'head' });
  const c = (v: string | number | null): XCell => ({ v, s: typeof v === 'number' ? 'num' : 'cell' });
  const colors: XSheet = {
    name: 'Couleurs',
    columns: [8, 14, 30, 12, 26, 30, 8, 12],
    freezeRows: 3,
    rows: [
      [{ v: `Liste peinture — ${title}`, s: 'title' }],
      [],
      [h('Repère'), h('Code'), h('Nom'), h('Finition'), h('Produit / fournisseur'), h('Note'), h('Zones'), h('Surface (m²)')],
      ...paint.colors.map((col) => [
        c(col.tag),
        c(colorCode(col) || col.code || ''),
        c(col.name),
        c(col.finish ?? ''),
        c(col.product ?? ''),
        c(col.note ?? ''),
        c(paint.zones.filter((z) => z.colorId === col.id).length),
        c(r2(areas.byColor.get(col.id) ?? 0)),
      ]),
      [c('Total'), c(''), c(''), c(''), c(''), c(''), c(paint.zones.length), { v: r2([...areas.byColor.values()].reduce((s, v) => s + v, 0)), s: 'total' }],
    ],
  };
  const modules = [...new Set([...areas.byColorModule.values()].flatMap((m) => [...m.keys()]))].sort();
  const perBox: XSheet = {
    name: 'Par Viewbox',
    columns: [16, ...paint.colors.map(() => 12), 12],
    freezeRows: 1,
    rows: [
      [h('Viewbox'), ...paint.colors.map((col) => h(`${col.tag} ${colorCode(col)}`.trim())), h('Total (m²)')],
      ...modules.map((m) => {
        const vals = paint.colors.map((col) => r2(areas.byColorModule.get(col.id)?.get(m) ?? 0));
        return [c(m === '—' ? 'Hors Viewbox' : m), ...vals.map(c), { v: r2(vals.reduce((s, v) => s + v, 0)), s: 'total' } as XCell];
      }),
    ],
  };
  const zones: XSheet = {
    name: 'Zones',
    columns: [8, 14, 70, 12, 14],
    freezeRows: 1,
    rows: [
      [h('Repère'), h('Code'), h('Zone'), h('Surface (m²)'), h('État')],
      ...paint.zones.map((z) => {
        const col = paint.colors.find((x) => x.id === z.colorId);
        const dead = areas.noEffect.has(z.id);
        return [c(col?.tag ?? ''), c(col ? colorCode(col) : ''), c(z.label), c(dead ? null : r2(areas.byZone.get(z.id) ?? 0)), { v: dead ? 'sans effet' : 'ok', s: dead ? 'warn' : 'cell' } as XCell];
      }),
    ],
  };
  return [colors, perBox, zones];
}

export function paintListXlsx(paint: PaintSettings, areas: PaintAreas, title: string): Uint8Array {
  return writeXlsx(paintListSheets(paint, areas, title), STYLES);
}
