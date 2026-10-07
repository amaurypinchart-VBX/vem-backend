// Entrées du calcul d'une étude avec ses modifications (sections, lest, contreventements, Viewbox ajoutées,
// surélévation, plats d'empilement). Fonction pure : la page et le conseil ingénieur calculent une variante ainsi.
import type { PlacedModule } from '../core/assemble';
import type { StudyMods } from '../core/mods';
import { applyMods, libraryWithMods } from '../core/mods';
import { revalidateJoints } from '../core/jointRevalidation';
import { applyStackJoint } from '../core/stackJoint';
import { isCustomType, typeEntryOf } from '../core/moduleTypes';
import type { StudyInputs } from '../studyRun';

export function withMods(inp: StudyInputs, mods: StudyMods | undefined): { inputs: StudyInputs; added: PlacedModule[]; warnings: string[] } {
  if (!mods || !Object.keys(mods).length) return { inputs: inp, added: [], warnings: [] };
  const r = applyMods({ modules: inp.modules, edgeItems: inp.edgeItems, sections: inp.sections }, mods);
  const library = libraryWithMods(inp.library, mods);
  // assemblages des Viewbox modifiées : gabarit / recalculé / indicatif / inconnu
  // types personnalisés (S12) : assemblages du type, pas de revalidation Viewbox
  const original = new Map([...r.original].filter(([id]) => !isCustomType(typeEntryOf(library, r.modules.find((m) => m.id === id)?.templateKey ?? ''))));
  const reval = revalidateJoints({ modules: r.modules, original, sections: r.sections, library, user: mods.jointCapacities });
  // liaison personnalisée entre Viewbox empilées (atelier des accessoires)
  const sj = applyStackJoint({ modules: r.modules, library, joints: reval.rows.length ? reval : undefined }, mods.stackJoint);
  const joints = sj.joints;
  return {
    inputs: { ...inp, modules: sj.modules, edgeItems: r.edgeItems, sections: r.sections, library, bracings: r.bracings, raise: r.raise, ...(r.supports.length ? { addedSupports: r.supports } : {}), blocking: [...inp.blocking, ...r.errors], ...(joints && joints.rows.length ? { joints } : {}) },
    added: r.added,
    warnings: [...r.warnings, ...sj.warnings],
  };
}
