// Enchaînement du calcul complet d'une étude (étape « 3. Calcul ») : assemblage du modèle, cas de charge,
// combinaisons, calcul aux éléments finis + vérifications (Workers), stabilité, verdict, réactions pour le calage.
// Sans React : utilisé par la page et par les tests.
import type { BracingSpec, PlacedModule, PlacedStair, RaiseSpec, StructuralModel } from './core/assemble';
import { assembleStructure } from './core/assemble';
import type { Ec3Method } from './core/checks/ec3';
import { EC3_DEFAULTS } from './core/checks/ec3';
import { boltDiameter, connectionSet } from './core/checks/joints';
import type { PlywoodResult } from './core/checks/plywood';
import { checkPlywoodStrip } from './core/checks/plywood';
import type { Combination } from './core/combos';
import { buildCombinations, COMBO_DEFAULTS } from './core/combos';
import type { Estimate } from './core/estimate';
import type { ConnectionEntry, LibraryEntry, ModuleTypeEntry, SectionEntry } from './core/library';
import type { EdgeItem, LoadInputs, LoadModel, PointItem } from './core/loads';
import { buildLoadCases } from './core/loads';
import type { ItemIndex, StabilityResult, StudySummary, StudyVerdict } from './core/results';
import { buildItemIndex, groundEstimate, stability, studyVerdict } from './core/results';
import { verdictOf, worstVerdict } from './core/records';
import { prepareJobs } from './core/study';
import { DEFAULTS } from './library/defaults';
import type { StudyRunner } from './worker/study';

export interface CalcOptions {
  ec3Method: Ec3Method;
  /** pieds à vérin utilisés : 6 appuis par Viewbox, tiges Tr 24 × 5 vérifiées (bibliothèque VBX-JACK) */
  jacks: boolean;
  /** sortie des tiges (mm), au plus la sortie maxi de la bibliothèque (5 cm) */
  jackExtension: number;
  /** calage statico : S275 et courbes a de l'annexe SCIA, contacts encastrés comme SCIA */
  calibration: boolean;
  /** appui soulevé : libérer aussi les ressorts horizontaux (prudent) */
  upliftAll: boolean;
  /** frottement disponible pour le glissement global */
  friction: number;
  /** pression intérieure dans la vérification du plancher (installation ouverte) */
  internalPressure: boolean;
  /** escaliers habillés sous les limons et le palier (bâches, panneaux) : vent sur l'habillage */
  stairClad?: boolean;
}

export const CALC_DEFAULTS: CalcOptions = { ec3Method: 'envelope', jacks: false, jackExtension: 50, calibration: false, upliftAll: true, friction: DEFAULTS.groundFriction.value, internalPressure: true, stairClad: false };

export interface StudyInputs {
  modules: PlacedModule[];
  edgeItems: EdgeItem[];
  pointItems: PointItem[];
  library: LibraryEntry[];
  sections: ReadonlyMap<string, SectionEntry>;
  /** charges et vent (N, mm) */
  loads: Omit<LoadInputs, 'edgeItems' | 'pointItems'>;
  middleFeet: boolean;
  /** réactions caractéristiques calculées (ELS), sinon Rd / 1,35 */
  sls: boolean;
  options: CalcOptions;
  /** erreurs bloquantes venues du modèle (reconnaissance…) */
  blocking: string[];
  /** modifications de l'étude hors modèle SketchUp : contreventements ajoutés, surélévation */
  bracings?: BracingSpec[];
  raise?: RaiseSpec | null;
  /** escaliers extérieurs du modèle (kit avec palier) */
  stairs?: PlacedStair[];
  /** combinaisons à calculer (défaut : toutes) — recherche rapide du lest sur la stabilité seule */
  classes?: Array<'ULS' | 'STAB' | 'SLS'>;
}

export interface StudyRun {
  structure: StructuralModel;
  loads: LoadModel;
  combos: Combination[];
  index: ItemIndex;
  summary: StudySummary;
  stability: StabilityResult;
  verdict: StudyVerdict;
  plywood: PlywoodResult;
  ground: Estimate;
  /** lest de chaque pied d'escalier contre le glissement (combinaisons de stabilité) */
  stairFeet: StairFootBallast[];
  durationMs: number;
  warnings: string[];
}

export function runStudy(inp: StudyInputs, runner: StudyRunner, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<StudyRun> {
  const t0 = performance.now();
  const o = inp.options;
  const structure = assembleStructure(inp.modules, {
    sections: inp.sections,
    jacks: o.jacks,
    middleFeet: inp.middleFeet,
    upliftReleases: o.upliftAll ? 'all' : 'vertical',
    calibration: o.calibration,
    // contacts : effort normal seul, comme l'annexe SCIA (« Zentrische Normalkraft »), aussi en calage statico
    contactModel: 'truss',
    // Viewbox : boulonnées au plancher et en toiture (A. Pinchart 30.09.2026) ; calage statico : pas en toiture sous un étage
    roofBoltsUnderStack: !o.calibration,
    bracings: inp.bracings,
    raise: inp.raise,
    stairs: inp.stairs,
  });
  if (structure.errors.length) return Promise.reject(new Error(structure.errors.join(' ; ')));
  const loads = buildLoadCases(structure, { ...inp.loads, edgeItems: inp.edgeItems, pointItems: inp.pointItems, stairClad: !!o.stairClad }, inp.sections);
  const combos = buildCombinations({ ...COMBO_DEFAULTS, sls: inp.sls, snow: (inp.loads.snowRoof ?? 0) > 0 }).filter((c) => !inp.classes || inp.classes.includes(c.cls));
  const jobs = prepareJobs(structure, loads, combos, DEFAULTS.sway.value);
  const context = {
    structure,
    sections: [...inp.sections],
    connections: connectionSet(inp.library),
    ec3: { ...EC3_DEFAULTS, method: o.ec3Method },
    calibration: o.calibration,
    jackExtension: o.jackExtension ?? CALC_DEFAULTS.jackExtension,
  };
  return runner.run({ jobs, context, options: { secondOrder: true }, onProgress }, signal).then((summary) => {
    const index = buildItemIndex(structure, inp.sections, { boltDiameter: boltDiameter(context.connections) });
    const stab = stability(summary, combos, o.friction);
    const verdict = studyVerdict(index, summary, stab);
    // plancher : contreplaqué du gabarit (une couche, côté de la sécurité)
    const tpl = inp.modules[0]?.params.plywood;
    const plywood = checkPlywoodStrip({
      material: tpl?.material ?? 'CP-F20/15',
      thickness: tpl?.thickness ?? 18,
      span: tpl?.maxSpan ?? 800,
      kmod: 0.8,
      gammaM: DEFAULTS.timberGammaM.value,
      g: inp.loads.floorFinish,
      q: inp.loads.live,
      gammaG: COMBO_DEFAULTS.gammaGQ,
      gammaQ: COMBO_DEFAULTS.gammaQ,
      internal: o.internalPressure ? 0.8 * inp.loads.windOutOfService : 0,
      gammaW: COMBO_DEFAULTS.gammaW,
      label: 'Plancher',
    });
    const reasons = [...inp.blocking];
    if (plywood.blocked) reasons.push(plywood.blocked);
    const verdictAll: StudyVerdict = {
      ...verdict,
      reasons: [...reasons, ...verdict.reasons],
      verdict: worstVerdict([verdict.verdict, plywood.blocked ? 'incomplete' : verdictOf(plywood.eta), reasons.length ? 'incomplete' : 'ok']),
    };
    const ground = groundEstimate(structure, summary, combos, 100, { roofAccessible: inp.loads.roofAccessible, horizontalRatio: inp.loads.horizontalRatio });
    const warnings = [...new Set([...structure.warnings, ...loads.warnings, ...summary.warnings])];
    const stairFeet = stairFootBallast(structure, summary, combos, o.friction);
    return { structure, loads, combos, index, summary, stability: stab, verdict: verdictAll, plywood, ground, stairFeet, durationMs: performance.now() - t0, warnings };
  });
}

export interface StairFootBallast {
  stair: string;
  label: string;
  /** réaction verticale et horizontale de la combinaison déterminante (N), lest nécessaire (N) */
  Rz: number;
  Rh: number;
  need: number;
  combo: string;
  /** pied soulevé dans une combinaison de stabilité : à lester ou ancrer (valeur non déterminée par le calcul) */
  lifted: boolean;
}

/**
 * Lest de chaque pied d'escalier (montants, talons de limon) contre le glissement, comme statico 24-0569 § 4 :
 * combinaisons de stabilité (G favorables 1,0, vent 1,2), lest = max(0 ; Rh / μ − Rz).
 */
export function stairFootBallast(s: StructuralModel, summary: StudySummary, combos: Combination[], mu: number): StairFootBallast[] {
  const out: StairFootBallast[] = [];
  for (const st of s.stairs ?? [])
    for (const k of st.supports) {
      let worst: StairFootBallast | null = null;
      for (const c of combos) {
        if (c.cls !== 'STAB') continue;
        const r = summary.reactions[c.id]?.[k];
        if (!r) continue;
        const Rz = Math.max(0, r.R[1]);
        const Rh = Math.hypot(r.R[0], r.R[2]);
        const need = Math.max(0, Rh / mu - Rz);
        const cur = { stair: st.id, label: s.supportMeta[k].label ?? `${st.id} · pied ${k + 1}`, Rz, Rh, need, combo: c.id, lifted: r.lifted };
        if (!worst || cur.need > worst.need || (cur.lifted && !worst.lifted)) worst = cur;
      }
      if (worst) out.push(worst);
    }
  return out;
}

/** Empreinte des entrées : un résultat est périmé dès qu'elle change. */
/** Empreinte courte d'un texte (FNV-1a) : un gabarit ou une section modifiés rendent le résultat « périmé ». */
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

export function inputKey(inp: StudyInputs): string {
  const mods = inp.modules.map((m) => [m.id, m.level, m.templateKey, ...m.origin.map(Math.round), ...m.u.map((x) => Math.round(x * 1e4))].join(','));
  const lib = inp.library
    .filter((e) => e.kind === 'section' || e.kind === 'connection' || e.kind === 'module_type')
    .map((e) => `${e.key}:${hash(`${e.kind}:${e.key}:${e.status}:${JSON.stringify((e as ModuleTypeEntry).params ?? (e as SectionEntry).section ?? (e as ConnectionEntry).capacities ?? '')}:${(e as ModuleTypeEntry).weighedN ?? ''}`)}`)
    .join('|');
  return JSON.stringify([mods, inp.edgeItems, inp.pointItems, inp.loads, inp.middleFeet, inp.sls, inp.options, inp.blocking, lib, inp.bracings ?? [], inp.raise ?? null, inp.stairs ?? [], inp.classes ?? null, [...inp.sections.keys()].filter((k) => k.startsWith('ETUDE-')).map((k) => JSON.stringify(inp.sections.get(k)!.section))]);
}
