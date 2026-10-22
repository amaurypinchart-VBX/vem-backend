// Journal des fermetures (téléphone) : une étape notée et jamais effacée = la page s'est fermée pendant cette étape.
import { describe, expect, it } from 'vitest';
import { clearStep, markStep, takeLastCrash } from '../src/ui/crashLog';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage ??= {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

describe('journal des fermetures', () => {
  it('étape restée notée → signalée une fois ; effacée → rien ; trop ancienne → rien', () => {
    markStep('Calcul des vues de la planche A1.2');
    expect(takeLastCrash()?.label).toBe('Calcul des vues de la planche A1.2');
    expect(takeLastCrash()).toBeNull();
    markStep('Lecture du modèle 3D');
    clearStep();
    expect(takeLastCrash()).toBeNull();
    markStep('Export PDF');
    expect(takeLastCrash(Date.now() + 31 * 60 * 1000)).toBeNull();
  });
});
