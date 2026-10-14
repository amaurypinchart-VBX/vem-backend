// Les 6 phrases de référence de l'assistant « Décris la vue » (spec § 9.5) avec une réponse type de l'IA et ce que
// la vue obtenue doit contenir. Sert aux tests unitaires ; le faux serveur e2e (e2e/server.mjs) répond pareil.
import { expect } from 'vitest';
import type { CustomViewSpec } from '../../src/core/customViews/types';

export interface ReferenceSentence {
  text: string;
  answer: unknown;
  check: (s: CustomViewSpec) => void;
}

const tagsOf = (s: CustomViewSpec, op: string) => s.visibility.filter((r) => r.op === op).flatMap((r) => r.match.viewTags ?? []);

export const REFERENCE_SENTENCES: ReferenceSentence[] = [
  {
    text: 'Montre-moi le dessous de la toiture sans le plafond tendu, toutes les box ensemble puis séparées.',
    answer: { ops: [{ op: 'usePreset', key: 'roof-under-no-ceiling' }, { op: 'setLayout', mode: 'assembled+exploded' }], confidence: 0.9, rationale: 'Préréglage + ensemble puis séparées.' },
    check: (s) => {
      expect(s.camera.dir).toBe('bottom');
      expect(s.cuts[0]).toMatchObject({ axis: 'horizontal', ref: { kind: 'level', ref: 'roof-bottom' }, offset: -200, keep: 'positive' });
      expect(tagsOf(s, 'hide')).toEqual(['plafond-tendu']);
      expect(s.layout.mode).toBe('assembled+exploded');
    },
  },
  {
    text: 'Coupe longitudinale au milieu de la VBX-03, sans les vitrages.',
    answer: {
      ops: [
        { op: 'setScope', modules: ['VBX-03'] },
        { op: 'addCut', axis: 'long', ref: 'mid', offset: 0, label: 'A' },
        { op: 'addRule', rule: 'hide', match: { categories: ['VITRE-SEAMLESS'] }, label: 'Vitrages' },
      ],
      confidence: 0.85,
    },
    check: (s) => {
      expect(s.scope.modules).toEqual(['VBX-03']);
      expect(s.cuts.map((c) => [c.axis, c.label])).toEqual([['long', 'A']]);
      expect(s.camera).toMatchObject({ frame: 'module', dir: 'left' });
      expect(s.visibility[0].match.categories).toEqual(['VITRE-SEAMLESS']);
    },
  },
  {
    text: 'Le dessous de la box, avec seulement les pieds et les plaques de calage.',
    answer: { ops: [{ op: 'setCamera', dir: 'bottom' }, { op: 'addRule', rule: 'isolate', match: { viewTags: ['pied'] }, label: 'Pieds et calage' }], confidence: 0.7 },
    check: (s) => {
      expect(s.camera.dir).toBe('bottom');
      expect(tagsOf(s, 'isolate')).toEqual(['pied']);
    },
  },
  {
    text: 'Vue de dessus coupée à 1,20 m, sans le mobilier.',
    answer: { ops: [{ op: 'usePreset', key: 'plan-cut-1200' }], confidence: 0.8, rationale: 'Pas de mobilier dans ce modèle.' },
    check: (s) => {
      expect(s.camera.dir).toBe('top');
      expect(s.cuts[0]).toMatchObject({ ref: { kind: 'level', ref: 'floor-top' }, offset: 1200, keep: 'negative' });
    },
  },
  {
    text: 'Seulement la structure acier, en iso, chaque box séparée.',
    answer: { ops: [{ op: 'usePreset', key: 'structure-only' }, { op: 'setLayout', mode: 'per-module' }], confidence: 0.8 },
    check: (s) => {
      expect(s.camera.dir).toBe('iso');
      expect(tagsOf(s, 'hide')).toEqual(expect.arrayContaining(['facade', 'plafond-tendu', 'eclairage']));
      expect(s.layout.mode).toBe('per-module');
    },
  },
  {
    text: 'Unterseite des Daches ohne Spanndecke, alle Boxen getrennt.',
    answer: { ops: [{ op: 'usePreset', key: 'roof-under-no-ceiling' }, { op: 'setLayout', mode: 'exploded' }], confidence: 0.9 },
    check: (s) => {
      expect(s.camera.dir).toBe('bottom');
      expect(tagsOf(s, 'hide')).toEqual(['plafond-tendu']);
      expect(s.layout.mode).toBe('exploded');
    },
  },
];
