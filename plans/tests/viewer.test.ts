// Finition des captures : recadrage, marge, fond blanc / transparent à partir de pixels WebGL prémultipliés.
import { describe, expect, it } from 'vitest';
import { finishCapture } from '../src/viewer/captureImage';

/** Image 10 × 8 (origine en bas à gauche) avec un carré gris opaque 3 × 2 et un pixel noir à 50 % de couverture. */
function sample(): Uint8Array {
  const w = 10;
  const px = new Uint8Array(w * 8 * 4);
  const set = (x: number, y: number, r: number, a: number) => px.set([r, r, r, a], (y * w + x) * 4);
  for (let y = 2; y < 4; y++) for (let x = 3; x < 6; x++) set(x, y, 128, 255);
  set(6, 3, 0, 128); // arête anticrénelée : noir à 50 % (prémultiplié)
  return px;
}

describe('captures', () => {
  it('recadre sur les pixels non vides, retourne l’image et ajoute la marge', () => {
    const img = finishCapture(sample(), 10, 8, 50, 'white')!;
    // contenu 4 × 2, marge = 50 % de 4 = 2 px
    expect(img.width).toBe(8);
    expect(img.height).toBe(6);
    const at = (x: number, y: number) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
    expect(at(0, 0)).toEqual([255, 255, 255, 255]); // marge blanche
    expect(at(2, 2)).toEqual([128, 128, 128, 255]);
    // la ligne y = 3 (haut dans WebGL) devient la première ligne du contenu : le pixel d'arête y est
    expect(at(5, 2)).toEqual([127, 127, 127, 255]); // noir à 50 % sur blanc = gris moyen, sans halo
  });

  it('fond transparent : couleurs non prémultipliées, alpha conservé', () => {
    const img = finishCapture(sample(), 10, 8, 0, 'transparent')!;
    expect(img.width).toBe(4);
    const edge = Array.from(img.data.slice(3 * 4, 3 * 4 + 4));
    expect(edge).toEqual([0, 0, 0, 128]);
    const empty = Array.from(img.data.slice((1 * 4 + 3) * 4, (1 * 4 + 3) * 4 + 4));
    expect(empty).toEqual([0, 0, 0, 0]);
  });

  it('capture vide → null', () => {
    expect(finishCapture(new Uint8Array(16), 2, 2, 3, 'white')).toBeNull();
  });
});
