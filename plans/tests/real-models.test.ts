// Analyse des vrais modèles déposés dans test-models/ (dossier non versionné, ou VEM_MODELS_DIR).
// Ignoré s'il n'y a pas de fichier. Lancer : npx vitest run tests/real-models.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest } from '../src/ingest/pipeline';
import { inlineRunner } from '../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../src/ingest/package';
import { DEFAULT_RULES, compileRules } from '../src/core/classification';
import { buildTextReport } from '../src/core/report';
import { makeLoadedScene } from '../src/scene/loadedScene';
import { resolveMeshes } from '../src/core/subset';
import { viewBasis } from '../src/core/views';
import { buildPacket, makeGlassTest } from '../src/linework/packets';
import { computeView } from '../src/linework/hlr';
import { DEFAULT_LINE_STYLE } from '../src/linework/types';
import { countCollinearOverlaps, makeSoup, pushSegment } from '../src/core/lines2d';

const dir = process.env.VEM_MODELS_DIR ?? join(__dirname, '..', '..', 'test-models');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.(zip|dae|glb)$/i.test(f)) : [];

describe.skipIf(files.length === 0)('modèles réels (test-models/)', () => {
  for (const f of files) {
    it(f, async () => {
      const buf = readFileSync(join(dir, f));
      const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
      const t0 = performance.now();
      const res = await ingest({ fileName: f, data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
      const t1 = performance.now();
      const glb = await exportPackage(res.root);
      const report = buildTextReport(res.index);
      writeFileSync(join(dir, f.replace(/\.[^.]+$/, '') + '.analyse-vem.txt'), report);
      console.log(`${f} : analyse ${(t1 - t0).toFixed(0)} ms, GLB ${(glb.byteLength / 1024 / 1024).toFixed(1)} Mo\n${report}`);
      expect(res.index.modules.length).toBeGreaterThan(0);

      // Moteur 2D (critères §8.3) sur la première Viewbox, paquet GLB rechargé comme dans le navigateur :
      // vue de dessus du module seul, pieds masqués = ses dimensions en plan à ± 1 mm, aucun trait en double.
      const pkg = await loadPackage(glb);
      const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
      const mod = res.index.modules[0];
      const meshes = resolveMeshes(res.index, scene.look, [mod.nodeId], ['PIED']);
      const packet = buildPacket(scene, meshes, makeGlassTest(compileRules(DEFAULT_RULES).glassMaterial));
      const lw = computeView(packet, { basis: viewBasis({ kind: 'top', frame: { moduleId: mod.id } }, scene.frames), style: DEFAULT_LINE_STYLE, cacheKey: 'test' });
      const w = lw.boundsMm.maxX - lw.boundsMm.minX;
      const h = lw.boundsMm.maxY - lw.boundsMm.minY;
      console.log(`${mod.id} vue de dessus : ${w.toFixed(1)} × ${h.toFixed(1)} mm (module ${mod.planDimsMm.join(' × ')}), ${lw.meta.segmentCount} traits, ${lw.meta.durationMs} ms`);
      expect(Math.abs(w - mod.planDimsMm[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(h - mod.planDimsMm[1])).toBeLessThanOrEqual(1);
      const soup = makeSoup(16);
      for (const l of lw.layers) for (const pl of l.polylines) for (let i = 2; i < pl.length; i += 2) pushSegment(soup, pl[i - 2], pl[i - 1], pl[i], pl[i + 1], 0, 0);
      expect(countCollinearOverlaps(soup)).toBe(0);
    }, 600_000);
  }
});
