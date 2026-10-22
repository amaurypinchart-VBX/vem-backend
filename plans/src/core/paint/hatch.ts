// Hachures d'une zone peinte (choix d'A. Pinchart 21.10.2026 : « hachure partout ») : traits parallèles inclinés,
// coupés au contour (extérieur + trous, règle pair-impair), alignés sur l'origine du dessin pour que deux zones
// voisines se raccordent. Segments explicites : même rendu à l'écran, au PDF et au DXF (pas d'entité HATCH).

/**
 * Segments [x0, y0, x1, y1] des hachures de `loops` (mm du dessin), espacés de `spacing` (mm), à `angleDeg` du
 * premier axe du dessin.
 */
export function hatchSegments(loops: Float64Array[], spacing: number, angleDeg = 45): Float64Array[] {
  if (!(spacing > 0) || !loops.length) return [];
  const a = (angleDeg * Math.PI) / 180;
  // repère tourné : u le long des traits, v perpendiculaire
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const vx = -uy;
  const vy = ux;
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const l of loops)
    for (let i = 0; i < l.length; i += 2) {
      const v = l[i] * vx + l[i + 1] * vy;
      vMin = Math.min(vMin, v);
      vMax = Math.max(vMax, v);
    }
  const out: Float64Array[] = [];
  const first = Math.ceil(vMin / spacing);
  const last = Math.floor(vMax / spacing);
  if (last - first > 20000) return out;
  for (let k = first; k <= last; k++) {
    const v = k * spacing;
    // intersections de la droite v = cte avec les arêtes, en abscisse u
    const us: number[] = [];
    for (const l of loops) {
      const n = l.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x0 = l[i * 2];
        const y0 = l[i * 2 + 1];
        const x1 = l[j * 2];
        const y1 = l[j * 2 + 1];
        const v0 = x0 * vx + y0 * vy;
        const v1 = x1 * vx + y1 * vy;
        // demi-ouvert : un sommet sur la droite ne compte qu'une fois
        if (v0 > v === v1 > v) continue;
        const t = (v - v0) / (v1 - v0);
        us.push((x0 + t * (x1 - x0)) * ux + (y0 + t * (y1 - y0)) * uy);
      }
    }
    us.sort((p, q) => p - q);
    for (let i = 0; i + 1 < us.length; i += 2) {
      if (us[i + 1] - us[i] < 1e-6) continue;
      out.push(Float64Array.of(us[i] * ux + v * vx, us[i] * uy + v * vy, us[i + 1] * ux + v * vx, us[i + 1] * uy + v * vy));
    }
  }
  return out;
}
