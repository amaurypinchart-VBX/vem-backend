// Import du classeur de règles (docs/loading/VIEWBOX_regles_loading_3.xlsx) : traduction, décisions d'Amaury,
// fichiers générés à jour. LOADING_WRITE=1 (scripts/import-loading-rules.mjs) réécrit seed.ts / catalogue.ts / rapport.
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { readXlsx } from '../../src/loading/xlsx/read';
import { buildSeed, catalogueSource, reportMarkdown, seedSource } from '../../src/loading/library/generate';
import { expandRefs, parseSpare } from '../../src/loading/library/importClasseur';

const FILE = process.env.LOADING_CLASSEUR ?? path.resolve(__dirname, '../../../docs/loading/VIEWBOX_regles_loading_3.xlsx');
const LIB = path.resolve(__dirname, '../../src/loading/library');
const REPORT = path.resolve(__dirname, '../../../docs/loading/rapport-import.md');

describe('aides de traduction', () => {
  it('spares', () => {
    expect(parseSpare('+20%')).toEqual({ type: 'pourcent', valeur: 20 });
    expect(parseSpare('+ 2')).toEqual({ type: 'fixe', valeur: 2 });
    expect(parseSpare('')).toBeUndefined();
    expect(parseSpare('+spare')).toBeNull();
  });
  it('réfs abrégées', () => {
    expect(expandRefs('4-750-004/005/006')).toEqual(['4-750-004', '4-750-005', '4-750-006']);
    expect(expandRefs('4-740-00x')).toEqual(['4-740-001', '4-740-002', '4-740-003']);
    expect(expandRefs('4-700-096 / 4-700-033')).toEqual(['4-700-096', '4-700-033']);
  });
});

describe.skipIf(!existsSync(FILE))('classeur VIEWBOX_regles_loading', () => {
  const seed = buildSeed(readXlsx(readFileSync(FILE)));
  const rule = (key: string) => seed.rules.find((r) => r.key === key);
  const name = path.basename(FILE);

  it('lit les 5 onglets et le catalogue', () => {
    expect(seed.sheetNames).toEqual(['LisezMoi', 'Regles_accessoires', 'Ajouts_chantier', 'Appreciation', 'Catalogue_ref']);
    expect(seed.catalogue.length).toBeGreaterThan(200);
    expect(seed.catalogue.find((c) => c.ref === '7-962-016')).toMatchObject({ gros: true, pieds: { total: 6 } });
    expect(seed.catalogue.find((c) => c.ref === '7-637-010')?.vitrage).toBe('10mm');
    expect(seed.catalogue.find((c) => c.ref === '7-637-020')?.vitrage).toBe('8.8.2');
    expect(seed.catalogue.find((c) => c.ref === '4-740-002')?.plaque).toEqual({ l: 700, w: 700 });
    expect(seed.catalogueToAdd).toEqual(['4-700-096', '4-720-011', '4-700-002']);
    expect(seed.catalogue.find((c) => c.ref === '7-355-014')?.inclusDans).toBe('7-962-016');
  });

  it('traduit les règles Klokgebouw (standalone, +20 %)', () => {
    expect(rule('acc:4-700-065@box[standalone]')).toMatchObject({ qty: 8, spare: { type: 'pourcent', valeur: 20 }, confidence: 'confirme' });
    expect(rule('acc:4-700-003@box')).toMatchObject({ qty: 1, spare: { type: 'fixe', valeur: 1 } });
    expect(rule('acc:4-730-001@ilot')).toMatchObject({ qty: 1, per: 'ilot' });
    expect(rule('kit:7-632-017@7-199-067/produit')).toMatchObject({ qty: 3, kind: 'kit' });
    expect(rule('acc:4-700-060@10mm/jonction_verre')?.trigger).toEqual({ vitrage: '10mm' });
  });

  it('ne tranche rien en silence', () => {
    // quantité en texte, spares en texte, base inconnue, observations : signalés
    expect(rule('acc:4-710-001@box')).toMatchObject({ qty: null, qtyText: '~10/jonction' });
    expect(seed.issues.some((i) => i.text.includes('box_gap'))).toBe(true);
    expect(seed.observations.map((o) => o.article)).toContain('4-700-065');
    expect(seed.observations.every((o) => o.regime === 'connecte')).toBe(true);
    // contradictions connues remontées
    const conflictArticles = seed.conflicts.map((g) => g[0].split('@')[0].split(':')[1]);
    expect(conflictArticles).toEqual([]);
  });

  it('applique les réponses d’Amaury du 12/10/2026', () => {
    expect(seed.decisions.every((d) => d.applied)).toBe(true);
    expect(rule('acc:4-740-001@sous_bois_etude')).toMatchObject({ qty: 2, active: true, source: 'decision' });
    expect(rule('acc:4-740-001@pied')).toMatchObject({ active: false, supersededBy: 'acc:4-740-001@sous_bois_etude' });
    expect(rule('aj:4-750-001@box')?.tranche).toEqual({ mode: 'paliers', paliers: [{ min: 1, max: 7, qty: 1 }, { min: 8, max: 15, qty: 2 }] });
    expect(rule('sub:4-700-083@airco[nidaplast]')).toMatchObject({ kind: 'substitution', replaces: { article: '7-636-008', qty: 1 } });
    expect(rule('acc:4-700-083@airco[autre]')?.active).toBe(false);
    expect(rule('acc:4-700-083@airco')).toMatchObject({ qty: 1, active: true });
    expect(rule('sub:4-700-083@airco[nidaplast]')?.active).toBe(false);
    expect(rule('acc:4-730-013@box[connecte]')).toMatchObject({ qty: null, confidence: 'a_confirmer' });
    expect(rule('acc:4-730-009@4-700-027/box')?.active).toBe(false);
    expect(rule('aj:4-740-010@box[plancherLamine]')).toMatchObject({ qty: 15, unit: 'm2' });
    // jonctions (réponses du 12/10 après-midi)
    expect(rule('acc:4-700-096@jonction_toit_grand_cote')).toMatchObject({ qty: 1, active: true });
    expect(rule('acc:4-700-096@module_toit[connecte,suspendu]')?.active).toBe(false);
    expect(rule('acc:4-700-039@jonction_grand_cote')).toMatchObject({ qty: 5, spare: { type: 'pourcent', valeur: 30 } });
    expect(rule('acc:4-700-097@jonction_toit_petit_cote')).toMatchObject({ qty: 1, spare: { type: 'fixe', valeur: 1 } });
    expect(rule('kit:7-632-022@porte_coulissante')).toMatchObject({ qty: 2, confidence: 'confirme' });
    expect(rule('kit:7-632-017@porte_coulissante')?.qty).toBe(4);
    // « toujours un peu plus » : jamais moins que livré sur les points de calage
    for (const r of seed.rules.filter((x) => x.active))
      for (const c of r.calibration) if (c.predit !== undefined && c.livre !== undefined) expect(c.predit, `${r.key} ${c.chantier}`).toBeGreaterThanOrEqual(c.livre);
    expect(rule('acc:4-700-039@jonction_petit_cote')?.qty).toBe(2);
    expect(rule('acc:4-710-001@jonction_grand_cote')?.qty).toBe(10);
    expect(rule('acc:4-710-001@jonction_petit_cote')?.qty).toBe(4);
    expect(rule('acc:4-710-001@box')?.active).toBe(false);
    expect(rule('acc:4-700-067@10mm/cote_vitre_court')?.spare).toEqual({ type: 'pourcent', valeur: 50 });
    expect(rule('acc:4-700-072@10mm/porte_coulissante')?.qty).toBe(2);
    // marches : toutes les portes
    expect(rule('kit:7-632-017@porte_simple')?.qty).toBe(3);
    expect(rule('kit:7-632-017@porte_double')?.qty).toBe(2);
    expect(rule('kit:7-632-017@7-199-067/produit')?.active).toBe(false);
    const door = (ref: string) => seed.catalogue.find((c) => c.ref === ref)?.porte;
    expect([door('7-199-067'), door('7-625-013'), door('7-625-014'), door('7-199-066'), door('7-625-018'), door('7-625-021')]).toEqual([
      'simple', 'simple', 'simple', 'double', 'double', 'coulissante',
    ]);
    expect(seed.rules.filter((r) => r.active && r.conflict).length).toBe(0);
    // les notes d'appréciation déjà couvertes par une règle ne sortent plus deux fois
    expect(seed.rules.filter((r) => r.active && r.kind === 'appreciation').map((r) => r.article)).toContain('4-700-027');
    expect(seed.rules.find((r) => r.kind === 'appreciation' && r.article.startsWith('4-740-001'))?.active).toBe(false);
  });

  it('clés uniques', () => {
    const keys = seed.rules.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it(process.env.LOADING_WRITE ? 'écrit seed.ts, catalogue.ts et le rapport' : 'seed.ts et catalogue.ts sont à jour (sinon : node scripts/import-loading-rules.mjs)', () => {
    const files: [string, string][] = [
      [path.join(LIB, 'seed.ts'), seedSource(seed, name)],
      [path.join(LIB, 'catalogue.ts'), catalogueSource(seed, name)],
      [REPORT, reportMarkdown(seed, name)],
    ];
    for (const [p, content] of files) {
      if (process.env.LOADING_WRITE) writeFileSync(p, content);
      else expect(readFileSync(p, 'utf8'), path.basename(p)).toBe(content);
    }
  });
});
