// PDF du jeu de plans fait par le serveur (processus séparé) : format échangé avec le navigateur, images 3D (PNG
// transparent gardé, sinon JPEG), rendu d'une tâche complète, et le paquet compilé lancé comme processus
// (plans-server/pdf-render.mjs, si `vite build -c vite.server.config.ts` a été lancé).
import { describe, expect, it } from 'vitest';
import { fork } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { renderJob } from '../src/server/pdfRender';
import type { RenderMessage } from '../src/server/pdfRender';
import { pngHasTransparency } from '../src/server/pngAlpha';
import { cloudinarySized, imageSize, packPaintInfo, restoreView, snapshotView, unpackPaintInfo } from '../src/sheets/pdf/serverJob';
import type { PdfJobManifest } from '../src/sheets/pdf/serverJob';
import { encodeLinework, encodePacked, decodePacked } from '../src/linework/remoteCache';
import { encodePng } from '../src/viewer/pngEncode';
import { emptyTitleBlock } from '../src/sheets/types';
import type { Sheet, ViewportItem } from '../src/sheets/types';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import type { Linework2D } from '../src/linework/types';
import type { Vec3 } from '../src/core/views';
import type { PaintColor } from '../src/core/paint/types';

const FONTS = join(__dirname, '../src/sheets/pdf/fonts');
const basis = { right: [1, 0, 0] as Vec3, up: [0, 1, 0] as Vec3, toward: [0, 0, 1] as Vec3 };

function lineworkOf(n: number): Linework2D {
  const pl: Float64Array[] = [];
  for (let i = 0; i < n; i++) pl.push(Float64Array.from([0, i * 2, 5900, i * 2]));
  return {
    boundsMm: { minX: 0, minY: 0, maxX: 5900, maxY: 2800 },
    layers: [
      { key: 'silhouette', polylines: [Float64Array.from([0, 0, 5900, 0, 5900, 2800, 0, 2800, 0, 0])] },
      { key: 'visible', polylines: pl },
    ],
    snapPoints: new Float64Array(),
    meta: { provider: 't', durationMs: 0, segmentCount: 0, cacheKey: '', basis, objectCount: 1 },
  };
}

function viewport(id: string): ViewportItem {
  return {
    id,
    type: 'viewport',
    rect: { x: 20, y: 62, w: 330, h: 215 },
    request: { modelId: 'k', subset: { include: [] }, view: { kind: 'front', frame: 'world' }, style: DEFAULT_LINE_STYLE },
    scale: 25,
    center: [2950, 1400],
    label: 'Long side',
    showLabel: true,
    renderStyle: 'trait',
  };
}

const red: PaintColor = { id: 'c1', tag: 'P1', name: 'Rouge', system: 'RAL', code: '3020', hex: '#cc0605', createdAt: '', createdBy: '' } as PaintColor;

function png(transparent: boolean): Uint8Array {
  const w = 40;
  const h = 30;
  const px = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) px.set([(i * 7) % 255, (i * 3) % 255, 90, transparent && i % 50 === 0 ? 0 : 255], i * 4);
  return encodePng(px, w, h);
}

/** Dossier de tâche comme le serveur le prépare : 2 planches, une vue peinte, une vue absente, une image 3D. */
function makeJob(withImage: boolean): string {
  const dir = mkdtempSync(join(tmpdir(), 'vem-pdf-test-'));
  mkdirSync(join(dir, 'views'));
  mkdirSync(join(dir, 'lw'));
  const key = 'a'.repeat(64);
  const sheets: Sheet[] = [
    {
      id: 's1',
      number: 'A1.1',
      title: 'Élévation « Łódź »',
      paper: 'A1',
      orientation: 'landscape',
      kind: 'standard',
      items: [
        viewport('v1'),
        { id: 'd1', type: 'dimension', viewportId: 'v1', kind: 'linear', orient: 'h', anchors3d: [[0, 2800, 0], [5900, 2800, 0]], offsetMm: -10 },
        ...(withImage ? [{ id: 'i1', type: 'image3d' as const, rect: { x: 400, y: 100, w: 300, h: 200 }, url: 'https://res.cloudinary.com/demo/image/upload/v1/plans/x.png', width: 40, height: 30 }] : []),
      ],
    },
    { id: 's2', number: 'A1.2', title: 'Vue absente', paper: 'A3', orientation: 'landscape', kind: 'standard', items: [viewport('v2')] },
  ];
  const manifest: PdfJobManifest = {
    v: 1,
    title: 'Xiaomi',
    subject: '2 planche(s)',
    fileName: 'x.pdf',
    sheets,
    titleBlock: { ...emptyTitleBlock(), projectName: 'Xiaomi' },
    notes: 'GENERAL NOTES',
    legend: [{ key: 'VITRE', label: 'Glass', color: '#1EAAF1' }],
    paint: packPaintInfo({ colors: [red], areas: new Map([['c1', 12.5]]), usedInSet: new Set(['c1']) }),
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  writeFileSync(join(dir, 'options.json'), JSON.stringify({ imagePx: 2000, jpegQuality: 0.88 }));
  const region = { colorId: 'c1', loops: [Float64Array.from([100, 100, 2000, 100, 2000, 2000, 100, 2000])], anchor: { x: 1000, y: 1000, d: 900 }, area: 3.6e6 };
  const v1 = snapshotView({ lw: lineworkOf(5000), basis, paint: { regions: [region], colors: new Map([['c1', red]]), mode: 'marks' } }, key);
  writeFileSync(join(dir, 'views', 'v1.bin'), encodePacked(v1));
  // v2 : clé annoncée mais traits jamais arrivés ⇒ cadre vide, compté
  writeFileSync(join(dir, 'views', 'v2.bin'), encodePacked(snapshotView({ basis }, 'b'.repeat(64))));
  writeFileSync(join(dir, 'lw', `${key}.bin`), encodeLinework(lineworkOf(5000)));
  return dir;
}

describe('PDF serveur', () => {
  it('format échangé : vue sans ses traits, peinture et légende reconstituées', () => {
    const region = { colorId: 'c1', loops: [Float64Array.from([0, 0, 1, 0, 1, 1])], anchor: { x: 0.5, y: 0.5, d: 0.2 }, area: 0.5 };
    const v = snapshotView({ lw: lineworkOf(2), basis, stale: true, paint: { regions: [region], colors: new Map([['c1', red], ['c2', { ...red, id: 'c2' }]]) } }, 'k');
    expect(v).not.toHaveProperty('lw');
    expect(v.paint?.colors.map((c) => c.id)).toEqual(['c1']); // seulement les couleurs visibles
    const back = decodePacked<typeof v>(encodePacked(v));
    expect(back.paint?.regions[0].loops[0]).toBeInstanceOf(Float64Array);
    const d = restoreView(back, lineworkOf(2));
    expect(d.paint?.colors.get('c1')?.tag).toBe('P1');
    expect(d.stale).toBe(true);
    expect(restoreView(back, undefined).error).toMatch(/introuvable/);
    expect(snapshotView({ basis }, undefined)).not.toHaveProperty('key');
    const info = unpackPaintInfo(packPaintInfo({ colors: [red], areas: new Map([['c1', 3]]), usedInSet: new Set(['c1']) }));
    expect(info?.areas.get('c1')).toBe(3);
    expect(info?.usedInSet.has('c1')).toBe(true);
  });

  it('images : taille lue dans l’en-tête, transparence PNG, adresse Cloudinary réduite', () => {
    expect(imageSize(png(false))).toEqual({ w: 40, h: 30, type: 'png' });
    expect(pngHasTransparency(png(false))).toBe(false);
    expect(pngHasTransparency(png(true))).toBe(true);
    // JPEG minimal : SOI, APP0, SOF0 120 × 80
    const jpg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 80, 0, 120, 3, 1, 0x11, 0, 0xff, 0xd9]);
    expect(imageSize(jpg)).toEqual({ w: 120, h: 80, type: 'jpeg' });
    const u = 'https://res.cloudinary.com/demo/image/upload/v1/plans/x.png';
    expect(cloudinarySized(u, 2000)).toBe('https://res.cloudinary.com/demo/image/upload/w_2000,h_2000,c_limit/v1/plans/x.png');
    expect(cloudinarySized(u, 1200, { quality: 0.75 })).toBe('https://res.cloudinary.com/demo/image/upload/w_1200,h_1200,c_limit,f_jpg,q_75/v1/plans/x.png');
    expect(cloudinarySized('https://example.com/x.png', 800)).toBe('https://example.com/x.png');
  });

  it('tâche complète : une page par planche, polices intégrées, image 3D, vue absente comptée', async () => {
    const dir = makeJob(true);
    try {
      const msgs: RenderMessage[] = [];
      const asked: string[] = [];
      const r = await renderJob(dir, {
        fontDir: FONTS,
        send: (m) => msgs.push(m),
        fetchImage: async (url) => {
          asked.push(url);
          return png(false);
        },
      });
      expect(r.missingViews).toBe(1);
      expect(r.failedImages).toBe(0);
      // opaque : version JPEG demandée à Cloudinary (le faux serveur renvoie du PNG : gardé tel quel)
      expect(asked.some((u) => u.includes('f_jpg'))).toBe(true);
      const bytes = readFileSync(join(dir, 'out.pdf'));
      expect(bytes.length).toBe(r.size);
      const doc = await PDFDocument.load(new Uint8Array(bytes));
      expect(doc.getPageCount()).toBe(2);
      expect(doc.getPage(0).getSize().width).toBeCloseTo(2383.94, 1);
      expect(doc.getPage(1).getSize().width).toBeCloseTo(1190.55, 1);
      const text = bytes.toString('latin1');
      expect(text).toMatch(/\/Subtype \/Image/);
      expect(text).toMatch(/\/FontFile2/);
      expect(text).not.toMatch(/\/BaseFont \/(Times|Helvetica)/);
      expect(msgs.filter((m) => m.type === 'progress' && m.detail).map((m) => (m as { detail: string }).detail)).toEqual(['planche A1.1', 'planche A1.2']);
      if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const bundle = join(__dirname, '../../plans-server/pdf-render.mjs');
  const jsdomForBackend = join(__dirname, '../../node_modules/jsdom');
  it.skipIf(!existsSync(bundle) || !existsSync(jsdomForBackend))('paquet compilé lancé comme processus (comme le serveur VEM)', async () => {
    const dir = makeJob(false);
    try {
      const msgs: RenderMessage[] = [];
      const code = await new Promise<number | null>((resolve) => {
        const child = fork(bundle, [dir], { execArgv: ['--max-old-space-size=512', '--expose-gc'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
        child.on('message', (m) => msgs.push(m as RenderMessage));
        child.on('exit', (c) => resolve(c));
      });
      expect(code).toBe(0);
      const done = msgs.find((m) => m.type === 'done') as Extract<RenderMessage, { type: 'done' }>;
      expect(done?.missingViews).toBe(1);
      const doc = await PDFDocument.load(new Uint8Array(readFileSync(join(dir, 'out.pdf'))));
      expect(doc.getPageCount()).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
