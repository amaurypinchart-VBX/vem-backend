// VS8 — assistant « 🤖 Décris la vue » : données envoyées (inventaire sans géométrie, < 150 Ko), nettoyage des
// opérations (clé inconnue supprimée, valeur hors bornes ramenée, confiance ≤ 0,4), application sur un brouillon sans
// toucher la vue d'origine, garde-fou serveur (structureAiGuard.normalizeViewAi), les 6 phrases de référence.
import { describe, expect, it } from 'vitest';
import { makeLookup } from '../../src/core/subset';
import { makeTagResolver } from '../../src/core/customViews/tags';
import { moduleRefs } from '../../src/core/customViews/refs';
import { payloadBytes, viewAiPayload } from '../../src/core/customViews/aiPayload';
import { applyViewOps, cleanViewOps } from '../../src/core/customViews/cleanViewOps';
import { VIEW_PRESETS } from '../../src/core/customViews/presets';
import { blankSpec } from '../../src/core/customViews/editor';
import { cleanCustomView } from '../../src/core/customViews/clean';
import { normalizeViewAi } from '../../../src/services/structureAiGuard';
import { fakeScene, grid2x3 } from './helpers';
import { REFERENCE_SENTENCES } from './aiFixture';

function setup() {
  const s = fakeScene(grid2x3(), { wallOn: ['VBX-02'], glassOn: ['VBX-03'], common: true });
  const look = makeLookup(s.index);
  const tags = makeTagResolver(s.index);
  const refs = new Map(s.index.modules.map((m) => [m.id, moduleRefs(s.index, look, tags, s.frames.get(m.id)!)]));
  const spec = blankSpec('v1', '2026-10-14');
  const payload = viewAiPayload({ index: s.index, look, tags, frames: s.frames, refs, spec, presets: VIEW_PRESETS });
  return { s, payload, spec };
}

describe('données envoyées à l’IA', () => {
  it('inventaire : Viewbox (rangées / colonnes), types de pièces avec étiquette et hauteur depuis le plancher, pas de géométrie', () => {
    const { payload } = setup();
    expect(payload.modules).toHaveLength(6);
    expect(new Set(payload.modules.map((m) => `${m.row},${m.col}`)).size).toBe(6);
    const ceil = payload.partTypes.find((p) => p.definition === 'black_cieling')!;
    expect(ceil).toMatchObject({ tag: 'plafond-tendu', perModule: 1, total: 6, inViewbox: true });
    expect(ceil.heightFromFloor).toEqual([2510, 2510]);
    expect(payload.tags.map((t) => t.tag)).toContain('eclairage');
    expect(payload.presets.map((p) => p.key)).toContain('roof-under-no-ceiling');
    expect(payload.heights['roof-bottom']).toBe(2750);
    expect(JSON.stringify(payload)).not.toMatch(/"(positions|triangles|bboxMm)"/);
    expect(payloadBytes(payload)).toBeLessThan(150_000);
  });
});

describe('nettoyage et application', () => {
  it('clé inconnue supprimée, valeurs ramenées, identifiants de pièce refusés, confiance plafonnée à 0,4', () => {
    const { payload } = setup();
    const c = cleanViewOps(
      {
        ops: [
          { op: 'setCamera', dir: 'diagonale', rotate: 100 },
          { op: 'addCut', axis: 'horizontal', ref: 'roof-bottom', offset: -99999, keep: 'positive' },
          { op: 'addRule', rule: 'hide', match: { viewTags: ['plafond-tendu', 'licorne'], nodeIds: ['n12'] }, label: 'Plafond' },
          { op: 'addRule', rule: 'hide', match: { definitions: ['n’existe pas'] }, label: 'X' },
          { op: 'usePreset', key: 'inventé' },
          { op: 'setBox', moduleId: 'VBX-99' },
          { op: 'formater' },
        ],
        confidence: 0.95,
        questions: ['Quel niveau ?', '', 7],
        rationale: 'ok',
      },
      payload,
    );
    expect(c.confidence).toBe(0.4);
    expect(c.ops.map((o) => o.op)).toEqual(['setCamera', 'addCut', 'addRule']);
    expect(c.ops[0]).toEqual({ op: 'setCamera', rotate: 90 });
    expect(c.ops[1]).toMatchObject({ offset: -payload.maxHeight });
    expect(c.ops[2]).toMatchObject({ match: { viewTags: ['plafond-tendu'] } });
    expect(c.questions).toEqual(['Quel niveau ?']);
    expect(c.removed.length).toBeGreaterThanOrEqual(7);
  });

  it('application sur un brouillon : vue d’origine intacte, règles « IA », coupe verticale regardée de face', () => {
    const { payload, spec } = setup();
    const before = JSON.stringify(spec);
    const c = cleanViewOps(
      {
        ops: [
          { op: 'usePreset', key: 'roof-under-no-ceiling' },
          { op: 'setLayout', mode: 'assembled+exploded' },
          { op: 'addCut', axis: 'long', ref: 'mid', offset: 0, label: 'a' },
          { op: 'addRule', rule: 'hide', match: { categories: ['MUR-LEGER'] }, label: 'Murs' },
        ],
        confidence: 0.9,
        name: 'Dessous de toiture — sans plafond tendu — ensemble + séparées',
      },
      payload,
    );
    expect(c.confidence).toBe(0.9);
    const draft = applyViewOps(spec, c.ops, { presets: VIEW_PRESETS, boxFor: () => undefined, now: 'n' });
    expect(JSON.stringify(spec)).toBe(before);
    expect(draft.id).toBe(spec.id);
    expect(draft.layout.mode).toBe('assembled+exploded');
    expect(draft.visibility.every((r) => r.source === 'ai')).toBe(true);
    expect(draft.visibility.map((r) => r.match.viewTags?.[0] ?? r.match.categories?.[0])).toEqual(['plafond-tendu', 'MUR-LEGER']);
    expect(draft.cuts.map((x) => x.axis)).toEqual(['horizontal', 'long']);
    expect(draft.cuts[1].label).toBe('A');
    expect(draft.camera).toMatchObject({ frame: 'module', dir: 'left' });
    expect(cleanCustomView(draft)).toEqual(draft); // le brouillon est une vue valide
  });

  it('garde-fou serveur : mêmes refus (clé inconnue, hors bornes, identifiant de pièce, confiance ≤ 0,4)', () => {
    const { payload } = setup();
    const n = normalizeViewAi(
      {
        ops: [
          { op: 'addRule', rule: 'hide', match: { viewTags: ['plafond-tendu', 'zzz'], nodeIds: ['n1'] } },
          { op: 'addCut', axis: 'horizontal', offset: 50000 },
          { op: 'usePreset', key: 'nope' },
          { op: 'rm -rf' },
          { op: 'setScope', modules: ['VBX-01', 'VBX-77'] },
        ],
        confidence: 1,
        questions: ['Quelle box ?'],
        rationale: 'r',
      },
      payload,
    );
    expect(n.ops.map((o) => o.op)).toEqual(['addRule', 'addCut', 'setScope']);
    expect(n.ops[0].match).toEqual({ viewTags: ['plafond-tendu'] });
    expect(n.ops[1].offset).toBe(payload.maxHeight);
    expect(n.ops[2].modules).toEqual(['VBX-01']);
    expect(n.confidence).toBe(0.4);
    expect(n.questions).toEqual(['Quelle box ?']);
  });

  it('les 6 phrases de référence (réponses types) donnent la vue attendue', () => {
    const { payload, spec } = setup();
    for (const ref of REFERENCE_SENTENCES) {
      const c = cleanViewOps(ref.answer, payload);
      expect(c.removed, ref.text).toEqual([]);
      const draft = applyViewOps(spec, c.ops, { presets: VIEW_PRESETS, boxFor: (m) => ({ frame: 'module', moduleId: m, min: [0, 0, 0], max: [1, 1, 1] }), now: 'n' });
      ref.check(draft);
    }
  });
});
