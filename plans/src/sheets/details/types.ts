// Détail type : dessin fixe et vectoriel (coupe de profil, plancher…), en mm réels, placé à l'échelle voulue.
export interface DetailShape {
  id: string;
  title: string;
  /** emprise en mm réels */
  width: number;
  height: number;
  /** tracés, épaisseur de trait en mm papier (indépendante de l'échelle) */
  strokes: Array<{ widthMm: number; d: string }>;
  /** triangles pleins (flèches de cote) */
  fill: string;
  /** textes (cotes) : position de la ligne de base, taille en mm réels, -90 = écrit de bas en haut */
  texts: Array<{ x: number; y: number; size: number; rotate: 0 | -90; text: string }>;
}
