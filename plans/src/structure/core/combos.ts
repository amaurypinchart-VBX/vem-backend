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

export function buildCombinations(o: ComboOptions = COMBO_DEFAULTS): Combination[] {
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

/** Direction (non unitaire) du défaut d'aplomb d'une combinaison : sx · x + sy · y. */
export function swayVector(axes: Axes, sway: readonly [number, number]): Vec3 {
  return [axes.x[0] * sway[0] + axes.y[0] * sway[1], 0, axes.x[2] * sway[0] + axes.y[2] * sway[1]];
}

export const swayKey = (s: readonly [number, number]) => `${s[0] > 0 ? '+' : '−'}${s[1] > 0 ? '+' : '−'}`;
