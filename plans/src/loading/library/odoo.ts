// Liste des produits Odoo (export « Quants (stock.quant) » : Product Reference Code · Product · Counted Quantity) →
// produits connus d'Odoo. La « Product Reference Code » d'Odoo est la référence Viewbox elle-même (4-700-065…) :
// c'est le code des lignes exportées vers Odoo. Les quantités comptées (inventaire) ne sont pas gardées.
// Fonctions pures : `readOdooProducts` lit le fichier, `mergeOdoo` complète le catalogue du classeur avant les
// décisions (désignation Odoo, références qu'Odoo connaît et que le classeur n'a pas).
import type { CatalogueItem, ImportIssue, Unit } from '../core/types';
import type { Workbook } from '../xlsx/read';
import { cellText } from '../xlsx/read';
import type { ImportResult } from './importClasseur';
import { categoryFromDesignation, doorFromDesignation, glazingFromDesignation, plateFromDesignation } from './importClasseur';

export interface OdooProduct {
  ref: string;
  name: string;
}

/** Produits vus sur des pickings Odoo réels mais absents de l'export « Quants » (qui ne liste que les produits avec
 *  un stock enregistré) : ils existent dans Odoo. */
export const ODOO_FROM_PICKINGS: OdooProduct[] = [
  // RVIE/OUT/00066 (6072ROACEVIE, 19/10/2026)
  { ref: '4-700-002', name: 'PAINT LEVASSEUR 1K RAL 7024 20L' },
  { ref: '4-740-011', name: 'Laminate vinyle color choice by client | VIEWBOX | /m²' },
];

/** Export Odoo + produits vus sur les pickings (l'export gagne s'il connaît la référence). */
export function odooKnown(products: readonly OdooProduct[]): OdooProduct[] {
  const refs = new Set(products.map((p) => p.ref));
  return [...products, ...ODOO_FROM_PICKINGS.filter((p) => !refs.has(p.ref))];
}

const REF = /^\d-\d{3}-\d{3,5}$/;
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const norm = (s: string) => clean(s).toLowerCase();

/** Lit l'export Odoo : colonnes trouvées par leur titre, une ligne par emplacement de stock (doublons fusionnés). */
export function readOdooProducts(wb: Workbook): { products: OdooProduct[]; ignored: string[] } {
  const sheet = wb.sheets[0];
  if (!sheet) return { products: [], ignored: [] };
  const head = (sheet.rows[0] ?? []).map((c) => norm(cellText(c)));
  const refCol = head.findIndex((h) => h === 'product reference code' || h === 'référence interne' || h === 'internal reference');
  const nameCol = head.findIndex((h) => h === 'product' || h === 'produit');
  if (refCol < 0 || nameCol < 0) throw new Error('Export Odoo : colonnes « Product Reference Code » et « Product » introuvables');
  const out = new Map<string, OdooProduct>();
  const ignored: string[] = [];
  sheet.rows.slice(1).forEach((row) => {
    const ref = clean(cellText(row[refCol]));
    // nom gardé tel qu'Odoo l'écrit (espaces doubles compris) : l'import Odoo le compare caractère par caractère
    const label = cellText(row[nameCol]).trim();
    if (!ref && !label) return;
    if (!REF.test(ref)) {
      ignored.push(ref ? `${ref} (${clean(label)})` : clean(label));
      return;
    }
    if (!out.has(ref)) out.set(ref, { ref, name: label.replace(/^\[[^\]]*\]\s*/, '') });
  });
  return { products: [...out.values()].sort((a, b) => (a.ref < b.ref ? -1 : 1)), ignored };
}

const unitOf = (name: string): Unit => (/\/\s*m²|\(\/m²\)|\bm²/i.test(name) ? 'm2' : /\/\s*M\b/.test(name) ? 'm' : 'pce');

/** Catalogue du classeur + Odoo : code Odoo sur chaque référence connue, désignation d'Odoo quand elle diffère,
 *  références d'Odoo absentes du classeur ajoutées (catégorie d'après la désignation, à revoir dans l'app). */
export function mergeOdoo(imported: ImportResult, products: readonly OdooProduct[]): ImportResult {
  if (!products.length) return imported;
  const odoo = new Map(products.map((p) => [p.ref, p]));
  const catalogue = structuredClone(imported.catalogue);
  const issues: ImportIssue[] = [...imported.issues];
  for (const c of catalogue) {
    const p = odoo.get(c.ref);
    if (!p) continue;
    c.odoo = p.ref;
    if (norm(p.name) !== norm(c.designation)) {
      issues.push({ where: 'Odoo', article: c.ref, kind: 'odoo', text: `désignation d’Odoo reprise : « ${c.designation} » → « ${p.name} ».` });
      c.designation = p.name;
    }
  }
  const known = new Set(catalogue.map((c) => c.ref));
  for (const p of products) {
    if (known.has(p.ref)) continue;
    const item: CatalogueItem = { ref: p.ref, designation: p.name, gros: false, categorie: categoryFromDesignation(p.ref, p.name), unit: unitOf(p.name), odoo: p.ref, source: 'odoo' };
    const vitrage = glazingFromDesignation(p.name);
    if (vitrage) item.vitrage = vitrage;
    const plaque = plateFromDesignation(p.name);
    if (plaque) item.plaque = plaque;
    const porte = doorFromDesignation(p.name);
    if (porte) item.porte = porte;
    catalogue.push(item);
    issues.push({ where: 'Odoo', article: p.ref, kind: 'odoo', text: `ajoutée au catalogue depuis Odoo (« ${p.name} », catégorie ${item.categorie}${item.unit !== 'pce' ? `, unité ${item.unit}` : ''}).` });
  }
  return { ...imported, catalogue, issues };
}

/** Source du fichier généré library/odoo.data.ts (sans les quantités d'inventaire). */
export function odooSource(products: readonly OdooProduct[], file: string): string {
  return (
    `// Généré par scripts/import-odoo.mjs depuis ${file} — produits connus d'Odoo (référence = Product Reference Code).\n` +
    `// Ne pas modifier à la main : relancer l'import avec le nouvel export Odoo.\n` +
    `import type { OdooProduct } from './odoo';\n\n` +
    `export const ODOO_META = ${JSON.stringify({ file, products: products.length }, null, 2)} as const;\n\n` +
    `export const ODOO_PRODUCTS: OdooProduct[] = ${JSON.stringify(products, null, 2)};\n`
  );
}
