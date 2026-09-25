import { describe, expect, it } from 'vitest';
import { Box3 } from 'three';
import { zipSync, strToU8 } from 'fflate';
import { ingest } from '../src/ingest/pipeline';
import { inlineRunner } from '../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../src/ingest/package';
import { DEFAULT_RULES } from '../src/core/classification';
import type { NodeInfo, SceneIndex } from '../src/core/types';
import { makeSketchupDae } from './fixtures/sketchupDae';

const enc = (s: string) => strToU8(s).buffer as ArrayBuffer;

async function run(fileName: string, data: ArrayBuffer) {
  return ingest({ fileName, data, sha256: 'test', rules: DEFAULT_RULES, runner: inlineRunner });
}

function byName(index: SceneIndex, name: string, moduleId?: string): NodeInfo[] {
  return index.nodes.filter((n) => (n.name === name || n.definition === name) && (moduleId === undefined || n.moduleId === moduleId));
}

describe("ingestion d'un export SketchUp", async () => {
  const res = await run('test.dae', enc(makeSketchupDae()));
  const { index } = res;
  const codes = index.warnings.map((w) => w.code);

  it('détecte les 4 Viewbox avec leurs dimensions (5900 × 2500 ± 1 mm), même tournée', () => {
    expect(index.modules.map((m) => m.id).sort()).toEqual(['VBX-01', 'VBX-02', 'VBX-03', 'VBX-04']);
    for (const m of index.modules) {
      expect(m.dimsOk).toBe(true);
      expect(Math.abs(m.planDimsMm[0] - 5900)).toBeLessThanOrEqual(1);
      expect(Math.abs(m.planDimsMm[1] - 2500)).toBeLessThanOrEqual(1);
      expect(m.dimsSource).toBe('structure');
    }
    expect(codes).not.toContain('UNIT_SUSPECT');
  });

  it('convertit pouces → mm et Z-up → Y-up une seule fois', () => {
    const v3 = index.modules.find((m) => m.id === 'VBX-03')!;
    // VBX-03 est tournée de 90° : 2500 mm selon X monde, 5900 mm selon Z monde (= -Y SketchUp)
    const [x0, , z0, x1, , z1] = v3.bboxMm;
    expect(Math.round(x1 - x0)).toBe(2500 + 50 + 50); // pieds de 200 mm débordant de 50 mm de chaque côté
    expect(Math.round(z1 - z0)).toBe(5900 + 100);
    expect(index.source.unitMeter).toBeCloseTo(0.0254);
    expect(index.source.upAxis).toBe('Z_UP');
  });

  it('range les modules par niveau', () => {
    expect(index.levels.map((l) => [l.label, l.moduleIds.sort()])).toEqual([
      ['Ground Floor', ['VBX-01', 'VBX-02', 'VBX-03']],
      ['First Floor', ['VBX-04']],
    ]);
  });

  it('classe les accessoires (nom, définition, géométrie brute) et garde la réf. article', () => {
    const glass = byName(index, 'VITRE-SEAMLESS_#7-230-044', 'VBX-01')[0];
    expect(glass.category).toBe('VITRE-SEAMLESS');
    expect(glass.articleRef).toBe('7-230-044');
    expect(glass.glass).toBe(true);
    const door = byName(index, 'instance_3', 'VBX-01')[0];
    expect(door.category).toBe('PORTE-SIMPLE');
    expect(door.categorySource).toBe('definition');
    expect(door.definition).toBe('Porte simple 900');
    const m1 = index.modules.find((m) => m.id === 'VBX-01')!;
    const items = index.nodes.filter((n) => m1.itemIds.includes(n.id));
    const cats = items.map((n) => n.category ?? 'NON_CLASSÉ').sort();
    expect(cats).toEqual(['NON_CLASSÉ', 'PIED', 'PIED', 'PIED', 'PIED', 'PORTE-SIMPLE', 'STRUCTURE', 'STRUCTURE', 'VITRE-SEAMLESS']);
  });

  it('rattache par position un accessoire posé hors composant, sinon en éléments communs', () => {
    const spatial = byName(index, 'MUR-LEGER_spatial')[0];
    expect(spatial.moduleId).toBe('VBX-02');
    expect(spatial.assignment).toBe('spatial');
    const stair = byName(index, 'COMMUN_ESCALIER-01')[0];
    expect(stair.assignment).toBe('common');
    expect(index.commonIds).toContain(stair.id);
    const orphan = byName(index, 'PORTE-DOUBLE orpheline')[0];
    expect(orphan.assignment).toBe('common');
    expect(index.warnings.find((w) => w.code === 'ORPHAN_ACCESSORY')?.nodeIds).toEqual([orphan.id]);
  });

  it('ignore le contexte', () => {
    const ground = byName(index, 'CTX_sol')[0];
    expect(ground.role).toBe('context');
    expect(index.contextIds).toContain(ground.id);
  });

  it('signale les objets non classés, les faces doublées et l’absence de manifest', () => {
    expect(index.warnings.find((w) => w.code === 'UNCLASSIFIED')?.nodeIds?.length).toBe(4); // "Group 12" × 4 modules
    expect(index.stats.backToBackRemoved).toBeGreaterThan(0);
    expect(codes).toContain('TWO_SIDED_FACES');
    expect(codes).toContain('NO_MANIFEST');
    expect(codes).not.toContain('NO_EDGES');
  });

  it('exporte un paquet GLB qui se recharge avec les mêmes nœuds et les mêmes cotes', async () => {
    const glb = await exportPackage(res.root);
    expect(glb.byteLength).toBeGreaterThan(1000);
    const pkg = await loadPackage(glb);
    for (const n of index.nodes) expect(pkg.objectsById.has(n.id)).toBe(true);
    const m = index.modules.find((x) => x.id === 'VBX-03')!;
    const box = new Box3().setFromObject(pkg.objectsById.get(m.nodeId)!, true);
    const got = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z];
    got.forEach((v, i) => expect(Math.abs(v - m.bboxMm[i])).toBeLessThan(0.5));
    expect(pkg.objectsById.get(m.nodeId)!.name).toBe('VBX-03');
  });
});

describe('contrôles', () => {
  it("détecte une erreur d'unités (pouces déclarés en mm) avec le facteur suspecté", async () => {
    const { index } = await run('mauvaises-unites.dae', enc(makeSketchupDae({ unitMeter: 0.001, unitName: 'millimeter' })));
    const w = index.warnings.find((x) => x.code === 'UNIT_SUSPECT');
    expect(w?.severity).toBe('blocking');
    expect(w?.message).toContain('25,4');
  });

  it('lit un .zip avec manifest.json : la catégorie du manifest prime', async () => {
    const manifest = {
      schema: 'viewbox-manifest/1',
      units: 'mm',
      upAxis: 'Z',
      modules: [{ id: 'VBX-01', accessories: [{ name: 'Group 12', category: 'MUR-LOURD' }] }],
    };
    const zip = zipSync({ 'export/test.dae': strToU8(makeSketchupDae({ twoSided: false, edges: false })), 'export/manifest.json': strToU8(JSON.stringify(manifest)) });
    const { index } = await run('test.zip', zip.buffer as ArrayBuffer);
    const g = byName(index, 'Group 12', 'VBX-01')[0];
    expect(g.category).toBe('MUR-LOURD');
    expect(g.categorySource).toBe('manifest');
    const codes = index.warnings.map((x) => x.code);
    expect(codes).not.toContain('NO_MANIFEST');
    expect(codes).not.toContain('TWO_SIDED_FACES');
    expect(codes).toContain('NO_EDGES');
    expect(codes).not.toContain('MANIFEST_UNMATCHED');
  });

  it('reconnaît les Viewbox par leurs dimensions quand elles ne sont pas nommées', async () => {
    const dae = makeSketchupDae().replace(/name="VBX-0?(\d)"/g, 'name="instance_$1"');
    const { index } = await run('sans-noms.dae', enc(dae));
    expect(index.modules.length).toBe(4);
    expect(index.modules.every((m) => m.id.startsWith('AUTO-') && m.detectedBy === 'dimensions')).toBe(true);
    expect(index.warnings.map((w) => w.code)).toContain('MODULES_BY_DIMENSIONS');
  });
});
