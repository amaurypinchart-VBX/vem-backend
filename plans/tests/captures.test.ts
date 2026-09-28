// Captures de la vue 3D proposées dans les planches : adresses Cloudinary, images du jeu, cadre d'une image ajoutée.
import { describe, expect, it } from 'vitest';
import { attachmentUrl, thumbUrl } from '../src/api/cloudinary';
import { insertRect, otherImagesOfSet } from '../src/sheets/images';
import type { DrawingSet } from '../src/sheets/types';

const CLD = 'https://res.cloudinary.com/demo/image/upload/v1727/plans/p1/sheets/abc.png';

describe('adresses Cloudinary', () => {
  it('vignette et téléchargement : transformation insérée après /upload/', () => {
    expect(thumbUrl(CLD, 260)).toBe('https://res.cloudinary.com/demo/image/upload/c_limit,w_260/v1727/plans/p1/sheets/abc.png');
    expect(attachmentUrl(CLD)).toBe('https://res.cloudinary.com/demo/image/upload/fl_attachment/v1727/plans/p1/sheets/abc.png');
  });
  it('autres adresses inchangées (image locale, fichier brut, faux serveur)', () => {
    for (const u of ['blob:http://localhost/1234', '/blob/img-1', 'https://res.cloudinary.com/demo/raw/upload/v1/x.glb.gz'])
      expect(thumbUrl(u, 200)).toBe(u);
  });
});

describe('images du jeu', () => {
  const doc = {
    sheets: [
      { number: 'A0.1', items: [{ id: 'a', type: 'image3d', rect: { x: 0, y: 0, w: 10, h: 10 }, url: 'u1', width: 2400, height: 1800, label: '3D' }] },
      {
        number: 'A0.2',
        items: [
          { id: 'b', type: 'image3d', rect: { x: 0, y: 0, w: 10, h: 10 }, url: 'u2', width: 100, height: 50 },
          { id: 'c', type: 'image3d', rect: { x: 0, y: 0, w: 10, h: 10 }, url: 'u1', width: 2400, height: 1800 },
          { id: 'd', type: 'image3d', rect: { x: 0, y: 0, w: 10, h: 10 }, url: '', width: 0, height: 0 },
        ],
      },
    ],
  } as unknown as DrawingSet;
  it('une entrée par image, sans les captures déjà listées ni les images vides', () => {
    const others = otherImagesOfSet(doc, [{ id: 'k', url: 'u2', name: 'x', width: 1, height: 1, createdAt: '' }]);
    expect(others).toEqual([{ url: 'u1', name: 'A0.1 · 3D', width: 2400, height: 1800 }]);
  });
});

describe('cadre d’une image ajoutée', () => {
  it('garde les proportions de l’image dans 250 × 180 mm (A1), réduit en A3', () => {
    expect(insertRect({ width: 4000, height: 2000 })).toEqual({ x: 30, y: 60, w: 250, h: 125 });
    const tall = insertRect({ width: 1000, height: 2000 });
    expect(tall.h).toBe(180);
    expect(tall.w).toBeCloseTo(90);
    const a3 = insertRect({ width: 4000, height: 2000 }, 0.5);
    expect(a3).toEqual({ x: 15, y: 30, w: 125, h: 62.5 });
  });
});
