// Entrées du calcul complet d'une étude : modèle de la scène (Viewbox placées, objets portés) + hypothèses du site
// (onglet 2) + options de calcul (onglet 3) + modifications de l'étude (conseil ingénieur). Sert à la page et aux
// variantes simulées par le conseil ingénieur : une variante = les mêmes entrées avec quelques changements.
import type { PlacedModule } from '../../structure/core/assemble';
import { sectionMap } from '../../structure/core/assemble';
import type { LibraryEntry } from '../../structure/core/library';
import type { EdgeItem } from '../../structure/core/loads';
import type { StudyMods } from '../../structure/core/mods';
import type { SceneStudyModel } from '../../structure/scene/studyModel';
import type { CalcOptions, StudyInputs } from '../../structure/studyRun';
import { withMods } from '../../structure/advisor/variant';
import { DEFAULTS } from '../../structure/library/defaults';
import type { Hypotheses } from './GroundPanel';
import { roofSnow } from './GroundPanel';

export interface InputsSource {
  sceneModel: SceneStudyModel;
  library: LibraryEntry[];
  hyp: Hypotheses;
  roof: boolean;
  calc: CalcOptions;
  mods?: StudyMods;
}

export function buildStudyInputs(src: InputsSource): { inputs: StudyInputs; added: PlacedModule[]; warnings: string[] } {
  const { sceneModel, library, hyp, roof, calc } = src;
  const kNm2 = (v: number) => v * 1e-3;
  // charge forfaitaire par Viewbox (hypothèses du calage) : répartie sur les 4 rives du plancher
  const extra: EdgeItem[] =
    hyp.extraKN > 0
      ? sceneModel.modules.flatMap((m) => {
          const p = m.params;
          const q = (hyp.extraKN * 1e3) / (2 * (p.x1 - p.x0 + (p.y1 - p.y0)));
          return (['u0', 'u1', 'v0', 'v1'] as const).map((side) => ({ module: m.id, side, from: 0, to: side[0] === 'v' ? p.x1 - p.x0 : p.y1 - p.y0, level: 'floor' as const, q, loadCase: 'G3' as const, label: 'charge forfaitaire' }));
        })
      : [];
  const base: StudyInputs = {
    modules: sceneModel.modules,
    edgeItems: [...sceneModel.edgeItems, ...extra],
    pointItems: sceneModel.pointItems,
    library,
    sections: sectionMap(library),
    loads: {
      moduleWeight: hyp.moduleWeightKg * 9.81,
      weightMode: hyp.weightMode,
      ceiling: kNm2(hyp.ceiling),
      floorFinish: kNm2(hyp.floorFinish),
      live: kNm2(hyp.live),
      roofLive: kNm2(hyp.roofLive),
      horizontalRatio: DEFAULTS.horizontalRatio.value,
      roofAccessible: roof,
      evacuateTopLevel: hyp.evacuateTop,
      snowRoof: roofSnow(hyp),
      windInService: kNm2(hyp.windIn),
      windOutOfService: kNm2(hyp.windOut),
      cp: { windward: DEFAULTS.cpWindward.value, leeward: DEFAULTS.cpLeeward.value, parallel: DEFAULTS.cpParallel.value, roofStability: DEFAULTS.cpRoofStability.value },
    },
    middleFeet: hyp.middleFeet,
    sls: !hyp.staticoConversion,
    options: calc,
    blocking: sceneModel.errors,
  };
  return withMods(base, src.mods);
}
