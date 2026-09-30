// Étude de test : Viewbox 5900 placées sur une grille (repère SketchUp → monde), charges statico, combinaisons,
// contexte des vérifications.
import type { PlacedModule } from '../../src/structure/core/assemble';
import { assembleStructure, sectionMap } from '../../src/structure/core/assemble';
import { EC3_DEFAULTS } from '../../src/structure/core/checks/ec3';
import { connectionSet } from '../../src/structure/core/checks/joints';
import { buildCombinations } from '../../src/structure/core/combos';
import type { Vec3 } from '../../src/structure/core/fem/types';
import type { LoadInputs } from '../../src/structure/core/loads';
import { buildLoadCases } from '../../src/structure/core/loads';
import { prepareJobs } from '../../src/structure/core/study';
import type { StudyContextData } from '../../src/structure/worker/study';
import { SEED, SEED_MODULES } from '../../src/structure/library/seed';

const entry = SEED_MODULES.find((m) => m.key === 'VIEWBOX-5900-EU')!;

/** Viewbox au coin SketchUp (x, y) en m, grand côté selon +X, niveau `level`. */
export function vbx(id: string, x: number, y: number, level = 0): PlacedModule {
  const u: Vec3 = [1, 0, 0];
  const v: Vec3 = [0, 0, -1];
  return { id, level, origin: [x * 1000, level * 3080, -y * 1000], u, v, params: entry.params!, templateKey: entry.key };
}

export const LOADS: LoadInputs = {
  moduleWeight: 2564 * 9.81,
  ceiling: 0.35e-3,
  floorFinish: 0.4e-3,
  live: 3.5e-3,
  roofLive: 3.5e-3,
  horizontalRatio: 0.1,
  roofAccessible: false,
  evacuateTopLevel: false,
  windInService: 0.2e-3,
  windOutOfService: 0.37e-3,
  cp: { windward: 0.8, leeward: -0.5, parallel: -0.8, roofStability: -0.7 },
  edgeItems: [],
  pointItems: [],
};

export function study(modules: PlacedModule[], loads: LoadInputs = LOADS) {
  const sections = sectionMap(SEED);
  const structure = assembleStructure(modules, { sections, jacks: false, middleFeet: false, upliftReleases: 'all', calibration: false });
  const lm = buildLoadCases(structure, loads);
  const combos = buildCombinations();
  const jobs = prepareJobs(structure, lm, combos, 1 / 200);
  const context: StudyContextData = { structure, sections: [...sections], connections: connectionSet(SEED), ec3: EC3_DEFAULTS, calibration: false };
  return { structure, sections, loads: lm, combos, jobs, context };
}
