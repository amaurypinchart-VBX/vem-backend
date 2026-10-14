// VS1 — filet de sécurité avant les vues spéciales : instantané des vues 2D existantes (toutes les vues monde et
// Viewbox, plans de niveau, repères façade, couleurs par catégorie), de leurs clés de cache, de toutes les planches
// d'un jeu généré (échelles, cotes automatiques, SVG), du PDF (pages, contenu) et du DXF (entités par calque), sur le
// modèle synthétique (toujours) et sur les modèles réels de test-models/ quand ils sont présents.
// Premier passage sans instantané : il est écrit ; ensuite il doit être identique.
// VS1_BASELINE_UPDATE=1 réécrit les instantanés (seulement pour un changement voulu des vues existantes).
// Instantané du synthétique : tests/baseline/ (versionné) ; modèles réels : reference-reports/extract/vs1-baseline/
// (non versionné). Modèles réels seulement avec VS1_REAL=1 (≈ 6 min pour Qatar).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { ingest } from '../src/ingest/pipeline';
import { inlineRunner } from '../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../src/core/classification';
import { LEGEND } from '../src/core/types';
import type { ViewKind, ViewSpec } from '../src/core/views';
import { subsetAll, subsetForLevel, subsetForModule } from '../src/core/subset';
import { detectUnits } from '../src/core/installUnits';
import type { LoadedScene } from '../src/scene/loadedScene';
import { makeLoadedScene } from '../src/scene/loadedScene';
import { makeGlassTest } from '../src/linework/packets';
import { BrowserHlrProvider, LINEWORK_ENGINE } from '../src/linework/provider';
import { createInlineRunner } from '../src/linework/runner';
import type { LineStyleSpec, LineworkRequest } from '../src/linework/types';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import { lineworkToSvg } from '../src/linework/svg';
import { generateDrawingSet } from '../src/sheets/generate';
import type { SheetKind } from '../src/sheets/generate';
import { LineworkBank, dimensionDrawingSet, fitDrawingSet } from '../src/sheets/bank';
import { SheetSvg } from '../src/sheets/SheetSvg';
import { emptyTitleBlock } from '../src/sheets/types';
import type { DrawingSet, ViewportItem } from '../src/sheets/types';
import { FONT_FILE, buildPdf, fontsUsed } from '../src/sheets/pdf/pdf';
import type { FontFiles, FontKey } from '../src/sheets/pdf/pdf';
import { setDxf } from '../src/sheets/dxf/export';
import { makeSketchupDae } from './fixtures/sketchupDae';

const ROOT = join(__dirname, '..');
const HASH_DIR = join(__dirname, 'baseline');
const FULL_DIR = join(ROOT, 'reference-reports', 'extract', 'vs1-baseline');
const MODELS_DIR = process.env.VEM_MODELS_DIR ?? join(ROOT, '..', 'test-models');
const UPDATE = !!process.env.VS1_BASELINE_UPDATE;
const REAL = process.env.VS1_REAL === '1';

// jsdom ne mesure pas les textes (svg2pdf) ni ne dessine (canvas) : mêmes substituts que tests/pdf.test.ts
const proto = (globalThis as unknown as { SVGElement: { prototype: Record<string, unknown> } }).SVGElement.prototype;
proto.getBBox ??= function (this: Element) {
  const size = parseFloat(this.getAttribute('font-size') ?? '16');
  return { x: 0, y: 0, width: (this.textContent ?? '').length * size * 0.5, height: size };
};
(globalThis as unknown as { HTMLCanvasElement: { prototype: { getContext: () => null } } }).HTMLCanvasElement.prototype.getContext = () => null;

const sha = (x: string | Uint8Array) => createHash('sha256').update(x).digest('hex').slice(0, 16);

const KINDS: ViewKind[] = ['top', 'bottom', 'front', 'back', 'left', 'right'];
const ALL_SHEETS: SheetKind[] = ['cover', 'fourViews', 'longSides', 'shortSides', 'implantation', 'assembly', 'levels', 'perModule'];

const categoryColors: Record<string, string> = Object.fromEntries(Object.entries(LEGEND).map(([k, v]) => [k, v.color]));

async function loadScene(fileName: string, data: ArrayBuffer): Promise<LoadedScene> {
  const res = await ingest({ fileName, data, sha256: 'vs1', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  return makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'vs1');
}

function makeProvider(scene: LoadedScene) {
  return new BrowserHlrProvider(scene, {
    runner: createInlineRunner(),
    glassTest: makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial),
    categoryColors: () => categoryColors,
    noCache: true,
  });
}

interface ViewCase {
  name: string;
  req: LineworkRequest;
}

/** Toutes les vues que Plans 2D sait faire aujourd'hui (onglet Vues 2D + planches). */
function viewCases(scene: LoadedScene, perModuleLimit: number): ViewCase[] {
  const { index } = scene;
  const out: ViewCase[] = [];
  const req = (include: string[], view: ViewSpec, style: Partial<LineStyleSpec> = {}, subset: Partial<LineworkRequest['subset']> = {}): LineworkRequest => ({
    modelId: 'vs1',
    subset: { include, ...subset },
    view,
    style: { ...DEFAULT_LINE_STYLE, ...style },
  });
  const all = subsetAll(index);
  for (const kind of KINDS) out.push({ name: `world:${kind}`, req: req(all, { kind, frame: 'world' }) });
  out.push({ name: 'world:top:roofless', req: req(all, { kind: 'top', frame: 'world' }, {}, { hideCategories: ['TOIT'] }) });
  out.push({ name: 'world:top:feet', req: req(all, { kind: 'top', frame: 'world' }, {}, { onlyCategories: ['PIED'] }) });
  out.push({ name: 'world:top:colors', req: req(all, { kind: 'top', frame: 'world' }, { colorByCategory: true }, { hideCategories: ['TOIT'] }) });
  out.push({ name: 'world:front:facade', req: req(all, { kind: 'front', frame: 'world' }, { facadeMarks: true }) });
  out.push({ name: 'world:front:hidden', req: req(all, { kind: 'front', frame: 'world' }, { hiddenLines: true }) });
  for (const l of index.levels) out.push({ name: `level${l.level}:top`, req: req(subsetForLevel(index, l.level), { kind: 'top', frame: 'world' }, {}, { hideCategories: ['TOIT'] }) });
  const mods = [...index.modules].sort((a, b) => a.id.localeCompare(b.id)).slice(0, perModuleLimit);
  for (const m of mods) {
    const inc = subsetForModule(index, m.id);
    for (const kind of KINDS) out.push({ name: `${m.id}:${kind}`, req: req(inc, { kind, frame: { moduleId: m.id } }) });
    out.push({ name: `${m.id}:top:roofless`, req: req(inc, { kind: 'top', frame: { moduleId: m.id } }, {}, { hideCategories: ['TOIT'] }) });
    out.push({ name: `${m.id}:front:facade`, req: req(inc, { kind: 'front', frame: { moduleId: m.id } }, { facadeMarks: true }) });
  }
  return out;
}

/** Identifiants aléatoires du jeu (planches, éléments) → s1, i1… dans l'ordre d'apparition. */
function stableIds(set: DrawingSet): DrawingSet {
  let json = JSON.stringify({ ...set, updatedAt: '' });
  const ids: string[] = [];
  for (const s of set.sheets) {
    ids.push(s.id);
    for (const it of s.items) ids.push(it.id);
  }
  ids.forEach((id, n) => {
    json = json.split(`"${id}"`).join(`"#${n}"`);
  });
  return JSON.parse(json) as DrawingSet;
}

function readFonts(keys: FontKey[]): FontFiles {
  const out: FontFiles = {};
  for (const k of keys) {
    const [family, variant] = k.split('-') as ['Gelasio' | 'Arimo', keyof typeof FONT_FILE];
    const b = readFileSync(join(ROOT, 'src/sheets/pdf/fonts', `${family}-${FONT_FILE[variant]}.ttf`));
    out[k] = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  }
  return out;
}

/** Entités d'un DXF par calque et par type. */
function dxfCounts(dxf: string): Record<string, number> {
  const lines = dxf.split('\n');
  const counts: Record<string, number> = {};
  let inEnt = false;
  let type = '';
  const flush = (layer: string) => {
    const k = `${layer}|${type}`;
    counts[k] = (counts[k] ?? 0) + 1;
  };
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]);
    const v = lines[i + 1].trim();
    if (code === 2 && v === 'ENTITIES') inEnt = true;
    if (!inEnt) continue;
    if (code === 0) {
      if (v === 'ENDSEC') break;
      type = v;
    } else if (code === 8 && type) {
      flush(v);
      type = '';
    }
  }
  return Object.fromEntries(Object.entries(counts).sort());
}

/** Empreinte complète de ce que produit Plans 2D sur une scène. */
async function digest(scene: LoadedScene, perModuleLimit: number, withPdf: boolean): Promise<{ hashes: Record<string, string>; detail: Record<string, unknown> }> {
  const provider = makeProvider(scene);
  const hashes: Record<string, string> = { engine: LINEWORK_ENGINE };
  const detail: Record<string, unknown> = {};

  // 1. vues : clé de cache (doit rester identique : le cache IndexedDB des utilisateurs en dépend) + SVG
  for (const c of viewCases(scene, perModuleLimit)) {
    const key = await provider.cacheKey(c.req);
    let lw;
    try {
      lw = await provider.getLinework(c.req);
    } catch (e) {
      hashes[`view:${c.name}`] = `${key.slice(0, 16)}:erreur ${(e as Error).message}`;
      continue;
    }
    const svg = lineworkToSvg(lw, { scale: 50, categoryColors });
    hashes[`view:${c.name}`] = `${key.slice(0, 16)}:${sha(svg)}`;
    detail[`view:${c.name}`] = { key, svg: sha(svg), segments: lw.meta.segmentCount, layers: lw.layers.map((l) => `${l.key}:${l.polylines.length}`), bounds: lw.boundsMm };
  }

  // 2. jeu de plans complet : génération, échelles, cotes automatiques, SVG de chaque planche
  const { index } = scene;
  const modules = index.modules.map((m) => m.id).sort();
  const units = detectUnits(index, scene.frames);
  const gen = generateDrawingSet(
    { modules, units: units.length >= 2 ? units : undefined, kinds: ALL_SHEETS, paper: 'A1', style: DEFAULT_LINE_STYLE, title: 'VS1' },
    { index, projectId: 'p', modelVersionId: 'm', modelKey: 'vs1', titleBlock: emptyTitleBlock() },
  );
  const bank = new LineworkBank(scene, provider);
  await fitDrawingSet(gen.set, bank, () => {});
  dimensionDrawingSet(gen.set, bank, gen.dimensioned);
  const set = stableIds(gen.set);
  // la banque connaît les demandes par leur JSON : inchangé par le renommage des identifiants
  const viewData = (vp: ViewportItem) => bank.data(vp);
  const legend = Object.entries(LEGEND).map(([key, v]) => ({ key, label: v.label, color: v.color }));
  const pages: Array<{ paper: 'A1' | 'A3'; svg: string }> = [];
  const markups: Array<{ sheet: DrawingSet['sheets'][number]; markup: string }> = [];
  for (const sheet of set.sheets) {
    const svg = renderToStaticMarkup(createElement(SheetSvg, { sheet, titleBlock: set.titleBlock, notes: set.notes, legend, viewData }));
    hashes[`sheet:${sheet.number}`] = sha(svg);
    detail[`sheet:${sheet.number}`] = {
      title: sheet.title,
      svg: sha(svg),
      viewports: sheet.items.filter((i): i is ViewportItem => i.type === 'viewport').map((v) => ({ label: v.label, scale: v.scale, center: v.center?.map((x) => Math.round(x * 1000) / 1000) })),
      dims: sheet.items.filter((i) => i.type === 'dimension').length,
    };
    pages.push({ paper: sheet.paper, svg });
    markups.push({ sheet, markup: svg });
  }
  hashes.set = sha(JSON.stringify(set.sheets.map((s) => ({ ...s, items: s.items.map((i) => (i.type === 'viewport' ? { ...i, lineworkKey: undefined } : i)) }))));

  // 3. DXF du jeu entier (papier et grandeur réelle) : entités par calque
  const computed = (vp: ViewportItem) => !!bank.data(vp).lw;
  for (const mode of ['paper', 'real'] as const) {
    const f = setDxf(markups, mode, computed, 'vs1');
    const counts = f ? dxfCounts(f.dxf) : {};
    hashes[`dxf:${mode}`] = sha(JSON.stringify(counts));
    detail[`dxf:${mode}`] = counts;
  }

  // 4. PDF : une page par planche, contenu vectoriel (dates et identifiant du fichier retirés)
  if (withPdf) {
    const pdf = await buildPdf(pages, readFonts(fontsUsed(pages.map((p) => p.svg))), { title: 'VS1' });
    const text = new TextDecoder('latin1').decode(new Uint8Array(pdf.output('arraybuffer')));
    const pageCount = (text.match(/\/Type \/Page\b/g) ?? []).length;
    const clean = text.replace(/\/CreationDate \([^)]*\)/g, '').replace(/\/ModDate \([^)]*\)/g, '').replace(/\/ID \[[^\]]*\]/g, '');
    hashes.pdf = `${pageCount}p:${sha(clean)}`;
    detail.pdf = { pages: pageCount, images: (text.match(/\/Subtype \/Image/g) ?? []).length };
  }
  provider.dispose();
  return { hashes, detail };
}

function compare(name: string, hashes: Record<string, string>, file: string, fullFile: string | null, detail: Record<string, unknown>) {
  if (fullFile) {
    mkdirSync(FULL_DIR, { recursive: true });
    if (UPDATE || !existsSync(fullFile)) writeFileSync(fullFile, JSON.stringify(detail, null, 1));
  }
  if (UPDATE || !existsSync(file)) {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, JSON.stringify(hashes, null, 1) + '\n');
    console.log(`[VS1] instantané écrit : ${name} (${Object.keys(hashes).length} rubriques)`);
    return;
  }
  const before = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
  const diff = Object.keys({ ...before, ...hashes }).filter((k) => before[k] !== hashes[k]);
  if (diff.length) console.log(`[VS1] ${name} — rubriques différentes : ${diff.join(', ')}`);
  expect(diff).toEqual([]);
}

describe('VS1 — instantané de Plans 2D', () => {
  it('modèle synthétique : vues, clés de cache, planches, PDF, DXF identiques', async () => {
    const dae = makeSketchupDae({ twoSided: false });
    const scene = await loadScene('vs1.dae', new TextEncoder().encode(dae).buffer as ArrayBuffer);
    const { hashes, detail } = await digest(scene, Infinity, true);
    compare('synthétique', hashes, join(HASH_DIR, 'vs1-synthetic.json'), join(FULL_DIR, 'synthetic.json'), detail);
  }, 300_000);

  const files = REAL && existsSync(MODELS_DIR) ? readdirSync(MODELS_DIR).filter((f) => /\.zip$/i.test(f)) : [];
  for (const f of files)
    it(`modèle réel ${f}`, async () => {
      const buf = readFileSync(join(MODELS_DIR, f));
      const scene = await loadScene(f, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
      const t0 = performance.now();
      // modèles réels : 3 Viewbox en détail (toutes les vues de l'ensemble et le jeu complet restent comparés)
      const { hashes, detail } = await digest(scene, 3, false);
      console.log(`[VS1] ${f} : ${Object.keys(hashes).length} rubriques en ${Math.round(performance.now() - t0)} ms`);
      const base = f.replace(/\.zip$/i, '');
      compare(f, hashes, join(FULL_DIR, `${base}.hashes.json`), join(FULL_DIR, `${base}.json`), detail);
    }, 1_800_000);
});
