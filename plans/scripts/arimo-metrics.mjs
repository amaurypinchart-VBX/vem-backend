// Largeurs des caractères d'Arimo (métriques d'Arial) pour la mise en page du rapport de l'étude structure :
// lit les tables cmap (format 4) et hmtx des TTF de sheets/pdf/fonts et écrit src/structure/report/metrics.data.ts.
// Usage : node scripts/arimo-metrics.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RANGES = [
  [0x20, 0x7e],
  [0xa0, 0x17f],
  [0x300, 0x36f],
  [0x370, 0x3ff],
  [0x2000, 0x206f],
  [0x2070, 0x209f],
  [0x2190, 0x21ff],
  [0x2200, 0x22ff],
];

function tables(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = {};
  for (let i = 0; i < dv.getUint16(4); i++) {
    const tag = String.fromCharCode(...buf.subarray(12 + i * 16, 16 + i * 16));
    out[tag] = dv.getUint32(12 + i * 16 + 8);
  }
  return { dv, t: out };
}

function widths(file) {
  const buf = fs.readFileSync(file);
  const { dv, t } = tables(buf);
  const upm = dv.getUint16(t.head + 18);
  const nh = dv.getUint16(t.hhea + 34);
  const adv = (g) => dv.getUint16(t.hmtx + 4 * Math.min(g, nh - 1));
  // cmap format 4 (Windows Unicode BMP)
  let st = -1;
  for (let i = 0; i < dv.getUint16(t.cmap + 2); i++) {
    const pid = dv.getUint16(t.cmap + 4 + i * 8);
    const eid = dv.getUint16(t.cmap + 6 + i * 8);
    const off = dv.getUint32(t.cmap + 8 + i * 8);
    if (pid === 3 && eid === 1 && dv.getUint16(t.cmap + off) === 4) st = t.cmap + off;
  }
  if (st < 0) throw new Error('cmap format 4 introuvable');
  const segX2 = dv.getUint16(st + 6);
  const ends = st + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  const glyph = (c) => {
    for (let s = 0; s < segX2 / 2; s++) {
      const end = dv.getUint16(ends + 2 * s);
      if (c > end) continue;
      const start = dv.getUint16(starts + 2 * s);
      if (c < start) return 0;
      const delta = dv.getInt16(deltas + 2 * s);
      const ro = dv.getUint16(ranges + 2 * s);
      if (!ro) return (c + delta) & 0xffff;
      const g = dv.getUint16(ranges + 2 * s + ro + 2 * (c - start));
      return g ? (g + delta) & 0xffff : 0;
    }
    return 0;
  };
  const out = [];
  for (const [a, b] of RANGES)
    for (let c = a; c <= b; c++) {
      const g = glyph(c);
      if (g) out.push([c, Math.round((adv(g) / upm) * 1000)]);
    }
  return out;
}

const fonts = path.join(root, 'src/sheets/pdf/fonts');
const enc = (list) => list.map(([c, w]) => `${c.toString(36)}:${w.toString(36)}`).join(',');
const body = `// Généré par scripts/arimo-metrics.mjs (ne pas modifier) : largeur d'avance des caractères d'Arimo en millièmes de
// corps, « code point : largeur » en base 36.
export const ARIMO_REGULAR = '${enc(widths(path.join(fonts, 'Arimo-Regular.ttf')))}';
export const ARIMO_BOLD = '${enc(widths(path.join(fonts, 'Arimo-Bold.ttf')))}';
`;
fs.writeFileSync(path.join(root, 'src/structure/report/metrics.data.ts'), body);
console.log('metrics.data.ts', body.length, 'octets');
