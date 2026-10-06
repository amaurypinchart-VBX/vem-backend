// Enchaînement du calcul complet d'une étude (étape « 3. Calcul ») : assemblage du modèle, cas de charge,
// combinaisons, calcul aux éléments finis + vérifications (Workers), stabilité, verdict, réactions pour le calage.
// Sans React : utilisé par la page et par les tests.
import type { CornerSupport, BracingSpec, ModelMember, PlacedModule, PlacedStair, RaiseSpec, StructuralModel } from './core/assemble';
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
import type { ElementChecks, FacadeItem } from './core/checks/facade';
import { checkFacade } from './core/checks/facade';
import type { PlacedTerrace } from './core/terrace';
import { checkTerraces } from './core/terrace';
import { DEFAULTS } from './library/defaults';
import type { StudyRunner } from './worker/study';
import type { JointRevalidation } from './core/jointRevalidation';

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
  /** éléments terrasse du modèle (au sol : appuis du calage ; sur toiture : charges `loads.roofTerraces`) */
  terraces?: PlacedTerrace[];
  /** poutres et poteaux porteurs dessinés dans le modèle */
  members?: ModelMember[];
  /** appuis ajoutés par l'étude sous des angles de Viewbox posés dans le vide (poteau, poutre de reprise) */
  addedSupports?: CornerSupport[];
  /** combinaisons à calculer (défaut : toutes) — recherche rapide du lest sur la stabilité seule */
  classes?: Array<'ULS' | 'STAB' | 'SLS'>;
  /** seulement ces combinaisons (essais rapides de l'optimiseur sur les combinaisons déterminantes) */
  comboIds?: string[];
  /** assemblages des Viewbox modifiées par l'étude (statuts, capacités recalculées ou indicatives) */
  joints?: JointRevalidation;
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
  /** murs, vitrages, garde-corps (statico 18-0573 § 3.6 – 3.7) et éléments terrasse (§ 3.5) */
  facade: ElementChecks;
  terraces: ElementChecks;
  durationMs: number;
  warnings: string[];
  /** charge d'exploitation maximale admissible (cherchée après le calcul, par calculs complets successifs) */
  capacity?: import('./capacity').LiveCapacity;
}

/** Modèle filaire de l'étude (assemblage seul, sans calcul) : aussi utilisé avant le calcul pour trouver les angles dans le vide. */
export function assembleStudy(inp: StudyInputs): StructuralModel {
  const o = inp.options;
  return assembleStructure(inp.modules, {
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
    members: inp.members,
    addedSupports: inp.addedSupports,
  });
}

export function runStudy(inp: StudyInputs, runner: StudyRunner, onProgress?: (done: number, total: number) => void, signal?: AbortSignal): Promise<StudyRun> {
  const t0 = performance.now();
  const o = inp.options;
  const structure = assembleStudy(inp);
  if (structure.errors.length) return Promise.reject(new Error(structure.errors.join(' ; ')));
  const loads = buildLoadCases(structure, { ...inp.loads, edgeItems: inp.edgeItems, pointItems: inp.pointItems, stairClad: !!o.stairClad }, inp.sections);
  const combos = buildCombinations({ ...COMBO_DEFAULTS, sls: inp.sls, snow: (inp.loads.snowRoof ?? 0) > 0 }).filter((c) => (!inp.classes || inp.classes.includes(c.cls)) && (!inp.comboIds || inp.comboIds.includes(c.id)));
  const jobs = prepareJobs(structure, loads, combos, DEFAULTS.sway.value);
  const context = {
    structure,
    sections: [...inp.sections],
    connections: connectionSet(inp.library),
    ...(inp.joints ? { moduleConnections: inp.joints.perModule } : {}),
    ec3: { ...EC3_DEFAULTS, method: o.ec3Method },
    calibration: o.calibration,
    jackExtension: o.jackExtension ?? CALC_DEFAULTS.jackExtension,
  };
  return runner.run({ jobs, context, options: { secondOrder: true }, onProgress }, signal).then((summary) => {
    const index = buildItemIndex(structure, inp.sections, { boltDiameter: boltDiameter(context.connections) });
    const stab = stability(summary, combos, o.friction);
    const verdict = studyVerdict(index, summary, stab);
    const plywood = floorPlywood(inp);
    const reasons = [...inp.blocking];
    // assemblages hors gabarit inconnus : leurs vérifications sont bloquées (incomplet) ; indicatifs : « limite » au mieux
    const joints = inp.joints;
    const jointReasons = joints?.reasons ?? [];
    if (plywood.blocked) reasons.push(plywood.blocked);
    // éléments de façade et terrasses : justifications du calcul de type statico 18-0573, ramenées au site
    const facade = checkFacade({ items: facadeItems(inp), qIn: inp.loads.windInService, qOut: inp.loads.windOutOfService, liveGround: inp.loads.liveGround ?? inp.loads.live, live: inp.loads.live, raise: inp.raise?.height });
    const terraces = checkTerraces(inp.terraces ?? [], inp.loads.live, inp.loads.liveGround ?? inp.loads.live);
    reasons.push(...facade.missing, ...terraces.missing);
    const etaOf = (c: ElementChecks) => (c.records.length ? verdictOf(c.eta) : 'ok');
    const verdictAll: StudyVerdict = {
      ...verdict,
      reasons: [...reasons, ...facade.failures, ...terraces.failures, ...verdict.reasons, ...jointReasons],
      verdict: worstVerdict([
        joints?.cap === 'limit' ? 'limit' : 'ok',
        verdict.verdict,
        plywood.blocked ? 'incomplete' : verdictOf(plywood.eta),
        etaOf(facade),
        etaOf(terraces),
        facade.failures.length || terraces.failures.length ? 'fail' : 'ok',
        reasons.length ? 'incomplete' : 'ok',
      ]),
    };
    const ground = groundEstimate(structure, summary, combos, 100, { roofAccessible: inp.loads.roofAccessible, horizontalRatio: inp.loads.horizontalRatio });
    const warnings = [...new Set([...structure.warnings, ...loads.warnings, ...summary.warnings])];
    const stairFeet = stairFootBallast(structure, summary, combos, o.friction);
    const length = installationLength(inp.modules);
    if (length > 30000 + 1) warnings.push(`Longueur de l’installation ${(Math.round(length / 100) / 10).toString().replace('.', ',')} m > 30 m : au-delà des versions du calcul de type statico 18-0573 — calculée ici dans son ensemble, à faire valider par l’ingénieur.`);
    return { structure, loads, combos, index, summary, stability: stab, verdict: verdictAll, plywood, ground, stairFeet, facade, terraces, durationMs: performance.now() - t0, warnings };
  });
}

/**
 * Planchers en contreplaqué du gabarit (une couche, côté de la sécurité) : étages comme statico 24-0571 § 3.5 (une
 * travée, kmod 0,8, pression intérieure en option) ; rez-de-chaussée chargé à plus que les étages (5,0 kN/m²) comme
 * statico 18-0573 § 3.4.4, qui fixe cette charge : trois travées, kmod 0,9, qEd = 1,35 · (g + q).
 */
export function floorPlywood(inp: Pick<StudyInputs, 'modules' | 'loads' | 'options'>): PlywoodResult {
  const qg = inp.loads.liveGround ?? inp.loads.live;
  if (!(qg > inp.loads.live)) return plywoodStrip(inp, 'upper', inp.loads.live);
  const ground = plywoodStrip(inp, 'ground', qg);
  const parts = inp.modules.some((m) => m.level > 0) ? [ground, plywoodStrip(inp, 'upper', inp.loads.live)] : [ground];
  const blocked = parts.find((x) => x.blocked)?.blocked;
  return { eta: Math.max(...parts.map((x) => x.eta)), records: parts.flatMap((x) => x.records), ...(blocked ? { blocked } : {}) };
}

/**
 * Bande de plancher sous la charge d'exploitation q (N/mm²) : étage, ou rez-de-chaussée (trois travées, statico
 * 18-0573 § 3.4.4) quand q dépasse la charge des étages ; g = sol compris dans la pesée + revêtement ajouté.
 */
export function plywoodStrip(inp: Pick<StudyInputs, 'modules' | 'loads' | 'options'>, target: 'ground' | 'upper', q: number): PlywoodResult {
  const tpl = inp.modules[0]?.params.plywood;
  const common = { material: tpl?.material ?? 'CP-F20/15', thickness: tpl?.thickness ?? 18, span: tpl?.maxSpan ?? 800, gammaM: DEFAULTS.timberGammaM.value, g: inp.loads.floorFinish + (inp.loads.floorExtra ?? 0) };
  if (target === 'upper' || !(q > inp.loads.live))
    return checkPlywoodStrip({
      ...common,
      kmod: 0.8,
      q,
      gammaG: COMBO_DEFAULTS.gammaGQ,
      gammaQ: COMBO_DEFAULTS.gammaQ,
      internal: inp.options.internalPressure ? 0.8 * inp.loads.windOutOfService : 0,
      gammaW: COMBO_DEFAULTS.gammaW,
      label: 'Plancher',
    });
  return checkPlywoodStrip({
    ...common,
    kmod: 0.9,
    q,
    gammaG: 1.35,
    gammaQ: 1.35,
    internal: 0,
    gammaW: 0,
    label: 'Plancher du rez-de-chaussée',
    spans: 3,
    clause: 'DIN EN 1995-1-1 ; statico 18-0573 § 3.4.4',
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

/** Murs, vitrages, portes et garde-corps portés par les Viewbox → éléments de façade (niveau, sur une terrasse). */
export function facadeItems(inp: Pick<StudyInputs, 'edgeItems' | 'modules' | 'loads'>): FacadeItem[] {
  const level = new Map(inp.modules.map((m) => [m.id, m.level]));
  const terraces = new Set(inp.loads.roofTerraces ?? []);
  return inp.edgeItems
    .filter((i) => i.nature && level.has(i.module))
    .map((i) => ({
      label: i.label,
      nature: i.nature!,
      // objet posé sur la toiture d'une Viewbox (terrasse, toiture accessible) : au niveau du dessus
      level: level.get(i.module)! + (i.level === 'roof' ? 1 : 0),
      onTerrace: i.level === 'roof' && (terraces.has(i.module) || inp.loads.roofAccessible),
      length: i.to - i.from,
    }));
}

/** Plus grande dimension en plan de l'installation (mm), dans les axes des Viewbox. */
export function installationLength(modules: readonly PlacedModule[]): number {
  if (!modules.length) return 0;
  const pts = modules.flatMap((m) => {
    const L = m.params.x0 + m.params.x1;
    const W = m.params.y0 + m.params.y1;
    return [
      [0, 0],
      [L, 0],
      [L, W],
      [0, W],
    ].map(([a, b]) => [m.origin[0] + m.u[0] * a + m.v[0] * b, m.origin[2] + m.u[2] * a + m.v[2] * b]);
  });
  const u = modules[0].u;
  const ax: Array<[number, number]> = [
    [u[0], u[2]],
    [-u[2], u[0]],
  ];
  return Math.max(...ax.map(([x, z]) => Math.max(...pts.map((p) => p[0] * x + p[1] * z)) - Math.min(...pts.map((p) => p[0] * x + p[1] * z))));
}

/** Empreinte des entrées : un résultat est périmé dès qu'elle change. */
/** Empreinte courte d'un texte (FNV-1a) : un gabarit ou une section modifiés rendent le résultat « périmé ». */
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

export function inputKey(inp: StudyInputs): string {
  // paramètres par Viewbox : une Viewbox modifiée par l'étude (poteaux, sections, nuances) change le résultat
  const mods = inp.modules.map((m) => [m.id, m.level, m.templateKey, ...m.origin.map(Math.round), ...m.u.map((x) => Math.round(x * 1e4)), hash(JSON.stringify(m.params)), Math.round(m.weightDelta ?? 0)].join(','));
  const lib = inp.library
    .filter((e) => e.kind === 'section' || e.kind === 'connection' || e.kind === 'module_type')
    .map((e) => `${e.key}:${hash(`${e.kind}:${e.key}:${e.status}:${JSON.stringify((e as ModuleTypeEntry).params ?? (e as SectionEntry).section ?? (e as ConnectionEntry).capacities ?? '')}:${(e as ModuleTypeEntry).weighedN ?? ''}:${(e as SectionEntry).material ?? ''}`)}`)
    .join('|');
  const joints = inp.joints ? inp.joints.rows.map((r) => `${r.connection}:${r.status}:${r.modules.join('+')}:${r.capacities.map((c) => Math.round(c.after ?? 0)).join('/')}`) : [];
  return JSON.stringify([joints, mods, inp.edgeItems, inp.pointItems, inp.loads, inp.middleFeet, inp.sls, inp.options, inp.blocking, lib, inp.bracings ?? [], inp.raise ?? null, inp.stairs ?? [], inp.terraces ?? [], inp.members ?? [], inp.addedSupports ?? [], inp.classes ?? null, inp.comboIds ?? null, [...inp.sections.keys()].filter((k) => k.startsWith('ETUDE-') || k.startsWith('CAT-') || k.includes('@')).map((k) => `${k}:${inp.sections.get(k)!.material}:${hash(JSON.stringify(inp.sections.get(k)!.section))}`)]);
}
