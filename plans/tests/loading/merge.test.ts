// Fusion base de départ + règles enregistrées, version de la base.
import { describe, expect, it } from 'vitest';
import type { LoadingRule } from '../../src/loading/core/types';
import { mergeCatalogue, mergeRules, rulesVersion } from '../../src/loading/library/merge';
import { SEED_RULES } from '../../src/loading/library/seed';
import { SEED_CATALOGUE } from '../../src/loading/library/catalogue';

const rule = (key: string, qty: number, extra: Partial<LoadingRule> = {}): LoadingRule => ({
  key,
  kind: 'accessoire',
  trigger: {},
  article: '4-700-003',
  qty,
  per: 'box',
  unit: 'pce',
  confidence: 'confirme',
  calibration: [],
  version: 1,
  active: true,
  source: 'seed',
  ...extra,
});

describe('fusion des règles', () => {
  const seed = [rule('a', 1), rule('b', 2)];
  it('une règle enregistrée remplace la base de départ de même clé, jamais l’inverse', () => {
    const merged = mergeRules(seed, [
      { id: 'r1', key: 'b', data: rule('b', 5, { source: 'correction' }), active: true, version: 2, updatedBy: 'u', updatedAt: '2026-10-12' },
      { id: 'r2', key: 'c', data: rule('c', 7, { source: 'montre_3d' }), active: true, version: 1, updatedBy: 'u', updatedAt: '2026-10-12' },
    ]);
    expect(merged.map((r) => [r.key, r.qty, r.origin2])).toEqual([
      ['a', 1, 'seed'],
      ['b', 5, 'override'],
      ['c', 7, 'user'],
    ]);
  });
  it('une règle désactivée en base reste désactivée', () => {
    const merged = mergeRules(seed, [{ id: 'r1', key: 'a', data: rule('a', 1), active: false, version: 2, updatedBy: null, updatedAt: '' }]);
    expect(merged.find((r) => r.key === 'a')?.active).toBe(false);
  });
});

describe('version de la base', () => {
  it('ne dépend ni de l’ordre ni des remarques', () => {
    const a = [rule('a', 1), rule('b', 2)];
    const b = [rule('b', 2, { remark: 'note' }), rule('a', 1, { calibration: [{ chantier: 'X' }] })];
    expect(rulesVersion(a)).toBe(rulesVersion(b));
  });
  it('change avec une quantité, une condition ou une désactivation', () => {
    const v = rulesVersion([rule('a', 1)]);
    expect(rulesVersion([rule('a', 2)])).not.toBe(v);
    expect(rulesVersion([rule('a', 1, { when: { regime: 'standalone' } })])).not.toBe(v);
    expect(rulesVersion([rule('a', 1, { active: false })])).not.toBe(v);
  });
  it('base de départ : version stable', () => {
    expect(rulesVersion(SEED_RULES)).toMatch(/^[0-9a-z]+$/);
  });
});

describe('catalogue', () => {
  it('un ajout validé complète le catalogue sans toucher aux réfs du classeur', () => {
    const merged = mergeCatalogue(SEED_CATALOGUE, [
      { ref: '4-700-002', designation: 'PAINT LEVASSEUR 1K RAL7024 20L', data: { categorie: 'consommables', unit: 'pce', gros: false }, createdBy: 'u', createdAt: '' },
    ]);
    expect(merged.length).toBe(SEED_CATALOGUE.length + 1);
    expect(merged.find((c) => c.ref === '4-700-002')).toMatchObject({ source: 'ajout', categorie: 'consommables' });
    expect(merged.find((c) => c.ref === '7-962-016')?.source).toBe('classeur');
  });
});
