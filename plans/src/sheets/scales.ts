// Échelles normalisées et placement d'une vue dans un cadre (fonctions pures).
export const STANDARD_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 150, 200, 250, 500, 1000];

/** Plus petite échelle normalisée (dessin le plus grand) qui fait tenir l'encombrement dans le cadre, marge comprise. */
export function fitScale(boundsMm: { minX: number; minY: number; maxX: number; maxY: number }, rect: { w: number; h: number }, marginMm = 4): number {
  const w = Math.max(1e-6, boundsMm.maxX - boundsMm.minX);
  const h = Math.max(1e-6, boundsMm.maxY - boundsMm.minY);
  const aw = Math.max(1, rect.w - 2 * marginMm);
  const ah = Math.max(1, rect.h - 2 * marginMm);
  const needed = Math.max(w / aw, h / ah);
  return STANDARD_SCALES.find((s) => s >= needed - 1e-9) ?? Math.ceil(needed);
}

export function scaleLabel(scale: number): string {
  return `1:${scale}`;
}

/** Transformation mm modèle (repère du dessin) → mm papier pour une fenêtre de vue. */
export function viewportTransform(rect: { x: number; y: number; w: number; h: number }, scale: number, center: [number, number]) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    toPaper: (x: number, y: number) => ({ x: cx + (x - center[0]) / scale, y: cy - (y - center[1]) / scale }),
    toModel: (px: number, py: number): [number, number] => [center[0] + (px - cx) * scale, center[1] - (py - cy) * scale],
  };
}
