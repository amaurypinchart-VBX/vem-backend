// S12.5 — relevé des barres dessinées : coupe d'un maillage extrudé (UPN sur chant puis à plat, IPE, tube, plein),
// forme et dimensions, rapprochement du catalogue, axe d'une barre, séparation des solides.
import { describe, expect, it } from 'vitest';
import type { Pt, V3 } from '../../src/structure/core/sectionDetect';
import { barAxis, catalogueCandidates, components, measuredSectionEntry, memberSection, sectionHintFromName } from '../../src/structure/core/sectionDetect';
import { iContour, upnContour } from '../../src/structure/core/sectionGeometry';

/** Extrusion d'un contour (y, z de la coupe) le long de `dir` depuis `origin`, côtés seulement (+ trous). */
export function extrude(loops: Pt[][], origin: V3, dir: V3, y: V3, z: V3, L: number): Float32Array {
  const out: number[] = [];
  const P = (p: Pt, s: number): number[] => [0, 1, 2].map((k) => origin[k] + y[k] * p[0] + z[k] * p[1] + dir[k] * s);
  for (const loop of loops)
    for (let i = 0; i < loop.length; i++) {
      const [a, b] = [loop[i], loop[(i + 1) % loop.length]];
      out.push(...P(a, 0), ...P(b, 0), ...P(b, L), ...P(a, 0), ...P(b, L), ...P(a, L));
    }
  // bouchons (sans effet sur la coupe à mi-longueur) : éventail, ou anneau entre contour et trou de même nombre de
  // sommets (tube) pour que le solide reste d'un seul tenant
  for (const s of [0, L]) {
    const o = loops[0];
    const h = loops[1] ? [...loops[1]].reverse() : null;
    if (h && h.length === o.length)
      for (let i = 0; i < o.length; i++) {
        const j = (i + 1) % o.length;
        out.push(...P(o[i], s), ...P(o[j], s), ...P(h[j], s), ...P(o[i], s), ...P(h[j], s), ...P(h[i], s));
      }
    else for (let i = 1; i + 1 < o.length; i++) out.push(...P(o[0], s), ...P(o[i], s), ...P(o[i + 1], s));
  }
  return Float32Array.from(out);
}
const rect = (w: number, h: number, cy = 0, cz = 0): Pt[] => [
  [cy - w / 2, cz - h / 2],
  [cy + w / 2, cz - h / 2],
  [cy + w / 2, cz + h / 2],
  [cy - w / 2, cz + h / 2],
];
const U: V3 = [1, 0, 0];
const V: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];

describe('S12.5 — coupe et forme des barres', () => {
  it('UPN 200 sur chant le long de u : U 200 × 75, âme 8,5, catalogue UPN 200, rotation nulle', () => {
    const c = upnContour(200, 75, 8.5, 11.5);
    // y de la coupe = −v (Z × U), z = haut
    const pos = extrude([c], [0, 500, 1000], U, [0, -1, 0], Z, 3000);
    const m = memberSection(pos);
    expect(m.axis.length).toBeCloseTo(3000, 3);
    expect(m.axis.elongated).toBe(true);
    const s = m.section!;
    expect(s.shape).toBe('U');
    expect(s.webAlong).toBe('z');
    expect(s.dims.h).toBeCloseTo(200, 0);
    expect(s.dims.b).toBeCloseTo(75, 0);
    expect(s.dims.tw!).toBeCloseTo(8.5, 0);
    expect(m.variable).toBe(false);
    const cand = catalogueCandidates(s);
    expect(cand[0].entry.key).toBe('CAT-UPN200');
    expect(cand[0].match).toBe(true);
    expect(cand[0].roll).toBe(0);
    // propriétés du contour réel ≈ catalogue
    expect(s.props.A / cand[0].entry.section.A).toBeCloseTo(1, 2);
    expect(s.props.Iy / cand[0].entry.section.Iy).toBeCloseTo(1, 2);
  });

  it('UPN 200 posé à plat : âme horizontale, rotation de 90°', () => {
    const c = upnContour(200, 75, 8.5, 11.5).map(([y, z]) => [z, y] as Pt);
    const s = memberSection(extrude([c], [0, 0, 0], U, [0, -1, 0], Z, 2000)).section!;
    expect(s.shape).toBe('U');
    expect(s.webAlong).toBe('y');
    const cand = catalogueCandidates(s);
    expect(cand[0].entry.key).toBe('CAT-UPN200');
    expect(cand[0].roll).toBeCloseTo(Math.PI / 2, 9);
  });

  it('IPE 200 le long de v, tube 100 × 50 × 3, plein 50 × 100, poteau vertical', () => {
    const ipe = memberSection(extrude([iContour(200, 100, 5.6, 8.5, 12)], [0, 0, 0], V, U, Z, 2400)).section!;
    expect(ipe.shape).toBe('I');
    expect(catalogueCandidates(ipe)[0].entry.key).toBe('CAT-IPE200');
    const tube = memberSection(extrude([rect(50, 100), [...rect(44, 94)].reverse()], [0, 0, 0], V, U, Z, 2400)).section!;
    expect(tube.shape).toBe('tube-rect');
    expect(tube.dims).toMatchObject({ h: expect.closeTo(100, 1), b: expect.closeTo(50, 1), t: expect.closeTo(3, 1) });
    const solid = memberSection(extrude([rect(50, 100)], [0, 0, 0], V, U, Z, 2400)).section!;
    expect(solid.shape).toBe('solid-rect');
    expect(solid.props.A).toBeCloseTo(5000, 0);
    const col = memberSection(extrude([rect(100, 100), [...rect(90, 90)].reverse()], [0, 0, 0], Z, U, V, 2790));
    expect(Math.abs(col.axis.dir[2])).toBeCloseTo(1, 9);
    expect(col.section!.shape).toBe('tube-rect');
    const e = measuredSectionEntry(tube, { file: 'test.zip', date: '07.10.2026' });
    expect(e.key).toMatch(/^SEC-SKP-/);
    expect(e.status).toBe('suggested');
  });

  it('solides séparés, axe d’une pièce non allongée, indices de nom', () => {
    const a = extrude([rect(50, 100)], [0, 0, 0], U, [0, -1, 0], Z, 1000);
    const b = extrude([rect(50, 100)], [0, 500, 0], U, [0, -1, 0], Z, 1000);
    expect(components(Float32Array.from([...a, ...b]))).toHaveLength(2);
    const plate = barAxis(extrude([rect(130, 10)], [0, 0, 0], U, [0, -1, 0], Z, 130));
    expect(plate.elongated).toBe(false);
    expect(sectionHintFromName('C Bended steel 60x90x60x3')).toMatchObject({ shape: 'U', h: 90, b: 60, t: 3 });
    expect(sectionHintFromName('UPN 200')).toMatchObject({ family: 'UPN', h: 200 });
    expect(sectionHintFromName('RHS 120x60x4')).toMatchObject({ shape: 'tube-rect', h: 120, b: 60, t: 4 });
  });
});
