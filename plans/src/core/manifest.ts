// manifest.json exporté par l'extension SketchUp viewbox_prep (repère SketchUp : Z vers le haut, mm).
// Le .dae perd les balises (tags) SketchUp : le manifest est la source de vérité pour les catégories.
import type { BBox, Category } from './types';
import { CATEGORIES } from './types';
import { normalizeName } from './classification';

export interface ManifestBBox {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ManifestEntry {
  name: string;
  category?: string | null;
  tag?: string;
  definition?: string;
  articleRef?: string | null;
  materials?: string[];
  bboxWorld?: ManifestBBox;
}

export interface ManifestModule {
  id: string;
  definition?: string;
  tag?: string;
  level?: number;
  transform?: number[];
  bboxWorld?: ManifestBBox;
  accessories?: ManifestEntry[];
}

export interface Manifest {
  schema: string;
  source?: { file?: string; sketchupVersion?: string; exportedAt?: string };
  units?: string;
  upAxis?: string;
  modules: ManifestModule[];
  common?: ManifestEntry[];
  context?: ManifestEntry[];
}

export function parseManifest(text: string): Manifest {
  const data = JSON.parse(text) as Partial<Manifest>;
  if (!data || typeof data !== 'object' || !String(data.schema ?? '').startsWith('viewbox-manifest/')) {
    throw new Error('manifest.json invalide (champ "schema" viewbox-manifest/… absent)');
  }
  if (data.units && data.units !== 'mm') throw new Error(`manifest.json : unités "${data.units}" non gérées (attendu "mm")`);
  return { ...data, modules: Array.isArray(data.modules) ? data.modules : [] } as Manifest;
}

export function asCategory(value: string | null | undefined): Category | null {
  if (!value) return null;
  const v = normalizeName(value);
  return (CATEGORIES as readonly string[]).includes(v) ? (v as Category) : null;
}

/** Boîte SketchUp (Z-up) → boîte interne (Y-up) : (x, y, z) → (x, z, -y). */
export function manifestBBoxToYUp(b: ManifestBBox): BBox {
  return [b.min[0], b.min[2], 0 - b.max[1], b.max[0], b.max[2], 0 - b.min[1]];
}

export function bboxClose(a: BBox, b: BBox, toleranceMm: number): boolean {
  for (let i = 0; i < 6; i++) if (Math.abs(a[i] - b[i]) > toleranceMm) return false;
  return true;
}

/** Recherche rapide de nœuds par boîte englobante (tolérance en mm), via des cases de 1 mm sur minX. */
export class BBoxLookup<T> {
  private buckets = new Map<number, Array<{ box: BBox; value: T }>>();
  constructor(private toleranceMm: number) {}
  add(box: BBox, value: T): void {
    const k = Math.round(box[0]);
    let list = this.buckets.get(k);
    if (!list) this.buckets.set(k, (list = []));
    list.push({ box, value });
  }
  find(box: BBox): T | null {
    const k = Math.round(box[0]);
    const span = Math.ceil(this.toleranceMm);
    for (let d = -span; d <= span; d++) {
      for (const e of this.buckets.get(k + d) ?? []) if (bboxClose(e.box, box, this.toleranceMm)) return e.value;
    }
    return null;
  }
}
