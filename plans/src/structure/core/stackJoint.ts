// Liaison personnalisée appliquée aux Viewbox empilées d'une étude (S11b) : la pièce remplace (ou complète) les plats
// d'empilement à chaque angle. Calcul : résistances d'une pièce par la méthode des composants (checks/jointDesign),
// vérifiées sous les efforts réels des liaisons d'angle du calcul complet (checkVerticalLink / checkStackShear) ;
// raideur : la liaison d'angle du modèle prend la raideur des pièces, réduite par le jeu de montage (raideur sécante
// k / (1 + k · jeu / F), F = moitié de la résistance au glissement d'une pièce — approche simplifiée, signalée). Une
// liaison prototype, indicative ou incomplète plafonne le verdict. Fonctions pures ; N, mm.
import type { PlacedModule } from './assemble';
import type { ConnectionSet, CustomJoint } from './checks/joints';
import { connectionSet } from './checks/joints';
import type { JointCalc } from './checks/jointDesign';
import { computeJoint } from './checks/jointDesign';
import type { JointDesign } from './jointDesign';
import { QUALIFICATION_LABEL } from './jointDesign';
import type { JointRevalidation, JointRow } from './jointRevalidation';
import type { LibraryEntry } from './library';
import { fmtNumber } from './units';

export interface StackJointMod {
  design: JointDesign;
  /** pièces par angle (défaut : celui de la pièce) */
  perCorner?: number;
  /** Viewbox du dessus concernées (défaut : toutes les Viewbox empilées) */
  modules?: string[];
}

/** Raideur sécante d'une pièce au glissement (N/mm), jeu de montage compris. */
export function secantStiffness(k: number, play: number, F: number): number {
  if (!(k > 0)) return 0;
  if (!(play > 0) || !(F > 0)) return k;
  return k / (1 + (k * play) / F);
}

export function customJointOf(m: StackJointMod, calc: JointCalc = computeJoint(m.design)): CustomJoint {
  const d = m.design;
  return {
    key: d.key,
    name: d.name,
    perCorner: Math.max(0, m.perCorner ?? d.perCorner),
    replaces: d.replaces === 'verticalLink',
    uplift: d.function.antiUplift ? calc.directions.uplift.capacity : 0,
    slideLong: d.function.antiSlide ? calc.directions.slideLong.capacity : 0,
    slideShort: d.function.antiSlide ? calc.directions.slideShort.capacity : 0,
    status: calc.status,
    qualification: QUALIFICATION_LABEL[d.qualification],
    missing: calc.missing,
  };
}

/**
 * Applique la liaison aux Viewbox empilées : jeu d'assemblages par Viewbox (pièce personnalisée), raideur des
 * liaisons d'angle, ligne de statut dans la revalidation des assemblages.
 */
export function applyStackJoint(
  inp: { modules: PlacedModule[]; library: readonly LibraryEntry[]; joints?: JointRevalidation },
  m: StackJointMod | null | undefined,
): { modules: PlacedModule[]; joints?: JointRevalidation; warnings: string[] } {
  if (!m) return { modules: inp.modules, joints: inp.joints, warnings: [] };
  const warnings: string[] = [];
  const calc = computeJoint(m.design);
  const cj = customJointOf(m, calc);
  const scope = m.modules?.length ? new Set(m.modules) : null;
  const upper = inp.modules.filter((pm) => pm.level > 0 && (!scope || scope.has(pm.id)));
  if (!upper.length) warnings.push(`Liaison « ${m.design.name} » : aucune Viewbox empilée concernée.`);
  const base = connectionSet(inp.library);
  const perModule: Record<string, ConnectionSet> = { ...(inp.joints?.perModule ?? {}) };
  for (const pm of upper) perModule[pm.id] = { ...(perModule[pm.id] ?? base), custom: cj };
  // raideur des liaisons d'angle : n pièces par angle
  const k = m.design.stiffness.slide;
  const slideMin = Math.min(cj.slideLong ?? 0, cj.slideShort ?? 0);
  const kPiece = k ? secantStiffness(k, m.design.stiffness.play ?? 0, slideMin / 2) : 0;
  const kCorner = kPiece * cj.perCorner;
  const modules = inp.modules.map((pm) => (kCorner > 0 && upper.some((u) => u.id === pm.id) ? { ...pm, params: { ...pm.params, springs: { ...pm.params.springs, cornerLinkShear: kCorner } } } : pm));
  const stiffNotes: string[] = [];
  if (!k) stiffNotes.push('raideur non renseignée : raideur des liaisons d’angle d’origine gardée dans le calcul');
  else if ((m.design.stiffness.play ?? 0) > 0) stiffNotes.push(`Liaison « ${m.design.name} » : jeu de montage ${fmtNumber(m.design.stiffness.play!, 1)} mm pris en compte par une raideur sécante (${fmtNumber((kPiece / 1e3) * 10, 1)} kN/cm par pièce au lieu de ${fmtNumber((k / 1e3) * 10, 1)}) — approche simplifiée.`);
  const status: JointRow['status'] = calc.status === 'unknown' ? 'unknown' : calc.status === 'indicative' || m.design.qualification === 'prototype' ? 'indicative' : 'recalculated';
  const reasons = [
    `${m.design.replaces === 'verticalLink' ? 'remplace les plats d’empilement' : 'en plus des plats d’empilement'} ; ${fmtNumber(cj.perCorner, 1)} pièce(s) par angle`,
    QUALIFICATION_LABEL[m.design.qualification] + (m.design.qualification === 'prototype' ? ' : calcul analytique, essai de qualification recommandé' : ''),
    ...calc.indicative,
    ...calc.noPath.map((d) => `ne retient rien en ${d === 'uplift' ? 'soulèvement' : 'glissement'}`),
    ...stiffNotes,
  ];
  const row: JointRow = {
    connection: m.design.key,
    name: `Liaison personnalisée « ${m.design.name} »`,
    modules: upper.map((u) => u.id),
    status,
    reasons,
    capacities: (['uplift', 'slideLong', 'slideShort'] as const).map((d) => ({
      key: d,
      label: d === 'uplift' ? 'soulèvement par pièce' : d === 'slideLong' ? 'glissement le long du grand côté par pièce' : 'glissement le long du petit côté par pièce',
      after: cj[d] ?? undefined,
      unit: 'N' as const,
    })),
    records: (['uplift', 'slideLong', 'slideShort'] as const).flatMap((d) => calc.directions[d].steps.map((s) => s.record).filter((r): r is NonNullable<typeof r> => !!r)),
    ...(calc.missing.length ? { missing: [] } : {}),
  };
  const rows = [...(inp.joints?.rows ?? []).filter((r) => r.connection !== m.design.key), row];
  const capNote =
    status === 'unknown'
      ? `${row.name} : données manquantes (${calc.missing.slice(0, 4).join(' ; ')}) — vérifications bloquées`
      : status === 'indicative'
        ? `${row.name} : ${m.design.qualification === 'prototype' ? 'prototype non qualifié' : 'capacité indicative'} — à faire valider par un ingénieur`
        : '';
  const joints: JointRevalidation = {
    perModule,
    rows,
    cap: status !== 'recalculated' || inp.joints?.cap === 'limit' ? 'limit' : 'none',
    reasons: [...(inp.joints?.reasons ?? []), ...(capNote ? [capNote] : [])],
  };
  return { modules, joints, warnings };
}
