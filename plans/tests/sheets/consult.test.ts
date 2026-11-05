// Planches consultables sans le modèle 3D : clés des instantanés (stables quel que soit l'ordre des clés JSON rendu par
// le serveur, sensibles à ce qui change le dessin) et banque des vues en consultation (instantané + traits relus).
import { describe, expect, it } from 'vitest';
import { canonical, consultEnv, consultKey, paintForKey, NOT_PREPARED } from '../../src/sheets/consult';
import type { LightSource } from '../../src/sheets/consult';
import { LineworkBank } from '../../src/sheets/bank';
import { makeLightScene } from '../../src/scene/loadedScene';
import { snapshotView } from '../../src/sheets/pdf/serverJob';
import type { Linework2D } from '../../src/linework/types';
import type { ViewportItem } from '../../src/sheets/types';
import type { SceneIndex } from '../../src/core/types';
import type { Vec3 } from '../../src/core/views';

const basis = { right: [1, 0, 0] as Vec3, up: [0, 1, 0] as Vec3, toward: [0, 0, 1] as Vec3 };
const lw: Linework2D = {
  boundsMm: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  layers: [{ key: 'visible', polylines: [Float64Array.from([0, 0, 10, 10])] }],
  snapPoints: new Float64Array(),
  meta: { provider: 't', durationMs: 0, segmentCount: 1, cacheKey: '', basis, objectCount: 1 },
};
const vp = (id: string, extra: Partial<ViewportItem> = {}): ViewportItem => ({
  id,
  type: 'viewport',
  rect: { x: 0, y: 0, w: 100, h: 100 },
  scale: 50,
  showLabel: false,
  renderStyle: 'trait',
  request: { modelId: 'm', subset: { include: ['a', 'b'] }, view: { kind: 'front', frame: 'world' }, style: { glassTransparent: true } as never },
  lineworkKey: 'k1',
  ...extra,
});
const index = { source: { sha256: 'sha-model', fileName: 'x.zip' }, nodes: [], modules: [], commonIds: [] } as unknown as SceneIndex;

describe('clés des instantanés', () => {
  it('ordre des clés JSON sans effet, valeurs undefined ignorées', () => {
    expect(JSON.stringify(canonical({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: undefined } }))).toBe('{"a":{"d":[3,{"x":2,"y":1}]},"b":1}');
  });

  it('peinture : dates et auteurs ignorés, couleurs et zones comptent', async () => {
    const p = { v: 1, colors: [{ id: 'c', tag: 'P1', name: 'Gris', system: 'RAL', code: '7016', hex: '#383E42', createdAt: 'hier', createdBy: 'A' }], zones: [{ id: 'z', colorId: 'c', target: { scope: 'exterior', match: {} }, label: 'x', source: 'click', createdAt: 'hier' }], updatedAt: 'hier' };
    const q = { ...p, updatedAt: 'aujourd’hui', colors: [{ ...p.colors[0], createdAt: 'autre' }], zones: [{ ...p.zones[0], label: 'autre libellé', createdAt: 'autre' }] };
    expect(paintForKey(q)).toEqual(paintForKey(p));
    const e1 = await consultEnv({ modelKey: 'm', paint: p });
    expect(await consultEnv({ modelKey: 'm', paint: q })).toBe(e1);
    expect(await consultEnv({ modelKey: 'm', paint: { ...p, colors: [{ ...p.colors[0], hex: '#000000' }] } })).not.toBe(e1);
    expect(await consultEnv({ modelKey: 'm', paint: p, fronts: { 'VBX-01': 'back' } })).not.toBe(e1);
  });

  it('fenêtre : même clé après un aller-retour JSON réordonné, autre clé si son dessin change', async () => {
    const env = await consultEnv({ modelKey: 'm' });
    const spec = () => undefined;
    const a = vp('v1');
    const reordered = JSON.parse(JSON.stringify(canonical(a)).split('').join('')) as ViewportItem;
    expect(await consultKey(reordered, env, spec)).toBe(await consultKey(a, env, spec));
    // déplacer / redimensionner la fenêtre ne change pas son dessin
    expect(await consultKey({ ...a, rect: { x: 5, y: 5, w: 80, h: 80 }, scale: 25 }, env, spec)).toBe(await consultKey(a, env, spec));
    expect(await consultKey({ ...a, lineworkKey: 'k2' }, env, spec)).not.toBe(await consultKey(a, env, spec));
    expect(await consultKey({ ...a, paint: 'off' }, env, spec)).not.toBe(await consultKey(a, env, spec));
    expect(await consultKey({ ...a, request: { ...a.request, subset: { include: ['a'] } } }, env, spec)).not.toBe(await consultKey(a, env, spec));
    expect(await consultKey(a, await consultEnv({ modelKey: 'autre' }), spec)).not.toBe(await consultKey(a, env, spec));
  });
});

describe('banque des vues en consultation', () => {
  function lightBank(snaps: Map<string, ReturnType<typeof snapshotView>>, lws: Map<string, Linework2D>) {
    const asked: string[] = [];
    const src: LightSource = {
      key: async (v) => `snap-${v.lineworkKey}`,
      snapshot: async (k) => {
        asked.push(k);
        return snaps.get(k) ?? null;
      },
      linework: async (k) => lws.get(k) ?? null,
      has: async (k) => snaps.has(k),
    };
    const bank = new LineworkBank(makeLightScene(index), null);
    bank.light = src;
    return { bank, asked };
  }

  it('vue relue : traits, base, contours et peinture de l’instantané ; vue absente = « pas encore prête »', async () => {
    const region = { colorId: 'c', loops: [Float64Array.from([0, 0, 1, 0, 1, 1])], anchor: { x: 0.5, y: 0.5, d: 0.2 }, area: 0.5 };
    const color = { id: 'c', tag: 'P1', name: '', system: 'RAL' as const, code: '7016', hex: '#383E42', createdAt: '' };
    const snap = snapshotView({ lw, basis, overlays: [], paint: { regions: [region], colors: new Map([['c', color]]), mode: 'marks' } }, 'lw-key');
    const { bank } = lightBank(new Map([['snap-k1', snap]]), new Map([['lw-key', lw]]));
    expect(bank.data(vp('v1')).busy).toBe(true);
    const r = await bank.load(vp('v1'));
    expect(r?.lw).toBe(lw);
    const d = bank.data(vp('v1'));
    expect(d.lw).toBe(lw);
    expect(d.basis).toEqual(basis);
    expect(d.paint?.colors.get('c')?.tag).toBe('P1');
    expect(await bank.staleViewports([vp('v1')])).toEqual([]);
    expect(await bank.serverKey(vp('v1'))).toBe('lw-key');
    // sans instantané : rien n'est calculé, la fenêtre le dit
    expect(await bank.load(vp('v2', { lineworkKey: 'k2' }))).toBeNull();
    expect(bank.data(vp('v2', { lineworkKey: 'k2' })).error).toBe(NOT_PREPARED);
    // jeu à vérifier d'un coup (modèle réanalysé…) : fenêtres sans instantané comptées sans rien lire
    expect(await bank.unprepared([vp('v1'), vp('v1b'), vp('v3', { lineworkKey: 'k3' })])).toBe(1);
  });

  it('traits retirés de la mémoire : la base reste connue (PDF, cotes), l’instantané n’est pas relu', async () => {
    const snap = snapshotView({ lw, basis }, 'lw-key');
    const { bank, asked } = lightBank(new Map([['snap-k1', snap]]), new Map([['lw-key', lw]]));
    await bank.load(vp('v1'));
    bank.release([vp('v1')]);
    const d = bank.data(vp('v1'));
    expect(d.lw).toBeUndefined();
    expect(d.basis).toEqual(basis);
    expect(await bank.serverKey(vp('v1'))).toBe('lw-key');
    expect(asked).toEqual(['snap-k1']);
  });

  it('source pas encore prête : rien n’est demandé', async () => {
    const bank = new LineworkBank(makeLightScene(index), null);
    expect(await bank.load(vp('v1'))).toBeNull();
    expect(bank.data(vp('v1')).busy).toBe(true);
  });
});
