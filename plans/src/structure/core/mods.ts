// Modifications d'une étude hors du modèle SketchUp (proposées par le conseil ingénieur ou saisies à la main) :
// sections renforcées, lest, contreventements, Viewbox ajoutées, surélévation. Appliquées aux entrées du calcul avant
// l'assemblage ; le rapport les liste. Les sections « paramétriques » (tube, rond, bois…) sont calculées avec le
// catalogue, jamais données par l'IA. Fonctions pures ; N, mm.
import type { PlacedModule, RaiseSpec } from './assemble';
import { SIDE_NAME } from './assemble';
import type { Fabrication, Section, SectionProps } from './catalog';
import { chs, rectangle, rhs, roundBar } from './catalog';
import type { EstimateModule } from './estimate';
import type { ConnectionEntry, LibraryEntry, SectionEntry } from './library';
import type { EdgeItem } from './loads';
import { materialByKey } from './materials';
import type { Side } from './templates/viewboxEU';
import { fmtNumber } from './units';

/** Barres du gabarit Viewbox dont la section peut être remplacée (mêmes clés que les familles du modèle). */
export type SectionSlot = 'rim-floor' | 'rim-roof' | 'secondary-floor' | 'secondary-roof' | 'column' | 'foot-corner' | 'foot-middle';

export const SLOT_LABEL: Record<SectionSlot, string> = {
  'rim-floor': 'rives du plancher',
  'rim-roof': 'rives de toiture',
  'secondary-floor': 'traverses et lisses du plancher',
  'secondary-roof': 'traverses et lisses de toiture',
  column: 'poteaux',
  'foot-corner': 'réceptions de pied d’angle',
  'foot-middle': 'réceptions de pied centrales',
};

export interface CustomSectionSpec {
  shape: 'SHS' | 'RHS' | 'CHS' | 'RECT' | 'ROUND';
  /** h, b, t (tubes rectangulaires et carrés, bois), d, t (tube rond), d (rond plein), en mm */
  h?: number;
  b?: number;
  t?: number;
  d?: number;
  material: string;
  fabrication?: 'hot-finished' | 'cold-formed';
}

export type AddSide = Side | 'top';

export interface StudyMods {
  sections?: Array<{ slot: SectionSlot; section: string; modules?: string[] }>;
  customSections?: Array<CustomSectionSpec & { key: string }>;
  /** lest posé sur le plancher d'une Viewbox (kg, réparti sur ses 4 rives) */
  ballast?: Array<{ module: string; kg: number }>;
  bracings?: Array<{ module: string; side: Side }>;
  /** Viewbox ajoutées à côté (ou au-dessus) d'une Viewbox existante ou ajoutée avant */
  addedModules?: Array<{ id: string; from: string; side: AddSide }>;
  raise?: RaiseSpec | null;
  /** plats d'empilement par côté (défaut : bibliothèque, 2 par grand côté et 1 par petit côté) */
  stackPlates?: { perLongSide: number; perShortSide: number } | null;
}

export const EMPTY_MODS: StudyMods = {};

export function modsCount(m: StudyMods | undefined): number {
  if (!m) return 0;
  return (m.sections?.length ?? 0) + (m.ballast?.length ?? 0) + (m.bracings?.length ?? 0) + (m.addedModules?.length ?? 0) + (m.raise ? 1 : 0) + (m.stackPlates ? 1 : 0);
}

/** Somme de deux jeux de modifications (la surélévation de `b` remplace celle de `a`, un lest sur la même Viewbox aussi). */
export function mergeMods(a: StudyMods | undefined, b: StudyMods | undefined): StudyMods {
  const A = a ?? {};
  const B = b ?? {};
  const bySlot = (x: NonNullable<StudyMods['sections']>[number]) => `${x.slot}|${(x.modules ?? []).join(',')}`;
  const sections = new Map([...(A.sections ?? []), ...(B.sections ?? [])].map((x) => [bySlot(x), x]));
  const ballast = new Map([...(A.ballast ?? []), ...(B.ballast ?? [])].map((x) => [x.module, x]));
  const bracings = new Map([...(A.bracings ?? []), ...(B.bracings ?? [])].map((x) => [`${x.module}|${x.side}`, x]));
  const added = new Map([...(A.addedModules ?? []), ...(B.addedModules ?? [])].map((x) => [x.id, x]));
  const custom = new Map([...(A.customSections ?? []), ...(B.customSections ?? [])].map((x) => [x.key, x]));
  const out: StudyMods = {};
  if (sections.size) out.sections = [...sections.values()];
  if (custom.size) out.customSections = [...custom.values()];
  if (ballast.size) out.ballast = [...ballast.values()].filter((x) => x.kg > 0);
  if (bracings.size) out.bracings = [...bracings.values()];
  if (added.size) out.addedModules = [...added.values()];
  const raise = B.raise !== undefined ? B.raise : A.raise;
  if (raise) out.raise = raise;
  const plates = B.stackPlates !== undefined ? B.stackPlates : A.stackPlates;
  if (plates) out.stackPlates = plates;
  return out;
}

// ─── sections paramétriques ───

const r1 = (v: number) => Math.round(v * 10) / 10;

export function customSectionKey(s: CustomSectionSpec): string {
  const d = s.shape === 'CHS' ? `${r1(s.d ?? 0)}x${r1(s.t ?? 0)}` : s.shape === 'ROUND' ? `${r1(s.d ?? 0)}` : s.shape === 'SHS' ? `${r1(s.h ?? 0)}x${r1(s.t ?? 0)}` : `${r1(s.h ?? 0)}x${r1(s.b ?? 0)}${s.shape === 'RECT' ? '' : `x${r1(s.t ?? 0)}`}`;
  return `ETUDE-${s.shape}-${d}-${s.material}${s.fabrication === 'cold-formed' ? '-CF' : ''}`;
}

/** Nom lisible : « SHS 120 × 120 × 5 (S355, formé à chaud) », « Bois 100 × 100 (C24) ». */
export function customSectionName(s: CustomSectionSpec): string {
  const f = (v?: number) => fmtNumber(v ?? 0, v !== undefined && v % 1 ? 1 : 0);
  const fab = s.fabrication === 'cold-formed' ? ', formé à froid' : s.shape === 'RECT' || s.shape === 'ROUND' ? '' : ', formé à chaud';
  if (s.shape === 'RECT') return `Bois ${f(s.b)} × ${f(s.h)} (${s.material})`;
  if (s.shape === 'ROUND') return `Rond plein Ø ${f(s.d)} (${s.material})`;
  if (s.shape === 'CHS') return `Tube rond ${f(s.d)} × ${f(s.t)} (${s.material}${fab})`;
  if (s.shape === 'SHS') return `Tube carré ${f(s.h)} × ${f(s.h)} × ${f(s.t)} (${s.material}${fab})`;
  return `Tube rectangulaire ${f(s.h)} × ${f(s.b)} × ${f(s.t)} (${s.material}${fab})`;
}

/** Vérifie une section paramétrique ; message d'erreur ou null. */
export function customSectionProblem(s: CustomSectionSpec): string | null {
  const m = materialByKey(s.material);
  if (!m) return `matériau ${s.material} inconnu`;
  const pos = (v?: number) => v !== undefined && Number.isFinite(v) && v > 0;
  if (s.shape === 'RECT') {
    if (m.family !== 'timber') return 'section rectangulaire pleine : bois seulement (C24, GL24h)';
    if (!pos(s.h) || !pos(s.b)) return 'dimensions h et b requises';
    return null;
  }
  if (m.family !== 'steel') return `${s.shape} : acier seulement (S235, S275, S355)`;
  if (s.shape === 'ROUND') return pos(s.d) ? null : 'diamètre d requis';
  if (s.shape === 'CHS') return pos(s.d) && pos(s.t) && s.t! < s.d! / 2 ? null : 'diamètre d et épaisseur t requis';
  if (!pos(s.h) || !pos(s.t) || (s.shape === 'RHS' && !pos(s.b))) return 'dimensions h, (b) et t requises';
  const b = s.shape === 'SHS' ? s.h! : s.b!;
  if (2 * s.t! >= Math.min(s.h!, b)) return 'épaisseur trop forte pour ces dimensions';
  return null;
}

/** Entrée de bibliothèque d'une section paramétrique (propriétés calculées par le catalogue). */
export function customSectionEntry(s: CustomSectionSpec): SectionEntry {
  const problem = customSectionProblem(s);
  if (problem) throw new Error(`Section ${customSectionName(s)} : ${problem}`);
  const key = customSectionKey(s);
  const mat = materialByKey(s.material)!;
  const fab: Fabrication = s.shape === 'RECT' ? 'timber' : s.shape === 'ROUND' ? 'hot-rolled' : (s.fabrication ?? 'hot-finished');
  let props: SectionProps;
  let dims: Record<string, number>;
  if (s.shape === 'RECT') [props, dims] = [rectangle(s.b!, s.h!), { h: s.h!, b: s.b! }];
  else if (s.shape === 'ROUND') [props, dims] = [roundBar(s.d!), { d: s.d! }];
  else if (s.shape === 'CHS') [props, dims] = [chs(s.d!, s.t!), { d: s.d!, t: s.t! }];
  else {
    const b = s.shape === 'SHS' ? s.h! : s.b!;
    [props, dims] = [rhs(s.h!, b, s.t!, fab === 'cold-formed' ? 'cold-formed' : 'hot-finished'), { h: s.h!, b, t: s.t! }];
  }
  // courbes EN 1993-1-1 tab. 6.2 : tubes formés à chaud a, formés à froid c, pleins c
  const curve = s.shape === 'RECT' ? undefined : fab === 'hot-finished' ? ('a' as const) : ('c' as const);
  const section: Section = { key, name: customSectionName(s), shape: s.shape, fabrication: fab, dims, curveY: curve, curveZ: curve, kgPerM: (props.A * 1e-6 * mat.rho), ...props };
  return { kind: 'section', key, name: section.name, status: 'suggested', material: s.material, section, source: [{ ref: 'study', note: 'section créée pour l’étude, propriétés calculées par le catalogue' }] };
}

// ─── application aux entrées du calcul ───

const add = (a: readonly number[], b: readonly number[], k = 1): [number, number, number] => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];

/** Viewbox ajoutée contre le côté `side` de `base` (boîtes jointives, même orientation), ou posée dessus. */
export function adjacentModule(base: PlacedModule, side: AddSide, id: string): PlacedModule {
  const p = base.params;
  const L = p.x0 + p.x1;
  const W = p.y0 + p.y1;
  const origin =
    side === 'top'
      ? add(base.origin, [0, 1, 0], p.topZ)
      : side === 'u1'
        ? add(base.origin, base.u, L)
        : side === 'u0'
          ? add(base.origin, base.u, -L)
          : side === 'v1'
            ? add(base.origin, base.v, W)
            : add(base.origin, base.v, -W);
  return { ...base, id, origin, level: side === 'top' ? base.level + 1 : base.level, params: { ...p, sections: { ...p.sections } } };
}

export interface ModsInput {
  modules: PlacedModule[];
  edgeItems: EdgeItem[];
  sections: ReadonlyMap<string, SectionEntry>;
}

export interface ModsOutput extends ModsInput {
  bracings: Array<{ module: string; side: Side }>;
  raise: RaiseSpec | null;
  /** Viewbox ajoutées (pour le calage) */
  added: PlacedModule[];
  warnings: string[];
  /** modifications non admises (lest sur une Viewbox d'étage) : verdict incomplet tant qu'elles restent */
  errors: string[];
}

/** statico 18-0573 § 1.3 / § 5.3 : « Ballast darf nur in den unteren Containern (EG) angeordnet werden. » */
export const BALLAST_RULE = 'le lest ne se pose que dans les Viewbox du rez-de-chaussée (statico 18-0573 § 5.3)';

const SLOT_PARAM: Record<SectionSlot, keyof PlacedModule['params']['sections']> = {
  'rim-floor': 'rim',
  'rim-roof': 'rimRoof',
  'secondary-floor': 'secondary',
  'secondary-roof': 'secondaryRoof',
  column: 'column',
  'foot-corner': 'footCorner',
  'foot-middle': 'footMiddle',
};

export function applyMods(inp: ModsInput, mods: StudyMods | undefined): ModsOutput {
  const warnings: string[] = [];
  const errors: string[] = [];
  const sections = new Map(inp.sections);
  for (const c of mods?.customSections ?? []) {
    try {
      const e = customSectionEntry(c);
      sections.set(e.key, e);
    } catch (e) {
      warnings.push((e as Error).message);
    }
  }
  // Viewbox ajoutées, dans l'ordre (une ajoutée peut servir de base à la suivante)
  let modules = inp.modules.map((m) => ({ ...m, params: { ...m.params, sections: { ...m.params.sections } } }));
  const added: PlacedModule[] = [];
  for (const a of mods?.addedModules ?? []) {
    const base = modules.find((m) => m.id === a.from);
    if (!base) {
      warnings.push(`Viewbox ajoutée ${a.id} : ${a.from} introuvable, ignorée.`);
      continue;
    }
    if (modules.some((m) => m.id === a.id)) {
      warnings.push(`Viewbox ajoutée ${a.id} : identifiant déjà utilisé, ignorée.`);
      continue;
    }
    const pm = adjacentModule(base, a.side, a.id);
    modules.push(pm);
    added.push(pm);
  }
  // sections remplacées
  for (const s of mods?.sections ?? []) {
    if (!sections.has(s.section)) {
      warnings.push(`Section ${s.section} absente de la bibliothèque : ${SLOT_LABEL[s.slot]} non modifiées.`);
      continue;
    }
    const targets = s.modules?.length ? new Set(s.modules) : null;
    modules = modules.map((m) => {
      if (targets && !targets.has(m.id)) return m;
      const sec = { ...m.params.sections };
      // rives et barres de toiture : sans section propre, la toiture reprend celle du plancher → la figer d'abord
      if (s.slot === 'rim-floor' && !sec.rimRoof) sec.rimRoof = sec.rim;
      if (s.slot === 'secondary-floor' && !sec.secondaryRoof) sec.secondaryRoof = sec.secondary;
      (sec as Record<string, string>)[SLOT_PARAM[s.slot]] = s.section;
      return { ...m, params: { ...m.params, sections: sec } };
    });
  }
  // lest : réparti sur les 4 rives du plancher (cas GB)
  const edgeItems = [...inp.edgeItems];
  for (const b of mods?.ballast ?? []) {
    const m = modules.find((x) => x.id === b.module);
    if (!m || !(b.kg > 0)) {
      if (!m) warnings.push(`Lest sur ${b.module} : Viewbox introuvable, ignoré.`);
      continue;
    }
    if (m.level > 0) {
      errors.push(`Lest de ${fmtNumber(b.kg, 0)} kg sur ${b.module} (étage) : non admis, ${BALLAST_RULE} — retirer ce lest`);
      continue;
    }
    const p = m.params;
    const Lu = p.x1 - p.x0;
    const Lv = p.y1 - p.y0;
    const q = (b.kg * 9.81) / (2 * (Lu + Lv));
    for (const side of ['u0', 'u1', 'v0', 'v1'] as const) edgeItems.push({ module: m.id, side, from: 0, to: side[0] === 'v' ? Lu : Lv, level: 'floor', q, loadCase: 'GB', label: `lest ${fmtNumber(b.kg, 0)} kg` });
  }
  const ids = new Set(modules.map((m) => m.id));
  const bracings = (mods?.bracings ?? []).filter((b) => {
    if (!ids.has(b.module)) warnings.push(`Contreventement sur ${b.module} : Viewbox introuvable, ignoré.`);
    return ids.has(b.module);
  });
  const raise = mods?.raise && mods.raise.height > 0 ? mods.raise : null;
  if (raise && !sections.has(raise.section)) {
    warnings.push(`Surélévation : section ${raise.section} absente de la bibliothèque, ignorée.`);
    return { modules, edgeItems, sections, bracings, raise: null, added, warnings, errors };
  }
  return { modules, edgeItems, sections, bracings, raise, added, warnings, errors };
}

/** Bibliothèque de l'étude : nombre de plats d'empilement modifié. */
export function libraryWithMods(library: readonly LibraryEntry[], mods: StudyMods | undefined): LibraryEntry[] {
  const sp = mods?.stackPlates;
  if (!sp) return [...library];
  return library.map((e) => {
    if (e.kind !== 'connection' || e.key !== 'VBX-VERTICAL-PLATE') return e;
    const c = e as ConnectionEntry;
    const set = (key: string, value: number, label: string) => {
      const caps = c.capacities.filter((x) => x.key !== key);
      return [...caps, { key, label, value, unit: '-' as const, source: { ref: 'study', note: 'nombre de plats modifié dans l’étude' } }];
    };
    let capacities = set('perLongSide', sp.perLongSide, 'plats par grand côté');
    capacities = [...capacities.filter((x) => x.key !== 'perShortSide'), { key: 'perShortSide', label: 'plats par petit côté', value: sp.perShortSide, unit: '-' as const, source: { ref: 'study', note: 'nombre de plats modifié dans l’étude' } }];
    return { ...c, capacities };
  });
}

/** Viewbox ajoutée → module de l'estimation au sol (emprise en plan x, z du monde). */
export function placedToEstimate(pm: PlacedModule): EstimateModule {
  const p = pm.params;
  const L = p.x0 + p.x1;
  const W = p.y0 + p.y1;
  const c = (u: number, v: number): [number, number] => {
    const w = add(add(pm.origin, pm.u, u), pm.v, v);
    return [w[0], w[2]];
  };
  return { id: pm.id, level: pm.level, corners: [c(0, 0), c(L, 0), c(L, W), c(0, W)], area: L * W, height: p.topZ, roofAccessible: false };
}

/** Description d'une modification, pour l'interface et le rapport (français ; traduite par le rapport). */
export function describeMods(m: StudyMods | undefined, sectionName: (key: string) => string = (k) => k): string[] {
  if (!m) return [];
  const out: string[] = [];
  for (const s of m.sections ?? []) out.push(`${SLOT_LABEL[s.slot]} en ${sectionName(s.section)}${s.modules?.length ? ` (${s.modules.join(', ')})` : ' (toutes les Viewbox)'}`);
  for (const b of m.ballast ?? []) out.push(`lest de ${fmtNumber(b.kg, 0)} kg sur le plancher de ${b.module}`);
  for (const b of m.bracings ?? []) out.push(`contreventement en croix (plat 60 × 6 + ridoir) sur ${b.module}, ${SIDE_NAME[b.side]}`);
  for (const a of m.addedModules ?? []) out.push(a.side === 'top' ? `Viewbox ${a.id} ajoutée au-dessus de ${a.from}` : `Viewbox ${a.id} ajoutée contre ${a.from}, ${SIDE_NAME[a.side]}`);
  if (m.stackPlates) out.push(`plats d’empilement : ${m.stackPlates.perLongSide} par grand côté et ${m.stackPlates.perShortSide} par petit côté`);
  if (m.raise) out.push(`surélévation de ${fmtNumber(m.raise.height / 10, 0)} cm sur poteaux ${sectionName(m.raise.section)}, tête ${m.raise.top === 'rigid' ? 'encastrée' : 'articulée'}, ${m.raise.bracing ? 'avec' : 'sans'} croix de contreventement`);
  return out;
}
