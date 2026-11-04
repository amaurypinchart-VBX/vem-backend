// Encodeur PNG (RVBA 8 bits, non prémultiplié) en pur TypeScript, sans canvas : utilisé dans un Worker pour les
// images 3D des planches. canvas.toBlob attendait la carte graphique sur le fil principal (gros modèle : ≈ 8 s figées
// par image, « Page ne répondant pas »).
import { zlibSync } from 'fflate';

let CRC: Uint32Array | null = null;
function crc32(buf: Uint8Array, start: number, end: number): number {
  if (!CRC) {
    CRC = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
  return out;
}

/** PNG RVBA de `w` × `h` pixels (lignes de haut en bas). Filtre « Up » : bien plus compact sur les rendus 3D. */
export function encodePng(rgba: Uint8Array | Uint8ClampedArray, w: number, h: number, level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 = 6): Uint8Array {
  if (rgba.length !== w * h * 4) throw new Error('encodePng : taille des pixels incohérente');
  const stride = w * 4;
  const raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    const p = y * stride;
    if (y === 0) {
      raw[o] = 0;
      raw.set(rgba.subarray(p, p + stride), o + 1);
    } else {
      raw[o] = 2;
      for (let i = 0; i < stride; i++) raw[o + 1 + i] = (rgba[p + i] - rgba[p - stride + i]) & 0xff;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bits par composante
  ihdr[9] = 6; // RVBA
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw, { level })), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of parts) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}
