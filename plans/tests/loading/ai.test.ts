// L7 atelier texte : garde de l'IA (src/services/loadingAiGuard.ts, copiée dans le build Docker de plans/) — aucun
// chiffre qui ne soit écrit par l'utilisateur, rien hors des listes — et règle brouillon construite côté module.
import { describe, expect, it } from 'vitest';
import { normalizeRuleAi, numbersInText } from '../../../src/services/loadingAiGuard';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';
import { SEED_RULES } from '../../src/loading/library/seed';
import { SEED_BENCHES } from '../../src/loading/benches';
import { aiAllowed, draftFromAi } from '../../src/loading/teach/aiRule';
import { topologyElements } from '../../src/loading/teach/motif';
import { describeRule } from '../../src/loading/core/describe';

const cat = new Map(SEED_CATALOGUE.map((c) => [c.ref, c]));
const t = SEED_BENCHES.find((b) => b.id === '6059')!.topology;
const allowed = aiAllowed(SEED_CATALOGUE, topologyElements(t, cat));

describe('chiffres du texte', () => {
  it('références, régimes de vitrage et M16 ne sont pas des quantités ; nombres en lettres comptés', () => {
    expect(numbersInText('2 plaques 4-700-040 par jonction décalée, vitrage 8.8.2, boulons M16, + 20 %')).toEqual([2, 20]);
    expect(numbersInText('deux joints par côté, 1,5 m de bande')).toEqual(expect.arrayContaining([2, 1.5]));
  });
});

describe('garde de l’IA', () => {
  const text = '2 plaques 4-700-040 par jonction décalée, + 1 en spare, seulement en box connectées';
  it('réponse correcte gardée telle quelle', () => {
    const n = normalizeRuleAi(
      {
        kind: 'accessoire',
        article: '4-700-040',
        qty: 2,
        per: 'motif',
        motif: { kind: 'jonction', attrs: { decalee: 'true' } },
        when: { regime: 'connecte' },
        spare: { type: 'fixe', valeur: 1 },
        unit: 'pce',
        questions: [],
        confidence: 0.9,
        rationale: 'Deux plaques par jonction décalée.',
      },
      allowed,
      text,
    );
    expect(n.removed).toEqual([]);
    expect(n.confidence).toBe(0.9);
    expect(n.draft).toMatchObject({ article: '4-700-040', qty: 2, per: 'motif', motif: { kind: 'jonction', attrs: { decalee: true } }, when: { regime: 'connecte' }, spare: { type: 'fixe', valeur: 1 } });
  });

  it('chiffres inventés, article et traits hors listes : retirés, listés « à renseigner », confiance plafonnée', () => {
    const n = normalizeRuleAi(
      {
        kind: 'accessoire',
        article: '9-999-999',
        qty: 3,
        per: 'motif',
        motif: { kind: 'jonction', attrs: { decalee: 'true', couleur: 'rouge' } },
        when: { regime: 'connecte', meteo: 'pluie' },
        spare: { type: 'pourcent', valeur: 30 },
        tranche: { pour: 1, parTranche: 8 },
        questions: ['Faut-il 4 plaques ?'],
        confidence: 0.95,
        rationale: 'J’ai mis 3 plaques et 30 % de spare.',
      },
      allowed,
      text,
    );
    expect(n.draft.article).toBeNull();
    expect(n.draft.qty).toBeNull();
    expect(n.draft.spare).toBeNull();
    expect(n.draft.tranche).toBeNull();
    expect(n.draft.motif).toEqual({ kind: 'jonction', attrs: { decalee: true } });
    expect(n.draft.when).toEqual({ regime: 'connecte' });
    expect(n.removed.join(' | ')).toMatch(/article « 9-999-999 ».*quantité 3.*trait du motif « couleur = rouge ».*condition « meteo = pluie ».*spare 30 %.*tranche/);
    expect(n.confidence).toBeLessThanOrEqual(0.4);
    // les textes de l'IA ne gardent que les chiffres de l'utilisateur
    expect(n.rationale).toBe('J’ai mis … plaques et … % de spare.');
    expect(n.questions).toEqual(['Faut-il … plaques ?']);
  });

  it('base « par produit » sans produit, réponse vide : rien d’inventé', () => {
    const n = normalizeRuleAi({ per: 'produit', trigger: { articles: ['0-000-000'] } }, allowed, 'un joint par vitre');
    expect(n.draft.per).toBeNull();
    expect(n.draft.trigger).toBeNull();
    expect(normalizeRuleAi(null, allowed, 'x').confidence).toBe(0);
  });
});

describe('règle brouillon', () => {
  it('motif → règle « par motif » à confirmer, source atelier texte, clé acceptée par le serveur', () => {
    const r = draftFromAi(
      {
        draft: { kind: 'accessoire', article: '4-700-040', qty: 2, per: 'motif', trigger: null, motif: { kind: 'jonction', attrs: { decalee: true } }, when: { regime: 'connecte' }, spare: { type: 'fixe', valeur: 1 }, tranche: null, unit: 'pce' },
        removed: [],
        questions: [],
        confidence: 0.9,
        rationale: '',
      },
      SEED_RULES,
      cat,
      { text: '2 plaques par jonction décalée' },
    )!;
    expect(r).toMatchObject({ source: 'atelier_texte', confidence: 'a_confirmer', per: 'motif', trigger: { motif: { kind: 'jonction', attrs: { decalee: true } } } });
    expect(/^[A-Za-z0-9_.:@/[\],+#!-]{3,200}$/.test(r.key)).toBe(true);
    expect(describeRule(r, cat)).toBe('2 par jonction entre box décalée (motif montré en 3D) · si box connectées · + 1 en spare');
    // tranche
    const tr = draftFromAi(
      { draft: { kind: 'ajout_chantier', article: '4-750-002', qty: 1, per: 'box', trigger: null, motif: null, when: {}, spare: null, tranche: { pour: 1, parTranche: 12 }, unit: 'pce' }, removed: [], questions: [], confidence: 0.8, rationale: '' },
      SEED_RULES,
      cat,
    )!;
    expect(tr.tranche).toEqual({ mode: 'tranche', pour: 1, parTranche: 12, arrondi: 'sup' });
    expect(draftFromAi({ draft: { ...tr, article: null } as never, removed: [], questions: [], confidence: 0, rationale: '' }, SEED_RULES, cat)).toBeNull();
  });
});
