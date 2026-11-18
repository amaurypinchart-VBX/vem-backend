// Extension SketchUp 1.5.0 : « C'est une Viewbox ». Un objet qui contient plusieurs Viewbox (ex. un escalier intérieur fait
// de deux Viewbox superposées) est un ensemble : chacune est un module calculé comme une Viewbox, avec la désignation de
// l'ensemble ; l'ensemble lui-même n'est jamais classé (sinon « escalier… » classait les pièces des Viewbox par héritage).
// Aussi : murs Nidaplast = murs légers, catégorie Escalier intérieur (charge, pas le gabarit d'escalier extérieur).
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { ingest } from '../src/ingest/pipeline';
import { inlineRunner } from '../src/ingest/cleanup';
import { DEFAULT_RULES, categoryFromName, compileRules, mergeRules } from '../src/core/classification';
import { makeLookup } from '../src/core/subset';
import { missingData, proposeFor, recognize } from '../src/structure/core/recognition';
import { mergeLibrary } from '../src/structure/core/libraryStore';
import { SEED } from '../src/structure/library/seed';
import { isBoxPart } from '../src/loading/topology/products';
import { makeSketchupDae } from './fixtures/sketchupDae';

const rules = compileRules(DEFAULT_RULES);

describe('catégories 1.5.0', () => {
  it('murs Nidaplast = murs légers, escalier intérieur ≠ escalier extérieur, VIEWBOX jamais déduite du nom', () => {
    expect(categoryFromName('7-636-008 NIDAPLAST WALL WHITE  WHITE 1130x2520 COMPLETE - VIEWBOX M16', rules)).toBe('MUR-LEGER');
    expect(categoryFromName('NIDAPLAST WALL WHITE / WHITE 1130x2520 With AIRCO HOLE - VIEWBOX M16', rules)).toBe('MUR-LEGER');
    expect(categoryFromName('Escalier intérieur', rules)).toBe('ESCALIER-INTERIEUR');
    expect(categoryFromName('Interior staircase', rules)).toBe('ESCALIER-INTERIEUR');
    expect(categoryFromName('Escalier extérieur', rules)).toBe('ESCALIER');
    expect(categoryFromName('Stair intermediate post', rules)).toBe('ESCALIER');
    expect(categoryFromName('7-962-016 VIEWBOX STANDARD M16 60MM 5900X2500 H3', rules)).toBeNull();
    expect(categoryFromName('7-632-029 TERRACE PLATFORM - VIEWBOX M16', rules)).toBe('TERRASSE');
  });

  it('réglages enregistrés avant : Escalier intérieur inséré avant Escalier, Nidaplast ajouté aux murs légers', () => {
    const old = DEFAULT_RULES.categories
      .filter((c) => c.key !== 'ESCALIER-INTERIEUR')
      .map((c) => (c.key === 'MUR-LEGER' ? { ...c, patterns: c.patterns.filter((p) => p !== 'NIDAPLAST') } : c));
    const merged = mergeRules({ categories: old });
    const keys = merged.categories.map((c) => c.key);
    expect(keys.indexOf('ESCALIER-INTERIEUR')).toBe(keys.indexOf('ESCALIER') - 1);
    expect(merged.categories.find((c) => c.key === 'MUR-LEGER')!.patterns).toContain('NIDAPLAST');
    const r = compileRules(merged);
    expect(categoryFromName('Nidaplast / TUV WALL Vinyle White/7024', r)).toBe('MUR-LEGER');
    expect(categoryFromName('Escalier int. 2', r)).toBe('ESCALIER-INTERIEUR');
  });

  it('étude structure : un escalier intérieur est une charge à peser, une pièce VIEWBOX dans une Viewbox est son corps', () => {
    const p = proposeFor('ESCALIER-INTERIEUR', false)!;
    expect(p.assignment).toMatchObject({ role: 'load', nature: 'other' });
    expect(missingData(p.assignment, new Map())).toBe('poids à renseigner');
    expect(proposeFor('ESCALIER', false)!.assignment.nature).toBe('stair');
  });
});

describe('ensemble de Viewbox (escalier intérieur = deux Viewbox superposées)', async () => {
  // VBX-01 et VBX-04 (posée sur VBX-01) sont dans l'objet « Escalier intérieur » (renommé VBXE-20 pendant l'export),
  // avec l'escalier lui-même (VBXE-21) ; les autres Viewbox restent en haut du modèle.
  let dae = makeSketchupDae({ twoSided: false });
  const stairGeom = /<node id="N_stair" name="COMMUN_ESCALIER-01">(.*?)<\/node>/s.exec(dae)![1];
  const vbx1 = /<node id="N_vbx1" name="VBX-01">.*?<\/node>/s.exec(dae)![0];
  const vbx4 = /<node id="N_vbx4" name="VBX-04">.*?<\/node>/s.exec(dae)![0];
  dae = dae.replace(vbx4, '').replace(vbx1, `<node id="N_asm" name="VBXE-20">${vbx1}${vbx4}<node id="N_inner" name="VBXE-21"><matrix>1 0 0 ${3500 / 25.4} 0 1 0 ${500 / 25.4} 0 0 1 0 0 0 0 1</matrix>${stairGeom}</node></node>`);
  const manifest = {
    schema: 'viewbox-manifest/1',
    units: 'mm',
    upAxis: 'Z',
    assemblySchemaVersion: 1,
    modules: [
      { id: 'VBX-01', label: 'Escalier intérieur', viewboxBy: 'nom', assembly: 'VBXE-20', accessories: [] },
      { id: 'VBX-04', label: 'Escalier intérieur', viewboxBy: 'nom', assembly: 'VBXE-20', accessories: [] },
      { id: 'VBX-02', label: null, viewboxBy: 'nom', accessories: [] },
    ],
    assemblies: [{ exportName: 'VBXE-20', name: 'Escalier intérieur', label: 'Escalier intérieur', definition: 'Escalier intérieur', category: 'VIEWBOX', modules: ['VBX-01', 'VBX-04'] }],
    common: [{ exportName: 'VBXE-21', name: 'Escalier intérieur 18 marches', category: 'ESCALIER-INTERIEUR', categorySource: 'définition', definition: 'Escalier droit 18 marches' }],
  };
  const zip = zipSync({ 'x/esc.dae': strToU8(dae), 'x/manifest.json': strToU8(JSON.stringify(manifest)) });
  const { index } = await ingest({ fileName: 'esc.zip', data: zip.buffer as ArrayBuffer, sha256: 'test', rules: DEFAULT_RULES, runner: inlineRunner });
  const look = makeLookup(index);

  it('les deux Viewbox de l’ensemble sont des modules, avec la désignation de l’ensemble', () => {
    expect(index.modules.map((m) => m.id).sort()).toEqual(['VBX-01', 'VBX-02', 'VBX-03', 'VBX-04']);
    const m1 = index.modules.find((m) => m.id === 'VBX-01')!;
    const m4 = index.modules.find((m) => m.id === 'VBX-04')!;
    expect([m1.label, m1.assembly, m4.label]).toEqual(['Escalier intérieur', 'Escalier intérieur', 'Escalier intérieur']);
    expect(m4.level).toBe(1);
    expect(index.modules.find((m) => m.id === 'VBX-02')!.label).toBeUndefined();
    expect(index.nodes.find((n) => n.id === m1.nodeId)!.label).toBe('Escalier intérieur');
    expect(index.warnings.map((w) => w.code)).not.toContain('NESTED_MODULE');
    expect(index.warnings.map((w) => w.code)).not.toContain('MANIFEST_UNMATCHED');
  });

  it('l’ensemble n’est pas classé : les pièces de ses Viewbox gardent leur propre catégorie', () => {
    const asm = index.nodes.find((n) => n.name === 'VBXE-20')!;
    expect(asm.category).toBeNull();
    expect(asm.role).toBe('wrapper');
    expect([asm.label, asm.sourceName, asm.definition]).toEqual(['Escalier intérieur', 'Escalier intérieur', 'Escalier intérieur']);
    const misc = index.nodes.find((n) => n.name === 'Group 12' && n.moduleId === 'VBX-01')!;
    expect(look.categoryOf(misc.id)).toBeNull(); // avant : « escalier… » hérité de l'ensemble
    const frame = index.nodes.find((n) => n.name === 'STRUCTURE_cadre' && n.moduleId === 'VBX-04')!;
    expect(look.categoryOf(frame.id)).toBe('STRUCTURE');
  });

  it('l’escalier lui-même est un objet « Escalier intérieur » posé sur la Viewbox du bas', () => {
    const st = index.nodes.find((n) => n.name === 'VBXE-21')!;
    expect([st.category, st.categorySource, st.role, st.assignment, st.moduleId]).toEqual(['ESCALIER-INTERIEUR', 'manifest', 'item', 'spatial', 'VBX-01']);
    expect(st.sourceName).toBe('Escalier intérieur 18 marches');
  });

  it('1.5.1 : un objet de l’ensemble marqué « partie de la Viewbox » est compris dans la box (étude structure, loading)', async () => {
    // lampes, plancher bois, escalier… posés à côté des Viewbox d'un ensemble marqué : catégorie VIEWBOX dans le manifest
    const m2 = { ...manifest, common: [{ ...manifest.common[0], category: 'VIEWBOX', categorySource: 'partie de la Viewbox' }] };
    const z2 = zipSync({ 'x/esc.dae': strToU8(dae), 'x/manifest.json': strToU8(JSON.stringify(m2)) });
    const { index: i2 } = await ingest({ fileName: 'esc.zip', data: z2.buffer as ArrayBuffer, sha256: 'test2', rules: DEFAULT_RULES, runner: inlineRunner });
    const st = i2.nodes.find((n) => n.name === 'VBXE-21')!;
    expect([st.category, st.assignment, st.moduleId]).toEqual(['VIEWBOX', 'spatial', 'VBX-01']);
    const rec = recognize({ index: i2, look: makeLookup(i2), library: mergeLibrary(SEED, []), assignments: {} });
    expect(rec.templateParts.get(st.id)).toBe('VBX-01');
    expect(rec.types.some((t) => t.nodeIds.includes(st.id))).toBe(false); // pas de question
    expect(isBoxPart(st)).toBe(true);
    expect(isBoxPart({ ...st, articleRef: '4-730-007' })).toBe(false); // avec une réf. : un produit compté
    // une autre catégorie rattachée par sa position reste un objet à part (pas le corps de la box)
    expect(isBoxPart({ ...st, category: 'STRUCTURE' })).toBe(false);
  });

  it('sans manifest, l’objet qui contient des Viewbox n’est pas classé par son nom', async () => {
    const plain = dae.replace('name="VBXE-20"', 'name="Escalier interieur"').replace('name="VBXE-21"', 'name="Escalier interieur 18 marches"');
    const { index: i2 } = await ingest({ fileName: 'esc.dae', data: strToU8(plain).buffer as ArrayBuffer, sha256: 't', rules: DEFAULT_RULES, runner: inlineRunner });
    expect(i2.nodes.find((n) => n.name === 'Escalier interieur')!.category).toBeNull();
    expect(i2.nodes.find((n) => n.name === 'Escalier interieur 18 marches')!.category).toBe('ESCALIER-INTERIEUR');
    expect(i2.modules.length).toBe(4);
  });
});
