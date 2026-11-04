// Une image PNG a-t-elle de la transparence ? (les images 3D de la couverture se chevauchent : gardées en PNG ; les
// autres passent en JPEG, bien plus léger). Lecture des pixels sans canevas (serveur).
import { unzlibSync } from 'fflate';

export function pngHasTransparency(b: Uint8Array): boolean {
  if (b.length < 33 || b[0] !== 0x89 || b[1] !== 0x50) return false;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let w = 0;
  let h = 0;
  let depth = 8;
  let type = 2;
  let interlace = 0;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= b.length; ) {
    const len = dv.getUint32(i);
    const name = String.fromCharCode(b[i + 4], b[i + 5], b[i + 6], b[i + 7]);
    const data = b.subarray(i + 8, i + 8 + len);
    if (name === 'IHDR') {
      w = dv.getUint32(i + 8);
      h = dv.getUint32(i + 12);
      depth = b[i + 16];
      type = b[i + 17];
      interlace = b[i + 20];
    } else if (name === 'tRNS') return true;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    i += 12 + len;
  }
  // sans canal alpha (gris, RVB, palette sans tRNS) : opaque
  if (type !== 4 && type !== 6) return false;
  // entrelacé : on ne décode pas, gardée en PNG par prudence
  if (interlace || (depth !== 8 && depth !== 16)) return true;
  let total = 0;
  for (const c of idat) total += c.length;
  const z = new Uint8Array(total);
  let o = 0;
  for (const c of idat) {
    z.set(c, o);
    o += c.length;
  }
  let raw: Uint8Array;
  try {
    raw = unzlibSync(z);
  } catch {
    return true;
  }
  const channels = type === 6 ? 4 : 2;
  const bpp = (channels * depth) / 8;
  const stride = w * bpp;
  let prev = new Uint8Array(stride);
  let cur = new Uint8Array(stride);
  const alphaAt = bpp - depth / 8;
  for (let y = 0; y < h; y++) {
    const start = y * (stride + 1);
    if (start + stride + 1 > raw.length) return true;
    const f = raw[start];
    for (let x = 0; x < stride; x++) {
      const v = raw[start + 1 + x];
      const a = x >= bpp ? cur[x - bpp] : 0;
      const up = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let p: number;
      switch (f) {
        case 1:
          p = a;
          break;
        case 2:
          p = up;
          break;
        case 3:
          p = (a + up) >> 1;
          break;
        case 4: {
          const pa = Math.abs(up - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + up - 2 * c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
          break;
        }
        default:
          p = 0;
      }
      cur[x] = (v + p) & 0xff;
    }
    for (let x = alphaAt; x < stride; x += bpp) if (cur[x] !== 255 || (depth === 16 && cur[x + 1] !== 255)) return true;
    const t = prev;
    prev = cur;
    cur = t;
  }
  return false;
}
