// Plans de production sur un vrai modèle de test-models/ (non versionné, ou VEM_MODELS_DIR) : pièces lues, planches
// générées, vues calculées, cotes posées, PDF. Ignoré sans modèle. PRODUCTION_OUT=dossier garde le PDF et les SVG.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../../src/core/classification';
import { LEGEND } from '../../src/core/types';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { makeGlassTest } from '../../src/linework/packets';
import { BrowserHlrProvider } from '../../src/linework/provider';
import { createInlineRunner } from '../../src/linework/runner';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';
import { generateDrawingSet } from '../../src/sheets/generate';
import { LineworkBank, dimensionDrawingSet, fitDrawingSet } from '../../src/sheets/bank';
import { SheetSvg } from '../../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../../src/sheets/types';
import type { ViewportItem } from '../../src/sheets/types';
import { FONT_FILE, buildPdf, fontsUsed } from '../../src/sheets/pdf/pdf';
import type { FontFiles, FontKey } from '../../src/sheets/pdf/pdf';
import { measureParts } from '../../src/production/measure';
import { groupParts, holeGroups } from '../../src/production/parts';

const ROOT = join(__dirname, '..', '..');
const DIR = process.env.VEM_MODELS_DIR ?? join(ROOT, '..', 'test-models');
const OUT = process.env.PRODUCTION_OUT;
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /permabox.*\.(zip|dae)$/i.test(f)) : [];

const proto = (globalThis as unknown as { SVGElement: { prototype: Record<string, unknown> } }).SVGElement.prototype;
proto.getBBox ??= function (this: Element) {
  const size = parseFloat(this.getAttribute('font-size') ?? '16');
  return { x: 0, y: 0, width: (this.textContent ?? '').length * size * 0.5, height: size };
};
(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: () => null } } }).HTMLCanvasElement.prototype.getContext = () => null;

function readFonts(keys: FontKey[]): FontFiles {
  const out: FontFiles = {};
  for (const k of keys) {
    const [family, variant] = k.split('-') as ['Gelasio' | 'Arimo', keyof typeof FONT_FILE];
    const b = readFileSync(join(ROOT, 'src/sheets/pdf/fonts', `${family}-${FONT_FILE[variant]}.ttf`));
    out[k] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  return out;
}

describe.skipIf(!files.length)('plans de production — modèles réels', () => {
  for (const f of files)
    it(f, async () => {
      const buf = readFileSync(join(DIR, f));
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const res = await ingest({ fileName: f, data, sha256: 'prod', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
      const pkg = await loadPackage(await exportPackage(res.root));
      const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'prod');
      const mod = res.index.modules[0];
      const types = groupParts(measureParts(scene, mod.id));
      expect(types.length).toBeGreaterThan(5);
      // profils C de toiture percés tous les 651 mm depuis 250 mm
      const roof = types.find((t) => /toiture long/i.test(t.name));
      if (roof) {
        const g = holeGroups(roof.rep.geo.holes)[0];
        expect(g.holes.length).toBe(9);
        expect(Math.round(g.holes[0].c[0])).toBe(250);
      }
      const gen = generateDrawingSet(
        { modules: [mod.id], kinds: ['production'], paper: 'A1', style: DEFAULT_LINE_STYLE, title: 'Production', production: { types, moduleLabel: mod.id, typeLabel: 'Permabox', moduleId: mod.id } },
        { index: res.index, projectId: 'p', modelVersionId: 'm', modelKey: 'prod', titleBlock: emptyTitleBlock() },
      );
      expect(gen.set.sheets[0].number).toBe('PR.1');
      const provider = new BrowserHlrProvider(scene, {
        runner: createInlineRunner(),
        glassTest: makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial),
        categoryColors: () => ({}),
        noCache: true,
      });
      const bank = new LineworkBank(scene, provider);
      await fitDrawingSet(gen.set, bank, () => {});
      dimensionDrawingSet(gen.set, bank, gen.dimensioned);
      const legend = Object.entries(LEGEND).map(([key, v]) => ({ key, label: v.label, color: v.color }));
      const pages = gen.set.sheets.map((sheet) => ({
        paper: sheet.paper,
        svg: renderToStaticMarkup(createElement(SheetSvg, { sheet, titleBlock: gen.set.titleBlock, notes: gen.set.notes, legend, viewData: (vp: ViewportItem) => bank.data(vp) })),
      }));
      // plan d'assemblage (PR.2) : 4 vues de la box, bulles une seule fois par repère, nomenclature
      const asm = gen.set.sheets[1];
      expect(asm.title).toBe('Production - Assembly - Permabox');
      const balloons = asm.items.filter((i) => i.type === 'label' && i.balloon).map((i) => (i.type === 'label' ? i.text : ''));
      expect(balloons.length).toBeGreaterThan(10);
      expect(new Set(balloons).size).toBe(balloons.length);
      expect(asm.items.some((i) => i.type === 'text' && i.text === 'PARTS LIST')).toBe(true);
      // chaque vue de pièce est calculée et cotée
      for (const s of gen.set.sheets.slice(1)) {
        const vps = s.items.filter((i): i is ViewportItem => i.type === 'viewport');
        for (const vp of vps) expect(bank.data(vp).lw, `${s.title} ${vp.label}`).toBeTruthy();
        if (vps.length) expect(s.items.some((i) => i.type === 'dimension'), s.title).toBe(true);
      }
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        pages.forEach((p, i) => writeFileSync(join(OUT, `sheet-${String(i + 1).padStart(2, '0')}.svg`), p.svg));
        const pdf = await buildPdf(pages, readFonts(fontsUsed(pages.map((p) => p.svg))), { title: 'Production' });
        writeFileSync(join(OUT, 'production.pdf'), new Uint8Array(pdf.output('arraybuffer')));
      }
      provider.dispose();
    }, 600_000);
});
