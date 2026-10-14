// Export Excel au format bordereau : relu par notre lecteur (valeurs, couleurs, ordre des sections) et par openpyxl
// quand XLSX_OUT est donné (fichier gardé pour l'ouvrir dans Excel / LibreOffice).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/loading/engine/generate';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';
import { SEED_OBSERVATIONS, SEED_RULES } from '../../src/loading/library/seed';
import { bordereauFileName, bordereauXlsx, odooSheet, COLUMNS, LEGEND_COLORS } from '../../src/loading/xlsx/bordereau';
import { cellText, readXlsx } from '../../src/loading/xlsx/read';
import { writeXlsx } from '../../src/loading/xlsx/write';
import { topologySummary } from '../../src/loading/topology/build';

const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));
const fix = (n: string) => JSON.parse(readFileSync(join(__dirname, '..', '..', 'src', 'loading', 'benches', n), 'utf8'));

describe('écrivain xlsx', () => {
  it('relu à l’identique (texte, nombres, styles, caractères spéciaux)', () => {
    const bytes = writeXlsx(
      [{ name: 'Feuille <1>', columns: [10, 20], rows: [[{ v: 'Réf. & « 40 × 40 »', s: 'h' }, 2.53], [null, { v: 12, s: 'n' }]], merges: ['A3:B3'], freezeRows: 1, printTitleRows: [1, 1] }],
      { h: { bold: true, fill: 'DDEBF7', border: true }, n: { number: 'dec' } },
    );
    const wb = readXlsx(bytes);
    expect(wb.sheets[0].name).toBe('Feuille <1>');
    expect(wb.sheets[0].rows[0][0]).toEqual({ v: 'Réf. & « 40 × 40 »', fill: 'FFDDEBF7' });
    expect(wb.sheets[0].rows[0][1]?.v).toBe(2.53);
    expect(wb.sheets[0].rows[1][1]?.v).toBe(12);
  });
});

describe('bordereau', () => {
  const b = fix('klokgebouw.bench.json');
  const t = fix('klokgebouw.topology.json');
  const list = generate({ topology: t, rules: SEED_RULES, catalogue: cat, answers: b.answers, study: b.study, observations: SEED_OBSERVATIONS });
  const meta = {
    chantier: 'Klokgebouw Eindhoven',
    orderNo: '6055RKLOKVIE',
    client: 'Client',
    shippingDate: '12/10/2026',
    modelFile: 'Klokgebouw.zip',
    topology: topologySummary(t, cat),
    revision: 1,
    state: 'Brouillon',
  };
  const bytes = bordereauXlsx(list, meta);
  if (process.env.XLSX_OUT) writeFileSync(join(process.env.XLSX_OUT, bordereauFileName(meta.orderNo, 1)), bytes);
  const rows = readXlsx(bytes).sheets[0].rows;
  const texts = rows.map((r) => r.map(cellText));
  it('en-tête, colonnes, une ligne par référence', () => {
    expect(texts[0][0]).toBe('LOADING LISTE');
    expect(texts.find((r) => r[0] === 'N° d’order')?.[1]).toBe('6055RKLOKVIE');
    const head = texts.findIndex((r) => r[0] === COLUMNS[0]);
    expect(texts[head]).toEqual(COLUMNS);
    const refs = texts.slice(head + 1).filter((r) => /^\d-\d{3}-\d{3}/.test(r[0]));
    expect(refs.length).toBe(list.lines.length);
    const v = texts.find((r) => r[0] === '4-700-065')!;
    expect([v[2], v[3], v[6]]).toEqual(['20', 'pce', 'confirmé']);
    expect(v[5]).toContain('+ 20 % arrondi au-dessus → 20');
  });
  it('catégories dans l’ordre du bordereau, sections à part, légende', () => {
    const order = ['Structure / façade', 'Quincaillerie / liaison', 'Joints / étanchéité', 'Électrique', 'Consommables / finition', 'Ajouts chantier'].filter((c) => texts.some((r) => r[0] === c));
    expect(order.map((c) => texts.findIndex((r) => r[0] === c))).toEqual([...order.map((c) => texts.findIndex((r) => r[0] === c))].sort((a, b) => a - b));
    expect(texts.some((r) => (r[0] ?? '').startsWith('À valider — appréciation'))).toBe(true);
    expect(texts.some((r) => r[1] === 'Mauve : régime connecté observé, à re-caler')).toBe(true);
    // couleur de confiance + statut écrit
    const line = rows.find((r) => cellText(r[0]) === '4-700-065')!;
    expect(line[0]?.fill).toBe(`FF${LEGEND_COLORS.confirme}`);
  });
  it('onglet Odoo : référence Odoo + quantité, références inconnues d’Odoo à part', () => {
    const sheet = readXlsx(bytes).sheets[1];
    expect(sheet.name).toBe('Odoo');
    const o = sheet.rows.map((r) => r.map(cellText));
    expect(o[0]).toEqual(['Product Reference Code', 'Product', 'Quantity', 'Unité']);
    const split = o.findIndex((r) => (r[0] ?? '').startsWith('Pas dans Odoo'));
    const ready = o.slice(1, split < 0 ? undefined : split - 1);
    expect(ready.find((r) => r[0] === '4-700-065')).toEqual(['4-700-065', '[4-700-065] Window/Wall Rubber black BIG 2550mm |VIEWBOX|', '20', 'pce']);
    expect(ready.find((r) => r[0] === '7-962-016')?.[2]).toBe(String(list.lines.find((l) => l.article === '7-962-016')!.qty));
    const withQty = list.lines.filter((l) => l.qty !== null && l.qty > 0);
    const unknown = split < 0 ? [] : o.slice(split + 1).filter((r) => r[0]);
    expect(ready.length + unknown.length).toBe(withQty.length);
    // une ligne inconnue d'Odoo n'est jamais dans la partie importable
    const odoo = odooSheet(list, [{ ref: '7-962-016', name: 'VIEWBOX STANDARD M16 60 MM 5900x2500 H3' }]);
    const t = odoo.rows.map((r) => r.map((c) => (c && typeof c === 'object' && 'v' in c ? String(c.v ?? '') : String(c ?? ''))));
    expect(t[1][0]).toBe('7-962-016');
    expect(t[2]).toEqual([]);
    expect(t[3][0]).toMatch(/^Pas dans Odoo/);
  });
  it('nom de fichier', () => {
    expect(bordereauFileName('6055RKLOKVIE', 2)).toBe('6055RKLOKVIE_loading_v2.xlsx');
    expect(bordereauFileName('RVIE/OUT/00055', 1)).toBe('RVIE_OUT_00055_loading_v1.xlsx');
  });
});
