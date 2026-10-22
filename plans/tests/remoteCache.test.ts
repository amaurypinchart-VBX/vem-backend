// Vues partagées par le serveur : encodage exact (aller-retour bit à bit), le fournisseur lit une vue partagée au lieu
// de calculer, envoie ce qu'il calcule, et refuse sur téléphone une vue trop lourde absente des caches.
import { describe, expect, it } from 'vitest';
import { ingest } from '../src/ingest/pipeline';
import { inlineRunner } from '../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../src/core/classification';
import { subsetAll } from '../src/core/subset';
import { makeLoadedScene } from '../src/scene/loadedScene';
import { makeGlassTest } from '../src/linework/packets';
import { BrowserHlrProvider, HEAVY_VIEW } from '../src/linework/provider';
import type { ProviderOptions } from '../src/linework/provider';
import { createInlineRunner } from '../src/linework/runner';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import type { Linework2D, LineworkRequest } from '../src/linework/types';
import { decodeLinework, encodeLinework, serverLineworkCache } from '../src/linework/remoteCache';
import { makeSketchupDae } from './fixtures/sketchupDae';

async function scene() {
  const dae = makeSketchupDae({ twoSided: false });
  const res = await ingest({ fileName: 'r.dae', data: new TextEncoder().encode(dae).buffer as ArrayBuffer, sha256: 'r', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  return makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'r');
}

function provider(s: Awaited<ReturnType<typeof scene>>, extra: Partial<ProviderOptions> = {}) {
  return new BrowserHlrProvider(s, { runner: createInlineRunner(), glassTest: makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial), categoryColors: () => ({}), noCache: false, ...extra });
}

const flat = (lw: Linework2D) => JSON.stringify(lw, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Float64Array) : v));

describe('vues partagées', () => {
  it('encodage : aller-retour identique, tableaux typés gardés', async () => {
    const s = await scene();
    const req: LineworkRequest = { modelId: 'r', subset: { include: subsetAll(s.index) }, view: { kind: 'front', frame: 'world' }, style: DEFAULT_LINE_STYLE } as LineworkRequest;
    const lw = await provider(s, { noCache: true }).getLinework(req);
    const back = decodeLinework(encodeLinework(lw));
    expect(flat(back)).toBe(flat(lw));
    expect(back.layers[0].polylines[0]).toBeInstanceOf(Float64Array);
    expect(back.snapPoints).toBeInstanceOf(Float64Array);
  }, 120_000);

  it('fournisseur : vue partagée lue sans calcul, vue calculée envoyée, vue lourde refusée sur téléphone', async () => {
    const s = await scene();
    const store = new Map<string, Uint8Array>();
    const io = {
      get: async (k: string) => store.get(k) ?? null,
      has: async (k: string) => store.has(k),
      put: async (k: string, _m: string, b: Uint8Array) => void store.set(k, b),
    };
    const req: LineworkRequest = { modelId: 'r', subset: { include: subsetAll(s.index) }, view: { kind: 'top', frame: 'world' }, style: DEFAULT_LINE_STYLE } as LineworkRequest;
    // « ordinateur » : calcule puis envoie
    const desk = provider(s, { remote: serverLineworkCache('r', io) });
    const lw = await desk.getLinework(req);
    await new Promise((r) => setTimeout(r, 100));
    expect(store.size).toBe(1);
    // « téléphone » sans IndexedDB, limite 1 triangle : la vue partagée passe, une autre vue est refusée
    let ran = 0;
    const base = createInlineRunner();
    const phone = provider(s, {
      remote: serverLineworkCache('r', io),
      heavyTriangles: 1,
      maxConcurrent: 1,
      runner: { ...base, run: (...a: Parameters<typeof base.run>) => (ran++, base.run(...a)) } as typeof base,
    });
    expect(flat(await phone.getLinework(req))).toBe(flat(lw));
    expect(ran).toBe(0);
    await expect(phone.getLinework({ ...req, view: { kind: 'left', frame: 'world' } } as LineworkRequest)).rejects.toThrow(HEAVY_VIEW);
    phone.allowHeavy = true;
    await phone.getLinework({ ...req, view: { kind: 'left', frame: 'world' } } as LineworkRequest);
    expect(ran).toBe(1);
  }, 120_000);

  it('vue décorée (repères façade) gardée à part : le téléphone la lit telle quelle, sans repères au-delà de sa limite', async () => {
    const s = await scene();
    const store = new Map<string, Uint8Array>();
    const io = { get: async (k: string) => store.get(k) ?? null, has: async (k: string) => store.has(k), put: async (k: string, _m: string, b: Uint8Array) => void store.set(k, b) };
    const req = { modelId: 'r', subset: { include: subsetAll(s.index) }, view: { kind: 'front', frame: 'world' }, style: { ...DEFAULT_LINE_STYLE, facadeMarks: true } } as LineworkRequest;
    const desk = await provider(s, { remote: serverLineworkCache('r', io) }).getLinework(req);
    await new Promise((r) => setTimeout(r, 100));
    expect(store.size).toBe(2);
    expect(desk.layers.some((l) => l.key.startsWith('mark:'))).toBe(true);
    const phone = await provider(s, { remote: serverLineworkCache('r', io), heavyTriangles: 1 }).getLinework(req);
    expect(flat(phone)).toBe(flat(desk));
    // pas de vue décorée partagée : sur téléphone, la vue arrive sans repères plutôt que de fermer la page
    store.clear();
    const base = await provider(s, { remote: serverLineworkCache('r', io) }).getLinework({ ...req, style: DEFAULT_LINE_STYLE } as LineworkRequest);
    await new Promise((r) => setTimeout(r, 100));
    const bare = await provider(s, { remote: serverLineworkCache('r', io), heavyTriangles: 1 }).getLinework(req);
    expect(bare.layers.some((l) => l.key.startsWith('mark:'))).toBe(false);
    expect(flat(bare)).toBe(flat(base));
  }, 120_000);
});

describe('images 3D sur téléphone', () => {
  it('Cloudinary : version réduite demandée ; autres adresses et adresses déjà transformées inchangées', async () => {
    const { screenImageUrl } = await import('../src/sheets/images');
    expect(screenImageUrl('https://res.cloudinary.com/demo/image/upload/v17/plans/p1/a.png', 1400)).toBe('https://res.cloudinary.com/demo/image/upload/w_1400,c_limit/v17/plans/p1/a.png');
    expect(screenImageUrl('https://res.cloudinary.com/demo/image/upload/w_300,c_limit/v17/a.png', 1400)).toBe('https://res.cloudinary.com/demo/image/upload/w_300,c_limit/v17/a.png');
    expect(screenImageUrl('/assets/a.png', 1400)).toBe('/assets/a.png');
    expect(screenImageUrl('data:image/png;base64,xx', 1400)).toBe('data:image/png;base64,xx');
  });
});
