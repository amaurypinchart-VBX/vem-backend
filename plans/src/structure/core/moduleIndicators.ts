// Indicateurs instantanés d'une Viewbox modifiée (sans calcul aux éléments finis) : poids et écart à la pesée,
// hauteur des poteaux et de l'installation, élancement des poteaux, alertes de géométrie. Affichés dès qu'un
// paramètre change dans l'onglet Variantes. Fonctions pures ; N, mm.
import type { PlacedModule } from './assemble';
import type { SectionEntry } from './library';
import { materialByKey, steelStrength } from './materials';
import { LONG_COLUMN } from './mods';
import { fmtNumber } from './units';

export interface ModuleIndicators {
  id: string;
  level: number;
  /** poids retenu (N) = pesée + écart des barres ; écart (N) */
  weight: number;
  weightDelta: number;
  /** longueur des poteaux entre lignes de système plancher / toiture (mm) et haut de la Viewbox (mm) */
  columnLength: number;
  topZ: number;
  columnSection: string;
  /** élancement réduit des poteaux autour de l'axe faible : longueur de flambement = longueur (nœuds fixes) et 2 × longueur (console, nœuds déplaçables) */
  lambdaFixed: number;
  lambdaSway: number;
  alerts: string[];
}

export interface InstallationIndicators {
  modules: ModuleIndicators[];
  /** hauteur totale (mm), poids total des Viewbox (N) et écart total à la pesée (N) */
  height: number;
  weight: number;
  weightDelta: number;
  alerts: string[];
}

/** Élancement réduit λ̄ = Lcr / (i · 93,9 ε) (DIN EN 1993-1-1 6.3.1.3). */
export function reducedSlenderness(s: SectionEntry, Lcr: number): number {
  const m = materialByKey(s.material);
  const fy = (m && steelStrength(m, Math.max(s.section.dims.t ?? 0, s.section.dims.tf ?? 0, s.section.dims.tw ?? 0))?.fy) ?? 235;
  const i = Math.sqrt(Math.min(s.section.Iy, s.section.Iz) / s.section.A);
  return Lcr / (i * 93.9 * Math.sqrt(235 / fy));
}

export function installationIndicators(modules: readonly PlacedModule[], sections: ReadonlyMap<string, SectionEntry>, weighed: number): InstallationIndicators {
  const out: ModuleIndicators[] = [];
  for (const pm of modules) {
    const p = pm.params;
    const L = p.roofZ - p.floorZ;
    const col = sections.get(p.sections.column);
    const alerts: string[] = [];
    const lf = col ? reducedSlenderness(col, L) : NaN;
    const ls = col ? reducedSlenderness(col, 2 * L) : NaN;
    if (p.topZ > LONG_COLUMN) alerts.push(`poteaux de ${fmtNumber(p.topZ / 1e3, 2)} m : maintien intermédiaire (cadre à mi-hauteur) ou contreventement à prévoir`);
    if (ls > 2) alerts.push(`poteaux très élancés (λ̄ ${fmtNumber(ls, 2)} en console) : le flambement et le 2ᵉ ordre gouvernent`);
    if (!col) alerts.push(`section des poteaux ${p.sections.column} absente de la bibliothèque`);
    out.push({
      id: pm.id,
      level: pm.level,
      weight: weighed + (pm.weightDelta ?? 0),
      weightDelta: pm.weightDelta ?? 0,
      columnLength: L,
      topZ: p.topZ,
      columnSection: col?.section.name ?? p.sections.column,
      lambdaFixed: lf,
      lambdaSway: ls,
      alerts,
    });
  }
  const base = modules.length ? Math.min(...modules.map((m) => m.origin[1])) : 0;
  const top = modules.length ? Math.max(...modules.map((m) => m.origin[1] + m.params.topZ)) : 0;
  const height = top - base;
  const alerts: string[] = [];
  if (height > 8000) alerts.push(`hauteur de l’installation ${fmtNumber(height / 1e3, 2)} m > 8 m : profil de vent à vérifier (pression croissante avec la hauteur)`);
  return {
    modules: out,
    height,
    weight: out.reduce((a, m) => a + m.weight, 0),
    weightDelta: out.reduce((a, m) => a + m.weightDelta, 0),
    alerts,
  };
}
