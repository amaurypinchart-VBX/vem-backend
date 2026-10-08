// S12.6 — analyse IA du modèle, côté module (fonctions pures) : données envoyées (inventaire, groupes de barres avec
// leurs 3 candidats, produits, listes permises, < 5 Mo), propositions (jamais au-dessus d'une réponse humaine,
// désaccord = alerte, confiance < 0,5 = reste inconnu avec les questions, poids de la catégorie d'abord), acceptation,
// « Annuler l'analyse IA » qui remet exactement les réponses d'avant, et une 2ᵉ analyse qui ne touche que le « proposé ».
import { describe, expect, it } from 'vitest';
import type { ModuleInfo, NodeInfo, SceneIndex } from '../../src/core/types';
import { makeLookup } from '../../src/core/subset';
import { recognize } from '../../src/structure/core/recognition';
import type { Assignments, Recognition } from '../../src/structure/core/recognition';
import type { ModelAnalysisOut, StoredAnalysis } from '../../src/structure/core/ai';
import { acceptProposal, analysisToProposals, applyFrameProposal, barGroups, estimateAnalysisCost, modelAnalysisPayload, snapshotBefore, undoAnalysis } from '../../src/structure/core/ai';
import type { RawMember } from '../../src/structure/core/frameExtract';
import { extractFrame } from '../../src/structure/core/frameExtract';
import type { FrameBar, LibraryEntry } from '../../src/structure/core/library';
import type { Pt, V3 } from '../../src/structure/core/sectionDetect';
import { parametricFrame } from '../../src/structure/core/templates/frameModule';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';
import { extrude } from './sectionDetect.test';

let seq = 0;
const node = (p: Partial<NodeInfo>): NodeInfo =>
  ({ id: p.id ?? `n${++seq}`, name: 'Groupe', parentId: null, kind: 'group', role: 'item', category: null, categorySource: null, moduleId: null, assignment: null, level: 0, bboxMm: [0, 0, 0, 100, 100, 100], triangles: 12, ...p }) as NodeInfo;

/** n box 5900 (définition `def`) avec un mur, une vitre et un objet sans nom chacune ; `extra` produits en plus. */
function model(n: number, def: string, extra = 0): SceneIndex {
  const nodes: NodeInfo[] = [];
  const modules: ModuleInfo[] = [];
  for (let k = 0; k < n; k++) {
    const id = `VBX-${String(k + 1).padStart(2, '0')}`;
    const mn = node({ id: `m${k}`, name: id, definition: def, role: 'module', moduleId: id });
    nodes.push(
      mn,
      node({ name: 'Mur léger 2500', definition: 'Mur léger 2500', category: 'MUR-LEGER', parentId: mn.id, moduleId: id, assignment: 'hierarchy', triangles: 24 }),
      node({ name: `Vitre ${k + 1}`, category: 'VITRE', parentId: mn.id, moduleId: id, assignment: 'hierarchy', bboxMm: [0, 0, 0, 2400, 2700, 10] }),
      node({ name: 'Groupe', parentId: mn.id, moduleId: id, assignment: 'hierarchy', bboxMm: [0, 0, 0, 800, 400, 600], triangles: 300 }),
    );
    modules.push({ id, nodeId: mn.id, name: id, level: k % 2, planDimsMm: [5900, 2500], heightMm: 3080, expected: { label: 'Viewbox 5900', long: 5900, short: 2500, source: 'standard' }, dimsOk: true, bboxMm: [0, 0, 0, 5900, 3080, 2500], itemIds: [], detectedBy: 'name' } as ModuleInfo);
  }
  for (let k = 0; k < extra; k++) nodes.push(node({ name: `Décor ${k}`, definition: `Décor spécial ${k} avec un nom assez long pour peser`, bboxMm: [0, 0, 0, 100 + k, 200, 300], triangles: 50 + k }));
  return { schema: 'vem-plans-index/1', engineVersion: 't', createdAt: '', source: {} as SceneIndex['source'], stats: {} as SceneIndex['stats'], nodes, modules, levels: [], commonIds: [], contextIds: [], warnings: [] };
}
const rec = (index: SceneIndex, assignments: Assignments = {}, ai?: Parameters<typeof recognize>[0]['ai'], library: LibraryEntry[] = SEED) =>
  recognize({ index, look: makeLookup(index), library, assignments, accessoryCategories: new Set(), ai });
const modulesOf = (index: SceneIndex) => index.modules.map((m) => ({ id: m.id, typeKey: `SIZE:5900x2500`, level: m.level, dims: { long: 5900, short: 2500, height: 3080 } }));

// box synthétique dessinée en tubes (relevé S12.5)
const P = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!.params!;
const base = { sections: P.sections, springs: P.springs, plywood: P.plywood };
const rect = (w: number, h: number): Pt[] => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];
const tube = (w: number, h: number, t: number): Pt[][] => [rect(w, h), [...rect(w - 2 * t, h - 2 * t)].reverse()];
function draw(bars: FrameBar[]): RawMember[] {
  return bars.map((b) => {
    const d = [b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]] as V3;
    const L = Math.hypot(...d);
    const dir = d.map((x) => x / L) as V3;
    const z: V3 = Math.abs(dir[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    const y: V3 = [z[1] * dir[2] - z[2] * dir[1], z[2] * dir[0] - z[0] * dir[2], z[0] * dir[1] - z[1] * dir[0]];
    const cut = b.role === 'column' ? 0 : 30;
    const a: V3 = [b.a[0] + dir[0] * cut, b.a[1] + dir[1] * cut, b.a[2] + dir[2] * cut];
    return { id: b.id, definition: b.role, triangles: extrude(b.role === 'column' ? tube(100, 100, 5) : b.role.startsWith('rim') ? tube(160, 80, 4) : tube(100, 50, 3), a, dir, y, z, L - 2 * cut) };
  });
}
const spec = parametricFrame({
  long: 5900,
  short: 2500,
  inset: 40,
  roofZ: 2800,
  topZ: 3100,
  sections: { rimFloorLong: 'X', rimFloorShort: 'X', rimRoofLong: 'X', rimRoofShort: 'X', transverseFloor: 'X', transverseRoof: 'X', column: 'X' },
  transversesFloor: 5,
  transversesRoof: 5,
  stringersFloor: [],
  stringersRoof: [],
  intermediateColumns: 0,
  middleFeet: false,
  columnModel: { model: 'semi' },
  secondaryModel: 'pinned',
  sideModel: 'bolts',
  floor: null,
  roof: null,
  base,
});
const extraction = extractFrame(draw(spec.frame.bars), { long: 5900, short: 2500, height: 2900, base, date: '08.10.2026' });

function analysis(r: Recognition, out: Partial<ModelAnalysisOut>, id = 'A1', assignments: Assignments = {}): StoredAnalysis {
  const full: ModelAnalysisOut = {
    structure: { verdict: 'unsure', confidence: 0.3, reasons: [], barGroups: [], joints: { column: 'unknown', stack: 'unknown', side: 'unknown', evidence: '' }, deck: { span: 'unknown', material: null } },
    products: [],
    groups: [],
    alerts: [],
    questions: [],
    ...out,
  };
  const keys = [...full.products.map((p) => p.typeKey), ...r.types.filter((t) => t.kind === 'module').map((t) => t.key)];
  return { id, at: '', model: 'test', costUsd: null, out: full, removed: [], moduleKey: 'SIZE:5900x2500', groups: barGroups(extraction), refused: [], before: snapshotBefore(assignments, keys) };
}

describe('S12.6 — analyse IA du modèle', () => {
  it('données envoyées : inventaire, groupes de barres (3 candidats au plus), produits, listes permises ; < 5 Mo', () => {
    const idx = model(40, 'Viewbox Light', 300);
    const r = rec(idx);
    const p = modelAnalysisPayload({ recognition: r, modules: modulesOf(idx), library: SEED, drawn: { moduleKey: 'SIZE:5900x2500', extraction } });
    expect(p.modules).toHaveLength(1);
    expect(p.modules[0]).toMatchObject({ count: 40, levels: [0, 1], stacked: 20 });
    expect(p.products.length).toBeGreaterThan(300);
    const g = p.structure!.groups;
    expect(g.length).toBeGreaterThanOrEqual(4);
    expect(g.reduce((s, x) => s + x.count, 0)).toBe(extraction.bars.filter((b) => b.role !== 'none').length);
    for (const x of g) {
      expect(x.candidates.length).toBeLessThanOrEqual(3);
      expect(p.options.barGroups[x.group].length).toBeLessThanOrEqual(4);
      for (const k of p.options.barGroups[x.group]) expect(p.options.sections.some((s) => s.key === k)).toBe(true);
    }
    expect(p.options.frameRoles).toContain('transverse-floor');
    expect(p.options.moduleTypes.some((m) => m.key === 'VIEWBOX-5900-EU')).toBe(true);
    expect(JSON.stringify(p).length).toBeLessThan(5e6);
    const c = estimateAnalysisCost(p, 6);
    expect(c.costUsd).toBeGreaterThan(0);
  });

  it('propositions : réponse humaine jamais remplacée (alerte), inconnu → proposé, confiance < 0,5 → reste inconnu avec ses questions', () => {
    const idx = model(2, 'Viewbox M16');
    const wallKey = rec(idx).types.find((t) => t.category === 'MUR-LEGER')!.key;
    const human: Assignments = { [wallKey]: { assignment: { role: 'load', nature: 'wall', weight: { value: 51, unit: 'kg/m' } }, scope: 'model', at: 't' } };
    const r0 = rec(idx, human);
    const unk = r0.types.find((t) => t.status === 'unknown')!;
    const glass = r0.types.find((t) => t.category === 'VITRE')!;
    const a = analysis(r0, {
      products: [
        { typeKey: wallKey, role: 'ignored', nature: 'decor', confidence: 0.9, questions: [], rationale: 'décor' },
        { typeKey: unk.key, role: 'load', nature: 'other', weight: { value: 30, unit: 'kg' }, confidence: 0.8, questions: [], rationale: 'caisson' },
        { typeKey: glass.key, role: 'load', nature: 'glazing', windClosed: true, weight: { value: 999, unit: 'kg/m' }, confidence: 0.3, questions: ['Quel vitrage ?'], rationale: 'vitre' },
      ],
    }, 'A1', human);
    const pr = analysisToProposals(a, r0, SEED);
    expect(pr.recognition[wallKey]).toBeUndefined();
    expect(pr.alerts.some((x) => x.startsWith('l’IA pense que'))).toBe(true);
    expect(pr.products.find((p) => p.typeKey === wallKey)!.human).toBe(true);
    // poids : celui de la catégorie (vitrage 1,75 kN/m) avant l'estimation IA
    expect(pr.recognition[glass.key].assignment.weight).toEqual(glass.assignment!.weight);
    expect(pr.recognition[unk.key].assignment.note).toMatch(/estimation IA/);
    const r1 = rec(idx, human, pr.recognition);
    expect(r1.types.find((t) => t.key === wallKey)).toMatchObject({ status: 'known', source: 'local' });
    expect(r1.types.find((t) => t.key === unk.key)).toMatchObject({ status: 'suggested', source: 'ai' });
    const g1 = r1.types.find((t) => t.key === glass.key)!;
    expect(g1).toMatchObject({ status: 'unknown', source: 'ai' });
    expect(g1.ai!.questions).toEqual(['Quel vitrage ?']);
    expect(r1.blocking).toBe(1);
    // refusée : la proposition disparaît, le type revient à son état d'avant
    const r2 = rec(idx, human, analysisToProposals({ ...a, refused: [unk.key] }, r0, SEED).recognition);
    expect(r2.types.find((t) => t.key === unk.key)).toMatchObject({ status: 'unknown', source: 'none' });
  });

  it('accepter puis « Annuler l’analyse IA » remet exactement les réponses d’avant ; une 2ᵉ analyse ne touche que le proposé', () => {
    const idx = model(2, 'Viewbox M16');
    const r0 = rec(idx);
    const unk = r0.types.find((t) => t.status === 'unknown')!;
    const glass = r0.types.find((t) => t.category === 'VITRE')!;
    const before: Assignments = { other: { assignment: { role: 'ignored', nature: 'decor' }, scope: 'project', at: 't0', by: 'u1' } };
    const a = analysis(r0, { products: [{ typeKey: unk.key, role: 'ignored', nature: 'decor', confidence: 0.9, questions: [], rationale: 'décor' }] }, 'A1', before);
    const pr = analysisToProposals(a, r0, SEED);
    let as = acceptProposal(before, unk.key, pr.recognition[unk.key].assignment, a.id, 'u2');
    expect(as[unk.key].ai).toBe('A1');
    // une réponse humaine n'est jamais écrasée par une acceptation
    expect(acceptProposal(as, 'other', { role: 'load', nature: 'other' }, a.id)).toBe(as);
    expect(undoAnalysis(as, a)).toEqual(before);
    // 2ᵉ analyse : la réponse acceptée de la 1ʳᵉ est une réponse du modèle, la 2ᵉ ne la remplace pas
    const rA = rec(idx, as);
    const b = analysis(rA, {
      products: [
        { typeKey: unk.key, role: 'load', nature: 'other', confidence: 0.9, questions: [], rationale: 'autre' },
        { typeKey: glass.key, role: 'load', nature: 'glazing', confidence: 0.9, questions: [], rationale: 'vitre' },
      ],
    }, 'B2', as);
    const prB = analysisToProposals(b, rA, SEED);
    expect(prB.recognition[unk.key]).toBeUndefined();
    expect(prB.recognition[glass.key]).toBeDefined();
    as = acceptProposal(as, glass.key, prB.recognition[glass.key].assignment, b.id);
    const undoneB = undoAnalysis(as, b);
    expect(undoneB[unk.key].ai).toBe('A1');
    expect(undoneB[glass.key]).toBeUndefined();
    expect(undoAnalysis(undoneB, a)).toEqual(before);
  });

  it('structure : type de la bibliothèque proposé pour le module, rôles / sections des groupes (section hors candidats ignorée)', () => {
    const idx = model(2, 'Box 6 m');
    const r0 = rec(idx);
    const groups = barGroups(extraction);
    const tr = groups.find((g) => g.roleGuess === 'transverse-floor')!;
    const a = analysis(r0, {
      structure: {
        verdict: 'viewbox',
        moduleType: 'VIEWBOX-5900-EU',
        confidence: 0.7,
        reasons: ['même grille'],
        barGroups: [
          { group: tr.group, role: 'stringer-floor', section: 'CAT-INVENTEE', roll: 'edge', confidence: 0.6, note: '' },
          { group: groups[0].group, role: 'rim-floor', section: groups[0].candidates[0]?.key ?? null, roll: null, confidence: 0.9, note: '' },
        ],
        joints: { column: 'semi', stack: 'clamp', side: 'custom', evidence: 'pas de plat d’empilement' },
        deck: { span: 'u', material: null },
      },
    });
    const pr = analysisToProposals(a, r0, SEED);
    expect(pr.frame!.moduleTemplate).toBe('VIEWBOX-5900-EU');
    expect(pr.recognition['SIZE:5900x2500'].assignment.moduleTemplate).toBe('VIEWBOX-5900-EU');
    const gTr = pr.frame!.groups.find((g) => g.group === tr.group)!;
    expect(gTr.role).toBe('stringer-floor');
    expect(gTr.section).toBeNull();
    expect(pr.frame!.joints.stack).toBe('clamp');
    const bars = applyFrameProposal(extraction.params!.frame.bars, pr.frame!);
    expect(bars.filter((b) => b.role === 'stringer-floor')).toHaveLength(tr.count);
    // refus du verdict : plus de proposition de type pour le module
    expect(analysisToProposals({ ...a, refused: ['structure'] }, r0, SEED).recognition['SIZE:5900x2500']).toBeUndefined();
  });
});
