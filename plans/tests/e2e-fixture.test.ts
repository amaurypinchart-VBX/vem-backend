// Fabrique le modèle d'essai (.zip : .dae façon SketchUp + manifest) utilisé par les tests navigateur (e2e/).
// Ignoré sauf si E2E_FIXTURE_OUT est défini : E2E_FIXTURE_OUT=e2e/fixture.zip npx vitest run tests/e2e-fixture.test.ts
// (E2E_FIXTURE_HEAVY=3000 : 16 Viewbox de 3 000 petites pièces chacune, essais mémoire téléphone — e2e/run-memory.mjs ;
//  + E2E_FIXTURE_DETAILNODES=1 : pièces séparées comme le Xiaomi — e2e/run-desktop-memory.mjs)
// (E2E_FIXTURE_TWOSIDED=1 : faces recto + verso comme un vrai export SketchUp — e2e/run-paint.mjs)
// (E2E_FIXTURE_VBX4='[8000,0,2800]' : VBX-04 décalée, en porte-à-faux au-delà de VBX-2 — e2e/run-supports.mjs)
// (E2E_FIXTURE_TEXTILE=1 : plafond tendu + cadres textile dans chaque Viewbox — e2e/run-hide-frames.mjs)
// (E2E_FIXTURE_CLADDING=150 : 4 Viewbox en bardage de petites tuiles, ≈ 1,4 M de triangles, des centaines de milliers
//  de faces extérieures — peinture « côtés extérieurs » sur une façade très détaillée, e2e/run-wizard-exterior.mjs)
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { makeSketchupDae } from './fixtures/sketchupDae';

const out = process.env.E2E_FIXTURE_OUT;

it.skipIf(!out)('modèle d’essai pour les tests navigateur', () => {
  const textile = process.env.E2E_FIXTURE_TEXTILE === '1';
  // cadres textile : le grand cadre de VBX-01 a son repère et son visuel saisis dans SketchUp (extension 1.4)
  const modules = textile ? [{ id: 'VBX-01', accessories: [{ name: 'SEG frame 2000', textileFrame: { ref: 'F12', visual: 'Logo IKEA bleu' } }] }] : [];
  const manifest = { schema: 'viewbox-manifest/1', units: 'mm', upAxis: 'Z', modules, common: [] };
  writeFileSync(out!, zipSync({ 'export/test.dae': strToU8(makeSketchupDae({ twoSided: process.env.E2E_FIXTURE_TWOSIDED === '1', ...(process.env.E2E_FIXTURE_VBX4 ? { vbx4At: JSON.parse(process.env.E2E_FIXTURE_VBX4) } : {}), ...(process.env.E2E_FIXTURE_HEAVY ? { modules: 16, detail: Number(process.env.E2E_FIXTURE_HEAVY), ...(process.env.E2E_FIXTURE_DETAILNODES === '1' ? { detailNodes: true, bolts: 60 } : {}) } : {}), ...(process.env.E2E_FIXTURE_TEXTILE === '1' ? { textile: true } : {}), ...(process.env.E2E_FIXTURE_CLADDING ? { modules: 4, detail: 500, cladding: Number(process.env.E2E_FIXTURE_CLADDING) } : {}) })), 'export/manifest.json': strToU8(JSON.stringify(manifest)) }));
});
