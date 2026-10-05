// Entrées du calcul d'une étude avec ses modifications (sections, lest, contreventements, Viewbox ajoutées,
// surélévation, plats d'empilement). Fonction pure : la page et le conseil ingénieur calculent une variante ainsi.
import type { PlacedModule } from '../core/assemble';
import type { StudyMods } from '../core/mods';
import { applyMods, libraryWithMods } from '../core/mods';
import type { StudyInputs } from '../studyRun';

export function withMods(inp: StudyInputs, mods: StudyMods | undefined): { inputs: StudyInputs; added: PlacedModule[]; warnings: string[] } {
  if (!mods || !Object.keys(mods).length) return { inputs: inp, added: [], warnings: [] };
  const r = applyMods({ modules: inp.modules, edgeItems: inp.edgeItems, sections: inp.sections }, mods);
  return {
    inputs: { ...inp, modules: r.modules, edgeItems: r.edgeItems, sections: r.sections, library: libraryWithMods(inp.library, mods), bracings: r.bracings, raise: r.raise, blocking: [...inp.blocking, ...r.errors] },
    added: r.added,
    warnings: r.warnings,
  };
}
