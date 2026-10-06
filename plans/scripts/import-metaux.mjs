// Catalogue des sections acier du commerce belge (« Base métaux Belgique », A. Pinchart 06.10.2026 : Socacier) →
// src/structure/library/catalogBE.data.ts. Ne garde que les dimensions et les valeurs publiées (A, Iy, Wel,y, masse) :
// les propriétés de calcul sont recalculées par l'outil (structure/core/sectionCatalog.ts) et recoupées par les tests.
// Usage : node scripts/import-metaux.mjs [reference-reports/Base_metaux_Belgique.zip | base_metaux_BE.json]
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = process.argv[2] ?? path.join(root, 'reference-reports', 'Base_metaux_Belgique.zip');
const json = src.endsWith('.zip') ? execFileSync('unzip', ['-p', src, 'base_metaux_BE.json'], { maxBuffer: 64 << 20 }).toString('utf8') : fs.readFileSync(src, 'utf8');
const base = JSON.parse(json);

const FAMILIES = ['UPN', 'U_MARCHAND', 'IPE', 'HEA', 'HEB', 'HEM', 'SHS', 'RHS', 'CHS', 'L', 'T', 'PLAT', 'CARRE', 'ROND'];
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const rows = base.sections
  .filter((s) => s.materiau === 'acier' && FAMILIES.includes(s.famille))
  .map((s) => ({
    family: s.famille,
    name: s.designation,
    h: num(s.h_mm),
    b: num(s.b_mm),
    t: num(s.t_mm),
    d: num(s.d_mm),
    tw: num(s.tw_mm),
    tf: num(s.tf_mm),
    A: num(s.A_catalogue_mm2),
    Iy: num(s.Iy_catalogue_mm4),
    Wely: num(s.Wel_y_catalogue_mm3),
    kgPerM: num(s.masse_catalogue_kg_m),
    url: s.source_url,
  }));
// une désignation par famille (les doublons de finition gardent la première fiche)
const seen = new Set();
const unique = rows.filter((r) => (seen.has(r.name) ? false : (seen.add(r.name), true)));
unique.sort((a, b) => FAMILIES.indexOf(a.family) - FAMILIES.indexOf(b.family) || (a.kgPerM ?? 0) - (b.kgPerM ?? 0) || a.name.localeCompare(b.name));
const urls = [...new Set(unique.map((r) => r.url))];
const cols = ['family', 'name', 'h', 'b', 't', 'd', 'tw', 'tf', 'A', 'Iy', 'Wely', 'kgPerM'];
const out = `// Généré par scripts/import-metaux.mjs depuis « Base métaux Belgique » (${base.metadata.date}, ${base.metadata.scope}).
// Dimensions (mm) et valeurs publiées par le fournisseur (A mm², Iy mm⁴, Wel,y mm³, masse kg/m ; null = non publié).
// Base documentaire : nuance, procédé et stock non confirmés (calcul_structurel_autorise = false) — pré-étude seulement.
/* eslint-disable */
export const CATALOG_BE_DATE = ${JSON.stringify(base.metadata.date)};
export const CATALOG_BE_URLS: string[] = ${JSON.stringify(urls, null, 0)};
export type CatalogRow = [family: string, name: string, h: number | null, b: number | null, t: number | null, d: number | null, tw: number | null, tf: number | null, A: number | null, Iy: number | null, Wely: number | null, kgPerM: number | null, url: number];
export const CATALOG_BE: CatalogRow[] = [
${unique.map((r) => `  ${JSON.stringify([...cols.map((c) => r[c]), urls.indexOf(r.url)])},`).join('\n')}
];
`;
const dest = path.join(root, 'src', 'structure', 'library', 'catalogBE.data.ts');
fs.writeFileSync(dest, out);
console.log(`${unique.length} sections → ${path.relative(root, dest)}`);
