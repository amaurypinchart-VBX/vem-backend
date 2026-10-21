// Remise des fichiers (PDF / DXF) : ordinateur = téléchargement direct, téléphone = écran « PDF prêt » ; taille estimée,
// jeu trop lourd pour un téléphone, taille lisible.
import { describe, expect, it } from 'vitest';
import { PROJECT_FILE_MAX, deliveryPlan, estimatePdfMb, formatSize, tooHeavyForPhone } from '../src/ui/deliver';

describe('remise des fichiers', () => {
  it('ordinateur : téléchargement ; doigt : écran « prêt »', () => {
    expect(deliveryPlan({ isTouch: false })).toBe('download');
    expect(deliveryPlan({ isTouch: true })).toBe('ready-screen');
  });
  it('estimation et seuils', () => {
    expect(estimatePdfMb(10, 4, true)).toBeCloseTo(10);
    expect(tooHeavyForPhone(26, 5)).toBe(true);
    expect(tooHeavyForPhone(10, 41)).toBe(true);
    expect(tooHeavyForPhone(10, 12)).toBe(false);
    expect(PROJECT_FILE_MAX).toBe(10 * 1024 * 1024);
  });
  it('taille lisible', () => {
    expect(formatSize(12.4 * 1024 * 1024)).toBe('12,4 Mo');
    expect(formatSize(300 * 1024)).toBe('300 ko');
  });
});
