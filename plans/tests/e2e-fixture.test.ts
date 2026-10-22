// Fabrique le modèle d'essai (.zip : .dae façon SketchUp + manifest) utilisé par les tests navigateur (e2e/).
// Ignoré sauf si E2E_FIXTURE_OUT est défini : E2E_FIXTURE_OUT=e2e/fixture.zip npx vitest run tests/e2e-fixture.test.ts
// (E2E_FIXTURE_HEAVY=3000 : 16 Viewbox de 3 000 petites pièces chacune, essais mémoire téléphone — e2e/run-memory.mjs)
// (E2E_FIXTURE_VBX4='[8000,0,2800]' : VBX-04 décalée, en porte-à-faux au-delà de VBX-2 — e2e/run-supports.mjs)
import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { makeSketchupDae } from './fixtures/sketchupDae';

const out = process.env.E2E_FIXTURE_OUT;

it.skipIf(!out)('modèle d’essai pour les tests navigateur', () => {
  const manifest = { schema: 'viewbox-manifest/1', units: 'mm', upAxis: 'Z', modules: [], common: [] };
  writeFileSync(out!, zipSync({ 'export/test.dae': strToU8(makeSketchupDae({ twoSided: false, ...(process.env.E2E_FIXTURE_VBX4 ? { vbx4At: JSON.parse(process.env.E2E_FIXTURE_VBX4) } : {}), ...(process.env.E2E_FIXTURE_HEAVY ? { modules: 16, detail: Number(process.env.E2E_FIXTURE_HEAVY) } : {}) })), 'export/manifest.json': strToU8(JSON.stringify(manifest)) }));
});
