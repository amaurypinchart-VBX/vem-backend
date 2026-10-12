import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { ingest } from '../../src/ingest/pipeline';
import { inlineRunner } from '../../src/ingest/cleanup';
import { exportPackage, loadPackage } from '../../src/ingest/package';
import { DEFAULT_RULES } from '../../src/core/classification';
import { makeLoadedScene } from '../../src/scene/loadedScene';
const dir = join(__dirname, '..', '..', 'reference-reports', 'loading');
it('scan', async () => {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.zip'))) {
    const buf = readFileSync(join(dir, f));
    const data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const res = await ingest({ fileName: f, data, sha256: 'local', rules: DEFAULT_RULES, runner: inlineRunner, skipTextures: true });
    const pkg = await loadPackage(await exportPackage(res.root));
    const scene = makeLoadedScene(pkg.root, pkg.objectsById, res.index, 'local');
    const ix = scene.index;
    console.log('=====', f, 'modules', ix.modules.length, 'levels', ix.levels.length, 'manifest', ix.source.hasManifest);
    for (const m of ix.modules) {
      const fr = scene.frames.get(m.id)!;
      console.log(m.id, m.type ?? '', m.level, m.planDimsMm.map(Math.round), 'origin', fr.origin.map(Math.round), 'x', fr.xAxis.map((v) => v.toFixed(2)), 'min', fr.min.map(Math.round), 'max', fr.max.map(Math.round), 'long', fr.longAxis, 'items', m.itemIds.length);
    }
    const items = ix.nodes.filter((n) => n.role === 'item');
    const by = new Map<string, number>();
    for (const n of items) { const k = `${n.articleRef ?? '-'} | ${n.category ?? '-'} | ${(n.definition ?? n.sourceName ?? n.name).slice(0, 60)}`; by.set(k, (by.get(k) ?? 0) + 1); }
    for (const [k, v] of [...by].sort()) console.log('  ', v, '×', k);
    console.log('warnings', ix.warnings.map((w) => w.code + ':' + w.message.slice(0, 80)));
  }
}, 600000);
