// S12.2 — gabarit générique d'un type de module (`frameModule.ts`) : la Viewbox décrite en barres redonne exactement le
// gabarit Viewbox (modèle et calcul complet), box à traverses seules articulées (M = q·L²/8), angles articulés sans
// diagonale = mécanisme, avec diagonales en traction seule = stable, équilibre et invariance par rotation.
import { describe, expect, it } from 'vitest';
import type { PlacedModule } from '../../src/structure/core/assemble';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import { analyze } from '../../src/structure/core/fem/analysis';
import type { LoadSet, Vec3 } from '../../src/structure/core/fem/types';
import type { FrameBar, ViewboxTemplateParams } from '../../src/structure/core/library';
import { buildLoadCases } from '../../src/structure/core/loads';
import type { ParametricSpec } from '../../src/structure/core/templates/frameModule';
import { frameTemplate, moduleTemplate, parametricFrame, viewboxPresetFrame } from '../../src/structure/core/templates/frameModule';
import { viewboxTemplate } from '../../src/structure/core/templates/viewboxEU';
import type { ViewboxTemplate } from '../../src/structure/core/templates/viewboxEU';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';
import type { StudyInputs } from '../../src/structure/studyRun';
import { CALC_DEFAULTS, runStudy } from '../../src/structure/studyRun';
import { createInlineStudyRunner } from '../../src/structure/worker/study';
import { LOADS } from './studyHelpers';

const entry = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
const P = entry.params!;
const sections = sectionMap(SEED);
const opt = { sections, jacks: false, middleFeet: false, upliftReleases: 'all' as const, calibration: false };

/** Module placé à (du, dv) m dans un plan tourné de θ autour de la verticale, niveau `level` (pas `step` mm). */
function place(id: string, params: ViewboxTemplateParams, du: number, dv: number, level = 0, theta = 0, step = 3080): PlacedModule {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const u: Vec3 = [c, 0, s];
  const v: Vec3 = [-s, 0, c];
  const origin: Vec3 = [u[0] * du * 1000 + v[0] * dv * 1000, level * step, u[2] * du * 1000 + v[2] * dv * 1000];
  return { id, level, origin, u, v, params, templateKey: params.frame ? 'TYPE-TEST' : entry.key };
}

/** Comparaison triée des modèles de deux gabarits (joint 'corner' d'un poteau semi-rigide = défaut Viewbox). */
function canonical(t: ViewboxTemplate) {
  const nodes = t.nodes.map((n) => `${n.key}|${n.u.toFixed(6)}|${n.v.toFixed(6)}|${n.z.toFixed(6)}`);
  const sorted = (o: Record<string, unknown>) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  const members = t.members.map((m) => JSON.stringify(sorted({ ...m, joint: m.family === 'column' ? (m.joint ?? 'corner') : m.joint })));
  return { nodes, members, faces: t.faces, panels: t.panels, cornerFloor: t.cornerFloor, cornerRoof: t.cornerRoof, footNodes: t.footNodes, middleFeet: t.middleFeet, middleRim: t.middleRim };
}

const base: ParametricSpec['base'] = { sections: P.sections, springs: P.springs, plywood: P.plywood };
function spec(over: Partial<ParametricSpec> = {}): ParametricSpec {
  return {
    long: 5900,
    short: 2500,
    inset: 5,
    roofZ: 2790,
    topZ: 3080,
    sections: { rimFloorLong: 'UNP220', rimFloorShort: 'UNP220', rimRoofLong: 'UNP220', rimRoofShort: 'UNP220', transverseFloor: 'RHP120x60x4', transverseRoof: 'RHP120x60x4', column: 'QHP100x5' },
    transversesFloor: 5,
    transversesRoof: 5,
    stringersFloor: [],
    stringersRoof: [],
    intermediateColumns: 0,
    middleFeet: false,
    columnModel: { model: 'rigid' },
    secondaryModel: 'pinned',
    sideModel: 'bolts',
    floor: { material: 'CP-F20/15', thickness: 18, layers: 2, span: 'u' },
    roof: null,
    base,
    ...over,
  };
}

describe('S12.2 — gabarit générique (frame)', () => {
  it('Viewbox 5900 en barres : même modèle que le gabarit Viewbox (ordre compris), avec et sans jonctions en T', () => {
    const fp = { ...P, frame: viewboxPresetFrame(P) };
    for (const extras of [{}, { v0: [3000], u1: [1000, 1500] }]) {
      const a = viewboxTemplate(P, extras);
      const b = frameTemplate(fp, extras);
      expect(canonical(b)).toEqual(canonical(a));
      // même ordre de création : même numérotation dans le modèle de calcul
      expect(b.nodes.map((n) => n.key)).toEqual(a.nodes.map((n) => n.key));
      expect(b.members.map((m) => `${m.i}>${m.j}`)).toEqual(a.members.map((m) => `${m.i}>${m.j}`));
    }
    expect(moduleTemplate(P)).toEqual(viewboxTemplate(P));
  });

  it('Viewbox 5900 en barres : calcul complet identique (η, réactions, calage des appuis) sur 3 Viewbox dont une empilée', async () => {
    const make = (params: ViewboxTemplateParams): StudyInputs => ({
      modules: [place('VBX-01', params, 0, 0), place('VBX-02', params, 0, 2.5), place('VBX-03', params, 0, 0, 1)].map((m) => ({ ...m, templateKey: entry.key })),
      edgeItems: [{ module: 'VBX-01', side: 'v0', from: 0, to: 5890, level: 'floor', q: 1.75, loadCase: 'G3', label: 'Vitrage lourd' }],
      pointItems: [{ module: 'VBX-03', u: 2950, v: 1250, level: 'roof', F: 400, loadCase: 'G7', label: 'Logo' }],
      library: SEED,
      sections,
      loads: LOADS,
      middleFeet: false,
      sls: true,
      options: { ...CALC_DEFAULTS, friction: 0.6 },
      blocking: [],
    });
    const runner = createInlineStudyRunner();
    const a = await runStudy(make(P), runner);
    const b = await runStudy(make({ ...P, frame: viewboxPresetFrame(P) }), runner);
    expect(b.index.items.map((i) => i.id)).toEqual(a.index.items.map((i) => i.id));
    a.summary.states.forEach((s, k) => {
      const t = b.summary.states[k];
      expect(!!t).toBe(!!s);
      if (s && t) expect(Math.abs(t.eta - s.eta)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(s.eta)));
    });
    for (const [combo, rs] of Object.entries(a.summary.reactions))
      rs.forEach((r, k) => r.R.forEach((x, d) => expect(Math.abs(b.summary.reactions[combo][k].R[d] - x)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(x)))));
    expect(b.verdict.verdict).toBe(a.verdict.verdict);
  }, 300_000);

  it('box à traverses seules articulées sur les rives, plancher portant selon u : M = q·L²/8 et V = q·L/2 à 0,5 %', () => {
    const params = parametricFrame(spec());
    const t = moduleTemplate(params);
    expect(t.panels.filter((p) => p.level === 'floor')).toHaveLength(6);
    expect(t.panels.every((p) => p.level !== 'floor' || p.span === 'u')).toBe(true);
    const m = assembleStructure([place('B', params, 0, 0)], opt);
    expect(m.errors).toEqual([]);
    const p = 2e-3; // 2 kN/m²
    const loads = buildLoadCases(m, { ...LOADS, ceiling: 0, floorFinish: p, moduleWeight: 0 });
    const g4 = loads.cases.find((c) => c.id === 'G4')!;
    const [r] = analyze(m.fem, [{ id: 'G4', nodal: g4.nodal, member: g4.member } as LoadSet], { secondOrder: false });
    const s = (params.x1 - params.x0) / 6;
    const L = params.y1 - params.y0;
    const q = p * s;
    const tr = m.meta.map((x, k) => ({ x, k })).filter(({ x }) => x.family === 'secondary-floor');
    expect(new Set(tr.map(({ x }) => x.line)).size).toBe(5);
    for (const { k } of tr) {
      const st = r.members[k].stations;
      const M = Math.max(...st.map((x) => x.My));
      expect(Math.abs(M - (q * L * L) / 8) / ((q * L * L) / 8)).toBeLessThan(0.005);
      const V = Math.abs(st[0].Vz);
      expect(Math.abs(V - (q * L) / 2) / ((q * L) / 2)).toBeLessThan(0.005);
    }
    // réactions : charge totale
    const total = p * (params.x1 - params.x0) * L;
    expect(r.reactions.reduce((a, x) => a + x.R[1], 0)).toBeCloseTo(total, 3);
  });

  it('angles articulés sans diagonale : mécanisme ; avec diagonales en traction seule sur les 4 faces : stable', () => {
    const pinned = parametricFrame(spec({ columnModel: { model: 'pinned' }, secondaryModel: 'rigid' }));
    const pushTop = (m: ReturnType<typeof assembleStructure>): LoadSet => ({
      id: 'H',
      nodal: m.fem.nodes.map((n, k) => ({ n, k })).filter(({ n }) => Math.abs(n.y - 2790) < 1).map(({ k }) => ({ node: k, f: [100, -1000, 0, 0, 0, 0] })),
      member: [],
    });
    const bare = assembleStructure([place('B', pinned, 0, 0)], opt);
    expect(() => analyze(bare.fem, [pushTop(bare)], { secondOrder: true })).toThrow(/m[ée]canisme|instab|10 m/i);
    const { x0, x1, y0, y1, roofZ } = pinned;
    const braces: FrameBar[] = [];
    const add = (id: string, a: [number, number, number], b: [number, number, number]) => braces.push({ id, role: 'brace', a, b, section: 'FLA60/6', tensionOnly: true });
    for (const [side, A, B] of [
      ['v0', [x0, y0], [x1, y0]],
      ['v1', [x0, y1], [x1, y1]],
      ['u0', [x0, y0], [x0, y1]],
      ['u1', [x1, y0], [x1, y1]],
    ] as const) {
      add(`D-${side}-1`, [A[0], A[1], 0], [B[0], B[1], roofZ]);
      add(`D-${side}-2`, [B[0], B[1], 0], [A[0], A[1], roofZ]);
    }
    const braced = { ...pinned, frame: { ...pinned.frame, bars: [...pinned.frame.bars, ...braces] } };
    const m = assembleStructure([place('B', braced, 0, 0)], opt);
    expect(m.meta.filter((x) => x.family === 'frame-brace')).toHaveLength(8);
    expect(m.fem.members.filter((b) => b.nonlinear === 'tensionOnly')).toHaveLength(8);
    const [r] = analyze(m.fem, [pushTop(m)], { secondOrder: true });
    expect(r.reactions.reduce((a, x) => a + x.R[0], 0)).toBeCloseTo(-100 * pushTop(m).nodal.length, 3);
    // poteaux articulés : pas de contrôle « angle poteau / cadre »
    expect(m.meta.filter((x) => x.family === 'column').every((x) => x.joint === 'none')).toBe(true);
  });

  it('3 box du nouveau type (2 côte à côte + 1 empilée) : réactions = charges, même résultat plan tourné', () => {
    const params = parametricFrame(spec({ columnModel: { model: 'rigid' }, secondaryModel: 'rigid', stringersFloor: [1250], stringersRoof: [1250] }));
    const results = [0, 0.64].map((theta) => {
      const m = assembleStructure([place('A', params, 0, 0, 0, theta), place('B', params, 0, 2.5, 0, theta), place('U', params, 0, 0, 1, theta)], opt);
      expect(m.errors).toEqual([]);
      expect(m.meta.filter((x) => x.family === 'corner-link')).toHaveLength(4);
      expect(m.meta.filter((x) => x.family === 'bolt').length).toBeGreaterThan(0);
      const u: Vec3 = [Math.cos(theta), 0, Math.sin(theta)];
      const roof = m.fem.nodes.map((n, k) => ({ n, k })).filter(({ n }) => Math.abs(n.y - 2790) < 1 || Math.abs(n.y - (3080 + 2790)) < 1);
      const set: LoadSet = { id: 'G+H', nodal: roof.map(({ k }) => ({ node: k, f: [150 * u[0], -800, 150 * u[2], 0, 0, 0] })), member: [] };
      const [r] = analyze(m.fem, [set], { secondOrder: true });
      return { r, total: roof.length * 800 };
    });
    for (const { r, total } of results) expect(r.reactions.reduce((s, x) => s + x.R[1], 0)).toBeCloseTo(total, 2);
    const [a, b] = results.map(({ r }) => r.reactions.map((x) => x.R[1]));
    a.forEach((ra, k) => expect(b[k]).toBeCloseTo(ra, 3));
  });
});
