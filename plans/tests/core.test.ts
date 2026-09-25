import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  articleRefFromName,
  categoryFromName,
  categoryKey,
  compileRules,
  isContextName,
  mergeRules,
  moduleIdFromName,
} from '../src/core/classification';
import { checkPlanDims, groupLevels, nearestSize, parseColladaAsset, suspectScaleFactor } from '../src/core/units';
import { cleanTriangles } from '../src/core/geometryClean';
import { BBoxLookup, asCategory, daeNameKey, manifestBBoxToYUp, parseManifest } from '../src/core/manifest';
import { stableId } from '../src/core/hash';

const rules = compileRules(DEFAULT_RULES);

describe('classification par le nom', () => {
  it('reconnaît les modules et normalise le numéro', () => {
    expect(moduleIdFromName('VBX-01', rules)).toBe('VBX-01');
    expect(moduleIdFromName('vbx_7', rules)).toBe('VBX-07');
    expect(moduleIdFromName('VBX 12 entrée', rules)).toBe('VBX-12');
    expect(moduleIdFromName('VBX-03|PORTE-SIMPLE|02', rules)).toBeNull();
    expect(moduleIdFromName('Viewbox 5900', rules)).toBeNull();
  });

  it('classe les accessoires (préfixes, accents, anglais, ordre de priorité)', () => {
    expect(categoryFromName('VITRE-SEAMLESS_#7-230-044', rules)).toBe('VITRE-SEAMLESS');
    expect(categoryFromName('Mur léger 2500', rules)).toBe('MUR-LEGER');
    expect(categoryFromName('Wall Heavy', rules)).toBe('MUR-LOURD');
    expect(categoryFromName('VBX-03|PORTE-SIMPLE|02', rules)).toBe('PORTE-SIMPLE');
    expect(categoryFromName('Full Sliding Door', rules)).toBe('PORTE-COULISSANTE');
    expect(categoryFromName('Full Slidding door', rules)).toBe('PORTE-COULISSANTE');
    expect(categoryFromName('Windwos Seamless', rules)).toBe('VITRE-SEAMLESS');
    expect(categoryFromName('WALL LIGHT', rules)).toBe('MUR-LEGER');
    expect(categoryFromName('Windows Frame', rules)).toBe('VITRE-CADRE');
    expect(categoryFromName('COMMUN_GARDE-CORPS-01', rules)).toBe('GARDE-CORPS');
    expect(categoryFromName('PIED_03', rules)).toBe('PIED');
    expect(categoryFromName('Group 12', rules)).toBeNull();
    expect(categoryFromName('Copied', rules)).toBeNull();
  });

  it('extrait la référence article', () => {
    expect(articleRefFromName('MUR-LEGER_#7-230-044', rules)).toBe('7-230-044');
    expect(articleRefFromName('_7-230-00037_2', rules)).toBe('7-230-00037');
    expect(articleRefFromName('PORTE', rules)).toBeNull();
  });

  it('reconnaît le contexte', () => {
    expect(isContextName('CTX_sol', rules)).toBe(true);
    expect(isContextName('Contexte', rules)).toBe(false);
  });

  it('fusionne des règles enregistrées partielles avec les défauts (et reprend l’ancienne taille unique)', () => {
    const r = mergeRules({ modulePattern: '^BOX(\\d+)', moduleDims: { long: 6000, short: 2400, toleranceMm: 40 } });
    expect(r.modulePattern).toBe('^BOX(\\d+)');
    expect(r.categories.length).toBe(DEFAULT_RULES.categories.length);
    expect(r.moduleSizes[0]).toEqual({ label: 'Viewbox 6000', long: 6000, short: 2400 });
    expect(r.moduleToleranceMm).toBe(40);
  });

  it('reconnaît le vocabulaire ERP des composants Viewbox', () => {
    expect(categoryFromName('7-632-001 Leveling feet', rules)).toBe('PIED');
    expect(categoryFromName('7-355-014 Vertical poles simple', rules)).toBe('STRUCTURE');
    expect(categoryFromName('7-632-001 Floor module equipped with:', rules)).toBe('PLANCHER');
    expect(categoryFromName('_7-364-27_UPN220_PG', rules)).toBe('STRUCTURE');
    expect(categoryFromName('_7-637-010_Glasswall_Seamless_10mm', rules)).toBe('VITRE-SEAMLESS');
    expect(categoryFromName('Napoleon', rules)).toBeNull();
  });

  it('crée des clés de catégorie propres et accepte les catégories personnalisées', () => {
    expect(categoryKey('Porte orangerie')).toBe('PORTE-ORANGERIE');
    expect(categoryKey(' bandeau / dibond ')).toBe('BANDEAU-DIBOND');
    expect(asCategory('porte orangerie')).toBe('PORTE-ORANGERIE');
    expect(asCategory('')).toBeNull();
  });

  it('retrouve le nom tel que SketchUp l’écrit dans le .dae', () => {
    expect(daeNameKey('7-355-14:1')).toBe(daeNameKey('_7-355-14_1'));
    expect(daeNameKey('7-637-010 Glasswall Seamless 10mm 2500X1130X#1')).toBe(daeNameKey('_7-637-010_Glasswall_Seamless_10mm_2500X1130X_1'));
    expect(daeNameKey('VBXE-12')).toBe('VBXE-12');
  });

  it('signale un motif invalide de façon lisible', () => {
    expect(() => compileRules({ ...DEFAULT_RULES, modulePattern: '(' })).toThrow(/Motif invalide pour « module »/);
  });
});

describe('unités et dimensions', () => {
  it("lit l'unité et l'axe du .dae", () => {
    expect(parseColladaAsset('<asset><unit meter="0.0254" name="inch"/><up_axis>Z_UP</up_axis></asset>')).toEqual({
      unitMeter: 0.0254,
      unitName: 'inch',
      upAxis: 'Z_UP',
    });
    expect(parseColladaAsset('<asset></asset>').unitMeter).toBe(1);
  });

  it('contrôle les dimensions en plan quelle que soit l’orientation', () => {
    const ref = { long: 5900, short: 2500 };
    expect(checkPlanDims(2500, 5900, ref, 30).ok).toBe(true);
    expect(checkPlanDims(5925, 2480, ref, 30).ok).toBe(true);
    expect(checkPlanDims(5950, 2500, ref, 30).ok).toBe(false);
  });

  it('choisit la taille standard la plus proche', () => {
    const sizes = DEFAULT_RULES.moduleSizes;
    expect(nearestSize(8395, 2502, sizes, 30).size.label).toBe('Viewbox 8400');
    expect(nearestSize(8395, 2502, sizes, 30).check.ok).toBe(true);
    expect(nearestSize(5778, 2378, sizes, 30).check.ok).toBe(false);
  });

  it("devine le facteur d'échelle d'une erreur d'unités", () => {
    expect(suspectScaleFactor(5900 / 25.4, 2500 / 25.4, DEFAULT_RULES.moduleSizes)?.factor).toBe(25.4);
    expect(suspectScaleFactor(8.4, 2.5, DEFAULT_RULES.moduleSizes)?.factor).toBe(1000);
    expect(suspectScaleFactor(5000, 2000, DEFAULT_RULES.moduleSizes)).toBeNull();
  });

  it('regroupe les modules en niveaux (tolérance 200 mm)', () => {
    expect(groupLevels([0, 120, 2800, -50, 2950, 5600])).toEqual([0, 0, 1, 0, 1, 2]);
  });
});

describe('nettoyage de la géométrie', () => {
  // Un carré (2 triangles) + la même face dos à dos + un triangle dégénéré + un doublon exact.
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0.000001, 0, 0]);
  it('supprime dégénérés, doublons et faces dos à dos, en gardant les groupes', () => {
    const index = new Uint32Array([
      0, 1, 2, 0, 2, 3, // face avant (groupe 0)
      0, 2, 1, 0, 3, 2, // face arrière dos à dos (groupe 1)
      0, 4, 1, // dégénéré (sommets 0 et 4 confondus à 0,01 près)
      0, 1, 2, // doublon exact
    ]);
    const res = cleanTriangles(positions, index, [
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 12, materialIndex: 1 },
    ], 0.01);
    expect(Array.from(res.index)).toEqual([0, 1, 2, 0, 2, 3]);
    expect(res.backToBack).toBe(2);
    expect(res.duplicate).toBe(3);
    expect(res.degenerate).toBe(1);
    expect(res.groups).toEqual([{ start: 0, count: 6, materialIndex: 0 }]);
  });

  it('accepte une géométrie non indexée', () => {
    const res = cleanTriangles(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0]), null, [], 0.01);
    expect(res.index.length).toBe(3);
    expect(res.backToBack).toBe(1);
  });
});

describe('manifest', () => {
  it('convertit les boîtes SketchUp (Z-up) en Y-up', () => {
    expect(manifestBBoxToYUp({ min: [0, 0, 0], max: [5900, 2500, 2800] })).toEqual([0, 0, -2500, 5900, 2800, 0]);
  });
  it('retrouve une boîte à 1 mm près', () => {
    const l = new BBoxLookup<string>(1);
    l.add([10, 0, 0, 20, 5, 5], 'a');
    expect(l.find([10.6, 0.4, -0.5, 20.9, 5, 5])).toBe('a');
    expect(l.find([12, 0, 0, 20, 5, 5])).toBeNull();
  });
  it('refuse un manifest sans schéma', () => {
    expect(() => parseManifest('{"modules":[]}')).toThrow(/schema/);
    expect(parseManifest('{"schema":"viewbox-manifest/1","units":"mm","modules":[]}').modules).toEqual([]);
  });
});

describe('identifiants', () => {
  it('sont stables et distincts', () => {
    expect(stableId('/SketchUp#0/VBX-01#0')).toBe(stableId('/SketchUp#0/VBX-01#0'));
    const ids = new Set(Array.from({ length: 50000 }, (_, i) => stableId('/n#' + i)));
    expect(ids.size).toBe(50000);
  });
});
