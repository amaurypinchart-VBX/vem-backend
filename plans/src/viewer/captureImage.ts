// Finition d'une capture (fonction pure, testée) : les pixels lus dans la cible de rendu WebGL sont
// prémultipliés par l'alpha (fond transparent + anticrénelage) et à l'envers (origine en bas à gauche).
// → recadrage sur les pixels non vides, marge, composition sur fond blanc ou PNG transparent correct.

export interface FinishedImage {
  width: number;
  height: number;
  /** RGBA non prémultiplié, origine en haut à gauche */
  data: Uint8ClampedArray;
}

export function finishCapture(pixels: Uint8Array, w: number, h: number, marginPct: number, background: 'white' | 'transparent'): FinishedImage | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (pixels[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const margin = Math.round((Math.max(cw, ch) * marginPct) / 100);
  const width = cw + 2 * margin;
  const height = ch + 2 * margin;
  const data = new Uint8ClampedArray(width * height * 4);
  if (background === 'white') data.fill(255);
  for (let y = 0; y < ch; y++) {
    const srcRow = (y0 + (ch - 1 - y)) * w; // retournement vertical
    const dstRow = (y + margin) * width + margin;
    for (let x = 0; x < cw; x++) {
      const s = (srcRow + x0 + x) * 4;
      const d = (dstRow + x) * 4;
      const a = pixels[s + 3];
      if (background === 'white') {
        // composition « prémultiplié sur blanc » : c + 255 × (1 − α)
        const k = 255 - a;
        data[d] = pixels[s] + k;
        data[d + 1] = pixels[s + 1] + k;
        data[d + 2] = pixels[s + 2] + k;
        data[d + 3] = 255;
      } else if (a > 0) {
        // PNG transparent : couleurs non prémultipliées
        const f = 255 / a;
        data[d] = pixels[s] * f;
        data[d + 1] = pixels[s + 1] * f;
        data[d + 2] = pixels[s + 2] * f;
        data[d + 3] = a;
      }
    }
  }
  return { width, height, data };
}
