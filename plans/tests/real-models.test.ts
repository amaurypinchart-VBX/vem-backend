// Analyse des vrais modèles déposés dans test-models/ (dossier non versionné).
// Ignoré s'il n'y a pas de fichier. Lancer : npx vitest run tests/real-models.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ingest } from '../src/ingest/pipeline';
import { inlineRunner } from '../src/ingest/cleanup';
import { exportPackage } from '../src/ingest/package';
import { DEFAULT_RULES } from '../src/core/classification';
import { buildTextReport } from '../src/core/report';

const dir = join(__dirname, '..', '..', 'test-models');
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
    }, 300_000);
  }
});
