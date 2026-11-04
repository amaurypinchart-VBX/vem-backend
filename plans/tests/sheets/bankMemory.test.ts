// Budget mémoire de la banque de vues (très gros modèles : l'onglet fermé par le navigateur quand il dépasse sa
// mémoire). Les vues les moins récemment utilisées partent d'abord, jamais une vue utilisée il y a moins de 5 s.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LineworkBank } from '../../src/sheets/bank';
import { lineworkBytes, registerReleaser, relieveMemory } from '../../src/linework/memory';
import type { Linework2D } from '../../src/linework/types';
import type { ViewportItem } from '../../src/sheets/types';

/** vue de `n` segments */
const lw = (n: number): Linework2D => ({
  boundsMm: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  layers: [{ key: 'visible', polylines: Array.from({ length: n }, () => new Float64Array(4)) }],
  snapPoints: new Float64Array(),
  meta: { provider: 't', durationMs: 0, segmentCount: n, cacheKey: '', basis: { right: [1, 0, 0], up: [0, 1, 0], toward: [0, 0, 1] }, objectCount: 1 },
});

const fakeScene = { frames: new Map(), index: { modules: [] } } as never;
const vp = (id: string): ViewportItem => ({
  id,
  type: 'viewport',
  rect: { x: 0, y: 0, w: 10, h: 10 },
  scale: 50,
  showLabel: false,
  renderStyle: 'trait',
  request: { modelId: id, subset: { include: [] }, view: { kind: 'top', frame: 'world' }, style: {} as never },
});

function bankOf(sizes: Record<string, number>) {
  const provider = {
    cacheKey: async (req: { modelId: string }) => `k-${req.modelId}`,
    getLinework: async (req: { modelId: string }) => lw(sizes[req.modelId]),
  };
  return new LineworkBank(fakeScene, provider as never);
}

afterEach(() => vi.useRealTimers());

describe('banque de vues : budget mémoire', () => {
  it('au-delà du budget, la vue la moins récemment utilisée part ; une vue utilisée il y a moins de 5 s reste', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const per = lineworkBytes(lw(1000));
    const bank = bankOf({ a: 1000, b: 1000, c: 1000 });
    bank.maxBytes = per * 2.5;
    const [a, b, c] = [vp('a'), vp('b'), vp('c')];
    await bank.load(a);
    vi.advanceTimersByTime(10_000);
    await bank.load(b);
    vi.advanceTimersByTime(10_000);
    bank.data(b); // b affichée
    await bank.load(c);
    // a, la plus ancienne et inutilisée depuis 20 s, a quitté la mémoire ; b (affichée) et c restent
    expect(bank.data(a).lw).toBeUndefined();
    expect(bank.data(b).lw).toBeDefined();
    expect(bank.data(c).lw).toBeDefined();
    expect(bank.memoryUse()).toEqual({ bytes: per * 2, views: 2 });
    // relue au besoin
    expect((await bank.load(a))?.lw).toBeDefined();
  });

  it('vues toutes en usage : rien n’est retiré, même au-delà du budget (la planche affichée reste dessinée)', async () => {
    const bank = bankOf({ a: 1000, b: 1000 });
    bank.maxBytes = 1;
    await bank.load(vp('a'));
    await bank.load(vp('b'));
    expect(bank.memoryUse().views).toBe(2);
  });

  it('export : release() retire les vues d’une page écrite, sauf celles de la planche affichée', async () => {
    const bank = bankOf({ a: 10, b: 10 });
    const [a, b] = [vp('a'), vp('b')];
    await bank.load(a);
    await bank.load(b);
    bank.release([a, b], [b]);
    expect(bank.data(a).lw).toBeUndefined();
    expect(bank.data(b).lw).toBeDefined();
  });

  it('mémoire pleine : « trim » garde les vues en usage, « all » vide tout ; dispose() désinscrit la banque', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const bank = bankOf({ a: 10, b: 10 });
    await bank.load(vp('a'));
    vi.advanceTimersByTime(10_000);
    await bank.load(vp('b'));
    relieveMemory('trim');
    expect(bank.memoryUse().views).toBe(1);
    relieveMemory('all');
    expect(bank.memoryUse().views).toBe(0);
    await bank.load(vp('a'));
    bank.dispose();
    expect(bank.memoryUse().views).toBe(0);
  });

  it('un cache qui échoue en libérant n’empêche pas les autres', () => {
    let called = 0;
    const off1 = registerReleaser('casse', () => {
      throw new Error('x');
    });
    const off2 = registerReleaser('ok', () => called++);
    relieveMemory('all');
    expect(called).toBe(1);
    off1();
    off2();
  });
});
