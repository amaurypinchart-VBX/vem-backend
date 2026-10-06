// Liaison personnalisée (S11a) : la liaison d'origine recalculée composant par composant retombe sur les capacités de
// la bibliothèque (statico 24-0571 § 3.9, EN 1993-1-8) ; cas de manuel par composant ; données manquantes → incomplet ;
// frottement sans serrage contrôlé → indicatif ; direction sans chemin → « ne retient rien ».
import { describe, expect, it } from 'vitest';
import { computeJoint, stepResistance } from '../../src/structure/core/checks/jointDesign';
import type { JointDesign } from '../../src/structure/core/jointDesign';
import { JOINT_TEMPLATES, designFromTemplate, jointKey } from '../../src/structure/core/jointDesign';
import { seedSection } from '../../src/structure/library/seed';
import { SEED_CONNECTIONS } from '../../src/structure/library/seed';

const tpl = (key: string) => JOINT_TEMPLATES.find((t) => t.key === key)!;
const cap = (key: string) => SEED_CONNECTIONS.find((c) => c.key === 'VBX-VERTICAL-PLATE')!.capacities.find((c) => c.key === key)!.value;
const rel = (a: number, b: number) => Math.abs(a - b) / b;

describe('liaison d’origine recalculée par composants', () => {
  const d = tpl('JD-ORIGINE-PLAT');
  const r = computeJoint(d);
  const step = (dir: 'uplift' | 'slideShort', comp: string, mode: string) => r.directions[dir].steps.find((s) => s.component === comp && s.step.mode === mode)!.value!;

  it('retombe sur la bibliothèque à ± 2 % : Fv,Rd M20 94,1 · Fb,Rd plat 120,0 · âme 129,6 · Nu,Rd 202,2 · HRd 5,81 kN', () => {
    expect(rel(step('uplift', 'B', 'bolt-shear'), cap('FvRd_M20'))).toBeLessThan(0.02);
    expect(rel(step('uplift', 'P', 'plate-bearing'), cap('FbRd_plate'))).toBeLessThan(0.02);
    expect(rel(step('uplift', 'W', 'plate-bearing'), cap('FbRd_web'))).toBeLessThan(0.02);
    expect(rel(step('uplift', 'P', 'plate-net'), cap('NuRd_plate'))).toBeLessThan(0.02);
    expect(rel(r.directions.slideShort.capacity!, cap('HRd'))).toBeLessThan(0.02);
    // soulèvement : le minimum gouverne (boulon cisaillé)
    expect(r.directions.uplift.capacity).toBeCloseTo(step('uplift', 'B', 'bolt-shear'), 6);
    expect(r.directions.uplift.governing!.label).toMatch(/cisaillement/);
    expect(r.status).toBe('recalculated');
    // tâche statico : l'âme de l'UNP 220 a bien tw = 9 mm
    expect(seedSection('UNP220').section.dims.tw).toBe(9);
  });

  it('M20-8.8 en traction : 141,1 kN (bibliothèque)', () => {
    const t = stepResistance(d, { component: 'B', mode: 'bolt-tension' }, 'uplift');
    expect(rel(t.value!, cap('FtRd_M20'))).toBeLessThan(0.001);
  });
});

describe('composants (cas de manuel calculés à la main)', () => {
  const base: JointDesign = {
    ...designFromTemplate(tpl('JD-EQUERRE'), 'JD-T'),
    components: [
      { id: 'A', kind: 'plate', label: 'plaque 15', t: 15, width: 120, grade: 'S355', hole: { d0: 18, e1: 40, e2: 30 } },
      { id: 'B', kind: 'bolt', label: 'M16-10.9', d: 16, grade: '10.9', threadInShear: true, preload: 'controlled', tappedLength: 15 },
      { id: 'W', kind: 'weld', label: 'cordon', a: 5, length: 100, grade: 'S235' },
      { id: 'S', kind: 'contact', label: 'aile', mu: 0.3, area: 2000 },
    ],
  };
  const v = (mode: Parameters<typeof stepResistance>[1]['mode'], extra: Partial<Parameters<typeof stepResistance>[1]> = {}) => stepResistance(base, { component: mode.startsWith('plate') ? 'A' : mode === 'weld' ? 'W' : mode === 'contact' ? 'S' : 'B', mode, ...extra }, 'uplift');

  it('boulon M16-10.9 : Fv = 0,5 · 1000 · 157 / 1,25 = 62,8 kN ; Ft = 113,0 kN ; frottement 2 plans 0,3 · 109,9 · 0,8 / 1,25', () => {
    expect(v('bolt-shear').value! / 1e3).toBeCloseTo(62.8, 1);
    expect(v('bolt-tension').value! / 1e3).toBeCloseTo(113.04, 2);
    expect(v('friction', { planes: 2 }).value! / 1e3).toBeCloseTo((2 * 0.3 * 0.7 * 1000 * 157 * 0.8) / 1.25 / 1e3, 3);
    expect(v('friction', { planes: 2 }).indicative).toBeUndefined();
  });

  it('pression diamétrale plaque 15 mm S355 : k1 = min(2,8 · 30 / 18 − 1,7 ; 2,5) = 2,5 ; αb = 40 / 54', () => {
    const r = v('plate-bearing', { bolt: 'B' });
    expect(r.value! / 1e3).toBeCloseTo((2.5 * (40 / 54) * 490 * 16 * 15) / 1.25 / 1e3, 3);
  });

  it('soudure a 5 × 100 S235 : 5 · 100 · 360 / (√3 · 0,8 · 1,25) = 103,9 kN', () => {
    expect(v('weld').value! / 1e3).toBeCloseTo((5 * 100 * 360) / (Math.sqrt(3) * 0.8 * 1.25) / 1e3, 3);
  });

  it('plaque en console : Mpl = 120 · 15² / 4 · 355 = 2 396 kNmm, bras 50 mm → 47,9 kN ; taraudage 15 mm pour M16 → pleine résistance mais indicatif', () => {
    expect(v('plate-bending', { lever: 50 }).value! / 1e3).toBeCloseTo((((120 * 225) / 4) * 355) / 50 / 1e3, 3);
    const th = v('thread');
    expect(th.value! / 1e3).toBeCloseTo(113.04, 2);
    expect(th.indicative).toMatch(/approchée/);
  });
});

describe('statuts', () => {
  it('clamp sous gousset (gabarit) : incomplet, les données manquantes sont listées (nuances, classe, soudure, bras de levier)', () => {
    const r = computeJoint(tpl('JD-CLAMP-GOUSSET'));
    expect(r.status).toBe('unknown');
    const txt = r.missing.join(' | ');
    expect(txt).toMatch(/classe du boulon/);
    expect(txt).toMatch(/gorge a de la soudure/);
    expect(txt).toMatch(/nuance d’acier/);
    expect(txt).toMatch(/bras de levier/);
    expect(r.directions.uplift.capacity).toBeNull();
  });

  it('frottement sans serrage contrôlé : calculé mais indicatif ; sans μ : incomplet', () => {
    const d = designFromTemplate(tpl('JD-CLAMP-2-MACHOIRES'), 'JD-X');
    expect(computeJoint(d).status).toBe('unknown');
    d.components = d.components.map((c) => (c.kind === 'bolt' ? { ...c, d: 16, grade: '10.9' as const } : c.kind === 'contact' ? { ...c, mu: 0.2 } : c));
    const r = computeJoint(d);
    expect(r.status).toBe('indicative');
    expect(r.indicative.join(' ')).toMatch(/non garantie sans serrage contrôlé/);
    expect(r.directions.slideLong.capacity).toBeGreaterThan(0);
  });

  it('fonction anti-soulèvement sans chemin d’effort : « ne retient rien », jamais une capacité nulle silencieuse', () => {
    const d = designFromTemplate(tpl('JD-ORIGINE-PLAT'), 'JD-Y');
    d.paths = { ...d.paths, uplift: [] };
    const r = computeJoint(d);
    expect(r.noPath).toEqual(['uplift']);
    expect(r.status).toBe('unknown');
    expect(r.directions.uplift.noPath).toBe(true);
  });

  it('clé d’un accessoire à partir de son nom', () => {
    expect(jointKey('Clamp sous gousset (proto 2)')).toBe('JD-CLAMP-SOUS-GOUSSET-PROTO-2');
  });
});

describe('liaison personnalisée dans l’étude (S11b)', () => {
  const clamp = (): JointDesign => {
    const d = designFromTemplate(tpl('JD-CLAMP-GOUSSET'), 'JD-CLAMP-TEST', 'Clamp test');
    d.components = d.components.map((c) => {
      if (c.id === 'C') return { ...c, kind: 'plate', grade: 'S355', width: 80, hole: { d0: 22, e1: 40, e2: 40 } } as typeof c;
      if (c.id === 'G') return { ...c, kind: 'plate', t: 15, width: 100, grade: 'S235' } as typeof c;
      if (c.id === 'WG') return { ...c, kind: 'weld', a: 5, length: 200, grade: 'S235' } as typeof c;
      if (c.id === 'F') return { ...c, kind: 'plate', hole: { d0: 22, e1: 40, e2: 40 } } as typeof c;
      if (c.id === 'B') return { ...c, kind: 'bolt', grade: '8.8' } as typeof c;
      return c;
    });
    d.paths.uplift = d.paths.uplift!.map((s) => (s.mode === 'plate-bending' ? { ...s, lever: 40 } : s));
    d.stiffness = { slide: 5000, play: 2 };
    return d;
  };
  it('clamp renseigné : calculé, prototype → indicatif ; étude : remplace les plats, raideur sécante, verdict plafonné', async () => {
    const { withMods } = await import('../../src/structure/advisor/variant');
    const { runStudy, CALC_DEFAULTS } = await import('../../src/structure/studyRun');
    const { createInlineStudyRunner } = await import('../../src/structure/worker/study');
    const { sectionMap } = await import('../../src/structure/core/assemble');
    const { SEED } = await import('../../src/structure/library/seed');
    const { LOADS, vbx } = await import('./studyHelpers');
    const d = clamp();
    const r = computeJoint(d);
    expect(r.missing).toEqual([]);
    expect(r.directions.uplift.capacity).toBeGreaterThan(0);
    const base = { modules: [vbx('A', 0, 0), vbx('B', 0, 0, 1)], edgeItems: [], pointItems: [], library: SEED, sections: sectionMap(SEED), loads: { ...LOADS, weightMode: 'weighed' as const }, middleFeet: false, sls: true, options: { ...CALC_DEFAULTS }, blocking: [] };
    const v = withMods(base, { stackJoint: { design: d } });
    expect(v.warnings).toEqual([]);
    const row = v.inputs.joints!.rows.find((x) => x.connection === 'JD-CLAMP-TEST')!;
    expect(row.status).toBe('indicative');
    expect(row.modules).toEqual(['B']);
    expect(row.reasons.join(' ')).toMatch(/raideur sécante|jeu de montage/);
    expect(v.inputs.joints!.cap).toBe('limit');
    const B = v.inputs.modules.find((m) => m.id === 'B')!;
    expect(B.params.springs.cornerLinkShear).toBeLessThan(5000);
    const runner = createInlineStudyRunner();
    const run = await runStudy(v.inputs, runner);
    const stack = run.index.items.findIndex((it) => it.kind === 'stack');
    expect(run.summary.states[stack]!.records[0]?.title ?? run.summary.states[stack]!.governing).toBeTruthy();
    expect(run.verdict.verdict).not.toBe('ok');
    const vl = run.index.items.findIndex((it) => it.kind === 'vlink');
    expect(run.summary.states[vl]!.governing).not.toMatch(/plats/);
    // données manquantes : vérifications bloquées → incomplet
    const inc = withMods(base, { stackJoint: { design: designFromTemplate(tpl('JD-CLAMP-GOUSSET'), 'JD-INC') } });
    const run2 = await runStudy(inc.inputs, runner);
    expect(run2.verdict.verdict).toBe('incomplete');
  }, 120000);
});
