// L6 chantier réel : lecture d'une liste réelle (notre bordereau relu, liste consolidée Excel, export Odoo des
// mouvements, CSV, texte copié d'un PDF), rapprochement ligne à ligne, propositions de classement, observations et
// bancs ajoutés dans l'app (rejoués comme les bancs de base).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../../src/loading/engine/generate';
import { compareLists } from '../../src/loading/engine/compare';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';
import { SEED_OBSERVATIONS, SEED_RULES } from '../../src/loading/library/seed';
import { SEED_BENCHES } from '../../src/loading/benches';
import { bordereauXlsx } from '../../src/loading/xlsx/bordereau';
import { readXlsx } from '../../src/loading/xlsx/read';
import { writeXlsx } from '../../src/loading/xlsx/write';
import {
  applySavedMap,
  bestTable,
  extractRealLines,
  guessColumns,
  headerSignature,
  parseNumber,
  tableFromText,
  tablesFromWorkbook,
} from '../../src/loading/reconcile/parseRealList';
import { benchFromReconciliation, reconcile, reconObservations } from '../../src/loading/reconcile/reconcile';
import { benchFromRow, replayBench } from '../../src/loading/reconcile/benches';

const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));
const bench = (id: string) => SEED_BENCHES.find((b) => b.id === id)!;
const run = (id: string, judgements?: Record<string, number>) => {
  const b = bench(id);
  return generate({ topology: b.topology, rules: SEED_RULES, catalogue: cat, answers: b.answers, study: b.study, observations: SEED_OBSERVATIONS, judgements: judgements ?? b.judgements });
};

describe('nombres', () => {
  it('français, anglais, milliers', () => {
    expect(parseNumber('20')).toBe(20);
    expect(parseNumber('20,00')).toBe(20);
    expect(parseNumber('2.53')).toBe(2.53);
    expect(parseNumber('1 234,5')).toBe(1234.5);
    expect(parseNumber('1.234,50')).toBe(1234.5);
    expect(parseNumber('1,234.50')).toBe(1234.5);
    expect(parseNumber('1,234,567')).toBe(1234567);
    expect(parseNumber('Units')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
});

describe('lecture d’une liste réelle', () => {
  it('notre bordereau Excel relu = les lignes de la liste (sections à part sans quantité ignorées)', () => {
    const list = run('klokgebouw');
    const meta = { chantier: 'Klok', orderNo: '6055RKLOKVIE', client: '', shippingDate: '', modelFile: 'k.zip', topology: '', revision: 1, state: 'Brouillon' };
    const tables = tablesFromWorkbook(readXlsx(bordereauXlsx(list, meta)));
    const t = tables[bestTable(tables)];
    const map = guessColumns(t)!;
    expect(map).not.toBeNull();
    expect(t.rows[map.headerRow][map.ref]).toMatch(/R[ée]f|Product Reference Code/);
    const parsed = extractRealLines(t, map);
    const expected = list.lines.filter((l) => l.qty !== null && l.qty !== 0);
    expect(parsed.lines.length).toBe(expected.length);
    for (const l of expected) expect(parsed.lines.find((x) => x.article === l.article)?.qty, l.article).toBe(l.qty);
    // relu comme liste réelle : tout est identique
    const rec = reconcile(list, parsed.lines);
    expect(rec.identical).toBe(rec.total);
  });

  it('liste consolidée (docs/loading) : en-tête trouvé sous le titre, désignation et unité', () => {
    const f = join(__dirname, '..', '..', '..', 'docs', 'loading', 'OACE_Ice_cube_Dusseldorf_loading_consolidee.xlsx');
    if (!existsSync(f)) return;
    const tables = tablesFromWorkbook(readXlsx(readFileSync(f)));
    const t = tables[bestTable(tables)];
    const map = guessColumns(t)!;
    expect(map.headerRow).toBe(3);
    expect(t.rows[3][map.ref]).toBe('Référence');
    expect(t.rows[3][map.qty]).toBe('Quantité');
    expect(map.designation).toBeDefined();
    const p = extractRealLines(t, map);
    expect(p.lines.find((l) => l.article === '7-962-016')).toMatchObject({ qty: 4, unit: 'Units' });
    expect(p.lines.find((l) => l.article === '7-636-008')?.qty).toBe(20);
    expect(p.lines.length).toBeGreaterThan(40);
  });

  it('export Odoo des mouvements : « [réf] nom » + Demand, doublons additionnés, n° de bon', () => {
    const rows = [
      ['Reference', 'Product', 'Demand', 'Quantity', 'Unit of Measure'],
      ['RVIE/OUT/00066', '[7-962-016] VIEWBOX STANDARD M16 60 MM 5900x2500 H3', '4.00', '4.00', 'Units'],
      ['RVIE/OUT/00066', '[4-700-065] RUBBER  VERTICAL', '20,00', '18,00', 'Units'],
      ['RVIE/OUT/00066', '[4-700-065] RUBBER  VERTICAL', '2', '2', 'Units'],
      ['RVIE/OUT/00066', 'Transport', '1', '1', 'Units'],
      ['RVIE/OUT/00066', '[4-720-011] TAPE POLE', '', '', 'm'],
    ];
    const bytes = writeXlsx([{ name: 'Moves', columns: [], rows }], {});
    const t = tablesFromWorkbook(readXlsx(bytes))[0];
    const map = guessColumns(t)!;
    expect(t.rows[0][map.ref]).toBe('Product');
    expect(t.rows[0][map.qty]).toBe('Demand');
    const p = extractRealLines(t, map);
    expect(p.picking).toBe('RVIE/OUT/00066');
    expect(p.lines).toEqual([
      { article: '7-962-016', qty: 4, designation: 'VIEWBOX STANDARD M16 60 MM 5900x2500 H3', unit: 'Units', rows: [1] },
      { article: '4-700-065', qty: 22, designation: 'RUBBER  VERTICAL', unit: 'Units', rows: [2, 3] },
    ]);
    expect(p.ignored.map((i) => i.reason)).toEqual(['pas de référence', 'pas de quantité']);
    // choix mémorisé par en-tête
    expect(headerSignature(t, map)).toBe('reference|product|demand|quantity|unit of measure');
    expect(applySavedMap(t, { ...map, qty: 3 })?.qty).toBe(3);
    expect(applySavedMap(t, { ...map, qty: 30 })).toBeNull();
  });

  it('CSV « ; » sans en-tête reconnu : colonnes devinées par le contenu', () => {
    const t = tableFromText('4-700-065;Rubber vertical;20\n4-700-039;Plaque;12,0\n;Total;32\n');
    const map = guessColumns(t)!;
    expect(map).toMatchObject({ headerRow: -1, ref: 0, qty: 2 });
    expect(extractRealLines(t, map).lines.map((l) => [l.article, l.qty])).toEqual([
      ['4-700-065', 20],
      ['4-700-039', 12],
    ]);
  });

  it('texte collé court avec des virgules décimales : pas pris pour un CSV', () => {
    const t = tableFromText('Rental Delivery Slip RVIE/OUT/00099\n[4-730-008] SHUKO CABLE 10,00 Units\n[9-999-999] PIECE 2,00 Units\n[7-962-016] VIEWBOX 4,00 Units');
    expect(Math.max(...t.rows.map((r) => r.length))).toBe(1);
    expect(extractRealLines(t, null).lines.map((l) => [l.article, l.qty])).toEqual([
      ['4-730-008', 10],
      ['9-999-999', 2],
      ['7-962-016', 4],
    ]);
    // un vrai CSV à virgules reste un CSV
    expect(tableFromText('ref,qty\n4-700-065,20\n4-700-039,12').rows[1]).toEqual(['4-700-065', '20']);
  });

  it('texte copié d’un bon de livraison PDF : quantité = nombre suivi de l’unité', () => {
    const text = [
      'Rental Delivery Slip RVIE/OUT/00066',
      'Product Demand',
      '[7-962-016] VIEWBOX STANDARD M16 60 MM 5900x2500 H3 4,00 Units',
      '[4-700-075] RUBBER BIG 5700 MM 2 PCS 12,00 Units',
      '[4-720-011] TAPE POLE 2,53 M 20,00 m',
      '4-157-005 Gaffa TAPE NISHIBAN BLACK 4',
      'Page 1 / 2',
    ].join('\n');
    const t = tableFromText(text);
    expect(t.rows[2]).toHaveLength(1);
    const p = extractRealLines(t, null);
    expect(p.picking).toBe('RVIE/OUT/00066');
    expect(p.lines.map((l) => [l.article, l.qty])).toEqual([
      ['7-962-016', 4],
      ['4-700-075', 12],
      ['4-720-011', 20],
      ['4-157-005', 4],
    ]);
    expect(p.lines[1].designation).toBe('RUBBER BIG 5700 MM 2 PCS');
  });
});

describe('rapprochement', () => {
  it('OACE : même score que le banc doré, propositions pour chaque écart', () => {
    const b = bench('oace');
    const list = run('oace');
    const rec = reconcile(list, b.real, { catalogue: cat, rules: SEED_RULES, known: b.known });
    const cmp = compareLists(list, b.real, { known: b.known });
    expect(rec.identical).toBe(cmp.identical);
    expect(rec.total).toBe(b.real.length);
    expect(rec.score).toBe(`${cmp.identical} / ${b.real.length} lignes identiques`);
    for (const r of rec.rows) {
      if (r.kind === 'identique') expect(r.suggestion).toBeUndefined();
      else expect(r.suggestion?.why, r.article).toBeTruthy();
    }
    // les écarts sont rangés avant les lignes identiques
    expect(rec.rows[0].kind).not.toBe('identique');
    expect(rec.rows[rec.rows.length - 1].kind).toBe('identique');
    expect(rec.rows.filter((r) => r.known).length).toBeGreaterThan(0);
  });

  it('classements : correction déjà faite, comptage 3D, référence inconnue, compris dans le standard', () => {
    const b = bench('klokgebouw');
    const list0 = run('klokgebouw', {});
    const wall = list0.lines.find((l) => l.contributions.every((c) => c.kind === 'produit'))!;
    const acc = list0.lines.find((l) => l.contributions.some((c) => c.kind === 'regle') && l.qty)!;
    const corrected = run('klokgebouw', { [acc.article]: acc.qty! + 3 });
    const real = [
      ...b.real.filter((r) => r.article !== wall.article && r.article !== acc.article),
      { article: wall.article, qty: wall.qty! + 1 },
      { article: acc.article, qty: acc.qty! + 3 },
      { article: '9-999-999', qty: 2 },
      { article: '7-632-001', qty: 2 },
    ];
    const rec = reconcile(corrected, real, { computed: list0, catalogue: cat, rules: SEED_RULES });
    const row = (a: string) => rec.rows.find((r) => r.article === a)!;
    expect(row(wall.article)).toMatchObject({ kind: 'moins', delta: 1, suggestion: { decision: 'erreur_3d' } });
    expect(row(acc.article)).toMatchObject({ kind: 'identique', listed: acc.qty! + 3, computed: acc.qty });
    expect(row('9-999-999')).toMatchObject({ kind: 'reel_seul', suggestion: { decision: 'regle' } });
    expect(row('7-632-001').suggestion?.decision).toBe('erreur_bordereau');

    const obs = reconObservations(rec, { [wall.article]: 'erreur_3d', '9-999-999': 'inconnu' }, 'Klok');
    // une ligne identique grâce à une correction n'est pas un point de calage ; un écart non classé n'est pas gardé
    expect(obs.find((o) => o.article === acc.article)).toBeUndefined();
    expect(obs.find((o) => o.article === '7-632-001')).toBeUndefined();
    expect(obs.find((o) => o.article === wall.article)).toMatchObject({ kind: 'erreur_3d', predicted: wall.qty, final: wall.qty! + 1 });
    expect(obs.find((o) => o.article === '9-999-999')).toMatchObject({ kind: 'inconnu', final: 2 });
    expect(obs.filter((o) => o.kind === 'calage').length).toBe(rec.identical - 1);

    const kept = benchFromReconciliation(rec, { [wall.article]: 'chantier', '9-999-999': 'erreur_bordereau' }, '02/11/2026');
    expect(kept.judgements).toEqual({ [wall.article]: wall.qty! + 1 });
    expect(kept.known['9-999-999']).toMatch(/erreur du bordereau/);
  });
});

describe('bancs ajoutés dans l’app', () => {
  it('une ligne loading_benches devient un banc rejouable ; « seulement ce chantier » est rejoué en jugement', () => {
    const b = bench('6060');
    const row = {
      id: 'B1',
      name: 'Banc test',
      projectId: 'p1',
      modelVersionId: 'm1',
      topology: b.topology,
      answers: { site: b.answers, study: b.study, known: { '4-700-060': 'à caler' }, order: '6060RIAAHVIE', bordereau: 'RVIE/OUT/00058', source: 'test', partial: b.partial, model: 'x.zip' },
      realLines: b.real,
      judgements: b.judgements,
      columnMap: null,
      createdAt: '2026-11-02T10:00:00Z',
      updatedAt: '2026-11-02T10:00:00Z',
    };
    const nb = benchFromRow(row);
    expect(nb).toMatchObject({ id: 'db:B1', name: 'Banc test', order: '6060RIAAHVIE', partial: b.partial, known: { '4-700-060': 'à caler' } });
    const replay = replayBench(nb!, SEED_RULES, cat, SEED_OBSERVATIONS);
    const gold = compareLists(run('6060'), b.real, { partial: b.partial });
    expect(replay.comparison.identical).toBe(gold.identical);
    expect(replay.comparison.total).toBe(b.real.length);
    // une ligne abîmée n'est pas un banc
    expect(benchFromRow({ ...row, topology: null })).toBeNull();
  });
});
