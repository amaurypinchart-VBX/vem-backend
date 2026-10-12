// Classeur de règles VIEWBOX_regles_loading_N.xlsx → src/loading/library/seed.ts + catalogue.ts
// + docs/loading/rapport-import.md (ce qui ne se traduit pas proprement, décisions appliquées, questions).
// Usage : node scripts/import-loading-rules.mjs [../docs/loading/VIEWBOX_regles_loading_3.xlsx]
// La traduction est du TypeScript testé (src/loading/library/) : le script la lance par Vitest.
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.resolve(process.argv[2] ?? path.join(root, '..', 'docs', 'loading', 'VIEWBOX_regles_loading_3.xlsx'));
execFileSync('npx', ['vitest', 'run', 'tests/loading/import.test.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, LOADING_CLASSEUR: src, LOADING_WRITE: '1' },
});
