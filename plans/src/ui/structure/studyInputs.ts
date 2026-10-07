// Entrées du calcul complet d'une étude : modèle de la scène (Viewbox placées, objets portés) + hypothèses du site
// (onglet 2) + options de calcul (onglet 3) + modifications de l'étude (conseil ingénieur). Sert à la page et aux
// variantes simulées par le conseil ingénieur : une variante = les mêmes entrées avec quelques changements.
import type { PlacedModule } from '../../structure/core/assemble';
import { sectionMap } from '../../structure/core/assemble';
import type { LibraryEntry } from '../../structure/core/library';
import type { EdgeItem, PointItem } from '../../structure/core/loads';
import type { StudyMods } from '../../structure/core/mods';
import { mergeMods } from '../../structure/core/mods';
import type { SceneStudyModel } from '../../structure/scene/studyModel';
import type { CalcOptions, StudyInputs } from '../../structure/studyRun';
import { withMods } from '../../structure/advisor/variant';
import { DEFAULTS } from '../../structure/library/defaults';
import type { Hypotheses } from './GroundPanel';
import { roofSnow } from './GroundPanel';
import { TERRACE, terraceSupports } from '../../structure/core/terrace';
import type { AddedSupport } from '../../structure/core/estimate';
import { moduleTypes, typeLoadInputs } from '../../structure/core/moduleTypes';
import { frameSections } from '../../structure/core/templates/frameModule';

/** Appuis du calage hors des Viewbox : pieds des éléments terrasse posés au sol (5,0 kN/m² au rez-de-chaussée). */
export function groundExtras(inp: Pick<StudyInputs, 'terraces' | 'loads'>): AddedSupport[] {
  return terraceSupports(inp.terraces ?? [], inp.loads.liveGround ?? inp.loads.live);
}

/** Poids porté par chaque Viewbox (N) : murs, vitrages, portes, garde-corps, logos, lest — objets du modèle et de l'étude. */
export function carriedWeights(inp: { edgeItems: readonly EdgeItem[]; pointItems: readonly PointItem[] }): Map<string, number> {
  const out = new Map<string, number>();
  const add = (m: string, N: number) => out.set(m, (out.get(m) ?? 0) + N);
  for (const i of inp.edgeItems) add(i.module, i.q * Math.abs(i.to - i.from));
  for (const i of inp.pointItems) add(i.module, i.F);
  return out;
}

export interface InputsSource {
  sceneModel: SceneStudyModel;
  library: LibraryEntry[];
  hyp: Hypotheses;
  roof: boolean;
  calc: CalcOptions;
  mods?: StudyMods;
}

export function buildStudyInputs(src: InputsSource): { inputs: StudyInputs; added: PlacedModule[]; warnings: string[] } {
  const { base, mods } = studyBase(src);
  return withMods(base, mods);
}

/** Entrées avant les modifications de l'étude, et ces modifications (SketchUp « Structure… » puis étude / variante). */
export function studyBase(src: InputsSource): { base: StudyInputs; mods: StudyMods | undefined } {
  const { sceneModel, library, hyp, calc } = src;
  const kNm2 = (v: number) => v * 1e-3;
  // types de structure personnalisés (S12) : sections de leurs barres (catalogue, nuances), poids et sol par type
  const sections = frameSections(sceneModel.modules, sectionMap(library));
  const types = moduleTypes(sceneModel.modules, library, sections, { viewboxKg: hyp.moduleWeightKg, weights: hyp.moduleWeights });
  // murs, vitrages, portes, garde-corps, logos : objet par objet d'après le modèle (étape 1), jamais en forfait
  const base: StudyInputs = {
    modules: sceneModel.modules,
    edgeItems: sceneModel.edgeItems,
    pointItems: sceneModel.pointItems,
    stairs: sceneModel.stairs,
    terraces: sceneModel.terraces,
    members: sceneModel.members ?? [],
    library,
    sections,
    loads: {
      // poids pesé = tout compris (structure, plancher, sol, plafond, isolants) : plafond et sol du modèle réduits pour
      // que barres + plafond + sol = pesée ; calage statico : le plus lourd du modèle et de la pesée, comme SCIA
      moduleWeight: hyp.moduleWeightKg * 9.81,
      weightMode: calc.calibration ? 'max' : 'weighed',
      ceiling: DEFAULTS.ceiling.value,
      floorFinish: DEFAULTS.floorFinish.value,
      ceilingExtra: kNm2(hyp.ceilingExtra ?? 0),
      floorExtra: kNm2(hyp.floorExtra ?? 0),
      live: kNm2(hyp.live),
      liveGround: kNm2(hyp.liveGround ?? DEFAULTS.liveLoadGround.value * 1e3),
      // le toit d'une Viewbox ne reçoit jamais de public : seulement une Viewbox posée dessus ou un élément terrasse
      roofLive: 0,
      horizontalRatio: DEFAULTS.horizontalRatio.value,
      roofAccessible: false,
      evacuateTopLevel: hyp.evacuateTop,
      closedLevels: hyp.closedLevels ?? [],
      snowRoof: roofSnow(hyp),
      windInService: kNm2(hyp.windIn),
      windOutOfService: kNm2(hyp.windOut),
      windProfile: hyp.windProfile,
      roofTerraces: sceneModel.terraces.filter((t) => t.kind === 'roof').map((t) => t.module!),
      terraceG: TERRACE.selfWeight + TERRACE.deck,
      cp: { windward: DEFAULTS.cpWindward.value, leeward: DEFAULTS.cpLeeward.value, parallel: DEFAULTS.cpParallel.value, roofStability: DEFAULTS.cpRoofStability.value },
      ...typeLoadInputs(types, DEFAULTS.floorFinish.value),
    },
    middleFeet: hyp.middleFeet,
    sls: !hyp.staticoConversion,
    options: calc,
    blocking: sceneModel.errors,
  };
  // modifications de SketchUp (« Structure… ») d'abord, puis celles de l'étude et des variantes (elles l'emportent)
  return { base, mods: sceneModel.structMods ? mergeMods(sceneModel.structMods, src.mods) : src.mods };
}
