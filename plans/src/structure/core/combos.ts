// Combinaisons (§7.5), reprises des modèles SCIA des notes statico (« nichtlineare LF-Kombinationen ») :
//   CO1 = 1,35 ΣG ;
//   par direction d : en service COd1 = 1,10 ΣG + 1,35 Q1.d, COd2 = 1,10 ΣG + 1,35 W1.d, COd3 = les deux ;
//                     hors service COd01…COd03 idem avec Q2.d / W2.d ;
//   stabilité COBd = 1,0 (G1 + Gc + G5 + GB lest) + 0,5 (G2 + G3 + G4) + 0 · G7 + 1,2 (W2.d + W0) ;
//   ELS (réactions caractéristiques pour le sol, si la conversion Rd / 1,35 n'est pas retenue).
// Défaut d'aplomb φ appliqué à la géométrie dans les deux axes à la fois, comme statico (dx, dy = ±5 mm/m) : le sens
// suit la direction de la combinaison, l'autre axe reste positif. Fonctions pures.
import type { Vec3 } from './fem/types';
import type { Axes, Direction } from './loads';
import { DIRECTION_LABEL, DIRECTIONS } from './loads';
import { FR_FACTORS } from './codeFR';

export type ComboClass = 'ULS' | 'STAB' | 'SLS';

export interface Combination {
  id: string;
  label: string;
  cls: ComboClass;
  factors: Array<readonly [string, number]>;
  /** signes du défaut d'aplomb selon les axes x, y de l'installation */
  sway: readonly [1 | -1, 1 | -1];
  direction?: Direction;
  service?: 'in' | 'out';
}

export interface ComboOptions {
  gammaG: number;
  gammaGQ: number;
  gammaQ: number;
  gammaW: number;
  stability: { gammaG: number; finishes: number; logo: number; gammaW: number };
  /** combinaisons ELS caractéristiques (réactions pour le sol) */
  sls: boolean;
  /** neige sur les toitures (cas S) : combinaisons avec la neige seule, ou accompagnant le vent ou la foule (ψ0 = 0,5) */
  snow?: boolean;
  psi0Snow?: number;
  /** référentiel France (NF EN 1990/NA, arrêté du 25 juillet 2022) : autres combinaisons, voir `buildCombinationsFR` */
  code?: 'FR';
  /** France : équilibre aussi vérifié sous le vent de service (quand il dépasse le vent hors service) */
  stabInService?: boolean;
}

export const COMBO_DEFAULTS: ComboOptions = {
  gammaG: 1.35,
  gammaGQ: 1.1,
  gammaQ: 1.35,
  gammaW: 1.35,
  stability: { gammaG: 1.0, finishes: 0.5, logo: 0, gammaW: 1.2 },
  sls: true,
};

/** Cas permanents : poids propre et complément, finitions (plafonds, murs, sols), garde-corps, marches d'escalier, logos. */
const G_ALL = ['G1', 'Gc', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'GB'];
// lest (GB) : poids connu, compté comme le poids propre dans la stabilité
const G_SELF = ['G1', 'Gc', 'G5', 'GB'];
// marches et platelage d'escalier (G6) : comme les finitions
const G_FINISH = ['G2', 'G3', 'G4', 'G6'];

const swayOf = (d: Direction): readonly [1 | -1, 1 | -1] => (d === 2 ? [-1, 1] : d === 4 ? [1, -1] : [1, 1]);

/** Référentiel France : coefficients de NF EN 1990/NA (STR 1,35 / 1,5, EQU 0,9 / 1,5). */
export const COMBO_FR: ComboOptions = {
  gammaG: FR_FACTORS.gammaGsup,
  gammaGQ: FR_FACTORS.gammaGsup,
  gammaQ: FR_FACTORS.gammaQ,
  gammaW: FR_FACTORS.gammaQ,
  stability: { gammaG: FR_FACTORS.equGinf, finishes: FR_FACTORS.equGinf, logo: 0, gammaW: FR_FACTORS.equQ },
  sls: true,
  code: 'FR',
};

export function buildCombinations(o: ComboOptions = COMBO_DEFAULTS): Combination[] {
  if (o.code === 'FR') return buildCombinationsFR(o);
  const out: Combination[] = [];
  const G = (f: number) => G_ALL.map((g) => [g, f] as const);
  out.push({ id: 'CO1', label: `${o.gammaG} ΣG`, cls: 'ULS', factors: G(o.gammaG), sway: [1, 1] });
  for (const d of DIRECTIONS)
    for (const [service, q, w, suffix] of [
      ['in', 'Q1', 'W1', ''],
      ['out', 'Q2', 'W2', '0'],
    ] as const) {
      const svc = service === 'in' ? 'en service' : 'hors service';
      const base = { cls: 'ULS' as const, sway: swayOf(d), direction: d, service };
      out.push({ ...base, id: `CO${d}${suffix}1`, label: `${o.gammaGQ} ΣG + ${o.gammaQ} ${q}.${d} (${svc}, ${DIRECTION_LABEL[d]})`, factors: [...G(o.gammaGQ), [`${q}.${d}`, o.gammaQ]] });
      out.push({ ...base, id: `CO${d}${suffix}2`, label: `${o.gammaGQ} ΣG + ${o.gammaW} ${w}.${d} (${svc}, ${DIRECTION_LABEL[d]})`, factors: [...G(o.gammaGQ), [`${w}.${d}`, o.gammaW]] });
      out.push({
        ...base,
        id: `CO${d}${suffix}3`,
        label: `${o.gammaGQ} ΣG + ${o.gammaQ} ${q}.${d} + ${o.gammaW} ${w}.${d} (${svc}, ${DIRECTION_LABEL[d]})`,
        factors: [...G(o.gammaGQ), [`${q}.${d}`, o.gammaQ], [`${w}.${d}`, o.gammaW]],
      });
    }
  const s = o.stability;
  for (const d of DIRECTIONS)
    out.push({
      id: `COB${d}`,
      label: `stabilité ${DIRECTION_LABEL[d]} : ${s.gammaG} G + ${s.finishes} finitions + ${s.gammaW} (W2.${d} + W0)`,
      cls: 'STAB',
      sway: swayOf(d),
      direction: d,
      service: 'out',
      factors: [...G_SELF.map((g) => [g, s.gammaG] as const), ...G_FINISH.map((g) => [g, s.finishes] as const), ['G7', s.logo], [`W2.${d}`, s.gammaW], ['W0', s.gammaW]],
    });
  if (o.snow) {
    const psi = o.psi0Snow ?? 0.5;
    const ps = Math.round(psi * o.gammaQ * 1000) / 1000;
    out.push({ id: 'COS', label: `${o.gammaGQ} ΣG + ${o.gammaQ} S (neige)`, cls: 'ULS', factors: [...G(o.gammaGQ), ['S', o.gammaQ]], sway: [1, 1] });
    for (const d of DIRECTIONS) {
      const base = { cls: 'ULS' as const, sway: swayOf(d), direction: d };
      out.push({ ...base, service: 'out', id: `CO${d}04`, label: `${o.gammaGQ} ΣG + ${o.gammaW} W2.${d} + ${ps} S (hors service, neige, ${DIRECTION_LABEL[d]})`, factors: [...G(o.gammaGQ), [`W2.${d}`, o.gammaW], ['S', ps]] });
      out.push({ ...base, service: 'in', id: `CO${d}05`, label: `${o.gammaGQ} ΣG + ${o.gammaQ} Q1.${d} + ${ps} S (en service, neige, ${DIRECTION_LABEL[d]})`, factors: [...G(o.gammaGQ), [`Q1.${d}`, o.gammaQ], ['S', ps]] });
    }
  }
  if (o.sls) {
    out.push({ id: 'ELS0', label: 'ΣG (caractéristique)', cls: 'SLS', factors: G(1), sway: [1, 1] });
    for (const d of DIRECTIONS) {
      out.push({ id: `ELS${d}1`, label: `ΣG + Q1.${d} + W1.${d}`, cls: 'SLS', sway: swayOf(d), direction: d, service: 'in', factors: [...G(1), [`Q1.${d}`, 1], [`W1.${d}`, 1]] });
      out.push({ id: `ELS${d}2`, label: `ΣG + Q2.${d} + W2.${d}`, cls: 'SLS', sway: swayOf(d), direction: d, service: 'out', factors: [...G(1), [`Q2.${d}`, 1], [`W2.${d}`, 1]] });
      out.push({ id: `ELS${d}3`, label: `ΣG + W2.${d} + W0`, cls: 'SLS', sway: swayOf(d), direction: d, service: 'out', factors: [...G(1), [`W2.${d}`, 1], ['W0', 1]] });
      if (o.snow) out.push({ id: `ELS${d}4`, label: `ΣG + Q1.${d} + S`, cls: 'SLS', sway: swayOf(d), direction: d, service: 'in', factors: [...G(1), [`Q1.${d}`, 1], ['S', 1]] });
    }
    if (o.snow) out.push({ id: 'ELSS', label: 'ΣG + S (neige)', cls: 'SLS', factors: [...G(1), ['S', 1]], sway: [1, 1] });
  }
  return out;
}

/** Arrondi d'un produit de coefficients (1,5 · 0,6 = 0,9 ; 1,5 · 0,7 = 1,05). */
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Combinaisons du référentiel France (NF EN 1990/NA, bâtiments ; arrêté du 25 juillet 2022) :
 *   CO1 = 1,35 ΣG ;
 *   en service (public présent, vent de service W1) par direction d : COd1 = 1,35 ΣG + 1,5 Q1.d ; COd2 = 1,35 ΣG + 1,5 W1.d ;
 *     COd3 = 1,35 ΣG + 1,5 Q1.d + 1,5 · 0,6 W1.d ; COd4 = 1,35 ΣG + 1,5 · 0,7 Q1.d + 1,5 W1.d ;
 *   hors service (structure évacuée, vent W2 de NF EN 1991-1-4) : COd01 = 1,35 ΣG + 1,5 W2.d ;
 *     COd02 = 1,0 ΣG + 1,5 (W2.d + W0) (soulèvement) ;
 *   équilibre statique (EQU) COBd = 0,9 ΣG (logos 0) + 1,5 (W2.d + W0) ; sous le vent de service aussi si demandé ;
 *   neige : COS = 1,35 ΣG + 1,5 S ; COd04 = 1,35 ΣG + 1,5 W2.d + 0,75 S ; COd05 = 1,35 ΣG + 1,5 Q1.d + 0,75 S ;
 *     COd06 = 1,35 ΣG + 1,5 S + 0,9 W2.d ;
 *   caractéristiques (sol) : ΣG ; ΣG + Q1.d + 0,6 W1.d ; ΣG + 0,7 Q1.d + W1.d ; ΣG + W2.d + W0 ; avec la neige
 *     ΣG + Q1.d + 0,5 S ; ΣG + W2.d + 0,5 S ; ΣG + S.
 * Hors service, le public est évacué : pas d'exploitation (Q2) dans ces combinaisons.
 */
export function buildCombinationsFR(o: ComboOptions = COMBO_FR): Combination[] {
  const out: Combination[] = [];
  const F = FR_FACTORS;
  const G = (f: number) => G_ALL.map((g) => [g, f] as const);
  const gG = o.gammaGQ;
  const gQ = o.gammaQ;
  const gW = o.gammaW;
  const qW = r3(gQ * F.psi0Wind);
  const qQ = r3(gQ * F.psi0Live);
  const qS = r3(gQ * (o.psi0Snow ?? F.psi0Snow));
  out.push({ id: 'CO1', label: `${o.gammaG} ΣG`, cls: 'ULS', factors: G(o.gammaG), sway: [1, 1] });
  for (const d of DIRECTIONS) {
    const inn = { cls: 'ULS' as const, sway: swayOf(d), direction: d, service: 'in' as const };
    const dl = DIRECTION_LABEL[d];
    out.push({ ...inn, id: `CO${d}1`, label: `${gG} ΣG + ${gQ} Q1.${d} (en service, ${dl})`, factors: [...G(gG), [`Q1.${d}`, gQ]] });
    out.push({ ...inn, id: `CO${d}2`, label: `${gG} ΣG + ${gW} W1.${d} (en service, ${dl})`, factors: [...G(gG), [`W1.${d}`, gW]] });
    out.push({ ...inn, id: `CO${d}3`, label: `${gG} ΣG + ${gQ} Q1.${d} + ${qW} W1.${d} (en service, ${dl})`, factors: [...G(gG), [`Q1.${d}`, gQ], [`W1.${d}`, qW]] });
    out.push({ ...inn, id: `CO${d}4`, label: `${gG} ΣG + ${qQ} Q1.${d} + ${gW} W1.${d} (en service, ${dl})`, factors: [...G(gG), [`Q1.${d}`, qQ], [`W1.${d}`, gW]] });
    const off = { cls: 'ULS' as const, sway: swayOf(d), direction: d, service: 'out' as const };
    out.push({ ...off, id: `CO${d}01`, label: `${gG} ΣG + ${gW} W2.${d} (hors service, ${dl})`, factors: [...G(gG), [`W2.${d}`, gW]] });
    out.push({ ...off, id: `CO${d}02`, label: `${F.gammaGinf} ΣG + ${gW} (W2.${d} + W0) (hors service, soulèvement, ${dl})`, factors: [...G(F.gammaGinf), [`W2.${d}`, gW], ['W0', gW]] });
  }
  const s = o.stability;
  const stabG = [...G_SELF.map((g) => [g, s.gammaG] as const), ...G_FINISH.map((g) => [g, s.finishes] as const), ['G7', s.logo] as const];
  for (const d of DIRECTIONS) {
    out.push({ id: `COB${d}`, label: `équilibre ${DIRECTION_LABEL[d]} : ${s.gammaG} ΣG + ${s.gammaW} (W2.${d} + W0)`, cls: 'STAB', sway: swayOf(d), direction: d, service: 'out', factors: [...stabG, [`W2.${d}`, s.gammaW], ['W0', s.gammaW]] });
    if (o.stabInService) out.push({ id: `COB${d}1`, label: `équilibre en service ${DIRECTION_LABEL[d]} : ${s.gammaG} ΣG + ${s.gammaW} W1.${d}`, cls: 'STAB', sway: swayOf(d), direction: d, service: 'in', factors: [...stabG, [`W1.${d}`, s.gammaW]] });
  }
  if (o.snow) {
    out.push({ id: 'COS', label: `${gG} ΣG + ${gQ} S (neige)`, cls: 'ULS', factors: [...G(gG), ['S', gQ]], sway: [1, 1] });
    for (const d of DIRECTIONS) {
      const base = { cls: 'ULS' as const, sway: swayOf(d), direction: d };
      const dl = DIRECTION_LABEL[d];
      out.push({ ...base, service: 'out', id: `CO${d}04`, label: `${gG} ΣG + ${gW} W2.${d} + ${qS} S (hors service, neige, ${dl})`, factors: [...G(gG), [`W2.${d}`, gW], ['S', qS]] });
      out.push({ ...base, service: 'in', id: `CO${d}05`, label: `${gG} ΣG + ${gQ} Q1.${d} + ${qS} S (en service, neige, ${dl})`, factors: [...G(gG), [`Q1.${d}`, gQ], ['S', qS]] });
      out.push({ ...base, service: 'out', id: `CO${d}06`, label: `${gG} ΣG + ${gQ} S + ${qW} W2.${d} (hors service, neige, ${dl})`, factors: [...G(gG), ['S', gQ], [`W2.${d}`, qW]] });
    }
  }
  if (o.sls) {
    const pW = F.psi0Wind;
    const pQ = F.psi0Live;
    const pS = o.psi0Snow ?? F.psi0Snow;
    out.push({ id: 'ELS0', label: 'ΣG (caractéristique)', cls: 'SLS', factors: G(1), sway: [1, 1] });
    for (const d of DIRECTIONS) {
      const base = { cls: 'SLS' as const, sway: swayOf(d), direction: d };
      out.push({ ...base, service: 'in', id: `ELS${d}1`, label: `ΣG + Q1.${d} + ${pW} W1.${d}`, factors: [...G(1), [`Q1.${d}`, 1], [`W1.${d}`, pW]] });
      out.push({ ...base, service: 'in', id: `ELS${d}2`, label: `ΣG + ${pQ} Q1.${d} + W1.${d}`, factors: [...G(1), [`Q1.${d}`, pQ], [`W1.${d}`, 1]] });
      out.push({ ...base, service: 'out', id: `ELS${d}3`, label: `ΣG + W2.${d} + W0`, factors: [...G(1), [`W2.${d}`, 1], ['W0', 1]] });
      if (o.snow) {
        out.push({ ...base, service: 'in', id: `ELS${d}4`, label: `ΣG + Q1.${d} + ${pS} S`, factors: [...G(1), [`Q1.${d}`, 1], ['S', pS]] });
        out.push({ ...base, service: 'out', id: `ELS${d}5`, label: `ΣG + W2.${d} + ${pS} S`, factors: [...G(1), [`W2.${d}`, 1], ['S', pS]] });
      }
    }
    if (o.snow) out.push({ id: 'ELSS', label: 'ΣG + S (neige)', cls: 'SLS', factors: [...G(1), ['S', 1]], sway: [1, 1] });
  }
  return out;
}

/** Direction (non unitaire) du défaut d'aplomb d'une combinaison : sx · x + sy · y. */
export function swayVector(axes: Axes, sway: readonly [number, number]): Vec3 {
  return [axes.x[0] * sway[0] + axes.y[0] * sway[1], 0, axes.x[2] * sway[0] + axes.y[2] * sway[1]];
}

export const swayKey = (s: readonly [number, number]) => `${s[0] > 0 ? '+' : '−'}${s[1] > 0 ? '+' : '−'}`;
