// S12.7 — structure dessinée relevée par l'extension SketchUp 1.3.0 (« source A ») : lecture tolérante du manifest,
// repère définition du module → gabarit (rotation de l'instance, Z-up → Y-up, origine du ModuleFrame pieds exclus),
// barres de la source A sur les maillages du même modèle à ± 2 mm (modèle d'essai façon SketchUp, Viewbox tournée),
// même relevé que les maillages, section et nuance saisies dans SketchUp gardées.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import type { ManifestStructure } from '../../src/core/manifest';
import { cleanStructures } from '../../src/core/manifest';
import type { ModuleFrame } from '../../src/core/views';
import { definitionToTemplate, drawnMembers } from '../../src/structure/scene/drawnFrame';
import { extractFrame } from '../../src/structure/core/frameExtract';
import type { Pt } from '../../src/structure/core/sectionDetect';
import { parametricFrame } from '../../src/structure/core/templates/frameModule';
import { SEED_MODULES } from '../../src/structure/library/seed';
import { makeSketchupDae } from '../fixtures/sketchupDae';

const P = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!.params!;
const base = { sections: P.sections, springs: P.springs, plywood: P.plywood };
const rect = (w: number, h: number): Pt[] => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];
const close = (a: readonly number[], b: readonly number[], tol: number) => a.every((x, k) => Math.abs(x - b[k]) <= tol);
// SketchUp : rotation de 90° autour de z puis translation (colonnes, mm)
const ROT90 = (x: number, y: number, z: number) => [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, x, y, z, 1];
const IDENT = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

describe('S12.7 — structure dessinée de l’extension SketchUp (source A)', () => {
  it('lecture tolérante : barre invalide ignorée, structure vide ignorée, champs inconnus sans effet', () => {
    const s = cleanStructures({
      'Box 6 m': {
        v: 1,
        members: [
          { id: 'B1', a: [0, 0, 0], b: [1000, 0, 0], yRef: [0, 1, 0], loops: [[[0, 0], [10, 0], [10, 10]]], role: 'rim-floor', roleSource: 'manuel', section: 'CAT-UPN200', futur: 3 },
          { id: 'B2', a: [0, 0], b: [1, 1, 1], yRef: [0, 1, 0], loops: [[[0, 0], [1, 0], [1, 1]]] },
          { id: 'B3', a: [0, 0, 0], b: [1, 1, 1], yRef: [0, 1, 0], loops: [[[0, 0], [1, 0]]] },
        ],
        warnings: ['w', 3],
      },
      Vide: { members: [] },
      Faux: 'texte',
    });
    expect(Object.keys(s)).toEqual(['Box 6 m']);
    expect(s['Box 6 m'].members.map((m) => [m.id, m.role, m.section])).toEqual([['B1', 'rim-floor', 'CAT-UPN200']]);
    expect(s['Box 6 m'].warnings).toEqual(['w']);
    expect(cleanStructures(undefined)).toEqual({});
  });

  it('repère : Viewbox tournée de 90° et déplacée, origine du gabarit décalée (pieds exclus)', () => {
    // instance : définition tournée de 90° autour de z (SketchUp), posée en (10 000, 5 000, 300)
    // monde VEM (Y vers le haut) : x défini → y SketchUp → −z VEM ; y défini → −x SketchUp ; z → y VEM
    const f: ModuleFrame = {
      moduleId: 'VBX-01',
      origin: [10000, 300, -5000],
      xAxis: [0, 0, -1],
      yAxis: [-1, 0, 0],
      up: [0, 1, 0],
      min: [-50, -30, 100],
      max: [6008, 2408, 3000],
      longAxis: 'x',
      front: 'x+' as ModuleFrame['front'],
      frontSource: 'default',
    };
    const map = definitionToTemplate(ROT90(10000, 5000, 300), f);
    expect(close(map.point([100, 200, 300]), [150, 230, 200], 1e-9)).toBe(true);
    expect(close(map.vector([1, 0, 0]), [1, 0, 0], 1e-12)).toBe(true);
    expect(close(map.vector([0, 0, 1]), [0, 0, 1], 1e-12)).toBe(true);
    // grand côté selon y du repère : u = yAxis
    const g = { ...f, longAxis: 'y' as const, min: [0, 0, 0] as [number, number, number] };
    expect(close(definitionToTemplate(ROT90(10000, 5000, 300), g).point([100, 200, 300]), [200, 100, 300], 1e-9)).toBe(true);
  });

  it('box dessinée (rives, traverses, poteaux en tubes) relue par la source A : même relevé, sections et nuances saisies', () => {
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
    const tube = (w: number, h: number, t: number) => [rect(w, h), [...rect(w - 2 * t, h - 2 * t)].reverse()];
    const structure: ManifestStructure = {
      v: 1,
      source: 'sketchup',
      axes: 'definition',
      warnings: [],
      members: spec.frame.bars.map((b) => {
        const vertical = Math.abs(b.b[2] - b.a[2]) > 1;
        const alongX = Math.abs(b.b[0] - b.a[0]) > 1;
        return {
          id: b.id,
          definition: b.role,
          a: [...b.a],
          b: [...b.b],
          // yRef horizontal, ⟂ à l'axe ; z de coupe = axe × yRef (vers le haut pour une barre horizontale)
          yRef: vertical ? [1, 0, 0] : alongX ? [0, 1, 0] : [-1, 0, 0],
          loops: b.role === 'column' ? tube(100, 100, 5) : b.role.startsWith('rim') ? tube(60, 120, 4) : tube(50, 100, 3),
          role: b.role,
          roleSource: 'géométrie',
          ...(b.role === 'column' ? { section: 'CAT-SHS100x100x5', grade: 'S355' } : {}),
        };
      }),
    };
    const f: ModuleFrame = { moduleId: 'VBX-01', origin: [10000, 0, -5000], xAxis: [0, 0, -1], yAxis: [-1, 0, 0], up: [0, 1, 0], min: [0, 0, 0], max: [5900, 2500, 3100], longAxis: 'x', front: 'x+' as ModuleFrame['front'], frontSource: 'default' };
    const raw = drawnMembers(structure, ROT90(10000, 5000, 0), f);
    expect(raw).toHaveLength(spec.frame.bars.length);
    const ex = extractFrame(raw, { long: 5900, short: 2500, height: 3100, base, date: '12.10.2026', origin: 'sketchup' });
    const count = (r: string) => ex.bars.filter((b) => b.role === r).length;
    expect([count('rim-floor'), count('rim-roof'), count('transverse-floor'), count('transverse-roof'), count('column')]).toEqual([4, 4, 5, 5, 4]);
    expect(ex.params!.frame.origin).toBe('sketchup');
    const col = ex.params!.frame.bars.find((b) => b.role === 'column')!;
    expect([col.section, col.grade, col.source?.sectionStatus]).toEqual(['CAT-SHS100x100x5', 'S355', 'user']);
    const rim = ex.bars.find((b) => b.role === 'rim-floor')!;
    expect(rim.sectionKey).toBe('CAT-RHS120x60x4');
    // axes relus = axes dessinés (± 2 mm)
    for (const b of ex.bars) {
      const src = spec.frame.bars.find((x) => x.id === b.source.node)!;
      const ok = (close(b.measured.a, src.a, 2) && close(b.measured.b, src.b, 2)) || (close(b.measured.a, src.b, 2) && close(b.measured.b, src.a, 2));
      expect(ok, `${b.id} ${b.measured.a} ${b.measured.b} / ${src.a} ${src.b}`).toBe(true);
    }
    // un rôle saisi à la main l'emporte sur la géométrie
    const forced = drawnMembers({ ...structure, members: structure.members.map((m) => (m.role === 'transverse-floor' ? { ...m, role: 'none', roleSource: 'manuel' } : m)) }, IDENT(0, 0, 0), { ...f, origin: [0, 0, 0], xAxis: [1, 0, 0], yAxis: [0, 0, -1] });
    expect(extractFrame(forced, { long: 5900, short: 2500, height: 3100, base, date: '12.10.2026' }).bars.filter((b) => b.role === 'none')).toHaveLength(5);
  });

  it('modèle d’essai façon SketchUp (Viewbox tournée VBX-03) : barres de la source A sur les maillages à ± 2 mm', async () => {
    const { ingest } = await import('../../src/ingest/pipeline');
    const { inlineRunner } = await import('../../src/ingest/cleanup');
    const { exportPackage, loadPackage } = await import('../../src/ingest/package');
    const { DEFAULT_RULES } = await import('../../src/core/classification');
    const { makeLoadedScene } = await import('../../src/scene/loadedScene');
    const { moduleStructure, moduleStructureMesh } = await import('../../src/structure/scene/frameFromScene');
    // poteaux du cadre de la Viewbox d'essai, dans le repère de sa définition : 100 × 100, z 150 → 2800
    const cols: Array<[number, number]> = [
      [50, 50],
      [5850, 50],
      [50, 2450],
      [5850, 2450],
    ];
    const structure = {
      v: 1,
      source: 'sketchup',
      axes: 'definition',
      warnings: [],
      members: cols.map(([x, y], k) => ({ id: `B${k + 1}`, definition: 'STRUCTURE_cadre', a: [x, y, 150], b: [x, y, 2800], yRef: [1, 0, 0], loops: [rect(100, 100)], role: 'column', roleSource: 'géométrie' })),
    };
    const manifest = {
      schema: 'viewbox-manifest/1',
      units: 'mm',
      upAxis: 'Z',
      frameSchemaVersion: 1,
      structures: { 'Viewbox 5900': structure },
      modules: [
        { id: 'VBX-01', definition: 'Viewbox 5900', transform: IDENT(0, 0, 0), structureRef: 'Viewbox 5900' },
        { id: 'VBX-03', definition: 'Viewbox 5900', transform: ROT90(17500, 0, 0), structureRef: 'Viewbox 5900' },
      ],
      common: [],
    };
    const zip = zipSync({ 'export/test.dae': strToU8(makeSketchupDae({ twoSided: false })), 'export/manifest.json': strToU8(JSON.stringify(manifest)) });
    const data = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
    const res = await ingest({ fileName: 'essai.zip', data, sha256: 'x', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'x');
    expect(Object.keys(scene.index.structures ?? {})).toEqual(['Viewbox 5900']);
    for (const id of ['VBX-01', 'VBX-03']) {
      const info = scene.index.modules.find((m) => m.id === id)!;
      expect(info.structureRef).toBe('Viewbox 5900');
      const a = moduleStructure(scene, id)!;
      expect(a.origin).toBe('sketchup');
      const mesh = moduleStructureMesh(scene, id)!;
      const fromA = extractFrame(a.members, { ...mesh.dims, base, date: '12.10.2026' }).bars.filter((b) => b.role === 'column');
      expect(fromA).toHaveLength(4);
      // dans le modèle d'essai les poteaux sont soudés à la dalle du toit (un seul solide) : chaque poteau de la source A
      // doit retrouver les 4 coins de sa coupe 100 × 100 parmi les sommets du maillage, au pied (z 150) à ± 2 mm
      const verts: number[][] = [];
      for (const m of mesh.members) for (let k = 0; k < m.triangles.length; k += 3) verts.push([m.triangles[k], m.triangles[k + 1], m.triangles[k + 2]]);
      for (const b of fromA) {
        const [x, y] = [(b.measured.a[0] + b.measured.b[0]) / 2, (b.measured.a[1] + b.measured.b[1]) / 2];
        const z = Math.min(b.measured.a[2], b.measured.b[2]);
        for (const [dx, dy] of [[-50, -50], [50, -50], [50, 50], [-50, 50]])
          expect(verts.some((v) => close(v, [x + dx, y + dy, z], 2)), `${id} ${b.id} coin [${[x + dx, y + dy, z].map(Math.round)}]`).toBe(true);
      }
    }
  }, 120_000);
});

// Vrai modèle ré-exporté avec l'extension 1.3.0 (déposé dans test-models/ ou reference-reports/) : chaque poteau, rive
// et traverse de la source A tombe sur une barre relevée sur les maillages du même modèle (± 2 mm).
const dirs = [process.env.VEM_MODELS_DIR ?? join(__dirname, '..', '..', '..', 'test-models'), join(__dirname, '..', '..', 'reference-reports')];
const real = dirs.flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.zip')).map((f) => join(d, f)) : [])).filter((f) => {
  try {
    const files = unzipSync(new Uint8Array(readFileSync(f)), { filter: (x) => x.name.endsWith('manifest.json') });
    const text = Object.values(files)[0];
    return !!text && /"frameSchemaVersion"/.test(new TextDecoder().decode(text));
  } catch {
    return false;
  }
});
for (const f of real)
  describe(`modèle réel 1.3.0 — ${f.split('/').pop()}`, () => {
    it('source A sur les maillages à ± 2 mm', async () => {
      const { ingest } = await import('../../src/ingest/pipeline');
      const { inlineRunner } = await import('../../src/ingest/cleanup');
      const { exportPackage, loadPackage } = await import('../../src/ingest/package');
      const { DEFAULT_RULES } = await import('../../src/core/classification');
      const { makeLoadedScene } = await import('../../src/scene/loadedScene');
      const { moduleStructure, moduleStructureMesh } = await import('../../src/structure/scene/frameFromScene');
      const buf = readFileSync(f);
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const res = await ingest({ fileName: 'm.zip', data, sha256: 'x', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
      const pkg = await loadPackage(await exportPackage(res.root));
      const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'x');
      const mod = scene.index.modules.find((m) => m.structureRef)!;
      expect(mod).toBeTruthy();
      const a = moduleStructure(scene, mod.id)!;
      const mesh = moduleStructureMesh(scene, mod.id)!;
      const opts = { ...mesh.dims, base, date: '12.10.2026' };
      const bars = (x: typeof a.members) => extractFrame(x, opts).bars.filter((b) => b.role !== 'other' && b.role !== 'none');
      const fromA = bars(a.members);
      const fromMesh = bars(mesh.members);
      const near = (p: readonly number[], q: readonly number[]) => close(p, q, 2);
      const misses = fromA.filter((b) => !fromMesh.some((m) => (near(m.measured.a, b.measured.a) && near(m.measured.b, b.measured.b)) || (near(m.measured.a, b.measured.b) && near(m.measured.b, b.measured.a))));
      console.log(`${f.split('/').pop()} : ${fromA.length} barres (source A), ${fromMesh.length} (maillages), hors ± 2 mm : ${misses.map((b) => `${b.id} ${b.role}`).join(', ') || 'aucune'}`);
      expect(misses).toEqual([]);
    }, 600_000);
  });
