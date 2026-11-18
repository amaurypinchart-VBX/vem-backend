// Coupe du calage et bilan des charges sur la dalle (A. Pinchart 09.11.2026 : « que dans mon rapport on voit bien
// comment et qu'est-ce qu'on va mettre sur le sol, puis les différentes couches » ; Viewbox surélevées d'environ 30 cm
// sur des blocs bois 1 × 1 m, au-dessus du métro à 450 kg/m²).
//
// - `calageStacks` : pour chaque appui, les couches posées de la dalle (ou du sol) jusqu'à la Viewbox, de bas en
//   haut — plaques de roulage, madriers de la solution retenue, plaques sous le bloc, bloc bois, cales, vérin / pied,
//   et l'élément de la Viewbox qui porte (rive UNP, traverses du plancher, angle, vérin) — avec leurs épaisseurs et la
//   hauteur totale ; les appuis identiques sont regroupés. Les épaisseurs viennent du calage retenu et du dessin
//   (bloc, vide au-dessus du bloc).
// - `zoneBudget` : poids de la dalle sous une Viewbox poste par poste (Viewbox pesée, objets portés type par type,
//   public, report de charge des combinaisons, blocs, plaques, plaques de roulage) = le poids de la zone.
// Fonctions pures ; mm, N.
import type { CalageResult, SupportCheck } from './calage';
import type { EstimateModule, P2 } from './estimate';
import type { SlabZone } from './slabZones';
import { BLOCK_TOUCH, blockBearing } from './blocks';
import type { SpreadLayer } from './ground';
import { joistLabel } from './ground';
import { fmtNumber } from './units';

const G = 9.81;

export type GroundMode = 'jacks' | 'points' | 'pads' | 'rims';

export interface StackLayer {
  kind: 'roadway' | 'timber' | 'plate' | 'block' | 'packing' | 'jack' | 'foot' | 'joists';
  label: string;
  /** épaisseur (mm) ; null = inconnue (à préciser) */
  thickness: number | null;
  note?: string;
  /** madriers de la solution retenue : coupés (sections côte à côte) ou vus en long dans la coupe */
  section?: 'cut' | 'long';
  /** plaques empilées : nombre de plaques (dessinées une à une dans la coupe) */
  count?: number;
  /** madriers sur chant : nombre, largeur d'un madrier et largeur de la couche (mm), coupés dans la coupe */
  joists?: { n: number; b: number; width: number };
  /** couche d'une cale composée (bloc dessiné décrit couche par couche) : nom de la cale */
  group?: string;
}

export interface CalageStack {
  /** appuis de calage concernés (« B1 », « P4 »…) et leurs types */
  supports: string[];
  types: string[];
  /** couches de bas en haut (dalle / sol → Viewbox) */
  layers: StackLayer[];
  /** élément de la Viewbox qui porte sur la dernière couche */
  top: string;
  /** hauteur de la dalle au dessous de cet élément (mm) : null si une épaisseur est inconnue ; `known` = somme connue */
  height: number | null;
  known: number;
  /** l'élément qui porte est le dessous de la Viewbox (rive, angle, vérin) : `height` = surélévation de la Viewbox */
  underside: boolean;
}

const cm = (mm: number) => `${fmtNumber(mm / 10, mm % 10 ? 1 : 0)} cm`;
const cmFine = (mm: number) => fmtNumber(Math.round(mm) / 10, 1);

/** Élément de la Viewbox qui porte sur l'appui (dessus de la coupe). */
function bearingElement(c: SupportCheck, mode: GroundMode): { label: string; underside: boolean } {
  const g = c.reaction.group;
  if (g.stair) return { label: 'Pied d’escalier (platine 15 × 15 cm)', underside: false };
  if (g.terrace) return { label: 'Pied de terrasse (platine 15 × 15 cm)', underside: false };
  if (g.strip) return g.strip.kind === 'secondary' ? { label: 'Traverses / lisses du plancher de la Viewbox', underside: false } : { label: 'Rive UNP du plancher (semelle 8 cm) — dessous de la Viewbox', underside: true };
  if (mode === 'rims') return { label: 'Rive UNP du plancher — dessous de la Viewbox', underside: true };
  if (g.post && !g.block) return { label: 'Pied de poteau', underside: false };
  if (g.jack) return { label: 'Dessous de la Viewbox (réception du vérin)', underside: true };
  return { label: g.middle ? 'Pied central de la Viewbox' : 'Angle de la Viewbox (pied 21 × 21 cm) — dessous de la Viewbox', underside: true };
}

/**
 * Coupe du calage de chaque appui, de la dalle à la Viewbox. `mode` = pose au sol du calcul ; `roadwayThickness` =
 * épaisseur des plaques de roulage (mm, absente = inconnue). Les appuis aux couches identiques sont regroupés.
 */
export function calageStacks(res: CalageResult, mode: GroundMode, roadwayThickness?: number, roadwayLabel?: string): CalageStack[] {
  const out: CalageStack[] = [];
  for (const t of res.types)
    for (const c of t.checks) {
      const layers: StackLayer[] = [];
      if (res.roadwayOn && !c.reaction.group.stair && !c.reaction.group.terrace)
        layers.push({
          kind: 'roadway',
          label: `Plaques de roulage jointives sur toute l’emprise${roadwayLabel ? ` — ${roadwayLabel}` : ''}${res.roadway.plates > 0 ? ` (${fmtNumber((res.roadway.plates * 1e6) / G, 0)} kg/m²)` : ''}`,
          thickness: roadwayThickness && roadwayThickness > 0 ? roadwayThickness : null,
          ...(roadwayThickness && roadwayThickness > 0 ? {} : { note: 'épaisseur à préciser' }),
        });
      // madriers de la solution retenue (grille sous la rangée, plateau) : posés sur le sol, sous le bloc ou le pied
      for (const l of c.chainBase.timber?.stack ?? []) layers.push({ kind: 'timber', label: l.label, thickness: l.thickness, section: l.section });
      // plaques (et madriers sur chant) : sous le bloc, ou sous le pied (de bas en haut : la dernière couche choisie est en bas)
      for (const l of [...c.layerList].reverse()) layers.push(layerOf(l));
      const top = bearingElement(c, mode);
      if (c.block) {
        const comp = c.block.composition;
        if (comp) {
          // bloc dessiné décrit comme une cale composée : ses couches, de bas en haut
          const [bu, bv] = c.block.size;
          const group = `Cale composée ${fmtNumber(bu / 10, bu % 10 ? 1 : 0)} × ${fmtNumber(bv / 10, bv % 10 ? 1 : 0)} cm (${fmtNumber(c.block.massKg, 0)} kg)`;
          for (const l of [...comp.layers].reverse()) layers.push({ ...layerOf(l), group });
        } else layers.push({ kind: 'block', label: `Bloc bois ${c.block.id} ${c.block.dims}${c.block.massKg ? ` (${fmtNumber(c.block.massKg, 0)} kg)` : ''}`, thickness: c.block.height });
        // vide du dessin au-dessus du bloc, corrigé de la hauteur de la cale composée
        const dh = comp ? comp.height - comp.drawnHeight : 0;
        const adj = (h: number | null): number | null => (h === null ? null : h - dh > 0 ? h - dh : null);
        const adjNote = (n: string) => (comp && Math.abs(dh) > 1 ? `${n}, corrigé de la hauteur de la cale : ${dh > 0 ? '−' : '+'} ${cmFine(Math.abs(dh))} cm` : n);
        const b = c.block.under ? blockBearing({ under: c.block.under }) : null;
        const strip = c.reaction.group.strip;
        if (strip) {
          // UPN / profils posés sur le bloc : ce qu'il y a dans le dessin entre le bloc et eux = cales à prévoir
          const gap = strip.kind === 'secondary' ? (b?.kind === 'frame' ? b.gap : null) : c.block.under?.frame ?? null;
          if (gap !== null && adj(gap) !== null && adj(gap)! > BLOCK_TOUCH)
            layers.push({
              kind: 'packing',
              label: strip.kind === 'secondary' ? 'Cales serrées sous les profils du plancher (à prévoir)' : 'Cales / rehausse sous l’UPN sur toute la largeur du bloc (vérins retirés)',
              thickness: adj(gap),
              note: adjNote(`vide de ${cmFine(gap)} cm dans le dessin`),
            });
        } else if (c.reaction.group.jack) {
          // vérin posé sur le bloc : du dessus du bloc au dessous de la Viewbox (platine + sortie du vérin), d'après le dessin
          const h = adj(b?.kind === 'feet' && Math.abs(b.gap) <= BLOCK_TOUCH ? c.block.under?.frame ?? null : null);
          layers.push({
            kind: 'jack',
            label: `Vérin Viewbox (platine 15 × 15 cm) posé sur ${comp ? 'la cale' : 'le bloc'}`,
            thickness: h,
            ...(h === null ? { note: 'hauteur réglée sur site' } : { note: adjNote(`du dessus ${comp ? 'de la cale' : 'du bloc'} au dessous de la Viewbox, d’après le dessin`) }),
          });
        } else if (b?.kind === 'feet' && (adj(c.block.under?.frame ?? 0) ?? 0) > BLOCK_TOUCH) {
          layers.push({ kind: 'foot', label: `Pied de la Viewbox posé sur ${comp ? 'la cale' : 'le bloc'}`, thickness: adj(c.block.under!.frame), note: adjNote(`du dessus ${comp ? 'de la cale' : 'du bloc'} au dessous de la Viewbox, d’après le dessin`) });
        }
      } else if (c.reaction.group.jack) layers.push({ kind: 'jack', label: 'Vérin Viewbox (platine 15 × 15 cm)', thickness: null, note: 'sortie réglée sur site (≤ 5 cm)' });
      const known = layers.reduce((s, l) => s + (l.thickness ?? 0), 0);
      const height = layers.every((l) => l.thickness !== null) ? known : null;
      // même coupe : mêmes couches (dimensions au cm près, sans le numéro du bloc), même élément porteur
      const keyOf = (ls: StackLayer[], topLabel: string) => JSON.stringify([ls.map((l) => [l.kind, l.label.replace(/ B?L\d+ /, ' ').replace(/,\d/g, ''), l.thickness === null ? null : Math.round(l.thickness / 5)]), topLabel]);
      const key = keyOf(layers, top.label);
      const same = out.find((s) => keyOf(s.layers, s.top) === key);
      if (same) {
        same.supports.push(c.id);
        if (!same.types.includes(t.label)) same.types.push(t.label);
        continue;
      }
      out.push({ supports: [c.id], types: [t.label], layers, top: top.label, height, known, underside: top.underside });
    }
  // libellé d'un bloc regroupé : sans son numéro (« Bloc bois 100 × 100 × 24,4 cm »)
  for (const s of out)
    if (s.supports.length > 1)
      for (const l of s.layers) if (l.kind === 'block') l.label = l.label.replace(/^Bloc bois \S+ /, 'Bloc bois ');
  return out;
}

/** Couche de la coupe pour une couche de calage : n plaques empilées, ou madriers sur chant (un à chaque bord…). */
function layerOf(l: SpreadLayer): StackLayer {
  if (l.joist) {
    const j = l.joist;
    const [length, width] = j.along === 'u' ? [l.l, l.w] : [l.w, l.l];
    const where = l.n === 1 ? 'un au milieu' : l.n === 2 ? 'un à chaque bord' : l.n === 3 ? 'un à chaque bord et un au milieu' : `un à chaque bord, ${l.n - 2} entre les deux`;
    return {
      kind: 'joists',
      label: `${joistLabel(l.n, j.b, j.h)} (répartis sur ${cm(width)} : ${where} ; longueur ${cm(length)} ; ${j.along === 'u' ? 'parallèles au grand côté de la Viewbox' : 'parallèles au petit côté de la Viewbox'})`,
      thickness: j.h,
      note: 'vissés aux plaques en tête et en pied',
      joists: { n: l.n, b: j.b, width },
    };
  }
  return {
    kind: 'plate',
    label: `${l.label || 'Plaque'}${l.n > 1 ? ` — ${l.n} plaques empilées` : ''}${l.material === 'commercial' ? '' : ` (${cm(l.l)} × ${cm(l.w)})`}`,
    thickness: l.material === 'commercial' ? null : l.n * l.t,
    ...(l.material === 'commercial' ? { note: 'épaisseur selon fabricant' } : {}),
    ...(l.n > 1 ? { count: l.n } : {}),
  };
}

/** « Plaques de roulage 2 cm → Bloc bois 100 × 100 × 24,4 cm → Vérin 9,6 cm → Rive UNP » : une coupe en une ligne. */
export function stackLine(s: CalageStack): string {
  const parts = s.layers.map((l) => `${l.label}${l.thickness !== null ? ` [${cmFine(l.thickness)} cm]` : l.note ? ` [${l.note}]` : ''}`);
  return [...parts, s.top].join(' → ');
}

export interface BudgetLine {
  key: 'box' | 'item' | 'public' | 'redistribution' | 'block' | 'plates' | 'spread';
  label: string;
  /** poids (N) ; le report de charge peut être négatif ; nombre d'objets du poste */
  N: number;
  count?: number;
  note?: string;
  /** poids proposé d'après la catégorie, pas confirmé */
  proposed?: true;
}

const centroid = (p: P2[]): P2 => [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length];
function inside(p: P2, poly: P2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Bilan des charges de la dalle sous une Viewbox : Viewbox de la zone (posée au sol et empilées dessus) à leur poids
 * pesé, objets portés type par type, public de la combinaison retenue, report de charge (vent, raideurs, imperfections
 * de la combinaison — ce qui reste des réactions des pieds), puis blocs, plaques et plaques de roulage. La somme est
 * le poids de la zone. `moduleWeight` = poids d'une Viewbox (N) quand le module n'a pas le sien.
 */
export function zoneBudget(z: SlabZone, modules: EstimateModule[], moduleWeight: number, publicNote?: string): BudgetLine[] | null {
  const ground = modules.find((m) => m.id === z.id && m.level === 0);
  if (!ground) return null;
  const mine = modules.filter((m) => m === ground || (m.level > 0 && inside(centroid(m.corners), ground.corners)));
  const lines: BudgetLine[] = [];
  const boxN = mine.reduce((s, m) => s + (m.weight ?? moduleWeight), 0);
  lines.push({ key: 'box', label: mine.length > 1 ? `${mine.length} Viewbox (${mine.map((m) => m.id).join(', ')}), pesées` : `Viewbox ${ground.id}, pesée (structure, plancher, sol, plafond, isolants)`, N: boxN });
  let itemsN = 0;
  for (const m of mine) {
    const items = m.carriedItems ?? [];
    for (const it of items) {
      lines.push({ key: 'item', label: `${it.label}${mine.length > 1 ? ` (${m.id})` : ''}`, count: it.count, N: it.N, ...(it.proposed ? { proposed: true as const, note: 'poids type proposé d’après la catégorie, à confirmer (étape 1)' } : {}) });
      itemsN += it.N;
    }
    const rest = (m.carried ?? 0) - items.reduce((s, it) => s + it.N, 0);
    if (Math.abs(rest) > 1) {
      lines.push({ key: 'item', label: `Objets portés et modifications de l’étude${mine.length > 1 ? ` (${m.id})` : ''}`, N: rest });
      itemsN += rest;
    }
  }
  if (z.publicN > 0) lines.push({ key: 'public', label: 'Public', N: z.publicN, ...(publicNote ? { note: publicNote } : {}) });
  const redistribution = z.parts.feet - boxN - itemsN - z.publicN;
  if (Math.abs(redistribution) > 1)
    lines.push({ key: 'redistribution', label: `Report de charge${z.combo ? ` (combinaison ${z.combo})` : ''}`, N: redistribution, note: 'vent, raideurs, imperfections : reste des réactions des pieds de la combinaison la plus lourde' });
  if (z.parts.block > 0) lines.push({ key: 'block', label: `Blocs de calage bois${z.loose?.length ? ` (dont ${z.loose.join(', ')} sous aucun pied)` : ''}`, N: z.parts.block, note: 'blocs à cheval sur deux Viewbox : moitié chacune' });
  if (z.parts.plates > 0) lines.push({ key: 'plates', label: 'Plaques de calage', N: z.parts.plates });
  if (z.parts.spread > 0) lines.push({ key: 'spread', label: 'Plaques de roulage / madriers (sur la surface de la zone)', N: z.parts.spread });
  return lines;
}
