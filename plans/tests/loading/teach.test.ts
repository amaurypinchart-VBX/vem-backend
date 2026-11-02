// L7 mode 🎓 « Apprendre » : éléments montrables et leurs traits, description par les relations, ce que des exemples
// ont en commun (generalize), occurrences d'un motif, base connue équivalente, règle « par motif » dans le moteur,
// clé de règle acceptée par le serveur, impact rejoué sur les bancs.
import { describe, expect, it } from 'vitest';
import { SEED_BENCHES } from '../../src/loading/benches';
import type { LoadingRule } from '../../src/loading/core/types';
import { describeRule } from '../../src/loading/core/describe';
import { generate } from '../../src/loading/engine/generate';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';
import { SEED_OBSERVATIONS, SEED_RULES } from '../../src/loading/library/seed';
import { rulesVersion } from '../../src/loading/library/merge';
import { proposeRule } from '../../src/loading/learning/proposal';
import { impactOf } from '../../src/loading/learning/impact';
import { benchCases } from '../../src/ui/loading/impactCases';
import { attrChoices, countMotif, describeElement, describeMotif, equivalentBase, generalize, motifKey, neighbourPair, topologyElements } from '../../src/loading/teach/motif';

const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));
const bench = (id: string) => SEED_BENCHES.find((b) => b.id === id)!;
/** même motif de clé que src/routes/loading.ts */
const SERVER_KEY = /^[A-Za-z0-9_.:@/[\],+#!-]{3,200}$/;

describe('éléments montrables', () => {
  it('Klokgebouw : 2 box, 8 côtés, 12 pieds, paires de voisins = jonctions de panneaux + avec vitre', () => {
    const t = bench('klokgebouw').topology;
    const els = topologyElements(t, cat);
    const n = (k: string) => els.filter((e) => e.kind === k).length;
    expect(n('box')).toBe(2);
    expect(n('cote')).toBe(8);
    expect(n('pied')).toBe(12);
    expect(n('jonction')).toBe(0);
    expect(n('voisins')).toBe((t.counts.jonction_panneau?.value ?? 0) + (t.counts.jonction_verre?.value ?? 0));
    expect(n('panneau')).toBe(t.sides.reduce((s, x) => s + x.elements.length, 0));
    // chaque élément est rangé dans son îlot (sauf les poses de produits, comptées partout)
    expect(els.filter((e) => e.kind !== 'produit').every((e) => e.islandId)).toBe(true);
  });

  it('description par les relations, en français', () => {
    const t = bench('6059').topology;
    const els = topologyElements(t, cat);
    const j = els.find((e) => e.kind === 'jonction')!;
    expect(describeElement(j)).toMatch(/^jonction entre box grand côté, alignée, toits jointifs \(rien posé dessus\), au rez \(J\d : VBX-\d+ \/ VBX-\d+\)$/);
    const side = els.find((e) => e.kind === 'cote' && e.attrs.vitrage === '8.8.2')!;
    expect(describeElement(side)).toContain('vitrage 8.8.2');
    expect(describeMotif({ kind: 'pied', attrs: {} }, true)).toBe('pieds');
  });
});

describe('ce que les exemples ont en commun', () => {
  it('6059 : deux jonctions montrées → motif commun, variantes plus générales, base connue équivalente', () => {
    const t = bench('6059').topology;
    const els = topologyElements(t, cat);
    const ex = els.filter((e) => e.kind === 'jonction').slice(0, 2);
    const g = generalize(ex, t, cat);
    expect(g.error).toBeUndefined();
    expect(g.common).toEqual({ kind: 'jonction', attrs: { type: 'grand_cote', decalee: false, toit: true, niveau: 'rez' } });
    expect(g.variants[0].count).toBe(3);
    expect(g.variants.at(-1)!.spec.attrs).toEqual({});
    expect(new Set(g.variants.map((v) => motifKey(v.spec))).size).toBe(g.variants.length);
    expect(equivalentBase(t, { kind: 'jonction', attrs: { type: 'grand_cote' } })).toEqual({ per: 'jonction_grand_cote' });
    expect(equivalentBase(t, { kind: 'jonction', attrs: { type: 'grand_cote', toit: true } })).toEqual({ per: 'jonction_toit_grand_cote' });
    expect(equivalentBase(t, { kind: 'jonction', attrs: { decalee: true } })).toBeNull();
    expect(equivalentBase(t, { kind: 'produit', attrs: { article: '7-962-016' } })).toEqual({ per: 'produit', trigger: '7-962-016' });
  });

  it('genres mélangés : refusé, avec une phrase claire', () => {
    const t = bench('6059').topology;
    const els = topologyElements(t, cat);
    const g = generalize([els.find((e) => e.kind === 'box')!, els.find((e) => e.kind === 'pied')!], t, cat);
    expect(g.error).toMatch(/pas du même genre/);
    expect(g.variants).toEqual([]);
  });

  it('6060 : vitres 10 mm voisines montrées → motif « vitre + vitre, vitrage 10 mm » compté îlot par îlot', () => {
    const t = bench('6060').topology;
    const els = topologyElements(t, cat);
    const pairs = els.filter((e) => e.kind === 'voisins' && e.attrs.paire === 'vitre + vitre' && e.attrs.vitrage === '10mm');
    expect(pairs.length).toBeGreaterThan(0);
    const spec = { kind: 'voisins' as const, attrs: { paire: 'vitre + vitre', vitrage: '10mm' } };
    const all = countMotif(t, spec, null, cat);
    expect(all.value).toBe(pairs.length);
    const perIsland = t.islands.reduce((s, i) => s + countMotif(t, spec, i.id, cat).value, 0);
    expect(perIsland).toBe(all.value);
    // deux panneaux voisins montrés → leur jonction
    const [a, b] = pairs[0].id.split('|').map((id) => els.find((e) => e.id === id)!);
    expect(neighbourPair(b, a, els)?.id).toBe(pairs[0].id);
    expect(attrChoices(els).voisins.paire).toContain('vitre + vitre');
  });
});

describe('règle « par motif »', () => {
  const t = bench('6060').topology;
  const b = bench('6060');
  const spec = { kind: 'voisins' as const, attrs: { paire: 'vitre + vitre', vitrage: '10mm' } };
  const n = countMotif(t, spec, null, cat).value;
  const rule = proposeRule(
    {
      article: '4-700-031',
      candidate: { per: 'motif', motif: spec, qty: 2, spare: { type: 'fixe', valeur: 1 }, base: n, result: 2 * n + 1, label: '', score: 0 },
      scope: 'toujours',
      confidence: 'a_confirmer',
      source: 'montre_3d',
      chantier: '6060',
    },
    SEED_RULES,
  );

  it('clé lisible acceptée par le serveur, règle en français', () => {
    expect(rule.key).toMatch(/^acc:4-700-031@motif\.voisins\.[0-9a-z]+\/motif$/);
    expect(SERVER_KEY.test(rule.key)).toBe(true);
    expect(rule.trigger).toEqual({ motif: spec });
    expect(describeRule(rule, cat)).toBe('2 par jonction entre deux panneaux voisins vitre + vitre, vitrage 10 mm (motif montré en 3D) · + 1 en spare');
    expect(rulesVersion([...SEED_RULES, rule])).not.toBe(rulesVersion(SEED_RULES));
  });

  it('le moteur compte le motif îlot par îlot, détail du calcul lisible', () => {
    const list = generate({ topology: t, rules: [...SEED_RULES, rule], catalogue: cat, answers: b.answers, study: b.study, observations: SEED_OBSERVATIONS });
    const before = generate({ topology: t, rules: SEED_RULES, catalogue: cat, answers: b.answers, study: b.study, observations: SEED_OBSERVATIONS });
    const l = list.lines.find((x) => x.article === '4-700-031')!;
    const l0 = before.lines.find((x) => x.article === '4-700-031');
    const c = l.contributions.find((x) => x.ruleKey === rule.key)!;
    expect(c.qty).toBe(2 * n + 1);
    expect(l.qty).toBe((l0?.qty ?? 0) + 2 * n + 1);
    expect(c.detail).toContain('jonctions entre panneaux voisins vitre + vitre');
    expect(c.ids.length).toBe(n);
  });

  it('motif sans motif enregistré : une question, jamais un chiffre inventé', () => {
    const broken: LoadingRule = { ...rule, key: 'acc:4-700-031@motif', trigger: {} };
    const list = generate({ topology: t, rules: [...SEED_RULES, broken], catalogue: cat, answers: b.answers, study: b.study });
    expect(list.questions.some((q) => /sans motif/.test(q.text))).toBe(true);
  });

  it('impact rejoué sur les bancs : seul le banc qui a ce motif change', () => {
    const res = impactOf(benchCases(), SEED_RULES, [...SEED_RULES, rule], cat, SEED_OBSERVATIONS, ['4-700-031']);
    const changed = res.filter((r) => r.changes.length).map((r) => r.case.id);
    expect(changed).toContain('banc:6060');
    expect(changed).not.toContain('banc:klokgebouw');
  });
});
