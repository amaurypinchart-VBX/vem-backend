// Hachures des pièces coupées en segments explicites (pas de <pattern> SVG : svg2pdf et le DXF les rendent mal).
// Pure. Lignes à `angleDeg`, espacées de `spacing` (mm modèle), calées sur l'origine du dessin : les hachures de
// deux pièces voisines se prolongent. Découpe pair-impair dans les contours (les trous restent vides).

/** Segments [x0, y0, x1, y1] d'une hachure dans des contours fermés (règle pair-impair). */
export function hatchRings(rings: Float64Array[], angleDeg: number, spacing: number): Float64Array[] {
  if (!(spacing > 0) || !rings.length) return [];
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // repère tourné : les hachures deviennent horizontales (v = constante)
  const edges: Array<[number, number, number, number]> = [];
  let vMin = Infinity;
  let vMax = -Infinity;
  for (const r of rings) {
    const n = r.length / 2;
    if (n < 3) continue;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const u0 = r[2 * i] * c + r[2 * i + 1] * s;
      const v0 = -r[2 * i] * s + r[2 * i + 1] * c;
      const u1 = r[2 * j] * c + r[2 * j + 1] * s;
      const v1 = -r[2 * j] * s + r[2 * j + 1] * c;
      if (v0 === v1) continue;
      edges.push([u0, v0, u1, v1]);
      vMin = Math.min(vMin, v0, v1);
      vMax = Math.max(vMax, v0, v1);
    }
  }
  const out: Float64Array[] = [];
  if (!edges.length) return out;
  const xs: number[] = [];
  for (let k = Math.ceil(vMin / spacing); k * spacing <= vMax; k++) {
    const v = k * spacing;
    xs.length = 0;
    for (const [u0, v0, u1, v1] of edges) {
      // demi-ouvert : un sommet sur la ligne compte une fois
      if ((v0 <= v && v < v1) || (v1 <= v && v < v0)) xs.push(u0 + ((v - v0) / (v1 - v0)) * (u1 - u0));
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const ua = xs[i];
      const ub = xs[i + 1];
      if (ub - ua < 1e-6) continue;
      out.push(Float64Array.from([ua * c - v * s, ua * s + v * c, ub * c - v * s, ub * s + v * c]));
    }
  }
  return out;
}

/** Aire signée d'un contour (positive = sens trigonométrique). */
export function ringArea(r: ArrayLike<number>): number {
  const n = r.length / 2;
  let a = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    a += r[2 * i] * r[2 * j + 1] - r[2 * j] * r[2 * i + 1];
  }
  return a / 2;
}

/** Point dans un contour (pair-impair). */
export function pointInRing(x: number, y: number, r: ArrayLike<number>): boolean {
  const n = r.length / 2;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[2 * i];
    const yi = r[2 * i + 1];
    const xj = r[2 * j];
    const yj = r[2 * j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
