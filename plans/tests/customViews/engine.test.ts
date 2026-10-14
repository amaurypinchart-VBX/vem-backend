// VS3 — vue spéciale complète sur un vrai paquet (fixture SketchUp synthétique, toujours) et sur le modèle Qatar
// (test-models/, s'il est présent) : préréglage « Dessous de toiture — sans plafond », dispositions, Viewbox identiques
// calculées une fois, clés de cache, temps.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../../src/core/classification';
import type { LoadedScene } from '../../src/scene/loadedScene';
import { makeLoadedScene } from '../../src/scene/loadedScene';
import { makeGlassTest } from '../../src/linework/packets';
import { createInlineRunner } from '../../src/linework/runner';
import type { HlrRunner } from '../../src/linework/runner';
import { DEFAULT_LINE_STYLE } from '../../src/linework/types';
import { computeSpecialView } from '../../src/linework/customView';
import type { CustomViewDeps } from '../../src/linework/customView';
import { VIEW_PRESETS, specFromPreset } from '../../src/core/customViews/presets';
import type { CustomViewSpec } from '../../src/core/customViews/types';
import { makePathIndex } from '../../src/core/customViews/paths';
import { makeTagResolver } from '../../src/core/customViews/tags';
import { lineworkToSvg } from '../../src/linework/svg';
import { makeSketchupDae } from '../fixtures/sketchupDae';

async function loadScene(fileName: string, data: ArrayBuffer): Promise<LoadedScene> {
  const res = await ingest({ fileName, data, sha256: 'vs3', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
  const pkg = await loadPackage(await exportPackage(res.root));
  return makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'vs3');
}

/** Coureur qui compte les calculs. */
function counting(): HlrRunner & { runs: number } {
  const inner = createInlineRunner();
  const r = { runs: 0, run: (t: Parameters<HlrRunner['run']>[0], s?: AbortSignal) => (r.runs++, inner.run(t, s)), dispose: () => inner.dispose() };
  return r;
}

const deps = (scene: LoadedScene, runner: HlrRunner): CustomViewDeps => ({ scene, runner, glassTest: makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial), noCache: true });
const preset = (key: string, opts?: string[]) => specFromPreset(VIEW_PRESETS.find((p) => p.key === key)!, key, '2026-10-14', opts);
const withLayout = (s: CustomViewSpec, mode: CustomViewSpec['layout']['mode'], extra: Partial<CustomViewSpec['layout']> = {}): CustomViewSpec => ({ ...s, layout: { ...s.layout, mode, ...extra } });

describe('vue spéciale sur la fixture SketchUp', () => {
  it('dessous de toiture coupé, ensemble / séparées / chaque Viewbox ; identiques calculées une fois', async () => {
    const scene = await loadScene('vs3.dae', new TextEncoder().encode(makeSketchupDae({ twoSided: false })).buffer as ArrayBuffer);
    const spec = preset('roof-under');
    const r1 = counting();
    const asm = await computeSpecialView(spec, deps(scene, r1), DEFAULT_LINE_STYLE);
    expect(asm.blocks).toHaveLength(1);
    expect(asm.title).toBe('Vue de dessous');
    expect(asm.subtitle).toBe('Vue de dessous (miroir du plan)');
    expect(asm.lw.layers.some((l) => l.key === 'cut')).toBe(true);
    expect(r1.runs).toBe(1);
    // séparées : une par Viewbox, les identiques (même définition, mêmes coupes relatives) ne sont calculées qu'une fois
    const r2 = counting();
    const exp = await computeSpecialView(withLayout(spec, 'exploded'), deps(scene, r2), DEFAULT_LINE_STYLE);
    expect(exp.blocks).toHaveLength(scene.index.modules.length);
    expect(exp.stats.reused).toBeGreaterThan(0);
    expect(r2.runs + exp.stats.reused).toBe(scene.index.modules.length);
    // les blocs ne se chevauchent pas
    const boxes = exp.blocks.map((b) => ({ x0: b.lw.boundsMm.minX + b.offset[0], x1: b.lw.boundsMm.maxX + b.offset[0], y0: b.lw.boundsMm.minY + b.offset[1], y1: b.lw.boundsMm.maxY + b.offset[1] }));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        expect(a.x1 <= b.x0 + 1 || b.x1 <= a.x0 + 1 || a.y1 <= b.y0 + 1 || b.y1 <= a.y0 + 1).toBe(true);
      }
    // ensemble + séparées : l'ensemble au-dessus, titres
    const both = await computeSpecialView(withLayout(spec, 'assembled+exploded'), deps(scene, counting()), DEFAULT_LINE_STYLE);
    expect(both.labels.map((l) => l.text)).toContain('Ensemble');
    expect(both.labels.map((l) => l.text)).toContain('Séparées');
    // chaque Viewbox, regroupées : moins de blocs que de Viewbox
    const per = await computeSpecialView(withLayout({ ...spec, camera: { ...spec.camera, frame: 'module' } }, 'per-module'), deps(scene, counting()), DEFAULT_LINE_STYLE);
    expect(per.blocks.length).toBeLessThan(scene.index.modules.length);
    expect(per.blocks.some((b) => b.title.includes(' = '))).toBe(true);
    // SVG : calques des vues spéciales
    const svg = lineworkToSvg(asm.lw, { scale: 50 });
    expect(svg).toContain('data-layer="cut"');
  }, 120_000);

  it('clés de cache : stables, différentes si la vue change', async () => {
    const scene = await loadScene('vs3.dae', new TextEncoder().encode(makeSketchupDae({ twoSided: false })).buffer as ArrayBuffer);
    const a = await computeSpecialView(preset('roof-under'), deps(scene, counting()), DEFAULT_LINE_STYLE);
    const b = await computeSpecialView(preset('roof-under'), deps(scene, counting()), DEFAULT_LINE_STYLE);
    const c = await computeSpecialView(preset('box-under'), deps(scene, counting()), DEFAULT_LINE_STYLE);
    const d = await computeSpecialView({ ...preset('roof-under'), camera: { ...preset('roof-under').camera, reflected: true, rotate: 90 } }, deps(scene, counting()), DEFAULT_LINE_STYLE);
    expect(a.blocks[0].cacheKey).toBe(b.blocks[0].cacheKey);
    expect(a.blocks[0].cacheKey).not.toBe(c.blocks[0].cacheKey);
    // plafond réfléchi / rotation = transformation après calcul : même calcul, même clé
    expect(d.blocks[0].cacheKey).toBe(a.blocks[0].cacheKey);
    expect(d.lw.boundsMm).not.toEqual(a.lw.boundsMm);
  }, 120_000);
});

/** VS3_SVG=dossier : écrit les vues calculées (contrôle visuel). */
function saveSvg(name: string, svg: string) {
  const dir = process.env.VS3_SVG;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.svg`), svg);
}

const QATAR = join(__dirname, '..', '..', '..', 'test-models', 'Qatar_Airways_2024_VEM_20261001-1529.zip');

describe.skipIf(!existsSync(QATAR))('modèle Qatar (test-models/)', () => {
  it('« Dessous de toiture — sans plafond » : plafonds retirés dans les 6 Viewbox, fixations gardées, coupe, temps', async () => {
    const buf = readFileSync(QATAR);
    const scene = await loadScene('qatar.zip', buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
    const tags = makeTagResolver(scene.index);
    const paths = makePathIndex(scene.index);
    // arbre d'une Viewbox (VS0) : le plafond tendu (black_cieling) est dans le composant Viewbox, le même dans les 6
    const ceilings = tags.nodesWithTag('plafond-tendu');
    expect(ceilings).toHaveLength(6);
    expect(new Set(ceilings.map((id) => paths.pathOf(id))).size).toBe(1);
    console.log(`[VS3] plafond tendu : ${paths.pathOf(ceilings[0])} ; fixations : ${tags.nodesWithTag('fixations-plafond').length} ; éclairage : ${tags.nodesWithTag('eclairage').length}`);
    const spec = preset('roof-under-no-ceiling');
    const runner = counting();
    const t0 = performance.now();
    const res = await computeSpecialView(spec, deps(scene, runner), DEFAULT_LINE_STYLE);
    const t1 = performance.now();
    console.log(
      `[VS3] Qatar dessous de toiture sans plafond (ensemble) : ${Math.round(t1 - t0)} ms, ${res.lw.meta.segmentCount} traits, calques ${res.lw.layers.map((l) => `${l.key}:${l.polylines.length}`).join(' ')}, ${res.lw.fills?.length ?? 0} aplats, avertissements ${res.warnings.length}`,
    );
    expect(res.counts.get('p-plafond')).toBe(6);
    // VS3_SVG=dossier : garde les dessins pour les regarder (rsvg-convert -w 2000 f.svg > f.png)
    const out = process.env.VS3_SVG;
    if (out) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, 'qatar-dessous-toiture-sans-plafond.svg'), lineworkToSvg(res.lw, { scale: 50 }));
    }
    saveSvg('qatar-dessous-toiture', lineworkToSvg(res.lw, { scale: 50 }));
    expect(res.lw.layers.some((l) => l.key === 'cut')).toBe(true);
    // séparées : 6 blocs, Viewbox identiques par niveau calculées une fois
    const r2 = counting();
    const t2 = performance.now();
    const exp = await computeSpecialView(withLayout(spec, 'exploded'), deps(scene, r2), DEFAULT_LINE_STYLE);
    if (out) writeFileSync(join(out, 'qatar-dessous-toiture-separees.svg'), lineworkToSvg(exp.lw, { scale: 50 }));
    console.log(`[VS3] Qatar séparées : ${Math.round(performance.now() - t2)} ms, ${r2.runs} calcul(s), ${exp.stats.reused} repris`);
    expect(exp.blocks).toHaveLength(6);
    saveSvg('qatar-dessous-toiture-separees', lineworkToSvg(exp.lw, { scale: 100 }));
    // les 6 Viewbox de Qatar n'ont pas les mêmes façades (murs / vitrages coupés sous la toiture) : 6 calculs
    expect(r2.runs + exp.stats.reused).toBe(6);
    expect(res.warnings.filter((w) => w.code === 'SECTION_OPEN').length).toBeGreaterThan(0); // escalier, porte : pièces non fermées
  }, 1_200_000);
});
