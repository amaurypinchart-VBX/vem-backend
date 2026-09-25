// Unités et contrôle de dimensions des modules (fonctions pures, testées).

export interface ColladaAsset {
  unitMeter: number;
  unitName: string;
  upAxis: 'X_UP' | 'Y_UP' | 'Z_UP';
}

/** Lit <asset><unit meter=".." name=".."/> et <up_axis> directement dans le texte du .dae. */
export function parseColladaAsset(text: string): ColladaAsset {
  const head = text.slice(0, 20000); // <asset> est toujours en tête de fichier
  const unitTag = head.match(/<unit\b[^>]*>/i)?.[0] ?? '';
  const meter = parseFloat(unitTag.match(/meter\s*=\s*"([^"]+)"/i)?.[1] ?? '');
  const name = unitTag.match(/name\s*=\s*"([^"]+)"/i)?.[1] ?? '';
  const up = head.match(/<up_axis>\s*([XYZ]_UP)\s*<\/up_axis>/i)?.[1]?.toUpperCase();
  return {
    unitMeter: Number.isFinite(meter) && meter > 0 ? meter : 1,
    unitName: name || (Number.isFinite(meter) && meter > 0 ? '' : 'meter'),
    upAxis: up === 'Z_UP' || up === 'X_UP' ? up : 'Y_UP',
  };
}

export interface DimsCheck {
  ok: boolean;
  long: number;
  short: number;
  deltaLong: number;
  deltaShort: number;
}

/** Compare les dimensions en plan d'un module (orientation quelconque) à une taille de référence. */
export function checkPlanDims(a: number, b: number, ref: { long: number; short: number }, toleranceMm: number): DimsCheck {
  const long = Math.max(a, b);
  const short = Math.min(a, b);
  const deltaLong = long - ref.long;
  const deltaShort = short - ref.short;
  return {
    ok: Math.abs(deltaLong) <= toleranceMm && Math.abs(deltaShort) <= toleranceMm,
    long,
    short,
    deltaLong,
    deltaShort,
  };
}

/** Taille standard la plus proche des dimensions mesurées (et si elle est dans la tolérance). */
export function nearestSize<T extends { long: number; short: number }>(
  a: number,
  b: number,
  sizes: T[],
  toleranceMm: number,
): { size: T; check: DimsCheck } {
  let best: { size: T; check: DimsCheck } | null = null;
  for (const size of sizes) {
    const check = checkPlanDims(a, b, size, toleranceMm);
    const err = Math.abs(check.deltaLong) + Math.abs(check.deltaShort);
    if (!best || err < Math.abs(best.check.deltaLong) + Math.abs(best.check.deltaShort)) best = { size, check };
  }
  return best!;
}

export const SUSPECT_FACTORS: Array<{ factor: number; label: string }> = [
  { factor: 25.4, label: '×25,4 (le modèle semble lu en pouces au lieu de mm)' },
  { factor: 1 / 25.4, label: '÷25,4 (pouces appliqués deux fois ?)' },
  { factor: 304.8, label: '×304,8 (le modèle semble lu en pieds)' },
  { factor: 0.0254, label: '×0,0254 (valeurs en pouces lues comme des mètres)' },
  { factor: 1000, label: '×1000 (le modèle semble lu en mètres au lieu de mm)' },
  { factor: 0.001, label: '÷1000 (mètres appliqués deux fois ?)' },
  { factor: 10, label: '×10 (le modèle semble lu en cm au lieu de mm)' },
  { factor: 0.1, label: '÷10' },
];

/**
 * Si des dimensions mesurées ne collent pas à la référence mais y collent après correction par un
 * facteur classique d'unités, retourne ce facteur (ex. 25,4 → le fichier est en pouces non convertis).
 */
export function suspectScaleFactor(
  long: number,
  short: number,
  refs: Array<{ long: number; short: number }>,
  relTolerance = 0.02,
): { factor: number; label: string } | null {
  if (!(long > 0 && short > 0)) return null;
  for (const s of SUSPECT_FACTORS) {
    const l = long * s.factor;
    const w = short * s.factor;
    if (refs.some((ref) => Math.abs(l - ref.long) / ref.long <= relTolerance && Math.abs(w - ref.short) / ref.short <= relTolerance)) {
      return s;
    }
  }
  return null;
}

/** Regroupe des altitudes (min Y des modules) en niveaux, tolérance 200 mm par défaut. */
export function groupLevels(minYs: number[], toleranceMm = 200): number[] {
  const order = minYs.map((y, i) => ({ y, i })).sort((p, q) => p.y - q.y);
  const levelOf = new Array<number>(minYs.length).fill(0);
  let level = -1;
  let anchor = -Infinity;
  for (const { y, i } of order) {
    if (y - anchor > toleranceMm) {
      level++;
      anchor = y;
    }
    levelOf[i] = level;
  }
  return levelOf;
}

export function levelLabel(level: number): string {
  if (level === 0) return 'Ground Floor';
  if (level === 1) return 'First Floor';
  if (level === 2) return 'Second Floor';
  if (level === 3) return 'Third Floor';
  return `Level ${level}`;
}
