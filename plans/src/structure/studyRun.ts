// Enchaînement du calcul complet d'une étude (étape « 3. Calcul ») : assemblage du modèle, cas de charge,
// combinaisons, calcul aux éléments finis + vérifications (Workers), stabilité, verdict, réactions pour le calage.
// Sans React : utilisé par la page et par les tests.
import type { P2 } from './core/estimate';
import { polygonDistance } from '../core/installUnits';
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
import type { ConnectionSet } from './core/checks/joints';
import type { TypeChecks } from './core/moduleTypes';
import { typeChecks } from './core/moduleTypes';

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
  /** sans vérins, pieds centraux calés : cale directement sous la rive (UNP) au lieu de sous la réception centrale */
  middleUnderRim?: boolean;
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
  /** types de structure personnalisés (S12) : réserves, données manquantes, « Non vérifié » ; absent = Viewbox seules */
  types?: TypeChecks;
}

/** Modèle filaire de l'étude (assemblage seul, sans calcul) : aussi utilisé avant le calcul pour trouver les angles dans le vide. */
export function assembleStudy(inp: StudyInputs): StructuralModel {
  const o = inp.options;
  return assembleStructure(inp.modules, {
    sections: inp.sections,
    jacks: o.jacks,
    middleFeet: inp.middleFeet,
    middleUnderRim: o.middleUnderRim,
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
  // types personnalisés (S12) : assemblages du type de chaque module (jamais VBX-*), liaison d'empilement de l'étude gardée
  const types = typeChecks({ modules: inp.modules, library: inp.library, sections: inp.sections, jacks: o.jacks, edgeItems: inp.edgeItems, stairs: inp.stairs, terraces: inp.terraces });
  const perModule: Record<string, ConnectionSet> = { ...types.perModule };
  for (const [m, set] of Object.entries(inp.joints?.perModule ?? {})) perModule[m] = types.perModule[m] ? { ...types.perModule[m], ...(set.custom ? { custom: set.custom } : {}) } : set;
  const context = {
    structure,
    sections: [...inp.sections],
    connections: connectionSet(inp.library),
    ...(inp.joints || Object.keys(types.perModule).length ? { moduleConnections: perModule } : {}),
    ec3: { ...EC3_DEFAULTS, method: o.ec3Method },
    calibration: o.calibration,
    jackExtension: o.jackExtension ?? CALC_DEFAULTS.jackExtension,
  };
  return runner.run({ jobs, context, options: { secondOrder: true }, onProgress }, signal).then((summary) => {
    const index = buildItemIndex(structure, inp.sections, { boltDiameter: boltDiameter(context.connections) });
    const stab = stability(summary, combos, o.friction);
    const verdict = studyVerdict(index, summary, stab);
    const plywood = floorPlywood(inp);
    const reasons = [...inp.blocking, ...types.blocking];
    // assemblages hors gabarit inconnus : leurs vérifications sont bloquées (incomplet) ; indicatifs : « limite » au mieux
    const joints = inp.joints;
    const jointReasons = [...(joints?.reasons ?? []), ...types.notes];
    if (plywood.blocked) reasons.push(plywood.blocked);
    // éléments de façade et terrasses : justifications du calcul de type statico 18-0573, ramenées au site
    // éléments de façade de statico 18-0573 : seulement ceux des Viewbox (autres types : charges, « Non vérifié »)
    const vbxOnly = Object.keys(types.perModule).length ? { ...inp, edgeItems: inp.edgeItems.filter((i) => !types.perModule[i.module]) } : inp;
    const facade = checkFacade({ items: facadeItems(vbxOnly), qIn: inp.loads.windInService, qOut: inp.loads.windOutOfService, liveGround: inp.loads.liveGround ?? inp.loads.live, live: inp.loads.live, raise: inp.raise?.height });
    const terraces = checkTerraces(inp.terraces ?? [], inp.loads.live, inp.loads.liveGround ?? inp.loads.live);
    reasons.push(...facade.missing, ...terraces.missing);
    const etaOf = (c: ElementChecks) => (c.records.length ? verdictOf(c.eta) : 'ok');
    const verdictAll: StudyVerdict = {
      ...verdict,
      reasons: [...reasons, ...facade.failures, ...terraces.failures, ...verdict.reasons, ...jointReasons],
      verdict: worstVerdict([
        joints?.cap === 'limit' || types.cap === 'limit' ? 'limit' : 'ok',
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
    const custom = types.cap === 'limit' || types.blocking.length ? { types: types } : {};
    return { structure, loads, combos, index, summary, stability: stab, verdict: verdictAll, plywood, ground, stairFeet, facade, terraces, durationMs: performance.now() - t0, warnings, ...custom };
  });
}

/**
 * Planchers en contreplaqué du gabarit (couches croisées vissées du gabarit, une seule en calage statico) : étages comme statico 24-0571 § 3.5 (une
 * travée, kmod 0,8, pression intérieure en option) ; rez-de-chaussée chargé à plus que les étages (5,0 kN/m²) comme
 * statico 18-0573 § 3.4.4, qui fixe cette charge : trois travées, kmod 0,9, qEd = 1,35 · (g + q).
 */
export function floorPlywood(inp: Pick<StudyInputs, 'modules' | 'loads' | 'options'> & { library?: readonly LibraryEntry[] }): PlywoodResult {
  // types personnalisés (S12) : plancher de chaque type, portée mesurée sur ses barres ; Viewbox seules : inchangé
  if (inp.modules.some((m) => m.params.frame)) return floorPlywoodByType(inp);
  return floorPlywoodOf(inp);
}

function floorPlywoodOf(inp: Pick<StudyInputs, 'modules' | 'loads' | 'options'>, deck?: DeckOverride): PlywoodResult {
  const qg = inp.loads.liveGround ?? inp.loads.live;
  if (!(qg > inp.loads.live)) return plywoodStrip(inp, 'upper', inp.loads.live, deck);
  const ground = plywoodStrip(inp, 'ground', qg, deck);
  const parts = inp.modules.some((m) => m.level > 0) ? [ground, plywoodStrip(inp, 'upper', inp.loads.live, deck)] : [ground];
  const blocked = parts.find((x) => x.blocked)?.blocked;
  const build = parts.find((x) => x.build)?.build;
  return { eta: Math.max(...parts.map((x) => x.eta)), records: parts.flatMap((x) => x.records), ...(build ? { build } : {}), ...(blocked ? { blocked } : {}) };
}

/**
 * Bande de plancher sous la charge d'exploitation q (N/mm²) : étage, ou rez-de-chaussée (trois travées, statico
 * 18-0573 § 3.4.4) quand q dépasse la charge des étages ; g = sol compris dans la pesée + revêtement ajouté.
 */
export function plywoodStrip(inp: Pick<StudyInputs, 'modules' | 'loads' | 'options'>, target: 'ground' | 'upper', q: number, deck?: DeckOverride): PlywoodResult {
  const tpl = inp.modules[0]?.params.plywood;
  // couches du plancher (2 × 18 mm croisées sur la Viewbox) ; une seule dans le calage statico, comme ses notes
  const layers = inp.options.calibration ? 1 : (deck?.layers ?? tpl?.floorLayers ?? 1);
  const common = {
    material: deck?.material ?? tpl?.material ?? 'CP-F20/15',
    thickness: deck?.thickness ?? tpl?.thickness ?? 18,
    layers,
    span: deck?.span ?? tpl?.maxSpan ?? 800,
    gammaM: DEFAULTS.timberGammaM.value,
    g: (deck?.g ?? inp.loads.floorFinish) + (inp.loads.floorExtra ?? 0),
  };
  const prefix = deck?.name ? `${deck.name} — ` : '';
  if (target === 'upper' || !(q > inp.loads.live))
    return checkPlywoodStrip({
      ...common,
      kmod: 0.8,
      q,
      gammaG: COMBO_DEFAULTS.gammaGQ,
      gammaQ: COMBO_DEFAULTS.gammaQ,
      internal: inp.options.internalPressure ? 0.8 * inp.loads.windOutOfService : 0,
      gammaW: COMBO_DEFAULTS.gammaW,
      label: `${prefix}Plancher`,
    });
  return checkPlywoodStrip({
    ...common,
    kmod: 0.9,
    q,
    gammaG: 1.35,
    gammaQ: 1.35,
    internal: 0,
    gammaW: 0,
    label: `${prefix}Plancher du rez-de-chaussée`,
    spans: deck?.spans ?? 3,
    clause: 'DIN EN 1995-1-1 ; statico 18-0573 § 3.4.4',
  });
}

/** Plancher d'un type personnalisé (S12) : matériau, épaisseur, portée et nombre de travées mesurés sur ses barres. */
interface DeckOverride {
  name: string;
  material: string;
  thickness: number;
  layers: number;
  span: number;
  spans: 1 | 3;
  /** sol du type (N/mm²) : max(sol des hypothèses ; plancher du type) */
  g: number;
}

/** Portée du plancher d'un type (mm) et nombre de travées continues, mesurés sur les barres d'appui du frame. */
export function deckSpan(p: PlacedModule['params']): { span: number; count: number } | null {
  const fr = p.frame;
  const d = fr?.deck.floor;
  if (!fr || !d) return null;
  const gaps = (xs: number[]) => {
    const u = [...new Set(xs.map((x) => Math.round(x)))].sort((a, b) => a - b);
    return u.slice(1).map((x, k) => x - u[k]);
  };
  const along = (axis: 0 | 1) =>
    gaps([
      ...(axis === 0 ? [p.x0, p.x1] : [p.y0, p.y1]),
      ...fr.bars.filter((b) => b.role === (axis === 0 ? 'transverse-floor' : 'stringer-floor') && Math.abs(b.a[axis] - b.b[axis]) <= 10).map((b) => (b.a[axis] + b.b[axis]) / 2),
    ]);
  const gu = along(0);
  const gv = along(1);
  const pick = d.span === 'u' ? gu : d.span === 'v' ? gv : Math.max(...gu) <= Math.max(...gv) ? gu : gv;
  const span = Math.max(Math.max(...pick), d.maxSpan ?? 0);
  return { span, count: pick.length };
}

function floorPlywoodByType(inp: Pick<StudyInputs, 'modules' | 'loads' | 'options'> & { library?: readonly LibraryEntry[] }): PlywoodResult {
  const groups = new Map<string, PlacedModule[]>();
  for (const m of inp.modules) groups.set(m.templateKey, [...(groups.get(m.templateKey) ?? []), m]);
  const parts: PlywoodResult[] = [];
  for (const [key, mods] of groups) {
    const p = mods[0].params;
    const entry = inp.library?.find((e): e is ModuleTypeEntry => e.kind === 'module_type' && e.key === key);
    const name = entry?.name ?? key;
    const sub = { ...inp, modules: mods };
    if (!p.frame) {
      const r = floorPlywoodOf(sub);
      parts.push({ ...r, records: r.records.map((x) => ({ ...x, title: `${name} — ${x.title}` })) });
      continue;
    }
    const d = p.frame.deck.floor;
    if (!d) {
      parts.push({ eta: Infinity, blocked: `${name} : plancher à renseigner`, records: [] });
      continue;
    }
    if (d.justifiedElsewhere) continue;
    const m = deckSpan(p)!;
    const g = inp.loads.floorFinishByType?.[key] ?? inp.loads.floorFinish;
    parts.push(floorPlywoodOf(sub, { name, material: d.material, thickness: d.thickness, layers: d.layers, span: m.span, spans: m.count >= 3 ? 3 : 1, g }));
  }
  if (!parts.length) return { eta: 0, records: [] };
  const blocked = parts.find((x) => x.blocked)?.blocked;
  const build = parts.find((x) => x.build)?.build;
  return { eta: Math.max(...parts.map((x) => x.eta)), records: parts.flatMap((x) => x.records), ...(build ? { build } : {}), ...(blocked ? { blocked } : {}) };
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
/**
 * Longueur de l'installation (mm, dans ses axes) : plus grande longueur d'un ensemble de Viewbox reliées entre elles
 * (empreintes à moins de 300 mm en plan, empilées comprises) ; des ensembles séparés ne s'additionnent pas.
 */
export function installationLength(modules: readonly PlacedModule[]): number {
  if (!modules.length) return 0;
  const corners = modules.map((m) => {
    const L = m.params.x0 + m.params.x1;
    const W = m.params.y0 + m.params.y1;
    return [
      [0, 0],
      [L, 0],
      [L, W],
      [0, W],
    ].map(([a, b]) => [m.origin[0] + m.u[0] * a + m.v[0] * b, m.origin[2] + m.u[2] * a + m.v[2] * b] as P2);
  });
  const parent = modules.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < modules.length; i++) for (let j = i + 1; j < modules.length; j++) if (root(i) !== root(j) && polygonDistance(corners[i], corners[j]) <= 300) parent[root(j)] = root(i);
  const u = modules[0].u;
  const ax: Array<[number, number]> = [
    [u[0], u[2]],
    [-u[2], u[0]],
  ];
  const length = (pts: P2[]) => Math.max(...ax.map(([x, z]) => Math.max(...pts.map((p) => p[0] * x + p[1] * z)) - Math.min(...pts.map((p) => p[0] * x + p[1] * z))));
  return Math.max(...[...new Set(modules.map((_, i) => root(i)))].map((r) => length(corners.flatMap((c, i) => (root(i) === r ? c : [])))));
}

/** Empreinte des entrées : un résultat est périmé dès qu'elle change. */
/** Empreinte courte d'un texte (FNV-1a) : un gabarit ou une section modifiés rendent le résultat « périmé ». */
function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(36);
}

/** Données d'un type de module ajoutées en S12 (famille, assemblages, surface d'appui) : rien pour une Viewbox d'avant. */
function typeExtra(e: LibraryEntry): string {
  if (e.kind !== 'module_type') return '';
  const t = e as ModuleTypeEntry;
  return t.family || t.connections || t.footContact ? `:${JSON.stringify([t.family ?? null, t.connections ?? null, t.footContact ?? null])}` : '';
}

export function inputKey(inp: StudyInputs): string {
  // paramètres par Viewbox : une Viewbox modifiée par l'étude (poteaux, sections, nuances) change le résultat
  const mods = inp.modules.map((m) => [m.id, m.level, m.templateKey, ...m.origin.map(Math.round), ...m.u.map((x) => Math.round(x * 1e4)), hash(JSON.stringify(m.params)), Math.round(m.weightDelta ?? 0)].join(','));
  const lib = inp.library
    .filter((e) => e.kind === 'section' || e.kind === 'connection' || e.kind === 'module_type')
    .map((e) => `${e.key}:${hash(`${e.kind}:${e.key}:${e.status}:${JSON.stringify((e as ModuleTypeEntry).params ?? (e as SectionEntry).section ?? (e as ConnectionEntry).capacities ?? '')}:${(e as ModuleTypeEntry).weighedN ?? ''}:${(e as SectionEntry).material ?? ''}${typeExtra(e)}`)}`)
    .join('|');
  const joints = inp.joints ? inp.joints.rows.map((r) => `${r.connection}:${r.status}:${r.modules.join('+')}:${r.capacities.map((c) => Math.round(c.after ?? 0)).join('/')}`) : [];
  return JSON.stringify([joints, mods, inp.edgeItems, inp.pointItems, inp.loads, inp.middleFeet, inp.sls, inp.options, inp.blocking, lib, inp.bracings ?? [], inp.raise ?? null, inp.stairs ?? [], inp.terraces ?? [], inp.members ?? [], inp.addedSupports ?? [], inp.classes ?? null, inp.comboIds ?? null, [...inp.sections.keys()].filter((k) => k.startsWith('ETUDE-') || k.startsWith('CAT-') || k.includes('@')).map((k) => `${k}:${inp.sections.get(k)!.material}:${hash(JSON.stringify(inp.sections.get(k)!.section))}`)]);
}
