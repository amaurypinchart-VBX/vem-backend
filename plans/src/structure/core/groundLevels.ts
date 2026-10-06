// Niveaux du sol relevés sous chaque pied (relevé du géomètre ou au laser sur place, en mm, valeurs relatives : le pied
// en bas à gauche à 0, celui en haut à droite à −15…). Un pied sans relevé reste vide. On en tire ce que l'équipe de
// montage doit rattraper : la Viewbox est posée de niveau, le point le plus haut du sol sert de référence (il reçoit
// le calage de base), chaque autre pied doit être rehaussé de (référence − niveau). Avec des vérins, ce rattrapage
// est pris par la sortie de la tige, vérifiée jusqu'à la sortie du calcul (5 cm par défaut) : au-delà, cales en plus.
// Dénivelé et pente maximale entre deux pieds relevés. Fonctions pures ; mm.
import type { P2 } from './estimate';

/** Niveau relevé d'un point d'appui, repéré par sa position en plan (mm, repère du modèle) : robuste aux renumérotations. */
export interface GroundLevel {
  x: number;
  y: number;
  /** niveau du sol (mm, relatif) */
  level: number;
}

/** Distance maximale entre un relevé enregistré et un point d'appui pour les associer (mm). */
export const LEVEL_MATCH_TOLERANCE = 150;

/** Sortie de tige de vérin vérifiée par défaut (mm) : règle Viewbox, ≤ 5 cm. */
export const JACK_MAX_EXTENSION = 50;

/** Niveau relevé au point (le relevé le plus proche à moins de la tolérance), sinon undefined. */
export function levelAt(levels: GroundLevel[] | undefined, p: P2, tol = LEVEL_MATCH_TOLERANCE): number | undefined {
  let best: GroundLevel | undefined;
  let d = tol;
  for (const l of levels ?? []) {
    const e = Math.hypot(l.x - p[0], l.y - p[1]);
    if (e <= d) {
      d = e;
      best = l;
    }
  }
  return best?.level;
}

/** Relevés avec le niveau d'un point modifié (undefined = effacé). */
export function withLevel(levels: GroundLevel[] | undefined, p: P2, level: number | undefined, tol = LEVEL_MATCH_TOLERANCE): GroundLevel[] {
  const rest = (levels ?? []).filter((l) => Math.hypot(l.x - p[0], l.y - p[1]) > tol);
  if (level === undefined || !Number.isFinite(level)) return rest;
  return [...rest, { x: Math.round(p[0]), y: Math.round(p[1]), level: Math.round(level) + 0 }];
}

/** Saisie « −15 », « -15 », « +12,5 », « 0 » → mm ; vide → undefined ; texte invalide → NaN. */
export function parseLevel(text: string): number | undefined {
  const t = text.trim().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(',', '.').replace(/mm$/i, '');
  if (!t) return undefined;
  return /^[+-]?\d+(\.\d+)?$/.test(t) ? Math.round(Number(t)) + 0 : NaN;
}

/** « ±0 », « +12 », « −15 » (signe typographique). */
export function formatLevel(level: number): string {
  if (level === 0) return '±0';
  return level > 0 ? `+${level}` : `−${Math.abs(level)}`;
}

export interface LevelPoint {
  id: string;
  position: P2;
  /** pied à vérin : le rattrapage est pris par la sortie de tige */
  jack?: boolean;
}

export interface LevelRow {
  id: string;
  position: P2;
  level?: number;
  /** rehausse à apporter sous ce pied pour poser la Viewbox de niveau (mm) */
  makeUp?: number;
  /** vérin : sortie de tige en plus de la position de base (mm) et cales à ajouter au-delà de la sortie vérifiée */
  jackOut?: number;
  shims?: number;
}

export interface LevelSurvey {
  rows: LevelRow[];
  known: number;
  /** niveau du point le plus haut (référence) et du plus bas */
  ref?: number;
  low?: number;
  refIds: string[];
  /** dénivelé total (mm) */
  spread?: number;
  /** pente la plus forte entre deux pieds relevés (%), avec ces deux pieds */
  slope?: { pct: number; a: string; b: string };
  /** sortie de tige vérifiée (mm) */
  jackMax: number;
  /** pieds dont le rattrapage dépasse la sortie vérifiée (vérins) */
  overJack: string[];
  /** rattrapage le plus grand (mm) */
  maxMakeUp?: number;
  notes: string[];
}

/**
 * Relevé des niveaux → rattrapage par pied. `jackMax` = sortie de tige vérifiée par le calcul (vérins). Les pentes ne
 * sont calculées qu'entre pieds distants d'au moins 0,5 m (deux vérins voisins sous une même plaque n'en disent rien).
 */
export function levelSurvey(points: LevelPoint[], levels: GroundLevel[] | undefined, jackMax = JACK_MAX_EXTENSION): LevelSurvey {
  const rows: LevelRow[] = points.map((p) => ({ id: p.id, position: p.position, level: levelAt(levels, p.position) }));
  const known = rows.filter((r) => r.level !== undefined);
  const out: LevelSurvey = { rows, known: known.length, refIds: [], jackMax, overJack: [], notes: [] };
  if (!known.length) return out;
  const ref = Math.max(...known.map((r) => r.level!));
  const low = Math.min(...known.map((r) => r.level!));
  out.ref = ref;
  out.low = low;
  out.spread = ref - low;
  out.refIds = known.filter((r) => r.level === ref).map((r) => r.id);
  const jackOf = new Map(points.map((p) => [p.id, !!p.jack]));
  for (const r of known) {
    r.makeUp = ref - r.level!;
    if (jackOf.get(r.id)) {
      r.jackOut = Math.min(r.makeUp, jackMax);
      r.shims = Math.max(0, r.makeUp - jackMax);
      if (r.shims > 0) out.overJack.push(r.id);
    }
  }
  out.maxMakeUp = Math.max(...known.map((r) => r.makeUp!));
  for (let i = 0; i < known.length; i++)
    for (let j = i + 1; j < known.length; j++) {
      const a = known[i];
      const b = known[j];
      const d = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1]);
      if (d < 500) continue;
      const pct = (Math.abs(a.level! - b.level!) / d) * 100;
      if (!out.slope || pct > out.slope.pct) out.slope = { pct, a: a.id, b: b.id };
    }
  if (known.length < rows.length) out.notes.push(`${rows.length - known.length} pied(s) sans relevé : rattrapage à mesurer sur place.`);
  if (out.overJack.length) out.notes.push(`Rattrapage supérieur à la sortie de vérin vérifiée (${jackMax} mm) sous ${out.overJack.join(', ')} : cales en plus sous la platine.`);
  if (out.slope && out.slope.pct > 2) out.notes.push(`Pente du sol de ${out.slope.pct.toFixed(1).replace('.', ',')} % entre ${out.slope.a} et ${out.slope.b} : calage à empiler soigneusement (pyramide, plaques vissées), vérifier le glissement des cales.`);
  return out;
}
