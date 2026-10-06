// Reconnaissance géométrique d'une pièce de liaison (S11c) sur des maillages synthétiques : plaque simple, plaque
// trouée (Ø 22, pinces), U plié, clamp à 2 mâchoires, cornière soudée ; tolérances 1 mm / 1 %.
import { describe, expect, it } from 'vitest';
import { BufferGeometry, ExtrudeGeometry, Matrix4, Path, Shape } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { plateText, recognizePart } from '../../src/structure/core/jointRecognition';

/** Plaque L × W, épaisseur t (extrudée selon z), trous [x, y, d] ; positions à plat (non indexées). */
function plateGeom(L: number, W: number, t: number, holes: Array<[number, number, number]> = [], m?: Matrix4): BufferGeometry {
  const s = new Shape();
  s.moveTo(0, 0);
  s.lineTo(L, 0);
  s.lineTo(L, W);
  s.lineTo(0, W);
  s.lineTo(0, 0);
  for (const [x, y, d] of holes) {
    const h = new Path();
    h.absarc(x, y, d / 2, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const g = new ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 24 }).toNonIndexed();
  if (m) g.applyMatrix4(m);
  return g;
}
const flat = (gs: BufferGeometry[]) => (gs.length === 1 ? gs[0] : mergeGeometries(gs.map((g) => g.toNonIndexed()))).getAttribute('position').array as Float32Array;

describe('reconnaissance d’une pièce dessinée', () => {
  it('plat d’empilement 400 × 100 × 10 avec un trou Ø 22 à 55 mm du bout : épaisseur, dimensions, trou, pinces', () => {
    const r = recognizePart(flat([plateGeom(400, 100, 10, [[55, 50, 22]])]));
    expect(r.plates).toHaveLength(1);
    const p = r.plates[0];
    expect(p.t).toBeCloseTo(10, 1);
    expect(p.length).toBeCloseTo(400, 0);
    expect(p.width).toBeCloseTo(100, 0);
    expect(p.holes).toHaveLength(1);
    // polygone à 24 côtés inscrit : diamètre à 1 % près
    expect(Math.abs(p.holes[0].d - 22) / 22).toBeLessThan(0.01);
    expect(Math.min(...p.holes[0].edge)).toBeCloseTo(50, 0);
    expect(Math.max(...p.holes[0].edge)).toBeCloseTo(55, 0);
    expect(plateText(p)).toMatch(/^plaque 10 mm, 400 × 100 mm, 1 trou\(s\) Ø 22/);
    expect(r.junctions).toEqual([]);
    expect(r.questions.join(' ')).toMatch(/boulons/);
  });

  it('cornière soudée (deux plaques 15 mm à 90°) : 2 plaques et une jonction à souder', () => {
    const a = plateGeom(120, 80, 15);
    const b = plateGeom(120, 80, 15, [], new Matrix4().makeRotationX(-Math.PI / 2));
    const r = recognizePart(flat([a, b]));
    expect(r.plates).toHaveLength(2);
    expect(r.plates.every((p) => Math.abs(p.t - 15) < 0.5)).toBe(true);
    expect(r.junctions).toHaveLength(1);
    expect(r.junctions[0].angle).toBe(90);
    expect(r.junctions[0].kind).toBe('weld');
    expect(r.questions.join(' ')).toMatch(/soudures : gorge a et longueur/);
  });

  it('clamp à 2 mâchoires (deux plaques parallèles 12 mm, 20 mm d’écart) : 2 plaques, pas de jonction', () => {
    const a = plateGeom(150, 60, 12, [[75, 30, 18]]);
    const b = plateGeom(150, 60, 12, [[75, 30, 18]], new Matrix4().makeTranslation(0, 0, 32));
    const r = recognizePart(flat([a, b]));
    expect(r.plates).toHaveLength(2);
    expect(r.plates.map((p) => p.t)).toEqual([12, 12]);
    expect(r.plates.every((p) => p.holes.length === 1 && Math.abs(p.holes[0].d - 18) < 0.3)).toBe(true);
    expect(r.junctions).toEqual([]);
  });

  it('équerre pliée (8 mm, rayon intérieur 12 mm) : 2 plaques et un pli', () => {
    // profil en L arrondi (plan xy) extrudé de 60 mm selon z
    const t = 8;
    const ri = 12;
    const s = new Shape();
    s.moveTo(0, ri + t + 100);
    s.lineTo(0, ri + t);
    s.absarc(ri + t, ri + t, ri + t, Math.PI, 1.5 * Math.PI, false);
    s.lineTo(ri + t + 80, 0);
    s.lineTo(ri + t + 80, t);
    s.lineTo(ri + t, t);
    s.absarc(ri + t, ri + t, ri, 1.5 * Math.PI, Math.PI, true);
    s.lineTo(t, ri + t + 100);
    s.lineTo(0, ri + t + 100);
    const g = new ExtrudeGeometry(s, { depth: 60, bevelEnabled: false, curveSegments: 12 }).toNonIndexed();
    const r = recognizePart(g.getAttribute('position').array as Float32Array);
    expect(r.plates).toHaveLength(2);
    expect(r.plates.every((p) => Math.abs(p.t - 8) < 0.5)).toBe(true);
    expect(r.junctions).toHaveLength(1);
    expect(r.junctions[0].kind).toBe('bend');
    expect(r.junctions[0].angle).toBe(90);
  });

  it('plaque massive (60 mm) : pas une plaque, signalé', () => {
    const r = recognizePart(flat([plateGeom(100, 100, 60)]));
    expect(r.plates).toEqual([]);
    expect(r.notes.join(' ')).toMatch(/aucune plaque reconnue/);
  });
});
