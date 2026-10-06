// Export DXF des planches (chargé à la demande) : un fichier par planche, plusieurs planches = un .zip.
import { strToU8, zipSync } from 'fflate';
import type { Sheet, ViewportItem } from '../types';
import { PAPER_MM } from '../template';
import { sheetMarkupToDxf } from './svgToDxf';
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
export function sheetDxf(sheet: Sheet, markup: string, mode: DxfMode, computed: (vp: ViewportItem) => boolean, baseName: string): DxfFile | null {
  const viewports: DxfViewport[] = sheet.items.filter((i): i is ViewportItem => i.type === 'viewport' && i.scale > 0 && computed(i)).map((v) => ({ id: v.id, rect: v.rect, scale: v.scale }));
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
