// IA de l'étude structure (§13), côté module : ce qu'on envoie au serveur (jamais de clé ici) et ce qu'on fait des
// réponses. L'IA propose, l'humain valide : une identification reste « proposée » (orange) ou « inconnue » (rouge sous
// 0,5 de confiance) ; une section lue dans un document est recalculée par l'outil à partir de ses dimensions et
// comparée aux valeurs imprimées ; les capacités d'assemblage sont converties en unités internes, sans être utilisées
// par les vérifications tant qu'un humain ne les a pas reprises. Aucun chiffre de calcul ne vient de l'IA.
// Fonctions pures.
import type { Section, SectionProps, SectionShape, BucklingCurve, Fabrication } from './catalog';
import { chs, coldFormedU, rectangle, rhs, roundBar, weldedT } from './catalog';
import type { Capacity, ConnectionEntry, LibraryEntry, PartAssignment, PartNature, PartRole, SectionEntry, WeightUnit } from './library';
import { NATURES_BY_ROLE, designation } from './library';
import { MATERIALS } from './materials';
import type { PartType } from './recognition';

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
    options: {
      natures: NATURES_BY_ROLE,
      materials: MATERIALS.filter((m) => m.family !== 'massless').map((m) => ({ key: m.key, name: m.name })),
      sections: library.filter((e): e is SectionEntry => e.kind === 'section' && !e.disabled && !e.section.massless).map((e) => ({ key: e.key, name: e.name })),
    },
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
