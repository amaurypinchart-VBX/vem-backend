// Escalier contre le bout d'une rangée de Viewbox (Xiaomi Paris 2026) : le palier est porté par la Viewbox du bout
// de la rangée qui reçoit ses deux attaches, pas par la première Viewbox qui touche l'escalier.
import { describe, expect, it } from 'vitest';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import { checkStackShear, connectionSet } from '../../src/structure/core/checks/joints';
import { SEED, STAIR_KITS } from '../../src/structure/library/seed';
import { placeStair } from '../../src/structure/scene/studyModel';
import { vbx } from './studyHelpers';

describe('escalier le long d’une rangée de Viewbox', () => {
  // 4 Viewbox côte à côte selon y (grands côtés l'un contre l'autre), 4 dessus ; escalier contre les petits côtés
  // x = 5,9 m, palier au bout y = 10 m, volée vers y = 3,3 m
  const modules = [0, 2.5, 5, 7.5].flatMap((y, k) => [vbx(`VBX-0${k + 1}`, 0, y), vbx(`VBX-1${k + 1}`, 0, y, 1)]);
  const box = [5891.4, -54, -10090.8, 7469.4, 4322.5, -3312.6];

  it('palier attaché aux perçages du petit côté de la Viewbox du bout, calcul assemblé sans erreur', () => {
    const r = placeStair(box, 'ESC-1', 'Escalier', modules, STAIR_KITS[0], () => ({ low: 2800, high: 600 }));
    expect(r.reason).toBeUndefined();
    expect(r.stair).toMatchObject({ module: 'VBX-14', side: 'u1', level: 'floor', run: [0, 0, 1], landingEnd: -10090.8 });
    const s = assembleStructure(modules, { sections: sectionMap(SEED), jacks: false, middleFeet: false, upliftReleases: 'all', calibration: false, stairs: [r.stair!] });
    expect(s.errors).toEqual([]);
    expect(s.warnings.filter((w) => /perçage/.test(w))).toEqual([]);
    const links = s.stairs[0].links.map((k) => s.fem.nodes[s.fem.members[k].j]);
    expect(links.map((n) => Math.round(n.z)).sort((a, b) => a - b)).toEqual([-9790, -7710]);
  });

  it('glissement d’une Viewbox empilée au milieu de la rangée : la direction sans plat est reprise par le frottement', () => {
    const c = connectionSet(SEED);
    const middle = { u0: true, u1: true, v0: false, v1: false };
    // μ = 0,1 → 2 kN de frottement ; Hv 0,5 kN entièrement au frottement, le reste de Hu aux 2 plats des petits côtés
    const r = checkStackShear(c, { Hu: 10e3, Hv: 0.5e3, C: 20e3 }, middle, 'S');
    expect(r.eta).toBeCloseTo((10 - Math.sqrt(4 - 0.25)) / (2 * 5.81), 3);
    expect(r.parts.Hv).toBe(0);
    // Hv plus grand que le frottement : rien ne le retient
    expect(checkStackShear(c, { Hu: 10e3, Hv: 3e3, C: 20e3 }, middle, 'S').eta).toBe(Infinity);
  });
});
