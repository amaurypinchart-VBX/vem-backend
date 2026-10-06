// Angles de Viewbox du dessus hors des angles de celles du dessous : posés sur une rive (empilement décalé), sur une
// poutre / un poteau dessiné dans le modèle, sur un appui ajouté par l'étude (poteau jusqu'au sol, poutre de reprise) ;
// sinon dans le vide, avec la proposition de l'outil.
import { describe, expect, it } from 'vitest';
import type { ModelMember, PlacedModule } from '../../src/structure/core/assemble';
import { sectionMap } from '../../src/structure/core/assemble';
import type { StudyInputs } from '../../src/structure/studyRun';
import { assembleStudy, CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { SEED } from '../../src/structure/library/seed';
import { LOADS, vbx } from './studyHelpers';
import { describeMods, mergeMods } from '../../src/structure/core/mods';
import { withMods } from '../../src/structure/advisor/variant';
import { addedSupportEtas, sizeAddedSupports } from '../../src/structure/advisor/supports';

const inputs = (modules: PlacedModule[], extra: Partial<StudyInputs> = {}): StudyInputs => ({
  modules,
  edgeItems: [],
  pointItems: [],
  library: SEED,
  sections: sectionMap(SEED),
  loads: LOADS,
  middleFeet: false,
  sls: true,
  options: { ...CALC_DEFAULTS },
  blocking: [],
  ...extra,
});

/** Viewbox tournée de 90° (grand côté selon −Z monde), coin (x, z) en mm. */
function turned(id: string, x: number, z: number, level: number): PlacedModule {
  const m = vbx(id, 0, 0, level);
  return { ...m, origin: [x, level * 3080, z], u: [0, 0, -1], v: [-1, 0, 0] };
}

describe('appuis des Viewbox du dessus', () => {
  it('empilement décalé d’une demi-Viewbox : angles posés sur les rives de toiture, calcul complet', async () => {
    // deux rangées (une seule rangée de 2,5 m sur deux niveaux bascule sous le vent hors service)
    const inp = inputs([vbx('A', 0, 0), vbx('B', 5.9, 0), vbx('A2', 0, 2.5), vbx('B2', 5.9, 2.5), vbx('C', 2.95, 0, 1), vbx('C2', 2.95, 2.5, 1)]);
    const s = assembleStudy(inp);
    expect(s.errors).toEqual([]);
    expect(s.unsupported).toEqual([]);
    const links = s.meta.filter((m) => m.family === 'corner-link');
    expect(links).toHaveLength(8);
    expect(links.every((m) => /sur la rive/.test(m.label))).toBe(true);
    expect(s.warnings.some((w) => /C angle 1 sur la rive de toiture de A/.test(w))).toBe(true);
    const run = await runStudy(inp, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    expect(run.index.items.some((i) => i.kind === 'vlink')).toBe(true);
  });

  it('Viewbox en porte-à-faux : angles dans le vide → poteaux proposés, puis calculés et calés', async () => {
    const mods0 = inputs([vbx('A', 0, 0), vbx('A2', 0, 2.5), vbx('E', 3, 0, 1), vbx('E2', 3, 2.5, 1)]);
    const s0 = assembleStudy(mods0);
    expect(s0.unsupported.map((u) => [u.module, u.corner, u.proposal.kind])).toEqual([
      ['E', 1, 'post'],
      ['E', 2, 'post'],
      ['E2', 1, 'post'],
      ['E2', 2, 'post'],
    ]);
    expect(s0.unsupported[0].height).toBeCloseTo(3080, 0);
    expect(s0.unsupported[0].text).toMatch(/ajouter un poteau d’appui/);
    expect(s0.errors.some((e) => /E : angle 2 posé dans le vide/.test(e))).toBe(true);
    // la proposition acceptée (modification de l'étude) → appuis au sol de type « R »
    const mods = { supports: s0.unsupported.map((u) => u.proposal) };
    expect(describeMods(mods)[0]).toMatch(/poteau d’appui QHP100x5 sous E angle 2, jusqu’au sol/);
    expect(mergeMods(mods, { supports: [{ ...mods.supports[0], section: 'QHP120x5' }] }).supports).toHaveLength(4);
    const { inputs: inp } = withMods(mods0, mods);
    const s = assembleStudy(inp);
    expect(s.errors).toEqual([]);
    expect(s.meta.filter((m) => m.family === 'support-post')).toHaveLength(4);
    expect(s.supportMeta.filter((m) => m.kind === 'post')).toHaveLength(4);
    const run = await runStudy(inp, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    expect(run.index.items.some((i) => i.family.startsWith('Poteau d’appui ajouté'))).toBe(true);
    const posts = run.ground.groups.filter((g) => g.post);
    // deux poteaux voisins (angles de E et E2 à 1 cm) : un seul groupe d'appui
    expect(posts).toHaveLength(3);
    expect(posts.every((g) => g.id.startsWith('R') && g.stair)).toBe(true);
    const R = run.ground.reactions.filter((r) => r.group.post);
    expect(Math.min(...R.map((r) => r.Rk))).toBeGreaterThan(5e3);
  });

  it('Viewbox tournée sur la toiture d’autres Viewbox : poutres de reprise proposées puis calculées', async () => {
    const base = inputs([vbx('A', 0, 0), vbx('G', 0, 2.5), vbx('K', 0, 5), turned('H', 3000, -500, 1)]);
    const s0 = assembleStudy(base);
    expect(s0.unsupported).toHaveLength(4);
    expect(s0.unsupported.every((u) => u.proposal.kind === 'transfer' && u.over)).toBe(true);
    expect(s0.unsupported[0].text).toMatch(/poutre de reprise/);
    const { inputs: inp } = withMods(base, { supports: s0.unsupported.map((u) => u.proposal) });
    const s = assembleStudy(inp);
    expect(s.errors).toEqual([]);
    expect(s.meta.filter((m) => m.family === 'transfer-beam')).toHaveLength(8);
    const run = await runStudy(inp, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    expect(run.index.items.some((i) => /Poutre de reprise ajoutée/.test(i.family))).toBe(true);
  });

  it('dimensionnement des appuis proposés : profil renforcé jusqu’à η ≤ 1', async () => {
    const base = inputs([vbx('A', 0, 0), vbx('G', 0, 2.5), vbx('K', 0, 5), turned('H', 3000, -500, 1)]);
    const r = await sizeAddedSupports(base, {}, createInlineStudyRunner());
    expect(r.ok).toBe(true);
    expect(r.supports).toHaveLength(4);
    // UNP 220 de la rive (η ≈ 1,05) → profil UPN plus fort du catalogue
    expect(r.supports.some((a) => a.section?.startsWith('CAT-UPN'))).toBe(true);
    expect(r.steps.join(' ')).toMatch(/UNP 220 η 1,0\d → UPN 240/);
    const etas = addedSupportEtas(r.run!);
    expect(Math.max(...[...etas.values()].map((x) => x.eta))).toBeLessThanOrEqual(1);
  }, 120000);

  it('Viewbox posée sur deux poutres dessinées dans le modèle (pont au-dessus d’un passage)', async () => {
    const U = { ...vbx('U', 0, 3, 1) };
    U.origin = [U.origin[0], 3300, U.origin[2]];
    const beam = (id: string, x: number): ModelMember => ({ id, label: 'HEA 200', nature: 'beam', section: 'UNP220', a: [x, 3190, -1000], b: [x, 3190, -7000], depth: 220 });
    const inp = inputs([vbx('A', 0, 0), vbx('B', 0, 6), U], { members: [beam('POU-1', 5), beam('POU-2', 5895)] });
    const s = assembleStudy(inp);
    expect(s.errors).toEqual([]);
    expect(s.unsupported).toEqual([]);
    expect(s.meta.filter((m) => m.family === 'corner-link').every((m) => /sur la poutre/.test(m.label))).toBe(true);
    // chaque poutre : 3 barres (bout → angle → angle → bout), reliée aux rives de toiture de A et B
    expect(s.meta.filter((m) => m.family === 'model-beam')).toHaveLength(6);
    const run = await runStudy(inp, createInlineStudyRunner());
    expect(run.summary.errors).toEqual([]);
    const spans = run.index.items.filter((i) => i.kind === 'member' && i.module === 'POU-1');
    expect(spans.length).toBeGreaterThanOrEqual(1);
    expect(spans[0].label).toMatch(/^POU-1 · poutre du modèle/);
  });

  it('extrémité de poutre reliée à rien : erreur explicite', () => {
    const inp = inputs([vbx('A', 0, 0)], { members: [{ id: 'POU-1', label: 'IPE', nature: 'beam', section: 'UNP220', a: [8000, 2000, -1000], b: [12000, 2000, -1000], depth: 220 }] });
    const s = assembleStudy(inp);
    expect(s.errors.filter((e) => /POU-1 « IPE » : extrémité/.test(e))).toHaveLength(2);
  });
});
