// Export DXF des planches (chargé à la demande) : un fichier par planche, plusieurs planches = un .zip, ou tout le
// jeu dans un seul DXF (planches côte à côte).
import { strToU8, zipSync } from 'fflate';
import type { Sheet, ViewportItem } from '../types';
import { PAPER_MM } from '../template';
import { DxfDocument } from './writer';
import { sheetMarkupToDxf, svgToDxf } from './svgToDxf';
import type { DxfViewport } from './svgToDxf';

/** « paper » : la planche comme le PDF (1 unité = 1 mm papier) ; « real » : les vues en grandeur réelle (1 unité = 1 mm). */
export type DxfMode = 'paper' | 'real';

export interface DxfFile {
  name: string;
  dxf: string;
  entities: number;
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
}

/** DXF d'une planche à partir de son SVG (SheetSvg sans édition) ; null si rien à exporter (grandeur réelle sans vue calculée). */
function dxfViewports(sheet: Sheet, computed: (vp: ViewportItem) => boolean): DxfViewport[] {
  return sheet.items.filter((i): i is ViewportItem => i.type === 'viewport' && i.scale > 0 && computed(i)).map((v) => ({ id: v.id, rect: v.rect, scale: v.scale }));
}

export function sheetDxf(sheet: Sheet, markup: string, mode: DxfMode, computed: (vp: ViewportItem) => boolean, baseName: string): DxfFile | null {
  const viewports = dxfViewports(sheet, computed);
  if (mode === 'real' && !viewports.length) return null;
  const { dxf, entities } = sheetMarkupToDxf(markup, { paper: PAPER_MM[sheet.paper], mode, viewports });
  if (!entities) return null;
  const suffix = mode === 'real' ? 'grandeur-reelle' : sheet.paper;
  return { name: safeFileName(`${baseName}_${sheet.number || sheet.title}_${suffix}.dxf`), dxf, entities };
}

/** Plusieurs DXF dans un .zip (noms rendus uniques). */
export function zipDxf(files: DxfFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    let name = f.name;
    for (let i = 2; entries[name]; i++) name = f.name.replace(/\.dxf$/, `_${i}.dxf`);
    entries[name] = strToU8(f.dxf);
  }
  return zipSync(entries, { level: 6 });
}

/**
 * Tout le jeu dans un seul DXF : les planches côte à côte de gauche à droite dans l'ordre du jeu, 100 mm papier
 * entre deux planches, nom de chaque planche au-dessus (calque VBX-PLANCHES). En grandeur réelle chaque bloc est à
 * l'échelle de sa plus grande vue (comme le DXF d'une planche seule) ; planches sans vue calculée ignorées.
 */
export function setDxf(sheets: Array<{ sheet: Sheet; markup: string }>, mode: DxfMode, computed: (vp: ViewportItem) => boolean, baseName: string): (DxfFile & { sheets: number }) | null {
  const doc = new DxfDocument();
  let x = 0;
  let count = 0;
  for (const { sheet, markup } of sheets) {
    const viewports = dxfViewports(sheet, computed);
    if (mode === 'real' && !viewports.length) continue;
    const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement;
    if (!parsed || parsed.tagName.toLowerCase() !== 'svg') throw new Error('SVG de planche invalide');
    const before = doc.entityCount;
    const paper = PAPER_MM[sheet.paper];
    const k = mode === 'real' ? Math.max(1, ...viewports.map((v) => v.scale)) : 1;
    svgToDxf(parsed, { paper, mode, viewports, doc, origin: { x, y: 0 }, label: `${sheet.number} ${sheet.title}`.trim() });
    if (doc.entityCount === before) continue;
    x += (paper.w + 100) * k;
    count++;
  }
  if (!count) return null;
  const suffix = mode === 'real' ? 'grandeur-reelle' : 'planches';
  return { name: safeFileName(`${baseName}_jeu-complet_${suffix}.dxf`), dxf: doc.toString(), entities: doc.entityCount, sheets: count };
}
