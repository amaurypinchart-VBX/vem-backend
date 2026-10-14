// Références de hauteur d'une Viewbox (coupes horizontales « sous la toiture − 200 mm ») et références en plan
// (coupes verticales au milieu / sur un côté), mesurées sur la géométrie du modèle. Pure : seulement l'index (boîtes
// des nœuds, Y vers le haut, donc exactes en hauteur même pour une Viewbox tournée) et le repère de la Viewbox.
import type { SceneIndex } from '../types';
import type { SceneLookup } from '../subset';
import type { ModuleFrame } from '../views';
import type { TagResolver } from './tags';
import type { LevelRef } from './types';

export interface HeightRef {
  /** hauteur monde (Y, mm) */
  y: number;
  /** hauteur depuis l'origine de la Viewbox (mm) : valeur montrée à l'écran */
  local: number;
  source: 'measured' | 'type';
}

export type ModuleRefs = Record<LevelRef, HeightRef>;

export const LEVEL_REF_LABELS: Record<LevelRef, string> = {
  ground: 'sol (dessous des pieds)',
  'floor-bottom': 'dessous du plancher',
  'floor-top': 'dessus du plancher',
  ceiling: 'dessous du plafond tendu',
  'roof-bottom': 'sous la toiture',
  'roof-top': 'dessus de la toiture',
};

/**
 * Valeurs du type quand la mesure échoue (Viewbox 5900 standard, mesurées sur le modèle Qatar : plancher 238 mm,
 * toiture 2 750 → 3 080 mm) : épaisseur du plancher et de la toiture depuis le bas / le haut de la Viewbox.
 */
export const TYPE_FALLBACK = { floor: 238, roof: 330 };

/** Toutes les références d'une Viewbox. */
export function moduleRefs(index: SceneIndex, look: SceneLookup, tags: TagResolver, frame: ModuleFrame): ModuleRefs {
  const mod = index.modules.find((m) => m.id === frame.moduleId);
  const oy = frame.origin[1];
  const roots = new Set(mod ? [mod.nodeId, ...mod.itemIds] : []);
  let floorMin = Infinity;
  let floorMax = -Infinity;
  let roofMin = Infinity;
  let roofMax = -Infinity;
  let feetMin = Infinity;
  let ceilMin = Infinity;
  const tagged = (id: string, tag: string) => {
    for (let c: string | null | undefined = id; c; c = look.byId.get(c)?.parentId) {
      if (tags.ownTag(c)?.tag === tag) return true;
      if (look.byId.get(c)?.role === 'module') break;
    }
    return false;
  };
  for (const n of index.nodes) {
    if (n.kind !== 'mesh' || !n.bboxMm || n.triangles === 0 || !look.inSet(n.id, roots)) continue;
    const y0 = n.bboxMm[1];
    const y1 = n.bboxMm[4];
    const cat = look.categoryOf(n.id);
    if (cat === 'PLANCHER') {
      floorMin = Math.min(floorMin, y0);
      floorMax = Math.max(floorMax, y1);
    } else if (cat === 'TOIT' && !tagged(n.id, 'logo')) {
      roofMin = Math.min(roofMin, y0);
      roofMax = Math.max(roofMax, y1);
    } else if (cat === 'PIED' || tagged(n.id, 'pied') || tagged(n.id, 'calage')) feetMin = Math.min(feetMin, y0);
    if (tagged(n.id, 'plafond-tendu')) ceilMin = Math.min(ceilMin, y0);
  }
  const bottom = oy + frame.min[2];
  const top = oy + frame.max[2];
  const ref = (y: number, fallback: number): HeightRef => (Number.isFinite(y) ? { y, local: y - oy, source: 'measured' } : { y: fallback, local: fallback - oy, source: 'type' });
  const floorBottom = ref(floorMin, bottom);
  const floorTop = ref(floorMax, bottom + TYPE_FALLBACK.floor);
  const roofTop = ref(roofMax, top);
  const roofBottom = ref(roofMin, top - TYPE_FALLBACK.roof);
  return {
    ground: Number.isFinite(feetMin) ? ref(feetMin, bottom) : { ...floorBottom },
    'floor-bottom': floorBottom,
    'floor-top': floorTop,
    // sans plafond tendu : le dessous de la toiture
    ceiling: Number.isFinite(ceilMin) ? ref(ceilMin, roofBottom.y) : { ...roofBottom, source: roofBottom.source },
    'roof-bottom': roofBottom,
    'roof-top': roofTop,
  };
}

/** Texte d'écran : « sous la toiture = 2 750 mm (mesuré) ». */
export function describeRef(ref: LevelRef, h: HeightRef): string {
  const v = Math.round(h.local).toLocaleString('fr-FR').replace(/ | /g, ' ');
  return `${LEVEL_REF_LABELS[ref]} = ${v} mm (${h.source === 'measured' ? 'mesuré' : 'valeur du type'})`;
}
