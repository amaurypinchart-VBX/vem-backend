// S12.3 — données lues par type de module : installation mixte Viewbox + type personnalisé (juxtaposés, empilés),
// poids pesé / calculé sans double compte, plancher par type, assemblages du type (absents ⇒ ⛔, jamais VBX-*),
// empilement avec un autre écart toiture / plancher, calage avec la surface d'appui du type et sans Prüfbuch TÜV.
import { describe, expect, it } from 'vitest';
import type { PlacedModule } from '../../src/structure/core/assemble';
import { assembleStructure, sectionMap, stackBand } from '../../src/structure/core/assemble';
import { computeCalage } from '../../src/structure/core/calage';
import type { EstimateModule } from '../../src/structure/core/estimate';
import type { Vec3 } from '../../src/structure/core/fem/types';
import type { ConnectionEntry, LibraryEntry, ModuleTypeEntry } from '../../src/structure/core/library';
import { buildLoadCases } from '../../src/structure/core/loads';
import { deckWeight, estimateTypeFields, moduleTypes, typeChecks, typeLoadInputs } from '../../src/structure/core/moduleTypes';
import { parametricFrame } from '../../src/structure/core/templates/frameModule';
import type { ParametricSpec } from '../../src/structure/core/templates/frameModule';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, floorPlywood, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { DEFAULT_HYP, calageInput } from '../../src/ui/structure/GroundPanel';
import { buildReport } from '../../src/structure/report/build';
import { FRENCH_MARKERS } from '../../src/structure/report/translate';
import { placedToEstimate } from '../../src/structure/core/mods';
import { LOADS } from './studyHelpers';

const VBX = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
const P = VBX.params!;

// type « Box Light » : rives UNP 220, traverses seules (plancher et toiture), angles semi-rigides, toiture plus haute
const spec: ParametricSpec = {
  long: 5900,
  short: 2500,
  inset: 5,
  roofZ: 3150,
  topZ: 3300,
  sections: { rimFloorLong: 'UNP220', rimFloorShort: 'UNP220', rimRoofLong: 'UNP220', rimRoofShort: 'UNP220', transverseFloor: 'RHP120x60x4', transverseRoof: 'RHP120x60x4', column: 'QHP100x5' },
  transversesFloor: 5,
  transversesRoof: 5,
  stringersFloor: [],
  stringersRoof: [],
  intermediateColumns: 0,
  middleFeet: false,
  columnModel: { model: 'semi', stiffness: P.springs.columnRotation },
  secondaryModel: 'pinned',
  sideModel: 'bolts',
  floor: { material: 'CP-F20/15', thickness: 18, layers: 2, span: 'u' },
  roof: null,
  base: { sections: P.sections, springs: P.springs, plywood: P.plywood },
};
const LIGHT_PARAMS = parametricFrame(spec);
const copy = (key: string, from: string, status: ConnectionEntry['status']): ConnectionEntry => ({ ...(SEED.find((e) => e.key === from) as ConnectionEntry), key, name: `${key} (saisi)`, status });
const LIGHT: ModuleTypeEntry = {
  kind: 'module_type',
  key: 'TYPE-LIGHT',
  name: 'Box Light',
  status: 'known',
  template: 'frame',
  family: 'other',
  nominal: { long: 5900, short: 2500, height: 3300 },
  params: LIGHT_PARAMS,
  footContact: { a1: 250, a2: 250 },
  // pas de liaison d'empilement : ⛔ pour les modules empilés
  connections: { corner: 'LIGHT-CORNER', contact: 'LIGHT-CONTACT', bolt: 'LIGHT-BOLT' },
  source: [{ ref: 'user' }],
};
const library: LibraryEntry[] = [...SEED, LIGHT, copy('LIGHT-CORNER', 'VBX-CORNER', 'suggested'), copy('LIGHT-CONTACT', 'VBX-VERTICAL-CONTACT', 'known'), copy('LIGHT-BOLT', 'VBX-HORIZONTAL-BOLT', 'known')];
const sections = sectionMap(library);

function place(id: string, entry: ModuleTypeEntry, x: number, y: number, level = 0, base = 0): PlacedModule {
  const u: Vec3 = [1, 0, 0];
  const v: Vec3 = [0, 0, -1];
  return { id, level, origin: [x * 1000, base, -y * 1000], u, v, params: entry.params!, templateKey: entry.key };
}

/** VBX-01 Viewbox au sol, L-01 Box Light à côté, L-02 Box Light posée sur L-01 (pas d'étage 3 300 mm). */
const MODULES = [place('VBX-01', VBX, 0, 0), place('L-01', LIGHT, 0, 2.5), place('L-02', LIGHT, 0, 2.5, 1, 3300)];

function inputs(modules: PlacedModule[], weights?: Record<string, number>): StudyInputs {
  const types = moduleTypes(modules, library, sections, { viewboxKg: 2564, weights });
  return {
    modules,
    edgeItems: [],
    pointItems: [],
    library,
    sections,
    loads: { ...LOADS, weightMode: 'weighed', ...typeLoadInputs(types, LOADS.floorFinish) },
    middleFeet: false,
    sls: true,
    options: { ...CALC_DEFAULTS, friction: 0.6 },
    blocking: [],
  };
}
const opt = { sections, jacks: false, middleFeet: false, upliftReleases: 'all' as const, calibration: false };

describe('S12.3 — données par type de module', () => {
  it('écart d’empilement tiré des paramètres : Viewbox [150 ; 450] (inchangé), Box Light e = 150', () => {
    const v = { params: P };
    expect(stackBand(v, v)).toEqual([150, 450]);
    expect(stackBand({ params: LIGHT_PARAMS }, { params: LIGHT_PARAMS })).toEqual([10, 310]);
    const m = assembleStructure(MODULES, opt);
    expect(m.errors).toEqual([]);
    // L-02 sur L-01 : 4 liaisons d'angle de longueur topZ − roofZ = 150 mm ; VBX-01 / L-01 boulonnées
    const links = m.meta.map((x, k) => ({ x, k })).filter(({ x }) => x.family === 'corner-link');
    expect(links).toHaveLength(4);
    for (const { k } of links) {
      const b = m.fem.members[k];
      expect(m.fem.nodes[b.j].y - m.fem.nodes[b.i].y).toBeCloseTo(150, 6);
    }
    expect(m.meta.some((x) => x.family === 'bolt' && x.line.includes('VBX-01') && x.line.includes('L-01'))).toBe(true);
    // une Viewbox posée sur une Box Light : liaison entre types différents signalée
    const mixed = assembleStructure([place('L-01', LIGHT, 0, 0), place('VBX-02', VBX, 0, 0, 1, 3300)], opt);
    expect(mixed.warnings.join(' ')).toMatch(/types différents/);
  });

  it('poids : Viewbox pesée inchangée ; Box Light sans pesée = barres + plafond + max(sol ; plancher du type), sans complément Gc', () => {
    const inp = inputs(MODULES);
    expect(inp.loads.weightModeByType).toEqual({ 'TYPE-LIGHT': 'computed' });
    // 2 × 18 mm de contreplaqué à 600 kg/m³ = 0,21 kN/m² < 0,40 kN/m² (sol statico) : sol des hypothèses
    expect(deckWeight(LIGHT_PARAMS) * 1e3).toBeCloseTo(0.212, 3);
    expect(inp.loads.floorFinishByType!['TYPE-LIGHT']).toBeCloseTo(LOADS.floorFinish, 12);
    const m = assembleStructure(MODULES, opt);
    const lm = buildLoadCases(m, inp.loads as never, sections);
    const rec = lm.records.find((r) => r.key === 'loads.moduleWeight:TYPE-LIGHT')!;
    expect(rec.title).toMatch(/poids calculé, non pesé/);
    // complément Gc : seulement sur la Viewbox
    const gc = lm.cases.find((c) => c.id === 'Gc')!;
    expect(gc.member.every((l) => m.meta[l.member].module === 'VBX-01')).toBe(true);
    // résultante G1 + G2 + G4 d'une Box Light = poids calculé de la note
    const own = (id: string) =>
      ['G1', 'G2', 'G4']
        .map((c) => lm.cases.find((x) => x.id === c)!)
        .reduce((s, c) => s + c.member.filter((l) => m.meta[l.member].module === id).reduce((a, l) => {
          const b = m.fem.members[l.member];
          const L = Math.hypot(m.fem.nodes[b.j].x - m.fem.nodes[b.i].x, m.fem.nodes[b.j].y - m.fem.nodes[b.i].y, m.fem.nodes[b.j].z - m.fem.nodes[b.i].z);
          const a0 = l.a ?? 0;
          const b0 = l.b ?? L;
          return a + (-(l.q1 + (l.q2 ?? l.q1)) / 2) * (b0 - a0);
        }, 0), 0);
    expect(own('L-01')).toBeCloseTo(rec.result!, -1);
    // avec une pesée saisie : mode pesé, complément si le modèle est plus léger
    const w = inputs(MODULES, { 'TYPE-LIGHT': 3000 });
    expect(w.loads.weightModeByType).toEqual({ 'TYPE-LIGHT': 'weighed' });
    expect(w.loads.moduleWeightByType!['TYPE-LIGHT']).toBeCloseTo(3000 * 9.81, 6);
    const lw = buildLoadCases(m, w.loads as never, sections);
    expect(lw.cases.find((c) => c.id === 'Gc')!.member.some((l) => m.meta[l.member].module === 'L-01')).toBe(true);
  });

  it('plancher par type : portée mesurée sur les traverses de la Box Light, Viewbox avec ses 800 mm', () => {
    const r = floorPlywood(inputs(MODULES));
    const titles = r.records.map((x) => x.title);
    expect(titles.some((t) => /^Box Light — Plancher/.test(t))).toBe(true);
    expect(titles.some((t) => /^Viewbox 5900/.test(t))).toBe(true);
    const light = r.records.find((x) => /^Box Light/.test(x.title))!;
    // 6 travées de (5895 − 5) / 6 = 981,7 mm
    expect(light.withValues).toMatch(/L = 98 cm/);
  });

  it('assemblages du type : liaison d’empilement absente ⇒ ⛔ « capacité inconnue », angle saisi ⇒ verdict « limite » au mieux', async () => {
    const inp = inputs(MODULES);
    const tc = typeChecks(inp);
    expect(tc.perModule['L-01'].typeName).toBe('Box Light');
    expect(tc.perModule['L-01'].corner?.key).toBe('LIGHT-CORNER');
    expect(tc.perModule['L-02'].plate).toBeUndefined();
    expect(tc.perModule['VBX-01']).toBeUndefined();
    expect(tc.cap).toBe('limit');
    expect(tc.notes.join(' ')).toMatch(/non couvert par une note de calcul de référence/);
    const run = await runStudy(inp, createInlineStudyRunner());
    const blocked = run.index.items.map((it, k) => ({ it, s: run.summary.states[k] })).filter(({ s }) => s?.blocked);
    expect(blocked.length).toBeGreaterThan(0);
    expect(blocked.every(({ s }) => /Capacité inconnue — Box Light/.test(s!.blocked!))).toBe(true);
    expect(blocked.some(({ s }) => /VBX-/.test(s!.blocked!))).toBe(false);
    expect(run.verdict.verdict).toBe('incomplete');
    expect(run.types?.cap).toBe('limit');
    // angles de VBX-01 : toujours VBX-CORNER (non bloqués)
    const vbxCorner = run.index.items.findIndex((it) => it.kind === 'corner' && it.module === 'VBX-01');
    expect(run.summary.states[vbxCorner]?.blocked).toBeFalsy();
  }, 300_000);

  it('vérins cochés sur un type sans vérin, surface d’appui manquante : ⛔', () => {
    const noFoot: ModuleTypeEntry = { ...LIGHT, footContact: undefined };
    const lib = library.map((e) => (e.key === 'TYPE-LIGHT' ? noFoot : e));
    const tc = typeChecks({ modules: MODULES, library: lib, sections, jacks: true });
    expect(tc.blocking.join(' ')).toMatch(/pieds à vérin non renseignés/);
    expect(tc.blocking.join(' ')).toMatch(/surface d’appui d’un pied à renseigner/);
  });

  it('calage : surface de contact du type (25 × 25 cm), installation sans Viewbox ⇒ pas de Prüfbuch TÜV', () => {
    const mod = (id: string, x: number, family?: 'other'): EstimateModule => ({
      id,
      level: 0,
      corners: [
        [x, 0],
        [x + 5900, 0],
        [x + 5900, 2500],
        [x, 2500],
      ],
      area: 5900 * 2500,
      height: 3300,
      ...(family ? { family, contact: { a1: 250, a2: 250 }, weightMode: 'computed' as const, steelWeight: 15000 } : {}),
    });
    const only = computeCalage(calageInput([mod('L-01', 0, 'other'), mod('L-02', 7000, 'other')], DEFAULT_HYP, { plates: [], commercial: [] }));
    expect(only.tuv.notApplicable).toBe(true);
    expect(only.types.every((t) => t.tuv === null)).toBe(true);
    expect(only.warnings.join(' ')).not.toMatch(/Prüfbuch/);
    expect(only.checks.every((c) => c.geometry.contact[0] === 250 && c.geometry.contact[1] === 250)).toBe(true);
    // Viewbox seules : inchangé (21 × 21, Prüfbuch)
    const vbx = computeCalage(calageInput([mod('VBX-01', 0), mod('VBX-02', 7000)], DEFAULT_HYP, { plates: [], commercial: [] }));
    expect(vbx.tuv.notApplicable).toBeUndefined();
    expect(vbx.types.every((t) => t.tuv !== null)).toBe(true);
    expect(vbx.checks.every((c) => c.geometry.contact[0] === 210)).toBe(true);
  });

  it('rapport d’une installation sans Viewbox : aucune mention TÜV / statico / pesée 2 564 kg / VBX-*, réserve « type non couvert »', async () => {
    const mods = [place('L-01', LIGHT, 0, 0), place('L-02', LIGHT, 0, 2.5)];
    const inp = inputs(mods);
    const run = await runStudy(inp, createInlineStudyRunner());
    const ground: EstimateModule[] = mods.map((pm) => ({ ...placedToEstimate(pm), ...estimateTypeFields(pm, moduleTypes(mods, library, sections, { viewboxKg: 2564 }), LOADS.ceiling, LOADS.floorFinish) }));
    const calage = computeCalage({ ...calageInput(ground, DEFAULT_HYP, { plates: [], commercial: [] }), reactions: run.ground });
    for (const lang of ['fr', 'de', 'en'] as const)
      for (const variant of ['compact', 'detailed'] as const) {
        const r = buildReport({
          lang,
          variant,
          project: { name: 'Test', number: '26-0001', client: 'Client', address: 'Adresse', installation: '01 / 01 / 2027' },
          author: 'Test',
          date: new Date(2026, 9, 7),
          model: { fileName: 'light.zip', date: '07.10.2026' },
          version: 'v1.0',
          study: inp,
          run,
          calage,
          bearing: { value: 200, label: 'Prairie' },
          moduleWeightKg: 2564,
          sceneWarnings: [],
        });
        const all = r.pages.flatMap((p) => [...p.svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1])).join('\n');
        const bad = all.split('\n').filter((l) => /statico|TÜV|Prüfbuch|2 ?564|VBX-(CORNER|VERTICAL|HORIZONTAL|JACK|BRACING)|18-0573|24-05/i.test(l));
        expect(bad, `${lang} ${variant}`).toEqual([]);
        if (lang === 'fr') expect(all).toMatch(/non couvert par une note de calcul de référence/);
        if (lang !== 'fr') {
          const own = ['Box Light', 'light.zip', 'Prairie', 'Adresse', 'Client'];
          const text = own.reduce((t, o) => t.split(o).join(''), all);
          const markers = FRENCH_MARKERS.filter((w) => !(lang === 'de' && ['des', 'service'].includes(w)) && !(lang === 'en' && ['service', 'charge'].includes(w)));
          const found = markers.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(text));
          const lines = text.split('\n').filter((l) => found.some((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(l)));
          expect(lines, `${lang} ${variant}`).toEqual([]);
        }
      }
  }, 300_000);
});

