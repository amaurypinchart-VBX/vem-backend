// Apprentissage : bases qui expliquent une correction (inferBase), règle proposée, contradictions, impact sur les
// bancs, calage automatique, questions en attente, export du classeur.
import { describe, expect, it } from 'vitest';
import { SEED_BENCHES } from '../../src/loading/benches';
import { inferBase } from '../../src/loading/learning/inferBase';
import { conflictsFor, proposeRule, resolveConflicts } from '../../src/loading/learning/proposal';
import { impactOf, impactSentence } from '../../src/loading/learning/impact';
import type { ObservationRow } from '../../src/loading/learning/calibration';
import { pendingQuestions, promotionProposals } from '../../src/loading/learning/calibration';
import { classeurXlsx } from '../../src/loading/library/exportClasseur';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';
import { SEED_DECISIONS, SEED_OBSERVATIONS, SEED_RULES } from '../../src/loading/library/seed';
import { cellText, readXlsx } from '../../src/loading/xlsx/read';

const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));
const bench = (id: string) => SEED_BENCHES.find((b) => b.id === id)!;
const cases = SEED_BENCHES.map((b) => ({ id: b.id, name: b.name, kind: 'banc' as const, topology: b.topology, answers: b.answers, study: b.study, judgements: b.judgements, real: b.real, partial: b.partial }));

describe('inferBase', () => {
  it('boulons 6060 passés de 20 à 26 avec 2 jonctions : « 13 / jonction » ou « 10 / jonction + 30 % »', () => {
    const c = inferBase('4-710-001', 26, bench('6060').topology, { rules: SEED_RULES });
    const labels = c.map((x) => x.label);
    expect(labels.slice(0, 2)).toEqual(['13 / jonction grand côté', '10 / jonction grand côté + 30 %']);
    expect(inferBase('4-710-001', 26, bench('6060').topology, { max: 20 }).map((x) => x.label)).toEqual(expect.arrayContaining(['13 / jonction', '10 / jonction + 30 %']));
    for (const x of c) expect(x.result).toBe(26);
  });
  it('la base déjà utilisée pour l’article passe en tête', () => {
    const c = inferBase('4-710-001', 26, bench('6060').topology, { rules: SEED_RULES });
    expect(c[0].per).toBe('jonction_grand_cote');
  });
  it('par box sur Klokgebouw (plafond 3 → 4 : 2 / box)', () => {
    const c = inferBase('4-700-003', 4, bench('klokgebouw').topology);
    expect(c.find((x) => x.per === 'box')?.label).toBe('2 / box');
  });
  it('rien pour 0', () => {
    expect(inferBase('4-700-003', 0, bench('klokgebouw').topology)).toEqual([]);
  });
});

describe('règle proposée, contradictions, impact', () => {
  const t = bench('klokgebouw').topology;
  const cand = inferBase('4-700-003', 4, t).find((x) => x.per === 'box')!;
  const r = proposeRule({ article: '4-700-003', candidate: cand, scope: 'toujours', confidence: 'confirme', chantier: 'Klokgebouw' }, SEED_RULES);
  it('règle proposée', () => {
    expect(r).toMatchObject({ key: 'acc:4-700-003@box#2', qty: 2, per: 'box', source: 'correction', confidence: 'confirme' });
  });
  it('contredit la règle « 1 / box + 1 » du classeur ; remplacer la désactive', () => {
    const cs = conflictsFor(r, SEED_RULES);
    expect(cs.map((c) => c.rule.key)).toEqual(['acc:4-700-003@box']);
    expect(cs[0].sameScope).toBe(true);
    const saved = resolveConflicts(r, cs, 'remplacer');
    expect(saved[1]).toMatchObject({ key: 'acc:4-700-003@box', active: false, supersededBy: r.key });
    expect(resolveConflicts(r, cs, 'garder')[0].group).toBe('additionne:4-700-003');
    expect(resolveConflicts(r, cs, 'condition', { regime: 'connecte' })[0].key).toBe('acc:4-700-003@box[connecte]');
  });
  it('impact : rejoue les bancs, Klokgebouw passe de 39 / 39 à 38 / 39', () => {
    const after = [...SEED_RULES.filter((x) => x.key !== 'acc:4-700-003@box'), r];
    const res = impactOf(cases, SEED_RULES, after, cat, SEED_OBSERVATIONS);
    const klok = res.find((x) => x.case.id === 'klokgebouw')!;
    expect(klok.changes).toEqual([{ article: '4-700-003', before: 3, after: 4 }]);
    expect([klok.scoreBefore, klok.scoreAfter, klok.worse]).toEqual(['39 / 39', '38 / 39', true]);
    expect(impactSentence(res, '4-700-003')).toMatch(/^Aurait changé 4 chantiers : Klokgebouw Eindhoven 3 → 4/);
  });
});

describe('calage automatique, questions en attente', () => {
  const rule = SEED_RULES.find((r) => r.active && r.confidence === 'a_confirmer' && r.qty !== null)!;
  const obs = (id: string, listId: string, predicted: number, final: number, kind = 'calage', at = `2026-10-1${id}`): ObservationRow => ({ id, listId, article: rule.article, ruleKeys: [rule.key], predicted, final, kind, createdAt: at });
  it('juste sur 2 chantiers de suite → proposée « confirmée »', () => {
    expect(promotionProposals(SEED_RULES, [obs('1', 'A', 4, 4), obs('2', 'B', 6, 6)]).map((p) => p.rule.key)).toEqual([rule.key]);
    expect(promotionProposals(SEED_RULES, [obs('1', 'A', 4, 4), obs('2', 'B', 6, 7)])).toEqual([]);
    expect(promotionProposals(SEED_RULES, [obs('1', 'A', 4, 4)])).toEqual([]);
    // une correction « seulement ce chantier » ne compte pas
    expect(promotionProposals(SEED_RULES, [obs('1', 'A', 4, 4), obs('2', 'B', 6, 6, 'jugement')])).toEqual([]);
  });
  it('« je ne sais pas encore » : question en attente jusqu’à la prochaine modification de la règle', () => {
    const o = obs('3', 'C', 4, 6, 'inconnu', '2026-10-13');
    expect(pendingQuestions([o], new Map()).get(rule.article)).toHaveLength(1);
    expect(pendingQuestions([o], new Map([[rule.article, '2026-10-14']])).size).toBe(0);
    // ligne restée indéterminée à la validation : pas une question
    expect(pendingQuestions([{ ...o, final: null }], new Map()).size).toBe(0);
  });
});

describe('export du classeur', () => {
  it('mêmes onglets que VIEWBOX_regles_loading, une ligne par règle active', () => {
    const wb = readXlsx(classeurXlsx(SEED_RULES, SEED_CATALOGUE, { version: 'v', date: '13/10/2026', decisions: SEED_DECISIONS }));
    expect(wb.sheets.map((s) => s.name)).toEqual(['LisezMoi', 'Regles_accessoires', 'Ajouts_chantier', 'Appreciation', 'Catalogue_ref']);
    const acc = wb.sheets[1].rows.slice(1).map((r) => r.map(cellText));
    const active = SEED_RULES.filter((r) => r.active && ['accessoire', 'kit', 'substitution', 'exclusion'].includes(r.kind));
    expect(acc.length).toBe(active.length);
    const bolts = acc.find((r) => r[13] === 'acc:4-710-001@jonction_grand_cote')!;
    expect([bolts[2], bolts[4], bolts[5], bolts[8], bolts[10], bolts[11]]).toEqual(['4-710-001', '10', 'jonction_grand_cote', '', '+30%', 'confirme']);
    expect(wb.sheets[1].rows[1][0]?.fill).toMatch(/DDEBF7|FFF2CC|E6E0F8|E2EFDA/);
    expect(wb.sheets[4].rows.length - 1).toBe(SEED_CATALOGUE.length);
  });
});
