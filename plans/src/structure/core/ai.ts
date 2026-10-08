// IA de l'étude structure (§13), côté module : ce qu'on envoie au serveur (jamais de clé ici) et ce qu'on fait des
// réponses. L'IA propose, l'humain valide : une identification reste « proposée » (orange) ou « inconnue » (rouge sous
// 0,5 de confiance) ; une section lue dans un document est recalculée par l'outil à partir de ses dimensions et
// comparée aux valeurs imprimées ; les capacités d'assemblage sont converties en unités internes, sans être utilisées
// par les vérifications tant qu'un humain ne les a pas reprises. Aucun chiffre de calcul ne vient de l'IA.
// Fonctions pures.
import type { Section, SectionProps, SectionShape, BucklingCurve, Fabrication } from './catalog';
import { chs, coldFormedU, rectangle, rhs, roundBar, weldedT } from './catalog';
import type { Capacity, ConnectionEntry, FrameRole, LibraryEntry, ModuleTypeEntry, PartAssignment, PartNature, PartRole, SectionEntry, WeightUnit } from './library';
import { FRAME_ROLES, NATURES_BY_ROLE, designation, moduleFamily } from './library';
import { MATERIALS } from './materials';
import type { AiTypeProposal, Assignments, PartType, Recognition, RecognitionInput, StoredAssignment } from './recognition';
import type { FrameExtraction } from './frameExtract';

// ─── identification ───

export interface IdentifyPayload {
  type: {
    label: string;
    kind: 'item' | 'module';
    category: string | null;
    definition: string | null;
    designation: string | null;
    articleRef: string | null;
    materials: string[];
    dims?: number[];
    triangles?: number;
    instances: number;
    modules: string[];
  };
  options: {
    natures: Record<PartRole, PartNature[]>;
    materials: Array<{ key: string; name: string }>;
    sections: Array<{ key: string; name: string }>;
  };
}

/** Ce que l'IA reçoit pour un type de pièce : ses noms, son empreinte, et les seules réponses permises. */
export function identifyPayload(t: PartType, library: readonly LibraryEntry[]): IdentifyPayload {
  const n = t.sample;
  return {
    type: {
      label: t.label,
      kind: t.kind,
      category: t.category,
      definition: n?.definition ?? null,
      designation: n?.label ?? null,
      articleRef: n?.articleRef ?? null,
      materials: t.fingerprint?.materials.slice(0, 20) ?? [],
      ...(t.fingerprint ? { dims: [...t.fingerprint.dims], triangles: t.fingerprint.triangles } : {}),
      instances: t.nodeIds.length,
      modules: t.moduleIds.slice(0, 20),
    },
    options: identifyOptions(library),
  };
}

/** Réponses permises d'une identification (rôles / natures, matériaux, sections de la bibliothèque). */
export function identifyOptions(library: readonly LibraryEntry[]): IdentifyPayload['options'] {
  return {
    natures: NATURES_BY_ROLE,
    materials: MATERIALS.filter((m) => m.family !== 'massless').map((m) => ({ key: m.key, name: m.name })),
    sections: library.filter((e): e is SectionEntry => e.kind === 'section' && !e.disabled && !e.section.massless).map((e) => ({ key: e.key, name: e.name })),
  };
}

export interface IdentifySuggestion {
  role: string;
  nature: string;
  material?: string | null;
  section?: string | null;
  weight?: { value: number; unit: WeightUnit } | null;
  windClosed?: boolean | null;
  confidence: number;
  questions: string[];
  rationale: string;
}

/** Seuil de confiance sous lequel la pièce reste « inconnue » (rouge), questions affichées. */
export const AI_CONFIDENCE_MIN = 0.5;

/** Proposition de l'IA → réponse pré-remplie du formulaire (jamais enregistrée sans validation humaine). */
export function suggestionToAssignment(s: IdentifySuggestion): { assignment: PartAssignment; status: 'suggested' | 'unknown' } {
  const role = (Object.keys(NATURES_BY_ROLE) as PartRole[]).includes(s.role as PartRole) ? (s.role as PartRole) : 'load';
  const nature = NATURES_BY_ROLE[role].includes(s.nature as PartNature) ? (s.nature as PartNature) : NATURES_BY_ROLE[role][0];
  const a: PartAssignment = { role, nature };
  if (s.material) a.material = s.material;
  if (s.section) a.section = s.section;
  if (s.weight && s.weight.value > 0) a.weight = { value: s.weight.value, unit: s.weight.unit };
  if (typeof s.windClosed === 'boolean') a.windClosed = s.windClosed;
  a.note = `proposé par l’IA (confiance ${Math.round(s.confidence * 100)} %) : ${s.rationale}`.slice(0, 500);
  return { assignment: a, status: s.confidence >= AI_CONFIDENCE_MIN ? 'suggested' : 'unknown' };
}

// ─── regroupement ───

export function groupPayload(types: readonly PartType[]) {
  return types.map((t) => ({
    key: t.key,
    label: t.label,
    category: t.category,
    definition: t.sample?.definition ?? null,
    ...(t.fingerprint ? { dims: [...t.fingerprint.dims] } : {}),
    materials: t.fingerprint?.materials.slice(0, 20) ?? [],
    instances: t.nodeIds.length,
  }));
}

export interface GroupProposal {
  keys: string[];
  label: string;
  reason: string;
}

// ─── lecture d'un document de référence ───

export type Verification = { verified: 'citation' | 'quote' | 'no'; missing: number[] };

export interface ExtractedSection {
  designation: string;
  role: string;
  shape: 'RHS' | 'SHS' | 'CHS' | 'I' | 'H' | 'U' | 'C' | 'L' | 'T' | 'FLAT' | 'ROUND' | 'OTHER';
  fabrication: 'hot' | 'cold' | 'welded' | 'unknown';
  dims: Partial<Record<'h' | 'b' | 't' | 'tw' | 'tf' | 'd' | 'r', number | null>>;
  material?: string | null;
  /** valeurs imprimées : A cm², I cm⁴, W cm³, It cm⁴, kg/m */
  values: Partial<Record<'A' | 'Iy' | 'Iz' | 'Wely' | 'Welz' | 'Wply' | 'Wplz' | 'It' | 'kgPerM', number | null>>;
  curves: Partial<Record<'y' | 'z', string | null>>;
  page: string;
  quote: string;
  check: Verification;
}

export interface ExtractedConnection {
  name: string;
  composition: string;
  capacities: Array<{ label: string; value: number; unit: 'kN' | 'kNm' | 'kNcm' | 'kN/cm' | 'kNcm/deg' | 'N' | 'Nmm' | '-'; formula?: string | null }>;
  page: string;
  quote: string;
  check: Verification;
}

export interface ExtractResult {
  document: { title: string; reference: string };
  sections: ExtractedSection[];
  connections: ExtractedConnection[];
  citations: number;
}

/** Écart relatif tolérable entre une propriété recalculée et la valeur imprimée (arrondis, rayons de congé). */
export const SECTION_TOLERANCE = 0.03;

export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** Unités du document (cm) → mm : A ×100, I ×10⁴, W ×10³. */
const TO_MM: Record<string, number> = { A: 1e2, Iy: 1e4, Iz: 1e4, It: 1e4, Wely: 1e3, Welz: 1e3, Wply: 1e3, Wplz: 1e3 };
const PROPS = ['A', 'Iy', 'Iz', 'Wely', 'Welz', 'Wply', 'Wplz', 'It'] as const;

export interface SectionComparison {
  prop: (typeof PROPS)[number];
  printed: number;
  computed: number;
  deviation: number;
}

/**
 * Section lue → entrée de bibliothèque « proposée ». Les propriétés sont recalculées par l'outil depuis les dimensions
 * quand la forme le permet (tubes, plats, U et C pliés, T soudés, ronds) et comparées aux valeurs imprimées ; sinon
 * les valeurs imprimées sont reprises telles quelles (et signalées « non recalculées »).
 */
export function sectionFromExtract(x: ExtractedSection, reportRef: string): { entry: SectionEntry | null; comparisons: SectionComparison[]; computed: boolean; problems: string[] } {
  const d = x.dims;
  const n = (k: keyof ExtractedSection['dims']) => (typeof d[k] === 'number' && d[k]! > 0 ? d[k]! : undefined);
  const problems: string[] = [];
  let props: SectionProps | null = null;
  let shape: SectionShape = 'GENERIC';
  let fabrication: Fabrication = x.fabrication === 'cold' ? 'cold-formed' : x.fabrication === 'welded' ? 'welded' : x.fabrication === 'hot' ? 'hot-rolled' : 'hot-rolled';
  const dims: Record<string, number> = {};
  for (const k of ['h', 'b', 't', 'tw', 'tf', 'd', 'r'] as const) if (n(k)) dims[k] = n(k)!;
  const h = n('h');
  const b = n('b');
  const t = n('t');
  if ((x.shape === 'RHS' || x.shape === 'SHS') && h && t) {
    fabrication = x.fabrication === 'hot' ? 'hot-finished' : 'cold-formed';
    shape = x.shape === 'SHS' || !b || b === h ? 'SHS' : 'RHS';
    props = rhs(h, b ?? h, t, fabrication === 'hot-finished' ? 'hot-finished' : 'cold-formed');
  } else if (x.shape === 'CHS' && n('d') && t) {
    shape = 'CHS';
    props = chs(n('d')!, t);
  } else if (x.shape === 'FLAT' && b && t) {
    shape = 'FLAT';
    props = rectangle(b, t);
  } else if (x.shape === 'ROUND' && n('d')) {
    shape = 'ROUND';
    props = roundBar(n('d')!);
  } else if ((x.shape === 'U' || x.shape === 'C') && x.fabrication === 'cold' && h && b && t) {
    shape = x.shape === 'C' ? 'C_COLD' : 'U_COLD';
    props = coldFormedU(h, b, t);
  } else if (x.shape === 'T' && h && n('tw') && b && n('tf')) {
    shape = 'T';
    fabrication = 'welded';
    props = weldedT(h, n('tw')!, b, n('tf')!);
  } else {
    shape = x.shape === 'U' ? 'UNP' : x.shape === 'I' || x.shape === 'H' ? 'I' : x.shape === 'L' ? 'ANGLE' : 'GENERIC';
    problems.push('forme non recalculable par l’outil : valeurs du document reprises telles quelles');
  }
  const printed = (k: (typeof PROPS)[number]) => (typeof x.values[k] === 'number' && x.values[k]! > 0 ? x.values[k]! * TO_MM[k] : undefined);
  const comparisons: SectionComparison[] = [];
  if (props)
    for (const k of PROPS) {
      const p = printed(k);
      const c = (props as unknown as Record<string, number | undefined>)[k];
      if (p === undefined || c === undefined) continue;
      comparisons.push({ prop: k, printed: p, computed: c, deviation: c / p - 1 });
    }
  for (const c of comparisons) if (Math.abs(c.deviation) > SECTION_TOLERANCE) problems.push(`${c.prop} recalculé ${(c.deviation * 100).toFixed(1)} % de la valeur imprimée`);
  if (props && !comparisons.length) problems.push('aucune valeur imprimée pour contrôler le recalcul');
  const final: Partial<SectionProps> = props ?? {};
  if (!props) for (const k of PROPS) if (printed(k) !== undefined) (final as Record<string, number>)[k] = printed(k)!;
  if (!(final.A && final.Iy && final.Iz && final.Wely && final.Welz && final.It)) {
    problems.push('propriétés incomplètes : section inutilisable');
    return { entry: null, comparisons, computed: !!props, problems };
  }
  const curve = (c: string | null | undefined): BucklingCurve | undefined => (c && ['a0', 'a', 'b', 'c', 'd'].includes(c) ? (c as BucklingCurve) : undefined);
  const key = `REF-${slug(reportRef)}-${slug(x.designation)}`;
  const section: Section = {
    key,
    name: x.designation,
    shape,
    fabrication,
    dims,
    A: final.A,
    Iy: final.Iy,
    Iz: final.Iz,
    It: final.It,
    Wely: final.Wely,
    Welz: final.Welz,
    ...(final.Wply ? { Wply: final.Wply } : {}),
    ...(final.Wplz ? { Wplz: final.Wplz } : {}),
    ...(curve(x.curves.y) ? { curveY: curve(x.curves.y) } : {}),
    ...(curve(x.curves.z) ? { curveZ: curve(x.curves.z) } : {}),
    ...(typeof x.values.kgPerM === 'number' && x.values.kgPerM > 0 ? { kgPerM: x.values.kgPerM } : {}),
  };
  const material = MATERIALS.find((m) => m.key === (x.material ?? '').toUpperCase().replace(/\s+/g, '') || m.name === x.material)?.key ?? 'S235';
  if (!x.material) problems.push('nuance d’acier non lue : S235 par défaut (prudent)');
  const entry: SectionEntry = {
    kind: 'section',
    key,
    name: `${designation(x.designation)}${x.role ? ` (${x.role})` : ''}`,
    status: 'suggested',
    source: [{ ref: `report:${reportRef}`, page: x.page, note: `lu par l’IA${x.check.verified === 'citation' ? ', valeurs retrouvées dans le document' : x.check.verified === 'quote' ? ', valeurs retrouvées dans l’extrait recopié' : ', valeurs non retrouvées dans le document'}` }],
    section,
    material,
    notes: problems,
  };
  return { entry, comparisons, computed: !!props, problems };
}

/** Unité du document → unité interne et facteur (N, N·mm, N/mm, N·mm/rad). */
export const CAPACITY_UNITS: Record<ExtractedConnection['capacities'][number]['unit'], { unit: Capacity['unit']; k: number }> = {
  kN: { unit: 'N', k: 1e3 },
  N: { unit: 'N', k: 1 },
  kNm: { unit: 'N·mm', k: 1e6 },
  kNcm: { unit: 'N·mm', k: 1e4 },
  Nmm: { unit: 'N·mm', k: 1 },
  'kN/cm': { unit: 'N/mm', k: 100 },
  'kNcm/deg': { unit: 'N·mm/rad', k: (1e4 * 180) / Math.PI },
  '-': { unit: '-', k: 1 },
};

/** Assemblage lu → entrée « proposée » (clé propre : jamais utilisée par les vérifications Viewbox sans reprise). */
export function connectionFromExtract(x: ExtractedConnection, reportRef: string): ConnectionEntry {
  const source = { ref: `report:${reportRef}`, page: x.page };
  return {
    kind: 'connection',
    key: `REF-${slug(reportRef)}-${slug(x.name)}`,
    name: x.name,
    status: 'suggested',
    source: [{ ...source, note: `lu par l’IA${x.check.verified === 'no' ? ', valeurs non retrouvées dans le document' : ''}` }],
    composition: x.composition,
    capacities: x.capacities.map((c, k) => ({
      key: `${slug(c.label).slice(0, 30) || 'C'}-${k + 1}`,
      label: c.label,
      value: c.value * CAPACITY_UNITS[c.unit].k,
      unit: CAPACITY_UNITS[c.unit].unit,
      ...(c.formula ? { formula: c.formula } : {}),
      source,
    })),
  };
}

// ─── analyse du modèle entier (S12.6) ───
// Un appel pour tout le modèle : la structure (Viewbox, type de la bibliothèque ou nouveau type, rôle et section de
// chaque groupe de barres relevé par l'outil, assemblages probables), les produits, les regroupements, les incohérences
// et les questions. Tout revient « proposé par l'IA » : une réponse humaine n'est jamais remplacée (désaccord = alerte
// « l'IA pense que… »), rien n'est retenu sans clic, et « Annuler l'analyse IA » remet les réponses d'avant.

/** Module du modèle tel que l'écran le connaît (repère mesuré, niveau). */
export interface AnalysisModule {
  id: string;
  typeKey: string;
  level: number;
  dims: { long: number; short: number; height: number };
}

export interface AnalysisBarGroup {
  group: string;
  roleGuess: FrameRole;
  /** barres du frame relevé (ids) */
  bars: string[];
  count: number;
  lengths: [number, number];
  shape: string | null;
  dims: Record<string, number> | null;
  current: string | null;
  /** nom lisible de la section retenue (« C 153 × 80 × 4 (relevé) ») */
  currentName: string | null;
  candidates: Array<{ key: string; name: string; diff: string; match: boolean }>;
}

export interface ModelAnalysisPayload {
  modules: Array<Record<string, unknown>>;
  structure: { moduleKey: string; groups: AnalysisBarGroup[]; pieces: number; maxEccentricity: number; warnings: string[] } | null;
  products: Array<Record<string, unknown>>;
  options: {
    moduleTypes: Array<{ key: string; name: string; summary?: string }>;
    barGroups: Record<string, string[]>;
    frameRoles: string[];
    natures: Record<PartRole, PartNature[]>;
    materials: Array<{ key: string; name: string }>;
    sections: Array<{ key: string; name: string }>;
    joints: Record<string, string[]>;
  };
}

export const JOINT_MODELS = {
  column: ['semi', 'rigid', 'pinned', 'unknown'],
  stack: ['plates', 'corner-casting', 'clamp', 'bolted', 'none', 'unknown'],
  side: ['bolts', 'contact-only', 'custom', 'unknown'],
} as const;

const r0 = (x: number) => Math.round(x);
const len = (b: { a: readonly number[]; b: readonly number[] }) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]);

/** Groupes de barres relevées : même rôle proposé + même section retenue (ou même coupe mesurée). */
export function barGroups(ex: FrameExtraction): AnalysisBarGroup[] {
  const g = new Map<string, AnalysisBarGroup>();
  for (const b of ex.bars) {
    if (b.role === 'none') continue;
    const k = `${b.role}|${b.sectionKey ?? (b.section ? `${b.section.shape}:${Object.values(b.section.dims).join('x')}` : '?')}`;
    let row = g.get(k);
    if (!row) {
      const cands = b.candidates.slice(0, 3).map((c) => ({ key: c.entry.key, name: c.entry.section.name, diff: c.diff, match: c.match }));
      row = {
        group: `G${g.size + 1}`,
        roleGuess: b.role,
        bars: [],
        count: 0,
        lengths: [Infinity, 0],
        shape: b.section?.shape ?? null,
        dims: b.section ? (Object.fromEntries(Object.entries(b.section.dims).map(([n, v]) => [n, Math.round((v as number) * 10) / 10])) as Record<string, number>) : null,
        current: b.sectionKey,
        currentName: b.sectionKey ? (ex.newSections.find((x) => x.key === b.sectionKey)?.section.name ?? b.candidates.find((c) => c.entry.key === b.sectionKey)?.entry.section.name ?? b.sectionKey) : null,
        candidates: cands,
      };
      g.set(k, row);
    }
    const L = r0(len(b.measured));
    row.bars.push(b.id);
    row.count++;
    row.lengths = [Math.min(row.lengths[0], L), Math.max(row.lengths[1], L)];
  }
  return [...g.values()];
}

/** Sections permises pour un groupe : la section retenue par l'outil et ses (au plus) 3 candidats du catalogue. */
export const groupSectionKeys = (g: AnalysisBarGroup) => [...new Set([...(g.current ? [g.current] : []), ...g.candidates.map((c) => c.key)])];

/** Ce que l'analyse IA reçoit (sans les images, ajoutées par l'écran). Fonction pure, testée (< 5 Mo). */
export function modelAnalysisPayload(input: {
  recognition: Pick<Recognition, 'types'>;
  modules: readonly AnalysisModule[];
  library: readonly LibraryEntry[];
  /** structure relevée du type de module analysé (le premier qui a une structure dessinée) */
  drawn?: { moduleKey: string; extraction: FrameExtraction } | null;
  structures?: RecognitionInput['structures'];
}): ModelAnalysisPayload {
  const { recognition, modules, library } = input;
  const lib = library.filter((e) => !e.disabled);
  const moduleTypes = lib.filter((e): e is ModuleTypeEntry => e.kind === 'module_type' && !!e.template);
  const types = recognition.types;
  const answerOf = (t: PartType) =>
    t.assignment
      ? Object.fromEntries(
          Object.entries({ role: t.assignment.role, nature: t.assignment.nature, material: t.assignment.material, section: t.assignment.section, moduleTemplate: t.assignment.moduleTemplate, windClosed: t.assignment.windClosed, weight: t.assignment.weight }).filter(([, v]) => v !== undefined),
        )
      : null;
  const modulesOut = types
    .filter((t) => t.kind === 'module')
    .map((t) => {
      const ms = modules.filter((m) => m.typeKey === t.key);
      const d = ms[0]?.dims;
      const levels = [...new Set(ms.map((m) => m.level))].sort((a, b) => a - b);
      const conf = input.structures?.[t.key];
      return {
        typeKey: t.key,
        label: t.label,
        definition: t.sample?.definition ?? null,
        count: t.moduleIds.length,
        ids: t.moduleIds.slice(0, 40),
        ...(d ? { dims: { long: r0(d.long), short: r0(d.short), height: r0(d.height) } } : {}),
        levels,
        stacked: ms.filter((m) => m.level > 0).length,
        status: t.status,
        answer: answerOf(t),
        ...(conf
          ? {
              drawnBars: conf.bars,
              conformity: Object.fromEntries(Object.entries(conf.byTemplate).map(([k, c]) => [k, { ok: c.ok, differences: c.differences.slice(0, 5) }])),
            }
          : {}),
      };
    });
  const ex = input.drawn?.extraction;
  const groups = ex ? barGroups(ex) : [];
  const structure = ex
    ? {
        moduleKey: input.drawn!.moduleKey,
        groups,
        pieces: ex.pieces.length,
        maxEccentricity: r0(ex.maxEccentricity),
        warnings: ex.warnings.slice(0, 10),
      }
    : null;
  const products = types
    .filter((t) => t.kind === 'item')
    .slice(0, 400)
    .map((t) => ({
      typeKey: t.key,
      label: t.label,
      category: t.category,
      definition: t.sample?.definition ?? null,
      articleRef: t.sample?.articleRef ?? null,
      materials: t.fingerprint?.materials.slice(0, 8) ?? [],
      ...(t.fingerprint ? { dims: [...t.fingerprint.dims].map(r0), triangles: t.fingerprint.triangles } : {}),
      instances: t.nodeIds.length,
      modules: t.moduleIds.slice(0, 12),
      status: t.status,
      answer: answerOf(t),
    }));
  const base = identifyOptions(library);
  const groupSections = new Set(groups.flatMap(groupSectionKeys));
  const sectionNames = new Map(lib.filter((e): e is SectionEntry => e.kind === 'section').map((e) => [e.key, e.section.name]));
  for (const g of groups) for (const c of g.candidates) sectionNames.set(c.key, c.name);
  return {
    modules: modulesOut,
    structure,
    products,
    options: {
      moduleTypes: moduleTypes.map((e) => ({
        key: e.key,
        name: e.name,
        summary: `${e.nominal.long} × ${e.nominal.short} × ${e.nominal.height} mm, ${moduleFamily(e) === 'viewbox' ? 'Viewbox' : 'type personnalisé'}${e.template === 'frame' ? ', structure en barres' : ''}`,
      })),
      barGroups: Object.fromEntries(groups.map((g) => [g.group, groupSectionKeys(g)])),
      frameRoles: [...FRAME_ROLES],
      natures: base.natures,
      materials: base.materials,
      sections: [...base.sections, ...[...groupSections].filter((k) => !base.sections.some((s) => s.key === k)).map((k) => ({ key: k, name: sectionNames.get(k) ?? k }))],
      joints: { column: [...JOINT_MODELS.column], stack: [...JOINT_MODELS.stack], side: [...JOINT_MODELS.side] },
    },
  };
}

/** Réponse de l'analyse (déjà normalisée par le serveur). */
export interface ModelAnalysisOut {
  structure: {
    verdict: 'viewbox' | 'library-type' | 'new-type' | 'unsure';
    moduleType?: string | null;
    confidence: number;
    reasons: string[];
    barGroups: Array<{ group: string; role: string; section: string | null; roll: 'edge' | 'flat' | 'open-in' | 'open-out' | null; confidence: number; note: string }>;
    joints: { column: (typeof JOINT_MODELS.column)[number]; stack: (typeof JOINT_MODELS.stack)[number]; side: (typeof JOINT_MODELS.side)[number]; evidence: string };
    deck: { span: 'u' | 'v' | 'two-way' | 'unknown'; material: string | null };
  };
  products: Array<IdentifySuggestion & { typeKey: string }>;
  groups: GroupProposal[];
  alerts: string[];
  questions: string[];
}

/** Analyse gardée avec l'étude (`settings.aiAnalysis`, la dernière seulement). */
export interface StoredAnalysis {
  id: string;
  at: string;
  model: string;
  costUsd: number | null;
  out: ModelAnalysisOut;
  removed: string[];
  /** module analysé et ses groupes de barres (pour appliquer les propositions à l'atelier) */
  moduleKey: string | null;
  groups: AnalysisBarGroup[];
  /** décisions ligne par ligne : clé de type / « G3 » / « structure » → refusé */
  refused: string[];
  /** réponses d'avant l'analyse pour les types qu'elle propose (null = pas de réponse) : « Annuler l'analyse IA » */
  before: Record<string, StoredAssignment | null>;
  /** relance avec les réponses déjà faite (une seule) */
  relaunched?: boolean;
}

export interface ProductProposal {
  typeKey: string;
  label: string;
  assignment: PartAssignment;
  status: 'suggested' | 'unknown';
  confidence: number;
  rationale: string;
  questions: string[];
  /** réponse humaine présente : la proposition n'est pas appliquée ; désaccord éventuel en clair */
  human: boolean;
  disagree?: string;
}

export interface FrameProposal {
  moduleKey: string;
  verdict: ModelAnalysisOut['structure']['verdict'];
  /** type de la bibliothèque proposé pour le module (Viewbox / type déjà connu) */
  moduleTemplate: string | null;
  confidence: number;
  reasons: string[];
  /** barre du frame relevé → rôle et section proposés */
  bars: Record<string, { role: FrameRole; section: string | null; group: string; roll: string | null; note: string; confidence: number }>;
  groups: Array<{ group: string; roleGuess: FrameRole; role: FrameRole; section: string | null; sectionName: string | null; current: string | null; currentName: string | null; count: number; confidence: number; note: string; roll: string | null }>;
  joints: ModelAnalysisOut['structure']['joints'];
  deckSpan: 'u' | 'v' | 'two-way' | null;
}

export interface AnalysisProposals {
  products: ProductProposal[];
  /** propositions à donner à `recognize` (types sans réponse humaine, propositions refusées exclues) */
  recognition: Record<string, AiTypeProposal>;
  frame: FrameProposal | null;
  groups: GroupProposal[];
  alerts: string[];
  questions: string[];
}

const HUMAN: ReadonlySet<PartType['source']> = new Set(['local', 'library']);
const same = (a: PartAssignment, b: PartAssignment) => a.role === b.role && a.nature === b.nature && (a.moduleTemplate ?? null) === (b.moduleTemplate ?? null);

/**
 * Réponse de l'analyse → propositions. `base` = la reconnaissance SANS les propositions IA (réponses humaines,
 * bibliothèque, empreinte, catégorie). Le poids : celui de la bibliothèque / de la catégorie d'abord ; un poids de l'IA
 * n'est repris qu'à défaut, marqué « estimation IA — à confirmer ».
 */
export function analysisToProposals(a: StoredAnalysis, base: Pick<Recognition, 'types'>, library: readonly LibraryEntry[] = []): AnalysisProposals {
  const refused = new Set(a.refused);
  const byKey = new Map(base.types.map((t) => [t.key, t]));
  const products: ProductProposal[] = [];
  const rec: Record<string, AiTypeProposal> = {};
  const alerts = [...a.out.alerts];
  const name = (k?: string | null) => (k ? (library.find((e) => e.key === k)?.name ?? k) : '');
  for (const p of a.out.products) {
    const t = byKey.get(p.typeKey);
    if (!t || t.kind !== 'item') continue;
    const s = suggestionToAssignment(p);
    const as = { ...s.assignment };
    const prior = t.assignment;
    if (prior?.weight && as.role === 'load') as.weight = prior.weight;
    else if (as.weight) as.note = `${as.note ?? ''} — poids : estimation IA, à confirmer`.slice(0, 500);
    const human = HUMAN.has(t.source);
    const pr: ProductProposal = { typeKey: t.key, label: t.label, assignment: as, status: s.status, confidence: p.confidence, rationale: p.rationale, questions: p.questions ?? [], human };
    if (human && prior && !same(prior, as)) {
      pr.disagree = `l’IA pense que « ${t.label} » est ${as.role === 'ignored' ? 'à ignorer' : `${as.role} / ${as.nature}`} (réponse actuelle : ${prior.role} / ${prior.nature})`;
      alerts.push(pr.disagree);
    }
    products.push(pr);
    if (!human && !refused.has(t.key))
      rec[t.key] = { assignment: as, status: s.status, reason: `proposé par l’IA (${Math.round(p.confidence * 100)} %) : ${p.rationale}`.slice(0, 400), confidence: p.confidence, questions: p.questions ?? [], analysisId: a.id };
  }
  // structure : le type de module analysé
  let frame: FrameProposal | null = null;
  const st = a.out.structure;
  const mk = a.moduleKey ?? base.types.find((t) => t.kind === 'module')?.key ?? null;
  const mt = mk ? byKey.get(mk) : undefined;
  if (mk && mt) {
    const moduleTemplate = (st.verdict === 'viewbox' || st.verdict === 'library-type') && st.moduleType ? st.moduleType : st.verdict === 'viewbox' ? 'VIEWBOX-5900-EU' : null;
    const bars: FrameProposal['bars'] = {};
    const groups: FrameProposal['groups'] = [];
    for (const g of a.groups) {
      const pg = st.barGroups.find((x) => x.group === g.group);
      if (!pg || refused.has(g.group)) continue;
      const role = (FRAME_ROLES as readonly string[]).includes(pg.role) ? (pg.role as FrameRole) : g.roleGuess;
      const section = pg.section && groupSectionKeys(g).includes(pg.section) ? pg.section : null;
      const sectionName = section ? (section === g.current ? g.currentName : (g.candidates.find((c) => c.key === section)?.name ?? section)) : null;
      groups.push({ group: g.group, roleGuess: g.roleGuess, role, section, sectionName, current: g.current, currentName: g.currentName ?? g.current, count: g.count, confidence: pg.confidence, note: pg.note, roll: pg.roll });
      for (const id of g.bars) bars[id] = { role, section, group: g.group, roll: pg.roll, note: pg.note, confidence: pg.confidence };
    }
    frame = {
      moduleKey: mk,
      verdict: st.verdict,
      moduleTemplate,
      confidence: st.confidence,
      reasons: st.reasons,
      bars,
      groups,
      joints: st.joints,
      deckSpan: st.deck.span === 'unknown' ? null : st.deck.span,
    };
    if (moduleTemplate && !refused.has('structure')) {
      const as: PartAssignment = { role: 'structural', nature: 'viewbox', moduleTemplate, note: `proposé par l’IA (confiance ${Math.round(st.confidence * 100)} %) : ${st.reasons.join(' ')}`.slice(0, 500) };
      const status = st.confidence >= AI_CONFIDENCE_MIN ? 'suggested' : 'unknown';
      if (HUMAN.has(mt.source)) {
        if (mt.assignment && !same(mt.assignment, as)) alerts.push(`l’IA pense que « ${mt.label} » est « ${name(moduleTemplate)} » (réponse actuelle : « ${name(mt.assignment.moduleTemplate) || mt.assignment.nature} »)`);
      } else rec[mk] = { assignment: as, status, reason: `proposé par l’IA (${Math.round(st.confidence * 100)} %) : ${name(moduleTemplate)}`, confidence: st.confidence, questions: [], analysisId: a.id };
    }
  }
  return { products, recognition: rec, frame, groups: a.out.groups.filter((g) => !refused.has(`group:${g.label}`)), alerts, questions: a.out.questions };
}

/** Réponses d'avant l'analyse pour les types qu'elle touche (instantané pour « Annuler l'analyse IA »). */
export function snapshotBefore(assignments: Assignments, keys: Iterable<string>): Record<string, StoredAssignment | null> {
  const out: Record<string, StoredAssignment | null> = {};
  for (const k of keys) out[k] = assignments[k] ? structuredClone(assignments[k]) : null;
  return out;
}

/** Accepter une proposition : réponse locale du modèle, marquée de l'analyse (annulable). */
export function acceptProposal(assignments: Assignments, typeKey: string, assignment: PartAssignment, analysisId: string, by?: string, at = new Date().toISOString(), force = false): Assignments {
  // réponse humaine : jamais écrasée, sauf « Appliquer sa proposition » (force, sur confirmation ; l'annulation la remet)
  if (!force && assignments[typeKey] && assignments[typeKey].ai !== analysisId) return assignments;
  return { ...assignments, [typeKey]: { assignment, scope: 'model', at, ...(by ? { by } : {}), ai: analysisId } };
}

/** « Annuler l'analyse IA » : les réponses acceptées depuis l'analyse retirées, celles d'avant remises à l'identique. */
export function undoAnalysis(assignments: Assignments, a: Pick<StoredAnalysis, 'id' | 'before'>): Assignments {
  const next: Assignments = { ...assignments };
  for (const [k, v] of Object.entries(assignments)) {
    if (v.ai !== a.id) continue;
    const prev = a.before[k];
    if (prev) next[k] = structuredClone(prev);
    else delete next[k];
  }
  return next;
}

/** Applique les propositions de structure acceptées aux barres d'un frame relevé (rôle + section). */
export function applyFrameProposal<B extends { id: string; role: FrameRole; section: string }>(bars: readonly B[], fp: FrameProposal): B[] {
  return bars.map((b) => {
    const p = fp.bars[b.id];
    if (!p) return b;
    return { ...b, role: p.role, ...(p.section ? { section: p.section } : {}) };
  });
}

/** Coût estimé avant le lancement (ordre de grandeur, tarif du modèle par défaut) : jetons ≈ caractères / 3,5. */
export function estimateAnalysisCost(payload: ModelAnalysisPayload, images: number, model = ''): { tokensIn: number; costUsd: number } {
  // même table que le journal du serveur (structureAiGuard.costOf), $ par million de jetons
  const price = /opus-5-5/.test(model) ? { input: 4, output: 20 } : /sonnet/.test(model) ? { input: 3, output: 15 } : /haiku/.test(model) ? { input: 1, output: 5 } : { input: 5, output: 25 };
  const tokensIn = Math.round(JSON.stringify(payload).length / 3.5) + 3000 + images * 1600;
  const tokensOut = 4000 + 60 * payload.products.length;
  return { tokensIn, costUsd: (tokensIn * price.input + tokensOut * price.output) / 1e6 };
}
