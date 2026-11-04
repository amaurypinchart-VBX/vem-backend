import { describe, expect, it } from 'vitest';
import { unzlibSync } from 'fflate';
import { encodePng } from '../src/viewer/pngEncode';

/** relit un PNG produit par encodePng (un seul IDAT, filtres 0 / 2) */
function decode(png: Uint8Array): { w: number; h: number; data: Uint8Array; types: string[] } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let o = 8;
  let w = 0;
  let h = 0;
  let idat: Uint8Array | null = null;
  const types: string[] = [];
  while (o < png.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(...png.subarray(o + 4, o + 8));
    types.push(type);
    const body = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = new DataView(body.buffer, body.byteOffset).getUint32(0);
      h = new DataView(body.buffer, body.byteOffset).getUint32(4);
    }
    if (type === 'IDAT') idat = body;
    o += 12 + len;
  }
  const raw = unzlibSync(idat!);
  const stride = w * 4;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      data[y * stride + i] = f === 2 && y > 0 ? (v + data[(y - 1) * stride + i]) & 0xff : v;
    }
  }
  return { w, h, data, types };
}

describe('encodePng (images 3D des planches, hors canvas)', () => {
  it('donne un PNG valide qui redonne exactement les pixels', () => {
    const w = 37;
    const h = 23;
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < px.length; i++) px[i] = (i * 7919) % 256;
    const png = encodePng(px, w, h);
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const d = decode(png);
    expect(d.types).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect([d.w, d.h]).toEqual([w, h]);
    expect([...d.data]).toEqual([...px]);
    // CRC du bloc IEND : valeur fixe de la norme PNG
    expect([...png.subarray(png.length - 4)]).toEqual([0xae, 0x42, 0x60, 0x82]);
  });
  it('refuse des pixels de mauvaise taille', () => {
    expect(() => encodePng(new Uint8Array(10), 2, 2)).toThrow();
  });
});
