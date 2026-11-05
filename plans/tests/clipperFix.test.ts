// Correctif de clipper2-js (core/clipperFix.ts) : points d'intersection copiés (le portage JS rendait le sommet d'entrée
// lui-même puis le déplaçait — contours abîmés, boucle sans fin sur le Xiaomi), boucle « même hauteur » bornée.
import { describe, expect, it } from 'vitest';
import { ClipperBase, InternalClipper, Point64 } from 'clipper2-js';
import { ClipperLoopError } from '../src/core/clipperFix';

describe('correctif clipper2-js', () => {
  it('intersection au bout d’un segment : une copie du point, jamais le sommet lui-même', () => {
    const a = new Point64(0, 0);
    const b = new Point64(10, 10);
    const c = new Point64(0, 0);
    const d = new Point64(10, -10);
    const r = (InternalClipper as unknown as { getIntersectPt: (...p: Point64[]) => { ip: Point64 } }).getIntersectPt(a, b, c, d);
    expect(r.ip).not.toBe(a);
    expect(r.ip).not.toBe(b);
    expect([r.ip.x, r.ip.y]).toEqual([0, 0]);
    r.ip.y = 5;
    expect(a.y).toBe(0);
  });

  it('contour entièrement plat : exception au lieu d’une boucle sans fin', () => {
    type V = { pt: { x: number; y: number }; next: V; prev: V; flags: number };
    const vs: V[] = [0, 1, 2].map((i) => ({ pt: { x: i * 10, y: 5 }, flags: 0 }) as V);
    vs.forEach((v, i) => {
      v.next = vs[(i + 1) % 3];
      v.prev = vs[(i + 2) % 3];
    });
    const getMax = (ClipperBase as unknown as { getCurrYMaximaVertex: (ae: unknown) => unknown }).getCurrYMaximaVertex;
    expect(() => getMax({ vertexTop: vs[0], windDx: 1 })).toThrow(ClipperLoopError);
    expect(() => getMax({ vertexTop: vs[0], windDx: -1 })).toThrow(ClipperLoopError);
  });
});
