// Empaquette l'extension SketchUp (plans/sketchup) en .rbz téléchargeable depuis Plans Viewbox
// (public/plans/tools/viewbox_prep.rbz). Un .rbz est un simple .zip installé par SketchUp.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'sketchup');
const files = ['viewbox_prep.rb', 'viewbox_prep/main.rb', 'viewbox_prep/core.rb', 'viewbox_prep/review.rb', 'viewbox_prep/review.html'];
const entries = Object.fromEntries(files.map((f) => [f, readFileSync(join(src, f))]));
const outDir = join(root, '..', 'public', 'plans', 'tools');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'viewbox_prep.rbz'), zipSync(entries, { level: 9 }));
console.log(`viewbox_prep.rbz : ${files.length} fichiers → ${join(outDir, 'viewbox_prep.rbz')}`);
