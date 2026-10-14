// Liste des produits Odoo (export « Quants ») : lecture, fusion dans le catalogue, fichier généré à jour.
// LOADING_WRITE=1 (scripts/import-odoo.mjs) réécrit src/loading/library/odoo.data.ts.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { CatalogueItem } from '../../src/loading/core/types';
import type { ImportResult } from '../../src/loading/library/importClasseur';
import { mergeOdoo, odooSource, readOdooProducts } from '../../src/loading/library/odoo';
import type { Workbook } from '../../src/loading/xlsx/read';
import { readXlsx } from '../../src/loading/xlsx/read';

const FILE = process.env.LOADING_ODOO ?? path.resolve(__dirname, '../../../docs/loading/Quants (stock.quant) (2).xlsx');
const DATA = path.resolve(__dirname, '../../src/loading/library/odoo.data.ts');

const wb = (rows: (string | number | null)[][]): Workbook => ({ sheets: [{ name: 'Sheet1', rows: rows.map((r) => r.map((v) => ({ v, fill: null }))) }] });
const item = (ref: string, designation: string): CatalogueItem => ({ ref, designation, gros: false, categorie: 'structure', unit: 'pce', source: 'classeur' });
const imported = (catalogue: CatalogueItem[]): ImportResult => ({ rules: [], observations: [], catalogue, issues: [], catalogueToAdd: [], sheetNames: [] });

describe('export Odoo', () => {
  it('lit les références, fusionne les emplacements, ignore ce qui n’est pas une référence', () => {
    const r = readOdooProducts(
      wb([
        ['Product Reference Code', 'Product', 'Counted Quantity'],
        ['4-700-065', '[4-700-065] Window/Wall Rubber black BIG 2550mm |VIEWBOX|', 200],
        ['4-700-065', '[4-700-065] Window/Wall Rubber black BIG 2550mm |VIEWBOX|', 0],
        ['4-720-011', '[4-720-011] Viewbox Poles Rubber black FLAT adhésive 20X4mm /M |VIEWBOX|', 0],
        ['testplate', 'Test Plate', 0],
        [null, 'CAR-RAMP | 315 X 3100 | 2X VIEWBOX', 0],
      ]),
    );
    expect(r.products).toEqual([
      { ref: '4-700-065', name: 'Window/Wall Rubber black BIG 2550mm |VIEWBOX|' },
      { ref: '4-720-011', name: 'Viewbox Poles Rubber black FLAT adhésive 20X4mm /M |VIEWBOX|' },
    ]);
    expect(r.ignored).toEqual(['testplate (Test Plate)', 'CAR-RAMP | 315 X 3100 | 2X VIEWBOX']);
    expect(() => readOdooProducts(wb([['Ref', 'Nom']]))).toThrow(/introuvables/);
  });

  it('complète le catalogue : code Odoo, désignation d’Odoo, références ajoutées', () => {
    const r = mergeOdoo(imported([item('4-700-065', 'Window/Wall Rubber black BIG 2550mm |VIEWBOX|'), item('7-636-006', 'TUV WALL Painted'), item('7-632-001', 'FLOOR MODULE')]), [
      { ref: '4-700-065', name: 'Window/Wall Rubber black  BIG 2550mm |VIEWBOX|' },
      { ref: '7-636-006', name: 'Nidaplast / TUV WALL Vinyle White/7024' },
      { ref: '4-720-011', name: 'Viewbox Poles Rubber black FLAT adhésive 20X4mm /M |VIEWBOX|' },
      { ref: '4-740-010', name: 'Laminate vinyle click parquet LAMETT DOURO HONEY| VIEWBOX | /m²' },
    ]);
    const c = new Map(r.catalogue.map((x) => [x.ref, x]));
    expect(c.get('4-700-065')).toMatchObject({ odoo: '4-700-065', designation: 'Window/Wall Rubber black BIG 2550mm |VIEWBOX|' });
    expect(c.get('7-636-006')?.designation).toBe('Nidaplast / TUV WALL Vinyle White/7024');
    expect(c.get('7-632-001')?.odoo).toBeUndefined();
    expect(c.get('4-720-011')).toMatchObject({ source: 'odoo', unit: 'm', categorie: 'joints' });
    expect(c.get('4-740-010')).toMatchObject({ source: 'odoo', unit: 'm2', categorie: 'consommables' });
    expect(r.issues.map((i) => i.article)).toEqual(['7-636-006', '4-720-011', '4-740-010']);
  });
});

describe.skipIf(!existsSync(FILE))('fichier Odoo de docs/loading', () => {
  const { products } = readOdooProducts(readXlsx(readFileSync(FILE)));
  it('produits Viewbox', () => {
    expect(products.length).toBeGreaterThan(200);
    expect(products.find((p) => p.ref === '7-962-016')?.name).toBe('VIEWBOX STANDARD M16 60 MM 5900x2500 H3');
  });
  it(process.env.LOADING_WRITE ? 'écrit odoo.data.ts' : 'odoo.data.ts est à jour (sinon : node scripts/import-odoo.mjs)', () => {
    const content = odooSource(products, path.basename(FILE));
    if (process.env.LOADING_WRITE) writeFileSync(DATA, content);
    else expect(readFileSync(DATA, 'utf8')).toBe(content);
  });
});
