// Gabarit de calcul d'une Viewbox rendu visible : le modèle SketchUp ne contient pas les barres acier internes, l'outil
// applique à chaque Viewbox le gabarit relevé sur les modèles SCIA statico. Résumé par famille (section, matériau,
// nombre de barres, longueur) et segments 3D (repère monde, mm) pour les dessiner par-dessus la vue 3D.
// Fonctions pures.
import type { MemberFamily, PlacedModule, StructuralModel } from './assemble';
import { FAMILY_LABEL } from './assemble';
import type { LibraryEntry, ModuleTypeEntry, SectionEntry, ViewboxTemplateParams } from './library';
import { designation } from './library';
import { materialByKey } from './materials';
import type { TemplateFamily } from './templates/viewboxEU';
import { viewboxTemplate } from './templates/viewboxEU';

/** Couleur d'affichage de chaque famille de barres. */
export const FAMILY_COLORS: Record<MemberFamily, number> = {
  'rim-floor': 0x1d4ed8,
  'rim-roof': 0x0891b2,
  'secondary-floor': 0x7c3aed,
  'secondary-roof': 0xa855f7,
  column: 0xdc2626,
  'foot-corner': 0xea580c,
  'foot-plate': 0xf59e0b,
  'foot-middle': 0x65a30d,
  'corner-link': 0x111827,
  'vertical-contact': 0x6b7280,
  bolt: 0x16a34a,
  contact: 0x9ca3af,
  bracing: 0xdb2777,
  'raise-column': 0x92400e,
  'raise-bracing': 0xbe185d,
  'stair-stringer': 0x0f766e,
  'stair-landing': 0x14b8a6,
  'stair-post': 0xb91c1c,
  'stair-head': 0xf97316,
  'stair-step': 0x94a3b8,
  'stair-link': 0x111827,
  'model-beam': 0x78350f,
  'model-column': 0x78350f,
  'support-post': 0xf97316,
  'transfer-beam': 0xf97316,
  'model-link': 0x111827,
};

export interface TemplateFamilyRow {
  family: TemplateFamily;
  label: string;
  section: string;
  material: string;
  count: number;
  /** longueur totale (mm) */
  length: number;
  color: number;
}

/** Barres du gabarit d'un type de Viewbox, par famille : ce que l'outil calcule pour chaque Viewbox de ce type. */
export function templateSummary(entry: ModuleTypeEntry, library: readonly LibraryEntry[]): TemplateFamilyRow[] {
  if (!entry.params) return [];
  const t = viewboxTemplate(entry.params);
  const nodes = new Map(t.nodes.map((n) => [n.key, n]));
  const sections = new Map(library.filter((e): e is SectionEntry => e.kind === 'section').map((e) => [e.key, e]));
  const rows = new Map<string, TemplateFamilyRow>();
  for (const m of t.members) {
    const a = nodes.get(m.i)!;
    const b = nodes.get(m.j)!;
    const L = Math.hypot(b.u - a.u, b.v - a.v, b.z - a.z);
    const sec = sections.get(m.section);
    const key = `${m.family}|${m.section}`;
    const row = rows.get(key) ?? {
      family: m.family,
      label: FAMILY_LABEL[m.family],
      section: sec ? designation(sec.section.name) : m.section,
      material: sec ? (materialByKey(sec.material)?.name ?? sec.material) : '—',
      count: 0,
      length: 0,
      color: FAMILY_COLORS[m.family],
    };
    row.length += L;
    rows.set(key, row);
  }
  // nombre de barres physiques (une rive coupée en tronçons reste une barre)
  const lines = new Map<string, Set<string>>();
  for (const m of t.members) {
    const key = `${m.family}|${m.section}`;
    if (!lines.has(key)) lines.set(key, new Set());
    lines.get(key)!.add(m.line);
  }
  for (const [k, r] of rows) r.count = lines.get(k)?.size ?? 0;
  return [...rows.values()];
}

/**
 * Poids des barres acier du gabarit d'une Viewbox (N) : Σ A · L · ρ · g des barres avec masse (sections de la
 * bibliothèque, matériau de la section). Sert à l'écart de poids d'une Viewbox modifiée par rapport à la pesée.
 */
export function templateSteelWeight(params: ViewboxTemplateParams, sections: ReadonlyMap<string, SectionEntry>): number {
  const t = viewboxTemplate(params);
  const nodes = new Map(t.nodes.map((n) => [n.key, n]));
  let W = 0;
  for (const m of t.members) {
    const s = sections.get(m.section);
    if (!s || s.section.massless) continue;
    const rho = materialByKey(s.material)?.rho ?? 7850;
    const a = nodes.get(m.i)!;
    const b = nodes.get(m.j)!;
    // g = 10 m/s² comme le poids propre G1 du calcul (78,5 kN/m³)
    W += s.section.A * Math.hypot(b.u - a.u, b.v - a.v, b.z - a.z) * rho * 1e-8;
  }
  return W;
}

/** Segments monde (x, y, z, x, y, z, … en mm) et couleurs RGB 0–1 du gabarit placé sur chaque Viewbox. */
export function templateSegments(modules: readonly PlacedModule[]): { positions: Float32Array; colors: Float32Array; families: TemplateFamily[] } {
  const pos: number[] = [];
  const col: number[] = [];
  const families: TemplateFamily[] = [];
  // une Viewbox modifiée par l'étude (poteaux plus hauts…) a ses propres paramètres
  const cache = new Map<ViewboxTemplateParams, ReturnType<typeof viewboxTemplate>>();
  for (const pm of modules) {
    let t = cache.get(pm.params);
    if (!t) cache.set(pm.params, (t = viewboxTemplate(pm.params)));
    const nodes = new Map(t.nodes.map((n) => [n.key, n]));
    const w = (u: number, v: number, z: number) => [pm.origin[0] + pm.u[0] * u + pm.v[0] * v, pm.origin[1] + z, pm.origin[2] + pm.u[2] * u + pm.v[2] * v];
    for (const m of t.members) {
      const a = nodes.get(m.i)!;
      const b = nodes.get(m.j)!;
      pos.push(...w(a.u, a.v, a.z), ...w(b.u, b.v, b.z));
      const c = rgb(FAMILY_COLORS[m.family]);
      col.push(...c, ...c);
      families.push(m.family);
    }
  }
  return { positions: Float32Array.from(pos), colors: Float32Array.from(col), families };
}

/** Segments de toutes les barres du modèle de calcul assemblé (liaisons comprises), une couleur par barre. */
export function modelSegments(s: Pick<StructuralModel, 'fem' | 'meta'>, colorOf: (member: number) => number): { positions: Float32Array; colors: Float32Array } {
  const pos = new Float32Array(s.fem.members.length * 6);
  const col = new Float32Array(s.fem.members.length * 6);
  s.fem.members.forEach((b, k) => {
    const A = s.fem.nodes[b.i];
    const B = s.fem.nodes[b.j];
    pos.set([A.x, A.y, A.z, B.x, B.y, B.z], k * 6);
    const c = rgb(colorOf(k));
    col.set([...c, ...c], k * 6);
  });
  return { positions: pos, colors: col };
}

export const rgb = (c: number): [number, number, number] => [((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255];
