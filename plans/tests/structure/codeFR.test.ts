// Référentiel France (A. Pinchart 09.11.2026 : « il me faut les deux codes, Eurocode et la loi structure temporaire ;
// que ce soit choisissable dans le calcul ») : vent NF EN 1991-1-4/NA (régions, terrain, durée), vent de service de
// l'arrêté du 25 juillet 2022, neige NF EN 1991-1-3/NA, combinaisons NF EN 1990/NA, γM0 = γM1 = 1,00, pas de Prüfbuch.
import { describe, expect, it } from 'vitest';
import { sectionMap } from '../../src/structure/core/assemble';
import { computeCalage } from '../../src/structure/core/calage';
import { buildCombinations, buildCombinationsFR, COMBO_FR } from '../../src/structure/core/combos';
import { gridModules } from '../../src/structure/core/estimate';
import { cprob, frPeak, frSnowGround, serviceWindPressure, spdHorizontalRatio, frWindRecords } from '../../src/structure/core/codeFR';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, inputKey, runStudy, studyCombinations } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { DEFAULT_HYP, calageInput, windPressures } from '../../src/ui/structure/GroundPanel';
import { LOADS, vbx } from './studyHelpers';

describe('vent France (NF EN 1991-1-4/NA, arrêté du 25 juillet 2022)', () => {
  it('coefficient de probabilité : 50 ans = 1 ; 5 ans (≤ 3 mois) ≈ 0,855 ; 2 ans (≤ 3 jours) ≈ 0,777', () => {
    expect(cprob(50)).toBeCloseTo(1, 10);
    expect(cprob(5)).toBeCloseTo(0.8545, 3);
    expect(cprob(2)).toBeCloseTo(0.7766, 3);
    expect(cprob(10)).toBeCloseTo(0.9025, 3);
  });

  it('pression de pointe : région 2, terrain IIIa, ≤ 3 mois, h = 6 m (calcul à la main)', () => {
    const p = frPeak({ region: 2, terrain: 'IIIa', duration: '3m', serviceSpeed: 20 }, 6000);
    // vb = 24 · 0,8545 = 20,51 m/s ; qb = ½ · 1,225 · 20,51² = 257,6 N/m²
    expect(p.vb).toBeCloseTo(20.51, 1);
    expect(p.qb * 1e6).toBeCloseTo(257.6, 0);
    // kr = 0,19 (0,2 / 0,05)^0,07 = 0,2094 ; cr = kr ln(6 / 0,2) = 0,7121 ; kl = 0,9703 ; Iv = 0,2853 ; ce = 1,520
    expect(p.kr).toBeCloseTo(0.2094, 3);
    expect(p.cr).toBeCloseTo(0.7121, 3);
    expect(p.kl).toBeCloseTo(0.9703, 3);
    expect(p.ce).toBeCloseTo(1.52, 2);
    expect(p.qp * 1e6).toBeCloseTo(392, -1);
  });

  it('hauteur sous zmin prise à zmin ; situation de moins de 3 mois relevée à 20 m/s ; 50 ans plus fort', () => {
    const low = frPeak({ region: 2, terrain: 'IV', duration: 'long', serviceSpeed: 20 }, 3000);
    expect(low.z).toBe(15);
    const short = frPeak({ region: 1, terrain: 'II', duration: '3d', serviceSpeed: 20 }, 3000);
    expect(short.raised).toBe(true);
    expect(short.vb).toBe(20);
    const long = frPeak({ region: 1, terrain: 'II', duration: 'long', serviceSpeed: 20 }, 3000);
    expect(long.vb).toBe(22);
    expect(long.qp).toBeGreaterThan(short.qp);
  });

  it('vent de service : 20 m/s (72 km/h) → q = 0,245 kN/m² ; charge horizontale 6 % puis 10 % au-delà de 500 m²', () => {
    expect(serviceWindPressure(20) * 1e3).toBeCloseTo(0.245, 3);
    expect(spdHorizontalRatio(14.75e6 * 10)).toBe(0.06);
    expect(spdHorizontalRatio(14.75e6 * 40)).toBe(0.1);
    const rec = frWindRecords({ region: 3, terrain: 'II', duration: '3m', serviceSpeed: 20 }, 6000);
    expect(rec.map((r) => r.key)).toEqual(['wind.inService', 'wind.reference', 'wind.outOfService']);
    expect(rec[0].clause).toContain('25 juillet 2022');
  });
});

describe('neige France (NF EN 1991-1-3/NA)', () => {
  it('régions et altitude (continuité des formules à 500 et 1 000 m)', () => {
    expect(frSnowGround('A2', 100)).toBeCloseTo(0.45, 10);
    expect(frSnowGround('C1', 600)).toBeCloseTo(0.65 + 0.9 - 0.45, 10);
    expect(frSnowGround('E', 800)).toBeCloseTo(1.4 + 2.8 - 1.3, 10);
    for (const r of ['B1', 'E'] as const)
      for (const A of [200, 500, 1000]) expect(frSnowGround(r, A - 1e-6)).toBeCloseTo(frSnowGround(r, A + 1e-6), 5);
  });
});

describe('combinaisons France (NF EN 1990/NA)', () => {
  const c = buildCombinationsFR({ ...COMBO_FR, snow: true });
  const f = (id: string, k: string) => c.find((x) => x.id === id)!.factors.find(([n]) => n === k)?.[1];
  it('STR 1,35 / 1,5 avec ψ0 (vent 0,6, public 0,7, neige 0,5), EQU 0,9 / 1,5, structure évacuée hors service', () => {
    expect(f('CO1', 'G1')).toBe(1.35);
    expect(f('CO11', 'Q1.1')).toBe(1.5);
    expect(f('CO13', 'W1.1')).toBe(0.9);
    expect(f('CO14', 'Q1.1')).toBe(1.05);
    expect(f('CO14', 'W1.1')).toBe(1.5);
    expect(f('CO101', 'W2.1')).toBe(1.5);
    expect(f('CO102', 'G1')).toBe(1);
    expect(f('CO102', 'W0')).toBe(1.5);
    expect(f('COB1', 'G1')).toBe(0.9);
    expect(f('COB1', 'G2')).toBe(0.9);
    expect(f('COB1', 'G7')).toBe(0);
    expect(f('COB1', 'W2.1')).toBe(1.5);
    expect(f('CO104', 'S')).toBe(0.75);
    expect(f('ELS11', 'W1.1')).toBe(0.6);
    expect(f('ELS12', 'Q1.1')).toBe(0.7);
    // hors service, le public est évacué : jamais d'exploitation Q2
    expect(c.some((x) => x.factors.some(([k]) => k.startsWith('Q2')))).toBe(false);
    // le référentiel Allemagne ne change pas
    expect(buildCombinations().find((x) => x.id === 'CO11')!.factors.find(([n]) => n === 'Q1.1')?.[1]).toBe(1.35);
  });
  it('équilibre sous le vent de service seulement quand il dépasse le vent hors service', () => {
    const loads = { ...LOADS, windInService: 0.3e-3, windOutOfService: 0.2e-3 };
    expect(studyCombinations({ code: 'FR', sls: true, loads }).some((x) => x.id === 'COB11')).toBe(true);
    expect(studyCombinations({ code: 'FR', sls: true, loads: LOADS }).some((x) => x.id === 'COB11')).toBe(false);
  });
});

describe('étude complète en référentiel France', () => {
  const de: StudyInputs = {
    modules: [vbx('A', 0, 0), vbx('B', 5.9, 0)],
    edgeItems: [],
    pointItems: [],
    library: SEED,
    sections: sectionMap(SEED),
    loads: LOADS,
    middleFeet: false,
    sls: true,
    options: { ...CALC_DEFAULTS, friction: 0.6 },
    blocking: [],
  };
  const fr: StudyInputs = { ...de, code: 'FR', loads: { ...LOADS, live: 5e-3, liveGround: 5e-3, horizontalRatio: 0.06, windInService: 0.245e-3, windOutOfService: 0.42e-3 } };

  it('calcul, γM0 = γM1 = 1,00, plancher avec γM 1,2 et 1,35 / 1,5, empreinte différente', async () => {
    const run = await runStudy(fr, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    expect(run.combos.some((c) => c.id === 'CO14')).toBe(true);
    expect(run.stability.sliding.combo).toMatch(/^COB/);
    const recs = run.plywood.records.map((r) => `${r.clause} ${r.withValues}`).join('\n');
    expect(recs).toContain('NF EN 1995-1-1/NA');
    expect(recs).toMatch(/qEd = 1,35 · 0,40 \+ 1,50 · 5,00 \+ 0,90 · /);
    // rez-de-chaussée (trois travées) vérifié même quand les étages ont la même charge
    expect(run.plywood.records.some((r) => /rez-de-chaussée/.test(r.title))).toBe(true);
    expect(inputKey(fr)).not.toBe(inputKey(de));
    // l'Allemagne garde son empreinte (pas de champ « code »)
    expect(inputKey(de)).not.toContain('code:FR');
  }, 120000);
});

describe('calage en référentiel France', () => {
  const mods = gridModules(2, 1, [[1, 1]], false);
  const hyp = { ...DEFAULT_HYP, code: 'FR' as const, frWind: { region: 2 as const, terrain: 'IIIa' as const, duration: '3m' as const, serviceSpeed: 20 } };
  it('pas de Prüfbuch TÜV, réactions caractéristiques, vent de l’arrêté et de NF EN 1991-1-4', () => {
    const inp = calageInput(mods, hyp, { plates: [], commercial: [] }, true);
    expect(inp.code).toBe('FR');
    expect(inp.staticoConversion).toBe(false);
    expect(inp.estimate.code).toBe('FR');
    expect(inp.estimate.windInService * 1e3).toBeCloseTo(0.245, 3);
    expect(inp.estimate.horizontalRatio).toBe(0.06);
    const w = windPressures(hyp, 3080);
    expect(w.windOut).toBeGreaterThan(0.3);
    const r = computeCalage(inp);
    expect(r.tuv.notApplicable).toBe(true);
    expect(r.tuv.tuvMinimum).toBe(false);
    expect(r.types.every((t) => t.tuv === null)).toBe(true);
    expect(r.warnings.some((x) => /Prüfbuch/.test(x))).toBe(false);
    // Allemagne : inchangé (Prüfbuch comparé)
    const d = computeCalage(calageInput(mods, DEFAULT_HYP, { plates: [], commercial: [] }, true));
    expect(d.tuv.notApplicable).toBeUndefined();
  });
});

describe('rapport en référentiel France', () => {
  it('normes françaises, vent de service, sans DIN EN 13814 / MVV / Prüfbuch ; DE et EN sans mot français', async () => {
    const { buildReport } = await import('../../src/structure/report/build');
    const { FRENCH_MARKERS } = await import('../../src/structure/report/translate');
    const texts = (svg: string) => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((m) => m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"'));
    const wind = { region: 2 as const, terrain: 'IIIa' as const, duration: '3m' as const, serviceSpeed: 20 };
    const study: StudyInputs = {
      code: 'FR',
      modules: [vbx('A', 0, 0), vbx('B', 5.9, 0)],
      edgeItems: [],
      pointItems: [],
      library: SEED,
      sections: sectionMap(SEED),
      loads: { ...LOADS, live: 5e-3, liveGround: 5e-3, horizontalRatio: 0.06, windInService: 0.245e-3, windOutOfService: 0.42e-3, snowRoof: 0.8 * 0.45e-3, frSite: { wind, snow: { region: 'A2', altitude: 100 } } },
      middleFeet: false,
      sls: true,
      options: { ...CALC_DEFAULTS, friction: 0.6 },
      blocking: [],
    };
    const run = await runStudy(study, createInlineStudyRunner());
    const mods = gridModules(2, 1, [[1, 1]], false);
    const calage = computeCalage({ ...calageInput(mods, { ...DEFAULT_HYP, code: 'FR', frWind: wind }, { plates: [], commercial: [] }), reactions: run.ground });
    for (const lang of ['fr', 'de', 'en'] as const) {
      const r = buildReport({
        lang,
        variant: 'detailed',
        project: { name: 'P', number: '1', client: 'C', address: 'A', installation: '1' },
        author: 'A',
        date: new Date(2026, 10, 9),
        model: { fileName: 'm.zip', date: '09.11.2026' },
        version: 'v1',
        study,
        run,
        calage,
        bearing: { value: 200, label: 'Sol ferme' },
        moduleWeightKg: 2564,
        sceneWarnings: [],
      });
      const all = r.pages.flatMap((p) => texts(p.svg)).join('\n');
      expect(all).not.toMatch(/NaN|undefined|Infinity|\[object/);
      // référentiel allemand absent (DIN EN 13814, MVV TB, Prüfbuch TÜV, Fliegende Bauten)
      // (sauf la phrase qui dit justement qu'il n'y a pas de Prüfbuch en France)
      expect(all.split('\n').filter((l) => /DIN EN 13814|MVV|Prüfbuch|Fliegende? Bau/.test(l) && !/^(Pas de Prüfbuch|Kein TÜV|No TÜV)/.test(l))).toEqual([]);
      expect(all).toContain('NF EN 1991-1-4/NA');
      if (lang === 'fr') {
        expect(all).toContain('arrêté du 25 juillet 2022');
        expect(all).toContain('NF EN 1990/NA');
        continue;
      }
      const markers = FRENCH_MARKERS.filter((w) => !(lang === 'de' && ['des', 'service'].includes(w)) && !(lang === 'en' && ['service', 'charge'].includes(w)));
      const found = markers.filter((w) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(all));
      expect(found.map((w) => all.split('\n').find((l) => new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(l)))).toEqual([]);
    }
  }, 180000);
});
