// S12.5 — relevé de la structure dessinée : box synthétique complète (barres extrudées autour de leurs axes) → frame
// attendu (rôles, lignes de système, sections), conformité avec la Viewbox, et le vrai modèle Permabox « Viewbox Light
// V4 » (traverses seules, toiture exportée hors du composant) quand il est présent.
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RawMember } from '../../src/structure/core/frameExtract';
import { extractFrame, frameConformity } from '../../src/structure/core/frameExtract';
import type { FrameBar, LibraryEntry, SectionEntry } from '../../src/structure/core/library';
import type { Pt, V3 } from '../../src/structure/core/sectionDetect';
import { checkFrame } from '../../src/structure/core/frameChecks';
import { sectionMap } from '../../src/structure/core/assemble';
import { frameSections, parametricFrame, viewboxPresetFrame } from '../../src/structure/core/templates/frameModule';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';
import { upnContour } from '../../src/structure/core/sectionGeometry';
import { extrude } from './sectionDetect.test';

const VBX = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;
const P = VBX.params!;
const base = { sections: P.sections, springs: P.springs, plywood: P.plywood };
const rect = (w: number, h: number): Pt[] => [
  [-w / 2, -h / 2],
  [w / 2, -h / 2],
  [w / 2, h / 2],
  [-w / 2, h / 2],
];
const tube = (w: number, h: number, t: number): Pt[][] => [rect(w, h), [...rect(w - 2 * t, h - 2 * t)].reverse()];

/** Barres d'un frame dessinées comme des solides : tube autour de l'axe (rives : UNP 200 dos vers l'extérieur). */
function draw(bars: FrameBar[]): RawMember[] {
  return bars.map((b) => {
    const d = [b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]] as V3;
    const L = Math.hypot(...d);
    const dir = d.map((x) => x / L) as V3;
    const vertical = Math.abs(dir[2]) > 0.9;
    const z: V3 = vertical ? [1, 0, 0] : [0, 0, 1];
    const y: V3 = [z[1] * dir[2] - z[2] * dir[1], z[2] * dir[0] - z[0] * dir[2], z[0] * dir[1] - z[1] * dir[0]];
    const loops = b.role.startsWith('rim') ? [upnContour(200, 75, 8.5, 11.5).map(([py, pz]) => [py - 20, pz] as Pt)] : b.role === 'column' ? tube(100, 100, 5) : tube(60, 120, 4);
    // les barres s'arrêtent 30 mm avant les nœuds (contre l'âme de la barre porteuse)
    const cut = b.role === 'column' ? 0 : 30;
    const a: V3 = [b.a[0] + dir[0] * cut, b.a[1] + dir[1] * cut, b.a[2] + dir[2] * cut];
    return { id: b.id, definition: b.role, triangles: extrude(loops, a, dir, y, z, L - 2 * cut) };
  });
}

describe('S12.5 — relevé de la structure dessinée', () => {
  it('box synthétique (traverses seules, rives UNP 200, poteaux 100 × 5) : rôles, lignes de système, sections', () => {
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
    // repère du relevé : origine au coin bas de la boîte (rives jusqu'au bord)
    const ex = extractFrame(draw(spec.frame.bars), { long: 5900, short: 2500, height: 2900, base, date: '07.10.2026' });
    const count = (r: string) => ex.bars.filter((b) => b.role === r).length;
    expect([count('rim-floor'), count('rim-roof'), count('transverse-floor'), count('transverse-roof'), count('column'), count('stringer-floor')]).toEqual([4, 4, 5, 5, 4, 0]);
    expect(ex.params).not.toBeNull();
    const p = ex.params!;
    expect(p.x0).toBeCloseTo(40, -1);
    expect(p.floorZ).toBeCloseTo(0, -1);
    expect(p.roofZ).toBeCloseTo(2800, -1);
    expect(p.frame.deck.floor?.span).toBe('u');
    // rives : UNP 200 du catalogue ; traverses : tube 120 × 60 × 4 du catalogue (ou relevé)
    const rim = ex.bars.find((b) => b.role === 'rim-floor')!;
    expect(rim.sectionKey).toBe('CAT-UPN200');
    // les traverses s'arrêtaient 30 mm avant les rives : prolongées jusqu'aux lignes de système
    const t = ex.bars.find((b) => b.role === 'transverse-floor')!;
    expect(Math.min(t.a[1], t.b[1])).toBeCloseTo(p.y0, 0);
    expect(Math.max(t.a[1], t.b[1])).toBeCloseTo(p.y1, 0);
    // structure complète et reliée, stable avec des angles semi-rigides
    const lib: LibraryEntry[] = [...SEED, ...ex.newSections];
    const sections = frameSections([{ params: p }], sectionMap(lib));
    const c = checkFrame(p, sections);
    expect(c.errors).toEqual([]);
    expect(c.stability).toMatchObject({ u: 'ok', v: 'ok' });
    // conformité : ce n'est pas la Viewbox 5900 (traverses seules, pas de lisse, autres sections)
    const conf = frameConformity(ex, { name: 'Viewbox 5900', frame: viewboxPresetFrame(P), sectionDims: (k) => dimsOf(sections, k) });
    expect(conf.ok).toBe(false);
    expect(conf.differences.join(' ')).toMatch(/aucune lisse/);
  });

  it('Viewbox 5900 dessinée comme le gabarit : conforme', () => {
    const preset = viewboxPresetFrame(P).bars.filter((b) => b.role !== 'foot');
    const ex = extractFrame(draw(preset), { long: 5900, short: 2500, height: 3000, base, date: '07.10.2026' });
    const sections = sectionMap(SEED);
    // sections dessinées ici ≠ sections de la Viewbox : la comparaison porte sur la topologie
    const conf = frameConformity(ex, { name: 'Viewbox 5900', frame: viewboxPresetFrame(P), sectionDims: () => null });
    expect(conf.differences).toEqual([]);
    expect(conf.ok).toBe(true);
    expect(sections.size).toBeGreaterThan(0);
  });
});

const dimsOf = (sections: ReadonlyMap<string, SectionEntry>, k: string) => {
  const s = sections.get(k)?.section;
  return s ? { h: s.dims.h ?? s.dims.d ?? 0, b: s.dims.b ?? s.dims.d ?? 0 } : null;
};

const PERMABOX = join(__dirname, '..', '..', 'reference-reports', 'Permabox_Lightbox_V1_C_Amaury_VEM_20261001-1030.zip');

describe.skipIf(!existsSync(PERMABOX))('modèle Permabox « Viewbox Light V4 »', () => {
  it('relève 4 poteaux, 8 rives, 5 traverses au plancher et 5 en toiture, aucune lisse ; non conforme à la Viewbox', async () => {
    const { ingest } = await import('../../src/ingest/pipeline');
    const { inlineRunner } = await import('../../src/ingest/cleanup');
    const { exportPackage, loadPackage } = await import('../../src/ingest/package');
    const { DEFAULT_RULES } = await import('../../src/core/classification');
    const { makeLoadedScene } = await import('../../src/scene/loadedScene');
    const { moduleStructureMesh } = await import('../../src/structure/scene/frameFromScene');
    const buf = readFileSync(PERMABOX);
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const res = await ingest({ fileName: 'permabox.zip', data, sha256: 'x', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'x');
    const mesh = moduleStructureMesh(scene, 'VBX-01')!;
    const ex = extractFrame(mesh.members, { ...mesh.dims, base, file: 'permabox.zip', date: '07.10.2026' });
    const count = (r: string) => ex.bars.filter((b) => b.role === r).length;
    const summary = ex.bars.map((b) => `${b.id} ${b.role} ${b.section ? `${b.section.shape} ${Math.round(b.section.dims.h)}×${Math.round(b.section.dims.b)}` : ''} ${b.sectionKey} ${b.source.definition ?? b.source.name ?? ''} [${b.a.map(Math.round)}]→[${b.b.map(Math.round)}] ecc ${Math.round(b.eccentricity)}`);
    console.log(`${summary.join('\n')}\nlignes : x ${ex.params?.x0}/${ex.params?.x1} y ${ex.params?.y0}/${ex.params?.y1} z ${ex.params?.floorZ}/${ex.params?.roofZ} top ${ex.params?.topZ}\n${ex.warnings.join('\n')}`);
    expect(count('column')).toBe(4);
    expect(count('rim-floor')).toBe(4);
    expect(count('rim-roof')).toBe(4);
    expect(count('transverse-floor')).toBe(5);
    expect(count('transverse-roof')).toBe(5);
    expect(count('stringer-floor') + count('stringer-roof')).toBe(0);
    const sections = frameSections([{ params: ex.params! }], sectionMap([...SEED, ...ex.newSections]));
    const conf = frameConformity(ex, { name: 'Viewbox 5900', frame: viewboxPresetFrame(P), sectionDims: (k) => dimsOf(sectionMap(SEED), k) });
    console.log(conf.differences.join('\n'));
    expect(conf.ok).toBe(false);
    const c = checkFrame(ex.params!, sections);
    console.log(c.errors.join('\n'), c.unconnected);
    expect(c.errors).toEqual([]);
  }, 300_000);
});

// aucun faux positif : sur les vrais modèles Viewbox, la structure relevée est conforme ou absente (< 8 barres)
for (const f of [
  join(process.env.VEM_MODELS_DIR ?? join(__dirname, '..', '..', '..', 'test-models'), 'Qatar_Airways_2024_VEM_20261001-1529.zip'),
  join(__dirname, '..', '..', 'reference-reports', 'Xiaomi_Paris_2026_VEM_20260929-0951.zip'),
  join(__dirname, '..', '..', 'reference-reports', 'test_structurelle_VEM_20261001-1554.zip'),
])
  describe.skipIf(!existsSync(f))(`aucun faux positif — ${f.split('/').pop()}`, () => {
    it('structure relevée conforme à la Viewbox 5900 ou absente', async () => {
      const { ingest } = await import('../../src/ingest/pipeline');
      const { inlineRunner } = await import('../../src/ingest/cleanup');
      const { exportPackage, loadPackage } = await import('../../src/ingest/package');
      const { DEFAULT_RULES } = await import('../../src/core/classification');
      const { makeLoadedScene } = await import('../../src/scene/loadedScene');
      const { moduleStructureMesh } = await import('../../src/structure/scene/frameFromScene');
      const buf = readFileSync(f);
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const res = await ingest({ fileName: 'm.zip', data, sha256: 'x', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
      const pkg = await loadPackage(await exportPackage(res.root));
      const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'x');
      const mesh = moduleStructureMesh(scene, scene.index.modules[0].id)!;
      const ex = extractFrame(mesh.members, { ...mesh.dims, base, date: '07.10.2026' });
      const conf = ex.params ? frameConformity(ex, { name: 'Viewbox 5900', frame: viewboxPresetFrame(P), sectionDims: (k) => dimsOf(sectionMap(SEED), k) }) : null;
      console.log(`${f.split('/').pop()} : ${ex.bars.length} barres (${[...new Set(ex.bars.map((b) => b.role))].join(', ')}), params ${!!ex.params}, ${conf ? conf.differences.join(' | ') || 'conforme' : 'pas de structure relevée'}`);
      expect(conf === null || conf.ok).toBe(true);
    }, 600_000);
  });
