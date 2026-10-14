// Export Odoo des produits (« Quants (stock.quant) ».xlsx : Product Reference Code · Product · …) →
// src/loading/library/odoo.data.ts, puis réimport du classeur (catalogue complété par Odoo).
// Usage : node scripts/import-odoo.mjs [../docs/loading/Quants (stock.quant) (2).xlsx]
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.resolve(process.argv[2] ?? path.join(root, '..', 'docs', 'loading', 'Quants (stock.quant) (2).xlsx'));
execFileSync('npx', ['vitest', 'run', 'tests/loading/odoo.test.ts'], { cwd: root, stdio: 'inherit', env: { ...process.env, LOADING_ODOO: src, LOADING_WRITE: '1' } });
execFileSync('node', ['scripts/import-loading-rules.mjs'], { cwd: root, stdio: 'inherit' });
