// Panneaux composés (murs, habillages, cloisons) : poids surfacique calculé par l'outil à partir des couches
// (épaisseur × masse volumique) et d'un cadre de profilés (masse linéique × périmètre / surface d'un module de panneau).
// Les données de chaque couche viennent de l'utilisateur ou d'une recherche sur internet par l'IA, avec leur source ;
// l'IA ne calcule rien. Un panneau mémorisé est une entrée « material » de la bibliothèque. Fonctions pures.
import type { MaterialEntry } from './library';
import type { CalcRecord } from './records';
import { fmtNumber } from './units';

export type SourceCheck = 'citation' | 'quote' | 'no' | 'user';

export interface DataSource {
  url?: string;
  title?: string;
  quote?: string;
  check?: SourceCheck;
}

export interface PanelLayer {
  name: string;
  /** mm */
  thickness: number;
  /** kg/m³ */
  density: number;
  source?: DataSource;
}

export interface PanelFrame {
  name: string;
  /** masse linéique des profilés (kg/m) */
  kgPerM: number;
  /** module de panneau entouré par le cadre (mm) */
  width: number;
  height: number;
  source?: DataSource;
}

export interface CompositePanel {
  name: string;
  layers: PanelLayer[];
  frame?: PanelFrame;
}

/** Poids surfacique (kg/m²) d'un panneau composé, avec le détail du calcul. */
export function panelMass(p: CompositePanel): { kgPerM2: number; parts: Array<{ label: string; kgPerM2: number }>; record: CalcRecord } {
  const parts = p.layers.filter((l) => l.thickness > 0 && l.density > 0).map((l) => ({ label: l.name, kgPerM2: (l.thickness / 1000) * l.density }));
  const f = p.frame && p.frame.kgPerM > 0 && p.frame.width > 0 && p.frame.height > 0 ? p.frame : undefined;
  if (f) parts.push({ label: f.name, kgPerM2: (f.kgPerM * 2 * (f.width + f.height)) / 1000 / ((f.width * f.height) / 1e6) });
  const kgPerM2 = parts.reduce((a, x) => a + x.kgPerM2, 0);
  const n = (v: number, d = 2) => fmtNumber(v, d);
  const layerText = p.layers
    .filter((l) => l.thickness > 0 && l.density > 0)
    .map((l) => `${l.name} ${n(l.thickness / 1000, 3)} m · ${n(l.density, 0)} kg/m³ = ${n((l.thickness / 1000) * l.density)} kg/m²`);
  const frameText = f ? [`${f.name} ${n(f.kgPerM)} kg/m · 2 · (${n(f.width / 1000)} + ${n(f.height / 1000)}) m / (${n(f.width / 1000)} · ${n(f.height / 1000)}) m² = ${n(parts[parts.length - 1].kgPerM2)} kg/m²`] : [];
  return {
    kgPerM2,
    parts,
    record: {
      key: `panel.${p.name}`,
      title: `Poids surfacique du panneau « ${p.name} »`,
      clause: 'couches (épaisseur × masse volumique) + cadre (masse linéique × périmètre / surface)',
      formula: 'g = Σ ti · ρi + m′cadre · 2 (a + b) / (a · b)',
      withValues: `${[...layerText, ...frameText].join(' ; ')} → g = ${n(kgPerM2)} kg/m²`,
      result: kgPerM2,
    },
  };
}

/** Panneaux composés mémorisés dans la bibliothèque. */
export function panelsOf(library: readonly { kind: string }[]): Array<MaterialEntry & { panel: CompositePanel }> {
  return library.filter((e): e is MaterialEntry & { panel: CompositePanel } => e.kind === 'material' && !!(e as MaterialEntry).panel && !(e as MaterialEntry).disabled);
}

/** Entrée de bibliothèque d'un panneau composé (« proposée » tant qu'une source n'est pas vérifiée). */
export function panelEntry(p: CompositePanel): MaterialEntry {
  const key = `PANEL-${p.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)}`;
  const sourced = [...p.layers.map((l) => l.source), p.frame?.source].filter(Boolean) as DataSource[];
  const allChecked = sourced.length > 0 && sourced.every((s) => s.check === 'citation' || s.check === 'user');
  return {
    kind: 'material',
    key,
    name: p.name,
    status: allChecked ? 'known' : 'suggested',
    source: sourced.length ? sourced.map((s) => ({ ref: s.url ?? 'user', note: s.title })) : [{ ref: 'user' }],
    material: 'PANEL',
    panel: p,
  };
}

// ─── recherche sur internet (réponse du serveur) ───

export interface MaterialSearchLayer {
  name: string;
  material: string;
  thicknessMm: number | null;
  densityKgM3: number | null;
  surfaceMassKgM2: number | null;
  url: string;
  title: string;
  quote: string;
  check: { verified: 'citation' | 'quote' | 'no'; missing: number[] };
}

export interface MaterialSearchResult {
  name: string;
  layers: MaterialSearchLayer[];
  frame: null | { name: string; kgPerM: number | null; url: string; title: string; quote: string; check: { verified: 'citation' | 'quote' | 'no'; missing: number[] } };
  questions: string[];
  notes: string;
  sources: Array<{ url: string; title: string }>;
}

/**
 * Réponse de la recherche → panneau à compléter : la masse volumique vient de la source, ou est déduite par l'outil
 * d'une masse surfacique et d'une épaisseur ; une couche sans épaisseur ou sans masse est gardée à 0 (à saisir).
 */
export function panelFromSearch(r: MaterialSearchResult, frameSize = { width: 1000, height: 2790 }): CompositePanel {
  return {
    name: r.name,
    layers: r.layers.map((l) => {
      const t = l.thicknessMm ?? 0;
      const rho = l.densityKgM3 ?? (l.surfaceMassKgM2 && t > 0 ? (l.surfaceMassKgM2 * 1000) / t : 0);
      return { name: l.name || l.material, thickness: t, density: rho, source: { url: l.url, title: l.title, quote: l.quote, check: l.check.verified } };
    }),
    ...(r.frame ? { frame: { name: r.frame.name, kgPerM: r.frame.kgPerM ?? 0, width: frameSize.width, height: frameSize.height, source: { url: r.frame.url, title: r.frame.title, quote: r.frame.quote, check: r.frame.check.verified } } } : {}),
  };
}
